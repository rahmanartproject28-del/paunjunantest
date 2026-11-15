import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, AdminService, Social, seededRng, DEFAULT_AUTO, validateAuto, autoDay, type AutoConfig } from './index';

/** Server mini dengan pengaturan otomatis yang bisa diubah dan jam yang bisa dimajukan. */
function setup(cfg: Partial<AutoConfig> = {}, seed = 11) {
  let t = 1_800_000_000; const store = new MemoryStore();
  let auto: AutoConfig = { ...DEFAULT_AUTO, minLv: 1, ...cfg };
  const A = new Authority({ store, rng: seededRng(seed), now: () => t, weather: () => 'hujan', auto: () => auto });
  return { A, store, adv: (s: number) => { t += s; }, set: (c: Partial<AutoConfig>) => { auto = { ...auto, ...c }; }, now: () => t };
}
/** Satu siklus otomatis: lempar → sentak tepat waktu → tunggu adu tarik minimal → land(auto). */
async function cycle(A: Authority, adv: (s: number) => void) {
  for (let i = 0; i < 60; i++) {
    adv(20);
    const c = await A.cast('p', { spot: 'B3', zone: 'far', sub: 'keramba' });
    if (c.biteIn === null) continue;
    adv(c.biteIn); const h = await A.hook('p', { castId: c.castId });
    if (h.result !== 'hooked') continue;
    adv(h.minFight + 0.5);
    return { h, r: await A.land('p', { hookId: h.hookId, result: 'caught', auto: true }) };
  }
  throw new Error('tidak ada sambaran');
}
async function mkPlayer(store: MemoryStore, A: Authority, extra: Record<string, unknown> = {}) {
  const p = A.newPlayer('p', 'Otomat'); p.bait = { udang: 999 }; p.xp = 500; Object.assign(p, extra); await store.savePlayer(p); return p;
}

describe('mancing otomatis', () => {
  it('peluang berhasil diatur admin per ukuran: 100% selalu dapat, 0% selalu lepas', async () => {
    const s1 = setup({ rate: [1, 1, 1, 1], minGap: 0 }); await mkPlayer(s1.store, s1.A);
    for (let i = 0; i < 5; i++) { const { r } = await cycle(s1.A, s1.adv); expect(r.result).toBe('caught'); expect((r as { catch: { auto?: boolean } }).catch.auto).toBe(true); }
    const s0 = setup({ rate: [0, 0, 0, 0], minGap: 0 }); await mkPlayer(s0.store, s0.A);
    for (let i = 0; i < 5; i++) expect((await cycle(s0.A, s0.adv)).r.result).toBe('lost');
    // ikan lepas kembali ke stok spot
    const before = Object.values((await s0.store.getStock('B3'))!).reduce((a, b) => a + (b ?? 0), 0);
    await cycle(s0.A, s0.adv);
    expect(Object.values((await s0.store.getStock('B3'))!).reduce((a, b) => a + (b ?? 0), 0)).toBe(before);
  });
  it('peluang 50%: hasil mendekati 50% (300 percobaan)', async () => {
    const { A, store, adv } = setup({ rate: [0.5, 0.5, 0.5, 0.5], minGap: 0, maxPerDay: 0 }, 5); await mkPlayer(store, A, { bigBasket: true });
    let ok = 0; const N = 300;
    for (let i = 0; i < N; i++) { const { r } = await cycle(A, adv); if (r.result === 'caught') ok++; const p = (await store.getPlayer('p'))!; p.basket = []; await store.savePlayer(p); if (i % 20 === 0) await store.initStock('B3', { nila: 200, mas: 200, patin: 50 }); }
    expect(ok / N).toBeGreaterThan(0.4); expect(ok / N).toBeLessThan(0.6);
  });
  it('pengali hadiah: nilai & XP otomatis = gainMul × manual; tidak masuk papan peringkat bila board=false', async () => {
    const a = setup({ rate: [1, 1, 1, 1], minGap: 0, gainMul: 0.5, board: false }, 3); await mkPlayer(a.store, a.A);
    const { h, r } = await cycle(a.A, a.adv) as { h: { weight: number }; r: { catch: { value: number; weight: number }; xp: number } };
    const m = setup({}, 3); await mkPlayer(m.store, m.A);
    const manual = await m.A.award('p', { id: 'x', k: (r.catch as unknown as { species: 'nila' }).species, weight: r.catch.weight, tier: (r.catch as unknown as { tier: number }).tier, t: 0.5, spot: 'B3' });
    expect(r.catch.value).toBe(Math.max(1, Math.round(manual.catch.value * 0.5)));
    expect(r.xp).toBe(Math.max(1, Math.round(manual.xp * 0.5)));
    void h;
    expect((await a.store.leaderboard('heaviest', 0, 10)).length).toBe(0);
    a.set({ board: true }); await cycle(a.A, a.adv);
    expect((await a.store.leaderboard('heaviest', 0, 10)).length).toBe(1);
  });
  it('batas harian, jeda minimal, level minimal, dan fitur mati', async () => {
    const { A, store, adv, set, now } = setup({ rate: [1, 1, 1, 1], maxPerDay: 2, minGap: 0 }); await mkPlayer(store, A);
    await cycle(A, adv); await cycle(A, adv);
    expect((await A.autoInfo('p')).allowed).toBe(false);
    await expect(cycle(A, adv)).rejects.toThrow(/Batas mancing otomatis/);
    adv(86400); expect((await A.autoInfo('p')).left).toBe(2); expect(autoDay(now())).not.toBe(autoDay(now() - 86400));
    set({ minGap: 600 }); await cycle(A, adv);
    await expect(cycle(A, adv)).rejects.toThrow(/tunggu/);
    set({ minGap: 0, minLv: 50 }); await expect(cycle(A, adv)).rejects.toThrow(/level 50/);
    set({ minLv: 1, on: false }); await expect(cycle(A, adv)).rejects.toThrow(/dimatikan/);
  });
  it('keranjang penuh + full=jual: ikan langsung dijual; manual tetap tidak terpengaruh', async () => {
    const { A, store, adv } = setup({ rate: [1, 1, 1, 1], minGap: 0, full: 'jual' }); 
    const fill = Array.from({ length: 10 }, (_, i) => ({ id: 'f' + i, species: 'nila' as const, name: 'Nila', weight: 1, length: 27, tier: 0, stars: 1, spot: 'B3', at: 0, value: 10 }));
    await mkPlayer(store, A, { basket: fill, coins: 0 });
    const { r } = await cycle(A, adv) as { r: { sold: boolean; kept: boolean; catch: { value: number }; player: { coins: number; basket: unknown[] } } };
    expect(r.kept).toBe(false); expect(r.sold).toBe(true);
    expect(r.player.coins).toBe(r.catch.value); expect(r.player.basket.length).toBe(10);
  });
  it('admin: validasi & simpan pengaturan; misi/turnamen bisa dikecualikan', async () => {
    expect(() => validateAuto({ rate: [1, 2, 0, 0] })).toThrow(/Peluang sedang/);
    expect(() => validateAuto({ rate: [1, 1] })).toThrow(/4 angka/);
    expect(() => validateAuto({ full: 'buang' })).toThrow(/stop atau jual/);
    const store = new MemoryStore(), adm = new AdminService(store);
    await adm.setConfig({ auto: { rate: [0.8, 0.6, 0.4, 0.2], maxPerDay: 50 } as AutoConfig }, 'owner');
    expect(adm.effAuto().rate).toEqual([0.8, 0.6, 0.4, 0.2]); expect(adm.effAuto().maxPerDay).toBe(50); expect(adm.effAuto().gainMul).toBe(DEFAULT_AUTO.gainMul);
    expect((await adm.auditLog())[0].act).toBe('konfigurasi');
    const adm2 = new AdminService(store); await adm2.load(); expect(adm2.effAuto().maxPerDay).toBe(50);
    // tangkapan otomatis dengan missions:false tidak mengubah misi
    const A = new Authority({ store, rng: seededRng(1), weather: () => 'cerah' }), S = new Social({ store });
    const p = A.newPlayer('q', 'Q'); await store.savePlayer(p);
    const c = { id: 'c1', species: 'nila' as const, name: 'Nila', weight: 1, length: 27, tier: 0, stars: 1, spot: 'B3', at: Date.now() / 1000, value: 10, auto: true };
    await S.onCatch('q', 'Q', c, { missions: false, tours: false });
    expect(JSON.stringify((await store.getPlayer('q'))!.missions ?? null)).toBe(JSON.stringify(p.missions ?? null));
  });
});

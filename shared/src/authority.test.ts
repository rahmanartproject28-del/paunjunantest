import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, seededRng, spotRates, DEFAULT_SPOTS, SPECIES, levelInfo, cleanChat, pickSize, basketCap, BASKET_BIG_PRICE, applyOffline } from './index';

function setup(seed = 1) {
  let t = 1000;
  const store = new MemoryStore();
  const A = new Authority({ store, rng: seededRng(seed), now: () => t, weather: () => 'cerah' });
  return { A, store, adv: (s: number) => { t += s; }, now: () => t };
}

describe('aturan', () => {
  it('peluang mengikuti stok, zona, dan umpan', () => {
    const st = DEFAULT_SPOTS[1].stock;
    const near = spotRates(st, 'near', 'dekat', 'cerah', 'udang');
    expect(near.rates.every(([k]) => SPECIES[k].zones.includes('near'))).toBe(true);
    const pelet = spotRates(st, 'far', 'jauh', 'cerah', 'pelet'), anakan = spotRates(st, 'far', 'jauh', 'cerah', 'anakan');
    const toman = (r: typeof pelet) => r.rates.find(([k]) => k === 'toman')?.[1] ?? 0;
    expect(toman(anakan)).toBeGreaterThan(toman(pelet) * 10);
    expect(spotRates(st, 'far', 'jauh', 'hujan', 'udang').total).toBeCloseTo(spotRates(st, 'far', 'jauh', 'cerah', 'udang').total * 1.4);
  });
  it('berat selalu di rentang jenis', () => {
    const r = seededRng(9);
    for (let i = 0; i < 2000; i++) { const s = pickSize('toman', r); expect(s.weight).toBeGreaterThanOrEqual(2.5); expect(s.weight).toBeLessThanOrEqual(16); }
  });
  it('level', () => { expect(levelInfo(0).lv).toBe(1); expect(levelInfo(50).lv).toBe(2); expect(levelInfo(199).lv).toBe(2); expect(levelInfo(200).lv).toBe(3); });
  it('obrolan disaring', () => {
    expect(cleanChat('lihat www.situs.com ya')).toContain('[tautan dihapus]');
    expect(cleanChat('hubungi 0812 3456 7890')).toContain('[nomor dihapus]');
    expect(cleanChat('dasar goblok')).not.toContain('goblok');
  });
});

describe('otoritas memancing', () => {
  it('alur lengkap: lempar → sentak → adu tarik → dapat', async () => {
    const { A, store, adv } = setup(3);
    await store.savePlayer(A.newPlayer('p1', 'Andi'));
    let got = null as any;
    for (let i = 0; i < 20 && !got; i++) {
      adv(5);
      const c = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
      if (c.biteIn === null) continue;
      adv(c.biteIn);
      const h = await A.hook('p1', { castId: c.castId });
      expect(h.result).toBe('hooked');
      if (h.result !== 'hooked') continue;
      adv(h.minFight + 1);
      got = await A.land('p1', { hookId: h.hookId, result: 'caught' });
    }
    expect(got.result).toBe('caught');
    expect(got.player.basket.length).toBe(1);
    expect(got.player.xp).toBeGreaterThan(0);
    expect(got.player.bait.udang).toBe(19);
    const lb = await store.leaderboard('heaviest', 0, 10);
    expect(lb[0].name).toBe('Andi');
  });

  it('menyentak terlalu cepat membuat ikan kabur, terlalu lambat umpan dimakan', async () => {
    const { A, store, adv } = setup(5);
    await store.savePlayer(A.newPlayer('p1', 'Budi'));
    const c1 = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
    expect(c1.biteIn).not.toBeNull();
    adv(0.2);
    expect((await A.hook('p1', { castId: c1.castId })).result).toBe('spooked');
    adv(2);
    const c2 = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
    adv(c2.biteIn! + 5);
    expect((await A.hook('p1', { castId: c2.castId })).result).toBe('eaten');
  });

  it('menolak tangkapan terlalu cepat dan mengembalikan stok', async () => {
    const { A, store, adv } = setup(7);
    await store.savePlayer(A.newPlayer('p1', 'Cici'));
    const c = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
    adv(c.biteIn!);
    const h = await A.hook('p1', { castId: c.castId });
    if (h.result !== 'hooked') throw new Error('harus kena');
    const before = (await store.getStock('B3'))![h.species];
    adv(0.5);
    await expect(A.land('p1', { hookId: h.hookId, result: 'caught' })).rejects.toThrow('terlalu cepat');
    expect((await store.getStock('B3'))![h.species]).toBe(before + 1);
  });

  it('pembatas laju lemparan & umpan habis', async () => {
    const { A, store, adv } = setup(8);
    const p = A.newPlayer('p1', 'Dodi'); p.bait = { udang: 0 }; await store.savePlayer(p);
    await expect(A.cast('p1', { spot: 'A1', zone: 'near', sub: 'dekat' })).rejects.toThrow('Umpan habis');
    p.bait = { udang: 5 }; await store.savePlayer(p);
    await A.cast('p1', { spot: 'A1', zone: 'near', sub: 'dekat' });
    await expect(A.cast('p1', { spot: 'A1', zone: 'near', sub: 'dekat' })).rejects.toThrow('terlalu cepat');
    adv(2);
    await A.cast('p1', { spot: 'A1', zone: 'near', sub: 'dekat' });
  });

  it('jual keranjang menambah koin', async () => {
    const { A, store, adv } = setup(11);
    await store.savePlayer(A.newPlayer('p1', 'Eka'));
    for (let i = 0; i < 30; i++) {
      adv(5);
      const c = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
      if (c.biteIn === null) continue;
      adv(c.biteIn);
      const h = await A.hook('p1', { castId: c.castId });
      if (h.result !== 'hooked') continue;
      adv(h.minFight + 0.5);
      await A.land('p1', { hookId: h.hookId, result: 'caught' });
      break;
    }
    const r = await A.sellBasket('p1');
    expect(r.sold).toBe(1);
    expect(r.player.coins).toBe(300 + r.coins);
  });
});

describe('keranjang besar', () => {
  /** tangkap satu ikan sampai berhasil (lempar → sentak → dapat) */
  async function catchOne(A: Authority, adv: (s: number) => void) {
    for (let i = 0; i < 40; i++) {
      adv(25);
      const c = await A.cast('p1', { spot: 'B3', zone: 'far', sub: 'keramba' });
      if (c.biteIn === null) continue;
      adv(c.biteIn); const h = await A.hook('p1', { castId: c.castId }); if (h.result !== 'hooked') continue;
      adv(h.minFight + 1); return A.land('p1', { hookId: h.hookId, result: 'caught' });
    }
    throw new Error('tidak dapat ikan');
  }
  it('beli 500 koin sekali; kapasitas 10 → 20; ikan ke-11 masuk keranjang', async () => {
    const { A, store, adv } = setup(7);
    const p = A.newPlayer('p1', 'Cici'); p.coins = 499; p.bait = { udang: 200 }; await store.savePlayer(p);
    expect(basketCap(p)).toBe(10);
    await expect(A.buyBigBasket('p1')).rejects.toThrow(/Koin tidak cukup/);
    const q = (await store.getPlayer('p1'))!; q.coins = 600; await store.savePlayer(q);
    const r = await A.buyBigBasket('p1');
    expect(r.player.coins).toBe(600 - BASKET_BIG_PRICE); expect(r.player.bigBasket).toBe(true); expect(basketCap(r.player)).toBe(20);
    await expect(A.buyBigBasket('p1')).rejects.toThrow(/sudah dimiliki/);
    // isi 10 ikan, lalu ikan ke-11 tetap disimpan (dulu ditolak "keranjang penuh")
    const z = (await store.getPlayer('p1'))!; z.basket = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, species: 'nila', name: 'Nila', weight: 1, length: 27, tier: 0, stars: 1, spot: 'B3', at: 0, value: 10 })); await store.savePlayer(z);
    const got = await catchOne(A, adv);
    expect(got.result).toBe('caught'); expect((got as { kept?: boolean }).kept).not.toBe(false);
    expect(got.player.basket.length).toBe(11);
  });
  it('tanpa keranjang besar: ikan ke-11 tidak masuk; main luring juga ikut kapasitas', async () => {
    const { A, store, adv } = setup(7);
    const p = A.newPlayer('p1', 'Dodi'); p.bait = { udang: 200 };
    p.basket = Array.from({ length: 10 }, (_, i) => ({ id: 'x' + i, species: 'nila', name: 'Nila', weight: 1, length: 27, tier: 0, stars: 1, spot: 'B3', at: 0, value: 10 }));
    await store.savePlayer(p);
    const got = await catchOne(A, adv);
    expect(got.player.basket.length).toBe(10);
    const big = { ...structuredClone(got.player), bigBasket: true };
    const r = applyOffline(big, { catches: [{ id: 'o1', species: 'nila', weight: 1, at: 990, spot: 'B3' }], baitUsed: { udang: 1 }, released: [] }, 1000, basketCap(big));
    expect(r.accepted.length).toBe(1); expect(big.basket.length).toBe(11);
  });
});

describe('lokasi', () => {
  it('spot lokasi baru terkunci level; ikan laut punya tarikan & adu tarik minimal yang masuk akal', async () => {
    const { MemoryStore, Authority, fightStrength, minFightSeconds, DEFAULT_SPOTS, SPECIES } = await import('./index');
    const st = new MemoryStore(); const A = new Authority({ store: st, rng: Math.random }); await A.ensureStock();
    const p = A.newPlayer('p', 'P'); await st.savePlayer(p);
    await expect(A.cast('p', { spot: 'L1', zone: 'far', sub: 'jauh' })).rejects.toThrow(/level 15/);
    const free = new Authority({ store: st, rng: Math.random, ignoreLevelLock: true });
    const c = await free.cast('p', { spot: 'L1', zone: 'far', sub: 'jauh' }); expect(c.castId).toBeTruthy();
    expect(fightStrength('toman', 16, 1, 3)).toBeCloseTo(SPECIES.toman.str * 1.3 * 1.98 + 0.18, 3); // air tawar tidak berubah
    expect(fightStrength('marlin', 180, 1, 3)).toBeLessThan(10);
    expect(minFightSeconds(180)).toBeLessThan(70);
    for (const s of DEFAULT_SPOTS) for (const k of Object.keys(s.stock)) expect(SPECIES[k as keyof typeof SPECIES]).toBeDefined();
  });
});

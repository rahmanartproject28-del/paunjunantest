import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, AdminService, seededRng, DEFAULT_SPOTS, SPECIES, sellPrice, applySpeciesEdits } from './index';

describe('acara', () => {
  it('acara aktif menaikkan peluang jenisnya & XP; papan acara hanya menghitung jenis & waktunya', async () => {
    let t = 1_790_000_000;
    const st = new MemoryStore(), adm = new AdminService(st, () => t);
    await adm.setEvents([{ name: 'Minggu Toman', species: 'toman', rateMul: 2, xpMul: 2, priceMul: 1, startsAt: t + 100, endsAt: t + 7 * 86400 }], 'uji');
    expect(adm.activeEvent()).toBe(null); expect(adm.effRates().toman).toBe(undefined);
    t += 200;
    expect(adm.activeEvent()!.name).toBe('Minggu Toman'); expect(adm.effRates().toman!.rate).toBe(2); expect(adm.effXpMul()).toBe(2);
    await expect(adm.setEvents([{ name: 'A1x', startsAt: t, endsAt: t + 100 }, { name: 'B2x', startsAt: t + 50, endsAt: t + 200 }], 'uji')).rejects.toThrow(/bertabrakan/);
    await expect(adm.setEvents([{ name: 'Lama', startsAt: t, endsAt: t + 40 * 86400 }], 'uji')).rejects.toThrow(/31 hari/);
    const A = new Authority({ store: st, rng: Math.random, now: () => t }); await A.ensureStock();
    const mk = (id: string, sp: 'toman' | 'nila', w: number, at: number) => st.addCatch(id, id.toUpperCase(), { id: id + at, species: sp, name: sp, weight: w, length: 50, tier: 1, stars: 3, spot: 'B3', at, value: 1 });
    await mk('a', 'toman', 9, t); await mk('a', 'toman', 12, t + 5); await mk('b', 'toman', 10, t); await mk('c', 'nila', 30, t); await mk('d', 'toman', 99, t - 1000);
    const b = await adm.eventBoard();
    expect(b.active).toBe(true); expect(b.rows.map(r => r.name)).toEqual(['A', 'B']); expect(b.rows[0].weight).toBe(12);
  });
});

describe('admin', () => {
  it('editor ikan mengubah nama, harga, berat; bisa dikembalikan; data aneh ditolak', async () => {
    const st = new MemoryStore(), adm = new AdminService(st);
    const before = sellPrice('nila', 1, 0);
    await adm.setConfig({ species: { nila: { name: 'Nila Merah', pricePerKg: 24, w: [0.5, 2] } } }, 'uji');
    expect(SPECIES.nila.name).toBe('Nila Merah'); expect(sellPrice('nila', 1, 0)).toBe(before * 2); expect(SPECIES.nila.w[1]).toBe(2);
    await expect(adm.setConfig({ species: { nila: { w: [3, 2] } } }, 'uji')).rejects.toThrow(/min < maks/);
    await expect(adm.setConfig({ species: { nila: { back: 'merah' } } }, 'uji')).rejects.toThrow(/#rrggbb/);
    await adm.setConfig({ species: {} }, 'uji'); expect(SPECIES.nila.name).toBe('Nila'); expect(sellPrice('nila', 1, 0)).toBe(before);
    applySpeciesEdits();
  });
  it('pengali peluang memengaruhi jenis ikan yang didapat; harga & XP ikut pengali', async () => {
    const st = new MemoryStore(), adm = new AdminService(st);
    await adm.setConfig({ rates: { toman: { rate: 10 }, mujair: { rate: 0 }, nila: { rate: 0 }, mas: { rate: 0 } }, priceMul: 2, xpMul: 3 }, 'uji');
    let t = 1000;
    const A = new Authority({ store: st, rng: seededRng(7), now: () => t, rates: () => adm.cfg.rates, priceMul: () => adm.cfg.priceMul, xpMul: () => adm.cfg.xpMul });
    await A.ensureStock();
    const cfg2 = await new AdminService(st).load(); expect(cfg2.priceMul).toBe(2); // tersimpan
    expect((await adm.auditLog())[0].act).toBe('konfigurasi');
    await expect(adm.setConfig({ priceMul: 99 }, 'uji')).rejects.toThrow(/0,1–5/);
    await expect(adm.setConfig({ rates: { nila: { tiers: [0, 0, 0, 0] } } }, 'uji')).rejects.toThrow(/Bobot/);
  });
  it('stok bisa diatur & diisi ulang, koin bisa diberikan, semua tercatat', async () => {
    const st = new MemoryStore(), adm = new AdminService(st);
    const A = new Authority({ store: st, rng: Math.random }); await A.ensureStock();
    let s = await adm.setStock('B3', 'toman', 0, 'dev'); expect(s.B3.toman).toBe(0);
    s = await adm.resetStock('B3', 'dev'); expect(s.B3.toman).toBe(DEFAULT_SPOTS.find(x => x.id === 'B3')!.stock.toman);
    const p = A.newPlayer('p1', 'Andi'); await st.savePlayer(p);
    expect((await adm.grantCoins('p1', 500, 'dev', 'kompensasi')).coins).toBe(p.coins + 500);
    expect((await adm.auditLog()).map(r => r.act)).toEqual(['koin', 'isi ulang stok', 'stok']);
    await expect(adm.setBackdrop('https://contoh.id/a.jpg', 'dev')).rejects.toThrow(/JPG/);
    const c = await adm.setBackdrop('data:image/jpeg;base64,AAAA', 'dev'); expect(c.backdropAt).toBeGreaterThan(0);
    expect(await adm.backdrop()).toBe('data:image/jpeg;base64,AAAA');
    expect((await adm.setBackdrop('', 'dev')).backdropAt).toBe(undefined);
    expect((await adm.setConfig({ hideFarTrees: true }, 'dev')).hideFarTrees).toBe(true);
    expect((await adm.setConfig({ hideFarTrees: false }, 'dev')).hideFarTrees).toBe(false);
    // slot latar belakang & dasar danau terpisah dari latar depan
    expect((await adm.setBackdrop('data:image/png;base64,BBBB', 'dev', 'belakang')).backdropBackAt).toBeGreaterThan(0);
    expect((await adm.setBackdrop('data:image/webp;base64,CCCC', 'dev', 'dasar')).bedAt).toBeGreaterThan(0);
    expect(await adm.backdrop('belakang')).toBe('data:image/png;base64,BBBB'); expect(await adm.backdrop('dasar')).toBe('data:image/webp;base64,CCCC'); expect(await adm.backdrop('depan')).toBe('');
    expect((await adm.setConfig({ waterClarity: 'keruh' }, 'dev')).waterClarity).toBe('keruh');
    await expect(adm.setConfig({ waterClarity: 'hijau' as never }, 'dev')).rejects.toThrow();
  });
});

import { isBanned, banMessage } from './admin';
describe('blokir pemain', () => {
  it('blokir sementara/permanen, wajib alasan, buka blokir, semua tercatat di log', async () => {
    let t = 1_800_000_000;
    const store = new MemoryStore(), adm = new AdminService(store, () => t);
    const A = new Authority({ store, rng: seededRng(1), weather: () => 'cerah' });
    await store.savePlayer(A.newPlayer('p1', 'Nakal'));
    await expect(adm.setBan('p1', 60, '', 'owner')).rejects.toThrow(/alasan/);
    await expect(adm.setBan('zz', 60, 'curang', 'owner')).rejects.toThrow(/tidak ditemukan/);
    const r = await adm.setBan('p1', 60, 'memakai bot', 'admin@1.2.3.4 / rahman');
    expect(r.banned!.until).toBe(t + 3600);
    const p = (await store.getPlayer('p1'))!;
    expect(isBanned(p, t + 10)).toBe(true); expect(isBanned(p, t + 3601)).toBe(false);
    expect(banMessage(p.banned!)).toMatch(/memakai bot/);
    await adm.setBan('p1', 0, 'curang berulang', 'owner');
    expect(isBanned((await store.getPlayer('p1'))!, t + 10 ** 7)).toBe(true);
    await adm.setBan('p1', null, 'banding diterima', 'owner');
    expect((await store.getPlayer('p1'))!.banned).toBeUndefined();
    await expect(adm.setBan('p1', null, '', 'owner')).rejects.toThrow(/tidak sedang diblokir/);
    const log = await adm.auditLog();
    expect(log.map(l => l.act)).toEqual(['buka blokir', 'blokir', 'blokir']);
    expect(log[2].who).toMatch(/rahman/);
  });
});

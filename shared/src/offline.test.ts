import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, seededRng, applyOffline, sizeOf, OFFLINE, BASKET_SIZE } from './index';

async function setup() {
  let t = 100000; const store = new MemoryStore();
  const A = new Authority({ store, rng: seededRng(3), now: () => t, weather: () => 'cerah' });
  const p = A.newPlayer('u1', 'Uji'); p.bait = { cacing: 10 }; await store.savePlayer(p);
  return { A, store, now: () => t, adv: (s: number) => { t += s; } };
}
const c = (i: number, at: number, weight = 1, species = 'nila') => ({ id: 'c' + i, species: species as 'nila', weight, at, spot: 'D1' });

describe('main luring', () => {
  it('tangkapan sah diterima: XP & nilai 50%, umpan dipotong', async () => {
    const { A, store, now } = await setup();
    const r = await A.syncOffline('u1', { catches: [c(1, now() - 100), c(2, now() - 60)], baitUsed: { cacing: 3 } });
    expect(r.accepted.length).toBe(2); expect(r.rejected).toBe(0);
    expect(r.player.basket.length).toBe(2); expect(r.player.bait.cacing).toBe(7);
    expect(r.player.xp).toBe(r.xp); expect(r.xp).toBeGreaterThan(0);
    expect(store.catches.length).toBe(0); // tidak masuk papan peringkat
    expect(OFFLINE.gainMul).toBe(0.5);
  });
  it('berat palsu, jenis palsu, terlalu rapat, dan waktu masa depan ditolak', async () => {
    const { A, now } = await setup();
    const r = await A.syncOffline('u1', { catches: [c(1, now() - 500, 99), c(2, now() - 400, 1, 'naga'), c(3, now() - 300), c(4, now() - 295), c(5, now() + 9999)], baitUsed: { cacing: 9 } });
    expect(r.accepted.length).toBe(1); expect(r.rejected).toBe(4);
  });
  it('tidak bisa melebihi umpan yang dimiliki', async () => {
    const { A, now } = await setup();
    const list = Array.from({ length: 30 }, (_, i) => c(i, now() - 3000 + i * 30));
    const r = await A.syncOffline('u1', { catches: list, baitUsed: { cacing: 500 } });
    expect(r.accepted.length).toBe(10); expect(r.player.bait.cacing).toBe(0);
  });
  it('kiriman yang sama tidak dihitung dua kali', async () => {
    const { A, now } = await setup();
    const b = { sid: 's1', catches: [c(1, now() - 100)], baitUsed: { cacing: 1 } };
    expect((await A.syncOffline('u1', b)).accepted.length).toBe(1);
    const r2 = await A.syncOffline('u1', b); expect(r2.accepted.length).toBe(0); expect(r2.player.bait.cacing).toBe(9);
  });
  it('keranjang penuh: dijual otomatis; ikan dilepas saat luring ikut hilang', async () => {
    const { A, store, now } = await setup();
    const p = (await store.getPlayer('u1'))!; p.bait.cacing = 100;
    p.basket = Array.from({ length: BASKET_SIZE }, (_, i) => ({ id: 'b' + i, species: 'nila' as const, name: 'Nila', weight: 1, length: 30, tier: 1, stars: 3, spot: 'D1', at: 1, value: 5 }));
    await store.savePlayer(p);
    const coins = p.coins;
    const r = applyOffline(p, { catches: [c(1, now() - 100), c(2, now() - 50)], baitUsed: { cacing: 2 }, released: ['b0'] }, now(), BASKET_SIZE);
    expect(p.basket.length).toBe(BASKET_SIZE); expect(p.basket.some(x => x.id === 'b0')).toBe(false);
    expect(r.coins).toBeGreaterThan(0); expect(p.coins).toBe(coins + r.coins);
  });
  it('kelas ukuran dihitung dari berat', () => { expect(sizeOf('nila', 0.3).tier).toBe(0); expect(sizeOf('nila', 1.4).tier).toBeGreaterThan(1); });
});

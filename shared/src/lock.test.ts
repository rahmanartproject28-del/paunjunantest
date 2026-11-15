import { describe, it, expect } from 'vitest';
import { KeyedLock, Authority, MemoryStore, seededRng, BAITS } from './index';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('kunci per pemain', () => {
  it('kunci sama berurutan, kunci beda bersamaan, lalu dibersihkan', async () => {
    const L = new KeyedLock(), log: string[] = [];
    const job = (k: string, n: string, ms: number) => L.run(k, async () => { log.push(n + '+'); await sleep(ms); log.push(n + '-'); });
    await Promise.all([job('a', 'a1', 15), job('a', 'a2', 1), job('b', 'b1', 1)]);
    // a2 baru mulai setelah a1 selesai; b1 tidak menunggu a1
    expect(log.indexOf('a2+')).toBeGreaterThan(log.indexOf('a1-'));
    expect(log.indexOf('b1-')).toBeLessThan(log.indexOf('a1-'));
    expect(L.size).toBe(0);
  });
  it('galat di dalam tidak mengunci selamanya; pelepas ganda aman', async () => {
    const L = new KeyedLock();
    await expect(L.run('x', async () => { throw new Error('gagal'); })).rejects.toThrow(/gagal/);
    const rel = await L.acquire('x'); rel(); rel();
    expect(await L.run('x', () => 7)).toBe(7);
    expect(L.size).toBe(0);
  });
  it('dua beli umpan bersamaan lewat kunci: dua-duanya tercatat', async () => {
    const store = new MemoryStore(), A = new Authority({ store, rng: seededRng(1), weather: () => 'cerah' });
    const p = A.newPlayer('u', 'U'); p.coins = 1000; p.bait = {}; await store.savePlayer(p);
    const L = new KeyedLock();
    await Promise.all([L.run('u', () => A.buyBait('u', 'udang')), L.run('u', () => A.buyBait('u', 'udang'))]);
    const after = (await store.getPlayer('u'))!;
    expect(after.bait.udang).toBe(2 * BAITS.udang.pack);
    expect(after.coins).toBe(1000 - 2 * BAITS.udang.price);
  });
});

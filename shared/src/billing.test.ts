import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, Billing, COIN_PACKS, type StoreCheck } from './index';

function setup(check: (t: string) => StoreCheck) {
  const st = new MemoryStore(), A = new Authority({ store: st, rng: Math.random });
  let consumed = 0;
  const B = new Billing(st, async (_p, t) => check(t), () => 1000, async () => { consumed++; });
  return { st, A, B, consumed: () => consumed };
}
describe('beli koin', () => {
  it('menambah koin + bonus sekali; token yang sama tidak menggandakan koin', async () => {
    const { st, A, B, consumed } = setup(t => ({ state: 0, orderId: 'GPA.' + t }));
    await st.savePlayer(A.newPlayer('p1', 'Andi')); const c0 = (await st.getPlayer('p1'))!.coins;
    const pack = COIN_PACKS[1];
    const r = await B.redeem('p1', pack.id, 'token-aaaa-1'); expect(r.coins).toBe(pack.coins + pack.bonus); expect(r.player.coins).toBe(c0 + pack.coins + pack.bonus);
    const again = await B.redeem('p1', pack.id, 'token-aaaa-1'); expect(again.already).toBe(true); expect(again.player.coins).toBe(c0 + pack.coins + pack.bonus);
    expect(consumed()).toBe(1);
    await st.savePlayer(A.newPlayer('p2', 'Budi'));
    await expect(B.redeem('p2', pack.id, 'token-aaaa-1')).rejects.toThrow(/akun lain/);
    expect((await B.history('p1')).length).toBe(1);
  });
  it('menolak paket tak dikenal, pembayaran tertunda, dan yang dibatalkan', async () => {
    const { st, A, B } = setup(t => ({ state: t.includes('tunda') ? 2 : t.includes('batal') ? 1 : 0, orderId: t }));
    await st.savePlayer(A.newPlayer('p1', 'Andi'));
    await expect(B.redeem('p1', 'koin_gratis', 'token-12345')).rejects.toThrow(/tidak dikenal/);
    await expect(B.redeem('p1', 'koin_500', 'token-tunda')).rejects.toThrow(/tertunda/);
    await expect(B.redeem('p1', 'koin_500', 'token-batal')).rejects.toThrow(/dibatalkan/);
    await expect(B.redeem('p1', 'koin_500', 'x')).rejects.toThrow(/tidak sah/);
  });
});

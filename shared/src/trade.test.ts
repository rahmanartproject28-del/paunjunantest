import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, Trades, START_BAIT, TRADE_TTL, TRADE_MAX_OUT, afterFee, sideValue, cleanSide } from './index';

function setup() {
  let t = 1_790_000_000;
  const st = new MemoryStore();
  const A = new Authority({ store: st, rng: Math.random, now: () => t });
  const T = new Trades({ store: st, now: () => t });
  const mk = async (id: string, f: (p: ReturnType<typeof A.newPlayer>) => void = () => {}) => { const p = A.newPlayer(id, id.toUpperCase()); p.xp = 500; p.coins = 1000; f(p); await st.savePlayer(p); return p; };
  const get = async (id: string) => (await st.getPlayer(id))!;
  return { st, T, mk, get, tick: (s: number) => { t += s; } };
}

describe('tukar antarpemain', () => {
  it('umpan ↔ joran: barang penawar ditahan, diterima, lalu kiriman diambil penawar', async () => {
    const { T, mk, get } = setup();
    await mk('a', p => { p.bait = { udang: 40 }; });
    await mk('b', p => { p.rods.push('karbon'); });
    const { trade, player } = await T.propose('a', { to: 'b', give: { bait: { udang: 30 } }, want: { rods: ['karbon'] } });
    expect(player.bait.udang).toBe(10);                     // 30 ditahan
    expect((await T.board('b')).incoming.map(x => x.id)).toEqual([trade.id]);
    const r = await T.accept('b', trade.id);
    expect(r.player.bait.udang).toBe(START_BAIT + 30); expect(r.player.rods).not.toContain('karbon');
    expect((await get('a')).rods).not.toContain('karbon');   // belum diambil
    const bo = await T.board('a');
    expect(bo.got.length).toBe(1); expect(bo.player.rods).toContain('karbon'); expect((await get('a')).rods).toContain('karbon');
    expect((await T.board('a')).got.length).toBe(0);         // tidak bisa diambil dua kali
    await expect(T.accept('b', trade.id)).rejects.toThrow(/tidak ada/);
  });

  it('jual joran dengan koin: penjual menerima koin setelah potongan 5%', async () => {
    const { T, mk, get } = setup();
    await mk('a', p => { p.rods.push('tegar'); p.coins = 0; });
    await mk('b', p => { p.coins = 1000; });
    const { trade } = await T.propose('a', { to: 'b', give: { rods: ['tegar'] }, want: { coins: 800 } });
    await expect(T.accept('a', trade.id)).rejects.toThrow(/tidak ada/); // hanya penerima yang bisa menerima
    const r = await T.accept('b', trade.id); expect(r.player.coins).toBe(200); expect(r.player.rods).toContain('tegar');
    await T.board('a'); expect((await get('a')).coins).toBe(afterFee(800)); expect(afterFee(800)).toBe(760);
  });

  it('ditolak / dibatalkan / kedaluwarsa: titipan kembali utuh', async () => {
    const { T, mk, get, tick } = setup();
    await mk('a', p => { p.coins = 500; }); await mk('b', p => { p.bait = { cacing: 15 }; });
    const t1 = (await T.propose('a', { to: 'b', give: { coins: 300 }, want: { bait: { cacing: 10 } } })).trade;
    expect((await get('a')).coins).toBe(200);
    await T.decline('b', t1.id); await T.board('a'); expect((await get('a')).coins).toBe(500);
    const t2 = (await T.propose('a', { to: 'b', give: { coins: 100 }, want: { bait: { cacing: 5 } } })).trade;
    expect((await T.cancel('a', t2.id)).player.coins).toBe(500);
    await T.propose('a', { to: 'b', give: { coins: 50 }, want: { bait: { cacing: 1 } } });
    tick(TRADE_TTL + 1);
    const bb = await T.board('b'); expect(bb.incoming.length).toBe(0);
    expect((await T.board('a')).got[0].why).toBe('kedaluwarsa'); expect((await get('a')).coins).toBe(500);
  });

  it('aturan: barang harus dimiliki & tidak sedang dipakai, joran unik, batas penawaran, level minimal', async () => {
    const { T, mk } = setup();
    await mk('a', p => { p.rods.push('karbon'); p.curRod = 'karbon'; p.bait = { udang: 5 }; });
    await mk('b', p => { p.rods.push('karbon', 'tegar'); });
    await mk('c', p => { p.xp = 0; });
    await expect(T.propose('a', { to: 'b', give: { rods: ['karbon'] }, want: {} })).rejects.toThrow(/sudah punya/);
    await expect(T.propose('a', { to: 'b', give: { bait: { udang: 9 } }, want: {} })).rejects.toThrow(/tidak punya 9/);
    await expect(T.propose('a', { to: 'a', give: { bait: { udang: 1 } }, want: {} })).rejects.toThrow(/diri sendiri/);
    await expect(T.propose('a', { to: 'b', give: { coins: 10 }, want: { coins: 5 } })).rejects.toThrow(/salah satu sisi/);
    await expect(T.propose('a', { to: 'b', give: {}, want: { rods: ['tegar'] } })).rejects.toThrow(/Tawarkan/);
    await expect(T.propose('a', { to: 'b', give: { coins: 10 }, want: { rods: ['predator'] } })).rejects.toThrow(/tidak punya/);
    await expect(T.propose('c', { to: 'b', give: { coins: 10 }, want: {} })).rejects.toThrow(/level 2/);
    expect(() => cleanSide({ rods: ['pemula'] })).toThrow(/pemula/);
    expect(() => cleanSide({ coins: -5 })).toThrow();
    expect(() => cleanSide({ bait: { racun: 3 } })).toThrow(/tidak dikenal/);
    for (let i = 0; i < TRADE_MAX_OUT; i++) await mk('x' + i);
    for (let i = 0; i < TRADE_MAX_OUT; i++) await T.propose('a', { to: 'x' + i, give: { coins: 1 }, want: {} });
    await expect(T.propose('a', { to: 'b', give: { coins: 1 }, want: {} })).rejects.toThrow(/Maksimal/);
  });

  it('dua permintaan bersamaan tidak menggandakan barang', async () => {
    const { T, mk, get } = setup();
    await mk('a', p => { p.coins = 100; }); await mk('b'); await mk('c');
    // menawarkan 100 koin yang sama ke dua orang sekaligus: hanya satu yang lolos
    const res = await Promise.allSettled([T.propose('a', { to: 'b', give: { coins: 100 }, want: {} }), T.propose('a', { to: 'c', give: { coins: 100 }, want: {} })]);
    expect(res.filter(x => x.status === 'fulfilled').length).toBe(1);
    expect((await get('a')).coins).toBe(0);
    // terima & batalkan bersamaan: tepat satu yang berhasil
    const tr = (res.find(x => x.status === 'fulfilled') as PromiseFulfilledResult<{ trade: { id: string; to: string } }>).value.trade;
    const r2 = await Promise.allSettled([T.accept(tr.to, tr.id), T.cancel('a', tr.id)]);
    expect(r2.filter(x => x.status === 'fulfilled').length).toBe(1);
    await T.board('a');
    const total = (await get('a')).coins + (await get('b')).coins + (await get('c')).coins;
    expect(total).toBeLessThanOrEqual(100 + 2000); // tidak ada koin tercipta
  });

  it('nilai perkiraan', () => {
    expect(sideValue({ coins: 10, bait: { udang: 10 }, rods: ['karbon'], lines: [] })).toBe(10 + 40 + 600);
  });
});

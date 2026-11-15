import { describe, it, expect, afterAll } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from './app';

let clock = 1_000_000;
const { app } = buildServer({ now: () => clock });
let base = '';
afterAll(async () => { await app.close(); });

async function start() { if (!base) { await app.listen({ port: 0, host: '127.0.0.1' }); const a = app.server.address() as { port: number }; base = 'http://127.0.0.1:' + a.port; } }
async function call(path: string, token = '', body?: object) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-auth-token': token }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, ...((await r.json()) as object) } as any;
}

describe('server tanpa jam tiruan', () => {
  it('bisa membuat pemain tamu (opsi kosong tidak menimpa bawaan)', async () => {
    const { app: a2 } = buildServer({});
    const r = await a2.inject({ method: 'POST', url: '/api/auth/guest', payload: { name: 'Uji' } });
    expect(r.statusCode).toBe(200);
    await a2.close();
  });
});

describe('server HTTP', () => {
  it('tamu → lempar → sentak → dapat, lalu tampil di peringkat', async () => {
    await start();
    const g = await call('/api/auth/guest', '', { name: 'Raja<Nila>' });
    expect(g.ok).toBe(true);
    expect(g.player.name).toBe('RajaNila');
    expect((await call('/api/me')).status).toBe(401);
    let caught = null as any;
    for (let i = 0; i < 20 && !caught; i++) {
      clock += 5;
      const c = await call('/api/fishing/cast', g.token, { spot: 'B3', zone: 'far', sub: 'keramba' });
      expect(c.ok).toBe(true);
      if (c.biteIn === null) continue;
      clock += c.biteIn;
      const h = await call('/api/fishing/hook', g.token, { castId: c.castId });
      if (h.result !== 'hooked') continue;
      clock += h.minFight + 0.5;
      caught = await call('/api/fishing/land', g.token, { hookId: h.hookId, result: 'caught' });
    }
    expect(caught.result).toBe('caught');
    const lb = await call('/api/leaderboard?kind=most&period=all');
    expect(lb.rows[0].name).toBe('RajaNila');
  });
});

describe('server waktu nyata', () => {
  it('dua pemain di ruang yang sama saling melihat dan bisa mengobrol', async () => {
    await start();
    const a = await call('/api/auth/guest', '', { name: 'Andi' });
    const b = await call('/api/auth/guest', '', { name: 'Budi' });
    const wsUrl = base.replace('http', 'ws') + '/ws';
    const open = (tok: string) => new Promise<{ ws: WebSocket; msgs: any[] }>((res) => {
      const ws = new WebSocket(wsUrl); const msgs: any[] = [];
      ws.on('message', (d) => msgs.push(JSON.parse(String(d))));
      ws.on('open', () => { ws.send(JSON.stringify({ t: 'join', room: 'A1', token: tok })); res({ ws, msgs }); });
    });
    const A = await open(a.token), B = await open(b.token);
    await new Promise(r => setTimeout(r, 150));
    A.ws.send(JSON.stringify({ t: 'state', x: 3, z: 4, yaw: 1, pose: 'wait' }));
    A.ws.send(JSON.stringify({ t: 'chat', text: 'halo, cek www.spam.com' }));
    await new Promise(r => setTimeout(r, 500));
    const snap = B.msgs.filter(m => m.t === 'snap').pop();
    expect(snap.players.find((p: any) => p.name === 'Andi').x).toBe(3);
    const chat = B.msgs.find(m => m.t === 'chat');
    expect(chat.text).toContain('[tautan dihapus]');
    A.ws.close(); B.ws.close();
  });
});

describe('server tukar antarpemain', () => {
  it('ajukan → kabar waktu nyata → terima → kiriman diambil; endpoint pasar umpan', async () => {
    const { MemoryStore } = await import('@paunjunan/shared');
    const store = new MemoryStore();
    const { app: s2 } = buildServer({ store, now: () => clock });
    await s2.listen({ port: 0, host: '127.0.0.1' }); const port = (s2.server.address() as { port: number }).port, b2 = 'http://127.0.0.1:' + port;
    const c2 = async (path: string, token = '', body?: object) => { const r = await fetch(b2 + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-auth-token': token }, body: body ? JSON.stringify(body) : undefined }); return { status: r.status, ...((await r.json()) as object) } as any; };
    const a = await c2('/api/auth/guest', '', { name: 'Penjual' }), b = await c2('/api/auth/guest', '', { name: 'Pembeli' });
    for (const [id, f] of [[a.player.id, (p: any) => { p.xp = 500; p.rods.push('karbon'); }], [b.player.id, (p: any) => { p.xp = 500; p.coins = 900; }]] as const) { const p = (await store.getPlayer(id))!; f(p); await store.savePlayer(p); }
    const ws = new WebSocket(b2.replace('http', 'ws') + '/ws'); const msgs: any[] = [];
    ws.on('message', d => msgs.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r)); ws.send(JSON.stringify({ t: 'join', room: 'A1', token: b.token })); await new Promise(r => setTimeout(r, 150));
    const inv = await c2('/api/trade/inventory?id=' + a.player.id, b.token); expect(inv.rods).toContain('karbon'); expect(inv.coins).toBeUndefined();
    const pr = await c2('/api/trade/propose', a.token, { to: b.player.id, give: { rods: ['karbon'] }, want: { coins: 500 } });
    expect(pr.ok).toBe(true); expect(pr.player.rods).not.toContain('karbon');
    await new Promise(r => setTimeout(r, 150));
    expect(msgs.find(m => m.t === 'trade')).toMatchObject({ kind: 'baru', name: 'Penjual' });
    const bd = await c2('/api/trade', b.token, {}); expect(bd.incoming.length).toBe(1);
    const ac = await c2('/api/trade/accept', b.token, { id: bd.incoming[0].id }); expect(ac.player.coins).toBe(400); expect(ac.player.rods).toContain('karbon');
    const ad = await c2('/api/trade', a.token, {}); expect(ad.got.length).toBe(1); expect(ad.player.coins - a.player.coins).toBe(475);
    // pasar umpan
    const li = await c2('/api/market/list', a.token, { kind: 'bait', item: 'udang', qty: 5, price: 30 }); expect(li.ok).toBe(true); expect(li.listing.qty).toBe(5);
    const bad = await c2('/api/trade/propose', a.token, { to: b.player.id, give: { coins: -1 }, want: {} }); expect(bad.ok).toBe(false);
    ws.close(); await s2.close();
  });
});

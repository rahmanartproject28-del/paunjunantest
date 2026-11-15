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

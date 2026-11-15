// Uji alur luring → daring: server tiruan (aturan asli) yang bisa "dimatikan".
import { describe, it, expect } from 'vitest';
import { Authority, MemoryStore, seededRng } from '@paunjunan/shared';

let clock = 1_700_000_000_000; Date.now = () => clock; const adv = (s: number) => { clock += s * 1000; };
const mem = new Map<string, string>(); const ev: Record<string, (() => void)[]> = {};
const g = globalThis as any;
g.localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v), removeItem: (k: string) => void mem.delete(k) };
g.window = g; g.addEventListener = (n: string, f: () => void) => (ev[n] ??= []).push(f); g.document = { hidden: false, addEventListener() {} };
Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });
g.setInterval = () => 0; g.clearInterval = () => {};

let down = false;
const sst = new MemoryStore(), SA = new Authority({ store: sst, rng: seededRng(5), now: () => clock / 1000, weather: () => 'cerah' });
g.fetch = async (url: string, o: any = {}) => {
  if (down) throw new TypeError('Failed to fetch');
  const path = url.replace('http://srv', ''), b = o.body ? JSON.parse(o.body) : {}, pid = 'u1';
  const ok = (x: object) => ({ status: 200, json: async () => ({ ok: true, ...x }) });
  try {
    if (path === '/health') return ok({});
    if (path === '/api/auth/guest') { const p = SA.newPlayer(pid, b.name); await sst.savePlayer(p); return ok({ token: 'tok', player: p }); }
    if (path === '/api/me') return ok({ player: await sst.getPlayer(pid) });
    if (path === '/api/fishing/cast') return ok(await SA.cast(pid, b));
    if (path === '/api/fishing/hook') return ok(await SA.hook(pid, b));
    if (path === '/api/fishing/land') return ok(await SA.land(pid, b));
    if (path === '/api/offline/sync') return ok(await SA.syncOffline(pid, b));
    if (path === '/api/equip') return ok(await SA.equip(pid, b));
    if (path === '/api/basket/sell') return ok(await SA.sellBasket(pid));
  } catch (e) { return { status: 400, json: async () => ({ ok: false, error: (e as Error).message }) }; }
  return { status: 404, json: async () => ({ ok: false, error: 'tidak ada' }) };
};

async function catchOne(be: any) {
  for (let i = 0; i < 60; i++) {
    adv(30);
    const c = await be.cast({ spot: 'D1', zone: 'far', sub: 'jauh' });
    if (c.biteIn == null) continue;
    adv(c.biteIn + 0.1);
    const h = await be.hook(c.castId);
    if (h.result !== 'hooked') continue;
    adv(h.minFight + 1);
    const r = await be.land(h.hookId, 'caught', true);
    if (r.result === 'caught') return r;
  }
  throw new Error('tidak dapat ikan');
}

describe('luring otomatis', () => {
  it('putus → tetap mancing → sambung lagi → hasil tersimpan di server', async () => {
    const { RemoteBackend } = await import('./backend'); const { HybridBackend } = await import('./hybrid');
    const be = new HybridBackend(new RemoteBackend('http://srv'), () => 'cerah') as any;
    const log: any[] = []; be.onStatus = (s: any) => log.push(s);
    const p0 = await be.login('Uji'); expect(be.online).toBe(true);
    await catchOne(be);                                   // daring: 1 ikan di server
    const srv1 = (await sst.getPlayer('u1'))!; expect(srv1.basket.length).toBe(1);
    down = true;
    const r = await catchOne(be);                         // jaringan mati: otomatis luring
    expect(be.online).toBe(false); expect(be.pending).toBe(1); expect(r.player.basket.length).toBe(2);
    await catchOne(be); expect(be.pending).toBe(2);
    let err = ''; try { await be.sell(); } catch (e) { err = (e as Error).message; } expect(err).toContain('perlu jaringan');
    expect((await sst.getPlayer('u1'))!.basket.length).toBe(1);
    down = false; await be.probe();                       // jaringan kembali
    expect(be.online).toBe(true); expect(be.pending).toBe(0);
    const srv2 = (await sst.getPlayer('u1'))!;
    expect(srv2.basket.length).toBe(3); expect(srv2.xp).toBeGreaterThan(srv1.xp);
    expect(sst.catches.length).toBe(1);                   // hasil luring tidak masuk papan peringkat
    const last = log[log.length - 1]; expect(last.online).toBe(true); expect(last.synced.accepted.length).toBe(2);
    expect(p0.id).toBe('u1');
    await catchOne(be); expect((await sst.getPlayer('u1'))!.basket.length).toBe(4); // daring lagi seperti biasa
  });
  it('putus di tengah tarikan: ikan tetap dihitung', async () => {
    const { RemoteBackend } = await import('./backend'); const { HybridBackend } = await import('./hybrid');
    const be = new HybridBackend(new RemoteBackend('http://srv'), () => 'cerah') as any;
    await be.login('Uji');
    for (let i = 0; i < 60; i++) {
      adv(30); const c = await be.cast({ spot: 'D1', zone: 'far', sub: 'jauh' }); if (c.biteIn == null) continue;
      adv(c.biteIn + 0.1); const h = await be.hook(c.castId); if (h.result !== 'hooked') continue;
      adv(h.minFight + 1); down = true;
      const r = await be.land(h.hookId, 'caught', true);
      expect(r.result).toBe('caught'); expect(be.online).toBe(false); expect(be.pending).toBe(1); break;
    }
    const n = (await sst.getPlayer('u1'))!.basket.length;
    down = false; await be.probe();
    expect(be.online).toBe(true); expect((await sst.getPlayer('u1'))!.basket.length).toBe(n + 1);
  });
  it('mulai game tanpa jaringan: pakai data terakhir', async () => {
    const { RemoteBackend } = await import('./backend'); const { HybridBackend } = await import('./hybrid');
    down = true;
    const be = new HybridBackend(new RemoteBackend('http://srv'), () => 'cerah') as any;
    const p = await be.login('Uji'); expect(be.online).toBe(false); expect(p.id).toBe('u1');
    await catchOne(be); down = false; await be.probe(); expect(be.online).toBe(true);
  });
});

// Alat UJI website superadmin (bukan untuk produksi): server game tiruan yang memakai AdminService ASLI
// dari shared/ dengan penyimpanan SQLite (database uji website). Rute admin sama dengan server/src/app.ts.
// Bangun & jalankan: esbuild admin-mock.ts --bundle --platform=node --format=esm --outfile=/tmp/mock.mjs && node --no-warnings /tmp/mock.mjs <db> <port> <token>
import http from 'node:http';
// @ts-ignore modul bawaan Node 22
import { DatabaseSync } from 'node:sqlite';
import { AdminService, GameError, type Player, type Store, type DocStore, type SpeciesId, type CatchRec } from '@paunjunan/shared';

const [dbFile, port = '8092', TOKEN = 'token-admin-uji-123456'] = process.argv.slice(2);
const db = new DatabaseSync(dbFile);

const store: Store & DocStore = {
  async getPlayer(id) { const r = db.prepare('SELECT data FROM pj_players WHERE id = ?').get(id) as { data: string } | undefined; return r ? JSON.parse(r.data) as Player : null; },
  async savePlayer(p) { db.prepare('INSERT INTO pj_players (id,name,xp,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, xp=excluded.xp, data=excluded.data').run(p.id, p.name, p.xp, JSON.stringify(p)); },
  async getStock(spot) { const rows = db.prepare('SELECT species, n FROM pj_stock WHERE spot = ?').all(spot) as { species: SpeciesId; n: number }[]; return rows.length ? Object.fromEntries(rows.map(r => [r.species, r.n])) : null; },
  async takeStock() { return true; },
  async putStock() { /* */ },
  async initStock(spot, st) { db.prepare('DELETE FROM pj_stock WHERE spot = ?').run(spot); for (const [k, n] of Object.entries(st)) db.prepare('INSERT INTO pj_stock (spot,species,n) VALUES (?,?,?)').run(spot, k, n); },
  async addCatch(_pid: string, _name: string, _c: CatchRec) { /* */ },
  async leaderboard() { return []; },
  async getDoc<T>(k: string) { const r = db.prepare('SELECT data FROM pj_docs WHERE k = ?').get(k) as { data: string } | undefined; return r?.data ? JSON.parse(r.data) as T : null; },
  async updateDoc<T>(k: string, fn: (cur: T | null) => T | Promise<T>) {
    const cur = await this.getDoc<T>(k), nx = await fn(cur);
    db.prepare('INSERT INTO pj_docs (k,data) VALUES (?,?) ON CONFLICT(k) DO UPDATE SET data=excluded.data').run(k, JSON.stringify(nx)); return nx;
  },
};
const admin = new AdminService(store);
await admin.load();
const calls: string[] = [];

const server = http.createServer(async (req, res) => {
  const send = (code: number, o: object) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  let raw = ''; for await (const ch of req) raw += ch;
  const body = raw ? JSON.parse(raw) : {};
  const url = req.url ?? '';
  try {
    if (url === '/health') return send(200, { ok: true, time: Date.now(), online: 7 });
    if (url === '/__calls') return send(200, { ok: true, calls });
    if (!url.startsWith('/api/admin/')) return send(404, { ok: false, error: 'tidak ada' });
    if (req.headers['x-admin-token'] !== TOKEN) throw new GameError('Token admin salah.', 401);
    const by = String(req.headers['x-admin-by'] ?? '').replace(/[^\w.@ -]/g, '').slice(0, 40);
    const who = 'admin@127.0.0.1' + (by ? ' / ' + by : '');
    calls.push(req.method + ' ' + url + ' ' + by);
    if (url === '/api/admin/state') return send(200, { ok: true, config: admin.cfg, stock: await admin.stock(), audit: (await admin.auditLog()).slice(0, 60) });
    if (url === '/api/admin/config') return send(200, { ok: true, config: await admin.setConfig(body, who) });
    if (url === '/api/admin/stock') return send(200, { ok: true, stock: await admin.setStock(String(body.spot), body.species, Number(body.n), who) });
    if (url === '/api/admin/stock/reset') return send(200, { ok: true, stock: await admin.resetStock(String(body.spot), who) });
    if (url === '/api/admin/events') return send(200, { ok: true, config: await admin.setEvents(body.events, who) });
    if (url === '/api/admin/coins') return send(200, { ok: true, ...(await admin.grantCoins(String(body.playerId), Number(body.coins), who, String(body.reason ?? ''))) });
    if (url === '/api/admin/ban') return send(200, { ok: true, ...(await admin.setBan(String(body.playerId), body.minutes === null || body.minutes === -1 ? null : Number(body.minutes), String(body.reason ?? ''), who)) });
    return send(404, { ok: false, error: 'tidak ada' });
  } catch (e) {
    const st = e instanceof GameError ? e.status : 500;
    send(st, { ok: false, error: e instanceof GameError ? e.message : 'Server sedang bermasalah.' });
  }
});
server.listen(Number(port), '127.0.0.1', () => console.log('mock siap di ' + port));

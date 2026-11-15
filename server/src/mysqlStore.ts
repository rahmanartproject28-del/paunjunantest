// Adaptor MySQL/MariaDB untuk Store (pemain, stok, tangkapan, peringkat) dan AccountStore (akun, sesi).
// Aktif bila variabel lingkungan DB_HOST diisi (lihat index.ts). Skema: server/database/schema.sql.
import mysql from 'mysql2/promise';
import { levelInfo, type DocStore, type Store, type Player, type CatchRec, type LeaderRow, type SpeciesId } from '@paunjunan/shared';
import type { AccountStore, Account, Session } from './accounts';

type Row = Record<string, any>;

export class MysqlStore implements Store, DocStore, AccountStore {
  private pool: any;
  constructor(cfg: { host: string; port?: number; user: string; password: string; database: string }) {
    this.pool = mysql.createPool({ ...cfg, connectionLimit: 10, waitForConnections: true, charset: 'utf8mb4', supportBigNumbers: true, decimalNumbers: true });
  }
  private async q(sql: string, args: unknown[] = []): Promise<Row[]> { const [rows] = await this.pool.query(sql, args); return rows as Row[]; }
  async ping() { await this.q('SELECT 1'); }
  close() { return this.pool.end(); }

  // ---------- Store ----------
  async getPlayer(id: string) {
    const r = await this.q('SELECT data FROM pj_players WHERE id=?', [id]);
    if (!r.length) return null;
    return (typeof r[0].data === 'string' ? JSON.parse(r[0].data) : r[0].data) as Player;
  }
  async savePlayer(p: Player) {
    await this.q('INSERT INTO pj_players (id,name,xp,data) VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE name=VALUES(name), xp=VALUES(xp), data=VALUES(data)', [p.id, p.name, p.xp, JSON.stringify(p)]);
  }
  async deletePlayer(id: string) {
    await this.q('DELETE FROM pj_catches WHERE player_id=?', [id]);
    await this.q('DELETE FROM pj_players WHERE id=?', [id]);
  }
  async getStock(spot: string) {
    const r = await this.q('SELECT species,n FROM pj_stock WHERE spot=?', [spot]);
    if (!r.length) return null;
    return Object.fromEntries(r.map(x => [x.species, Number(x.n)])) as Partial<Record<SpeciesId, number>>;
  }
  async initStock(spot: string, stock: Partial<Record<SpeciesId, number>>) {
    for (const [k, n] of Object.entries(stock)) await this.q('INSERT INTO pj_stock (spot,species,n) VALUES (?,?,?) ON DUPLICATE KEY UPDATE n=VALUES(n)', [spot, k, n]);
  }
  /** Atomik: hanya berhasil bila stok masih ada (aman untuk banyak pemain bersamaan). */
  async takeStock(spot: string, k: SpeciesId) {
    const [res] = await this.pool.query('UPDATE pj_stock SET n=n-1 WHERE spot=? AND species=? AND n>0', [spot, k]);
    return (res as { affectedRows: number }).affectedRows === 1;
  }
  async putStock(spot: string, k: SpeciesId) { await this.q('UPDATE pj_stock SET n=n+1 WHERE spot=? AND species=?', [spot, k]); }
  async addCatch(playerId: string, playerName: string, c: CatchRec) {
    await this.q('INSERT INTO pj_catches (id,player_id,player_name,species,name,weight,length_cm,tier,stars,spot,value,at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
      [c.id, playerId, playerName, c.species, c.name, c.weight, c.length, c.tier, c.stars, c.spot, c.value, Math.round(c.at)]);
  }
  async leaderboard(kind: 'heaviest' | 'most' | 'level', since: number, limit: number): Promise<LeaderRow[]> {
    const lim = Math.max(1, Math.min(100, limit | 0));
    if (kind === 'level') {
      const r = await this.q(`SELECT id,name,xp FROM pj_players ORDER BY xp DESC LIMIT ${lim}`);
      return r.map(x => ({ playerId: x.id, name: x.name, value: levelInfo(Number(x.xp)).lv }));
    }
    if (kind === 'most') {
      const r = await this.q(`SELECT player_id, MAX(player_name) name, COUNT(*) n FROM pj_catches WHERE at>=? GROUP BY player_id ORDER BY n DESC LIMIT ${lim}`, [Math.floor(since)]);
      return r.map(x => ({ playerId: x.player_id, name: x.name, value: Number(x.n) }));
    }
    // terberat: satu baris per pemain (tangkapan terberatnya)
    const r = await this.q(`SELECT c.player_id, c.player_name name, c.weight, c.species, c.at FROM pj_catches c
      JOIN (SELECT player_id, MAX(weight) w FROM pj_catches WHERE at>=? GROUP BY player_id) m ON m.player_id=c.player_id AND m.w=c.weight
      WHERE c.at>=? ORDER BY c.weight DESC LIMIT ${lim * 2}`, [Math.floor(since), Math.floor(since)]);
    const seen = new Set<string>(), out: LeaderRow[] = [];
    for (const x of r) { if (seen.has(x.player_id)) continue; seen.add(x.player_id); out.push({ playerId: x.player_id, name: x.name, value: Number(x.weight), species: x.species, at: Number(x.at) }); }
    return out.slice(0, lim);
  }

  async topCatches(since: number, until: number, species: SpeciesId | null, limit: number) {
    const sp = species ? ' AND species = ?' : '', sp2 = species ? ' AND c.species = ?' : '', lim = Math.max(1, Math.min(100, limit | 0));
    const args: unknown[] = [Math.floor(since), Math.floor(until)]; if (species) args.push(species); args.push(Math.floor(since), Math.floor(until)); if (species) args.push(species);
    const r = await this.q(`SELECT c.player_id, c.player_name name, c.weight, c.species, c.at FROM pj_catches c
      JOIN (SELECT player_id, MAX(weight) w FROM pj_catches WHERE at BETWEEN ? AND ?${sp} GROUP BY player_id) m ON m.player_id=c.player_id AND m.w=c.weight
      WHERE c.at BETWEEN ? AND ?${sp2} ORDER BY c.weight DESC, c.at ASC LIMIT ${lim * 2}`, args);
    const seen = new Set<string>(), out: { name: string; weight: number; species: SpeciesId; at: number }[] = [];
    for (const x of r) { if (seen.has(x.player_id)) continue; seen.add(x.player_id); out.push({ name: x.name, weight: Number(x.weight), species: x.species, at: Number(x.at) }); }
    return out.slice(0, lim);
  }
  // ---------- DocStore (turnamen, pasar, klub) ----------
  async getDoc<T>(key: string) { const r = await this.q('SELECT data FROM pj_docs WHERE k=?', [key]); return r.length ? (typeof r[0].data === 'string' ? JSON.parse(r[0].data) : r[0].data) as T : null; }
  /** Atomik lintas banyak proses: baris dikunci (SELECT … FOR UPDATE) selama fn berjalan. */
  async updateDoc<T>(key: string, fn: (cur: T | null) => T | Promise<T>): Promise<T> {
    const c = await this.pool.getConnection();
    try {
      await c.beginTransaction();
      await c.query('INSERT IGNORE INTO pj_docs (k,data) VALUES (?, CAST(? AS JSON))', [key, 'null']);
      const [rows] = await c.query('SELECT data FROM pj_docs WHERE k=? FOR UPDATE', [key]);
      const raw = (rows as Row[])[0]?.data, cur = raw == null ? null : (typeof raw === 'string' ? JSON.parse(raw) : raw);
      const nx = await fn(cur as T | null);
      await c.query('UPDATE pj_docs SET data=? WHERE k=?', [JSON.stringify(nx), key]);
      await c.commit(); return nx;
    } catch (e) { await c.rollback().catch(() => {}); throw e; } finally { c.release(); }
  }

  // ---------- AccountStore ----------
  private acc(x: Row): Account { return { id: x.id, username: x.username, email: x.email, pass: x.pass, pin: x.pin, createdAt: Number(x.created_at), failN: Number(x.fail_n), lockUntil: Number(x.lock_until) }; }
  async getAccount(id: string) { const r = await this.q('SELECT * FROM pj_accounts WHERE id=?', [id]); return r.length ? this.acc(r[0]) : null; }
  async findAccount(login: string) { const l = login.trim().toLowerCase(); const r = await this.q('SELECT * FROM pj_accounts WHERE username=? OR email=? LIMIT 1', [l, l]); return r.length ? this.acc(r[0]) : null; }
  async saveAccount(a: Account) {
    await this.q(`INSERT INTO pj_accounts (id,username,email,pass,pin,created_at,fail_n,lock_until) VALUES (?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE username=VALUES(username), email=VALUES(email), pass=VALUES(pass), pin=VALUES(pin), fail_n=VALUES(fail_n), lock_until=VALUES(lock_until)`,
      [a.id, a.username, a.email, a.pass, a.pin, a.createdAt, a.failN, a.lockUntil]);
  }
  async deleteAccount(id: string) { await this.q('DELETE FROM pj_accounts WHERE id=?', [id]); }
  async getSession(h: string) {
    const r = await this.q('SELECT * FROM pj_sessions WHERE token_hash=?', [h]);
    return r.length ? { playerId: r[0].player_id, kind: r[0].kind, expires: Number(r[0].expires), failN: Number(r[0].fail_n) } as Session : null;
  }
  async saveSession(h: string, s: Session) {
    await this.q('INSERT INTO pj_sessions (token_hash,player_id,kind,expires,fail_n) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE expires=VALUES(expires), fail_n=VALUES(fail_n)', [h, s.playerId, s.kind, s.expires, s.failN ?? 0]);
  }
  async deleteSession(h: string) { await this.q('DELETE FROM pj_sessions WHERE token_hash=?', [h]); }
  async deleteSessionsOf(pid: string) { await this.q('DELETE FROM pj_sessions WHERE player_id=?', [pid]); }
  /** Bersihkan sesi kedaluwarsa (dipanggil berkala). */
  async purgeSessions() { await this.q('DELETE FROM pj_sessions WHERE expires<?', [Date.now()]); }
}

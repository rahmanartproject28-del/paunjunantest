// Akun pemain: daftar, masuk (nama pengguna/email + sandi), masuk cepat PIN per perangkat, tamu,
// upgrade tamu → akun (progres tetap), keluar, hapus akun. Sandi & PIN di-hash scrypt.
// Sesi disimpan (hash token), jadi pemain tidak keluar sendiri saat server dimulai ulang.
import { randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { GameError, cleanName, type Player } from '@paunjunan/shared';

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opt: object) => Promise<Buffer>;
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

export interface Account {
  id: string;               // sama dengan id pemain
  username: string;         // huruf kecil, unik
  email: string;            // huruf kecil, unik
  pass: string;             // scrypt$salt$hash
  pin: string;              // scrypt$salt$hash
  createdAt: number;
  failN: number; lockUntil: number;
}
export interface Session { playerId: string; kind: 'sesi' | 'perangkat' | 'reset'; expires: number; failN?: number }
/** Pengirim email (SMTP di produksi, catatan konsol saat pengembangan). */
export type Mailer = (to: string, subject: string, text: string) => Promise<void>;

/** Penyimpanan akun & sesi. MemoryAccounts untuk pengembangan, MysqlStore untuk produksi. */
export interface AccountStore {
  getAccount(id: string): Promise<Account | null>;
  findAccount(login: string): Promise<Account | null>;   // nama pengguna atau email
  saveAccount(a: Account): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  getSession(hash: string): Promise<Session | null>;
  saveSession(hash: string, s: Session): Promise<void>;
  deleteSession(hash: string): Promise<void>;
  deleteSessionsOf(playerId: string): Promise<void>;
}

export class MemoryAccounts implements AccountStore {
  accounts = new Map<string, Account>(); sessions = new Map<string, Session>();
  onChange?: () => void;
  async getAccount(id: string) { const a = this.accounts.get(id); return a ? { ...a } : null; }
  async findAccount(login: string) {
    const l = login.trim().toLowerCase();
    for (const a of this.accounts.values()) if (a.username === l || a.email === l) return { ...a };
    return null;
  }
  async saveAccount(a: Account) { this.accounts.set(a.id, { ...a }); this.onChange?.(); }
  async deleteAccount(id: string) { this.accounts.delete(id); this.onChange?.(); }
  async getSession(h: string) { const s = this.sessions.get(h); return s ? { ...s } : null; }
  async saveSession(h: string, s: Session) { this.sessions.set(h, { ...s }); this.onChange?.(); }
  async deleteSession(h: string) { this.sessions.delete(h); this.onChange?.(); }
  async deleteSessionsOf(pid: string) { for (const [h, s] of this.sessions) if (s.playerId === pid) this.sessions.delete(h); this.onChange?.(); }
  toJSON() { const now = Date.now(); return { accounts: [...this.accounts.values()], sessions: [...this.sessions].filter(([, s]) => s.expires > now) }; }
  load(d: ReturnType<MemoryAccounts['toJSON']>) { this.accounts = new Map((d.accounts ?? []).map(a => [a.id, a])); this.sessions = new Map(d.sessions ?? []); }
}

const N = 16384;
export async function hashSecret(s: string) {
  const salt = randomBytes(16), h = await scrypt(s, salt, 32, { N, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${h.toString('base64')}`;
}
export async function checkSecret(s: string, stored: string) {
  const [alg, salt, hash] = stored.split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const want = Buffer.from(hash, 'base64'), got = await scrypt(s, Buffer.from(salt, 'base64'), want.length, { N, r: 8, p: 1 });
  return got.length === want.length && timingSafeEqual(got, want);
}

export const SESSION_DAYS = 60, DEVICE_DAYS = 180, MAX_FAIL = 5, LOCK_MIN = 10;
const USER_RE = /^[a-z0-9._]{3,18}$/, EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i, PIN_RE = /^\d{6}$/;

export interface AccountsOptions {
  players: { getPlayer(id: string): Promise<Player | null>; savePlayer(p: Player): Promise<void>; deletePlayer?(id: string): Promise<void> };
  store: AccountStore;
  newPlayer: (id: string, name: string) => Player;
  now?: () => number;
  mailer?: Mailer;
}

export class Accounts {
  constructor(private o: AccountsOptions) {}
  private now() { return this.o.now ? this.o.now() : Date.now(); }

  private async issue(playerId: string, kind: Session['kind']) {
    const token = randomBytes(32).toString('hex');
    await this.o.store.saveSession(hashToken(token), { playerId, kind, expires: this.now() + (kind === 'sesi' ? SESSION_DAYS : DEVICE_DAYS) * 86400_000 });
    return token;
  }
  /** Token sesi → id pemain (null bila tidak sah / kedaluwarsa). */
  async playerOf(token: string) {
    if (!token) return null;
    const s = await this.o.store.getSession(hashToken(token));
    if (!s || s.kind !== 'sesi') return null;
    if (s.expires < this.now()) { await this.o.store.deleteSession(hashToken(token)); return null; }
    return s.playerId;
  }

  async guest(name: string) {
    const id = 'g_' + randomBytes(8).toString('hex');
    const p = this.o.newPlayer(id, cleanName(name));
    await this.o.players.savePlayer(p);
    return { token: await this.issue(id, 'sesi'), player: p };
  }

  /** Daftar akun baru. Bila guestToken sah, progres tamu itu dipakai (tidak mulai dari nol). */
  async register(a: { username: string; email: string; password: string; pin: string; guestToken?: string }) {
    const username = String(a.username ?? '').trim().toLowerCase(), email = String(a.email ?? '').trim().toLowerCase();
    const password = String(a.password ?? ''), pin = String(a.pin ?? '');
    if (!USER_RE.test(username)) throw new GameError('Nama pengguna 3–18 huruf kecil, angka, titik, atau garis bawah.');
    if (!EMAIL_RE.test(email)) throw new GameError('Alamat email tidak valid.');
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) throw new GameError('Kata sandi minimal 8 karakter dan berisi huruf serta angka.');
    if (!PIN_RE.test(pin)) throw new GameError('PIN harus 6 angka.');
    if (/^(\d)\1{5}$/.test(pin) || pin === '123456' || pin === '654321') throw new GameError('PIN terlalu mudah ditebak.');
    if (await this.o.store.findAccount(username)) throw new GameError('Nama pengguna sudah dipakai.');
    if (await this.o.store.findAccount(email)) throw new GameError('Email sudah terdaftar.');
    let p: Player | null = null;
    const gid = a.guestToken ? await this.playerOf(a.guestToken) : null;
    if (gid && gid.startsWith('g_') && !(await this.o.store.getAccount(gid))) p = await this.o.players.getPlayer(gid);
    if (p) { p.name = cleanName(a.username); await this.o.players.savePlayer(p); await this.o.store.deleteSessionsOf(p.id); }
    else { p = this.o.newPlayer('u_' + randomBytes(8).toString('hex'), cleanName(a.username)); await this.o.players.savePlayer(p); }
    await this.o.store.saveAccount({ id: p.id, username, email, pass: await hashSecret(password), pin: await hashSecret(pin), createdAt: this.now(), failN: 0, lockUntil: 0 });
    return { token: await this.issue(p.id, 'sesi'), device: await this.issue(p.id, 'perangkat'), player: p };
  }

  async login(login: string, password: string) {
    const acc = await this.o.store.findAccount(String(login ?? ''));
    const bad = new GameError('Nama pengguna/email atau kata sandi salah.', 401);
    if (!acc) { await hashSecret('x'); throw bad; } // waktu jawab sama agar nama tidak bisa ditebak
    if (acc.lockUntil > this.now()) throw new GameError(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((acc.lockUntil - this.now()) / 60000)} menit.`, 429);
    if (!(await checkSecret(String(password ?? ''), acc.pass))) {
      acc.failN++; if (acc.failN >= MAX_FAIL) { acc.failN = 0; acc.lockUntil = this.now() + LOCK_MIN * 60000; }
      await this.o.store.saveAccount(acc); throw bad;
    }
    acc.failN = 0; acc.lockUntil = 0; await this.o.store.saveAccount(acc);
    const player = await this.o.players.getPlayer(acc.id);
    if (!player) throw new GameError('Data pemain tidak ditemukan.', 404);
    return { token: await this.issue(acc.id, 'sesi'), device: await this.issue(acc.id, 'perangkat'), player };
  }

  /** Masuk cepat dengan PIN di perangkat yang pernah dipakai masuk. */
  async pinLogin(deviceToken: string, pin: string) {
    const h = hashToken(String(deviceToken ?? '')), s = await this.o.store.getSession(h);
    if (!s || s.kind !== 'perangkat' || s.expires < this.now()) throw new GameError('Perangkat ini belum terdaftar. Masuk dengan kata sandi.', 401);
    const acc = await this.o.store.getAccount(s.playerId);
    if (!acc) { await this.o.store.deleteSession(h); throw new GameError('Akun tidak ditemukan.', 404); }
    if (!(await checkSecret(String(pin ?? ''), acc.pin))) {
      s.failN = (s.failN ?? 0) + 1;
      if (s.failN >= MAX_FAIL) { await this.o.store.deleteSession(h); throw new GameError('PIN salah 5 kali. Masuk lagi dengan kata sandi.', 401); }
      await this.o.store.saveSession(h, s); throw new GameError(`PIN salah. Sisa ${MAX_FAIL - s.failN} percobaan.`, 401);
    }
    if (s.failN) { s.failN = 0; await this.o.store.saveSession(h, s); }
    const player = await this.o.players.getPlayer(acc.id);
    if (!player) throw new GameError('Data pemain tidak ditemukan.', 404);
    return { token: await this.issue(acc.id, 'sesi'), player, username: acc.username };
  }

  /** Lupa sandi langkah 1: kirim kode 6 angka ke email akun. Jawaban selalu sama (tidak membocorkan akun terdaftar). */
  async requestReset(login: string) {
    const acc = await this.o.store.findAccount(String(login ?? ''));
    if (acc && this.o.mailer) {
      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await this.o.store.saveSession(hashToken(acc.id + ':' + code), { playerId: acc.id, kind: 'reset', expires: this.now() + 30 * 60000 });
      await this.o.mailer(acc.email, 'Kode atur ulang sandi PAUNJUNAN',
        `Halo ${acc.username},\n\nKode atur ulang kata sandi Anda: ${code}\nBerlaku 30 menit. Abaikan email ini bila Anda tidak memintanya.\n\nPAUNJUNAN Mancing`);
    }
    return { sent: true };
  }
  /** Lupa sandi langkah 2: kode + sandi baru. Semua sesi lama dicabut. */
  async resetPassword(login: string, code: string, newPw: string) {
    const acc = await this.o.store.findAccount(String(login ?? ''));
    const bad = new GameError('Kode salah atau sudah kedaluwarsa.', 401);
    if (!acc) throw bad;
    if (acc.lockUntil > this.now()) throw new GameError(`Terlalu banyak percobaan. Coba lagi dalam ${Math.ceil((acc.lockUntil - this.now()) / 60000)} menit.`, 429);
    const h = hashToken(acc.id + ':' + String(code ?? '').trim()), s = await this.o.store.getSession(h);
    if (!s || s.kind !== 'reset' || s.playerId !== acc.id || s.expires < this.now()) {
      acc.failN++; if (acc.failN >= MAX_FAIL) { acc.failN = 0; acc.lockUntil = this.now() + LOCK_MIN * 60000; }
      await this.o.store.saveAccount(acc); throw bad;
    }
    if (newPw.length < 8 || !/[a-z]/i.test(newPw) || !/\d/.test(newPw)) throw new GameError('Kata sandi minimal 8 karakter dan berisi huruf serta angka.');
    acc.pass = await hashSecret(newPw); acc.failN = 0; acc.lockUntil = 0; await this.o.store.saveAccount(acc);
    await this.o.store.deleteSessionsOf(acc.id);
    const player = await this.o.players.getPlayer(acc.id);
    return { token: await this.issue(acc.id, 'sesi'), device: await this.issue(acc.id, 'perangkat'), player };
  }

  async logout(token: string, deviceToken?: string) {
    await this.o.store.deleteSession(hashToken(token));
    if (deviceToken) await this.o.store.deleteSession(hashToken(deviceToken));
  }

  async changePassword(token: string, oldPw: string, newPw: string) {
    const pid = await this.playerOf(token); if (!pid) throw new GameError('Silakan masuk dulu.', 401);
    const acc = await this.o.store.getAccount(pid); if (!acc) throw new GameError('Akun tamu tidak punya kata sandi.');
    if (!(await checkSecret(oldPw, acc.pass))) throw new GameError('Kata sandi lama salah.', 401);
    if (newPw.length < 8 || !/[a-z]/i.test(newPw) || !/\d/.test(newPw)) throw new GameError('Kata sandi minimal 8 karakter dan berisi huruf serta angka.');
    acc.pass = await hashSecret(newPw); await this.o.store.saveAccount(acc);
    await this.o.store.deleteSessionsOf(pid);
    return { token: await this.issue(pid, 'sesi'), device: await this.issue(pid, 'perangkat') };
  }

  /** Hapus akun & data pemain (wajib untuk Google Play). Tamu cukup dengan tokennya. */
  async deleteAccount(token: string, password?: string) {
    const pid = await this.playerOf(token); if (!pid) throw new GameError('Silakan masuk dulu.', 401);
    const acc = await this.o.store.getAccount(pid);
    if (acc && !(await checkSecret(String(password ?? ''), acc.pass))) throw new GameError('Kata sandi salah.', 401);
    await this.o.store.deleteSessionsOf(pid);
    if (acc) await this.o.store.deleteAccount(pid);
    if (this.o.players.deletePlayer) await this.o.players.deletePlayer(pid);
    return { deleted: true };
  }
}

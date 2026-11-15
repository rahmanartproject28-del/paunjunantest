// Mancing otomatis: avatar melempar, menyentak, dan adu tarik sendiri di spot tempat pemain berdiri.
// Hasil SELALU ditentukan server: peluang berhasil mengangkat per ukuran ikan diatur pemilik (super admin)
// lewat panel admin (GameConfig.auto). Klien hanya menampilkan animasinya.
//
// Acuan desain (lihat SERAH-TERIMA): AFK fishing Black Desert (boleh, tapi lebih lambat & kurang efisien
// daripada manual), "Automatic fishing" Fishing Clash/Let's Fish (ringkasan hasil di akhir sesi, berhenti saat
// bahan habis), Cast n Chill (mode diam = hadiah sama tapi lebih lambat), IOU RPG (efisiensi luring 50%),
// dan server AFK dengan batas harian supaya tidak ada keunggulan bot.
import { GameError } from './authority';
import type { Player } from './authority';

export interface AutoConfig {
  /** fitur hidup/mati untuk semua pemain */
  on: boolean;
  /** peluang berhasil mengangkat ikan (0–1) per ukuran: kecil, sedang, besar, monster */
  rate: [number, number, number, number];
  /** pengali koin (nilai jual) & XP tangkapan otomatis; 1 = sama dengan manual */
  gainMul: number;
  /** maksimal ikan otomatis per pemain per hari (0 = tanpa batas) */
  maxPerDay: number;
  /** level minimal untuk memakai mancing otomatis */
  minLv: number;
  /** jeda minimal antar tangkapan otomatis (detik) — membuat otomatis lebih lambat dari manual */
  minGap: number;
  /** tangkapan otomatis ikut papan peringkat, turnamen, dan papan acara */
  board: boolean;
  /** tangkapan otomatis dihitung untuk misi harian & lencana */
  missions: boolean;
  /** keranjang penuh: 'stop' = berhenti, 'jual' = ikan langsung dijual */
  full: 'stop' | 'jual';
}

export const DEFAULT_AUTO: AutoConfig = {
  on: true, rate: [0.92, 0.78, 0.55, 0.3], gainMul: 0.7, maxPerDay: 150, minLv: 2, minGap: 12, board: false, missions: true, full: 'stop',
};

/** Bersihkan & batasi masukan admin. Melempar GameError bila tidak masuk akal. */
export function validateAuto(raw: unknown, base: AutoConfig = DEFAULT_AUTO): AutoConfig {
  const r = (raw ?? {}) as Partial<AutoConfig>, c: AutoConfig = { ...base, rate: [...base.rate] as AutoConfig['rate'] };
  const num = (v: unknown, lo: number, hi: number, label: string) => { const x = Number(v); if (!Number.isFinite(x) || x < lo || x > hi) throw new GameError(`${label} harus ${lo}–${hi}.`); return x; };
  if (r.on !== undefined) c.on = !!r.on;
  if (r.rate !== undefined) {
    if (!Array.isArray(r.rate) || r.rate.length !== 4) throw new GameError('Peluang berhasil harus 4 angka (kecil, sedang, besar, monster).');
    c.rate = r.rate.map((x, i) => num(x, 0, 1, 'Peluang ' + ['kecil', 'sedang', 'besar', 'monster'][i])) as AutoConfig['rate'];
  }
  if (r.gainMul !== undefined) c.gainMul = num(r.gainMul, 0, 2, 'Pengali hadiah otomatis');
  if (r.maxPerDay !== undefined) c.maxPerDay = Math.floor(num(r.maxPerDay, 0, 5000, 'Batas harian'));
  if (r.minLv !== undefined) c.minLv = Math.floor(num(r.minLv, 1, 100, 'Level minimal'));
  if (r.minGap !== undefined) c.minGap = num(r.minGap, 0, 600, 'Jeda antar tangkapan');
  if (r.board !== undefined) c.board = !!r.board;
  if (r.missions !== undefined) c.missions = !!r.missions;
  if (r.full !== undefined) { if (r.full !== 'stop' && r.full !== 'jual') throw new GameError('Keranjang penuh: stop atau jual.'); c.full = r.full; }
  return c;
}

/** Kunci hari (zona waktu server, UTC+8 = WITA) untuk batas harian. */
export const autoDay = (now: number) => new Date((now + 8 * 3600) * 1000).toISOString().slice(0, 10);

/** Catatan pemakaian otomatis di data pemain. */
export interface AutoUse { day: string; n: number; tries: number; last: number }

export function autoUse(p: Player, now: number): AutoUse {
  const d = autoDay(now), u = p.autoUse;
  return u && u.day === d ? u : { day: d, n: 0, tries: 0, last: u?.last ?? 0 };
}

/** Boleh mancing otomatis sekarang? `left` = sisa ikan hari ini (Infinity bila tanpa batas). */
export function autoStatus(p: Player, cfg: AutoConfig, lv: number, now: number) {
  const u = autoUse(p, now), left = cfg.maxPerDay > 0 ? Math.max(0, cfg.maxPerDay - u.n) : Infinity;
  let reason = '';
  if (!cfg.on) reason = 'Mancing otomatis sedang dimatikan oleh pengelola.';
  else if (lv < cfg.minLv) reason = `Mancing otomatis terbuka di level ${cfg.minLv}.`;
  else if (left <= 0) reason = `Batas mancing otomatis hari ini (${cfg.maxPerDay} ikan) sudah habis. Besok bisa lagi.`;
  return { allowed: !reason, reason, left, used: u.n, wait: Math.max(0, u.last + cfg.minGap - now) };
}

/** Lempar dadu keberhasilan mengangkat untuk ukuran ikan `tier` (0 kecil … 3 monster). */
export const autoRoll = (cfg: AutoConfig, tier: number, rng: () => number) => rng() < (cfg.rate[Math.max(0, Math.min(3, tier))] ?? 0);

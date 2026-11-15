// Main luring (tanpa jaringan): perangkat mencatat hasil, server memeriksa ulang saat tersambung lagi.
// Server tidak percaya begitu saja: berat harus masuk rentang jenis, jarak antar tangkapan dibatasi,
// jumlah dibatasi umpan yang dimiliki, hadiah dipotong, dan hasil luring tidak masuk papan peringkat/turnamen.
import { SPECIES, SIZE_TIERS, type SpeciesId, type BaitId } from './data';
import { sellPrice, catchXp, fishLengthCm, levelInfo, starsFor } from './rules';
import type { Player, CatchRec } from './authority';

export interface OfflineCatch { id: string; species: SpeciesId; weight: number; at: number; spot: string;
  /** ikan yang sudah ditentukan server tetapi sambungan putus saat diangkat: nomor tarikan server */ hook?: string }
export interface OfflineBatch {
  /** tanda sesi luring: kiriman yang sama (mis. jawaban server hilang di jalan) tidak diproses dua kali */
  sid?: string;
  catches: OfflineCatch[];
  /** umpan yang terpakai selama luring */
  baitUsed: Partial<Record<BaitId, number>>;
  /** ikan di keranjang (dari server) yang dilepas saat luring */
  released?: string[];
}
export const OFFLINE = {
  /** jarak paling cepat antar tangkapan (detik) */ minGap: 20,
  /** paling banyak tangkapan per sinkron */ maxPerSync: 150,
  /** hasil luring lebih tua dari ini ditolak (detik) */ maxAge: 7 * 86400,
  /** koin & XP hasil luring = 50% */ gainMul: 0.5,
};
export interface OfflineResult { accepted: CatchRec[]; rejected: number; xp: number; coins: number; levelUp: boolean }

/** Ukuran (0..1) dan kelas ukuran dari berat — dihitung server, bukan dikirim perangkat. */
export function sizeOf(k: SpeciesId, weight: number) {
  const [lo, hi] = SPECIES[k].w, t = Math.min(1, Math.max(0, (weight - lo) / (hi - lo || 1)));
  let tier = SIZE_TIERS.findIndex(T => t >= T.lo && t < T.hi); if (tier < 0) tier = SIZE_TIERS.length - 1;
  return { t, tier };
}

/** Terapkan hasil luring ke pemain (mengubah `p`). */
export function applyOffline(p: Player, batch: OfflineBatch, now: number, basketSize: number, priceMul = 1, xpMul = 1): OfflineResult {
  if (batch?.sid && p.offlineSid === String(batch.sid)) return { accepted: [], rejected: 0, xp: 0, coins: 0, levelUp: false };
  if (batch?.sid) p.offlineSid = String(batch.sid).slice(0, 40);
  const list = (Array.isArray(batch?.catches) ? batch.catches : []).filter(c => c && typeof c.at === 'number').sort((a, b) => a.at - b.at);
  const used = batch?.baitUsed ?? {};
  // umpan: yang dipotong tidak bisa melebihi yang dimiliki; tiap tangkapan butuh minimal 1 umpan
  let budget = 0;
  for (const b of Object.keys(used) as BaitId[]) {
    const n = Math.max(0, Math.min(Math.floor(Number(used[b]) || 0), p.bait[b] ?? 0));
    if (n > 0) { p.bait[b] = (p.bait[b] ?? 0) - n; budget += n; }
  }
  // ikan keranjang yang dilepas saat luring
  const rel = new Set((batch?.released ?? []).map(String));
  if (rel.size) p.basket = p.basket.filter(c => !rel.has(c.id));
  const out: OfflineResult = { accepted: [], rejected: 0, xp: 0, coins: 0, levelUp: false };
  const lvBefore = levelInfo(p.xp).lv, seen = new Set<string>();
  let last = p.offlineAt ?? 0;
  for (const c of list) {
    const sp = SPECIES[c.species as SpeciesId];
    const okay = sp && typeof c.weight === 'number' && c.weight >= sp.w[0] && c.weight <= sp.w[1]
      && c.at <= now + 60 && c.at >= now - OFFLINE.maxAge && c.at - last >= OFFLINE.minGap
      && out.accepted.length < Math.min(OFFLINE.maxPerSync, budget) && !seen.has(String(c.id));
    if (!okay) { out.rejected++; continue; }
    seen.add(String(c.id)); last = c.at;
    const w = Math.round(c.weight * 100) / 100, { t, tier } = sizeOf(c.species, w);
    const rec: CatchRec = {
      id: 'off_' + Math.round(c.at) + '_' + out.accepted.length, species: c.species, name: sp.name, weight: w, length: fishLengthCm(c.species, w),
      tier, stars: starsFor(t), spot: String(c.spot).slice(0, 12), at: c.at,
      value: Math.max(1, Math.round(sellPrice(c.species, w, tier) * priceMul * OFFLINE.gainMul)),
    };
    const xp = Math.max(1, Math.round(catchXp(w, tier) * xpMul * OFFLINE.gainMul));
    p.xp += xp; out.xp += xp;
    const key = rec.spot + ':' + c.species; if (p.best[key] === undefined || w > p.best[key]) p.best[key] = w;
    p.album[c.species] = Math.max(p.album[c.species] ?? 0, w);
    p.stats.catches++; p.stats.totalKg = Math.round((p.stats.totalKg + w) * 100) / 100; p.stats.heaviest = Math.max(p.stats.heaviest, w);
    // keranjang penuh: langsung dijual
    if (p.basket.length < basketSize) p.basket.push(rec); else { p.coins += rec.value; out.coins += rec.value; }
    out.accepted.push(rec);
  }
  if (out.accepted.length) p.offlineAt = last;
  out.levelUp = levelInfo(p.xp).lv > lvBefore;
  return out;
}

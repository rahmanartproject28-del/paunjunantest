// Progres pemain: misi harian, hadiah masuk harian beruntun, dan lencana (pencapaian).
// Aturan dijalankan di server (dan mode lokal) — HP hanya menampilkan.
import { DEFAULT_SPOTS, SPECIES, type SpeciesId } from './data';
import { GameError, type Player, type CatchRec } from './authority';
import { levelInfo } from './rules';
import { dayKey } from './social';

// ===================== Misi harian =====================
export type MissionKind = 'count' | 'species' | 'kg' | 'big';
/** Permata yang didapat: per misi, bonus tiga misi, hari ke-7 beruntun, per lencana. */
export const GEMS = { mission: 2, allMissions: 5, daily7: 10, badge: 5 } as const;

export interface Mission { id: string; kind: MissionKind; target: number; progress: number; reward: number; xp: number; species?: SpeciesId; claimed?: boolean }
export interface MissionBoard { day: string; list: Mission[] }

/** Teks misi untuk ditampilkan. */
export function missionText(m: Mission) {
  switch (m.kind) {
    case 'count': return `Tangkap ${m.target} ikan apa saja`;
    case 'species': return `Tangkap ${m.target} ${SPECIES[m.species!]?.name ?? m.species}`;
    case 'kg': return `Kumpulkan total ${m.target} kg ikan`;
    case 'big': return `Tangkap ${m.target} ikan ukuran Besar atau Monster`;
  }
}

function hash32(s: string) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rngFrom(seed: number) { let s = seed || 1; return () => ((s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)) >>> 0) / 4294967296; }

/** Jenis ikan yang bisa ditangkap pada level ini, dengan bobot kelangkaan dari stok spot. */
function reachableSpecies(lv: number) {
  const w = new Map<SpeciesId, number>();
  for (const s of DEFAULT_SPOTS) if ((s.recLv ?? s.minLv) <= lv) for (const [k, n] of Object.entries(s.stock)) w.set(k as SpeciesId, (w.get(k as SpeciesId) ?? 0) + (n ?? 0));
  return [...w.entries()].filter(([, n]) => n > 0);
}

/** Tiga misi hari ini — sama di server & HP untuk pemain dan tanggal yang sama. */
export function makeMissions(pid: string, day: string, lv: number): MissionBoard {
  const r = rngFrom(hash32(pid + '|' + day));
  const kinds: MissionKind[] = ['count', 'species', 'kg', 'big'];
  for (let i = kinds.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [kinds[i], kinds[j]] = [kinds[j], kinds[i]]; }
  const list: Mission[] = kinds.slice(0, 3).map((kind, i) => {
    const tier = Math.floor(r() * 3); // 0 mudah, 1 sedang, 2 sulit
    const base = { id: `${day}-${i}`, kind, progress: 0 } as const;
    if (kind === 'count') return { ...base, target: [5, 8, 12][tier], reward: [60, 90, 140][tier], xp: [20, 30, 45][tier] };
    if (kind === 'kg') { const t = [5, 10, 20][tier] * (lv >= 15 ? 4 : lv >= 10 ? 2 : 1); return { ...base, target: t, reward: [70, 110, 180][tier], xp: [25, 35, 55][tier] }; }
    if (kind === 'big') return { ...base, target: tier === 2 ? 2 : 1, reward: tier === 2 ? 220 : 120, xp: tier === 2 ? 70 : 40 };
    const pool = reachableSpecies(lv), total = pool.reduce((a, [, n]) => a + n, 0);
    const [sp, n] = pool.length ? (() => { let x = r() * total; for (const e of pool) { x -= e[1]; if (x <= 0) return e; } return pool[0]; })() : ['nila' as SpeciesId, 10];
    const rare = n / Math.max(1, total) < 0.06;
    return { ...base, species: sp, target: rare ? 1 : [2, 3, 4][tier], reward: rare ? 200 : [80, 110, 150][tier], xp: rare ? 60 : [25, 35, 50][tier] };
  });
  return { day, list };
}

// ===================== Hadiah harian =====================
export const DAILY_REWARDS = [50, 75, 100, 150, 200, 300, 500];
export const DAILY_BONUS_BAIT = { bait: 'racik' as const, n: 5 }; // hari ke-7

// ===================== Lencana =====================
export interface Badge { id: string; name: string; desc: string; icon: string; reward: number; test: (p: Player) => boolean }
const has = (p: Player, ks: SpeciesId[]) => ks.every(k => (p.album?.[k] ?? 0) > 0);
export const BADGES: Badge[] = [
  { id: 'pertama', name: 'Strike Pertama', desc: 'Tangkap ikan pertamamu', icon: '🎣', reward: 50, test: p => p.stats.catches >= 1 },
  { id: 'ikan100', name: 'Pemancing Rajin', desc: 'Tangkap 100 ikan', icon: '🐟', reward: 300, test: p => p.stats.catches >= 100 },
  { id: 'ikan1000', name: 'Legenda Keramba', desc: 'Tangkap 1.000 ikan', icon: '🏅', reward: 1500, test: p => p.stats.catches >= 1000 },
  { id: 'kg100', name: 'Seratus Kilo', desc: 'Total tangkapan 100 kg', icon: '⚖️', reward: 300, test: p => p.stats.totalKg >= 100 },
  { id: 'kg1000', name: 'Satu Ton', desc: 'Total tangkapan 1.000 kg', icon: '🏋️', reward: 1500, test: p => p.stats.totalKg >= 1000 },
  { id: 'besar10', name: 'Sepuluh Kilo', desc: 'Satu ikan seberat 10 kg atau lebih', icon: '💪', reward: 400, test: p => p.stats.heaviest >= 10 },
  { id: 'monster', name: 'Pemburu Monster', desc: 'Tangkap ikan ukuran Monster', icon: '👹', reward: 500, test: p => (p.feats?.monsters ?? 0) >= 1 },
  { id: 'monster10', name: 'Penakluk Monster', desc: 'Tangkap 10 ikan Monster', icon: '🐉', reward: 1500, test: p => (p.feats?.monsters ?? 0) >= 10 },
  { id: 'koleksi_danau', name: 'Kolektor Danau', desc: 'Tangkap semua jenis ikan Danau Keramba', icon: '🏞️', reward: 800, test: p => has(p, ['nila', 'mujair', 'mas', 'patin', 'gabus', 'baung', 'toman']) },
  { id: 'koleksi_sungai', name: 'Kolektor Sungai', desc: 'Belida, Jelawat, dan Semah', icon: '🌊', reward: 800, test: p => has(p, ['belida', 'jelawat', 'semah']) },
  { id: 'koleksi_pantai', name: 'Kolektor Pantai', desc: 'Kakap Merah, Kerapu, dan Baronang', icon: '🏝️', reward: 800, test: p => has(p, ['kakap', 'kerapu', 'baronang']) },
  { id: 'koleksi_laut', name: 'Kolektor Laut', desc: 'Tongkol, Tuna, dan Marlin', icon: '🚤', reward: 1200, test: p => has(p, ['tongkol', 'tuna', 'marlin']) },
  { id: 'raja_laut', name: 'Raja Laut', desc: 'Taklukkan Marlin Biru', icon: '🔱', reward: 1000, test: p => (p.album?.marlin ?? 0) > 0 },
  { id: 'penjelajah', name: 'Penjelajah', desc: 'Memancing di keempat lokasi', icon: '🧭', reward: 1000, test: p => (p.feats?.locs?.length ?? 0) >= 4 },
  { id: 'lv10', name: 'Pemancing Andal', desc: 'Capai level 10', icon: '⭐', reward: 500, test: p => levelInfo(p.xp).lv >= 10 },
  { id: 'lv20', name: 'Master Pancing', desc: 'Capai level 20', icon: '🌟', reward: 1500, test: p => levelInfo(p.xp).lv >= 20 },
  { id: 'beruntun7', name: 'Setia Tiap Hari', desc: 'Ambil hadiah harian 7 hari beruntun', icon: '📅', reward: 700, test: p => (p.daily?.streak ?? 0) >= 7 },
];

/** Tandai lencana baru yang syaratnya terpenuhi. Mengembalikan id lencana yang baru didapat. */
export function checkBadges(p: Player) {
  p.badges = p.badges ?? {};
  const fresh: string[] = [];
  for (const b of BADGES) if (!p.badges[b.id] && b.test(p)) { p.badges[b.id] = 'baru'; fresh.push(b.id); }
  return fresh;
}

/** Perbarui progres setelah satu tangkapan sah (dipanggil Social.onCatch). */
export function applyCatch(p: Player, c: CatchRec, now: number) {
  p.feats = p.feats ?? { monsters: 0, locs: [] };
  if (c.tier >= 3) p.feats.monsters++;
  const loc = DEFAULT_SPOTS.find(s => s.id === c.spot)?.loc;
  if (loc && !p.feats.locs.includes(loc)) p.feats.locs.push(loc);
  const board = ensureMissions(p, now);
  const done: Mission[] = [];
  for (const m of board.list) {
    if (m.claimed || m.progress >= m.target) continue;
    const add = m.kind === 'count' ? 1 : m.kind === 'kg' ? c.weight : m.kind === 'big' ? (c.tier >= 2 ? 1 : 0) : (c.species === m.species ? 1 : 0);
    if (!add) continue;
    m.progress = Math.min(m.target, Math.round((m.progress + add) * 100) / 100);
    if (m.progress >= m.target) done.push(m);
  }
  return { done, badges: checkBadges(p) };
}

export function ensureMissions(p: Player, now: number): MissionBoard {
  const day = dayKey(now);
  if (!p.missions || p.missions.day !== day) p.missions = makeMissions(p.id, day, levelInfo(p.xp).lv);
  return p.missions;
}

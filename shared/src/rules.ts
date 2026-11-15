// Aturan permainan murni (tanpa penyimpanan). Sama persis di server dan di mode lokal.
import {
  SPECIES, SPECIES_IDS, SIZE_TIERS, DEFAULT_TIER_WEIGHTS, WEATHER, BAITS, SUB_MUL,
  type SpeciesId, type Zone, type SubZone, type WeatherId, type BaitId,
} from './data';

export type Rng = () => number;

export const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

/** Generator acak yang bisa diulang (untuk uji & simulasi). */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface RateSettings { rate: number; tiers: number[] }
export type RateTable = Partial<Record<SpeciesId, Partial<RateSettings>>>;

export const baitMul = (b: BaitId, k: SpeciesId) => (BAITS[b].all ? 1 : BAITS[b].mul[k] ?? 1);

/**
 * Peluang tiap jenis menyambar = stok spot × cuaca × umpan × pengali jenis (admin) × sub-zona.
 * Mengembalikan daftar [jenis, bobot] dan totalnya.
 */
export function spotRates(
  stock: Partial<Record<SpeciesId, number>>, zone: Zone | '', sub: SubZone | '',
  weather: WeatherId, bait: BaitId, table: RateTable = {},
): { rates: [SpeciesId, number][]; total: number } {
  const rates: [SpeciesId, number][] = [];
  let total = 0;
  for (const k of SPECIES_IDS) {
    const sp = SPECIES[k];
    if (zone && !sp.zones.includes(zone)) continue;
    const st = stock[k] ?? 0;
    if (st <= 0) continue;
    const r = st * WEATHER[weather].mul * baitMul(bait, k) * (table[k]?.rate ?? 1) * ((sub && SUB_MUL[sub]?.[k]) || 1);
    if (r <= 0) continue;
    rates.push([k, r]);
    total += r;
  }
  return { rates, total };
}

/** Aktivitas spot untuk ditampilkan (tanpa membocorkan angka stok). */
export function activityLevel(total: number): 'sepi' | 'sedang' | 'ramai' {
  return total < 25 ? 'sepi' : total < 60 ? 'sedang' : 'ramai';
}

/** Detik menunggu sampai ikan menyambar, atau null bila tidak ada yang menyambar dalam 90 detik. */
export function biteDelay(total: number, rng: Rng): number | null {
  if (total <= 0) return null;
  const p = 1 - Math.exp(-total * 0.0045);
  const wait = Math.log(Math.max(1e-9, rng())) / Math.log(1 - p);
  if (wait > 90) return null;
  return 4.5 + rng() * 2.0 + wait; // 4,5 dtk: umpan tenggelam & pelampung berdiri
}

export function pickWeighted<T>(items: [T, number][], rng: Rng): T {
  const total = items.reduce((a, [, w]) => a + Math.max(0, w), 0);
  let x = rng() * total;
  for (const [k, w] of items) { x -= Math.max(0, w); if (x <= 0) return k; }
  return items[items.length - 1][0];
}

export function pickTier(k: SpeciesId, rng: Rng, table: RateTable = {}): number {
  const w = table[k]?.tiers ?? DEFAULT_TIER_WEIGHTS;
  return pickWeighted(w.map((x, i) => [i, x] as [number, number]), rng);
}

/** Memilih ukuran: tingkat (kecil..monster), posisi relatif t (0..1) dan berat (kg). */
export function pickSize(k: SpeciesId, rng: Rng, table: RateTable = {}) {
  const tier = pickTier(k, rng, table), T = SIZE_TIERS[tier];
  const t = T.lo + (T.hi - T.lo) * rng();
  const sp = SPECIES[k];
  const weight = Math.round((sp.w[0] + (sp.w[1] - sp.w[0]) * t) * 100) / 100;
  return { tier, t, weight };
}

/** Kekuatan tarikan ikan (dipakai simulasi adu tarik). */
export function fightStrength(k: SpeciesId, weight: number, t: number, tier: number): number {
  const sp = SPECIES[k];
  if (weight < 2) return sp.str * (0.42 + 0.18 * weight / 2);
  // sampai 16 kg sama seperti dulu; ikan laut raksasa naik lebih landai supaya tetap bisa ditarik dengan joran laut
  const wk = weight <= 16 ? 1 + (weight - 2) * 0.07 : 1.98 + (weight - 16) * 0.006;
  return sp.str * (0.8 + 0.5 * t) * wk + (tier === 3 ? 0.18 : 0);
}

/** Adu tarik minimal (detik) sebelum ikan boleh diangkat, untuk mencegah kecurangan. */
export const minFightSeconds = (weight: number) => 2 + Math.min(weight, 20) * 1.2 + Math.max(0, weight - 20) * 0.25;

export const fishLengthCm = (k: SpeciesId, weight: number) => Math.round(SPECIES[k].lenK * Math.cbrt(weight));

export function sellPrice(k: SpeciesId, weight: number, tier: number) {
  return Math.max(2, Math.round(SPECIES[k].pricePerKg * weight * (1 + tier * 0.15)));
}

export const catchXp = (weight: number, tier: number) => Math.round(8 + weight * 6 + tier * 6);

export function levelInfo(xp: number) {
  const lv = Math.floor(Math.sqrt((xp || 0) / 50)) + 1;
  const cur = 50 * (lv - 1) * (lv - 1), nxt = 50 * lv * lv;
  return { lv, cur, nxt, pct: ((xp || 0) - cur) / (nxt - cur) };
}

/** Bintang (1–5) dari posisi ukuran. */
export const starsFor = (t: number) => clamp(Math.ceil(t * 5), 1, 5);

/** Jendela waktu menyentak relatif terhadap saat pelampung tenggelam. */
export const HOOK_EARLY = 0.4;
export const HOOK_LATE = 3.25;

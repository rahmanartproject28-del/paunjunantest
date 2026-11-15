// Tata letak Danau Keramba: bentuk danau, tinggi tanah, dan posisi spot.
import * as THREE from 'three';

export const LAKE = { cx: 0, cz: -52, rx: 88, rz: 62, p: 2.4 };
export const WATER_Y = 0;

// ===================== Lokasi aktif =====================
// Danau Keramba (asli), Sungai Deras, Pantai Karang, Laut Dalam. Dipilih lewat ?loc= atau simpanan 'pj_loc'.
export type LocId = 'serene' | 'danau' | 'sungai' | 'pantai' | 'laut';
const LOC_IDS: LocId[] = ['serene', 'danau', 'sungai', 'pantai', 'laut'];
function detectLoc(): LocId {
  try {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('loc') : null;
    if (q && LOC_IDS.includes(q as LocId)) return q as LocId;
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem('pj_loc') : null;
    const j = v ? JSON.parse(v) : null; if (LOC_IDS.includes(j)) return j;
  } catch { /* abaikan */ }
  return (globalThis as { __PJ_LOC?: LocId }).__PJ_LOC ?? 'serene';
}
export const LOC: LocId = detectLoc();
export const IS_DANAU = LOC === 'danau';
/** Danau Serene: danau pegunungan jernih (tampilan utama). */
export const IS_SERENE = LOC === 'serene';
// batas dunia tiap lokasi (untuk bidang air, peta, burung)
if (LOC === 'sungai') Object.assign(LAKE, { cx: 0, cz: -40, rx: 330, rz: 110 });
if (LOC === 'pantai') Object.assign(LAKE, { cx: 0, cz: -70, rx: 300, rz: 150 });
if (LOC === 'laut') Object.assign(LAKE, { cx: 0, cz: 0, rx: 380, rz: 380 });
if (LOC === 'serene') Object.assign(LAKE, { cx: 25, cz: -170, rx: 140, rz: 185, p: 2.3 });
/** Serene: garis tepi kiri danau (x per z) — tepi berbatu dekat dermaga yang menjauh sampai belakang pondok. */
const SHORE_L: [number, number][] = [[40, -9], [6, -10], [-8, -11], [-16, -7.5], [-24, -5], [-34, -11], [-55, -22], [-80, -30], [-120, -50], [-170, -78], [-230, -100]];
export function shoreLX(z: number) {
  let x = SHORE_L[SHORE_L.length - 1][1];
  for (let i = 0; i < SHORE_L.length - 1; i++) { const [z0, x0] = SHORE_L[i], [z1, x1] = SHORE_L[i + 1]; if (z <= z0 && z >= z1) { const t = (z0 - z) / (z0 - z1); x = x0 + (x1 - x0) * t * t * (3 - 2 * t) + (x1 - x0) * 0 ; break; } }
  if (z > SHORE_L[0][0]) x = SHORE_L[0][1];
  return x + 2.2 * Math.sin(z * 0.11) + 1.4 * Math.sin(z * 0.27 + 1);
}
/** Serene: dermaga kayu pemain, pondok panggung (lantai teras) & badan pondok, air terjun di seberang. */
export const SDOCK = { x: 0, z0: -12.5, z1: 6, w: 4.6, y: 0.78 };
export const LODGE = { x: -4, z: -66, w: 13, d: 10, y: 1.75, body: { x: -5.5, z: -64.5, w: 7.6, d: 6 } };
export const FALLS = { x: 112, z: -330 };
export const CLEARING = { x: 0, z: 12, r: 8, y: 0.74 };
/** Sungai: garis tengah & setengah lebar (m). */
export const rivC = (x: number) => -40 + 18 * Math.sin(x * 0.018) + 6 * Math.sin(x * 0.05 + 1);
export const rivW = (x: number) => 16 + 5 * Math.sin(x * 0.011 + 2);
/** Arus sungai (m/dtk) searah +X. */
export const FLOW = LOC === 'sungai' ? { x: 1.3, z: 0 } : LOC === 'laut' ? { x: 0.25, z: 0.12 } : LOC === 'pantai' ? { x: 0, z: 0.18 } : { x: 0, z: 0 };
/** Pantai: garis pantai (z) — laut di z lebih kecil. */
export const shoreZ = (x: number) => 10 + 6 * Math.sin(x * 0.02) + 3 * Math.sin(x * 0.07 + 0.5);
/** Karang menjorok ke laut (bisa dipijak). */
export const REEF = { a: { x: -45, z: shoreZ(-45) - 1 }, b: { x: -60, z: shoreZ(-45) - 46 }, w: 4.2 };
/** Laut: pulau-pulau di kejauhan. */
export const ISLANDS = [{ x: -230, z: -250, r: 60 }, { x: 250, z: -300, r: 85 }, { x: -360, z: 60, r: 45 }, { x: 190, z: 240, r: 55 }];
function segD(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const abx = b.x - a.x, abz = b.z - a.z, t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / (abx * abx + abz * abz)));
  return Math.hypot(x - a.x - abx * t, z - a.z - abz * t);
}

// derau nilai sederhana (deterministik)
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, z: number, oct = 4) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, z * f); f *= 2.03; amp *= 0.5; }
  return s;
}

/** Jarak ternormalisasi ke air (< 1 = air, 1 = garis pantai, > 1 = darat makin jauh). */
export function lakeE(x: number, z: number) {
  if (LOC === 'sungai') return Math.abs(z - rivC(x)) / rivW(x);
  if (LOC === 'pantai') return 1 + (z - shoreZ(x)) / 30;
  if (LOC === 'laut') { let e = 0.2; for (const i of ISLANDS) e = Math.max(e, 2 - Math.hypot(x - i.x, z - i.z) / i.r); return e; }
  if (LOC === 'serene') return Math.max(lakeE0(x, z), 1 + (shoreLX(z) - x) / 30);
  return lakeE0(x, z);
}
function lakeE0(x: number, z: number) {
  const dx = x - LAKE.cx, dz = z - LAKE.cz;
  const th = Math.atan2(dz, dx);
  const wob = 1 + 0.07 * Math.sin(3 * th + 0.6) + 0.045 * Math.sin(5 * th + 2.1) + 0.03 * Math.sin(9 * th);
  const e = Math.pow(Math.pow(Math.abs(dx) / (LAKE.rx * wob), LAKE.p) + Math.pow(Math.abs(dz) / (LAKE.rz * wob), LAKE.p), 1 / LAKE.p);
  return e;
}

const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Halaman darat di pintu masuk (gapura, loket, Warung Pancing). Tanah di sini diratakan. */
export const YARD = { x0: -13, x1: 13, z0: 12, z1: 36, soft: 6 };
const OFF = IS_DANAU ? 0 : 1e6; // bangunan halaman hanya ada di Danau Keramba
export const GATE = { x: 0 + OFF, z: 33 + OFF };            // gapura masuk, pemain datang dari +Z
export const LOKET = { x: 5.2 + OFF, z: 29.5 + OFF };        // loket tiket
export const WARUNG = { x: -6.5 + OFF, z: 19 + OFF };        // kios Warung Pancing
export const AQUA = { x: 8.5 + OFF, z: 20.5 + OFF, w: 2.6, d: 1.0 }; // akuarium pribadi (tangki kaca)
export const ENTRY = { x: 0, z: 30.5, yaw: 0 };  // titik mulai pemain (menghadap danau)
/** Kios umpan di lapangan Danau Serene (muka kios menghadap +X, ke jalan dermaga). */
export const SKIOSK = { x: -5.6, z: 15.2 };
/** Kios warung per lokasi: titik pembeli (tombol "Masuk warung") dan posisi & arah penjaga. null = tidak ada kios. */
export const SHOP: { x: number; z: number; r: number; keeper: { x: number; z: number; yaw: number }; name: string } | null =
  IS_DANAU ? { x: WARUNG.x + 2.4, z: WARUNG.z, r: 3.2, keeper: { x: WARUNG.x + 0.3, z: WARUNG.z + 0.5, yaw: -Math.PI / 2 }, name: 'Pak Darto' }
  : LOC === 'serene' ? { x: SKIOSK.x + 2.3, z: SKIOSK.z, r: 3.0, keeper: { x: SKIOSK.x + 0.25, z: SKIOSK.z + 0.35, yaw: -Math.PI / 2 }, name: 'Bu Ratna' }
  : null;
let yardH = 0.9;
function yardMask(x: number, z: number) {
  if (!IS_DANAU) return 0;
  const { x0, x1, z0, z1, soft } = YARD;
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  return 1 - sstep(0, soft, Math.hypot(dx, dz));
}

/** Tinggi tanah (m). Di dalam danau bernilai negatif (dasar danau). */
export function groundH(x: number, z: number) {
  if (!IS_DANAU) return locGround(x, z);
  const g = rawGroundH(x, z);
  if (lakeE(x, z) < 1) return g;
  const k = yardMask(x, z);
  return k > 0 ? g + (yardH - g) * k : g;
}
function rawGroundH(x: number, z: number) {
  const e = lakeE(x, z) + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 0.05;
  if (e < 1) {
    const t = (1 - e);
    return -0.25 - 7.5 * Math.pow(Math.min(1, t * 2.4), 0.9) + (fbm(x * 0.08, z * 0.08, 2) - 0.5) * 0.6;
  }
  const o = e - 1;
  const bank = 0.35 + o * 9 * (1 - sstep(0.15, 0.6, o) * 0.55);                // tepian landai
  const hills = sstep(0.25, 1.4, o) * Math.max(0, fbm(x * 0.018 + 3, z * 0.018 - 7, 4) * 18 - 5);
  const ridge = sstep(2.6, 4.6, o) * (0.3 + (1 - Math.abs(fbm(x * 0.005, z * 0.005, 4) * 2 - 1))) * 42;
  const bumps = (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 1.2 * sstep(0.02, 0.3, o);
  return Math.max(0.12, bank + hills + ridge + bumps) * sstep(0, 0.05, o) + (-0.25) * (1 - sstep(0, 0.05, o));
}

yardH = rawGroundH(0, 14.5);

/** Tinggi tanah lokasi selain danau. */
function locGround(x: number, z: number): number {
  if (LOC === 'serene') return sereneGround(x, z);
  if (LOC === 'sungai') {
    const e = lakeE(x, z) + (fbm(x * 0.03, z * 0.03, 3) - 0.5) * 0.06;
    if (e < 1) { const t = 1 - e; return -0.3 - 3.4 * Math.pow(Math.min(1, t * 1.6), 0.8) + (fbm(x * 0.1, z * 0.1, 2) - 0.5) * 0.8; }
    const oM = (e - 1) * rivW(x); // meter dari tepi
    const bank = 0.4 + Math.min(oM, 12) * 0.16 + Math.max(0, oM - 12) * 0.3;           // tebing lembah
    const hills = sstep(10, 70, oM) * Math.max(0, fbm(x * 0.018 + 3, z * 0.018 - 7, 4) * 30 - 7);
    const bumps = (fbm(x * 0.09, z * 0.09, 3) - 0.5) * 1.3 * sstep(0.5, 5, oM);
    return Math.max(0.15, bank + hills + bumps) * sstep(0, 0.6, oM) + (-0.3) * (1 - sstep(0, 0.6, oM));
  }
  if (LOC === 'pantai') {
    const dz = z - shoreZ(x) + (fbm(x * 0.04, z * 0.04, 2) - 0.5) * 1.5;
    let h: number;
    if (dz < 0) h = -0.2 - Math.min(11, -dz * 0.14) + (fbm(x * 0.06, z * 0.06, 2) - 0.5) * 0.8;
    else {
      const beach = Math.min(dz, 18) * 0.07, dune = sstep(15, 40, dz) * (1.2 + fbm(x * 0.03, z * 0.03, 3) * 3);
      const hills = sstep(40, 170, dz) * Math.max(0, fbm(x * 0.012 + 5, z * 0.012, 4) * 34 - 8);
      h = Math.max(0.12, 0.15 + beach + dune + hills) * sstep(0, 0.8, dz) + (-0.2) * (1 - sstep(0, 0.8, dz));
    }
    const d = segD(x, z, REEF.a, REEF.b);
    if (d < REEF.w) { const k = 1 - d / REEF.w, top = 0.95 + (fbm(x * 0.35, z * 0.35, 2) - 0.5) * 0.5; h = Math.max(h, -0.8 + (top + 0.8) * Math.pow(k, 0.45)); }
    return h;
  }
  // laut: dasar laut dalam + pulau
  let best = -1e9;
  for (const i of ISLANDS) {
    const L = i.r - Math.hypot(x - i.x, z - i.z);
    const h = L > 0 ? 0.2 + Math.min(L, 15) * 0.12 + sstep(10, i.r, L) * fbm(x * 0.02, z * 0.02, 3) * 30 : -2 - Math.min(45, -L * 0.5);
    if (h > best) best = h;
  }
  return best + (fbm(x * 0.05, z * 0.05, 2) - 0.5) * 0.5;
}

/** Danau Serene: dasar berpasir-berbatu yang landai (air jernih), tepi berbatu, bukit berhutan pinus, tebing air terjun. */
function sereneGround(x: number, z: number): number {
  const e = lakeE(x, z) + (fbm(x * 0.035, z * 0.035, 3) - 0.5) * 0.04;
  let h: number;
  if (e < 1) {
    const t = 1 - e;
    h = -0.2 - 8 * Math.pow(Math.min(1, t * 2.6), 0.95) + (fbm(x * 0.09, z * 0.09, 2) - 0.5) * 0.5;
  } else {
    const o = e - 1;
    const bank = 0.3 + Math.min(o, 0.08) * 7 + Math.max(0, o - 0.08) * 4;
    const hills = sstep(0.06, 0.9, o) * Math.max(0, fbm(x * 0.016 + 3, z * 0.016 - 7, 4) * 70 - 12);
    const bumps = (fbm(x * 0.12, z * 0.12, 3) - 0.5) * 1.4 * sstep(0.01, 0.12, o);
    h = Math.max(0.12, bank + hills + bumps) * sstep(0, 0.03, o) + (-0.2) * (1 - sstep(0, 0.03, o));
    // tebing air terjun di seberang danau
    const dF = Math.hypot((x - FALLS.x) * 0.5, z - FALLS.z - 24);
    h += (20 * (1 - sstep(12, 20, dF)) + 9 * (1 - sstep(18, 56, dF))) * sstep(0, 0.02, o);
  }
  // pelataran rata di pangkal dermaga
  const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z), k = 1 - sstep(CLEARING.r, CLEARING.r + 7, dc);
  if (k > 0 && e > 1.0) h = h + (CLEARING.y - h) * k * sstep(1.0, 1.02, e);
  return h;
}

/** Titik acak di sekitar tepi air untuk penempatan vegetasi/batu. a: 0..2π, e: jarak relatif (1 = tepi). */
export function shoreXZ(a: number, e: number): { x: number; z: number } {
  if (LOC === 'sungai') { const t = a / (Math.PI * 2), side = t < 0.5 ? 1 : -1, x = LAKE.cx + (((t * 2) % 1) * 2 - 1) * LAKE.rx; return { x, z: rivC(x) + side * rivW(x) * e }; }
  if (LOC === 'pantai') { const x = LAKE.cx + (a / Math.PI - 1) * LAKE.rx; return { x, z: shoreZ(x) + (e - 1) * 30 }; }
  if (LOC === 'laut') { const i = ISLANDS[Math.floor((a / (Math.PI * 2)) * ISLANDS.length) % ISLANDS.length], b = (a * 7.31) % (Math.PI * 2), d = (2 - e) * i.r; return { x: i.x + Math.cos(b) * d, z: i.z + Math.sin(b) * d }; }
  if (LOC === 'serene') return { x: LAKE.cx + Math.cos(a) * LAKE.rx * e, z: LAKE.cz + Math.sin(a) * LAKE.rz * e };
  return { x: Math.cos(a) * 88 * e, z: -52 + Math.sin(a) * 62 * e };
}
/** Arah (yaw XZ) menuju air terdekat dari (x,z): dipakai memutar palem ke arah air. */
export function toWaterAngle(x: number, z: number) {
  const d = 2, gx = lakeE(x + d, z) - lakeE(x - d, z), gz = lakeE(x, z + d) - lakeE(x, z - d);
  return Math.atan2(-gz, -gx);
}

export interface SpotPlace { id: string; pos: THREE.Vector3; yaw: number; deck: number; label: string }
// yaw: arah hadap pemain (0 = menghadap -Z / ke utara)
const V3 = (x: number, z: number) => new THREE.Vector3(x, 0, z);
/** Titik jembatan gantung sungai & dermaga nelayan pantai (dipakai spot, area pijak, dan props). */
export const SUNGAI_BRIDGE_X = 5, PIER = { x: 60, w: 3.2, z0: shoreZ(60) + 10, z1: shoreZ(60) - 42, y: 0.95 };
export const BOAT = { x: 0, z: 0, w: 4.4, l: 18, y: 1.15 };
export const SPOT_PLACES: SpotPlace[] = LOC === 'serene' ? [
  { id: 'D1', pos: V3(0.9, SDOCK.z0 + 1.4), yaw: -0.25, deck: SDOCK.y, label: 'Dermaga Serene D1' },
  { id: 'D2', pos: V3(LODGE.x + LODGE.w / 2 - 1.0, LODGE.z - LODGE.d / 2 + 1.0), yaw: -0.75, deck: LODGE.y, label: 'Pondok Panggung D2' },
  { id: 'D3', pos: V3(-16, -12), yaw: -0.9, deck: 0, label: 'Tepi Batu D3' },
] : LOC === 'sungai' ? [
  { id: 'S1', pos: V3(-30, rivC(-30) + rivW(-30) - 0.3), yaw: 0, deck: 1.15, label: 'Batu Besar S1' },
  { id: 'S2', pos: V3(40, rivC(40) + rivW(40) + 1.4), yaw: 0.25, deck: 0, label: 'Pusaran Tikungan S2' },
  { id: 'S3', pos: V3(SUNGAI_BRIDGE_X, rivC(SUNGAI_BRIDGE_X)), yaw: -Math.PI / 2, deck: 3.2, label: 'Jembatan Gantung S3' },
] : LOC === 'pantai' ? [
  { id: 'P1', pos: V3(REEF.b.x + (REEF.a.x - REEF.b.x) * 0.06, REEF.b.z + (REEF.a.z - REEF.b.z) * 0.06), yaw: 0.3, deck: 0, label: 'Ujung Karang P1' },
  { id: 'P2', pos: V3(20, shoreZ(20) + 1.2), yaw: 0, deck: 0, label: 'Pantai Pasir P2' },
  { id: 'P3', pos: V3(PIER.x, PIER.z1 + 0.8), yaw: 0, deck: PIER.y, label: 'Dermaga Nelayan P3' },
] : LOC === 'laut' ? [
  { id: 'L1', pos: V3(BOAT.x, BOAT.z - BOAT.l / 2 + 1.2), yaw: 0, deck: BOAT.y, label: 'Haluan Kapal L1' },
  { id: 'L2', pos: V3(BOAT.x, BOAT.z + BOAT.l / 2 - 1.0), yaw: Math.PI, deck: BOAT.y, label: 'Buritan Kapal L2' },
  { id: 'L3', pos: V3(BOAT.x - BOAT.w / 2 + 0.45, BOAT.z + 1.5), yaw: Math.PI / 2, deck: BOAT.y, label: 'Lambung Kiri L3' },
] : [
  { id: 'A1', pos: new THREE.Vector3(0, 0, 0.5), yaw: 0, deck: 0.62, label: 'Dermaga Kayu A1' },
  { id: 'B3', pos: new THREE.Vector3(38, 0, -22), yaw: 0, deck: 0.42, label: 'Keramba Apung B3' },
  { id: 'C2', pos: new THREE.Vector3(-72, 0, -44), yaw: -1.35, deck: 0, label: 'Tepi Rumput C2' },
];
// C2 dulu berada di air (-72,-44). Geser ke tepi barat yang sebenarnya, tepat di bibir daratan.
if (IS_DANAU) { const c = SPOT_PLACES[2], p = shoreFrom(c.pos.x, c.pos.z, -1, 0); c.pos.set(p.x + 0.4, 0, p.z); c.deck = rawGroundH(c.pos.x, c.pos.z) + 0.09; }
// D3: geser dari tengah tanjung ke bibir batu yang menghadap danau
if (IS_SERENE) {
  const c = SPOT_PLACES[2]; let px = shoreLX(-8) - 6, pz = -8; const dx = 0.66, dz = -0.75;
  for (let i = 0; i < 200 && groundH(px, pz) > 0.25; i++) { px += dx * 0.25; pz += dz * 0.25; }
  c.pos.set(px - dx * 1.3, 0, pz - dz * 1.3);
}
for (const sp of SPOT_PLACES) if (!sp.deck) sp.deck = groundH(sp.pos.x, sp.pos.z) + 0.05;

/** Area keramba apung (petak jaring). */
const FAR = 1e6;
export const KERAMBA = IS_DANAU ? { x0: 26, x1: 62, z0: -46, z1: -22, cell: 6 } : { x0: FAR, x1: FAR + 6, z0: FAR, z1: FAR + 6, cell: 6 };
export const inKeramba = (x: number, z: number) => x > KERAMBA.x0 - 0.5 && x < KERAMBA.x1 + 0.5 && z > KERAMBA.z0 - 0.5 && z < KERAMBA.z1 + 0.5;


// ===================== Area pijak (berjalan) =====================
const V2 = (x: number, z: number) => ({ x, z });
export const DOCK = IS_DANAU ? { x0: -1.2, x1: 1.2, z0: -4, z1: 14, y: 0.62 } : { x0: FAR, x1: FAR, z0: FAR, z1: FAR, y: 0 };
export const KERAMBA_DECK = 0.42;

/** Titian apung: papan bambu di atas drum, dari dermaga/tepi ke keramba. */
export interface Bridge { id: string; a: { x: number; z: number }; b: { x: number; z: number }; w: number; ha: number; hb: number; y: number; name: string; style?: 'apung' | 'gantung' | 'kayu' }
function shoreFrom(x: number, z: number, dx: number, dz: number): { x: number; z: number } {
  let px = x, pz = z;
  for (let i = 0; i < 600 && (lakeE(px, pz) < 1.0 || rawGroundH(px, pz) < 0.25); i++) { px += dx * 0.25; pz += dz * 0.25; }
  return { x: px + dx * 0.8, z: pz + dz * 0.8 };
}
const T2A = IS_DANAU ? shoreFrom(44, KERAMBA.z1, 0, 1) : { x: FAR, z: FAR }, T3A = IS_DANAU ? shoreFrom(KERAMBA.x1, -34, 1, 0) : { x: FAR, z: FAR };
const SB = { a: { x: SUNGAI_BRIDGE_X, z: rivC(SUNGAI_BRIDGE_X) + rivW(SUNGAI_BRIDGE_X) + 4 }, b: { x: SUNGAI_BRIDGE_X, z: rivC(SUNGAI_BRIDGE_X) - rivW(SUNGAI_BRIDGE_X) - 4 } };
const LPA = (() => { let x = LODGE.x - LODGE.w / 2 + 0.2; const z = LODGE.z + 2; for (let i = 0; i < 160 && groundH(x, z) < 0.35; i++) x -= 0.25; return { x: x - 1.2, z }; })();
export const BRIDGES: Bridge[] = LOC === 'serene' ? [
  { id: 'JP', name: 'Titian Pondok', a: LPA, b: V2(LODGE.x - LODGE.w / 2 + 0.4, LODGE.z + 2), w: 2.0, ha: groundH(LPA.x, LPA.z) + 0.05, hb: LODGE.y, y: LODGE.y, style: 'kayu' },
] : LOC === 'sungai' ? [
  { id: 'JG', name: 'Jembatan Gantung', a: SB.a, b: SB.b, w: 1.4, ha: groundH(SB.a.x, SB.a.z) + 0.05, hb: groundH(SB.b.x, SB.b.z) + 0.05, y: 3.2, style: 'gantung' },
] : !IS_DANAU ? [] : [
  { id: 'T1', name: 'Titian Dermaga', a: V2(1.1, -2.6), b: V2(KERAMBA.x0, KERAMBA.z1), w: 1.3, ha: DOCK.y, hb: KERAMBA_DECK, y: 0.3 },
  { id: 'T2', name: 'Titian Selatan', a: T2A, b: V2(44, KERAMBA.z1), w: 1.3, ha: rawGroundH(T2A.x, T2A.z), hb: KERAMBA_DECK, y: 0.3 },
  { id: 'T3', name: 'Titian Timur', a: T3A, b: V2(KERAMBA.x1, -34), w: 1.3, ha: rawGroundH(T3A.x, T3A.z), hb: KERAMBA_DECK, y: 0.3 },
];
if (IS_DANAU) { BRIDGES[1].ha = groundH(T2A.x, T2A.z); BRIDGES[2].ha = groundH(T3A.x, T3A.z); }

/** Pondok di atas keramba (7 buah). Lantai pondok bisa dipijak, badan pondok tidak. */
export const HUTS: { x: number; z: number }[] = (IS_DANAU ? [[29, -25], [47, -25], [35, -31], [59, -31], [41, -37], [29, -43], [53, -43]] : []).map(([x, z]) => V2(x, z));
export const HUT = { floor: 2.6, body: [1.6, 1.3] as const };

/** Rakit rumput mengapung di sisi barat. */
export const RAFT = IS_DANAU ? { x: -38, z: -18, len: 16, w: 2.2, yaw: 0.35 } : { x: FAR, z: FAR, len: 1, w: 1, yaw: 0 };

/** Papan berdiri di tepi rumput C2. */
const C2PAD = IS_DANAU ? { x: SPOT_PLACES[2].pos.x, z: SPOT_PLACES[2].pos.z, r: 1.1 } : { x: FAR, z: FAR, r: 0 };
/** Pijakan khusus lokasi lain: batu besar sungai, dermaga nelayan, dek kapal. */
interface Pad { x: number; z: number; r?: number; w?: number; d?: number; y: number; s: Surface; block?: { x: number; z: number; w: number; d: number } }
export const PADS: Pad[] = LOC === 'serene' ? [
  { x: SDOCK.x, z: (SDOCK.z0 + SDOCK.z1) / 2, w: SDOCK.w, d: SDOCK.z1 - SDOCK.z0, y: SDOCK.y, s: 'dermaga' },
  { x: LODGE.x, z: LODGE.z, w: LODGE.w, d: LODGE.d, y: LODGE.y, s: 'dermaga', block: LODGE.body },
] : LOC === 'sungai' ? [{ x: SPOT_PLACES[0].pos.x, z: SPOT_PLACES[0].pos.z + 0.3, r: 1.9, y: 1.15, s: 'batu' }]
  : LOC === 'pantai' ? [{ x: PIER.x, z: (PIER.z0 + PIER.z1) / 2, w: PIER.w, d: PIER.z0 - PIER.z1, y: PIER.y, s: 'dermaga' }]
  : LOC === 'laut' ? [{ x: BOAT.x, z: BOAT.z, w: BOAT.w, d: BOAT.l, y: BOAT.y, s: 'kapal', block: { x: BOAT.x, z: BOAT.z + 2.2, w: 2.8, d: 4.2 } }] : [];
function padAt(x: number, z: number) {
  for (const p of PADS) {
    const inside = p.r ? Math.hypot(x - p.x, z - p.z) < p.r : Math.abs(x - p.x) < p.w! / 2 && Math.abs(z - p.z) < p.d! / 2;
    if (!inside) continue;
    if (p.block && Math.abs(x - p.block.x) < p.block.w / 2 && Math.abs(z - p.block.z) < p.block.d / 2) return 'blok';
    return p;
  }
  return null;
}

function segInfo(x: number, z: number, a: { x: number; z: number }, b: { x: number; z: number }) {
  const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
  const t = Math.max(0, Math.min(1, ((x - a.x) * abx + (z - a.z) * abz) / L2));
  const px = a.x + abx * t, pz = a.z + abz * t;
  return { t, d: Math.hypot(x - px, z - pz), len: Math.sqrt(L2) };
}
export function bridgeH(br: Bridge, t: number, len = Math.hypot(br.b.x - br.a.x, br.b.z - br.a.z)) {
  const ramp = Math.min(0.45, 3 / len);
  if (t < ramp) return br.ha + (br.y - br.ha) * sstep(0, 1, t / ramp);
  if (t > 1 - ramp) return br.hb + (br.y - br.hb) * sstep(0, 1, (1 - t) / ramp);
  return br.y;
}
export function onKerambaWalk(x: number, z: number) {
  const { x0, x1, z0, z1, cell } = KERAMBA;
  if (x < x0 - 0.45 || x > x1 + 0.45 || z < z0 - 0.3 || z > z1 + 0.3) return false;
  const rz = ((z1 - z) % cell + cell) % cell, rx = ((x - x0) % cell + cell) % cell;
  return Math.min(rz, cell - rz) < 0.3 || Math.min(rx, cell - rx) < 0.42;
}
function inHutBody(x: number, z: number) { return HUTS.some(h => Math.abs(x - h.x) < HUT.body[0] && Math.abs(z - h.z) < HUT.body[1]); }
function onHutFloor(x: number, z: number) { return HUTS.some(h => Math.abs(x - h.x) < HUT.floor && Math.abs(z - h.z) < HUT.floor); }

export type Surface = 'dermaga' | 'titian' | 'keramba' | 'darat' | 'papan' | 'batu' | 'kapal';
/** Tinggi pijakan di (x,z) atau null bila tidak bisa dipijak (air, bangunan, bukit terjal). */
export function walkInfo(x: number, z: number): { y: number; s: Surface; id?: string } | null {
  if (x > DOCK.x0 && x < DOCK.x1 && z > DOCK.z0 && z < DOCK.z1) return { y: DOCK.y, s: 'dermaga' };
  if (PADS.length) { const p = padAt(x, z); if (p === 'blok') return null; if (p) return { y: p.y, s: p.s }; }
  for (const br of BRIDGES) {
    const g = segInfo(x, z, br.a, br.b);
    if (g.d < br.w / 2 && g.t > 0 && g.t < 1) return { y: bridgeH(br, g.t, g.len), s: 'titian', id: br.id };
  }
  if (inHutBody(x, z)) return null;
  if (onKerambaWalk(x, z) || onHutFloor(x, z)) return { y: KERAMBA_DECK, s: 'keramba' };
  if (Math.hypot(x - C2PAD.x, z - C2PAD.z) < C2PAD.r) return { y: SPOT_PLACES[2].deck, s: 'papan' };
  const e = lakeE(x, z);
  const landOk = IS_DANAU ? e >= 0.995 && e < 1.45 : LOC === 'sungai' ? e < 1.9 : LOC === 'pantai' ? e < 1.6 : IS_SERENE ? e < 1.3 : false;
  if (landOk) {
    // bangunan di halaman
    if (Math.abs(x - LOKET.x) < 1.5 && Math.abs(z - LOKET.z) < 1.2) return null;
    if (Math.abs(x - WARUNG.x) < 2.2 && Math.abs(z - WARUNG.z) < 1.6) return null;
    if (Math.abs(x - AQUA.x) < AQUA.w / 2 + 0.15 && Math.abs(z - AQUA.z) < AQUA.d / 2 + 0.15) return null;
    if (Math.abs(z - GATE.z) < 0.5 && Math.abs(Math.abs(x - GATE.x) - 2.6) < 0.45) return null; // tiang gapura
    const h = groundH(x, z);
    if (h < 0.08) return null; // masih air dangkal
    if (obstacleAt(x, z)) return null; // batang pohon, palem, batu
    // terlalu terjal? bandingkan dengan sekitar
    const sl = Math.max(Math.abs(groundH(x + 0.6, z) - h), Math.abs(groundH(x, z + 0.6) - h));
    if (sl > 0.45) return null;
    return { y: h + 0.02, s: 'darat' };
  }
  return null;
}
export const walkHeight = (x: number, z: number) => walkInfo(x, z)?.y ?? null;

/** Area yang tidak boleh ditanami pohon/rumput (jalan, halaman, titian). */
export function reserved(x: number, z: number, pad = 1.5) {
  if (yardMask(x, z) > 0.2) return true;
  if (x > DOCK.x0 - pad && x < DOCK.x1 + pad && z > DOCK.z0 - pad && z < DOCK.z1 + 6) return true;
  for (const br of BRIDGES) { const g = segInfo(x, z, br.a, br.b); if (g.d < br.w / 2 + pad) return true; }
  if (Math.hypot(x - RAFT.x, z - RAFT.z) < RAFT.len / 2 + pad) return true;
  for (const p of PADS) if (Math.hypot(x - p.x, z - p.z) < (p.r ?? Math.max(p.w!, p.d!) / 2) + pad) return true;
  if (LOC === 'pantai' && segD(x, z, REEF.a, REEF.b) < REEF.w + pad) return true;
  if (IS_SERENE && (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + pad || (Math.abs(x) < 4 + pad && z > SDOCK.z0 - 2 && z < 60))) return true;
  return false;
}

/** Tempat spot terdekat (untuk menentukan stok ikan di server). */
export function spotAreaAt(x: number, z: number): string {
  if (inKeramba(x, z)) return 'B3';
  if (IS_DANAU) for (const br of BRIDGES) { const g = segInfo(x, z, br.a, br.b); if (g.d < 3) return br.id === 'T1' && g.t < 0.35 ? 'A1' : 'B3'; }
  let best = SPOT_PLACES[0], bd = Infinity;
  for (const s of SPOT_PLACES) { const d = Math.hypot(s.pos.x - x, s.pos.z - z); if (d < bd) { bd = d; best = s; } }
  return best.id;
}

/** Nilai sebuah arah memancing: seberapa banyak air terbuka di depan. */
/** Air sungguhan: permukaan tanah di bawah muka air (0 m). Lebih tepat dari lakeE di tepi berumput. */
export const isWater = (x: number, z: number) => groundH(x, z) < -0.03;
/** Nilai sebuah arah memancing: berapa meter air terbuka di depan (tepi landai di awal boleh dilewati). */
function waterScore(x: number, z: number, yaw: number) {
  const dx = -Math.sin(yaw), dz = -Math.cos(yaw);
  let s = 0, seen = false;
  for (let d = 1; d <= 14; d += 1) {
    const px = x + dx * d, pz = z + dz * d;
    if (isWater(px, pz)) {
      const w = walkInfo(px, pz);
      if (w && w.s !== 'darat') { if (d < 3) s -= 1.5; continue; }   // titian/keramba/dermaga di atas air
      s += 1; seen = true;
    } else if (!seen) { if (d > 7) break; }                           // masih turun di tepi landai
    else { if (d < 6) s -= 3; break; }                                // daratan seberang / pulau
  }
  return s;
}
/** Arah yang DIPILIH pemain (arah kamera) dipertahankan bila ada air di depannya; bila tidak, cari arah berair
 *  TERDEKAT dari arah itu (maks. ±maxTurn). Mengembalikan null bila tidak ada air dalam rentang itu. */
export function aimAtWater(x: number, z: number, prefYaw: number, maxTurn = 1.05) {
  if (waterScore(x, z, prefYaw) >= 3) return prefYaw;
  for (let d = 0.05; d <= maxTurn + 1e-6; d += 0.05) for (const s of [1, -1]) { const y = prefYaw + s * d; if (waterScore(x, z, y) >= 3) return y; }
  return null;
}
/** Arah hadap terbaik ke air (dipakai saat "Mancing di sini"). Lebih suka arah dekat hadap sekarang. */
export function faceNearestWater(x: number, z: number, yawNow: number) {
  let best = yawNow, bs = -Infinity;
  for (let i = 0; i < 48; i++) {
    const yaw = (i / 48) * Math.PI * 2;
    const diff = Math.abs(Math.atan2(Math.sin(yaw - yawNow), Math.cos(yaw - yawNow)));
    const s = waterScore(x, z, yaw) - diff * 3;
    if (s > bs) { bs = s; best = yaw; }
  }
  return { yaw: best, ok: waterScore(x, z, best) >= 4 };
}

// ---------- jalur otomatis (graf titik jalan + Dijkstra) ----------
interface Node { x: number; z: number; nb: { i: number; d: number }[] }
let graph: Node[] | null = null;
export function segmentWalkable(ax: number, az: number, bx: number, bz: number, step = 0.4) {
  const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
  let prev = walkHeight(ax, az); if (prev === null) return false;
  for (let i = 1; i <= n; i++) {
    const t = i / n, h = walkHeight(ax + (bx - ax) * t, az + (bz - az) * t);
    if (h === null || Math.abs(h - prev) > 0.5) return false;
    prev = h;
  }
  return true;
}
function buildGraph(): Node[] {
  const pts: { x: number; z: number }[] = [];
  const add = (x: number, z: number) => { if (walkHeight(x, z) !== null) pts.push({ x, z }); };
  for (let z = DOCK.z1 - 0.5; z >= DOCK.z0 + 0.4; z -= 3) add(0, z);
  add(0, DOCK.z0 + 0.6); add(0.7, -2.6);
  for (const br of BRIDGES) for (let t = 0.02; t <= 0.985; t += 0.12) add(br.a.x + (br.b.x - br.a.x) * t, br.a.z + (br.b.z - br.a.z) * t);
  const { x0, x1, z0, z1, cell } = KERAMBA;
  for (let x = x0; x <= x1 + 0.01; x += cell / 2) for (let z = z1; z >= z0 - 0.01; z -= cell / 2) add(x, z);
  for (let x = YARD.x0 + 2; x <= YARD.x1 - 2; x += 4) for (let z = YARD.z0 + 2; z <= YARD.z1 - 2; z += 4) add(x, z);
  // cincin tepi danau di darat
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2;
    for (const e of [1.035, 1.09]) {
      let lo = 0, hi = 200; // cari jarak radial dengan lakeE = e
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (lakeE(LAKE.cx + Math.cos(a) * m, LAKE.cz + Math.sin(a) * m) < e) lo = m; else hi = m; }
      add(LAKE.cx + Math.cos(a) * lo, LAKE.cz + Math.sin(a) * lo);
    }
  }
  if (!IS_DANAU) { // lokasi lain: kisi titik pijak di dekat air + pijakan khusus
    pts.length = 0;
    const st = LOC === 'laut' ? 1.5 : 5;
    const X0 = LOC === 'laut' ? BOAT.x - BOAT.w / 2 : LAKE.cx - LAKE.rx, X1 = LOC === 'laut' ? BOAT.x + BOAT.w / 2 : LAKE.cx + LAKE.rx;
    const Z0 = LOC === 'laut' ? BOAT.z - BOAT.l / 2 : LAKE.cz - LAKE.rz * 1.6, Z1 = LOC === 'laut' ? BOAT.z + BOAT.l / 2 : LAKE.cz + LAKE.rz * 1.6;
    for (let x = X0 + st / 2; x < X1; x += st) for (let z = Z0 + st / 2; z < Z1; z += st) add(x, z);
    for (const p of PADS) for (let i = -2; i <= 2; i++) for (let j = -4; j <= 4; j++) add(p.x + i * ((p.w ?? p.r! * 2) / 5), p.z + j * ((p.d ?? p.r! * 2) / 9));
    for (const br of BRIDGES) for (let t = 0.02; t <= 0.985; t += 0.08) add(br.a.x + (br.b.x - br.a.x) * t, br.a.z + (br.b.z - br.a.z) * t);
    if (IS_SERENE) {
      // jalur tepi kiri yang sempit (antara air & lereng hutan) + cincin tepi danau + pelataran dermaga
      for (let z = 10; z >= -140; z -= 2.5) for (const d of [1.8, 3.2]) add(shoreLX(z) - d, z);
      for (let i = 0; i < 120; i++) {
        const a = (i / 120) * Math.PI * 2;
        for (const e of [1.03, 1.08]) {
          let lo = 0, hi = 400;
          for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (lakeE(LAKE.cx + Math.cos(a) * m, LAKE.cz + Math.sin(a) * m) < e) lo = m; else hi = m; }
          add(LAKE.cx + Math.cos(a) * lo, LAKE.cz + Math.sin(a) * lo);
        }
      }
      for (let x = -6; x <= 6; x += 3) for (let z = CLEARING.z - 6; z <= CLEARING.z + 6; z += 3) add(x, z);
      for (let z = SDOCK.z1 - 0.5; z >= SDOCK.z0 + 0.5; z -= 2.5) add(SDOCK.x, z);
    }
  }
  for (const s of SPOT_PLACES) add(s.pos.x, s.pos.z);
  const nodes: Node[] = pts.map(p => ({ ...p, nb: [] }));
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], d = Math.hypot(a.x - b.x, a.z - b.z);
    if (d > 9 || d < 0.05) continue;
    if (!segmentWalkable(a.x, a.z, b.x, b.z)) continue;
    a.nb.push({ i: j, d }); b.nb.push({ i, d });
  }
  return nodes;
}
function nearestNodes(g: Node[], x: number, z: number) {
  return g.map((n, i) => ({ i, d: Math.hypot(n.x - x, n.z - z) })).sort((a, b) => a.d - b.d).slice(0, 8).filter(o => o.d < 14 && segmentWalkable(x, z, g[o.i].x, g[o.i].z));
}
/** Cari jalur berjalan dari A ke B. Mengembalikan daftar titik (tanpa titik awal) atau null. */
export function findPath(ax: number, az: number, bx: number, bz: number): { x: number; z: number }[] | null {
  if (walkHeight(bx, bz) === null) return null;
  if (Math.hypot(bx - ax, bz - az) < 14 && segmentWalkable(ax, az, bx, bz)) return [V2(bx, bz)];
  const g = graph ??= buildGraph();
  const S = nearestNodes(g, ax, az), T = nearestNodes(g, bx, bz);
  if (!S.length || !T.length) return null;
  const dist = new Float64Array(g.length).fill(Infinity), prev = new Int32Array(g.length).fill(-1), done = new Uint8Array(g.length);
  for (const s of S) { dist[s.i] = s.d; }
  const tEnd = new Map(T.map(t => [t.i, t.d]));
  let bestEnd = -1, bestD = Infinity;
  for (;;) {
    let u = -1, ud = Infinity;
    for (let i = 0; i < g.length; i++) if (!done[i] && dist[i] < ud) { ud = dist[i]; u = i; }
    if (u < 0 || ud >= bestD) break;
    done[u] = 1;
    const te = tEnd.get(u); if (te !== undefined && ud + te < bestD) { bestD = ud + te; bestEnd = u; }
    for (const e of g[u].nb) if (ud + e.d < dist[e.i]) { dist[e.i] = ud + e.d; prev[e.i] = u; }
  }
  if (bestEnd < 0) return null;
  const out: { x: number; z: number }[] = [];
  for (let u = bestEnd; u >= 0; u = prev[u]) out.unshift(V2(g[u].x, g[u].z));
  out.push(V2(bx, bz));
  // rapikan: lewati titik yang bisa dilompati langsung
  const sm: { x: number; z: number }[] = []; let cx = ax, cz = az, i = 0;
  while (i < out.length) {
    let j = out.length - 1;
    while (j > i && !(Math.hypot(out[j].x - cx, out[j].z - cz) < 16 && segmentWalkable(cx, cz, out[j].x, out[j].z))) j--;
    sm.push(out[j]); cx = out[j].x; cz = out[j].z; i = j + 1;
  }
  return sm;
}
/** Titik pijak terdekat dari (x,z) — untuk "Jalan ke sini" di peta bila mengetuk air. */
export function nearestWalkable(x: number, z: number, maxR = 12) {
  if (walkHeight(x, z) !== null) return V2(x, z);
  for (let r = 0.5; r <= maxR; r += 0.5) for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
    if (walkHeight(px, pz) !== null) return V2(px, pz);
  }
  return null;
}
/** Bangun graf jalur di layar memuat supaya tidak tersendat saat pertama berjalan otomatis. */
export function MAP_PRELOAD() { graph ??= buildGraph(); return graph.length; }

/** Titik terdekat dari (x,z) yang bisa dipijak DAN menghadap air terbuka (untuk "Mancing di sini" dari jauh). */
export function nearestFishable(x: number, z: number, maxR = 45) {
  for (let r = 1.5; r <= maxR; r += 1.5) {
    let best: { x: number; z: number; yaw: number } | null = null, bd = Infinity;
    const n = Math.max(12, Math.round(r * 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (walkHeight(px, pz) === null) continue;
      let near = false; // saring cepat: ada air dalam 4 m?
      for (let k = 0; k < 8 && !near; k++) { const b = (k / 8) * Math.PI * 2; near = isWater(px + Math.cos(b) * 3, pz + Math.sin(b) * 3); }
      if (!near) continue;
      const f = faceNearestWater(px, pz, Math.atan2(-(px - x), -(pz - z)));
      if (f.ok) { const d = Math.hypot(px - x, pz - z); if (d < bd) { bd = d; best = { x: px, z: pz, yaw: f.yaw }; } }
    }
    if (best) return best;
  }
  return null;
}

// ---------- rintangan (batang pohon, palem, batu) ----------
const OBS_CELL = 4, obstacles = new Map<string, { x: number; z: number; r: number }[]>();
const okey = (cx: number, cz: number) => cx + ',' + cz;
/** Daftarkan rintangan bundar (dipanggil saat pohon/batu ditempatkan). */
export function addObstacle(x: number, z: number, r: number) {
  const k = okey(Math.floor(x / OBS_CELL), Math.floor(z / OBS_CELL));
  let a = obstacles.get(k); if (!a) obstacles.set(k, a = []); a.push({ x, z, r });
  graph = null; // graf jalur dibangun ulang supaya memutari rintangan
}
export function obstacleAt(x: number, z: number, pad = 0.22) {
  const cx = Math.floor(x / OBS_CELL), cz = Math.floor(z / OBS_CELL);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of obstacles.get(okey(cx + i, cz + j)) ?? []) if (Math.hypot(o.x - x, o.z - z) < o.r + pad) return o;
  return null;
}

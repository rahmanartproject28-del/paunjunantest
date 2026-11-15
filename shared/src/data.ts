// Data dunia PAUNJUNAN. Dipakai bersama oleh server dan game (mode lokal),
// supaya aturan dan angka selalu sama di kedua tempat.

export type SpeciesId = 'nila' | 'mujair' | 'mas' | 'patin' | 'gabus' | 'baung' | 'toman'
  | 'belida' | 'jelawat' | 'semah'          // Sungai Deras
  | 'kakap' | 'kerapu' | 'baronang'         // Pantai Karang
  | 'tongkol' | 'tuna' | 'marlin'           // Laut Dalam
  | 'lele' | 'bawal'                        // Kolam Pemancingan
  | 'tapah' | 'lais'                        // Sungai Gambut
  | 'kakapputih' | 'bandeng' | 'belanak'    // Muara Bakau
  | 'kuwe' | 'kakatua' | 'barakuda'         // Laguna Karst
  | 'layur';                                // Pelabuhan Malam
export type LocId = 'serene' | 'danau' | 'sungai' | 'pantai' | 'laut' | 'kolam' | 'gambut' | 'bakau' | 'laguna' | 'pelabuhan';
export type Zone = 'near' | 'far';
export type SubZone = 'dermaga' | 'dekat' | 'jauh' | 'keramba' | 'lepas';
export type WeatherId = 'cerah' | 'kabut' | 'hujan';
export type BaitId = 'udang' | 'cacing' | 'pelet' | 'lumut' | 'racik' | 'anakan' | 'cumi';
export type RodId = 'pemula' | 'bambu' | 'karbon' | 'tegar' | 'predator' | 'belida' | 'emas' | 'surf' | 'laut';
export type LineId = 'l20' | 'l30' | 'pe' | 'pe8' | 'pe12' | 'pe20';

export interface Species {
  name: string;
  zones: Zone[];
  w: [number, number];        // rentang berat (kg)
  str: number;                // kekuatan dasar
  pricePerKg: number;         // harga jual per kg (koin)
  lenK: number;               // panjang (cm) ≈ lenK * berat^(1/3)
  // warna model 3D: punggung, sisi, perut (hex)
  look: { back: string; side: string; belly: string; fin: string; stretch: number; height: number };
}

export const SPECIES: Record<SpeciesId, Species> = {
  nila:   { name: 'Nila',     zones: ['near', 'far'], w: [0.3, 1.4], str: 0.8,  pricePerKg: 12, lenK: 27, look: { back: '#3d4a44', side: '#8d9b93', belly: '#dfe2da', fin: '#b8574a', stretch: 0.95, height: 1.15 } },
  mujair: { name: 'Mujair',   zones: ['near'],        w: [0.1, 0.5], str: 0.55, pricePerKg: 10, lenK: 26, look: { back: '#26301f', side: '#56644b', belly: '#bdbc9f', fin: '#3b4630', stretch: 0.92, height: 1.15 } },
  mas:    { name: 'Ikan Mas', zones: ['far'],         w: [0.6, 3.5], str: 1.1,  pricePerKg: 18, lenK: 29, look: { back: '#7e4510', side: '#d98f2c', belly: '#f3d58e', fin: '#c07020', stretch: 1.0, height: 1.1 } },
  patin:  { name: 'Patin',    zones: ['far'],         w: [1.0, 6.0], str: 1.45, pricePerKg: 15, lenK: 34, look: { back: '#3f4953', side: '#9ba7ae', belly: '#f0f1ef', fin: '#6d7880', stretch: 1.25, height: 0.78 } },
  gabus:  { name: 'Gabus',    zones: ['near'],        w: [0.4, 2.5], str: 1.2,  pricePerKg: 22, lenK: 36, look: { back: '#22211b', side: '#4b4a3c', belly: '#a39c80', fin: '#33322a', stretch: 1.4, height: 0.62 } },
  baung:  { name: 'Baung',    zones: ['far'],         w: [0.6, 5.5], str: 1.35, pricePerKg: 20, lenK: 33, look: { back: '#3a352f', side: '#8a8174', belly: '#ebe6da', fin: '#5a5146', stretch: 1.25, height: 0.75 } },
  toman:  { name: 'Toman',    zones: ['far'],         w: [2.5, 16],  str: 1.95, pricePerKg: 28, lenK: 37, look: { back: '#121a22', side: '#3d4e5c', belly: '#d4dadd', fin: '#1d2730', stretch: 1.45, height: 0.66 } },
  // Sungai Deras
  belida:   { name: 'Belida',       zones: ['far'],         w: [1.0, 10],  str: 1.6,  pricePerKg: 42, lenK: 40, look: { back: '#5d6670', side: '#c9d0d6', belly: '#f2f3f1', fin: '#8a939b', stretch: 1.6, height: 0.9 } },
  jelawat:  { name: 'Jelawat',      zones: ['near', 'far'], w: [0.5, 6],   str: 1.3,  pricePerKg: 30, lenK: 31, look: { back: '#6b6a4a', side: '#c9c08a', belly: '#f0ead0', fin: '#c4623a', stretch: 1.1, height: 1.0 } },
  semah:    { name: 'Semah',        zones: ['far'],         w: [1.0, 12],  str: 1.9,  pricePerKg: 48, lenK: 34, look: { back: '#4a4a2a', side: '#b8a55a', belly: '#e8dcb0', fin: '#a0602a', stretch: 1.15, height: 1.0 } },
  // Pantai Karang
  kakap:    { name: 'Kakap Merah',  zones: ['near', 'far'], w: [0.8, 12],  str: 1.7,  pricePerKg: 45, lenK: 32, look: { back: '#8a2a22', side: '#d8584a', belly: '#f4c8b8', fin: '#b8402e', stretch: 1.05, height: 1.1 } },
  kerapu:   { name: 'Kerapu',       zones: ['near'],        w: [1.0, 20],  str: 1.9,  pricePerKg: 55, lenK: 31, look: { back: '#4a3a24', side: '#9a7a4a', belly: '#e0cfa8', fin: '#5a4428', stretch: 1.0, height: 1.05 } },
  baronang: { name: 'Baronang',     zones: ['near'],        w: [0.2, 1.5], str: 0.9,  pricePerKg: 30, lenK: 26, look: { back: '#5a6a4a', side: '#b8b88a', belly: '#eaeadf', fin: '#8a8a5a', stretch: 0.95, height: 1.2 } },
  // Laut Dalam
  tongkol:  { name: 'Tongkol',      zones: ['far'],         w: [1.0, 8],   str: 1.8,  pricePerKg: 24, lenK: 34, look: { back: '#1f3558', side: '#8aa0b8', belly: '#eef2f5', fin: '#2a3f60', stretch: 1.2, height: 0.9 } },
  tuna:     { name: 'Tuna Sirip Kuning', zones: ['far'],    w: [10, 80],   str: 2.1,  pricePerKg: 40, lenK: 36, look: { back: '#142a4a', side: '#8a9ab0', belly: '#f2f4f6', fin: '#e8c22a', stretch: 1.2, height: 0.95 } },
  marlin:   { name: 'Marlin Biru',  zones: ['far'],         w: [40, 180],  str: 2.3,  pricePerKg: 32, lenK: 38, look: { back: '#10254a', side: '#4a6a9a', belly: '#e8eef4', fin: '#1a3a6a', stretch: 1.7, height: 0.8 } },
  // Kolam Pemancingan (kolam harian & galatama)
  lele:     { name: 'Lele',         zones: ['near'],        w: [0.2, 2.5], str: 1.0,  pricePerKg: 14, lenK: 35, look: { back: '#2a2622', side: '#4a443c', belly: '#b8b0a0', fin: '#2e2a25', stretch: 1.45, height: 0.62 } },
  bawal:    { name: 'Bawal',        zones: ['near', 'far'], w: [0.4, 4],   str: 1.25, pricePerKg: 22, lenK: 24, look: { back: '#3d4246', side: '#9aa3a8', belly: '#d8463a', fin: '#c0392b', stretch: 0.85, height: 1.5 } },
  // Sungai Gambut (air hitam Kalimantan)
  tapah:    { name: 'Tapah',        zones: ['far'],         w: [2, 30],    str: 2.0,  pricePerKg: 35, lenK: 40, look: { back: '#2a2a26', side: '#5a5850', belly: '#d8d4c8', fin: '#3a3830', stretch: 1.7, height: 0.7 } },
  lais:     { name: 'Lais',         zones: ['near', 'far'], w: [0.1, 1.2], str: 0.8,  pricePerKg: 40, lenK: 36, look: { back: '#8a8a7a', side: '#c8c8b8', belly: '#eeeee4', fin: '#a8a898', stretch: 1.6, height: 0.6 } },
  // Muara Bakau (air payau)
  kakapputih: { name: 'Kakap Putih', zones: ['near', 'far'], w: [1, 25],  str: 1.85, pricePerKg: 50, lenK: 33, look: { back: '#5a6058', side: '#c0c8c4', belly: '#f0f2ee', fin: '#7a8078', stretch: 1.15, height: 1.0 } },
  bandeng:  { name: 'Bandeng',      zones: ['near', 'far'], w: [0.3, 4],   str: 1.4,  pricePerKg: 20, lenK: 33, look: { back: '#3a5a6a', side: '#c8d4da', belly: '#f2f4f6', fin: '#8aa0aa', stretch: 1.3, height: 0.8 } },
  belanak:  { name: 'Belanak',      zones: ['near'],        w: [0.2, 2],   str: 0.9,  pricePerKg: 16, lenK: 32, look: { back: '#4a5a5a', side: '#a8b4b0', belly: '#e8ecea', fin: '#7a8684', stretch: 1.2, height: 0.8 } },
  // Laguna Karst (Raja Ampat)
  kuwe:     { name: 'Kuwe Rambe (GT)', zones: ['far'],      w: [2, 45],    str: 2.15, pricePerKg: 38, lenK: 32, look: { back: '#2a2e34', side: '#7a8088', belly: '#d8dce0', fin: '#3a3e44', stretch: 1.0, height: 1.3 } },
  kakatua:  { name: 'Kakatua',      zones: ['near'],        w: [0.5, 6],   str: 1.2,  pricePerKg: 26, lenK: 30, look: { back: '#1f6f6a', side: '#3fb8a0', belly: '#a8e0c8', fin: '#e05a8a', stretch: 1.1, height: 1.15 } },
  barakuda: { name: 'Barakuda',     zones: ['far'],         w: [1, 18],    str: 1.75, pricePerKg: 30, lenK: 40, look: { back: '#3a4a52', side: '#a8b8c0', belly: '#eef2f4', fin: '#5a6a72', stretch: 1.9, height: 0.55 } },
  // Pelabuhan Malam
  layur:    { name: 'Layur',        zones: ['far'],         w: [0.3, 4],   str: 1.1,  pricePerKg: 26, lenK: 62, look: { back: '#9aa4ac', side: '#d8e0e6', belly: '#f4f8fa', fin: '#c8d0d6', stretch: 2.8, height: 0.38 } },
};
export const SPECIES_IDS = Object.keys(SPECIES) as SpeciesId[];

export interface SizeTier { id: string; name: string; lo: number; hi: number; pull: string; col: string }
export const SIZE_TIERS: SizeTier[] = [
  { id: 'kecil',   name: 'Kecil',   lo: 0.00, hi: 0.33, pull: 'RINGAN',  col: '#8FB36A' },
  { id: 'sedang',  name: 'Sedang',  lo: 0.33, hi: 0.66, pull: 'SEDANG',  col: '#E8B63F' },
  { id: 'besar',   name: 'Besar',   lo: 0.66, hi: 0.90, pull: 'BERAT',   col: '#E07A3A' },
  { id: 'monster', name: 'Monster', lo: 0.90, hi: 1.00, pull: 'MONSTER', col: '#D9533B' },
];
export const DEFAULT_TIER_WEIGHTS = [55, 30, 12, 3];

export interface Weather { name: string; mul: number; wind: number; rain: boolean; fog: number }
export const WEATHER: Record<WeatherId, Weather> = {
  cerah: { name: 'Cerah',    mul: 1.0,  wind: 1.0, rain: false, fog: 0.0 },
  kabut: { name: 'Berkabut', mul: 1.15, wind: 0.7, rain: false, fog: 1.0 },
  hujan: { name: 'Hujan',    mul: 1.4,  wind: 2.0, rain: true,  fog: 0.6 },
};

export interface Bait { name: string; desc: string; price: number; pack: number; color: string; all?: boolean; mul: Partial<Record<SpeciesId, number>> }
export const BAITS: Record<BaitId, Bait> = {
  udang:  { name: 'Udang', desc: 'Umpan serba bisa, disukai hampir semua ikan.', price: 40, pack: 10, color: '#d9754a', mul: { nila: 1.2, mujair: 1.0, mas: 1.0, patin: 1.1, gabus: 0.8, baung: 1.2, toman: 0.6, kakapputih: 1.5, lais: 1.3, belanak: 1.1, bawal: 1.2, bandeng: 0.8, layur: 1.2 } },
  cacing: { name: 'Cacing', desc: 'Aroma tanah yang kuat, favorit mujair, ikan mas, dan lele.', price: 30, pack: 15, color: '#b0605c', mul: { nila: 1.0, mujair: 1.3, mas: 1.25, patin: 0.9, gabus: 0.9, baung: 1.35, toman: 0.4, lele: 1.5, lais: 1.4, belanak: 1.2, tapah: 0.8 } },
  pelet:  { name: 'Pelet', desc: 'Seperti pakan di keramba & kolam. Nila, ikan mas, lele, bawal sangat suka.', price: 25, pack: 20, color: '#8a6a3a', mul: { nila: 1.45, mujair: 1.1, mas: 1.3, patin: 1.2, gabus: 0.2, baung: 0.9, toman: 0.1, lele: 1.5, bawal: 1.6, bandeng: 1.3, tapah: 0.3, kakapputih: 0.3 } },
  lumut:  { name: 'Lumut', desc: 'Umpan alami untuk ikan pemakan tumbuhan (bandeng, belanak, kakatua).', price: 35, pack: 12, color: '#4f7a3a', mul: { nila: 1.1, mujair: 1.45, mas: 1.4, patin: 0.3, gabus: 0.1, baung: 0.3, toman: 0.05, bandeng: 1.6, belanak: 1.5, kakatua: 1.5, bawal: 0.6, lele: 0.2 } },
  racik:  { name: 'Umpan Racik Serba Ikan', desc: 'Dimakan semua jenis ikan, dari nila sampai toman.', price: 70, pack: 10, color: '#c9853a', all: true, mul: {} },
  anakan: { name: 'Ikan kecil', desc: 'Umpan hidup untuk ikan predator seperti toman, gabus, dan patin.', price: 80, pack: 6, color: '#9aa6ad', mul: { nila: 0.3, mujair: 0.2, mas: 0.3, patin: 1.35, gabus: 2.3, baung: 1.1, toman: 2.8, belida: 1.8, semah: 1.4, kakap: 1.5, kerapu: 1.6, tongkol: 1.4, tuna: 1.3, marlin: 1.2, jelawat: 0.4, baronang: 0.3, tapah: 2.0, kuwe: 1.8, barakuda: 2.2, kakapputih: 2.2, layur: 1.6, lele: 0.8, bawal: 0.5, bandeng: 0.2, belanak: 0.3, kakatua: 0.3, lais: 0.9 } },
  cumi:   { name: 'Cumi segar', desc: 'Umpan laut: kakap, kerapu, tongkol, tuna, dan marlin sangat suka.', price: 120, pack: 8, color: '#e8d8d0', mul: { kakap: 1.7, kerapu: 1.8, baronang: 0.6, tongkol: 1.6, tuna: 1.9, marlin: 2.1, nila: 0.2, mujair: 0.2, mas: 0.2, patin: 0.6, gabus: 0.5, baung: 0.8, toman: 0.7, belida: 0.9, jelawat: 0.3, semah: 0.6, layur: 1.8, barakuda: 1.5, kuwe: 1.6, kakapputih: 1.4, kakatua: 0.5, bandeng: 0.3, belanak: 0.4 } },
};

export interface Rod { name: string; desc: string; price: number; cast: number; power: number; color: string; shop?: boolean }
export const RODS: Record<RodId, Rod> = {
  pemula:   { name: 'Joran Pemula', desc: 'Fiberglass 3 m. Lentur dan tahan banting.', price: 0, cast: 1.0, power: 1.0, color: '#e2cf45' },
  bambu:    { name: 'Joran Bambu Klasik', desc: 'Kuat, tapi lemparan lebih pendek.', price: 250, cast: 0.9, power: 1.12, color: '#c9b690' },
  karbon:   { name: 'Joran Karbon', desc: 'Ringan dan kaku. Lemparan lebih jauh.', price: 600, cast: 1.18, power: 1.05, color: '#2a2d33' },
  tegar:    { name: 'Joran Tegar', desc: 'Menahan tarikan patin dan gabus.', price: 900, cast: 1.02, power: 1.3, color: '#1f4f8a' },
  predator: { name: 'Joran Predator Toman', desc: 'Menahan tarikan toman belasan kilo.', price: 1800, cast: 1.08, power: 1.6, color: '#3a4a22' },
  belida:   { name: 'Joran Legenda Belida', desc: 'Langka, hanya ada di pasar.', price: 2400, cast: 1.24, power: 1.42, color: '#7a1f2b', shop: false },
  emas:     { name: 'Joran Bambu Emas', desc: 'Langka, hanya ada di pasar.', price: 1600, cast: 1.1, power: 1.3, color: '#c9a23a', shop: false },
  surf:     { name: 'Joran Pantai Surf', desc: 'Panjang 4 m. Lemparan jauh melewati ombak, kuat untuk kakap & kerapu.', price: 3500, cast: 1.35, power: 1.95, color: '#d8d8d0' },
  laut:     { name: 'Joran Laut Dalam', desc: 'Pendek dan sangat kuat, untuk tuna dan marlin.', price: 7000, cast: 1.0, power: 2.6, color: '#101820' },
};

export interface Line { name: string; price: number; strength: number }
export const LINES: Record<LineId, Line> = {
  l20: { name: 'Senar 0,20 mm', price: 0, strength: 100 },
  l30: { name: 'Senar 0,30 mm', price: 200, strength: 125 },
  pe:  { name: 'Senar PE (kepang)', price: 450, strength: 150 },
  pe8: { name: 'Senar PE8 Monster', price: 900, strength: 190 },
  pe12: { name: 'Senar PE12 Laut', price: 1800, strength: 240 },
  pe20: { name: 'Senar PE20 Marlin', price: 3600, strength: 310 },
};

export interface SpotDef { id: string; name: string; desc: string; depth: string; loc: LocId; minLv: number; /** saran level (misi & label), bukan kunci */ recLv: number; stock: Partial<Record<SpeciesId, number>> }
export interface LocInfo { id: LocId; name: string; desc: string; icon: string; minLv: number; /** saran level, bukan kunci: semua peta terbuka sejak Lv 1 */ recLv: number; start: string }
/** Lokasi memancing. Syarat level diperiksa server saat melempar (mode lokal: boleh diabaikan untuk uji). */
export const LOCATIONS: LocInfo[] = [
  { id: 'serene', name: 'Danau Serene', desc: 'Danau pegunungan sebening kaca: dermaga kayu, pondok panggung, air terjun. Nila, mas, patin, toman.', icon: '🏔️', minLv: 1, recLv: 1, start: 'D1' },
  { id: 'danau', name: 'Danau Keramba', desc: 'Keramba apung, dermaga, dan tepi rumput. Nila, mas, patin, gabus, toman.', icon: '🏞️', minLv: 1, recLv: 1, start: 'A1' },
  { id: 'sungai', name: 'Sungai Deras', desc: 'Arus kuat di antara batu dan hutan. Belida, semah, jelawat, baung.', icon: '🌊', minLv: 1, recLv: 5, start: 'S1' },
  { id: 'pantai', name: 'Pantai Karang', desc: 'Mancing dari karang, pantai, dan dermaga nelayan. Kakap, kerapu, baronang.', icon: '🏝️', minLv: 1, recLv: 10, start: 'P3' },
  { id: 'laut', name: 'Laut Dalam', desc: 'Naik kapal ke tengah laut. Tongkol, tuna, dan marlin raksasa.', icon: '🚤', minLv: 1, recLv: 15, start: 'L1' },
  { id: 'kolam', name: 'Kolam Pemancingan', desc: 'Kolam harian & galatama ala kampung: saung bambu, sawah, kelapa, lampu malam. Lele, bawal, mas, patin.', icon: '🛖', minLv: 1, recLv: 1, start: 'K1' },
  { id: 'bakau', name: 'Muara Bakau', desc: 'Hutan mangrove & jembatan papan di muara, senja keemasan. Kakap putih, bandeng, belanak, kakap merah.', icon: '🌅', minLv: 1, recLv: 5, start: 'M1' },
  { id: 'gambut', name: 'Sungai Gambut', desc: 'Sungai air hitam Kalimantan: rumah lanting, perahu klotok, hutan rawa berkabut. Tapah, lais, jelawat, toman.', icon: '🛶', minLv: 1, recLv: 7, start: 'G1' },
  { id: 'pelabuhan', name: 'Pelabuhan Malam', desc: 'Pemecah ombak & dermaga beton, mercusuar, bagan berlampu. Layur, barakuda, tongkol, kakap.', icon: '⚓', minLv: 1, recLv: 10, start: 'H1' },
  { id: 'laguna', name: 'Laguna Karst', desc: 'Laguna toska di antara pulau batu kapur ala Raja Ampat, pondok apung. Kuwe rambe (GT), kakatua, barakuda, kerapu.', icon: '🏝️', minLv: 1, recLv: 13, start: 'R1' },
];
export const DEFAULT_SPOTS: SpotDef[] = [
  { id: 'D1', name: 'Dermaga Serene D1', desc: 'Ujung dermaga kayu, air jernih dan tenang', depth: '2–4 m', loc: 'serene', minLv: 1, recLv: 1, stock: { nila: 22, mujair: 14, mas: 8, patin: 3, gabus: 4, baung: 3, toman: 1 } },
  { id: 'D2', name: 'Pondok Panggung D2', desc: 'Teras pondok di atas air, dalam dan teduh', depth: '4–6 m', loc: 'serene', minLv: 1, recLv: 1, stock: { nila: 14, mas: 12, patin: 6, baung: 6, toman: 2, mujair: 8 } },
  { id: 'D3', name: 'Tepi Batu D3', desc: 'Bebatuan berbunga di tepi danau, tempat predator berburu', depth: '1–3 m', loc: 'serene', minLv: 1, recLv: 1, stock: { nila: 10, mujair: 10, gabus: 12, toman: 3, mas: 4 } },
  { id: 'A1', name: 'Dermaga Kayu A1', desc: 'Air tenang, cocok untuk pemula', depth: '2–3 m', loc: 'danau', minLv: 1, recLv: 1, stock: { nila: 15, mujair: 25, mas: 4, patin: 2, gabus: 6, baung: 4, toman: 1 } },
  { id: 'B3', name: 'Keramba Apung B3', desc: 'Di antara keramba, arus tenang dan dalam', depth: '6–8 m', loc: 'danau', minLv: 1, recLv: 1, stock: { nila: 25, mujair: 10, mas: 12, patin: 6, gabus: 4, baung: 6, toman: 3 } },
  { id: 'C2', name: 'Tepi Rumput C2', desc: 'Dangkal di tepi rumput, cocok untuk predator', depth: '1–2 m', loc: 'danau', minLv: 1, recLv: 1, stock: { nila: 10, mujair: 12, mas: 3, patin: 1, gabus: 14, baung: 2, toman: 2 } },
  { id: 'S1', name: 'Batu Besar S1', desc: 'Di atas batu besar di tepi arus', depth: '2–4 m', loc: 'sungai', minLv: 1, recLv: 5, stock: { jelawat: 14, baung: 10, semah: 3, belida: 2, gabus: 6, patin: 4 } },
  { id: 'S2', name: 'Pusaran Tikungan S2', desc: 'Air berputar di tikungan, ikan besar menunggu mangsa', depth: '3–5 m', loc: 'sungai', minLv: 1, recLv: 5, stock: { jelawat: 8, baung: 8, semah: 6, belida: 4, toman: 2, patin: 5 } },
  { id: 'S3', name: 'Jembatan Gantung S3', desc: 'Lempar dari atas jembatan ke tengah arus', depth: '3–6 m', loc: 'sungai', minLv: 1, recLv: 5, stock: { jelawat: 10, baung: 6, semah: 5, belida: 5, patin: 6 } },
  { id: 'P1', name: 'Ujung Karang P1', desc: 'Ujung karang yang menjorok ke laut', depth: '4–8 m', loc: 'pantai', minLv: 1, recLv: 10, stock: { kerapu: 8, kakap: 8, baronang: 10, tongkol: 2 } },
  { id: 'P2', name: 'Pantai Pasir P2', desc: 'Lempar jauh melewati ombak dari pasir', depth: '1–4 m', loc: 'pantai', minLv: 1, recLv: 10, stock: { baronang: 18, kakap: 6, kerapu: 2 } },
  { id: 'P3', name: 'Dermaga Nelayan P3', desc: 'Ujung dermaga, air dalam dan jernih', depth: '5–7 m', loc: 'pantai', minLv: 1, recLv: 10, stock: { kakap: 10, kerapu: 6, baronang: 12, tongkol: 3 } },
  { id: 'L1', name: 'Haluan Kapal L1', desc: 'Depan kapal, menghadap laut lepas', depth: '40–60 m', loc: 'laut', minLv: 1, recLv: 15, stock: { tongkol: 20, tuna: 6, marlin: 2, kakap: 4 } },
  { id: 'L2', name: 'Buritan Kapal L2', desc: 'Belakang kapal, tempat umpan diseret', depth: '40–60 m', loc: 'laut', minLv: 1, recLv: 15, stock: { tongkol: 16, tuna: 8, marlin: 3 } },
  { id: 'L3', name: 'Lambung Kiri L3', desc: 'Sisi kapal, dekat rumpon', depth: '40–60 m', loc: 'laut', minLv: 1, recLv: 15, stock: { tongkol: 18, tuna: 5, kerapu: 3, kakap: 4 } },
  { id: 'K1', name: 'Saung Galatama K1', desc: 'Saung bambu di tepi kolam galatama, ikan besar dilepas tiap pagi', depth: '1,5–2,5 m', loc: 'kolam', minLv: 1, recLv: 1, stock: { mas: 14, bawal: 12, patin: 10, lele: 8, nila: 6 } },
  { id: 'K2', name: 'Kolam Harian K2', desc: 'Kolam harian ramai, ikan banyak tapi lebih kecil', depth: '1–1,5 m', loc: 'kolam', minLv: 1, recLv: 1, stock: { lele: 22, nila: 18, bawal: 8, mas: 6, mujair: 8 } },
  { id: 'K3', name: 'Kolam Babon K3', desc: 'Kolam indukan: sedikit ikan, tapi babon berbobot besar', depth: '2–3 m', loc: 'kolam', minLv: 1, recLv: 1, stock: { patin: 8, mas: 8, bawal: 6, lele: 4 } },
  { id: 'M1', name: 'Ujung Jembatan Papan M1', desc: 'Ujung titian kayu di tengah mangrove, menghadap muara', depth: '2–4 m', loc: 'bakau', minLv: 1, recLv: 5, stock: { kakapputih: 8, bandeng: 10, belanak: 14, kakap: 4 } },
  { id: 'M2', name: 'Gazebo Bakau M2', desc: 'Gazebo di tikungan sungai kecil, arus pasang-surut membawa umpan', depth: '1–3 m', loc: 'bakau', minLv: 1, recLv: 5, stock: { belanak: 16, bandeng: 12, kakapputih: 5, kakap: 3, baronang: 4 } },
  { id: 'M3', name: 'Akar Bakau M3', desc: 'Tepi lumpur di antara akar napas, sarang kakap', depth: '1–2 m', loc: 'bakau', minLv: 1, recLv: 5, stock: { kakap: 8, kakapputih: 10, belanak: 8, kerapu: 2 } },
  { id: 'G1', name: 'Teras Rumah Lanting G1', desc: 'Teras rumah apung di atas air hitam yang tenang', depth: '4–7 m', loc: 'gambut', minLv: 1, recLv: 7, stock: { lais: 14, jelawat: 10, baung: 8, tapah: 3, toman: 3 } },
  { id: 'G2', name: 'Dermaga Klotok G2', desc: 'Dermaga tempat perahu klotok bersandar, tepi tikungan dalam', depth: '5–9 m', loc: 'gambut', minLv: 1, recLv: 7, stock: { tapah: 5, baung: 10, lais: 8, toman: 4, patin: 6 } },
  { id: 'G3', name: 'Tepi Rawa G3', desc: 'Tepi hutan rawa gambut, gabus & toman berburu di bayangan pohon', depth: '1–3 m', loc: 'gambut', minLv: 1, recLv: 7, stock: { gabus: 12, toman: 6, jelawat: 8, lais: 6 } },
  { id: 'H1', name: 'Ujung Pemecah Ombak H1', desc: 'Ujung pemecah ombak dekat mercusuar, arus laut lepas', depth: '6–10 m', loc: 'pelabuhan', minLv: 1, recLv: 10, stock: { barakuda: 8, tongkol: 10, kuwe: 3, layur: 6 } },
  { id: 'H2', name: 'Dermaga Beton H2', desc: 'Dermaga kapal nelayan, layur naik ke bawah lampu', depth: '5–8 m', loc: 'pelabuhan', minLv: 1, recLv: 10, stock: { layur: 16, kakap: 6, barakuda: 4, baronang: 6 } },
  { id: 'H3', name: 'Titian Bagan H3', desc: 'Titian apung di samping bagan berlampu terang', depth: '8–12 m', loc: 'pelabuhan', minLv: 1, recLv: 10, stock: { layur: 12, tongkol: 8, barakuda: 6, kakap: 4 } },
  { id: 'R1', name: 'Pondok Apung R1', desc: 'Teras pondok di atas laguna toska, karang terlihat jelas', depth: '3–6 m', loc: 'laguna', minLv: 1, recLv: 13, stock: { kakatua: 14, kerapu: 6, baronang: 8, kuwe: 3 } },
  { id: 'R2', name: 'Pasir Putih R2', desc: 'Pantai pasir putih menghadap celah antar pulau karst', depth: '2–8 m', loc: 'laguna', minLv: 1, recLv: 13, stock: { kuwe: 5, barakuda: 8, kakatua: 8, kakap: 4 } },
  { id: 'R3', name: 'Tebing Karst R3', desc: 'Pinggir tebing batu kapur, air dalam tempat kuwe besar berpatroli', depth: '10–20 m', loc: 'laguna', minLv: 1, recLv: 13, stock: { kuwe: 7, barakuda: 7, kerapu: 6, tongkol: 4 } },
];

// pengali per sub-zona tempat umpan mendarat
export const SUB_MUL: Partial<Record<SubZone, Partial<Record<SpeciesId, number>>>> = {
  dermaga: { gabus: 1.4, mujair: 1.25, nila: 1.1 },
  keramba: { nila: 1.5, mujair: 1.3, mas: 1.5, patin: 1.4, toman: 0.6 },
  lepas:   { toman: 1.7, baung: 1.5, patin: 1.2, nila: 0.7, mujair: 0.7 },
};

export const START_COINS = 300;
export const START_BAIT = 20;
export const BASKET_SIZE = 10;
/** Keranjang besar (sekali beli, permanen): kapasitas 20 ikan. */
export const BASKET_BIG_SIZE = 20, BASKET_BIG_PRICE = 500;

// Mode anti-panas: tingkat grafis otomatis, batas FPS, resolusi dinamis.
import { store } from './store';

export type Tier = 'hemat' | 'sedang' | 'tinggi';
export interface TierCfg {
  maxDpr: number; shadows: boolean; shadowSize: number; reflection: boolean; reflScale: number; reflEvery: number;
  grass: number; trees: number; nearTrees: number; birds: boolean; flare: boolean; antialias: boolean; terrainSeg: number;
}
export const TIERS: Record<Tier, TierCfg> = {
  hemat:  { maxDpr: 1.0,  shadows: false, shadowSize: 512,  reflection: false, reflScale: 0.25, reflEvery: 3, grass: 900, trees: 0.45, nearTrees: 2,  birds: false, flare: false, antialias: false, terrainSeg: 96 },
  sedang: { maxDpr: 1.35, shadows: true,  shadowSize: 1024, reflection: true,  reflScale: 0.3,  reflEvery: 1, grass: 2600, trees: 0.8,  nearTrees: 5,  birds: true,  flare: false, antialias: false, terrainSeg: 128 },
  tinggi: { maxDpr: 1.75, shadows: true,  shadowSize: 2048, reflection: true,  reflScale: 0.5,  reflEvery: 1, grass: 5000, trees: 1.0,  nearTrees: 9, birds: true,  flare: true,  antialias: true,  terrainSeg: 160 },
};

export const isMobile = typeof navigator !== 'undefined' && (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && typeof innerWidth !== 'undefined' && innerWidth < 1100));

export function autoTier(): Tier {
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4;
  const cores = navigator.hardwareConcurrency ?? 4;
  // HP dengan RAM ≤ 4 GB (deviceMemory melaporkan 4 atau kurang) selalu 'hemat'
  if (isMobile) return mem <= 4 || cores <= 6 ? 'hemat' : 'sedang';
  return mem <= 4 || cores <= 4 ? 'sedang' : 'tinggi';
}

export const settings = {
  tierPref: store.get<'auto' | Tier>('tier', 'auto'),
  fpsPref: store.get<'auto' | 30 | 45 | 60>('fps', 'auto'),
  sound: store.get('sound', true),
  vibrate: store.get('vibrate', true),
  showFps: store.get('showFps', false),
  /** Main lama / hemat baterai: 'auto' = nyala sendiri bila baterai < 20% dan tidak diisi daya. */
  saverPref: store.get<'auto' | 'on' | 'off'>('saver', 'auto'),
  save() { store.set('tier', this.tierPref); store.set('fps', this.fpsPref); store.set('sound', this.sound); store.set('vibrate', this.vibrate); store.set('showFps', this.showFps); store.set('saver', this.saverPref); },
};

const qTier = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('tier') as Tier | null;
export const tier: Tier = qTier && qTier in TIERS ? qTier : settings.tierPref === 'auto' ? autoTier() : settings.tierPref;
export const Q: TierCfg = TIERS[tier];

/** Baterai lemah (Battery Status API; tersedia di WebView Android, tidak di iOS). */
let lowBattery = false;
if (typeof navigator !== 'undefined') void (navigator as unknown as { getBattery?: () => Promise<{ level: number; charging: boolean; addEventListener(e: string, f: () => void): void }> })
  .getBattery?.().then(b => { const f = () => { lowBattery = b.level < 0.2 && !b.charging; }; f(); b.addEventListener('levelchange', f); b.addEventListener('chargingchange', f); }).catch(() => {});
export const saverOn = () => settings.saverPref === 'on' || (settings.saverPref === 'auto' && lowBattery);

/** Target FPS. HP: 30 tetap (stabil = terasa mulus & tidak cepat panas); hemat baterai: 20 saat menunggu ikan. Menu 20. */
export function targetFps(activity: 'active' | 'idle' | 'menu'): number {
  if (activity === 'menu') return settings.fpsPref === 'auto' ? 20 : Math.min(20, settings.fpsPref);
  if (settings.fpsPref !== 'auto') return activity === 'idle' && saverOn() ? Math.min(20, settings.fpsPref) : settings.fpsPref;
  if (isMobile) return activity === 'idle' && saverOn() ? 20 : 30;
  return activity === 'active' ? 60 : 30;
}

/**
 * Pengatur irama gambar yang selaras dengan layar (vsync). Layar HP 60/90/120 Hz: 30 FPS = gambar tiap 2/3/4 kedipan layar
 * dengan jarak yang SAMA. Cara lama (membandingkan waktu) menghasilkan jarak tidak rata, mis. 24 FPS di layar 60 Hz
 * menjadi selang-seling 33/50 ms → terasa patah-patah.
 */
export class FramePacer {
  private vs = 1000 / 60; private prev = 0; private skip = 0;
  /** true bila gambar ini perlu dirender. */
  tick(now: number, target: number): boolean {
    const d = now - this.prev; this.prev = now;
    // perkirakan selang vsync dari selang requestAnimationFrame yang wajar (abaikan jeda/tab tersembunyi)
    if (d > 4 && d < 40) this.vs += (d - this.vs) * 0.1;
    const n = Math.max(1, Math.round(1000 / target / this.vs));
    if (++this.skip < n) return false;
    this.skip = 0; return true;
  }
  /** paksa gambar berikutnya dirender (setelah ukuran layar berubah: kanvas kosong tidak boleh terlihat) */
  force() { this.skip = 1e9; }
  get refreshHz() { return Math.round(1000 / this.vs); }
}

/**
 * Resolusi dinamis yang TENANG: berubah jarang & berjenjang (setiap perubahan = alokasi ulang memori grafis = sentakan +
 * kanvas dibersihkan), supaya tidak berkedip. Turun bila 2 jendela 2 dtk berturut-turut lambat; naik hanya setelah
 * 12 dtk lancar dan 20 dtk sejak perubahan terakhir. Bila naik lalu langsung lambat lagi, jeda naik berikutnya digandakan.
 */
export class DynRes {
  static LEVELS = [1, 0.85, 0.72, 0.6];
  level = 0; private acc = 0; private frames = 0; private slow = 0; private good = 0;
  private sinceChange = 0; private raiseWait = 20; private lastWasRaise = false;
  constructor(private maxDpr: number, private capMul = () => 1) {}
  get scale() { return DynRes.LEVELS[this.level]; }
  get dpr() { return Math.max(0.6, Math.min(this.maxDpr, typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1) * this.scale * this.capMul()); }
  /** dt = waktu antar gambar; target = FPS yang dituju; hold = jangan ubah sekarang (adu tarik). Mengembalikan true bila resolusi berubah. */
  tick(dt: number, target: number, hold = false): boolean {
    if (dt > 0.25) { this.acc = 0; this.frames = 0; return false; } // jeda (aplikasi ditinggal) bukan tanda lambat
    this.acc += dt; this.frames++; this.sinceChange += dt;
    if (this.acc < 2) return false;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    if (fps < target * 0.85) { this.slow++; this.good = 0; } else if (fps >= target * 0.97) { this.good++; this.slow = 0; } else { this.slow = 0; this.good = 0; }
    if (hold) return false;
    if (this.slow >= 2 && this.level < DynRes.LEVELS.length - 1) {
      if (this.lastWasRaise && this.sinceChange < 20) this.raiseWait = Math.min(300, this.raiseWait * 2);
      this.level++; this.slow = 0; this.sinceChange = 0; this.lastWasRaise = false; return true;
    }
    if (this.good >= 6 && this.level > 0 && this.sinceChange > this.raiseWait) {
      this.level--; this.good = 0; this.sinceChange = 0; this.lastWasRaise = true; return true;
    }
    return false;
  }
}

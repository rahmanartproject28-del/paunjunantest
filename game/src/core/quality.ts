// Mode anti-panas: tingkat grafis otomatis, batas FPS, resolusi dinamis.
import { store } from './store';

export type Tier = 'hemat' | 'sedang' | 'tinggi';
export interface TierCfg {
  maxDpr: number; shadows: boolean; shadowSize: number; reflection: boolean; reflScale: number; reflEvery: number;
  grass: number; trees: number; nearTrees: number; birds: boolean; flare: boolean; antialias: boolean; terrainSeg: number;
}
export const TIERS: Record<Tier, TierCfg> = {
  hemat:  { maxDpr: 1.0,  shadows: false, shadowSize: 512,  reflection: false, reflScale: 0.25, reflEvery: 3, grass: 900, trees: 0.45, nearTrees: 2,  birds: false, flare: false, antialias: false, terrainSeg: 96 },
  sedang: { maxDpr: 1.35, shadows: true,  shadowSize: 1024, reflection: true,  reflScale: 0.35, reflEvery: 2, grass: 2600, trees: 0.8,  nearTrees: 5,  birds: true,  flare: false, antialias: false, terrainSeg: 128 },
  tinggi: { maxDpr: 1.75, shadows: true,  shadowSize: 2048, reflection: true,  reflScale: 0.5,  reflEvery: 1, grass: 5000, trees: 1.0,  nearTrees: 9, birds: true,  flare: true,  antialias: true,  terrainSeg: 160 },
};

export const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);

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
  save() { store.set('tier', this.tierPref); store.set('fps', this.fpsPref); store.set('sound', this.sound); store.set('vibrate', this.vibrate); store.set('showFps', this.showFps); },
};

const qTier = new URLSearchParams(location.search).get('tier') as Tier | null;
export const tier: Tier = qTier && qTier in TIERS ? qTier : settings.tierPref === 'auto' ? autoTier() : settings.tierPref;
export const Q: TierCfg = TIERS[tier];

/** Target FPS: HP 30 saat aktif, 24 saat menunggu ikan; komputer 60/30; menu 20. */
export function targetFps(activity: 'active' | 'idle' | 'menu'): number {
  if (settings.fpsPref !== 'auto') return activity === 'menu' ? Math.min(20, settings.fpsPref) : settings.fpsPref;
  if (activity === 'menu') return 20;
  if (isMobile) return activity === 'active' ? 30 : 24;
  return activity === 'active' ? 60 : 30;
}

/** Resolusi dinamis: turun bila perangkat tidak sanggup, naik lagi saat longgar. */
export class DynRes {
  scale = 1; private acc = 0; private frames = 0; private slow = 0;
  constructor(private maxDpr: number) {}
  get dpr() { return Math.max(0.6, Math.min(this.maxDpr, devicePixelRatio) * this.scale); }
  /** dt = waktu antar gambar; target = FPS yang dituju. Mengembalikan true bila resolusi berubah. */
  tick(dt: number, target: number): boolean {
    this.acc += dt; this.frames++;
    if (this.acc < 2) return false;
    const fps = this.frames / this.acc; this.acc = 0; this.frames = 0;
    const old = this.scale;
    if (fps < target * 0.8) { this.slow++; this.scale = Math.max(0.6, this.scale - 0.1); }
    else if (fps > target * 0.95 && this.scale < 1) { this.slow = 0; this.scale = Math.min(1, this.scale + 0.05); }
    return old !== this.scale;
  }
}

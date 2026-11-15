// Perilaku khusus aplikasi HP (Android/iOS lewat Capacitor), tetap aman di browser:
// - tombol Kembali Android: tutup lapisan teratas dulu, baru tanya keluar
// - aplikasi ditinggal (pause) → suara & mancing otomatis berhenti, layar boleh mati; dibuka lagi (resume) → lanjut
// - layar tidak mati selama bermain (Screen Wake Lock API: Android WebView & iOS 18.4+)
// - bilah status/navigasi disembunyikan (SystemBars bawaan Capacitor 8)
import { Capacitor, SystemBars } from '@capacitor/core';
import { App } from '@capacitor/app';

export const platform = (): 'android' | 'ios' | 'web' => {
  const p = Capacitor.getPlatform();
  return p === 'android' || p === 'ios' ? p : 'web';
};
export const isNative = () => Capacitor.isNativePlatform();

/** Keadaan layar saat tombol Kembali ditekan (urutan pemeriksaan = urutan prioritas). */
export interface BackState {
  sheet: boolean;        // lembar menu/panel terbuka
  lossCard: boolean;     // kartu "ikan lepas"
  mode: string;          // mode Fishing: menu, idle, cast, wait, fight, landing, trophy, walk, …
  autoOn: boolean;       // mancing otomatis berjalan
  autoWalk: boolean;     // avatar sedang berjalan otomatis ke tujuan
  inGame: boolean;       // HUD tampil (bukan layar menu utama)
}
export type BackAction = 'closeSheet' | 'closeLoss' | 'holdFight' | 'holdTrophy' | 'stopAuto' | 'stopWalk' | 'toMenu' | 'askExit';

/** Satu ketukan Kembali = satu langkah mundur; keluar aplikasi hanya dari menu utama dan setelah konfirmasi. */
export function backAction(s: BackState): BackAction {
  if (s.sheet) return 'closeSheet';
  if (s.lossCard) return 'closeLoss';
  if (s.mode === 'fight' || s.mode === 'landing') return 'holdFight';
  if (s.mode === 'trophy') return 'holdTrophy';
  if (s.autoOn) return 'stopAuto';
  if (s.autoWalk) return 'stopWalk';
  if (s.inGame) return 'toMenu';
  return 'askExit';
}

export interface MobileHooks {
  backState(): BackState;
  onBack(a: BackAction): void;
  /** aplikasi ke latar belakang (pindah aplikasi, layar dikunci, telepon masuk) */
  onPause(): void;
  /** kembali ke depan; `away` = lama ditinggal dalam detik */
  onResume(away: number): void;
}

let wake: { release(): Promise<void> } | null = null, wantWake = false;
async function grabWake() {
  if (!wantWake || wake || document.hidden) return;
  const wl = (navigator as unknown as { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void>; addEventListener(e: string, f: () => void): void }> } }).wakeLock;
  if (!wl) return;
  try { const s = await wl.request('screen'); wake = s; s.addEventListener('release', () => { if (wake === s) wake = null; }); }
  catch { /* ditolak (mode hemat daya / tidak didukung) — layar mengikuti pengaturan HP */ }
}
/** Layar tetap menyala selama bermain; dilepas di menu utama & saat aplikasi ditinggal. */
export function keepAwake(on: boolean) {
  wantWake = on;
  if (on) void grabWake();
  else if (wake) { const w = wake; wake = null; void w.release().catch(() => {}); }
}

/** Keluar aplikasi (Android). iOS tidak mengizinkan aplikasi menutup dirinya sendiri. */
export function exitApp() { if (platform() === 'android') void App.exitApp(); }

export function initMobile(h: MobileHooks) {
  let pausedAt = 0, paused = false;
  const pause = () => { if (paused) return; paused = true; pausedAt = Date.now(); h.onPause(); };
  const resume = () => {
    if (!paused) return; paused = false;
    h.onResume(Math.round((Date.now() - pausedAt) / 1000));
    void grabWake();
  };
  // browser & WebView: visibilitychange; aplikasi asli: event App (lebih andal di iOS saat telepon masuk)
  document.addEventListener('visibilitychange', () => (document.hidden ? pause() : resume()));
  if (isNative()) {
    void App.addListener('pause', pause);
    void App.addListener('resume', resume);
    void App.addListener('backButton', () => h.onBack(backAction(h.backState())));
    void SystemBars.hide().catch(() => {});
  }
  // browser desktop: Esc meniru tombol Kembali (kecuali saat mengetik)
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || (e.target as HTMLElement)?.tagName === 'INPUT') return;
    const a = backAction(h.backState());
    if (a !== 'askExit' || isNative()) h.onBack(a);
  });
}

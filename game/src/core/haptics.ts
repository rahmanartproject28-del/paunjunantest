// Getaran HP: di aplikasi Android/iOS memakai Capacitor Haptics, di browser memakai navigator.vibrate.
import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { settings } from './quality';

const native = Capacitor.isNativePlatform();

export function buzz(ms: number | number[]) {
  if (!settings.vibrate) return;
  if (native) {
    const d = Array.isArray(ms) ? ms.reduce((a, b) => a + b, 0) : ms;
    Haptics.impact({ style: d > 80 ? ImpactStyle.Heavy : d > 25 ? ImpactStyle.Medium : ImpactStyle.Light }).catch(() => {});
    return;
  }
  try { navigator.vibrate?.(ms); } catch { /* tidak didukung */ }
}

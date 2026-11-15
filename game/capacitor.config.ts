import type { CapacitorConfig } from '@capacitor/cli';

// Konfigurasi aplikasi Android/iOS. Game dibangun ke folder dist lalu dibungkus Capacitor.
const config: CapacitorConfig = {
  appId: 'com.paunjunan.mancing',
  appName: 'PAUNJUNAN',
  webDir: 'dist',
  backgroundColor: '#0b1d1a',
  android: { allowMixedContent: false, webContentsDebuggingEnabled: false },
  ios: { contentInset: 'never' },
  plugins: {
    // layar penuh: bilah status & navigasi disembunyikan sejak aplikasi dibuka (MainActivity juga membuatnya imersif)
    SystemBars: { hidden: true, style: 'DARK' },
    // pembelian koin: JANGAN selesaikan otomatis — server memverifikasi dulu, baru consume (lihat src/core/purchase.ts)
    NativePurchases: { autoFinishTransactions: false },
  },
};
export default config;

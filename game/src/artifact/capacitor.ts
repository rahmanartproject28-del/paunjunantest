// Stub Capacitor untuk versi web/artifact (tidak ada API HP asli; getaran lewat navigator.vibrate di haptics.ts).
export const Capacitor = { isNativePlatform: () => false, getPlatform: () => 'web' };
export const ImpactStyle = { Light: 'LIGHT', Medium: 'MEDIUM', Heavy: 'HEAVY' };
export const Haptics = { impact: async (_o?: unknown) => {}, vibrate: async (_o?: unknown) => {} };
export const App = { addListener: async (..._a: unknown[]) => ({ remove: async () => {} }), exitApp: async () => {} };
export const SystemBars = { hide: async (_o?: unknown) => {}, show: async (_o?: unknown) => {} };

names=$(grep -rhoE "THREE\.[A-Z][A-Za-z0-9]+" ../w/paunjunan/game/src | sed 's/THREE\.//' | sort -u)
{
echo "declare module 'three' {"
for n in $names; do echo "  export const $n: any; export type $n = any;"; done
echo "  export const MathUtils: any; export const REVISION: any;"
echo "}"
echo "declare module 'three/examples/jsm/loaders/GLTFLoader.js' { export const GLTFLoader: any; export type GLTFLoader = any; export type GLTF = any; }"
echo "declare module 'three/examples/jsm/utils/SkeletonUtils.js' { export const clone: any; }"
echo "declare module 'three/*';"; echo "declare module 'three/examples/jsm/postprocessing/EffectComposer.js' { export const EffectComposer: any; export type EffectComposer = any; }"
echo "declare module 'ez-tree-src/*' { const x: any; export = x; }"
echo "declare module '@capacitor/haptics' { export const Haptics: any; export const ImpactStyle: any; }"
echo "declare module '@capacitor/app' { export const App: { addListener(e: 'pause' | 'resume' | 'backButton', f: (...a: any[]) => void): Promise<{ remove(): Promise<void> }>; exitApp(): Promise<void> }; }"
echo "declare module '@capacitor/core' { export const Capacitor: { isNativePlatform(): boolean; getPlatform(): string; Plugins?: Record<string, unknown> }; export const SystemBars: { hide(o?: { bar?: string }): Promise<void>; show(o?: { bar?: string }): Promise<void> }; }"
echo "declare module 'vitest' { export const describe: any, it: any, expect: any, beforeEach: any, afterAll: any; }"
} > three-stub.d.ts

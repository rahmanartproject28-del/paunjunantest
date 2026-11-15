import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { preloadTreeTextures } from '../world/ezTextures';

export interface Assets {
  angler: GLTF; motion: GLTF | null; fish: GLTF; stork: GLTF; parrot: GLTF; rocks: GLTF[];
  tex: { grass: THREE.Texture; dirt: THREE.Texture; dirtN: THREE.Texture; water: THREE.Texture; blade: THREE.Texture };
}

export async function loadAssets(onProgress: (p: number) => void): Promise<Assets> {
  const mgr = new THREE.LoadingManager();
  mgr.onProgress = (_u, done, total) => onProgress(done / total);
  const gl = new GLTFLoader(mgr), tl = new THREE.TextureLoader(mgr);
  const g = (n: string) => gl.loadAsync('assets/m/' + n.replace('.glb', '.json'));
  const t = (n: string, srgb = true) => tl.loadAsync('assets/tex/' + n).then(x => { if (srgb) x.colorSpace = THREE.SRGBColorSpace; return x; });
  const [angler, motion, fish, stork, parrot, r1, r2, grass, dirt, dirtN, water, blade] = await Promise.all([
    g('angler.glb'), g('motion.glb').catch(() => null), g('fish.glb'), g('stork.glb'), g('parrot.glb'), g('rock1.glb'), g('rock2.glb'),
    t('grass.webp'), t('dirt.webp'), t('dirt_n.webp', false), t('waternormals.jpg', false), t('grass_blade.webp'),
    preloadTreeTextures(),
  ]);
  return { angler, motion, fish, stork, parrot, rocks: [r1, r2], tex: { grass, dirt, dirtN, water, blade } };
}

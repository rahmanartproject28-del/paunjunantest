// Pengganti tekstur bawaan EZ-Tree: versi kecil (256 px, webp) yang kita siapkan sendiri.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const base = 'assets/tex/';
const cache = new Map<string, THREE.Texture>();
const BARK_FALLBACK: Record<string, string> = { birch: 'birch', oak: 'oak', pine: 'pine', willow: 'willow' };

function load(name: string, srgb: boolean) {
  let t = cache.get(name);
  if (!t) {
    t = loader.load(base + name);
    t.premultiplyAlpha = false;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    cache.set(name, t);
  }
  return t;
}

export function getBarkTexture(barkType: string, fileType: string, scale = { x: 1, y: 1 }) {
  const b = BARK_FALLBACK[barkType] ?? 'oak';
  // ao & roughness tidak dipakai (hemat memori); normal & warna saja
  if (fileType === 'ao' || fileType === 'roughness') return null as unknown as THREE.Texture;
  const t = load(fileType === 'normal' ? `bark_${b}_n.webp` : `bark_${b}.webp`, fileType === 'color').clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(scale.x, 1 / scale.y);
  t.needsUpdate = true;
  return t;
}

export function getLeafTexture(leafType: string) {
  return load(`leaf_${leafType}.webp`, true);
}

/** Muat semua tekstur pohon lebih dulu, supaya gambar pohon jauh (impostor) tidak gundul. */
export async function preloadTreeTextures() {
  const names: [string, boolean][] = [];
  for (const b of ['oak', 'willow', 'pine', 'birch']) names.push([`bark_${b}.webp`, true], [`bark_${b}_n.webp`, false]);
  for (const l of ['oak', 'ash', 'aspen', 'pine']) names.push([`leaf_${l}.webp`, true]);
  await Promise.all(names.map(async ([n, srgb]) => {
    const t = await loader.loadAsync(base + n);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 2;
    cache.set(n, t);
  }));
}

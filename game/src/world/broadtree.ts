// Pohon berdaun lebar bertajuk melebar (gaya pohon oak/ek tua: batang pendek tebal yang memutar,
// dahan besar menyebar ke samping, rimbun gumpalan daun). Dibuat prosedural sekali → dipakai InstancedMesh.
// Batang + dahan = 1 geometri (tekstur kulit kayu), daun = 1 geometri kartu bertekstur gugus daun (alphaTest).
import * as THREE from 'three';

function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Kulit kayu abu-abu kecokelatan dengan retakan memanjang. */
function barkTexture() {
  const W = 128, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, R = rng(11), img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const streak = Math.sin(x * 0.45 + Math.sin(y * 0.05 + x * 0.1) * 2.5) * 0.5 + 0.5;
    const k = 0.72 + streak * 0.18 + R() * 0.12, i = (y * W + x) * 4;
    img.data[i] = 150 * k; img.data[i + 1] = 143 * k; img.data[i + 2] = 132 * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  g.strokeStyle = 'rgba(52,44,38,0.75)';
  for (let i = 0; i < 46; i++) {   // retakan memanjang bercabang
    let x = R() * W, y = R() * H; g.lineWidth = 0.8 + R() * 1.6; g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 6; j++) { x += (R() - 0.5) * 6; y += 6 + R() * 12; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 18; i++) { g.fillStyle = `rgba(${90 + R() * 40},${100 + R() * 40},${70 + R() * 20},0.25)`; g.beginPath(); g.ellipse(R() * W, R() * H, 4 + R() * 8, 8 + R() * 14, 0, 0, 7); g.fill(); } // lumut tipis
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Gugus daun: puluhan daun oval berujung runcing, beberapa tangkai kecil, latar transparan. */
function leafTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!, R = rng(23);
  g.strokeStyle = 'rgba(70,58,40,0.9)'; g.lineWidth = 2;
  for (let i = 0; i < 9; i++) { const a = R() * 6.28; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.36, S / 2 + Math.sin(a) * S * 0.36); g.stroke(); }
  for (let i = 0; i < 150; i++) {
    const a = R() * 6.28, d = Math.sqrt(R()) * S * 0.42, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d * 0.9;
    const L = 13 + R() * 12, W = L * (0.42 + R() * 0.12), rot = R() * 6.28;
    const shade = R(), top = 1 - d / (S * 0.5);
    const r = 48 + shade * 40 + top * 18, gr = 92 + shade * 58 + top * 22, b = 30 + shade * 22;
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = `rgb(${r | 0},${gr | 0},${b | 0})`;
    g.beginPath(); g.moveTo(-L / 2, 0); g.quadraticCurveTo(0, -W, L / 2, 0); g.quadraticCurveTo(0, W, -L / 2, 0); g.fill();
    g.strokeStyle = `rgba(${(r * 0.7) | 0},${(gr * 0.8) | 0},${(b * 0.7) | 0},0.8)`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-L / 2, 0); g.lineTo(L / 2, 0); g.stroke(); // tulang daun
    g.restore();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** Tabung meruncing mengikuti kurva (TubeGeometry lalu jari-jari tiap cincin diskalakan). */
function taperTube(pts: THREE.Vector3[], r0: number, r1: number, seg: number, rad: number, flare = 0) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg, c = curve.getPointAt(t);
    const r = r0 + (r1 - r0) * Math.pow(t, 0.8) + flare * Math.pow(Math.max(0, 1 - t * 6), 2);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j; v.fromBufferAttribute(p, k).sub(c);
      const bump = 1 + 0.12 * Math.sin(j * 2.1 + i * 0.7) * (flare ? 1 : 0.3);   // batang tidak bulat sempurna
      v.multiplyScalar(r * bump).add(c); p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  // uv: v mengikuti panjang (berulang) supaya kulit kayu tidak melar
  const uv = g.attributes.uv as THREE.BufferAttribute, len = curve.getLength();
  for (let k = 0; k < uv.count; k++) uv.setY(k, uv.getY(k) * len * 4);
  g.computeVertexNormals();
  return g.toNonIndexed();
}

function concat(list: THREE.BufferGeometry[], attrs: string[]) {
  const out = new THREE.BufferGeometry();
  for (const a of attrs) {
    const arrs = list.map(g => g.attributes[a] as THREE.BufferAttribute), size = arrs[0].itemSize;
    const total = arrs.reduce((s, x) => s + x.array.length, 0), buf = new Float32Array(total);
    let o = 0; for (const x of arrs) { buf.set(x.array as Float32Array, o); o += x.array.length; }
    out.setAttribute(a, new THREE.BufferAttribute(buf, size));
  }
  return out;
}

export interface BroadTree { bark: THREE.BufferGeometry; leaves: THREE.BufferGeometry; barkMat: THREE.MeshStandardMaterial; leafMat: THREE.MeshStandardMaterial }
const cache: Partial<Record<'full' | 'low', BroadTree>> = {};
let mats: { barkMat: THREE.MeshStandardMaterial; leafMat: THREE.MeshStandardMaterial } | null = null;
/** Pohon tinggi 1 satuan (diskalakan per instance ke 8–13 m). 'low' = versi ringan untuk pohon jauh (±1/4 segitiga). */
export function broadTree(detail: 'full' | 'low' = 'full'): BroadTree {
  const hit = cache[detail]; if (hit) return hit;
  const lo = detail === 'low';
  const R = rng(777), V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const wood: THREE.BufferGeometry[] = [], tips: THREE.Vector3[] = [];
  // batang pendek tebal yang memutar sedikit (huruf S), pangkal melebar seperti akar
  const trunkTop = V(0.03, 0.36, 0.015);
  wood.push(taperTube([V(0, -0.02, 0), V(0.012, 0.1, -0.01), V(-0.01, 0.2, 0.012), V(0.02, 0.29, 0.0), trunkTop], 0.058, 0.034, lo ? 6 : 14, lo ? 6 : 10, 0.04));
  // dahan besar menyebar (seperti gambar: dua dahan rendah memanjang ke samping, sisanya naik membentuk tajuk lebar)
  const N = 7;
  for (let i = 0; i < N; i++) {
    const az = (i / N) * Math.PI * 2 + (R() - 0.5) * 0.5, low = i < 2;
    const el = low ? 0.25 + R() * 0.15 : 0.55 + R() * 0.45, L = low ? 0.5 + R() * 0.1 : 0.36 + R() * 0.16;
    const start = trunkTop.clone().add(V(0, -(low ? 0.1 : R() * 0.05), 0));
    const dir = V(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    const mid = start.clone().addScaledVector(dir, L * 0.5).add(V(0, low ? -0.02 : 0.03, 0));
    const end = start.clone().addScaledVector(dir, L).add(V(0, low ? 0.12 : 0.1, 0));        // ujung melengkung ke atas
    wood.push(taperTube([start, mid, end], low ? 0.022 : 0.019, 0.005, lo ? 4 : 10, lo ? 4 : 6));
    tips.push(end, mid.clone().lerp(end, 0.6));
    // ranting
    for (let j = 0; j < 3; j++) {
      const t = 0.45 + j * 0.2 + R() * 0.08, a = start.clone().lerp(end, t).add(V(0, (mid.y - start.y) * 0.3, 0));
      const az2 = az + (R() - 0.5) * 1.8, el2 = 0.5 + R() * 0.6, L2 = 0.12 + R() * 0.12;
      const b = a.clone().add(V(Math.cos(az2) * Math.cos(el2) * L2, Math.sin(el2) * L2, Math.sin(az2) * Math.cos(el2) * L2));
      if (!lo) wood.push(taperTube([a, a.clone().lerp(b, 0.5).add(V(0, 0.015, 0)), b], 0.008, 0.002, 4, 4));
      tips.push(b);
    }
  }
  const bark = concat(wood, ['position', 'normal', 'uv']);
  // daun: kartu bergugus di sekitar ujung dahan, normal diarahkan keluar dari pusat tajuk (terlihat rimbun & berisi)
  const crownC = V(0.02, 0.62, 0), lp: number[] = [], ln: number[] = [], lu: number[] = [], lc: number[] = [];
  const NL = lo ? 85 : 280, q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  for (let i = 0; i < NL; i++) {
    const tip = tips[Math.floor(R() * tips.length)];
    const p = tip.clone().add(V((R() - 0.5) * 0.2, (R() - 0.35) * 0.14, (R() - 0.5) * 0.2));
    const s = (0.13 + R() * 0.1) * (lo ? 1.6 : 1.05);
    q.setFromEuler(e.set(R() * 6.28, R() * 6.28, R() * 6.28));
    const corners = [V(-s, -s, 0), V(s, -s, 0), V(s, s, 0), V(-s, -s, 0), V(s, s, 0), V(-s, s, 0)], uvs = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    const nrm = p.clone().sub(crownC).multiply(V(1, 0.7, 1)).normalize();
    const out = Math.min(1, p.distanceTo(crownC) / 0.45);
    c.setHSL(0.24 + R() * 0.05, 0.45 + R() * 0.15, 0.32 + out * 0.12 + R() * 0.06);   // gugus luar lebih terang
    corners.forEach((v, k) => { v.applyQuaternion(q).add(p); lp.push(v.x, v.y, v.z); ln.push(nrm.x, nrm.y, nrm.z); lu.push(uvs[k * 2], uvs[k * 2 + 1]); lc.push(c.r, c.g, c.b); });
  }
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3)); leaves.setAttribute('normal', new THREE.Float32BufferAttribute(ln, 3));
  leaves.setAttribute('uv', new THREE.Float32BufferAttribute(lu, 2)); leaves.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
  if (mats) { const t = { bark, leaves, ...mats }; cache[detail] = t; return t; }
  const barkMat = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95, color: 0xd8d2c8 });
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.82 });
  mats = { barkMat, leafMat };
  // angin: daun bergoyang pelan (makin tinggi makin kuat), fase berbeda tiap pohon
  leafMat.onBeforeCompile = (sh) => {
    sh.uniforms.uWind = windU;
    sh.vertexShader = 'uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
      #else
        float ph = 0.0;
      #endif
      float sway = sin(uWind * 1.3 + ph + position.y * 3.0) * 0.012 * smoothstep(0.35, 1.0, position.y);
      transformed.x += sway; transformed.z += sway * 0.6;`);
  };
  leafMat.customProgramCacheKey = () => 'broadLeaf';
  const out = { bark, leaves, barkMat, leafMat }; cache[detail] = out;
  return out;
}
/** waktu angin (diperbarui dunia tiap gambar) */
export const windU = { value: 0 };

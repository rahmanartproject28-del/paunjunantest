// Pemancing: model manusia berkerangka, topi pet, pose memancing lewat IK (tanpa file animasi),
// joran di tangan kanan, tangan kiri di pantat joran atau memutar engkol reel.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { solveTwoBone, rotateBoneWorld, setWorldQuaternion, quatFromAxes } from './ik';
import { Rod } from './tackle';
import { COSMETICS, DEFAULT_LOOK, type Look } from '@paunjunan/shared';

export interface AnglerPose {
  hand: THREE.Vector3;        // posisi tangan kanan (lokal badan: x kanan, y atas, z belakang)
  pitch: number;              // sudut joran dari mendatar (rad), positif = ke atas
  yaw: number;                // belok joran relatif hadap badan (rad), positif = ke kiri
  roll: number;
  load: THREE.Vector3;        // beban lengkung joran (dunia)
  reeling: boolean; reelAngle: number;
  lean: number;               // condong badan ke belakang (rad)
  twist: number;              // putar badan (rad)
  look: THREE.Vector3 | null; // titik dunia yang dilihat
  leftOnButt: boolean;
  holdFish: THREE.Object3D | null;
  /** cara memamerkan ikan: 'angkat' = satu tangan mengangkat ikan tinggi (rahang dijepit), 'dada' = dua tangan di depan dada */
  holdStyle: 'angkat' | 'dada';
  breathe: number;
  walk: number;               // 0 = diam, 1 = berjalan, >1 = berlari (besar ayunan)
  walkPhase: number;          // fase langkah (rad)
  seat: number;               // 0 = berdiri, 1 = duduk di kotak pancing
}
/** Seberapa jauh pinggul turun saat duduk (m). */
export const SEAT_DROP = 0.48;

export function defaultPose(): AnglerPose {
  return { hand: new THREE.Vector3(0.2, 1.05, -0.34), pitch: 0.5, yaw: 0.05, roll: 0, load: new THREE.Vector3(), reeling: false, reelAngle: 0,
    lean: 0, twist: 0, look: null, leftOnButt: true, holdFish: null, holdStyle: 'angkat', breathe: 0, walk: 0, walkPhase: 0, seat: 0 };
}

function makeCap(color = 0xf2efe6, brimColor = 0x2a2d33) {
  const g = new THREE.Group();
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.108, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  crown.scale.set(1, 0.78, 1.1);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.008, 20, 1, false, -Math.PI * 0.45, Math.PI * 0.9), new THREE.MeshStandardMaterial({ color: brimColor, roughness: 0.7 }));
  brim.scale.set(0.95, 1, 0.8); brim.position.set(0, 0.004, 0.075); brim.rotation.x = 0.12;
  const button = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), crown.material); button.position.y = 0.085;
  // panel samping warna aksen
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.109, 0.11, 0.018, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x189676, roughness: 0.7 }));
  band.position.y = 0.012; band.scale.set(1, 1, 1.1);
  g.add(crown, brim, button, band);
  g.traverse(o => { o.castShadow = true; });
  return g;
}

/** Ukuran kepala (ruang lokal jangkar kepala: +Z = depan, +Y = atas), diukur dari mesh kepala. */
export interface HeadFit { cx: number; cz: number; rx: number; rz: number; top: number; eye: number }
const DEFAULT_FIT: HeadFit = { cx: 0, cz: 0.01, rx: 0.078, rz: 0.098, top: 0.19, eye: 0.1 };

let fabricTex: THREE.CanvasTexture | null = null, billTex: THREE.CanvasTexture | null = null;
/** Tekstur kain kepar: 6 panel, jahitan ganda, lubang udara (abu-abu, diwarnai lewat material.color). */
function capFabric() {
  if (fabricTex) return fabricTex;
  const W = 768, H = 192, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const tw = ((x + y) % 4 < 2 ? 1 : 0.94) * (0.93 + Math.random() * 0.07); // anyaman kepar diagonal
    const v = 236 * tw, i = (y * W + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let k = 0; k <= 6; k++) {
    const x = (k / 6) * W;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(x - 2, 0, 4, H);                 // lipatan jahitan panel
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.2; g.setLineDash([5, 4]);
    for (const o of [-7, 7]) { g.beginPath(); g.moveTo(x + o, 0); g.lineTo(x + o * 0.4, H); g.stroke(); } // jahitan ganda
    g.setLineDash([]);
    if (k < 6) { const ex = ((k + 0.5) / 6) * W; g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(ex, H * 0.74, 5, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; g.beginPath(); g.arc(ex, H * 0.74, 8, 0, 7); g.stroke(); }
  }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(0, 0, W, 5);                         // tepi bawah (ban dalam)
  fabricTex = new THREE.CanvasTexture(c); fabricTex.colorSpace = THREE.SRGBColorSpace; fabricTex.anisotropy = 4;
  return fabricTex;
}
/** Tekstur lidah topi: jahitan melengkung sejajar tepi. */
function capBill() {
  if (billTex) return billTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ececec'; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 128, 2, 1); }
  g.strokeStyle = 'rgba(0,0,0,0.38)'; g.lineWidth = 1.4; g.setLineDash([5, 4]);
  for (const w of [0.3, 0.45, 0.6, 0.75, 0.9]) { g.beginPath(); g.moveTo(0, 128 * w); g.lineTo(256, 128 * w); g.stroke(); }
  billTex = new THREE.CanvasTexture(c); billTex.colorSpace = THREE.SRGBColorSpace; return billTex;
}

/** Topi pet (baseball) 6 panel, dibentuk menurut ukuran kepala. */
function makeFittedCap(f: HeadFit, color: number) {
  const g = new THREE.Group();
  // tepi depan topi 2,6 cm di atas mata (di dahi), belakang sedikit lebih rendah seperti dipakai sungguhan
  const TILT = -0.12, rx = f.rx * 1.07 + 0.005, rz = f.rz * 1.06 + 0.005;
  const frontY = f.eye + 0.026, base = frontY + rz * Math.sin(TILT), Hc = Math.max(0.06, f.top + 0.014 - base);
  const NU = 60, NV = 14, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let j = 0; j <= NV; j++) {
    const a = (j / NV) * Math.PI / 2, rad = Math.pow(Math.cos(a), 0.72), hy = Math.sin(a);
    for (let i = 0; i <= NU; i++) {
      const th = (i / NU) * Math.PI * 2, front = Math.max(0, Math.cos(th));
      const lift = 1 + 0.07 * front * Math.sin(a * 2);              // panel depan lebih tegak (topi terstruktur)
      pos.push(Math.sin(th) * rx * rad, hy * Hc * lift, Math.cos(th) * rz * rad * (1 + 0.04 * front));
      uv.push(i / NU, j / NV); // jahitan panel di u = k/6 → jahitan tengah tepat di depan
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + NU + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
  const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); cg.setIndex(idx); cg.computeVertexNormals();
  const tex = capFabric().clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.offset.x = 0;
  const fabric = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.92, side: THREE.DoubleSide });
  const crown = new THREE.Mesh(cg, fabric); g.add(crown);
  // kancing atas
  const btn = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 8), fabric); btn.scale.y = 0.55; btn.position.y = Hc * 1.0 + 0.002; g.add(btn);
  // ban dalam (sweatband) supaya tepi bawah terlihat tebal & rapi
  const band = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 48), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.7), roughness: 0.9 }));
  band.rotation.x = Math.PI / 2; band.scale.set(rx * 0.99, rz * 0.99, 0.12); band.position.y = 0.002; g.add(band);
  // lidah topi: melengkung ke bawah di sisi, condong ±14°, tebal 5 mm, bawah warna gelap
  const BU = 24, BW = 8, span = 0.92, L = 0.088;
  const top: number[] = [], bot: number[] = [], buv: number[] = [], bidx: number[] = [];
  for (let w = 0; w <= BW; w++) for (let u = 0; u <= BU; u++) {
    const uu = (u / BU) * 2 - 1, th = uu * span, ww = w / BW;
    const bx = Math.sin(th) * rx, bz = Math.cos(th) * rz;
    const dir = new THREE.Vector3(Math.sin(th) * 0.3, 0, Math.cos(th) * 0.3 + 0.7).normalize(); // lurus ke depan
    const len = L * Math.pow(Math.max(0, 1 - Math.pow(Math.abs(uu), 2.6)), 0.5) * ww;
    // lidah condong ±12° ke bawah (diimbangi kemiringan mahkota) dan melengkung lembut di kedua sisi
    const x = bx + dir.x * len, z = bz + dir.z * len, y = 0.004 - len * 0.1 - 0.012 * uu * uu * ww;
    top.push(x, y, z); bot.push(x, y - 0.005, z); buv.push(u / BU, ww);
  }
  for (let w = 0; w < BW; w++) for (let u = 0; u < BU; u++) { const a = w * (BU + 1) + u, b = a + BU + 1; bidx.push(a, b, a + 1, a + 1, b, b + 1); }
  const mk = (p: number[], flip: boolean) => { const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); q.setAttribute('uv', new THREE.Float32BufferAttribute(buv, 2)); q.setIndex(flip ? bidx.slice().reverse() : bidx); q.computeVertexNormals(); return q; };
  const billTop = new THREE.Mesh(mk(top, false), new THREE.MeshStandardMaterial({ color, map: capBill(), roughness: 0.85 }));
  const billBot = new THREE.Mesh(mk(bot, true), new THREE.MeshStandardMaterial({ color: 0x2c4a36, roughness: 0.9 })); // bawah lidah hijau gelap seperti topi pancing
  // tepi lidah (menutup ketebalan)
  const edgePts: THREE.Vector3[] = [];
  for (let u = 0; u <= BU; u++) { const k = (BW * (BU + 1) + u) * 3; edgePts.push(new THREE.Vector3(top[k], top[k + 1] - 0.0025, top[k + 2])); }
  const edge = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(edgePts), 40, 0.0028, 5, false), new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.85), roughness: 0.85 }));
  g.add(billTop, billBot, edge);
  g.position.set(f.cx, base, f.cz); g.rotation.x = TILT;
  g.traverse(o => { o.castShadow = true; });
  return g;
}

/** Topi & kacamata dibuat dengan kode (tanpa file model), ukurannya mengikuti kepala. */
function makeHat(kind: string, color: number, f: HeadFit = DEFAULT_FIT) {
  if (kind === 'pet') return makeFittedCap(f, color);
  const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const sx = (f.rx * 1.08 + 0.005) / 0.105, sz = (f.rz * 1.06 + 0.005) / 0.105;
  if (kind === 'kupluk') {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat); c.scale.set(1, 0.95, 1.08);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.018, 6, 20), mat); fold.rotation.x = Math.PI / 2; fold.position.y = 0.005; fold.scale.set(1, 1.08, 1);
    g.add(c, fold);
  } else if (kind === 'rimba') {
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.105, 0.09, 18), mat); crown.position.y = 0.04;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.01, 24), mat); brim.position.y = 0.0;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.106, 0.106, 0.02, 18, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a2a1a })); band.position.y = 0.012;
    g.add(crown, brim, band);
  } else if (kind === 'caping') {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.16, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8c38a, roughness: 0.95, side: THREE.DoubleSide }));
    cone.position.y = 0.05; const tip = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), cone.material); tip.position.y = 0.13;
    g.add(cone, tip);
  }
  g.scale.set(sx, 1, sz); g.position.set(f.cx, Math.max(f.eye + (kind === 'caping' ? 0.05 : kind === 'rimba' ? 0.035 : 0.03), f.top - (kind === 'caping' ? 0.05 : 0.08)), f.cz);
  g.traverse(o => { o.castShadow = true; });
  return g;
}
/** Rambut hitam bergaya anime-realistis (acuan: pemuda bertopi dengan poni berantakan):
 *  cangkang tipis menutup kepala + helai-helai runcing (poni di dahi, samping menutup ujung telinga, tengkuk),
 *  dan jambul di atas bila tanpa topi. Semua helai digabung jadi satu geometri (1 draw call). */
function makeHair(f: HeadFit, hat: boolean, color = 0x120e0b) {
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const ry = (f.top - f.eye) * 1.15 + 0.03, cy = f.top - ry + 0.006;
  const R = { x: f.rx * 1.02 + 0.003, y: ry, z: f.rz * 1.025 + 0.003 };
  // ---- cangkang dasar
  const geo = new THREE.SphereGeometry(1, 30, 20), p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let th = -0.45 + 0.95 * ss(-0.3, 0.6, z);                        // tengkuk rendah, dahi tinggi
    th += 0.12 * ss(0.5, 0.9, Math.abs(x)) * ss(-0.45, 0.2, z);       // samping sampai tepat di atas telinga (kulit kepala tertutup)
    if (y < th) p.setXYZ(i, x * 0.85, th - 0.02, z * 0.85);
  }
  geo.computeVertexNormals();
  // ---- helai runcing: daun pipih yang melengkung keluar-bawah dari titik akar di permukaan kepala
  const pos: number[] = [], nor: number[] = [];
  const surf = (th: number, y: number, push = 1) => {
    const k = Math.sqrt(Math.max(0.05, 1 - Math.pow((y - cy) / R.y, 2)));
    return new THREE.Vector3(f.cx + Math.sin(th) * R.x * k * push, y, f.cz + Math.cos(th) * R.z * k * push);
  };
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const strand = (th: number, y0: number, y1: number, w: number, out: number, curl = 0) => {
    const a = surf(th, y0, 1.0), b = surf(th + curl, y1, 1.0 + out);
    const n = new THREE.Vector3(Math.sin(th), 0.15, Math.cos(th)).normalize();
    const side = new THREE.Vector3().crossVectors(n, b.clone().sub(a)).normalize().multiplyScalar(w / 2);
    const mid = a.clone().lerp(b, 0.45).addScaledVector(n, 0.006 + out * 0.04);
    const t = b.clone().addScaledVector(n, 0.002);
    // dua segitiga: akar lebar → tengah → ujung lancip
    const A1 = a.clone().add(side).addScaledVector(n, -0.004), A2 = a.clone().sub(side).addScaledVector(n, -0.004), M1 = mid.clone().addScaledVector(side, 0.75), M2 = mid.clone().addScaledVector(side, -0.75);
    for (const v of [A1, A2, M1, A2, M2, M1, M1, M2, t]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); }
  };
  const e = f.eye;
  // poni di dahi: jatuh sampai garis alis, sedikit berantakan
  for (let i = 0; i < 19; i++) { const th = -0.8 + (i / 18) * 1.6 + (rnd() - 0.5) * 0.06; strand(th, e + 0.05, e + 0.016 + rnd() * 0.012, 0.018 + rnd() * 0.01, 0.015 + rnd() * 0.02, (rnd() - 0.5) * 0.22); }
  // samping: menutup ujung atas telinga
  for (const sx of [-1, 1]) for (let i = 0; i < 12; i++) { const th = sx * (1.0 + (i / 11) * 1.05) + (rnd() - 0.5) * 0.04; strand(th, e + 0.045, e + 0.004 - rnd() * 0.012, 0.034 + rnd() * 0.008, 0.012 + rnd() * 0.012, sx * 0.06); }
  // tengkuk
  for (let i = 0; i < 18; i++) { const th = 2.05 + (i / 17) * 2.18 + (rnd() - 0.5) * 0.04; strand(th, e + 0.02, e - 0.045 - rnd() * 0.02, 0.04, 0.012 + rnd() * 0.015, (rnd() - 0.5) * 0.15); }
  // jambul berantakan di atas (hanya tanpa topi)
  if (!hat) for (let i = 0; i < 26; i++) { const th = rnd() * Math.PI * 2, y0 = f.top - 0.03 - rnd() * 0.03; strand(th, y0, Math.min(f.top + 0.03, y0 + 0.02 + rnd() * 0.02), 0.04, 0.12 + rnd() * 0.08, (rnd() - 0.5) * 0.5); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  const tex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 700; i++) { const v = 70 + Math.random() * 150; g.strokeStyle = `rgb(${v},${v},${v})`; g.lineWidth = 0.6; const x = Math.random() * 64, y = Math.random() * 64; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - 0.5) * 2, y + 5 + Math.random() * 6); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(5, 3); return t;
  })();
  const mat = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.62, metalness: 0, envMapIntensity: 0.35 });
  const shell = new THREE.Mesh(geo, mat); shell.scale.set(R.x, R.y, R.z); shell.position.set(f.cx, cy, f.cz - 0.003);
  const strands = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: new THREE.Color(color).multiplyScalar(0.55), roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide }));
  const g = new THREE.Group(); g.add(shell, strands); g.traverse(o => { o.castShadow = true; });
  return g;
}

/** Geometri baju atas untuk hoodie: bagian depan jas (kelepak, kerah kemeja, dasi kupu-kupu) didorong rata ke permukaan dada,
 *  sehingga badan terlihat memakai hoodie polos tanpa kotak penutup. Ruang lokal mesh RPM: Y atas, +Z depan. Dibuat sekali. */
const hoodieGeoCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();
function hoodieTop(src: THREE.BufferGeometry) {
  const hit = hoodieGeoCache.get(src); if (hit) return hit;
  const g = src.clone(), p = g.attributes.position as THREE.BufferAttribute;
  const Y0 = 1.0, Y1 = 1.62, BIN = 0.02, NB = Math.ceil((Y1 - Y0) / BIN);
  // profil dada: median z (depan) dari titik di samping kelepak, per irisan tinggi
  const bins: number[][] = Array.from({ length: NB }, () => []);
  for (let i = 0; i < p.count; i++) {
    const x = Math.abs(p.getX(i)), y = p.getY(i), z = p.getZ(i);
    if (y < Y0 || y >= Y1 || z < 0.02) continue;
    if (x > 0.17 && x < 0.205) bins[Math.floor((y - Y0) / BIN)].push(z);
  }
  let prof = bins.map(b => { if (!b.length) return NaN; b.sort((a, c) => a - c); return b[Math.floor(b.length * 0.5)]; });
  for (let k = 0; k < NB; k++) if (Number.isNaN(prof[k])) prof[k] = prof[k - 1] ?? 0.1;
  prof = prof.map((_, k) => (prof[Math.max(0, k - 1)] + prof[k] * 2 + prof[Math.min(NB - 1, k + 1)]) / 4);   // haluskan
  const at = (y: number) => { const f = Math.min(NB - 1.001, Math.max(0, (y - Y0) / BIN - 0.5)), k = Math.floor(f); return prof[k] + (prof[k + 1] - prof[k]) * (f - k); };
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(x);
    if (y < Y0 || y >= Y1 || ax > 0.2 || z < 0) continue;
    // dada sedikit membulat ke tengah; di atas bahu (leher) menyempit seperti kerah bulat
    const lim = at(y) + 0.016 * (1 - Math.pow(ax / 0.2, 2)) - Math.max(0, y - 1.5) * 0.35;
    if (z > lim) p.setZ(i, lim);
  }
  p.needsUpdate = true; g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  hoodieGeoCache.set(src, g);
  return g;
}

/** Tekstur wajah yang dirapikan (tekstur bawaan avatar pucat & alisnya tipis): alis tebal rapi, garis kelopak,
 *  bibir natural, bayangan tulang pipi & rahang, bekas cukur tipis. Dibuat sekali lalu dipakai semua pemancing. */
let faceTexCache: THREE.CanvasTexture | null = null;
/** Warna rata-rata kulit tekstur wajah (sRGB) → dipakai agar warna wajah = warna kulit badan. */
const FACE_AVG = new THREE.Color().setRGB(192 / 255, 150 / 255, 142 / 255, THREE.SRGBColorSpace);
function improvedFace(src: THREE.Texture, scalp: number[] = []): THREE.Texture {
  if (faceTexCache) return faceTexCache;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  if (!img || !img.width) return src;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d')!;
  g.drawImage(img, 0, 0, S, S);
  const k = S / 512;
  const blob = (x: number, y: number, r: number, col: string, a: number) => { const gr = g.createRadialGradient(x * k, y * k, 0, x * k, y * k, r * k); gr.addColorStop(0, col.replace('A', String(a))); gr.addColorStop(1, col.replace('A', '0')); g.fillStyle = gr; g.fillRect((x - r) * k, (y - r) * k, r * 2 * k, r * 2 * k); };
  // ratakan kemerahan: lapisan kulit hangat tipis
  g.globalCompositeOperation = 'source-over';
  g.fillStyle = 'rgba(196,156,132,0.18)'; g.fillRect(0, 0, S, S);
  // kontur: tulang pipi, rahang, dagu, sisi hidung
  for (const sx of [-1, 1]) { blob(256 + sx * 92, 252, 46, 'rgba(110,70,55,A)', 0.16); blob(256 + sx * 70, 300, 50, 'rgba(110,70,55,A)', 0.12); blob(256 + sx * 13, 205, 10, 'rgba(120,80,65,A)', 0.18); }
  blob(256, 312, 30, 'rgba(110,72,58,A)', 0.1);
  // bekas cukur halus di dagu & atas bibir (kesan dewasa)
  blob(256, 236, 26, 'rgba(70,64,62,A)', 0.07); blob(256, 292, 40, 'rgba(70,64,62,A)', 0.06);
  // sorot terang: tulang hidung, dahi, atas pipi
  blob(256, 185, 14, 'rgba(255,230,210,A)', 0.18); blob(256, 105, 50, 'rgba(255,230,210,A)', 0.08);
  for (const sx of [-1, 1]) blob(256 + sx * 62, 215, 22, 'rgba(255,225,205,A)', 0.09);
  // alis tebal rapi (meruncing ke ujung luar)
  const brow = (sx: number) => {
    const pts = [[22, 146], [34, 141], [50, 138], [66, 139], [76, 143]];
    g.fillStyle = 'rgba(28,20,16,0.92)'; g.beginPath();
    pts.forEach(([x, y], i) => { const X = (256 + sx * (x + 5)) * k, Y = (y - (i === 0 ? 1 : 2.6 - i * 0.35)) * k; if (i === 0) g.moveTo(X, Y + 3 * k); else g.lineTo(X, Y); });
    for (let i = pts.length - 1; i >= 0; i--) { const [x, y] = pts[i]; g.lineTo((256 + sx * (x + 5)) * k, (y + (i === 0 ? 5 : 4.6 - i * 0.75)) * k); }
    g.closePath(); g.filter = 'blur(0.8px)'; g.fill(); g.filter = 'none';
    g.strokeStyle = 'rgba(15,10,8,0.5)'; g.lineWidth = 0.8 * k;   // helai alis
    for (let i = 0; i < 26; i++) { const t = i / 25, x = 27 + t * 47, y = 143 - Math.sin(t * Math.PI) * 4.5; g.beginPath(); g.moveTo((256 + sx * (x + 5)) * k, (y + 2.5) * k); g.lineTo((256 + sx * (x + 8)) * k, (y - 1.5) * k); g.stroke(); }
  };
  brow(-1); brow(1);
  // garis kelopak atas & bayangan kelopak (mata lebih tegas)
  for (const sx of [-1, 1]) {
    const cx = 256 + sx * 45;
    blob(cx, 154, 16, 'rgba(90,60,50,A)', 0.22);
    g.strokeStyle = 'rgba(20,14,12,0.85)'; g.lineWidth = 2.2 * k; g.lineCap = 'round';
    g.beginPath(); g.moveTo((cx - sx * 15) * k, 160 * k); g.quadraticCurveTo(cx * k, 152.5 * k, (cx + sx * 16) * k, 158 * k); g.stroke();
  }
  // bibir natural (kurangi merah muda) + garis bibir
  g.fillStyle = 'rgba(170,108,96,0.45)'; g.beginPath(); g.ellipse(256 * k, 246 * k, 27 * k, 7 * k, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(95,52,46,0.55)'; g.lineWidth = 1.4 * k; g.beginPath(); g.moveTo(232 * k, 245 * k); g.quadraticCurveTo(256 * k, 249 * k, 280 * k, 245 * k); g.stroke();
  blob(256, 256, 12, 'rgba(255,220,200,A)', 0.12);
  // garis rambut tipis di dahi & cambang (terlihat bila tanpa topi)
  g.fillStyle = 'rgba(22,16,12,0.9)'; g.filter = 'blur(2px)';
  g.beginPath(); g.moveTo(120 * k, 0); g.lineTo(392 * k, 0); g.lineTo(392 * k, 62 * k); g.quadraticCurveTo(256 * k, 48 * k, 120 * k, 62 * k); g.closePath(); g.fill();
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo((256 + sx * 128) * k, 95 * k); g.lineTo((256 + sx * 142) * k, 95 * k); g.lineTo((256 + sx * 140) * k, 168 * k); g.lineTo((256 + sx * 130) * k, 172 * k); g.closePath(); g.fill(); }
  g.filter = 'none';
  // kulit kepala (segitiga UV di area rambut, dihitung dari posisi titik mesh) diwarnai rambut → celah antar helai tidak tampak kulit
  if (scalp.length) {
    const fy = (v: number) => (src.flipY ? 1 - v : v) * S;
    g.fillStyle = 'rgb(20,15,12)'; g.strokeStyle = 'rgb(20,15,12)'; g.lineWidth = 2; g.lineJoin = 'round';
    for (let i = 0; i < scalp.length; i += 6) {
      g.beginPath(); g.moveTo(scalp[i] * S, fy(scalp[i + 1])); g.lineTo(scalp[i + 2] * S, fy(scalp[i + 3])); g.lineTo(scalp[i + 4] * S, fy(scalp[i + 5])); g.closePath(); g.fill(); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.flipY = src.flipY; t.colorSpace = THREE.SRGBColorSpace; t.wrapS = src.wrapS; t.wrapT = src.wrapT; t.anisotropy = 4; t.needsUpdate = true;
  faceTexCache = t;
  return t;
}

function makeGlasses(kind: string) {
  const g = new THREE.Group();
  const lens = new THREE.MeshStandardMaterial({ color: kind === 'hitam' ? 0x0c0c0e : 0xcfe6f0, roughness: 0.1, metalness: 0.3, transparent: kind !== 'hitam', opacity: kind === 'hitam' ? 1 : 0.35 });
  const frame = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4 });
  for (const x of [-0.033, 0.033]) {
    const l = new THREE.Mesh(new THREE.CircleGeometry(0.024, 14), lens); l.position.set(x, 0, 0); l.scale.set(1.15, 0.85, 1);
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.003, 4, 16), frame); r.position.set(x, 0, 0); r.scale.set(1.15, 0.85, 1);
    g.add(l, r);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), frame);
  for (const x of [-0.064, 0.064]) { const arm = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.004, 0.1), frame); arm.position.set(x, 0, -0.05); g.add(arm); }
  g.add(bridge); return g;
}
/** Warnai ulang bahan bertekstur: luminans tekstur × warna pilihan (lipatan & jahitan tetap terlihat). */
/**
 * Warnai ulang bahan bertekstur: luminans tekstur × warna pilihan (lipatan & jahitan tetap terlihat),
 * plus motif pakaian memancing di koordinat bind-pose kain (ikut bergerak bersama badan):
 * 0 polos · 1 jersey UV (panel lengan/bahu + garis diagonal) · 2 kamuflase · 3 garis ventilasi · 4 kain jaket mengkilap.
 */
interface Tint { value: THREE.Color; on: { value: number }; mode: { value: number }; acc: { value: THREE.Color }; bbMin: { value: THREE.Vector3 }; bbSize: { value: THREE.Vector3 } }
function tintMaterial(mat: THREE.MeshStandardMaterial): Tint {
  if (mat.userData.tint) return mat.userData.tint as Tint;
  const t: Tint = { value: new THREE.Color(1, 1, 1), on: { value: 0 }, mode: { value: 0 }, acc: { value: new THREE.Color(1, 0.5, 0.1) }, bbMin: { value: new THREE.Vector3() }, bbSize: { value: new THREE.Vector3(1, 1, 1) } };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tintCol: t, tintOn: t.on, patMode: t.mode, accCol: t.acc, bbMin: t.bbMin, bbSize: t.bbSize });
    sh.uniforms.tintCol = { value: t.value };
    sh.vertexShader = 'varying vec3 vPj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPj = position;');
    sh.fragmentShader = `uniform vec3 tintCol, accCol, bbMin, bbSize; uniform float tintOn, patMode; varying vec3 vPj;
      float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hsh(i), hsh(i + vec2(1, 0)), f.x), mix(hsh(i + vec2(0, 1)), hsh(i + vec2(1, 1)), f.x), f.y); }
      ` + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float lumT = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
      if (patMode > 4.5) lumT = mix(lumT, 0.27, 0.88);   // hoodie: warna rata (tekstur jas/kemeja tidak terlihat)
      vec3 n = (vPj - bbMin) / bbSize;                 // 0..1 di dalam kotak kain (x lebar, y tinggi)
      vec3 base = tintCol;
      if (patMode > 0.5 && patMode < 1.5) {            // jersey UV: lengan & bahu warna aksen, garis diagonal di dada
        float side = smoothstep(0.30, 0.33, abs(n.x - 0.5)), yoke = smoothstep(0.84, 0.87, n.y);
        float d = fract((n.y * 1.6 + (n.x - 0.5) * 1.2) * 3.0), band = step(0.8, d) * step(0.35, n.y) * step(n.y, 0.8) * (1.0 - side);
        base = mix(tintCol, accCol, max(max(side, yoke), band));
      } else if (patMode > 1.5 && patMode < 2.5) {     // kamuflase: tiga warna bercak
        vec2 q = vec2(n.x * 7.0, n.y * 9.0 + n.z * 3.0);
        float a = vnoise(q) * 0.65 + vnoise(q * 2.3) * 0.35;
        base = a > 0.62 ? accCol : a > 0.44 ? tintCol : tintCol * 0.55;
      } else if (patMode > 2.5 && patMode < 3.5) {     // kemeja berventilasi: garis halus tegak
        base = tintCol * (0.93 + 0.07 * step(0.5, fract(n.x * 55.0)));
      } else if (patMode > 4.5) {                       // hoodie fleece: serat lembut + rib gelap di ujung bawah
        base = tintCol * (0.94 + 0.06 * vnoise(n.xy * vec2(90.0, 120.0))) * mix(0.8, 1.0, smoothstep(0.05, 0.08, n.y));
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, base * (0.35 + lumT * 1.5), tintOn);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n if (patMode > 3.5 && patMode < 4.5) roughnessFactor *= 0.5; if (patMode > 4.5) roughnessFactor = 1.0;');
  };
  mat.customProgramCacheKey = () => 'tint2';
  mat.userData.tint = t;
  return t;
}
const hexOf = (slot: keyof Look, id: string, fb: string) => new THREE.Color(COSMETICS[slot].find(i => i.id === id)?.color ?? fb);

// ---------- gerak rekam-manusia (mocap): diam, jalan, lari kecil ----------
interface MClip { dur: number; cycles: number; lead: number; step: number; names: string[]; rot: THREE.Interpolant[]; pos: THREE.Interpolant | null }
let MOTION: { idle: MClip; walk: MClip; jog: MClip } | null = null;
/** Pasang data gerak (dari assets/m/motion). Dipanggil sekali setelah aset dimuat; tanpa ini avatar memakai gerak buatan kode. */
export function setMotion(gltf: GLTF | null) {
  if (!gltf) { MOTION = null; return; }
  const meta = (gltf.scene.userData.motion ?? {}) as Record<string, { dur: number; cycles: number; lead?: number; step?: number }>;
  const mk = (n: string): MClip | null => {
    const c = gltf.animations.find(a => a.name === n), m = meta[n]; if (!c || !m) return null;
    const out: MClip = { dur: m.dur, cycles: m.cycles, lead: m.lead ?? 0, step: m.step ?? 0.7, names: [], rot: [], pos: null };
    for (const t of c.tracks) {
      const i = t.name.lastIndexOf('.'), bone = t.name.slice(0, i), prop = t.name.slice(i + 1);
      const ip = (t as unknown as { createInterpolant(): THREE.Interpolant }).createInterpolant();
      if (prop === 'quaternion') { out.names.push(bone); out.rot.push(ip); } else if (prop === 'position' && bone === 'Hips') out.pos = ip;
    }
    return out;
  };
  const idle = mk('idle'), walk = mk('walk'), jog = mk('jog');
  MOTION = idle && walk && jog ? { idle, walk, jog } : null;
}
/** Campuran lari (0..1) dari pose.walk (= kecepatan ÷ 1,45): jalan 1,45 m/dtk → 0; jalan cepat 2,2 → ±0,4; lari 3,3 → 1. */
const jogMix = (walk: number) => THREE.MathUtils.smoothstep(walk, 1.15, 2.15);
/** Batas atas pose.walk (lari 3,3 m/dtk ÷ 1,45). */
export const WALK_MAX = 2.3;
/** Panjang satu langkah (m) pada kecepatan tertentu — disamakan dengan langkah rekaman supaya kaki tidak meluncur. */
export function stepLength(speed: number) {
  if (!MOTION) return 0.36 + 0.2 * speed;
  return THREE.MathUtils.lerp(MOTION.walk.step, MOTION.jog.step, jogMix(speed / 1.45));
}
const _mq = new THREE.Quaternion(), _mv = new THREE.Vector3();

export class Angler {
  root = new THREE.Group();
  model: THREE.Object3D;
  rod: Rod;
  pose = defaultPose();
  private b: Record<string, THREE.Bone> = {};
  private rest = new Map<THREE.Bone, THREE.Quaternion>();
  private mBones = new Map<MClip, (THREE.Bone | undefined)[]>(); private hipRest = new THREE.Vector3(); private hipOff = new THREE.Vector3();
  private fingers: THREE.Bone[] = [];
  private handRodAxis = new THREE.Vector3();   // sumbu joran di ruang lokal tangan kanan
  private handFingerAxis = new THREE.Vector3(0, 1, 0);
  grip = new THREE.Vector3();
  gripQ = new THREE.Quaternion();
  private headAnchor!: THREE.Group;
  private meshes: Record<string, THREE.Mesh> = {};
  private hatObj: THREE.Object3D | null = null; private glassObj: THREE.Object3D | null = null; private hairObj: THREE.Object3D | null = null; private hairHat = true;
  look: Look = { ...DEFAULT_LOOK };
  private fit: HeadFit = DEFAULT_FIT;
  /** Segitiga UV kulit kepala yang tertutup rambut (di atas & belakang telinga, bukan dahi/wajah). */
  private scalpUV(): number[] {
    const m = this.meshes.Wolf3D_Head as THREE.SkinnedMesh | undefined; if (!m) return [];
    const f = this.fit, pos = m.geometry.attributes.position, uv = m.geometry.attributes.uv, idx = m.geometry.index; if (!uv) return [];
    this.root.updateMatrixWorld(true);
    const v = new THREE.Vector3(), hair: boolean[] = [];
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); if (m.isSkinnedMesh && m.applyBoneTransform) m.applyBoneTransform(i, v);
      m.localToWorld(v); const q = this.headAnchor.worldToLocal(v);
      const zr = (q.z - f.cz) / f.rz, xr = Math.abs(q.x - f.cx) / f.rx;
      const face = zr > 0.35 && xr < 0.78;                      // dahi & wajah tetap kulit
      const scalp = q.y > f.eye + 0.035 && !(face && q.y < f.eye + 0.085);
      const back = zr < -0.15 && q.y > f.eye - 0.055;            // belakang kepala sampai tengkuk
      const side = (xr > 0.82 && zr < 0.15 && q.y > f.eye + 0.012) || (xr > 0.72 && zr < 0.5 && q.y > f.eye + 0.028); // di atas telinga & pelipis
      hair.push(scalp || back || side);
    }
    const out: number[] = [], n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const a = idx ? idx.getX(t) : t, b = idx ? idx.getX(t + 1) : t + 1, c = idx ? idx.getX(t + 2) : t + 2;
      if (hair[a] && hair[b] && hair[c]) out.push(uv.getX(a), uv.getY(a), uv.getX(b), uv.getY(b), uv.getX(c), uv.getY(c));
    }
    return out;
  }
  /** Ukur kepala dari titik-titik mesh (pose istirahat) dalam ruang jangkar kepala. */
  private measureHead(): HeadFit {
    const m = this.meshes.Wolf3D_Head as THREE.SkinnedMesh | undefined;
    if (!m) return DEFAULT_FIT;
    try {
      this.root.updateMatrixWorld(true);
      const pos = m.geometry.attributes.position, v = new THREE.Vector3(), pts: THREE.Vector3[] = [];
      for (let i = 0; i < pos.count; i += 2) {
        v.fromBufferAttribute(pos, i);
        if (m.isSkinnedMesh && m.applyBoneTransform) m.applyBoneTransform(i, v);
        m.localToWorld(v); pts.push(this.headAnchor.worldToLocal(v.clone()));
      }
      const top = Math.max(...pts.map(p => p.y));
      const ring = pts.filter(p => p.y > top - 0.08 && p.y < top - 0.04);
      if (ring.length < 20) return DEFAULT_FIT;
      const xs = ring.map(p => p.x), zs = ring.map(p => p.z);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
      // tinggi mata dari mesh mata (paling tepat); cadangan: 11 cm di bawah puncak
      let eye = top - 0.11;
      const eyePts: number[] = [];
      for (const n of ['EyeLeft', 'EyeRight']) {
        const e = this.meshes[n] as THREE.SkinnedMesh | undefined; if (!e) continue;
        const ep = e.geometry.attributes.position;
        for (let i = 0; i < ep.count; i += 3) { v.fromBufferAttribute(ep, i); if (e.isSkinnedMesh && e.applyBoneTransform) e.applyBoneTransform(i, v); e.localToWorld(v); eyePts.push(this.headAnchor.worldToLocal(v.clone()).y); }
      }
      if (eyePts.length > 10) { const ey = Math.max(...eyePts); if (ey < top - 0.04 && ey > top - 0.2) eye = ey; }
      const fit = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, rx: (x1 - x0) / 2, rz: (z1 - z0) / 2, top, eye };
      // jaga-jaga: ukuran kepala manusia masuk akal
      if (fit.rx < 0.05 || fit.rx > 0.12 || fit.rz < 0.06 || fit.rz > 0.14) return DEFAULT_FIT;
      return fit;
    } catch { return DEFAULT_FIT; }
  }

  // ---------- perlengkapan 3D yang menempel ke tulang (rompi, tudung, ritsleting, saku, buff, kantong kargo) ----------
  private gearObjs: THREE.Object3D[] = [];
  private torso: { hw: number; hd: number; y0: number; y1: number; cz: number; cx: number } | null = null;
  /** Ukuran badan dari posisi tulang (bind pose, dunia). */
  private measureTorso() {
    if (this.torso) return this.torso;
    const w = (n: string) => this.b[n]?.getWorldPosition(new THREE.Vector3());
    this.model.updateMatrixWorld(true);
    const la = w('LeftArm'), ra = w('RightArm'), hips = w('Hips'), neck = w('Neck');
    if (!la || !ra || !hips || !neck) return null;
    const hw = Math.max(0.12, Math.min(0.24, la.distanceTo(ra) / 2 * 0.78));
    this.torso = { hw, hd: hw * 0.66, y0: hips.y + 0.02, y1: neck.y - 0.06, cz: (hips.z + neck.z) / 2, cx: (hips.x + neck.x) / 2 };
    return this.torso;
  }
  /** Tempel objek (sudah diposisikan di koordinat dunia bind pose) ke tulang supaya ikut bergerak. */
  private stick(o: THREE.Object3D, bone: string) {
    const b = this.b[bone]; if (!b) return;
    this.root.add(o); o.updateMatrixWorld(true); b.attach(o); this.gearObjs.push(o);
  }
  private gear(L: Look) {
    // bangun dalam pose & posisi AWAL (bind pose, root di titik nol), lalu pulihkan — supaya aman dipanggil kapan saja
    const rp = this.root.position.clone(), rq = this.root.quaternion.clone(), mp = this.model.position.clone(), ms = this.model.scale.clone();
    const bq = new Map<THREE.Bone, THREE.Quaternion>(); for (const [bone, q] of this.rest) { bq.set(bone, bone.quaternion.clone()); bone.quaternion.copy(q); }
    this.root.position.set(0, 0, 0); this.root.quaternion.identity(); this.model.position.set(0, 0, 0); this.model.scale.set(1, 1, 1);
    this.root.updateMatrixWorld(true);
    try { this.buildGear(L); } finally {
      for (const [bone, q] of bq) bone.quaternion.copy(q);
      this.root.position.copy(rp); this.root.quaternion.copy(rq); this.model.position.copy(mp); this.model.scale.copy(ms); this.root.updateMatrixWorld(true);
    }
  }
  private buildGear(L: Look) {
    for (const o of this.gearObjs) o.parent?.remove(o);
    this.gearObjs = [];
    const T = this.measureTorso(); if (!T) return;
    const acc = hexOf('accent', L.accent, '#ff8a2a'), shirt = hexOf('shirtColor', L.shirtColor, '#1f3354');
    const cloth = (c: THREE.Color, rough = 0.9) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    const front = -1;   // badan menghadap −Z (dunia, bind pose)
    const H = T.y1 - T.y0, cy = (T.y0 + T.y1) / 2;
    if (L.shirt === 'rompi') {
      // rompi terbuka di depan, dengan saku-saku di dada & perut
      const gap = 0.55;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.04, 1, 22, 1, true, Math.PI + gap / 2, Math.PI * 2 - gap), cloth(acc));
      (shell.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      shell.scale.set(T.hw * 1.1, H * 0.86, T.hd * 1.2); shell.position.set(T.cx, cy - H * 0.04, T.cz);
      const vest = new THREE.Group(); vest.add(shell);
      const pk = cloth(acc.clone().multiplyScalar(0.8)), flap = cloth(acc.clone().multiplyScalar(0.65));
      for (const sx of [-1, 1]) for (const [dy, w, h] of [[0.18, 0.085, 0.07], [-0.12, 0.1, 0.09]] as const) {
        const x = T.cx + sx * T.hw * 0.52, y = cy + dy * H, z = T.cz + front * T.hd * 1.18;
        const pocket = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.028), pk); pocket.position.set(x, y, z);
        const f = new THREE.Mesh(new THREE.BoxGeometry(w * 1.05, h * 0.32, 0.034), flap); f.position.set(x, y + h * 0.36, z + front * 0.004);
        vest.add(pocket, f);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.003, 5, 10), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.8, roughness: 0.3 }));
      ring.position.set(T.cx + T.hw * 0.62, cy + H * 0.33, T.cz + front * T.hd * 1.2); vest.add(ring);
      vest.traverse(o => { o.castShadow = true; });
      this.stick(vest, 'Spine1');
    }
    if (L.shirt === 'jaket') {
      // tudung terlipat di tengkuk + ritsleting & list warna aksen di depan
      const hood = new THREE.Mesh(new THREE.TorusGeometry(T.hw * 0.5, 0.045, 8, 16, Math.PI), cloth(shirt, 0.5));
      hood.rotation.x = Math.PI / 2 + 0.35; hood.position.set(T.cx, T.y1 + 0.04, T.cz - front * T.hd * 0.55); hood.scale.set(1, 1, 0.8);
      const zip = new THREE.Mesh(new THREE.BoxGeometry(0.012, H * 0.9, 0.012), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.4, metalness: 0.4 }));
      zip.position.set(T.cx, cy, T.cz + front * T.hd * 1.12);
      const trim = new THREE.Mesh(new THREE.BoxGeometry(T.hw * 1.9, 0.03, T.hd * 2.2), cloth(acc, 0.6)); trim.position.set(T.cx, T.y0 + 0.02, T.cz);
      const g = new THREE.Group(); g.add(hood, zip, trim); g.traverse(o => { o.castShadow = true; });
      this.stick(g, 'Spine2');
    }
    if (L.shirt === 'hoodie') {
      // tudung terkulai di punggung, kantong kanguru, tali tudung, rib di ujung bawah
      const g = new THREE.Group(), fleece = cloth(shirt.clone().multiplyScalar(0.42), 1), deep = cloth(shirt.clone().multiplyScalar(0.34), 1);
      const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), fleece);
      hood.scale.set(T.hw * 0.78, 0.15, 0.13); hood.rotation.x = -1.25; hood.position.set(T.cx, T.y1 + 0.02, T.cz - front * T.hd * 1.0);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(T.hw * 0.46, 0.04, 8, 20), deep);
      rim.rotation.x = Math.PI / 2 - 0.25; rim.position.set(T.cx, T.y1 + 0.03, T.cz - front * T.hd * 0.15); rim.scale.set(1, 1.15, 1);
      const pocket = new THREE.Mesh(new THREE.BoxGeometry(T.hw * 1.2, H * 0.22, 0.03), deep); pocket.position.set(T.cx, T.y0 + H * 0.27, T.cz + front * T.hd * 1.1);
      const hem = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.06, 20, 1, true), deep); hem.scale.set(T.hw * 1.04, 1, T.hd * 1.18); hem.position.set(T.cx, T.y0 + 0.01, T.cz);
      (hem.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
      const cord = new THREE.MeshStandardMaterial({ color: 0xd8d6cf, roughness: 0.8 });
      for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.17, 4), cord); c.position.set(T.cx + sx * 0.035, T.y1 - 0.09, T.cz + front * T.hd * 1.12); g.add(c); }
      // depan jas (kerah, dasi kupu-kupu, kelepak) sudah DIRATAKAN di geometri baju (hoodieTop) → tidak perlu kotak penutup lagi
      const fz = this.frontZ(T.y0 + H * 0.15, T.y0 + H * 0.45);
      pocket.position.z = Math.min(fz, T.cz + front * T.hd) - 0.006;
      const cfz = this.frontZ(T.y1 - 0.14, T.y1 - 0.05);
      g.children.forEach(o => { o.position.z = cfz - 0.006; });   // tali tudung menempel di dada
      void pocket; void hem; g.add(hood, rim); g.traverse(o => { o.castShadow = true; });
      this.stick(g, 'Spine2');
    }
    if (L.bag === 'ransel') this.buildBackpack(T);
    if (L.shirt === 'vent') {
      // dua saku dada bertutup (khas kemeja pancing)
      const g = new THREE.Group();
      for (const sx of [-1, 1]) {
        const x = T.cx + sx * T.hw * 0.45, y = cy + H * 0.24, z = T.cz + front * T.hd * 1.07;
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.085, 0.014), cloth(shirt.clone().multiplyScalar(0.92))); p.position.set(x, y, z);
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.086, 0.03, 0.018), cloth(shirt.clone().multiplyScalar(0.8))); f.position.set(x, y + 0.035, z + front * 0.003);
        g.add(p, f);
      }
      this.stick(g, 'Spine2');
    }
    if (L.neck === 'buff') {
      // buff / bandana melingkar di leher, bergaris
      const geo = new THREE.CylinderGeometry(T.hw * 0.42, T.hw * 0.5, 0.09, 16, 3, true), cols: number[] = [], ps = geo.attributes.position;
      for (let i = 0; i < ps.count; i++) { const k = Math.floor((ps.getY(i) + 0.045) / 0.03) % 2; const c = k ? acc : acc.clone().multiplyScalar(0.55); cols.push(c.r, c.g, c.b); }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      const buff = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
      const neck = this.b.Neck!.getWorldPosition(new THREE.Vector3());
      buff.position.set(neck.x, neck.y - 0.01, neck.z); buff.castShadow = true;
      this.stick(buff, 'Neck');
    }
    if (L.pants === 'kargo') {
      // kantong kargo di sisi luar paha
      const pc = hexOf('pantsColor', L.pantsColor, '#23252a').multiplyScalar(0.85);
      for (const [bn, sx] of [['LeftUpLeg', 1], ['RightUpLeg', -1]] as const) {
        const up = this.b[bn], knee = this.b[bn.replace('UpLeg', 'Leg')]; if (!up || !knee) continue;
        const a = up.getWorldPosition(new THREE.Vector3()), k = knee.getWorldPosition(new THREE.Vector3());
        const mid = a.clone().lerp(k, 0.5), side = Math.sign(a.x - T.cx) || sx;
        const pocket = new THREE.Group();
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.12, 0.1), cloth(pc)); const flap = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.035, 0.105), cloth(pc.clone().multiplyScalar(0.8)));
        box.position.set(mid.x + side * T.hw * 0.42, mid.y, mid.z); flap.position.set(mid.x + side * T.hw * 0.43, mid.y + 0.055, mid.z);
        pocket.add(box, flap); pocket.traverse(o => { o.castShadow = true; });
        this.stick(pocket, bn);
      }
    }
  }

  /** Titik paling depan (−Z) kain baju atas pada rentang tinggi tertentu (bind pose, dunia). */
  private frontZ(y0: number, y1: number) {
    const m = this.meshes.Wolf3D_Outfit_Top as THREE.SkinnedMesh | undefined; if (!m) return (this.torso?.cz ?? 0) - (this.torso?.hd ?? 0.12);
    const p = m.geometry.attributes.position, v = new THREE.Vector3(); let z = Infinity;
    for (let i = 0; i < p.count; i += 2) {
      v.fromBufferAttribute(p, i); if (m.isSkinnedMesh && m.applyBoneTransform) m.applyBoneTransform(i, v); m.localToWorld(v);
      if (v.y > y0 && v.y < y1 && v.z < z) z = v.z;
    }
    return Number.isFinite(z) ? z : (this.torso?.cz ?? 0) - (this.torso?.hd ?? 0.12);
  }

  /** Ransel petualang besar (kain arang, tali kulit cokelat, gesper) — menempel di punggung, ikut gerak badan. */
  private buildBackpack(T: { hw: number; hd: number; y0: number; y1: number; cz: number; cx: number }) {
    const round = (w: number, h: number, d: number, r: number) => {
      const g = new THREE.BoxGeometry(1, 1, 1, 5, 5, 5), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3(), lim = new THREE.Vector3(w / 2 - r, h / 2 - r, d / 2 - r);
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).multiply(new THREE.Vector3(w, h, d));
        const inner = v.clone().clamp(lim.clone().negate(), lim), dir = v.clone().sub(inner), L = dir.length();
        if (L > 1e-5) v.copy(inner).addScaledVector(dir, r / L);
        p.setXYZ(i, v.x, v.y, v.z);
      }
      g.computeVertexNormals(); return g;
    };
    const fabric = new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.95 });
    const fabric2 = new THREE.MeshStandardMaterial({ color: 0x232527, roughness: 0.95 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.6 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xb8b2a6, metalness: 0.8, roughness: 0.35 });
    const H = T.y1 - T.y0, cy = (T.y0 + T.y1) / 2, back = 1;   // punggung = +Z (bind pose)
    const W = T.hw * 2.0, PH = H * 1.18, D = 0.24, z0 = T.cz + back * (T.hd * 1.05 + D / 2), y = cy + H * 0.02;
    const g = new THREE.Group();
    const body = new THREE.Mesh(round(W, PH, D, 0.06), fabric); body.position.set(T.cx, y, z0); g.add(body);
    const lid = new THREE.Mesh(round(W * 1.04, PH * 0.26, D * 1.12, 0.045), fabric2); lid.position.set(T.cx, y + PH * 0.42, z0 + back * 0.012); lid.rotation.x = 0.06; g.add(lid);
    // dua kantong depan + kantong samping
    for (const sx of [-1, 1]) {
      const pk = new THREE.Mesh(round(W * 0.38, PH * 0.34, 0.075, 0.025), fabric2); pk.position.set(T.cx + sx * W * 0.22, y - PH * 0.2, z0 + back * (D / 2 + 0.03)); g.add(pk);
      const flap = new THREE.Mesh(round(W * 0.4, PH * 0.1, 0.085, 0.02), fabric); flap.position.set(pk.position.x, pk.position.y + PH * 0.15, pk.position.z + back * 0.006); g.add(flap);
      const side = new THREE.Mesh(round(0.07, PH * 0.42, D * 0.7, 0.025), fabric2); side.position.set(T.cx + sx * (W / 2 + 0.03), y - PH * 0.18, z0); g.add(side);
    }
    // tali kulit vertikal + gesper di tutup & kantong
    for (const sx of [-1, 1]) {
      const x = T.cx + sx * W * 0.22;
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.035, PH * 0.42, 0.012), leather); strap.position.set(x, y + PH * 0.22, z0 + back * (D * 0.56 + 0.012)); g.add(strap);
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.03, 0.014), metal); buckle.position.set(x, y + PH * 0.05, z0 + back * (D * 0.56 + 0.02)); g.add(buckle);
      const ps = new THREE.Mesh(new THREE.BoxGeometry(0.03, PH * 0.2, 0.01), leather); ps.position.set(x, y - PH * 0.12, z0 + back * (D / 2 + 0.072)); g.add(ps);
      const pb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.025, 0.012), metal); pb.position.set(x, y - PH * 0.2, z0 + back * (D / 2 + 0.078)); g.add(pb);
    }
    // pegangan atas & tali bahu melengkung ke depan dada
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.009, 5, 10, Math.PI), leather); handle.position.set(T.cx, y + PH * 0.56, z0 - back * 0.02); g.add(handle);
    // tali bahu menempel di dada (diukur dari kain baju yang sedang dipakai)
    const zUp = this.frontZ(T.y1 - 0.09, T.y1 - 0.03) - 0.014, zLow = this.frontZ(cy - H * 0.16, cy - H * 0.08) - 0.014;
    for (const sx of [-1, 1]) {
      const pts = [
        new THREE.Vector3(T.cx + sx * T.hw * 0.4, y + PH * 0.38, T.cz + back * T.hd * 1.05),
        new THREE.Vector3(T.cx + sx * T.hw * 0.55, T.y1 + 0.05, T.cz + back * T.hd * 0.2),
        new THREE.Vector3(T.cx + sx * T.hw * 0.55, T.y1 - 0.06, zUp),
        new THREE.Vector3(T.cx + sx * T.hw * 0.62, cy - H * 0.12, zLow),
        new THREE.Vector3(T.cx + sx * T.hw * 1.0, cy - H * 0.28, T.cz + back * T.hd * 0.3),
        new THREE.Vector3(T.cx + sx * T.hw * 0.7, y - PH * 0.3, T.cz + back * T.hd * 1.05),
      ];
      const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.02, 5, false), fabric2); tube.scale.set(1, 1, 1); g.add(tube);
    }
    g.traverse(o => { o.castShadow = true; });
    this.stick(g, 'Spine2');
  }

  /** Terapkan tampilan karakter (Fase 3). Aman dipanggil berulang (pratinjau di lembar karakter). */
  applyLook(l: Partial<Look>) {
    const L = this.look = { ...DEFAULT_LOOK, ...l };
    const tint = (name: string, col: THREE.Color | null) => {
      const m = this.meshes[name]; if (!m) return;
      const mat = m.material as THREE.MeshStandardMaterial, t = tintMaterial(mat);
      if (col) { t.value.copy(col); t.on.value = 1; } else t.on.value = 0;
    };
    tint('Wolf3D_Outfit_Top', L.shirt === 'kemeja' && L.shirtColor === 'birutua' ? null : hexOf('shirtColor', L.shirtColor, '#1f3354'));
    { // motif baju memancing + warna aksen
      const top = this.meshes.Wolf3D_Outfit_Top;
      if (top) {
        // hoodie: geometri depan jas diratakan & detail kelepak di peta normal dimatikan
        const orig = (top.userData.origGeo ??= top.geometry) as THREE.BufferGeometry;
        const hood = L.shirt === 'hoodie';
        top.geometry = hood ? hoodieTop(orig) : orig;
        const tm = top.material as THREE.MeshStandardMaterial;
        if (tm.normalMap) tm.normalScale.setScalar(hood ? 0.12 : 1);
        const t = tintMaterial(top.material as THREE.MeshStandardMaterial);
        t.mode.value = ({ kemeja: 0, jersey: 1, kamo: 2, vent: 3, rompi: 0, jaket: 4, hoodie: 5 } as Record<string, number>)[L.shirt] ?? 0;
        t.acc.value.copy(hexOf('accent', L.accent, '#ff8a2a'));
        if (!top.geometry.boundingBox) top.geometry.computeBoundingBox();
        const bb = top.geometry.boundingBox!; t.bbMin.value.copy(bb.min); t.bbSize.value.copy(bb.max).sub(bb.min);
      }
    }
    this.gear(L);
    tint('Wolf3D_Outfit_Bottom', hexOf('pantsColor', L.pantsColor, '#23252a'));
    tint('Wolf3D_Outfit_Footwear', hexOf('shoes', L.shoes, '#1c1c1e'));
    // kulit: kalikan warna (tekstur wajah tetap)
    // kulit: kepala bertekstur → pengali relatif terhadap warna tekstur wajah (sawo matang);
    // badan (tangan, leher) TANPA tekstur → langsung diberi warna kulit pilihan (dulu tertimpa pengali (1,1,1) → tangan putih)
    const skin = hexOf('skin', L.skin, '#c68a5e');
    const head = this.meshes.Wolf3D_Head, body = this.meshes.Wolf3D_Body;
    if (head) {
      const hm = head.material as THREE.MeshStandardMaterial;
      // wajah dirapikan + warna disamakan dengan kulit badan (dulu tekstur pucat kemerahan → wajah lebih putih dari tangan)
      if (hm.map && hm.map !== faceTexCache) { hm.map = improvedFace(hm.map, this.scalpUV()); hm.needsUpdate = true; }
      hm.color.setRGB(skin.r / FACE_AVG.r * 0.95, skin.g / FACE_AVG.g * 0.95, skin.b / FACE_AVG.b * 0.95); hm.roughness = 0.6;
    }
    if (body) { const bm = body.material as THREE.MeshStandardMaterial; bm.map = null; bm.color.copy(skin).multiplyScalar(0.92); bm.roughness = 0.62; bm.needsUpdate = true; }
    if (this.meshes.Wolf3D_Beard) this.meshes.Wolf3D_Beard.visible = L.face === 'jenggot';
    // bentuk badan: sedikit lebih ramping / gempal
    const w = L.body === 'kurus' ? 0.93 : L.body === 'gempal' ? 1.08 : 1;
    this.model.scale.set(w, 1, w);
    // rompi/jaket: garis kerah & saku sederhana lewat warna berbeda pada bahan atas tidak tersedia → cukup warna
    const hatOn = L.hat !== 'tanpa';
    if (!this.hairObj || this.hairHat !== hatOn) { if (this.hairObj) this.headAnchor.remove(this.hairObj); this.hairObj = makeHair(this.fit, hatOn); this.hairHat = hatOn; this.headAnchor.add(this.hairObj); }
    if (this.hatObj) this.headAnchor.remove(this.hatObj);
    this.hatObj = null;
    if (L.hat !== 'tanpa') {
      this.hatObj = makeHat(L.hat, hexOf('hatColor', L.hatColor, '#f2efe6').getHex(), this.fit);
      this.headAnchor.add(this.hatObj);
    }
    if (this.glassObj) this.headAnchor.remove(this.glassObj);
    this.glassObj = null;
    if (L.glasses !== 'tanpa') { const f = this.fit; this.glassObj = makeGlasses(L.glasses); this.glassObj.position.set(f.cx, f.eye - 0.012, f.cz + f.rz * 0.98); this.glassObj.scale.setScalar(f.rx / 0.078); this.headAnchor.add(this.glassObj); }
  }

  constructor(gltf: GLTF, opts: { rodColor?: string; cap?: number } = {}) {
    this.model = cloneSkinned(gltf.scene);
    this.model.rotation.y = Math.PI; // model menghadap +Z; badan kita menghadap -Z
    this.root.add(this.model);
    this.model.traverse(o => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
        m.material = (m.material as THREE.Material).clone(); // bahan per pemancing (supaya warna baju tidak menular)
        const mat = m.material as THREE.MeshStandardMaterial; mat.envMapIntensity = 0.8;
        if (/Body|Head/.test(m.name)) mat.roughness = 0.62; }
      if ((o as THREE.Bone).isBone) { const bb = o as THREE.Bone; this.b[bb.name] = bb; this.rest.set(bb, bb.quaternion.clone()); if (/Hand(Index|Middle|Ring|Pinky)[123]$/.test(bb.name) && bb.name.startsWith('Right')) this.fingers.push(bb); }
    });
    if (this.b.Hips) this.hipRest.copy(this.b.Hips.position);
    this.root.updateMatrixWorld(true);
    // kalibrasi: di pose istirahat, joran yang digenggam tangan yang tergantung menunjuk ke depan badan
    const hq = this.b.RightHand.getWorldQuaternion(new THREE.Quaternion()).invert();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.root.getWorldQuaternion(new THREE.Quaternion()));
    this.handRodAxis.copy(fwd).applyQuaternion(hq).normalize();
    // topi pet di kepala
    const head = this.b.Head;
    this.headAnchor = new THREE.Group();
    const hp = head.getWorldPosition(new THREE.Vector3());
    this.headAnchor.position.set(hp.x, hp.y, hp.z); this.headAnchor.rotation.y = Math.PI;
    this.root.add(this.headAnchor); this.headAnchor.updateMatrixWorld(true);
    head.attach(this.headAnchor);
    this.model.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) this.meshes[m.name] = m; });
    this.fit = this.measureHead();
    this.rod = new Rod(opts.rodColor);
    this.applyLook({ hatColor: opts.cap !== undefined ? (['krem', 'hijau', 'merah', 'birutua'][[0xf2efe6, 0x2f6a4a, 0xd24a2a, 0x2a3a6a].indexOf(opts.cap)] ?? 'krem') : 'krem' });
  }

  /** Arah dunia dari vektor lokal badan. */
  private bodyToWorld(v: THREE.Vector3) { const c = v.clone(); c.y -= this.pose.seat * SEAT_DROP; return c.applyMatrix4(this.root.matrixWorld); }

  /** Terapkan satu klip gerak pada waktu t. w = 1 menimpa, 0..1 mencampur ke pose yang sudah ada. */
  private sample(c: MClip, t: number, w: number) {
    let bones = this.mBones.get(c);
    if (!bones) { bones = c.names.map(n => this.b[n]); this.mBones.set(c, bones); }
    for (let i = 0; i < bones.length; i++) {
      const bone = bones[i]; if (!bone) continue;
      _mq.fromArray(c.rot[i].evaluate(t) as unknown as number[]);
      if (w >= 1) bone.quaternion.copy(_mq); else bone.quaternion.slerp(_mq, w);
    }
    if (c.pos) { _mv.fromArray(c.pos.evaluate(t) as unknown as number[]); if (w >= 1) this.hipOff.copy(_mv); else this.hipOff.lerp(_mv, w); }
  }
  /** Pose dasar dari rekam gerak: diam ↔ jalan ↔ lari kecil, dicampur menurut kecepatan dan diselaraskan dengan langkah. */
  private applyMotion(time: number, P: AnglerPose) {
    const M = MOTION!, w = THREE.MathUtils.clamp(P.walk, 0, WALK_MAX), mv = Math.min(1, w), jg = jogMix(w);
    const u = P.walkPhase / (Math.PI * 2);                                   // satu siklus = dua langkah
    const at = (c: MClip) => { const f = (u + c.lead) / c.cycles; return (f - Math.floor(f)) * c.dur; };
    this.hipOff.set(0, 0, 0);
    if (mv < 0.999) { this.sample(M.idle, time % M.idle.dur, 1); if (mv > 0.001) this.sample(M.walk, at(M.walk), mv * mv * (3 - 2 * mv)); }
    else this.sample(M.walk, at(M.walk), 1);
    if (jg > 0.001 && mv > 0.5) this.sample(M.jog, at(M.jog), jg * mv);
    // duduk: kembali ke pose dasar lama (kaki ditekuk oleh kode di bawah)
    if (P.seat > 0.001) { for (const [bone, q] of this.rest) bone.quaternion.slerp(q, P.seat); this.hipOff.multiplyScalar(1 - P.seat); }
    const k = this.hipRest.y / 1.0026;
    this.b.Hips.position.set(this.hipRest.x + this.hipOff.x * k, this.hipRest.y + this.hipOff.y * k, this.hipRest.z + this.hipOff.z * k);
  }

  update(time: number) {
    const P = this.pose, b = this.b, mo = !!MOTION && !!b.Hips;
    /** bobot gerak buatan kode untuk kaki & napas: penuh tanpa mocap, hanya saat duduk bila mocap aktif */
    const pk = mo ? P.seat : 1;
    // pinggul turun saat duduk, sedikit naik-turun saat berjalan
    const wa = Math.min(1.4, P.walk);
    this.model.position.y = -P.seat * SEAT_DROP - (mo ? 0 : Math.abs(Math.sin(P.walkPhase)) * 0.028 * Math.min(1, wa));
    this.root.updateMatrixWorld(true);
    for (const [bone, q] of this.rest) bone.quaternion.copy(q);
    if (mo) this.applyMotion(time, P);
    this.model.updateMatrixWorld(true);
    const rq = this.root.getWorldQuaternion(new THREE.Quaternion());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(rq), up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(rq);

    // postur: napas, condong, putar badan, lutut sedikit ditekuk
    const br = Math.sin(time * 1.6) * 0.012 * (mo ? P.breathe : 1 + P.breathe);
    rotateBoneWorld(b.Spine, right, -P.lean * 0.45 + br);
    rotateBoneWorld(b.Spine1, right, -P.lean * 0.35);
    rotateBoneWorld(b.Spine2, right, -P.lean * 0.2 - br * 0.5);
    rotateBoneWorld(b.Spine, up, P.twist * 0.5);
    rotateBoneWorld(b.Spine2, up, P.twist * 0.5);
    if (pk > 0.001) {
      rotateBoneWorld(b.LeftUpLeg, right, 0.12 * pk); rotateBoneWorld(b.LeftLeg, right, -0.22 * pk);
      rotateBoneWorld(b.RightUpLeg, right, 0.06 * pk); rotateBoneWorld(b.RightLeg, right, -0.12 * pk);
      rotateBoneWorld(b.RightUpLeg, fwd, 0.04 * pk); rotateBoneWorld(b.LeftUpLeg, fwd, -0.06 * pk);
    }

    // duduk: paha mendatar, betis tegak
    if (P.seat > 0.001) {
      const st = P.seat;
      rotateBoneWorld(b.LeftUpLeg, right, 1.38 * st); rotateBoneWorld(b.RightUpLeg, right, 1.32 * st);
      rotateBoneWorld(b.LeftLeg, right, -1.45 * st); rotateBoneWorld(b.RightLeg, right, -1.38 * st);
      rotateBoneWorld(b.LeftUpLeg, fwd, -0.12 * st); rotateBoneWorld(b.RightUpLeg, fwd, 0.12 * st);
    }
    // berjalan: ayunan kaki prosedural (tanpa file animasi), lutut menekuk saat kaki diayun ke depan
    if (wa > 0.001 && !mo) {
      const ph = P.walkPhase, amp = 0.42 + 0.14 * Math.max(0, wa - 1);
      const sw = Math.sin(ph) * amp * Math.min(1, wa);
      rotateBoneWorld(b.LeftUpLeg, right, sw); rotateBoneWorld(b.RightUpLeg, right, -sw);
      const kneeK = (0.75 + 0.35 * Math.max(0, wa - 1)) * Math.min(1, wa);
      rotateBoneWorld(b.LeftLeg, right, -(0.08 + Math.max(0, Math.cos(ph)) * kneeK));
      rotateBoneWorld(b.RightLeg, right, -(0.08 + Math.max(0, -Math.cos(ph)) * kneeK));
      if (b.LeftFoot) rotateBoneWorld(b.LeftFoot, right, Math.max(0, -Math.sin(ph)) * 0.25 * Math.min(1, wa));
      if (b.RightFoot) rotateBoneWorld(b.RightFoot, right, Math.max(0, Math.sin(ph)) * 0.25 * Math.min(1, wa));
      // badan sedikit condong ke depan (lebih condong saat berlari) dan berputar mengikuti langkah
      rotateBoneWorld(b.Spine, right, -0.05 * wa);
      rotateBoneWorld(b.Spine1, up, Math.sin(ph) * 0.06 * Math.min(1, wa));
    }

    // kepala melihat target (dibatasi)
    if (P.look) {
      const hp = b.Head.getWorldPosition(new THREE.Vector3());
      const d = P.look.clone().sub(hp).normalize();
      const flat = new THREE.Vector3(d.x, 0, d.z).normalize();
      const yawTo = Math.atan2(new THREE.Vector3().crossVectors(fwd, flat).y, fwd.dot(flat));
      const pitchTo = Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
      rotateBoneWorld(b.Neck, up, THREE.MathUtils.clamp(yawTo, -0.9, 0.9) * 0.45);
      rotateBoneWorld(b.Head, up, THREE.MathUtils.clamp(yawTo, -0.9, 0.9) * 0.45);
      const r2 = new THREE.Vector3(1, 0, 0).applyQuaternion(b.Head.getWorldQuaternion(new THREE.Quaternion()));
      rotateBoneWorld(b.Head, right.clone().lerp(r2, 0.5).normalize(), -THREE.MathUtils.clamp(pitchTo + 0.1, -0.6, 0.5) * 0.8);
    }

    if (P.holdFish) { this.updateHoldFish(P, right, fwd); return; }

    // arah joran dunia
    const dirBody = new THREE.Vector3(-Math.sin(P.yaw) * Math.cos(P.pitch), Math.sin(P.pitch), -Math.cos(P.yaw) * Math.cos(P.pitch));
    const rodDir = dirBody.applyQuaternion(rq).normalize();
    // "bawah" joran: tempat reel menggantung. Diputar sedikit (roll) agar alami
    let rodDown = new THREE.Vector3(0, -1, 0).addScaledVector(rodDir, rodDir.y).normalize();
    rodDown.applyAxisAngle(rodDir, P.roll - 0.25);
    // tangan kanan: IK ke titik genggam, siku ke kanan-bawah
    const handW = this.bodyToWorld(P.hand);
    const poleR = this.bodyToWorld(new THREE.Vector3(0.75, 0.55, 0.25));
    solveTwoBone(b.RightArm, b.RightForeArm, b.RightHand, handW, poleR);
    // orientasi tangan: sumbu joran lokal → rodDir, jari → bawah joran
    const hq = quatFromAxes(this.handRodAxis, this.handFingerAxis, rodDir, rodDown);
    setWorldQuaternion(b.RightHand, hq);
    for (const f of this.fingers) { f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), /Index/.test(f.name) ? 0.9 : 1.2)); }
    b.RightHand.updateMatrixWorld(true);
    // titik genggam = telapak (sedikit ke arah jari) → dudukan reel
    const palm = b.RightHand.localToWorld(new THREE.Vector3(0, 0.075, 0.0));
    this.grip.copy(palm).addScaledVector(rodDown, 0.018);
    // orientasi joran: +Z lokal = rodDir, +Y lokal = -rodDown
    this.gripQ.copy(quatFromAxes(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), rodDir, rodDown.clone().negate()));
    this.rod.update(this.grip, this.gripQ, P.load, P.reelAngle);

    // tangan kiri: memutar engkol reel, atau memegang pantat joran
    let leftT: THREE.Vector3;
    if (P.reeling) {
      this.rod.knob.updateMatrixWorld(true);
      leftT = this.rod.knob.getWorldPosition(new THREE.Vector3());
    } else if (P.leftOnButt) {
      leftT = this.grip.clone().addScaledVector(rodDir, -0.3).addScaledVector(rodDown, 0.01);
    } else if (mo) {
      return; // tangan kiri bebas: ayunan lengan dari rekam gerak
    } else {
      // tangan kiri bebas: berayun berlawanan dengan kaki kiri saat berjalan
      const swing = Math.sin(P.walkPhase) * 0.2 * Math.min(1.3, wa);
      leftT = this.bodyToWorld(new THREE.Vector3(-0.24, 0.93 + Math.abs(swing) * 0.25, -0.08 + swing));
    }
    const poleL = this.bodyToWorld(new THREE.Vector3(-0.8, 0.4, 0.2));
    solveTwoBone(b.LeftArm, b.LeftForeArm, b.LeftHand, leftT, poleL);
    const lq = quatFromAxes(new THREE.Vector3(0, 1, 0), new THREE.Vector3(1, 0, 0), rodDown.clone().add(rodDir.clone().multiplyScalar(-0.4)), rodDir.clone().negate());
    if (P.leftOnButt || P.reeling) setWorldQuaternion(b.LeftHand, lq);
  }

  /** Pose memamerkan ikan: dua tangan memegang ikan di depan dada. */
  /** Titik tangan kanan saat mengangkat ikan (dunia) — dipakai fishing untuk menggantung ikan di genggaman. */
  raiseHand() { return this.bodyToWorld(new THREE.Vector3(0.44, 1.98, -0.04)); }
  private updateHoldFish(P: AnglerPose, right: THREE.Vector3, fwd: THREE.Vector3) {
    const b = this.b, fish = P.holdFish!;
    if (P.holdStyle === 'angkat') {
      // tangan kanan terangkat tinggi menjepit rahang ikan; siku ke samping-bawah
      const hand = this.raiseHand();
      solveTwoBone(b.RightArm, b.RightForeArm, b.RightHand, hand, this.bodyToWorld(new THREE.Vector3(0.95, 1.35, 0.25)));
      for (const f of this.fingers) if (/Right/.test(f.name)) f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), /Thumb/.test(f.name) ? 0.4 : 1.15));
      // tangan kiri memegang joran tegak di samping badan
      const up = new THREE.Vector3(0, 1, 0), left = right.clone().negate();
      const rodDir = up.clone().addScaledVector(fwd, 0.32).addScaledVector(left, 0.12).normalize();
      const g = this.bodyToWorld(new THREE.Vector3(-0.3, 1.02, -0.22));
      solveTwoBone(b.LeftArm, b.LeftForeArm, b.LeftHand, g, this.bodyToWorld(new THREE.Vector3(-0.8, 0.6, 0.3)));
      for (const f of this.fingers) if (/Left/.test(f.name)) f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.1));
      this.grip.copy(g).addScaledVector(fwd, 0.03);
      this.gripQ.copy(quatFromAxes(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), rodDir, fwd.clone().negate()));
      this.rod.update(this.grip, this.gripQ, new THREE.Vector3(), 0);
      return;
    }
    fish.updateMatrixWorld(true);
    const head = fish.userData.gripHead as THREE.Vector3 | undefined, tail = fish.userData.gripTail as THREE.Vector3 | undefined;
    const hW = head ? fish.localToWorld(head.clone()) : fish.getWorldPosition(new THREE.Vector3());
    const tW = tail ? fish.localToWorld(tail.clone()) : hW.clone().addScaledVector(right, 0.3);
    // setiap tangan memegang ujung ikan yang ada DI SISINYA (dulu kiri selalu ke kepala → lengan bersilang menutupi ikan)
    const mid = hW.clone().add(tW).multiplyScalar(0.5);
    const headOnRight = hW.clone().sub(mid).dot(right) > 0;
    const leftT = headOnRight ? tW : hW, rightT = headOnRight ? hW : tW;
    // siku mengarah ke luar-bawah supaya lengan tidak menutupi badan ikan
    solveTwoBone(b.LeftArm, b.LeftForeArm, b.LeftHand, leftT, this.bodyToWorld(new THREE.Vector3(-0.75, 0.55, 0.05)));
    solveTwoBone(b.RightArm, b.RightForeArm, b.RightHand, rightT, this.bodyToWorld(new THREE.Vector3(0.75, 0.55, 0.05)));
    // jari melengkung menopang ikan (orientasi telapak mengikuti IK — aman untuk kerangka Mixamo/RPM)
    for (const f of this.fingers) f.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.55));
    // joran disandarkan di samping (disembunyikan dari tangan)
    this.grip.copy(this.bodyToWorld(new THREE.Vector3(0.55, 0.25, 0.1)));
    const dir = new THREE.Vector3().copy(fwd).multiplyScalar(0.2).add(new THREE.Vector3(0, 1, 0)).normalize();
    this.gripQ.copy(quatFromAxes(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), dir, fwd.clone().negate()));
    this.rod.update(this.grip, this.gripQ, new THREE.Vector3(), 0);
  }

  bone(name: string) { return this.b[name]; }
}

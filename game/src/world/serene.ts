// Danau Serene: danau pegunungan jernih seperti konsep "Memancing di Danau Serene".
// Pegunungan bersalju di kejauhan, hutan pinus, dermaga kayu dengan lentera, pondok panggung
// dengan jendela menyala, air terjun di seberang, perahu layar, dan ikan yang terlihat di air jernih.
// Semua dibuat prosedural (tanpa aset tambahan) dan hemat: pinus & pegunungan masing-masing 1–2 draw call.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FishActor } from '../actors/fish';
import { broadTree, windU } from './broadtree';
import { Q } from '../core/quality';
import {
  LAKE, SDOCK, LODGE, FALLS, CLEARING, BRIDGES, SPOT_PLACES, groundH, lakeE, fbm, reserved, addObstacle, shoreLX, isWater, bridgeH,
} from './layout';

/** Pohon "di ujung danau": lebih dari 85 m dari dermaga pemain (pondok panggung & tepi kiri dekat tetap). */
export const farTree = (x: number, z: number) => Math.hypot(x, z + 5) > 85;
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/** Tekstur papan kayu lapuk (serat + celah + simpul). */
function woodTex(base: [number, number, number], w = 256, h = 128, boards = 4) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!, img = g.createImageData(w, h), R = rng(77 + base[0]);
  const shade: number[] = []; for (let b = 0; b < boards; b++) shade.push(0.82 + R() * 0.3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const b = Math.floor(y / (h / boards)), yy = (y % (h / boards)) / (h / boards);
    const grain = Math.sin(y * 0.9 + Math.sin(x * 0.015 + b * 3) * 2.2 + x * 0.004) * 0.5 + 0.5;
    const edge = yy < 0.06 || yy > 0.94 ? 0.45 : 1;
    const k = (0.62 + grain * 0.2 + R() * 0.12) * shade[b] * edge;
    const i = (y * w + x) * 4; img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(35,22,12,0.35)'; g.beginPath(); g.ellipse(R() * w, R() * h, 5, 2.5, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
/** Gabungkan beberapa geometri (non-indeks) menjadi satu, dengan warna per bagian. */
function merge(parts: { g: THREE.BufferGeometry; c: THREE.Color | ((y: number, x: number, z: number) => THREE.Color) }[]) {
  const pos: number[] = [], nor: number[] = [], col: number[] = [];
  for (const { g, c } of parts) {
    const n = g.index ? g.toNonIndexed() : g; n.computeVertexNormals();
    const p = n.attributes.position, q = n.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(q.getX(i), q.getY(i), q.getZ(i));
      const cc = typeof c === 'function' ? c(p.getY(i), p.getX(i), p.getZ(i)) : c; col.push(cc.r, cc.g, cc.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const C = (h: number) => new THREE.Color(h);

export class SereneScape {
  group = new THREE.Group();
  /** bola lampu (lentera, pondok) — dinyalakan sistem lampu dunia saat gelap */
  lamps: THREE.Mesh[] = [];
  private windows: THREE.MeshStandardMaterial[] = [];
  private lanternGlow: THREE.MeshStandardMaterial | null = null;
  private fallsMat: THREE.ShaderMaterial | null = null;
  private mist: THREE.Sprite[] = [];
  private boat = new THREE.Group(); private boatA = 0;
  private fish: { a: FishActor; p: THREE.Vector3; t: THREE.Vector3; v: number; yaw: number; ph: number }[] = [];
  private mountainMat: THREE.MeshStandardMaterial | null = null;
  readonly haze = new THREE.Color(0xa9c8e4);
  private plank: THREE.MeshStandardMaterial; private darkWood: THREE.MeshStandardMaterial;

  constructor(fishGltf: GLTF, private rockGltf?: GLTF) {
    this.group.name = 'serene';
    this.plank = new THREE.MeshStandardMaterial({ map: woodTex([150, 104, 66]), roughness: 0.82 });
    this.darkWood = new THREE.MeshStandardMaterial({ map: woodTex([92, 64, 42], 128, 64, 2), roughness: 0.9 });
    this.buildMountains();
    // pepohonan Serene kini dari EZ-Tree (vegetation.ts): pinus & ek realistis, pohon jauh memakai impostor
    this.buildDock();
    this.buildLodge();
    this.buildPier();
    this.buildShore();
    this.buildFalls();
    this.buildBoat();
    this.buildFish(fishGltf);
  }

  // ---------------- pegunungan bersalju (cincin di balik hutan) ----------------
  private buildMountains() {
    const cx = LAKE.cx, cz = LAKE.cz, A = 300, RAD = 34, R0 = 300, R1 = 1500;
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    const H = (x: number, z: number, r: number, th: number) => {
      const dirN = Math.max(0, -Math.sin(th));                       // utara (−Z, arah pandang pemain) lebih tinggi
      const env = sstep(R0, R0 + 320, r) * (1 - sstep(1250, R1, r));
      const ridge = 1 - Math.abs(fbm(x * 0.0021 + 11, z * 0.0021 - 4, 5) * 2 - 1);
      const ridge2 = 1 - Math.abs(fbm(x * 0.006 - 3, z * 0.006 + 9, 3) * 2 - 1);
      const peaks = Math.pow(ridge, 2.2) * (0.55 + 0.45 * dirN) * 300 + Math.pow(ridge2, 3) * 40;
      return -14 + env * (30 + peaks * sstep(R0 + 220, 980, r));
    };
    for (let j = 0; j <= RAD; j++) {
      const r = R0 + (R1 - R0) * Math.pow(j / RAD, 1.35);
      for (let i = 0; i <= A; i++) {
        const th = (i / A) * Math.PI * 2, x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
        pos.push(x, H(x, z, r, th), z);
      }
    }
    for (let j = 0; j < RAD; j++) for (let i = 0; i < A; i++) {
      const a = j * (A + 1) + i, b = a + 1, c = a + A + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);   // berlawanan arah jarum jam dilihat dari atas → normal menghadap ke atas
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const nrm = geo.attributes.normal, P = geo.attributes.position;
    const forest = C(0x1a3322), rock = C(0x66707e), rockD = C(0x434b57), snow = C(0xf7f9fc), c = new THREE.Color();
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), ny = nrm.getY(i);
      const n = fbm(x * 0.02, z * 0.02, 3), streak = fbm(x * 0.05 + y * 0.02, z * 0.05, 2);
      c.copy(rock).lerp(rockD, sstep(0.55, 0.85, 1 - ny) * 0.8 + (n - 0.5) * 0.4);
      const tree = 1 - sstep(55 + n * 50, 120 + n * 40, y);
      c.lerp(forest, tree * sstep(0.45, 0.75, ny));
      const snowLine = 150 + (n - 0.5) * 70;
      const s = sstep(snowLine, snowLine + 55, y) * sstep(0.3, 0.58, ny + (streak - 0.5) * 0.7);
      c.lerp(snow, Math.min(1, s * 1.1));
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, fog: false });
    const haze = { value: this.haze };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.hazeCol = haze;
      sh.vertexShader = 'varying float vDist;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\nvDist = -mvPosition.z;');
      sh.fragmentShader = 'uniform vec3 hazeCol; varying float vDist;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.05;').replace('#include <dithering_fragment>',
        `#include <dithering_fragment>
         float hz = 1.0 - exp(-max(0.0, vDist - 400.0) * 0.00055);
         gl_FragColor.rgb = mix(gl_FragColor.rgb, hazeCol, clamp(hz, 0.0, 0.42));`);
    };
    mat.customProgramCacheKey = () => 'sereneMtn';
    this.mountainMat = mat;
    const m = new THREE.Mesh(geo, mat); m.name = 'mountains'; m.renderOrder = -1;
    this.group.add(m);
    // hutan pinus kecil di lereng bawah pegunungan (kerucut sederhana, satu draw call)
    const coneGeo = new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0);
    const N = Math.round(2200 * Q.trees), im = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0x1b3524, roughness: 1, fog: false }), N);
    const R = rng(909), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
    let k = 0;
    for (let t = 0; t < N * 6 && k < N; t++) {
      const th = R() * Math.PI * 2, r = R0 + 160 + R() * 600, x = cx + Math.cos(th) * r, z = cz + Math.sin(th) * r;
      const y = H(x, z, r, th); if (y < 4 || y > 115) continue;
      const hh = 14 + R() * 12;
      im.setMatrixAt(k, mm.compose(p.set(x, y - 2, z), q, s.set(hh * 0.28, hh, hh * 0.28)));
      im.setColorAt(k++, cc.setHSL(0.36 + R() * 0.04, 0.35, 0.12 + R() * 0.06));
    }
    im.count = k; im.frustumCulled = false; this.group.add(im);
    this.far = [m, im]; im.userData.noCull = true;
  }
  /** pegunungan & hutan jauh prosedural (disembunyikan saat latar foto dipasang) */
  far: THREE.Object3D[] = [];
  private farPines: THREE.Object3D | null = null; private fallsObjs: THREE.Object3D[] = [];
  /** pemandangan ujung danau: pinus jauh & air terjun */
  setFarTrees(show: boolean) { if (this.farPines) this.farPines.visible = show; for (const o of this.farBroad) o.visible = show; for (const o of this.fallsObjs) o.visible = show; }
  setFarVisible(v: boolean) { for (const o of this.far) o.visible = v; }

  // ---------------- hutan pinus di sekeliling danau ----------------
  private buildPines() {
    const trunk = new THREE.CylinderGeometry(0.035, 0.06, 0.22, 6, 1, true).translate(0, 0.11, 0);
    const tiers: [number, number, number][] = [[0.1, 0.4, 0.34], [0.3, 0.34, 0.28], [0.5, 0.28, 0.21], [0.67, 0.25, 0.14], [0.82, 0.18, 0.07]];
    const parts: { g: THREE.BufferGeometry; c: THREE.Color | ((y: number) => THREE.Color) }[] = [{ g: trunk, c: C(0x4a3424) }];
    for (const [y, h, r] of tiers) {
      const cone = new THREE.ConeGeometry(r, h, 8, 1, true).translate(0, y + h / 2, 0);
      parts.push({ g: cone, c: (yy: number) => new THREE.Color().setHSL(0.37, 0.42, 0.1 + Math.max(0, Math.min(1, (yy - y) / h)) * 0.1 + yy * 0.05) });
    }
    const geo = merge(parts);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    const N = Math.round(3200 * Q.trees);
    const im = new THREE.InstancedMesh(geo, mat, N), imFar = new THREE.InstancedMesh(geo, mat, N);
    let kf = 0;
    const R = rng(31337), mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
    let k = 0;
    // pohon berdaun lebar (tajuk melebar, batang memutar) di sekitar dermaga, pondok & tepi dekat; pinus mendominasi lereng jauh
    const broad: { m: THREE.Matrix4; far: boolean; lod: 'full' | 'low' }[] = [], NB = Math.round(100 * Q.trees); let nOuter = 0;
    for (let t = 0; t < N * 14 && k + kf < N; t++) {
      const x = -330 + R() * 680, z = -480 + R() * 720;
      const e = lakeE(x, z); if (e < 1.012) continue;
      const h = groundH(x, z); if (h < 0.3) continue;
      // hutan rapat sampai bibir danau (seperti gambar konsep); celah acak supaya tidak seragam
      const dens = fbm(x * 0.03, z * 0.03, 2) + Math.min(0.5, (e - 1) * 4) * 0.6;
      if (dens < 0.46) continue;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < CLEARING.r + 4) continue;
      if (Math.abs(x) < 6 && z > -14 && z < 70) continue;                           // jalan dermaga tetap terbuka
      if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 8)) continue;
      if (reserved(x, z, 2)) continue;
      const near = Math.hypot(x, z + 5);
      if (near < 130 && R() > 0.35 + Q.trees * 0.45) continue;                          // jarangkan sesuai tingkat grafis (hemat = lebih sedikit)
      if (near < 130 || (nOuter < NB && near < 260 && R() < 0.42)) {   // ≤130 m dari dermaga: semua pohon lebar; 130–260 m: campur pinus
        if (near >= 130) nOuter++;
        const bh = 8 + R() * 5;
        broad.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, h - 0.15, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), new THREE.Vector3(bh * (0.9 + R() * 0.3), bh, bh * (0.9 + R() * 0.3))), far: farTree(x, z), lod: near < 48 ? 'full' : 'low' });
        if (e < 1.32) addObstacle(x, z, 0.5);
        continue;
      }
      const hh = (7 + R() * 9) * (1 + Math.min(0.8, (e - 1) * 1.2));
      // dua kelompok: dekat dermaga & pondok (selalu tampil) dan ujung/seberang danau (bisa disembunyikan)
      const tgt = farTree(x, z) ? imFar : im, ti = tgt === im ? k : kf;
      tgt.setMatrixAt(ti, mm.compose(p.set(x, h - 0.3, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.set(hh * (0.85 + R() * 0.3), hh, hh * (0.85 + R() * 0.3))));
      tgt.setColorAt(ti, cc.setRGB(0.85 + R() * 0.3, 0.9 + R() * 0.25, 0.85 + R() * 0.25));
      if (tgt === im) k++; else kf++;
      if (e < 1.32) addObstacle(x, z, 0.35 + hh * 0.012);
    }
    im.count = k; im.castShadow = Q.shadows; im.receiveShadow = true; im.computeBoundingSphere();
    imFar.count = kf; imFar.receiveShadow = true; imFar.computeBoundingSphere();
    this.group.add(im, imFar); this.farPines = imFar;
    // pohon lebar: batang & daun, kelompok dekat dan jauh (jauh ikut disembunyikan bersama pinus jauh)
    for (const far of [false, true]) for (const lod of ['full', 'low'] as const) {
      const T = broadTree(lod);
      const list = broad.filter(b => b.far === far && b.lod === lod); if (!list.length) continue;
      const bk = new THREE.InstancedMesh(T.bark, T.barkMat, list.length), lf = new THREE.InstancedMesh(T.leaves, T.leafMat, list.length);
      list.forEach((b, i) => { bk.setMatrixAt(i, b.m); lf.setMatrixAt(i, b.m); });
      bk.castShadow = lf.castShadow = Q.shadows && !far; bk.receiveShadow = lf.receiveShadow = true;
      bk.computeBoundingSphere(); lf.computeBoundingSphere();
      bk.userData.noCull = lf.userData.noCull = true;
      const grp = new THREE.Group(); grp.add(bk, lf); this.group.add(grp);
      if (far) this.farBroad.push(grp);
    }
  }
  private farBroad: THREE.Object3D[] = [];

  // ---------------- dermaga kayu pemain + lentera + tiang tambat ----------------
  private buildDock() {
    const D = SDOCK, len = D.z1 - D.z0, g = new THREE.Group();
    const pw = 0.24, n = Math.floor(len / (pw + 0.025));
    const plankGeo = new THREE.BoxGeometry(D.w, 0.07, pw);
    const im = new THREE.InstancedMesh(plankGeo, this.plank, n);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), R = rng(5);
    for (let i = 0; i < n; i++) {
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.02, (R() - 0.5) * 0.015, (R() - 0.5) * 0.02));
      im.setMatrixAt(i, mm.compose(p.set(D.x + (R() - 0.5) * 0.04, D.y - 0.035 + (R() - 0.5) * 0.012, D.z1 - 0.15 - i * (pw + 0.025)), q, s));
    }
    im.receiveShadow = true; im.castShadow = true; g.add(im);
    // gelagar & tepi
    for (const sx of [-1, 1]) {
      const rim = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, len), this.darkWood); rim.position.set(D.x + sx * (D.w / 2 + 0.06), D.y - 0.14, (D.z0 + D.z1) / 2); g.add(rim);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.16, len), this.darkWood); beam.position.set(D.x + sx * D.w * 0.25, D.y - 0.17, (D.z0 + D.z1) / 2); g.add(beam);
    }
    // tiang bulat: setiap 2,3 m di kedua sisi, sebagian menonjol di atas lantai
    const postMat = new THREE.MeshStandardMaterial({ map: this.darkWood.map, color: 0x9a8a78, roughness: 0.95 });
    for (let z = D.z0 + 0.2; z < D.z1; z += 2.3) for (const sx of [-1, 1]) {
      const x = D.x + sx * (D.w / 2 + 0.16), bed = Math.min(0, groundH(x, z)) - 0.4, top = D.y + (z < D.z0 + 3 ? 0.42 : 0.12);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, top - bed, 9), postMat); post.position.set(x, (top + bed) / 2, z); post.castShadow = true; g.add(post);
    }
    // tiang tambat besar di kiri pemain + tali melilit
    const bx = D.x - 1.0, bz = D.z0 + 2.6;
    const boll = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 1.25, 12), postMat); boll.position.set(bx, D.y + 0.5, bz); boll.castShadow = true; g.add(boll);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.21, 0.06, 12), this.darkWood); cap.position.set(bx, D.y + 1.14, bz); g.add(cap);
    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.025, 6, 18), new THREE.MeshStandardMaterial({ color: 0xc9b48a, roughness: 1 }));
    rope.rotation.x = Math.PI / 2; for (let i = 0; i < 3; i++) { const r = rope.clone(); r.position.set(bx, D.y + 0.62 + i * 0.05, bz); g.add(r); }
    addObstacle(bx, bz, 0.3);
    // lentera kemah di sudut dermaga (menyala lembut di siang hari, terang di malam hari)
    const lx = D.x - 1.8, lz = D.z0 + 1.1;
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.42, 0.5), this.plank); box.position.set(lx, D.y + 0.21, lz); box.rotation.y = 0.2; box.castShadow = true; g.add(box);
    const lan = new THREE.Group(), metal = new THREE.MeshStandardMaterial({ color: 0x2a2620, metalness: 0.7, roughness: 0.45 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.08, 14), metal); base.position.y = 0.04;
    this.lanternGlow = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffa850, emissiveIntensity: 1.2, roughness: 0.2, transparent: true, opacity: 0.92 });
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 14), this.lanternGlow); glass.position.y = 0.21;
    for (let i = 0; i < 4; i++) { const bar = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.28, 0.014), metal); const a = i * Math.PI / 2 + 0.4; bar.position.set(Math.cos(a) * 0.11, 0.21, Math.sin(a) * 0.11); lan.add(bar); }
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.12, 14), metal); top.position.y = 0.4;
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.008, 5, 16, Math.PI), metal); handle.position.y = 0.47;
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); bulb.position.y = 0.21;
    lan.add(base, glass, top, handle, bulb); lan.position.set(lx, D.y + 0.42, lz); g.add(lan);
    this.lamps.push(bulb);
    addObstacle(lx, lz, 0.4);
    // gulungan tali & ember kecil di dermaga
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0xbfa978, roughness: 1 })); coil.rotation.x = Math.PI / 2; coil.position.set(D.x + 1.7, D.y + 0.04, D.z0 + 6.5); g.add(coil);
    this.group.add(g);
  }

  // ---------------- pondok panggung (jendela menyala, papan nama) ----------------
  private buildLodge() {
    const L = LODGE, g = new THREE.Group();
    // lantai teras + tiang panggung
    const deckN = Math.floor(L.w / 0.27);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.25, 0.08, L.d), this.plank, deckN);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < deckN; i++) im.setMatrixAt(i, mm.compose(p.set(L.x - L.w / 2 + 0.14 + i * 0.27, L.y - 0.04, L.z), q, one));
    im.receiveShadow = im.castShadow = true; g.add(im);
    const postMat = new THREE.MeshStandardMaterial({ map: this.darkWood.map, color: 0x8a7a68, roughness: 0.95 });
    for (let ix = 0; ix <= 4; ix++) for (let iz = 0; iz <= 3; iz++) {
      const x = L.x - L.w / 2 + 0.3 + ix * (L.w - 0.6) / 4, z = L.z - L.d / 2 + 0.3 + iz * (L.d - 0.6) / 3, bed = Math.min(0, groundH(x, z)) - 0.3;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.19, L.y - bed, 8), postMat); post.position.set(x, (L.y + bed) / 2 - 0.05, z); g.add(post);
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 2.4), postMat); brace.position.set(x, L.y - 1.0, z); brace.rotation.x = 0.7; if (iz < 3) g.add(brace);
    }
    // pagar teras
    const rail = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, len), this.darkWood); top.position.set((x0 + x1) / 2, L.y + 0.95, (z0 + z1) / 2); top.rotation.y = yaw; g.add(top);
      const mid = top.clone(); mid.position.y = L.y + 0.5; g.add(mid);
      for (let t = 0; t <= len; t += 1.3) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.95, 0.09), this.darkWood); b.position.set(x0 + (x1 - x0) * t / len, L.y + 0.47, z0 + (z1 - z0) * t / len); g.add(b); }
    };
    const xl = L.x - L.w / 2, xr = L.x + L.w / 2, zf = L.z + L.d / 2, zb = L.z - L.d / 2;
    rail(xl, zf, xl + 3.4, zf); rail(xl + 6.4, zf, xr, zf); rail(xr, zf, xr, zb); rail(xr, zb, xl, zb);
    // badan pondok kayu
    const B = L.body, wallH = 3.1;
    const logTex = woodTex([128, 82, 48], 256, 256, 12); logTex.repeat.set(2, 1);
    const logMat = new THREE.MeshStandardMaterial({ map: logTex, roughness: 0.85 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(B.w, wallH, B.d), logMat); body.position.set(B.x, L.y + wallH / 2, B.z); body.castShadow = true; body.receiveShadow = true; g.add(body);
    // atap pelana curam (sirap gelap hijau keabuan) + loteng depan
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a4f44, roughness: 0.85, map: woodTex([90, 92, 80], 128, 128, 10) });
    const pitch = 0.78, over = 0.55, rl = (B.d / 2 + over) / Math.cos(pitch);
    for (const sz of [-1, 1]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(B.w + 1.0, 0.14, rl), roofMat);
      r.position.set(B.x, L.y + wallH + Math.tan(pitch) * (B.d / 2) / 2 + 0.05, B.z + sz * (B.d / 2) / 2 + sz * over * 0.3);
      r.rotation.x = sz * pitch; r.castShadow = true; g.add(r);
    }
    // dinding segitiga samping
    const tri = new THREE.Shape(); const rh = Math.tan(pitch) * B.d / 2;
    tri.moveTo(-B.d / 2, 0); tri.lineTo(B.d / 2, 0); tri.lineTo(0, rh); tri.closePath();
    for (const sx of [-1, 1]) { const gb = new THREE.Mesh(new THREE.ShapeGeometry(tri), logMat); gb.rotation.y = Math.PI / 2 * sx; gb.position.set(B.x + sx * B.w / 2, L.y + wallH, B.z); g.add(gb); }
    // loteng depan (gable kecil) dengan papan nama bercahaya
    const dorm = new THREE.Group();
    const dBody = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 1.6), logMat); dBody.position.set(0, 0.8, 0); dorm.add(dBody);
    const dTri = new THREE.Shape(); dTri.moveTo(-1.45, 0); dTri.lineTo(1.45, 0); dTri.lineTo(0, 1.25); dTri.closePath();
    const dFace = new THREE.Mesh(new THREE.ShapeGeometry(dTri), logMat); dFace.position.set(0, 1.6, 0.81); dorm.add(dFace);
    for (const sx of [-1, 1]) { const r = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 2.1), roofMat); r.position.set(sx * 0.72, 2.2, 0.15); r.rotation.z = -sx * 0.7; dorm.add(r); }
    const signC = document.createElement('canvas'); signC.width = signC.height = 128; const sg = signC.getContext('2d')!;
    sg.fillStyle = '#3a2412'; sg.beginPath(); sg.arc(64, 64, 60, 0, 7); sg.fill(); sg.strokeStyle = '#ffcf7a'; sg.lineWidth = 8; sg.stroke();
    sg.strokeStyle = '#ffe6b0'; sg.lineWidth = 9; sg.lineCap = 'round'; sg.beginPath(); sg.moveTo(74, 28); sg.lineTo(74, 76); sg.arc(60, 76, 14, 0, Math.PI); sg.stroke();
    const signTex = new THREE.CanvasTexture(signC); signTex.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.CircleGeometry(0.42, 24), new THREE.MeshStandardMaterial({ map: signTex, emissive: 0xffb060, emissiveMap: signTex, emissiveIntensity: 0.5 }));
    sign.position.set(0, 1.95, 0.83); dorm.add(sign); this.windows.push(sign.material as THREE.MeshStandardMaterial);
    dorm.position.set(B.x + 0.4, L.y + wallH - 0.3, B.z + B.d / 2 - 0.2); g.add(dorm);
    // jendela & pintu menyala (hangat)
    const winMat = new THREE.MeshStandardMaterial({ color: 0x3a2a18, emissive: 0xffb45a, emissiveIntensity: 0.55, roughness: 0.4 });
    this.windows.push(winMat);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b1c10, roughness: 0.9 });
    const win = (x: number, y: number, z: number, w: number, h: number, ry = 0) => {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w + 0.14, h + 0.14, 0.06), frameMat); f.position.set(x, y, z); f.rotation.y = ry; g.add(f);
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(w, h), winMat); gl.position.set(x + Math.sin(ry) * 0.035, y, z + Math.cos(ry) * 0.035); gl.rotation.y = ry; g.add(gl);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, 0.04), frameMat); bar.position.copy(gl.position); bar.rotation.y = ry; g.add(bar);
      const bar2 = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, 0.04), frameMat); bar2.position.copy(gl.position); bar2.rotation.y = ry; g.add(bar2);
    };
    const fz = B.z + B.d / 2 + 0.01;
    win(B.x - 2.7, L.y + 1.55, fz, 0.9, 1.0); win(B.x - 1.3, L.y + 1.55, fz, 0.9, 1.0); win(B.x + 1.9, L.y + 1.55, fz, 0.9, 1.0);
    win(B.x + 0.4, L.y + wallH + 0.55, B.z + B.d / 2 + 0.62, 0.7, 0.6);
    win(B.x + B.w / 2 + 0.01, L.y + 1.55, B.z + 1.2, 1.0, 1.0, Math.PI / 2); win(B.x + B.w / 2 + 0.01, L.y + 1.55, B.z - 1.4, 1.0, 1.0, Math.PI / 2);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.1, 0.08), this.darkWood); door.position.set(B.x + 0.4, L.y + 1.05, fz + 0.02); g.add(door);
    // lampu teras
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); lamp.position.set(B.x - 0.5, L.y + 2.45, fz + 0.18); g.add(lamp); this.lamps.push(lamp);
    // cerobong batu
    const ch = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.6, 0.7), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1 })); ch.position.set(B.x - B.w / 2 + 0.9, L.y + wallH + 1.1, B.z - 0.9); g.add(ch);
    // pondok kecil (gudang perahu) di sisi kanan, lebih rendah
    const an = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 3.4), logMat); an.position.set(L.x + L.w / 2 + 1.4, L.y - 0.2 + 1.15, L.z - 1.2); an.castShadow = true; g.add(an);
    const anR = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 4.0), roofMat); anR.position.set(L.x + L.w / 2 + 1.4, L.y - 0.2 + 2.55, L.z - 1.2); anR.rotation.z = 0.32; g.add(anR);
    win(L.x + L.w / 2 + 1.4, L.y + 0.95, L.z - 1.2 + 1.71, 0.7, 0.6);
    const anDeck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.1, 3.8), this.plank); anDeck.position.set(L.x + L.w / 2 + 1.4, L.y - 0.25, L.z - 1.2); g.add(anDeck);
    for (const [dx, dz] of [[-1.6, -1.7], [1.6, -1.7], [-1.6, 1.7], [1.6, 1.7]]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 9, 7), postMat); pp.position.set(L.x + L.w / 2 + 1.4 + dx, L.y - 4.7, L.z - 1.2 + dz); g.add(pp); }
    // kursi & meja kayu di teras
    const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.45), this.plank); bench.position.set(L.x + 3.6, L.y + 0.45, L.z + 3.4); g.add(bench);
    for (const sx of [-1, 1]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.45, 0.4), this.darkWood); lg.position.set(L.x + 3.6 + sx * 0.7, L.y + 0.22, L.z + 3.4); g.add(lg); }
    g.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    this.group.add(g);
  }

  // ---------------- titian kayu pondok ----------------
  private buildPier() {
    for (const br of BRIDGES) {
      if (br.style !== 'kayu') continue;
      const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const n = Math.floor(len / 0.27), im = new THREE.InstancedMesh(new THREE.BoxGeometry(br.w, 0.07, 0.24), this.plank, n);
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n, y = bridgeH(br, t, len) - 0.035;
        const t2 = Math.min(1, t + 0.02), slope = Math.atan2(bridgeH(br, t2, len) - bridgeH(br, t, len), (t2 - t) * len);
        q.setFromEuler(new THREE.Euler(-slope, yaw, 0, 'YXZ'));
        im.setMatrixAt(i, mm.compose(p.set(br.a.x + dx * t, y, br.a.z + dz * t), q, one));
      }
      im.castShadow = im.receiveShadow = true; this.group.add(im);
      for (let t = 0.12; t < 1; t += 0.2) for (const s of [-1, 1]) {
        const x = br.a.x + dx * t + Math.cos(yaw) * s * br.w / 2, z = br.a.z + dz * t - Math.sin(yaw) * s * br.w / 2;
        const top = bridgeH(br, t, len) + 0.9, bed = Math.min(groundH(x, z), 0) - 0.3;
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, top - bed, 6), this.darkWood); post.position.set(x, (top + bed) / 2, z); this.group.add(post);
      }
    }
  }

  // ---------------- tepi kiri berbatu dengan bunga liar ----------------
  private buildShore() {
    const R = rng(4242);
    const rockGeo = new THREE.IcosahedronGeometry(1, 3), rp = rockGeo.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < rp.count; i++) { v.fromBufferAttribute(rp, i); const n = fbm(v.x * 1.4 + 3, v.z * 1.4 + v.y * 0.8, 3); v.multiplyScalar(0.8 + n * 0.42); v.y *= 0.72; rp.setXYZ(i, v.x, v.y, v.z); }
    rockGeo.computeVertexNormals();
    // warna: abu kebiruan dengan lumut di bagian atas
    const rc: number[] = []; for (let i = 0; i < rp.count; i++) { const y = rp.getY(i), m = sstep(0.2, 0.62, y) * (0.5 + fbm(rp.getX(i) * 3, rp.getZ(i) * 3, 2)); const c = C(0x8b8f93).lerp(C(0x5f7a3a), Math.min(0.85, m)); rc.push(c.r, c.g, c.b); }
    rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rc, 3));
    let rGeo: THREE.BufferGeometry = rockGeo, rMat: THREE.Material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
    // batu bertekstur foto (model GLB) bila tersedia: dinormalkan ke jari-jari ±1
    let src: THREE.Mesh | null = null; this.rockGltf?.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    if (src) {
      const sm = src as THREE.Mesh; rGeo = sm.geometry.clone(); rGeo.computeBoundingBox();
      const bb = rGeo.boundingBox!, c = bb.getCenter(new THREE.Vector3()), sz = bb.getSize(new THREE.Vector3());
      rGeo.translate(-c.x, -c.y, -c.z); rGeo.scale(2 / sz.x, 2 / sz.x, 2 / sz.x);
      rMat = (sm.material as THREE.MeshStandardMaterial).clone(); (rMat as THREE.MeshStandardMaterial).color.setScalar(0.9);
    }
    const N = 90, im = new THREE.InstancedMesh(rGeo, rMat, N);
    const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), cc = new THREE.Color();
    let k = 0;
    for (let t = 0; t < N * 20 && k < N; t++) {
      // sepanjang tepi kiri (dekat dermaga paling rapat) + sedikit di tepi depan
      const z = 10 - Math.pow(R(), 1.7) * 120, x = shoreLX(z) + (R() - 0.35) * 7;
      const h = groundH(x, z); if (h < -1.4 || h > 3) continue;
      if (Math.abs(x) < 4 && z > SDOCK.z0 - 1) continue;
      if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 1.6)) continue;
      const sc = 0.35 + Math.pow(R(), 2) * 1.6 * (z > -30 ? 1 : 1.4);
      im.setMatrixAt(k, mm.compose(p.set(x, h - sc * 0.25, z), q.setFromEuler(new THREE.Euler(R() * 0.5, R() * 6.28, R() * 0.5)), s.set(sc * (1 + R() * 0.5), sc * (0.7 + R() * 0.4), sc)));
      im.setColorAt(k++, cc.setScalar(0.85 + R() * 0.3));
      if (h > 0.05 && sc > 0.5) addObstacle(x, z, sc * 0.8);
    }
    im.count = k; im.castShadow = im.receiveShadow = true; this.group.add(im);
    // bunga liar (merah muda, putih, ungu, kuning): bidang kecil bersilang, satu draw call
    const fg = new THREE.PlaneGeometry(0.16, 0.16).translate(0, 0.32, 0), fg2 = fg.clone().rotateY(Math.PI / 2);
    const stem = new THREE.PlaneGeometry(0.02, 0.3).translate(0, 0.15, 0);
    const flowerGeo = merge([{ g: fg, c: C(0xffffff) }, { g: fg2, c: C(0xffffff) }, { g: stem, c: C(0x3f7a2a) }]);
    const FN = Math.round(700 * Math.max(0.5, Q.trees)), fim = new THREE.InstancedMesh(flowerGeo, new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 }), FN);
    const pal = [0xff8ac2, 0xf5f0ff, 0xb98cff, 0xffd84a, 0xff6a9a, 0xffffff];
    k = 0;
    for (let t = 0; t < FN * 10 && k < FN; t++) {
      const z = 8 - Math.pow(R(), 1.5) * 90, x = shoreLX(z) - R() * 9;
      const h = groundH(x, z); if (h < 0.15 || h > 6) continue;
      if (Math.hypot(x - CLEARING.x, z - CLEARING.z) < 3) continue;
      const sc = 0.7 + R() * 0.8;
      fim.setMatrixAt(k, mm.compose(p.set(x, h - 0.04, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), R() * 6.28), s.setScalar(sc)));
      fim.setColorAt(k++, cc.setHex(pal[Math.floor(R() * pal.length)]));
    }
    fim.count = k; this.group.add(fim);
  }

  // ---------------- air terjun di seberang danau ----------------
  private buildFalls() {
    // cari bibir air di bawah tebing & puncak tebing
    let x = FALLS.x, z = FALLS.z + 40;
    for (let i = 0; i < 300 && groundH(x, z) < 0.3; i++) z -= 0.5;
    const bottom = new THREE.Vector3(x, 0, z + 1.5);
    let tz = z; for (let i = 0; i < 200 && groundH(x, tz) < 36; i++) tz -= 0.5;
    const topY = groundH(x, tz) - 0.5, top = new THREE.Vector3(x, topY, tz);
    const h = top.y - bottom.y, dz = bottom.z - top.z;
    const geo = new THREE.PlaneGeometry(9, Math.hypot(h, dz), 1, 12);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, fog: true, side: THREE.DoubleSide,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { time: { value: 0 }, bright: { value: 1 } }]),
      vertexShader: `varying vec2 vUv;\n#include <fog_pars_vertex>\nvoid main(){ vUv = uv; vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;\n#include <fog_vertex>\n}`,
      fragmentShader: `uniform float time, bright; varying vec2 vUv;\n#include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 q = vec2(vUv.x * 14.0, vUv.y * 3.0 + time * 1.6);
          float s = n(q) * 0.6 + n(q * vec2(2.3, 2.0) + 4.0) * 0.4;
          float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
          vec3 col = mix(vec3(0.62, 0.82, 0.9), vec3(1.0), smoothstep(0.35, 0.8, s)) * bright;
          gl_FragColor = vec4(col, edge * (0.55 + s * 0.45));
          #include <fog_fragment>
        }`,
    });
    this.fallsMat = mat;
    const before = this.group.children.length;
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(top).lerp(bottom, 0.5); m.position.y += 0.2;
    m.rotation.x = -Math.atan2(dz, h) * 0.9;
    this.group.add(m);
    // kabut & buih di kaki air terjun
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    for (let i = 0; i < 5; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.7 }));
      sp.position.set(bottom.x + (i - 2) * 2.2, 1.2 + (i % 2) * 1.5, bottom.z + 1); sp.scale.setScalar(7 + i);
      this.group.add(sp); this.mist.push(sp);
    }
    // batu-batu basah di kaki tebing
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1.5 + (i % 3)), new THREE.MeshStandardMaterial({ color: 0x4c5258, roughness: 0.8 }));
      r.position.set(bottom.x - 7 + i * 2.8, 0.2, bottom.z - 1 + (i % 2)); r.scale.y = 0.7; this.group.add(r);
    }
    this.fallsObjs = this.group.children.slice(before);
  }

  // ---------------- perahu layar ----------------
  private buildBoat() {
    const b = this.boat, white = new THREE.MeshStandardMaterial({ color: 0xf2efe8, roughness: 0.5 });
    const hullShape = new THREE.Shape();
    hullShape.moveTo(0, 3.6); hullShape.quadraticCurveTo(1.25, 1.4, 1.1, -2.6); hullShape.lineTo(-1.1, -2.6); hullShape.quadraticCurveTo(-1.25, 1.4, 0, 3.6);
    const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 0.8, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }), white);
    hull.rotation.x = Math.PI / 2; hull.position.y = 0.55; hull.scale.set(1, 1, 1);
    const stripe = new THREE.Mesh(new THREE.ExtrudeGeometry(hullShape, { depth: 0.08, bevelEnabled: false }), new THREE.MeshStandardMaterial({ color: 0x1f3a6a })); stripe.rotation.x = Math.PI / 2; stripe.position.y = 0.2; stripe.scale.set(1.02, 1.0, 1);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 1.6), white); cabin.position.set(0, 0.85, -0.4);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 9, 8), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, metalness: 0.4, roughness: 0.4 })); mast.position.set(0, 5.0, 0.4);
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.6, 6), mast.material); boom.rotation.x = Math.PI / 2; boom.position.set(0, 1.5, -1.3);
    const sailMat = new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.75, side: THREE.DoubleSide });
    const tri = (pts: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.computeVertexNormals(); return g; };
    const main = new THREE.Mesh(tri([0, 9.2, 0.38, 0, 1.6, 0.38, 0, 1.6, -3.0]), sailMat);
    const jib = new THREE.Mesh(tri([0, 8.6, 0.48, 0, 0.9, 3.3, 0, 0.9, 0.55]), sailMat);
    b.add(hull, stripe, cabin, mast, boom, main, jib);
    b.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.castShadow = true; });
    this.group.add(b);
  }

  // ---------------- ikan yang terlihat di air jernih ----------------
  private buildFish(gltf: GLTF) {
    const kinds: [Parameters<FishActor['setSpecies']>[0], number, number][] = [['mas', 3.2, 68], ['nila', 1.2, 42], ['patin', 4.0, 80], ['mas', 2.4, 60], ['nila', 0.9, 38], ['toman', 4.4, 86], ['nila', 1.1, 44]];
    const n = Q.trees >= 0.8 ? kinds.length : 4;
    for (let i = 0; i < n; i++) {
      const [k, w, cm] = kinds[i], a = new FishActor(gltf);
      a.setSpecies(k, w, cm); a.group.visible = true;
      a.group.traverse(o => { (o as THREE.Mesh).castShadow = false; });
      const p = this.fishTarget(i); this.group.add(a.group);
      this.fish.push({ a, p: p.clone(), t: this.fishTarget(i + 7), v: 0.35 + (i % 3) * 0.15, yaw: 0, ph: i * 1.7 });
    }
  }
  /** Titik renang acak di air jernih di depan dermaga (tempat pemain melihat). */
  private fishTarget(seed: number) {
    const R = rng(1 + Math.floor(seed * 7919 + performance.now()) % 100000);
    for (let i = 0; i < 30; i++) {
      const x = -3 + R() * 18, z = SDOCK.z0 - 3 - R() * 16, bed = groundH(x, z);
      if (bed > -1.3 || !isWater(x, z)) continue;
      return new THREE.Vector3(x, Math.max(bed + 0.45, -0.55 - R() * Math.min(1.4, -bed - 1)), z);
    }
    return new THREE.Vector3(4, -1, SDOCK.z0 - 8);
  }

  update(dt: number, time: number, night: number, focus: THREE.Vector3) {
    // jendela & lentera menyala (redup di siang hari seperti gambar konsep, terang di malam hari)
    for (const w of this.windows) w.emissiveIntensity = 0.45 + night * 1.1;
    if (this.lanternGlow) this.lanternGlow.emissiveIntensity = 0.9 + night * 2.2 + Math.sin(time * 9) * 0.04;
    windU.value = time;
    if (this.fallsMat) { this.fallsMat.uniforms.time.value = time; this.fallsMat.uniforms.bright.value = 1 - night * 0.7; }
    this.mist.forEach((m, i) => { (m.material as THREE.SpriteMaterial).opacity = (0.45 + 0.2 * Math.sin(time * 0.7 + i)) * (1 - night * 0.6); });
    // perahu layar berlayar pelan memutari tengah danau
    this.boatA += dt * 0.012;
    const bx = 70 + Math.cos(this.boatA) * 26, bz = -95 + Math.sin(this.boatA) * 32;
    this.boat.position.set(bx, Math.sin(time * 0.8) * 0.06, bz);
    this.boat.rotation.set(Math.sin(time * 0.6) * 0.025, Math.atan2(-Math.sin(this.boatA) * 26, Math.cos(this.boatA) * 32), Math.sin(time * 0.7 + 1) * 0.05 + 0.06);
    // ikan: berenang ke titik tujuan, berbelok lembut; dekat pemain saja supaya hemat
    if (focus.distanceToSquared(new THREE.Vector3(0, 0, SDOCK.z0)) > 70 * 70) { for (const f of this.fish) f.a.group.visible = false; return; }
    for (const f of this.fish) {
      f.a.group.visible = true;
      const d = f.t.clone().sub(f.p); const dist = d.length();
      if (dist < 0.6) { f.t = this.fishTarget(time * 13 + f.ph); continue; }
      const want = Math.atan2(d.x, d.z), dy = Math.atan2(Math.sin(want - f.yaw), Math.cos(want - f.yaw));
      f.yaw += dy * Math.min(1, dt * 1.2);
      const sp = f.v * (0.7 + 0.3 * Math.sin(time * 0.9 + f.ph));
      f.p.x += Math.sin(f.yaw) * sp * dt; f.p.z += Math.cos(f.yaw) * sp * dt; f.p.y += Math.sign(d.y) * Math.min(Math.abs(d.y), dt * 0.15);
      f.a.group.position.copy(f.p); f.a.group.rotation.set(0, f.yaw, Math.sin(time * 2 + f.ph) * 0.04);
      f.a.update(time, 0.35 + sp, 0.07);
    }
  }
}

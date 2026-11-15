// Pepohonan (EZ-Tree, dibuat saat memuat), rumput tinggi bergoyang, alang-alang, teratai, dan batu.
// Pohon dekat memakai model penuh; pohon jauh memakai "impostor" (gambar pohon asli pada dua bidang silang)
// supaya ribuan segitiga tidak membebani HP.
import * as THREE from 'three';
import { Tree } from 'ez-tree-src/index.js';
import { groundH, lakeE, SPOT_PLACES, inKeramba, fbm, reserved, addObstacle, shoreXZ, LOC, MAPSTYLE } from './layout';
import { Q } from '../core/quality';

type Variant = { branches: THREE.BufferGeometry; leaves: THREE.BufferGeometry; bMat: THREE.Material; lMat: THREE.Material; height: number; impostor: THREE.Texture; aspect: number; baseW: number };

const PRESETS: { name: string; tint?: number; h: [number, number] }[] = [
  { name: 'Oak Medium', tint: 0x9fcf6a, h: [10, 15] },
  { name: 'Ash Medium', tint: 0xa8d870, h: [9, 14] },
  { name: 'Aspen Medium', tint: 0xb5dc78, h: [11, 16] },
  { name: 'Oak Large', tint: 0x8fc460, h: [13, 18] },
  { name: 'Bush 1', tint: 0x9acb66, h: [2.5, 4] },
  { name: 'Bush 2', tint: 0x8fbf5c, h: [2, 3.5] },
];

// Danau Serene: hutan konifer pegunungan (pinus EZ-Tree) + ek di tepi danau
if (LOC === 'serene') PRESETS.splice(0, PRESETS.length,
  { name: 'Pine Medium', h: [13, 20] }, { name: 'Pine Large', h: [17, 26] }, { name: 'Pine Small', h: [8, 13] },
  { name: 'Oak Medium', tint: 0x9fcf6a, h: [9, 13] }, { name: 'Oak Large', tint: 0x8fc460, h: [11, 16] }, { name: 'Bush 1', tint: 0x9acb66, h: [2, 3.5] });
function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

function makeImpostor(renderer: THREE.WebGLRenderer, obj: THREE.Object3D, box: THREE.Box3) {
  const size = box.getSize(new THREE.Vector3());
  const w = Math.max(size.x, size.z), h = size.y;
  const res = LOC === 'serene' && Q.trees >= 0.6 ? 512 : 256, rt = new THREE.WebGLRenderTarget(res, Math.round(res * Math.min(2, h / w)), { samples: 0 });
  const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, 0.1, 400);
  const c = box.getCenter(new THREE.Vector3());
  cam.position.set(c.x, box.min.y, c.z + 150); cam.lookAt(c.x, box.min.y, c.z);
  cam.position.y = box.min.y; cam.updateMatrixWorld();
  const sc = new THREE.Scene();
  sc.add(new THREE.HemisphereLight(0xdfefff, 0x4a5a30, 1.6));
  const d = new THREE.DirectionalLight(0xfff2dd, 2.4); d.position.set(0.5, 1, 1); sc.add(d);
  const clone = obj.clone(); sc.add(clone);
  const old = renderer.getRenderTarget(), oc = renderer.getClearColor(new THREE.Color()), oa = renderer.getClearAlpha();
  renderer.setRenderTarget(rt); renderer.setClearColor(0x4a6a30, 0); renderer.clear(); renderer.render(sc, cam);
  renderer.setRenderTarget(old); renderer.setClearColor(oc, oa);
  rt.texture.colorSpace = THREE.SRGBColorSpace;
  return { tex: rt.texture, aspect: h / w, baseW: w };
}

export class Vegetation {
  group = new THREE.Group();
  private variants: Variant[] = [];
  private leafMats: THREE.Material[] = [];
  private grassMat: THREE.MeshLambertMaterial | null = null;
  private grassU = { time: { value: 0 }, wind: { value: 1 } };
  private placements: { x: number; z: number; y: number; s: number; r: number; v: number }[] = [];
  private full: THREE.InstancedMesh[] = [];
  private imp: THREE.InstancedMesh[] = [];

  constructor(private renderer: THREE.WebGLRenderer, private tex: { blade: THREE.Texture; grass: THREE.Texture }) {
    this.group.name = 'vegetation';
  }

  build(spotId: string) {
    this.makeVariants();
    this.placeTrees();
    this.buildGrass();
    this.buildShorePlants();
    this.setFocus(spotId);
  }

  private makeVariants() {
    PRESETS.forEach((p, i) => {
      const t = new Tree();
      t.loadPreset(p.name);
      t.options.seed = 1000 + i * 77;
      if (p.tint) t.options.leaves.tint = p.tint;
      if (Q.trees < 1) t.options.leaves.count = Math.max(6, Math.round(t.options.leaves.count * (Q.trees < 0.6 ? 0.5 : 0.75)));
      // hemat segitiga: sisi lingkar cabang dikurangi (tidak terlihat bedanya dari jauh)
      const br = t.options.branch as unknown as { sections: Record<string, number>; segments: Record<string, number> };
      for (const k in br.segments) br.segments[k] = Math.max(3, Math.round(br.segments[k] * (Q.trees < 0.6 ? 0.45 : 0.6)));
      for (const k in br.sections) br.sections[k] = Math.max(1, Math.round(br.sections[k] * 0.75));
      t.generate();
      t.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(t);
      const bMat = t.branchesMesh.material as THREE.MeshPhongMaterial;
      const lMat = t.leavesMesh.material as THREE.MeshPhongMaterial;
      bMat.shininess = 2; lMat.shininess = 4;
      lMat.alphaToCoverage = false;
      this.leafMats.push(lMat);
      const im = makeImpostor(this.renderer, t, box);
      this.variants.push({ branches: t.branchesMesh.geometry, leaves: t.leavesMesh.geometry, bMat, lMat, height: box.max.y, impostor: im.tex, aspect: im.aspect, baseW: im.baseW });
    });
  }

  private placeTrees() {
    const r = rng(4242), out = this.placements;
    if (LOC === 'serene') {
      // hutan rapat mengelilingi danau sampai lereng; dekat dermaga & pondok campur ek, sisanya pinus
      const n = Math.round(3000 * Q.trees); let tries = 0;
      while (out.length < n && tries++ < n * 14) {
        const x = -330 + r() * 680, z = -480 + r() * 720;
        const e = lakeE(x, z); if (e < 1.012) continue;
        const h = groundH(x, z); if (h < 0.3) continue;
        if (fbm(x * 0.03, z * 0.03, 2) + Math.min(0.5, (e - 1) * 4) * 0.6 < 0.46) continue;
        if (Math.hypot(x, z - 12) < 12 || (Math.abs(x) < 6 && z > -14 && z < 70)) continue;   // pelataran & jalan dermaga
        if (SPOT_PLACES.some(s => Math.hypot(s.pos.x - x, s.pos.z - z) < 8) || reserved(x, z, 2)) continue;
        const near = Math.hypot(x, z + 5), u = r();
        let v = near < 140 && e < 1.2 && u < 0.14 ? 5 : near < 150 && u < 0.4 ? 3 + Math.floor(r() * 2) : u < 0.62 ? 0 : u < 0.86 ? 1 : 2;
        if (v < 2 && near < 55) v = 2;   // dekat pemain: pinus kecil (tajuk tidak menutupi langit)
        // pinus bertajuk lebar di pangkal: jauhkan dari dermaga & spot supaya dahan tidak menutupi pandangan
        if (Math.abs(x) < 15 && z > -16 && z < 40) continue;
        if (v < 3 && SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 13)) continue;
        const P = PRESETS[v], hgt = (P.h[0] + r() * (P.h[1] - P.h[0])) * (v < 3 ? 1 + Math.min(0.35, (e - 1) * 0.6) : 1);
        out.push({ x, z, y: h - 0.3, s: hgt / this.variants[v].height, r: r() * Math.PI * 2, v });
        if (e < 1.32) addObstacle(x, z, v === 5 ? 0.55 : 0.3 + hgt * 0.012);
      }
      return;
    }
    const n = Math.round(420 * Q.trees * (MAPSTYLE ? MAPSTYLE.trees : LOC === 'laut' ? 0.35 : LOC === 'pantai' ? 0.6 : LOC === 'sungai' ? 1.25 : 1));
    let tries = 0;
    while (out.length < n && tries++ < n * 30) {
      const a = r() * Math.PI * 2, e = 1.04 + Math.pow(r(), 1.6) * 1.35;
      const { x, z } = shoreXZ(a, e * 1.02);
      const le = lakeE(x, z);
      if (le < (MAPSTYLE ? MAPSTYLE.shoreTreeE : LOC === 'pantai' ? 1.9 : LOC === 'laut' ? 1.25 : 1.05)) continue; // pantai: pohon di balik bukit pasir
      if (groundH(x, z) < 0.3) continue;
      if (fbm(x * 0.02, z * 0.02, 2) < 0.38 && le < 1.6) continue; // celah hutan
      // biarkan pandangan pemain terbuka: jangan menanam di depan/dekat spot
      if (SPOT_PLACES.some(s => Math.hypot(s.pos.x - x, s.pos.z - z) < 7)) continue;
      if (Math.abs(x) < 7 && z > -2 && z < 30) continue; // jalan dermaga
      if (inKeramba(x, z) || reserved(x, z, 3)) continue;
      const bush = r() < 0.28 && le < 1.25;
      const v = bush ? 4 + Math.floor(r() * 2) : Math.floor(r() * 4);
      const P = PRESETS[v];
      const hgt = P.h[0] + r() * (P.h[1] - P.h[0]);
      out.push({ x, z, y: groundH(x, z) - 0.2, s: hgt / this.variants[v].height, r: r() * Math.PI * 2, v });
      addObstacle(x, z, bush ? 0.55 : 0.28 + hgt * 0.012); // batang / semak tidak bisa ditembus
    }
  }

  /** Pohon dekat spot pemain memakai model penuh, sisanya impostor. */
  /** Pohon dekat pemain memakai model penuh. Terima id spot atau posisi (saat berjalan). */
  focusAt = { x: 0, z: 0 };
  /** pohon yang disembunyikan (mis. di ujung danau agar latar foto terlihat); null = tampil semua */
  farCut: ((x: number, z: number) => boolean) | null = null;
  setFocus(spotId: string | { x: number; z: number }) {
    const sp = typeof spotId === 'string' ? (SPOT_PLACES.find(s => s.id === spotId) ?? SPOT_PLACES[0]) : { pos: spotId };
    this.focusAt = { x: sp.pos.x, z: sp.pos.z };
    for (const m of [...this.full, ...this.imp]) { this.group.remove(m); m.dispose(); }
    this.full = []; this.imp = [];
    const byDist = this.placements.map((p, i) => ({ i, d: Math.hypot(p.x - sp.pos.x, p.z - sp.pos.z) })).sort((a, b) => a.d - b.d);
    const near = new Set(byDist.filter(o => o.d < (LOC === 'serene' ? 60 : 45)).slice(0, Q.nearTrees * (LOC === 'serene' ? 2 : 1)).map(o => o.i));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.variants.forEach((V, vi) => {
      const cut = this.farCut;
      const fullList = this.placements.filter((pl, i) => pl.v === vi && near.has(i) && !(cut && cut(pl.x, pl.z)));
      const impList = this.placements.filter((pl, i) => pl.v === vi && !near.has(i) && !(cut && cut(pl.x, pl.z)));
      if (fullList.length) {
        const b = new THREE.InstancedMesh(V.branches, V.bMat, fullList.length);
        const l = new THREE.InstancedMesh(V.leaves, V.lMat, fullList.length);
        fullList.forEach((pl, k) => {
          m4.compose(p.set(pl.x, pl.y, pl.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.r), s.setScalar(pl.s));
          b.setMatrixAt(k, m4); l.setMatrixAt(k, m4);
        });
        b.castShadow = l.castShadow = Q.shadows; b.receiveShadow = true;
        b.computeBoundingSphere(); l.computeBoundingSphere();
        this.group.add(b, l); this.full.push(b, l);
      }
      if (impList.length) {
        // dua bidang bersilang
        const g1 = new THREE.PlaneGeometry(1, V.aspect).translate(0, V.aspect / 2, 0);
        const g2 = g1.clone().rotateY(Math.PI / 2);
        const geo = mergeTwo(g1, g2);
        const mat = new THREE.MeshLambertMaterial({ map: V.impostor, alphaTest: 0.45, side: THREE.DoubleSide });
        if (LOC === 'serene') mat.color.setRGB(1.35, 1.4, 1.3);   // gambar pohon sudah berbayang → cerahkan supaya hutan tidak kehitaman
        mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_begin>', '#include <lights_fragment_begin>\n'); };
        const im = new THREE.InstancedMesh(geo, mat, impList.length);
        impList.forEach((pl, k) => {
          const w = V.baseW * pl.s;
          m4.compose(p.set(pl.x, pl.y, pl.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), pl.r), s.set(w, w, w));
          im.setMatrixAt(k, m4);
        });
        im.computeBoundingSphere();
        this.group.add(im); this.imp.push(im);
      }
    });
  }

  private buildGrass() {
    // rumput tinggi di tepian sekitar tiap spot (bidang silang ber-alfa, bergoyang di shader)
    const n = Q.grass, r = rng(99);
    const g1 = new THREE.PlaneGeometry(0.9, 0.9).translate(0, 0.45, 0);
    const geo = mergeTwo(g1, g1.clone().rotateY(Math.PI / 2));
    const mat = new THREE.MeshLambertMaterial({ map: this.tex.blade, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xa3bd7a });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.grassU.time; sh.uniforms.wind = this.grassU.wind;
      sh.vertexShader = 'uniform float time; uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float sway = sin(time * 1.7 + ip.x * 0.35 + ip.z * 0.27) * 0.5 + sin(time * 3.1 + ip.x * 0.9) * 0.2;
        transformed.x += sway * position.y * position.y * 0.35 * wind;
        transformed.z += sway * position.y * position.y * 0.15 * wind;`);
      // pangkal lebih gelap
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', '#include <color_vertex>');
    };
    this.grassMat = mat;
    const im = new THREE.InstancedMesh(geo, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0, tries = 0;
    const col = new THREE.Color();
    while (k < n && tries++ < n * 20) {
      const sp = SPOT_PLACES[Math.floor(r() * SPOT_PLACES.length)];
      const a = r() * Math.PI * 2, d = 1.5 + Math.pow(r(), 0.7) * 38;
      const x = sp.pos.x + Math.cos(a) * d, z = sp.pos.z + Math.sin(a) * d;
      const e = lakeE(x, z);
      if (e < 1.005 || e > 1.35) continue;
      if (Math.abs(x) < 1.6 && z > -3 && z < 14) continue; // dermaga
      if (reserved(x, z, 0.6)) continue;
      const h = groundH(x, z);
      const sc = 0.6 + r() * 0.9 + (e < 1.04 ? 0.5 : 0);
      m4.compose(p.set(x, h - 0.05, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.3), s.set(sc, sc * (0.8 + r() * 0.6), sc));
      im.setMatrixAt(k, m4);
      im.setColorAt(k, col.setHSL(0.22 + r() * 0.06, 0.45, 0.45 + r() * 0.25));
      k++;
    }
    im.count = k;
    im.layers.set(1); // tidak ikut dipantulkan air (hemat)
    im.computeBoundingSphere();
    this.group.add(im);
  }

  private buildShorePlants() {
    const r = rng(7);
    // alang-alang / ekor kucing di air dangkal tepi danau
    const reedGeo = new THREE.CylinderGeometry(0.012, 0.02, 1.6, 3, 1, true).translate(0, 0.8, 0);
    const reedMat = new THREE.MeshLambertMaterial({ color: 0x6f8a45 });
    const headGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.22, 5).translate(0, 1.45, 0);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x5a3a20 });
    const N = MAPSTYLE ? (MAPSTYLE.reeds ? Math.round(700 * Q.trees) : 0) : LOC === 'laut' || LOC === 'pantai' ? 0 : Math.round(900 * Q.trees * (LOC === 'serene' ? 0.3 : 1)); // alang-alang: danau & sungai saja
    const reeds = new THREE.InstancedMesh(reedGeo, reedMat, N), heads = new THREE.InstancedMesh(headGeo, headMat, Math.ceil(N / 3));
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), eu = new THREE.Euler();
    let k = 0, kh = 0, tries = 0;
    while (k < N && tries++ < N * 40) {
      const a = r() * Math.PI * 2, e = 0.95 + r() * 0.08;
      const { x, z } = shoreXZ(a, e);
      const le = lakeE(x, z); if (le < 0.96 || le > 1.03) continue;
      if (fbm(x * 0.05, z * 0.05, 2) < 0.45) continue;
      if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 5)) continue;
      if (Math.abs(x) < 3 && z > -4) continue;
      if (reserved(x, z, 0.8)) continue;
      for (let c = 0; c < 6 && k < N; c++) {
        const xx = x + (r() - 0.5) * 2.4, zz = z + (r() - 0.5) * 2.4;
        const h = Math.max(groundH(xx, zz), -0.8), sc = 0.7 + r() * 0.8;
        m4.compose(p.set(xx, h, zz), q.setFromEuler(eu.set((r() - 0.5) * 0.25, r() * 6, (r() - 0.5) * 0.25)), s.set(1, sc, 1));
        reeds.setMatrixAt(k++, m4);
        if (r() < 0.33 && kh < heads.count) heads.setMatrixAt(kh++, m4);
      }
    }
    reeds.count = k; heads.count = kh;
    reeds.computeBoundingSphere(); heads.computeBoundingSphere();
    this.group.add(reeds, heads);

    // teratai: daun bulat bertakik mengapung di air tenang, kadang dengan bunga merah muda
    const padGeo = new THREE.CircleGeometry(0.42, 14, 0.35, Math.PI * 2 - 0.35).rotateX(-Math.PI / 2);
    const padMat = new THREE.MeshStandardMaterial({ color: 0x3f6a2a, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.25 });
    const NP = Math.round(260 * Q.trees);
    const pads = new THREE.InstancedMesh(padGeo, padMat, NP);
    const flowerGeo = new THREE.ConeGeometry(0.1, 0.14, 7, 1, true).rotateX(Math.PI).translate(0, 0.08, 0);
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xf2a0c0, roughness: 0.6, side: THREE.DoubleSide, emissive: 0x401020 });
    const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, 40);
    k = 0; kh = 0; tries = 0;
    const colonies = LOC === 'danau' ? [[-12, -3], [-22, -8], [14, -4], [-60, -30], [-66, -52], [20, -8]] : []; // teratai hanya di danau
    while (colonies.length && k < NP && tries++ < NP * 10) {
      const [cx, cz] = colonies[Math.floor(r() * colonies.length)];
      const x = cx + (r() - 0.5) * 12, z = cz + (r() - 0.5) * 7;
      const le = lakeE(x, z); if (le > 0.99 || reserved(x, z, 0.5) || inKeramba(x, z)) continue;
      const sc = 0.6 + r() * 0.9;
      m4.compose(p.set(x, 0.015, z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 6.3), s.setScalar(sc));
      pads.setMatrixAt(k++, m4);
      if (r() < 0.12 && kh < 40) { m4.compose(p.set(x + 0.1, 0.02, z), q, s.setScalar(0.9 + r() * 0.4)); flowers.setMatrixAt(kh++, m4); }
    }
    pads.count = k; flowers.count = kh;
    pads.computeBoundingSphere(); flowers.computeBoundingSphere();
    pads.receiveShadow = true;
    this.group.add(pads, flowers);
  }

  update(time: number, wind: number) {
    this.grassU.time.value = time; this.grassU.wind.value = wind;
    for (const m of this.leafMats) { const sh = (m as THREE.Material & { userData: { shader?: { uniforms: { uTime: { value: number } } } } }).userData.shader; if (sh) sh.uniforms.uTime.value = time; }
  }
}

function mergeTwo(a: THREE.BufferGeometry, b: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.attributes[name] as THREE.BufferAttribute, B = b.attributes[name] as THREE.BufferAttribute;
    const arr = new Float32Array(A.array.length + B.array.length); arr.set(A.array as Float32Array); arr.set(B.array as Float32Array, A.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const ia = a.index!.array, ib = b.index!.array, off = a.attributes.position.count;
  const idx = new Uint16Array(ia.length + ib.length); idx.set(ia); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + off;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// Danau yang hidup: bangau terbang berputar, burung beo lewat, ikan liar melompat, capung,
// kabut pagi tipis, dan hujan.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { LAKE } from './layout';
import { Q } from '../core/quality';

interface Bird { obj: THREE.Object3D; mixer: THREE.AnimationMixer; r: number; h: number; sp: number; ph: number; cx: number; cz: number }

export class LakeLife {
  group = new THREE.Group();
  birds: Bird[] = [];
  private rain: THREE.LineSegments | null = null;
  private rainPos: Float32Array | null = null;
  private jumpT = 4;
  jumpFish: ((x: number, z: number) => void) | null = null;
  dragonflies: THREE.InstancedMesh;
  private dfState: { x: number; y: number; z: number; tx: number; ty: number; tz: number; t: number }[] = [];

  constructor(stork: GLTF, parrot: GLTF) {
    if (Q.birds) {
      const make = (g: GLTF, n: number, scale: number, h: [number, number], sp: number) => {
        for (let i = 0; i < n; i++) {
          const o = g.scene.clone(); const sz = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3()); o.scale.setScalar(scale / Math.max(sz.x, sz.z));
          o.traverse(m => { const mm = m as THREE.Mesh; if (mm.isMesh) { (mm.material as THREE.MeshStandardMaterial).envMapIntensity = 0.6; mm.castShadow = false; } });
          const mixer = new THREE.AnimationMixer(o);
          const a = mixer.clipAction(g.animations[0]); a.play(); a.time = Math.random() * 2; a.timeScale = 0.8 + Math.random() * 0.3;
          this.group.add(o);
          this.birds.push({ obj: o, mixer, r: 30 + Math.random() * 45, h: h[0] + Math.random() * (h[1] - h[0]), sp: sp * (0.8 + Math.random() * 0.4) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6.3, cx: LAKE.cx + (Math.random() - 0.5) * 50, cz: LAKE.cz + (Math.random() - 0.5) * 30 });
        }
      };
      make(stork, 3, 1.9, [14, 26], 0.09);
      make(parrot, 2, 0.6, [6, 12], 0.16);
    }
    // capung kecil di dekat tepi
    const dfGeo = new THREE.BoxGeometry(0.05, 0.008, 0.008);
    const wing = new THREE.PlaneGeometry(0.035, 0.012).rotateX(-Math.PI / 2).translate(0, 0.004, 0);
    const merged = new THREE.BufferGeometry();
    merged.copy(dfGeo); void wing;
    this.dragonflies = new THREE.InstancedMesh(merged, new THREE.MeshStandardMaterial({ color: 0x2a6fb0, metalness: 0.5, roughness: 0.3 }), Q.birds ? 6 : 0);
    for (let i = 0; i < this.dragonflies.count; i++) this.dfState.push({ x: (Math.random() - 0.5) * 8, y: 0.6, z: -3 - Math.random() * 5, tx: 0, ty: 0.6, tz: -4, t: 0 });
    this.dragonflies.frustumCulled = false;
    this.group.add(this.dragonflies);
  }

  setRain(on: boolean, focus: THREE.Vector3) {
    if (on && !this.rain) {
      const n = Math.round(1800 * (Q.grass / 3000));
      this.rainPos = new Float32Array(n * 6);
      for (let i = 0; i < n; i++) this.respawnDrop(i, focus, true);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3));
      this.rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xcfd8e0, transparent: true, opacity: 0.45 }));
      this.rain.frustumCulled = false;
      this.group.add(this.rain);
    } else if (!on && this.rain) { this.group.remove(this.rain); this.rain.geometry.dispose(); this.rain = null; }
  }
  private respawnDrop(i: number, f: THREE.Vector3, anyY = false) {
    const p = this.rainPos!, x = f.x + (Math.random() - 0.5) * 40, z = f.z - 5 + (Math.random() - 0.5) * 40, y = anyY ? Math.random() * 18 : 16 + Math.random() * 4;
    p[i * 6] = x; p[i * 6 + 1] = y; p[i * 6 + 2] = z; p[i * 6 + 3] = x + 0.03; p[i * 6 + 4] = y - 0.45; p[i * 6 + 5] = z;
  }

  update(dt: number, time: number, focus: THREE.Vector3, addRipple: (x: number, z: number, s: number) => void) {
    for (const b of this.birds) {
      b.mixer.update(dt);
      const a = b.ph + time * b.sp;
      const x = b.cx + Math.cos(a) * b.r, z = b.cz + Math.sin(a) * b.r * 0.7, y = b.h + Math.sin(time * 0.3 + b.ph) * 2;
      const nx = b.cx + Math.cos(a + 0.05 * Math.sign(b.sp)) * b.r, nz = b.cz + Math.sin(a + 0.05 * Math.sign(b.sp)) * b.r * 0.7;
      b.obj.position.set(x, y, z);
      b.obj.lookAt(nx, y, nz);
    }
    // capung melesat berhenti-melesat
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    this.dfState.forEach((d, i) => {
      d.t -= dt;
      if (d.t <= 0) { d.tx = focus.x + (Math.random() - 0.5) * 10; d.tz = focus.z - 2 - Math.random() * 7; d.ty = 0.3 + Math.random() * 1.2; d.t = 0.6 + Math.random() * 2; }
      const k = 1 - Math.exp(-dt * 5);
      d.x += (d.tx - d.x) * k; d.y += (d.ty - d.y) * k; d.z += (d.tz - d.z) * k;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(d.tx - d.x, d.tz - d.z) + Math.PI / 2);
      m.compose(p.set(d.x, d.y + Math.sin(time * 30 + i) * 0.01, d.z), q, s);
      this.dragonflies.setMatrixAt(i, m);
    });
    this.dragonflies.instanceMatrix.needsUpdate = true;
    // hujan
    if (this.rain && this.rainPos) {
      const P = this.rainPos, n = P.length / 6;
      for (let i = 0; i < n; i++) {
        P[i * 6 + 1] -= dt * 16; P[i * 6 + 4] -= dt * 16;
        if (P[i * 6 + 4] < 0) { if (Math.random() < 0.08) addRipple(P[i * 6], P[i * 6 + 2], 0.35); this.respawnDrop(i, focus); }
      }
      (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }
    // ikan liar melompat di kejauhan
    this.jumpT -= dt;
    if (this.jumpT < 0) {
      this.jumpT = 6 + Math.random() * 12;
      const a = Math.random() * Math.PI * 2, r = 0.2 + Math.random() * 0.6;
      const jx = LAKE.cx + Math.cos(a) * LAKE.rx * r * (IS_DANAU ? 1 : 0.35), jz = LAKE.cz + Math.sin(a) * LAKE.rz * r * (IS_DANAU ? 1 : 0.35);
      if (isWater(jx, jz)) this.jumpFish?.(jx, jz);
    }
  }
}

// ===================== Kehidupan tambahan (v0.4) =====================
import { KERAMBA, lakeE, RAFT, IS_DANAU, LOC, isWater, PADS, PIER, BOAT } from './layout';

export function jukung() {
  // lambung perahu: bentuk kano dari lathe yang dipipihkan, dicat kayu tua dengan list warna
  const g = new THREE.Group();
  const pts: THREE.Vector2[] = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(0.001 + Math.sin(t * Math.PI) * 0.42, (t - 0.5) * 5.2)); }
  const hullGeo = new THREE.LatheGeometry(pts, 14, Math.PI, Math.PI); hullGeo.rotateX(Math.PI / 2); hullGeo.scale(1, 0.55, 1);
  const hull = new THREE.Mesh(hullGeo, new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.85, side: THREE.DoubleSide }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1, 0.03, 4, 32), new THREE.MeshStandardMaterial({ color: 0x1f6a8a, roughness: 0.6 }));
  rim.rotation.x = Math.PI / 2; rim.scale.set(0.42, 2.6, 1); rim.position.y = 0.01;
  // pendayung: badan, kepala bercaping, dayung
  const skin = new THREE.MeshStandardMaterial({ color: 0x8a5a3c, roughness: 0.7 }), shirt = new THREE.MeshStandardMaterial({ color: 0xd8c9a3, roughness: 0.9 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.55, 8), shirt); body.position.set(0, 0.3, 0.9);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin); head.position.set(0, 0.68, 0.9);
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0xd8c38a, roughness: 0.95 })); hat.position.set(0, 0.8, 0.9);
  const paddle = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5, 5), new THREE.MeshStandardMaterial({ color: 0x5a3a22 })); shaft.position.y = -0.4;
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.02), shaft.material); blade.position.y = -1.1;
  paddle.add(shaft, blade); paddle.position.set(0.25, 0.55, 0.9);
  // muatan: keranjang & jala
  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xa8864e, roughness: 1 })); basket.position.set(0, 0.1, -1.1);
  g.add(hull, rim, body, head, hat, paddle, basket);
  g.traverse(o => { o.castShadow = true; });
  g.userData.paddle = paddle;
  return g;
}
function duck() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8 }), orange = new THREE.MeshStandardMaterial({ color: 0xe8862a, roughness: 0.6 });
  const b = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), white); b.scale.set(1, 0.7, 1.45); b.position.y = 0.05;
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 6), white); tail.rotation.x = -2.2; tail.position.set(0, 0.1, -0.2);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), white); h.position.set(0, 0.2, 0.15);
  const bk = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.08), orange); bk.position.set(0, 0.19, 0.25);
  const eye = new THREE.MeshBasicMaterial({ color: 0x111111 });
  for (const x of [-0.045, 0.045]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.012, 5, 4), eye); e.position.set(x, 0.22, 0.2); g.add(e); }
  g.add(b, tail, h, bk); g.userData.head = h;
  return g;
}

export class MoreLife {
  group = new THREE.Group();
  private boat: THREE.Group; private boatA = 0.6;
  private ducks: { o: THREE.Group; ox: number; oz: number; ph: number }[] = [];
  private duckC = { x: RAFT.x - 6, z: RAFT.z + 4, a: 0 };
  private swallows: THREE.InstancedMesh; private sw: { a: number; r: number; h: number; sp: number; ph: number }[] = [];
  private stork: { obj: THREE.Object3D; mixer: THREE.AnimationMixer; act: THREE.AnimationAction; state: 'terbang' | 'turun' | 'berdiri' | 'naik'; t: number; from: THREE.Vector3; to: THREE.Vector3 } | null = null;
  private perches: THREE.Vector3[];

  constructor(stork: GLTF | null) {
    this.boat = jukung(); this.group.add(this.boat); this.boat.visible = IS_DANAU;
    for (let i = 0; i < (IS_DANAU ? (Q.birds ? 6 : 3) : 0); i++) {
      const d = duck(); d.scale.setScalar(i === 0 ? 1.15 : 0.8 + Math.random() * 0.25);
      this.ducks.push({ o: d, ox: (i % 3) * 0.7 - 0.7 + Math.random() * 0.3, oz: -Math.floor(i / 3) * 0.8 - i * 0.2, ph: Math.random() * 6 });
      this.group.add(d);
    }
    // burung layang-layang: badan ramping, sayap sabit, ekor bercabang. Kepakan = skala Y pada ujung sayap.
    const P: number[] = [
      // badan (dua segitiga atas & bawah punggung)
      0, 0.012, 0.13, -0.025, 0, 0, 0.025, 0, 0,   0, 0.012, 0.13, 0.025, 0, 0, -0.025, 0, 0,
      -0.025, 0, 0, 0, 0.01, -0.09, 0.025, 0, 0,
      // ekor bercabang
      -0.012, 0, -0.08, -0.06, 0, -0.19, 0, 0.005, -0.1,   0.012, 0, -0.08, 0, 0.005, -0.1, 0.06, 0, -0.19,
      // sayap kiri (sabit, ujung terangkat oleh skala Y)
      -0.02, 0, 0.05, -0.2, 0.1, -0.02, -0.02, 0, -0.03,   -0.2, 0.1, -0.02, -0.34, 0.16, -0.1, -0.12, 0.05, -0.05,
      // sayap kanan
      0.02, 0, 0.05, 0.02, 0, -0.03, 0.2, 0.1, -0.02,   0.2, 0.1, -0.02, 0.12, 0.05, -0.05, 0.34, 0.16, -0.1,
    ];
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); wg.computeVertexNormals();
    const n = Q.birds ? 5 : 3;
    this.swallows = new THREE.InstancedMesh(wg, new THREE.MeshLambertMaterial({ color: 0x2b3446, side: THREE.DoubleSide }), n);
    for (let i = 0; i < n; i++) this.sw.push({ a: Math.random() * 6.3, r: 10 + Math.random() * 14, h: 2.2 + Math.random() * 3.5, sp: (0.7 + Math.random() * 0.6) * (Math.random() < 0.5 ? 1 : -1), ph: Math.random() * 6 });
    this.swallows.frustumCulled = false; this.group.add(this.swallows);
    // tempat bangau mendarat: tiang bambu keramba & tepi rakit
    this.perches = IS_DANAU ? [new THREE.Vector3(KERAMBA.x0 + (KERAMBA.x1 - KERAMBA.x0) * 2 / 7, 2.6, KERAMBA.z1 + 0.2), new THREE.Vector3(KERAMBA.x0 + (KERAMBA.x1 - KERAMBA.x0) * 5 / 7, 2.6, KERAMBA.z1 + 0.2), new THREE.Vector3(RAFT.x, 0.2, RAFT.z)]
      : LOC === 'sungai' ? [new THREE.Vector3(PADS[0].x + 0.8, PADS[0].y + 0.05, PADS[0].z - 0.6)]
      : LOC === 'pantai' ? [new THREE.Vector3(PIER.x + PIER.w / 2 - 0.1, PIER.y + 0.9, PIER.z1 + 6.3)]
      : [new THREE.Vector3(BOAT.x, BOAT.y + 2.25, BOAT.z + 3.8)]; // atap kabin kapal
    if (stork && Q.birds) {
      const o = stork.scene.clone(); const sz = new THREE.Box3().setFromObject(stork.scene).getSize(new THREE.Vector3()); o.scale.setScalar(1.7 / Math.max(sz.x, sz.z));
      const mixer = new THREE.AnimationMixer(o), act = mixer.clipAction(stork.animations[0]); act.play();
      this.group.add(o);
      this.stork = { obj: o, mixer, act, state: 'terbang', t: 10 + Math.random() * 10, from: new THREE.Vector3(), to: new THREE.Vector3() };
    }
  }

  update(dt: number, time: number, focus: THREE.Vector3, addRipple: (x: number, z: number, s: number) => void) {
    // jukung: berkeliling tengah danau, dayung mengayuh bergantian sisi
    if (!IS_DANAU) { this.updateBirds(dt, time, focus, addRipple); return; }
    this.boatA += dt * 0.012;
    const bx = LAKE.cx + Math.cos(this.boatA) * LAKE.rx * 0.45, bz = LAKE.cz + Math.sin(this.boatA) * LAKE.rz * 0.4 - 8;
    const nx = LAKE.cx + Math.cos(this.boatA + 0.01) * LAKE.rx * 0.45, nz = LAKE.cz + Math.sin(this.boatA + 0.01) * LAKE.rz * 0.4 - 8;
    this.boat.position.set(bx, Math.sin(time * 1.3) * 0.02, bz); this.boat.lookAt(nx, this.boat.position.y, nz);
    this.boat.rotation.z = Math.sin(time * 1.1) * 0.03;
    const pd = this.boat.userData.paddle as THREE.Object3D, stroke = time * 1.6;
    pd.position.x = Math.sin(stroke * 0.5) > 0 ? 0.25 : -0.25; pd.rotation.x = Math.sin(stroke * Math.PI) * 0.6; pd.rotation.z = pd.position.x > 0 ? -0.3 : 0.3;
    if (Math.random() < dt * 2) addRipple(bx, bz, 0.6);
    // bebek: kawanan mengikuti induk, berenang pelan & menunduk sesekali
    const C = this.duckC; C.a += dt * 0.05;
    const cx = RAFT.x - 8 + Math.cos(C.a) * 7, cz = RAFT.z + 3 + Math.sin(C.a * 1.3) * 5;
    const hx = RAFT.x - 8 + Math.cos(C.a + 0.02) * 7, hz = RAFT.z + 3 + Math.sin((C.a + 0.02) * 1.3) * 5;
    const yaw = Math.atan2(hx - cx, hz - cz);
    this.ducks.forEach((d, i) => {
      const ox = d.ox * Math.cos(yaw) + d.oz * Math.sin(yaw), oz = -d.ox * Math.sin(yaw) + d.oz * Math.cos(yaw);
      const x = cx + ox + Math.sin(time * 0.7 + d.ph) * 0.15, z = cz + oz;
      if (lakeE(x, z) > 0.97) return;
      d.o.position.set(x, Math.sin(time * 2 + d.ph) * 0.012, z); d.o.rotation.y = yaw + Math.sin(time * 0.5 + d.ph) * 0.2;
      const hd = d.o.userData.head as THREE.Object3D, dip = Math.max(0, Math.sin(time * 0.4 + d.ph * 3) - 0.92) * 12;
      hd.position.y = 0.2 - dip * 0.12; hd.position.z = 0.15 + dip * 0.05;
      if (dip > 0.3 && Math.random() < dt * 4) addRipple(x, z + 0.2, 0.3);
      if (i === 0 && Math.random() < dt * 0.8) addRipple(x, z, 0.25);
    });
    this.updateBirds(dt, time, focus, addRipple);
  }

  /** Burung layang-layang & bangau (semua lokasi). */
  private updateBirds(dt: number, time: number, focus: THREE.Vector3, addRipple: (x: number, z: number, s: number) => void) {
    // layang-layang: menyambar rendah di atas air dekat pemain
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    this.sw.forEach((b, i) => {
      const a = b.ph + time * b.sp * 0.6, r = b.r * (1 + 0.3 * Math.sin(time * 0.5 + b.ph));
      const x = focus.x + Math.cos(a) * r, z = focus.z - 16 + Math.sin(a) * r * 0.8;
      const swoop = Math.max(0, Math.sin(time * 0.35 + b.ph * 2) - 0.85) * 12;  // sesekali menyambar turun ke air
      const y = b.h + Math.sin(time * 1.3 + b.ph) * 0.6 - swoop * (b.h - 0.4) / 1.8;
      if (y < 0.7 && Math.random() < dt * 3) addRipple(x, z, 0.25);
      // arah terbang = garis singgung lingkaran; miring saat berbelok
      const tx = -Math.sin(a) * b.sp, tz = Math.cos(a) * 0.8 * b.sp;
      q.setFromEuler(new THREE.Euler(0, Math.atan2(tx, tz), -Math.sign(b.sp) * 0.45, 'YXZ'));
      // kepak cepat lalu melayang (khas layang-layang)
      const glide = Math.sin(time * 0.9 + b.ph) > 0.2 ? 0.25 : 1;
      const flap = Math.sin(time * 16 + i * 1.7) * 1.25 * glide + (1 - glide) * 0.3;
      this.swallows.setMatrixAt(i, m.compose(p.set(x, Math.max(0.45, y), z), q, s.set(1.2, flap, 1.2)));
    });
    this.swallows.instanceMatrix.needsUpdate = true;
    // bangau: terbang → turun ke tiang keramba/rakit → berdiri (sayap diam) → terbang lagi
    const S = this.stork;
    if (S) {
      S.t -= dt;
      const o = S.obj;
      if (S.state === 'terbang') {
        S.mixer.update(dt); S.act.timeScale = 1;
        const a = time * 0.08; o.position.set(LAKE.cx + Math.cos(a) * 55, 18, LAKE.cz + Math.sin(a) * 38); o.lookAt(LAKE.cx + Math.cos(a + 0.05) * 55, 18, LAKE.cz + Math.sin(a + 0.05) * 38);
        if (S.t < 0) { S.state = 'turun'; S.t = 6; S.from.copy(o.position); S.to.copy(this.perches[Math.floor(Math.random() * this.perches.length)]); }
      } else if (S.state === 'turun' || S.state === 'naik') {
        S.mixer.update(dt * (S.state === 'turun' ? 0.7 : 1.3));
        const u = 1 - S.t / 6, e = u * u * (3 - 2 * u);
        const pos = new THREE.Vector3().lerpVectors(S.from, S.to, e); pos.y += Math.sin(Math.PI * e) * 4;
        o.lookAt(pos.x + (S.to.x - S.from.x), pos.y, pos.z + (S.to.z - S.from.z)); o.position.copy(pos);
        if (S.t <= 0) {
          if (S.state === 'turun') { S.state = 'berdiri'; S.t = 25 + Math.random() * 30; if (S.to.y < 0.5) addRipple(S.to.x, S.to.z, 0.8); }
          else { S.state = 'terbang'; S.t = 20 + Math.random() * 25; }
        }
      } else { // berdiri: animasi dibekukan pada pose sayap terlipat, sesekali menoleh
        S.act.timeScale = 0; S.act.time = 0; S.mixer.update(0);
        o.rotation.y += Math.sin(time * 0.6) * dt * 0.3;
        if (S.t < 0) { S.state = 'naik'; S.t = 6; S.from.copy(o.position); const a = Math.random() * 6.28; S.to.set(LAKE.cx + Math.cos(a) * 55, 18, LAKE.cz + Math.sin(a) * 38); }
      }
    }
  }
}

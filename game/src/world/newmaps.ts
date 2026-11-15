// Lima peta baru (v0.9.9): bangunan, tumbuhan khas, dan suasana yang tidak dibuat oleh modul umum (terrain/water/vegetation).
//  - Kolam Pemancingan: tepi kolam beton, saung bambu, kincir air, lampu tali, sawah, papan nama
//  - Sungai Gambut: rumah lanting (rumah apung Banjar), perahu klotok, eceng gondok, kabut rendah
//  - Muara Bakau: pohon bakau berakar tunjang, akar napas, jembatan papan, panggung pandang, gazebo
//  - Laguna Karst: pulau batu kapur berbentuk jamur, pondok apung, karang berwarna di dasar laguna
//  - Pelabuhan Malam: tembok dermaga, pemecah ombak + tetrapod, mercusuar berputar, bagan berlampu, kapal, kota
// Semua bentuk dibuat dari kode (tanpa berkas model) supaya ringan & bisa jalan luring. Benda berulang memakai InstancedMesh.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Q } from '../core/quality';
import {
  LOC, fbm, groundH, addObstacle, reserved, SPOT_PLACES, BRIDGES, bridgeH, PADS, type Bridge,
  PONDS, KYARD, gC, gW, LANTING, GJETTY, bkZ, creekX, CREEK_W, BWALK, LISLE, KARST, LHOUSE, LLEDGE,
  QUAY_Z, HPIER, BAGAN, LIGHTHOUSE,
} from './layout';
import { woodTexture, signTexture } from './props';

const rng = (seed: number) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Tekstur kanvas sederhana. */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
/** Gradasi bundar untuk cahaya di permukaan air (aditif). */
function glowTex(r: number, g: number, b: number) {
  return canvasTex(128, 128, c => { const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, `rgba(${r},${g},${b},1)`); gr.addColorStop(0.35, `rgba(${r},${g},${b},0.45)`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`); c.fillStyle = gr; c.fillRect(0, 0, 128, 128); });
}

export class NewMapScape {
  group = new THREE.Group();
  /** bola lampu: world.ts menyalakan 4 lampu sungguhan terdekat saat malam */
  lamps: THREE.Mesh[] = [];
  /** benda beranimasi */
  private spin: { obj: THREE.Object3D; speed: number; axis: 'x' | 'y' | 'z' }[] = [];
  private bob: { obj: THREE.Object3D; base: number; ph: number; amp: number }[] = [];
  private nightGlow: THREE.Material[] = [];      // bersinar hanya malam (opacity)
  private windowMats: THREE.MeshStandardMaterial[] = [];
  private drift: { obj: THREE.Object3D; x0: number; x1: number; speed: number; z: number }[] = [];
  private mist: THREE.Mesh[] = [];
  private beam: THREE.Object3D | null = null;

  private plank = new THREE.MeshStandardMaterial({ map: woodTexture(), roughness: 0.85 });
  private dark = new THREE.MeshStandardMaterial({ map: woodTexture(128, 64, [80, 60, 42]), roughness: 0.9 });
  private bamboo = new THREE.MeshStandardMaterial({ color: 0xc2ab6a, roughness: 0.75 });
  private thatch = new THREE.MeshStandardMaterial({ color: 0x8f7a48, roughness: 1, flatShading: true });
  private bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });

  constructor() {
    this.group.name = 'newmap';
    for (const br of BRIDGES) if (br.style === 'kayu') this.boardwalk(br);
    if (LOC === 'kolam') this.buildKolam();
    else if (LOC === 'gambut') this.buildGambut();
    else if (LOC === 'bakau') this.buildBakau();
    else if (LOC === 'laguna') this.buildLaguna();
    else if (LOC === 'pelabuhan') this.buildPelabuhan();
    this.group.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.receiveShadow === false && !(m.material as THREE.Material).transparent) m.receiveShadow = true; });
  }

  // ======================= alat bantu umum =======================
  private lamp(parent: THREE.Object3D, x: number, y: number, z: number, r = 0.08, color = 0xffd9a0) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), color === 0xffd9a0 ? this.bulbMat : new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); parent.add(m); this.lamps.push(m); return m;
  }
  /** Titian/jembatan kayu: papan melintang, tiang sampai dasar, pagar kayu. */
  private boardwalk(br: Bridge) {
    const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
    const nP = Math.ceil(len / 0.3), planks = new THREE.InstancedMesh(new THREE.BoxGeometry(br.w, 0.06, 0.27), this.plank, nP);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(1, 1, 1), p = V(), col = new THREE.Color();
    for (let i = 0; i < nP; i++) {
      const t = (i + 0.5) / nP, y = bridgeH(br, t, len), t2 = Math.min(1, t + 0.02), slope = Math.atan2(bridgeH(br, t2, len) - y, (t2 - t) * len || 1);
      q.setFromEuler(new THREE.Euler(-slope, yaw, (Math.random() - 0.5) * 0.015, 'YXZ'));
      planks.setMatrixAt(i, m.compose(p.set(br.a.x + dx * t, y - 0.03, br.a.z + dz * t), q, s));
      planks.setColorAt(i, col.setScalar(0.85 + Math.random() * 0.3));
    }
    planks.castShadow = planks.receiveShadow = true; this.group.add(planks);
    const nPost = Math.max(2, Math.ceil(len / 2.2) + 1), posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.07, 0.09, 1, 6), this.dark, nPost * 2);
    const rail = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 1), this.dark, (nPost - 1) * 2);
    let kp = 0, kr = 0; const tops: THREE.Vector3[][] = [[], []];
    for (let i = 0; i < nPost; i++) {
      const t = i / (nPost - 1), y = bridgeH(br, t, len);
      [-1, 1].forEach((side, si) => {
        const ox = Math.cos(yaw) * side * (br.w / 2 - 0.05), oz = -Math.sin(yaw) * side * (br.w / 2 - 0.05);
        const x = br.a.x + dx * t + ox, z = br.a.z + dz * t + oz, bottom = Math.min(groundH(x, z), y - 0.4) - 0.3, H = y + 0.9 - bottom;
        posts.setMatrixAt(kp++, m.compose(p.set(x, bottom + H / 2, z), q.identity(), s.set(1, H, 1))); s.set(1, 1, 1);
        tops[si].push(V(x, y + 0.88, z));
      });
    }
    for (const pts of tops) for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], mid = a.clone().add(b).multiplyScalar(0.5), L = a.distanceTo(b);
      q.setFromUnitVectors(V(0, 0, 1), b.clone().sub(a).normalize());
      rail.setMatrixAt(kr++, m.compose(mid, q, s.set(1, 1, L))); s.set(1, 1, 1);
    }
    posts.count = kp; rail.count = kr; posts.castShadow = true;
    this.group.add(posts, rail);
  }
  /** Lantai panggung kayu di atas tiang. */
  private platform(x: number, z: number, w: number, d: number, y: number, rail = false, mat: THREE.Material = this.plank) {
    const g = new THREE.Group();
    const deck = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), mat); deck.position.set(x, y - 0.06, z); deck.castShadow = deck.receiveShadow = true; g.add(deck);
    const pg = new THREE.CylinderGeometry(0.09, 0.11, 1, 6);
    for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) {
      const px = x + sx * (w / 2 - 0.15), pz = z + sz * (d / 2 - 0.15), bottom = Math.min(groundH(px, pz), y - 0.5) - 0.4, H = y - bottom;
      const post = new THREE.Mesh(pg, this.dark); post.scale.y = H; post.position.set(px, bottom + H / 2, pz); g.add(post);
    }
    if (rail) for (const [rx, rz, rw, rd] of [[x, z - d / 2 + 0.04, w, 0.06], [x - w / 2 + 0.04, z, 0.06, d], [x + w / 2 - 0.04, z, 0.06, d]] as const) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(rw, 0.06, rd), this.dark); r.position.set(rx, y + 0.85, rz); g.add(r);
    }
    this.group.add(g); return g;
  }
  /** Saung/gazebo bambu beratap ijuk (limas). */
  private saung(x: number, z: number, y: number, w: number, d: number, roofMat: THREE.Material = this.thatch, h = 2.4) {
    const g = new THREE.Group(); g.position.set(x, y, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, h, 6), this.bamboo); p.position.set(sx * (w / 2 - 0.12), h / 2, sz * (d / 2 - 0.12)); p.castShadow = true; g.add(p); }
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.82, 1.3, 4, 1), roofMat); roof.rotation.y = Math.PI / 4; roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d)); roof.position.y = h + 0.6; roof.castShadow = true;
    const ridge = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), this.dark); ridge.position.y = h + 1.35;
    g.add(roof, ridge); this.lamp(g, 0, h - 0.15, 0, 0.07);
    this.group.add(g); return g;
  }
  /** Perahu kayu sederhana (tanpa awak), opsional beratap (klotok). */
  private boat(len = 6, color = 0x2a6a8a, roof = false) {
    const g = new THREE.Group();
    const pts: THREE.Vector2[] = []; for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.001 + Math.pow(Math.sin(t * Math.PI), 0.7) * 0.7, (t - 0.5) * len)); }
    const hg = new THREE.LatheGeometry(pts, 14, Math.PI, Math.PI); hg.rotateX(Math.PI / 2); hg.scale(1, 0.6, 1);
    const hull = new THREE.Mesh(hg, new THREE.MeshStandardMaterial({ map: woodTexture(128, 64, [110, 78, 50]), roughness: 0.85, side: THREE.DoubleSide }));
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 4, 36), new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); stripe.rotation.x = Math.PI / 2; stripe.scale.set(0.7, len / 2, 1); stripe.position.y = 0.02;
    g.add(hull, stripe);
    if (roof) {
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, len * 0.38), new THREE.MeshStandardMaterial({ map: woodTexture(128, 64, [150, 120, 80]), roughness: 0.85 })); cab.position.set(0, 0.4, len * 0.08);
      const rf = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.06, len * 0.45), new THREE.MeshStandardMaterial({ color, roughness: 0.6 })); rf.position.set(0, 0.88, len * 0.08);
      g.add(cab, rf);
    }
    g.traverse(o => { o.castShadow = true; });
    return g;
  }
  /** Lampu jalan (tiang + bola). */
  private streetLamp(x: number, z: number, y: number, h = 3.4, color = 0xffe0b0) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, h, 6), new THREE.MeshStandardMaterial({ color: 0x3a3e44, metalness: 0.5, roughness: 0.5 })); pole.position.set(x, y + h / 2, z); this.group.add(pole);
    this.lamp(this.group, x, y + h + 0.05, z, 0.13, color); addObstacle(x, z, 0.18);
  }
  /** Rangkaian lampu tali melengkung di antara titik-titik (lampu pesta kampung). */
  private stringLights(pts: THREE.Vector3[], per = 6) {
    const cable = new THREE.MeshStandardMaterial({ color: 0x222222 }), bulbs: THREE.Vector3[] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], mid = a.clone().lerp(b, 0.5); mid.y -= 0.45;
      const c = new THREE.QuadraticBezierCurve3(a, mid, b);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(c, 12, 0.012, 3), cable));
      for (let k = 1; k < per; k++) bulbs.push(c.getPoint(k / per));
    }
    const cols = [0xffd06a, 0xff7a5a, 0x7ad0ff, 0x9aff7a, 0xff9ad8];
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }), bulbs.length);
    const m = new THREE.Matrix4(), c = new THREE.Color();
    bulbs.forEach((p, i) => { im.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)); im.setColorAt(i, c.setHex(cols[i % cols.length])); });
    this.group.add(im);
    // beberapa bola dijadikan sumber cahaya sungguhan (malam)
    for (let i = 0; i < bulbs.length; i += Math.max(1, Math.floor(bulbs.length / 4))) { const L = new THREE.Mesh(new THREE.SphereGeometry(0.01, 3, 2), this.bulbMat); L.position.copy(bulbs[i]); this.group.add(L); this.lamps.push(L); }
  }
  private sign(x: number, z: number, y: number, yaw: number, title: string, sub: string, w = 3.2) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = yaw;
    for (const sx of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.6, 6), this.dark); p.position.set(sx * (w / 2 - 0.1), 1.3, 0); g.add(p); addObstacle(x + Math.cos(yaw) * sx * (w / 2 - 0.1), z - Math.sin(yaw) * sx * (w / 2 - 0.1), 0.15); }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.19), new THREE.MeshStandardMaterial({ map: signTexture(title, sub), roughness: 0.7, side: THREE.DoubleSide })); b.position.y = 2.25; g.add(b);
    this.group.add(g);
  }
  /** Lempeng cahaya di permukaan air (pantulan lampu), terlihat saat malam. */
  private waterGlow(x: number, z: number, size: number, rgb: [number, number, number]) {
    const mat = new THREE.MeshBasicMaterial({ map: glowTex(...rgb), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat); m.position.set(x, 0.05, z); m.renderOrder = 2;
    this.group.add(m); this.nightGlow.push(mat); return m;
  }
  /** Titik di tepi elips-super (tepi kolam). */
  private pondEdge(p: { cx: number; cz: number; rx: number; rz: number }, a: number, e = 1) {
    const c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), r = 1 / Math.pow(Math.pow(c / p.rx, 5) + Math.pow(s / p.rz, 5), 1 / 5);
    return { x: p.cx + Math.cos(a) * r * e, z: p.cz + Math.sin(a) * r * e };
  }

  // ======================= Kolam Pemancingan =======================
  private buildKolam() {
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x9c9890, roughness: 0.95 });
    for (const P of PONDS) {
      const n = Math.round((P.rx + P.rz) * 2.2), curb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 0.4), curbMat, n);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V();
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2, A = this.pondEdge(P, a0, 1.005), B = this.pondEdge(P, a1, 1.005);
        const L = Math.hypot(B.x - A.x, B.z - A.z); q.setFromAxisAngle(V(0, 1, 0), Math.atan2(-(B.z - A.z), B.x - A.x));
        curb.setMatrixAt(i, m.compose(V((A.x + B.x) / 2, 0.36, (A.z + B.z) / 2), q, s.set(L + 0.04, 1, 1)));
      }
      curb.castShadow = curb.receiveShadow = true; this.group.add(curb);
    }
    // panggung mancing: K1 dengan saung, K2/K3 dengan payung
    const [p1, p2, p3] = PADS;
    this.platform(p1.x, p1.z, p1.w!, p1.d!, p1.y, false, this.bamboo);
    this.saung(p1.x, p1.z + 0.2, p1.y, p1.w! - 0.4, p1.d! - 0.2);
    for (const [P, col] of [[p2, 0xd8342a], [p3, 0x1f6fb0]] as const) {
      this.platform(P.x, P.z, P.w!, P.d!, P.y, false, this.bamboo);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.3, 5), new THREE.MeshStandardMaterial({ color: 0xdddddd })); pole.position.set(P.x - 1.1, P.y + 1.15, P.z + 0.6);
      const um = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.45, 8, 1, true), new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: 0.8 })); um.position.set(P.x - 1.1, P.y + 2.3, P.z + 0.6);
      this.group.add(pole, um);
    }
    // saung lesehan di halaman (dekorasi + rintangan)
    for (const [x, z, w, d] of [[-24, -4, 3.4, 3.0], [22, -4, 3.4, 3.0], [-60, -2, 3.0, 2.8], [52, 0, 3.0, 2.8], [-30, 12, 3.6, 3.2]] as const) {
      const y = groundH(x, z); this.platform(x, z, w, d, y + 0.45, false, this.bamboo); this.saung(x, z, y + 0.45, w - 0.2, d - 0.2);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) addObstacle(x + sx * (w / 2 - 0.2), z + sz * (d / 2 - 0.2), 0.3);
      addObstacle(x, z, Math.min(w, d) / 2 - 0.2);
    }
    // kincir air (aerator) di kolam galatama & babon
    for (const [x, z] of [[12, -32], [-14, -36], [40, -24]] as const) {
      const g = new THREE.Group(); g.position.set(x, 0, z);
      const floatMat = new THREE.MeshStandardMaterial({ color: 0x2a6ab0, roughness: 0.4 });
      for (const sx of [-0.7, 0.7]) { const f = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 1.6, 10).rotateX(Math.PI / 2), floatMat); f.position.set(sx, 0.08, 0); g.add(f); }
      const wheel = new THREE.Group(); wheel.position.set(0, 0.32, 0);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6 })); wheel.add(hub);
      for (let i = 0; i < 8; i++) { const paddle = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.04, 0.22), new THREE.MeshStandardMaterial({ color: 0xe8e2d0 })); const a = i / 8 * Math.PI * 2; paddle.position.set(0, Math.sin(a) * 0.35, Math.cos(a) * 0.35); paddle.rotation.x = a; wheel.add(paddle); }
      const motor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.35), new THREE.MeshStandardMaterial({ color: 0x1f1f1f })); motor.position.set(0.75, 0.45, 0);
      const foam = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.25, depthWrite: false })); foam.position.set(0, 0.03, 0.9); foam.scale.set(1, 1, 1.6);
      g.add(wheel, motor, foam); this.group.add(g); this.spin.push({ obj: wheel, speed: 4.2, axis: 'x' }); this.bob.push({ obj: foam, base: 0.03, ph: x, amp: 0.005 });
    }
    // lampu tali mengelilingi kolam galatama (tiang bambu di sekeliling)
    const P0 = PONDS[0], poles: THREE.Vector3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.06 + i * 0.088), e = this.pondEdge(P0, a, 1.07);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.0, 5), this.bamboo); pole.position.set(e.x, groundH(e.x, e.z) + 1.5, e.z); this.group.add(pole); addObstacle(e.x, e.z, 0.12);
      poles.push(V(e.x, groundH(e.x, e.z) + 2.9, e.z));
    }
    this.stringLights(poles, 5);
    // papan nama di gerbang + pagar bambu
    this.sign(0, 20, groundH(0, 20), 0, 'PEMANCINGAN BERKAH JAYA', 'HARIAN · GALATAMA · KOLAM BABON', 4.6);
    // sawah: rumpun padi di petak-petak (di luar halaman)
    const r = rng(91), nRice = Math.round(2200 * Math.max(0.35, Q.trees));
    const tuft = new THREE.ConeGeometry(0.18, 0.62, 5, 1, true).translate(0, 0.31, 0);
    const rice = new THREE.InstancedMesh(tuft, new THREE.MeshLambertMaterial({ color: 0x7fae3a, side: THREE.DoubleSide }), nRice);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(), c = new THREE.Color(); let k = 0;
    for (let i = 0; i < nRice * 3 && k < nRice; i++) {
      const x = -130 + r() * 260, z = -95 + r() * 150;
      if (x > KYARD.x0 - 4 && x < KYARD.x1 + 4 && z > KYARD.z0 - 4 && z < KYARD.z1 + 4) continue;
      const gx = Math.abs((((x + 3) % 14) + 14) % 14 - 7), gz = Math.abs((((z + 5) % 14) + 14) % 14 - 7); if (Math.max(gx, gz) > 6.2) continue; // bukan di pematang
      const sc = 0.8 + r() * 0.5; q.setFromAxisAngle(V(0, 1, 0), r() * 6.28);
      rice.setMatrixAt(k, m.compose(V(x, groundH(x, z) - 0.02, z), q, s.set(sc, sc * (0.9 + r() * 0.3), sc)));
      rice.setColorAt(k++, c.setHSL(0.2 + r() * 0.05, 0.5, 0.36 + r() * 0.12));
    }
    rice.count = k; rice.receiveShadow = true; rice.userData.noCull = false; this.group.add(rice);
    // gubuk sawah di kejauhan
    for (const [x, z] of [[78, 36], [-92, -60], [96, -70]] as const) { const y = groundH(x, z); this.platform(x, z, 2.6, 2.4, y + 0.9, false, this.bamboo); this.saung(x, z, y + 0.9, 2.4, 2.2); }
  }

  // ======================= Sungai Gambut =======================
  private buildGambut() {
    const walls = [0x2f9a90, 0xe0b84a, 0x4a7ad0];
    const logG = new THREE.CylinderGeometry(0.28, 0.28, 1, 8).rotateZ(Math.PI / 2);
    LANTING.forEach((L, i) => {
      // rakit kayu gelondongan
      const logs = new THREE.InstancedMesh(logG, this.dark, 8), m = new THREE.Matrix4();
      for (let k = 0; k < 8; k++) logs.setMatrixAt(k, m.compose(V(L.x, 0.02, L.z - L.d / 2 + 0.35 + k * (L.d - 0.7) / 7), new THREE.Quaternion(), V(L.w + 0.4, 1, 1)));
      this.group.add(logs);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(L.w, 0.1, L.d), this.plank); deck.position.set(L.x, L.y - 0.05, L.z); this.group.add(deck);
      this.bob.push({ obj: logs, base: 0.02, ph: i * 1.7, amp: 0.025 });
      // rumah: dinding papan bercat, atap pelana seng, jendela berlampu
      const B = PADS[i].block!, wallMat = new THREE.MeshStandardMaterial({ map: woodTexture(128, 128, [Math.round(((walls[i] >> 16) & 255) * 0.95), Math.round(((walls[i] >> 8) & 255) * 0.95), Math.round((walls[i] & 255) * 0.95)]), roughness: 0.85 });
      const house = new THREE.Group(); house.position.set(B.x, L.y, B.z);
      const body = new THREE.Mesh(new THREE.BoxGeometry(B.w, 2.3, B.d), wallMat); body.position.y = 1.15; body.castShadow = true;
      const roofMat = new THREE.MeshStandardMaterial({ color: i === 1 ? 0x8a4a2a : 0x7d8488, roughness: 0.55, metalness: 0.35, side: THREE.DoubleSide });
      const rise = 0.8, half = B.w / 2 + 0.35, slab = Math.hypot(half, rise), ang = Math.atan2(rise, half);
      for (const sx of [-1, 1]) { const rp = new THREE.Mesh(new THREE.BoxGeometry(slab, 0.06, B.d + 0.9), roofMat); rp.rotation.z = -sx * ang; rp.position.set(sx * half / 2, 2.3 + rise / 2 + 0.04, 0); rp.castShadow = true; house.add(rp); }
      const gable = new THREE.Shape(); gable.moveTo(-B.w / 2, 0); gable.lineTo(B.w / 2, 0); gable.lineTo(0, 0.8); gable.closePath();
      for (const sz of [-1, 1]) { const gm = new THREE.Mesh(new THREE.ShapeGeometry(gable), wallMat); gm.position.set(0, 2.3, sz * B.d / 2); if (sz > 0) gm.rotation.y = Math.PI; house.add(gm); }
      const winMat = new THREE.MeshStandardMaterial({ color: 0x2a2a22, emissive: 0xffb860, emissiveIntensity: 0, roughness: 0.4 }); this.windowMats.push(winMat);
      for (const sx of [-0.9, 0.9]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.6), winMat); w.position.set(sx, 1.35, -B.d / 2 - 0.01); w.rotation.y = Math.PI; house.add(w); }
      const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), this.dark); door.position.set(0, 0.85, -B.d / 2 - 0.012); door.rotation.y = Math.PI; house.add(door);
      house.add(body); this.group.add(house);
      this.lamp(this.group, B.x + B.w / 2 - 0.2, L.y + 2.0, B.z - B.d / 2 - 0.15, 0.09);
      // pot tanaman & jeriken di teras
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 8), new THREE.MeshStandardMaterial({ color: 0xa0522d })); pot.position.set(L.x + L.w / 2 - 0.5, L.y + 0.15, L.z - 0.3);
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x3a7a2a, flatShading: true })); leaf.position.set(pot.position.x, L.y + 0.5, pot.position.z);
      this.group.add(pot, leaf);
    });
    // perahu klotok di dermaga + satu klotok berlayar pelan menyusuri sungai
    const k1 = this.boat(7.5, 0x2a5aa8, true); k1.position.set(GJETTY.x + GJETTY.w / 2 + 0.9, 0.05, GJETTY.z1 + 4); this.group.add(k1); this.bob.push({ obj: k1, base: 0.05, ph: 1, amp: 0.04 });
    const k2 = this.boat(7, 0xb8362a, true); k2.rotation.y = Math.PI / 2; this.group.add(k2);
    this.drift.push({ obj: k2, x0: -260, x1: 260, speed: 2.2, z: 0 });
    // eceng gondok mengapung di tepi
    const r = rng(17), n = Math.round(380 * Math.max(0.4, Q.trees));
    const hy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.4, 1), new THREE.MeshLambertMaterial({ color: 0x4f8a2e, flatShading: true }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = V(); let k = 0;
    for (let i = 0; i < n * 4 && k < n; i++) {
      const cx = -200 + r() * 400, side = r() < 0.5 ? 1 : -1, z0 = gC(cx) + side * gW(cx) * (0.84 + r() * 0.12);
      for (let j = 0; j < 5 && k < n; j++) {
        const x = cx + (r() - 0.5) * 4, z = z0 + (r() - 0.5) * 2.5;
        if (reserved(x, z, 1) || SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 4) || groundH(x, z) > -0.05) continue;
        const sc = 0.6 + r() * 0.8; q.setFromAxisAngle(V(0, 1, 0), r() * 6.28);
        hy.setMatrixAt(k++, m.compose(V(x, 0.06, z), q, s.set(sc, sc, sc)));
      }
    }
    hy.count = k; this.group.add(hy);
    // batang kayu hanyut
    for (let i = 0; i < 6; i++) { const x = -150 + i * 60 + r() * 20, log = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 4 + r() * 3, 7).rotateZ(Math.PI / 2), this.dark); log.position.set(x, 0.04, gC(x) + (r() - 0.5) * gW(x)); log.rotation.y = r() * 3; this.group.add(log); this.bob.push({ obj: log, base: 0.04, ph: i, amp: 0.03 }); }
    // kabut rendah di atas sungai (lapisan tipis yang bergeser pelan)
    const fogTex = canvasTex(256, 64, c => { const g = c.createLinearGradient(0, 0, 0, 64); g.addColorStop(0, 'rgba(230,232,228,0)'); g.addColorStop(0.5, 'rgba(230,232,228,0.9)'); g.addColorStop(1, 'rgba(230,232,228,0)'); c.fillStyle = g; c.fillRect(0, 0, 256, 64); });
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.MeshBasicMaterial({ map: fogTex, transparent: true, opacity: 0.22, depthWrite: false, fog: true });
      const fm = new THREE.Mesh(new THREE.PlaneGeometry(180, 26), mat); fm.rotation.x = -Math.PI / 2; fm.position.set(-200 + i * 80, 0.9 + i * 0.12, gC(-200 + i * 80) - 6 + (i % 2) * 8); fm.renderOrder = 3;
      this.group.add(fm); this.mist.push(fm);
    }
    this.sign(GJETTY.x - 3.2, GJETTY.z0 + 1.5, groundH(GJETTY.x - 3.2, GJETTY.z0 + 1.5), 0, 'DERMAGA KLOTOK', 'SUNGAI GAMBUT · RUMAH LANTING', 3.4);
  }

  // ======================= Muara Bakau =======================
  /** Geometri pohon bakau: batang + akar tunjang melengkung (kayu) dan tajuk berbongkah (daun). */
  private mangroveGeo(seed: number) {
    const r = rng(seed), wood: THREE.BufferGeometry[] = [], leaf: THREE.BufferGeometry[] = [];
    const H = 3.2 + r() * 2.2;
    wood.push(new THREE.CylinderGeometry(0.1, 0.16, H - 1.0, 6).translate(0, 1.0 + (H - 1.0) / 2, 0));
    const nRoots = 7 + Math.floor(r() * 4);
    for (let i = 0; i < nRoots; i++) {
      const a = (i / nRoots) * Math.PI * 2 + r() * 0.4, R = 1.0 + r() * 1.1, top = 0.9 + r() * 0.8;
      const c = new THREE.QuadraticBezierCurve3(V(Math.cos(a) * 0.08, top, Math.sin(a) * 0.08), V(Math.cos(a) * R * 0.7, top + 0.35, Math.sin(a) * R * 0.7), V(Math.cos(a) * R, -0.6, Math.sin(a) * R));
      wood.push(new THREE.TubeGeometry(c, 6, 0.04 + r() * 0.03, 4));
    }
    for (let i = 0; i < 5; i++) { const b = new THREE.IcosahedronGeometry(1.1 + r() * 0.7, 0); b.scale(1, 0.6, 1); b.translate((r() - 0.5) * 1.8, H + (r() - 0.3) * 0.7, (r() - 0.5) * 1.8); leaf.push(b); }
    const strip = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
    return { wood: mergeGeometries(wood.map(strip))!, leaf: mergeGeometries(leaf.map(strip))! };
  }
  private buildBakau() {
    const r = rng(303), nTree = Math.round(260 * Math.max(0.4, Q.trees));
    const vars = [this.mangroveGeo(11), this.mangroveGeo(29), this.mangroveGeo(53)];
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 }), leafMat = new THREE.MeshStandardMaterial({ color: 0x2f5a26, roughness: 0.9, flatShading: true });
    const lists: THREE.Matrix4[][] = [[], [], []];
    for (let i = 0; i < nTree * 6 && lists.reduce((a, l) => a + l.length, 0) < nTree; i++) {
      const x = -170 + r() * 340, zb = bkZ(x), z = zb - 30 + r() * 33;
      const h = groundH(x, z); if (h > 0.4 || h < -0.75) continue;
      if (reserved(x, z, 3.5) || SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 9)) continue;
      if (BRIDGES.some(b => { const abx = b.b.x - b.a.x, abz = b.b.z - b.a.z, t = Math.max(0, Math.min(1, ((x - b.a.x) * abx + (z - b.a.z) * abz) / (abx * abx + abz * abz))); return Math.hypot(x - b.a.x - abx * t, z - b.a.z - abz * t) < 3.2; })) continue;
      if (Math.abs(x - creekX(z)) < CREEK_W + 2 && z > zb - 4) continue;
      if (fbm(x * 0.04, z * 0.04, 2) < 0.36) continue;   // celah air di antara rumpun
      const sc = 0.75 + r() * 0.6, v = Math.floor(r() * 3);
      lists[v].push(new THREE.Matrix4().compose(V(x, h, z), new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), r() * 6.28), V(sc, sc * (0.85 + r() * 0.3), sc)));
      if (h > -0.2) addObstacle(x, z, 1.2 * sc);
    }
    lists.forEach((L, v) => {
      if (!L.length) return;
      const wi = new THREE.InstancedMesh(vars[v].wood, woodMat, L.length), li = new THREE.InstancedMesh(vars[v].leaf, leafMat, L.length), c = new THREE.Color();
      L.forEach((m, i) => { wi.setMatrixAt(i, m); li.setMatrixAt(i, m); li.setColorAt(i, c.setHSL(0.27 + r() * 0.05, 0.45, 0.22 + r() * 0.08)); });
      wi.castShadow = li.castShadow = Q.shadows; this.group.add(wi, li);
    });
    // akar napas (pneumatofor) di lumpur tepi darat
    const np = Math.round(1600 * Math.max(0.4, Q.trees)), spike = new THREE.InstancedMesh(new THREE.ConeGeometry(0.025, 0.32, 4).translate(0, 0.16, 0), woodMat, np);
    const m = new THREE.Matrix4(); let k = 0;
    for (let i = 0; i < np * 3 && k < np; i++) { const x = -150 + r() * 300, z = bkZ(x) - 6 + r() * 7, h = groundH(x, z); if (h < -0.5 || h > 0.5 || reserved(x, z, 1)) continue; spike.setMatrixAt(k++, m.makeTranslation(x, h - 0.02, z)); }
    spike.count = k; this.group.add(spike);
    // panggung pandang di ujung jembatan papan (M1) + papan nama di pangkal
    const p1 = PADS[0]; this.platform(p1.x, p1.z, p1.w!, p1.d!, p1.y, true);
    this.lamp(this.group, p1.x + p1.w! / 2 - 0.15, p1.y + 1.0, p1.z - p1.d! / 2 + 0.15, 0.08);
    this.sign(BWALK[0].x + 2.8, BWALK[0].z + 1.5, groundH(BWALK[0].x + 2.8, BWALK[0].z + 1.5), 0, 'EKOWISATA MUARA BAKAU', 'JALUR PAPAN · PANGGUNG PANDANG', 3.6);
    // gazebo di tepi sungai kecil (M2)
    const p2 = PADS[1]; this.platform(p2.x, p2.z, p2.w!, p2.d!, p2.y, false); this.saung(p2.x - 0.3, p2.z, p2.y, p2.w! - 0.6, p2.d! - 0.3, new THREE.MeshStandardMaterial({ color: 0x5a3a26, roughness: 0.9, flatShading: true }));
    // perahu nelayan di lumpur & yang tertambat
    for (const [x, dz, rot, col] of [[-30, -2.5, 0.4, 0x2a7aa8], [-64, -3.5, 1.9, 0xc8402a], [54, -6, 1.1, 0x2a8a5a]] as const) {
      const b = this.boat(5.2, col); const z = bkZ(x) + dz; b.position.set(x, Math.max(groundH(x, z), -0.05) + 0.12, z); b.rotation.set(0.04, rot, 0.08); this.group.add(b);
    }
    // nipah di tepi sungai kecil
    const nip = new THREE.InstancedMesh(new THREE.ConeGeometry(0.05, 2.6, 3).translate(0, 1.3, 0).rotateZ(0.5), new THREE.MeshLambertMaterial({ color: 0x5a8a3a }), 240);
    const q = new THREE.Quaternion(); k = 0;
    for (let i = 0; i < 40; i++) { const z = bkZ(40) + 4 + i * 1.6, side = i % 2 ? 1 : -1, x = creekX(z) + side * (CREEK_W + 0.8); if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 4)) continue; for (let f = 0; f < 6; f++) { q.setFromAxisAngle(V(0, 1, 0), f / 6 * Math.PI * 2 + i); nip.setMatrixAt(k++, m.compose(V(x, groundH(x, z) - 0.1, z), q, V(1, 0.8 + (f % 3) * 0.2, 1))); } }
    nip.count = k; this.group.add(nip);
  }

  // ======================= Laguna Karst =======================
  /** Pulau batu kapur berbentuk jamur: pangkal tergerus ombak (menyempit), badan membulat, puncak berhutan. */
  private karstGeo(k: { r: number; h: number }, seed: number) {
    const prof: THREE.Vector2[] = [], r = k.r, h = k.h;
    const shape: [number, number][] = [[0.62, -1.5], [0.5, 0], [0.48, 0.05], [0.66, 0.1], [0.92, 0.3], [1.0, 0.5], [0.96, 0.7], [0.82, 0.86], [0.55, 0.96], [0.2, 1.0], [0.001, 1.01]];
    for (const [a, b] of shape) prof.push(new THREE.Vector2(a * r, b * h));
    const g = new THREE.LatheGeometry(prof, 22); const p = g.attributes.position as THREE.BufferAttribute, col = new Float32Array(p.count * 3), v = V();
    const rock = new THREE.Color(0x58534a), dark = new THREE.Color(0x26231f), green = new THREE.Color(0x1d4a1a), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i); const t = v.y / h, ang = Math.atan2(v.z, v.x);
      const n = fbm(Math.cos(ang) * 2 + seed, v.y * 0.15 + Math.sin(ang) * 2, 3);
      const k2 = 0.82 + n * 0.36 + 0.06 * Math.sin(v.y * 1.7 + ang * 5);
      v.x *= k2; v.z *= k2; p.setXYZ(i, v.x, v.y, v.z);
      const veg = Math.min(1, Math.max(0, (t - 0.3 + (n - 0.5) * 0.45) / 0.1)) * (0.7 + 0.3 * Math.max(0, Math.sin(ang * 3 + n * 6)));
      c.copy(rock).multiplyScalar(0.7 + n * 0.5 - 0.12 * Math.max(0, Math.sin(ang * 23 + v.y * 0.3))); if (t < 0.12) c.lerp(dark, Math.min(1, 1 - t / 0.12));   // garis gerusan ombak gelap
      c.lerp(green.clone().multiplyScalar(0.8 + n * 0.5), veg);
      col[i * 3] = Math.min(1, Math.max(0, c.r)); col[i * 3 + 1] = Math.min(1, Math.max(0, c.g)); col[i * 3 + 2] = Math.min(1, Math.max(0, c.b));
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
    return g;
  }
  private buildLaguna() {
    // Lambert: tidak memakai pantulan langit (scene.environment) yang membuat batu tampak putih pucat
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    const canopy = new THREE.MeshLambertMaterial({ color: 0x3a7a32, flatShading: true });
    const blob = new THREE.IcosahedronGeometry(1, 0), r = rng(707);
    const blobs = new THREE.InstancedMesh(blob, canopy, KARST.length * 14), m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(); let kb = 0;
    KARST.forEach((K, i) => {
      const mesh = new THREE.Mesh(this.karstGeo(K, i * 3.1), rockMat); mesh.position.set(K.x, 0, K.z); mesh.rotation.y = r() * 6.28; mesh.castShadow = mesh.receiveShadow = true; this.group.add(mesh);
      for (let j = 0; j < 14; j++) {
        const a = r() * 6.28, d = Math.sqrt(r()) * K.r * 0.85, s = K.r * (0.2 + r() * 0.18), up = 1 - Math.pow(d / (K.r * 0.95), 2) * 0.35;
        blobs.setMatrixAt(kb, m.compose(V(K.x + Math.cos(a) * d, K.h * (0.82 + 0.18 * up + r() * 0.05), K.z + Math.sin(a) * d), q.setFromEuler(new THREE.Euler(r(), r() * 6, r())), V(s, s * 0.7, s)));
        blobs.setColorAt(kb++, c.setHSL(0.28 + r() * 0.06, 0.45, 0.2 + r() * 0.1));
      }
    });
    blobs.count = kb; blobs.castShadow = Q.shadows; this.group.add(blobs);
    // pondok apung (homestay panggung): lantai, dinding anyaman, atap rumbia, tangga ke air
    const H = LHOUSE, P = PADS[0], B = P.block!;
    this.platform(H.x, H.z, H.w, H.d, H.y, true);
    const weave = new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, g => { g.fillStyle = '#c9b07a'; g.fillRect(0, 0, 64, 64); g.strokeStyle = 'rgba(90,70,40,0.55)'; g.lineWidth = 3; for (let i = 0; i < 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 32, 64); g.stroke(); g.beginPath(); g.moveTo(i + 32, 0); g.lineTo(i, 64); g.stroke(); } }, true), roughness: 0.9 });
    (weave.map as THREE.Texture).repeat.set(3, 2);
    const hut = new THREE.Group(); hut.position.set(B.x, H.y, B.z);
    const body = new THREE.Mesh(new THREE.BoxGeometry(B.w, 2.2, B.d), weave); body.position.y = 1.1; body.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(B.w * 0.85, 1.6, 4), this.thatch); roof.rotation.y = Math.PI / 4; roof.scale.set(1, 1, B.d / B.w * 1.15); roof.position.y = 3.0; roof.castShadow = true;
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.7), this.dark); door.position.set(0, 0.85, -B.d / 2 - 0.01); door.rotation.y = Math.PI;
    const winMat = new THREE.MeshStandardMaterial({ color: 0x2a2a22, emissive: 0xffc070, emissiveIntensity: 0 }); this.windowMats.push(winMat);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), winMat); win.position.set(1.4, 1.35, -B.d / 2 - 0.01); win.rotation.y = Math.PI;
    hut.add(body, roof, door, win); this.group.add(hut);
    this.lamp(this.group, H.x - H.w / 2 + 0.2, H.y + 1.6, H.z - H.d / 2 + 0.2, 0.08);
    // tangga ke air + kano tertambat
    for (let i = 0; i < 5; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.28), this.plank); st.position.set(H.x + H.w / 2 - 0.7, H.y - 0.25 - i * 0.24, H.z - H.d / 2 - 0.2 - i * 0.22); this.group.add(st); }
    const cano = this.boat(4.6, 0xd8a028); cano.position.set(H.x + H.w / 2 + 1.0, 0.06, H.z - 1); this.group.add(cano); this.bob.push({ obj: cano, base: 0.06, ph: 2, amp: 0.05 });
    // batu pijakan di kaki tebing (R3)
    const lg = new THREE.IcosahedronGeometry(LLEDGE.r * 1.15, 2), lp = lg.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < lp.count; i++) { const y = lp.getY(i); if (y > 0) lp.setY(i, y * 0.12); lp.setX(i, lp.getX(i) * (0.9 + fbm(lp.getX(i), lp.getZ(i), 2) * 0.25)); }
    lg.computeVertexNormals();
    const ledge = new THREE.Mesh(lg, new THREE.MeshStandardMaterial({ color: 0xa8a090, roughness: 0.95 })); ledge.position.set(LLEDGE.x, LLEDGE.y - 0.18, LLEDGE.z); ledge.castShadow = ledge.receiveShadow = true; this.group.add(ledge);
    // karang warna-warni di dasar laguna (terlihat karena air jernih)
    const nc = Math.round(420 * Math.max(0.4, Q.trees)), coral = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ roughness: 0.8, envMapIntensity: 0.3 }), nc);
    const cols = [0xe86a8a, 0xf0a040, 0x9a6ad8, 0x5ac8b0, 0xd8d070, 0xe85a4a]; let k = 0;
    for (let i = 0; i < nc * 4 && k < nc; i++) {
      const a = r() * 6.28, d = LISLE.r + 3 + Math.pow(r(), 1.5) * 60, x = LISLE.x + Math.cos(a) * d, z = LISLE.z + Math.sin(a) * d, h = groundH(x, z);
      if (h > -0.9 || h < -6) continue;
      const s = 0.25 + r() * 0.7;
      coral.setMatrixAt(k, m.compose(V(x, h + s * 0.2, z), q.setFromEuler(new THREE.Euler(r(), r() * 6, r())), V(s, s * (0.5 + r() * 0.8), s)));
      coral.setColorAt(k++, c.setHex(cols[Math.floor(r() * cols.length)]).multiplyScalar(0.7 + r() * 0.4));
    }
    coral.count = k; this.group.add(coral);
    // kayu hanyut & kano di pasir, papan nama
    const dw = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 3.2, 6).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb8ab98, roughness: 1 })); dw.position.set(-6, groundH(-6, -4) + 0.15, -4); dw.rotation.y = 0.6; this.group.add(dw); addObstacle(-6, -4, 0.8);
    const c2 = this.boat(5, 0x2a8ac8); c2.position.set(16, groundH(16, 4) + 0.12, 4); c2.rotation.set(0.05, 2.1, 0.12); this.group.add(c2); addObstacle(16, 4, 1.6);
    this.sign(-3, 30, groundH(-3, 30), 0, 'LAGUNA KARST', 'POndok APUNG · PASIR PUTIH · TEBING'.toUpperCase(), 3.4);
  }

  // ======================= Pelabuhan Malam =======================
  private buildPelabuhan() {
    const concrete = new THREE.MeshStandardMaterial({ map: canvasTex(128, 128, g => { g.fillStyle = '#8c8a86'; g.fillRect(0, 0, 128, 128); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${60 + Math.random() * 60},${60 + Math.random() * 60},${60 + Math.random() * 60},0.25)`; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); } g.strokeStyle = 'rgba(40,40,40,0.5)'; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); }, true), roughness: 0.95 });
    (concrete.map as THREE.Texture).repeat.set(60, 8);
    // tembok dermaga & lantai promenade
    const wall = new THREE.Mesh(new THREE.BoxGeometry(280, 7.3, 1.2), new THREE.MeshStandardMaterial({ color: 0x6e6b66, roughness: 0.95 })); wall.position.set(0, 1.5 - 3.65, QUAY_Z + 0.2); this.group.add(wall);
    const slab = new THREE.Mesh(new THREE.BoxGeometry(280, 0.2, 34), concrete); slab.position.set(0, 1.42, QUAY_Z + 17); slab.receiveShadow = true; this.group.add(slab);
    // bolder & ban pelindung di sepanjang tembok
    const bol = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.22, 0.45, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a2e, metalness: 0.5, roughness: 0.5 }), 40);
    const tyre = new THREE.InstancedMesh(new THREE.TorusGeometry(0.42, 0.16, 6, 12), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }), 40);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(); let kb = 0;
    for (let x = -130; x <= 130; x += 8) { if (Math.abs(x - HPIER.x) < 5) continue; bol.setMatrixAt(kb, m.makeTranslation(x, 1.75, QUAY_Z + 0.7)); tyre.setMatrixAt(kb++, m.compose(V(x + 2, 0.6, QUAY_Z - 0.25), q.identity(), V(1, 1, 1))); addObstacle(x, QUAY_Z + 0.7, 0.25); }
    bol.count = tyre.count = kb; this.group.add(bol, tyre);
    for (let x = -120; x <= 120; x += 14) this.streetLamp(x, QUAY_Z + 3.2, 1.5, 4.2);
    // dermaga beton H2: lantai di atas tiang pancang + lampu + bolder
    const pierL = HPIER.z0 - HPIER.z1, pz = (HPIER.z0 + HPIER.z1) / 2;
    const deck = new THREE.Mesh(new THREE.BoxGeometry(HPIER.w, 0.6, pierL), concrete); deck.position.set(HPIER.x, HPIER.y - 0.3, pz); deck.castShadow = deck.receiveShadow = true; this.group.add(deck);
    const pile = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.28, 8, 8), new THREE.MeshStandardMaterial({ color: 0x5e5c58, roughness: 0.95 }), 60); let kp = 0;
    for (let z = HPIER.z1 + 1; z < HPIER.z0 - 1; z += 4.5) for (const sx of [-1, 1]) pile.setMatrixAt(kp++, m.makeTranslation(HPIER.x + sx * (HPIER.w / 2 - 0.4), HPIER.y - 4.5, z));
    pile.count = kp; this.group.add(pile);
    for (let z = HPIER.z1 + 3; z < HPIER.z0 - 2; z += 10) for (const sx of [-1, 1]) this.streetLamp(HPIER.x + sx * (HPIER.w / 2 - 0.35), z, HPIER.y, 3.6, 0xfff0d0);
    // kapal nelayan tertambat (lampu tiang menyala)
    for (const [x, z, col, rot] of [[HPIER.x - HPIER.w / 2 - 2.2, -6, 0x2a5aa8, 0], [HPIER.x + HPIER.w / 2 + 2.2, -16, 0xc8402a, Math.PI], [HPIER.x - HPIER.w / 2 - 2.2, -24, 0x2a8a5a, 0], [6, QUAY_Z - 3, 0xd8a028, Math.PI / 2], [-24, QUAY_Z - 3, 0x2a5aa8, Math.PI / 2]] as const) {
      const b = this.boat(9, col, true); b.scale.setScalar(1.15); b.position.set(x, 0.1, z); b.rotation.y = rot; this.group.add(b); this.bob.push({ obj: b, base: 0.1, ph: x + z, amp: 0.06 });
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 4, 5), this.dark); mast.position.set(0, 2.2, 0.8); b.add(mast);
      const L = this.lamp(b, 0, 4.25, 0.8, 0.1, 0xffffff); void L;
    }
    // pemecah ombak: jalan beton di atas tumpukan batu + tetrapod
    const rub = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x77736c, roughness: 1, flatShading: true }), 420);
    const tetG = mergeGeometries([0, 1, 2, 3].map(i => { const g = new THREE.CylinderGeometry(0.18, 0.32, 1.3, 6).translate(0, 0.65, 0); const d = [V(0, 1, 0), V(0.94, -0.33, 0), V(-0.47, -0.33, 0.82), V(-0.47, -0.33, -0.82)][i]; g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d)); return g; }))!;
    const tet = new THREE.InstancedMesh(tetG, new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.95 }), 260);
    const r = rng(404); let kr = 0, kt = 0;
    for (const br of BRIDGES.filter(b => b.style === 'beton')) {
      const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), nx = Math.cos(yaw), nz = -Math.sin(yaw);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(br.w, 0.5, len), concrete); cap.position.set(br.a.x + dx / 2, br.y - 0.25, br.a.z + dz / 2); cap.rotation.y = yaw; cap.receiveShadow = cap.castShadow = true; this.group.add(cap);
      const body = new THREE.Mesh(new THREE.BoxGeometry(br.w + 3, br.y + 6, len), new THREE.MeshStandardMaterial({ color: 0x5e5a54, roughness: 1 })); body.position.set(br.a.x + dx / 2, (br.y - 0.5 - 6) / 2, br.a.z + dz / 2); body.rotation.y = yaw; this.group.add(body);
      for (let t = 0; t < len; t += 1.3) for (const side of [-1, 1]) {
        const off = side * (br.w / 2 + 1.0 + r() * 1.6), x = br.a.x + dx * (t / len) + nx * off, z = br.a.z + dz * (t / len) + nz * off;
        if (r() < 0.45 && kt < tet.count) tet.setMatrixAt(kt++, m.compose(V(x, 0.3 + r() * 0.8, z), q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), V(1.1, 1.1, 1.1)));
        else if (kr < rub.count) { const s = 0.6 + r() * 0.8; rub.setMatrixAt(kr++, m.compose(V(x, 0.2 + r() * 0.6, z), q.setFromEuler(new THREE.Euler(r() * 6, r() * 6, r() * 6)), V(s, s * 0.7, s))); }
      }
      for (let t = 6; t < len; t += 16) this.streetLamp(br.a.x + dx * (t / len) + nx * (br.w / 2 - 0.25), br.a.z + dz * (t / len) + nz * (br.w / 2 - 0.25), br.y, 3.2, 0xfff0d0);
    }
    rub.count = kr; tet.count = kt; this.group.add(rub, tet);
    // mercusuar: menara belang merah-putih, lampu dengan sorot berputar
    const LH = LIGHTHOUSE, stripes = canvasTex(64, 256, g => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#c8302a' : '#f2efe8'; g.fillRect(0, i * 32, 64, 32); } });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.3, 11, 16), new THREE.MeshStandardMaterial({ map: stripes, roughness: 0.6 })); tower.position.set(LH.x, 1.9 + 5.5, LH.z); tower.castShadow = true;
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 0.15, 16), new THREE.MeshStandardMaterial({ color: 0x2a2a2a })); gallery.position.set(LH.x, 13.0, LH.z);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12), new THREE.MeshBasicMaterial({ color: 0xfff2c8 })); lantern.position.set(LH.x, 13.7, LH.z);
    const cap2 = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0xc8302a })); cap2.position.set(LH.x, 14.75, LH.z);
    this.group.add(tower, gallery, lantern, cap2); this.lamps.push(lantern);
    const beam = new THREE.Group(); beam.position.set(LH.x, 13.7, LH.z);
    const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    for (const sx of [1, -1]) { const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 60, 16, 1, true).translate(0, -30, 0).rotateZ(sx * Math.PI / 2), beamMat); beam.add(cone); }
    this.group.add(beam); this.beam = beam; this.nightGlow.push(beamMat);
    // bagan: panggung bambu dengan rangka & lampu-lampu terang yang menerangi air
    const BG = BAGAN; this.platform(BG.x, BG.z, BG.w, BG.d, BG.y, false, this.bamboo);
    const frame = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.07, 1, 5), this.bamboo, 24); let kf = 0;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.setMatrixAt(kf++, m.compose(V(BG.x + sx * (BG.w / 2 - 0.2), BG.y + 2.2, BG.z + sz * (BG.d / 2 - 0.2)), q.identity(), V(1, 4.4, 1)));
    for (const sz of [-1, 1]) frame.setMatrixAt(kf++, m.compose(V(BG.x, BG.y + 4.3, BG.z + sz * (BG.d / 2 - 0.2)), q.setFromAxisAngle(V(0, 0, 1), Math.PI / 2), V(1, BG.w, 1)));
    for (const sx of [-1, 1]) frame.setMatrixAt(kf++, m.compose(V(BG.x + sx * (BG.w / 2 - 0.2), BG.y + 4.3, BG.z), q.setFromAxisAngle(V(1, 0, 0), Math.PI / 2), V(1, BG.d, 1)));
    frame.count = kf; this.group.add(frame);
    const hutB = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), new THREE.MeshStandardMaterial({ map: woodTexture(128, 128, [140, 110, 70]), roughness: 0.9 })); hutB.position.set(BG.x, BG.y + 0.9, BG.z + 2.6); this.group.add(hutB);
    for (const [lx, lz] of [[-3, -3], [3, -3], [-3, 2], [3, 2], [0, -3.6]] as const) this.lamp(this.group, BG.x + lx, BG.y + 3.9, BG.z + lz, 0.16, 0xffffff);
    this.waterGlow(BG.x, BG.z - 2, 34, [255, 250, 225]);
    this.waterGlow(HPIER.x, HPIER.z1 - 3, 16, [255, 220, 170]);
    // kota di belakang: gedung berjendela (menyala malam), gudang, dan derek pelabuhan
    const winTex = canvasTex(64, 128, g => { g.fillStyle = '#1a1c20'; g.fillRect(0, 0, 64, 128); for (let y = 6; y < 128; y += 12) for (let x = 5; x < 64; x += 12) { g.fillStyle = Math.random() < 0.55 ? `rgb(255,${200 + Math.random() * 40},${120 + Math.random() * 60})` : '#26282c'; g.fillRect(x, y, 7, 7); } }, true);
    const bMat = new THREE.MeshStandardMaterial({ color: 0x8a8a8c, map: winTex, emissiveMap: winTex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8 }); this.windowMats.push(bMat);
    const nB = 70, bld = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), bMat, nB), c = new THREE.Color(); let kk = 0;
    for (let i = 0; i < nB * 2 && kk < nB; i++) {
      const x = -220 + r() * 440, z = 52 + r() * 130, w = 8 + r() * 14, d = 8 + r() * 12, h = (z > 100 ? 14 : 7) + r() * (z > 100 ? 40 : 14);
      if (Math.abs(x) < 20 && z < 70) continue;
      bld.setMatrixAt(kk, m.compose(V(x, groundH(x, z) - 0.2, z), q.setFromAxisAngle(V(0, 1, 0), (r() - 0.5) * 0.3), V(w, h, d)));
      bld.setColorAt(kk++, c.setHSL(0.08 + r() * 0.5, 0.08, 0.45 + r() * 0.3));
    }
    bld.count = kk; this.group.add(bld);
    // gudang di tepi promenade (di balik batas jalan) + derek pelabuhan
    for (const [x, col] of [[-70, 0x3a6a8a], [-38, 0x8a4a2a], [64, 0x4a6a4a]] as const) { const gd = new THREE.Mesh(new THREE.BoxGeometry(20, 7, 12), new THREE.MeshStandardMaterial({ color: col, roughness: 0.7, metalness: 0.2 })); gd.position.set(x, 1.5 + 3.5, 50); gd.castShadow = true; this.group.add(gd); }
    const crane = new THREE.Group(); crane.position.set(92, 1.5, QUAY_Z + 6);
    const yel = new THREE.MeshStandardMaterial({ color: 0xd8a020, roughness: 0.5, metalness: 0.3 });
    for (const sx of [-2.5, 2.5]) for (const sz of [-2.5, 2.5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 16, 0.5), yel); leg.position.set(sx, 8, sz); crane.add(leg); addObstacle(92 + sx, QUAY_Z + 6 + sz, 0.4); }
    const boom = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.4, 34), yel); boom.position.set(0, 16.5, -8); crane.add(boom);
    this.lamp(crane, 0, 17.4, -24.5, 0.14, 0xff3a2a); this.group.add(crane);
    this.sign(-12, 30, 1.5, 0, 'PELABUHAN NELAYAN', 'DERMAGA · PEMECAH OMBAK · BAGAN', 3.6);
  }

  // ======================= animasi =======================
  update(dt: number, time: number, night: number, focus: THREE.Vector3) {
    for (const s of this.spin) s.obj.rotation[s.axis] += s.speed * dt;
    for (const b of this.bob) b.obj.position.y = b.base + Math.sin(time * 1.3 + b.ph) * b.amp;
    for (const m of this.nightGlow) (m as THREE.MeshBasicMaterial).opacity = Math.max(0, night - 0.2) * (m === (this.beam ? ((this.beam.children[0] as THREE.Mesh).material) : null) ? 0.22 : 0.55);
    for (const w of this.windowMats) w.emissiveIntensity = Math.max(0, night - 0.15) * (w.emissiveMap ? 1.1 : 1.6);
    if (this.beam) this.beam.rotation.y = time * 0.9;
    for (const d of this.drift) {
      d.z = (d.z || 0); const span = d.x1 - d.x0, x = d.x0 + ((time * d.speed) % span + span) % span;
      d.obj.position.set(x, 0.05 + Math.sin(time * 1.4) * 0.04, gC(x) - gW(x) * 0.35); d.obj.rotation.y = Math.PI / 2 - Math.atan2(gC(x + 1) - gC(x), 1);
    }
    for (const [i, f] of this.mist.entries()) { f.position.x += dt * (0.6 + i * 0.1); if (f.position.x > focus.x + 200) f.position.x -= 400; (f.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(time * 0.1 + i); }
  }
}

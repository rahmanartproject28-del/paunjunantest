// Benda buatan: dermaga kayu, keramba apung (jaring, drum biru, pelampung oranye), pondok, batu tepi.
import * as THREE from 'three';
import { jukung } from './life';
import { IS_DANAU, LOC, PIER, BOAT, REEF, SUNGAI_BRIDGE_X, rivC, rivW, shoreZ, PADS, fbm, addObstacle, KERAMBA, groundH, lakeE, SPOT_PLACES, BRIDGES, bridgeH, HUTS, HUT, RAFT, GATE, LOKET, WARUNG, SKIOSK, DOCK, KERAMBA_DECK, shoreXZ } from './layout';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

function woodTexture(w = 256, h = 64, base = [120, 88, 58]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const grain = Math.sin(y * 0.55 + Math.sin(x * 0.02 + y * 0.05) * 1.4) * 0.5 + 0.5;
    const n = Math.random() * 0.14, k = 0.6 + grain * 0.22 + n;
    const i = (y * w + x) * 4;
    img.data[i] = base[0] * k; img.data[i + 1] = base[1] * k; img.data[i + 2] = base[2] * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // simpul kayu
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(40,25,15,0.35)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 5, 2.5, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function netTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!; g.strokeStyle = 'rgba(30,40,35,0.9)'; g.lineWidth = 2;
  for (let i = 0; i <= 64; i += 8) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 64); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(64, i); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

function signTexture(title: string, sub: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b1d12'; g.fillRect(0, 0, 512, 96);
  g.strokeStyle = '#d9b36a'; g.lineWidth = 5; g.strokeRect(6, 6, 500, 84);
  g.fillStyle = '#f5e2b0'; g.textAlign = 'center'; g.font = 'bold 42px system-ui, sans-serif'; g.fillText(title, 256, 52);
  g.fillStyle = '#d9b36a'; g.font = 'bold 20px system-ui, sans-serif'; g.fillText(sub, 256, 80);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function stripeTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 32;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? '#f2efe6' : '#1a8a6a'; g.fillRect(i * 16, 0, 16, 32); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Props {
  group = new THREE.Group();
  floaters: { obj: THREE.Object3D; base: number; ph: number }[] = [];
  lamps: THREE.Mesh[] = [];
  windows: THREE.MeshStandardMaterial[] = [];

  constructor(rocks: GLTF[]) {
    this.group.name = 'props';
    const plankTex = woodTexture();
    const plankMat = new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.85 });
    const darkWood = new THREE.MeshStandardMaterial({ map: woodTexture(128, 64, [80, 60, 42]), roughness: 0.9 });
    this.buildRocks(rocks);
    this.buildBridges();
    if (IS_DANAU) {
      this.buildDock(plankMat, darkWood);
      this.buildKeramba(plankMat, darkWood);
      this.buildBank(plankMat, darkWood);
      this.buildEntrance(plankMat, darkWood);
      this.buildRaft();
      this.buildDockLamps();
    } else if (LOC === 'sungai') this.buildSungai(rocks);
    else if (LOC === 'pantai') this.buildPantai(plankMat, darkWood, rocks);
    else if (LOC === 'laut') this.buildLaut();
    if (LOC === 'serene') this.buildKiosk(plankMat, darkWood);
  }

  /** Kios umpan kecil di lapangan Danau Serene: meja, rak umpan, tenda bergaris, papan nama, joran berdiri.
   *  Muka kios menghadap +X (jalan ke dermaga). Penjaga (NPC) ditempatkan main.ts di belakang meja. */
  private buildKiosk(plank: THREE.Material, dark: THREE.Material) {
    const K = SKIOSK, y = groundH(K.x, K.z);
    const W = new THREE.Group(); W.name = 'kiosk'; W.position.set(K.x, y, K.z); W.rotation.y = Math.PI / 2; // lokal +Z → dunia +X
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.8 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.3, 0.1), plank); back.position.set(0, 1.15, -0.9); back.castShadow = true;
    for (const sx of [-1.55, 1.55]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.45, 0.12), dark); post.position.set(sx, 1.22, 0.95); post.castShadow = true; W.add(post);
      const sd = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 1.8), plank); sd.position.set(sx, 0.5, 0); W.add(sd); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.95, 0.45), dark); counter.position.set(0, 0.475, 0.85); counter.castShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.6), plank); top.position.set(0, 0.98, 0.85);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.08, 2.4), roofMat); roof.position.set(0, 2.45, 0.05); roof.rotation.x = -0.12; roof.castShadow = true;
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 1.2), new THREE.MeshStandardMaterial({ map: stripeTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
    awn.position.set(0, 2.25, 1.45); awn.rotation.x = -Math.PI / 2 + 0.45; awn.castShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.45), new THREE.MeshStandardMaterial({ map: signTexture('WARUNG UMPAN', 'UMPAN · JORAN · SENAR'), roughness: 0.7 }));
    sign.position.set(0, 2.72, 1.18); sign.rotation.x = -0.1;
    // rak umpan warna-warni di dinding belakang + toples di meja
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.05, 0.32), plank);
    for (const sy of [1.2, 1.7]) { const sh = shelf.clone(); sh.position.set(0, sy, -0.7); W.add(sh); }
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.18, 0.18), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 20);
    const mm = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < 20; i++) { boxes.setMatrixAt(i, mm.makeTranslation(-1.25 + (i % 10) * 0.27, 1.32 + Math.floor(i / 10) * 0.5, -0.7)); boxes.setColorAt(i, col.setHSL((i * 0.137 + 0.05) % 1, 0.55, 0.5)); }
    const jars = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10), new THREE.MeshStandardMaterial({ color: 0xcfe3e8, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.75 }), 4);
    for (let i = 0; i < 4; i++) jars.setMatrixAt(i, mm.makeTranslation(-1.1 + i * 0.32, 1.11, 0.82));
    // joran berdiri di sudut kanan
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.2, 5), new THREE.MeshStandardMaterial({ color: [0xe2cf45, 0x2a2d33, 0x1f4f8a, 0xb03a2a][i], roughness: 0.4 }));
      r.position.set(1.3 - i * 0.07, 1.15, -0.65 + i * 0.05); r.rotation.z = 0.06; W.add(r);
    }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); lamp.position.set(0, 2.3, 0.7); this.lamps.push(lamp);
    W.add(back, counter, top, roof, awn, sign, boxes, jars, lamp);
    W.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh) m.receiveShadow = true; });
    this.group.add(W);
    // tabrakan: meja depan, dinding belakang, sisi (penjaga berdiri di dalam)
    for (let t = -1.4; t <= 1.41; t += 0.7) { addObstacle(K.x + 0.85, K.z + t, 0.32); addObstacle(K.x - 0.9, K.z + t, 0.3); }
    addObstacle(K.x, K.z - 1.55, 0.35); addObstacle(K.x, K.z + 1.55, 0.35);
  }

  /** Batu bulat bertekstur (displacement) — untuk batu besar sungai & karang. */
  private boulderGeo(r: number, seed: number) {
    const g = new THREE.IcosahedronGeometry(r, 3), p = g.attributes.position as THREE.BufferAttribute, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = fbm(v.x * 1.3 + seed, v.z * 1.3 + v.y * 0.7, 3); v.multiplyScalar(0.82 + n * 0.36); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g;
  }
  private rockInstances(n: number, pick: (i: number) => { x: number; z: number; s: number; y?: number } | null, color: number) {
    const g = this.boulderGeo(1, 3.3), im = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95 }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), c = new THREE.Color(); let k = 0;
    for (let i = 0; i < n * 4 && k < n; i++) {
      const o = pick(i); if (!o) continue;
      q.setFromEuler(new THREE.Euler(Math.random() * 0.4, Math.random() * 6.28, Math.random() * 0.4));
      im.setMatrixAt(k, m.compose(new THREE.Vector3(o.x, o.y ?? groundH(o.x, o.z) + o.s * 0.2, o.z), q, new THREE.Vector3(o.s * (0.9 + Math.random() * 0.4), o.s * (0.55 + Math.random() * 0.3), o.s)));
      im.setColorAt(k++, c.setHex(color).multiplyScalar(0.85 + Math.random() * 0.3));
    }
    im.count = k; im.castShadow = im.receiveShadow = true; this.group.add(im);
  }

  // ---------------- Sungai Deras ----------------
  private buildSungai(_rocks: GLTF[]) {
    // batu besar tempat berdiri spot S1 (puncak rata setinggi pijakan)
    const pad = PADS[0], g = this.boulderGeo(2.3, 7), p = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > 1.25) p.setY(i, 1.25 + (p.getY(i) - 1.25) * 0.08);
    g.computeVertexNormals();
    const big = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a8578, roughness: 0.95 }));
    big.position.set(pad.x, pad.y - 1.27, pad.z); big.scale.set(1, 1, 1); big.castShadow = big.receiveShadow = true; this.group.add(big);
    // bebatuan di arus & tepi (arus pecah di sekitarnya)
    this.rockInstances(46, (i) => {
      const x = -150 + ((i * 97.13) % 300), side = i % 3 === 0 ? 0 : i % 2 ? 1 : -1, e = side === 0 ? (Math.random() - 0.5) * 0.9 : side * (0.75 + Math.random() * 0.35);
      const z = rivC(x) + e * rivW(x); if (Math.abs(x - SUNGAI_BRIDGE_X) < 5) return null;
      if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 4)) return null;
      const s = side === 0 ? 0.6 + Math.random() * 0.9 : 0.4 + Math.random() * 1.2;
      return { x, z, s, y: Math.max(groundH(x, z), -1.2) + s * 0.35 };
    }, 0x7a766c);
    // jembatan gantung: menara kayu di tiap ujung + kabel melengkung
    const br = BRIDGES[0]; if (!br) return;
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.8 }), cable = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.5, metalness: 0.4 });
    const tops: THREE.Vector3[][] = [[], []];
    for (const [end, h0] of [[br.a, br.ha], [br.b, br.hb]] as const) for (const [si, sx] of [[0, -1], [1, 1]] as const) {
      const x = end.x + sx * (br.w / 2 + 0.15), H = br.y - h0 + 2.6;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, H, 8), wood); post.position.set(x, h0 + H / 2, end.z); post.castShadow = true; this.group.add(post);
      tops[si].push(new THREE.Vector3(x, h0 + H, end.z));
      addObstacle(x, end.z, 0.3);
    }
    for (const [t0, t1] of tops) {
      const mid = new THREE.Vector3().lerpVectors(t0, t1, 0.5); mid.y = br.y + 1.15;
      const curve = new THREE.QuadraticBezierCurve3(t0, mid.clone().setY(mid.y * 2 - (t0.y + t1.y) / 2), t1);
      this.group.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.025, 5, false), cable));
      // tali gantung vertikal
      for (let t = 0.08; t < 0.93; t += 0.07) { const q = curve.getPoint(t); const hang = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, Math.max(0.1, q.y - br.y), 3), cable); hang.position.set(q.x, (q.y + br.y) / 2, q.z); this.group.add(hang); }
    }
  }

  // ---------------- Pantai Karang ----------------
  private buildPantai(plank: THREE.Material, dark: THREE.Material, _rocks: GLTF[]) {
    // dermaga nelayan: papan di atas tiang-tiang kayu
    const L = PIER.z0 - PIER.z1, n = Math.ceil(L / 0.32);
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(PIER.w, 0.07, 0.28), plank, n), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) planks.setMatrixAt(i, m.makeTranslation(PIER.x + (Math.random() - 0.5) * 0.05, PIER.y - 0.035, PIER.z1 + (i + 0.5) * L / n));
    planks.receiveShadow = planks.castShadow = true; this.group.add(planks);
    const postG = new THREE.CylinderGeometry(0.11, 0.13, 1, 7);
    for (let z = PIER.z1 + 0.3; z < PIER.z0; z += 3) for (const sx of [-1, 1]) {
      const x = PIER.x + sx * (PIER.w / 2 - 0.1), bottom = Math.min(groundH(x, z), -0.2), H = PIER.y + 0.9 - bottom;
      const post = new THREE.Mesh(postG, dark); post.scale.y = H; post.position.set(x, bottom + H / 2, z); post.castShadow = true; this.group.add(post);
    }
    const railMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 1 });
    for (const sx of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, L), railMat); rail.position.set(PIER.x + sx * (PIER.w / 2 - 0.1), PIER.y + 0.85, (PIER.z0 + PIER.z1) / 2); this.group.add(rail); }
    this.addLampPost(this.group, PIER.x + PIER.w / 2 - 0.2, PIER.y, PIER.z1 + 1, 2.2);
    this.addLampPost(this.group, PIER.x - PIER.w / 2 + 0.2, PIER.y, (PIER.z0 + PIER.z1) / 2, 2.2);
    // karang: bebatuan gelap di sepanjang tanjung
    this.rockInstances(70, (i) => {
      const t = (i * 0.618) % 1, x = REEF.a.x + (REEF.b.x - REEF.a.x) * t, z = REEF.a.z + (REEF.b.z - REEF.a.z) * t;
      const off = (Math.random() - 0.5) * 2 * (REEF.w + 1.2), nx = -(REEF.b.z - REEF.a.z), nz = REEF.b.x - REEF.a.x, nl = Math.hypot(nx, nz);
      const px = x + nx / nl * off, pz = z + nz / nl * off;
      if (Math.abs(off) < 1.6 || SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - px, sp.pos.z - pz) < 2.2)) return null; // jalan setapak di tengah tetap bersih
      return { x: px, z: pz, s: 0.4 + Math.random() * 1.1 };
    }, 0x4a4640);
    // perahu nelayan: satu di pasir, satu tertambat di dermaga; gubuk nelayan
    const b1 = jukung(); b1.position.set(-10, groundH(-10, shoreZ(-10) + 3) + 0.15, shoreZ(-10) + 3); b1.rotation.y = 1.2; this.group.add(b1);
    const b2 = jukung(); b2.position.set(PIER.x + PIER.w / 2 + 1.1, 0.02, PIER.z1 + 12); this.group.add(b2);
    addObstacle(-10, shoreZ(-10) + 3, 2.4);
    const hx = 88, hz = shoreZ(88) + 14, hy = groundH(hx, hz);
    const hut = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.1, 2.8), new THREE.MeshStandardMaterial({ map: woodTexture(128, 128, [150, 118, 80]), roughness: 0.9 })); wall.position.y = 1.05;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.7, 1.3, 4), new THREE.MeshStandardMaterial({ color: 0x9a8a5a, roughness: 1 })); roof.position.y = 2.7; roof.rotation.y = Math.PI / 4; roof.scale.set(1.3, 1, 1.1);
    hut.add(wall, roof); hut.position.set(hx, hy, hz); hut.traverse(o => { o.castShadow = true; }); this.group.add(hut);
    addObstacle(hx, hz, 2.1);
  }

  // ---------------- Laut Dalam ----------------
  private buildLaut() {
    const B = BOAT, G = new THREE.Group(); G.position.set(B.x, 0, B.z);
    const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.55 }), blue = new THREE.MeshStandardMaterial({ color: 0x1f4f9a, roughness: 0.5 });
    const deckMat = new THREE.MeshStandardMaterial({ map: woodTexture(256, 64, [150, 110, 70]), roughness: 0.85, side: THREE.DoubleSide });
    // denah lambung (tampak atas): haluan runcing di −Z
    const outline = (inset: number) => { const s = new THREE.Shape(), w = B.w / 2 - inset, hl = B.l / 2 - inset;
      s.moveTo(-w, hl); s.lineTo(w, hl); s.lineTo(w, -hl + 3); s.quadraticCurveTo(w * 0.8, -hl - 1.2, 0, -hl - 2.2 + inset); s.quadraticCurveTo(-w * 0.8, -hl - 1.2, -w, -hl + 3); s.closePath(); return s; };
    const hullG = new THREE.ExtrudeGeometry(outline(0), { depth: 2.3, bevelEnabled: false }); hullG.rotateX(Math.PI / 2); // tebal ke bawah
    const hull = new THREE.Mesh(hullG, white); hull.position.y = B.y - 0.02; hull.castShadow = true; // tutup atas tepat di bawah dek
    const stripeG = new THREE.ExtrudeGeometry(outline(-0.02), { depth: 0.25, bevelEnabled: false }); stripeG.rotateX(Math.PI / 2);
    const stripe = new THREE.Mesh(stripeG, blue); stripe.position.y = B.y - 0.45;
    const deckG = new THREE.ShapeGeometry(outline(0.12)); deckG.rotateX(Math.PI / 2);
    const deck = new THREE.Mesh(deckG, deckMat); deck.position.y = B.y + 0.002; deck.receiveShadow = true;
    // pagar keliling
    const railMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: 0.7, roughness: 0.3 });
    const pts = outline(0.1).getPoints(40).map(p => new THREE.Vector3(p.x, B.y + 0.95, p.y));
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 120, 0.03, 5, true), railMat);
    const postG = new THREE.CylinderGeometry(0.022, 0.022, 0.95, 5);
    for (let i = 0; i < pts.length; i += 2) { const po = new THREE.Mesh(postG, railMat); po.position.set(pts[i].x, B.y + 0.475, pts[i].z); G.add(po); }
    // kabin (sesuai blok tak-bisa-dipijak di layout)
    const blk = PADS[0].block!;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(blk.w, 2.1, blk.d), white); cab.position.set(blk.x - B.x, B.y + 1.05, blk.z - B.z); cab.castShadow = true;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(blk.w + 0.4, 0.12, blk.d + 0.5), blue); roof.position.set(blk.x - B.x, B.y + 2.16, blk.z - B.z);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2a38, roughness: 0.15, metalness: 0.3 });
    const front = new THREE.Mesh(new THREE.PlaneGeometry(blk.w - 0.4, 0.7), winMat); front.position.set(blk.x - B.x, B.y + 1.5, blk.z - B.z - blk.d / 2 - 0.01); front.rotation.y = Math.PI;
    this.windows.push(winMat);
    // tiang antena, lampu tiang, pelampung, tempat joran di buritan
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), railMat); mast.position.set(blk.x - B.x, B.y + 3.8, blk.z - B.z);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2b0 })); lamp.position.set(blk.x - B.x, B.y + 5.45, blk.z - B.z); this.lamps.push(lamp);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.08, 8, 18), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 })); ring.position.set(blk.x - B.x + blk.w / 2 + 0.02, B.y + 1.3, blk.z - B.z); ring.rotation.y = Math.PI / 2;
    for (const sx of [-1.4, -0.5, 0.5, 1.4]) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6), railMat); h.position.set(sx, B.y + 1.1, B.l / 2 - 0.25); h.rotation.x = -0.4; G.add(h); }
    G.add(hull, stripe, deck, rail, cab, roof, front, mast, lamp, ring);
    G.traverse(o => { (o as THREE.Mesh).castShadow = true; });
    this.group.add(G);
    // kapal tidak diayun (pemain berdiri di dek); ombak memberi kesan bergerak
    // rumpon (tempat ikan berkumpul) terapung di dekat kapal
    const rp = new THREE.Group(); rp.position.set(-16, 0, -22);
    const bamb = new THREE.MeshStandardMaterial({ color: 0xb9a468, roughness: 0.8 });
    for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), bamb); b.rotation.z = Math.PI / 2; b.position.set(0, 0.05, -1 + i * 0.4); rp.add(b); }
    const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5), bamb); flagPole.position.y = 1.2;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshStandardMaterial({ color: 0xd8342a, side: THREE.DoubleSide })); flag.position.set(0.3, 2.2, 0);
    rp.add(flagPole, flag); this.group.add(rp); this.floaters.push({ obj: rp, base: 0, ph: 2.1 });
  }

  /** Tiga titian apung: papan bambu di atas drum, tali pegangan di kedua sisi. */
  private buildBridges() {
    const bamboo = new THREE.MeshStandardMaterial({ color: 0xb9a468, roughness: 0.75 });
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: 0.35 });
    const ropeMat = new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 1 });
    const plankGeo = new THREE.BoxGeometry(1, 0.05, 0.3);
    const drumGeo = new THREE.CylinderGeometry(0.27, 0.27, 0.8, 10).rotateZ(Math.PI / 2);
    const postGeo = new THREE.CylinderGeometry(0.03, 0.035, 1, 5);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const br of BRIDGES) {
      if (br.style === 'kayu') continue; // titian kayu Serene dibangun di serene.ts
      const dx = br.b.x - br.a.x, dz = br.b.z - br.a.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
      const nP = Math.ceil(len / 0.34), nD = Math.ceil(len / 2.4), nPost = Math.ceil(len / 2.4) + 1;
      const planks = new THREE.InstancedMesh(plankGeo, bamboo, nP);
      const drums = new THREE.InstancedMesh(drumGeo, drumMat, nD * 2);
      const posts = new THREE.InstancedMesh(postGeo, bamboo, nPost * 2);
      const col = new THREE.Color();
      for (let i = 0; i < nP; i++) {
        const t = (i + 0.5) / nP, y = bridgeH(br, t, len);
        const t2 = Math.min(1, t + 0.02), slope = Math.atan2(bridgeH(br, t2, len) - y, (t2 - t) * len || 1);
        q.setFromEuler(new THREE.Euler(-slope, yaw, (Math.random() - 0.5) * 0.02, 'YXZ'));
        planks.setMatrixAt(i, m.compose(p.set(br.a.x + dx * t, y - 0.025, br.a.z + dz * t), q, s.set(br.w, 1, 1)));
        planks.setColorAt(i, col.setHSL(0.13, 0.35, 0.55 + Math.random() * 0.15));
      }
      let kd = 0;
      for (let i = 0; i < nD; i++) {
        const t = (i + 0.5) / nD; if (br.style === 'gantung' || bridgeH(br, t, len) > br.y + 0.05) continue; // jembatan gantung & tanjakan tanpa drum
        for (const side of [-1, 1]) {
          const ox = Math.cos(yaw) * side * br.w * 0.3, oz = -Math.sin(yaw) * side * br.w * 0.3;
          drums.setMatrixAt(kd++, m.compose(p.set(br.a.x + dx * t + ox, 0.02, br.a.z + dz * t + oz), q.setFromAxisAngle(up, yaw), s.set(1, 1, 1)));
        }
      }
      drums.count = kd;
      const railPts: THREE.Vector3[][] = [[], []];
      let kp = 0;
      for (let i = 0; i < nPost; i++) {
        const t = i / (nPost - 1), y = bridgeH(br, t, len);
        [-1, 1].forEach((side, si) => {
          const ox = Math.cos(yaw) * side * (br.w / 2 - 0.05), oz = -Math.sin(yaw) * side * (br.w / 2 - 0.05);
          const x = br.a.x + dx * t + ox, z = br.a.z + dz * t + oz;
          posts.setMatrixAt(kp++, m.compose(p.set(x, y + 0.45, z), q.identity(), s.set(1, 0.95, 1)));
          railPts[si].push(new THREE.Vector3(x, y + 0.88, z));
        });
      }
      for (const pts of railPts) {
        const curve = new THREE.CatmullRomCurve3(pts);
        const rope = new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 3, 0.018, 4, false), ropeMat);
        this.group.add(rope);
      }
      planks.castShadow = planks.receiveShadow = true; posts.castShadow = true;
      [planks, drums, posts].forEach(o => { o.computeBoundingSphere(); this.group.add(o); });
    }
  }

  /** Halaman darat: gapura, loket tiket, Warung Pancing, jalan batu, lampu. */
  private buildEntrance(plank: THREE.Material, dark: THREE.Material) {
    const E = new THREE.Group(); E.name = 'entrance';
    const gy = groundH(GATE.x, GATE.z);
    const brick = new THREE.MeshStandardMaterial({ color: 0x9a4a32, roughness: 0.9 });
    const white = new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.8 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x4a2a1c, roughness: 0.75 });
    // gapura: dua tiang bata, balok atas, papan nama
    for (const sx of [-1, 1]) {
      const pil = new THREE.Mesh(new THREE.BoxGeometry(0.8, 3.4, 0.8), brick); pil.position.set(GATE.x + sx * 2.6, gy + 1.7, GATE.z); pil.castShadow = true;
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.8, 4), roofMat); cap.position.set(GATE.x + sx * 2.6, gy + 3.8, GATE.z); cap.rotation.y = Math.PI / 4; cap.castShadow = true;
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.14, 0.86), white); band.position.set(GATE.x + sx * 2.6, gy + 3.1, GATE.z);
      E.add(pil, cap, band);
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.35, 0.5), dark); beam.position.set(GATE.x, gy + 3.25, GATE.z); beam.castShadow = true;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 0.8), new THREE.MeshStandardMaterial({ map: signTexture('DANAU KERAMBA', 'PAUNJUNAN · MANCING'), roughness: 0.7 }));
    sign.position.set(GATE.x, gy + 2.7, GATE.z - 0.27); sign.rotation.y = Math.PI; // terbaca saat berjalan masuk (menghadap +Z)
    const sign2 = sign.clone(); sign2.position.z = GATE.z + 0.27; sign2.rotation.y = 0;
    E.add(beam, sign, sign2);
    // loket tiket
    const ly = groundH(LOKET.x, LOKET.z);
    const booth = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.3, 2), new THREE.MeshStandardMaterial({ map: woodTexture(128, 128, [170, 140, 96]), roughness: 0.85 }));
    booth.position.set(LOKET.x, ly + 1.15, LOKET.z); booth.castShadow = true; booth.receiveShadow = true;
    const bRoof = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.12, 2.6), roofMat); bRoof.position.set(LOKET.x, ly + 2.4, LOKET.z); bRoof.rotation.z = 0.08; bRoof.castShadow = true;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.2, metalness: 0.2 }));
    win.position.set(LOKET.x - 1.31, ly + 1.35, LOKET.z); win.rotation.y = -Math.PI / 2; this.windows.push(win.material as THREE.MeshStandardMaterial);
    const lsign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.36), new THREE.MeshStandardMaterial({ map: signTexture('LOKET', 'TIKET MASUK'), roughness: 0.7 }));
    lsign.position.set(LOKET.x - 1.32, ly + 2.0, LOKET.z); lsign.rotation.y = -Math.PI / 2;
    E.add(booth, bRoof, win, lsign);
    // Warung Pancing: kios terbuka dengan tenda bergaris, rak, joran tergantung
    const wy = groundH(WARUNG.x, WARUNG.z);
    const W = new THREE.Group(); W.position.set(WARUNG.x, wy, WARUNG.z); W.rotation.y = Math.PI / 2; // muka kios menghadap +X (jalan)
    const back = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.5, 0.12), plank); back.position.set(0, 1.25, -1.4); back.castShadow = true;
    const sideG = new THREE.BoxGeometry(0.12, 2.5, 2.9);
    for (const sx of [-2.05, 2.05]) { const sd = new THREE.Mesh(sideG, plank); sd.position.set(sx, 1.25, 0); sd.castShadow = true; W.add(sd); }
    const counter = new THREE.Mesh(new THREE.BoxGeometry(4.1, 1.0, 0.5), dark); counter.position.set(0, 0.5, 1.2); counter.castShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.06, 0.62), plank); top.position.set(0, 1.03, 1.2);
    const awn = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.8), new THREE.MeshStandardMaterial({ map: stripeTexture(), side: THREE.DoubleSide, roughness: 0.9 }));
    awn.position.set(0, 2.55, 1.35); awn.rotation.x = -Math.PI / 2 + 0.35; awn.castShadow = true;
    const roofW = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 3.1), roofMat); roofW.position.set(0, 2.52, -0.05);
    const wsign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.55), new THREE.MeshStandardMaterial({ map: signTexture('WARUNG PANCING', 'UMPAN · JORAN · SENAR'), roughness: 0.7 }));
    wsign.position.set(0, 2.95, 1.55); wsign.rotation.x = -0.1;
    // rak berisi kotak umpan warna-warni
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.05, 0.4), plank);
    const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.22, 0.2, 0.2), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 24);
    const mm = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < 24; i++) {
      const row = Math.floor(i / 12), x = -1.6 + (i % 12) * 0.29;
      boxes.setMatrixAt(i, mm.makeTranslation(x, 1.25 + row * 0.55, -1.15));
      boxes.setColorAt(i, col.setHSL((i * 0.137) % 1, 0.6, 0.5));
    }
    for (const y of [1.13, 1.68]) { const sh = shelf.clone(); sh.position.set(0, y, -1.15); W.add(sh); }
    // joran-joran berdiri di sudut
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.02, 2.3, 5), new THREE.MeshStandardMaterial({ color: [0xe2cf45, 0x2a2d33, 0x1f4f8a, 0xc9b690, 0xb03a2a][i], roughness: 0.4 }));
      r.position.set(1.7 - i * 0.07, 1.2, -1.1 + i * 0.05); r.rotation.z = 0.05; W.add(r);
    }
    const lampW = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); lampW.position.set(0, 2.35, 1.0); this.lamps.push(lampW);
    W.add(back, counter, top, awn, roofW, wsign, boxes, lampW);
    E.add(W);
    // jalan batu dari gapura ke dermaga
    const slabs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.5, 0.55, 0.12, 7), new THREE.MeshStandardMaterial({ color: 0x8c8878, roughness: 0.95 }), 60);
    let ks = 0;
    for (let z = GATE.z + 2; z > DOCK.z1 - 1.5 && ks < 60; z -= 0.75) for (const ox of [-0.55, 0.55]) {
      if (ks >= 60) break;
      const x = ox + Math.sin(z * 1.7) * 0.12;
      slabs.setMatrixAt(ks, mm.compose(new THREE.Vector3(x, groundH(x, z) + 0.02, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), z * 3.1), new THREE.Vector3(0.95 + Math.sin(z * 5) * 0.08, 1, 0.8)));
      slabs.setColorAt(ks++, col.setHSL(0.1, 0.06, 0.45 + Math.sin(z * 9) * 0.06));
    }
    slabs.count = ks; slabs.receiveShadow = true; E.add(slabs);
    // lampu jalan
    for (const [x, z] of [[-2.2, 27], [2.2, 21], [-2.2, 16]]) this.addLampPost(E, x, groundH(x, z), z);
    this.group.add(E);
  }

  private lampPostGeo?: { pole: THREE.BufferGeometry; mat: THREE.Material };
  private addLampPost(parent: THREE.Object3D, x: number, y: number, z: number, h = 2.6) {
    this.lampPostGeo ??= { pole: new THREE.CylinderGeometry(0.05, 0.07, 1, 6), mat: new THREE.MeshStandardMaterial({ color: 0x2a2d30, roughness: 0.6, metalness: 0.4 }) };
    const pole = new THREE.Mesh(this.lampPostGeo.pole, this.lampPostGeo.mat); pole.scale.y = h; pole.position.set(x, y + h / 2, z); pole.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
    head.position.set(x, y + h + 0.05, z); this.lamps.push(head);
    parent.add(pole, head);
  }

  private buildDockLamps() {
    for (const z of [11, 5, -1]) this.addLampPost(this.group, DOCK.x0 - 0.02, DOCK.y, z, 1.9);
    // lampu di ujung titian yang menempel keramba
    for (const br of BRIDGES) this.addLampPost(this.group, br.b.x + 0.7, KERAMBA_DECK, br.b.z + 0.5, 1.9);
  }

  /** Rakit rumput mengapung dengan jajaran batang bambu di depannya. */
  private buildRaft() {
    const R = new THREE.Group(); R.position.set(RAFT.x, 0, RAFT.z); R.rotation.y = RAFT.yaw;
    const base = new THREE.Mesh(new THREE.BoxGeometry(RAFT.w, 0.22, RAFT.len), new THREE.MeshStandardMaterial({ color: 0x5a6a2e, roughness: 1 }));
    base.position.y = 0.03; base.receiveShadow = true; R.add(base);
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.22, 0.7, 5).translate(0, 0.35, 0), new THREE.MeshLambertMaterial({ color: 0x6f8f3a }), 70);
    const mm = new THREE.Matrix4(), col = new THREE.Color();
    for (let i = 0; i < 70; i++) {
      const x = (Math.random() - 0.5) * RAFT.w * 0.9, z = (Math.random() - 0.5) * RAFT.len * 0.95, sc = 0.6 + Math.random() * 0.9;
      tuft.setMatrixAt(i, mm.compose(new THREE.Vector3(x, 0.12, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc * (0.8 + Math.random() * 0.7), sc)));
      tuft.setColorAt(i, col.setHSL(0.2 + Math.random() * 0.06, 0.45, 0.32 + Math.random() * 0.15));
    }
    R.add(tuft);
    const bam = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.04, 0.05, 2.6, 5), new THREE.MeshStandardMaterial({ color: 0xa89a5a, roughness: 0.7 }), 12);
    for (let i = 0; i < 12; i++) bam.setMatrixAt(i, mm.makeTranslation(RAFT.w / 2 + 0.6, 0.6, -RAFT.len / 2 + i * RAFT.len / 11));
    R.add(bam);
    this.group.add(R);
    this.floaters.push({ obj: R, base: 0, ph: 1.7 });
  }

  /** Dermaga A1: papan kayu memanjang ke danau dengan tiang, plus bangku & kotak pancing. */
  private buildDock(plank: THREE.Material, post: THREE.Material) {
    const D = new THREE.Group(); D.name = 'dock';
    const deckY = SPOT_PLACES[0].deck;
    const len = 18, w = 2.4, z0 = 14, z1 = z0 - len;
    const plankGeo = new THREE.BoxGeometry(w, 0.06, 0.26);
    const n = Math.floor(len / 0.3);
    const planks = new THREE.InstancedMesh(plankGeo, plank, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.015);
      m.compose(p.set((Math.random() - 0.5) * 0.04, deckY - 0.03 + (Math.random() - 0.5) * 0.012, z0 - i * 0.3), q, s.set(1 - Math.random() * 0.04, 1, 1));
      planks.setMatrixAt(i, m);
      planks.setColorAt(i, new THREE.Color().setHSL(0.07, 0.3, 0.55 + Math.random() * 0.2));
    }
    planks.castShadow = planks.receiveShadow = true;
    D.add(planks);
    const beamGeo = new THREE.BoxGeometry(0.14, 0.18, len);
    for (const x of [-w / 2 + 0.1, w / 2 - 0.1, 0]) { const b = new THREE.Mesh(beamGeo, post); b.position.set(x, deckY - 0.15, (z0 + z1) / 2); b.castShadow = true; D.add(b); }
    const postGeo = new THREE.CylinderGeometry(0.09, 0.11, 3.2, 7);
    for (let z = z0; z >= z1 - 0.01; z -= 2.5) for (const x of [-w / 2, w / 2]) {
      const pp = new THREE.Mesh(postGeo, post); pp.position.set(x, deckY - 1.3, z); pp.castShadow = true; D.add(pp);
    }
    // tiang tambat di ujung dermaga menjulang sedikit
    for (const x of [-w / 2, w / 2]) { const pp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 1.1, 7), post); pp.position.set(x, deckY + 0.4, z1 + 0.05); pp.castShadow = true; D.add(pp); }
    // kotak pancing (tackle box) & ember
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 0.5 }));
    box.position.set(-0.75, deckY + 0.15, 1.6); box.rotation.y = 0.3; box.castShadow = true; D.add(box);
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.32), new THREE.MeshStandardMaterial({ color: 0x1f4d35 })); lid.position.set(0, 0.17, 0); box.add(lid);
    const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.32, 14, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a78c0, roughness: 0.4, side: THREE.DoubleSide }));
    bucket.position.set(0.8, deckY + 0.16, 2.3); bucket.castShadow = true; D.add(bucket);
    this.group.add(D);
  }

  /** Keramba apung: rangka kayu di atas drum biru, jaring, pelampung oranye, dan pondok jaga. */
  private buildKeramba(plank: THREE.Material, post: THREE.Material) {
    const K = new THREE.Group(); K.name = 'keramba';
    const { x0, x1, z0, z1, cell } = KERAMBA;
    const walkGeo = new THREE.BoxGeometry(1, 0.08, 0.55);
    const walks: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
    const deck = 0.42;
    for (let z = z1; z >= z0 - 0.01; z -= cell) walks.push(new THREE.Matrix4().compose(p.set((x0 + x1) / 2, deck - 0.04, z), q.identity(), s.set(x1 - x0, 1, 1)));
    for (let x = x0; x <= x1 + 0.01; x += cell) walks.push(new THREE.Matrix4().compose(p.set(x, deck - 0.04, (z0 + z1) / 2), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2), s.set(z1 - z0, 1, 0.8)));
    const wm = new THREE.InstancedMesh(walkGeo, plank, walks.length);
    walks.forEach((mm, i) => wm.setMatrixAt(i, mm)); wm.castShadow = wm.receiveShadow = true; K.add(wm);
    // drum biru pelampung di setiap persimpangan
    const drumGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.85, 12).rotateZ(Math.PI / 2);
    const drumMat = new THREE.MeshStandardMaterial({ color: 0x1f5fb0, roughness: 0.35 });
    const pts: [number, number][] = [];
    for (let x = x0; x <= x1 + 0.01; x += cell) for (let z = z1; z >= z0 - 0.01; z -= cell) pts.push([x, z]);
    const drums = new THREE.InstancedMesh(drumGeo, drumMat, pts.length);
    pts.forEach(([x, z], i) => { drums.setMatrixAt(i, m.compose(p.set(x, 0.06, z), q.identity(), s.set(1, 1, 1))); });
    drums.castShadow = true; K.add(drums);
    // jaring: dinding transparan di tiap petak
    const net = new THREE.MeshStandardMaterial({ map: netTexture(), transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, roughness: 1 });
    (net.map as THREE.Texture).repeat.set((x1 - x0) / 0.5, 3);
    for (let z = z1; z >= z0 - 0.01; z -= cell) { const n = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, 1.1), net); n.position.set((x0 + x1) / 2, -0.2, z); K.add(n); }
    // pelampung oranye kecil
    const buoyGeo = new THREE.SphereGeometry(0.11, 8, 6);
    const buoys = new THREE.InstancedMesh(buoyGeo, new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4 }), 60);
    for (let i = 0; i < 60; i++) {
      const edge = i % 4, t = (i / 60) * 4 % 1;
      const x = edge === 0 ? x0 + (x1 - x0) * t : edge === 1 ? x1 + 0.6 : edge === 2 ? x0 + (x1 - x0) * t : x0 - 0.6;
      const z = edge === 0 ? z1 + 0.6 : edge === 1 ? z0 + (z1 - z0) * t : edge === 2 ? z0 - 0.6 : z0 + (z1 - z0) * t;
      buoys.setMatrixAt(i, m.compose(p.set(x, 0.05, z), q.identity(), s.set(1, 1, 1)));
    }
    K.add(buoys);
    // 7 pondok jaga beratap, masing-masing di atas lantai papan yang bisa dipijak
    const hutWall = new THREE.MeshStandardMaterial({ map: woodTexture(128, 128, [150, 118, 80]), roughness: 0.9 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x8a3a24, roughness: 0.7 });
    const floorGeo = new THREE.BoxGeometry(HUT.floor * 2, 0.08, HUT.floor * 2);
    const bodyGeo = new THREE.BoxGeometry(HUT.body[0] * 2, 2.1, HUT.body[1] * 2);
    const roofGeo = new THREE.ConeGeometry(2.4, 1.1, 4, 1);
    const doorGeo = new THREE.PlaneGeometry(0.8, 1.6), doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2618, roughness: 0.9 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x1a2a30, emissive: 0x000000, roughness: 0.3 });
    HUTS.forEach((h, i) => {
      const hut = new THREE.Group();
      const floor = new THREE.Mesh(floorGeo, plank); floor.position.y = deck - 0.04; floor.receiveShadow = true;
      const body = new THREE.Mesh(bodyGeo, hutWall); body.position.y = deck + 1.05; body.castShadow = true;
      const roof = new THREE.Mesh(roofGeo, roofMat); roof.position.y = deck + 2.65; roof.rotation.y = Math.PI / 4; roof.scale.set(1.35, 1, 1.1); roof.castShadow = true;
      const door = new THREE.Mesh(doorGeo, doorMat); door.position.set(0, deck + 0.8, HUT.body[1] + 0.01);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), winMat.clone()); win.position.set(HUT.body[0] + 0.01, deck + 1.3, 0); win.rotation.y = Math.PI / 2;
      this.windows.push(win.material as THREE.MeshStandardMaterial);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
      lamp.position.set(0, deck + 2.05, HUT.body[1] + 0.12); this.lamps.push(lamp);
      hut.add(floor, body, roof, door, win, lamp); hut.position.set(h.x, 0, h.z); hut.rotation.y = i % 2 ? Math.PI : 0; K.add(hut);
    });
    this.group.add(K);
    this.floaters.push({ obj: K, base: 0, ph: 0 });
    // tiang bambu di tepi keramba
    const bamboo = new THREE.MeshStandardMaterial({ color: 0xa89a5a, roughness: 0.7 });
    for (let i = 0; i < 8; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 3.2, 6), bamboo); b.position.set(x0 + i * (x1 - x0) / 7, 1.0, z1 + 0.2); K.add(b); }
    void post;
  }

  /** Tepian C2: papan kecil untuk berdiri di tepi rumput. */
  private buildBank(plank: THREE.Material, _post: THREE.Material) {
    const sp = SPOT_PLACES[2];
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 1.4), plank);
    g.position.set(sp.pos.x, groundH(sp.pos.x, sp.pos.z) + 0.05, sp.pos.z); g.rotation.y = sp.yaw; g.receiveShadow = true;
    this.group.add(g);
  }

  private buildRocks(rocks: GLTF[]) {
    const geos: { g: THREE.BufferGeometry; m: THREE.Material }[] = [];
    for (const r of rocks) r.scene.traverse(o => { const mm = o as THREE.Mesh; if (mm.isMesh) geos.push({ g: mm.geometry, m: mm.material as THREE.Material }); });
    if (!geos.length) return;
    let seed = 5; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const per = 12;
    geos.forEach(({ g, m }) => {
      const im = new THREE.InstancedMesh(g, m, per);
      const mm = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      let k = 0, tries = 0;
      while (k < per && tries++ < 2000) {
        const a = r() * 6.28, e = 0.99 + r() * 0.06;
        const { x, z } = shoreXZ(a, e);
        if (lakeE(x, z) < 0.985) continue;
        if (SPOT_PLACES.some(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 4) || (Math.abs(x) < 3 && z > -4)) continue;
        const sc = 0.12 + r() * 0.35;
        if (lakeE(x, z) > 0.995 && sc > 0.25) addObstacle(x, z, sc * 0.55);
        im.setMatrixAt(k++, mm.compose(p.set(x, groundH(x, z) - sc * 0.6, z), q.setFromEuler(new THREE.Euler(r() * 3, r() * 3, r() * 3)), s.setScalar(sc)));
      }
      im.count = k; im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere();
      this.group.add(im);
    });
  }

  update(time: number, night: number) {
    for (const f of this.floaters) f.obj.position.y = Math.sin(time * 0.9 + f.ph) * 0.03;
    for (const l of this.lamps) (l.material as THREE.MeshBasicMaterial).color.setRGB(0.55 + night * 0.45, 0.5 + night * 0.35, 0.38 + night * 0.15); // hangat, tidak putih menyilaukan
    for (const w of this.windows) w.emissive.setRGB(0.9 * night, 0.6 * night, 0.25 * night);
  }
}

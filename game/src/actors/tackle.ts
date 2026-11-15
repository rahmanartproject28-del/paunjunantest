// Joran yang melengkung sesuai beban, reel spinning yang berputar, senar, dan pelampung.
import * as THREE from 'three';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const ROD_LEN = 2.7, BUTT = 0.42, N = 22, RAD = 8;
/** Ring pemandu joran spinning 2,7 m: jarak dari pegangan (m) & jari-jari ring (m), besar dekat reel → kecil di ujung. */
const GUIDES: [number, number][] = [[0.64, 0.0125], [0.93, 0.0092], [1.19, 0.0068], [1.43, 0.0053], [1.65, 0.0044], [1.86, 0.0038], [2.06, 0.0033], [2.25, 0.003], [2.44, 0.0028]];

/** Tekstur prosedural kecil (dibuat sekali). */
const texCache: Record<string, THREE.CanvasTexture> = {};
function tex(name: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  if (texCache[name]) return texCache[name];
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return (texCache[name] = t);
}
const corkTex = () => tex('cork', 64, 64, g => { for (let i = 0; i < 64 * 64; i++) { const v = 150 + Math.random() * 70; g.fillStyle = `rgb(${v},${v * 0.76},${v * 0.52})`; g.fillRect(i % 64, (i / 64) | 0, 1, 1); } for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(90,60,30,.5)'; g.fillRect(Math.random() * 64, Math.random() * 64, 2 + Math.random() * 3, 1 + Math.random() * 2); } });
const evaTex = () => tex('eva', 64, 64, g => { g.fillStyle = '#1b1c1f'; g.fillRect(0, 0, 64, 64); for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 64, 1, 1); } });
const lineTex = () => tex('spoolLine', 64, 16, g => { g.fillStyle = '#d8e8c8'; g.fillRect(0, 0, 64, 16); for (let y = 0; y < 16; y += 2) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, y, 64, 1); } });

/** Satu ring pemandu (ruang satuan): ring logam + sisipan keramik + kaki rangka + lilitan benang di kaki. */
function guideGeometry() {
  const col = (geo: THREE.BufferGeometry, c: [number, number, number]) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set(c, i * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); return geo; };
  const frame = col(new THREE.TorusGeometry(1, 0.13, 6, 18), [0.8, 0.82, 0.86]);
  const insert = col(new THREE.TorusGeometry(0.84, 0.1, 5, 18), [0.16, 0.17, 0.2]);                 // keramik SiC abu gelap
  const legL = col(new THREE.CylinderGeometry(0.07, 0.09, 1.25, 5).rotateZ(0.35).translate(-0.3, 1.55, 0), [0.8, 0.82, 0.86]);
  const legR = col(new THREE.CylinderGeometry(0.07, 0.09, 1.25, 5).rotateZ(-0.35).translate(0.3, 1.55, 0), [0.8, 0.82, 0.86]);
  const foot = col(new THREE.BoxGeometry(0.35, 0.08, 1.6).translate(0, 2.18, 0), [0.8, 0.82, 0.86]);
  const wrap = col(new THREE.CylinderGeometry(0.62, 0.62, 2.2, 8, 1, true).rotateX(Math.PI / 2).translate(0, 2.55, 0), [0.07, 0.07, 0.08]); // lilitan benang
  return mergeGeometries([frame, insert, legL, legR, foot, wrap])!;
}

/** Profil putar (lathe) di sepanjang sumbu Z: [z, r] berpasangan. */
function latheZ(pts: [number, number][], seg = 16) {
  const g = new THREE.LatheGeometry(pts.map(([z, r]) => new THREE.Vector2(r, z)), seg);
  return g.rotateX(Math.PI / 2);  // sumbu lathe (Y) → Z
}

export class Rod {
  group = new THREE.Group();
  blank: THREE.Mesh;
  handle: THREE.Group;
  reel = new THREE.Group();
  reelHandle = new THREE.Group();
  knob: THREE.Mesh;
  bail: THREE.Mesh;
  guides: THREE.InstancedMesh;
  /** titik tengah garis joran (dunia), 0 = pegangan, N = ujung */
  pts: THREE.Vector3[] = Array.from({ length: N + 1 }, () => new THREE.Vector3());
  tip = new THREE.Vector3();
  private pos: Float32Array;
  private blankMat: THREE.MeshStandardMaterial;

  constructor(color = '#e2cf45') {
    this.group.name = 'rod';
    // batang (blank): tabung meruncing yang titik-titiknya diperbarui tiap gambar, pernis mengkilap
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array((N + 1) * RAD * 3);
    const idx: number[] = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < RAD; j++) {
      const a = i * RAD + j, b = i * RAD + (j + 1) % RAD, c = (i + 1) * RAD + j, d = (i + 1) * RAD + (j + 1) % RAD;
      idx.push(a, c, b, b, c, d);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setIndex(idx);
    this.blankMat = new THREE.MeshStandardMaterial({ color, roughness: 0.16, metalness: 0.3, envMapIntensity: 1.3 });
    this.blank = new THREE.Mesh(g, this.blankMat);
    this.blank.frustumCulled = false;
    this.blank.castShadow = true;

    // gagang terbelah (sumbu +Z = ke ujung): EVA belakang · reel seat logam · gabus depan · winding check
    this.handle = new THREE.Group();
    const eva = new THREE.MeshStandardMaterial({ map: evaTex(), roughness: 0.85 });
    const cork = new THREE.MeshStandardMaterial({ map: corkTex(), roughness: 0.9 });
    const gun = new THREE.MeshStandardMaterial({ color: 0x2a2c31, metalness: 0.85, roughness: 0.28 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc9a23a, metalness: 0.9, roughness: 0.25 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.7 });
    const rear = new THREE.Mesh(latheZ([[-BUTT + 0.012, 0.0001], [-BUTT + 0.012, 0.0145], [-BUTT + 0.03, 0.0158], [-0.2, 0.0152], [-0.09, 0.0135], [-0.075, 0.0128], [-0.075, 0.0001]]), eva);
    const butt = new THREE.Mesh(latheZ([[-BUTT, 0.0001], [-BUTT, 0.012], [-BUTT + 0.006, 0.0155], [-BUTT + 0.014, 0.0158], [-BUTT + 0.014, 0.0001]]), rubber);
    const seat = new THREE.Mesh(latheZ([[-0.075, 0.0118], [-0.068, 0.0126], [0.058, 0.0126], [0.066, 0.0118]], 14), gun);
    const hoodA = new THREE.Mesh(latheZ([[-0.07, 0.0138], [-0.052, 0.0138]], 14), gun), hoodB = new THREE.Mesh(latheZ([[0.04, 0.0138], [0.062, 0.0138]], 14), gun);
    const ring1 = new THREE.Mesh(latheZ([[-0.052, 0.0141], [-0.049, 0.0141]], 14), trim), ring2 = new THREE.Mesh(latheZ([[0.037, 0.0141], [0.04, 0.0141]], 14), trim);
    // ulir pengunci reel seat
    const thread = new THREE.Mesh(new THREE.TorusGeometry(0.0131, 0.0009, 4, 14), gun);
    const threads = [0.046, 0.05, 0.054].map(z => { const t = thread.clone(); t.position.z = z; return t; });
    const fore = new THREE.Mesh(latheZ([[0.066, 0.0001], [0.066, 0.0128], [0.08, 0.0134], [0.2, 0.0118], [0.222, 0.0106], [0.222, 0.0001]]), cork);
    const check = new THREE.Mesh(latheZ([[0.222, 0.0104], [0.232, 0.0094], [0.24, 0.0082]], 12), trim);
    this.handle.add(rear, butt, seat, hoodA, hoodB, ring1, ring2, ...threads, fore, check);

    // reel spinning menggantung di bawah reel seat (sumbu +Z = ke depan)
    const graphite = new THREE.MeshStandardMaterial({ color: 0x25272c, metalness: 0.6, roughness: 0.32 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xcfd3d8, metalness: 0.95, roughness: 0.2 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xd4a93a, metalness: 0.9, roughness: 0.22 });
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.004, 0.06), graphite); foot.position.set(0, -0.0135, 0);
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.009, 0.062, 0.022), graphite); stem.position.set(0, -0.045, -0.004); stem.rotation.x = 0.12;
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12).scale(0.026, 0.034, 0.042), graphite); body.position.set(0, -0.092, -0.012);
    const sideCap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 16).rotateZ(Math.PI / 2), gold); sideCap.position.set(0.026, -0.092, -0.012);
    const rotor = new THREE.Mesh(latheZ([[0.012, 0.018], [0.022, 0.031], [0.045, 0.031], [0.048, 0.027]], 18), graphite); rotor.position.set(0, -0.092, 0); (rotor.material as THREE.Material).side = THREE.DoubleSide;
    const spool = new THREE.Mesh(latheZ([[0.046, 0.024], [0.05, 0.03], [0.052, 0.0285], [0.078, 0.0285], [0.08, 0.034], [0.084, 0.034], [0.086, 0.02]], 20), silver); spool.position.set(0, -0.092, 0);
    const lineOn = new THREE.Mesh(new THREE.CylinderGeometry(0.0305, 0.0305, 0.025, 20, 1, true).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ map: lineTex(), roughness: 0.5 })); lineOn.position.set(0, -0.092, 0.065);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0022, 6, 22), gold); lip.position.set(0, -0.092, 0.082);
    const drag = new THREE.Mesh(latheZ([[0.086, 0.014], [0.092, 0.0145], [0.1, 0.012], [0.102, 0.0001]], 14), graphite); drag.position.set(0, -0.092, 0);
    this.bail = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.0018, 5, 20, Math.PI * 1.05), silver); this.bail.position.set(0, -0.092, 0.058); this.bail.rotation.z = -0.3;
    const roller = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.006, 8), gold); roller.position.set(0.034, -0.08, 0.058);
    this.reelHandle.position.set(0.03, -0.092, -0.012);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02, 6).rotateZ(Math.PI / 2), silver); shaft.position.set(0.01, 0, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.052, 0.009), silver); arm.position.set(0.02, -0.024, 0);
    this.knob = new THREE.Mesh(latheZ([[-0.012, 0.004], [-0.01, 0.0085], [0.01, 0.0085], [0.012, 0.004]], 10).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ map: evaTex(), roughness: 0.8 }));
    this.knob.position.set(0.034, -0.048, 0);
    this.reelHandle.add(shaft, arm, this.knob);
    this.reel.add(foot, stem, body, sideCap, rotor, spool, lineOn, lip, drag, this.bail, roller, this.reelHandle);
    this.reel.traverse(o => { o.castShadow = true; });
    this.handle.add(this.reel);
    this.handle.traverse(o => { o.castShadow = true; });

    // ring pemandu (8 ring + tip-top) dalam satu InstancedMesh
    this.guides = new THREE.InstancedMesh(guideGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.85, roughness: 0.28 }), GUIDES.length);
    this.guides.frustumCulled = false; this.guides.castShadow = true;
    this.group.add(this.blank, this.handle, this.guides);
  }

  setColor(c: string) { this.blankMat.color.set(c); }

  /**
   * Hitung ulang bentuk joran.
   * grip: posisi pegangan (dunia); q: orientasi joran (sumbu +Z lokal = arah ujung).
   * load: vektor beban dari ujung (arah tarikan senar) dikali besar lengkungan (0..1,5).
   */
  update(grip: THREE.Vector3, q: THREE.Quaternion, load: THREE.Vector3, reelAngle: number) {
    this.handle.position.copy(grip); this.handle.quaternion.copy(q);
    this.reelHandle.rotation.z = reelAngle;
    const dir0 = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up0 = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const bendAmt = Math.min(1.6, load.length());
    const bendDir = load.lengthSq() > 1e-6 ? load.clone().normalize() : dir0.clone();
    // sumbu putar lengkungan: tegak lurus arah joran & arah beban
    let axis = new THREE.Vector3().crossVectors(dir0, bendDir);
    if (axis.lengthSq() < 1e-6) axis = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
    axis.normalize();
    const angBetween = dir0.angleTo(bendDir);
    const total = Math.min(angBetween * 0.95, bendAmt * 1.25);
    const segLen = (ROD_LEN - 0.25) / N;
    const p = new THREE.Vector3().copy(grip).addScaledVector(dir0, 0.25);
    const d = dir0.clone();
    const rq = new THREE.Quaternion();
    let prevAng = 0;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      this.pts[i].copy(p);
      // sudut kumulatif ~ s^2.2: pangkal kaku, ujung paling lentur
      const ang = total * Math.pow(s, 2.2);
      rq.setFromAxisAngle(axis, ang - prevAng); prevAng = ang;
      d.applyQuaternion(rq);
      p.addScaledVector(d, segLen);
    }
    this.tip.copy(this.pts[N]);
    // bangun tabung
    const t = new THREE.Vector3(), n = new THREE.Vector3(), b = new THREE.Vector3(), v = new THREE.Vector3();
    n.copy(up0);
    for (let i = 0; i <= N; i++) {
      const a = this.pts[Math.max(0, i - 1)], c = this.pts[Math.min(N, i + 1)];
      t.subVectors(c, a).normalize();
      n.addScaledVector(t, -n.dot(t)).normalize();
      b.crossVectors(t, n);
      const r = 0.00115 + 0.0058 * Math.pow(1 - i / N, 1.35);   // runcing halus: 13 mm di pangkal → 2,3 mm di ujung
      for (let j = 0; j < RAD; j++) {
        const th = (j / RAD) * Math.PI * 2;
        v.copy(this.pts[i]).addScaledVector(n, Math.cos(th) * r).addScaledVector(b, Math.sin(th) * r);
        const k = (i * RAD + j) * 3; this.pos[k] = v.x; this.pos[k + 1] = v.y; this.pos[k + 2] = v.z;
      }
    }
    const ga = this.blank.geometry.attributes.position as THREE.BufferAttribute; ga.needsUpdate = true;
    this.blank.geometry.computeVertexNormals();
    this.blank.geometry.computeBoundingSphere();
    // ring pemandu di bawah joran, menempel lewat kaki rangka (jarak renggang sebanding ukuran ring)
    const m = new THREE.Matrix4(), s3 = new THREE.Vector3(), qq = new THREE.Quaternion(), segL = (ROD_LEN - 0.25) / N;
    GUIDES.forEach(([dist, r], k) => {
      const f = Math.min(N - 0.001, Math.max(0, (dist - 0.25) / segL)), i0 = Math.floor(f), u = f - i0;
      const at = new THREE.Vector3().lerpVectors(this.pts[i0], this.pts[i0 + 1], u);
      t.subVectors(this.pts[i0 + 1], this.pts[i0]).normalize();
      const down = new THREE.Vector3().copy(up0).addScaledVector(t, -up0.dot(t)).normalize().multiplyScalar(-1);
      const rodR = 0.00115 + 0.0058 * Math.pow(1 - f / N, 1.35);
      // orientasi: sumbu Z satuan → arah joran, sumbu Y satuan (kaki) → ke atas (lawan 'down')
      const zAx = t.clone(), yAx = down.clone().negate(), xAx = new THREE.Vector3().crossVectors(yAx, zAx).normalize();
      qq.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAx, yAx.clone().crossVectors(zAx, xAx), zAx));
      const stand = k === GUIDES.length - 1 ? r * 1.25 : r * 2.2 + rodR * 0.6;
      m.compose(v.copy(at).addScaledVector(down, stand), qq, s3.setScalar(r));
      this.guides.setMatrixAt(k, m);
    });
    this.guides.instanceMatrix.needsUpdate = true;
  }
}

/** Senar dari ujung joran ke pelampung/ikan, melengkung kendur saat tegangan rendah.
 *  Digambar sebagai garis tebal (±1,6 px) supaya tetap terlihat di layar HP. */
export class FishingLine {
  line: Line2;
  private arr: Float32Array;
  private n = 32;
  private geo = new LineGeometry();
  static mats: LineMaterial[] = [];
  constructor() {
    this.arr = new Float32Array(this.n * 3);
    this.geo.setPositions(this.arr);
    const mat = new LineMaterial({ color: 0xf6f3e8, linewidth: 1.6, transparent: true, opacity: 0.9, worldUnits: false });
    mat.resolution.set(innerWidth, innerHeight);
    FishingLine.mats.push(mat);
    this.line = new Line2(this.geo, mat);
    this.line.frustumCulled = false;
  }
  static resize(w: number, h: number) { for (const m of FishingLine.mats) m.resolution.set(w, h); }
  /** sag: lendutan (m) di tengah. */
  set(a: THREE.Vector3, b: THREE.Vector3, sag: number, wind = 0) {
    const mid = new THREE.Vector3().lerpVectors(a, b, 0.5);
    mid.y -= sag; mid.x += wind * sag * 0.3;
    for (let i = 0; i < this.n; i++) {
      const t = i / (this.n - 1), u = 1 - t;
      const x = u * u * a.x + 2 * u * t * mid.x + t * t * b.x;
      let y = u * u * a.y + 2 * u * t * mid.y + t * t * b.y;
      const z = u * u * a.z + 2 * u * t * mid.z + t * t * b.z;
      if (y < 0 && t < 0.98) y = Math.max(y, -0.02 - (t - 0.8) * 2); // senar menempel permukaan air
      this.arr[i * 3] = x; this.arr[i * 3 + 1] = y; this.arr[i * 3 + 2] = z;
    }
    this.geo.setPositions(this.arr);
  }
}

/** Pelampung bentuk pir dua warna dengan antena. */
/**
 * Pelampung stik gaya pemancingan Indonesia: badan ramping berlapis warna (sebagian besar di bawah air),
 * antena bergaris oranye–kuning–hitam, ujung fluoresen (terang malam hari), dan pemberat timah di bawahnya.
 * Titik (0,0,0) = garis air: yang menonjol di atas air hanya antena, seperti pelampung sungguhan.
 */
export function makeFloat() {
  const g = new THREE.Group();
  const prof: [number, number][] = [[-0.118, 0.0001], [-0.118, 0.0012], [-0.1, 0.0014], [-0.094, 0.0026], [-0.07, 0.0082], [-0.045, 0.0106], [-0.028, 0.0104], [-0.01, 0.0078], [0.004, 0.0048], [0.012, 0.0032], [0.012, 0.0001]];
  const body = new THREE.LatheGeometry(prof.map(([y, r]) => new THREE.Vector2(r, y)), 14);
  const cols: number[] = []; const pa = body.attributes.position;
  for (let i = 0; i < pa.count; i++) {
    const y = pa.getY(i);
    const c = y < -0.095 ? [0.85, 0.85, 0.85] : y < -0.052 ? [0.12, 0.26, 0.16] : y < -0.046 ? [0.95, 0.8, 0.2] : y < -0.012 ? [0.93, 0.92, 0.86] : [0.9, 0.1, 0.06];
    cols.push(c[0], c[1], c[2]);
  }
  body.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const bodyM = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.05 }));
  // antena: garis oranye / kuning / hitam (warna per ruas), makin tipis ke atas
  const antG = new THREE.CylinderGeometry(0.0016, 0.0022, 0.15, 6, 15).translate(0, 0.087, 0);
  const ac: number[] = []; const ap = antG.attributes.position;
  for (let i = 0; i < ap.count; i++) {
    const band = Math.floor((ap.getY(i) - 0.012) / 0.0125);
    const c = band % 4 === 3 ? [0.06, 0.06, 0.06] : band % 2 === 0 ? [1, 0.38, 0.05] : [1, 0.86, 0.1];
    ac.push(c[0], c[1], c[2]);
  }
  antG.setAttribute('color', new THREE.Float32BufferAttribute(ac, 3));
  const ant = new THREE.Mesh(antG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, emissive: 0x331000 }));
  // ujung fluoresen: selalu terang (MeshBasic) supaya tetap terlihat saat senja & malam
  const tip = new THREE.Mesh(new THREE.CapsuleGeometry(0.0026, 0.012, 3, 8).translate(0, 0.168, 0), new THREE.MeshBasicMaterial({ color: 0xfff23a }));
  // senar di bawah air & pemberat timah (split shot)
  const leader = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.12, 3).translate(0, -0.178, 0), new THREE.MeshBasicMaterial({ color: 0xcfe8ff, transparent: true, opacity: 0.5 }));
  const shot = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6).translate(0, -0.2, 0), new THREE.MeshStandardMaterial({ color: 0x55585e, metalness: 0.6, roughness: 0.4 }));
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.0022, 0.0006, 4, 8).translate(0, -0.12, 0), new THREE.MeshStandardMaterial({ color: 0xc0c4c8, metalness: 0.9, roughness: 0.3 }));
  g.add(bodyM, ant, tip, leader, shot, eye);
  g.scale.setScalar(1.6); // sedikit dibesarkan supaya jelas di layar HP
  g.traverse(o => { o.castShadow = true; });
  return g;
}

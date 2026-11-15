// Pohon kelapa khas tepi danau di Indonesia: batang melengkung bercincin, pelepah menjuntai
// dengan anak daun (tekstur dibuat kode), bergoyang tertiup angin.
import * as THREE from 'three';
import { groundH, lakeE, SPOT_PLACES, inKeramba, reserved, addObstacle, shoreXZ, toWaterAngle, LOC, MAPSTYLE } from './layout';
import { Q } from '../core/quality';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

function frondTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 64);
  g.strokeStyle = '#6b7a3a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 32); g.lineTo(256, 32); g.stroke();
  for (let i = 4; i < 250; i += 4.5) {
    const len = 30 * Math.sin(Math.PI * Math.min(1, i / 240 + 0.08)) + 4;
    for (const side of [-1, 1]) {
      const hue = 85 + Math.random() * 20, l = 22 + Math.random() * 14;
      g.strokeStyle = `hsl(${hue}, 55%, ${l}%)`; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(i, 32); g.quadraticCurveTo(i + 6, 32 + side * len * 0.5, i + 12, 32 + side * len); g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function trunkTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 256; y++) { const k = 0.75 + (y % 16 < 3 ? -0.25 : 0) + Math.random() * 0.08; g.fillStyle = `rgb(${120 * k},${100 * k},${78 * k})`; g.fillRect(0, y, 64, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function frondGeometry(len: number, width: number, droop: number) {
  const seg = 8, pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const s = i / seg, x = s * len, y = -droop * s * s + s * 0.35, fold = 0.18 * width * (1 - s);
    for (let j = 0; j <= 2; j++) {
      const v = j / 2, z = (v - 0.5) * width * (1 - s * 0.35);
      pos.push(x, y + (j === 1 ? fold : 0), z); uv.push(s, v);
    }
  }
  for (let i = 0; i < seg; i++) for (let j = 0; j < 2; j++) {
    const a = i * 3 + j, b = a + 1, c = a + 3, d = c + 1; idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export class Palms {
  group = new THREE.Group();
  private u = { time: { value: 0 }, wind: { value: 1 } };
  constructor() {
    // satu model kelapa (batang + 11 pelepah), lalu digandakan dengan instancing
    const H = 9;
    const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.3, H * 0.35, 0), new THREE.Vector3(1.4, H * 0.7, 0), new THREE.Vector3(1.9, H, 0));
    const trunk = new THREE.TubeGeometry(curve, 10, 0.16, 7, false);
    const tp = trunk.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) / H; const k = 1.25 - y * 0.45; const c = curve.getPoint(Math.min(1, y)); tp.setX(i, c.x + (tp.getX(i) - c.x) * k); tp.setZ(i, tp.getZ(i) * k); }
    trunk.computeVertexNormals();
    const top = curve.getPoint(1);
    const fronds: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 11; i++) {
      const f = frondGeometry(3.1 + (i % 3) * 0.35, 0.95, 1.4 + (i % 2) * 0.6);
      f.rotateZ(0.25 - (i % 4) * 0.12);
      f.rotateY(i / 11 * Math.PI * 2 + (i % 2) * 0.2);
      f.translate(top.x, top.y, top.z);
      fronds.push(f);
    }
    const coco = new THREE.SphereGeometry(0.13, 6, 5);
    const nuts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) { const n = coco.clone(); n.translate(top.x + Math.cos(i * 1.6) * 0.18, top.y - 0.25, top.z + Math.sin(i * 1.6) * 0.18); nuts.push(n); }
    const frondGeo = mergeGeometries(fronds)!;
    const nutGeo = mergeGeometries(nuts)!;

    const frondMat = new THREE.MeshLambertMaterial({ map: frondTexture(), alphaTest: 0.4, side: THREE.DoubleSide });
    frondMat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.u.time; sh.uniforms.wind = this.u.wind;
      sh.vertexShader = 'uniform float time; uniform float wind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        vec4 ip = instanceMatrix * vec4(0.0,0.0,0.0,1.0);
        float r = length(position.xz - vec2(${top.x.toFixed(2)}, 0.0));
        float sw = sin(time * 1.3 + ip.x * 0.2 + position.x) * 0.12 * wind * r / 3.0;
        transformed.y += sw; transformed.x += sw * 0.4;`);
    };
    const trunkMat = new THREE.MeshLambertMaterial({ map: trunkTexture() });
    const nutMat = new THREE.MeshLambertMaterial({ color: 0x4f6a22 });

    // tempat: tepi danau, lebih banyak di dekat spot pemain
    let seed = 77; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const spots: THREE.Matrix4[] = [];
    const N = Math.round(46 * Q.trees * (MAPSTYLE ? MAPSTYLE.palms : LOC === 'serene' ? 0 : LOC === 'pantai' ? 3 : LOC === 'laut' ? 2.2 : LOC === 'sungai' ? 0.4 : 1)); // pantai & pulau: banyak kelapa
    let tries = 0;
    while (spots.length < N && tries++ < 4000) {
      let x: number, z: number;
      if (rnd() < 0.5) { const sp = SPOT_PLACES[Math.floor(rnd() * SPOT_PLACES.length)]; const a = rnd() * 6.28, d = 7 + rnd() * 28; x = sp.pos.x + Math.cos(a) * d; z = sp.pos.z + Math.sin(a) * d; }
      else { const a = rnd() * 6.28, e = 1.03 + rnd() * 0.2; ({ x, z } = shoreXZ(a, e)); }
      const e = lakeE(x, z);
      if (e < 1.02 || e > (LOC === 'kolam' ? 2.1 : LOC === 'laguna' ? 1.8 : LOC === 'bakau' ? 1.5 : LOC === 'pantai' ? 1.8 : LOC === 'laut' ? 1.7 : 1.3)) continue;
      if (groundH(x, z) < 0.15) continue;
      if (Math.abs(x) < 4 && z > -3 && z < 22) continue;
      if (SPOT_PLACES.some(s => Math.hypot(s.pos.x - x, s.pos.z - z) < 5)) continue;
      if (inKeramba(x, z) || reserved(x, z, 2.5)) continue;
      // condong ke arah danau
      const toLake = toWaterAngle(x, z);
      const sc = 0.8 + rnd() * 0.45;
      addObstacle(x, z, 0.3 * sc);
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, groundH(x, z) - 0.1, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -toLake + (rnd() - 0.5) * 0.9), new THREE.Vector3(sc, sc, sc));
      spots.push(m);
    }
    const mk = (g: THREE.BufferGeometry, m: THREE.Material, shadow: boolean) => {
      const im = new THREE.InstancedMesh(g, m, spots.length);
      spots.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.castShadow = shadow && Q.shadows; im.receiveShadow = false; im.computeBoundingSphere();
      this.group.add(im); return im;
    };
    mk(trunk, trunkMat, true); mk(frondGeo, frondMat, true); mk(nutGeo, nutMat, false);
  }
  update(time: number, wind: number) { this.u.time.value = time; this.u.wind.value = wind; }
}

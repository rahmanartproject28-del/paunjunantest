// Jejak air bergerak: buih hanyut di Sungai Deras, buih ombak maju-mundur di bibir Pantai Karang,
// dan buih ombak kecil di Laut Dalam. Satu InstancedMesh, ringan untuk HP.
import * as THREE from 'three';
import { LOC, FLOW, rivC, rivW, shoreZ, lakeE, isWater } from './layout';
import { Q } from '../core/quality';

interface Streak { x: number; z: number; len: number; life: number; age: number; ph: number; w: number }

function streakTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 16; const g = c.getContext('2d')!;
  for (let i = 0; i < 160; i++) { const x = Math.random() * 128, y = 8 + (Math.random() - 0.5) * 9 * Math.sin((x / 128) * Math.PI); g.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`; g.beginPath(); g.arc(x, y, 0.7 + Math.random() * 1.8, 0, 7); g.fill(); }
  const fade = g.createLinearGradient(0, 0, 128, 0); fade.addColorStop(0, 'rgba(0,0,0,1)'); fade.addColorStop(0.2, 'rgba(0,0,0,0)'); fade.addColorStop(0.8, 'rgba(0,0,0,0)'); fade.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = fade; g.fillRect(0, 0, 128, 16);
  return new THREE.CanvasTexture(c);
}

export class FlowFx {
  mesh: THREE.InstancedMesh | null = null;
  private s: Streak[] = [];
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private col = new THREE.Color();
  constructor() {
    if (LOC === 'danau' || LOC === 'serene' || LOC === 'kolam') return;
    const n = Math.round((LOC === 'sungai' ? 190 : LOC === 'pantai' ? 150 : 70) * Math.max(0.4, Q.trees));
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    // aditif: warna per-instance 0 = tak terlihat (memudar), 1 = buih terang — tidak pernah jadi garis gelap
    const mat = new THREE.MeshBasicMaterial({ map: streakTexture(), transparent: true, depthWrite: false, color: 0xffffff, opacity: 0.5, blending: THREE.AdditiveBlending });
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.frustumCulled = false; this.mesh.renderOrder = 1;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    for (let i = 0; i < n; i++) { const st = { x: 0, z: 0, len: 1, life: 1, age: 0, ph: Math.random() * 6.28, w: 0.12 }; this.spawn(st, new THREE.Vector3(), true); this.s.push(st); }
  }
  private spawn(st: Streak, focus: THREE.Vector3, initial = false) {
    st.age = initial ? Math.random() * 4 : 0; st.ph = Math.random() * 6.28;
    for (let k = 0; k < 8; k++) {
      if (LOC === 'sungai') {
        const x = focus.x + (Math.random() - 0.5) * 120 - (initial ? 0 : 20), edge = Math.random() < 0.5;
        const e = edge ? (0.55 + Math.random() * 0.35) * (Math.random() < 0.5 ? -1 : 1) : (Math.random() - 0.5) * 1.1;
        st.x = x; st.z = rivC(x) + e * rivW(x); st.len = 0.8 + Math.random() * 2.4; st.w = 0.1 + Math.random() * 0.14; st.life = 4 + Math.random() * 4;
      } else if (LOC === 'pantai') {
        const x = focus.x + (Math.random() - 0.5) * 110; st.x = x; st.z = shoreZ(x) - 0.6 - Math.random() * 3.5; st.len = 2 + Math.random() * 5; st.w = 0.25 + Math.random() * 0.35; st.life = 5 + Math.random() * 4;
      } else {
        const a = Math.random() * 6.28, r = 6 + Math.random() * 70; st.x = focus.x + Math.cos(a) * r; st.z = focus.z + Math.sin(a) * r; st.len = 0.6 + Math.random() * 1.6; st.w = 0.2 + Math.random() * 0.3; st.life = 2 + Math.random() * 2.5;
      }
      if (isWater(st.x, st.z)) return;
    }
  }
  update(dt: number, time: number, focus: THREE.Vector3) {
    const m = this.mesh; if (!m) return;
    this.s.forEach((st, i) => {
      st.age += dt;
      if (st.age > st.life || Math.abs(st.x - focus.x) > 80 || Math.abs(st.z - focus.z) > 90) this.spawn(st, focus);
      const k = st.age / st.life, a = Math.sin(Math.PI * Math.min(1, Math.max(0, k)));   // muncul lalu memudar
      let yaw = 0, z = st.z, alpha = a;
      if (LOC === 'sungai') {
        const e = Math.abs(lakeE(st.x, st.z)), sp = FLOW.x * (1.25 - e * e * 0.7);   // lebih deras di tengah
        st.x += sp * dt; st.z += (rivC(st.x + 1) - rivC(st.x)) * sp * dt;             // mengikuti kelokan sungai
        yaw = -Math.atan2(rivC(st.x + 1) - rivC(st.x), 1);
        if (!isWater(st.x, st.z)) st.age = st.life;
      } else if (LOC === 'pantai') {
        const w = Math.sin(time * (Math.PI * 2 / 7) + st.x * 0.04 + st.ph);          // ombak maju-mundur ±1,4 m
        z = st.z + w * 1.4; alpha = a * (0.45 + 0.55 * Math.max(0, w));
      } else { alpha = a * 0.8; yaw = st.ph; }
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), yaw);
      m.setMatrixAt(i, this.m4.compose(this.v.set(st.x, 0.035, z), this.q, this.sc.set(st.len, 1, st.w * (LOC === 'laut' ? 3 : 1))));
      m.setColorAt(i, this.col.setScalar(Math.max(0, alpha)));
    });
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}

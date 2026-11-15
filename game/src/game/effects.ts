// Cipratan air (tetesan berfisika) dan penanda bidikan di permukaan air.
import * as THREE from 'three';

/** Tekstur buih: cincin bergerigi lembut (dibuat sekali). */
let foamTex: THREE.CanvasTexture | null = null;
function foamTexture() {
  if (foamTex) return foamTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
  for (let i = 0; i < 900; i++) {
    const a = Math.random() * Math.PI * 2, r = 40 + (Math.random() - 0.5) * 22 + Math.sin(a * 7) * 3, s = 1 + Math.random() * 3;
    g.fillStyle = `rgba(255,255,255,${0.15 + Math.random() * 0.5})`; g.beginPath(); g.arc(64 + Math.cos(a) * r, 64 + Math.sin(a) * r, s, 0, 7); g.fill();
  }
  const rg = g.createRadialGradient(64, 64, 10, 64, 64, 34); rg.addColorStop(0, 'rgba(255,255,255,.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  foamTex = new THREE.CanvasTexture(c); return foamTex;
}

export class Splashes {
  private foam: { m: THREE.Mesh; t: number; size: number }[] = [];
  private foamNext = 0;
  points: THREE.Points;
  private n = 260;
  private pos: Float32Array; private vel: Float32Array; private life: Float32Array;
  private next = 0;
  constructor() {
    this.pos = new Float32Array(this.n * 3); this.vel = new Float32Array(this.n * 3); this.life = new Float32Array(this.n);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d')!;
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(235,245,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 32, 32);
    const m = new THREE.PointsMaterial({ size: 0.09, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, sizeAttenuation: true, color: 0xeaf4ff });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false;
    for (let i = 0; i < this.n; i++) this.pos[i * 3 + 1] = -99;
    // cincin buih di permukaan air (anak dari points supaya ikut ditambahkan ke scene)
    const fg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 14; i++) {
      const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ map: foamTexture(), transparent: true, opacity: 0, depthWrite: false, color: 0xf2f8ff }));
      fm.visible = false; fm.renderOrder = 2; this.points.add(fm); this.foam.push({ m: fm, t: 99, size: 1 });
    }
  }
  /** Buih melebar lalu memudar (ikan melompat, pelampung jatuh, serok). */
  foamAt(x: number, z: number, size = 1) {
    const f = this.foam[this.foamNext]; this.foamNext = (this.foamNext + 1) % this.foam.length;
    f.t = 0; f.size = size; f.m.position.set(x, 0.03, z); f.m.rotation.y = Math.random() * 6.28; f.m.visible = true;
  }
  burst(at: THREE.Vector3, power = 1, count = 40) {
    if (power >= 0.55 && at.y < 0.6) this.foamAt(at.x, at.z, 0.6 + power * 0.9);
    for (let k = 0; k < count * power; k++) {
      const i = this.next; this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.12 * power;
      this.pos[i * 3] = at.x + Math.cos(a) * r; this.pos[i * 3 + 1] = Math.max(0.01, at.y); this.pos[i * 3 + 2] = at.z + Math.sin(a) * r;
      const sp = (0.6 + Math.random() * 1.6) * power;
      this.vel[i * 3] = Math.cos(a) * sp * 0.6; this.vel[i * 3 + 1] = 1.2 + Math.random() * 2.6 * power; this.vel[i * 3 + 2] = Math.sin(a) * sp * 0.6;
      this.life[i] = 1.2;
    }
  }
  /** tetesan kecil dari ikan/kail yang diangkat */
  drip(at: THREE.Vector3) {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = at.x + (Math.random() - 0.5) * 0.1; this.pos[i * 3 + 1] = at.y; this.pos[i * 3 + 2] = at.z + (Math.random() - 0.5) * 0.1;
    this.vel[i * 3] = 0; this.vel[i * 3 + 1] = -0.2; this.vel[i * 3 + 2] = 0; this.life[i] = 1.5;
  }
  update(dt: number, onHit?: (x: number, z: number) => void) {
    for (const f of this.foam) {
      if (f.t > 1.8) { if (f.m.visible) f.m.visible = false; continue; }
      f.t += dt; const k = f.t / 1.8, r = f.size * (0.5 + Math.pow(k, 0.55) * 2.4);
      f.m.scale.set(r, 1, r); (f.m.material as THREE.MeshBasicMaterial).opacity = (1 - k) * (k < 0.08 ? k / 0.08 : 1) * 0.75;
    }
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 9.8 * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0 && this.vel[i * 3 + 1] < 0) { this.life[i] = 0; if (Math.random() < 0.05) onHit?.(this.pos[i * 3], this.pos[i * 3 + 2]); this.pos[i * 3 + 1] = -99; }
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

export function makeAimMarker() {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd873, transparent: true, opacity: 0.8, depthWrite: false }));
  const dot = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false }));
  g.add(ring, dot); g.position.y = 0.03; g.visible = false; g.renderOrder = 5;
  return g;
}

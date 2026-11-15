// Akuarium 3D pribadi di halaman darat: lemari kayu, tangki kaca, air, pasir, batu, tanaman,
// gelembung, lampu, papan nama. Ikan dari data pemain berenang di dalamnya (model & warna sama dengan tangkapan).
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { CatchRec } from '@paunjunan/shared';
import { FishActor } from '../actors/fish';
import { AQUA, groundH } from './layout';

const TW = AQUA.w, TD = AQUA.d * 0.9, TH = 1.15, CAB = 0.85; // ukuran tangki & tinggi lemari

function nameTex(text: string) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2b1d12'; g.fillRect(0, 0, 512, 80); g.strokeStyle = '#d9b36a'; g.lineWidth = 4; g.strokeRect(4, 4, 504, 72);
  g.fillStyle = '#f5e2b0'; g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 256, 42, 480);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

interface Swimmer { a: FishActor; ph: number; sp: number; y: number; r: number; rec: CatchRec }

export class Aquarium {
  group = new THREE.Group();
  private tank = new THREE.Group();
  private pool: FishActor[] = [];
  private swim: Swimmer[] = [];
  private bubbles: THREE.Points;
  private sign: THREE.Mesh;
  private lightMat: THREE.MeshBasicMaterial;
  /** titik pandang kamera saat layar akuarium dibuka */
  view = { pos: new THREE.Vector3(), look: new THREE.Vector3() };

  constructor(private fishGltf: GLTF) {
    const y0 = groundH(AQUA.x, AQUA.z);
    this.group.position.set(AQUA.x, y0, AQUA.z);
    this.group.rotation.y = -Math.PI / 2; // muka tangki menghadap jalan (−X)
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.7 });
    const cab = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.1, CAB, TD + 0.1), wood); cab.position.y = CAB / 2; cab.castShadow = cab.receiveShadow = true;
    for (const x of [-TW / 4, TW / 4]) { const door = new THREE.Mesh(new THREE.PlaneGeometry(TW / 2 - 0.12, CAB - 0.16), new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.6 })); door.position.set(x, CAB / 2, TD / 2 + 0.051); cab.parent; this.group.add(door); }
    this.group.add(cab);
    this.tank.position.y = CAB;
    // pasir, batu, tanaman
    const sand = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.04, 0.1, TD - 0.04), new THREE.MeshStandardMaterial({ color: 0xd8c38a, roughness: 1 })); sand.position.y = 0.05;
    this.tank.add(sand);
    const rockM = new THREE.MeshStandardMaterial({ color: 0x6f6a60, roughness: 0.95 });
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.06 + Math.random() * 0.08, 0), rockM); r.position.set((Math.random() - 0.5) * TW * 0.85, 0.12, (Math.random() - 0.3) * TD * 0.5); r.rotation.set(Math.random() * 3, Math.random() * 3, 0); r.scale.y = 0.6; this.tank.add(r); }
    const plantM = new THREE.MeshStandardMaterial({ color: 0x2f7a3a, roughness: 0.8, side: THREE.DoubleSide });
    for (let i = 0; i < 9; i++) {
      const h = 0.35 + Math.random() * 0.5, p = new THREE.Mesh(new THREE.PlaneGeometry(0.06, h, 1, 4), plantM);
      p.position.set((i / 8 - 0.5) * TW * 0.9, 0.1 + h / 2, -TD * 0.32 + Math.random() * 0.1); p.rotation.y = Math.random() * 3; p.userData.sway = Math.random() * 6;
      this.tank.add(p);
    }
    // air (sedikit biru) & kaca (pantulan tipis). Transparan digambar setelah ikan → ikan tampak di dalam air.
    const water = new THREE.Mesh(new THREE.BoxGeometry(TW - 0.03, TH - 0.1, TD - 0.03), new THREE.MeshStandardMaterial({ color: 0x5fb4c9, transparent: true, opacity: 0.22, roughness: 0.1, depthWrite: false }));
    water.position.y = (TH - 0.1) / 2; water.renderOrder = 2;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(TW, TH, TD), new THREE.MeshStandardMaterial({ color: 0xd8f0f5, transparent: true, opacity: 0.12, roughness: 0.05, metalness: 0.2, depthWrite: false }));
    glass.position.y = TH / 2; glass.renderOrder = 3;
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(TW, TH, TD)), new THREE.LineBasicMaterial({ color: 0x1a1a1a }));
    frame.position.y = TH / 2;
    this.lightMat = new THREE.MeshBasicMaterial({ color: 0xdff6ff });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(TW + 0.02, 0.06, TD + 0.02), new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.5 })); lid.position.y = TH + 0.03;
    const lamp = new THREE.Mesh(new THREE.PlaneGeometry(TW * 0.8, 0.05), this.lightMat); lamp.rotation.x = Math.PI / 2; lamp.position.y = TH - 0.001;
    this.tank.add(water, glass, frame, lid, lamp);
    // gelembung dari aerator
    const bp = new Float32Array(40 * 3); for (let i = 0; i < 40; i++) { bp[i * 3] = TW * 0.38 + (Math.random() - 0.5) * 0.05; bp[i * 3 + 1] = Math.random() * TH; bp[i * 3 + 2] = -TD * 0.2 + (Math.random() - 0.5) * 0.05; }
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(bp, 3));
    this.bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.025, transparent: true, opacity: 0.7, depthWrite: false }));
    this.bubbles.renderOrder = 1; this.tank.add(this.bubbles);
    this.group.add(this.tank);
    // papan nama di atas
    this.sign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.25), new THREE.MeshStandardMaterial({ map: nameTex('AKUARIUM'), roughness: 0.7 }));
    this.sign.position.set(0, CAB + TH + 0.25, TD / 2 * 0.2); this.group.add(this.sign);
    this.group.updateMatrixWorld(true);
    // kamera: 2,6 m di depan tangki, setinggi tengah tangki
    this.view.pos.copy(this.group.localToWorld(new THREE.Vector3(0, CAB + TH * 0.55, 2.7)));
    this.view.look.copy(this.group.localToWorld(new THREE.Vector3(0, CAB + TH * 0.45, 0)));
  }

  setOwner(name: string) { (this.sign.material as THREE.MeshStandardMaterial).map?.dispose(); (this.sign.material as THREE.MeshStandardMaterial).map = nameTex('AKUARIUM ' + name.toUpperCase()); }

  /** Pasang ikan dari data pemain (maks. 12). Ukuran dikecilkan secukupnya supaya muat di tangki. */
  setFish(list: CatchRec[]) {
    for (const s of this.swim) { s.a.group.visible = false; this.tank.remove(s.a.group); }
    this.swim = [];
    list.slice(0, 12).forEach((rec, i) => {
      const a = this.pool[i] ?? (this.pool[i] = new FishActor(this.fishGltf));
      const len = Math.min(0.62, Math.max(0.16, (rec.length || 30) / 100 * 0.55));
      a.setSpecies(rec.species, rec.weight, len * 100);
      a.group.visible = true; this.tank.add(a.group);
      this.swim.push({ a, rec, ph: Math.random() * 6.28, sp: 0.25 + Math.random() * 0.25, y: 0.3 + Math.random() * (TH - 0.6), r: Math.min(1, 0.55 + Math.random() * 0.4) });
    });
  }

  update(time: number, night: number) {
    this.lightMat.color.setScalar(0.7 + night * 0.6);
    for (const s of this.swim) {
      // lintasan angka-8 di dalam tangki, arah hadap mengikuti gerak
      const t = time * s.sp + s.ph, hx = TW / 2 - s.a.lengthM * 0.6 - 0.08, hz = TD / 2 - 0.14;
      const x = Math.sin(t) * hx * s.r, z = Math.sin(t * 2) * hz * 0.8, y = s.y + Math.sin(t * 0.7) * 0.08;
      const dx = Math.cos(t) * hx * s.r, dz = Math.cos(t * 2) * 2 * hz * 0.8;
      s.a.group.position.set(x, CAB * 0 + y, z);
      s.a.group.rotation.set(0, Math.atan2(dx, dz), Math.sin(t * 3) * 0.05);
      s.a.update(time, 0.5, 0.07);
    }
    const bp = this.bubbles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < bp.count; i++) { let y = bp.getY(i) + 0.006 + (i % 3) * 0.002; if (y > TH - 0.08) y = 0.1; bp.setY(i, y); bp.setX(i, TW * 0.38 + Math.sin(time * 4 + i) * 0.02); }
    bp.needsUpdate = true;
    for (const c of this.tank.children) if (c.userData.sway !== undefined) c.rotation.z = Math.sin(time * 1.2 + c.userData.sway) * 0.15;
  }
}

// Pemain lain di ruang yang sama. Mode lokal: pemancing simulasi. Mode server: data WebSocket.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { NetPlayer } from '@paunjunan/shared';
import { Angler, stepLength, WALK_MAX } from '../actors/angler';
import { FishingLine, makeFloat } from '../actors/tackle';
import { Q } from '../core/quality';
import { SPOT_PLACES, nearestWalkable, IS_DANAU, walkHeight, faceNearestWater, LOC } from '../world/layout';

function nameTag(text: string, lv: number) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d')!;
  g.font = 'bold 26px system-ui, sans-serif';
  const w = Math.min(240, g.measureText(text).width + 64);
  g.fillStyle = 'rgba(8,22,20,0.7)'; g.beginPath(); g.roundRect((256 - w) / 2, 8, w, 44, 22); g.fill();
  g.fillStyle = '#f2b53a'; g.beginPath(); g.arc((256 - w) / 2 + 24, 30, 15, 0, 7); g.fill();
  g.fillStyle = '#2b1a02'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.fillText(String(lv), (256 - w) / 2 + 24, 36);
  g.fillStyle = '#f4f1e8'; g.font = 'bold 24px system-ui'; g.textAlign = 'left'; g.fillText(text, (256 - w) / 2 + 46, 38);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(1.2, 0.3, 1); s.position.y = 2.15; s.renderOrder = 10;
  return s;
}

/** Gelembung ucapan di atas kepala. */
export function bubble(text: string) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 80;
  const g = c.getContext('2d')!;
  g.font = 'bold 24px system-ui, sans-serif';
  const w = Math.min(244, g.measureText(text).width + 36);
  g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 50, 20); g.fill();
  g.beginPath(); g.moveTo(118, 55); g.lineTo(128, 72); g.lineTo(138, 55); g.fill();
  g.fillStyle = '#13201b'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32, 230);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, depthTest: false, transparent: true }));
  sp.scale.set(1.3, 0.41, 1); sp.position.y = 2.55; sp.renderOrder = 11;
  return sp;
}

interface Other { a: Angler; tag: THREE.Sprite; float: THREE.Group; line: FishingLine; st: NetPlayer; tx: number; tz: number; tyaw: number; ph: number; reelT: number; bub?: THREE.Sprite; bubT: number; lookKey?: string }

export class Crowd {
  group = new THREE.Group();
  private others = new Map<string, Other>();
  private frame = 0;
  constructor(private gltf: GLTF, private scene: THREE.Scene) { scene.add(this.group); }
  get max() { return Q.nearTrees >= 14 ? 8 : Q.nearTrees >= 8 ? 4 : 2; }

  sync(list: NetPlayer[], meId = '') {
    const seen = new Set<string>();
    for (const p of list) {
      if (p.id === meId) continue;
      seen.add(p.id);
      let o = this.others.get(p.id);
      if (!o) {
        if (this.others.size >= this.max) continue;
        const cols = ['#e2cf45', '#2a2d33', '#1f4f8a', '#c9b690'];
        const a = new Angler(this.gltf, { rodColor: cols[this.others.size % 4], cap: [0xf2efe6, 0x2f6a4a, 0xd24a2a, 0x2a3a6a][this.others.size % 4] });
        const tag = nameTag(p.name, p.lv); a.root.add(tag);
        const float = makeFloat(); const line = new FishingLine();
        this.group.add(a.root, a.rod.group, float, line.line);
        o = { a, tag, float, line, st: p, tx: p.x, tz: p.z, tyaw: p.yaw, ph: Math.random() * 6, reelT: 0, bubT: 0 };
        o.a.root.position.set(p.x, 0.6, p.z); o.a.root.rotation.y = p.yaw;
        this.others.set(p.id, o);
      }
      o.st = p; o.tx = p.x; o.tz = p.z; o.tyaw = p.yaw;
      const lk = p.look ? JSON.stringify(p.look) : '';
      if (lk !== (o.lookKey ?? '')) { o.lookKey = lk; if (p.look) o.a.applyLook(p.look); }
    }
    for (const [id, o] of this.others) if (!seen.has(id)) this.remove(id, o);
  }
  private remove(id: string, o: Other) {
    this.group.remove(o.a.root, o.a.rod.group, o.float, o.line.line);
    this.others.delete(id);
  }
  setHeight(fn: (x: number, z: number) => number) { this.hFn = fn; }
  /** Pemain lain mengucapkan sesuatu (gelembung 3 detik). */
  say(id: string, text: string) {
    const o = this.others.get(id); if (!o) return;
    if (o.bub) { o.a.root.remove(o.bub); o.bub.material.map?.dispose(); o.bub.material.dispose(); }
    o.bub = bubble(text); o.a.root.add(o.bub); o.bubT = 3;
  }
  list() { return [...this.others.values()].map(o => ({ ...o.st, x: o.a.root.position.x, z: o.a.root.position.z })); }
  /** Pemain terdekat dari titik layar (untuk ketuk pemain). */
  pick(sx: number, sy: number, cam: THREE.Camera, w: number, h: number): NetPlayer | null {
    let best: NetPlayer | null = null, bd = 44;
    const v = new THREE.Vector3();
    for (const o of this.others.values()) {
      v.copy(o.a.root.position); v.y += 1.3; v.project(cam);
      if (v.z > 1) continue;
      const d = Math.hypot((v.x * 0.5 + 0.5) * w - sx, (-v.y * 0.5 + 0.5) * h - sy);
      if (d < bd) { bd = d; best = o.st; }
    }
    return best;
  }
  private hFn: (x: number, z: number) => number = () => 0.6;

  update(dt: number, time: number, cam: THREE.Camera) {
    this.frame++;
    for (const o of this.others.values()) {
      const r = o.a.root, k = 1 - Math.exp(-dt * 4);
      const px = r.position.x, pz = r.position.z;
      r.position.x += (o.tx - r.position.x) * k; r.position.z += (o.tz - r.position.z) * k;
      r.position.y = this.hFn(r.position.x, r.position.z);
      r.rotation.y += Math.atan2(Math.sin(o.tyaw - r.rotation.y), Math.cos(o.tyaw - r.rotation.y)) * k;
      if (o.bub) { o.bubT -= dt; if (o.bubT <= 0) { r.remove(o.bub); o.bub.material.map?.dispose(); o.bub.material.dispose(); o.bub = undefined; } }
      if (o.st.pose === 'walk') {
        // berjalan: kaki berayun mengikuti kecepatan, joran dibawa tegak
        const spd = Math.hypot(r.position.x - px, r.position.z - pz) / Math.max(1e-3, dt);
        const P = o.a.pose;
        P.walk += (Math.min(WALK_MAX, spd / 1.45) - P.walk) * Math.min(1, dt * 6); P.walkPhase += dt * Math.PI * spd / stepLength(spd);
        P.hand.set(0.25, 0.98, -0.16); P.pitch = 1.12; P.yaw = 0.12; P.leftOnButt = false; P.reeling = false; P.lean = 0; P.seat = 0;
        P.look = null; P.load.set(0, 0, 0);
        o.a.update(time); o.float.visible = false; o.line.line.visible = false;
        continue;
      }
      o.a.pose.walk = 0; o.line.line.visible = true;
      // hemat: pemain jauh diperbarui lebih jarang
      const far = r.position.distanceTo(cam.position) > 25;
      if (far && (this.frame + o.ph * 10 | 0) % 3) continue;
      const P = o.a.pose;
      P.hand.set(0.2, 1.05, -0.34); P.yaw = 0.05;
      const fight = o.st.pose === 'fight';
      P.pitch = fight ? 1.0 + Math.sin(time * 2 + o.ph) * 0.15 : 0.45 + Math.sin(time * 0.4 + o.ph) * 0.04;
      P.reeling = fight || (Math.sin(time * 0.15 + o.ph) > 0.97);
      if (P.reeling) P.reelAngle += dt * 12;
      P.leftOnButt = false; P.lean = fight ? 0.18 : 0;
      const fwd = new THREE.Vector3(-Math.sin(r.rotation.y), 0, -Math.cos(r.rotation.y));
      const fp = r.position.clone().addScaledVector(fwd, 9 + (o.ph % 1) * 5); fp.y = 0.02 + Math.sin(time * 1.3 + o.ph) * 0.01;
      P.load.copy(fp).sub(o.a.rod.tip).normalize().multiplyScalar(fight ? 0.9 : 0.06);
      P.look = fp;
      o.a.update(time);
      o.float.position.copy(fp); o.float.visible = !fight;
      o.line.set(o.a.rod.tip, fp.clone().setY(fp.y + 0.1), fight ? 0.05 : 0.4);
    }
  }
}

/** Pemancing simulasi untuk mode lokal (supaya danau terasa ramai). */
export function simulatedPlayers(): NetPlayer[] {
  if (!IS_DANAU) {
    // lokasi lain: satu pemancing di dekat tiap spot + satu yang berjalan
    const names = LOC === 'serene' ? ['RakaFishing', 'SitiPancing', 'Bayu.Joran', 'Ardi.Mancing']
      : LOC === 'kolam' ? ['Kang Dedi', 'Mas.Galatama', 'Teh.Euis', 'Asep.Babon'] : LOC === 'gambut' ? ['Julak Amat', 'Utuh.Klotok', 'Galuh.Mancing', 'Anang.Tapah']
      : LOC === 'bakau' ? ['Bli Komang', 'Wayan.Kakap', 'Mbok.Ketut', 'Putu.Muara'] : LOC === 'laguna' ? ['Bung Yohan', 'Nona.Marsha', 'Kaka.Ferdi', 'Obet.GT']
      : LOC === 'pelabuhan' ? ['Daeng Rudi', 'Koko.Layur', 'Bang.Ucok', 'Iwan.Bagan'] : ['Pak Darto', 'Nelayan.Ujang', 'SiKakap', 'Andi.Pancing'], looks = [{ hat: 'caping', shirtColor: 'krem', skin: 'gelap' }, { hat: 'kupluk', hatColor: 'oranye', shirtColor: 'biru' }, { hat: 'rimba', shirtColor: 'zaitun' }, { hat: 'pet', shirtColor: 'merah' }];
    const out: NetPlayer[] = [];
    SPOT_PLACES.forEach((sp, i) => {
      if (LOC === 'serene' && i === 0) return; // dermaga pemain tetap lapang seperti gambar konsep
      for (const d of [3.2, -3.2, 4.5, -4.5, 2.2]) {
        const x = sp.pos.x + Math.cos(sp.yaw) * d, z = sp.pos.z - Math.sin(sp.yaw) * d;
        if (walkHeight(x, z) === null) continue;
        out.push({ id: 'npc' + (i + 1), name: names[i], x, z, yaw: faceNearestWater(x, z, sp.yaw).yaw, pose: 'wait', lv: 12 + i * 3, look: looks[i] }); break;
      }
    });
    const a = LOC === 'serene' ? { x: 0, z: 14 } : { x: SPOT_PLACES[0].pos.x, z: SPOT_PLACES[0].pos.z + 1 }; out.push({ id: 'npc5', name: names[3], x: a.x, z: a.z, yaw: 0, pose: 'walk', lv: 9, look: looks[3] });
    return out;
  }
  const c2 = SPOT_PLACES[2].pos, n4 = nearestWalkable(c2.x, c2.z - 7) ?? { x: c2.x, z: c2.z - 3 };
  return [
    { id: 'npc1', name: 'RajaNila', x: 47.5, z: -22, yaw: 0.1, pose: 'wait', lv: 12 },
    { id: 'npc2', name: 'MasGabus', x: 53, z: -22, yaw: -0.1, pose: 'wait', lv: 7, look: { hat: 'caping', shirtColor: 'krem', pantsColor: 'khaki', skin: 'gelap' } },
    { id: 'npc3', name: 'SiPatin', x: 32, z: -22, yaw: 0.25, pose: 'wait', lv: 9, look: { hat: 'rimba', hatColor: 'hijau', shirtColor: 'zaitun', face: 'jenggot' } },
    { id: 'npc4', name: 'Joran77', x: n4.x, z: n4.z, yaw: -1.55, pose: 'wait', lv: 4 },
    { id: 'npc5', name: 'UdinKeramba', x: 0, z: 8, yaw: 0, pose: 'walk', lv: 6, look: { hat: 'kupluk', hatColor: 'oranye', shirtColor: 'merah', pantsColor: 'jins', glasses: 'hitam' } },
  ];
}

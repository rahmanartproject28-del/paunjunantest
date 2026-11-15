// Kamera sinematik: di belakang bahu saat memancing, mengikuti umpan saat dilempar,
// menyorot ikan saat adu tarik, dan menghadap pemancing saat memamerkan tangkapan.
import * as THREE from 'three';
import type { Fishing } from './fishing';

export type CamMode = 'bahu' | 'belakang' | 'samping' | 'atas' | 'dekat';
export const CAM_MODES: { id: CamMode; name: string; icon: string }[] = [
  { id: 'bahu', name: 'Bahu', icon: '🎯' }, { id: 'belakang', name: 'Belakang', icon: '🧍' }, { id: 'samping', name: 'Samping', icon: '↔️' },
  { id: 'atas', name: 'Atas', icon: '🦅' }, { id: 'dekat', name: 'Dekat', icon: '🔍' },
];
/** Offset kamera (ruang badan: +X kanan, +Z belakang) & titik pandang per posisi. */
const CAM_OFF: Record<CamMode, { p: [number, number, number]; look: number; side: number; fov: number }> = {
  // bahu: di belakang-kanan pemain (seperti gambar konsep Danau Serene) — pemain di kiri layar, joran & pelampung di kanan
  bahu:     { p: [0.78, 2.02, 2.35], look: 10, side: 1.7, fov: 57 },
  belakang: { p: [0, 2.25, 3.7],     look: 11, side: 0,    fov: 50 },
  samping:  { p: [-3.4, 1.55, 0.4],  look: 6,  side: -0.4, fov: 52 },
  atas:     { p: [-0.6, 5.6, 5.2],   look: 9,  side: -0.6, fov: 55 },
  dekat:    { p: [-0.34, 1.72, 1.35], look: 14, side: -0.5, fov: 46 },
};

export class CamRig {
  pos = new THREE.Vector3(0, 3, 6); look = new THREE.Vector3(0, 1, -5);
  zoom = 1; menuA = 0;
  /** saat berjalan: arah kamera = arah hadap pemain + putaran dari geser layar */
  walkYaw = 0; follow = false; private camYaw = 0;
  /** geser layar saat berjalan: putar kamera mengelilingi pemain */
  turn(d: number) { this.camYaw += d; }
  /** kamera adu tarik: 'dekat' (sorot ikan) atau 'joran' (dari belakang searah senar) */
  fightCam: 'dekat' | 'joran' = 'dekat';
  /** ketinggian kamera tambahan (m) */
  height = 0;
  /** lembar karakter terbuka: kamera di depan pemancing */
  showcase = false;
  /** posisi kamera saat memancing (tidak termasuk adu tarik) */
  mode: CamMode = 'bahu';
  /** kamera sorot: mengikuti umpan saat dilempar & menyorot pelampung */
  sorot = true;
  /** pamer ikan: kamera di depan pemain (melihat wajah) */
  trophyFront = false;
  private fightSide = 1;
  private landT = 0;
  /** layar akuarium terbuka: kamera di depan tangki */
  aqView: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
  /** arah pandang kamera sekarang (dipakai joystick) */
  get yaw() { return this.camYaw; }
  constructor(public cam: THREE.PerspectiveCamera) {}

  update(dt: number, f: Fishing) {
    const b = (x: number, y: number, z: number) => f.bodyPoint(x, y, z);
    let p: THREE.Vector3, l: THREE.Vector3, k = 3.2, fov = 50;
    const aimDir = f.fwd(f.spot.yaw + f.aimYaw);
    const root = f.angler.root.position;
    switch (f.mode) {
      case 'menu': {
        this.menuA += dt * 0.06;
        const a = this.menuA, c = root;
        p = new THREE.Vector3(c.x + Math.sin(a + 0.6) * 5.5, c.y + 2.0 + Math.sin(a * 0.7) * 0.4, c.z + Math.cos(a + 0.6) * 5.5);
        l = c.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(f.fwd(), 2.5);
        k = 1.5; fov = 48; break;
      }
      case 'walk': {
        // orang ketiga: di belakang pemain, mengikuti arah hadap dengan lembut
        // kamera ikut arah hadap hanya saat jalan otomatis / maju lurus (menghindari putaran spiral saat menyamping)
        const want = this.follow ? this.walkYaw : this.camYaw;
        this.camYaw += Math.atan2(Math.sin(want - this.camYaw), Math.cos(want - this.camYaw)) * (1 - Math.exp(-dt * 2.2));
        const bx = Math.sin(this.camYaw), bz = Math.cos(this.camYaw);
        p = root.clone().add(new THREE.Vector3(bx * 4.4, 2.25 + this.height * 0.6, bz * 4.4));
        l = root.clone().add(new THREE.Vector3(-bx * 3, 1.05, -bz * 3));
        k = 5; fov = 55; break;
      }
      case 'ready': case 'charging': case 'casting': {
        // posisi pilihan pemain (bawaan: belakang-kiri, pemancing di sepertiga kanan layar)
        const o = CAM_OFF[this.mode];
        p = b(o.p[0], o.p[1], o.p[2]); l = root.clone().addScaledVector(aimDir, o.look).addScaledVector(f.right(), o.side).setY(0.7); fov = o.fov;
        if (f.mode === 'charging') { p.addScaledVector(aimDir, -0.4).y += 0.15; fov += 2; }
        this.landT = 0;
        break;
      }
      case 'flying': {
        const o = CAM_OFF[this.mode];
        if (this.sorot) {
          // kamera sorot: mengejar umpan dari belakang-atas, lalu melambat saat umpan turun
          const fp = f.floatPos, back = root.clone().sub(fp).setY(0); const dist = back.length(); back.normalize();
          const chase = fp.clone().addScaledVector(back, Math.min(5.5, 2.6 + dist * 0.12)).add(new THREE.Vector3(0, 2.2 + Math.max(0, fp.y) * 0.35, 0)).addScaledVector(f.right(), -1.1);
          const start = b(o.p[0], o.p[1], o.p[2]);
          p = new THREE.Vector3().lerpVectors(start, chase, Math.min(1, dist / 6));
          l = fp.clone(); l.y = Math.max(0.2, fp.y * 0.7); k = 5; fov = 48;
        } else { p = b(o.p[0], o.p[1] + 0.15, o.p[2] + 0.3); l = new THREE.Vector3().lerpVectors(root.clone().addScaledVector(aimDir, o.look).setY(0.7), f.floatPos, 0.6); k = 4; }
        break;
      }
      case 'settling': case 'waiting': case 'hooking': case 'retrieving': {
        const o = CAM_OFF[this.mode], fp = f.floatPos;
        const home = b(o.p[0], o.p[1], o.p[2]), homeL = new THREE.Vector3().lerpVectors(b(this.mode === 'bahu' ? 1.0 : -1.2, 0.9, -4), fp, f.mode === 'retrieving' ? 0.3 : 0.55);
        const back = root.clone().sub(fp).setY(0).normalize();
        const close = (d: number, h: number) => fp.clone().addScaledVector(back, d).add(new THREE.Vector3(0, h, 0)).addScaledVector(f.right(), -0.8);
        if (this.sorot && (f.mode === 'settling' || (f.mode === 'waiting' && this.landT < 1.6))) {
          // pelampung baru mendarat: sorot sebentar, lalu kembali ke pemancing
          this.landT += dt; p = close(3.2, 1.5); l = fp.clone().setY(0.05); k = 3; fov = 42;
        } else if (this.sorot && (f.mode === 'hooking' || (f.mode === 'waiting' && f.isBitten))) {
          // disambar: kamera mendekat ke pelampung
          p = close(2.4, 1.0); l = fp.clone().setY(0); k = 4; fov = 38;
        } else { p = home; l = homeL; fov = o.fov; k = f.mode === 'retrieving' ? 3 : 2; }
        break;
      }
      case 'fight': {
        const fp = f.F ? f.F.pos : f.floatPos;
        if (this.mode === 'bahu' && this.fightCam === 'dekat') {
          // seperti gambar konsep: di belakang bahu kanan, dekat; joran melengkung & ikan melompat di kanan-tengah layar
          // kamera di sisi yang SAMA dengan ikan (bearing > 0 = ikan di kiri) → garis pandang tidak terhalang badan pemain
          const want = f.F && f.F.bearing > 0.12 ? -1 : f.F && f.F.bearing < -0.12 ? 1 : this.fightSide;
          this.fightSide += (want - this.fightSide) * Math.min(1, dt * 1.5);
          const sd = this.fightSide;
          p = b(0.62 * sd, 1.88, 2.15); l = new THREE.Vector3().lerpVectors(b(0.5 * sd, 1.3, -3), fp, 0.66); l.y = Math.max(0.15, Math.min(l.y, 1.0));
          if (f.F && f.F.jumpT >= 0) { l = fp.clone(); l.y = Math.max(0.3, l.y * 0.8); k = 3; fov = Math.max(26, 50 - f.F.L * 1.6); } else { k = 2.6; fov = 52; }
          if (f.slowmo > 0 && f.F) { l.lerp(fp.clone().setY(Math.max(0.25, fp.y)), 0.6 * f.slowmo); fov -= 14 * f.slowmo; k = 6; }
          break;
        }
        // kamera di sisi berlawanan dengan arah ikan supaya badan pemancing tidak menutupi ikan
        const side = f.F && f.F.bearing > 0.05 ? 1 : f.F && f.F.bearing < -0.35 ? -1 : 1;
        p = b(1.75 * side, 1.75, 2.7);
        l = new THREE.Vector3().lerpVectors(b(0, 1.1, -2), fp, 0.72); l.y = Math.max(0.2, Math.min(l.y, 1.2));
        // ikan melompat: kamera sinematik mendekat ke ikan, rendah di atas air
        // ikan melompat: lensa diperbesar (zoom) ke arah ikan, posisi kamera tetap aman
        if (f.F && f.F.jumpT >= 0) { l = fp.clone(); l.y = Math.max(0.3, l.y); k = 4; fov = Math.max(15, 46 - f.F.L * 2.6); }
        if (this.fightCam === 'joran') {
          // tampak joran: dari belakang pemancing searah senar, seluruh lengkungan joran terlihat
          const tip = f.angler.rod.tip, dir = fp.clone().sub(root).setY(0).normalize();
          const back = 2.4 + Math.min(3, (f.F?.L ?? 8) * 0.12);
          p = root.clone().addScaledVector(dir, -back).add(new THREE.Vector3(0, 1.85, 0)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 0.55);
          l = new THREE.Vector3().lerpVectors(tip, fp, 0.35); l.y = Math.max(0.4, l.y);
          fov = 52;
        }
        k = 2.6;
        // Tarikan Kuat (gerak lambat): lensa diperbesar ke ikan
        if (f.slowmo > 0 && f.F) { l.lerp(f.F.pos.clone().setY(Math.max(0.25, f.F.pos.y)), 0.6 * f.slowmo); fov -= 14 * f.slowmo; k = 6; }
        break;
      }
      case 'landing': { p = b(1.5, 1.85, 1.2); l = f.fish.group.position.clone(); k = 3; fov = 46; break; }
      case 'trophy': default: {
        const s = Math.sin(f.t * 0.25) * 0.35;
        // pemancing di sisi kiri layar, kartu tangkapan di kanan
        const wide = this.cam.aspect > 1.3;
        if (f.angler.pose.holdStyle === 'angkat' && !this.trophyFront) {
          // dari belakang-kiri, sedikit rendah, menatap ikan yang diangkat (kartu tangkapan di kanan)
          p = b(-0.5 + s * 0.25, 1.42, 1.6); l = b(wide ? 0.42 : 0.25, 1.72, -0.7); k = 2.2; fov = 52; break;
        }
        p = b(-0.35 + s - (wide ? 0.5 : 0), 1.62, -2.6); l = b(wide ? -0.62 : 0, 1.28, 0); k = 2.2; fov = 42; break;
      }
    }
    if (this.aqView) { p = this.aqView.pos.clone(); l = this.aqView.look.clone(); k = 2.5; fov = this.cam.aspect < 1 ? 62 : 48; if (this.cam.aspect < 1) p.addScaledVector(p.clone().sub(l).normalize(), 1.2); }
    else if (this.showcase) { p = b(0.35, 1.35, -2.4); l = b(-0.35, 1.05, 0); k = 3; fov = 40; if (this.cam.aspect < 1) { p = b(0, 1.4, -3.2); l = b(0, 0.95, 0); } }
    // layar tegak (portrait): mundur & ke tengah supaya pemancing dan air sama-sama terlihat
    const portrait = this.cam.aspect < 1;
    if (f.mode !== 'walk' && f.mode !== 'menu') this.camYaw = f.angler.root.rotation.y;
    if (portrait && f.mode === 'walk') fov += 10;
    if (this.height && !['menu', 'walk', 'trophy', 'landing'].includes(f.mode)) { p.y += this.height; p.addScaledVector(aimDir, -this.height * 0.35); }
    if (portrait && f.mode !== 'menu' && f.mode !== 'trophy' && f.mode !== 'landing' && f.mode !== 'walk') {
      const anchor = b(0, 1.4, 0);
      const bahu = this.mode === 'bahu';
      p = anchor.clone().lerp(p, 1.45); p.addScaledVector(f.right(), bahu ? -0.4 : 0.55); p.y += 0.5; fov += 12;
      if (['ready', 'charging', 'casting', 'settling', 'waiting', 'hooking', 'retrieving', 'flying'].includes(f.mode)) l.addScaledVector(f.right(), bahu ? 0.2 : 1.2);
    }
    if (portrait && f.mode === 'trophy') { if (f.angler.pose.holdStyle === 'angkat' && !this.trophyFront) { p = b(-0.4, 1.4, 2.8); l = b(0.15, 1.55, -0.6); fov = 62; } else { p = b(-0.2, 1.75, -3.2); l = b(0, 1.35, 0); fov += 12; } }
    // perbesar/perkecil terhadap titik jangkar badan
    if (f.mode !== 'menu' && f.mode !== 'trophy') { const anchor = f.mode === 'walk' ? root.clone().setY(root.y + 1.5) : b(0, 1.5, 0); p = anchor.clone().lerp(p, this.zoom); }
    const a = 1 - Math.exp(-dt * k);
    this.pos.lerp(p, a); this.look.lerp(l, a);
    if (this.pos.y < 0.35) this.pos.y = 0.35;
    this.cam.position.copy(this.pos); this.cam.lookAt(this.look);
    if (Math.abs(this.cam.fov - fov) > 0.05) { this.cam.fov += (fov - this.cam.fov) * a; this.cam.updateProjectionMatrix(); }
  }
  snap(f: Fishing) { for (let i = 0; i < 3; i++) this.update(20, f); }
}

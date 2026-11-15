// Berjalan: joystick virtual, tiga kecepatan, jalan otomatis ke titik tujuan, dan batas area pijak.
// Gerak halus: percepatan/perlambatan, berputar di tempat bila belokan tajam, kepala mendahului arah.
import { stepLength, WALK_MAX } from '../actors/angler';
import * as THREE from 'three';
import { walkInfo, findPath, faceNearestWater, aimAtWater, type Surface } from '../world/layout';
import type { Fishing } from './fishing';

export const PACES = [
  { id: 'jalan', name: 'Jalan', icon: '🚶', v: 1.45 },
  { id: 'cepat', name: 'Jalan cepat', icon: '🚶‍♂️', v: 2.2 },
  { id: 'lari', name: 'Lari', icon: '🏃', v: 3.3 },
] as const;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class Walker {
  active = false;
  x = 0; z = 0; y = 0; yaw = 0; speed = 0; pace = 0;
  /** masukan joystick: x kanan, y maju (−1..1) */
  input = { x: 0, y: 0 };
  path: { x: number; z: number }[] | null = null;
  target: { x: number; z: number; label: string; spotId?: string; then?: 'warung' | 'fish' | 'sit'; yaw?: number } | null = null;
  onArrive: (t: NonNullable<Walker['target']>) => void = () => {};
  onBlocked: () => void = () => {};
  surface: Surface | null = null;
  arriveYaw: number | null = null; arriveAt = { x: 0, z: 0 };
  private lookDir = new THREE.Vector3(0, 0, -1);
  private stuckT = 0; private lastFocus = { x: 1e9, z: 1e9 };

  constructor(private f: Fishing, private onFocus: (x: number, z: number) => void) {}

  start() {
    const r = this.f.angler.root.position;
    this.x = r.x; this.z = r.z; this.y = r.y; this.yaw = this.f.angler.root.rotation.y;
    this.speed = 0; this.active = true; this.path = null; this.target = null;
    this.surface = walkInfo(this.x, this.z)?.s ?? null;
    this.f.startWalk();
  }
  /** Taruh pemain di titik tertentu (mis. pintu masuk) lalu mulai berjalan. */
  placeAt(x: number, z: number, yaw: number) {
    const r = this.f.angler.root;
    r.position.set(x, walkInfo(x, z)?.y ?? r.position.y, z); r.rotation.y = yaw; r.updateMatrixWorld(true);
    this.start();
  }
  stop() { this.active = false; this.path = null; this.target = null; this.input.x = this.input.y = 0; this.speed = 0; this.f.angler.pose.walk = 0; }

  setPace(i: number) { this.pace = ((i % PACES.length) + PACES.length) % PACES.length; }
  cyclePace() { this.setPace(this.pace + 1); return PACES[this.pace]; }

  /** Jalan otomatis ke (x,z). Mengembalikan false bila tidak ada jalur. */
  walkTo(x: number, z: number, label: string, extra: { spotId?: string; then?: 'warung' | 'fish' | 'sit'; yaw?: number } = {}) {
    const p = findPath(this.x, this.z, x, z);
    if (!p) return false;
    this.path = p; this.target = { x, z, label, ...extra };
    return true;
  }
  cancelAuto() { this.path = null; this.target = null; }
  get auto() { return !!this.path; }

  /** Arah hadap & posisi untuk memancing di titik sekarang. */
  /** Posisi & arah memancing: TEPAT di tempat pemain berdiri (tidak lagi ditarik ke spot terdekat) dan menghadap
   *  arah yang ia arahkan (arah kamera). Arah hanya digeser bila di depannya bukan air, ke arah berair terdekat. */
  fishingPose(prefYaw = this.yaw) {
    // tiba lewat "Mancing di sini" dari jauh: pakai arah yang sudah dihitung
    if (this.arriveYaw !== null && Math.hypot(this.arriveAt.x - this.x, this.arriveAt.z - this.z) < 0.6) { const y = this.arriveYaw; this.arriveYaw = null; return { x: this.x, z: this.z, yaw: y, ok: true }; }
    const y = aimAtWater(this.x, this.z, prefYaw);
    if (y !== null) return { x: this.x, z: this.z, yaw: y, ok: true };
    const f = faceNearestWater(this.x, this.z, prefYaw);
    return { x: this.x, z: this.z, yaw: f.yaw, ok: f.ok };
  }

  update(dt: number, camYaw: number) {
    const P = this.f.angler.pose;
    if (!this.active) { P.walk += (0 - P.walk) * Math.min(1, dt * 8); return; }
    const pv = PACES[this.pace].v;
    let dirX = 0, dirZ = 0, want = 0;
    const jm = Math.min(1, Math.hypot(this.input.x, this.input.y));
    if (jm > 0.08) {
      this.cancelAuto();
      // relatif kamera: maju = arah pandang kamera
      const fx = -Math.sin(camYaw), fz = -Math.cos(camYaw), rx = Math.cos(camYaw), rz = -Math.sin(camYaw);
      dirX = fx * this.input.y + rx * this.input.x; dirZ = fz * this.input.y + rz * this.input.x;
      const l = Math.hypot(dirX, dirZ) || 1; dirX /= l; dirZ /= l;
      want = pv * (jm < 0.9 ? Math.max(0.35, jm) : 1);
    } else if (this.path && this.path.length) {
      const wp = this.path[0];
      const dx = wp.x - this.x, dz = wp.z - this.z, d = Math.hypot(dx, dz);
      const last = this.path.length === 1;
      if (d < (last ? 0.25 : 0.6)) {
        this.path.shift();
        if (!this.path.length) { const t = this.target!; this.path = null; this.target = null; if (t.yaw !== undefined) { this.arriveYaw = t.yaw; this.arriveAt = { x: this.x, z: this.z }; } this.onArrive(t); }
      } else {
        dirX = dx / d; dirZ = dz / d;
        want = last ? Math.min(pv, 0.6 + d * 1.4) : pv;
      }
    }
    // belok: putar di tempat bila selisih besar, lalu maju
    let diff = 0;
    if (want > 0) {
      const wy = Math.atan2(-dirX, -dirZ);
      diff = wrap(wy - this.yaw);
      const rate = (Math.abs(diff) > 1.2 && this.speed < 0.8 ? 9 : 5.5) * dt;
      this.yaw = wrap(this.yaw + THREE.MathUtils.clamp(diff, -rate, rate));
      this.lookDir.set(dirX, 0, dirZ);
    }
    const target = want * Math.max(0, Math.cos(Math.min(Math.PI / 2, Math.abs(diff) * 1.2)));
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 4.5 : 8));
    if (this.speed < 0.01) this.speed = 0;
    // gerak dengan batas area pijak; menggeser sepanjang tepi bila menabrak
    if (this.speed > 0) {
      const mx = -Math.sin(this.yaw) * this.speed * dt, mz = -Math.cos(this.yaw) * this.speed * dt;
      const tryMove = (nx: number, nz: number) => {
        const w = walkInfo(nx, nz);
        if (!w || Math.abs(w.y - this.y) > 0.55) return false;
        // lihat sedikit ke depan supaya tidak berdiri tepat di bibir papan
        const ahead = walkInfo(nx - Math.sin(this.yaw) * 0.18, nz - Math.cos(this.yaw) * 0.18);
        if (!ahead) return false;
        this.x = nx; this.z = nz; this.surface = w.s; return true;
      };
      if (!tryMove(this.x + mx, this.z + mz) && !tryMove(this.x + mx, this.z) && !tryMove(this.x, this.z + mz)) {
        this.speed *= 0.3; this.stuckT += dt;
        if (this.stuckT > 1.2) { this.stuckT = 0; if (this.path) { this.cancelAuto(); this.onBlocked(); } }
      } else this.stuckT = 0;
    }
    const h = walkInfo(this.x, this.z)?.y ?? this.y;
    this.y += (h - this.y) * Math.min(1, dt * 12);
    const r = this.f.angler.root;
    r.position.set(this.x, this.y, this.z); r.rotation.y = this.yaw;
    // langkah: frekuensi mengikuti kecepatan (langkah lebih panjang saat berlari)
    const step = stepLength(this.speed);
    P.walkPhase += dt * Math.PI * this.speed / step;
    const wTarget = this.speed < 0.05 ? 0 : Math.min(WALK_MAX, this.speed / 1.45);
    P.walk += (wTarget - P.walk) * Math.min(1, dt * 8);
    if (P.walk < 0.02 && this.speed === 0) { // berdiri tenang: kembalikan fase ke kaki rapat
      P.walkPhase += wrap(Math.round(P.walkPhase / Math.PI) * Math.PI - P.walkPhase) * Math.min(1, dt * 6);
    }
    // kepala melihat ke arah tujuan (mendahului belokan)
    P.look = new THREE.Vector3(this.x + this.lookDir.x * 6, this.y + 1.4, this.z + this.lookDir.z * 6);
    // pohon dekat mengikuti pemain
    if (Math.hypot(this.x - this.lastFocus.x, this.z - this.lastFocus.z) > 22) { this.lastFocus = { x: this.x, z: this.z }; this.onFocus(this.x, this.z); }
  }
}

// Pengganti ringan EZ-Tree untuk versi artifact (halaman claude.ai tidak bisa memuat source EZ-Tree).
// Antarmuka sama dengan yang dipakai vegetation.ts: loadPreset, options, generate, branchesMesh, leavesMesh.
// Pohon dibuat prosedural: batang meruncing & melengkung, cabang bertingkat, daun bertekstur.
import * as THREE from 'three';
import { getBarkTexture, getLeafTexture } from '../world/ezTextures';

interface P { bark: string; leaf: string; levels: number; len: number; rad: number; kids: number[]; angle: number; lenK: number; radK: number; leaves: number; leafSize: number; start: number; gnarl: number; up: number }
const PRESETS: Record<string, P> = {
  'Oak Medium':   { bark: 'oak',    leaf: 'oak',   levels: 3, len: 4.2, rad: 0.3,  kids: [6, 4, 3], angle: 0.85, lenK: 0.62, radK: 0.5, leaves: 12, leafSize: 0.95, start: 0.4,  gnarl: 0.28, up: 0.25 },
  'Ash Medium':   { bark: 'willow', leaf: 'ash',   levels: 3, len: 4.6, rad: 0.26, kids: [5, 4, 3], angle: 0.7,  lenK: 0.62, radK: 0.5, leaves: 12, leafSize: 0.85, start: 0.45, gnarl: 0.2,  up: 0.35 },
  'Aspen Medium': { bark: 'birch',  leaf: 'aspen', levels: 3, len: 6.5, rad: 0.2,  kids: [6, 3, 2], angle: 0.6,  lenK: 0.5,  radK: 0.5, leaves: 12, leafSize: 0.75, start: 0.5,  gnarl: 0.12, up: 0.45 },
  'Oak Large':    { bark: 'oak',    leaf: 'oak',   levels: 3, len: 5.2, rad: 0.45, kids: [7, 4, 3], angle: 0.95, lenK: 0.64, radK: 0.5, leaves: 13, leafSize: 1.05, start: 0.35, gnarl: 0.3,  up: 0.2 },
  'Bush 1':       { bark: 'oak',    leaf: 'oak',   levels: 2, len: 0.5, rad: 0.07, kids: [8, 4],    angle: 1.0,  lenK: 2.2,  radK: 0.8, leaves: 14, leafSize: 0.55, start: 0.1,  gnarl: 0.35, up: 0.3 },
  'Bush 2':       { bark: 'willow', leaf: 'ash',   levels: 2, len: 0.4, rad: 0.06, kids: [7, 4],    angle: 1.1,  lenK: 2.0,  radK: 0.8, leaves: 12, leafSize: 0.5,  start: 0.1,  gnarl: 0.35, up: 0.25 },
};

function rng(seed: number) { let s = (seed % 2147483646) + 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

export class Tree extends THREE.Group {
  options = { seed: 1, leaves: { tint: 0xffffff, count: 12 } as { tint: number; count: number; [k: string]: unknown }, branch: { sections: {} as Record<string, number>, segments: {} as Record<string, number> } } as { seed: number; leaves: { tint: number; count: number; [k: string]: unknown }; [k: string]: unknown };
  branchesMesh = new THREE.Mesh(); leavesMesh = new THREE.Mesh();
  private p: P = PRESETS['Oak Medium'];
  loadPreset(name: string) { this.p = PRESETS[name] ?? PRESETS['Oak Medium']; this.options.leaves.count = this.p.leaves; }
  update(_t: number) { /* angin ditangani shader vegetation */ }

  generate() {
    const P = this.p, r = rng(this.options.seed), leafN = Math.max(4, Math.round(this.options.leaves.count));
    const bp: number[] = [], bn: number[] = [], bu: number[] = [], bi: number[] = [];
    const lp: number[] = [], ln: number[] = [], lu: number[] = [], li: number[] = [];
    const UP = new THREE.Vector3(0, 1, 0);
    const addLeaf = (c: THREE.Vector3, out: THREE.Vector3, size: number) => {
      const a = out.clone().addScaledVector(UP, -0.35 + r() * 0.3).normalize();          // arah daun menjuntai keluar
      const side = new THREE.Vector3().crossVectors(a, UP); if (side.lengthSq() < 1e-4) side.set(1, 0, 0); side.normalize().multiplyScalar(size * 0.5);
      const tip = c.clone().addScaledVector(a, size);
      const n = new THREE.Vector3().crossVectors(side, a).normalize().lerp(UP, 0.6).normalize();
      const b = lp.length / 3;
      for (const [q, u, v] of [[c.clone().sub(side), 0, 0], [c.clone().add(side), 1, 0], [tip.clone().add(side), 1, 1], [tip.clone().sub(side), 0, 1]] as [THREE.Vector3, number, number][]) { lp.push(q.x, q.y, q.z); ln.push(n.x, n.y, n.z); lu.push(u, v); }
      li.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    const branch = (o: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number, lv: number) => {
      const S = lv === 0 ? 6 : lv === 1 ? 4 : 3, R = lv === 0 ? 7 : lv === 1 ? 5 : 4;
      const pts: THREE.Vector3[] = [o.clone()], dirs: THREE.Vector3[] = [dir.clone()];
      let d = dir.clone(), u = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP).normalize();
      const ring = (c: THREE.Vector3, dd: THREE.Vector3, uu: THREE.Vector3, rr: number, t: number) => {
        const vv = new THREE.Vector3().crossVectors(dd, uu);
        for (let j = 0; j <= R; j++) {
          const a = (j / R) * Math.PI * 2, nrm = uu.clone().multiplyScalar(Math.cos(a)).addScaledVector(vv, Math.sin(a));
          bp.push(c.x + nrm.x * rr, c.y + nrm.y * rr, c.z + nrm.z * rr); bn.push(nrm.x, nrm.y, nrm.z); bu.push(j / R, t * len / Math.max(0.3, rad * 6));
        }
      };
      const radAt = (t: number) => rad * (1 - t * 0.62);
      ring(o, d, u, radAt(0), 0);
      for (let i = 1; i <= S; i++) {
        const nd = d.clone().add(new THREE.Vector3((r() - 0.5) * P.gnarl, (r() - 0.5) * P.gnarl * 0.5 + P.up * 0.15 * (lv ? 1 : 0.3), (r() - 0.5) * P.gnarl)).normalize();
        u.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(d, nd)).normalize(); d = nd;
        const c = pts[i - 1].clone().addScaledVector(d, len / S); pts.push(c); dirs.push(d.clone());
        ring(c, d, u, radAt(i / S), i / S);
        const b0 = bp.length / 3 - (R + 1) * 2;
        for (let j = 0; j < R; j++) { const a = b0 + j, b = b0 + R + 1 + j; bi.push(a, b, a + 1, a + 1, b, b + 1); }
      }
      const at = (t: number) => { const f = t * S, i = Math.min(S - 1, Math.floor(f)); return { p: pts[i].clone().lerp(pts[i + 1], f - i), d: dirs[i + 1].clone() }; };
      if (lv < P.levels - 1) {
        const n = P.kids[lv] ?? 2;
        for (let k = 0; k < n; k++) {
          const t = Math.min(0.96, P.start + (1 - P.start) * (k + 0.3 + r() * 0.5) / n), q = at(t);
          const perp = new THREE.Vector3().crossVectors(q.d, UP); if (perp.lengthSq() < 1e-4) perp.set(1, 0, 0);
          perp.normalize().applyAxisAngle(q.d, (k / n) * Math.PI * 2 + r() * 1.2);
          const cd = q.d.clone().applyAxisAngle(perp, P.angle * (0.75 + r() * 0.5)).addScaledVector(UP, P.up).normalize();
          branch(q.p, cd, len * P.lenK * (1.05 - t * 0.35) * (0.85 + r() * 0.3), Math.max(0.012, radAt(t) * P.radK), lv + 1);
        }
      }
      if (lv >= P.levels - 1) {
        for (let k = 0; k < leafN; k++) {
          const t = 0.25 + r() * 0.75, q = at(t);
          const out = new THREE.Vector3(r() - 0.5, r() * 0.6 - 0.1, r() - 0.5).addScaledVector(q.d, 0.5).normalize();
          addLeaf(q.p.clone().addScaledVector(out, 0.05), out, P.leafSize * (0.7 + r() * 0.6));
        }
      }
    };
    branch(new THREE.Vector3(0, -0.1, 0), new THREE.Vector3((r() - 0.5) * 0.08, 1, (r() - 0.5) * 0.08).normalize(), P.len, P.rad, 0);
    const mk = (p: number[], n: number[], u: number[], i: number[]) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(n, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(u, 2)); g.setIndex(i); g.computeBoundingSphere(); return g; };
    this.clear();
    const bark = getBarkTexture(P.bark, 'color', { x: 1, y: 1 }), barkN = getBarkTexture(P.bark, 'normal', { x: 1, y: 1 });
    this.branchesMesh = new THREE.Mesh(mk(bp, bn, bu, bi), new THREE.MeshPhongMaterial({ map: bark, normalMap: barkN, color: 0xd8d0c4 }));
    this.leavesMesh = new THREE.Mesh(mk(lp, ln, lu, li), new THREE.MeshPhongMaterial({ map: getLeafTexture(P.leaf), color: this.options.leaves.tint, side: THREE.DoubleSide, alphaTest: 0.5 }));
    this.branchesMesh.castShadow = this.leavesMesh.castShadow = true;
    this.add(this.branchesMesh, this.leavesMesh);
  }
}

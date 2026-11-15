// IK dua tulang (bahu-siku-tangan) di ruang dunia. Tidak bergantung pada sumbu lokal tulang,
// jadi bekerja untuk kerangka karakter mana pun (Mixamo, Ready Player Me, dll).
import * as THREE from 'three';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
const _q = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _wq = new THREE.Quaternion();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();

/** Putar tulang supaya arah (dari posisi tulang ke titik `childWorld`) menghadap `toWorld`. */
export function aimBone(bone: THREE.Object3D, fromDirWorld: THREE.Vector3, toDirWorld: THREE.Vector3) {
  _q.setFromUnitVectors(_v1.copy(fromDirWorld).normalize(), _v2.copy(toDirWorld).normalize());
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_q);
  setWorldQuaternion(bone, _wq);
}

export function setWorldQuaternion(bone: THREE.Object3D, q: THREE.Quaternion) {
  if (bone.parent) { bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(q)); }
  else bone.quaternion.copy(q);
  bone.updateMatrixWorld(true);
}

/** Putar tulang di sekitar sumbu dunia. */
export function rotateBoneWorld(bone: THREE.Object3D, axisWorld: THREE.Vector3, angle: number) {
  if (!angle) return;
  bone.getWorldQuaternion(_wq);
  _q.setFromAxisAngle(axisWorld, angle);
  _wq.premultiply(_q);
  setWorldQuaternion(bone, _wq);
}

/**
 * upper → lower → end: mis. lengan atas → lengan bawah → tangan.
 * target: posisi dunia tangan. pole: titik ke mana siku diarahkan.
 */
export function solveTwoBone(upper: THREE.Object3D, lower: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
  upper.updateMatrixWorld(true);
  upper.getWorldPosition(_a); lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const l1 = _a.distanceTo(_b), l2 = _b.distanceTo(_c);
  const toT = new THREE.Vector3().subVectors(target, _a);
  const d = Math.min(Math.max(toT.length(), Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  const dir = toT.normalize();
  // titik siku yang diinginkan
  const x = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const pv = new THREE.Vector3().subVectors(pole, _a);
  pv.addScaledVector(dir, -pv.dot(dir));
  if (pv.lengthSq() < 1e-8) pv.set(0, -1, 0).addScaledVector(dir, -dir.y);
  pv.normalize();
  const elbow = new THREE.Vector3().copy(_a).addScaledVector(dir, x).addScaledVector(pv, h);
  // lengan atas mengarah ke siku
  aimBone(upper, _v1.subVectors(_b, _a).clone(), elbow.clone().sub(_a));
  // lengan bawah mengarah ke target
  lower.getWorldPosition(_b); end.getWorldPosition(_c);
  const endTarget = _a.clone().addScaledVector(dir, d);
  aimBone(lower, _c.clone().sub(_b), endTarget.sub(_b));
}

/** Orientasi dari dua sumbu: `primary` (sumbu lokal A → arah dunia a) dan `secondary` (B → b). */
export function quatFromAxes(localA: THREE.Vector3, localB: THREE.Vector3, worldA: THREE.Vector3, worldB: THREE.Vector3) {
  const la = localA.clone().normalize(), lb = localB.clone().addScaledVector(la, -localB.dot(la)).normalize(), lc = new THREE.Vector3().crossVectors(la, lb);
  const wa = worldA.clone().normalize(), wb = worldB.clone().addScaledVector(wa, -worldB.dot(wa)).normalize(), wc = new THREE.Vector3().crossVectors(wa, wb);
  const L = new THREE.Matrix4().makeBasis(la, lb, lc), W = new THREE.Matrix4().makeBasis(wa, wb, wc);
  return new THREE.Quaternion().setFromRotationMatrix(W.multiply(L.transpose()));
}

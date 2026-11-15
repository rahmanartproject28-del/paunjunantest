export class Vector3 { constructor(public x = 0, public y = 0, public z = 0) {} }
export const MathUtils = { clamp: (v: number, a: number, b: number) => Math.min(b, Math.max(a, v)) };
export interface Vector3 { set(x: number, y: number, z: number): this }
Vector3.prototype.set = function (x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; return this; };
(MathUtils as any).clamp = MathUtils.clamp;

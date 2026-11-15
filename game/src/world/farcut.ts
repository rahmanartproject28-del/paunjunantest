// "Sembunyikan pemandangan ujung danau": satu set uniform dipakai medan & air.
// Saat aktif, daratan > farR dari dermaga diturunkan ke bawah muka air dan air di sana dibuat dalam (tidak tembus),
// sehingga danau tampak menyambung langsung ke latar (foto pegunungan / pegunungan bawaan) tanpa bekas bukit.
import * as THREE from 'three';
export const FAR = { on: { value: 0 }, c: { value: new THREE.Vector2(0, -5) }, r: { value: 85 } };
/** Titik (x,z) termasuk "ujung danau"? */
export const isFar = (x: number, z: number) => Math.hypot(x - FAR.c.value.x, z - FAR.c.value.y) > FAR.r.value;

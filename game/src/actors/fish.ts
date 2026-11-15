// Ikan 3D realistis: satu model bertekstur foto (sisik, sirip), diwarnai ulang per jenis
// lewat shader (punggung-sisi-perut) sehingga tiap jenis terlihat berbeda, dan meliuk saat berenang.
import * as THREE from 'three';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { SPECIES, type SpeciesId } from '@paunjunan/shared';

const MODEL_LEN = 0.643, MODEL_H = 0.287;
export const FISH_HEAD_SIGN = 1; // kepala di +Z model

export class FishActor {
  group = new THREE.Group();
  mesh: THREE.Mesh;
  private u = {
    time: { value: 0 }, swim: { value: 0 }, amp: { value: 0.08 }, speed: { value: 8 },
    cBack: { value: new THREE.Color() }, cSide: { value: new THREE.Color() }, cBelly: { value: new THREE.Color() }, cFin: { value: new THREE.Color() },
    recolor: { value: 0.75 }, wet: { value: 1 },
  };
  species: SpeciesId = 'nila';
  lengthM = 0.3;

  constructor(gltf: GLTF) {
    let src: THREE.Mesh | null = null;
    gltf.scene.traverse(o => { if ((o as THREE.Mesh).isMesh && !src) src = o as THREE.Mesh; });
    const base = src! as THREE.Mesh;
    const mat = (base.material as THREE.MeshStandardMaterial).clone();
    mat.roughness = 0.28; mat.metalness = 0.15; mat.envMapIntensity = 1.4;
    const U = this.u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = `uniform float time, swim, amp, speed;\nvarying float vH; varying float vSide;\n` + sh.vertexShader
        .replace('#include <begin_vertex>', `
          #include <begin_vertex>
          vH = clamp(position.y / ${MODEL_H.toFixed(3)}, 0.0, 1.0);
          vSide = abs(position.x) / 0.075;
          // liukan badan: ekor (-Z) bergerak paling jauh
          float tl = clamp((${(MODEL_LEN / 2).toFixed(3)} - position.z * ${FISH_HEAD_SIGN.toFixed(1)}) / ${MODEL_LEN.toFixed(3)}, 0.0, 1.0);
          float w = sin(time * speed - tl * 5.5) * amp * tl * tl * (0.35 + swim);
          transformed.x += w;`)
        .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>`);
      sh.fragmentShader = `uniform vec3 cBack, cSide, cBelly, cFin; uniform float recolor, wet;\nvarying float vH; varying float vSide;\n` + sh.fragmentShader
        .replace('#include <map_fragment>', `
          #include <map_fragment>
          float lum = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          vec3 grad = mix(cBelly, cSide, smoothstep(0.18, 0.45, vH));
          grad = mix(grad, cBack, smoothstep(0.62, 0.88, vH));
          float fin = smoothstep(0.35, 0.05, vSide) * step(0.8, vH);
          grad = mix(grad, cFin, fin * 0.6);
          vec3 tinted = grad * (0.35 + lum * 1.9);
          diffuseColor.rgb = mix(diffuseColor.rgb, tinted, recolor);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.18, wet);`);
    };
    mat.customProgramCacheKey = () => 'fishRecolor';
    this.mesh = new THREE.Mesh(base.geometry, mat);
    this.mesh.castShadow = true;
    // pusatkan model: titik (0,0,0) = tengah badan
    this.mesh.position.set(0, -MODEL_H / 2, 0);
    const pivot = new THREE.Group(); pivot.add(this.mesh);
    this.group.add(pivot);
    this.group.visible = false;
    // titik pegang DI BAWAH badan (bawah insang & pangkal ekor) → tangan menopang dari bawah, badan ikan tetap terlihat
    this.group.userData.gripHead = new THREE.Vector3(0, -MODEL_H * 0.3, MODEL_LEN * 0.3 * FISH_HEAD_SIGN);
    this.group.userData.gripTail = new THREE.Vector3(0, -MODEL_H * 0.22, -MODEL_LEN * 0.34 * FISH_HEAD_SIGN);
  }

  setSpecies(k: SpeciesId, weight: number, lengthCm: number) {
    const L = SPECIES[k].look;
    this.species = k;
    this.u.cBack.value.set(L.back); this.u.cSide.value.set(L.side); this.u.cBelly.value.set(L.belly); this.u.cFin.value.set(L.fin);
    this.u.recolor.value = k === 'nila' ? 0.55 : 0.8;
    this.lengthM = lengthCm / 100;
    const s = this.lengthM / MODEL_LEN;
    this.group.scale.set(s / Math.sqrt(L.stretch) * 1.0, s * L.height / Math.sqrt(L.stretch), s * Math.sqrt(L.stretch));
    this.u.speed.value = 9 - Math.min(5, weight * 0.4);
    void weight;
  }

  /** swim 0..1: kuat liukan; dipanggil tiap gambar. */
  update(time: number, swim: number, amp = 0.08) {
    this.u.time.value = time; this.u.swim.value = swim; this.u.amp.value = amp;
  }
}

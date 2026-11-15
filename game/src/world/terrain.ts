// Medan: tepian danau berumput, tanah lumpur di pinggir air, bukit dan pegunungan berkabut.
import * as THREE from 'three';
import { groundH, lakeE, LOC, IS_SERENE } from './layout';
import { Q } from '../core/quality';
import { FAR } from './farcut';

/** waktu dunia untuk kilau kaustik di dasar danau jernih */
export const terrainTime = { value: 0 };
/** Foto dasar danau (diunggah admin): menggantikan pasir-kerikil bawaan di bawah air (Danau Serene). */
const bedU = { tBed: { value: null as THREE.Texture | null }, uBedOn: { value: 0 } };
export function setBedPhoto(url: string) {
  bedU.tBed.value?.dispose(); bedU.tBed.value = null; bedU.uBedOn.value = 0;
  if (!url) return;
  new THREE.TextureLoader().load(url, t => {
    t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping; t.anisotropy = 4;   // bercermin → sambungan ubin tak terlihat
    bedU.tBed.value = t; bedU.uBedOn.value = 1;
  });
}
export function buildTerrain(tex: { grass: THREE.Texture; dirt: THREE.Texture; dirtN: THREE.Texture }) {
  const size = 900, seg = Q.terrainSeg;
  // grid tidak seragam: rapat di dekat danau, jarang di jauh (segitiga lebih sedikit)
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const blend = new Float32Array(pos.count * 2);
  const warp = (v: number) => Math.sign(v) * Math.pow(Math.abs(v) / (size / 2), 1.6) * (size / 2);
  for (let i = 0; i < pos.count; i++) {
    const x = warp(pos.getX(i)) , z = warp(pos.getZ(i)) - 30;
    const h = groundH(x, z);
    pos.setXYZ(i, x, h, z);
    const e = lakeE(x, z);
    // 0 = rumput, 1 = tanah/lumpur
    // lebar pita tepi air: pasir lebar di pantai & pulau, kerikil di sungai, lumpur tipis di danau
    const band = IS_SERENE ? 0.035 : LOC === 'pantai' ? 0.6 : LOC === 'laut' ? 0.25 : LOC === 'sungai' ? 0.12 : 0.03;
    const mud = h > 4 ? 0 : 1 - Math.min(1, Math.max(0, (e - 1.0) / band));
    blend[i * 2] = mud;
    blend[i * 2 + 1] = Math.min(1, Math.max(0, (h - 12) / 30)); // lereng tinggi: lebih gelap/berbatu
  }
  geo.setAttribute('blend', new THREE.BufferAttribute(blend, 2));
  geo.computeVertexNormals();

  for (const t of [tex.grass, tex.dirt, tex.dirtN]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; }
  const mat = new THREE.MeshStandardMaterial({ map: tex.grass, roughness: 0.95, metalness: 0 });
  const tint = IS_SERENE ? 'vec3(0.95, 0.9, 0.78)' : LOC === 'pantai' || LOC === 'laut' ? 'vec3(1.05, 0.93, 0.7)' : LOC === 'sungai' ? 'vec3(0.55, 0.52, 0.47)' : 'vec3(0.42, 0.37, 0.3)';
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = '#define DIRT_TINT ' + tint + '\n' + (IS_SERENE ? '#define SERENE 1\n' : '') + sh.fragmentShader;
    sh.uniforms.tDirt = { value: tex.dirt }; sh.uniforms.uTime = terrainTime;
    sh.uniforms.tBed = bedU.tBed; sh.uniforms.uBedOn = bedU.uBedOn;
    sh.uniforms.uFarOn = FAR.on; sh.uniforms.uFarC = FAR.c; sh.uniforms.uFarR = FAR.r;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 blend;\nvarying vec2 vBlend;\nvarying vec3 vWPos;\nuniform float uFarOn, uFarR; uniform vec2 uFarC;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n{ vec4 wq = modelMatrix * vec4(transformed, 1.0); float fk = uFarOn * smoothstep(uFarR, uFarR + 22.0, distance(wq.xz, uFarC)); transformed.y = mix(transformed.y, min(transformed.y, -2.5), fk); }')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBlend = blend;\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <common>', '#include <common>\nvarying vec3 vWN;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D tDirt, tBed;\nuniform float uTime, uBedOn;\nvarying vec2 vBlend;\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <map_fragment>', `
        vec2 uvA = vWPos.xz * 0.16;
        vec3 g1 = texture2D(map, uvA).rgb;
        vec3 g2 = texture2D(map, vWPos.xz * 0.037 + 0.3).rgb;
        vec3 grass = mix(g1, g2, 0.45) * vec3(0.62, 0.7, 0.46);
        vec3 dirt = texture2D(tDirt, vWPos.xz * 0.22).rgb * DIRT_TINT;
        float wet = smoothstep(0.35, -0.3, vWPos.y) * 1.0;          // tanah basah di tepi air
        dirt *= mix(1.0, 0.55, wet);
        float n = texture2D(map, vWPos.xz * 0.011).g;
        float m = clamp(vBlend.x + (n - 0.5) * 0.5, 0.0, 1.0);
        vec3 col = mix(grass, dirt, smoothstep(0.35, 0.75, m));
        col = mix(col, vec3(0.16, 0.2, 0.13), vBlend.y * 0.7);  // lereng tinggi: hutan gelap
        #ifdef SERENE
          // rumput pegunungan lebih segar; dasar danau pasir-kerikil pucat dengan kaustik bergerak
          col = mix(col, col * vec3(0.95, 1.18, 0.9), (1.0 - m) * (1.0 - vBlend.y));
          // lereng curam → batu abu kebiruan (tebing air terjun, bukit pinggir danau)
          // normal halus (bukan per segitiga) → tebing batu tidak lagi bercak segitiga
          float rn = texture2D(tDirt, vWPos.xz * 0.05).r;
          float rock = smoothstep(0.84, 0.66, normalize(vWN).y + (rn - 0.5) * 0.12) * step(0.4, vWPos.y);
          vec3 rockC = (texture2D(tDirt, vWPos.xz * 0.21).rgb * 0.6 + texture2D(tDirt, vec2(vWPos.x + vWPos.z, vWPos.y) * 0.09).rgb * 0.6) * vec3(0.95, 0.98, 1.04);
          col = mix(col, rockC, rock);
          if (vWPos.y < 0.05) {
            float dd = clamp(-vWPos.y / 4.0, 0.0, 1.0);
            vec3 bed = texture2D(tDirt, vWPos.xz * 0.35).rgb * vec3(0.95, 0.92, 0.82);
            if (uBedOn > 0.5) bed = texture2D(tBed, vWPos.xz / 7.0).rgb;   // foto dasar danau: satu ubin ±7 m
            col = mix(col, bed, smoothstep(0.05, -0.25, vWPos.y));
            vec2 cp = vWPos.xz * 2.3;
            float ca = sin(cp.x * 2.1 + uTime * 1.1 + sin(cp.y * 1.7 + uTime * 0.7) * 1.6);
            float cb = sin(cp.y * 2.3 - uTime * 0.9 + sin(cp.x * 1.3 - uTime * 0.6) * 1.8);
            float caus = pow(1.0 - abs(ca * cb), 9.0);
            col += vec3(0.55, 0.75, 0.7) * caus * (1.0 - dd) * 0.35;
            col *= mix(vec3(1.0), vec3(0.6, 0.86, 0.86), dd);
          }
        #endif
        diffuseColor.rgb *= col;`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  return mesh;
}

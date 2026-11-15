// Air danau: pantulan cermin (resolusi rendah), dua lapis riak, kilau matahari,
// air dangkal jernih di tepi, dan riak lingkaran dari cipratan / pelampung / hujan.
import * as THREE from 'three';
import { groundH, LAKE, WATER_Y, LOC, FLOW, IS_SERENE, MAPSTYLE } from './layout';
import { Q } from '../core/quality';
import { FAR } from './farcut';
// objek bantu pantulan yang dipakai ulang tiap gambar (mengurangi sampah memori → mengurangi patah-patah)
const WT = { p: new THREE.Vector3(), t: new THREE.Vector3(), u: new THREE.Vector3(), n: new THREE.Vector3(), pl: new THREE.Plane(), cp: new THREE.Vector4(), q: new THREE.Vector4() };

const MAX_RIPPLES = 12;

export class Water extends THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
  rt: THREE.WebGLRenderTarget | null = null;
  private mirrorCam = new THREE.PerspectiveCamera();
  private texMatrix = new THREE.Matrix4();
  private ripples: { x: number; z: number; t: number; s: number }[] = [];
  private frame = 0;
  reflectionOn = Q.reflection;

  constructor(normals: THREE.Texture) {
    const W = LAKE.rx * 2.6, D = LAKE.rz * 2.6;
    // Serene: bidang air diperluas sampai cakrawala (dipakai saat pemandangan ujung danau disembunyikan); tekstur kedalaman tetap seluas danau
    const geo = new THREE.PlaneGeometry(IS_SERENE ? 2600 : W, IS_SERENE ? 2600 : D, 1, 1);
    geo.rotateX(-Math.PI / 2);
    geo.translate(LAKE.cx, WATER_Y, LAKE.cz);
    normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

    // tekstur kedalaman (dari bentuk dasar danau) untuk warna dangkal & tepi jernih
    const N = 128, data = new Uint8Array(N * N * 4);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = LAKE.cx - W / 2 + (i + 0.5) / N * W, z = LAKE.cz - D / 2 + (j + 0.5) / N * D;
      const d = Math.max(0, Math.min(1, -groundH(x, z) / 6));
      const k = (j * N + i) * 4; data[k] = d * 255; data[k + 1] = data[k + 2] = 0; data[k + 3] = 255;
    }
    const depthTex = new THREE.DataTexture(data, N, N); depthTex.magFilter = depthTex.minFilter = THREE.LinearFilter; depthTex.needsUpdate = true;

    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
        tReflect: { value: null }, tNormal: { value: normals }, tDepth: { value: depthTex },
        texMatrix: { value: new THREE.Matrix4() }, time: { value: 0 }, useRefl: { value: 0 },
        sunDir: { value: new THREE.Vector3(0.3, 0.8, -0.5) }, sunColor: { value: new THREE.Color(1, 0.95, 0.85) },
        deepColor: { value: new THREE.Color(MAPSTYLE ? MAPSTYLE.deep : IS_SERENE ? 0x0a5876 : LOC === 'laut' ? 0x06244a : LOC === 'pantai' ? 0x0b4a6a : LOC === 'sungai' ? 0x2a3a2a : 0x0e2a24) },
        shallowColor: { value: new THREE.Color(MAPSTYLE ? MAPSTYLE.shallow : IS_SERENE ? 0x3cc9c0 : LOC === 'laut' ? 0x1a5a8a : LOC === 'pantai' ? 0x3fb4b0 : LOC === 'sungai' ? 0x6a6a4a : 0x3f6b4c) },
        flow: { value: new THREE.Vector2(FLOW.x, FLOW.z) }, waveK: { value: MAPSTYLE ? MAPSTYLE.waveK : LOC === 'laut' ? 2.2 : LOC === 'pantai' ? 1.6 : LOC === 'sungai' ? 1.4 : 1 },
        skyTop: { value: new THREE.Color(0x4a7fc0) }, skyHor: { value: new THREE.Color(0xbfd4e0) },
        bounds: { value: new THREE.Vector4(LAKE.cx - W / 2, LAKE.cz - D / 2, W, D) },
        wind: { value: 1 }, rain: { value: 0 }, farOn: FAR.on, farC: FAR.c, farR: FAR.r, clarity: { value: MAPSTYLE ? MAPSTYLE.clarity : IS_SERENE ? 1 : 0 }, bright: { value: 1 }, fishPos: { value: new THREE.Vector3(0, -99, 0) },
        ripples: { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector4(0, 0, -1, 0)) },
      }]),
      vertexShader: /* glsl */`
        uniform mat4 texMatrix; varying vec4 vRefl; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){
          vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz;
          vRefl = texMatrix * wp;
          vec4 mvPosition = viewMatrix * wp;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tReflect, tNormal, tDepth; uniform float time, useRefl, wind, rain, bright, waveK, clarity, farOn, farR; uniform vec2 farC; uniform vec2 flow;
        uniform vec3 sunDir, sunColor, deepColor, shallowColor, skyTop, skyHor, fishPos; uniform vec4 bounds;
        uniform vec4 ripples[${MAX_RIPPLES}];
        varying vec4 vRefl; varying vec3 vW;
        #include <fog_pars_fragment>
        vec3 nrm(vec2 uv){ return texture2D(tNormal, uv).rgb * 2.0 - 1.0; }
        void main(){
          vec2 p = vW.xz;
          float w = 0.6 + 0.4 * wind;
          // arus: pola riak ikut hanyut searah aliran (sungai deras, laut bergelombang)
          vec3 n1 = nrm(p * 0.045 + vec2(time * 0.011, time * 0.007) * w - flow * 0.045 * time);
          vec3 n2 = nrm(p * 0.13 + vec2(-time * 0.017, time * 0.021) * w - flow * 0.13 * time);
          vec3 n3 = nrm(p * 0.6 + vec2(time * 0.03, -time * 0.025));
          vec3 n = normalize(vec3((n1.x + n2.x * 0.7) * waveK + n3.x * 0.25 * rain, 6.0 / w, (n1.y + n2.y * 0.7) * waveK + n3.y * 0.25 * rain));
          // riak lingkaran
          for (int i = 0; i < ${MAX_RIPPLES}; i++) {
            vec4 r = ripples[i]; if (r.z < 0.0) continue;
            float d = distance(p, r.xy), rad = r.z * 1.6 * r.w + 0.05;
            float ring = exp(-pow((d - rad) * 7.0 / r.w, 2.0)) * (1.0 - smoothstep(0.0, 2.2, r.z));
            vec2 dir = d > 0.001 ? (p - r.xy) / d : vec2(0.0);
            n.xz += dir * ring * sin((d - rad) * 22.0) * 0.9;
          }
          n = normalize(n);
          vec3 V = normalize(cameraPosition - vW);
          float fres = 0.02 + 0.98 * pow(1.0 - max(dot(V, n), 0.0), 5.0);
          vec2 duv = vec2(bounds.z > 0.0 ? (vW.x - bounds.x) / bounds.z : 0.0, (vW.z - bounds.y) / bounds.w);
          float depth = texture2D(tDepth, duv).r;
          if (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) { if (farOn < 0.5) discard; depth = 0.0; }
          depth = max(depth, farOn * smoothstep(farR, farR + 30.0, distance(p, farC)) * 0.9);
          // warna tubuh air: hijau zaitun tua, lebih terang di dangkal
          vec3 body = mix(shallowColor, deepColor, smoothstep(0.0, 0.55, depth)) * bright;
          vec3 refl;
          vec3 R = reflect(-V, n);
          vec3 skyCol = mix(skyHor, skyTop, clamp(R.y * 1.4, 0.0, 1.0));
          if (useRefl > 0.5) {
            vec2 ruv = vRefl.xy / vRefl.w + n.xz * 0.035;
            vec2 px = vec2(0.0025, 0.0035) * (1.0 + clarity * 1.6);
            refl = (texture2D(tReflect, ruv).rgb * 2.0 + texture2D(tReflect, ruv + px).rgb + texture2D(tReflect, ruv - px).rgb + texture2D(tReflect, ruv + vec2(px.x, -px.y)).rgb + texture2D(tReflect, ruv + vec2(-px.x, px.y)).rgb) / 6.0;
            float rl = dot(refl, vec3(0.3, 0.59, 0.11)); refl *= min(1.0, 1.6 / max(rl, 1e-3));
            refl = mix(refl, skyCol, clarity * 0.3);   // Serene: pantulan lembut, tidak bercak gelap
          } else {
            // tanpa pantulan cermin: langit + pita gelap pepohonan tepi danau (murah untuk HP)
            refl = skyCol * 0.95;
            float band = smoothstep(0.1, 0.015, R.y) * smoothstep(-0.02, 0.01, R.y);
            refl = mix(refl, vec3(0.05, 0.075, 0.045) * bright, band * 0.85);
          }
          vec3 col = mix(body, refl, fres);
          // kilau matahari
          float spec = pow(max(dot(R, normalize(sunDir)), 0.0), 380.0) * 6.0 + pow(max(dot(R, normalize(sunDir)), 0.0), 40.0) * 0.18;
          col += sunColor * spec * (1.0 - rain * 0.7);
          // tepi jernih: dasar terlihat di air sangat dangkal
          // air jernih (Serene): dasar & ikan terlihat sampai ±3 m, makin dalam makin toska pekat
          float alpha = mix(mix(0.35, 1.0, smoothstep(0.0, 0.12, depth)), mix(0.16, 0.94, smoothstep(0.03, 0.8, depth)), clarity);
          alpha = max(alpha, fres);
          // air lebih jernih di atas ikan yang sedang ditarik, supaya bayangannya terlihat
          float fd = distance(p, fishPos.xz);
          float win = (1.0 - smoothstep(0.25, 1.1, fd)) * step(-3.0, fishPos.y);
          alpha = mix(alpha, 0.42, win * 0.8);
          col = mix(col, col * vec3(0.85, 0.95, 0.9), win);
          gl_FragColor = vec4(col, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    super(geo, mat);
    this.name = 'water';
    this.receiveShadow = false;
    if (this.reflectionOn) {
      const w = Math.round(innerWidth * Math.min(devicePixelRatio, 1.5) * Q.reflScale), h = Math.round(innerHeight * Math.min(devicePixelRatio, 1.5) * Q.reflScale);
      this.rt = new THREE.WebGLRenderTarget(Math.max(256, w), Math.max(160, h), { type: THREE.HalfFloatType });
      mat.uniforms.tReflect.value = this.rt.texture;
      mat.uniforms.useRefl.value = 1;
    }
  }

  addRipple(x: number, z: number, strength = 1) {
    this.ripples.push({ x, z, t: 0, s: strength });
    if (this.ripples.length > MAX_RIPPLES) this.ripples.shift();
  }

  update(dt: number, time: number) {
    const u = this.material.uniforms;
    u.time.value = time;
    for (const r of this.ripples) r.t += dt;
    this.ripples = this.ripples.filter(r => r.t < 2.4);
    const arr = u.ripples.value as THREE.Vector4[];
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = this.ripples[i];
      if (r) arr[i].set(r.x, r.z, r.t, r.s); else arr[i].set(0, 0, -1, 0);
    }
  }

  /** Render pantulan: kamera cermin terhadap bidang air. Dijalankan tiap N gambar. */
  renderReflection(renderer: THREE.WebGLRenderer, scene: THREE.Scene, cam: THREE.PerspectiveCamera, force = false) {
    if (!this.rt || !this.reflectionOn) return;
    if (!force && (this.frame++ % Q.reflEvery) !== 0) return;
    const mc = this.mirrorCam;
    mc.copy(cam);
    // cerminkan posisi dan arah kamera terhadap y = WATER_Y
    const p = WT.p.copy(cam.position); p.y = 2 * WATER_Y - p.y;
    const target = WT.t.set(0, 0, -1).applyQuaternion(cam.quaternion).add(cam.position); target.y = 2 * WATER_Y - target.y;
    mc.position.copy(p);
    const up = WT.u.set(0, 1, 0).applyQuaternion(cam.quaternion); up.y = -up.y;
    mc.up.copy(up); mc.lookAt(target);
    mc.layers.set(0);
    mc.updateMatrixWorld(); mc.projectionMatrix.copy(cam.projectionMatrix);
    // bidang potong miring (oblique clipping) supaya benda di bawah air tidak ikut terpantul
    const plane = WT.pl.set(WT.n.set(0, 1, 0), -WATER_Y + 0.02);
    plane.applyMatrix4(mc.matrixWorldInverse);
    const cp = WT.cp.set(plane.normal.x, plane.normal.y, plane.normal.z, plane.constant);
    const pm = mc.projectionMatrix, q = WT.q;
    q.x = (Math.sign(cp.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(cp.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0; q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(q));
    pm.elements[2] = cp.x; pm.elements[6] = cp.y; pm.elements[10] = cp.z + 1.0; pm.elements[14] = cp.w;
    this.texMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
    this.material.uniforms.texMatrix.value.copy(this.texMatrix);
    this.visible = false;
    const oldRT = renderer.getRenderTarget(), oldShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.rt);
    renderer.clear();
    renderer.render(scene, mc);
    renderer.setRenderTarget(oldRT);
    renderer.shadowMap.autoUpdate = oldShadow;
    this.visible = true;
  }
}

// Langit fisik (hamburan atmosfer), awan bergerak, matahari/bulan, dan cahaya lingkungan
// yang mengikuti jam dunia serta cuaca.
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import type { WeatherId } from '@paunjunan/shared';

// vektor bantu yang dipakai ulang tiap gambar (tanpa sampah memori → tanpa jeda pembersihan memori)
const SKY_T = { f: new THREE.Vector3(), r: new THREE.Vector3(), u: new THREE.Vector3(), p: new THREE.Vector3() };

function cloudNoiseTexture(size = 256) {
  // derau FBM yang bisa diulang (tileable) untuk awan
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d')!; const img = g.createImageData(size, size);
  const P = 8, grid: number[] = [];
  const rnd = (() => { let s = 12345; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  for (let i = 0; i < 64 * 64; i++) grid.push(rnd());
  const val = (x: number, y: number, per: number) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const at = (a: number, b: number) => grid[((a % per + per) % per) * 64 + ((b % per + per) % per)];
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    return at(xi, yi) * (1 - u) * (1 - v) + at(xi + 1, yi) * u * (1 - v) + at(xi, yi + 1) * (1 - u) * v + at(xi + 1, yi + 1) * u * v;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, a = 0.5, per = P;
    for (let o = 0; o < 5; o++) { s += a * val(x / size * per, y / size * per, per); per *= 2; a *= 0.5; }
    const k = (y * size + x) * 4; const v = Math.round(s * 255);
    img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export class SkySystem {
  sky = new Sky();
  sun = new THREE.DirectionalLight(0xffffff, 3);
  hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a4a2a, 0.9);
  sunDir = new THREE.Vector3();
  clouds: THREE.Mesh;
  private envScene = new THREE.Scene();
  private envSky = new Sky();
  private pmrem: THREE.PMREMGenerator;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private lastEnvKey = '';
  fogColor = new THREE.Color(); private bgCol = new THREE.Color();
  skyTop = new THREE.Color(); skyHor = new THREE.Color();
  night = 0;
  /** pengali cahaya lingkungan (langit HDR sangat terang → benda gelap tampak pucat keputihan); Serene memakai lebih kecil */
  envScale = 1;
  private photoReady = false; photoMix = 0;
  stars: THREE.Points; moon: THREE.Mesh;

  constructor(private renderer: THREE.WebGLRenderer, private scene: THREE.Scene) {
    this.sky.scale.setScalar(4000);
    this.envSky.scale.setScalar(1000);
    this.envScene.add(this.envSky);
    scene.add(this.sky, this.sun, this.sun.target, this.hemi);
    // bintang & bulan (malam)
    const sp: number[] = [];
    for (let i = 0; i < 900; i++) { const u = Math.random(), v = Math.random() * 0.95; const th = u * Math.PI * 2, ph = Math.acos(1 - v); sp.push(Math.sin(ph) * Math.cos(th) * 2500, Math.cos(ph) * 2500, Math.sin(ph) * Math.sin(th) * 2500); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe8ff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(60, 32), new THREE.MeshBasicMaterial({ color: 0xf4f1e0, fog: false, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(this.stars, this.moon);
    this.pmrem = new THREE.PMREMGenerator(renderer);

    const cloudMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, fog: false,
      uniforms: { tNoise: { value: cloudNoiseTexture() }, time: { value: 0 }, cover: { value: 0.45 }, sunDir: { value: this.sunDir },
        lit: { value: new THREE.Color(1, 1, 1) }, shade: { value: new THREE.Color(0.6, 0.65, 0.75) },
        // langit siang cerah dari foto (awan kumulus sungguhan) + kabut cakrawala biru pucat
        tPhoto: { value: null as THREE.Texture | null }, photoMix: { value: 0 }, photoTint: { value: new THREE.Color(1, 1, 1) },
        haze: { value: new THREE.Color().setRGB(144 / 255, 191 / 255, 226 / 255, THREE.SRGBColorSpace) } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform sampler2D tNoise, tPhoto; uniform float time, cover, photoMix; uniform vec3 sunDir, lit, shade, photoTint, haze; varying vec3 vDir;
        void main(){
          if (vDir.y < 0.0) discard;
          float pm = photoMix;
          vec2 uv = vDir.xz / (vDir.y + 0.18) * 0.28;
          float n = texture2D(tNoise, uv + vec2(time * 0.004, time * 0.0015)).r * 0.65
                  + texture2D(tNoise, uv * 2.3 - vec2(time * 0.006, 0.0)).r * 0.35;
          float d = smoothstep(1.0 - cover, 1.0 - cover + 0.28, n);
          float dn = texture2D(tNoise, uv + sunDir.xz * 0.02 + vec2(time * 0.004, time * 0.0015)).r;
          float shadow = smoothstep(0.2, 0.9, dn);
          vec3 c = mix(lit, shade, shadow * 0.7);
          float horizon = smoothstep(0.0, 0.18, vDir.y);
          gl_FragColor = vec4(c, d * horizon * 0.92 * (1.0 - pm));   // awan prosedural memudar saat foto dipakai
          #include <tonemapping_fragment>
          if (pm > 0.001) {
            // foto dilihat tegak ke atas: tengah foto = zenit, awan di tepi turun ke cakrawala (proyeksi lapisan awan)
            vec2 q = vDir.xz / (vDir.y + 0.28) * 0.3;
            vec2 puv = vec2(q.x / 1.5, q.y) + 0.5 + vec2(time * 0.0006, time * 0.00025);
            puv = abs(mod(puv + 1.0, 2.0) - 1.0);                       // pantulan cermin di luar tepi foto (tanpa sambungan)
            vec3 ph = texture2D(tPhoto, puv).rgb * photoTint;          // linear (tekstur sRGB), TANPA tone mapping → warna foto asli
            float up = smoothstep(0.03, 0.42, vDir.y);
            vec3 sky = mix(haze * photoTint, ph, up);                   // pucat di cakrawala (seperti foto referensi), foto di atas
            float a = pm * smoothstep(-0.01, 0.06, vDir.y);
            gl_FragColor.rgb = mix(gl_FragColor.rgb * gl_FragColor.a, sky, a) / max(0.0001, max(gl_FragColor.a, a) );
            gl_FragColor.a = max(gl_FragColor.a, a);
          }
          #include <colorspace_fragment>
        }`,
    });
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(3000, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), cloudMat);
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);
    new THREE.TextureLoader().load('assets/tex/sky_day.webp', t => {
      t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 4;
      (this.clouds.material as THREE.ShaderMaterial).uniforms.tPhoto.value = t; this.photoReady = true;
    });

    this.sun.castShadow = false;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
  }

  /** hour: 0..24 jam dunia. */
  update(hour: number, weather: WeatherId, time: number, focus: THREE.Vector3) {
    // posisi matahari: terbit 6, terbenam 18, lintasan condong ke utara (khatulistiwa)
    const dayT = (hour - 6) / 12;
    const elev = Math.sin(Math.PI * dayT) * 72 * Math.PI / 180;
    const azim = (dayT - 0.5) * Math.PI * 0.95 + Math.PI; // timur -> barat
    const isDay = dayT > -0.05 && dayT < 1.05;
    this.night = isDay ? Math.max(0, 1 - Math.sin(Math.PI * Math.min(1, Math.max(0, dayT))) * 8) : 1;
    const el = isDay ? elev : 0.35; // malam: cahaya bulan dari atas
    this.sunDir.setFromSphericalCoords(1, Math.PI / 2 - Math.max(el, -0.05), azim).normalize();

    const cloudy = weather === 'hujan' ? 1 : weather === 'kabut' ? 0.6 : 0.2;
    for (const s of [this.sky, this.envSky]) {
      const u = s.material.uniforms;
      u.sunPosition.value.copy(this.sunDir);
      u.turbidity.value = 4 + cloudy * 10;
      u.rayleigh.value = weather === 'cerah' ? 1.6 : 2.6;
      u.mieCoefficient.value = 0.004 + cloudy * 0.01;
      u.mieDirectionalG.value = 0.82;
    }
    (this.clouds.material as THREE.ShaderMaterial).uniforms.time.value = time;
    (this.clouds.material as THREE.ShaderMaterial).uniforms.cover.value = weather === 'hujan' ? 0.95 : weather === 'kabut' ? 0.7 : 0.42;

    // warna cahaya matahari mengikuti ketinggian: jingga saat rendah, putih saat tinggi
    const h = Math.max(0, Math.sin(elev));
    const warm = new THREE.Color().setHSL(0.08 + h * 0.05, 0.9 - h * 0.6, 0.55 + h * 0.2);
    const dim = (1 - cloudy * 0.45) * (isDay ? Math.min(1, h * 3 + 0.08) : 0);
    this.sun.color.copy(warm);
    // malam "ala game": cahaya bulan kebiruan yang cukup terang supaya tetap bisa dimainkan
    const N = this.night;
    this.sun.intensity = Math.max(3.2 * dim, N * 1.15 * (1 - cloudy * 0.3));
    if (N > 0.5) this.sun.color.setRGB(0.62, 0.72, 1.0);
    this.hemi.intensity = Math.max(isDay ? 0.55 + h * 0.6 : 0, N * 0.85);
    this.hemi.color.setRGB(0.62 + 0.2 * h, 0.75 + 0.15 * h, 1.0).lerp(new THREE.Color(0.55, 0.65, 0.95), N);
    this.hemi.groundColor.setRGB(0.22, 0.26, 0.16).lerp(new THREE.Color(0.16, 0.2, 0.2), N);

    // warna kabut & cakrawala untuk menyatukan pegunungan jauh dengan langit
    const dayCol = new THREE.Color(0xb9cfdc).lerp(new THREE.Color(0xd9b48a), Math.max(0, 1 - h * 3.5) * (isDay ? 1 : 0));
    const grey = new THREE.Color(0x9aa3a6);
    this.fogColor.copy(dayCol).lerp(grey, cloudy * 0.6).multiplyScalar(isDay ? Math.min(1, 0.35 + h * 2) : 0.08);
    this.fogColor.lerp(new THREE.Color(0.11, 0.15, 0.25).lerp(grey.clone().multiplyScalar(0.2), cloudy * 0.5), N);
    // kabut dasar menyatu dengan warna cakrawala foto supaya tidak ada garis di kejauhan
    if (this.photoMix > 0.01) this.fogColor.lerp(((this.clouds.material as THREE.ShaderMaterial).uniforms.haze.value as THREE.Color).clone().multiplyScalar(0.9), this.photoMix * 0.55);
    this.skyHor.copy(this.fogColor).multiplyScalar(1.1);
    this.skyTop.setRGB(0.18, 0.38, 0.72).lerp(grey, cloudy * 0.5).multiplyScalar(isDay ? Math.min(1, 0.3 + h * 2) : 0.05);
    this.skyTop.lerp(new THREE.Color(0.03, 0.06, 0.15), N);
    // langit malam: latar biru tua + bintang + bulan (shader Sky menjadi hitam pekat setelah matahari terbenam)
    this.scene.background = N > 0.6 ? (this.bgCol.copy(this.fogColor).lerp(this.skyTop, 0.5)) : null;
    (this.stars.material as THREE.PointsMaterial).opacity = Math.max(0, N - 0.3) * (1 - cloudy * 0.8) * 1.2;
    this.stars.position.copy(focus); this.stars.visible = N > 0.3;
    const md = new THREE.Vector3(-0.35, 0.55, -0.75).normalize();
    this.moon.position.copy(focus).addScaledVector(md, 2400); this.moon.lookAt(focus);
    (this.moon.material as THREE.MeshBasicMaterial).opacity = Math.max(0, N - 0.4) * (1 - cloudy * 0.7) * 1.6; this.moon.visible = N > 0.4;
    const cm = this.clouds.material as THREE.ShaderMaterial;
    cm.uniforms.lit.value.copy(warm).lerp(new THREE.Color(1, 1, 1), h).multiplyScalar(isDay ? 1.25 : 0.1).lerp(new THREE.Color(0.35, 0.4, 0.55), N);
    cm.uniforms.shade.value.copy(grey).multiplyScalar(isDay ? 0.8 - cloudy * 0.25 : 0.05).lerp(new THREE.Color(0.14, 0.17, 0.25), N);
    this.sky.visible = N < 0.95;
    // foto langit hanya saat siang cerah & matahari cukup tinggi; pagi/sore/malam/berawan memakai langit prosedural
    const clear = weather === 'cerah' ? 1 : 0, sunUp = Math.min(1, Math.max(0, (h - 0.18) / 0.22));
    this.photoMix += ((this.photoReady ? clear * sunUp * (1 - N) : 0) - this.photoMix) * 0.03;
    cm.uniforms.photoMix.value = this.photoMix;
    cm.uniforms.photoTint.value.setRGB(1, 1, 1).lerp(warm.clone().multiplyScalar(1.25), (1 - h) * 0.25).multiplyScalar(0.92 + h * 0.08);


    // bayangan mengikuti pemain — titik fokus "dikunci" ke kisi texel peta bayangan (di ruang cahaya) supaya tepi bayangan
    // tidak merayap/berkedip saat pemain atau kamera bergerak
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera, ms = this.sun.shadow.mapSize.x || 1024;
    const texel = (sc.right - sc.left) / ms;
    const fw = SKY_T.f.copy(this.sunDir).negate().normalize();
    const rt = SKY_T.r.set(0, 1, 0).cross(fw); if (rt.lengthSq() < 1e-6) rt.set(1, 0, 0); rt.normalize();
    const up = SKY_T.u.copy(fw).cross(rt);
    const su = Math.round(focus.dot(rt) / texel) * texel, sv = Math.round(focus.dot(up) / texel) * texel, sw = focus.dot(fw);
    const snapped = SKY_T.p.copy(rt).multiplyScalar(su).addScaledVector(up, sv).addScaledVector(fw, sw);
    this.sun.position.copy(snapped).addScaledVector(this.sunDir, 60);
    this.sun.target.position.copy(snapped);

    // cahaya lingkungan (PMREM) diperbarui hanya bila langit berubah cukup banyak
    const key = Math.round(hour * 4) + weather;
    if (key !== this.lastEnvKey) {
      this.lastEnvKey = key;
      this.envRT?.dispose();
      this.envRT = this.pmrem.fromScene(this.envScene, 0, 0.1, 2000);
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = Math.max(isDay ? 0.55 : 0, N * 0.4) * this.envScale;
    }
  }
}

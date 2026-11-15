// Menyatukan dunia: langit, medan, air, pepohonan, benda buatan, dan kehidupan danau.
import * as THREE from 'three';
import type { WeatherId } from '@paunjunan/shared';
import type { Assets } from '../core/assets';
import { SkySystem } from './sky';
import { buildTerrain } from './terrain';
import { Water } from './water';
import { Vegetation } from './vegetation';
import { Props } from './props';
import { LakeLife, MoreLife } from './life';
import { Aquarium } from './aquarium';
import { FlowFx } from './flowfx';
import { Palms } from './palms';
import { Q } from '../core/quality';
import { SereneScape, farTree } from './serene';
import { FAR } from './farcut';
import { IS_SERENE, LAKE, SPOT_PLACES, MAPSTYLE, IS_NEW } from './layout';
import { NewMapScape } from './newmaps';
import { terrainTime, setBedPhoto } from './terrain';

export class World {
  palms: Palms;
  /** Danau Serene: pegunungan, pinus, pondok, air terjun, perahu layar, ikan terlihat */
  serene: SereneScape | null = null;
  /** lima peta baru (kolam, gambut, bakau, laguna, pelabuhan) */
  newmap: NewMapScape | null = null;
  sky: SkySystem; water: Water; veg: Vegetation; props: Props; life: LakeLife; more!: MoreLife; aquarium!: Aquarium; flow!: FlowFx; terrain: THREE.Mesh;
  weather: WeatherId = 'cerah';
  /** kecerahan pilihan pemain (1 = normal) */
  brightness = 1;
  /** layar akuarium terbuka: tetap animasikan walau pemain jauh */
  aqWatch = false;
  /** latar lokasi dari foto (admin): silinder raksasa di balik pegunungan */
  private backdrop: THREE.Mesh | null = null;
  /** Foto latar per slot: 'depan' (seberang danau, arah −Z), 'belakang' (di belakang pemain, arah +Z), 'dasar' (dasar danau).
   *  Hanya foto depan → melingkar penuh (ulangan bercermin). Depan + belakang → masing-masing setengah lingkaran. */
  private bdUrl: Record<'depan' | 'belakang', string> = { depan: '', belakang: '' };
  setBackdrop(url: string, slot: 'depan' | 'belakang' | 'dasar' = 'depan') {
    if (slot === 'dasar') { setBedPhoto(url); return; }
    this.bdUrl[slot] = url;
    for (const m of this.backdrops) { this.scene.remove(m); (m.material as THREE.MeshBasicMaterial).map?.dispose(); }
    this.backdrops = []; this.backdrop = null;
    const any = !!(this.bdUrl.depan || this.bdUrl.belakang);
    this.serene?.setFarVisible(!any);   // Danau Serene: foto menggantikan pegunungan bawaan
    if (!any) return;
    const both = !!(this.bdUrl.depan && this.bdUrl.belakang);
    // urutan: setengah depan berpusat di −Z (θ = π), setengah belakang di +Z (θ = 0); CylinderGeometry: x = sin θ, z = cos θ
    const parts: { url: string; start: number; len: number; reps: number }[] = both
      ? [{ url: this.bdUrl.depan, start: Math.PI / 2, len: Math.PI, reps: 1 }, { url: this.bdUrl.belakang, start: -Math.PI / 2, len: Math.PI, reps: 1 }]
      : [{ url: this.bdUrl.depan || this.bdUrl.belakang, start: this.bdUrl.depan ? Math.PI / 2 : -Math.PI / 2, len: Math.PI * 2, reps: 2 }];
    const gen = ++this.bdGen;
    for (const P of parts) new THREE.TextureLoader().load(P.url, tex => {
      if (gen !== this.bdGen) { tex.dispose(); return; }   // foto sudah diganti lagi sebelum selesai dimuat
      tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.MirroredRepeatWrapping; tex.repeat.set(-P.reps, 1); tex.offset.x = 1;   // dilihat dari dalam silinder foto terbalik kiri-kanan → u' = 1 − u (diuji)
      const R = IS_SERENE ? 560 : 720, arc = R * P.len, img = tex.image as { width: number; height: number };
      const H = Math.min(420, arc / P.reps * img.height / img.width);
      const geo = new THREE.CylinderGeometry(R, R, H, 64, 1, true, P.start, P.len);
      const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false });
      const m = new THREE.Mesh(geo, mat);
      if (IS_SERENE) m.position.set(LAKE.cx, H * 0.5 - 12, LAKE.cz);   // tepi bawah foto sedikit di bawah muka air
      else m.position.set(0, H * 0.15, -52);
      this.backdrops.push(m); this.backdrop = m; this.scene.add(m);
    });
  }
  private backdrops: THREE.Mesh[] = []; private bdGen = 0;
  /** Kejernihan air: jernih (dasar & ikan terlihat), sedang, keruh. */
  setWaterClarity(c: 'jernih' | 'sedang' | 'keruh') { (this.water.material.uniforms.clarity as { value: number }).value = c === 'jernih' ? 1 : c === 'sedang' ? 0.55 : 0; }
  /** Sembunyikan/tampilkan pepohonan di ujung danau (Danau Serene; lokasi lain: pohon > 90 m dari spot awal). */
  setFarTrees(show: boolean) {
    this.serene?.setFarTrees(show);
    const sp = SPOT_PLACES[0].pos;
    if (!IS_SERENE) { FAR.c.value.set(sp.x, sp.z); FAR.r.value = 90; }
    // Serene: daratan & air ujung danau ikut disembunyikan → danau menyambung langsung ke latar
    FAR.on.value = !show && IS_SERENE ? 1 : 0;
    const cut = IS_SERENE ? farTree : (x: number, z: number) => Math.hypot(x - sp.x, z - sp.z) > 90;
    this.veg.farCut = show ? null : cut;
    this.veg.setFocus(this.veg.focusAt);
    // batu, bunga, alang-alang, teratai, dll. di ujung danau (instance diperkecil ke nol, bisa dipulihkan)
    const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const g of [this.veg.group, this.props.group, this.serene?.group]) g?.traverse(o => {
      const im = o as THREE.InstancedMesh; if (!im.isInstancedMesh || im.userData.noCull) return;
      if (!show) {
        const orig = (im.userData.cullOrig ??= Float32Array.from(im.instanceMatrix.array as Float32Array)) as Float32Array;
        for (let i = 0; i < im.count; i++) { m4.fromArray(orig, i * 16); p.setFromMatrixPosition(m4); im.setMatrixAt(i, cut(p.x, p.z) ? zero : m4); }
      } else if (im.userData.cullOrig) (im.instanceMatrix.array as Float32Array).set(im.userData.cullOrig as Float32Array);
      im.instanceMatrix.needsUpdate = true;
    });
  }
  /** cahaya lampu jalan/pondok: 4 lampu terdekat pemain yang benar-benar menerangi (malam) */
  private lampLights: THREE.PointLight[] = [];
  constructor(public renderer: THREE.WebGLRenderer, public scene: THREE.Scene, a: Assets, spotId: string) {
    this.sky = new SkySystem(renderer, scene);
    if (IS_SERENE) this.sky.envScale = 0.28;
    this.terrain = buildTerrain({ grass: a.tex.grass, dirt: a.tex.dirt, dirtN: a.tex.dirtN });
    scene.add(this.terrain);
    this.water = new Water(a.tex.water);
    scene.add(this.water);
    this.veg = new Vegetation(renderer, { blade: a.tex.blade, grass: a.tex.grass });
    this.veg.build(spotId);
    scene.add(this.veg.group);
    this.palms = new Palms();
    scene.add(this.palms.group);
    this.props = new Props(a.rocks);
    scene.add(this.props.group);
    if (IS_SERENE) { this.serene = new SereneScape(a.fish, a.rocks[0]); scene.add(this.serene.group); this.props.lamps.push(...this.serene.lamps); }
    if (IS_NEW) { this.newmap = new NewMapScape(); scene.add(this.newmap.group); this.props.lamps.push(...this.newmap.lamps); }
    this.life = new LakeLife(a.stork, a.parrot);
    scene.add(this.life.group);
    this.more = new MoreLife(a.stork); scene.add(this.more.group);
    this.aquarium = new Aquarium(a.fish); scene.add(this.aquarium.group);
    this.flow = new FlowFx(); if (this.flow.mesh) scene.add(this.flow.mesh);
    scene.fog = new THREE.FogExp2(0xb9cfdc, 0.0045);
    for (let i = 0; i < 4; i++) { const l = new THREE.PointLight(0xffc98a, 0, 14, 1.6); scene.add(l); this.lampLights.push(l); }
    if (Q.shadows) {
      const s = this.sky.sun;
      s.castShadow = true;
      s.shadow.mapSize.set(Q.shadowSize, Q.shadowSize);
      const c = s.shadow.camera; c.left = -14; c.right = 14; c.top = 14; c.bottom = -14; c.near = 1; c.far = 140;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = Q.shadowSize >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    }
  }

  setWeather(w: WeatherId, focus: THREE.Vector3) {
    this.weather = w;
    this.life.setRain(w === 'hujan', focus);
  }

  update(dt: number, time: number, hour: number, focus: THREE.Vector3) {
    this.sky.update(hour, this.weather, time, focus);
    const N = this.sky.night;
    for (const bd of this.backdrops) { const c = (bd.material as THREE.MeshBasicMaterial).color; c.copy(this.sky.fogColor).lerp(new THREE.Color(1, 1, 1), 1 - N * 0.85).multiplyScalar(1 - N * 0.55); }
    this.renderer.toneMappingExposure = ((IS_SERENE ? 0.74 : MAPSTYLE ? MAPSTYLE.exposure : 0.55) + N * 0.3) * this.brightness;
    // lampu terdekat menyala sungguhan saat gelap (jumlah lampu tetap → tidak ada kompilasi ulang shader)
    if (N > 0.05) {
      const wp = new THREE.Vector3();
      const near = this.props.lamps.map(m => { m.getWorldPosition(wp); return { p: wp.clone(), d: wp.distanceToSquared(focus) }; }).sort((a, b) => a.d - b.d);
      this.lampLights.forEach((l, i) => { const n = near[i]; if (n) { l.position.copy(n.p).add(new THREE.Vector3(0, -0.15, 0)); l.intensity = N * 9; } else l.intensity = 0; });
    } else this.lampLights.forEach(l => { l.intensity = 0; });
    const fog = this.scene.fog as THREE.FogExp2;
    fog.color.copy(this.sky.fogColor);
    fog.density = (this.weather === 'kabut' ? 0.011 : this.weather === 'hujan' ? 0.008 : IS_SERENE ? 0.00085 : MAPSTYLE ? MAPSTYLE.fog : 0.0032) * (1 - N * 0.35);
    terrainTime.value = time;
    if (this.serene) { fog.color.lerp(this.sky.skyTop, 0.18); this.serene.haze.copy(this.sky.fogColor).lerp(this.sky.skyTop, 0.12); this.serene.update(dt, time, N, focus); }
    const u = this.water.material.uniforms;
    u.sunDir.value.copy(this.sky.sunDir); u.sunColor.value.copy(this.sky.sun.color).multiplyScalar(Math.min(1.5, this.sky.sun.intensity / 2.2));
    u.skyTop.value.copy(this.sky.skyTop); u.skyHor.value.copy(this.sky.skyHor);
    u.wind.value = this.weather === 'hujan' ? 2 : this.weather === 'kabut' ? 0.6 : 1;
    u.rain.value = this.weather === 'hujan' ? 1 : 0;
    u.bright.value = 0.55 + 0.45 * (1 - N);
    this.water.update(dt, time);
    this.veg.update(time, this.weather === 'hujan' ? 1.8 : 1);
    this.props.update(time, this.sky.night);
    this.palms.update(time, this.weather === 'hujan' ? 2 : 1);
    this.life.update(dt, time, focus, (x, z, s) => this.water.addRipple(x, z, s));
    this.more.update(dt, time, focus, (x, z, s) => this.water.addRipple(x, z, s));
    this.flow.update(dt, time, focus);
    this.newmap?.update(dt, time, this.sky.night, focus);
    if (this.aquarium.group.position.distanceToSquared(focus) < 60 * 60 || this.aqWatch) this.aquarium.update(time, this.sky.night);
  }
}

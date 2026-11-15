// Mekanik memancing: melempar, menunggu, sentak, adu tarik, serok, pamer ikan.
// Hasil (kapan menyambar, jenis, berat) selalu ditentukan "server" lewat Backend.
import * as THREE from 'three';
import {
  SPECIES, SIZE_TIERS, RODS, LINES, BAITS, HOOK_LATE, fishLengthCm,
  type Player, type Zone, type SubZone, type SpeciesId, type CatchRec,
} from '@paunjunan/shared';
import type { Backend, AutoInfo, LandResult } from '../core/backend';
import { basketCap } from '@paunjunan/shared';
import type { World } from '../world/world';
import { Angler, SEAT_DROP } from '../actors/angler';
import { FishActor } from '../actors/fish';
import { FishingLine, makeFloat } from '../actors/tackle';
import { Splashes, makeAimMarker } from './effects';
import { IC } from '../ui/icons';
import { LOCATIONS } from '@paunjunan/shared';
import { SPOT_PLACES, groundH, lakeE, inKeramba, KERAMBA, walkInfo, spotAreaAt, isWater, LOC, IS_DANAU, type SpotPlace } from '../world/layout';
import { sfx, setReel, setCreak, tone } from '../core/audio';
import { buzz } from '../core/haptics';
import { store } from '../core/store';
import { $, toast, banner, caption, flash, fmtKg, fmtNum, confetti } from '../ui/hud';

export type Mode = 'menu' | 'walk' | 'ready' | 'charging' | 'casting' | 'flying' | 'settling' | 'waiting' | 'hooking' | 'fight' | 'landing' | 'trophy' | 'retrieving';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = THREE.MathUtils.clamp;
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const smooth = (t: number) => t * t * (3 - 2 * t);

const BEH = { run: 1.25, side: 1.0, zigzag: 0.9, dive: 1.1, rest: 0.3, charge: 0.35, circle: 0.45 } as const;
type Beh = keyof typeof BEH;
const BEH_NAME: Record<Beh, string> = { run: 'Kabur menjauh', side: 'Lari ke samping', zigzag: 'Berenang zig-zag', dive: 'Menyelam dalam', rest: 'Diam sejenak', charge: 'Menyerbu ke arah Anda', circle: 'Lelah, berputar' };

interface Fight {
  hookId: string; k: SpeciesId; name: string; weight: number; tier: number; t: number; str: number; minFight: number;
  L: number; bearing: number; depth: number; stam: number; T: number; beh: Beh; behT: number; dir: number;
  slackT: number; snapT: number; start: number; goldT: number; goodT: number; combo: number; power: number;
  jumpT: number; pos: THREE.Vector3; heading: number; wakeT: number; landT: number; landFrom: THREE.Vector3;
  // serok 3 tahap & angkat joran
  netStep: number; netT: number; guideT: number; misses: number; cue: number; cueDir: number; liftT: number; liftCd: number;
  /** mancing otomatis: kapan hasil diminta ke server, dan sudah dikirim? */
  autoEnd?: number; autoSent?: boolean;
}

export class Fishing {
  mode: Mode = 'menu';
  spot: SpotPlace = SPOT_PLACES[0];
  player!: Player;
  angler: Angler; fish: FishActor; float: THREE.Group; line: FishingLine; splash = new Splashes(); aim = makeAimMarker();
  aimYaw = 0; power = 0; private pDir = 1;
  holding = false;
  floatPos = V(); private castFrom = V(); private castTo = V(); private flyT = 0; private flyDur = 1; private castP = 0;
  private castRes: { castId: string; biteIn: number | null; nibbles: number; quiet: boolean } | null = null;
  private castAt = 0; private biteAt = 0; private nibbleNext = 0; private nibbles = 0; private dip = 0; private bitten = false;
  private settleT = 0; private waitStart = 0;
  private zone: Zone = 'near'; private sub: SubZone = 'dekat';
  private retrFrom = V(); private retrT = 0; private retrDur = 1;
  private strikeT = 0; private castPhase = 0; private castPitch0 = 0;
  F: Fight | null = null;
  private lastCatch: CatchRec | null = null;
  timeScale = 1; private slowT = 0; private slowDur = 1;
  /** 0..1: kekuatan efek gerak lambat (kamera & layar membaca ini) */
  slowmo = 0;
  private beatT = 0; private hiT = 0; private lastDist = 0; private emptyCasts = 0;
  // ---------- mancing otomatis ----------
  /** avatar memancing sendiri; hasil mengangkat ikan diputuskan dadu server (peluang diatur pemilik) */
  autoOn = false;
  autoCfg: AutoInfo | null = null;
  autoStats = { caught: 0, lost: 0, sold: 0, kg: 0, coins: 0, xp: 0, start: 0, left: -1 };
  /** main.ts: perbarui bilah status / tampilkan ringkasan */
  onAuto: (ev: 'start' | 'stop' | 'tick', reason?: string) => void = () => {};
  private autoT = 0; private autoPow = 0.6; private autoReact = 0; private autoInner = false;
  /** spot sepi: minta saran (main.ts menampilkan kartu saran) */
  onQuiet: (c: { spot: string; zone: Zone; sub: SubZone; dist: number; empty: number }) => void = () => {};
  onPlayer: (p: Player) => void = () => {};
  onPose: (pose: 'idle' | 'cast' | 'wait' | 'fight' | 'walk') => void = () => {};
  /** adu tarik dimulai (obrolan pemain lain, dsb.) */
  onFight: () => void = () => {};
  /** kartu tangkapan tampil: minta foto ikan untuk kartu */
  onCatchCard: (k: SpeciesId, weight: number, lengthCm: number) => void = () => {};
  private trophyT = 0;
  /** Duduk di kotak pancing saat memancing. */
  seated = false;
  stool: THREE.Group;
  /** rem reel 1 (longgar) … 5 (ketat) */
  reelDrag = Number(store.get<number>('drag', 3)) || 3;
  /** putaran ikan saat dilihat 360° */
  spin = 0;
  keepnet: THREE.Group;
  net: THREE.Group;
  /** keranjang kawat terlipat, dijinjing tangan kiri saat berjalan */
  carryNet: THREE.Group; private carryPrev = V(); private carrySwing = 0; private carryVel = 0;
  t = 0;
  /** jam nyata (detik) — dipakai untuk waktu yang juga dihitung server */
  now() { return performance.now() / 1000; }

  constructor(private scene: THREE.Scene, private world: World, private backend: Backend, anglerGltf: ConstructorParameters<typeof Angler>[0], fishGltf: ConstructorParameters<typeof FishActor>[0]) {
    this.angler = new Angler(anglerGltf);
    this.fish = new FishActor(fishGltf);
    this.float = makeFloat();
    this.line = new FishingLine();
    this.stool = makeStool(); this.keepnet = makeKeepnet(); this.net = makeLandingNet(); this.carryNet = makeFoldedNet();
    scene.add(this.angler.root, this.angler.rod.group, this.fish.group, this.float, this.line.line, this.splash.points, this.aim, this.stool, this.keepnet, this.net, this.carryNet);
    world.life.jumpFish = (x, z) => this.wildJump(x, z);
  }

  // ---------- posisi & arah ----------
  baseY(s = this.spot) { return s.deck || groundH(s.pos.x, s.pos.z) + 0.06; }
  fwd(yaw = this.spot.yaw) { return V(-Math.sin(yaw), 0, -Math.cos(yaw)); }
  right(yaw = this.spot.yaw) { return V(Math.cos(yaw), 0, -Math.sin(yaw)); }
  bodyPoint(x: number, y: number, z: number) { return this.angler.root.localToWorld(V(x, y - this.angler.pose.seat * SEAT_DROP * 0.8, z)); }

  setSpot(id: string) {
    this.spot = SPOT_PLACES.find(s => s.id === id) ?? SPOT_PLACES[0];
    const r = this.angler.root;
    r.position.set(this.spot.pos.x, this.baseY(), this.spot.pos.z);
    r.rotation.y = this.spot.yaw; r.updateMatrixWorld(true);
    this.aimYaw = 0;
    this.world.veg.setFocus(this.spot.id);
    this.toReady();
  }

  /** Memancing di titik mana pun (dermaga, titian, papan keramba, tepi darat). */
  setHere(x: number, z: number, yaw: number, seated: boolean) {
    const near = SPOT_PLACES.find(sp => Math.hypot(sp.pos.x - x, sp.pos.z - z) < 1.5);
    const id = near?.id ?? spotAreaAt(x, z);
    const w = walkInfo(x, z);
    const names: Record<string, string> = { dermaga: 'Dermaga', titian: 'Titian', keramba: 'Keramba', darat: LOC === 'pantai' || LOC === 'laguna' ? 'Pantai' : LOC === 'kolam' ? 'Tepi kolam' : LOC === 'gambut' ? 'Tepi sungai' : LOC === 'bakau' ? 'Tepi muara' : LOC === 'pelabuhan' ? 'Tembok dermaga' : LOC === 'sungai' ? 'Tepi sungai' : 'Tepi danau', papan: 'Tepi Rumput', batu: 'Batu Besar', kapal: 'Kapal' };
    // posisi & arah persis seperti yang dipilih pemain; spot terdekat hanya dipakai untuk nama & stok ikan
    this.spot = { id, pos: V(x, 0, z), yaw, deck: w?.y ?? near?.deck ?? this.angler.root.position.y, label: near?.label ?? (names[w?.s ?? 'darat'] ?? 'Tepi') + ' · ' + id };
    this.seated = seated;
    const r = this.angler.root;
    r.position.set(this.spot.pos.x, this.baseY(), this.spot.pos.z);
    r.rotation.y = this.spot.yaw; r.updateMatrixWorld(true);
    this.aimYaw = 0;
    this.toReady();
  }

  /** Berdiri dan mulai berjalan (joran dibawa, tombol aksi disembunyikan). */
  startWalk() {
    if (this.autoOn) this.stopAuto('Pemain berjalan.');
    this.world.water.material.uniforms.fishPos.value.set(0, -99, 0);
    this.mode = 'walk'; this.F = null; this.castRes = null; this.holding = false; this.seated = false;
    this.fish.group.visible = false; this.aim.visible = false; this.angler.pose.holdFish = null; this.bitten = false;
    this.setButton('none'); this.onPose('walk'); document.body.classList.remove('fighting');
    $('fight').hidden = true; $('powerBtn').hidden = true;
    setReel(0); setCreak(0);
  }
  /** Boleh berdiri / pindah sekarang? (tidak saat melempar atau adu tarik) */
  get isBitten() { return this.bitten; }
  get canStand() { return this.mode === 'ready' || this.mode === 'menu' || this.mode === 'walk'; }

  setPlayer(p: Player) {
    this.player = p;
    this.angler.rod.setColor(RODS[p.curRod].color);
    this.onPlayer(p);
  }

  private toReady() {
    this.net.visible = false; $('netUi').hidden = true; $('liftBtn').hidden = true;
    this.world.water.material.uniforms.fishPos.value.set(0, -99, 0);
    this.mode = 'ready'; this.F = null; this.castRes = null; this.power = 0; this.holding = false;
    this.fish.group.visible = false; this.aim.visible = false;
    this.angler.pose.holdFish = null; this.bitten = false;
    this.setButton('ready'); this.onPose('idle'); document.body.classList.remove('fighting');
    $('fight').hidden = true; $('powerBtn').hidden = true;
    setReel(0); setCreak(0);
  }

  // ---------- tombol aksi ----------
  setButton(kind: 'ready' | 'charging' | 'wait' | 'strike' | 'fight' | 'busy' | 'none') {
    const b = $('actBtn'), icon = $('actIcon'), txt = $('actTxt2');
    b.classList.remove('strike', 'reel', 'dim', 'tarik');
    const set = (i: string, t: string) => { icon.innerHTML = i; txt.innerHTML = t; };
    // gaya gambar konsep: kail putih + satu kata (tahan = lempar, ketuk = tarik/sentak, tahan = gulung)
    if (kind === 'ready') set(IC.hook, 'Lempar');
    else if (kind === 'charging') set(IC.hook, 'Lepas!');
    else if (kind === 'wait') set(IC.hook, 'Tarik');
    else if (kind === 'strike') { set(IC.bolt, 'TARIK!'); b.classList.add('strike'); }
    else if (kind === 'fight') { set(IC.fishHook, 'TARIK!'); b.classList.add('tarik'); }   // tahan = menggulung/menarik
    else if (kind === 'busy') { set(IC.hook, '…'); b.classList.add('dim'); }
    $('aimHint').classList.toggle('show', kind === 'ready');
    (b.parentElement as HTMLElement).style.visibility = kind === 'none' ? 'hidden' : 'visible';
  }

  press() {
    if (this.autoOn && !this.autoInner) { this.stopAuto('Dihentikan oleh pemain.'); return; }
    this.holding = true;
    $('actBtn').classList.add('down');
    switch (this.mode) {
      case 'ready':
        if ((this.player.bait[this.player.curBait] ?? 0) <= 0) { toast('Umpan habis. Beli umpan dulu di tombol Umpan.'); this.holding = false; return; }
        this.mode = 'charging'; this.power = 0.05; this.pDir = 1; this.setButton('charging'); this.aim.visible = true; this.onPose('cast'); sfx.click(); break;
      case 'flying': this.feather(); break;
      case 'settling': case 'waiting': this.strike(); break;
      case 'fight': buzz(8); break;
      case 'landing': this.netPress(); break;
    }
  }
  release() {
    this.holding = false;
    $('actBtn').classList.remove('down');
    if (this.mode === 'charging') this.startCast();
  }
  drag(dx: number) {
    if (this.mode === 'ready' || this.mode === 'charging') this.aimYaw = clamp(this.aimYaw - dx * 0.0035, -0.75, 0.75);
  }
  powerMove() {
    const F = this.F; if (!F || this.mode !== 'fight' || F.power < 1) return;
    F.power = 0; F.stam = Math.max(0, F.stam - 0.3); F.T = Math.min(F.T, 60);
    this.slowT = this.slowDur = 1.7; document.body.classList.add('slowmo');
    banner('TARIKAN KUAT!', '#ffb36b'); caption('Tenaga ikan terkuras', 1600);
    flash(0.35); buzz([40, 30, 60, 30, 120]); sfx.slowmo();
    this.splash.burst(F.pos.clone().setY(0), 1.3, 46); this.world.water.addRipple(F.pos.x, F.pos.z, 1.6);
    $('powerBtn').hidden = true;
  }

  // ---------- melempar ----------
  private predictLanding(p: number) {
    const rod = RODS[this.player.curRod];
    const dist = (5 + Math.pow(p, 1.1) * 30) * rod.cast;
    const dir = this.fwd(this.spot.yaw + this.aimYaw);
    return { dist, to: this.angler.root.position.clone().setY(0).addScaledVector(dir, dist + 0.6) };
  }
  private startCast() {
    this.mode = 'casting'; this.castPhase = 0; this.castPitch0 = this.angler.pose.pitch; this.castP = this.power;
    this.setButton('busy'); sfx.whoosh(); buzz(12);
  }
  private launch() {
    const { to } = this.predictLanding(this.castP);
    this.castFrom.copy(this.angler.rod.tip); this.castTo.copy(to);
    const d = this.castFrom.distanceTo(to);
    this.flyDur = 0.55 + d / 24; this.flyT = 0; this.mode = 'flying'; this.aim.visible = false;
    this.setButton('wait');
  }
  private feather() {
    if (this.flyT / this.flyDur > 0.85) return;
    // rem jari: umpan jatuh lebih dekat dari rencana
    const u = this.flyT / this.flyDur;
    const cur = V().lerpVectors(this.castFrom, this.castTo, u); cur.y = 0;
    this.castTo.lerp(cur, 0.55); this.flyDur = Math.max(this.flyT + 0.25, this.flyDur * 0.8);
    toast('Senar direm dengan jari.'); sfx.click();
  }
  private onLand() {
    const p = this.castTo, s = this.spot;
    const d = Math.hypot(p.x - s.pos.x, p.z - s.pos.z);
    const e = lakeE(p.x, p.z);
    const onDock = IS_DANAU && Math.abs(p.x) < 1.35 && p.z > -4.2 && p.z < 14;
    const beam = inKeramba(p.x, p.z) && (Math.abs(((p.x - KERAMBA.x0) % KERAMBA.cell + KERAMBA.cell) % KERAMBA.cell - 0) < 0.35 || Math.abs(((p.x - KERAMBA.x0) % KERAMBA.cell + KERAMBA.cell) % KERAMBA.cell - KERAMBA.cell) < 0.35 || Math.abs(((KERAMBA.z1 - p.z) % KERAMBA.cell + KERAMBA.cell) % KERAMBA.cell) < 0.35 || Math.abs(((KERAMBA.z1 - p.z) % KERAMBA.cell + KERAMBA.cell) % KERAMBA.cell - KERAMBA.cell) < 0.35);
    if (!isWater(p.x, p.z)) { this.floatPos.set(p.x, groundH(p.x, p.z) + 0.05, p.z); sfx.plop(); this.retrieve('Kail jatuh di darat. Arahkan lemparan ke air.'); return; }
    if (onDock) { this.floatPos.set(p.x, 0.66, p.z); sfx.plop(); this.retrieve('Kail jatuh di dermaga. Arahkan lemparan ke air.'); return; }
    if (beam) { this.floatPos.set(p.x, 0.4, p.z); sfx.plop(); this.retrieve('Kail tersangkut di rangka keramba. Lempar ke tengah petak.'); return; }
    const onStruct = walkInfo(p.x, p.z);
    if (onStruct && onStruct.s !== 'darat') { this.floatPos.set(p.x, onStruct.y + 0.04, p.z); sfx.plop(); this.retrieve(onStruct.s === 'titian' ? 'Kail jatuh di titian. Arahkan lemparan ke air.' : 'Kail tersangkut. Arahkan lemparan ke air terbuka.'); return; }
    this.zone = d < 12 ? 'near' : 'far'; this.lastDist = d;
    this.sub = inKeramba(p.x, p.z) ? 'keramba' : e < 0.45 ? 'lepas' : d < 3.5 && (s.id === 'A1' || s.id === 'D1') ? 'dermaga' : d < 12 ? 'dekat' : 'jauh';
    this.floatPos.set(p.x, 0, p.z);
    const pw = clamp(0.45 + d / 40, 0.5, 1.1);
    this.splash.burst(this.floatPos, pw * 0.7, 26); this.world.water.addRipple(p.x, p.z, 1); sfx.splash(pw * 0.7); buzz(14);
    setTimeout(() => this.world.water.addRipple(p.x, p.z, 1.4), 300);
    this.mode = 'settling'; this.settleT = 0; this.castRes = null; this.bitten = false;
    this.onPose('wait');
    const subName: Record<SubZone, string> = { dermaga: 'perairan sekitar dermaga', dekat: 'perairan dekat', jauh: 'perairan jauh', keramba: 'sela petak keramba', lepas: 'perairan lepas' };
    toast(fmtNum(d, 1) + ' m · ' + subName[this.sub]);
    const sentAt = this.now();
    this.backend.cast({ spot: s.id, zone: this.zone, sub: this.sub }).then(r => {
      if (this.mode !== 'settling' && this.mode !== 'waiting') return;
      this.castRes = r; this.castAt = sentAt;
      this.biteAt = r.biteIn === null ? Infinity : sentAt + r.biteIn;
      this.nibbles = r.nibbles; this.nibbleNext = this.biteAt - r.nibbles * 0.95 - 0.4;
      this.waitStart = this.now();
      this.player.bait[this.player.curBait] = this.player.bait[this.player.curBait]; // umpan dipotong saat menyentak
    }).catch(err => { this.retrieve((err as Error).message); });
  }
  private quiet() { if (this.autoOn) return; this.onQuiet({ spot: this.spot.id, zone: this.zone, sub: this.sub, dist: this.lastDist, empty: this.emptyCasts }); }
  retrieve(msg?: string) {
    if (msg) toast(msg);
    this.mode = 'retrieving'; this.retrFrom.copy(this.floatPos); this.retrT = 0;
    this.retrDur = 0.5 + Math.hypot(this.floatPos.x - this.angler.rod.tip.x, this.floatPos.z - this.angler.rod.tip.z) / 9;
    this.setButton('busy'); this.onPose('idle'); this.fish.group.visible = false;
    setReel(1);
  }

  // ---------- menyentak ----------
  private strike() {
    if (!this.castRes) { this.retrieve('Tunggu pelampung berdiri dulu.'); return; }
    const id = this.castRes.castId; this.castRes = null;
    this.mode = 'hooking'; this.strikeT = 0; this.setButton('busy'); buzz(20); sfx.whoosh();
    this.backend.hook(id).then(r => {
      if (r.result === 'hooked') { this.emptyCasts = 0; this.startFight(r); return; }
      this.syncMe();
      const msg = r.result === 'spooked' ? 'Terlalu cepat! Ikannya kabur.' : r.result === 'eaten' ? 'Umpan habis dimakan. Sentak segera saat pelampung tenggelam.' : 'Belum ada ikan yang menyambar.';
      this.retrieve(msg);
      if (r.result === 'nothing' && this.now() - this.waitStart > 8) { this.emptyCasts++; if (this.emptyCasts >= 2) this.quiet(); }
    }).catch(err => this.retrieve((err as Error).message));
  }

  private startFight(r: { hookId: string; species: SpeciesId; name: string; weight: number; tier: number; t: number; strength: number; minFight: number }) {
    const s = this.spot;
    const dx = this.floatPos.x - s.pos.x, dz = this.floatPos.z - s.pos.z;
    const L = Math.hypot(dx, dz);
    const base = Math.atan2(-dx, -dz);
    this.F = {
      hookId: r.hookId, k: r.species, name: r.name, weight: r.weight, tier: r.tier, t: r.t, str: r.strength, minFight: r.minFight,
      // arah awal = tepat ke titik pelampung dimakan (dinormalisasi ke −π..π; dulu bisa 6 rad lalu dijepit → ikan melompat ke samping)
      L, bearing: Math.atan2(Math.sin(base - s.yaw), Math.cos(base - s.yaw)), depth: 0.25, stam: 1, T: 45, beh: 'run', behT: 2 + r.tier * 0.8, dir: Math.random() < 0.5 ? -1 : 1,
      slackT: 0, snapT: 0, start: this.now(), goldT: 0, goodT: 0, combo: 0, power: 0, jumpT: r.weight >= 0.8 ? 0 : -1,
      pos: this.floatPos.clone(), heading: base, wakeT: 0, landT: 0, landFrom: V(), netStep: 0, netT: 0, guideT: 0, misses: 0, cue: 0, cueDir: 1, liftT: -1, liftCd: 4,
    };
    if (this.autoOn) { this.F.autoEnd = r.minFight + 0.8 + 2 + Math.random() * 4; this.F.autoSent = false; }
    this.fish.setSpecies(r.species, r.weight, fishLengthCm(r.species, r.weight));
    this.fish.group.visible = true;
    this.mode = 'fight'; this.setButton('fight'); this.onPose('fight');
    $('fight').hidden = false; this.holding = false; document.body.classList.add('fighting'); this.onFight();
    const T = SIZE_TIERS[r.tier];
    banner('Tarikan ' + T.pull + '!', T.col);
    flash(0.25 + r.tier * 0.1); sfx.bite(); buzz(r.tier >= 2 ? [60, 40, 120] : [40, 30, 60]);
    this.splash.burst(this.floatPos, 0.9, 30); this.world.water.addRipple(this.floatPos.x, this.floatPos.z, 1.3);
    caption(r.weight >= 3 ? 'WAH! IKAN BESAR MENYAMBAR!' : 'Ikan menyambar! Gulung!', 1600);
    this.syncMe();
  }

  private lose(kind: 'putus' | 'kendur' | 'habis' | 'rumput' | 'serok' | 'auto', msg: string, serverDone = false) {
    const F = this.F!; this.F = null; document.body.classList.remove('fighting');
    if (!serverDone) this.backend.land(F.hookId, 'lost').catch(() => {});
    const tips: Record<string, [string, string]> = {
      putus: ['Senar putus', 'Saat jarum masuk zona merah, lepas tombol supaya senar bisa keluar.' + (F.weight >= 5 && LINES[this.player.curLine].strength < 190 ? ' Untuk ikan sebesar ini, pakai senar PE8 dan Joran Predator.' : '')],
      kendur: ['Kail terlepas', 'Jangan biarkan jarum di zona biru (kendur). Saat ikan menyerbu ke arah Anda, gulung cepat.'],
      habis: ['Senar habis', 'Gulung saat ikan diam supaya ikan tidak terus menarik senar keluar.'],
      rumput: ['Senar tersangkut', 'Saat muncul tombol ANGKAT JORAN, ketuk segera supaya ikan tidak masuk rumput atau jaring keramba.'],
      serok: ['Lepas di mulut serok', 'Celupkan serok saat penanda berada di zona hijau, lalu ketuk ANGKAT secepatnya.'],
      auto: ['Lepas (otomatis)', 'Mancing otomatis tidak selalu berhasil, apalagi ikan besar. Tarik sendiri untuk peluang lebih baik.'],
    };
    $('lossTitle').textContent = tips[kind][0]; $('lossWhy').textContent = msg + ' Kira-kira ' + fmtKg(Math.round(F.weight * 2) / 2) + '.';
    $('lossTip').textContent = tips[kind][1];
    const c = $('lossCard'); c.hidden = this.autoOn; if (this.autoOn) toast('🤖 ' + F.name + ' ' + fmtKg(F.weight) + ' lepas.'); clearTimeout((this as unknown as { lt: number }).lt);
    (this as unknown as { lt: number }).lt = window.setTimeout(() => { c.hidden = true; }, 6000);
    sfx.snap(); buzz(120); flash(0.15);
    this.splash.burst(F.pos.clone().setY(0), 0.6, 18);
    this.floatPos.copy(F.pos).setY(0);
    $('fight').hidden = true; $('powerBtn').hidden = true; $('liftBtn').hidden = true; $('netUi').hidden = true; this.net.visible = false;
    document.body.classList.remove('edge'); this.beatT = 0; this.hiT = 0;
    this.retrieve();
  }

  // ---------- adu tarik ----------
  private updateFight(dt: number) {
    const F = this.F!, p = this.player;
    const maxLoad = LINES[p.curLine].strength / 100 * RODS[p.curRod].power;
    F.behT -= dt;
    if (F.behT <= 0) {
      const tired = F.stam < 0.45;
      const opts: [Beh, number][] = [['run', tired ? 0.15 : 0.35], ['side', 0.2], ['zigzag', 0.15], ['dive', 0.1], ['rest', tired ? 0.3 : 0.1], ['charge', 0.1], ['circle', tired ? 0.25 : 0.02]];
      let x = Math.random() * opts.reduce((a, o) => a + o[1], 0); F.beh = opts[0][0];
      for (const [b, w] of opts) { if ((x -= w) <= 0) { F.beh = b; break; } }
      F.behT = 1.2 + Math.random() * 2.2; F.dir = Math.random() < 0.5 ? -1 : 1;
      if (F.tier >= 1 && F.jumpT < 0 && Math.random() < 0.18 + F.tier * 0.06 && F.stam > 0.25) F.jumpT = 0;
    }
    const bm = BEH[F.beh];
    if (this.autoOn) this.autoFight(F);
    const reeling = this.holding;
    const pull = F.str * (0.35 + 0.65 * F.stam) * bm;
    const load = pull / maxLoad;
    const shake = (F.beh === 'zigzag' || F.jumpT >= 0 ? Math.sin(this.t * 17) * 7 : 0) + (Math.random() - 0.5) * 4;
    // rem reel: ketat = tegangan naik tapi ikan lebih sulit kabur; longgar = sebaliknya
    const dk = 0.7 + 0.1 * this.reelDrag, runK = 1.3 - 0.1 * this.reelDrag;
    let target = (load * 62) * dk + (reeling ? 34 : 3) + shake;
    if (F.beh === 'charge' && !reeling) target = Math.min(target, 6);
    if (F.jumpT >= 0 && reeling) target += 18;
    F.T += (target - F.T) * (1 - Math.exp(-dt * 6));
    F.T = clamp(F.T, 0, 110);
    // gerak ikan
    const spd = (0.55 + F.str * 0.85) * bm * (0.35 + 0.65 * F.stam);
    let dL = 0;
    if (F.beh === 'run' || F.beh === 'dive') dL += spd * dt * (F.T > 80 ? 1 : 0.6) * runK;
    else if (F.beh === 'charge') dL -= spd * dt * 0.9;
    else if (F.beh === 'side' || F.beh === 'zigzag') dL += spd * dt * 0.15;
    if (reeling) dL -= dt * 1.55 * (1 + Math.max(0, 1 - F.weight / 2) * 0.6) * (1 - Math.min(0.75, load * 0.4));
    F.L = clamp(F.L + dL, 1.8, 60);
    const bs = F.beh === 'side' ? 0.28 : F.beh === 'zigzag' ? Math.sin(this.t * 2.2) * 0.4 : F.beh === 'circle' ? 0.35 : 0.04;
    F.bearing = clamp(F.bearing + dt * F.dir * bs * (6 / Math.max(4, F.L)), Math.min(-1.25, F.bearing), Math.max(1.25, F.bearing));
    F.depth += ((F.beh === 'dive' ? 0.9 : F.beh === 'rest' ? 0.45 : 0.22) - F.depth) * dt * 1.5;
    // kegagalan
    // mancing otomatis: putus/kendur/habis tidak dihitung di perangkat — hasil diputuskan server
    if (!this.autoOn) {
      if (F.T >= 100) { F.snapT += dt; if (F.snapT > 0.5) { this.lose('putus', 'Tegangan terlalu tinggi, senar putus.'); return; } } else F.snapT = Math.max(0, F.snapT - dt * 2);
      if (F.T < 9) { F.slackT += dt; if (F.slackT > 2.4) { this.lose('kendur', 'Senar terlalu kendur, kail lepas dari mulut ikan.'); return; } } else F.slackT = Math.max(0, F.slackT - dt * 1.5);
      if (F.L >= 58) { this.lose('habis', 'Ikan terus menarik sampai senar di reel habis.'); return; }
    } else { F.L = Math.min(F.L, 40); F.snapT = 0; F.slackT = 0; }
    // stamina
    const gold = F.T >= 45 && F.T <= 75;
    F.stam = Math.max(0, F.stam - dt * (0.012 + 0.045 * (F.T / 100) + (gold ? 0.03 : 0)) / (0.4 + F.weight * 0.1));
    const el = this.now() - F.start;
    if (el < F.minFight + 0.3) F.stam = Math.max(F.stam, 0.3);
    if (gold) {
      F.goodT += dt; F.goldT += dt;
      if (F.goldT >= 1.2) {
        F.goldT -= 1.2; F.combo++; F.power = Math.min(1, F.power + 0.2);
        const c = $('comboTxt'); c.textContent = 'SEMPURNA! ×' + F.combo; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); sfx.combo();
        if (F.power >= 1) $('powerBtn').hidden = false;
      }
    } else F.goldT = Math.max(0, F.goldT - dt * 2);
    // lompatan
    if (F.jumpT >= 0) {
      if (F.jumpT === 0) { this.splash.burst(F.pos.clone().setY(0), 1.2, 44); this.splash.foamAt(F.pos.x, F.pos.z, 1.6); sfx.splash(0.8); buzz(40); this.world.water.addRipple(F.pos.x, F.pos.z, 1.3); }
      F.jumpT += dt / 1.0;
      if (F.jumpT >= 1) { F.jumpT = -1; this.splash.burst(F.pos.clone().setY(0), 1.35, 52); this.splash.foamAt(F.pos.x, F.pos.z, 2); sfx.splash(1); this.world.water.addRipple(F.pos.x, F.pos.z, 1.5); }
    }
    // posisi ikan di dunia
    const yaw = this.spot.yaw + F.bearing;
    const dir = this.fwd(yaw);
    const origin = this.angler.root.position;
    F.pos.set(origin.x + dir.x * F.L, 0, origin.z + dir.z * F.L);
    const away = Math.atan2(dir.x, dir.z);
    const hd = F.beh === 'charge' ? away + Math.PI : F.beh === 'side' || F.beh === 'circle' ? away + F.dir * Math.PI / 2 : F.beh === 'zigzag' ? away + Math.sin(this.t * 2.2) * 0.9 : away;
    F.heading += Math.atan2(Math.sin(hd - F.heading), Math.cos(hd - F.heading)) * (1 - Math.exp(-dt * 3));
    if (F.jumpT >= 0) {
      // lompatan menyamping supaya badan ikan terlihat penuh dari kamera
      F.heading = away + Math.PI / 2 * F.dir;
      const j = F.jumpT, h = Math.sin(Math.PI * j) * (0.55 + F.tier * 0.18);
      F.pos.y = h - 0.1;
      this.fish.group.rotation.set(0, F.heading, 0); this.fish.group.rotateX(-Math.cos(Math.PI * j) * 0.9); this.fish.group.rotateZ(Math.sin(this.t * 20) * 0.3);
      if (Math.random() < 0.5) this.splash.drip(F.pos);
    } else {
      F.pos.y = -0.12 - F.depth * 0.35;
      this.fish.group.rotation.set(0, F.heading, 0);
      F.wakeT -= dt;
      if (F.wakeT < 0 && F.depth < 0.5) { F.wakeT = 0.35; this.world.water.addRipple(F.pos.x, F.pos.z, 0.5); }
    }
    this.fish.group.position.copy(F.pos);
    this.world.water.material.uniforms.fishPos.value.copy(F.pos);
    this.fish.update(this.t, 0.4 + bm * 0.6, 0.06 + bm * 0.05);
    // mendarat: ikan dekat & lelah
    // ikan lari ke rumput / jaring keramba: pemain harus ANGKAT JORAN tepat waktu
    F.liftCd -= dt;
    if (F.liftT >= 0) {
      F.liftT -= dt;
      if (this.autoOn && F.liftT < 1.4) { this.liftRod(); }
      else if (F.liftT < 0) { $('liftBtn').hidden = true; this.lose('rumput', 'Ikan masuk ke rumput dan senar tersangkut.'); return; }
    } else if (F.liftCd <= 0 && (F.beh === 'run' || F.beh === 'side' || F.beh === 'dive') && F.L > 5 && F.jumpT < 0) {
      const danger = (LOC !== 'laut' && lakeE(F.pos.x, F.pos.z) > 0.9) || inKeramba(F.pos.x, F.pos.z) || Math.random() < 0.08 * dt * 10;
      if (danger && Math.random() < dt * 0.9) {
        F.liftT = 1.9; F.liftCd = 9 + Math.random() * 6; $('liftBtn').hidden = false; buzz([30, 20, 30]);
        caption(inKeramba(F.pos.x, F.pos.z) ? 'Ikan menuju jaring keramba!' : LOC === 'pantai' ? 'Ikan menuju karang!' : LOC === 'sungai' ? 'Ikan menuju bebatuan!' : LOC === 'laut' ? 'Ikan menyelam ke bawah kapal!' : LOC === 'serene' ? 'Ikan menuju bebatuan!' : LOC === 'kolam' ? 'Ikan menuju kincir air!' : LOC === 'gambut' ? 'Ikan menuju kayu tenggelam!' : LOC === 'bakau' ? 'Ikan menuju akar bakau!' : LOC === 'laguna' ? 'Ikan menuju karang!' : LOC === 'pelabuhan' ? 'Ikan menuju tiang dermaga!' : 'Ikan menuju rumput!', 1400);
      }
    }
    if (this.autoOn) { if (F.autoEnd !== undefined && el >= F.autoEnd && !F.autoSent) this.autoLand(F); }
    else if (F.L <= 2.2 && F.stam <= 0.32 && el >= F.minFight && F.liftT < 0) { this.startLanding(); return; }
    if (F.L <= 2.2 && F.stam > 0.32 && F.beh !== 'run') { F.beh = 'run'; F.behT = 1.5; }
    // HUD
    this.fightHud(F, reeling, gold);
    setReel(reeling ? 1 : 0); setCreak(F.T / 100);
    const edge = F.T > 85;
    document.body.classList.toggle('edge', edge);
    // detak jantung saat senar hampir putus (atau kail hampir lepas): makin rapat makin bahaya
    const danger = F.T > 85 ? (F.T - 85) / 15 : F.slackT > 1.2 ? Math.min(1, (F.slackT - 1.2) / 1.2) * 0.6 : 0;
    if (danger > 0) {
      this.beatT -= dt;
      if (this.beatT <= 0) {
        this.beatT = 0.8 - 0.38 * clamp(danger, 0, 1);
        sfx.heart(0.55 + 0.45 * clamp(danger, 0, 1)); buzz([14, 110, 10]);
        const v = $('vig'); v.classList.remove('beat'); void v.offsetWidth; v.classList.add('beat');
      }
    } else this.beatT = 0;
    // tegangan tinggi lama padahal tidak menggulung = rem terlalu ketat
    this.hiT = F.T >= 76 && !reeling ? this.hiT + dt : Math.max(0, this.hiT - dt * 2);
    if (reeling) this.angler.pose.reelAngle -= dt * 14;
  }

  /** Pengukur tegangan melingkar di sekeliling tombol TARIK! (busur 240°: merah kendur → hijau aman → kuning waspada → oranye putus). */
  private gaugeBuilt = false;
  private static GZ: [number, number, string][] = [[0, 0.14, '#ff4a3a'], [0.14, 0.45, '#3fd44e'], [0.45, 0.75, '#7dff5a'], [0.75, 0.88, '#ffc531'], [0.88, 1, '#ff8a1e']];
  private garc(u0: number, u1: number, r: number) {
    const P = (u: number) => { const th = (210 - u * 240) * Math.PI / 180; return [80 + r * Math.cos(th), 80 - r * Math.sin(th)]; };
    const [x0, y0] = P(u0), [x1, y1] = P(Math.max(u0 + 0.0001, u1));
    return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(u1 - u0) * 240 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
  }
  private gauge(T: number) {
    if (!this.gaugeBuilt) {
      this.gaugeBuilt = true;
      $('tgTrack').setAttribute('d', this.garc(0, 1, 66));
      $('tgZones').innerHTML = Fishing.GZ.map(([a, b, c]) => `<path d="${this.garc(a + 0.006, b - 0.006, 76)}" stroke="${c}" class="tgZone"/>`).join('');
    }
    const u = clamp(T, 0, 100) / 100, z = Fishing.GZ.find(([a, b]) => u >= a && u <= b) ?? Fishing.GZ[0];
    const fill = $('tgFill'); fill.setAttribute('d', this.garc(0, Math.max(0.01, u), 66)); fill.setAttribute('stroke', z[2]);
    const th = (210 - u * 240) * Math.PI / 180; const dot = $('tgDot'); dot.setAttribute('cx', (80 + 66 * Math.cos(th)).toFixed(2)); dot.setAttribute('cy', (80 - 66 * Math.sin(th)).toFixed(2));
    $('tGauge').classList.toggle('hot', u >= 0.88);
  }
  private fightHud(F: Fight, reeling: boolean, gold: boolean) {
    this.gauge(F.T);
    const a = Math.PI * (1 - clamp(F.T, 0, 100) / 100);
    $('gNeedle').setAttribute('x2', (100 + Math.cos(a) * 72).toFixed(1));
    $('gNeedle').setAttribute('y2', (100 - Math.sin(a) * 72).toFixed(1));
    $('stamBar').style.width = (F.stam * 100).toFixed(0) + '%';
    $('distTxt').textContent = fmtNum(F.L, 1) + ' m';
    $('actTxt').textContent = F.jumpT >= 0 ? 'Melompat!' : BEH_NAME[F.beh];
    const cmd = $('cmdTxt'); let txt = 'TAHAN UNTUK MENGGULUNG', cls = '', drag: 'dn' | 'up' | '' = '';
    if (F.T >= 88) {
      if (reeling) txt = 'LEPAS TOMBOL!';
      else if (this.reelDrag > 1) { txt = 'KENDURKAN REM ↓'; drag = 'dn'; }
      else txt = 'SENAR HAMPIR PUTUS!';
      cls = 'warn';
    }
    else if (F.jumpT >= 0) { txt = 'JANGAN GULUNG!'; cls = 'warn'; }
    else if (this.hiT > 1.2 && this.reelDrag >= 4) { txt = 'KENDURKAN REM ↓'; cls = 'warn'; drag = 'dn'; }
    else if (F.L > 40 && F.T < 45 && this.reelDrag <= 2 && (F.beh === 'run' || F.beh === 'dive')) { txt = 'KENCANGKAN REM ↑ SENAR MENIPIS'; cls = 'warn'; drag = 'up'; }
    else if (F.T < 14) { txt = F.slackT > 1.2 ? 'GULUNG! KAIL HAMPIR LEPAS' : 'GULUNG CEPAT!'; cls = 'warn'; }
    else if (gold) { txt = 'PERTAHANKAN! ZONA EMAS'; cls = 'good'; }
    else if (reeling) txt = 'GULUNG TERUS…';
    if (cmd.textContent !== txt) cmd.textContent = txt;
    cmd.className = 'cmd ' + cls;
    $('dragDn').classList.toggle('hint', drag === 'dn'); $('dragUp').classList.toggle('hint', drag === 'up');
  }

  /** Ketuk ANGKAT JORAN: ikan dibelokkan kembali ke air terbuka. */
  liftRod() {
    const F = this.F; if (!F || this.mode !== 'fight' || F.liftT < 0) return;
    F.liftT = -1; $('liftBtn').hidden = true;
    F.dir = -F.dir; F.bearing *= 0.6; F.L = Math.max(2.5, F.L - 1.5); F.stam = Math.max(0, F.stam - 0.06); F.beh = 'rest'; F.behT = 1.2;
    banner('JORAN DIANGKAT!', '#ffd873'); buzz(25); sfx.whoosh();
    this.splash.burst(F.pos.clone().setY(0), 0.6, 16);
  }

  /** Serok 3 tahap: 1) tuntun ikan (tahan), 2) celup serok (ketuk di zona hijau), 3) ANGKAT (ketuk cepat). */
  private startLanding() {
    const F = this.F!;
    this.mode = 'landing'; F.netStep = 1; F.netT = 0; F.guideT = 0; F.misses = 0; F.cue = 0; F.cueDir = 1; F.landFrom.copy(F.pos);
    $('fight').hidden = true; $('powerBtn').hidden = true; $('liftBtn').hidden = true; document.body.classList.remove('edge', 'fighting');
    setReel(0); setCreak(0.2);
    this.splash.burst(F.pos.clone().setY(0), 0.8, 24); sfx.splash(0.7); buzz([30, 30, 60]);
    this.setButton('fight'); $('actTxt2').textContent = 'Tuntun';
    this.netHud('1/3 · TUNTUN IKAN', 'Tahan tombol untuk membawa ikan ke dekat kaki.', 0, false);
    this.net.visible = true;
  }
  private netHud(title: string, hint: string, fill: number, cue: boolean) {
    $('netUi').hidden = false; $('netTitle').textContent = title; $('netHint').textContent = hint;
    ($('netFill') as HTMLElement).style.width = (fill * 100).toFixed(0) + '%';
    ($('netCue') as HTMLElement).hidden = !cue; ($('netZone') as HTMLElement).hidden = !cue;
  }
  private netPress() {
    const F = this.F; if (!F) return;
    if (F.netStep === 2) {
      const ok = Math.abs(F.cue - 0.5) < 0.13;
      if (ok) { F.netStep = 3; F.netT = 0; this.splash.burst(F.pos.clone().setY(0), 0.7, 20); sfx.splash(0.6); buzz(20); this.setButton('strike'); $('actTxt2').textContent = 'ANGKAT!'; this.netHud('3/3 · ANGKAT!', 'Ketuk secepatnya!', 1, false); }
      else {
        F.misses++; buzz(60); sfx.nibble();
        if (F.misses >= 3) { this.lose('serok', 'Serok meleset tiga kali, ikan menyentak lepas.'); return; }
        caption('Meleset! Sisa ' + (3 - F.misses) + ' kesempatan', 1200); F.stam = Math.min(0.45, F.stam + 0.05);
      }
    } else if (F.netStep === 3) {
      if (F.netT <= 0.9) this.finishNet(); else { F.netStep = 2; F.cue = 0; this.setButton('fight'); $('actIcon').innerHTML = IC.net; $('actTxt2').textContent = 'Serok'; this.netHud('2/3 · CELUP SEROK', 'Terlambat! Ketuk saat penanda di zona hijau.', 0.66, true); }
    }
  }
  /** Tahap akhir berhasil: baru sekarang hasil dikirim ke server. */
  private finishNet() {
    const F = this.F!;
    F.netStep = 4; F.landT = 0; F.landFrom.copy(F.pos);
    $('netUi').hidden = true; this.setButton('none');
    this.splash.burst(F.pos.clone().setY(0), 1.1, 40); sfx.splash(1); buzz([30, 30, 30, 30, 90]);
    caption('Wah… ' + F.name + '!', 1800);
    this.backend.land(F.hookId, 'caught', true).then(r => {
      if (r.result !== 'caught' || !r.catch) { toast('Ikan lepas saat diangkat.'); return; }
      this.lastCatch = r.catch;
      if (r.player) this.setPlayer(r.player);
      (this as unknown as { landRes: typeof r }).landRes = r;
    }).catch(err => { toast((err as Error).message); (this as unknown as { landErr: boolean }).landErr = true; });
  }

  private updateNetSteps(dt: number) {
    const F = this.F!;
    F.netT += dt;
    // ikan menggeliat dekat permukaan di depan kaki
    const near = this.bodyPoint(0.25, 0, -2.2); near.y = -0.08;
    const target = F.netStep === 1 ? V().lerpVectors(F.landFrom, near, Math.min(1, F.guideT / 1.3)) : near;
    F.pos.lerp(target, 1 - Math.exp(-dt * 4)); F.pos.y = -0.08 + Math.sin(this.t * 7) * 0.03;
    this.fish.group.position.copy(F.pos);
    this.fish.group.rotation.set(0, F.heading + Math.sin(this.t * 3) * 0.4, Math.sin(this.t * 11) * 0.2);
    this.fish.update(this.t, 0.8, 0.08);
    if (Math.random() < dt * 3) this.world.water.addRipple(F.pos.x, F.pos.z, 0.4);
    // serok: ditaruh di samping, dicelup di tahap 2–3
    const dip = F.netStep >= 2 ? 1 : 0;
    const nh = this.bodyPoint(-0.35, 0.95, -0.35), tip = V().lerpVectors(this.bodyPoint(-0.6, 0.4, 0.2), F.pos.clone().setY(-0.05), dip);
    this.placeNet(nh, tip);
    if (F.netStep === 1) {
      if (this.holding) { F.guideT += dt; setReel(1); } else setReel(0);
      this.netHud('1/3 · TUNTUN IKAN', 'Tahan tombol untuk membawa ikan ke dekat kaki.', Math.min(1, F.guideT / 1.3) / 3, false);
      if (F.guideT >= 1.3) { F.netStep = 2; F.netT = 0; F.cue = 0; setReel(0); this.setButton('fight'); $('actIcon').innerHTML = IC.net; $('actTxt2').textContent = 'Serok'; this.netHud('2/3 · CELUP SEROK', 'Ketuk saat penanda berada di zona hijau.', 1 / 3 + 1 / 3, true); }
      else if (F.netT > 6 && F.guideT < 0.3) { // terlalu lama diam: ikan pulih dan melawan lagi
        $('netUi').hidden = true; this.net.visible = false; F.stam = 0.5; F.L = 5; F.beh = 'run'; F.behT = 1.5; this.mode = 'fight'; this.setButton('fight'); $('fight').hidden = false;
        caption('Ikan pulih dan melawan lagi!', 1500);
      }
    } else if (F.netStep === 2) {
      F.cue += F.cueDir * dt * (0.9 + F.misses * 0.15 + F.tier * 0.15);
      if (F.cue > 1) { F.cue = 1; F.cueDir = -1; } else if (F.cue < 0) { F.cue = 0; F.cueDir = 1; }
      ($('netCue') as HTMLElement).style.left = (F.cue * 100).toFixed(1) + '%';
    } else if (F.netStep === 3 && F.netT > 1.6) {
      F.netStep = 2; F.cue = 0; this.setButton('fight'); $('actIcon').innerHTML = IC.net; $('actTxt2').textContent = 'Serok'; this.netHud('2/3 · CELUP SEROK', 'Terlambat! Coba lagi.', 0.66, true);
    }
  }
  /** Serok: gagang dari tangan kiri ke bingkai jaring. */
  private placeNet(hand: THREE.Vector3, hoop: THREE.Vector3) {
    const n = this.net, dir = hoop.clone().sub(hand), len = dir.length();
    n.position.copy(hand); n.lookAt(hoop); n.scale.set(1, 1, len / 1.6);
    (n.userData.hoop as THREE.Object3D).scale.set(1, 1, 1.6 / len);
  }

  private updateLanding(dt: number) {
    const F = this.F!;
    if (F.netStep < 4) { this.updateNetSteps(dt); return; }
    F.landT += dt / 1.1;
    this.placeNet(this.bodyPoint(-0.3, 1.0, -0.3), this.fish.group.position.clone());
    if (F.landT >= 1) this.net.visible = false;
    const u = smooth(Math.min(1, F.landT));
    const hold = this.bodyPoint(0, 1.18, -0.52);
    const p = V().lerpVectors(F.landFrom, hold, u); p.y += Math.sin(Math.PI * u) * 0.8;
    this.fish.group.position.copy(p);
    this.fish.group.rotation.set(0, F.heading + (this.spot.yaw - Math.PI / 2 - F.heading) * u, Math.sin(this.t * 14) * 0.25 * (1 - u));
    this.fish.update(this.t, 1 - u * 0.6, 0.1);
    if (Math.random() < 0.6) this.splash.drip(p);
    if (F.landT >= 1) {
      if ((this as unknown as { landErr?: boolean }).landErr) { (this as unknown as { landErr?: boolean }).landErr = false; this.fish.group.visible = false; this.retrieve(); return; }
      this.mode = 'trophy'; this.angler.pose.holdFish = this.fish.group;
      if (this.autoOn) { this.autoT = 1.8; this.trophyT = 0; return; } // pamer sebentar, lalu simpan & lempar lagi
      document.body.classList.add('trophy');
      this.showCatchCard();
    }
  }

  private showCatchCard() {
    const F = this.F!;
    const r = (this as unknown as { landRes?: { catch: CatchRec; record?: string; xp?: number; levelUp?: boolean; prev?: number | null } }).landRes;
    const RAR = ['Biasa', 'Bagus', 'Rare', 'Epic'];
    $('cTier').textContent = RAR[Math.min(3, F.tier)] ?? 'Biasa'; $('cTier').className = 'tier r' + Math.min(3, F.tier); void SIZE_TIERS;
    $('cName').textContent = F.name;
    this.onCatchCard(F.k, F.weight, r?.catch.length ?? fishLengthCm(F.k, F.weight));
    $('cRecord').textContent = r?.record === 'first' ? '★ Jenis baru di album!' : r?.record === 'best' ? '★ REKOR BARU!' : '';
    const stars = r?.catch.stars ?? 3;
    $('cStars').innerHTML = [1, 2, 3, 4, 5].map(i => `<span class="${i <= stars ? 'on' : 'off'}" style="animation-delay:${0.25 + i * 0.18}s">★</span>`).join('');
    $('cLen').textContent = fmtNum(r?.catch.length ?? fishLengthCm(F.k, F.weight), 1) + ' cm';
    $('cDur').textContent = Math.round(this.now() - F.start) + ' dtk';
    $('cVal').textContent = String(r?.catch.value ?? '—');
    $('cXp').textContent = '+' + (r?.xp ?? 0) + ' Exp'; $('ctCoin').textContent = (r?.catch.value ?? '—') + ' Koin';
    ($('catchToast').querySelector('b') as HTMLElement).textContent = 'Ikan berhasil ditangkap!';
    $('catchCard').hidden = false; $('catchToast').hidden = false; this.trophyT = 0;
    // berat berhitung naik
    const el = $('cWeight'), t0 = performance.now();
    const step = () => { const u = Math.min(1, (performance.now() - t0) / 900); el.textContent = fmtNum(F.weight * easeOut(u), 2); if (u < 1) requestAnimationFrame(step); };
    step();
    flash(0.6); sfx.win();
    if (r?.record === 'best' || F.tier >= 3) confetti();
    if (r?.levelUp) setTimeout(() => banner('NAIK LEVEL!', '#ffd873'), 900);
    if (!r) setTimeout(() => this.showCatchCardFill(), 600);
  }
  private showCatchCardFill() {
    const r = (this as unknown as { landRes?: { catch: CatchRec; xp?: number } }).landRes;
    if (!r) return;
    $('cVal').textContent = String(r.catch.value); $('cXp').textContent = '+' + (r.xp ?? 0) + ' Exp'; $('ctCoin').textContent = r.catch.value + ' Koin';
  }

  keepCatch() {
    $('catchCard').hidden = true; $('catchToast').hidden = true;
    const r = (this as unknown as { landRes?: { kept?: boolean } }).landRes;
    toast(r?.kept === false ? (this.player.bigBasket ? 'Keranjang penuh. Jual ikan dulu di warung.' : 'Keranjang penuh. Jual ikan, atau beli Keranjang besar (20 ikan) di Toko → Alat.') : 'Ikan disimpan di keranjang.', r?.kept === false ? 4200 : 2600);
    (this as unknown as { landRes?: unknown }).landRes = undefined;
    this.endTrophy();
  }
  releaseCatch() {
    $('catchCard').hidden = true; $('catchToast').hidden = true;
    const c = this.lastCatch;
    if (c) this.backend.release(c.id).then(r => this.setPlayer(r.player)).catch(() => {});
    toast('Ikan dilepas kembali ke danau. +2 XP');
    (this as unknown as { landRes?: unknown }).landRes = undefined;
    // ikan dilempar kembali ke air
    const F = this.F;
    if (F) { const to = this.bodyPoint(0.2, 0, -2.5); this.splash.burst(to.setY(0), 0.8, 24); this.world.water.addRipple(to.x, to.z, 1.2); sfx.splash(0.6); }
    this.endTrophy();
  }
  setDrag(d: number) { this.reelDrag = clamp(Math.round(d), 1, 5); store.set('drag', this.reelDrag); $('dragTxt').textContent = String(this.reelDrag); }
  /** Teks untuk dibagikan dari kartu tangkapan. */
  shareText() { const F = this.F; return F ? `Saya dapat ${F.name} ${fmtKg(F.weight)} di ${this.spot.label}, ${LOCATIONS.find(l => l.id === LOC)?.name ?? 'PAUNJUNAN'}! 🎣 #PAUNJUNAN` : ''; }
  private endTrophy() {
    this.spin = 0;
    this.angler.pose.holdFish = null; this.fish.group.visible = false; document.body.classList.remove('trophy');
    this.floatPos.copy(this.angler.rod.tip);
    this.toReady();
  }

  private wildJump(x: number, z: number) {
    if (this.mode === 'fight' || this.mode === 'landing' || this.mode === 'trophy') return;
    this.splash.burst(V(x, 0, z), 0.5, 14); this.world.water.addRipple(x, z, 1.1);
  }

  /** Untuk pengujian tampilan: langsung ke momen tertentu. */
  debugDemo(kind: 'trophy' | 'fight', k: SpeciesId, weight: number) {
    this.startFight({ hookId: 'demo', species: k, name: SPECIES[k].name, weight, tier: 2, t: 0.7, strength: 1, minFight: 999 });
    if (kind === 'fight') { this.F!.jumpT = Number(new URLSearchParams(location.search).get('jt') ?? 0.3); this.F!.L = 9; this.F!.bearing = 0.2; this.F!.heading = Math.PI + this.spot.yaw; return; }
    this.F!.start = this.now() - 34;
    (this as unknown as { landRes: unknown }).landRes = { catch: { id: 'demo', species: k, name: SPECIES[k].name, weight, length: fishLengthCm(k, weight), tier: 2, stars: 4, spot: 'A1', at: 0, value: 120 }, record: 'best', xp: 58, kept: true };
    $('fight').hidden = true; this.mode = 'trophy'; this.angler.pose.holdFish = this.fish.group; document.body.classList.add('trophy');
    this.showCatchCard();
  }

  syncMe() { this.backend.me().then(p => this.setPlayer(p)).catch(() => {}); }

  // ---------- pembaruan tiap gambar ----------
  update(dtReal: number) {
    if (this.slowT > 0) {
      // gerak lambat: masuk cepat (0,2 dtk), tahan, keluar halus (0,4 dtk)
      this.slowT -= dtReal; const u = 1 - Math.max(0, this.slowT) / this.slowDur;
      this.slowmo = clamp(u < 0.12 ? u / 0.12 : u > 0.76 ? (1 - u) / 0.24 : 1, 0, 1);
      this.timeScale = 1 - 0.72 * this.slowmo;
      if (this.slowT <= 0) { this.slowmo = 0; this.timeScale = 1; document.body.classList.remove('slowmo'); }
    } else { this.timeScale = 1; this.slowmo = 0; }
    const dt = dtReal * this.timeScale;
    this.t += dt;
    const P = this.angler.pose, t = this.t;
    const tipHang = () => this.angler.rod.tip.clone().add(V(Math.sin(t * 1.3) * 0.03, -0.55, Math.cos(t * 1.1) * 0.03));
    P.breathe = this.mode === 'fight' ? 1.5 : 0;
    P.lean = 0; P.twist = 0; P.reeling = false; P.leftOnButt = false; P.roll = 0;
    const readyHand = V(0.16, 1.1, -0.36);
    let loadMag = 0.03;
    let lineTo: THREE.Vector3 | null = null, sag = 0.02;
    this.float.visible = true;
    P.seat += ((this.seated && this.mode !== 'walk' ? 1 : 0) - P.seat) * Math.min(1, dtReal * 4);
    this.stool.visible = P.seat > 0.3;
    // keranjang kawat mengapung di samping pemancing saat keranjang berisi ikan
    const kn = this.mode !== 'walk' && this.mode !== 'menu' && (this.player?.basket.length ?? 0) > 0;
    this.keepnet.visible = kn;
    if (kn) { const q = this.bodyPoint(0.9, 0, -0.9); this.keepnet.position.set(q.x, Math.sin(t * 1.1) * 0.015, q.z); this.keepnet.rotation.y = t * 0.05; }
    if (this.stool.visible) { this.stool.position.copy(this.bodyPoint(0, 0, 0.08)).setY(this.angler.root.position.y); this.stool.rotation.y = this.angler.root.rotation.y; }

    if (this.autoOn) this.autoTick(dt);
    switch (this.mode) {
      case 'walk': {
        // joran dibawa tegak di tangan kanan, pelampung terkait di ujung
        P.hand.copy(V(0.25, 0.98, -0.16)); P.pitch = 1.12; P.yaw = 0.12; P.leftOnButt = false;
        if (!P.look) P.look = this.bodyPoint(0, 1.4, -8);
        this.floatPos.copy(tipHang()); lineTo = this.floatPos; sag = 0;
        break;
      }
      case 'menu': case 'ready': {
        P.hand.copy(readyHand); P.pitch = 0.62 + Math.sin(t * 0.5) * 0.02; P.yaw = this.aimYaw * 0.5 + 0.06;
        P.look = this.bodyPoint(0, 0, -12);
        this.floatPos.copy(tipHang()); lineTo = this.floatPos; sag = 0;
        break;
      }
      case 'charging': {
        this.power += dt * this.pDir / 0.95;
        if (this.power >= 1) { this.power = 1; this.pDir = -1; } else if (this.power <= 0.12) { this.power = 0.12; this.pDir = 1; }
        const u = smooth(this.power);
        P.hand.copy(readyHand).lerp(V(0.22, 1.55, -0.1), u); P.pitch = 0.62 + u * 1.5; P.yaw = this.aimYaw * 0.8 + 0.04; P.leftOnButt = true; P.twist = -u * 0.2; P.lean = u * 0.12;
        P.look = this.bodyPoint(0, 0, -12);
        this.floatPos.copy(tipHang()); lineTo = this.floatPos; sag = 0;
        const pr = this.predictLanding(this.power);
        this.aim.position.set(pr.to.x, 0.03, pr.to.z); this.aim.scale.setScalar(1 + Math.sin(t * 8) * 0.06);
        (($('powerRing') as unknown) as SVGCircleElement).style.strokeDashoffset = String(339.3 * (1 - this.power));
        break;
      }
      case 'casting': {
        this.castPhase += dt / 0.24;
        const u = easeOut(Math.min(1, this.castPhase));
        P.hand.copy(V(0.22, 1.55, -0.1)).lerp(V(0.18, 1.3, -0.5), u); P.pitch = this.castPitch0 + (0.18 - this.castPitch0) * u; P.yaw = this.aimYaw * 0.9; P.leftOnButt = true; P.lean = -u * 0.15;
        loadMag = 0.4 * Math.sin(Math.PI * Math.min(1, this.castPhase));
        this.floatPos.copy(tipHang()); lineTo = this.floatPos;
        if (this.castPhase >= 0.45 && this.mode === 'casting') { this.launch(); }
        (($('powerRing') as unknown) as SVGCircleElement).style.strokeDashoffset = '339.3';
        break;
      }
      case 'flying': {
        this.flyT += dt; const u = Math.min(1, this.flyT / this.flyDur);
        P.hand.copy(V(0.18, 1.25, -0.48)); P.pitch = 0.25 + u * 0.15; P.yaw = this.aimYaw * 0.9; P.leftOnButt = false;
        const h = Math.max(2.5, this.castFrom.distanceTo(this.castTo) * 0.22);
        this.floatPos.lerpVectors(this.castFrom, this.castTo, u); this.floatPos.y = this.castFrom.y * (1 - u) + Math.sin(Math.PI * u) * h;
        lineTo = this.floatPos; sag = 0.3 * u;
        P.look = this.floatPos;
        if (u >= 1) this.onLand();
        break;
      }
      case 'settling': case 'waiting': case 'hooking': {
        P.hand.copy(readyHand).add(V(0, -0.02, 0)); P.pitch = 0.42; P.yaw = this.aimYaw * 0.85;
        P.look = this.floatPos;
        if (this.mode === 'settling') {
          this.settleT += dt;
          if (this.settleT > 1.3 && this.castRes) { this.mode = 'waiting'; this.setButton('wait'); }
        }
        let y = Math.sin(t * 1.6 + this.floatPos.x) * 0.012 + Math.sin(t * 2.7) * 0.006;
        if (this.mode === 'settling') y -= Math.max(0, 0.05 - this.settleT * 0.04);
        // gigitan kecil sebelum menyambar
        if (this.castRes && this.mode === 'waiting') {
          const rt = this.now();
          if (rt >= this.nibbleNext && rt < this.biteAt - 0.3) {
            this.nibbleNext = rt + 0.8 + Math.random() * 0.4; this.dip = 1;
            this.world.water.addRipple(this.floatPos.x, this.floatPos.z, 0.4); sfx.nibble(); buzz(8);
          }
          if (rt >= this.biteAt && !this.bitten) {
            this.bitten = true; this.world.water.addRipple(this.floatPos.x, this.floatPos.z, 1.2); sfx.bite(); buzz([40, 40, 80]); this.setButton('strike');
            this.splash.burst(this.floatPos, 0.25, 8);
          }
          if (this.bitten && rt > this.biteAt + HOOK_LATE + 0.2) { this.strike(); }
          if (!this.bitten && rt - this.waitStart > 25 && this.castRes.biteIn === null) { this.waitStart = rt + 20; this.emptyCasts++; this.quiet(); }
        }
        this.dip = Math.max(0, this.dip - dt * 4);
        y -= this.dip * 0.05;
        if (this.bitten) y = -0.14 - Math.sin(t * 9) * 0.02;
        if (this.mode === 'hooking') { this.strikeT += dt; P.pitch = 0.42 + Math.min(1, this.strikeT * 6) * 0.7; loadMag = 0.5; }
        this.floatPos.y = y;
        lineTo = this.floatPos.clone().setY(y + 0.12); sag = this.bitten ? 0.02 : 0.35;
        loadMag = Math.max(loadMag, this.bitten ? 0.25 : 0.04);
        break;
      }
      case 'fight': {
        this.updateFight(dt);
        const F = this.F; if (!F) break;
        const tn = F.T / 100;
        P.hand.copy(V(0.17, 1.2 + tn * 0.08, -0.34)); P.pitch = 0.7 + tn * 0.35; P.yaw = clamp(F.bearing, -0.7, 0.7); P.reeling = this.holding;
        P.lean = 0.1 + tn * 0.18; P.twist = clamp(F.bearing, -0.5, 0.5) * 0.4; P.look = F.pos;
        loadMag = 0.15 + tn * 1.1;
        lineTo = F.pos.clone().setY(Math.max(F.pos.y, -0.05) + 0.05); sag = Math.max(0, (0.25 - tn) * 0.8);
        this.float.visible = false;
        break;
      }
      case 'landing': {
        this.updateLanding(dt);
        P.hand.copy(V(0.2, 1.3, -0.3)); P.pitch = 1.2; P.yaw = 0; P.lean = 0.1; P.look = this.fish.group.position;
        if (this.F) lineTo = this.fish.group.position; loadMag = 0.4; this.float.visible = false;
        break;
      }
      case 'trophy': {
        if (P.holdStyle === 'angkat') {
          // ikan diangkat tinggi, rahang dijepit tangan kanan, tergantung tegak & sedikit berayun (seperti gambar konsep)
          this.trophyT = Math.min(1, this.trophyT + dt * 2.2);
          const hand = this.angler.raiseHand(), len = this.fish.lengthM;
          const swing = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(t * 2.3) * 0.09, 0, Math.sin(t * 1.7 + 1) * 0.07));
          const q = new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), this.spot.yaw + Math.PI / 2 - 0.45 + this.spin + Math.sin(t * 1.1) * 0.1)
            .multiply(swing).multiply(new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -Math.PI / 2));
          const hang = V(0, -(0.03 + len * 0.46), 0).applyQuaternion(swing);
          const target = hand.clone().add(hang);
          const from = this.bodyPoint(0, 1.18, -0.52);
          this.fish.group.position.lerpVectors(from, target, smooth(this.trophyT));
          this.fish.group.quaternion.copy(q);
          P.look = target.clone().add(V(0, len * 0.2, 0));
        } else {
          P.look = this.bodyPoint(-0.3, 1.5, -3);
          this.fish.group.position.copy(this.bodyPoint(0, 1.18 + Math.sin(t * 2) * 0.01, -0.52));
          this.fish.group.rotation.set(0, this.spot.yaw - Math.PI / 2 + this.spin, Math.sin(t * 5) * 0.06);
        }
        this.fish.update(this.t, 0.15, 0.05);
        if (Math.random() < 0.15) this.splash.drip(this.fish.group.position);
        this.float.visible = false;
        break;
      }
      case 'retrieving': {
        this.retrT += dt / this.retrDur; const u = Math.min(1, this.retrT);
        P.hand.copy(readyHand); P.pitch = 0.62; P.yaw = this.aimYaw * 0.5; P.reeling = true; P.reelAngle -= dt * 18;
        const to = tipHang();
        this.floatPos.lerpVectors(this.retrFrom, to, smooth(u)); this.floatPos.y = Math.max(this.floatPos.y, this.retrFrom.y + (to.y - this.retrFrom.y) * Math.pow(u, 3));
        if (u < 0.9 && Math.random() < dt * 6 && this.floatPos.y < 0.2) this.world.water.addRipple(this.floatPos.x, this.floatPos.z, 0.3);
        lineTo = this.floatPos; sag = 0.05;
        if (u >= 1) this.toReady();
        break;
      }
    }
    // beban lengkung joran ke arah senar
    if (lineTo) P.load.copy(lineTo).sub(this.angler.rod.tip).normalize().multiplyScalar(loadMag);
    this.angler.update(t);
    this.placeCarry(dtReal);
    this.float.position.copy(this.floatPos);
    this.float.rotation.set(this.mode === 'settling' ? Math.max(0, 1.3 - this.settleT * 1.2) : Math.sin(t * 1.3) * 0.05, 0, 0);
    if (this.mode === 'fight' || this.mode === 'landing') this.float.visible = false;
    if (lineTo) { this.line.line.visible = true; this.line.set(this.angler.rod.tip, lineTo, sag, 0.3); } else this.line.line.visible = this.mode !== 'trophy';
    if (this.mode === 'trophy') this.line.line.visible = false;
    this.splash.update(dtReal, (x, z) => this.world.water.addRipple(x, z, 0.25));
  }

  // ---------- mancing otomatis ----------
  /** Mulai di spot tempat pemain berdiri. Mengembalikan pesan galat, atau '' bila berjalan. */
  async startAuto(): Promise<string> {
    if (this.autoOn) return '';
    if (this.mode !== 'ready') return this.mode === 'walk' ? 'Pilih tempat dulu: ketuk "Mancing di sini" atau pergi ke spot.' : 'Tunggu lemparan/adu tarik selesai.';
    let info: AutoInfo;
    try { info = await this.backend.autoInfo(); } catch (e) { return (e as Error).message; }
    if (!info.allowed) return info.reason;
    const why = this.autoBlock(info); if (why) return why;
    this.autoCfg = info; this.autoOn = true; this.autoT = 0.8; this.autoReact = 0;
    this.autoStats = { caught: 0, lost: 0, sold: 0, kg: 0, coins: 0, xp: 0, start: this.now(), left: info.left };
    document.body.classList.add('autofish'); this.onAuto('start');
    return '';
  }
  stopAuto(reason = '') {
    if (!this.autoOn) return;
    this.autoOn = false; this.holding = false; document.body.classList.remove('autofish');
    $('actBtn').classList.remove('down');
    if (this.mode === 'trophy') { $('catchToast').hidden = true; (this as unknown as { landRes?: unknown }).landRes = undefined; this.endTrophy(); }
    this.onAuto('stop', reason);
  }
  /** Alasan tidak bisa lanjut (umpan habis, keranjang penuh, batas harian). */
  private autoBlock(info: AutoInfo | null = this.autoCfg) {
    const p = this.player;
    if ((p.bait[p.curBait] ?? 0) <= 0) return 'Umpan habis. Beli atau ganti umpan dulu.';
    if (info?.full !== 'jual' && p.basket.length >= basketCap(p)) return 'Keranjang penuh. Jual ikan dulu' + (p.bigBasket ? '.' : ', atau beli Keranjang besar (20 ikan).');
    if (this.autoStats.left === 0) return 'Batas mancing otomatis hari ini sudah habis.';
    return '';
  }
  /** Langkah otomatis tiap gambar: lempar dengan tenaga acak, sentak saat pelampung tenggelam, simpan ikan. */
  private autoTick(dt: number) {
    const inner = (f: () => void) => { this.autoInner = true; try { f(); } finally { this.autoInner = false; } };
    switch (this.mode) {
      case 'ready': {
        this.autoT -= dt; if (this.autoT > 0) break;
        const why = this.autoBlock(); if (why) { this.stopAuto(why); break; }
        // tunggu jeda minimal server (otomatis sengaja lebih lambat dari manual)
        const gap = (this.autoCfg?.minGap ?? 0) - (this.now() - this.autoLast);
        if (gap > 0) { this.autoT = Math.min(gap, 1); break; }
        this.aimYaw = (Math.random() - 0.5) * 0.6; this.autoPow = 0.45 + Math.random() * 0.4; this.autoReact = 0;
        inner(() => this.press());
        break;
      }
      case 'charging': if (this.power >= this.autoPow) inner(() => this.release()); break;
      case 'settling': case 'waiting':
        if (this.bitten) {
          // reaksi manusiawi 0,25–0,6 dtk (jam nyata, sama dengan jam server), selalu di dalam batas sentak
          const rt = this.now();
          if (this.autoReact === 0) this.autoReact = rt + Math.min(HOOK_LATE * 0.6, 0.25 + Math.random() * 0.35);
          else if (rt >= this.autoReact) { this.autoReact = 0; this.strike(); }
        } else if (this.castRes && this.castRes.biteIn === null && this.now() - this.waitStart > 18) this.strike(); // sepi: gulung & lempar lagi
        break;
      case 'trophy':
        this.autoT -= dt;
        if (this.autoT <= 0) { $('catchToast').hidden = true; (this as unknown as { landRes?: unknown }).landRes = undefined; this.endTrophy(); this.autoT = 0.9 + Math.random() * 0.8; }
        break;
    }
  }
  private autoLast = -1e9;
  /** Pengendali tombol otomatis: jaga jarum di zona emas (tahan saat kendur, lepas saat tegang / ikan melompat). */
  private autoFight(F: Fight) {
    if (F.jumpT >= 0) { this.holding = false; return; }
    if (F.beh === 'charge') { this.holding = true; return; }
    if (this.holding && F.T > 72) this.holding = false;
    else if (!this.holding && F.T < 52) this.holding = true;
  }
  /** Minta hasil ke server (dadu peluang berhasil yang diatur pemilik). */
  private autoLand(F: Fight) {
    F.autoSent = true; this.autoLast = this.now();
    this.backend.land(F.hookId, 'caught', true, true).then((r: LandResult) => {
      if (this.F !== F || this.mode !== 'fight') return;
      if (typeof r.left === 'number') this.autoStats.left = r.left;
      if (r.result === 'caught' && r.catch) {
        const st = this.autoStats; st.caught++; st.kg = Math.round((st.kg + r.catch.weight) * 100) / 100; st.coins += r.catch.value; st.xp += r.xp ?? 0; if (r.sold) st.sold++;
        this.lastCatch = r.catch; if (r.player) this.setPlayer(r.player);
        (this as unknown as { landRes: LandResult }).landRes = r;
        // langsung angkat (tanpa serok 3 tahap): ikan terbang ke tangan lalu dipamerkan sebentar
        $('fight').hidden = true; $('powerBtn').hidden = true; $('liftBtn').hidden = true; document.body.classList.remove('edge', 'fighting');
        setReel(0); setCreak(0.2);
        F.netStep = 4; F.landT = 0; F.landFrom.copy(F.pos); this.mode = 'landing';
        this.splash.burst(F.pos.clone().setY(0), 1.0, 36); sfx.splash(0.9); buzz([30, 30, 60]);
        $('ctCoin').textContent = (r.sold ? 'Dijual ' : '') + r.catch.value + ' Koin'; $('cXp').textContent = '+' + (r.xp ?? 0) + ' Exp';
        ($('catchToast').querySelector('b') as HTMLElement).textContent = '🤖 ' + r.catch.name + ' ' + fmtKg(r.catch.weight) + ' didapat!';
        $('catchToast').hidden = false;
        if (r.kept === false && !r.sold) setTimeout(() => this.stopAuto('Keranjang penuh.'), 2200);
        if (r.levelUp) banner('NAIK LEVEL!', '#ffd873');
      } else { this.autoStats.lost++; this.lose('auto', 'Ikan berhasil melepaskan diri.', true); }
      this.onAuto('tick');
    }).catch((e: Error) => {
      if (this.F === F && this.mode === 'fight') this.lose('auto', e.message, true);
      this.stopAuto(e.message);
    });
  }

  /** Keranjang terlipat menggantung dari tangan kiri, berayun mengikuti langkah (pegas sederhana). */
  private placeCarry(dt: number) {
    const on = this.mode === 'walk';
    this.carryNet.visible = on;
    if (!on) return;
    const hand = this.angler.bone('LeftHand'); if (!hand) { this.carryNet.visible = false; return; }
    hand.updateWorldMatrix(true, false);
    const grip = hand.getWorldPosition(V()); grip.y -= 0.06;
    const yaw = this.angler.root.rotation.y, fwd = this.fwd(yaw);
    // ayunan: percepatan tangan ke depan membuat keranjang tertinggal lalu menyusul
    const v = dt > 0 ? grip.clone().sub(this.carryPrev).dot(fwd) / dt : 0; this.carryPrev.copy(grip);
    const target = clamp(-v * 0.12, -0.5, 0.5);
    this.carryVel += ((target - this.carrySwing) * 40 - this.carryVel * 6) * Math.min(dt, 0.05);
    this.carrySwing = clamp(this.carrySwing + this.carryVel * Math.min(dt, 0.05), -0.6, 0.6);
    this.carryNet.position.copy(grip);
    this.carryNet.rotation.set(this.carrySwing, yaw, 0, 'YXZ');
  }

  get activity(): 'active' | 'idle' {
    if (this.mode === 'walk') return 'active'; return this.mode === 'waiting' || this.mode === 'settling' ? (this.bitten ? 'active' : 'idle') : 'active'; }
  baitName() { return BAITS[this.player.curBait].name; }
  speciesName(k: SpeciesId) { return SPECIES[k].name; }
}

/** Kotak pancing (tempat duduk). */
function makeStool() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.34, 0.3), new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 0.5 }));
  box.position.y = 0.17; box.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.32), new THREE.MeshStandardMaterial({ color: 0x1f4d35, roughness: 0.6 }));
  lid.position.y = 0.36;
  const latch = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.02), new THREE.MeshStandardMaterial({ color: 0xc9b690, metalness: 0.6, roughness: 0.3 }));
  latch.position.set(0, 0.32, 0.16);
  g.add(box, lid, latch); g.visible = false;
  return g;
}

/** Keranjang kawat (keepnet) setengah terendam. */
function makeKeepnet() {
  const g = new THREE.Group();
  const wire = new THREE.MeshBasicMaterial({ color: 0x9aa39c, wireframe: true, transparent: true, opacity: 0.7 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.55, 12, 4, true), wire); body.position.y = -0.12;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.012, 6, 20), new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.5, roughness: 0.4 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
  const float = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.035, 6, 16), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }));
  float.rotation.x = Math.PI / 2; float.position.y = 0.1;
  g.add(body, ring, float); g.visible = false; return g;
}

/** Keranjang kawat terlipat (dijinjing): cincin-cincin bertumpuk, jaring rapat, pelampung oranye, tali jinjing.
 *  Titik asal = genggaman; cakram menggantung ke bawah, bidangnya sejajar sisi badan (normal = kanan badan, sumbu X). */
function makeFoldedNet() {
  const g = new THREE.Group(), R = 0.2, cy = -0.25;
  const ringMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.5, roughness: 0.4 });
  const ringGeo = new THREE.TorusGeometry(R, 0.009, 5, 22).rotateY(Math.PI / 2);
  for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(ringGeo, ringMat); r.position.set(-0.018 + i * 0.012, cy, 0); g.add(r); }
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.05, 16, 1, true).rotateZ(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x8e978f, wireframe: true, transparent: true, opacity: 0.6 }));
  mesh.position.y = cy;
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R * 0.96, 16).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x2b3530, roughness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
  bottom.position.set(-0.024, cy, 0);
  const float = new THREE.Mesh(new THREE.TorusGeometry(R + 0.02, 0.022, 6, 18).rotateY(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5 }));
  float.position.set(0.026, cy, 0);
  // tali jinjing: dari genggaman ke dua titik di tepi atas cincin
  const strapMat = new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.8 });
  for (const sz of [-1, 1]) {
    const a = V(0, 0, 0), b = V(0, cy + R * 0.92, sz * R * 0.38), len = a.distanceTo(b);
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.006, len, 0.018), strapMat);
    st.position.copy(a).add(b).multiplyScalar(0.5); st.rotation.x = Math.atan2(b.z - a.z, a.y - b.y); g.add(st);
  }
  g.add(mesh, bottom, float);
  g.traverse(o => { o.castShadow = true; }); g.visible = false;
  return g;
}

/** Serok (landing net): gagang 1,6 m, bingkai bulat, kantong jaring. Sumbu +Z = arah gagang. */
function makeLandingNet() {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 1.6, 6).rotateX(Math.PI / 2).translate(0, 0, 0.8), new THREE.MeshStandardMaterial({ color: 0x2a2d30, metalness: 0.5, roughness: 0.4 }));
  const hoop = new THREE.Group(); hoop.position.z = 1.6;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.01, 6, 24), new THREE.MeshStandardMaterial({ color: 0x3a3d40, metalness: 0.6, roughness: 0.35 }));
  ring.position.z = 0.22;
  const bag = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.35, 12, 3, true).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0x1d2b24, wireframe: true, transparent: true, opacity: 0.8 }));
  bag.position.set(0, -0.17, 0.22);
  hoop.add(ring, bag);
  g.add(pole, hoop); g.userData.hoop = hoop; g.visible = false;
  g.traverse(o => { o.castShadow = true; });
  return g;
}

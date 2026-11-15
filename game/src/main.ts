// PAUNJUNAN — titik masuk game.
import * as THREE from 'three';
import { SPECIES, BAITS, RODS, LINES, WEATHER, levelInfo, basketCap, type WeatherId, type BaitId, type RodId, type LineId, type Player } from '@paunjunan/shared';
import { loadAssets } from './core/assets';
import { Q, tier, settings, targetFps, DynRes, FramePacer, saverOn, isMobile } from './core/quality';
import { LocalBackend, RemoteBackend, type Backend } from './core/backend';
import { setMotion, Angler } from './actors/angler';
import { HybridBackend } from './core/hybrid';
import { testServer } from './core/servertest';
import { quietAdvice } from './game/advice';
import { Net } from './core/net';
import { store } from './core/store';
import { initAudio, setMuted, sfx, suspendAudio, resumeAudio } from './core/audio';
import { initMobile, keepAwake, exitApp, platform } from './core/mobile';
import { recoverPurchases } from './core/purchase';
import { World } from './world/world';
import { LOC, IS_DANAU, SPOT_PLACES, groundH, walkHeight, walkInfo, findPath, nearestWalkable, nearestFishable, ENTRY, LOKET, MAP_PRELOAD, SHOP } from './world/layout';
import { Walker, PACES } from './game/walker';
import { drawMap, drawMinimap, mapBase, toWorld, MAP_BOUNDS, type View, type MapDyn } from './ui/map';
import { Chat } from './ui/chat';
import { Soundscape } from './core/soundscape';
import { Coach } from './ui/coach';
import { openSignIn, openSignUp, openPin, openAccount } from './ui/account';
import { createSocialUI } from './ui/social';
import { createTradeUI } from './ui/trade';
import type { TradePartner } from './core/backend';
import { createProgressUI } from './ui/progress';
import { createEvents } from './ui/events';
import { createShop } from './ui/shop';
import { openAdmin, setEventHook } from './ui/admin';
import { lookOf, LOCATIONS } from '@paunjunan/shared';
import { Fishing } from './game/fishing';
import { CamRig, CAM_MODES, type CamMode } from './game/camera';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Crowd, simulatedPlayers, bubble } from './game/crowd';
import { FishingLine } from './actors/tackle';
import { FishActor } from './actors/fish';
import { $, toast, openSheet, closeSheet, esc, fmtKg, fmtNum, sheetOpen, confetti } from './ui/hud';
import { createHud, avatarFallback } from './ui/hudv2';
import { IS_SERENE, MAPSTYLE } from './world/layout';

const qs = new URLSearchParams(location.search);
window.addEventListener('error', e => showErr(e.error?.stack || e.message));
window.addEventListener('unhandledrejection', e => showErr(String((e.reason as Error)?.stack || e.reason)));
function showErr(s: string) { const b = $('errBox'); b.hidden = false; b.textContent = 'Terjadi kesalahan. Kirim tangkapan layar ini ke pengembang:\n' + s; }

// ---------- renderer hemat daya ----------
const canvas = $('c') as unknown as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q.antialias && !isMobile, powerPreference: tier === 'tinggi' ? 'high-performance' : 'low-power', stencil: false });
const dyn = new DynRes(Q.maxDpr, () => (saverOn() ? 0.85 : 1));
if (isMobile) document.documentElement.classList.add('mobile');
const pacer = new FramePacer();
renderer.setPixelRatio(dyn.dpr);
// HP ber-RAM kecil: bila sistem mengambil memori grafis (context lost), muat ulang dengan rapi — progres aman di server/perangkat
canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); toast('Memori grafis penuh — memuat ulang…', 3000); setTimeout(() => location.reload(), 1200); });
renderer.setSize(innerWidth, innerHeight);
// bloom sinematik (hanya grafis Tinggi, bisa dimatikan): cahaya terang (matahari di air, lampu, langit) berpendar lembut
let composer: EffectComposer | null = null;
function setupBloom(on: boolean) {
  if (!on || tier !== 'tinggi') { composer?.dispose(); composer = null; return; }
  if (composer) return;
  // PENTING: langit (shader Sky) bernilai jauh di atas 1 sebelum tone mapping. Bloom di ruang HDR membuat seluruh layar
  // memutih. Maka urutannya: render → OutputPass (tone mapping + sRGB, jadi 0..1) → bloom dengan ambang ketat.
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, cam));
  composer.addPass(new OutputPass());
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.18, 0.3, 0.94));
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
}
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 3000);
cam.layers.enable(1);
addEventListener('resize', () => { pacer.force(); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); FishingLine.resize(innerWidth, innerHeight); });

// ---------- waktu & cuaca dunia ----------
const timePref = () => store.get<string>('timeMode', 'nyata');
function worldHour() {
  if (qs.has('h')) return Number(qs.get('h'));
  const m = timePref();
  if (m === 'pagi') return 8.2; if (m === 'siang') return 12.3; if (m === 'sore') return 16.4; if (m === 'malam') return 20.5;
  if (MAPSTYLE?.hour != null) return MAPSTYLE.hour; // peta bersuasana tetap (senja muara, malam pelabuhan) saat memakai jam HP
  const d = new Date(); return d.getHours() + d.getMinutes() / 60;
}
function autoWeather(): WeatherId {
  const q = qs.get('w') as WeatherId | null; if (q && WEATHER[q]) return q;
  const pref = store.get<string>('weather', 'auto'); if (pref !== 'auto' && WEATHER[pref as WeatherId]) return pref as WeatherId;
  const h = worldHour(), slot = Math.floor(Date.now() / (30 * 60 * 1000));
  const x = Math.abs((Math.sin(slot * 91.7) * 43758.5) % 1);
  if (h >= 5 && h < 8 && x < 0.6) return 'kabut';
  return x < 0.14 ? 'hujan' : x < 0.24 ? 'kabut' : 'cerah';
}
let weather: WeatherId = autoWeather();

// ---------- backend: lokal atau server ----------
const serverUrl = store.get<string>('server', '') || qs.get('server') || '';
/** server sungguhan (bila dipakai) dibungkus HybridBackend: otomatis luring saat jaringan putus, sambung & sinkron saat kembali */
const remoteBe = serverUrl ? new RemoteBackend(serverUrl) : null;
const hybrid = remoteBe ? new HybridBackend(remoteBe, () => weather) : null;
const backend: Backend = hybrid ?? new LocalBackend(() => weather);
let net: Net | null = null;

(async () => {
  const assets = await loadAssets(p => { $('loadBar').style.width = Math.round(p * 90) + '%'; });
  if (!qs.has('nomocap')) setMotion(assets.motion); // gerak rekam-manusia untuk avatar (?nomocap = gerak lama, untuk membandingkan)
  $('loadTxt').textContent = 'Menumbuhkan pepohonan…';
  await new Promise(r => setTimeout(r, 30));
  // spot tersimpan bisa milik lokasi lain → pakai spot awal lokasi ini
  const startSpot = SPOT_PLACES.some(s => s.id === store.get<string>('spot', '')) ? store.get<string>('spot', '') : SPOT_PLACES[0].id;
  store.set('loc', LOC);
  const world = new World(renderer, scene, assets, startSpot);
  setupBloom(store.get<boolean>('bloom2', false)); // bawaan MATI (kunci baru: pengaturan lama yang memutihkan layar diabaikan)
  const fishing = new Fishing(scene, world, backend, assets.angler, assets.fish);
  const rig = new CamRig(cam);
  const crowd = new Crowd(assets.angler, scene);
  // penjaga warung (NPC) di belakang meja kios: topi rimba + rompi pancing, menoleh & menyapa saat pemain mendekat
  const keeper = SHOP ? new Angler(assets.angler, {}) : null;
  if (keeper && SHOP) {
    keeper.applyLook({ hat: 'rimba', hatColor: 'krem', shirt: 'rompi', shirtColor: 'zaitun', bag: 'tanpa', skin: 'langsat', glasses: 'tanpa' });
    keeper.rod.group.visible = false;
    keeper.root.position.set(SHOP.keeper.x, groundH(SHOP.keeper.x, SHOP.keeper.z), SHOP.keeper.z); keeper.root.rotation.y = SHOP.keeper.yaw;
    const P = keeper.pose; P.leftOnButt = false; P.hand.set(0.2, 1.0, -0.4); P.pitch = -1.2;
    keeper.root.updateMatrixWorld(true); scene.add(keeper.root);
  }
  let keeperT = 0, keeperNear = false, keeperBub: THREE.Sprite | null = null, keeperBubT = 0, keeperWave = 0;
  const KEEPER_LINES = ['Mau cari apa hari ini?', 'Umpan segar, baru datang!', 'Keranjang besar ada, muat 20!', 'Mampir dulu, lihat-lihat!'];
  function updateKeeper(dt: number, time: number) {
    if (!keeper || !SHOP) return;
    const me = fishing.angler.root.position, kp = keeper.root.position;
    const d = Math.hypot(me.x - kp.x, me.z - kp.z), dc = cam.position.distanceTo(kp);
    const near = d < SHOP.r + 3.5;
    if (near && !keeperNear) {
      keeperWave = 1.4;
      if (keeperBub) keeper.root.remove(keeperBub);
      keeperBub = bubble(KEEPER_LINES[Math.floor(Math.random() * KEEPER_LINES.length)]); keeper.root.add(keeperBub); keeperBubT = 3.5;
    }
    keeperNear = near;
    if (keeperBub) { keeperBubT -= dt; if (keeperBubT <= 0) { keeper.root.remove(keeperBub); keeperBub = null; } }
    keeperT -= dt;
    if (dc > 45 || keeperT > 0) return;           // jauh: tidak dihitung; dekat: 20×/dtk
    keeperT = 0.05;
    const P = keeper.pose;
    P.look = d < 12 ? me.clone().setY(me.y + 1.5) : keeper.root.localToWorld(new THREE.Vector3(0, 1.5, -6));
    if (keeperWave > 0) { keeperWave -= 0.05; P.hand.set(0.32 + Math.sin(time * 14) * 0.08, 1.62, -0.12); }
    else P.hand.set(0.2, 1.0 + Math.sin(time * 0.7) * 0.01, -0.4);
    keeper.update(time);
  }
  crowd.setHeight((x, z) => walkHeight(x, z) ?? groundH(x, z) + 0.06);
  const walker = new Walker(fishing, (x, z) => world.veg.setFocus({ x, z }));
  const chat = new Chat(), coach = new Coach();
  const sound = new Soundscape(LOC);
  rig.fightCam = store.get<'dekat' | 'joran'>('fightCam', 'dekat'); rig.height = store.get<number>('camH', 0);
  rig.mode = store.get<CamMode>('camMode', 'bahu'); rig.sorot = store.get<boolean>('camSorot', true);
  let activity: Record<string, string> = {};
  $('loadTxt').textContent = 'Menyiapkan jalan & peta…';
  await new Promise(r => setTimeout(r, 20));
  MAP_PRELOAD(); mapBase();
  world.setWeather(weather, fishing.angler.root.position);
  world.brightness = store.get<number>('bright', 1.15);
  fishing.spot = SPOT_PLACES.find(s => s.id === startSpot) ?? SPOT_PLACES[0];
  fishing.angler.root.position.set(fishing.spot.pos.x, fishing.baseY(), fishing.spot.pos.z);
  fishing.angler.root.rotation.y = fishing.spot.yaw;
  if (backend.mode === 'lokal') crowd.sync(simulatedPlayers());
  $('loadBar').style.width = '100%';

  // ---------- HUD pemain ----------
  let poseNow: 'idle' | 'cast' | 'wait' | 'fight' | 'walk' = 'idle';
  fishing.onPlayer = (p: Player) => {
    const L = levelInfo(p.xp);
    $('lvNum').textContent = String(L.lv); $('lvRing').style.setProperty('--p', Math.round(L.pct * 100) + '%');
    $('xpBar').style.width = Math.round(L.pct * 100) + '%';
    $('meName').textContent = p.name; $('coinTxt').textContent = p.coins.toLocaleString('id-ID');
    $('baitTxt').textContent = BAITS[p.curBait].name.split(' ')[0]; $('baitQty').textContent = String(p.bait[p.curBait] ?? 0);
    $('basketQty').textContent = p.basket.length + '/' + basketCap(p);
    chat.myName = p.name;
    hudRef?.setPlayer(p);
    if (!avaInit) { avaInit = true; avatarFallback(p.name); }
    progRef?.notify(lastP, p);
    lastP = { ...p, missions: p.missions ? structuredClone(p.missions) : undefined, badges: p.badges ? { ...p.badges } : undefined };
    const ak = (p.aquarium ?? []).map(f => f.id).join(','); if (ak !== myAqKey) { myAqKey = ak; world.aquarium.setFish(p.aquarium ?? []); world.aquarium.setOwner(p.name); }
    const lk = JSON.stringify(p.look ?? {}); if (lk !== myLookKey) { myLookKey = lk; fishing.angler.applyLook(lookOf(p)); avaDirty = true; }
  };
  let myLookKey = '', myAqKey = '-', clubName: string | null = null;
  let hudRef: ReturnType<typeof createHud> | null = null, avaInit = false, avaDirty = true;
  let lastP: Player | null = null;
  let progRef: ReturnType<typeof createProgressUI> | null = null;
  // ---------- tukar antarpemain ----------
  let netPlayers: TradePartner[] = [], tradeIn = 0;
  const trade = createTradeUI({ backend, player: () => fishing.player, setPlayer: (pl) => fishing.setPlayer(pl),
    partners: () => backend.mode === 'lokal' ? (backend as LocalBackend).tradePartners() : netPlayers,
    onCount: (n) => { tradeIn = n; } });
  /** kabar penawaran (server: lewat WebSocket; mode lokal: jawaban pedagang simulasi) */
  const onTrade = (kind: 'baru' | 'diterima' | 'ditolak', name: string) => {
    const msg = kind === 'baru' ? `📩 ${name} mengirim penawaran tukar. Buka Sosial → Tukar.` : kind === 'diterima' ? `✅ ${name} menerima penawaran Anda! Buka Tukar untuk mengambil barang.` : `↩️ ${name} menolak penawaran. Barang kembali saat Anda membuka Tukar.`;
    if (kind === 'baru') tradeIn++;
    toast(msg, 4500); chat.system(msg);
  };
  if (backend.mode === 'lokal') (backend as LocalBackend).onTrade = onTrade;
  const social = createSocialUI({
    openTrade: () => trade.open('masuk'),
    backend, angler: fishing.angler, player: () => fishing.player, setPlayer: (pl) => fishing.setPlayer(pl),
    canEdit: () => fishing.canStand, showcase: (on) => { rig.showcase = on; }, confetti,
    aquarium3d: IS_DANAU ? (on, fish) => { world.aquarium.setFish(fish); world.aqWatch = on; rig.aqView = on ? world.aquarium.view : null; } : undefined,
  });
  $('hubBtn').onclick = () => social.openHub();
  const prog = createProgressUI({ backend, player: () => fishing.player, setPlayer: (pl) => fishing.setPlayer(pl), confetti,
    openCharacter: () => social.openCharacter(), openAlbum: () => openBoard('album') });
  progRef = prog;
  $('missionBtn').onclick = () => prog.openMissions();
  // ---------- HUD Danau Serene ----------
  const hud = createHud({
    openMissions: () => prog.openMissions(), openBag: () => openBag(), openBait: (t) => openBait(t ?? 'umpan'), openChat: () => chat.show(),
    equipBait: async (b) => {
      if (!canChangeGear()) return;
      try { const r = await backend.equip({ bait: b }); fishing.setPlayer(r.player); toast('Umpan: ' + BAITS[b].name); sfx.click(); } catch (e) { toast((e as Error).message); }
    },
  });
  hudRef = hud;
  chat.onNew = (m) => hud.chat(m); hud.chat(chat.msgs[chat.msgs.length - 1]);
  $('coinPill').onclick = () => social.openCoins();
  $('gemPill').onclick = () => { toast('💎 Permata didapat dari Quest Harian (+2, bonus +5), hadiah hari ke-7 (+10), dan lencana (+5).', 4200); prog.openMissions(); };
  $('bagBtn').onclick = () => openBag();
  $('menuBtn').onclick = () => openMenu();
  $('subBtn').onclick = () => {
    if (hud.sub === 'walk') standUp();
    else if (hud.sub === 'reel' && (fishing.mode === 'waiting' || fishing.mode === 'settling')) { fishing.retrieve('Kail diangkat.'); sfx.click(); }
  };
  /** Menu: semua fitur lain dalam satu kisi (peta, misi, sosial, obrolan, peringkat, karakter, kamera, suara, lokasi, pengaturan). */
  function openMenu() {
    const items: [string, string, string, () => void, number?][] = [
      ['🗺️', 'Peta', 'Spot & jalan', () => openMap()],
      ['📋', 'Misi & lencana', 'Hadiah harian', () => prog.openMissions(), Number($('missionBadge').textContent) || 0],
      ['🎪', 'Sosial', 'Turnamen, klub, pasar', () => social.openHub()],
      ['🔁', 'Tukar', 'Umpan, joran, koin', () => trade.open('masuk'), tradeIn],
      ['💬', 'Obrolan', 'Dunia & klub', () => chat.show(), chat.unread],
      ['🏆', 'Peringkat', '& album ikan', () => openBoard()],
      ['👕', 'Karakter', 'Baju, topi, ransel', () => social.openCharacter()],
      ['🧍', 'Berdiri & jalan', 'Jelajah danau', () => { closeSheet(); standUp(); }],
      ['👋', 'Sapa', 'Pemain terdekat', () => { closeSheet(); wave(); }],
      ['🎥', 'Kamera', 'Posisi & sorot', () => openCamera()],
      ['🌏', 'Lokasi', 'Danau, sungai, laut', () => openLocations()],
      [settings.sound ? '🔊' : '🔇', 'Suara', settings.sound ? 'Nyala' : 'Mati', () => { $('soundBtn').click(); openMenu(); }],
      ['⚙️', 'Pengaturan', 'Grafis, kontrol', () => openSettings()],
      ['🏠', 'Menu utama', 'Keluar dari danau', () => { closeSheet(); $('homeBtn').click(); }],
    ];
    openSheet('Menu', `<div class="mGrid">${items.map(([i, t, d, , n], k) => `<button data-mi="${k}"><span>${i}</span>${esc(t)}<small>${esc(d)}</small>${n ? `<i class="badge">${n}</i>` : ''}</button>`).join('')}</div>`, b => {
      b.querySelectorAll<HTMLElement>('[data-mi]').forEach(x => x.onclick = () => items[Number(x.dataset.mi)][3]());
    });
  }
  /** Tas: keranjang ikan, umpan, joran, senar, dan kotak perlengkapan. */
  function openBag() {
    const p = fishing.player; if (!p) return;
    const baitN = Object.values(p.bait).reduce((a, n) => a + (n ?? 0), 0);
    openSheet('🎒 Tas', `<div class="mGrid">
      <button data-bg="ikan"><span>🧺</span>Keranjang ikan<small>${p.basket.length}/${basketCap(p)} ekor</small></button>
      <button data-bg="umpan"><span>🪱</span>Umpan<small>${baitN} buah · ${esc(BAITS[p.curBait].name.split(' ')[0])}</small></button>
      <button data-bg="joran"><span>🎣</span>Joran<small>${esc(RODS[p.curRod].name)}</small></button>
      <button data-bg="senar"><span>🧵</span>Senar<small>${esc(LINES[p.curLine].name)}</small></button>
      <button data-bg="akuarium"><span>🐠</span>Akuarium<small>${(p.aquarium ?? []).length} ikan dipajang</small></button>
      <button data-bg="album"><span>📖</span>Album<small>${Object.keys(p.album ?? {}).length} jenis</small></button>
    </div>`, b => {
      b.querySelectorAll<HTMLElement>('[data-bg]').forEach(x => x.onclick = () => {
        const k = x.dataset.bg!;
        if (k === 'ikan') openBasket(); else if (k === 'akuarium') social.openAquarium(); else if (k === 'album') openBoard('album'); else openBait(k as 'umpan');
      });
    });
  }
  const events = createEvents(backend);
  setEventHook(list => { const t = Date.now() / 1000; events.set(list.find(e => e.startsAt <= t && e.endsAt >= t) ?? null); });
  document.querySelector<HTMLElement>('#hud .me')?.addEventListener('click', () => prog.openProfile());
  fishing.onPose = (pose) => { poseNow = pose; };

  // ---------- menu utama ----------
  const pickSpot = (id: string) => { store.set('spot', id); document.querySelectorAll('#spotPick button').forEach(b => b.classList.toggle('on', (b as HTMLElement).dataset.id === id)); };
  async function renderSpots(sel: string) {
    let act: Record<string, string> = {};
    try { const w = await backend.world(); act = Object.fromEntries(w.spots.map(s => [s.id, s.activity])); activity = act; } catch { /* luring */ }
    $('spotPick').innerHTML = SPOT_PLACES.map(s => `<button data-id="${s.id}" class="${s.id === sel ? 'on' : ''}"><b>${s.id}</b><small>${esc(s.label.replace(/ [A-Z]\d$/, ''))}</small><small class="act-${act[s.id] ?? 'sedang'}">● ${act[s.id] ?? '—'}</small></button>`).join('');
    document.querySelectorAll<HTMLElement>('#spotPick button').forEach(b => b.onclick = () => { pickSpot(b.dataset.id!); sfx.click(); });
  }
  ($('nameIn') as HTMLInputElement).value = store.get<string>('name', '');
  $('modeTxt').textContent = backend.mode === 'lokal' ? 'Mode lokal: aturan server berjalan di perangkat ini. Data tersimpan di perangkat.' : 'Tersambung ke server: ' + serverUrl;
  await renderSpots(startSpot);
  // ---------- akun (mode server) ----------
  function renderAcct() {
    const box = $('acctBox');
    if (!remoteBe) { box.innerHTML = '<span>Akun (daftar/masuk/PIN) tersedia saat tersambung ke server.</span>'; return; }
    const be = remoteBe;
    const who = be.username ? `Masuk sebagai <b>${esc(be.username)}</b>` : be.token ? 'Main sebagai tamu' : 'Belum masuk';
    box.innerHTML = `<span>${who}</span>` + (be.username ? '<button id="acAcc">Akun</button>' :
      `${be.device && !be.token ? '<button id="acPin">🔢 PIN</button>' : ''}<button id="acIn">Masuk</button><button id="acUp">Daftar</button>${be.token ? '<button id="acAcc">Akun</button>' : ''}`);
    const done = (pl: Player | null) => { if (pl) { fishing.setPlayer(pl); ($('nameIn') as HTMLInputElement).value = pl.name; store.set('name', pl.name); } renderAcct(); };
    box.querySelector<HTMLElement>('#acIn')?.addEventListener('click', () => openSignIn(be, done));
    box.querySelector<HTMLElement>('#acUp')?.addEventListener('click', () => openSignUp(be, done));
    box.querySelector<HTMLElement>('#acPin')?.addEventListener('click', () => openPin(be, done));
    box.querySelector<HTMLElement>('#acAcc')?.addEventListener('click', () => openAccount(be, () => renderAcct()));
  }
  renderAcct();
  // perangkat pernah masuk tapi sesi habis: tawarkan PIN langsung
  if (remoteBe && remoteBe.device && !remoteBe.token && !qs.has('auto')) { const be = remoteBe; setTimeout(() => openPin(be, (pl) => { if (pl) fishing.setPlayer(pl); renderAcct(); }), 300); }
  $('loading').hidden = true; $('menu').hidden = false;

  function connectNet() {
    net?.close(); net = null;
    if (backend.mode !== 'server' || !backend.token || (hybrid && !hybrid.online)) return;
    net = new Net(serverUrl, backend.token);
    net.onPlayers = (list) => { crowd.sync(list, net!.you); netPlayers = list.filter(p => p.id !== net!.you).map(p => ({ id: p.id, name: p.name, lv: p.lv })); };
    net.onTrade = (m) => onTrade(m.kind, m.name);
    net.onCatch = (m) => { toast(`${m.name} dapat ${m.species} ${fmtKg(m.weight)}!`); chat.system(`${m.name} dapat ${m.species} ${fmtKg(m.weight)}!`); };
    net.onChat = (m) => chat.push({ id: m.id, name: m.name, text: m.text, at: m.at, me: m.id === net?.you, ch: m.ch ?? 'global' });
    net.onEmote = (m) => crowd.say(m.id, m.e === 'sapa' ? '👋 Halo!' : m.e);
    net.onError = (msg) => toast(msg);
    net.connect(fishing.spot.id);
  }

  // ---------- luring / daring otomatis ----------
  if (hybrid) {
    const pill = document.createElement('div'); pill.id = 'netPill'; pill.hidden = true; document.body.appendChild(pill);
    hybrid.onStatus = (st) => {
      if (st.player) fishing.setPlayer(st.player);
      pill.hidden = st.online;
      pill.textContent = st.pending ? `Luring · ${st.pending} ikan menunggu dikirim` : 'Luring · menunggu jaringan';
      if (st.online) {
        connectNet();
        const sy = st.synced;
        toast(sy && sy.accepted.length ? `Tersambung lagi. ${sy.accepted.length} ikan luring tersimpan (+${sy.xp} XP${sy.coins ? `, +${sy.coins} koin` : ''}).` : 'Tersambung lagi ke server.', 4500);
        if (sy && sy.rejected) chat.system(`${sy.rejected} tangkapan luring tidak diterima server.`);
      } else if (!st.pending && st.player) {
        net?.close(); net = null; crowd.sync([]);
        toast('Jaringan terputus — kamu tetap bisa memancing (mode luring).', 4500);
      }
    };
  }

  async function startGame() {
    initAudio();
    const name = (($('nameIn') as HTMLInputElement).value.trim() || 'Pemancing').slice(0, 18);
    store.set('name', name);
    $('startBtn').textContent = 'Menyiapkan…';
    try { fishing.setPlayer(await backend.login(name)); }
    catch (e) { toast((e as Error).message); $('startBtn').textContent = 'Mulai memancing'; return; }
    $('startBtn').textContent = 'Mulai memancing';
    fishing.setSpot(store.get<string>('spot', 'A1'));
    $('menu').hidden = true; $('hud').hidden = false; keepAwake(true);
    $('spotTxt').textContent = fishing.spot.label;
    prog.refresh().then(r => { if (r?.dailyReady) setTimeout(() => { if (!sheetOpen()) prog.openDaily(); else toast('🎁 Hadiah harian siap — ketuk 📋 di atas.', 4500); }, 1400); });
    backend.claimTournaments().then(r => { if (r.rewards.length) { fishing.setPlayer(r.player); confetti(); toast('Hadiah turnamen: ' + r.rewards.map(x => '+' + x.coins).join(', ') + ' koin!', 5000); } }).catch(() => {});
    // pembelian koin yang sudah dibayar tapi belum ditukar (aplikasi tertutup / jaringan putus) → pulihkan
    if (backend.mode === 'server') setTimeout(() => void recoverPurchases(async (id, tok) => { const r = await backend.redeemCoins(id, tok); fishing.setPlayer(r.player); return r; })
      .then(n => { if (n > 0) { confetti(); toast(`Pembelian sebelumnya dipulihkan: +${n.toLocaleString('id-ID')} koin`, 5000); } }), 2500);
    chat.sender = backend.mode === 'server' ? (text, ch) => net?.send({ t: 'chat', text, ch }) : null;
    chat.club = () => { const id = fishing.player?.club; if (!id) return null; return clubName ?? 'Klub'; };
    backend.clubs().then(c => { clubName = c.mine ? c.mine.name : null; }).catch(() => {});
    backend.world().then(w => {
      if (w.motd) { toast('📢 ' + w.motd, 6000); chat.system('📢 ' + w.motd); }
      events.set(w.event);
      if (w.event) chat.system(`${w.event.icon} Acara berjalan: ${w.event.name} — ${w.event.desc}`);
      if (w.backdropAt) backend.backdrop('depan').then(u => world.setBackdrop(u, 'depan')).catch(() => {});
      if (w.backdropBackAt) backend.backdrop('belakang').then(u => world.setBackdrop(u, 'belakang')).catch(() => {});
      if (w.bedAt) backend.backdrop('dasar').then(u => world.setBackdrop(u, 'dasar')).catch(() => {});
      world.setWaterClarity(w.waterClarity ?? 'jernih');
      if (w.hideFarTrees) world.setFarTrees(false);
    }).catch(() => {});
    connectNet();
    // mulai di halaman darat (pintu masuk) lalu berjalan ke spot, seperti prototipe lama
    if (IS_SERENE) { rig.snap(fishing); toast('🏔️ Selamat datang di Danau Serene! Tahan tombol untuk melempar.', 4200); }
    else if (!IS_DANAU) { rig.snap(fishing); openLocWelcome(); }
    else if (!qs.has('auto') && store.get('entrance', true)) {
      walker.placeAt(ENTRY.x, ENTRY.z, ENTRY.yaw); setWalking(true); rig.snap(fishing);
      openWelcome();
    } else rig.snap(fishing);
  }

  // ---------- berjalan ----------
  function setWalking(on: boolean) {
    document.body.classList.toggle('walking', on);
    $('walkUi').hidden = !on; $('autoBar').hidden = !walker.auto;
    if (on) updatePace();
  }
  function updatePace() { const P = PACES[walker.pace]; $('paceBtn').textContent = P.icon + ' ' + P.name; }
  function standUp() {
    if (!fishing.canStand) { toast('Angkat kail dulu (selesaikan lemparan atau adu tarik).'); return false; }
    if (fishing.mode !== 'walk') { walker.start(); setWalking(true); coach.ctx.walked = true; sfx.click(); }
    return true;
  }
  function fishHere(seated: boolean) {
    if (fishing.mode !== 'walk') { if (!standUp()) return; }
    const fp = walker.fishingPose(rig.yaw);   // arah yang dituju kamera = arah lemparan
    if (!fp.ok) {
      // terlalu jauh dari air: jalan otomatis ke tepi terdekat, lalu langsung memancing
      const t = nearestFishable(walker.x, walker.z);
      if (t && walker.walkTo(t.x, t.z, 'tepi air terdekat', { then: seated ? 'sit' : 'fish', yaw: t.yaw })) {
        $('autoTxt').textContent = 'Menuju tepi air terdekat…'; $('autoBar').hidden = false; toast('Berjalan ke tepi air terdekat…');
      } else toast('Tidak ada tepi air yang bisa dicapai dari sini.');
      return;
    }
    const prevRoom = fishing.spot.id;
    walker.stop(); setWalking(false); $('fishHereBtn').classList.remove('glow');
    fishing.setHere(fp.x, fp.z, fp.yaw, seated);
    store.set('spot', fishing.spot.id); $('spotTxt').textContent = fishing.spot.label;
    world.veg.setFocus({ x: fp.x, z: fp.z });
    if (fishing.spot.id !== prevRoom) connectNet();
    toast(seated ? 'Duduk di kotak pancing. Selamat memancing!' : 'Siap memancing di ' + fishing.spot.label + '.'); sfx.click();
  }
  function goTo(x: number, z: number, label: string, extra: { spotId?: string; then?: 'warung' | 'fish' | 'sit' } = {}) {
    if (!standUp()) return;
    closeSheet();
    const t = nearestWalkable(x, z);
    if (!t || !walker.walkTo(t.x, t.z, label, extra)) { toast('Tidak ada jalan ke sana.'); return; }
    $('autoTxt').textContent = 'Menuju ' + label + '…'; $('autoBar').hidden = false;
  }
  walker.onArrive = (t) => {
    $('autoBar').hidden = true;
    if (t.then === 'warung') { openWarung(); return; }
    if (t.then === 'fish' || t.then === 'sit') { fishHere(t.then === 'sit'); return; }
    toast('Tiba di ' + t.label + '.' + (t.spotId ? ' Ketuk "Mancing di sini".' : ''));
    if (t.spotId) $('fishHereBtn').classList.add('glow');
  };
  walker.onBlocked = () => { $('autoBar').hidden = true; toast('Jalan terhalang. Gunakan joystick.'); };
  $('autoStop').onclick = () => { walker.cancelAuto(); $('autoBar').hidden = true; };
  $('standBtn').onclick = () => standUp();
  $('paceBtn').onclick = () => { walker.cyclePace(); updatePace(); sfx.click(); };
  $('fishHereBtn').onclick = () => fishHere(false);
  $('sitHereBtn').onclick = () => fishHere(true);
  $('minimap').onclick = () => openMap();
  let ctxAct: (() => void) | null = null;
  $('ctxBtn').onclick = () => ctxAct?.();
  // joystick virtual
  const joy = $('joy'), knob = $('joyKnob'); let joyId = -1;
  const joyMove = (e: PointerEvent) => {
    const r = joy.getBoundingClientRect(), R = r.width * 0.38;
    let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    walker.input.x = dx / R; walker.input.y = -dy / R;
  };
  joy.addEventListener('pointerdown', e => {
    e.preventDefault();
    // joystick selalu tampil (seperti gambar konsep): menyentuhnya saat memancing = berdiri & mulai berjalan
    if (fishing.mode !== 'walk') { if (!fishing.canStand) { toast('Angkat kail dulu untuk berjalan.'); return; } if (!standUp()) return; }
    joyId = e.pointerId; try { joy.setPointerCapture(e.pointerId); } catch { /* */ } joyMove(e); bump(); $('autoBar').hidden = true; });
  joy.addEventListener('pointermove', e => { if (e.pointerId === joyId) { joyMove(e); bump(); } });
  const joyEnd = (e: PointerEvent) => { if (e.pointerId !== joyId) return; joyId = -1; knob.style.transform = ''; walker.input.x = walker.input.y = 0; };
  joy.addEventListener('pointerup', joyEnd); joy.addEventListener('pointercancel', joyEnd);
  // papan ketik (komputer): WASD / panah, R = ganti kecepatan
  const keys = new Set<string>();
  addEventListener('keydown', e => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; keys.add(e.code); if (e.code === 'KeyR' && fishing.mode === 'walk') { walker.cyclePace(); updatePace(); } });
  addEventListener('keyup', e => keys.delete(e.code));
  addEventListener('blur', () => keys.clear());

  // ---------- sapa & kartu pemain ----------
  let myBub: THREE.Sprite | null = null, myBubT = 0, lastWave = 0;
  function wave() {
    const now = performance.now(); if (now - lastWave < 1500) return; lastWave = now;
    if (myBub) fishing.angler.root.remove(myBub);
    myBub = bubble('👋 Halo!'); fishing.angler.root.add(myBub); myBubT = 3; sfx.click();
    net?.send({ t: 'emote', e: 'sapa' });
    if (backend.mode === 'lokal') {
      const me = fishing.angler.root.position;
      const near = crowd.list().filter(p => Math.hypot(p.x - me.x, p.z - me.z) < 30).sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[0];
      if (near) setTimeout(() => crowd.say(near.id, ['👋 Halo juga!', 'Mancing, Bos?', 'Salam strike!'][Math.floor(Math.random() * 3)]), 1200);
    }
  }
  $('waveBtn').onclick = wave;
  function openPlayerCard(p: { id: string; name: string; lv: number; pose: string }) {
    const st: Record<string, string> = { idle: 'Sedang bersiap', cast: 'Sedang melempar', wait: 'Menunggu ikan', fight: 'Sedang adu tarik!', walk: 'Sedang berjalan' };
    openSheet('Pemancing', `<div class="pcard"><div class="av">🎣</div><h2>${esc(p.name)}</h2><p style="color:var(--dim);margin:0">Level ${p.lv} · ${st[p.pose] ?? ''}</p>
      <div class="row" style="margin-top:12px"><button class="btn gold" id="pcWave">👋 Sapa</button><button class="btn ghost" id="pcClose">Tutup</button></div></div>`, body => {
      body.querySelector<HTMLElement>('#pcWave')!.onclick = () => { wave(); closeSheet(); };
      body.querySelector<HTMLElement>('#pcClose')!.onclick = closeSheet;
    });
  }

  // ---------- lembar selamat datang ----------
  function openWelcome() {
    const last = SPOT_PLACES.find(s => s.id === store.get<string>('spot', 'A1')) ?? SPOT_PLACES[0];
    openSheet('Selamat datang di Danau Keramba', `<p style="color:var(--dim);margin:4px 0 10px">Anda berada di halaman depan. Berjalanlah ke dermaga, titian, atau keramba untuk memancing.</p>
      <div class="list">
        <button class="btn gold big" id="wLast">🚶 Jalan ke ${esc(last.label)}</button>
        <button class="btn" id="wMap">🗺️ Pilih spot di peta</button>
        <button class="btn" id="wWarung">🏪 Mampir ke Warung Pancing</button>
        <button class="btn ghost" id="wFree">Jelajah sendiri</button>
      </div>`, body => {
      body.querySelector<HTMLElement>('#wLast')!.onclick = () => goTo(last.pos.x, last.pos.z, last.label, { spotId: last.id });
      body.querySelector<HTMLElement>('#wMap')!.onclick = () => openMap();
      body.querySelector<HTMLElement>('#wWarung')!.onclick = () => SHOP ? goTo(SHOP.x, SHOP.z, 'Warung Pancing', { then: 'warung' }) : openWarung();
      body.querySelector<HTMLElement>('#wFree')!.onclick = () => { closeSheet(); toast('Gerakkan joystick kiri untuk berjalan.'); };
    });
  }

  // ---------- Warung Pancing ----------
  function openWarung() {
    openSheet('🏪 Warung Pancing', `<p style="color:var(--dim);margin:2px 0 8px">${SHOP?.name ?? 'Penjaga warung'}: "Mau cari apa hari ini?"</p>
      <div class="list">
        <div class="item"><span class="icn">🎒</span><div><b>Perlengkapan saya</b><small>Pilih umpan, joran, dan senar yang dipakai</small></div><button class="btn" data-w="umpan">Buka</button></div>
        <div class="item"><span class="icn">🦐</span><div><b>Beli umpan</b><small>6 jenis, termasuk Racik Serba Ikan</small></div><button class="btn gold" data-w="umpan">Beli</button></div>
        <div class="item"><span class="icn">🎣</span><div><b>Beli joran</b><small>Dari joran pemula sampai Predator</small></div><button class="btn gold" data-w="joran">Beli</button></div>
        <div class="item"><span class="icn">〰️</span><div><b>Beli senar</b><small>Senar lebih kuat untuk ikan besar</small></div><button class="btn gold" data-w="senar">Beli</button></div>
        <div class="item"><span class="icn">🧺</span><div><b>Keranjang besar</b><small>${fishing.player.bigBasket ? 'Sudah dimiliki · muat 20 ikan' : 'Muat 20 ikan, bukan 10 · 500 koin'}</small></div><button class="btn ${fishing.player.bigBasket ? '' : 'gold'}" data-w="alat">${fishing.player.bigBasket ? 'Lihat' : 'Beli'}</button></div>
        <div class="item"><span class="icn">💰</span><div><b>Jual ikan</b><small>${fishing.player.basket.length} ikan di keranjang</small></div><button class="btn" data-w="jual">Jual</button></div>
        <div class="item"><span class="icn">🤝</span><div><b>Pasar pemain</b><small>Jual beli joran & senar antarpemancing</small></div><button class="btn" data-w="pasar">Buka</button></div>
        <div class="item"><span class="icn">👕</span><div><b>Ganti baju</b><small>Topi, baju, celana, kacamata</small></div><button class="btn" data-w="baju">Buka</button></div>
        <div class="item"><span class="icn">🐠</span><div><b>Akuarium</b><small>Pajang ikan terbaik Anda</small></div><button class="btn" data-w="akuarium">Buka</button></div>
        <div class="item"><span class="icn">🪙</span><div><b>Beli koin</b><small>Paket koin dengan bonus</small></div><button class="btn gold" data-w="koin">Lihat</button></div>
      </div>`, body => {
      body.querySelectorAll<HTMLElement>('[data-w]').forEach(b => b.onclick = () => { const w = b.dataset.w!; if (w === 'jual') openBasket(); else if (w === 'pasar') social.openMarket(); else if (w === 'baju') social.openCharacter(); else if (w === 'akuarium') social.openAquarium(); else if (w === 'koin') social.openCoins(); else openBait(w as 'umpan'); });
    });
  }
  $('warungBtn').onclick = () => openWarung();
  $('chatBtn').onclick = () => chat.show();
  /** Panel kamera: posisi, kamera adu tarik, sorot, ketinggian, perbesar, kembali ke sudut awal. */
  function openCamera() {
    const seg = (name: string, opts: [string, string][], cur: string) => `<div class="seg">${opts.map(([v, t]) => `<button data-cs="${name}" data-v="${v}" class="${v === cur ? 'on' : ''}">${t}</button>`).join('')}</div>`;
    openSheet('🎥 Kamera', `<p style="margin:4px 0;font-weight:800">Posisi kamera</p>
      <div class="camGrid">${CAM_MODES.map(m => `<button data-cm="${m.id}" class="${m.id === rig.mode ? 'on' : ''}"><span>${m.icon}</span>${m.name}</button>`).join('')}</div>
      <div class="set"><span>Kamera sorot<small>Ikuti umpan saat dilempar & sorot pelampung</small></span>${seg('sorot', [['1', 'Hidup'], ['0', 'Mati']], rig.sorot ? '1' : '0')}</div>
      <div class="set"><span>Saat adu tarik</span>${seg('fight', [['dekat', 'Dekat'], ['joran', 'Tampak joran']], rig.fightCam)}</div>
      <div class="set"><span>Ketinggian</span>${seg('h', [['-0.4', 'Rendah'], ['0', 'Normal'], ['0.8', 'Tinggi'], ['2', 'Atas']], String(rig.height))}</div>
      <div class="set"><span>Jarak</span><div class="seg"><button id="zIn">＋ Dekat</button><button id="zOut">－ Jauh</button></div></div>
      <button class="btn ghost" id="camReset" style="width:100%;margin-top:8px">↺ Kembali ke sudut pandang awal</button>`, b => {
      b.querySelectorAll<HTMLElement>('[data-cm]').forEach(x => x.onclick = () => { rig.mode = x.dataset.cm as CamMode; store.set('camMode', rig.mode); b.querySelectorAll('[data-cm]').forEach(y => y.classList.toggle('on', y === x)); bump(); });
      b.querySelectorAll<HTMLElement>('[data-cs]').forEach(x => x.onclick = () => {
        const k = x.dataset.cs!, v = x.dataset.v!;
        if (k === 'sorot') { rig.sorot = v === '1'; store.set('camSorot', rig.sorot); }
        if (k === 'fight') { rig.fightCam = v as 'dekat'; store.set('fightCam', v); }
        if (k === 'h') { rig.height = Number(v); store.set('camH', rig.height); }
        b.querySelectorAll(`[data-cs="${k}"]`).forEach(y => y.classList.toggle('on', y === x)); bump();
      });
      b.querySelector<HTMLElement>('#zIn')!.onclick = () => { rig.zoom = THREE.MathUtils.clamp(rig.zoom * 0.85, 0.55, 1.8); bump(); };
      b.querySelector<HTMLElement>('#zOut')!.onclick = () => { rig.zoom = THREE.MathUtils.clamp(rig.zoom * 1.15, 0.55, 1.8); bump(); };
      b.querySelector<HTMLElement>('#camReset')!.onclick = () => { rig.mode = 'bahu'; rig.zoom = 1; rig.height = 0; rig.sorot = true; store.set('camMode', 'bahu'); store.set('camH', 0); store.set('camSorot', true); openCamera(); toast('Kamera kembali ke sudut awal.'); };
    });
  }
  $('camBtn').onclick = () => openCamera();
  $('mapBtn').onclick = () => openMap();

  // ---------- peta danau besar ----------
  let mapTimer = 0;
  function mapDyn(pin: { x: number; z: number } | null): MapDyn {
    const r = fishing.angler.root;
    return { me: { x: r.position.x, z: r.position.z, yaw: r.rotation.y }, others: crowd.list().map(p => ({ x: p.x, z: p.z, name: p.name })), activity, route: walker.path, pin };
  }
  function openMap() {
    let pin: { x: number; z: number } | null = null;
    const html = `<div class="legend"><span><i style="background:#fff;border:2px solid #e0463a"></i>Anda</span><span><i style="background:#7ec8ff"></i>Pemain lain</span><span><i style="background:#ff9a3c"></i>Ramai</span><span><i style="background:#ffd873"></i>Sedang</span><span><i style="background:#8a96a4"></i>Sepi</span></div>
      <div class="mapWrap"><canvas id="bigMap"></canvas><div class="mapZoom"><button id="mzIn">+</button><button id="mzOut">−</button><button id="mzMe" style="font-size:14px">◎</button></div></div>
      <div class="mapGo"><span id="mapPinTxt">Ketuk peta untuk memilih tujuan.</span><button class="btn gold" id="mapGo" disabled>Jalan ke sini</button></div>
      <div class="list" style="margin-top:10px">${SPOT_PLACES.map(sp => `<div class="item"><span class="icn">📍</span><div><b>${esc(sp.label)}</b><small class="act-${activity[sp.id] ?? 'sedang'}">Aktivitas: ${activity[sp.id] ?? '—'}</small></div><div style="display:grid;gap:4px"><button class="btn gold" data-walk="${sp.id}">Jalan</button><button class="btn" data-tp="${sp.id}">Langsung</button></div></div>`).join('')}
        <div class="item"><span class="icn">🏪</span><div><b>Warung Pancing</b><small>Umpan, joran, senar, jual ikan</small></div><button class="btn" id="mapWarung">${SHOP ? 'Jalan' : 'Buka'}</button></div>
        <div class="item"><span class="icn">🌏</span><div><b>Ganti lokasi</b><small>Sungai, pantai, dan laut</small></div><button class="btn" id="mapLoc">Lihat</button></div>
      </div>`;
    openSheet('🗺️ Peta Danau Keramba', html, body => {
      const cv = body.querySelector('#bigMap') as HTMLCanvasElement, wrap = cv.parentElement!;
      const W = wrap.clientWidth, H = Math.round(Math.min(innerHeight * 0.5, W * 0.78)), dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
      const { x0, x1, z0, z1 } = MAP_BOUNDS, fit = Math.min(W / (x1 - x0), H / (z1 - z0));
      const v: View = { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, scale: fit, w: W, h: H };
      const g = cv.getContext('2d')!;
      const draw = () => { g.setTransform(dpr, 0, 0, dpr, 0, 0); drawMap(g, v, mapDyn(pin), { labels: true }); };
      const zoom = (k: number) => { v.scale = Math.max(fit, Math.min(9, v.scale * k)); draw(); };
      body.querySelector<HTMLElement>('#mzIn')!.onclick = () => zoom(1.5);
      body.querySelector<HTMLElement>('#mzOut')!.onclick = () => zoom(1 / 1.5);
      body.querySelector<HTMLElement>('#mzMe')!.onclick = () => { const r = fishing.angler.root.position; v.cx = r.x; v.cz = r.z; v.scale = Math.max(v.scale, 3); draw(); };
      // geser = pindah pandangan, ketuk = pilih tujuan
      let down: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
      cv.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, cx: v.cx, cz: v.cz, moved: false }; try { cv.setPointerCapture(e.pointerId); } catch { /* */ } });
      cv.addEventListener('pointermove', e => { if (!down) return; const dx = e.clientX - down.x, dy = e.clientY - down.y; if (Math.hypot(dx, dy) > 6) down.moved = true; if (down.moved) { v.cx = down.cx - dx / v.scale; v.cz = down.cz - dy / v.scale; draw(); } });
      cv.addEventListener('pointerup', e => {
        const d = down; down = null; if (!d || d.moved) return;
        const r = cv.getBoundingClientRect(), w = toWorld(v, e.clientX - r.left, e.clientY - r.top);
        const t = nearestWalkable(w.x, w.z, 10);
        const go = body.querySelector('#mapGo') as HTMLButtonElement, txt = body.querySelector('#mapPinTxt')!;
        if (!t) { pin = null; go.disabled = true; txt.textContent = 'Tidak bisa dipijak. Pilih dermaga, titian, keramba, atau tepi danau.'; draw(); return; }
        pin = t; const me = fishing.angler.root.position;
        const kind: Record<string, string> = { dermaga: 'Dermaga', titian: 'Titian apung', keramba: 'Papan keramba', darat: 'Tepi danau', papan: 'Tepi rumput' };
        txt.textContent = `${kind[walkInfo(t.x, t.z)?.s ?? 'darat']} · ±${Math.round(Math.hypot(t.x - me.x, t.z - me.z))} m`;
        go.disabled = false; draw();
      });
      cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.2 : 1 / 1.2); }, { passive: false });
      body.querySelector<HTMLElement>('#mapGo')!.onclick = () => { if (pin) goTo(pin.x, pin.z, 'titik pilihan'); };
      body.querySelectorAll<HTMLElement>('[data-walk]').forEach(b => b.onclick = () => { const sp = SPOT_PLACES.find(s => s.id === b.dataset.walk)!; goTo(sp.pos.x, sp.pos.z, sp.label, { spotId: sp.id }); });
      body.querySelectorAll<HTMLElement>('[data-tp]').forEach(b => b.onclick = () => teleport(b.dataset.tp!));
      body.querySelector<HTMLElement>('#mapWarung')!.onclick = () => SHOP ? goTo(SHOP.x, SHOP.z, 'Warung Pancing', { then: 'warung' }) : openWarung();
      body.querySelector<HTMLElement>('#mapLoc')!.onclick = () => openLocations();
      draw();
      clearInterval(mapTimer); mapTimer = window.setInterval(draw, 500);
    }, () => clearInterval(mapTimer));
  }
  function teleport(id: string) {
    if (!fishing.canStand) { toast('Angkat kail dulu sebelum pindah.'); return; }
    closeSheet(); walker.stop(); setWalking(false); store.set('spot', id);
    fishing.setSpot(id); rig.snap(fishing); $('spotTxt').textContent = fishing.spot.label;
    connectNet(); toast('Tiba di ' + fishing.spot.label + '.');
  }
  /** Pilih lokasi: semua peta terbuka sejak Lv 1; saran level hanya petunjuk tingkat kesulitan. */
  function openLocations() {
    const lv = fishing.player ? levelInfo(fishing.player.xp).lv : 1;
    openSheet('🌏 Pilih lokasi memancing', '<div class="list">' + LOCATIONS.map(l => {
      const here = l.id === LOC, rec = l.recLv ?? 1, hard = lv < rec;
      return `<div class="item ${here ? 'on' : ''}"><span class="icn">${l.icon}</span><div><b>${esc(l.name)}</b><small>${esc(l.desc)}</small><small>${rec > 1 ? (hard ? '⚠️ Saran level ' + rec + '+ (ikan lebih besar & kuat)' : '✅ Saran level ' + rec + '+') : 'Cocok untuk pemula'}</small></div>${here ? '<small>Di sini</small>' : `<button class="btn gold" data-go="${l.id}">Pergi</button>`}</div>`;
    }).join('') + `</div><p style="color:var(--dim);font-size:11px">Semua lokasi terbuka untuk semua level. Saran level hanya petunjuk: di lokasi sulit, pakai joran & senar yang lebih kuat supaya ikan besar tidak lepas.</p>`, body => {
      body.querySelectorAll<HTMLElement>('[data-go]').forEach(b => b.onclick = () => {
        const L = LOCATIONS.find(x => x.id === b.dataset.go)!;
        if (!fishing.canStand) { toast('Selesaikan lemparan dulu.'); return; }
        store.set('loc', L.id); store.set('spot', L.start);
        $('loading').hidden = false; $('loadTxt').textContent = 'Berangkat ke ' + L.name + '…';
        const u = new URL(location.href); u.searchParams.set('loc', L.id); u.searchParams.delete('auto');
        setTimeout(() => { try { history.replaceState(null, '', u.toString()); } catch { /* */ } location.reload(); }, 150);
      });
    });
  }
  /** Sambutan di lokasi selain danau: pilih spot langsung. */
  function openLocWelcome() {
    const L = LOCATIONS.find(x => x.id === LOC)!;
    openSheet(L.icon + ' ' + L.name, `<p style="color:var(--dim);margin:2px 0 10px">${esc(L.desc)}</p><div class="list">` +
      SPOT_PLACES.map(sp => `<div class="item"><span class="icn">📍</span><div><b>${esc(sp.label)}</b><small class="act-${activity[sp.id] ?? 'sedang'}">Aktivitas: ${activity[sp.id] ?? '—'}</small></div><button class="btn gold" data-sp="${sp.id}">Mancing</button></div>`).join('') +
      `</div><div class="row" style="margin-top:10px"><button class="btn" id="lwWalk">🚶 Jelajah</button><button class="btn ghost" id="lwLoc">🌏 Lokasi lain</button></div>
      <p style="color:var(--dim);font-size:11px;margin-top:8px">${MAPSTYLE ? esc(MAPSTYLE.tip) : LOC === 'laut' ? 'Tip: tuna & marlin sangat kuat. Pakai Joran Laut Dalam, senar PE12/PE20, dan umpan cumi dari Warung.' : LOC === 'pantai' ? 'Tip: umpan cumi atau ikan kecil untuk kakap & kerapu. Joran Pantai Surf melempar lebih jauh.' : 'Tip: arus deras. Belida & semah suka umpan ikan kecil.'}</p>`, body => {
      body.querySelectorAll<HTMLElement>('[data-sp]').forEach(b => b.onclick = () => { teleport(b.dataset.sp!); });
      body.querySelector<HTMLElement>('#lwWalk')!.onclick = () => { closeSheet(); standUp(); };
      body.querySelector<HTMLElement>('#lwLoc')!.onclick = () => openLocations();
    });
  }
  $('locBtn')?.addEventListener('click', () => openLocations());
  if (document.getElementById('locName')) $('locName').textContent = LOCATIONS.find(x => x.id === LOC)!.name;
  $('startBtn').onclick = startGame;
  $('menuBoard').onclick = () => openBoard();
  $('menuSettings').onclick = () => openSettings();
  $('homeBtn').onclick = () => {
    if (['fight', 'landing', 'trophy'].includes(fishing.mode)) { toast('Selesaikan adu tarik dulu.'); return; }
    walker.stop(); setWalking(false); fishing.seated = false;
    fishing.mode = 'menu'; $('hud').hidden = true; $('menu').hidden = false; renderSpots(fishing.spot.id); keepAwake(false);
  };

  // ---------- aplikasi HP: tombol Kembali, ditinggal & dibuka lagi ----------
  function askExit() {
    if (platform() === 'ios') return; // iOS: aplikasi ditutup lewat geser ke atas, tidak dari dalam aplikasi
    openSheet('Keluar dari PAUNJUNAN?', `<p style="margin:2px 0 12px;color:var(--dim)">Tangkapan & koin sudah tersimpan.</p>
      <div class="row"><button class="btn" id="exNo">Lanjut main</button><button class="btn gold" id="exYes">Keluar</button></div>`, b => {
      b.querySelector<HTMLElement>('#exNo')!.onclick = closeSheet;
      b.querySelector<HTMLElement>('#exYes')!.onclick = () => { closeSheet(); exitApp(); };
    });
  }
  initMobile({
    backState: () => ({ sheet: sheetOpen(), lossCard: !$('lossCard').hidden, mode: fishing.mode, autoOn: fishing.autoOn,
      autoWalk: walker.auto, inGame: $('menu').hidden && !$('hud').hidden }),
    onBack: a => {
      if (a === 'closeSheet') closeSheet();
      else if (a === 'closeLoss') $('lossCard').hidden = true;
      else if (a === 'holdFight') toast('Selesaikan adu tarik dulu.');
      else if (a === 'holdTrophy') toast('Pilih Simpan atau Lepas dulu.');
      else if (a === 'stopAuto') fishing.stopAuto('Dihentikan oleh pemain.');
      else if (a === 'stopWalk') { walker.stop(); $('autoBar').hidden = true; }
      else if (a === 'toMenu') $('homeBtn').click();
      else askExit();
      bump();
    },
    onPause: () => {
      // mancing otomatis hanya berjalan selama aplikasi terbuka (aturan v0.9.5)
      if (fishing.autoOn) fishing.stopAuto('Aplikasi ditinggal.');
      suspendAudio(); keepAwake(false);
    },
    onResume: away => {
      resumeAudio(); keepAwake(!$('hud').hidden); net?.wake(); bump();
      // lama ditinggal: segarkan data pemain (koin/hadiah bisa berubah dari HP lain atau panel admin)
      if (away > 120 && !$('hud').hidden && !['fight', 'landing', 'trophy'].includes(fishing.mode)) backend.me().then(p => fishing.setPlayer(p)).catch(() => {});
    },
  });

  // ---------- input ----------
  const act = $('actBtn');
  act.addEventListener('pointerdown', e => { e.preventDefault(); initAudio(); try { act.setPointerCapture(e.pointerId); } catch { /* */ } fishing.press(); bump(); });
  const up = (e: PointerEvent) => { e.preventDefault(); fishing.release(); bump(); };
  act.addEventListener('pointerup', up); act.addEventListener('pointercancel', up);
  addEventListener('keydown', e => { if ((e.target as HTMLElement)?.tagName === 'INPUT') return; if (e.code === 'Space' && !e.repeat && $('menu').hidden && fishing.mode !== 'walk') { initAudio(); fishing.press(); bump(); } });
  addEventListener('keyup', e => { if (e.code === 'Space') fishing.release(); });
  const ptrs = new Map<number, { x: number; y: number }>(); let pinch0 = 0, zoom0 = 1;
  let tap0 = { x: 0, y: 0, t: 0 };
  canvas.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); tap0 = { x: e.clientX, y: e.clientY, t: performance.now() }; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = rig.zoom; } bump(); });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    if (ptrs.size === 1 && fishing.mode === 'trophy') { fishing.spin += (e.clientX - p.x) * 0.012; spinning = true; }
    else if (ptrs.size === 1) { if (fishing.mode === 'walk') rig.turn(-(e.clientX - p.x) * 0.006); else fishing.drag(e.clientX - p.x); }
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); rig.zoom = THREE.MathUtils.clamp(zoom0 * pinch0 / Math.max(10, d), 0.55, 1.8); coach.ctx.zoomed = true; }
    bump();
  });
  const pUp = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    // ketuk singkat tanpa geser: lihat kartu pemain lain
    if (e.type === 'pointerup' && Math.hypot(e.clientX - tap0.x, e.clientY - tap0.y) < 8 && performance.now() - tap0.t < 350 && $('menu').hidden) {
      const p = crowd.pick(e.clientX, e.clientY, cam, innerWidth, innerHeight);
      if (p) openPlayerCard(p);
    }
  };
  canvas.addEventListener('pointerup', pUp); canvas.addEventListener('pointercancel', pUp);
  canvas.addEventListener('wheel', e => { rig.zoom = THREE.MathUtils.clamp(rig.zoom * (1 + Math.sign(e.deltaY) * 0.08), 0.55, 1.8); coach.ctx.zoomed = true; bump(); }, { passive: true });
  $('keepBtn').onclick = () => fishing.keepCatch();
  $('releaseBtn').onclick = () => fishing.releaseCatch();
  $('powerBtn').onclick = () => fishing.powerMove();
  $('liftBtn').onclick = () => fishing.liftRod();
  fishing.setDrag(fishing.reelDrag);
  $('dragDn').onclick = () => fishing.setDrag(fishing.reelDrag - 1);
  $('dragUp').onclick = () => fishing.setDrag(fishing.reelDrag + 1);
  let spinning = false;
  $('spinBtn').onclick = () => { spinning = !spinning; rig.trophyFront = spinning; $('spinBtn').textContent = spinning ? '⏸' : '360°'; if (spinning) toast('Geser layar untuk memutar ikan.'); };
  // sorakan pemain lain di obrolan saat adu tarik (mode lokal; di server pemain sungguhan yang mengetik)
  const CHEERS = ['mantap bro!! tarik terus!', 'wih strike! jangan kasih kendor', 'gas terus bang, ikan gede tuh!', 'sabar, capekin dulu ikannya'];
  fishing.onFight = () => { if (backend.mode === 'lokal') setTimeout(() => chat.push({ id: 'sim-RakaFishing', name: 'RakaFishing', text: CHEERS[Math.floor(Math.random() * CHEERS.length)], at: Date.now(), ch: 'global' }), 1400); };
  // foto ikan untuk kartu tangkapan: model ikan dirender di adegan kecil berlatar gelap
  const thumbScene = new THREE.Scene(); thumbScene.background = new THREE.Color(0x182330);
  thumbScene.add(new THREE.HemisphereLight(0xffffff, 0x5a6878, 3.2), new THREE.AmbientLight(0xffffff, 1.2));
  { const tl = new THREE.DirectionalLight(0xfff4e0, 3.4); tl.position.set(0.6, 2, 2.2); const fl = new THREE.DirectionalLight(0xbfdfff, 1.4); fl.position.set(-1, 0.5, 1.5); thumbScene.add(tl, fl); }
  const thumbFish = new FishActor(assets.fish); thumbFish.group.visible = true; thumbScene.add(thumbFish.group);
  const thumbCam = new THREE.PerspectiveCamera(30, 300 / 220, 0.01, 50);
  let thumbReq: { k: Parameters<FishActor['setSpecies']>[0]; w: number; cm: number } | null = null;
  fishing.onCatchCard = (k, w, cm) => { thumbReq = { k, w, cm }; };
  // spot sepi → kartu saran (pindah spot / jarak lempar / ganti umpan), paling sering tiap 45 dtk
  let tipAt = -1e9, tipTm = 0;
  fishing.onQuiet = async (q) => {
    if (performance.now() - tipAt < 45000 || !fishing.player) return;
    tipAt = performance.now();
    try { const w = await backend.world(); activity = Object.fromEntries(w.spots.map(s => [s.id, s.activity])); } catch { /* luring: pakai data terakhir */ }
    const list = quietAdvice({ ...q, loc: LOC, player: fishing.player, weather, activity: activity as Record<string, 'sepi' | 'sedang' | 'ramai'> });
    $('tipList').innerHTML = list.map(a => `<li>${esc(a.text)}</li>`).join('');
    const act = list.find(a => a.act === 'map' || a.act === 'bait'), btn = $('tipAct');
    btn.hidden = !act; btn.textContent = act?.actLabel ?? '';
    btn.onclick = () => {
      $('tipCard').hidden = true;
      if (act?.act === 'map') openMap();
      else if (act?.act === 'bait' && act.baitTo) {
        if ((fishing.player.bait[act.baitTo] ?? 0) > 0) backend.equip({ bait: act.baitTo }).then(r => { fishing.setPlayer(r.player); toast('Umpan diganti ke ' + BAITS[act.baitTo!].name + '.'); }).catch(e => toast((e as Error).message));
        else openBait('umpan');
      }
    };
    $('tipCard').hidden = false; sfx.click();
    clearTimeout(tipTm); tipTm = window.setTimeout(() => { $('tipCard').hidden = true; }, 14000);
  };
  $('tipX').onclick = () => { $('tipCard').hidden = true; };

  // ---------- mancing otomatis ----------
  const TIER_N = ['Kecil', 'Sedang', 'Besar', 'Monster'];
  const pct = (x: number) => Math.round(x * 100) + '%';
  const mmss = (s: number) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  async function openAuto() {
    if (fishing.autoOn) { fishing.stopAuto('Dihentikan oleh pemain.'); return; }
    if (fishing.mode !== 'ready') { toast(fishing.mode === 'walk' ? 'Pilih tempat dulu: ketuk "Mancing di sini" atau pergi ke spot.' : 'Tunggu lemparan/adu tarik selesai.'); return; }
    if (hybrid && !hybrid.online) { toast('Mancing otomatis perlu jaringan.'); return; }
    let info;
    try { info = await backend.autoInfo(); } catch (e) { toast((e as Error).message); return; }
    const p = fishing.player, bait = p.bait[p.curBait] ?? 0;
    openSheet('🤖 Mancing otomatis', `<p style="margin:2px 0 6px;color:var(--dim)">Avatar akan melempar, menyentak, dan menarik ikan sendiri di <b style="color:var(--ink)">${esc(fishing.spot.label)}</b>. Ikan tidak selalu berhasil diangkat — peluangnya:</p>
      <div class="afRates">${info.rate.map((r, i) => `<div><b>${pct(r)}</b><small>${TIER_N[i]}</small></div>`).join('')}</div>
      <div class="list">
        <div class="item"><span class="icn">🪙</span><div><b>Hadiah ${pct(info.gainMul)} dari manual</b><small>Koin (nilai jual) & XP tiap ikan otomatis</small></div></div>
        <div class="item"><span class="icn">📅</span><div><b>${info.left < 0 ? 'Tanpa batas harian' : 'Sisa hari ini: ' + info.left + ' / ' + info.maxPerDay + ' ikan'}</b><small>Paling cepat satu ikan tiap ${info.minGap} detik</small></div></div>
        <div class="item"><span class="icn">🏆</span><div><b>${info.board ? 'Ikut papan peringkat & turnamen' : 'Tidak ikut papan peringkat & turnamen'}</b><small>${info.missions ? 'Tetap dihitung untuk misi harian & lencana' : 'Tidak dihitung untuk misi & lencana'}</small></div></div>
        <div class="item"><span class="icn">🧺</span><div><b>Umpan ${esc(BAITS[p.curBait].name)}: ${bait} · keranjang ${p.basket.length}/${basketCap(p)}</b><small>${info.full === 'jual' ? 'Keranjang penuh: ikan langsung dijual' : 'Berhenti sendiri saat umpan habis atau keranjang penuh'}</small></div></div>
      </div>
      ${info.allowed ? '' : `<p style="color:var(--coral);font-weight:800">${esc(info.reason)}</p>`}
      <button class="btn gold big" id="afGo" style="width:100%;margin-top:10px" ${info.allowed ? '' : 'disabled'}>▶ Mulai otomatis</button>
      <p style="color:var(--dim);font-size:11px;margin-top:6px">Ketuk tombol besar, berjalan, atau ■ Berhenti kapan saja untuk menghentikan. Biarkan aplikasi tetap terbuka.</p>`, b => {
      b.querySelector<HTMLElement>('#afGo')!.onclick = async () => { closeSheet(); const err = await fishing.startAuto(); if (err) toast(err, 3500); };
    });
  }
  $('autoBtn').onclick = () => { void openAuto(); };
  $('afStop').onclick = () => fishing.stopAuto('Dihentikan oleh pemain.');
  function afText() {
    const st = fishing.autoStats;
    $('afTxt').textContent = `${st.caught} ikan · ${st.lost} lepas · ${fmtKg(st.kg)} · ${mmss(fishing.now() - st.start)}${st.left >= 0 ? ' · sisa ' + st.left : ''}`;
  }
  let afTimer = 0;
  fishing.onAuto = (ev, reason) => {
    if (ev === 'start') {
      $('afBar').hidden = false; $('autoBtnTxt').textContent = 'AUTO ■'; afText();
      clearInterval(afTimer); afTimer = window.setInterval(afText, 1000);
      toast('🤖 Mancing otomatis dimulai.'); $('tipCard').hidden = true; coach.ctx.walked = true;
      return;
    }
    if (ev === 'tick') { afText(); return; }
    clearInterval(afTimer); $('afBar').hidden = true; $('autoBtnTxt').textContent = 'Otomatis';
    const st = fishing.autoStats, n = st.caught + st.lost;
    if (n === 0) { if (reason) toast('🤖 ' + reason, 3500); return; }
    openSheet('🤖 Ringkasan mancing otomatis', `${reason ? `<p style="margin:2px 0 6px;color:var(--dim)">Berhenti: ${esc(reason)}</p>` : ''}
      <div class="afGrid"><div><b>${st.caught}</b><small>ikan didapat</small></div><div><b>${st.lost}</b><small>lepas</small></div><div><b>${n ? pct(st.caught / n) : '—'}</b><small>berhasil</small></div>
        <div><b>${fmtKg(st.kg)}</b><small>total berat</small></div><div><b>${st.coins}</b><small>koin${st.sold ? ' (' + st.sold + ' dijual)' : ' (nilai)'}</small></div><div><b>+${st.xp}</b><small>XP</small></div></div>
      <p style="color:var(--dim);font-size:12px">Waktu ${mmss(fishing.now() - st.start)}${st.left >= 0 ? ' · sisa hari ini ' + st.left + ' ikan' : ''}. Ikan yang disimpan ada di keranjang — jual di warung.</p>
      <div class="row"><button class="btn" id="afBasket">🧺 Keranjang</button><button class="btn gold" id="afAgain">▶ Lanjut otomatis</button></div>`, b => {
      b.querySelector<HTMLElement>('#afBasket')!.onclick = () => openBasket();
      b.querySelector<HTMLElement>('#afAgain')!.onclick = async () => { closeSheet(); const err = await fishing.startAuto(); if (err) toast(err, 3500); };
    });
  };
  function snapFish(q: NonNullable<typeof thumbReq>) {
    thumbFish.setSpecies(q.k, q.w, q.cm); thumbFish.update(0.4, 0.2, 0.05);
    const L = q.cm / 100;
    thumbFish.group.position.set(0, 0, 0);
    thumbFish.group.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.38).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 - 0.35));
    thumbCam.position.set(0, L * 0.1, L * 1.42); thumbCam.lookAt(0, 0, 0);
    const W = 150, H = 110, pr = renderer.getPixelRatio();
    renderer.setScissorTest(true); renderer.setViewport(0, 0, W, H); renderer.setScissor(0, 0, W, H);
    renderer.render(thumbScene, thumbCam);
    const cv = $('cFishCv') as unknown as HTMLCanvasElement;
    try { cv.getContext('2d')!.drawImage(canvas, 0, canvas.height - H * pr, W * pr, H * pr, 0, 0, cv.width, cv.height); } catch { /* */ }
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  $('shareBtn').onclick = async () => {
    const text = fishing.shareText();
    try { if (navigator.share) await navigator.share({ title: 'PAUNJUNAN', text }); else { await navigator.clipboard.writeText(text); toast('Teks tangkapan disalin. Tempel di WhatsApp atau media sosial.'); } } catch { /* dibatalkan */ }
  };
  $('lossCard').onclick = () => { $('lossCard').hidden = true; };
  $('sheetClose').onclick = closeSheet;
  $('sheet').addEventListener('pointerdown', e => { if (e.target === $('sheet')) closeSheet(); });
  $('soundBtn').textContent = settings.sound ? '🔊' : '🔇';
  $('soundBtn').onclick = () => { initAudio(); setMuted(settings.sound); $('soundBtn').textContent = settings.sound ? '🔊' : '🔇'; };
  $('setBtn').onclick = () => openSettings();
  $('boardBtn').onclick = () => openBoard();
  $('baitBtn').onclick = () => openBait();
  $('basketBtn').onclick = () => openBasket();

  const canChangeGear = () => { if (!['ready', 'menu', 'walk'].includes(fishing.mode)) { toast('Angkat kail dulu sebelum mengganti.'); return false; } return true; };

  // ---------- lembar: umpan & perlengkapan ----------
  const shop = createShop({ backend, player: () => fishing.player, setPlayer: (pl) => fishing.setPlayer(pl), canChangeGear: () => canChangeGear() });
  function openBait(tab: 'umpan' | 'joran' | 'senar' | 'alat' = 'umpan') { shop.open(tab); }

  function openBasket() {
    const p = fishing.player, total = p.basket.reduce((a, c) => a + c.value, 0);
    const list = p.basket.length ? p.basket.slice().reverse().map(c => `<div class="item"><span class="icn">🐟</span><div><b>${esc(c.name)} · ${fmtKg(c.weight)}</b><small>${c.length} cm · ${'★'.repeat(c.stars)} · ${c.value} koin</small></div><div style="display:grid;gap:4px"><button class="btn" data-rel="${c.id}">Lepas</button><button class="btn" data-aq="${c.id}">🐠 Pajang</button></div></div>`).join('') : '<p style="color:var(--dim)">Keranjang masih kosong. Ayo mancing!</p>';
    openSheet(`Keranjang ikan (${p.basket.length}/${basketCap(p)})`, `<div class="list">${list}</div>${p.basket.length ? `<button class="btn gold big" style="width:100%;margin-top:12px" id="sellAll">Jual semua · ${total} koin</button>` : ''}
      <p style="color:var(--dim);font-size:12px">Total tangkapan: ${p.stats.catches} ekor · ${fmtNum(p.stats.totalKg, 1)} kg · terberat ${fmtKg(p.stats.heaviest)}</p>`, body => {
      body.querySelector<HTMLElement>('#sellAll')?.addEventListener('click', async () => { try { const r = await backend.sell(); fishing.setPlayer(r.player); toast(`${r.sold} ikan terjual · +${r.coins} koin`); sfx.win(); closeSheet(); } catch (e) { toast((e as Error).message); } });
      body.querySelectorAll<HTMLElement>('[data-aq]').forEach(b => b.onclick = async () => { try { const r = await backend.toAquarium(b.dataset.aq!); fishing.setPlayer(r.player); toast('Ikan dipajang di akuarium.'); openBasket(); } catch (e) { toast((e as Error).message); } });
      body.querySelectorAll<HTMLElement>('[data-rel]').forEach(b => b.onclick = async () => { try { const r = await backend.release(b.dataset.rel!); fishing.setPlayer(r.player); toast('Ikan dilepas. +2 XP'); openBasket(); } catch (e) { toast((e as Error).message); } });
    });
  }

  async function openSpots() {
    if (!canChangeGear()) return;
    let act: Record<string, string> = {};
    try { const w = await backend.world(); act = Object.fromEntries(w.spots.map(s => [s.id, s.activity])); } catch { /* */ }
    const desc: Record<string, string> = { A1: 'Air tenang di ujung dermaga. Cocok untuk pemula. Kedalaman 2–3 m.', B3: 'Di antara petak keramba, dalam dan banyak ikan. Awas rangka keramba!', C2: 'Dangkal di tepi rumput. Tempat gabus dan toman berburu.' };
    openSheet('Pindah spot', '<div class="list">' + SPOT_PLACES.map(s => `<div class="item ${s.id === fishing.spot.id ? 'on' : ''}"><span class="icn">📍</span><div><b>${esc(s.label)}</b><small>${desc[s.id]}</small><small class="act-${act[s.id] ?? 'sedang'}">Aktivitas: ${act[s.id] ?? '—'}</small></div>${s.id === fishing.spot.id ? '<small>Di sini</small>' : `<button class="btn gold" data-go="${s.id}">Pergi</button>`}</div>`).join('') + '</div>', body => {
      body.querySelectorAll<HTMLElement>('[data-go]').forEach(b => b.onclick = () => {
        teleport(b.dataset.go!);
      });
    });
  }

  async function openBoard(kind: 'heaviest' | 'most' | 'level' | 'album' = 'heaviest', period: 'day' | 'week' | 'all' = 'day') {
    const K = { heaviest: 'Terberat', most: 'Terbanyak', level: 'Level', album: 'Album' }, P = { day: 'Hari ini', week: 'Minggu ini', all: 'Sepanjang masa' };
    const head = `<div class="tabs">${(Object.keys(K) as (keyof typeof K)[]).map(k => `<button data-k="${k}" class="${k === kind ? 'on' : ''}">${K[k]}</button>`).join('')}</div>` +
      (kind === 'level' || kind === 'album' ? '' : `<div class="tabs">${(Object.keys(P) as (keyof typeof P)[]).map(k => `<button data-p="${k}" class="${k === period ? 'on' : ''}">${P[k]}</button>`).join('')}</div>`);
    openSheet('🏆 Papan peringkat', '<button class="btn gold" id="toTour" style="width:100%;margin:4px 0">🏆 Turnamen harian & Raja Nila</button>' + head + '<div class="list" id="boardList"><p style="color:var(--dim)">Memuat…</p></div>', body => {
      body.querySelectorAll<HTMLElement>('[data-k]').forEach(b => b.onclick = () => openBoard(b.dataset.k as 'most', period));
      body.querySelector<HTMLElement>('#toTour')!.onclick = () => social.openTournaments();
      body.querySelectorAll<HTMLElement>('[data-p]').forEach(b => b.onclick = () => openBoard(kind, b.dataset.p as 'day'));
    });
    if (kind === 'album') {
      const al = fishing.player?.album ?? {}, ids = Object.keys(SPECIES) as (keyof typeof SPECIES)[];
      const got = ids.filter(k => al[k]);
      $('boardList').innerHTML = `<p style="color:var(--dim);margin:0">Koleksi: ${got.length}/${ids.length} jenis. Angka = rekor terberat Anda.</p><div class="album">` +
        ids.map(k => al[k] ? `<div><span class="fishIc">🐟</span><b>${esc(SPECIES[k].name)}</b>${fmtKg(al[k]!)}</div>` : `<div class="no"><span class="fishIc">❔</span><b>???</b>Belum didapat</div>`).join('') + '</div>';
      return;
    }
    try {
      const rows = await backend.leaderboard(kind, period);
      const me = fishing.player?.id;
      $('boardList').innerHTML = rows.length ? rows.map((r, i) => `<div class="item ${r.playerId === me ? 'on' : ''}"><span class="rank r${i + 1}">${i + 1}</span><div><b>${esc(r.name)}</b>${r.species ? `<small>${SPECIES[r.species]?.name ?? ''}</small>` : ''}</div><b>${kind === 'heaviest' ? fmtKg(r.value) : kind === 'most' ? r.value + ' ekor' : 'Lv ' + r.value}</b></div>`).join('') : '<p style="color:var(--dim)">Belum ada data. Jadilah yang pertama!</p>';
    } catch (e) { $('boardList').innerHTML = `<p>${esc((e as Error).message)}</p>`; }
  }

  function openSettings() {
    const seg = (key: string, opts: [string, string][], cur: string) => `<div class="seg" data-key="${key}">${opts.map(([v, l]) => `<button data-v="${v}" class="${v === cur ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    openSheet('Pengaturan', `
      <div class="set"><span>Suara</span>${seg('sound', [['1', 'Nyala'], ['0', 'Mati']], settings.sound ? '1' : '0')}</div>
      <div class="set"><span>Getaran</span>${seg('vibrate', [['1', 'Nyala'], ['0', 'Mati']], settings.vibrate ? '1' : '0')}</div>
      <div class="set"><span>Tingkat grafis<br><small style="color:var(--dim)">Sekarang: ${tier}</small></span>${seg('tier', [['auto', 'Otomatis'], ['hemat', 'Hemat'], ['sedang', 'Sedang'], ['tinggi', 'Tinggi']], settings.tierPref)}</div>
      <div class="set"><span>Batas FPS</span>${seg('fps', [['auto', 'Otomatis'], ['30', '30'], ['45', '45'], ['60', '60']], String(settings.fpsPref))}</div>
      <div class="set"><span>Main lama (hemat baterai)<br><small style="color:var(--dim)">Lebih dingin & awet: resolusi sedikit turun, 20 FPS saat menunggu ikan</small></span>${seg('saver', [['auto', 'Otomatis'], ['on', 'Nyala'], ['off', 'Mati']], settings.saverPref)}</div>
      <div class="set"><span>Tampilkan FPS</span>${seg('showFps', [['1', 'Ya'], ['0', 'Tidak']], settings.showFps ? '1' : '0')}</div>
      <div class="set"><span>Suara alam</span>${seg('ambVol', [['0', 'Mati'], ['0.6', 'Pelan'], ['1', 'Normal']], String(sound.ambVol))}</div>
      <div class="set"><span>Musik latar</span>${seg('musicVol', [['0', 'Mati'], ['0.5', 'Pelan'], ['1', 'Normal']], String(sound.musicVol))}</div>
      ${tier === 'tinggi' ? `<div class="set"><span>Efek sinematik (bloom)<small>Eksperimen — matikan bila layar terlalu terang</small></span>${seg('bloom', [['1', 'Hidup'], ['0', 'Mati']], store.get('bloom2', false) ? '1' : '0')}</div>` : ''}
      <div class="set"><span>Kecerahan</span>${seg('bright', [['1', 'Normal'], ['1.15', 'Terang'], ['1.4', 'Sangat terang']], String(world.brightness))}</div>
      <div class="set"><span>Waktu dunia</span>${seg('timeMode', [['nyata', 'Jam HP'], ['pagi', 'Pagi'], ['siang', 'Siang'], ['sore', 'Sore'], ['malam', 'Malam']], timePref())}</div>
      <div class="set"><span>Kamera adu tarik</span>${seg('fightCam', [['dekat', 'Dekat'], ['joran', 'Tampak joran']], rig.fightCam)}</div>
      <div class="set"><span>Ketinggian kamera</span>${seg('camH', [['-0.4', 'Rendah'], ['0', 'Normal'], ['0.8', 'Tinggi'], ['2', 'Atas']], String(rig.height))}</div>
      <div class="set"><span>Mulai di pintu masuk</span>${seg('entrance', [['1', 'Ya'], ['0', 'Tidak']], store.get('entrance', true) ? '1' : '0')}</div>
      <div class="set"><span>Akun & data</span><button class="btn" id="acctSet" style="padding:6px 10px;font-size:12px">${backend.mode === 'server' ? 'Kelola akun' : 'Hapus data perangkat'}</button></div>
      <div class="set"><span>${backend.mode === 'lokal' ? 'Panel developer' : 'Panel admin'}</span><button class="btn" id="adminOpen" style="padding:6px 10px;font-size:12px">Buka</button></div>
      <div class="set"><span>Panduan pemula</span><button class="btn" id="coachAgain" style="padding:6px 10px;font-size:12px">Tampilkan lagi</button></div>
      <div class="set"><span>Cuaca</span>${seg('weather', [['auto', 'Otomatis'], ['cerah', 'Cerah'], ['kabut', 'Kabut'], ['hujan', 'Hujan']], store.get('weather', 'auto'))}</div>
      <div class="set" style="display:grid;gap:6px"><span>Server game <small style="color:var(--dim)">(kosong = mode lokal)</small></span>
        <div class="row"><input id="srvIn" style="flex:3;font:inherit;padding:8px;border-radius:10px;border:1px solid var(--line);background:#0a1018;color:var(--ink)" placeholder="https://api.paunjunan.com" value="${esc(serverUrl)}"><button class="btn" id="srvTest">Tes</button><button class="btn" id="srvSave">Simpan</button></div>
        <small id="srvRes" class="srvRes">${serverUrl ? 'Ketuk Tes untuk mengukur koneksi.' : 'Mode lokal: tidak memakai server.'}</small></div>
      <p style="color:var(--dim);font-size:11px">PAUNJUNAN v0.9.5 · ${backend.mode === 'lokal' ? 'Mode lokal' : hybrid && !hybrid.online ? 'Luring (menunggu jaringan)' : 'Tersambung ke server'} · grafis ${tier}</p>`, body => {
      body.querySelectorAll<HTMLElement>('.seg').forEach(s => s.querySelectorAll<HTMLElement>('button').forEach(b => b.onclick = () => {
        const key = s.dataset.key!, v = b.dataset.v!;
        if (key === 'sound') { initAudio(); setMuted(v === '0'); $('soundBtn').textContent = settings.sound ? '🔊' : '🔇'; }
        if (key === 'vibrate') settings.vibrate = v === '1';
        if (key === 'showFps') settings.showFps = v === '1';
        if (key === 'saver') settings.saverPref = v as 'auto';
        if (key === 'fps') settings.fpsPref = v === 'auto' ? 'auto' : Number(v) as 30;
        if (key === 'tier') { settings.tierPref = v as 'auto'; toast('Tingkat grafis berlaku setelah game dimuat ulang.'); }
        if (key === 'timeMode') store.set('timeMode', v);
        if (key === 'bloom') { store.set('bloom2', v === '1'); setupBloom(v === '1'); }
        if (key === 'ambVol') sound.setAmb(Number(v));
        if (key === 'musicVol') sound.setMusic(Number(v));
        if (key === 'bright') { world.brightness = Number(v); store.set('bright', world.brightness); }
        if (key === 'fightCam') { rig.fightCam = v as 'dekat'; store.set('fightCam', v); }
        if (key === 'camH') { rig.height = Number(v); store.set('camH', rig.height); }
        if (key === 'entrance') store.set('entrance', v === '1');
        if (key === 'weather') { store.set('weather', v); weather = autoWeather(); world.setWeather(weather, fishing.angler.root.position); }
        settings.save(); openSettings();
      }));
      body.querySelector<HTMLElement>('#acctSet')!.onclick = () => {
        if (remoteBe) { openAccount(remoteBe, () => { renderAcct(); location.reload(); }); return; }
        const lb = backend as LocalBackend;
        openSheet('Hapus data perangkat', '<p>Koin, perlengkapan, dan tangkapan di perangkat ini akan dihapus permanen.</p><button class="btn" id="dlLocal" style="background:var(--red);width:100%">Hapus permanen</button>', b2 => {
          b2.querySelector<HTMLElement>('#dlLocal')!.onclick = async () => { await lb.deleteLocal(); toast('Data dihapus. Memuat ulang…'); setTimeout(() => location.reload(), 800); };
        });
      };
      body.querySelector<HTMLElement>('#adminOpen')!.onclick = () => openAdmin(backend, fishing.player?.id ?? '', 'peluang', (url, slot) => world.setBackdrop(url, slot), (show) => world.setFarTrees(show), (c) => world.setWaterClarity(c));
      body.querySelector<HTMLElement>('#coachAgain')!.onclick = () => { coach.restart(); closeSheet(); toast('Panduan dimulai lagi.'); };
      const srvUrl = () => (body.querySelector('#srvIn') as HTMLInputElement).value.trim().replace(/\/$/, '');
      const srvRes = body.querySelector<HTMLElement>('#srvRes')!;
      const runTest = async () => {
        srvRes.className = 'srvRes'; srvRes.textContent = 'Menguji…';
        const r = await testServer(srvUrl());
        srvRes.className = 'srvRes ' + (r.ok ? (r.ms > 400 ? 'slow' : 'good') : 'bad'); srvRes.textContent = r.text + (r.ok && r.ms > 400 ? ' (lambat)' : '');
        return r;
      };
      body.querySelector<HTMLElement>('#srvTest')!.onclick = () => { void runTest(); };
      body.querySelector<HTMLElement>('#srvSave')!.onclick = async () => {
        const url = srvUrl();
        if (url) { const r = await runTest(); if (!r.ok) { toast('Server tidak bisa dihubungi. Belum disimpan.'); return; } }
        store.set('server', url); toast(url ? 'Tersambung. Memuat ulang…' : 'Kembali ke mode lokal. Memuat ulang…'); setTimeout(() => location.reload(), 800);
      };
    });
  }

  // ---------- loop utama dengan batas FPS ----------
  const npcs = simulatedPlayers();
  let npcT = 0, last = performance.now(), bumpUntil = 0, clockT = 0, netT = 0, frames = 0, fpsT = 0, fpsShown = 0, time = 0, miniT = 0, ctxT = 0, npcSyncT = 0;
  // NPC pejalan (mode lokal): mondar-mandir dermaga ↔ keramba lewat titian
  const npcWalker = npcs.find(n => n.pose === 'walk');
  const npcRoute = (() => {
    const A = IS_DANAU ? { x: 0, z: 10 } : IS_SERENE ? { x: 0, z: 14 } : nearestWalkable(SPOT_PLACES[0].pos.x, SPOT_PLACES[0].pos.z + 1) ?? SPOT_PLACES[0].pos;
    const B = IS_DANAU ? { x: 35, z: -22 } : SPOT_PLACES[1].pos;
    const a = findPath(A.x, A.z, B.x, B.z) ?? []; return [{ x: A.x, z: A.z }, ...a, ...a.slice(0, -1).reverse(), { x: A.x, z: A.z }];
  })();
  let npcI = 0;
  function bump() { bumpUntil = performance.now() + 1500; }
  const PERF_BUDGET: Record<string, { calls: number; tris: number }> = { hemat: { calls: 300, tris: 300_000 }, sedang: { calls: 450, tris: 600_000 }, tinggi: { calls: 700, tris: 1_500_000 } };
  let fpsDetail = false;
  $('fpsBox').onclick = () => { fpsDetail = !fpsDetail; };
  const avaCam = new THREE.PerspectiveCamera(27, 1, 0.05, 600); avaCam.layers.enable(1);
  function snapAvatar() {
    const head = fishing.bodyPoint(0, 1.6, 0), eye = fishing.bodyPoint(0.22, 1.68, -0.95);
    avaCam.position.copy(eye); avaCam.lookAt(head); avaCam.updateMatrixWorld();
    const S = 128, pr = renderer.getPixelRatio();
    renderer.setScissorTest(true); renderer.setViewport(0, 0, S, S); renderer.setScissor(0, 0, S, S);
    renderer.render(scene, avaCam);
    const cv = $('avaCv') as unknown as HTMLCanvasElement;
    try { cv.getContext('2d')!.drawImage(canvas, 0, canvas.height - S * pr, S * pr, S * pr, 0, 0, cv.width, cv.height); } catch { /* biarkan potret cadangan */ }
    renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  }
  rig.snap(fishing);
  // siapkan semua shader di awal (ikan, cipratan, hujan, kartu tangkapan…): tanpa ini HP berhenti sesaat (patah) saat
  // benda itu pertama kali muncul, mis. ketika ikan menyambar. compileAsync memakai kompilasi paralel bila HP mendukung.
  void renderer.compileAsync(scene, cam).then(() => renderer.compileAsync(thumbScene, thumbCam)).catch(() => {});
  function loop(now: number) {
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    const menu = fishing.mode === 'menu';
    const activity = menu ? 'menu' : (now < bumpUntil ? 'active' : fishing.activity);
    const target = targetFps(activity);
    if (!pacer.tick(now, target)) return;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    time += dt;
    const hour = worldHour();
    // berjalan: joystick + papan ketik
    if (fishing.mode === 'walk' && joyId < 0) {
      const kx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
      const ky = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
      walker.input.x = kx; walker.input.y = ky; if (kx || ky) { bump(); $('autoBar').hidden = true; }
    }
    walker.update(dt, rig.yaw);
    rig.walkYaw = walker.yaw; rig.follow = walker.auto || (walker.input.y > 0.55 && Math.abs(walker.input.x) < 0.5);
    if (walker.auto) bump();
    if (spinning && fishing.mode === 'trophy' && ptrs.size === 0) fishing.spin += dt * 0.9;
    if (fishing.mode !== 'trophy' && spinning) { spinning = false; rig.trophyFront = false; $('spinBtn').textContent = '360°'; }
    fishing.update(dt);
    if (myBub) { myBubT -= dt; if (myBubT <= 0) { fishing.angler.root.remove(myBub); myBub = null; } }
    sound.update(dt, { night: world.sky.night, rain: world.weather === 'hujan' ? 1 : 0, fighting: fishing.mode === 'fight' || fishing.mode === 'landing' });
    chat.tick(dt); coach.tick(fishing, !$('hud').hidden && !sheetOpen());
    if (!menu) {
      miniT -= dt;
      if (miniT < 0) {
        miniT = fishing.mode === 'walk' ? 0.15 : 0.6;
        drawMinimap($('minimap') as unknown as HTMLCanvasElement, mapDyn(null));
        const rp = fishing.angler.root.position; hud.setPos(LOC, rp.x, rp.z);
        const m = fishing.mode;
        hud.setSub(m === 'ready' ? 'walk' : m === 'waiting' || m === 'settling' ? 'reel' : 'off');
        document.body.classList.toggle('fighting', m === 'fight' || m === 'landing');
      }
    }
    if (fishing.mode === 'walk') {
      ctxT -= dt;
      if (ctxT < 0) {
        ctxT = 0.25;
        const px = walker.x, pz = walker.z, cb = $('ctxBtn');
        ctxAct = null;
        if (SHOP && Math.hypot(px - SHOP.x, pz - SHOP.z) < SHOP.r) { cb.textContent = '🏪 Masuk warung'; ctxAct = openWarung; }
        else if (Math.hypot(px - (LOKET.x - 2), pz - LOKET.z) < 2.6) { cb.textContent = '🎫 Loket'; ctxAct = () => toast('Tiket masuk gratis selama masa uji coba. Selamat memancing!'); }
        cb.hidden = !ctxAct;
        const ok = walker.fishingPose(rig.yaw).ok;
        $('fishHereBtn').style.opacity = $('sitHereBtn').style.opacity = ok ? '1' : '0.55';
      }
    }
    world.update(dt * fishing.timeScale, time, hour, fishing.angler.root.position);
    rig.update(dt, fishing);
    crowd.update(dt, time, cam);
    updateKeeper(dt, time);
    if (backend.mode === 'lokal') {
      npcT -= dt;
      if (npcT < 0) { npcT = 6 + Math.random() * 10; const n = npcs.filter(q => q.pose !== 'walk')[Math.floor(Math.random() * (npcs.length - 1))]; if (n) n.pose = n.pose === 'fight' ? 'wait' : Math.random() < 0.4 ? 'fight' : 'wait'; crowd.sync(npcs); }
      if (npcWalker && npcRoute.length > 1) {
        const wp = npcRoute[npcI % npcRoute.length], dx = wp.x - npcWalker.x, dz = wp.z - npcWalker.z, d = Math.hypot(dx, dz);
        if (d < 0.3) npcI++; else { const st = Math.min(d, 1.3 * dt); npcWalker.x += dx / d * st; npcWalker.z += dz / d * st; npcWalker.yaw = Math.atan2(-dx, -dz); }
        npcSyncT -= dt; if (npcSyncT < 0) { npcSyncT = 0.2; crowd.sync(npcs); }
      }
    } else if (net) {
      netT -= dt; if (netT < 0) { netT = 0.2; const r = fishing.angler.root; net.state(r.position.x, r.position.z, r.rotation.y, poseNow); }
    }
    // resolusi dinamis: diterapkan SEBELUM menggambar (mengubah ukuran kanvas mengosongkannya — kalau sesudah, layar berkedip)
    {
      const hold = fishing.mode === 'fight' || fishing.mode === 'landing';
      dyn.tick(dt, target, hold);
      if (!hold && Math.abs(dyn.dpr - renderer.getPixelRatio()) > 0.01) { renderer.setPixelRatio(dyn.dpr); composer?.setPixelRatio(dyn.dpr); }
    }
    world.water.renderReflection(renderer, scene, cam);
    // potret pemain di HUD: diambil dari kamera kecil di depan wajah (sekali tiap ganti tampilan)
    if (thumbReq) { const q = thumbReq; thumbReq = null; snapFish(q); }
    if (avaDirty && !menu && !sheetOpen() && (fishing.mode === 'ready' || fishing.mode === 'waiting') && time > 1.5) { avaDirty = false; snapAvatar(); }
    if (composer) composer.render(); else renderer.render(scene, cam);
    clockT -= dt;
    if (clockT < 0 && !menu) {
      clockT = 1;
      const h = Math.floor(hour), m = Math.floor((hour - h) * 60), W = WEATHER[weather];
      const temp = Math.round(24 + 8 * Math.max(0, Math.sin((hour - 6) / 12 * Math.PI)) - (weather === 'hujan' ? 4 : weather === 'kabut' ? 2 : 0));
      hud.setClock(hour, weather); document.querySelector('#hud .timePill')?.setAttribute('title', `${W.name} ${temp}°C`); void h; void m;
      const nw = autoWeather(); if (nw !== weather) { weather = nw; world.setWeather(weather, fishing.angler.root.position); }
    }
    frames++; fpsT += dt;
    if (fpsT >= 1) {
      fpsShown = Math.round(frames / fpsT); frames = 0; fpsT = 0;
      const fb = $('fpsBox'); fb.hidden = !settings.showFps;
      if (settings.showFps) {
        // anggaran per tingkat (diukur di v0.9.3–0.9.4: hemat ±270 dc/170 rb, sedang ±390 dc/420 rb)
        const B = PERF_BUDGET[tier], i = renderer.info, dc = i.render.calls, tri = i.render.triangles;
        const over = Math.max(dc / B.calls, tri / B.tris), slow = fpsShown / target;
        const lvl = slow >= 0.9 && over <= 1 ? 'ok' : slow >= 0.7 && over <= 1.3 ? 'warn' : 'bad';
        fb.className = 'fps ' + lvl + (fpsDetail ? ' det' : '');
        const m = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
        fb.innerHTML = `<b>${fpsShown}</b> FPS / ${target} · ${tier} · ${dyn.dpr.toFixed(2)}x · ${pacer.refreshHz} Hz${saverOn() ? ' · hemat' : ''}` + (fpsDetail
          ? `<br>${dc}/${B.calls} gambar · ${(tri / 1000).toFixed(0)}k/${(B.tris / 1000).toFixed(0)}k segitiga<br>${i.memory.geometries} geometri · ${i.memory.textures} tekstur${m ? ' · JS ' + (m.usedJSHeapSize / 1048576).toFixed(0) + ' MB' : ''}`
          : ` · ${dc} dc · ${(tri / 1000).toFixed(0)}k tri`);
      }
    }
    (window as unknown as { __pj: object }).__pj = { mode: fishing.mode, fps: fpsShown, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, F: fishing.F, tier, frames: Math.round(time * 1000) };
  }
  requestAnimationFrame(loop);

  (window as unknown as { __game: object }).__game = { social, trade, fishing, rig, world, backend, crowd, walker, chat, coach, startGame, openBait, openBasket, openBoard, openSettings, openSpots, openMap, openWarung, goTo, fishHere, standUp };
  // pengujian otomatis: ?auto=1 langsung masuk
  if (qs.has('auto')) { ($('nameIn') as HTMLInputElement).value = qs.get('name') ?? 'Penguji'; if (qs.get('spot')) pickSpot(qs.get('spot')!); await startGame(); if (qs.get('demo')) fishing.debugDemo(qs.get('demo') as 'trophy', (qs.get('sp') ?? 'toman') as never, Number(qs.get('kg') ?? 7.5)); rig.snap(fishing); }
})().catch(e => showErr(String(e?.stack || e)));

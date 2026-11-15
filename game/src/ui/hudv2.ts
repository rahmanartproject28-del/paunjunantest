// HUD bergaya "Danau Serene": kartu pemain + potret, koin & permata, Quest Harian, Tas/Toko/Menu,
// peta mini bulat + lokasi & koordinat + jam/cuaca, baris obrolan dunia, hotbar barang, tombol Umpan/Tarik.
import { BAITS, RODS, LINES, SPECIES, LOCATIONS, levelInfo, dayKey, type Player, type Mission, type BaitId, type WeatherId } from '@paunjunan/shared';
import { $, esc } from './hud';
import { IC, BAIT_ICON } from './icons';
import type { ChatMsg } from './chat';

const fmt = (n: number) => Math.round(n).toLocaleString('id-ID');
/** Gelar sesuai level (baris kecil di bawah bilah XP). */
function titleFor(lv: number) { return lv >= 30 ? 'Legenda Danau' : lv >= 20 ? 'Master Pancing' : lv >= 12 ? 'Pemancing Ahli' : lv >= 6 ? 'Pemancing' : 'Pemula'; }
/** Teks misi pendek untuk panel Quest Harian. */
function questText(m: Mission) {
  switch (m.kind) {
    case 'species': return `Tangkap Ikan ${SPECIES[m.species!]?.name ?? m.species}`;
    case 'count': return `Kumpulkan ${m.target} ikan apa saja`;
    case 'kg': return `Kumpulkan ${m.target} kg ikan`;
    case 'big': return `Tangkap ${m.target} ikan Besar/Monster`;
  }
}
const prog = (m: Mission) => m.kind === 'kg' ? `(${(Math.round(m.progress * 10) / 10).toString().replace('.', ',')}/${m.target})` : `(${Math.floor(m.progress)}/${m.target})`;

export interface HudCtx {
  openMissions: () => void; openBag: () => void; openBait: (tab?: 'umpan' | 'joran' | 'senar') => void;
  equipBait: (b: BaitId) => void; openChat: () => void;
}

export function createHud(c: HudCtx) {
  // ikon statis
  const put = (id: string, svg: string) => { const el = document.getElementById(id); if (el) el.innerHTML = svg; };
  put('questIc', IC.scroll); put('icBag', IC.bag); put('icCart', IC.cart); put('icMenu', IC.menu); put('pinIc', IC.pin);
  put('chIc', IC.chat); put('icUmpan', IC.fishBait); put('gemIc', IC.gem); put('subIc', IC.cast); put('sunIc', IC.sun); put('cbIc', IC.fishGold); put('wxIc', IC.cloud);
  $('questHead').onclick = () => c.openMissions();
  $('chatLine').onclick = () => c.openChat();

  let lastQuest = '', lastBar = '';
  function setPlayer(p: Player) {
    const L = levelInfo(p.xp);
    $('meName').textContent = p.name; $('lvNum').textContent = String(L.lv);
    $('xpBar').style.width = Math.max(2, Math.round(L.pct * 100)) + '%';
    $('xpTxt').textContent = `${fmt((p.xp || 0) - L.cur)} / ${fmt(L.nxt - L.cur)}`;
    $('meSub').textContent = titleFor(L.lv);
    $('coinTxt').textContent = fmt(p.coins); $('gemTxt').textContent = fmt(p.gems ?? 0);
    const bb = $('basketBadge'); bb.hidden = p.basket.length === 0; bb.textContent = String(p.basket.length);
    // Quest Harian: misi hari ini (yang belum selesai pertama disorot kuning)
    const today = dayKey(Date.now() / 1000);
    const list = p.missions && p.missions.day === today ? p.missions.list : [];
    const qk = JSON.stringify(list);
    if (qk !== lastQuest) {
      lastQuest = qk;
      const firstOpen = list.findIndex(m => m.progress < m.target);
      const show = list.filter(m => !m.claimed).slice(0, 3);
      $('questList').innerHTML = show.length ? show.map(m => {
        const done = m.progress >= m.target, on = list.indexOf(m) === firstOpen;
        return `<button class="qRow ${on ? 'on' : ''} ${done ? 'done' : ''}"><span class="qIc">${done ? IC.check : on ? IC.fishY : IC.radio}</span><span class="qTx">${esc(questText(m))}</span>${done ? '<span class="qGet">Ambil</span>' : `<small>${prog(m)}</small>`}</button>`;
      }).join('') : `<button class="qRow"><span class="qIc">${IC.check}</span><span class="qTx">${list.length ? 'Semua quest hari ini selesai!' : 'Memuat quest…'}</span><small></small></button>`;
      $('questList').querySelectorAll<HTMLElement>('.qRow').forEach(b => b.onclick = () => c.openMissions());
    }
    // hotbar: joran (alat aktif) · 3 umpan · senar · tas
    const owned = (Object.keys(BAITS) as BaitId[]).filter(k => (p.bait[k] ?? 0) > 0);
    const baits = [p.curBait, ...owned.filter(k => k !== p.curBait)].slice(0, 2);
    while (baits.length < 2) { const k = (['cacing', 'udang', 'racik', 'pelet'] as BaitId[]).find(x => !baits.includes(x)); if (!k) break; baits.push(k); }
    const bar = JSON.stringify([p.curRod, p.curLine, baits.map(k => [k, p.bait[k] ?? 0]), p.curBait, p.basket.length]);
    if (bar !== lastBar) {
      lastBar = bar;
      const slot = (cls: string, icon: string, count: string, title: string, data: string) => `<button class="slot ${cls}" title="${esc(title)}" ${data}><span class="si">${icon}</span>${count ? `<b>${count}</b>` : ''}</button>`;
      // urutan seperti gambar konsep: joran · umpan dipakai · pelampung/senar · umpan lain · tas
      const bs = (k: BaitId) => slot(`${k === p.curBait ? 'inuse' : ''} ${(p.bait[k] ?? 0) <= 0 ? 'empty' : ''}`, BAIT_ICON[k] ?? IC.racik, String(p.bait[k] ?? 0), BAITS[k].name + (k === p.curBait ? ' (dipakai)' : ''), `data-b="${k}"`);
      $('hotbar').innerHTML =
        slot('sel', IC.rod, String(p.rods.length), RODS[p.curRod].name, 'data-s="rod"') + bs(baits[0]) +
        slot('', IC.float, String(p.lines.length), 'Senar: ' + LINES[p.curLine].name, 'data-s="line"') + (baits[1] ? bs(baits[1]) : '') +
        slot('', IC.pack, p.basket.length ? String(p.basket.length) : '', 'Tas & keranjang ikan', 'data-s="bag"');
      $('hotbar').querySelectorAll<HTMLElement>('.slot').forEach(b => b.onclick = () => {
        const k = b.dataset.b as BaitId | undefined, s = b.dataset.s;
        if (k) { if ((p.bait[k] ?? 0) > 0 && k !== p.curBait) c.equipBait(k); else c.openBait('umpan'); }
        else if (s === 'rod') c.openBait('joran'); else if (s === 'line') c.openBait('senar'); else c.openBag();
      });
    }
  }

  /** Jam dunia (HH:MM), matahari/bulan, dan ikon cuaca. */
  let lastSky = '';
  function setClock(hour: number, weather: WeatherId) {
    const h = Math.floor(hour), m = Math.floor((hour - h) * 60);
    $('clockTxt').textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const night = hour < 5.6 || hour >= 18.6, key = (night ? 'n' : 'd') + weather;
    if (key !== lastSky) { lastSky = key; $('sunIc').innerHTML = night ? IC.moon : IC.sun; $('wxIc').innerHTML = weather === 'hujan' ? IC.rain : weather === 'kabut' ? IC.fog : IC.cloud; }
  }
  /** Nama lokasi & koordinat (seperti "Danau Serene (132, 76)"). */
  function setPos(loc: string, x: number, z: number) {
    $('locTxt').textContent = LOCATIONS.find(l => l.id === loc)?.name ?? loc;
    $('coordTxt').textContent = `(${Math.round(x + 132)}, ${Math.round(65 - z)})`;
  }
  /** Baris obrolan dunia: pesan terbaru. */
  function chat(m: ChatMsg | undefined) {
    if (!m) return;
    $('chatTick').innerHTML = m.sys ? `<b>[Info]</b> ${esc(m.text)}` : `<b>[${m.ch === 'klub' ? 'Klub' : 'Dunia'}]</b> <em>${esc(m.name)}:</em> ${esc(m.text)}`;
  }
  /** Tombol kecil kiri tombol Tarik: berdiri & jalan (siap) atau angkat kail (menunggu). */
  let subKind = '';
  function setSub(kind: 'walk' | 'reel' | 'off') {
    if (kind === subKind) return; subKind = kind;
    const b = $('subBtn'); b.classList.toggle('off', kind === 'off');
    $('subIc').innerHTML = kind === 'walk' ? IC.walk : IC.cast;
    b.setAttribute('aria-label', kind === 'walk' ? 'Berdiri & jalan' : 'Angkat kail');
  }
  return { setPlayer, setClock, setPos, chat, setSub, get sub() { return subKind; } };
}

/** Potret cadangan (sebelum potret 3D diambil): inisial di atas latar langit-danau. */
export function avatarFallback(name: string) {
  const cv = $('avaCv') as unknown as HTMLCanvasElement, g = cv.getContext('2d')!;
  const gr = g.createLinearGradient(0, 0, 0, cv.height); gr.addColorStop(0, '#8cc4ee'); gr.addColorStop(0.6, '#3d7aa6'); gr.addColorStop(1, '#1f4a66');
  g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = '#fff'; g.font = `800 ${cv.width * 0.4}px system-ui`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText((name.replace(/[^\p{L}\p{N}]/gu, '') || '?').slice(0, 2).toUpperCase(), cv.width / 2, cv.height / 2 + 4);
}

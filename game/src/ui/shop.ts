// Tas & perlengkapan: bilah perbandingan (joran, senar, umpan) dan pratinjau 3D joran yang berputar & melentur.
import * as THREE from 'three';
import { BAITS, RODS, LINES, SPECIES, BASKET_SIZE, BASKET_BIG_SIZE, BASKET_BIG_PRICE, type BaitId, type RodId, type LineId, type Player, type SpeciesId } from '@paunjunan/shared';
import type { Backend } from '../core/backend';
import { Rod } from '../actors/tackle';
import { openSheet, toast, esc } from './hud';
import { sfx } from '../core/audio';

export interface ShopCtx { backend: Backend; player: () => Player; setPlayer: (p: Player) => void; canChangeGear: () => boolean }
export type Tab = 'umpan' | 'joran' | 'senar' | 'alat';

const MAX = { cast: Math.max(...Object.values(RODS).map(r => r.cast)), power: Math.max(...Object.values(RODS).map(r => r.power)), line: Math.max(...Object.values(LINES).map(l => l.strength)) };
const MIN = { cast: Math.min(...Object.values(RODS).map(r => r.cast)) * 0.85, power: 0.8, line: 60 };

/** Bilah: isi = barang ini, penanda = barang yang sedang dipakai. */
function bar(label: string, v: number, lo: number, hi: number, cur?: number, fmt = (x: number) => '×' + x.toFixed(2).replace('.', ',')) {
  const pct = (x: number) => Math.max(3, Math.min(100, ((x - lo) / (hi - lo)) * 100));
  const diff = cur !== undefined && cur !== v ? Math.round((v / cur - 1) * 100) : 0;
  return `<div class="cbar"><span>${label}</span><div class="ctrack"><i style="width:${pct(v)}%"></i>${cur !== undefined ? `<em style="left:${pct(cur)}%"></em>` : ''}</div>
    <b>${fmt(v)}${diff ? ` <small class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '+' : ''}${diff}%</small>` : ''}</b></div>`;
}

/** Pratinjau 3D kecil: renderer terpisah, dibuat saat tab joran dibuka dan dibuang saat ditutup. */
class RodPreview {
  private r: THREE.WebGLRenderer; private scene = new THREE.Scene(); private cam = new THREE.PerspectiveCamera(28, 2.6, 0.05, 50);
  private rod: Rod | null = null; private raf = 0; private t = 0; private color = '';
  constructor(private canvas: HTMLCanvasElement) {
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
    this.r.setPixelRatio(Math.min(2, devicePixelRatio || 1)); this.r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.add(new THREE.HemisphereLight(0xfff2dc, 0x223344, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(2, 3, 4); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffb060, 1.2); rim.position.set(-3, 1, -2); this.scene.add(rim);
    this.cam.position.set(0.25, 0.55, 3.4); this.cam.lookAt(0.25, 0.55, 0);
    this.resize(); this.loop();
  }
  private resize() { const w = this.canvas.clientWidth || 320, h = this.canvas.clientHeight || 130; this.r.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
  show(color: string) {
    if (color === this.color) return; this.color = color;
    if (this.rod) { this.scene.remove(this.rod.group); this.rod.group.traverse(o => { const m = o as THREE.Mesh; m.geometry?.dispose(); }); }
    this.rod = new Rod(color); this.scene.add(this.rod.group);
  }
  private loop = () => {
    this.raf = requestAnimationFrame(this.loop); this.t += 1 / 60;
    if (this.rod) {
      // joran miring memanjang di layar, berputar pelan pada sumbunya & melentur seolah ada ikan
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -1.18 + Math.sin(this.t * 0.6) * 0.05)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.t * 0.5));
      const load = new THREE.Vector3(0, -(0.25 + 0.25 * Math.max(0, Math.sin(this.t * 1.3))), 0);
      this.rod.update(new THREE.Vector3(-1.05, -0.35, 0), q, load, this.t * 6);
    }
    this.r.render(this.scene, this.cam);
  };
  dispose() { cancelAnimationFrame(this.raf); this.r.dispose(); this.r.forceContextLoss(); }
}

export function createShop(c: ShopCtx) {
  let preview: RodPreview | null = null, sel: RodId | null = null;
  const kill = () => { preview?.dispose(); preview = null; };

  function baitCard(k: BaitId, p: Player) {
    const B = BAITS[k], n = p.bait[k] ?? 0;
    const top = B.all ? [] : (Object.entries(B.mul) as [SpeciesId, number][]).sort((a, b) => b[1] - a[1]).slice(0, 4);
    const chips = B.all ? '<span class="fchip all">Semua jenis ikan ×1,0 — tidak ada yang menolak</span>'
      : top.map(([sp, m]) => `<span class="fchip ${m >= 1.3 ? 'hi' : m < 0.8 ? 'lo' : ''}"><i style="width:${Math.min(100, m / 3 * 100)}%"></i>${esc(SPECIES[sp]?.name ?? sp)} ×${m.toFixed(1).replace('.', ',')}</span>`).join('');
    return `<div class="gcard ${p.curBait === k ? 'on' : ''}"><div class="ghead"><span class="gdot" style="background:${B.color}"></span><div class="grow"><b>${esc(B.name)}</b><small>${esc(B.desc)}</small></div>
      <div class="gact">${n > 0 && p.curBait !== k ? `<button class="btn sm" data-use="${k}">Pakai</button>` : p.curBait === k ? '<small class="gon">Dipakai</small>' : ''}<button class="btn gold sm" data-buy="${k}">🪙 ${B.price}</button></div></div>
      <div class="fchips">${chips}</div><small class="gmeta">Punya ${n} · 1 paket = ${B.pack} buah</small></div>`;
  }

  function open(tab: Tab = 'umpan') {
    kill();
    const p = c.player(), R0 = RODS[p.curRod], L0 = LINES[p.curLine];
    const tabs = `<div class="tabs">${(['umpan', 'joran', 'senar', 'alat'] as const).map(t => `<button data-tab="${t}" class="${t === tab ? 'on' : ''}">${t === 'umpan' ? '🦐 Umpan' : t === 'joran' ? '🎣 Joran' : t === 'senar' ? '〰️ Senar' : '🧺 Alat'}</button>`).join('')}</div>`;
    let html = '';
    if (tab === 'umpan') html = (Object.keys(BAITS) as BaitId[]).map(k => baitCard(k, p)).join('');
    if (tab === 'joran') {
      const rods = (Object.keys(RODS) as RodId[]).filter(k => RODS[k].shop !== false || p.rods.includes(k));
      sel = sel && rods.includes(sel) ? sel : p.curRod;
      const S = RODS[sel];
      html = `<div class="rprev"><canvas id="rodCv"></canvas><div class="rinfo"><b>${esc(S.name)}</b><small>${esc(S.desc)}</small>
          ${bar('Lemparan', S.cast, MIN.cast, MAX.cast, sel === p.curRod ? undefined : R0.cast)}${bar('Kekuatan', S.power, MIN.power, MAX.power, sel === p.curRod ? undefined : R0.power)}</div></div>
        <p class="muted" style="font-size:11.5px;margin:6px 0">Ketuk joran untuk melihatnya. Garis putih = joran yang sedang dipakai (${esc(R0.name)}).</p>` +
        rods.map(k => { const R = RODS[k], own = p.rods.includes(k);
          return `<div class="gcard sel ${k === sel ? 'pick' : ''} ${p.curRod === k ? 'on' : ''}" data-sel="${k}"><div class="ghead"><span class="gdot rodc" style="background:${R.color}"></span><div class="grow"><b>${esc(R.name)}</b>
            ${bar('Lempar', R.cast, MIN.cast, MAX.cast, R0.cast)}${bar('Kuat', R.power, MIN.power, MAX.power, R0.power)}</div>
            <div class="gact">${own ? (p.curRod === k ? '<small class="gon">Dipakai</small>' : `<button class="btn sm" data-rod="${k}">Pakai</button>`) : `<button class="btn gold sm" data-buyrod="${k}">🪙 ${R.price.toLocaleString('id-ID')}</button>`}</div></div></div>`; }).join('');
    }
    if (tab === 'senar') html = `<p class="muted" style="font-size:11.5px;margin:6px 0">Kekuatan senar menentukan seberapa tinggi tegangan sebelum putus. Garis putih = senar yang dipakai (${esc(L0.name)}).</p>` +
      (Object.keys(LINES) as LineId[]).map(k => { const L = LINES[k], own = p.lines.includes(k);
        return `<div class="gcard ${p.curLine === k ? 'on' : ''}"><div class="ghead"><span class="gdot line"></span><div class="grow"><b>${esc(L.name)}</b>${bar('Kekuatan', L.strength, MIN.line, MAX.line, L0.strength, x => String(x))}</div>
          <div class="gact">${own ? (p.curLine === k ? '<small class="gon">Dipakai</small>' : `<button class="btn sm" data-line="${k}">Pakai</button>`) : `<button class="btn gold sm" data-buyline="${k}">🪙 ${L.price.toLocaleString('id-ID')}</button>`}</div></div></div>`; }).join('');
    if (tab === 'alat') {
      const own = !!p.bigBasket;
      html = `<div class="gcard ${own ? 'on' : ''}"><div class="ghead"><span class="gdot" style="background:#b98a4a">🧺</span><div class="grow"><b>Keranjang besar</b>
          <small>Keranjang kawat ganda. Muat ${BASKET_BIG_SIZE} ikan (biasa ${BASKET_SIZE}), jadi tidak perlu bolak-balik ke warung untuk menjual. Sekali beli, selamanya.</small>
          ${bar('Kapasitas', BASKET_BIG_SIZE, 0, BASKET_BIG_SIZE, own ? undefined : BASKET_SIZE, x => x + ' ikan')}</div>
        <div class="gact">${own ? '<small class="gon">Dimiliki</small>' : `<button class="btn gold sm" data-buybasket="1">🪙 ${BASKET_BIG_PRICE}</button>`}</div></div>
        <small class="gmeta">Isi sekarang ${p.basket.length}/${own ? BASKET_BIG_SIZE : BASKET_SIZE} ikan</small></div>`;
    }
    openSheet('🎒 Tas & perlengkapan · 🪙 ' + p.coins.toLocaleString('id-ID'), tabs + html, b => {
      b.querySelectorAll<HTMLElement>('[data-tab]').forEach(x => x.onclick = () => open(x.dataset.tab as Tab));
      const run = async (fn: () => Promise<{ player: Player }>, ok: string) => { try { const r = await fn(); c.setPlayer(r.player); toast(ok); sfx.click(); open(tab); } catch (e) { toast((e as Error).message); } };
      const gear = (f: () => void) => { if (c.canChangeGear()) f(); };
      b.querySelectorAll<HTMLElement>('[data-buy]').forEach(x => x.onclick = (e) => { e.stopPropagation(); run(() => c.backend.buyBait(x.dataset.buy as BaitId), 'Umpan dibeli.'); });
      b.querySelectorAll<HTMLElement>('[data-use]').forEach(x => x.onclick = (e) => { e.stopPropagation(); gear(() => run(() => c.backend.equip({ bait: x.dataset.use as BaitId }), 'Umpan diganti.')); });
      b.querySelectorAll<HTMLElement>('[data-rod]').forEach(x => x.onclick = (e) => { e.stopPropagation(); gear(() => run(() => c.backend.equip({ rod: x.dataset.rod as RodId }), 'Joran diganti.')); });
      b.querySelectorAll<HTMLElement>('[data-line]').forEach(x => x.onclick = (e) => { e.stopPropagation(); gear(() => run(() => c.backend.equip({ line: x.dataset.line as LineId }), 'Senar diganti.')); });
      b.querySelectorAll<HTMLElement>('[data-buyrod]').forEach(x => x.onclick = (e) => { e.stopPropagation(); gear(() => run(() => c.backend.buyGear({ rod: x.dataset.buyrod as RodId }), 'Joran dibeli dan dipakai.')); });
      b.querySelectorAll<HTMLElement>('[data-buyline]').forEach(x => x.onclick = (e) => { e.stopPropagation(); gear(() => run(() => c.backend.buyGear({ line: x.dataset.buyline as LineId }), 'Senar dibeli dan dipakai.')); });
      b.querySelector<HTMLElement>('[data-buybasket]')?.addEventListener('click', () => run(() => c.backend.buyBigBasket(), `Keranjang besar dipakai: muat ${BASKET_BIG_SIZE} ikan.`));
      b.querySelectorAll<HTMLElement>('[data-sel]').forEach(x => x.onclick = () => { sel = x.dataset.sel as RodId; open('joran'); });
      const cv = b.querySelector('#rodCv') as HTMLCanvasElement | null;
      if (cv && sel) { try { preview = new RodPreview(cv); preview.show(RODS[sel].color); } catch { cv.replaceWith(Object.assign(document.createElement('div'), { className: 'rnocv', textContent: '🎣' })); } }
    }, kill);
  }
  return { open };
}

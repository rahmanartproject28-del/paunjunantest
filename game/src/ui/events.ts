// Acara musiman: pita di HUD (hitung mundur) + layar acara dengan papan khusus.
import { SPECIES, type GameEvent } from '@paunjunan/shared';
import type { Backend } from '../core/backend';
import { $, openSheet, esc, fmtKg } from './hud';

const left = (t: number) => { const s = Math.max(0, t - Date.now() / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60); return d ? `${d} hari ${h} jam` : h ? `${h} jam ${m} mnt` : `${m} mnt`; };

export function createEvents(be: Backend) {
  let ev: GameEvent | null = null, timer = 0;
  const rib = $('eventRibbon');
  function paint() {
    if (!ev || ev.endsAt < Date.now() / 1000) { rib.hidden = true; ev = null; return; }
    rib.hidden = false;
    rib.innerHTML = `<span class="evi">${esc(ev.icon)}</span><b>${esc(ev.name)}</b><small>berakhir ${left(ev.endsAt)}</small>`;
  }
  function set(e: GameEvent | null | undefined) { ev = e ?? null; paint(); clearInterval(timer); if (ev) timer = window.setInterval(paint, 30000); }
  async function open() {
    const r = await be.eventBoard().catch(() => null), e = r?.event ?? ev;
    if (!e) { openSheet('🎉 Acara', '<p class="muted">Belum ada acara. Pantau pengumuman untuk acara berikutnya!</p>'); return; }
    const bonus = [e.species && e.rateMul !== 1 ? `Peluang ${esc(SPECIES[e.species]?.name ?? e.species)} ×${e.rateMul}` : '', e.xpMul !== 1 ? `XP ×${e.xpMul}` : '', e.priceMul !== 1 ? `Harga jual ×${e.priceMul}` : ''].filter(Boolean);
    openSheet(`${e.icon} ${e.name}`, `<div class="evhead"><p>${esc(e.desc)}</p><div class="evtags">${bonus.map(b => `<span>${b}</span>`).join('')}</div>
      <small>${r?.active ? 'Berakhir dalam ' + left(e.endsAt) : 'Acara sudah selesai'} · ${new Date(e.startsAt * 1000).toLocaleDateString('id-ID')} – ${new Date(e.endsAt * 1000).toLocaleDateString('id-ID')}</small></div>
      <p style="margin:12px 0 6px;font-weight:800">🏆 Papan acara · ${e.species ? esc(SPECIES[e.species]?.name ?? '') + ' terberat' : 'ikan terberat'}</p>
      <div class="list">${r?.rows.length ? r.rows.map((x, i) => `<div class="item"><span class="rank r${i + 1}">${i + 1}</span><div><b>${esc(x.name)}</b><small>${esc(SPECIES[x.species]?.name ?? x.species)}</small></div><b>${fmtKg(x.weight)}</b></div>`).join('') : '<p class="muted">Belum ada tangkapan. Jadilah yang pertama!</p>'}</div>`);
  }
  rib.onclick = open;
  return { set, open, get current() { return ev; } };
}

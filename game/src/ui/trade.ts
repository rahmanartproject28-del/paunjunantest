// Layar "Tukar antarpemain": tukar umpan / joran / senar, atau jual-beli langsung dengan koin.
// Barang yang Anda tawarkan langsung ditahan sampai lawan menjawab (aman dari tipu: tidak bisa "kabur" setelah barang diterima).
import {
  BAITS, RODS, LINES, TRADE_FEE, TRADE_MIN_LV, emptySide, sideEmpty, sideText, sideValue, afterFee, levelInfo,
  type Player, type Trade, type TradeSide, type BaitId, type RodId, type LineId, type Delivery,
} from '@paunjunan/shared';
import type { Backend, TradeInv, TradePartner } from '../core/backend';
import { openSheet, toast, esc } from './hud';
import { store } from '../core/store';

export interface TradeCtx {
  backend: Backend; player: () => Player; setPlayer: (p: Player) => void;
  /** pemain yang bisa diajak tukar: pemain daring di sekitar (server) atau pedagang simulasi (mode lokal) */
  partners: () => TradePartner[];
  /** jumlah penawaran masuk berubah (lencana di tombol) */
  onCount?: (n: number) => void;
}
const err = (e: unknown) => toast((e as Error).message, 3500);
const BAIT_ICON = '🪱', ROD_ICON = '🎣', LINE_ICON = '〰️';
const WHY: Record<Delivery['why'], string> = { tukar: 'hasil tukar dari', ditolak: 'titipan kembali — ditolak', kedaluwarsa: 'titipan kembali — tidak dijawab', pasar: 'hasil jual lapak ke' };

/** Pemain yang pernah diajak tukar (disimpan di HP) supaya bisa ditawari lagi walau tidak di ruang yang sama. */
function recent(): TradePartner[] { return store.get<TradePartner[]>('tradeRecent', []); }
function remember(p: TradePartner) { store.set('tradeRecent', [p, ...recent().filter(x => x.id !== p.id)].slice(0, 8)); }

function sideHtml(s: TradeSide) {
  const chips: string[] = [];
  if (s.coins) chips.push(`<span class="tchip gold">🪙 ${s.coins.toLocaleString('id-ID')}</span>`);
  for (const [k, n] of Object.entries(s.bait)) if (n) chips.push(`<span class="tchip">${BAIT_ICON} ${n}× ${esc(BAITS[k as BaitId].name)}</span>`);
  for (const r of s.rods) chips.push(`<span class="tchip">${ROD_ICON} ${esc(RODS[r].name)}</span>`);
  for (const l of s.lines) chips.push(`<span class="tchip">${LINE_ICON} ${esc(LINES[l].name)}</span>`);
  return chips.join('') || '<span class="tchip dim">—</span>';
}

export function createTradeUI(c: TradeCtx) {
  let tab: 'masuk' | 'buat' = 'masuk';
  // draf penawaran yang sedang dibuat
  let partner: TradePartner | null = null, inv: TradeInv | null = null;
  let give: TradeSide = emptySide(), want: TradeSide = emptySide(), note = '';

  async function open(t: typeof tab = tab) {
    tab = t;
    if (tab === 'buat') return partner ? builder() : pickPartner();
    let b: Awaited<ReturnType<Backend['tradeBoard']>>;
    try { b = await c.backend.tradeBoard(); } catch (e) { err(e); return; }
    c.setPlayer(b.player); c.onCount?.(b.incoming.length);
    for (const g of b.got) toast(`📦 ${sideText(g.side)} masuk tas (${WHY[g.why]} ${g.fromName}).`, 4000);
    const card = (x: Trade, inc: boolean) => {
      const left = Math.max(0, Math.round((x.at + 86400 - Date.now() / 1000) / 3600));
      const gv = sideValue(x.give), wv = sideValue(x.want);
      return `<div class="tcard">
        <div class="tHead"><b>${inc ? '📩 Dari ' + esc(x.fromName) : '📤 Ke ' + esc(x.toName)}</b><small>sisa ${left} jam</small></div>
        ${x.note ? `<p class="tnote">“${esc(x.note)}”</p>` : ''}
        <div class="tgrid"><div><small>${inc ? 'Anda dapat' : 'Anda beri (ditahan)'}</small>${sideHtml(inc ? x.give : x.give)}</div><div class="tarrow">⇄</div><div><small>${inc ? 'Anda beri' : 'Anda minta'}</small>${sideHtml(x.want)}</div></div>
        <small class="tval">Perkiraan harga toko: ${inc ? `dapat ±${gv.toLocaleString('id-ID')} · beri ±${wv.toLocaleString('id-ID')}` : `beri ±${gv.toLocaleString('id-ID')} · minta ±${wv.toLocaleString('id-ID')}`}${(inc ? x.give : x.want).coins ? ` · koin diterima setelah potongan ${Math.round(TRADE_FEE * 100)}%: ${afterFee((inc ? x.give : x.want).coins).toLocaleString('id-ID')}` : ''}</small>
        <div class="row" style="margin-top:8px">${inc ? `<button class="btn gold sm" data-acc="${x.id}">Terima</button><button class="btn ghost sm" data-dec="${x.id}">Tolak</button>` : `<button class="btn ghost sm" data-can="${x.id}">Batalkan & ambil kembali</button>`}</div>
      </div>`;
    };
    const html = tabs() + `
      <p class="tsec">Penawaran masuk (${b.incoming.length})</p>${b.incoming.length ? b.incoming.map(x => card(x, true)).join('') : '<p class="tdim">Belum ada. Pemain lain bisa menawari Anda umpan, joran, atau koin.</p>'}
      <p class="tsec">Penawaran saya (${b.outgoing.length})</p>${b.outgoing.length ? b.outgoing.map(x => card(x, false)).join('') : '<p class="tdim">Belum ada. Ketuk “Buat penawaran”.</p>'}
      <p class="tdim" style="font-size:11px">Barang yang Anda tawarkan ditahan sampai dijawab; kalau ditolak, dibatalkan, atau tidak dijawab 24 jam, semuanya kembali utuh. Koin yang diterima lewat tukar dipotong ${Math.round(TRADE_FEE * 100)}%. Hati-hati dengan tawaran jual-beli koin di luar game: tidak dilindungi.</p>`;
    openSheet('🔁 Tukar antarpemain · ' + c.player().coins.toLocaleString('id-ID') + ' koin', html, body => {
      bindTabs(body);
      const run = async (fn: () => Promise<{ player: Player }>, msg: string) => { try { const r = await fn(); c.setPlayer(r.player); toast(msg); open('masuk'); } catch (e) { err(e); } };
      body.querySelectorAll<HTMLElement>('[data-acc]').forEach(x => x.onclick = () => run(() => c.backend.acceptTrade(x.dataset.acc!), 'Tukar berhasil! Barang masuk tas.'));
      body.querySelectorAll<HTMLElement>('[data-dec]').forEach(x => x.onclick = () => run(() => c.backend.declineTrade(x.dataset.dec!), 'Penawaran ditolak.'));
      body.querySelectorAll<HTMLElement>('[data-can]').forEach(x => x.onclick = () => run(() => c.backend.cancelTrade(x.dataset.can!), 'Dibatalkan. Barang kembali ke tas.'));
    });
  }
  function tabs() { return `<div class="tabs"><button data-tt="masuk" class="${tab === 'masuk' ? 'on' : ''}">Penawaran</button><button data-tt="buat" class="${tab === 'buat' ? 'on' : ''}">Buat penawaran</button></div>`; }
  function bindTabs(body: HTMLElement) { body.querySelectorAll<HTMLElement>('[data-tt]').forEach(x => x.onclick = () => open(x.dataset.tt as typeof tab)); }

  // ---------- 1) pilih pemain ----------
  function pickPartner() {
    const me = c.player(), lv = levelInfo(me.xp).lv;
    const near = c.partners().filter(p => p.id !== me.id), rec = recent().filter(r => r.id !== me.id && !near.some(n => n.id === r.id));
    const row = (p: TradePartner, tag: string) => `<div class="item"><span class="icn">${p.npc ? '🧑‍🌾' : '🎣'}</span><div><b>${esc(p.name)}</b><small>${tag}${p.lv ? ' · Lv ' + p.lv : ''}</small></div><button class="btn gold sm" data-pp="${esc(p.id)}" data-pn="${esc(p.name)}">Tawari</button></div>`;
    const html = tabs() + (lv < TRADE_MIN_LV ? `<p class="tdim">🔒 Tukar antarpemain terbuka di level ${TRADE_MIN_LV} (Anda Lv ${lv}). Memancing beberapa ikan dulu, ya.</p>` : '') +
      `<p class="tsec">Pemain di sekitar</p><div class="list">${near.length ? near.map(p => row(p, p.npc ? 'Pedagang (uji mode lokal)' : 'Sedang daring')).join('') : '<p class="tdim">Belum ada pemain lain di ruang ini.</p>'}</div>` +
      (rec.length ? `<p class="tsec">Pernah bertukar</p><div class="list">${rec.map(p => row(p, 'Terakhir')).join('')}</div>` : '');
    openSheet('🔁 Pilih pemain', html, body => {
      bindTabs(body);
      body.querySelectorAll<HTMLElement>('[data-pp]').forEach(x => x.onclick = async () => {
        try { inv = await c.backend.tradeInventory(x.dataset.pp!); } catch (e) { err(e); return; }
        partner = { id: inv.id, name: inv.name, lv: inv.lv, npc: x.dataset.pp!.startsWith('npct_') };
        give = emptySide(); want = emptySide(); note = ''; builder();
      });
    });
  }

  // ---------- 2) susun penawaran ----------
  function builder() {
    if (!partner || !inv) return pickPartner();
    const me = c.player();
    const myRods = me.rods.filter(r => r !== 'pemula' && r !== me.curRod), myLines = me.lines.filter(l => l !== 'l20' && l !== me.curLine);
    const myBait = (Object.keys(BAITS) as BaitId[]).filter(k => (me.bait[k] ?? 0) > 0), theirBait = (Object.keys(BAITS) as BaitId[]).filter(k => (inv!.bait[k] ?? 0) > 0);
    const col = (who: 'give' | 'want') => {
      const S = who === 'give' ? give : want, rods = who === 'give' ? myRods : inv!.rods.filter(r => !me.rods.includes(r)), lines = who === 'give' ? myLines : inv!.lines.filter(l => !me.lines.includes(l));
      const baits = who === 'give' ? myBait : theirBait, has = (k: BaitId) => who === 'give' ? me.bait[k] ?? 0 : inv!.bait[k] ?? 0;
      const other = who === 'give' ? want : give;
      return `<div class="tcol"><p class="tsec">${who === 'give' ? 'Anda beri' : 'Anda minta dari ' + esc(partner!.name)}</p>
        <label class="trow"><span>🪙 Koin${who === 'give' ? ` <small>(punya ${me.coins.toLocaleString('id-ID')})</small>` : ''}</span><input class="sel" type="number" min="0" inputmode="numeric" data-coin="${who}" value="${S.coins || ''}" placeholder="0" ${other.coins ? 'disabled title="Koin hanya di satu sisi"' : ''}></label>
        ${baits.map(k => `<label class="trow"><span>${BAIT_ICON} ${esc(BAITS[k].name)} <small>(${has(k)})</small></span><input class="sel" type="number" min="0" max="${has(k)}" inputmode="numeric" data-bait="${who}:${k}" value="${S.bait[k] || ''}" placeholder="0"></label>`).join('')}
        ${rods.map(r => `<label class="trow chk"><span>${ROD_ICON} ${esc(RODS[r].name)} <small>±${RODS[r].price}</small></span><input type="checkbox" data-rod="${who}:${r}" ${S.rods.includes(r) ? 'checked' : ''}></label>`).join('')}
        ${lines.map(l => `<label class="trow chk"><span>${LINE_ICON} ${esc(LINES[l].name)} <small>±${LINES[l].price}</small></span><input type="checkbox" data-line="${who}:${l}" ${S.lines.includes(l) ? 'checked' : ''}></label>`).join('')}
        ${!baits.length && !rods.length && !lines.length ? `<p class="tdim">${who === 'give' ? 'Tidak ada barang yang bisa ditukar (joran/senar yang dipakai & barang bawaan tidak bisa).' : 'Pemain ini tidak punya barang yang bisa Anda terima.'}</p>` : ''}
      </div>`;
    };
    const gv = sideValue(give), wv = sideValue(want);
    const html = tabs() + `<div class="item" style="margin:6px 0"><span class="icn">${partner.npc ? '🧑‍🌾' : '🎣'}</span><div><b>${esc(partner.name)}</b><small>Lv ${partner.lv ?? '?'}</small></div><button class="btn ghost sm" id="tChg">Ganti</button></div>
      <div class="tbuild">${col('give')}${col('want')}</div>
      <input class="sel" id="tNote" maxlength="60" placeholder="Pesan singkat (opsional)" value="${esc(note)}" style="width:100%;margin-top:8px">
      <div class="tsum"><b>Ringkasan</b><small>Beri: ${esc(sideText(give))}</small><small>Minta: ${esc(sideText(want))}</small>
        <small>Perkiraan harga toko: beri ±${gv.toLocaleString('id-ID')} · minta ±${wv.toLocaleString('id-ID')}${want.coins ? ` · Anda terima ${afterFee(want.coins).toLocaleString('id-ID')} koin (potongan ${Math.round(TRADE_FEE * 100)}%)` : ''}</small></div>
      <div class="row" style="margin-top:8px"><button class="btn gold" id="tSend" ${sideEmpty(give) ? 'disabled' : ''}>Kirim penawaran</button></div>
      <p class="tdim" style="font-size:11px">Contoh: beri 20 umpan Udang, minta Joran Karbon · atau jual: beri Joran Tegar, minta 800 koin · atau beli: beri 300 koin, minta 30 umpan Cumi.</p>`;
    openSheet('🔁 Buat penawaran', html, body => {
      bindTabs(body);
      body.querySelector<HTMLElement>('#tChg')!.onclick = () => { partner = null; inv = null; pickPartner(); };
      const num = (v: string, max = 1e9) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));
      body.querySelectorAll<HTMLInputElement>('[data-coin]').forEach(i => i.onchange = () => { const S = i.dataset.coin === 'give' ? give : want; S.coins = num(i.value, i.dataset.coin === 'give' ? me.coins : 1e6); builder(); });
      body.querySelectorAll<HTMLInputElement>('[data-bait]').forEach(i => i.onchange = () => { const [w, k] = i.dataset.bait!.split(':'), S = w === 'give' ? give : want, n = num(i.value, Number(i.max) || 999); if (n) S.bait[k as BaitId] = n; else delete S.bait[k as BaitId]; builder(); });
      body.querySelectorAll<HTMLInputElement>('[data-rod]').forEach(i => i.onchange = () => { const [w, k] = i.dataset.rod!.split(':'), S = w === 'give' ? give : want; S.rods = i.checked ? [...S.rods, k as RodId] : S.rods.filter(x => x !== k); builder(); });
      body.querySelectorAll<HTMLInputElement>('[data-line]').forEach(i => i.onchange = () => { const [w, k] = i.dataset.line!.split(':'), S = w === 'give' ? give : want; S.lines = i.checked ? [...S.lines, k as LineId] : S.lines.filter(x => x !== k); builder(); });
      const ni = body.querySelector<HTMLInputElement>('#tNote')!; ni.oninput = () => { note = ni.value; };
      body.querySelector<HTMLElement>('#tSend')!.onclick = async () => {
        try {
          const r = await c.backend.proposeTrade({ to: partner!.id, give, want, note });
          c.setPlayer(r.player); remember(partner!); toast(`Penawaran terkirim ke ${partner!.name}. Barang Anda ditahan sampai dijawab.`, 3500);
          give = emptySide(); want = emptySide(); note = ''; open('masuk');
        } catch (e) { err(e); }
      };
      body.querySelectorAll('input').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('keyup', e => e.stopPropagation()); });
    });
  }
  /** Langsung ke susun penawaran untuk pemain tertentu (mis. dari daftar pemain / obrolan). */
  async function offerTo(p: TradePartner) {
    try { inv = await c.backend.tradeInventory(p.id); } catch (e) { err(e); return; }
    partner = { ...p, lv: inv.lv }; give = emptySide(); want = emptySide(); note = ''; tab = 'buat'; builder();
  }
  return { open, offerTo };
}

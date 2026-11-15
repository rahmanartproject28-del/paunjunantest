// Layar Fase 3 & 4: Karakter, Turnamen, Akuarium, Pasar antarpemain, Klub, dan pusat "Sosial".
import {
  COSMETICS, COS_TABS, AVATARS, DEFAULT_LOOK, lookCost, lookOf, cosItem, SPECIES, RODS, LINES, MARKET_FEE, MARKET_MIN,
  COIN_PACKS, AQ_BIG_PRICE, BAITS, MARKET_MAX_BAIT, type BaitId, aqVisitBonus, aqValue, CLUB_ICONS, CLUB_PRICE, itemName, type Look, type Player, type CatchRec, type RodId, type LineId,
} from '@paunjunan/shared';
import type { Backend } from '../core/backend';
import type { Angler } from '../actors/angler';
import { openSheet, closeSheet, toast, esc, fmtKg } from './hud';
import { nativeStore, buyPack, finishPack, storePrices } from '../core/purchase';

export interface SocialCtx {
  backend: Backend; angler: Angler;
  player: () => Player; setPlayer: (p: Player) => void;
  canEdit: () => boolean; showcase: (on: boolean) => void; confetti: () => void;
  /** tampilkan akuarium 3D (kamera ke tangki) — null bila tidak tersedia */
  aquarium3d?: (on: boolean, fish: CatchRec[]) => void;
  /** buka layar tukar antarpemain */
  openTrade?: () => void;
}
const fmtT = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return h > 24 ? Math.floor(h / 24) + ' hari ' + (h % 24) + ' jam' : h + ' jam ' + m + ' mnt'; };
const err = (e: unknown) => toast((e as Error).message, 3500);

export function createSocialUI(c: SocialCtx) {
  // ---------------- Karakter ----------------
  function openCharacter(tab: string = 'avatar', draft?: Look) {
    if (!c.canEdit()) { toast('Ganti karakter saat tidak sedang melempar atau adu tarik.'); return; }
    const p = c.player(), saved = lookOf(p), d: Look = draft ?? { ...saved };
    c.showcase(true); c.angler.applyLook(d);
    const cost = lookCost(p, d);
    const tabs = `<div class="tabs" style="flex-wrap:wrap">${[{ id: 'avatar', name: 'Avatar' }, ...COS_TABS].map(t => `<button data-tab="${t.id}" class="${t.id === tab ? 'on' : ''}">${t.name}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'avatar') body = '<div class="list">' + AVATARS.map((a, i) => `<div class="item"><span class="icn">🧑</span><div><b>${esc(a.name)}</b><small>${Object.entries(a.look).map(([k, v]) => cosItem(k as keyof Look, v as string)?.name).join(' · ')}</small></div><button class="btn" data-av="${i}">Coba</button></div>`).join('') + '</div>';
    else {
      const T = COS_TABS.find(t => t.id === tab)!;
      const labels: Record<string, string> = { skin: 'Warna kulit', body: 'Bentuk badan', face: 'Wajah', glasses: 'Kacamata', hat: 'Topi', hatColor: 'Warna topi', shirt: 'Jenis baju memancing', shirtColor: 'Warna baju', accent: 'Warna aksen (panel jersey, rompi, list jaket, buff)', neck: 'Leher', pants: 'Jenis celana', pantsColor: 'Warna celana', shoes: 'Alas kaki', bag: 'Tas punggung' };
      const ICON: Record<string, string> = { 'shirt:kemeja': '👔', 'shirt:jersey': '🎽', 'shirt:kamo': '🌿', 'shirt:vent': '👕', 'shirt:rompi': '🦺', 'shirt:jaket': '🧥', 'neck:tanpa': '⭕', 'neck:buff': '🧣', 'pants:panjang': '👖', 'pants:kargo': '🎒', 'hat:tanpa': '⭕', 'hat:pet': '🧢', 'hat:kupluk': '🎿', 'hat:rimba': '🤠', 'hat:caping': '👒', 'glasses:tanpa': '⭕', 'glasses:hitam': '🕶️', 'glasses:baca': '👓', 'face:polos': '🙂', 'face:jenggot': '🧔', 'body:sedang': '🧍', 'body:kurus': '🧍', 'body:gempal': '🧍', 'shirt:hoodie': '🧥', 'bag:tanpa': '⭕', 'bag:ransel': '🎒' };
      body = T.slots.map(slot => `<p style="margin:10px 0 4px;font-weight:800">${labels[slot] ?? slot}</p><div class="cosGrid">` + COSMETICS[slot].map(it => {
        const own = it.price === 0 || (p.owned ?? []).includes(slot + ':' + it.id);
        return `<button class="cos ${d[slot] === it.id ? 'on' : ''}" data-slot="${slot}" data-id="${it.id}">${it.color ? `<i style="background:${it.color}"></i>` : ICON[slot + ':' + it.id] ? `<span class="cico">${ICON[slot + ':' + it.id]}</span>` : ''}<b>${esc(it.name)}</b><small>${own ? (it.price ? 'Dimiliki' : 'Gratis') : it.price + ' koin'}</small></button>`;
      }).join('') + '</div>').join('');
    }
    openSheet('👕 Karakter', tabs + body + `<div class="row" style="margin-top:12px;position:sticky;bottom:0;background:#0d131b;padding-top:8px">
      <button class="btn ghost" id="chReset">Batal</button><button class="btn gold" id="chSave">${cost ? 'Beli & pakai · ' + cost + ' koin' : 'Simpan'}</button></div>
      <p style="color:var(--dim);font-size:11px">Koin Anda: ${p.coins.toLocaleString('id-ID')}. Barang yang sudah dibeli bisa dipakai lagi kapan saja.</p>`, b => {
      b.querySelectorAll<HTMLElement>('[data-tab]').forEach(x => x.onclick = () => openCharacter(x.dataset.tab!, d));
      b.querySelectorAll<HTMLElement>('[data-av]').forEach(x => x.onclick = () => openCharacter(tab, { ...DEFAULT_LOOK, ...AVATARS[Number(x.dataset.av)].look }));
      b.querySelectorAll<HTMLElement>('[data-slot]').forEach(x => x.onclick = () => { (d as unknown as Record<string, string>)[x.dataset.slot!] = x.dataset.id!; openCharacter(tab, d); });
      b.querySelector<HTMLElement>('#chReset')!.onclick = () => closeSheet();
      b.querySelector<HTMLElement>('#chSave')!.onclick = async () => {
        try { const r = await c.backend.setLook(d); c.setPlayer(r.player); toast(r.spent ? `Dibeli (${r.spent} koin) dan dipakai.` : 'Tampilan disimpan.'); saveOk = true; closeSheet(); } catch (e) { err(e); }
      };
    }, () => { c.showcase(false); if (!saveOk) c.angler.applyLook(lookOf(c.player())); saveOk = false; });
  }
  let saveOk = false;

  // ---------------- Turnamen ----------------
  async function openTournaments() {
    openSheet('🏆 Turnamen', '<p style="color:var(--dim)">Memuat…</p>');
    try {
      const cl = await c.backend.claimTournaments();
      if (cl.rewards.length) { c.setPlayer(cl.player); c.confetti(); toast(cl.rewards.map(r => `${r.name}: ${r.rank <= 3 ? 'Juara ' + r.rank : 'ikut serta'} +${r.coins} koin`).join(' · '), 6000); }
      const list = await c.backend.tournaments();
      openSheet('🏆 Turnamen', list.map(t => `<div class="tour">
        <div class="tHead"><b>${esc(t.name)}</b><small>Berakhir dalam ${fmtT(t.endsIn)} · ${t.entrants} peserta</small></div>
        <p>${esc(t.desc)} Hadiah: 🥇${t.prizes[0]} 🥈${t.prizes[1]} 🥉${t.prizes[2]} koin · peserta yang dapat ikan +30.</p>
        ${t.joined ? `<p class="mine">Anda terdaftar · terbaik ${t.myBest ? fmtKg(t.myBest) : 'belum ada'}${t.myRank ? ' · peringkat ' + t.myRank : ''}</p>` : `<button class="btn gold" data-join="${t.kind}">Daftar${t.join ? ' · ' + t.join + ' koin' : ' gratis'}</button>`}
        <div class="list">${t.top.length ? t.top.map((r, i) => `<div class="item"><span class="rank r${i + 1}">${i + 1}</span><div><b>${esc(r.name)}</b><small>${r.species ? SPECIES[r.species].name : ''}</small></div><b>${fmtKg(r.best)}</b></div>`).join('') : '<p style="color:var(--dim);margin:0">Belum ada tangkapan. Jadilah yang pertama!</p>'}</div></div>`).join('') +
        '<p style="color:var(--dim);font-size:11px">Hanya tangkapan setelah mendaftar yang dihitung. Hadiah otomatis masuk saat Anda membuka layar ini setelah turnamen selesai.</p>', b => {
        b.querySelectorAll<HTMLElement>('[data-join]').forEach(x => x.onclick = async () => { try { const r = await c.backend.joinTournament(x.dataset.join as 'harian'); c.setPlayer(r.player); toast('Terdaftar! Semoga strike.'); openTournaments(); } catch (e) { err(e); } });
      });
    } catch (e) { err(e); }
  }

  // ---------------- Akuarium ----------------
  let aqRaf = 0;
  function drawAquarium(cv: HTMLCanvasElement, fish: CatchRec[]) {
    const g = cv.getContext('2d')!, W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = W * dpr; cv.height = H * dpr;
    const sw = fish.map((f, i) => ({ f, x: Math.random() * W, y: 30 + Math.random() * (H - 70), v: (0.4 + Math.random() * 0.5) * (i % 2 ? 1 : -1), ph: Math.random() * 6, s: 14 + Math.min(40, Math.cbrt(f.weight) * 18) }));
    const bubbles = Array.from({ length: 14 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 3 }));
    const step = (t: number) => {
      if (!cv.isConnected) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1d6f8a'); bg.addColorStop(1, '#0b2f3d'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.fillStyle = '#c9b27a'; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 20) g.lineTo(x, H - 16 - Math.sin(x * 0.05) * 5); g.lineTo(W, H); g.fill();
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) * W / 6; g.strokeStyle = '#2f7a3a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, H - 14); for (let y = 0; y < 60; y += 6) g.lineTo(x + Math.sin(t / 700 + y * 0.1 + i) * 6, H - 14 - y); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.35)'; for (const b of bubbles) { b.y -= 0.5; if (b.y < 0) { b.y = H; b.x = Math.random() * W; } g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill(); }
      for (const s of sw) {
        s.x += s.v; if (s.x < -s.s) s.x = W + s.s; if (s.x > W + s.s) s.x = -s.s;
        const L = SPECIES[s.f.species].look, y = s.y + Math.sin(t / 900 + s.ph) * 6, dir = Math.sign(s.v), len = s.s * L.stretch, hh = s.s * 0.42 * L.height, wag = Math.sin(t / 150 + s.ph) * 0.25;
        g.save(); g.translate(s.x, y); g.scale(dir, 1);
        const grd = g.createLinearGradient(0, -hh, 0, hh); grd.addColorStop(0, L.back); grd.addColorStop(0.5, L.side); grd.addColorStop(1, L.belly);
        g.fillStyle = grd; g.beginPath(); g.ellipse(0, 0, len, hh, 0, 0, 7); g.fill();
        g.fillStyle = L.fin; g.beginPath(); g.moveTo(-len * 0.9, 0); g.lineTo(-len * 1.45, -hh * (0.9 + wag)); g.lineTo(-len * 1.45, hh * (0.9 - wag)); g.fill();
        g.beginPath(); g.moveTo(-len * 0.2, -hh * 0.9); g.lineTo(len * 0.25, -hh * 1.35); g.lineTo(len * 0.4, -hh * 0.85); g.fill();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(len * 0.62, -hh * 0.2, Math.max(1.5, hh * 0.16), 0, 7); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(len * 0.65, -hh * 0.2, Math.max(1, hh * 0.08), 0, 7); g.fill();
        g.restore();
      }
      if (!fish.length) { g.fillStyle = 'rgba(255,255,255,.8)'; g.font = '14px system-ui'; g.textAlign = 'center'; g.fillText('Akuarium kosong. Pindahkan ikan dari keranjang 🐠', W / 2, H / 2); }
      aqRaf = requestAnimationFrame(step);
    };
    cancelAnimationFrame(aqRaf); aqRaf = requestAnimationFrame(step);
  }
  function openAquarium() {
    const p = c.player(), fish = p.aquarium ?? [], cap = p.aqBig ? 12 : 6;
    const wait = Math.max(0, (p.aqClaimAt ?? 0) + 20 * 3600 - Date.now() / 1000);
    const three = !!c.aquarium3d; c.aquarium3d?.(true, fish);
    openSheet(`🐠 Akuarium (${fish.length}/${cap})`, `${three ? '<p style="color:var(--dim);font-size:12px;margin:2px 0">Akuarium Anda ada di halaman depan, dekat loket. Geser lembar ini ke bawah untuk melihat lebih luas.</p>' : '<canvas class="aqCv" id="aqCv"></canvas>'}
      <div class="row" style="margin-top:8px"><button class="btn gold" id="aqVisit" ${fish.length && !wait ? '' : 'disabled'}>${wait ? 'Pengunjung lagi ' + fmtT(wait) : 'Tiket pengunjung · +' + aqVisitBonus(fish) + ' koin'}</button>${p.aqBig ? '' : `<button class="btn" id="aqBig">Akuarium besar · ${AQ_BIG_PRICE}</button>`}</div>
      <p style="color:var(--dim);font-size:12px;margin:6px 0">Nilai koleksi: ${aqValue(fish).toLocaleString('id-ID')} koin. Ikan monster & besar mendatangkan lebih banyak pengunjung.</p>
      <div class="list">${fish.map(f => `<div class="item"><span class="icn">🐟</span><div><b>${esc(f.name)} · ${fmtKg(f.weight)}</b><small>${'★'.repeat(f.stars)} · ${f.value} koin</small></div><div style="display:grid;gap:4px"><button class="btn" data-lepas="${f.id}">Lepas</button><button class="btn" data-jual="${f.id}">Jual</button></div></div>`).join('')}</div>
      ${p.basket.length ? `<p style="margin:10px 0 4px;font-weight:800">Dari keranjang</p><div class="list">${p.basket.map(f => `<div class="item"><span class="icn">🧺</span><div><b>${esc(f.name)} · ${fmtKg(f.weight)}</b><small>${'★'.repeat(f.stars)}</small></div><button class="btn gold" data-add="${f.id}" ${fish.length >= cap ? 'disabled' : ''}>Masukkan</button></div>`).join('')}</div>` : ''}`, b => {
      const cv = b.querySelector('#aqCv') as HTMLCanvasElement | null; if (cv) drawAquarium(cv, fish);
      const run = async (fn: () => Promise<{ player: Player; coins?: number }>, msg: string) => { try { const r = await fn(); c.setPlayer(r.player); toast(r.coins ? msg + ' +' + r.coins + ' koin' : msg); openAquarium(); } catch (e) { err(e); } };
      b.querySelector<HTMLElement>('#aqVisit')!.onclick = () => run(() => c.backend.claimVisitors(), 'Pengunjung datang!');
      b.querySelector<HTMLElement>('#aqBig')?.addEventListener('click', () => run(() => c.backend.buyBigAquarium(), 'Akuarium besar terpasang (12 ikan).'));
      b.querySelectorAll<HTMLElement>('[data-add]').forEach(x => x.onclick = () => run(() => c.backend.toAquarium(x.dataset.add!), 'Ikan masuk akuarium.'));
      b.querySelectorAll<HTMLElement>('[data-lepas]').forEach(x => x.onclick = () => run(() => c.backend.fromAquarium(x.dataset.lepas!, 'lepas'), 'Ikan dilepas ke danau. +2 XP'));
      b.querySelectorAll<HTMLElement>('[data-jual]').forEach(x => x.onclick = () => run(() => c.backend.fromAquarium(x.dataset.jual!, 'jual'), 'Ikan terjual.'));
    }, () => { cancelAnimationFrame(aqRaf); c.aquarium3d?.(false, c.player().aquarium ?? []); });
  }

  // ---------------- Pasar ----------------
  async function openMarket(tab: 'beli' | 'jual' = 'beli') {
    const p = c.player();
    const tabs = `<div class="tabs"><button data-mt="beli" class="${tab === 'beli' ? 'on' : ''}">Beli</button><button data-mt="jual" class="${tab === 'jual' ? 'on' : ''}">Jual barang saya</button></div>`;
    let items: Awaited<ReturnType<Backend['market']>> = [];
    try { items = await c.backend.market(); } catch (e) { err(e); }
    let html = '';
    if (tab === 'beli') {
      const others = items.filter(x => x.seller !== p.id);
      html = '<div class="list">' + (others.length ? others.map(x => { const shopP = x.kind === 'rod' ? RODS[x.item as RodId]?.price : x.kind === 'bait' ? Math.round((BAITS[x.item as BaitId]?.price ?? 0) / (BAITS[x.item as BaitId]?.pack ?? 1) * (x.qty ?? 1)) : LINES[x.item as LineId]?.price;
        return `<div class="item ${x.rare ? 'on' : ''}"><span class="icn">${x.kind === 'rod' ? '🎣' : x.kind === 'bait' ? '🪱' : '〰️'}</span><div><b>${esc(itemName(x.kind, x.item))}${x.qty ? ' ×' + x.qty : ''}${x.rare ? ' · <span style="color:var(--gold2)">LANGKA</span>' : ''}</b><small>Penjual: ${esc(x.sellerName)}${shopP ? ' · harga toko ' + shopP : ''}</small></div><button class="btn gold" data-buy="${x.id}">${x.price}</button></div>`; }).join('') : '<p style="color:var(--dim)">Lapak masih kosong.</p>') + '</div>';
    } else {
      const mine = items.filter(x => x.seller === p.id);
      const sellable = [...p.rods.filter(r => r !== 'pemula' && r !== p.curRod).map(r => ['rod', r] as const), ...p.lines.filter(l => l !== 'l20' && l !== p.curLine).map(l => ['line', l] as const),
        ...(Object.keys(BAITS) as BaitId[]).filter(k => (p.bait[k] ?? 0) > 0).map(k => ['bait', k] as const)];
      html = `<p style="color:var(--dim);font-size:12px">Biaya pasar ${Math.round(MARKET_FEE * 100)}% dipotong saat barang terjual. Umpan dijual per bungkus (isi jumlahnya). Barang tidak laku kembali setelah 3 hari (tarik sendiri).</p>
        ${sellable.length ? `<div class="row"><select id="mkItem" class="sel">${sellable.map(([k, id]) => `<option value="${k}:${id}">${esc(itemName(k, id))}${k === 'bait' ? ' (punya ' + (p.bait[id as BaitId] ?? 0) + ')' : ''}</option>`).join('')}</select><input id="mkQty" class="sel" type="number" min="1" max="${MARKET_MAX_BAIT}" placeholder="Jml" title="Jumlah umpan" style="max-width:64px" hidden><input id="mkPrice" class="sel" type="number" min="${MARKET_MIN}" placeholder="Harga" style="max-width:90px"><button class="btn gold" id="mkList" style="flex:0 0 auto">Pasang</button></div>` : '<p style="color:var(--dim)">Tidak ada barang yang bisa dijual (joran/senar yang sedang dipakai dan barang bawaan tidak bisa dijual).</p>'}
        <p style="margin:10px 0 4px;font-weight:800">Lapak saya</p><div class="list">${mine.length ? mine.map(x => `<div class="item"><span class="icn">🏷️</span><div><b>${esc(itemName(x.kind, x.item))}${x.qty ? ' ×' + x.qty : ''}</b><small>${x.price} koin</small></div><button class="btn" data-cancel="${x.id}">Tarik</button></div>`).join('') : '<p style="color:var(--dim);margin:0">Belum ada barang.</p>'}</div>`;
    }
    openSheet('🤝 Pasar pemain · ' + p.coins.toLocaleString('id-ID') + ' koin', tabs + html, b => {
      b.querySelectorAll<HTMLElement>('[data-mt]').forEach(x => x.onclick = () => openMarket(x.dataset.mt as 'beli'));
      b.querySelectorAll<HTMLElement>('[data-buy]').forEach(x => x.onclick = async () => { try { const r = await c.backend.buyListing(x.dataset.buy!); c.setPlayer(r.player); toast('Terbeli! Barang masuk tas.'); openMarket('beli'); } catch (e) { err(e); } });
      b.querySelectorAll<HTMLElement>('[data-cancel]').forEach(x => x.onclick = async () => { try { const r = await c.backend.cancelListing(x.dataset.cancel!); c.setPlayer(r.player); toast('Barang kembali ke tas.'); openMarket('jual'); } catch (e) { err(e); } });
      b.querySelector<HTMLElement>('#mkList')?.addEventListener('click', async () => {
        const [kind, item] = (b.querySelector('#mkItem') as HTMLSelectElement).value.split(':');
        try { const r = await c.backend.listItem({ kind: kind as 'rod', item, price: Number((b.querySelector('#mkPrice') as HTMLInputElement).value), qty: Number((b.querySelector('#mkQty') as HTMLInputElement).value) }); c.setPlayer(r.player); toast('Barang dipasang di lapak. Hasil penjualan masuk saat Anda membuka Tukar/Misi.'); openMarket('jual'); } catch (e) { err(e); }
      });
      // umpan dijual per bungkus: tampilkan kolom jumlah
      const sel = b.querySelector<HTMLSelectElement>('#mkItem'), qty = b.querySelector<HTMLInputElement>('#mkQty');
      const sync = () => { if (sel && qty) { const isB = sel.value.startsWith('bait:'); qty.hidden = !isB; if (isB && !qty.value) qty.value = '10'; } };
      sel?.addEventListener('change', sync); sync();
      b.querySelectorAll('input').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('keyup', e => e.stopPropagation()); });
    });
  }

  // ---------------- Klub ----------------
  async function openClubs() {
    let info: Awaited<ReturnType<Backend['clubs']>>;
    try { info = await c.backend.clubs(); } catch (e) { err(e); return; }
    const m = info.mine, pct = m ? Math.min(100, Math.round(m.kg / info.target * 100)) : 0;
    const html = m ? `<div class="tour"><div class="tHead"><b>${m.icon} ${esc(m.name)} [${esc(m.tag)}]</b><small>${m.members.length} anggota</small></div>
        <p>Target minggu ini: ${m.kg.toLocaleString('id-ID')} / ${info.target} kg</p><div class="stam" style="height:10px"><i style="width:${pct}%"></i></div>
        <div class="row" style="margin-top:10px"><button class="btn gold" id="clClaim" ${pct >= 100 && !m.claimed.includes(c.player().id) ? '' : 'disabled'}>Ambil hadiah · +${info.reward}</button><button class="btn ghost" id="clLeave">Keluar klub</button></div>
        <p style="margin:10px 0 4px;font-weight:800">Anggota</p><div class="list">${m.members.map(x => `<div class="item"><span class="icn">${x.id === m.owner ? '👑' : '🎣'}</span><div><b>${esc(x.name)}</b><small>${x.id === m.owner ? 'Ketua' : 'Anggota'}</small></div><span></span></div>`).join('')}</div></div>`
      : `<p style="color:var(--dim)">Gabung klub untuk mengejar target kg mingguan bersama. Setiap tangkapan anggota menambah kg klub.</p>
        <details class="tour"><summary><b>➕ Buat klub baru · ${CLUB_PRICE} koin</b></summary>
          <div class="list" style="margin-top:8px"><input id="clName" class="sel" maxlength="24" placeholder="Nama klub (3–24 huruf)"><input id="clTag" class="sel" maxlength="4" placeholder="Singkatan (2–4)">
          <div class="row">${CLUB_ICONS.map((ic, i) => `<button class="btn ${i === 0 ? 'gold' : ''}" data-ic="${ic}">${ic}</button>`).join('')}</div><button class="btn gold" id="clCreate">Buat klub</button></div></details>`;
    const list = info.list.filter(x => x.id !== m?.id);
    openSheet('🛡️ Klub', html + `<p style="margin:12px 0 4px;font-weight:800">Klub lain</p><div class="list">${list.length ? list.map(x => `<div class="item"><span class="icn">${x.icon}</span><div><b>${esc(x.name)} [${esc(x.tag)}]</b><small>${x.members.length} anggota · ${x.kg} kg minggu ini</small></div>${m ? '<span></span>' : `<button class="btn" data-joinc="${x.id}">Gabung</button>`}</div>`).join('') : '<p style="color:var(--dim);margin:0">Belum ada klub lain.</p>'}</div>`, b => {
      let icon = CLUB_ICONS[0];
      b.querySelectorAll<HTMLElement>('[data-ic]').forEach(x => x.onclick = () => { icon = x.dataset.ic!; b.querySelectorAll('[data-ic]').forEach(y => y.classList.toggle('gold', y === x)); });
      const run = async (fn: () => Promise<{ player: Player; coins?: number }>, msg: string) => { try { const r = await fn(); c.setPlayer(r.player); toast(msg); openClubs(); } catch (e) { err(e); } };
      b.querySelector<HTMLElement>('#clCreate')?.addEventListener('click', () => run(() => c.backend.createClub({ name: (b.querySelector('#clName') as HTMLInputElement).value, tag: (b.querySelector('#clTag') as HTMLInputElement).value, icon }), 'Klub dibuat!'));
      b.querySelector<HTMLElement>('#clClaim')?.addEventListener('click', () => run(() => c.backend.claimClub(), 'Hadiah klub diambil!'));
      b.querySelector<HTMLElement>('#clLeave')?.addEventListener('click', () => run(() => c.backend.leaveClub(), 'Anda keluar dari klub.'));
      b.querySelectorAll<HTMLElement>('[data-joinc]').forEach(x => x.onclick = () => run(() => c.backend.joinClub(x.dataset.joinc!), 'Selamat bergabung!'));
      b.querySelectorAll('input').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('keyup', e => e.stopPropagation()); });
    });
  }

  // ---------------- Beli koin ----------------
  function openCoins() {
    const native = !!nativeStore(), local = c.backend.mode === 'lokal';
    // di aplikasi: wajib tersambung ke server (pembayaran diverifikasi server; mode luring tidak bisa menukar)
    const can = native ? !local : local;
    const note = native ? (local ? '<b>Perlu internet:</b> sambungkan HP ke internet untuk membeli koin.' : 'Pembayaran lewat Google Play.')
      : local ? '<b>Mode uji prototipe:</b> tidak ada pembayaran sungguhan, koin langsung masuk.' : 'Pembelian koin hanya tersedia di aplikasi dari Play Store.';
    openSheet('🪙 Beli koin', `<p style="color:var(--dim);font-size:12px;margin:2px 0 8px">Koin Anda: ${c.player().coins.toLocaleString('id-ID')}. ${note}</p>
      <div class="list">${COIN_PACKS.map(p => `<div class="item"><span class="icn">🪙</span><div><b>${p.coins.toLocaleString('id-ID')} koin${p.bonus ? ` <span style="color:var(--gold2)">+${p.bonus} bonus</span>` : ''}</b><small>${esc(p.label)}</small></div><button class="btn gold" data-pack="${p.id}" ${can ? '' : 'disabled'}>${local && !native ? 'Uji' : p.price}</button></div>`).join('')}</div>
      <p style="color:var(--dim);font-size:11px">Pembelian diverifikasi server; satu pembelian hanya bisa ditukar sekali. Bila jaringan putus setelah membayar, koin dipulihkan otomatis saat masuk berikutnya. Koin tidak bisa diuangkan kembali.</p>`, b => {
      // harga asli dari Play Store (mata uang & pajak sesuai akun Google pemain)
      if (native) void storePrices(COIN_PACKS.map(p => p.id)).then(pr => b.querySelectorAll<HTMLElement>('[data-pack]').forEach(x => { const v = pr[x.dataset.pack!]; if (v) x.textContent = v; }));
      let busy = false;
      b.querySelectorAll<HTMLElement>('[data-pack]').forEach(x => x.onclick = async () => {
        if (busy) return; busy = true; const label = x.textContent; x.textContent = '…';
        try {
          const token = native ? await buyPack(x.dataset.pack!) : 'uji-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
          const r = await c.backend.redeemCoins(x.dataset.pack!, token);
          if (native) await finishPack(token);
          c.setPlayer(r.player); if (r.coins) { c.confetti(); toast(`+${r.coins.toLocaleString('id-ID')} koin masuk!`); } else toast('Pembelian ini sudah pernah ditukar.');
          openCoins();
        } catch (e) { x.textContent = label; err(e); }
        finally { busy = false; }
      });
    });
  }

  function openHub() {
    const rows: [string, string, string, () => void][] = [
      ['👕', 'Karakter', 'Topi, baju, celana, kacamata, kulit', () => openCharacter()],
      ['🏆', 'Turnamen', 'Harian & Raja Nila mingguan', () => openTournaments()],
      ['🐠', 'Akuarium', 'Pajang ikan, dapat koin pengunjung', () => openAquarium()],
      ['🤝', 'Pasar pemain', 'Jual beli joran, senar & umpan', () => openMarket()],
      ...(c.openTrade ? [['🔁', 'Tukar antarpemain', 'Tukar umpan/joran, jual-beli langsung dengan koin', () => c.openTrade!()] as [string, string, string, () => void]] : []),
      ['🛡️', 'Klub', 'Target kg mingguan bersama', () => openClubs()],
      ['🪙', 'Beli koin', 'Paket koin + bonus', () => openCoins()],
    ];
    openSheet('🎪 Sosial & koleksi', '<div class="list">' + rows.map((r, i) => `<div class="item"><span class="icn">${r[0]}</span><div><b>${r[1]}</b><small>${r[2]}</small></div><button class="btn" data-h="${i}">Buka</button></div>`).join('') + '</div>', b => {
      b.querySelectorAll<HTMLElement>('[data-h]').forEach(x => x.onclick = () => rows[Number(x.dataset.h)][3]());
    });
  }
  return { openCharacter, openTournaments, openAquarium, openMarket, openClubs, openHub, openCoins };
}

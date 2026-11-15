// Panel developer / admin di dalam game: Peluang ikan, Ekonomi & pengumuman, Stok spot, Beri koin, Log.
// Mode lokal: langsung berlaku di perangkat. Mode server: perlu token admin (ADMIN_TOKEN di server).
import { SPECIES, SPECIES_IDS, SIZE_TIERS, DEFAULT_TIER_WEIGHTS, DEFAULT_SPOTS, EVENT_PRESETS, DEFAULT_AUTO, type SpeciesId, type GameConfig, type GameEvent } from '@paunjunan/shared';
import type { Backend } from '../core/backend';
import { RemoteBackend } from '../core/backend';
import { openSheet, toast, esc } from './hud';
import { store } from '../core/store';

const err = (e: unknown) => toast((e as Error).message, 3500);
const stop = (b: HTMLElement) => b.querySelectorAll('input,textarea').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('keyup', e => e.stopPropagation()); });

/** Kecilkan foto di perangkat (maks. 2048 px, JPEG 0,82) sebelum diunggah. */
function shrink(f: File): Promise<string> {
  return new Promise((res, rej) => {
    const img = new Image(), rd = new FileReader();
    rd.onload = () => { img.src = String(rd.result); }; rd.onerror = () => rej(new Error('Foto tidak bisa dibaca.'));
    img.onload = () => {
      const k = Math.min(1, 2048 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      let q = 0.82, u = c.toDataURL('image/jpeg', q);
      while (u.length > 1_500_000 && q > 0.4) { q -= 0.1; u = c.toDataURL('image/jpeg', q); }
      res(u);
    };
    img.onerror = () => rej(new Error('Format foto tidak didukung.'));
    rd.readAsDataURL(f);
  });
}
let onBackdrop: ((url: string, slot: 'depan' | 'belakang' | 'dasar') => void) | undefined;
let onClarity: ((c: 'jernih' | 'sedang' | 'keruh') => void) | undefined;
let onFarTrees: ((show: boolean) => void) | undefined;
let onEvent: ((list: GameEvent[]) => void) | undefined;
export function setEventHook(f: (list: GameEvent[]) => void) { onEvent = f; }
export function openAdmin(be: Backend, myId: string, tab = 'peluang', setBackdrop?: (url: string, slot: 'depan' | 'belakang' | 'dasar') => void, setFarTrees?: (show: boolean) => void, setClarity?: (c: 'jernih' | 'sedang' | 'keruh') => void) {
  if (setBackdrop) onBackdrop = setBackdrop;
  if (setFarTrees) onFarTrees = setFarTrees;
  if (setClarity) onClarity = setClarity;
  if (be instanceof RemoteBackend && !be.adminToken) {
    openSheet('🛠️ Panel admin', `<p>Masukkan token admin (sama dengan <code>ADMIN_TOKEN</code> di server).</p>
      <input id="adTok" class="sel" type="password" style="width:100%" autocomplete="off"><button class="btn gold" id="adTokGo" style="width:100%;margin-top:8px">Masuk</button>`, b => {
      stop(b);
      b.querySelector<HTMLElement>('#adTokGo')!.onclick = () => { be.adminToken = (b.querySelector('#adTok') as HTMLInputElement).value.trim(); store.set('adminToken', be.adminToken); openAdmin(be, myId, tab, onBackdrop); };
    });
    return;
  }
  openSheet('🛠️ Panel developer', '<p style="color:var(--dim)">Memuat…</p>');
  be.adminState().then(st => render(st)).catch(e => {
    err(e);
    if (be instanceof RemoteBackend && /token/i.test((e as Error).message)) { be.adminToken = ''; store.set('adminToken', ''); }
  });

  function render(st: Awaited<ReturnType<Backend['adminState']>>) {
    const c = st.config;
    const tabs = `<div class="tabs" style="flex-wrap:wrap">${[['peluang', 'Peluang ikan'], ['otomatis', '🤖 Otomatis'], ['ikan', 'Editor ikan'], ['acara', 'Acara'], ['ekonomi', 'Ekonomi'], ['latar', 'Latar & air'], ['stok', 'Stok'], ['koin', 'Beri koin'], ['log', 'Log']].map(([id, n]) => `<button data-at="${id}" class="${id === tab ? 'on' : ''}">${n}</button>`).join('')}</div>`;
    let html = '';
    if (tab === 'peluang') {
      html = `<p style="color:var(--dim);font-size:12px">Pengali peluang menyambar (1 = normal, 0 = tidak muncul) dan bobot ukuran ${SIZE_TIERS.map(t => t.name).join(' / ')}.</p><div class="list">` +
        SPECIES_IDS.map(k => { const r = c.rates[k] ?? {}, t = r.tiers ?? DEFAULT_TIER_WEIGHTS;
          return `<div class="item" style="display:block"><b>${esc(SPECIES[k].name)}</b>
            <div class="row" style="align-items:center;margin-top:4px"><input type="range" min="0" max="5" step="0.1" value="${r.rate ?? 1}" data-rate="${k}" style="flex:1"><b data-rv="${k}" style="min-width:34px;text-align:right">${(r.rate ?? 1).toFixed(1)}×</b></div>
            <div class="row" style="margin-top:4px">${t.map((w, i) => `<input class="sel" type="number" min="0" value="${w}" data-tier="${k}:${i}" title="${SIZE_TIERS[i].name}" style="width:25%">`).join('')}</div></div>`; }).join('') +
        '</div><button class="btn gold" id="adSaveRates" style="width:100%;margin-top:8px">Simpan peluang</button><button class="btn ghost" id="adResetRates" style="width:100%;margin-top:6px">Kembalikan ke bawaan</button>';
    } else if (tab === 'ikan') {
      html = `<p style="color:var(--dim);font-size:12px">Ubah data tiap jenis. Berlaku langsung untuk semua pemain (harga jual, berat ikan baru, kekuatan tarikan, warna model).</p><div class="list">` +
        SPECIES_IDS.map(k => { const sp = SPECIES[k];
          return `<div class="item" style="display:block" data-sp="${k}"><div class="row"><input class="sel" data-f="name" value="${esc(sp.name)}" style="flex:2"><input class="sel" data-f="price" type="number" step="0.5" value="${sp.pricePerKg}" title="Harga/kg" style="flex:1"></div>
            <div class="row" style="margin-top:4px;align-items:center"><small style="color:var(--dim)">Berat</small><input class="sel" data-f="w0" type="number" step="0.05" value="${sp.w[0]}" style="width:70px"><small>–</small><input class="sel" data-f="w1" type="number" step="0.1" value="${sp.w[1]}" style="width:70px"><small style="color:var(--dim)">kg · Tarikan</small><input class="sel" data-f="str" type="number" step="0.05" value="${sp.str}" style="width:64px"></div>
            <div class="row" style="margin-top:4px;align-items:center"><small style="color:var(--dim)">Warna punggung / sisi / perut</small><input type="color" data-f="back" value="${sp.look.back}"><input type="color" data-f="side" value="${sp.look.side}"><input type="color" data-f="belly" value="${sp.look.belly}"></div></div>`; }).join('') +
        '</div><button class="btn gold" id="adSaveSp" style="width:100%;margin-top:8px">Simpan data ikan</button><button class="btn ghost" id="adResetSp" style="width:100%;margin-top:6px">Kembalikan semua ke bawaan</button>';
    } else if (tab === 'acara') {
      const evs = c.events ?? [], now = Date.now() / 1000, dt = (t: number) => new Date(t * 1000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      html = `<p style="color:var(--dim);font-size:12px">Acara menaikkan peluang satu jenis ikan (dan/atau XP & harga) selama waktunya, dengan papan khusus di game. Tidak boleh bertabrakan waktu.</p>
        <div class="list">${evs.length ? evs.map((e, i) => `<div class="item"><span class="icn">${esc(e.icon)}</span><div><b>${esc(e.name)} ${e.startsAt <= now && e.endsAt >= now ? '<span style="color:var(--gold2)">· BERJALAN</span>' : e.endsAt < now ? '· selesai' : '· terjadwal'}</b><small>${new Date(e.startsAt * 1000).toLocaleString('id-ID')} – ${new Date(e.endsAt * 1000).toLocaleString('id-ID')}</small><small>${e.species ? esc(SPECIES[e.species].name) + ' ×' + e.rateMul + ' · ' : ''}XP ×${e.xpMul} · harga ×${e.priceMul}</small></div><button class="btn ghost" data-evdel="${i}">Hapus</button></div>`).join('') : '<p style="color:var(--dim)">Belum ada acara.</p>'}</div>
        <div class="tour"><b>Tambah acara</b>
          <div class="row" style="margin-top:6px;flex-wrap:wrap">${EVENT_PRESETS.map((p, i) => `<button class="btn" data-evp="${i}">${esc(p.icon)} ${esc(p.name)}</button>`).join('')}</div>
          <div class="list" style="margin-top:8px"><input class="sel" id="evName" placeholder="Nama acara" maxlength="40"><input class="sel" id="evDesc" placeholder="Keterangan" maxlength="160">
          <div class="row"><input class="sel" id="evIcon" value="🎉" maxlength="4" style="width:60px"><select class="sel" id="evSp"><option value="">Semua jenis</option>${SPECIES_IDS.map(k => `<option value="${k}">${esc(SPECIES[k].name)}</option>`).join('')}</select></div>
          <div class="row"><label style="flex:1;font-size:11px">Peluang ×<input class="sel" id="evRate" type="number" step="0.1" value="2" style="width:100%"></label><label style="flex:1;font-size:11px">XP ×<input class="sel" id="evXp" type="number" step="0.1" value="1" style="width:100%"></label><label style="flex:1;font-size:11px">Harga ×<input class="sel" id="evPrice" type="number" step="0.1" value="1" style="width:100%"></label></div>
          <div class="row"><label style="flex:1;font-size:11px">Mulai<input class="sel" id="evS" type="datetime-local" value="${dt(now)}" style="width:100%"></label><label style="flex:1;font-size:11px">Selesai<input class="sel" id="evE" type="datetime-local" value="${dt(now + 7 * 86400)}" style="width:100%"></label></div>
          <button class="btn gold" id="evAdd">Simpan acara</button></div></div>`;
    } else if (tab === 'otomatis') {
      const a = { ...DEFAULT_AUTO, ...(c.auto ?? {}) };
      const yn = (key: string, v: boolean, on: string, off: string) => `<div class="seg" data-af="${key}"><button data-v="1" class="${v ? 'on' : ''}">${on}</button><button data-v="0" class="${v ? '' : 'on'}">${off}</button></div>`;
      html = `<p style="color:var(--dim);font-size:12px">Pemain bisa menekan tombol 🤖 Otomatis di spot: avatar memancing sendiri. <b>Server</b> yang melempar dadu keberhasilan mengangkat ikan memakai peluang di bawah — pemain tidak bisa mengubahnya. Setiap perubahan tercatat di Log.</p>
        <div class="tour"><div class="set"><span>Mancing otomatis<small>Matikan untuk semua pemain (mis. saat turnamen besar)</small></span>${yn('on', a.on, 'Hidup', 'Mati')}</div></div>
        <div class="tour"><b>Peluang berhasil mengangkat ikan</b><p style="margin:2px 0 6px;font-size:12px;color:var(--dim)">Per ukuran ikan (ditentukan saat ikan menyambar). Manual tetap bergantung keterampilan pemain.</p>
          ${SIZE_TIERS.map((t, i) => `<div class="row" style="align-items:center;margin-top:4px"><span style="min-width:72px">${esc(t.name)}</span><input type="range" min="0" max="100" step="1" value="${Math.round(a.rate[i] * 100)}" data-afr="${i}" style="flex:1"><b data-afrv="${i}" style="min-width:44px;text-align:right">${Math.round(a.rate[i] * 100)}%</b></div>`).join('')}</div>
        <div class="list">
          <label class="field"><span>Hadiah otomatis (× koin & XP manual, 0–2) — mis. 0,7 = 70%</span><input id="afGain" class="sel" type="number" step="0.05" min="0" max="2" value="${a.gainMul}"></label>
          <label class="field"><span>Batas ikan otomatis per pemain per hari (0 = tanpa batas)</span><input id="afMax" class="sel" type="number" min="0" max="5000" value="${a.maxPerDay}"></label>
          <label class="field"><span>Jeda minimal antar tangkapan otomatis (detik)</span><input id="afGap" class="sel" type="number" min="0" max="600" value="${a.minGap}"></label>
          <label class="field"><span>Level minimal</span><input id="afLv" class="sel" type="number" min="1" max="100" value="${a.minLv}"></label>
        </div>
        <div class="tour"><div class="set"><span>Papan peringkat, turnamen & acara<small>Disarankan TIDAK, supaya juara tetap hasil keterampilan</small></span>${yn('board', a.board, 'Ikut', 'Tidak')}</div>
          <div class="set"><span>Misi harian & lencana</span>${yn('missions', a.missions, 'Dihitung', 'Tidak')}</div>
          <div class="set"><span>Keranjang penuh</span><div class="seg" data-af="full"><button data-v="stop" class="${a.full === 'stop' ? 'on' : ''}">Berhenti</button><button data-v="jual" class="${a.full === 'jual' ? 'on' : ''}">Jual otomatis</button></div></div></div>
        <div class="row"><button class="btn ghost" id="afReset">Kembalikan bawaan</button><button class="btn gold" id="afSave">Simpan</button></div>`;
    } else if (tab === 'ekonomi') {
      html = `<div class="list"><label class="field"><span>Pengali harga jual ikan (0,1–5)</span><input id="adPrice" class="sel" type="number" step="0.1" value="${c.priceMul}"></label>
        <label class="field"><span>Pengali XP (0,1–5) — mis. 2 untuk "XP ganda akhir pekan"</span><input id="adXp" class="sel" type="number" step="0.1" value="${c.xpMul}"></label>
        <label class="field"><span>Pengumuman (muncul saat pemain masuk, maks. 200 huruf)</span><textarea id="adMotd" class="sel" rows="3" maxlength="200">${esc(c.motd)}</textarea></label>
        <button class="btn gold" id="adSaveEco">Simpan</button></div>`;
    } else if (tab === 'latar') {
      const slot = (id: 'depan' | 'belakang' | 'dasar', icon: string, title: string, at: number | undefined, tip: string) => `<div class="tour"><div class="tHead"><b>${icon} ${title}</b><small>${at ? 'Terpasang' : 'Belum ada'}</small></div>
          <p>${tip}</p><input type="file" data-bgfile="${id}" accept="image/*" style="width:100%"><div class="row" style="margin-top:8px"><button class="btn ghost" data-bgdel="${id}" ${at ? '' : 'disabled'}>Hapus foto</button></div></div>`;
      html = slot('depan', '🏔️', 'Latar depan (seberang danau)', c.backdropAt, 'Foto panorama pegunungan di seberang danau. Paling bagus foto memanjang (3:1–4:1), langit di atas & air/tepian di bawah. Di Danau Serene pegunungan bawaan otomatis disembunyikan.') +
        slot('belakang', '🌲', 'Latar belakang (di belakang pemain)', c.backdropBackAt, 'Foto pemandangan di belakang pemain (terlihat saat berjalan atau memutar kamera). Bila kosong, latar depan dipasang melingkar penuh.') +
        slot('dasar', '🪨', 'Dasar danau (di dalam air)', c.bedAt, 'Foto dasar danau (pasir, kerikil, batu, lumut) yang terlihat di air jernih. Foto diubin ±7 m dan dicerminkan agar sambungannya tidak terlihat; paling bagus foto tegak lurus dari atas tanpa bayangan kuat.') +
        `<div class="tour"><div class="set"><span>Pemandangan ujung danau<small>Sembunyikan pohon, bukit & air terjun di ujung/seberang danau → danau menyambung langsung ke latar foto (dermaga, pondok & tepi dekat tetap ada)</small></span><div class="seg"><button data-ft="1" class="${c.hideFarTrees ? '' : 'on'}">Tampil</button><button data-ft="0" class="${c.hideFarTrees ? 'on' : ''}">Sembunyikan</button></div></div>
          <div class="set"><span>Kejernihan air<small>Jernih: dasar & ikan terlihat · Keruh: air pekat seperti danau berlumpur</small></span><div class="seg">${(['jernih', 'sedang', 'keruh'] as const).map(v => `<button data-wc="${v}" class="${(c.waterClarity ?? 'jernih') === v ? 'on' : ''}">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}</div></div></div>`;
    } else if (tab === 'stok') {
      html = DEFAULT_SPOTS.map(sp => `<div class="tour"><div class="tHead"><b>${esc(sp.name)} (${sp.id})</b><button class="btn" data-reset="${sp.id}" style="padding:6px 10px;font-size:12px">Isi ulang</button></div>
        <div class="cosGrid">${SPECIES_IDS.map(k => `<label class="cos"><b>${esc(SPECIES[k].name)}</b><input class="sel" type="number" min="0" value="${st.stock[sp.id]?.[k] ?? 0}" data-stock="${sp.id}:${k}" style="width:70px;text-align:center"></label>`).join('')}</div></div>`).join('') +
        '<p style="color:var(--dim);font-size:12px">Ubah angka lalu ketuk di luar kotak untuk menyimpan. Stok berkurang setiap ikan diangkat dan bertambah saat ikan dilepas.</p>';
    } else if (tab === 'koin') {
      html = `<div class="list"><label class="field"><span>ID pemain</span><input id="adPid" class="sel" value="${be.mode === 'lokal' ? esc(myId) : ''}" placeholder="u_… atau g_…"></label>
        <label class="field"><span>Jumlah koin (boleh negatif untuk koreksi)</span><input id="adCoins" class="sel" type="number" value="500"></label>
        <label class="field"><span>Alasan (tercatat di log)</span><input id="adWhy" class="sel" placeholder="mis. kompensasi server gangguan"></label>
        <button class="btn gold" id="adGrant">Kirim koin</button></div><p style="color:var(--dim);font-size:12px">ID Anda: ${esc(myId)}</p>`;
    } else {
      html = '<div class="list">' + (st.audit.length ? st.audit.map(r => `<div class="item"><span class="icn">📝</span><div><b>${esc(r.act)}</b><small>${new Date(r.at * 1000).toLocaleString('id-ID')} · ${esc(r.who)}</small><small>${esc(r.detail)}</small></div><span></span></div>`).join('') : '<p style="color:var(--dim)">Belum ada perubahan.</p>') + '</div>';
    }
    openSheet('🛠️ Panel ' + (be.mode === 'lokal' ? 'developer (lokal)' : 'admin server'), tabs + html, b => {
      stop(b);
      b.querySelectorAll<HTMLElement>('[data-at]').forEach(x => x.onclick = () => { tab = x.dataset.at!; render(st); });
      b.querySelectorAll<HTMLInputElement>('[data-rate]').forEach(x => x.oninput = () => { b.querySelector(`[data-rv="${x.dataset.rate}"]`)!.textContent = Number(x.value).toFixed(1) + '×'; });
      const save = async (p: Partial<GameConfig>, msg: string) => { try { st.config = await be.adminConfig(p); toast(msg); render(st); } catch (e) { err(e); } };
      b.querySelector<HTMLElement>('#adSaveRates')?.addEventListener('click', () => {
        const rates: GameConfig['rates'] = {};
        for (const k of SPECIES_IDS) {
          const rate = Number((b.querySelector(`[data-rate="${k}"]`) as HTMLInputElement).value);
          const tiers = [0, 1, 2, 3].map(i => Number((b.querySelector(`[data-tier="${k}:${i}"]`) as HTMLInputElement).value));
          const same = rate === 1 && tiers.every((w, i) => w === DEFAULT_TIER_WEIGHTS[i]);
          if (!same) rates[k] = { rate, tiers };
        }
        save({ rates }, 'Peluang ikan disimpan dan langsung berlaku.');
      });
      b.querySelector<HTMLElement>('#adSaveSp')?.addEventListener('click', () => {
        const species: NonNullable<GameConfig['species']> = {};
        b.querySelectorAll<HTMLElement>('[data-sp]').forEach(row => {
          const v = (f: string) => (row.querySelector(`[data-f="${f}"]`) as HTMLInputElement).value;
          species[row.dataset.sp as SpeciesId] = { name: v('name'), pricePerKg: Number(v('price')), w: [Number(v('w0')), Number(v('w1'))], str: Number(v('str')), back: v('back'), side: v('side'), belly: v('belly') };
        });
        save({ species }, 'Data ikan disimpan.');
      });
      b.querySelector<HTMLElement>('#adResetSp')?.addEventListener('click', () => save({ species: {} }, 'Data ikan dikembalikan ke bawaan.'));
      const saveEvents = async (list: GameEvent[], msg: string) => { try { st.config = await be.adminEvents(list); onEvent?.(st.config.events ?? []); toast(msg); render(st); } catch (e) { err(e); } };
      b.querySelectorAll<HTMLElement>('[data-evdel]').forEach(x => x.onclick = () => { const l = [...(st.config.events ?? [])]; l.splice(Number(x.dataset.evdel), 1); saveEvents(l, 'Acara dihapus.'); });
      b.querySelectorAll<HTMLElement>('[data-evp]').forEach(x => x.onclick = () => {
        const p = EVENT_PRESETS[Number(x.dataset.evp)], set = (id: string, v: string) => { (b.querySelector('#' + id) as HTMLInputElement).value = v; };
        set('evName', p.name); set('evDesc', p.desc); set('evIcon', p.icon); set('evSp', p.species ?? ''); set('evRate', String(p.rateMul)); set('evXp', String(p.xpMul)); set('evPrice', String(p.priceMul));
      });
      b.querySelector<HTMLElement>('#evAdd')?.addEventListener('click', () => {
        const v = (id: string) => (b.querySelector('#' + id) as HTMLInputElement).value, ts = (id: string) => Math.floor(new Date(v(id)).getTime() / 1000);
        saveEvents([...(st.config.events ?? []), { id: '', name: v('evName'), desc: v('evDesc'), icon: v('evIcon') || '🎉', species: (v('evSp') || undefined) as SpeciesId | undefined,
          rateMul: Number(v('evRate')), xpMul: Number(v('evXp')), priceMul: Number(v('evPrice')), startsAt: ts('evS'), endsAt: ts('evE') }], 'Acara disimpan.');
      });
      b.querySelector<HTMLElement>('#adResetRates')?.addEventListener('click', () => save({ rates: {} }, 'Peluang dikembalikan ke bawaan.'));
      if (tab === 'otomatis') {
        const a = { ...DEFAULT_AUTO, ...(c.auto ?? {}) };
        b.querySelectorAll<HTMLInputElement>('[data-afr]').forEach(r => r.addEventListener('input', () => { b.querySelector<HTMLElement>(`[data-afrv="${r.dataset.afr}"]`)!.textContent = r.value + '%'; }));
        b.querySelectorAll<HTMLElement>('[data-af]').forEach(sg => sg.querySelectorAll<HTMLElement>('button').forEach(x => x.addEventListener('click', () => {
          sg.querySelectorAll('button').forEach(y => y.classList.toggle('on', y === x));
          const k = sg.dataset.af!, v = x.dataset.v!;
          if (k === 'full') a.full = v as 'stop' | 'jual'; else (a as unknown as Record<string, boolean>)[k] = v === '1';
        })));
        const num = (id: string) => Number((b.querySelector('#' + id) as HTMLInputElement).value);
        b.querySelector<HTMLElement>('#afSave')!.addEventListener('click', () => save({ auto: { ...a,
          rate: [...b.querySelectorAll<HTMLInputElement>('[data-afr]')].map(r => Number(r.value) / 100) as typeof a.rate,
          gainMul: num('afGain'), maxPerDay: num('afMax'), minGap: num('afGap'), minLv: num('afLv') } }, 'Pengaturan mancing otomatis disimpan.'));
        b.querySelector<HTMLElement>('#afReset')!.addEventListener('click', () => save({ auto: { ...DEFAULT_AUTO } }, 'Mancing otomatis kembali ke bawaan.'));
      }
      b.querySelector<HTMLElement>('#adSaveEco')?.addEventListener('click', () => save({
        priceMul: Number((b.querySelector('#adPrice') as HTMLInputElement).value), xpMul: Number((b.querySelector('#adXp') as HTMLInputElement).value), motd: (b.querySelector('#adMotd') as HTMLTextAreaElement).value,
      }, 'Ekonomi & pengumuman disimpan.'));
      b.querySelectorAll<HTMLInputElement>('[data-bgfile]').forEach(inp => inp.addEventListener('change', async () => {
        const f = inp.files?.[0], sl = inp.dataset.bgfile as 'depan' | 'belakang' | 'dasar'; if (!f) return;
        try { const url = await shrink(f); st.config = await be.adminBackdrop(url, sl); onBackdrop?.(url, sl); toast(sl === 'dasar' ? 'Foto dasar danau terpasang.' : 'Foto latar ' + sl + ' terpasang.'); render(st); } catch (x) { err(x); }
      }));
      b.querySelectorAll<HTMLElement>('[data-wc]').forEach(x => x.addEventListener('click', async () => {
        const v = x.dataset.wc as 'jernih' | 'sedang' | 'keruh';
        try { st.config = await be.adminConfig({ waterClarity: v }); onClarity?.(v); toast('Kejernihan air: ' + v + '.'); render(st); } catch (x2) { err(x2); }
      }));
      b.querySelectorAll<HTMLElement>('[data-bgdel]').forEach(x => x.addEventListener('click', async () => { const sl = x.dataset.bgdel as 'depan' | 'belakang' | 'dasar'; try { st.config = await be.adminBackdrop('', sl); onBackdrop?.('', sl); toast('Foto dihapus.'); render(st); } catch (e3) { err(e3); } }));
      b.querySelectorAll<HTMLInputElement>('[data-stock]').forEach(x => x.onchange = async () => {
        const [spot, k] = x.dataset.stock!.split(':');
        try { st.stock = await be.adminStock(spot, k as SpeciesId, Number(x.value)); toast(`Stok ${SPECIES[k as SpeciesId].name} di ${spot} = ${x.value}`); } catch (e) { err(e); }
      });
      b.querySelectorAll<HTMLElement>('[data-reset]').forEach(x => x.onclick = async () => { try { st.stock = await be.adminResetStock(x.dataset.reset!); toast('Stok diisi ulang.'); render(st); } catch (e) { err(e); } });
      b.querySelector<HTMLElement>('#adGrant')?.addEventListener('click', async () => {
        try { const r = await be.adminCoins((b.querySelector('#adPid') as HTMLInputElement).value.trim(), Number((b.querySelector('#adCoins') as HTMLInputElement).value), (b.querySelector('#adWhy') as HTMLInputElement).value); toast(`${r.name} sekarang punya ${r.coins.toLocaleString('id-ID')} koin.`); }
        catch (e) { err(e); }
      });
    });
  }
}

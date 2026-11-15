// Layar progres: Misi harian + hadiah harian beruntun, Lencana, dan Profil pemain.
import {
  BADGES, DAILY_REWARDS, missionText, levelInfo, SPECIES, SPECIES_IDS, LOCATIONS, DEFAULT_SPOTS, dayKey,
  type Player, type Mission,
} from '@paunjunan/shared';
import type { Backend } from '../core/backend';
import { openSheet, toast, esc, fmtKg, $ } from './hud';

export interface ProgressCtx {
  backend: Backend; player: () => Player; setPlayer: (p: Player) => void; confetti: () => void;
  openCharacter: () => void; openAlbum: () => void;
}
const err = (e: unknown) => toast((e as Error).message, 3500);
const av = (name: string) => { let h = 0; for (const c of name.toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `<span class="pav a${h % 8}">${esc((name.replace(/[^\p{L}\p{N}]/gu, '') || '?').slice(0, 2).toUpperCase())}</span>`; };

export function createProgressUI(c: ProgressCtx) {
  let dailyReady = false;
  const today = () => dayKey(Date.now() / 1000);

  /** Jumlah hadiah yang siap diambil (untuk lencana angka di tombol HUD). */
  function claimable(p: Player) {
    const m = p.missions && p.missions.day === today() ? p.missions.list.filter(x => !x.claimed && x.progress >= x.target).length : 0;
    const b = Object.values(p.badges ?? {}).filter(v => v === 'baru').length;
    return m + b + (dailyReady ? 1 : 0);
  }
  function badge() { const n = claimable(c.player()); const el = $('missionBadge'); el.hidden = n === 0; el.textContent = String(n); }

  /** Beri tahu pemain saat misi selesai / lencana baru (dibandingkan dengan data sebelumnya). */
  function notify(prev: Player | null, next: Player) {
    if (prev) {
      const was = new Map((prev.missions?.list ?? []).map(m => [m.id, m.progress >= m.target]));
      for (const m of next.missions?.list ?? []) if (m.progress >= m.target && was.get(m.id) === false) { toast('✅ Misi selesai: ' + missionText(m) + ' — ambil hadiahnya di 📋', 4200); }
      for (const [id, v] of Object.entries(next.badges ?? {})) if (v === 'baru' && !prev.badges?.[id]) { const b = BADGES.find(x => x.id === id); if (b) { toast(`${b.icon} Lencana baru: ${b.name}!`, 4200); c.confetti(); } }
    }
    badge();
  }

  async function refresh() {
    try { const r = await c.backend.progress(); dailyReady = r.dailyReady; c.setPlayer(r.player); badge(); return r; } catch { return null; }
  }

  function dailyTrack(p: Player) {
    const streak = p.daily?.streak ?? 0, claimedToday = p.daily?.last === today();
    // posisi dalam siklus 7 hari: hari berikutnya yang akan diambil
    const cont = claimedToday || (p.daily && p.daily.last === dayKey(Date.now() / 1000 - 86400));
    const doneInCycle = cont ? ((streak - 1) % 7) + 1 : 0, nextDay = claimedToday ? doneInCycle : cont ? (streak % 7) + 1 : 1;
    return `<div class="dtrack">${DAILY_REWARDS.map((r, i) => {
      const d = i + 1, done = cont && d <= doneInCycle && (claimedToday || d < nextDay), now = !claimedToday && d === nextDay;
      return `<div class="dday ${done ? 'done' : ''} ${now ? 'now' : ''} ${d === 7 ? 'big' : ''}"><small>Hari ${d}</small><b>${d === 7 ? '🎁' : '🪙'}</b><span>${r}</span>${done ? '<i>✓</i>' : ''}</div>`;
    }).join('')}</div>`;
  }

  async function claimDaily(then?: () => void) {
    try {
      const r = await c.backend.claimDaily(); dailyReady = false; c.setPlayer(r.player); c.confetti();
      toast(`Hari ke-${r.day}: +${r.coins} koin${r.bait ? ' + 5 Umpan Racik' : ''}! Beruntun ${r.streak} hari.`, 4500); badge(); then?.();
    } catch (e) { err(e); }
  }

  function openDaily() {
    const p = c.player();
    openSheet('📅 Hadiah harian', `<p class="muted" style="margin:0 0 8px">Masuk setiap hari untuk hadiah yang makin besar. Bolong sehari, kembali ke hari 1.</p>${dailyTrack(p)}
      <button class="btn gold big" id="dClaim" style="width:100%;margin-top:12px" ${dailyReady ? '' : 'disabled'}>${dailyReady ? 'Ambil hadiah hari ini' : 'Sudah diambil — kembali besok'}</button>`, b => {
      b.querySelector<HTMLElement>('#dClaim')!.onclick = () => claimDaily(() => openMissions());
    });
  }

  function missionCard(m: Mission) {
    const pct = Math.min(100, Math.round(m.progress / m.target * 100)), done = m.progress >= m.target;
    const prog = m.kind === 'kg' ? `${m.progress.toLocaleString('id-ID', { maximumFractionDigits: 1 })} / ${m.target} kg` : `${Math.floor(m.progress)} / ${m.target}`;
    const ic = m.kind === 'count' ? '🎣' : m.kind === 'kg' ? '⚖️' : m.kind === 'big' ? '💪' : '🐟';
    return `<div class="mcard ${done ? 'done' : ''} ${m.claimed ? 'claimed' : ''}"><span class="mic">${ic}</span><div class="grow"><b>${esc(missionText(m))}</b>
      <div class="mbar"><i style="width:${pct}%"></i></div><small>${prog} · 🪙 ${m.reward} · ✨ ${m.xp} XP</small></div>
      ${m.claimed ? '<span class="mok">✓</span>' : `<button class="btn ${done ? 'gold' : 'ghost'} sm" data-mc="${esc(m.id)}" ${done ? '' : 'disabled'}>${done ? 'Ambil' : 'Belum'}</button>`}</div>`;
  }

  function openMissions(tab: 'misi' | 'lencana' = 'misi') {
    const p = c.player();
    const tabs = `<div class="tabs"><button data-pt="misi" class="${tab === 'misi' ? 'on' : ''}">Misi harian</button><button data-pt="lencana" class="${tab === 'lencana' ? 'on' : ''}">Lencana ${Object.values(p.badges ?? {}).length}/${BADGES.length}</button></div>`;
    let html = '';
    if (tab === 'misi') {
      const list = p.missions && p.missions.day === today() ? p.missions.list : [];
      html = `<div class="dmini"><div><b>Hadiah harian</b><small>Beruntun ${p.daily?.streak ?? 0} hari</small></div><button class="btn ${dailyReady ? 'gold' : 'ghost'} sm" id="pDaily">${dailyReady ? 'Ambil 🎁' : 'Lihat'}</button></div>
        <p class="muted" style="margin:10px 0 6px">Misi berganti setiap pukul 00.00 WIB. Selesaikan ketiganya untuk <b style="color:var(--gold2)">bonus 150 koin</b>.</p>
        ${list.length ? list.map(missionCard).join('') : '<p class="muted">Memuat misi…</p>'}`;
    } else {
      html = `<div class="bgrid">${BADGES.map(b => {
        const st = p.badges?.[b.id];
        return `<div class="bcard ${st ?? 'lock'}"><span class="bic">${st ? b.icon : '🔒'}</span><b>${esc(b.name)}</b><small>${esc(b.desc)}</small>
          ${st === 'baru' ? `<button class="btn gold sm" data-bc="${b.id}">Ambil 🪙${b.reward}</button>` : st === 'diambil' ? '<small class="bdone">✓ Didapat</small>' : `<small class="brw">🪙 ${b.reward}</small>`}</div>`;
      }).join('')}</div>`;
    }
    openSheet('📋 Misi & lencana', tabs + html, b => {
      b.querySelectorAll<HTMLElement>('[data-pt]').forEach(x => x.onclick = () => openMissions(x.dataset.pt as 'misi'));
      b.querySelector<HTMLElement>('#pDaily')?.addEventListener('click', () => dailyReady ? claimDaily(() => openMissions('misi')) : openDaily());
      b.querySelectorAll<HTMLElement>('[data-mc]').forEach(x => x.onclick = async () => {
        try { const r = await c.backend.claimMission(x.dataset.mc!); c.setPlayer(r.player); toast(`+${r.coins} koin, +${r.xp} XP${r.bonus ? ' (termasuk bonus 150 — semua misi selesai!)' : ''}`, 3800); if (r.bonus) c.confetti(); badge(); openMissions('misi'); } catch (e) { err(e); }
      });
      b.querySelectorAll<HTMLElement>('[data-bc]').forEach(x => x.onclick = async () => {
        try { const r = await c.backend.claimBadge(x.dataset.bc!); c.setPlayer(r.player); toast(`+${r.coins} koin dari lencana!`); c.confetti(); badge(); openMissions('lencana'); } catch (e) { err(e); }
      });
    });
    if (tab === 'misi' && !(p.missions && p.missions.day === today())) refresh().then(r => { if (r) openMissions('misi'); });
  }

  function openProfile() {
    const p = c.player(), L = levelInfo(p.xp);
    const got = SPECIES_IDS.filter(k => (p.album?.[k] ?? 0) > 0).length;
    const nb = Object.values(p.badges ?? {}).length;
    const recs = Object.entries(p.best ?? {}).map(([k, w]) => { const [spot, sp] = k.split(':'); return { spot, sp, w }; }).sort((a, b) => b.w - a.w).slice(0, 3);
    const locs = (p.feats?.locs ?? []).map(l => LOCATIONS.find(x => x.id === l)?.icon ?? '').join(' ') || '—';
    const stat = (k: string, v: string) => `<div class="pstat"><small>${k}</small><b>${v}</b></div>`;
    openSheet('👤 Profil pemancing', `<div class="phead">${av(p.name)}<div class="grow"><h2>${esc(p.name)}</h2><small>Level ${L.lv} · ${Math.round(L.pct * 100)}% menuju level ${L.lv + 1}</small><div class="mbar"><i style="width:${Math.round(L.pct * 100)}%"></i></div></div></div>
      <div class="pgrid">${stat('Total ikan', p.stats.catches.toLocaleString('id-ID'))}${stat('Total berat', fmtKg(p.stats.totalKg))}${stat('Terberat', p.stats.heaviest ? fmtKg(p.stats.heaviest) : '—')}
        ${stat('Koleksi', got + '/' + SPECIES_IDS.length)}${stat('Lencana', nb + '/' + BADGES.length)}${stat('Beruntun', (p.daily?.streak ?? 0) + ' hari')}${stat('Monster', String(p.feats?.monsters ?? 0))}${stat('Lokasi', locs)}${stat('Koin', p.coins.toLocaleString('id-ID'))}</div>
      <p style="margin:12px 0 6px;font-weight:800">🏆 Rekor pribadi</p>
      ${recs.length ? recs.map((r, i) => `<div class="prec"><span class="rkm r${i + 1}">${i + 1}</span><div class="grow"><b>${esc(SPECIES[r.sp as keyof typeof SPECIES]?.name ?? r.sp)}</b><small>${esc(DEFAULT_SPOTS.find(s => s.id === r.spot)?.name ?? r.spot)}</small></div><b class="gold2">${fmtKg(r.w)}</b></div>`).join('') : '<p class="muted">Belum ada tangkapan. Ayo lempar kail!</p>'}
      <div class="row" style="margin-top:12px"><button class="btn" id="prChar">👕 Karakter</button><button class="btn" id="prMis">📋 Misi</button><button class="btn" id="prAlb">📖 Album</button></div>`, b => {
      b.querySelector<HTMLElement>('#prChar')!.onclick = () => c.openCharacter();
      b.querySelector<HTMLElement>('#prMis')!.onclick = () => openMissions();
      b.querySelector<HTMLElement>('#prAlb')!.onclick = () => c.openAlbum();
    });
  }

  return { refresh, notify, badge, openMissions, openProfile, openDaily, get dailyReady() { return dailyReady; } };
}

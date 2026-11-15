// Fase 3 & 4 — aturan bersama (server dan mode lokal): kosmetik karakter, turnamen, akuarium,
// pasar antarpemain, dan klub. Semua perubahan koin terjadi di sini, bukan di HP.
import { SPECIES, RODS, LINES, BAITS, type SpeciesId, type RodId, type LineId, type BaitId } from './data';
import { emptySide, giveSide, type Delivery } from './trade';
import { GameError, type Player, type Store, type CatchRec } from './authority';
import { cleanName } from './chat';
import { applyCatch, ensureMissions, checkBadges, BADGES, DAILY_REWARDS, DAILY_BONUS_BAIT, GEMS, type Mission } from './progress';

// ===================== Kosmetik (Fase 3) =====================
export interface Look {
  skin: string; body: string; face: string; glasses: string;
  hat: string; hatColor: string; shirt: string; shirtColor: string; accent: string; neck: string; pants: string; pantsColor: string; shoes: string;
  /** tas di punggung */
  bag: string;
}
export interface CosItem { id: string; name: string; price: number; color?: string }
export type CosTab = 'tubuh' | 'wajah' | 'topi' | 'baju' | 'celana' | 'alas';
/** Katalog: slot → pilihan. Harga 0 = gratis. Warna dalam hex. */
export const COSMETICS: Record<keyof Look, CosItem[]> = {
  skin: [
    { id: 'terang', name: 'Terang', price: 0, color: '#f3d4b8' }, { id: 'langsat', name: 'Kuning langsat', price: 0, color: '#e8bd92' },
    { id: 'kuning', name: 'Kuning', price: 0, color: '#d9a877' }, { id: 'sawo', name: 'Sawo matang', price: 0, color: '#c68a5e' },
    { id: 'cokelat', name: 'Cokelat', price: 0, color: '#a86f47' }, { id: 'gelap', name: 'Gelap', price: 0, color: '#8a5a3c' },
    { id: 'legam', name: 'Legam', price: 0, color: '#6b4430' }, { id: 'sangatgelap', name: 'Sangat gelap', price: 0, color: '#4e3122' },
  ],
  body: [{ id: 'sedang', name: 'Sedang', price: 0 }, { id: 'kurus', name: 'Ramping', price: 0 }, { id: 'gempal', name: 'Gempal', price: 0 }],
  face: [{ id: 'polos', name: 'Polos', price: 0 }, { id: 'jenggot', name: 'Jenggot', price: 120 }],
  glasses: [{ id: 'tanpa', name: 'Tanpa kacamata', price: 0 }, { id: 'hitam', name: 'Kacamata hitam', price: 250 }, { id: 'baca', name: 'Kacamata bening', price: 150 }],
  hat: [{ id: 'tanpa', name: 'Tanpa topi', price: 0 }, { id: 'pet', name: 'Topi pet', price: 0 }, { id: 'kupluk', name: 'Kupluk', price: 120 }, { id: 'rimba', name: 'Topi rimba', price: 180 }, { id: 'caping', name: 'Caping', price: 300 }],
  hatColor: [
    { id: 'krem', name: 'Krem', price: 0, color: '#f2efe6' }, { id: 'putih', name: 'Putih', price: 0, color: '#fafaf7' }, { id: 'hitam', name: 'Hitam', price: 0, color: '#26282c' },
    { id: 'hijau', name: 'Hijau', price: 0, color: '#2f6a4a' }, { id: 'zaitun', name: 'Zaitun', price: 0, color: '#5d6b36' }, { id: 'biru', name: 'Biru dongker', price: 0, color: '#1f3354' },
    { id: 'abu', name: 'Abu-abu', price: 0, color: '#7a7f86' }, { id: 'oranye', name: 'Oranye', price: 100, color: '#e8762a' }, { id: 'merah', name: 'Merah', price: 100, color: '#c0392b' },
  ],
  // jenis baju memancing (bentuk/motif berbeda, bukan hanya warna)
  shirt: [
    { id: 'kemeja', name: 'Kemeja (bawaan)', price: 0 }, { id: 'jersey', name: 'Jersey pancing UV', price: 0 },
    { id: 'kamo', name: 'Jersey kamuflase', price: 250 }, { id: 'vent', name: 'Kemeja pancing berventilasi', price: 300 },
    { id: 'rompi', name: 'Rompi pancing', price: 450 }, { id: 'jaket', name: 'Jaket anti-angin', price: 350 },
    { id: 'hoodie', name: 'Hoodie gunung', price: 0 },
  ],
  shirtColor: [
    { id: 'merah', name: 'Merah', price: 0, color: '#b83a2e' }, { id: 'biru', name: 'Biru', price: 0, color: '#2e5fa8' }, { id: 'hijau', name: 'Hijau', price: 0, color: '#2f7a4a' },
    { id: 'abu', name: 'Abu-abu', price: 0, color: '#7a7f86' }, { id: 'krem', name: 'Krem', price: 0, color: '#d8c9a3' }, { id: 'kuning', name: 'Kuning', price: 80, color: '#e2b93b' },
    { id: 'hitam', name: 'Hitam', price: 80, color: '#26282c' }, { id: 'cokelat', name: 'Cokelat', price: 80, color: '#6b4a2e' }, { id: 'oranye', name: 'Oranye', price: 80, color: '#e8762a' },
    { id: 'zaitun', name: 'Hijau zaitun', price: 80, color: '#5d6b36' }, { id: 'birutua', name: 'Biru tua', price: 0, color: '#1f3354' }, { id: 'kobalt', name: 'Biru kobalt', price: 100, color: '#1f4fd0' }, { id: 'putih', name: 'Putih', price: 120, color: '#eeeeea' },
    { id: 'batu', name: 'Abu kebiruan', price: 0, color: '#566074' },
  ],
  accent: [
    { id: 'oranye', name: 'Oranye', price: 0, color: '#ff8a2a' }, { id: 'kuning', name: 'Kuning', price: 0, color: '#f2c230' }, { id: 'putih', name: 'Putih', price: 0, color: '#f2f2ee' },
    { id: 'hitam', name: 'Hitam', price: 0, color: '#23252a' }, { id: 'biru', name: 'Biru laut', price: 0, color: '#1f6fb8' }, { id: 'toska', name: 'Toska', price: 60, color: '#1aa89a' },
    { id: 'merah', name: 'Merah', price: 60, color: '#c83a2e' }, { id: 'zaitun', name: 'Zaitun', price: 60, color: '#5d6b36' }, { id: 'khaki', name: 'Khaki', price: 60, color: '#b3a077' },
  ],
  neck: [{ id: 'tanpa', name: 'Tanpa buff', price: 0 }, { id: 'buff', name: 'Buff / bandana leher', price: 90 }],
  pants: [{ id: 'panjang', name: 'Celana panjang', price: 0 }, { id: 'kargo', name: 'Celana kargo', price: 150 }],
  pantsColor: [{ id: 'hitam', name: 'Hitam', price: 0, color: '#23252a' }, { id: 'jins', name: 'Jins', price: 0, color: '#3b5a86' }, { id: 'khaki', name: 'Khaki', price: 0, color: '#b3a077' }, { id: 'hijautua', name: 'Hijau tua', price: 80, color: '#2e4632' }, { id: 'dongker', name: 'Biru dongker', price: 0, color: '#1c2640' }, { id: 'marun', name: 'Merah marun', price: 80, color: '#6a2230' }],
  shoes: [{ id: 'hitam', name: 'Sepatu hitam', price: 0, color: '#1c1c1e' }, { id: 'cokelat', name: 'Bot cokelat', price: 150, color: '#5a3a22' }, { id: 'putih', name: 'Kets putih', price: 150, color: '#e6e6e0' }],
  bag: [{ id: 'tanpa', name: 'Tanpa tas', price: 0 }, { id: 'ransel', name: 'Ransel petualang', price: 0 }],
};
export const COS_TABS: { id: CosTab; name: string; slots: (keyof Look)[] }[] = [
  { id: 'tubuh', name: 'Tubuh', slots: ['skin', 'body'] }, { id: 'wajah', name: 'Wajah', slots: ['face', 'glasses'] },
  { id: 'topi', name: 'Topi', slots: ['hat', 'hatColor'] }, { id: 'baju', name: 'Baju', slots: ['shirt', 'shirtColor', 'accent', 'neck', 'bag'] },
  { id: 'celana', name: 'Celana', slots: ['pants', 'pantsColor'] }, { id: 'alas', name: 'Alas kaki', slots: ['shoes'] },
];
export const DEFAULT_LOOK: Look = { skin: 'sawo', body: 'sedang', face: 'polos', glasses: 'tanpa', hat: 'pet', hatColor: 'hitam', shirt: 'hoodie', shirtColor: 'batu', accent: 'oranye', neck: 'tanpa', pants: 'panjang', pantsColor: 'hitam', shoes: 'hitam', bag: 'ransel' };
/** Avatar siap pakai (sekali ketuk). */
export const AVATARS: { name: string; look: Partial<Look> }[] = [
  { name: 'Petualang Serene (hoodie & ransel)', look: { hat: 'pet', hatColor: 'hitam', shirt: 'hoodie', shirtColor: 'batu', pants: 'panjang', pantsColor: 'hitam', shoes: 'hitam', bag: 'ransel', glasses: 'tanpa' } },
  { name: 'Mancing mania (jersey UV)', look: { hat: 'pet', hatColor: 'putih', shirt: 'jersey', shirtColor: 'birutua', accent: 'oranye', pantsColor: 'hitam', glasses: 'hitam' } },
  { name: 'Pemancing danau (rompi)', look: { hat: 'rimba', hatColor: 'zaitun', shirt: 'rompi', shirtColor: 'krem', accent: 'khaki', pants: 'kargo', pantsColor: 'hijautua', shoes: 'cokelat' } },
  { name: 'Petani keramba', look: { hat: 'caping', shirt: 'kemeja', shirtColor: 'krem', pantsColor: 'khaki', skin: 'gelap' } },
  { name: 'Pemburu predator (kamo)', look: { hat: 'pet', hatColor: 'zaitun', shirt: 'kamo', shirtColor: 'zaitun', accent: 'khaki', neck: 'buff', pants: 'kargo', pantsColor: 'hijautua', shoes: 'cokelat' } },
  { name: 'Pemancing laut (jaket)', look: { hat: 'kupluk', hatColor: 'biru', shirt: 'jaket', shirtColor: 'kobalt', accent: 'kuning', neck: 'buff', pantsColor: 'dongker', skin: 'cokelat' } },
];
export const cosItem = (slot: keyof Look, id: string) => COSMETICS[slot]?.find(i => i.id === id);
export const lookOf = (p: Player): Look => ({ ...DEFAULT_LOOK, ...(p.look ?? {}) });
const ownKey = (slot: string, id: string) => slot + ':' + id;
/** Total harga barang yang belum dimiliki. */
export function lookCost(p: Player, look: Partial<Look>) {
  let c = 0;
  for (const [slot, id] of Object.entries(look) as [keyof Look, string][]) {
    const it = cosItem(slot, id); if (!it) throw new GameError('Barang tidak ditemukan: ' + slot);
    if (it.price > 0 && !(p.owned ?? []).includes(ownKey(slot, id))) c += it.price;
  }
  return c;
}

// ===================== Waktu (WIB) =====================
const WIB = 7 * 3600;
export function dayKey(t: number) { const d = new Date((t + WIB) * 1000); return d.toISOString().slice(0, 10).replace(/-/g, ''); }
export function weekKey(t: number) {
  const d = new Date(Math.floor((t + WIB) / 86400) * 86400000); const day = (d.getUTCDay() + 6) % 7; // Senin = 0
  d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(), jan4 = new Date(Date.UTC(y, 0, 4));
  return y + 'W' + String(1 + Math.round(((d.getTime() - jan4.getTime()) / 86400000 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0');
}
/** Detik sampai periode berakhir. */
export function endsIn(kind: 'harian' | 'mingguan', t: number) {
  const local = t + WIB, dayEnd = (Math.floor(local / 86400) + 1) * 86400;
  if (kind === 'harian') return dayEnd - local;
  const dow = (new Date(Math.floor(local / 86400) * 86400000).getUTCDay() + 6) % 7;
  return dayEnd - local + (6 - dow) * 86400;
}

// ===================== Turnamen =====================
export interface TourDef { kind: 'harian' | 'mingguan'; name: string; desc: string; species?: SpeciesId; prizes: number[]; join: number }
export const TOURS: TourDef[] = [
  { kind: 'harian', name: 'Turnamen Harian', desc: 'Ikan terberat jenis apa saja hari ini.', prizes: [500, 300, 150], join: 0 },
  { kind: 'mingguan', name: 'Raja Nila Mingguan', desc: 'Nila terberat minggu ini.', species: 'nila', prizes: [1500, 800, 400], join: 50 },
];
export const TOUR_PARTICIPATION = 30;
interface TourEntry { name: string; best: number; species?: SpeciesId; n: number; claimed?: boolean }
interface TourDoc { entries: Record<string, TourEntry> }
export const tourId = (kind: TourDef['kind'], t: number) => kind === 'harian' ? 'D' + dayKey(t) : 'W' + weekKey(t);

// ===================== Akuarium =====================
export const AQ_SIZE = 6, AQ_BIG_SIZE = 12, AQ_BIG_PRICE = 800;
export function aqVisitBonus(fish: CatchRec[]) { return 10 + fish.reduce((a, f) => a + (f.tier >= 3 ? 25 : f.tier === 2 ? 10 : 3), 0); }
export const aqValue = (fish: CatchRec[]) => fish.reduce((a, f) => a + f.value, 0);

// ===================== Pasar =====================
export type ListKind = 'rod' | 'line' | 'bait';
/** Barang di lapak. Umpan dijual per bungkus `qty` butir dengan harga total `price`. */
export interface Listing { id: string; seller: string; sellerName: string; kind: ListKind; item: string; price: number; at: number; rare?: boolean; qty?: number }
/** paid: hasil penjualan yang menunggu diambil penjual (tidak menulis data penjual dari permintaan pembeli). */
interface MarketDoc { items: Listing[]; paid?: Delivery[] }
export const MARKET_MAX_BAIT = 999;
export const MARKET_FEE = 0.1, MARKET_MIN = 5, MARKET_TTL = 3 * 86400, MARKET_MAX_PER = 5;

// ===================== Klub =====================
export interface Club { id: string; name: string; tag: string; icon: string; owner: string; members: { id: string; name: string }[]; week: string; kg: number; claimed: string[]; createdAt: number }
interface ClubsDoc { list: Club[] }
export const CLUB_ICONS = ['🪝', '🐟', '🌊', '⚓', '👑'];
export const CLUB_PRICE = 200, CLUB_MAX = 30, CLUB_TARGET_KG = 100, CLUB_REWARD = 300;

/** Dokumen bersama di Store (turnamen, pasar, klub). updateDoc harus atomik. */
export interface DocStore {
  getDoc<T>(key: string): Promise<T | null>;
  updateDoc<T>(key: string, fn: (cur: T | null) => T | Promise<T>): Promise<T>;
}

export interface SocialOptions { store: Store & DocStore; now?: () => number; newId?: () => string; rng?: () => number }

export class Social {
  private now: () => number; private id: () => string;
  constructor(private o: SocialOptions) {
    this.now = o.now ?? (() => Date.now() / 1000);
    let seq = 0; this.id = o.newId ?? (() => 's' + Date.now().toString(36) + (++seq).toString(36) + Math.floor((o.rng ?? Math.random)() * 1e6).toString(36));
  }
  private async player(pid: string) { const p = await this.o.store.getPlayer(pid); if (!p) throw new GameError('Pemain tidak ditemukan.', 401); return p; }
  private save(p: Player) { return this.o.store.savePlayer(p); }

  // ---------- kosmetik ----------
  /** Pakai tampilan; barang berbayar yang belum dimiliki dibeli sekaligus. */
  async setLook(pid: string, look: Partial<Look>) {
    const p = await this.player(pid);
    const clean: Partial<Look> = {};
    for (const k of Object.keys(DEFAULT_LOOK) as (keyof Look)[]) if (look[k] !== undefined) clean[k] = String(look[k]);
    const cost = lookCost(p, clean);
    if (p.coins < cost) throw new GameError(`Koin tidak cukup (butuh ${cost}).`);
    p.coins -= cost;
    p.owned = p.owned ?? [];
    for (const [slot, id] of Object.entries(clean)) { const it = cosItem(slot as keyof Look, id!)!; if (it.price > 0 && !p.owned.includes(ownKey(slot, id!))) p.owned.push(ownKey(slot, id!)); }
    p.look = { ...lookOf(p), ...clean };
    await this.save(p);
    return { player: p, spent: cost };
  }

  // ---------- turnamen ----------
  async tournaments(pid: string) {
    const t = this.now();
    return Promise.all(TOURS.map(async def => {
      const id = tourId(def.kind, t), doc = await this.o.store.getDoc<TourDoc>('tour:' + id);
      const rows = Object.entries(doc?.entries ?? {}).filter(([, e]) => e.best > 0).map(([id2, e]) => ({ id: id2, ...e })).sort((a, b) => b.best - a.best);
      const me = doc?.entries[pid];
      return { ...def, id, endsIn: endsIn(def.kind, t), joined: !!me, myBest: me?.best ?? 0, myRank: me && me.best > 0 ? rows.findIndex(r => r.id === pid) + 1 : 0, entrants: Object.keys(doc?.entries ?? {}).length, top: rows.slice(0, 10).map(r => ({ name: r.name, best: r.best, species: r.species })) };
    }));
  }
  async joinTournament(pid: string, kind: TourDef['kind']) {
    const def = TOURS.find(d => d.kind === kind); if (!def) throw new GameError('Turnamen tidak ditemukan.');
    const p = await this.player(pid), id = tourId(kind, this.now());
    let already = false;
    await this.o.store.updateDoc<TourDoc>('tour:' + id, cur => {
      const d = cur ?? { entries: {} };
      if (d.entries[pid]) { already = true; return d; }
      if (p.coins < def.join) throw new GameError('Koin tidak cukup untuk biaya pendaftaran.');
      d.entries[pid] = { name: p.name, best: 0, n: 0 }; return d;
    });
    if (already) throw new GameError('Anda sudah terdaftar.');
    if (def.join) { p.coins -= def.join; await this.save(p); }
    return { player: p };
  }
  /** Dipanggil setiap tangkapan sah (server & mode lokal). Menambah skor turnamen & kg klub. */
  /** opt.missions / opt.tours = false: tangkapan (mis. otomatis) tidak dihitung untuk misi/lencana atau turnamen. */
  async onCatch(pid: string, name: string, c: CatchRec, opt: { missions?: boolean; tours?: boolean } = {}) {
    if (opt.missions !== false) { // misi harian, lencana, catatan prestasi
      const p = await this.o.store.getPlayer(pid);
      if (p) { applyCatch(p, c, this.now()); await this.save(p); }
    }
    if (opt.tours === false) return;
    for (const def of TOURS) {
      if (def.species && def.species !== c.species) continue;
      const id = tourId(def.kind, c.at);
      const doc = await this.o.store.getDoc<TourDoc>('tour:' + id);
      if (!doc?.entries[pid]) continue;
      await this.o.store.updateDoc<TourDoc>('tour:' + id, cur => {
        const d = cur ?? { entries: {} }, e = d.entries[pid]; if (!e) return d;
        e.n++; if (c.weight > e.best) { e.best = c.weight; e.species = c.species; } e.name = name; return d;
      });
    }
    const p = await this.o.store.getPlayer(pid);
    if (p?.club) await this.o.store.updateDoc<ClubsDoc>('clubs', cur => {
      const d = cur ?? { list: [] }, cl = d.list.find(x => x.id === p.club); if (!cl) return d;
      const wk = weekKey(c.at); if (cl.week !== wk) { cl.week = wk; cl.kg = 0; cl.claimed = []; }
      cl.kg = Math.round((cl.kg + c.weight) * 100) / 100; return d;
    });
  }
  /** Ambil hadiah turnamen yang sudah selesai (juara 1–3 dan hadiah ikut serta). */
  async claimTournaments(pid: string) {
    const p = await this.player(pid), t = this.now(), got: { name: string; rank: number; coins: number }[] = [];
    for (const def of TOURS) for (let back = 1; back <= (def.kind === 'harian' ? 7 : 4); back++) {
      const id = tourId(def.kind, t - back * (def.kind === 'harian' ? 86400 : 7 * 86400));
      const doc = await this.o.store.getDoc<TourDoc>('tour:' + id), e = doc?.entries[pid];
      if (!e || e.claimed || e.best <= 0) continue;
      let prize = 0, rank = 0;
      await this.o.store.updateDoc<TourDoc>('tour:' + id, cur => {
        const d = cur!, me = d.entries[pid]; if (!me || me.claimed) return d;
        const rows = Object.entries(d.entries).filter(([, x]) => x.best > 0).sort((a, b) => b[1].best - a[1].best);
        rank = rows.findIndex(([k]) => k === pid) + 1;
        prize = def.prizes[rank - 1] ?? TOUR_PARTICIPATION; me.claimed = true; return d;
      });
      if (prize) { p.coins += prize; got.push({ name: def.name, rank, coins: prize }); }
    }
    if (got.length) await this.save(p);
    return { player: p, rewards: got };
  }

  // ---------- progres: misi, hadiah harian, lencana ----------
  /** Siapkan misi hari ini & periksa lencana; dipanggil saat pemain membuka game / layar misi. */
  async progress(pid: string) {
    await this.collectPaid(pid);
    const p = await this.player(pid);
    const before = JSON.stringify([p.missions?.day, p.badges]);
    ensureMissions(p, this.now()); checkBadges(p);
    if (JSON.stringify([p.missions?.day, p.badges]) !== before) await this.save(p);
    return { player: p, dailyReady: p.daily?.last !== dayKey(this.now()) };
  }
  async claimMission(pid: string, id: string) {
    const p = await this.player(pid), b = ensureMissions(p, this.now());
    const m: Mission | undefined = b.list.find(x => x.id === id);
    if (!m) throw new GameError('Misi sudah berganti. Lihat misi hari ini.');
    if (m.claimed) throw new GameError('Hadiah misi ini sudah diambil.');
    if (m.progress < m.target) throw new GameError('Misi belum selesai.');
    m.claimed = true; p.coins += m.reward; p.xp += m.xp;
    const all = b.list.every(x => x.claimed), bonus = all ? 150 : 0; p.coins += bonus; // bonus menyelesaikan ketiganya
    const gems = GEMS.mission + (all ? GEMS.allMissions : 0); p.gems = (p.gems ?? 0) + gems;
    checkBadges(p); await this.save(p);
    return { player: p, coins: m.reward + bonus, xp: m.xp, bonus, gems };
  }
  async claimDaily(pid: string) {
    const p = await this.player(pid), t = this.now(), today = dayKey(t), yesterday = dayKey(t - 86400);
    if (p.daily?.last === today) throw new GameError('Hadiah hari ini sudah diambil. Kembali besok!');
    const streak = p.daily?.last === yesterday ? p.daily.streak + 1 : 1;
    const day = ((streak - 1) % 7) + 1, coins = DAILY_REWARDS[day - 1];
    p.daily = { last: today, streak }; p.coins += coins;
    if (day === 7) p.bait[DAILY_BONUS_BAIT.bait] = (p.bait[DAILY_BONUS_BAIT.bait] ?? 0) + DAILY_BONUS_BAIT.n;
    const gems = day === 7 ? GEMS.daily7 : 0; p.gems = (p.gems ?? 0) + gems;
    checkBadges(p); await this.save(p);
    return { player: p, coins, day, streak, bait: day === 7 ? DAILY_BONUS_BAIT : null, gems };
  }
  async claimBadge(pid: string, id: string) {
    const p = await this.player(pid), b = BADGES.find(x => x.id === id);
    if (!b) throw new GameError('Lencana tidak dikenal.');
    checkBadges(p);
    if (p.badges?.[id] !== 'baru') throw new GameError(p.badges?.[id] === 'diambil' ? 'Hadiah lencana sudah diambil.' : 'Lencana belum didapat.');
    p.badges[id] = 'diambil'; p.coins += b.reward; p.gems = (p.gems ?? 0) + GEMS.badge; await this.save(p);
    return { player: p, coins: b.reward, gems: GEMS.badge };
  }

  // ---------- akuarium ----------
  aqCap(p: Player) { return p.aqBig ? AQ_BIG_SIZE : AQ_SIZE; }
  async toAquarium(pid: string, catchId: string) {
    const p = await this.player(pid); p.aquarium = p.aquarium ?? [];
    if (p.aquarium.length >= this.aqCap(p)) throw new GameError('Akuarium penuh.');
    const i = p.basket.findIndex(c => c.id === catchId); if (i < 0) throw new GameError('Ikan tidak ada di keranjang.');
    p.aquarium.push(p.basket.splice(i, 1)[0]); await this.save(p); return { player: p };
  }
  async fromAquarium(pid: string, catchId: string, to: 'lepas' | 'jual') {
    const p = await this.player(pid); p.aquarium = p.aquarium ?? [];
    const i = p.aquarium.findIndex(c => c.id === catchId); if (i < 0) throw new GameError('Ikan tidak ada di akuarium.');
    const [c] = p.aquarium.splice(i, 1);
    if (to === 'jual') p.coins += c.value; else { p.xp += 2; await this.o.store.putStock(c.spot, c.species); }
    await this.save(p); return { player: p };
  }
  async buyBigAquarium(pid: string) {
    const p = await this.player(pid); if (p.aqBig) throw new GameError('Akuarium besar sudah dimiliki.');
    if (p.coins < AQ_BIG_PRICE) throw new GameError('Koin tidak cukup.');
    p.coins -= AQ_BIG_PRICE; p.aqBig = true; await this.save(p); return { player: p };
  }
  /** Tiket pengunjung: bonus koin sekali per 20 jam. */
  async claimVisitors(pid: string) {
    const p = await this.player(pid), t = this.now(), fish = p.aquarium ?? [];
    if (!fish.length) throw new GameError('Isi akuarium dulu dengan ikan dari keranjang.');
    const wait = (p.aqClaimAt ?? 0) + 20 * 3600 - t;
    if (wait > 0) throw new GameError(`Pengunjung datang lagi dalam ${Math.ceil(wait / 3600)} jam.`);
    const coins = aqVisitBonus(fish); p.coins += coins; p.aqClaimAt = t; await this.save(p);
    return { player: p, coins };
  }

  // ---------- pasar ----------
  async market() {
    const t = this.now(), d = await this.o.store.getDoc<MarketDoc>('market');
    return (d?.items ?? []).filter(x => x.at + MARKET_TTL > t).sort((a, b) => b.at - a.at);
  }
  /** Ambil hasil penjualan lapak (koin) yang menunggu. */
  async collectPaid(pid: string) {
    const pre = await this.o.store.getDoc<MarketDoc>('market');
    if (!pre?.paid?.some(x => x.to === pid)) return { coins: 0, n: 0 };
    let coins = 0, n = 0;
    await this.o.store.updateDoc<MarketDoc>('market', async cur => {
      const d: MarketDoc = { items: cur?.items ?? [], paid: cur?.paid ?? [] }, mine = d.paid!.filter(x => x.to === pid);
      if (!mine.length) return d;
      const p = await this.player(pid); for (const g of mine) { coins += g.side.coins; n++; giveSide(p, g.side); }
      await this.save(p); d.paid = d.paid!.filter(x => x.to !== pid); return d;
    });
    return { coins, n };
  }
  async listItem(pid: string, a: { kind: ListKind; item: string; price: number; qty?: number }) {
    const p = await this.player(pid), price = Math.floor(Number(a.price));
    if (!(price >= MARKET_MIN && price <= 100000)) throw new GameError(`Harga minimal ${MARKET_MIN} koin.`);
    let qty: number | undefined;
    if (a.kind === 'rod') {
      const k = a.item as RodId; if (!RODS[k]) throw new GameError('Joran tidak dikenal.');
      if (!p.rods.includes(k)) throw new GameError('Joran tidak ada di tas.');
      if (k === 'pemula') throw new GameError('Joran pemula tidak bisa dijual.');
      if (p.curRod === k) throw new GameError('Ganti joran yang dipakai dulu.');
      p.rods = p.rods.filter(r => r !== k);
    } else if (a.kind === 'line') {
      const k = a.item as LineId; if (!LINES[k]) throw new GameError('Senar tidak dikenal.');
      if (!p.lines.includes(k)) throw new GameError('Senar tidak ada di tas.');
      if (k === 'l20') throw new GameError('Senar bawaan tidak bisa dijual.');
      if (p.curLine === k) throw new GameError('Ganti senar yang dipakai dulu.');
      p.lines = p.lines.filter(r => r !== k);
    } else if (a.kind === 'bait') {
      const k = a.item as BaitId; if (!BAITS[k]) throw new GameError('Umpan tidak dikenal.');
      qty = Math.floor(Number(a.qty));
      if (!(qty >= 1 && qty <= MARKET_MAX_BAIT)) throw new GameError(`Jumlah umpan 1–${MARKET_MAX_BAIT}.`);
      if ((p.bait[k] ?? 0) < qty) throw new GameError(`Umpan ${BAITS[k].name} di tas hanya ${p.bait[k] ?? 0}.`);
      p.bait[k] = (p.bait[k] ?? 0) - qty;
    } else throw new GameError('Jenis barang tidak dikenal.');
    const L: Listing = { id: this.id(), seller: pid, sellerName: p.name, kind: a.kind, item: a.item, price, at: this.now(), ...(qty ? { qty } : {}) };
    await this.o.store.updateDoc<MarketDoc>('market', cur => {
      const d = { items: cur?.items ?? [], paid: cur?.paid ?? [] };
      if (d.items.filter(x => x.seller === pid && x.at + MARKET_TTL > this.now()).length >= MARKET_MAX_PER) throw new GameError(`Maksimal ${MARKET_MAX_PER} barang di lapak.`);
      d.items.push(L); return d;
    });
    await this.save(p); return { player: p, listing: L };
  }
  private giveItem(p: Player, L: Listing) {
    if (L.kind === 'rod') { if (!p.rods.includes(L.item as RodId)) p.rods.push(L.item as RodId); }
    else if (L.kind === 'bait') p.bait[L.item as BaitId] = (p.bait[L.item as BaitId] ?? 0) + (L.qty ?? 1);
    else if (!p.lines.includes(L.item as LineId)) p.lines.push(L.item as LineId);
  }
  /** Tarik barang sendiri (atau yang kedaluwarsa) kembali ke tas. */
  async cancelListing(pid: string, id: string) {
    let L: Listing | undefined;
    await this.o.store.updateDoc<MarketDoc>('market', cur => {
      const d = { items: cur?.items ?? [], paid: cur?.paid ?? [] }, i = d.items.findIndex(x => x.id === id && x.seller === pid);
      if (i < 0) throw new GameError('Barang tidak ditemukan di lapak Anda.');
      L = d.items.splice(i, 1)[0]; return d;
    });
    const p = await this.player(pid); this.giveItem(p, L!); await this.save(p); return { player: p };
  }
  async buyListing(pid: string, id: string) {
    await this.player(pid); // pembeli harus ada (galat 401 bila tidak)
    let L: Listing | undefined, buyer: Player | undefined;
    // Pembeli dibaca, dicek, dipotong koinnya, dan disimpan DI DALAM kunci dokumen pasar.
    // Koin penjual dicatat di daftar `paid` dokumen yang sama (atomik) dan diambil penjual sendiri —
    // permintaan pembeli tidak pernah menulis data penjual (bisa bentrok dengan permintaan penjual yang berjalan bersamaan).
    await this.o.store.updateDoc<MarketDoc>('market', async cur => {
      const d = { items: cur?.items ?? [], paid: cur?.paid ?? [] }, i = d.items.findIndex(x => x.id === id);
      if (i < 0 || d.items[i].at + MARKET_TTL <= this.now()) throw new GameError('Barang sudah terjual atau ditarik.');
      if (d.items[i].seller === pid) throw new GameError('Tidak bisa membeli barang sendiri.');
      const b = await this.player(pid), it = d.items[i];
      if (it.kind !== 'bait' && (it.kind === 'rod' ? b.rods : b.lines as string[]).includes(it.item)) throw new GameError('Anda sudah punya barang ini.');
      if (b.coins < it.price) throw new GameError('Koin tidak cukup.');
      L = d.items.splice(i, 1)[0];
      b.coins -= L.price; this.giveItem(b, L);
      if (!L.seller.startsWith('npc')) d.paid.push({ id: this.id(), to: L.seller, side: { ...emptySide(), coins: Math.floor(L.price * (1 - MARKET_FEE)) }, why: 'pasar', fromName: b.name, at: this.now() });
      await this.save(b); buyer = b;
      return d;
    });
    if (!buyer || !L) throw new GameError('Pembelian gagal.');
    return { player: buyer, bought: L! };
  }

  // ---------- klub ----------
  async clubs(pid: string) {
    const d = await this.o.store.getDoc<ClubsDoc>('clubs'), wk = weekKey(this.now());
    const list = (d?.list ?? []).map(c => ({ ...c, kg: c.week === wk ? c.kg : 0, claimed: c.week === wk ? c.claimed : [] }));
    return { list: list.sort((a, b) => b.kg - a.kg), mine: list.find(c => c.members.some(m => m.id === pid)) ?? null, target: CLUB_TARGET_KG, reward: CLUB_REWARD };
  }
  async createClub(pid: string, a: { name: string; tag: string; icon: string }) {
    const p = await this.player(pid);
    if (p.club) throw new GameError('Keluar dari klub sekarang dulu.');
    const name = cleanName(a.name).slice(0, 24), tag = String(a.tag ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (name.length < 3) throw new GameError('Nama klub minimal 3 huruf.');
    if (tag.length < 2 || tag.length > 4) throw new GameError('Singkatan 2–4 huruf/angka.');
    if (p.coins < CLUB_PRICE) throw new GameError(`Membuat klub butuh ${CLUB_PRICE} koin.`);
    const c: Club = { id: this.id(), name, tag, icon: CLUB_ICONS.includes(a.icon) ? a.icon : CLUB_ICONS[0], owner: pid, members: [{ id: pid, name: p.name }], week: weekKey(this.now()), kg: 0, claimed: [], createdAt: this.now() };
    await this.o.store.updateDoc<ClubsDoc>('clubs', cur => {
      const d = cur ?? { list: [] };
      if (d.list.some(x => x.name.toLowerCase() === name.toLowerCase() || x.tag === tag)) throw new GameError('Nama atau singkatan klub sudah dipakai.');
      d.list.push(c); return d;
    });
    p.coins -= CLUB_PRICE; p.club = c.id; await this.save(p); return { player: p, club: c };
  }
  async joinClub(pid: string, clubId: string) {
    const p = await this.player(pid); if (p.club) throw new GameError('Keluar dari klub sekarang dulu.');
    await this.o.store.updateDoc<ClubsDoc>('clubs', cur => {
      const d = cur ?? { list: [] }, c = d.list.find(x => x.id === clubId);
      if (!c) throw new GameError('Klub tidak ditemukan.');
      if (c.members.length >= CLUB_MAX) throw new GameError('Klub sudah penuh.');
      c.members.push({ id: pid, name: p.name }); return d;
    });
    p.club = clubId; await this.save(p); return { player: p };
  }
  async leaveClub(pid: string) {
    const p = await this.player(pid); if (!p.club) throw new GameError('Anda belum masuk klub.');
    const cid = p.club;
    await this.o.store.updateDoc<ClubsDoc>('clubs', cur => {
      const d = cur ?? { list: [] }, c = d.list.find(x => x.id === cid); if (!c) return d;
      c.members = c.members.filter(m => m.id !== pid);
      if (!c.members.length) d.list = d.list.filter(x => x !== c);           // klub kosong dihapus
      else if (c.owner === pid) c.owner = c.members[0].id;                     // ketua pindah ke anggota tertua
      return d;
    });
    p.club = undefined; await this.save(p); return { player: p };
  }
  /** Hadiah target mingguan klub: sekali per anggota per minggu. */
  async claimClub(pid: string) {
    const p = await this.player(pid); if (!p.club) throw new GameError('Anda belum masuk klub.');
    const wk = weekKey(this.now()), cid = p.club;
    await this.o.store.updateDoc<ClubsDoc>('clubs', cur => {
      const d = cur ?? { list: [] }, c = d.list.find(x => x.id === cid); if (!c) throw new GameError('Klub tidak ditemukan.');
      if (c.week !== wk || c.kg < CLUB_TARGET_KG) throw new GameError(`Target klub minggu ini ${CLUB_TARGET_KG} kg belum tercapai.`);
      if (c.claimed.includes(pid)) throw new GameError('Hadiah minggu ini sudah diambil.');
      c.claimed.push(pid); return d;
    });
    p.coins += CLUB_REWARD; await this.save(p); return { player: p, coins: CLUB_REWARD };
  }
}

export const itemName = (kind: ListKind, id: string) => kind === 'rod' ? RODS[id as RodId]?.name ?? id : kind === 'bait' ? 'Umpan ' + (BAITS[id as BaitId]?.name ?? id) : LINES[id as LineId]?.name ?? id;
export const speciesName = (k: SpeciesId) => SPECIES[k]?.name ?? k;

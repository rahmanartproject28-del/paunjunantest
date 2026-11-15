// "Otoritas" memancing: logika server yang menentukan hasil.
// Server Node memakainya dengan penyimpanan database; game memakainya di mode lokal
// dengan penyimpanan perangkat. Kodenya sama, jadi hasilnya identik.
import {
  SPECIES, DEFAULT_SPOTS, BAITS, RODS, LINES, START_COINS, START_BAIT, BASKET_SIZE, BASKET_BIG_SIZE, BASKET_BIG_PRICE,
  type SpeciesId, type Zone, type SubZone, type WeatherId, type BaitId, type RodId, type LineId,
} from './data';
import {
  spotRates, biteDelay, pickWeighted, pickSize, fightStrength, minFightSeconds, activityLevel,
  sellPrice, catchXp, fishLengthCm, levelInfo, starsFor, HOOK_EARLY, HOOK_LATE, type Rng, type RateTable,
} from './rules';
import { DEFAULT_AUTO, autoStatus, autoUse, autoRoll, type AutoConfig } from './auto';
import { applyOffline, type OfflineBatch } from './offline';

export interface CatchRec {
  id: string; species: SpeciesId; name: string; weight: number; length: number; tier: number; stars: number;
  spot: string; at: number; value: number;
  /** ditangkap lewat mancing otomatis */
  auto?: boolean;
}
export interface Player {
  id: string; name: string; coins: number; xp: number;
  bait: Partial<Record<BaitId, number>>; curBait: BaitId;
  rods: RodId[]; curRod: RodId; lines: LineId[]; curLine: LineId;
  basket: CatchRec[]; best: Record<string, number>; album: Partial<Record<SpeciesId, number>>;
  stats: { catches: number; totalKg: number; heaviest: number };
  createdAt: number;
  // Fase 3 & 4 (opsional supaya data lama tetap terbaca)
  look?: Partial<import('./social').Look>; owned?: string[];
  aquarium?: CatchRec[]; aqBig?: boolean; aqClaimAt?: number; club?: string;
  /** Keranjang besar (20 ikan) sudah dibeli. */
  bigBasket?: boolean;
  /** pemakaian mancing otomatis hari ini */
  autoUse?: import('./auto').AutoUse;
  /** akun diblokir admin (until 0 = permanen, detik unix) */
  banned?: { until: number; reason: string; by: string; at: number };
  // progres: misi harian, hadiah harian, lencana, catatan prestasi
  missions?: import('./progress').MissionBoard; daily?: { last: string; streak: number };
  badges?: Record<string, 'baru' | 'diambil'>; feats?: { monsters: number; locs: string[] };
  /** Permata (mata uang langka): dari misi, hadiah harian hari ke-7, dan lencana. */
  gems?: number;
  /** waktu tangkapan luring terakhir yang sudah diterima server (cegah kirim ulang) */
  offlineAt?: number; offlineSid?: string;
}
export interface LeaderRow { playerId: string; name: string; value: number; species?: SpeciesId; at?: number }

/** Penyimpanan: implementasi memori, perangkat (localStorage), atau MySQL. */
export interface Store {
  getPlayer(id: string): Promise<Player | null>;
  savePlayer(p: Player): Promise<void>;
  getStock(spot: string): Promise<Partial<Record<SpeciesId, number>> | null>;
  /** Kurangi stok 1 secara atomik. true bila berhasil. */
  takeStock(spot: string, k: SpeciesId): Promise<boolean>;
  putStock(spot: string, k: SpeciesId): Promise<void>;
  initStock(spot: string, stock: Partial<Record<SpeciesId, number>>): Promise<void>;
  addCatch(playerId: string, playerName: string, c: CatchRec): Promise<void>;
  leaderboard(kind: 'heaviest' | 'most' | 'level', since: number, limit: number): Promise<LeaderRow[]>;
  /** Ikan terberat per pemancing dalam rentang waktu (papan acara). */
  topCatches?(since: number, until: number, species: SpeciesId | null, limit: number): Promise<{ name: string; weight: number; species: SpeciesId; at: number }[]>;
  /** Hapus pemain & tangkapannya (hapus akun). */
  deletePlayer?(id: string): Promise<void>;
}

/** Kapasitas keranjang pemain (10, atau 20 dengan keranjang besar). */
export const basketCap = (p: Pick<Player, 'bigBasket'>) => p.bigBasket ? BASKET_BIG_SIZE : BASKET_SIZE;

export class GameError extends Error { constructor(msg: string, public status = 400) { super(msg); } }

interface CastState { id: string; pid: string; spot: string; zone: Zone; sub: SubZone; bait: BaitId; at: number; biteAt: number | null; status: 'open' | 'done' }
interface HookState { id: string; pid: string; spot: string; k: SpeciesId; weight: number; tier: number; t: number; at: number }

export interface WorldInfo {
  weather: WeatherId; hour: number; motd?: string; backdropAt?: number; hideFarTrees?: boolean; backdropBackAt?: number; bedAt?: number; waterClarity?: 'jernih' | 'sedang' | 'keruh'; event?: import('./admin').GameEvent | null;
  spots: { id: string; name: string; desc: string; depth: string; loc: string; minLv: number; activity: string }[];
}
export type HookResult =
  | { result: 'hooked'; hookId: string; species: SpeciesId; name: string; weight: number; tier: number; t: number; strength: number; minFight: number }
  | { result: 'spooked' | 'eaten' | 'nothing' };

export interface AuthorityOptions {
  store: Store; rng: Rng; now?: () => number; newId?: () => string;
  weather?: () => WeatherId; rates?: () => RateTable; hour?: () => number;
  /** pengali harga jual & XP (diatur admin) */
  priceMul?: () => number; xpMul?: () => number;
  /** pengaturan mancing otomatis (dari panel admin) */
  auto?: () => AutoConfig;
  /** mode lokal/uji: semua lokasi terbuka tanpa syarat level */
  ignoreLevelLock?: boolean;
}

export class Authority {
  private casts = new Map<string, CastState>();
  private hooks = new Map<string, HookState>();
  private lastCast = new Map<string, number>();
  private o: Required<AuthorityOptions>;
  private seq = 0;

  constructor(opts: AuthorityOptions) {
    this.o = {
      now: () => Date.now() / 1000,
      newId: () => (Date.now().toString(36) + (++this.seq).toString(36) + Math.floor(opts.rng() * 1e9).toString(36)),
      weather: () => 'cerah', rates: () => ({}), priceMul: () => 1, xpMul: () => 1, auto: () => DEFAULT_AUTO, ignoreLevelLock: false, hour: () => new Date().getHours() + new Date().getMinutes() / 60,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    } as Required<AuthorityOptions>;
  }

  async ensureStock() {
    for (const s of DEFAULT_SPOTS) if (!(await this.o.store.getStock(s.id))) await this.o.store.initStock(s.id, { ...s.stock });
  }

  newPlayer(id: string, name: string): Player {
    return {
      id, name, coins: START_COINS, xp: 0, bait: { udang: START_BAIT }, curBait: 'udang',
      rods: ['pemula'], curRod: 'pemula', lines: ['l20'], curLine: 'l20',
      basket: [], best: {}, album: {}, stats: { catches: 0, totalKg: 0, heaviest: 0 }, createdAt: this.o.now(),
    };
  }

  private async player(pid: string) {
    const p = await this.o.store.getPlayer(pid);
    if (!p) throw new GameError('Pemain tidak ditemukan. Silakan masuk lagi.', 401);
    return p;
  }

  async world(): Promise<WorldInfo> {
    await this.ensureStock();
    const weather = this.o.weather();
    const spots = [];
    for (const s of DEFAULT_SPOTS) {
      const st = (await this.o.store.getStock(s.id)) ?? s.stock;
      const { total } = spotRates(st, '', '', weather, 'racik', this.o.rates());
      spots.push({ id: s.id, name: s.name, desc: s.desc, depth: s.depth, loc: s.loc, minLv: s.minLv, activity: activityLevel(total) });
    }
    return { weather, hour: this.o.hour(), spots };
  }

  /** 1) Melempar: server menentukan kapan ikan menyambar. */
  async cast(pid: string, a: { spot: string; zone: Zone; sub: SubZone }) {
    const p = await this.player(pid);
    const now = this.o.now();
    const sd = DEFAULT_SPOTS.find(s => s.id === a.spot);
    if (!sd) throw new GameError('Spot tidak ditemukan.');
    if (!this.o.ignoreLevelLock && levelInfo(p.xp).lv < sd.minLv) throw new GameError(`Lokasi ini terbuka di level ${sd.minLv}.`, 403);
    if (a.zone !== 'near' && a.zone !== 'far') throw new GameError('Zona tidak valid.');
    if ((p.bait[p.curBait] ?? 0) <= 0) throw new GameError('Umpan habis. Beli atau ganti umpan.');
    if (now - (this.lastCast.get(pid) ?? 0) < 1.5) throw new GameError('Lemparan terlalu cepat.', 429);
    this.lastCast.set(pid, now);
    for (const c of this.casts.values()) if (c.pid === pid) this.casts.delete(c.id);
    await this.ensureStock();
    const st = (await this.o.store.getStock(a.spot))!;
    const { total } = spotRates(st, a.zone, a.sub, this.o.weather(), p.curBait, this.o.rates());
    const d = biteDelay(total, this.o.rng);
    const c: CastState = { id: this.o.newId(), pid, spot: a.spot, zone: a.zone, sub: a.sub, bait: p.curBait, at: now, biteAt: d === null ? null : now + d, status: 'open' };
    this.casts.set(c.id, c);
    return { castId: c.id, biteIn: d === null ? null : Math.round(d * 100) / 100, nibbles: 1 + Math.floor(this.o.rng() * 3), quiet: total < 4 };
  }

  /** 2) Menyentak: server memilih jenis & berat ikan. */
  async hook(pid: string, a: { castId: string }): Promise<HookResult> {
    const p = await this.player(pid);
    const c = this.casts.get(a.castId);
    if (!c || c.pid !== pid || c.status !== 'open') throw new GameError('Lemparan tidak ditemukan atau sudah selesai.');
    c.status = 'done'; this.casts.delete(c.id);
    const now = this.o.now();
    if (c.biteAt === null) return { result: 'nothing' };
    if (now < c.biteAt - HOOK_EARLY) return { result: 'spooked' };
    if (now > c.biteAt + HOOK_LATE) { this.useBait(p, c.bait); await this.o.store.savePlayer(p); return { result: 'eaten' }; }
    const st = (await this.o.store.getStock(c.spot))!;
    const { rates, total } = spotRates(st, c.zone, c.sub, this.o.weather(), c.bait, this.o.rates());
    if (total <= 0) return { result: 'spooked' };
    const k = pickWeighted(rates, this.o.rng);
    const { tier, t, weight } = pickSize(k, this.o.rng, this.o.rates());
    if (!(await this.o.store.takeStock(c.spot, k))) return { result: 'spooked' };
    this.useBait(p, c.bait); await this.o.store.savePlayer(p);
    const h: HookState = { id: this.o.newId(), pid, spot: c.spot, k, weight, tier, t, at: now };
    this.hooks.set(h.id, h);
    return { result: 'hooked', hookId: h.id, species: k, name: SPECIES[k].name, weight, tier, t,
      strength: Math.round(fightStrength(k, weight, t, tier) * 1000) / 1000, minFight: minFightSeconds(weight) };
  }

  /** 3) Selesai adu tarik: dapat atau lepas. */
  async land(pid: string, a: { hookId: string; result: 'caught' | 'lost'; keep?: boolean; auto?: boolean }) {
    const h = this.hooks.get(a.hookId);
    if (!h || h.pid !== pid) throw new GameError('Tarikan tidak ditemukan atau sudah selesai.');
    this.hooks.delete(h.id);
    const now = this.o.now(), el = now - h.at;
    if (el > 900) { await this.o.store.putStock(h.spot, h.k); throw new GameError('Tarikan kedaluwarsa.'); }
    if (a.result === 'lost') { await this.o.store.putStock(h.spot, h.k); return { result: 'lost' as const }; }
    if (el < minFightSeconds(h.weight) - 0.25) {
      await this.o.store.putStock(h.spot, h.k);
      throw new GameError('Tangkapan ditolak karena terlalu cepat.', 422);
    }
    if (a.auto) return this.landAuto(pid, h, now);
    return this.award(pid, h, now, a.keep !== false);
  }

  /** Status mancing otomatis untuk pemain (dipakai tombol Otomatis). */
  async autoInfo(pid: string) {
    const p = await this.player(pid), cfg = this.o.auto(), now = this.o.now();
    const st = autoStatus(p, cfg, levelInfo(p.xp).lv, now);
    return { ...st, left: Number.isFinite(st.left) ? st.left : -1, rate: cfg.rate, gainMul: cfg.gainMul, maxPerDay: cfg.maxPerDay, minLv: cfg.minLv, minGap: cfg.minGap, full: cfg.full, board: cfg.board, missions: cfg.missions };
  }

  /** Mancing otomatis: server melempar dadu keberhasilan menurut ukuran ikan (diatur pemilik di panel admin). */
  private async landAuto(pid: string, h: HookState, now: number) {
    const p = await this.player(pid), cfg = this.o.auto();
    const st = autoStatus(p, cfg, levelInfo(p.xp).lv, now);
    if (!st.allowed) { await this.o.store.putStock(h.spot, h.k); throw new GameError(st.reason, 403); }
    if (st.wait > 0.25) { await this.o.store.putStock(h.spot, h.k); throw new GameError(`Mancing otomatis: tunggu ${Math.ceil(st.wait)} detik lagi.`, 429); }
    const u = autoUse(p, now); u.tries++; u.last = now;
    if (!autoRoll(cfg, h.tier, this.o.rng)) {
      p.autoUse = u; await this.o.store.savePlayer(p);
      await this.o.store.putStock(h.spot, h.k);
      return { result: 'lost' as const, auto: true, name: SPECIES[h.k].name, weight: h.weight, tier: h.tier };
    }
    u.n++; p.autoUse = u; await this.o.store.savePlayer(p);
    const full = p.basket.length >= this.basketSize(p);
    const r = await this.award(pid, h, now, true, { mul: cfg.gainMul, board: cfg.board, auto: true, sellIfFull: cfg.full === 'jual' });
    return { ...r, auto: true, left: cfg.maxPerDay > 0 ? Math.max(0, cfg.maxPerDay - u.n) : -1, sold: full && cfg.full === 'jual' };
  }
  /** Catat tangkapan yang sudah sah (dipakai land, dan mode luring saat sambungan putus di tengah tarikan). */
  async award(pid: string, h: { id: string; k: SpeciesId; weight: number; tier: number; t: number; spot: string }, now = this.o.now(), wantKeep = true,
    opt: { mul?: number; board?: boolean; auto?: boolean; sellIfFull?: boolean } = {}) {
    const p = await this.player(pid), mul = opt.mul ?? 1;
    const rec: CatchRec = {
      id: h.id, species: h.k, name: SPECIES[h.k].name, weight: h.weight, length: fishLengthCm(h.k, h.weight),
      tier: h.tier, stars: starsFor(h.t), spot: h.spot, at: now, value: Math.max(1, Math.round(sellPrice(h.k, h.weight, h.tier) * this.o.priceMul() * mul)),
    };
    if (opt.auto) rec.auto = true;
    const key = h.spot + ':' + h.k, prev = p.best[key];
    const record = prev === undefined ? 'first' : h.weight > prev ? 'best' : '';
    if (record) p.best[key] = h.weight;
    const lvBefore = levelInfo(p.xp).lv;
    const xp = Math.max(1, Math.round(catchXp(h.weight, h.tier) * this.o.xpMul() * mul));
    p.xp += xp;
    p.album[h.k] = Math.max(p.album[h.k] ?? 0, h.weight);
    p.stats.catches++; p.stats.totalKg = Math.round((p.stats.totalKg + h.weight) * 100) / 100;
    p.stats.heaviest = Math.max(p.stats.heaviest, h.weight);
    const keep = wantKeep && p.basket.length < this.basketSize(p);
    if (keep) p.basket.push(rec);
    else if (opt.sellIfFull) p.coins += rec.value; // otomatis + keranjang penuh: langsung dijual
    await this.o.store.savePlayer(p);
    if (opt.board !== false) await this.o.store.addCatch(p.id, p.name, rec); // papan peringkat & acara
    return { result: 'caught' as const, catch: rec, record, prev: prev ?? null, xp, levelUp: levelInfo(p.xp).lv > lvBefore, kept: keep, player: p };
  }
  /** Terima hasil main luring: diperiksa ulang, dibatasi, dan TIDAK masuk papan peringkat/turnamen. */
  async syncOffline(pid: string, batch: OfflineBatch) {
    // ikan yang tarikannya sudah dicatat server (putus saat diangkat): dihitung penuh seperti biasa
    const landed: CatchRec[] = [], rest: OfflineBatch['catches'] = [];
    for (const c of Array.isArray(batch?.catches) ? batch.catches : []) {
      if (!c || !c.hook) { if (c) rest.push(c); continue; }
      const h = this.hooks.get(String(c.hook));
      if (h && h.pid === pid) { this.hooks.delete(h.id); landed.push((await this.award(pid, h)).catch); }
    }
    const p = await this.player(pid);
    const r = applyOffline(p, { ...batch, catches: rest }, this.o.now(), this.basketSize(p), this.o.priceMul(), this.o.xpMul());
    r.accepted.unshift(...landed);
    await this.o.store.savePlayer(p);
    return { ...r, landed, player: p };
  }

  basketSize(p: Player) { return basketCap(p); }

  /** Beli keranjang besar (sekali, permanen). */
  async buyBigBasket(pid: string) {
    const p = await this.player(pid);
    if (p.bigBasket) throw new GameError('Keranjang besar sudah dimiliki.');
    if (p.coins < BASKET_BIG_PRICE) throw new GameError(`Koin tidak cukup (butuh ${BASKET_BIG_PRICE}).`);
    p.coins -= BASKET_BIG_PRICE; p.bigBasket = true;
    await this.o.store.savePlayer(p); return { player: p };
  }

  private useBait(p: Player, b: BaitId) { p.bait[b] = Math.max(0, (p.bait[b] ?? 0) - 1); }

  async sellBasket(pid: string) {
    const p = await this.player(pid);
    const coins = p.basket.reduce((a, c) => a + c.value, 0);
    p.coins += coins; const n = p.basket.length; p.basket = [];
    await this.o.store.savePlayer(p);
    return { coins, sold: n, player: p };
  }

  async release(pid: string, catchId: string) {
    const p = await this.player(pid);
    const i = p.basket.findIndex(c => c.id === catchId);
    if (i < 0) throw new GameError('Ikan tidak ada di keranjang.');
    const [c] = p.basket.splice(i, 1);
    await this.o.store.putStock(c.spot, c.species);
    p.xp += 2; // bonus kecil untuk melepas ikan
    await this.o.store.savePlayer(p);
    return { player: p };
  }

  async buyBait(pid: string, b: BaitId) {
    const p = await this.player(pid); const B = BAITS[b];
    if (!B) throw new GameError('Umpan tidak ditemukan.');
    if (p.coins < B.price) throw new GameError('Koin tidak cukup.');
    p.coins -= B.price; p.bait[b] = (p.bait[b] ?? 0) + B.pack;
    await this.o.store.savePlayer(p); return { player: p };
  }

  async equip(pid: string, a: { bait?: BaitId; rod?: RodId; line?: LineId }) {
    const p = await this.player(pid);
    if (a.bait) { if (!BAITS[a.bait]) throw new GameError('Umpan tidak ditemukan.'); p.curBait = a.bait; }
    if (a.rod) { if (!p.rods.includes(a.rod)) throw new GameError('Joran belum dimiliki.'); p.curRod = a.rod; }
    if (a.line) { if (!p.lines.includes(a.line)) throw new GameError('Senar belum dimiliki.'); p.curLine = a.line; }
    await this.o.store.savePlayer(p); return { player: p };
  }

  async buyGear(pid: string, a: { rod?: RodId; line?: LineId }) {
    const p = await this.player(pid);
    if (a.rod) {
      const R = RODS[a.rod]; if (!R || R.shop === false) throw new GameError('Joran tidak dijual di toko.');
      if (p.rods.includes(a.rod)) throw new GameError('Joran sudah dimiliki.');
      if (p.coins < R.price) throw new GameError('Koin tidak cukup.');
      p.coins -= R.price; p.rods.push(a.rod); p.curRod = a.rod;
    }
    if (a.line) {
      const L = LINES[a.line]; if (!L) throw new GameError('Senar tidak ditemukan.');
      if (p.lines.includes(a.line)) throw new GameError('Senar sudah dimiliki.');
      if (p.coins < L.price) throw new GameError('Koin tidak cukup.');
      p.coins -= L.price; p.lines.push(a.line); p.curLine = a.line;
    }
    await this.o.store.savePlayer(p); return { player: p };
  }
}

// Jalur ke "server": mode lokal (aturan server berjalan di perangkat) atau server sungguhan.
// Keduanya punya bentuk panggilan yang sama, jadi sisa game tidak perlu tahu bedanya.
import {
  Authority, MemoryStore, type Player, type WorldInfo, type HookResult, type CatchRec, type Zone, type SubZone,
  type BaitId, type RodId, type LineId, type LeaderRow, type WeatherId, type BackdropSlot, type OfflineBatch, type OfflineResult, type SpeciesId as SpId,
} from '@paunjunan/shared';
/** foto latar (besar) disimpan di kunci localStorage terpisah: dokumen → kunci */
const BD_KEYS: [string, string][] = [['backdrop', 'backdropImg'], ['backdrop_belakang', 'backdropBack'], ['backdrop_dasar', 'backdropBed']];
import { store } from './store';
import { Social, Trades, sideValue, emptySide, BAITS as BAIT_DEFS, RODS as ROD_DEFS, type Trade, type TradeSide, type TradeBoard, AdminService, Billing, applySpeciesEdits, type GameEvent, type SpeciesEdits, type Look, type Listing, type Club, type GameConfig, type AuditRow, type SpeciesId } from '@paunjunan/shared';
type P = Promise<{ player: Player }>;
export type TourInfo = Awaited<ReturnType<Social['tournaments']>>[number];
export type ClubsInfo = Awaited<ReturnType<Social['clubs']>>;
export type TradeInv = Awaited<ReturnType<Trades['inventory']>>;
export interface TradePartner { id: string; name: string; lv?: number; npc?: boolean }
export type ListArgs = { kind: 'rod' | 'line' | 'bait'; item: string; price: number; qty?: number };
/** Fitur Fase 3 & 4 — bentuk panggilan sama di mode lokal dan server. */
export interface SocialApi {
  setLook(look: Partial<Look>): Promise<{ player: Player; spent: number }>;
  tournaments(): Promise<TourInfo[]>; joinTournament(kind: 'harian' | 'mingguan'): P;
  claimTournaments(): Promise<{ player: Player; rewards: { name: string; rank: number; coins: number }[] }>;
  toAquarium(id: string): P; fromAquarium(id: string, to: 'lepas' | 'jual'): P; buyBigAquarium(): P; claimVisitors(): Promise<{ player: Player; coins: number }>;
  market(): Promise<Listing[]>; listItem(a: ListArgs): P; cancelListing(id: string): P; buyListing(id: string): P;
  /** Tukar langsung antarpemain (umpan, joran, senar, koin). */
  tradeBoard(): Promise<TradeBoard>; tradeInventory(id: string): Promise<TradeInv>;
  proposeTrade(a: { to: string; give: TradeSide; want: TradeSide; note?: string }): Promise<{ player: Player; trade: Trade }>;
  acceptTrade(id: string): Promise<{ player: Player; trade: Trade }>; declineTrade(id: string): Promise<{ player: Player; trade: Trade }>; cancelTrade(id: string): Promise<{ player: Player; trade: Trade }>;
  progress(): Promise<{ player: Player; dailyReady: boolean }>;
  claimMission(id: string): Promise<{ player: Player; coins: number; xp: number; bonus: number }>;
  claimDaily(): Promise<{ player: Player; coins: number; day: number; streak: number; bait: { bait: string; n: number } | null }>;
  claimBadge(id: string): Promise<{ player: Player; coins: number }>;
  clubs(): Promise<ClubsInfo>; createClub(a: { name: string; tag: string; icon: string }): Promise<{ player: Player; club: Club }>; joinClub(id: string): P; leaveClub(): P; claimClub(): Promise<{ player: Player; coins: number }>;
}

export interface LandResult { result: 'caught' | 'lost'; catch?: CatchRec; record?: string; prev?: number | null; xp?: number; levelUp?: boolean; kept?: boolean; player?: Player;
  /** mancing otomatis: hasil dari dadu server; sisa ikan hari ini (-1 = tanpa batas); ikan langsung dijual karena keranjang penuh */
  auto?: boolean; left?: number; sold?: boolean; name?: string; weight?: number; tier?: number }
/** Status & pengaturan mancing otomatis yang terlihat oleh pemain. */
export interface AutoInfo { allowed: boolean; reason: string; left: number; used: number; wait: number; rate: number[]; gainMul: number; maxPerDay: number; minLv: number; minGap: number; full: 'stop' | 'jual'; board: boolean; missions: boolean }

export interface AdminState { config: GameConfig; stock: Record<string, Record<string, number>>; audit: AuditRow[] }
/** Panel developer/admin: mode lokal langsung, mode server lewat token admin. */
export interface AdminApi {
  adminState(): Promise<AdminState>; adminConfig(p: Partial<GameConfig>): Promise<GameConfig>;
  adminStock(spot: string, species: SpeciesId, n: number): Promise<AdminState['stock']>; adminResetStock(spot: string): Promise<AdminState['stock']>;
  adminCoins(playerId: string, coins: number, reason: string): Promise<{ id: string; name: string; coins: number }>;
  adminBackdrop(url: string, slot?: BackdropSlot): Promise<GameConfig>; backdrop(slot?: BackdropSlot): Promise<string>;
  adminEvents(list: GameEvent[]): Promise<GameConfig>;
  eventBoard(): Promise<{ event: GameEvent | null; rows: { name: string; weight: number; species: SpeciesId; at: number }[]; active: boolean }>;
}
/** Beli koin: token dari Google Play ditukar di server (mode lokal: mode uji tanpa bayar). */
export interface BillingApi { redeemCoins(productId: string, token: string): Promise<{ player: Player; coins: number; already: boolean }> }
export interface Backend extends SocialApi, AdminApi, BillingApi {
  readonly mode: 'lokal' | 'server';
  login(name: string): Promise<Player>;
  me(): Promise<Player>;
  world(): Promise<WorldInfo>;
  cast(a: { spot: string; zone: Zone; sub: SubZone }): Promise<{ castId: string; biteIn: number | null; nibbles: number; quiet: boolean }>;
  hook(castId: string): Promise<HookResult>;
  land(hookId: string, result: 'caught' | 'lost', keep?: boolean, auto?: boolean): Promise<LandResult>;
  autoInfo(): Promise<AutoInfo>;
  sell(): Promise<{ coins: number; sold: number; player: Player }>;
  release(id: string): Promise<{ player: Player }>;
  buyBait(b: BaitId): Promise<{ player: Player }>;
  buyGear(a: { rod?: RodId; line?: LineId }): Promise<{ player: Player }>;
  buyBigBasket(): Promise<{ player: Player }>;
  equip(a: { bait?: BaitId; rod?: RodId; line?: LineId }): Promise<{ player: Player }>;
  leaderboard(kind: 'heaviest' | 'most' | 'level', period: 'day' | 'week' | 'all'): Promise<LeaderRow[]>;
  token?: string;
}

/** Jaringan putus / server tidak terjangkau (bukan penolakan aturan). */
export class NetError extends Error {}

export class LocalBackend implements Backend {
  readonly mode = 'lokal' as const;
  private st = new MemoryStore();
  private adm = new AdminService(this.st);
  private bdSaved: Record<string, string> = {};
  private bill = new Billing(this.st, async (_p, t) => ({ state: t.startsWith('uji-') ? 0 : 1, orderId: t }));
  redeemCoins(productId: string, token: string) { return this.bill.redeem(this.pid, productId, token); }
  private A: Authority; private S: Social; private T: Trades;
  private pid: string;
  /** kabar tukar (mode lokal: jawaban pedagang simulasi) */
  onTrade: (kind: 'baru' | 'diterima' | 'ditolak', name: string) => void = () => {};
  /** ns: awalan kunci simpanan (mesin luring memakai simpanan terpisah); gainMul: pengali koin & XP; social: misi/turnamen ikut dihitung */
  constructor(weather: () => WeatherId, private ns = '', private gainMul = 1, private social = true) {
    this.pid = store.get<string>(ns + 'pid', '');
    const saved = store.get<ReturnType<MemoryStore['toJSON']> | null>(ns + 'world', null);
    if (saved) try { this.st.load(saved); } catch { /* data rusak: mulai baru */ }
    for (const [doc, key] of BD_KEYS) { const bd = store.get<unknown>(key, null); if (bd) { this.st.docs.set(doc, bd); this.bdSaved[doc] = JSON.stringify(bd); } }
    this.adm.load(); // konfigurasi developer tersimpan (peluang, harga, pengumuman)
    let t: number | undefined;
    this.st.onChange = () => { clearTimeout(t); t = window.setTimeout(() => {
      // foto latar (besar) disimpan di kunci terpisah supaya progres pemain tidak ikut gagal tersimpan bila penyimpanan penuh
      const j = this.st.toJSON(), bds = BD_KEYS.map(([doc]) => j.docs[doc]); for (const [doc] of BD_KEYS) delete j.docs[doc];
      store.set(this.ns + 'world', j);
      BD_KEYS.forEach(([doc, key], i) => { const bd = bds[i]; if (bd !== undefined && JSON.stringify(bd) !== this.bdSaved[doc]) { this.bdSaved[doc] = JSON.stringify(bd); store.set(key, bd); } });
    }, 400); };
    this.A = new Authority({ store: this.st, rng: Math.random, weather, rates: () => this.adm.effRates(), priceMul: () => this.adm.effPriceMul() * this.gainMul, xpMul: () => this.adm.effXpMul() * this.gainMul, auto: () => this.adm.effAuto(), ignoreLevelLock: true /* mode lokal: uji semua lokasi */ });
    this.S = new Social({ store: this.st });
    this.T = new Trades({ store: this.st });
    this.seedSocial();
    this.seedRivals();
  }
  /** Pesaing simulasi untuk papan peringkat mode lokal. */
  private seedRivals() {
    if (this.st.catches.length) return;
    const names = ['RajaNila', 'Andi.Pancing', 'MasGabus', 'SiPatin', 'Joran77', 'UdinKeramba'];
    const sp = ['nila', 'mas', 'gabus', 'patin', 'baung', 'toman'] as const;
    const now = Date.now() / 1000;
    names.forEach((n, i) => {
      for (let j = 0; j < 2 + i % 3; j++) {
        const k = sp[(i + j) % sp.length], w = Math.round((0.6 + Math.random() * (k === 'toman' ? 7 : 2.5)) * 100) / 100;
        this.st.catches.push({ id: 'r' + i + j, species: k, name: k, weight: w, length: 30, tier: 1, stars: 3, spot: 'B3', at: now - Math.random() * 20000, value: 10, playerId: 'rival' + i, playerName: n });
      }
    });
  }
  async login(name: string) {
    let p = this.pid ? await this.st.getPlayer(this.pid) : null;
    if (!p) { this.pid = 'lokal_' + Math.random().toString(36).slice(2, 10); store.set(this.ns + 'pid', this.pid); p = this.A.newPlayer(this.pid, name); }
    p.name = name; await this.st.savePlayer(p);
    return p;
  }
  hasPlayer() { return !!this.pid && this.st.players.has(this.pid); }
  /** Hapus semua data di perangkat (mode lokal). */
  async deleteLocal() { if (this.pid) await this.st.deletePlayer(this.pid); this.pid = ''; store.set(this.ns + 'pid', ''); }
  async me() { const p = await this.st.getPlayer(this.pid); if (!p) throw new Error('Belum masuk'); return p; }
  async world() { return { ...(await this.A.world()), motd: this.adm.cfg.motd, backdropAt: this.adm.cfg.backdropAt, hideFarTrees: !!this.adm.cfg.hideFarTrees, backdropBackAt: this.adm.cfg.backdropBackAt, bedAt: this.adm.cfg.bedAt, waterClarity: this.adm.cfg.waterClarity ?? 'jernih', event: this.adm.activeEvent() }; }
  adminEvents(list: GameEvent[]) { return this.adm.setEvents(list, 'developer'); }
  eventBoard() { return this.adm.eventBoard(); }
  adminBackdrop(url: string, slot: BackdropSlot = 'depan') { return this.adm.setBackdrop(url, 'developer', slot); }
  backdrop(slot: BackdropSlot = 'depan') { return this.adm.backdrop(slot); }
  async adminState() { return { config: this.adm.cfg, stock: await this.adm.stock(), audit: (await this.adm.auditLog()).slice(0, 60) }; }
  adminConfig(p: Partial<GameConfig>) { return this.adm.setConfig(p, 'developer'); }
  adminStock(spot: string, species: SpeciesId, n: number) { return this.adm.setStock(spot, species, n, 'developer'); }
  adminResetStock(spot: string) { return this.adm.resetStock(spot, 'developer'); }
  adminCoins(playerId: string, coins: number, reason: string) { return this.adm.grantCoins(playerId || this.pid, coins, 'developer', reason); }
  cast(a: { spot: string; zone: Zone; sub: SubZone }) { return this.A.cast(this.pid, a); }
  hook(castId: string) { return this.A.hook(this.pid, { castId }); }
  async land(hookId: string, result: 'caught' | 'lost', keep = true, auto = false) {
    const r = await this.A.land(this.pid, { hookId, result, keep, auto });
    if (r.result === 'caught' && this.social) {
      const ac = this.adm.effAuto();
      await this.S.onCatch(this.pid, r.player.name, r.catch, auto ? { missions: ac.missions, tours: ac.board } : {}); r.player = await this.me();
    }
    return r as LandResult;
  }
  autoInfo() { return this.A.autoInfo(this.pid) as Promise<AutoInfo>; }
  /** Mesin luring: pakai data pemain terakhir dari server. */
  async adopt(p: Player) { this.pid = p.id; store.set(this.ns + 'pid', p.id); await this.st.savePlayer(JSON.parse(JSON.stringify(p))); return this.me(); }
  /** Ikan yang sudah didapat di server tetapi sambungan putus sebelum tercatat. */
  award(h: { id: string; k: SpId; weight: number; tier: number; t: number; spot: string }) { return this.A.award(this.pid, h); }
  // Fase 3 & 4 (aturan sama dengan server, dijalankan di perangkat)
  setLook(look: Partial<Look>) { return this.S.setLook(this.pid, look); }
  tournaments() { return this.S.tournaments(this.pid); }
  joinTournament(kind: 'harian' | 'mingguan') { return this.S.joinTournament(this.pid, kind); }
  claimTournaments() { return this.S.claimTournaments(this.pid); }
  toAquarium(id: string) { return this.S.toAquarium(this.pid, id); }
  fromAquarium(id: string, to: 'lepas' | 'jual') { return this.S.fromAquarium(this.pid, id, to); }
  buyBigAquarium() { return this.S.buyBigAquarium(this.pid); }
  claimVisitors() { return this.S.claimVisitors(this.pid); }
  market() { return this.S.market(); }
  listItem(a: ListArgs) { return this.S.listItem(this.pid, a); }
  cancelListing(id: string) { return this.S.cancelListing(this.pid, id); }
  buyListing(id: string) { return this.S.buyListing(this.pid, id); }
  // ---------- tukar: mode lokal berdagang dengan pemancing simulasi ----------
  private static NPC_TRADERS: { id: string; name: string; rods: RodId[]; bait: Partial<Record<BaitId, number>> }[] = [
    { id: 'npct_darto', name: 'Pak Darto', rods: ['bambu', 'tegar', 'belida'], bait: { cacing: 60, lumut: 40, racik: 30 } },
    { id: 'npct_rina', name: 'Rina.Mancing', rods: ['karbon', 'predator'], bait: { udang: 60, pelet: 80, anakan: 25 } },
    { id: 'npct_ahong', name: 'Koh Ahong', rods: ['surf', 'laut'], bait: { cumi: 50, udang: 40 } },
  ];
  private async npcReady() {
    for (const n of LocalBackend.NPC_TRADERS) {
      let p = await this.st.getPlayer(n.id); const fresh = !p;
      if (!p) p = this.A.newPlayer(n.id, n.name);
      p.xp = Math.max(p.xp, 8000); p.coins = Math.max(p.coins, 3000);
      for (const r of n.rods) if (!p.rods.includes(r) && (fresh || Math.random() < 0.15)) p.rods.push(r);
      for (const [k, v] of Object.entries(n.bait)) if ((p.bait[k as BaitId] ?? 0) < 10) p.bait[k as BaitId] = v;
      await this.st.savePlayer(p);
    }
  }
  private lastNpcOffer = -1;
  /** Sesekali pedagang simulasi menawarkan sesuatu (supaya layar tukar bisa dicoba tanpa server). */
  private async npcMaybeOffer(me: Player, incoming: Trade[]) {
    const t = Date.now() / 1000;
    if (this.lastNpcOffer < 0) this.lastNpcOffer = store.get<number>(this.ns + 'npcOffer', 0);
    if (incoming.length || t - this.lastNpcOffer < 600 || Math.random() > 0.5) return;
    this.lastNpcOffer = t; store.set(this.ns + 'npcOffer', t);
    const n = LocalBackend.NPC_TRADERS[Math.floor(Math.random() * LocalBackend.NPC_TRADERS.length)], np = (await this.st.getPlayer(n.id))!;
    const give = emptySide(), want = emptySide();
    const rod = np.rods.find(r => r !== 'pemula' && r !== np.curRod && !me.rods.includes(r));
    if (rod && Math.random() < 0.5) { give.rods = [rod]; want.coins = Math.round(ROD_DEFS[rod].price * 0.8); }
    else { const k = Object.keys(n.bait)[Math.floor(Math.random() * Object.keys(n.bait).length)] as BaitId, q = 10 + Math.floor(Math.random() * 3) * 5; give.bait = { [k]: q }; want.coins = Math.max(5, Math.round(q * BAIT_DEFS[k].price / BAIT_DEFS[k].pack * 0.85)); }
    if (me.coins < want.coins) { const b = (Object.entries(me.bait).find(([, v]) => (v ?? 0) >= 10)); if (!b) return; want.coins = 0; want.bait = { [b[0]]: 10 }; }
    try { await this.T.propose(n.id, { to: this.pid, give, want, note: 'Mau tukar, Gan?' }); this.onTrade('baru', n.name); } catch { /* tidak cocok, lain kali */ }
  }
  async tradeBoard() {
    await this.npcReady();
    const b = await this.T.board(this.pid);
    await this.npcMaybeOffer(b.player, b.incoming);
    return this.T.board(this.pid).then(x => ({ ...x, got: [...b.got, ...x.got] }));
  }
  tradeInventory(id: string) { return this.T.inventory(id); }
  tradePartners(): TradePartner[] { return LocalBackend.NPC_TRADERS.map(n => ({ id: n.id, name: n.name, lv: 20, npc: true })); }
  async proposeTrade(a: { to: string; give: TradeSide; want: TradeSide; note?: string }) {
    const r = await this.T.propose(this.pid, a);
    if (r.trade.to.startsWith('npct_')) setTimeout(async () => {
      // pedagang simulasi: setuju bila nilai yang ia terima ≥ 90% nilai yang ia berikan (harga toko)
      const fair = sideValue(r.trade.give) >= sideValue(r.trade.want) * 0.9;
      try { if (fair) await this.T.accept(r.trade.to, r.trade.id); else await this.T.decline(r.trade.to, r.trade.id); this.onTrade(fair ? 'diterima' : 'ditolak', r.trade.toName); }
      catch { try { await this.T.decline(r.trade.to, r.trade.id); this.onTrade('ditolak', r.trade.toName); } catch { /* sudah dibatalkan */ } }
    }, 2500 + Math.random() * 2000);
    return r;
  }
  acceptTrade(id: string) { return this.T.accept(this.pid, id); }
  async declineTrade(id: string) { return this.T.decline(this.pid, id); }
  cancelTrade(id: string) { return this.T.cancel(this.pid, id); }
  clubs() { return this.S.clubs(this.pid); }
  progress() { return this.S.progress(this.pid); }
  claimMission(id: string) { return this.S.claimMission(this.pid, id); }
  claimDaily() { return this.S.claimDaily(this.pid); }
  claimBadge(id: string) { return this.S.claimBadge(this.pid, id); }
  createClub(a: { name: string; tag: string; icon: string }) { return this.S.createClub(this.pid, a); }
  joinClub(id: string) { return this.S.joinClub(this.pid, id); }
  leaveClub() { return this.S.leaveClub(this.pid); }
  claimClub() { return this.S.claimClub(this.pid); }
  /** Mode lokal: penjual & klub simulasi supaya pasar dan klub tidak kosong. */
  private async seedSocial() {
    const now = Date.now() / 1000;
    await this.st.updateDoc<{ items: Listing[] }>('market', cur => {
      const d = cur ?? { items: [] };
      d.items = d.items.filter(x => !x.seller.startsWith('npc') || x.at + 3 * 86400 > now);
      const npc = d.items.filter(x => x.seller.startsWith('npc')).length;
      const names = ['RajaNila', 'MasGabus', 'SiPatin', 'Joran77', 'UdinKeramba', 'Andi.Pancing'];
      const goods: [Listing['kind'], string, number][] = [['bait', 'cumi', 70], ['bait', 'anakan', 60], ['bait', 'racik', 35], ['rod', 'bambu', 90], ['rod', 'karbon', 260], ['rod', 'tegar', 520], ['rod', 'predator', 1300], ['line', 'l30', 45], ['line', 'pe', 140], ['line', 'pe8', 380]];
      for (let i = npc; i < 8; i++) {
        const [kind, item, base] = goods[Math.floor(Math.random() * goods.length)], rare = Math.random() < 0.18;
        d.items.push({ id: 'npc' + now.toFixed(0) + i, seller: 'npc' + i, sellerName: names[i % names.length], kind, item, price: Math.round(base * (rare ? 0.55 : 0.8 + Math.random() * 0.4)), at: now - Math.random() * 86400, rare: kind !== 'bait' && rare, ...(kind === 'bait' ? { qty: 10 } : {}) });
      }
      return d;
    });
    await this.st.updateDoc<{ list: Club[] }>('clubs', cur => {
      const d = cur ?? { list: [] };
      if (!d.list.some(c => c.id.startsWith('npc'))) d.list.push(
        { id: 'npcA', name: 'Keramba Squad', tag: 'KRS', icon: '🐟', owner: 'npc1', members: [{ id: 'npc1', name: 'RajaNila' }, { id: 'npc2', name: 'MasGabus' }], week: '', kg: 0, claimed: [], createdAt: now },
        { id: 'npcB', name: 'Pemburu Toman', tag: 'PTM', icon: '👑', owner: 'npc4', members: [{ id: 'npc4', name: 'Joran77' }], week: '', kg: 0, claimed: [], createdAt: now });
      return d;
    });
  }
  sell() { return this.A.sellBasket(this.pid); }
  release(id: string) { return this.A.release(this.pid, id); }
  buyBait(b: BaitId) { return this.A.buyBait(this.pid, b); }
  buyGear(a: { rod?: RodId; line?: LineId }) { return this.A.buyGear(this.pid, a); }
  buyBigBasket() { return this.A.buyBigBasket(this.pid); }
  equip(a: { bait?: BaitId; rod?: RodId; line?: LineId }) { return this.A.equip(this.pid, a); }
  leaderboard(kind: 'heaviest' | 'most' | 'level', period: 'day' | 'week' | 'all') {
    const since = period === 'all' ? 0 : Date.now() / 1000 - (period === 'week' ? 7 : 1) * 86400;
    return this.st.leaderboard(kind, since, 20);
  }
}

export class RemoteBackend implements Backend {
  readonly mode = 'server' as const;
  token = store.get<string>('token', '');
  constructor(public url: string) {}
  private async call<T>(path: string, body?: object, ms = 12000): Promise<T> {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), ms);
    let r: Response;
    try {
      r = await fetch(this.url + path, { method: body ? 'POST' : 'GET', signal: ctl.signal,
        headers: { 'content-type': 'application/json', 'x-auth-token': this.token }, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new NetError((e as Error).name === 'AbortError' ? 'Server tidak menjawab.' : 'Server tidak bisa dihubungi.');
    } finally { clearTimeout(tm); }
    const j = await r.json().catch(() => null);
    if (!j) { if (r.status >= 500) throw new NetError('Server sedang bermasalah.'); throw new Error('Jawaban server tidak valid.'); }
    if (!j.ok) throw new Error(j.error || 'Gagal');
    return j as T;
  }
  /** Cek cepat: server bisa dihubungi? */
  async ping() { try { await this.call('/health', undefined, 4000); return true; } catch { return false; } }
  syncOffline(b: OfflineBatch) { return this.call<OfflineResult & { player: Player }>('/api/offline/sync', b, 20000); }
  async login(name: string) {
    if (this.token) try { return (await this.call<{ player: Player }>('/api/me')).player; } catch (e) { if (e instanceof NetError) throw e; /* token lama */ }
    const r = await this.call<{ token: string; player: Player }>('/api/auth/guest', { name });
    this.token = r.token; store.set('token', r.token); return r.player;
  }
  async me() { return (await this.call<{ player: Player }>('/api/me')).player; }
  async world() { const r = await this.call<{ world: WorldInfo; motd?: string; backdropAt?: number; hideFarTrees?: boolean; backdropBackAt?: number; bedAt?: number; waterClarity?: 'jernih' | 'sedang' | 'keruh'; species?: SpeciesEdits; event?: GameEvent | null }>('/api/world'); applySpeciesEdits(r.species ?? {}); return { ...r.world, motd: r.motd, backdropAt: r.backdropAt, hideFarTrees: !!r.hideFarTrees, backdropBackAt: r.backdropBackAt, bedAt: r.bedAt, waterClarity: r.waterClarity ?? 'jernih', event: r.event ?? null }; }
  async adminBackdrop(url: string, slot: BackdropSlot = 'depan') { return (await this.adm<{ config: GameConfig }>('/api/admin/backdrop', { url, slot })).config; }
  async backdrop(slot: BackdropSlot = 'depan') { return (await this.call<{ url: string }>('/api/backdrop?slot=' + slot)).url; }
  async adminEvents(events: GameEvent[]) { return (await this.adm<{ config: GameConfig }>('/api/admin/events', { events })).config; }
  eventBoard() { return this.call<{ event: GameEvent | null; rows: { name: string; weight: number; species: SpeciesId; at: number }[]; active: boolean }>('/api/event'); }
  adminToken = store.get<string>('adminToken', '');
  private async adm<T>(path: string, body?: object) {
    const r = await fetch(this.url + path, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'X-Admin-Token': this.adminToken }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({ ok: false, error: 'Server tidak menjawab.' }));
    if (!j.ok) throw new Error(j.error ?? 'Gagal'); return j as T;
  }
  adminState() { return this.adm<AdminState>('/api/admin/state'); }
  async adminConfig(p: Partial<GameConfig>) { return (await this.adm<{ config: GameConfig }>('/api/admin/config', p)).config; }
  async adminStock(spot: string, species: SpeciesId, n: number) { return (await this.adm<{ stock: AdminState['stock'] }>('/api/admin/stock', { spot, species, n })).stock; }
  async adminResetStock(spot: string) { return (await this.adm<{ stock: AdminState['stock'] }>('/api/admin/stock/reset', { spot })).stock; }
  adminCoins(playerId: string, coins: number, reason: string) { return this.adm<{ id: string; name: string; coins: number }>('/api/admin/coins', { playerId, coins, reason }); }
  cast(a: { spot: string; zone: Zone; sub: SubZone }) { return this.call<{ castId: string; biteIn: number | null; nibbles: number; quiet: boolean }>('/api/fishing/cast', a); }
  hook(castId: string) { return this.call<HookResult>('/api/fishing/hook', { castId }); }
  land(hookId: string, result: 'caught' | 'lost', keep = true, auto = false) { return this.call<LandResult>('/api/fishing/land', auto ? { hookId, result, keep, auto } : { hookId, result, keep }); }
  autoInfo() { return this.call<AutoInfo>('/api/auto'); }
  sell() { return this.call<{ coins: number; sold: number; player: Player }>('/api/basket/sell', {}); }
  release(id: string) { return this.call<{ player: Player }>('/api/basket/release', { id }); }
  buyBait(bait: BaitId) { return this.call<{ player: Player }>('/api/shop/bait', { bait }); }
  buyGear(a: { rod?: RodId; line?: LineId }) { return this.call<{ player: Player }>('/api/shop/gear', a); }
  buyBigBasket() { return this.call<{ player: Player }>('/api/basket/big', {}); }
  equip(a: { bait?: BaitId; rod?: RodId; line?: LineId }) { return this.call<{ player: Player }>('/api/equip', a); }
  async leaderboard(kind: 'heaviest' | 'most' | 'level', period: 'day' | 'week' | 'all') { return (await this.call<{ rows: LeaderRow[] }>(`/api/leaderboard?kind=${kind}&period=${period}`)).rows; }

  // ---------- Fase 3 & 4 ----------
  setLook(look: Partial<Look>) { return this.call<{ player: Player; spent: number }>('/api/look', { look }); }
  async tournaments() { return (await this.call<{ list: TourInfo[] }>('/api/tournaments')).list; }
  joinTournament(kind: 'harian' | 'mingguan') { return this.call<{ player: Player }>('/api/tournaments/join', { kind }); }
  claimTournaments() { return this.call<{ player: Player; rewards: { name: string; rank: number; coins: number }[] }>('/api/tournaments/claim', {}); }
  toAquarium(id: string) { return this.call<{ player: Player }>('/api/aquarium/add', { id }); }
  fromAquarium(id: string, to: 'lepas' | 'jual') { return this.call<{ player: Player }>('/api/aquarium/remove', { id, to }); }
  buyBigAquarium() { return this.call<{ player: Player }>('/api/aquarium/big', {}); }
  claimVisitors() { return this.call<{ player: Player; coins: number }>('/api/aquarium/visitors', {}); }
  async market() { return (await this.call<{ items: Listing[] }>('/api/market')).items; }
  listItem(a: ListArgs) { return this.call<{ player: Player }>('/api/market/list', a); }
  tradeBoard() { return this.call<TradeBoard>('/api/trade', {}); }
  tradeInventory(id: string) { return this.call<TradeInv>('/api/trade/inventory?id=' + encodeURIComponent(id)); }
  proposeTrade(a: { to: string; give: TradeSide; want: TradeSide; note?: string }) { return this.call<{ player: Player; trade: Trade }>('/api/trade/propose', a); }
  acceptTrade(id: string) { return this.call<{ player: Player; trade: Trade }>('/api/trade/accept', { id }); }
  declineTrade(id: string) { return this.call<{ player: Player; trade: Trade }>('/api/trade/decline', { id }); }
  cancelTrade(id: string) { return this.call<{ player: Player; trade: Trade }>('/api/trade/cancel', { id }); }
  cancelListing(id: string) { return this.call<{ player: Player }>('/api/market/cancel', { id }); }
  buyListing(id: string) { return this.call<{ player: Player }>('/api/market/buy', { id }); }
  clubs() { return this.call<ClubsInfo>('/api/clubs'); }
  progress() { return this.call<{ player: Player; dailyReady: boolean }>('/api/progress'); }
  claimMission(id: string) { return this.call<{ player: Player; coins: number; xp: number; bonus: number }>('/api/missions/claim', { id }); }
  claimDaily() { return this.call<{ player: Player; coins: number; day: number; streak: number; bait: { bait: string; n: number } | null }>('/api/daily/claim', {}); }
  claimBadge(id: string) { return this.call<{ player: Player; coins: number }>('/api/badges/claim', { id }); }
  createClub(a: { name: string; tag: string; icon: string }) { return this.call<{ player: Player; club: Club }>('/api/clubs/create', a); }
  joinClub(id: string) { return this.call<{ player: Player }>('/api/clubs/join', { id }); }
  leaveClub() { return this.call<{ player: Player }>('/api/clubs/leave', {}); }
  claimClub() { return this.call<{ player: Player; coins: number }>('/api/clubs/claim', {}); }

  // ---------- akun ----------
  device = store.get<string>('device', '');
  username = store.get<string>('username', '');
  private keep(r: { token: string; device?: string }, username?: string) {
    this.token = r.token; store.set('token', r.token);
    if (r.device) { this.device = r.device; store.set('device', r.device); }
    if (username !== undefined) { this.username = username; store.set('username', username); }
  }
  /** Daftar. Bila sedang main sebagai tamu, progres tamu ikut dipindah ke akun. */
  async register(a: { username: string; email: string; password: string; pin: string }) {
    const r = await this.call<{ token: string; device: string; player: Player }>('/api/auth/register', a);
    this.keep(r, a.username.trim().toLowerCase()); return r.player;
  }
  async signIn(login: string, password: string) {
    this.token = '';
    const r = await this.call<{ token: string; device: string; player: Player }>('/api/auth/login', { login, password });
    this.keep(r, login.includes('@') ? r.player.name : login.trim().toLowerCase()); return r.player;
  }
  async pinLogin(pin: string) {
    const r = await this.call<{ token: string; player: Player; username: string }>('/api/auth/pin', { device: this.device, pin });
    this.keep(r, r.username); return r.player;
  }
  async signOut() {
    try { await this.call('/api/auth/logout', { device: this.device }); } catch { /* tetap keluar di perangkat */ }
    this.token = ''; this.device = ''; this.username = '';
    store.set('token', ''); store.set('device', ''); store.set('username', '');
  }
  redeemCoins(productId: string, token: string) { return this.call<{ player: Player; coins: number; already: boolean }>('/api/billing/redeem', { productId, token }); }
  async forgot(login: string) { await this.call('/api/auth/forgot', { login }); }
  async resetPassword(login: string, code: string, password: string) {
    const r = await this.call<{ token: string; device: string; player: Player }>('/api/auth/reset', { login, code, password });
    this.keep(r, login.includes('@') ? r.player.name : login.trim().toLowerCase()); return r.player;
  }
  async changePassword(oldPw: string, newPw: string) { const r = await this.call<{ token: string; device: string }>('/api/auth/password', { old: oldPw, new: newPw }); this.keep(r); }
  async deleteAccount(password?: string) {
    await this.call('/api/account/delete', { password });
    this.token = ''; this.device = ''; this.username = ''; store.set('token', ''); store.set('device', ''); store.set('username', '');
  }
}

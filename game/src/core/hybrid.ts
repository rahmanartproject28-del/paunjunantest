// Gabungan server + luring: selama jaringan ada, semua lewat server. Saat jaringan putus,
// memancing tetap jalan dengan aturan yang sama di perangkat; hasilnya dicatat lalu dikirim
// ke server begitu jaringan kembali (server memeriksa ulang — lihat shared/src/offline.ts).
import { OFFLINE, type Player, type HookResult, type Zone, type SubZone, type BaitId, type RodId, type LineId, type SpeciesId, type OfflineCatch, type OfflineResult, type WeatherId } from '@paunjunan/shared';
import { LocalBackend, RemoteBackend, NetError, type Backend, type LandResult } from './backend';
import { store } from './store';

export interface NetStatus {
  online: boolean;
  /** ikan hasil luring yang belum terkirim */
  pending: number;
  /** data pemain yang berlaku sekarang (bila berubah) */
  player?: Player;
  /** hasil sinkron saat baru tersambung lagi */
  synced?: OfflineResult;
}
interface Session { sid: string; bait0: Partial<Record<BaitId, number>>; catches: OfflineCatch[]; released: string[] }
type Hooked = Extract<HookResult, { result: 'hooked' }>;
const NEED_NET = 'Fitur ini perlu jaringan. Kamu sedang main luring.';

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface HybridBackend extends Backend {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class HybridBackend {
  readonly mode = 'server' as const;
  online = true;
  onStatus: (s: NetStatus) => void = () => {};
  private local: LocalBackend;
  private last = store.get<Player | null>('offPlayer', null);
  private ses = store.get<Session | null>('offSes', null);
  private name = 'Pemancing';
  private casts = new Map<string, string>();          // castId server → spot
  private hooks = new Map<string, Hooked & { spot: string }>(); // hookId server → ikan
  private busy = false; private timer = 0;

  constructor(readonly remote: RemoteBackend, weather: () => WeatherId) {
    this.local = new LocalBackend(weather, 'off_', OFFLINE.gainMul, false);
    addEventListener('online', () => void this.probe());
    addEventListener('offline', () => void this.goOffline());
    document.addEventListener('visibilitychange', () => { if (!document.hidden && !this.online) void this.probe(); });
    // semua panggilan lain (toko, pasar, klub, admin, …) diteruskan ke server
    return new Proxy(this, {
      get: (t, k, rcv) => {
        if (k in t) return Reflect.get(t, k, rcv);
        const f = (remote as unknown as Record<string | symbol, unknown>)[k];
        if (typeof f !== 'function') return f;
        return (...a: unknown[]) => t.viaServer(() => (f as (...x: unknown[]) => Promise<unknown>).apply(remote, a));
      },
    });
  }
  get token() { return this.remote.token; }
  get pending() { return this.ses?.catches.length ?? 0; }

  private keep<T>(r: T): T {
    const p = (r as { player?: Player } | null)?.player;
    if (p && this.online) { this.last = p; store.set('offPlayer', p); }
    return r;
  }
  private saveSes() { store.set('offSes', this.ses); }
  private async viaServer<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.online) throw new Error(NEED_NET);
    try { return this.keep(await fn()); }
    catch (e) { if (e instanceof NetError) { await this.goOffline(); throw new Error('Jaringan terputus. ' + NEED_NET); } throw e; }
  }

  // ---------- pindah luring / kembali daring ----------
  private async goOffline() {
    if (!this.online) return;
    this.online = false;
    let p: Player;
    if (this.ses) p = await this.local.me().catch(() => this.startSession());   // sesi luring lama belum terkirim: lanjutkan
    else p = await this.startSession();
    this.onStatus({ online: false, pending: this.pending, player: p });
    clearInterval(this.timer); this.timer = window.setInterval(() => void this.probe(), 8000);
  }
  private async startSession() {
    const p = this.last ? await this.local.adopt(this.last) : await this.local.login(this.name);
    this.ses = { sid: Date.now().toString(36) + Math.random().toString(36).slice(2, 8), bait0: { ...p.bait }, catches: [], released: [] };
    this.saveSes(); return p;
  }
  /** Coba sambung lagi: kirim hasil luring, ambil data pemain dari server. */
  async probe() {
    if (this.online || this.busy || navigator.onLine === false) return;
    this.busy = true;
    try {
      if (!(await this.remote.ping())) return;
      let player = await this.remote.login(this.name), synced: OfflineResult | undefined;
      if (this.ses) {
        const lp = await this.local.me().catch(() => null), s = this.ses;
        const baitUsed: Partial<Record<BaitId, number>> = {};
        if (lp) for (const b of Object.keys(s.bait0) as BaitId[]) { const n = (s.bait0[b] ?? 0) - (lp.bait[b] ?? 0); if (n > 0) baitUsed[b] = n; }
        try {
          const r = await this.remote.syncOffline({ sid: s.sid, catches: s.catches, baitUsed, released: s.released });
          synced = r; player = r.player;
          // perlengkapan yang diganti saat luring
          if (lp && (lp.curBait !== player.curBait || lp.curRod !== player.curRod || lp.curLine !== player.curLine))
            player = (await this.remote.equip({ bait: lp.curBait, rod: lp.curRod, line: lp.curLine }).catch(() => ({ player }))).player;
        } catch (e) { if (e instanceof NetError) return; /* ditolak server: hasil luring dibuang supaya tidak macet */ }
        this.ses = null; this.saveSes();
      }
      this.online = true; clearInterval(this.timer);
      this.last = player; store.set('offPlayer', player);
      this.onStatus({ online: true, pending: 0, player, synced });
    } catch { /* masih belum tersambung */ } finally { this.busy = false; }
  }

  // ---------- inti permainan ----------
  async login(name: string): Promise<Player> {
    this.name = name;
    try {
      const p = await this.remote.login(name);
      this.last = p; store.set('offPlayer', p);
      if (this.ses) { this.online = false; await this.probe(); if (this.online) return this.last!; this.online = true; }
      return p;
    } catch (e) {
      if (!(e instanceof NetError)) throw e;
      await this.goOffline(); return this.local.me();
    }
  }
  me() { return this.online ? this.viaServer(() => this.remote.me()) : this.local.me(); }
  async world() {
    if (this.online) try { return await this.remote.world(); } catch (e) { if (!(e instanceof NetError)) throw e; await this.goOffline(); }
    return this.local.world();
  }
  async cast(a: { spot: string; zone: Zone; sub: SubZone }) {
    if (this.online) try {
      const r = await this.remote.cast(a); this.casts.set(r.castId, a.spot); if (this.casts.size > 20) this.casts.delete(this.casts.keys().next().value!);
      return r;
    } catch (e) { if (!(e instanceof NetError)) throw e; await this.goOffline(); }
    return this.local.cast(a);
  }
  async hook(castId: string): Promise<HookResult> {
    const spot = this.casts.get(castId);
    if (spot === undefined) return this.local.hook(castId);
    this.casts.delete(castId);
    if (this.online) try {
      const r = await this.remote.hook(castId);
      if (r.result === 'hooked') this.hooks.set(r.hookId, { ...r, spot });
      return r;
    } catch (e) { if (!(e instanceof NetError)) throw e; await this.goOffline(); }
    throw new Error('Jaringan terputus — lanjut main luring. Lempar lagi.');
  }
  async land(hookId: string, result: 'caught' | 'lost', keep = true, auto = false): Promise<LandResult> {
    if (auto) {
      // mancing otomatis hanya daring: hasilnya diputuskan dadu server
      if (!this.online) throw new Error('Mancing otomatis perlu jaringan. ' + NEED_NET);
      this.hooks.delete(hookId);
      try { return this.keep(await this.remote.land(hookId, result, keep, true)); }
      catch (e) { if (e instanceof NetError) { await this.goOffline(); throw new Error('Jaringan terputus. Mancing otomatis berhenti.'); } throw e; }
    }
    const h = this.hooks.get(hookId);
    if (!h) {
      const r = await this.local.land(hookId, result, keep);
      if (r.result === 'caught' && r.catch) this.note(r.catch);
      return r;
    }
    this.hooks.delete(hookId);
    if (this.online) try { return this.keep(await this.remote.land(hookId, result, keep)); }
    catch (e) { if (!(e instanceof NetError)) throw e; await this.goOffline(); }
    if (result === 'lost') return { result: 'lost' };
    // ikan sudah menang ditarik tetapi sambungan putus: tetap dihitung, sebagai hasil luring
    const r = await this.local.award({ id: 'o' + Date.now().toString(36), k: h.species as SpeciesId, weight: h.weight, tier: h.tier, t: h.t, spot: h.spot });
    this.note(r.catch, hookId); return r;
  }
  private note(c: { id: string; species: SpeciesId; weight: number; at: number; spot: string }, hook?: string) {
    if (!this.ses) return;
    this.ses.catches.push({ id: c.id, species: c.species, weight: c.weight, at: c.at, spot: c.spot, hook }); this.saveSes();
    this.onStatus({ online: false, pending: this.pending });
  }
  async release(id: string) {
    if (this.online) return this.viaServer(() => this.remote.release(id));
    const r = await this.local.release(id);
    if (this.ses) {
      const i = this.ses.catches.findIndex(c => c.id === id);
      if (i >= 0) this.ses.catches.splice(i, 1); else this.ses.released.push(id);
      this.saveSes(); this.onStatus({ online: false, pending: this.pending });
    }
    return r;
  }
  equip(a: { bait?: BaitId; rod?: RodId; line?: LineId }) { return this.online ? this.viaServer(() => this.remote.equip(a)) : this.local.equip(a); }
}

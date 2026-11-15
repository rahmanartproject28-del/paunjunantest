// Tukar langsung antarpemain: umpan, joran, senar, dan koin (gold).
//
// Alur:  A mengajukan penawaran ke B  →  barang & koin A langsung DITAHAN (dikeluarkan dari tas A)
//        →  B menerima: sisi B diperiksa & diambil, B langsung dapat barang A, barang B dikirim ke "kotak kiriman" A
//        →  B menolak / A membatalkan / lewat 24 jam: titipan A dikembalikan.
//
// Aman dari penggandaan barang:
//  - barang penawar ditahan sejak penawaran dibuat → tidak bisa dijual/ditawarkan dua kali;
//  - setiap permintaan hanya menulis data PEMAIN YANG MEMINTA (server memegang kunci per pemain);
//    barang untuk pemain lain ditulis ke daftar kiriman DI DOKUMEN YANG SAMA dengan penawaran (satu transaksi atomik),
//    lalu diambil sendiri oleh pemiliknya saat membuka layar tukar.
import { BAITS, RODS, LINES, type BaitId, type RodId, type LineId } from './data';
import { GameError, type Player, type Store } from './authority';
import { levelInfo } from './rules';
import { isBanned } from './admin';
import type { DocStore } from './social';

export interface TradeSide { coins: number; bait: Partial<Record<BaitId, number>>; rods: RodId[]; lines: LineId[] }
export interface Trade {
  id: string; from: string; fromName: string; to: string; toName: string;
  /** yang diberikan penawar (sudah ditahan) */ give: TradeSide;
  /** yang diminta dari penerima */ want: TradeSide;
  note?: string; at: number;
}
/** Barang yang menunggu diambil pemiliknya. */
export interface Delivery { id: string; to: string; side: TradeSide; why: 'tukar' | 'ditolak' | 'kedaluwarsa' | 'pasar'; fromName: string; at: number }
export interface TradesDoc { list: Trade[]; deliver: Delivery[] }

/** Potongan koin yang diterima lewat tukar (hilang dari permainan: rem inflasi & jual-beli koin di luar game). */
export const TRADE_FEE = 0.05;
export const TRADE_TTL = 24 * 3600, TRADE_MAX_OUT = 5, TRADE_MAX_IN = 20, TRADE_MIN_LV = 2;
export const TRADE_MAX_COINS = 1_000_000, TRADE_MAX_BAIT = 999;

export const emptySide = (): TradeSide => ({ coins: 0, bait: {}, rods: [], lines: [] });
export const sideEmpty = (s: TradeSide) => !s.coins && !Object.values(s.bait).some(n => (n ?? 0) > 0) && !s.rods.length && !s.lines.length;
/** Perkiraan nilai (harga toko) — untuk tampilan & pedagang simulasi. */
export function sideValue(s: TradeSide) {
  let v = s.coins;
  for (const [k, n] of Object.entries(s.bait)) { const B = BAITS[k as BaitId]; if (B) v += (n ?? 0) * B.price / B.pack; }
  for (const r of s.rods) v += RODS[r]?.price ?? 0;
  for (const l of s.lines) v += LINES[l]?.price ?? 0;
  return Math.round(v);
}
/** Koin yang sampai ke penerima setelah potongan. */
export const afterFee = (coins: number) => coins - Math.ceil(coins * TRADE_FEE);
export function sideText(s: TradeSide) {
  const parts: string[] = [];
  if (s.coins) parts.push(s.coins.toLocaleString('id-ID') + ' koin');
  for (const [k, n] of Object.entries(s.bait)) if (n) parts.push(n + '× umpan ' + (BAITS[k as BaitId]?.name ?? k));
  for (const r of s.rods) parts.push(RODS[r]?.name ?? r);
  for (const l of s.lines) parts.push(LINES[l]?.name ?? l);
  return parts.join(', ') || '—';
}

/** Rapikan masukan dari HP (jangan percaya apa pun). */
export function cleanSide(raw: unknown): TradeSide {
  const r = (raw ?? {}) as Partial<Record<keyof TradeSide, unknown>>, s = emptySide();
  const c = Math.floor(Number(r.coins ?? 0));
  if (!Number.isFinite(c) || c < 0 || c > TRADE_MAX_COINS) throw new GameError(`Jumlah koin 0–${TRADE_MAX_COINS.toLocaleString('id-ID')}.`);
  s.coins = c;
  if (r.bait && typeof r.bait === 'object') for (const [k, v] of Object.entries(r.bait as Record<string, unknown>)) {
    if (!BAITS[k as BaitId]) throw new GameError('Umpan tidak dikenal.');
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0 || n > TRADE_MAX_BAIT) throw new GameError(`Jumlah umpan 0–${TRADE_MAX_BAIT}.`);
    if (n) s.bait[k as BaitId] = n;
  }
  for (const x of Array.isArray(r.rods) ? r.rods : []) {
    const k = String(x) as RodId; if (!RODS[k]) throw new GameError('Joran tidak dikenal.');
    if (k === 'pemula') throw new GameError('Joran pemula tidak bisa ditukar.');
    if (!s.rods.includes(k)) s.rods.push(k);
  }
  for (const x of Array.isArray(r.lines) ? r.lines : []) {
    const k = String(x) as LineId; if (!LINES[k]) throw new GameError('Senar tidak dikenal.');
    if (k === 'l20') throw new GameError('Senar bawaan tidak bisa ditukar.');
    if (!s.lines.includes(k)) s.lines.push(k);
  }
  return s;
}

/** Periksa pemain punya semua isi sisi ini. who = 'Anda' / nama pemain (untuk pesan). */
export function checkHas(p: Player, s: TradeSide, who = 'Anda') {
  if (p.coins < s.coins) throw new GameError(`${who === 'Anda' ? 'Koin Anda' : 'Koin ' + who} tidak cukup.`);
  for (const [k, n] of Object.entries(s.bait)) if ((p.bait[k as BaitId] ?? 0) < (n ?? 0)) throw new GameError(`${who} tidak punya ${n}× umpan ${BAITS[k as BaitId].name}.`);
  for (const r of s.rods) {
    if (!p.rods.includes(r)) throw new GameError(`${who} tidak punya ${RODS[r].name}.`);
    if (p.curRod === r) throw new GameError(who === 'Anda' ? `Ganti dulu joran yang dipakai (${RODS[r].name}).` : `${RODS[r].name} sedang dipakai ${who}.`);
  }
  for (const l of s.lines) {
    if (!p.lines.includes(l)) throw new GameError(`${who} tidak punya ${LINES[l].name}.`);
    if (p.curLine === l) throw new GameError(who === 'Anda' ? `Ganti dulu senar yang dipakai (${LINES[l].name}).` : `${LINES[l].name} sedang dipakai ${who}.`);
  }
}
/** Penerima tidak boleh sudah punya joran/senar yang sama (barang unik). */
export function checkCanReceive(p: Player, s: TradeSide, who = 'Anda') {
  for (const r of s.rods) if (p.rods.includes(r)) throw new GameError(`${who} sudah punya ${RODS[r].name}.`);
  for (const l of s.lines) if (p.lines.includes(l)) throw new GameError(`${who} sudah punya ${LINES[l].name}.`);
}
export function takeSide(p: Player, s: TradeSide) {
  checkHas(p, s);
  p.coins -= s.coins;
  for (const [k, n] of Object.entries(s.bait)) p.bait[k as BaitId] = (p.bait[k as BaitId] ?? 0) - (n ?? 0);
  p.rods = p.rods.filter(r => !s.rods.includes(r));
  p.lines = p.lines.filter(l => !s.lines.includes(l));
}
/** Tambahkan ke tas. Joran/senar yang ternyata sudah dimiliki diganti setengah harga toko (tidak hilang). */
export function giveSide(p: Player, s: TradeSide) {
  let refund = 0;
  p.coins += s.coins;
  for (const [k, n] of Object.entries(s.bait)) p.bait[k as BaitId] = (p.bait[k as BaitId] ?? 0) + (n ?? 0);
  for (const r of s.rods) { if (p.rods.includes(r)) refund += Math.floor(RODS[r].price / 2); else p.rods.push(r); }
  for (const l of s.lines) { if (p.lines.includes(l)) refund += Math.floor(LINES[l].price / 2); else p.lines.push(l); }
  p.coins += refund;
  return refund;
}
/** Sisi yang diterima: koin sudah dipotong biaya. */
const net = (s: TradeSide): TradeSide => ({ ...s, bait: { ...s.bait }, rods: [...s.rods], lines: [...s.lines], coins: afterFee(s.coins) });

export interface TradeOptions { store: Store & DocStore; now?: () => number; newId?: () => string }
export interface TradeBoard { incoming: Trade[]; outgoing: Trade[]; got: Delivery[]; player: Player }

export class Trades {
  private now: () => number; private id: () => string;
  constructor(private o: TradeOptions) {
    this.now = o.now ?? (() => Date.now() / 1000);
    let seq = 0; this.id = o.newId ?? (() => 't' + Date.now().toString(36) + (++seq).toString(36) + Math.floor(Math.random() * 1e6).toString(36));
  }
  private async player(pid: string) { const p = await this.o.store.getPlayer(pid); if (!p) throw new GameError('Pemain tidak ditemukan.', 401); return p; }
  private doc(cur: TradesDoc | null): TradesDoc { return { list: cur?.list ?? [], deliver: cur?.deliver ?? [] }; }
  /** Penawaran kedaluwarsa → titipan kembali ke kotak kiriman penawar. */
  private sweep(d: TradesDoc) {
    const t = this.now();
    for (const x of d.list.filter(x => x.at + TRADE_TTL <= t)) d.deliver.push({ id: this.id(), to: x.from, side: x.give, why: 'kedaluwarsa', fromName: x.toName, at: t });
    d.list = d.list.filter(x => x.at + TRADE_TTL > t);
  }

  /** Daftar penawaran + ambil semua kiriman untuk pemain ini (dipanggil saat membuka layar tukar). */
  async board(pid: string): Promise<TradeBoard> {
    let got: Delivery[] = [], player!: Player;
    const d = await this.o.store.updateDoc<TradesDoc>('trades', async cur => {
      const d = this.doc(cur); this.sweep(d);
      got = d.deliver.filter(x => x.to === pid);
      player = await this.player(pid);
      if (got.length) { for (const g of got) giveSide(player, g.side); await this.o.store.savePlayer(player); d.deliver = d.deliver.filter(x => x.to !== pid); }
      return d;
    });
    // hasil penjualan di pasar (penjual menerima koin di sini juga)
    const paid = await this.collectMarket(pid, player);
    return { incoming: d.list.filter(x => x.to === pid), outgoing: d.list.filter(x => x.from === pid), got: [...got, ...paid], player };
  }
  private async collectMarket(pid: string, p: Player) {
    const pre = await this.o.store.getDoc<{ paid?: Delivery[] }>('market');
    if (!pre?.paid?.some(x => x.to === pid)) return [];
    let got: Delivery[] = [];
    await this.o.store.updateDoc<{ items: unknown[]; paid?: Delivery[] }>('market', async cur => {
      const d = { items: cur?.items ?? [], paid: cur?.paid ?? [] };
      got = d.paid.filter(x => x.to === pid); if (!got.length) return d;
      const fresh = await this.player(pid); for (const g of got) giveSide(fresh, g.side); await this.o.store.savePlayer(fresh);
      Object.assign(p, fresh); d.paid = d.paid.filter(x => x.to !== pid); return d;
    });
    return got;
  }

  /** Barang yang bisa ditawar dari pemain lain (koin tidak diperlihatkan). */
  async inventory(otherId: string) {
    const p = await this.player(otherId);
    return { id: p.id, name: p.name, lv: levelInfo(p.xp).lv,
      rods: p.rods.filter(r => r !== 'pemula' && r !== p.curRod), lines: p.lines.filter(l => l !== 'l20' && l !== p.curLine),
      bait: Object.fromEntries(Object.entries(p.bait).filter(([, n]) => (n ?? 0) > 0)) as Partial<Record<BaitId, number>> };
  }

  async propose(pid: string, a: { to: string; give: unknown; want: unknown; note?: string }) {
    const give = cleanSide(a.give), want = cleanSide(a.want), to = String(a.to ?? '');
    if (sideEmpty(give) && sideEmpty(want)) throw new GameError('Isi dulu barang yang ditawarkan atau diminta.');
    if (sideEmpty(give)) throw new GameError('Tawarkan sesuatu (barang atau koin) sebagai ganti.');
    if (give.coins && want.coins) throw new GameError('Koin hanya boleh di salah satu sisi.');
    if (to === pid) throw new GameError('Tidak bisa menukar dengan diri sendiri.');
    const t = this.now(), note = String(a.note ?? '').replace(/[<>]/g, '').slice(0, 60);
    let trade!: Trade, me!: Player;
    await this.o.store.updateDoc<TradesDoc>('trades', async cur => {
      const d = this.doc(cur); this.sweep(d);
      me = await this.player(pid);
      if (isBanned(me, t)) throw new GameError('Akun Anda sedang diblokir.', 403);
      if (levelInfo(me.xp).lv < TRADE_MIN_LV) throw new GameError(`Tukar antarpemain terbuka di level ${TRADE_MIN_LV}.`);
      const other = await this.o.store.getPlayer(to);
      if (!other) throw new GameError('Pemain tujuan tidak ditemukan.');
      if (isBanned(other, t)) throw new GameError('Pemain itu sedang tidak bisa bertransaksi.');
      if (d.list.filter(x => x.from === pid).length >= TRADE_MAX_OUT) throw new GameError(`Maksimal ${TRADE_MAX_OUT} penawaran yang menunggu. Batalkan salah satu dulu.`);
      if (d.list.filter(x => x.to === to).length >= TRADE_MAX_IN) throw new GameError('Kotak penawaran pemain itu sedang penuh.');
      if (d.list.some(x => x.from === pid && x.to === to)) throw new GameError('Masih ada penawaran Anda yang menunggu jawaban pemain ini.');
      checkCanReceive(other, give, other.name);
      checkHas(other, want, other.name);
      checkCanReceive(me, want);
      takeSide(me, give);                 // ditahan sampai diterima / ditolak
      trade = { id: this.id(), from: pid, fromName: me.name, to, toName: other.name, give, want, note: note || undefined, at: t };
      d.list.push(trade);
      await this.o.store.savePlayer(me);
      return d;
    });
    return { player: me, trade };
  }

  async accept(pid: string, id: string) {
    let trade!: Trade, me!: Player;
    await this.o.store.updateDoc<TradesDoc>('trades', async cur => {
      const d = this.doc(cur); this.sweep(d);
      const i = d.list.findIndex(x => x.id === id && x.to === pid);
      if (i < 0) throw new GameError('Penawaran sudah tidak ada (dibatalkan atau kedaluwarsa).');
      trade = d.list[i]; me = await this.player(pid);
      if (isBanned(me, this.now())) throw new GameError('Akun Anda sedang diblokir.', 403);
      checkCanReceive(me, trade.give);
      takeSide(me, trade.want);
      giveSide(me, net(trade.give));
      d.list.splice(i, 1);
      d.deliver.push({ id: this.id(), to: trade.from, side: net(trade.want), why: 'tukar', fromName: me.name, at: this.now() });
      await this.o.store.savePlayer(me);
      return d;
    });
    return { player: me, trade };
  }

  /** Penerima menolak: titipan dikembalikan ke kotak kiriman penawar. */
  async decline(pid: string, id: string) {
    let trade!: Trade;
    await this.o.store.updateDoc<TradesDoc>('trades', cur => {
      const d = this.doc(cur), i = d.list.findIndex(x => x.id === id && x.to === pid);
      if (i < 0) throw new GameError('Penawaran sudah tidak ada.');
      trade = d.list.splice(i, 1)[0];
      d.deliver.push({ id: this.id(), to: trade.from, side: trade.give, why: 'ditolak', fromName: trade.toName, at: this.now() });
      return d;
    });
    return { trade, player: await this.player(pid) };
  }

  /** Penawar membatalkan: titipan langsung kembali ke tas. */
  async cancel(pid: string, id: string) {
    let me!: Player, trade!: Trade;
    await this.o.store.updateDoc<TradesDoc>('trades', async cur => {
      const d = this.doc(cur), i = d.list.findIndex(x => x.id === id && x.from === pid);
      if (i < 0) throw new GameError('Penawaran sudah tidak ada (mungkin baru saja diterima).');
      trade = d.list.splice(i, 1)[0];
      me = await this.player(pid); giveSide(me, trade.give); await this.o.store.savePlayer(me);
      return d;
    });
    return { player: me, trade };
  }

  /** Hapus akun: penawaran ditarik (titipan ke kotak kiriman masing-masing tidak lagi relevan untuk akun ini). */
  async forget(pid: string) {
    await this.o.store.updateDoc<TradesDoc>('trades', cur => {
      const d = this.doc(cur), t = this.now();
      for (const x of d.list.filter(x => x.to === pid)) d.deliver.push({ id: this.id(), to: x.from, side: x.give, why: 'ditolak', fromName: x.toName, at: t });
      d.list = d.list.filter(x => x.from !== pid && x.to !== pid);
      d.deliver = d.deliver.filter(x => x.to !== pid);
      return d;
    });
  }
}

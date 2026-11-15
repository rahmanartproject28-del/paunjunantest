// Panel developer / admin: peluang ikan per jenis, bobot ukuran, pengali harga & XP, pengumuman,
// stok spot, beri koin (bantuan pemain), dan log audit. Dipakai server (rute /api/admin) dan mode lokal.
import { DEFAULT_AUTO, validateAuto, type AutoConfig } from './auto';
import { SPECIES, SPECIES_IDS, DEFAULT_SPOTS, type SpeciesId, type Species } from './data';
import { GameError, type Store } from './authority';
import type { RateTable } from './rules';
import type { DocStore } from './social';

/** Editor ikan: bagian data jenis yang boleh diubah admin. */
export interface SpeciesEdit { name?: string; pricePerKg?: number; w?: [number, number]; str?: number; back?: string; side?: string; belly?: string }
export type SpeciesEdits = Partial<Record<SpeciesId, SpeciesEdit>>;
const ORIGINAL = Object.fromEntries(SPECIES_IDS.map(k => [k, structuredClone(SPECIES[k])])) as Record<SpeciesId, Species>;
/** Terapkan suntingan ke tabel SPECIES bersama (dipakai aturan, harga, tampilan). Kosong = kembali ke bawaan. */
export function applySpeciesEdits(ed: SpeciesEdits = {}) {
  for (const k of SPECIES_IDS) {
    const o = ORIGINAL[k], e = ed[k] ?? {}, t = SPECIES[k];
    t.name = e.name ?? o.name; t.pricePerKg = e.pricePerKg ?? o.pricePerKg; t.w = e.w ? [e.w[0], e.w[1]] : [o.w[0], o.w[1]]; t.str = e.str ?? o.str;
    t.look = { ...o.look, ...(e.back ? { back: e.back } : {}), ...(e.side ? { side: e.side } : {}), ...(e.belly ? { belly: e.belly } : {}) };
  }
}
export function validateSpeciesEdits(ed: unknown): SpeciesEdits {
  const out: SpeciesEdits = {}, hex = /^#[0-9a-f]{6}$/i;
  for (const [k, v] of Object.entries((ed ?? {}) as Record<string, SpeciesEdit>)) {
    if (!SPECIES_IDS.includes(k as SpeciesId) || !v) continue;
    const e: SpeciesEdit = {};
    if (v.name !== undefined) { const n = String(v.name).trim().slice(0, 20); if (n.length < 2) throw new GameError('Nama ikan minimal 2 huruf.'); e.name = n; }
    if (v.pricePerKg !== undefined) { const x = Number(v.pricePerKg); if (!(x >= 0.5 && x <= 500)) throw new GameError('Harga per kg 0,5–500 koin.'); e.pricePerKg = x; }
    if (v.w !== undefined) { const a = Number(v.w[0]), b = Number(v.w[1]); if (!(a >= 0.05 && b <= 100 && a < b)) throw new GameError('Berat: minimal ≥ 0,05 kg, maksimal ≤ 100 kg, dan min < maks.'); e.w = [a, b]; }
    if (v.str !== undefined) { const x = Number(v.str); if (!(x >= 0.2 && x <= 3)) throw new GameError('Kekuatan tarikan 0,2–3.'); e.str = x; }
    for (const c of ['back', 'side', 'belly'] as const) if (v[c] !== undefined) { if (!hex.test(String(v[c]))) throw new GameError('Warna harus format #rrggbb.'); e[c] = String(v[c]); }
    out[k as SpeciesId] = e;
  }
  return out;
}

/** Acara musiman: peluang jenis ikan tertentu naik, XP/harga bisa ikut naik, ada papan khusus. */
export interface GameEvent { id: string; name: string; desc: string; icon: string; species?: SpeciesId; rateMul: number; xpMul: number; priceMul: number; startsAt: number; endsAt: number }
export const EVENT_PRESETS: Omit<GameEvent, 'id' | 'startsAt' | 'endsAt'>[] = [
  { name: 'Minggu Toman', desc: 'Toman keluar dari persembunyian! Peluang toman dua kali lipat.', icon: '🐊', species: 'toman', rateMul: 2, xpMul: 1, priceMul: 1 },
  { name: 'Pesta Nila', desc: 'Nila berkumpul di keramba. Peluang nila ×1,8 dan harga jual ×1,2.', icon: '🐟', species: 'nila', rateMul: 1.8, xpMul: 1, priceMul: 1.2 },
  { name: 'XP Ganda Akhir Pekan', desc: 'Semua tangkapan memberi XP dua kali lipat.', icon: '✨', rateMul: 1, xpMul: 2, priceMul: 1 },
];
export interface GameConfig { rates: RateTable; priceMul: number; xpMul: number; motd: string; updatedAt: number; backdropAt?: number; species?: SpeciesEdits; events?: GameEvent[];
  /** sembunyikan pepohonan di ujung/seberang danau (supaya latar foto pegunungan terlihat utuh) */
  hideFarTrees?: boolean;
  /** foto latar belakang pemain & foto dasar danau (waktu dipasang); kejernihan air */
  backdropBackAt?: number; bedAt?: number; waterClarity?: 'jernih' | 'sedang' | 'keruh';
  /** mancing otomatis: peluang berhasil per ukuran, batas harian, pengali hadiah, dll. (hanya pemilik/admin) */
  auto?: AutoConfig }
/** Slot foto latar: depan (seberang danau), belakang (di belakang pemain), dasar (dasar danau, terlihat di air jernih). */
export type BackdropSlot = 'depan' | 'belakang' | 'dasar';
const SLOT_DOC: Record<BackdropSlot, string> = { depan: 'backdrop', belakang: 'backdrop_belakang', dasar: 'backdrop_dasar' };
const SLOT_AT: Record<BackdropSlot, 'backdropAt' | 'backdropBackAt' | 'bedAt'> = { depan: 'backdropAt', belakang: 'backdropBackAt', dasar: 'bedAt' };
const SLOT_NAME: Record<BackdropSlot, string> = { depan: 'latar depan', belakang: 'latar belakang', dasar: 'dasar danau' };
export const DEFAULT_CONFIG: GameConfig = { rates: {}, priceMul: 1, xpMul: 1, motd: '', updatedAt: 0 };
export const BACKDROP_MAX = 1_600_000; // karakter data URL (±1,2 MB gambar)
export interface AuditRow { at: number; who: string; act: string; detail: string }
/** Sedang diblokir sekarang? (until 0 = permanen) */
export const isBanned = (p: { banned?: { until: number } }, now: number) => !!p.banned && (p.banned.until === 0 || p.banned.until > now);
/** Pesan untuk pemain yang diblokir. */
export function banMessage(b: { until: number; reason: string }) {
  const until = b.until === 0 ? 'permanen' : 'sampai ' + new Date(b.until * 1000).toLocaleString('id-ID', { timeZone: 'Asia/Makassar', dateStyle: 'medium', timeStyle: 'short' }) + ' WITA';
  return `Akun diblokir (${until}). Alasan: ${b.reason}`;
}

export class AdminService {
  /** konfigurasi aktif (dibaca sinkron oleh Authority) */
  cfg: GameConfig = { ...DEFAULT_CONFIG };
  constructor(private store: Store & DocStore, private now: () => number = () => Date.now() / 1000) {}

  async load() { this.cfg = { ...DEFAULT_CONFIG, ...(await this.store.getDoc<GameConfig>('config') ?? {}) }; applySpeciesEdits(this.cfg.species); return this.cfg; }
  private async audit(who: string, act: string, detail: string) {
    await this.store.updateDoc<{ rows: AuditRow[] }>('audit', cur => { const d = cur ?? { rows: [] }; d.rows.unshift({ at: this.now(), who, act, detail }); d.rows = d.rows.slice(0, 300); return d; });
  }
  /** Acara yang sedang berjalan pada waktu t (detik), atau null. */
  activeEvent(t = this.now()) { return (this.cfg.events ?? []).find(e => e.startsAt <= t && e.endsAt >= t) ?? null; }
  /** Peluang efektif = peluang admin × pengali acara aktif. */
  effRates(): RateTable {
    const ev = this.activeEvent(); if (!ev?.species || ev.rateMul === 1) return this.cfg.rates;
    const r: RateTable = { ...this.cfg.rates }, cur = r[ev.species] ?? {};
    r[ev.species] = { ...cur, rate: (cur.rate ?? 1) * ev.rateMul }; return r;
  }
  effPriceMul() { return this.cfg.priceMul * (this.activeEvent()?.priceMul ?? 1); }
  effXpMul() { return this.cfg.xpMul * (this.activeEvent()?.xpMul ?? 1); }
  /** pengaturan mancing otomatis yang berlaku (bawaan + ubahan admin) */
  effAuto(): AutoConfig { return { ...DEFAULT_AUTO, ...(this.cfg.auto ?? {}) }; }
  async setEvents(list: unknown, who: string) {
    if (!Array.isArray(list) || list.length > 30) throw new GameError('Daftar acara tidak valid.');
    const out: GameEvent[] = list.map((raw, i) => {
      const e = raw as Partial<GameEvent>;
      const name = String(e.name ?? '').trim().slice(0, 40); if (name.length < 3) throw new GameError('Nama acara minimal 3 huruf.');
      const sp = e.species ? String(e.species) : undefined; if (sp && !SPECIES_IDS.includes(sp as SpeciesId)) throw new GameError('Jenis ikan acara tidak dikenal.');
      const num = (v: unknown, lo: number, hi: number, label: string) => { const x = Number(v ?? 1); if (!(x >= lo && x <= hi)) throw new GameError(`${label} harus ${lo}–${hi}.`); return x; };
      const s = Math.floor(Number(e.startsAt)), en = Math.floor(Number(e.endsAt));
      if (!(s > 0 && en > s && en - s <= 31 * 86400)) throw new GameError('Waktu acara tidak valid (maks. 31 hari).');
      return { id: String(e.id || 'ev' + s.toString(36) + i).slice(0, 24), name, desc: String(e.desc ?? '').slice(0, 160), icon: String(e.icon ?? '🎉').slice(0, 4),
        species: sp as SpeciesId | undefined, rateMul: num(e.rateMul, 0.5, 5, 'Pengali peluang'), xpMul: num(e.xpMul, 1, 3, 'Pengali XP'), priceMul: num(e.priceMul, 1, 3, 'Pengali harga'), startsAt: s, endsAt: en };
    });
    for (const a of out) for (const b of out) if (a !== b && a.startsAt < b.endsAt && b.startsAt < a.endsAt) throw new GameError(`Acara "${a.name}" dan "${b.name}" bertabrakan waktunya.`);
    const c = { ...this.cfg, events: out.sort((x, y) => x.startsAt - y.startsAt), updatedAt: this.now() };
    await this.store.updateDoc<GameConfig>('config', () => c); this.cfg = c;
    await this.audit(who, 'acara', out.map(e => e.name).join(', ') || '(kosong)');
    return c;
  }
  /** Papan khusus acara: ikan terberat (jenis acara, atau semua jenis) selama acara berjalan. */
  async eventBoard(limit = 20) {
    const ev = this.activeEvent() ?? (this.cfg.events ?? []).filter(e => e.endsAt < this.now()).slice(-1)[0] ?? null;
    if (!ev || !this.store.topCatches) return { event: ev, rows: [] as { name: string; weight: number; species: SpeciesId; at: number }[], active: false };
    return { event: ev, rows: await this.store.topCatches(ev.startsAt, ev.endsAt, ev.species ?? null, limit), active: this.activeEvent()?.id === ev.id };
  }
  async auditLog() { return (await this.store.getDoc<{ rows: AuditRow[] }>('audit'))?.rows ?? []; }

  /** Ubah sebagian konfigurasi; nilai divalidasi supaya tidak merusak game. */
  async setConfig(patch: Partial<GameConfig>, who: string) {
    const c = { ...this.cfg };
    if (patch.rates) {
      const r: RateTable = {};
      for (const [k, v] of Object.entries(patch.rates)) {
        if (!SPECIES_IDS.includes(k as SpeciesId) || !v) continue;
        const e: { rate?: number; tiers?: number[] } = {};
        if (v.rate !== undefined) { const x = Number(v.rate); if (!(x >= 0 && x <= 10)) throw new GameError('Pengali peluang 0–10.'); e.rate = x; }
        if (v.tiers) { const t = v.tiers.map(Number); if (t.length !== 4 || t.some(x => !(x >= 0 && x <= 1000)) || t.every(x => x === 0)) throw new GameError('Bobot ukuran harus 4 angka ≥ 0.'); e.tiers = t; }
        r[k as SpeciesId] = e;
      }
      c.rates = r;
    }
    if (patch.priceMul !== undefined) { const x = Number(patch.priceMul); if (!(x >= 0.1 && x <= 5)) throw new GameError('Pengali harga 0,1–5.'); c.priceMul = x; }
    if (patch.xpMul !== undefined) { const x = Number(patch.xpMul); if (!(x >= 0.1 && x <= 5)) throw new GameError('Pengali XP 0,1–5.'); c.xpMul = x; }
    if (patch.motd !== undefined) c.motd = String(patch.motd).slice(0, 200);
    if (patch.hideFarTrees !== undefined) c.hideFarTrees = !!patch.hideFarTrees;
    if (patch.waterClarity !== undefined) { if (!['jernih', 'sedang', 'keruh'].includes(patch.waterClarity)) throw new GameError('Kejernihan air: jernih, sedang, atau keruh.'); c.waterClarity = patch.waterClarity; }
    if (patch.species !== undefined) c.species = validateSpeciesEdits(patch.species);
    if (patch.auto !== undefined) c.auto = validateAuto(patch.auto, this.effAuto());
    c.updatedAt = this.now();
    await this.store.updateDoc<GameConfig>('config', () => c);
    this.cfg = c; applySpeciesEdits(c.species);
    await this.audit(who, 'konfigurasi', JSON.stringify(patch).slice(0, 300));
    return c;
  }
  /** Latar lokasi dari foto (data URL JPEG/WebP/PNG). String kosong = hapus. Disimpan terpisah dari config (besar). */
  async setBackdrop(url: string, who: string, slot: BackdropSlot = 'depan') {
    if (!SLOT_DOC[slot]) throw new GameError('Slot latar tidak dikenal.');
    const u = String(url ?? '');
    if (u && (!/^data:image\/(jpeg|png|webp);base64,/.test(u) || u.length > BACKDROP_MAX)) throw new GameError('Foto harus JPG/PNG/WebP dan maksimal ±1,2 MB.');
    await this.store.updateDoc<{ url: string }>(SLOT_DOC[slot], () => ({ url: u }));
    const c: GameConfig = { ...this.cfg, [SLOT_AT[slot]]: u ? this.now() : undefined, updatedAt: this.now() };
    await this.store.updateDoc<GameConfig>('config', () => c); this.cfg = c;
    await this.audit(who, SLOT_NAME[slot], u ? `foto ${(u.length / 1024).toFixed(0)} KB` : 'dihapus');
    return c;
  }
  async backdrop(slot: BackdropSlot = 'depan') { return SLOT_DOC[slot] ? (await this.store.getDoc<{ url: string }>(SLOT_DOC[slot]))?.url ?? '' : ''; }
  async stock() {
    const out: Record<string, Record<string, number>> = {};
    for (const s of DEFAULT_SPOTS) out[s.id] = (await this.store.getStock(s.id)) ?? { ...s.stock };
    return out;
  }
  async setStock(spot: string, species: SpeciesId, n: number, who: string) {
    const def = DEFAULT_SPOTS.find(s => s.id === spot); if (!def) throw new GameError('Spot tidak dikenal.');
    if (!SPECIES_IDS.includes(species)) throw new GameError('Jenis ikan tidak dikenal.');
    const v = Math.floor(Number(n)); if (!(v >= 0 && v <= 100000)) throw new GameError('Stok 0–100.000.');
    const cur = (await this.store.getStock(spot)) ?? { ...def.stock };
    cur[species] = v; await this.store.initStock(spot, cur);
    await this.audit(who, 'stok', `${spot} ${species} = ${v}`);
    return this.stock();
  }
  async resetStock(spot: string, who: string) {
    const def = DEFAULT_SPOTS.find(s => s.id === spot); if (!def) throw new GameError('Spot tidak dikenal.');
    await this.store.initStock(spot, { ...def.stock });
    await this.audit(who, 'isi ulang stok', spot);
    return this.stock();
  }
  /** Blokir pemain. minutes: 0 = permanen, angka = lama blokir (menit), null = buka blokir. */
  async setBan(playerId: string, minutes: number | null, reason: string, who: string) {
    const p = await this.store.getPlayer(playerId); if (!p) throw new GameError('Pemain tidak ditemukan.');
    const why = String(reason ?? '').trim().slice(0, 160);
    if (minutes === null) {
      if (!p.banned) throw new GameError('Pemain ini tidak sedang diblokir.');
      delete p.banned; await this.store.savePlayer(p);
      await this.audit(who, 'buka blokir', `${p.name} (${p.id})${why ? ': ' + why : ''}`);
      return { id: p.id, name: p.name, banned: null };
    }
    const m = Math.floor(Number(minutes));
    if (!(m >= 0 && m <= 525600)) throw new GameError('Lama blokir 0 (permanen) sampai 525.600 menit (1 tahun).');
    if (why.length < 3) throw new GameError('Tulis alasan blokir (min. 3 huruf) — tercatat di log.');
    const now = this.now();
    p.banned = { until: m === 0 ? 0 : Math.floor(now + m * 60), reason: why, by: who, at: Math.floor(now) };
    await this.store.savePlayer(p);
    await this.audit(who, 'blokir', `${p.name} (${p.id}) ${m === 0 ? 'permanen' : m + ' menit'}: ${why}`);
    return { id: p.id, name: p.name, banned: p.banned };
  }

  async grantCoins(playerId: string, coins: number, who: string, reason: string) {
    const p = await this.store.getPlayer(playerId); if (!p) throw new GameError('Pemain tidak ditemukan.');
    const n = Math.floor(Number(coins)); if (!(Math.abs(n) >= 1 && Math.abs(n) <= 100000)) throw new GameError('Jumlah koin 1–100.000.');
    p.coins = Math.max(0, p.coins + n); await this.store.savePlayer(p);
    await this.audit(who, 'koin', `${p.name} (${p.id}) ${n > 0 ? '+' : ''}${n}: ${String(reason).slice(0, 80)}`);
    return { id: p.id, name: p.name, coins: p.coins };
  }
}

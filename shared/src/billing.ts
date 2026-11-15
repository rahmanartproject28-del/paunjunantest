// Beli koin (Google Play Billing). Aturan bersama: paket koin, verifikasi sekali-pakai, pencatatan.
// Pemeriksaan ke Google dilakukan oleh `verify` yang disuntikkan (server: Google Play Developer API).
import { GameError, type Store } from './authority';
import type { DocStore } from './social';

export const COIN_PACKS = [
  { id: 'koin_500', coins: 500, bonus: 0, label: 'Segenggam koin', price: 'Rp 15.000' },
  { id: 'koin_1200', coins: 1200, bonus: 100, label: 'Kantong koin', price: 'Rp 29.000' },
  { id: 'koin_3000', coins: 3000, bonus: 500, label: 'Peti koin', price: 'Rp 69.000' },
  { id: 'koin_8000', coins: 8000, bonus: 2000, label: 'Harta karun', price: 'Rp 159.000' },
] as const;
export type PackId = typeof COIN_PACKS[number]['id'];

/** Hasil pemeriksaan ke toko: 0 = dibayar, 1 = dibatalkan, 2 = tertunda (mengikuti purchaseState Google). */
export interface StoreCheck { state: 0 | 1 | 2; orderId: string; consumed?: boolean }
export type PurchaseVerifier = (productId: string, token: string) => Promise<StoreCheck>;
export interface PurchaseRow { token: string; orderId: string; pid: string; pack: string; coins: number; at: number }

export class Billing {
  constructor(private store: Store & DocStore, private verify: PurchaseVerifier, private now: () => number = () => Date.now() / 1000,
    private consume?: (productId: string, token: string) => Promise<void>) {}

  async redeem(pid: string, productId: string, token: string) {
    const pack = COIN_PACKS.find(p => p.id === productId); if (!pack) throw new GameError('Paket koin tidak dikenal.');
    const t = String(token ?? ''); if (t.length < 8 || t.length > 4096) throw new GameError('Token pembelian tidak sah.');
    // sudah pernah ditukar? kembalikan hasil yang sama (aman bila aplikasi mengirim ulang)
    const prev = (await this.store.getDoc<{ rows: PurchaseRow[] }>('purchases'))?.rows.find(r => r.token === t);
    if (prev) { if (prev.pid !== pid) throw new GameError('Token pembelian milik akun lain.', 403); const p = await this.store.getPlayer(pid); return { player: p!, coins: 0, already: true }; }
    const chk = await this.verify(productId, t);
    if (chk.state === 2) throw new GameError('Pembayaran masih tertunda. Koin masuk otomatis setelah pembayaran selesai.');
    if (chk.state !== 0) throw new GameError('Pembelian dibatalkan atau tidak sah.');
    const coins = pack.coins + pack.bonus;
    let dup = false;
    await this.store.updateDoc<{ rows: PurchaseRow[] }>('purchases', cur => {
      const d = cur ?? { rows: [] };
      if (d.rows.some(r => r.token === t || r.orderId === chk.orderId)) { dup = true; return d; }
      d.rows.push({ token: t, orderId: chk.orderId, pid, pack: pack.id, coins, at: this.now() }); return d;
    });
    const p = await this.store.getPlayer(pid); if (!p) throw new GameError('Pemain tidak ditemukan.', 401);
    if (dup) return { player: p, coins: 0, already: true };
    p.coins += coins; await this.store.savePlayer(p);
    if (this.consume) await this.consume(productId, t).catch(() => { /* dicoba lagi saat klaim berikutnya */ });
    return { player: p, coins, already: false };
  }
  async history(pid: string) { return ((await this.store.getDoc<{ rows: PurchaseRow[] }>('purchases'))?.rows ?? []).filter(r => r.pid === pid).map(({ token: _t, ...r }) => r); }
}

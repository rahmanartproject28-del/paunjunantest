// Beli koin di aplikasi HP lewat plugin Capacitor "@capgo/native-purchases" (Google Play Billing).
// Alur aman (koin tidak bisa didapat tanpa bayar, bayaran tidak bisa hilang):
//   1. purchaseProduct TANPA acknowledge otomatis (capacitor.config: autoFinishTransactions=false)
//   2. token dikirim ke server → server memeriksa ke Google Play → koin masuk → server meng-consume
//   3. aplikasi ikut consume (cadangan bila server gagal consume); token yang sama tidak bisa ditukar dua kali
//   4. bila aplikasi tertutup/jaringan putus di tengah jalan: pembelian yang belum selesai dipulihkan
//      saat masuk berikutnya (recoverPurchases). Google mengembalikan dana bila 3 hari tidak di-acknowledge.
// Di browser/artifact tidak ada pembayaran sungguhan.
import { Capacitor } from '@capacitor/core';

interface NpTransaction { transactionId: string; productIdentifier: string; purchaseToken?: string; purchaseState?: string }
interface NpProduct { identifier: string; priceString: string }
interface NP {
  purchaseProduct(o: { productIdentifier: string; productType?: string; quantity?: number; isConsumable?: boolean; autoAcknowledgePurchases?: boolean }): Promise<NpTransaction>;
  getProducts(o: { productIdentifiers: string[]; productType?: string }): Promise<{ products: NpProduct[] }>;
  getUnfinishedTransactions(o?: object): Promise<{ transactions: NpTransaction[] }>;
  consumePurchase(o: { purchaseToken: string }): Promise<void>;
  isBillingSupported(): Promise<{ isBillingSupported: boolean }>;
}

export function nativeStore(): NP | null {
  if (!Capacitor.isNativePlatform()) return null;
  return ((Capacitor as unknown as { Plugins?: Record<string, unknown> }).Plugins?.NativePurchases as NP | undefined) ?? null;
}

const tokenOf = (t: NpTransaction) => t.purchaseToken ?? t.transactionId;
/** Pesan yang dimengerti pemain untuk galat dari Play Billing. */
export function purchaseError(e: unknown): Error {
  const m = String((e as Error)?.message ?? e ?? '');
  if (/cancel|batal|USER_CANCELED/i.test(m)) return new Error('Pembelian dibatalkan.');
  if (/ITEM_ALREADY_OWNED|already owned/i.test(m)) return new Error('Pembelian sebelumnya belum selesai — sedang dipulihkan, coba lagi sebentar.');
  if (/BILLING_UNAVAILABLE|SERVICE_UNAVAILABLE|not supported/i.test(m)) return new Error('Google Play Billing tidak tersedia di HP ini (periksa akun Google & Play Store).');
  if (/NETWORK|network|timeout/i.test(m)) return new Error('Jaringan bermasalah. Bila sudah terbayar, koin dipulihkan otomatis saat masuk berikutnya.');
  return new Error(m || 'Pembelian gagal.');
}

/** Harga asli dari Play Store (mata uang & pajak sesuai akun pemain); kosong bila belum tersedia. */
export async function storePrices(ids: string[]): Promise<Record<string, string>> {
  const np = nativeStore(); if (!np) return {};
  try {
    const r = await np.getProducts({ productIdentifiers: ids, productType: 'inapp' });
    return Object.fromEntries(r.products.map(p => [p.identifier, p.priceString]));
  } catch { return {}; }
}

/** Beli satu paket; mengembalikan token pembelian Google Play untuk diverifikasi server. */
export async function buyPack(productId: string): Promise<string> {
  const np = nativeStore(); if (!np) throw new Error('Pembelian koin hanya tersedia di aplikasi dari Play Store.');
  let t: NpTransaction;
  try { t = await np.purchaseProduct({ productIdentifier: productId, productType: 'inapp', quantity: 1, isConsumable: false, autoAcknowledgePurchases: false }); }
  catch (e) { throw purchaseError(e); }
  const tok = tokenOf(t); if (!tok) throw new Error('Pembelian dibatalkan.');
  return tok;
}

/** Setelah server menukar token: habiskan (consume) supaya paket yang sama bisa dibeli lagi. Galat diabaikan (server biasanya sudah consume). */
export async function finishPack(token: string) {
  const np = nativeStore(); if (!np) return;
  await np.consumePurchase({ purchaseToken: token }).catch(() => {});
}

type Redeem = (productId: string, token: string) => Promise<{ coins: number; already: boolean }>;
/** Pulihkan pembelian yang sudah dibayar tetapi belum ditukar (aplikasi tertutup / jaringan putus). Mengembalikan jumlah koin yang masuk. */
export async function recoverPurchases(redeem: Redeem): Promise<number> {
  const np = nativeStore(); if (!np) return 0;
  let list: NpTransaction[] = [];
  try { list = (await np.getUnfinishedTransactions()).transactions ?? []; } catch { return 0; }
  let coins = 0;
  for (const t of list) {
    const tok = tokenOf(t); if (!tok || !t.productIdentifier) continue;
    if (t.purchaseState && t.purchaseState !== '1') continue; // masih tertunda (bayar di gerai) — tunggu
    try { const r = await redeem(t.productIdentifier, tok); coins += r.coins; await finishPack(tok); }
    catch { /* dicoba lagi saat masuk berikutnya */ }
  }
  return coins;
}

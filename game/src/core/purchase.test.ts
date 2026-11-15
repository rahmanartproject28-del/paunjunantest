import { describe, it, expect } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { buyPack, recoverPurchases, purchaseError, storePrices } from './purchase';

// Play Billing tiruan (plugin @capgo/native-purchases)
function fakePlay(unfinished: { transactionId: string; productIdentifier: string; purchaseToken?: string; purchaseState?: string }[]) {
  const log: string[] = [];
  const np = {
    async purchaseProduct(o: { productIdentifier: string; autoAcknowledgePurchases?: boolean; isConsumable?: boolean }) {
      log.push(`beli ${o.productIdentifier} ack=${o.autoAcknowledgePurchases} consumeKlien=${o.isConsumable}`);
      return { transactionId: 'tok-baru', purchaseToken: 'tok-baru', productIdentifier: o.productIdentifier };
    },
    async getProducts() { return { products: [{ identifier: 'koin_500', priceString: 'Rp 15.000' }] }; },
    async getUnfinishedTransactions() { return { transactions: unfinished }; },
    async consumePurchase(o: { purchaseToken: string }) { log.push('consume ' + o.purchaseToken); },
    async isBillingSupported() { return { isBillingSupported: true }; },
  };
  const C = Capacitor as unknown as { isNativePlatform: () => boolean; Plugins?: Record<string, unknown> };
  C.isNativePlatform = () => true; C.Plugins = { NativePurchases: np };
  return log;
}

describe('beli koin di Android', () => {
  it('membeli tanpa acknowledge otomatis & tanpa consume di klien (server memeriksa dulu)', async () => {
    const log = fakePlay([]);
    expect(await buyPack('koin_500')).toBe('tok-baru');
    expect(log[0]).toBe('beli koin_500 ack=false consumeKlien=false');
    expect(await storePrices(['koin_500'])).toEqual({ koin_500: 'Rp 15.000' });
  });
  it('memulihkan pembelian yang belum ditukar; yang tertunda & gagal dibiarkan untuk nanti', async () => {
    const log = fakePlay([
      { transactionId: 'a', purchaseToken: 'a', productIdentifier: 'koin_500', purchaseState: '1' },
      { transactionId: 'b', purchaseToken: 'b', productIdentifier: 'koin_1200', purchaseState: '2' }, // masih tertunda
      { transactionId: 'c', purchaseToken: 'c', productIdentifier: 'koin_3000', purchaseState: '1' },
    ]);
    const asked: string[] = [];
    const coins = await recoverPurchases(async (id, tok) => {
      asked.push(tok);
      if (tok === 'c') throw new Error('server sibuk');
      return { coins: id === 'koin_500' ? 500 : 0, already: false };
    });
    expect(coins).toBe(500);
    expect(asked).toEqual(['a', 'c']);
    expect(log).toEqual(['consume a']); // c gagal ditukar → tidak di-consume, dicoba lagi saat masuk berikutnya
  });
  it('pesan galat dimengerti pemain', () => {
    expect(purchaseError(new Error('USER_CANCELED')).message).toBe('Pembelian dibatalkan.');
    expect(purchaseError(new Error('BILLING_UNAVAILABLE')).message).toMatch(/Google Play Billing/);
    expect(purchaseError(new Error('network timeout')).message).toMatch(/dipulihkan otomatis/);
  });
});

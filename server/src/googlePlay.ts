// Verifikasi pembelian Google Play (Google Play Developer API) memakai akun layanan (service account).
// Lingkungan: GOOGLE_PLAY_PACKAGE (mis. com.paunjunan.mancing) dan GOOGLE_SERVICE_ACCOUNT_JSON (isi JSON atau jalur berkas).
// BILLING_TEST=1 → token berawalan "test-" diterima tanpa Google (hanya untuk pengembangan/uji beban).
import { createSign } from 'node:crypto';
import fs from 'node:fs';
import type { PurchaseVerifier, StoreCheck } from '@paunjunan/shared';

const b64u = (s: string | Buffer) => Buffer.from(s).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

export function googlePlay(): { verify: PurchaseVerifier; consume: (p: string, t: string) => Promise<void> } | null {
  const env = process.env, pkg = env.GOOGLE_PLAY_PACKAGE ?? 'com.paunjunan.mancing';
  const test = env.BILLING_TEST === '1';
  let sa: { client_email: string; private_key: string } | null = null;
  if (env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
    sa = JSON.parse(raw.startsWith('{') ? raw : fs.readFileSync(raw, 'utf8'));
  }
  if (!sa && !test) return null;
  let tok = { v: '', exp: 0 };
  async function accessToken() {
    if (tok.v && Date.now() / 1000 < tok.exp - 60) return tok.v;
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64u(JSON.stringify({ iss: sa!.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
    const sig = b64u(createSign('RSA-SHA256').update(head + '.' + claim).sign(sa!.private_key));
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }) });
    const j = await r.json() as { access_token?: string; expires_in?: number; error?: string };
    if (!j.access_token) throw new Error('Gagal masuk ke Google Play: ' + (j.error ?? r.status));
    tok = { v: j.access_token, exp: now + (j.expires_in ?? 3600) }; return tok.v;
  }
  const url = (p: string, t: string) => `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(pkg)}/purchases/products/${encodeURIComponent(p)}/tokens/${encodeURIComponent(t)}`;
  return {
    async verify(productId, token): Promise<StoreCheck> {
      if (test && token.startsWith('test-')) return { state: 0, orderId: 'TEST.' + token };
      if (!sa) return { state: 1, orderId: '' };
      const r = await fetch(url(productId, token), { headers: { authorization: 'Bearer ' + await accessToken() } });
      if (r.status === 404 || r.status === 410) return { state: 1, orderId: '' };
      if (!r.ok) throw new Error('Google Play tidak menjawab (' + r.status + ').');
      const j = await r.json() as { purchaseState?: number; orderId?: string; consumptionState?: number };
      return { state: (j.purchaseState ?? 1) as 0 | 1 | 2, orderId: j.orderId ?? token.slice(0, 40), consumed: j.consumptionState === 1 };
    },
    async consume(productId, token) {
      if (!sa || token.startsWith('test-')) return;
      await fetch(url(productId, token) + ':consume', { method: 'POST', headers: { authorization: 'Bearer ' + await accessToken() } });
    },
  };
}

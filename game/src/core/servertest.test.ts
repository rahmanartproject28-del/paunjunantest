import { describe, it, expect } from 'vitest';
import { testServer } from './servertest';

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe('tes koneksi server', () => {
  it('terhubung: waktu jawab, jumlah spot, cuaca, pemain daring', async () => {
    let t = 1000;
    const f = async (u: string) => { t += 32; return u.endsWith('/health') ? res(200, { ok: true, online: 12 }) : res(200, { ok: true, world: { weather: 'cerah', spots: [1, 2, 3] } }); };
    const r = await testServer('https://api.contoh.id/', f, () => t);
    expect(r.ok).toBe(true); expect(r.ms).toBe(32);
    expect(r.text).toMatch(/^Terhubung ✓ · 32 ms · 3 spot · .+ · 12 daring$/);
  });
  it('gagal dengan pesan jelas', async () => {
    expect((await testServer('', async () => res(200, {}))).text).toMatch(/kosong/);
    expect((await testServer('api.contoh.id', async () => res(200, {}))).text).toMatch(/http/);
    expect((await testServer('https://x.id', async () => { throw new TypeError('fail'); })).text).toMatch(/tidak bisa dihubungi/);
    expect((await testServer('https://x.id', async () => res(502, null))).text).toMatch(/502/);
    expect((await testServer('https://x.id', async () => res(200, '<html>'))).text).toMatch(/bukan server/);
  });
});

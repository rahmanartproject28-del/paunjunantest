// Tes koneksi server untuk Pengaturan: "Terhubung ✓ · 32 ms · 3 spot · Cerah · 12 daring".
import { WEATHER, type WeatherId } from '@paunjunan/shared';

export interface ServerTest { ok: boolean; ms: number; text: string }

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** Ukur waktu jawab /health lalu ambil ringkasan dunia (/api/world). Tidak pernah melempar galat. */
export async function testServer(url: string, f: Fetch = (u, i) => fetch(u, i), clock: () => number = () => performance.now(), ms = 6000): Promise<ServerTest> {
  url = url.trim().replace(/\/$/, '');
  if (!url) return { ok: false, ms: 0, text: 'Alamat server kosong (mode lokal).' };
  if (!/^https?:\/\//.test(url)) return { ok: false, ms: 0, text: 'Alamat harus diawali http:// atau https://' };
  const get = async (path: string) => {
    const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), ms);
    try { return await f(url + path, { signal: ctl.signal }); } finally { clearTimeout(tm); }
  };
  let h: Awaited<ReturnType<Fetch>>;
  const t0 = clock();
  try { h = await get('/health'); } catch (e) {
    return { ok: false, ms: 0, text: (e as Error).name === 'AbortError' ? 'Server tidak menjawab (lebih dari ' + Math.round(ms / 1000) + ' dtk).' : 'Server tidak bisa dihubungi. Periksa alamat & jaringan.' };
  }
  const lat = Math.max(1, Math.round(clock() - t0));
  if (!h.ok) return { ok: false, ms: lat, text: 'Server menjawab galat ' + h.status + '.' };
  const hj = await h.json().catch(() => null) as { ok?: boolean; online?: number } | null;
  if (!hj || hj.ok !== true) return { ok: false, ms: lat, text: 'Itu bukan server PAUNJUNAN (jawaban tidak dikenal).' };
  const parts = ['Terhubung ✓', lat + ' ms'];
  try {
    const w = await get('/api/world');
    const wj = await w.json() as { world?: { spots?: unknown[]; weather?: WeatherId } };
    if (wj.world?.spots) parts.push(wj.world.spots.length + ' spot');
    if (wj.world?.weather && WEATHER[wj.world.weather]) parts.push(WEATHER[wj.world.weather].name);
  } catch { /* ringkasan dunia opsional */ }
  if (typeof hj.online === 'number') parts.push(hj.online + ' daring');
  return { ok: true, ms: lat, text: parts.join(' · ') };
}

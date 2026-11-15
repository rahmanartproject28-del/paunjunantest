// Penyimpanan perangkat yang aman: kalau localStorage diblokir, pakai memori saja.
const mem = new Map<string, string>();
export const store = {
  get<T>(k: string, d: T): T {
    try { const v = localStorage.getItem('pj_' + k); if (v != null) return JSON.parse(v) as T; } catch { const v = mem.get(k); if (v != null) return JSON.parse(v) as T; }
    return d;
  },
  set(k: string, v: unknown) {
    const s = JSON.stringify(v);
    try { localStorage.setItem('pj_' + k, s); } catch { mem.set(k, s); }
  },
};

import { describe, it, expect } from 'vitest';
import { quietAdvice, expectRate } from './advice';

const base = { loc: 'serene', zone: 'near' as const, sub: 'dekat' as const, dist: 8, weather: 'cerah' as const, empty: 1 };

describe('saran spot sepi', () => {
  it('spot lain lebih ramai menurut server → sarankan pindah, dengan tombol peta', () => {
    const a = quietAdvice({ ...base, spot: 'D3', player: { bait: { udang: 5 }, curBait: 'udang' }, activity: { D1: 'ramai', D2: 'sedang', D3: 'sepi' } });
    expect(a[0].act).toBe('map'); expect(a[0].spotTo).toBe('D1'); expect(a[0].text).toMatch(/ramai/);
  });
  it('umpan lain di tas jauh lebih cocok → sarankan ganti umpan', () => {
    // cumi = umpan laut; di danau udang jauh lebih disukai
    expect(expectRate('D1', 'near', '', 'udang', 'cerah')).toBeGreaterThan(expectRate('D1', 'near', '', 'cumi', 'cerah') * 1.25);
    const a = quietAdvice({ ...base, spot: 'D1', player: { bait: { cumi: 5, udang: 3 }, curBait: 'cumi' }, activity: { D1: 'ramai', D2: 'sepi', D3: 'sepi' } });
    const b = a.find(x => x.act === 'bait');
    expect(b?.baitTo).toBe('udang'); expect(b?.text).toMatch(/punya 3/);
  });
  it('tidak ada yang lebih baik → saran sabar/cuaca, selalu ada minimal satu saran', () => {
    const a = quietAdvice({ ...base, spot: 'D1', player: { bait: { racik: 5 }, curBait: 'racik' }, activity: { D1: 'ramai', D2: 'sepi', D3: 'sepi' } });
    expect(a.length).toBeGreaterThan(0); expect(a.length).toBeLessThanOrEqual(3);
  });
  it('spot di luar daftar (area bebas) tidak membuat galat', () => {
    const a = quietAdvice({ ...base, spot: 'darat', player: { bait: {}, curBait: 'udang' }, empty: 3 });
    expect(a.length).toBeGreaterThan(0);
  });
});

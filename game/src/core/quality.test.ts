import { describe, it, expect } from 'vitest';
import { FramePacer, DynRes } from './quality';

function run(hz: number, target: number, ms = 3000) {
  const p = new FramePacer(), times: number[] = [];
  for (let t = 0; t < ms; t += 1000 / hz) if (p.tick(t, target)) times.push(t);
  // setelah 1 dtk pertama (perkiraan kecepatan layar sudah stabil)
  const st = times.filter(t => t >= 1000), gaps = st.slice(1).map((t, i) => t - st[i]);
  return { fps: st.length / ((ms - 1000) / 1000), uneven: Math.max(...gaps) - Math.min(...gaps) };
}

describe('irama gambar selaras layar (anti patah-patah)', () => {
  it('30 FPS rata di layar 60, 90, 120 Hz', () => {
    for (const hz of [60, 90, 120]) {
      const r = run(hz, 30);
      expect(Math.abs(r.fps - 30)).toBeLessThan(2.5);
      expect(r.uneven).toBeLessThan(0.5); // jarak antar gambar sama persis
    }
  });
  it('20 FPS (menu / hemat baterai) juga rata', () => {
    const r = run(60, 20); expect(Math.abs(r.fps - 20)).toBeLessThan(2); expect(r.uneven).toBeLessThan(0.5);
  });
  it('force() menggambar pada kesempatan berikutnya', () => {
    const p = new FramePacer(); p.tick(0, 30); p.tick(16.7, 30); p.force(); expect(p.tick(33.3, 30)).toBe(true);
  });
});

describe('resolusi dinamis tenang (anti kedip)', () => {
  const feed = (d: DynRes, fps: number, secs: number, target = 30, hold = false) => { let ch = 0; for (let t = 0; t < secs; t += 1 / fps) if (d.tick(1 / fps, target, hold)) ch++; return ch; };
  it('tidak berubah bila FPS stabil di target', () => {
    const d = new DynRes(1.35); expect(feed(d, 30, 60)).toBe(0); expect(d.level).toBe(0);
  });
  it('turun satu jenjang setelah lambat ±4 dtk, tidak naik-turun tiap detik', () => {
    const d = new DynRes(1.35); expect(feed(d, 20, 5)).toBe(1); expect(d.level).toBe(1);
    expect(feed(d, 30, 15)).toBe(0); // belum boleh naik (butuh 20 dtk sejak perubahan)
    expect(feed(d, 30, 15)).toBe(1); expect(d.level).toBe(0);
  });
  it('tidak berubah saat adu tarik (hold) & jeda aplikasi tidak dianggap lambat', () => {
    const d = new DynRes(1.35); expect(feed(d, 15, 10, 30, true)).toBe(0);
    expect(d.tick(5, 30)).toBe(false);
  });
  it('naik lalu langsung lambat lagi → jeda naik berikutnya lebih lama', () => {
    const d = new DynRes(1.35);
    feed(d, 20, 5); feed(d, 30, 30);           // turun lalu naik
    expect(d.level).toBe(0);
    feed(d, 20, 5); expect(d.level).toBe(1);   // langsung lambat lagi
    expect(feed(d, 30, 30)).toBe(0);           // 30 dtk lancar belum cukup (jeda kini 40 dtk)
    expect(feed(d, 30, 15)).toBe(1);
  });
});

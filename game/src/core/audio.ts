// Suara buatan kode (tanpa file audio): gemercik air, kicau burung, reel, cipratan, senar tegang.
import { settings } from './quality';

let AC: AudioContext | null = null, master: GainNode, amb: GainNode, reelG: GainNode, creakG: GainNode;
let noiseBuf: AudioBuffer;

export function initAudio() {
  if (AC) { if (AC.state === 'suspended') AC.resume(); return; }
  try { AC = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)(); } catch { return; }
  master = AC.createGain(); master.gain.value = settings.sound ? 0.8 : 0; master.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 2, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); let b = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b = 0.97 * b + 0.03 * w; d[i] = b * 3.5 + w * 0.08; }
  // suasana: air beriak (derau pita rendah) yang pelan naik-turun
  amb = AC.createGain(); amb.gain.value = 0.12; amb.connect(master);
  const src = AC.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const lp = AC.createBiquadFilter(); lp.type = 'bandpass'; lp.frequency.value = 520; lp.Q.value = 0.6;
  const lfo = AC.createOscillator(), lg = AC.createGain(); lfo.frequency.value = 0.13; lg.gain.value = 0.05; lfo.connect(lg).connect(amb.gain); lfo.start();
  src.connect(lp).connect(amb); src.start();
  // bunyi reel (klik cepat) dan derit senar
  reelG = AC.createGain(); reelG.gain.value = 0; reelG.connect(master);
  const clk = AC.createOscillator(); clk.type = 'square'; clk.frequency.value = 38;
  const hp = AC.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2400;
  clk.connect(hp).connect(reelG); clk.start();
  creakG = AC.createGain(); creakG.gain.value = 0; creakG.connect(master);
  const cr = AC.createOscillator(); cr.type = 'sawtooth'; cr.frequency.value = 170;
  const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
  cr.connect(bp).connect(creakG); cr.start();
}
/** Akses konteks audio untuk soundscape (null sebelum pemain menyentuh layar). */
export function audioCore() { return AC ? { AC, master, noise: noiseBuf } : null; }

/** Aplikasi ditinggal: hentikan semua suara (iOS juga mewajibkan ini agar tidak terus memakai audio di latar). */
export function suspendAudio() { if (AC && AC.state === 'running') void AC.suspend().catch(() => {}); }
/** Aplikasi dibuka lagi: lanjutkan suara (hanya bila pemain sudah pernah menyentuh layar). */
export function resumeAudio() { if (AC && AC.state !== 'closed') void AC.resume().catch(() => {}); }
export function setMuted(m: boolean) { settings.sound = !m; settings.save(); if (master) master.gain.value = m ? 0 : 0.8; }

function scheduleBirds() {
  if (!AC) return;
  setTimeout(() => { chirp(); scheduleBirds(); }, 2500 + Math.random() * 6000);
}
function chirp() {
  if (!AC || !settings.sound) return;
  const t0 = AC.currentTime, n = 2 + Math.floor(Math.random() * 4), base = 2600 + Math.random() * 1800;
  for (let i = 0; i < n; i++) {
    const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * (0.09 + Math.random() * 0.05);
    o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), t + 0.05);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.08);
  }
}

function burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass') {
  if (!AC) return;
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), t = AC.currentTime;
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq;
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t, Math.random()); s.stop(t + dur);
}
export function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.1, slideTo?: number) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(freq, t); if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}

export const sfx = {
  whoosh() { burst(0.35, 1800, 0.25, 'bandpass'); },
  splash(big = 1) { burst(0.25 + big * 0.3, 900 + big * 400, 0.35 * big); setTimeout(() => burst(0.4, 500, 0.15 * big), 60); },
  plop() { tone(520, 0.14, 'sine', 0.12, 180); },
  nibble() { tone(300, 0.06, 'sine', 0.06, 220); },
  bite() { tone(180, 0.25, 'triangle', 0.18, 90); burst(0.2, 700, 0.2); },
  snap() { tone(1200, 0.08, 'square', 0.12, 300); burst(0.15, 3000, 0.2, 'highpass'); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.25, 'triangle', 0.1), i * 110)); },
  combo() { tone(880, 0.12, 'triangle', 0.08, 1320); },
  click() { tone(900, 0.03, 'square', 0.03); },
  /** detak jantung: dua dentum rendah (lub-dub); v 0..1 = keras */
  heart(v = 1) { tone(62, 0.16, 'sine', 0.22 * v, 40); setTimeout(() => tone(54, 0.2, 'sine', 0.16 * v, 36), 170); },
  /** gerak lambat: dengung turun + hembusan */
  slowmo() { tone(260, 0.9, 'sawtooth', 0.06, 70); tone(130, 1.1, 'sine', 0.12, 45); burst(0.9, 420, 0.12); },
};

export function setReel(speed: number) { if (reelG && AC) reelG.gain.setTargetAtTime(speed > 0 ? 0.03 * Math.min(1, speed) : 0, AC.currentTime, 0.05); }
export function setCreak(tension: number) { if (creakG && AC) creakG.gain.setTargetAtTime(tension > 0.6 ? Math.pow((tension - 0.6) / 0.4, 2) * 0.05 : 0, AC.currentTime, 0.08); }
export function setAmbient(v: number) { if (amb && AC) amb.gain.setTargetAtTime(v, AC.currentTime, 0.5); }

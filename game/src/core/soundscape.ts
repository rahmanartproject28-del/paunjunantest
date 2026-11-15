// Suasana suara per lokasi & waktu (semua disintesis, tanpa berkas audio):
// air/arus/ombak/angin, burung/camar, jangkrik & katak malam, hujan, dan musik latar generatif.
import { audioCore, setAmbient } from './audio';
import { settings } from './quality';
import { store } from './store';
import type { LocId } from '../world/layout';

type Core = NonNullable<ReturnType<typeof audioCore>>;
interface Layer { g: GainNode; target: number }

const SCALES: Record<LocId, number[]> = {
  serene: [196.0, 246.9, 293.7, 329.6, 392.0, 493.9, 587.3],  // G mayor lembut — luas & damai
  danau: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3],   // C pentatonik mayor — tenang
  sungai: [293.7, 329.6, 349.2, 440.0, 493.9, 587.3, 659.3],  // D dorian — petualangan
  pantai: [349.2, 392.0, 440.0, 523.3, 587.3, 698.5, 784.0],  // F cerah
  laut: [220.0, 261.6, 293.7, 329.6, 392.0, 440.0, 523.3],    // A minor pentatonik — luas
  kolam: [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3],   // C pentatonik — santai kampung
  gambut: [196.0, 233.1, 261.6, 293.7, 349.2, 392.0, 466.2],  // G minor — hutan rawa misterius
  bakau: [233.1, 261.6, 293.7, 349.2, 392.0, 466.2, 523.3],   // Bb mayor pentatonik — senja hangat
  laguna: [329.6, 370.0, 415.3, 493.9, 554.4, 659.3, 740.0],  // E mayor — cerah tropis
  pelabuhan: [220.0, 246.9, 261.6, 329.6, 392.0, 440.0, 493.9], // A minor — malam kota
};

export class Soundscape {
  private c: Core | null = null;
  private bus!: GainNode; private musicBus!: GainNode;
  private water!: Layer; private wind!: Layer; private rain!: Layer; private night!: Layer;
  private nextBird = 2; private nextWave = 1; private nextNote = 3; private nextPad = 6; private nextSlap = 4; private nextFrog = 3;
  private t = 0;
  ambVol = store.get<number>('ambVol', 1);
  musicVol = store.get<number>('musicVol', 0.5);

  constructor(private loc: LocId) {}

  private start(c: Core) {
    this.c = c; const { AC, master } = c;
    this.bus = AC.createGain(); this.bus.gain.value = this.ambVol; this.bus.connect(master);
    this.musicBus = AC.createGain(); this.musicBus.gain.value = this.musicVol * 0.5; this.musicBus.connect(master);
    const noiseLayer = (type: BiquadFilterType, f: number, q: number, extra?: (src: AudioNode) => AudioNode): Layer => {
      const src = AC.createBufferSource(); src.buffer = c.noise; src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const flt = AC.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q;
      const g = AC.createGain(); g.gain.value = 0;
      src.connect(flt); (extra ? extra(flt) : flt).connect(g).connect(this.bus); src.start(0, Math.random() * 1.5);
      return { g, target: 0 };
    };
    // air: danau memakai lapisan lama di audio.ts; lokasi lain punya lapisan sendiri
    this.water = this.loc === 'sungai' ? noiseLayer('bandpass', 750, 0.35) : this.loc === 'laut' ? noiseLayer('lowpass', 420, 0.5) : noiseLayer('lowpass', 650, 0.4);
    this.wind = noiseLayer('bandpass', this.loc === 'laut' ? 380 : 260, 0.7);
    this.rain = noiseLayer('highpass', 2600, 0.3);
    // jangkrik: nada tinggi yang dimodulasi denyut cepat, tiga ekor dengan fase berbeda
    const ng = AC.createGain(); ng.gain.value = 0; ng.connect(this.bus); this.night = { g: ng, target: 0 };
    [4300, 4620, 4950].forEach((f, i) => {
      const o = AC.createOscillator(); o.frequency.value = f;
      const am = AC.createGain(); am.gain.value = 0;
      const pulse = AC.createOscillator(); pulse.type = 'square'; pulse.frequency.value = 28 + i * 3;
      const pg = AC.createGain(); pg.gain.value = 0.5; pulse.connect(pg).connect(am.gain);
      const chirp = AC.createOscillator(); chirp.frequency.value = 0.6 + i * 0.17; const cg = AC.createGain(); cg.gain.value = 0.5; chirp.connect(cg).connect(am.gain);
      const v = AC.createGain(); v.gain.value = 0.012; o.connect(am).connect(v).connect(ng);
      o.start(); pulse.start(); chirp.start();
    });
  }

  private ramp(l: Layer, v: number, tc = 1.2) { if (this.c && Math.abs(l.target - v) > 0.002) { l.target = v; l.g.gain.setTargetAtTime(v, this.c.AC.currentTime, tc); } }
  setAmb(v: number) { this.ambVol = v; store.set('ambVol', v); if (this.c) this.bus.gain.setTargetAtTime(v, this.c.AC.currentTime, 0.3); }
  setMusic(v: number) { this.musicVol = v; store.set('musicVol', v); if (this.c) this.musicBus.gain.setTargetAtTime(v * 0.5, this.c.AC.currentTime, 0.3); }

  update(dt: number, s: { night: number; rain: number; fighting: boolean }) {
    if (!this.c) { const c = audioCore(); if (!c) return; this.start(c); }
    if (!settings.sound) return;
    this.t += dt; const day = 1 - s.night;
    // lapisan menerus
    setAmbient(this.loc === 'danau' || this.loc === 'serene' || this.loc === 'kolam' || this.loc === 'gambut' ? 0.12 : 0);
    this.ramp(this.water, this.loc === 'sungai' ? 0.34 : this.loc === 'laut' ? 0.16 : this.loc === 'pantai' || this.loc === 'laguna' ? 0.05 : this.loc === 'pelabuhan' ? 0.1 : this.loc === 'bakau' ? 0.04 : 0);
    this.ramp(this.wind, this.loc === 'laut' ? 0.1 + 0.06 * Math.sin(this.t * 0.21) + 0.04 * Math.sin(this.t * 0.53) : 0.02 + 0.015 * Math.sin(this.t * 0.17));
    this.ramp(this.rain, s.rain * 0.22);
    this.ramp(this.night, this.loc === 'laut' ? 0 : Math.max(0, s.night - 0.35) * 1.4 * (1 - s.rain * 0.7));
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.5 * (s.fighting ? 0.35 : 1) * (1 - s.night * 0.35), this.c!.AC.currentTime, 0.8);
    // kejadian sesekali
    if ((this.nextBird -= dt) < 0) {
      const sea = this.loc === 'pantai' || this.loc === 'laut' || this.loc === 'laguna' || this.loc === 'pelabuhan' || this.loc === 'bakau';
      this.nextBird = (sea ? 5 : 2.5) + Math.random() * (sea ? 9 : 6) + s.night * 10;
      if (s.rain < 0.5) { if (sea && day > 0.3) this.gull(); else if (day > 0.4) { if ((this.loc === 'sungai' || this.loc === 'gambut') && Math.random() < 0.35) this.forestCall(); else this.chirp(); } }
    }
    if ((this.loc === 'pantai' || this.loc === 'laguna') && (this.nextWave -= dt) < 0) { this.nextWave = 5.5 + Math.random() * 4; this.wave(); }
    if ((this.loc === 'laut' || this.loc === 'pelabuhan') && (this.nextSlap -= dt) < 0) { this.nextSlap = 1.8 + Math.random() * 3.5; this.slap(); }
    if ((this.loc === 'danau' || this.loc === 'serene' || this.loc === 'sungai') && s.night > 0.5 && (this.nextFrog -= dt) < 0) { this.nextFrog = 1.5 + Math.random() * 4; this.frog(); }
    if (this.musicVol > 0.01) {
      if ((this.nextNote -= dt) < 0) { this.nextNote = (1.1 + Math.random() * 2.2) * (1 + s.night * 0.8); this.note(); }
      if ((this.nextPad -= dt) < 0) { this.nextPad = 9 + Math.random() * 8; this.pad(); }
    }
  }

  // ---------- bunyi-bunyi ----------
  private env(g: GainNode, t: number, peak: number, a: number, d: number) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
  private chirp() {
    const { AC } = this.c!, t0 = AC.currentTime, n = 2 + Math.floor(Math.random() * 4), base = 2500 + Math.random() * 2000;
    for (let i = 0; i < n; i++) { const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * (0.08 + Math.random() * 0.06);
      o.frequency.setValueAtTime(base, t); o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.45), t + 0.05);
      this.env(g, t, 0.022, 0.01, 0.06); o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.09); }
  }
  /** seruan burung hutan (rendah, dua suku kata) */
  private forestCall() {
    const { AC } = this.c!, t0 = AC.currentTime, f = 520 + Math.random() * 300;
    for (let i = 0; i < 2; i++) { const o = AC.createOscillator(), g = AC.createGain(), t = t0 + i * 0.28; o.type = 'triangle';
      o.frequency.setValueAtTime(f * (i ? 0.8 : 1), t); o.frequency.exponentialRampToValueAtTime(f * (i ? 0.7 : 1.15), t + 0.18);
      this.env(g, t, 0.03, 0.02, 0.2); o.connect(g).connect(this.bus); o.start(t); o.stop(t + 0.25); }
  }
  /** camar: sawtooth meluncur turun, disaring */
  private gull() {
    const { AC } = this.c!, t0 = AC.currentTime, n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(), t = t0 + i * 0.34;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(1500 + Math.random() * 300, t); o.frequency.exponentialRampToValueAtTime(820, t + 0.28);
      f.type = 'bandpass'; f.frequency.value = 1700; f.Q.value = 2.5; this.env(g, t, 0.028, 0.03, 0.26);
      o.connect(f).connect(g).connect(this.bus); o.start(t); o.stop(t + 0.32); }
  }
  /** ombak: gelombang naik 2 dtk lalu pecah & surut */
  private wave() {
    const { AC, noise } = this.c!, t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noise; src.loop = true; f.type = 'lowpass'; f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1800, t + 2.1); f.frequency.exponentialRampToValueAtTime(400, t + 6);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 2.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 6.2);
    src.connect(f).connect(g).connect(this.bus); src.start(t, Math.random()); src.stop(t + 6.4);
  }
  /** hempasan air ke lambung kapal */
  private slap() {
    const { AC, noise } = this.c!, t = AC.currentTime, src = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
    src.buffer = noise; f.type = 'lowpass'; f.frequency.value = 260 + Math.random() * 200; this.env(g, t, 0.25, 0.02, 0.35);
    src.connect(f).connect(g).connect(this.bus); src.start(t, Math.random()); src.stop(t + 0.45);
  }
  /** katak: "krok" rendah beberapa kali */
  private frog() {
    const { AC } = this.c!, t0 = AC.currentTime, n = 2 + Math.floor(Math.random() * 3), f0 = 140 + Math.random() * 90;
    for (let i = 0; i < n; i++) { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(), t = t0 + i * 0.16; o.type = 'square';
      o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f0 * 0.8, t + 0.09); f.type = 'lowpass'; f.frequency.value = 700;
      this.env(g, t, 0.03, 0.01, 0.09); o.connect(f).connect(g).connect(this.bus); o.start(t); o.stop(t + 0.12); }
  }
  /** musik: petikan lembut dari tangga nada lokasi */
  private note() {
    const { AC } = this.c!, t = AC.currentTime, sc = SCALES[this.loc], f = sc[Math.floor(Math.random() * sc.length)] * (Math.random() < 0.25 ? 0.5 : 1);
    const o = AC.createOscillator(), o2 = AC.createOscillator(), lp = AC.createBiquadFilter(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.001;
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(500, t + 1.2);
    this.env(g, t, 0.05, 0.008, 1.8); const g2 = AC.createGain(); g2.gain.value = 0.25;
    o.connect(lp); o2.connect(g2).connect(lp); lp.connect(g).connect(this.musicBus); o.start(t); o2.start(t); o.stop(t + 2); o2.stop(t + 2);
  }
  /** musik: akor latar pelan (dua nada, naik 3 dtk, turun 5 dtk) */
  private pad() {
    const { AC } = this.c!, t = AC.currentTime, sc = SCALES[this.loc], r = Math.floor(Math.random() * 3);
    for (const k of [r, r + 2, r + 4]) { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = sc[k % sc.length] * 0.5; o.detune.value = (Math.random() - 0.5) * 8;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.018, t + 3); g.gain.exponentialRampToValueAtTime(0.0001, t + 8.5);
      o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 9); }
  }
}

// Panduan interaktif langkah demi langkah untuk pemain baru. Tiap langkah selesai sendiri
// ketika pemain melakukan hal yang diminta (dipantau dari mode memancing / berjalan).
import { $ } from './hud';
import { store } from '../core/store';
import type { Fishing } from '../game/fishing';

interface Step { text: string; done: (f: Fishing, c: CoachCtx) => boolean; when?: (f: Fishing) => boolean }
export interface CoachCtx { zoomed: boolean; walked: boolean; aimed: boolean }

const STEPS: Step[] = [
  { text: 'Tahan tombol bulat besar (Lempar) di kanan bawah untuk mengisi tenaga lemparan.', when: f => f.mode === 'ready' || f.mode === 'charging', done: f => f.mode === 'charging' },
  { text: 'Geser layar ke kiri/kanan untuk membidik, lalu lepas tombol untuk melempar.', when: f => f.mode === 'charging' || f.mode === 'ready', done: f => ['casting', 'flying', 'settling', 'waiting'].includes(f.mode) },
  { text: 'Tunggu pelampung. Getaran kecil = ikan mencicipi. Jangan sentak dulu!', when: f => ['settling', 'waiting', 'flying'].includes(f.mode), done: f => f.mode === 'fight' || (f.mode === 'waiting' && f.isBitten) },
  { text: 'Pelampung tenggelam! Ketuk TARIK sekarang.', when: f => f.mode === 'waiting' && f.isBitten, done: f => f.mode === 'fight' || f.mode === 'retrieving' },
  { text: 'Tahan tombol Gulung untuk menarik. Jaga jarum di zona EMAS. Lepas saat jarum masuk MERAH.', when: f => f.mode === 'fight', done: f => f.mode === 'landing' || f.mode === 'trophy' || f.mode === 'retrieving' },
  { text: 'Hebat! Sentuh joystick kiri (atau tombol 🚶) untuk berdiri dan menjelajah danau.', when: f => f.mode === 'ready', done: (_f, c) => c.walked },
  { text: 'Gerakkan joystick kiri untuk berjalan. Ketuk tombol kecepatan untuk jalan cepat atau lari.', when: f => f.mode === 'walk', done: f => f.mode !== 'walk' },
  { text: 'Cubit layar (atau putar roda mouse) untuk memperbesar dan memperkecil.', done: (_f, c) => c.zoomed },
];

export class Coach {
  i = store.get<number>('coachStep', 0);
  ctx: CoachCtx = { zoomed: false, walked: false, aimed: false };
  private shown = -1;
  constructor() {
    $('coachSkip').onclick = () => this.finish();
  }
  get active() { return this.i < STEPS.length; }
  restart() { this.i = 0; store.set('coachStep', 0); this.shown = -1; this.ctx = { zoomed: false, walked: false, aimed: false }; }
  finish() { this.i = STEPS.length; store.set('coachStep', this.i); $('coach').hidden = true; }
  tick(f: Fishing, hudVisible: boolean) {
    const box = $('coach');
    if (!this.active || !hudVisible) { box.hidden = true; return; }
    const st = STEPS[this.i];
    if (st.done(f, this.ctx)) { this.i++; store.set('coachStep', this.i); this.shown = -1; if (!this.active) { box.hidden = true; return; } }
    const cur = STEPS[this.i];
    const vis = !cur.when || cur.when(f);
    box.hidden = !vis;
    if (vis && this.shown !== this.i) {
      this.shown = this.i;
      $('coachTxt').textContent = cur.text; $('coachNum').textContent = `Panduan ${this.i + 1}/${STEPS.length}`;
      box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop');
    }
  }
}

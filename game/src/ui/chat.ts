// Obrolan global: layar pesan, lencana pesan baru, batas kirim, lapor pesan.
// Mode server: lewat WebSocket (server menyaring & menyiarkan). Mode lokal: pesan pemain lain disimulasikan.
import { cleanChat } from '@paunjunan/shared';
import { $, esc, toast, openSheet } from './hud';
import { store } from '../core/store';

export interface ChatMsg { id: string; name: string; text: string; at: number; sys?: boolean; me?: boolean; ch?: 'global' | 'klub' }

const SIM_NAMES = ['RakaFishing', 'RajaNila', 'MasGabus', 'SiPatin', 'Joran77', 'UdinKeramba', 'Andi.Pancing'];
const SIM_LINES = [
  'ada yang mancing di danau serene?', 'Airnya jernih banget, ikannya kelihatan', 'Barusan dapat mas dekat pondok panggung', 'Sore nanti mancing bareng di dermaga yuk',
  'Pagi semua, B3 lagi ramai nih', 'Ada yang dapat toman hari ini?', 'Pakai umpan racik di sela keramba, mantap',
  'Barusan senar putus, ikannya besar banget', 'Tepi rumput enak buat gabus', 'Mujair terus dari tadi haha',
  'Jangan gulung waktu ikan lompat ya', 'Joran Predator worth it gak?', 'Hujan gini ikan malah aktif',
  'Selamat sore pemancing!', 'Ada yang mau mabar di dermaga?', 'Rekor saya patin 4 kilo',
];

const CLUB_LINES = ['Ayo kejar target kg minggu ini!', 'Saya lagi di B3, toman aktif', 'Siapa yang sudah ambil hadiah klub?', 'Nanti malam kumpul di dermaga ya', 'Tambah 5 kg lagi target tercapai'];

export class Chat {
  msgs: ChatMsg[] = [];
  unread = 0;
  open = false;
  private lastSend = 0; private lastText = '';
  private simT = 12;
  /** dipanggil untuk benar-benar mengirim (mode server). null = mode lokal */
  sender: ((text: string, ch: 'global' | 'klub') => void) | null = null;
  tab: 'global' | 'klub' = 'global';
  /** nama klub pemain (null = belum masuk klub) */
  club: () => string | null = () => null;
  myName = 'Saya';
  /** dipanggil tiap pesan baru (baris obrolan di HUD) */
  onNew: ((m: ChatMsg) => void) | null = null;

  constructor() { this.msgs = store.get<ChatMsg[]>('chatLog', []).slice(-40); }

  push(m: ChatMsg) {
    this.msgs.push(m);
    if (this.msgs.length > 80) this.msgs.splice(0, this.msgs.length - 80);
    store.set('chatLog', this.msgs.slice(-40));
    this.onNew?.(m);
    if (!this.open && !m.me) { this.unread++; this.badge(); }
    if (this.open) this.renderList();
  }
  system(text: string) { this.push({ id: 'sys', name: 'PAUNJUNAN', text, at: Date.now(), sys: true }); }

  send(raw: string) {
    const text = cleanChat(raw);
    if (!text) return false;
    const now = Date.now();
    if (now - this.lastSend < 2500) { toast('Tunggu sebentar sebelum mengirim lagi.'); return false; }
    if (text === this.lastText) { toast('Pesan yang sama sudah terkirim.'); return false; }
    this.lastSend = now; this.lastText = text;
    if (this.tab === 'klub' && !this.club()) { toast('Masuk klub dulu untuk memakai obrolan klub.'); return false; }
    if (this.sender) this.sender(text, this.tab); // server akan menyiarkan balik ke kita
    else this.push({ id: 'me', name: this.myName, text, at: now, me: true, ch: this.tab });
    return true;
  }

  /** Mode lokal: pesan simulasi sesekali, supaya obrolan terasa hidup. */
  tick(dt: number) {
    if (this.sender) return;
    this.simT -= dt;
    if (this.simT > 0) return;
    this.simT = 25 + Math.random() * 45;
    const n = SIM_NAMES[Math.floor(Math.random() * SIM_NAMES.length)], klub = !!this.club() && Math.random() < 0.35;
    this.push({ id: 'sim-' + n, name: n, text: klub ? CLUB_LINES[Math.floor(Math.random() * CLUB_LINES.length)] : SIM_LINES[Math.floor(Math.random() * SIM_LINES.length)], at: Date.now(), ch: klub ? 'klub' : 'global' });
  }

  badge() { const b = $('chatBadge'); b.hidden = this.unread === 0; b.textContent = this.unread > 9 ? '9+' : String(this.unread); }

  private renderList() {
    const box = document.getElementById('chatList'); if (!box) return;
    const list = this.msgs.filter(m => m.sys || (m.ch ?? 'global') === this.tab);
    const t = (at: number) => { const d = new Date(at); return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0'); };
    box.innerHTML = list.length ? list.map((m) => m.sys
      ? `<div class="cm sys">${esc(m.text)}</div>`
      : `<div class="cm ${m.me ? 'me' : ''}"><b>${esc(m.name)}</b> <small>${t(m.at)}</small>${m.me ? '' : `<button class="rep" data-rep="${this.msgs.indexOf(m)}" aria-label="Laporkan">⚑</button>`}<div>${esc(m.text)}</div></div>`).join('')
      : `<p style="color:var(--dim)">${this.tab === 'klub' ? (this.club() ? 'Belum ada pesan klub.' : 'Anda belum masuk klub. Buka 🎪 → Klub.') : 'Belum ada pesan. Sapa pemancing lain!'}</p>`;
    box.scrollTop = box.scrollHeight;
    box.querySelectorAll<HTMLElement>('[data-rep]').forEach(b => b.onclick = () => {
      const m = this.msgs[Number(b.dataset.rep)];
      const reps = store.get<{ name: string; text: string; at: number }[]>('reports', []);
      reps.push({ name: m.name, text: m.text, at: Date.now() }); store.set('reports', reps.slice(-50));
      toast('Pesan dilaporkan ke admin. Terima kasih.');
    });
  }

  show() {
    this.open = true; this.unread = 0; this.badge();
    openSheet('💬 Obrolan', `<div class="tabs"><button data-ct="global" class="${this.tab === 'global' ? 'on' : ''}">Global</button><button data-ct="klub" class="${this.tab === 'klub' ? 'on' : ''}">Klub${this.club() ? ' · ' + esc(this.club()!) : ''}</button></div><div id="chatList" class="chatList"></div>
      <div class="row chatIn"><input id="chatTxt" maxlength="160" placeholder="Tulis pesan…" autocomplete="off"><button class="btn gold" id="chatSend" style="flex:0 0 auto">Kirim</button></div>
      <p style="color:var(--dim);font-size:11px;margin:6px 0 0">Kata kasar disensor. Tautan dan nomor telepon dihapus otomatis. Maks. 160 huruf.</p>`, body => {
      const inp = body.querySelector('#chatTxt') as HTMLInputElement;
      const go = () => { if (this.send(inp.value)) inp.value = ''; inp.focus(); };
      body.querySelector<HTMLElement>('#chatSend')!.onclick = go;
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') go(); });
      inp.addEventListener('keyup', e => e.stopPropagation());
      body.querySelectorAll<HTMLElement>('[data-ct]').forEach(b => b.onclick = () => { this.tab = b.dataset.ct as 'global'; body.querySelectorAll('[data-ct]').forEach(x => x.classList.toggle('on', x === b)); this.renderList(); });
      this.renderList();
    }, () => { this.open = false; });
  }
}

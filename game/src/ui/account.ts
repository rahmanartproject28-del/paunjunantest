// Layar akun (mode server): masuk, daftar, masuk cepat PIN, ganti sandi, keluar, hapus akun.
import type { Player } from '@paunjunan/shared';
import type { RemoteBackend } from '../core/backend';
import { openSheet, closeSheet, toast, esc } from './hud';

type Done = (p: Player | null) => void;
const field = (id: string, label: string, type = 'text', extra = '') =>
  `<label class="field"><span>${label}</span><input id="${id}" type="${type}" ${extra} autocomplete="off"></label>`;
const pwField = (id: string, label: string) =>
  `<label class="field"><span>${label}</span><div class="row"><input id="${id}" type="password" autocomplete="off" style="flex:1"><button type="button" class="btn" data-eye="${id}" style="flex:0 0 auto;padding:8px 10px">👁️</button></div></label>`;
function bindEyes(body: HTMLElement) {
  body.querySelectorAll<HTMLElement>('[data-eye]').forEach(b => b.onclick = () => { const i = body.querySelector('#' + b.dataset.eye) as HTMLInputElement; i.type = i.type === 'password' ? 'text' : 'password'; });
  body.querySelectorAll('input').forEach(i => { i.addEventListener('keydown', e => e.stopPropagation()); i.addEventListener('keyup', e => e.stopPropagation()); });
}
const val = (b: HTMLElement, id: string) => (b.querySelector('#' + id) as HTMLInputElement).value;
async function busy(btn: HTMLButtonElement, fn: () => Promise<void>) {
  const t = btn.textContent; btn.disabled = true; btn.textContent = 'Menunggu…';
  try { await fn(); } catch (e) { toast((e as Error).message, 4000); } finally { btn.disabled = false; btn.textContent = t; }
}

export function openSignIn(be: RemoteBackend, done: Done) {
  openSheet('Masuk', `<div class="list">${field('siLogin', 'Nama pengguna atau email')}${pwField('siPw', 'Kata sandi')}
    <button class="btn gold big" id="siGo">Masuk</button>
    <button class="btn ghost" id="siReg">Belum punya akun? Daftar</button>
    <button class="btn ghost" id="siForgot">Lupa kata sandi?</button></div>`, body => {
    bindEyes(body);
    body.querySelector<HTMLElement>('#siForgot')!.onclick = () => openForgot(be, done, val(body, 'siLogin'));
    body.querySelector<HTMLElement>('#siReg')!.onclick = () => openSignUp(be, done);
    const go = body.querySelector('#siGo') as HTMLButtonElement;
    go.onclick = () => busy(go, async () => { const p = await be.signIn(val(body, 'siLogin'), val(body, 'siPw')); closeSheet(); toast('Selamat datang kembali, ' + p.name + '!'); done(p); });
  });
}

/** Lupa sandi: minta kode ke email, lalu isi kode + sandi baru. */
export function openForgot(be: RemoteBackend, done: Done, login0 = '') {
  openSheet('Lupa kata sandi', `<div class="list">${field('fgLogin', 'Nama pengguna atau email')}
    <button class="btn gold" id="fgSend">Kirim kode ke email</button>
    <div id="fgStep2" hidden><p style="font-size:13px">Cek email Anda (juga folder spam). Kode berlaku 30 menit.</p>
      ${field('fgCode', 'Kode 6 angka', 'text', 'inputmode="numeric" maxlength="6"')}${pwField('fgPw', 'Kata sandi baru (min. 8, huruf + angka)')}
      <button class="btn gold big" id="fgGo" style="width:100%">Simpan sandi baru</button></div></div>`, body => {
    bindEyes(body); (body.querySelector('#fgLogin') as HTMLInputElement).value = login0;
    const send = body.querySelector('#fgSend') as HTMLButtonElement;
    send.onclick = () => busy(send, async () => { await be.forgot(val(body, 'fgLogin')); (body.querySelector('#fgStep2') as HTMLElement).hidden = false; toast('Bila akun terdaftar, kode sudah dikirim ke emailnya.', 4000); });
    const go = body.querySelector('#fgGo') as HTMLButtonElement;
    go.onclick = () => busy(go, async () => { const p = await be.resetPassword(val(body, 'fgLogin'), val(body, 'fgCode'), val(body, 'fgPw')); closeSheet(); toast('Sandi diganti. Selamat datang, ' + p.name + '!'); done(p); });
  });
}

export function openSignUp(be: RemoteBackend, done: Done) {
  openSheet('Daftar akun baru', `<div class="list">
    ${field('suUser', 'Nama pengguna (3–18 huruf kecil/angka)', 'text', 'maxlength="18"')}${field('suMail', 'Email', 'email')}
    ${pwField('suPw', 'Kata sandi (min. 8, huruf + angka)')}${pwField('suPw2', 'Ulangi kata sandi')}
    ${field('suPin', 'PIN 6 angka (untuk masuk cepat)', 'password', 'inputmode="numeric" maxlength="6"')}${field('suPin2', 'Ulangi PIN', 'password', 'inputmode="numeric" maxlength="6"')}
    <label style="display:flex;gap:8px;font-size:12px;color:var(--dim);align-items:flex-start"><input type="checkbox" id="suOk" style="margin-top:2px"> Saya setuju dengan aturan main dan kebijakan privasi PAUNJUNAN.</label>
    <button class="btn gold big" id="suGo">Daftar</button>
    <p style="color:var(--dim);font-size:12px;margin:0">Kalau Anda sedang main sebagai tamu, koin, perlengkapan, dan tangkapan Anda ikut dipindah ke akun baru.</p></div>`, body => {
    bindEyes(body);
    const go = body.querySelector('#suGo') as HTMLButtonElement;
    go.onclick = () => busy(go, async () => {
      if (val(body, 'suPw') !== val(body, 'suPw2')) throw new Error('Kata sandi tidak sama.');
      if (val(body, 'suPin') !== val(body, 'suPin2')) throw new Error('PIN tidak sama.');
      if (!(body.querySelector('#suOk') as HTMLInputElement).checked) throw new Error('Centang persetujuan dulu.');
      const p = await be.register({ username: val(body, 'suUser'), email: val(body, 'suMail'), password: val(body, 'suPw'), pin: val(body, 'suPin') });
      closeSheet(); toast('Akun dibuat. Selamat datang, ' + p.name + '!'); done(p);
    });
  });
}

/** Papan angka PIN (perangkat yang pernah dipakai masuk). */
export function openPin(be: RemoteBackend, done: Done) {
  let pin = '';
  openSheet('Masuk cepat · ' + esc(be.username || 'akun Anda'), `<div class="pinBox"><div class="pinDots" id="pinDots"></div>
    <div class="pinPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div>
    <button class="btn ghost" id="pinPw">Masuk dengan kata sandi</button></div>`, body => {
    const dots = body.querySelector('#pinDots')!;
    const draw = () => { dots.innerHTML = [0, 1, 2, 3, 4, 5].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
    draw();
    body.querySelector<HTMLElement>('#pinPw')!.onclick = () => openSignIn(be, done);
    body.querySelectorAll<HTMLElement>('[data-k]').forEach(b => b.onclick = async () => {
      const k = b.dataset.k!;
      if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 6) pin += k;
      draw();
      if (pin.length === 6) {
        try { const p = await be.pinLogin(pin); closeSheet(); toast('Selamat datang, ' + p.name + '!'); done(p); }
        catch (e) { toast((e as Error).message, 3500); pin = ''; draw(); if (!be.device || /kata sandi/.test((e as Error).message)) openSignIn(be, done); }
      }
    });
  });
}

export function openAccount(be: RemoteBackend, onOut: () => void) {
  const guest = !be.username;
  openSheet('Akun', `<div class="list">
    <div class="item"><span class="icn">👤</span><div><b>${guest ? 'Tamu' : esc(be.username)}</b><small>${guest ? 'Progres tamu hanya ada di perangkat ini. Daftar supaya aman.' : 'Akun terdaftar'}</small></div><span></span></div>
    ${guest ? '<button class="btn gold" id="acReg">Daftar & simpan progres</button><button class="btn" id="acIn">Masuk ke akun lain</button>' : `
      <button class="btn" id="acPw">Ganti kata sandi</button>
      <button class="btn" id="acOut">Keluar</button>`}
    <button class="btn ghost" id="acDel" style="color:var(--coral)">Hapus akun & semua data</button></div>`, body => {
    body.querySelector<HTMLElement>('#acReg')?.addEventListener('click', () => openSignUp(be, () => onOut()));
    body.querySelector<HTMLElement>('#acIn')?.addEventListener('click', () => openSignIn(be, () => onOut()));
    body.querySelector<HTMLElement>('#acOut')?.addEventListener('click', async () => { await be.signOut(); closeSheet(); toast('Anda sudah keluar.'); onOut(); });
    body.querySelector<HTMLElement>('#acPw')?.addEventListener('click', () => openSheet('Ganti kata sandi', `<div class="list">${pwField('cpOld', 'Kata sandi lama')}${pwField('cpNew', 'Kata sandi baru')}<button class="btn gold" id="cpGo">Simpan</button></div>`, b2 => {
      bindEyes(b2); const go = b2.querySelector('#cpGo') as HTMLButtonElement;
      go.onclick = () => busy(go, async () => { await be.changePassword(val(b2, 'cpOld'), val(b2, 'cpNew')); closeSheet(); toast('Kata sandi diganti. Perangkat lain otomatis keluar.'); });
    }));
    body.querySelector<HTMLElement>('#acDel')!.onclick = () => openSheet('Hapus akun', `<p>Semua data (koin, perlengkapan, tangkapan, peringkat) akan <b>dihapus permanen</b> dan tidak bisa dikembalikan.</p>
      <div class="list">${guest ? '' : pwField('dlPw', 'Kata sandi untuk konfirmasi')}${field('dlTxt', 'Ketik HAPUS untuk konfirmasi')}<button class="btn" id="dlGo" style="background:var(--red)">Hapus permanen</button></div>`, b2 => {
      bindEyes(b2); const go = b2.querySelector('#dlGo') as HTMLButtonElement;
      go.onclick = () => busy(go, async () => {
        if (val(b2, 'dlTxt').trim().toUpperCase() !== 'HAPUS') throw new Error('Ketik HAPUS untuk konfirmasi.');
        await be.deleteAccount(guest ? undefined : val(b2, 'dlPw')); closeSheet(); toast('Akun dan data sudah dihapus.'); onOut();
      });
    });
  });
}

// Alat bantu antarmuka: notifikasi, spanduk, kilatan, lembar menu, format angka.
export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export const fmtKg = (w: number) => (w < 1 ? Math.round(w * 1000) + ' g' : w.toFixed(2).replace('.', ',') + ' kg');
export const fmtNum = (n: number, d = 0) => n.toFixed(d).replace('.', ',');

export function toast(msg: string, ms = 2600) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  const box = $('toasts'); box.appendChild(t);
  while (box.children.length > 3) box.firstChild!.remove();
  setTimeout(() => t.remove(), ms);
}

export function banner(text: string, color = '#fff') {
  const b = $('banner'); b.textContent = text; b.style.color = color; b.hidden = false;
  b.classList.remove('go'); void b.offsetWidth; b.classList.add('go');
  clearTimeout((banner as unknown as { t: number }).t);
  (banner as unknown as { t: number }).t = window.setTimeout(() => { b.hidden = true; }, 1700);
}

export function caption(text: string, ms = 1600) {
  const c = $('caption'); c.textContent = text; c.hidden = false;
  clearTimeout((caption as unknown as { t: number }).t);
  (caption as unknown as { t: number }).t = window.setTimeout(() => { c.hidden = true; }, ms);
}

export function flash(strength = 0.5) {
  const f = $('flash'); f.style.transition = 'none'; f.style.opacity = String(strength);
  requestAnimationFrame(() => { f.style.transition = 'opacity .5s'; f.style.opacity = '0'; });
}

let sheetClose: (() => void) | null = null;
export function openSheet(title: string, html: string, bind?: (body: HTMLElement) => void, onClose?: () => void) {
  const prev = sheetClose; sheetClose = null; prev?.();
  sheetClose = onClose ?? null;
  $('sheetTitle').textContent = title;
  const body = $('sheetBody'); body.innerHTML = html;
  $('sheet').hidden = false;
  bind?.(body);
}
export function closeSheet() { $('sheet').hidden = true; const f = sheetClose; sheetClose = null; f?.(); }
export const sheetOpen = () => !$('sheet').hidden;

export const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

export function partOfDay(h: number) { return h < 4 ? 'Malam' : h < 10 ? 'Pagi' : h < 15 ? 'Siang' : h < 18.5 ? 'Sore' : 'Malam'; }

/** Konfeti ringan (DOM + CSS), dipakai untuk rekor, ikan monster, hadiah. */
export function confetti(n = 70) {
  const box = document.createElement('div'); box.className = 'confetti';
  const cols = ['#f2b53a', '#ff9a3c', '#ef6a4c', '#7ec8ff', '#ffd873', '#ffffff'];
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 0.4}s;animation-duration:${1.6 + Math.random() * 1.4}s;--dx:${(Math.random() - 0.5) * 160}px;--r:${Math.random() * 720}deg`;
    box.appendChild(p);
  }
  document.body.appendChild(box); setTimeout(() => box.remove(), 3400);
}

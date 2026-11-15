// Membuat ikon aplikasi Android (adaptif + lama), layar pembuka, dan gambar Play Store dari SVG di bawah.
// Pakai: node tools/make-app-icons.mjs   (butuh playwright + Chromium)
// Hasil: game/android/app/src/main/res/** dan game/store-assets/*.png
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RES = path.join(ROOT, 'game/android/app/src/main/res');
const STORE = path.join(ROOT, 'game/store-assets');
const BG = '#0b1d1a';

// Lapisan belakang: gradasi emas-jingga khas PAUNJUNAN dengan kilau & riak air di bawah
const back = (r = 0) => `
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".45" stop-color="#f5b335"/><stop offset="1" stop-color="#ec6f1c"/></linearGradient>
    <radialGradient id="sh" cx=".3" cy=".22" r=".7"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0f6f73"/><stop offset="1" stop-color="#083c45"/></linearGradient>
  </defs>
  <rect width="108" height="108" rx="${r}" fill="url(#g)"/>
  <rect width="108" height="108" rx="${r}" fill="url(#sh)"/>
  <path d="M0 79 Q13.5 73 27 79 T54 79 T81 79 T108 79 V108 H0Z" fill="url(#w)" opacity=".92"/>
  <path d="M0 86 Q13.5 81 27 86 T54 86 T81 86 T108 86" fill="none" stroke="#5fd3c8" stroke-width="1.6" opacity=".55"/>`;
// Lapisan depan (dalam zona aman 66/108): kail besar + senar + ikan melompat
const front = `
  <path d="M54 14 V47" stroke="#2b1a02" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M54 46 V64 a11 11 0 0 1 -22 0 v-3" fill="none" stroke="#2b1a02" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M26.5 62 L32 51.5 L37.5 62 Z" fill="#2b1a02" stroke="#2b1a02" stroke-width="1.5" stroke-linejoin="round"/>
  <circle cx="54" cy="44" r="4.3" fill="none" stroke="#2b1a02" stroke-width="3"/>
  <g transform="translate(75 49) rotate(-28)">
    <path d="M-12 0 C-6 -8 8 -8 13 0 C8 8 -6 8 -12 0Z" fill="#fff8e6" stroke="#2b1a02" stroke-width="2.2"/>
    <path d="M-12 0 l-7 -6 v12z" fill="#fff8e6" stroke="#2b1a02" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="7" cy="-1.5" r="1.6" fill="#2b1a02"/>
  </g>
  <circle cx="82" cy="70" r="1.8" fill="#fff" opacity=".85"/><circle cx="87" cy="64" r="1.2" fill="#fff" opacity=".7"/>`;

const svg = (inner, w = 108, h = 108, vb = '0 0 108 108') => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${vb}">${inner}</svg>`;
const ICON_FULL = (r) => svg(back(r) + front);
// zona aman ikon adaptif = lingkaran 66/108 → lapisan depan diperkecil sedikit
const ICON_FG = svg(`<g transform="translate(54 50) scale(.84) translate(-54 -50)">${front}</g>`);
const ICON_BG = svg(back(0));

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const browser = await chromium.launch();
const page = await browser.newPage();
async function png(markup, w, h, out, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<html><body style="margin:0;background:${transparent ? 'transparent' : BG}">${markup.replace(/width="\d+" height="\d+"/, `width="${w}" height="${h}"`)}</body></html>`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: transparent, clip: { x: 0, y: 0, width: w, height: h } });
}
for (const [d, k] of Object.entries(DENS)) {
  const dir = path.join(RES, 'mipmap-' + d);
  await png(ICON_FULL(22), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'), true);
  await png(svg(`<clipPath id="c"><circle cx="54" cy="54" r="54"/></clipPath><g clip-path="url(#c)">${back(0)}${front}</g>`), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'), true);
  await png(ICON_FG, 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'), true);
  await png(ICON_BG, 108 * k, 108 * k, path.join(dir, 'ic_launcher_background.png'));
}
// Layar pembuka: latar gelap + ikon di tengah + nama (semua kepadatan & orientasi memakai gambar yang sama)
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.26;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${BG}"/>
    <g transform="translate(${(w - s) / 2} ${(h - s) / 2 - s * 0.18}) scale(${s / 108})">${back(24)}${front}</g>
    <text x="${w / 2}" y="${h / 2 + s * 0.62}" text-anchor="middle" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="${s * 0.2}" letter-spacing="${s * 0.03}" fill="#ffd36b">PAUNJUNAN</text></svg>`;
};
for (const f of fs.readdirSync(RES).filter(f => f.startsWith('drawable'))) {
  const p = path.join(RES, f, 'splash.png'); if (!fs.existsSync(p)) continue;
  const land = f.includes('land'), port = f.includes('port');
  const k = DENS[f.split('-').pop()] ?? 1;
  const [w, h] = land ? [480 * k, 320 * k] : port ? [320 * k, 480 * k] : [480, 480];
  await png(splash(w, h), w, h, p);
}
// Play Store: ikon 512 (tanpa sudut membulat — Play yang membulatkan) & grafik fitur 1024×500
await png(ICON_FULL(0), 512, 512, path.join(STORE, 'play-icon-512.png'));
await png(`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="500" viewBox="0 0 1024 500">
  <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14343a"/><stop offset=".62" stop-color="#0d4a4f"/><stop offset="1" stop-color="#062a2f"/></linearGradient>
  <radialGradient id="sun" cx=".78" cy=".3" r=".5"><stop offset="0" stop-color="#ffd36b" stop-opacity=".55"/><stop offset="1" stop-color="#ffd36b" stop-opacity="0"/></radialGradient></defs>
  <rect width="1024" height="500" fill="url(#sky)"/><rect width="1024" height="500" fill="url(#sun)"/>
  <path d="M0 360 Q128 340 256 360 T512 360 T768 360 T1024 360 V500 H0Z" fill="#083c45"/>
  <path d="M0 385 Q128 368 256 385 T512 385 T768 385 T1024 385" fill="none" stroke="#5fd3c8" stroke-width="3" opacity=".4"/>
  <g transform="translate(96 120) scale(2.4)">${back(24)}${front}</g>
  <text x="400" y="230" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-weight="900" font-size="78" letter-spacing="6" fill="#fff">PAUNJUNAN</text>
  <text x="404" y="290" font-family="system-ui,Segoe UI,Roboto,sans-serif" font-weight="800" font-size="34" fill="#ffd36b">Mancing santai, juara sungguhan</text></svg>`, 1024, 500, path.join(STORE, 'play-feature-1024x500.png'));
await browser.close();
console.log('ikon & layar pembuka selesai');

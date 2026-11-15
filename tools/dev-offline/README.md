# Alat uji tanpa internet (untuk sandbox Claude)

Sandbox Claude biasanya tidak bisa `npm install`. Alat ini memungkinkan cek tipe, uji otomatis, dan pratinjau UI tanpa three.js/fastify.

Persiapan (jalur di skrip sudah memakai lokasi ini):
```
mkdir -p /home/claude/w && cd /home/claude/w && unzip paunjunan-v2-v0.8.4-lengkap.zip
cp -r /home/claude/w/paunjunan/tools/dev-offline /home/claude/chk
```

- `./check.sh` — cek tipe game (stub three.js dibuat ulang oleh `gen.sh`). Abaikan galat TS2709 di tackle.ts & `authority.ts(1xx) never[]`.
- `cd srv && tsc -p .` — cek tipe server (stub fastify/ws/mysql2/nodemailer di `srv/`).
- `./runtest.sh shared/src/xxx.test.ts` (dari folder proyek) — jalankan uji dengan `vitest-shim.ts` lewat esbuild.
- `stub/three.ts` — three.js minimal (Vector3/MathUtils) untuk uji logika layout/walker di Node: `esbuild ... --alias:three=/home/claude/chk/stub/three.ts`.
- `three-proxy.js` — three.js tiruan (Proxy) agar UI yang mengimpor three.js bisa dirender di Chromium untuk tangkapan layar.
- Build prototipe: `ESBUILD_PATH=/opt/npm-tools/node_modules/esbuild/lib/main.js node tools/build-artifact.mjs` (lokasi lama: `~/.npm-global/lib/node_modules/tsx/node_modules/esbuild`).

## Melihat dunia 3D sungguhan di sandbox (baru, v0.9)

Chromium headless bisa merender WebGL lewat SwiftShader. three.js tidak bisa diunduh dari npm/CDN, tetapi **GitHub bisa**:
```
cd /home/claude && git clone --depth 1 --branch r186 --filter=blob:none --sparse https://github.com/mrdoob/three.js threejs
cd threejs && git sparse-checkout set build examples/jsm
cd /home/claude && python3 -m http.server 8765 &          # sajikan /home/claude
ESBUILD_PATH=/opt/npm-tools/node_modules/esbuild/lib/main.js node w/paunjunan/tools/build-artifact.mjs
node w/paunjunan/tools/dev-offline/shot3d.js "?auto=1&tier=sedang&h=10.4&w=cerah" nama 1536 1024 12000 "<js opsional>"
```
`shot3d.js` mencegat permintaan `cdn.jsdelivr.net/npm/three@…` dan menyajikan berkas dari `/home/claude/threejs`, lalu menyimpan tangkapan layar.
Argumen ke-6 = kode JS yang dijalankan di halaman (mis. tutup lembar, `window.__game.world.sky.photoMix = 1`, `window.__game.fishing.press()`).
Catatan: SwiftShader lambat (±1–20 fps) → waktu game berjalan pelan; peringatan "Mismatch between texture format and sampler type" berasal dari peta bayangan SwiftShader, abaikan.
Lokasi esbuild di sandbox baru: `/opt/npm-tools/node_modules/esbuild` (runtest.sh sudah memakainya).

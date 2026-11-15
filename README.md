# PAUNJUNAN — Mancing Danau Keramba (versi 2, fondasi baru)

Game memancing 3D untuk **Android, iOS, dan web**, dengan server game otoritatif dan website peringkat.
Dokumen ini menjelaskan susunan proyek, cara menjalankan, dan status pengerjaan.

## Status: v0.3 — Fase 1b, Fase 2 inti (akun, MySQL), Fase 3 (karakter), Fase 4 (turnamen, akuarium, pasar, klub)

| Bagian | Status |
|---|---|
| Aturan permainan bersama (`shared/`) | ✅ 17 uji otomatis (aturan + sosial/ekonomi) |
| Server game Node.js (`server/`) | ✅ HTTP + WebSocket per ruang, 2 uji otomatis lulus. Penyimpanan: memori + berkas JSON (MySQL di fase berikutnya) |
| Game 3D (`game/`) | ✅ Danau, air berpantulan, pohon, kelapa, rumput, keramba, burung, hujan/kabut, pemancing 3D, lempar → sentak → adu tarik → pamer ikan → keranjang, toko umpan/joran/senar, pindah spot, peringkat, pengaturan |
| Mode lokal (tanpa server) | ✅ Aturan server berjalan di perangkat |
| Proyek Android (Capacitor) | ✅ Dibuat (`game/android`), layar dikunci mendatar. APK dibangun lewat GitHub Actions atau Android Studio |
| iOS | ⏳ Butuh komputer Mac (aturan Apple) |
| Website peringkat | ⏳ Masih versi PHP lama; akan disambungkan ke server baru di Fase 5 |

## Susunan proyek

```
paunjunan/
├─ shared/     Aturan permainan (TypeScript): data ikan, umpan, joran, peluang, berat, level,
│              "Authority" (logika server yang menentukan hasil), penyaring obrolan, protokol WebSocket.
├─ server/     Server game (Node.js + Fastify + ws). Memakai aturan dari shared/.
├─ game/       Game 3D (TypeScript + Three.js + Vite), dibungkus Capacitor untuk Android/iOS.
│  ├─ src/core     renderer hemat daya, tingkat grafis, backend (lokal/server), audio, getaran
│  ├─ src/world    langit, medan, air, pohon, kelapa, keramba, kehidupan danau
│  ├─ src/actors   pemancing (IK), joran/reel/senar/pelampung, ikan
│  ├─ src/game     mekanik memancing, kamera, pemain lain
│  └─ public/assets  aset 3D terkompres (±1,8 MB)
└─ tools/      Skrip penyiapan aset (kompres tekstur, ubah warna baju, sederhanakan model)
```

## Menjalankan di komputer

Butuh Node.js 22.

```bash
npm install --legacy-peer-deps
npm test                 # uji aturan & server
npm run dev              # game di http://127.0.0.1:5173 (mode lokal)
npm run server           # server game di http://127.0.0.1:8787
npm run build            # hasil web siap unggah di game/dist
```

Server memakai MySQL bila variabel lingkungan diisi:

```bash
mysql -u USER -p NAMA_DB < server/database/schema.sql
DB_HOST=localhost DB_USER=... DB_PASS=... DB_NAME=... npm run server
```

Tanpa `DB_HOST`, server menyimpan ke `data.json` (pengembangan).

Supaya game memakai server: buka **Pengaturan → Server game**, isi alamat server, lalu **Simpan**.
Kosongkan untuk kembali ke mode lokal.

Parameter uji di alamat game: `?tier=hemat|sedang|tinggi`, `?h=16` (jam), `?w=hujan` (cuaca),
`?auto=1` (langsung masuk), `?demo=trophy&sp=toman&kg=8` (momen pamer ikan).

## Aplikasi Android

```bash
npm run build && cd game && npx cap sync android
```

Lalu salah satu:
- **Tanpa Android Studio:** unggah proyek ke GitHub, buka tab *Actions → Build Android → Run workflow*. APK ada di bagian *Artifacts*.
- **Dengan Android Studio:** `npx cap open android`, lalu *Build → Build APK*.

Untuk Play Store perlu versi *release* yang ditandatangani (AAB) — disiapkan di Fase 6 bersama Google Play Billing.

## Anti-panas & ringan

- Tingkat grafis otomatis (Hemat/Sedang/Tinggi) dari memori & jumlah inti HP.
- Batas FPS: HP 30 saat aktif, 24 saat menunggu ikan, 20 di menu; berhenti menggambar saat aplikasi di latar belakang.
- Resolusi dinamis: turun sampai 60% bila HP tidak sanggup.
- Pohon dekat = model penuh, pohon jauh = gambar pohon (impostor). Rumput tidak dipantulkan air.
- Pantulan air resolusi rendah dan tidak tiap gambar; di Hemat diganti pantulan palsu yang murah.
- Anggaran terukur: Hemat ±100 ribu segitiga / ±90 perintah gambar, Sedang ±220 ribu / ±180.

## Server & ribuan pemain

- Server menentukan semua hasil: kapan ikan menyambar, jenis, berat, koin. Tangkapan yang terlalu cepat ditolak.
- Pemain dibagi ke **ruang** berisi maksimal 40 orang per spot (`B3#1`, `B3#2`, …). HP hanya menerima posisi pemain di ruangnya, 5× per detik.
- Hostinger *Business Web Hosting* mendukung aplikasi Node.js dari hPanel; dukungan WebSocket perlu dicek. Untuk ribuan pemain online bersamaan, pindah ke VPS.

## Aset 3D (gratis) dan lisensi

| Aset | Sumber | Catatan |
|---|---|---|
| Pemancing | Contoh Ready Player Me di repositori three.js (MIT) | Baju diwarnai ulang, ekor jas dipotong. **Ganti dengan model milik sendiri/berlisensi sebelum rilis.** |
| Ikan | Khronos glTF Sample "BarramundiFish" (CC0) | Diwarnai per jenis lewat shader |
| Pohon, rumput, batu, tekstur kulit kayu & daun | EZ-Tree oleh Daniel Greenheck (MIT) | Dikecilkan ke 256 px |
| Bangau & burung beo | Contoh three.js (MIT) | |
| Tekstur air & rumput | Contoh three.js (MIT) | |
| Kelapa, dermaga, keramba, langit, awan | Dibuat dengan kode | |

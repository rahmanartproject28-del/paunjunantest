# SERAH TERIMA — PAUNJUNAN v2 (untuk dilanjutkan di akun Claude lain)

> Per 26 September 2026 (diperbarui: v0.4 — serok, danau hidup, panel admin, obrolan klub; prototipe artifact aktif). Lampirkan dokumen ini **dan** `paunjunan-v2-fase1.zip` di percakapan baru,
> lalu tulis: *"Lanjutkan proyek PAUNJUNAN v2 sesuai SERAH-TERIMA.md, mulai dari langkah berikutnya."*
> Kalau masih ada, lampirkan juga `REKAP-FITUR-PAUNJUNAN.md` dan `PAUNJUNAN-paket-lengkap.zip` (prototipe lama).

## 1. Keputusan yang sudah disepakati

- **Jalur A:** web modern (TypeScript + Three.js + Vite), dibungkus **Capacitor** untuk Android dan iOS. Tidak memakai Unity.
- **Server:** Node.js + TypeScript (Fastify + ws). Server menentukan semua hasil (anti-curang). Aturan permainan ditulis sekali di `shared/` dan dipakai server serta mode lokal.
- **Aset 3D gratis dulu.** Model pemancing wajib diganti dengan model berlisensi sebelum rilis.
- **Hosting pengembangan:** Hostinger Business yang sekarang (mendukung aplikasi Node.js dari hPanel; dukungan WebSocket belum dicek). Untuk ribuan pemain: VPS.
- **Uji coba:** mode lokal di browser (halaman artifact claude.ai) tanpa server.
- **Tampilan:** mengikuti gambar contoh (Fishing Planet / The Fisherman). Kamera di belakang-kiri pemancing, danau yang hidup.
- **Bahasa antarmuka:** Bahasa Indonesia yang sederhana.

## 2. Susunan kode (zip `paunjunan-v2-fase1.zip`)

```
shared/  data.ts (ikan, umpan, joran, senar, cuaca, spot) · rules.ts (peluang, berat, level, harga)
         authority.ts (lempar→sentak→dapat, toko, keranjang) · memoryStore.ts · protocol.ts (WebSocket) · chat.ts
server/  app.ts (HTTP + WebSocket per ruang 40 pemain) · index.ts (simpan ke data.json) · app.test.ts
game/    src/main.ts (boot, menu, HUD, lembar, loop FPS) · core/ (quality, backend lokal/server, audio, haptics, net, assets)
         world/ (layout, terrain, water, sky, vegetation, palms, props, life, world) · actors/ (angler+IK, tackle, fish)
         game/ (fishing, camera, crowd, effects) · ui/hud.ts · style.css · android/ (Capacitor, dikunci mendatar)
tools/   prepare-assets.mjs (kompres aset dari assets-raw) · recolor.mjs (warna baju) · split-models.mjs
.github/workflows/android.yml   membangun APK debug di GitHub Actions
```

Perintah: `npm install --legacy-peer-deps` · `npm test` · `npm run dev` · `npm run server` · `npm run build`.
Parameter uji di URL game: `?tier=hemat|sedang|tinggi&h=16&w=hujan&auto=1&demo=trophy&sp=toman&kg=8`.

## 3. Fitur: sudah vs belum

Tanda: ✅ sudah di v2 · 🟡 sebagian · ❌ belum (ada di prototipe lama, harus dipindahkan) · ⏳ belum ada di mana pun.

### Dunia & tampilan
| Fitur | Status |
|---|---|
| Danau + medan + pegunungan berkabut | ✅ |
| Air: pantulan cermin (Sedang/Tinggi), pantulan palsu murah (Hemat), riak, cipratan, air jernih di atas ikan | ✅ |
| Langit fisik + awan + matahari mengikuti jam, cuaca cerah/kabut/hujan | ✅ |
| Malam: bulan, bintang, kunang-kunang, lampu keramba menyala | 🟡 cahaya malam dasar saja, belum dicek visual |
| Pohon rindang (EZ-Tree) + impostor jauh, kelapa, rumput bergoyang, alang-alang, teratai, batu | ✅ |
| Dermaga kayu, keramba apung (jaring, drum biru, pelampung, pondok) | ✅ |
| Gapura, loket tiket, halaman darat, 7 pondok, 3 titian apung, rakit rumput, lampu jalan & dermaga | ✅ v0.2 (kode, belum dicek visual) |
| Bangau & burung beo terbang, capung, ikan liar melompat | ✅ |
| Perahu jukung berpendayung, kawanan bebek, burung layang-layang, bangau yang mendarat di tiang keramba/rakit | ✅ v0.4 |
| Latar lokasi dari foto (admin, silinder di balik pegunungan, dikecilkan otomatis) | ✅ v0.4.2 |

### Karakter
| Fitur | Status |
|---|---|
| Pemancing 3D berkerangka + topi pet, pose memancing lewat IK (tanpa file animasi) | ✅ (model sementara, terlihat seperti jas) |
| Berdiri, berjalan dengan joystick/WASD, 3 kecepatan, jalan otomatis (Dijkstra), animasi jalan prosedural | ✅ v0.2 (diuji simulasi Node, belum dicek visual) |
| Duduk di kotak pancing (*Duduk di sini*) | ✅ v0.2 |
| Kustomisasi karakter: Avatar, Tubuh, Wajah, Topi, Baju, Celana, Alas kaki (beli & simpan, pratinjau langsung, terlihat oleh pemain lain) | ✅ v0.3 (warna lewat shader, belum dicek visual) · tab Rambut ❌ (rambut menyatu di tekstur model RPM) |
| Sapa pemain lain (gelembung, WebSocket `emote`), ketuk pemain untuk lihat kartu | ✅ v0.2 |
| Pemain lain: simulasi 4 NPC (lokal) / sungguhan lewat WebSocket (server) | ✅ (label nama & level) |

### Memancing
| Fitur | Status |
|---|---|
| Tahan-lepas untuk melempar, bidik dengan geser, penanda bidikan, rem jari | ✅ |
| Kail jatuh di darat/dermaga/rangka keramba → tersangkut | ✅ |
| Pelampung bergetar, tenggelam, SENTAK, terlalu cepat/lambat | ✅ (waktu dari server) |
| Adu tarik: jarum tegangan, zona emas, stamina, 7 perilaku ikan, lompatan, kombo SEMPURNA, TARIKAN KUAT | ✅ |
| Rem reel (drag) 1–5 · ANGKAT JORAN saat ikan lari ke rumput/jaring keramba | ✅ v0.4 |
| Kartu gagal dengan penyebab & tips | ✅ |
| Serok ikan 3 tahap (tuntun → celup di zona hijau → ANGKAT), hasil baru dikirim ke server setelah berhasil | ✅ v0.4 |
| Pamer ikan dua tangan + kartu tangkapan (bintang, berat berhitung, rekor) | ✅ |
| Lihat ikan 360° (geser/otomatis), bagikan tangkapan (share/salin teks), konfeti rekor & monster | ✅ v0.3 |
| Keranjang kawat mengapung di samping pemancing | ✅ v0.3 |
| Kamera: belakang bahu, ikuti umpan, sisi saat adu tarik, zoom saat ikan melompat, pinch/roda zoom | ✅ |
| Kamera "Tampak joran", ketinggian kamera | ✅ v0.2 · efek sinematik (bloom) ❌ |
| Panduan interaktif langkah demi langkah (8 langkah, bisa diulang dari Pengaturan) | ✅ v0.2 |

### Ekonomi, sosial, akun
| Fitur | Status |
|---|---|
| Umpan (6 jenis, termasuk Racik Serba Ikan), joran (5 di toko), senar (4), beli & pakai | ✅ |
| Keranjang: jual semua, lepas satu | ✅ |
| Level & XP, koin | ✅ |
| Pindah spot (A1, B3, C2) lewat lembar | ✅ |
| Peta danau besar (geser, zoom, *Jalan ke sini*) + peta mini | ✅ v0.2 (peta dicek visual di Chromium) |
| Warung Pancing (kios di lokasi + tombol HUD) | ✅ v0.2 |
| Empat lokasi: Danau Keramba, Sungai Deras (Lv 5), Pantai Karang (Lv 10), Laut Dalam (Lv 15); 9 ikan baru, joran/senar laut, umpan cumi | ✅ v0.6 (tata letak diuji Node, peta dicek Chromium; 3D belum dilihat) · verifikasi GPS ❌ |
| Album ikan (tab di Peringkat) · Turnamen Harian & Raja Nila Mingguan (daftar, papan, hadiah otomatis) | ✅ v0.3 (8 uji) |
| Papan peringkat di game (terberat/terbanyak/level; hari/minggu/semua) | ✅ |
| Pasar antarpemain (biaya 10%, aman dua pembeli bersamaan), akuarium (kanvas 2D, tiket pengunjung, akuarium besar), klub (target 100 kg/minggu, hadiah) | ✅ v0.3 · akuarium 3D & obrolan klub ❌ |
| Obrolan global: layar, lencana, batas kirim, lapor, simulasi lokal | ✅ v0.2 |
| Akun: daftar, masuk, PIN per perangkat, tamu→akun (progres ikut), ganti sandi, keluar, hapus akun | ✅ v0.2 (9 uji) · Google, OTP, lupa sandi via email ❌ |
| Beli koin: paket + bonus, verifikasi server sekali-pakai (`shared/src/billing.ts`, 2 uji), Google Play Developer API (`server/src/googlePlay.ts`), mode uji di prototipe | 🟡 v0.5 · belum diuji dengan Play Console sungguhan; plugin `@capgo/native-purchases` perlu dipasang |
| Panel developer/admin di game: peluang & bobot ukuran per jenis, pengali harga & XP, pengumuman, stok spot, beri koin, log audit (`shared/src/admin.ts`, 2 uji) | ✅ v0.4 · editor ikan baru ❌ |

### Server, website, rilis
| Fitur | Status |
|---|---|
| Server Node: tamu, world, cast/hook/land, jual, lepas, toko, equip, peringkat, WebSocket ruang | ✅ diuji (3 uji + ujung-ke-ujung) |
| Penyimpanan MySQL (`server/src/mysqlStore.ts`, `server/database/schema.sql`, aktif bila `DB_HOST` diisi) | 🟡 ditulis, **belum pernah dijalankan ke MySQL sungguhan** |
| Rute admin `/api/admin/*` (header `X-Admin-Token` = `ADMIN_TOKEN`), log audit | ✅ v0.4 · CORS daftar-putih ketat 🟡 |
| Website peringkat `/papan` dilayani server Node (statistik, turnamen, peringkat; tema terang/gelap) | ✅ v0.5 (dicek di Chromium) |
| Proyek Android + workflow APK | ✅ (APK belum pernah dibangun) |
| iOS | ⏳ butuh Mac |
| Skrip uji beban k6 `tools/load/k6-pemain.js` (naik bertahap sampai 2.000 pemain) | 🟡 skrip siap, belum dijalankan ke server sungguhan |

## 3b. Catatan v0.2 (baca ini dulu)

- **v0.2 ditulis tanpa internet** (sandbox tidak bisa `npm install`). Diperiksa dengan: cek tipe TypeScript memakai stub three.js/fastify, bundel esbuild, uji Node (aturan 9/9, akun 9/9, simulasi jalan otomatis ke A1/B3/C2), dan render peta 2D di Chromium. **Dunia 3D v0.2 belum pernah dilihat.** Langkah pertama berikutnya: `npm install --legacy-peer-deps && npm test && npm run dev`, lalu cek visual: halaman darat, titian, pondok, animasi jalan & duduk, kamera jalan.
- **Bug lama diperbaiki:** spot C2 dulu berada di dalam danau (±3,4 m di bawah air). Sekarang di tepi barat (x ≈ −87).
- Pemain mulai di halaman darat (gapura) dengan lembar *Selamat datang*; bisa dimatikan di Pengaturan → *Mulai di pintu masuk*. `?auto=1` tetap langsung ke spot.
- Arah: yaw 0 = menghadap −Z. Di peta, −Z di atas (utara). Halaman darat di selatan (+Z).
- Berkas baru: `world/layout.ts` (area pijak, titian, jalur), `game/walker.ts`, `ui/map.ts`, `ui/chat.ts`, `ui/coach.ts`, `ui/account.ts`, `server/src/accounts.ts` (+ uji), `server/src/mysqlStore.ts`.
- Rute server baru: `/api/auth/register|login|pin|logout|password`, `/api/account/delete`. Sesi kini tersimpan (hash token), tidak hilang saat server restart.

## 3c. Catatan v0.3

- Aturan Fase 3 & 4 ada di `shared/src/social.ts` (kelas `Social`), dipakai server **dan** mode lokal. Uji: `shared/src/social.test.ts` (8 uji).
- Store punya dua metode baru: `getDoc` / `updateDoc` (dokumen bersama: `tour:<id>`, `market`, `clubs`). `updateDoc` harus atomik: MemoryStore memakai antrean, MySQL memakai `SELECT … FOR UPDATE` (tabel `pj_docs`).
- Player punya kolom opsional baru: `look`, `owned`, `aquarium`, `aqBig`, `aqClaimAt`, `club`. Data lama tetap terbaca.
- Rute server baru: `/api/look`, `/api/tournaments(/join|/claim)`, `/api/aquarium/add|remove|big|visitors`, `/api/market(/list|/cancel|/buy)`, `/api/clubs(/create|/join|/leave|/claim)`.
- Tombol HUD baru 🎪 *Sosial & koleksi*. Warung Pancing kini membuka Pasar, Ganti baju, dan Akuarium.
- Bahan model pemancing sekarang diklon per pemancing (sebelumnya berbagi, jadi warna baju akan menular ke semua pemain).
- Risiko kecil yang diketahui: pembeli di pasar dibaca sebelum kunci dokumen, jadi dua pembelian bersamaan oleh **orang yang sama** bisa lolos cek koin. Perbaiki di Fase 6 dengan transaksi pemain.

## 3d. Catatan v0.4 & prototipe

- **Prototipe artifact:** `npm run artifact` → `game/dist-artifact/paunjunan.html` (three.js dari jsDelivr lewat import map, aset ditanam base64, EZ-Tree diganti `src/artifact/ezTreeLite.ts`). Terbit di https://claude.ai/artifact/3ruaA1rYtSD7tdspxW62Mv (akun ini).
- Malam dibuat lebih terang (bulan, bintang, 4 lampu terdekat menyala sungguhan), pengaturan Kecerahan.
- Topi pet dimodelkan ulang (6 panel, jahitan, lidah melengkung) dan **diukur dari mesh kepala & mata**; semua topi/kacamata mengikuti ukuran itu.
- Obrolan: server kini menyiarkan obrolan *global* ke semua ruang (dulu hanya satu ruang) dan tab *Klub* ke sesama anggota klub lintas ruang.
- Konfigurasi admin disimpan di dokumen `config`; Authority membaca `rates`, `priceMul`, `xpMul` darinya.

## 3e. Catatan v0.4.1–v0.4.2

- **Air ditentukan dari tinggi tanah** (`isWater` = groundH < −0,03), bukan `lakeE`. Dulu tepi berumput dianggap darat → tidak bisa memancing. Sekarang 120/120 titik tepi danau bisa dipakai memancing.
- *Mancing di sini* dari jauh → jalan otomatis ke tepi air terdekat (`nearestFishable`) lalu langsung memancing.
- Bercak hitam = burung layang-layang lama (segitiga hitam datar). Diganti siluet badan+sayap sabit+ekor bercabang, bahan Lambert, kepak terlihat.
- Tabrakan: batang pohon, semak, palem, batu (`addObstacle`/`obstacleAt` di layout.ts). Graf jalur dibangun ulang otomatis. Simulasi: 0 kali menembus pohon.
- Foto latar mode lokal disimpan di kunci `backdropImg` terpisah supaya penyimpanan progres tidak ikut gagal bila penuh.

## 3f. Catatan v0.5

- Akuarium 3D di halaman darat (`world/aquarium.ts`, titik `AQUA` di layout); layar Akuarium memindahkan kamera ke tangki.
- Editor ikan (panel admin): nama, harga/kg, berat, tarikan, warna — `applySpeciesEdits` mengubah tabel `SPECIES` bersama; server mengirim suntingan lewat `/api/world`.
- Lupa sandi: `/api/auth/forgot` + `/api/auth/reset`, kode 6 angka 30 menit lewat email (`server/src/mailer.ts`, SMTP Hostinger via env; tanpa SMTP kode tercetak di log).
- Rilis: `.github/workflows/android-release.yml` (AAB+APK bertanda tangan dari GitHub Secrets, nomor versi dari input).
- Uji otomatis: 32 (aturan 9, sosial 8, admin 3, beli koin 2, akun 10).

## 3g. Catatan v0.6 — lokasi

- Lokasi aktif: `LOC` di `world/layout.ts` (dari `?loc=` atau simpanan `pj_loc`). Semua sistem membaca `lakeE`/`groundH`/`walkInfo` yang kini bergantung lokasi; bangunan danau (keramba, dermaga, gapura, akuarium) hanya dibuat di danau.
- Sungai: `rivC`/`rivW`, arus `FLOW` (+X), jembatan gantung (Bridge.style='gantung'), batu besar S1 (`PADS`). Pantai: `shoreZ`, karang `REEF` (daratan menjorok), dermaga nelayan `PIER`. Laut: pulau `ISLANDS`, kapal `BOAT` (dek = PADS, kabin = blok tak-bisa-dipijak).
- `shoreXZ()` menggantikan rumus elips danau di penempatan pohon/palem/batu/alang-alang.
- Spot baru S1–S3, P1–P3, L1–L3 di `shared/src/data.ts` (`loc`, `minLv`); server menolak lemparan bila level kurang (`ignoreLevelLock` hanya di mode lokal).
- Kurva tarikan di atas 16 kg dilandaikan & adu tarik minimal dibatasi (marlin 180 kg ≈ 58 dtk).

## 3h. Catatan v0.6.1–v0.7

- Kamera sorot (ikuti umpan, sorot pelampung, dekat saat disambar) + 5 posisi kamera (`CAM_MODES` di camera.ts), panel 🎥.
- Tema game kuning-oranye (selaras website), layar pembuka baru (logo kail, "SIAPA RAJA AIR HARI INI?").
- Progres (`shared/src/progress.ts`, 5 uji): misi harian deterministik (pid+tanggal WIB, jenis ikan sesuai level), bonus 150 bila 3 misi selesai; hadiah harian beruntun 7 hari (hari 7 + 5 Umpan Racik); 17 lencana otomatis dari tangkapan. Rute: `/api/progress`, `/api/missions/claim`, `/api/daily/claim`, `/api/badges/claim`.
- UI: tombol 📋 (lencana angka), layar Misi & Lencana, Profil (ketuk nama di HUD), jendela Hadiah harian saat masuk.
- Website PHP 8.3 terpisah: `paunjunan-website-php83.zip` (belum dijalankan dengan PHP).

## 3i. Catatan v0.8

- Acara musiman (`GameEvent` di `shared/src/admin.ts`, uji di admin.test.ts): pengali peluang jenis ikan, XP, harga; tidak boleh bertabrakan; maks. 31 hari; preset Minggu Toman / Pesta Nila / XP Ganda. Authority memakai `effRates/effPriceMul/effXpMul`. Papan acara via `Store.topCatches` (Memory & MySQL). Rute `/api/event`, `/api/admin/events`. UI: pita HUD + layar acara (`ui/events.ts`), tab Acara di panel admin.
- Soundscape (`core/soundscape.ts`): air/arus/ombak/angin per lokasi, burung/camar, jangkrik & katak malam, hujan, musik latar generatif per lokasi (pentatonik), turun saat adu tarik. Pengaturan Suara alam & Musik latar. Diuji di Chromium tanpa galat (belum didengar).
- Efek: cincin buih (`Splashes.foamAt`), jejak arus sungai / buih ombak pantai / buih laut (`world/flowfx.ts`, blending aditif), bloom `UnrealBloomPass` hanya tier Tinggi (bisa dimatikan).
- Toko baru (`ui/shop.ts`): bilah perbandingan dengan penanda perlengkapan yang dipakai & selisih %, chip kecocokan umpan, pratinjau 3D joran (renderer kecil terpisah, dibuang saat lembar ditutup).

## 3j. Catatan v0.8.1–v0.8.2

- Bloom: bawaan MATI (kunci `bloom2`), urutan pass Render → OutputPass → Bloom (langit Sky bernilai HDR besar; bloom di HDR memutihkan layar).
- Adu tarik: `bearing` awal dinormalisasi ke −π..π (dulu ikan bisa muncul 22 m dari pelampung).
- Pamer ikan: tiap tangan memegang ujung ikan di sisinya, titik pegang di bawah badan (`gripHead/gripTail` di fish.ts), ikan sedikit lebih depan/rendah.
- Joran baru (`actors/tackle.ts`): blank runcing 8 sisi pernis, gagang EVA+reel seat berulir+gabus+winding check, 8 ring pemandu + tip-top (InstancedMesh, geometri ring+sisipan+kaki+lilitan), reel spinning lathe (spool, senar tergulung, drag, bail, roller, engkol).
- Pelampung stik: badan berlapis warna di bawah air, antena bergaris, ujung fluoresen, pemberat timah; (0,0,0) = garis air.
- Langit siang cerah: foto `assets/tex/sky_day.webp` (23 KB, dari referensi pengguna) di shader kubah awan yang sudah ada, tanpa tone mapping (warna foto asli), kabut cakrawala biru pucat (warna dari referensi kedua). Hanya aktif saat cerah & matahari cukup tinggi; pagi/sore/malam/berawan tetap prosedural.

## 3k. Catatan v0.8.3 — pakaian memancing

- Katalog (`shared/src/social.ts`): kulit 8 warna, topi 9 warna, slot baru `accent` (9 warna) & `neck` (buff), 6 jenis baju (kemeja, jersey UV [bawaan baru], kamuflase, kemeja berventilasi, rompi, jaket anti-angin), celana kargo; 5 avatar siap pakai.
- Angler: shader `tint2` dengan motif di koordinat bind-pose kain (jersey panel+garis, kamo bercak 3 warna, garis ventilasi, jaket mengkilap). Perlengkapan 3D menempel ke tulang (rompi berkantong → Spine1, tudung+ritsleting+list → Spine2, saku kemeja → Spine2, buff → Neck, kantong kargo → UpLeg); dibangun dalam bind pose lalu dipulihkan (`gear()`), jadi aman dipanggil kapan saja. Ukuran dari posisi tulang (`measureTorso`). Belum dicek visual.

## 4. Masalah yang diketahui

1. **Model pemancing** berasal dari avatar jas pengantin (Ready Player Me, contoh three.js). Sudah diwarnai ulang dan ekor jas dipotong, tapi dari depan masih seperti jas + dasi kupu-kupu. Ganti dengan model pemancing gratis/berlisensi (mis. dari Mixamo/Sketchfab, tulang Mixamo) — kode IK di `actors/angler.ts` bekerja untuk kerangka Mixamo/RPM (nama tulang `RightArm`, `RightForeArm`, `RightHand`, dst.; kalau berawalan `mixamorig`, sesuaikan).
2. Portrait (HP tegak) sudah bisa, tapi game paling bagus mendatar.
3. Anggaran performa terukur: Hemat ±100 rb segitiga / 90 draw call, Sedang ±220 rb / 180, Tinggi ±380 rb / 230. Belum diuji di HP sungguhan.
4. Ikan realistis hanya satu model (Barramundi CC0) yang diwarnai per jenis. Idealnya model per jenis.

## 5. Catatan teknis penting (supaya tidak mengulang kesalahan)

- **Halaman artifact claude.ai memblokir gambar `blob:`**, sehingga tekstur di dalam `.glb` tidak muncul (orang jadi putih). Solusi yang dipakai: `tools/split-models.mjs` memecah model menjadi `assets/m/<nama>.json` + gambar `.webp` + buffer `.bin.wasm`. Artifact juga tidak melayani ekstensi `.glb`. GLTFLoader tidak peduli ekstensi.
- Menerbitkan artifact: ambil `game/dist/index.html`, buang `<!doctype>`, `<html>`, `<head>`, `<body>`, charset & viewport (skeleton menambahkannya), simpan sebagai `play.html`, terbitkan dengan semua file `assets/**`.
- EZ-Tree: tekstur dialihkan ke versi 256 px lewat alias Vite `./textures` → `src/world/ezTextures.ts`, dan `optimizeDeps.exclude` untuk `ez-tree-src` (tanpa itu mode dev memakai tekstur 1K). Tekstur pohon **harus dimuat dulu** (`preloadTreeTextures`) sebelum impostor dibuat, kalau tidak pohon jauh gundul.
- Waktu yang juga dihitung server (gigitan, adu tarik minimal) memakai **jam nyata** `performance.now()`, bukan waktu game.
- `dt` di loop dijepit `>= 0` (timestamp rAF bisa lebih kecil dari `performance.now()` awal → kamera melenceng).
- `Authority`: opsi `undefined` jangan menimpa bawaan (sudah diperbaiki).
- Di lingkungan kerja Claude: jangan `pkill -f` dengan pola yang juga muncul di perintah sendiri (mematikan shell). Uji visual pakai Playwright + SwiftShader (lambat ±1–3 FPS), jadi otomatisasi uji harus berjalan di dalam halaman.
- Aset mentah diunduh dari `raw.githubusercontent.com` (three.js examples, KhronosGroup glTF-Sample-Assets). Poly Haven & jsDelivr tidak bisa diakses dari shell.

## 6. Langkah berikutnya (urutan disarankan)

**Fase 1b — ✅ selesai di kode (v0.2), tinggal cek visual & penyetelan.**
Sisa kecil: tabrakan dengan pohon, pemain lain terlihat berjalan hanya di ruang yang sama.

~~Fase 1b lama:~~
1. **Berjalan:** tombol *Berdiri & jalan*, joystick virtual kiri, 3 kecepatan (1,45 / 2,2 / 3,3 m/s), area pijak (dermaga, titian, papan keramba), animasi jalan. Animasi jalan bisa dari klip Mixamo (`Soldier.glb`/`Xbot.glb` di three.js punya Walk/Run, perlu retarget ke kerangka pemancing) atau prosedural. Tombol *Mancing di sini* / *Duduk di sini*. Kamera orang ketiga mengikuti.
2. **Peta:** peta mini saat berjalan + peta danau besar (spot, aktivitas, posisi Anda & pemain lain, *Jalan ke sini*), gambar di kanvas dari `world/layout.ts`.
3. Pintu masuk (gapura, loket, halaman darat) + lembar *Selamat datang*; 3 titian apung dari dermaga ke keramba; Warung Pancing.
4. Tata letak HUD seperti prototipe lama (tombol peta, warung, obrolan, karakter, kamera) dan panduan interaktif.

**Fase 2 — 🟡 inti selesai (v0.2).** Sisa: uji adaptor MySQL ke database sungguhan (Hostinger), pemindahan data dari server PHP lama, lupa sandi via email, Google Sign-In, rute admin & audit.

**Fase 3 — 🟡 v0.3:** kustomisasi, sapa/kartu pemain, duduk ✅. Sisa: **model pemancing berlisensi** (wajib sebelum rilis), rambut, jenis baju berbeda bentuk (rompi/jaket kini hanya warna).

**Fase 4 — 🟡 v0.3:** obrolan, turnamen, album, pasar, akuarium, klub, keranjang kawat, 360°, bagikan ✅. Sisa: akuarium 3D. (Serok & obrolan klub ✅ v0.4)

**Fase 5 — website peringkat & dasbor admin** membaca database/server baru.

**Fase 6 — rilis:** APK/AAB release bertanda tangan, Google Play Billing, hapus akun, uji beban k6, iOS (Mac + akun Apple Developer).

## 7. Tautan

- Prototipe yang bisa dimainkan (artifact, akun lama): https://claude.ai/artifact/E2PsJG6Me5RNDCLCAnmJRc — hanya bisa dibuka pemilik atau orang yang diberi akses lewat menu Share. Di akun baru, terbitkan ulang dari kode.

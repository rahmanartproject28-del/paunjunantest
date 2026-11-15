# SERAH TERIMA — PAUNJUNAN v2 · versi 0.9.7

> Diperbarui 15 November 2026 (v0.9.7). Untuk melanjutkan di akun Claude lain, lampirkan di percakapan baru:
> 1. **`PAUNJUNAN-LENGKAP-v0.9.7.zip`** — WAJIB. Isi: `1-game-dan-server/` (kode game + server + shared + aset game + alat uji offline), `2-website-ci4/` (website peringkat + panel pengelola, CodeIgniter 4.7), prototipe siap main, dokumen ini, `REKAP-FITUR-PAUNJUNAN.md`, `ASET-BACA-DULU.md`, `PANDUAN-GERAKAN-DAN-KENYAMANAN.md`.
> 2. (hanya bila mau memasang aset/animasi tambahan) paket aset, dipecah 5 berkas supaya tiap berkas di bawah batas unggah 30 MB: `aset-1-animasi.zip`, `aset-2-ikan-air-efek-suara.zip`, `aset-3-langit.zip`, `aset-4-tanah.zip`, `aset-5-properti.zip`. `tools/make-motion.py` butuh `aset-1-animasi.zip` (folder `1-animasi-avatar/rpm-pria`; nama subfolder `idle/` dan `locomotion/` sama dengan aslinya).
>
> Lalu tulis: *"Lanjutkan proyek PAUNJUNAN v2 sesuai SERAH-TERIMA.md."* Bagian 0 (yang terbaru ada di akhir bagian itu: v0.9.7) dan bagian 7–8 berisi keadaan terakhir dan pekerjaan berikutnya.
> Prototipe terbit terakhir: artifact "PAUNJUNAN Mancing v0.9.5" (akun rahmanartproject28). Di akun lain tautan itu tidak bisa diperbarui — terbitkan artifact baru dari `game/dist-artifact/paunjunan.html` (cara di bagian 3).

---

## 0. Yang baru di v0.9.0 — rombak tampilan mengikuti gambar konsep "Memancing di Danau Serene"

- **Lokasi baru & bawaan: Danau Serene** (`LOC = 'serene'`, Lv 1, spot D1 Dermaga Serene · D2 Pondok Panggung · D3 Tepi Batu). Danau Keramba tetap ada (pilih lewat Menu → Lokasi).
  Dunia dibangun prosedural di `game/src/world/serene.ts`: pegunungan bersalju melingkar (1 mesh + kabut sendiri), ±3.200 pinus (1 draw call),
  hutan kerucut di lereng gunung, dermaga kayu lebar + **lentera** + tiang tambat bertali, **pondok panggung** (jendela & papan nama menyala, teras berpagar,
  gudang perahu, cerobong), titian kayu ke pondok, tepi kiri berbatu & bunga liar, **air terjun** (shader + kabut), **perahu layar** berlayar memutar,
  dan **7 ikan yang terlihat berenang** di air jernih. Air Serene: toska jernih (uniform `clarity`), dasar pasir-kerikil dengan **kaustik** bergerak.
- **HUD baru** (`index.html`, `style.css` bagian "HUD Danau Serene", `ui/hudv2.ts`, `ui/icons.ts`): potret 3D pemain (diambil dari kamera kecil di depan wajah),
  nama + Lv + bilah XP hijau, pil **koin** & **permata** (+), panel **Quest Harian** (misi harian, yang pertama disorot kuning), tombol **Tas / Toko / Menu**,
  **peta mini bulat** (kerucut pandang) + nama lokasi & koordinat + jam & cuaca, **joystick selalu tampil** (sentuh = berdiri & jalan), baris **obrolan dunia**,
  **hotbar** (joran · umpan dipakai · senar · umpan lain · tas), tombol bulat **Umpan**, **Lempar/Tarik/Gulung** (besar), dan **Angkat kail/Jalan** (kecil).
  Menu = kisi semua fitur lain (peta, misi, sosial, obrolan, peringkat, karakter, kamera, lokasi, suara, pengaturan, menu utama). Tata letak khusus HP mendatar & tegak.
- **Permata** (mata uang baru, `Player.gems`, `GEMS` di `shared/src/progress.ts`): misi +2, bonus tiga misi +5, hadiah hari ke-7 +10, lencana +5. Diuji (`social.test.ts`).
- **Pemain**: tampilan bawaan = topi pet hitam + **hoodie** abu kebiruan + **ransel petualang** (slot baru `bag`), **rambut pendek hitam** prosedural untuk semua pemancing.
  Kamera "Bahu" kini di belakang-**kanan** pemain (pemain di kiri layar, pelampung di kanan) seperti gambar konsep.
- **Tab Panel developer "Latar & air"**: 3 slot foto (`BackdropSlot`: `depan` = seberang danau, `belakang` = di belakang pemain, `dasar` = dasar danau; dokumen `backdrop`, `backdrop_belakang`, `backdrop_dasar`; localStorage `backdropImg`/`backdropBack`/`backdropBed`; `GET /api/backdrop?slot=`), kejernihan air jernih/sedang/keruh (`GameConfig.waterClarity`), dan opsi pemandangan ujung danau. Depan + belakang → masing-masing setengah silinder; hanya satu → melingkar penuh. Foto silinder dibalik `repeat −1, offset 1` (tanpa itu terbalik kiri-kanan). Dasar danau: `setBedPhoto` di terrain.ts, ubin ±7 m bercermin.
- **"Mancing di sini"** kini memancing TEPAT di posisi pemain dan menghadap arah kamera (`walker.fishingPose(rig.yaw)`, `aimAtWater` di layout.ts: arah dipertahankan bila ada air di depan, bila tidak digeser ke arah berair terdekat maks. ±60°). Dulu ditarik ke spot terdekat (≤1,5 m) dan diputar ke 'arah air terbaik'.
- **Pohon berdaun lebar** (`world/broadtree.ts`, gaya foto acuan pohon ek tua dari pengguna — dibuat prosedural, bukan model/foto Hum3D yang berlisensi): batang pendek memutar berkulit abu, 7 dahan menyebar, kartu gugus daun (alphaTest) dengan goyang angin; 2 LOD (penuh ≤48 m, ringan sisanya). Di Danau Serene semua pohon ≤130 m dari dermaga = pohon lebar, 130–260 m campur pinus, lereng jauh pinus. Segitiga: hemat ±350 rb, sedang ±630 rb.
- **Latar foto pegunungan** (dulu di tab Ekonomi): di Danau Serene foto dipasang melingkar (R 560 m dari tengah danau, tepi bawah tertutup pinus) dan pegunungan prosedural otomatis disembunyikan (`SereneScape.setFarVisible`). Opsi **Pemandangan ujung danau: Tampil/Sembunyikan** — menyembunyikan pinus, pohon, batu, bunga, alang-alang & air terjun > 85 m dari dermaga, **menurunkan daratan jauh ke bawah air** (shader medan, `world/farcut.ts`) dan membuat air di sana pekat; bidang air Serene diperluas 2,6 km sehingga danau menyambung ke latar. Dulu: hanya pohon (`GameConfig.hideFarTrees`, ikut di /api/world; pohon > 85 m dari dermaga, `farTree` di serene.ts; lokasi lain > 90 m dari spot awal) agar foto tidak terhalang.
- **Perbaikan**: lokasi selain danau dulu macet di `buildShorePlants` (daftar teratai kosong) — sekarang aman.
- Jujur soal batas: gambar konsep tampaknya ilustrasi/render AI. HUD bisa dibuat hampir sama; dunia 3D real-time di HP dibuat semirip mungkin
  (gaya low-poly halus), tetapi tidak setara render film. Model pemain masih avatar "jas" (dasi kupu-kupu ditutup panel hoodie) → **ganti model berlisensi**.

### v0.9.1 — adu tarik & ikan didapat (mengikuti gambar konsep kedua), wajah & rambut
- **Adu tarik**: pengukur tegangan melingkar 240° di sekeliling tombol **TARIK!** (merah kendur → hijau aman/zona emas → kuning → oranye putus), ikon ikan-kail,
  panel kecil jarak/tenaga ikan/perintah/rem reel di kiri tombol; HUD atas, quest, peta, dan obrolan tetap tampil; joystick/hotbar disembunyikan.
  Kamera adu tarik "Bahu" di belakang bahu pada sisi yang sama dengan ikan (ikan melompat tidak terhalang badan). Pemain lain bersorak di obrolan (mode lokal).
- **Ikan didapat**: pemain **mengangkat ikan tinggi dengan tangan kanan** (rahang dijepit, ikan tergantung & berayun, tetes air), joran di tangan kiri, kamera dari belakang-kiri.
  Notifikasi kiri atas "✓ Ikan berhasil ditangkap! +Exp · Koin", pita emas **IKAN BERHASIL DITANGKAP!**, kartu ikan (foto 3D ikan dirender khusus, label kelangkaan
  Biasa/Bagus/Rare/Epic dari ukuran, Berat/Panjang/Nilai, bintang, lama adu tarik), tombol **Lepas** & **✓ Simpan**, tombol kecil Bagikan & 360° (360° = kamera depan melihat wajah).
  Catatan: "Koin" di notifikasi = nilai jual ikan (koin baru diterima saat ikan dijual di Toko).
- **Wajah**: tekstur wajah dirapikan saat dimuat (`improvedFace` di angler.ts: alis tebal rapi, garis kelopak, bibir natural, kontur pipi/rahang) dan warna wajah
  kini sama dengan kulit tangan (`FACE_AVG`). **Rambut** hitam baru: cangkang tipis + helai poni/samping/tengkuk (jambul bila tanpa topi). Kulit kepala di area rambut (dihitung dari posisi titik mesh kepala → segitiga UV, `scalpUV()`) diwarnai hitam di tekstur wajah, jadi celah antar helai tidak tampak kulit; helai memakai normal menghadap luar. Hoodie tidak lagi memakai kotak/silinder penutup: bagian depan jas (kelepak, kerah, dasi kupu-kupu) **diratakan langsung di geometri baju** (`hoodieTop` di angler.ts, ruang lokal mesh: Y atas, +Z depan), warna kain diratakan, tali ransel menempel di dada.

### v0.9.2 (14 Nov 2026) — aset gratis untuk tampilan
- Artifact kini memakai **EZ-Tree asli** (MIT, disalin ke `vendor/ez-tree/lib`; `tools/build-artifact.mjs` meng-alias-nya dan mengarahkan `./textures` ke `ezTextures.ts`). Danau Serene: ±3.000 pinus & ek EZ-Tree lewat `vegetation.ts` (pohon dekat model penuh, sisanya impostor 512 px, dicerahkan). Kerucut pinus & `broadtree.ts` tidak dipakai lagi (kode `buildPines` masih ada).
- Batu tepi Serene memakai model batu GLB bertekstur foto; tebing memakai normal halus (`vWN`), tidak lagi bercak segitiga.
- Dari sandbox hanya GitHub yang terjangkau (Poly Haven, Sketchfab, Quaternius, Kenney diblokir). Belum ada model karakter pemancing gratis yang layak → karakter belum diganti.
- Sandbox baru: `tools/dev-offline/shot.sh` (menyalakan server lokal + tangkapan layar 3D).

### v0.9.3 (14 Nov 2026) — main luring otomatis + ringan untuk HP RAM 4 GB

**Luring ↔ daring otomatis (mode server).** `game/src/core/hybrid.ts` (`HybridBackend`) membungkus `RemoteBackend` + satu `LocalBackend` khusus luring (simpanan terpisah, awalan kunci `off_`).
- Jaringan putus (fetch gagal/timeout/5xx = `NetError`, atau event `offline`) → otomatis pindah luring memakai data pemain terakhir dari server; memancing, ganti perlengkapan, dan lepas ikan tetap jalan dengan aturan yang sama di perangkat. Toko, jual, pasar, klub, turnamen, peringkat → pesan "perlu jaringan".
- Putus **di tengah tarikan**: ikan yang sudah ditentukan server tetap dihitung (dikirim dengan nomor tarikan `hook`, dihitung penuh).
- Jaringan kembali (event `online`, ping `/health` tiap 8 dtk, atau aplikasi dibuka lagi) → hasil luring dikirim ke `POST /api/offline/sync`, data pemain diambil dari server, WebSocket disambung ulang, muncul pemberitahuan. Sesi luring tersimpan di perangkat (`pj_offSes`), jadi aman walau aplikasi ditutup saat luring.
- **Kebijakan (keputusan Claude, bisa diubah di `OFFLINE` — `shared/src/offline.ts`)**: server memeriksa ulang semuanya — berat harus di rentang jenis, jarak antar tangkapan ≥ 20 dtk, jumlah ≤ umpan yang dimiliki, maks 150 per kiriman, umur ≤ 7 hari, kiriman sama tidak dihitung dua kali (`sid`). Koin & XP hasil luring **50%**, dan **tidak masuk papan peringkat, turnamen, misi**. Pemilik belum memutuskan kebijakan ini secara eksplisit.
- Tanda di layar: pil kuning "Luring · N ikan menunggu dikirim" (`#netPill`).
- Uji: `shared/src/offline.test.ts` (6) + `game/src/core/hybrid.test.ts` (3, server tiruan yang bisa dimatikan). Total uji sekarang 49.
- Mode lokal (tanpa server) tidak berubah: memang sepenuhnya di perangkat.
- **Belum**: aplikasi web/PWA belum punya service worker (versi APK Capacitor membawa semua berkas jadi tidak perlu); belum diuji dengan server sungguhan + HP sungguhan.

**Ringan di HP RAM 4 GB.** HP ≤ 4 GB otomatis tingkat `hemat`: tanpa bayangan/pantulan/pasca-proses, DPR 1, 30 FPS (24 saat menunggu), resolusi dinamis. v0.9.3 memangkas lagi: pohon ×0,45, 4 pohon detail penuh, daun ×0,5, impostor 256 px, rumput 900. Terukur di sandbox (Danau Serene, `?tier=hemat`): ±167 ribu segitiga, 268 draw call per gambar (sebelumnya 173 ribu; tingkat `sedang` ±410 ribu). Ditambah penanganan `webglcontextlost` (muat ulang rapi bila memori grafis diambil sistem). **Belum pernah diuji di HP sungguhan** — angka FPS/RAM nyata harus diukur di perangkat.

### v0.9.4 (14 Nov 2026) — gerak avatar dari rekam gerak manusia (mocap)

- Avatar sekarang memakai animasi rekam-gerak untuk **diam berdiri, jalan, dan lari kecil** (sebelumnya ayunan kaki buatan kode). Sumber: pustaka animasi Ready Player Me (`M_Standing_Idle_001`, `M_Walk_001`, `M_Jog_001`), kerangkanya sama persis dengan avatar kita (52/52 tulang).
- Berkas: `game/public/assets/m/motion.json` + `motion.bin.wasm` (±115 KB), dibuat oleh `tools/make-motion.py <folder masculine/glb>` — skrip membuang mesh, jari tangan kanan, dan gerak maju (root motion), lalu menyimpan panjang langkah & fase kaki di `scenes[0].extras.motion`.
- Kode: `actors/angler.ts` → `setMotion()`, `applyMotion()`, `sample()`, `stepLength()`. Pose dasar = campuran diam↔jalan↔lari menurut `pose.walk`, waktu klip dikunci ke `pose.walkPhase`, dan panjang langkah di `walker.ts`/`crowd.ts` disamakan dengan rekaman (0,80 m jalan; 1,28 m lari) supaya kaki tidak meluncur. Di atasnya tetap berjalan lapisan lama: lengan memegang joran (IK), condong/putar badan, kepala menoleh, duduk.
- `?nomocap=1` = gerak lama (untuk membandingkan). Bila `motion.json` tidak ada, otomatis kembali ke gerak lama.
- **Lisensi**: animasi RPM hanya boleh untuk avatar RPM dan layanan RPM sudah tutup — lihat `ASET-BACA-DULU.md` di paket aset. Untuk rilis jangka panjang rencanakan pindah ke karakter + animasi CC0 (Quaternius Universal Animation Library); `make-motion.py` tinggal diarahkan ke berkas baru bila nama tulangnya sama.
- **Belum**: gerakan khusus memancing (lempar, tarik, angkat ikan) masih buatan kode — butuh berkas Mixamo dari pemilik; variasi diam, geser samping, jalan mundur, ekspresi belum dipasang (berkasnya sudah ada di paket aset `aset-paunjunan-2026-11-14.zip`).

### v0.9.5 (15 Nov 2026) — mancing otomatis, rasa adu tarik, keranjang besar, kios & penjaga, perbaikan

**Mancing otomatis (permintaan pemilik).** Tombol 🤖 **Otomatis** di samping tombol Umpan saat pemain sudah di spot (mode `ready`, mis. setelah "Mancing di sini"). Lembar pembuka menampilkan peluang berhasil per ukuran, pengali hadiah, sisa harian, dan aturan peringkat; lalu avatar melempar (arah & tenaga acak), menyentak dengan reaksi manusiawi 0,25–0,6 dtk (jam nyata), adu tarik dengan pengendali otomatis (jarum dijaga di zona emas, angkat joran otomatis), lalu **meminta hasil ke server**. Berhasil → ikan diangkat & dipamerkan 1,8 dtk (notifikasi kecil "🤖 Nila 610 g didapat!"), disimpan, lempar lagi. Gagal → toast "lepas". Bilah status atas: jumlah ikan, lepas, berat, waktu, sisa hari ini, tombol ■ Berhenti. Berhenti sendiri saat umpan habis, keranjang penuh (atau dijual otomatis bila disetel), batas harian, jaringan putus, pemain mengetuk tombol besar atau berjalan → **ringkasan sesi** (didapat, lepas, % berhasil, berat, koin, XP, waktu) dengan tombol Lanjut.
- **Server yang memutuskan** (`shared/src/auto.ts`, `Authority.landAuto`, `POST /api/fishing/land {auto:true}`, `GET /api/auto`): cek fitur hidup, level minimal, batas harian (hari WITA, `Player.autoUse`), jeda minimal antar tangkapan, adu tarik minimal (aturan lama), lalu **dadu `rng() < rate[ukuran]`**. Lepas → ikan kembali ke stok. Berhasil → `award()` dengan pengali `gainMul` (koin & XP), `CatchRec.auto = true`, tidak masuk `pj_catches`/papan peringkat/turnamen/papan acara bila `board=false`; misi & lencana sesuai `missions`. Pembatas laju `auto:` 12/menit.
- **Pengaturan pemilik** (`GameConfig.auto`, panel admin tab **🤖 Otomatis**, hanya pemegang `ADMIN_TOKEN`; tiap perubahan tercatat di Log): hidup/mati · peluang berhasil Kecil/Sedang/Besar/Monster (bawaan 92/78/55/30%) · hadiah ×0,7 · batas 150 ikan/hari · jeda 12 dtk · level minimal 2 · ikut peringkat & turnamen: **tidak** · misi & lencana: dihitung · keranjang penuh: berhenti/jual. Bawaan ini **keputusan Claude**, pemilik bisa mengubah kapan saja.
- **Acuan desain**: Black Desert (AFK fishing boleh, tetapi lebih lambat & kurang efisien dari manual; pembuat bot tetap diblokir), Fishing Clash/Let's Fish "Automatic fishing" (berhenti saat bahan habis, jendela ringkasan hasil), Cast n Chill (mode diam: hadiah sama, lebih lambat), IOU RPG (efisiensi luring 50%), server AFK dengan batas harian (Olympus Angler). Prinsipnya: otomatis = kenyamanan, bukan jalan pintas → hadiah lebih kecil, lebih lambat, dibatasi harian, juara tetap hasil keterampilan.
- **Batas**: otomatis hanya berjalan selama aplikasi terbuka (tidak ada simulasi di server saat aplikasi ditutup) dan perlu jaringan di mode server. Mode lokal memakai aturan yang sama di perangkat.
- Uji: `shared/src/auto.test.ts` (6: peluang 0/100%, 50% statistik 300 percobaan, pengali hadiah & papan peringkat, batas harian/jeda/level/mati, keranjang penuh+jual, validasi admin & misi). Diuji juga ujung-ke-ujung di Chromium: lempar → sambar → sentak → adu tarik → ikan diangkat otomatis.

**Rasa adu tarik**: perintah **KENDURKAN REM ↓** (tegangan ≥ 88 tanpa menggulung, atau tegang lama dengan rem ≥ 4) dan **KENCANGKAN REM ↑ SENAR MENIPIS**, tombol rem yang perlu diketuk berkedip · **detak jantung** (`sfx.heart`, getar, tepi layar berdenyut merah) makin rapat saat senar hampir putus atau kail hampir lepas · **Tarikan Kuat** = gerak lambat halus 1,7 dtk (masuk 0,2 dtk, keluar 0,4 dtk; `Fishing.slowmo`), pita sinema + vinyet (`#vig`), kamera memperbesar ke ikan, bunyi `sfx.slowmo`.
**Saran spot sepi** (`game/src/game/advice.ts`, diuji): setelah 25 dtk tanpa sambaran atau 2 lemparan kosong → kartu 💡 berisi maks. 3 saran yang dihitung dari stok bawaan spot + keramaian dari server: pindah spot (tombol Buka peta), lempar lebih jauh/dekat, sub-zona, ganti umpan yang dimiliki (tombol langsung ganti) atau beli umpan yang cocok, atau info cuaca.
**Keranjang besar**: 500 koin sekali beli, kapasitas 10 → 20 (`BASKET_BIG_*`, `basketCap()`, `Authority.buyBigBasket`, `POST /api/basket/big`, Toko tab **🧺 Alat**, baris di Warung, main luring ikut kapasitas). **Keranjang kawat terlipat** dijinjing tangan kiri saat berjalan, berayun dengan pegas (`makeFoldedNet`, `Fishing.placeCarry`).
**Kios & penjaga warung**: `SHOP` di layout.ts per lokasi. Danau Keramba: Pak Darto di kios lama. **Danau Serene kini punya kios "WARUNG UMPAN"** di lapangan dekat dermaga (`SKIOSK`, `Props.buildKiosk`, ada tabrakan) dengan Bu Ratna. Penjaga = avatar (topi rimba + rompi pancing), menoleh ke pemain, melambai & bergelembung kata saat didekati, dihitung 20×/dtk hanya bila kamera < 45 m. Tombol "Masuk warung" & "Jalan ke warung" di peta kini memakai `SHOP` (dulu di Serene menuju koordinat tak terjangkau).
**Perbaikan**: (1) **Pasar**: pembeli dibaca & dipotong koinnya di dalam kunci dokumen pasar (uji baru gagal di kode lama). (2) **Kunci per pemain di server** (`shared/src/lock.ts` `KeyedLock`, hook `preHandler` di app.ts): semua POST pemain yang sama diproses berurutan → tidak ada pembaruan hilang (dua ketukan cepat / dua HP). Satu instans server; banyak instans butuh kunci di database. (3) HUD 1280×720: `--u` dibatasi tinggi layar (jam tidak menimpa Umpan). (4) HP mendatar: kotak Panduan melebar menutupi layar (top+bottom) — diperbaiki. (5) **Penunjuk FPS** di atas tengah, warna hijau/kuning/oranye dibanding anggaran (hemat 300 dc/300 rb, sedang 450/600 rb, tinggi 700/1,5 jt), ketuk = rincian geometri/tekstur/memori. (6) **Tes koneksi** di Pengaturan (`core/servertest.ts`): "Terhubung ✓ · 32 ms · 3 spot · Cerah · 12 daring", Simpan hanya bila tes lulus.
- Total uji: **67** lulus (aturan 12, otomatis 6, sosial 10, kunci 3, luring 6, progres 5, admin 4, beli koin 2, akun 10, hibrida 3, tes koneksi 2, saran 4). `app.test.ts` butuh fastify/ws (npm tidak terjangkau dari sandbox).
- Alat sandbox: `runtest.sh` kini meng-alias `three` ke stub (uji modul game), `gen.sh` menambah stub `vitest`, `shot3d.js` menerima `PRE="<js>"` (dijalankan tepat sebelum tangkapan). Catatan: tangkapan layar SwiftShader butuh ±25 dtk → elemen yang hilang sendiri (toast, kartu saran 14 dtk) perlu dibekukan dulu di argumen JS.
- **Belum**: Grafis dunia P2 (silau matahari, kabut pagi berlapis, burung formasi V, efek sinematik) — berikutnya. Belum diuji di HP & server sungguhan.

### v0.9.6 — Website peringkat + panel pengelola di CodeIgniter 4.7 (menggantikan website PHP native)

Folder `2-website-ci4/` (repo terpisah di sandbox: `/home/claude/web/paunjunan-web`). Baca **README.md**-nya untuk pemasangan Hostinger.
- **Framework**: CodeIgniter **4.7.6** (rilis terbaru saat dibuat), `system/` disertakan (tanpa Composer), PHP ≥ 8.2 (pakai 8.3). QR 2FA: chillerlan/php-qrcode 6.0.1 (MIT) di `app/ThirdParty`.
- **Publik**: beranda/peringkat, terberat, terbanyak, kompetisi (+detail), klub, pengumuman (+detail); data contoh bila database kosong (`paunjunan.demoWhenEmpty`, matikan di produksi).
- **Panel** di `/<paunjunan.adminPath>/` (rahasia; jalur lain 404): Dasbor (online, grafik 14 hari & per jam, ikan terpopuler, **dugaan bot** ≥ 60 ikan/jam, terkaya) · Pemain (cari/urut, detail, **koin ±** dengan alasan, **blokir/buka**) · Game (mancing otomatis, ekonomi & pesan harian, acara musiman, stok per spot, log server game) · Konten (kompetisi, pengumuman) · Akun admin (sandi sementara, peran, nonaktif, reset 2FA/sandi) · Aktivitas admin (log audit) · Profil (ganti sandi, kode cadangan baru).
- **Peran**: superadmin (semua) · moderator (pemain: koin ±5.000 & blokir, konten) · pemantau (lihat saja). Izin di `app/Config/Paunjunan.php` `$perms`.
- **Pengaturan game** dikirim lewat API admin server Node (`paunjunan.gameApiUrl` + `gameAdminToken` = `ADMIN_TOKEN`, header `X-Admin-By` = nama admin → log game). Pantauan dibaca langsung dari tabel `pj_*` (SQL portabel MySQL/SQLite). Server game kini punya **`POST /api/admin/ban`** (pemain diblokir ditolak di API & WebSocket, langsung diputus) — `shared/src/admin.ts` `setBan/isBanned/banMessage`.
- **Keamanan**: Argon2id, 2FA TOTP wajib + 10 kode cadangan (hash), anti pakai-ulang kode, rahasia 2FA terenkripsi; penguncian 5 gagal/15 mnt per IP & 10/jam per nama; honeypot; sesi `SameSite=Strict`/`__Host-`, terikat peramban, 30 mnt diam / 8 jam, **putus otomatis bila admin dinonaktifkan atau sandi/2FA-nya direset** (cap kredensial); CSRF semua formulir; query terikat + daftar putih; escape + CSP ketat tanpa inline; HSTS & header keamanan; pembatas 180 req/mnt/IP; daftar IP panel opsional; error produksi tanpa detail.
- **Uji**: `tools/dev/e2e.py` — **75 skenario lulus** (semua modul + CSRF palsu, SQLi, XSS, brute force, kode 2FA dipakai ulang, cookie dicuri ke peramban lain, batas peran, putus sesi). Butuh `php spark serve --port 8091`, mock admin game (`tools/dev-offline/admin-mock.ts` di repo game, port 8095) dan data SQLite (`tools/dev/seed-sqlite.php`). Mode produksi juga dicek (tanpa toolbar/debug, 404 bertema, CSRF gagal → pesan ramah).
- **Pasang**: `database/schema-web.sql` (phpMyAdmin) atau `php spark migrate`; `.env` dari `env.produksi.contoh`; `php spark key:generate`; superadmin pertama lewat `/<adminPath>/pasang?token=<setupToken>`. `tools/` jangan diunggah.
- **Belum**: belum pernah jalan di Hostinger/MySQL sungguhan (diuji dengan SQLite + mock server game).
- **Database untuk hPanel** (`2-website-ci4/database/`): `paunjunan-database.sql` (11 tabel game+website, sekali impor, mencatat migrasi CI), `data-contoh.sql` (12 pemain/380 tangkapan, waktu relatif saat impor, ID `demo_`), `hapus-data-contoh.sql`. Generator: `tools/dev/make-sample-sql.py`. Diperiksa sintaks MySQL (sqlglot dari GitHub) + dimuat ke SQLite.

### v0.9.7 — Siap Android (prioritas pemilik: Android dulu, iOS menyusul)

- **`game/src/core/mobile.ts`** (+`mobile.test.ts`): tombol **Kembali** Android dengan urutan `backAction()` (lembar → kartu lepas → tahan saat adu tarik/kartu tangkapan → hentikan otomatis → hentikan jalan otomatis → menu utama → konfirmasi keluar `App.exitApp()`); Esc di browser meniru. **Pause/resume** (`App` pause/resume + visibilitychange): mancing otomatis berhenti dgn ringkasan, `suspendAudio()/resumeAudio()` (audio.ts), `Net.wake()` sambung ulang seketika, `backend.me()` bila ditinggal > 2 mnt. `keepAwake()` (Wake Lock, untuk web). `SystemBars.hide()` (inti Capacitor 8).
- **Android asli**: `MainActivity.java` imersif (BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE, sembunyi lagi saat fokus kembali), `FLAG_KEEP_SCREEN_ON`, poni SHORT_EDGES; `capacitor.config.ts` `SystemBars.hidden` + `NativePurchases.autoFinishTransactions=false`; tema pembuka gelap (`pj_splash_bg`) tanpa kilatan putih.
- **Ikon & layar pembuka baru** (kail + ikan melompat + air, emas-jingga): `tools/make-app-icons.mjs` (Playwright) → semua mipmap (adaptif + monochrome Android 13), splash semua kepadatan, `game/store-assets/play-icon-512.png` & `play-feature-1024x500.png`.
- **Beli koin Android aman** (`core/purchase.ts` +`purchase.test.ts`): dependensi **`@capgo/native-purchases` ^8.9.16** kini di package.json (dulu belum!). Beli tanpa acknowledge → server verifikasi Google & consume → klien consume cadangan; **`recoverPurchases()`** saat masuk memulihkan pembelian terbayar yang belum ditukar (aplikasi tertutup/jaringan putus); harga asli dari Play (`storePrices`); mode luring di aplikasi menolak beli; pesan galat ramah.
- **Menu utama HP mendatar pendek** (≤ 430 px, mis. 800×360): dua kolom, tidak terpotong lagi. HUD dicek 800×360.
- **Website**: halaman **`/kebijakan-privasi`** & **`/hapus-akun`** (wajib Play Console; cara hapus dari aplikasi & lewat email), tautan di kaki halaman, `paunjunan.contactEmail` / `developerName` di `.env`.
- **GitHub Actions**: *Build Android* kini otomatis tiap push ke `main` (kode game) + input alamat server; kedua workflow memeriksa plugin NativePurchases/App/Haptics ikut terpasang, cache npm/gradle.
- **Panduan**: `docs/RILIS-ANDROID.md` — GitHub, APK uji, kunci, Play Console (isian App content & **Data safety**), produk `koin_*`, service account server, *license testers*, uji tertutup 12 penguji × 14 hari (akun pribadi baru), produksi, daftar periksa.
- Uji: 83 lulus (baru: tombol kembali 4, pembelian 3). Belum dicoba di HP sungguhan.
- **GitHub (15 Nov 2026)**: repo privat **`rahmanartproject28-del/paunjunantest`** (isi = folder game ini, cabang `main`, Claude GitHub App terpasang → sesi Claude bisa push). Workflow **Build Android** lulus (run #4): npm test → vite build → cap sync → gradle assembleDebug → artifact + **Release prarilis `uji-N`** berisi `paunjunan-uji-N.apk` (unduh langsung dari HP). Perbaikan saat build pertama: YAML `concurrency` (flow-map dengan `${{ }}`), `versionCode = (...).toInteger()` di app/build.gradle. APK 8,1 MB (web 3,2 MB); bundel web APK dijalankan di Chromium 800×360 tanpa galat. Status run bisa dibaca lewat `curl https://api.github.com/repos/rahmanartproject28-del/paunjunantest/actions/runs` (proxy sesi menyertakan izin); unduhan artifact (blob Azure) diblokir proxy, tetapi aset Release bisa diunduh dengan `-H 'Accept: application/octet-stream' .../releases/assets/ID`.
- Belum: secret `GAME_SERVER_URL` (APK uji masih mode lokal), secret kunci tanda tangan untuk *Rilis Android*, iOS. iOS (proyek Xcode, StoreKit + verifikasi JWS App Store di server, workflow TestFlight) ditunda sampai Android selesai.

## 1. Keputusan yang sudah disepakati

- **Game**: web modern TypeScript + Three.js (r186) + Vite, dibungkus **Capacitor** untuk Android (iOS butuh Mac). Tidak memakai Unity.
- **Server**: Node.js + TypeScript (Fastify + ws). **Server menentukan semua hasil** (anti-curang). Aturan ditulis sekali di `shared/` dan dipakai server serta mode lokal.
- **Penyimpanan**: MySQL (adaptor `server/src/mysqlStore.ts`) bila `DB_HOST` diisi; selain itu memori + `data.json`.
- **Hosting**: Hostinger Business (dukungan WebSocket belum dicek); untuk ribuan pemain: VPS.
- **Uji coba**: prototipe satu berkas HTML yang diterbitkan sebagai artifact claude.ai (mode lokal, tanpa server).
- **Website peringkat + panel pengelola**: CodeIgniter 4.7 (`2-website-ci4/`, sejak v0.9.6; menggantikan PHP native), membaca database game yang sama, mengubah pengaturan game lewat API admin server.
- **Tampilan**: HUD bergaya gambar konsep "Danau Serene" (kaca gelap transparan, aksen kuning/emas). Bahasa antarmuka: Bahasa Indonesia sederhana.
- **Aset 3D**: gratis dulu. **Model pemancing wajib diganti model berlisensi sebelum rilis** (sekarang avatar Ready Player Me "jas" yang diwarnai ulang).

## 2. Susunan kode (`paunjunan/`)

```
shared/src/   data.ts (16 ikan, 7 umpan, 9 joran, 6 senar, 4 lokasi, 12 spot) · rules.ts (peluang, berat, tarikan, level)
              authority.ts (lempar→sentak→dapat, toko, keranjang, antarmuka Store) · memoryStore.ts · protocol.ts · chat.ts
              social.ts (kosmetik/pakaian, turnamen, akuarium, pasar, klub, DocStore) · progress.ts (misi harian, hadiah harian, 17 lencana)
              admin.ts (konfigurasi admin, editor ikan, acara musiman, latar foto, stok, audit) · billing.ts (beli koin, verifikasi sekali-pakai)
              *.test.ts (uji otomatis)
server/src/   app.ts (HTTP + WebSocket per ruang, semua rute) · index.ts · accounts.ts (daftar/masuk/PIN/lupa sandi/hapus akun)
              mysqlStore.ts · mailer.ts (SMTP) · googlePlay.ts (verifikasi pembelian) · website.ts (/papan) · accounts.test.ts
server/database/schema.sql
game/src/     main.ts (boot, menu, HUD, lembar-lembar, loop) · style.css
  core/       quality · backend (lokal/server, satu antarmuka) · net · audio · soundscape (suara alam + musik) · haptics · store · purchase
  world/      serene.ts (dunia Danau Serene) · layout.ts (LOKASI aktif, bentuk air/tanah per lokasi, area pijak, jalur Dijkstra, rintangan) · terrain · water · sky
              vegetation · palms · props (bangunan per lokasi) · life (burung, jukung, bebek, bangau) · aquarium (3D) · flowfx (arus/buih)
  actors/     angler (IK, jalan/duduk, pakaian & perlengkapan menempel tulang) · tackle (joran/reel/ring/pelampung) · fish · ik
  game/       fishing (lempar, adu tarik, serok 3 tahap) · walker (jalan, joystick, otomatis) · camera (sorot, 5 posisi) · crowd · effects
  ui/         hudv2 (HUD Danau Serene) · icons (ikon SVG) · hud · map · chat · coach · account · social (karakter, turnamen, akuarium, pasar, klub, koin) · progress (misi/lencana/profil)
              events (acara) · admin (panel developer) · shop (toko + pratinjau 3D joran)
  artifact/   entry.ts, patch.ts (aset tertanam), ezTreeLite.ts (pengganti EZ-Tree), capacitor.ts (stub)
  android/    proyek Capacitor (versi & tanda tangan dari variabel lingkungan)
tools/        build-artifact.mjs (satu berkas HTML) · prepare-assets.mjs · recolor.mjs · split-models.mjs · load/k6-pemain.js
              dev-offline/ (alat uji tanpa internet — lihat bagian 4)
.github/workflows/android.yml (APK debug) · android-release.yml (AAB+APK bertanda tangan)
docs/REKAP-FITUR-PAUNJUNAN.md (fitur prototipe lama) · docs/SERAH-TERIMA-riwayat.md (catatan per versi 0.2–0.8.3)
```

Perintah (butuh internet untuk `npm install`): `npm install --legacy-peer-deps` · `npm test` · `npm run dev` · `npm run server` · `npm run build` · **`npm run artifact`** (→ `game/dist-artifact/paunjunan.html`).
Parameter uji URL: `?tier=hemat|sedang|tinggi&h=16&w=hujan&auto=1&demo=trophy&sp=toman&kg=8&loc=serene|danau|sungai|pantai|laut`.

## 3. Prototipe artifact

- Terbit (v0.9, akun ridhodev01): https://claude.ai/artifact/YP88opTc94MPJYpaXiN3Qd · akun lama (v0.8.4): https://claude.ai/artifact/3ruaA1rYtSD7tdspxW62Mv (hanya pemilik). Untuk terbit, isi HTML dipublikasikan tanpa pembungkus `<html><head><body>` (lihat cara di riwayat v0.9). Di akun baru: terbitkan ulang `paunjunan.html` (atau bangun dengan `npm run artifact`) lewat alat Artifact (action publish).
- three.js dimuat dari **cdn.jsdelivr.net lewat import map** (CDN skrip yang diizinkan halaman artifact); semua aset (GLB + tekstur) **ditanam base64**. Gambar `blob:` diblokir artifact, maka `patch.ts` memuat GLB lewat `GLTFLoader.parse` dan gambar lewat `<img>` data URI (createImageBitmap dimatikan).
- EZ-Tree tidak bisa dimuat di artifact → `ezTreeLite.ts` (pohon prosedural). Versi `npm run build` tetap memakai EZ-Tree asli.

## 4. Lingkungan kerja Claude (PENTING)

- **Sandbox Claude biasanya TANPA internet** → `npm install` gagal. Pekerjaan dilakukan dengan `tools/dev-offline/`:
  - `gen.sh` (membuat `three-stub.d.ts`) + `tsconfig.json` + `check.sh` → cek tipe game memakai stub three.js. Galat `TS2709` di tackle.ts dan `authority.ts(1xx) never[]` adalah artefak stub, abaikan.
  - `srv/` → cek tipe server dengan stub fastify/ws/mysql2/nodemailer.
  - `vitest-shim.ts` + `runtest.sh` → jalankan `*.test.ts` dengan esbuild (esbuild ada di `~/.npm-global/lib/node_modules/tsx/node_modules/esbuild`).
  - `stub/three.ts` (Vector3/MathUtils minimal) → uji logika layout/walker di Node. `three-proxy.js` → render UI yang mengimpor three.js di Chromium tanpa WebGL.
  - Playwright + Chromium tersedia. **Dunia 3D KINI BISA dilihat di sandbox** (SwiftShader + three.js diambil dari GitHub) → `tools/dev-offline/shot3d.js`, lihat README-nya. Tetap minta tangkapan layar pengguna untuk performa & warna di HP sungguhan.
  - Skrip memakai jalur `/home/claude/chk` dan `/home/claude/w/paunjunan`: salin `tools/dev-offline` → `/home/claude/chk`, ekstrak zip ke `/home/claude/w/`.
- Membangun artifact tanpa internet: `ESBUILD_PATH=/opt/npm-tools/node_modules/esbuild/lib/main.js node tools/build-artifact.mjs` (lokasi esbuild bisa berbeda per sandbox: cari dengan `find / -name esbuild -type f`).
- Jangan `pkill -f` dengan pola yang juga ada di perintah sendiri.

## 5. Catatan teknis (supaya tidak mengulang kesalahan)

- **Lokasi**: `LOC` di `world/layout.ts` (dari `?loc=` atau simpanan `pj_loc`). Semua sistem membaca `lakeE` (jarak ke air, <1 = air), `groundH`, `walkInfo`. Bangunan danau (keramba, dermaga, gapura, akuarium) hanya di danau; `shoreXZ()` menempatkan vegetasi per lokasi. **Air = `isWater` (groundH < −0,03), BUKAN lakeE.**
- **Arah**: yaw 0 = menghadap −Z; maju = (−sin yaw, −cos yaw). Sudut arah ikan saat adu tarik **harus dinormalisasi** ke −π..π (dulu ikan melompat 22 m ke samping).
- **Bloom**: langit shader Sky bernilai HDR besar → bloom di HDR memutihkan layar. Urutan wajib: RenderPass → OutputPass → Bloom; bawaan MATI (kunci `bloom2`).
- **Langit siang cerah**: foto `assets/tex/sky_day.webp` (23 KB) di shader kubah awan, dicampur SETELAH tone mapping (warna foto asli); hanya saat cerah & matahari tinggi.
- **Bahan model pemancing** diklon per pemancing (kalau tidak, warna baju menular ke semua pemain). Kulit: kepala bertekstur → pengali; **badan tanpa tekstur → warna langsung** (dulu tangan putih).
- **Perlengkapan menempel tulang** (rompi, tudung, saku, buff, kargo) dibangun dalam bind pose lalu dipulihkan (`Angler.gear()`), aman dipanggil kapan saja.
- **Topi & kacamata** diukur dari mesh kepala & mata (`measureHead`), jangan pakai angka tetap.
- **Penyimpanan lokal**: foto latar disimpan di kunci `backdropImg` terpisah (supaya progres tidak gagal tersimpan bila localStorage penuh).
- **Prepared statement MySQL asli**: placeholder bernama tidak boleh dipakai dua kali, dan tidak boleh ada parameter berlebih.
- **Pasar**: pembeli dibaca sebelum kunci dokumen → dua pembelian bersamaan oleh orang yang sama bisa lolos cek koin (perbaiki dengan transaksi pemain).
- **Serene**: urutan indeks cincin pegunungan harus berlawanan jarum jam dari atas (dulu normal menghadap bawah → gelap & tanpa salju).
  `vColor` di shader three r186 bertipe **vec4** (pakai `vColor.rgb`). Cahaya lingkungan langit HDR membuat benda gelap pucat → Serene memakai `sky.envScale = 0.28`.
  Kabut eksponensial memucatkan benda gelap (pinus) walau hanya 15–20% → kabut Serene 0,00085 + kabut pegunungan sendiri.
- **CSS**: jangan pakai nama kelas `.cur` untuk hal lain (dipakai wadah koin/permata, posisi absolut) — slot umpan aktif memakai `.inuse`.
- Uji otomatis: **67** (lihat v0.9.5) — semua lulus. Sebelumnya: **39** (aturan 10, sosial 8, admin 4, beli koin 2, progres 5, akun 10) — semua lulus.

## 6. Status fitur v2 (0.8.4)

✅ ada & diuji logika · 🟡 ada tetapi belum dicek visual / belum jalan sungguhan · ❌ belum

| Bidang | Status |
|---|---|
| **Danau Serene** (bawaan): pegunungan salju, pinus, pondok panggung, air terjun, perahu layar, ikan terlihat, air jernih + kaustik | ✅ dilihat lewat render SwiftShader · 🟡 HP sungguhan |
| **HUD Danau Serene** (potret 3D, koin/permata, Quest Harian, Tas/Toko/Menu, peta mini bulat, jam, joystick, obrolan, hotbar, Umpan/Tarik) | ✅ dicek di 3 ukuran layar |
| Danau Keramba: keramba, 7 pondok, dermaga, 3 titian, rakit rumput, halaman (gapura, loket, Warung), lampu | ✅/🟡 |
| **4 lokasi**: Danau (Lv1), Sungai Deras (Lv5: jembatan gantung, batu besar), Pantai Karang (Lv10: karang, dermaga nelayan), Laut Dalam (Lv15: kapal) | ✅ tata letak diuji · 🟡 3D |
| 16 jenis ikan, 7 umpan (termasuk cumi), 9 joran (termasuk surf & laut), 6 senar | ✅ |
| Air berpantulan, riak, buih, arus sungai, buih ombak; langit fisik + foto siang cerah; malam (bulan, bintang, lampu menyala); cuaca | ✅/🟡 |
| Hidup: burung, layang-layang, bangau mendarat, jukung, bebek, capung, ikan melompat | 🟡 |
| Berjalan (joystick, 3 kecepatan, otomatis), duduk, tabrakan pohon/batu, mancing di mana saja | ✅ |
| Memancing: lempar/bidik, sentak, adu tarik (tegangan, kombo, tarikan kuat, rem reel), angkat joran, serok 3 tahap, 360°, bagikan, keranjang kawat | ✅/🟡 |
| Kamera sorot + 5 posisi + tampak joran + tinggi + zoom | 🟡 |
| Karakter: 8 kulit, 6 baju memancing (jersey UV, kamo, ventilasi, rompi 3D, jaket), aksen, buff, kargo, topi & kacamata terukur, 5 avatar | ✅/🟡 |
| Toko dengan bilah perbandingan & pratinjau 3D joran; Warung | ✅/🟡 |
| Turnamen harian/mingguan, peringkat, album, akuarium 3D, pasar, klub + obrolan klub, obrolan global | ✅ |
| Misi harian, hadiah harian beruntun 7 hari, 17 lencana, profil | ✅ |
| Acara musiman (pita HUD, papan acara, pengaturan admin) | ✅ |
| Panel developer/admin: peluang, editor ikan (data & warna), acara, ekonomi, pengumuman, latar foto, stok, beri koin, log | ✅ |
| Suara alam per lokasi & waktu + musik latar generatif | ✅ jalan tanpa galat · 🟡 belum didengar |
| Akun: daftar, masuk, PIN, tamu→akun, lupa sandi (email), ganti sandi, hapus akun | ✅ |
| Server: semua rute di atas, WebSocket ruang, MySQL, beli koin (Google Play), website /papan | ✅ diuji logika · 🟡 belum pernah jalan dengan MySQL/Play sungguhan |
| Rilis: workflow AAB/APK bertanda tangan, skrip uji beban k6 | 🟡 belum dijalankan |
| Website PHP 8.3 (paket terpisah) | 🟡 belum dijalankan dengan PHP |

## 7. Fitur sistem lama (REKAP-FITUR) yang BELUM ada di v2

Urut prioritas (P1 = paling terasa bagi pemain):

**P1 — terasa langsung saat bermain**
1. **Model pemancing berlisensi** (Pria/Wanita). Sekarang avatar "jas" sementara. Lama: kepala dipahat, pria/wanita, wajah dari foto. Ini juga membuka fitur rambut.
2. **Rambut**: gaya (pendek, cepak, plontos, gondrong, keriting, poni & cepol) dan warna (hitam, cokelat, beruban, pirang). Butuh model dengan mesh rambut.
3. **Jenis karakter Wanita**.
4. ~~Keranjang besar~~ → selesai v0.9.5.
5. **Kartu tangkapan**: panjang (cm), **lama adu tarik**, **penggaris berat dibanding rekor**; spanduk sambaran *"Tarikan RINGAN/SEDANG/BERAT/MONSTER"* berwarna sesuai tingkat (cek ulang kelengkapannya).
6. ~~Perintah adu tarik, detak jantung, gerak lambat~~ → selesai v0.9.5.
7. ~~Saran saat spot sepi~~ → selesai v0.9.5 (kartu saran).
8. ~~Keranjang terlipat & penjaga warung~~ → selesai v0.9.5 (Serene juga punya kios).

**P2 — dunia & grafis**
9. ~~Pinus & pegunungan jauh melingkar~~ → selesai di Danau Serene (v0.9). Bisa ditambahkan juga ke lokasi lain.
10. **Silau matahari** (lens flare) dan **kabut pagi berlapis** di atas danau.
11. **Burung formasi V** bertulang (kepak + luncur).
12. **Efek sinematik lengkap** (gradasi film, vinyet, butiran). v2 baru bloom (mati bawaan).
13. **Latar foto lokasi**: opsi jenis foto (90°/180°/360°), tinggi, geser, sembunyikan bukit & pohon bawaan (v2 hanya unggah/hapus).
14. **Model ikan dari foto per jenis** + **editor tampilan ikan dari foto** (unggah, hapus latar otomatis) + foto ikan di kartu tangkapan. v2: satu model barramundi diwarnai per jenis; editor hanya data & warna.
15. Baju lama yang belum ada: ~~hoodie~~ (v0.9, masih di atas model jas), **sweter rajut, jaket puffer, rompi puffer**, warna **kaos dalam/lengan**, **celana pendek**, **sandal jepit** & **sepatu bot** berbentuk (v2 alas kaki hanya warna), **kumis**.

**P3 — sistem & akun**
16. **Masuk dengan Google** & **nomor HP (OTP)**. Butuh Google Client ID & penyedia SMS.
17. ~~Mode luring~~ → selesai v0.9.3.
18. **Verifikasi lokasi GPS** untuk membuka lokasi tertentu (+ pengaturan admin koordinat/radius).
19. Layar menu lama: splash, layar pilihan masuk terpisah, **pilih nama untuk tamu**, menu utama berisi Karakter/Peta/Profil/Tas.
20. ~~Tes koneksi server~~ → selesai v0.9.5.
21. Panel admin lama: **harga & sembunyikan item karakter**, **alat uji** (beri koin, buka semua item, kunci ulang, isi umpan, kosongkan keranjang, atur jam dunia).
22. **Latar akuarium** (tema / unggah foto); pasar lama: 16 barang, diganti tiap 3 jam, 18% langka (v2: 8 barang, 3 hari).
23. **Penunjuk FPS** & anggaran gambar/segitiga, penjaga agar tidak macet (`safeReset`), lampu titik per tingkat grafis, pantulan tiap 2 gambar di Sedang.
24. Dasbor admin web untuk server game (v2: panel di dalam game + website PHP untuk kompetisi & pengumuman).

## 8. Langkah berikutnya yang disarankan

0. **Grafis dunia P2** (bagian 7 butir 10–12): silau matahari (aset `6-efek/lensflare` di paket aset-2), kabut pagi berlapis, burung formasi V, efek sinematik (gradasi, vinyet, butiran) untuk tingkat Tinggi.
0b. Pemilik memutuskan angka bawaan **mancing otomatis** (panel admin → 🤖 Otomatis) dan kebijakan **main luring** (v0.9.3).

1. **Cek di HP pengguna**: Danau Serene (kelancaran FPS, panas, warna langit siang/malam), HUD di layar HP, potret pemain. Lalu 4 lokasi lain, joran/pelampung baru, pakaian (rompi/jaket), langit siang, pose pamer ikan, efek air, suara. Perbaiki berdasarkan tangkapan layar.
2. Kerjakan **P1** di bagian 7 (butir 1–3 butuh berkas model berlisensi dari pengguna).
3. **Pasang server** di Hostinger/VPS: MySQL (`server/database/schema.sql`), `ADMIN_TOKEN`, SMTP, lalu uji akun, pembelian, k6.
4. **Website CI4** (`2-website-ci4/`): pasang sesuai README-nya (Hostinger), impor `database/schema-web.sql`, buat superadmin + 2FA, hubungkan ke server game (`ADMIN_TOKEN`), uji di MySQL sungguhan.
5. **Rilis**: kunci tanda tangan + GitHub Secrets → workflow *Rilis Android* → Play Console (Billing, hapus akun, kebijakan privasi).

# REKAP FITUR LENGKAP — PAUNJUNAN (Mancing Real)

> Dokumen ini merangkum **semua fitur yang sudah ada** di proyek PAUNJUNAN per 26 September 2026.
> Disusun dari pembacaan langsung kode sumber (bukan dari ingatan), supaya bisa dipakai manusia
> maupun AI lain untuk memahami, melanjutkan, atau memperbaiki proyek ini.
>
> Bahasa antarmuka game: **Bahasa Indonesia**. Nama variabel dan fungsi di kode umumnya campuran Inggris dan Indonesia.

---

## 0. Cara membaca dokumen ini

**Status fitur:**

| Tanda | Arti |
|---|---|
| ✅ | Berfungsi di prototipe (data disimpan di perangkat pemain / `localStorage`) |
| 🔌 | Sudah tersambung ke server PHP sungguhan |
| 🧪 | Disimulasikan di perangkat (belum memakai server, misalnya pemain lain dan obrolan) |
| 🛠️ | Kode server sudah ada, tetapi prototipe belum memanggilnya |
| ⏳ | Belum dibuat |

**Istilah kode:** nama dalam `huruf mono` adalah nama fungsi, variabel, atau ID elemen HTML di kode, supaya AI bisa langsung mencarinya.

---

## 1. Gambaran umum proyek

**PAUNJUNAN** adalah game memancing 3D realistis bertema danau keramba apung khas Indonesia, untuk Android, iOS, dan web, ditambah website papan peringkat. Pengembang (admin) mengatur spot, stok ikan, peluang ikan, harga, dan lokasi.

### 1.1 Tiga bagian proyek

| Bagian | Teknologi | Berkas | Alamat produksi |
|---|---|---|---|
| **Game (prototipe)** | HTML + JavaScript + Three.js r128 (WebGL), satu berkas | `mancing-real-3d.html` (±7.900 baris kode) | `https://main.paunjunan.com` |
| **Server game (API)** | PHP 8.3 + MySQL (PDO), tanpa framework | `mancing-real-server/` | `https://api.paunjunan.com/api` |
| **Website peringkat** | PHP 8.3 + MySQL, tanpa framework | `paunjunan/` (paket `paunjunan-web.zip`) | `https://peringkat.paunjunan.com` |

Ketiganya memakai **satu database MySQL yang sama**.

### 1.2 Rencana platform
- **Jalur yang dipilih: tetap web** (bukan Unity/Godot). Rencana rilis Android lewat **Capacitor** ke Google Play (belum dikerjakan ⏳).
- **Hosting:** Hostinger **Business Web Hosting** (hPanel, LiteSpeed, PHP 8.3, 2 CPU, 3 GB RAM, server di Belanda). Domain: **paunjunan.com**.
- Panduan pemasangan: `PANDUAN-INSTALASI.md` dan `Panduan-Instalasi-PAUNJUNAN.pdf`.

### 1.3 Penyimpanan data di prototipe
Semua data lokal disimpan lewat objek `store` (`localStorage` dengan JSON), kunci berawalan **`mr_`**. Contoh: `mr_coins`, `mr_look`, `mr_owned`, `mr_basket`, `mr_spots`, `mr_profile`, `mr_tier`, `mr_server`, `mr_token`.

---

## 2. Dunia 3D dan lingkungan

### 2.1 Lokasi utama: Danau Keramba ✅
- Danau dengan **keramba apung** (jaring ikan di rangka kayu, drum biru pelampung, 92 pelampung oranye, tiang), **7 pondok** di atas keramba (`KJ_HUTS`), dan **dermaga kayu** memanjang.
- Baris keramba: `KJ_ROWS = [-12, -17.5, -23, -28.5, -34, -39.5]`.
- **Tiga titian apung** (papan bambu + drum + tali pegangan) dari dermaga ke keramba: `KJ_BRIDGES = [-21, 0, 21]`.
- **Rakit rumput** memanjang dengan batang bambu di depannya.
- **Tiga spot memancing** (`DEFAULT_SPOTS`, `SPOT_META`):

| Spot | Nama | Keterangan | Kedalaman | Keramaian |
|---|---|---|---|---|
| A1 | Dermaga Kayu A1 | Air tenang, cocok untuk pemula | 2–3 m | 1 orang |
| B3 | Keramba Apung B3 | Di antara keramba, arus tenang dan dalam | 6–8 m | 4 orang |
| C2 | Tepi Rumput C2 | Dangkal di tepi rumput, cocok untuk predator | 1–2 m | 1 orang |

- Setiap spot punya **stok ikan per jenis** yang berkurang saat ditangkap (bisa direset admin).

### 2.2 Pintu masuk lokasi ✅ (`updateEntrance`, `enterLocation`)
- Pemain mulai di **halaman darat** dengan **gapura**, **loket tiket**, dan **lampu dermaga**, lalu berjalan ke dermaga.
- Lembar **"Selamat datang di Danau Keramba"** (`welcomeSheet`): *Jalan ke spot terakhir*, *Pilih spot di peta*, atau *Jelajah sendiri*.
- Belum ada tabrakan dengan bangunan gapura/loket ⏳.

### 2.3 Medan dan pegunungan ✅
- Medan 1000×1000 m, 200×200 segmen, dibentuk derau berlapis (`fbm`) dan punggungan (`ridged`).
- Bentuk danau dari super-elips membulat + derau (`lakeD`), tinggi bukit (`hillH`) naik bertahap menjauhi danau.
- Warna per titik: lumpur tepi air, rawa, hutan, tebing batu di lereng curam, semak dataran tinggi, dengan tekstur butiran.
- **Pegunungan jauh** melingkar (radius 560–820 m) dengan shader kabut sendiri yang mengikuti cuaca dan waktu (`FAR_MTN`).

### 2.4 Pepohonan ✅
- **Pohon rindang tropis**: batang menirus → 4 dahan utama → cabang → ranting, gugus daun tumbuh di ujung ranting (`woodSeg`, `addCard`).
- **Kelapa** di tepi air dengan pelepah bertekstur.
- **Pinus** di dataran tinggi: 8 tingkat dahan, daun jarum.
- Semua tekstur dibuat oleh kode: `BARK_TEX`, `LEAF_TEX`, `NEEDLE_TEX`, `FROND_TEX`.
- Hingga 700 pohon rindang (tergantung tingkat grafis), memakai `InstancedMesh`.

### 2.5 Air ✅
- **Air berpantulan** (`THREE.Water`, `waterR`) di grafis tinggi; air sederhana di grafis hemat.
- Gelombang (`waveH`), **riak** (`ripple`), **cipratan** 3D (`doSplash`): tetesan (`WS.drops`), mahkota cipratan (`WS.crowns`), kabut air (`WS.mists`), tetesan air dari kail/ikan (`updateDrips`).

### 2.6 Langit, waktu, dan cuaca ✅ (`updateEnv`)
- **Waktu dunia** berjalan: mode nyata (`timeMode: 'real'`) atau dipercepat (`timeSpeed`). Jam tampil di bar atas, contoh: *"Siang 12.30 · Cerah 32°C"* (bagian hari + cuaca + perkiraan suhu).
- **Pencahayaan realistis** mengikuti ketinggian matahari: pagi keemasan, siang putih terang (jam 10–14), sore jingga, malam gelap dengan bulan.
- Langit biru pekat siang, cakrawala putih-biru, kabut menipis siang hari.
- **Bintang** (700) dan **bulan** di malam hari, **silau matahari** saat kamera menghadap matahari.
- **Cuaca** (`WEATHER`), yang juga mengalikan peluang ikan menyambar:

| Cuaca | Pengali peluang | Kabut | Angin | Hujan |
|---|---|---|---|---|
| Cerah | 1,0× | tipis | 1,0 | tidak |
| Berkabut | 1,15× | tebal | 0,7 | tidak |
| Hujan | 1,4× | sedang | 2,0 | ya (garis hujan + riak) |

- **Kabut pagi** berlapis di atas danau (`mists`).

### 2.7 Danau yang hidup ✅
- **Burung** bertulang dengan sayap dua ruas, kepakan dan luncuran nyata (`makeBird`, `flapBird`), terbang dalam **formasi V** (`flocks`).
- **Burung layang-layang** menyambar rendah di atas air (`swallows`).
- **Bangau/kuntul** berdiri di air, lalu terbang dan mendarat kembali (`herons`, `updateHerons`).
- **Perahu jukung** melintas dengan pendayung yang mendayung (`boat`).
- **Ikan liar melompat** di kejauhan (`spawnWildJump`).
- **Bebek berenang**, **teratai**, **ekor kucing** (tanaman), **capung**, **kunang-kunang** malam (`updateLakeLife`).
- **Lampu keramba** menyala otomatis saat malam (bohlam + pendar).
- **Rumput** (11.000 helai, bergoyang tertiup angin lewat shader) dan **alang-alang** (1.400).

### 2.8 Latar lokasi dari foto (admin) ✅ (`SBG`, `sceneBgApply`)
- Admin/developer bisa **mengunggah foto pemandangan** yang dipasang melingkar 360° di cakrawala.
- Pengaturan: jenis foto (90°/180°/360°, panorama lebar otomatis 360°), tinggi, geser naik/turun, pilihan menyembunyikan bukit & pohon bawaan.
- Warna foto mengikuti waktu dan cuaca.

---

## 3. Karakter pemain

### 3.1 Model manusia 3D ✅ (`buildHuman`)
- **Kepala dipahat dari satu permukaan** (`sculptHead`): tulang alis, rongga mata, hidung, bibir, dagu, tulang pipi, rahang (lebih tegas pada pria).
- **Mata**: bola mata mengilap dengan iris bertekstur, kelopak atas/bawah, bulu mata, alis mengikuti lengkung dahi; telinga.
- **Badan**: penampang super-elips (bahu lebar, dada, pinggang, pinggul), **bahu menyatu halus** dengan lengan (`fixSeam`), profil berbeda pria/wanita.
- **Lengan dan tangan** dengan jari; **kaki anatomis** (`footShape`) dengan jari kaki.
- **Pakaian** menempel di badan: kerah, kancing, saku, ritsleting, tudung hoodie, kerah tinggi puffer, dan sebagainya.
- **Wajah dari foto referensi** (`FACE_PHOTOS.realis1`): foto diproyeksikan ke wajah model; mata/alis 3D disembunyikan saat memakai wajah foto.

### 3.2 Kustomisasi karakter ✅ (`CATALOG`, `CAT_TABS`, `openChar`, `renderChar`)
Tab: **Avatar, Tubuh, Rambut, Wajah, Topi, Baju, Celana, Alas kaki.** Item gratis atau berbayar koin (`priceOf`, admin bisa mengubah harga lewat `priceOv` dan menyembunyikan item lewat `hiddenItems`).

| Kategori | Pilihan (harga koin) |
|---|---|
| Jenis karakter | Pria, Wanita |
| Warna kulit | Sawo matang, Kuning langsat, Terang, Gelap |
| Gaya rambut | Pendek, Cepak, Plontos, Gondrong (150), Keriting (200), Poni & cepol (250) |
| Warna rambut | Hitam, Cokelat, Beruban (100), Pirang (150) |
| Jenis wajah | Model 3D, Realistis · pria (dari foto) |
| Aksesori wajah | Polos, Kumis (80), Jenggot (120), Kacamata hitam (250) |
| Topi | Tanpa topi, Topi pet, Kupluk (120), Topi rimba (180), Caping (300) |
| Warna topi | Krem, Hijau, Hitam, Oranye (100), Merah (100) |
| Baju | Kaos, Kemeja panjang (200), Jaket (350), Rompi pancing (500), Hoodie (300), Sweter rajut (280), Jaket puffer (450), Rompi puffer (420), Jaket kulit (600) |
| Warna baju | 13 warna: Merah, Biru, Hijau, Abu-abu, Kuning (80), Hitam (80), Putih (120), Krem, Biru tua, Cokelat (80), Oranye (80), Hijau zaitun (80), Biru kobalt (100) |
| Warna kaos dalam/lengan | Abu-abu, Putih, Hitam, Oranye, Merah marun |
| Celana | Panjang, Pendek, Kargo (220) |
| Warna celana | Hitam, Jins (tekstur denim), Khaki, Hijau tua (80), Biru dongker, Merah marun (80), Jins gelap (60) |
| Alas kaki | Sandal jepit (tali Y di antara jari), Sepatu kets (150, sol putih + tali), Sepatu bot (280) |

- **Avatar siap pakai** (`avatarSVG`, `renderAvatarPicker`): kombinasi jadi yang bisa dipilih sekali ketuk.
- Beli dan simpan tampilan sekaligus (`buyAndSave`); karakter hanya bisa diganti saat duduk santai.

### 3.3 Gerakan dan posisi ✅
- **Duduk** di atas **kotak pancing** (tackle box, `stool`) di titik mana pun di dermaga.
- **Berdiri dan berjalan** (`standUp`, `walker`) dengan **joystick**; **tiga kecepatan**: Jalan 1,45 m/s, Jalan cepat 2,2 m/s, Lari 3,3 m/s (tombol berganti dengan ketuk, `setPace`).
- Percepatan/perlambatan halus, berputar tajam di tempat, kepala mendahului arah belok, badan condong di tikungan.
- Saat berjalan, pemain **membawa joran lengkap** (gagang gabus, reel, ring, senar, pelampung terkait, `ensureCarryRod`) dan **keranjang ikan terlipat** di tangan kiri.
- **Area yang bisa dipijak** (`walkable`): dermaga, titian apung, papan keramba. Pemain bisa **memancing di keramba atau di titian** (tombol berganti: *Mancing di keramba* / *Mancing di titian* / *Mancing di sini*) dan otomatis menghadap air terdekat (`faceNearestWater`).
- **Jalan otomatis** ke spot yang dipilih dari peta (`startAuto`, `walkTo`, `autoBox`).
- **Lembar pindah spot**: *Berdiri & jalan* (`standSheet`) dan saat tiba *Duduk & mulai memancing* / *Lihat peta* (`arriveSheet`). Tidak bisa pindah atau berdiri selama melempar/adu tarik.
- **Peta mini** saat berjalan (`drawMinimap`).

### 3.4 Interaksi sosial ✅/🧪
- **Sapa pemain lain** (`myEmote`, gelembung ucapan `say`, `bubbleTex`).
- **Ketuk pemain lain** untuk melihat kartunya (`tapWorld`, `openNpcCard`).
- **Pemain lain simulasi** 🧪 (`NPC_NAMES`: RajaNila, Andi.Pancing, MasGabus, SiPatin, Joran77, UdinKeramba): 5 pemancing duduk di keramba dengan joran dan pelampung sendiri (sesekali mengangkat joran), 1 pejalan yang mondar-mandir. Tampilan acak (`randLook`).
- **Penjaga warung** di kios.

---

## 4. Perlengkapan memancing (model 3D)

- **Joran** melengkung sesuai beban (fisika lentur `flex`), bergerak mengikuti tangan (`armIK`, `rodPitchUpdate`), geometri diperbarui di tempat tanpa dibangun ulang (`tubeVarInto`).
- **Gagang joran**: gabus bertekstur + EVA + dudukan reel + cincin logam.
- **7 ring penuntun senar** di sepanjang joran.
- **Reel spinning yang benar-benar berputar** (`REEL`): rotor, spool, bail, engkol dengan knop yang diputar tangan kiri saat menggulung.
- **Senar** melengkung realistis dari ujung joran ke pelampung (`line`, 26 titik).
- **Pelampung** berbentuk pir dua warna dengan antena (`floatG`).
- **Keranjang kawat berpelampung (keep net)** ✅ (`creel`, `placeCreel`, `updateCreel`): mengapung di air di kiri pemain, diikat tali ke dermaga, naik-turun ikut gelombang, ada percikan ikan di dalamnya.
- **Serok ikan** dengan animasi 3 tahap (`setNetPose`): dijulurkan ke depan ikan → menyelam ke bawah ikan → diangkat bersama ikan (1,15 detik). Gagang selalu menyambung ke tangan (diuji selisih 0 mm).

---

## 5. Ikan

### 5.1 Jenis ikan ✅ (`SPECIES`)

| Kode | Nama | Zona | Berat (kg) | Kekuatan | Keterangan |
|---|---|---|---|---|---|
| `nila` | Nila | dekat & jauh | 0,3–1,4 | 0,8 | Ikan umum keramba |
| `mujair` | Mujair | dekat | 0,1–0,5 | 0,55 | Kecil, mudah |
| `mas` | Ikan Mas | jauh | 0,6–3,5 | 1,1 | |
| `patin` | Patin | jauh | 1,0–6,0 | 1,45 | Kuat |
| `gabus` | Gabus | dekat | 0,4–2,5 | 1,2 | Predator |
| `baung` | Baung | jauh | 0,6–5,5 | 1,35 | Ikan besar |
| `toman` | Toman | jauh | 2,5–16 | 1,95 | Predator monster, paling kuat |

- **Semua ikan bisa menyambar kapan saja**; jam tidak memengaruhi peluang (`pref()` selalu 1).
- **Zona**: *dekat* (lemparan pendek) dan *jauh* (lemparan jauh).

### 5.2 Peluang dan ukuran ikan (diatur developer) ✅ (`fishRates`, `SIZE_TIERS`)
- Setiap jenis punya **pengali peluang** (`rate`) dan **bobot 4 tingkat ukuran**, bawaan `[55, 30, 12, 3]` persen:

| Tingkat | Rentang berat | Tarikan | Warna |
|---|---|---|---|
| Kecil | 0–33% dari rentang jenis | RINGAN | hijau |
| Sedang | 33–66% | SEDANG | kuning |
| Besar | 66–90% | BERAT | oranye |
| Monster | 90–100% | MONSTER | merah |

- Tombol admin **"Mode event: ikan besar"** mengubah bobot menjadi `[30, 30, 25, 15]`; **"Kembalikan bawaan"** mengembalikan.
- Rumus peluang jenis: **stok spot × pengali cuaca × pengali umpan × pengali jenis** (di prototipe dan di server `spot_rates()` sama).

### 5.3 Model ikan 3D ✅ (`buildFishModel`, `fishShader`, `fishAnim`)
- **Model dari foto referensi** (`FISH_REF`): nila, gabus, toman, dan lainnya. Foto menjadi kulit model 3D.
- Bentuk badan, **sisik basah mengilap**, sirip bertekstur (`finTex`), **liukan badan** saat berenang/melawan, tetesan air.
- **Editor tampilan ikan** (admin) ✅ (`openFishEd`, `feSheet`): unggah foto, **hapus latar otomatis** (`cutoutFish`, dengan kepekaan yang bisa diatur), tandai letak mata, balik arah, atur ketebalan badan, garis tengah badan, dan ukuran di game, dengan pratinjau 3D.
- **Foto ikan dari admin** (`importPhoto`) untuk kartu tangkapan.

### 5.4 Perilaku ikan saat adu tarik ✅ (`FISH_ACT`)
*Kabur menjauh, Lari ke samping, Menyerbu ke arah Anda, Berenang zig-zag, Menyelam dalam, Diam sejenak, Lelah (berputar)*, ditambah **melompat** dan **menggeleng kepala**. Ikan punya stamina yang terkuras.

---

## 6. Mekanik memancing ✅ (bagian "Mekanik memancing")

### 6.1 Melempar (casting)
1. **Tahan tombol** untuk mengisi tenaga (`press`), **geser layar** untuk membidik, **lepas** untuk melempar (`release`, `startStroke`, `releaseLine`).
2. Pengukur lemparan (`updateGauge`) dengan label hasil (`releaseLabel`).
3. **Rem jari (feathering)** untuk menghentikan umpan di udara (`featherCast`): *"Senar direm dengan jari."*
4. Hasil pendaratan (`onLand`):
   - di air → memancing,
   - di dermaga → *"Kail jatuh di dermaga"*,
   - di rangka keramba → *"Kail tersangkut di rangka keramba"*,
   - di rakit rumput → *"Kail jatuh di rakit rumput"*.
5. Jarak lemparan dipengaruhi joran (`cast`).

### 6.2 Menunggu dan sambaran
- Pelampung **bergetar** (ikan mencicipi, `nibble`), lalu **tenggelam** (`bite`). Ketuk **Sentak** saat tenggelam.
- Terlalu cepat menyentak → *"Terlalu cepat! Ikannya kabur."*
- Spot sepi → saran pindah zona/jam/spot.
- **Momen menyambar**: kilatan layar, spanduk **"Tarikan RINGAN/SEDANG/BERAT/MONSTER!"** (`strikeBanner`) dengan suara dan getaran sesuai ukuran, ikan langsung melompat, kamera turun sejajar air.

### 6.3 Adu tarik (fight) (`startFight`, `fishTick`, `fightHud`)
- **Tahan untuk menggulung**, **lepas** saat tegangan merah supaya senar tidak putus.
- **Panel adu tarik** (`fightHud`): jarum tegangan setengah lingkaran dengan zona *kendur* (0–12%), *aman* (12–85%), *bahaya/putus* (85–100%), dan **zona emas** (45–75%); stamina ikan berwarna; jarak ikan dalam meter; aksi ikan saat ini; kekuatan kail (tipis/sedang/kuat); **persentase teknik**.
- **Satu perintah terpenting** di layar: *TAHAN UNTUK MENGGULUNG*, *LEPAS TOMBOL!*, *KENDURKAN REM ↓*, *JANGAN GULUNG!* (saat ikan melompat), *GULUNG CEPAT!*, *GULUNG! KAIL HAMPIR LEPAS*, dan sebagainya.
- **Rem reel (drag)** bisa diatur (`S.drag`).
- **Kekuatan maksimum** = kekuatan senar × kekuatan joran.
- Ikan bisa lari ke **rumput** (harus diangkat joran), kail bisa **lepas** kalau senar terlalu kendur.
- **Sensasi**: tepi layar memerah saat bahaya, **getaran HP makin rapat** saat tegang, **detak jantung** saat senar hampir putus, **senar berderit** (`fightFeel`).
- Ikan lepas → **kartu kegagalan** dengan penyebab (`showLossCard`, `lose`).

### 6.4 Keseruan adu tarik ✅ (`comboPop`, `powerPull`, `confetti`, `revealCatch`)
- **Kombo**: setiap 1,2 detik di zona emas → *"SEMPURNA!"* + angka tenaga melayang, penghitung kombo bertambah.
- **Jurus "Tarikan Kuat"**: meteran terisi 20% per kombo → tombol oranye berdenyut → **gerak lambat** + spanduk miring *"TARIKAN KUAT! Tenaga ikan terkuras"* + tenaga ikan −30%.
- **Momen dapat ikan**: kilatan + nada, **berat berhitung naik**, **bintang menyala satu per satu**, penggaris berat dibanding rekor, **konfeti** (kertas berfisika + kilau).

### 6.5 Menyerok dan hasil tangkapan (`caught`)
- Animasi serok 3 tahap, lalu **kartu tangkapan** (`card`): nama ikan, berat (kg), panjang (cm), lama adu tarik (detik), bintang, rincian.
- Pilihan: **Simpan ke keranjang**, **Lepas lagi**, **Lihat ikan dari dekat** (putar 360° dengan geser, cubit untuk zoom, `inspHud`), **Pajang di akuarium**, **Bagikan tangkapan**.
- Keranjang berkapasitas 10 ikan (20 dengan Keranjang besar).

### 6.6 Mode sambungan
- Status jaringan (`refreshNet`): *"Koneksi terputus. Memancing tetap jalan, tangkapan disimpan di perangkat."* / *"Tersambung lagi."*
- Rute server untuk sinkron luring sudah ada 🛠️ (`fishing/offline-sync`, `fishing/offline-grant`).

---

## 7. Umpan, joran, senar, dan perlengkapan

### 7.1 Umpan ✅ (`BAITS`, pengali lewat `baitMul`)

| Umpan | Harga / isi | Pengali unggulan | Catatan |
|---|---|---|---|
| Udang | 40 / 10 | nila 1,2 · baung 1,2 | Serba bisa |
| Cacing | 30 / 15 | mujair 1,3 · mas 1,25 · baung 1,35 | |
| Pelet | 25 / 20 | nila 1,45 · mas 1,3 | Gabus 0,2 · toman 0,1 |
| Lumut | 35 / 12 | mujair 1,45 · mas 1,4 | Pemakan tumbuhan |
| **Umpan Racik Serba Ikan** | 70 / 10 | **semua jenis 1×** | Lencana *"Semua ikan"*, termasuk jenis baru dari admin |
| Ikan kecil | 80 / 6 | toman 2,8 · gabus 2,3 · patin 1,35 | Umpan hidup predator |

- Ganti umpan hanya saat kail sudah diangkat.

### 7.2 Joran ✅ (`RODS`)

| Joran | Harga | Jarak lempar | Kekuatan | Catatan |
|---|---|---|---|---|
| Joran Pemula | 0 | 1,0 | 1,0 | Fiberglass 3 m |
| Joran Bambu Klasik | 250 | 0,9 | 1,12 | |
| Joran Karbon | 600 | 1,18 | 1,05 | |
| Joran Tegar | 900 | 1,02 | 1,3 | Untuk patin & gabus |
| Joran Predator Toman | 1.800 | 1,08 | 1,6 | Lencana *"Untuk toman"* |
| Joran Legenda Belida | pasar (±2.400) | 1,24 | 1,42 | Langka, hanya di pasar |
| Joran Bambu Emas | pasar (±1.600) | 1,1 | 1,3 | Langka, hanya di pasar |

### 7.3 Senar ✅ (`LINES`)
Senar 0,20 mm (gratis, kekuatan 100) · Senar 0,30 mm (200 koin, 125) · Senar PE kepang (450, 150) · **Senar PE8 Monster** (900, 190, untuk toman).

### 7.4 Perlengkapan ✅ (`GEAR`)
**Keranjang besar** (500 koin): 20 ikan. **Akuarium besar** (800 koin): 12 ikan.

### 7.5 Tempat belanja
- **Tas & toko** ✅ (`openShop`, tab `SHOP_TABS`): Keranjang, Umpan, Joran, Senar, Perlengkapan. Jual ikan dari keranjang.
- **Warung Pancing** di lokasi ✅ (`openWarung`, kios dekat dermaga): Perlengkapan saya, Beli joran, Beli senar, Beli umpan, Perlengkapan, Jual ikan, Pasar pemain, Ganti baju.
- **Perlengkapan saya** ✅ (`openGear`): memilih joran, senar, dan umpan yang dipakai.
- **Beli koin** (`coinSheet`, `openCoins`) 🧪: belum memakai Google Play Billing ⏳.

---

## 8. Kamera

- **Kamera sorot sinematik** ✅: mengikuti umpan saat dilempar, menyorot pelampung saat mendarat dan disambar, menyorot ikan saat adu tarik. Bisa dimatikan.
- **Dua mode kamera adu tarik** ✅ (tombol di bar atas & Pengaturan): **Dekat** (menyorot pelampung & ikan) atau **Tampak joran** (dari belakang pemancing searah senar, seluruh joran dan lengkungannya terlihat; jarak menyesuaikan ikan).
- **Ketinggian kamera** dari sejajar sampai pandangan atas; **perbesar/perkecil** (cubit, roda mouse, tombol + dan −); **kembali ke sudut pandang awal**; perkecil untuk melihat seluruh tubuh.
- **Efek sinematik** (grafis Tinggi): bloom, gradasi warna seperti film, vinyet, butiran film (`setupPost`, `GRADE_SHADER`).

---

## 9. Antarmuka dan layar

### 9.1 Layar menu (`menuUI`)
| ID | Layar | Isi |
|---|---|---|
| `scrSplash` | Pembuka | Logo |
| `scrLogin` | Pilihan masuk | Masuk, Daftar akun baru, Lanjutkan dengan Google, Main sebagai tamu, (Masuk cepat dengan PIN bila perangkat pernah dipakai) |
| `scrSignIn` | Masuk | Nama pengguna/email + kata sandi, lihat sandi, lupa kata sandi, Google |
| `scrSignUp` | Daftar | Nama pengguna, email, kata sandi (2×), PIN 6 angka (2×), persetujuan |
| `scrPin` | Masuk cepat PIN | Papan angka |
| `scrGSetup` | Lengkapi akun Google | Pilih nama + PIN |
| `scrPhone` | Masuk dengan nomor HP | Kirim kode, verifikasi (OTP) |
| `scrNick` | Pilih nama pemancing | Untuk tamu |
| `scrMenu` | Menu utama | Level & koin, **Mulai memancing** (spot · jam · cuaca), Karakter, Peta danau, Profil & rekor, Pengaturan, Tas & toko, Turnamen & album, Pasar, Akuarium, Klub |
| `scrProfile` | Profil | Nama, level, rekor |
| `scrSettings` | Pengaturan | Lihat bagian 9.3 |

### 9.2 Tombol di layar permainan (HUD)
Buka peta spot · Matikan suara · Kamera saat adu tarik · Perlengkapan saya · Warung Pancing · Obrolan global · Kembali ke menu · Ubah karakter · Panel developer · Ketinggian kamera · Perbesar/Perkecil · Kembali ke sudut pandang awal · Ganti/beli umpan · Buka keranjang ikan · Duduk/berdiri · Sapa pemain lain · Berdiri & jalan-jalan · Kecepatan jalan · Berhenti / Duduk di sini / Mancing di sini (saat berjalan).

### 9.3 Pengaturan (`renderSettings`)
Suara · Getaran · Grafis tinggi · **Tingkat grafis** (Otomatis/Hemat/Sedang/Tinggi) · **Batas FPS** (Otomatis/30/45/60) · **Server game** (alamat API + *Simpan & tes*) · **Tampilkan FPS** · Kamera saat adu tarik (Dekat/Tampak joran) · Kamera sorot · Efek sinematik · Layar mendatar (minta HP diputar) · Tampilkan panduan lagi · Keluar.

### 9.4 Level pemain ✅ (`levelInfo`)
Level = ⌊√(XP ÷ 50)⌋ + 1. Batas XP level *n* = 50 × (*n*−1)².

### 9.5 Panduan interaktif ✅ (`startCoach`)
Langkah demi langkah saat pertama memancing: tahan untuk tenaga, geser membidik, tunggu pelampung, sentak, gulung, lepas saat merah, ubah karakter, berdiri & jalan, zoom.

### 9.6 Lain-lain
- **Notifikasi singkat** (`toast`), **orientasi layar** (`checkOrientation`), **audio buatan kode** tanpa berkas (`initAudio`: gemercik, reel, kicau burung, katak, dengung, detak jantung, derit senar).
- **Kotak kesalahan merah** (`errBox`) menampilkan pesan dan baris kesalahan untuk dikirim ke pengembang.

---

## 10. Peta dan lokasi

- **Peta danau lengkap** ✅ (`openMap`, `drawBigMap`): spot dengan aktivitasnya, posisi Anda, pemain lain, rumput, titian (jalur cokelat); zoom, **Jalan ke sini**, **Ganti lokasi**.
- **Pilih lokasi memancing (dunia)** ✅ (`openLocations`, `drawWorldArt`): kartu lokasi dengan ilustrasi. Hanya Danau Keramba yang bisa dimainkan; **Sungai Deras, Pantai Karang, Laut Dalam** masih kartu (*"Lokasi ini sedang disiapkan developer"*) ⏳.
- **Verifikasi lokasi GPS** ✅ (`getPosition`, `haversine`, `geoSheet`): lokasi tertentu harus dibuka dengan berada di dekat koordinat aslinya. Admin mengatur koordinat & radius (`renderGeoAdmin`), bisa menghapus riwayat verifikasi (uji coba). Server: `locations/verify` 🛠️. Deteksi lokasi palsu (mock location / Play Integrity) belum ⏳.

---

## 11. Fitur sosial dan ekonomi

### 11.1 Turnamen, peringkat, dan album ✅ (`openEvents`, tab: Turnamen / Peringkat / Album ikan)
- **Turnamen harian** (daftar dulu, tangkapan sesudahnya dihitung, rekor harian, hadiah di akhir hari, `checkTournamentRollover`).
- **Turnamen mingguan "Raja Nila"**.
- **Papan peringkat** dengan **pesaing simulasi** 🧪 (`rivalDaily`, `rivalWeek`, `rivalLevel`).
- **Album ikan**: koleksi jenis yang pernah didapat dan rekornya (`albumDetail`).
- Server: `tournaments`, `tournaments/join`, `tournaments/claim`, `leaderboard`, `album` 🛠️.

### 11.2 Pasar antarpemain ✅/🧪 (`openMarket`)
- Jual beli joran & perlengkapan antarpemancing: lapak berisi 16 barang (diperbarui, barang lama hilang setelah 3 jam), **18% peluang barang langka**, harga bervariasi.
- Pasang barang sendiri (harga minimal 5 koin), tarik kembali ke tas, beli dari penjual. Penjual lain disimulasikan 🧪.

### 11.3 Akuarium pribadi ✅ (`openAquarium`)
- Ruang akuarium 3D terpisah dengan ikan hasil tangkapan yang berenang.
- Kapasitas 6 ikan (12 dengan Akuarium besar), **nilai koleksi**.
- **Tiket pengunjung**: bonus koin = 10 + (25 per ikan monster, 10 per ikan besar, 3 per ikan lain) (`aqVisitBonus`).
- **Latar akuarium**: tema bawaan atau **unggah foto sendiri**.

### 11.4 Klub (guild) ✅/🧪 (`openClub`)
- Buat klub (nama 3–24 karakter, singkatan 2–4 huruf, ikon: kail/ikan/ombak/jangkar/mahkota), gabung (permintaan diterima otomatis), keluar.
- **Target mingguan** total kg klub; tangkapan anggota menambah kg (`clubOnCatch`); **hadiah klub +300 koin**.
- Obrolan klub, daftar anggota. Klub lain dan anggota disimulasikan 🧪.

### 11.5 Obrolan global ✅/🧪 (`openChat`)
- Kata kasar **disensor**, tautan dan nomor telepon **dihapus otomatis** (`cleanChat`), maksimal 160 karakter.
- **Batas kirim** (tunggu sebentar, tolak pesan ganda), **laporkan pesan** ke admin, lencana pesan baru.
- Pesan pemain lain disimulasikan 🧪 (`gcSimTick`). Server: `chat/list`, `chat/send` 🛠️.

---

## 12. Akun dan login

### 12.1 Di prototipe
| Cara masuk | Mode lokal ✅ | Mode server 🔌 |
|---|---|---|
| Daftar (nama pengguna, email, kata sandi, PIN) | ✅ (sandi & PIN di-hash di perangkat) | 🔌 `auth/register` |
| Masuk (nama pengguna/email + kata sandi) | ✅ | 🔌 `auth/login` |
| Masuk cepat PIN (perangkat yang pernah dipakai) | ✅ | 🔌 `auth/pin-login` (token perangkat) |
| Main sebagai tamu | ✅ | 🔌 `auth/guest` |
| Google | 🧪 jendela simulasi | ⏳ butuh Google Client ID |
| Nomor HP (OTP) | 🧪 | 🛠️ `auth/otp-request`, `auth/otp-verify` (pengiriman SMS masih log) |
| Lupa kata sandi | 🧪 | 🛠️ `auth/forgot`, `auth/reset` (butuh pengaturan email) |

- Semua alur login sudah diuji otomatis di browser (Playwright), termasuk terhadap server tiruan dengan CORS.

### 12.2 Sambungan ke server 🔌 (`SERVER`, `api()`)
- Pengaturan **Server game**: kosong = mode lokal. Game yang dibuka dari **paunjunan.com otomatis** memakai `https://api.paunjunan.com/api` (`AUTO_SERVER`).
- Token dikirim lewat header `X-Auth-Token`; batas waktu 12 detik; pesan kesalahan yang jelas (server mati, CORS, jawaban tidak valid).
- **Tes koneksi**: *"Terhubung ✓ · 32 ms · 3 spot · cuaca …"*.
- **Belum tersambung ke server** ⏳: memancing (lempar/sambar/dapat), koin, inventaris, toko, pasar, akuarium, klub, turnamen, obrolan. Semuanya sudah punya rute server, tetapi prototipe masih memakai data lokal.

---

## 13. Panel developer / admin di dalam game ✅ (`devSheet`)

- **Foto latar lokasi** (unggah, jenis, tinggi, geser, sembunyikan bukit & pohon).
- **Peluang ikan**: pengali per jenis dan bobot 4 tingkat ukuran, *Mode event: ikan besar*, *Kembalikan bawaan*.
- **Verifikasi lokasi GPS**: koordinat, radius, hapus riwayat verifikasi.
- **Harga & item karakter**: ubah harga, sembunyikan item.
- **Editor tampilan ikan** (foto & bentuk 3D).
- **Alat uji**: Beri 500 koin, Buka semua item, Kunci ulang, Grafis Tinggi/Hemat, Isi umpan (20), Kosongkan keranjang, Reset stok, atur jam dunia.

---

## 14. Performa dan anti-panas ✅

### 14.1 Tingkat grafis otomatis (`TIER`, `autoTier`, `applyTier`)
Dipilih dari memori & jumlah inti perangkat (HP dengan memori ≤4 GB atau ≤6 inti → Hemat).

| | Hemat | Sedang | Tinggi |
|---|---|---|---|
| Resolusi maksimum | 1× | 1,3× | 1,75× |
| Kepadatan pohon & rumput | 35% | 65% | 100% |
| Pantulan air & bayangan | mati | nyala | nyala |
| Efek sinematik | mati | mati | nyala |
| Burung, capung, kunang-kunang | mati | nyala | nyala |
| Hujan | 40% | 100% | 100% |
| Lampu titik | mati | mati | nyala |
| Pantulan air diperbarui | — | tiap 2 gambar | tiap gambar |
| Peta bayangan | — | 1024 | 2048 (lembut) |

### 14.2 Batas FPS (`targetFps`)
HP: 30 saat aktif, 24 saat menunggu ikan. Komputer: 60 aktif, 30 menunggu. Menu: 15. Menyentuh layar menaikkan ke batas aktif selama 1,5 detik. Target disesuaikan dengan ketukan layar (60/90/120 Hz).

### 14.3 Optimasi lain
- **Resolusi dinamis** (`perfTick`): turun sampai 60% bila perangkat tidak sanggup, naik lagi saat longgar.
- **Kartu grafis hemat daya** kecuali tingkat Tinggi; **tanpa antialias** di HP.
- **Peta bayangan** diperbarui tiap gambar saat bergerak, tiap gambar ke-3 saat diam.
- **Rumput tidak digambar di pantulan air**.
- **Cahaya lingkungan** dihitung 4× per detik; **peta mini** 6× per detik.
- **Tubuh manusia digabung per sendi & bahan** (`compactRig`): ±75 → ±40 bagian per tubuh.
- **Pemancing NPC duduk digabung penuh** (`mergeHuman`).
- **Penunjuk FPS** (kapsul di atas tengah, `fpsBox`): FPS, batas, resolusi, tingkat, perintah gambar & segitiga dibanding anggaran (`PERF_BUDGET`: Hemat 150/300 rb, Sedang 250/600 rb, Tinggi 450/1,5 jt), geometri, tekstur, memori. Warna hijau/kuning/oranye; ketuk untuk menyembunyikan rincian.

### 14.4 Penjaga agar tidak macet ✅ (`safeReset`, `snapWalkable`, `releaseInputs`)
Kalau terjadi kesalahan berulang atau pemain keluar area, permainan dipulihkan otomatis: *"Permainan dipulihkan otomatis. Silakan lanjutkan."*

---

## 15. Server game (PHP) — `mancing-real-server/`

### 15.1 Rute API (`/api/?r=...`)
| Kelompok | Rute |
|---|---|
| Akun | `auth/register`, `auth/login`, `auth/logout`, `auth/guest`, `auth/google`, `auth/pin-login`, `auth/pin-change`, `auth/otp-request`, `auth/otp-verify`, `auth/forgot`, `auth/reset` |
| Pemain | `me`, `me/name`, `me/look`, `me/avatar` |
| Dunia | `world`, `species`, `locations`, `locations/verify` |
| Memancing | `fishing/cast`, `fishing/hook`, `fishing/land`, `fishing/offline-sync`, `fishing/offline-grant` |
| Keranjang | `basket/sell`, `basket/release` |
| Toko | `shop/items`, `shop/buy`, `shop/equip` |
| Kompetisi | `tournaments`, `tournaments/join`, `tournaments/claim`, `leaderboard`, `album` |
| Obrolan | `chat/list`, `chat/send` |
| Admin | `admin/summary`, `admin/settings`, `admin/locations`, `admin/location`, `admin/location-grant`, `admin/location-backdrop`, `admin/location-backdrop-settings`, `admin/location-backdrop-delete`, `admin/spots`, `admin/spot`, `admin/stock`, `admin/items`, `admin/item`, `admin/species`, `admin/species-photo`, `admin/species-model`, `admin/species-model-delete`, `admin/users`, `admin/user-coins`, `admin/user-ban`, `admin/chat`, `admin/chat-delete`, `admin/chat-mute`, `admin/audit` |

### 15.2 Prinsip keamanan
- **Server menentukan hasil**: kapan ikan menyambar, jenis, berat, dan koin (`spot_rates()`), sehingga tidak bisa dicurangi dari HP.
- Kata sandi **bcrypt/Argon2id**, PIN di-hash, token sesi di-hash SHA-256, pembatas laju (`rate_limits`), log audit, **CORS daftar-putih** (`allowed_origins`), folder dikunci `.htaccess` (hanya `public/` terbuka).

### 15.3 Dasbor admin game (`public/admin/`, di `https://api.paunjunan.com/admin/`)
Tab: **Ringkasan** (waktu & cuaca dunia), **Lokasi** (tambah/ubah, foto latar), **Spot** (tambah/ubah, stok), **Item** (harga), **Jenis ikan** (model 3D dari foto), **Pemain** (koin, blokir), **Obrolan** (hapus, bisukan), **Audit**.

### 15.4 Tabel database
`users`, `user_devices`, `password_resets`, `sessions`, `otp_codes`, `species`, `locations`, `user_locations`, `spots`, `spot_stock`, `items`, `inventory`, `equipped`, `casts`, `hooks`, `basket`, `catches`, `offline_grants`, `tournaments`, `tournament_entries`, `chat_messages`, `settings`, `audit_log`, `rate_limits` — ditambah tabel website: `clubs`, `club_members`, `web_admins`, `web_news`, `web_tournament_meta`, `web_rate`, `web_audit`.

### 15.5 Pemasangan database
- **Instalasi baru**: impor `database/install-lengkap.sql` saja (sudah mencakup semua migrasi, tanpa `CREATE DATABASE`/`USE`, cocok untuk Hostinger), lalu `paunjunan-web.sql`.
- **Memperbarui server lama**: jalankan berkas di `database/migrations/` yang lebih baru (terakhir: `2026-09-27-umpan-racik.sql`).

---

## 16. Website peringkat PAUNJUNAN — `paunjunan/`

- **Halaman**: Beranda, **Terberat**, **Terbanyak**, **Kompetisi** (daftar & rincian), **Klub** (daftar & rincian), **Pemain** (profil), **Pengumuman** (daftar & isi).
- Tampilan: tema air malam dengan aksen emas/koral/toska, **podium juara**, medali, konfeti, angka berhitung naik, filter otomatis, responsif.
- **Panel admin** (alamat rahasia, bawaan `/ruang-kendali`): login Argon2id + **verifikasi dua langkah TOTP** (diuji 4 vektor resmi), kelola pengumuman dan info kompetisi, halaman keamanan.
- **Keamanan**: kueri berparameter (anti SQL injection), escape + CSP tanpa skrip inline (anti XSS), CSRF + cek Origin + SameSite=Strict, kuki `__Host-` terikat peramban, keluar otomatis 30 menit, batas 5 percobaan login, waktu respons seragam, log audit.
- **Cache berkas** untuk data peringkat; **Cron** `bin/cleanup.php` (pengganti `CREATE EVENT` yang tidak diizinkan di hosting bersama).
- Buat admin pertama: `php bin/create-admin.php namaadmin` (lewat SSH).

---

## 17. Yang belum dibuat ⏳ (ringkas)

1. **Menyambungkan memancing, koin, inventaris, toko, pasar, akuarium, klub, turnamen, dan obrolan** di prototipe ke server (rute server sudah ada).
2. **Login Google sungguhan** (butuh OAuth Client ID) dan **email lupa kata sandi** (butuh `mail_from`).
3. **OTP SMS sungguhan** (`sms_send()` masih menulis log).
4. **Aplikasi Android** (Capacitor) + **Google Play Billing** untuk beli koin + fitur hapus akun di aplikasi.
5. **Multipemain waktu nyata** (server WebSocket / Node.js) menggantikan pemain simulasi.
6. **Deteksi lokasi palsu** (mock location, Play Integrity).
7. **Tabrakan bangunan** (gapura, loket).
8. **Lokasi baru yang bisa dimainkan**: Sungai Deras, Pantai Karang, Laut Dalam.
9. **Kode PHP server & website belum pernah dijalankan** dengan PHP/MySQL sungguhan (baru diperiksa sintaks dan diuji dengan server tiruan).
10. Saran fitur tambahan dari analisa: misi harian/mingguan, hadiah masuk harian, pencapaian, ketahanan perlengkapan, notifikasi, analitik, pengaturan jarak jauh, pengaturan volume, pilihan bahasa, laporan crash.

---

## 18. Petunjuk untuk AI yang melanjutkan proyek

- **Game satu berkas**: semua HTML, CSS, dan JavaScript ada di `mancing-real-3d.html`. Bagian kode ditandai komentar `// ---------- Judul ----------` (53 bagian, lihat daftar di bawah). Selalu periksa **urutan definisi** (`const`/`let` sebelum dipakai saat halaman dimuat), karena kesalahan urutan pernah membuat seluruh game berhenti.
- **Data gambar besar** (foto ikan, wajah) tertanam sebagai `data:image/webp;base64,...` di `FISH_REF` dan `FACE_PHOTOS`. Abaikan saat membaca kode.
- **Uji sintaks**: ekstrak isi `<script>` lalu jalankan `node --check`.
- **Pola penyimpanan**: `store.get('mr_...', bawaan)` / `store.set(...)`.
- **Mode server** hanya aktif bila `SERVER.url` terisi; tulis fitur baru dengan dua jalur: `if (online()) { await api('rute', data) } else { logika lokal }`.
- **Anggaran performa**: pantau kapsul FPS; jangan melebihi `PERF_BUDGET` di tingkat Hemat. Objek yang jumlahnya bisa dikurangi didaftarkan ke `PERF.scalable`; objek kecil yang tidak perlu di pantulan air ke `PERF.reflHide`.
- **Bahasa**: semua teks untuk pemain dalam Bahasa Indonesia yang sederhana.

### Daftar bagian kode (urutan di berkas)
Data dunia · Three.js · Mode anti-panas · Tekstur prosedural · Medan pegunungan · Pepohonan · Panel adu tarik + sensasi · Peluang ikan · Latar lokasi dari foto · Efek sinematik · Danau yang hidup · Burung bertulang · Karakter manusia · Kepala dipahat · Gagang joran & ring · Reel berputar · Pemain lain (simulasi) · Model ikan dari foto · Model ikan hidup · Audio · UI · Mekanik memancing · Foto ikan dari admin · Foto ikan per jenis · Pindah spot · Ketinggian kamera · Layar karakter & toko · Avatar siap pakai · Langit & waktu · Joran & senar · Loop utama · Penjaga anti-macet · Kamera sorot sinematik · Berdiri/duduk & sapa · Panduan interaktif · Turnamen, peringkat, album · Verifikasi lokasi GPS · Pilih lokasi (dunia) · Peta danau · Tas & toko · Pasar · Akuarium pribadi · Klub · Obrolan global · Pintu masuk lokasi · Danau lebih hidup · Keranjang kawat · Keseruan adu tarik · Warung Pancing & Perlengkapan saya · Editor tampilan ikan · Layar pembuka/login/menu/profil/pengaturan · Sambungan ke server · Akun.

### Berkas-berkas proyek
| Berkas | Isi |
|---|---|
| `mancing-real-3d.html` | Game (prototipe) |
| `mancing-real-server.zip` | Server game PHP |
| `paunjunan-web.zip` | Website peringkat |
| `PAUNJUNAN-paket-lengkap.zip` | Ketiganya + panduan, siap unggah ke Hostinger |
| `PANDUAN-INSTALASI.md` / `Panduan-Instalasi-PAUNJUNAN.pdf` | Panduan pemasangan (teknis / mudah) |
| `REKAP-FITUR-PAUNJUNAN.md` | Dokumen ini |

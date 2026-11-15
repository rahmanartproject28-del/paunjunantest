# Rilis PAUNJUNAN ke Android (Google Play) — langkah demi langkah

Semua dibangun di **GitHub Actions**, jadi komputer Anda tidak perlu Android Studio. Urutannya:
**A. GitHub → B. APK uji → C. Kunci tanda tangan → D. Play Console → E. Beli koin → F. Uji tertutup → G. Produksi.**

---

## A. Taruh kode di GitHub
1. Buat repo **privat** di github.com (mis. `paunjunan-game`), unggah isi folder `1-game-dan-server/`.
2. Settings → Secrets and variables → Actions → **New repository secret**:
   - `GAME_SERVER_URL` = alamat server game, mis. `https://game.paunjunan.com` (tanpa garis miring di akhir)

## B. APK uji (sebelum Play Store)
- Setiap ada perubahan kode game di cabang `main`, workflow **Build Android** berjalan otomatis.
- Atau manual: tab **Actions → Build Android → Run workflow** (boleh isi alamat server).
- Selesai ±10 menit → buka hasilnya → **Artifacts → paunjunan-debug-apk** → unduh, ekstrak, kirim `.apk` ke HP → pasang (izinkan "Instal aplikasi tidak dikenal").
- APK uji tidak bisa membeli koin sungguhan (pembelian hanya jalan dari Play Store), selebihnya sama.

## C. Kunci tanda tangan (sekali seumur aplikasi)
Di komputer yang punya Java (atau minta tolong yang punya):
```
keytool -genkey -v -keystore paunjunan.jks -keyalg RSA -keysize 2048 -validity 10000 -alias paunjunan
base64 -w0 paunjunan.jks > paunjunan.jks.txt        # Windows: certutil -encode paunjunan.jks paunjunan.jks.txt
```
Tambahkan secret: `ANDROID_KEYSTORE_BASE64` (isi paunjunan.jks.txt), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (= `paunjunan`), `ANDROID_KEY_PASSWORD`.
**Simpan `paunjunan.jks` + sandinya di 2 tempat aman.** Dengan *Play App Signing* (langkah D) kunci ini hanya kunci unggah — bila hilang masih bisa diganti lewat dukungan Google, tapi merepotkan.

Lalu **Actions → Rilis Android → Run workflow**, isi nomor versi (`2`, `3`, … selalu naik) dan nama versi (`1.0.0`). Hasil: `.aab` (untuk Play Store) dan `.apk` bertanda tangan.

## D. Google Play Console
1. Daftar di <https://play.google.com/console> (biaya sekali US$ 25). Akun **pribadi** baru wajib uji tertutup dulu (langkah F); akun **organisasi** (butuh nomor D-U-N-S) tidak.
2. **Buat aplikasi** → nama *PAUNJUNAN*, bahasa Indonesia, Game, Gratis.
3. **Siapkan halaman toko** (Main store listing):
   - Ikon 512×512: `game/store-assets/play-icon-512.png`
   - Grafik fitur 1024×500: `game/store-assets/play-feature-1024x500.png`
   - Tangkapan layar HP mendatar: minimal 2 (disarankan 4–8) — ambil dari HP saat bermain
   - Deskripsi singkat (≤ 80 karakter), contoh: *Mancing santai di danau 3D, adu tarik seru, jadi juara pemancing!*
4. **Isi App content** (menu kiri bawah):
   | Bagian | Isi |
   |---|---|
   | Privacy policy | `https://DOMAIN-WEBSITE/kebijakan-privasi` |
   | Ads | Tidak ada iklan |
   | App access | Semua fitur bisa dicoba tanpa akun (mode tamu). Bila diminta, berikan akun uji. |
   | Content rating | Isi kuesioner IARC: game kasual, ada obrolan antar pemain & pembelian dalam aplikasi |
   | Target audience | 13+ (disarankan; di bawah 13 memicu aturan Families yang ketat) |
   | Data safety | lihat tabel di bawah |
   | Account deletion | `https://DOMAIN-WEBSITE/hapus-akun` |
   | Government app / Financial / Health | Tidak |
5. **Data safety** (sesuai kebijakan privasi di website):
   | Data | Dikumpulkan | Dibagikan | Wajib/opsional | Tujuan |
   |---|---|---|---|---|
   | Email | Ya | Tidak | Opsional (hanya bila membuat akun) | Pengelolaan akun |
   | Nama pengguna / ID pengguna | Ya | Tidak | Opsional | Pengelolaan akun, fungsi aplikasi |
   | Riwayat pembelian | Ya | Tidak | Opsional | Fungsi aplikasi, pencegahan penipuan |
   | Pesan dalam aplikasi (obrolan) | Ya (tidak disimpan) | Tidak | Opsional | Fungsi aplikasi |
   | Aktivitas aplikasi (data permainan) | Ya | Tidak | Wajib | Fungsi aplikasi |
   Dienkripsi saat dikirim: **Ya** (HTTPS). Pengguna bisa minta data dihapus: **Ya**.
6. **Setup → App integrity → Play App Signing**: biarkan Google mengelola kunci aplikasi (disarankan).

## E. Beli koin (Google Play Billing)
1. Play Console → **Monetize → Payments profile**: buat profil pembayaran (rekening untuk menerima uang).
2. **Monetize → Products → In-app products** → buat 4 produk dengan ID **persis**:
   `koin_500`, `koin_1200`, `koin_3000`, `koin_8000` (harga bebas; harga di Play yang tampil di aplikasi). Status: *Active*.
   (Produk baru bisa dibuat setelah AAB pertama diunggah ke salah satu jalur uji.)
3. **Server memeriksa pembelian** lewat Google Play Developer API:
   - Google Cloud Console → buat proyek → aktifkan **Google Play Android Developer API**
   - IAM → Service accounts → buat → **Keys → Add key → JSON** → unduh
   - Play Console → **Users and permissions → Invite new user** → email service account → izin *View financial data* + *Manage orders and subscriptions*
   - Di `.env` server game: `GOOGLE_PLAY_PACKAGE=com.paunjunan.mancing` dan `GOOGLE_SERVICE_ACCOUNT_JSON=/jalur/ke/file.json`
4. **Penguji pembayaran**: Play Console → Settings → **License testing** → tambahkan email Gmail penguji (pembelian mereka tidak ditagih).

Alur di aplikasi (sudah dibuat): beli → server memeriksa ke Google → koin masuk → pembelian di-*consume*. Bila jaringan putus setelah membayar, koin dipulihkan otomatis saat pemain masuk lagi. Satu pembelian tidak bisa ditukar dua kali.

## F. Uji tertutup (wajib untuk akun pribadi baru)
- **Testing → Closed testing → Create track** → unggah `.aab` → tambahkan daftar email penguji → kirim tautan undangan ke mereka.
- Syarat Google: **minimal 12 penguji yang tetap ikut 14 hari berturut-turut** dan benar-benar memakai aplikasi. Setelah itu **Apply for production** dan jawab pertanyaan tentang pengujian.
- Tips: ajak anggota komunitas mancing/teman; minta mereka bermain beberapa kali selama 2 minggu dan memberi masukan lewat Play.

## G. Produksi
**Production → Create new release** → pilih AAB terbaru → catatan rilis → **Review release → Start rollout**. Peninjauan biasanya beberapa hari.
Pembaruan berikutnya: naikkan nomor versi di workflow *Rilis Android* → unggah AAB baru.

---

## Daftar periksa sebelum rilis
- [ ] Server game jalan di HTTPS + MySQL (`paunjunan-database.sql`), `ADMIN_TOKEN` terisi
- [ ] Website jalan (halaman `/kebijakan-privasi` & `/hapus-akun` terbuka, email kontak benar di `.env`)
- [ ] `GAME_SERVER_URL` & 4 secret kunci di GitHub
- [ ] Produk `koin_*` aktif, service account terhubung, uji beli dengan akun *license tester*
- [ ] Coba di 2–3 HP berbeda (termasuk HP RAM 3–4 GB): FPS, panas, tombol Kembali, keluar-masuk aplikasi, putus-sambung internet
- [ ] Data `hapus-data-contoh.sql` sudah dijalankan bila sempat memakai data contoh

## Perilaku aplikasi Android (sudah dibuat)
- Layar penuh imersif (bilah status & navigasi tersembunyi, muncul sebentar bila digeser), layar tidak mati selama aplikasi terbuka, area poni dipakai dengan HUD menjauhi poni.
- **Tombol Kembali**: tutup panel → tutup kartu "ikan lepas" → (saat adu tarik/kartu tangkapan: diabaikan dengan pesan) → hentikan mancing otomatis / jalan otomatis → kembali ke menu utama → konfirmasi keluar.
- **Ditinggal** (pindah aplikasi, layar dikunci, telepon): suara berhenti, mancing otomatis berhenti dengan ringkasan; **dibuka lagi**: suara lanjut, sambungan server langsung disambung ulang, data pemain disegarkan bila ditinggal > 2 menit.
- Ikon adaptif (termasuk ikon bertema Android 13+), layar pembuka gelap tanpa kilatan putih.

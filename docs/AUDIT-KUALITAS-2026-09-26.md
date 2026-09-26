# Hasil testing kualitas ESC Siantan — 26 September 2026

> **Pembaruan:** Dokumen ini adalah hasil audit sebelum perbaikan. Perbaikan dan hasil pengujian ulang tercatat di [PERBAIKAN-KUALITAS-2026-09-26.md](PERBAIKAN-KUALITAS-2026-09-26.md).

**Keputusan: BELUM LOLOS.** [Pasti] Build berhasil, tetapi testing browser menemukan crash onboarding, validasi form yang terlambat/hilang, dan masalah aksesibilitas. Label “bebas AI slop” tidak bisa dijamin dengan ukuran objektif; keputusan ini didasarkan pada perilaku yang bisa direproduksi.

## Metode dan batas cakupan

- `npx vite build`: exit 0. Ada peringatan chunk >500 kB dan campuran impor statis/dinamis `pushService`. Bundle utama sekitar 1.08 MB sebelum gzip (289 kB gzip). Ini peringatan ukuran, bukan pengukuran kecepatan pengguna nyata.
- `npm run lint`: exit 1 karena konfigurasi ESLint tidak ditemukan. Tidak menghasilkan penilaian lint kode.
- Browser: Microsoft Edge/Chromium headless, localhost Vite pada port 4173; konfirmasi interaksi bermasalah pada preview hasil build port 4174.
- 80 kombinasi halaman publik: login, register, lupa password, kebijakan privasi, onboarding × ukuran 375×812, 390×844, 844×390, 1440×900 × tema light/dark × bahasa id/en. Pengukuran DOM tidak menemukan overflow horizontal pada kombinasi ini. Itu tidak membuktikan seluruh layout benar: onboarding tetap terpotong secara vertikal.
- Smoke test halaman internal memakai sesi dan data SIMULASI: Volunteer, PKS, Super Admin, lebar 375 px, kedua tema. Pengujian ini memeriksa render dengan data kosong/dummy, bukan autentikasi server atau otorisasi RLS.
- Semua request eksternal diblokir/disimulasikan. Tidak membuat akun, mengirim OTP, mengubah poin, atau menulis data jemaat production. Font web eksternal juga diblokir; tangkapan layar memakai fallback bila font tidak tersedia.
- Belum menguji perangkat Android/iOS fisik, kamera QR, push notification, pemasangan/offline PWA, transaksi lengkap, upload storage, dan otorisasi database production.

## Temuan terkonfirmasi

### 1. P1 — Klik ganda membuat onboarding crash

[Pasti] Buka onboarding, lanjut ke tahap ketiga, kemudian klik ganda **Lanjut →**. Halaman berubah menjadi **Terjadi kesalahan**. Mode development melaporkan `Cannot read properties of undefined (reading 'image')`. Masalah juga direproduksi pada preview build production lokal.

Penyebab: `next()` menjadwalkan beberapa timer tanpa mengunci transisi; dua increment dari indeks 2 membuat indeks menjadi 4, melewati empat tahap yang tersedia.

Sumber: `src/pages/OnboardingPage.jsx:134`–`140`; akses `slide.image` pada render. Perbaikan yang disarankan: kunci transisi termasuk jalur swipe, batasi indeks, dan bersihkan timer saat unmount. Uji ulang klik ganda serta kombinasi swipe/tombol.

Bukti: `onboarding-double-click.png`, `audit-production-interactions.json` di folder bukti.

### 2. P2 — Registrasi membiarkan data akun invalid maju

[Pasti] Pada langkah Akun, isi nama dummy, email `bukan-email`, HP berisi 12 digit, password `a`, konfirmasi `b`, lalu tekan Lanjut. Halaman tetap maju ke Data Diri/foto profil.

Sumber: `src/pages/auth/RegisterPage.jsx:175`–`178`. Pemeriksaan langkah pertama hanya mengecek nilai tidak kosong dan panjang nomor. Password baru dicek pada submit akhir. Input tidak berada dalam form yang menjalankan validasi email native saat Lanjut.

Dampak: pengguna diminta mengisi biodata/foto sebelum diberi tahu bahwa akun belum valid. Ini bukan bukti backend menerima email/password invalid; pengujian tidak membuat akun.

Perbaikan yang disarankan: tampilkan kesalahan email, kekuatan password, dan kecocokan konfirmasi sebelum pindah langkah, dengan pesan dekat field.

### 3. P2 — Tanda wajib tidak menjadi validasi HTML

[Pasti] Komponen `Input` mengambil prop `required`, tetapi tidak meneruskannya ke elemen `<input>`. Pola sama terdapat pada `Textarea` dan `Select`.

Bukti browser: email di Lupa Password bertanda bintang, tetapi `input.required === false`; klik Kirim Kode dengan email kosong menghasilkan satu request ke endpoint simulasi.

Sumber: `src/components/ui/index.jsx:28`, `:52`, `:76`; pemakaian `src/pages/auth/ForgotPasswordPage.jsx:104`.

Perbaikan yang disarankan: teruskan atribut `required` ke kontrol native dan pastikan validasi backend tetap ada. Audit ini hanya membuktikan perilaku klien, bukan respons endpoint production.

### 4. P2 — Kontrol form belum dapat diakses dengan baik

[Pasti] Klik label Email di Lupa Password tidak memfokuskan input. Label pada komponen bersama belum mempunyai `htmlFor` yang terhubung ke `id` input. Tombol tampilkan password login dilewati Tab karena `tabIndex={-1}`; pengujian menunjukkan fokus langsung pindah ke Ingat saya.

Pengukuran login lebar 375 px: ikon tampilkan password hanya sekitar 18×18 px; kontrol Ingat saya sekitar 20 px tinggi. Area ketuk ini sulit dipakai dibanding target 44×44 pada panduan UI proyek. Placeholder login juga menjadi satu-satunya petunjuk field.

Sumber: `src/components/ui/index.jsx:32`; `src/pages/auth/LoginPage.jsx:81`.

Perbaikan: label terhubung, tombol dapat difokuskan keyboard, area ketuk diperbesar tanpa harus memperbesar ikon, serta status error dapat diumumkan secara aksesibel.

### 5. P2 — Onboarding terpotong saat landscape

[Pasti] Pada 844×390, ilustrasi mulai di y=-16 dan bagian bawah kartu konten terpotong. Screenshot mengonfirmasi clipping; halaman dikunci `h-svh overflow-hidden`.

Sumber: `src/pages/OnboardingPage.jsx:157`. Perbaikan: konten dapat di-scroll pada viewport pendek dan ukuran ilustrasi/spacing menyesuaikan tinggi layar. Uji juga teks diperbesar dan tombol tetap terjangkau.

Bukti: `onboarding-landscape.png`.

### 6. P2 — Pesan poin tidak sesuai keadaan kosong

[Pasti untuk fixture] Dengan poin 0 dan daftar hadiah kosong, beranda menampilkan **Poin kamu cukup untuk semua hadiah!**. Ini terlihat pada kedua tema dengan data simulasi.

Sumber: `src/components/PointsProgressCard.jsx:17`–`30` dan cabang `target ? ... : ...` pada render. `target === null` bisa berarti tidak ada hadiah, request gagal, atau semua hadiah terjangkau; ketiganya diberi pesan sukses yang sama.

Perbaikan: bedakan kondisi kosong/gagal/semua hadiah terjangkau. Ini keputusan teks dan keadaan produk yang perlu disepakati sebelum mengubah perilaku.

### 7. P2 — Bahasa Inggris belum konsisten

[Pasti] Dengan `esc-lang=en`, halaman login/register berubah ke Inggris, tetapi kontrol onboarding seperti Lewati, Tahap, Fokus, dan Lanjut tetap Indonesia. Halaman kebijakan privasi juga tetap Indonesia. Konten roadmap dari admin bisa memang berbahasa Indonesia; kontrol statis tetap harus mengikuti locale menurut aturan proyek.

Sumber: `src/pages/OnboardingPage.jsx`, `src/pages/PrivacyPolicyPage.jsx`. ErrorBoundary juga berisi teks Indonesia tetap (dibaca dari kode).

Perbaikan: pindahkan teks antarmuka statis ke i18n id/en. Penerjemahan dokumen kebijakan perlu ditinjau pemilik dokumen; audit ini tidak menilai isi hukumnya.

### 8. P3 — Animasi dekoratif login mengabaikan reduced motion

[Pasti] Browser dengan `prefers-reduced-motion: reduce` masih menjalankan tiga animasi dekoratif tak terbatas: `floatY`, `floatX`, `floatY`. Terjadi juga pada preview build production.

Sumber: `src/pages/auth/LoginPage.jsx:43`–`45`; pengecualian reduced-motion di `src/index.css` hanya mencakup sejumlah kelas, bukan animation inline tersebut.

Perbaikan: berikan kelas khusus dan hentikan animasinya saat reduced motion. Ini masalah preferensi aksesibilitas yang terukur, terlepas dari selera visual.

## Penilaian “AI slop”

[Kemungkinan Besar] Kesan generik paling terlihat pada login: tiga blob bergerak, kartu kaca, emoji sapaan, dan efek shadow dipakai bersamaan. Pada beranda, banyak kartu berbayang dan warna ikon bersaing, sementara menu cepat berada di bawah area kosong Pengumuman yang tinggi. Ini penilaian desain berdasarkan screenshot dengan data dummy, bukan bukti bahwa desain dibuat AI; data berisi dapat mengubah prioritas visual.

Identitas oranye-merah, istilah gereja, dan pola navigasi nyata sudah ada. Prioritas perbaikan adalah crash, validasi, pesan yang jujur terhadap keadaan data, dan keterbacaan. Menghapus semua gradien atau mengganti brand tidak diperlukan untuk memperbaiki temuan tersebut.

## Yang berhasil pada pengujian

- Build selesai dan artefak PWA terbentuk.
- Login kosong diblokir validasi native; tampilkan/sembunyikan password bekerja dengan klik.
- Respons gagal login simulasi menampilkan pesan dan mengaktifkan kembali tombol.
- Link login ke register bekerja.
- Tanpa sesi, `/`, `/admin`, `/pks`, `/profil`, `/tugas`, `/scan` diarahkan ke login. Ini uji guard UI, bukan keamanan RLS.
- Pada 80 kombinasi publik tidak ditemukan error JavaScript selama pembukaan halaman biasa; crash baru muncul lewat skenario klik ganda.

## Reproduksibilitas dan bukti

Folder: `C:/Users/melvi/.codex/visualizations/2026/09/26/01a0dc62-27a2-7c41-a916-7bddcac816a5/`.

- `audit-browser.mjs` / `audit-browser.json`: matriks publik dan uji awal. Skrip awal salah menyebut tombol onboarding “Selanjutnya”, sehingga langkah terakhir timeout. Timeout ini kesalahan harness, bukan bug aplikasi; sudah digantikan pengujian terpisah dengan label “Lanjut →” yang benar.
- `audit-interactions.mjs` / `audit-interactions.json`: reproduksi interaksi pada dev server.
- `audit-production-interactions.mjs` / `audit-production-interactions.json`: konfirmasi pada preview hasil build.
- `audit-fixtures.mjs` / `audit-fixtures.json`: smoke test UI dengan sesi dan data dummy. Membutuhkan dev server lokal dan runtime Playwright sesuai path di skrip.
- Screenshot login, register, lupa password, onboarding, dan beranda simulasi tersedia di folder yang sama.

## Perubahan, tindak lanjut, dan tes manual

Audit ini menambah laporan ini dan bukti pengujian; tidak mengubah kode aplikasi, auth, database, atau production. Tidak ada migrasi, commit, push, atau deploy.

Saat audit berlangsung, `src/lib/i18n.js` dan `src/pages/user/PointsPage.jsx` menjadi modified oleh pekerjaan lain; audit ini tidak menulis kedua file tersebut. Temuan production lokal merujuk build yang dibuat dalam sesi ini, bukan klaim verifikasi setiap perubahan paralel setelah build.

Urutan penanganan: crash onboarding → validasi/form bersama → clipping & aksesibilitas → keadaan poin dan i18n → penyederhanaan dekorasi. Perubahan alur auth yang memengaruhi akun existing dan keputusan produk harus mengikuti konfirmasi operator sesuai AGENTS.md.

Tes manual berikutnya pada staging/akun testing: login tiap role sebenarnya; pembatasan halaman Admin; daftar + upload foto + approval; OTP melalui kanal nyata; scan QR; isi SOP; transaksi poin/persembahan; upload dokumen; dark mode di HP nyata; pemasangan/offline/push PWA. Kredensial testing dan lingkungan staging belum tersedia dalam sesi ini.

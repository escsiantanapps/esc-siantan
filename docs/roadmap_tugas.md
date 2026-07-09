# Daftar Tugas: 10 Fitur Baru & Pembaruan Sistem

- [ ] **Fase 1: Migrasi Database & Services**
  - [ ] Jalankan Migrasi v28 di database (tambah kolom users, classes, events, news, tabel komsel_sessions, katalog produk, penukaran, ibadah minggu, trigger NIJ otomatis)
  - [ ] Perbarui [usersService.js](file:///D:/PWA%20ESC%20Siantan/src/services/usersService.js) untuk mendukung kolom baru dan heartbeat kehadiran online.
  - [ ] Buat service baru [pointsService.js](file:///D:/PWA%20ESC%20Siantan/src/services/pointsService.js) untuk mengelola poin dan tiket penukaran.
  - [ ] Perbarui [contentService.js](file:///D:/PWA%20ESC%20Siantan/src/services/contentService.js) untuk mendukung media array (foto/video) dan sesi komsel.

- [ ] **Fase 2: Onboarding Dinamis (Roadmap Pemuridan)**
  - [ ] Modifikasi [OnboardingPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/OnboardingPage.jsx) untuk memuat data dari `app_settings` (JSON template) dengan fallback data visual burung, biji, tanaman, pohon.
  - [ ] Ubah logika tayangan onboarding di [LoginPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/auth/LoginPage.jsx) & [App.jsx](file:///D:/PWA%20ESC%20Siantan/src/App.jsx) berdasarkan `roadmap_show_count` dan `sessionStorage`.
  - [ ] Generate 4 gambar ilustrasi default menggunakan `generate_image` dan letakkan di `public/images/roadmap/`.

- [ ] **Fase 3: Kartu Jemaat PNG & Edit Profil Jemaat**
  - [ ] Tambahkan tampilan Kartu Jemaat (murni gambar PNG dari admin + indikator Expired 1 tahun) di [ProfilePage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/ProfilePage.jsx) dan [HomePage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/HomePage.jsx).
  - [ ] Tambahkan input 9 kolom biodata baru di [EditProfilePage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/EditProfilePage.jsx) dan logika pemberian 5 poin saat profil lengkap pertama kali.
  - [ ] Perbarui [AdminMemberDetailPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/admin/AdminMemberDetailPage.jsx) agar Super Admin dapat mengunggah file PNG Kartu Jemaat, mengisi NIJ, dan mengatur Tanggal Pembuatan.

- [ ] **Fase 4: Kelas & Event Kategori Status & WA Berdasarkan Gender**
  - [ ] Pisahkan Kelas & Event berdasarkan status (`Mulai`, `Sedang Berlangsung`, `Selesai`) di [ClassesPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/ClassesPage.jsx) & [EventsPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/EventsPage.jsx).
  - [ ] Di detail Kelas & Event, implementasikan WA admin berbasis gender jemaat (Laki-laki $\rightarrow$ Admin Laki-laki; Perempuan $\rightarrow$ Admin Perempuan).
  - [ ] Terintegrasi dengan pendaftaran Baptisan terikat dengan pendaftaran Kelas Baptisan di [BaptismPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/BaptismPage.jsx).

- [ ] **Fase 5: Pemisahan Media & Carousel Auto-Slide 10 Detik**
  - [ ] Perbarui halaman detail Kelas, Event, dan Informasi untuk memisahkan Foto & Video.
  - [ ] Section Foto: Carousel auto-slide setiap 10 detik.
  - [ ] Section Video: Pemutar video autoplay (muted) tanpa auto-slide.

- [ ] **Fase 6: Leaderboard & Penukaran Poin**
  - [ ] Tambahkan halaman / tab **Leaderboard Poin** (10 besar jemaat dengan poin terbanyak).
  - [ ] Buat halaman Katalog Penukaran Poin untuk Jemaat.
  - [ ] Buat halaman Admin untuk mengelola Produk Penukaran dan Tiket Penukaran (QR Code).
  - [ ] Perbarui [AttendanceScanPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/AttendanceScanPage.jsx) untuk memproses scan tiket produk (`ESC-REDEEM:<ticket_id>`) dan scan ibadah minggu (`ESC-SUNDAY:<date>`).

- [ ] **Fase 7: Rekonstruksi Absensi Komsel PKS**
  - [ ] Perbarui tab Absensi di [PKSDashboardPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/PKSDashboardPage.jsx) agar PKS dapat membuat Sesi Absensi dan memunculkan QR Code (`ESC-KOMSEL:<session_id>`).
  - [ ] Tambahkan handler scan Komsel di [AttendanceScanPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/user/AttendanceScanPage.jsx) agar jemaat dapat scan QR Komsel untuk masuk absensi dan mendapatkan 1 poin.

- [ ] **Fase 8: Re-branding SOP Rohani & Indikator Online/Offline**
  - [ ] Ubah label "Tugas" menjadi "SOP Rohani" di file terjemahan [i18n.js](file:///D:/PWA%20ESC%20Siantan/src/lib/i18n.js), [UserLayout.jsx](file:///D:/PWA%20ESC%20Siantan/src/layouts/UserLayout.jsx), and [AdminLayout.jsx](file:///D:/PWA%20ESC%20Siantan/src/layouts/AdminLayout.jsx).
  - [ ] Tambahkan heartbeat di [UserLayout.jsx](file:///D:/PWA%20ESC%20Siantan/src/layouts/UserLayout.jsx) untuk memperbarui `last_seen_at` user.
  - [ ] Tampilkan dot indikator online/offline (hijau/abu-abu) di [AdminMembersPage.jsx](file:///D:/PWA%20ESC%20Siantan/src/pages/admin/AdminMembersPage.jsx).

- [ ] **Fase 9: Verifikasi & Uji Coba**
  - [ ] Jalankan `npx vite build` untuk memastikan tidak ada error kompilasi.

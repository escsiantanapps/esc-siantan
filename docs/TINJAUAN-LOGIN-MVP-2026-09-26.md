# Tinjauan browser, login, dan batas penilaian MVP — 26 September 2026

## Hasil

[Pasti] Onboarding dan login production dibuka langsung melalui Edge otomatis. Onboarding dapat diselesaikan hingga login, tidak ditemukan error JavaScript atau overflow horizontal pada halaman yang diperiksa. Browser bawaan Codex gagal inisialisasi sandbox; pengujian memakai Playwright yang sudah tersedia, tanpa dependensi proyek baru.

Penilaian desain: login pada commit cec1f23 terlalu menyederhanakan identitas ESC; kartu sempit dikelilingi bidang oranye yang luas di desktop. Tampilan baru mengembalikan logo aplikasi existing, lokasi gereja, hierarki formulir, dan proporsi desktop/mobile. Penilaian estetika ini merupakan pertimbangan desain, bukan hasil pengukuran objektif.

## Perubahan lokal

- `src/pages/auth/LoginPage.jsx`: identitas ESC dengan ikon existing, susunan desktop dua kolom/mobile satu kolom, tautan lupa sandi dekat sandi, ikon input konsisten, dan pemisahan pendaftaran dari tindakan masuk.
- `src/pages/auth/LoginPage.css`: CSS khusus login, warna dari token proyek, area aman layar, layout teks besar, serta reduced motion.
- `src/lib/i18n.js`: lima kunci baru masing-masing locale id/en untuk identitas dan deskripsi portal.
- Dokumen ini mencatat verifikasi dan batas penilaian.

Alur autentikasi, handler submit, backend, dan kebijakan akses tidak berubah. Dua key `points.rankBadgeAria` dan perubahan `PointsPage.jsx` yang sudah ada sebelumnya bukan bagian revisi login ini.

Status revisi login ini: belum commit/push. Tidak ada migrasi SQL, env var, atau konfigurasi manual tambahan.

## Bukti pengujian

Production: `https://www.escsiantan.my.id/onboarding` pada 390×844, login pada 390×844 dan 1440×900. Navigasi publik saja; tidak membuat akun atau mengirim OTP.

Build lokal final: `npx vite build` exit 0. Peringatan lama tentang chunk >500 kB dan impor statis/dinamis pushService masih ada.

Preview build final: port 4174, Edge headless, service worker diblokir. Font Google yang sudah dipakai aplikasi diizinkan dimuat; panggilan backend diblokir atau memakai respons simulasi.

- 16 variasi: 375×812, 390×844, 844×390, 1440×900 × terang/gelap × id/en. Tidak ada overflow horizontal; field mempunyai label dan required; logo termuat; kontrol interaktif yang diperiksa minimal 44×44.
- 34 pemeriksaan lulus: enam interaksi formulir/keyboard/error/link pemulihan, 16 pembesaran teks 200%, dan 12 pengukuran kontras.
- Rasio kontras terendah dari teks/tombol yang diukur: 5,50:1 pada kedua tema.
- Tidak ada error JavaScript selama pengujian.
- Overflow teks besar yang ditemukan saat iterasi telah diperbaiki dan diuji ulang pada build final.
- Screenshot mobile terang/gelap dan desktop ditinjau visual.

Artefak lokal: `C:/Users/melvi/.codex/visualizations/2026/09/26/01a0dc62-27a2-7c41-a916-7bddcac816a5/login-review/` (`production.json`, `updated-results.json`, dan PNG sebelum/sesudah). Skrip `login-review.mjs` serta `login-check.mjs` berada pada folder induknya. Skrip ini belum merupakan suite regresi yang terintegrasi dalam repositori/CI.

## Apakah sudah MVP dan bukan AI slop?

[Pasti] Dari kode dan pekerjaan sebelumnya, cakupan fitur sudah melampaui lingkup MVP sederhana: akun, kegiatan/kelas, SOP, komsel, administrasi, dan poin mempunyai implementasi domain yang spesifik. Banyaknya fitur tidak membuktikan semuanya andal atau dibutuhkan pengguna.

[Kemungkinan Besar] Aplikasi ini lebih tepat dipandang sebagai produk operasional awal yang memerlukan penguatan kualitas. Informasi jumlah akun dan pemakaian rutin berasal dari konteks operator, bukan analisis penggunaan production dalam pengujian ini. Keberhasilan tugas nyata dan manfaat bagi jemaat tetap harus dibuktikan.

Istilah "AI slop" tidak mempunyai tes lulus/gagal. Implementasi khusus gereja dan koneksi backend menunjukkan aplikasi bukan sekadar gambar/mockup. Namun klaim "bebas AI slop" tidak dapat dijamin dari tampilan atau build. Indikator kualitas yang perlu dipertahankan: alur utama selesai, teks dan status akurat, tidak ada aksi palsu, akses sesuai role, kondisi gagal jelas, serta regresi dapat diulang.

Belum diverifikasi pada sesi ini: autentikasi nyata dan OTP WhatsApp, izin/RLS production tiap role, integritas transaksi poin/persembahan, upload, QR kamera, push, pemasangan/offline/update PWA, pemulihan koneksi, performa perangkat lambat, dan keberhasilan backup/restore. Ini batas verifikasi, bukan klaim bahwa fitur tersebut rusak.

Prioritas berikutnya adalah pengujian alur inti dengan akun khusus testing tiap role dan integrasi regresi ke proyek; jangan menambah fitur hanya untuk memperbesar daftar fitur. Masalah konfigurasi lint yang tercatat pada audit sebelumnya juga belum diperbaiki di tugas visual ini.

## Tes manual setelah revisi disetujui dan dirilis

1. Jemaat: login email dan nomor HP dengan akun testing, pastikan masuk ke halaman yang tepat; coba tampil/sembunyikan sandi dan ingat saya.
2. Jalur pemulihan: gunakan akun testing untuk menerima OTP WhatsApp dan menyelesaikan reset.
3. HP nyata: terang/gelap, id/en, landscape, keyboard terbuka, dan ukuran teks besar; tombol masuk dan tautan harus tetap terjangkau.
4. Buka aplikasi PWA yang sudah terpasang dan pastikan versi login baru muncul setelah pembaruan cache.

Usulan commit: `fix: perkuat identitas dan tata letak halaman login`.

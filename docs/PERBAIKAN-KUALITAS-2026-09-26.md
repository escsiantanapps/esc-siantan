# Perbaikan kualitas ESC Siantan — 26 September 2026

## Hasil

[Pasti] Delapan temuan UI/UX pada audit awal telah ditangani. Build akhir berhasil. Pengujian lokal mencakup 37 pemeriksaan regresi interaksi, lima keadaan katalog poin, enam pemeriksaan kontras/layout akhir, 80 kombinasi tampilan publik, dan 48 pembukaan halaman internal dengan sesi simulasi. Tidak ada error JavaScript atau overflow horizontal yang teramati pada matriks tampilan tersebut.

Ini hasil verifikasi UI lokal, bukan sertifikasi seluruh aplikasi atau pembuktian keamanan backend production. Tidak ada perubahan database, commit, push, atau deploy dalam pekerjaan ini.

## Perubahan

1. **Onboarding:** klik dan swipe dikunci selama perpindahan tahap, indeks dibatasi, timer dibersihkan, serta selesai/lewati hanya dihitung sekali. Scroll vertikal tidak dianggap swipe horizontal. Layar pendek dan teks 200% bisa menggulir sampai tombol akhir.
2. **Form bersama:** `Input`, `Textarea`, dan `Select` meneruskan `required`, menghubungkan label lewat ID stabil, dan menghubungkan error melalui `aria-describedby`/`aria-invalid`. Tombol tetap disabled saat loading meskipun pemanggil memberi `disabled={false}`.
3. **Registrasi:** nama/email/HP/password/konfirmasi diperiksa sebelum masuk langkah foto. Kesalahan tampil di kolom terkait dan fokus berpindah ke kesalahan pertama. Data valid tetap bisa melanjutkan dan tidak hilang ketika kembali ke langkah Akun.
4. **Login/pemulihan:** login memakai komponen bersama, label permanen, autocomplete, checkbox native, tombol password berukuran 44×44 yang dapat dijangkau keyboard, serta pesan error yang diumumkan. Blob bergerak dan kartu kaca dihapus. Form lupa sandi menahan email kosong/invalid; penjelasan menyebut WhatsApp sesuai jalur backend yang ada.
5. **Poin beranda:** keadaan katalog kosong, gagal, stok habis, poin kurang, dan poin cukup dibedakan. Daftar kosong tidak lagi menghasilkan pesan sukses. Kartu menautkan pengguna ke halaman poin untuk melihat/mencoba kembali.
6. **Beranda:** area pengumuman kosong diringkas, tidak muncul bersamaan dengan error pemuatan, dan bayangan/tampilan mengangkat pada ubin Menu Cepat dihapus.
7. **Bahasa:** kontrol dan konten bawaan roadmap, kebijakan privasi, serta layar error memperoleh terjemahan id/en. Konten roadmap yang ditulis admin tetap dipertahankan. Isi kebijakan dipindahkan dan diterjemahkan tanpa mengubah substansi; kebenaran klaim kebijakan bukan bagian audit ini.
8. **Kontras:** tombol primary memakai token brand merah gelap yang tetap sama pada dua tema; gradien brand tetap dipakai pada latar/header. Pesan error memakai token yang terbaca di dark mode. Fokus keyboard tombol/link mendapat outline CSS biasa.

## File kode yang diubah oleh pekerjaan ini

| File | Perubahan |
|---|---|
| `src/components/ui/index.jsx` | Semantik form, required, loading, kontras tombol, tombol kembali |
| `src/components/ErrorBoundary.jsx` | Terjemahan layar error |
| `src/components/PointsProgressCard.jsx` | Lima keadaan katalog/poin |
| `src/index.css` | Indikator fokus keyboard |
| `src/lib/i18n.js` | 76 kunci baru per bahasa dan penyesuaian copy |
| `src/pages/OnboardingPage.jsx` | Lock transisi, cleanup, scroll, i18n |
| `src/pages/PrivacyPolicyPage.jsx` | Teks lewat i18n dan keterbacaan dokumen |
| `src/pages/auth/LoginPage.jsx` | Form aksesibel dan tampilan yang disederhanakan |
| `src/pages/auth/RegisterPage.jsx` | Validasi sebelum perpindahan langkah |
| `src/pages/auth/ForgotPasswordPage.jsx` | Form pemulihan dan feedback aksesibel |
| `src/pages/user/HomePage.jsx` | Empty state ringkas dan menu lebih sederhana |

Dokumentasi pekerjaan: laporan ini dan `docs/AUDIT-KUALITAS-2026-09-26.md` (audit sebelum perbaikan).

**Perubahan lain yang dipertahankan:** `src/pages/user/PointsPage.jsx` dan dua entri `points.rankBadgeAria` di `src/lib/i18n.js` sudah modified sebelum pekerjaan perbaikan ini. Perubahan tersebut bukan hasil tugas ini. Jika membuat commit khusus perbaikan ini, stage hanya hunk i18n milik perbaikan dan jangan menyertakan PointsPage atau file untracked lain secara otomatis.

## Bukti verifikasi

Semua skrip dan bukti berada di:

`C:/Users/melvi/.codex/visualizations/2026/09/26/01a0dc62-27a2-7c41-a916-7bddcac816a5/`

| Pemeriksaan | Hasil | Bukti |
|---|---|---|
| `npx vite build` terakhir | Exit 0; build 10,78 detik | Output terminal sesi |
| `git diff --check` | Exit 0; hanya peringatan normalisasi LF/CRLF | Output terminal sesi |
| Regresi interaksi | 37/37 lulus | `quality-after/regression.json` |
| Poin: kosong, gagal, kurang, cukup, stok habis | 5/5 lulus | `quality-after/audit-fixtures.json` |
| Halaman publik | 80 kombinasi; tidak ada error JS/overflow horizontal | `quality-after/matrix.json` |
| Halaman internal | 48 pembukaan; rute sesuai dan tidak ada error JS/overflow horizontal | `quality-after/audit-fixtures.json` |
| Kontras/layout akhir | 6/6 lulus | `quality-after/contrast-final.json` |

Rasio kontras yang diukur dari computed styles, dengan warna OKLCH dikonversi ke sRGB sebelum perhitungan:

- Tombol primary: **5,50:1** pada light dan dark.
- Error form: **6,42:1** pada light dan **8,90:1** pada dark.

Cakupan publik: login, daftar, lupa password, kebijakan privasi, onboarding; viewport 375×812, 390×844, 844×390, 1440×900; bahasa id/en; tema light/dark.

Cakupan internal menggunakan fixture Volunteer, PKS, dan Super Admin pada 375×812 di kedua tema. Termasuk beranda, informasi, events, kelas, SOP, profil, pengaturan, poin, izin, persembahan, status pendaftaran, panduan, dashboard PKS, sembilan halaman admin, dan dua form admin (berita/event baru).

Alur pemulihan dengan email valid, OTP, password berbeda, dan respons sukses juga dijalankan menggunakan endpoint simulasi. Tidak ada OTP nyata dikirim atau password akun sebenarnya diubah.

Skrip:

- `regression-after.mjs`: kasus interaksi yang sebelumnya gagal dan alur normal terkait.
- `matrix-after.mjs`: matriks tampilan publik.
- `fixtures-after.mjs`: smoke test internal dan keadaan katalog.
- `contrast-final.mjs`: pengukuran kontras dan layout pemulihan setelah perubahan kosmetik terakhir.

Skrip memakai runtime Playwright yang sudah terpasang dan preview build pada port 4174. Seluruh request eksternal dicegat atau diblokir; tidak memakai data jemaat. Font eksternal diblokir sehingga screenshot bisa memakai font fallback. Service worker diblokir agar cache tidak menyamarkan versi build.

Catatan harness: penantian `h1` pada form berita/event diganti menjadi `h1, h2` sesuai markup aktual. Pengukuran warna awal diperbaiki agar tidak menafsirkan angka OKLCH sebagai RGB. Hasil akhir di tabel memakai pengujian yang telah dikoreksi.

Screenshot pilihan:

- `quality-after/login-final-light.png`
- `quality-after/login-final-dark.png`
- `quality-after/home-empty.png`
- `quality-after/onboarding-844.png`
- `quality-after/registration-errors.png`

## Batas verifikasi dan pekerjaan terpisah

- Tidak ada migrasi atau env var baru yang perlu dijalankan.
- Validasi registrasi tambahan masih **client-only**, untuk pengalaman pengguna; bukan batas keamanan. Kebijakan password/email Supabase production belum diverifikasi. Validasi backend OTP yang sudah ada tidak diubah.
- Peringatan bundle >500 kB dan impor statis/dinamis `pushService` masih ada. Optimasi bundle bukan bagian perbaikan ini.
- `npm run lint` sebelumnya tidak dapat berjalan karena konfigurasi ESLint belum tersedia; konfigurasi tersebut tidak ditambahkan dalam tugas ini.
- Uji UI dengan sesi dummy tidak membuktikan RLS, izin tiap role, transaksi poin/persembahan, upload, pengiriman OTP, kamera QR, atau push bekerja di production.
- Dokumen kebijakan dipertahankan substansinya, termasuk klaim lama yang belum dicocokkan dengan implementasi/backend dalam pekerjaan ini.

## Tes manual sebelum/setelah rilis

1. Di HP nyata: onboarding dengan klik cepat, swipe, landscape, dan ukuran teks besar; pastikan semua konten serta tombol dapat dijangkau.
2. Daftar: data salah ditahan di langkah Akun; data benar lanjut ke foto; kembali tidak menghapus isian. Lanjutkan registrasi lengkap menggunakan akun khusus testing.
3. Login email/HP, tampilkan password, ingat saya, serta pemulihan OTP melalui WhatsApp nyata.
4. Beranda: kondisi katalog kosong/gagal dan hadiah tersedia menunjukkan pesan yang benar; Menu Cepat dan bottom navigation tetap mudah digunakan.
5. Admin: isi/simpan satu form dengan komponen Input/Select/Textarea sesuai kewenangan akun testing; cek required tidak menghalangi data yang valid.
6. Bandingkan light/dark dan bahasa id/en, termasuk roadmap bawaan, roadmap custom admin, dan kebijakan privasi.
7. Verifikasi pemasangan/offline PWA, QR, dan notifikasi pada perangkat sebenarnya sebagai pemeriksaan rilis terpisah.

## Usulan commit

`fix: stabilkan onboarding dan rapikan kualitas antarmuka`

Commit/push belum dilakukan. Rilis ke `master` memicu deploy production dan memerlukan konfirmasi operator sesuai aturan proyek.

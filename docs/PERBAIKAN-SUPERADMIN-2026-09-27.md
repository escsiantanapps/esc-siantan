# Perbaikan kualitas dan pemeriksaan Super Admin — 27 September 2026

## Hasil dan cakupan

Login production menggunakan akun yang diberikan operator berhasil, dan respons profil mengonfirmasi role **Super Admin**. Kredensial hanya diteruskan ke proses login sementara; tidak disimpan di kode, laporan, fixture, CI secrets, screenshot, atau storage state. Browser pemeriksaan ditutup setelah selesai.

Pemeriksaan production mencakup 14 rute desktop dan tiga tampilan HP. Tidak ditemukan error JavaScript atau overflow horizontal pada rute yang diperiksa. Data jemaat tidak diedit. Semua method selain GET/HEAD/OPTIONS dan POST login diblokir di browser pengujian. Akibat pembatasan ini, heartbeat, daftar storage, dan RPC leaderboard tidak dapat dinilai fungsional pada pemeriksaan tersebut. Login merupakan aksi autentikasi nyata, bukan simulasi.

Rute desktop: `/admin`, `/admin/jemaat`, `/admin/events`, `/admin/kelas`, `/admin/tugas`, `/admin/komsel`, `/admin/persembahan`, `/admin/inventory`, `/admin/hak-akses`, `/admin/audit`, `/events`, `/kelas`, `/poin`, `/pengaturan`. HP: `/admin`, `/admin/hak-akses`, `/poin`.

## Temuan dan perbaikan

1. **Form SOP admin dapat crash:** `AdminTaskFormPage` memanggil `useAuth` tanpa import. Ditemukan lint dan diperbaiki; tes membuka form baru dengan sesi Super Admin fiktif.
2. **Penolakan akses SOP dapat crash:** komponen ikon `Lock` tidak diimpor. Diperbaiki dan diuji untuk Jemaat, Volunteer, dan PKS fiktif.
3. **Gagal mengambil hak akses disamarkan:** service daftar admin mengabaikan error query permissions; halaman menelan error pemuatan. Gangguan 503 pada halaman production direproduksi melalui intersepsi browser: tidak muncul alert atau retry. Service sekarang meneruskan error; UI menampilkan pesan dan tombol coba lagi, tanpa menganggap izin yang belum diketahui sebagai akses penuh.
4. **Panel Admin membuka fallback akses penuh saat request izin gagal:** sekarang menahan isi panel hingga izin berhasil dimuat. NULL yang berasal dari respons sukses tetap berarti default akses penuh, sesuai perilaku proyek; kegagalan request tidak disamakan dengan NULL.
5. **Admin murni tanpa halaman berpotensi loop redirect:** tampilkan pesan akses kosong yang stabil dan dapat di-refresh. Admin yang mempunyai peran kedua masih dapat kembali ke aplikasi jemaat.
6. **Gagal memuat SOP ditampilkan seperti tugas tidak ada:** kini ada keadaan error dan retry. Status penolakan lama direset saat mulai memuat tugas berikutnya.
7. **Petunjuk tidak sesuai kode:** keterangan dashboard selalu terbuka dan kategori sebagai gerbang akses diperbaiki. Role dan ministry tetap menjadi filter akses SOP yang sudah ada; tidak ada policy atau aturan bisnis baru.
8. **Verifikasi tidak dapat diulang di repo:** tambah konfigurasi lint, 21 tes browser, `npm run check`, dokumentasi tes, dan workflow CI.
9. **Peringkat seri dibatalkan operator:** Migrasi v92 mengembalikan `ROW_NUMBER()` dari v81, dengan poin DESC, nama ASC, dan user_id ASC. Definisi production v91 diterima dari operator dan cocok dengan kode; v91 dikonfirmasi sudah dijalankan. Top-N tetap paling banyak N peserta dan posisi sendiri tetap global. Saldo poin tidak diubah. Tes UI memakai dua peserta berpoin sama dengan peringkat 4/5, serta posisi sendiri 35 di luar 10 besar. Tes ini memeriksa konsumsi respons server, bukan eksekusi PostgreSQL. Blok fungsi dan ACL v92 dibandingkan identik dengan v81; blok lama tidak diedit.
10. **Dependensi rentan:** patch dalam rentang semver yang sudah diizinkan mengurangi laporan npm audit dari 14 (8 high, 6 moderate) menjadi 6 (1 high, 5 moderate). Tidak memakai `--force` atau melakukan upgrade major.

Perbaikan login yang telah ditinjau operator juga masih lokal: logo existing, proporsi mobile/desktop, serta teks **Build A Strong Generations** sesuai permintaan. Teks tersebut dipertahankan persis, bukan dikoreksi tanpa keputusan operator.

## File dalam paket rilis

| File | Tujuan |
|---|---|
| `src/layouts/AdminLayout.jsx` | Kondisi izin gagal/kosong dan pemulihan |
| `src/services/permissionsService.js` | Teruskan error query izin |
| `src/pages/admin/AdminPermissionsPage.jsx` | Pesan gagal, retry, label pencarian, tombol tutup |
| `src/pages/admin/AdminTaskFormPage.jsx` | Import hook yang hilang dan petunjuk kategori |
| `src/pages/user/TaskDetailPage.jsx` | Import ikon yang hilang, error pemuatan dan retry |
| `src/pages/auth/LoginPage.jsx` | Revisi visual login sebelumnya |
| `src/pages/auth/LoginPage.css` | Tata letak login responsif |
| `src/lib/i18n.js` | Teks baru/koreksi id dan en; slogan pilihan operator |
| `package.json` | Perintah lint/test/check dan dev dependency Playwright |
| `package-lock.json` | Lock Playwright dan patch kompatibel |
| `.eslintrc.cjs` | Gerbang pemeriksaan kesalahan runtime/hooks |
| `.github/workflows/quality.yml` | Pemeriksaan PR/push master dengan backend dummy |
| `tests/harness.mjs` | Browser dan fixture terisolasi |
| `tests/quality.test.mjs` | 21 skenario regresi |
| `supabase/schema.sql` | Migrasi v92: pulihkan peringkat unik sesuai v81 |
| `tests/README.md` | Cara menjalankan dan batas verifikasi |
| `docs/TINJAUAN-LOGIN-MVP-2026-09-26.md` | Bukti revisi login sebelumnya |
| `docs/PERBAIKAN-SUPERADMIN-2026-09-27.md` | Laporan ini |

`PointsPage.jsx` dan dua key `points.rankBadgeAria` di i18n adalah perubahan lama di luar tugas. Jangan ikut stage keduanya. File kerja lain yang untracked juga tidak termasuk paket rilis.

Diff lockfile cukup besar karena npm juga menyingkirkan 213 entri stale yang tidak lagi menjadi dependensi manifest (antara lain Capacitor/Firebase). Paket opsional lintas platform untuk build tetap ada. `npm ci --ignore-scripts --dry-run --no-audit` berhasil; ini validasi lockfile, bukan pengujian CI Linux.

## Verifikasi

- `npm run check`: lint → 21 tes browser → build. Hasil akhir dicatat setelah perbaikan ukuran tombol pada bagian Status akhir di bawah.
- Tes mencakup Super Admin, Admin terbatas/izin kosong/default NULL, peran rangkap, penolakan SOP tiga role, error/retry, login, registrasi, onboarding, dua tema/bahasa, serta pembesaran teks.
- Tes memakai Node.js test runner + Playwright di Edge Windows. Browser memakai data dummy; semua request backend diintersep. `envFile: false` dan URL Supabase dummy mencegah penggunaan konfigurasi production.
- Pesan error terang/gelap ditinjau lewat screenshot HP; tombol pemulihan baru minimal 44 piksel.
- Kesalahan awal harness (nama heading/tombol dan penantian aset) dikoreksi berdasarkan markup aktual. Kegagalan awal tidak dihitung sebagai tes lulus.
- Lint adalah adopsi bertahap: `no-undef` dan aturan hooks aktif, sementara impor tak terpakai dan exhaustive-deps belum menjadi gerbang. Tidak mengklaim semua utang kode sudah diselesaikan.
- CI belum dijalankan di GitHub karena belum commit/push. Workflow belum menjadi required check dan tidak menahan auto-deploy Vercel secara otomatis.

Artefak pemeriksaan ada di `C:/Users/melvi/.codex/visualizations/2026/09/26/01a0dc62-27a2-7c41-a916-7bddcac816a5/superadmin-review/`. Laporan production tidak memuat isi data jemaat; yang dicatat hanya role, rute, status, dan metrik layout/error.

## Sisa risiko dan batas klaim

- Enam peringatan npm audit masih tersisa pada rantai Vite/esbuild, React Router, dan ExcelJS/uuid. Satu high berada pada Vite. Saran otomatis audit melibatkan upgrade major atau downgrade ExcelJS; tidak diterapkan dalam paket ini. Eksploitabilitas production belum dinilai. Dev server pengujian terikat ke localhost.
- Peringatan build lama: bundle >500 kB dan campuran import statis/dinamis pushService.
- RLS/policy production belum diverifikasi. Tidak ada dump policy/trigger dan hanya tersedia akun Super Admin. Sesuai `.agents/skills/audit-rls/SKILL.md`, perlu **"Ambil ground truth dari PRODUCTION (bukan schema.sql)"** sebelum menyimpulkan keamanan atau mengganti policy lama. Tes role fiktif hanya memeriksa UI/routing, bukan RLS.
- OTP, simpan/hapus data nyata, integritas transaksi poin/persembahan, QR kamera, push, PWA offline/update, dan backup/restore nyata belum diuji. Tidak mengubah role akun operator untuk mensimulasikan akun lain.
- Tidak ada dasar untuk menjanjikan aplikasi "bebas AI slop" secara menyeluruh. Paket ini memberikan perbaikan konkret dan pemeriksaan berulang dengan cakupan yang dinyatakan.

## Rilis dan tes manual

**Jalankan hanya blok Migrasi v92 di akhir `supabase/schema.sql` melalui Supabase SQL Editor**, idealnya sebelum/segera setelah deploy. Aman dijalankan ulang karena CREATE OR REPLACE dan pengaturan hak EXECUTE idempotent. Sebelum v92 dijalankan, aplikasi tetap memakai peringkat seri v91; push tidak menjalankan SQL. Tidak ada env var baru. Operator telah mengizinkan push setelah perbaikan selesai. Pesan commit: `fix: pulihkan peringkat unik dan perkuat kualitas aplikasi`.

Setelah migrasi dan deploy:

1. Super Admin: buka SOP → tambah template, pastikan form tampil. Simpan hanya dengan data testing yang memang disiapkan operator.
2. Super Admin: buka Hak Akses; simulasikan koneksi bermasalah, pastikan error muncul dan Coba lagi dapat memulihkan daftar.
3. Gunakan akun testing Admin dengan izin terbatas/kosong dan Jemaat/Volunteer/PKS terpisah; pastikan halaman yang sah tetap terbuka dan pesan penolakan benar. Jangan mengubah hak akun utama demi tes.
4. Periksa login email/HP, pemulihan OTP, dan tampilan slogan pada perangkat nyata.
5. Buka Poin → Peringkat: peserta berpoin sama harus memiliki nomor berbeda; 10 besar berisi maksimal 10 peserta, dan posisi Anda tetap benar jika berada di luar 10 besar. Saldo tidak berubah.
6. Lakukan uji transaksi poin, QR, push, dan PWA secara terpisah memakai data testing yang dapat direkonsiliasi.

## Status akhir

`npm run check` selesai dengan exit 0 setelah koreksi ukuran tombol: lint lulus, **21/21 tes lulus**, dan build + generateSW PWA berhasil. `git diff --check` juga lulus. Peringatan bundle dan enam temuan audit dependensi tetap dicatat sebagai pekerjaan tersisa di atas. Hasil deploy dan CI GitHub dicatat terpisah dalam laporan rilis setelah push. SQL belum dieksekusi oleh pengujian lokal; operator menjalankan v92 secara manual.

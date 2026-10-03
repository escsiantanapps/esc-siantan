# Uji Jadwal Pelayanan Bulanan

Tanggal verifikasi terakhir: 3 Oktober 2026. Status: pengujian lokal dan daftar uji production.

## 1. Lingkungan Lokal

Buka [preview lokal](http://127.0.0.1:5173/schedule-preview.html) saat Vite berjalan.
Jika server belum berjalan, jalankan `npm run dev -- --host 127.0.0.1` dari proyek.
Preview memakai akun/nama/jam fiktif dan adapter memori, bukan database production.
Jangan memasukkan data jemaat sungguhan. Reload halaman menghapus perubahan fixture.

Pemilih mode hanya tersedia pada entri development ini; tidak mengubah role akun nyata.
Tema gelap/terang mengikuti provider aplikasi. Reset mengembalikan contoh Oktober 2026.

## 2. Langkah Manual Localhost

1. Mode Admin: periksa empat tanggal Oktober dan blok Kids, Pagi, Nextgen, serta Kelas.
   Isi beberapa nama pada posisi Singer; cari anggota lain dan pastikan pilihan tetap ada.
2. Coba Bima pada Bass Kids ketika ia sudah Drum Kids. Penyimpanan wajib ditolak
   dengan konteks kegiatan, jam, dan tugas yang berbenturan; nama awal tidak tertimpa.
3. Mode MH Musik: periksa bagian Musik dapat diisi, bagian lain terkunci dan nama
   Draft tidak terlihat. Ubah tim/catatan Musik. Tidak boleh ada editor template,
   pengaturan jam, atau aksi menerbitkan bulan.
4. Mode Volunteer sebelum publikasi: periksa keadaan belum ada tugas, tanpa tombol
   pengelolaan atau pendaftaran mandiri. Menu baca tidak mengarang tugas Minggu.
5. Kembali Admin: terbitkan Oktober dan konfirmasi posisi yang belum lengkap.
   Semua bagian berubah Terbit; nama/jam tidak dapat diedit langsung. Volunteer Bima
   kemudian melihat tugas beserta tanggal, jam, ministry, dan tim. Mode Volunteer
   Tanpa Jadwal tetap menampilkan keadaan kosong.
6. Reset, pilih November 2026, lalu Buat Jadwal Bulan Ini. Lima tanggal Minggu muncul.
   Tambahkan Sabtu 7 November; enam kolom harus tampil. Tanggal di luar November
   tidak dapat ditambahkan.
7. Pada bulan baru yang kosong, ubah jam kegiatan Pagi ke 08.30-10.30.
   Isi Bima Drum Kids 08.00-09.00, lalu coba Bima Drum Pagi pada tanggal sama.
   Penugasan kedua ditolak. Jam Kids 08.00-09.00 dan Pagi 09.00-10.30 berurutan
   bukan bentrok. Untuk mengubah jam kegiatan yang sudah berpelayan, kosongkan
   seluruh pelayan kegiatan itu dahulu.
8. Tab Template: ubah jam/nama template dan simpan. Bulan yang sudah dibuat tetap
   memakai snapshot lama, bukan ikut berubah diam-diam.
9. Aksi PDF: periksa seluruh tanggal, kegiatan, jam, nama, tim/materi, serta dresscode.
   Draft harus ditandai. Uji simpan sebagai PDF melalui dialog cetak browser dan
   periksa hasil halaman landscape, termasuk bulan lima Minggu.
10. HP sekitar 375-390px: periksa satu tanggal aktif, pergantian tanggal, dialog
    anggota, teks panjang, serta tema gelap/terang. Halaman tidak boleh overflow.
11. Tab Akses & Posisi: Admin melihat MH dari Ministry, lalu cabut akses MH Musik.
    Mode MH harus kehilangan panel pengelola. Setujui ulang dari Admin dan periksa
    MH hanya dapat mengisi bagian Musik. Wakil dicari, disetujui, lalu dicabut.
12. Tambah, edit, dan nonaktifkan posisi. Template menggunakan katalog posisi
    aktif, sedangkan bulan yang sudah dibuat tetap memiliki snapshot sebelumnya.

Menu Ministry asli diuji dengan backend palsu: hanya Volunteer Aktif yang sudah
menjadi anggota Ministry itu dapat dipilih sebagai MH. Ministry baru harus disimpan,
anggotanya ditambahkan, lalu MH ditetapkan. Kosong dikirim sebagai NULL;
membatalkan konfirmasi ganti MH tidak mengirim perubahan.

## 3. Tes Otomatis Lokal

```powershell
npm run check
node --test tests/service-schedule-demo.test.mjs
$env:SCHEDULE_LOCAL_URL='http://127.0.0.1:5173'
node scripts/test-monthly-schedule-local.mjs
```

Gerbang `npm run check` lulus 3 Oktober 2026: lint tanpa warning, tes otomatis,
dan build production. Tes PostgreSQL lokal memeriksa Migrasi v98-v100, batas role,
keanggotaan MH, persetujuan terpisah, privasi baca anonim, dan cleanup FK.
Tujuh belas alur browser localhost lulus, termasuk Akses & Posisi.
Playwright menggunakan Microsoft Edge headless serta memblokir semua request ke
origin lain atau `/api/`. Tidak ada request terlarang atau error JavaScript.
Screenshot hasil uji ada di `docs/local-schedule-tests/`.
Hasil PDF empat/lima tanggal dirender dan diperiksa: dua halaman A3 landscape,
tanggal serta nama ibadah/jam/Ceremonial tetap muncul pada halaman lanjutan. Uji kegiatan
80 posisi menghasilkan tiga halaman tanpa halaman judul kosong.

Notifikasi bulanan memakai endpoint existing, 24 roster per permintaan. Contoh
56 roster memakai tiga permintaan, bukan 56. Jika server memberi 429, klien
menunggu Retry-After dengan retry terbatas. Admin dapat memakai Kirim Pengingat
setelah publikasi; MH tidak mendapatkan akses notifikasi seluruh bulan.

Tes browser membuktikan workspace pengelola dengan fixture, bukan izin database
production. Pembaca Volunteer preview bukan sesi login Volunteer production.
Tidak ada push, cron, pengujian perangkat nyata, atau absensi sungguhan pada tes ini.

## 4. Prarilis Production

- Verifikasi build, lint, tes otomatis, daftar file perubahan, dan izin commit/push.
  Localhost saja bukan persetujuan rilis.
- Periksa keadaan schema/RLS/trigger production sebelum mengubah yang sudah ada;
  jangan mengandalkan `schema.sql` sebagai bukti bebas drift.
- Operator melaporkan migrasi sebelumnya sudah dijalankan. Audit bulanan baca-saja
  tersedia di `docs/AUDIT-JADWAL-BULANAN.sql`; hasil fungsi diterima, sedangkan
  hasil policy/RLS dan trigger bulanan belum diterima. Cocokkan sebelum rilis.
- Audit `docs/AUDIT-MINISTRY-HEAD.sql` diterima sebelum v99 diterapkan.
  Operator menyatakan v99 sudah dijalankan; penetapan MH di menu Ministry
  memerlukan akun Volunteer Aktif yang juga tercatat sebagai anggota Ministry itu.
- Jalankan query baca-saja `docs/AUDIT-MH-KEANGGOTAAN.sql` terlebih dahulu.
  Periksa `kepala_tanpa_keanggotaan` dan versi PostgreSQL; Migrasi v100 memakai
  sintaks FK PostgreSQL 15 atau lebih baru. Jika ada MH lama tanpa keanggotaan,
  tambahkan keanggotaan yang benar atau tetapkan ulang MH lewat Admin Ministry.
- Jalankan **Migrasi v100** di Supabase SQL Editor sebelum menguji keamanan MH
  melalui API nyata. Agen tidak menjalankan SQL production. Saat MH keluar
  dari Ministry, sumber MH dan akses jadwal lama akan dicabut.
- Uji Admin berakses dan tanpa akses halaman, MH/Wakil berakses dan yang dicabut,
  serta Volunteer melalui login nyata. Uji penolakan RPC langsung, bukan UI saja.
- Admin berakses Ministry saja boleh mengganti MH dan menonaktifkan grant lama,
  tetapi tidak menyetujui grant baru. Admin berakses Jadwal saja tidak dapat
  menetapkan kepala Ministry. MH harus Volunteer Aktif, bukan Kepala Departemen.
- Anonim tidak mendapat baris Ministry, sedangkan pengguna login tetap dapat
  membaca datanya. Tidak ada NIK atau kontak pribadi pada panel sumber MH.
- Uji dua pengelola menyimpan anggota yang sama bersamaan, pembacaan Draft lintas
  ministry, bentrok lintas kegiatan/ministry, dan atomisitas publikasi bulan.
- Periksa halaman Volunteer production, ringkasan beranda, tautan notifikasi,
  keadaan tanpa tugas, dan jadwal Terbit/Dibatalkan pada HP nyata.
- Verifikasi `CRON_SECRET`, VAPID, izin push PWA, dan cron H-1 di lingkungan server.
  Terbit/Batalkan harus memberi informasi dalam aplikasi walaupun push gagal.
- Uji join PostgREST bulanan, durasi pengiriman setiap halaman, dan penerimaan
  push ke perangkat nyata. Fixture API lokal tidak membuktikan ketiga hal ini.
- Pastikan roster/absensi lama masih dapat dibaca dan riwayat tidak dihapus.
  Jadwal baru belum menjadi sumber absensi tanpa keputusan transisi tersendiri.

Operator menyatakan v99 sudah diterapkan pada database; v100 masih perlu
dijalankan manual. Deploy kode tidak otomatis menjalankan migrasi.

## 5. File Perubahan Fitur

- Routing: `src/App.jsx`.
- Workspace pengelola: `src/pages/admin/AdminMonthlySchedulePage.jsx`, `MonthlyScheduleWorkspace.jsx`, `monthlyScheduleWorkspace.css`.
- Matriks: `src/components/serviceSchedule/MonthlyScheduleMatrix.jsx` dan `MonthlyScheduleMatrix.css`.
- Halaman lama: `src/pages/user/ServiceSchedulesPage.jsx` (mode legacy terpisah; pembaca anggota dipertahankan).
- Akses & Posisi: `src/components/serviceSchedule/ScheduleAccessPositions.jsx`.
- Sumber MH: `src/pages/admin/AdminMinistryPage.jsx` dan `src/services/contentService.js`.
- Layanan: `src/services/monthlyScheduleService.js` dan `serviceRosterService.js`.
- Helper: `src/lib/serviceScheduleMatrix.js`, `serviceScheduleNotifications.js`, dan kunci ID/EN di `src/lib/i18n.js`.
- Notifikasi server: `api/_handlers/notify-service-roster.js`; tidak menambah endpoint top-level.
- Database: blok v98-v100 pada `supabase/schema.sql` dan tiga audit baca-saja,
  `docs/AUDIT-JADWAL-BULANAN.sql`, `docs/AUDIT-MINISTRY-HEAD.sql`,
  serta `docs/AUDIT-MH-KEANGGOTAAN.sql`.
- Preview terisolasi: `schedule-preview.html`, `src/dev/MonthlySchedulePreview.jsx`, `serviceScheduleDemo.js`.
- Tes: `tests/monthly-roster-db.test.mjs`, `ministry-head-db.test.mjs`,
  `monthly-notifications.test.mjs`, `service-schedule-matrix.test.mjs`,
  `service-schedule-demo.test.mjs`, `roster-api.test.mjs`, `quality.test.mjs`,
  dan `harness.mjs`.
- Perintah verifikasi: `package.json` serta `scripts/test-monthly-schedule-local.mjs`.
- Dokumentasi: PRD bulanan, panduan ini, dan bukti visual fiktif pada `docs/local-schedule-tests/`.

Perubahan lama yang tidak terkait pada PointsPage dan file kerja lainnya tidak disertakan dalam lingkup fitur ini.

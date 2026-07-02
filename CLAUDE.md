# ESC Siantan — Konteks Proyek

Aplikasi manajemen gereja (PWA) untuk **ESC Siantan, Pontianak, Kalimantan Barat**. Dulu bernama "GerejaKu" saat awal dibangun — dokumen ini menggantikan `GEREJAKKU_CONTEXT.md` lama yang sudah jauh ketinggalan (ditulis saat aplikasi baru bootstrap, hampir semua fitur masih placeholder). Dokumen ini menggambarkan kondisi sistem yang **sudah jadi & berjalan di production**.

## Tech Stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS v4 (`@theme` CSS-based config, tidak ada `tailwind.config.js`) + React Router 6
- **Backend**: Supabase (Postgres + Auth + Storage + Row Level Security)
- **Serverless**: Vercel Functions (folder `api/`, Node runtime untuk yang butuh service-role key)
- **Deploy**: Vercel, auto-deploy dari branch **`master`** (push ke `main` akan membuat preview URL yang membingungkan — selalu push ke `master`)
- **PWA**: vite-plugin-pwa (`generateSW`), juga di-wrap jadi APK Android lewat Bubblewrap/TWA (lihat memory `twa-rebuild-toolchain`)
- **i18n**: `src/lib/i18n.js` — flat key-value, 2 locale (`id`/`en`), interpolasi `{param}` via `t(key, {param})`
- **Export Excel**: ExcelJS (`src/lib/exportXlsx.js`) — bukan `xlsx`/SheetJS (ada 2 CVE HIGH belum dipatch)

## Model Peran (Role)

5 role di kolom `users.role`: **Jemaat, Volunteer, PKS, Admin, Super Admin**. Sejak Migrasi v25, **Admin & Super Admin juga boleh merangkap PKS** (lewat flag `users.is_pks` + tabel `komsel_leaders`, bukan exclusive lagi).

- **Jemaat** — anggota biasa, akses app utama (`/`)
- **Volunteer** — Jemaat + akses Tugas/Form, bisa ajukan Izin/Sakit
- **PKS** (Pemimpin Komsel) — ditandai `users.is_pks = true` ATAU `role/role_secondary = 'PKS'`, dapat akses tambahan `/pks` (Dashboard PKS, lihat komsel yang dipimpin)
- **Admin** — akses panel `/admin`, dibatasi halaman mana yang boleh diakses lewat **Hak Akses** (Super Admin yang atur, tabel `admin_user_permissions`)
- **Super Admin** — akses penuh semua halaman admin + bisa ubah biodata jemaat lain + bisa ubah role + akses **Hak Akses** & **Kategori Tugas**

User juga bisa punya `role_secondary` (peran kedua, mis. Admin yang juga Volunteer) supaya tetap dapat akses tugas/notifikasi sesuai peran itu.

### Aturan privasi yang sengaja ditegakkan
- **NIK** hanya bisa dilihat/diubah Super Admin (di UI maupun lewat trigger DB `guard_biodata_admin_edit`)
- **Biodata jemaat lain** (nama, kontak, alamat, tgl lahir, dll) hanya bisa diubah Super Admin — Admin biasa hanya boleh ubah status/role/komsel/ministry/SP, BUKAN biodata pribadi
- PKS bisa lihat detail kontak & profil dasar anggota komselnya, **tanpa NIK**

## Alur Akun (penting, sering disalahpahami)

Ada 3 cara sebuah baris `users` mendapat akun login (`auth_id` terisi):
1. **Self-register** (`/register`) — `supabase.auth.signUp()` lalu insert profil dengan `status: 'Menunggu Persetujuan'`, Admin harus approve dulu.
2. **Admin tambah jemaat langsung** (`/admin/jemaat` → tombol Tambah Jemaat) — insert profil dengan `auth_id: NULL`, `status: 'Aktif'` langsung (RLS policy `users_admin_insert`, Migrasi v26). Jemaat **belum punya password**.
3. **Aktivasi akun** (`/aktivasi`) — untuk baris `users` yang `auth_id IS NULL` (dari cara #2 atau data impor lama): jemaat masukkan no. HP, dapat OTP via WhatsApp (Fonnte), set password baru. Endpoint `api/activate-verify.js` (service role) yang baru benar-benar membuat baris `auth.users` dan menghubungkannya.

Login juga bisa pakai nomor HP (`api/login-phone.js` mencari email berdasarkan `users.phone` lalu sign-in pakai anon key).

## Struktur Folder

```
src/
  pages/
    auth/          — Login, Register, ForgotPassword, Activate, ResetPassword
    user/           — semua halaman jemaat (lihat daftar rute di bawah)
    admin/          — semua halaman admin (lihat daftar rute di bawah)
  layouts/
    UserLayout.jsx  — bottom nav 5 tab
    AdminLayout.jsx — sidebar desktop + drawer mobile, menu dibangun dari config/adminPages.js
  config/
    adminPages.js   — daftar menu admin yang BISA dibatasi lewat Hak Akses (halaman Super-Admin-only seperti Hak Akses & Kategori Tugas TIDAK masuk daftar ini — di-hardcode terpisah di AdminLayout.jsx)
  services/         — satu file per domain (contentService.js menampung banyak domain kecil: events, news, classes, komsel, registrationService generik utk baptisan/nikah/penyerahan anak, dst.)
  contexts/         — AuthContext (login/register/logout), ThemeContext, LanguageContext, ToastContext
  lib/
    supabase.js, utils.js (formatDate, formatRupiah, formatPhone, hitungUmur, compressImage, validateUpload, dll), i18n.js, exportXlsx.js, printDoc.js (cetak arsip PDF via window.print)
api/                — Vercel serverless functions (lihat daftar di bawah)
supabase/schema.sql — SATU file berisi seluruh schema + riwayat migrasi bernomor (lihat konvensi di bawah)
```

## Konvensi Migrasi Database

`supabase/schema.sql` adalah satu file akumulatif. Setiap perubahan skema ditambahkan sebagai blok baru di akhir file dengan header `-- ── Migrasi vNN: <deskripsi> ──`, lalu **dijalankan manual** oleh user di Supabase SQL Editor (tidak ada migration runner otomatis). Migrasi terbaru: **v28** (sistem poin, NIJ, kartu jemaat, sesi komsel QR, status 3-fase, media foto/video, biodata tambahan). v27 = nama sesi kelas + spesifikasi tugas di izin.

### Sistem Poin (v28) — penting
Saldo `users.points` **hanya** ditulis oleh fungsi Postgres `SECURITY DEFINER` (`apply_points`, dipanggil trigger kehadiran + RPC `award_biodata_points`/`redeem_ticket`). Klien TIDAK PERNAH meng-`update` kolom `points` langsung — trigger `guard_user_privilege_cols` menolaknya (escape hatch: `current_setting('app.allow_points_update')`). Semua akses poin dari klien lewat `src/services/pointsService.js` (RPC). +1 poin otomatis saat insert ke `class_attendance`/`event_attendance`/`sunday_attendance`/`komsel_attendance` (komsel HANYA yang punya `session_id`, yaitu hasil scan QR sesi — checklist manual PKS tidak memberi poin).

### Status Kelas & Event (v28)
Nilai status kini **`Mulai` → `Sedang Berlangsung` → `Selesai`** (bukan `Aktif`/`Nonaktif` lagi). Migrasi v28 memetakan data lama (`Aktif`→`Mulai`, kelas `Nonaktif`→`Selesai`). Beranda & Informasi menampilkan yang `Mulai`/`Sedang Berlangsung`; tab riwayat = `Selesai`. Event masih boleh `Dibatalkan`.

### QR prefixes (menu Scan)
`ESC-ABSEN:<classId>:<sesi>` (kelas), `ESC-EVENT:<eventId>` (event), `ESC-KOMSEL:<sessionId>` (sesi komsel PKS), `ESC-SUNDAY:<YYYY-MM-DD>` (ibadah minggu, QR dari admin), `ESC-REDEEM:<ticketId>` (tukar poin). Semua ditangani di `AttendanceScanPage.jsx`.

Pola wajib di tiap blok migrasi (supaya aman dijalankan ulang / idempotent):
- `CREATE TABLE IF NOT EXISTS ...`
- `ALTER TABLE x ADD COLUMN IF NOT EXISTS ...`
- `DROP POLICY IF EXISTS "nama" ON table;` SEBELUM setiap `CREATE POLICY`
- ID generik: `'PREFIX-' || extract(epoch from now())::bigint` atau `'PREFIX-' || replace(gen_random_uuid()::text, '-', '')`

Helper RLS yang sudah ada & wajib dipakai ulang (jangan re-implement): `auth_user_role()`, `auth_user_id()`, `auth_user_role_secondary()`, `auth_leads_komsel(komsel_id)` — semua `SECURITY DEFINER`.

## Quirks teknis penting (jangan ulangi kesalahan ini)

- **Tailwind v4 di build ini**: utility `ring-*` dan `shadow-md` TIDAK menghasilkan CSS fungsional (entah kenapa, spesifik ke konfigurasi `@theme` proyek ini). Pakai border/outline CSS biasa untuk efek fokus, jangan pakai `ring-*`/`shadow-md`. Arbitrary value seperti `grid-rows-[1fr]` aman dipakai.
- **Kelas Tailwind dinamis**: JANGAN bangun nama kelas lewat template literal (`bg-${color}-100`) — JIT scanner butuh string literal utuh. Kalau perlu warna per-index, buat array objek berisi string kelas lengkap lalu index ke situ (lihat `FOLDER_THEMES` di `TasksPage.jsx` atau `FORM_BG_PRESETS`).
- **Tanggal**: kolom Postgres `DATE` di-parse JS sebagai UTC midnight → pakai `getUTC*()` untuk tanggal yang DISIMPAN, `get*()` biasa untuk "hari ini" lokal (perbandingan tanggal lahir vs hari ini di `cron-birthdays.js` & `PKSDashboardPage.jsx` sengaja asimetris begini).
- **Storage bucket `documents`**: dibuat manual di Supabase Dashboard (privat), dipakai utk dokumen baptisan/nikah/penyerahan-anak/sertifikat lewat `registrationService.uploadDocument(folder, file)`. Bucket `profile-photos` terpisah & publik (avatar). Bucket `task-files` untuk lampiran jawaban tugas & background form.
- **PostgREST join ambigu**: kalau satu tabel punya 2+ FK ke tabel yang sama (mis. `birthday_messages.recipient_id` & `sender_id` keduanya ke `users`), wajib pakai hint `table!column_name(fields)`, bukan nama constraint.

## Daftar Rute (per Juni 2026)

### User (`/`, layout `UserLayout`)
`profil`, `profil/edit`, `pengaturan`, `informasi`, `informasi/:id`, `events`, `events/:id`, `kelas`, `kelas/:id`, `kelas/absen` (scan QR), `scan`, `tugas`, `tugas/:id`, `baptisan`, `pemberkatan-nikah`, `penyerahan-anak`, `sertifikat`, `status-pendaftaran`, `persembahan`, `izin`, `pks` (khusus PKS)

### Admin (`/admin`, layout `AdminLayout`, akses dibatasi `AdminRoute`)
`jemaat`, `jemaat/:id`, `events`, `events/baru`, `events/:id/edit`, `berita`, `berita/baru`, `berita/:id/edit`, `kelas`, `tugas`, `tugas/baru`, `tugas/:id/edit`, `tugas/:id/jawaban`, `baptisan`, `nikah`, `penyerahan-anak`, `sertifikat`, `baptisan/:id` & `nikah/:id` & `penyerahan-anak/:id` (satu komponen `AdminRegistrationDetailPage`, deteksi jenis dari pathname), `sp`, `ministry`, `komsel`, `evaluasi`, `persembahan`, `izin`, `hak-akses` (Super Admin saja), `kategori-tugas` (Super Admin saja)

## Tabel Database (utama)

`users`, `ministries`, `user_ministries`, `komsel`, `komsel_categories`, `komsel_leaders`, `komsel_attendance`, `komsel_offerings`, `news`, `events`, `event_registrations`, `event_attendance`, `classes`, `class_attendance`, `class_registrations`, `form_templates`, `template_ministries`, `form_responses`, `task_categories`, `task_category_ministries`, `task_leaves`, `baptism_registrations`, `wedding_registrations`, `child_dedication_registrations`, `certificates`, `birthday_messages`, `offerings`, `payment_accounts`, `push_subscriptions`, `admin_user_permissions`, `app_settings`, `password_reset_otp`, `activation_otp`.

## Serverless Functions (`api/`)

| File | Fungsi |
|---|---|
| `check-phone.js` | Cek duplikat no. HP saat registrasi/tambah jemaat |
| `activate-request.js` / `activate-verify.js` | Aktivasi akun lama (HP + OTP WA) → buat `auth.users` & link |
| `login-phone.js` | Login pakai no. HP (cari email lewat service role, lalu sign-in anon) |
| `wa-reset-request.js` / `wa-reset-verify.js` | Lupa password via OTP WhatsApp |
| `delete-user.js` | Hapus akun permanen (Admin/Super Admin saja, service role) |
| `notify-pks.js` | Push ke PKS saat anggota komselnya isi tugas (dipanggil klien, public tapi divalidasi) |
| `send-push.js` | Kirim web-push (VAPID) |
| `cron-reminders.js` | Cron harian — ingatkan jemaat yang belum penuhi target tugas |
| `cron-birthdays.js` | Cron harian — beri tahu PKS anggota komselnya ulang tahun hari ini |
| `ping.js` | Health check |

Cron diatur di `vercel.json` (`crons` array), diproteksi header `CRON_SECRET`.

## Inventaris Fitur (ringkas per peran)

**Jemaat**: Beranda (berita, event, pesan ulang tahun dari PKS), Profil, Pengaturan (password, bahasa, dark mode, notifikasi push), Informasi, Events (lihat & daftar), Kelas (lihat, daftar, absen QR), Tugas (dikelompokkan sbg folder per Kategori Tugas, isi form, progress), Izin/Sakit (Volunteer), Baptisan/Pemberkatan Nikah/Penyerahan Anak (formulir multi-step + dokumen), Status Pendaftaran (gabungan semua status), Sertifikat Saya, Persembahan (QRIS/rekening + catat + riwayat).

**PKS**: semua di atas + Dashboard PKS (`/pks`) 6 tab — Anggota (detail kontak tanpa NIK), Absensi, Ulang Tahun (kirim pesan personal), Persembahan Komsel (input + riwayat), Evaluasi, Profil.

**Admin**: Dashboard (statistik), Jemaat (CRUD, approve pendaftaran, **Tambah Jemaat baru**), Berita, Events (+ pendaftar + rekap kehadiran + filter tanggal + export Excel), Kelas (+ pendaftar + rekap kehadiran + filter + export Excel), Tugas & Form (builder field dinamis, kategori wajib, batasan role/ministry), Evaluasi & Laporan (rekap lintas tugas, cetak), Izin/Sakit (approve), Persembahan (tab Rekap + Komsel + Rekening, export `.xlsx` berjudul), Baptisan/Nikah/Penyerahan Anak (review status + cetak arsip), Sertifikat (terbitkan manual), Surat Peringatan, Ministry, Komsel (+ Kategori Komsel + shortcut filter kategori + Tambah Anggota Cepat), Hak Akses (Super Admin), Kategori Tugas (Super Admin).

## Verifikasi & Workflow

Tidak ada kredensial Admin/PKS/Jemaat tersimpan untuk login otomatis di browser saat development — verifikasi perubahan dengan `npx vite build` (harus sukses, 0 error) dan baca-ulang logic RLS/komponen yang diubah. Untuk fitur yang butuh interaksi nyata (export Excel, push notification, alur multi-role), laporkan eksplisit ke user apa yang perlu mereka tes manual setelah deploy + jalankan migrasi SQL terbaru.

Commit & push: **selalu konfirmasi ke user dulu** sebelum `git commit`/`git push`, walau perubahan sudah di-build & diverifikasi. Push ke `master` saja.

# ESC Siantan — Manual Operasi Proyek

Aplikasi manajemen gereja (PWA) untuk **Evangelical Sion Church Siantan, Pontianak** — **SUDAH PRODUCTION** di `https://escsiantan.my.id` dengan data jemaat sungguhan (±200 akun, NIK, alamat, keuangan persembahan). Setiap perubahan yang kamu push akan dipakai orang betulan hari itu juga. Bekerjalah dengan standar itu.

Bahasa kerja proyek ini **Bahasa Indonesia**: komentar kode, pesan commit, teks UI, dokumen — semuanya Indonesia (UI juga punya locale `en`).

## 0. Sumber kebenaran (urutannya penting)

1. **Kode & schema.sql yang ada sekarang** — bukan dokumen. Dokumen (termasuk file ini, `PROJECT_HANDOFF.md`, memory) adalah potret masa lalu dan **terbukti pernah basi** (file ini pernah bilang migrasi terakhir v28 padahal sudah v42).
2. **Database production bisa berbeda dari `schema.sql`** — drift TERBUKTI terjadi (news/events punya policy tulis di production yang tidak tercatat di file). Untuk pekerjaan RLS/policy, verifikasi ke production dulu (lihat skill `audit-rls`).
3. **Nomor migrasi terbaru**: JANGAN percaya angka di dokumen mana pun. Selalu cek dengan `grep "── Migrasi v" supabase/schema.sql` dan ambil angka tertinggi.
4. Status "migrasi vNN sudah dijalankan user atau belum" hanya user yang tahu — kalau relevan dan tidak tercatat, **tanya**.

## 1. Tech stack

- **Frontend**: React 18 + Vite 5 + Tailwind CSS v4 (`@theme` di `src/index.css`, TIDAK ADA `tailwind.config.js`) + React Router 6
- **Backend**: Supabase (Postgres + Auth + Storage + RLS), project sendiri, tanpa migration runner
- **Serverless**: Vercel Functions (folder `api/`, Node runtime, untuk yang butuh service-role key)
- **Deploy**: Vercel auto-deploy dari branch **`master`** (production project bernama `gerejaku`)
- **PWA**: vite-plugin-pwa (`generateSW`); distribusi resmi = **PWA via Chrome**, BUKAN APK
- **i18n**: `src/lib/i18n.js` — flat key-value, locale `id`/`en`, interpolasi `{param}` via `t(key, {param})`
- **Excel**: ExcelJS via `src/lib/exportXlsx.js` (`downloadXlsx({filename, titleLines, headers, rows})`)
- **QR**: `html5-qrcode` (scan) + `qrcode` (generate); ikon `lucide-react`
- **Tes otomatis: TIDAK ADA.** Gerbang verifikasi satu-satunya = `npx vite build` sukses + baca-ulang logika.

## 2. Kesalahan bernama — dan aturan yang mencegahnya

Daftar ini adalah kesalahan yang *pasti* dilakukan model yang tidak hati-hati di repo ini. Tiap butir: **Nama kesalahan** → aturan.

1. **Dokumen Basi** — mempercayai nomor migrasi / daftar rute / daftar tabel dari dokumen. → Grep kode/schema dulu sebelum menyatakan fakta tentang kondisi sistem.
2. **Drift Schema** — men-`DROP POLICY`/menimpa policy berdasarkan isi `schema.sql` saja. → Sebelum mengubah policy pada tabel yang tidak baru kamu buat sendiri, minta user jalankan query dump policy production (ada di skill `audit-rls`) dan cocokkan. Menimpa buta bisa MEMBUKA celah atau MENGUNCI admin.
3. **Salah Branch** — push ke `main`. → Hanya `git push origin master`. Push ke `main` membuat preview URL Vercel yang membingungkan user.
4. **Commit Tanpa Izin** — langsung commit/push setelah selesai coding. → SELALU tunjukkan ringkasan perubahan + usulan pesan commit, tunggu konfirmasi user, baru commit. Tanpa kecuali, walau build sudah hijau.
5. **`git add .`** — menyeret file kerja untracked (pptx, `PROJECT_HANDOFF.md`, `task.md`, `rn-preview/`, dll yang sengaja tidak di-commit). → Stage per-path eksplisit, jangan pernah `git add .`/`-A`.
6. **Ring & Shadow Hantu** — memakai `ring-*` atau `shadow-md`. → Di build ini keduanya TIDAK menghasilkan CSS (spesifik konfigurasi `@theme` proyek ini; sudah diverifikasi). Pakai `outline`/`border` CSS biasa. Arbitrary value (`grid-rows-[1fr]`) aman.
7. **Kelas Tailwind Rakitan** — `` `bg-${color}-100` ``. → JIT scanner butuh string literal utuh. Kalau perlu warna per-index, buat array string kelas lengkap (contoh: `FOLDER_THEMES` di `TasksPage.jsx`).
8. **Insting `dark:`** — mengubah warna dark mode pakai prefix `dark:` atau `bg-gray-100` untuk elemen interaktif. → Dark mode di sini = remap CSS variable di blok `.dark {}` di `src/index.css`. Elemen interaktif (tombol secondary, chip, tab) pakai token `--color-control`/`--color-control-hover` (utility `bg-control`), karena gray-100/200 nyaris identik dengan background card saat dark.
9. **Update Poin Langsung** — `.update({ points })` dari klien. → Trigger `guard_user_privilege_cols` menolaknya. Saldo `users.points` hanya ditulis fungsi `SECURITY DEFINER` (trigger kehadiran, RPC `award_biodata_points`/`redeem_ticket`). Semua akses poin lewat `src/services/pointsService.js`.
10. **Reinvent Helper RLS** — menulis ulang subquery role di policy baru. → Wajib pakai helper yang ada: `auth_user_role()`, `auth_user_id()`, `auth_user_role_secondary()`, `auth_leads_komsel(komsel_id)`, `auth_admin_can('/admin/<page>')` — semua `SECURITY DEFINER`.
11. **Migrasi Tidak Idempotent / Mengedit Blok Lama** — → `schema.sql` append-only: blok baru di AKHIR file, nomor berikutnya, dan setiap statement aman dijalankan ulang (`IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP POLICY IF EXISTS` sebelum `CREATE POLICY`, `CREATE OR REPLACE`). Blok lama tidak boleh diubah.
12. **UTC Midnight** — kolom Postgres `DATE` di-parse JS sebagai UTC midnight. → `getUTC*()` untuk tanggal yang DISIMPAN, `get*()` biasa untuk "hari ini" lokal (asimetri di `cron-birthdays.js` & `PKSDashboardPage.jsx` itu disengaja). Batas "hari" di sisi server/DB = zona **WIB / Asia/Jakarta** (lihat `guard_once_per_day`).
13. **Join Ambigu PostgREST** — tabel dengan 2+ FK ke tabel yang sama (mis. `birthday_messages.recipient_id` & `sender_id` → `users`). → Wajib hint `tabel!nama_kolom(fields)`, bukan nama constraint.
14. **String Tanpa i18n** — hardcode teks UI. → Setiap string yang dilihat user masuk `i18n.js` dengan kunci `id` DAN `en`, dipakai via `t()`.
15. **Refleks SheetJS** — `import * as XLSX from 'xlsx'`. → Dilarang (2 CVE HIGH belum dipatch). Semua export Excel lewat `downloadXlsx` (ExcelJS).
16. **"Migrasi Otomatis Jalan"** — mengira schema berubah begitu file diedit. → Tidak ada runner. Laporan akhir WAJIB menyebut "jalankan Migrasi vNN di Supabase SQL Editor" bila ada blok baru.
17. **Melonggarkan Privasi** — menampilkan NIK ke Admin/PKS, atau membolehkan Admin biasa mengedit biodata. → NIK hanya Super Admin (UI + trigger `guard_biodata_admin_edit`). Biodata pribadi jemaat lain hanya Super Admin. `role`/`role_secondary` hanya Super Admin (v41-A). `is_pks` = hak khusus admin ber-akses `/admin/komsel`. PKS lihat kontak anggota komselnya TANPA NIK. Jangan pernah melonggarkan tanpa keputusan eksplisit user.
18. **Menyarankan APK** — menambah tombol unduh APK / mengarahkan user ke Play Store. → Push notification TIDAK andal lewat APK TWA (bug `DelegationService`). Keputusan produk final: distribusi resmi = PWA via Chrome (`InstallPrompt.jsx`).
19. **"Sudah Dites"** — mengklaim fitur teruji. → Tidak ada kredensial login untuk browser dev & tidak ada test. Yang jujur: "build sukses, logika sudah dibaca ulang; yang perlu kamu tes manual setelah deploy: …".
20. **Halaman Admin Setengah Jadi** — menambah rute admin tanpa wiring lengkap. → Halaman admin baru = rute di `App.jsx` + entri `config/adminPages.js` (agar bisa dibatasi Hak Akses) + kunci i18n `admin.nav.*`/`admin.sec.*` + pertimbangan gerbang tulis `auth_admin_can()`. Halaman khusus Super Admin (Hak Akses, Kategori Tugas, Backup, Audit) TIDAK masuk `adminPages.js` — di-hardcode di `AdminLayout.jsx`.
21. **Validasi Klien Saja** — menegakkan aturan bisnis hanya di React. → Ini temuan pentest berulang di proyek ini (once_per_day, jadwal form, privilege cols). Setiap aturan yang bisa di-bypass lewat PostgREST langsung harus ditegakkan juga di DB (trigger/policy/RPC) ATAU dilaporkan eksplisit ke user sebagai "masih client-only".
22. **Endpoint Telanjang** — menambah file `api/` tanpa pengaman standar. → Pola wajib: cek method → rate limit (`api/_lib/rate-limit.js`) untuk endpoint publik → env var di-trim & dicek → jangan bocorkan detail internal di error. Cron diproteksi header `CRON_SECRET`. CORS & security headers diatur di `vercel.json`.

## 3. Konvensi

### Kode
- Service = satu file per domain di `src/services/` (`contentService.js` menampung banyak domain kecil: events/news/classes/komsel/registrations/certificates). Pola method: query supabase → `if (error) throw error` → return data. Halaman TIDAK memanggil `supabase` langsung — lewat service.
- Komponen UI dari `src/components/ui/index.jsx`: `Button, Input, Textarea, Select, Checkbox, Card, Badge, StatusBadge, Avatar, PageHeader, GradientHeader, SectionHeader, EmptyState, Skeleton, SkeletonCard, Spinner`. Jangan bikin tombol/input polos baru kalau komponen ini cukup.
- Warna lewat token brand (`bg-brand-500` dst.) & gradient `--gradient-1..3` (identitas oranye→merah, sengaja SAMA di light/dark).
- Komentar kode bahasa Indonesia, menjelaskan KENAPA (constraint), bukan apa.
- `app_settings`: key-value global (kolom `value` bertipe **text** — JSON di-stringify manual).

### Commit
Format: `feat|fix|refactor|chore|docs|clean: deskripsi singkat bahasa Indonesia` (lihat `git log`). Satu commit bisa memuat beberapa perubahan terkait. **Selalu konfirmasi dulu.**

### Migrasi database (ringkas — detail di skill `migrasi-db`)
- `supabase/schema.sql` = satu file akumulatif, append-only, header blok: `-- ── Migrasi vNN: <deskripsi> ──`
- Dijalankan MANUAL oleh user di Supabase SQL Editor.
- ID generik: `'PREFIX-' || replace(gen_random_uuid()::text, '-', '')` (atau epoch).
- Tabel baru → langsung `ENABLE ROW LEVEL SECURITY` + policy (baca=login, tulis=admin, kecuali ada alasan) — 3 tabel pernah ketahuan hidup TANPA RLS (v31).
- Blok yang lahir dari temuan keamanan ditulis dengan pola komentar `TEMUAN:` / `KEPUTUSAN OPERATOR:` / perbaikan — pertahankan gaya ini.

### Model peran
5 role di `users.role`: **Jemaat, Volunteer, PKS, Admin, Super Admin** (+ `role_secondary` opsional; Admin/Super Admin boleh merangkap PKS via `users.is_pks` + `komsel_leaders`).
- **Jemaat** — app utama (`/`)
- **Volunteer** — + SOP Rohani (Tugas/Form) + Izin/Sakit
- **PKS** — `is_pks = true` ATAU role/role_secondary 'PKS' → `/pks` (6 tab: Anggota, Absensi, Ulang Tahun, Persembahan Komsel, Evaluasi, Profil)
- **Admin** — `/admin`, dibatasi per-halaman via Hak Akses (`admin_user_permissions.allowed_pages`; NULL = akses penuh, `[]` = kosong). Sejak v41-B, Hak Akses = batas keamanan NYATA lingkup **TULIS** (READ bebas untuk semua admin) — ditegakkan bertahap via `auth_admin_can()`.
- **Super Admin** — semua + Hak Akses, Kategori Tugas, Backup, Audit Log, ubah role & biodata.

### Alur akun (sering disalahpahami)
Tiga jalan baris `users` mendapat login:
1. **Self-register** `/register` — `auth.signUp()` + profil `status: 'Menunggu Persetujuan'` → Admin approve. Duplikat email+HP dicek via `api/check-phone.js`.
2. **Admin Tambah Jemaat** — profil `auth_id: NULL`, `status: 'Aktif'`; jemaat belum punya password.
3. **Aktivasi** `/aktivasi` — untuk `auth_id IS NULL`: HP → OTP WhatsApp (Fonnte) → `api/activate-verify.js` (service role) membuat `auth.users` & menautkan.

Login bisa pakai nomor HP (`api/login-phone.js`).

### Sistem poin & QR
+1 poin otomatis (trigger DB) saat insert `class_attendance` / `event_attendance` / `sunday_attendance` / `komsel_attendance` (komsel HANYA yang ber-`session_id` = hasil scan QR; checklist manual PKS tidak memberi poin). +5 poin biodata lengkap via RPC. Penukaran via `redeem_ticket`.
Prefix QR (semua ditangani `AttendanceScanPage.jsx`): `ESC-ABSEN:<classId>:<sesi>` · `ESC-EVENT:<eventId>` · `ESC-KOMSEL:<sessionId>` · `ESC-SUNDAY:<YYYY-MM-DD>` · `ESC-REDEEM:<ticketId>`.

### Status Kelas & Event
`Mulai` → `Sedang Berlangsung` → `Selesai` (event juga boleh `Dibatalkan`). Beranda/daftar menampilkan Mulai + Sedang Berlangsung; `Selesai` = tab riwayat.

### Storage
`documents` (privat; dokumen sakramen/sertifikat via `registrationService.uploadDocument`) · `profile-photos` (publik; avatar + gambar produk) · `task-files` (lampiran jawaban & background form). Bucket dibuat manual di Dashboard.

## 4. Standar kualitas per deliverable (checklist, bukan kata sifat)

### Semua perubahan kode
- [ ] `npx vite build` exit 0, tanpa error baru.
- [ ] Tidak ada string UI baru di luar `i18n.js`; kunci `id` + `en` keduanya terisi.
- [ ] Laporan akhir memuat: file yang diubah, migrasi yang harus dijalankan (kalau ada), dan daftar tes manual untuk user.

### Perubahan UI
- [ ] Memakai komponen `ui/index.jsx` bila ada padanannya.
- [ ] Tidak ada `ring-*`/`shadow-md`; tidak ada kelas Tailwind hasil interpolasi.
- [ ] Dark mode dicek: warna via token/`.dark` override; permukaan interaktif pakai `bg-control`.
- [ ] Layout diperiksa untuk lebar HP (±380px) — ini app bottom-nav mobile-first.

### Migrasi database
- [ ] Blok baru di akhir file, header `-- ── Migrasi vNN: … ──` dengan NN = hasil grep + 1.
- [ ] Setiap statement idempotent (bisa dijalankan 2× tanpa error/efek ganda).
- [ ] Helper RLS existing dipakai, tidak ada subquery role tulisan tangan.
- [ ] Tabel baru: RLS enabled + policy lengkap, PK pakai pola prefix-ID.
- [ ] Tidak ada `DROP POLICY` pada policy yang belum diverifikasi ada di production (drift!).
- [ ] Layanan klien (`src/services/`) diperbarui mengikuti kolom/tabel baru.
- [ ] Instruksi run untuk user tertulis di laporan akhir.

### Endpoint `api/` baru/diubah
- [ ] Cek `req.method`; 405 untuk selainnya.
- [ ] Rate limit dipasang bila endpoint publik/tanpa auth.
- [ ] Tidak ada secret di response/error; env var dicek keberadaannya.
- [ ] Cron baru: masuk `vercel.json` `crons` + validasi `CRON_SECRET`.

### Perubahan keamanan/RLS
- [ ] Ground truth production diverifikasi dulu (dump policy) bila menyentuh policy lama.
- [ ] Ditegakkan di DB, bukan cuma disembunyikan di UI (UI menyusul sebagai kosmetik).
- [ ] Blok migrasi memuat komentar TEMUAN/KEPUTUSAN.
- [ ] Dipastikan alur sah tidak ikut terkunci: service role/SQL Editor (`caller_role NULL`) tetap lewat bila memang dibutuhkan backend.
- [ ] Tidak menyapu lebih luas dari keputusan user (contoh: Hak Akses = lingkup TULIS saja, READ dibiarkan).

### Laporan akhir tugas (selalu)
- [ ] Kalimat pertama = hasil. Lalu: yang berubah, migrasi yang harus dijalankan, tes manual, dan risiko/sisa pekerjaan yang diketahui.

## 5. Kapan BERHENTI dan tanya user

**Wajib berhenti & tanya sebelum:**
- `git commit` / `git push` apa pun.
- Menjalankan/menyuruh jalankan SQL yang destruktif (DROP TABLE, DELETE massal, UPDATE data production).
- `DROP`/mengganti policy atau trigger yang tidak bisa kamu konfirmasi wujud production-nya.
- Melonggarkan aturan privasi/keamanan apa pun (NIK, biodata, role, Hak Akses, poin).
- Mengubah perilaku alur auth (register/aktivasi/login-phone/OTP) yang berdampak ke akun existing.
- Menambah layanan pihak ketiga / dependensi berbayar / apa pun yang mengirim data jemaat keluar (contoh: Sentry sudah pernah ditawarkan — user BELUM memutuskan).
- Keputusan produk (perilaku fitur yang bisa dua arah) — user proyek ini terbiasa mengambil "keputusan operator" eksplisit; sodorkan opsi + rekomendasi, jangan putuskan sendiri.

**Jangan tanya (kerjakan saja):** pilihan gaya kode, helper mana yang dipakai, menambah kunci i18n, refactor kecil yang perilakunya identik, menjalankan `npx vite build`, membaca file mana pun.

## 6. Peta referensi (per Juli 2026 — verifikasi ulang bila ragu)

### Rute user (`/`, `UserLayout`)
`profil`, `profil/edit`, `pengaturan`, `informasi(/:id)`, `events(/:id)`, `kelas(/:id)`, `kelas/absen`, `scan`, `tugas(/:id)` (label UI: **SOP Rohani**), `baptisan`, `pemberkatan-nikah`, `penyerahan-anak`, `ktj`, `sertifikat`, `status-pendaftaran`, `persembahan`, `poin`, `izin`, `pks`. Di luar layout: `/onboarding`, `/kebijakan-privasi`, `/login`, `/register`, `/lupa-password`, `/aktivasi`, `/reset-password`.

### Rute admin (`/admin`, `AdminLayout`)
`jemaat(/:id)`, `berita(/baru|/:id/edit)`, `events(/baru|/:id/edit)`, `kelas`, `roadmap`, `tugas(/baru|/:id/edit|/:id/jawaban)`, `evaluasi`, `izin`, `baptisan(/:id)`, `nikah(/:id)`, `penyerahan-anak(/:id)` (tiga terakhir satu komponen `AdminRegistrationDetailPage`, deteksi jenis dari pathname), `sertifikat`, `ktj(/:id)`, `sp`, `ministry`, `komsel`, `persembahan`, `ibadah-minggu`, `tukar-poin`, dan **Super Admin only**: `hak-akses`, `kategori-tugas`, `backup`, `audit`.

### Tabel
`users`, `ministries`, `user_ministries`, `komsel`, `komsel_categories`, `komsel_leaders`, `komsel_sessions`, `komsel_attendance`, `komsel_offerings`, `news`, `events`, `event_registrations`, `event_attendance`, `classes`, `class_registrations`, `class_attendance`, `form_templates`, `template_ministries`, `form_responses`, `task_categories`, `task_category_ministries`, `task_leaves`, `baptism_registrations`, `wedding_registrations`, `child_dedication_registrations`, `ktj_registrations`, `registration_prerequisites`, `certificates`, `birthday_messages`, `offerings`, `payment_accounts`, `push_subscriptions`, `admin_user_permissions`, `app_settings`, `audit_log`, `redeemable_products`, `point_transactions`, `redemption_tickets`, `sunday_attendance`, `password_reset_otp`, `activation_otp`.

### Serverless (`api/`)
| File | Fungsi |
|---|---|
| `check-phone.js` | Cek duplikat HP + email saat registrasi (rate-limited ketat) |
| `activate-request.js` / `activate-verify.js` | Aktivasi akun: OTP WA → buat & tautkan `auth.users` |
| `login-phone.js` | Login via nomor HP |
| `wa-reset-request.js` / `wa-reset-verify.js` | Lupa password via OTP WhatsApp |
| `delete-user.js` | Hapus akun permanen (menegakkan `auth_admin_can('/admin/jemaat')`) |
| `notify-pks.js` | Push ke PKS saat anggota isi tugas (publik tapi divalidasi) |
| `send-push.js` | Kirim web-push (VAPID) |
| `cron-reminders.js` | Cron 3×/hari (slot pagi/siang/sore, jadwal di `vercel.json`) — pengingat SOP |
| `cron-birthdays.js` | Cron harian — ulang tahun anggota komsel ke PKS |
| `ping.js` | Health check |
| `_lib/rate-limit.js` | Rate limiter in-memory per-IP, dipakai endpoint publik |

### Services (`src/services/`)
`usersService`, `contentService` (events/news/classes/komsel/registrations/certificates), `tasksService`, `evaluationService`, `leavesService`, `offeringsService`, `attendanceService`, `pointsService`, `birthdayService`, `pushService`, `permissionsService`, `auditService`, `storageService`.

## 7. Skills proyek

Ada 3 skill khusus repo ini di `.claude/skills/` — pakai bila tugasnya cocok, jangan kerjakan manual:
- **`migrasi-db`** — menulis blok migrasi baru di `schema.sql` dengan semua rel pengaman.
- **`rilis`** — ritual commit→push→deploy lengkap, termasuk penanganan webhook Vercel macet.
- **`audit-rls`** — audit keamanan RLS/policy khas proyek ini (drift-aware, per jenjang role).

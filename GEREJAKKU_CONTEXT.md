# GerejaKu App — Konteks Proyek untuk Claude Code

## Ringkasan Proyek
Aplikasi manajemen gereja berbasis web dengan nama **GerejaKu**, dibangun untuk gereja **ESC Siantan, Pontianak, Kalimantan Barat**.

## Status Saat Ini
- Project React sudah dibuat dan berjalan di VS Code
- Supabase sudah terhubung (URL: https://cgbqgljhwajabwugefcx.supabase.co)
- Schema SQL sudah dijalankan di Supabase (semua tabel sudah ada)
- Login dan Register sudah berfungsi
- npm run dev sudah berjalan di localhost:5173

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deploy**: Vercel (belum setup)
- **Bahasa UI**: Bahasa Indonesia

## Tema Desain
- Orange Gradient dengan Red dan Black
- Warna utama: `#FF6B35` (orange) → `#E63946` (red) → `#2d0a0a` (dark)
- Mobile-first, max-width 420px untuk tampilan user
- Admin panel dengan sidebar desktop + drawer mobile

## Struktur Folder Project
```
gerejakku/
├── src/
│   ├── App.jsx                    ← semua routes (SUDAH ADA)
│   ├── main.jsx                   ← entry point (SUDAH ADA)
│   ├── index.css                  ← tema + tailwind (SUDAH ADA)
│   ├── lib/
│   │   ├── supabase.js            ← koneksi Supabase (SUDAH ADA)
│   │   └── utils.js               ← helper functions (SUDAH ADA)
│   ├── contexts/
│   │   └── AuthContext.jsx        ← login, register, logout (SUDAH ADA)
│   ├── hooks/
│   │   └── useAuth.js             ← hook auth (SUDAH ADA)
│   ├── layouts/
│   │   ├── UserLayout.jsx         ← bottom nav 5 tab (SUDAH ADA)
│   │   └── AdminLayout.jsx        ← sidebar admin (SUDAH ADA)
│   ├── services/
│   │   ├── usersService.js        ← CRUD jemaat (SUDAH ADA)
│   │   ├── tasksService.js        ← form templates + responses (SUDAH ADA)
│   │   └── contentService.js     ← events, news, baptisan, nikah (SUDAH ADA)
│   ├── components/
│   │   └── ui/index.jsx           ← Button, Input, Card, Badge, Avatar, dll (SUDAH ADA)
│   └── pages/
│       ├── auth/
│       │   ├── LoginPage.jsx      ← SELESAI & BERFUNGSI
│       │   └── RegisterPage.jsx   ← SELESAI & BERFUNGSI
│       ├── user/
│       │   ├── HomePage.jsx       ← SELESAI (greeting, quick links, news, events)
│       │   ├── TasksPage.jsx      ← SELESAI (list form + progress bar)
│       │   └── [lainnya]          ← PLACEHOLDER, belum diisi
│       ├── admin/
│       │   ├── AdminDashboardPage.jsx ← SELESAI (stats + recent members)
│       │   └── [lainnya]          ← PLACEHOLDER, belum diisi
│       └── placeholders.jsx       ← semua halaman belum jadi ada di sini
├── supabase/
│   └── schema.sql                 ← SQL schema (SUDAH DIJALANKAN di Supabase)
├── scripts/
│   └── migrate_data.py            ← script import data Excel ke Supabase
├── .env                           ← SUDAH DIISI (jangan di-commit ke GitHub)
├── package.json
└── vite.config.js
```

## Database Supabase — Tabel yang Sudah Ada
```
users                  ← data jemaat (193 orang dari database lama)
admin_data             ← data admin
ministries             ← 38 ministry (Music, Worship, Kids, Parking, dll)
komsel                 ← data komsel
news                   ← berita & pengumuman
events                 ← acara gereja
event_registrations    ← pendaftaran event
classes                ← kelas/pembinaan
form_templates         ← template tugas (Alkitab, Olahraga, Saat Teduh, dll)
form_responses         ← jawaban tugas jemaat
baptism_registrations  ← pendaftaran baptisan
wedding_registrations  ← pendaftaran pemberkatan nikah
```

## Data Existing dari Database Lama (Excel)
- 193 jemaat/volunteer (belum diimport ke Supabase, masih di Excel)
- Role: Volunteer, Jemaat, PKS, Admin, Super Admin
- Field user: user_id, username, name, email, phone, role, status, gender, birth_date, birth_place, address, blood_type, social_media, photo_url, nik, ministry_ids, komsel_id, sp_level, sp_notes
- 38 Ministry: Music, Worship, Kids, Parking, Usher, Finance, EO, dll
- 3 Komsel: Komsel Pria Dewasa 3, Komsel Kids, Komsel Pria Muda
- 13 Form Template tugas: Alkitab, Saat Teduh, Puasa, Olahraga, Bahasa Roh, Buku GenerationS, Rapat Ministry, Vocal Leasing, Fingering & Sticking, dll
- Field SP (Surat Peringatan): Aman / SP 1 / SP 2 / SP 3

## Fitur Aplikasi
### User (Jemaat/Volunteer)
1. Login & Register ← SELESAI
2. Beranda (Home) ← SELESAI
3. Profil & Bio ← BELUM (placeholder)
4. Edit Profil ← BELUM (placeholder)
5. Informasi & Pengumuman ← BELUM (placeholder)
6. Events & Pendaftaran ← BELUM (placeholder)
7. Kelas/Pembinaan ← BELUM (placeholder)
8. Tugas (list) ← SELESAI
9. Tugas (isi jawaban detail) ← BELUM (placeholder)
10. Pendaftaran Baptisan ← BELUM (placeholder)
11. Pendaftaran Pemberkatan Nikah ← BELUM (placeholder)
12. Status Pendaftaran ← BELUM (placeholder)

### Admin
1. Dashboard ← SELESAI (stats + recent members)
2. Kelola Jemaat ← BELUM (placeholder)
3. Kelola Events ← BELUM (placeholder)
4. Kelola Berita/Info ← BELUM (placeholder)
5. Kelola Kelas ← BELUM (placeholder)
6. Form & Tugas (buat template) ← BELUM (placeholder)
7. Lihat Jawaban Tugas ← BELUM (placeholder)
8. Pendaftaran Baptisan (review) ← BELUM (placeholder)
9. Pemberkatan Nikah (review) ← BELUM (placeholder)
10. Surat Peringatan (SP) ← BELUM (placeholder)
11. Ministry ← BELUM (placeholder)
12. Komsel ← BELUM (placeholder)

## Urutan Build yang Direkomendasikan
1. ProfilePage & EditProfilePage (user)
2. InformationPage & EventsPage (user)
3. TaskDetailPage — isi jawaban form
4. BaptismPage & WeddingPage (form multi-step)
5. AdminMembersPage — kelola jemaat
6. AdminTasksPage + AdminTaskResponsesPage
7. AdminBaptismPage + AdminWeddingPage
8. AdminSPPage
9. Import data Excel → Supabase (migrate_data.py)
10. Setup PWA (manifest + service worker)
11. Deploy ke Vercel

## Komponen UI yang Sudah Ada (src/components/ui/index.jsx)
Button, Input, Textarea, Select, Card, Badge, Avatar,
PageHeader, StatusBadge, EmptyState, Spinner, GradientHeader

## Utility Functions (src/lib/utils.js)
- formatDate(date, fmt) — format tanggal Indonesia
- hitungUmur(tanggalLahir) — hitung umur
- excelSerialToDate(serial) — konversi serial Excel ke tanggal
- getInitials(name) — ambil inisial nama
- formatPhone(phone) — normalisasi nomor HP
- truncate(str, n) — potong teks panjang
- avatarColor(name) — warna avatar konsisten
- spColor(status) — warna badge SP

## Catatan Penting
- Password lama di database Excel disimpan plain text → JANGAN diimport, reset semua via Supabase Auth
- API key Supabase sudah pernah terekspos di chat → GANTI key di Supabase dashboard sekarang juga
- Storage Bucket Supabase belum dibuat → perlu buat: profile-photos (public), task-files (private), documents (private)
- RLS (Row Level Security) sudah diaktifkan di semua tabel penting
- Alias path "@/" sudah dikonfigurasi di vite.config.js → gunakan @/components/... bukan ../../../

## Cara Lanjutkan di Claude Code
Jalankan di terminal project:
```bash
claude
```
Lalu minta Claude Code untuk mengerjakan halaman berikutnya, contoh:
- "Buatkan ProfilePage.jsx untuk user"
- "Buatkan AdminMembersPage.jsx dengan search dan filter"
- "Buatkan BaptismPage.jsx dengan form multi-step"


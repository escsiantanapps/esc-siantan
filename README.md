# GerejaKu App

Aplikasi manajemen gereja berbasis web dengan React + Supabase.

## Tech Stack
- **Frontend**: React 18 + Vite + Tailwind CSS
- **Backend**: Supabase (Auth + PostgreSQL + Storage)
- **Deploy**: Vercel

## Fitur
- Auth (Login / Register)
- Profil & Bio Jemaat
- Informasi & Pengumuman
- Events & Pendaftaran
- Kelas / Pembinaan
- Tugas (Form Templates + Responses)
- Baptisan & Pemberkatan Nikah
- Dashboard Admin
- Panel SP (Surat Peringatan)
- Komsel & Ministry Management

## Cara Jalankan

```bash
npm install
npm run dev
```

## Environment Variables

Buat file `.env` di root project:

```
VITE_SUPABASE_URL=https://xxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

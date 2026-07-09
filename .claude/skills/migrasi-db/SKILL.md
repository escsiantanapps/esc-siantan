---
name: migrasi-db
description: Menulis blok migrasi bernomor baru di supabase/schema.sql untuk ESC Siantan (append-only, idempotent, RLS-aware, drift-aware). Gunakan setiap kali tugas butuh perubahan skema database — tabel/kolom/policy/trigger/function/RPC baru, "migrasi", "tambah kolom", "tabel baru", "ubah RLS", atau ALTER/CREATE apa pun di Supabase.
---

# Migrasi Database ESC Siantan

Konteks: `supabase/schema.sql` adalah SATU file akumulatif berisi seluruh riwayat migrasi. Tidak ada migration runner — user menjalankan blok baru secara MANUAL di Supabase Dashboard → SQL Editor. Database production TERBUKTI pernah drift dari file ini. Skill ini mencegah tiga kecelakaan yang pernah/nyaris terjadi: nomor migrasi salah, migrasi tidak idempotent, dan menimpa policy production secara buta.

## Langkah

### 1. Tentukan nomor migrasi yang BENAR
Jangan percaya dokumen mana pun. Jalankan:
```
grep -n "── Migrasi v" supabase/schema.sql
```
Ambil angka tertinggi; blok baru = angka itu + 1. Satu tugas = satu blok (boleh berisi banyak statement); jangan pecah jadi beberapa nomor kecuali user meminta.

### 2. Baca konteks yang akan disentuh
Sebelum menulis apa pun, baca di `schema.sql`:
- Definisi tabel yang akan diubah + SEMUA policy & trigger yang sudah menempel padanya (cari nama tabel di seluruh file — policy bisa ditambah di migrasi mana pun).
- Trigger penjaga yang mungkin menolak perubahanmu: `guard_user_privilege_cols` (kolom role/is_pks/status/sp/points/nij/kartu di `users`), `guard_biodata_admin_edit` (biodata & NIK), `guard_once_per_day` (form_responses).
- Helper yang WAJIB dipakai ulang (semua `SECURITY DEFINER`, jangan tulis ulang subquery-nya):
  - `auth_user_role()` / `auth_user_role_secondary()` — role pemanggil
  - `auth_user_id()` — user_id (bukan auth.uid())
  - `auth_leads_komsel(komsel_id)` — pemanggil memimpin komsel ini?
  - `auth_admin_can('/admin/<page>')` — pemanggil boleh MENULIS area halaman admin ini? (Super Admin=selalu; Admin tanpa baris hak-akses=ya; role lain=tidak; caller NULL=tidak)

### 3. Cek drift SEBELUM menyentuh policy lama
`schema.sql` ≠ production (kasus nyata: news/events punya policy tulis di production yang tidak ada di file). Aturan:
- **Policy/trigger pada tabel yang baru kamu buat di blok ini** → aman, tulis langsung.
- **`DROP POLICY` / `CREATE OR REPLACE` pada objek lama** → BERHENTI. Minta user jalankan query ini dulu di SQL Editor dan tempelkan hasilnya:
```sql
SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
       p.polname AS policy, p.polcmd AS cmd,
       pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
       pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname = '<nama_tabel>'
ORDER BY c.relname, p.polname;
```
Baru tulis migrasi setelah hasilnya cocok dengan asumsimu. Menimpa buta bisa MEMBUKA celah atau MENGUNCI admin.

### 4. Tulis blok migrasi
Tambahkan di **AKHIR file** (append-only — blok lama tidak boleh diedit):

```sql
-- ── Migrasi vNN: <deskripsi singkat> ──────────────────────────────
```

Aturan isi blok:
- **Idempotent total** — blok harus aman dijalankan 2×:
  - `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE … ADD COLUMN IF NOT EXISTS`
  - `DROP POLICY IF EXISTS "nama" ON tabel;` SEBELUM setiap `CREATE POLICY`
  - `CREATE OR REPLACE FUNCTION`, `DROP TRIGGER IF EXISTS` sebelum `CREATE TRIGGER`
  - `CREATE INDEX IF NOT EXISTS`, `INSERT … ON CONFLICT DO NOTHING`
- **PK pola proyek**: `'PREFIX-' || replace(gen_random_uuid()::text, '-', '')` (atau epoch untuk ID pendek).
- **Tabel baru = RLS langsung**: `ALTER TABLE x ENABLE ROW LEVEL SECURITY;` + policy minimal (baca = user login, tulis = Admin/Super Admin via helper) — kecuali ada alasan yang ditulis sebagai komentar. Tiga tabel pernah ketahuan hidup tanpa RLS (Migrasi v31); jangan menambah kasus baru.
- **Fungsi**: `SECURITY DEFINER` hanya bila perlu menembus RLS, selalu `SET search_path = public`, dan `REVOKE EXECUTE … FROM PUBLIC; GRANT EXECUTE … TO authenticated;` untuk RPC klien.
- **Batas "hari"** di trigger/fungsi = zona WIB: `date_trunc('day', (now() AT TIME ZONE 'Asia/Jakarta')) AT TIME ZONE 'Asia/Jakarta'`.
- **Urutan definisi**: fungsi yang dipanggil fungsi/trigger lain harus didefinisikan LEBIH DULU dalam blok (check_function_bodies memvalidasi referensi saat CREATE).
- **`caller_role NULL`** (SQL Editor / service role) = konteks backend tepercaya — guard biasanya harus MELEWATINYA agar operasi admin via SQL Editor & endpoint service-role tetap jalan. Tiru pola di `guard_user_privilege_cols`.
- **Blok hasil temuan keamanan** ditulis dengan gaya dokumentasi proyek: komentar `TEMUAN:` (apa celahnya + tanggal), `KEPUTUSAN OPERATOR:` (apa yang diputuskan user), lalu perbaikannya.
- **Poin**: saldo `users.points` hanya boleh ditulis lewat `apply_points` / escape hatch `current_setting('app.allow_points_update')` — jangan buat jalur tulis poin baru di luar pola ini.

### 5. Perbarui lapisan klien
- Kolom/tabel baru → perbarui service terkait di `src/services/` (halaman tidak memanggil supabase langsung).
- RPC baru → bungkus di service, jangan panggil `supabase.rpc` dari halaman.
- Ingat quirk PostgREST: 2+ FK ke tabel yang sama wajib hint `tabel!nama_kolom(fields)`.

### 6. Verifikasi
- `npx vite build` harus exit 0 (bila ada perubahan JS).
- Baca ulang blok dan simulasikan eksekusi KEDUA kalinya — setiap statement harus no-op atau aman.
- Cek silang: apakah trigger penjaga existing akan menolak alur sah yang baru kamu buat? (contoh nyata: guard poin harus dilewati trigger kehadiran via escape hatch).

### 7. Laporan ke user (wajib)
Laporan akhir memuat, dalam urutan ini:
1. "**Jalankan Migrasi vNN di Supabase SQL Editor**" + ringkasan apa isi bloknya.
2. Daftar migrasi SEBELUMNYA yang (setahumu) belum dijalankan user — tanya kalau tidak yakin.
3. Apa yang harus dites manual setelah migrasi + deploy.
4. Risiko yang diketahui (mis. race condition yang diterima, sweep yang ditunda).

Jangan pernah menjalankan SQL ke production sendiri, dan jangan commit tanpa konfirmasi (lihat skill `rilis`).

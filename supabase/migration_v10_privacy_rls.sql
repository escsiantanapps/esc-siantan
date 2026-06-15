-- ============================================================
-- Migration v10 — Privasi data jemaat & akses jawaban admin
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Masalah:
--   1) "users_read_all USING (true)" membuat SETIAP user login bisa membaca
--      SELURUH data user lain (phone, address, birth_date, NIK, sp_notes...).
--   2) Admin perlu membaca semua form_responses (halaman Jawaban), padahal
--      policy lama hanya mengizinkan baca milik sendiri.
--
-- Pendekatan: pakai fungsi SECURITY DEFINER untuk membaca peran/komsel user
-- saat ini TANPA memicu RLS (mencegah rekursi), lalu batasi SELECT users ke:
--   - diri sendiri, ATAU
--   - Admin / Super Admin, ATAU
--   - PKS untuk anggota komsel yang sama.

-- ── Helper (bypass RLS, aman dari rekursi) ──────────────────
CREATE OR REPLACE FUNCTION auth_user_role() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_komsel() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT komsel_id FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_is_pks() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(is_pks, false) = true OR role = 'PKS' FROM users WHERE auth_id = auth.uid()
$$;

-- ── users: ganti policy baca terbuka dengan yang berbasis peran ──
DROP POLICY IF EXISTS "users_read_all"   ON users;
DROP POLICY IF EXISTS "users_read_self"  ON users;
DROP POLICY IF EXISTS "users_read_admin" ON users;
DROP POLICY IF EXISTS "users_read_pks"   ON users;

CREATE POLICY "users_read_self" ON users FOR SELECT USING (
  auth_id = auth.uid()
);
CREATE POLICY "users_read_admin" ON users FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);
CREATE POLICY "users_read_pks" ON users FOR SELECT USING (
  auth_user_is_pks()
  AND komsel_id IS NOT NULL
  AND komsel_id = auth_user_komsel()
);

-- ── form_responses: admin boleh baca semua jawaban ──
DROP POLICY IF EXISTS "responses_admin_read" ON form_responses;
CREATE POLICY "responses_admin_read" ON form_responses FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- Catatan: policy lama "responses_own" tetap dibiarkan (user baca/tulis
-- miliknya sendiri). Policy admin di atas bersifat tambahan (OR).
--
-- Setelah migrasi, MOHON UJI: login admin (edit jemaat & lihat jawaban),
-- login PKS (dashboard komsel tampil anggota), login jemaat (profil sendiri).

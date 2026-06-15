-- ============================================================
-- Migration v11 — Perbaiki RLS absensi komsel (komsel_attendance)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Membutuhkan helper dari migration_v10: auth_user_role/komsel/is_pks)
-- ============================================================
--
-- Masalah:
--   Menyimpan absensi gagal dengan
--   "new row violates row-level security policy for table komsel_attendance".
--   Policy lama tabel ini menilai PKS dari role = 'PKS' saja, sehingga user
--   yang menjadi PKS lewat FLAG is_pks (mis. Admin/Super Admin yang juga PKS)
--   ditolak saat INSERT.
--
-- Pendekatan:
--   Tambah policy PERMISSIVE baru (digabung OR dengan policy lama) yang
--   mengizinkan Admin/Super Admin, ATAU PKS (is_pks/role) untuk komsel-nya
--   sendiri. Tidak menghapus policy lama yang namanya tak diketahui.

ALTER TABLE komsel_attendance ENABLE ROW LEVEL SECURITY;

-- Ekspresi akses dipakai sama untuk select/insert/update/delete:
--   Admin/Super Admin  ATAU  (PKS DAN komsel baris = komsel PKS tsb)

-- INSERT ──────────────────────────────────────────────
DROP POLICY IF EXISTS "komsel_att_access_insert" ON komsel_attendance;
CREATE POLICY "komsel_att_access_insert" ON komsel_attendance FOR INSERT WITH CHECK (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (auth_user_is_pks() AND komsel_id = auth_user_komsel())
);

-- SELECT ──────────────────────────────────────────────
DROP POLICY IF EXISTS "komsel_att_access_select" ON komsel_attendance;
CREATE POLICY "komsel_att_access_select" ON komsel_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (auth_user_is_pks() AND komsel_id = auth_user_komsel())
);

-- UPDATE ──────────────────────────────────────────────
DROP POLICY IF EXISTS "komsel_att_access_update" ON komsel_attendance;
CREATE POLICY "komsel_att_access_update" ON komsel_attendance FOR UPDATE
USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (auth_user_is_pks() AND komsel_id = auth_user_komsel())
)
WITH CHECK (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (auth_user_is_pks() AND komsel_id = auth_user_komsel())
);

-- DELETE ──────────────────────────────────────────────
DROP POLICY IF EXISTS "komsel_att_access_delete" ON komsel_attendance;
CREATE POLICY "komsel_att_access_delete" ON komsel_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (auth_user_is_pks() AND komsel_id = auth_user_komsel())
);

-- Setelah migrasi: buka Dashboard PKS → tab Absensi → Simpan Absensi.
-- Seharusnya tersimpan tanpa error.

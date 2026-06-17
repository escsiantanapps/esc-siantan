-- ============================================================
-- Migration v18 — Hak akses admin per-ORANG (bukan universal)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Memakai helper auth_user_id()/auth_user_role() dari v10/v13)
-- ============================================================
--
-- Sebelumnya: satu konfigurasi hak akses untuk SEMUA admin (tabel
-- admin_permissions, key role='Admin'). Sekarang: tiap admin punya
-- daftar halaman yang diizinkan SENDIRI (eksklusif).

CREATE TABLE IF NOT EXISTS admin_user_permissions (
  user_id       TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  allowed_pages TEXT[] DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE admin_user_permissions ENABLE ROW LEVEL SECURITY;

-- Baca: admin yang bersangkutan (untuk nav-nya sendiri) atau Super Admin.
DROP POLICY IF EXISTS "aup_select" ON admin_user_permissions;
CREATE POLICY "aup_select" ON admin_user_permissions FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() = 'Super Admin'
);
-- Tulis: Super Admin saja (admin biasa tak bisa mengatur hak akses).
DROP POLICY IF EXISTS "aup_super_write" ON admin_user_permissions;
CREATE POLICY "aup_super_write" ON admin_user_permissions FOR ALL
  USING (auth_user_role() = 'Super Admin')
  WITH CHECK (auth_user_role() = 'Super Admin');

-- Migrasi: bila ada konfigurasi global lama (admin_permissions), salin ke
-- tiap admin yang ada sekarang sebagai titik awal.
DO $$
BEGIN
  IF to_regclass('admin_permissions') IS NOT NULL THEN
    INSERT INTO admin_user_permissions (user_id, allowed_pages)
    SELECT u.user_id, ap.allowed_pages
    FROM users u
    CROSS JOIN admin_permissions ap
    WHERE u.role = 'Admin' AND ap.role = 'Admin' AND ap.allowed_pages IS NOT NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $$;

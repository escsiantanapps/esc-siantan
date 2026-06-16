-- ============================================================
-- Migration v13 — Kepemimpinan PKS many-to-many (komsel_leaders)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Menggantikan/menambah policy dari v10 & v11. Aman dijalankan walau v11 belum.)
-- ============================================================
--
-- Perubahan model:
--   * "Tergabung dalam grup" = users.komsel_id (tetap, 1 user 1 komsel anggota).
--   * "Menjadi PKS sebuah grup" = baris di tabel relasi komsel_leaders.
--     Satu komsel boleh punya banyak PKS, dan satu orang boleh memimpin
--     banyak komsel (independen dari keanggotaannya).

-- ── Tabel relasi PKS ↔ komsel ───────────────────────────────
CREATE TABLE IF NOT EXISTS komsel_leaders (
  komsel_id  TEXT NOT NULL REFERENCES komsel(komsel_id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(user_id)   ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (komsel_id, user_id)
);
ALTER TABLE komsel_leaders ENABLE ROW LEVEL SECURITY;

-- ── Helper (SECURITY DEFINER, aman dari rekursi RLS) ────────
CREATE OR REPLACE FUNCTION auth_user_id() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT user_id FROM users WHERE auth_id = auth.uid()
$$;

-- True bila user yang login adalah PKS dari komsel `target`.
CREATE OR REPLACE FUNCTION auth_leads_komsel(target text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM komsel_leaders kl
    WHERE kl.komsel_id = target
      AND kl.user_id = (SELECT user_id FROM users WHERE auth_id = auth.uid())
  )
$$;

-- ── Migrasi data lama: PKS lama (is_pks / role='PKS') yang punya komsel_id ──
INSERT INTO komsel_leaders (komsel_id, user_id)
SELECT komsel_id, user_id FROM users
WHERE komsel_id IS NOT NULL AND (COALESCE(is_pks, false) = true OR role = 'PKS')
ON CONFLICT DO NOTHING;

-- ── RLS komsel_leaders ──────────────────────────────────────
-- Baca: admin semua; user boleh lihat baris miliknya (untuk tahu komsel pimpinannya).
DROP POLICY IF EXISTS "kl_select" ON komsel_leaders;
CREATE POLICY "kl_select" ON komsel_leaders FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
-- Tulis (assign/unassign PKS): admin saja.
DROP POLICY IF EXISTS "kl_admin_write" ON komsel_leaders;
CREATE POLICY "kl_admin_write" ON komsel_leaders FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── users: PKS boleh baca anggota dari komsel yang DIPIMPINNYA ──
DROP POLICY IF EXISTS "users_read_pks" ON users;
CREATE POLICY "users_read_pks" ON users FOR SELECT USING (
  komsel_id IS NOT NULL AND auth_leads_komsel(komsel_id)
);

-- ── komsel_attendance: berbasis kepemimpinan (menggantikan v11) ──
ALTER TABLE komsel_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "komsel_att_access_insert" ON komsel_attendance;
CREATE POLICY "komsel_att_access_insert" ON komsel_attendance FOR INSERT WITH CHECK (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);

DROP POLICY IF EXISTS "komsel_att_access_select" ON komsel_attendance;
CREATE POLICY "komsel_att_access_select" ON komsel_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);

DROP POLICY IF EXISTS "komsel_att_access_update" ON komsel_attendance;
CREATE POLICY "komsel_att_access_update" ON komsel_attendance FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id));

DROP POLICY IF EXISTS "komsel_att_access_delete" ON komsel_attendance;
CREATE POLICY "komsel_att_access_delete" ON komsel_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);

-- Catatan: kolom users.is_pks tetap dipertahankan sebagai penanda cepat
-- (true bila user memimpin >= 1 komsel) dan dipelihara oleh aplikasi saat
-- menamb/menghapus PKS. Kolom komsel.leader_name lama tidak lagi dipakai UI.

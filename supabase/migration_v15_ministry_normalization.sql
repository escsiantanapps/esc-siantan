-- ============================================================
-- Migration v15 — Normalisasi ministry (array → tabel relasi)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Setelah v13; memakai helper auth_user_id()/auth_user_role())
-- ============================================================
--
-- Mengganti kolom array users.ministry_ids & form_templates.allowed_ministry
-- dengan tabel relasi ber-FK ke ministries (integritas + query bersih).

-- ── 1. Tabel relasi ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_ministries (
  user_id     TEXT NOT NULL REFERENCES users(user_id)         ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, ministry_id)
);

CREATE TABLE IF NOT EXISTS template_ministries (
  form_id     TEXT NOT NULL REFERENCES form_templates(form_id) ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id) ON DELETE CASCADE,
  PRIMARY KEY (form_id, ministry_id)
);

-- ── 2. Migrasi data dari array (hanya id ministry yang valid) ──
INSERT INTO user_ministries (user_id, ministry_id)
SELECT u.user_id, m
FROM users u, unnest(u.ministry_ids) AS m
WHERE m IN (SELECT ministry_id FROM ministries)
ON CONFLICT DO NOTHING;

INSERT INTO template_ministries (form_id, ministry_id)
SELECT t.form_id, m
FROM form_templates t, unnest(t.allowed_ministry) AS m
WHERE m IN (SELECT ministry_id FROM ministries)
ON CONFLICT DO NOTHING;

-- ── 3. RLS tabel relasi ─────────────────────────────────────
ALTER TABLE user_ministries ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_ministries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "um_select" ON user_ministries;
CREATE POLICY "um_select" ON user_ministries FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR user_id = auth_user_id()
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.user_id = user_ministries.user_id
      AND u.komsel_id IS NOT NULL
      AND auth_leads_komsel(u.komsel_id)
  )
);
DROP POLICY IF EXISTS "um_admin_write" ON user_ministries;
CREATE POLICY "um_admin_write" ON user_ministries FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

DROP POLICY IF EXISTS "tm_select" ON template_ministries;
CREATE POLICY "tm_select" ON template_ministries FOR SELECT USING (true);
DROP POLICY IF EXISTS "tm_admin_write" ON template_ministries;
CREATE POLICY "tm_admin_write" ON template_ministries FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── 4. RLS form_templates berbasis join (ganti versi lama) ──
DROP POLICY IF EXISTS "templates_read_by_ministry" ON form_templates;
CREATE POLICY "templates_read_by_ministry" ON form_templates FOR SELECT USING (
  NOT EXISTS (SELECT 1 FROM template_ministries tm WHERE tm.form_id = form_templates.form_id)
  OR auth_user_role() IN ('Admin', 'Super Admin')
  OR EXISTS (
    SELECT 1 FROM template_ministries tm
    JOIN user_ministries um ON um.ministry_id = tm.ministry_id
    WHERE tm.form_id = form_templates.form_id AND um.user_id = auth_user_id()
  )
);

-- ── 5. Buang kolom array lama ───────────────────────────────
ALTER TABLE users          DROP COLUMN IF EXISTS ministry_ids;
ALTER TABLE form_templates DROP COLUMN IF EXISTS allowed_ministry;

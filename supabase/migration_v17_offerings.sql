-- ============================================================
-- Migration v17 — Persembahan (offerings) + rekening/QRIS gereja
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Memakai helper auth_user_id()/auth_user_role() dari v10/v13)
-- ============================================================

-- ── Rekening & QRIS gereja (dikelola admin/bendahara) ───────
CREATE TABLE IF NOT EXISTS payment_accounts (
  id           TEXT PRIMARY KEY DEFAULT 'PAY-' || replace(gen_random_uuid()::text, '-', ''),
  kind         TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'qris')),
  label        TEXT NOT NULL,             -- mis. "BCA", "Mandiri", "QRIS"
  account_no   TEXT,                      -- nomor rekening (untuk bank)
  account_name TEXT,                      -- atas nama
  image_url    TEXT,                      -- gambar QRIS (untuk kind=qris)
  sort         INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE payment_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pay_read_all" ON payment_accounts;
CREATE POLICY "pay_read_all" ON payment_accounts FOR SELECT USING (true);
DROP POLICY IF EXISTS "pay_admin_write" ON payment_accounts;
CREATE POLICY "pay_admin_write" ON payment_accounts FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── Catatan persembahan ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS offerings (
  offering_id TEXT PRIMARY KEY DEFAULT 'OFR-' || replace(gen_random_uuid()::text, '-', ''),
  user_id     TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  category    TEXT NOT NULL,              -- Perpuluhan / Persembahan / Misi / dll
  amount      BIGINT NOT NULL CHECK (amount > 0),
  note        TEXT,
  proof_url   TEXT,                       -- bukti transfer (opsional)
  status      TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Terverifikasi', 'Ditolak')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by TEXT
);
ALTER TABLE offerings ENABLE ROW LEVEL SECURITY;

-- Baca: pemberi (miliknya) atau admin/bendahara (semua). Data sensitif.
DROP POLICY IF EXISTS "ofr_select" ON offerings;
CREATE POLICY "ofr_select" ON offerings FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);
-- Catat persembahan: hanya untuk diri sendiri.
DROP POLICY IF EXISTS "ofr_insert_own" ON offerings;
CREATE POLICY "ofr_insert_own" ON offerings FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
-- Verifikasi/koreksi/hapus: admin saja.
DROP POLICY IF EXISTS "ofr_admin_update" ON offerings;
CREATE POLICY "ofr_admin_update" ON offerings FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
DROP POLICY IF EXISTS "ofr_admin_delete" ON offerings;
CREATE POLICY "ofr_admin_delete" ON offerings FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

CREATE INDEX IF NOT EXISTS offerings_created_idx ON offerings (created_at DESC);

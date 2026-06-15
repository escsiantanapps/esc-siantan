-- ============================================================
-- Migration v9 — Tabel langganan Web Push
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_id     TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Hapus dulu bila sudah ada, agar migrasi aman dijalankan berulang.
DROP POLICY IF EXISTS "push_insert_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_update_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_delete_own" ON push_subscriptions;
DROP POLICY IF EXISTS "push_select_own" ON push_subscriptions;

-- User hanya boleh mengelola langganan miliknya sendiri.
-- (Server pengirim memakai service-role key sehingga bypass RLS untuk membaca semua.)
CREATE POLICY "push_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_update_own" ON push_subscriptions FOR UPDATE USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_delete_own" ON push_subscriptions FOR DELETE USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_select_own" ON push_subscriptions FOR SELECT USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);

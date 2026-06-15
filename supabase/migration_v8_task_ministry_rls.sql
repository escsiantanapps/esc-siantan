-- ============================================================
-- Migration v8 — Batasi baca form_templates berdasarkan ministry
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Masalah: policy lama "templates_read_all" mengizinkan SIAPA PUN membaca
-- SEMUA template tugas (USING true). Akibatnya tugas yang seharusnya khusus
-- ministry tertentu tetap bisa dibuka lewat URL detail (/tugas/:id).
--
-- Perbaikan: sebuah template hanya boleh dibaca jika
--   1) allowed_ministry kosong (terbuka untuk semua), ATAU
--   2) user adalah Admin / Super Admin, ATAU
--   3) salah satu ministry milik user tumpang-tindih dengan allowed_ministry.

DROP POLICY IF EXISTS "templates_read_all" ON form_templates;
DROP POLICY IF EXISTS "templates_read_by_ministry" ON form_templates;

CREATE POLICY "templates_read_by_ministry" ON form_templates
  FOR SELECT USING (
    cardinality(allowed_ministry) = 0
    OR EXISTS (
      SELECT 1 FROM users u
      WHERE u.auth_id = auth.uid()
        AND (
          u.role IN ('Admin', 'Super Admin')
          OR u.ministry_ids && allowed_ministry
        )
    )
  );

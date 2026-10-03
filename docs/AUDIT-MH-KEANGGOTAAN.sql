-- Audit baca-saja relasi keanggotaan sebelum/sesudah Migrasi v100.
-- Jalankan di Supabase SQL Editor; tidak mengubah data maupun policy.
WITH target AS (
  SELECT c.oid, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'user_ministries'
), policies AS (
  SELECT p.polname AS nama, p.polcmd AS operasi,
    pg_get_expr(p.polqual, p.polrelid) AS syarat_baris,
    pg_get_expr(p.polwithcheck, p.polrelid) AS syarat_baru
  FROM pg_policy p JOIN target t ON t.oid = p.polrelid
), triggers AS (
  SELECT tg.tgname AS nama, pg_get_triggerdef(tg.oid) AS definisi
  FROM pg_trigger tg JOIN target t ON t.oid = tg.tgrelid
  WHERE NOT tg.tgisinternal
), constraints AS (
  SELECT con.conname AS nama, pg_get_constraintdef(con.oid) AS definisi
  FROM pg_constraint con JOIN target t ON t.oid = con.conrelid
), columns AS (
  SELECT a.attname AS nama, format_type(a.atttypid, a.atttypmod) AS tipe,
    a.attnotnull AS wajib
  FROM pg_attribute a JOIN target t ON t.oid = a.attrelid
  WHERE a.attnum > 0 AND NOT a.attisdropped
), invalid_heads AS (
  SELECT m.ministry_id, m.name AS ministry_name,
    m.head_user_id, u.name AS head_name
  FROM ministries m
  LEFT JOIN users u ON u.user_id = m.head_user_id
  WHERE m.head_user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_ministries um
      WHERE um.ministry_id = m.ministry_id AND um.user_id = m.head_user_id
    )
)
SELECT jsonb_build_object(
  'server_version_num', current_setting('server_version_num')::int,
  'rls_aktif', (SELECT relrowsecurity FROM target),
  'policies', COALESCE((SELECT jsonb_agg(to_jsonb(policies) ORDER BY nama) FROM policies), '[]'::jsonb),
  'triggers', COALESCE((SELECT jsonb_agg(to_jsonb(triggers) ORDER BY nama) FROM triggers), '[]'::jsonb),
  'constraints', COALESCE((SELECT jsonb_agg(to_jsonb(constraints) ORDER BY nama) FROM constraints), '[]'::jsonb),
  'columns', COALESCE((SELECT jsonb_agg(to_jsonb(columns) ORDER BY nama) FROM columns), '[]'::jsonb),
  'kepala_tanpa_keanggotaan', COALESCE((SELECT jsonb_agg(to_jsonb(invalid_heads) ORDER BY ministry_name) FROM invalid_heads), '[]'::jsonb)
) AS audit_mh_keanggotaan;

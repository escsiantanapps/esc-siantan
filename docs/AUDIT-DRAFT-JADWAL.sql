-- Jalankan seluruh SELECT ini di Supabase SQL Editor sebelum Migrasi v102.
-- Tidak menulis atau mengubah data. Kirim satu kolom audit_draft_jadwal.
WITH target_tables AS (
  SELECT unnest(ARRAY[
    'service_schedule_templates', 'service_schedule_months',
    'service_schedule_occurrences', 'service_schedule_parts',
    'service_rosters', 'service_roster_slots', 'ministry_service_positions'
  ]) AS name
), table_meta AS (
  SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
    jsonb_agg(DISTINCT jsonb_build_object('kolom', a.attname,
      'tipe', format_type(a.atttypid, a.atttypmod), 'wajib', a.attnotnull))
      FILTER (WHERE a.attname IS NOT NULL) AS kolom
  FROM target_tables target
  JOIN pg_class c ON c.oid = to_regclass('public.' || target.name)
  LEFT JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
  GROUP BY c.relname, c.relrowsecurity
)
SELECT jsonb_build_object(
  'server_version_num', current_setting('server_version_num')::INTEGER,
  'tables', (SELECT jsonb_agg(to_jsonb(t) ORDER BY t.tabel) FROM table_meta t),
  'constraints', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tabel', c.conrelid::regclass::TEXT, 'nama', c.conname,
      'definisi', pg_get_constraintdef(c.oid)) ORDER BY c.conrelid::regclass::TEXT, c.conname), '[]'::JSONB)
    FROM pg_constraint c WHERE c.conrelid IN (
      SELECT to_regclass('public.' || name) FROM target_tables)),
  'indexes', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tabel', tablename, 'nama', indexname, 'definisi', indexdef) ORDER BY tablename, indexname), '[]'::JSONB)
    FROM pg_indexes WHERE schemaname = 'public'
      AND tablename IN (SELECT name FROM target_tables)
      AND (indexname LIKE '%service_schedule%' OR indexname LIKE '%month%')),
  'triggers', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tabel', t.tgrelid::regclass::TEXT, 'nama', t.tgname,
      'status', t.tgenabled, 'definisi', pg_get_triggerdef(t.oid))
      ORDER BY t.tgrelid::regclass::TEXT, t.tgname), '[]'::JSONB)
    FROM pg_trigger t WHERE NOT t.tgisinternal
      AND t.tgrelid IN (SELECT to_regclass('public.' || name) FROM target_tables)),
  'policies', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'tabel', c.relname, 'nama', p.polname, 'operasi', p.polcmd,
      'permissive', p.polpermissive,
      'using', pg_get_expr(p.polqual, p.polrelid),
      'check', pg_get_expr(p.polwithcheck, p.polrelid))
      ORDER BY c.relname, p.polname), '[]'::JSONB)
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN (SELECT name FROM target_tables)),
  'functions', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'nama', p.proname, 'argumen', pg_get_function_identity_arguments(p.oid),
      'definisi', pg_get_functiondef(p.oid),
      'anon', has_function_privilege('anon', p.oid, 'EXECUTE'),
      'authenticated', has_function_privilege('authenticated', p.oid, 'EXECUTE'))
      ORDER BY p.proname), '[]'::JSONB)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'auth_service_schedule_admin', 'validate_service_schedule_definition',
      'create_service_schedule_month', 'guard_service_schedule_linked_roster',
      'guard_service_schedule_linked_slot', 'guard_service_roster',
      'guard_service_roster_slot', 'publish_service_schedule_month')),
  'template_teknis', (SELECT to_jsonb(t) FROM service_schedule_templates t
    WHERE t.template_id = 'SSTPL-DIRECT-V102')
) AS audit_draft_jadwal;

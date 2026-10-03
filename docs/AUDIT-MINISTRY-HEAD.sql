-- Audit baca-saja sebelum Migrasi v99. Tidak mengubah schema/data production.
-- Satu hasil JSON agar policy/trigger/fungsi tidak hilang saat menyalin hasil.
-- Identitas MH organisasi baru disimpan di ministries.head_user_id; grant
-- jadwal tetap pada ministry_schedule_managers dan tidak otomatis diberikan.
-- KEPUTUSAN OPERATOR: kandidat MH ber-role utama Volunteer Aktif; struktur
-- Ministry/MH hanya boleh dibaca pengguna login. Query ini tetap baca-saja.
WITH target_tables AS (
  SELECT c.oid, c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname IN ('ministries', 'ministry_schedule_managers')
), policies AS (
  SELECT table_info.relname AS tabel, table_info.relrowsecurity AS rls_aktif,
    policy.polname AS policy, policy.polcmd AS cmd,
    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(policy.polroles)) AS roles,
    pg_get_expr(policy.polqual, policy.polrelid) AS using_expr,
    pg_get_expr(policy.polwithcheck, policy.polrelid) AS check_expr,
    policy.polpermissive AS permissive
  FROM target_tables table_info LEFT JOIN pg_policy policy ON policy.polrelid = table_info.oid
), triggers AS (
  SELECT table_info.relname AS tabel, trigger.tgname AS nama,
    pg_get_triggerdef(trigger.oid) AS definisi, function.oid AS function_oid
  FROM target_tables table_info JOIN pg_trigger trigger ON trigger.tgrelid = table_info.oid
  JOIN pg_proc function ON function.oid = trigger.tgfoid
  WHERE NOT trigger.tgisinternal
), functions AS (
  SELECT function.proname AS nama,
    pg_get_function_identity_arguments(function.oid) AS argumen,
    pg_get_functiondef(function.oid) AS definisi
  FROM pg_proc function JOIN pg_namespace namespace ON namespace.oid = function.pronamespace
  WHERE namespace.nspname = 'public' AND (
    function.oid IN (SELECT function_oid FROM triggers)
    OR function.proname IN ('auth_manages_ministry', 'auth_admin_can',
      'guard_ministry_head_source', 'guard_schedule_manager_head_source',
      'revoke_previous_ministry_head_schedule_access')
  )
), columns AS (
  SELECT table_info.relname AS tabel, attribute.attname AS kolom,
    format_type(attribute.atttypid, attribute.atttypmod) AS tipe,
    attribute.attnotnull AS wajib,
    pg_get_expr(default_value.adbin, default_value.adrelid) AS nilai_default
  FROM target_tables table_info JOIN pg_attribute attribute ON attribute.attrelid = table_info.oid
  LEFT JOIN pg_attrdef default_value ON default_value.adrelid = attribute.attrelid AND default_value.adnum = attribute.attnum
  WHERE attribute.attnum > 0 AND NOT attribute.attisdropped
), constraints AS (
  SELECT table_info.relname AS tabel, constraint_info.conname AS nama,
    pg_get_constraintdef(constraint_info.oid) AS definisi
  FROM target_tables table_info JOIN pg_constraint constraint_info ON constraint_info.conrelid = table_info.oid
)
SELECT jsonb_build_object(
  'policies', COALESCE((SELECT jsonb_agg(to_jsonb(policies) ORDER BY tabel, policy) FROM policies), '[]'::JSONB),
  'triggers', COALESCE((SELECT jsonb_agg(to_jsonb(triggers) - 'function_oid' ORDER BY tabel, nama) FROM triggers), '[]'::JSONB),
  'functions', COALESCE((SELECT jsonb_agg(to_jsonb(functions) ORDER BY nama, argumen) FROM functions), '[]'::JSONB),
  'columns', COALESCE((SELECT jsonb_agg(to_jsonb(columns) ORDER BY tabel, kolom) FROM columns), '[]'::JSONB),
  'constraints', COALESCE((SELECT jsonb_agg(to_jsonb(constraints) ORDER BY tabel, nama) FROM constraints), '[]'::JSONB)
) AS audit_ministry_head;

-- Audit baca-saja sumber MH, keanggotaan v100, dan batas grant Admin.
-- Cocokkan definisi penjaga sumber dengan blok migrasi terbaru sebelum
-- menjalankan SQL perubahan apa pun.
WITH v100_fk AS (
  SELECT conname AS nama, pg_get_constraintdef(oid) AS definisi,
    convalidated AS tervalidasi
  FROM pg_constraint
  WHERE conrelid = 'public.ministries'::regclass
    AND conname = 'ministries_head_membership_fkey'
), v100_triggers AS (
  SELECT tgname AS nama, tgenabled AS status,
    pg_get_triggerdef(oid) AS definisi
  FROM pg_trigger
  WHERE (tgrelid = 'public.ministries'::regclass
      AND tgname = 'trg_validate_ministry_head_membership')
    OR (tgrelid = 'public.ministry_schedule_managers'::regclass
      AND tgname = 'trg_validate_schedule_manager_head_membership')
    OR (tgrelid = 'public.user_ministries'::regclass
      AND tgname = 'trg_guard_ministry_head_member_removal')
), source_guard AS (
  SELECT pg_get_functiondef(to_regprocedure('public.guard_ministry_head_source()')) AS definisi
), access_triggers AS (
  SELECT tgname AS nama, tgenabled AS status, pg_get_triggerdef(oid) AS definisi
  FROM pg_trigger
  WHERE (tgrelid = 'public.ministries'::regclass
      AND tgname = 'trg_guard_ministry_head_source')
    OR (tgrelid = 'public.ministry_schedule_managers'::regclass
      AND tgname IN ('trg_guard_schedule_manager_recipient_role',
        'trg_aa_guard_schedule_manager_head_source'))
), access_functions AS (
  SELECT nama, pg_get_functiondef(to_regprocedure(signature)) AS definisi
  FROM (VALUES
    ('auth_manages_ministry', 'public.auth_manages_ministry(text)'),
    ('guard_schedule_manager_recipient_role', 'public.guard_schedule_manager_recipient_role()'),
    ('guard_schedule_manager_head_source', 'public.guard_schedule_manager_head_source()')
  ) AS target(nama, signature)
)
SELECT jsonb_build_object(
  'server_version_num', current_setting('server_version_num')::int,
  'v100_fk', (SELECT to_jsonb(v100_fk) FROM v100_fk),
  'v100_triggers', COALESCE((SELECT jsonb_agg(to_jsonb(v100_triggers) ORDER BY nama)
    FROM v100_triggers), '[]'::jsonb),
  'guard_ministry_head_source', (SELECT definisi FROM source_guard),
  'source_guard_execute', jsonb_build_object(
    'anon', has_function_privilege('anon',
      to_regprocedure('public.guard_ministry_head_source()'), 'EXECUTE'),
    'authenticated', has_function_privilege('authenticated',
      to_regprocedure('public.guard_ministry_head_source()'), 'EXECUTE')
  ),
  'access_triggers', COALESCE((SELECT jsonb_agg(to_jsonb(access_triggers) ORDER BY nama)
    FROM access_triggers), '[]'::jsonb),
  'access_functions', COALESCE((SELECT jsonb_agg(to_jsonb(access_functions) ORDER BY nama)
    FROM access_functions), '[]'::jsonb)
) AS audit_mh_admin;

-- Baca-saja. Jalankan di Supabase SQL Editor sebelum Migrasi v104.
-- Hasil satu baris ini dipakai untuk mencocokkan penjaga role dan policy production.
SELECT jsonb_build_object(
  'guard_user_privilege_cols', pg_get_functiondef(to_regprocedure('public.guard_user_privilege_cols()')),
  'auth_admin_can', pg_get_functiondef(to_regprocedure('public.auth_admin_can(text)')),
  'users_guard_trigger', (
    SELECT jsonb_agg(jsonb_build_object('nama', t.tgname, 'definisi', pg_get_triggerdef(t.oid)))
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.users'::regclass
      AND t.tgname = 'trg_guard_user_privilege'
      AND NOT t.tgisinternal
  ),
  'membership_rls', (
    SELECT c.relrowsecurity FROM pg_class c
    WHERE c.oid = 'public.user_ministries'::regclass
  ),
  'membership_policies', (
    SELECT jsonb_agg(jsonb_build_object(
      'nama', p.polname,
      'operasi', p.polcmd,
      'permissive', p.polpermissive,
      'roles', ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)),
      'syarat_baris', pg_get_expr(p.polqual, p.polrelid),
      'syarat_baru', pg_get_expr(p.polwithcheck, p.polrelid)
    ) ORDER BY p.polname)
    FROM pg_policy p
    WHERE p.polrelid = 'public.user_ministries'::regclass
  ),
  'membership_triggers', (
    SELECT jsonb_agg(jsonb_build_object('nama', t.tgname, 'status', t.tgenabled,
      'definisi', pg_get_triggerdef(t.oid)) ORDER BY t.tgname)
    FROM pg_trigger t
    WHERE t.tgrelid = 'public.user_ministries'::regclass AND NOT t.tgisinternal
  )
) AS audit_promosi_volunteer_ministry;

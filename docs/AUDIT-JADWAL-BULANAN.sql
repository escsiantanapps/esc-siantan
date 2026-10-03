-- Audit baca-saja sebelum Migrasi v98. Tidak ada penulisan data.
-- Cocokkan hasil ini dengan schema.sql; jangan mengganti policy/trigger
-- production yang tidak tercatat tanpa keputusan operator.
SELECT c.relname AS tabel, c.relrowsecurity AS rls_aktif,
  p.polname AS policy, p.polcmd AS cmd,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('service_rosters', 'service_roster_slots', 'ministry_schedule_managers', 'ministry_service_positions')
ORDER BY c.relname, p.polname;

SELECT c.relname AS tabel, t.tgname AS trigger, pg_get_triggerdef(t.oid) AS definisi
FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND NOT t.tgisinternal
  AND c.relname IN ('service_rosters', 'service_roster_slots', 'ministry_schedule_managers', 'ministry_service_positions')
ORDER BY c.relname, t.tgname;

SELECT p.proname AS fungsi, pg_get_functiondef(p.oid) AS definisi
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN (
  'auth_admin_can', 'auth_manages_ministry', 'guard_service_roster', 'guard_service_roster_slot',
  'assign_service_roster_slot', 'publish_service_roster', 'cancel_service_roster'
)
ORDER BY p.proname;

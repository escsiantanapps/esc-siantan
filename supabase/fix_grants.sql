-- Fix: "permission denied for table X" (42501) errors on every query.
-- RLS policies in schema.sql were created, but the base table-level
-- GRANTs to anon/authenticated were never applied. RLS only restricts
-- rows AFTER a role has table-level privileges — without these GRANTs,
-- Postgres rejects the query before RLS is even evaluated.
--
-- Run this once in the Supabase SQL Editor.

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Make sure future tables get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

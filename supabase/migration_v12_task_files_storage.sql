-- ============================================================
-- Migration v12 — Storage untuk upload foto/file tugas (bucket task-files)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================
--
-- Jalankan ini HANYA bila upload foto/file pada tugas gagal dengan error
-- seperti "new row violates row-level security policy" (storage.objects),
-- "Bucket not found", atau foto tidak bisa ditampilkan (bukan public).
--
-- Memastikan:
--   1) Bucket 'task-files' ada dan public (agar getPublicUrl bisa tampil).
--   2) User login (authenticated) boleh meng-upload ke bucket ini.
--   3) Isi bucket dapat dibaca publik (foto bukti tugas).

-- 1) Bucket ada & public
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 2) Upload oleh user login
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-files');

-- 3) Baca publik
DROP POLICY IF EXISTS "task_files_read" ON storage.objects;
CREATE POLICY "task_files_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'task-files');

-- (Opsional) Izinkan pemilik mengganti/menghapus berkasnya — tidak wajib untuk
-- fitur ini, jadi dibiarkan default (tidak dibuat) demi keamanan.

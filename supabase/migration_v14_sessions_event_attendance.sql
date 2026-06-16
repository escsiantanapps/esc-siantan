-- ============================================================
-- Migration v14 — Sesi kelas & absensi event (barcode)
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- (Membutuhkan helper auth_user_id()/auth_user_role() dari v10/v13)
-- ============================================================

-- ── 1. Sesi kelas ───────────────────────────────────────────
ALTER TABLE classes ADD COLUMN IF NOT EXISTS total_sessions INT DEFAULT 1;

-- Absensi kelas dicatat per sesi.
ALTER TABLE class_attendance ADD COLUMN IF NOT EXISTS session_no INT;

-- Hapus unique lama (class_id, user_id, attendance_date) yang menghalangi
-- absen lebih dari satu sesi pada hari yang sama. Cari nama constraint-nya
-- secara dinamis lalu hapus.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'class_attendance'
      AND con.contype = 'u'
      AND EXISTS (
        SELECT 1 FROM unnest(con.conkey) k
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k
        WHERE a.attname = 'attendance_date'
      )
  LOOP
    EXECUTE format('ALTER TABLE class_attendance DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

-- Satu kehadiran per (kelas, user, sesi). COALESCE agar baris lama (session_no
-- NULL) dianggap sesi 0 dan tetap unik.
CREATE UNIQUE INDEX IF NOT EXISTS class_attendance_session_uniq
  ON class_attendance (class_id, user_id, COALESCE(session_no, 0));

-- ── 2. Absensi event (barcode) ──────────────────────────────
CREATE TABLE IF NOT EXISTS event_attendance (
  event_id    TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);
ALTER TABLE event_attendance ENABLE ROW LEVEL SECURITY;

-- Baca: admin semua; user baris miliknya.
DROP POLICY IF EXISTS "event_att_select" ON event_attendance;
CREATE POLICY "event_att_select" ON event_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);

-- Check-in mandiri: hanya untuk diri sendiri DAN sudah terdaftar di event itu.
DROP POLICY IF EXISTS "event_att_insert" ON event_attendance;
CREATE POLICY "event_att_insert" ON event_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND EXISTS (
    SELECT 1 FROM event_registrations r
    WHERE r.event_id = event_attendance.event_id AND r.user_id = auth_user_id()
  )
);

-- Admin boleh menghapus (koreksi data).
DROP POLICY IF EXISTS "event_att_admin_delete" ON event_attendance;
CREATE POLICY "event_att_admin_delete" ON event_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

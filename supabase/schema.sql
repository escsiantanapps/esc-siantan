-- ============================================================
-- GerejaKu App — Supabase SQL Schema
-- Jalankan di: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- 1. TABEL USERS (Jemaat & Volunteer)
CREATE TABLE users (
  user_id       TEXT PRIMARY KEY DEFAULT 'VOL-' || extract(epoch from now())::bigint,
  auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT DEFAULT 'Jemaat' CHECK (role IN ('Jemaat','Volunteer','PKS','Admin','Super Admin')),
  status        TEXT DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif','Menunggu Persetujuan')),
  gender        TEXT CHECK (gender IN ('Laki-laki','Perempuan')),
  birth_date    DATE,
  birth_place   TEXT,
  address       TEXT,
  blood_type    TEXT CHECK (blood_type IN ('A','B','AB','O','-')),
  social_media  TEXT,
  photo_url     TEXT,
  nik           TEXT,
  ministry_ids  TEXT[] DEFAULT '{}',
  komsel_id     TEXT,
  sp_level      TEXT DEFAULT 'Aman' CHECK (sp_level IN ('Aman','SP 1','SP 2','SP 3')),
  sp_notes      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 3. MINISTRY
CREATE TABLE ministries (
  ministry_id   TEXT PRIMARY KEY DEFAULT 'MIN-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 4. KOMSEL
CREATE TABLE komsel (
  komsel_id     TEXT PRIMARY KEY DEFAULT 'KMS-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  leader_name   TEXT,
  max_capacity  INT DEFAULT 20,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 5. NEWS / PENGUMUMAN
CREATE TABLE news (
  news_id       TEXT PRIMARY KEY DEFAULT 'NEWS-' || extract(epoch from now())::bigint,
  title         TEXT NOT NULL,
  content       TEXT,
  contact_wa    TEXT,
  thumbnail_url TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 6. EVENTS
CREATE TABLE events (
  event_id      TEXT PRIMARY KEY DEFAULT 'EVT-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  description   TEXT,
  event_date    DATE,
  event_time    TIME,
  location      TEXT,
  capacity      INT,
  status        TEXT DEFAULT 'Aktif' CHECK (status IN ('Aktif','Selesai','Dibatalkan')),
  thumbnail_url TEXT,
  contact_wa    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 7. PENDAFTARAN EVENT
CREATE TABLE event_registrations (
  ticket_id     TEXT PRIMARY KEY DEFAULT 'TKT-' || extract(epoch from now())::bigint,
  event_id      TEXT REFERENCES events(event_id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- 8. KELAS / PEMBINAAN
CREATE TABLE classes (
  class_id      TEXT PRIMARY KEY DEFAULT 'CLS-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  description   TEXT,
  schedule      TEXT,
  location      TEXT,
  teacher       TEXT,
  status        TEXT DEFAULT 'Aktif',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 9. FORM TEMPLATES (Tugas)
CREATE TABLE form_templates (
  form_id         TEXT PRIMARY KEY DEFAULT 'FRM-' || extract(epoch from now())::bigint,
  title           TEXT NOT NULL,
  description     TEXT,
  fields_json     JSONB DEFAULT '[]',
  weekly_goal     INT DEFAULT 1,
  period          TEXT DEFAULT 'minggu' CHECK (period IN ('minggu','bulan')),
  active_days     TEXT[] DEFAULT '{}',
  open_time       TEXT DEFAULT '00:00',
  close_time      TEXT DEFAULT '23:59',
  allowed_ministry TEXT[] DEFAULT '{}',
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 10. FORM RESPONSES (Jawaban Tugas)
CREATE TABLE form_responses (
  response_id   TEXT PRIMARY KEY DEFAULT 'RES-' || extract(epoch from now())::bigint,
  form_id       TEXT REFERENCES form_templates(form_id) ON DELETE CASCADE,
  volunteer_id  TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  data_json     JSONB DEFAULT '{}',
  submitted_at  TIMESTAMPTZ DEFAULT now()
);

-- 11. BAPTISM REGISTRATIONS
CREATE TABLE baptism_registrations (
  baptism_id    TEXT PRIMARY KEY DEFAULT 'BAP-' || extract(epoch from now())::bigint,
  user_id       TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  full_name     TEXT NOT NULL,
  birth_date    DATE,
  birth_place   TEXT,
  address       TEXT,
  nik           TEXT,
  father_name   TEXT,
  mother_name   TEXT,
  supervisor    TEXT,
  class_done    TEXT,
  testimony     TEXT,
  documents     JSONB DEFAULT '{}',
  status        TEXT DEFAULT 'Menunggu' CHECK (status IN ('Menunggu','Sedang Ditinjau','Disetujui','Terjadwal','Selesai','Ditolak')),
  scheduled_at  TIMESTAMPTZ,
  admin_note    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 12. WEDDING REGISTRATIONS
CREATE TABLE wedding_registrations (
  wedding_id        TEXT PRIMARY KEY DEFAULT 'WED-' || extract(epoch from now())::bigint,
  user_id           TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  groom_name        TEXT NOT NULL,
  groom_birth_date  DATE,
  groom_phone       TEXT,
  groom_father      TEXT,
  groom_mother      TEXT,
  groom_baptized    BOOLEAN DEFAULT false,
  bride_name        TEXT NOT NULL,
  bride_birth_date  DATE,
  bride_phone       TEXT,
  bride_father      TEXT,
  bride_mother      TEXT,
  bride_baptized    BOOLEAN DEFAULT false,
  planned_date      DATE,
  estimated_guests  INT,
  preferred_pastor  TEXT,
  special_notes     TEXT,
  documents         JSONB DEFAULT '{}',
  status            TEXT DEFAULT 'Menunggu' CHECK (status IN ('Menunggu','Sedang Ditinjau','Disetujui','Terjadwal','Selesai','Ditolak')),
  scheduled_at      TIMESTAMPTZ,
  admin_note        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE baptism_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_registrations ENABLE ROW LEVEL SECURITY;

-- Users: baca dibatasi (lihat migration_v10) — diri sendiri / Admin / PKS-komsel.
-- Helper SECURITY DEFINER mencegah rekursi RLS.
CREATE OR REPLACE FUNCTION auth_user_role() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM users WHERE auth_id = auth.uid() $$;
CREATE OR REPLACE FUNCTION auth_user_komsel() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT komsel_id FROM users WHERE auth_id = auth.uid() $$;
CREATE OR REPLACE FUNCTION auth_user_is_pks() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(is_pks, false) = true OR role = 'PKS' FROM users WHERE auth_id = auth.uid() $$;

CREATE POLICY "users_read_self"  ON users FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "users_read_admin" ON users FOR SELECT USING (auth_user_role() IN ('Admin','Super Admin'));
CREATE POLICY "users_read_pks"   ON users FOR SELECT USING (
  auth_user_is_pks() AND komsel_id IS NOT NULL AND komsel_id = auth_user_komsel()
);
CREATE POLICY "users_edit_own"   ON users FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- News & Events: semua bisa baca
CREATE POLICY "news_read_all"   ON news   FOR SELECT USING (true);
CREATE POLICY "events_read_all" ON events FOR SELECT USING (true);

-- Form templates: hanya bisa dibaca bila terbuka (allowed_ministry kosong),
-- oleh Admin/Super Admin, atau bila ministry user cocok dengan allowed_ministry.
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

-- Form responses: user baca/tulis milik sendiri; admin baca semua
CREATE POLICY "responses_own" ON form_responses
  FOR ALL USING (
    volunteer_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
  );
CREATE POLICY "responses_admin_read" ON form_responses FOR SELECT USING (
  auth_user_role() IN ('Admin','Super Admin')
);

-- Baptism: user bisa akses milik sendiri
CREATE POLICY "baptism_own" ON baptism_registrations
  FOR ALL USING (
    user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
  );

-- Wedding: user bisa akses milik sendiri
CREATE POLICY "wedding_own" ON wedding_registrations
  FOR ALL USING (
    user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
  );

-- ============================================================
-- STORAGE BUCKETS
-- Buat manual di Supabase → Storage → New Bucket
-- ============================================================
-- Bucket: profile-photos  (public: true)
-- Bucket: task-files      (public: false)
-- Bucket: documents       (public: false)

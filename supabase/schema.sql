-- ============================================================
-- ESC Siantan App — Skema Supabase LENGKAP (konsolidasi)
-- ------------------------------------------------------------
-- File tunggal hasil penggabungan skema dasar + seluruh migrasi
-- (v8–v18) dalam bentuk FINAL. Pakai ini untuk membangun database
-- dari NOL (Supabase Dashboard → SQL Editor → New Query).
--
-- Catatan: database produksi yang sudah jalan TIDAK perlu menjalankan
-- ulang file ini — migrasi sudah diterapkan bertahap. File ini adalah
-- sumber kebenaran (source of truth) struktur DB saat ini.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ============================================================
-- 1. TABEL INTI
-- ============================================================

-- 1.1 USERS (Jemaat & Volunteer)
CREATE TABLE users (
  user_id       TEXT PRIMARY KEY DEFAULT 'VOL-' || extract(epoch from now())::bigint,
  auth_id       UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username      TEXT UNIQUE,
  name          TEXT NOT NULL,
  email         TEXT,
  phone         TEXT,
  role          TEXT DEFAULT 'Jemaat' CHECK (role IN ('Jemaat','Volunteer','PKS','Admin','Super Admin')),
  role_secondary TEXT CHECK (role_secondary IS NULL OR role_secondary IN ('Jemaat','Volunteer','PKS','Admin','Super Admin')),  -- peran kedua (mis. Admin yang juga Volunteer)
  status        TEXT DEFAULT 'Aktif' CHECK (status IN ('Aktif','Nonaktif','Menunggu Persetujuan')),
  gender        TEXT CHECK (gender IN ('Laki-laki','Perempuan')),
  birth_date    DATE,
  birth_place   TEXT,
  address       TEXT,
  blood_type    TEXT CHECK (blood_type IN ('A','B','AB','O','-')),
  social_media  TEXT,
  photo_url     TEXT,
  nik           TEXT,
  komsel_id     TEXT,
  is_pks        BOOLEAN DEFAULT false,   -- penanda cepat: memimpin >= 1 komsel (lihat komsel_leaders)
  sp_level      TEXT DEFAULT 'Aman' CHECK (sp_level IN ('Aman','SP 1','SP 2','SP 3')),
  sp_notes      TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
-- Catatan: kolom array lama users.ministry_ids dinormalisasi ke tabel user_ministries (lihat §1.x).

-- 1.2 MINISTRY
CREATE TABLE ministries (
  ministry_id   TEXT PRIMARY KEY DEFAULT 'MIN-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 1.3 KOMSEL
CREATE TABLE komsel (
  komsel_id     TEXT PRIMARY KEY DEFAULT 'KMS-' || extract(epoch from now())::bigint,
  name          TEXT NOT NULL,
  leader_name   TEXT,                    -- legacy: tidak lagi dipakai UI (lihat komsel_leaders)
  max_capacity  INT DEFAULT 20,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 1.4 NEWS / PENGUMUMAN
CREATE TABLE news (
  news_id       TEXT PRIMARY KEY DEFAULT 'NEWS-' || extract(epoch from now())::bigint,
  title         TEXT NOT NULL,
  content       TEXT,
  contact_wa    TEXT,
  thumbnail_url TEXT,
  created_by    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- 1.5 EVENTS
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

-- 1.6 PENDAFTARAN EVENT
CREATE TABLE event_registrations (
  ticket_id     TEXT PRIMARY KEY DEFAULT 'TKT-' || extract(epoch from now())::bigint,
  event_id      TEXT REFERENCES events(event_id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- 1.7 ABSENSI EVENT (barcode/QR) — lihat migrasi v14
CREATE TABLE event_attendance (
  event_id    TEXT NOT NULL REFERENCES events(event_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(user_id)  ON DELETE CASCADE,
  recorded_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

-- 1.8 KELAS / PEMBINAAN
CREATE TABLE classes (
  class_id       TEXT PRIMARY KEY DEFAULT 'CLS-' || extract(epoch from now())::bigint,
  name           TEXT NOT NULL,
  description    TEXT,
  schedule       TEXT,
  location       TEXT,
  teacher        TEXT,
  total_sessions INT DEFAULT 1,          -- lihat migrasi v14
  status         TEXT DEFAULT 'Aktif',
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- 1.9 ABSENSI KELAS (QR Code, per sesi)
-- PK surrogate berbasis UUID agar unik per baris saat insert massal (lihat v16).
CREATE TABLE class_attendance (
  attendance_id   TEXT PRIMARY KEY DEFAULT 'ATT-' || replace(gen_random_uuid()::text, '-', ''),
  class_id        TEXT REFERENCES classes(class_id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(user_id)    ON DELETE CASCADE,
  session_no      INT,                   -- lihat migrasi v14
  attendance_date DATE DEFAULT current_date,
  scanned_at      TIMESTAMPTZ DEFAULT now()
);
-- Satu kehadiran per (kelas, user, sesi). COALESCE agar baris tanpa sesi unik.
CREATE UNIQUE INDEX class_attendance_session_uniq
  ON class_attendance (class_id, user_id, COALESCE(session_no, 0));

-- 1.10 ABSENSI KOMSEL
-- PK surrogate berbasis UUID agar unik per baris saat insert massal (lihat v16).
CREATE TABLE komsel_attendance (
  attendance_id   TEXT PRIMARY KEY DEFAULT 'ATT-' || replace(gen_random_uuid()::text, '-', ''),
  komsel_id       TEXT REFERENCES komsel(komsel_id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(user_id)    ON DELETE CASCADE,
  attendance_date DATE DEFAULT current_date,
  status          TEXT DEFAULT 'Hadir' CHECK (status IN ('Hadir','Tidak Hadir','Izin')),
  notes           TEXT,
  recorded_by     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 1.11 KEPEMIMPINAN PKS ↔ KOMSEL (many-to-many) — lihat migrasi v13
CREATE TABLE komsel_leaders (
  komsel_id  TEXT NOT NULL REFERENCES komsel(komsel_id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(user_id)    ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (komsel_id, user_id)
);

-- 1.12 FORM TEMPLATES (Tugas)
-- Catatan: kolom array lama allowed_ministry dinormalisasi ke template_ministries.
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
  bg_type         TEXT DEFAULT 'none' CHECK (bg_type IN ('none','preset','image')),
  bg_value        TEXT,
  reminder_enabled BOOLEAN DEFAULT false,
  reminder_days    TEXT[] DEFAULT '{}',   -- nama hari (Senin..Minggu) untuk pengingat otomatis
  once_per_day    BOOLEAN DEFAULT false,  -- batasi pengisian maks. 1x per hari per jemaat
  allowed_roles   TEXT[] DEFAULT '{}',    -- batasi role yang boleh mengisi (kosong = semua role)
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- 1.13 FORM RESPONSES (Jawaban Tugas)
CREATE TABLE form_responses (
  response_id   TEXT PRIMARY KEY DEFAULT 'RES-' || extract(epoch from now())::bigint,
  form_id       TEXT REFERENCES form_templates(form_id) ON DELETE CASCADE,
  volunteer_id  TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  data_json     JSONB DEFAULT '{}',
  submitted_at  TIMESTAMPTZ DEFAULT now()
);

-- 1.14 RELASI MINISTRY (normalisasi array → tabel) — lihat migrasi v15
CREATE TABLE user_ministries (
  user_id     TEXT NOT NULL REFERENCES users(user_id)          ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, ministry_id)
);

CREATE TABLE template_ministries (
  form_id     TEXT NOT NULL REFERENCES form_templates(form_id)  ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id)  ON DELETE CASCADE,
  PRIMARY KEY (form_id, ministry_id)
);

-- 1.15 BAPTISM REGISTRATIONS
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

-- 1.16 WEDDING REGISTRATIONS
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

-- 1.17 LANGGANAN WEB PUSH — lihat migrasi v9
CREATE TABLE push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  user_id     TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- 1.18 REKENING & QRIS GEREJA — lihat migrasi v17
CREATE TABLE payment_accounts (
  id           TEXT PRIMARY KEY DEFAULT 'PAY-' || replace(gen_random_uuid()::text, '-', ''),
  kind         TEXT NOT NULL DEFAULT 'bank' CHECK (kind IN ('bank', 'qris')),
  label        TEXT NOT NULL,             -- mis. "BCA", "Mandiri", "QRIS"
  account_no   TEXT,                      -- nomor rekening (untuk bank)
  account_name TEXT,                      -- atas nama
  image_url    TEXT,                      -- gambar QRIS (untuk kind=qris)
  sort         INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- 1.19 CATATAN PERSEMBAHAN — lihat migrasi v17
CREATE TABLE offerings (
  offering_id TEXT PRIMARY KEY DEFAULT 'OFR-' || replace(gen_random_uuid()::text, '-', ''),
  user_id     TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  category    TEXT NOT NULL,              -- Perpuluhan / Persembahan / Misi / dll
  amount      BIGINT NOT NULL CHECK (amount > 0),
  note        TEXT,
  proof_url   TEXT,                       -- bukti transfer (opsional)
  status      TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Terverifikasi', 'Ditolak')),
  created_at  TIMESTAMPTZ DEFAULT now(),
  verified_at TIMESTAMPTZ,
  verified_by TEXT
);
CREATE INDEX offerings_created_idx ON offerings (created_at DESC);

-- 1.20 HAK AKSES ADMIN PER-ORANG — lihat migrasi v18
CREATE TABLE admin_user_permissions (
  user_id       TEXT PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
  allowed_pages TEXT[] DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

-- 1.21 PENGATURAN APLIKASI (key/value) — mis. background halaman Login.
-- Dibaca anonim (Login pra-auth); ditulis hanya Super Admin.
CREATE TABLE app_settings (
  key        TEXT PRIMARY KEY,
  value      JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.22 OTP RESET PASSWORD via WhatsApp. Hanya diakses serverless (service role);
-- RLS aktif tanpa policy → klien tidak bisa membaca/menulis.
CREATE TABLE password_reset_otp (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.23 OTP AKTIVASI akun jemaat lama (data impor) via WhatsApp. Hanya serverless.
CREATE TABLE activation_otp (
  phone      TEXT PRIMARY KEY,   -- nomor "inti" (tanpa 0/62 depan)
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 1.24 IZIN / SAKIT TUGAS — anggota mengajukan, Admin menyetujui. Lihat migrasi v22.
CREATE TABLE task_leaves (
  leave_id    TEXT PRIMARY KEY DEFAULT 'LV-' || replace(gen_random_uuid()::text, '-', ''),
  user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'Sakit' CHECK (type IN ('Sakit','Izin')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  proof_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu','Disetujui','Ditolak')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_note  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX task_leaves_user_idx ON task_leaves (user_id, start_date);

-- ============================================================
-- 2. HELPER (SECURITY DEFINER) — baca peran/komsel user TANPA memicu RLS
--    (mencegah rekursi pada policy tabel users). Lihat migrasi v10 & v13.
-- ============================================================

CREATE OR REPLACE FUNCTION auth_user_role() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_role_secondary() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role_secondary FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_komsel() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT komsel_id FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_is_pks() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE(is_pks, false) = true OR role = 'PKS' FROM users WHERE auth_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_user_id() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT user_id FROM users WHERE auth_id = auth.uid()
$$;

-- True bila user yang login adalah PKS dari komsel `target`.
CREATE OR REPLACE FUNCTION auth_leads_komsel(target text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM komsel_leaders kl
    WHERE kl.komsel_id = target
      AND kl.user_id = (SELECT user_id FROM users WHERE auth_id = auth.uid())
  )
$$;

-- ============================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE news                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_registrations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendance       ENABLE ROW LEVEL SECURITY;
ALTER TABLE komsel_attendance      ENABLE ROW LEVEL SECURITY;
ALTER TABLE komsel_leaders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_responses         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ministries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_ministries    ENABLE ROW LEVEL SECURITY;
ALTER TABLE baptism_registrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE wedding_registrations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_accounts       ENABLE ROW LEVEL SECURITY;
ALTER TABLE offerings              ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_otp     ENABLE ROW LEVEL SECURITY;
ALTER TABLE activation_otp         ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_leaves            ENABLE ROW LEVEL SECURITY;
-- Catatan: class_attendance dibiarkan tanpa RLS (akses lewat anon/auth key
-- sesuai perilaku aplikasi). Aktifkan + tambah policy bila ingin diperketat.

-- ── users: baca berbasis peran (diri sendiri / Admin / PKS pemimpin komsel) ──
CREATE POLICY "users_read_self"  ON users FOR SELECT USING (auth_id = auth.uid());
CREATE POLICY "users_read_admin" ON users FOR SELECT USING (auth_user_role() IN ('Admin','Super Admin'));
CREATE POLICY "users_read_pks"   ON users FOR SELECT USING (
  komsel_id IS NOT NULL AND auth_leads_komsel(komsel_id)
);
CREATE POLICY "users_edit_own"   ON users FOR UPDATE USING (auth.uid() = auth_id);
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- ── News & Events: semua bisa baca ──
CREATE POLICY "news_read_all"   ON news   FOR SELECT USING (true);
CREATE POLICY "events_read_all" ON events FOR SELECT USING (true);

-- ── event_attendance ──
CREATE POLICY "event_att_select" ON event_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
CREATE POLICY "event_att_insert" ON event_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND EXISTS (
    SELECT 1 FROM event_registrations r
    WHERE r.event_id = event_attendance.event_id AND r.user_id = auth_user_id()
  )
);
CREATE POLICY "event_att_admin_delete" ON event_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- ── komsel_attendance: Admin semua, atau PKS untuk komsel yang DIPIMPINNYA ──
CREATE POLICY "komsel_att_access_insert" ON komsel_attendance FOR INSERT WITH CHECK (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);
CREATE POLICY "komsel_att_access_select" ON komsel_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);
CREATE POLICY "komsel_att_access_update" ON komsel_attendance FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id));
CREATE POLICY "komsel_att_access_delete" ON komsel_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR auth_leads_komsel(komsel_id)
);

-- ── komsel_leaders ──
CREATE POLICY "kl_select" ON komsel_leaders FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
CREATE POLICY "kl_admin_write" ON komsel_leaders FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── form_templates: Admin selalu; selain itu gerbang ROLE dan MINISTRY harus
--    sama-sama lolos (batasan yang kosong dianggap lolos). ──
CREATE POLICY "templates_read_access" ON form_templates FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (
    -- Gerbang role: kosong = semua role; selain itu role user harus cocok
    -- (PKS dikenali lewat is_pks ATAU role = 'PKS').
    (
      coalesce(array_length(allowed_roles, 1), 0) = 0
      OR auth_user_role() = ANY (allowed_roles)
      OR auth_user_role_secondary() = ANY (allowed_roles)
      OR ('PKS' = ANY (allowed_roles) AND auth_user_is_pks())
    )
    AND
    -- Gerbang ministry: tidak dibatasi, atau salah satu ministry user cocok.
    (
      NOT EXISTS (SELECT 1 FROM template_ministries tm WHERE tm.form_id = form_templates.form_id)
      OR EXISTS (
        SELECT 1 FROM template_ministries tm
        JOIN user_ministries um ON um.ministry_id = tm.ministry_id
        WHERE tm.form_id = form_templates.form_id AND um.user_id = auth_user_id()
      )
    )
  )
);

-- ── form_responses: user kelola miliknya; admin baca semua ──
CREATE POLICY "responses_own" ON form_responses FOR ALL USING (
  volunteer_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "responses_admin_read" ON form_responses FOR SELECT USING (
  auth_user_role() IN ('Admin','Super Admin')
);

-- ── user_ministries ──
CREATE POLICY "um_select" ON user_ministries FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR user_id = auth_user_id()
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.user_id = user_ministries.user_id
      AND u.komsel_id IS NOT NULL
      AND auth_leads_komsel(u.komsel_id)
  )
);
CREATE POLICY "um_admin_write" ON user_ministries FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
-- User (mis. Volunteer) boleh mengelola ministry-nya SENDIRI (pilih tempat melayani).
CREATE POLICY "um_self_write" ON user_ministries FOR ALL
  USING (user_id = auth_user_id())
  WITH CHECK (user_id = auth_user_id());

-- ── template_ministries ──
CREATE POLICY "tm_select" ON template_ministries FOR SELECT USING (true);
CREATE POLICY "tm_admin_write" ON template_ministries FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── Baptism / Wedding: user kelola miliknya ──
CREATE POLICY "baptism_own" ON baptism_registrations FOR ALL USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "wedding_own" ON wedding_registrations FOR ALL USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);

-- ── push_subscriptions: user kelola miliknya (server pakai service-role → bypass) ──
CREATE POLICY "push_insert_own" ON push_subscriptions FOR INSERT WITH CHECK (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_update_own" ON push_subscriptions FOR UPDATE USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_delete_own" ON push_subscriptions FOR DELETE USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);
CREATE POLICY "push_select_own" ON push_subscriptions FOR SELECT USING (
  user_id IN (SELECT user_id FROM users WHERE auth_id = auth.uid())
);

-- ── payment_accounts: semua baca, admin tulis ──
CREATE POLICY "pay_read_all" ON payment_accounts FOR SELECT USING (true);
CREATE POLICY "pay_admin_write" ON payment_accounts FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── offerings: pemberi baca miliknya / admin semua; catat untuk diri sendiri; admin verifikasi & hapus ──
CREATE POLICY "ofr_select" ON offerings FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);
CREATE POLICY "ofr_insert_own" ON offerings FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
CREATE POLICY "ofr_admin_update" ON offerings FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
CREATE POLICY "ofr_admin_delete" ON offerings FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- ── task_leaves: anggota ajukan miliknya; Admin setujui/tolak; PKS baca komselnya ──
CREATE POLICY "leaves_select" ON task_leaves FOR SELECT USING (
  user_id = auth_user_id()
  OR auth_user_role() IN ('Admin', 'Super Admin')
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.user_id = task_leaves.user_id
      AND u.komsel_id IS NOT NULL AND auth_leads_komsel(u.komsel_id)
  )
);
CREATE POLICY "leaves_insert_own" ON task_leaves FOR INSERT WITH CHECK (
  user_id = auth_user_id() AND status = 'Menunggu'
  AND (auth_user_role() = 'Volunteer' OR auth_user_role_secondary() = 'Volunteer')
  AND proof_url IS NOT NULL
);
CREATE POLICY "leaves_delete_own_pending" ON task_leaves FOR DELETE USING (
  user_id = auth_user_id() AND status = 'Menunggu'
);
CREATE POLICY "leaves_admin_update" ON task_leaves FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
CREATE POLICY "leaves_admin_delete" ON task_leaves FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- ── admin_user_permissions: admin ybs baca nav-nya / Super Admin baca-tulis ──
CREATE POLICY "aup_select" ON admin_user_permissions FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() = 'Super Admin'
);
CREATE POLICY "aup_super_write" ON admin_user_permissions FOR ALL
  USING (auth_user_role() = 'Super Admin')
  WITH CHECK (auth_user_role() = 'Super Admin');

-- ── app_settings: dibaca siapa saja (Login pra-auth); ditulis Super Admin ──
CREATE POLICY "app_settings_read" ON app_settings FOR SELECT USING (true);
CREATE POLICY "app_settings_write" ON app_settings FOR ALL
  USING (auth_user_role() = 'Super Admin')
  WITH CHECK (auth_user_role() = 'Super Admin');

-- ============================================================
-- 4. STORAGE BUCKETS
-- ============================================================
-- Bucket 'documents' (private): buat manual di Supabase → Storage → New Bucket.
--
-- Bucket 'profile-photos' (public) — dipakai untuk avatar, thumbnail berita/event,
-- QRIS (qris/...), dan bukti persembahan (offerings/...). Pastikan ada policy
-- upload, kalau tidak SEMUA upload ke bucket ini gagal ("row violates RLS").
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-photos', 'profile-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "profile_photos_insert" ON storage.objects;
CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile_photos_update" ON storage.objects;
CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'profile-photos')
  WITH CHECK (bucket_id = 'profile-photos');

DROP POLICY IF EXISTS "profile_photos_read" ON storage.objects;
CREATE POLICY "profile_photos_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-photos');

-- Bucket 'task-files' (foto/bukti tugas) — dibuat + policy via SQL (lihat v12):
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-files', 'task-files', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'task-files');

DROP POLICY IF EXISTS "task_files_read" ON storage.objects;
CREATE POLICY "task_files_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'task-files');

-- ── Migrasi v19: rate-limit push notif di DB ─────────────────
-- Menyimpan waktu terakhir admin mengirim push agar rate limit
-- berlaku lintas instance serverless (tidak lagi in-memory).
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS last_push_sent_at TIMESTAMPTZ;

-- ── Migrasi v20 + v21: akses tugas per ROLE + peran kedua ────
-- Jalankan blok ini sekali di Supabase SQL Editor (urutan penting: kolom &
-- helper dulu, baru policy yang memakainya).
--   v20: allowed_roles pada form_templates (kosong = semua role boleh).
--   v21: role_secondary pada users (mis. Admin yang juga Volunteer agar tetap
--        dapat mengakses tugas & menerima notifikasi role tersebut).
-- Policy SELECT form_templates menegakkan gerbang role (utama/kedua/PKS) DAN
-- ministry di server.
ALTER TABLE form_templates
  ADD COLUMN IF NOT EXISTS allowed_roles TEXT[] DEFAULT '{}';

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role_secondary TEXT
  CHECK (role_secondary IS NULL OR role_secondary IN ('Jemaat','Volunteer','PKS','Admin','Super Admin'));

CREATE OR REPLACE FUNCTION auth_user_role_secondary() RETURNS text
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role_secondary FROM users WHERE auth_id = auth.uid()
$$;

DROP POLICY IF EXISTS "templates_read_by_ministry" ON form_templates;
DROP POLICY IF EXISTS "templates_read_access" ON form_templates;
CREATE POLICY "templates_read_access" ON form_templates FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin')
  OR (
    (
      coalesce(array_length(allowed_roles, 1), 0) = 0
      OR auth_user_role() = ANY (allowed_roles)
      OR auth_user_role_secondary() = ANY (allowed_roles)
      OR ('PKS' = ANY (allowed_roles) AND auth_user_is_pks())
    )
    AND
    (
      NOT EXISTS (SELECT 1 FROM template_ministries tm WHERE tm.form_id = form_templates.form_id)
      OR EXISTS (
        SELECT 1 FROM template_ministries tm
        JOIN user_ministries um ON um.ministry_id = tm.ministry_id
        WHERE tm.form_id = form_templates.form_id AND um.user_id = auth_user_id()
      )
    )
  )
);

-- ── Migrasi v22: izin/sakit tugas (task_leaves) ──────────────
-- Tabel pengajuan izin: anggota mengajukan, Admin menyetujui. Periode yang
-- disetujui dipakai evaluasi untuk menandai "Izin" (bukan "Kosong").
-- Jalankan blok ini sekali di Supabase SQL Editor.
CREATE TABLE IF NOT EXISTS task_leaves (
  leave_id    TEXT PRIMARY KEY DEFAULT 'LV-' || replace(gen_random_uuid()::text, '-', ''),
  user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  type        TEXT NOT NULL DEFAULT 'Sakit' CHECK (type IN ('Sakit','Izin')),
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  reason      TEXT,
  proof_url   TEXT,
  status      TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu','Disetujui','Ditolak')),
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  admin_note  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_leaves_user_idx ON task_leaves (user_id, start_date);

ALTER TABLE task_leaves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "leaves_select" ON task_leaves;
CREATE POLICY "leaves_select" ON task_leaves FOR SELECT USING (
  user_id = auth_user_id()
  OR auth_user_role() IN ('Admin', 'Super Admin')
  OR EXISTS (
    SELECT 1 FROM users u
    WHERE u.user_id = task_leaves.user_id
      AND u.komsel_id IS NOT NULL AND auth_leads_komsel(u.komsel_id)
  )
);
DROP POLICY IF EXISTS "leaves_insert_own" ON task_leaves;
CREATE POLICY "leaves_insert_own" ON task_leaves FOR INSERT WITH CHECK (
  user_id = auth_user_id() AND status = 'Menunggu'
  AND (auth_user_role() = 'Volunteer' OR auth_user_role_secondary() = 'Volunteer')
  AND proof_url IS NOT NULL
);
DROP POLICY IF EXISTS "leaves_delete_own_pending" ON task_leaves;
CREATE POLICY "leaves_delete_own_pending" ON task_leaves FOR DELETE USING (
  user_id = auth_user_id() AND status = 'Menunggu'
);
DROP POLICY IF EXISTS "leaves_admin_update" ON task_leaves;
CREATE POLICY "leaves_admin_update" ON task_leaves FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
DROP POLICY IF EXISTS "leaves_admin_delete" ON task_leaves;
CREATE POLICY "leaves_admin_delete" ON task_leaves FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- ── Migrasi v23: tutup gap keamanan hasil audit ──────────────
-- Jalankan blok ini sekali di Supabase SQL Editor.
--
-- (a) PRIVILEGE ESCALATION: policy "users_edit_own" mengizinkan UPDATE baris
--     sendiri tanpa WITH CHECK, jadi user biasa bisa mengubah kolom hak
--     akses (role, role_secondary, status, is_pks, komsel_id) lewat
--     supabase-js langsung dari klien. Trigger ini menolak perubahan kolom
--     tersebut kecuali pemanggil sudah Admin/Super Admin.
CREATE OR REPLACE FUNCTION guard_user_privilege_cols() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth_user_role() NOT IN ('Admin', 'Super Admin') THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.role_secondary IS DISTINCT FROM OLD.role_secondary
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_pks IS DISTINCT FROM OLD.is_pks
       OR NEW.komsel_id IS DISTINCT FROM OLD.komsel_id THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah kolom hak akses sendiri.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_user_privilege ON users;
CREATE TRIGGER trg_guard_user_privilege
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_user_privilege_cols();

-- (b) Tambah policy UPDATE eksplisit untuk Admin/Super Admin pada users
--     (sebelumnya hanya "users_edit_own" → admin tidak bisa edit user lain
--     murni lewat RLS; trigger di atas tetap berlaku sebagai pengaman kedua).
DROP POLICY IF EXISTS "users_admin_update" ON users;
CREATE POLICY "users_admin_update" ON users FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- (c) class_attendance dibiarkan TANPA RLS sebelumnya → bisa dibaca/ditulis
--     siapa pun lewat anon key. Aktifkan + policy setara event_attendance.
ALTER TABLE class_attendance ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "class_att_select" ON class_attendance;
CREATE POLICY "class_att_select" ON class_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "class_att_insert" ON class_attendance;
CREATE POLICY "class_att_insert" ON class_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "class_att_admin_delete" ON class_attendance;
CREATE POLICY "class_att_admin_delete" ON class_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- (d) Storage 'profile-photos': policy insert/update sebelumnya hanya cek
--     bucket_id, tanpa cek pemilik path → user authenticated mana pun bisa
--     menimpa avatars/{user_lain}.* atau upload file arbitrer ke bucket
--     publik. Batasi insert/update milik sendiri ke path avatars/{user_id}.*
--     (folder lain seperti news/, events/, qris/, offerings/ tetap perlu
--     insert oleh siapa pun yang authenticated — gerbang dilakukan di UI
--     untuk fitur tersebut; ini menutup IDOR khusus avatar tanpa merusak
--     fitur lain).
DROP POLICY IF EXISTS "profile_photos_insert" ON storage.objects;
CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      NOT (name LIKE 'avatars/%')
      OR name LIKE 'avatars/' || auth_user_id() || '.%'
    )
  );

DROP POLICY IF EXISTS "profile_photos_update" ON storage.objects;
CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      NOT (name LIKE 'avatars/%')
      OR name LIKE 'avatars/' || auth_user_id() || '.%'
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      NOT (name LIKE 'avatars/%')
      OR name LIKE 'avatars/' || auth_user_id() || '.%'
    )
  );

-- ── Migrasi v24: biodata jemaat (data pribadi) hanya boleh diubah Super
-- Admin saat mengedit akun ORANG LAIN. Admin biasa tetap boleh: status,
-- approval pendaftaran, komsel, ministry, dan SP (tidak disentuh trigger ini).
-- Self-edit (jemaat mengubah biodatanya sendiri lewat Edit Profil) tetap
-- bebas — trigger ini hanya aktif saat auth.uid() BUKAN pemilik baris.
-- Jalankan blok ini sekali di Supabase SQL Editor.
CREATE OR REPLACE FUNCTION guard_biodata_admin_edit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.auth_id AND auth_user_role() = 'Admin' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.gender IS DISTINCT FROM OLD.gender
       OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
       OR NEW.birth_place IS DISTINCT FROM OLD.birth_place
       OR NEW.address IS DISTINCT FROM OLD.address
       OR NEW.blood_type IS DISTINCT FROM OLD.blood_type
       OR NEW.nik IS DISTINCT FROM OLD.nik
       OR NEW.social_media IS DISTINCT FROM OLD.social_media
       OR NEW.photo_url IS DISTINCT FROM OLD.photo_url THEN
      RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah biodata jemaat lain.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_biodata_admin_edit ON users;
CREATE TRIGGER trg_guard_biodata_admin_edit
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_biodata_admin_edit();

-- ── Migrasi v25: sprint 12 fitur (komsel, ulang tahun, penyerahan ────
-- anak, sertifikat, kategori tugas, dll) ─────────────────────────────
-- Gabungan skema untuk seluruh sprint fitur besar:
--  - Kategori Komsel (Youth/Kids/dll, dikelola Admin & Super Admin) +
--    Persembahan Komsel (PKS input, Admin verifikasi)
--  - Pesan Ulang Tahun: PKS kirim pesan personal ke anggota komsel yang
--    berulang tahun hari ini (notifikasi push terpisah lewat cron)
--  - Registrasi Kelas (seperti Event) untuk rekap & export kehadiran
--  - Sistem Penyerahan Anak (pendaftaran, struktur mirip Baptisan/Nikah)
--  - Sistem Sertifikat (diterbitkan manual oleh Admin per jemaat)
--  - Kategori Tugas (CRUD Super-Admin-only): gerbang akses TAMBAHAN di
--    atas allowed_roles/allowed_ministry yang sudah ada (BUKAN
--    pengganti). Kategori "Umum" dibuat otomatis & semua tugas lama
--    dibackfill ke sana agar tidak kehilangan akses begitu fitur ini
--    aktif.
-- Jalankan blok ini sekali di Supabase SQL Editor.

-- (1) Kategori Komsel
CREATE TABLE IF NOT EXISTS komsel_categories (
  category_id TEXT PRIMARY KEY DEFAULT 'KCAT-' || extract(epoch from now())::bigint,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE komsel ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES komsel_categories(category_id) ON DELETE SET NULL;

ALTER TABLE komsel_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "komsel_cat_select" ON komsel_categories;
CREATE POLICY "komsel_cat_select" ON komsel_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "komsel_cat_admin_write" ON komsel_categories;
CREATE POLICY "komsel_cat_admin_write" ON komsel_categories FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- (2) Persembahan Komsel
CREATE TABLE IF NOT EXISTS komsel_offerings (
  id          TEXT PRIMARY KEY DEFAULT 'KOFR-' || replace(gen_random_uuid()::text, '-', ''),
  komsel_id   TEXT REFERENCES komsel(komsel_id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  amount      BIGINT NOT NULL CHECK (amount > 0),
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'Menunggu' CHECK (status IN ('Menunggu', 'Terverifikasi', 'Ditolak')),
  recorded_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  verified_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  verified_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE komsel_offerings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "komsel_ofr_admin_all" ON komsel_offerings;
CREATE POLICY "komsel_ofr_admin_all" ON komsel_offerings FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
DROP POLICY IF EXISTS "komsel_ofr_pks_select" ON komsel_offerings;
CREATE POLICY "komsel_ofr_pks_select" ON komsel_offerings FOR SELECT USING (auth_leads_komsel(komsel_id));
DROP POLICY IF EXISTS "komsel_ofr_pks_insert" ON komsel_offerings;
CREATE POLICY "komsel_ofr_pks_insert" ON komsel_offerings FOR INSERT WITH CHECK (
  auth_leads_komsel(komsel_id) AND status = 'Menunggu'
);

-- (3) Pesan Ulang Tahun (PKS -> anggota komsel)
CREATE TABLE IF NOT EXISTS birthday_messages (
  id           TEXT PRIMARY KEY DEFAULT 'BDAY-' || replace(gen_random_uuid()::text, '-', ''),
  recipient_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  komsel_id    TEXT REFERENCES komsel(komsel_id) ON DELETE SET NULL,
  sender_id    TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  message      TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now(),
  read_at      TIMESTAMPTZ
);

ALTER TABLE birthday_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "bday_admin_all" ON birthday_messages;
CREATE POLICY "bday_admin_all" ON birthday_messages FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
DROP POLICY IF EXISTS "bday_recipient_select" ON birthday_messages;
CREATE POLICY "bday_recipient_select" ON birthday_messages FOR SELECT USING (recipient_id = auth_user_id());
DROP POLICY IF EXISTS "bday_recipient_mark_read" ON birthday_messages;
CREATE POLICY "bday_recipient_mark_read" ON birthday_messages FOR UPDATE
  USING (recipient_id = auth_user_id())
  WITH CHECK (recipient_id = auth_user_id());
DROP POLICY IF EXISTS "bday_pks_insert" ON birthday_messages;
CREATE POLICY "bday_pks_insert" ON birthday_messages FOR INSERT WITH CHECK (
  sender_id = auth_user_id() AND auth_leads_komsel(komsel_id)
);

-- (4) Registrasi Kelas (struktur identik event_registrations)
CREATE TABLE IF NOT EXISTS class_registrations (
  registration_id TEXT PRIMARY KEY DEFAULT 'CREG-' || extract(epoch from now())::bigint,
  class_id        TEXT REFERENCES classes(class_id) ON DELETE CASCADE,
  user_id         TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  registered_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE(class_id, user_id)
);

ALTER TABLE class_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "class_reg_select" ON class_registrations;
CREATE POLICY "class_reg_select" ON class_registrations FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "class_reg_insert" ON class_registrations;
CREATE POLICY "class_reg_insert" ON class_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "class_reg_admin_delete" ON class_registrations;
CREATE POLICY "class_reg_admin_delete" ON class_registrations FOR DELETE USING (
  auth_user_role() IN ('Admin', 'Super Admin')
);

-- (5) Sistem Penyerahan Anak (struktur mengikuti baptism_registrations)
CREATE TABLE IF NOT EXISTS child_dedication_registrations (
  dedication_id     TEXT PRIMARY KEY DEFAULT 'DED-' || extract(epoch from now())::bigint,
  user_id           TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  child_name        TEXT NOT NULL,
  child_birth_date  DATE,
  child_birth_place TEXT,
  father_name       TEXT,
  mother_name       TEXT,
  address           TEXT,
  nik               TEXT,
  notes             TEXT,
  documents         JSONB DEFAULT '{}',
  status            TEXT DEFAULT 'Menunggu' CHECK (status IN ('Menunggu','Sedang Ditinjau','Disetujui','Terjadwal','Selesai','Ditolak')),
  scheduled_at      TIMESTAMPTZ,
  admin_note        TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE child_dedication_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "dedication_select" ON child_dedication_registrations;
CREATE POLICY "dedication_select" ON child_dedication_registrations FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "dedication_insert" ON child_dedication_registrations;
CREATE POLICY "dedication_insert" ON child_dedication_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "dedication_admin_update" ON child_dedication_registrations;
CREATE POLICY "dedication_admin_update" ON child_dedication_registrations FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- (6) Sistem Sertifikat (diterbitkan manual oleh Admin)
CREATE TABLE IF NOT EXISTS certificates (
  certificate_id TEXT PRIMARY KEY DEFAULT 'CERT-' || replace(gen_random_uuid()::text, '-', ''),
  user_id        TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  file_url       TEXT NOT NULL,
  issued_by      TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  issued_at      TIMESTAMPTZ DEFAULT now(),
  note           TEXT
);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cert_owner_select" ON certificates;
CREATE POLICY "cert_owner_select" ON certificates FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);
DROP POLICY IF EXISTS "cert_admin_write" ON certificates;
CREATE POLICY "cert_admin_write" ON certificates FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- (7) Kategori Tugas (Super-Admin-only, gerbang akses TAMBAHAN)
CREATE TABLE IF NOT EXISTS task_categories (
  category_id TEXT PRIMARY KEY DEFAULT 'TCAT-' || extract(epoch from now())::bigint,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS task_category_ministries (
  category_id TEXT NOT NULL REFERENCES task_categories(category_id) ON DELETE CASCADE,
  ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id) ON DELETE CASCADE,
  PRIMARY KEY (category_id, ministry_id)
);

ALTER TABLE form_templates ADD COLUMN IF NOT EXISTS category_id TEXT REFERENCES task_categories(category_id) ON DELETE SET NULL;

ALTER TABLE task_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_cat_select" ON task_categories;
CREATE POLICY "task_cat_select" ON task_categories FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "task_cat_superadmin_write" ON task_categories;
CREATE POLICY "task_cat_superadmin_write" ON task_categories FOR ALL
  USING (auth_user_role() = 'Super Admin')
  WITH CHECK (auth_user_role() = 'Super Admin');

ALTER TABLE task_category_ministries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_catmin_select" ON task_category_ministries;
CREATE POLICY "task_catmin_select" ON task_category_ministries FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "task_catmin_superadmin_write" ON task_category_ministries;
CREATE POLICY "task_catmin_superadmin_write" ON task_category_ministries FOR ALL
  USING (auth_user_role() = 'Super Admin')
  WITH CHECK (auth_user_role() = 'Super Admin');

-- Migrasi data: kategori default "Umum" (tanpa batasan ministry) lalu
-- backfill semua form_templates lama supaya tidak kehilangan akses.
INSERT INTO task_categories (category_id, name) VALUES ('TCAT-DEFAULT-UMUM', 'Umum')
  ON CONFLICT (category_id) DO NOTHING;
UPDATE form_templates SET category_id = 'TCAT-DEFAULT-UMUM' WHERE category_id IS NULL;

-- ── Migrasi v26: Admin bisa tambah jemaat baru langsung ──────────────
-- Admin/Super Admin bisa membuat baris users baru (data jemaat) tanpa
-- akun login dulu — jemaat mengaktifkan sendiri lewat halaman Aktivasi
-- Akun (nomor HP + kode OTP WhatsApp), pola yang sama dipakai utk data
-- impor lama. auth_id WAJIB NULL saat dibuat Admin (tidak boleh klaim
-- akun auth orang lain secara langsung) — auth_id baru terisi lewat
-- /api/activate-verify yang pakai service role.
-- Jalankan blok ini sekali di Supabase SQL Editor.
DROP POLICY IF EXISTS "users_admin_insert" ON users;
CREATE POLICY "users_admin_insert" ON users FOR INSERT WITH CHECK (
  auth_user_role() IN ('Admin', 'Super Admin') AND auth_id IS NULL
);

-- ── Migrasi v27: nama sesi per kelas + spesifikasi tugas di izin ──────────
-- 1. classes.session_names TEXT[] — nama opsional per sesi, indeks 0 = sesi 1.
--    Admin bisa beri nama deskriptif (cth: ['Doktrin Keselamatan','Doa']).
-- 2. task_leaves.form_id TEXT + form_title TEXT — Volunteer bisa menyertakan
--    form/tugas mana yang ditinggalkan saat mengajukan izin/sakit, untuk
--    memudahkan Admin memvalidasi dan evaluasi dapat mempertimbangkan izin tsb.
-- Jalankan blok ini sekali di Supabase SQL Editor.
ALTER TABLE classes       ADD COLUMN IF NOT EXISTS session_names TEXT[];
ALTER TABLE task_leaves   ADD COLUMN IF NOT EXISTS form_id    TEXT;
ALTER TABLE task_leaves   ADD COLUMN IF NOT EXISTS form_title TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v28: Sistem Poin, NIJ, Kartu Jemaat, Sesi Komsel QR, ──────
-- ── Status 3-fase, Media Foto/Video, Biodata Tambahan ─────────────────
-- ══════════════════════════════════════════════════════════════════════
-- Jalankan blok ini sekali di Supabase SQL Editor (utuh dari atas ke bawah).

-- ── (1) Kolom baru users: NIJ, kartu jemaat, biodata, poin, last seen ──
ALTER TABLE users ADD COLUMN IF NOT EXISTS nij VARCHAR(10) UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_card_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS membership_card_issued_at DATE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS marital_status TEXT CHECK (marital_status IS NULL OR marital_status IN ('Lajang','Menikah','Duda/Janda'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS pekerjaan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pekerjaan_posisi TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pekerjaan_bidang TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pekerjaan_perusahaan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pekerjaan_pendapatan TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pendidikan_terakhir TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS pendidikan_bidang TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS biodata_points_awarded BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS users_points_idx ON users (points DESC);

-- ── (2) Media foto/video pada Kelas, Event, Informasi ──
ALTER TABLE classes ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE classes ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';
ALTER TABLE events  ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE events  ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';
ALTER TABLE news    ADD COLUMN IF NOT EXISTS photo_urls TEXT[] DEFAULT '{}';
ALTER TABLE news    ADD COLUMN IF NOT EXISTS video_urls TEXT[] DEFAULT '{}';

-- ── (3) Kontak WA per gender (Kelas & Event) ──
-- contact_wa lama pada events dipakai sebagai kontak Admin Laki-laki.
ALTER TABLE classes ADD COLUMN IF NOT EXISTS contact_wa TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS contact_wa_female TEXT;
ALTER TABLE events  ADD COLUMN IF NOT EXISTS contact_wa_female TEXT;

-- ── (4) Siklus status 3 fase: Mulai → Sedang Berlangsung → Selesai ──
-- Nilai lama dipetakan: Aktif → Mulai; Nonaktif (kelas) → Selesai.
-- 'Dibatalkan' (event) tetap diizinkan sebagai status legacy.
ALTER TABLE events DROP CONSTRAINT IF EXISTS events_status_check;
UPDATE events  SET status = 'Mulai'   WHERE status = 'Aktif';
UPDATE classes SET status = 'Mulai'   WHERE status = 'Aktif';
UPDATE classes SET status = 'Selesai' WHERE status = 'Nonaktif';
ALTER TABLE events ADD CONSTRAINT events_status_check
  CHECK (status IN ('Mulai','Sedang Berlangsung','Selesai','Dibatalkan'));

-- ── (5) Baptisan terikat kelas baptisan ──
ALTER TABLE baptism_registrations ADD COLUMN IF NOT EXISTS class_id TEXT REFERENCES classes(class_id) ON DELETE SET NULL;

-- ── (6) Sesi Absensi Komsel (QR oleh PKS, dipindai jemaat) ──
CREATE TABLE IF NOT EXISTS komsel_sessions (
  session_id   TEXT PRIMARY KEY DEFAULT 'KSES-' || replace(gen_random_uuid()::text, '-', ''),
  komsel_id    TEXT REFERENCES komsel(komsel_id) ON DELETE CASCADE,
  session_date DATE DEFAULT current_date,
  title        TEXT NOT NULL,
  created_by   TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE komsel_sessions ENABLE ROW LEVEL SECURITY;
-- Semua user login boleh baca (dibutuhkan validasi saat scan QR).
DROP POLICY IF EXISTS "ksess_read" ON komsel_sessions;
CREATE POLICY "ksess_read" ON komsel_sessions FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ksess_write" ON komsel_sessions;
CREATE POLICY "ksess_write" ON komsel_sessions FOR ALL
  USING (auth_user_role() IN ('Admin','Super Admin') OR auth_leads_komsel(komsel_id))
  WITH CHECK (auth_user_role() IN ('Admin','Super Admin') OR auth_leads_komsel(komsel_id));

ALTER TABLE komsel_attendance
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES komsel_sessions(session_id) ON DELETE CASCADE;
-- Satu kehadiran per sesi per user (hanya untuk baris hasil scan QR).
CREATE UNIQUE INDEX IF NOT EXISTS komsel_att_session_uniq
  ON komsel_attendance (session_id, user_id) WHERE session_id IS NOT NULL;
-- Jemaat boleh mencatat kehadirannya SENDIRI lewat scan QR sesi:
-- wajib menyertakan session_id yang valid & komsel_id-nya cocok dgn sesi itu.
DROP POLICY IF EXISTS "komsel_att_self_scan" ON komsel_attendance;
CREATE POLICY "komsel_att_self_scan" ON komsel_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND session_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM komsel_sessions s
    WHERE s.session_id = komsel_attendance.session_id
      AND s.komsel_id = komsel_attendance.komsel_id
  )
);
-- Jemaat boleh melihat baris kehadirannya sendiri (cek duplikat scan).
DROP POLICY IF EXISTS "komsel_att_self_select" ON komsel_attendance;
CREATE POLICY "komsel_att_self_select" ON komsel_attendance FOR SELECT USING (
  user_id = auth_user_id()
);

-- ── (7) Kehadiran Ibadah Minggu (QR harian dari Admin) ──
CREATE TABLE IF NOT EXISTS sunday_attendance (
  attendance_id   TEXT PRIMARY KEY DEFAULT 'SUN-' || replace(gen_random_uuid()::text, '-', ''),
  user_id         TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  attendance_date DATE DEFAULT current_date,
  scanned_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, attendance_date)
);
ALTER TABLE sunday_attendance ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sunday_att_select" ON sunday_attendance;
CREATE POLICY "sunday_att_select" ON sunday_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin','Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "sunday_att_insert" ON sunday_attendance;
CREATE POLICY "sunday_att_insert" ON sunday_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id() AND attendance_date = current_date
);
DROP POLICY IF EXISTS "sunday_att_admin_delete" ON sunday_attendance;
CREATE POLICY "sunday_att_admin_delete" ON sunday_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin','Super Admin')
);

-- ── (8) Katalog produk penukaran poin + tiket + riwayat transaksi ──
CREATE TABLE IF NOT EXISTS redeemable_products (
  product_id   TEXT PRIMARY KEY DEFAULT 'PRD-' || replace(gen_random_uuid()::text, '-', ''),
  name         TEXT NOT NULL,
  points_cost  INT NOT NULL CHECK (points_cost > 0),
  description  TEXT,
  image_url    TEXT,
  stock        INT DEFAULT 0,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE redeemable_products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products_read" ON redeemable_products;
CREATE POLICY "products_read" ON redeemable_products FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "products_admin_write" ON redeemable_products;
CREATE POLICY "products_admin_write" ON redeemable_products FOR ALL
  USING (auth_user_role() IN ('Admin','Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));

CREATE TABLE IF NOT EXISTS point_transactions (
  transaction_id TEXT PRIMARY KEY DEFAULT 'PTX-' || replace(gen_random_uuid()::text, '-', ''),
  user_id        TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  amount         INT NOT NULL,
  description    TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ptx_user_idx ON point_transactions (user_id, created_at DESC);
ALTER TABLE point_transactions ENABLE ROW LEVEL SECURITY;
-- Hanya SELECT (milik sendiri / admin). INSERT hanya lewat fungsi SECURITY
-- DEFINER di bawah — sengaja TIDAK ada policy INSERT untuk klien.
DROP POLICY IF EXISTS "ptx_select" ON point_transactions;
CREATE POLICY "ptx_select" ON point_transactions FOR SELECT USING (
  auth_user_role() IN ('Admin','Super Admin') OR user_id = auth_user_id()
);

CREATE TABLE IF NOT EXISTS redemption_tickets (
  ticket_id    TEXT PRIMARY KEY DEFAULT 'TCK-' || replace(gen_random_uuid()::text, '-', ''),
  product_id   TEXT REFERENCES redeemable_products(product_id) ON DELETE CASCADE,
  points_cost  INT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'Aktif' CHECK (status IN ('Aktif','Digunakan','Expired')),
  redeemed_by  TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  redeemed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE redemption_tickets ENABLE ROW LEVEL SECURITY;
-- Tiket dikelola admin; jemaat menukar lewat fungsi redeem_ticket (definer).
DROP POLICY IF EXISTS "tickets_admin_all" ON redemption_tickets;
CREATE POLICY "tickets_admin_all" ON redemption_tickets FOR ALL
  USING (auth_user_role() IN ('Admin','Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));

-- ── (9) Trigger NIJ otomatis (10 digit unik, saat baris users dibuat) ──
CREATE OR REPLACE FUNCTION generate_unique_nij() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_nij VARCHAR(10);
  exists_nij BOOLEAN;
BEGIN
  IF NEW.nij IS NULL THEN
    LOOP
      new_nij := floor(random() * 9000000000 + 1000000000)::text;
      SELECT EXISTS (SELECT 1 FROM users WHERE nij = new_nij) INTO exists_nij;
      EXIT WHEN NOT exists_nij;
    END LOOP;
    NEW.nij := new_nij;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_generate_nij ON users;
CREATE TRIGGER trg_generate_nij
  BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION generate_unique_nij();

-- Backfill NIJ untuk baris lama yang belum punya.
UPDATE users SET nij = NULL WHERE nij = '';
DO $$
DECLARE r RECORD; new_nij TEXT;
BEGIN
  FOR r IN SELECT user_id FROM users WHERE nij IS NULL LOOP
    LOOP
      new_nij := floor(random() * 9000000000 + 1000000000)::text;
      EXIT WHEN NOT EXISTS (SELECT 1 FROM users WHERE nij = new_nij);
    END LOOP;
    UPDATE users SET nij = new_nij WHERE user_id = r.user_id;
  END LOOP;
END $$;

-- ── (10) Keamanan poin: kolom sensitif TIDAK boleh diubah klien ──
-- Perluas guard privilege (v23): non-admin dilarang mengubah points,
-- biodata_points_awarded, nij, dan kolom kartu jemaat pada baris MANA PUN
-- (termasuk miliknya). Fungsi definer poin memakai escape hatch
-- current_setting('app.allow_points_update') supaya tetap bisa menulis.
CREATE OR REPLACE FUNCTION guard_user_privilege_cols() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth_user_role() NOT IN ('Admin', 'Super Admin') THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.role_secondary IS DISTINCT FROM OLD.role_secondary
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.is_pks IS DISTINCT FROM OLD.is_pks
       OR NEW.komsel_id IS DISTINCT FROM OLD.komsel_id THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah kolom hak akses sendiri.';
    END IF;
    IF COALESCE(current_setting('app.allow_points_update', true), '') <> '1' THEN
      IF NEW.points IS DISTINCT FROM OLD.points
         OR NEW.biodata_points_awarded IS DISTINCT FROM OLD.biodata_points_awarded THEN
        RAISE EXCEPTION 'Poin tidak dapat diubah langsung.';
      END IF;
    END IF;
    IF NEW.nij IS DISTINCT FROM OLD.nij
       OR NEW.membership_card_url IS DISTINCT FROM OLD.membership_card_url
       OR NEW.membership_card_issued_at IS DISTINCT FROM OLD.membership_card_issued_at THEN
      RAISE EXCEPTION 'Kolom kartu jemaat hanya dapat diubah Admin.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- NIJ & kartu jemaat orang lain hanya boleh diubah Super Admin (konsisten v24).
CREATE OR REPLACE FUNCTION guard_biodata_admin_edit() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM OLD.auth_id AND auth_user_role() = 'Admin' THEN
    IF NEW.name IS DISTINCT FROM OLD.name
       OR NEW.phone IS DISTINCT FROM OLD.phone
       OR NEW.email IS DISTINCT FROM OLD.email
       OR NEW.gender IS DISTINCT FROM OLD.gender
       OR NEW.birth_date IS DISTINCT FROM OLD.birth_date
       OR NEW.birth_place IS DISTINCT FROM OLD.birth_place
       OR NEW.address IS DISTINCT FROM OLD.address
       OR NEW.blood_type IS DISTINCT FROM OLD.blood_type
       OR NEW.nik IS DISTINCT FROM OLD.nik
       OR NEW.social_media IS DISTINCT FROM OLD.social_media
       OR NEW.photo_url IS DISTINCT FROM OLD.photo_url
       OR NEW.nij IS DISTINCT FROM OLD.nij
       OR NEW.membership_card_url IS DISTINCT FROM OLD.membership_card_url
       OR NEW.membership_card_issued_at IS DISTINCT FROM OLD.membership_card_issued_at THEN
      RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah biodata jemaat lain.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- ── (11) Fungsi inti poin (SECURITY DEFINER) ──
-- Penulis tunggal saldo poin + riwayat transaksi. Tidak dipanggil klien
-- langsung — hanya dari trigger kehadiran & fungsi redeem/biodata di bawah.
CREATE OR REPLACE FUNCTION apply_points(p_user_id TEXT, p_amount INT, p_desc TEXT) RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.allow_points_update', '1', true);
  UPDATE users SET points = GREATEST(0, COALESCE(points, 0) + p_amount) WHERE user_id = p_user_id;
  INSERT INTO point_transactions (user_id, amount, description) VALUES (p_user_id, p_amount, p_desc);
  PERFORM set_config('app.allow_points_update', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION apply_points(TEXT, INT, TEXT) FROM PUBLIC, anon, authenticated;

-- +1 poin otomatis saat kehadiran tercatat (kelas, event, ibadah minggu,
-- komsel via scan QR sesi). Duplikat dicegah oleh unique constraint tabelnya.
CREATE OR REPLACE FUNCTION award_attendance_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'komsel_attendance' THEN
    -- Hanya kehadiran hasil scan QR sesi (bukan checklist manual PKS) yang
    -- memberi poin — checklist manual bisa dihapus/ditulis ulang massal.
    IF NEW.session_id IS NULL OR NEW.status IS DISTINCT FROM 'Hadir' THEN
      RETURN NEW;
    END IF;
  END IF;
  PERFORM apply_points(NEW.user_id, 1,
    CASE TG_TABLE_NAME
      WHEN 'class_attendance'  THEN 'Kehadiran kelas'
      WHEN 'event_attendance'  THEN 'Kehadiran event'
      WHEN 'sunday_attendance' THEN 'Kehadiran ibadah minggu'
      WHEN 'komsel_attendance' THEN 'Kehadiran komsel'
      ELSE 'Kehadiran'
    END);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_point_class_att  ON class_attendance;
CREATE TRIGGER trg_point_class_att  AFTER INSERT ON class_attendance  FOR EACH ROW EXECUTE FUNCTION award_attendance_point();
DROP TRIGGER IF EXISTS trg_point_event_att  ON event_attendance;
CREATE TRIGGER trg_point_event_att  AFTER INSERT ON event_attendance  FOR EACH ROW EXECUTE FUNCTION award_attendance_point();
DROP TRIGGER IF EXISTS trg_point_sunday_att ON sunday_attendance;
CREATE TRIGGER trg_point_sunday_att AFTER INSERT ON sunday_attendance FOR EACH ROW EXECUTE FUNCTION award_attendance_point();
DROP TRIGGER IF EXISTS trg_point_komsel_att ON komsel_attendance;
CREATE TRIGGER trg_point_komsel_att AFTER INSERT ON komsel_attendance FOR EACH ROW EXECUTE FUNCTION award_attendance_point();

-- +5 poin biodata lengkap (sekali seumur akun). Dipanggil klien via RPC;
-- validasi kelengkapan dilakukan DI SERVER, bukan mempercayai klien.
CREATE OR REPLACE FUNCTION award_biodata_points() RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE u RECORD;
BEGIN
  SELECT * INTO u FROM users WHERE auth_id = auth.uid();
  IF u IS NULL THEN RETURN jsonb_build_object('awarded', false, 'reason', 'no_user'); END IF;
  IF u.biodata_points_awarded THEN RETURN jsonb_build_object('awarded', false, 'reason', 'already'); END IF;
  IF COALESCE(u.name,'') = '' OR COALESCE(u.phone,'') = '' OR u.gender IS NULL
     OR u.birth_date IS NULL OR COALESCE(u.birth_place,'') = '' OR COALESCE(u.address,'') = ''
     OR u.marital_status IS NULL OR COALESCE(u.pekerjaan,'') = ''
     OR COALESCE(u.pendidikan_terakhir,'') = '' THEN
    RETURN jsonb_build_object('awarded', false, 'reason', 'incomplete');
  END IF;
  PERFORM set_config('app.allow_points_update', '1', true);
  UPDATE users SET biodata_points_awarded = true WHERE user_id = u.user_id;
  PERFORM set_config('app.allow_points_update', '', true);
  PERFORM apply_points(u.user_id, 5, 'Melengkapi biodata');
  RETURN jsonb_build_object('awarded', true);
END $$;

-- Tukar poin: scan tiket QR (ESC-REDEEM:<ticket_id>) → potong poin + tandai
-- tiket Digunakan, atomik. Dipanggil klien via RPC.
CREATE OR REPLACE FUNCTION redeem_ticket(p_ticket_id TEXT) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t RECORD;
  uid TEXT;
  bal INT;
  pname TEXT;
BEGIN
  uid := auth_user_id();
  IF uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_user'); END IF;
  SELECT * INTO t FROM redemption_tickets WHERE ticket_id = p_ticket_id FOR UPDATE;
  IF t IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF t.status <> 'Aktif' THEN RETURN jsonb_build_object('ok', false, 'reason', 'used'); END IF;
  SELECT points INTO bal FROM users WHERE user_id = uid;
  IF COALESCE(bal, 0) < t.points_cost THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient', 'needed', t.points_cost, 'balance', COALESCE(bal, 0));
  END IF;
  SELECT name INTO pname FROM redeemable_products WHERE product_id = t.product_id;
  UPDATE redemption_tickets SET status = 'Digunakan', redeemed_by = uid, redeemed_at = now()
    WHERE ticket_id = p_ticket_id;
  PERFORM apply_points(uid, -t.points_cost, 'Tukar poin: ' || COALESCE(pname, 'produk'));
  RETURN jsonb_build_object('ok', true, 'product', pname, 'cost', t.points_cost, 'balance', COALESCE(bal, 0) - t.points_cost);
END $$;

-- Leaderboard poin: nama + foto + poin (RLS users membatasi SELECT antar
-- jemaat, jadi disediakan lewat definer dengan kolom seperlunya saja).
CREATE OR REPLACE FUNCTION get_points_leaderboard(p_limit INT DEFAULT 10)
  RETURNS TABLE (user_id TEXT, name TEXT, photo_url TEXT, points INT)
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT u.user_id, u.name, u.photo_url, COALESCE(u.points, 0)
  FROM users u
  WHERE u.status = 'Aktif'
  ORDER BY COALESCE(u.points, 0) DESC, u.name ASC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 10), 1), 100)
$$;

-- ── (12) Seed pengaturan default ──
INSERT INTO app_settings (key, value) VALUES ('roadmap_show_count', '1'::jsonb)
  ON CONFLICT (key) DO NOTHING;
INSERT INTO app_settings (key, value) VALUES ('baptism_status', '"open"'::jsonb)
  ON CONFLICT (key) DO NOTHING;

-- Admin (bukan hanya Super Admin) boleh menulis kunci pengaturan konten
-- tertentu: roadmap pemuridan & status pendaftaran baptisan.
DROP POLICY IF EXISTS "app_settings_admin_content" ON app_settings;
CREATE POLICY "app_settings_admin_content" ON app_settings FOR ALL
  USING (
    auth_user_role() IN ('Admin','Super Admin')
    AND key IN ('discipleship_roadmap','roadmap_show_count','baptism_status')
  )
  WITH CHECK (
    auth_user_role() IN ('Admin','Super Admin')
    AND key IN ('discipleship_roadmap','roadmap_show_count','baptism_status')
  );

-- ── Migrasi v29: Lengkapi field formulir Pernikahan sesuai formulir resmi ──
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_birth_place TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_ktp TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_disdukcapil_name TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_baptism_date DATE;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_baptism_church TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_marital_history TEXT CHECK (groom_marital_history IN ('Belum Pernah','Pernah'));
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_address TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_father_phone TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS groom_mother_phone TEXT;

ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_birth_place TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_ktp TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_disdukcapil_name TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_baptism_date DATE;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_baptism_church TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_marital_history TEXT CHECK (bride_marital_history IN ('Belum Pernah','Pernah'));
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_address TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_father_phone TEXT;
ALTER TABLE wedding_registrations ADD COLUMN IF NOT EXISTS bride_mother_phone TEXT;

-- ── Migrasi v30: Pisah opsi Status Pernikahan jadi Single/Menikah/Duda/Janda ──
-- Migrasi data lama: 'Lajang' → 'Single'; 'Duda/Janda' dipecah berdasar gender.
UPDATE users SET marital_status = 'Single' WHERE marital_status = 'Lajang';
UPDATE users SET marital_status = 'Duda' WHERE marital_status = 'Duda/Janda' AND gender = 'Laki-laki';
UPDATE users SET marital_status = 'Janda' WHERE marital_status = 'Duda/Janda' AND gender = 'Perempuan';
UPDATE users SET marital_status = 'Duda' WHERE marital_status = 'Duda/Janda' AND gender IS NULL;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_marital_status_check;
ALTER TABLE users ADD CONSTRAINT users_marital_status_check
  CHECK (marital_status IS NULL OR marital_status IN ('Single','Menikah','Duda','Janda'));

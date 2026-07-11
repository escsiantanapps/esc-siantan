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
  status          TEXT DEFAULT 'Hadir' CHECK (status IN ('Hadir','Tidak Hadir','Izin','Sakit')),
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
CREATE UNIQUE INDEX unique_daily_response ON form_responses (form_id, volunteer_id, (submitted_at::date));

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

-- ── News & Events: semua bisa baca, admin tulis ──
CREATE POLICY "news_read_all"   ON news   FOR SELECT USING (true);
CREATE POLICY "news_admin_write" ON news FOR ALL USING (auth_user_role() IN ('Admin', 'Super Admin')) WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
CREATE POLICY "events_read_all" ON events FOR SELECT USING (true);
CREATE POLICY "events_admin_write" ON events FOR ALL USING (auth_user_role() IN ('Admin', 'Super Admin')) WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

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

DROP POLICY IF EXISTS "profile_photos_delete" ON storage.objects;
CREATE POLICY "profile_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
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
  proof_url   TEXT,
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
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
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

CREATE OR REPLACE FUNCTION deduct_user_point(p_user_id TEXT, p_amount INT)
RETURNS void AS $$
BEGIN
  -- Pengurangan dipicu oleh komselService.deleteSessionAttendance().
  UPDATE users
  SET points = GREATEST(COALESCE(points, 0) - p_amount, 0)
  WHERE user_id = p_user_id;

  INSERT INTO point_transactions (user_id, amount, description)
  VALUES (p_user_id, -p_amount, 'Kehadiran dibatalkan/dihapus');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

REVOKE EXECUTE ON FUNCTION deduct_user_point FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deduct_user_point TO service_role;

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

-- ── Migrasi v31: tutup lubang RLS pada classes, komsel, ministries ──────
-- Ketiga tabel ini belum ENABLE ROW LEVEL SECURITY. Tanpa RLS, siapa pun yang
-- punya anon key (yang ikut ter-bundle di aplikasi klien) bisa membaca, menambah,
-- MENGUBAH, atau MENGHAPUS baris langsung lewat REST API — mem-bypass aplikasi.
-- Artinya seluruh daftar kelas, komsel, dan ministry bisa dihapus orang luar.
-- Perbaikan: aktifkan RLS + pola yang sama seperti komsel_categories:
--   baca = semua user login; tulis (insert/update/delete) = Admin/Super Admin saja.
-- (Sesuai audit kode: tabel-tabel ini HANYA ditulis dari halaman admin.
--  Tulisan PKS di dashboard menyasar komsel_sessions, bukan tabel komsel.)
--
-- CEK STATUS ASLI DI PRODUCTION DULU (schema.sql bisa drift dari DB nyata):
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname IN ('classes','komsel','ministries');
-- relrowsecurity = false berarti tabel itu memang masih terbuka.

ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "classes_select" ON classes;
CREATE POLICY "classes_select" ON classes FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "classes_admin_write" ON classes;
CREATE POLICY "classes_admin_write" ON classes FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

ALTER TABLE komsel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "komsel_select" ON komsel;
CREATE POLICY "komsel_select" ON komsel FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "komsel_admin_write" ON komsel;
CREATE POLICY "komsel_admin_write" ON komsel FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

ALTER TABLE ministries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ministries_select" ON ministries;
CREATE POLICY "ministries_select" ON ministries FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ministries_admin_write" ON ministries;
CREATE POLICY "ministries_admin_write" ON ministries FOR ALL
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── Migrasi v32: Audit log perubahan data sensitif oleh admin ──────────
-- Mencatat SIAPA & KAPAN mengubah/menghapus data penting: role & biodata
-- jemaat, hak akses admin, rekening/QRIS persembahan, komsel, ministry,
-- sertifikat. Immutable & hanya Super Admin yang boleh membaca.

CREATE TABLE IF NOT EXISTS audit_log (
  id            BIGSERIAL PRIMARY KEY,
  actor_user_id TEXT,          -- users.user_id pelaku (NULL = aksi sistem/cron)
  actor_name    TEXT,
  actor_role    TEXT,
  action        TEXT NOT NULL, -- INSERT | UPDATE | DELETE
  table_name    TEXT NOT NULL,
  record_id     TEXT,          -- id baris yang terpengaruh
  changed_fields TEXT[],       -- kolom yang berubah (khusus UPDATE)
  old_data      JSONB,
  new_data      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_table   ON audit_log(table_name);
CREATE INDEX IF NOT EXISTS idx_audit_actor   ON audit_log(actor_user_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Hanya Super Admin boleh baca; tak ada policy tulis → hanya trigger
-- SECURITY DEFINER di bawah yang bisa mengisi (log tidak bisa dipalsukan/dihapus klien).
DROP POLICY IF EXISTS "audit_super_read" ON audit_log;
CREATE POLICY "audit_super_read" ON audit_log FOR SELECT
  USING (auth_user_role() = 'Super Admin');

-- Kolom "berisik" yang TIDAK perlu dicatat (mis. heartbeat last_seen_at tiap 2 menit,
-- poin yang naik tiap absen — sudah punya jejak di point_transactions).
CREATE OR REPLACE FUNCTION record_audit() RETURNS TRIGGER AS $$
DECLARE
  noise      TEXT[] := ARRAY['last_seen_at','updated_at','points','created_at'];
  v_actor_id   TEXT;
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_record_id  TEXT;
  v_changed    TEXT[];
  v_old JSONB; v_new JSONB; k TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW);
    FOR k IN SELECT jsonb_object_keys(v_new) LOOP
      IF (v_new->k IS DISTINCT FROM v_old->k) AND NOT (k = ANY(noise)) THEN
        v_changed := array_append(v_changed, k);
      END IF;
    END LOOP;
    -- Tidak ada kolom penting yang berubah → jangan catat (hemat & tanpa spam).
    IF v_changed IS NULL THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
  ELSE
    v_new := to_jsonb(NEW);
  END IF;

  v_record_id := coalesce(
    (COALESCE(v_new, v_old))->>'user_id',
    (COALESCE(v_new, v_old))->>'komsel_id',
    (COALESCE(v_new, v_old))->>'ministry_id',
    (COALESCE(v_new, v_old))->>'certificate_id',
    (COALESCE(v_new, v_old))->>'id'
  );

  v_actor_id := auth_user_id();
  v_actor_role := auth_user_role();
  SELECT name INTO v_actor_name FROM users WHERE user_id = v_actor_id;

  INSERT INTO audit_log(actor_user_id, actor_name, actor_role, action,
                        table_name, record_id, changed_fields, old_data, new_data)
  VALUES (v_actor_id, v_actor_name, v_actor_role, TG_OP,
          TG_TABLE_NAME, v_record_id, v_changed, v_old, v_new);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Pasang trigger ke tabel-tabel sensitif (idempotent).
DROP TRIGGER IF EXISTS audit_users ON users;
CREATE TRIGGER audit_users AFTER INSERT OR UPDATE OR DELETE ON users
  FOR EACH ROW EXECUTE FUNCTION record_audit();
DROP TRIGGER IF EXISTS audit_perms ON admin_user_permissions;
CREATE TRIGGER audit_perms AFTER INSERT OR UPDATE OR DELETE ON admin_user_permissions
  FOR EACH ROW EXECUTE FUNCTION record_audit();
DROP TRIGGER IF EXISTS audit_payacc ON payment_accounts;
CREATE TRIGGER audit_payacc AFTER INSERT OR UPDATE OR DELETE ON payment_accounts
  FOR EACH ROW EXECUTE FUNCTION record_audit();
DROP TRIGGER IF EXISTS audit_komsel ON komsel;
CREATE TRIGGER audit_komsel AFTER INSERT OR UPDATE OR DELETE ON komsel
  FOR EACH ROW EXECUTE FUNCTION record_audit();
DROP TRIGGER IF EXISTS audit_ministries ON ministries;
CREATE TRIGGER audit_ministries AFTER INSERT OR UPDATE OR DELETE ON ministries
  FOR EACH ROW EXECUTE FUNCTION record_audit();
DROP TRIGGER IF EXISTS audit_certificates ON certificates;
CREATE TRIGGER audit_certificates AFTER INSERT OR UPDATE OR DELETE ON certificates
  FOR EACH ROW EXECUTE FUNCTION record_audit();

-- ── Migrasi v33: KTJ (Kartu Tanda Jemaat) — alur permintaan & tinjauan ──
-- Pendaftaran KTJ SELALU terbuka (tidak ada toggle admin seperti baptism_status).
-- Approve HANYA mengubah status — admin tetap menerbitkan kartu fisik secara
-- terpisah lewat AdminMemberDetailPage (upload membership_card_url yang
-- sudah ada sejak v28). Tidak ada dokumen/file di form ini.
CREATE TABLE IF NOT EXISTS ktj_registrations (
  ktj_id       TEXT PRIMARY KEY DEFAULT 'KTJ-' || extract(epoch from now())::bigint,
  user_id      TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  full_name    TEXT NOT NULL,
  birth_date   DATE,
  birth_place  TEXT,
  address      TEXT,
  komsel_id    TEXT REFERENCES komsel(komsel_id) ON DELETE SET NULL,
  status       TEXT DEFAULT 'Menunggu'
    CHECK (status IN ('Menunggu','Sedang Ditinjau','Disetujui','Terjadwal','Selesai','Ditolak')),
  scheduled_at TIMESTAMPTZ,
  admin_note   TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE ktj_registrations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ktj_select" ON ktj_registrations;
CREATE POLICY "ktj_select" ON ktj_registrations FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "ktj_insert" ON ktj_registrations;
CREATE POLICY "ktj_insert" ON ktj_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "ktj_admin_update" ON ktj_registrations;
CREATE POLICY "ktj_admin_update" ON ktj_registrations FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── Migrasi v34: Formulir Prasyarat + link grup WA + fix RLS event_reg ──
-- Opt-in per Event/Kelas via prerequisite_fields JSONB. NULL/kosong = perilaku
-- lama tak berubah (daftar langsung tanpa syarat). Bila diaktifkan: user WAJIB
-- submit + disetujui admin dulu SEBELUM baris registrasi dibuat.
ALTER TABLE events  ADD COLUMN IF NOT EXISTS prerequisite_fields JSONB;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS prerequisite_fields JSONB;

-- Link grup WhatsApp per Event/Kelas — ditampilkan HANYA bagi jemaat yg sudah
-- terdaftar (baris di event_registrations/class_registrations ada). Sebelum
-- terdaftar / saat status Menunggu prasyarat, link tidak dibocorkan.
ALTER TABLE events  ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT;
ALTER TABLE classes ADD COLUMN IF NOT EXISTS whatsapp_group_url TEXT;

CREATE TABLE IF NOT EXISTS registration_prerequisites (
  id          TEXT PRIMARY KEY DEFAULT 'PREQ-' || replace(gen_random_uuid()::text, '-', ''),
  event_id    TEXT REFERENCES events(event_id)   ON DELETE CASCADE,
  class_id    TEXT REFERENCES classes(class_id)  ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  data_json   JSONB DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'Menunggu'
    CHECK (status IN ('Menunggu','Disetujui','Ditolak')),
  admin_note  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT preq_exactly_one_target CHECK (
    (event_id IS NOT NULL AND class_id IS NULL) OR
    (event_id IS NULL AND class_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS preq_event_user_uniq
  ON registration_prerequisites (event_id, user_id) WHERE event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS preq_class_user_uniq
  ON registration_prerequisites (class_id, user_id) WHERE class_id IS NOT NULL;

ALTER TABLE event_registrations ADD COLUMN IF NOT EXISTS prerequisite_id
  TEXT REFERENCES registration_prerequisites(id) ON DELETE CASCADE;
ALTER TABLE class_registrations ADD COLUMN IF NOT EXISTS prerequisite_id
  TEXT REFERENCES registration_prerequisites(id) ON DELETE CASCADE;

ALTER TABLE registration_prerequisites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "preq_select" ON registration_prerequisites;
CREATE POLICY "preq_select" ON registration_prerequisites FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "preq_insert" ON registration_prerequisites;
CREATE POLICY "preq_insert" ON registration_prerequisites FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "preq_admin_update" ON registration_prerequisites;
CREATE POLICY "preq_admin_update" ON registration_prerequisites FOR UPDATE
  USING (auth_user_role() IN ('Admin', 'Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin', 'Super Admin'));
DROP POLICY IF EXISTS "preq_admin_delete" ON registration_prerequisites;
CREATE POLICY "preq_admin_delete" ON registration_prerequisites FOR DELETE
  USING (auth_user_role() IN ('Admin', 'Super Admin'));

-- FIX PRA-EXISTING: event_registrations sudah ENABLE ROW LEVEL SECURITY sejak
-- v23 tapi TIDAK PUNYA SATU PUN POLICY di seluruh schema.sql — kemungkinan
-- besar policy ditambah manual di production (drift). Tutup gap dengan 3
-- policy setara class_registrations. Idempotent — aman bila sudah ada.
DROP POLICY IF EXISTS "event_reg_select" ON event_registrations;
CREATE POLICY "event_reg_select" ON event_registrations FOR SELECT USING (
  auth_user_role() IN ('Admin', 'Super Admin') OR user_id = auth_user_id()
);
DROP POLICY IF EXISTS "event_reg_insert" ON event_registrations;
CREATE POLICY "event_reg_insert" ON event_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);
DROP POLICY IF EXISTS "event_reg_admin_delete" ON event_registrations;
CREATE POLICY "event_reg_admin_delete" ON event_registrations FOR DELETE
  USING (auth_user_role() IN ('Admin', 'Super Admin'));

-- ── Migrasi v35: Slot pengingat tugas (Pagi/Siang/Sore) ────────────────
-- reminder_slots kosong ('{}') = cocok SEMUA slot (backward-compat: tugas
-- lama dengan reminder_enabled=true tetap terkirim tanpa perlu dikonfigurasi
-- ulang, kini di 3 slot per hari).
ALTER TABLE form_templates
  ADD COLUMN IF NOT EXISTS reminder_slots TEXT[] DEFAULT '{}';

-- ── Migrasi v36: Sampul (thumbnail) kelas ──────────────────────────────
-- ClassesPage sudah merender cls.thumbnail_url sejak lama (fallback ke ikon
-- BookOpen bila NULL), tapi kolomnya belum ada dan admin belum bisa unggah.
-- Tambahkan kolom + admin gain upload UI (lihat AdminClassesPage.jsx).
ALTER TABLE classes ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- ── Migrasi v37: Kolom Profesi pada biodata ────────────────────────────
-- Melengkapi bagian Pendidikan di EditProfilePage. "Profesi" berbeda dari
-- "pekerjaan" (jabatan/status kerja umum): profesi = keahlian spesifik yang
-- diperoleh dari pendidikan/sertifikasi (mis. Dokter, Guru, Akuntan,
-- Pengacara, Programmer, Perawat). Boleh kosong.
ALTER TABLE users ADD COLUMN IF NOT EXISTS profesi TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v38: Hardening keamanan (audit temuan 2026-07-06) ──────────
-- ══════════════════════════════════════════════════════════════════════
-- Menutup 6 lubang yang teridentifikasi audit:
--   (a) Points farming: class_attendance INSERT tanpa validasi kelas aktif
--       + terdaftar → jemaat bisa INSERT langsung via PostgREST dan panen
--       poin. Perketat WITH CHECK.
--   (b) Points farming: sunday_attendance INSERT hanya cek current_date
--       tanpa validasi hari Minggu → jemaat bisa +1 poin/hari. Batasi ke
--       Minggu (dow=0) di zona WIB.
--   (c) task-files bucket publik dengan SELECT tanpa auth → bukti tugas
--       (bisa berisi PII) terekspos. Batasi SELECT ke authenticated saja
--       (bucket tetap public agar backwards-compat, tapi dilindungi RLS).
--   (d) profile-photos INSERT dulu longgar untuk path non-avatars — user
--       authenticated bisa menimpa news/qris/dsb. Batasi path news/,
--       events/, qris/, offerings/ ke Admin/Super Admin saja.
--   (e) PKS bisa baca kolom NIK anggota komsel via PostgREST langsung
--       (RLS bukan column-level). Sediakan RPC get_komsel_members yang
--       kembalikan kolom aman tanpa NIK — panduan: klien harus pakai RPC
--       ini di UI PKS, kebijakan RLS row-level tetap ada sebagai fallback.
--   (f) documents bucket harus benar-benar privat + policy admin-read
--       (client baru pakai signed URL).

-- (a) class_attendance: hanya boleh insert bila kelas aktif + terdaftar.
DROP POLICY IF EXISTS "class_att_insert" ON class_attendance;
CREATE POLICY "class_att_insert" ON class_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND EXISTS (
    SELECT 1 FROM classes c
    WHERE c.class_id = class_attendance.class_id
      AND c.status IN ('Mulai','Sedang Berlangsung')
  )
  AND EXISTS (
    SELECT 1 FROM class_registrations r
    WHERE r.class_id = class_attendance.class_id AND r.user_id = auth_user_id()
  )
);

-- (b) sunday_attendance: hanya boleh insert pada hari Minggu (dow=0) WIB.
--     Kombinasi UNIQUE (user_id, attendance_date) + Sunday-only membatasi
--     ke +1 poin/minggu — konsisten dengan realita ibadah mingguan.
DROP POLICY IF EXISTS "sunday_att_insert" ON sunday_attendance;
CREATE POLICY "sunday_att_insert" ON sunday_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND attendance_date = (current_timestamp AT TIME ZONE 'Asia/Jakarta')::date
  AND extract(dow FROM (current_timestamp AT TIME ZONE 'Asia/Jakarta')) = 0
);

-- (c) task-files: KEPUTUSAN OPERATOR (2026-07-06) — bucket dibiarkan
--     PUBLIC untuk SELECT. Bukti tugas dinilai tidak sensitif oleh
--     operator, dan mengubah ke private akan memutus URL lama tanpa
--     manfaat besar. Namun INSERT/UPDATE tetap perlu dibatasi supaya
--     jemaat tidak bisa menimpa bukti tugas orang lain.
--
--     Pola path yang dipakai kode:
--       responses/<owner_id>/<Date>_<file>   → jawaban tugas jemaat
--       leaves/<owner_id>/<Date>_<file>      → bukti izin/sakit jemaat
--       form-bg/<Date>.<ext>                 → background form (Admin)
--       classes|events|news/video/<...>      → video (mediaService)
--
--     Policy authenticated-SELECT tetap ditambahkan sebagai defense-in-depth
--     (bila di masa depan bucket dijadikan private, RLS langsung berlaku
--     tanpa perlu migrasi baru). Untuk bucket public sekarang, RLS SELECT
--     di-bypass Supabase — jadi tidak mengubah perilaku publik saat ini.
DROP POLICY IF EXISTS "task_files_read" ON storage.objects;
CREATE POLICY "task_files_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'task-files');

DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      -- Jawaban tugas & bukti izin: path[1] wajib user_id sendiri.
      ((name LIKE 'responses/%' OR name LIKE 'leaves/%')
        AND split_part(name, '/', 2) = auth_user_id())
      -- Background form + video kurasi: Admin/Super Admin saja.
      OR ((name LIKE 'form-bg/%'
           OR name LIKE 'classes/video/%' OR name LIKE 'classes/%/video/%'
           OR name LIKE 'events/video/%'  OR name LIKE 'events/%/video/%'
           OR name LIKE 'news/video/%'    OR name LIKE 'news/%/video/%')
        AND auth_user_role() IN ('Admin','Super Admin'))
    )
  );

DROP POLICY IF EXISTS "task_files_update" ON storage.objects;
CREATE POLICY "task_files_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'task-files'
    AND (
      ((name LIKE 'responses/%' OR name LIKE 'leaves/%')
        AND split_part(name, '/', 2) = auth_user_id())
      OR (auth_user_role() IN ('Admin','Super Admin'))
    )
  )
  WITH CHECK (
    bucket_id = 'task-files'
  );

-- (d) profile-photos: fail-closed dengan whitelist path.
--     Pola path yang dipakai kode:
--       avatars/<owner_id>.<ext>             → foto profil jemaat (owner)
--       offerings/<owner_id>/<...>           → bukti transfer persembahan (owner)
--       events/<...>, news/<...>, classes/<...>,
--       qris/<...>, products/<...>, roadmap/<...>,
--       membership-cards/<...>               → konten kurasi (Admin only)
DROP POLICY IF EXISTS "profile_photos_insert" ON storage.objects;
CREATE POLICY "profile_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND (
      -- Owner paths
      (name LIKE 'avatars/' || auth_user_id() || '.%')
      OR (name LIKE 'offerings/%'
          AND split_part(name, '/', 2) = auth_user_id())
      -- Admin-managed content folders
      OR ((name LIKE 'news/%' OR name LIKE 'events/%' OR name LIKE 'classes/%'
           OR name LIKE 'qris/%' OR name LIKE 'products/%'
           OR name LIKE 'roadmap/%' OR name LIKE 'membership-cards/%')
        AND auth_user_role() IN ('Admin','Super Admin'))
    )
  );

DROP POLICY IF EXISTS "profile_photos_update" ON storage.objects;
CREATE POLICY "profile_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND (
      (name LIKE 'avatars/' || auth_user_id() || '.%')
      OR (name LIKE 'offerings/%'
          AND split_part(name, '/', 2) = auth_user_id())
      OR (auth_user_role() IN ('Admin','Super Admin'))
    )
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
  );

-- (e) get_komsel_members: RPC untuk PKS lihat anggota TANPA NIK.
CREATE OR REPLACE FUNCTION get_komsel_members(p_komsel_id TEXT)
  RETURNS TABLE (
    user_id TEXT, name TEXT, phone TEXT, email TEXT, gender TEXT,
    birth_date DATE, birth_place TEXT, address TEXT, blood_type TEXT,
    marital_status TEXT, photo_url TEXT, points INT, status TEXT,
    role TEXT, is_pks BOOLEAN
  )
  LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  -- Otorisasi: pemanggil harus Admin/Super Admin ATAU PKS komsel tsb.
  IF NOT (
    auth_user_role() IN ('Admin','Super Admin')
    OR auth_leads_komsel(p_komsel_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  RETURN QUERY
    SELECT u.user_id, u.name, u.phone, u.email, u.gender, u.birth_date,
           u.birth_place, u.address, u.blood_type, u.marital_status,
           u.photo_url, COALESCE(u.points, 0), u.status, u.role, COALESCE(u.is_pks, false)
    FROM users u
    WHERE u.komsel_id = p_komsel_id;
END $$;
REVOKE EXECUTE ON FUNCTION get_komsel_members(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_komsel_members(TEXT) TO authenticated;

-- (f) documents bucket: pastikan privat + policy admin-read + owner-read.
--     Klien baru upload dengan path baptism/{user_id}/... dan panggil
--     signed URL untuk membacanya. Sisa policy diberikan agar Admin bisa
--     download semua (untuk verifikasi pendaftaran).
UPDATE storage.buckets SET public = false WHERE id = 'documents';

DROP POLICY IF EXISTS "documents_owner_insert" ON storage.objects;
CREATE POLICY "documents_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (
      -- Owner insert: path harus berformat <folder>/<user_id>/...
      -- (mis. baptism/USR-xxx/12345_ktp.jpg)
      split_part(name, '/', 2) = auth_user_id()
      OR auth_user_role() IN ('Admin','Super Admin')
    )
  );

DROP POLICY IF EXISTS "documents_owner_read" ON storage.objects;
CREATE POLICY "documents_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (
      split_part(name, '/', 2) = auth_user_id()
      OR auth_user_role() IN ('Admin','Super Admin')
    )
  );

DROP POLICY IF EXISTS "documents_admin_delete" ON storage.objects;
CREATE POLICY "documents_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'documents' AND auth_user_role() IN ('Admin','Super Admin')
  );

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v39: Tutup privilege escalation pada users INSERT ─────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (pentest 2026-07-06):
-- Policy "users_insert_own" hanya memeriksa auth.uid() = auth_id — TIDAK
-- membatasi kolom role/status/is_pks/komsel_id/points saat INSERT. Trigger
-- guard_user_privilege_cols hanya menjaga UPDATE, tidak INSERT. Artinya
-- siapa pun yang berhasil auth.signUp bisa langsung memanggil:
--   supabase.from('users').insert({
--     auth_id: <own_uid>, name: 'X',
--     role: 'Super Admin', status: 'Aktif', is_pks: true, points: 999999
--   })
-- Halaman Register aplikasi memang mengeset role='Jemaat' — tapi
-- attacker tidak perlu memakai halaman itu, cukup panggil supabase-js
-- langsung dari console. Ini eskalasi privilege lengkap → akses penuh
-- panel admin, hapus jemaat, ubah keuangan, dst.
--
-- PERBAIKAN: perketat WITH CHECK — self-insert HANYA boleh dengan default
-- aman (role='Jemaat', status='Menunggu Persetujuan', semua flag privilege
-- kosong/nol). Admin path tetap lewat "users_admin_insert" (auth_id NULL).
DROP POLICY IF EXISTS "users_insert_own" ON users;
CREATE POLICY "users_insert_own" ON users FOR INSERT WITH CHECK (
  auth.uid() = auth_id
  AND role = 'Jemaat'
  AND role_secondary IS NULL
  AND status = 'Menunggu Persetujuan'
  AND COALESCE(is_pks, false) = false
  AND komsel_id IS NULL
  AND COALESCE(points, 0) = 0
  AND COALESCE(biodata_points_awarded, false) = false
  AND membership_card_url IS NULL
  AND membership_card_issued_at IS NULL
  AND sp_level = 'Aman'
  AND sp_notes IS NULL
);

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v40: Tutup status-bypass di pendaftaran & persembahan ─────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (pentest 2026-07-06, lanjutan v39):
-- Beberapa policy INSERT (dan FOR ALL) tidak membatasi kolom `status` →
-- jemaat bisa membuat rekaman "Disetujui" langsung dari klien, mem-bypass
-- alur review admin. Selain itu policy FOR ALL (baptism_own & wedding_own)
-- juga mengizinkan UPDATE ke status apa pun — jemaat bisa mengubah baris
-- Menunggu → Disetujui setelah pengiriman.
--
-- Dampak: sertifikat baptisan/nikah/penyerahan anak/KTJ tercetak seolah
-- disetujui, dan rekaman persembahan tampil "Terverifikasi" tanpa admin
-- pernah menyentuhnya (dampak reputasi + integritas laporan keuangan).
--
-- Perbaikan: pisah INSERT (jemaat, status='Menunggu' + kolom admin NULL)
-- dari UPDATE (Admin/Super Admin saja). Pola sama dgn task_leaves v22.

-- ── (a) offerings: klien HANYA boleh insert status='Menunggu' ──
DROP POLICY IF EXISTS "ofr_insert_own" ON offerings;
CREATE POLICY "ofr_insert_own" ON offerings FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND verified_at IS NULL
  AND verified_by IS NULL
);

-- ── (b) baptism_registrations: pisah own → self-insert + admin-write ──
DROP POLICY IF EXISTS "baptism_own" ON baptism_registrations;
DROP POLICY IF EXISTS "baptism_self_select" ON baptism_registrations;
CREATE POLICY "baptism_self_select" ON baptism_registrations FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin','Super Admin')
);
DROP POLICY IF EXISTS "baptism_self_insert" ON baptism_registrations;
CREATE POLICY "baptism_self_insert" ON baptism_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND scheduled_at IS NULL
  AND admin_note IS NULL
);
DROP POLICY IF EXISTS "baptism_admin_update" ON baptism_registrations;
CREATE POLICY "baptism_admin_update" ON baptism_registrations FOR UPDATE
  USING (auth_user_role() IN ('Admin','Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));
-- Jemaat boleh batal (DELETE) pengajuan yang MASIH Menunggu.
DROP POLICY IF EXISTS "baptism_self_delete_pending" ON baptism_registrations;
CREATE POLICY "baptism_self_delete_pending" ON baptism_registrations FOR DELETE USING (
  user_id = auth_user_id() AND status = 'Menunggu'
);
DROP POLICY IF EXISTS "baptism_admin_delete" ON baptism_registrations;
CREATE POLICY "baptism_admin_delete" ON baptism_registrations FOR DELETE USING (
  auth_user_role() IN ('Admin','Super Admin')
);

-- ── (c) wedding_registrations: pola sama dgn baptism ──
DROP POLICY IF EXISTS "wedding_own" ON wedding_registrations;
DROP POLICY IF EXISTS "wedding_self_select" ON wedding_registrations;
CREATE POLICY "wedding_self_select" ON wedding_registrations FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin','Super Admin')
);
DROP POLICY IF EXISTS "wedding_self_insert" ON wedding_registrations;
CREATE POLICY "wedding_self_insert" ON wedding_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND scheduled_at IS NULL
  AND admin_note IS NULL
);
DROP POLICY IF EXISTS "wedding_admin_update" ON wedding_registrations;
CREATE POLICY "wedding_admin_update" ON wedding_registrations FOR UPDATE
  USING (auth_user_role() IN ('Admin','Super Admin'))
  WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));
DROP POLICY IF EXISTS "wedding_self_delete_pending" ON wedding_registrations;
CREATE POLICY "wedding_self_delete_pending" ON wedding_registrations FOR DELETE USING (
  user_id = auth_user_id() AND status = 'Menunggu'
);
DROP POLICY IF EXISTS "wedding_admin_delete" ON wedding_registrations;
CREATE POLICY "wedding_admin_delete" ON wedding_registrations FOR DELETE USING (
  auth_user_role() IN ('Admin','Super Admin')
);

-- ── (d) child_dedication_registrations: kunci INSERT ke Menunggu ──
DROP POLICY IF EXISTS "dedication_insert" ON child_dedication_registrations;
CREATE POLICY "dedication_insert" ON child_dedication_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND scheduled_at IS NULL
  AND admin_note IS NULL
);

-- ── (e) ktj_registrations: kunci INSERT ke Menunggu ──
DROP POLICY IF EXISTS "ktj_insert" ON ktj_registrations;
CREATE POLICY "ktj_insert" ON ktj_registrations FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND scheduled_at IS NULL
  AND admin_note IS NULL
);

-- ── (f) registration_prerequisites: kunci INSERT ke Menunggu ──
DROP POLICY IF EXISTS "preq_insert" ON registration_prerequisites;
CREATE POLICY "preq_insert" ON registration_prerequisites FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND status = 'Menunggu'
  AND admin_note IS NULL
  AND reviewed_at IS NULL
);

-- ── (g) birthday_messages: batasi update recipient hanya ke read_at ──
-- Sebelumnya recipient bisa UPDATE seluruh baris (mengubah message,
-- sender_id, komsel_id) selama recipient_id tidak berubah. Ini bukan
-- privilege escalation, tapi integritas data terganggu (recipient bisa
-- me-rewrite pesan yang katanya "dari PKS").
DROP POLICY IF EXISTS "bday_recipient_mark_read" ON birthday_messages;
CREATE POLICY "bday_recipient_mark_read" ON birthday_messages FOR UPDATE
  USING (recipient_id = auth_user_id())
  WITH CHECK (recipient_id = auth_user_id());
-- Guard tingkat kolom: recipient hanya boleh mengubah read_at.
CREATE OR REPLACE FUNCTION guard_bday_recipient_cols() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth_user_role() NOT IN ('Admin','Super Admin') THEN
    IF NEW.message      IS DISTINCT FROM OLD.message
       OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
       OR NEW.komsel_id IS DISTINCT FROM OLD.komsel_id
       OR NEW.recipient_id IS DISTINCT FROM OLD.recipient_id
       OR NEW.created_at   IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Recipient hanya boleh menandai pesan sebagai dibaca.';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_bday_recipient ON birthday_messages;
CREATE TRIGGER trg_guard_bday_recipient
  BEFORE UPDATE ON birthday_messages FOR EACH ROW EXECUTE FUNCTION guard_bday_recipient_cols();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v41: Helper Hak Akses (dipakai Bagian A & Bagian B) ───────
-- ══════════════════════════════════════════════════════════════════════
-- auth_admin_can('/admin/<page>') — apakah pemanggil boleh MENULIS pada area
-- halaman admin tsb:
--   • Super Admin            → selalu true.
--   • Admin, tanpa baris hak-akses → true (default "akses penuh", konsisten UI).
--   • Admin, dgn allowed_pages→ true HANYA bila page ada di daftar.
--   • Selain admin (Jemaat/Volunteer/PKS) → false.
--   • caller_role NULL (SQL Editor / service role) → false juga; pemakai harus
--     memakai pola `auth_user_role() IS NULL OR auth_admin_can(...)` bila ingin
--     melewati konteks backend tepercaya (lihat guard is_pks di Bagian A).
-- Semantik ini meniru AdminPermissionsPage (null=penuh, []=kosong).
-- DIDEFINISIKAN DI SINI (sebelum guard) karena guard_user_privilege_cols
-- memanggilnya — check_function_bodies memvalidasi referensi saat CREATE.
CREATE OR REPLACE FUNCTION auth_admin_can(p_page text) RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN auth_user_role() = 'Super Admin' THEN true
    WHEN auth_user_role() = 'Admin' THEN COALESCE(
      (SELECT p_page = ANY(allowed_pages)
         FROM admin_user_permissions
        WHERE user_id = auth_user_id()),
      true  -- tidak ada baris hak-akses = akses penuh (default sekarang)
    )
    ELSE false
  END
$$;
REVOKE EXECUTE ON FUNCTION auth_admin_can(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION auth_admin_can(text) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v41 (Bagian A): Batas peran Admin vs Super Admin ──────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (pentest 2026-07-07):
-- guard_user_privilege_cols melewati SEMUA cek bila pemanggil Admin ATAU
-- Super Admin. Dikombinasikan policy users_admin_update (Admin boleh UPDATE
-- baris user mana pun), seorang Admin biasa bisa menyetel role='Super Admin'
-- pada dirinya/orang lain → eskalasi Admin → Super Admin, meruntuhkan
-- seluruh distinction dua jenjang admin.
--
-- KEPUTUSAN OPERATOR: Admin biasa TIDAK boleh mengubah peran.
-- Perbaikan (guard tingkat kolom, jenjang):
--   • role, role_secondary          → HANYA Super Admin.
--   • is_pks                        → HAK KHUSUS: Super Admin ATAU Admin yang
--                                     diberi akses halaman Komsel (auth_admin_can
--                                     '/admin/komsel'). Menetapkan PKS = wewenang
--                                     pengelola Komsel, bukan admin sembarangan.
--                                     (Keputusan operator 2026-07-07.)
--   • status, komsel_id             → Admin & Super Admin (seperti sebelumnya).
--   • sp_level, sp_notes            → Admin & Super Admin saja. Menutup celah
--                                     BARU: sebelumnya kolom SP tak dijaga guard,
--                                     sehingga jemaat bisa meng-UPDATE baris
--                                     sendiri (users_edit_own) untuk menghapus
--                                     Surat Peringatannya sendiri.
--   • points/biodata_points, nij,   → tetap seperti sebelumnya (non-admin ditolak,
--     kartu jemaat                     Admin boleh; poin lewat escape hatch definer).
--
-- Catatan UI: selektor "Ubah Role" di halaman Jemaat sebaiknya disembunyikan
-- untuk Admin biasa agar tidak memicu error DB ini (kosmetik; keamanan sudah
-- ditegakkan di sini apa pun yang dilakukan klien).
CREATE OR REPLACE FUNCTION guard_user_privilege_cols() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text := auth_user_role();
BEGIN
  -- (1) Kolom PERAN (vektor eskalasi): HANYA Super Admin.
  --     caller_role NULL = konteks backend tepercaya (SQL Editor / service
  --     role, auth.uid() kosong) → DILEWATI, seperti guard lama (NOT IN
  --     melewati NULL). Ini penting agar promosi Super Admin via SQL Editor &
  --     operasi service-role tetap bisa. Attacker yang login SELALU punya
  --     role non-NULL, jadi tetap terblokir.
  IF caller_role IS NOT NULL AND caller_role <> 'Super Admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.role_secondary IS DISTINCT FROM OLD.role_secondary THEN
      RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah role/role_secondary.';
    END IF;
  END IF;

  -- (1b) is_pks (penetapan PKS) = HAK KHUSUS akses Komsel. Ditolak untuk siapa
  --      pun yang login tapi BUKAN Super Admin dan BUKAN Admin ber-akses Komsel.
  --      caller_role NULL (SQL Editor / service role) dilewati (backend tepercaya).
  IF COALESCE(NEW.is_pks, false) IS DISTINCT FROM COALESCE(OLD.is_pks, false)
     AND caller_role IS NOT NULL
     AND NOT auth_admin_can('/admin/komsel') THEN
    RAISE EXCEPTION 'Menetapkan/mengubah PKS adalah hak khusus admin dengan akses Komsel.';
  END IF;

  -- (2) Kolom hak akses & privilege lain: Admin/Super Admin boleh; selain itu ditolak.
  --     (is_pks TIDAK lagi di sini — sudah ditangani gerbang hak-khusus (1b).)
  IF caller_role NOT IN ('Admin', 'Super Admin') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.komsel_id IS DISTINCT FROM OLD.komsel_id
       OR NEW.sp_level IS DISTINCT FROM OLD.sp_level
       OR NEW.sp_notes IS DISTINCT FROM OLD.sp_notes THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah kolom hak akses/status/SP sendiri.';
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

DROP TRIGGER IF EXISTS trg_guard_user_privilege ON users;
CREATE TRIGGER trg_guard_user_privilege
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_user_privilege_cols();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v41 (Bagian B): "Hak Akses" jadi keamanan NYATA ───────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (pentest 2026-07-07):
-- admin_user_permissions.allowed_pages hanya menyembunyikan menu di UI.
-- Tidak ada satu pun policy RLS / serverless yang mengonsultasikannya —
-- semua gerbang tulis admin memakai auth_user_role() IN ('Admin','Super
-- Admin'). Akibatnya Admin yang "dibatasi" tetap bisa melakukan operasi
-- apa pun (hapus jemaat, verifikasi persembahan, dll.) lewat PostgREST/
-- endpoint langsung. Hak Akses = kosmetik.
--
-- KEPUTUSAN OPERATOR: Hak Akses harus jadi batas keamanan nyata,
-- lingkup "TULIS SAJA" (INSERT/UPDATE/DELETE/verifikasi). READ dibiarkan
-- untuk semua admin (perubahan lebih sedikit, risiko regresi minimal).
-- Fondasinya = helper auth_admin_can() yang sudah didefinisikan di ATAS
-- (sebelum guard_user_privilege_cols).
--
-- SLICE PERTAMA yang sudah aman diterapkan sekarang: penetapan PKS.
-- (komsel_leaders BUKAN tabel yang drift, jadi bisa digerbang tanpa menunggu
-- inventaris.) Melengkapi gerbang is_pks di guard (Bagian A, blok 1b):
--   • komsel_leaders (tambah/hapus pemimpin) → hak khusus '/admin/komsel'.
DROP POLICY IF EXISTS "kl_admin_write" ON komsel_leaders;
CREATE POLICY "kl_admin_write" ON komsel_leaders FOR ALL
  USING (auth_admin_can('/admin/komsel'))
  WITH CHECK (auth_admin_can('/admin/komsel'));

-- SISA sweep TULIS admin (offerings, baptism, ministries, dll.) DITAHAN sampai
-- inventaris policy production diverifikasi, kare-- 10. Tambah field require_approval di classes (v52)
ALTER TABLE classes ADD COLUMN IF NOT EXISTS require_approval BOOLEAN DEFAULT false;
sql terbukti drift
-- (news & events menulis via klien tetapi tak punya policy tulis di file —
-- ada policy di DB yang tak tercatat; menimpanya buta bisa membuka celah /
-- mengunci admin). Query dump policy sudah diberikan ke operator.

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v42: Tegakkan "1x per hari" di DATABASE ───────────────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (audit form 2026-07-07):
-- Batas once_per_day form HANYA ditegakkan di klien (TaskDetailPage +
-- tasksService.submitResponse yang query-lalu-insert). Lewat panggilan
-- PostgREST langsung, jemaat bisa insert banyak response dalam sehari untuk
-- form yang seharusnya 1x/hari. RLS `responses_own` cuma cek volunteer_id
-- = diri sendiri, tidak cek batas harian.
--
-- Perbaikan: trigger BEFORE INSERT yang menolak response kedua pada HARI yang
-- sama (zona WIB, konsisten dgn klien & notify-pks) bila template.once_per_day.
-- SECURITY DEFINER agar bisa membaca flag template & response lama tanpa
-- terganjal RLS. Catatan: dua insert yang benar-benar bersamaan (race) masih
-- bisa lolos tanpa unique constraint — cukup untuk skala jemaat & menutup
-- bypass API yang disengaja; UNIQUE index harian bisa ditambah bila perlu.
CREATE OR REPLACE FUNCTION guard_once_per_day() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_once boolean;
  v_day_start timestamptz;
BEGIN
  SELECT once_per_day INTO v_once FROM form_templates WHERE form_id = NEW.form_id;
  IF COALESCE(v_once, false) THEN
    -- Awal "hari ini" dalam zona WIB (UTC+7).
    v_day_start := date_trunc('day', (now() AT TIME ZONE 'Asia/Jakarta')) AT TIME ZONE 'Asia/Jakarta';
    IF EXISTS (
      SELECT 1 FROM form_responses
      WHERE form_id = NEW.form_id
        AND volunteer_id = NEW.volunteer_id
        AND submitted_at >= v_day_start
    ) THEN
      RAISE EXCEPTION 'Tugas ini hanya dapat diisi 1x per hari.';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_once_per_day ON form_responses;
CREATE TRIGGER trg_guard_once_per_day
  BEFORE INSERT ON form_responses FOR EACH ROW EXECUTE FUNCTION guard_once_per_day();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v43: Role "Gembala" + Pesan Gembala (broadcast in-app) ─────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-07): tambah peran ke-6 "Gembala" — mirip Admin
-- tetapi FOKUS: hanya boleh (a) mengirim pesan/pengumuman broadcast ke semua
-- jemaat yang punya aplikasi, dan (b) MELIHAT (read-only) data jemaat & laporan.
-- Gembala TIDAK diberi hak tulis operasional lain (edit jemaat, verifikasi
-- persembahan, dll.) dan TIDAK boleh melihat NIK (sama seperti Admin — NIK
-- tetap khusus Super Admin).
--
-- Bagaimana pembatasan tulis ditegakkan: policy tulis existing memakai
-- `auth_user_role() IN ('Admin','Super Admin')`. Karena 'Gembala' TIDAK
-- dimasukkan ke policy-policy itu, secara DB Gembala otomatis read-only pada
-- seluruh tabel tersebut — kita TIDAK perlu menyentuh satu pun policy tulis
-- lama (aman dari drift). Yang ditambah di bawah HANYA: (1) izin BACA tambahan
-- yang Gembala butuhkan, dan (2) tabel pesan baru beserta policy-nya sendiri.

-- 1. Perluas daftar nilai role yang sah (idempotent: DROP dulu, lalu ADD).
--    Nama constraint = auto-generated Postgres untuk CHECK kolom inline:
--    <tabel>_<kolom>_check. Bila di production namanya berbeda (drift),
--    sesuaikan nama pada DROP di bawah sebelum menjalankan.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('Jemaat','Volunteer','PKS','Admin','Super Admin','Gembala'));
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_secondary_check;
ALTER TABLE users ADD CONSTRAINT users_role_secondary_check
  CHECK (role_secondary IS NULL OR role_secondary IN ('Jemaat','Volunteer','PKS','Admin','Super Admin','Gembala'));

-- 2. Izin BACA tambahan untuk Gembala — DITULIS SEBAGAI POLICY TERPISAH
--    (additive/permissive, di-OR dengan policy existing) supaya TIDAK menimpa
--    policy lama yang terbukti bisa drift. Hanya SELECT, tidak ada WITH CHECK.
--    • users          → lihat direktori & data jemaat (kolom nik tetap
--                        disembunyikan di UI utk non-Super-Admin, sama spt Admin).
--    • form_responses → halaman Evaluasi & Laporan (pemenuhan SOP/tugas).
--    Sengaja TIDAK memberi baca `offerings` (data keuangan) — least-privilege:
--    Persembahan tidak disodorkan di menu Gembala. Bila kelak Gembala perlu
--    laporan keuangan, itu penambahan eksplisit (keputusan operator terpisah).
DROP POLICY IF EXISTS "users_read_gembala" ON users;
CREATE POLICY "users_read_gembala" ON users FOR SELECT
  USING (auth_user_role() = 'Gembala');

DROP POLICY IF EXISTS "responses_gembala_read" ON form_responses;
CREATE POLICY "responses_gembala_read" ON form_responses FOR SELECT
  USING (auth_user_role() = 'Gembala');

-- 3. Tabel pesan Gembala (broadcast ke SEMUA jemaat — satu baris per pesan,
--    bukan per penerima). Ditampilkan di dalam app (Beranda + halaman Pesan)
--    dan opsional dikirim juga sebagai push notification oleh klien.
CREATE TABLE IF NOT EXISTS pastoral_messages (
  message_id   TEXT PRIMARY KEY DEFAULT 'MSG-' || replace(gen_random_uuid()::text, '-', ''),
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  sender_id    TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  sender_name  TEXT,                         -- denormalisasi: tetap tampil walau pengirim dihapus
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE pastoral_messages ENABLE ROW LEVEL SECURITY;

-- Baca: semua user yang LOGIN (broadcast ke seluruh jemaat).
DROP POLICY IF EXISTS "pm_select" ON pastoral_messages;
CREATE POLICY "pm_select" ON pastoral_messages FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Tulis (buat/hapus pengumuman): HANYA Gembala atau Super Admin.
DROP POLICY IF EXISTS "pm_write" ON pastoral_messages;
CREATE POLICY "pm_write" ON pastoral_messages FOR ALL
  USING (auth_user_role() IN ('Gembala','Super Admin'))
  WITH CHECK (auth_user_role() IN ('Gembala','Super Admin'));

CREATE INDEX IF NOT EXISTS idx_pastoral_messages_created ON pastoral_messages (created_at DESC);

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v44: Lampiran PDF pada Informasi (news.pdf_files) ──────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-07): Informasi/berita boleh melampirkan berkas
-- PDF (mis. warta jemaat, undangan, jadwal) yang bisa dibuka langsung jemaat.
--
-- Bentuk data: array JSONB berisi objek {name, url} — beda dari photo_urls/
-- video_urls (TEXT[]) karena PDF butuh NAMA tampilan yang ramah, bukan hanya
-- URL storage. File fisik disimpan di bucket publik `task-files` (sama seperti
-- video berita), sehingga URL publik bisa dibuka tanpa signed-URL.
--
-- RLS: TIDAK ada perubahan policy. `pdf_files` hanya kolom baru pada `news`;
-- gerbang tulis berita yang sudah ada (Admin/Super Admin) berlaku apa adanya.
ALTER TABLE news ADD COLUMN IF NOT EXISTS pdf_files JSONB DEFAULT '[]'::jsonb;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v45: PKS boleh mengeluarkan anggota dari komselnya ─────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-07): PKS boleh MENGELUARKAN anggota dari komsel
-- yang ia pimpin (mis. anggota pindah/tidak aktif). Keanggotaan komsel = kolom
-- `users.komsel_id`; "keluar" berarti men-set komsel_id = NULL. Menambah anggota
-- tetap wewenang Admin (halaman Kelola Komsel) — PKS hanya boleh mengeluarkan.
--
-- MASALAH: trigger `guard_user_privilege_cols` menolak perubahan `komsel_id`
-- oleh siapa pun yang login tetapi BUKAN Admin/Super Admin. Karena SECURITY
-- DEFINER tidak mengubah auth.uid(), di dalam RPC pun `auth_user_role()` tetap
-- mengembalikan role PKS → update akan tertolak. Solusi: escape-hatch bersegel
-- transaksi `app.allow_komsel_reassign` (pola SAMA dengan `app.allow_points_update`
-- untuk poin) yang HANYA di-set di dalam RPC tepercaya `pks_remove_member`.
--
-- CATATAN DRIFT: blok ini men-`CREATE OR REPLACE` guard_user_privilege_cols.
-- Isi di bawah = SALINAN PERSIS versi v41 (Migrasi v41 Bagian A, baris ~2189)
-- dengan SATU tambahan: cabang bypass untuk komsel_id. Semua cek lain (role,
-- is_pks, status, sp, points, kartu jemaat) DIPERTAHANKAN tanpa perubahan.
-- Bila production sudah drift dari versi itu, verifikasi dulu dengan:
--   SELECT pg_get_functiondef('guard_user_privilege_cols'::regproc);
-- lalu samakan sebelum menjalankan agar tidak ada cek production yang hilang.

CREATE OR REPLACE FUNCTION guard_user_privilege_cols() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller_role text := auth_user_role();
BEGIN
  -- (1) Kolom PERAN (vektor eskalasi): HANYA Super Admin.
  --     caller_role NULL = konteks backend tepercaya (SQL Editor / service
  --     role, auth.uid() kosong) → DILEWATI. Attacker yang login SELALU punya
  --     role non-NULL, jadi tetap terblokir.
  IF caller_role IS NOT NULL AND caller_role <> 'Super Admin' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.role_secondary IS DISTINCT FROM OLD.role_secondary THEN
      RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah role/role_secondary.';
    END IF;
  END IF;

  -- (1b) is_pks (penetapan PKS) = HAK KHUSUS akses Komsel.
  IF COALESCE(NEW.is_pks, false) IS DISTINCT FROM COALESCE(OLD.is_pks, false)
     AND caller_role IS NOT NULL
     AND NOT auth_admin_can('/admin/komsel') THEN
    RAISE EXCEPTION 'Menetapkan/mengubah PKS adalah hak khusus admin dengan akses Komsel.';
  END IF;

  -- (2) Kolom hak akses & privilege lain: Admin/Super Admin boleh; selain itu ditolak.
  IF caller_role NOT IN ('Admin', 'Super Admin') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.sp_level IS DISTINCT FROM OLD.sp_level
       OR NEW.sp_notes IS DISTINCT FROM OLD.sp_notes THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah kolom hak akses/status/SP sendiri.';
    END IF;
    -- komsel_id: Admin/Super Admin bebas; selain itu HANYA lewat RPC tepercaya
    -- `pks_remove_member` yang men-set escape-hatch di bawah (PKS keluarkan
    -- anggota komselnya). Tanpa segel itu, perubahan komsel_id tetap ditolak.
    IF NEW.komsel_id IS DISTINCT FROM OLD.komsel_id
       AND COALESCE(current_setting('app.allow_komsel_reassign', true), '') <> '1' THEN
      RAISE EXCEPTION 'Tidak diizinkan mengubah keanggotaan komsel sendiri.';
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

DROP TRIGGER IF EXISTS trg_guard_user_privilege ON users;
CREATE TRIGGER trg_guard_user_privilege
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_user_privilege_cols();

-- RPC: keluarkan seorang anggota dari komsel. Otorisasi di server: pemanggil
-- harus PKS komsel tsb (auth_leads_komsel) ATAU Admin/Super Admin. Anggota
-- WAJIB memang berada di komsel itu (cegah menebak user_id komsel lain).
CREATE OR REPLACE FUNCTION pks_remove_member(p_komsel_id TEXT, p_user_id TEXT)
  RETURNS void
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current TEXT;
BEGIN
  IF NOT (
    auth_user_role() IN ('Admin','Super Admin')
    OR auth_leads_komsel(p_komsel_id)
  ) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT komsel_id INTO v_current FROM users WHERE user_id = p_user_id;
  IF v_current IS NULL OR v_current IS DISTINCT FROM p_komsel_id THEN
    RAISE EXCEPTION 'member_not_in_komsel';
  END IF;

  -- Buka segel guard komsel_id HANYA untuk update tepercaya ini (scope: transaksi).
  PERFORM set_config('app.allow_komsel_reassign', '1', true);
  UPDATE users SET komsel_id = NULL WHERE user_id = p_user_id;
  PERFORM set_config('app.allow_komsel_reassign', '', true);
END $$;
REVOKE EXECUTE ON FUNCTION pks_remove_member(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pks_remove_member(TEXT, TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v46: Izinkan unggah PDF berita ke bucket task-files ────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (2026-07-07): Fitur lampiran PDF Informasi (Migrasi v44) mengunggah
-- ke path `news/pdf/<...>` di bucket `task-files`, TAPI policy `task_files_insert`
-- (di-hardening Migrasi v38) hanya mengizinkan Admin menulis path *video*
-- (`news/video/%`, dst.) + `form-bg/%`. Path `news/pdf/%` tidak ada di allowlist
-- → INSERT ditolak: "new row violates row-level security policy".
--
-- KEPUTUSAN OPERATOR (2026-07-07): izinkan Admin/Super Admin mengunggah PDF
-- kurasi berita ke `news/pdf/%` (setara dengan izin video yang sudah ada).
--
-- CATATAN DRIFT: blok ini men-`CREATE OR REPLACE` policy storage `task_files_insert`.
-- Isi di bawah = SALINAN PERSIS versi Migrasi v38 (baris ~1820) DITAMBAH dua pola
-- `news/pdf/%` & `news/%/pdf/%` pada cabang admin. Cabang jawaban-tugas/izin
-- (responses/leaves milik sendiri) DIPERTAHANKAN tanpa perubahan. Bila production
-- sudah drift dari v38, verifikasi dulu:
--   SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--   WHERE polname = 'task_files_insert';
-- lalu samakan sebelum menjalankan agar tidak ada izin lama yang hilang.
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      -- Jawaban tugas & bukti izin: path[1] wajib user_id sendiri.
      ((name LIKE 'responses/%' OR name LIKE 'leaves/%')
        AND split_part(name, '/', 2) = auth_user_id())
      -- Background form + media kurasi (video & PDF): Admin/Super Admin saja.
      OR ((name LIKE 'form-bg/%'
           OR name LIKE 'classes/video/%' OR name LIKE 'classes/%/video/%'
           OR name LIKE 'events/video/%'  OR name LIKE 'events/%/video/%'
           OR name LIKE 'news/video/%'    OR name LIKE 'news/%/video/%'
           OR name LIKE 'news/pdf/%'      OR name LIKE 'news/%/pdf/%')
        AND auth_user_role() IN ('Admin','Super Admin'))
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v47: Realtime tabel users (panel Admin auto-refresh) ───────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-08): panel Admin (Kelola Jemaat) harus menampilkan
-- pendaftar baru secara REALTIME tanpa refresh manual. Supabase Realtime hanya
-- menyiarkan perubahan tabel yang masuk publikasi `supabase_realtime`. Tambahkan
-- `users` ke publikasi bila belum ada (idempotent lewat cek pg_publication_tables).
--
-- RLS tetap ditegakkan pada aliran realtime: subscriber hanya menerima baris yang
-- boleh ia SELECT. Yang berlangganan hanya halaman Admin (rute admin), dan
-- Admin/Super Admin/Gembala memang boleh membaca `users`. Tidak ada data bocor
-- ke jemaat biasa karena mereka tidak membuka panel ini.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'users'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v48: PAS Foto pada pengajuan KTJ (ktj_registrations.photo_url) ─
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-08): pengajuan Kartu Tanda Jemaat (KTJ) perlu
-- lampiran PAS FOTO untuk pencetakan kartu. Simpan URL (signed) foto di kolom
-- baru `photo_url`. Berkas fisik diunggah ke bucket privat `documents` pada path
-- `ktj/<user_id>/...` (pola sama dgn dokumen registrasi lain): owner boleh
-- menulis, Admin/Super Admin boleh membaca (policy documents v38 sudah ada) —
-- TIDAK ada perubahan policy storage.
ALTER TABLE ktj_registrations ADD COLUMN IF NOT EXISTS photo_url TEXT;


-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v49: Admin boleh HAPUS respon SOP Rohani (form_responses) ──
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-08): halaman baru "Respon SOP" (/admin/respon)
-- memusatkan semua jawaban form/SOP Rohani yang masuk, dengan aksi Detail &
-- Hapus. Sebelumnya admin hanya punya policy SELECT (`responses_admin_read`);
-- DELETE untuk admin belum ada, sehingga tombol Hapus akan gagal RLS.
--
-- TEMUAN: hapus respon = aksi TULIS yang destruktif → wajib digerbang Hak Akses.
-- Gunakan `auth_admin_can('/admin/respon')` (Super Admin selalu lolos; Admin
-- biasa lolos bila halaman '/admin/respon' ada di allowed_pages-nya / NULL).
-- Menghapus form_responses TIDAK menyentuh poin (poin hanya dari kehadiran,
-- bukan dari pengisian form) — aman, tidak ada saldo yang perlu dikoreksi.
DROP POLICY IF EXISTS "responses_admin_delete" ON form_responses;
CREATE POLICY "responses_admin_delete" ON form_responses FOR DELETE
  USING (auth_admin_can('/admin/respon'));

-- ── Migrasi v50: Buka akses upload KTJ untuk Admin biasa ──────────────────
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
       OR NEW.nij IS DISTINCT FROM OLD.nij THEN
      RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah biodata jemaat lain.';
    END IF;
  END IF;
  RETURN NEW;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v51: Poin komsel HANYA untuk self-scan, bukan absensi manual ──
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (2026-07-10): jemaat yang diabsen MANUAL oleh PKS/Admin lewat panel
-- PKS (komselService.upsertSessionAttendance) mendapat +1 poin, padahal
-- kehadiran manual seharusnya TIDAK memberi poin — hanya scan QR mandiri.
-- Penyebab: award_attendance_point() dulu membedakan scan vs manual HANYA dari
-- `session_id IS NULL`. Ternyata absensi manual PKS juga menulis baris ber-
-- session_id (record memuat session_id sesi aktif), jadi lolos guard.
-- Terverifikasi: user 'Hety' & 'Ifan' (auth_id NULL — mustahil login/scan)
-- mendapat poin dari sesi yang dibuat admin.
--
-- KEPUTUSAN OPERATOR: poin komsel hanya diberi bila baris kehadiran dibuat oleh
-- JEMAAT ITU SENDIRI (self check-in scan QR). Sinyal DB yang tak bisa dipalsukan
-- lewat PostgREST langsung: NEW.user_id = auth_user_id().
--   • self-scan (checkInSession, JWT jemaat)  → user_id = auth_user_id() → +1
--   • manual PKS (JWT PKS/Admin utk anggota)  → user_id ≠ auth_user_id() → 0
--   • service_role / SQL Editor (restore, dsb) → auth_user_id() NULL → 0 (benar)
--
-- Agar poin bisa dicabut SIMETRIS saat kehadiran dihapus/diubah oleh PKS (yang
-- BUKAN pemilik baris → auth match tak berlaku lagi), simpan penanda persisten
-- `points_awarded` di barisnya, di-set oleh trigger insert saat poin diberi.
ALTER TABLE komsel_attendance
  ADD COLUMN IF NOT EXISTS points_awarded BOOLEAN NOT NULL DEFAULT false;

-- Award saat INSERT: hanya self-scan komsel yang dapat poin; tandai barisnya.
CREATE OR REPLACE FUNCTION award_attendance_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'komsel_attendance' THEN
    -- Poin komsel HANYA untuk kehadiran hasil scan QR mandiri jemaat sendiri.
    -- Absensi manual PKS (user_id ≠ auth pemanggil) & baris tanpa sesi = 0 poin.
    IF NEW.session_id IS NULL
       OR NEW.status IS DISTINCT FROM 'Hadir'
       OR NEW.user_id IS DISTINCT FROM auth_user_id() THEN
      RETURN NEW;
    END IF;
    PERFORM apply_points(NEW.user_id, 1, 'Kehadiran komsel');
    UPDATE komsel_attendance SET points_awarded = true WHERE attendance_id = NEW.attendance_id;
    RETURN NEW;
  END IF;
  PERFORM apply_points(NEW.user_id, 1,
    CASE TG_TABLE_NAME
      WHEN 'class_attendance'  THEN 'Kehadiran kelas'
      WHEN 'event_attendance'  THEN 'Kehadiran event'
      WHEN 'sunday_attendance' THEN 'Kehadiran ibadah minggu'
      ELSE 'Kehadiran'
    END);
  RETURN NEW;
END $$;

-- Cabut poin bila baris kehadiran yang PERNAH memberi poin (points_awarded=true)
-- dihapus, atau statusnya diubah dari 'Hadir'. Mengandalkan penanda persisten,
-- jadi tetap benar walau yang menghapus adalah PKS (bukan pemilik baris).
CREATE OR REPLACE FUNCTION komsel_point_revoke() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.points_awarded THEN
      PERFORM apply_points(OLD.user_id, -1, 'Pembatalan kehadiran komsel');
    END IF;
    RETURN OLD;
  END IF;
  -- UPDATE: baris yang sudah dapat poin kehilangan status 'Hadir'
  IF OLD.points_awarded AND NEW.status IS DISTINCT FROM 'Hadir' THEN
    PERFORM apply_points(OLD.user_id, -1, 'Pembatalan kehadiran komsel');
    NEW.points_awarded := false;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_point_komsel_del ON komsel_attendance;
CREATE TRIGGER trg_point_komsel_del AFTER DELETE ON komsel_attendance
  FOR EACH ROW EXECUTE FUNCTION komsel_point_revoke();

DROP TRIGGER IF EXISTS trg_point_komsel_upd ON komsel_attendance;
CREATE TRIGGER trg_point_komsel_upd BEFORE UPDATE ON komsel_attendance
  FOR EACH ROW EXECUTE FUNCTION komsel_point_revoke();

-- Backfill penanda untuk baris LAMA: sampai kini SEMUA baris session-Hadir sudah
-- terlanjur diberi poin (bug lama), jadi tandai true agar penghapusan/perubahan
-- ke depan mengurangi poinnya dengan benar. Idempotent (true→true no-op).
-- PENTING: jalankan blok v51 ini SEKALI, SEBELUM skrip koreksi poin manual
-- (lihat catatan rilis) — jangan jalankan ulang setelah koreksi.
UPDATE komsel_attendance SET points_awarded = true
  WHERE session_id IS NOT NULL AND status = 'Hadir' AND points_awarded = false;


-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v52: Lindungi komsel_attendance.points_awarded dari tulis klien ──
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (security review v51, 2026-07-10): kolom points_awarded yang baru
-- ditambahkan TIDAK dilindungi dari tulisan langsung klien. Policy
-- "komsel_att_access_insert"/"_update" (Admin, atau PKS untuk komsel yang
-- dipimpinnya) tidak membatasi kolom apa pun via WITH CHECK — PKS/Admin bisa
-- INSERT baris kehadiran untuk anggota LAIN dengan points_awarded=true
-- disisipkan manual di body request (lolos RLS, lolos award_attendance_point
-- karena user_id != auth_user_id() sehingga fungsi itu return lebih awal
-- tanpa menyentuh points_awarded). Lalu men-DELETE baris itu memicu
-- trg_point_komsel_del → komsel_point_revoke() yang PERCAYA BEGITU SAJA
-- OLD.points_awarded = true → apply_points(-1) pada user yang tidak pernah
-- benar-benar dapat poin. Diulang-ulang → PKS/Admin bisa menguras poin
-- anggota mana pun secara sewenang-wenang. Pola sama seperti kasus
-- users.points (lihat guard_user_privilege_cols) yang seharusnya sudah
-- diterapkan juga di sini sejak awal.
--
-- KEPUTUSAN OPERATOR: points_awarded HANYA boleh diubah oleh kode DB
-- tepercaya (award_attendance_point/komsel_point_revoke), memakai escape
-- hatch bersegel transaksi (pola sama dgn app.allow_points_update).
-- Tulisan langsung dari klien (peran apa pun) dipaksa kembali ke nilai lama.
CREATE OR REPLACE FUNCTION guard_komsel_points_awarded() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(current_setting('app.allow_komsel_points_awarded', true), '') = '1' THEN
    RETURN NEW; -- dipanggil internal oleh award_attendance_point()/komsel_point_revoke()
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.points_awarded := false; -- baris baru dari klien tidak boleh mengaku sudah berpoin
  ELSE
    NEW.points_awarded := OLD.points_awarded; -- klien tidak boleh mengubah nilainya lewat UPDATE biasa
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_komsel_points_awarded ON komsel_attendance;
CREATE TRIGGER trg_guard_komsel_points_awarded
  BEFORE INSERT OR UPDATE ON komsel_attendance
  FOR EACH ROW EXECUTE FUNCTION guard_komsel_points_awarded();

-- award_attendance_point(): bungkus UPDATE internal yang menandai
-- points_awarded=true dengan escape hatch, supaya tidak ikut diblokir
-- oleh guard di atas (yang jalan lebih dulu secara alfabetis:
-- "trg_guard_..." < "trg_point_..." pada event UPDATE yang sama).
CREATE OR REPLACE FUNCTION award_attendance_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'komsel_attendance' THEN
    IF NEW.session_id IS NULL
       OR NEW.status IS DISTINCT FROM 'Hadir'
       OR NEW.user_id IS DISTINCT FROM auth_user_id() THEN
      RETURN NEW;
    END IF;
    PERFORM apply_points(NEW.user_id, 1, 'Kehadiran komsel');
    PERFORM set_config('app.allow_komsel_points_awarded', '1', true);
    UPDATE komsel_attendance SET points_awarded = true WHERE attendance_id = NEW.attendance_id;
    PERFORM set_config('app.allow_komsel_points_awarded', '', true);
    RETURN NEW;
  END IF;
  PERFORM apply_points(NEW.user_id, 1,
    CASE TG_TABLE_NAME
      WHEN 'class_attendance'  THEN 'Kehadiran kelas'
      WHEN 'event_attendance'  THEN 'Kehadiran event'
      WHEN 'sunday_attendance' THEN 'Kehadiran ibadah minggu'
      ELSE 'Kehadiran'
    END);
  RETURN NEW;
END $$;

-- komsel_point_revoke(): set NEW.points_awarded := false langsung di dalam
-- trigger BEFORE UPDATE yang sama (bukan statement UPDATE terpisah) — tidak
-- perlu escape hatch, guard di atas hanya jalan sekali di awal event ini.

-- Backfill ulang: baris yang sempat dipalsukan points_awarded=true via celah
-- v51 (kalau ada) tidak bisa dibedakan otomatis dari yang sah. Tidak ada
-- UPDATE otomatis di sini — lihat catatan rilis untuk verifikasi manual bila
-- diperlukan (window kerentanan v51→v52 diasumsikan belum sempat dieksploitasi
-- karena migrasi belum dijalankan production saat temuan ini ditulis).

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v53: Kolom tamu tanpa akun pada absensi komsel ────────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): PKS perlu mencatat anggota komsel yang
-- TIDAK punya HP (otomatis tidak punya akun/baris users) saat absensi.
-- Pilihan operator = "sekali-pakai per sesi" (bukan roster tersimpan lintas
-- minggu, bukan baris users): PKS mengetik nama tamu hadir pada sesi minggu
-- itu, disimpan menempel di sesinya. Tidak ada poin (tidak ada user_id) —
-- konsisten dengan aturan "poin komsel hanya self-scan".
--
-- Disimpan sebagai teks bebas (satu nama per baris) di kolom baru pada
-- komsel_sessions. Tulis/baca sudah tercakup policy existing `ksess_write`
-- (PKS komsel ybs / Admin) & `ksess_read` — TIDAK perlu policy baru.
ALTER TABLE komsel_sessions ADD COLUMN IF NOT EXISTS guest_names TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v54: Gambar pada Pesan Gembala ────────────────────────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): Pesan Gembala boleh melampirkan 1 gambar
-- (opsional). Gambar tampil compact (thumbnail) di list & Beranda, penuh di
-- detail. Disimpan di bucket publik `profile-photos` (non-sensitif, sama spt
-- gambar konten lain) pada path `pastoral/...`.
ALTER TABLE pastoral_messages ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Storage: pengunggah = role Gembala/Super Admin (pm_write). Policy
-- `profile_photos_insert` existing (fail-closed whitelist) HANYA mengizinkan
-- Admin/Super Admin pada folder konten tertentu — Gembala & folder `pastoral/`
-- TIDAK termasuk, jadi upload akan ditolak. Alih-alih menimpa policy lama itu
-- (RISIKO DRIFT — policy tsb mengatur SEMUA upload profile-photos: avatar,
-- bukti persembahan, konten admin), tambahkan policy TERPISAH yang permissive
-- (di-OR dengan yang lama). Additive-only, tidak menyentuh policy existing.
DROP POLICY IF EXISTS "profile_photos_pastoral_insert" ON storage.objects;
CREATE POLICY "profile_photos_pastoral_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND name LIKE 'pastoral/%'
    AND auth_user_role() IN ('Gembala','Super Admin')
  );

DROP POLICY IF EXISTS "profile_photos_pastoral_update" ON storage.objects;
CREATE POLICY "profile_photos_pastoral_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profile-photos'
    AND name LIKE 'pastoral/%'
    AND auth_user_role() IN ('Gembala','Super Admin')
  )
  WITH CHECK (
    bucket_id = 'profile-photos'
    AND name LIKE 'pastoral/%'
  );

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v55: Absen Pelayanan Minggu (Volunteer terjadwal) ─────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): Volunteer yang terjadwal melayani wajib
-- absen di ibadah untuk kedisiplinan waktu. Beda dari sunday_attendance
-- (absen jemaat umum): (a) hanya untuk Volunteer yang DITUGASKAN pada jadwal,
-- (b) dinilai TEPAT WAKTU / TERLAMBAT terhadap jam mulai jadwal, (c) QR
-- terpisah `ESC-VOLUNTEER:<schedule_id>`. Tiap scan = +1 poin (sama pola
-- kehadiran lain). Grace telat = 5 menit. Badge "3x telat" dihitung per BULAN
-- berjalan (reset tiap bulan) — lihat catatan di service klien.
--
-- Pengelola jadwal = ADMIN (digerbang Hak Akses `/admin/pelayanan`), bukan PKS.

-- (1) Jadwal pelayanan: 1 baris per (ministry, tanggal) dgn 1 jam mulai.
CREATE TABLE IF NOT EXISTS ministry_schedules (
  schedule_id  TEXT PRIMARY KEY DEFAULT 'MSCH-' || replace(gen_random_uuid()::text, '-', ''),
  ministry_id  TEXT REFERENCES ministries(ministry_id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  start_time   TIME NOT NULL,
  created_by   TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE ministry_schedules ENABLE ROW LEVEL SECURITY;
-- Baca: semua user login (dibutuhkan volunteer utk validasi saat scan).
DROP POLICY IF EXISTS "msch_read" ON ministry_schedules;
CREATE POLICY "msch_read" ON ministry_schedules FOR SELECT USING (auth.uid() IS NOT NULL);
-- Tulis: Admin ber-Hak-Akses `/admin/pelayanan` (Super Admin selalu lolos).
DROP POLICY IF EXISTS "msch_write" ON ministry_schedules;
CREATE POLICY "msch_write" ON ministry_schedules FOR ALL
  USING (auth_admin_can('/admin/pelayanan'))
  WITH CHECK (auth_admin_can('/admin/pelayanan'));

-- (2) Penugasan volunteer ke jadwal.
CREATE TABLE IF NOT EXISTS ministry_schedule_assignments (
  schedule_id TEXT NOT NULL REFERENCES ministry_schedules(schedule_id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (schedule_id, user_id)
);
ALTER TABLE ministry_schedule_assignments ENABLE ROW LEVEL SECURITY;
-- Baca: semua user login (volunteer perlu tahu ia terjadwal; RLS insert
-- ministry_attendance juga mengacu ke sini).
DROP POLICY IF EXISTS "msa_read" ON ministry_schedule_assignments;
CREATE POLICY "msa_read" ON ministry_schedule_assignments FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "msa_write" ON ministry_schedule_assignments;
CREATE POLICY "msa_write" ON ministry_schedule_assignments FOR ALL
  USING (auth_admin_can('/admin/pelayanan'))
  WITH CHECK (auth_admin_can('/admin/pelayanan'));

-- (3) Kehadiran pelayanan (hasil scan QR volunteer). status & data geolokasi
--     DIISI SERVER (trigger BEFORE), bukan dipercaya dari klien.
CREATE TABLE IF NOT EXISTS ministry_attendance (
  attendance_id TEXT PRIMARY KEY DEFAULT 'MATT-' || replace(gen_random_uuid()::text, '-', ''),
  schedule_id   TEXT REFERENCES ministry_schedules(schedule_id) ON DELETE CASCADE,
  user_id       TEXT REFERENCES users(user_id) ON DELETE CASCADE,
  scanned_at    TIMESTAMPTZ DEFAULT now(),
  status        TEXT DEFAULT 'Tepat Waktu' CHECK (status IN ('Tepat Waktu','Terlambat')),
  lat           DOUBLE PRECISION,     -- posisi mentah yg dilaporkan klien (soft-log)
  lng           DOUBLE PRECISION,
  distance_m    INTEGER,              -- jarak ke koordinat gereja (dihitung server)
  location_flag TEXT,                 -- 'Dalam Radius' | 'Di Luar Radius' | 'Tidak Tersedia'
  created_at    TIMESTAMPTZ DEFAULT now(),
  UNIQUE (schedule_id, user_id)
);
ALTER TABLE ministry_attendance ENABLE ROW LEVEL SECURITY;

-- Baca: Admin/Super Admin (rekap) atau volunteer melihat barisnya sendiri.
DROP POLICY IF EXISTS "matt_select" ON ministry_attendance;
CREATE POLICY "matt_select" ON ministry_attendance FOR SELECT USING (
  auth_user_role() IN ('Admin','Super Admin') OR user_id = auth_user_id()
);
-- Insert (self-scan): hanya volunteer yang (a) mencatat dirinya sendiri,
-- (b) memang DITUGASKAN pada jadwal itu, dan (c) tanggal jadwal = hari ini WIB
-- (anti-backdate, pola sama sunday_attendance). Volunteer tak terjadwal
-- ditolak DB — bukan sekadar disembunyikan di UI.
DROP POLICY IF EXISTS "matt_self_insert" ON ministry_attendance;
CREATE POLICY "matt_self_insert" ON ministry_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND EXISTS (
    SELECT 1 FROM ministry_schedule_assignments a
    WHERE a.schedule_id = ministry_attendance.schedule_id AND a.user_id = auth_user_id()
  )
  AND EXISTS (
    SELECT 1 FROM ministry_schedules s
    WHERE s.schedule_id = ministry_attendance.schedule_id
      AND s.service_date = (current_timestamp AT TIME ZONE 'Asia/Jakarta')::date
  )
);
-- Hapus: Admin/Super Admin (koreksi rekap).
DROP POLICY IF EXISTS "matt_admin_delete" ON ministry_attendance;
CREATE POLICY "matt_admin_delete" ON ministry_attendance FOR DELETE USING (
  auth_user_role() IN ('Admin','Super Admin')
);

CREATE INDEX IF NOT EXISTS idx_matt_user_month ON ministry_attendance (user_id, status, scanned_at);

-- (4) Trigger BEFORE INSERT: tetapkan status (telat) & geolokasi di SERVER.
--     Jangan percaya status/distance/flag kiriman klien — timpa semuanya.
CREATE OR REPLACE FUNCTION ministry_attendance_stamp() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start   time;
  v_now_wib timestamp;
  v_clat    double precision;
  v_clng    double precision;
  v_radius  double precision;
  v_dist    double precision;
BEGIN
  SELECT start_time INTO v_start FROM ministry_schedules WHERE schedule_id = NEW.schedule_id;
  v_now_wib := (now() AT TIME ZONE 'Asia/Jakarta');
  NEW.scanned_at := now();

  -- Status telat: grace 5 menit (keputusan operator 2026-07-10).
  IF v_start IS NOT NULL AND v_now_wib::time > (v_start + interval '5 minutes') THEN
    NEW.status := 'Terlambat';
  ELSE
    NEW.status := 'Tepat Waktu';
  END IF;

  -- Koordinat gereja dari app_settings (nilai bertipe text; parse aman).
  BEGIN
    SELECT value::double precision INTO v_clat FROM app_settings WHERE key = 'church_lat';
    SELECT value::double precision INTO v_clng FROM app_settings WHERE key = 'church_lng';
    SELECT value::double precision INTO v_radius FROM app_settings WHERE key = 'church_radius_m';
  EXCEPTION WHEN others THEN
    v_clat := NULL; v_clng := NULL; v_radius := NULL;
  END;
  IF v_radius IS NULL OR v_radius <= 0 THEN v_radius := 200; END IF; -- default 200 m

  -- Geolocation SOFT-LOG: hitung jarak haversine bila klien mengirim posisi &
  -- koordinat gereja tersedia. TIDAK memblokir absen (GPS indoor sering
  -- meleset & bisa di-spoof) — hanya menandai untuk ditinjau Admin.
  IF NEW.lat IS NOT NULL AND NEW.lng IS NOT NULL AND v_clat IS NOT NULL AND v_clng IS NOT NULL THEN
    v_dist := 2 * 6371000 * asin(sqrt(
      power(sin(radians(NEW.lat - v_clat) / 2), 2)
      + cos(radians(v_clat)) * cos(radians(NEW.lat)) * power(sin(radians(NEW.lng - v_clng) / 2), 2)
    ));
    NEW.distance_m := round(v_dist);
    NEW.location_flag := CASE WHEN v_dist <= v_radius THEN 'Dalam Radius' ELSE 'Di Luar Radius' END;
  ELSE
    NEW.distance_m := NULL;
    NEW.location_flag := 'Tidak Tersedia';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_ministry_att_stamp ON ministry_attendance;
CREATE TRIGGER trg_ministry_att_stamp
  BEFORE INSERT ON ministry_attendance
  FOR EACH ROW EXECUTE FUNCTION ministry_attendance_stamp();

-- (5) +1 poin per scan pelayanan: perluas award_attendance_point() (definisi
--     lengkap terakhir dari v52, ditambah cabang ministry_attendance) + trigger.
CREATE OR REPLACE FUNCTION award_attendance_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'komsel_attendance' THEN
    IF NEW.session_id IS NULL
       OR NEW.status IS DISTINCT FROM 'Hadir'
       OR NEW.user_id IS DISTINCT FROM auth_user_id() THEN
      RETURN NEW;
    END IF;
    PERFORM apply_points(NEW.user_id, 1, 'Kehadiran komsel');
    PERFORM set_config('app.allow_komsel_points_awarded', '1', true);
    UPDATE komsel_attendance SET points_awarded = true WHERE attendance_id = NEW.attendance_id;
    PERFORM set_config('app.allow_komsel_points_awarded', '', true);
    RETURN NEW;
  END IF;
  PERFORM apply_points(NEW.user_id, 1,
    CASE TG_TABLE_NAME
      WHEN 'class_attendance'    THEN 'Kehadiran kelas'
      WHEN 'event_attendance'    THEN 'Kehadiran event'
      WHEN 'sunday_attendance'   THEN 'Kehadiran ibadah minggu'
      WHEN 'ministry_attendance' THEN 'Absen Pelayanan Minggu'
      ELSE 'Kehadiran'
    END);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_point_ministry_att ON ministry_attendance;
CREATE TRIGGER trg_point_ministry_att
  AFTER INSERT ON ministry_attendance
  FOR EACH ROW EXECUTE FUNCTION award_attendance_point();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v56: Admin boleh HAPUS pengajuan KTJ (yang ditolak) ───────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): pengajuan KTJ yang DITOLAK admin harus
-- dihapus, tidak dibiarkan menumpuk. ktj_registrations belum punya policy
-- DELETE (hanya select/insert/update) — tambah gerbang DELETE untuk Admin
-- ber-Hak-Akses `/admin/ktj` (Super Admin selalu lolos). Klien memanggil
-- delete ini saat admin menolak (lihat AdminRegistrationDetailPage).
DROP POLICY IF EXISTS "ktj_admin_delete" ON ktj_registrations;
CREATE POLICY "ktj_admin_delete" ON ktj_registrations FOR DELETE
  USING (auth_admin_can('/admin/ktj'));

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v57: Keanggotaan komsel tunggal (tak boleh dobel) ─────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): seorang jemaat hanya boleh berada di SATU
-- komsel. Keanggotaan = kolom tunggal users.komsel_id, TAPI Admin (assignMember)
-- selama ini bisa menimpa komsel_id lama dengan komsel baru secara langsung
-- tanpa mengeluarkan dulu — anggota "pindah diam-diam", jejak keluar hilang,
-- dan PKS komsel lama masih mengira dia anggotanya. Aturan baru: perpindahan
-- WAJIB dua langkah — keluarkan dulu (komsel_id -> NULL) baru tambah ke komsel
-- baru (NULL -> komsel). Perpindahan langsung A -> B ditolak.
--
-- TEMUAN: aturan ini tak boleh cuma di UI — PostgREST langsung / klien nakal
-- bisa .update({komsel_id}) menembusnya. Ditegakkan di DB untuk SEMUA pemanggil
-- yang login (termasuk Admin/Super Admin lewat app). Konteks backend tepercaya
-- (SQL Editor / service role, auth.uid() NULL) DILEWATI agar koreksi manual
-- massal tetap bisa. Dibuat sebagai trigger TERPISAH dari
-- guard_user_privilege_cols supaya tidak menyentuh fungsi yang rawan drift (v45).
CREATE OR REPLACE FUNCTION guard_komsel_single_membership() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Hanya jaga transisi non-NULL -> non-NULL yang BERBEDA (pindah langsung).
  -- NULL -> komsel (tambah) & komsel -> NULL (keluar) tetap bebas.
  IF auth.uid() IS NOT NULL
     AND NEW.komsel_id IS NOT NULL
     AND OLD.komsel_id IS NOT NULL
     AND NEW.komsel_id IS DISTINCT FROM OLD.komsel_id THEN
    RAISE EXCEPTION 'Jemaat masih terdaftar di komsel lain — keluarkan dulu dari komsel sebelumnya.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_komsel_single ON users;
CREATE TRIGGER trg_guard_komsel_single
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION guard_komsel_single_membership();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v58: Absen Pelayanan berbasis SESI berlabel (lepas ministry) ─
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): model Absen Pelayanan (v55) diubah. Dulu tiap
-- sesi terikat SATU ministry (QR per ministry, roster = anggota ministry itu).
-- Sekarang unit = SESI mingguan berlabel (mis. "Minggu 1", "Minggu 2") dengan
-- tanggal + jam mulai; Admin memasukkan nama siapa saja yang melayani (roster
-- lintas ministry), dan setiap sesi punya SATU QR. Hanya nama di roster yang
-- bisa scan (sudah ditegakkan RLS matt_self_insert dari v55 — tidak berubah).
--
-- Perubahan schema minimal & aman: v55 sudah dijalankan di production TAPI belum
-- ada data jadwal (konfirmasi operator), jadi cukup TAMBAH kolom `label`. Kolom
-- `ministry_id` dibiarkan (sudah nullable sejak v55) — alur baru mengisinya NULL,
-- tidak dihapus agar tidak ada DROP destruktif. Policy msch_*/msa_*/matt_* v55
-- tetap valid (semua berbasis schedule_id, bukan ministry) — TIDAK diubah.
ALTER TABLE ministry_schedules ADD COLUMN IF NOT EXISTS label TEXT;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v59: Poin komsel — once-per-day & pemimpin hadir tanpa poin ─
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (2026-07-10): (1) BUG POIN GANDA — jemaat bisa dapat >1 poin komsel di
-- HARI yang sama bila ada >1 sesi (terverifikasi: 'Cristian Kenneth' dapat 2
-- poin komsel 09-Jul jam berbeda). award_attendance_point komsel tidak punya
-- batas per-hari. (2) SELF-SCAN PEMIMPIN — PKS yang membuka sesi komsel yang ia
-- PIMPIN bisa memindai QR yang ia unduh sendiri untuk memberi dirinya poin
-- (farming).
--
-- KEPUTUSAN OPERATOR:
--  (A) Poin komsel maksimal 1x per hari per jemaat (zona WIB) — sinyal tak
--      terpalsukan: point_transactions (ditulis SECURITY DEFINER apply_points).
--  (B) Pemimpin komsel (auth_leads_komsel) TIDAK dapat poin dari komselnya
--      sendiri — hadir saja. Agar tetap tercatat hadir tanpa harus scan, sesi
--      yang dibuka PKS otomatis menandai si pembuka 'Hadir' (poin=false).
-- Keduanya ditegakkan di DB (bukan UI). auth_user_id() & auth_leads_komsel tetap
-- benar di dalam SECURITY DEFINER (auth.uid tidak berubah). Cabang lain
-- (class/event/sunday/ministry) DIPERTAHANKAN persis dari v55.
CREATE OR REPLACE FUNCTION award_attendance_point() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_TABLE_NAME = 'komsel_attendance' THEN
    -- Poin komsel HANYA untuk scan mandiri jemaat sendiri, sesi valid, status
    -- Hadir, DAN pemanggil BUKAN pemimpin komsel ini (pemimpin: hadir tanpa poin).
    IF NEW.session_id IS NULL
       OR NEW.status IS DISTINCT FROM 'Hadir'
       OR NEW.user_id IS DISTINCT FROM auth_user_id()
       OR auth_leads_komsel(NEW.komsel_id) THEN
      RETURN NEW;
    END IF;
    -- Once-per-day (WIB): lewati bila jemaat ini sudah dapat poin komsel hari ini.
    IF EXISTS (
      SELECT 1 FROM point_transactions
      WHERE user_id = NEW.user_id
        AND description = 'Kehadiran komsel'
        AND (created_at AT TIME ZONE 'Asia/Jakarta')::date
            = (now() AT TIME ZONE 'Asia/Jakarta')::date
    ) THEN
      RETURN NEW;
    END IF;
    PERFORM apply_points(NEW.user_id, 1, 'Kehadiran komsel');
    PERFORM set_config('app.allow_komsel_points_awarded', '1', true);
    UPDATE komsel_attendance SET points_awarded = true WHERE attendance_id = NEW.attendance_id;
    PERFORM set_config('app.allow_komsel_points_awarded', '', true);
    RETURN NEW;
  END IF;
  PERFORM apply_points(NEW.user_id, 1,
    CASE TG_TABLE_NAME
      WHEN 'class_attendance'    THEN 'Kehadiran kelas'
      WHEN 'event_attendance'    THEN 'Kehadiran event'
      WHEN 'sunday_attendance'   THEN 'Kehadiran ibadah minggu'
      WHEN 'ministry_attendance' THEN 'Absen Pelayanan Minggu'
      ELSE 'Kehadiran'
    END);
  RETURN NEW;
END $$;

-- (B) Auto-hadir PKS pembuka sesi: saat sesi komsel dibuat oleh seseorang yang
-- MEMIMPIN komsel itu, tandai ia 'Hadir' tanpa poin (leader-exclusion di atas
-- memastikan tidak berpoin walau award trigger jalan). ON CONFLICT dihindari;
-- pakai NOT EXISTS agar aman terhadap unique parsial (session_id,user_id).
CREATE OR REPLACE FUNCTION komsel_session_mark_leader_present() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.created_by IS NOT NULL
     AND EXISTS (SELECT 1 FROM komsel_leaders
                 WHERE komsel_id = NEW.komsel_id AND user_id = NEW.created_by)
     AND NOT EXISTS (SELECT 1 FROM komsel_attendance
                     WHERE session_id = NEW.session_id AND user_id = NEW.created_by) THEN
    INSERT INTO komsel_attendance (komsel_id, user_id, session_id, attendance_date, status)
    VALUES (NEW.komsel_id, NEW.created_by, NEW.session_id, NEW.session_date, 'Hadir');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_komsel_session_leader_present ON komsel_sessions;
CREATE TRIGGER trg_komsel_session_leader_present
  AFTER INSERT ON komsel_sessions
  FOR EACH ROW EXECUTE FUNCTION komsel_session_mark_leader_present();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v60: Satu komsel maksimal satu PKS ────────────────────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): tiap komsel hanya boleh punya SATU PKS
-- (pemimpin). komsel_leaders (many-to-many) sebelumnya membolehkan >1. Karena
-- ada 3 komsel yang TERLANJUR punya 2 PKS di production, TIDAK dipakai UNIQUE
-- keras (akan gagal) — pakai trigger yang menolak penambahan PKS ke-2. Baris
-- lama di-grandfather (perlu dibersihkan manual: cabut salah satu PKS). Setelah
-- bersih, penambahan PKS ke-2 apa pun (klien maupun SQL) akan ditolak.
-- Ditegakkan di DB, bukan cuma UI. Seorang PKS tetap boleh memimpin >1 komsel;
-- yang dibatasi adalah jumlah PKS PER komsel.
CREATE OR REPLACE FUNCTION guard_single_komsel_leader() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM komsel_leaders
    WHERE komsel_id = NEW.komsel_id AND user_id <> NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Komsel ini sudah punya PKS. Satu komsel hanya boleh satu PKS — cabut PKS lama dulu.';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_single_komsel_leader ON komsel_leaders;
CREATE TRIGGER trg_guard_single_komsel_leader
  BEFORE INSERT ON komsel_leaders
  FOR EACH ROW EXECUTE FUNCTION guard_single_komsel_leader();

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v61: RPC hapus (revoke) poin oleh admin — halaman Distribusi ─
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-10): admin (ber-Hak-Akses `/admin/distribusi-poin`)
-- boleh MENGHAPUS poin yang sudah didapat seorang jemaat (mis. poin salah/dobel
-- dari bug lama). "Hapus" di sini = pembalik (reversal) yang menurunkan saldo
-- sebesar poin itu dan mencatat transaksi penyesuaian — TIDAK menghapus baris
-- asli, agar jejak audit tetap ada. Poin hanya bisa ditulis lewat apply_points
-- (SECURITY DEFINER), jadi ini RPC tepercaya, bukan tulis klien langsung.
-- Deskripsi 'Penyesuaian poin oleh admin' ditampilkan UI sebagai "Dikurangi oleh
-- sistem" (detail koreksi tidak dipamerkan).
CREATE OR REPLACE FUNCTION admin_revoke_point_transaction(p_txid TEXT) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid TEXT;
  v_amt INT;
BEGIN
  IF NOT (auth_user_role() = 'Super Admin' OR auth_admin_can('/admin/distribusi-poin')) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  SELECT user_id, amount INTO v_uid, v_amt
    FROM point_transactions WHERE transaction_id = p_txid;
  IF v_uid IS NULL THEN RAISE EXCEPTION 'tx_not_found'; END IF;
  -- Hanya poin yang DIDAPAT (positif) yang boleh dihapus, bukan penukaran/koreksi.
  IF v_amt <= 0 THEN RAISE EXCEPTION 'only_earned_points'; END IF;
  PERFORM apply_points(v_uid, -v_amt, 'Penyesuaian poin oleh admin');
  RETURN jsonb_build_object('ok', true, 'user_id', v_uid, 'amount', -v_amt);
END $$;
REVOKE EXECUTE ON FUNCTION admin_revoke_point_transaction(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_revoke_point_transaction(TEXT) TO authenticated;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v62: Disiplin Baca Buku — buku program & catatan poin bacaan ─
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-11): program disiplin membaca. Admin membuat
-- daftar buku (judul + total halaman). Anggota mencatat progres membaca dengan
-- mengumpulkan "poin bacaan" = PESAN/pelajaran yang didapat (bukan poin
-- gamifikasi) beserta halaman yang dicapai saat itu. Kumpulan catatan ini
-- menjadi bukti sekaligus bahan rekap admin. Progres halaman = halaman
-- tertinggi dari catatan anggota pada buku itu.
CREATE TABLE IF NOT EXISTS books (
  book_id     TEXT PRIMARY KEY DEFAULT 'BOOK-' || replace(gen_random_uuid()::text, '-', ''),
  title       TEXT NOT NULL,
  author      TEXT,
  total_pages INT,
  description TEXT,
  cover_url   TEXT,
  pdf_url     TEXT,                    -- file PDF buku (bucket publik task-files, path books/pdf/..)
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
-- Baca: semua user login (jemaat perlu melihat daftar buku program).
DROP POLICY IF EXISTS "books_read" ON books;
CREATE POLICY "books_read" ON books FOR SELECT USING (auth.uid() IS NOT NULL);
-- Tulis: Admin ber-Hak-Akses /admin/baca (Super Admin selalu lolos).
DROP POLICY IF EXISTS "books_write" ON books;
CREATE POLICY "books_write" ON books FOR ALL
  USING (auth_admin_can('/admin/baca'))
  WITH CHECK (auth_admin_can('/admin/baca'));

-- Catatan poin bacaan (koleksi). Satu baris = satu setoran poin/pesan pada
-- halaman tertentu. Anggota hanya boleh menulis untuk DIRINYA (user_id).
CREATE TABLE IF NOT EXISTS reading_notes (
  note_id    TEXT PRIMARY KEY DEFAULT 'RDN-' || replace(gen_random_uuid()::text, '-', ''),
  book_id    TEXT NOT NULL REFERENCES books(book_id) ON DELETE CASCADE,
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  page       INT NOT NULL DEFAULT 0,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reading_notes_book ON reading_notes (book_id, user_id);
CREATE INDEX IF NOT EXISTS idx_reading_notes_user ON reading_notes (user_id, created_at DESC);
ALTER TABLE reading_notes ENABLE ROW LEVEL SECURITY;
-- Baca: pemilik catatan, ATAU Admin/Super Admin (untuk rekap).
DROP POLICY IF EXISTS "rdn_select" ON reading_notes;
CREATE POLICY "rdn_select" ON reading_notes FOR SELECT USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);
-- Tulis (insert/update/delete): hanya pemilik. Admin boleh hapus (koreksi rekap).
DROP POLICY IF EXISTS "rdn_insert" ON reading_notes;
CREATE POLICY "rdn_insert" ON reading_notes FOR INSERT WITH CHECK (user_id = auth_user_id());
DROP POLICY IF EXISTS "rdn_update" ON reading_notes;
CREATE POLICY "rdn_update" ON reading_notes FOR UPDATE
  USING (user_id = auth_user_id()) WITH CHECK (user_id = auth_user_id());
DROP POLICY IF EXISTS "rdn_delete" ON reading_notes;
CREATE POLICY "rdn_delete" ON reading_notes FOR DELETE USING (
  user_id = auth_user_id() OR auth_user_role() IN ('Admin', 'Super Admin')
);

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v63: Sesi QR ibadah minggu (anti-curang absen jemaat) ─────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (operator, 2026-07-11): QR ibadah lama STATIS (ESC-SUNDAY:<tanggal>).
-- Isinya bisa ditebak/difoto/dibagikan, jadi jemaat bisa "absen" dari rumah
-- tanpa hadir fisik. Percobaan geofence GPS DITOLAK operator (koordinat bisa
-- di-spoof + berisiko mengunci jemaat ber-GPS jelek/izin ditolak).
--
-- KEPUTUSAN OPERATOR: QR ibadah diganti TOKEN SESI ACAK + JENDELA WAKTU (pola
-- komsel_sessions, diperkuat kolom expires_at). Admin "membuka sesi" saat
-- ibadah → QR berisi session_id acak (ESC-SUNDAY:<session_id>) yang hanya
-- valid sampai expires_at. Absen DITOLAK DB bila: tak menyertakan session_id,
-- sesi bukan hari ini (WIB), atau sesi sudah kedaluwarsa. Ini menaikkan biaya
-- curang (format tak bisa ditebak & QR lama mati). BATAS NYATA yang diterima
-- operator: foto QR live yang dibagikan SELAMA jendela masih bisa tembus —
-- risiko sisa dari model self-scan (alternatif "petugas scan jemaat" ditolak).

CREATE TABLE IF NOT EXISTS sunday_sessions (
  session_id   TEXT PRIMARY KEY DEFAULT 'SSES-' || replace(gen_random_uuid()::text, '-', ''),
  service_date DATE NOT NULL DEFAULT (current_timestamp AT TIME ZONE 'Asia/Jakarta')::date,
  title        TEXT,
  opened_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT now() + interval '3 hours',
  created_by   TEXT REFERENCES users(user_id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sunday_sessions_active ON sunday_sessions (service_date, expires_at);
ALTER TABLE sunday_sessions ENABLE ROW LEVEL SECURITY;
-- Baca: semua user login (dibutuhkan validasi saat jemaat scan QR).
DROP POLICY IF EXISTS "ssess_read" ON sunday_sessions;
CREATE POLICY "ssess_read" ON sunday_sessions FOR SELECT USING (auth.uid() IS NOT NULL);
-- Tulis (buka/tutup sesi): Admin ber-Hak-Akses `/admin/ibadah-minggu`
-- (Super Admin selalu lolos). Jemaat TIDAK boleh membuat sesi sendiri.
DROP POLICY IF EXISTS "ssess_write" ON sunday_sessions;
CREATE POLICY "ssess_write" ON sunday_sessions FOR ALL
  USING (auth_admin_can('/admin/ibadah-minggu'))
  WITH CHECK (auth_admin_can('/admin/ibadah-minggu'));

-- Kaitkan kehadiran ibadah ke sesi. Kolom nullable demi baris LAMA, tapi
-- policy insert baru mewajibkan sesi valid → baris baru mustahil tanpa sesi.
ALTER TABLE sunday_attendance
  ADD COLUMN IF NOT EXISTS session_id TEXT REFERENCES sunday_sessions(session_id) ON DELETE SET NULL;

-- Perketat INSERT: wajib menunjuk sesi milik HARI INI (WIB) yang BELUM
-- kedaluwarsa. Menggantikan aturan dow=0 lama — gerbang farming kini =
-- keberadaan sesi yang HANYA Admin buka, sehingga ibadah non-Minggu
-- (Natal/Jumat Agung) tetap bisa diabsenkan tanpa membuka celah poin.
DROP POLICY IF EXISTS "sunday_att_insert" ON sunday_attendance;
CREATE POLICY "sunday_att_insert" ON sunday_attendance FOR INSERT WITH CHECK (
  user_id = auth_user_id()
  AND attendance_date = (current_timestamp AT TIME ZONE 'Asia/Jakarta')::date
  AND EXISTS (
    SELECT 1 FROM sunday_sessions s
    WHERE s.session_id = sunday_attendance.session_id
      AND s.service_date = (current_timestamp AT TIME ZONE 'Asia/Jakarta')::date
      AND now() <= s.expires_at
  )
);

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v64: Hapus geolocation Absen Pelayanan ────────────────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-11): Fitur geolokasi soft-log pada Absen
-- Pelayanan (v55) dicabut — koordinat bisa di-spoof & tak dipakai untuk
-- keputusan apa pun, jadi hanya menambah kebisingan. Klien berhenti mengirim
-- lat/lng dan panel koordinat gereja di Admin dihapus.
--
-- Trigger stamp disederhanakan: hanya menetapkan scanned_at & status telat.
-- Kolom lat/lng/distance_m/location_flag DIBIARKAN ADA (nullable, selalu NULL
-- untuk baris baru) demi menjaga baris lama & sifat append-only — tidak
-- di-DROP untuk menghindari kehilangan data historis.
CREATE OR REPLACE FUNCTION ministry_attendance_stamp() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_start   time;
  v_now_wib timestamp;
BEGIN
  SELECT start_time INTO v_start FROM ministry_schedules WHERE schedule_id = NEW.schedule_id;
  v_now_wib := (now() AT TIME ZONE 'Asia/Jakarta');
  NEW.scanned_at := now();

  -- Status telat: grace 5 menit (keputusan operator 2026-07-10).
  IF v_start IS NOT NULL AND v_now_wib::time > (v_start + interval '5 minutes') THEN
    NEW.status := 'Terlambat';
  ELSE
    NEW.status := 'Tepat Waktu';
  END IF;

  -- Geolocation dicabut (v64): jangan hitung/isi lat/lng/distance/flag.
  RETURN NEW;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v65: Izinkan unggah PDF buku ke bucket task-files ──────────
-- ══════════════════════════════════════════════════════════════════════
-- TEMUAN (2026-07-11): Fitur Buku (Migrasi v62) mengunggah file PDF buku lewat
-- contentService.uploadPdf('books', file) → path `books/pdf/<...>` di bucket
-- `task-files`, TAPI policy `task_files_insert` (terakhir diubah v46) hanya
-- mengizinkan Admin menulis path `form-bg/%`, `*/video/%`, dan `news/pdf/%`.
-- Path `books/pdf/%` tidak ada di allowlist → INSERT ditolak:
--   "new row violates row-level security policy".
--
-- KEPUTUSAN OPERATOR (2026-07-11): izinkan Admin/Super Admin mengunggah PDF
-- buku kurasi ke `books/pdf/%` (setara izin PDF berita v46 & video v38).
--
-- CATATAN DRIFT: blok ini men-`CREATE OR REPLACE` policy storage `task_files_insert`.
-- Isi di bawah = SALINAN PERSIS versi Migrasi v46 DITAMBAH dua pola
-- `books/pdf/%` & `books/%/pdf/%` pada cabang admin. Cabang jawaban-tugas/izin
-- (responses/leaves milik sendiri) DIPERTAHANKAN tanpa perubahan. Bila production
-- sudah drift dari v46, verifikasi dulu:
--   SELECT pg_get_expr(polwithcheck, polrelid) FROM pg_policy
--   WHERE polname = 'task_files_insert';
-- lalu samakan sebelum menjalankan agar tidak ada izin lama yang hilang.
DROP POLICY IF EXISTS "task_files_insert" ON storage.objects;
CREATE POLICY "task_files_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'task-files'
    AND (
      -- Jawaban tugas & bukti izin: path[1] wajib user_id sendiri.
      ((name LIKE 'responses/%' OR name LIKE 'leaves/%')
        AND split_part(name, '/', 2) = auth_user_id())
      -- Background form + media kurasi (video & PDF): Admin/Super Admin saja.
      OR ((name LIKE 'form-bg/%'
           OR name LIKE 'classes/video/%' OR name LIKE 'classes/%/video/%'
           OR name LIKE 'events/video/%'  OR name LIKE 'events/%/video/%'
           OR name LIKE 'news/video/%'    OR name LIKE 'news/%/video/%'
           OR name LIKE 'news/pdf/%'      OR name LIKE 'news/%/pdf/%'
           OR name LIKE 'books/pdf/%'     OR name LIKE 'books/%/pdf/%')
        AND auth_user_role() IN ('Admin','Super Admin'))
    )
  );

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v66: Absen Pelayanan TANPA poin — cukup kehadiran ─────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-11): Absen Pelayanan Minggu (v55/v58) tidak lagi
-- memberi +1 poin. Alasan: pelayanan adalah kewajiban/kedisiplinan, bukan
-- aktivitas ber-reward seperti kehadiran ibadah/kelas/event/komsel. Kehadiran
-- TETAP tercatat di ministry_attendance (status Tepat Waktu/Terlambat, geolokasi)
-- — hanya pemberian poinnya yang dicabut.
--
-- Cara: cukup DROP trigger AFTER INSERT yang memanggil award_attendance_point
-- pada ministry_attendance. Fungsi award_attendance_point TIDAK diubah (cabang
-- 'ministry_attendance' di dalamnya menjadi kode mati/tak terpanggil — dibiarkan
-- agar tidak menyentuh fungsi bersama yang rawan drift; cabang komsel/class/
-- event/sunday tetap utuh). Idempotent: DROP TRIGGER IF EXISTS.
--
-- CATATAN: poin pelayanan yang TERLANJUR didapat sebelum migrasi ini TIDAK
-- ditarik otomatis (bukan retroaktif). Bila perlu koreksi, pakai RPC
-- admin_revoke_point_transaction (v61) per transaksi.
DROP TRIGGER IF EXISTS trg_point_ministry_att ON ministry_attendance;

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v67: Buang objek schema mati (dead code) ─────────────────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-11): audit dead-schema menemukan 3 objek yang
-- TIDAK dipakai kode maupun objek DB lain (policy/trigger/fungsi). Dibuang agar
-- schema tidak menyimpan sisa fitur yang sudah dihapus. Semua DROP idempotent
-- (IF EXISTS). Ketiganya diverifikasi nol-referensi sebelum dibuang:
--
--  (1) activation_otp — sisa fitur "aktivasi akun via OTP WhatsApp" yang sudah
--      DIHAPUS (rute /aktivasi kini redirect ke /register, lihat App.jsx). Tabel
--      RLS-enabled TANPA policy apa pun (tak bisa diakses via PostgREST), tanpa
--      FK, tanpa referensi kode. Baris OTP basi (bila ada) ikut terhapus — tak
--      dipakai lagi.
--  (2) auth_user_komsel() — helper role lama, nol pemanggil (digantikan
--      auth_leads_komsel() + kolom users.komsel_id langsung).
--  (3) deduct_user_point(TEXT,INT) — pengurang poin lama, nol pemanggil di
--      api/ maupun DB (pengurangan poin kini lewat apply_points(negatif) &
--      admin_revoke_point_transaction v61).
DROP TABLE IF EXISTS activation_otp;
DROP FUNCTION IF EXISTS auth_user_komsel();
DROP FUNCTION IF EXISTS deduct_user_point(TEXT, INT);

-- ══════════════════════════════════════════════════════════════════════
-- ── Migrasi v68: device_tokens — token FCM aplikasi native Android ────
-- ══════════════════════════════════════════════════════════════════════
-- KEPUTUSAN OPERATOR (2026-07-12): dibuat versi NATIVE Android (Flutter,
-- folder terpisah di luar repo) karena web push tidak andal di iOS dan APK
-- TWA punya bug DelegationService. Push native memakai FCM — mekanismenya
-- BERBEDA dari web-push VAPID, sehingga token device disimpan di tabel
-- sendiri, bukan menumpang push_subscriptions (kolomnya beda: endpoint/
-- p256dh/auth vs token FCM tunggal). Dua pipeline hidup berdampingan:
-- web-push (PWA) + FCM (native).
--
-- Pengirim: backend service-role (api/send-fcm nanti) — bypass RLS.
-- Klien native hanya upsert/menghapus token MILIKNYA sendiri.
CREATE TABLE IF NOT EXISTS device_tokens (
  token      TEXT PRIMARY KEY,                -- token FCM device (unik global)
  user_id    TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  platform   TEXT NOT NULL DEFAULT 'android' CHECK (platform IN ('android', 'ios')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_user ON device_tokens (user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;

-- User kelola token miliknya sendiri; pengiriman via service-role (bypass RLS).
-- Pakai helper auth_user_id() (SECURITY DEFINER) — jangan tulis ulang subquery.
DROP POLICY IF EXISTS "devtok_select_own" ON device_tokens;
CREATE POLICY "devtok_select_own" ON device_tokens FOR SELECT USING (
  user_id = auth_user_id()
);
DROP POLICY IF EXISTS "devtok_insert_own" ON device_tokens;
CREATE POLICY "devtok_insert_own" ON device_tokens FOR INSERT WITH CHECK (
  user_id = auth_user_id()
);
-- UPDATE dibutuhkan upsert onConflict(token): token sama pindah pemilik saat
-- ganti akun di device yang sama — WITH CHECK memastikan pemilik BARU = pemanggil.
DROP POLICY IF EXISTS "devtok_update_own" ON device_tokens;
CREATE POLICY "devtok_update_own" ON device_tokens FOR UPDATE
  USING (true)
  WITH CHECK (user_id = auth_user_id());
DROP POLICY IF EXISTS "devtok_delete_own" ON device_tokens;
CREATE POLICY "devtok_delete_own" ON device_tokens FOR DELETE USING (
  user_id = auth_user_id()
);

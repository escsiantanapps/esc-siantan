import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
function migration(version) {
  const headers = [...schema.matchAll(/^--[^\r\n]*Migrasi v(\d+):[^\r\n]*$/gm)]
  const index = headers.findIndex(header => Number(header[1]) === version)
  assert.notEqual(index, -1)
  return schema.slice(headers[index].index, headers[index + 1]?.index ?? schema.length)
}
const monthly = migration(98)
const definition = {
  sections: [
    { section_id: 'kids', title: 'Ibadah Kids QA', source_type: 'Ibadah', start_time: '07:00', end_time: '08:30', pic: 'PIC QA', parts: [
      { ministry_id: 'M-MUSIC', positions: [{ position_id: 'P-DRUM', capacity: 1 }, { position_id: 'P-BASS', capacity: 1 }] },
      { ministry_id: 'M-KIDS', positions: [{ position_id: 'P-TEACH', capacity: 2 }] },
    ] },
    { section_id: 'pagi', title: 'Ibadah Pagi QA', source_type: 'Ibadah', start_time: '08:00', end_time: '09:30', parts: [
      { ministry_id: 'M-MUSIC', positions: [{ position_id: 'P-DRUM', capacity: 1 }] },
    ] },
    { section_id: 'later', title: 'Kelas QA', source_type: 'Kelas', class_id: 'CLASS-QA', class_session_no: 1, start_time: '09:30', end_time: '10:30', parts: [
      { ministry_id: 'M-MUSIC', positions: [{ position_id: 'P-DRUM', capacity: 1 }] },
    ] },
  ],
}

async function setup(db) {
  // Fixture lokal memakai DDL/RPC nyata; tidak membaca atau menulis production.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id UUID PRIMARY KEY);
    CREATE TABLE users(user_id TEXT PRIMARY KEY, auth_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, photo_url TEXT, status TEXT NOT NULL DEFAULT 'Aktif', role TEXT DEFAULT 'Volunteer', role_secondary TEXT);
    CREATE TABLE ministries(ministry_id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE events(event_id TEXT PRIMARY KEY);
    CREATE TABLE classes(class_id TEXT PRIMARY KEY);
    CREATE TABLE user_ministries(user_id TEXT REFERENCES users(user_id) ON DELETE CASCADE,
      ministry_id TEXT REFERENCES ministries(ministry_id) ON DELETE CASCADE, PRIMARY KEY(user_id,ministry_id));
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN NULLIF(current_setting('test.caller_id', true), '') IS NOT NULL
        THEN '00000000-0000-4000-8000-000000000001'::UUID ELSE NULL END
    $$;
    CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT NULLIF(current_setting('test.caller_role', true), '')
    $$;
    CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT NULLIF(current_setting('test.caller_id', true), '')
    $$;
    CREATE FUNCTION auth_admin_can(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT COALESCE(NULLIF(current_setting('test.caller_role', true), '') IN ('Admin', 'Super Admin'), false)
        AND COALESCE(NULLIF(current_setting('test.restricted', true), ''), '0') <> '1'
    $$;
    CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  `)
  for (const version of [95, 96, 97, 98]) await db.exec(migration(version))
  await db.exec(monthly)
  await db.exec('GRANT SELECT ON service_rosters, service_roster_slots, ministry_service_positions, ministries TO authenticated, anon')
}

async function caller(db, id, role = 'Volunteer', restricted = false) {
  await db.query("SELECT set_config('test.caller_id', $1, true), set_config('test.caller_role', $2, true), set_config('test.restricted', $3, true)", [id, role, restricted ? '1' : '0'])
}
async function rejected(db, sql, values, pattern) {
  await db.exec('SAVEPOINT expected_rejection')
  try { await assert.rejects(db.query(sql, values), pattern) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}
async function fixture(db, run) {
  await db.exec('BEGIN')
  try {
    await caller(db, '', '')
    await db.exec(`
      INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
      INSERT INTO users(user_id,name,role,auth_id) VALUES
        ('ADMIN','Admin QA','Admin',NULL), ('MH','MH QA','Volunteer',NULL), ('OTHER-MH','MH Kids QA','Volunteer',NULL),
        ('A','Pelayan A','Volunteer','00000000-0000-4000-8000-000000000001'), ('B','Pelayan B','Volunteer',NULL),
        ('C','Pelayan C','Volunteer',NULL), ('K','Pengajar QA','Volunteer',NULL), ('VIEW','Pembaca QA','Volunteer',NULL);
      INSERT INTO users(user_id,name,status) VALUES ('INACTIVE','Nonaktif QA','Nonaktif');
      INSERT INTO ministries VALUES ('M-MUSIC','Musik QA'), ('M-KIDS','Kids QA');
      INSERT INTO classes VALUES ('CLASS-QA');
      INSERT INTO ministry_service_positions(position_id,ministry_id,name) VALUES
        ('P-DRUM','M-MUSIC','Drum'), ('P-BASS','M-MUSIC','Bass'), ('P-TEACH','M-KIDS','Pengajar');
      INSERT INTO user_ministries VALUES ('A','M-MUSIC'),('B','M-MUSIC'),('C','M-MUSIC'),('INACTIVE','M-MUSIC'),('K','M-KIDS');
      INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES
        ('M-MUSIC','MH','Ministry Head'),('M-KIDS','OTHER-MH','Ministry Head');
    `)
    await caller(db, 'ADMIN', 'Admin')
    const templateId = (await db.query('SELECT template_id FROM save_service_schedule_template(NULL,$1,$2::JSONB)', ['QA Bulanan', JSON.stringify(definition)])).rows[0].template_id
    const monthId = (await db.query("SELECT create_service_schedule_month($1,'2026-10-01',ARRAY['2026-10-04','2026-10-11']::DATE[]) AS id", [templateId])).rows[0].id
    const parts = (await db.query(`SELECT p.*, o.month_id, o.section_id, o.service_date::TEXT
      FROM service_schedule_parts p JOIN service_schedule_occurrences o ON o.occurrence_id=p.occurrence_id WHERE o.month_id=$1`, [monthId])).rows
    const part = (section, ministry = 'M-MUSIC', date = '2026-10-04') => parts.find(p => p.section_id === section && p.ministry_id === ministry && p.service_date === date)
    await run({ templateId, monthId, parts, part })
  } finally { await db.exec('ROLLBACK; RESET ROLE') }
}
async function assign(db, roster, position, users, expected = []) {
  return db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[]) AS slots', [roster, position, users, expected])
}
async function getMonth(db, monthId) {
  return (await db.query('SELECT get_service_schedule_month($1) AS data', [monthId])).rows[0].data
}
async function fillMinimum(db, parts) {
  for (const part of parts) {
    const count=(await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1 AND user_id IS NOT NULL',[part.roster_id])).rows[0].n
    if (count) continue
    await assign(db,part.roster_id,part.ministry_id==='M-KIDS'?'P-TEACH':'P-DRUM',
      [part.ministry_id==='M-KIDS'?'K':part.section_id==='kids'?'A':'B'])
  }
}

test('PostgreSQL: jadwal bulanan menjaga akses, bentrok, publikasi, dan cleanup', async t => {
  const db = new PGlite()
  try {
    await setup(db)
    await t.test('migrasi dua kali tidak mengganti guard lama atau menggandakan trigger', async () => {
      const old = await db.query("SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_service_roster','guard_service_roster_slot') ORDER BY proname")
      await db.exec(monthly)
      assert.deepEqual(await db.query("SELECT pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_service_roster','guard_service_roster_slot') ORDER BY proname"), old)
      assert.equal((await db.query("SELECT count(*)::INT AS n FROM pg_trigger WHERE tgname LIKE 'trg_guard_service_schedule_linked_%'")).rows[0].n, 2)
      assert.doesNotMatch(monthly, /DROP (?:POLICY|TRIGGER)|CREATE OR REPLACE FUNCTION (?:guard_service_roster\(|guard_service_roster_slot\(|auth_manages_ministry\()/)
    })
    await t.test('satu kegiatan bersama per tanggal menghasilkan hanya posisi snapshot yang dipilih', async () => {
      await fixture(db, async ({ monthId, parts }) => {
        const data = await getMonth(db, monthId)
        assert.equal(data.occurrences.length, 6)
        assert.equal(parts.length, 8)
        assert.equal(data.rosters.length, 8)
        assert.equal(data.rosters.reduce((n, r) => n + r.service_roster_slots.length, 0), 12)
        assert.equal(data.sections[0].positions.length, 3)
        assert.equal(data.sections[0].positions[2].slots, 2)
        assert.equal(data.month.status, 'Draft')
      })
    })
    await t.test('MH hanya melihat Draft miliknya dan tidak dapat mengatur struktur/publikasi', async () => {
      await fixture(db, async ({ monthId, templateId, part }) => {
        await assign(db, part('kids','M-KIDS').roster_id,'P-TEACH',['K'])
        await caller(db,'MH')
        const data = await getMonth(db, monthId)
        assert.equal(data.rosters.length, 6)
        assert.equal(data.parts.length, 6)
        assert.equal(JSON.stringify(data).includes('Pengajar QA'), false)
        await rejected(db,'SELECT save_service_schedule_template($1,$2,$3::JSONB)',[templateId,'Disusupkan',JSON.stringify(definition)],/not_authorized/)
        await rejected(db,"SELECT create_service_schedule_month($1,'2026-11-01',ARRAY['2026-11-01']::DATE[])",[templateId],/not_authorized/)
        await rejected(db,'SELECT publish_service_schedule_month($1,true)',[monthId],/not_authorized/)
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"start_time\":\"06:00\"}'::JSONB)",[part('kids').occurrence_id],/not_authorized/)
        await rejected(db,"SELECT update_service_schedule_part($1,'Tim lain',NULL,NULL)",[part('kids','M-KIDS').roster_id],/not_authorized/)
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-BASS',['K'],[]],/Ministry Head hanya/)
      })
    })
    await t.test('MH tidak dapat mengubah katalog posisi template dan grant dicabut menutup akses', async () => {
      await fixture(db, async ({ monthId, part }) => {
        await caller(db,'MH')
        await rejected(db,"UPDATE ministry_service_positions SET name='Drum diganti' WHERE position_id='P-DRUM'",[],/hanya dapat diubah oleh Admin/)
        await rejected(db,"UPDATE ministry_service_positions SET default_slots=8 WHERE position_id='P-DRUM'",[],/hanya dapat diubah oleh Admin/)
        await rejected(db,"DELETE FROM ministry_service_positions WHERE position_id='P-DRUM'",[],/hanya dapat diubah oleh Admin/)
        await caller(db,'ADMIN','Admin')
        await db.exec("UPDATE ministry_schedule_managers SET is_active=false WHERE user_id='MH'")
        await caller(db,'MH')
        await rejected(db,'SELECT get_service_schedule_month($1)',[monthId],/not_authorized/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-DRUM',['A'],[]],/not_authorized/)
        await caller(db,'ADMIN','Admin')
        await db.exec("UPDATE ministry_schedule_managers SET is_active=true WHERE user_id='MH'; UPDATE users SET role='Admin' WHERE user_id='MH'")
        await caller(db,'MH','Admin',true)
        await rejected(db,'SELECT get_service_schedule_month($1)',[monthId],/not_authorized/)
      })
    })
    await t.test('posisi template yang belum dibuat bulannya tetap tidak dapat dipindahkan oleh MH', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO ministry_service_positions(position_id,ministry_id,name) VALUES ('P-UNUSED','M-MUSIC','Posisi belum dipakai')")
        const onlyTemplate=structuredClone(definition)
        onlyTemplate.sections=[onlyTemplate.sections[0]]
        onlyTemplate.sections[0].parts=[{ ministry_id:'M-MUSIC',positions:[{position_id:'P-UNUSED',capacity:1}]}]
        await db.query('SELECT save_service_schedule_template(NULL,$1,$2::JSONB)',['Template saja',JSON.stringify(onlyTemplate)])
        await caller(db,'MH')
        await rejected(db,"UPDATE ministry_service_positions SET position_id='P-BROKEN' WHERE position_id='P-UNUSED'",[],/hanya dapat diubah oleh Admin/)
      })
    })
    await t.test('snapshot label posisi dan urutannya tidak berubah saat katalog Draft diubah Admin', async () => {
      await fixture(db, async ({monthId}) => {
        await db.exec("UPDATE ministry_service_positions SET name='Drum katalog baru',sort_order=99 WHERE position_id='P-DRUM'")
        const data=await getMonth(db,monthId)
        assert.equal(data.sections[0].positions[0].name,'Drum')
        assert.equal(data.sections[0].positions[0].sort_order,0)
      })
    })
    await t.test('Admin nonaktif tidak mendapat jalur tulis v98 meskipun helper lama mengizinkannya', async () => {
      await fixture(db, async ({templateId,monthId,part}) => {
        await db.exec("UPDATE users SET status='Nonaktif' WHERE user_id='ADMIN'")
        await rejected(db,'SELECT save_service_schedule_template($1,$2,$3::JSONB)',[templateId,'Diubah',JSON.stringify(definition)],/not_authorized/)
        await rejected(db,'SELECT get_service_schedule_month($1)',[monthId],/not_authorized/)
        await rejected(db,'SELECT publish_service_schedule_month($1,true)',[monthId],/not_authorized/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-DRUM',['A'],[]],/not_authorized/)
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"title\":\"Bypass\"}'::JSONB)",[part('kids').occurrence_id],/not_authorized/)
        await rejected(db,"SELECT update_service_schedule_part($1,'Tim',NULL,NULL)",[part('kids').roster_id],/not_authorized/)
      })
    })
    await t.test('Jemaat/Volunteer/PKS dan Admin dibatasi tidak mendapat akses kelola', async () => {
      await fixture(db, async ({ monthId, part }) => {
        for (const role of ['Jemaat','Volunteer','PKS','Admin']) {
          await caller(db,'VIEW',role,role === 'Admin')
          await rejected(db,'SELECT get_service_schedule_month($1)',[monthId],/not_authorized/)
          await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-DRUM',['VIEW'],[]],/not_authorized/)
        }
      })
    })
    await t.test('kapasitas, duplicate, nonaktif dan optimistic concurrency dijaga DB', async () => {
      await fixture(db, async ({ part }) => {
        const roster = part('kids').roster_id
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[roster,'P-DRUM',['A','B'],[]],/Kapasitas/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[roster,'P-DRUM',['A','A'],[]],/berulang/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[roster,'P-DRUM',['INACTIVE'],[]],/Aktif/)
        await assign(db,roster,'P-DRUM',['A'])
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[roster,'P-DRUM',['B'],[]],/schedule_stale/)
        await assign(db,roster,'P-DRUM',['B'],['A'])
        assert.equal((await db.query('SELECT user_id FROM service_roster_slots WHERE roster_id=$1 AND position_id=$2',[roster,'P-DRUM'])).rows[0].user_id,'B')
      })
    })
    await t.test('bentrok lintas kegiatan/rangkap ditolak, jam bersebelahan dan tanggal lain boleh', async () => {
      await fixture(db, async ({ part }) => {
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-BASS',['A'],[]],/schedule_conflict/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('pagi').roster_id,'P-DRUM',['A'],[]],/schedule_conflict/)
        await assign(db,part('later').roster_id,'P-DRUM',['A'])
        await assign(db,part('kids','M-MUSIC','2026-10-11').roster_id,'P-DRUM',['A'])
        await assign(db,part('pagi').roster_id,'P-DRUM',['B'])
        await assign(db,part('later').roster_id,'P-DRUM',['B'],['A'])
      })
    })
    await t.test('penggantian multi-pelayan gagal seluruhnya bila satu pilihan bentrok', async () => {
      await fixture(db, async ({ part }) => {
        const teaching = part('kids','M-KIDS').roster_id
        await assign(db,teaching,'P-TEACH',['K'])
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[teaching,'P-TEACH',['A','B'],['K']],/schedule_conflict/)
        assert.deepEqual((await db.query('SELECT user_id FROM service_roster_slots WHERE roster_id=$1 ORDER BY slot_no',[teaching])).rows.map(r=>r.user_id),['K',null])
      })
    })
    await t.test('RPC lama dan akses langsung tidak dapat mengubah assignment/kapasitas/struktur bulanan', async () => {
      await fixture(db, async ({ part }) => {
        const roster = part('kids').roster_id
        const slot = (await db.query('SELECT slot_id FROM service_roster_slots WHERE roster_id=$1 LIMIT 1',[roster])).rows[0].slot_id
        await rejected(db,'SELECT assign_service_roster_slot($1,$2,true)',[slot,'A'],/Penugasan jadwal bulanan wajib/)
        await rejected(db,"UPDATE service_rosters SET title='Terpisah' WHERE roster_id=$1",[roster],/Struktur dan publikasi/)
        await rejected(db,'DELETE FROM service_rosters WHERE roster_id=$1',[roster],/Bagian jadwal bulanan/)
        await rejected(db,'DELETE FROM service_roster_slots WHERE slot_id=$1',[slot],/Kapasitas posisi/)
        await rejected(db,"INSERT INTO service_roster_slots(roster_id,ministry_id,position_id,slot_no) VALUES ($1,'M-MUSIC','P-DRUM',2)",[roster],/Kapasitas posisi/)
        await assign(db,roster,'P-DRUM',['A'])
        await rejected(db,'SELECT publish_service_roster($1,true)',[roster],/Struktur dan publikasi/)
      })
    })
    await t.test('override RPC lama ditolak dua arah ketika ada penugasan bulanan', async () => {
      await fixture(db, async ({ part }) => {
        const legacy = (await db.query(`SELECT create_service_roster('M-MUSIC','Ibadah',NULL,NULL,NULL,
          'Ibadah lama QA','2026-10-04','07:30','09:00',NULL,NULL,NULL) AS id`)).rows[0].id
        const slot = (await db.query("SELECT slot_id FROM service_roster_slots WHERE roster_id=$1 AND position_id='P-DRUM'",[legacy])).rows[0].slot_id
        await db.query('SELECT assign_service_roster_slot($1,$2,true)',[slot,'B'])
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-DRUM',['B'],[]],/schedule_conflict/)
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,'SELECT assign_service_roster_slot($1,$2,true)',[slot,'A'],/schedule_conflict/)
        assert.equal((await db.query('SELECT user_id FROM service_roster_slots WHERE slot_id=$1',[slot])).rows[0].user_id,'B')
      })
    })
    await t.test('jam kegiatan sinkron untuk semua ministry dan terkunci setelah diisi', async () => {
      await fixture(db, async ({ part }) => {
        const occurrenceId = part('kids').occurrence_id
        await db.query("SELECT update_service_schedule_occurrence($1,'{\"start_time\":\"06:30\",\"end_time\":\"08:00\",\"pic\":\"PIC baru\",\"title\":\"Kids berubah\"}'::JSONB)",[occurrenceId])
        const times = (await db.query('SELECT r.title,r.start_time::TEXT,r.end_time::TEXT FROM service_rosters r JOIN service_schedule_parts p ON p.roster_id=r.roster_id WHERE p.occurrence_id=$1',[occurrenceId])).rows
        assert.equal(times.length,2)
        assert.equal(times.every(r=>r.title==='Kids berubah' && r.start_time==='06:30:00' && r.end_time==='08:00:00'),true)
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"end_time\":\"09:00\"}'::JSONB)",[occurrenceId],/Kosongkan seluruh pelayan/)
        await db.query("SELECT update_service_schedule_occurrence($1,'{\"dress_code\":\"Batik\"}'::JSONB)",[occurrenceId])
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"month_id\":\"Disusupkan\"}'::JSONB)",[occurrenceId],/Isian kegiatan/)
        await caller(db,'MH')
        await db.query("SELECT update_service_schedule_part($1,'Tim 2','Materi QA','Catatan QA')",[part('kids').roster_id])
        let notes=(await db.query('SELECT notes FROM service_rosters WHERE roster_id=$1',[part('kids').roster_id])).rows[0].notes
        assert.match(notes,/PIC: PIC baru/)
        assert.match(notes,/Tim: Tim 2/)
        assert.match(notes,/Materi: Materi QA/)
        assert.match(notes,/Catatan QA/)
        await rejected(db,"UPDATE service_rosters SET notes='Bypass langsung' WHERE roster_id=$1",[part('kids').roster_id],/Struktur dan publikasi/)
        await caller(db,'ADMIN','Admin')
        await db.query("SELECT update_service_schedule_occurrence($1,'{\"notes\":\"Catatan bersama\",\"pic\":\"PIC berikutnya\"}'::JSONB)",[occurrenceId])
        notes=(await db.query('SELECT notes FROM service_rosters WHERE roster_id=$1',[part('kids').roster_id])).rows[0].notes
        assert.match(notes,/Catatan bersama/)
        assert.match(notes,/PIC: PIC berikutnya/)
        assert.match(notes,/Tim: Tim 2/)
        assert.match(notes,/Materi: Materi QA/)
      })
    })
    await t.test('tanggal kegiatan boleh hari lain dalam bulan, tetapi berubah atomik dan wajib kosong', async () => {
      await fixture(db, async ({part}) => {
        const occurrenceId=part('kids').occurrence_id
        await db.query("SELECT update_service_schedule_occurrence($1,'{\"service_date\":\"2026-10-05\"}'::JSONB)",[occurrenceId])
        assert.equal((await db.query('SELECT service_date::TEXT FROM service_rosters r JOIN service_schedule_parts p ON p.roster_id=r.roster_id WHERE p.occurrence_id=$1',[occurrenceId])).rows.every(r=>r.service_date==='2026-10-05'),true)
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"service_date\":\"2026-11-01\"}'::JSONB)",[occurrenceId],/dalam bulan jadwal/)
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,"SELECT update_service_schedule_occurrence($1,'{\"service_date\":\"2026-10-06\"}'::JSONB)",[occurrenceId],/Kosongkan seluruh pelayan/)
        await db.query("SELECT update_service_schedule_occurrence($1,'{\"service_date\":\"2026-10-05\",\"dress_code\":\"Batik\"}'::JSONB)",[occurrenceId])
      })
    })
    await t.test('anggota tidak membaca slot Draft bulanan melalui SQL langsung, legacy Draft tetap sama', async () => {
      await fixture(db, async ({monthId,part,parts}) => {
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        const legacy=(await db.query("SELECT create_service_roster('M-MUSIC','Ibadah',NULL,NULL,NULL,'Legacy siang','2026-10-04','12:00','13:00',NULL,NULL,NULL) AS id")).rows[0].id
        const legacySlot=(await db.query("SELECT slot_id FROM service_roster_slots WHERE roster_id=$1 AND position_id='P-DRUM'",[legacy])).rows[0].slot_id
        await db.query('SELECT assign_service_roster_slot($1,$2,true)',[legacySlot,'A'])
        await caller(db,'A')
        await db.exec('SET LOCAL ROLE authenticated')
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1',[part('kids').roster_id])).rows[0].n,0)
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1',[legacy])).rows[0].n,1)
        await db.exec('RESET ROLE')
        await caller(db,'ADMIN','Admin')
        await fillMinimum(db,parts)
        await db.query('SELECT publish_service_schedule_month($1,true)',[monthId])
        await caller(db,'A')
        await db.exec('SET LOCAL ROLE authenticated')
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1',[part('kids').roster_id])).rows[0].n,2)
      })
    })
    await t.test('validasi template menolak posisi ministry lain, duplicate, jam dan tanggal salah', async () => {
      await fixture(db, async ({ templateId }) => {
        const bad = structuredClone(definition)
        bad.sections[0].parts[0].positions[0].position_id='P-TEACH'
        await rejected(db,'SELECT save_service_schedule_template(NULL,$1,$2::JSONB)',['Salah',JSON.stringify(bad)],/Posisi harus/)
        const duplicate = structuredClone(definition)
        duplicate.sections.push(duplicate.sections[0])
        await rejected(db,'SELECT save_service_schedule_template(NULL,$1,$2::JSONB)',['Salah',JSON.stringify(duplicate)],/Identitas kegiatan/)
        const wrongTime = structuredClone(definition)
        wrongTime.sections[0].end_time='06:00'
        await rejected(db,'SELECT save_service_schedule_template(NULL,$1,$2::JSONB)',['Salah',JSON.stringify(wrongTime)],/Jam selesai/)
        await rejected(db,"SELECT create_service_schedule_month($1,'2026-11-01',ARRAY['2026-11-01','2026-12-01']::DATE[])",[templateId],/Tanggal harus/)
        await rejected(db,"SELECT create_service_schedule_month($1,'2026-11-01',ARRAY['2026-11-01','2026-11-01']::DATE[])",[templateId],/Tanggal harus/)
        await rejected(db,"SELECT create_service_schedule_month($1,'2026-10-01',ARRAY['2026-10-18']::DATE[])",[templateId],/duplicate key/)
      })
    })
    await t.test('publish/cancel seluruh bulan atomik dan memberi akses baca tanpa akses Admin', async () => {
      await fixture(db, async ({ templateId, monthId, part, parts }) => {
        await rejected(db,'SELECT publish_service_schedule_month($1,true)',[monthId],/Isi minimal/)
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await rejected(db,'SELECT publish_service_schedule_month($1,true)',[monthId],/setiap bagian ministry/)
        await fillMinimum(db,parts)
        await rejected(db,'SELECT publish_service_schedule_month($1,false)',[monthId],/slot kosong/)
        await db.exec(`CREATE FUNCTION qa_reject_one_publish() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN IF NEW.title='Ibadah Pagi QA' AND NEW.status='Terbit' THEN RAISE EXCEPTION 'qa_atomic_failure'; END IF; RETURN NEW; END $$;
          CREATE TRIGGER zzz_qa_reject_publish BEFORE UPDATE ON service_rosters FOR EACH ROW EXECUTE FUNCTION qa_reject_one_publish();`)
        await rejected(db,'SELECT publish_service_schedule_month($1,true)',[monthId],/qa_atomic_failure/)
        assert.equal((await db.query('SELECT status FROM service_schedule_months WHERE month_id=$1',[monthId])).rows[0].status,'Draft')
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM service_rosters WHERE status<>'Draft'")).rows[0].n,0)
        await db.exec('DROP TRIGGER zzz_qa_reject_publish ON service_rosters; DROP FUNCTION qa_reject_one_publish()')
        const ids=(await db.query('SELECT publish_service_schedule_month($1,true) AS ids',[monthId])).rows[0].ids
        assert.equal(ids.length,8)
        const rows=(await db.query('SELECT status,version FROM service_rosters WHERE roster_id=ANY($1::TEXT[])',[ids])).rows
        assert.equal(rows.every(r=>r.status==='Terbit' && r.version===1),true)
        await caller(db,'VIEW')
        assert.equal((await getMonth(db,monthId)).rosters.length,8)
        await rejected(db,'SELECT cancel_service_schedule_month($1)',[monthId],/not_authorized/)
        await caller(db,'ADMIN','Admin')
        await rejected(db,'SELECT cancel_service_roster($1)',[part('kids').roster_id],/Struktur dan publikasi/)
        await rejected(db,'SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',[part('kids').roster_id,'P-DRUM',[],['A']],/Hanya jadwal Draft/)
        await db.query('SELECT cancel_service_schedule_month($1)',[monthId])
        assert.equal((await getMonth(db,monthId)).rosters.every(r=>r.status==='Dibatalkan' && r.version===2),true)
        await db.query("SELECT create_service_schedule_month($1,'2026-10-01',ARRAY['2026-10-04']::DATE[])",[templateId])
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months')).rows[0].n,2)
      })
    })
    await t.test('FK cleanup backend pada slot/metadata final bulanan tetap lewat v97', async () => {
      await fixture(db, async ({ monthId, part, parts }) => {
        await assign(db,part('kids').roster_id,'P-DRUM',['A'])
        await fillMinimum(db,parts)
        await db.query('SELECT publish_service_schedule_month($1,true)',[monthId])
        await caller(db,'','')
        await db.exec("DELETE FROM auth.users WHERE id='00000000-0000-4000-8000-000000000001'")
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM service_roster_slots WHERE user_id='A'")).rows[0].n,0)
        await db.exec("DELETE FROM users WHERE user_id='ADMIN'")
        assert.equal((await db.query('SELECT created_by,published_by,status FROM service_rosters')).rows.every(r=>r.created_by===null && r.published_by===null && r.status==='Terbit'),true)
        assert.equal((await db.query('SELECT created_by,published_by,status FROM service_schedule_months')).rows.every(r=>r.created_by===null && r.published_by===null && r.status==='Terbit'),true)
      })
    })
    await t.test('RLS dan privilege SQL langsung tidak membuka Draft atau jalur tulis baru', async () => {
      await fixture(db, async ({ monthId, part }) => {
        await assign(db,part('kids','M-KIDS').roster_id,'P-TEACH',['K'])
        await caller(db,'MH')
        await db.exec('SET LOCAL ROLE authenticated')
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months')).rows[0].n,1)
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_parts')).rows[0].n,6)
        await rejected(db,"UPDATE service_schedule_months SET status='Terbit' WHERE month_id=$1",[monthId],/permission denied/)
        await rejected(db,"INSERT INTO service_schedule_templates(name,definition) VALUES ('Bypass','{}')",[],/permission denied/)
        await db.exec('RESET ROLE')
        await caller(db,'VIEW')
        await db.exec('SET LOCAL ROLE authenticated')
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months')).rows[0].n,0)
        assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_parts')).rows[0].n,0)
        await db.exec('RESET ROLE')
        await caller(db,'','')
        await db.exec('SET LOCAL ROLE anon')
        await rejected(db,'SELECT get_service_schedule_month($1)',[monthId],/permission denied/)
      })
    })
  } finally { await db.close() }
})

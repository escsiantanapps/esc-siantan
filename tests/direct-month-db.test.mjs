import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const audit = await readFile(new URL('../docs/AUDIT-DRAFT-JADWAL.sql', import.meta.url), 'utf8')
function migration(version) {
  const headers = [...schema.matchAll(/^--[^\r\n]*Migrasi v(\d+):[^\r\n]*$/gm)]
  const index = headers.findIndex(header => Number(header[1]) === version)
  assert.notEqual(index, -1)
  return schema.slice(headers[index].index, headers[index + 1]?.index ?? schema.length)
}
const directMigration = migration(102)
const cleanupMigration = migration(103)
const entries = [
  { section_id: 'pagi', service_date: '2026-10-04', title: 'Ibadah Pagi',
    source_type: 'Ibadah', start_time: '08:00', end_time: '09:30',
    ministry_ids: ['M-MUSIC', 'M-HOST'], dress_code: 'Batik' },
  { section_id: 'pagi', service_date: '2026-10-11', title: 'Ibadah Pagi',
    source_type: 'Ibadah', start_time: '09:00', end_time: '10:30',
    ministry_ids: ['M-MUSIC'] },
  { section_id: 'kelas', service_date: '2026-10-18', title: 'Kelas Pemuridan',
    source_type: 'Kelas', class_id: 'CLASS-1', class_session_no: 2,
    start_time: '11:00', end_time: '12:00', ministry_ids: ['M-HOST'] },
]

async function setup(db) {
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
    CREATE FUNCTION auth_admin_mh_scoped_v111() RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT COALESCE(current_setting('test.scoped', true), '') = '1'
    $$;
    CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  `)
  for (const version of [95, 96, 97, 98]) await db.exec(migration(version))
  await db.exec(directMigration)
  await db.exec(cleanupMigration)
  await db.exec(migration(107))
  await db.exec(migration(107))
  await db.exec(migration(108))
  await db.exec(migration(108))
  await db.exec(migration(123))
  await db.exec(migration(123))
  await db.exec(migration(124))
  await db.exec(migration(124))
  await db.exec(`
    CREATE TABLE ministry_schedules(schedule_id TEXT PRIMARY KEY, label TEXT,
      source_occurrence_id TEXT REFERENCES service_schedule_occurrences(occurrence_id));
    CREATE TABLE ministry_schedule_assignments(schedule_id TEXT REFERENCES ministry_schedules(schedule_id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(user_id), PRIMARY KEY(schedule_id,user_id));
    CREATE TABLE ministry_attendance(attendance_id TEXT PRIMARY KEY,
      schedule_id TEXT REFERENCES ministry_schedules(schedule_id));
    INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
    INSERT INTO users(user_id,name,role,auth_id) VALUES
      ('ADMIN','Admin QA','Admin','00000000-0000-4000-8000-000000000001'),
      ('VOL','Volunteer QA','Volunteer',NULL),('M1','Musik 1','Volunteer',NULL),
      ('M2','Musik 2','Volunteer',NULL),('H1','Host 1','Volunteer',NULL),
      ('H2','Host 2','Volunteer',NULL);
    INSERT INTO ministries VALUES ('M-MUSIC','Worship'),('M-HOST','Hospitality');
    INSERT INTO classes VALUES ('CLASS-1');
    INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES
      ('P-SINGER','M-MUSIC','Singer',2),('P-HOST','M-HOST','Host',1);
    INSERT INTO user_ministries VALUES
      ('M1','M-MUSIC'),('M2','M-MUSIC'),('H1','M-HOST'),('H2','M-HOST');
    INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role)
      VALUES ('M-MUSIC','VOL','Wakil');
    GRANT SELECT ON service_rosters, service_roster_slots, ministries TO authenticated;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ministry_service_positions TO authenticated;
  `)
}
async function caller(db, id = 'ADMIN', role = 'Admin', restricted = false) {
  await db.query("SELECT set_config('test.caller_id',$1,true), set_config('test.caller_role',$2,true), set_config('test.restricted',$3,true)",
    [id, role, restricted ? '1' : '0'])
}
async function create(db, data = entries, month = '2026-10-01') {
  return (await db.query('SELECT create_service_schedule_month_direct($1::DATE,$2::JSONB) AS id',
    [month, JSON.stringify(data)])).rows[0].id
}
async function rejected(db, data, pattern, month = '2026-10-01') {
  await db.exec('SAVEPOINT expected_rejection')
  try { await assert.rejects(create(db, data, month), pattern) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}
async function rejectedDelete(db, id, expected, pattern) {
  await db.exec('SAVEPOINT expected_delete_rejection')
  try {
    await assert.rejects(
      db.query('SELECT delete_service_schedule_month_draft($1,$2) AS deleted', [id, expected]),
      pattern,
    )
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT expected_delete_rejection; RELEASE SAVEPOINT expected_delete_rejection')
  }
}

test('PostgreSQL: draft langsung menghormati per-tanggal, akses dan guard lama', async t => {
  const db = new PGlite()
  let publishedMonthId
  try {
    await setup(db)
    await db.exec('BEGIN')
    await caller(db)
    await t.test('audit production hanya SELECT dan migrasi idempotent', async () => {
      assert.match(audit.trim(), /^--[\s\S]*?WITH target_tables AS \(/)
      assert.doesNotMatch(audit, /\b(?:INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\s+(?:TABLE|POLICY|TRIGGER|FUNCTION|INTO|ON|FROM)\b/i)
      const metadata = await db.query(audit)
      assert.equal(metadata.rows[0].audit_draft_jadwal.template_teknis.template_id, 'SSTPL-DIRECT-V102')
      const oldGuard = (await db.query("SELECT pg_get_functiondef('guard_service_schedule_linked_slot()'::regprocedure) AS body")).rows[0].body
      await db.exec(directMigration)
      assert.equal((await db.query("SELECT count(*)::INT AS n FROM service_schedule_templates WHERE template_id='SSTPL-DIRECT-V102'")).rows[0].n, 1)
      assert.equal((await db.query("SELECT pg_get_functiondef('guard_service_schedule_linked_slot()'::regprocedure) AS body")).rows[0].body, oldGuard)
      assert.deepEqual((await db.query(`SELECT
        has_function_privilege('anon','create_service_schedule_month_direct(date,jsonb)','EXECUTE') AS anon,
        has_function_privilege('authenticated','create_service_schedule_month_direct(date,jsonb)','EXECUTE') AS authenticated`)).rows[0],
        { anon: false, authenticated: true })
      await db.exec(cleanupMigration)
      assert.deepEqual((await db.query(`SELECT
        has_function_privilege('anon','delete_service_schedule_month_draft(text,integer)','EXECUTE') AS anon,
        has_function_privilege('authenticated','delete_service_schedule_month_draft(text,integer)','EXECUTE') AS authenticated`)).rows[0],
        { anon: false, authenticated: true })
      assert.equal((await db.query(`SELECT pg_get_expr(polqual,polrelid) AS policy
        FROM pg_policy WHERE polrelid='public.ministry_service_positions'::regclass
          AND polname='msp_write'`)).rows[0].policy, 'auth_service_schedule_admin()')
    })
    await t.test('v103 menolak policy drift tanpa WITH CHECK dan mempertahankan policy lama', async () => {
      await db.exec('SAVEPOINT malformed_catalog_policy')
      try {
        await db.exec(`DROP POLICY msp_write ON ministry_service_positions;
          CREATE POLICY msp_write ON ministry_service_positions FOR ALL
            USING (auth_service_schedule_admin());`)
        await assert.rejects(db.exec(cleanupMigration), /berbeda dari audit/)
      } finally {
        await db.exec('ROLLBACK TO SAVEPOINT malformed_catalog_policy; RELEASE SAVEPOINT malformed_catalog_policy')
      }
      const row = (await db.query(`SELECT pg_get_expr(polqual,polrelid) AS using_expr,
        pg_get_expr(polwithcheck,polrelid) AS check_expr
        FROM pg_policy WHERE polrelid='public.ministry_service_positions'::regclass
          AND polname='msp_write'`)).rows[0]
      assert.equal(row.using_expr,'auth_service_schedule_admin()')
      assert.equal(row.check_expr,'auth_service_schedule_admin()')
    })
    await t.test('katalog posisi hanya dapat ditulis Admin aktif berakses Jadwal', async () => {
      await caller(db,'VOL','Volunteer')
      await db.exec('SET ROLE authenticated')
      assert.equal((await db.query("SELECT auth_manages_ministry('M-MUSIC') AS manages")).rows[0].manages,true)
      await db.exec('SAVEPOINT position_insert_rejection')
      try {
        await assert.rejects(db.query(`INSERT INTO ministry_service_positions(position_id,ministry_id,name)
          VALUES ('P-BYPASS','M-MUSIC','Bypass')`), /row-level security|permission denied/i)
      } finally {
        await db.exec('ROLLBACK TO SAVEPOINT position_insert_rejection; RELEASE SAVEPOINT position_insert_rejection')
      }
      assert.equal((await db.query("UPDATE ministry_service_positions SET default_slots=3 WHERE position_id='P-SINGER'")).rowCount,0)
      assert.equal((await db.query("DELETE FROM ministry_service_positions WHERE position_id='P-SINGER'")).rowCount,0)
      await db.exec('RESET ROLE')
      await caller(db,'ADMIN','Admin',true)
      await db.exec('SET ROLE authenticated')
      await db.exec('SAVEPOINT restricted_insert_rejection')
      try {
        await assert.rejects(db.query(`INSERT INTO ministry_service_positions(position_id,ministry_id,name)
          VALUES ('P-RESTRICTED','M-MUSIC','Dibatasi')`), /row-level security|permission denied/i)
      } finally {
        await db.exec('ROLLBACK TO SAVEPOINT restricted_insert_rejection; RELEASE SAVEPOINT restricted_insert_rejection')
      }
      await db.exec('RESET ROLE')
      await caller(db)
      await db.exec('SET ROLE authenticated')
      await db.query(`INSERT INTO ministry_service_positions(position_id,ministry_id,name)
        VALUES ('P-ADMIN','M-MUSIC','Admin Baru')`)
      assert.equal((await db.query("UPDATE ministry_service_positions SET default_slots=2 WHERE position_id='P-ADMIN'")).rowCount,1)
      assert.equal((await db.query("DELETE FROM ministry_service_positions WHERE position_id='P-ADMIN'")).rowCount,1)
      await db.exec('RESET ROLE')
    })
    await t.test('Volunteer dan Admin dibatasi ditolak pada RPC langsung', async () => {
      for (const [id, role, restricted] of [['VOL','Volunteer',false],['ADMIN','Admin',true]]) {
        await caller(db,id,role,restricted)
        await db.exec('SET ROLE authenticated')
        await rejected(db,entries,/not_authorized/)
        await db.exec('RESET ROLE')
      }
      await caller(db)
      await db.exec('SET ROLE authenticated')
      await rejected(db,entries.map((entry,index) => index === 1 ? {...entry,title:'Bypass'} : entry),/Identitas kegiatan/)
      await db.exec('RESET ROLE')
      await caller(db)
      await db.exec("UPDATE users SET status='Nonaktif' WHERE user_id='ADMIN'")
      await rejected(db,entries,/not_authorized/)
      await db.exec("UPDATE users SET status='Aktif' WHERE user_id='ADMIN'")
    })
    await t.test('tanggal dan Ministry berbeda menghasilkan hanya bagian dan slot yang dipilih', async () => {
      const id = await create(db)
      publishedMonthId = id
      const data = (await db.query('SELECT get_service_schedule_month($1) AS result',[id])).rows[0].result
      assert.equal(data.month.status, 'Draft')
      assert.equal(data.month.definition.kind, 'direct')
      assert.equal(data.month.template_id, 'SSTPL-DIRECT-V102')
      assert.equal(data.occurrences.length, 3)
      assert.equal(data.parts.length, 4)
      assert.equal(data.rosters.reduce((n, row) => n + row.service_roster_slots.length, 0), 6)
      const pagi = data.sections.find(section => section.section_id === 'pagi')
      assert.deepEqual(pagi.participation['2026-10-04'], ['M-MUSIC','M-HOST'])
      assert.deepEqual(pagi.participation['2026-10-11'], ['M-MUSIC'])
      assert.equal(pagi.positions.length, 2)
      assert.equal(data.rosters.some(row => row.ministry_id === 'M-HOST' && row.service_date === '2026-10-11'), false)
      assert.equal(data.occurrences.find(row => row.service_date === '2026-10-11').start_time, '09:00:00')
      const forPart = (date, ministry) => data.rosters.find(row => row.service_date === date && row.ministry_id === ministry)
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [forPart('2026-10-04','M-MUSIC').roster_id,'P-SINGER',['M1'],[]])
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [forPart('2026-10-04','M-HOST').roster_id,'P-HOST',['H1'],[]])
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [forPart('2026-10-11','M-MUSIC').roster_id,'P-SINGER',['M1'],[]])
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [forPart('2026-10-18','M-HOST').roster_id,'P-HOST',['H2'],[]])
      const rosterIds = (await db.query('SELECT publish_service_schedule_month($1,true) AS ids',[id])).rows[0].ids
      assert.equal(rosterIds.length, 4)
      assert.equal((await db.query('SELECT status FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].status,'Terbit')
      await rejected(db,entries,/duplicate key|service_schedule_one_active_month_idx/)
      await db.exec(directMigration)
      assert.equal((await db.query('SELECT status FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].status,'Terbit')
    })
    await t.test('ID Kelas dinormalisasi secara sama di snapshot dan occurrence', async () => {
      const id = await create(db,[{...entries[2], service_date:'2026-11-01', class_id:' CLASS-1 '}],'2026-11-01')
      const data = (await db.query('SELECT get_service_schedule_month($1) AS result',[id])).rows[0].result
      assert.equal(data.sections[0].class_id,'CLASS-1')
      assert.equal(data.occurrences[0].class_id,'CLASS-1')
    })
    await t.test('validasi rusak gagal atomik tanpa bulan atau roster tambahan', async () => {
      const badCases = [
        [{}, /tidak valid/],
        [[{...entries[0],title:{value:'Ibadah Pagi'}}], /harus berupa teks/],
        [[{...entries[0],location:['Ruang utama']}], /harus berupa teks/],
        [[{...entries[0],notes:{data:'Catatan'}}], /harus berupa teks/],
        [[...entries, entries[0]], /berulang/],
        [[entries[0], {...entries[1], title:'Nama berbeda'}], /Identitas/],
        [[{...entries[0], ministry_ids:['M-MUSIC','M-MUSIC']}], /berulang/],
        [[{...entries[0], ministry_ids:['M-NOT-FOUND']}], /tidak ditemukan/],
        [[{...entries[0], start_time:'09:30', end_time:'08:00'}], /Jam|jam/],
        [[{...entries[0], source_type:'Event'}], /Sumber/],
        [[{...entries[2], class_id:null}], /Sumber/],
        [[{...entries[0], service_date:'2026-11-01'}], /bulan/],
        [[{...entries[0], section_id:'not valid'}], /tidak valid/],
        [[{...entries[0], ministry_ids:[]}], /Ministry/],
        [Array.from({length:13},(_,i)=>({...entries[0], section_id:`s${i}`,service_date:`2026-10-${String(i+1).padStart(2,'0')}`})), /12 jenis/],
        [Array.from({length:125},(_,i)=>({...entries[0], service_date:`2026-10-${String(i%31+1).padStart(2,'0')}`})), /tidak valid/],
      ]
      for (const [data, pattern] of badCases) await rejected(db,data,pattern)
      await db.exec("INSERT INTO ministries VALUES ('M-EMPTY','Ministry tanpa posisi')")
      await rejected(db,[{...entries[0],ministry_ids:['M-EMPTY']}],/posisi aktif/)
      const before = (await db.query('SELECT count(*)::INT AS n FROM service_schedule_months')).rows[0].n
      await rejected(db,[{...entries[0],ministry_ids:['M-MUSIC','M-NOT-FOUND']}],/tidak ditemukan/)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months')).rows[0].n,before)
    })
    await t.test('hapus Draft terkunci, mendeteksi stale, tanpa orphan, lalu dapat dibuat ulang', async () => {
      const december = [{ ...entries[0], service_date:'2026-12-06' }]
      const id = await create(db, december, '2026-12-01')
      const data = (await db.query('SELECT get_service_schedule_month($1) AS result',[id])).rows[0].result
      const rosterIds = data.rosters.map(row => row.roster_id)
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [rosterIds[0],data.rosters[0].service_roster_slots[0].position_id,['M1'],[]])
      await rejectedDelete(db,id,0,/schedule_stale/)
      await rejectedDelete(db,id,-1,/tidak valid/)
      await rejectedDelete(db,publishedMonthId,0,/Hanya jadwal bulanan Draft/)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].n,1)
      await caller(db,'VOL','Volunteer')
      await db.exec('SET ROLE authenticated')
      await rejectedDelete(db,id,1,/not_authorized/)
      await db.exec('RESET ROLE')
      await caller(db,'ADMIN','Admin',true)
      await db.exec('SET ROLE authenticated')
      await rejectedDelete(db,id,1,/not_authorized/)
      await db.exec('RESET ROLE')
      await caller(db)
      await db.exec('SET ROLE authenticated')
      const deleted = (await db.query('SELECT delete_service_schedule_month_draft($1,$2) AS n',[id,1])).rows[0].n
      assert.equal(deleted,1)
      await rejectedDelete(db,id,1,/Hanya jadwal bulanan Draft/)
      await db.exec('RESET ROLE')
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].n,0)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_rosters WHERE roster_id=ANY($1::TEXT[])',[rosterIds])).rows[0].n,0)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=ANY($1::TEXT[])',[rosterIds])).rows[0].n,0)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_occurrences WHERE month_id=$1',[id])).rows[0].n,0)
      assert.notEqual(await create(db,december,'2026-12-01'),id)
    })
    await t.test('Edit Jadwal menyinkronkan posisi Draft dan menjaga penugasan', async () => {
      await caller(db)
      const id = await create(db,[{ ...entries[0], service_date:'2027-01-03', ministry_ids:['M-MUSIC'] }],'2027-01-01')
      const initial = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      const rosterId = initial.rosters[0].roster_id
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [rosterId,'P-SINGER',['M1'],[]])
      await db.exec("UPDATE ministry_service_positions SET default_slots=3 WHERE position_id='P-SINGER'")
      await db.exec("INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES ('P-BASS','M-MUSIC','Bass',1)")
      const catalog = { 'M-MUSIC': {
        'P-SINGER': { name:'Singer', capacity:3, sort_order:0 },
        'P-BASS': { name:'Bass', capacity:1, sort_order:0 },
      } }
      await db.exec('SET ROLE authenticated')
      const version = (await db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB) AS version',
        [id,0,JSON.stringify(catalog)])).rows[0].version
      assert.equal(version,1)
      await db.exec('RESET ROLE')
      const updated = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      assert.deepEqual(updated.sections[0].positions.map(item => item.name).sort(), ['Bass','Singer'])
      assert.equal(updated.rosters[0].service_roster_slots.length,4)
      assert.equal(updated.rosters[0].service_roster_slots.filter(slot => slot.user_id === 'M1').length,1)
      await db.exec("UPDATE ministry_service_positions SET default_slots=1 WHERE position_id='P-SINGER'")
      catalog['M-MUSIC']['P-SINGER'].capacity = 1
      await db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB)',[id,1,JSON.stringify(catalog)])
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1',[rosterId])).rows[0].n,2)
      await db.exec("UPDATE ministry_service_positions SET is_active=false WHERE position_id='P-SINGER'")
      delete catalog['M-MUSIC']['P-SINGER']
      await db.exec('SAVEPOINT expected_catalog_stale')
      try { await assert.rejects(db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB)',
        [id,2,JSON.stringify({ 'M-MUSIC': { ...catalog['M-MUSIC'], 'P-SINGER': { name:'Singer', capacity:1, sort_order:0 } } })]),/schedule_stale/) }
      finally { await db.exec('ROLLBACK TO SAVEPOINT expected_catalog_stale; RELEASE SAVEPOINT expected_catalog_stale') }
      await db.exec('SAVEPOINT expected_published_rejection')
      try { await assert.rejects(db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB)',
        [publishedMonthId,0,JSON.stringify(catalog)]),/Hanya jadwal Draft/) }
      finally { await db.exec('ROLLBACK TO SAVEPOINT expected_published_rejection; RELEASE SAVEPOINT expected_published_rejection') }
      await db.exec('SAVEPOINT expected_sync_rejection')
      try { await assert.rejects(db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB)',
        [id,2,JSON.stringify(catalog)]),/schedule_position_assigned/) }
      finally { await db.exec('ROLLBACK TO SAVEPOINT expected_sync_rejection; RELEASE SAVEPOINT expected_sync_rejection') }
      assert.equal((await db.query('SELECT version FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].version,2)
      const permission = (await db.query("SELECT has_function_privilege('anon','sync_service_schedule_draft_positions(text,integer,jsonb)','EXECUTE') AS anon")).rows[0]
      assert.equal(permission.anon,false)
      for (const [role, restricted] of [['Jemaat',false],['Volunteer',false],['PKS',false],['Admin',true]]) {
        await caller(db,role === 'Admin' ? 'ADMIN' : 'VOL',role,restricted)
        await db.exec('SET ROLE authenticated')
        await db.exec('SAVEPOINT expected_unauthorized')
        try { await assert.rejects(db.query('SELECT sync_service_schedule_draft_positions($1,$2,$3::JSONB)',
          [id,2,JSON.stringify(catalog)]),/not_authorized/) }
        finally { await db.exec('ROLLBACK TO SAVEPOINT expected_unauthorized; RELEASE SAVEPOINT expected_unauthorized') }
        await db.exec('RESET ROLE')
      }
      await caller(db)
    })
    await t.test('Edit Jadwal memindahkan pelayan dari posisi lama ke job baru secara atomik', async () => {
      await caller(db)
      await db.exec("INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES ('P-LEGACY','M-MUSIC','Music',2)")
      const id = await create(db,[{ ...entries[0], service_date:'2027-02-07', ministry_ids:['M-MUSIC'] }],'2027-02-01')
      const before = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      const rosterId = before.rosters[0].roster_id
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [rosterId,'P-LEGACY',['M1','M2'],[]])
      const assigned = (await db.query("SELECT slot_id,user_id FROM service_roster_slots WHERE roster_id=$1 AND position_id='P-LEGACY' ORDER BY slot_no",[rosterId])).rows
      await db.exec("UPDATE ministry_service_positions SET is_active=false WHERE position_id='P-LEGACY'")
      await db.exec("INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES ('P-DRUM','M-MUSIC','Drum',1),('P-KEYBOARD','M-MUSIC','Keyboard',1)")
      const catalog = { 'M-MUSIC': {
        'P-BASS': { name:'Bass', capacity:1, sort_order:0 },
        'P-DRUM': { name:'Drum', capacity:1, sort_order:0 },
        'P-KEYBOARD': { name:'Keyboard', capacity:1, sort_order:0 },
      } }
      const moves = assigned.map((slot,index) => ({ slot_id:slot.slot_id, user_id:slot.user_id,
        position_id:index === 0 ? 'P-DRUM' : 'P-KEYBOARD' }))
      await db.exec('SAVEPOINT invalid_capacity')
      try { await assert.rejects(db.query('SELECT reassign_and_sync_service_schedule_draft_positions($1,$2,$3::JSONB,$4::JSONB)',
        [id,0,JSON.stringify(catalog),JSON.stringify(moves.map(move => ({ ...move, position_id:'P-DRUM' })))]),/Kapasitas posisi tidak mencukupi/) }
      finally { await db.exec('ROLLBACK TO SAVEPOINT invalid_capacity; RELEASE SAVEPOINT invalid_capacity') }
      assert.equal((await db.query('SELECT version FROM service_schedule_months WHERE month_id=$1',[id])).rows[0].version,0)
      assert.equal((await db.query("SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1 AND position_id='P-LEGACY' AND user_id IS NOT NULL",[rosterId])).rows[0].n,2)
      await db.exec('SET ROLE authenticated')
      assert.equal((await db.query('SELECT reassign_and_sync_service_schedule_draft_positions($1,$2,$3::JSONB,$4::JSONB) AS version',
        [id,0,JSON.stringify(catalog),JSON.stringify(moves)])).rows[0].version,1)
      await db.exec('RESET ROLE')
      const after = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      assert.deepEqual(after.sections[0].positions.map(item => item.name).sort(), ['Bass','Drum','Keyboard'])
      assert.deepEqual((await db.query('SELECT position_id,user_id FROM service_roster_slots WHERE roster_id=$1 AND user_id IS NOT NULL ORDER BY position_id',[rosterId])).rows,
        [{ position_id:'P-DRUM', user_id:'M1' },{ position_id:'P-KEYBOARD', user_id:'M2' }])
      assert.equal((await db.query("SELECT has_function_privilege('anon','reassign_and_sync_service_schedule_draft_positions(text,integer,jsonb,jsonb)','EXECUTE') AS allowed")).rows[0].allowed,false)
      await caller(db,'VOL','Volunteer')
      await db.exec('SET ROLE authenticated')
      await db.exec('SAVEPOINT unauthorized_move')
      try { await assert.rejects(db.query('SELECT reassign_and_sync_service_schedule_draft_positions($1,$2,$3::JSONB,$4::JSONB)',
        [id,1,JSON.stringify(catalog),'[]']),/not_authorized/) }
      finally { await db.exec('ROLLBACK TO SAVEPOINT unauthorized_move; RELEASE SAVEPOINT unauthorized_move') }
      await db.exec('RESET ROLE')
      await caller(db)
    })
    await t.test('v123 menambahkan Ministry ke semua tanggal Draft tanpa mengubah penugasan lama', async () => {
      await caller(db)
      await db.exec("INSERT INTO ministries VALUES ('M-PARK','Parking')")
      await db.exec("INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES ('P-PARK','M-PARK','Parkir',2)")
      await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('H1','M-PARK')")
      const sectionId = 'park-v123'
      const days = ['2027-03-07', '2027-03-14', '2027-03-21']
      const data = days.map((service_date, index) => ({
        section_id: sectionId, service_date, title: 'Ibadah Pagi',
        source_type: 'Ibadah', start_time: '09:00', end_time: '11:00',
        ministry_ids: index === 0 ? ['M-HOST', 'M-PARK'] : ['M-HOST'],
      }))
      const id = await create(db, data, '2027-03-01')
      const first = (await db.query('SELECT get_service_schedule_month($1) AS data', [id])).rows[0].data
      const parkRoster = first.rosters.find(row => row.ministry_id === 'M-PARK')
      assert.ok(parkRoster)
      assert.equal(first.parts.filter(row => row.ministry_id === 'M-PARK').length, 1)
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [parkRoster.roster_id, 'P-PARK', ['H1'], []])

      const call = expected => db.query(
        'SELECT add_service_schedule_ministry_to_section_v123($1,$2,$3,$4) AS added',
        [id, sectionId, 'M-PARK', expected],
      )
      const reject = async (operation, pattern) => {
        await db.exec('SAVEPOINT expected_v123_rejection')
        try { await assert.rejects(operation(), pattern) }
        finally { await db.exec('ROLLBACK TO SAVEPOINT expected_v123_rejection; RELEASE SAVEPOINT expected_v123_rejection') }
      }

      assert.equal((await db.query("SELECT has_function_privilege('anon','add_service_schedule_ministry_to_section_v123(text,text,text,integer)','EXECUTE') AS allowed")).rows[0].allowed, false)
      await caller(db, 'VOL', 'Volunteer')
      await db.exec('SET ROLE authenticated')
      await reject(() => call(0), /not_authorized/)
      await db.exec('RESET ROLE')
      await caller(db)
      await db.query("SELECT set_config('test.scoped','1',true)")
      await db.exec('SET ROLE authenticated')
      await reject(() => call(0), /not_authorized/)
      await db.exec('RESET ROLE')
      await db.query("SELECT set_config('test.scoped','',true)")

      await db.exec('SET ROLE authenticated')
      assert.equal((await call(0)).rows[0].added, 2)
      await db.exec('RESET ROLE')
      const after = (await db.query('SELECT get_service_schedule_month($1) AS data', [id])).rows[0].data
      assert.equal(after.month.version, 1)
      assert.equal(after.parts.filter(row => row.ministry_id === 'M-PARK').length, 3)
      assert.equal(after.rosters.find(row => row.service_date === days[0]
        && row.ministry_id === 'M-PARK').roster_id, parkRoster.roster_id)
      assert.equal(after.rosters.find(row => row.roster_id === parkRoster.roster_id)
        .service_roster_slots.filter(slot => slot.user_id === 'H1').length, 1)
      for (const day of days) {
        assert.ok(after.sections[0].participation[day].includes('M-PARK'))
        const roster = after.rosters.find(row => row.ministry_id === 'M-PARK' && row.service_date === day)
        assert.equal(roster.service_roster_slots.length, 2)
      }
      await db.exec('SET ROLE authenticated')
      assert.equal((await call(1)).rows[0].added, 0)
      await reject(() => call(0), /Versi jadwal berubah/)
      await db.exec('RESET ROLE')
      assert.equal((await db.query('SELECT version FROM service_schedule_months WHERE month_id=$1', [id])).rows[0].version, 1)
      await reject(() => db.query('SELECT add_service_schedule_ministry_to_section_v123($1,$2,$3,$4)',
        [publishedMonthId, 'pagi', 'M-PARK', 1]), /Hanya jadwal Draft/)
    })
    await t.test('v124 memperbarui Draft yang sama dan menjaga penugasan pada bagian tetap', async () => {
      await caller(db)
      const original = [
        { section_id:'pagi-v124', service_date:'2027-04-04', title:'Ibadah Pagi', source_type:'Ibadah',
          start_time:'08:00', end_time:'09:30', ministry_ids:['M-HOST'] },
        { section_id:'pagi-v124', service_date:'2027-04-11', title:'Ibadah Pagi', source_type:'Ibadah',
          start_time:'08:00', end_time:'09:30', ministry_ids:['M-HOST'] },
      ]
      const id = await create(db, original, '2027-04-01')
      const before = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      const kept = before.occurrences.find(item => item.service_date === '2027-04-04')
      const removed = before.occurrences.find(item => item.service_date === '2027-04-11')
      const keptRoster = before.parts.find(item => item.occurrence_id === kept.occurrence_id).roster_id
      const removedRoster = before.parts.find(item => item.occurrence_id === removed.occurrence_id).roster_id
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [keptRoster,'P-HOST',['H1'],[]])
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [removedRoster,'P-HOST',['H2'],[]])
      const removedSlots = (await db.query('SELECT slot_id,user_id FROM service_roster_slots WHERE roster_id=$1 AND user_id IS NOT NULL ORDER BY slot_id',
        [removedRoster])).rows
      await db.query('INSERT INTO ministry_schedules(schedule_id,source_occurrence_id) VALUES ($1,$2)',
        ['S-V124-REMOVED',removed.occurrence_id])
      await db.query('INSERT INTO ministry_schedule_assignments(schedule_id,user_id) VALUES ($1,$2)',
        ['S-V124-REMOVED','H2'])
      const desired = [
        { ...original[0], occurrence_id:kept.occurrence_id, title:'Ibadah Pagi Baru',
          location:'Ruang Utama', ministry_ids:['M-HOST','M-MUSIC'] },
        { ...original[1], service_date:'2027-04-18', title:'Ibadah Pagi Baru',
          ministry_ids:['M-HOST','M-MUSIC'] },
      ]
      const call = (version, snapshot, confirmation) => db.query(
        'SELECT update_service_schedule_month_draft_v124($1,$2,$3::JSONB,$4::JSONB,$5) AS version',
        [id,version,JSON.stringify(desired),JSON.stringify(snapshot),confirmation])
      const reject = async (operation, pattern) => {
        await db.exec('SAVEPOINT expected_v124_rejection')
        try { await assert.rejects(operation(), pattern) }
        finally { await db.exec('ROLLBACK TO SAVEPOINT expected_v124_rejection; RELEASE SAVEPOINT expected_v124_rejection') }
      }
      assert.equal((await db.query("SELECT has_function_privilege('anon','update_service_schedule_month_draft_v124(text,integer,jsonb,jsonb,text)','EXECUTE') AS allowed")).rows[0].allowed,false)
      await caller(db,'VOL','Volunteer')
      await db.exec('SET ROLE authenticated')
      await reject(() => call(0,[],null), /not_authorized/)
      await db.exec('RESET ROLE')
      await caller(db)
      const snapshot = removedSlots
      await db.exec('SET ROLE authenticated')
      await reject(() => call(0,[], 'HAPUS PENUGASAN'), /schedule_stale/)
      await reject(() => call(0,snapshot,null), /HAPUS PENUGASAN/)
      assert.equal((await call(0,snapshot,'HAPUS PENUGASAN')).rows[0].version,1)
      await reject(() => call(0,snapshot,'HAPUS PENUGASAN'), /schedule_stale/)
      await db.exec('RESET ROLE')
      const after = (await db.query('SELECT get_service_schedule_month($1) AS data',[id])).rows[0].data
      assert.equal(after.month.month_id,id)
      assert.equal(after.month.version,1)
      assert.equal(after.occurrences.length,2)
      assert.ok(after.occurrences.some(item => item.occurrence_id === kept.occurrence_id))
      assert.ok(!after.occurrences.some(item => item.occurrence_id === removed.occurrence_id))
      assert.equal(after.parts.find(item => item.occurrence_id === kept.occurrence_id
        && item.ministry_id === 'M-HOST').roster_id,keptRoster)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_roster_slots WHERE roster_id=$1 AND user_id=$2',
        [keptRoster,'H1'])).rows[0].n,1)
      assert.equal(after.parts.length,4)
      assert.equal(after.sections[0].participation['2027-04-18'].length,2)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM ministry_schedules WHERE schedule_id=$1',
        ['S-V124-REMOVED'])).rows[0].n,0)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM ministry_schedule_assignments WHERE schedule_id=$1',
        ['S-V124-REMOVED'])).rows[0].n,0)
      await db.query('UPDATE service_schedule_months SET published_at=now() WHERE month_id=$1',[id])
      const publishedEdit = after.occurrences.map(item => ({
        occurrence_id:item.occurrence_id, section_id:item.section_id,
        service_date:item.service_date, title:item.title, source_type:item.source_type,
        start_time:item.occurrence_id === kept.occurrence_id ? '08:00' : '09:00',
        end_time:'09:30', ministry_ids:['M-HOST','M-MUSIC'],
      }))
      await reject(() => db.query(
        'SELECT update_service_schedule_month_draft_v124($1,$2,$3::JSONB,$4::JSONB,$5)',
        [id,1,JSON.stringify(publishedEdit),'[]',null]), /pernah terbit tidak dapat diganti/)

      const retractedMonth = await create(db, [{ ...original[0], service_date:'2027-06-06',
        ministry_ids:['M-HOST','M-MUSIC'] }], '2027-06-01')
      const retracted = (await db.query('SELECT get_service_schedule_month($1) AS data',
        [retractedMonth])).rows[0].data
      const retractedOccurrence = retracted.occurrences[0]
      const retractedRoster = retracted.parts.find(item => item.ministry_id === 'M-HOST').roster_id
      await db.query('SELECT set_service_schedule_position($1,$2,$3::TEXT[],$4::TEXT[])',
        [retractedRoster,'P-HOST',['H1'],[]])
      const retractedSlot = (await db.query('SELECT slot_id FROM service_roster_slots WHERE roster_id=$1 AND user_id=$2',
        [retractedRoster,'H1'])).rows[0].slot_id
      await db.query('INSERT INTO ministry_schedules(schedule_id,label,source_occurrence_id) VALUES ($1,$2,$3)',
        ['S-V124-RETRACTED','Ibadah Pagi',retractedOccurrence.occurrence_id])
      await db.query('INSERT INTO ministry_schedule_assignments(schedule_id,user_id) VALUES ($1,$2)',
        ['S-V124-RETRACTED','H1'])
      await db.query('UPDATE service_schedule_months SET published_at=now() WHERE month_id=$1',
        [retractedMonth])
      const retractedEdit = [{ ...original[0], service_date:'2027-06-06',
        occurrence_id:retractedOccurrence.occurrence_id, title:'Ibadah Pagi Revisi',
        ministry_ids:['M-MUSIC'] }]
      assert.equal((await db.query(
        'SELECT update_service_schedule_month_draft_v124($1,$2,$3::JSONB,$4::JSONB,$5) AS version',
        [retractedMonth,0,JSON.stringify(retractedEdit),
          JSON.stringify([{ slot_id:retractedSlot,user_id:'H1' }]),'HAPUS PENUGASAN'])).rows[0].version,1)
      assert.deepEqual((await db.query('SELECT label FROM ministry_schedules WHERE schedule_id=$1',
        ['S-V124-RETRACTED'])).rows[0],{ label:'Ibadah Pagi Revisi' })
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM ministry_schedule_assignments WHERE schedule_id=$1',
        ['S-V124-RETRACTED'])).rows[0].n,0)

      const attendanceMonth = await create(db, [
        { ...original[0], service_date:'2027-05-02' },
        { ...original[1], service_date:'2027-05-09' },
      ], '2027-05-01')
      const attendanceSchedule = (await db.query('SELECT get_service_schedule_month($1) AS data',
        [attendanceMonth])).rows[0].data
      const toRemove = attendanceSchedule.occurrences.find(item => item.service_date === '2027-05-09')
      await db.query('INSERT INTO ministry_schedules(schedule_id,source_occurrence_id) VALUES ($1,$2)',
        ['S-V124-ATTENDANCE',toRemove.occurrence_id])
      await db.query('INSERT INTO ministry_attendance(attendance_id,schedule_id) VALUES ($1,$2)',
        ['A-V124','S-V124-ATTENDANCE'])
      const retained = attendanceSchedule.occurrences.find(item => item.service_date === '2027-05-02')
      await reject(() => db.query(
        'SELECT update_service_schedule_month_draft_v124($1,$2,$3::JSONB,$4::JSONB,$5)',
        [attendanceMonth,0,JSON.stringify([{ ...original[0], service_date:'2027-05-02',
          occurrence_id:retained.occurrence_id }]),'[]',null]), /kehadiran tercatat/)
      assert.equal((await db.query('SELECT count(*)::INT AS n FROM service_schedule_occurrences WHERE month_id=$1',
        [attendanceMonth])).rows[0].n,2)

      const swapMonth = await create(db, [
        { ...original[0], service_date:'2027-07-04' },
        { ...original[1], service_date:'2027-07-11' },
      ], '2027-07-01')
      const swapBefore = (await db.query('SELECT get_service_schedule_month($1) AS data',
        [swapMonth])).rows[0].data
      const swapped = swapBefore.occurrences.map(item => ({ ...original[0],
        occurrence_id:item.occurrence_id,
        service_date:item.service_date === '2027-07-04' ? '2027-07-11' : '2027-07-04' }))
      assert.equal((await db.query(
        'SELECT update_service_schedule_month_draft_v124($1,$2,$3::JSONB,$4::JSONB,$5) AS version',
        [swapMonth,0,JSON.stringify(swapped),'[]',null])).rows[0].version,1)
      const swapAfter = (await db.query('SELECT get_service_schedule_month($1) AS data',
        [swapMonth])).rows[0].data
      assert.equal(swapAfter.occurrences.find(item => item.occurrence_id === swapBefore.occurrences[0].occurrence_id).service_date,
        swapBefore.occurrences[0].service_date === '2027-07-04' ? '2027-07-11' : '2027-07-04')
    })
    await db.exec('ROLLBACK')
  } finally { await db.close() }
})

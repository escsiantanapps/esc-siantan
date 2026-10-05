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
    CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
  `)
  for (const version of [95, 96, 97, 98]) await db.exec(migration(version))
  await db.exec(directMigration)
  await db.exec(cleanupMigration)
  await db.exec(`
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
    await db.exec('ROLLBACK')
  } finally { await db.close() }
})

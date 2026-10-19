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

test('v111-v112: jadwal kosong, catatan nama, absensi, dan akses Admin per Ministry', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id UUID PRIMARY KEY);
      CREATE TABLE users(user_id TEXT PRIMARY KEY, auth_id UUID REFERENCES auth.users(id),
        name TEXT NOT NULL, photo_url TEXT, status TEXT NOT NULL DEFAULT 'Aktif', role TEXT DEFAULT 'Volunteer', role_secondary TEXT);
      CREATE TABLE ministries(ministry_id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE events(event_id TEXT PRIMARY KEY);
      CREATE TABLE classes(class_id TEXT PRIMARY KEY);
      CREATE TABLE user_ministries(user_id TEXT REFERENCES users(user_id), ministry_id TEXT REFERENCES ministries(ministry_id), PRIMARY KEY(user_id,ministry_id));
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN NULLIF(current_setting('test.caller_id', true), '') IS NOT NULL
          THEN '00000000-0000-4000-8000-000000000001'::UUID ELSE NULL END
      $$;
      CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT NULLIF(current_setting('test.caller_role', true), '') $$;
      CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT NULLIF(current_setting('test.caller_id', true), '') $$;
      CREATE FUNCTION auth_admin_can(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
        SELECT COALESCE(NULLIF(current_setting('test.caller_role', true), '') IN ('Admin','Super Admin'), false)
          AND COALESCE(NULLIF(current_setting('test.restricted', true), ''), '0') <> '1' $$;
      CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    `)
    for (const version of [95, 96, 97, 98, 102, 103, 107, 108]) await db.exec(migration(version))
    await db.exec(`
      CREATE TABLE ministry_schedules(schedule_id TEXT PRIMARY KEY DEFAULT 'MSCH-' || replace(gen_random_uuid()::text,'-',''),
        ministry_id TEXT, service_date DATE NOT NULL, start_time TIME NOT NULL, label TEXT, created_by TEXT);
      CREATE TABLE ministry_schedule_assignments(schedule_id TEXT NOT NULL REFERENCES ministry_schedules(schedule_id),
        user_id TEXT NOT NULL REFERENCES users(user_id), PRIMARY KEY(schedule_id,user_id));
      CREATE TABLE ministry_attendance(attendance_id TEXT PRIMARY KEY, schedule_id TEXT REFERENCES ministry_schedules(schedule_id),
        user_id TEXT REFERENCES users(user_id));
      INSERT INTO auth.users(id) VALUES ('00000000-0000-4000-8000-000000000001');
      INSERT INTO users(user_id,name,role,auth_id) VALUES
        ('ADMIN','Admin QA','Admin','00000000-0000-4000-8000-000000000001'),
        ('ADMIN-MH','Admin MH','Admin',NULL),('VOL','Pelayan','Volunteer',NULL),
        ('VOL2','Pelayan Lain','Volunteer',NULL);
      INSERT INTO ministries(ministry_id,name) VALUES ('MUSIC','Music'),('OTHER','Other');
      ALTER TABLE ministries ADD COLUMN head_user_id TEXT;
      UPDATE ministries SET head_user_id='ADMIN-MH' WHERE ministry_id='MUSIC';
      INSERT INTO user_ministries(user_id,ministry_id) VALUES ('ADMIN-MH','MUSIC'),('VOL','MUSIC'),('VOL2','OTHER');
      INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots)
        VALUES ('P-KEYS','MUSIC','Keyboard',1),('P-OTHER','OTHER','Other Job',1);
    `)
    await db.exec(migration(111))
    await db.exec(migration(111))
    await db.exec('BEGIN')
    await db.query("SELECT set_config('test.caller_id','ADMIN',true),set_config('test.caller_role','Admin',true)")
    const month = (await db.query(`SELECT create_service_schedule_month_direct('2027-10-01',
      '[{"section_id":"pagi","service_date":"2027-10-03","title":"Ibadah Pagi","source_type":"Ibadah","start_time":"09:00","end_time":"11:00","ministry_ids":["MUSIC"]}]'::jsonb) AS id`)).rows[0].id
    const roster = (await db.query(`SELECT p.roster_id FROM service_schedule_parts p
      JOIN service_schedule_occurrences o ON o.occurrence_id=p.occurrence_id WHERE o.month_id=$1`, [month])).rows[0].roster_id
    await db.query('SELECT publish_service_schedule_month_v111($1)', [month])
    const sessions = await db.query(`SELECT s.schedule_id, s.source_status, count(a.user_id)::INT AS assigned
      FROM ministry_schedules s LEFT JOIN ministry_schedule_assignments a ON a.schedule_id=s.schedule_id
      GROUP BY s.schedule_id,s.source_status`)
    assert.equal(sessions.rows.length, 1)
    assert.equal(sessions.rows[0].source_status, 'Terbit')
    assert.equal(sessions.rows[0].assigned, 0)
    await db.exec('SAVEPOINT expected_schedule_guard')
    await assert.rejects(db.query(`UPDATE ministry_schedules SET label='Manual' WHERE schedule_id=$1`, [sessions.rows[0].schedule_id]), /mengikuti Jadwal Pelayanan/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_schedule_guard; RELEASE SAVEPOINT expected_schedule_guard')
    await db.query(`INSERT INTO admin_ministry_schedule_access(ministry_id,user_id) VALUES ('MUSIC','ADMIN-MH')`)
    const scoped = await db.query(`SELECT auth_admin_mh_monthly_ministry_v111('MUSIC') AS permitted`)
    assert.equal(scoped.rows[0].permitted, false)
    await db.query("SELECT set_config('test.caller_id','ADMIN-MH',true),set_config('test.restricted','1',true)")
    assert.equal((await db.query(`SELECT auth_admin_mh_monthly_ministry_v111('MUSIC') AS permitted`)).rows[0].permitted, true)
    await db.exec('SAVEPOINT restricted_grant_write')
    await db.exec('SET LOCAL ROLE authenticated')
    assert.equal((await db.query(`UPDATE admin_ministry_schedule_access SET is_active=false
      WHERE ministry_id='MUSIC' AND user_id='ADMIN-MH' RETURNING user_id`)).rows.length, 0)
    await db.exec('ROLLBACK TO SAVEPOINT restricted_grant_write; RELEASE SAVEPOINT restricted_grant_write')
    await db.exec('SAVEPOINT expected_published_guard')
    await assert.rejects(db.query(`SELECT set_service_schedule_position_v111($1,'P-KEYS',ARRAY['VOL']::TEXT[],ARRAY[]::TEXT[],'{"VOL":"MD"}'::JSONB)`, [roster]), /Hanya jadwal Draft/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_published_guard; RELEASE SAVEPOINT expected_published_guard')

    await db.query("SELECT set_config('test.caller_id','ADMIN',true),set_config('test.restricted','0',true)")
    const monthWithPeople = (await db.query(`SELECT create_service_schedule_month_direct('2027-11-01',
      '[{"section_id":"pagi","service_date":"2027-11-07","title":"Ibadah Pagi","source_type":"Ibadah","start_time":"09:00","end_time":"11:00","ministry_ids":["MUSIC","OTHER"]}]'::jsonb) AS id`)).rows[0].id
    const rosters = (await db.query(`SELECT p.ministry_id,p.roster_id FROM service_schedule_parts p
      JOIN service_schedule_occurrences o ON o.occurrence_id=p.occurrence_id WHERE o.month_id=$1`, [monthWithPeople])).rows
    const musicRoster = rosters.find(row => row.ministry_id === 'MUSIC').roster_id
    const otherRoster = rosters.find(row => row.ministry_id === 'OTHER').roster_id
    await db.query("SELECT set_config('test.caller_id','ADMIN-MH',true),set_config('test.restricted','1',true)")
    const scopedMonth = (await db.query('SELECT get_service_schedule_month_v111($1) AS data', [monthWithPeople])).rows[0].data
    assert.deepEqual(scopedMonth.rosters.map(row => row.ministry_id), ['MUSIC'])
    await db.exec('SAVEPOINT expected_other_ministry_guard')
    await assert.rejects(db.query(`SELECT set_service_schedule_position_v111($1,'P-OTHER',ARRAY[]::TEXT[],ARRAY[]::TEXT[],'{}'::JSONB)`, [otherRoster]), /not_authorized/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_other_ministry_guard; RELEASE SAVEPOINT expected_other_ministry_guard')
    await db.query(`SELECT set_service_schedule_position_v111($1,'P-KEYS',ARRAY['VOL']::TEXT[],ARRAY[]::TEXT[],'{"VOL":"MD"}'::JSONB)`, [musicRoster])
    assert.equal((await db.query(`SELECT assignment_note FROM service_roster_slots WHERE roster_id=$1 AND user_id='VOL'`, [musicRoster])).rows[0].assignment_note, 'MD')
    await db.query("SELECT set_config('test.restricted','0',true)")
    const stillScoped = (await db.query('SELECT get_service_schedule_month_v111($1) AS data', [monthWithPeople])).rows[0].data
    assert.deepEqual(stillScoped.rosters.map(row => row.ministry_id), ['MUSIC'])
    await db.exec('SAVEPOINT expected_global_bypass_guard')
    await assert.rejects(db.query(`SELECT set_service_schedule_position($1,'P-OTHER',ARRAY['VOL2']::TEXT[],ARRAY[]::TEXT[])`, [otherRoster]), /Admin MH hanya boleh/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_global_bypass_guard; RELEASE SAVEPOINT expected_global_bypass_guard')
    await db.query("SELECT set_config('test.caller_id','ADMIN',true),set_config('test.restricted','0',true)")
    const oldSlot = (await db.query(`SELECT slot_id FROM service_roster_slots WHERE roster_id=$1 AND user_id='VOL'`, [musicRoster])).rows[0].slot_id
    await db.exec(`UPDATE ministry_service_positions SET is_active=false WHERE position_id='P-KEYS';
      INSERT INTO ministry_service_positions(position_id,ministry_id,name,default_slots) VALUES ('P-NEW','MUSIC','Drum',1);`)
    const catalog = (await db.query(`SELECT jsonb_object_agg(ministry_id, positions) AS value FROM (
      SELECT ministry_id,jsonb_object_agg(position_id,jsonb_build_object('name',name,'capacity',default_slots,'sort_order',sort_order)) AS positions
      FROM ministry_service_positions WHERE is_active GROUP BY ministry_id) active`)).rows[0].value
    const version = (await db.query(`SELECT version FROM service_schedule_months WHERE month_id=$1`, [monthWithPeople])).rows[0].version
    await db.query(`SELECT reassign_and_sync_service_schedule_draft_positions_v111($1,$2,$3::JSONB,$4::JSONB)`,
      [monthWithPeople, version, JSON.stringify(catalog), JSON.stringify([{ slot_id: oldSlot, user_id: 'VOL', position_id: 'P-NEW' }])])
    assert.equal((await db.query(`SELECT assignment_note FROM service_roster_slots WHERE roster_id=$1 AND position_id='P-NEW' AND user_id='VOL'`, [musicRoster])).rows[0].assignment_note, 'MD')
    await db.query('SELECT publish_service_schedule_month_v111($1)', [monthWithPeople])
    const assignment = await db.query(`SELECT a.user_id FROM ministry_schedule_assignments a
      JOIN ministry_schedules s ON s.schedule_id=a.schedule_id
      JOIN service_schedule_occurrences o ON o.occurrence_id=s.source_occurrence_id
      WHERE o.month_id=$1`, [monthWithPeople])
    assert.deepEqual(assignment.rows.map(row => row.user_id), ['VOL'])
    await db.query('SELECT cancel_service_schedule_month($1)', [monthWithPeople])
    const cancelled = (await db.query(`SELECT s.schedule_id,s.source_status FROM ministry_schedules s
      JOIN service_schedule_occurrences o ON o.occurrence_id=s.source_occurrence_id
      WHERE o.month_id=$1`, [monthWithPeople])).rows[0]
    assert.equal(cancelled.source_status, 'Dibatalkan')
    await db.exec('SAVEPOINT expected_cancelled_scan')
    await assert.rejects(db.query(`INSERT INTO ministry_attendance(attendance_id,schedule_id,user_id) VALUES ('QA-ABSEN',$1,'VOL')`, [cancelled.schedule_id]), /dibatalkan/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_cancelled_scan; RELEASE SAVEPOINT expected_cancelled_scan')

    // v112 mempertahankan akses per grant, tetapi Admin anggota tidak harus MH.
    await db.exec(migration(112))
    await db.exec(migration(112))
    await db.exec('BEGIN')
    await db.query("SELECT set_config('test.caller_id','ADMIN',true),set_config('test.caller_role','Admin',true),set_config('test.restricted','0',true)")
    await db.query(`INSERT INTO users(user_id,name,role) VALUES ('ADMIN-KIDS','Admin Kids','Admin')`)
    await db.query(`INSERT INTO user_ministries(user_id,ministry_id) VALUES ('ADMIN-KIDS','OTHER')`)
    await db.exec('SAVEPOINT expected_nonmember_grant')
    await assert.rejects(db.query(`INSERT INTO admin_ministry_schedule_access(ministry_id,user_id)
      VALUES ('MUSIC','ADMIN-KIDS')`), /anggota Ministry ini/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_nonmember_grant; RELEASE SAVEPOINT expected_nonmember_grant')
    await db.query(`INSERT INTO admin_ministry_schedule_access(ministry_id,user_id)
      VALUES ('OTHER','ADMIN-KIDS')`)
    const memberMonth = (await db.query(`SELECT create_service_schedule_month_direct('2027-12-01',
      '[{"section_id":"kids","service_date":"2027-12-05","title":"Ibadah Kids","source_type":"Ibadah","start_time":"09:00","end_time":"11:00","ministry_ids":["MUSIC","OTHER"]}]'::jsonb) AS id`)).rows[0].id
    const memberRosters = (await db.query(`SELECT p.ministry_id,p.roster_id FROM service_schedule_parts p
      JOIN service_schedule_occurrences o ON o.occurrence_id=p.occurrence_id WHERE o.month_id=$1`, [memberMonth])).rows
    await db.query("SELECT set_config('test.caller_id','ADMIN-KIDS',true),set_config('test.restricted','1',true)")
    assert.equal((await db.query(`SELECT auth_admin_mh_monthly_ministry_v111('OTHER') AS permitted`)).rows[0].permitted, true)
    assert.equal((await db.query(`SELECT auth_admin_mh_monthly_ministry_v111('MUSIC') AS permitted`)).rows[0].permitted, false)
    const memberView = (await db.query('SELECT get_service_schedule_month_v111($1) AS data', [memberMonth])).rows[0].data
    assert.deepEqual(memberView.rosters.map(row => row.ministry_id), ['OTHER'])
    const kidsRoster = memberRosters.find(row => row.ministry_id === 'OTHER').roster_id
    const musicRosterForMember = memberRosters.find(row => row.ministry_id === 'MUSIC').roster_id
    await db.query(`SELECT set_service_schedule_position_v111($1,'P-OTHER',ARRAY['VOL2']::TEXT[],ARRAY[]::TEXT[],'{}'::JSONB)`, [kidsRoster])
    await db.exec('SAVEPOINT expected_ungranted_ministry')
    await assert.rejects(db.query(`SELECT set_service_schedule_position_v111($1,'P-NEW',ARRAY[]::TEXT[],ARRAY[]::TEXT[],'{}'::JSONB)`, [musicRosterForMember]), /not_authorized/)
    await db.exec('ROLLBACK TO SAVEPOINT expected_ungranted_ministry; RELEASE SAVEPOINT expected_ungranted_ministry')
    await db.query(`DELETE FROM user_ministries WHERE user_id='ADMIN-KIDS' AND ministry_id='OTHER'`)
    assert.equal((await db.query(`SELECT auth_admin_mh_monthly_ministry_v111('OTHER') AS permitted`)).rows[0].permitted, false)
  } finally { await db.close() }
})

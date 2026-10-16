import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const v106Start = schema.lastIndexOf('-- ── Migrasi v106:')
const v107Start = schema.indexOf('-- ── Migrasi v107:', v106Start)
const migration = schema.slice(v106Start, v107Start < 0 ? undefined : v107Start)

async function caller(db, id, role) {
  await db.query("SELECT set_config('test.caller_id',$1,false), set_config('test.caller_role',$2,false)", [id, role])
}

test('Migrasi v106 menegakkan keanggotaan pada akses, penugasan, dan terbit', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE TABLE users(user_id TEXT PRIMARY KEY, name TEXT, photo_url TEXT,
        status TEXT, role TEXT, role_secondary TEXT);
      CREATE TABLE ministries(ministry_id TEXT PRIMARY KEY, head_user_id TEXT);
      CREATE TABLE user_ministries(user_id TEXT REFERENCES users(user_id),
        ministry_id TEXT REFERENCES ministries(ministry_id), PRIMARY KEY(user_id,ministry_id));
      CREATE TABLE ministry_schedule_managers(ministry_id TEXT, user_id TEXT,
        is_active BOOLEAN, manager_role TEXT);
      CREATE TABLE service_rosters(roster_id TEXT PRIMARY KEY, ministry_id TEXT, status TEXT);
      CREATE TABLE service_roster_slots(slot_id TEXT PRIMARY KEY, roster_id TEXT,
        ministry_id TEXT, user_id TEXT);
      CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.caller_id',true),'')
      $$;
      CREATE FUNCTION auth_service_schedule_admin() RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
        SELECT current_setting('test.caller_role',true) = 'Admin'
      $$;
      INSERT INTO users VALUES
        ('ADMIN','Admin',NULL,'Aktif','Admin',NULL),
        ('WAKIL','Wakil',NULL,'Aktif','Volunteer',NULL),
        ('ANGGOTA','Anggota',NULL,'Aktif','Jemaat',NULL),
        ('LUAR','Orang Luar',NULL,'Aktif','Volunteer',NULL);
      INSERT INTO ministries VALUES ('M1',NULL),('M2',NULL);
      INSERT INTO user_ministries VALUES ('WAKIL','M1'),('ANGGOTA','M1'),('LUAR','M2');
      INSERT INTO ministry_schedule_managers VALUES ('M1','WAKIL',true,'Wakil'),
        ('M1','LUAR',true,'Wakil');
      INSERT INTO service_rosters VALUES ('R1','M1','Draft');
      INSERT INTO service_roster_slots VALUES ('S1','R1','M1',NULL);
    `)
    await db.exec(migration)
    await db.exec(migration)
    const triggers = await db.query("SELECT count(*)::INTEGER AS total FROM pg_trigger WHERE tgname LIKE 'trg_schedule_membership_%_v106'")
    assert.equal(triggers.rows[0].total, 3)

    await caller(db, 'WAKIL', 'Volunteer')
    assert.equal((await db.query("SELECT auth_manages_ministry('M1') AS allowed")).rows[0].allowed, true)
    await caller(db, 'LUAR', 'Volunteer')
    assert.equal((await db.query("SELECT auth_manages_ministry('M1') AS allowed")).rows[0].allowed, false)

    await caller(db, 'ADMIN', 'Admin')
    await assert.rejects(db.exec("INSERT INTO ministry_schedule_managers VALUES ('M1','LUAR',true,'Wakil')"), /schedule_ministry_membership_required/)
    await assert.rejects(db.exec("UPDATE service_roster_slots SET user_id='LUAR' WHERE slot_id='S1'"), /schedule_ministry_membership_required/)
    await db.exec("UPDATE service_roster_slots SET user_id='ANGGOTA' WHERE slot_id='S1'")
    await db.exec("DELETE FROM user_ministries WHERE user_id='ANGGOTA' AND ministry_id='M1'")
    await assert.rejects(db.exec("UPDATE service_rosters SET status='Terbit' WHERE roster_id='R1'"), /schedule_ministry_membership_required/)
    await db.exec("UPDATE service_roster_slots SET user_id=NULL WHERE slot_id='S1'")
    await db.exec("UPDATE service_rosters SET status='Terbit' WHERE roster_id='R1'")
  } finally { await db.close() }
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = schema.slice(schema.indexOf('-- ── Migrasi v113:'), schema.indexOf('-- ── Migrasi v114:'))
assert.ok(migration.startsWith('-- ── Migrasi v113:'), 'Migrasi v113 harus ada di akhir schema')

const policies = [
  ['admin_permissions', 'admin_permissions_read', 'SELECT'],
  ['admin_permissions', 'admin_permissions_super_admin_write', 'ALL'],
  ['app_settings', 'app_settings_super_admin_all', 'ALL'],
  ['baptism_registrations', 'baptism_admin_all', 'ALL'],
  ['class_attendance', 'class_attendance_admin_all', 'ALL'],
  ['event_registrations', 'event_registrations_admin_read', 'SELECT'],
  ['events', 'events_admin_write', 'ALL'],
  ['form_templates', 'templates_admin_write', 'ALL'],
  ['komsel_attendance', 'attendance_admin_read', 'SELECT'],
  ['komsel_attendance', 'attendance_pks_manage', 'ALL'],
  ['news', 'news_admin_write', 'ALL'],
  ['users', 'users_admin_write', 'UPDATE'],
  ['wedding_registrations', 'wedding_admin_all', 'ALL'],
]

async function caller(db, id) {
  await db.query("SELECT set_config('test.auth_id',$1,true)", [id])
}
async function visible(db, table) {
  await db.exec('SET ROLE authenticated')
  try { return (await db.query(`SELECT count(1)::INTEGER AS total FROM ${table}`)).rows[0].total }
  finally { await db.exec('RESET ROLE') }
}

test('PostgreSQL: akun Nonaktif kehilangan hak Admin dan PKS, tetapi tetap melihat profil sendiri', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.auth_id', true), '')::UUID
      $$;
      CREATE TABLE users (
        user_id TEXT PRIMARY KEY, auth_id UUID UNIQUE, role TEXT NOT NULL,
        role_secondary TEXT, status TEXT NOT NULL, is_pks BOOLEAN DEFAULT false,
        komsel_id TEXT, points INTEGER DEFAULT 0,
        biodata_points_awarded BOOLEAN DEFAULT false
      );
      CREATE TABLE komsel_leaders (komsel_id TEXT, user_id TEXT);
      CREATE TABLE admin_permissions (id TEXT PRIMARY KEY);
      CREATE TABLE app_settings (id TEXT PRIMARY KEY);
      CREATE TABLE baptism_registrations (id TEXT PRIMARY KEY);
      CREATE TABLE class_attendance (id TEXT PRIMARY KEY);
      CREATE TABLE event_registrations (id TEXT PRIMARY KEY);
      CREATE TABLE events (id TEXT PRIMARY KEY);
      CREATE TABLE form_templates (id TEXT PRIMARY KEY);
      CREATE TABLE komsel_attendance (id TEXT PRIMARY KEY, komsel_id TEXT);
      CREATE TABLE news (id TEXT PRIMARY KEY);
      CREATE TABLE wedding_registrations (id TEXT PRIMARY KEY);
      INSERT INTO users(user_id,auth_id,role,role_secondary,status,is_pks,komsel_id) VALUES
        ('ADMIN-A','00000000-0000-4000-8000-000000000001','Admin',NULL,'Aktif',false,NULL),
        ('ADMIN-N','00000000-0000-4000-8000-000000000002','Admin',NULL,'Nonaktif',false,NULL),
        ('SUPER-N','00000000-0000-4000-8000-000000000003','Super Admin',NULL,'Nonaktif',false,NULL),
        ('PKS-A','00000000-0000-4000-8000-000000000004','PKS',NULL,'Aktif',true,'K1'),
        ('PKS-N','00000000-0000-4000-8000-000000000005','PKS',NULL,'Nonaktif',true,'K1');
      INSERT INTO komsel_leaders VALUES ('K1','PKS-A'),('K1','PKS-N');
      INSERT INTO admin_permissions VALUES ('P1');
      INSERT INTO events VALUES ('E1');
      INSERT INTO komsel_attendance VALUES ('A1','K1');
      GRANT USAGE ON SCHEMA public,auth TO authenticated;
    `)
    for (const [table, policy, command] of policies) {
      await db.exec(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${policy} ON ${table} FOR ${command} USING (true)
        ${command === 'SELECT' ? '' : 'WITH CHECK (true)'};
        GRANT SELECT,INSERT,UPDATE,DELETE ON ${table} TO authenticated;`)
    }
    await db.exec(`CREATE POLICY users_read_self ON users FOR SELECT
      USING (auth_id = auth.uid())`)
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('BEGIN')
    try {
      await t.test('Admin Aktif tetap dapat membaca area Admin', async () => {
        await caller(db, '00000000-0000-4000-8000-000000000001')
        assert.equal((await db.query('SELECT auth_user_role() AS role')).rows[0].role, 'Admin')
        assert.equal(await visible(db, 'admin_permissions'), 1)
        assert.equal(await visible(db, 'events'), 1)
      })
      await t.test('Admin dan Super Admin Nonaktif kehilangan hak role', async () => {
        await caller(db, '00000000-0000-4000-8000-000000000002')
        assert.equal((await db.query('SELECT auth_user_role() AS role')).rows[0].role, 'Nonaktif')
        assert.equal(await visible(db, 'admin_permissions'), 0)
        assert.equal(await visible(db, 'events'), 0)
        assert.equal(await visible(db, 'users'), 1)
        await caller(db, '00000000-0000-4000-8000-000000000003')
        assert.equal(await visible(db, 'admin_permissions'), 0)
      })
      await t.test('PKS Nonaktif tidak dapat melihat data komsel melalui hak PKS', async () => {
        await caller(db, '00000000-0000-4000-8000-000000000004')
        assert.equal((await db.query('SELECT auth_user_is_pks() AS pks,auth_leads_komsel($1) AS leads', ['K1'])).rows[0].pks, true)
        assert.equal(await visible(db, 'komsel_attendance'), 1)
        await caller(db, '00000000-0000-4000-8000-000000000005')
        assert.deepEqual((await db.query('SELECT auth_user_is_pks() AS pks,auth_leads_komsel($1) AS leads', ['K1'])).rows[0], { pks: false, leads: false })
        assert.equal(await visible(db, 'komsel_attendance'), 0)
        assert.equal(await visible(db, 'users'), 1)
      })
    } finally { await db.exec('ROLLBACK') }
  } finally { await db.close() }
})

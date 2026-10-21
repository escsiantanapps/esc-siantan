import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const v118 = schema.slice(schema.indexOf('-- ── Migrasi v118:'), schema.indexOf('-- ── Migrasi v119:'))
assert.ok(v118.startsWith('-- ── Migrasi v118:'))

test('v118: MH menerima anggota aktif non-Jemaat dan menolak Jemaat atau Nonaktif', async () => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.auth_id',true),'')::UUID $$;
      CREATE TABLE users(user_id TEXT PRIMARY KEY, auth_id UUID, role TEXT, status TEXT);
      CREATE TABLE user_ministries(user_id TEXT, ministry_id TEXT);
      CREATE TABLE ministries(ministry_id TEXT PRIMARY KEY, head_user_id TEXT, name TEXT);
      CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT user_id FROM users WHERE auth_id=auth.uid()$$;
      CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT role FROM users WHERE auth_id=auth.uid() AND status='Aktif'$$;
      CREATE FUNCTION auth_admin_can(page TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT auth_user_role()='Admin' AND page='/admin/ministry'$$;
      CREATE FUNCTION guard_ministry_head_source() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RETURN NEW; END $$;
      CREATE TRIGGER trg_guard_ministry_head_source BEFORE INSERT OR UPDATE ON ministries
        FOR EACH ROW EXECUTE FUNCTION guard_ministry_head_source();
      INSERT INTO users VALUES
        ('ACTOR','00000000-0000-4000-8000-000000000001','Admin','Aktif'),
        ('VOL',NULL,'Volunteer','Aktif'),('PKS',NULL,'PKS','Aktif'),
        ('ADMIN',NULL,'Admin','Aktif'),('SUPER',NULL,'Super Admin','Aktif'),
        ('PASTOR',NULL,'Gembala','Aktif'),('MEMBER',NULL,'Jemaat','Aktif'),
        ('INACTIVE',NULL,'Volunteer','Nonaktif');
      INSERT INTO ministries VALUES ('M1',NULL,'Ministry Uji');
      SELECT set_config('test.auth_id','00000000-0000-4000-8000-000000000001',false);
    `)
    await db.exec(v118)
    await db.exec(v118)
    for (const userId of ['VOL', 'PKS', 'ADMIN', 'SUPER', 'PASTOR']) {
      const result = await db.query("UPDATE ministries SET head_user_id=$1 WHERE ministry_id='M1' RETURNING head_user_id", [userId])
      assert.equal(result.rows[0].head_user_id, userId)
    }
    await assert.rejects(db.query("UPDATE ministries SET head_user_id='MEMBER' WHERE ministry_id='M1'"), /bukan Jemaat/)
    await assert.rejects(db.query("UPDATE ministries SET head_user_id='INACTIVE' WHERE ministry_id='M1'"), /bukan Jemaat/)
    assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, 'PASTOR')
  } finally { await db.close() }
})

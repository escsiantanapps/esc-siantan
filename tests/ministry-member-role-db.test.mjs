import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const headers = [...schema.matchAll(/^--[^\r\n]*Migrasi v(\d+):[^\r\n]*$/gm)]
function migration(version) {
  const index = headers.findIndex(header => Number(header[1]) === version)
  assert.notEqual(index, -1, `Migrasi v${version} tidak ditemukan`)
  return schema.slice(headers[index].index, headers[index + 1]?.index ?? schema.length)
}
const previousGuard = migration(45).match(/CREATE OR REPLACE FUNCTION guard_user_privilege_cols\(\) RETURNS trigger[\s\S]*?END \$\$;/)?.[0]
assert.ok(previousGuard, 'Guard role v45 harus tersedia untuk fixture')

async function caller(db, id, pages = '/admin/ministry') {
  await db.query("SELECT set_config('test.caller_id',$1,true),set_config('test.pages',$2,true)", [id, pages])
}
async function rejected(db, sql, values, pattern) {
  await db.exec('SAVEPOINT expected_rejection')
  try { await assert.rejects(db.query(sql, values), pattern) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}
async function add(db, ministryId, userId) {
  return (await db.query('SELECT * FROM add_ministry_member($1,$2)', [ministryId, userId])).rows[0]
}
async function state(db, id, ministryId = 'M1') {
  return (await db.query(`SELECT u.role,u.role_secondary,u.status,
    EXISTS(SELECT 1 FROM user_ministries um WHERE um.user_id=u.user_id AND um.ministry_id=$2) AS member
    FROM users u WHERE u.user_id=$1`, [id, ministryId])).rows[0]
}
async function setup(db) {
  // Seluruh identitas fiktif; PGlite tidak terhubung ke Supabase.
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE users (
      user_id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL,
      role_secondary TEXT, status TEXT NOT NULL DEFAULT 'Aktif',
      is_pks BOOLEAN DEFAULT false, sp_level TEXT, sp_notes TEXT,
      komsel_id TEXT, points INTEGER DEFAULT 0,
      biodata_points_awarded BOOLEAN DEFAULT false, nij TEXT,
      membership_card_url TEXT, membership_card_issued_at TIMESTAMPTZ
    );
    CREATE TABLE ministries (ministry_id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE user_ministries (
      user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
      ministry_id TEXT NOT NULL REFERENCES ministries(ministry_id) ON DELETE CASCADE,
      PRIMARY KEY(user_id,ministry_id)
    );
    CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT NULLIF(current_setting('test.caller_id',true),'')
    $$;
    CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT role FROM users WHERE user_id=auth_user_id()
    $$;
    CREATE FUNCTION auth_admin_can(page TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT COALESCE(auth_user_role()='Super Admin' OR
        (auth_user_role()='Admin' AND page=ANY(string_to_array(current_setting('test.pages',true),','))),false)
    $$;
    CREATE FUNCTION auth_leads_komsel(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT false $$;
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
      SELECT CASE WHEN auth_user_id() IS NOT NULL THEN
        '00000000-0000-4000-8000-000000000001'::UUID ELSE NULL END
    $$;
    CREATE FUNCTION record_audit() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    GRANT USAGE ON SCHEMA public,auth TO authenticated,anon;
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_ministries ENABLE ROW LEVEL SECURITY;
    CREATE POLICY users_read ON users FOR SELECT USING (true);
    CREATE POLICY users_write ON users FOR UPDATE USING (true) WITH CHECK (true);
    CREATE POLICY um_select ON user_ministries FOR SELECT USING (
      auth_user_role() IN ('Admin','Super Admin') OR user_id=auth_user_id() OR
      EXISTS (SELECT 1 FROM users u WHERE u.user_id=user_ministries.user_id
        AND u.komsel_id IS NOT NULL AND auth_leads_komsel(u.komsel_id))
    );
    CREATE POLICY um_admin_write ON user_ministries FOR ALL
      USING (auth_user_role() IN ('Admin','Super Admin'))
      WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));
    CREATE POLICY um_self_write ON user_ministries FOR ALL
      USING (user_id=auth_user_id()) WITH CHECK (user_id=auth_user_id());
    GRANT SELECT,UPDATE ON users TO authenticated;
    GRANT SELECT,INSERT,UPDATE,DELETE ON user_ministries TO authenticated;
    GRANT SELECT ON ministries TO authenticated;
    INSERT INTO users(user_id,name,role,role_secondary,status) VALUES
      ('ADMIN','Admin QA','Admin',NULL,'Aktif'),
      ('LIMITED','Admin terbatas QA','Admin',NULL,'Aktif'),
      ('INACTIVE-ADMIN','Admin nonaktif QA','Admin',NULL,'Nonaktif'),
      ('SUPER','Super Admin QA','Super Admin',NULL,'Aktif'),
      ('JEMAAT','Jemaat QA','Jemaat',NULL,'Aktif'),
      ('JEMAAT-PKS','Jemaat PKS QA','Jemaat','PKS','Aktif'),
      ('JEMAAT-2','Jemaat kedua QA','Jemaat',NULL,'Aktif'),
      ('VOL','Volunteer QA','Volunteer',NULL,'Aktif'),
      ('PKS','PKS QA','PKS',NULL,'Aktif'),
      ('INACTIVE','Jemaat nonaktif QA','Jemaat',NULL,'Nonaktif');
    INSERT INTO ministries(ministry_id,name) VALUES ('M1','Musik QA'),('M2','Kids QA');
  `)
  await db.exec(previousGuard)
  await db.exec(`CREATE TRIGGER trg_guard_user_privilege BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION guard_user_privilege_cols();
    CREATE FUNCTION guard_ministry_head_member_removal() RETURNS TRIGGER
      LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$;
    CREATE TRIGGER trg_guard_ministry_head_member_removal
      BEFORE DELETE ON user_ministries FOR EACH ROW
      EXECUTE FUNCTION guard_ministry_head_member_removal()`)
  await db.exec(migration(104))
}

test('PostgreSQL: penambahan anggota Ministry hanya mempromosikan Jemaat melalui Admin berizin', async t => {
  const db = new PGlite()
  try {
    await setup(db)
    await t.test('migrasi idempotent dan anon tidak dapat menjalankan RPC', async () => {
      await db.exec(migration(104))
      assert.deepEqual((await db.query(`SELECT
        has_function_privilege('anon','add_ministry_member(text,text)','EXECUTE') AS anon,
        has_function_privilege('authenticated','add_ministry_member(text,text)','EXECUTE') AS authenticated`)).rows[0],
      { anon: false, authenticated: true })
      const policies = (await db.query(`SELECT polname,polcmd FROM pg_policy
        WHERE polrelid='public.user_ministries'::regclass ORDER BY polname`)).rows
      assert.equal(policies.some(row => ['um_self_write','um_admin_write'].includes(row.polname)),false)
      assert.equal(policies.some(row => row.polcmd === 'a'),false)
    })
    await db.exec('BEGIN')
    try {
      await t.test('Admin berizin menambah anggota dan mempromosikan Jemaat atomik', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await add(db,'M1','JEMAAT')
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'JEMAAT'),
          { role: 'Volunteer', role_secondary: null, status: 'Aktif', member: true })
      })
      await t.test('role kedua tetap; satu orang boleh melayani di dua Ministry', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await add(db,'M1','JEMAAT-PKS')
        await add(db,'M2','JEMAAT-PKS')
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'JEMAAT-PKS'),
          { role: 'Volunteer', role_secondary: 'PKS', status: 'Aktif', member: true })
        assert.equal((await state(db,'JEMAAT-PKS','M2')).member,true)
      })
      await t.test('Admin tanpa akses gagal tanpa keanggotaan/promosi parsial', async () => {
        await caller(db,'LIMITED','/admin/jadwal-pelayanan')
        await db.exec('SET ROLE authenticated')
        await rejected(db,'SELECT * FROM add_ministry_member($1,$2)',['M1','JEMAAT-2'],/not_authorized|akses|izin/i)
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'JEMAAT-2'),
          { role: 'Jemaat', role_secondary: null, status: 'Aktif', member: false })
      })
      await t.test('Jemaat tidak dapat mendaftar diri lewat RPC atau PostgREST langsung', async () => {
        await caller(db,'JEMAAT-2','')
        await db.exec('SET ROLE authenticated')
        await rejected(db,'SELECT * FROM add_ministry_member($1,$2)',['M1','JEMAAT-2'],/not_authorized|akses|izin/i)
        await rejected(db,'INSERT INTO user_ministries(user_id,ministry_id) VALUES ($1,$2)',
          ['JEMAAT-2','M1'],/row-level security|permission denied/i)
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'JEMAAT-2'),
          { role: 'Jemaat', role_secondary: null, status: 'Aktif', member: false })
      })
      await t.test('Admin tidak dapat mempromosikan via UPDATE users atau GUC palsu', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await rejected(db,"UPDATE users SET role='Volunteer' WHERE user_id='JEMAAT-2'",[],/Hanya Super Admin/)
        await db.query("SELECT set_config('app.ministry_promote_user_id',$1,true),set_config('app.ministry_promote_ministry_id',$2,true)",
          ['JEMAAT-2','M1'])
        await rejected(db,"UPDATE users SET role='Volunteer' WHERE user_id='JEMAAT-2'",[],/Hanya Super Admin/)
        await db.query("SELECT set_config('app.ministry_promote_user_id','',true),set_config('app.ministry_promote_ministry_id','',true)")
        await db.exec('RESET ROLE')
        assert.equal((await state(db,'JEMAAT-2')).role,'Jemaat')
      })
      await t.test('INSERT langsung Admin juga ditolak; akun Admin nonaktif tidak dapat memakai RPC', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await rejected(db,'INSERT INTO user_ministries(user_id,ministry_id) VALUES ($1,$2)',
          ['JEMAAT-2','M1'],/row-level security|permission denied/i)
        await caller(db,'INACTIVE-ADMIN')
        await rejected(db,'SELECT * FROM add_ministry_member($1,$2)',
          ['M1','JEMAAT-2'],/not_authorized/)
        await db.exec('RESET ROLE')
        assert.equal((await state(db,'JEMAAT-2')).member,false)
      })
      await t.test('akun nonaktif ditolak, role lain tidak ditimpa', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await rejected(db,'SELECT * FROM add_ministry_member($1,$2)',['M1','INACTIVE'],/Aktif|aktif/)
        for (const id of ['VOL','PKS','ADMIN']) await add(db,'M1',id)
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'INACTIVE'),
          { role: 'Jemaat', role_secondary: null, status: 'Nonaktif', member: false })
        for (const [id, role] of [['VOL','Volunteer'],['PKS','PKS'],['ADMIN','Admin']]) {
          assert.equal((await state(db,id)).role,role)
          assert.equal((await state(db,id)).member,true)
        }
      })
      await t.test('gagal saat promosi membatalkan INSERT anggota pada transaksi yang sama', async () => {
        await db.exec('SAVEPOINT rollback_promotion')
        try {
          await db.exec(`CREATE FUNCTION qa_block_promotion() RETURNS TRIGGER LANGUAGE plpgsql AS $$
            BEGIN RAISE EXCEPTION 'simulasi gagal promosi'; END $$;
            CREATE TRIGGER qa_block_promotion BEFORE UPDATE OF role ON users
              FOR EACH ROW WHEN (OLD.user_id = 'JEMAAT-2')
              EXECUTE FUNCTION qa_block_promotion()`)
          await caller(db,'ADMIN')
          await db.exec('SET ROLE authenticated')
          await rejected(db,'SELECT * FROM add_ministry_member($1,$2)',
            ['M1','JEMAAT-2'],/simulasi gagal promosi/)
          await db.exec('RESET ROLE')
          assert.deepEqual(await state(db,'JEMAAT-2'),
            { role: 'Jemaat', role_secondary: null, status: 'Aktif', member: false })
        } finally {
          await db.exec('ROLLBACK TO SAVEPOINT rollback_promotion; RELEASE SAVEPOINT rollback_promotion; RESET ROLE')
        }
      })
      await t.test('keanggotaan lama Jemaat bisa dipromosikan tanpa menambah baris lagi', async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('JEMAAT-2','M2')")
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await add(db,'M2','JEMAAT-2')
        await db.exec('RESET ROLE')
        assert.deepEqual(await state(db,'JEMAAT-2','M2'),
          { role: 'Volunteer', role_secondary: null, status: 'Aktif', member: true })
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM user_ministries WHERE user_id='JEMAAT-2' AND ministry_id='M2'")).rows[0].n,1)
      })
      await t.test('penambahan ulang tidak menggandakan keanggotaan', async () => {
        await caller(db,'ADMIN')
        await db.exec('SET ROLE authenticated')
        await add(db,'M1','JEMAAT')
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM user_ministries WHERE user_id='JEMAAT' AND ministry_id='M1'")).rows[0].n,1)
      })
      await t.test('hapus mandiri dan Admin tanpa izin ditolak; Admin berizin menghapus tanpa demosi', async () => {
        await db.exec('SET ROLE authenticated')
        await caller(db,'JEMAAT','')
        assert.equal((await db.query("DELETE FROM user_ministries WHERE user_id='JEMAAT' AND ministry_id='M1' RETURNING *")).rows.length,0)
        await caller(db,'LIMITED','/admin/jadwal-pelayanan')
        assert.equal((await db.query("DELETE FROM user_ministries WHERE user_id='JEMAAT' AND ministry_id='M1' RETURNING *")).rows.length,0)
        await caller(db,'ADMIN')
        assert.equal((await db.query("DELETE FROM user_ministries WHERE user_id='JEMAAT' AND ministry_id='M1' RETURNING *")).rows.length,1)
        await db.exec('RESET ROLE')
        assert.equal((await state(db,'JEMAAT')).role,'Volunteer')
      })
      await t.test('Super Admin tetap dapat menambah anggota dan mengubah role umum', async () => {
        await caller(db,'SUPER','')
        await db.exec('SET ROLE authenticated')
        await add(db,'M2','VOL')
        await db.query("UPDATE users SET role_secondary='PKS' WHERE user_id='VOL'")
        await db.exec('RESET ROLE')
        assert.equal((await state(db,'VOL','M2')).member,true)
        assert.equal((await state(db,'VOL')).role_secondary,'PKS')
      })
    } finally { await db.exec('ROLLBACK; RESET ROLE') }
  } finally { await db.close() }
})

test('PostgreSQL: v104 menolak policy tambahan dan membatalkan seluruh perubahan migrasi', async () => {
  const db = new PGlite()
  try {
    await setup(db)
    await db.exec(previousGuard)
    await db.exec('CREATE POLICY unexpected_write ON user_ministries FOR INSERT WITH CHECK (true)')
    const before = (await db.query("SELECT pg_get_functiondef('guard_user_privilege_cols()'::regprocedure) AS definition")).rows[0].definition
    await assert.rejects(db.exec(migration(104)),/Policy user_ministries berbeda dari audit/)
    await db.exec('ROLLBACK')
    assert.equal((await db.query("SELECT pg_get_functiondef('guard_user_privilege_cols()'::regprocedure) AS definition")).rows[0].definition,before)
    assert.equal((await db.query("SELECT count(*)::INT AS n FROM pg_policy WHERE polrelid='user_ministries'::regclass AND polname='unexpected_write'")).rows[0].n,1)
  } finally { await db.close() }
})

test('PostgreSQL: v110 membuka promosi Admin Ministry tanpa membuka perubahan role langsung', async () => {
  const db = new PGlite()
  try {
    await setup(db)
    await db.exec(`
      ALTER TABLE users ADD COLUMN auth_id UUID;
      UPDATE users SET auth_id = md5(user_id)::UUID;
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT CASE WHEN auth_user_id() IS NOT NULL THEN md5(auth_user_id())::UUID ELSE NULL END
      $$;
      CREATE FUNCTION prevent_role_self_escalation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.role IS DISTINCT FROM OLD.role THEN
          IF NOT EXISTS (SELECT 1 FROM users WHERE auth_id = auth.uid() AND role = 'Super Admin') THEN
            RAISE EXCEPTION 'Hanya Super Admin yang dapat mengubah role pengguna';
          END IF;
        END IF;
        RETURN NEW;
      END $$;
      CREATE TRIGGER trg_prevent_role_escalation BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION prevent_role_self_escalation();
    `)

    await db.exec('BEGIN')
    try {
      await caller(db, 'ADMIN')
      await db.exec('SET ROLE authenticated')
      await rejected(db, 'SELECT * FROM add_ministry_member($1,$2)',
        ['M1', 'JEMAAT'], /Hanya Super Admin/)
      await db.exec('RESET ROLE')
      assert.deepEqual(await state(db, 'JEMAAT'),
        { role: 'Jemaat', role_secondary: null, status: 'Aktif', member: false })

      await db.exec('ROLLBACK')
      await db.exec(migration(110))
      await db.exec(migration(110))
      await db.exec('BEGIN')
      await caller(db, 'ADMIN')
      await db.exec('SET ROLE authenticated')
      await add(db, 'M1', 'JEMAAT')
      assert.deepEqual(await state(db, 'JEMAAT'),
        { role: 'Volunteer', role_secondary: null, status: 'Aktif', member: true })
      await rejected(db, "UPDATE users SET role='Volunteer' WHERE user_id='JEMAAT-2'", [],
        /Hanya Super Admin/)
      await caller(db, 'LIMITED', '/admin/jadwal-pelayanan')
      await rejected(db, 'SELECT * FROM add_ministry_member($1,$2)',
        ['M1', 'JEMAAT-2'], /not_authorized/)
      await db.exec('RESET ROLE')
      assert.deepEqual(await state(db, 'JEMAAT-2'),
        { role: 'Jemaat', role_secondary: null, status: 'Aktif', member: false })
    } finally { await db.exec('ROLLBACK; RESET ROLE') }
  } finally { await db.close() }
})

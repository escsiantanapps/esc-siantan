import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const headers = [...schema.matchAll(/^--[^\r\n]*Migrasi v(\d+):[^\r\n]*$/gm)]
function migration(version) {
  const index = headers.findIndex(header => Number(header[1]) === version)
  assert.notEqual(index, -1)
  return schema.slice(headers[index].index, headers[index + 1]?.index ?? schema.length)
}
const current = migration(99)
const membershipMigration = migration(100)

async function caller(db, id, pages = '/admin/ministry,/admin/jadwal-pelayanan') {
  await db.query("SELECT set_config('test.caller_id',$1,true),set_config('test.pages',$2,true)", [id, pages])
}
async function rejected(db, sql, values, pattern) {
  await db.exec('SAVEPOINT expected_rejection')
  try { await assert.rejects(db.query(sql, values), pattern) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}
async function fixture(db, run) {
  await db.exec('BEGIN')
  try { await caller(db, 'ADMIN'); await run() }
  finally { await db.exec('ROLLBACK; RESET ROLE') }
}
async function manages(db, id, ministry = 'M1') {
  await caller(db, id)
  return (await db.query('SELECT auth_manages_ministry($1) AS allowed', [ministry])).rows[0].allowed
}
async function setup(db) {
  // Fixture hanya memakai PostgreSQL lokal; identitas dan anggota semuanya fiktif.
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
    CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT NULLIF(current_setting('test.caller_id', true), '')
    $$;
    CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT role FROM users WHERE user_id = auth_user_id()
    $$;
    CREATE FUNCTION auth_admin_can(page TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT COALESCE(auth_user_role()='Super Admin' OR (auth_user_role()='Admin'
        AND page=ANY(string_to_array(current_setting('test.pages',true),','))), false)
    $$;
    CREATE FUNCTION record_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
    ALTER TABLE ministries ENABLE ROW LEVEL SECURITY;
    ALTER TABLE user_ministries ENABLE ROW LEVEL SECURITY;
    CREATE POLICY ministries_select ON ministries FOR SELECT USING (auth.uid() IS NOT NULL);
    -- Drift terverifikasi dari hasil audit operator: baca Ministry juga publik.
    CREATE POLICY ministries_read_all ON ministries FOR SELECT USING (true);
    CREATE POLICY ministries_admin_write ON ministries FOR ALL
      USING (auth_user_role() IN ('Admin','Super Admin')) WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));
    CREATE POLICY um_select ON user_ministries FOR SELECT USING
      (auth_user_role() IN ('Admin','Super Admin') OR user_id=auth_user_id());
    CREATE POLICY um_self_write ON user_ministries FOR ALL
      USING (user_id=auth_user_id()) WITH CHECK (user_id=auth_user_id());
    CREATE POLICY um_admin_write ON user_ministries FOR ALL
      USING (auth_user_role() IN ('Admin','Super Admin'))
      WITH CHECK (auth_user_role() IN ('Admin','Super Admin'));
  `)
  for (const version of [95,96,97,98]) await db.exec(migration(version))
  await db.exec(`
    INSERT INTO users(user_id,name,role) VALUES
      ('ADMIN','Admin QA','Admin'),('SUPER','Super QA','Super Admin'),('OLD','MH Lama QA','Volunteer'),
      ('NEW','MH Baru QA','Volunteer'),('OTHER','MH Lain QA','PKS'),('DEPUTY','Wakil QA','Jemaat'),('VOL','Anggota QA','Volunteer');
    INSERT INTO users(user_id,name,role,status) VALUES ('INACTIVE','Nonaktif QA','Volunteer','Nonaktif'),('INACTIVE-ADMIN','Admin Nonaktif QA','Admin','Nonaktif');
    INSERT INTO ministries(ministry_id,name) VALUES ('M1','Musik QA'),('M2','Kids QA');
    INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES
      ('M1','OLD','Ministry Head'),('M2','OTHER','Ministry Head'),('M1','DEPUTY','Wakil');
  `)
  const old = await db.query("SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_service_roster','guard_service_roster_slot','prepare_ministry_schedule_manager','guard_schedule_manager_recipient_role') ORDER BY proname")
  await db.exec(current)
  await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON ministries,ministry_schedule_managers TO authenticated,anon')
  await db.exec('GRANT SELECT,INSERT,UPDATE,DELETE ON user_ministries TO authenticated')
  return old
}

test('PostgreSQL: MH berasal dari Ministry tanpa persetujuan jadwal otomatis', async t => {
  const db = new PGlite()
  try {
    const original = await setup(db)
    await t.test('migrasi idempotent, menjaga guard/tulis lama dan mengubah hanya policy baca terverifikasi', async () => {
      await db.exec(current)
      assert.deepEqual(await db.query("SELECT proname,pg_get_functiondef(oid) AS definition FROM pg_proc WHERE proname IN ('guard_service_roster','guard_service_roster_slot','prepare_ministry_schedule_manager','guard_schedule_manager_recipient_role') ORDER BY proname"), original)
      assert.equal((await db.query("SELECT count(*)::INT AS n FROM pg_trigger WHERE tgname IN ('trg_guard_ministry_head_source','trg_aa_guard_schedule_manager_head_source','trg_revoke_previous_ministry_head_schedule_access')")).rows[0].n,3)
      assert.doesNotMatch(current,/DROP (?:POLICY|TRIGGER)|UPDATE ministries SET head_user_id/)
      assert.match((await db.query("SELECT pg_get_expr(polqual,polrelid) AS expression FROM pg_policy WHERE polname='ministries_read_all'")).rows[0].expression,/auth.uid\(\) IS NOT NULL/)
    })
    await t.test('policy baca drift yang tidak ada tidak dibuat atau diganti secara membabi buta', async () => {
      await fixture(db, async () => {
        await db.exec('DROP POLICY ministries_read_all ON ministries')
        await db.exec(current)
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM pg_policy WHERE polname='ministries_read_all'")).rows[0].n,0)
        assert.match((await db.query("SELECT pg_get_expr(polqual,polrelid) AS expression FROM pg_policy WHERE polname='ministries_select'")).rows[0].expression,/auth.uid\(\) IS NOT NULL/)
      })
    })
    await t.test('NULL awal tidak menebak MH dari grant lama, sementara Wakil tetap sah', async () => {
      await fixture(db, async () => {
        assert.equal(await manages(db,'OLD'),false)
        assert.equal(await manages(db,'DEPUTY'),true)
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministries WHERE head_user_id IS NOT NULL")).rows[0].n,0)
      })
    })
    await t.test('penetapan kepala memulihkan grant cocok saja dan tidak membuat persetujuan baru', async () => {
      await fixture(db, async () => {
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        assert.equal(await manages(db,'OLD'),true)
        await caller(db,'ADMIN')
        await db.exec("UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
        assert.equal(await manages(db,'OLD'),false)
        assert.equal(await manages(db,'NEW'),false)
        assert.equal((await db.query("SELECT is_active FROM ministry_schedule_managers WHERE user_id='OLD'")).rows[0].is_active,false)
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministry_schedule_managers WHERE user_id='NEW'")).rows[0].n,0)
        await caller(db,'ADMIN')
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        assert.equal(await manages(db,'OLD'),false)
        await caller(db,'ADMIN')
        await db.exec("UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
        await db.exec("INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','NEW','Ministry Head')")
        assert.equal(await manages(db,'NEW'),true)
      })
    })
    await t.test('Admin Ministry dapat mengganti MH dan mencabut grant tanpa akses menu Jadwal', async () => {
      await fixture(db, async () => {
        await caller(db,'ADMIN','/admin/ministry')
        await db.exec('SET ROLE authenticated')
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'; UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT is_active FROM ministry_schedule_managers WHERE user_id='OLD'")).rows[0].is_active,false)
        await db.exec('SET ROLE authenticated')
        await rejected(db,"INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','NEW','Ministry Head')",[],/Persetujuan akses/)
        await db.exec('RESET ROLE')
        await rejected(db,"UPDATE ministry_schedule_managers SET is_active=true WHERE user_id='OLD'",[],/Persetujuan akses/)
      })
    })
    await t.test('grant MH aktif harus sesuai kepala, grant Wakil tidak mewarisi syarat kepala', async () => {
      await fixture(db, async () => {
        await rejected(db,"INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M2','NEW','Ministry Head')",[],/ditetapkan di menu Ministry/)
        await rejected(db,"UPDATE ministry_schedule_managers SET is_active=true WHERE user_id='OLD'",[],/ditetapkan di menu Ministry/)
        await db.exec("INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M2','NEW','Wakil')")
        assert.equal(await manages(db,'NEW','M2'),true)
      })
    })
    await t.test('hak Admin Ministry dan Jadwal terpisah serta Admin nonaktif ditolak', async () => {
      await fixture(db, async () => {
        await caller(db,'ADMIN','/admin/jadwal-pelayanan')
        await rejected(db,"UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'",[],/Penetapan Ministry Head/)
        await caller(db,'INACTIVE-ADMIN')
        await rejected(db,"UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'",[],/Penetapan Ministry Head/)
        await rejected(db,"UPDATE ministry_schedule_managers SET is_active=false WHERE user_id='OLD'",[],/Persetujuan akses/)
        await caller(db,'SUPER','')
        await db.exec("UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
      })
    })
    await t.test('target kepala wajib Volunteer Aktif; Wakil Jemaat/PKS tetap tidak berubah', async () => {
      await fixture(db, async () => {
        await rejected(db,"UPDATE ministries SET head_user_id='INACTIVE' WHERE ministry_id='M1'",[],/pengguna Aktif/)
        for (const id of ['ADMIN','SUPER','DEPUTY','OTHER']) {
          await rejected(db,'UPDATE ministries SET head_user_id=$1 WHERE ministry_id=$2',[id,'M1'],/ber-role Volunteer/)
        }
        await db.exec("UPDATE users SET role_secondary='Admin' WHERE user_id='VOL'")
        await rejected(db,"UPDATE ministries SET head_user_id='VOL' WHERE ministry_id='M1'",[],/ber-role Volunteer/)
        await db.exec("UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id,'NEW')
        await rejected(db,"UPDATE ministries SET head_user_id='MISSING' WHERE ministry_id='M1'",[],/pengguna Aktif/)
        assert.equal(await manages(db,'DEPUTY'),true)
        await caller(db,'ADMIN')
        await db.exec("INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','OTHER','Wakil')")
        assert.equal(await manages(db,'OTHER'),true)
      })
    })
    await t.test('jalur PostgREST langsung tidak memberi Volunteer akses kepala/grant', async () => {
      await fixture(db, async () => {
        await caller(db,'VOL'); await db.exec('SET ROLE authenticated')
        assert.equal((await db.query("UPDATE ministries SET head_user_id='VOL' WHERE ministry_id='M1' RETURNING ministry_id")).rows.length,0)
        await rejected(db,"INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','VOL','Wakil')",[],/Persetujuan akses|row-level security/)
        await db.exec('RESET ROLE')
        await rejected(db,"UPDATE ministries SET head_user_id='VOL' WHERE ministry_id='M1'",[],/Penetapan Ministry Head/)
      })
    })
    await t.test('policy baca publik terverifikasi ditutup; anonim tidak membaca/menulis sumber MH', async () => {
      await fixture(db, async () => {
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        await caller(db,'',''); await db.exec('SET ROLE anon')
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows.length,0)
        assert.equal((await db.query("UPDATE ministries SET head_user_id='VOL' WHERE ministry_id='M1' RETURNING ministry_id")).rows.length,0)
        await rejected(db,"INSERT INTO ministries(ministry_id,name,head_user_id) VALUES ('M3','Palsu','VOL')",[],/row-level security/)
        await rejected(db,"INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','VOL','Wakil')",[],/permission denied|row-level security/)
        await db.exec('RESET ROLE')
        await caller(db,'VOL'); await db.exec('SET ROLE authenticated')
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id,'OLD')
      })
    })
    await t.test('perubahan identitas grant ditolak dan role/status dinilai ulang ketika digunakan', async () => {
      await fixture(db, async () => {
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        await rejected(db,"UPDATE ministry_schedule_managers SET user_id='NEW' WHERE user_id='OLD'",[],/Identitas penerima/)
        await rejected(db,"UPDATE ministry_schedule_managers SET ministry_id='M2' WHERE user_id='DEPUTY'",[],/Identitas penerima/)
        assert.equal(await manages(db,'OLD'),true)
        await db.exec("UPDATE users SET role_secondary='Admin' WHERE user_id='OLD'")
        assert.equal(await manages(db,'OLD'),false)
        await db.exec("UPDATE users SET role_secondary=NULL,status='Nonaktif' WHERE user_id='OLD'")
        assert.equal(await manages(db,'OLD'),false)
        await db.exec("UPDATE users SET status='Aktif',role='PKS' WHERE user_id='OLD'")
        assert.equal(await manages(db,'OLD'),false)
        await caller(db,'ADMIN')
        await rejected(db,"UPDATE ministry_schedule_managers SET is_active=true WHERE user_id='OLD'",[],/ber-role Volunteer/)
        await db.exec("UPDATE users SET role='Jemaat' WHERE user_id='OLD'")
        assert.equal(await manages(db,'OLD'),false)
        await db.exec("UPDATE users SET role='Volunteer' WHERE user_id='OLD'")
        assert.equal(await manages(db,'OLD'),true)
      })
    })
    await t.test('menghapus kepala/approver/Ministry tidak tersangkut trigger referensi', async () => {
      await fixture(db, async () => {
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'; UPDATE ministry_schedule_managers SET approved_by='ADMIN' WHERE user_id='OLD'")
        await caller(db,'','')
        await db.exec("DELETE FROM users WHERE user_id='ADMIN'; DELETE FROM users WHERE user_id='OLD'")
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id,null)
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministry_schedule_managers WHERE user_id='OLD'")).rows[0].n,0)
        await caller(db,'SUPER','')
        await db.exec("DELETE FROM ministries WHERE ministry_id='M1'")
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministry_schedule_managers WHERE ministry_id='M1'")).rows[0].n,0)
      })
    })
    await t.test('cleanup kepala dengan caller Admin aktif tidak mengaktifkan atau membuat grant', async () => {
      await fixture(db, async () => {
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'; UPDATE ministry_schedule_managers SET approved_by='ADMIN' WHERE user_id='DEPUTY'")
        await caller(db,'SUPER','')
        await db.exec("DELETE FROM users WHERE user_id='OLD'")
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id,null)
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministry_schedule_managers WHERE user_id='OLD'")).rows[0].n,0)
        assert.equal(await manages(db,'DEPUTY'),true)
        await caller(db,'ADMIN','/admin/ministry')
        await db.exec('SET ROLE authenticated')
        await db.exec("DELETE FROM ministries WHERE ministry_id='M1'")
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministry_schedule_managers WHERE ministry_id='M1'")).rows[0].n,0)
      })
    })
  } finally { await db.close() }
})

test('PostgreSQL: MH harus melayani dalam Ministry yang dipimpinnya', async t => {
  const db = new PGlite()
  try {
    await setup(db)
    await db.exec(membershipMigration)
    await t.test('migrasi kedua kali tidak menggandakan constraint atau trigger', async () => {
      await db.exec(membershipMigration)
      assert.equal((await db.query(`SELECT count(*)::INT AS n FROM pg_constraint
        WHERE conname='ministries_head_membership_fkey'`)).rows[0].n, 1)
      assert.equal((await db.query(`SELECT count(*)::INT AS n FROM pg_trigger
        WHERE tgname IN ('trg_validate_ministry_head_membership',
          'trg_validate_schedule_manager_head_membership',
          'trg_guard_ministry_head_member_removal')`)).rows[0].n, 3)
    })
    await t.test('Admin tidak dapat menunjuk Volunteer dari Ministry lain', async () => {
      await fixture(db, async () => {
        await rejected(db, "UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'", [], /terdaftar melayani/)
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M2')")
        await rejected(db, "UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'", [], /terdaftar melayani/)
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        assert.equal(await manages(db, 'OLD'), true)
      })
    })
    await t.test('grant MH tanpa keanggotaan ditolak, sedangkan Wakil tetap sah', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('NEW','M1')")
        await db.exec("UPDATE ministries SET head_user_id='NEW' WHERE ministry_id='M1'")
        await db.exec("DELETE FROM user_ministries WHERE user_id='NEW' AND ministry_id='M1'")
        await rejected(db, "INSERT INTO ministry_schedule_managers(ministry_id,user_id,manager_role) VALUES ('M1','NEW','Ministry Head')", [], /menu Ministry|terdaftar melayani/)
        assert.equal(await manages(db, 'DEPUTY'), true)
      })
    })
    await t.test('keluar dari Ministry mengosongkan jabatan dan mencabut persetujuan MH', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        assert.equal(await manages(db, 'OLD'), true)
        await caller(db, 'OLD')
        await db.exec('SET ROLE authenticated')
        await db.exec("DELETE FROM user_ministries WHERE user_id='OLD' AND ministry_id='M1'")
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, null)
        assert.equal((await db.query("SELECT is_active FROM ministry_schedule_managers WHERE user_id='OLD'")).rows[0].is_active, false)
        assert.equal(await manages(db, 'OLD'), false)
        await caller(db, 'ADMIN')
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        assert.equal(await manages(db, 'OLD'), false)
      })
    })
    await t.test('Admin tanpa akses Ministry tidak dapat menghapus keanggotaan MH', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        await caller(db, 'ADMIN', '/admin/jadwal-pelayanan')
        await db.exec('SET ROLE authenticated')
        await rejected(db, "DELETE FROM user_ministries WHERE user_id='OLD' AND ministry_id='M1'", [], /akses Admin Ministry/)
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, 'OLD')
        await caller(db, 'ADMIN', '/admin/ministry')
        await db.exec('SET ROLE authenticated')
        await db.exec("DELETE FROM user_ministries WHERE user_id='OLD' AND ministry_id='M1'")
        await db.exec('RESET ROLE')
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, null)
      })
    })
    await t.test('penghapusan akun anggota kepala tetap membersihkan relasi', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        await caller(db, '', '')
        await db.exec("DELETE FROM users WHERE user_id='OLD'")
        assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, null)
      })
    })
    await t.test('penghapusan Ministry tidak tersangkut siklus FK keanggotaannya', async () => {
      await fixture(db, async () => {
        await db.exec("INSERT INTO user_ministries(user_id,ministry_id) VALUES ('OLD','M1')")
        await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
        await db.exec("DELETE FROM ministries WHERE ministry_id='M1'")
        assert.equal((await db.query("SELECT count(*)::INT AS n FROM ministries WHERE ministry_id='M1'")).rows[0].n, 0)
      })
    })
  } finally { await db.close() }
})

test('PostgreSQL: kepala lama tanpa keanggotaan tidak dapat dikosongkan langsung oleh Admin terbatas', async () => {
  const db = new PGlite()
  try {
    await setup(db)
    // Data lama dari v99 boleh ada sebelum constraint v100 mulai berlaku.
    await db.exec("UPDATE ministries SET head_user_id='OLD' WHERE ministry_id='M1'")
    await db.exec(membershipMigration)
    await db.exec('BEGIN')
    try {
      await caller(db, 'ADMIN', '/admin/jadwal-pelayanan')
      await db.exec('SET ROLE authenticated')
      await rejected(db, "UPDATE ministries SET head_user_id=NULL WHERE ministry_id='M1'", [], /Penetapan Ministry Head/)
      await db.exec('RESET ROLE')
      assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, 'OLD')
      await caller(db, 'ADMIN', '/admin/ministry')
      await db.exec('SET ROLE authenticated')
      await db.exec("UPDATE ministries SET head_user_id=NULL WHERE ministry_id='M1'")
      await db.exec('RESET ROLE')
      assert.equal((await db.query("SELECT head_user_id FROM ministries WHERE ministry_id='M1'")).rows[0].head_user_id, null)
    } finally { await db.exec('ROLLBACK; RESET ROLE') }
  } finally { await db.close() }
})

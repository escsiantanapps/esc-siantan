import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')

function migration(version) {
  const headers = [...schema.matchAll(/^--[^\r\n]*Migrasi v(\d+):[^\r\n]*$/gm)]
  const index = headers.findIndex(header => Number(header[1]) === version)
  assert.notEqual(index, -1, `Migrasi v${version} harus ada di schema.sql`)
  return schema.slice(headers[index].index, headers[index + 1]?.index ?? schema.length)
}

function tableDefinition(name) {
  const match = schema.match(new RegExp(`CREATE TABLE(?: IF NOT EXISTS)? ${name}\\s*\\([\\s\\S]*?\\r?\\n\\);`))
  assert.ok(match, `DDL tabel ${name} harus dibaca dari schema.sql`)
  return match[0]
}

function guardDefinition(sql, name) {
  const match = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION ${name}\\(\\) RETURNS trigger[\\s\\S]*?END \\$\\$;`))
  assert.ok(match, `Definisi ${name} harus dibaca dari migrasi aktual`)
  return match[0]
}

function triggerDefinition(name) {
  const match = migration(95).match(new RegExp(`CREATE TRIGGER ${name}\\s+[\\s\\S]*?EXECUTE FUNCTION [\\w.]+\\(\\);`))
  assert.ok(match, `Trigger ${name} harus dibaca dari schema.sql`)
  return match[0]
}

const authId = '00000000-0000-4000-8000-000000000001'
const finalRosterError = /Roster yang sudah diterbitkan tidak dapat/
const finalSlotError = /Slot roster yang sudah diterbitkan tidak dapat/

async function setup(db) {
  // Fixture memeriksa trigger dan FK nyata, bukan seluruh policy/RLS production.
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id UUID PRIMARY KEY);
    CREATE TABLE public.users (
      user_id TEXT PRIMARY KEY,
      auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'Aktif'
    );
    CREATE TABLE ministries (ministry_id TEXT PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE events (event_id TEXT PRIMARY KEY);
    CREATE TABLE classes (class_id TEXT PRIMARY KEY);
    CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('test.caller_role', true), '')
    $$;
    CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE AS $$
      SELECT NULLIF(current_setting('test.caller_id', true), '')
    $$;
    CREATE FUNCTION auth_admin_can(TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
      SELECT false
    $$;
  `)
  for (const name of ['user_ministries', 'ministry_service_positions', 'service_rosters', 'service_roster_slots']) {
    await db.exec(tableDefinition(name))
  }
  for (const name of ['guard_service_roster', 'guard_service_roster_slot']) {
    await db.exec(guardDefinition(migration(96), name))
    await db.exec(triggerDefinition('trg_' + name))
  }
}

async function withData(db, action, { member = 'QA-MEMBER', metadata = 'QA-OWNER', allSlots = false } = {}) {
  await db.exec('BEGIN')
  try {
    await db.exec(`
      SELECT set_config('test.caller_role', '', true);
      SELECT set_config('test.caller_id', '', true);
      SELECT set_config('app.allow_roster_transition', '', true);
      SELECT set_config('app.allow_roster_slot_assignment', '', true);
      INSERT INTO auth.users(id) VALUES
        ('${authId}'),
        ('00000000-0000-4000-8000-000000000002'),
        ('00000000-0000-4000-8000-000000000003'),
        ('00000000-0000-4000-8000-000000000004');
      INSERT INTO users(user_id, auth_id, name, status) VALUES
        ('QA-MEMBER', '${authId}', 'Anggota QA', 'Aktif'),
        ('QA-OWNER', '00000000-0000-4000-8000-000000000002', 'Pengelola QA', 'Aktif'),
        ('QA-OTHER', '00000000-0000-4000-8000-000000000003', 'Ministry lain', 'Aktif'),
        ('QA-INACTIVE', '00000000-0000-4000-8000-000000000004', 'Nonaktif QA', 'Nonaktif'),
        ('QA-LOCAL', NULL, 'Profil tanpa login', 'Aktif');
      INSERT INTO ministries(ministry_id, name) VALUES
        ('QA-MIN', 'Worship QA'), ('QA-OTHER-MIN', 'Ministry lain');
      INSERT INTO user_ministries(user_id, ministry_id) VALUES
        ('QA-MEMBER', 'QA-MIN'), ('QA-OWNER', 'QA-MIN'),
        ('QA-INACTIVE', 'QA-MIN'), ('QA-LOCAL', 'QA-MIN'),
        ('QA-OTHER', 'QA-OTHER-MIN');
      INSERT INTO ministry_service_positions(position_id, ministry_id, name) VALUES
        ('QA-POS', 'QA-MIN', 'Worship Leader'),
        ('QA-OTHER-POS', 'QA-OTHER-MIN', 'Sound');
    `)
    for (const roster of ['QA-FINAL', 'QA-FINAL-2', 'QA-CANCEL', 'QA-DRAFT', 'QA-EMPTY']) {
      await db.query(`
        INSERT INTO service_rosters(
          roster_id, ministry_id, source_type, title, service_date,
          start_time, end_time, notes, created_by
        ) VALUES ($1, 'QA-MIN', 'Ibadah', $1, '2026-10-04', '08:00', '10:00', 'Catatan QA', $2)
      `, [roster, metadata])
    }
    for (const [slot, roster, number, user] of [
      ['QA-SLOT-FINAL', 'QA-FINAL', 1, member],
      ['QA-SLOT-SECOND', 'QA-FINAL', 2, allSlots ? member : 'QA-OWNER'],
      ['QA-SLOT-FINAL-2', 'QA-FINAL-2', 1, member],
      ['QA-SLOT-CANCEL', 'QA-CANCEL', 1, member],
      ['QA-SLOT-DRAFT', 'QA-DRAFT', 1, member],
    ]) {
      await db.query(`
        INSERT INTO service_roster_slots(slot_id, roster_id, ministry_id, position_id, slot_no, user_id)
        VALUES ($1, $2, 'QA-MIN', 'QA-POS', $3, $4)
      `, [slot, roster, number, user])
    }
    await db.exec("SELECT set_config('app.allow_roster_transition', '1', true)")
    await db.query(`
      UPDATE service_rosters SET status = 'Terbit', version = 1, published_at = now(), published_by = $1
      WHERE roster_id IN ('QA-FINAL', 'QA-FINAL-2')
    `, [metadata])
    await db.query(`
      UPDATE service_rosters SET status = 'Dibatalkan', version = 2, published_at = now(), published_by = $1
      WHERE roster_id = 'QA-CANCEL'
    `, [metadata])
    await db.exec("SELECT set_config('app.allow_roster_transition', '', true)")
    await action()
  } finally {
    await db.exec('ROLLBACK')
  }
}

async function rejected(db, sql, pattern, values = []) {
  // PostgreSQL membatalkan transaksi setelah exception; savepoint menjaga fixture tetap bisa dibaca.
  await db.exec('SAVEPOINT qa_expected_rejection')
  try {
    await assert.rejects(db.query(sql, values), pattern)
  } finally {
    await db.exec('ROLLBACK TO SAVEPOINT qa_expected_rejection; RELEASE SAVEPOINT qa_expected_rejection')
  }
}

async function asCaller(db, role) {
  await db.query("SELECT set_config('test.caller_role', $1, true), set_config('test.caller_id', 'QA-OWNER', true)", [role])
}

async function allRosters(db) {
  return (await db.query(`
    SELECT roster_id, ministry_id, source_type, title, service_date::TEXT, start_time::TEXT,
      end_time::TEXT, location, dress_code, notes, status, version, published_at
    FROM service_rosters ORDER BY roster_id
  `)).rows
}

async function assertMemberGone(db, userId) {
  assert.deepEqual((await db.query('SELECT user_id FROM users WHERE user_id = $1', [userId])).rows, [])
  assert.deepEqual((await db.query('SELECT user_id FROM user_ministries WHERE user_id = $1', [userId])).rows, [])
}

test('PostgreSQL: Migrasi v97 memulihkan cleanup FK tanpa membuka edit roster final', async t => {
  const db = new PGlite()
  try {
    await setup(db)

    await t.test('v96 membuktikan penghapusan auth anggota roster Terbit gagal', async () => {
      await withData(db, async () => {
        await rejected(db, 'DELETE FROM auth.users WHERE id = $1', finalSlotError, [authId])
        assert.equal((await db.query('SELECT user_id FROM users WHERE user_id = $1', ['QA-MEMBER'])).rows.length, 1)
      })
    })

    await t.test('v96 membuktikan cleanup pembuat dan penerbit roster final juga gagal', async () => {
      await withData(db, async () => {
        await rejected(db, 'DELETE FROM auth.users WHERE id = $1', finalRosterError, ['00000000-0000-4000-8000-000000000002'])
        assert.equal((await db.query("SELECT created_by FROM service_rosters WHERE roster_id = 'QA-FINAL'")).rows[0].created_by, 'QA-OWNER')
      })
    })

    await t.test('blok v97 dapat dijalankan dua kali tanpa menambah trigger', async () => {
      await db.exec(migration(97))
      await db.exec(migration(97))
      const guards = (await db.query(`
        SELECT proname, provolatile FROM pg_proc
        WHERE proname IN ('guard_service_roster', 'guard_service_roster_slot') ORDER BY proname
      `)).rows
      assert.deepEqual(guards.map(row => [row.proname, row.provolatile]), [
        ['guard_service_roster', 'v'], ['guard_service_roster_slot', 'v'],
      ])
      assert.equal((await db.query("SELECT count(*)::INTEGER AS count FROM pg_trigger WHERE tgname IN ('trg_guard_service_roster', 'trg_guard_service_roster_slot')")).rows[0].count, 2)
    })

    await t.test('hapus auth membersihkan seluruh slot Terbit, Dibatalkan, dan Draft sambil mempertahankan roster', async () => {
      await withData(db, async () => {
        const before = await allRosters(db)
        await db.query('DELETE FROM auth.users WHERE id = $1', [authId])
        await assertMemberGone(db, 'QA-MEMBER')
        assert.deepEqual(await allRosters(db), before)
        const slots = (await db.query('SELECT slot_id, user_id FROM service_roster_slots ORDER BY slot_id')).rows
        assert.equal(slots.length, 5)
        assert.equal(slots.filter(slot => slot.user_id === null).length, 4)
        assert.equal(slots.find(slot => slot.slot_id === 'QA-SLOT-SECOND').user_id, 'QA-OWNER')
      })
    })

    await t.test('hapus akun yang sekaligus pembuat, penerbit, dan pelayan membersihkan kedua FK metadata', async () => {
      await withData(db, async () => {
        const before = await allRosters(db)
        await db.query('DELETE FROM auth.users WHERE id = $1', [authId])
        await assertMemberGone(db, 'QA-MEMBER')
        assert.deepEqual(await allRosters(db), before)
        const refs = (await db.query('SELECT created_by, published_by FROM service_rosters')).rows
        assert.equal(refs.length, 5)
        assert.equal(refs.every(row => row.created_by === null && row.published_by === null), true)
        assert.equal((await db.query("SELECT user_id FROM service_roster_slots WHERE slot_id = 'QA-SLOT-FINAL'")).rows[0].user_id, null)
      }, { metadata: 'QA-MEMBER' })
    })

    await t.test('profil auth_id NULL dapat dihapus dan slot riwayat tetap disimpan', async () => {
      await withData(db, async () => {
        const before = await allRosters(db)
        await db.query("DELETE FROM users WHERE user_id = 'QA-LOCAL'")
        await assertMemberGone(db, 'QA-LOCAL')
        assert.deepEqual(await allRosters(db), before)
        assert.equal((await db.query('SELECT count(*)::INTEGER AS count FROM service_roster_slots WHERE user_id IS NULL')).rows[0].count, 4)
      }, { member: 'QA-LOCAL', metadata: 'QA-LOCAL' })
    })

    await t.test('banyak slot dalam satu roster dan lintas roster dibersihkan dalam satu cascade', async () => {
      await withData(db, async () => {
        await db.query('DELETE FROM auth.users WHERE id = $1', [authId])
        assert.equal((await db.query('SELECT count(*)::INTEGER AS count FROM service_roster_slots WHERE user_id IS NULL')).rows[0].count, 5)
        assert.equal((await db.query('SELECT count(*)::INTEGER AS count FROM service_rosters')).rows[0].count, 5)
      }, { allSlots: true })
    })

    for (const role of ['Admin', 'Volunteer']) {
      await t.test(`caller ${role} tetap tidak dapat mengosongkan FK metadata atau pelayan roster final`, async () => {
        await withData(db, async () => {
          await asCaller(db, role)
          await rejected(db, "UPDATE service_rosters SET created_by = NULL WHERE roster_id = 'QA-FINAL'", finalRosterError)
          await rejected(db, "UPDATE service_rosters SET published_by = NULL WHERE roster_id = 'QA-FINAL'", finalRosterError)
          await rejected(db, "UPDATE service_roster_slots SET user_id = NULL WHERE slot_id = 'QA-SLOT-FINAL'", finalSlotError)
          await rejected(db, 'DELETE FROM auth.users WHERE id = $1', finalSlotError, [authId])
        })
      })
    }

    await t.test('caller backend tidak mendapat bypass ketika pengguna referensi masih ada', async () => {
      await withData(db, async () => {
        await rejected(db, "UPDATE service_rosters SET created_by = NULL, published_by = NULL WHERE roster_id = 'QA-FINAL'", finalRosterError)
        await rejected(db, "UPDATE service_roster_slots SET user_id = NULL WHERE slot_id = 'QA-SLOT-FINAL'", finalSlotError)
        await rejected(db, "UPDATE service_rosters SET created_by = NULL, notes = 'Diubah' WHERE roster_id = 'QA-FINAL'", finalRosterError)
        await rejected(db, "UPDATE service_rosters SET published_by = NULL, status = 'Draft' WHERE roster_id = 'QA-FINAL'", finalRosterError)
      })
    })

    for (const [field, value] of [['notes', 'Catatan disusupkan'], ['status', 'Draft']]) {
      await t.test(`cascade metadata tidak mengizinkan perubahan ${field} bersama cleanup FK`, async () => {
        await withData(db, async () => {
          await db.exec(`
            CREATE FUNCTION qa_inject_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
              IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
                NEW.${field} := '${value}';
              END IF;
              RETURN NEW;
            END $$;
            CREATE TRIGGER aaa_qa_inject_cleanup BEFORE UPDATE ON service_rosters
              FOR EACH ROW EXECUTE FUNCTION qa_inject_cleanup();
          `)
          await rejected(db, 'DELETE FROM auth.users WHERE id = $1', finalRosterError, [authId])
          assert.equal((await db.query("SELECT user_id FROM users WHERE user_id = 'QA-MEMBER'")).rows.length, 1)
          assert.equal((await db.query("SELECT notes FROM service_rosters WHERE roster_id = 'QA-FINAL'")).rows[0].notes, 'Catatan QA')
        }, { metadata: 'QA-MEMBER' })
      })
    }

    await t.test('cleanup pembuat tidak dapat menyelundupkan penggantian penerbit yang masih aktif', async () => {
      await withData(db, async () => {
        await db.exec(`
          CREATE FUNCTION qa_inject_other_reference() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
              NEW.published_by := 'QA-OTHER';
            END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER aaa_qa_inject_other_reference BEFORE UPDATE ON service_rosters
            FOR EACH ROW EXECUTE FUNCTION qa_inject_other_reference();
        `)
        await rejected(db, 'DELETE FROM auth.users WHERE id = $1', finalRosterError, [authId])
        assert.equal((await db.query("SELECT user_id FROM users WHERE user_id = 'QA-MEMBER'")).rows.length, 1)
        assert.equal((await db.query("SELECT published_by FROM service_rosters WHERE roster_id = 'QA-FINAL'")).rows[0].published_by, 'QA-MEMBER')
      }, { metadata: 'QA-MEMBER' })
    })

    await t.test('cascade slot tidak mengizinkan perubahan identitas bersama cleanup pelayan', async () => {
      await withData(db, async () => {
        await db.exec(`
          CREATE FUNCTION qa_inject_slot_identity() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF OLD.user_id IS NOT NULL AND NEW.user_id IS NULL THEN
              NEW.slot_no := NEW.slot_no + 1;
            END IF;
            RETURN NEW;
          END $$;
          CREATE TRIGGER aaa_qa_inject_slot_identity BEFORE UPDATE ON service_roster_slots
            FOR EACH ROW EXECUTE FUNCTION qa_inject_slot_identity();
        `)
        await rejected(db, 'DELETE FROM auth.users WHERE id = $1', /Identitas slot roster tidak dapat diubah/, [authId])
      })
    })

    await t.test('status, isi, penghapusan roster, dan penghapusan slot final tetap terkunci', async () => {
      await withData(db, async () => {
        await rejected(db, "UPDATE service_rosters SET status = 'Draft' WHERE roster_id = 'QA-FINAL'", finalRosterError)
        await rejected(db, "UPDATE service_rosters SET notes = 'Diubah' WHERE roster_id = 'QA-CANCEL'", finalRosterError)
        await rejected(db, "DELETE FROM service_rosters WHERE roster_id = 'QA-FINAL'", finalRosterError)
        await rejected(db, "DELETE FROM service_roster_slots WHERE slot_id = 'QA-SLOT-CANCEL'", finalSlotError)
      })
    })

    await t.test('Draft tetap memerlukan jalur penugasan dan anggota ministry aktif', async () => {
      await withData(db, async () => {
        await asCaller(db, 'Volunteer')
        await rejected(db, "UPDATE service_roster_slots SET user_id = NULL WHERE slot_id = 'QA-SLOT-DRAFT'", /Penugasan pelayan wajib melalui aksi penjadwalan/)
        await db.exec("SELECT set_config('app.allow_roster_slot_assignment', '1', true)")
        await db.query("UPDATE service_roster_slots SET user_id = 'QA-OWNER' WHERE slot_id = 'QA-SLOT-DRAFT'")
        await rejected(db, "UPDATE service_roster_slots SET user_id = 'QA-OTHER' WHERE slot_id = 'QA-SLOT-DRAFT'", /Ministry Head hanya dapat memilih anggota aktif ministry ini/)
        await rejected(db, "UPDATE service_roster_slots SET user_id = 'QA-INACTIVE' WHERE slot_id = 'QA-SLOT-DRAFT'", /Pelayan yang dipilih harus berstatus Aktif/)
        await rejected(db, "UPDATE service_roster_slots SET position_id = 'QA-OTHER-POS' WHERE slot_id = 'QA-SLOT-DRAFT'", /Identitas slot roster tidak dapat diubah/)
      })
    })

    await t.test('tanggal dan jam Draft berpelayan tetap tidak boleh berubah', async () => {
      await withData(db, async () => {
        await rejected(db, "UPDATE service_rosters SET service_date = '2026-10-11' WHERE roster_id = 'QA-DRAFT'", /Kosongkan seluruh pelayan sebelum mengubah tanggal atau jam roster/)
        await rejected(db, "UPDATE service_rosters SET end_time = '11:00' WHERE roster_id = 'QA-DRAFT'", /Kosongkan seluruh pelayan sebelum mengubah tanggal atau jam roster/)
        await rejected(db, "UPDATE service_rosters SET status = 'Terbit' WHERE roster_id = 'QA-EMPTY'", /Perubahan status roster wajib melalui aksi Terbit\/Batalkan/)
      })
    })

    await t.test('jam selesai tetap wajib untuk roster baru dan ketika diterbitkan', async () => {
      await withData(db, async () => {
        await rejected(db, `
          INSERT INTO service_rosters(roster_id, ministry_id, source_type, title, service_date, start_time)
          VALUES ('QA-NO-END', 'QA-MIN', 'Ibadah', 'Tanpa selesai', '2026-10-04', '08:00')
        `, /Jam selesai wajib diisi agar bentrok jadwal dapat diperiksa/)
        await db.query("UPDATE service_rosters SET end_time = NULL WHERE roster_id = 'QA-EMPTY'")
        await db.exec("SELECT set_config('app.allow_roster_transition', '1', true)")
        await rejected(db, "UPDATE service_rosters SET status = 'Terbit' WHERE roster_id = 'QA-EMPTY'", /Jam selesai wajib diisi sebelum roster diterbitkan/)
      })
    })
  } finally {
    await db.close()
  }
})

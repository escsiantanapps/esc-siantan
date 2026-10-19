import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const migration = schema.slice(
  schema.indexOf('CREATE OR REPLACE FUNCTION guard_user_identity_points_v113()'),
  schema.indexOf('-- TEMUAN (2026-10-19): helper role'))
assert.ok(migration.startsWith('CREATE OR REPLACE FUNCTION guard_user_identity_points_v113()'),
  'Penjaga identitas harus tersedia dalam Migrasi v113')

async function rejected(db, sql, values) {
  await db.exec('SAVEPOINT expected_rejection')
  try { await assert.rejects(db.query(sql, values), /42501|tidak dapat|backend tepercaya/i) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection') }
}

test('PostgreSQL: identitas login dan saldo poin tidak dapat diubah langsung', async t => {
  const db = new PGlite()
  try {
    // Akun dan UUID fiktif; pengujian tidak terhubung ke Supabase production.
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.auth_id', true), '')::UUID
      $$;
      CREATE TABLE users (
        user_id TEXT PRIMARY KEY, auth_id UUID UNIQUE, points INTEGER DEFAULT 0,
        biodata_points_awarded BOOLEAN DEFAULT false, name TEXT NOT NULL
      );
      INSERT INTO users(user_id,auth_id,points,name) VALUES
        ('ADMIN','00000000-0000-4000-8000-000000000001',0,'Admin QA'),
        ('SUPER','00000000-0000-4000-8000-000000000002',12,'Super QA');
    `)
    await db.exec(migration)
    await db.exec(migration)
    await db.exec('BEGIN')
    try {
      await db.query("SELECT set_config('test.auth_id',$1,true)", ['00000000-0000-4000-8000-000000000001'])
      await t.test('Admin tidak dapat mengambil profil Super Admin melalui auth_id', async () => {
        await rejected(db, 'UPDATE users SET auth_id=$1 WHERE user_id=$2',
          ['00000000-0000-4000-8000-000000000003', 'SUPER'])
      })
      await t.test('Admin tidak dapat menulis saldo atau penanda biodata langsung', async () => {
        await rejected(db, 'UPDATE users SET points=13 WHERE user_id=$1', ['SUPER'])
        await rejected(db, 'UPDATE users SET biodata_points_awarded=true WHERE user_id=$1', ['SUPER'])
      })
      await t.test('Perubahan biodata biasa dan penulis poin tepercaya tetap berjalan', async () => {
        await db.query('UPDATE users SET name=$1 WHERE user_id=$2', ['Super QA baru', 'SUPER'])
        await db.exec("SELECT set_config('app.allow_points_update','1',true)")
        await db.query('UPDATE users SET points=13 WHERE user_id=$1', ['SUPER'])
        await db.exec("SELECT set_config('app.allow_points_update','',true)")
      })
      await t.test('backend tanpa sesi pengguna tetap dapat memulihkan auth_id', async () => {
        await db.exec("SELECT set_config('test.auth_id','',true)")
        await db.query('UPDATE users SET auth_id=$1 WHERE user_id=$2',
          ['00000000-0000-4000-8000-000000000004', 'SUPER'])
      })
      assert.deepEqual((await db.query('SELECT auth_id,points,name FROM users WHERE user_id=$1', ['SUPER'])).rows[0], {
        auth_id: '00000000-0000-4000-8000-000000000004', points: 13, name: 'Super QA baru',
      })
    } finally { await db.exec('ROLLBACK') }
  } finally { await db.close() }
})

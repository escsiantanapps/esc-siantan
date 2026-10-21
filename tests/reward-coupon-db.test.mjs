import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const schema = await readFile(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const v119 = schema.slice(schema.indexOf('-- ── Migrasi v119:'), schema.indexOf('-- ── Migrasi v120:'))
const v120 = schema.slice(schema.indexOf('-- ── Migrasi v120:'), schema.indexOf('-- ── Migrasi v121:'))
assert.ok(v119.startsWith('-- ── Migrasi v119:'))
assert.ok(v120.startsWith('-- ── Migrasi v120:'))

async function login(db, id, page = '') {
  await db.query("SELECT set_config('test.auth_id',$1,false)", [id])
  await db.query("SELECT set_config('test.page',$1,false)", [page])
}
async function rpc(db, name, arg) {
  return (await db.query(`SELECT ${name}($1) AS result`, [arg])).rows[0].result
}

test('kupon: poin terpotong saat dibuat, stok terreservasi, dan scan tidak menagih ulang', async t => {
  const db = new PGlite()
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
        SELECT NULLIF(current_setting('test.auth_id',true),'')::UUID $$;
      CREATE TABLE users(user_id TEXT PRIMARY KEY, auth_id UUID, name TEXT,
        role TEXT, status TEXT, points INT);
      CREATE TABLE redeemable_products(product_id TEXT PRIMARY KEY, name TEXT,
        points_cost INT, stock INT);
      CREATE TABLE redemption_tickets(ticket_id TEXT PRIMARY KEY);
      CREATE TABLE admin_user_permissions(user_id TEXT PRIMARY KEY, allowed_pages TEXT[]);
      CREATE TABLE point_transactions(user_id TEXT, amount INT, description TEXT);
      ALTER TABLE redeemable_products ENABLE ROW LEVEL SECURITY;
      ALTER TABLE redemption_tickets ENABLE ROW LEVEL SECURITY;
      CREATE POLICY products_admin_write ON redeemable_products FOR ALL
        USING (true) WITH CHECK (true);
      CREATE POLICY products_read ON redeemable_products FOR SELECT
        USING (true);
      CREATE POLICY tickets_admin_all ON redemption_tickets FOR ALL
        USING (true) WITH CHECK (true);
      CREATE FUNCTION auth_user_id() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT user_id FROM users WHERE auth_id=auth.uid()$$;
      CREATE FUNCTION auth_user_role() RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT role FROM users WHERE auth_id=auth.uid() AND status='Aktif'$$;
      CREATE FUNCTION auth_admin_can(page TEXT) RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
        SET search_path=public AS $$SELECT auth_user_role()='Super Admin'
          OR (auth_user_role()='Admin' AND current_setting('test.page',true)=page)$$;
      CREATE FUNCTION apply_points(target TEXT, amount INT, reason TEXT) RETURNS VOID
        LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
      BEGIN
        UPDATE users SET points=points+amount WHERE user_id=target;
        INSERT INTO point_transactions VALUES(target,amount,reason);
      END $$;
      INSERT INTO users VALUES
        ('U1','00000000-0000-4000-8000-000000000001','Budi','Jemaat','Aktif',10),
        ('U2','00000000-0000-4000-8000-000000000002','Sari','Volunteer','Aktif',10),
        ('A1','00000000-0000-4000-8000-000000000003','Petugas','Admin','Aktif',0);
      INSERT INTO redeemable_products VALUES('P1','Mug',5,1),('P2','Buku',3,0),('P3','Pulpen',2,2);
    `)
    await db.exec(v119)
    await db.exec(v120)
    await db.exec(v120)
    await t.test('Admin pemindai tidak dapat mengubah katalog lewat SQL langsung', async () => {
      await login(db, '00000000-0000-4000-8000-000000000003', '/admin/penukaran-hadiah')
      await db.exec('GRANT USAGE ON SCHEMA auth TO authenticated; GRANT SELECT, UPDATE ON redeemable_products TO authenticated')
      try {
        await db.exec('SET ROLE authenticated')
        const result = await db.query("UPDATE redeemable_products SET stock=99 WHERE product_id='P1' RETURNING stock")
        assert.equal(result.rows.length, 0)
      } finally { await db.exec('RESET ROLE') }
    })
    await login(db, '00000000-0000-4000-8000-000000000001')
    const coupon = await rpc(db, 'request_reward_coupon', 'P1')
    assert.equal(coupon.ok, true)
    assert.equal((await rpc(db, 'request_reward_coupon', 'P1')).coupon_id, coupon.coupon_id)
    assert.deepEqual((await db.query("SELECT points FROM users WHERE user_id='U1'")).rows[0], { points: 5 })
    assert.deepEqual((await db.query("SELECT stock,stock_is_limited FROM redeemable_products WHERE product_id='P1'")).rows[0],
      { stock: 0, stock_is_limited: true })
    await t.test('policy baca kupon hanya mengizinkan pemilik dan Admin berizin', async () => {
      await db.exec('SET ROLE authenticated')
      try {
        assert.equal((await db.query('SELECT coupon_id FROM reward_coupons')).rows.length, 1)
        await login(db, '00000000-0000-4000-8000-000000000003', '/admin/penukaran-hadiah')
        assert.equal((await db.query('SELECT coupon_id FROM reward_coupons')).rows.length, 0)
      } finally { await db.exec('RESET ROLE') }
    })
    await t.test('stok habis menolak akun lain', async () => {
      await login(db, '00000000-0000-4000-8000-000000000002')
      assert.equal((await rpc(db, 'request_reward_coupon', 'P1')).reason, 'out_of_stock')
    })
    await t.test('Admin tanpa izin tidak dapat menyerahkan', async () => {
      await login(db, '00000000-0000-4000-8000-000000000003')
      await assert.rejects(rpc(db, 'confirm_reward_coupon', coupon.coupon_id), /not_authorized/)
    })
    await t.test('Admin berizin scan sekali, saldo tetap', async () => {
      await login(db, '00000000-0000-4000-8000-000000000003', '/admin/penukaran-hadiah')
      await assert.rejects(rpc(db, 'confirm_reward_coupon', coupon.coupon_id), /not_authorized/)
      await db.exec("INSERT INTO admin_user_permissions VALUES ('A1', ARRAY['/admin/penukaran-hadiah'])")
      await db.exec('SET ROLE authenticated')
      try { assert.equal((await db.query('SELECT coupon_id FROM reward_coupons')).rows.length, 1) }
      finally { await db.exec('RESET ROLE') }
      assert.equal((await rpc(db, 'inspect_reward_coupon', coupon.coupon_id)).member_name, 'Budi')
      await assert.rejects(rpc(db, 'cancel_reward_coupon', coupon.coupon_id), /not_authorized/)
      assert.equal((await rpc(db, 'confirm_reward_coupon', coupon.coupon_id)).ok, true)
      assert.equal((await rpc(db, 'confirm_reward_coupon', coupon.coupon_id)).reason, 'used')
      assert.equal((await db.query("SELECT points FROM users WHERE user_id='U1'")).rows[0].points, 5)
      await login(db, '00000000-0000-4000-8000-000000000001')
      assert.equal((await rpc(db, 'cancel_reward_coupon', coupon.coupon_id)).reason, 'used')
    })
    await t.test('pembatalan sebelum serah mengembalikan poin sekali', async () => {
      await login(db, '00000000-0000-4000-8000-000000000001')
      const next = await rpc(db, 'request_reward_coupon', 'P2')
      assert.equal(next.ok, true)
      assert.equal((await rpc(db, 'cancel_reward_coupon', next.coupon_id)).ok, true)
      assert.equal((await rpc(db, 'cancel_reward_coupon', next.coupon_id)).reason, 'used')
      assert.equal((await db.query("SELECT points FROM users WHERE user_id='U1'")).rows[0].points, 5)
      assert.equal((await db.query("SELECT count(1)::INT AS total FROM point_transactions WHERE user_id='U1'")).rows[0].total, 3)
    })
    await t.test('stok terbatas kembali saat kupon dibatalkan', async () => {
      const next = await rpc(db, 'request_reward_coupon', 'P3')
      assert.equal(next.ok, true)
      assert.equal((await db.query("SELECT stock FROM redeemable_products WHERE product_id='P3'")).rows[0].stock, 1)
      assert.equal((await rpc(db, 'cancel_reward_coupon', next.coupon_id)).ok, true)
      assert.equal((await db.query("SELECT stock FROM redeemable_products WHERE product_id='P3'")).rows[0].stock, 2)
    })
  } finally { await db.close() }
})

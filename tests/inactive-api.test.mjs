import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createECDH } from 'node:crypto'
import deleteUser from '../api/delete-user.js'
import updateEmail from '../api/_lib/update-user-email.js'
import sendPush from '../api/_handlers/send-push.js'

const vapid = createECDH('prime256v1')
vapid.generateKeys()

async function denied(handler, role, body = {}) {
  const requests = []
  const previousFetch = globalThis.fetch
  const keys = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT']
  const previousEnv = Object.fromEntries(keys.map(key => [key, process.env[key]]))
  Object.assign(process.env, {
    SUPABASE_URL: 'https://qa-inactive.example.invalid',
    SUPABASE_SERVICE_ROLE_KEY: 'qa-service-key',
    SUPABASE_ANON_KEY: 'qa-anon-key',
    VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
    VAPID_PRIVATE_KEY: Buffer.concat([Buffer.alloc(32 - vapid.getPrivateKey().length), vapid.getPrivateKey()]).toString('base64url'),
    VAPID_SUBJECT: 'mailto:qa@example.invalid',
  })
  globalThis.fetch = async input => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    assert.equal(url.hostname, 'qa-inactive.example.invalid')
    requests.push(url.pathname)
    let data
    if (url.pathname === '/auth/v1/user') data = { id: 'qa-auth-id' }
    else if (url.pathname === '/rest/v1/users') {
      data = { user_id: 'QA-USER', role, status: 'Nonaktif', auth_id: 'qa-auth-id' }
    } else throw new Error(`Operasi backend tidak boleh dicapai: ${url.pathname}`)
    return new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })
  }
  const response = {
    statusCode: null, body: null,
    status(value) { this.statusCode = value; return this },
    json(value) { this.body = value; return this },
    end() { return this },
    setHeader() {},
  }
  try {
    await handler({ method: 'POST', headers: { authorization: 'Bearer qa-token' }, body }, response)
    assert.equal(response.statusCode, 403)
    assert.deepEqual(requests, ['/auth/v1/user', '/rest/v1/users'])
  } finally {
    globalThis.fetch = previousFetch
    for (const key of keys) {
      if (previousEnv[key] === undefined) delete process.env[key]
      else process.env[key] = previousEnv[key]
    }
  }
}

test('Endpoint service-role menolak akun Admin, Super Admin, dan Gembala Nonaktif', async () => {
  await denied(deleteUser, 'Admin', { userId: 'QA-TARGET' })
  await denied(updateEmail, 'Super Admin', { userId: 'QA-TARGET', email: 'qa@example.invalid' })
  await denied(sendPush, 'Gembala', { title: 'QA', sourcePage: '/admin/pesan' })
})

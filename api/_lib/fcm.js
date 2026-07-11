// Pengirim FCM HTTP v1 untuk aplikasi NATIVE Android (tabel device_tokens, v68).
// Pipeline TERPISAH dari web-push VAPID (push_subscriptions) — keduanya hidup
// berdampingan: PWA terima via web-push, APK native via FCM.
//
// Tanpa dependensi baru: token OAuth service-account dibuat manual (JWT RS256
// via crypto bawaan Node) — menghindari paket firebase-admin yang berat.
//
// Env: FIREBASE_SERVICE_ACCOUNT = isi JSON service account Firebase utuh
// (Project Settings > Service accounts > Generate new private key), di-paste
// sebagai satu baris di Vercel. Bila env kosong → fcmAvailable() false dan
// pemanggil melewati FCM tanpa error (fitur opsional sampai user setup Firebase).
import crypto from 'crypto'

let cachedToken = null // { token, expiresAt } — token OAuth berlaku 1 jam

function getServiceAccount() {
  const raw = (process.env.FIREBASE_SERVICE_ACCOUNT || '').trim()
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    if (!sa.client_email || !sa.private_key || !sa.project_id) return null
    return sa
  } catch {
    return null
  }
}

export function fcmAvailable() {
  return !!getServiceAccount()
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

// Tukar JWT service-account dengan access token OAuth (scope FCM). Di-cache
// sampai 5 menit sebelum kedaluwarsa — instance serverless bisa reuse.
async function getAccessToken(sa) {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 300000) return cachedToken.token
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }))
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  const signature = b64url(signer.sign(sa.private_key))
  const assertion = `${header}.${claims}.${signature}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${assertion}`,
  })
  if (!res.ok) throw new Error(`OAuth token gagal: ${res.status}`)
  const data = await res.json()
  cachedToken = { token: data.access_token, expiresAt: Date.now() + (data.expires_in || 3600) * 1000 }
  return cachedToken.token
}

// Kirim notifikasi ke daftar baris device_tokens [{token, user_id}].
// `admin` = client supabase service-role — dipakai menghapus token mati
// (UNREGISTERED/INVALID_ARGUMENT) supaya tabel tidak menumpuk bangkai.
// Return { sent, removed, errors } — bentuk sama dengan pipeline web-push.
export async function sendFcm(admin, tokens, { title, body, url }) {
  const sa = getServiceAccount()
  if (!sa || !tokens?.length) return { sent: 0, removed: 0, errors: [] }

  const accessToken = await getAccessToken(sa)
  const endpoint = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`
  let sent = 0
  let removed = 0
  const errors = []

  await Promise.all(tokens.map(async t => {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token: t.token,
            notification: { title, body: body || '' },
            data: { url: url || '/' }, // app native yang menafsirkan rute
            android: { priority: 'HIGH' },
          },
        }),
      })
      if (res.ok) {
        sent++
        return
      }
      const err = await res.json().catch(() => ({}))
      const code = err?.error?.details?.find(d => d.errorCode)?.errorCode || err?.error?.status
      // Token mati (app di-uninstall / token diputar) → hapus barisnya.
      if (res.status === 404 || code === 'UNREGISTERED' || code === 'INVALID_ARGUMENT') {
        await admin.from('device_tokens').delete().eq('token', t.token)
        removed++
      } else {
        errors.push({ user_id: t.user_id, statusCode: res.status, detail: String(code || res.statusText).slice(0, 300) })
      }
    } catch (e) {
      errors.push({ user_id: t.user_id, statusCode: null, detail: String(e.message || e).slice(0, 300) })
    }
  }))

  return { sent, removed, errors }
}

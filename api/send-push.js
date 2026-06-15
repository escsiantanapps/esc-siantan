import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'

// Env yang harus diset di Vercel (Project → Settings → Environment Variables):
//   SUPABASE_URL                 (atau pakai VITE_SUPABASE_URL yang sudah ada)
//   SUPABASE_SERVICE_ROLE_KEY    (Project Settings → API → service_role secret)
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT                (opsional, mis. mailto:admin@escsiantan.app)
const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim()
const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim()

// Normalisasi subject: web-push menolak nilai yang bukan mailto:/URL.
let VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
if (!/^(mailto:|https?:\/\/)/i.test(VAPID_SUBJECT)) {
  VAPID_SUBJECT = 'mailto:' + VAPID_SUBJECT
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Validasi env — kembalikan info (boolean, bukan nilai) untuk memudahkan diagnosa.
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
      return res.status(500).json({
        error: 'Environment variable belum lengkap.',
        missing: {
          SUPABASE_URL: !SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY,
          VAPID_PUBLIC_KEY: !VAPID_PUBLIC,
          VAPID_PRIVATE_KEY: !VAPID_PRIVATE,
        },
      })
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Verifikasi pemanggil: harus user login dengan role Admin/Super Admin.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })
    const { data: caller } = await admin
      .from('users').select('role').eq('auth_id', userData.user.id).single()
    if (!caller || !['Admin', 'Super Admin'].includes(caller.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { title, body: message, url, userIds } = body
    if (!title) return res.status(400).json({ error: 'title wajib diisi.' })

    let query = admin.from('push_subscriptions').select('*')
    if (Array.isArray(userIds) && userIds.length) query = query.in('user_id', userIds)
    const { data: subs, error: sErr } = await query
    if (sErr) return res.status(500).json({ error: sErr.message })

    const payload = JSON.stringify({ title, body: message || '', url: url || '/' })
    let sent = 0
    let removed = 0

    await Promise.all(
      (subs || []).map(async s => {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload
          )
          sent++
        } catch (err) {
          // Langganan kedaluwarsa / tidak valid → hapus.
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
            removed++
          }
        }
      })
    )

    return res.status(200).json({ ok: true, total: (subs || []).length, sent, removed })
  } catch (err) {
    // Tangkap semua error agar tidak jadi FUNCTION_INVOCATION_FAILED yang gelap.
    return res.status(500).json({ error: err?.message || 'Server error' })
  }
}

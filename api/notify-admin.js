export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    const webpush = (await import('web-push')).default
    const { createClient } = await import('@supabase/supabase-js')

    let firebaseAdmin = null;
    try {
      const adminModule = await import('firebase-admin');
      firebaseAdmin = adminModule.default || adminModule;
    } catch (e) {
      console.warn('[notify-admin] firebase-admin not installed or failed to load:', e.message);
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim()
    const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim()
    let VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
    if (!/^(mailto:|https?:\/\/)/i.test(VAPID_SUBJECT)) VAPID_SUBJECT = 'mailto:' + VAPID_SUBJECT

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
      return res.status(500).json({ error: 'Environment variable belum lengkap.' })
    }

    const fbProjectId = process.env.FIREBASE_PROJECT_ID
    const fbClientEmail = process.env.FIREBASE_CLIENT_EMAIL
    const fbPrivateKey = process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : null
    
    if (firebaseAdmin && fbProjectId && fbClientEmail && fbPrivateKey) {
      if (!firebaseAdmin.apps.length) {
        firebaseAdmin.initializeApp({
          credential: firebaseAdmin.credential.cert({
            projectId: fbProjectId,
            clientEmail: fbClientEmail,
            privateKey: fbPrivateKey,
          })
        });
      }
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Verifikasi pemanggil (bisa user biasa jika registrasi baru)
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'notify-admin', max: 10 })) return

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { type, payload } = body
    if (!type) return res.status(400).json({ error: 'Tipe notifikasi (type) wajib diisi.' })

    // Tentukan admin mana yang akan dinotifikasi berdasarkan type
    let allowedRoles = ['Super Admin', 'Admin']
    let title = 'Pemberitahuan Admin'
    let message = ''
    let url = '/admin'

    if (type === 'new_user') {
      title = 'Pendaftaran Jemaat Baru'
      message = `${payload?.name || 'Seseorang'} baru saja mendaftar dan menunggu persetujuan.`
      url = '/admin/jemaat'
    } else if (type === 'new_class') {
      allowedRoles.push('Admin Kelas')
      title = 'Pendaftaran Kelas Baru'
      message = `${payload?.name || 'Seseorang'} mendaftar ke kelas.`
      url = '/admin/kelas'
    } else if (type === 'new_event') {
      allowedRoles.push('Admin Kelas')
      title = 'Pendaftaran Event Baru'
      message = `${payload?.name || 'Seseorang'} mendaftar ke event.`
      url = '/admin/events'
    } else if (type === 'new_evaluation') {
      allowedRoles.push('Admin Komsel')
      title = 'Evaluasi Baru'
      message = `Ada evaluasi/laporan baru yang masuk.`
      url = '/admin/evaluasi'
    } else {
      return res.status(400).json({ error: 'Tipe tidak valid.' })
    }

    // Cari semua admin dengan role yang diizinkan
    const { data: admins } = await admin
      .from('users').select('user_id').in('role', allowedRoles)
    const adminIds = (admins || []).map(a => a.user_id)
    if (adminIds.length === 0) return res.status(200).json({ ok: true, reason: 'no-admins' })

    const { data: subs } = await admin
      .from('push_subscriptions').select('*').in('user_id', adminIds)

    const pushPayload = JSON.stringify({ title, body: message, url })

    let sent = 0, removed = 0
    const errors = []
    await Promise.all(
      (subs || []).map(async s => {
        try {
          const isFcmToken = s.endpoint && !s.endpoint.startsWith('http') && !s.endpoint.includes('{');
          if (isFcmToken) {
            if (!firebaseAdmin?.apps?.length) throw new Error('Firebase Admin not configured');
            await firebaseAdmin.messaging().send({
              token: s.endpoint,
              notification: { title: title, body: message || '' },
              data: { url: url || '/' },
              android: { priority: 'high' }
            });
          } else {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              pushPayload
            )
          }
          sent++
        } catch (err) {
          const isNotFound = err.statusCode === 404 || err.statusCode === 410 || 
                            (err.code === 'messaging/registration-token-not-registered') ||
                            (err.code === 'messaging/invalid-registration-token');
          if (isNotFound) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
            removed++
          } else {
            errors.push({
              statusCode: err.statusCode || null,
              detail: String(err.body || err.message || err).slice(0, 300),
            })
          }
        }
      })
    )

    return res.status(200).json({ ok: true, admins: adminIds.length, sent, removed, errors })
  } catch (err) {
    console.error('[notify-admin]', err)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

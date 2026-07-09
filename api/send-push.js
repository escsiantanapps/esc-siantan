// Paksa runtime Node (web-push butuh modul Node; bukan Edge).
export const config = { runtime: 'nodejs' }

const RATE_LIMIT_MS = 8000

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' })
    }

    // Import dinamis agar kegagalan load modul muncul sebagai JSON, bukan crash.
    const webpush = (await import('web-push')).default
    const { createClient } = await import('@supabase/supabase-js')
    
    // Lazy load firebase-admin to avoid errors if not configured yet
    let firebaseAdmin = null;
    try {
      const adminModule = await import('firebase-admin');
      firebaseAdmin = adminModule.default || adminModule;
    } catch (e) {
      console.warn('[send-push] firebase-admin not installed or failed to load:', e.message);
    }

    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim()
    const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim()
    let VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
    if (!/^(mailto:|https?:\/\/)/i.test(VAPID_SUBJECT)) VAPID_SUBJECT = 'mailto:' + VAPID_SUBJECT

    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
      console.error('[send-push] Missing env vars:', { SUPABASE_URL: !SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: !SERVICE_ROLE_KEY, VAPID_PUBLIC_KEY: !VAPID_PUBLIC, VAPID_PRIVATE_KEY: !VAPID_PRIVATE })
      return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
    }

    // Initialize Firebase Admin if environment variables exist
    const fbProjectId = process.env.FIREBASE_PROJECT_ID
    const fbClientEmail = process.env.FIREBASE_CLIENT_EMAIL
    // Fix private key formatting for Vercel env vars
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
    } else {
      console.warn('[send-push] Firebase credentials missing, FCM tokens will fail.');
    }

    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Verifikasi pemanggil: harus user login dengan role Admin/Super Admin.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })
    const { data: caller } = await admin
      .from('users').select('role, user_id, last_push_sent_at').eq('auth_id', userData.user.id).single()
    if (!caller || !['Admin', 'Super Admin', 'Gembala'].includes(caller.role)) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Rate-limit per-admin disimpan di DB agar berlaku lintas instance serverless.
    const now = Date.now()
    const lastSentAt = caller.last_push_sent_at ? new Date(caller.last_push_sent_at).getTime() : 0
    if (now - lastSentAt < RATE_LIMIT_MS) {
      return res.status(429).json({ error: 'Terlalu cepat. Coba lagi beberapa detik.' })
    }
    await admin
      .from('users')
      .update({ last_push_sent_at: new Date(now).toISOString() })
      .eq('user_id', caller.user_id)

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { title, body: message, url, userIds } = body
    if (!title) return res.status(400).json({ error: 'title wajib diisi.' })

    let query = admin.from('push_subscriptions').select('*')
    if (Array.isArray(userIds) && userIds.length) query = query.in('user_id', userIds)
    const { data: subs, error: sErr } = await query
    if (sErr) return res.status(500).json({ error: 'Gagal mengambil data notifikasi.' })

    // Bila tidak ada subscription untuk target user, cek apakah ada subscription
    // aktif di sistem sama sekali — supaya pemanggil (UI admin) bisa membedakan
    // "memang tidak ada yang aktifkan push" vs "ada, tapi bukan dari target ini".
    let totalSystemWide = null
    if ((subs || []).length === 0 && Array.isArray(userIds) && userIds.length) {
      const { count } = await admin.from('push_subscriptions').select('*', { count: 'exact', head: true })
      totalSystemWide = count ?? 0
    }

    const payload = JSON.stringify({ title, body: message || '', url: url || '/' })
    let sent = 0
    let removed = 0
    // Kegagalan selain 404/410 (mis. VAPID key tidak cocok, payload ditolak)
    // dulu ditelan diam-diam sehingga "sent: 0" tidak pernah kelihatan alasannya.
    // Sekarang dikumpulkan agar pemanggil (UI admin) bisa lihat sebab sebenarnya.
    const errors = []

    await Promise.all(
      (subs || []).map(async s => {
        try {
          // Check if token is FCM token (plain string without URL structure or JSON)
          // WebPush tokens are always URLs in the endpoint field
          const isFcmToken = s.endpoint && !s.endpoint.startsWith('http') && !s.endpoint.includes('{');
          
          if (isFcmToken) {
            if (!firebaseAdmin?.apps?.length) throw new Error('Firebase Admin not configured');
            // Send FCM Notification
            await firebaseAdmin.messaging().send({
              token: s.endpoint, // We save FCM token in endpoint column
              notification: {
                title: title,
                body: message || ''
              },
              data: {
                url: url || '/'
              },
              android: {
                priority: 'high'
              }
            });
          } else {
            // Send WebPush Notification
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              payload
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
              user_id: s.user_id,
              statusCode: err.statusCode || err.code || null,
              detail: String(err.body || err.message || err).slice(0, 300),
            })
          }
        }
      })
    )

    return res.status(200).json({
      ok: true, total: (subs || []).length, sent, removed, errors,
      targetCount: Array.isArray(userIds) ? userIds.length : null,
      totalSystemWide,
    })
  } catch (err) {
    console.error('[send-push] Fatal:', err)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

// Beri tahu PKS (pemimpin komsel) bahwa seorang anggota komselnya baru saja
// mengisi sebuah SOP/tugas hari ini. Dipanggil oleh anggota (klien) setelah
// submit tugas berhasil — bukan oleh admin. Karena itu endpoint ini TIDAK
// memerlukan peran admin: cukup user login yang mengisi tugasnya sendiri.
//
// Anti-spam & dedupe: server memverifikasi bahwa response untuk (anggota, form)
// memang ada hari ini, dan hanya mengirim pada pengisian PERTAMA hari itu.
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
      console.warn('[notify-pks] firebase-admin not installed or failed to load:', e.message);
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

    // Verifikasi pemanggil: harus user login. user_id & komsel diambil dari
    // token (bukan body) agar anggota tidak bisa mengaku sebagai orang lain.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'notify-pks', max: 10 })) return

    const { data: member } = await admin
      .from('users').select('user_id, name, komsel_id').eq('auth_id', userData.user.id).single()
    if (!member) return res.status(403).json({ error: 'Forbidden' })
    // Anggota tanpa komsel → tidak ada PKS yang perlu diberi tahu.
    if (!member.komsel_id) return res.status(200).json({ ok: true, reason: 'no-komsel' })

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { formId } = body
    if (!formId) return res.status(400).json({ error: 'formId wajib diisi.' })

    // Pastikan response benar-benar ada hari ini, dan dedupe: hanya kirim pada
    // pengisian PERTAMA hari ini (count === 1) agar tidak spam bila tugas boleh
    // diisi berkali-kali. "Hari ini" memakai zona WIB (UTC+7) — selaras dengan
    // batas once_per_day yang dihitung di sisi klien (browser jemaat di WIB).
    const nowWib = new Date(Date.now() + 7 * 3600 * 1000)
    const startToday = new Date(Date.UTC(
      nowWib.getUTCFullYear(), nowWib.getUTCMonth(), nowWib.getUTCDate(), 0, 0, 0
    ) - 7 * 3600 * 1000)
    const { data: todays } = await admin
      .from('form_responses').select('response_id')
      .eq('form_id', formId).eq('volunteer_id', member.user_id)
      .gte('submitted_at', startToday.toISOString())
    const count = (todays || []).length
    if (count === 0) return res.status(200).json({ ok: true, reason: 'no-response' })
    if (count > 1) return res.status(200).json({ ok: true, reason: 'already-notified' })

    // Judul SOP (otoritatif dari DB).
    const { data: tpl } = await admin
      .from('form_templates').select('title').eq('form_id', formId).single()
    const formTitle = tpl?.title || 'SOP'

    // PKS komsel ini (kecuali anggota itu sendiri bila ia juga PKS-nya).
    const { data: leaders } = await admin
      .from('komsel_leaders').select('user_id').eq('komsel_id', member.komsel_id)
    const leaderIds = (leaders || []).map(l => l.user_id).filter(id => id !== member.user_id)
    if (leaderIds.length === 0) return res.status(200).json({ ok: true, reason: 'no-leaders' })

    const { data: subs } = await admin
      .from('push_subscriptions').select('*').in('user_id', leaderIds)

    const payload = JSON.stringify({
      title: 'Anggota Mengisi SOP',
      body: `${member.name} sudah mengisi "${formTitle}" hari ini.`,
      url: '/pks',
    })

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
              notification: { title: JSON.parse(payload).title, body: JSON.parse(payload).body || '' },
              data: { url: JSON.parse(payload).url || '/' },
              android: { priority: 'high' }
            });
          } else {
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
              statusCode: err.statusCode || null,
              detail: String(err.body || err.message || err).slice(0, 300),
            })
          }
        }
      })
    )

    return res.status(200).json({ ok: true, leaders: leaderIds.length, sent, removed, errors })
  } catch (err) {
    console.error('[notify-pks]', err)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

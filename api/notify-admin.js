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

    // Verifikasi pemanggil (bisa user biasa jika baru mendaftar), lalu ambil
    // identitas dari DB. Nama/event tidak boleh dipercaya dari payload klien.
    const token = (req.headers.authorization || '').replace('Bearer ', '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const { data: userData, error: uErr } = await admin.auth.getUser(token)
    if (uErr || !userData?.user) return res.status(401).json({ error: 'Unauthorized' })

    const { data: caller } = await admin
      .from('users')
      .select('user_id, name, status, created_at')
      .eq('auth_id', userData.user.id)
      .maybeSingle()
    if (!caller) return res.status(403).json({ error: 'Forbidden' })

    const { checkRateLimit } = await import('./_lib/rate-limit.js')
    if (checkRateLimit(req, res, { endpoint: 'notify-admin', max: 10 })) return

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const { type, referenceId } = body
    if (!type) return res.status(400).json({ error: 'Tipe notifikasi (type) wajib diisi.' })

    const recent = (value, maxAgeMs = 10 * 60 * 1000) => {
      const time = new Date(value).getTime()
      return Number.isFinite(time) && Date.now() - time >= 0 && Date.now() - time <= maxAgeMs
    }

    // Pastikan notifikasi menunjuk aksi BARU yang benar-benar dibuat pemanggil.
    // Ini mencegah akun login mengirim push admin palsu lewat endpoint langsung.
    let title = 'Pemberitahuan Admin'
    let message = ''
    let url = '/admin'
    let requiredPage = '/admin'

    if (type === 'new_user') {
      if (caller.status !== 'Menunggu Persetujuan' || !recent(caller.created_at)) {
        return res.status(403).json({ error: 'Pendaftaran baru tidak ditemukan.' })
      }
      title = 'Pendaftaran Jemaat Baru'
      message = `${caller.name || 'Seseorang'} baru saja mendaftar dan menunggu persetujuan.`
      url = '/admin/jemaat?status=Menunggu+Persetujuan&pengingat=akun'
      requiredPage = '/admin/jemaat'
    } else if (type === 'new_class') {
      if (typeof referenceId !== 'string' || !referenceId) {
        return res.status(400).json({ error: 'Referensi pendaftaran kelas wajib diisi.' })
      }
      const { data: registration } = await admin
        .from('class_registrations')
        .select('registration_id, user_id, registered_at')
        .eq('registration_id', referenceId)
        .maybeSingle()
      if (!registration || registration.user_id !== caller.user_id || !recent(registration.registered_at)) {
        return res.status(403).json({ error: 'Pendaftaran kelas baru tidak ditemukan.' })
      }
      title = 'Pendaftaran Kelas Baru'
      message = `${caller.name || 'Seseorang'} mendaftar ke kelas.`
      url = '/admin/kelas?pengingat=kelas'
      requiredPage = '/admin/kelas'
    } else if (type === 'new_event') {
      if (typeof referenceId !== 'string' || !referenceId) {
        return res.status(400).json({ error: 'Referensi pendaftaran event wajib diisi.' })
      }
      const { data: registration } = await admin
        .from('event_registrations')
        .select('ticket_id, user_id, registered_at')
        .eq('ticket_id', referenceId)
        .maybeSingle()
      if (!registration || registration.user_id !== caller.user_id || !recent(registration.registered_at)) {
        return res.status(403).json({ error: 'Pendaftaran event baru tidak ditemukan.' })
      }
      title = 'Pendaftaran Event Baru'
      message = `${caller.name || 'Seseorang'} mendaftar ke event.`
      url = '/admin/events?pengingat=event'
      requiredPage = '/admin/events'
    } else if (['new_baptism', 'new_wedding', 'new_dedication', 'new_ktj', 'new_leave', 'new_offering', 'new_komsel_offering'].includes(type)) {
      const taskTypes = {
        new_baptism: {
          table: 'baptism_registrations', idColumn: 'baptism_id', ownerColumn: 'user_id',
          title: 'Pendaftaran Baptisan Baru', label: 'mengajukan baptisan',
          url: '/admin/baptisan?status=Menunggu&pengingat=baptisan', page: '/admin/baptisan',
        },
        new_wedding: {
          table: 'wedding_registrations', idColumn: 'wedding_id', ownerColumn: 'user_id',
          title: 'Pendaftaran Pemberkatan Baru', label: 'mengajukan pemberkatan nikah',
          url: '/admin/nikah?status=Menunggu&pengingat=nikah', page: '/admin/nikah',
        },
        new_dedication: {
          table: 'child_dedication_registrations', idColumn: 'dedication_id', ownerColumn: 'user_id',
          title: 'Pendaftaran Penyerahan Anak', label: 'mengajukan penyerahan anak',
          url: '/admin/penyerahan-anak?status=Menunggu&pengingat=penyerahan', page: '/admin/penyerahan-anak',
        },
        new_ktj: {
          table: 'ktj_registrations', idColumn: 'ktj_id', ownerColumn: 'user_id',
          title: 'Pengajuan KTJ Baru', label: 'mengajukan Kartu Tanda Jemaat',
          url: '/admin/ktj?status=Menunggu&pengingat=ktj', page: '/admin/ktj',
        },
        new_leave: {
          table: 'task_leaves', idColumn: 'leave_id', ownerColumn: 'user_id',
          title: 'Pengajuan Izin Baru', label: 'mengajukan izin atau sakit',
          url: '/admin/izin?status=Menunggu&pengingat=izin', page: '/admin/izin',
        },
        new_offering: {
          table: 'offerings', idColumn: 'offering_id', ownerColumn: 'user_id',
          title: 'Catatan Persembahan Baru', label: 'mencatat persembahan yang perlu diverifikasi',
          url: '/admin/persembahan?status=Menunggu&pengingat=persembahan', page: '/admin/persembahan',
        },
        new_komsel_offering: {
          table: 'komsel_offerings', idColumn: 'id', ownerColumn: 'recorded_by',
          title: 'Persembahan Komsel Baru', label: 'mencatat persembahan komsel yang perlu diverifikasi',
          url: '/admin/persembahan?tab=komsel&status=Menunggu&pengingat=persembahan', page: '/admin/persembahan',
        },
      }
      const task = taskTypes[type]
      if (typeof referenceId !== 'string' || !referenceId) {
        return res.status(400).json({ error: 'Referensi pekerjaan admin wajib diisi.' })
      }
      const { data: record, error: recordError } = await admin
        .from(task.table)
        .select(task.idColumn + ', ' + task.ownerColumn + ', status, created_at')
        .eq(task.idColumn, referenceId)
        .maybeSingle()
      if (recordError) {
        console.error('[notify-admin] gagal memverifikasi referensi:', recordError.message)
        return res.status(500).json({ error: 'Referensi belum dapat diverifikasi.' })
      }
      if (!record || record[task.ownerColumn] !== caller.user_id || record.status !== 'Menunggu' || !recent(record.created_at)) {
        return res.status(403).json({ error: 'Pekerjaan admin baru tidak ditemukan.' })
      }
      title = task.title
      message = (caller.name || 'Seseorang') + ' baru saja ' + task.label + '.'
      url = task.url
      requiredPage = task.page
    } else {
      return res.status(400).json({ error: 'Tipe tidak valid.' })
    }

    // Kirim hanya kepada Admin aktif yang menuju halaman yang memang dapat
    // mereka tindak lanjuti. Super Admin selalu lolos; Admin tanpa baris
    // pengaturan mempertahankan akses penuh sesuai auth_admin_can().
    const { data: admins, error: adminsError } = await admin
      .from('users').select('user_id, role').in('role', ['Super Admin', 'Admin']).eq('status', 'Aktif')
    if (adminsError) {
      console.error('[notify-admin] gagal membaca admin:', adminsError.message)
      return res.status(500).json({ error: 'Penerima notifikasi belum dapat ditentukan.' })
    }

    const regularAdminIds = (admins || []).filter(item => item.role === 'Admin').map(item => item.user_id)
    let permissionRows = []
    if (regularAdminIds.length > 0) {
      const { data, error: permissionsError } = await admin
        .from('admin_user_permissions')
        .select('user_id, allowed_pages')
        .in('user_id', regularAdminIds)
      if (permissionsError) {
        console.error('[notify-admin] gagal membaca hak akses:', permissionsError.message)
        return res.status(500).json({ error: 'Hak akses penerima belum dapat diverifikasi.' })
      }
      permissionRows = data || []
    }
    const permissionByUser = new Map(permissionRows.map(row => [row.user_id, row.allowed_pages]))
    const adminIds = (admins || [])
      .filter(item => item.role === 'Super Admin'
        || !permissionByUser.has(item.user_id)
        || permissionByUser.get(item.user_id) === null
        || (Array.isArray(permissionByUser.get(item.user_id)) && permissionByUser.get(item.user_id).includes(requiredPage)))
      .map(item => item.user_id)
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

// Penerima Database Webhook Supabase: dipanggil real-time saat ada baris baru di
// `audit_log`. Bila aksinya SENSITIF (ubah role/is_pks, ubah NIK, hapus akun, ubah Hak
// Akses admin, ubah rekening), kirim push ke semua Super Admin. Tujuan: aktivitas
// berbahaya tidak lagi tenggelam di tabel audit yang pasif — Super Admin tahu SEKETIKA.
//
// Prasyarat manual (sekali) di Supabase Dashboard > Database > Webhooks:
//   - Table: audit_log, Events: INSERT
//   - Type: HTTP Request, Method: POST
//   - URL: https://escsiantan.my.id/api/audit-alert
//   - HTTP Header: Authorization = Bearer <AUDIT_WEBHOOK_SECRET>
// Set env AUDIT_WEBHOOK_SECRET di Vercel (nilai acak). VAPID & service-role reuse.
//
// CATATAN PRIVASI: push HANYA memuat NAMA KOLOM yang berubah + pelaku, TIDAK
// memuat nilai NIK/data pribadi. Payload webhook (yang berisi nilai) tetap di
// server, tidak diteruskan ke notifikasi.
export const config = { runtime: 'nodejs' }

// Definisi "sensitif" + label ringkas untuk notifikasi. Kembalikan null bila biasa.
function severity(r) {
  const t = r.table_name
  const a = r.action
  const cf = Array.isArray(r.changed_fields) ? r.changed_fields : []
  if (t === 'users' && a === 'DELETE') return 'Akun jemaat DIHAPUS'
  if (t === 'users' && a === 'UPDATE') {
    const hit = cf.filter(c => ['role', 'role_secondary', 'is_pks'].includes(c))
    if (hit.length) return `Ubah ${hit.join(', ')} pada akun jemaat`
  }
  if (['user_sensitive_identities', 'baptism_sensitive_identities', 'dedication_sensitive_identities'].includes(t)) {
    return 'Data NIK diperbarui'
  }
  if (t === 'admin_user_permissions') return 'Hak Akses admin diubah'
  if (t === 'payment_accounts') return 'Rekening pembayaran diubah'
  return null
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    // Guard: secret webhook wajib & dibandingkan konstan-waktu (fail-closed).
    const SECRET = (process.env.AUDIT_WEBHOOK_SECRET || '').trim()
    if (!SECRET) return res.status(500).json({ error: 'AUDIT_WEBHOOK_SECRET belum diatur.' })
    const { timingSafeEqual } = await import('crypto')
    const authVal = (req.headers.authorization || '').startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : ''
    const secretBuf = Buffer.from(SECRET)
    const authBuf = Buffer.from(authVal)
    if (secretBuf.length !== authBuf.length || !timingSafeEqual(secretBuf, authBuf)) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    // Payload standar Supabase DB Webhook: { type, table, record, old_record }.
    if (body.type !== 'INSERT' || body.table !== 'audit_log' || !body.record) {
      return res.status(200).json({ ok: true, ignored: 'bukan insert audit_log' })
    }
    const r = body.record
    const sev = severity(r)
    if (!sev) return res.status(200).json({ ok: true, ignored: 'tidak sensitif' })

    const webpush = (await import('web-push')).default
    const { createClient } = await import('@supabase/supabase-js')
    const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const SERVICE_ROLE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const VAPID_PUBLIC = (process.env.VAPID_PUBLIC_KEY || '').trim()
    const VAPID_PRIVATE = (process.env.VAPID_PRIVATE_KEY || '').trim()
    let VAPID_SUBJECT = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
    if (!/^(mailto:|https?:\/\/)/i.test(VAPID_SUBJECT)) VAPID_SUBJECT = 'mailto:' + VAPID_SUBJECT
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
      return res.status(500).json({ error: 'Environment variable belum lengkap.' })
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } })

    // Target = semua Super Admin KECUALI pelaku aksi (tak perlu notif diri sendiri).
    const { data: supers } = await admin.from('users').select('user_id').eq('role', 'Super Admin')
    const superIds = (supers || []).map(s => s.user_id).filter(id => id && id !== r.actor_user_id)
    if (superIds.length === 0) return res.status(200).json({ ok: true, sev, notified: 0 })

    const { data: subs } = await admin.from('push_subscriptions').select('*').in('user_id', superIds)
    const actor = r.actor_name ? `${r.actor_name}${r.actor_role ? ` (${r.actor_role})` : ''}` : 'Seseorang'
    const payload = JSON.stringify({
      title: 'Aktivitas Sensitif ⚠️',
      body: `${sev} oleh ${actor}.`,
      url: '/admin/audit',
    })

    let sent = 0, removed = 0
    await Promise.all((subs || []).map(async s => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
        sent++
      } catch (err) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); removed++
        }
      }
    }))

    return res.status(200).json({ ok: true, sev, targets: superIds.length, sent, removed })
  } catch (e) {
    console.error('[audit-alert]', e)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

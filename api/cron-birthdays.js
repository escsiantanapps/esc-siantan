// Cron harian: beri tahu PKS kalau ada anggota komselnya yang ulang tahun
// hari ini, supaya PKS bisa tulis pesan personal (lihat tab Ulang Tahun di
// Dashboard PKS). Dipanggil Vercel Cron (lihat vercel.json). Dilindungi CRON_SECRET.
export const config = { runtime: 'nodejs' }

export default async function handler(req, res) {
  try {
    const CRON_SECRET = (process.env.CRON_SECRET || '').trim()
    if (CRON_SECRET) {
      const auth = req.headers.authorization || ''
      if (auth !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: 'Unauthorized' })
    }

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

    // Hari ini di zona WIB (cocokkan month-day, abaikan tahun lahir).
    const todayWib = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', month: '2-digit', day: '2-digit' }).format(new Date())
    const [todayMonth, todayDay] = todayWib.split('-')

    const { data: users } = await admin
      .from('users').select('user_id, name, birth_date, komsel_id')
      .eq('status', 'Aktif').not('birth_date', 'is', null).not('komsel_id', 'is', null)
    const birthdayUsers = (users || []).filter(u => {
      const d = new Date(u.birth_date)
      return String(d.getUTCMonth() + 1).padStart(2, '0') === todayMonth && String(d.getUTCDate()).padStart(2, '0') === todayDay
    })
    if (birthdayUsers.length === 0) return res.status(200).json({ ok: true, birthdays: 0 })

    const komselIds = [...new Set(birthdayUsers.map(u => u.komsel_id))]
    const { data: leaders } = await admin
      .from('komsel_leaders').select('komsel_id, user_id').in('komsel_id', komselIds)
    const { data: subs } = await admin.from('push_subscriptions').select('*')
    const subsByUser = {}
    for (const s of subs || []) (subsByUser[s.user_id] ||= []).push(s)

    // Kelompokkan nama-nama ulang tahun per PKS (1 PKS bisa pimpin >1 komsel).
    const namesByPks = {}
    for (const u of birthdayUsers) {
      for (const l of (leaders || []).filter(l => l.komsel_id === u.komsel_id)) {
        ;(namesByPks[l.user_id] ||= []).push(u.name)
      }
    }

    let totalSent = 0, removed = 0
    for (const [pksId, names] of Object.entries(namesByPks)) {
      const payload = JSON.stringify({
        title: 'Ulang Tahun Anggota Komsel 🎉',
        body: names.length === 1
          ? `${names[0]} berulang tahun hari ini. Yuk kirim ucapan!`
          : `${names.length} anggota komsel Anda ulang tahun hari ini: ${names.join(', ')}`,
        url: '/pks',
      })
      for (const s of subsByUser[pksId] || []) {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          totalSent++
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); removed++
          }
        }
      }
    }

    return res.status(200).json({ ok: true, birthdays: birthdayUsers.length, pksNotified: Object.keys(namesByPks).length, totalSent, removed })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}

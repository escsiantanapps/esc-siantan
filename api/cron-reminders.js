// Cron harian: kirim pengingat push untuk tugas yang dijadwalkan hari ini,
// hanya ke jemaat yang BELUM memenuhi target pada periode berjalan.
// Dipanggil Vercel Cron (lihat vercel.json). Dilindungi CRON_SECRET.
export const config = { runtime: 'nodejs' }

function startOfWeekMonday(d) {
  const x = new Date(d); const day = (x.getUTCDay() + 6) % 7
  x.setUTCDate(x.getUTCDate() - day); x.setUTCHours(0, 0, 0, 0); return x
}
function startOfMonth(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)) }
const norm = s => String(s || '').trim().toLowerCase()

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

    // Nama hari ini (zona WIB), mis. "Senin".
    const todayId = norm(new Intl.DateTimeFormat('id-ID', { weekday: 'long', timeZone: 'Asia/Jakarta' }).format(new Date()))

    const { data: templates } = await admin
      .from('form_templates').select('form_id, title, weekly_goal, period, reminder_enabled, reminder_days, allowed_roles')
      .eq('reminder_enabled', true)
    const due = (templates || []).filter(t => (t.reminder_days || []).some(d => norm(d) === todayId))
    if (due.length === 0) return res.status(200).json({ ok: true, today: todayId, due: 0 })

    // Pra-ambil langganan push & subset user yang berlangganan.
    const { data: subs } = await admin.from('push_subscriptions').select('*')
    const subsByUser = {}
    for (const s of subs || []) (subsByUser[s.user_id] ||= []).push(s)

    let totalSent = 0, removed = 0
    const report = []
    for (const tpl of due) {
      const goal = tpl.weekly_goal || 1
      const periodStart = tpl.period === 'bulan' ? startOfMonth(new Date()) : startOfWeekMonday(new Date())

      // Eligible: bila tugas dibatasi ministry → anggota ministry tsb; jika tidak → semua user aktif.
      const { data: tms } = await admin.from('template_ministries').select('ministry_id').eq('form_id', tpl.form_id)
      let eligible = []
      if ((tms || []).length) {
        const mids = tms.map(m => m.ministry_id)
        const { data: ums } = await admin.from('user_ministries').select('user_id').in('ministry_id', mids)
        eligible = [...new Set((ums || []).map(u => u.user_id))]
      } else {
        const { data: us } = await admin.from('users').select('user_id').eq('status', 'Aktif')
        eligible = (us || []).map(u => u.user_id)
      }

      // Batasan role: bila diisi, saring eligible ke user dengan role yang cocok.
      // Pertimbangkan role utama DAN role kedua (mis. Admin yang juga Volunteer
      // tetap menerima pengingat). PKS dikenali lewat is_pks ATAU role 'PKS'.
      const roles = tpl.allowed_roles || []
      if (roles.length) {
        const { data: urs } = await admin.from('users').select('user_id, role, role_secondary, is_pks')
          .in('user_id', eligible.length ? eligible : ['__none__'])
        const ok = new Set((urs || [])
          .filter(u =>
            roles.includes(u.role) ||
            roles.includes(u.role_secondary) ||
            (roles.includes('PKS') && (u.is_pks === true || u.role_secondary === 'PKS')))
          .map(u => u.user_id))
        eligible = eligible.filter(id => ok.has(id))
      }

      // Hitung yang sudah memenuhi target pada periode ini.
      const { data: resp } = await admin
        .from('form_responses').select('volunteer_id')
        .eq('form_id', tpl.form_id).gte('submitted_at', periodStart.toISOString())
      const count = {}
      for (const r of resp || []) count[r.volunteer_id] = (count[r.volunteer_id] || 0) + 1
      const targets = eligible.filter(uid => (count[uid] || 0) < goal)

      const payload = JSON.stringify({
        title: 'Pengingat Tugas',
        body: `Jangan lupa kerjakan: ${tpl.title}`,
        url: `/tugas/${tpl.form_id}`,
      })
      let sent = 0
      const errors = []
      await Promise.all(targets.flatMap(uid => (subsByUser[uid] || []).map(async s => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
          sent++
        } catch (err) {
          if (err.statusCode === 404 || err.statusCode === 410) {
            await admin.from('push_subscriptions').delete().eq('endpoint', s.endpoint); removed++
          } else {
            errors.push({ user_id: s.user_id, statusCode: err.statusCode || null, detail: String(err.body || err.message || err).slice(0, 300) })
          }
        }
      })))
      totalSent += sent
      report.push({ form: tpl.title, targets: targets.length, sent, errors })
    }

    return res.status(200).json({ ok: true, today: todayId, due: due.length, totalSent, removed, report })
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) })
  }
}

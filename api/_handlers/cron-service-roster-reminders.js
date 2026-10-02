export const config = { runtime: 'nodejs' }

import { sendRosterNotifications } from '../_lib/service-roster-notifications.js'

export default async function handler(req, res) {
  try {
    if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' })
    const secret = (process.env.CRON_SECRET || '').trim()
    if (!secret) return res.status(500).json({ error: 'CRON_SECRET belum diatur di server.' })
    const { timingSafeEqual } = await import('crypto')
    const supplied = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    const a = Buffer.from(secret)
    const b = Buffer.from(supplied)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return res.status(401).json({ error: 'Unauthorized' })

    const { createClient } = await import('@supabase/supabase-js')
    const webpush = (await import('web-push')).default
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim()
    const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim()
    let vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
    if (!/^(mailto:|https?:\/\/)/i.test(vapidSubject)) vapidSubject = `mailto:${vapidSubject}`
    if (!url || !serviceKey || !vapidPublic || !vapidPrivate) return res.status(500).json({ error: 'Environment variable belum lengkap.' })

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta', year: 'numeric', month: '2-digit', day: '2-digit' }).format(tomorrow)
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: rosters, error } = await admin.from('service_rosters').select('*').eq('status', 'Terbit').eq('service_date', date)
    if (error) throw error
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    let targets = 0
    let sent = 0
    let failedRecipients = 0
    for (const roster of rosters || []) {
      const { data: slots, error: slotsError } = await admin.from('service_roster_slots').select('user_id').eq('roster_id', roster.roster_id).not('user_id', 'is', null)
      if (slotsError) throw slotsError
      const result = await sendRosterNotifications({ admin, webpush, roster, userIds: (slots || []).map(row => row.user_id), kind: 'Pengingat H-1' })
      targets += result.targetCount || 0
      sent += (result.sent || 0) + (result.fcm?.sent || 0)
      failedRecipients += result.failedRecipients || 0
    }
    return res.status(failedRecipients ? 503 : 200).json({
      ok: failedRecipients === 0, date,
      rosters: rosters?.length || 0, targets, sent, failedRecipients,
    })
  } catch (error) {
    console.error('[cron-service-roster-reminders]', error)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

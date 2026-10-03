export const config = { runtime: 'nodejs' }

import { checkRateLimit } from '../_lib/rate-limit.js'
import { sendRosterNotifications } from '../_lib/service-roster-notifications.js'

const ALLOWED_KINDS = ['Terbit', 'Dibatalkan', 'Manual']
const ADMIN_ROLES = new Set(['Admin', 'Super Admin', 'Gembala'])
const MONTH_PAGE_SIZE = 24

async function notifyMonth({ admin, webpush, monthId, kind, offset }) {
  const { data: month, error: monthError } = await admin.from('service_schedule_months')
    .select('month_id, status').eq('month_id', monthId).maybeSingle()
  if (monthError) throw monthError
  if (!month) return { status: 404, body: { error: 'Jadwal tidak ditemukan.' } }
  const expectedStatus = kind === 'Dibatalkan' ? 'Dibatalkan' : 'Terbit'
  if (month.status !== expectedStatus) return { status: 409, body: { error: 'Status jadwal tidak sesuai.' } }

  // Batasi beban tiap invokasi; ID roster ditentukan server, bukan kiriman klien.
  const { data: rows, error: partsError } = await admin.from('service_schedule_parts')
    .select('roster_id, service_rosters!roster_id(*), service_schedule_occurrences!occurrence_id!inner(month_id)')
    .eq('service_schedule_occurrences.month_id', monthId).order('part_id')
    .range(offset, offset + MONTH_PAGE_SIZE)
  if (partsError) throw partsError
  const page = (rows || []).slice(0, MONTH_PAGE_SIZE)
  if (page.some(part => !part.service_rosters || part.service_rosters.status !== expectedStatus)) {
    return { status: 409, body: { error: 'Status jadwal tidak sesuai.' } }
  }
  const total = { targetCount: 0, sent: 0, removed: 0, failedRecipients: 0, noSubscriptionCount: 0, duplicateCount: 0, fcm: { sent: 0, removed: 0 } }
  for (let index = 0; index < page.length; index += 4) {
    const results = await Promise.all(page.slice(index, index + 4).map(async part => {
      const { data: slots, error } = await admin.from('service_roster_slots')
        .select('user_id').eq('roster_id', part.roster_id).not('user_id', 'is', null)
      if (error) throw error
      return sendRosterNotifications({ admin, webpush, roster: part.service_rosters, userIds: (slots || []).map(slot => slot.user_id), kind })
    }))
    for (const result of results) {
      for (const key of ['targetCount', 'sent', 'removed', 'failedRecipients', 'noSubscriptionCount', 'duplicateCount']) total[key] += result[key] || 0
      total.fcm.sent += result.fcm?.sent || 0
      total.fcm.removed += result.fcm?.removed || 0
    }
  }
  return { status: 200, body: { ok: true, ...total, rosterCount: page.length,
    nextOffset: (rows || []).length > MONTH_PAGE_SIZE ? offset + MONTH_PAGE_SIZE : null } }
}

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
    if (checkRateLimit(req, res, { max: 8, windowMs: 60_000, endpoint: 'notify-service-roster' })) return

    const { createClient } = await import('@supabase/supabase-js')
    const webpush = (await import('web-push')).default
    const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
    const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    const vapidPublic = (process.env.VAPID_PUBLIC_KEY || '').trim()
    const vapidPrivate = (process.env.VAPID_PRIVATE_KEY || '').trim()
    let vapidSubject = (process.env.VAPID_SUBJECT || 'mailto:admin@escsiantan.app').trim()
    if (!/^(mailto:|https?:\/\/)/i.test(vapidSubject)) vapidSubject = `mailto:${vapidSubject}`
    if (!url || !serviceKey || !vapidPublic || !vapidPrivate) {
      return res.status(500).json({ error: 'Konfigurasi server belum lengkap.' })
    }

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim()
    if (!token) return res.status(401).json({ error: 'Unauthorized' })
    const admin = createClient(url, serviceKey, { auth: { persistSession: false } })
    const { data: authData, error: authError } = await admin.auth.getUser(token)
    if (authError || !authData?.user) return res.status(401).json({ error: 'Unauthorized' })
    const { data: caller, error: callerError } = await admin.from('users').select('user_id, role, role_secondary').eq('auth_id', authData.user.id).eq('status', 'Aktif').maybeSingle()
    if (callerError) throw callerError
    if (!caller) return res.status(403).json({ error: 'Forbidden' })

    let body
    try { body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) }
    catch { return res.status(400).json({ error: 'Permintaan tidak valid.' }) }
    const rosterId = typeof body.rosterId === 'string' ? body.rosterId.trim() : ''
    const monthId = typeof body.monthId === 'string' ? body.monthId.trim() : ''
    const kind = typeof body.kind === 'string' ? body.kind.trim() : ''
    const offset = body.offset ?? 0
    if (Boolean(rosterId) === Boolean(monthId) || !ALLOWED_KINDS.includes(kind)
      || (monthId && (!Number.isInteger(offset) || offset < 0 || offset > 10_000))) {
      return res.status(400).json({ error: 'Permintaan tidak valid.' })
    }
    let authorized = caller.role === 'Super Admin'
    if (caller.role === 'Admin') {
      const { data: permission, error: permissionError } = await admin.from('admin_user_permissions').select('allowed_pages').eq('user_id', caller.user_id).maybeSingle()
      if (permissionError) throw permissionError
      authorized = !permission || permission.allowed_pages === null
        || (Array.isArray(permission.allowed_pages) && permission.allowed_pages.includes('/admin/jadwal-pelayanan'))
    }
    if (monthId) {
      if (!authorized) return res.status(403).json({ error: 'Anda tidak memiliki hak mengelola jadwal ini.' })
      webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
      const result = await notifyMonth({ admin, webpush, monthId, kind, offset })
      return res.status(result.status).json(result.body)
    }
    const { data: roster, error: rosterError } = await admin.from('service_rosters').select('*').eq('roster_id', rosterId).maybeSingle()
    if (rosterError) throw rosterError
    if (!roster) return res.status(404).json({ error: 'Jadwal tidak ditemukan.' })
    if (!authorized && !ADMIN_ROLES.has(caller.role) && !ADMIN_ROLES.has(caller.role_secondary)) {
      let { data: grant, error: grantError } = await admin.from('ministry_schedule_managers')
        .select('user_id, manager_role, ministries!ministry_id(head_user_id)')
        .eq('ministry_id', roster.ministry_id).eq('user_id', caller.user_id).eq('is_active', true).maybeSingle()
      if (grantError && ['42703', 'PGRST200', 'PGRST204'].includes(grantError.code)) {
        const fallback = await admin.from('ministry_schedule_managers')
          .select('user_id, manager_role')
          .eq('ministry_id', roster.ministry_id).eq('user_id', caller.user_id).eq('is_active', true).maybeSingle()
        grant = fallback.data
        grantError = fallback.error
      }
      if (grantError) throw grantError
      let validHead = false
      if (grant?.manager_role === 'Ministry Head' && caller.role === 'Volunteer'
        && grant.ministries?.head_user_id === caller.user_id) {
        const { data: membership, error: membershipError } = await admin.from('user_ministries')
          .select('user_id').eq('ministry_id', roster.ministry_id).eq('user_id', caller.user_id).maybeSingle()
        if (membershipError) throw membershipError
        validHead = !!membership
      }
      authorized = ['Jemaat', 'Volunteer', 'PKS'].includes(caller.role) && !!grant
        && (grant.manager_role === 'Wakil' || validHead)
    }
    if (!authorized) return res.status(403).json({ error: 'Anda tidak memiliki hak mengelola jadwal ini.' })
    if (['Terbit', 'Manual'].includes(kind) && roster.status !== 'Terbit') return res.status(409).json({ error: 'Jadwal belum diterbitkan.' })
    if (kind === 'Dibatalkan' && roster.status !== 'Dibatalkan') return res.status(409).json({ error: 'Jadwal belum dibatalkan.' })

    const { data: slots, error: slotsError } = await admin.from('service_roster_slots').select('user_id').eq('roster_id', rosterId).not('user_id', 'is', null)
    if (slotsError) throw slotsError
    webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate)
    const result = await sendRosterNotifications({ admin, webpush, roster, userIds: (slots || []).map(row => row.user_id), kind })
    return res.status(200).json({ ok: true, ...result })
  } catch (error) {
    console.error('[notify-service-roster]', error)
    return res.status(500).json({ error: 'Terjadi kesalahan internal.' })
  }
}

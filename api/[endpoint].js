export const config = { runtime: 'nodejs' }

// Folder _handlers tidak menjadi fungsi tersendiri di Vercel. URL lama tetap
// dipakai agar PWA terpasang dan cron tidak perlu mengganti alamat endpoint.
const handlers = new Map([
  ['/api/notify-admin', () => import('./_handlers/notify-admin.js')],
  ['/api/notify-pks', () => import('./_handlers/notify-pks.js')],
  ['/api/notify-service-roster', () => import('./_handlers/notify-service-roster.js')],
  ['/api/send-push', () => import('./_handlers/send-push.js')],
  ['/api/cron-reminders', () => import('./_handlers/cron-reminders.js')],
  ['/api/cron-service-roster-reminders', () => import('./_handlers/cron-service-roster-reminders.js')],
  ['/api/cron-birthdays', () => import('./_handlers/cron-birthdays.js')],
  ['/api/cron-backup', () => import('./_handlers/cron-backup.js')],
])

export default async function handler(req, res) {
  let pathname
  try { pathname = new URL(req.url, 'http://localhost').pathname }
  catch { return res.status(404).json({ error: 'Endpoint tidak ditemukan.' }) }

  // Query/body tidak boleh memilih handler atau menimpa slot/action milik cron.
  const load = handlers.get(pathname.replace(/\/$/, '').replace(/\.js$/, ''))
  if (!load) return res.status(404).json({ error: 'Endpoint tidak ditemukan.' })
  const { default: handle } = await load()
  return handle(req, res)
}

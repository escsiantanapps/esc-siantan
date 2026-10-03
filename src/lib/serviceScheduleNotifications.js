export async function notifyScheduleMonth({ monthId, kind, getAccessToken, request = fetch,
  wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)) }) {
  const total = { targetCount: 0, sent: 0, removed: 0, failedRecipients: 0, noSubscriptionCount: 0,
    duplicateCount: 0, rosterCount: 0, fcm: { sent: 0, removed: 0 } }
  let offset = 0
  while (offset !== null) {
    let result
    for (let attempt = 0; ; attempt++) {
      const token = await getAccessToken()
      if (!token) throw new Error('Sesi login tidak tersedia.')
      const response = await request('/api/notify-service-roster', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monthId, kind, offset }),
      })
      if (response.status === 429 && attempt < 3) {
        // Pertahankan batas server; bulan besar menunggu kuota, bukan melewatinya.
        const seconds = Number(response.headers.get('Retry-After')) || 60
        await wait(Math.max(1000, Math.min(seconds * 1000, 60_000)))
        continue
      }
      result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Notifikasi gagal dikirim.')
      break
    }
    for (const key of ['targetCount', 'sent', 'removed', 'failedRecipients', 'noSubscriptionCount', 'duplicateCount', 'rosterCount']) total[key] += Number(result[key]) || 0
    total.fcm.sent += Number(result.fcm?.sent) || 0
    total.fcm.removed += Number(result.fcm?.removed) || 0
    if (result.nextOffset !== null && (!Number.isInteger(result.nextOffset)
      || result.nextOffset <= offset || result.nextOffset > 10_000)) throw new Error('Urutan pengiriman tidak valid.')
    offset = result.nextOffset
  }
  return { ...total, duplicate: total.duplicateCount > 0
    && total.duplicateCount + total.noSubscriptionCount === total.targetCount }
}

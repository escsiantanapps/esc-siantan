function notificationCopy(roster, kind) {
  const date = new Intl.DateTimeFormat('id-ID', {
    timeZone: 'Asia/Jakarta', day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(`${roster.service_date}T00:00:00+07:00`))
  const time = String(roster.start_time || '').slice(0, 5)
  if (kind === 'Dibatalkan') return {
    title: 'Jadwal Pelayanan Dibatalkan',
    body: `${roster.title} pada ${date} telah dibatalkan.`,
  }
  if (kind === 'Pengingat H-1') return {
    title: 'Pengingat Pelayanan Besok',
    body: `${roster.title}, pukul ${time}${roster.location ? ` di ${roster.location}` : ''}.`,
  }
  return {
    title: kind === 'Manual' ? 'Pengingat Pelayanan' : 'Jadwal Pelayanan Baru',
    body: `${roster.title}, ${date} pukul ${time}.`,
  }
}

export async function sendRosterNotifications({ admin, webpush, roster, userIds, kind }) {
  const requestedRecipients = [...new Set((userIds || []).filter(Boolean))]
  const emptyResult = { targetCount: 0, sent: 0, removed: 0, failedRecipients: 0, noSubscriptionCount: 0, duplicateCount: 0, fcm: { sent: 0, removed: 0 } }
  if (!requestedRecipients.length) return emptyResult

  const { data: users, error: usersError } = await admin.from('users').select('user_id').in('user_id', requestedRecipients).eq('status', 'Aktif')
  if (usersError) throw usersError
  const recipients = (users || []).map(user => user.user_id)
  if (!recipients.length) return emptyResult

  const { data: subscriptions, error: subscriptionsError } = await admin.from('push_subscriptions').select('*').in('user_id', recipients)
  if (subscriptionsError) throw subscriptionsError
  const { fcmAvailable, sendFcm } = await import('./fcm.js')
  let tokens = []
  if (fcmAvailable()) {
    const { data, error } = await admin.from('device_tokens').select('token, user_id').in('user_id', recipients)
    if (error) throw error
    tokens = data || []
  }

  const groupByUser = rows => {
    const groups = new Map()
    for (const row of rows || []) {
      if (!groups.has(row.user_id)) groups.set(row.user_id, [])
      groups.get(row.user_id).push(row)
    }
    return groups
  }
  const subscriptionsByUser = groupByUser(subscriptions)
  const tokensByUser = groupByUser(tokens)

  const copy = notificationCopy(roster, kind)
  const url = `/jadwal-pelayanan?rosterId=${encodeURIComponent(roster.roster_id)}`
  const payload = JSON.stringify({ ...copy, url })
  const attempts = await Promise.allSettled(recipients.map(async userId => {
    const userSubscriptions = subscriptionsByUser.get(userId) || []
    const userTokens = tokensByUser.get(userId) || []
    if (!userSubscriptions.length && !userTokens.length) return { noSubscription: true }

    // Kunci unik di RPC memberikan satu klaim aktif per pengguna dan versi.
    const { data: claimToken, error: claimError } = await admin.rpc('claim_service_roster_notification', {
      p_roster_id: roster.roster_id,
      p_user_id: userId,
      p_kind: kind,
      p_roster_version: roster.version,
    })
    if (claimError) throw claimError
    if (!claimToken) return { duplicate: true }

    let sent = 0
    let removed = 0
    await Promise.all(userSubscriptions.map(async subscription => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        }, payload)
        sent++
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          const { error: removeError } = await admin.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint)
          if (removeError) console.error('[service-roster-notifications] Cleanup:', removeError)
          else removed++
        }
      }
    }))

    let fcm = { sent: 0, removed: 0 }
    if (userTokens.length) {
      try { fcm = await sendFcm(admin, userTokens, { ...copy, url }) }
      catch (error) { console.error('[service-roster-notifications] FCM:', error) }
    }
    const delivered = sent + fcm.sent > 0
    const { data: saved, error: saveError } = await admin.from('service_roster_notification_logs')
      .update({
        delivery_status: delivered ? 'sent' : 'failed',
        sent_at: new Date().toISOString(),
        claim_token: null,
      })
      .eq('roster_id', roster.roster_id)
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('roster_version', roster.version)
      .eq('claim_token', claimToken)
      .select('notification_id')
    if (saveError) throw saveError
    if (!saved?.length) throw new Error('Klaim pengiriman notifikasi tidak lagi aktif.')
    return { sent, removed, fcm, failed: !delivered }
  }))

  const failedAttempt = attempts.find(attempt => attempt.status === 'rejected')
  if (failedAttempt) throw failedAttempt.reason

  const result = { ...emptyResult, targetCount: recipients.length, fcm: { sent: 0, removed: 0 } }
  for (const { value } of attempts) {
    result.sent += value.sent || 0
    result.removed += value.removed || 0
    result.fcm.sent += value.fcm?.sent || 0
    result.fcm.removed += value.fcm?.removed || 0
    if (value.failed) result.failedRecipients++
    if (value.noSubscription) result.noSubscriptionCount++
    if (value.duplicate) result.duplicateCount++
  }
  result.duplicate = result.duplicateCount > 0
    && result.duplicateCount + result.noSubscriptionCount === recipients.length
  return result
}

/* Handler Web Push — diimpor oleh service worker Workbox (lihat vite.config.js).
   Menampilkan notifikasi saat ada push, dan membuka halaman tujuan saat diklik. */

self.addEventListener('push', function (event) {
  event.waitUntil(
    (async () => {
      let data = {}
      try {
        data = event.data ? event.data.json() : {}
      } catch (e) {
        data = { title: 'ESC Siantan', body: event.data ? event.data.text() : '' }
      }

      const title = data.title || 'ESC Siantan'
      const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/badge-96.png',
        vibrate: [80, 40, 80],
        data: { url: data.url || '/' },
      }

      try {
        await self.registration.showNotification(title, options)
      } catch (e) {
        // Apa pun sebabnya (opsi tak valid, dll), TETAP tampilkan sesuatu.
        // Push tanpa notifikasi yang terlihat ("silent push") membuat Chrome
        // menghukum dengan mencabut subscription setelah beberapa kali.
        await self.registration.showNotification('ESC Siantan', { body: 'Ada notifikasi baru.' })
      }
    })()
  )
})

// Batasi tujuan navigasi ke path same-origin saja. Payload push berasal dari
// server yang trusted, tapi ini defense-in-depth: bila endpoint /api/send-push
// disalahgunakan (mis. admin nakal / kredensial bocor), attacker tidak bisa
// mengarahkan jemaat ke situs phishing lewat notifikasi push.
function safeSameOriginPath(raw) {
  try {
    const u = new URL(raw || '/', self.location.origin)
    if (u.origin !== self.location.origin) return '/'
    return u.pathname + u.search + u.hash
  } catch {
    return '/'
  }
}

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = safeSameOriginPath(event.notification.data && event.notification.data.url)

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url)
    })
  )
})

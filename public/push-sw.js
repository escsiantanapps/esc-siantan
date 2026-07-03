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

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/'

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

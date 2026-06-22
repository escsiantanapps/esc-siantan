import { supabase } from '@/lib/supabase'

// Kunci publik VAPID — wajib diset via env VITE_VAPID_PUBLIC_KEY.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY
if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY belum diset di .env')

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export const pushService = {
  supported() {
    return (
      typeof navigator !== 'undefined' &&
      'serviceWorker' in navigator &&
      'PushManager' in window &&
      'Notification' in window
    )
  },

  permission() {
    return this.supported() ? Notification.permission : 'denied'
  },

  async isSubscribed() {
    if (!this.supported()) return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  },

  async subscribe(userId) {
    if (!this.supported()) throw new Error('Browser ini tidak mendukung notifikasi push.')

    const permission = await Notification.requestPermission()
    if (permission !== 'granted') throw new Error('Izin notifikasi tidak diberikan.')

    const reg = await navigator.serviceWorker.ready
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }

    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: sub.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        user_id: userId,
      },
      { onConflict: 'endpoint' }
    )
    if (error) throw error
    return true
  },

  // Kirim notifikasi ke semua pelanggan (dipanggil oleh admin). Memanggil
  // serverless function /api/send-push dengan access token admin.
  async broadcast({ title, body, url, userIds }) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Sesi tidak ditemukan.')
    const res = await fetch('/api/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, body, url, userIds }),
    })
    if (!res.ok) {
      const e = await res.json().catch(() => ({}))
      throw new Error(e.error || 'Gagal mengirim notifikasi.')
    }
    return res.json()
  },

  async unsubscribe() {
    if (!this.supported()) return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    return false
  },
}

import { supabase } from '@/lib/supabase'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'

// Kunci publik VAPID — wajib diset via env VITE_VAPID_PUBLIC_KEY.
// Dicek saat subscribe() dipanggil (bukan saat modul di-import) agar
// fitur lain tidak ikut crash jika env ini belum diset di suatu deployment.
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
}

export const pushService = {
  supported() {
    if (Capacitor.isNativePlatform()) return true
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
    if (Capacitor.isNativePlatform()) {
      const { receive } = await PushNotifications.checkPermissions()
      return receive === 'granted'
    }
    if (!this.supported()) return false
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    return !!sub
  },

  async subscribe(userId) {
    if (Capacitor.isNativePlatform()) {
      let permStatus = await PushNotifications.checkPermissions();
      if (permStatus.receive === 'prompt') {
        permStatus = await PushNotifications.requestPermissions();
      }
      if (permStatus.receive !== 'granted') {
        throw new Error('Izin notifikasi tidak diberikan.');
      }
      
      // Register with Apple / Google to receive push via APNS/FCM
      await PushNotifications.register();
      
      // Buat channel untuk Android (wajib di Android 8.0+)
      try {
        await PushNotifications.createChannel({
          id: 'fcm_default_channel',
          name: 'Notifikasi Umum',
          description: 'Notifikasi penting dari ESC Siantan',
          importance: 5,
          visibility: 1,
          vibration: true,
        });
      } catch (e) {
        console.warn('Gagal membuat channel notifikasi', e);
      }
      
      // Listener saat notifikasi ditekan (membuka app)
      PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
        console.log('Push action performed: ', notification);
      });
      
      return new Promise((resolve, reject) => {
        // Handle successful registration
        PushNotifications.addListener('registration', async (token) => {
          try {
            const { error } = await supabase.from('push_subscriptions').upsert(
              {
                endpoint: token.value, // Save FCM token as endpoint
                p256dh: '', // string kosong untuk melewati NOT NULL constraint DB
                auth: '',
                user_id: userId,
              },
              { onConflict: 'endpoint' }
            )
            if (error) throw error;
            resolve(true);
          } catch (e) {
            reject(e);
          }
        });
        
        PushNotifications.addListener('registrationError', (error) => {
          reject(new Error('Gagal mendaftarkan notifikasi: ' + JSON.stringify(error)));
        });
      });
    }

    // WebPush Flow
    if (!this.supported()) throw new Error('Browser ini tidak mendukung notifikasi push.')
    if (!VAPID_PUBLIC_KEY) throw new Error('VITE_VAPID_PUBLIC_KEY belum diset di .env')

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

  // Beri tahu PKS komsel bahwa anggota baru saja mengisi sebuah SOP/tugas.
  // Dipanggil oleh anggota setelah submit tugas (fire-and-forget): kegagalan
  // diabaikan agar tidak mengganggu alur pengisian. Server yang menentukan
  // siapa PKS-nya & melakukan dedupe (lihat api/notify-pks.js).
  async notifyLeaders(formId) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const API_BASE = import.meta.env.VITE_API_URL || ''
    await fetch(`${API_BASE}/api/notify-pks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ formId }),
    }).catch(console.error)
  },

  // Beri tahu Admin bahwa ada pendaftaran baru, kelas baru, dsb.
  async notifyAdmin(type, payload = {}) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) return
    const API_BASE = import.meta.env.VITE_API_URL || ''
    await fetch(`${API_BASE}/api/notify-admin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ type, payload }),
    }).catch(console.error)
  },

  // Kirim notifikasi ke semua pelanggan (dipanggil oleh admin). Memanggil
  // serverless function /api/send-push dengan access token admin.
  async broadcast({ title, body, url, userIds }) {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token
    if (!token) throw new Error('Sesi tidak ditemukan.')
    const API_BASE = import.meta.env.VITE_API_URL || ''
    const res = await fetch(`${API_BASE}/api/send-push`, {
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
    
    if (Capacitor.isNativePlatform()) {
      // Di Capacitor, mematikan notifikasi terbaik lewat pengaturan sistem Android/iOS,
      // atau hapus semua langganan FCM user (tidak ideal jika multi-perangkat, tapi OK untuk saat ini)
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        // Hapus token-token FCM dari DB (token FCM cirinya tidak mengandung 'http')
        await supabase.from('push_subscriptions').delete().eq('user_id', session.user.id).not('endpoint', 'ilike', 'http%')
      }
      return false
    }

    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
    return false
  },
}

import { useEffect } from 'react'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'

export default function HardwareBackButton() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listener = CapApp.addListener('backButton', async ({ canGoBack }) => {
      // Daftar halaman utama yang diizinkan untuk keluar dari aplikasi
      const currentPath = window.location.pathname
      const rootPaths = ['/', '/login', '/admin']
      
      // Jika berada di halaman utama ATAU tidak bisa mundur lagi
      if (rootPaths.includes(currentPath) || !canGoBack) {
        const { value } = await Dialog.confirm({
          title: 'Tutup Aplikasi',
          message: 'Apakah Anda yakin ingin keluar dari ESC Siantan?',
          okButtonTitle: 'Ya, Keluar',
          cancelButtonTitle: 'Batal'
        })
        if (value) {
          CapApp.exitApp()
        }
      } else {
        // Mundur satu halaman
        window.history.back()
      }
    })

    return () => {
      listener.then(l => l.remove()).catch(e => console.error(e))
    }
  }, [])

  return null
}

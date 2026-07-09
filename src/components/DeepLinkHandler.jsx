import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { App as CapApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export default function DeepLinkHandler() {
  const navigate = useNavigate()

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const listener = CapApp.addListener('appUrlOpen', (event) => {
      // event.url = https://esc-siantan.com/class/123
      const slug = event.url.split('.com').pop()
      if (slug) {
        navigate(slug)
      }
    })

    return () => {
      listener.then(l => l.remove())
    }
  }, [navigate])

  return null
}

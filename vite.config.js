import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['church-icon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        scope: '/',
        name: 'ESC Siantan',
        short_name: 'ESC Siantan',
        description: 'Aplikasi Manajemen Jemaat ESC Siantan',
        start_url: '/',
        display: 'standalone',
        // Utamakan fullscreen agar konten penuh hingga ke atas layar (tanpa bar
        // status OS yang memisah), seperti aplikasi native. Fallback ke standalone.
        display_override: ['fullscreen', 'standalone'],
        lang: 'id',
        dir: 'ltr',
        categories: ['lifestyle', 'social', 'productivity'],
        background_color: '#ffffff',
        theme_color: '#F4511E',
        orientation: 'portrait',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico}'],
        // Impor handler push ke dalam service worker hasil generate Workbox
        importScripts: ['push-sw.js'],
        // Navigasi offline jatuh ke shell SPA yang sudah ter-precache,
        // kecuali endpoint API (jangan di-serve dari cache).
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin.includes('supabase.co') && url.pathname.includes('/storage/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
})

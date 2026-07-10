import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: '/CornerstoneTimeClock/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico'],
      manifest: {
        name: 'Cornerstone Time Clock',
        short_name: 'TimeClock',
        description: 'Real-time crew time tracking',
        theme_color: '#0d1f3a',
        background_color: '#0d1f3a',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/CornerstoneTimeClock/',
        scope: '/CornerstoneTimeClock/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        navigateFallback: '/CornerstoneTimeClock/index.html',
        navigateFallbackDenylist: [/^\/__/]
      }
    })
  ],
  build: { target: 'esnext' }
})

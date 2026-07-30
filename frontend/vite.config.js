import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'POS Chanatos',
        short_name: 'Chanatos',
        description: 'Sistema POS interno para Chanatos',
        theme_color: '#F5BB4C',
        background_color: '#FFF8E7',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ],
        start_url: '/',
        scope: '/'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        // Sin esto, un service worker nuevo se instala pero se queda "esperando"
        // hasta que se cierren TODAS las pestañas abiertas de ese origen antes de
        // activarse — en la práctica, cambios que sí llegaron al servidor
        // parecían no verse nunca en el celular por más que se recargara.
        skipWaiting: true,
        clientsClaim: true
      }
    })
  ],
  server: {
    port: 5173,
    host: '0.0.0.0'
  }
});


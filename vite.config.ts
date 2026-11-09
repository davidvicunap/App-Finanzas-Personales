/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// `base` debe coincidir con la ruta de GitHub Pages:
// https://davidvicunap.github.io/App-Finanzas-Personales/
// En local (npm run dev) se usa "/".
const base = process.env.GITHUB_PAGES === 'true' ? '/App-Finanzas-Personales/' : '/';

// Las pruebas corren con la zona horaria de Vancouver para atrapar errores de
// fechas como el que tenía la versión anterior. Debe fijarse aquí, antes de que
// Vitest lance sus procesos, para que todos la hereden.
if (process.env.VITEST) process.env.TZ = 'America/Vancouver';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Convierte la app en PWA: se instala en el teléfono y funciona sin conexión.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mis Finanzas',
        short_name: 'Finanzas',
        description: 'Finanzas personales y familiares, privadas y en tu dispositivo.',
        lang: 'es',
        start_url: '.',
        display: 'standalone',
        background_color: '#0D0F14',
        theme_color: '#1F3A5F',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

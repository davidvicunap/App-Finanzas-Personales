/// <reference types="vitest/config" />
import { createHash } from 'node:crypto';
import { defineConfig, type Plugin } from 'vite';
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

/**
 * Añade una Política de Seguridad de Contenido (CSP) al HTML final.
 * Solo permite ejecutar código de la propia app (bloquea scripts inyectados).
 * Se aplica solo en el build porque el modo desarrollo usa scripts en línea.
 * El único script en línea (el del tema) se autoriza por su hash exacto.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'content-security-policy',
    apply: 'build',
    transformIndexHtml(html) {
      const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
        (m) => `'sha256-${createHash('sha256').update(m[1]!).digest('base64')}'`,
      );
      const csp = [
        "default-src 'self'",
        `script-src 'self' ${hashes.join(' ')}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "manifest-src 'self'",
        "worker-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
      ].join('; ');
      return html.replace('<head>', `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`);
    },
  };
}

export default defineConfig({
  base,
  plugins: [
    react(),
    contentSecurityPolicy(),
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

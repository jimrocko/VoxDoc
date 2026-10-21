import { defineConfig, type PluginOption } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

// `--mode https` aktiviert ein selbstsigniertes Zertifikat. iOS Safari gibt
// Kamera und Service Worker im LAN nur über HTTPS frei.
export default defineConfig(({ mode }) => {
  const plugins: PluginOption[] = [
    VitePWA({
      // Nicht automatisch neu laden: Updates erst nach Bestätigung (WCAG 3.2.5), sonst gingen Eingaben verloren.
      registerType: 'prompt',
      injectRegister: false,
      // .json statt .webmanifest: raw.githack.com leitet unbekannte Endungen auf eine andere Herkunft um.
      manifestFilename: 'manifest.json',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        // Relativ, damit die App auch in einem Unterordner läuft (z. B. raw.githack.com).
        id: './',
        name: 'VoxDoc – Dokumente vorlesen',
        short_name: 'VoxDoc',
        description:
          'Barrierefreie Dokumentenerkennung für blinde und sehbehinderte Menschen.',
        lang: 'de',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0b3d91',
        categories: ['accessibility', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Ohne PNG-Symbole: raw.githack.com leitet Binärdateien auf eine andere Herkunft um, daran scheitert das Vorab-Speichern. Offline werden sie nicht gebraucht.
        globPatterns: ['**/*.{js,css,html,svg,json,ttf}'],
        // Die OCR-Dateien (etwa 5 MB) lädt und speichert die App selbst bei Bedarf (src/ocr/assets.ts).
        globIgnores: ['**/worker.min-*.js', '**/tesseract-core-*.js', '**/*.traineddata*'],
        navigateFallback: 'index.html',
      },
    }),
  ];

  if (mode === 'https') {
    plugins.push(basicSsl());
  }

  return {
    plugins,
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    server: { host: true, port: 5173 },
    preview: { host: true, port: 4173 },
    build: { target: ['es2022', 'safari16'] },
  };
});

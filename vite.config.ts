import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';

const base = process.env.VITE_BASE_PATH ?? '/rdr2-prdr-converter/';

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.ico',
        'favicon.png',
        'favicon-16x16.png',
        'favicon-32x32.png',
        'apple-touch-icon.png',
        'icon.svg',
        'og-image.png',
      ],
      manifest: {
        id: base,
        start_url: base,
        scope: base,
        name: 'PRDR to JPEG / PNG Converter',
        short_name: 'PRDR Converter',
        description:
          'Convert Red Dead Redemption 2 and RedM PRDR Photo Mode files to  JPEG or PNG images locally in your browser.',
        theme_color: '#0b0a09',
        background_color: '#0b0a09',
        display: 'standalone',
        categories: ['photo', 'utilities'],
        icons: [
          {
            src: 'favicon.ico',
            sizes: '16x16 32x32 48x48',
            type: 'image/x-icon',
          },
          {
            src: 'icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 3000,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.d.ts',
        'src/setupTests.ts',
        'src/index.tsx',
        'src/**/__tests__/**',
      ],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});

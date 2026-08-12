import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isProd = mode === 'production';

  return {
    plugins: [
      react({
        jsxRuntime: 'automatic',
      }),
      // Bundle visualizer — only in production builds
      ...(isProd
        ? [
            visualizer({
              filename: 'dist/stats.html',
              template: 'treemap',
              gzipSize: true,
              brotliSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    define: {
      global: 'globalThis',
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    server: {
      port: 3000,
      open: true,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        // Real-time notifications/thread updates (Django Channels) — see
        // src/hooks/useRealtimeSocket.ts. `ws: true` tells Vite's proxy to
        // upgrade the connection instead of treating it as plain HTTP.
        '/ws': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    preview: {
      port: 4173,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
        '/ws': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
          ws: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: '_assets',
      // Sourcemaps only in development — they add ~30 % to bundle size in prod
      sourcemap: !isProd,
      minify: 'esbuild',
      target: 'es2020',
      // Warn at 600 kB (raw); individual vendor chunks will be smaller after split
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Vite always normalises module IDs to forward slashes on all platforms,
            // so we must NOT use path.sep here (which is '\' on Windows).
            if (!id.includes('/node_modules/')) return undefined;

            // ── Core React runtime + tiny react-adjacent packages ──────────
            if (
              id.includes('/node_modules/react/') ||
              id.includes('/node_modules/react-dom/') ||
              id.includes('/node_modules/scheduler/') ||
              id.includes('/node_modules/react-is/') ||
              id.includes('/node_modules/hoist-non-react-statics/') ||
              id.includes('/node_modules/dom-helpers/') ||
              id.includes('/node_modules/react-transition-group/')
            )
              return 'vendor-react';

            // ── Router ───────────────────────────────────────────────────
            if (
              id.includes('/node_modules/react-router') ||
              id.includes('/node_modules/@remix-run/')
            )
              return 'vendor-router';

            // ── Server state / async ─────────────────────────────────────
            if (id.includes('/node_modules/@tanstack/')) return 'vendor-query';

            // ── Charts + all their internal dependencies ───────────────────
            // victory-vendor ↔ recharts circular dep is broken by putting them
            // all in the same chunk.
            if (
              id.includes('/node_modules/recharts/') ||
              id.includes('/node_modules/d3') ||
              id.includes('/node_modules/victory') || // victory, victory-vendor, victory-*
              id.includes('/node_modules/internmap/') ||
              id.includes('/node_modules/robust-predicates/') ||
              id.includes('/node_modules/rw/') ||
              id.includes('/node_modules/topojson') ||
              id.includes('/node_modules/delaunator/')
            )
              return 'vendor-charts';

            // ── CSS-in-JS (emotion + styled-components) ──────────────────
            if (
              id.includes('/node_modules/@emotion/') ||
              id.includes('/node_modules/styled-components/') ||
              id.includes('/node_modules/stylis/')
            )
              return 'vendor-css-in-js';

            // ── Forms & validation ───────────────────────────────────────
            if (
              id.includes('/node_modules/react-hook-form/') ||
              id.includes('/node_modules/@hookform/') ||
              id.includes('/node_modules/zod/')
            )
              return 'vendor-forms';

            // ── Drag & drop ──────────────────────────────────────────────
            if (id.includes('/node_modules/@dnd-kit/')) return 'vendor-dnd';

            // ── HTTP + state ──────────────────────────────────────────────
            if (
              id.includes('/node_modules/axios/') ||
              id.includes('/node_modules/zustand/') ||
              id.includes('/node_modules/uuid/')
            )
              return 'vendor-http';

            // ── Date utilities ───────────────────────────────────────────
            if (id.includes('/node_modules/date-fns/')) return 'vendor-date';

            // ── Icons ────────────────────────────────────────────────────
            if (id.includes('/node_modules/lucide-react/')) return 'vendor-icons';

            // ── Toast / notifications ─────────────────────────────────────
            if (
              id.includes('/node_modules/react-hot-toast/') ||
              id.includes('/node_modules/sonner/')
            )
              return 'vendor-toast';

            // ── Misc large deps ───────────────────────────────────────────
            if (id.includes('/node_modules/react-grid-layout/')) return 'vendor-grid-layout';

            // Everything else: derive a vendor-<pkg> name from the package folder.
            // Use forward slashes throughout — safe on all platforms.
            const after = id.split('/node_modules/')[1];
            if (after) {
              const parts = after.split('/');
              const pkg = parts[0].startsWith('@') ? `${parts[0]}-${parts[1]}` : parts[0];
              return `vendor-${pkg}`;
            }
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        'react',
        'react-dom',
        'react-dom/client',
        'react/jsx-runtime',
        'react-router-dom',
        '@tanstack/react-query',
        'axios',
        'zustand',
        'react-grid-layout',
        'recharts',
      ],
      esbuildOptions: {
        target: 'es2020',
      },
    },
  };
});

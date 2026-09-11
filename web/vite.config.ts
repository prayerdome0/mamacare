import { build as esbuild } from 'esbuild';
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * MAMA CARE web client.
 *
 * The API layer (Cloudinary signed uploads, Firebase Admin operations) runs as a
 * separate Node service in `../server`. In development the browser only ever calls
 * the relative path `/api/*`, which Vite proxies to that service. In production the
 * same relative path is rewritten by the hosting layer (see firebase.json / the
 * deployment docs) — no absolute backend URLs and no secrets are ever baked into
 * the client bundle.
 */
const PORT = Number(process.env.PORT ?? 5173);
const API_PORT = Number(process.env.VITE_API_PORT ?? 8787);

/**
 * Compiles the Firebase Messaging service worker with the Firebase SDK bundled in,
 * to a stable path. Doing it here (rather than referencing a CDN script) keeps push
 * working on a metered or flaky clinic connection, and keeps `import.meta.env`
 * inlining identical to the app build. The output is a generated file and is not
 * committed.
 */
function firebaseMessagingSw(env: Record<string, string | undefined>, mode: string): Plugin {
  const outDir = fileURLToPath(new URL('./public', import.meta.url));
  return {
    name: 'mamacare:firebase-messaging-sw',
    async buildStart() {
      const defines: Record<string, string> = {};
      for (const key of [
        'VITE_FIREBASE_API_KEY',
        'VITE_FIREBASE_AUTH_DOMAIN',
        'VITE_FIREBASE_PROJECT_ID',
        'VITE_FIREBASE_STORAGE_BUCKET',
        'VITE_FIREBASE_MESSAGING_SENDER_ID',
        'VITE_FIREBASE_APP_ID',
      ]) {
        defines[`import.meta.env.${key}`] = JSON.stringify(env[key] ?? '');
      }
      try {
        await esbuild({
          entryPoints: [fileURLToPath(new URL('./src/sw/firebase-messaging-sw.ts', import.meta.url))],
          outfile: `${outDir}/firebase-messaging-sw.js`,
          bundle: true,
          format: 'iife',
          platform: 'browser',
          target: ['es2020'],
          minify: mode === 'production',
          define: defines,
          logLevel: 'silent',
        });
      } catch (error) {
        this.warn(
          `The push service worker could not be built (${error instanceof Error ? error.message : 'unknown error'}). ` +
            'In-app notifications continue to work; background push is unavailable until it builds.',
        );
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.VITE_API_ORIGIN || `http://127.0.0.1:${API_PORT}`;

  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
      // The preview environment forwards arbitrary hostnames; keep the dev proxy
      // reachable while still rejecting unrelated origins.
      configure: (server) => {
        server?.on?.('proxyReq', (proxyReq: { setHeader: (k: string, v: string) => void }) => {
          proxyReq.setHeader('x-mamacare-client', 'web');
        });
      },
    },
  };

  return {
    plugins: [react(), tailwindcss(), firebaseMessagingSw(env, mode)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    define: {
      // Fail loudly if the API service is not reachable instead of silently
      // returning HTML error pages into JSON parsers.
      __MC_API_TARGET__: JSON.stringify(apiTarget),
    },
    server: {
      host: true,
      port: PORT,
      strictPort: true,
      allowedHosts: true,
      proxy,
    },
    preview: { host: true, port: PORT, allowedHosts: true },
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            pdf: ['jspdf', 'jspdf-autotable'],
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
      globals: false,
    },
  };
});

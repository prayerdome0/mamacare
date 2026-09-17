import { build as esbuild } from 'esbuild';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

/**
 * MAMA CARE web client.
 *
 * There is no backend service in this repository. The browser talks to Firebase
 * (Auth, Firestore, Storage, Cloud Messaging) and to Cloudinary's unsigned upload
 * endpoint directly; every authorisation decision is made by `firestore.rules` and
 * `storage.rules`, not by a server we operate. Nothing is proxied, so nothing needs
 * a secret in the client bundle beyond the public Firebase web config.
 */
const PORT = Number(process.env.PORT ?? 5173);

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
        'VITE_FIREBASE_VAPID_KEY',
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

  return {
    plugins: [react(), tailwindcss(), firebaseMessagingSw(env, mode)],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // Bind to every interface and accept any hostname: the app is previewed
      // through a proxy and tested on phones over the local network.
      host: true,
      port: PORT,
      strictPort: true,
      allowedHosts: true,
    },
    preview: { host: true, port: PORT, allowedHosts: true },
    build: {
      target: 'es2020',
      sourcemap: false,
      cssCodeSplit: true,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          // Vendor chunks are split so a returning mother re-downloads only the
          // route she opened, not React and the Firebase SDK with it.
          manualChunks: {
            react: ['react', 'react-dom', 'react-router-dom'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
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

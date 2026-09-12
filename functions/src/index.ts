import { onRequest } from 'firebase-functions/v2/https';
import { createApp } from './app.js';
import { env, redactedSummary } from './env.js';

/**
 * Entrypoint for both deployment styles:
 *
 * • `npm run dev` / a container → a plain HTTP server on `PORT` (8787 locally, which
 *   is what the Vite dev proxy in `web/vite.config.ts` forwards `/api` to).
 * • `firebase deploy --only functions` → the same Express app behind a v2 HTTPS
 *   function, exported as `api`.
 *
 * The two share one code path so a route can never behave differently in
 * development than in production.
 */
const app = createApp();

const runningAsFunction = process.env.FUNCTIONS_EMULATOR === 'true' || Boolean(process.env.FUNCTIONS_TARGET);

export const api = onRequest(
  {
    region: process.env.FUNCTIONS_REGION || 'us-central1',
    cors: false, // same-origin only; CORS is handled by `securityHeaders`
    maxInstances: Number(process.env.FUNCTIONS_MAX_INSTANCES ?? 10),
    memory: '256MiB',
    timeoutSeconds: 60,
  },
  app,
);

if (!runningAsFunction) {
  const server = app.listen(env.port, '0.0.0.0', () => {
    console.info(`[mamacare-api] listening on http://0.0.0.0:${env.port} (${env.nodeEnv})`);
    console.info(`[mamacare-api] configuration ${JSON.stringify(redactedSummary())}`);
    if (!env.cloudinary.configured) {
      console.info('[mamacare-api] CLOUDINARY_API_SECRET not set — /media/sign will answer 503 and the web app will fall back to device storage.');
    }
    if (env.bootstrapAdminEmails.length === 0) {
      console.info('[mamacare-api] BOOTSTRAP_ADMIN_EMAILS not set — the first-administrator route is disabled.');
    }
  });

  const shutdown = (signal: string): void => {
    console.info(`[mamacare-api] ${signal} received, closing the listener.`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export { createApp };

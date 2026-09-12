import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { createApp } from './app.js';
import { runReminderSweep } from './jobs/reminders.js';
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
      console.info('[mamacare-api] CLOUDINARY_API_KEY/SECRET not set — /media/delete will report unavailable. Unsigned browser uploads are unaffected.');
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

/**
 * Daily maternity-review reminder sweep.
 *
 * Runs at 07:00 Africa/Lusaka so a mother is told about a review due that
 * morning, and told the next day if she missed one — even when no clinician
 * opened the app. Safe to run alongside the in-app pass: each notification is
 * written under a per-appointment key, so nobody is notified twice.
 */
export const reminderSweep = onSchedule(
  {
    schedule: '0 7 * * *',
    timeZone: 'Africa/Lusaka',
    region: process.env.FUNCTIONS_REGION || 'us-central1',
    timeoutSeconds: 300,
    memory: '256MiB',
  },
  async () => {
    const report = await runReminderSweep();
    console.info('[mamacare] reminder sweep', JSON.stringify(report));
  },
);

/** On-demand sweep, used by the API route below and by manual recovery. */
export const reminders = {
  run: runReminderSweep,
};

export { createApp };

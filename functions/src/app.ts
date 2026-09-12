import express, { type Express, type Request, type Response } from 'express';
import { env, redactedSummary } from './env.js';
import { adminStatus } from './firebase.js';
import { forbidden, rateLimit, securityHeaders, sendError } from './http.js';
import { mediaRouter } from './routes/media.js';
import { adminRouter } from './routes/admin.js';
import { notificationsRouter, notificationsStatus } from './routes/notifications.js';
import { contactRouter } from './routes/contact.js';
import { drainSmsQueue, notifySweep, reclaimStaleSends } from './jobs/queue.js';
import { policy } from './cloudinary.js';

/**
 * The MAMA CARE API service.
 *
 * Mounted at `/api` by the dev server and by hosting rewrites, so the browser only
 * ever talks to one origin. It owns exactly the operations that must not be done
 * from a client: signing privileged uploads, writing custom claims, revoking
 * sessions, creating accounts, and touching external delivery providers.
 */
export function createApp(): Express {
  const app = express();
  /**
   * Every route is mounted twice: at `/api/...` for the paths the browser uses
   * (the Vite dev proxy and the Firebase hosting rewrite both keep the `/api`
   * prefix) and at the root, so a container health probe or a load balancer that
   * strips the prefix still works.
   */
  const router = express.Router();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '256kb' }));
  app.use(securityHeaders);
  app.use(rateLimit({ limit: env.rateLimit.perMinutePerIp, windowMs: 60_000 }));

  router.get('/health', (_req, res) => {
    const admin = adminStatus();
    const degraded: string[] = [];
    if (!admin.ready) degraded.push('firebase-admin: privileged account operations are unavailable');
    if (!env.cloudinary.configured) degraded.push('cloudinary: signed uploads and private delivery are unavailable');
    if (!env.sms.configured) degraded.push('sms: reminders are queued, not delivered');
    if (!env.email.configured) degraded.push('email-relay: contact messages are stored but not forwarded');

    res.status(200).json({
      status: admin.ready ? (degraded.length > 0 ? 'ok-degraded' : 'ok') : 'degraded',
      time: new Date().toISOString(),
      degraded,
      // Redacted on purpose: this endpoint is reachable before sign-in.
      configuration: redactedSummary(),
      channels: notificationsStatus(),
    });
  });

  router.use('/media', mediaRouter);
  router.use('/admin', adminRouter);
  router.use('/notifications', notificationsRouter);
  router.use(
    '/contact',
    rateLimit({ limit: env.rateLimit.contactPerHour, windowMs: 60 * 60_000, message: 'Please wait before sending another message.' }),
    contactRouter,
  );

  /**
   * Queue work. Reachable either with the scheduler token (cron) or by an
   * administrator's verified token, so the same code serves both deployments.
   */
  router.post('/jobs/sms-drain', async (req: Request, res: Response, next) => {
    try {
      await authorizeJob(req);
      const reclaimed = await reclaimStaleSends();
      const report = await drainSmsQueue();
      res.json({ ...report, reclaimed });
    } catch (error) {
      next(error);
    }
  });

  router.post('/jobs/sweep-notified', async (req: Request, res: Response, next) => {
    try {
      await authorizeJob(req);
      const body = (req.body ?? {}) as { updated?: number; facilityId?: string | null };
      const notified = await notifySweep({ updated: Number(body.updated ?? 0), facilityId: body.facilityId ?? null });
      res.json({ notified });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', (_req, res) => {
    res.json({
      service: 'mamacare-api',
      routes: [
        '/health',
        '/media/policy',
        '/media/sign',
        '/media/sign-url',
        '/media/delete',
        '/admin/users/role',
        '/admin/users/status',
        '/admin/users/approve',
        '/admin/users/create',
        '/admin/users/revoke',
        '/admin/users/password-reset',
        '/admin/bootstrap',
        '/notifications/push',
        '/notifications/sms',
        '/notifications/announce',
        '/contact',
        '/jobs/sms-drain',
        '/jobs/sweep-notified',
      ],
      note: 'This service holds the Cloudinary API secret and the Firebase Admin credentials. Nothing here widens a caller’s access without their verified ID token.',
    });
  });

  app.use('/api', router);
  app.use(router);

  app.use((_req, res) => {
    res.status(404).json({ code: 'NOT_FOUND', message: 'That API route does not exist.' });
  });

  app.use(sendError);
  return app;
}

/** A job call needs either the shared scheduler token or an administrator's ID token. */
async function authorizeJob(req: Request): Promise<void> {
  const token = req.headers['x-scheduler-token'];
  if (typeof token === 'string' && env.schedulerToken && token === env.schedulerToken) return;

  const authorization = req.headers.authorization;
  if (typeof authorization === 'string' && authorization.toLowerCase().startsWith('bearer ')) {
    const { verifyIdToken } = await import('./firebase.js');
    const claims = await verifyIdToken(authorization.slice(7).trim());
    if (claims.role === 'ADMIN') return;
  }

  throw forbidden(
    env.schedulerToken
      ? 'That request did not carry the scheduler token.'
      : 'Scheduled jobs are not enabled on this deployment. Set SCHEDULER_INTERNAL_TOKEN, or call the route with an administrator token.',
  );
}

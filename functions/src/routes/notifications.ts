import { Router } from 'express';
import { FieldValue } from 'firebase-admin/firestore';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import { dbOrThrow, STAFF_ROLES } from '../firebase.js';
import { channelStatus, sendPush, sendSms } from '../messaging.js';
import { conflict, forbidden, notFound, withBody } from '../http.js';
import { claimsOf, requireAuth } from './_auth.js';

/**
 * Delivery routes.
 *
 * The notification document is always written by the web app (or by the queue job)
 * first, so an unreadable channel never means a lost message: this service only
 * pushes to devices and drains the SMS queue that already exists.
 */
export const notificationsRouter = Router();

const pushBody = z.object({
  userId: z.string().trim().min(6).max(128),
  title: z.string().trim().min(3).max(90),
  body: z.string().trim().min(3).max(240),
  route: z.string().trim().max(160).optional(),
  tag: z.string().trim().max(60).optional(),
  level: z.enum(['info', 'success', 'warning', 'critical']).default('info'),
  notificationId: z.string().trim().max(128).optional(),
});

notificationsRouter.post('/push', requireAuth, withBody(pushBody, async (input, req) => {
  const claims = claimsOf(req);
  if (!STAFF_ROLES.includes(claims.role)) throw forbidden('Only health workers may trigger a push to another account.');
  const db = dbOrThrow();

  const tokens = await db.collection('devices').where('userId', '==', input.userId).where('revokedAt', '==', null).limit(20).get();
  const list = tokens.docs.map((doc) => String(doc.get('token') ?? '')).filter(Boolean);
  const result = await sendPush(list, {
    title: input.title,
    body: input.body,
    route: input.route,
    tag: input.tag,
    level: input.level,
  });

  // FCM tells us a token is dead — retire it so the device stops being targeted.
  if (result.invalidTokens.length > 0) {
    const batch = db.batch();
    for (const token of result.invalidTokens) {
      const match = await db.collection('devices').where('token', '==', token).limit(1).get();
      for (const doc of match.docs) batch.update(doc.ref, { revokedAt: new Date().toISOString(), revokeReason: 'token-invalid' });
    }
    await batch.commit().catch(() => null);
  }

  if (input.notificationId) {
    await db
      .collection('notifications')
      .doc(input.notificationId)
      .set({ pushSent: result.sent > 0, pushSentAt: new Date().toISOString() }, { merge: true })
      .catch(() => null);
  }

  await writeAudit(db, claims, {
    action: 'notification.push_sent',
    targetType: 'notification',
    targetId: input.notificationId ?? input.userId,
    facilityId: claims.facilityId,
    metadata: { requested: result.requested, sent: result.sent, failed: result.failed, level: input.level },
  });

  return { sent: result.sent, requested: result.requested, failed: result.failed, retiredTokens: result.invalidTokens.length };
}));

const smsBody = z.object({
  /** Either an appointment already queued by the app, or an explicit request. */
  appointmentId: z.string().trim().min(6).max(128).optional(),
  to: z.string().trim().min(8).max(24).optional(),
  text: z.string().trim().min(10).max(480).optional(),
  reason: z.string().trim().max(160).optional(),
});

/**
 * Queues or sends an SMS reminder. Appointment texts are composed here from the
 * stored appointment so the browser never has to carry a phone number into a
 * request body for a patient it cannot see.
 */
notificationsRouter.post('/sms', requireAuth, withBody(smsBody, async (input, req) => {
  const claims = claimsOf(req);
  const db = dbOrThrow();
  const status = channelStatus();

  let to = input.to ?? null;
  let text = input.text ?? null;
  let appointmentId = input.appointmentId ?? null;

  if (appointmentId) {
    if (!STAFF_ROLES.includes(claims.role)) throw forbidden('Only health workers may queue an appointment reminder.');
    const snapshot = await db.collection('appointments').doc(appointmentId).get();
    if (!snapshot.exists) throw notFound('That appointment no longer exists.');
    const appointment = snapshot.data() ?? {};
    if (appointment.facilityId && claims.role !== 'ADMIN' && appointment.facilityId !== claims.facilityId) {
      throw forbidden('That appointment belongs to another facility.');
    }
    const motherId = String(appointment.motherId ?? '');
    const mother = motherId ? await db.collection('mothers').doc(motherId).get() : null;
    to = mother ? String(mother.get('phone') ?? '') : '';
    const firstName = String(mother?.get('fullName') ?? 'there').split(' ')[0] || 'there';
    text = `MAMA CARE: ${firstName}, your clinic visit is ${String(appointment.scheduledFor ?? '')} at ${String(appointment.time ?? '')}. Call the clinic if you cannot come.`.slice(0, 160);
  }

  if (!to || !text) throw conflict('Provide either an appointment to remind about, or a number and message.');

  // Always record the intent first: a failed provider call must not lose the request.
  const queueRef = await db.collection('sms_outbound').add({
    to,
    text,
    appointmentId,
    requestedBy: claims.uid,
    requestedByName: claims.displayName,
    facilityId: claims.facilityId ?? null,
    provider: status.sms,
    status: 'QUEUED',
    attempts: 0,
    reason: input.reason ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (!envLikeConfigured(status.sms)) {
    await writeAudit(db, claims, {
      action: 'notification.sms_queued',
      targetType: 'notification',
      targetId: queueRef.id,
      facilityId: claims.facilityId,
      metadata: { queued: true, reason: 'provider-not-configured' },
    });
    return { queued: true, id: queueRef.id, reason: 'no-sms-provider-configured' };
  }

  try {
    const result = await sendSms({ to, text, reference: queueRef.id });
    await queueRef.update({
      status: result.status,
      providerId: result.providerId,
      providerReason: result.reason,
      sentAt: new Date().toISOString(),
      attempts: 1,
    });
    await writeAudit(db, claims, {
      action: 'notification.sms_sent',
      targetType: 'notification',
      targetId: queueRef.id,
      facilityId: claims.facilityId,
      metadata: { provider: status.sms, providerId: result.providerId, appointmentId },
    });
    return { queued: false, id: queueRef.id, provider: status.sms };
  } catch (error) {
    await queueRef.update({ status: 'FAILED_RETRYABLE', attempts: 1, lastError: error instanceof Error ? error.message.slice(0, 200) : 'unknown' });
    throw error;
  }
}));

const envLikeConfigured = (provider: string): boolean => provider === 'twilio' || provider === 'http';

/** Supervisor/admin broadcast to a facility team. */
const announceBody = z.object({
  title: z.string().trim().min(4).max(90),
  body: z.string().trim().min(10).max(400),
  facilityId: z.string().trim().max(128).optional(),
  userIds: z.array(z.string().trim().min(6).max(128)).max(200).optional(),
  link: z.string().trim().max(160).optional(),
});

notificationsRouter.post('/announce', requireAuth, withBody(announceBody, async (input, req) => {
  const claims = claimsOf(req);
  if (claims.role !== 'ADMIN' && claims.role !== 'FACILITY_SUPERVISOR') {
    throw forbidden('Only a supervisor or administrator may send an announcement.');
  }
  if (claims.role === 'FACILITY_SUPERVISOR' && input.facilityId && input.facilityId !== claims.facilityId) {
    throw forbidden('A supervisor may only announce to their own facility.');
  }
  const db = dbOrThrow();
  const recipientIds =
    input.userIds && input.userIds.length > 0
      ? input.userIds
      : (await db.collection('users').where('status', '==', 'ACTIVE').where('facilityId', '==', input.facilityId ?? claims.facilityId).limit(200).get()).docs.map(
          (doc) => doc.id,
        );
  if (recipientIds.length === 0) throw conflict('No active accounts matched that audience.');

  const now = new Date().toISOString();
  const batch = db.batch();
  for (const userId of recipientIds.filter((id) => id !== claims.uid).slice(0, 200)) {
    batch.set(db.collection('notifications').doc(), {
      userId,
      kind: 'ANNOUNCEMENT',
      title: input.title,
      body: input.body,
      level: 'info',
      link: input.link ?? null,
      facilityId: input.facilityId ?? claims.facilityId ?? null,
      readAt: null,
      sentAt: now,
      createdBy: claims.uid,
      createdByName: claims.displayName,
      channels: { inApp: true, push: true, sms: false },
      pushSent: false,
    });
  }
  await batch.commit();

  await writeAudit(db, claims, {
    action: 'notification.announcement',
    targetType: 'notification',
    targetId: 'announcement',
    facilityId: input.facilityId ?? claims.facilityId ?? null,
    metadata: { recipients: recipientIds.length, title: input.title.slice(0, 40) },
  });

  return { recipients: recipientIds.length, channels: 'in-app + push' };
}));

export const notificationsStatus = () => channelStatus();

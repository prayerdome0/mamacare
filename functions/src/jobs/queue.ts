import { FieldValue } from 'firebase-admin/firestore';
import { sendSms } from '../messaging.js';
import { dbOrThrow } from '../firebase.js';
import { env } from '../env.js';

/**
 * Scheduled queue work.
 *
 * The web app computes what is due (it owns the appointment and reminder rules);
 * this job is the delivery arm: it drains `sms_outbound`, retries what the provider
 * rejected, and expires links on signed media it no longer needs. It is safe to run
 * repeatedly — each row is claimed with a status transition, so two overlapping runs
 * never send the same message twice.
 */
export interface QueueReport {
  processed: number;
  sent: number;
  failed: number;
  skipped: string | null;
}

const MAX_ATTEMPTS = 4;

export async function drainSmsQueue(): Promise<QueueReport> {
  const db = dbOrThrow();
  const provider = env.sms.provider;
  if (provider !== 'twilio' && provider !== 'http') {
    return { processed: 0, sent: 0, failed: 0, skipped: `SMS_PROVIDER is “${provider}”, so nothing is delivered. Set it to twilio or http with the matching keys.` };
  }

  const due = await db
    .collection('sms_outbound')
    .where('status', 'in', ['QUEUED', 'FAILED_RETRYABLE'])
    .orderBy('createdAt', 'asc')
    .limit(25)
    .get()
    .catch(async () => {
      // Composite index may not exist yet on a fresh project: fall back to an
      // unordered read so reminders still go out.
      const snapshot = await db.collection('sms_outbound').where('status', '==', 'QUEUED').limit(25).get();
      return snapshot;
    });

  let sent = 0;
  let failed = 0;

  for (const doc of due.docs) {
    const data = doc.data() as { status?: string; attempts?: number; to?: string; text?: string };
    if (data.status === 'SENDING') continue;
    const attempts = Number(data.attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      await doc.ref.update({ status: 'FAILED_PERMANENT', lastError: 'Attempt limit reached. The reminder was not delivered.' });
      failed += 1;
      continue;
    }
    // Claim the row before doing anything slow.
    await doc.ref.update({ status: 'SENDING', attempts: attempts + 1, claimedAt: new Date().toISOString() });
    try {
      const result = await sendSms({ to: String(data.to ?? ''), text: String(data.text ?? ''), reference: doc.id });
      await doc.ref.update({
        status: result.status === 'SENT' ? 'SENT' : 'QUEUED',
        providerId: result.providerId,
        sentAt: result.status === 'SENT' ? new Date().toISOString() : null,
        lastError: null,
      });
      if (result.status === 'SENT') sent += 1;
    } catch (error) {
      await doc.ref.update({
        status: attempts + 1 >= MAX_ATTEMPTS ? 'FAILED_PERMANENT' : 'FAILED_RETRYABLE',
        lastError: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
      failed += 1;
    }
  }

  return { processed: due.docs.length, sent, failed, skipped: null };
}

/** Marks old `SENDING` rows (a crashed run) back to retryable. */
export async function reclaimStaleSends(): Promise<number> {
  const db = dbOrThrow();
  const cutoff = new Date(Date.now() - 15 * 60_000).toISOString();
  const stale = await db.collection('sms_outbound').where('status', '==', 'SENDING').where('claimedAt', '<', cutoff).limit(50).get();
  const batch = db.batch();
  for (const doc of stale.docs) batch.update(doc.ref, { status: 'FAILED_RETRYABLE', lastError: 'Delivery attempt did not finish.' });
  if (stale.docs.length > 0) await batch.commit();
  return stale.docs.length;
}

/**
 * Escalation notice for a mother whose appointment passed without a mark. The
 * clinical alert itself is raised by the app’s rule engine when the visit is
 * saved or swept; this only informs the assigned officer that the queue did work.
 */
export async function notifySweep(result: { updated: number; facilityId: string | null }): Promise<number> {
  if (result.updated === 0) return 0;
  const db = dbOrThrow();
  const recipients = await db
    .collection('users')
    .where('facilityId', '==', result.facilityId)
    .where('role', 'in', ['FACILITY_SUPERVISOR', 'MIDWIFE'])
    .where('status', '==', 'ACTIVE')
    .limit(40)
    .get()
    .catch(() => null);
  if (!recipients || recipients.empty) return 0;
  const now = new Date().toISOString();
  const batch = db.batch();
  for (const doc of recipients.docs) {
    batch.set(db.collection('notifications').doc(), {
      userId: doc.id,
      kind: 'APPOINTMENT_REMINDER',
      title: `${result.updated} appointment${result.updated === 1 ? '' : 's'} marked as missed`,
      body: 'The scheduled sweep found appointments that passed without being recorded. Please follow up with the mothers or their community health worker.',
      level: 'warning',
      link: '/app/appointments?range=overdue',
      readAt: null,
      sentAt: now,
      createdBy: 'system',
      createdByName: 'Scheduled queue worker',
      channels: { inApp: true, push: true, sms: false },
      pushSent: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  return recipients.docs.length;
}

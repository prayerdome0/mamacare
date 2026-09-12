import { FieldValue } from 'firebase-admin/firestore';
import { dbOrThrow } from '../firebase.js';

/**
 * Scheduled maternity-review reminders.
 *
 * The browser runs the same pass whenever a clinician opens the app, but a
 * reminder must also go out on a day nobody signs in — so this job is the
 * authoritative daily sweep. It is deliberately idempotent: every notification
 * is recorded against the appointment under a per-lead key, so overlapping runs
 * (a cron trigger plus an open workstation) never notify a mother twice.
 *
 * Two messages, fixed wording, reviewed for tone:
 *
 *   Review Reminder
 *   Your maternity review is scheduled for 20 September 2026.
 *
 *   Missed Review
 *   You missed your scheduled maternity review on 20 September 2026.
 *   Please contact your healthcare facility for assistance.
 */

const MAX_PER_RUN = 200;

const isoDate = (value: Date): string => value.toISOString().slice(0, 10);

const longDate = (value: string): string => {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return value;
  return `${String(d.getUTCDate()).padStart(2, '0')} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const startOfUtcDay = (value: Date): number => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());

const daysUntil = (scheduledFor: string, today: Date): number =>
  Math.round((startOfUtcDay(new Date(`${scheduledFor}T00:00:00Z`)) - startOfUtcDay(today)) / 86_400_000);

export interface ReminderReport {
  scanned: number;
  missedMarked: number;
  missedNotified: number;
  remindersSent: number;
}

export async function runReminderSweep(): Promise<ReminderReport> {
  const db = dbOrThrow();
  const today = new Date();
  const todayIso = isoDate(today);
  const nowIso = new Date().toISOString();

  const snapshot = await db
    .collection('appointments')
    .where('status', 'in', ['SCHEDULED', 'CONFIRMED', 'MISSED'])
    .limit(1000)
    .get();

  const report: ReminderReport = { scanned: snapshot.docs.length, missedMarked: 0, missedNotified: 0, remindersSent: 0 };
  if (snapshot.empty) return report;

  const motherIds = [...new Set(snapshot.docs.map((doc) => String(doc.get('motherId') ?? '')).filter(Boolean))];
  const facilityIds = [...new Set(snapshot.docs.map((doc) => String(doc.get('facilityId') ?? '')).filter(Boolean))];

  const mothers = new Map<string, { userId: string | null; fullName: string }>();
  for (const chunk of chunks(motherIds, 10)) {
    const docs = await db.getAll(...chunk.map((id) => db.collection('mothers').doc(id))).catch(() => []);
    for (const doc of docs) {
      if (!doc.exists) continue;
      mothers.set(doc.id, { userId: (doc.get('userId') as string | undefined) ?? null, fullName: String(doc.get('fullName') ?? '') });
    }
  }

  const facilities = new Map<string, string>();
  for (const chunk of chunks(facilityIds, 10)) {
    const docs = await db.getAll(...chunk.map((id) => db.collection('facilities').doc(id))).catch(() => []);
    for (const doc of docs) if (doc.exists) facilities.set(doc.id, String(doc.get('name') ?? ''));
  }

  const batch = db.batch();
  let writes = 0;

  for (const doc of snapshot.docs) {
    if (writes >= MAX_PER_RUN) break;
    const scheduledFor = String(doc.get('scheduledFor') ?? '');
    if (!scheduledFor) continue;

    const status = String(doc.get('status') ?? 'SCHEDULED');
    const remindersSent = (doc.get('remindersSent') as Record<string, string> | undefined) ?? {};
    const lead = daysUntil(scheduledFor, today);
    const mother = mothers.get(String(doc.get('motherId') ?? '')) ?? null;
    const facilityName = facilities.get(String(doc.get('facilityId') ?? '')) ?? 'your healthcare facility';
    const smsEnabled = doc.get('smsEnabled') !== false;
    const date = longDate(scheduledFor);

    /* ── 1. Past due with no outcome → mark missed and tell the mother ── */
    if (lead < 0 && (status === 'SCHEDULED' || status === 'CONFIRMED')) {
      batch.update(doc.ref, {
        status: 'MISSED',
        notes: appendNote(String(doc.get('notes') ?? ''), 'Automatically flagged: the scheduled date passed with no recorded outcome.'),
        updatedAt: nowIso,
        updatedBy: 'system',
        remindersSent: { ...remindersSent, missed: nowIso },
      });
      writes += 1;
      report.missedMarked += 1;

      if (!remindersSent.missed && mother?.userId) {
        writeNotification(batch, mother.userId, {
          title: 'Missed Review',
          body: `You missed your scheduled maternity review on ${date}. Please contact ${facilityName} for assistance.`,
          level: 'warning',
          motherId: String(doc.get('motherId') ?? null),
          facilityId: String(doc.get('facilityId') ?? null),
          link: '/home/appointments',
        });
        writes += 1;
        report.missedNotified += 1;
        if (smsEnabled) queueSms(batch, doc.id, mother.userId, String(doc.get('patientId') ?? ''), `Missed Review: you missed your maternity review on ${date}. Please contact ${facilityName} for assistance.`);
      }
      continue;
    }

    if (status === 'MISSED' || lead < 0) continue;

    /* ── 2. Due now → send each outstanding lead, including the day itself ── */
    const leads = [...new Set([...(doc.get('reminderDays') as number[] | undefined) ?? [7, 1], 0])]
      .filter((value) => Number.isFinite(value) && value >= 0 && value <= 365);

    for (const reminderLead of leads) {
      if (lead !== reminderLead) continue;
      const key = `lead-${reminderLead}`;
      if (remindersSent[key]) continue;

      if (mother?.userId) {
        writeNotification(batch, mother.userId, {
          title: 'Review Reminder',
          body: `Your maternity review is scheduled for ${date}.`,
          level: reminderLead === 0 ? 'warning' : 'info',
          motherId: String(doc.get('motherId') ?? null),
          facilityId: String(doc.get('facilityId') ?? null),
          link: '/home/appointments',
        });
        writes += 1;
        report.remindersSent += 1;
        if (smsEnabled) queueSms(batch, doc.id, mother.userId, String(doc.get('patientId') ?? ''), `Review Reminder: your maternity review is scheduled for ${date}.`);
      }

      batch.update(doc.ref, { remindersSent: { ...(doc.get('remindersSent') as object | undefined), [key]: nowIso } });
      writes += 1;
    }
  }

  if (writes > 0) await batch.commit();
  return report;
}

/* ── helpers ─────────────────────────────────────────────────────────── */

function appendNote(existing: string, addition: string): string {
  const trimmed = existing.trim();
  return trimmed ? `${trimmed}\n${addition}` : addition;
}

function writeNotification(
  batch: FirebaseFirestore.WriteBatch,
  userId: string,
  input: { title: string; body: string; level: string; motherId: string | null; facilityId: string | null; link: string },
): void {
  const db = dbOrThrow();
  batch.set(db.collection('notifications').doc(), {
    userId,
    kind: 'APPOINTMENT_REMINDER',
    title: input.title,
    body: input.body,
    level: input.level,
    link: input.link,
    motherId: input.motherId,
    facilityId: input.facilityId,
    readAt: null,
    sentAt: new Date().toISOString(),
    createdBy: 'system',
    createdByName: 'MAMA CARE reminders',
    channels: { inApp: true, push: true, sms: false },
    pushSent: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function queueSms(
  batch: FirebaseFirestore.WriteBatch,
  appointmentId: string,
  userId: string,
  patientId: string,
  text: string,
): void {
  const db = dbOrThrow();
  batch.set(db.collection('sms_outbound').doc(), {
    appointmentId,
    userId,
    patientId,
    text,
    status: 'QUEUED',
    attempts: 0,
    createdAt: new Date().toISOString(),
    reason: 'Automatic maternity review reminder',
  });
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

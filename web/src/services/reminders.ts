/**
 * Reminder engine.
 *
 * Works out what is due and turns it into an in-app notification (and, where push
 * is enabled, a system notification). A hosted deployment can run exactly the same
 * logic from a scheduled Cloud Function over the `devices` collection; this module
 * is the client half, and it is what makes reminders work offline.
 *
 * What it deliberately does not do:
 *  • it never invents a dose or a medicine — a reminder repeats what the user or
 *    their provider entered, word for word;
 *  • it never treats a missed reminder as a clinical event;
 *  • it respects quiet hours, because a 03:00 notification about a vitamin is not
 *    a service.
 */

import { getMeta, setMeta } from '@/services/data/local/store';
import { notificationRepo } from '@/services/repositories';
import { appointmentRepo, babyRepo, immunizationRepo, reminderRepo, todayReminders } from '@/services/repositories';
import { formatBabyAge } from '@/config/baby-development';
import { addDays, formatDate, formatTime, toIsoDate } from '@/lib/utils';
import type { Appointment, AppNotification, Baby, ImmunizationRecord, Reminder } from '@/types/domain';

const NOTIFIED_KEY = 'notified';

export interface DueItem {
  kind: 'reminder' | 'appointment' | 'immunization' | 'milestone';
  id: string;
  title: string;
  body: string;
  link: string;
  dueAt: string;
  /** Dedupe key: one notification per item per day. */
  key: string;
}

const dayKey = (date: Date = new Date()): string => toIsoDate(date);

async function alreadyNotified(): Promise<Set<string>> {
  return new Set((await getMeta<string[]>(NOTIFIED_KEY)) ?? []);
}

async function markNotified(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const existing = (await getMeta<string[]>(NOTIFIED_KEY)) ?? [];
  const merged = [...existing, ...keys].slice(-2000);
  await setMeta(NOTIFIED_KEY, merged);
}

/** Quiet hours: `from`–`to` across midnight, local time. */
export function inQuietHours(
  prefs: { quietFrom: string | null; quietTo: string | null } | null | undefined,
  at: Date = new Date(),
): boolean {
  if (!prefs?.quietFrom || !prefs?.quietTo) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  const [fromH, fromM] = prefs.quietFrom.split(':').map(Number);
  const [toH, toM] = prefs.quietTo.split(':').map(Number);
  const from = (fromH ?? 0) * 60 + (fromM ?? 0);
  const to = (toH ?? 0) * 60 + (toM ?? 0);
  if (from === to) return false;
  return from < to ? minutes >= from && minutes < to : minutes >= from || minutes < to;
}

/** Everything due today or in the next 48 hours, for one mother. */
export async function collectDueItems(userId: string, now: Date = new Date()): Promise<DueItem[]> {
  const items: DueItem[] = [];
  const today = dayKey(now);
  const tomorrow = dayKey(addDays(now, 1));

  /* Medication and supplement reminders -------------------------------- */
  const reminders = await reminderRepo.list(userId).catch(() => [] as Reminder[]);
  const dueToday = await todayReminders(reminders, now);
  for (const reminder of dueToday) {
    const takenToday = reminder.takenLog.some((entry) => dayKey(new Date(entry)) === today);
    if (takenToday && reminder.times.length <= 1) continue;
    const times = reminder.times.map((time) => formatTime(`${today}T${time}:00`)).join(', ');
    items.push({
      kind: 'reminder',
      id: reminder.id,
      title: reminder.title,
      body: `${times ? `${times} · ` : ''}${reminder.dose ? `${reminder.dose} · ` : ''}Follow your prescribed schedule.`,
      link: '/app/reminders',
      dueAt: new Date(now).toISOString(),
      key: `reminder:${reminder.id}:${today}`,
    });
  }

  /* Appointments -------------------------------------------------------- */
  const appointments = await appointmentRepo.list(userId).catch(() => [] as Appointment[]);
  for (const appointment of appointments) {
    if (appointment.status !== 'scheduled') continue;
    if (appointment.date !== today && appointment.date !== tomorrow) continue;
    const when = appointment.time ? `${formatDate(appointment.date, 'day')} at ${formatTime(`${appointment.date}T${appointment.time}:00`)}` : formatDate(appointment.date, 'day');
    items.push({
      kind: 'appointment',
      id: appointment.id,
      title: appointment.date === today ? 'Appointment today' : 'Appointment tomorrow',
      body: `${appointment.purpose} — ${appointment.facilityName}, ${when}.`,
      link: `/app/appointments/${appointment.id}`,
      dueAt: new Date(`${appointment.date}T${appointment.time ?? '08:00'}:00`).toISOString(),
      key: `appointment:${appointment.id}:${appointment.date}`,
    });
  }

  /* Immunizations due within 7 days ------------------------------------- */
  const babies = await babyRepo.list(userId).catch(() => [] as Baby[]);
  const horizon = dayKey(addDays(now, 7));
  for (const baby of babies) {
    const records = await immunizationRepo.list(baby.id).catch(() => [] as ImmunizationRecord[]);
    const due = records
      .filter((record) => record.status === 'upcoming')
      .filter((record) => record.scheduledDate >= today && record.scheduledDate <= horizon);
    for (const record of due) {
      items.push({
        kind: 'immunization',
        id: record.id,
        title: `${baby.name}'s immunization`,
        body: `${record.vaccineName} (${record.dose}) is due ${formatDate(record.scheduledDate, 'day')}. Bring the child health card.`,
        link: '/app/baby',
        dueAt: new Date(`${record.scheduledDate}T08:00:00`).toISOString(),
        key: `immunization:${record.id}:${record.scheduledDate}`,
      });
    }
    // A monthly milestone, once per month, on the birthday.
    const birth = new Date(baby.dateOfBirth);
    const monthsOld = (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());
    if (monthsOld > 0 && now.getDate() === birth.getDate()) {
      items.push({
        kind: 'milestone',
        id: `${baby.id}-month-${monthsOld}`,
        title: `${baby.name} is ${monthsOld} month${monthsOld === 1 ? '' : 's'} old`,
        body: 'See what is typical at this age, and check which vaccines are due.',
        link: '/app/baby',
        dueAt: now.toISOString(),
        key: `milestone:${baby.id}:${monthsOld}:${today}`,
      });
    }
  }

  return items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}

/**
 * Creates notifications for anything due that has not been notified yet.
 * Returns the notifications it created so the caller can show a toast.
 */
export async function runReminderScheduler(
  userId: string,
  prefs: { quietFrom: string | null; quietTo: string | null } | null,
): Promise<AppNotification[]> {
  if (inQuietHours(prefs)) return [];
  const items = await collectDueItems(userId);
  if (items.length === 0) return [];

  const sent = await alreadyNotified();
  const pending = items.filter((item) => !sent.has(item.key));
  if (pending.length === 0) return [];

  const created: AppNotification[] = [];
  for (const item of pending) {
    try {
      const notification = await notificationRepo.push({
        userId,
        title: item.title,
        body: item.body,
        kind: item.kind,
        link: item.link,
      });
      created.push(notification);
    } catch {
      /* one failed notification must not stop the others */
    }
  }
  await markNotified(pending.map((item) => item.key));
  return created;
}

/** Human label for a due item, used by the dashboard card. */
export function dueLabel(item: DueItem, now: Date = new Date()): string {
  if (item.kind === 'appointment') {
    const date = item.dueAt.slice(0, 10);
    if (date === dayKey(now)) return 'Today';
    if (date === dayKey(addDays(now, 1))) return 'Tomorrow';
    return formatDate(date, 'day');
  }
  if (item.kind === 'reminder') return 'Today';
  if (item.kind === 'immunization') return formatDate(item.dueAt.slice(0, 10), 'day');
  return formatDate(item.dueAt.slice(0, 10), 'day');
}

/** Clears the dedupe list — used by "reset reminders" in Settings. */
export async function resetReminderLog(): Promise<void> {
  await setMeta(NOTIFIED_KEY, []);
}

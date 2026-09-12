/**
 * Maternity review reminders.
 *
 * A "review" is any scheduled appointment on a mother's antenatal schedule. Its
 * lifecycle status is **derived**, never stored, so it can never drift out of
 * step with the calendar:
 *
 *   UPCOMING   scheduled for a future date
 *   TODAY      scheduled for today
 *   MISSED     the date has passed with no outcome recorded
 *   COMPLETED  the visit was recorded
 *   CANCELLED  the appointment was cancelled
 *
 * The two messages a mother receives are fixed strings, reviewed for tone: they
 * tell her what is happening and what to do next, and never interpret a finding.
 */

import { daysBetween, formatDate, toIsoDate } from '@/lib/utils';
import type { Appointment } from '@/types/domain';

export type ReviewStatus = 'UPCOMING' | 'TODAY' | 'MISSED' | 'COMPLETED' | 'CANCELLED';

export const REVIEW_STATUSES: ReviewStatus[] = ['UPCOMING', 'TODAY', 'MISSED', 'COMPLETED', 'CANCELLED'];

export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  UPCOMING: 'Upcoming',
  TODAY: 'Today',
  MISSED: 'Missed',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

/** Tailwind-free tone names consumed by the shared `Badge` component. */
export const REVIEW_TONES: Record<ReviewStatus, 'blue' | 'amber' | 'red' | 'green' | 'neutral'> = {
  UPCOMING: 'blue',
  TODAY: 'amber',
  MISSED: 'red',
  COMPLETED: 'green',
  CANCELLED: 'neutral',
};

/**
 * Derives the lifecycle status of a review.
 *
 * A past-dated appointment that is still `SCHEDULED` or `CONFIRMED` counts as
 * missed: no outcome was recorded, so the clinic has to follow up. The
 * nightly/day sweep writes that back to the record (see
 * `DataService.sweepMissedAppointments`); this function makes the same answer
 * available instantly, without waiting for the sweep.
 */
export function reviewStatus(appointment: Pick<Appointment, 'status' | 'scheduledFor'>, today: Date | string = new Date()): ReviewStatus {
  if (appointment.status === 'COMPLETED') return 'COMPLETED';
  if (appointment.status === 'CANCELLED' || appointment.status === 'RESCHEDULED') return 'CANCELLED';
  if (appointment.status === 'MISSED') return 'MISSED';

  const lead = daysBetween(today, appointment.scheduledFor);
  if (lead < 0) return 'MISSED';
  if (lead === 0) return 'TODAY';
  return 'UPCOMING';
}

/** True when this review still needs an outcome recorded. */
export const isOpenReview = (appointment: Pick<Appointment, 'status' | 'scheduledFor'>, today?: Date | string): boolean => {
  const status = reviewStatus(appointment, today);
  return status === 'UPCOMING' || status === 'TODAY';
};

/** Human name for the review type, e.g. `ANTENATAL` → "antenatal review". */
export function reviewLabel(type: string): string {
  return `${type.replace(/_/g, ' ').toLowerCase()} review`;
}

/**
 * The reminder a mother receives before her review.
 *
 *   Review Reminder
 *   Your maternity review is scheduled for 20 September 2026.
 */
export function reminderMessage(appointment: Pick<Appointment, 'scheduledFor' | 'time' | 'type'>): { title: string; body: string } {
  const date = formatDate(appointment.scheduledFor, 'long');
  return {
    title: 'Review Reminder',
    body: `Your maternity review is scheduled for ${date}.`,
  };
}

/**
 * The follow-up a mother receives when the date passed with no recorded visit.
 *
 *   Missed Review
 *   You missed your scheduled maternity review on 20 September 2026.
 *   Please contact your healthcare facility for assistance.
 */
export function missedMessage(
  appointment: Pick<Appointment, 'scheduledFor' | 'type'>,
  facilityName?: string | null,
): { title: string; body: string } {
  const date = formatDate(appointment.scheduledFor, 'long');
  return {
    title: 'Missed Review',
    body:
      `You missed your scheduled maternity review on ${date}. ` +
      `Please contact ${facilityName?.trim() ? facilityName.trim() : 'your healthcare facility'} for assistance.`,
  };
}

/** Short line used on staff lists, where space is tight. */
export function reviewSummary(appointment: Pick<Appointment, 'scheduledFor' | 'time' | 'type'>): string {
  return `${reviewLabel(appointment.type)} · ${formatDate(appointment.scheduledFor, 'day')} at ${appointment.time}`;
}

/**
 * Which reminder leads apply to a review, always including the day itself.
 *
 * Stored per appointment as `reminderDays` (defaults come from system
 * settings). The engine adds `0` so a review today always reminds, and clamps
 * anything beyond a year to keep the loop bounded.
 */
export function reminderLeads(appointment: Pick<Appointment, 'reminderDays'>): number[] {
  const configured = (appointment.reminderDays ?? []).filter((value) => Number.isFinite(value) && value >= 0 && value <= 365);
  return [...new Set([...configured, 0])].sort((a, b) => b - a);
}

/**
 * The key a sent reminder is recorded under, so each lead fires exactly once
 * per appointment even if the sweep runs repeatedly or on several devices.
 */
export const reminderKey = (leadDays: number): string => `lead-${leadDays}`;

/**
 * Antenatal review schedule (WHO eight-contact model).
 *
 * Used by the mother's profile to show which contacts are due next. It is a
 * schedule *template*: real rows come from the appointment register.
 */
export interface AntenatalContact {
  contact: number;
  /** Gestational age at which the contact is due. */
  label: string;
  /** Approximate weeks of gestation. */
  weeks: number;
  focus: string;
}

export const ANTENATAL_SCHEDULE: AntenatalContact[] = [
  { contact: 1, weeks: 12, label: 'First contact — before 12 weeks', focus: 'Booking, history, screening tests, danger-sign education' },
  { contact: 2, weeks: 20, label: 'Second contact — 20 weeks', focus: 'Blood pressure, urine, fetal growth, anaemia review' },
  { contact: 3, weeks: 26, label: 'Third contact — 26 weeks', focus: 'Maternal and fetal assessment, birth plan discussion' },
  { contact: 4, weeks: 30, label: 'Fourth contact — 30 weeks', focus: 'Presentation, growth, syphilis and HIV re-test where indicated' },
  { contact: 5, weeks: 34, label: 'Fifth contact — 34 weeks', focus: 'Blood pressure, proteinuria, fetal wellbeing' },
  { contact: 6, weeks: 36, label: 'Sixth contact — 36 weeks', focus: 'Presentation, preparation for birth and newborn care' },
  { contact: 7, weeks: 38, label: 'Seventh contact — 38 weeks', focus: 'Assessment of labour signs, place of birth confirmed' },
  { contact: 8, weeks: 40, label: 'Eighth contact — 40 weeks', focus: 'Post-term surveillance and induction planning' },
];

/** The next contact that has not yet been reached at the given gestation. */
export function nextAntenatalContact(gestationWeeks: number): AntenatalContact | null {
  if (!Number.isFinite(gestationWeeks) || gestationWeeks < 0) return null;
  return ANTENATAL_SCHEDULE.find((contact) => contact.weeks >= gestationWeeks) ?? null;
}

/** Today, as an ISO date — the boundary the sweep compares against. */
export const todayIso = (): string => toIsoDate(new Date());

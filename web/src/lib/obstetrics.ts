/**
 * Obstetric date arithmetic.
 *
 * Naegele's rule (LMP + 280 days) is the default EDD method; ultrasound dating
 * overrides it when provided. Gestational age is always *derived* at read time
 * from the dating anchor so a record never goes stale between visits.
 *
 * Nothing in this module interprets findings — it only computes dates.
 */

export const DAYS_IN_PREGNANCY = 280;
export const WEEKS_FULL_TERM = 40;

export interface GestationalAge {
  weeks: number;
  days: number;
  totalDays: number;
  /** 0–100 progress across a 40-week pregnancy. */
  progressPct: number;
  trimester: 1 | 2 | 3;
  viable: boolean;
  postTerm: boolean;
  valid: boolean;
}

export const addDays = (date: Date | string, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

export const eddFromLmp = (lmp: Date | string): string =>
  addDays(lmp, DAYS_IN_PREGNANCY).toISOString().slice(0, 10);

export const lmpFromEdd = (edd: Date | string): string =>
  addDays(edd, -DAYS_IN_PREGNANCY).toISOString().slice(0, 10);

const dayDiff = (from: Date, to: Date): number =>
  Math.floor((to.setHours(0, 0, 0, 0) - from.setHours(0, 0, 0, 0)) / 86_400_000);

/**
 * @param anchor LMP date, or the EDD when `edd` is supplied instead.
 * @param asOf  defaults to now; pass a visit date for retrospective GA.
 */
export function gestationalAge(opts: {
  lmpDate?: string | Date | null;
  eddDate?: string | Date | null;
  asOf?: Date;
  /** Clinician-documented GA used as a floor when dates disagree. */
  documented?: { weeks: number; days: number; at: string } | null;
}): GestationalAge {
  const asOf = opts.asOf ?? new Date();
  let anchor: Date | null = null;

  if (opts.lmpDate) anchor = new Date(opts.lmpDate);
  else if (opts.eddDate) anchor = new Date(addDays(opts.eddDate, -DAYS_IN_PREGNANCY));

  if (!anchor || Number.isNaN(anchor.getTime())) {
    if (opts.documented) {
      const daysAtDocument = opts.documented.weeks * 7 + opts.documented.days;
      const sinceDocumented = Math.max(
        0,
        dayDiff(new Date(opts.documented.at), new Date(asOf)),
      );
      return fromTotalDays(daysAtDocument + sinceDocumented, asOf);
    }
    return { ...fromTotalDays(0, asOf), valid: false };
  }

  const totalDays = dayDiff(anchor, asOf);
  const ga = fromTotalDays(Math.max(0, totalDays), asOf);
  if (opts.documented) {
    const documentedNow =
      opts.documented.weeks * 7 +
      opts.documented.days +
      Math.max(0, dayDiff(new Date(opts.documented.at), asOf));
    if (documentedNow > ga.totalDays) return fromTotalDays(documentedNow, asOf);
  }
  return ga;
}

function fromTotalDays(totalDays: number, asOf: Date): GestationalAge {
  const days = Math.max(0, Math.round(totalDays));
  const weeks = Math.floor(days / 7);
  return {
    weeks,
    days: days % 7,
    totalDays: days,
    progressPct: Math.min(100, Math.round((days / DAYS_IN_PREGNANCY) * 100)),
    trimester: weeks < 14 ? 1 : weeks < 28 ? 2 : 3,
    // 24+0 weeks is the local viability threshold used for triage language;
    // the value is configurable through clinical rule settings.
    viable: weeks >= 24,
    postTerm: weeks >= 42,
    valid: true,
  };
}

export const formatGestationalAge = (ga: Pick<GestationalAge, 'weeks' | 'days' | 'valid'>): string =>
  ga.valid ? `${ga.weeks} weeks ${ga.days} days` : 'Not dated';

export const shortGestationalAge = (ga: Pick<GestationalAge, 'weeks' | 'days' | 'valid'>): string =>
  ga.valid ? `${ga.weeks}+${ga.days}` : '—';

/** Human wording for the interface: “Second trimester”, never “Trimester 2”. */
export function trimesterLabel(ga: GestationalAge): string {
  if (!ga.valid) return 'Dating required';
  const names = { 1: 'First', 2: 'Second', 3: 'Third' } as const;
  return `${names[ga.trimester]} trimester`;
}

/** Weeks-of-pregnancy bucket used by facility charts. */
export function gestationalBucket(ga: GestationalAge): string {
  if (!ga.valid) return 'Undated';
  if (ga.weeks < 13) return 'Until 12 wks';
  if (ga.weeks < 28) return '13–27 wks';
  if (ga.weeks < 37) return '28–36 wks';
  if (ga.weeks < 42) return '37–41 wks';
  return '42+ wks';
}

/** Date of birth + age, computed from a DOB (never stored as truth). */
export function ageFromDob(dob?: string | Date | null, asOf: Date = new Date()): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime()) || d > asOf) return null;
  let age = asOf.getFullYear() - d.getFullYear();
  const monthDelta = asOf.getMonth() - d.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < d.getDate())) age -= 1;
  return Math.max(0, age);
}

/**
 * Routine ANC spacing (national-guideline default; the schedule a facility
 * actually uses is configurable and validated separately).
 */
export const ROUTINE_ANC_SCHEDULE = [
  { weeks: 12, label: 'Booking visit' },
  { weeks: 20, label: 'Second trimester review' },
  { weeks: 26, label: 'Routine review' },
  { weeks: 30, label: 'Routine review' },
  { weeks: 34, label: 'Third trimester review' },
  { weeks: 36, label: 'Labour preparedness review' },
  { weeks: 38, label: 'Term review' },
  { weeks: 40, label: 'Post-dates review' },
] as const;

/** Next routine visit = first milestone after current GA, else +4 weeks (capped at EDD). */
export function suggestNextAppointment(opts: {
  eddDate?: string | null;
  ga: GestationalAge;
  intervalWeeks?: number;
}): string {
  const { eddDate, ga } = opts;
  const intervalDays = (opts.intervalWeeks ?? 4) * 7;
  const next = ROUTINE_ANC_SCHEDULE.find((milestone) => milestone.weeks > ga.weeks);
  const base = next
    ? (() => {
        const lmp = eddDate ? new Date(addDays(eddDate, -DAYS_IN_PREGNANCY)) : new Date();
        return addDays(lmp, next.weeks * 7);
      })()
    : addDays(new Date(), intervalDays);
  if (eddDate) {
    const edd = new Date(eddDate);
    const floor = new Date();
    floor.setDate(floor.getDate() + 2);
    if (base < floor) return floor.toISOString().slice(0, 10);
    if (base > edd) return edd.toISOString().slice(0, 10);
  }
  const today = new Date();
  if (base < today) return addDays(today, Math.min(intervalDays, 14)).toISOString().slice(0, 10);
  return base.toISOString().slice(0, 10);
}

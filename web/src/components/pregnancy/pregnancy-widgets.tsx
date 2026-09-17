/**
 * Pregnancy widgets — the pieces that make the tracker legible at a glance.
 *
 * Every one of them says, in words, what the number is: an *estimate*. A ring, a
 * bar or a countdown is easy to mistake for a clinical measurement, so each is
 * paired with plain language and a link to the weekly guide.
 */

import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, Clock3, Play, RotateCcw, Square } from 'lucide-react';
import { cn, daysBetween, formatDate } from '@/lib/utils';
import { WEEKS_FULL_TERM, trimesterLabel, type GestationalAge } from '@/lib/obstetrics';
import { Badge, ProgressBar } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Circular progress ring: weeks completed out of a 40-week pregnancy. */
export function WeekRing({ ga, size = 168 }: { ga: GestationalAge | null; size?: number }) {
  const pct = ga?.valid ? Math.min(100, (ga.totalDays / (WEEKS_FULL_TERM * 7)) * 100) : 0;
  const radius = (size - 18) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct / 100);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={ga?.valid ? `Pregnancy week ${ga.weeks} plus ${ga.days} days, ${Math.round(pct)}% through an estimated 40-week pregnancy` : 'Pregnancy not dated yet'}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--color-ink-200)" strokeWidth="10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--color-brand-600)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 700ms ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {ga?.valid ? (
          <>
            <span className="micro">Week</span>
            <span className="text-[2.6rem] leading-none font-bold text-ink-900 tnum">{ga.weeks}</span>
            <span className="mt-1 text-xs font-medium text-ink-500 tnum">+{ga.days} days</span>
          </>
        ) : (
          <>
            <span className="micro">Not dated</span>
            <span className="mt-1 text-sm text-ink-500">Add your dates</span>
          </>
        )}
      </div>
    </div>
  );
}

/** Trimester track with the current position marked. */
export function TrimesterTrack({ ga }: { ga: GestationalAge | null }) {
  const segments = [
    { label: 'First', range: 'Weeks 1–13', active: ga?.trimester === 1 },
    { label: 'Second', range: 'Weeks 14–27', active: ga?.trimester === 2 },
    { label: 'Third', range: 'Weeks 28–40+', active: ga?.trimester === 3 },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {segments.map((segment) => (
        <div
          key={segment.label}
          className={cn(
            'rounded-lg border px-3 py-2.5 text-center',
            segment.active ? 'border-brand-600 bg-brand-50' : 'border-ink-200 bg-white',
          )}
        >
          <p className={cn('text-[0.8rem] font-semibold', segment.active ? 'text-brand-900' : 'text-ink-600')}>{segment.label}</p>
          <p className="mt-0.5 text-[0.68rem] text-ink-500 tnum">{segment.range}</p>
        </div>
      ))}
    </div>
  );
}

/** Due date, days remaining and the dating method, in one card. */
export function DueDateCard({
  ga,
  eddDate,
  lmpDate,
  datingMethod,
}: {
  ga: GestationalAge | null;
  eddDate: string | null;
  lmpDate: string | null;
  datingMethod?: string | null;
}) {
  const remaining = useMemo(() => (eddDate ? Math.max(0, daysBetween(new Date(), new Date(eddDate))) : null), [eddDate]);
  const weeksLeft = remaining !== null ? Math.floor(remaining / 7) : null;
  const daysLeft = remaining !== null ? remaining % 7 : null;

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="micro">Estimated due date</p>
          <p className="mt-1 text-xl font-bold text-ink-900">
            {eddDate ? formatDate(eddDate, 'long') : 'Not set'}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {lmpDate ? `Last menstrual period: ${formatDate(lmpDate, 'long')}` : 'Add your last menstrual period to estimate a due date'}
          </p>
        </div>
        <div className="text-right">
          {remaining !== null ? (
            <>
              <p className="text-2xl font-bold text-brand-800 tnum">
                {weeksLeft}
                <span className="text-sm font-semibold text-ink-500"> wks </span>
                {daysLeft}
                <span className="text-sm font-semibold text-ink-500"> days</span>
              </p>
              <p className="text-xs text-ink-500">to go</p>
            </>
          ) : (
            <Badge tone="neutral">Estimate</Badge>
          )}
        </div>
      </div>

      <div className="mt-4">
        <ProgressBar value={ga?.valid ? ga.progressPct : 0} label={`${ga?.valid ? ga.progressPct : 0}% of an estimated 40-week pregnancy`} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-ink-500">Trimester</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{ga?.valid ? trimesterLabel(ga) : 'Dating required'}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Dating from</dt>
          <dd className="mt-0.5 font-semibold text-ink-900">{datingLabel(datingMethod)}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-500">Weeks completed</dt>
          <dd className="mt-0.5 font-semibold text-ink-900 tnum">{ga?.valid ? `${ga.weeks}+${ga.days}` : '—'}</dd>
        </div>
      </dl>

      <p className="mt-4 text-xs leading-relaxed text-ink-500">
        These dates are estimates calculated from the information you entered. A clinician's assessment, including any
        scan dating, always takes precedence.
      </p>
    </Card>
  );
}

export const datingLabel = (method?: string | null): string =>
  ({
    lmp: 'Last period',
    ultrasound: 'Ultrasound scan',
    clinician: 'Healthcare provider',
    unknown: 'Not stated',
  })[method ?? 'unknown'] ?? 'Not stated';

/**
 * Fetal movement counter.
 *
 * Counts kicks in one sitting and records the result as an observation. It is a
 * diary, not a monitor: it never says whether the count is reassuring, and it
 * always shows the same instruction — if movements reduce, contact your facility.
 */
export function KickCounter({
  onSave,
  saving,
}: {
  onSave: (input: { count: number; minutes: number; at: string }) => Promise<void> | void;
  saving?: boolean;
}) {
  const [count, setCount] = useState(0);
  const [startedAt, setStartedAt] = useState<Date | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const elapsedMinutes = startedAt ? Math.max(0, Math.round((Date.now() - startedAt.getTime()) / 60_000)) : 0;

  const start = (): void => {
    setStartedAt(new Date());
    setCount(0);
    setSaved(null);
  };

  const stop = async (): Promise<void> => {
    if (!startedAt) return;
    const at = new Date().toISOString();
    await onSave({ count, minutes: Math.max(1, elapsedMinutes), at });
    setSaved(`Saved: ${count} movement${count === 1 ? '' : 's'} in ${Math.max(1, elapsedMinutes)} minute${elapsedMinutes === 1 ? '' : 's'}.`);
    setStartedAt(null);
  };

  const reset = (): void => {
    setCount(0);
    setStartedAt(null);
    setSaved(null);
  };

  return (
    <Card className="card-pad">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="h3">Movement counter</h3>
          <p className="mt-1 text-sm text-ink-600">
            Count the movements you feel, and save the count to your diary. This records what you noticed — it does not
            judge whether the number is normal.
          </p>
        </div>
        <Clock3 className="size-5 shrink-0 text-brand-700" aria-hidden />
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="flex size-24 flex-col items-center justify-center rounded-full border-2 border-brand-200 bg-brand-50">
          <span className="text-3xl font-bold text-brand-900 tnum">{count}</span>
          <span className="text-[0.65rem] font-semibold tracking-wide text-brand-700 uppercase">
            {startedAt ? `${elapsedMinutes} min` : 'movements'}
          </span>
        </div>

        <div className="actions-wrap">
          {!startedAt ? (
            <Button onClick={start} icon={<Play className="size-4" aria-hidden />}>
              Start counting
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setCount((value) => value + 1)} className="min-w-[132px]">
                I felt a movement
              </Button>
              <Button variant="primary" onClick={() => void stop()} disabled={saving} icon={<Square className="size-4" aria-hidden />}>
                Stop & save
              </Button>
            </>
          )}
          {count > 0 || startedAt ? (
            <Button variant="ghost" onClick={reset} icon={<RotateCcw className="size-4" aria-hidden />}>
              Reset
            </Button>
          ) : null}
        </div>
      </div>

      {saved ? <p className="mt-3 text-sm font-medium text-[var(--color-risk-green)]">{saved}</p> : null}

      <p className="alert alert-warn mt-4 px-3 py-2.5 text-[0.82rem] leading-relaxed">
        If movements reduce or stop, or the pattern changes from what is normal for your baby, contact your health
        facility the same day. Do not wait for your next appointment.
      </p>
    </Card>
  );
}

/** "Next appointment" strip used on the dashboard. */
export function NextAppointmentStrip({
  date,
  time,
  facilityName,
  purpose,
  to = '/app/appointments',
  label = 'View appointment',
}: {
  date: string;
  time?: string | null;
  facilityName: string;
  purpose?: string | null;
  to?: string;
  label?: string;
}) {
  const daysAway = daysBetween(new Date(), new Date(date));
  const when =
    daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : daysAway > 1 ? `In ${daysAway} days` : formatDate(date, 'day');

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="micro">Next appointment</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink-900">
            <CalendarDays className="size-4 text-brand-700" aria-hidden />
            {formatDate(date, 'day')}
            {time ? <span className="font-normal text-ink-600 tnum">· {time}</span> : null}
            <Badge tone={daysAway <= 1 ? 'amber' : 'brand'}>{when}</Badge>
          </p>
          <p className="mt-1 truncate text-sm text-ink-600">
            {facilityName}
            {purpose ? ` · ${purpose}` : ''}
          </p>
        </div>
        <ButtonLinkLike to={to}>{label}</ButtonLinkLike>
      </div>
    </Card>
  );
}

function ButtonLinkLike({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link to={to} className="btn btn-secondary btn-sm shrink-0">
      {children}
      <ChevronRight className="size-4" aria-hidden />
    </Link>
  );
}

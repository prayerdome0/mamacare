import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CalendarClock, Check, Heart, PartyPopper, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { useAsync } from '@/hooks';
import { services } from '@/services/session-store';
import { safeLocal } from '@/lib/storage';

/**
 * First-run setup guide.
 *
 * A new deployment is *deliberately empty* — no demonstration patients, no
 * placeholder staff, no invented statistics. This card is what replaces the old
 * seeded dataset: it reads the four things a clinic must have before the
 * platform is useful, ticks them off as they become true, and links straight to
 * the screen that creates the missing one.
 *
 * Nothing here can be faked: each step is a live count through the normal data
 * layer, so a step only ticks over when the record really exists.
 */

const DISMISS_KEY = 'mamacare.setup-dismissed';

interface Step {
  key: string;
  label: string;
  description: string;
  to: string;
  cta: string;
  icon: ReactNode;
  done: boolean;
}

interface Counts {
  facilities: number;
  staff: number;
  mothers: number;
  appointments: number;
}

const EMPTY: Counts = { facilities: 0, staff: 0, mothers: 0, appointments: 0 };

export function SetupChecklist({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(() => safeLocal.get(DISMISS_KEY) === '1');

  const counts = useAsync<Counts>(
    async () => {
      const registry = services();
      const [facilities, staff, mothers, appointments] = await Promise.all([
        registry.data.allFacilities().catch(() => [] as { id: string }[]),
        registry.data.list('users', { limit: 500 }).catch(() => ({ rows: [] as { status: string; role: string }[] })),
        registry.data.motherRoster(null).catch(() => [] as { id: string }[]),
        registry.data.list('appointments', { limit: 500 }).catch(() => ({ rows: [] as { id: string }[] })),
      ]);
      return {
        facilities: facilities.length,
        staff: staff.rows.filter((row) => row.status === 'ACTIVE' && row.role !== 'MOTHER').length,
        mothers: mothers.length,
        appointments: appointments.rows.length,
      };
    },
    {},
  );

  const value = counts.data ?? EMPTY;

  const steps = useMemo<Step[]>(
    () => [
      {
        key: 'facility',
        label: 'Add the facilities you serve',
        description: 'Every record, alert and report is scoped to a facility, so this comes first.',
        to: '/admin/facilities',
        cta: 'Add a facility',
        icon: <Building2 className="size-4" aria-hidden />,
        done: value.facilities > 0,
      },
      {
        key: 'staff',
        label: 'Add your health-workers',
        description: 'Midwives, nurses and community health workers are approved and assigned to a facility.',
        to: '/admin/users',
        cta: 'Add staff',
        icon: <UserCog className="size-4" aria-hidden />,
        done: value.staff > 1,
      },
      {
        key: 'mother',
        label: 'Register the first mother',
        description: 'Creates the patient record, the pregnancy and the antenatal review schedule.',
        to: '/admin/mothers',
        cta: 'Register a mother',
        icon: <Heart className="size-4" aria-hidden />,
        done: value.mothers > 0,
      },
      {
        key: 'appointment',
        label: 'Schedule the first review',
        description: 'Scheduled reviews drive the automatic reminders and the missed-review follow-up.',
        to: '/admin/appointments',
        cta: 'Schedule a review',
        icon: <CalendarClock className="size-4" aria-hidden />,
        done: value.appointments > 0,
      },
    ],
    [value],
  );

  const done = steps.filter((step) => step.done).length;
  const complete = done === steps.length;

  const hide = (): void => {
    safeLocal.set(DISMISS_KEY, '1');
    setDismissed(true);
  };

  if (dismissed) return null;

  return (
    <Card
      className={className}
      title="Set up this deployment"
      description={`${done} of ${steps.length} steps complete — every figure here is a live count, not an example.`}
      actions={
        <div className="flex items-center gap-2">
          <Badge tone={complete ? 'green' : 'brand'}>{complete ? 'Ready' : `${done}/${steps.length}`}</Badge>
          <button type="button" className="text-[0.78rem] font-semibold text-ink-500 hover:text-ink-800 hover:underline" onClick={hide}>
            {complete ? 'Hide' : 'Dismiss'}
          </button>
        </div>
      }
    >
      {counts.loading && !counts.data ? (
        <div className="space-y-2" aria-hidden>
          {steps.map((step) => (
            <div key={step.key} className="skeleton h-14 rounded-xl" />
          ))}
        </div>
      ) : (
        <ol className="space-y-2">
          {steps.map((step, index) => (
            <li key={step.key}>
              <div
                className={cn(
                  'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition-colors',
                  step.done ? 'border-[var(--color-risk-green-border)] bg-[var(--color-risk-green-soft)]/50' : 'border-ink-200 bg-white',
                )}
              >
                <span
                  className={cn(
                    'grid size-7 shrink-0 place-items-center rounded-full text-[0.75rem] font-bold',
                    step.done ? 'bg-[var(--color-risk-green)] text-white' : 'bg-ink-100 text-ink-600',
                  )}
                  aria-hidden
                >
                  {step.done ? <Check className="size-4" /> : index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-[0.88rem] font-semibold', step.done ? 'text-ink-600 line-through decoration-ink-400' : 'text-ink-900')}>
                    {step.label}
                  </p>
                  {!step.done ? <p className="caption mt-0.5">{step.description}</p> : null}
                </div>
                {!step.done ? (
                  <Link to={step.to} className="btn btn-sm btn-secondary shrink-0 whitespace-nowrap">
                    {step.icon}
                    {step.cta}
                    <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      {complete ? (
        <p className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--color-risk-green-soft)]/60 p-3 text-[0.82rem] text-ink-700">
          <PartyPopper className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-green)]" aria-hidden />
          This deployment has facilities, staff, a registered mother and a scheduled review. The clinical workspace is ready to use.
        </p>
      ) : null}
    </Card>
  );
}

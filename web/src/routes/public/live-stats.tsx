import { Activity, Building2, GraduationCap, HeartPulse, Stethoscope, Users } from 'lucide-react';
import type { ReactNode } from 'react';
import { usePlatformStats } from '@/hooks/use-platform-stats';
import { useSession } from '@/providers/app-providers';
import { CountUp } from '@/components/ui/count-up';
import { Skeleton } from '@/components/ui/display';
import { PUBLIC_STATS } from '@/config/site-content';

/**
 * The counting statistics strip.
 *
 * Every animated number is a real count read from the database through the normal
 * data layer. Where a number is not available to this visitor — clinical counts
 * are never world-readable — the strip shows the published reference standard
 * instead, labelled as such, so a figure is never presented as something it is
 * not. The caption under the strip always states which of the two you are seeing.
 */

interface Stat {
  key: string;
  label: string;
  detail?: string;
  value: number | null;
  icon: ReactNode;
  kind: 'live' | 'reference';
}

export function LiveStats({ className }: { className?: string }) {
  const stats = usePlatformStats({ includeClinical: true });
  const { actor } = useSession();

  const cards: Stat[] = [
    {
      key: 'facilities',
      label: 'Facilities on the platform',
      detail: stats.source === 'device' ? 'From this browser’s demonstration data' : 'Counted from the facility directory',
      value: stats.facilities,
      icon: <Building2 className="size-4" aria-hidden />,
      kind: 'live',
    },
    { key: 'contacts', label: 'Antenatal contacts per pregnancy', detail: 'WHO 2016 recommendation', value: 8, icon: <HeartPulse className="size-4" aria-hidden />, kind: 'reference' },
    { key: 'signs', label: 'Danger signs screened at every visit', detail: 'Recorded, never inferred', value: 13, icon: <Stethoscope className="size-4" aria-hidden />, kind: 'reference' },
  ];

  if (actor) {
    cards.push(
      {
        key: 'workers',
        label: 'Health-worker accounts',
        detail: 'Visible to signed-in staff only',
        value: stats.healthWorkers,
        icon: <Users className="size-4" aria-hidden />,
        kind: 'live',
      },
      {
        key: 'mothers',
        label: 'Mothers in care',
        detail: 'Active records in your access scope',
        value: stats.mothers,
        icon: <HeartPulse className="size-4" aria-hidden />,
        kind: 'live',
      },
      {
        key: 'visits',
        label: 'Antenatal visits recorded',
        detail: 'Counted from visit rows',
        value: stats.visits,
        icon: <Activity className="size-4" aria-hidden />,
        kind: 'live',
      },
      {
        key: 'education',
        label: 'Education items published',
        detail: 'Reading offered to mothers',
        value: stats.education,
        icon: <GraduationCap className="size-4" aria-hidden />,
        kind: 'live',
      },
    );
  } else {
    cards.push({
      key: 'statuses',
      label: 'Referral statuses tracked to closure',
      detail: 'Every handover has an end state',
      value: 9,
      icon: <Activity className="size-4" aria-hidden />,
      kind: 'reference',
    });
  }

  const liveCount = cards.filter((card) => card.kind === 'live' && card.value !== null).length;

  return (
    <div className={className}>
      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.key} className="card flex flex-col gap-1 p-4">
            <div className="flex items-start justify-between gap-2">
              <dt className="micro">{card.label}</dt>
              <span aria-hidden className="text-ink-300">
                {card.icon}
              </span>
            </div>
            <dd className="text-2xl font-bold tracking-tight text-brand-800 sm:text-3xl">
              {stats.loading && card.kind === 'live' ? (
                <Skeleton className="mt-1 h-8 w-16" />
              ) : card.kind === 'live' ? (
                <CountUp value={card.value} />
              ) : (
                <CountUp value={card.value} startOnView={false} />
              )}
            </dd>
            {card.detail ? <p className="text-[0.72rem] leading-snug text-ink-500">{card.detail}</p> : null}
          </div>
        ))}
      </dl>
      <p className="caption mt-3">
        {liveCount > 0 ? (
          <>
            Counts marked from the directory are read live from this deployment
            {stats.source === 'device' ? ' (device demonstration data — no project is configured in this build)' : ''}. Clinical totals are shown
            to signed-in staff only, because they are not public records.
          </>
        ) : (
          <>The figures shown are the published clinical reference standards. Live platform totals appear here once the facility directory is published, and clinical totals are visible to signed-in staff only.</>
        )}{' '}
        {PUBLIC_STATS.note}
      </p>
    </div>
  );
}

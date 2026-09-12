import { useState } from 'react';
import { CalendarClock, Phone } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { SegmentedControl } from '@/components/ui/tabs';
import { NoRecordNotice, useMotherRecord } from '@/routes/mother/shared';
import { EMERGENCY_CONTACTS } from '@/config/site-content';
import { daysBetween, formatDate, humanize, telHref, toIsoDate } from '@/lib/utils';
import { APPOINTMENT_TYPE_LABELS } from '@/types/domain';

/**
 * A mother’s own appointment list. She cannot edit it in this app on purpose —
 * rescheduling goes through the clinic so the midwife can check whether she needs
 * to be seen sooner.
 */
export default function MotherAppointments() {
  const { motherId, chart } = useMotherRecord();
  const [range, setRange] = useState<'upcoming' | 'past'>('upcoming');

  if (!motherId) {
    return (
      <AppShell title="My appointments">
        <NoRecordNotice />
      </AppShell>
    );
  }

  const today = toIsoDate(new Date());
  const rows = (chart.data?.appointments ?? [])
    .filter((row) => (range === 'upcoming' ? row.scheduledFor >= today : row.scheduledFor < today))
    .sort((a, b) => (range === 'upcoming' ? a.scheduledFor.localeCompare(b.scheduledFor) : b.scheduledFor.localeCompare(a.scheduledFor)));

  return (
    <AppShell
      title="My appointments"
      subtitle="Every visit your clinic has booked for you, and what happened at the ones you attended."
      actions={
        EMERGENCY_CONTACTS.facilityLine ? (
          <a href={telHref(EMERGENCY_CONTACTS.facilityLine)} className="btn btn-secondary btn-sm inline-flex items-center gap-1.5">
            <Phone className="size-4" aria-hidden /> Call the clinic
          </a>
        ) : null
      }
    >
      {chart.loading && !chart.data ? (
        <Card>
          <LoadingRows rows={3} />
        </Card>
      ) : chart.error ? (
        <ErrorState message={chart.error} onRetry={() => void chart.run()} title="Your appointments did not load" />
      ) : (
        <>
          <div className="mb-4">
            <SegmentedControl
              ariaLabel="Which appointments"
              value={range}
              onChange={setRange}
              options={[
                { value: 'upcoming', label: 'Coming up' },
                { value: 'past', label: 'Past visits' },
              ]}
            />
          </div>

          {rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<CalendarClock className="size-5" aria-hidden />}
                title={range === 'upcoming' ? 'No appointment booked yet' : 'No past visits recorded'}
                description={
                  range === 'upcoming'
                    ? 'Your clinic usually books the next antenatal visit before you leave. If nothing is booked, please call and ask for one.'
                    : 'Once your clinic records a visit it will appear here.'
                }
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => {
                const days = Math.ceil(daysBetween(today, row.scheduledFor));
                const isNext = range === 'upcoming' && days >= 0;
                return (
                  <li key={row.id}>
                    <Card className={isNext ? 'border-brand-300' : undefined}>
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[0.95rem] font-semibold text-ink-900">{formatDate(row.scheduledFor)}</p>
                          <p className="muted mt-0.5">
                            {row.time} · {APPOINTMENT_TYPE_LABELS[row.type]}
                          </p>
                          {row.reason ? <p className="mt-1.5 text-[0.86rem] text-ink-700">{row.reason}</p> : null}
                          {row.assignedUserName ? <p className="caption mt-1">With {row.assignedUserName}</p> : null}
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <Badge
                            tone={
                              row.status === 'COMPLETED'
                                ? 'green'
                                : row.status === 'MISSED' || row.status === 'CANCELLED'
                                  ? 'red'
                                  : row.status === 'CONFIRMED'
                                    ? 'brand'
                                    : 'neutral'
                            }
                          >
                            {humanize(row.status)}
                          </Badge>
                          {isNext ? <span className="caption">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}</span> : null}
                        </div>
                      </div>
                      {row.reminderDays.length > 0 && range === 'upcoming' ? (
                        <p className="caption mt-3 border-t border-ink-100 pt-2.5">
                          We will remind you {row.reminderDays.join(' and ')} days before. Make sure notifications are allowed on your phone.
                        </p>
                      ) : null}
                      {row.cancelledReason ? <p className="caption mt-2">Cancelled: {row.cancelledReason}</p> : null}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-4">
            <NoticeState tone="info" title="If you cannot come" compact>
              Call the clinic and tell them. Missing a visit is not a problem as long as you book another one — but the visits are how problems are found early,
              so please do not skip them.
            </NoticeState>
          </div>
        </>
      )}
    </AppShell>
  );
}

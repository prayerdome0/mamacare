import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { CalendarClock, CalendarPlus, BellRing, RefreshCw, Send } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { EmptyState, ErrorState, NoticeState, StatusBadge } from '@/components/ui/display';
import { SegmentedControl } from '@/components/ui/tabs';
import { SearchInput, Switch } from '@/components/ui/form';
import { useConfirm, useSession } from '@/providers/app-providers';
import { useAsync, useDebouncedValue, useLiveQuery } from '@/hooks';
import { services } from '@/services/session-store';
import { useToast } from '@/components/ui/toast';
import { formatDate, humanize, relativeTime, toIsoDate } from '@/lib/utils';
import { APPOINTMENT_TYPE_LABELS, type Appointment } from '@/types/domain';
import { AppointmentDialog } from '@/routes/app/appointment-dialog';

type Range = 'today' | 'upcoming' | 'overdue' | 'missed' | 'all';

/**
 * Appointment register. Status changes go through the data layer, which records
 * who did it, notifies the mother's reminders and raises the follow-up alert for
 * a missed visit. Reminders themselves are queued by `sendDueReminders`.
 */
export default function AppointmentsPage() {
  const { link: navLink } = useNavScope();
  const [params, setParams] = useSearchParams();
  const { actor, permissions } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState<Range>((params.get('range') as Range) ?? 'today');
  const [term, setTerm] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [dialog, setDialog] = useState<{ open: boolean; appointment: Appointment | null }>({ open: false, appointment: null });
  const [busy, setBusy] = useState<string | null>(null);
  const search = useDebouncedValue(term, 200);

  const live = useLiveQuery('appointments', {
    where: actor?.facilityId && actor.role !== 'ADMIN' ? [{ field: 'facilityId', op: '==', value: actor.facilityId }] : [],
    orderBy: { field: 'scheduledFor', direction: 'desc' },
    limit: 400,
  });

  const queue = useAsync(() => Promise.resolve(null), { immediate: false });

  const today = toIsoDate(new Date());
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (live.data as Appointment[]).filter((row) => {
      if (mineOnly && actor && row.assignedUserId !== actor.uid) return false;
      if (needle && !`${row.motherName} ${row.patientId}`.toLowerCase().includes(needle)) return false;
      switch (range) {
        case 'today':
          return row.scheduledFor === today && (row.status === 'SCHEDULED' || row.status === 'CONFIRMED');
        case 'upcoming':
          return row.scheduledFor > today && (row.status === 'SCHEDULED' || row.status === 'CONFIRMED');
        case 'overdue':
          return row.scheduledFor < today && (row.status === 'SCHEDULED' || row.status === 'CONFIRMED');
        case 'missed':
          return row.status === 'MISSED' || row.status === 'CANCELLED';
        default:
          return true;
      }
    });
  }, [live.data, range, today, search, mineOnly, actor]);

  const counts = useMemo(() => {
    const all = live.data as Appointment[];
    const open = all.filter((row) => row.status === 'SCHEDULED' || row.status === 'CONFIRMED');
    return {
      today: open.filter((row) => row.scheduledFor === today).length,
      upcoming: open.filter((row) => row.scheduledFor > today).length,
      overdue: open.filter((row) => row.scheduledFor < today).length,
      missed: all.filter((row) => row.status === 'MISSED' || row.status === 'CANCELLED').length,
      all: all.length,
    };
  }, [live.data, today]);

  const act = async (row: Appointment, status: Appointment['status']) => {
    setBusy(row.id);
    try {
      if (status === 'CANCELLED') {
        const ok = await confirm({
          title: 'Cancel this appointment?',
          message: `${row.motherName} on ${formatDate(row.scheduledFor)}. The reason you enter next is stored on the record.`,
          confirmLabel: 'Continue',
        });
        if (!ok) return;
      }
      await services().data.setAppointmentStatus(row.id, status, status === 'CANCELLED' ? { note: 'Cancelled by the clinic from the appointment register.' } : {});
      toast.success('Appointment updated', `${row.motherName} · ${humanize(status)}`);
      void live.refresh();
    } catch (error) {
      toast.error(error, 'Could not update the appointment');
    } finally {
      setBusy(null);
    }
  };

  const processQueue = async () => {
    setBusy('queue');
    try {
      const sweep = await services().data.sweepMissedAppointments(actor?.facilityId ?? null);
      const reminders = await services().data.sendDueReminders(actor?.facilityId ?? null);
      toast.success(
        'Queue processed',
        `${sweep.updated} appointment${sweep.updated === 1 ? '' : 's'} marked missed · ${reminders.sent} reminder${reminders.sent === 1 ? '' : 's'} queued for delivery.`,
      );
      void live.refresh();
      void queue.run();
    } catch (error) {
      toast.error(error, 'The queue could not be processed');
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Appointment>[] = [
    {
      key: 'mother',
      header: 'Mother',
      render: (row) => (
        <div className="min-w-0">
          <a href={`${navLink('/mothers')}/${row.motherId}`} className="block truncate text-[0.88rem] font-semibold text-ink-900 hover:text-brand-800 hover:underline">
            {row.motherName}
          </a>
          <p className="micro mt-0.5">{row.patientId}</p>
        </div>
      ),
      sortValue: (row) => row.motherName,
    },
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-[0.86rem] font-medium text-ink-900 tnum">
            {formatDate(row.scheduledFor)} · {row.time}
          </p>
          <p className="caption mt-0.5">
            {APPOINTMENT_TYPE_LABELS[row.type]} · {row.durationMinutes} min
            {row.scheduledFor < today ? ' · past due' : ''}
          </p>
        </div>
      ),
      sortValue: (row) => `${row.scheduledFor}${row.time}`,
    },
    {
      key: 'who',
      header: 'Assigned',
      render: (row) => (
        <div>
          <p className="text-[0.84rem] text-ink-700">{row.assignedUserName ?? 'Anyone on duty'}</p>
          {row.reminderDays.length > 0 ? <p className="caption">reminders {row.reminderDays.join('/')} days before</p> : <p className="caption">no reminders</p>}
        </div>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.completedVisitId ? <p className="caption">visit recorded</p> : null}
          {row.cancelledReason ? <p className="caption line-clamp-1">{row.cancelledReason}</p> : null}
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        permissions.canScheduleAppointment && (row.status === 'SCHEDULED' || row.status === 'CONFIRMED') ? (
          <div className="flex flex-wrap justify-end gap-1.5">
            <Button size="sm" variant="secondary" disabled={busy === row.id} onClick={() => void act(row, 'COMPLETED')}>
              Attended
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void act(row, 'MISSED')}>
              Missed
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void act(row, 'CANCELLED')}>
              Cancel
            </Button>
            <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => setDialog({ open: true, appointment: row })}>
              Reschedule
            </Button>
          </div>
        ) : (
          <span className="caption">{relativeTime(row.updatedAt ?? row.createdAt)}</span>
        ),
    },
  ];

  return (
    <AppShell
      title="Appointments"
      subtitle={`${counts.today} today · ${counts.upcoming} upcoming · ${counts.overdue} overdue`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={busy === 'queue'} onClick={() => void processQueue()} icon={<BellRing className="size-4" aria-hidden />}>
            Process reminders
          </Button>
          <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canScheduleAppointment ? (
            <Button size="sm" onClick={() => setDialog({ open: true, appointment: null })} icon={<CalendarPlus className="size-4" aria-hidden />}>
              Book appointment
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Today" value={counts.today} hint="Awaiting attendance" tone={counts.today > 0 ? 'brand' : 'default'} icon={<CalendarClock className="size-4" aria-hidden />} />
        <StatCard label="Upcoming" value={counts.upcoming} hint="Scheduled ahead" />
        <StatCard label="Overdue" value={counts.overdue} hint="Past due, not yet marked" tone={counts.overdue > 0 ? 'amber' : 'green'} />
        <StatCard label="Missed or cancelled" value={counts.missed} hint="Each missed visit raises a follow-up alert" tone={counts.missed > 0 ? 'red' : 'default'} />
      </div>

      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Appointment range"
            value={range}
            onChange={(value) => {
              setRange(value);
              const next = new URLSearchParams(params);
              next.set('range', value);
              setParams(next, { replace: true });
            }}
            options={[
              { value: 'today', label: 'Today', count: counts.today },
              { value: 'upcoming', label: 'Upcoming', count: counts.upcoming },
              { value: 'overdue', label: 'Overdue', count: counts.overdue },
              { value: 'missed', label: 'Missed', count: counts.missed },
              { value: 'all', label: 'All', count: counts.all },
            ]}
          />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <SearchInput value={term} onValueChange={setTerm} placeholder="Search mother or patient ID" className="min-w-[14rem] max-w-sm flex-1" />
            <div className="w-40">
              <Switch checked={mineOnly} onChange={setMineOnly} label="Only mine" />
            </div>
          </div>
        </div>
      </Card>

      {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}

      <Card bodyClassName="p-0">
        {rows.length === 0 && !live.loading ? (
          <EmptyState
            icon={<CalendarPlus className="size-5" aria-hidden />}
            title={range === 'today' ? 'Nothing booked for today' : 'No appointments in this view'}
            description={
              range === 'overdue'
                ? 'No appointment has passed without being marked. Run “Process reminders” at the start of a shift to sweep the register.'
                : 'Book an appointment to start the reminder cycle: in-app push to the mother’s device and SMS where enabled.'
            }
            action={
              permissions.canScheduleAppointment ? (
                <Button onClick={() => setDialog({ open: true, appointment: null })}>
                  Book appointment
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} loading={live.loading} dense pageSize={30} caption="Appointments" />
        )}
      </Card>

      <div className="mt-4">
        <NoticeState tone="info" title="How reminders are delivered" compact>
          {`Each appointment stores its own reminder offsets. The queue is drained by “Process reminders” (and by the scheduled API worker in the hosted
          deployment): a due reminder writes an in-app notification, sends a push message when the mother's device token is registered, and queues an SMS
          when SMS is enabled in settings. Nothing is sent to a device without a stored token, and no token is hard-coded.`}
        </NoticeState>
      </div>

      <AppointmentDialog
        open={dialog.open}
        appointment={dialog.appointment}
        onClose={() => setDialog({ open: false, appointment: null })}
        onSaved={() => {
          setDialog({ open: false, appointment: null });
          void live.refresh();
        }}
      />
    </AppShell>
  );
}

import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarPlus,
  ClipboardList,
  HeartPulse,
  Plus,
  RefreshCw,
  Search,
  Send,
  Stethoscope,
  Users,
} from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card, KeyValue, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows, NoticeState, StatusBadge } from '@/components/ui/display';
import { BarChart, DonutChart } from '@/components/charts';
import { useSession } from '@/providers/app-providers';
import { useAsync } from '@/hooks';
import { computeStats, myWorkload } from '@/services/dashboard/dashboard-service';
import { services } from '@/services/session-store';
import { formatDate, toIsoDate } from '@/lib/utils';
import { AppointmentDialog } from '@/routes/app/appointment-dialog';
import { RegisterMotherDialog } from '@/routes/app/register-mother-dialog';

export default function WorkerDashboard() {
  const { link: navLink } = useNavScope();
  const { actor, permissions, providerKind } = useSession();
  const navigate = useNavigate();
  const [showAppointments, setShowAppointments] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [queueResult, setQueueResult] = useState<string | null>(null);

  const stats = useAsync(() => computeStats({}), { deps: [] });
  const workload = useAsync(() => myWorkload(), { deps: [] });

  const reload = () => {
    void stats.run();
    void workload.run();
  };

  const today = toIsoDate(new Date());
  const loadError = stats.error ?? workload.error;

  const processQueue = async () => {
    setSweeping(true);
    try {
      const sweep = await services().data.sweepMissedAppointments(actor?.facilityId ?? null);
      const reminders = await services().data.sendDueReminders(actor?.facilityId ?? null);
      setQueueResult(
        `${sweep.updated} appointment${sweep.updated === 1 ? '' : 's'} marked as missed · ${reminders.sent} reminder${reminders.sent === 1 ? '' : 's'} queued.`,
      );
      reload();
    } catch (error) {
      setQueueResult(error instanceof Error ? error.message : 'The queue could not be processed.');
    } finally {
      setSweeping(false);
    }
  };

  return (
    <AppShell
      title={`Good ${greeting()}, ${firstName(actor?.displayName ?? actor?.email ?? 'there')}`}
      subtitle={
        workload.data ? (
          <>
            {stats.data?.scope.facilityName} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
            {workload.data.today.length} appointment{workload.data.today.length === 1 ? '' : 's'} today
          </>
        ) : (
          stats.data?.scope.facilityName
        )
      }
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={reload} loading={stats.loading || workload.loading} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canScheduleAppointment ? (
            <Button variant="secondary" size="sm" onClick={() => setShowAppointments(true)} icon={<CalendarPlus className="size-4" aria-hidden />}>
              Book appointment
            </Button>
          ) : null}
          {permissions.canRegisterMother ? (
            <Button size="sm" onClick={() => setShowRegister(true)} icon={<Plus className="size-4" aria-hidden />}>
              Register mother
            </Button>
          ) : null}
        </>
      }
    >
      {providerKind === 'local' ? (
        <div className="mb-4">
          <NoticeState tone="info" title="Device storage mode">
            Records are saved in this browser’s IndexedDB, behind the same policy module and alert engine as the hosted build. Add your
            Firebase project keys to <code className="rounded bg-white/70 px-1 py-0.5 text-[0.78rem]">web/.env.local</code> to switch the data layer
            without touching any screen.
          </NoticeState>
        </div>
      ) : null}

      {loadError ? (
        <div className="mb-4">
          <ErrorState title="The dashboard did not load" message={loadError} onRetry={reload} />
        </div>
      ) : null}

      {queueResult ? (
        <div className="mb-4">
          <NoticeState tone="success" title="Queue processed" dismissible onDismiss={() => setQueueResult(null)}>
            {queueResult}
          </NoticeState>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="space-y-4">
          <Card
            title="Today’s appointments"
            description={workload.data ? `${workload.data.today.length} today · ${workload.data.overdue.length} overdue · ${workload.data.upcoming.length} upcoming` : undefined}
            actions={
              <Link to={navLink("/appointments")} className="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-brand-800 hover:underline">
                All appointments <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            }
            bodyClassName="p-0"
          >
            {workload.loading && !workload.data ? (
              <div className="p-4">
                <LoadingRows rows={4} />
              </div>
            ) : workload.data && workload.data.today.length > 0 ? (
              <ul className="divide-y divide-ink-100">
                {workload.data.today.map((appointment) => (
                  <li key={appointment.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <span className="w-12 shrink-0 text-[0.92rem] font-bold text-ink-900 tnum">{appointment.time}</span>
                    <div className="min-w-0 flex-1">
                      <Link to={`${navLink('/mothers')}/${appointment.motherId}`} className="block max-w-full truncate text-left text-[0.88rem] font-semibold text-brand-900 hover:underline">
                        {appointment.motherName}
                      </Link>
                      <p className="micro mt-0.5">
                        {appointment.patientId} · {appointment.type.replace(/_/g, ' ')}
                        {appointment.assignedUserName ? ` · ${appointment.assignedUserName}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={appointment.status} />
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={<CalendarClock className="size-5" aria-hidden />}
                title="Nothing is booked for today"
                description="Scheduled reviews appear here as soon as they are booked. Walk-in contacts are recorded from the mother’s profile."
                action={
                  permissions.canScheduleAppointment ? (
                    <Button size="sm" variant="secondary" onClick={() => setShowAppointments(true)}>
                      Book an appointment
                    </Button>
                  ) : null
                }
              />
            )}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Needs action" bodyClassName="p-0">
              {workload.loading && !workload.data ? (
                <div className="p-4">
                  <LoadingRows rows={3} />
                </div>
              ) : !workload.data ? (
                <div className="p-4">
                  <ErrorState compact message={workload.error ?? 'Unavailable'} onRetry={reload} />
                </div>
              ) : (
                <ActionList workload={workload.data} />
              )}
            </Card>

            <Card
              title="This month"
              description="Counted from records dated on or after the 1st"
              actions={
                permissions.canScheduleAppointment ? (
                  <Button size="sm" variant="quiet" onClick={processQueue} loading={sweeping} icon={<Bell className="size-3.5" aria-hidden />}>
                    Process queue
                  </Button>
                ) : null
              }
            >
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Registrations" value={workload.data?.registrationsThisMonth} to={navLink("/mothers")} icon={<Users className="size-3.5" aria-hidden />} />
                <MiniStat label="Visits recorded" value={workload.data?.visitsThisMonth} to={navLink("/anc")} icon={<Stethoscope className="size-3.5" aria-hidden />} />
                <MiniStat label="Active referrals" value={workload.data?.activeReferrals.length} to={navLink("/referrals")} icon={<Send className="size-3.5" aria-hidden />} />
                <MiniStat label="Open alerts" value={stats.data?.totals.openAlerts} to={navLink("/alerts")} icon={<ClipboardList className="size-3.5" aria-hidden />} />
              </div>
              <p className="caption mt-3 border-t border-ink-100 pt-3">
                “Process queue” marks unattended past appointments as missed, raises the follow-up alert for each, and queues reminders that
                are now due.
              </p>
            </Card>
          </div>

          {stats.data ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <Card title="Visits per month" description={`${stats.data.period.from} to ${stats.data.period.to}`}>
                {stats.data.visitsByMonth.some((point) => point.value > 0) ? (
                  <BarChart data={stats.data.visitsByMonth} ariaLabel="Antenatal visits recorded per month" />
                ) : (
                  <p className="muted">No visits are recorded in this window yet.</p>
                )}
              </Card>
              <Card title="Risk mix" description="Level recorded on each open mother record">
                <DonutChart
                  data={stats.data.riskMix.map((row) => ({
                    label: `${row.level.charAt(0)}${row.level.slice(1).toLowerCase()} risk`,
                    value: row.count,
                    color: row.level === 'RED' ? '#c0392f' : row.level === 'AMBER' ? '#b4761c' : '#1f8f66',
                  }))}
                  centerLabel="records"
                  centerValue={stats.data.totals.mothers}
                />
              </Card>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <Card title="Facility overview" bodyClassName="p-0">
            {stats.loading && !stats.data ? (
              <div className="p-4">
                <LoadingRows rows={6} />
              </div>
            ) : !stats.data ? (
              <div className="p-4">
                <ErrorState compact message={stats.error ?? 'Unavailable'} onRetry={reload} />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3 p-4">
                  <StatCard label="Mothers in care" value={stats.data.totals.mothers} tone="brand" onClick={() => navigate(navLink('/mothers'))} />
                  <StatCard label="Active pregnancies" value={stats.data.totals.activePregnancies} onClick={() => navigate(navLink('/mothers'))} />
                  <StatCard
                    label="Red alerts open"
                    value={stats.data.totals.redAlerts}
                    tone={stats.data.totals.redAlerts > 0 ? 'red' : 'default'}
                    onClick={() => navigate(navLink('/alerts'))}
                  />
                  <StatCard
                    label="Amber alerts open"
                    value={stats.data.totals.amberAlerts}
                    tone={stats.data.totals.amberAlerts > 0 ? 'amber' : 'default'}
                    onClick={() => navigate(navLink('/alerts'))}
                  />
                  <StatCard
                    label="Missed or overdue"
                    value={stats.data.totals.missedAppointments}
                    tone={stats.data.totals.missedAppointments > 0 ? 'amber' : 'default'}
                    onClick={() => navigate(navLink('/appointments'))}
                  />
                  <StatCard label="Referrals open" value={stats.data.totals.activeReferrals} onClick={() => navigate(navLink('/referrals'))} />
                </div>
                <div className="border-t border-ink-200 px-4 py-3.5">
                  <KeyValue
                    columns={1}
                    dense
                    items={[
                      {
                        label: 'Appointment attendance',
                        value: `${stats.data.attendance.ratePct}% — ${stats.data.attendance.attended} attended of ${stats.data.attendance.scheduled} scheduled in the window`,
                      },
                      { label: 'Visits this month', value: stats.data.totals.visitsThisMonth },
                      { label: 'Deliveries this month', value: stats.data.totals.deliveriesThisMonth },
                      { label: 'Health workers active', value: stats.data.totals.healthWorkers },
                      { label: 'Reports on file', value: stats.data.totals.reportsGenerated },
                      ...(actor?.role === 'ADMIN' && stats.data.totals.pendingApprovals > 0
                        ? [{ label: 'Accounts awaiting approval', value: stats.data.totals.pendingApprovals, tone: 'strong' as const }]
                        : []),
                    ]}
                  />
                </div>
                <div className="border-t border-ink-200 px-4 py-3">
                  <p className="micro mb-2">Next due</p>
                  {stats.data.upcoming.length === 0 ? (
                    <p className="muted">Nothing scheduled in the next few days.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {stats.data.upcoming.slice(0, 5).map((item, index) => (
                        <li key={`${item.label}-${index}`} className="flex items-center justify-between gap-3 text-[0.78rem]">
                          <span className="min-w-0 truncate text-ink-600">{item.label}</span>
                          <span
                            className={
                              item.tone === 'critical'
                                ? 'shrink-0 font-semibold text-[var(--color-risk-red-text)]'
                                : item.tone === 'warning'
                                  ? 'shrink-0 font-semibold text-[var(--color-risk-amber-text)]'
                                  : 'shrink-0 text-ink-500'
                            }
                          >
                            {item.value}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <p className="caption border-t border-ink-200 px-4 py-3">{stats.data.dataBasis[1]}</p>
              </>
            )}
          </Card>

          <Card title="Find a mother" description="Patient ID, name or phone number" bodyClassName="p-4">
            <Button block variant="secondary" onClick={() => navigate(navLink('/mothers'))} icon={<Search className="size-4" aria-hidden />}>
              Open the mothers register
            </Button>
            <p className="caption mt-2.5">
              Search by patient ID (for example <span className="font-semibold text-ink-700">MC-000245</span>) works even when the mother was
              registered at another facility.
            </p>
          </Card>

          {stats.data && stats.data.gestationalSpread.length > 0 ? (
            <Card title="Dating spread" description="Gestational age of open pregnancies">
              <BarChart data={stats.data.gestationalSpread} height={130} tone="#0d9488" />
            </Card>
          ) : null}
        </div>
      </div>

      <AppointmentDialog open={showAppointments} onClose={() => setShowAppointments(false)} onSaved={reload} />
      <RegisterMotherDialog open={showRegister} onClose={() => setShowRegister(false)} onRegistered={reload} />
    </AppShell>
  );
}

function ActionList({ workload }: { workload: Awaited<ReturnType<typeof myWorkload>> }) {
  const { link: navLink } = useNavScope();
  const rows: { key: string; icon: ReactNode; title: string; detail: string; to: string; tone: 'red' | 'amber' }[] = [
    ...workload.unassignedRed.map((alert) => ({
      key: `red-${alert.id}`,
      icon: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-red-text)]" aria-hidden />,
      title: alert.title,
      detail: `${alert.patientId} · red alert, nobody assigned`,
      to: navLink('/alerts'),
      tone: 'red' as const,
    })),
    ...workload.myAlerts.slice(0, 4).map((alert) => ({
      key: `mine-${alert.id}`,
      icon: <span className={`mt-1.5 size-2 shrink-0 rounded-full ${alert.level === 'RED' ? 'bg-[var(--color-risk-red)]' : 'bg-[var(--color-risk-amber)]'}`} aria-hidden />,
      title: alert.title,
      detail: `${alert.patientId} · ${alert.status.replace(/_/g, ' ')} · raised ${formatDate(alert.openedAt)}`,
      to: navLink('/alerts'),
      tone: alert.level === 'RED' ? ('red' as const) : ('amber' as const),
    })),
    ...workload.overdue.slice(0, 4).map((appointment) => ({
      key: `late-${appointment.id}`,
      icon: <CalendarClock className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-amber-text)]" aria-hidden />,
      title: `${appointment.type.replace(/_/g, ' ')} missed`,
      detail: `${appointment.patientId} · was due ${formatDate(appointment.scheduledFor)}`,
      to: navLink('/appointments'),
      tone: 'amber' as const,
    })),
  ];

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<HeartPulse className="size-5" aria-hidden />}
        title="Nothing is waiting on you"
        description="No unassigned red alerts, no alerts assigned to you, and no overdue appointments in your list."
      />
    );
  }

  return (
    <ul className="divide-y divide-ink-100">
      {rows.map((row) => (
        <li key={row.key}>
          <Link
            to={row.to}
            className={
              row.tone === 'red'
                ? 'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-risk-red-soft)]'
                : 'flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-risk-amber-soft)]'
            }
          >
            {row.icon}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.86rem] font-semibold text-ink-900">{row.title}</span>
              <span className="micro mt-0.5 block truncate">{row.detail}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MiniStat({ label, value, to, icon }: { label: string; value: number | undefined; to: string; icon: ReactNode }) {
  return (
    <Link to={to} className="rounded-lg border border-ink-200 bg-white p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/40">
      <span className="micro flex items-center gap-1.5 text-ink-500">
        {icon}
        {label}
      </span>
      <span className="mt-1 block text-xl font-bold text-ink-900 tnum">{value ?? '—'}</span>
    </Link>
  );
}

const greeting = (): string => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
};

const firstName = (value: string): string => value.split(' ')[0] ?? value;

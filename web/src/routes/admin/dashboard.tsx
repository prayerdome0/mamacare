import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Boxes,
  Check,
  Database,
  KeyRound,
  RefreshCw,
  Settings2,
  ShieldAlert,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { Field, Select } from '@/components/ui/form';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { computeStats } from '@/services/dashboard/dashboard-service';
import { approvePendingUser, listUsers } from '@/services/admin/user-admin';
import { DEMO_ACCOUNTS, seedDemonstrationData, type SeedSummary } from '@/services/demo/dataset';
import { integrations } from '@/config/env';
import { formatDate, relativeTime } from '@/lib/utils';
import { BarChart, DonutChart } from '@/components/charts';
import { ROLE_LABELS, type Facility, type Role } from '@/types/domain';
import type { UserDirectoryRow } from '@/services/admin/user-admin';

/**
 * Administrator overview: platform totals from the same aggregation the facility
 * dashboards use, the approval queue that only an admin can clear, and the live
 * state of every optional integration.
 */
export default function AdminDashboard() {
  const { providerKind, refresh } = useSession();
  const toast = useToast();
  const stats = useAsync(() => computeStats({ facilityId: null, months: 6 }), {});
  const pending = useAsync(() => listUsers({ status: 'PENDING_APPROVAL' }), {});
  const facilities = useAsync(() => services().data.allFacilities(), {});
  const audit = useAsync(() => services().data.list('audit_logs', { orderBy: { field: 'createdAt', direction: 'desc' }, limit: 6 }), {});
  const roster = useAsync(() => services().data.motherRoster(null), {});

  const [decisions, setDecisions] = useState<Record<string, { role: Role; facilityId: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<SeedSummary | null>(null);

  const reload = () => {
    void stats.run();
    void pending.run();
    void facilities.run();
    void audit.run();
    void roster.run();
  };

  const mothersByFacility = useMemo(() => {
    const map = new Map<string, number>();
    for (const mother of roster.data ?? []) {
      const key = mother.careFacilityId || mother.registrationFacilityId;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [roster.data]);

  const approve = async (row: UserDirectoryRow, action: 'approve' | 'decline') => {
    const choice = decisions[row.id] ?? { role: (row.requestedRole ?? 'COMMUNITY_HEALTH_WORKER') as Role, facilityId: '' };
    setBusyId(row.id);
    try {
      if (action === 'approve') {
        if (!choice.facilityId) throw new Error('Choose the facility this account belongs to before approving it.');
        await approvePendingUser(row.id, choice.role, choice.facilityId, 'Approved from the administrator overview.');
        toast.success('Account approved', `${row.fullName} is now ${ROLE_LABELS[choice.role]}. Claims were issued, so they apply on their next token refresh.`);
      } else {
        await services().data.update('users', row.id, { status: 'SUSPENDED', deactivationReason: 'Registration declined by an administrator.' } as never);
        toast.info('Registration declined', `${row.fullName} was suspended and told to contact their facility.`);
      }
      void pending.run();
      void refresh();
    } catch (error) {
      toast.error(error, 'Could not process the request');
    } finally {
      setBusyId(null);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const summary = await seedDemonstrationData({ force: false });
      setSeedResult(summary);
      toast.success('Demonstration data ready', `${summary.mothers} mothers, ${summary.visits} visits and ${summary.alerts} alerts written through the real services.`);
      reload();
    } catch (error) {
      toast.error(error, 'Seeding failed');
    } finally {
      setSeeding(false);
    }
  };

  const pendingRows = pending.data?.rows ?? [];

  const facilityColumns: Column<Facility>[] = [
    {
      key: 'facility',
      header: 'Facility',
      render: (row) => (
        <div>
          <p className="text-[0.88rem] font-semibold text-ink-900">{row.name}</p>
          <p className="caption mt-0.5">
            {row.code} · {row.district}, {row.province}
          </p>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    { key: 'type', header: 'Capacity', render: (row) => (
      <div className="flex flex-wrap gap-1">
        <Badge tone={row.hasMaternityWard ? 'brand' : 'neutral'}>maternity</Badge>
        <Badge tone={row.hasUltrasound ? 'brand' : 'neutral'}>ultrasound</Badge>
        <Badge tone={row.hasLaboratory ? 'brand' : 'neutral'}>lab</Badge>
      </div>
    ), hideBelow: 'sm' },
    { key: 'mothers', header: 'Mothers', render: (row) => <span className="tnum text-[0.9rem] font-semibold">{mothersByFacility.get(row.id) ?? 0}</span>, sortValue: (row) => mothersByFacility.get(row.id) ?? 0 },
    {
      key: 'active',
      header: 'Status',
      render: (row) => <Badge tone={row.active ? 'green' : 'amber'}>{row.active ? 'Active' : 'Inactive'}</Badge>,
      hideBelow: 'md',
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (row) => (
        <Link to={`/admin/facilities?focus=${row.id}`} className="text-[0.78rem] font-semibold text-brand-800 hover:underline">
          Configure
        </Link>
      ),
    },
  ];

  return (
    <AppShell
      title="Administration"
      subtitle={`${stats.data?.totals.facilities ?? 0} facilities · ${stats.data?.scope.facilityName ?? 'platform-wide'} · updated ${stats.data ? relativeTime(new Date().toISOString()) : '—'}`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={stats.loading} onClick={reload} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          <Link to="/admin/users" className="btn btn-sm inline-flex items-center gap-1.5 btn-primary">
            <Users className="size-4" aria-hidden /> User directory
          </Link>
        </>
      }
    >
      {stats.error ? <div className="mb-4"><ErrorState message={stats.error} onRetry={reload} /></div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Mothers in care" value={stats.data?.totals.mothers ?? '—'} hint="Active records across all facilities" loading={stats.loading} icon={<Users className="size-4" aria-hidden />} onClick={() => undefined} />
        <StatCard label="Awaiting approval" value={pendingRows.length} hint={pendingRows.length ? 'Accounts cannot access records until approved' : 'Nobody waiting'} tone={pendingRows.length ? 'amber' : 'green'} loading={pending.loading} />
        <StatCard label="Unresolved alerts" value={stats.data?.totals.openAlerts ?? '—'} hint={`${stats.data?.totals.redAlerts ?? 0} red`} tone={(stats.data?.totals.redAlerts ?? 0) > 0 ? 'red' : 'default'} loading={stats.loading} icon={<AlertTriangle className="size-4" aria-hidden />} />
        <StatCard label="Missed appointments (period)" value={stats.data?.totals.missedAppointments ?? '—'} hint="Counts from appointment rows" tone="default" loading={stats.loading} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card
            title="Access requests"
            description="Self-registered health workers stay locked out until an administrator assigns a role and a facility. Nothing here grants a role to the signed-in account."
            actions={<Link to="/admin/users" className="text-[0.78rem] font-semibold text-brand-800 hover:underline">Open directory</Link>}
            bodyClassName="p-0"
          >
            {pending.loading && pendingRows.length === 0 ? (
              <div className="p-4">
                <LoadingRows rows={2} />
              </div>
            ) : pendingRows.length === 0 ? (
              <EmptyState icon={<Check className="size-5" aria-hidden />} title="No access requests waiting" description="When a health worker registers with a facility email they appear here for approval." />
            ) : (
              <ul className="divide-y divide-ink-100">
                {pendingRows.map((row) => {
                  const choice = decisions[row.id] ?? { role: (row.requestedRole ?? 'COMMUNITY_HEALTH_WORKER') as Role, facilityId: firstFacilityId(facilities.data ?? undefined) };
                  return (
                    <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-3.5">
                      <div className="min-w-0">
                        <p className="text-[0.88rem] font-semibold text-ink-900">{row.fullName}</p>
                        <p className="caption mt-0.5 break-all">
                          {row.email} · requested {row.requestedRole ? ROLE_LABELS[row.requestedRole] : 'a clinical role'} · registered {formatDate(row.createdAt)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <Field label="Grant role">
                          <Select
                            value={choice.role}
                            options={(['FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER'] as Role[]).map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
                            onValueChange={(value) => setDecisions({ ...decisions, [row.id]: { ...choice, role: value as Role } })}
                            className="w-48"
                            placeholder={null}
                          />
                        </Field>
                        <Field label="Facility">
                          <Select
                            value={choice.facilityId}
                            options={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
                            onValueChange={(value) => setDecisions({ ...decisions, [row.id]: { ...choice, facilityId: value } })}
                            className="w-48"
                            placeholder="Select a facility"
                          />
                        </Field>
                        <Button size="sm" loading={busyId === row.id} onClick={() => void approve(row, 'approve')}>
                          Approve
                        </Button>
                        <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => void approve(row, 'decline')} icon={<X className="size-4" aria-hidden />}>
                          Decline
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Facilities" description="Capacity and enrolment per facility. Everything else in the platform scopes to these rows." bodyClassName="p-0" actions={<Link to="/admin/facilities" className="text-[0.78rem] font-semibold text-brand-800 hover:underline">Manage</Link>}>
            {facilities.loading && (facilities.data ?? []).length === 0 ? (
              <div className="p-4">
                <LoadingRows rows={3} />
              </div>
            ) : (facilities.data ?? []).length === 0 ? (
              <EmptyState
                title="No facilities configured"
                description="Add the hospitals and clinics this deployment serves. Midwives and CHWs are then assigned to them, and every list, alert and report is scoped by facility."
                action={
                  <Link to="/admin/facilities" className="btn btn-primary btn-sm">
                    Add the first facility
                  </Link>
                }
              />
            ) : (
              <DataTable rows={facilities.data ?? []} columns={facilityColumns} rowKey={(row) => row.id} dense pageSize={10} caption="Facilities" />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Platform activity" description={`Visits recorded per month over ${stats.data ? 'six' : '—'} months`}>
            {stats.loading && !stats.data ? (
              <LoadingRows rows={3} />
            ) : stats.data ? (
              <div className="space-y-4">
                <BarChart data={stats.data.visitsByMonth.map((point) => ({ label: point.label, value: point.value }))} height={150} />
                <DonutChart
                  size={132}
                  data={stats.data.riskMix.map((row) => ({
                    label: row.level,
                    value: row.count,
                    color: row.level === 'RED' ? '#c0392f' : row.level === 'AMBER' ? '#b4761c' : '#1f8f66',
                  }))}
                  centerLabel="Risk mix"
                  centerValue={stats.data.totals.activePregnancies}
                />
                <KeyValue
                  columns={2}
                  dense
                  items={[
                    { label: 'Attendance rate', value: `${stats.data.attendance.ratePct}%`, tone: 'strong' },
                    { label: 'Deliveries this month', value: stats.data.totals.deliveriesThisMonth },
                    { label: 'Health workers', value: stats.data.totals.healthWorkers },
                    { label: 'Reports generated', value: stats.data.totals.reportsGenerated },
                  ]}
                />
              </div>
            ) : null}
          </Card>

          <Card title="Integrations" description="Configuration only — no secret values are read by the browser.">
            <ul className="space-y-2.5">
              <IntegrationRow label="Data provider" ok={integrations.provider === 'firebase'} detail={integrations.provider === 'firebase' ? 'Cloud Firestore with security rules' : 'Device storage (IndexedDB) on this browser'} />
              <IntegrationRow label="Firebase project" ok={integrations.firebase.configured} detail={integrations.firebase.projectId ?? 'VITE_FIREBASE_* not set'} />
              <IntegrationRow label="Cloudinary media" ok={integrations.cloudinary.configured} detail={integrations.cloudinary.cloudName ?? 'VITE_CLOUDINARY_CLOUD_NAME not set'} />
              <IntegrationRow label="Push messaging" ok={integrations.push.configured} detail={integrations.push.configured ? 'VAPID key present' : 'VITE_FIREBASE_VAPID_KEY not set'} />
              <IntegrationRow label="Signed uploads API" ok={integrations.provider !== 'local'} detail="The Cloudinary API secret lives only on the server" />
            </ul>
            {providerKind === 'local' ? (
              <div className="mt-3 space-y-2">
                <NoticeState tone="info" title="Device storage mode" compact>
                  The full stack — policy, alert engine, referral workflow, reports — runs against IndexedDB so the platform can be exercised without cloud
                  credentials. Add the Firebase values to <code className="rounded bg-white/70 px-1">web/.env.local</code> and restart to switch the data layer.
                </NoticeState>
                <Button size="sm" variant="secondary" loading={seeding} onClick={() => void seed()} icon={<Database className="size-4" aria-hidden />}>
                  Seed demonstration records
                </Button>
                {seedResult ? (
                  <p className="caption">
                    Seeded {seedResult.mothers} mothers, {seedResult.pregnancies} pregnancies, {seedResult.visits} visits, {seedResult.alerts} alerts and{' '}
                    {seedResult.appointments} appointments across {seedResult.facilities} facilities. Sign in with any account below.
                  </p>
                ) : null}
                <ul className="rounded-lg border border-ink-200 bg-ink-50 p-2.5">
                  {DEMO_ACCOUNTS.map((account) => (
                    <li key={account.email} className="flex items-center justify-between gap-2 py-0.5 text-[0.78rem]">
                      <span className="truncate text-ink-700">{account.email}</span>
                      <Badge tone="neutral">{ROLE_LABELS[account.role]}</Badge>
                    </li>
                  ))}
                </ul>
                <p className="caption">
                  These are demonstration accounts for this device only, with the shared password documented in <code>web/.env.example</code>. Delete the
                  IndexedDB database to reset.
                </p>
              </div>
            ) : null}
          </Card>

          <Card title="Last platform activity" description="Audit entries are append-only; opening the log shows the full history." actions={<Link to="/admin/audit" className="text-[0.78rem] font-semibold text-brand-800 hover:underline">Full log</Link>} bodyClassName="p-0">
            {(audit.data?.rows ?? []).length === 0 ? (
              <div className="p-4">
                <EmptyState icon={<Activity className="size-5" aria-hidden />} title="No audit entries yet" description="Sign-ins, record writes, privilege changes and document access all land here." />
              </div>
            ) : (
              <ul className="divide-y divide-ink-100">
                {(audit.data?.rows ?? []).map((entry: { id: string; action: string; actorName: string; targetLabel?: string | null; targetType: string; createdAt: string }) => (
                  <li key={entry.id} className="flex items-start justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="text-[0.84rem] font-medium text-ink-900">{entry.action.replace(/[._]/g, ' ')}</p>
                      <p className="caption mt-0.5 truncate">
                        {entry.actorName} · {entry.targetLabel ?? entry.targetType}
                      </p>
                    </div>
                    <span className="micro shrink-0">{relativeTime(entry.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Configuration shortcuts">
            <div className="flex flex-wrap gap-2">
              <Link to="/admin/settings" className="btn btn-secondary btn-sm">
                <Settings2 className="size-4" aria-hidden /> System settings
              </Link>
              <Link to="/admin/settings?tab=rules" className="btn btn-secondary btn-sm">
                <ShieldAlert className="size-4" aria-hidden /> Clinical rules
              </Link>
              <Link to="/admin/users?status=PENDING_APPROVAL" className="btn btn-secondary btn-sm">
                <UserPlus className="size-4" aria-hidden /> Approvals
              </Link>
              <Link to="/admin/reports" className="btn btn-secondary btn-sm">
                <Boxes className="size-4" aria-hidden /> Reports
              </Link>
              <Link to="/auth/reset-password" className="btn btn-quiet btn-sm">
                <KeyRound className="size-4" aria-hidden /> Reset my password
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function IntegrationRow({ label, ok, detail }: { label: string; ok: boolean; detail: string }) {
  return (
    <li className="flex items-start gap-2.5">
      <span className={`mt-1 size-2 shrink-0 rounded-full ${ok ? 'bg-[var(--color-risk-green)]' : 'bg-[var(--color-risk-amber)]'}`} aria-hidden />
      <div className="min-w-0">
        <p className="text-[0.84rem] font-semibold text-ink-900">{label}</p>
        <p className="caption mt-0.5 break-all">{detail}</p>
      </div>
    </li>
  );
}

/** Facility to pre-select for an approval: the first configured one. */
function firstFacilityId(facilities?: Facility[]): string {
  return facilities?.[0]?.id ?? '';
}

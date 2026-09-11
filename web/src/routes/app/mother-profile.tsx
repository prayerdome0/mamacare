import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarPlus,
  FileUp,
  Phone,
  Plus,
  RefreshCw,
  Send,
  ShieldAlert,
  Stethoscope,
} from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows, ProgressBar, RiskBadge, StatusBadge } from '@/components/ui/display';
import { Tabs, type TabItem } from '@/components/ui/tabs';
import { useAsync } from '@/hooks';
import { services } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { formatDate, humanize } from '@/lib/utils';
import { gestationalAge, shortGestationalAge, trimesterLabel } from '@/lib/obstetrics';
import type { RiskLevel } from '@/types/domain';
import type { MotherChart } from '@/services/data-layer';
import { ClinicalTabs } from '@/routes/app/mother-tabs-clinical';
import { CareTabs } from '@/routes/app/mother-tabs-care';
import { VisitDialog } from '@/routes/app/visit-dialog';
import { AppointmentDialog } from '@/routes/app/appointment-dialog';
import { AlertDialog } from '@/routes/app/alert-dialog';
import { ReferralDialog } from '@/routes/app/referral-dialog';

const TABS = [
  'overview',
  'demographics',
  'pregnancy',
  'visits',
  'growth',
  'appointments',
  'alerts',
  'referrals',
  'documents',
  'reports',
] as const;
type TabId = (typeof TABS)[number];

/**
 * The mother profile. One read of the aggregated chart (mother + pregnancy +
 * visits + appointments + alerts + referrals + documents + reports), ten tabs
 * over it, and the actions the role is allowed to take. Nothing here decides
 * access: `motherChart()` only returns rows the actor's policy permits, and the
 * provider enforces the same rule on every write.
 */
export default function MotherProfilePage() {
  const { link: navLink } = useNavScope();
  const { motherId = '' } = useParams<{ motherId: string }>();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { actor, permissions } = useSession();
  const [dialog, setDialog] = useState<null | 'visit' | 'appointment' | 'alert' | 'referral'>(null);

  const chart = useAsync(() => services().data.motherChart(motherId), { deps: [motherId] });
  const data = chart.data;

  const tab: TabId = useMemo(() => {
    const requested = params.get('tab') as TabId | null;
    return requested && TABS.includes(requested) ? requested : 'overview';
  }, [params]);

  const setTab = (next: string) => {
    const updated = new URLSearchParams(params);
    updated.set('tab', next);
    setParams(updated, { replace: true });
  };

  if (chart.loading && !data) {
    return (
      <AppShell title="Mother profile">
        <Card>
          <LoadingRows rows={6} />
        </Card>
      </AppShell>
    );
  }

  if (chart.error || !data) {
    return (
      <AppShell title="Mother profile">
        <ErrorState
          title="This mother’s record could not be opened"
          message={chart.error ?? 'The record is not available to your account.'}
          onRetry={() => void chart.run()}
        />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate(navLink('/mothers'))} icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back to the roster
          </Button>
        </div>
      </AppShell>
    );
  }

  const { mother, activePregnancy } = data;
  const ga = gestationalAge({
    lmpDate: activePregnancy?.lmpDate ?? null,
    eddDate: activePregnancy?.eddDate ?? mother.eddSnapshot ?? null,
    documented: activePregnancy?.documentedGestationalAge ?? null,
  });
  const risk: RiskLevel = mother.riskLevel ?? activePregnancy?.riskLevel ?? 'GREEN';

  const items: TabItem[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'demographics', label: 'Identity & contact' },
    { id: 'pregnancy', label: 'Pregnancy & history' },
    { id: 'visits', label: 'ANC visits', count: data.visits.length },
    { id: 'growth', label: 'Vitals & growth' },
    { id: 'appointments', label: 'Appointments', count: data.appointments.filter((row) => row.status === 'SCHEDULED' || row.status === 'CONFIRMED').length },
    { id: 'alerts', label: 'Alerts', count: data.alerts.filter((row) => row.status !== 'RESOLVED').length, tone: data.alerts.some((row) => row.level === 'RED' && row.status !== 'RESOLVED') ? 'red' : 'default' },
    { id: 'referrals', label: 'Referrals', count: data.referrals.filter((row) => row.status !== 'CLOSED').length },
    { id: 'documents', label: 'Documents', count: data.documents.length },
    { id: 'reports', label: 'Reports', count: data.reports.length },
  ];

  return (
    <AppShell
      title={<span className="sr-only">{mother.fullName}</span>}
      actions={
        <Button variant="secondary" size="sm" onClick={() => void chart.run()} loading={chart.loading} icon={<RefreshCw className="size-4" aria-hidden />}>
          Reload record
        </Button>
      }
    >
      <Link
        to={navLink("/mothers")}
        className="mb-3 inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-800 hover:underline"
      >
        <ArrowLeft className="size-3.5" aria-hidden /> Mother roster
      </Link>

      <Card className="mb-4" bodyClassName="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="h1">{mother.fullName}</h1>
              <RiskBadge level={risk ?? 'GREEN'} />
              <StatusBadge status={mother.status} />
            </div>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.86rem] text-ink-600">
              <span className="rounded-md bg-ink-100 px-1.5 py-0.5 font-semibold tracking-wide text-ink-800 tnum">{mother.patientId}</span>
              <span aria-hidden>·</span>
              <span>{mother.ageYears ? `${mother.ageYears} years` : 'age not recorded'}</span>
              <span aria-hidden>·</span>
              <span>{mother.preferredLanguage}</span>
              {mother.phone ? (
                <>
                  <span aria-hidden>·</span>
                  <a href={`tel:${mother.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 font-semibold text-brand-800 hover:underline">
                    <Phone className="size-3.5" aria-hidden /> {mother.phone}
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {permissions.canRecordAncVisit ? (
              <Button size="sm" onClick={() => setDialog('visit')} icon={<Stethoscope className="size-4" aria-hidden />}>
                Record ANC visit
              </Button>
            ) : null}
            {permissions.canScheduleAppointment ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('appointment')} icon={<CalendarPlus className="size-4" aria-hidden />}>
                Book appointment
              </Button>
            ) : null}
            {permissions.canCreateAlert ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('alert')} icon={<ShieldAlert className="size-4" aria-hidden />}>
                Raise alert
              </Button>
            ) : null}
            {permissions.canCreateReferral ? (
              <Button size="sm" variant="secondary" onClick={() => setDialog('referral')} icon={<Send className="size-4" aria-hidden />}>
                Refer
              </Button>
            ) : null}
            {permissions.canUploadDocuments ? (
              <Button size="sm" variant="secondary" onClick={() => setTab('documents')} icon={<FileUp className="size-4" aria-hidden />}>
                Attach document
              </Button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
              <p className="micro">Gestational age</p>
              <p className="text-[0.82rem] font-semibold text-ink-800">
                {ga.valid ? `${shortGestationalAge(ga)} · ${trimesterLabel(ga)}` : 'Dating not recorded'}
              </p>
            </div>
            <ProgressBar value={ga.progressPct} label="Progress to 40 weeks" tone={risk === 'RED' ? 'red' : risk === 'AMBER' ? 'amber' : 'brand'} />
            <p className="caption mt-1.5">
              {activePregnancy
                ? `EDD ${formatDate(activePregnancy.eddDate)} · dated by ${humanize(activePregnancy.datingMethod)}${
                    activePregnancy.datingOverrideEdd ? ' (overridden)' : ''
                  }`
                : 'No active pregnancy — this record is closed or awaiting a new registration.'}
            </p>
          </div>
          <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="micro mb-1">Care team</p>
            <p className="text-[0.86rem] font-semibold text-ink-900">{data.mother.assignedChwUserId ? 'Community health worker assigned' : 'No CHW assigned yet'}</p>
            <p className="caption mt-1">{humanize(mother.status)} · {data.visits.length} visit{data.visits.length === 1 ? '' : 's'} recorded</p>
            {!mother.assignedChwUserId && actor?.role === 'ADMIN' ? (
              <Link to="/admin/users" className="mt-1.5 inline-block text-[0.78rem] font-semibold text-brand-800 hover:underline">
                Assign in the user directory
              </Link>
            ) : null}
          </div>
        </div>
      </Card>

      <div className="mb-4">
        <Tabs items={items} value={tab} onChange={setTab} ariaLabel="Mother record sections" />
      </div>

      <ClinicalTabs tab={tab} chart={data} onChanged={() => void chart.run()} onOpenTab={setTab} />
      <CareTabs tab={tab} chart={data} onChanged={() => void chart.run()} onRequestReferral={() => setDialog('referral')} />

      <VisitDialog
        open={dialog === 'visit'}
        onClose={() => setDialog(null)}
        mother={mother}
        pregnancy={activePregnancy}
        onSaved={() => {
          setDialog(null);
          setTab('visits');
          void chart.run();
        }}
      />
      <AppointmentDialog
        open={dialog === 'appointment'}
        onClose={() => setDialog(null)}
        motherId={mother.id}
        onSaved={() => {
          setDialog(null);
          setTab('appointments');
          void chart.run();
        }}
      />
      <AlertDialog
        open={dialog === 'alert'}
        onClose={() => setDialog(null)}
        motherId={mother.id}
        facilityId={mother.careFacilityId ?? mother.registrationFacilityId}
        onSaved={() => {
          setDialog(null);
          setTab('alerts');
          void chart.run();
        }}
      />
      <ReferralDialog
        open={dialog === 'referral'}
        onClose={() => setDialog(null)}
        mother={mother}
        onSaved={() => {
          setDialog(null);
          setTab('referrals');
          void chart.run();
        }}
      />

      {!activePregnancy ? (
        <div className="mt-4">
          <EmptyState
            icon={<Plus className="size-5" aria-hidden />}
            title="No open pregnancy on this record"
            description="Clinical actions are disabled until a pregnancy is registered. The historical visits, alerts and documents below stay readable."
            action={
              permissions.canRegisterMother ? (
                <Link to={navLink("/mothers")} className="btn btn-secondary btn-sm">
                  Back to the roster
                </Link>
              ) : null
            }
          />
        </div>
      ) : null}
    </AppShell>
  );
}

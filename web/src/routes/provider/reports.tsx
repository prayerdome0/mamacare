/**
 * Provider reports.
 *
 * A caseload summary a clinician can act on and hand over: who is in which
 * trimester, who has not been seen, whose baby has a dose overdue. Everything is
 * computed from records this provider is allowed to read, at the moment the page
 * loads — there is no background aggregation and no cross-provider data.
 *
 * The numbers describe the caseload, not a population. That distinction is stated
 * on the page because a report that looks authoritative gets quoted.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Baby as BabyIcon,
  CalendarDays,
  ClipboardList,
  Download,
  Stethoscope,
  Syringe,
  Users,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import {
  appointmentRepo,
  babyRepo,
  careLinkRepo,
  immunizationRepo,
  observationRepo,
  pregnancyRepo,
} from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { logAudit } from '@/services/audit';
import { daysBetween, downloadBlob, formatDate, pct, toCsv, toIsoDate } from '@/lib/utils';
import { formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { APPOINTMENT_KIND_LABELS, type Appointment, type Baby, type Pregnancy } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

interface CohortRow {
  uid: string;
  name: string;
  pregnancy: Pregnancy | null;
  weeks: number | null;
  trimester: 1 | 2 | 3 | null;
  status: Pregnancy['status'] | null;
  lastSeen: string | null;
  nextVisit: string | null;
  babies: Baby[];
  overdueDoses: number;
}

export default function ProviderReports() {
  const { actor } = useSession();
  const toast = useToast();
  const uid = actor?.uid ?? '';
  const [view, setView] = useState<'cohort' | 'appointments' | 'immunization'>('cohort');

  const { data: links, loading } = useAsync(() => careLinkRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });
  const active = useMemo(() => (links ?? []).filter((link) => link.status === 'active'), [links]);
  const { data: appointments } = useAsync(() => appointmentRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });

  const { data: cohort, loading: cohortLoading } = useAsync(async (): Promise<CohortRow[]> => {
    const rows: CohortRow[] = [];
    const all = appointments ?? [];
    for (const link of active) {
      const pregnancy = await pregnancyRepo.current(link.motherUserId).catch(() => null);
      const ga = pregnancy ? gestationalAge({ lmpDate: pregnancy.lmpDate, eddDate: pregnancy.eddDate }) : null;
      const mine = all.filter((appointment) => appointment.userId === link.motherUserId);
      const past = mine.filter((appointment) => appointment.date < toIsoDate(new Date()));
      const future = mine.filter((appointment) => appointment.date >= toIsoDate(new Date()));
      const babies = await babyRepo.list(link.motherUserId).catch(() => [] as Baby[]);
      let overdueDoses = 0;
      for (const baby of babies) {
        const doses = await immunizationRepo.list(baby.id).catch(() => []);
        overdueDoses += doses.filter((dose) => dose.status === 'upcoming' && dose.scheduledDate < toIsoDate(new Date())).length;
      }
      rows.push({
        uid: link.motherUserId,
        name: link.motherName,
        pregnancy,
        weeks: ga && ga.valid ? ga.weeks : null,
        trimester: ga && ga.valid ? (ga.trimester as 1 | 2 | 3) : null,
        status: pregnancy?.status ?? null,
        lastSeen: past.sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? null,
        nextVisit: future.sort((a, b) => a.date.localeCompare(b.date))[0]?.date ?? null,
        babies,
        overdueDoses,
      });
    }
    return rows;
  }, { deps: [active, appointments], immediate: active.length > 0 });

  const rows = useMemo<CohortRow[]>(() => cohort ?? [], [cohort]);
  const allAppointments = useMemo<Appointment[]>(() => appointments ?? [], [appointments]);

  const summary = useMemo(() => {
    const pregnant = rows.filter((row) => row.status === 'active' && row.weeks !== null);
    const byTrimester = { first: 0, second: 0, third: 0 };
    for (const row of pregnant) {
      if (row.trimester === 1) byTrimester.first += 1;
      else if (row.trimester === 2) byTrimester.second += 1;
      else byTrimester.third += 1;
    }
    const postnatal = rows.filter((row) => row.status === 'delivered');
    const postDates = pregnant.filter((row) => (row.weeks ?? 0) >= 40);
    const notSeenIn30 = rows.filter((row) => !row.lastSeen || daysBetween(new Date(row.lastSeen), new Date()) > 30);
    const seenIn30 = rows.length - notSeenIn30.length;
    const totalBabies = rows.reduce((count, row) => count + row.babies.length, 0);
    const overdueDoses = rows.reduce((count, row) => count + row.overdueDoses, 0);
    const antenatalVisits = allAppointments.filter((appointment) => appointment.kind === 'antenatal');
    return {
      patients: rows.length,
      pregnant: pregnant.length,
      byTrimester,
      postnatal: postnatal.length,
      postDates,
      notSeenIn30,
      seenIn30,
      coverage: pct(seenIn30, rows.length),
      totalBabies,
      overdueDoses,
      antenatalCompleted: antenatalVisits.filter((appointment) => appointment.status === 'completed').length,
      antenatalMissed: antenatalVisits.filter((appointment) => appointment.status === 'missed').length,
    };
  }, [rows, allAppointments]);

  useEffect(() => {
    document.title = 'Reports · Mama Care';
  }, []);

  const exportCohort = async (): Promise<void> => {
    const csv = toCsv(
      ['Patient', 'Pregnancy status', 'Weeks', 'Trimester', 'Last seen', 'Next visit', 'Babies', 'Overdue doses'],
      rows.map((row) => [
        row.name,
        row.status ?? 'none',
        row.weeks ?? '',
        row.trimester ?? '',
        row.lastSeen ?? '',
        row.nextVisit ?? '',
        row.babies.length,
        row.overdueDoses,
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-cohort-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'reports', uid, `Cohort summary exported (${rows.length} patients)`);
    toast.success('Export ready', 'The CSV contains names because this is your own caseload. Handle it like any clinical record.');
  };

  const exportAppointments = async (): Promise<void> => {
    const csv = toCsv(
      ['Date', 'Time', 'Patient', 'Kind', 'Purpose', 'Facility', 'Status', 'Notes'],
      allAppointments.map((appointment) => [
        appointment.date,
        appointment.time ?? '',
        rows.find((row) => row.uid === appointment.userId)?.name ?? appointment.userId,
        APPOINTMENT_KIND_LABELS[appointment.kind],
        appointment.purpose,
        appointment.facilityName,
        appointment.status,
        appointment.clinicianNotes ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-appointments-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'appointments', uid, `Appointment list exported (${allAppointments.length} rows)`);
    toast.success('Export ready');
  };

  if (loading || cohortLoading) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="Caseload reports" />
        <LoadingRows rows={5} />
      </StaffShell>
    );
  }

  if (rows.length === 0) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="Caseload reports" description="Aggregates across the mothers who have shared their care with you." />
        <EmptyState
          icon={<ClipboardList className="size-6" aria-hidden />}
          title="No linked patients to report on"
          description="Reports are built from care links. Once a mother links you, her pregnancy stage, visit history and her baby's immunization status appear here — and nothing else does."
        />
      </StaffShell>
    );
  }

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="Caseload reports"
        description={`Generated ${formatDate(new Date(), 'long')} from ${rows.length} linked patients and ${allAppointments.length} appointments.`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void exportAppointments()} icon={<CalendarDays className="size-4" aria-hidden />}>
              Export appointments
            </Button>
            <Button variant="primary" size="sm" onClick={() => void exportCohort()} icon={<Download className="size-4" aria-hidden />}>
              Export cohort CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Patients in care" value={summary.patients} icon={<Users className="size-4" aria-hidden />} />
        <StatCard label="Currently pregnant" value={summary.pregnant} icon={<Stethoscope className="size-4" aria-hidden />} tone="brand" />
        <StatCard label="Postnatal" value={summary.postnatal} icon={<BabyIcon className="size-4" aria-hidden />} tone="green" />
        <StatCard
          label="Seen in the last 30 days"
          value={`${summary.coverage}%`}
          icon={<Activity className="size-4" aria-hidden />}
          tone={summary.coverage >= 70 ? 'green' : summary.coverage >= 40 ? 'amber' : 'red'}
          hint={`${summary.seenIn30} of ${summary.patients}`}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Distribution" title="Pregnancies by trimester" />
          <ul className="mt-3 space-y-2">
            {[
              { label: 'First trimester (up to 13 weeks)', value: summary.byTrimester.first, tone: 'blue' as const },
              { label: 'Second trimester (14–27 weeks)', value: summary.byTrimester.second, tone: 'brand' as const },
              { label: 'Third trimester (28 weeks onwards)', value: summary.byTrimester.third, tone: 'purple' as const },
            ].map((item) => (
              <li key={item.label} className="flex items-center justify-between gap-3">
                <span className="text-sm text-ink-700">{item.label}</span>
                <span className="flex items-center gap-2">
                  <span className="h-2 w-24 overflow-hidden rounded-full bg-ink-100">
                    <span
                      className="block h-full rounded-full bg-brand-600"
                      style={{ width: `${pct(item.value, Math.max(summary.pregnant, 1))}%` }}
                    />
                  </span>
                  <Badge tone={item.tone}>{item.value}</Badge>
                </span>
              </li>
            ))}
          </ul>
          {summary.postDates.length > 0 ? (
            <p className="alert alert-warn mt-3">
              {summary.postDates.length} {summary.postDates.length === 1 ? 'patient is' : 'patients are'} at or past the
              estimated due date: {summary.postDates.map((row) => row.name).join(', ')}.
            </p>
          ) : null}
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Follow-up" title="Antenatal visits" />
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-ink-200 px-3 py-2">
              <p className="micro">Completed</p>
              <p className="display-2 tnum text-[var(--color-risk-green)]">{summary.antenatalCompleted}</p>
            </div>
            <div className="rounded-lg border border-ink-200 px-3 py-2">
              <p className="micro">Missed</p>
              <p className="display-2 tnum text-[var(--color-risk-red)]">{summary.antenatalMissed}</p>
            </div>
            <div className="rounded-lg border border-ink-200 px-3 py-2">
              <p className="micro">Overdue for review</p>
              <p className="display-2 tnum text-[var(--color-risk-amber)]">{summary.notSeenIn30.length}</p>
            </div>
          </div>
          <p className="mt-3 text-sm text-ink-600">
            “Overdue for review” means no appointment of any kind in the last 30 days. It is a prompt to contact the patient,
            not a clinical judgement about her care.
          </p>
        </Card>
      </div>

      <Card className="card-pad mt-4">
        <SegmentedControl
          value={view}
          onChange={setView}
          ariaLabel="Report view"
          options={[
            { value: 'cohort', label: 'Cohort', count: rows.length },
            { value: 'appointments', label: 'Appointments', count: allAppointments.length },
            { value: 'immunization', label: 'Immunization', count: summary.totalBabies },
          ]}
        />

        {view === 'cohort' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="table-base">
              <caption className="caption">Every patient with an active care link to this provider</caption>
              <thead>
                <tr>
                  <th className="table-th">Patient</th>
                  <th className="table-th">Stage</th>
                  <th className="table-th">Gestational age</th>
                  <th className="table-th">Last seen</th>
                  <th className="table-th">Next visit</th>
                  <th className="table-th">Flag</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const gap = row.lastSeen ? daysBetween(new Date(row.lastSeen), new Date()) : null;
                  return (
                    <tr key={row.uid} className="table-row">
                      <td className="table-td font-medium text-ink-800">{row.name}</td>
                      <td className="table-td">{row.status === 'active' ? 'Pregnant' : row.status === 'delivered' ? 'Postnatal' : 'No record'}</td>
                      <td className="table-td tnum">{row.weeks !== null ? formatGestationalAge({ weeks: row.weeks, days: 0, valid: true }) : '—'}</td>
                      <td className="table-td">{row.lastSeen ? formatDate(row.lastSeen, 'day') : 'Never'}</td>
                      <td className="table-td">{row.nextVisit ? formatDate(row.nextVisit, 'day') : '—'}</td>
                      <td className="table-td">
                        {(row.weeks ?? 0) >= 40 ? (
                          <Badge tone="red">Post-dates</Badge>
                        ) : gap !== null && gap > 30 ? (
                          <Badge tone="amber">{gap} days</Badge>
                        ) : row.overdueDoses > 0 ? (
                          <Badge tone="amber">{row.overdueDoses} doses due</Badge>
                        ) : (
                          <Badge tone="green">Up to date</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {view === 'appointments' ? (
          <div className="mt-4 overflow-x-auto">
            <table className="table-base">
              <caption className="caption">All appointments across the caseload, newest first</caption>
              <thead>
                <tr>
                  <th className="table-th">Date</th>
                  <th className="table-th">Patient</th>
                  <th className="table-th">Visit</th>
                  <th className="table-th">Facility</th>
                  <th className="table-th">Status</th>
                </tr>
              </thead>
              <tbody>
                {allAppointments
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((appointment) => (
                    <tr key={appointment.id} className="table-row">
                      <td className="table-td tnum">{formatDate(appointment.date, 'day')}</td>
                      <td className="table-td">{rows.find((row) => row.uid === appointment.userId)?.name ?? '—'}</td>
                      <td className="table-td">
                        {APPOINTMENT_KIND_LABELS[appointment.kind]}
                        <span className="block text-xs text-ink-500">{appointment.purpose}</span>
                      </td>
                      <td className="table-td text-sm text-ink-600">{appointment.facilityName}</td>
                      <td className="table-td">
                        <Badge tone={appointment.status === 'completed' ? 'green' : appointment.status === 'missed' ? 'red' : 'neutral'}>
                          {appointment.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {view === 'immunization' ? (
          <div className="mt-4 space-y-3">
            {rows.filter((row) => row.babies.length > 0).length === 0 ? (
              <p className="text-sm text-ink-600">No babies are recorded for patients in your care yet.</p>
            ) : (
              rows
                .filter((row) => row.babies.length > 0)
                .map((row) => (
                  <div key={row.uid} className="rounded-lg border border-ink-200 p-3">
                    <h4 className="card-title">{row.name}</h4>
                    <ul className="mt-2 space-y-1.5">
                      {row.babies.map((baby) => (
                        <li key={baby.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span className="text-ink-700">
                            {baby.name} · born {formatDate(baby.dateOfBirth, 'day')}
                          </span>
                          {row.overdueDoses > 0 ? <Badge tone="red">{row.overdueDoses} overdue</Badge> : <Badge tone="green">Schedule on track</Badge>}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
            )}
            <p className="flex items-start gap-2 text-xs text-ink-500">
              <Syringe className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Doses are marked as given by the mother from her own app after a clinic visit. This report shows what she has
              recorded, which is a reminder aid — the child health card remains the official record.
            </p>
          </div>
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Honesty" title="What this report is not" />
          <ul className="checklist mt-2 text-sm">
            <li>Not a population statistic — it covers only patients who linked their care to you.</li>
            <li>Not a clinical audit — it cannot see facility records, lab systems or paper cards.</li>
            <li>Not a diagnostic tool — flags are prompts to contact a patient, nothing more.</li>
            <li>Not anonymous — the CSV contains names, so treat it as a clinical record wherever it goes.</li>
          </ul>
        </Card>
        <Card className="card-pad">
          <SectionHeading eyebrow="Handover" title="Using this in practice" />
          <p className="mt-2 text-sm text-ink-600">
            Export the cohort CSV at the start of a clinic day and work down the flags: post-dates first, then anyone not seen
            in over a month, then overdue infant doses. The appointment export is useful for follow-up calls because it carries
            the note you wrote at the visit.
          </p>
          <p className="mt-2 text-sm text-ink-600">
            Every export is written to the audit log with your name, so a patient can ask what was taken out of the system and
            when.
          </p>
          <div className="mt-3">
            <Button variant="secondary" size="sm" onClick={() => void exportCohort()} icon={<Download className="size-4" aria-hidden />}>
              Export cohort CSV
            </Button>
          </div>
        </Card>
      </div>

      <ObservationSummaryCard />
    </StaffShell>
  );
}

/**
 * Aggregate of the measurements recorded across the caseload. Values are shown as
 * recorded, with no interpretation — the point is to spot a patient whose readings
 * have stopped being logged, not to screen anyone.
 */
function ObservationSummaryCard() {
  const { actor } = useSession();
  const uid = actor?.uid ?? '';
  const { data: links } = useAsync(() => careLinkRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });
  const [counts, setCounts] = useState<{ kind: string; total: number; latest: string | null }[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const active = (links ?? []).filter((link) => link.status === 'active');
      const all = await Promise.all(active.map((link) => observationRepo.list(link.motherUserId).catch(() => [])));
      const flat = all.flat();
      const byKind = new Map<string, { total: number; latest: string | null }>();
      for (const observation of flat) {
        const entry = byKind.get(observation.kind) ?? { total: 0, latest: null };
        entry.total += 1;
        if (!entry.latest || observation.createdAt > entry.latest) entry.latest = observation.createdAt;
        byKind.set(observation.kind, entry);
      }
      if (!cancelled) {
        setCounts(
          Array.from(byKind.entries())
            .map(([kind, value]) => ({ kind, ...value }))
            .sort((a, b) => b.total - a.total),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [links]);

  if (counts.length === 0) return null;

  return (
    <Card className="card-pad mt-4">
      <SectionHeading eyebrow="Recorded across the caseload" title="Observations by type" description="Self-recorded and provider-recorded measurements, counted only — never interpreted by Mama Care." />
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {counts.map((item) => (
          <li key={item.kind} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2">
            <span className="text-sm text-ink-700">{item.kind}</span>
            <span className="flex items-center gap-2">
              <span className="text-xs text-ink-500">{item.latest ? formatDate(item.latest, 'day') : '—'}</span>
              <Badge tone="neutral">{item.total}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

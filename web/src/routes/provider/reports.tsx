/**
 * Provider / Nurse Reports Portal.
 *
 * Two professional capabilities:
 *  1. Clinical Healthcare Reports:
 *     - Generate official healthcare reports (Antenatal, Clinical Visit, Postnatal, Immunization, Referral)
 *     - Real PDF generation, preview modal, print and download (MamaCare_Report_2026-XXXXX.pdf)
 *     - Search by patient name, patient ID, report number, facility, report type, date, status
 *  2. Caseload & Cohort Summary:
 *     - Real-time caseload aggregates (trimesters, missed visits, immunization follow-ups)
 *     - Cohort CSV export and Appointments CSV export
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Baby as BabyIcon,
  CalendarDays,
  ClipboardList,
  Download,
  Eye,
  FileCheck,
  FilePlus,
  FileText,
  HeartPulse,
  Printer,
  RefreshCw,
  Search,
  Stethoscope,
  Syringe,
  Users,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import {
  appointmentRepo,
  babyRepo,
  careLinkRepo,
  healthcareReportRepo,
  immunizationRepo,
  observationRepo,
  pregnancyRepo,
} from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { logAudit } from '@/services/audit';
import { daysBetween, downloadBlob, formatDate, pct, toCsv, toIsoDate } from '@/lib/utils';
import { formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { downloadHealthcareReportPdf, printHealthcareReportPdf } from '@/lib/pdf-report';
import {
  APPOINTMENT_KIND_LABELS,
  HEALTHCARE_REPORT_TYPE_LABELS,
  type Appointment,
  type Baby,
  type HealthcareReport,
  type HealthcareReportType,
  type Pregnancy,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { GenerateReportModal } from '@/components/reports/generate-report-modal';
import { ReportPreviewModal } from '@/components/reports/report-preview-modal';

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

  const [topTab, setTopTab] = useState<'clinical' | 'caseload'>('clinical');
  const [view, setView] = useState<'cohort' | 'appointments' | 'immunization'>('cohort');

  // Clinical reports state
  const [search, setSearch] = useState('');
  const [reportTypeFilter, setReportTypeFilter] = useState<string>('ALL');
  const [generateOpen, setGenerateOpen] = useState(false);
  const [previewReport, setPreviewReport] = useState<HealthcareReport | null>(null);

  const { data: clinicalReports, loading: reportsLoading, run: reloadReports } = useAsync(
    () => healthcareReportRepo.forProvider(),
    { deps: [uid], immediate: Boolean(uid) },
  );

  const { data: links, loading: linksLoading } = useAsync(() => careLinkRepo.forProvider(), {
    deps: [uid],
    immediate: Boolean(uid),
  });

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
  const allReports = useMemo<HealthcareReport[]>(() => clinicalReports ?? [], [clinicalReports]);

  // Patients list for the generator modal
  const patientOptions = useMemo(
    () =>
      active.map((l) => ({
        uid: l.motherUserId,
        name: l.motherName,
        facilityId: l.facilityId,
        facilityName: l.facilityName,
      })),
    [active],
  );

  // Filtered clinical reports
  const filteredReports = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allReports.filter((r) => {
      if (reportTypeFilter !== 'ALL' && r.reportType !== reportTypeFilter) return false;
      if (!term) return true;
      return (
        r.patientName.toLowerCase().includes(term) ||
        r.patientId.toLowerCase().includes(term) ||
        r.reportNumber.toLowerCase().includes(term) ||
        r.facilityName.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term)
      );
    });
  }, [allReports, search, reportTypeFilter]);

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
    document.title = 'Clinical Reports · Mama Care';
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
    toast.success('Export ready', 'Cohort CSV generated from active clinical caseload.');
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

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="Clinical Reports & Caseload"
        description="Generate official clinical reports, download branded PDFs, and review caseload statistics."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void reloadReports()}
              icon={<RefreshCw className="size-4" aria-hidden />}
            >
              Refresh
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setGenerateOpen(true)}
              icon={<FilePlus className="size-4" aria-hidden />}
            >
              Generate New Report
            </Button>
          </div>
        }
      />

      {/* Main Tabs */}
      <Card className="card-pad mb-5">
        <SegmentedControl
          value={topTab}
          onChange={setTopTab}
          ariaLabel="Report View Selection"
          options={[
            {
              value: 'clinical',
              label: 'Healthcare Clinical Reports',
              count: allReports.length,
            },
            {
              value: 'caseload',
              label: 'Caseload & Cohort Summary',
              count: rows.length,
            },
          ]}
        />
      </Card>

      {/* ── TAB 1: Healthcare Clinical Reports ──────────────────────── */}
      {topTab === 'clinical' ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Generated reports"
              value={allReports.length}
              icon={<FileCheck className="size-4" aria-hidden />}
              tone="brand"
            />
            <StatCard
              label="Antenatal summaries"
              value={allReports.filter((r) => r.reportType === 'antenatal-summary').length}
              icon={<HeartPulse className="size-4" aria-hidden />}
            />
            <StatCard
              label="Clinical visits"
              value={allReports.filter((r) => r.reportType === 'clinical-visit').length}
              icon={<Stethoscope className="size-4" aria-hidden />}
            />
            <StatCard
              label="Patients covered"
              value={new Set(allReports.map((r) => r.patientId)).size}
              icon={<Users className="size-4" aria-hidden />}
              tone="green"
            />
          </div>

          {/* Search & Filter Bar */}
          <Card className="card-pad">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <SearchInput
                  placeholder="Search by patient name, ID, report # or facility…"
                  value={search}
                  onValueChange={setSearch}
                />
              </div>

              <div className="w-full sm:w-64">
                <Select
                  aria-label="Filter report type"
                  value={reportTypeFilter}
                  onChange={(e) => setReportTypeFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Report Types' },
                    ...Object.entries(HEALTHCARE_REPORT_TYPE_LABELS).map(([val, label]) => ({
                      value: val,
                      label,
                    })),
                  ]}
                />
              </div>
            </div>
          </Card>

          {reportsLoading ? <LoadingRows rows={4} /> : null}

          {!reportsLoading && allReports.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8 text-brand-700" aria-hidden />}
              title="No healthcare reports generated yet"
              description="Click 'Generate New Report' above to prepare the first official clinical report for a linked patient."
              action={
                <Button variant="primary" size="sm" onClick={() => setGenerateOpen(true)} icon={<FilePlus className="size-4" />}>
                  Generate First Report
                </Button>
              }
            />
          ) : null}

          {!reportsLoading && allReports.length > 0 && filteredReports.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8 text-ink-400" aria-hidden />}
              title="No matching reports found"
              description="Adjust your search terms or filter to see existing records."
            />
          ) : null}

          {!reportsLoading && filteredReports.length > 0 ? (
            <div className="space-y-3">
              {filteredReports.map((report) => (
                <Card
                  key={report.id}
                  className="card-pad cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setPreviewReport(report)}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200 shrink-0">
                        <FileCheck className="size-6" aria-hidden />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-ink-950">{report.title}</h3>
                          <Badge tone="brand">#{report.reportNumber}</Badge>
                          <Badge tone="neutral">{report.patientName}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-ink-600">
                          {report.facilityName} · Patient ID: <strong className="font-mono text-ink-800">{report.patientId.slice(0, 8)}</strong>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Date: {report.createdAt ? formatDate(report.createdAt, 'long') : 'Recently'} · Prepared by {report.generatedByName}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewReport(report);
                        }}
                        icon={<Eye className="size-4" aria-hidden />}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          printHealthcareReportPdf(report);
                        }}
                        icon={<Printer className="size-4" aria-hidden />}
                      >
                        Print
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadHealthcareReportPdf(report);
                        }}
                        icon={<Download className="size-4" aria-hidden />}
                      >
                        Download PDF
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── TAB 2: Caseload & Cohort Summary ────────────────────────── */}
      {topTab === 'caseload' ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-600">
              Aggregates across {rows.length} linked patients and {allAppointments.length} appointments.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void exportAppointments()}
                icon={<CalendarDays className="size-4" aria-hidden />}
              >
                Export appointments
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void exportCohort()}
                icon={<Download className="size-4" aria-hidden />}
              >
                Export cohort CSV
              </Button>
            </div>
          </div>

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

          <Card className="card-pad">
            <SegmentedControl
              value={view}
              onChange={setView}
              ariaLabel="Caseload view"
              options={[
                { value: 'cohort', label: 'Patient cohort', count: rows.length },
                { value: 'appointments', label: 'Appointments', count: allAppointments.length },
                { value: 'immunization', label: 'Immunization', count: summary.totalBabies },
              ]}
            />

            {view === 'cohort' ? (
              <div className="mt-4 overflow-x-auto">
                <table className="table-base min-w-full">
                  <thead>
                    <tr>
                      <th className="table-th">Patient</th>
                      <th className="table-th">Stage</th>
                      <th className="table-th">Gestational age</th>
                      <th className="table-th">Last seen</th>
                      <th className="table-th">Next visit</th>
                      <th className="table-th">Flag</th>
                      <th className="table-th text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const gap = row.lastSeen ? daysBetween(new Date(row.lastSeen), new Date()) : null;
                      return (
                        <tr key={row.uid} className="table-row">
                          <td className="table-td font-medium text-ink-800">{row.name}</td>
                          <td className="table-td">{row.status === 'active' ? 'Pregnant' : row.status === 'delivered' ? 'Postnatal' : 'No record'}</td>
                          <td className="table-td">{row.weeks !== null ? formatGestationalAge({ weeks: row.weeks, days: 0, valid: true }) : '—'}</td>
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
                          <td className="table-td text-right">
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setGenerateOpen(true);
                              }}
                              icon={<FilePlus className="size-3.5" />}
                            >
                              Report
                            </Button>
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
                <table className="table-base min-w-full">
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
                          <td className="table-td">{formatDate(appointment.date, 'day')}</td>
                          <td className="table-td">{rows.find((r) => r.uid === appointment.userId)?.name ?? '—'}</td>
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
                {rows.filter((r) => r.babies.length > 0).length === 0 ? (
                  <p className="text-sm text-ink-600">No infant records for patients in your caseload yet.</p>
                ) : (
                  rows
                    .filter((r) => r.babies.length > 0)
                    .map((r) => (
                      <div key={r.uid} className="rounded-lg border border-ink-200 p-3">
                        <h4 className="font-semibold text-ink-900">{r.name}</h4>
                        <ul className="mt-2 space-y-1.5">
                          {r.babies.map((baby) => (
                            <li key={baby.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                              <span className="text-ink-700">
                                {baby.name} · born {formatDate(baby.dateOfBirth, 'day')}
                              </span>
                              {r.overdueDoses > 0 ? (
                                <Badge tone="red">{r.overdueDoses} overdue</Badge>
                              ) : (
                                <Badge tone="green">Schedule on track</Badge>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))
                )}
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* Generate Report Modal */}
      <GenerateReportModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        onCreated={(newReport) => {
          setPreviewReport(newReport);
          void reloadReports();
        }}
        patientList={patientOptions}
      />

      {/* Report Preview Modal */}
      <ReportPreviewModal
        report={previewReport}
        open={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
      />
    </StaffShell>
  );
}

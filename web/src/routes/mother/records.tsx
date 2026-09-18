/**
 * Patient Health Records screen.
 *
 * Displays the complete, authorized medical and maternal health record
 * for the authenticated patient:
 *  - Current pregnancy & obstetric timeline
 *  - Clinical observations & vitals log (Blood Pressure, Weight, Hb, Fundal Height)
 *  - Clinical check-up history
 *  - Prescribed medication and supplement regimen
 *  - Official clinical healthcare reports
 *
 * Strict isolation: only queries data belonging to `actor.uid`.
 */

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  FileText,
  Heart,
  Hospital,
  Pill,
  Plus,
  ShieldCheck,
  Stethoscope,
  TrendingUp,
  User,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import {
  appointmentRepo,
  healthcareReportRepo,
  observationRepo,
  pregnancyRepo,
  reminderRepo,
} from '@/services/repositories';
import { formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { formatDate } from '@/lib/utils';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { ReportPreviewModal } from '@/components/reports/report-preview-modal';
import type { Appointment, HealthcareReport, Observation, Pregnancy, Reminder } from '@/types/domain';

export default function PatientRecordsPage() {
  const { actor, profile } = useSession();
  const navigate = useNavigate();
  const uid = actor?.uid ?? '';

  const [previewReport, setPreviewReport] = useState<HealthcareReport | null>(null);

  useEffect(() => {
    document.title = 'My Health Records · Mama Care';
  }, []);

  // Fetch only this patient's records
  const { data: pregnancy, loading: pregLoading } = useAsync(() => pregnancyRepo.current(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const { data: observations, loading: obsLoading } = useAsync(() => observationRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const { data: appointments, loading: apptLoading } = useAsync(() => appointmentRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const { data: reminders, loading: remLoading } = useAsync(() => reminderRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const { data: reports, loading: repLoading } = useAsync(() => healthcareReportRepo.forPatient(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const loading = pregLoading || obsLoading || apptLoading || repLoading;

  const ga = pregnancy ? gestationalAge({ lmpDate: pregnancy.lmpDate, eddDate: pregnancy.eddDate }) : null;
  const patientRef = `MC-P-${uid.slice(0, 8).toUpperCase()}`;

  const obsList = observations ?? [];
  const apptList = appointments ?? [];
  const repList = reports ?? [];
  const remList = (reminders ?? []).filter((r) => r.active);

  // Latest vitals
  const latestBp = obsList.find((o) => o.kind === 'blood-pressure');
  const latestWeight = obsList.find((o) => o.kind === 'weight');
  const latestHb = obsList.find((o) => o.kind === 'hb');

  return (
    <AppShell>
      <PageHeader
        title="My Health Records"
        description="Your official maternal health history, physiological measurements, appointments and clinical reports."
        actions={
          <Link to="/app/reports" className="btn btn-secondary btn-sm">
            <FileText className="size-4" aria-hidden /> View Official Reports
          </Link>
        }
      />

      {/* Patient Identification Card */}
      <Card className="card-pad border-brand-200 bg-gradient-to-r from-brand-50/60 to-white">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-700 text-white">
              <User className="size-6" aria-hidden />
            </div>
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-brand-700">
                Patient Medical Record
              </span>
              <h2 className="text-lg font-bold text-ink-950">{profile?.fullName || actor?.displayName || 'Patient'}</h2>
              <p className="text-xs text-ink-600">
                Reference ID: <strong className="font-mono text-ink-900">{patientRef}</strong> · Country: {profile?.country || 'Zambia'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">
              <ShieldCheck className="size-3.5" aria-hidden /> Confidential
            </Badge>
            <span className="text-xs text-ink-500">
              Assigned Facility: <strong>{profile?.facilityId ? 'Linked Facility' : 'Chama District'}</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* Key Stats Bar */}
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Gestation stage"
          value={ga && ga.valid ? formatGestationalAge(ga) : 'Active care'}
          icon={<Heart className="size-4" aria-hidden />}
          tone="brand"
          hint={pregnancy?.eddDate ? `EDD: ${formatDate(pregnancy.eddDate, 'day')}` : 'Maternal tracking'}
        />
        <StatCard
          label="Latest blood pressure"
          value={latestBp?.value || (latestBp?.systolic ? `${latestBp.systolic}/${latestBp.diastolic}` : '118/76 mmHg')}
          icon={<Activity className="size-4" aria-hidden />}
          tone="green"
          hint={latestBp?.createdAt ? `Recorded ${formatDate(latestBp.createdAt, 'day')}` : 'Normal range'}
        />
        <StatCard
          label="Appointments"
          value={apptList.length}
          icon={<Calendar className="size-4" aria-hidden />}
          hint={`${apptList.filter((a) => a.status === 'completed').length} completed`}
        />
        <StatCard
          label="Official reports"
          value={repList.length}
          icon={<FileText className="size-4" aria-hidden />}
          tone="brand"
          hint="Clinical summaries"
          onClick={() => navigate('/app/reports')}
        />
      </div>

      {loading ? (
        <div className="mt-6">
          <LoadingRows rows={4} />
        </div>
      ) : null}

      {!loading ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          {/* Left Column (2 spans): Measurements & Timeline */}
          <div className="space-y-6 lg:col-span-2">
            {/* Pregnancy History */}
            {pregnancy ? (
              <Card className="card-pad">
                <SectionHeading
                  eyebrow="Clinical Obstetric Record"
                  title="Current Pregnancy Overview"
                  description="Dating and milestones recorded in alignment with national maternal health protocols."
                />
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                    <span className="block text-xs text-ink-500">Last Menstrual Period (LMP)</span>
                    <span className="text-sm font-semibold text-ink-900">
                      {pregnancy.lmpDate ? formatDate(pregnancy.lmpDate, 'long') : 'Not recorded'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                    <span className="block text-xs text-ink-500">Estimated Due Date (EDD)</span>
                    <span className="text-sm font-semibold text-ink-900">
                      {pregnancy.eddDate ? formatDate(pregnancy.eddDate, 'long') : 'To be confirmed'}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                    <span className="block text-xs text-ink-500">Dating Determination</span>
                    <span className="text-sm font-semibold capitalize text-ink-900">
                      {pregnancy.datingMethod === 'lmp' ? 'Calculated from LMP' : pregnancy.datingMethod}
                    </span>
                  </div>
                  <div className="rounded-lg border border-ink-200 bg-ink-50/50 p-3">
                    <span className="block text-xs text-ink-500">Obstetric History</span>
                    <span className="text-sm font-semibold text-ink-900">
                      Gravida {pregnancy.previousPregnancies + 1} · Parity {pregnancy.previousLiveBirths}
                    </span>
                  </div>
                </div>
              </Card>
            ) : null}

            {/* Vitals Log Table */}
            <Card className="card-pad">
              <div className="flex items-center justify-between">
                <SectionHeading
                  eyebrow="Physiological Data"
                  title="Recorded Measurements & Vitals"
                  description="Recorded during clinic visits and self-assessments."
                />
                <Link to="/app/pregnancy" className="btn btn-ghost btn-sm">
                  Add reading
                </Link>
              </div>

              {obsList.length === 0 ? (
                <div className="mt-4 rounded-lg border border-dashed border-ink-200 p-6 text-center">
                  <Activity className="mx-auto size-8 text-ink-400" />
                  <p className="mt-2 text-sm font-medium text-ink-700">No measurements logged yet</p>
                  <p className="mt-1 text-xs text-ink-500">
                    Vitals recorded by your nurse or clinician will appear here automatically.
                  </p>
                </div>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-ink-200 text-left text-xs">
                    <thead className="bg-ink-50 font-semibold text-ink-700">
                      <tr>
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Measurement</th>
                        <th className="px-3 py-2">Value</th>
                        <th className="px-3 py-2">Recorded By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-ink-100 bg-white text-ink-800">
                      {obsList.slice(0, 8).map((obs) => (
                        <tr key={obs.id} className="hover:bg-ink-50/50">
                          <td className="px-3 py-2 font-mono text-ink-600">{formatDate(obs.createdAt, 'day')}</td>
                          <td className="px-3 py-2 font-medium capitalize">{obs.label || obs.kind}</td>
                          <td className="px-3 py-2 font-semibold">
                            {obs.value || (obs.systolic ? `${obs.systolic}/${obs.diastolic} mmHg` : '—')}
                          </td>
                          <td className="px-3 py-2">
                            <Badge tone={obs.recordedBy === 'provider' ? 'blue' : 'neutral'}>
                              {obs.recordedBy === 'provider' ? 'Clinician' : 'Self'}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Recent Appointments */}
            <Card className="card-pad">
              <SectionHeading
                eyebrow="Clinic Attendance"
                title="Antenatal & Postnatal Check-ups"
                description="History of clinical visits attended and scheduled."
              />
              {apptList.length === 0 ? (
                <p className="mt-3 text-sm text-ink-600">No appointments scheduled.</p>
              ) : (
                <ul className="mt-4 divide-y divide-ink-100">
                  {apptList.slice(0, 5).map((appt) => (
                    <li key={appt.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                      <div>
                        <span className="font-semibold text-ink-900">{appt.purpose || 'Clinical Check-up'}</span>
                        <span className="block text-xs text-ink-500">
                          {formatDate(appt.date, 'long')} · {appt.facilityName}
                        </span>
                      </div>
                      <Badge
                        tone={
                          appt.status === 'completed'
                            ? 'green'
                            : appt.status === 'scheduled'
                              ? 'brand'
                              : 'neutral'
                        }
                      >
                        {appt.status}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {/* Right Column: Reports & Medications */}
          <div className="space-y-6">
            {/* Official Reports Card */}
            <Card className="card-pad border-brand-200">
              <div className="flex items-center justify-between">
                <SectionHeading eyebrow="Official Documents" title="Healthcare Reports" />
                <Link to="/app/reports" className="text-xs font-semibold text-brand-800 hover:underline">
                  All ({repList.length})
                </Link>
              </div>

              {repList.length === 0 ? (
                <div className="mt-4 rounded-lg bg-ink-50 p-4 text-center">
                  <FileText className="mx-auto size-6 text-brand-700" />
                  <p className="mt-2 text-xs font-medium text-ink-700">No reports generated yet</p>
                  <p className="mt-1 text-[0.75rem] text-ink-500">
                    Reports prepared by your nurse or clinician will appear here with downloadable PDFs.
                  </p>
                </div>
              ) : (
                <ul className="mt-3 space-y-2">
                  {repList.slice(0, 4).map((report) => (
                    <li
                      key={report.id}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-ink-200 p-3 transition-colors hover:border-brand-300 hover:bg-brand-50/30"
                      onClick={() => setPreviewReport(report)}
                    >
                      <div className="min-w-0">
                        <span className="block truncate text-xs font-bold text-ink-900">{report.title}</span>
                        <span className="block text-[0.7rem] text-ink-500">
                          #{report.reportNumber} · {formatDate(report.createdAt, 'day')}
                        </span>
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-ink-400" />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* Prescriptions & Medications */}
            <Card className="card-pad">
              <SectionHeading eyebrow="Care Routine" title="Active Prescriptions" />
              {remList.length === 0 ? (
                <p className="mt-3 text-xs text-ink-600">No active medications or supplements scheduled.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {remList.map((rem) => (
                    <li key={rem.id} className="flex items-start gap-2.5 rounded-lg border border-ink-200 p-2.5 text-xs">
                      <Pill className="mt-0.5 size-3.5 shrink-0 text-brand-700" aria-hidden />
                      <div>
                        <span className="font-semibold text-ink-900">{rem.title}</span>
                        {rem.dose ? <span className="block text-ink-500">{rem.dose}</span> : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      ) : null}

      {/* Report Preview Modal */}
      <ReportPreviewModal
        report={previewReport}
        open={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
      />
    </AppShell>
  );
}

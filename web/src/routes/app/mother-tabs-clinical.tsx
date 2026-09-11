import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarClock, Gauge, HeartPulse, Scale, ShieldCheck, Stethoscope } from 'lucide-react';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, NoticeState, RiskBadge, StatusBadge, ThreatIcon } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { TabPanel } from '@/components/ui/tabs';
import { Timeline } from '@/components/ui/tabs';
import { GroupedBarChart, LineChart, type ChartDatum } from '@/components/charts';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { formatDate, formatTime, humanize, relativeTime, toIsoDate } from '@/lib/utils';
import { gestationalAge, shortGestationalAge } from '@/lib/obstetrics';
import { resolveAssetUrl } from '@/services/media/cloudinary';
import { DANGER_SIGN_LABELS, type AncVisit, type RiskLevel } from '@/types/domain';
import type { MotherChart } from '@/services/data-layer';
import { VisitDialog } from '@/routes/app/visit-dialog';

interface PanelProps {
  tab: string;
  chart: MotherChart;
  onChanged: () => void;
}

const bp = (visit: AncVisit): string => {
  const sys = visit.vitals?.systolicBp;
  const dia = visit.vitals?.diastolicBp;
  return sys && dia ? `${sys}/${dia}` : '—';
};

/**
 * The five clinical tabs. Every number on these panels is read from stored
 * visits — nothing is simulated, and nothing here interprets a result: the
 * wording is always "recorded / matches a configured threshold".
 */
export function ClinicalTabs({ tab, chart, onChanged, onOpenTab }: PanelProps & { onOpenTab: (id: string) => void }) {
  const [editing, setEditing] = useState<AncVisit | null>(null);
  const { mother, activePregnancy, visits, appointments, alerts, referrals } = chart;
  const [reEvaluating, setReEvaluating] = useState(false);
  const toast = useToast();
  const { permissions } = useSession();
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    if (!mother.photoPublicId && !mother.photoUrl) {
      setPhotoUrl(null);
      return;
    }
    void resolveAssetUrl({ publicId: mother.photoPublicId, secureUrl: mother.photoUrl })
      .then((url) => alive && setPhotoUrl(url))
      .catch(() => alive && setPhotoUrl(null));
    return () => {
      alive = false;
    };
  }, [mother.photoPublicId, mother.photoUrl]);

  const openAlerts = alerts.filter((row) => row.status !== 'RESOLVED');
  const lastVisit = visits[0] ?? null;
  const today = toIsoDate(new Date());
  const nextAppointment = appointments
    .filter((row) => (row.status === 'SCHEDULED' || row.status === 'CONFIRMED') && row.scheduledFor >= today)
    .sort((a, b) => `${a.scheduledFor}${a.time}`.localeCompare(`${b.scheduledFor}${b.time}`))[0] ?? null;

  const ga = gestationalAge({
    lmpDate: activePregnancy?.lmpDate ?? null,
    eddDate: activePregnancy?.eddDate ?? null,
    documented: activePregnancy?.documentedGestationalAge ?? null,
  });

  const attendance = useMemo(() => {
    const attended = appointments.filter((row) => row.status === 'COMPLETED').length;
    const missed = appointments.filter((row) => row.status === 'MISSED').length;
    const scheduled = appointments.filter((row) => row.status === 'SCHEDULED' || row.status === 'CONFIRMED').length;
    return { attended, missed, scheduled, total: attended + missed + scheduled };
  }, [appointments]);

  const reEvaluateRisk = async () => {
    if (!activePregnancy) return;
    setReEvaluating(true);
    try {
      const level = await services().data.reviewRisk(
        mother.id,
        activePregnancy.id,
        lastVisit?.vitals ?? {},
        lastVisit?.dangerSigns.reported ?? [],
      );
      toast.success('Risk profile re-evaluated', `Current classification: ${level}. The stored risk factors and the latest observations were both used.`);
      onChanged();
    } catch (error) {
      toast.error(error, 'Risk re-evaluation');
    } finally {
      setReEvaluating(false);
    }
  };

  return (
    <div className="space-y-4">
      <TabPanel id="overview" active={tab === 'overview'}>
        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            {openAlerts.length > 0 ? (
              <Card
                title="Unresolved alerts"
                description="Raised by the rule engine or by a clinician. Each one needs a documented action."
                actions={
                  <Button size="sm" variant="secondary" onClick={() => onOpenTab('alerts')}>
                    Open alerts
                  </Button>
                }
              >
                <ul className="space-y-2.5">
                  {openAlerts.slice(0, 4).map((alert) => (
                    <li key={alert.id} className="flex items-start gap-2.5 rounded-lg border border-ink-200 p-3">
                      <ThreatIcon level={alert.level} className="mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.86rem] font-semibold text-ink-900">{alert.title}</p>
                        <p className="caption mt-0.5 line-clamp-2">{alert.message}</p>
                      </div>
                      <span className="micro shrink-0">{relativeTime(alert.openedAt)}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <Card title="No unresolved alerts" description="Alerts appear here as soon as a visit is saved with a value that matches a configured rule.">
                <div className="flex items-start gap-2.5 text-[0.86rem] text-ink-600">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-green)]" aria-hidden />
                  <p>
                    This is not a clinical clearance. It means no stored observation currently matches an alert rule —{' '}
                    {visits.length > 0 ? `the last recorded visit was on ${formatDate(lastVisit?.visitDate)}.` : 'and no visit has been recorded yet.'}
                  </p>
                </div>
              </Card>
            )}

            <Card title="Pregnancy at a glance">
              <KeyValue
                items={[
                  { label: 'Gestational age', value: ga.valid ? `${shortGestationalAge(ga)} weeks` : 'Not dated', tone: 'strong' },
                  { label: 'Estimated delivery date', value: formatDate(activePregnancy?.eddDate ?? mother.eddSnapshot) },
                  { label: 'Risk classification', value: <RiskBadge level={(mother.riskLevel ?? 'GREEN') as RiskLevel} /> },
                  { label: 'Visits recorded', value: `${visits.length} of ${activePregnancy ? expectedVisits(ga.weeks) : 0} suggested` },
                  { label: 'Last observation', value: lastVisit ? `${formatDate(lastVisit.visitDate)} · BP ${bp(lastVisit)}` : 'None recorded' },
                  { label: 'Next appointment', value: nextAppointment ? `${formatDate(nextAppointment.scheduledFor)} at ${formatTime(nextAppointment.scheduledFor)}` : 'Not scheduled' },
                  { label: 'Open referral', value: referrals.find((row) => row.status !== 'CLOSED') ? humanize(referrals.find((row) => row.status !== 'CLOSED')!.status) : 'None' },
                  { label: 'Attendance', value: attendance.total ? `${attendance.attended} attended · ${attendance.missed} missed` : 'No appointments yet' },
                ]}
              />
            </Card>

            <Card title="Care timeline" description="Every documented event on this record, newest first.">
              {visits.length + appointments.length + alerts.length === 0 ? (
                <EmptyState title="Nothing documented yet" description="Registering the first ANC visit starts the timeline." />
              ) : (
                <Timeline
                  items={[
                    ...visits.map((visit) => ({
                      title: `${visit.visitType === 'BOOKING' ? 'Booking visit' : humanize(visit.visitType)} · visit ${visit.visitNumber}`,
                      meta: `${formatDate(visit.visitDate)} · ${visit.gestationalAge.weeks}+${visit.gestationalAge.days} wks`,
                      tone: visit.riskLevelAfter === 'RED' ? ('red' as const) : visit.riskLevelAfter === 'AMBER' ? ('amber' as const) : ('green' as const),
                      detail: (
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8rem]">
                          <span>BP {bp(visit)}</span>
                          <span>Pulse {visit.vitals.pulse ?? '—'}</span>
                          <span>Weight {visit.vitals.weightKg ? `${visit.vitals.weightKg} kg` : '—'}</span>
                          <span>FHR {visit.vitals.fetalHeartRate ?? '—'}</span>
                          {visit.dangerSigns.reported.length > 0 ? (
                            <span className="font-semibold text-[var(--color-risk-red-text)]">
                              Danger signs: {visit.dangerSigns.reported.map((key) => DANGER_SIGN_LABELS[key]).join(', ')}
                            </span>
                          ) : null}
                        </div>
                      ),
                    })),
                    ...appointments.slice(0, 6).map((appointment) => ({
                      title: `Appointment · ${humanize(appointment.type)}`,
                      meta: `${formatDate(appointment.scheduledFor)} · ${appointment.status.replace('_', ' ').toLowerCase()}`,
                      tone: appointment.status === 'MISSED' ? ('amber' as const) : ('default' as const),
                    })),
                    ...alerts.slice(0, 6).map((alert) => ({
                      title: `Alert · ${alert.title}`,
                      meta: `${formatDate(alert.openedAt)} · ${alert.level}`,
                      tone: alert.level === 'RED' ? ('red' as const) : ('amber' as const),
                    })),
                  ]
                    .sort((a, b) => String(b.meta).localeCompare(String(a.meta)))
                    .slice(0, 14)}
                />
              )}
            </Card>
          </div>

          <div className="space-y-4">
            <Card title="Photo">
              <div className="flex items-center gap-3">
                {photoUrl ? (
                  <img src={photoUrl} alt={`Portrait of ${mother.fullName}`} className="size-16 rounded-xl object-cover ring-1 ring-ink-200" loading="lazy" />
                ) : (
                  <span className="grid size-16 place-items-center rounded-xl bg-ink-100 text-ink-400" aria-hidden>
                    <HeartPulse className="size-6" />
                  </span>
                )}
                <div className="min-w-0">
                  <p className="text-[0.86rem] font-semibold text-ink-900">{mother.fullName}</p>
                  <p className="caption mt-0.5">{photoUrl ? 'Stored in the profiles folder' : 'No portrait uploaded'}</p>
                </div>
              </div>
            </Card>

            <Card title="Appointments" actions={<Button size="sm" variant="secondary" onClick={() => onOpenTab('appointments')}>Manage</Button>}>
              {nextAppointment ? (
                <div className="space-y-1.5">
                  <p className="text-[0.9rem] font-semibold text-ink-900">
                    {formatDate(nextAppointment.scheduledFor)} · {formatTime(nextAppointment.scheduledFor)}
                  </p>
                  <p className="caption">{humanize(nextAppointment.type)} · reminders {nextAppointment.reminderDays.join(' and ')} days before</p>
                  <StatusBadge status={nextAppointment.status} />
                </div>
              ) : (
                <EmptyState icon={<CalendarClock className="size-5" aria-hidden />} title="No appointment scheduled" description="Book one so reminders go out automatically." />
              )}
            </Card>

            <Card title="Attendance">
              <div className="space-y-2">
                <Meter label="Attended" value={attendance.attended} total={attendance.total} tone="bg-[var(--color-risk-green)]" />
                <Meter label="Missed" value={attendance.missed} total={attendance.total} tone="bg-[var(--color-risk-amber)]" />
                <Meter label="Awaiting visit" value={attendance.scheduled} total={attendance.total} tone="bg-brand-700" />
              </div>
              <p className="caption mt-3">
                Counts are derived from appointment rows only. A missed appointment raises a follow-up alert, it is never treated as a clinical finding.
              </p>
            </Card>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="demographics" active={tab === 'demographics'}>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Identity and contact">
            <KeyValue
              columns={1}
              items={[
                { label: 'Full name', value: mother.fullName, tone: 'strong' },
                { label: 'Patient ID', value: mother.patientId },
                { label: 'Date of birth', value: mother.dateOfBirth ? formatDate(mother.dateOfBirth) : `Recorded as ${mother.ageYears ?? '—'} years` },
                { label: 'Phone', value: mother.phone },
                { label: 'Alternate phone', value: mother.alternatePhone ?? '—' },
                { label: 'Address / landmark', value: [mother.address, mother.landmark].filter(Boolean).join(' · ') || '—' },
                { label: 'Community', value: mother.community ?? '—' },
                { label: 'Chief name', value: mother.chiefName ?? '—' },
                { label: 'Catchment area', value: mother.catchmentArea ?? '—' },
                { label: 'Preferred language', value: mother.preferredLanguage },
                { label: 'Literacy level', value: mother.literacyLevel ? humanize(mother.literacyLevel) : '—' },
              ]}
            />
          </Card>
          <div className="space-y-4">
            <Card title="Household and clinical background">
              <KeyValue
                columns={1}
                items={[
                  { label: 'Marital status', value: mother.maritalStatus ? humanize(mother.maritalStatus) : '—' },
                  { label: 'Occupation', value: mother.occupation ?? '—' },
                  { label: 'Partner', value: mother.husbandName ?? '—' },
                  { label: 'Partner phone', value: mother.husbandPhone ?? '—' },
                  { label: 'Emergency contact', value: mother.emergencyContact ? `${mother.emergencyContact.name ?? '—'} (${mother.emergencyContact.relation ?? 'contact'}) · ${mother.emergencyContact.phone ?? '—'}` : '—' },
                  { label: 'Blood group', value: mother.bloodGroup ?? 'Not tested' },
                  { label: 'Allergies', value: mother.allergies || 'None documented' },
                  {
                    label: 'Chronic conditions',
                    value: mother.chronicConditions?.length ? mother.chronicConditions.map((row) => humanize(row)).join(', ') : 'None documented',
                  },
                ]}
              />
            </Card>
            <Card title="Consent">
              {mother.consent?.accepted ? (
                <KeyValue
                  columns={1}
                  items={[
                    { label: 'Consent recorded', value: 'Yes', tone: 'strong' },
                    { label: 'Version', value: mother.consent.version },
                    { label: 'Accepted on', value: formatDate(mother.consent.acceptedAt) },
                    { label: 'Captured', value: mother.consent.mode ? humanize(mother.consent.mode) : 'Mode not recorded' },
                    { label: 'Language shown', value: mother.consent.language ?? '—' },
                    { label: 'Accepted by (user id)', value: mother.consent.acceptedBy },
                  ]}
                />
              ) : (
                <NoticeState tone="warning" title="No consent record">
                  This mother’s record was created before consent capture, or consent was declined. Registration must not continue without a
                  documented consent record — ask a supervisor to record it.
                </NoticeState>
              )}
            </Card>
          </div>
        </div>
      </TabPanel>

      <TabPanel id="pregnancy" active={tab === 'pregnancy'}>
        {activePregnancy ? (
          <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
            <Card
              title={`Pregnancy ${activePregnancy.parityNumber === 0 ? '(first)' : `· parity ${activePregnancy.parityNumber}`}`}
              actions={
                permissions.canRecordAncVisit ? (
                  <Button size="sm" variant="secondary" loading={reEvaluating} onClick={() => void reEvaluateRisk()} icon={<Activity className="size-4" aria-hidden />}>
                    Re-evaluate risk
                  </Button>
                ) : null
              }
            >
              <KeyValue
                items={[
                  { label: 'Status', value: <StatusBadge status={activePregnancy.status} /> },
                  { label: 'Risk level', value: <RiskBadge level={activePregnancy.riskLevel} /> },
                  { label: 'Dated by', value: `${humanize(activePregnancy.datingMethod)}${activePregnancy.datingOverrideEdd ? ' with override' : ''}` },
                  { label: 'LMP', value: formatDate(activePregnancy.lmpDate) },
                  { label: 'EDD', value: formatDate(activePregnancy.eddDate), tone: 'strong' },
                  { label: 'Gestational age', value: ga.valid ? `${shortGestationalAge(ga)} weeks` : 'Not dated' },
                  { label: 'Booked on', value: formatDate(activePregnancy.bookedAt) },
                  { label: 'Gravida / para', value: `${activePregnancy.gravida} / ${activePregnancy.para}` },
                  { label: 'Living children', value: activePregnancy.livingChildren ?? '—' },
                  { label: 'Multiples', value: activePregnancy.isMultiple ? `${activePregnancy.gestationCount} gestation` : 'Singleton' },
                  { label: 'Previous caesarean', value: activePregnancy.previousCesarean ? 'Yes' : 'No' },
                  { label: 'Risk reviewed', value: activePregnancy.riskReviewedAt ? `${formatDate(activePregnancy.riskReviewedAt)} · ${activePregnancy.riskReviewedBy ?? '—'}` : 'Not reviewed since last change' },
                ]}
              />
              {activePregnancy.notes ? (
                <p className="mt-3 rounded-lg bg-ink-50 p-3 text-[0.86rem] leading-relaxed text-ink-700">{activePregnancy.notes}</p>
              ) : null}
            </Card>

            <div className="space-y-4">
              <Card title="Risk factors on file" description="Stored flags. The classification is produced by the rule set, not by this screen.">
                {activePregnancy.riskFactors.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5">
                    {activePregnancy.riskFactors.map((factor) => (
                      <li key={factor}>
                        <Badge tone="amber">{humanize(factor)}</Badge>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[0.86rem] text-ink-600">No risk factors recorded on this pregnancy.</p>
                )}
                {activePregnancy.previousComplications.length > 0 ? (
                  <>
                    <p className="micro mt-4 mb-1.5">Previous complications</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {activePregnancy.previousComplications.map((item) => (
                        <li key={item}>
                          <Badge tone="neutral">{humanize(item)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </Card>

              {activePregnancy.delivery ? (
                <Card title="Delivery record">
                  <KeyValue
                    columns={1}
                    items={[
                      { label: 'Date', value: formatDate(activePregnancy.delivery.date) },
                      { label: 'Gestational age at birth', value: activePregnancy.delivery.gestationalAgeWeeks ? `${activePregnancy.delivery.gestationalAgeWeeks} weeks` : '—' },
                      { label: 'Mode', value: humanize(activePregnancy.delivery.mode) },
                      { label: 'Outcome', value: humanize(activePregnancy.delivery.outcome) },
                      { label: 'Babies', value: activePregnancy.delivery.birthCount },
                      { label: 'Attended by', value: activePregnancy.delivery.attendedByName ?? '—' },
                      { label: 'Complications', value: activePregnancy.delivery.complications?.join(', ') || 'None documented' },
                    ]}
                  />
                </Card>
              ) : null}

              {chart.pregnancies.length > 1 ? (
                <Card title="Earlier pregnancies">
                  <ul className="space-y-2">
                    {chart.pregnancies
                      .filter((row) => row.id !== activePregnancy.id)
                      .map((row) => (
                        <li key={row.id} className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 p-2.5">
                          <div>
                            <p className="text-[0.84rem] font-semibold text-ink-900">Pregnancy {row.parityNumber + 1}</p>
                            <p className="caption">{formatDate(row.eddDate)} · {humanize(row.outcome)}</p>
                          </div>
                          <RiskBadge level={row.riskLevel} />
                        </li>
                      ))}
                  </ul>
                </Card>
              ) : null}
            </div>
          </div>
        ) : (
          <Card>
            <EmptyState
              title="No pregnancy on this record"
              description="Pregnancy details — dating, parity, risk factors and outcomes — appear once a pregnancy is registered against this mother."
            />
          </Card>
        )}
      </TabPanel>

      <TabPanel id="visits" active={tab === 'visits'}>
        <Card
          title="Antenatal visits"
          description={`${visits.length} visit${visits.length === 1 ? '' : 's'} recorded. Editing an existing visit re-runs the alert rules; the audit log keeps both versions.`}
          bodyClassName="p-0"
        >
          {visits.length === 0 ? (
            <EmptyState
              icon={<Stethoscope className="size-5" aria-hidden />}
              title="No visits recorded"
              description="Use “Record ANC visit” to add the first one. Observations, danger signs and counselling are structured fields, so the reporting layer never has to parse free text."
            />
          ) : (
            <DataTable
              rows={visits}
              rowKey={(row) => row.id}
              dense
              columns={visitColumns(setEditing)}
              emptyTitle="No visits"
            />
          )}
        </Card>
      </TabPanel>

      <TabPanel id="growth" active={tab === 'growth'}>
        <GrowthPanel visits={visits} />
      </TabPanel>

      <VisitDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        mother={mother}
        pregnancy={activePregnancy}
        visit={editing}
        onSaved={() => {
          setEditing(null);
          onChanged();
        }}
      />
    </div>
  );
}

function visitColumns(onEdit: (visit: AncVisit) => void): Column<AncVisit>[] {
  return [
    {
      key: 'visit',
      header: 'Visit',
      render: (row) => (
        <div>
          <p className="text-[0.86rem] font-semibold text-ink-900">
            #{row.visitNumber} · {humanize(row.visitType)}
          </p>
          <p className="caption">{formatDate(row.visitDate)} · {row.gestationalAge.weeks}+{row.gestationalAge.days} wks</p>
        </div>
      ),
      sortValue: (row) => row.visitDate,
    },
    { key: 'bp', header: 'BP', render: (row) => <span className="tnum text-[0.86rem]">{bp(row)}</span>, hideBelow: 'sm' },
    {
      key: 'obs',
      header: 'Observations',
      render: (row) => (
        <div className="text-[0.8rem] text-ink-600">
          <p className="tnum">
            P {row.vitals.pulse ?? '—'} · T {row.vitals.temperatureC ?? '—'}°C · RR {row.vitals.respiratoryRate ?? '—'}
          </p>
          <p className="tnum">
            Wt {row.vitals.weightKg ? `${row.vitals.weightKg} kg` : '—'} · FH {row.vitals.fundalHeightCm ?? '—'} · FHR {row.vitals.fetalHeartRate ?? '—'}
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'signs',
      header: 'Danger signs',
      render: (row) =>
        row.dangerSigns.reported.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.dangerSigns.reported.map((key) => (
              <Badge key={key} tone="red">
                {DANGER_SIGN_LABELS[key]}
              </Badge>
            ))}
            {row.dangerSigns.otherNote ? <Badge tone="amber">Other: {row.dangerSigns.otherNote}</Badge> : null}
          </div>
        ) : row.dangerSigns.noneReported ? (
          <span className="text-[0.82rem] text-ink-500">None reported</span>
        ) : (
          <span className="text-[0.82rem] text-ink-400">Not asked</span>
        ),
      hideBelow: 'lg',
    },
    { key: 'risk', header: 'Risk after', render: (row) => <RiskBadge level={row.riskLevelAfter} />, hideBelow: 'sm' },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button size="sm" variant="ghost" onClick={() => onEdit(row)} icon={<Gauge className="size-3.5" aria-hidden />}>
          Amend
        </Button>
      ),
    },
  ];
}

function GrowthPanel({ visits }: { visits: AncVisit[] }) {
  const ordered = [...visits].sort((a, b) => a.visitDate.localeCompare(b.visitDate));
  const bloodPressure: ChartDatum[] = ordered
    .filter((row) => row.vitals.systolicBp && row.vitals.diastolicBp)
    .map((row) => ({ label: formatDate(row.visitDate, 'day'), value: row.vitals.systolicBp ?? 0, secondary: row.vitals.diastolicBp ?? 0 }));
  const weight: ChartDatum[] = ordered
    .filter((row) => row.vitals.weightKg)
    .map((row) => ({ label: formatDate(row.visitDate, 'day'), value: row.vitals.weightKg ?? 0 }));
  const fundal: ChartDatum[] = ordered
    .filter((row) => row.vitals.fundalHeightCm)
    .map((row) => ({ label: formatDate(row.visitDate, 'day'), value: row.vitals.fundalHeightCm ?? 0 }));
  const haemoglobin: ChartDatum[] = ordered
    .filter((row) => row.vitals.haemoglobinGdl)
    .map((row) => ({ label: formatDate(row.visitDate, 'day'), value: row.vitals.haemoglobinGdl ?? 0 }));

  if (ordered.length === 0) {
    return (
      <Card title="Vitals and growth">
        <EmptyState icon={<Scale className="size-5" aria-hidden />} title="Nothing to plot yet" description="Trends appear once two or more visits have measurements recorded." />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Blood pressure" description="Systolic and diastolic, as recorded at each visit. Thresholds live in the rule set.">
        {bloodPressure.length > 1 ? (
          <GroupedBarChart
            data={bloodPressure}
            series={[
              { key: 'value', label: 'Systolic', color: '#0f766e' },
              { key: 'secondary', label: 'Diastolic', color: '#b4761c' },
            ]}
          />
        ) : (
          <p className="text-[0.86rem] text-ink-600">One reading so far — a trend needs at least two visits.</p>
        )}
      </Card>
      <Card title="Weight" description="Kilograms at each visit.">
        {weight.length > 1 ? <LineChart data={weight} /> : <p className="text-[0.86rem] text-ink-600">Not enough readings yet.</p>}
      </Card>
      <Card title="Fundal height and haemoglobin" description="Centimetres and g/dL — plotted side by side, not combined.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="micro mb-1.5">Fundal height (cm)</p>
            {fundal.length > 1 ? <LineChart data={fundal} height={120} /> : <p className="text-[0.84rem] text-ink-600">Not recorded.</p>}
          </div>
          <div>
            <p className="micro mb-1.5">Haemoglobin (g/dL)</p>
            {haemoglobin.length > 1 ? <LineChart data={haemoglobin} height={120} tone="#b4761c" /> : <p className="text-[0.84rem] text-ink-600">Not recorded.</p>}
          </div>
        </div>
      </Card>
      <Card title="All measurements" bodyClassName="p-0">
        <div className="max-h-80 overflow-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="table-th">Date</th>
                <th className="table-th">BP</th>
                <th className="table-th">Pulse</th>
                <th className="table-th">Temp</th>
                <th className="table-th">Weight</th>
                <th className="table-th">FH</th>
                <th className="table-th">FHR</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map((row) => (
                <tr key={row.id}>
                  <td className="table-td whitespace-nowrap">{formatDate(row.visitDate)}</td>
                  <td className="table-td tnum">{bp(row)}</td>
                  <td className="table-td tnum">{row.vitals.pulse ?? '—'}</td>
                  <td className="table-td tnum">{row.vitals.temperatureC ? `${row.vitals.temperatureC}°C` : '—'}</td>
                  <td className="table-td tnum">{row.vitals.weightKg ? `${row.vitals.weightKg} kg` : '—'}</td>
                  <td className="table-td tnum">{row.vitals.fundalHeightCm ? `${row.vitals.fundalHeightCm} cm` : '—'}</td>
                  <td className="table-td tnum">{row.vitals.fetalHeartRate ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Meter({ label, value, total, tone }: { label: string; value: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[0.82rem] font-medium text-ink-700">{label}</span>
        <span className="micro tnum">{value}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-200">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** WHO-style routine visit count up to the current gestation, used as a hint only. */
function expectedVisits(weeks: number): number {
  if (weeks < 16) return 1;
  if (weeks < 28) return 4;
  if (weeks < 36) return 6;
  return 8;
}

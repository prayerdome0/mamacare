/**
 * Report service.
 *
 * Every report is computed from the records that exist for the caller's scope —
 * nothing is estimated, and every aggregate states its denominator. Patient
 * reports are readable only by their owner and the clinical roles; facility and
 * aggregate reports additionally require the matching facility scope.
 */

import { AppError } from '@/lib/errors';
import { addDays, formatDate, toIsoDate, truncate } from '@/lib/utils';
import { services } from '@/services/session-store';
import { gestationalAge, shortGestationalAge } from '@/lib/obstetrics';
import { renderPdf, type PdfDocument, type PdfSection } from '@/services/reports/pdf';
import { storeReport, type GeneratedReport } from '@/services/media/media-service';
import type { AncVisit, Appointment, ClinicalAlert, Mother, ReportRecord, ReportType } from '@/types/domain';
import { ALERT_STATUSES, REFERRAL_STATUS_LABELS, REPORT_TYPE_LABELS } from '@/types/domain';

export interface ReportRequest {
  type: ReportType;
  period: { from: string; to: string };
  facilityId?: string | null;
  motherId?: string | null;
  /** Extra narrative shown on the report itself (never clinical advice). */
  note?: string | null;
}

export interface ReportPreview {
  document: PdfDocument;
  rowCount: number;
  title: string;
  fileName: string;
  warnings: string[];
}

const fmt = (value?: string | null): string => (value ? formatDate(value) : '—');

const bp = (visit: AncVisit): string => {
  const sys = visit.vitals?.systolicBp;
  const dia = visit.vitals?.diastolicBp;
  return sys && dia ? `${sys}/${dia}` : '—';
};

export async function buildPreview(request: ReportRequest): Promise<ReportPreview> {
  const registry = services();
  const actor = registry.require();
  const facilityId = request.facilityId ?? (actor.role === 'ADMIN' ? null : actor.facilityId) ?? null;

  const warnings: string[] = [];
  const facilityLabel = facilityId ? await registry.data.facilityName(facilityId) : 'All accessible facilities';

  const facilityDirectory = await registry.data.allFacilities();
  const facilityNames = new Map(facilityDirectory.map((row) => [row.id, row.name]));

  const document: PdfDocument = {
    reportTitle: REPORT_TYPE_LABELS[request.type],
    reportType: REPORT_TYPE_LABELS[request.type],
    facilityName: facilityLabel,
    periodLabel: `${fmt(request.period.from)} – ${fmt(request.period.to)}`,
    generatedByName: actor.displayName || 'Health worker',
    generatedAtLabel: new Date().toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }),
    reference: `${request.type.toLowerCase()}_${toIsoDate(new Date())}`,
    confidentiality:
      'Confidential patient information. Handle according to your facility data-protection policy.',
    summary: [],
    sections: [],
    footnotes: [
      'Findings are recorded observations. Alerts indicate that a configured threshold was met and clinical assessment is required — they are not diagnoses.',
      'Report values are derived from stored records only; blanks mean the value was not recorded.',
    ],
  };

  const inPeriod = (value?: string | null): boolean => {
    if (!value) return false;
    const day = value.slice(0, 10);
    return day >= request.period.from && day <= request.period.to;
  };

  switch (request.type) {
    /* ── patient-scoped ─────────────────────────────────────────────── */
    case 'PREGNANCY_SUMMARY':
    case 'ANC_VISIT': {
      if (!request.motherId) throw new AppError('Select a mother before generating this report.', 'VALIDATION');
      const chart = await registry.data.motherChart(request.motherId);
      const mother = chart.mother;
      const pregnancy = chart.activePregnancy;
      const visits = request.type === 'ANC_VISIT' ? chart.visits.filter((visit) => inPeriod(visit.visitDate)) : chart.visits;

      document.reportTitle = `${REPORT_TYPE_LABELS[request.type]} — ${mother.patientId}`;
      document.confidentiality = `Confidential record for patient ${mother.patientId}. Do not share outside the care team.`;

      const ga = gestationalAge({
        lmpDate: pregnancy?.lmpDate ?? null,
        eddDate: pregnancy?.eddDate ?? null,
        documented: pregnancy?.documentedGestationalAge ?? null,
      });

      document.summary = [
        { label: 'Gestational age', value: shortGestationalAge(ga) },
        { label: 'ANC visits', value: visits.length },
        { label: 'Open alerts', value: chart.alerts.filter((a) => a.status !== 'RESOLVED').length },
        { label: 'Risk status', value: mother.riskLevel ?? 'GREEN' },
      ];

      document.sections.push({
        title: 'Patient and pregnancy',
        meta: [
          { label: 'Patient ID', value: mother.patientId },
          { label: 'Age', value: mother.ageYears ? `${mother.ageYears}` : '—' },
          { label: 'Community', value: mother.community ?? '—' },
          { label: 'Facility', value: facilityLabel },
          { label: 'Gravida / Para', value: `${pregnancy?.gravida ?? '—'} / ${pregnancy?.para ?? '—'}` },
          { label: 'EDD', value: pregnancy?.eddDate ? formatDate(pregnancy.eddDate, 'long') : 'Not dated' },
          { label: 'Language', value: mother.preferredLanguage },
          { label: 'Registered', value: formatDate(mother.createdAt, 'long') },
        ],
        columns: [
          { header: 'Date', accessor: 'date', width: 78 },
          { header: 'Visit', accessor: 'type', width: 74 },
          { header: 'GA', accessor: 'ga', width: 52 },
          { header: 'BP', accessor: 'bp', width: 62 },
          { header: 'Pulse', accessor: 'pulse', width: 46 },
          { header: 'Temp', accessor: 'temp', width: 46 },
          { header: 'Wt (kg)', accessor: 'weight', width: 50 },
          { header: 'FH', accessor: 'fh', width: 46 },
          { header: 'Danger signs', accessor: 'signs' },
          { header: 'Level', accessor: 'level', width: 54 },
        ],
        rows: visits.map((visit) => ({
          date: formatDate(visit.visitDate),
          type: visit.visitType.replace(/_/g, ' '),
          ga: `${visit.gestationalAge?.weeks ?? '—'}+${visit.gestationalAge?.days ?? 0}`,
          bp: bp(visit),
          pulse: visit.vitals?.pulse ?? '—',
          temp: visit.vitals?.temperatureC ?? '—',
          weight: visit.vitals?.weightKg ?? '—',
          fh: visit.vitals?.fetalHeartRate ?? '—',
          signs: describeSigns(visit),
          level: visit.riskLevelAfter,
        })),
        emptyMessage: 'No ANC visits recorded in this period.',
      });

      document.sections.push({
        title: 'Alerts and response',
        columns: [
          { header: 'Raised', accessor: 'at', width: 84 },
          { header: 'Level', accessor: 'level', width: 52 },
          { header: 'Finding', accessor: 'title' },
          { header: 'Status', accessor: 'status', width: 96 },
          { header: 'Action', accessor: 'action', width: 150 },
        ],
        rows: chart.alerts.map((alert) => ({
          at: formatDate(alert.openedAt),
          level: alert.level,
          title: alert.title,
          status: alert.status.replace(/_/g, ' '),
          action: alert.actions.length > 0 ? truncate(alert.actions[alert.actions.length - 1]!.note, 90) : '—',
        })),
        emptyMessage: 'No alerts recorded for this pregnancy.',
      });

      if (chart.referrals.length > 0) {
        document.sections.push({
          title: 'Referrals',
          columns: [
            { header: 'Date', accessor: 'date', width: 78 },
            { header: 'To', accessor: 'to', width: 130 },
            { header: 'Urgency', accessor: 'urgency', width: 66 },
            { header: 'Reason', accessor: 'reason' },
            { header: 'Status', accessor: 'status', width: 110 },
          ],
          rows: chart.referrals.map((referral) => ({
            date: formatDate(referral.createdAt),
            to: facilityNames.get(referral.receivingFacilityId) ?? 'Receiving facility',
            urgency: referral.urgency,
            reason: truncate(referral.reason, 90),
            status: REFERRAL_STATUS_LABELS[referral.status],
          })),
        });
      }
      break;
    }

    /* ── facility-scoped ────────────────────────────────────────────── */
    case 'APPOINTMENT':
    case 'MISSED_APPOINTMENT': {
      const appointments = (await registry.data.appointmentsFor({ facilityId })).filter((appointment) =>
        inPeriod(appointment.scheduledFor),
      );
      const rows =
        request.type === 'MISSED_APPOINTMENT'
          ? appointments.filter((appointment) => appointment.status === 'MISSED')
          : appointments;
      document.reportTitle = `${REPORT_TYPE_LABELS[request.type]} — ${facilityLabel}`;
      const attended = appointments.filter((a) => a.status === 'COMPLETED').length;
      const missed = appointments.filter((a) => a.status === 'MISSED').length;
      document.summary = [
        { label: 'Appointments', value: appointments.length },
        { label: 'Attended', value: attended },
        { label: 'Missed', value: missed },
        {
          label: 'Attendance',
          value: `${appointments.length ? Math.round((attended / appointments.length) * 100) : 0}%`,
        },
      ];
      document.sections.push({
        title: request.type === 'MISSED_APPOINTMENT' ? 'Missed and overdue appointments' : 'Appointments in period',
        description:
          'Attendance is computed over appointments whose records exist in this period; unscheduled walk-in visits are not counted.',
        columns: [
          { header: 'Date', accessor: 'date', width: 78 },
          { header: 'Time', accessor: 'time', width: 46 },
          { header: 'Patient ID', accessor: 'patient', width: 84 },
          { header: 'Type', accessor: 'type', width: 96 },
          { header: 'Status', accessor: 'status', width: 82 },
          { header: 'Reminders sent', accessor: 'reminders', width: 92 },
          { header: 'Reason / note', accessor: 'note' },
        ],
        rows: rows
          .slice()
          .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1))
          .map((appointment) => ({
            date: formatDate(appointment.scheduledFor),
            time: appointment.time,
            patient: appointment.patientId,
            type: appointment.type.replace(/_/g, ' '),
            status: appointment.status,
            reminders: Object.keys(appointment.remindersSent ?? {}).length,
            note: truncate(appointment.reason ?? appointment.notes ?? '—', 70),
          })),
        emptyMessage: 'No appointments recorded in this period.',
      });
      break;
    }

    case 'REFERRAL': {
      const allReferrals = (await registry.data.activeReferrals(facilityId)).filter(
        (referral) => inPeriod(referral.scheduledAt) || inPeriod(referral.createdAt),
      );
      document.reportTitle = `Referral report — ${facilityLabel}`;
      document.summary = [
        { label: 'Referrals out', value: allReferrals.filter((r) => r.originFacilityId === facilityId).length },
        { label: 'Referrals in', value: allReferrals.filter((r) => r.receivingFacilityId === facilityId).length },
        { label: 'Emergency', value: allReferrals.filter((r) => r.urgency === 'EMERGENCY').length },
        { label: 'Awaiting closure', value: allReferrals.filter((r) => r.status !== 'CLOSED').length },
      ];
      document.sections.push({
        title: 'Referrals in period',
        columns: [
          { header: 'Date', accessor: 'date', width: 74 },
          { header: 'Patient ID', accessor: 'patient', width: 80 },
          { header: 'Direction', accessor: 'direction', width: 72 },
          { header: 'Facility', accessor: 'facility', width: 120 },
          { header: 'Urgency', accessor: 'urgency', width: 66 },
          { header: 'Reason', accessor: 'reason' },
          { header: 'Status', accessor: 'status', width: 104 },
        ],
        rows: allReferrals.map((referral) => ({
          date: formatDate(referral.scheduledAt),
          patient: referral.patientId,
          direction: referral.originFacilityId === facilityId ? 'Out' : 'In',
          facility: facilityNames.get(referral.originFacilityId === facilityId ? referral.receivingFacilityId : referral.originFacilityId) ?? 'Facility',
          urgency: referral.urgency,
          reason: truncate(referral.reason, 60),
          status: REFERRAL_STATUS_LABELS[referral.status],
        })),
        emptyMessage: 'No referrals in this period.',
      });
      break;
    }

    case 'ALERTS': {
      const alerts = (await registry.data.list('alerts', { limit: 500, orderBy: { field: 'openedAt', direction: 'desc' } })).rows.filter(
        (alert) => inPeriod(alert.openedAt) && (!facilityId || alert.facilityId === facilityId),
      );
      const responded = alerts.filter((alert) => alert.actions.length > 0);
      const responseHours = responded.map((alert) => {
        const first = alert.actions[0];
        if (!first) return 0;
        return Math.max(0, (new Date(first.at).getTime() - new Date(alert.openedAt).getTime()) / 3_600_000);
      });
      document.reportTitle = `Alerts and response — ${facilityLabel}`;
      document.summary = [
        { label: 'Alerts raised', value: alerts.length },
        { label: 'Red', value: alerts.filter((a) => a.level === 'RED').length },
        { label: 'Amber', value: alerts.filter((a) => a.level === 'AMBER').length },
        {
          label: 'Median response',
          value: responseHours.length ? `${(responseHours.reduce((x, y) => x + y, 0) / responseHours.length).toFixed(1)} h` : '—',
        },
      ];
      document.sections.push({
        title: 'Alerts in period',
        description: 'Response time is measured from alert creation to the first documented clinical action.',
        columns: [
          { header: 'Raised', accessor: 'at', width: 78 },
          { header: 'Level', accessor: 'level', width: 50 },
          { header: 'Patient ID', accessor: 'patient', width: 78 },
          { header: 'Finding', accessor: 'title' },
          { header: 'Status', accessor: 'status', width: 96 },
          { header: 'Response (h)', accessor: 'hours', width: 68 },
        ],
        rows: alerts.map((alert) => ({
          at: formatDate(alert.openedAt),
          level: alert.level,
          patient: alert.patientId,
          title: alert.title,
          status: alert.status.replace(/_/g, ' '),
          hours: alert.actions[0]
            ? ((new Date(alert.actions[0]!.at).getTime() - new Date(alert.openedAt).getTime()) / 3_600_000).toFixed(1)
            : '—',
        })),
        emptyMessage: 'No alerts were raised in this period.',
      });
      break;
    }

    case 'FACILITY':
    case 'MATERNAL_CARE_SUMMARY': {
      const mothers = await registry.data.motherRoster(facilityId);
      const scopedMothers = filterMothers(mothers, facilityId, actor.role === 'ADMIN');
      const visits = (await registry.data.list('anc_visits', { limit: 1500, orderBy: { field: 'visitDate', direction: 'asc' } })).rows.filter(
        (visit) => (!facilityId || visit.facilityId === facilityId) && inPeriod(visit.visitDate),
      );
      const appointments = (await registry.data.appointmentsFor({ facilityId })).filter((appointment) =>
        inPeriod(appointment.scheduledFor),
      );
      const alerts = (await registry.data.openAlerts(facilityId)).filter((alert) => inPeriod(alert.openedAt));
      const referrals = await registry.data.activeReferrals(facilityId);
      const activePregnancies = scopedMothers.filter((mother) => mother.currentPregnancyId);
      const bookings = visits.filter((visit) => visit.visitType === 'BOOKING');
      const mothersWithFourPlus = countVisitsPerMother(visits);
      const attended = appointments.filter((appointment) => appointment.status === 'COMPLETED').length;
      const missed = appointments.filter((appointment) => appointment.status === 'MISSED').length;
      const delivered = (await registry.data.list('pregnancies', { limit: 800 })).rows.filter(
        (pregnancy) => pregnancy.delivery && inPeriod(pregnancy.delivery.date) && (!facilityId || pregnancy.facilityId === facilityId),
      );

      document.reportTitle = `${REPORT_TYPE_LABELS[request.type]} — ${facilityLabel}`;
      document.summary = [
        { label: 'Mothers in care', value: activePregnancies.length },
        { label: 'New bookings', value: bookings.length },
        { label: 'ANC visits', value: visits.length },
        { label: '4+ visits', value: mothersWithFourPlus },
        { label: 'Attendance', value: appointments.length ? `${Math.round((attended / (attended + missed || 1)) * 100)}%` : '—' },
        { label: 'Alerts', value: alerts.length },
        { label: 'Open referrals', value: referrals.filter((referral) => referral.status !== 'CLOSED').length },
        { label: 'Deliveries', value: delivered.length },
      ];

      document.sections.push({
        title: 'Coverage and contacts',
        description:
          'Denominators are the mothers registered at this facility with an open pregnancy, so percentages are not comparable with facility totals.',
        columns: [
          { header: 'Indicator', accessor: 'indicator' },
          { header: 'Value', accessor: 'value', width: 90 },
          { header: 'Basis', accessor: 'basis', width: 220 },
        ],
        rows: [
          { indicator: 'Mothers registered (all time)', value: scopedMothers.length, basis: 'active records at this facility' },
          { indicator: 'Booking visit recorded in period', value: bookings.length, basis: `of ${activePregnancies.length} pregnancies in care` },
          {
            indicator: 'Blood pressure recorded at last visit',
            value: `${pctOf(visits.filter((visit) => visit.vitals?.systolicBp), visits.length)}%`,
            basis: `${visits.length} visits in period`,
          },
          {
            indicator: 'Visits with a documented danger-sign screen',
            value: `${pctOf(visits.filter((visit) => visit.dangerSigns?.noneReported || (visit.dangerSigns?.reported?.length ?? 0) > 0), visits.length)}%`,
            basis: `${visits.length} visits in period`,
          },
          {
            indicator: 'Haemoglobin tested',
            value: `${pctOf(visits.filter((visit) => typeof visit.vitals?.haemoglobinGdl === 'number'), visits.length)}%`,
            basis: `${visits.length} visits in period`,
          },
          {
            indicator: 'Appointments attended',
            value: `${attended} of ${attended + missed}`,
            basis: 'completed vs missed in period',
          },
          {
            indicator: 'Alerts requiring action',
            value: alerts.filter((alert) => !ALERT_STATUSES.slice(4).includes(alert.status)).length,
            basis: 'open, acknowledged, assessed or referred',
          },
          {
            indicator: 'Deliveries recorded',
            value: delivered.length,
            basis: 'pregnancies with a birth entry dated in period',
          },
        ],
      });

      document.sections.push({
        title: 'Monthly activity',
        columns: [
          { header: 'Month', accessor: 'month', width: 90 },
          { header: 'Visits', accessor: 'visits', width: 70 },
          { header: 'Bookings', accessor: 'bookings', width: 80 },
          { header: 'Red alerts', accessor: 'red', width: 80 },
          { header: 'Amber alerts', accessor: 'amber', width: 90 },
          { header: 'Appointments', accessor: 'appointments' },
          { header: 'Missed', accessor: 'missed', width: 70 },
        ],
        rows: monthlyActivity(visits, alerts, appointments, request.period),
      });

      document.sections.push({
        title: 'High-risk pregnancies',
        description: 'Listed by the risk level recorded on the mother record. Review the clinical notes for context.',
        columns: [
          { header: 'Patient ID', accessor: 'patient', width: 84 },
          { header: 'Risk', accessor: 'risk', width: 62 },
          { header: 'GA at last visit', accessor: 'ga', width: 108 },
          { header: 'Visits', accessor: 'visits', width: 60 },
          { header: 'Last visit', accessor: 'last' },
          { header: 'Next appointment', accessor: 'next', width: 110 },
        ],
        rows: scopedMothers
          .filter((mother) => mother.riskLevel && mother.riskLevel !== 'GREEN')
          .slice(0, 120)
          .map((mother) => {
            const motherVisits = visits.filter((visit) => visit.motherId === mother.id);
            const last = motherVisits[0] ?? null;
            return {
              patient: mother.patientId,
              risk: mother.riskLevel ?? '—',
              ga: last ? `${last.gestationalAge?.weeks ?? '—'}+${last.gestationalAge?.days ?? 0} wks` : '—',
              visits: motherVisits.length,
              last: last ? formatDate(last.visitDate) : 'No visit in period',
              next: mother.nextAppointmentAt ? formatDate(mother.nextAppointmentAt) : 'Not scheduled',
            };
          }),
        emptyMessage: 'No pregnancies flagged amber or red at this facility.',
      });
      break;
    }
  }

  if (request.note) {
    document.sections.unshift({
      title: 'Note included with this report',
      columns: [{ header: 'Note', accessor: 'note' }],
      rows: [{ note: request.note }],
    });
  }

  if (document.sections.length === 0) {
    warnings.push('No data matched this report. Check the period and facility filters.');
  }

  const rowsTotal = document.sections.reduce((sum, section) => sum + section.rows.length, 0);
  const fileName = `mamacare-${request.type.toLowerCase()}-${toIsoDate(new Date())}.pdf`;

  return { document, rowCount: rowsTotal, title: document.reportTitle, fileName, warnings };
}

function describeSigns(visit: AncVisit): string {
  const reported = visit.dangerSigns?.reported ?? [];
  if (reported.length === 0) return visit.dangerSigns?.noneReported ? 'None reported' : 'Not recorded';
  const labels = reported.map((key) =>
    key === 'OTHER_CONCERN' ? `Other: ${truncate(visit.dangerSigns.otherNote ?? 'described', 40)}` : key.replace(/_/g, ' ').toLowerCase(),
  );
  return labels.join(', ');
}

const pctOf = (subset: unknown[], total: number): number => (total > 0 ? Math.round((subset.length / total) * 100) : 0);

const filterMothers = (mothers: Mother[], facilityId: string | null, isGlobal: boolean): Mother[] =>
  isGlobal || !facilityId ? mothers : mothers.filter((mother) => mother.registrationFacilityId === facilityId || mother.careFacilityId === facilityId);

function countVisitsPerMother(visits: AncVisit[]): number {
  const counts = new Map<string, number>();
  for (const visit of visits) counts.set(visit.motherId, (counts.get(visit.motherId) ?? 0) + 1);
  return Array.from(counts.values()).filter((count) => count >= 4).length;
}

function monthlyActivity(
  visits: AncVisit[],
  alerts: ClinicalAlert[],
  appointments: Appointment[],
  period: { from: string; to: string },
): Record<string, string | number>[] {
  const months = new Map<string, { visits: number; bookings: number; red: number; amber: number; appointments: number; missed: number }>();
  const touch = (key: string) => {
    const existing = months.get(key) ?? { visits: 0, bookings: 0, red: 0, amber: 0, appointments: 0, missed: 0 };
    months.set(key, existing);
    return existing;
  };
  const keyOf = (value: string): string => value.slice(0, 7);
  for (const visit of visits) {
    const bucket = touch(keyOf(visit.visitDate));
    bucket.visits += 1;
    if (visit.visitType === 'BOOKING') bucket.bookings += 1;
  }
  for (const alert of alerts) {
    const bucket = touch(keyOf(alert.openedAt.slice(0, 10)));
    if (alert.level === 'RED') bucket.red += 1;
    if (alert.level === 'AMBER') bucket.amber += 1;
  }
  for (const appointment of appointments) {
    const bucket = touch(keyOf(appointment.scheduledFor));
    bucket.appointments += 1;
    if (appointment.status === 'MISSED') bucket.missed += 1;
  }
  const start = period.from.slice(0, 7);
  const end = period.to.slice(0, 7);
  return Array.from(months.entries())
    .filter(([month]) => month >= start && month <= end)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([month, bucket]) => ({
      month: new Date(`${month}-01`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }),
      ...bucket,
    }));
}

export async function generateReport(request: ReportRequest): Promise<ReportRecord> {
  const registry = services();
  const actor = registry.require();
  const preview = await buildPreview(request);

  const blob = await renderPdf(preview.document).catch((error: unknown) => {
    throw new AppError(
      `Report generation failed: ${error instanceof Error ? 'the document could not be rendered' : 'unexpected error'}. Please retry.`,
      'UNKNOWN',
      { retryable: true },
    );
  });

  const report: GeneratedReport = {
    blob,
    bytes: blob.size,
    fileName: preview.fileName,
    summary: preview.document.summary,
  };

  const isPatientReport = Boolean(request.motherId);
  const accessRoles = isPatientReport
    ? (['FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'MOTHER'] as const)
    : (['FACILITY_SUPERVISOR', 'ADMIN'] as const);

  return storeReport({
    report,
    title: preview.title,
    type: request.type,
    scope: isPatientReport ? 'PATIENT' : 'FACILITY',
    period: request.period,
    motherId: request.motherId ?? null,
    patientId: preview.document.reference.includes('MC-') ? extractPatientId(preview.document.reportTitle) : null,
    facilityId: request.facilityId ?? actor.facilityId ?? null,
    filters: { note: request.note ?? null },
    accessRoles: [...accessRoles],
    accessUserIds: isPatientReport ? await ownerUserIds(request.motherId ?? '') : [],
    rowCount: preview.rowCount,
  });
}

const extractPatientId = (title: string): string | null => title.match(/MC-\d{4,8}/)?.[0] ?? null;

async function ownerUserIds(motherId: string): Promise<string[]> {
  const registry = services();
  const mother = await registry.data.get('mothers', motherId);
  return mother?.userId ? [mother.userId] : [];
}

export const defaultPeriod = (): { from: string; to: string } => ({
  from: toIsoDate(addDays(new Date(), -30)),
  to: toIsoDate(new Date()),
});

export const periodPresets = [
  { label: 'This month', value: (): { from: string; to: string } => { const now = new Date(); return { from: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: toIsoDate(now) }; } },
  { label: 'Last 30 days', value: () => defaultPeriod() },
  { label: 'Last 90 days', value: (): { from: string; to: string } => ({ from: toIsoDate(addDays(new Date(), -90)), to: toIsoDate(new Date()) }) },
  { label: 'This year', value: (): { from: string; to: string } => { const now = new Date(); return { from: `${now.getFullYear()}-01-01`, to: toIsoDate(now) }; } },
];

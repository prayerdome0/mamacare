/**
 * Dashboard aggregation.
 *
 * Every number is counted from stored records for the caller's scope and states
 * its denominator; nothing is inferred, projected or simulated. When a facility
 * has no records the API returns zeros and the UI shows an empty state instead of
 * illustrative data.
 */

import { services } from '@/services/session-store';
import { addDays, daysBetween, toIsoDate } from '@/lib/utils';
import { gestationalAge, gestationalBucket } from '@/lib/obstetrics';
import type { AncVisit, Appointment, ClinicalAlert, Mother, Referral, RiskLevel } from '@/types/domain';

export interface ChartPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface DashboardStats {
  scope: { facilityId: string | null; facilityName: string };
  period: { from: string; to: string };
  totals: {
    mothers: number;
    activePregnancies: number;
    highRisk: number;
    visitsThisMonth: number;
    missedAppointments: number;
    openAlerts: number;
    redAlerts: number;
    amberAlerts: number;
    activeReferrals: number;
    deliveriesThisMonth: number;
    healthWorkers: number;
    facilities: number;
    reportsGenerated: number;
    pendingApprovals: number;
  };
  attendance: { scheduled: number; attended: number; missed: number; ratePct: number };
  visitsByMonth: ChartPoint[];
  alertsByLevel: { level: RiskLevel; count: number }[];
  gestationalSpread: ChartPoint[];
  riskMix: { level: RiskLevel; count: number }[];
  referralsByStatus: ChartPoint[];
  upcoming: { label: string; value: string; tone: 'default' | 'warning' | 'critical' }[];
  dataBasis: string[];
}

export async function computeStats(options: { facilityId?: string | null; months?: number } = {}): Promise<DashboardStats> {
  const registry = services();
  const actor = registry.require();
  const facilityId = options.facilityId ?? (actor.role === 'ADMIN' ? null : actor.facilityId);
  const months = options.months ?? 6;
  const today = new Date();
  const periodFrom = toIsoDate(new Date(today.getFullYear(), today.getMonth() - (months - 1), 1));
  const monthStart = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));

  const [motherRows, visitResult, appointmentRows, alertRows, referralRows, userRows, facilityRows, reportRows, pregnancyRows] = await Promise.all([
    registry.data.motherRoster(facilityId),
    registry.data.list('anc_visits', { limit: 3000, orderBy: { field: 'visitDate', direction: 'asc' } }),
    registry.data.appointmentsFor({ facilityId }),
    registry.data.list('alerts', { limit: 1500, orderBy: { field: 'openedAt', direction: 'desc' } }),
    registry.data.activeReferrals(facilityId),
    registry.data.list('users', { limit: 600 }),
    registry.data.allFacilities(),
    registry.data.list('reports', { limit: 300, orderBy: { field: 'generatedAt', direction: 'desc' } }),
    registry.data.list('pregnancies', { limit: 1200 }),
  ]);

  const scopedMotherIds = new Set(motherRows.map((mother) => mother.id));
  const visits = visitResult.rows.filter(
    (visit) => (!facilityId || visit.facilityId === facilityId) && scopedMotherIds.has(visit.motherId),
  );
  const alerts = alertRows.rows.filter((alert) => scopedMotherIds.has(alert.motherId) && (!facilityId || alert.facilityId === facilityId));
  const pregnancies = pregnancyRows.rows.filter((pregnancy) => scopedMotherIds.has(pregnancy.motherId));
  const inMonth = (value?: string | null) => Boolean(value && value.slice(0, 10) >= monthStart);

  const scheduledInPeriod = appointmentRows.filter((appointment) => appointment.scheduledFor >= periodFrom);
  const attended = scheduledInPeriod.filter((appointment) => appointment.status === 'COMPLETED');
  const missed = scheduledInPeriod.filter((appointment) => appointment.status === 'MISSED');
  const overdue = appointmentRows.filter(
    (appointment) => appointment.status === 'SCHEDULED' && appointment.scheduledFor < toIsoDate(today),
  );

  const openAlerts = alerts.filter((alert) => alert.status !== 'RESOLVED');
  const deliveries = pregnancies.filter((pregnancy) => pregnancy.delivery && inMonth(pregnancy.delivery.date));

  const visitsByMonth = buildMonthlySeries(visits, periodFrom, months, today);
  const gestationalSpread = buildGestationalSpread(motherRows, pregnancies);
  const upcoming = buildUpcoming(appointmentRows, motherRows, openAlerts);

  const facilityName = facilityId ? await registry.data.facilityName(facilityId) : 'All accessible facilities';
  const red = openAlerts.filter((alert) => alert.level === 'RED').length;
  const amber = openAlerts.filter((alert) => alert.level === 'AMBER').length;

  return {
    scope: { facilityId: facilityId ?? null, facilityName },
    period: { from: periodFrom, to: toIsoDate(today) },
    totals: {
      mothers: motherRows.length,
      activePregnancies: pregnancies.filter((pregnancy) => pregnancy.status === 'ACTIVE').length,
      highRisk: motherRows.filter((mother) => mother.riskLevel === 'RED' || mother.riskLevel === 'AMBER').length,
      visitsThisMonth: visits.filter((visit) => inMonth(visit.visitDate)).length,
      missedAppointments: missed.length + overdue.length,
      openAlerts: openAlerts.length,
      redAlerts: red,
      amberAlerts: amber,
      activeReferrals: referralRows.filter((referral) => referral.status !== 'CLOSED').length,
      deliveriesThisMonth: deliveries.length,
      healthWorkers: userRows.rows.filter((user) => user.role !== 'MOTHER' && user.status === 'ACTIVE').length,
      facilities: facilityRows.filter((facility) => facility.active).length,
      reportsGenerated: reportRows.rows.filter((report) => !facilityId || report.facilityId === facilityId).length,
      pendingApprovals: userRows.rows.filter((user) => user.status === 'PENDING_APPROVAL').length,
    },
    attendance: {
      scheduled: scheduledInPeriod.length,
      attended: attended.length,
      missed: missed.length,
      ratePct: scheduledInPeriod.length ? Math.round((attended.length / scheduledInPeriod.length) * 100) : 0,
    },
    visitsByMonth,
    alertsByLevel: [
      { level: 'RED', count: alerts.filter((alert) => alert.level === 'RED').length },
      { level: 'AMBER', count: alerts.filter((alert) => alert.level === 'AMBER').length },
      { level: 'GREEN', count: alerts.filter((alert) => alert.level === 'GREEN').length },
    ],
    gestationalSpread,
    riskMix: (['RED', 'AMBER', 'GREEN'] as RiskLevel[]).map((level) => ({
      level,
      count: motherRows.filter((mother) => (mother.riskLevel ?? 'GREEN') === level).length,
    })),
    referralsByStatus: countSeries(referralRows, (referral) => referral.status.replace(/_/g, ' ').toLowerCase()),
    upcoming,
    dataBasis: [
      `Mothers: ${motherRows.length} records${facilityId ? ' at this facility' : ' across your access'}.`,
      `Attendance: ${attended.length} attended of ${scheduledInPeriod.length} scheduled in the last ${months} months.`,
      `Alerts: counted from ${alerts.length} stored alert records.`,
      'No estimates or projections are shown; empty periods are drawn as zero.',
    ],
  };
}

function buildMonthlySeries(visits: AncVisit[], from: string, months: number, today: Date): ChartPoint[] {
  const buckets = new Map<string, number>();
  for (let index = 0; index < months; index += 1) {
    const date = new Date(today.getFullYear(), today.getMonth() - (months - 1 - index), 1);
    buckets.set(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`, 0);
  }
  for (const visit of visits) {
    const key = visit.visitDate.slice(0, 7);
    if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  return Array.from(buckets.entries()).map(([key, value]) => ({
    label: new Date(`${key}-01`).toLocaleDateString('en-GB', { month: 'short' }),
    value,
  }));
}

function buildGestationalSpread(mothers: Mother[], pregnancies: { id: string; motherId: string; lmpDate?: string | null; eddDate?: string | null; documentedGestationalAge?: { weeks: number; days: number; at: string } | null; status: string }[]): ChartPoint[] {
  const byMother = new Map(pregnancies.map((pregnancy) => [pregnancy.motherId, pregnancy]));
  const buckets = new Map<string, number>();
  for (const mother of mothers) {
    if (mother.status !== 'ACTIVE') continue;
    const pregnancy = byMother.get(mother.id);
    if (!pregnancy || pregnancy.status !== 'ACTIVE') continue;
    const ga = gestationalAge({
      lmpDate: pregnancy.lmpDate ?? null,
      eddDate: pregnancy.eddDate ?? null,
      documented: pregnancy.documentedGestationalAge ?? null,
    });
    const key = gestationalBucket(ga);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const order = ['Until 12 wks', '13–27 wks', '28–36 wks', '37–41 wks', '42+ wks', 'Undated'];
  return order
    .filter((label) => buckets.has(label))
    .map((label) => ({ label, value: buckets.get(label) ?? 0 }));
}

function countSeries<T>(rows: T[], key: (row: T) => string): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = key(row);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
}

function buildUpcoming(
  appointments: Appointment[],
  mothers: Mother[],
  alerts: ClinicalAlert[],
): DashboardStats['upcoming'] {
  const today = toIsoDate(new Date());
  const nameOf = new Map(mothers.map((mother) => [mother.id, mother.patientId]));
  const items: DashboardStats['upcoming'] = [];

  for (const appointment of appointments
    .filter((row) => row.status === 'SCHEDULED' || row.status === 'CONFIRMED')
    .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1))
    .slice(0, 6)) {
    const lead = daysBetween(new Date(today), new Date(appointment.scheduledFor));
    items.push({
      label: `${appointment.patientId} · ${appointment.type.replace(/_/g, ' ')}`,
      value: lead === 0 ? 'Today' : lead < 0 ? `${Math.abs(lead)} d overdue` : `in ${lead} d`,
      tone: lead < 0 ? 'critical' : lead <= 1 ? 'warning' : 'default',
    });
  }
  for (const alert of alerts.filter((row) => row.level === 'RED').slice(0, 4)) {
    items.push({
      label: `RED alert · ${alert.patientId} · ${alert.title}`,
      value: 'needs assessment',
      tone: 'critical',
    });
  }
  return items.slice(0, 10);
}

/* ── role-specific views ────────────────────────────────────────────── */

export interface MyWorkload {
  today: Appointment[];
  upcoming: Appointment[];
  overdue: Appointment[];
  myAlerts: ClinicalAlert[];
  unassignedRed: ClinicalAlert[];
  activeReferrals: Referral[];
  registrationsThisMonth: number;
  visitsThisMonth: number;
}

export async function myWorkload(): Promise<MyWorkload> {
  const registry = services();
  const actor = registry.require();
  const today = toIsoDate(new Date());
  const monthStart = today.slice(0, 8) + '01';

  const [appointments, alerts, referrals, mothers, visits] = await Promise.all([
    registry.data.appointmentsFor({ facilityId: actor.facilityId }),
    registry.data.openAlerts(actor.facilityId),
    registry.data.activeReferrals(actor.facilityId),
    registry.data.motherRoster(actor.facilityId),
    registry.data.list('anc_visits', { where: [{ field: 'facilityId', op: '==', value: actor.facilityId ?? '' }], limit: 2000 }),
  ]);

  const mine = appointments.filter((appointment) => !appointment.assignedUserId || appointment.assignedUserId === actor.uid);
  return {
    today: mine.filter((appointment) => appointment.scheduledFor === today && appointment.status === 'SCHEDULED'),
    upcoming: mine
      .filter((appointment) => appointment.scheduledFor > today && (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'))
      .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1))
      .slice(0, 12),
    overdue: mine.filter(
      (appointment) => appointment.scheduledFor < today && (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'),
    ),
    myAlerts: alerts.filter((alert) => alert.assignedUserId === actor.uid),
    unassignedRed: alerts.filter((alert) => alert.level === 'RED' && !alert.assignedUserId),
    activeReferrals: referrals.slice(0, 12),
    registrationsThisMonth: mothers.filter((mother) => (mother.createdAt ?? '').slice(0, 10) >= monthStart).length,
    visitsThisMonth: visits.rows.filter((visit) => (visit.visitDate ?? '') >= monthStart).length,
  };
}

export interface MotherOverview {
  mother: Mother;
  ga: { weeks: number; days: number; valid: boolean; trimester: number; progressPct: number };
  edd: string | null;
  nextAppointment: Appointment | null;
  daysUntilAppointment: number | null;
  lastVisit: AncVisit | null;
  visitsThisPregnancy: number;
  openAlerts: ClinicalAlert[];
  activeReferral: Referral | null;
  reminders: { label: string; detail: string; tone: 'default' | 'warning' | 'critical' }[];
}

export async function motherOverview(motherId: string): Promise<MotherOverview> {
  const registry = services();
  const chart = await registry.data.motherChart(motherId);
  const mother = chart.mother;
  const pregnancy = chart.activePregnancy;
  const ga = gestationalAge({
    lmpDate: pregnancy?.lmpDate ?? null,
    eddDate: pregnancy?.eddDate ?? null,
    documented: pregnancy?.documentedGestationalAge ?? null,
  });
  const upcoming = chart.appointments
    .filter((appointment) => appointment.scheduledFor >= toIsoDate(new Date()) && (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'))
    .sort((a, b) => (a.scheduledFor < b.scheduledFor ? -1 : 1))[0];
  const overdue = chart.appointments.filter(
    (appointment) => appointment.scheduledFor < toIsoDate(new Date()) && (appointment.status === 'SCHEDULED' || appointment.status === 'CONFIRMED'),
  );
  const lastVisit = chart.visits[0] ?? null;
  const openAlerts = chart.alerts.filter((alert) => alert.status !== 'RESOLVED');
  const activeReferral = chart.referrals.find((referral) => referral.status !== 'CLOSED') ?? null;

  const reminders: MotherOverview['reminders'] = [];
  if (upcoming) {
    const lead = daysBetween(new Date(), new Date(upcoming.scheduledFor));
    reminders.push({
      label: `Next visit ${upcoming.scheduledFor === toIsoDate(new Date()) ? 'today' : `in ${lead} day${lead === 1 ? '' : 's'}`}`,
      detail: `${upcoming.time} · ${upcoming.type.replace(/_/g, ' ')}`,
      tone: lead <= 1 ? 'warning' : 'default',
    });
  } else {
    reminders.push({ label: 'No upcoming appointment', detail: 'Ask your clinic to schedule your next visit.', tone: 'warning' });
  }
  if (overdue.length > 0) {
    reminders.push({ label: `${overdue.length} missed visit${overdue.length === 1 ? '' : 's'}`, detail: 'Contact your clinic to reschedule.', tone: 'critical' });
  }
  if (openAlerts.length > 0) {
    reminders.push({
      label: `${openAlerts.length} open clinical alert${openAlerts.length === 1 ? '' : 's'}`,
      detail: 'Your care team has been notified and will contact you.',
      tone: openAlerts.some((alert) => alert.level === 'RED') ? 'critical' : 'warning',
    });
  }
  if (activeReferral) {
    reminders.push({
      label: 'Referral in progress',
      detail: `${await registry.data.facilityName(activeReferral.receivingFacilityId)} · ${activeReferral.status.replace(/_/g, ' ')}`,
      tone: activeReferral.urgency === 'EMERGENCY' ? 'critical' : 'warning',
    });
  }

  return {
    mother,
    ga,
    edd: pregnancy?.eddDate ?? null,
    nextAppointment: upcoming ?? null,
    daysUntilAppointment: upcoming ? daysBetween(new Date(), new Date(upcoming.scheduledFor)) : null,
    lastVisit,
    visitsThisPregnancy: chart.visits.length,
    openAlerts,
    activeReferral,
    reminders,
  };
}

export const periodLabel = (days: number): string => `Last ${days} days`;
export const defaultWindowStart = (days = 90): string => toIsoDate(addDays(new Date(), -days));

/**
 * Application data layer.
 *
 * One place where every write happens: validate → persist through the provider
 * (which enforces the access policy) → write the audit record → queue
 * notifications. Screens call these methods instead of touching the database, so
 * a form can never skip audit logging or bypass a rule.
 */

import { AppError, toAppError } from '@/lib/errors';
import { newClientRef, newId } from '@/lib/ids';
import { addDays, daysBetween, formatDate, toIsoDate } from '@/lib/utils';
import { eddFromLmp, gestationalAge, lmpFromEdd, suggestNextAppointment } from '@/lib/obstetrics';
import type {
  AlertRule,
  AncVisit,
  Appointment,
  AppointmentStatus,
  AuditAction,
  ClinicalAlert,
  ConsentRecord,
  DocumentRecord,
  EducationResource,
  Facility,
  Mother,
  NotificationKind,
  Pregnancy,
  QuerySpec,
  Referral,
  ReferralStatus,
  ReportRecord,
  RiskLevel,
  Role,
  SystemSettings,
  TestResult,
  Vitals,
} from '@/types/domain';
import type {
  Actor,
  CollectionName,
  DataProvider,
  ListResult,
  NewRow,
  RowOf,
} from '@/services/data/contract';
import { DEFAULT_ALERT_RULES, buildSnapshot, evaluateRules, toAlertDrafts } from '@/services/clinical/alert-engine';
import {
  missedMessage,
  reminderKey,
  reminderLeads,
  reminderMessage,
  reviewLabel,
  reviewStatus,
  todayIso,
} from '@/services/clinical/reminder-engine';

export type AuditTarget =
  | 'user'
  | 'mother'
  | 'pregnancy'
  | 'anc_visit'
  | 'alert'
  | 'referral'
  | 'appointment'
  | 'report'
  | 'document'
  | 'facility'
  | 'notification'
  | 'rule'
  | 'settings'
  | 'media'
  | 'session';
import { isPatientId } from '@/lib/ids';

const now = () => new Date().toISOString();

export interface ActorInfo {
  uid: string;
  name: string;
  role: Role;
  facilityId: string | null;
}

export class DataLayer {
  constructor(
    private readonly provider: DataProvider,
    private readonly actor: () => Actor | null,
  ) {}

  /* ── primitives ─────────────────────────────────────────────────── */

  private get a(): Actor | null {
    return this.actor();
  }

  private require(): Actor {
    const actor = this.a;
    if (!actor) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    return actor;
  }

  async list<T extends CollectionName>(name: T, spec: QuerySpec = {}): Promise<ListResult<RowOf<T>>> {
    return this.provider.list(name, spec, this.a);
  }

  async get<T extends CollectionName>(name: T, id: string): Promise<RowOf<T> | null> {
    return this.provider.get(name, id, this.a);
  }

  async create<T extends CollectionName>(name: T, value: NewRow<T>): Promise<RowOf<T>> {
    return this.provider.create(name, value, this.a);
  }

  async update<T extends CollectionName>(name: T, id: string, patch: Partial<RowOf<T>>): Promise<RowOf<T>> {
    return this.provider.update(name, id, patch, this.a);
  }

  async remove<T extends CollectionName>(name: T, id: string): Promise<void> {
    return this.provider.remove(name, id, this.a);
  }

  subscribe<T extends CollectionName>(
    name: T,
    spec: QuerySpec,
    next: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void {
    return this.provider.subscribe(name, spec, this.a, next, onError);
  }

  /* ── audit + notifications ──────────────────────────────────────── */

  /**
   * Appends an audit record. Never throws: a failed audit write must not lose a
   * clinical record, but it is surfaced in the console as a warning (no PII).
   */
  async audit(
    action: AuditAction,
    targetType: AuditTarget,
    targetId: string,
    options: { label?: string; metadata?: Record<string, string | number | boolean | null>; facilityId?: string | null } = {},
  ): Promise<void> {
    const actor = this.a;
    try {
      await this.provider.create(
        'audit_logs',
        {
          id: newId('audit'),
          action,
          actorId: actor?.uid ?? 'system',
          actorName: actor?.displayName ?? 'System',
          actorRole: actor?.role ?? 'SYSTEM',
          targetType,
          targetId,
          targetLabel: options.label ?? null,
          facilityId: options.facilityId ?? actor?.facilityId ?? null,
          metadata: options.metadata,
          createdAt: now(),
        } as never,
        // Audit rows are written under a system actor so an ordinary user cannot
        // be blocked by their own read scope, but the entry still records who did it.
        actor ? { ...actor, role: 'ADMIN', facilityId: actor.facilityId } : null,
      );
    } catch (error) {
      console.warn('[mamacare] audit write failed for', action, toAppError(error).code);
    }
  }

  async notify(input: {
    userId: string;
    kind: NotificationKind;
    title: string;
    body: string;
    level?: 'info' | 'success' | 'warning' | 'critical';
    link?: string | null;
    motherId?: string | null;
    facilityId?: string | null;
    sms?: boolean;
  }): Promise<void> {
    const actor = this.a;
    await this.provider.create(
      'notifications',
      {
        id: newId('ntf'),
        userId: input.userId,
        kind: input.kind,
        title: input.title,
        body: input.body,
        level: input.level ?? 'info',
        link: input.link ?? null,
        motherId: input.motherId ?? null,
        facilityId: input.facilityId ?? null,
        sentAt: now(),
        createdBy: actor?.uid ?? 'system',
        createdByName: actor?.displayName ?? 'System',
        channels: { inApp: true, push: true, sms: input.sms ?? false },
      } as never,
      actor ? { ...actor, role: 'ADMIN' } : null,
    );
  }

  /** Notifies the clinical team at a facility (used for alerts and referrals). */
  async notifyFacilityTeam(facilityId: string, input: Parameters<DataLayer['notify']>[0] & { excludeUserId?: string }): Promise<number> {
    if (!facilityId) return 0;
    const { rows } = await this.provider.list(
      'users',
      { where: [{ field: 'facilityId', op: '==', value: facilityId }, { field: 'status', op: 'in', value: ['ACTIVE', 'PENDING_APPROVAL'] }] },
      { ...this.require(), role: 'ADMIN' },
    );
    const targets = rows
      .filter((user) => user.status === 'ACTIVE' && user.id !== input.excludeUserId && user.role !== 'MOTHER')
      .slice(0, 40);
    await Promise.all(targets.map((user) => this.notify({ ...input, userId: user.id })));
    return targets.length;
  }

  /* ── facilities ─────────────────────────────────────────────────── */

  async facilities(): Promise<Facility[]> {
    const { rows } = await this.list('facilities', { orderBy: { field: 'name', direction: 'asc' } });
    return rows.filter((facility) => facility.active);
  }

  async allFacilities(): Promise<Facility[]> {
    const { rows } = await this.list('facilities', { orderBy: { field: 'name', direction: 'asc' } });
    return rows;
  }

  async facilityName(id?: string | null): Promise<string> {
    if (!id) return 'Unassigned facility';
    const facility = await this.get('facilities', id);
    return facility?.name ?? 'Unknown facility';
  }

  async saveFacility(input: Partial<Facility> & { name: string; code: string; district: string; province: string }): Promise<Facility> {
    const actor = this.require();
    const payload: Partial<Facility> = {
      ...input,
      code: input.code.trim().toUpperCase(),
      updatedAt: now(),
    };
    if (input.id) {
      const saved = await this.update('facilities', input.id, payload);
      await this.audit('facility.updated', 'facility', input.id, { label: input.name });
      return saved;
    }
    const created = await this.create('facilities', {
      ...payload,
      id: newId('fac'),
      hasMaternityWard: input.hasMaternityWard ?? true,
      hasUltrasound: input.hasUltrasound ?? false,
      hasLaboratory: input.hasLaboratory ?? false,
      active: true,
      createdAt: now(),
      createdBy: actor.uid,
    } as never);
    await this.audit('facility.created', 'facility', created.id, { label: created.name });
    return created;
  }

  /* ── mothers ───────────────────────────────────────────────────── */

  /**
   * Registers a mother and her current pregnancy atomically, allocates the
   * canonical patient id, and (optionally) creates the linked patient login.
   * The database key is always a generated id — never her name.
   */
  async registerMother(input: {
    fullName: string;
    dateOfBirth?: string | null;
    ageYears?: number | null;
    phone: string;
    alternatePhone?: string | null;
    address?: string | null;
    community?: string | null;
    chiefName?: string | null;
    landmark?: string | null;
    emergencyContact?: { name?: string | null; relation?: string | null; phone?: string | null } | null;
    preferredLanguage: string;
    literacyLevel?: Mother['literacyLevel'];
    maritalStatus?: Mother['maritalStatus'];
    occupation?: string | null;
    husbandName?: string | null;
    husbandPhone?: string | null;
    bloodGroup?: string | null;
    allergies?: string | null;
    chronicConditions?: string[];
    registrationFacilityId: string;
    assignedChwUserId?: string | null;
    catchmentArea?: string | null;
    consent?: ConsentRecord | null;
    createPatientLogin?: boolean;
    patientLoginEmail?: string | null;
    pregnancy: {
      gravida: number;
      para?: number;
      livingChildren?: number | null;
      lmpDate?: string | null;
      eddDate?: string | null;
      datingMethod: Pregnancy['datingMethod'];
      confirmedAt?: string | null;
      gestationalWeeks?: number | null;
      gestationalDays?: number | null;
      previousCesarean: boolean;
      gestationCount: 1 | 2 | 3;
      previousComplications: string[];
      riskFactors: string[];
      notes?: string | null;
    };
  }): Promise<{ mother: Mother; pregnancy: Pregnancy; patientId: string }> {
    const actor = this.require();
    const pregnancyInput = input.pregnancy;

    const lmp = pregnancyInput.lmpDate || (pregnancyInput.eddDate ? lmpFromEdd(pregnancyInput.eddDate) : null);
    const edd = pregnancyInput.eddDate || (lmp ? eddFromLmp(lmp) : null);
    if (!lmp && !edd && !pregnancyInput.gestationalWeeks) {
      throw new AppError('Record the LMP, an estimated delivery date, or a measured gestational age.', 'VALIDATION');
    }
    if (pregnancyInput.datingMethod === 'LMP' && lmp && new Date(lmp).getTime() > Date.now()) {
      throw new AppError('The last menstrual period cannot be in the future.', 'VALIDATION');
    }

    const ga = gestationalAge({ lmpDate: lmp, eddDate: edd, documented: pregnancyInput.gestationalWeeks ? { weeks: pregnancyInput.gestationalWeeks, days: pregnancyInput.gestationalDays ?? 0, at: now() } : null });

    // Duplicate screening: same phone + same community + active record.
    const { rows: possibleDuplicates } = await this.list('mothers', {
      where: [{ field: 'phone', op: '==', value: input.phone.replace(/\s+/g, '') }],
    });
    if (possibleDuplicates.length > 0) {
      throw new AppError(
        `A mother with this phone number is already registered as ${possibleDuplicates[0]?.patientId}. Search by phone before creating a new record.`,
        'CONFLICT',
      );
    }

    const patientSequence = await this.provider.nextSequence('patientId');
    const patientId = `MC-${String(patientSequence).padStart(6, '0')}`;
    const motherId = newId('mot');
    const pregnancyId = newId('preg');

    const mother: NewRow<'mothers'> = {
      id: motherId,
      patientId,
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth ?? null,
      ageYears: input.ageYears ?? null,
      phone: input.phone.replace(/\s+/g, ''),
      alternatePhone: input.alternatePhone ?? null,
      address: input.address ?? null,
      community: input.community ?? null,
      chiefName: input.chiefName ?? null,
      landmark: input.landmark ?? null,
      emergencyContact: input.emergencyContact ?? null,
      preferredLanguage: input.preferredLanguage,
      literacyLevel: input.literacyLevel ?? null,
      maritalStatus: input.maritalStatus ?? null,
      occupation: input.occupation ?? null,
      husbandName: input.husbandName ?? null,
      husbandPhone: input.husbandPhone ?? null,
      bloodGroup: input.bloodGroup ?? null,
      allergies: input.allergies ?? null,
      chronicConditions: (input.chronicConditions ?? []) as Mother['chronicConditions'],
      registrationFacilityId: input.registrationFacilityId,
      careFacilityId: input.registrationFacilityId,
      assignedChwUserId: input.assignedChwUserId ?? actor.uid,
      catchmentArea: input.catchmentArea ?? null,
      consent: input.consent ?? null,
      status: 'ACTIVE',
      currentPregnancyId: pregnancyId,
      riskLevel: 'GREEN',
      gestationalSnapshot: ga.valid ? { weeks: ga.weeks, days: ga.days, asOf: now() } : null,
      eddSnapshot: edd ?? null,
      createdAt: now(),
      createdBy: actor.uid,
      createdByName: actor.displayName,
      updatedAt: now(),
    } as NewRow<'mothers'>;

    const pregnancy: NewRow<'pregnancies'> = {
      id: pregnancyId,
      motherId,
      facilityId: input.registrationFacilityId,
      parityNumber: Math.max(1, Number(pregnancyInput.gravida) || 1),
      status: 'ACTIVE',
      lmpDate: lmp,
      eddDate: edd ?? lmp ?? '',
      datingMethod: pregnancyInput.datingMethod,
      confirmedAt: pregnancyInput.confirmedAt ?? now(),
      bookedAt: now(),
      documentedGestationalAge: pregnancyInput.gestationalWeeks
        ? { weeks: pregnancyInput.gestationalWeeks, days: pregnancyInput.gestationalDays ?? 0, at: now() }
        : null,
      gravida: Number(pregnancyInput.gravida) || 1,
      para: Number(pregnancyInput.para ?? 0) || 0,
      livingChildren: pregnancyInput.livingChildren ?? null,
      gestationCount: pregnancyInput.gestationCount,
      isMultiple: pregnancyInput.gestationCount > 1,
      previousCesarean: pregnancyInput.previousCesarean,
      previousComplications: pregnancyInput.previousComplications as Pregnancy['previousComplications'],
      riskFactors: pregnancyInput.riskFactors as Pregnancy['riskFactors'],
      riskLevel: 'GREEN',
      notes: pregnancyInput.notes ?? null,
      outcome: 'ONGOING',
      createdAt: now(),
      createdBy: actor.uid,
      updatedAt: now(),
    } as NewRow<'pregnancies'>;

    await this.provider.transact(async (tx) => {
      tx.set('mothers', motherId, mother as RowOf<'mothers'>);
      tx.set('pregnancies', pregnancyId, pregnancy as RowOf<'pregnancies'>);
    });

    if (input.createPatientLogin && input.patientLoginEmail) {
      await this.create('users', {
        id: newId('usr'),
        email: input.patientLoginEmail.trim().toLowerCase(),
        fullName: input.fullName.trim(),
        phone: input.phone,
        role: 'MOTHER',
        status: 'ACTIVE',
        accountKind: 'PATIENT',
        motherId,
        facilityId: input.registrationFacilityId,
        emailVerified: false,
        privilegeVersion: 1,
        createdAt: now(),
        updatedAt: now(),
        createdBy: actor.uid,
      } as never).catch(() => {
        // An account invitation failure must not roll back the clinical record;
        // the mother can be linked later from her profile.
      });
    }

    // Booking visit is created automatically so the timeline always starts with
    // the registration encounter.
    await this.createVisit({
      motherId,
      pregnancyId,
      visitType: 'BOOKING',
      visitDate: toIsoDate(new Date()),
      reasonForVisit: 'Booking / registration visit',
      gestationalAge: { weeks: ga.weeks, days: ga.days },
      vitals: {},
      dangerSigns: { reported: [], noneReported: true },
      tests: [],
      medications: [{ id: newId('med'), name: 'Iron and folic acid', dose: 'as per facility protocol', frequency: 'daily' }],
      counselling: ['Birth preparedness', 'Danger signs explained'],
      note: 'Record created at registration.',
      nextAppointmentAt: edd || lmp ? new Date(`${suggestNextAppointment({ eddDate: edd, ga })}T09:00`) : undefined,
    }).catch(() => null);

    await this.audit('mother.registered', 'mother', motherId, {
      label: patientId,
      facilityId: input.registrationFacilityId,
      metadata: { gravida: pregnancyInput.gravida, edd: edd ?? 'not dated', patientLogin: input.createPatientLogin ? 'requested' : 'none' },
    });

    return { mother: mother as unknown as Mother, pregnancy: pregnancy as unknown as Pregnancy, patientId };
  }

  async updateMother(id: string, patch: Partial<Mother>): Promise<Mother> {
    const saved = await this.update('mothers', id, { ...patch, updatedAt: now() });
    await this.audit('mother.updated', 'mother', id, { label: saved.patientId, metadata: { fields: Object.keys(patch).length } });
    return saved;
  }

  async motherByPatientId(patientId: string): Promise<Mother | null> {
    const normalized = patientId.trim().toUpperCase();
    if (!isPatientId(normalized)) return null;
    const { rows } = await this.list('mothers', { where: [{ field: 'patientId', op: '==', value: normalized }], limit: 1 });
    return rows[0] ?? null;
  }

  /** Everything a mother's profile screen needs, fetched in parallel. */
  async motherChart(motherId: string): Promise<MotherChart> {
    const [mother, pregnancies, visits, appointments, alerts, referrals, documents, reports] = await Promise.all([
      this.get('mothers', motherId),
      this.list('pregnancies', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'createdAt', direction: 'desc' } }).then((r) => r.rows),
      this.list('anc_visits', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'visitDate', direction: 'desc' } }).then((r) => r.rows),
      this.list('appointments', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'scheduledFor', direction: 'asc' } }).then((r) => r.rows),
      this.list('alerts', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'openedAt', direction: 'desc' } }).then((r) => r.rows),
      this.list('referrals', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'createdAt', direction: 'desc' } }).then((r) => r.rows),
      this.list('documents', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'uploadedAt', direction: 'desc' } }).then((r) => r.rows),
      this.list('reports', { where: [{ field: 'motherId', op: '==', value: motherId }], orderBy: { field: 'generatedAt', direction: 'desc' } }).then((r) => r.rows),
    ]);
    if (!mother) throw new AppError('That mother record could not be found, or it belongs to another facility.', 'NOT_FOUND');
    const activePregnancy = pregnancies.find((row) => row.status === 'ACTIVE') ?? pregnancies[0] ?? null;
    return {
      mother,
      pregnancies,
      activePregnancy,
      visits,
      appointments,
      alerts,
      referrals,
      documents,
      reports,
    };
  }

  /* ── pregnancy ──────────────────────────────────────────────────── */

  async updatePregnancy(id: string, patch: Partial<Pregnancy>): Promise<Pregnancy> {
    const saved = await this.update('pregnancies', id, { ...patch, updatedAt: now(), updatedBy: this.a?.uid ?? null });
    if (patch.riskLevel) {
      await this.audit('pregnancy.risk_changed', 'pregnancy', id, { metadata: { level: patch.riskLevel } });
    } else {
      await this.audit('pregnancy.updated', 'pregnancy', id);
    }
    return saved;
  }

  /** Recomputes the pregnancy risk level from its profile + latest visit. */
  async reviewRisk(motherId: string, pregnancyId: string, vitals: Vitals, dangerSigns: string[]): Promise<RiskLevel> {
    const pregnancy = await this.get('pregnancies', pregnancyId);
    const mother = await this.get('mothers', motherId);
    const rules = await this.alertRules();
    const ga = gestationalAge({ lmpDate: pregnancy?.lmpDate ?? null, eddDate: pregnancy?.eddDate ?? null });
    const result = evaluateRules(
      rules,
      buildSnapshot({
        vitals,
        dangerSigns,
        gestationalWeeks: ga.valid ? ga.weeks : null,
        ageYears: mother?.ageYears ?? null,
        isMultiple: pregnancy?.isMultiple ?? false,
        previousCesarean: pregnancy?.previousCesarean ?? false,
        previousComplications: pregnancy?.previousComplications ?? [],
        riskFactors: pregnancy?.riskFactors ?? [],
      }),
    );
    const level = result.level;
    await this.update('pregnancies', pregnancyId, {
      riskLevel: level,
      riskReviewedAt: now(),
      riskReviewedBy: this.a?.uid ?? null,
    } as Partial<Pregnancy>);
    if (mother) {
      await this.update('mothers', motherId, { riskLevel: level } as Partial<Mother>);
    }
    return level;
  }

  /* ── ANC visits ─────────────────────────────────────────────────── */

  /**
   * Creates a visit, runs the configured alert rules against it, and persists
   * any resulting alerts plus the denormalised flags on the mother record.
   * A clientRef makes an offline retry idempotent.
   */
  async createVisit(input: {
    motherId: string;
    pregnancyId: string;
    visitDate: string;
    visitType: AncVisit['visitType'];
    reasonForVisit?: string | null;
    gestationalAge: { weeks: number; days: number };
    vitals: Vitals;
    dangerSigns: AncVisit['dangerSigns'];
    tests?: TestResult[];
    medications?: AncVisit['medications'];
    counselling?: string[];
    note?: string | null;
    outcome?: AncVisit['outcome'];
    nextAppointmentAt?: Date | string | null;
    clientRef?: string;
  }): Promise<{ visit: AncVisit; alerts: ClinicalAlert[]; riskLevel: RiskLevel }> {
    const actor = this.require();
    const clientRef = input.clientRef ?? newClientRef();
    const existing = await this.list('anc_visits', { where: [{ field: 'clientRef', op: '==', value: clientRef }], limit: 1 });
    if (existing.rows.length > 0) {
      return { visit: existing.rows[0] as AncVisit, alerts: [], riskLevel: existing.rows[0]?.riskLevelAfter ?? 'GREEN' };
    }

    const [mother, pregnancy, previousVisits, rules] = await Promise.all([
      this.get('mothers', input.motherId),
      this.get('pregnancies', input.pregnancyId),
      this.list('anc_visits', {
        where: [{ field: 'motherId', op: '==', value: input.motherId }],
        orderBy: { field: 'visitDate', direction: 'desc' },
        limit: 3,
      }).then((r) => r.rows),
      this.alertRules(),
    ]);
    if (!mother || !pregnancy) throw new AppError('The mother or pregnancy record could not be loaded.', 'NOT_FOUND');

    const visitId = newId('anc');
    const evaluation = evaluateRules(
      rules,
      buildSnapshot({
        vitals: input.vitals,
        dangerSigns: input.dangerSigns.reported,
        gestationalWeeks: input.gestationalAge.weeks,
        ageYears: mother.ageYears ?? null,
        isMultiple: pregnancy.isMultiple,
        previousCesarean: pregnancy.previousCesarean,
        previousComplications: pregnancy.previousComplications,
        riskFactors: pregnancy.riskFactors,
        weightPreviousKg: previousVisits[0]?.vitals?.weightKg ?? null,
      }),
    );

    const visit: NewRow<'anc_visits'> = {
      id: visitId,
      motherId: input.motherId,
      pregnancyId: input.pregnancyId,
      facilityId: mother.careFacilityId ?? mother.registrationFacilityId,
      visitNumber: (previousVisits[0]?.visitNumber ?? 0) + 1,
      visitDate: input.visitDate,
      visitType: input.visitType,
      reasonForVisit: input.reasonForVisit ?? null,
      gestationalAge: input.gestationalAge,
      vitals: input.vitals,
      dangerSigns: input.dangerSigns,
      tests: input.tests ?? [],
      medications: input.medications ?? [],
      counselling: input.counselling ?? [],
      note: input.note ?? null,
      nextAppointmentAt: input.nextAppointmentAt ? new Date(input.nextAppointmentAt).toISOString() : null,
      outcome: input.outcome ?? 'CONTINUE_CARE',
      riskLevelAfter: evaluation.level,
      alertIds: [],
      createdAt: now(),
      createdBy: actor.uid,
      createdByName: actor.displayName,
      clientRef,
    } as NewRow<'anc_visits'>;

    const drafts = toAlertDrafts(evaluation);
    const alerts: ClinicalAlert[] = [];

    await this.provider.transact(async (tx) => {
      tx.set('anc_visits', visitId, visit as RowOf<'anc_visits'>);
      for (const draft of drafts) {
        const alertId = newId('alt');
        const alert: ClinicalAlert = {
          id: alertId,
          motherId: input.motherId,
          motherName: mother.fullName,
          patientId: mother.patientId,
          pregnancyId: input.pregnancyId,
          visitId,
          facilityId: visit.facilityId as string,
          level: draft.level,
          category: draft.category,
          ruleKey: draft.ruleKey,
          ruleVersion: draft.ruleVersion,
          title: draft.title,
          message: draft.message,
          triggeredBy: draft.triggeredBy.map((finding) => ({ label: finding.label, value: finding.value ?? null, unit: finding.unit ?? null })),
          status: 'OPEN',
          actions: [],
          assignedUserId: null,
          assignedUserName: null,
          openedAt: now(),
          openedBy: actor.uid,
          openedByName: actor.displayName,
        };
        tx.set('alerts', alertId, alert);
        alerts.push(alert);
        visit.alertIds = [...(visit.alertIds ?? []), alertId];
      }
    });

    if (alerts.length > 0) {
      await this.update('anc_visits', visitId, { alertIds: visit.alertIds } as Partial<AncVisit>);
    }

    await this.update('mothers', input.motherId, {
      lastVisitAt: new Date(`${input.visitDate}T00:00:00`).toISOString(),
      nextAppointmentAt: visit.nextAppointmentAt ?? mother.nextAppointmentAt ?? null,
      riskLevel: evaluation.level,
      gestationalSnapshot: { weeks: input.gestationalAge.weeks, days: input.gestationalAge.days, asOf: now() },
    } as Partial<Mother>);

    await this.audit('anc_visit.created', 'anc_visit', visitId, {
      label: mother.patientId,
      facilityId: visit.facilityId as string,
      metadata: { visitType: input.visitType, alerts: alerts.length, level: evaluation.level },
    });
    for (const alert of alerts) {
      await this.audit('alert.created', 'alert', alert.id, { label: `${mother.patientId} · ${alert.title}`, metadata: { level: alert.level, rule: alert.ruleKey ?? 'manual' } });
    }

    if (alerts.length > 0) {
      const highest = alerts.some((alert) => alert.level === 'RED') ? 'RED' : 'AMBER';
      await this.notifyFacilityTeam(visit.facilityId as string, {
        userId: '',
        kind: 'NEW_ALERT',
        title: `${highest === 'RED' ? 'Red' : 'Amber'} alert — ${mother.patientId}`,
        body: `${alerts[0]?.title ?? 'Clinical finding'} recorded for ${mother.patientId} at this visit. Assessment and action required.`,
        level: highest === 'RED' ? 'critical' : 'warning',
        link: `/alerts?mother=${input.motherId}`,
        motherId: input.motherId,
        facilityId: visit.facilityId as string,
        excludeUserId: actor.uid,
      }).catch(() => 0);
    }

    return { visit: visit as unknown as AncVisit, alerts, riskLevel: evaluation.level };
  }

  async updateVisit(id: string, patch: Partial<AncVisit>): Promise<AncVisit> {
    const saved = await this.update('anc_visits', id, { ...patch, updatedAt: now(), updatedBy: this.a?.uid ?? null });
    await this.audit('anc_visit.updated', 'anc_visit', id, { metadata: { fields: Object.keys(patch).length } });
    return saved;
  }

  async deleteVisit(id: string): Promise<void> {
    await this.remove('anc_visits', id);
    await this.audit('anc_visit.updated', 'anc_visit', id, { metadata: { action: 'corrected' } });
  }

  /* ── alerts ─────────────────────────────────────────────────────── */

  async alertRules(): Promise<AlertRule[]> {
    try {
      const { rows } = await this.list('alert_rules', { where: [{ field: 'enabled', op: '==', value: true }] });
      return rows.length > 0 ? rows : DEFAULT_ALERT_RULES;
    } catch {
      return DEFAULT_ALERT_RULES;
    }
  }

  async createManualAlert(input: {
    motherId: string;
    level: 'RED' | 'AMBER';
    category: ClinicalAlert['category'];
    title: string;
    message: string;
    assignedUserId?: string | null;
    triggeredBy?: ClinicalAlert['triggeredBy'];
    visitId?: string | null;
  }): Promise<ClinicalAlert> {
    const actor = this.require();
    const mother = await this.get('mothers', input.motherId);
    if (!mother) throw new AppError('Select a registered mother before recording an alert.', 'VALIDATION');
    const pregnancyId = mother.currentPregnancyId ?? '';

    const alert: NewRow<'alerts'> = {
      id: newId('alt'),
      motherId: mother.id,
      motherName: mother.fullName,
      patientId: mother.patientId,
      pregnancyId,
      visitId: input.visitId ?? null,
      facilityId: mother.careFacilityId ?? mother.registrationFacilityId,
      level: input.level,
      category: input.category,
      ruleKey: null,
      title: input.title.trim(),
      message: input.message.trim(),
      triggeredBy: input.triggeredBy ?? [],
      status: 'OPEN',
      actions: [],
      assignedUserId: input.assignedUserId ?? null,
      assignedUserName: null,
      openedAt: now(),
      openedBy: actor.uid,
      openedByName: actor.displayName,
    } as NewRow<'alerts'>;

    const created = await this.create('alerts', alert);

    if (mother.riskLevel !== 'RED' || input.level === 'RED') {
      await this
        .update('mothers', mother.id, {
          riskLevel: input.level === 'RED' ? 'RED' : mother.riskLevel === 'RED' ? 'RED' : 'AMBER',
        } as Partial<Mother>)
        .catch(() => null);
    }

    await this.audit('alert.created', 'alert', created.id, {
      label: `${mother.patientId} · ${created.title}`,
      metadata: { level: created.level, manual: true },
    });
    await this.notifyFacilityTeam(created.facilityId, {
      userId: '',
      kind: 'NEW_ALERT',
      title: `${input.level === 'RED' ? 'Red' : 'Amber'} alert raised for ${mother.patientId}`,
      body: created.message,
      level: input.level === 'RED' ? 'critical' : 'warning',
      link: `/alerts`,
      motherId: mother.id,
      facilityId: created.facilityId,
    }).catch(() => 0);

    return created;
  }

  async recordAlertAction(
    alertId: string,
    input: { status: Exclude<ClinicalAlert['status'], 'OPEN'>; note: string; followUpDate?: string | null },
  ): Promise<ClinicalAlert> {
    const actor = this.require();
    const alert = await this.get('alerts', alertId);
    if (!alert) throw new AppError('That alert could not be found.', 'NOT_FOUND');
    const actions = [
      ...alert.actions,
      { status: input.status, note: input.note.trim(), byUserId: actor.uid, byName: actor.displayName, at: now(), facilityId: actor.facilityId },
    ];
    const saved = await this.update('alerts', alertId, {
      status: input.status,
      actions,
      assignedUserId: alert.assignedUserId ?? actor.uid,
      assignedUserName: alert.assignedUserName ?? actor.displayName,
      outcomeNote: input.note.trim(),
      resolvedAt: input.status === 'RESOLVED' ? now() : alert.resolvedAt ?? null,
      updatedAt: now(),
    } as Partial<ClinicalAlert>);

    await this.audit(input.status === 'RESOLVED' ? 'alert.resolved' : 'alert.updated', 'alert', alertId, {
      label: alert.patientId,
      metadata: { status: input.status, level: alert.level },
    });

    if (input.status === 'RESOLVED') {
      const siblings = await this.list('alerts', {
        where: [
          { field: 'motherId', op: '==', value: alert.motherId },
          { field: 'status', op: '!=', value: 'RESOLVED' },
        ],
      });
      if (siblings.total === 0) {
        await this.update('mothers', alert.motherId, { riskLevel: 'GREEN' } as Partial<Mother>).catch(() => null);
      }
    }
    if (input.followUpDate) {
      await this.createAppointment({
        motherId: alert.motherId,
        scheduledFor: input.followUpDate,
        time: '09:00',
        facilityId: alert.facilityId,
        type: 'FOLLOW_UP',
        reason: `Follow-up for alert: ${alert.title}`,
        notes: input.note,
      }).catch(() => null);
    }
    return saved;
  }

  async assignAlert(alertId: string, userId: string, userName: string): Promise<void> {
    await this.update('alerts', alertId, { assignedUserId: userId, assignedUserName: userName } as Partial<ClinicalAlert>);
    await this.audit('alert.assigned', 'alert', alertId, { metadata: { assignee: userName } });
    await this.notify({
      userId,
      kind: 'NEW_ALERT',
      title: 'An alert is assigned to you',
      body: 'Open the alert to record your assessment and action taken.',
      level: 'warning',
      link: '/alerts',
    }).catch(() => null);
  }

  /* ── appointments ────────────────────────────────────────────────── */

  async createAppointment(input: {
    motherId: string;
    pregnancyId?: string | null;
    scheduledFor: string;
    time: string;
    facilityId?: string | null;
    type: Appointment['type'];
    reason?: string | null;
    notes?: string | null;
    assignedUserId?: string | null;
    assignedUserName?: string | null;
    durationMinutes?: number;
    reminderDays?: number[];
    smsEnabled?: boolean;
  }): Promise<Appointment> {
    const actor = this.require();
    const mother = await this.get('mothers', input.motherId);
    if (!mother) throw new AppError('Select a registered mother first.', 'VALIDATION');
    const settings = await this.settings();
    const scheduledFor = input.scheduledFor;
    const conflict = await this.list('appointments', {
      where: [
        { field: 'motherId', op: '==', value: input.motherId },
        { field: 'scheduledFor', op: '==', value: scheduledFor },
        { field: 'time', op: '==', value: input.time },
        { field: 'status', op: 'in', value: ['SCHEDULED', 'CONFIRMED'] },
      ],
      limit: 1,
    });
    if (conflict.rows.length > 0) {
      throw new AppError('This mother already has an appointment at that date and time.', 'CONFLICT');
    }

    const appointment = await this.create('appointments', {
      id: newId('apt'),
      motherId: mother.id,
      patientId: mother.patientId,
      motherName: mother.fullName,
      pregnancyId: input.pregnancyId ?? mother.currentPregnancyId ?? null,
      facilityId: input.facilityId ?? mother.careFacilityId ?? mother.registrationFacilityId,
      scheduledFor,
      time: input.time,
      durationMinutes: input.durationMinutes ?? 30,
      type: input.type,
      status: 'SCHEDULED',
      reason: input.reason ?? null,
      notes: input.notes ?? null,
      assignedUserId: input.assignedUserId ?? null,
      assignedUserName: input.assignedUserName ?? null,
      reminderDays: input.reminderDays ?? settings.reminderDaysDefault,
      remindersSent: {},
      smsEnabled: input.smsEnabled ?? settings.smsEnabled,
      createdByName: actor.displayName,
      createdAt: now(),
      createdBy: actor.uid,
    } as never) as Appointment;

    await this.update('mothers', mother.id, { nextAppointmentAt: new Date(`${scheduledFor}T${input.time || '09:00'}:00`).toISOString() } as Partial<Mother>).catch(() => null);
    await this.audit('appointment.created', 'appointment', appointment.id, {
      label: mother.patientId,
      facilityId: appointment.facilityId,
      metadata: { type: appointment.type, date: scheduledFor },
    });
    await this.notify({
      userId: mother.userId ?? '',
      kind: 'APPOINTMENT_REMINDER',
      title: 'Appointment scheduled',
      body: `${formatDate(scheduledFor, 'long')} at ${appointment.time} — ${input.type.replace(/_/g, ' ').toLowerCase()}.`,
      level: 'info',
      link: '/appointments',
      motherId: mother.id,
    }).catch(() => null);
    if (input.assignedUserId) {
      await this.notify({
        userId: input.assignedUserId,
        kind: 'APPOINTMENT_REMINDER',
        title: `Appointment assigned — ${mother.patientId}`,
        body: `${formatDate(scheduledFor)} at ${appointment.time}.`,
        level: 'info',
        link: '/appointments',
        motherId: mother.id,
      }).catch(() => null);
    }
    return appointment;
  }

  async setAppointmentStatus(id: string, status: AppointmentStatus, options: { note?: string; visitId?: string | null } = {}): Promise<Appointment> {
    const actor = this.require();
    const appointment = await this.get('appointments', id);
    if (!appointment) throw new AppError('That appointment could not be found.', 'NOT_FOUND');
    const saved = await this.update('appointments', id, {
      status,
      notes: options.note ? `${appointment.notes ? `${appointment.notes}\n` : ''}${options.note}` : appointment.notes,
      completedVisitId: options.visitId ?? appointment.completedVisitId ?? null,
      updatedBy: actor.uid,
      cancelledReason: status === 'CANCELLED' ? options.note ?? 'Cancelled by clinic' : appointment.cancelledReason ?? null,
    } as Partial<Appointment>);
    await this.audit('appointment.status_changed', 'appointment', id, { label: appointment.patientId, metadata: { status } });
    await this.notify({
      userId: (await this.get('mothers', appointment.motherId))?.userId ?? '',
      kind: 'APPOINTMENT_REMINDER',
      title: `Appointment ${status.toLowerCase()}`,
      body: `${appointment.type.replace(/_/g, ' ')} on ${formatDate(appointment.scheduledFor)}`,
      level: status === 'MISSED' ? 'warning' : 'info',
      link: '/appointments',
      motherId: appointment.motherId,
    }).catch(() => null);

    // A missed ANC visit is a follow-up risk: raise an amber alert once.
    if (status === 'MISSED') {
      const existing = await this.list('alerts', {
        where: [
          { field: 'motherId', op: '==', value: appointment.motherId },
          { field: 'category', op: '==', value: 'MISSED_VISIT' },
          { field: 'status', op: '!=', value: 'RESOLVED' },
        ],
        limit: 1,
      });
      if (existing.rows.length === 0) {
        await this.createManualAlert({
          motherId: appointment.motherId,
          level: 'AMBER',
          category: 'MISSED_VISIT',
          title: 'Missed appointment',
          message: `A scheduled ${appointment.type.toLowerCase().replace(/_/g, ' ')} was marked as missed. Follow-up contact is required to re-engage the mother.`,
          triggeredBy: [{ label: 'Appointment date', value: appointment.scheduledFor, unit: null }],
        }).catch(() => null);
      }
    }
    return saved;
  }

  /**
   * Flags every past-dated scheduled review as missed and tells the mother.
   *
   * Idempotent: a review is only written once, and the "Missed Review" message
   * is recorded against the appointment so a repeated sweep — several devices,
   * several days, a retried job — never sends it twice.
   */
  async sweepMissedAppointments(facilityId?: string | null): Promise<{ updated: number; notified: number }> {
    const today = todayIso();
    const { rows } = await this.list('appointments', {
      where: [
        { field: 'status', op: 'in', value: ['SCHEDULED', 'CONFIRMED'] },
        { field: 'scheduledFor', op: '<', value: today },
      ],
    });
    let updated = 0;
    let notified = 0;
    for (const appointment of rows) {
      if (facilityId && appointment.facilityId !== facilityId) continue;
      await this.setAppointmentStatus(appointment.id, 'MISSED', {
        note: 'Automatically flagged: the scheduled date passed with no recorded outcome.',
      });
      updated += 1;

      // `setAppointmentStatus` raises the follow-up alert and sends a status
      // change message. The mother's own wording is sent here, once.
      const missedKey = 'missed';
      if (!appointment.remindersSent?.[missedKey]) {
        const [mother, facility] = await Promise.all([
          this.get('mothers', appointment.motherId),
          appointment.facilityId ? this.get('facilities', appointment.facilityId) : Promise.resolve(null),
        ]);
        const message = missedMessage(appointment, facility?.name ?? null);
        await this.notify({
          userId: mother?.userId ?? '',
          kind: 'APPOINTMENT_REMINDER',
          title: message.title,
          body: message.body,
          level: 'warning',
          link: '/appointments',
          motherId: appointment.motherId,
          sms: appointment.smsEnabled,
        }).catch(() => null);
        await this.update('appointments', appointment.id, {
          remindersSent: { ...(appointment.remindersSent ?? {}), [missedKey]: now() },
        } as Partial<Appointment>).catch(() => null);
        notified += 1;
      }
      if (updated >= 50) break;
    }
    return { updated, notified };
  }

  /**
   * Sends the reminders that are due today.
   *
   * A review due today always reminds (lead 0) in addition to whatever lead
   * times the appointment carries. Each lead is recorded so it fires once.
   */
  async sendDueReminders(facilityId?: string | null): Promise<{ sent: number }> {
    const today = new Date();
    const { rows } = await this.list('appointments', {
      where: [{ field: 'status', op: 'in', value: ['SCHEDULED', 'CONFIRMED'] }],
    });
    let sent = 0;
    for (const appointment of rows) {
      if (facilityId && appointment.facilityId !== facilityId) continue;
      if (reviewStatus(appointment, today) === 'MISSED') continue;
      const lead = daysBetween(today, new Date(appointment.scheduledFor));
      for (const reminder of reminderLeads(appointment)) {
        if (lead !== reminder) continue;
        const key = reminderKey(reminder);
        if (appointment.remindersSent?.[key]) continue;
        const mother = await this.get('mothers', appointment.motherId);
        const message = reminderMessage(appointment);
        await this.notify({
          userId: mother?.userId ?? '',
          kind: 'APPOINTMENT_REMINDER',
          title: message.title,
          body: message.body,
          level: reminder === 0 ? 'warning' : 'info',
          link: '/appointments',
          motherId: appointment.motherId,
          sms: appointment.smsEnabled,
        }).catch(() => null);
        await this.update('appointments', appointment.id, {
          remindersSent: { ...(appointment.remindersSent ?? {}), [key]: now() },
        } as Partial<Appointment>).catch(() => null);
        await this.audit('appointment.reminder_sent', 'appointment', appointment.id, {
          label: appointment.patientId,
          metadata: { leadDays: reminder, review: reviewLabel(appointment.type) },
        }).catch(() => null);
        sent += 1;
      }
    }
    return { sent };
  }

  /**
   * Automatic reminder pass: mark what was missed, then send what is due.
   *
   * Safe to call as often as you like — from the dashboard, from a device that
   * just came back online, or from the scheduled Cloud Function. Every write is
   * guarded by a per-appointment key, so two overlapping passes cannot double
   * notify a mother.
   */
  async runReminderPass(facilityId?: string | null): Promise<{ missed: number; missedNotified: number; reminders: number }> {
    const [sweep, reminders] = await Promise.all([
      this.sweepMissedAppointments(facilityId).catch(() => ({ updated: 0, notified: 0 })),
      this.sendDueReminders(facilityId).catch(() => ({ sent: 0 })),
    ]);
    return { missed: sweep.updated, missedNotified: sweep.notified, reminders: reminders.sent };
  }

  /** Reviews bucketed by lifecycle status, derived from the calendar. */
  async reviewBoard(facilityId?: string | null): Promise<{
    today: Appointment[];
    upcoming: Appointment[];
    missed: Appointment[];
    completed: Appointment[];
  }> {
    const { rows } = await this.list('appointments', {
      where: facilityId ? [{ field: 'facilityId', op: '==', value: facilityId }] : [],
      orderBy: { field: 'scheduledFor', direction: 'asc' },
      limit: 500,
    });
    const today = new Date();
    const board = { today: [] as Appointment[], upcoming: [] as Appointment[], missed: [] as Appointment[], completed: [] as Appointment[] };
    for (const appointment of rows) {
      switch (reviewStatus(appointment, today)) {
        case 'TODAY':
          board.today.push(appointment);
          break;
        case 'UPCOMING':
          board.upcoming.push(appointment);
          break;
        case 'MISSED':
          board.missed.push(appointment);
          break;
        case 'COMPLETED':
          board.completed.push(appointment);
          break;
        default:
          break;
      }
    }
    return board;
  }

  /* ── referrals ─────────────────────────────────────────────────── */

  async createReferral(input: {
    motherId: string;
    reason: string;
    clinicalQuestion?: string | null;
    urgency: Referral['urgency'];
    scheduledAt: string;
    time?: string;
    originFacilityId: string;
    receivingFacilityId: string;
    transport: Referral['transport'];
    transportNote?: string | null;
    clinicalNotes: string;
    vitalSnapshot?: Vitals | null;
    followUpDueAt?: string | null;
  }): Promise<Referral> {
    const actor = this.require();
    if (input.originFacilityId !== actor.facilityId && actor.role !== 'ADMIN') {
      throw new AppError('Referrals can only be issued from the facility you work at.', 'FORBIDDEN');
    }
    if (input.originFacilityId === input.receivingFacilityId) {
      throw new AppError('The receiving facility must be different from the referring facility.', 'VALIDATION');
    }
    const mother = await this.get('mothers', input.motherId);
    if (!mother) throw new AppError('Select a registered mother before referring.', 'VALIDATION');

    const referral = (await this.create('referrals', {
      id: newId('ref'),
      motherId: mother.id,
      patientId: mother.patientId,
      motherName: mother.fullName,
      pregnancyId: mother.currentPregnancyId ?? null,
      originFacilityId: input.originFacilityId,
      receivingFacilityId: input.receivingFacilityId,
      reason: input.reason.trim(),
      clinicalQuestion: input.clinicalQuestion ?? null,
      urgency: input.urgency,
      scheduledAt: new Date(`${input.scheduledAt}T${input.time || '09:00'}:00`).toISOString(),
      transport: input.transport,
      transportNote: input.transportNote ?? null,
      clinicalNotes: input.clinicalNotes.trim(),
      vitalSnapshot: input.vitalSnapshot ?? null,
      status: 'ACTIVE',
      statusHistory: [
        { status: 'ACTIVE', at: now(), byUserId: actor.uid, byName: actor.displayName, note: 'Referral created', facilityId: input.originFacilityId },
      ],
      createdAt: now(),
      createdBy: actor.uid,
      createdByName: actor.displayName,
      followUpRequired: true,
      followUpDueAt: input.followUpDueAt ?? null,
    } as never)) as Referral;

    await this.audit('referral.created', 'referral', referral.id, {
      label: mother.patientId,
      facilityId: input.originFacilityId,
      metadata: { urgency: input.urgency, receiving: input.receivingFacilityId },
    });
    await this.notifyFacilityTeam(input.receivingFacilityId, {
      userId: '',
      kind: 'REFERRAL_UPDATE',
      title: `${input.urgency === 'EMERGENCY' ? 'Emergency' : 'New'} referral received`,
      body: `${mother.patientId} — ${input.reason}`,
      level: input.urgency === 'EMERGENCY' ? 'critical' : 'warning',
      link: '/referrals',
      motherId: mother.id,
      facilityId: input.receivingFacilityId,
    }).catch(() => 0);
    await this.notify({
      userId: mother.userId ?? '',
      kind: 'REFERRAL_UPDATE',
      title: 'You have been referred',
      body: `Please attend ${await this.facilityName(input.receivingFacilityId)} on ${formatDate(input.scheduledAt, 'long')}.`,
      level: 'info',
      link: '/referrals',
      motherId: mother.id,
    }).catch(() => null);

    return referral;
  }

  async updateReferralStatus(id: string, status: ReferralStatus, note?: string | null): Promise<Referral> {
    const actor = this.require();
    const referral = await this.get('referrals', id);
    if (!referral) throw new AppError('That referral could not be found.', 'NOT_FOUND');
    const history = [
      ...referral.statusHistory,
      { status, at: now(), byUserId: actor.uid, byName: actor.displayName, note: note ?? null, facilityId: actor.facilityId },
    ];
    const saved = await this.update('referrals', id, {
      status,
      statusHistory: history,
      closedAt: status === 'CLOSED' ? now() : referral.closedAt ?? null,
      followUpRequired: status === 'FOLLOW_UP_REQUIRED' ? true : referral.followUpRequired ?? false,
      feedbackNote: note ?? referral.feedbackNote ?? null,
      updatedAt: now(),
    } as Partial<Referral>);

    await this.audit('referral.status_changed', 'referral', id, { label: referral.patientId, metadata: { status } });
    await this.notifyFacilityTeam(referral.originFacilityId, {
      userId: '',
      kind: 'REFERRAL_UPDATE',
      title: `Referral update — ${referral.patientId}`,
      body: `${status.replace(/_/g, ' ').toLowerCase()}${note ? `: ${note}` : ''}`,
      level: status === 'ADMISSION' ? 'warning' : 'info',
      link: '/referrals',
      motherId: referral.motherId,
      facilityId: referral.originFacilityId,
    }).catch(() => 0);
    return saved;
  }

  async addReferralFeedback(id: string, feedback: string, followUpDueAt?: string | null): Promise<Referral> {
    const referral = await this.get('referrals', id);
    if (!referral) throw new AppError('That referral could not be found.', 'NOT_FOUND');
    const saved = await this.update('referrals', id, {
      feedbackNote: feedback.trim(),
      followUpDueAt: followUpDueAt ?? referral.followUpDueAt ?? null,
      followUpRequired: Boolean(followUpDueAt) || referral.followUpRequired || false,
      updatedAt: now(),
    } as Partial<Referral>);
    await this.audit('referral.feedback_added', 'referral', id, { label: referral.patientId });
    return saved;
  }

  /* ── documents & reports ────────────────────────────────────────── */

  async registerDocument(
    input: Omit<NewRow<'documents'>, 'id' | 'uploadedAt' | 'uploadedBy' | 'uploadedByName'> & { id?: string },
  ): Promise<DocumentRecord> {
    const actor = this.require();
    const created = (await this.create('documents', {
      ...input,
      id: input.id ?? newId('doc'),
      uploadedAt: now(),
      uploadedBy: actor.uid,
      uploadedByName: actor.displayName,
    })) as DocumentRecord;
    await this.audit('document.uploaded', 'document', created.id, {
      label: created.name,
      facilityId: created.facilityId ?? actor.facilityId,
      metadata: { category: created.category, bytes: created.sizeBytes },
    });
    return created;
  }

  async touchDocumentAccess(id: string): Promise<void> {
    await this.update('documents', id, { lastAccessedAt: now(), lastAccessedBy: this.a?.uid ?? null } as Partial<DocumentRecord>).catch(() => null);
    await this.audit('document.accessed', 'document', id, { metadata: { via: 'viewer' } });
  }

  async registerReport(
    input: Omit<NewRow<'reports'>, 'id' | 'generatedAt' | 'generatedBy' | 'generatedByName'> & { id?: string },
  ): Promise<ReportRecord> {
    const actor = this.require();
    const created = (await this.create('reports', {
      ...input,
      id: input.id ?? newId('rpt'),
      generatedAt: now(),
      generatedBy: actor.uid,
      generatedByName: actor.displayName,
    })) as ReportRecord;
    await this.audit('report.generated', 'report', created.id, {
      label: created.title,
      facilityId: created.facilityId ?? actor.facilityId,
      metadata: { type: created.type, rows: created.rowCount ?? null },
    });
    return created;
  }

  /* ── users, roles & settings ────────────────────────────────────── */

  async settings(): Promise<SystemSettings> {
    const existing = await this.provider.get('settings', 'app', null);
    if (existing) return existing;
    const fallback: SystemSettings = {
      id: 'app',
      patientIdPrefix: 'MC',
      patientIdSequence: 0,
      reminderDaysDefault: [7, 1],
      smsEnabled: false,
      pushEnabled: true,
      registrationRequiresApproval: true,
      defaultLanguage: 'English',
      bootstrapAdminEmails: [],
      clinicalRulesVersion: DEFAULT_ALERT_RULES[0]?.version ?? 1,
      clinicalRulesReviewedBy: null,
      clinicalRulesReviewedAt: null,
      dataRetentionPolicy: 'Records are retained for 10 years per national health-records guidance.',
      allowPatientAccountSelfRegistration: true,
      updatedAt: now(),
      updatedBy: 'system',
    };
    await this.provider.create('settings', fallback as never, { ...this.require(), role: 'ADMIN' }).catch(() => null);
    return fallback;
  }

  async saveSettings(patch: Partial<SystemSettings>): Promise<SystemSettings> {
    const current = await this.settings();
    const saved = await this.provider.update('settings', 'app', { ...current, ...patch, updatedAt: now(), updatedBy: this.require().uid } as never, {
      ...this.require(),
      role: 'ADMIN',
    });
    await this.audit('settings.updated', 'settings', 'app', { metadata: { keys: Object.keys(patch).join(',') } });
    return saved;
  }

  async approveUser(uid: string, role: Role, facilityId: string | null): Promise<void> {
    await this.update('users', uid, { status: 'ACTIVE', role, facilityId, privilegeVersion: Date.now() } as never);
    await this.audit('user.access_approved', 'user', uid, { metadata: { role } });
    await this.notify({
      userId: uid,
      kind: 'ACCOUNT',
      title: 'Your account has been approved',
      body: 'You now have access according to your assigned role and facility.',
      level: 'success',
      link: '/dashboard',
    });
  }

  async saveEducationResource(input: Partial<EducationResource> & { title: string; summary: string; body: string }): Promise<EducationResource> {
    const actor = this.require();
    if (input.id) {
      const saved = await this.update('education', input.id, { ...input, updatedAt: now() } as Partial<EducationResource>);
      return saved;
    }
    const created = (await this.create('education', {
      id: newId('edu'),
      title: input.title,
      summary: input.summary,
      body: input.body,
      topics: input.topics ?? [],
      language: input.language ?? 'English',
      audience: input.audience ?? ['MOTHER'],
      stage: input.stage ?? 'GENERAL',
      coverImageUrl: input.coverImageUrl ?? null,
      coverImagePublicId: input.coverImagePublicId ?? null,
      readingMinutes: input.readingMinutes ?? Math.max(1, Math.round(input.body.split(/\s+/).length / 200)),
      status: input.status ?? 'DRAFT',
      facilityId: input.facilityId ?? null,
      createdAt: now(),
      updatedAt: now(),
      createdBy: actor.uid,
      createdByName: actor.displayName,
    })) as EducationResource;
    await this.audit('settings.updated', 'notification', created.id, { metadata: { kind: 'education', status: created.status } });
    return created;
  }

  async listEducation(audience: 'MOTHER' | 'HEALTH_WORKER', facilityId?: string | null): Promise<EducationResource[]> {
    const { rows } = await this.list('education', { orderBy: { field: 'updatedAt', direction: 'desc' } });
    return rows.filter(
      (row) =>
        (row.status === 'PUBLISHED' || audience === 'HEALTH_WORKER') &&
        row.audience.includes(audience) &&
        (!row.facilityId || !facilityId || row.facilityId === facilityId),
    );
  }

  async readEducation(id: string): Promise<void> {
    // Only a counter is touched; the resource body is never copied per reader.
    await this.update('education', id, { updatedAt: now() } as Partial<EducationResource>).catch(() => null);
  }

  /* ── derived views ──────────────────────────────────────────────── */

  /** Roster of mothers for the active scope, with derived dating. */
  async motherRoster(facilityId: string | null): Promise<Mother[]> {
    const spec: QuerySpec = facilityId
      ? { where: [{ field: 'registrationFacilityId', op: '==', value: facilityId }], orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 400 }
      : { orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 400 };
    const { rows } = await this.list('mothers', spec);
    return rows;
  }

  async appointmentsFor(scope: { facilityId: string | null; motherIds?: string[] }): Promise<Appointment[]> {
    const filters: QuerySpec['where'] = [];
    if (scope.motherIds?.length) filters.push({ field: 'motherId', op: 'in', value: scope.motherIds });
    else if (scope.facilityId) filters.push({ field: 'facilityId', op: '==', value: scope.facilityId });
    const { rows } = await this.list('appointments', {
      where: filters.length ? filters : undefined,
      orderBy: { field: 'scheduledFor', direction: 'asc' },
      limit: 600,
    });
    return rows;
  }

  async openAlerts(facilityId: string | null): Promise<ClinicalAlert[]> {
    const filters: QuerySpec['where'] = [{ field: 'status', op: 'in', value: ['OPEN', 'ACKNOWLEDGED', 'ASSESSED', 'REFERRED', 'FOLLOW_UP_REQUIRED'] }];
    if (facilityId) filters.push({ field: 'facilityId', op: '==', value: facilityId });
    const { rows } = await this.list('alerts', { where: filters, orderBy: { field: 'openedAt', direction: 'desc' }, limit: 300 });
    return rows;
  }

  async activeReferrals(facilityId: string | null): Promise<Referral[]> {
    const { rows } = await this.list('referrals', { orderBy: { field: 'scheduledAt', direction: 'desc' }, limit: 300 });
    return rows.filter(
      (row) =>
        row.status !== 'CLOSED' &&
        (!facilityId || row.originFacilityId === facilityId || row.receivingFacilityId === facilityId),
    );
  }
}

export interface MotherChart {
  mother: Mother;
  pregnancies: Pregnancy[];
  activePregnancy: Pregnancy | null;
  visits: AncVisit[];
  appointments: Appointment[];
  alerts: ClinicalAlert[];
  referrals: Referral[];
  documents: DocumentRecord[];
  reports: ReportRecord[];
}

export const nextWeek = (from = new Date()): string => toIsoDate(addDays(from, 7));

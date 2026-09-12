/**
 * Domain model — the single source of truth for every stored record.
 *
 * Rules enforced by this model:
 *  • Every document is keyed by an opaque unique id. Names, phones and emails
 *    are NEVER keys (see `id` + `patientId` on Mother).
 *  • Every record carries actor + timestamp provenance for auditability.
 *  • Clinical values are stored as observed numbers/flags; interpretation lives
 *    in the alert engine, never in the record itself.
 */

/* ── Identity & access ───────────────────────────────────────────────── */

export const ROLES = [
  'ADMIN',
  'FACILITY_SUPERVISOR',
  'MIDWIFE',
  'NURSE',
  'COMMUNITY_HEALTH_WORKER',
  'MOTHER',
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrator',
  FACILITY_SUPERVISOR: 'Facility supervisor',
  MIDWIFE: 'Midwife',
  NURSE: 'Nurse',
  COMMUNITY_HEALTH_WORKER: 'Community health worker',
  MOTHER: 'Mother / patient',
};

export const CLINICAL_ROLES: readonly Role[] = [
  'FACILITY_SUPERVISOR',
  'MIDWIFE',
  'NURSE',
  'COMMUNITY_HEALTH_WORKER',
] as const;

export const HEALTH_WORKER_ROLES: readonly Role[] = [
  'ADMIN',
  'FACILITY_SUPERVISOR',
  'MIDWIFE',
  'NURSE',
  'COMMUNITY_HEALTH_WORKER',
] as const;

export type AccountStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED';
export type AccountKind = 'HEALTH_WORKER' | 'PATIENT';

/** Custom claims issued by the server; mirrored on `users/{uid}` for queries. */
export interface AuthClaims {
  role: Role;
  facilityId?: string | null;
  accountStatus?: AccountStatus;
  motherId?: string | null;
  /** Bumped whenever privileges change so stale tokens can be rejected. */
  privilegeVersion?: number;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  status: AccountStatus;
  accountKind: AccountKind;
  /** Only meaningful while status is PENDING_APPROVAL. */
  requestedRole?: Role | null;
  facilityId?: string | null;
  motherId?: string | null;
  title?: string | null;
  licenseNumber?: string | null;
  photoUrl?: string | null;
  photoPublicId?: string | null;
  emailVerified: boolean;
  /** Server-managed; incremented with every privilege change. */
  privilegeVersion: number;
  pushEnabled?: boolean;
  /**
   * ISO 3166-1 alpha-2 country. Zambia is the default for this deployment; the
   * value is stored per account so reminders, dialling codes and currency are
   * unambiguous without duplicating a country field elsewhere on the profile.
   */
  country?: string | null;
  /** Preferred language for reminders and reading (e.g. English, Nyanja, Bemba). */
  preferredLanguage?: string | null;
  createdAt: string;
  createdBy?: string | null;
  updatedAt: string;
  updatedBy?: string | null;
  lastLoginAt?: string | null;
  deactivatedAt?: string | null;
  deactivatedBy?: string | null;
  deactivationReason?: string | null;
}

export interface DeviceToken {
  id: string;
  userId: string;
  token: string;
  platform: string;
  userAgent?: string;
  permission: 'granted' | 'denied' | 'default';
  createdAt: string;
  updatedAt: string;
  lastSeenAt: string;
}

/* ── Facilities ──────────────────────────────────────────────────────── */

export const FACILITY_TYPES = [
  'DISTRICT_HOSPITAL',
  'PROVINCIAL_HOSPITAL',
  'HEALTH_CENTRE',
  'CLINIC',
  'MATERNITY_HOME',
  'HEALTH_POST',
] as const;
export type FacilityType = (typeof FACILITY_TYPES)[number];

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  DISTRICT_HOSPITAL: 'District hospital',
  PROVINCIAL_HOSPITAL: 'Provincial hospital',
  HEALTH_CENTRE: 'Health centre',
  CLINIC: 'Private clinic',
  MATERNITY_HOME: 'Maternity home',
  HEALTH_POST: 'Health post',
};

export interface Facility {
  id: string;
  code: string;
  name: string;
  type: FacilityType;
  district: string;
  province: string;
  /** ISO 3166-1 alpha-2; `ZM` (Zambia) unless the deployment is elsewhere. */
  country?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Referral upward to a higher-capacity facility. */
  referralToFacilityId?: string | null;
  bedCount?: number | null;
  hasMaternityWard: boolean;
  hasUltrasound: boolean;
  hasLaboratory: boolean;
  active: boolean;
  imageUrl?: string | null;
  imagePublicId?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
}

/* ── Mothers & pregnancies ───────────────────────────────────────────── */

export type MotherStatus = 'ACTIVE' | 'TRANSFERRED_OUT' | 'CLOSED';
export type RiskLevel = 'RED' | 'AMBER' | 'GREEN';

export const RISK_LABELS: Record<RiskLevel, string> = {
  RED: 'Immediate assessment required',
  AMBER: 'Requires review',
  GREEN: 'No configured alert',
};

export const PREFERRED_LANGUAGES = [
  'English',
  'Bemba',
  'Nyanja',
  'Tonga',
  'Lozi',
  'Luvale',
  'Other',
] as const;

/** Reading topics used by the education library and the mother's plan. */
export const EDUCATION_TOPICS = [
  'Danger signs',
  'Nutrition and iron',
  'Birth preparedness',
  'Family planning',
  'HIV and PMTCT',
  'Malaria in pregnancy',
  'Hypertension in pregnancy',
  'Labour and delivery',
  'Newborn care',
  'Breastfeeding',
  'Mental health',
  'Transport and emergency numbers',
] as const;

export const EDUCATION_STAGES = [
  'PRECONCEPTION',
  'FIRST_TRIMESTER',
  'SECOND_TRIMESTER',
  'THIRD_TRIMESTER',
  'LABOUR',
  'POSTNATAL',
  'FAMILY_PLANNING',
  'GENERAL',
] as const;

export const EDUCATION_STAGE_LABELS: Record<(typeof EDUCATION_STAGES)[number], string> = {
  PRECONCEPTION: 'Before pregnancy',
  FIRST_TRIMESTER: 'First trimester',
  SECOND_TRIMESTER: 'Second trimester',
  THIRD_TRIMESTER: 'Third trimester',
  LABOUR: 'Labour and birth',
  POSTNATAL: 'After birth',
  FAMILY_PLANNING: 'Family planning',
  GENERAL: 'Any time',
};

export const CHRONIC_CONDITIONS = [
  'HYPERTENSION',
  'DIABETES',
  'SICKLE_CELL',
  'EPILEPSY',
  'TUBERCULOSIS',
  'HIV_CARE',
  'ASTHMA',
  'HEART_DISEASE',
  'OTHER',
] as const;
export type ChronicCondition = (typeof CHRONIC_CONDITIONS)[number];

export interface EmergencyContact {
  name?: string | null;
  relation?: string | null;
  phone?: string | null;
}

export interface ConsentRecord {
  accepted: boolean;
  version: string;
  acceptedAt: string;
  acceptedBy: string;
  language?: string | null;
  /** How the consent was captured: by the mother, by a representative, verbally witnessed, or by staff. */
  mode?: 'SELF' | 'STAFF_WITNESSED' | 'REPRESENTATIVE' | 'VERBAL' | null;
}

export interface Mother {
  id: string;
  /** Canonical, unique, system-assigned patient identifier, e.g. MC-000245. */
  patientId: string;
  provisionalPatientId?: string | null;
  userId?: string | null;
  fullName: string;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  phone: string;
  alternatePhone?: string | null;
  address?: string | null;
  community?: string | null;
  chiefName?: string | null;
  landmark?: string | null;
  emergencyContact?: EmergencyContact | null;
  preferredLanguage: string;
  literacyLevel?: 'NONE' | 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | null;
  maritalStatus?: 'SINGLE' | 'MARRIED' | 'COHABITING' | 'DIVORCED' | 'WIDOWED' | null;
  occupation?: string | null;
  husbandName?: string | null;
  husbandPhone?: string | null;
  bloodGroup?: string | null;
  allergies?: string | null;
  chronicConditions?: ChronicCondition[];
  /** Registered at the facility that owns the record. */
  registrationFacilityId: string;
  careFacilityId?: string | null;
  assignedChwUserId?: string | null;
  /** Household/catchment area code used by community teams for routing. */
  catchmentArea?: string | null;
  photoUrl?: string | null;
  photoPublicId?: string | null;
  consent?: ConsentRecord | null;
  status: MotherStatus;
  /** Denormalised so lists/charts never need to read clinical documents. */
  currentPregnancyId?: string | null;
  riskLevel?: RiskLevel | null;
  gestationalSnapshot?: { weeks: number; days: number; asOf: string } | null;
  eddSnapshot?: string | null;
  lastVisitAt?: string | null;
  nextAppointmentAt?: string | null;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt: string;
  updatedBy?: string | null;
  closedAt?: string | null;
  closureReason?: string | null;
}

export const PREVIOUS_COMPPLICATIONS = [
  'PRE_ECLAMPSIA',
  'ECLAMPSIA',
  'PPH',
  'PRETERM_BIRTH',
  'IUGR',
  'GDM',
  'TRANSFUSION',
  'STILLBIRTH',
  'NEONATAL_DEATH',
  'OBSTRUCTED_LABOUR',
  'SEPSIS',
  'OTHER',
] as const;
export type PreviousComplication = (typeof PREVIOUS_COMPPLICATIONS)[number];

export const RISK_FACTORS = [
  'AGE_UNDER_18',
  'AGE_OVER_35',
  'PARA_OVER_4',
  'SHORT_INTERVAL',
  'PREVIOUS_CSECTION',
  'MULTIPLE_PREGNANCY',
  'CHRONIC_HYPERTENSION',
  'DIABETES',
  'ANAEMIA',
  'HIV',
  'TUBERCULOSIS',
  'SICKLE_CELL',
  'UTERINE_SURGERY',
  'BREECH_PRESENTATION',
  'BLEEDING_THIS_PREGNANCY',
  'MATERNAL_HEIGHT_UNDER_150',
] as const;
export type RiskFactor = (typeof RISK_FACTORS)[number];

export type PregnancyOutcome =
  | 'ONGOING'
  | 'DELIVERED_LIVE_BIRTH'
  | 'STILLBIRTH'
  | 'PREGNANCY_LOSS'
  | 'TRANSFERRED'
  | 'UNKNOWN';

export interface Pregnancy {
  id: string;
  motherId: string;
  facilityId: string;
  parityNumber: number;
  status: 'ACTIVE' | 'DELIVERED' | 'CLOSED';
  lmpDate?: string | null;
  /** Derived from LMP unless measured dating overrides it. */
  eddDate: string;
  datingMethod: 'LMP' | 'ULTRASOUND' | 'CLINICAL';
  datingOverrideEdd?: string | null;
  confirmedAt?: string | null;
  bookedAt?: string | null;
  /** Exact GA documented by a clinician at booking; used as a floor. */
  documentedGestationalAge?: { weeks: number; days: number; at: string } | null;
  gravida: number;
  para: number;
  livingChildren?: number | null;
  gestationCount: 1 | 2 | 3;
  isMultiple: boolean;
  previousCesarean: boolean;
  previousComplications: PreviousComplication[];
  riskFactors: RiskFactor[];
  riskLevel: RiskLevel;
  riskReviewedAt?: string | null;
  riskReviewedBy?: string | null;
  notes?: string | null;
  outcome: PregnancyOutcome;
  delivery?: DeliveryRecord | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy?: string | null;
}

export interface DeliveryRecord {
  date: string;
  gestationalAgeWeeks?: number | null;
  mode: 'SPONTANEOUS' | 'VACUUM' | 'FORCEPS' | 'CAESAREAN';
  presentation?: 'VERTEX' | 'BREECH' | 'TRANSVERSE' | null;
  outcome: PregnancyOutcome;
  birthCount: number;
  babies?: NewbornRecord[];
  complications?: string[];
  attendedByName?: string | null;
  birthFacilityId?: string | null;
  recordedAt: string;
  recordedBy: string;
}

export interface NewbornRecord {
  sex?: 'F' | 'M' | 'UNKNOWN' | null;
  birthWeightKg?: number | null;
  apgar1?: number | null;
  apgar5?: number | null;
  condition?: 'WELL' | 'RESCUSITATION' | 'NICU' | 'DECEASED' | null;
  feedingStatus?: string | null;
}

/* ── ANC visits ──────────────────────────────────────────────────────── */

export const VISIT_TYPES = [
  'BOOKING',
  'ROUTINE',
  'FOLLOW_UP',
  'URGENT',
  'REVIEW',
  'PMTCT',
  'ULTRASOUND',
] as const;
export type VisitType = (typeof VISIT_TYPES)[number];

export interface Vitals {
  systolicBp?: number | null;
  diastolicBp?: number | null;
  pulse?: number | null;
  temperatureC?: number | null;
  respiratoryRate?: number | null;
  weightKg?: number | null;
  prePregnancyWeightKg?: number | null;
  heightCm?: number | null;
  muacCm?: number | null;
  oedema?: 'NONE' | 'MILD' | 'SEVERE' | null;
  fundalHeightCm?: number | null;
  fetalHeartRate?: number | null;
  presentation?: 'VERTEX' | 'BREECH' | 'TRANSVERSE' | 'UNDETERMINED' | null;
  urineProtein?: 'NONE' | 'TRACE' | 'PLUS_1' | 'PLUS_2' | 'PLUS_3' | null;
  urineGlucose?: 'NONE' | 'TRACE' | 'PLUS_1' | 'PLUS_2' | 'PLUS_3' | null;
  haemoglobinGdl?: number | null;
  bloodGlucoseMmoll?: number | null;
}

export const DANGER_SIGNS = [
  'VAGINAL_BLEEDING',
  'SEVERE_ABDOMINAL_PAIN',
  'SEVERE_HEADACHE',
  'VISUAL_DISTURBANCE',
  'CONVULSIONS',
  'DIFFICULTY_BREATHING',
  'FEVER',
  'SEVERE_VOMITING',
  'REDUCED_FETAL_MOVEMENT',
  'FLUID_LEAKAGE',
  'SWELLING_FACE_HANDS',
  'CORD_PROLAPSE',
  'OTHER_CONCERN',
] as const;
export type DangerSignKey = (typeof DANGER_SIGNS)[number];

export const DANGER_SIGN_LABELS: Record<DangerSignKey, string> = {
  VAGINAL_BLEEDING: 'Vaginal bleeding',
  SEVERE_ABDOMINAL_PAIN: 'Severe abdominal pain',
  SEVERE_HEADACHE: 'Severe headache',
  VISUAL_DISTURBANCE: 'Visual disturbance',
  CONVULSIONS: 'Convulsions / fits',
  DIFFICULTY_BREATHING: 'Difficulty breathing',
  FEVER: 'Fever',
  SEVERE_VOMITING: 'Severe vomiting',
  REDUCED_FETAL_MOVEMENT: 'Reduced or absent fetal movement',
  FLUID_LEAKAGE: 'Fluid leakage / water broken',
  SWELLING_FACE_HANDS: 'Sudden swelling of face or hands',
  CORD_PROLAPSE: 'Cord prolapse',
  OTHER_CONCERN: 'Other concerning symptom',
};

export interface DangerSignsFinding {
  reported: DangerSignKey[];
  otherNote?: string | null;
  /** True when the caregiver explicitly reports none of the listed signs. */
  noneReported: boolean;
}

export interface TestResult {
  id: string;
  panel: 'ROUTINE' | 'INFECTION' | 'METABOLIC' | 'IMAGING' | 'OTHER';
  name: string;
  value?: string | null;
  unit?: string | null;
  collectedAt?: string | null;
  resultAt?: string | null;
  flagged?: boolean | null;
  note?: string | null;
  documentedBy?: string | null;
}

export interface MedicationEntry {
  id: string;
  name: string;
  dose?: string | null;
  frequency?: string | null;
  startDate?: string | null;
  note?: string | null;
}

export interface AncVisit {
  id: string;
  motherId: string;
  pregnancyId: string;
  facilityId: string;
  visitNumber: number;
  visitDate: string;
  visitType: VisitType;
  reasonForVisit?: string | null;
  gestationalAge: { weeks: number; days: number };
  vitals: Vitals;
  dangerSigns: DangerSignsFinding;
  tests: TestResult[];
  medications: MedicationEntry[];
  counselling: string[];
  /** Structured clinical note, not an interpretation. */
  note?: string | null;
  nextAppointmentAt?: string | null;
  outcome?: 'CONTINUE_CARE' | 'REFERRED' | 'ADMITTED' | 'LOST_TO_FOLLOWUP' | 'DELIVERED' | null;
  riskLevelAfter: RiskLevel;
  alertIds: string[];
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  /** Client-generated so an offline retry never duplicates the record. */
  clientRef?: string | null;
}

/* ── Alerts ──────────────────────────────────────────────────────────── */

export type AlertStatus =
  | 'OPEN'
  | 'ACKNOWLEDGED'
  | 'ASSESSED'
  | 'REFERRED'
  | 'FOLLOW_UP_REQUIRED'
  | 'RESOLVED';

export const ALERT_STATUSES: AlertStatus[] = [
  'OPEN',
  'ACKNOWLEDGED',
  'ASSESSED',
  'REFERRED',
  'FOLLOW_UP_REQUIRED',
  'RESOLVED',
];

export const ALERT_ACTION_LABELS: Record<Exclude<AlertStatus, 'OPEN'>, string> = {
  ACKNOWLEDGED: 'Acknowledged',
  ASSESSED: 'Clinically assessed',
  REFERRED: 'Referred',
  FOLLOW_UP_REQUIRED: 'Follow-up required',
  RESOLVED: 'Resolved',
};

export interface AlertAction {
  status: Exclude<AlertStatus, 'OPEN'>;
  note: string;
  byUserId: string;
  byName: string;
  at: string;
  facilityId?: string | null;
}

export interface ClinicalAlert {
  id: string;
  motherId: string;
  motherName: string;
  patientId: string;
  pregnancyId: string;
  visitId?: string | null;
  facilityId: string;
  level: RiskLevel;
  category:
    | 'DANGER_SIGN'
    | 'BLOOD_PRESSURE'
    | 'VITALS'
    | 'FETAL'
    | 'INFECTION'
    | 'NUTRITION'
    | 'LABORATORY'
    | 'RISK_PROFILE'
    | 'MISSED_VISIT'
    | 'OTHER';
  /** Machine key of the rule that fired (null for manual alerts). */
  ruleKey?: string | null;
  ruleVersion?: number | null;
  title: string;
  /** Non-diagnostic wording, always framed as "assessment required". */
  message: string;
  triggeredBy: { label: string; value?: string | null; unit?: string | null }[];
  status: AlertStatus;
  actions: AlertAction[];
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  outcomeNote?: string | null;
  openedAt: string;
  openedBy: string;
  openedByName: string;
  resolvedAt?: string | null;
  updatedAt?: string | null;
}

/* ── Configurable clinical rules ─────────────────────────────────────── */

export type RuleField =
  | 'systolicBp'
  | 'diastolicBp'
  | 'pulse'
  | 'temperatureC'
  | 'respiratoryRate'
  | 'weightKg'
  | 'weightGainKg'
  | 'muacCm'
  | 'oedema'
  | 'fundalHeightCm'
  | 'fundalHeightDeltaCm'
  | 'fetalHeartRate'
  | 'haemoglobinGdl'
  | 'urineProtein'
  | 'urineGlucose'
  | 'bloodGlucoseMmoll'
  | 'gestationalWeeks'
  | 'ageYears'
  | 'dangerSign'
  | 'riskFactor'
  | 'previousComplication'
  | 'isMultiple'
  | 'previousCesarean';

export type RuleOperator = 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'in' | 'includes';

export interface RuleCondition {
  field: RuleField;
  op: RuleOperator;
  /** number | string | boolean | (string|number)[] depending on operator. */
  value: number | string | boolean | (string | number)[];
  unit?: string;
}

export interface RuleGroup {
  logic: 'all' | 'any';
  conditions: (RuleCondition | RuleGroup)[];
}

export interface AlertRule {
  id: string;
  key: string;
  label: string;
  level: Exclude<RiskLevel, 'GREEN'>;
  category: ClinicalAlert['category'];
  /** What the app displays. Deliberately non-diagnostic. */
  message: string;
  recommendedAction: string;
  criteria: RuleGroup;
  enabled: boolean;
  version: number;
  /** Validated by clinical governance before it may drive care decisions. */
  approvedBy?: string | null;
  approvedAt?: string | null;
  notes?: string | null;
  updatedAt: string;
  updatedBy: string;
}

/* ── Appointments ────────────────────────────────────────────────────── */

export const APPOINTMENT_TYPES = [
  'ANC',
  'FOLLOW_UP',
  'REVIEW',
  'LABORATORY',
  'ULTRASOUND',
  'PMTCT',
  'IMMUNISATION',
  'POSTNATAL',
  'OTHER',
] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_TYPE_LABELS: Record<AppointmentType, string> = {
  ANC: 'Antenatal visit',
  FOLLOW_UP: 'Follow-up',
  REVIEW: 'Clinical review',
  LABORATORY: 'Laboratory',
  ULTRASOUND: 'Ultrasound',
  PMTCT: 'PMTCT',
  IMMUNISATION: 'Immunisation',
  POSTNATAL: 'Postnatal visit',
  OTHER: 'Other',
};

export type AppointmentStatus =
  | 'SCHEDULED'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'MISSED'
  | 'CANCELLED'
  | 'RESCHEDULED';

export interface Appointment {
  id: string;
  motherId: string;
  patientId: string;
  motherName: string;
  pregnancyId?: string | null;
  facilityId: string;
  scheduledFor: string;
  time: string;
  durationMinutes: number;
  type: AppointmentType;
  status: AppointmentStatus;
  reason?: string | null;
  notes?: string | null;
  assignedUserId?: string | null;
  assignedUserName?: string | null;
  reminderDays: number[];
  remindersSent: Record<string, string>;
  smsEnabled: boolean;
  createdByName: string;
  createdAt: string;
  createdBy: string;
  updatedAt?: string | null;
  updatedBy?: string | null;
  cancelledReason?: string | null;
  completedVisitId?: string | null;
}

/* ── Referrals ───────────────────────────────────────────────────────── */

export const REFERRAL_STATUSES = [
  'ACTIVE',
  'RECEIVED',
  'ASSESSMENT_COMPLETED',
  'TREATMENT',
  'ADMISSION',
  'DISCHARGED',
  'REFERRED_ONWARD',
  'FOLLOW_UP_REQUIRED',
  'CLOSED',
] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  ACTIVE: 'Active — awaiting receipt',
  RECEIVED: 'Received',
  ASSESSMENT_COMPLETED: 'Assessment completed',
  TREATMENT: 'Treatment',
  ADMISSION: 'Admission',
  DISCHARGED: 'Discharged',
  REFERRED_ONWARD: 'Referred onward',
  FOLLOW_UP_REQUIRED: 'Follow-up required',
  CLOSED: 'Closed',
};

export type ReferralUrgency = 'EMERGENCY' | 'URGENT' | 'ROUTINE';

export interface ReferralStatusEvent {
  status: ReferralStatus;
  at: string;
  byUserId: string;
  byName: string;
  note?: string | null;
  facilityId?: string | null;
}

export interface Referral {
  id: string;
  motherId: string;
  patientId: string;
  motherName: string;
  pregnancyId?: string | null;
  originFacilityId: string;
  receivingFacilityId: string;
  reason: string;
  clinicalQuestion?: string | null;
  urgency: ReferralUrgency;
  scheduledAt: string;
  transport: 'AMBULANCE' | 'PRIVATE_CAR' | 'OTHER' | 'NONE';
  transportNote?: string | null;
  clinicalNotes: string;
  vitalSnapshot?: Vitals | null;
  status: ReferralStatus;
  statusHistory: ReferralStatusEvent[];
  feedbackNote?: string | null;
  closedAt?: string | null;
  followUpRequired?: boolean | null;
  followUpDueAt?: string | null;
  createdAt: string;
  createdBy: string;
  createdByName: string;
  updatedAt?: string | null;
}

/* ── Reports ─────────────────────────────────────────────────────────── */

export const REPORT_TYPES = [
  'ANC_VISIT',
  'PREGNANCY_SUMMARY',
  'REFERRAL',
  'APPOINTMENT',
  'MISSED_APPOINTMENT',
  'FACILITY',
  'MATERNAL_CARE_SUMMARY',
  'ALERTS',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  ANC_VISIT: 'ANC visit report',
  PREGNANCY_SUMMARY: 'Pregnancy summary',
  REFERRAL: 'Referral report',
  APPOINTMENT: 'Appointment report',
  MISSED_APPOINTMENT: 'Missed appointment report',
  FACILITY: 'Facility report',
  MATERNAL_CARE_SUMMARY: 'Maternal care summary',
  ALERTS: 'Alerts & response report',
};

export interface ReportDocumentRef {
  publicId: string;
  secureUrl: string;
  bytes?: number | null;
  /** Present when Cloudinary media is not configured: blob handle in the
   *  device document store. Never a public URL. */
  localHandle?: string | null;
  version?: string | null;
}

export interface ReportRecord {
  id: string;
  title: string;
  type: ReportType;
  scope: 'PATIENT' | 'FACILITY' | 'DISTRICT';
  motherId?: string | null;
  patientId?: string | null;
  pregnancyId?: string | null;
  facilityId?: string | null;
  period: { from: string; to: string };
  filters?: Record<string, string | number | boolean | null> | null;
  format: 'PDF';
  status: 'GENERATED' | 'FAILED';
  fileName: string;
  file?: ReportDocumentRef | null;
  error?: string | null;
  summary: { label: string; value: string | number }[];
  rowCount?: number | null;
  /** Access control list — private by default, never public. */
  accessRoles: Role[];
  accessUserIds: string[];
  generatedBy: string;
  generatedByName: string;
  generatedAt: string;
  expiresAt?: string | null;
}

/* ── Documents ───────────────────────────────────────────────────────── */

export const DOCUMENT_CATEGORIES = [
  'REPORT',
  'MEDICAL',
  'REFERRAL',
  'FACILITY',
  'EDUCATION',
  'CONSENT',
  'LABORATORY',
  'OTHER',
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  REPORT: 'Report',
  MEDICAL: 'Medical document',
  REFERRAL: 'Referral document',
  FACILITY: 'Facility document',
  EDUCATION: 'Educational material',
  CONSENT: 'Consent record',
  LABORATORY: 'Laboratory result',
  OTHER: 'Other authorized document',
};

export interface DocumentRecord {
  id: string;
  name: string;
  category: DocumentCategory;
  description?: string | null;
  ownerUserId?: string | null;
  motherId?: string | null;
  patientId?: string | null;
  pregnancyId?: string | null;
  visitId?: string | null;
  referralId?: string | null;
  facilityId?: string | null;
  uploadedBy: string;
  uploadedByName: string;
  uploadedAt: string;
  mimeType: string;
  sizeBytes: number;
  publicId: string;
  secureUrl?: string | null;
  localHandle?: string | null;
  thumbnailUrl?: string | null;
  version: number;
  checksum?: string | null;
  folder: string;
  accessRoles: Role[];
  accessUserIds: string[];
  /** Sensitive medical documents are never publicly deliverable. */
  accessMode: 'AUTHENTICATED' | 'PUBLIC_READ';
  deletedAt?: string | null;
  deletedBy?: string | null;
  lastAccessedAt?: string | null;
  lastAccessedBy?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}

/* ── Notifications ───────────────────────────────────────────────────── */

export type NotificationKind =
  | 'APPOINTMENT_REMINDER'
  | 'NEW_ALERT'
  | 'REFERRAL_UPDATE'
  | 'ANNOUNCEMENT'
  | 'SYSTEM'
  | 'REPORT_READY'
  | 'ACCOUNT'
  | 'DOCUMENT';

export interface AppNotification {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  level: 'info' | 'success' | 'warning' | 'critical';
  link?: string | null;
  motherId?: string | null;
  facilityId?: string | null;
  readAt?: string | null;
  sentAt: string;
  createdBy?: string | null;
  createdByName?: string | null;
  channels: { inApp: boolean; push: boolean; sms: boolean };
  pushSent?: boolean | null;
}

/* ── Audit ───────────────────────────────────────────────────────────── */

export const AUDIT_ACTIONS = [
  'auth.login',
  'auth.logout',
  'auth.password_reset_requested',
  'auth.password_changed',
  'auth.session_revoked',
  'user.created',
  'user.updated',
  'user.role_changed',
  'user.deactivated',
  'user.reactivated',
  'user.access_approved',
  'user.facility_assigned',
  'user.push_token_registered',
  'facility.created',
  'facility.updated',
  'mother.registered',
  'mother.updated',
  'mother.closed',
  'pregnancy.updated',
  'pregnancy.risk_changed',
  'anc_visit.created',
  'anc_visit.updated',
  'alert.created',
  'alert.updated',
  'alert.resolved',
  'alert.assigned',
  'referral.created',
  'referral.status_changed',
  'referral.feedback_added',
  'appointment.created',
  'appointment.updated',
  'appointment.status_changed',
  'appointment.reminder_sent',
  'report.generated',
  'report.downloaded',
  'document.uploaded',
  'document.accessed',
  'document.deleted',
  'notification.sent',
  'settings.updated',
  'rule.updated',
  'media.uploaded',
  'media.deleted',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  actorRole: Role | 'SYSTEM';
  targetType:
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
  targetId: string;
  targetLabel?: string | null;
  facilityId?: string | null;
  /** Deliberately small and PII-minimised. */
  metadata?: Record<string, string | number | boolean | null>;
  createdAt: string;
}

/* ── Health education ────────────────────────────────────────────────── */

export interface EducationResource {
  id: string;
  title: string;
  summary: string;
  body: string;
  topics: string[];
  language: string;
  audience: ('MOTHER' | 'HEALTH_WORKER')[];
  stage: 'PRECONCEPTION' | 'FIRST_TRIMESTER' | 'SECOND_TRIMESTER' | 'THIRD_TRIMESTER' | 'LABOUR' | 'POSTNATAL' | 'FAMILY_PLANNING' | 'GENERAL';
  coverImageUrl?: string | null;
  coverImagePublicId?: string | null;
  readingMinutes: number;
  status: 'DRAFT' | 'PUBLISHED';
  facilityId?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  createdByName: string;
}

/* ── Facility staffing & system settings ─────────────────────────────── */

export interface FacilityAssignment {
  id: string;
  userId: string;
  userName: string;
  role: Role;
  facilityId: string;
  isPrimary: boolean;
  active: boolean;
  startedAt: string;
  endedAt?: string | null;
  assignedBy: string;
  createdAt: string;
}

export interface SystemSettings {
  id: 'app';
  patientIdPrefix: string;
  patientIdSequence: number;
  reminderDaysDefault: number[];
  smsEnabled: boolean;
  pushEnabled: boolean;
  registrationRequiresApproval: boolean;
  defaultLanguage: string;
  bootstrapAdminEmails: string[];
  clinicalRulesVersion: number;
  clinicalRulesReviewedBy: string | null;
  clinicalRulesReviewedAt: string | null;
  dataRetentionPolicy: string;
  allowPatientAccountSelfRegistration: boolean;
  updatedAt: string;
  updatedBy: string;
}

/* ── Shared query/persistence types ──────────────────────────────────── */

export interface QueryFilter {
  field: string;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'array-contains' | 'array-contains-any';
  value: unknown;
}

export interface QuerySpec {
  where?: QueryFilter[];
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
}

/**
 * Live view over a collection. `loading` distinguishes the first fetch from an
 * empty result so screens never render "no records" while data is in flight.
 */
export interface LiveQuery<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  total?: number;
  refresh: () => void;
}

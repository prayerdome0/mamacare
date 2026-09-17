/**
 * Mama Care domain model.
 *
 * Every record is a plain, JSON-serialisable object with an opaque `id` and ISO
 * date strings — Firestore Timestamps are converted at the provider boundary so
 * no screen has to think about them.
 *
 * Medical-safety rule that shapes the whole model: Mama Care *organises* and
 * *educates*. It never diagnoses. Measurements a user records are stored as
 * observations attributed to whoever took them (`self` or `provider`) and are
 * never turned into a condition by this codebase.
 */

/* ── Roles and accounts ───────────────────────────────────────────────── */

export type Role = 'MOTHER' | 'SUPPORTER' | 'PROVIDER' | 'FACILITY_ADMIN' | 'ADMIN';

export const ROLES: Role[] = ['MOTHER', 'SUPPORTER', 'PROVIDER', 'FACILITY_ADMIN', 'ADMIN'];

export const ROLE_LABELS: Record<Role, string> = {
  MOTHER: 'Mother',
  SUPPORTER: 'Family supporter',
  PROVIDER: 'Healthcare provider',
  FACILITY_ADMIN: 'Facility administrator',
  ADMIN: 'System administrator',
};

/** Roles that work inside a facility rather than for themselves. */
export const STAFF_ROLES: Role[] = ['PROVIDER', 'FACILITY_ADMIN', 'ADMIN'];

export type AccountStatus = 'ACTIVE' | 'PENDING_APPROVAL' | 'SUSPENDED' | 'CLOSED';

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: 'Active',
  PENDING_APPROVAL: 'Pending approval',
  SUSPENDED: 'Suspended',
  CLOSED: 'Closed',
};

/** Severity used by warning-sign education. Colour always travels with a label. */
export type RiskLevel = 'RED' | 'AMBER' | 'GREEN';

export const RISK_LABELS: Record<RiskLevel, string> = {
  RED: 'Seek care now',
  AMBER: 'Contact a provider',
  GREEN: 'Self-care',
};

export type LanguageCode = 'en' | 'bem' | 'ny' | 'toi' | 'loz';

export const LANGUAGES: { code: LanguageCode; label: string; available: boolean }[] = [
  { code: 'en', label: 'English', available: true },
  { code: 'bem', label: 'Bemba', available: false },
  { code: 'ny', label: 'Nyanja', available: false },
  { code: 'toi', label: 'Tonga', available: false },
  { code: 'loz', label: 'Lozi', available: false },
];

/* ── Querying ─────────────────────────────────────────────────────────── */

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

/** A live query description; `useLiveQuery` subscribes to it. */
export interface LiveQuery<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/* ── Base shape ───────────────────────────────────────────────────────── */

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt?: string | null;
}

/* ── Users ────────────────────────────────────────────────────────────── */

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface NotificationPreferences {
  appointments: boolean;
  reminders: boolean;
  education: boolean;
  milestones: boolean;
  baby: boolean;
  /** Quiet hours: no push between `from` and `to` (local 24h `HH:mm`). */
  quietFrom: string | null;
  quietTo: string | null;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPreferences = {
  appointments: true,
  reminders: true,
  education: true,
  milestones: true,
  baby: true,
  quietFrom: '21:00',
  quietTo: '06:00',
};

export interface UserProfile extends BaseRecord {
  uid: string;
  fullName: string;
  email: string;
  phone: string | null;
  dateOfBirth: string | null;
  country: string;
  language: LanguageCode;
  role: Role;
  status: AccountStatus;
  photoUrl: string | null;
  photoPublicId: string | null;
  emergencyContact: EmergencyContact | null;
  notificationPrefs: NotificationPreferences;
  /** Provider-only: the directory entry for this clinician. */
  providerId: string | null;
  /** Facility staff only. */
  facilityId: string | null;
  /** Supporter accounts: the mother they help. */
  supportsUserId: string | null;
  consentAt: string | null;
  lastLoginAt: string | null;
  /** Bumped when an administrator changes a role; forces claim re-sync. */
  privilegeVersion: number;
}

/* ── Pregnancy ────────────────────────────────────────────────────────── */

export type DatingMethod = 'lmp' | 'ultrasound' | 'clinician' | 'unknown';
export type PregnancyStatus = 'active' | 'delivered' | 'ended';

export interface Pregnancy extends BaseRecord {
  userId: string;
  /** First day of the last menstrual period, where applicable. */
  lmpDate: string | null;
  /** Estimated due date. Derived from LMP by default; ultrasound overrides. */
  eddDate: string | null;
  datingMethod: DatingMethod;
  previousPregnancies: number;
  previousLiveBirths: number;
  status: PregnancyStatus;
  deliveryDate: string | null;
  /** Set when the app switches to Mother & Baby mode. */
  postnatalSince: string | null;
  facilityId: string | null;
  notes: string | null;
}

/* ── Baby ─────────────────────────────────────────────────────────────── */

export type BabySex = 'female' | 'male' | 'undisclosed';

export interface Baby extends BaseRecord {
  userId: string;
  pregnancyId: string | null;
  name: string;
  dateOfBirth: string;
  sex: BabySex;
  birthWeightKg: number | null;
  birthLengthCm: number | null;
  headCircumferenceCm: number | null;
  birthFacilityId: string | null;
  birthNotes: string | null;
  photoUrl: string | null;
  photoPublicId: string | null;
}

/* ── Appointments ─────────────────────────────────────────────────────── */

export type AppointmentKind = 'antenatal' | 'postnatal' | 'baby' | 'immunization' | 'lab' | 'other';
export type AppointmentStatus = 'scheduled' | 'completed' | 'missed' | 'cancelled';

export const APPOINTMENT_KIND_LABELS: Record<AppointmentKind, string> = {
  antenatal: 'Antenatal check-up',
  postnatal: 'Postnatal check-up',
  baby: 'Baby clinic',
  immunization: 'Immunization',
  lab: 'Laboratory / test',
  other: 'Other',
};

export interface Appointment extends BaseRecord {
  userId: string;
  babyId: string | null;
  kind: AppointmentKind;
  date: string;
  time: string | null;
  facilityId: string | null;
  facilityName: string;
  purpose: string;
  status: AppointmentStatus;
  /** Recorded only when a healthcare professional provides them. */
  observations: ObservationInput[];
  testResults: string | null;
  questions: string[];
  clinicianNotes: string | null;
  nextAppointmentDate: string | null;
  reminderSentAt: string | null;
  /** Supporter accounts may only see appointments explicitly shared. */
  sharedWithSupporter: boolean;
}

export interface ObservationInput {
  kind: 'blood-pressure' | 'weight' | 'height' | 'hb' | 'glucose' | 'fundal-height' | 'other';
  label: string;
  value: string;
  unit: string | null;
  recordedBy: 'self' | 'provider';
  takenAt: string;
}

/* ── Reminders (medication, supplements, custom) ──────────────────────── */

export type ReminderFrequency = 'daily' | 'weekdays' | 'weekly' | 'specific-days' | 'once';
export type ReminderKind = 'medication' | 'supplement' | 'custom';

export interface Reminder extends BaseRecord {
  userId: string;
  kind: ReminderKind;
  title: string;
  /** Exactly as prescribed — Mama Care never suggests a medicine or a dose. */
  medicine: string | null;
  dose: string | null;
  times: string[];
  frequency: ReminderFrequency;
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  active: boolean;
  prescribedBy: string | null;
  instructions: string | null;
  /** ISO timestamps of doses the user marked as taken. */
  takenLog: string[];
  sharedWithSupporter: boolean;
}

/* ── Observations recorded between appointments ───────────────────────── */

export interface Observation extends BaseRecord {
  userId: string;
  pregnancyId: string | null;
  kind: ObservationInput['kind'] | 'symptom' | 'fetal-movement' | 'mood';
  label: string;
  value: string | null;
  systolic: number | null;
  diastolic: number | null;
  unit: string | null;
  weekNumber: number | null;
  recordedBy: 'self' | 'provider';
  appointmentId: string | null;
  notes: string | null;
}

/* ── Immunization ─────────────────────────────────────────────────────── */

export type ImmunizationStatus = 'upcoming' | 'given' | 'missed' | 'skipped';

export interface ImmunizationRecord extends BaseRecord {
  babyId: string;
  userId: string;
  vaccineCode: string;
  vaccineName: string;
  dose: string;
  scheduledAgeLabel: string;
  scheduledDate: string;
  givenDate: string | null;
  status: ImmunizationStatus;
  facilityId: string | null;
  facilityName: string | null;
  batchNumber: string | null;
  notes: string | null;
}

/* ── Journal ──────────────────────────────────────────────────────────── */

export type JournalMood = 'great' | 'good' | 'okay' | 'low' | 'struggling';

export interface JournalEntry extends BaseRecord {
  userId: string;
  babyId: string | null;
  date: string;
  title: string;
  body: string;
  mood: JournalMood | null;
  tags: string[];
  private: boolean;
}

/* ── Education content ────────────────────────────────────────────────── */

export type ArticleCategory =
  | 'pregnancy'
  | 'nutrition'
  | 'antenatal-care'
  | 'activity'
  | 'rest'
  | 'wellbeing'
  | 'labour'
  | 'postnatal'
  | 'newborn'
  | 'breastfeeding'
  | 'immunization';

export const ARTICLE_CATEGORY_LABELS: Record<ArticleCategory, string> = {
  pregnancy: 'Pregnancy',
  nutrition: 'Nutrition',
  'antenatal-care': 'Antenatal care',
  activity: 'Exercise & activity',
  rest: 'Rest & sleep',
  wellbeing: 'Emotional wellbeing',
  labour: 'Labour & delivery',
  postnatal: 'Postnatal care',
  newborn: 'Newborn care',
  breastfeeding: 'Breastfeeding',
  immunization: 'Immunization',
};

export type ArticleAudience = 'public' | 'mother' | 'provider';
export type ArticleStatus = 'draft' | 'published' | 'archived';

/** A content block — the editor is deliberately simple and safe to render. */
export type ArticleBlock =
  | { type: 'paragraph'; text: string }
  | { type: 'heading'; text: string; level: 2 | 3 }
  | { type: 'list'; items: string[]; ordered?: boolean }
  | { type: 'note'; text: string; tone: 'info' | 'warning' | 'danger' };

export interface Article extends BaseRecord {
  slug: string;
  title: string;
  summary: string;
  category: ArticleCategory;
  /** When set, the article is attached to that pregnancy week. */
  weekNumber: number | null;
  audience: ArticleAudience;
  language: LanguageCode;
  blocks: ArticleBlock[];
  imageUrl: string | null;
  imagePublicId: string | null;
  tags: string[];
  status: ArticleStatus;
  authorName: string;
  /** Content must be reviewed before it is published. */
  reviewedBy: string | null;
  reviewedAt: string | null;
  readMinutes: number;
  /** True when the article came from the built-in library, not the database. */
  builtin?: boolean;
}

/* ── Facilities ───────────────────────────────────────────────────────── */

export type FacilityType =
  | 'government-hospital'
  | 'private-hospital'
  | 'clinic'
  | 'health-post'
  | 'maternity-home'
  | 'pharmacy'
  | 'laboratory';

export const FACILITY_TYPE_LABELS: Record<FacilityType, string> = {
  'government-hospital': 'Government hospital',
  'private-hospital': 'Private hospital',
  clinic: 'Clinic',
  'health-post': 'Health post',
  'maternity-home': 'Maternity home',
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
};

export interface Facility extends BaseRecord {
  name: string;
  type: FacilityType;
  /** District the facility serves (e.g. "Chama"). Used for district-level search. */
  district: string;
  address: string;
  city: string;
  province: string;
  country: string;
  /**
   * One or two sentences of verified context (when the facility was built, what
   * it is known for, its role in the district). Kept deliberately factual; where
   * nothing verifiable exists this stays null and the UI says so.
   */
  description: string | null;
  phone: string | null;
  emergencyPhone: string | null;
  latitude: number | null;
  longitude: number | null;
  services: string[];
  maternalServices: string[];
  openingHours: string;
  hasMaternity: boolean;
  has24HourEmergency: boolean;
  imageUrl: string | null;
  imagePublicId: string | null;
  verified: boolean;
  verifiedAt: string | null;
  active: boolean;
}

/* ── Healthcare providers ─────────────────────────────────────────────── */

export type Profession = 'midwife' | 'nurse' | 'doctor' | 'maternal-educator' | 'community-health-worker' | 'pharmacist';

export const PROFESSION_LABELS: Record<Profession, string> = {
  midwife: 'Midwife',
  nurse: 'Nurse',
  doctor: 'Doctor',
  'maternal-educator': 'Maternal health educator',
  'community-health-worker': 'Community health worker',
  pharmacist: 'Pharmacist',
};

export type ProviderStatus = 'pending' | 'approved' | 'rejected' | 'suspended';

export interface HealthcareProvider extends BaseRecord {
  userId: string | null;
  fullName: string;
  title: string | null;
  profession: Profession;
  facilityId: string | null;
  facilityName: string;
  /** Town or district where the clinician practices (from the application form). */
  location: string | null;
  licenseNumber: string | null;
  /** Qualifications as stated by the applicant (degrees, certificates, years of experience). */
  qualifications: string | null;
  /**
   * Ids of `documents` records attached to the application (practising
   * certificate, registration, references). The files themselves live under the
   * applicant's own document path; administrators may read them, nobody else.
   */
  supportingDocuments: string[];
  languages: string[];
  bio: string | null;
  phone: string | null;
  email: string | null;
  photoUrl: string | null;
  photoPublicId: string | null;
  status: ProviderStatus;
  verifiedBy: string | null;
  verifiedAt: string | null;
  rejectionReason: string | null;
  acceptingNewPatients: boolean;
  listedInDirectory: boolean;
}

/* ── Messaging ────────────────────────────────────────────────────────── */

export interface Message extends BaseRecord {
  threadId: string;
  fromUserId: string;
  fromName: string;
  fromRole: Role;
  toUserId: string;
  toName: string;
  body: string;
  readAt: string | null;
  /** A message thread is never an emergency channel; the UI says so. */
  systemNotice: boolean;
}

/* ── Notifications, devices, announcements ────────────────────────────── */

export type NotificationKind =
  | 'appointment'
  | 'reminder'
  | 'education'
  | 'milestone'
  | 'baby'
  | 'message'
  | 'system'
  | 'immunization';

export interface AppNotification extends BaseRecord {
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  deliveredByPush: boolean;
}

export interface DeviceToken extends BaseRecord {
  userId: string;
  token: string;
  platform: string;
  userAgent: string | null;
  lastSeenAt: string;
}

export interface Announcement extends BaseRecord {
  title: string;
  body: string;
  audience: 'all' | 'mothers' | 'providers' | 'facility';
  link: string | null;
  tone: 'info' | 'warning' | 'success';
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdBy: string | null;
}

/* ── Supporter (partner / family) sharing ─────────────────────────────── */

export interface SupporterPermissions {
  appointments: boolean;
  reminders: boolean;
  education: boolean;
  milestones: boolean;
}

export interface SupporterLink extends BaseRecord {
  motherUserId: string;
  supporterEmail: string;
  supporterUserId: string | null;
  supporterName: string;
  relationship: string;
  permissions: SupporterPermissions;
  status: 'invited' | 'active' | 'revoked';
  invitedBy: string;
  acceptedAt: string | null;
}

/* ── Feedback, reports, audit, settings ───────────────────────────────── */

export interface Feedback extends BaseRecord {
  userId: string | null;
  email: string | null;
  topic: 'bug' | 'content' | 'feature' | 'facility-data' | 'other';
  message: string;
  status: 'new' | 'in-progress' | 'resolved';
  response: string | null;
  handledBy: string | null;
}

export type ReportTargetType = 'article' | 'facility' | 'message' | 'user' | 'other';

export interface ContentReport extends BaseRecord {
  reporterId: string | null;
  reporterName: string | null;
  targetType: ReportTargetType;
  targetId: string;
  targetLabel: string;
  reason: string;
  details: string | null;
  status: 'open' | 'reviewed' | 'dismissed' | 'actioned';
  reviewedBy: string | null;
  reviewedAt: string | null;
  resolution: string | null;
}

export type AuditAction =
  | 'sign-in'
  | 'sign-out'
  | 'register'
  | 'role-change'
  | 'status-change'
  | 'record-create'
  | 'record-update'
  | 'record-delete'
  | 'content-publish'
  | 'provider-approval'
  | 'account-delete'
  | 'data-export'
  | 'settings-change'
  | 'media-upload';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId: string;
  actorName: string;
  actorRole: Role | 'SYSTEM';
  targetType: string;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
}

export interface SystemSettings extends BaseRecord {
  /** Always `global` for the singleton document. */
  key: string;
  registrationOpen: boolean;
  providerApprovalsRequired: boolean;
  defaultCountry: string;
  supportEmail: string;
  supportPhone: string;
  emergencyNumbers: { label: string; number: string }[];
  /** Reviewed immunization schedule identifier, shown on the baby screens. */
  immunizationScheduleLabel: string;
  contentReviewReminderDays: number;
  maintenanceMessage: string | null;
}

export interface DocumentRecord extends BaseRecord {
  userId: string;
  title: string;
  category: 'scan' | 'lab-result' | 'prescription' | 'birth-record' | 'immunization-card' | 'other';
  publicId: string;
  secureUrl: string | null;
  localHandle: string | null;
  mimeType: string;
  bytes: number;
  accessMode: 'public' | 'private';
  uploadedBy: string;
  notes: string | null;
}

/* ── Care sharing (the only path a provider sees a mother's record) ───── */

export interface CareLink extends BaseRecord {
  motherUserId: string;
  motherName: string;
  providerUserId: string | null;
  providerId: string | null;
  providerName: string;
  facilityId: string | null;
  facilityName: string;
  /** Granted by the mother, or by the provider with the mother's consent. */
  grantedBy: 'mother' | 'provider';
  status: 'active' | 'requested' | 'revoked';
  note: string | null;
}

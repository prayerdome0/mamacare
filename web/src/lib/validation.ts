import { z } from 'zod';

/**
 * Validation schemas shared by the browser and (via the same shapes) the API.
 * Messages are written for clinicians and patients, not developers, and every
 * schema returns a field-keyed error map for form rendering.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Zambian MSISDN (097…, +26097…) plus generic international fallback. */
export const PHONE_PATTERN = /^(\+?\d{8,15}|0[3-9]\d{8})$/;
export const PATIENT_ID_PATTERN = /^[A-Z]{2,4}-\d{4,8}$/;

const trimmed = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(min, `${label} must be at least ${min} characters`)
    .max(max, `${label} must be under ${max} characters`);

export const emailField = z
  .string()
  .trim()
  .min(1, 'Email is required')
  .regex(EMAIL_PATTERN, 'Enter a valid email address');

const phoneIsValid = (value: string): boolean => PHONE_PATTERN.test(value.replace(/[\s()-]/g, ''));

export const phoneField = (required = true) =>
  required
    ? z
        .string({ error: 'Phone number is required' })
        .trim()
        .min(1, 'Phone number is required')
        .refine(phoneIsValid, {
          message: 'Enter a valid phone number, e.g. 097 1234567 or +260 97 1234567',
        })
    : z
        .string()
        .trim()
        .refine((value) => value === '' || phoneIsValid(value), {
          message: 'Enter a valid phone number, e.g. 097 1234567 or +260 97 1234567',
        });

export const optionalText = (max = 400) => z.string().trim().max(max).or(z.literal(''));

export const isoDate = (label: string, opts: { notFuture?: boolean; notPast?: boolean } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .regex(/^\d{4}-\d{2}-\d{2}$/, `${label} must be a valid date`)
    .refine(
      (v) => {
        const d = new Date(`${v}T00:00:00`);
        return !Number.isNaN(d.getTime());
      },
      { message: `${label} is not a real date` },
    )
    .refine((v) => (opts.notFuture ? new Date(`${v}T23:59:59`).getTime() >= Date.now() : true), {
      message: `${label} cannot be in the past`,
    })
    .refine((v) => (opts.notPast ? new Date(`${v}T00:00:00`).getTime() <= Date.now() : true), {
      message: `${label} cannot be in the future`,
    });

export const timeField = z
  .string()
  .trim()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, 'Use a 24-hour time, e.g. 09:30');

/**
 * Numeric clinical fields arrive as raw input strings. `blank` treats "", null
 * and undefined as "not recorded" so an empty vitals box never becomes 0.
 */
const isBlank = (v: unknown): boolean => v === '' || v === null || v === undefined;

export const optionalNumber = (label: string, min: number, max: number) =>
  z.custom<number | undefined>(
    (v) => {
      if (isBlank(v)) return true;
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max;
    },
    { message: `${label} must be between ${min} and ${max}` },
  );

export const requiredNumber = (label: string, min: number, max: number) =>
  z.custom<number>(
    (v) => {
      if (isBlank(v)) return false;
      const n = Number(v);
      return Number.isFinite(n) && n >= min && n <= max;
    },
    { message: `${label} must be a number between ${min} and ${max}` },
  );

export const toNumber = (v: unknown): number | undefined => (isBlank(v) ? undefined : Number(v));

/* ── Auth ────────────────────────────────────────────────────────────── */

export const passwordPolicy = {
  minLength: 10,
  pattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/,
  message: 'Use at least 10 characters, with an uppercase letter, a lowercase letter and a number.',
} as const;

export const passwordField = z
  .string()
  .min(passwordPolicy.minLength, passwordPolicy.message)
  .max(64, 'Passwords must be 64 characters or fewer')
  .refine((v) => passwordPolicy.pattern.test(v), { message: passwordPolicy.message });

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const registerSchema = z
  .object({
    fullName: trimmed(3, 80, 'Full name'),
    email: emailField,
    phone: phoneField(true),
    password: passwordField,
    confirmPassword: z.string(),
    accountKind: z.enum(['PATIENT', 'HEALTH_WORKER']),
    requestedRole: z.enum(['MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'FACILITY_SUPERVISOR']).optional(),
    facilityId: z.string().trim().optional(),
    jobTitle: optionalText(60).optional(),
    preferredLanguage: z.string().trim().min(1).default('English'),
    acceptTerms: z.literal(true, { error: 'You must accept the terms and privacy notice to continue' }),
    acceptMarketing: z.boolean().optional(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => (v.accountKind === 'HEALTH_WORKER' ? Boolean(v.facilityId) : true), {
    message: 'Select the facility you work at',
    path: ['facilityId'],
  });
export type RegisterValues = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({ email: emailField });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordField,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: 'Choose a password you have not used before',
    path: ['newPassword'],
  });

export const profileUpdateSchema = z.object({
  fullName: trimmed(3, 80, 'Full name'),
  phone: phoneField(false),
  title: optionalText(60),
  licenseNumber: optionalText(40),
  preferredLanguage: z.string().trim().min(1).optional(),
});
export type ProfileUpdateValues = z.infer<typeof profileUpdateSchema>;

export const adminCreateUserSchema = z
  .object({
    fullName: trimmed(3, 80, 'Full name'),
    email: emailField,
    phone: phoneField(true),
    role: z.enum(['MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'FACILITY_SUPERVISOR', 'ADMIN']),
    facilityId: z.string().trim().min(1, 'Select a facility'),
    jobTitle: optionalText(60),
    temporaryPassword: passwordField,
    note: optionalText(240),
  })
  /**
   * The role selector exists for administrators only. The server ignores any
   * role that the caller is not entitled to grant, and ADMIN requires an
   * existing ADMIN (or the deployed allow-list) — a request can never
   * self-promote.
   */
  .refine(() => true);

/* ── Facility ────────────────────────────────────────────────────────── */

export const systemSettingsSchema = z.object({
  patientIdPrefix: z
    .string()
    .trim()
    .min(1, 'A prefix is required')
    .max(6, 'Keep the prefix short')
    .regex(/^[A-Z]+$/, 'Use upper-case letters, e.g. MC'),
  reminderDaysDefault: z.array(z.number().int().min(0).max(60)).min(1, 'Pick at least one reminder offset').max(4),
  smsEnabled: z.boolean(),
  pushEnabled: z.boolean(),
  registrationRequiresApproval: z.boolean(),
  allowPatientAccountSelfRegistration: z.boolean(),
  defaultLanguage: z.string().trim().min(2, 'Select a language'),
  dataRetentionPolicy: optionalText(240),
  clinicalRulesReviewedBy: optionalText(120),
  clinicalRulesReviewedAt: z.string().optional(),
});
export type SystemSettingsValues = z.infer<typeof systemSettingsSchema>;

export const facilitySchema = z.object({
  name: trimmed(3, 90, 'Facility name'),
  code: z.string().trim().min(2).max(12),
  type: z.enum([
    'DISTRICT_HOSPITAL',
    'PROVINCIAL_HOSPITAL',
    'HEALTH_CENTRE',
    'CLINIC',
    'MATERNITY_HOME',
    'HEALTH_POST',
  ]),
  district: trimmed(2, 60, 'District'),
  province: trimmed(2, 60, 'Province'),
  address: optionalText(180),
  phone: phoneField(false),
  email: z.string().trim().optional(),
  referralToFacilityId: z.string().trim().optional(),
  bedCount: z.coerce.number().int().min(0).max(5000).optional(),
  hasMaternityWard: z.boolean().default(true),
  hasUltrasound: z.boolean().default(false),
  hasLaboratory: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type FacilityValues = z.infer<typeof facilitySchema>;

/* ── Mother registration ─────────────────────────────────────────────── */

export const motherSchema = z
  .object({
    fullName: trimmed(3, 80, 'Full name'),
    dateOfBirth: z.string().trim().optional(),
    ageYears: z.coerce
      .number()
      .int('Age must be a whole number')
      .refine((v) => Number.isNaN(v) || (v >= 10 && v <= 60), { message: 'Age must be between 10 and 60' })
      .optional(),
    phone: phoneField(true),
    alternatePhone: phoneField(false),
    address: optionalText(200),
    community: trimmed(2, 80, 'Community / area'),
    chiefName: optionalText(60),
    landmark: optionalText(120),
    emergencyName: optionalText(70),
    emergencyRelation: optionalText(40),
    emergencyPhone: phoneField(false),
    preferredLanguage: z.string().trim().min(1, 'Select a language'),
    literacyLevel: z.enum(['NONE', 'PRIMARY', 'SECONDARY', 'TERTIARY']).optional(),
    maritalStatus: z.enum(['SINGLE', 'MARRIED', 'COHABITING', 'DIVORCED', 'WIDOWED']).optional(),
    occupation: optionalText(60),
    husbandName: optionalText(70),
    husbandPhone: phoneField(false),
    bloodGroup: optionalText(6),
    allergies: optionalText(240),
    chronicConditions: z.array(z.string()).default([]),
    registrationFacilityId: z.string().trim().min(1, 'Select a facility'),
    assignedChwUserId: z.string().trim().optional(),
    catchmentArea: optionalText(40),
    consentAccepted: z.literal(true, { error: 'Consent must be recorded before a patient can be registered' }),
  })
  .refine(
    (v) => {
      if (!v.dateOfBirth) return true;
      const dob = new Date(v.dateOfBirth);
      return !Number.isNaN(dob.getTime()) && dob < new Date();
    },
    { message: 'Date of birth must be in the past', path: ['dateOfBirth'] },
  );
export type MotherValues = z.infer<typeof motherSchema>;

export const pregnancySchema = z
  .object({
    gravida: z.coerce.number().int().min(1, 'Gravida must be at least 1').max(20, 'Check the entered value'),
    para: z.coerce.number().int().min(0).max(20).optional().default(0),
    livingChildren: z.coerce.number().int().min(0).max(20).optional(),
    lmpDate: z.string().trim().optional(),
    eddDate: z.string().trim().optional(),
    datingMethod: z.enum(['LMP', 'ULTRASOUND', 'CLINICAL']).default('LMP'),
    confirmedAt: z.string().trim().optional(),
    gestationalWeeks: z.coerce.number().int().min(0).max(45).optional(),
    gestationalDays: z.coerce.number().int().min(0).max(6).optional(),
    previousCesarean: z.boolean().default(false),
    gestationCount: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
    previousComplications: z.array(z.string()).default([]),
    riskFactors: z.array(z.string()).default([]),
    notes: optionalText(600),
  })
  .refine((v) => Boolean(v.lmpDate) || Boolean(v.eddDate) || Boolean(v.gestationalWeeks), {
    message: 'Provide the LMP, an EDD, or a measured gestational age',
    path: ['lmpDate'],
  })
  .refine((v) => (v.para ?? 0) <= (v.gravida ?? 1), {
    message: 'Para cannot be greater than Gravida',
    path: ['para'],
  })
  .refine(
    (v) => {
      if (!v.lmpDate) return true;
      const lmp = new Date(v.lmpDate).getTime();
      return Number.isNaN(lmp) || lmp <= Date.now();
    },
    { message: 'LMP cannot be in the future', path: ['lmpDate'] },
  );
export type PregnancyValues = z.infer<typeof pregnancySchema>;

/* ── ANC visit ─────────────────────────────────────────────────────────── */

export const ancVisitSchema = z
  .object({
    visitDate: isoDate('Visit date', { notPast: true }),
    visitType: z.enum(['BOOKING', 'ROUTINE', 'FOLLOW_UP', 'URGENT', 'REVIEW', 'PMTCT', 'ULTRASOUND']),
    reasonForVisit: optionalText(240),
    gestationalWeeks: z.coerce.number().int().min(0).max(45).optional(),
    gestationalDays: z.coerce.number().int().min(0).max(6).optional(),

    bloodPressure: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || /^\d{2,3}\s*\/\s*\d{2,3}$/.test(v), {
        message: 'Enter blood pressure as systolic/diastolic, e.g. 124/78',
      })
      .refine((v) => {
        if (!v) return true;
        const [sys = 0, dia = 0] = v.split('/').map((s) => Number(s.trim()));
        return sys >= 60 && sys <= 260 && dia >= 30 && dia <= 180 && sys > dia;
      }, { message: 'Check the blood pressure values (e.g. 90–260 over 40–180, systolic above diastolic)' }),

    pulse: optionalNumber('Pulse', 30, 220),
    temperatureC: optionalNumber('Temperature', 30, 43),
    respiratoryRate: optionalNumber('Respiratory rate', 6, 60),
    weightKg: optionalNumber('Weight', 25, 250),
    heightCm: optionalNumber('Height', 120, 220),
    muacCm: optionalNumber('MUAC', 10, 45),
    fundalHeightCm: optionalNumber('Fundal height', 4, 60),
    fetalHeartRate: optionalNumber('Fetal heart rate', 50, 220),
    oedema: z.enum(['NONE', 'MILD', 'SEVERE']).optional(),
    urineProtein: z.enum(['NONE', 'TRACE', 'PLUS_1', 'PLUS_2', 'PLUS_3']).optional(),
    urineGlucose: z.enum(['NONE', 'TRACE', 'PLUS_1', 'PLUS_2', 'PLUS_3']).optional(),
    haemoglobinGdl: optionalNumber('Haemoglobin', 2, 22),
    bloodGlucoseMmoll: optionalNumber('Blood glucose', 1, 40),
    presentation: z.enum(['VERTEX', 'BREECH', 'TRANSVERSE', 'UNDETERMINED']).optional(),

    dangerSigns: z.array(z.string()).default([]),
    otherDangerSignNote: optionalText(300),
    noneReported: z.boolean().default(false),

    note: optionalText(1200),
    counselling: z.array(z.string()).default([]),
    outcome: z
      .enum(['CONTINUE_CARE', 'REFERRED', 'ADMITTED', 'LOST_TO_FOLLOWUP', 'DELIVERED'])
      .optional(),
    nextAppointmentDate: z.string().trim().optional(),
  })
  .refine((v) => v.dangerSigns.length > 0 || v.noneReported, {
    message: 'Record the danger-sign screening: select at least one sign, or “None reported”',
    path: ['dangerSigns'],
  })
  .refine(
    (v) =>
      v.dangerSigns.length === 0 || !v.dangerSigns.includes('OTHER_CONCERN') || Boolean(v.otherDangerSignNote),
    {
      message: 'Describe the other concerning symptom',
      path: ['otherDangerSignNote'],
    },
  )
  .refine((v) => !v.nextAppointmentDate || !Number.isNaN(new Date(v.nextAppointmentDate).getTime()), {
    message: 'Next appointment date is invalid',
    path: ['nextAppointmentDate'],
  });
export type AncVisitValues = z.infer<typeof ancVisitSchema>;

export const parseBloodPressure = (value?: string | null): { systolic: number; diastolic: number } | null => {
  if (!value) return null;
  const match = value.trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/);
  if (!match) return null;
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
};

/* ── Appointments / alerts / referrals ───────────────────────────────── */

export const appointmentSchema = z.object({
  motherId: z.string().trim().min(1, 'Select a patient'),
  scheduledFor: isoDate('Appointment date', { notFuture: false }),
  time: timeField,
  facilityId: z.string().trim().min(1, 'Select a facility'),
  type: z.enum([
    'ANC',
    'FOLLOW_UP',
    'REVIEW',
    'LABORATORY',
    'ULTRASOUND',
    'PMTCT',
    'IMMUNISATION',
    'POSTNATAL',
    'OTHER',
  ]),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(30),
  assignedUserId: z.string().trim().optional(),
  reason: optionalText(240),
  notes: optionalText(600),
  reminderDays: z.array(z.number()).default([7, 1]),
  smsEnabled: z.boolean().default(true),
});
export type AppointmentValues = z.infer<typeof appointmentSchema>;

export const appointmentStatusSchema = z.enum([
  'SCHEDULED',
  'CONFIRMED',
  'COMPLETED',
  'MISSED',
  'CANCELLED',
  'RESCHEDULED',
]);

export const alertSchema = z.object({
  motherId: z.string().trim().min(1, 'Select a patient'),
  level: z.enum(['RED', 'AMBER']),
  category: z.enum([
    'DANGER_SIGN',
    'BLOOD_PRESSURE',
    'VITALS',
    'FETAL',
    'INFECTION',
    'NUTRITION',
    'LABORATORY',
    'RISK_PROFILE',
    'MISSED_VISIT',
    'OTHER',
  ]),
  title: trimmed(4, 90, 'Title'),
  message: trimmed(10, 600, 'Clinical note'),
  assignedUserId: z.string().trim().optional(),
});
export type AlertValues = z.infer<typeof alertSchema>;

export const alertActionSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'ASSESSED', 'REFERRED', 'FOLLOW_UP_REQUIRED', 'RESOLVED']),
  note: z.string().trim().min(3, 'Add a short action note').max(600),
  followUpDate: z.string().trim().optional(),
  createReferral: z.boolean().default(false),
});

export const referralSchema = z.object({
  motherId: z.string().trim().min(1, 'Select a patient'),
  reason: trimmed(6, 300, 'Reason for referral'),
  clinicalQuestion: optionalText(300),
  urgency: z.enum(['EMERGENCY', 'URGENT', 'ROUTINE']),
  scheduledAt: isoDate('Date'),
  time: timeField,
  originFacilityId: z.string().trim().min(1, 'Select the referring facility'),
  receivingFacilityId: z.string().trim().min(1, 'Select the receiving facility'),
  transport: z.enum(['AMBULANCE', 'PRIVATE_CAR', 'OTHER', 'NONE']),
  transportNote: optionalText(160),
  clinicalNotes: z.string().trim().min(10, 'Summarise the clinical situation (at least 10 characters)').max(2500),
});
export type ReferralValues = z.infer<typeof referralSchema>;

export const referralStatusSchema = z.enum([
  'ACTIVE',
  'RECEIVED',
  'ASSESSMENT_COMPLETED',
  'TREATMENT',
  'ADMISSION',
  'DISCHARGED',
  'REFERRED_ONWARD',
  'FOLLOW_UP_REQUIRED',
  'CLOSED',
]);

/* ── Documents ───────────────────────────────────────────────────────── */

export const DOCUMENT_ACCEPTED_MIME = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'text/plain',
];
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Images only — used by the media uploader, which must not accept PDF/TXT. */
export const IMAGE_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/heic'];

export const documentMetaSchema = z.object({
  name: trimmed(3, 120, 'Document name'),
  category: z.enum(['REPORT', 'MEDICAL', 'REFERRAL', 'FACILITY', 'EDUCATION', 'CONSENT', 'LABORATORY', 'OTHER']),
  description: optionalText(400),
  motherId: z.string().trim().optional(),
  facilityId: z.string().trim().optional(),
});

export function validateFile(
  file: { name: string; type: string; size: number },
  opts: { accept?: string[]; maxBytes?: number } = {},
): string | null {
  return validateFileImpl(file, opts);
}

/** Kept as a function so it can be unit-tested without a DOM File constructor. */
function validateFileImpl(
  file: { name: string; type: string; size: number },
  opts: { accept?: string[]; maxBytes?: number },
): string | null {
  const maxBytes = opts.maxBytes ?? MAX_DOCUMENT_BYTES;
  const accepted = opts.accept ?? DOCUMENT_ACCEPTED_MIME;
  const extension = file.name.includes('.') ? `.${file.name.split('.').pop()}` : '';
  if (file.size === 0) return 'The selected file is empty.';
  if (file.size > maxBytes) {
    return `The file is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is ${(maxBytes / 1024 / 1024).toFixed(0)} MB.`;
  }
  const type = file.type.toLowerCase();
  const extensionAllowed = /\.(pdf|png|jpe?g|webp|heic|txt)$/i.test(extension);
  const typeAllowed = accepted.includes(type) || (type === '' && extensionAllowed);
  if (!typeAllowed) return `Unsupported file type${extension ? ` (${extension})` : ''}. Allowed: PDF, PNG, JPG, WEBP or TXT.`;
  return null;
}

export { validateFileImpl as validateFileLike };

/* ── Education ───────────────────────────────────────────────────────── */

export const educationSchema = z.object({
  title: trimmed(6, 120, 'Title'),
  summary: trimmed(20, 320, 'Summary'),
  body: trimmed(40, 12000, 'Content'),
  language: z.string().trim().min(1, 'Select a language'),
  topics: z.array(z.string()).min(1, 'Select at least one topic'),
  audience: z.array(z.enum(['MOTHER', 'HEALTH_WORKER'])).min(1, 'Select an audience'),
  stage: z.enum([
    'PRECONCEPTION',
    'FIRST_TRIMESTER',
    'SECOND_TRIMESTER',
    'THIRD_TRIMESTER',
    'LABOUR',
    'POSTNATAL',
    'FAMILY_PLANNING',
    'GENERAL',
  ]),
  status: z.enum(['DRAFT', 'PUBLISHED']),
  facilityId: z.string().trim().optional(),
});

/* ── Helpers ─────────────────────────────────────────────────────────── */

export type FieldErrors = Record<string, string>;

export function extractFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export function validate<T>(schema: z.ZodType<T>, values: unknown): { ok: true; value: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, errors: extractFieldErrors(result.error) };
}

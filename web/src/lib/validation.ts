/**
 * Validation schemas.
 *
 * One source of truth for what a form accepts. Messages are written for mothers
 * and health workers, not developers, and every schema can return a field-keyed
 * error map so a form can show the problem next to the input that caused it.
 *
 * Medical-safety note: the pregnancy and observation schemas validate *dates and
 * numbers*. Nothing here interprets a measurement — there is no threshold in this
 * file that produces a clinical conclusion.
 */

import { z } from 'zod';
import { defaultCountry } from '@/config/geo';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Zambian MSISDN (097…, +26097…) plus a generic international fallback. */
export const PHONE_PATTERN = /^(\+?\d{8,15}|0[3-9]\d{8})$/;

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
        .string()
        .trim()
        .min(1, 'Phone number is required')
        .refine(phoneIsValid, `Enter a valid phone number, for example ${defaultCountry.example}`)
    : z
        .string()
        .trim()
        .refine((value) => value === '' || phoneIsValid(value), `Enter a valid phone number, for example ${defaultCountry.example}`);

export const optionalText = (max = 400) => z.string().trim().max(max).or(z.literal(''));

const isBlank = (value: unknown): boolean => value === '' || value === null || value === undefined;

export const isoDate = (label: string, opts: { notFuture?: boolean; notPast?: boolean; maxPastDays?: number } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => !Number.isNaN(new Date(value).getTime()), `${label} is not a valid date`)
    .refine((value) => !opts.notFuture || new Date(value) <= endOfToday(), `${label} cannot be in the future`)
    .refine((value) => !opts.notPast || new Date(value) >= startOfToday(), `${label} cannot be in the past`)
    .refine(
      (value) => !opts.maxPastDays || daysSince(value) <= opts.maxPastDays,
      `${label} is more than ${opts.maxPastDays ?? 0} days ago — check the date`,
    );

const endOfToday = (): Date => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};

const startOfToday = (): Date => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
};

const daysSince = (value: string): number => Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);

export const timeField = z
  .string()
  .trim()
  .min(1, 'Choose a time')
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use the 24-hour format, for example 09:30');

export const toNumber = (value: unknown): number | undefined => (isBlank(value) ? undefined : Number(value));

/* ── Passwords ───────────────────────────────────────────────────────── */

/** Deliberately achievable: a rule nobody can follow is a rule nobody follows. */
export const passwordPolicy = {
  minLength: 10,
  /** A capital letter and a digit. Length is enforced separately by the schema. */
  pattern: /^(?=.*[A-Z])(?=.*\d).+$/,
  message: 'Use at least 10 characters, including a capital letter and a number.',
} as const;

export const passwordField = z
  .string()
  .min(passwordPolicy.minLength, passwordPolicy.message)
  .max(128, 'Passwords must be 128 characters or fewer')
  .refine((value) => passwordPolicy.pattern.test(value), { message: passwordPolicy.message });

/* ── Auth ────────────────────────────────────────────────────────────── */

export const signInSchema = z.object({
  email: emailField,
  password: z.string().min(1, 'Enter your password'),
  remember: z.boolean().optional(),
});
export type SignInValues = z.infer<typeof signInSchema>;

export const forgotPasswordSchema = z.object({ email: emailField });
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordField,
    confirmPassword: z.string().min(1, 'Confirm your new password'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

/* ── Profile ─────────────────────────────────────────────────────────── */

export const profileSchema = z.object({
  fullName: trimmed(2, 120, 'Full name'),
  phone: phoneField(false),
  dateOfBirth: z.string().trim().optional().or(z.literal('')),
  country: z.string().min(2, 'Select your country'),
  language: z.enum(['en', 'bem', 'ny', 'toi', 'loz']),
  emergencyName: optionalText(120),
  emergencyPhone: z.string().trim().optional().or(z.literal('')),
  emergencyRelationship: optionalText(60),
});
export type ProfileValues = z.infer<typeof profileSchema>;

/* ── Pregnancy setup ─────────────────────────────────────────────────── */

export const pregnancySetupSchema = z
  .object({
    lmpDate: z.string().trim().optional().or(z.literal('')),
    eddDate: z.string().trim().optional().or(z.literal('')),
    datingMethod: z.enum(['lmp', 'ultrasound', 'clinician', 'unknown']),
    previousPregnancies: z.coerce.number().int().min(0).max(20).default(0),
    previousLiveBirths: z.coerce.number().int().min(0).max(20).default(0),
    facilityId: z.string().trim().optional().or(z.literal('')),
  })
  .refine((value) => Boolean(value.lmpDate || value.eddDate), {
    message: 'Enter your last menstrual period or your due date',
    path: ['lmpDate'],
  })
  .refine((value) => !value.lmpDate || daysSince(value.lmpDate) <= 320, {
    message: 'That date is more than 45 weeks ago — check it',
    path: ['lmpDate'],
  })
  .refine((value) => !value.lmpDate || daysSince(value.lmpDate) >= -14, {
    message: 'The last menstrual period cannot be in the future',
    path: ['lmpDate'],
  })
  .refine((value) => !value.eddDate || daysSince(value.eddDate) <= 320, {
    message: 'That due date is too far in the past — check it',
    path: ['eddDate'],
  })
  .refine((value) => !value.eddDate || daysSince(value.eddDate) >= -320, {
    message: 'That due date is too far in the future — check it',
    path: ['eddDate'],
  })
  .refine(
    (value) => !value.lmpDate || !value.eddDate || new Date(value.eddDate) > new Date(value.lmpDate),
    { message: 'The due date must be after the last menstrual period', path: ['eddDate'] },
  );
export type PregnancySetupValues = z.infer<typeof pregnancySetupSchema>;

/* ── Appointments ────────────────────────────────────────────────────── */

export const appointmentSchema = z.object({
  kind: z.enum(['antenatal', 'postnatal', 'baby', 'immunization', 'lab', 'other']),
  date: isoDate('Appointment date', { notPast: true }),
  time: z.string().trim().optional().or(z.literal('')),
  facilityName: trimmed(2, 120, 'Facility'),
  facilityId: z.string().trim().optional().or(z.literal('')),
  purpose: trimmed(3, 200, 'Purpose'),
  babyId: z.string().trim().optional().or(z.literal('')),
  questions: optionalText(1000),
  sharedWithSupporter: z.boolean().optional(),
});
export type AppointmentValues = z.infer<typeof appointmentSchema>;

/* ── Reminders ───────────────────────────────────────────────────────── */

export const reminderSchema = z
  .object({
    kind: z.enum(['medication', 'supplement', 'custom']),
    title: trimmed(2, 120, 'Reminder name'),
    medicine: optionalText(120),
    dose: optionalText(80),
    times: z.array(z.string()).min(1, 'Choose at least one time'),
    frequency: z.enum(['daily', 'weekdays', 'weekly', 'specific-days', 'once']),
    daysOfWeek: z.array(z.number().int().min(0).max(6)),
    startDate: isoDate('Start date', { notPast: false }),
    endDate: z.string().trim().optional().or(z.literal('')),
    prescribedBy: optionalText(120),
    instructions: optionalText(400),
    sharedWithSupporter: z.boolean().optional(),
  })
  .refine((value) => value.frequency !== 'specific-days' || value.daysOfWeek.length > 0, {
    message: 'Choose which days this reminder repeats on',
    path: ['daysOfWeek'],
  })
  .refine((value) => !value.endDate || new Date(value.endDate) >= new Date(value.startDate), {
    message: 'The end date must be on or after the start date',
    path: ['endDate'],
  });
export type ReminderValues = z.infer<typeof reminderSchema>;

/* ── Baby ────────────────────────────────────────────────────────────── */

export const babySchema = z.object({
  name: trimmed(1, 80, 'Baby name'),
  dateOfBirth: isoDate('Date of birth', { notFuture: true, maxPastDays: 6570 }),
  sex: z.enum(['female', 'male', 'undisclosed']),
  birthWeightKg: z.coerce.number().min(0.3).max(8).optional(),
  birthLengthCm: z.coerce.number().min(20).max(70).optional(),
  headCircumferenceCm: z.coerce.number().min(15).max(50).optional(),
  birthFacilityId: z.string().trim().optional().or(z.literal('')),
  birthNotes: optionalText(500),
});
export type BabyValues = z.infer<typeof babySchema>;

/* ── Journal ─────────────────────────────────────────────────────────── */

export const journalSchema = z.object({
  date: isoDate('Entry date', { notFuture: true }),
  title: trimmed(1, 120, 'Title'),
  body: trimmed(1, 8000, 'Entry'),
  mood: z.enum(['great', 'good', 'okay', 'low', 'struggling']).optional().or(z.literal('')),
  tags: optionalText(120),
  babyId: z.string().trim().optional().or(z.literal('')),
});
export type JournalValues = z.infer<typeof journalSchema>;

/* ── Observations (recorded, never interpreted) ───────────────────────── */

export const observationSchema = z.object({
  kind: z.enum(['blood-pressure', 'weight', 'height', 'hb', 'glucose', 'fundal-height', 'symptom', 'fetal-movement', 'mood', 'other']),
  label: trimmed(2, 80, 'What you measured'),
  value: z.string().trim().min(1, 'Enter the reading').max(40),
  unit: optionalText(20),
  notes: optionalText(400),
  recordedBy: z.enum(['self', 'provider']),
  appointmentId: z.string().trim().optional().or(z.literal('')),
});
export type ObservationValues = z.infer<typeof observationSchema>;

/** Splits "120/80" — validation only; no interpretation of the result. */
export const parseBloodPressure = (value?: string | null): { systolic: number; diastolic: number } | null => {
  if (!value) return null;
  const match = /^\s*(\d{2,3})\s*[/|]\s*(\d{2,3})\s*$/.exec(value);
  if (!match) return null;
  return { systolic: Number(match[1]), diastolic: Number(match[2]) };
};

/* ── Facilities (admin / facility administrator) ─────────────────────── */

export const facilitySchema = z.object({
  name: trimmed(3, 140, 'Facility name'),
  type: z.enum([
    'government-hospital',
    'private-hospital',
    'clinic',
    'health-post',
    'maternity-home',
    'pharmacy',
    'laboratory',
  ]),
  address: trimmed(3, 240, 'Address'),
  city: trimmed(2, 80, 'City or town'),
  province: trimmed(2, 80, 'Province'),
  country: z.string().min(2),
  phone: z.string().trim().optional().or(z.literal('')),
  emergencyPhone: z.string().trim().optional().or(z.literal('')),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  openingHours: trimmed(2, 200, 'Opening hours'),
  hasMaternity: z.boolean(),
  has24HourEmergency: z.boolean(),
  services: z.array(z.string()),
  maternalServices: z.array(z.string()),
  active: z.boolean(),
});
export type FacilityValues = z.infer<typeof facilitySchema>;

/* ── Provider registration and directory ─────────────────────────────── */

export const providerRegistrationSchema = z.object({
  fullName: trimmed(2, 120, 'Full name'),
  title: optionalText(60),
  profession: z.enum(['midwife', 'nurse', 'doctor', 'maternal-educator', 'community-health-worker', 'pharmacist']),
  facilityId: z.string().trim().optional().or(z.literal('')),
  facilityName: trimmed(2, 140, 'Facility'),
  licenseNumber: optionalText(60),
  languages: optionalText(160),
  bio: optionalText(800),
  phone: phoneField(false),
});
export type ProviderRegistrationValues = z.infer<typeof providerRegistrationSchema>;

/* ── Articles ────────────────────────────────────────────────────────── */

export const articleSchema = z.object({
  title: trimmed(6, 140, 'Title'),
  summary: trimmed(20, 320, 'Summary'),
  category: z.enum([
    'pregnancy',
    'nutrition',
    'antenatal-care',
    'activity',
    'rest',
    'wellbeing',
    'labour',
    'postnatal',
    'newborn',
    'breastfeeding',
    'immunization',
  ]),
  audience: z.enum(['public', 'mother', 'provider']),
  language: z.enum(['en', 'bem', 'ny', 'toi', 'loz']),
  weekNumber: z.coerce.number().int().min(1).max(42).optional(),
  tags: optionalText(160),
  blocks: z.array(z.unknown()).min(1, 'Add at least one section of content'),
});
export type ArticleValues = z.infer<typeof articleSchema>;

/* ── Family support and care sharing ─────────────────────────────────── */

export const supporterInviteSchema = z.object({
  supporterName: trimmed(2, 120, 'Their name'),
  supporterEmail: emailField,
  relationship: trimmed(2, 60, 'Relationship'),
  appointments: z.boolean(),
  reminders: z.boolean(),
  education: z.boolean(),
  milestones: z.boolean(),
});
export type SupporterInviteValues = z.infer<typeof supporterInviteSchema>;

export const careRequestSchema = z.object({
  motherUserId: z.string().min(1, 'Choose the patient'),
  note: optionalText(300),
});
export type CareRequestValues = z.infer<typeof careRequestSchema>;

/* ── Feedback ────────────────────────────────────────────────────────── */

export const feedbackSchema = z.object({
  email: z.string().trim().optional().or(z.literal('')),
  topic: z.enum(['bug', 'content', 'feature', 'facility-data', 'other']),
  message: trimmed(10, 4000, 'Message'),
});
export type FeedbackValues = z.infer<typeof feedbackSchema>;

/* ── Settings ────────────────────────────────────────────────────────── */

export const settingsSchema = z.object({
  registrationOpen: z.boolean(),
  providerApprovalsRequired: z.boolean(),
  defaultCountry: z.string().min(2),
  supportEmail: emailField,
  supportPhone: z.string().trim().optional().or(z.literal('')),
  immunizationScheduleLabel: trimmed(4, 120, 'Immunization schedule label'),
  contentReviewReminderDays: z.coerce.number().int().min(30).max(1825),
  maintenanceMessage: optionalText(400),
});
export type SettingsValues = z.infer<typeof settingsSchema>;

/* ── Files ───────────────────────────────────────────────────────────── */

export const DOCUMENT_ACCEPTED_MIME = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp', 'image/heic', 'text/plain'];
export const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Images only — the media uploader must not accept PDF/TXT. */
export const IMAGE_ACCEPTED_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/heic'];

export function validateFile(
  file: { name: string; type: string; size: number },
  opts: { accept?: string[]; maxBytes?: number } = {},
): string | null {
  return validateFileImpl(file, opts);
}

/** Kept as a separate function so it can be unit-tested without a DOM File. */
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

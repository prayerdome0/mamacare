/**
 * Registration.
 *
 * One flow for all three self-service account kinds, because what differs is only
 * what gets written afterwards:
 *
 *  • MOTHER     → profile (+ an optional pregnancy so the tracker works on day one)
 *  • SUPPORTER  → profile with `supportsUserId` resolved from the invited email
 *  • PROVIDER   → profile + a directory record that stays `pending` until an
 *                 administrator verifies it
 *
 * Nobody may self-assign ADMIN or FACILITY_ADMIN. The first administrator on a
 * fresh install comes from `VITE_BOOTSTRAP_ADMIN_EMAILS`, and after that only an
 * existing administrator can grant a privileged role.
 */

import { z } from 'zod';
import { passwordPolicy } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { slugify } from '@/lib/ids';
import { defaultProfile } from '@/services/auth/profile-lookup';
import { localAuth } from '@/services/auth/local-auth';
import { firebaseAuth } from '@/services/auth/firebase-auth';
import { services } from '@/services/session-store';
import { logAudit } from '@/services/audit';
import { COUNTRIES } from '@/config/geo';
import { setPolicyContext } from '@/services/policy/policy';
import type { Actor } from '@/services/data/contract';
import { DEFAULT_NOTIFICATION_PREFS } from '@/types/domain';
import type { HealthcareProvider, LanguageCode, Profession, Role, UserProfile } from '@/types/domain';

export const SELF_SERVICE_ROLES: Role[] = ['MOTHER', 'PATIENT', 'SUPPORTER', 'PROVIDER', 'NURSE'];

export const registrationSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Enter your full name').max(120),
    email: z.string().trim().toLowerCase().email('Enter a valid email address'),
    password: z.string().min(passwordPolicy.minLength, passwordPolicy.message).max(128),
    confirmPassword: z.string(),
    phone: z.string().trim().max(32).optional().or(z.literal('')),
    dateOfBirth: z.string().trim().optional().or(z.literal('')),
    country: z.string().min(2),
    language: z.enum(['en', 'bem', 'ny', 'toi', 'loz']),
    role: z.enum(['MOTHER', 'PATIENT', 'SUPPORTER', 'PROVIDER', 'NURSE']),
    emergencyName: z.string().trim().optional().or(z.literal('')),
    emergencyPhone: z.string().trim().optional().or(z.literal('')),
    emergencyRelationship: z.string().trim().optional().or(z.literal('')),
    // supporter
    supportsEmail: z.string().trim().optional().or(z.literal('')),
    // provider / nurse
    profession: z
      .enum(['midwife', 'nurse', 'doctor', 'maternal-educator', 'community-health-worker', 'pharmacist'])
      .optional(),
    title: z.string().trim().optional().or(z.literal('')),
    licenseNumber: z.string().trim().optional().or(z.literal('')),
    facilityId: z.string().trim().optional().or(z.literal('')),
    facilityName: z.string().trim().optional().or(z.literal('')),
    consent: z.boolean(),
  })
  .refine((input) => input.password === input.confirmPassword, {
    message: 'The two passwords do not match',
    path: ['confirmPassword'],
  })
  .refine((input) => input.consent === true, {
    message: 'You must agree before creating an account',
    path: ['consent'],
  });

export type RegistrationInput = z.input<typeof registrationSchema>;

/** Field-level errors, so the form can show them next to the right input. */
export function validationErrors(input: unknown): Record<string, string> {
  const result = registrationSchema.safeParse(input);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export interface RegisterOptions {
  /** Pregnancy details captured on the same screen (mothers only). */
  pregnancy?: {
    lmpDate: string | null;
    eddDate: string | null;
    datingMethod: 'lmp' | 'ultrasound' | 'clinician' | 'unknown';
    previousPregnancies: number;
    previousLiveBirths: number;
  };
}

export async function register(input: RegistrationInput, options: RegisterOptions = {}): Promise<Actor> {
  const parsed = registrationSchema.parse(input);
  const registry = services();

  const settings = await registry.data.get('settings', 'global').catch(() => null);
  if (settings && settings.registrationOpen === false) {
    throw new AppError('Registration is currently closed on this deployment. Contact support for an account.', 'FORBIDDEN');
  }

  const countryCode = COUNTRIES.some((country) => country.code === parsed.country) ? parsed.country : 'ZM';
  const requiresApproval = settings ? settings.providerApprovalsRequired !== false : true;

  const isStaffRole = parsed.role === 'PROVIDER' || parsed.role === 'NURSE';
  const roleValue: Role = parsed.role === 'NURSE' ? 'PROVIDER' : parsed.role === 'PATIENT' ? 'MOTHER' : parsed.role;

  const profileBase = {
    fullName: parsed.fullName,
    email: parsed.email,
    phone: parsed.phone || null,
    dateOfBirth: parsed.dateOfBirth || null,
    country: countryCode,
    language: parsed.language as LanguageCode,
    role: roleValue,
    status: (isStaffRole && requiresApproval ? 'PENDING_APPROVAL' : 'ACTIVE') as UserProfile['status'],
    emergencyContact:
      parsed.emergencyName && parsed.emergencyPhone
        ? { name: parsed.emergencyName, phone: parsed.emergencyPhone, relationship: parsed.emergencyRelationship || 'Family' }
        : null,
    supportsUserId: null,
    consentAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
    privilegeVersion: 1,
    photoUrl: null,
    photoPublicId: null,
    providerId: null,
    facilityId: parsed.facilityId || null,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
  } satisfies Omit<UserProfile, 'id' | 'uid' | 'createdAt' | 'updatedAt'>;

  /* Resolve a supporter's invitation before the account exists, so the link is
   * attached at creation and the mother does not have to approve twice. */
  let supportsUserId: string | null = null;
  if (parsed.role === 'SUPPORTER' && parsed.supportsEmail) {
    const invitations = await registry.data.rows('supporters', {
        where: [{ field: 'supporterEmail', op: '==', value: parsed.supportsEmail.toLowerCase() }],
      })
      .catch(() => []);
    supportsUserId = invitations.find((row) => row.status !== 'revoked')?.motherUserId ?? null;
  }

  const profile = { ...profileBase, supportsUserId };

  /* Create the identity, then the profile. */
  if (registry.auth.kind === 'local') {
    await localAuth.createAccount({ email: parsed.email, password: parsed.password, profile });
  } else {
    await firebaseAuth.createAccount({ email: parsed.email, password: parsed.password, profile });
  }

  const actor = await registry.auth.refreshClaims();
  if (!actor) throw new AppError('Your account was created but could not be loaded. Please sign in.', 'UNKNOWN', { retryable: true });

  /* Provider directory record. */
  if (parsed.role === 'PROVIDER' && parsed.profession) {
    // The device policy mirrors the Firestore rule that provider records are
    // born `pending`; the settings flag is published explicitly here because
    // the registration flow is the one place an approved record may be born,
    // and only on deployments that have turned approvals off.
    setPolicyContext({ providerApprovalsRequired: requiresApproval });
    const provider = await registry.data.create('providers', {
      userId: actor.uid,
      fullName: parsed.fullName,
      title: parsed.title || null,
      profession: parsed.profession as Profession,
      facilityId: parsed.facilityId || null,
      facilityName: parsed.facilityName || 'Not stated',
      licenseNumber: parsed.licenseNumber || null,
      languages: [parsed.language === 'en' ? 'English' : parsed.language],
      bio: null,
      phone: parsed.phone || null,
      email: parsed.email,
      photoUrl: null,
      photoPublicId: null,
      status: requiresApproval ? 'pending' : 'approved',
      verifiedBy: null,
      verifiedAt: requiresApproval ? null : new Date().toISOString(),
      rejectionReason: null,
      acceptingNewPatients: false,
      listedInDirectory: !requiresApproval,
    } as Omit<HealthcareProvider, 'id' | 'createdAt'>);
    await registry.data.update('users', actor.uid, { providerId: provider.id }).catch(() => undefined);
  }

  /* Pregnancy, so the tracker is useful from the first screen. */
  if ((parsed.role === 'MOTHER' || parsed.role === 'PATIENT') && options.pregnancy && (options.pregnancy.lmpDate || options.pregnancy.eddDate)) {
    await registry.data.create('pregnancies', {
      userId: actor.uid,
      lmpDate: options.pregnancy.lmpDate,
      eddDate: options.pregnancy.eddDate,
      datingMethod: options.pregnancy.datingMethod,
      previousPregnancies: options.pregnancy.previousPregnancies,
      previousLiveBirths: options.pregnancy.previousLiveBirths,
      status: 'active',
      deliveryDate: null,
      postnatalSince: null,
      facilityId: parsed.facilityId || null,
      notes: null,
    }).catch(() => undefined);
  }

  /* Claim any supporter invitation addressed to this email. */
  if (parsed.role === 'SUPPORTER') {
    const invitations = await registry.data.rows('supporters', {
        where: [{ field: 'supporterEmail', op: '==', value: parsed.email }],
      })
      .catch(() => []);
    for (const invitation of invitations) {
      await registry.data
        .update('supporters', invitation.id, {
          supporterUserId: actor.uid,
          status: 'active',
          acceptedAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    }
  }

  await logAudit('register', 'users', actor.uid, `${parsed.role} · ${slugify(parsed.email)}`);
  return actor;
}

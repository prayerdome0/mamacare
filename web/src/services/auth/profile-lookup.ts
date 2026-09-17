/**
 * Turning a stored profile into a session `Actor`.
 *
 * The profile document is the readable source of truth for role and facility;
 * Firebase custom claims are the authoritative source when they are present,
 * because only they can gate a hosted Firestore query. This module merges the
 * two and records *where* the role came from, so the interface can explain a
 * mismatch instead of silently showing the wrong dashboard.
 */

import type { Actor } from '@/services/data/contract';
import type { AccountStatus, LanguageCode, Role, UserProfile } from '@/types/domain';
import { DEFAULT_NOTIFICATION_PREFS } from '@/types/domain';

const ROLES: Role[] = ['MOTHER', 'SUPPORTER', 'PROVIDER', 'FACILITY_ADMIN', 'ADMIN'];

const asRole = (value: unknown): Role | null =>
  typeof value === 'string' && (ROLES as string[]).includes(value.toUpperCase()) ? (value.toUpperCase() as Role) : null;

const asStatus = (value: unknown): AccountStatus =>
  typeof value === 'string' && ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED', 'CLOSED'].includes(value.toUpperCase())
    ? (value.toUpperCase() as AccountStatus)
    : 'ACTIVE';

export interface Claims {
  role: Role | null;
  facilityId: string | null;
  providerId: string | null;
  privilegeVersion: number;
}

/** Reads the role-bearing fields out of a Firebase ID token's custom claims. */
export function claimsFromToken(claims: Record<string, unknown> | null | undefined): Claims {
  const source = claims ?? {};
  const version = Number(source.privilegeVersion ?? source.pv ?? 0);
  return {
    role: asRole(source.role),
    facilityId: typeof source.facilityId === 'string' ? source.facilityId : null,
    providerId: typeof source.providerId === 'string' ? source.providerId : null,
    privilegeVersion: Number.isFinite(version) ? version : 0,
  };
}

export function toActor(profile: UserProfile, tokenClaims: Claims | null = null): Actor {
  // Custom claims win when present: they are what the database rules will enforce.
  const role = tokenClaims?.role ?? profile.role ?? 'MOTHER';
  const claimsSource = tokenClaims?.role
    ? ('custom-claims' as const)
    : profile.role
      ? ('profile-document' as const)
      : ('default' as const);
  return {
    uid: profile.uid || profile.id,
    email: profile.email ?? '',
    displayName: profile.fullName ?? 'Mama',
    role,
    status: asStatus(profile.status),
    facilityId: tokenClaims?.facilityId ?? profile.facilityId ?? null,
    providerId: tokenClaims?.providerId ?? profile.providerId ?? null,
    supportsUserId: profile.supportsUserId ?? null,
    country: profile.country ?? 'ZM',
    language: (profile.language ?? 'en') as LanguageCode,
    photoUrl: profile.photoUrl ?? null,
    notificationPrefs: profile.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS,
    privilegeVersion: Math.max(tokenClaims?.privilegeVersion ?? 0, profile.privilegeVersion ?? 0),
    claimsSource,
  };
}

/** Profile fields that may not be set by the account holder. */
export const PRIVILEGED_PROFILE_FIELDS = ['role', 'status', 'privilegeVersion', 'providerId', 'facilityId'] as const;

export function defaultProfile(input: {
  uid: string;
  fullName: string;
  email: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  country?: string;
  language?: LanguageCode;
  role?: Role;
  status?: AccountStatus;
  emergencyContact?: UserProfile['emergencyContact'];
}): UserProfile {
  const nowIso = new Date().toISOString();
  return {
    id: input.uid,
    uid: input.uid,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth ?? null,
    country: input.country ?? 'ZM',
    language: input.language ?? 'en',
    role: input.role ?? 'MOTHER',
    status: input.status ?? 'ACTIVE',
    photoUrl: null,
    photoPublicId: null,
    emergencyContact: input.emergencyContact ?? null,
    notificationPrefs: { ...DEFAULT_NOTIFICATION_PREFS },
    providerId: null,
    facilityId: null,
    supportsUserId: null,
    consentAt: nowIso,
    lastLoginAt: null,
    privilegeVersion: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

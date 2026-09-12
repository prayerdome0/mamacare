/**
 * Role resolution — Firestore is the source of truth, claims are the enforcement copy.
 *
 * Requirement: the default role for a new account is a normal user, and an account
 * that has been designated an administrator **in Firestore** must be treated as an
 * administrator. Administrators are therefore identified from `users/{uid}.role`,
 * never from an email address hard-coded in the client.
 *
 * How the two layers fit together:
 *
 *  | Layer                     | Source                                   | Used for |
 *  | ------------------------- | ---------------------------------------- | -------- |
 *  | `users/{uid}.role`        | Firestore document (admin console/API)    | what the app shows and which dashboard is opened |
 *  | Firestore custom claims   | minted server-side from that document     | what `firestore.rules` and the API service allow |
 *
 * A registered user can never write their own `role` field: `firestore.rules`
 * rejects it on create (`role` must be one of the non-privileged roles) and on
 * update (`patchTouchesPrivilege`), and only an administrator may change someone
 * else's. So reading the document is safe, and when document and claims disagree
 * the client asks the API service to re-mint the claims
 * (`POST /auth/sync-claims`) so the enforcement layer catches up with the
 * document.
 *
 * Roles are accepted case-insensitively and with common aliases, so a document
 * written by hand in the Firebase console as `role: "admin"` (or `"user"`) works
 * exactly like the application's own `"ADMIN"` / `"MOTHER"` values.
 */

import { ROLES, type AccountStatus, type Role } from '@/types/domain';

/** Where the effective role came from — surfaced in the UI and in diagnostics. */
export type RoleSource = 'custom-claims' | 'firestore-document' | 'device-session' | 'default';

export interface RoleResolution {
  role: Role;
  roleSource: RoleSource;
  /** The privileged copy from the ID token, when it carries one. */
  claimsRole: Role | null;
  /** True when the document disagrees with the token and a re-mint is needed. */
  needsClaimSync: boolean;
  /** True when the document asked for a privilege the token does not carry. */
  escalation: boolean;
}

const ROLE_ALIASES: Record<string, Role> = {
  admin: 'ADMIN',
  administrator: 'ADMIN',
  platform_admin: 'ADMIN',
  super_admin: 'ADMIN',
  facility_supervisor: 'FACILITY_SUPERVISOR',
  supervisor: 'FACILITY_SUPERVISOR',
  in_charge: 'FACILITY_SUPERVISOR',
  midwife: 'MIDWIFE',
  nurse: 'NURSE',
  nursing_officer: 'NURSE',
  community_health_worker: 'COMMUNITY_HEALTH_WORKER',
  chw: 'COMMUNITY_HEALTH_WORKER',
  health_worker: 'COMMUNITY_HEALTH_WORKER',
  cbv: 'COMMUNITY_HEALTH_WORKER',
  mother: 'MOTHER',
  patient: 'MOTHER',
  user: 'MOTHER',
  member: 'MOTHER',
  client: 'MOTHER',
};

/**
 * Accepts `ADMIN`, `admin`, `" Administrator "`, `FACILITY-SUPERVISOR`, `chw`…
 * and returns the canonical role. Unknown values return `null` rather than
 * silently granting the lowest role, so a typo in the console is visible.
 */
export function normaliseRole(value: unknown): Role | null {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!key) return null;
  if ((ROLES as readonly string[]).includes(value.trim().toUpperCase())) return value.trim().toUpperCase() as Role;
  return ROLE_ALIASES[key] ?? null;
}

const RANK: Record<Role, number> = {
  MOTHER: 1,
  COMMUNITY_HEALTH_WORKER: 2,
  NURSE: 3,
  MIDWIFE: 4,
  FACILITY_SUPERVISOR: 5,
  ADMIN: 6,
};

export const rankOf = (role: Role | null): number => (role ? RANK[role] : 0);

const STATUS_ALIASES: Record<string, AccountStatus> = {
  active: 'ACTIVE',
  approved: 'ACTIVE',
  enabled: 'ACTIVE',
  pending: 'PENDING_APPROVAL',
  pending_approval: 'PENDING_APPROVAL',
  awaiting_approval: 'PENDING_APPROVAL',
  suspended: 'SUSPENDED',
  disabled: 'SUSPENDED',
  deactivated: 'SUSPENDED',
};

export function normaliseStatus(value: unknown, fallback: AccountStatus = 'PENDING_APPROVAL'): AccountStatus {
  if (typeof value !== 'string') return fallback;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if ((['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'] as string[]).includes(value.trim().toUpperCase())) {
    return value.trim().toUpperCase() as AccountStatus;
  }
  return STATUS_ALIASES[key] ?? fallback;
}

/** The shape we need from a `users/{uid}` document, however it was written. */
export interface UserRowLike {
  role?: unknown;
  status?: unknown;
  accountStatus?: unknown;
  facilityId?: unknown;
  motherId?: unknown;
  fullName?: unknown;
  displayName?: unknown;
  name?: unknown;
  email?: unknown;
  privilegeVersion?: unknown;
  accountKind?: unknown;
}

export const nameFromRow = (row: UserRowLike | null | undefined, fallback = ''): string => {
  const candidate = row?.fullName ?? row?.displayName ?? row?.name;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : fallback;
};

/**
 * Resolves the effective role for a signed-in account.
 *
 * Precedence: the Firestore document (an administrator set it there) → the ID
 * token claims (minted from the same document) → the default for a brand-new
 * account, which is a normal user with no privileged access.
 */
export function resolveRole(input: {
  documentRole?: unknown;
  claimsRole?: unknown;
  defaultRole?: Role;
}): RoleResolution {
  const docRole = normaliseRole(input.documentRole);
  const claimsRole = normaliseRole(input.claimsRole);
  const fallback = input.defaultRole ?? 'MOTHER';

  if (docRole) {
    return {
      role: docRole,
      roleSource: 'firestore-document',
      claimsRole,
      needsClaimSync: docRole !== claimsRole,
      escalation: rankOf(docRole) > rankOf(claimsRole),
    };
  }
  if (claimsRole) {
    return { role: claimsRole, roleSource: 'custom-claims', claimsRole, needsClaimSync: false, escalation: false };
  }
  return { role: fallback, roleSource: 'default', claimsRole: null, needsClaimSync: false, escalation: false };
}

/** Convenience for a Firestore user document row. */
export const roleFromRow = (row: UserRowLike | null | undefined): Role | null => normaliseRole(row?.role);

export const statusFromRow = (row: UserRowLike | null | undefined, fallback: AccountStatus = 'PENDING_APPROVAL'): AccountStatus =>
  normaliseStatus(row?.status ?? row?.accountStatus, fallback);

export const privilegeVersionFromRow = (row: UserRowLike | null | undefined, fallback = 1): number => {
  const value = row?.privilegeVersion;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

/** An administrator is exactly a document/claims role of ADMIN — nothing else. */
export const isAdministratorRole = (role: Role | null | undefined): boolean => role === 'ADMIN';

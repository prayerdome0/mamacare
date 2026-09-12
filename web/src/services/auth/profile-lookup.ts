/**
 * Profile → role bridge.
 *
 * The `users/{uid}` document is where a role is *stored* (an administrator can
 * set `role: "admin"` in the Firebase console and the person is an administrator
 * here — no email address is ever hard-coded in the client). Firestore custom
 * claims are the copy that the security rules enforce, and they are minted by
 * the API service from this very document.
 *
 * This module reads the document, normalises whatever shape it has (legacy rows,
 * hand-written console rows with `role: "user"`, `name` instead of `fullName`),
 * and hands the caller a typed profile. It never throws: a failed lookup means
 * "no stored profile", and the caller falls back to the token claims.
 */

import { doc, getDoc } from 'firebase/firestore';
import { firestoreDb } from '@/services/data/firestore-provider';
import { logProviderError } from '@/lib/errors';
import type { LocalDataProvider } from '@/services/data/local/provider';
import {
  nameFromRow,
  normaliseRole,
  privilegeVersionFromRow,
  statusFromRow,
  type UserRowLike,
} from '@/services/auth/role-resolution';
import type { AccountStatus, Role } from '@/types/domain';

export interface StoredProfile {
  /** False when no document exists yet (a brand-new account before it is written). */
  exists: boolean;
  fullName: string;
  email: string;
  /** The stored role, normalised; `null` when absent or unrecognised. */
  role: Role | null;
  status: AccountStatus;
  facilityId: string | null;
  motherId: string | null;
  privilegeVersion: number;
  country: string | null;
}

const empty = (fallbackEmail: string): StoredProfile => ({
  exists: false,
  fullName: '',
  email: fallbackEmail,
  role: null,
  status: 'PENDING_APPROVAL',
  facilityId: null,
  motherId: null,
  privilegeVersion: 0,
  country: null,
});

function shape(row: UserRowLike, email: string): StoredProfile {
  const facilityId = typeof row.facilityId === 'string' && row.facilityId ? row.facilityId : null;
  const motherId = typeof row.motherId === 'string' && row.motherId ? row.motherId : null;
  const country = typeof (row as { country?: unknown }).country === 'string' ? ((row as { country?: string }).country ?? null) : null;
  return {
    exists: true,
    fullName: nameFromRow(row, ''),
    email: typeof row.email === 'string' && row.email ? row.email : email,
    role: normaliseRole(row.role),
    status: statusFromRow(row, 'ACTIVE'),
    facilityId,
    motherId,
    privilegeVersion: privilegeVersionFromRow(row, 1),
    country,
  };
}

/** Reads `users/{uid}` from Cloud Firestore (the production path). */
export async function readStoredProfile(uid: string, email = ''): Promise<StoredProfile> {
  try {
    const snap = await getDoc(doc(firestoreDb(), 'users', uid));
    if (!snap.exists()) return empty(email);
    return shape(snap.data() as UserRowLike, email);
  } catch (error) {
    // A permission-denied here is a rules problem, not a reason to sign the user
    // out: the ID token claims still work and the diagnostics screen reports it.
    logProviderError('users/{uid} read', error);
    return empty(email);
  }
}

/** Reads `users/{uid}` from the device (IndexedDB) provider. */
export async function readLocalStoredProfile(
  uid: string,
  provider: LocalDataProvider,
  email = '',
): Promise<StoredProfile> {
  try {
    const row = await provider.readRaw('users', uid);
    if (!row) return empty(email);
    return shape(row as unknown as UserRowLike, email);
  } catch (error) {
    logProviderError('local users/{uid} read', error);
    return empty(email);
  }
}

/* ── compatibility shims used by the session store ───────────────────── */

export interface ProfileClaims {
  fullName: string;
  email: string;
  role: Role;
  facilityId: string | null;
  accountStatus: AccountStatus;
  motherId: string | null;
  privilegeVersion: number;
}

export const toProfileClaims = (profile: StoredProfile, fallbackRole: Role = 'MOTHER'): ProfileClaims => ({
  fullName: profile.fullName,
  email: profile.email,
  role: profile.role ?? fallbackRole,
  facilityId: profile.facilityId,
  accountStatus: profile.status,
  motherId: profile.motherId,
  privilegeVersion: profile.privilegeVersion,
});

export async function readProfileClaims(uid: string): Promise<ProfileClaims | null> {
  const profile = await readStoredProfile(uid);
  return profile.exists ? toProfileClaims(profile) : null;
}

export async function readLocalProfile(
  uid: string,
  provider: LocalDataProvider,
): Promise<ProfileClaims | null> {
  const profile = await readLocalStoredProfile(uid, provider);
  return profile.exists ? toProfileClaims(profile) : null;
}

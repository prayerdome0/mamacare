/**
 * Profile → claims bridge.
 *
 * Firebase custom claims are the authority for privileged roles; the `users`
 * document is the copy used for listing and display. When an ID token carries no
 * claims (a brand-new or not-yet-approved account) the profile is read so the
 * session can be labelled accurately — with `claimsSource: 'firebase-profile'`,
 * which the UI treats as "no privileged access yet" and Firestore rules enforce
 * independently.
 */

import { doc, getDoc } from 'firebase/firestore';
import { firestoreDb } from '@/services/data/firestore-provider';
import type { AccountStatus, AuthClaims, Role } from '@/types/domain';
import type { LocalDataProvider } from '@/services/data/local/provider';

type ProfileClaims = AuthClaims & { fullName: string; email: string };

export async function readProfileClaims(uid: string): Promise<ProfileClaims | null> {
  try {
    const snap = await getDoc(doc(firestoreDb(), 'users', uid));
    if (!snap.exists()) return null;
    const row = snap.data() as Record<string, unknown>;
    return {
      fullName: String(row.fullName ?? ''),
      email: String(row.email ?? ''),
      role: (row.role as Role) ?? 'MOTHER',
      facilityId: (row.facilityId as string | null) ?? null,
      accountStatus: (row.status as AccountStatus) ?? 'PENDING_APPROVAL',
      motherId: (row.motherId as string | null) ?? null,
      privilegeVersion: Number(row.privilegeVersion ?? 1),
    };
  } catch {
    return null;
  }
}

export async function readLocalProfile(
  uid: string,
  provider: LocalDataProvider,
): Promise<ProfileClaims | null> {
  const row = await provider.readRaw('users', uid);
  if (!row) return null;
  return {
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    facilityId: row.facilityId ?? null,
    accountStatus: row.status,
    motherId: row.motherId ?? null,
    privilegeVersion: row.privilegeVersion,
  };
}

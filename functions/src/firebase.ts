import { readFileSync } from 'node:fs';
import { applicationDefault, cert, initializeApp } from 'firebase-admin/app';
import { getAuth, type Auth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { env } from './env.js';
import { forbidden, notConfigured, unauthorized } from './http.js';

/**
 * Firebase Admin wiring.
 *
 * Credentials come from the environment only: `GOOGLE_APPLICATION_CREDENTIALS`
 * pointing at a file the deployment owns, or the ambient workload identity of
 * Cloud Run / the Functions runtime. The service account JSON is never read from a
 * request, never stored in the repository, and its contents are never logged.
 *
 * When no credential is available the service still boots: identity-dependent
 * routes answer 503 with the exact variable to set, so a half-configured
 * deployment fails loudly instead of pretending to work.
 */
let auth: Auth | null = null;
let db: Firestore | null = null;
let initError: string | null = null;

function initialise(): void {
  if (auth || initError) return;
  try {
    const credential = env.googleApplicationCredentials ? cert(readCredentialFile()) : applicationDefault();
    initializeApp({
      credential,
      ...(env.firebaseProjectId ? { projectId: env.firebaseProjectId } : {}),
    });
    auth = getAuth();
    db = getFirestore();
  } catch (error) {
    initError = error instanceof Error ? error.message : String(error);
    console.warn(
      `[api] Firebase Admin SDK is not available (${initError}). Privileged routes will answer 503 until GOOGLE_APPLICATION_CREDENTIALS or runtime credentials are configured.`,
    );
  }
}

/**
 * Reads the service-account file whose *path* is in the environment. The file is
 * never sent to the browser, never accepted in a request body, and its contents
 * are never logged.
 */
function readCredentialFile(): { clientEmail: string; privateKey: string; projectId: string } {
  let raw: string;
  try {
    raw = readFileSync(env.googleApplicationCredentials, 'utf8');
  } catch {
    throw new Error('GOOGLE_APPLICATION_CREDENTIALS does not point at a readable file.');
  }
  const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string; project_id?: string };
  if (!parsed.client_email || !parsed.private_key) throw new Error('The service-account file is missing client_email or private_key.');
  return { clientEmail: parsed.client_email, privateKey: parsed.private_key, projectId: parsed.project_id ?? env.firebaseProjectId };
}

export const adminStatus = (): { ready: boolean; reason: string | null } => {
  initialise();
  return { ready: Boolean(auth && db), reason: initError };
};

export function requireAdminSdk(): { auth: Auth; db: Firestore } {
  initialise();
  if (!auth || !db) {
    throw notConfigured(
      'Account privileges',
      ['GOOGLE_APPLICATION_CREDENTIALS', 'FIREBASE_PROJECT_ID'],
    );
  }
  return { auth, db };
}

export function dbOrThrow(): Firestore {
  initialise();
  if (!db) throw notConfigured('Database access', ['GOOGLE_APPLICATION_CREDENTIALS']);
  return db;
}

export interface ActorClaims {
  uid: string;
  email: string;
  displayName: string;
  role: string;
  facilityId: string | null;
  motherId: string | null;
  accountStatus: string;
  privilegeVersion: number;
  token: DecodedIdToken;
}

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' && value.length > 0 ? value : fallback);

function toClaims(token: DecodedIdToken): ActorClaims {
  return {
    uid: token.uid,
    email: asString(token.email),
    displayName: asString(token.name) || asString(token.email).split('@')[0] || 'Health worker',
    role: asString(token.role, 'MOTHER'),
    facilityId: typeof token.facilityId === 'string' ? token.facilityId : null,
    motherId: typeof token.motherId === 'string' ? token.motherId : null,
    accountStatus: asString(token.accountStatus, 'ACTIVE'),
    privilegeVersion: typeof token.privilegeVersion === 'number' ? token.privilegeVersion : 0,
    token,
  };
}

/**
 * Verifies the bearer ID token and reads the role from custom claims. Claims are
 * the only authority this service accepts; a role in the request body is ignored.
 */
export async function verifyIdToken(raw: string): Promise<ActorClaims> {
  initialise();
  if (!auth) throw unauthorized('Sign-in verification is unavailable on this deployment. Configure the Admin SDK credentials on the API service.');
  let token: DecodedIdToken;
  try {
    token = await auth.verifyIdToken(raw, true);
  } catch {
    throw unauthorized('Your session has expired. Please sign in again.');
  }
  const claims = toClaims(token);

  // Deactivation is checked on every call: a suspended account cannot use the
  // API even with an unexpired token.
  const profile = await dbOrThrow().collection('users').doc(claims.uid).get();
  if (profile.exists) {
    const data = profile.data() as { privilegeVersion?: number; status?: string; accountStatus?: string; role?: string; facilityId?: string | null } | undefined;
    const status = (data?.status ?? data?.accountStatus ?? '').toString().toUpperCase();
    if (status === 'SUSPENDED') throw forbidden('This account has been deactivated by an administrator.');

    // Privilege revocation applies to tokens this service has minted. A token
    // with no `privilegeVersion` has never been through a role change (a brand
    // new account, or one whose role was just set in Firestore and is being
    // synchronised) — denying those would lock people out of the very route
    // that fixes it. `accountStatus`/role checks still apply per route.
    const minted = typeof claims.privilegeVersion === 'number' && claims.privilegeVersion > 0;
    if (minted && typeof data?.privilegeVersion === 'number' && data.privilegeVersion > claims.privilegeVersion) {
      throw unauthorized('Your permissions changed. Please sign in again to continue.');
    }
  }
  return claims;
}

export const STAFF_ROLES = ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER'];

export function requireRole(claims: ActorClaims, roles: string[], message?: string): void {
  if (!roles.includes(claims.role)) {
    throw forbidden(message ?? `Only ${roles.map((role) => role.toLowerCase().replace(/_/g, ' ')).join(' or ')} accounts may do this.`);
  }
}

export const requireAdmin = (claims: ActorClaims): void =>
  requireRole(claims, ['ADMIN'], 'Only an administrator may change account privileges.');

export const requireSupervisor = (claims: ClaimsLike): void =>
  requireRole(claims as ActorClaims, ['ADMIN', 'FACILITY_SUPERVISOR'], 'Only a supervisor or administrator may do this.');

type ClaimsLike = Pick<ActorClaims, 'role'>;

export function bearer(req: { headers: Record<string, unknown> }): string {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || !header.toLowerCase().startsWith('bearer ')) throw unauthorized();
  return header.slice(7).trim();
}

export type { Auth, Firestore };

import { AppError, logProviderError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { app, integrations } from '@/config/env';
import { defaultCountry } from '@/config/geo';
import { services } from '@/services/session-store';
import type { AuthClaims, Role, UserProfile } from '@/types/domain';
import type { RegisterValues } from '@/lib/validation';

/**
 * Account creation.
 *
 * The role a requester *asks* for is stored as `requestedRole` on a pending
 * profile; the effective role is always the least-privileged one (MOTHER for a
 * patient, and a pending health-worker record with no clinical access) until an
 * administrator approves it. There is deliberately no code path in which the
 * browser can ask for ADMIN and receive it.
 *
 * Firestore rules allow a signed-up account to write exactly one document: its
 * own `users/{uid}` row, with a non-privileged `role` and a `status` of
 * `PENDING_APPROVAL` or `ACTIVE`. `privilegeVersion` is server-managed and must
 * not appear on that first write — including it made every registration fail
 * with a permission error after the authentication account had already been
 * created, which is why the document is now built field by field rather than by
 * copying the whole profile object.
 */

const DEFAULT_ROLE_FOR_SELF_REGISTRATION: Role = 'MOTHER';

/** Fields the client is allowed to write on its own first document. */
interface SelfProfileDocument {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: 'ACTIVE' | 'PENDING_APPROVAL';
  accountKind: 'HEALTH_WORKER' | 'PATIENT';
  requestedRole: Role | null;
  facilityId: string | null;
  motherId: string | null;
  title: string | null;
  licenseNumber: null;
  photoUrl: null;
  photoPublicId: null;
  emailVerified: boolean;
  country: string;
  preferredLanguage: string;
  pushEnabled: boolean;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: null;
  lastLoginAt: string;
  deactivatedAt: null;
  deactivatedBy: null;
  deactivationReason: null;
}

export interface RegistrationResult {
  uid: string;
  needsApproval: boolean;
  email: string;
}

export async function registerAccount(values: RegisterValues): Promise<RegistrationResult> {
  const registry = services();
  const email = values.email.trim().toLowerCase();
  const isHealthWorker = values.accountKind === 'HEALTH_WORKER';
  const country = (values.country || defaultCountry.code).toUpperCase();

  const claims: AuthClaims = {
    role: DEFAULT_ROLE_FOR_SELF_REGISTRATION,
    facilityId: values.facilityId || null,
    accountStatus: isHealthWorker ? 'PENDING_APPROVAL' : 'ACTIVE',
    motherId: null,
  };

  let uid: string;
  try {
    const created = await registry.auth.register({
      fullName: values.fullName.trim(),
      email,
      phone: values.phone,
      password: values.password,
      claims,
    });
    uid = created.uid;
  } catch (error) {
    throw toAppError(error, 'Unable to create your account. Please try again.');
  }

  const document = buildSelfProfileDocument({
    uid,
    profile: {
      fullName: values.fullName.trim(),
      email,
      phone: values.phone,
      facilityId: values.facilityId || null,
      isHealthWorker,
      requestedRole: isHealthWorker ? (values.requestedRole ?? 'COMMUNITY_HEALTH_WORKER') : null,
      title: values.jobTitle || null,
      country,
      preferredLanguage: values.preferredLanguage || 'English',
    },
  });

  try {
    await persistSelfProfile(uid, document, registry.provider.kind);
  } catch (error) {
    // The authentication account exists but its profile could not be written.
    // Leaving it behind would make the email "already registered" on the next
    // attempt, so the half-created account is removed before the error is shown.
    await rollbackHalfCreatedAccount(uid);
    logProviderError('registration profile write', error);
    const mapped = toAppError(error, 'Unable to create your account. Please try again.');
    throw new AppError(
      mapped.code === 'FORBIDDEN'
        ? 'Your account could not be set up because the database refused the profile write. This is a deployment problem (security rules), not something you did — please tell your platform administrator.'
        : mapped.message,
      mapped.code,
      { retryable: mapped.retryable },
    );
  }

  await registry.data
    .audit('user.created', 'user', uid, {
      label: email,
      facilityId: document.facilityId,
      metadata: {
        accountKind: document.accountKind,
        requestedRole: document.requestedRole ?? 'n/a',
        approvalRequired: isHealthWorker,
        country,
      },
    })
    .catch(() => null);

  if (isHealthWorker && document.facilityId) {
    await registry.data
      .notifyFacilityTeam(document.facilityId, {
        userId: '',
        kind: 'ACCOUNT',
        title: 'New health worker awaiting approval',
        body: `${document.fullName} registered as ${document.requestedRole?.replace(/_/g, ' ').toLowerCase()} and needs an administrator to confirm access.`,
        level: 'info',
        link: '/admin/users',
        facilityId: document.facilityId,
      })
      .catch(() => 0);
  }

  return { uid, needsApproval: isHealthWorker, email };
}

/** The exact document the security rules accept for a self-registered account. */
export function buildSelfProfileDocument(input: {
  uid: string;
  profile: {
    fullName: string;
    email: string;
    phone: string | null;
    facilityId: string | null;
    isHealthWorker: boolean;
    requestedRole: Role | null;
    title: string | null;
    country: string;
    preferredLanguage: string;
    /** Set only for a login created by staff for an existing mother record. */
    motherId?: string | null;
  };
}): SelfProfileDocument {
  const now = new Date().toISOString();
  const { uid, profile } = input;
  return {
    id: uid,
    email: profile.email,
    fullName: profile.fullName,
    phone: profile.phone ?? null,
    role: DEFAULT_ROLE_FOR_SELF_REGISTRATION,
    status: profile.isHealthWorker ? 'PENDING_APPROVAL' : 'ACTIVE',
    accountKind: profile.isHealthWorker ? 'HEALTH_WORKER' : 'PATIENT',
    requestedRole: profile.requestedRole,
    facilityId: profile.facilityId,
    motherId: profile.motherId ?? null,
    title: profile.title,
    licenseNumber: null,
    photoUrl: null,
    photoPublicId: null,
    emailVerified: false,
    country: profile.country,
    preferredLanguage: profile.preferredLanguage,
    pushEnabled: false,
    createdAt: now,
    createdBy: uid,
    updatedAt: now,
    updatedBy: null,
    lastLoginAt: now,
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  };
}

/**
 * Writes the brand-new profile.
 *
 * Firebase: the rules allow a signed-up user to create exactly their own
 * document with a non-privileged role and without server-managed fields (see
 * `firestore.rules` → `match /users/{userId}`). Device provider: provisioning is
 * done by the auth layer (there is no token service to authenticate against yet).
 */
async function persistSelfProfile(
  uid: string,
  document: SelfProfileDocument,
  kind: 'firebase' | 'local',
): Promise<void> {
  const registry = services();
  if (kind === 'local') {
    const provider = registry.provider as unknown as { provisionUser(row: unknown): Promise<unknown> };
    await provider.provisionUser(document);
    return;
  }
  await registry.provider.create('users', document as never, {
    uid,
    email: document.email,
    displayName: document.fullName,
    role: DEFAULT_ROLE_FOR_SELF_REGISTRATION,
    facilityId: document.facilityId,
    accountStatus: document.status,
    motherId: null,
    privilegeVersion: 1,
    claimsSource: 'firebase-id-token',
  });
}

/**
 * Removes the authentication account of a registration whose profile write
 * failed, so the person can immediately try again with the same email address.
 * Best effort: if the browser refuses (the password is not at hand), the error
 * the user sees still says what to do.
 */
async function rollbackHalfCreatedAccount(uid: string): Promise<void> {
  const registry = services();
  try {
    if (registry.provider.kind === 'local') {
      const provider = registry.provider as unknown as { remove(...args: unknown[]): Promise<void> };
      await provider.remove('users', uid, null).catch(() => null);
      return;
    }
    await registry.auth.signOut();
    const { getFirebaseAuth } = await import('@/services/firebase/app');
    const { deleteUser } = await import('firebase/auth');
    const user = getFirebaseAuth().currentUser;
    if (user && user.uid === uid) await deleteUser(user);
  } catch (error) {
    logProviderError('registration rollback', error);
  }
}

/** Creates a patient login for an already-registered mother (linked by id). */
export async function invitePatientAccount(input: {
  motherId: string;
  fullName: string;
  email: string;
  phone: string;
  facilityId: string;
  temporaryPassword: string;
  country?: string | null;
}): Promise<{ uid: string }> {
  const registry = services();
  const actor = registry.require();
  const email = input.email.trim().toLowerCase();
  const claims: AuthClaims = { role: 'MOTHER', facilityId: input.facilityId, accountStatus: 'ACTIVE', motherId: input.motherId };
  const { uid } = await registry.auth.register({
    fullName: input.fullName,
    email,
    phone: input.phone,
    password: input.temporaryPassword,
    claims,
  });

  const document = buildSelfProfileDocument({
    uid,
    profile: {
      fullName: input.fullName,
      email,
      phone: input.phone,
      facilityId: input.facilityId,
      isHealthWorker: false,
      requestedRole: null,
      title: null,
      country: (input.country || actor.country || defaultCountry.code).toUpperCase(),
      preferredLanguage: 'English',
      motherId: input.motherId,
    },
  });

  await persistSelfProfile(uid, { ...document, createdBy: actor.uid }, registry.provider.kind);

  // The staff-invited flow links the login to the mother's record. `motherId` is
  // server-managed on `users`, so it is written through the data layer, which
  // stamps the actor and records the audit entry.
  await registry.data.update('mothers', input.motherId, { userId: uid } as never);
  await registry.data.audit('user.created', 'user', uid, { label: `${input.fullName} (patient login)`, metadata: { via: 'staff invite' } });
  return { uid };
}

/**
 * First-run administrator.
 *
 * Firebase deployments: the API service elevates the caller only if their
 * verified email is on the server-side allow-list (MC_BOOTSTRAP_ADMIN_EMAILS).
 * Device provider: the same rule shape is enforced against
 * VITE_LOCAL_ADMIN_EMAILS, and it is a demonstration control, not a production
 * privilege path — which is why it is unavailable whenever Firebase is wired up.
 */
export async function bootstrapAdministrator(): Promise<{ ok: boolean; email: string; via: 'server' | 'device-allowlist' }> {
  const registry = services();
  const actor = registry.require();
  const email = actor.email.trim().toLowerCase();

  if (registry.provider.kind === 'firebase') {
    const { bootstrapAdministrator: callApi } = await import('@/services/api/client');
    const result = await callApi().catch((error: unknown) => {
      throw toAppError(error, 'The server did not accept this elevation. Check the bootstrap allow-list configuration.');
    });
    await registry.data.audit('user.role_changed', 'user', actor.uid, { label: email, metadata: { role: 'ADMIN', via: 'bootstrap-allowlist' } });
    await registry.refresh();
    return { ok: true, email: result.email ? String(result.email) : email, via: 'server' };
  }

  if (app.bootstrapAdminEmails.length === 0 || !app.bootstrapAdminEmails.includes(email)) {
    throw new AppError(
      'This email is not on the administrator allow-list for this deployment. Set VITE_LOCAL_ADMIN_EMAILS (device mode) or MC_BOOTSTRAP_ADMIN_EMAILS on the server.',
      'FORBIDDEN',
    );
  }
  const provider = registry.provider as unknown as {
    update(name: 'users', id: string, patch: Record<string, unknown>, actor: unknown): Promise<unknown>;
  };
  await provider.update(
    'users',
    actor.uid,
    { role: 'ADMIN', status: 'ACTIVE', privilegeVersion: Date.now(), updatedAt: new Date().toISOString() },
    { ...actor, role: 'ADMIN', accountStatus: 'ACTIVE' },
  );
  await registry.data.audit('user.role_changed', 'user', actor.uid, { label: email, metadata: { role: 'ADMIN', via: 'device-allowlist' } });
  await registry.refresh();
  return { ok: true, email, via: 'device-allowlist' };
}

export const canRequestBootstrap = (): boolean =>
  integrations.provider === 'local'
    ? app.bootstrapAdminEmails.length > 0
    : integrations.firebase.configured;

export const newResetFlowId = (): string => newId('rst');

/** Re-exported for the admin console: the profile rows the console lists. */
export type { UserProfile };

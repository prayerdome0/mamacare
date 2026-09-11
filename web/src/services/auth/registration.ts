import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { app, integrations } from '@/config/env';
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
 */

const DEFAULT_ROLE_FOR_SELF_REGISTRATION: Role = 'MOTHER';

export interface RegistrationResult {
  uid: string;
  needsApproval: boolean;
  email: string;
}

export async function registerAccount(values: RegisterValues): Promise<RegistrationResult> {
  const registry = services();
  const email = values.email.trim().toLowerCase();
  const isHealthWorker = values.accountKind === 'HEALTH_WORKER';

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
    throw toAppError(error, 'We could not create your account. Please try again.');
  }

  const profile = {
    id: uid,
    email,
    fullName: values.fullName.trim(),
    phone: values.phone,
    role: DEFAULT_ROLE_FOR_SELF_REGISTRATION,
    status: isHealthWorker ? ('PENDING_APPROVAL' as const) : ('ACTIVE' as const),
    accountKind: isHealthWorker ? ('HEALTH_WORKER' as const) : ('PATIENT' as const),
    requestedRole: isHealthWorker ? (values.requestedRole ?? 'COMMUNITY_HEALTH_WORKER') : null,
    facilityId: values.facilityId || null,
    motherId: null,
    title: values.jobTitle || null,
    licenseNumber: null,
    photoUrl: null,
    photoPublicId: null,
    emailVerified: false,
    privilegeVersion: 1,
    createdAt: new Date().toISOString(),
    createdBy: uid,
    updatedAt: new Date().toISOString(),
    updatedBy: null,
    lastLoginAt: new Date().toISOString(),
    deactivatedAt: null,
    deactivatedBy: null,
    deactivationReason: null,
  } satisfies UserProfile;

  await persistSelfProfile(uid, profile, registry.provider.kind);

  await registry.data
    .audit('user.created', 'user', uid, {
      label: email,
      facilityId: profile.facilityId,
      metadata: { accountKind: profile.accountKind, requestedRole: profile.requestedRole ?? 'n/a', approvalRequired: isHealthWorker },
    })
    .catch(() => null);

  if (isHealthWorker && profile.facilityId) {
    await registry.data
      .notifyFacilityTeam(profile.facilityId, {
        userId: '',
        kind: 'ACCOUNT',
        title: 'New health worker awaiting approval',
        body: `${profile.fullName} registered as ${profile.requestedRole?.replace(/_/g, ' ').toLowerCase()} and needs an administrator to confirm access.`,
        level: 'info',
        link: '/admin/users',
        facilityId: profile.facilityId,
      })
      .catch(() => 0);
  }

  return { uid, needsApproval: isHealthWorker, email };
}

/**
 * Writes the brand-new profile.
 *
 * Firebase: the rules allow a signed-up user to create exactly their own
 * document with a non-privileged role. Device provider: provisioning is done by
 * the auth layer (there is no token service to authenticate against yet).
 */
async function persistSelfProfile(uid: string, profile: UserProfile, kind: 'firebase' | 'local'): Promise<void> {
  const registry = services();
  if (kind === 'local') {
    const provider = registry.provider as unknown as { provisionUser(row: UserProfile): Promise<unknown> };
    await provider.provisionUser(profile);
    return;
  }
  await registry.provider.create('users', profile as never, {
    uid,
    email: profile.email,
    displayName: profile.fullName,
    role: 'MOTHER',
    facilityId: profile.facilityId ?? null,
    accountStatus: profile.status,
    motherId: null,
    privilegeVersion: 1,
    claimsSource: 'firebase-id-token',
  });
}

/** Creates a patient login for an already-registered mother (linked by id). */
export async function invitePatientAccount(input: {
  motherId: string;
  fullName: string;
  email: string;
  phone: string;
  facilityId: string;
  temporaryPassword: string;
}): Promise<{ uid: string }> {
  const registry = services();
  const actor = registry.require();
  const claims: AuthClaims = { role: 'MOTHER', facilityId: input.facilityId, accountStatus: 'ACTIVE', motherId: input.motherId };
  const { uid } = await registry.auth.register({
    fullName: input.fullName,
    email: input.email.trim().toLowerCase(),
    phone: input.phone,
    password: input.temporaryPassword,
    claims,
  });
  await persistSelfProfile(
    uid,
    {
      id: uid,
      email: input.email.trim().toLowerCase(),
      fullName: input.fullName,
      phone: input.phone,
      role: 'MOTHER',
      status: 'ACTIVE',
      accountKind: 'PATIENT',
      requestedRole: null,
      facilityId: input.facilityId,
      motherId: input.motherId,
      title: null,
      licenseNumber: null,
      photoUrl: null,
      photoPublicId: null,
      emailVerified: false,
      privilegeVersion: 1,
      createdAt: new Date().toISOString(),
      createdBy: actor.uid,
      updatedAt: new Date().toISOString(),
      updatedBy: actor.uid,
      lastLoginAt: null,
      deactivatedAt: null,
      deactivatedBy: null,
      deactivationReason: null,
    },
    registry.provider.kind,
  );
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

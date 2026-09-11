import { AppError, toAppError } from '@/lib/errors';
import { services } from '@/services/session-store';
import { setPrivilegedRole, revokeUserSessions, createManagedAccount } from '@/services/api/client';
import type { AccountStatus, Facility, Role, UserProfile } from '@/types/domain';
import { ROLE_LABELS } from '@/types/domain';

/**
 * Administrative user management.
 *
 * Every mutation here is checked twice: by the caller's own policy gate below
 * (fast feedback) and by the storage rules / API authorisation, which is the
 * authority. In a Firebase deployment the role itself is written by the API
 * service through the Admin SDK so custom claims and the profile can never drift
 * apart.
 */

const PRIVILEGED_TARGETS: Role[] = ['ADMIN', 'FACILITY_SUPERVISOR'];

async function requireAdmin(action: string): Promise<void> {
  const registry = services();
  const actor = registry.require();
  if (actor.role !== 'ADMIN') {
    throw new AppError(`Only an administrator can ${action}.`, 'FORBIDDEN');
  }
  if (actor.claimsSource === 'firebase-profile') {
    throw new AppError(
      'Your administrator privileges are not present in the current session token. Please sign out and in again.',
      'FORBIDDEN',
    );
  }
}

export interface UserFilters {
  search?: string;
  role?: Role | 'ALL';
  facilityId?: string | null;
  status?: AccountStatus | 'ALL';
}

export interface UserDirectoryRow {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: Role;
  roleLabel: string;
  status: AccountStatus;
  requestedRole: Role | null;
  facilityId: string | null;
  facilityName: string;
  lastLoginAt: string | null;
  createdAt: string;
  motherId: string | null;
  isSelf: boolean;
  photoUrl: string | null;
  emailVerified: boolean;
}

export async function listUsers(filters: UserFilters = {}): Promise<{ rows: UserDirectoryRow[]; total: number; pending: number }> {
  const registry = services();
  const actor = registry.require();
  const { rows, total } = await registry.data.list('users', {
    limit: 500,
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
  const facilities = await registry.data.allFacilities();
  const nameOf = (id?: string | null) => facilities.find((f) => f.id === id)?.name ?? 'Unassigned';

  const needle = (filters.search ?? '').trim().toLowerCase();
  const mapped = rows
    .filter((user) => {
      if (filters.role && filters.role !== 'ALL' && user.role !== filters.role) return false;
      if (filters.status && filters.status !== 'ALL' && user.status !== filters.status) return false;
      if (filters.facilityId && user.facilityId !== filters.facilityId) return false;
      if (needle) {
        const haystack = `${user.fullName} ${user.email} ${user.phone ?? ''} ${user.requestedRole ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      // A supervisor who was granted directory access still only sees their own
      // facility; an admin sees everything.
      if (actor.role === 'FACILITY_SUPERVISOR' && user.facilityId !== actor.facilityId) return false;
      return true;
    })
    .map((user) => ({
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone ?? null,
      role: user.role,
      roleLabel: ROLE_LABELS[user.role],
      status: user.status,
      requestedRole: user.requestedRole ?? null,
      facilityId: user.facilityId ?? null,
      facilityName: nameOf(user.facilityId),
      lastLoginAt: user.lastLoginAt ?? null,
      createdAt: user.createdAt,
      motherId: user.motherId ?? null,
      isSelf: user.id === actor.uid,
      photoUrl: user.photoUrl ?? null,
      emailVerified: user.emailVerified,
    }));

  return {
    rows: mapped,
    total,
    pending: mapped.filter((row) => row.status === 'PENDING_APPROVAL').length,
  };
}

export async function setUserRole(uid: string, role: Role, options: { facilityId?: string | null; reason: string }): Promise<void> {
  const registry = services();
  await requireAdmin(`assign the ${ROLE_LABELS[role] ?? role} role`);
  if (!options.reason || options.reason.trim().length < 4) {
    throw new AppError('Record a short reason for the role change — it is written to the audit log.', 'VALIDATION');
  }
  const target = await registry.data.get('users', uid);
  if (!target) throw new AppError('That user account could not be found.', 'NOT_FOUND');
  if (target.id === registry.require().uid && role !== 'ADMIN') {
    throw new AppError('You cannot remove your own administrator access while signed in.', 'VALIDATION');
  }

  if (registry.provider.kind === 'firebase') {
    // Claims are minted server-side; the API also mirrors them on the profile.
    await setPrivilegedRole({ uid, role, facilityId: options.facilityId ?? target.facilityId ?? null, reason: options.reason })
      .then(() => undefined)
      .catch((error: unknown) => {
        const mapped = toAppError(error);
        throw new AppError(
          mapped.code === 'CONFIGURATION'
            ? 'Role changes need the API service with Firebase Admin credentials configured. See functions/README.md.'
            : mapped.message,
          mapped.code,
          { retryable: mapped.retryable },
        );
      });
  } else {
    const provider = registry.provider as unknown as {
      update(name: 'users', id: string, patch: Record<string, unknown>, actor: unknown): Promise<unknown>;
    };
    await provider.update(
      'users',
      uid,
      { role, facilityId: options.facilityId ?? target.facilityId ?? null, privilegeVersion: Date.now(), updatedAt: new Date().toISOString() },
      registry.require(),
    );
  }

  await registry.data.audit('user.role_changed', 'user', uid, {
    label: target.email,
    facilityId: options.facilityId ?? target.facilityId,
    metadata: { from: target.role, to: role },
  });
  await registry.data
    .notify({
      userId: uid,
      kind: 'ACCOUNT',
      title: 'Your access level changed',
      body: `You are now ${ROLE_LABELS[role]}. Re-open the app to load your new access.`,
      level: PRIVILEGED_TARGETS.includes(role) ? 'warning' : 'info',
      link: '/profile',
    })
    .catch(() => null);
  await registry.refresh();
}

export async function setUserStatus(uid: string, status: AccountStatus, reason: string): Promise<void> {
  const registry = services();
  await requireAdmin(status === 'SUSPENDED' ? 'deactivate an account' : 'reactivate an account');
  const target = await registry.data.get('users', uid);
  if (!target) throw new AppError('That user account could not be found.', 'NOT_FOUND');
  if (target.id === registry.require().uid) {
    throw new AppError('You cannot deactivate the account you are signed in with.', 'VALIDATION');
  }
  if (registry.provider.kind === 'firebase') {
    await revokeUserSessions({ uid, reason }).catch(() => null);
  }
  const provider = registry.provider as unknown as {
    update(name: 'users', id: string, patch: Record<string, unknown>, actor: unknown): Promise<unknown>;
  };
  await provider.update(
    'users',
    uid,
    {
      status,
      deactivatedAt: status === 'SUSPENDED' ? new Date().toISOString() : null,
      deactivatedBy: status === 'SUSPENDED' ? registry.require().uid : null,
      deactivationReason: status === 'SUSPENDED' ? reason : null,
      privilegeVersion: Date.now(),
      updatedAt: new Date().toISOString(),
    },
    { ...registry.require(), role: 'ADMIN' },
  );
  await registry.data.audit(status === 'SUSPENDED' ? 'user.deactivated' : 'user.reactivated', 'user', uid, {
    label: target.email,
    metadata: { reason },
  });
}

export async function approvePendingUser(uid: string, role: Role, facilityId: string | null, reason: string): Promise<void> {
  const registry = services();
  await requireAdmin('approve a health worker account');
  await registry.data.approveUser(uid, role, facilityId);
  await registry.data.audit('user.access_approved', 'user', uid, { metadata: { role, reason } });
}

export async function assignFacilityToUser(uid: string, facilityId: string | null, reason: string): Promise<void> {
  const registry = services();
  const actor = registry.require();
  if (actor.role !== 'ADMIN' && actor.role !== 'FACILITY_SUPERVISOR') {
    throw new AppError('Only supervisors and administrators assign staff to facilities.', 'FORBIDDEN');
  }
  if (actor.role === 'FACILITY_SUPERVISOR' && facilityId !== actor.facilityId) {
    throw new AppError('Supervisors may only assign staff to their own facility.', 'FORBIDDEN');
  }
  const target = await registry.data.get('users', uid);
  if (!target) throw new AppError('That user account could not be found.', 'NOT_FOUND');

  await registry.data.update('users', uid, { facilityId, privilegeVersion: Date.now(), updatedAt: new Date().toISOString() } as never);

  const facilities = await registry.data.allFacilities();
  const assignments = await registry.data.list('facility_assignments', {
    where: [{ field: 'userId', op: '==', value: uid }, { field: 'active', op: '==', value: true }],
  });
  for (const assignment of assignments.rows) {
    if (assignment.facilityId !== facilityId) {
      await registry.data.update('facility_assignments', assignment.id, { active: false, endedAt: new Date().toISOString() } as never).catch(() => null);
    }
  }
  if (facilityId) {
    const already = assignments.rows.some((row) => row.facilityId === facilityId && row.active);
    if (!already) {
      await registry.data
        .create('facility_assignments', {
          id: `asg_${Date.now().toString(36)}`,
          userId: uid,
          userName: target.fullName,
          role: target.role,
          facilityId,
          isPrimary: true,
          active: true,
          startedAt: new Date().toISOString(),
          assignedBy: actor.uid,
          createdAt: new Date().toISOString(),
        } as never)
        .catch(() => null);
    }
  }

  await registry.data.audit('user.facility_assigned', 'user', uid, {
    label: target.email,
    facilityId,
    metadata: { facility: facilities.find((f) => f.id === facilityId)?.name ?? 'unassigned', reason },
  });
}

/** Admin-created health worker account (never self-service). */
export async function createStaffAccount(input: {
  fullName: string;
  email: string;
  phone: string;
  role: Role;
  facilityId: string;
  temporaryPassword: string;
  note?: string;
}): Promise<{ uid: string; created: 'server' | 'device' }> {
  const registry = services();
  await requireAdmin('create a staff account');
  if (registry.provider.kind === 'firebase') {
    const result = await createManagedAccount(input);
    await registry.data.audit('user.created', 'user', result.uid, {
      label: input.email,
      facilityId: input.facilityId,
      metadata: { role: input.role, via: 'admin-console' },
    });
    return { uid: result.uid, created: 'server' };
  }
  const { uid } = await registry.auth.register({
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    password: input.temporaryPassword,
    claims: { role: input.role, facilityId: input.facilityId, accountStatus: 'ACTIVE' },
  });
  await registry.data.update('users', uid, {
    role: input.role,
    status: 'ACTIVE',
    facilityId: input.facilityId,
    accountKind: 'HEALTH_WORKER',
    updatedAt: new Date().toISOString(),
  } as never).catch(() => null);
  await registry.data.audit('user.created', 'user', uid, { label: input.email, facilityId: input.facilityId, metadata: { role: input.role, via: 'admin-console-device' } });
  return { uid, created: 'device' };
}

export async function requestPasswordResetFor(uid: string): Promise<{ sent: boolean; message: string }> {
  const registry = services();
  await requireAdmin('send a password reset');
  const target = await registry.data.get('users', uid);
  if (!target) throw new AppError('That user account could not be found.', 'NOT_FOUND');
  try {
    await registry.auth.resetPassword(target.email);
    await registry.data.audit('auth.password_reset_requested', 'user', uid, { label: target.email, metadata: { by: 'admin' } });
    return { sent: true, message: `A reset link was sent to ${target.email}.` };
  } catch (error) {
    throw toAppError(error, 'We could not send a reset link right now. Please try again.');
  }
}

export async function userActivity(uid: string): Promise<{ entries: Awaited<ReturnType<typeof loadAudit>>; facilities: Facility[] }> {
  const registry = services();
  const entries = await loadAudit(uid);
  return { entries, facilities: await registry.data.allFacilities() };
}

async function loadAudit(uid: string) {
  const registry = services();
  const { rows } = await registry.data.list('audit_logs', {
    where: [{ field: 'actorId', op: '==', value: uid }],
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 100,
  });
  return rows;
}

export async function listStaffForFacility(facilityId: string | null, roles: Role[] = ['MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'FACILITY_SUPERVISOR']): Promise<UserProfile[]> {
  const registry = services();
  const { rows } = await registry.data.list('users', { where: facilityId ? [{ field: 'facilityId', op: '==', value: facilityId }] : [], limit: 300 });
  return rows
    .filter((user) => user.status === 'ACTIVE' && roles.includes(user.role))
    .map((user) => user as unknown as UserProfile);
}

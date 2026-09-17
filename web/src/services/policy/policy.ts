/**
 * Access policy.
 *
 * One module decides who may read or write what. The device provider enforces it
 * on every call so offline behaviour matches production, and `firestore.rules`
 * encodes the same decisions for the hosted database — this file is the readable
 * statement of both.
 *
 * Principles:
 *  • A mother owns her own data. Nobody else reads it without an explicit link.
 *  • A healthcare provider sees a patient ONLY through an active `care_links`
 *    record. There is no "all patients" read, and no browsing by facility.
 *  • A supporter (partner/family) sees only the categories the mother switched on.
 *  • Roles are never self-assignable: registration may claim MOTHER, SUPPORTER or
 *    PROVIDER (pending approval). ADMIN and FACILITY_ADMIN come from an existing
 *    administrator, or from the bootstrap list on a first install.
 *  • Sensitive measurements are stored, never interpreted.
 */

import type { Actor, CollectionName } from '@/services/data/contract';
import type { Role, SupporterPermissions } from '@/types/domain';

export interface Decision {
  allowed: boolean;
  reason?: string;
}

const allow: Decision = { allowed: true };
const deny = (reason: string): Decision => ({ allowed: false, reason });

/* ── Care-link context ────────────────────────────────────────────────── *
 * A provider's patient list lives in the database, but authorisation has to be
 * decided synchronously on every read. The session resolves the provider's
 * active care links once at sign-in (and refreshes them on change) and publishes
 * the ids here; the policy then treats that set as the provider's patients.
 */

let linkedPatientIds: Set<string> = new Set();
let supporterPermissions: SupporterPermissions | null = null;

export function setPolicyContext(context: { linkedPatientIds?: Iterable<string>; supporterPermissions?: SupporterPermissions | null }): void {
  if (context.linkedPatientIds) linkedPatientIds = new Set(context.linkedPatientIds);
  if (context.supporterPermissions !== undefined) supporterPermissions = context.supporterPermissions;
}

export const clearPolicyContext = (): void => {
  linkedPatientIds = new Set();
  supporterPermissions = null;
};

export const isLinkedPatient = (userId: string | null | undefined): boolean =>
  Boolean(userId) && linkedPatientIds.has(userId as string);

/* ── Helpers ──────────────────────────────────────────────────────────── */

export const isAdmin = (actor: Actor | null): boolean => actor?.role === 'ADMIN';
export const isFacilityAdmin = (actor: Actor | null): boolean => actor?.role === 'FACILITY_ADMIN';
export const isStaff = (actor: Actor | null): boolean =>
  actor !== null && (actor.role === 'ADMIN' || actor.role === 'FACILITY_ADMIN' || actor.role === 'PROVIDER');
export const isMother = (actor: Actor | null): boolean => actor?.role === 'MOTHER';

const field = (row: unknown, key: string): unknown => (row as Record<string, unknown> | null)?.[key];
const str = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Records that belong to one person. */
const OWNED: CollectionName[] = [
  'pregnancies',
  'babies',
  'appointments',
  'reminders',
  'observations',
  'immunizations',
  'journal',
  'notifications',
  'devices',
  'documents',
  'supporters',
];

/** Owner field per collection (all others fall back to `userId`). */
const OWNER_FIELD: Partial<Record<CollectionName, string>> = {
  users: 'uid',
  messages: 'fromUserId',
  reports: 'reporterId',
  feedback: 'userId',
  care_links: 'motherUserId',
};

/** Collections anybody may read (subject to the row-level filters below). */
const PUBLIC_READ: CollectionName[] = ['articles', 'facilities', 'announcements', 'settings'];

/** Fields a user may never set on their own account. */
const PROTECTED_USER_FIELDS = ['role', 'status', 'privilegeVersion', 'uid', 'createdAt', 'providerId', 'facilityId'];

/** Fields only an administrator may change on a provider record. */
const PROTECTED_PROVIDER_FIELDS = ['status', 'verifiedBy', 'verifiedAt', 'rejectionReason', 'userId'];

/* ── Reads ────────────────────────────────────────────────────────────── */

export function canReadCollection(actor: Actor | null, name: CollectionName): boolean {
  if (PUBLIC_READ.includes(name)) return true;
  if (!actor) return false;
  if (isAdmin(actor)) return true;
  if (name === 'audit_logs') return isAdmin(actor);
  if (name === 'reports' || name === 'feedback') return isAdmin(actor) || isFacilityAdmin(actor);
  if (name === 'providers') return true; // the directory is public; the row filter narrows it
  if (name === 'care_links') return true; // filtered to the actor's own links
  return true; // row-level checks decide
}

export function canReadRow(actor: Actor | null, name: CollectionName, row: unknown): Decision {
  if (row == null) return allow;

  /* Public content ---------------------------------------------------- */
  if (name === 'articles') {
    const published = str(field(row, 'status')) === 'published';
    const audience = str(field(row, 'audience'));
    if (!actor) return published && audience === 'public' ? allow : deny('This article is not published.');
    if (isAdmin(actor)) return allow;
    if (actor.role === 'PROVIDER') return allow;
    if (!published) return deny('This article has not been published yet.');
    return audience === 'provider' ? deny('This article is for healthcare providers.') : allow;
  }

  if (name === 'facilities') {
    if (isAdmin(actor) || isFacilityAdmin(actor)) return allow;
    return field(row, 'active') === false ? deny('This facility is not listed.') : allow;
  }

  if (name === 'announcements') {
    const audience = str(field(row, 'audience'));
    if (isAdmin(actor)) return allow;
    if (audience === 'all') return allow;
    if (!actor) return deny('Sign in to see this announcement.');
    if (audience === 'mothers') return isMother(actor) || actor.role === 'SUPPORTER' ? allow : deny('Not for your account.');
    if (audience === 'providers' || audience === 'facility') return isStaff(actor) ? allow : deny('Not for your account.');
    return allow;
  }

  if (name === 'settings') {
    // The global document holds support contacts and emergency numbers.
    return str(field(row, 'key')) === 'global' || isAdmin(actor) ? allow : deny('Not available.');
  }

  if (!actor) return deny('Sign in to continue.');

  if (isAdmin(actor)) return allow;

  /* Accounts ---------------------------------------------------------- */
  if (name === 'users') {
    const uid = str(field(row, 'uid'));
    if (uid === actor.uid) return allow;
    if (isFacilityAdmin(actor) && field(row, 'facilityId') === actor.facilityId) return allow;
    if (actor.role === 'PROVIDER' && isLinkedPatient(uid)) return allow;
    if (actor.role === 'SUPPORTER' && uid === actor.supportsUserId) return allow;
    // A mother may see the supporter she invited.
    if (isMother(actor) && str(field(row, 'role')) === 'SUPPORTER' && str(field(row, 'supportsUserId')) === actor.uid) return allow;
    return deny('You can only view your own account.');
  }

  if (name === 'providers') {
    if (str(field(row, 'userId')) === actor.uid) return allow;
    if (isFacilityAdmin(actor) && field(row, 'facilityId') === actor.facilityId) return allow;
    return field(row, 'status') === 'approved' && field(row, 'listedInDirectory') === true
      ? allow
      : deny('This provider is not in the public directory.');
  }

  if (name === 'audit_logs') return deny('Audit history is restricted to administrators.');

  if (name === 'reports' || name === 'feedback') {
    if (isFacilityAdmin(actor)) return allow;
    return str(field(row, 'reporterId')) === actor.uid || str(field(row, 'userId')) === actor.uid
      ? allow
      : deny('You can only see reports you submitted.');
  }

  if (name === 'messages') {
    const participant = str(field(row, 'fromUserId')) === actor.uid || str(field(row, 'toUserId')) === actor.uid;
    return participant ? allow : deny('You are not part of this conversation.');
  }

  if (name === 'care_links') {
    const related =
      str(field(row, 'motherUserId')) === actor.uid ||
      str(field(row, 'providerUserId')) === actor.uid ||
      (isFacilityAdmin(actor) && field(row, 'facilityId') === actor.facilityId);
    return related ? allow : deny('This care link does not involve you.');
  }

  if (name === 'supporters') {
    const related =
      str(field(row, 'motherUserId')) === actor.uid ||
      str(field(row, 'supporterUserId')) === actor.uid ||
      str(field(row, 'supporterEmail')).toLowerCase() === actor.email.toLowerCase();
    return related ? allow : deny('This invitation is not yours.');
  }

  /* Personally owned records ------------------------------------------ */
  if (OWNED.includes(name)) {
    const ownerField = OWNER_FIELD[name] ?? 'userId';
    const owner = str(field(row, ownerField));
    if (owner === actor.uid) return allow;

    // A provider may read the linked patient's care records, except the journal,
    // which stays private to the mother no matter who is on the care team.
    if (actor.role === 'PROVIDER' && isLinkedPatient(owner)) {
      if (name === 'journal') return deny('The journal is private to the mother.');
      if (name === 'notifications' || name === 'devices') return deny('Notifications are private.');
      return allow;
    }
    if (isFacilityAdmin(actor) && name !== 'journal' && isLinkedPatient(owner)) return allow;

    // A supporter sees only what the mother shared.
    if (actor.role === 'SUPPORTER' && owner === actor.supportsUserId) {
      if (name === 'appointments') return field(row, 'sharedWithSupporter') === true ? allow : deny('Not shared with your supporter.');
      if (name === 'reminders') return field(row, 'sharedWithSupporter') === true ? allow : deny('Not shared with your supporter.');
      if (name === 'babies' || name === 'immunizations') return allow;
      if (name === 'notifications') return allow;
      return deny('Not shared with your supporter.');
    }
    if (isMother(actor) && name === 'immunizations' && isLinkedPatient(owner)) return allow;
    return deny('This record belongs to another person.');
  }

  return deny('You do not have access to this record.');
}

/* ── Writes ───────────────────────────────────────────────────────────── */

export type WriteOp = 'create' | 'update' | 'delete';

export function canWrite(
  actor: Actor | null,
  name: CollectionName,
  op: WriteOp,
  existing: unknown,
  patch: Record<string, unknown> | null,
): Decision {
  if (name === 'audit_logs') {
    // Written by the app on privileged actions; never edited afterwards.
    return op === 'create' ? allow : deny('Audit entries cannot be changed.');
  }

  if (name === 'settings') {
    if (!actor) return deny('Sign in to continue.');
    if (op === 'create' && !existing) return allow; // first-run bootstrap of the global document
    return isAdmin(actor) ? allow : deny('Only an administrator can change system settings.');
  }

  if (!actor) return deny('Sign in to make changes.');
  if (actor.status === 'SUSPENDED' || actor.status === 'CLOSED') return deny('This account is suspended. Contact support.');

  if (isAdmin(actor)) return allow;

  /* Accounts ---------------------------------------------------------- */
  if (name === 'users') {
    const targetUid = str(field(existing, 'uid')) || str(patch?.uid);
    const own = targetUid === actor.uid;
    if (op === 'create') {
      if (!own) return deny('You can only create your own account.');
      const role = str(patch?.role) as Role;
      if (role === 'ADMIN' || role === 'FACILITY_ADMIN') {
        return deny('Administrator accounts are created by an existing administrator.');
      }
      return allow;
    }
    if (own) {
      if (op === 'delete') return allow; // account deletion is a user right
      const touchesProtected = Object.keys(patch ?? {}).some((key) => PROTECTED_USER_FIELDS.includes(key));
      if (touchesProtected) return deny('Your role and account status are managed by an administrator.');
      return allow;
    }
    if (isFacilityAdmin(actor) && field(existing, 'facilityId') === actor.facilityId) {
      const role = str(field(existing, 'role'));
      if (role === 'PROVIDER') return allow;
      return deny('You may only manage provider accounts at your facility.');
    }
    return deny('You cannot change another person\'s account.');
  }

  if (name === 'providers') {
    const own = str(field(existing, 'userId')) === actor.uid;
    if (op === 'create') {
      if (own || str(patch?.userId) === actor.uid) return allow;
      if (isFacilityAdmin(actor) && field(patch, 'facilityId') === actor.facilityId) return allow;
      return deny('You can only register your own provider profile.');
    }
    if (isFacilityAdmin(actor) && field(existing, 'facilityId') === actor.facilityId) return allow;
    if (own) {
      if (op === 'delete') return deny('Ask an administrator to remove a provider profile.');
      const touchesProtected = Object.keys(patch ?? {}).some((key) => PROTECTED_PROVIDER_FIELDS.includes(key));
      if (touchesProtected) return deny('Verification is managed by an administrator.');
      return allow;
    }
    return deny('You cannot change this provider profile.');
  }

  if (name === 'facilities') {
    if (isFacilityAdmin(actor) && (field(existing, 'id') === actor.facilityId || field(patch, 'id') === actor.facilityId)) {
      return op === 'delete' ? deny('Ask a system administrator to remove a facility.') : allow;
    }
    return deny('Only facility and system administrators manage facilities.');
  }

  if (name === 'articles') {
    if (actor.role === 'PROVIDER') {
      if (op === 'delete') return deny('Ask an administrator to remove an article.');
      if (str(patch?.status) === 'published' && str(field(existing, 'status')) !== 'published') {
        return deny('Only an administrator can publish content.');
      }
      return allow; // drafts and edits
    }
    return deny('Only providers and administrators manage educational content.');
  }

  if (name === 'announcements') return deny('Only an administrator can manage announcements.');

  if (name === 'messages') {
    if (op === 'create') {
      const to = str(patch?.toUserId);
      if (!to) return deny('Choose a recipient.');
      // Mothers message their care team and supporters; staff message patients.
      return allow;
    }
    if (op === 'update') {
      const participant = str(field(existing, 'fromUserId')) === actor.uid || str(field(existing, 'toUserId')) === actor.uid;
      if (!participant) return deny('You are not part of this conversation.');
      const onlyReadState = Object.keys(patch ?? {}).every((key) => ['readAt', 'updatedAt'].includes(key));
      return onlyReadState ? allow : deny('A sent message cannot be edited.');
    }
    return deny('Messages cannot be deleted. Report a message instead.');
  }

  if (name === 'notifications') {
    if (op === 'create') {
      // System/admin-generated. A provider may notify a linked patient.
      if (actor.role === 'PROVIDER' && isLinkedPatient(str(patch?.userId))) return allow;
      if (isFacilityAdmin(actor)) return allow;
      return deny('Notifications are generated by the system.');
    }
    const recipient = str(field(existing, 'userId')) === actor.uid;
    if (!recipient) return deny('This notification is not yours.');
    const onlyReadState = Object.keys(patch ?? {}).every((key) => ['readAt', 'updatedAt'].includes(key));
    return op === 'update' && onlyReadState ? allow : deny('Notifications cannot be edited.');
  }

  if (name === 'reports' || name === 'feedback') {
    if (op === 'create') return allow;
    if (isFacilityAdmin(actor)) return op === 'delete' ? deny('Keep feedback for the record.') : allow;
    const own = str(field(existing, 'reporterId')) === actor.uid || str(field(existing, 'userId')) === actor.uid;
    return own && op === 'delete' ? allow : deny('You cannot change this entry.');
  }

  if (name === 'care_links') {
    const motherOwn = str(field(existing, 'motherUserId')) === actor.uid || str(patch?.motherUserId) === actor.uid;
    const providerOwn = str(field(existing, 'providerUserId')) === actor.uid || str(patch?.providerUserId) === actor.uid;
    if (isMother(actor) || actor.role === 'SUPPORTER') {
      return motherOwn ? allow : deny('Only the mother manages care sharing.');
    }
    if (actor.role === 'PROVIDER') {
      if (op === 'create') return allow; // creates a *request* the mother accepts
      if (providerOwn) {
        const onlyWithdraw = str(patch?.status) === 'revoked';
        return onlyWithdraw ? allow : deny('A care link is granted by the mother.');
      }
      return deny('This care link is not yours.');
    }
    return deny('You cannot change care sharing.');
  }

  if (name === 'supporters') {
    if (isMother(actor)) {
      return str(field(existing, 'motherUserId')) === actor.uid || str(patch?.motherUserId) === actor.uid
        ? allow
        : deny('You can only manage your own supporters.');
    }
    if (actor.role === 'SUPPORTER') {
      const invitedToMe =
        str(field(existing, 'supporterUserId')) === actor.uid ||
        str(field(existing, 'supporterEmail')).toLowerCase() === actor.email.toLowerCase();
      const accepting = Object.keys(patch ?? {}).every((key) => ['status', 'acceptedAt', 'supporterUserId', 'updatedAt'].includes(key));
      return invitedToMe && accepting ? allow : deny('You can only accept your own invitation.');
    }
    return deny('You cannot change this invitation.');
  }

  /* Personally owned records ------------------------------------------ */
  const ownedName = String(name);
  if ((OWNED as string[]).includes(ownedName) || ownedName === 'devices' || ownedName === 'documents') {
    const ownerField = OWNER_FIELD[name] ?? 'userId';
    const owner = str(field(existing, ownerField)) || str(patch?.[ownerField]);
    if (owner === actor.uid) return allow;

    if (actor.role === 'PROVIDER' && isLinkedPatient(owner)) {
      if (ownedName === 'journal') return deny('The journal is private to the mother.');
      if (ownedName === 'notifications') return op === 'create' ? allow : deny('Notifications belong to the patient.');
      if (ownedName === 'devices' || ownedName === 'supporters') return deny('This is managed by the patient.');
      if (ownedName === 'observations' || ownedName === 'appointments') return allow;
      if (op === 'delete') return deny('Only the patient can delete this record.');
      return allow;
    }
    if (isFacilityAdmin(actor) && isLinkedPatient(owner) && ownedName === 'appointments') return allow;
    return deny('This record belongs to another person.');
  }

  return deny('You do not have permission to do that.');
}

/* ── UI permissions ───────────────────────────────────────────────────── */

export interface UiPermissions {
  signedIn: boolean;
  role: Role | null;
  isMother: boolean;
  isSupporter: boolean;
  isProvider: boolean;
  isFacilityAdmin: boolean;
  isAdmin: boolean;
  isStaff: boolean;
  canManageOwnRecords: boolean;
  canManageContent: boolean;
  canPublishContent: boolean;
  canApproveProviders: boolean;
  canManageFacilities: boolean;
  canManageUsers: boolean;
  canViewAuditLog: boolean;
  canViewReports: boolean;
  canMessagePatients: boolean;
  canChangeSettings: boolean;
  canExportData: boolean;
  canBootstrapAdmin: boolean;
}

const ANONYMOUS: UiPermissions = {
  signedIn: false,
  role: null,
  isMother: false,
  isSupporter: false,
  isProvider: false,
  isFacilityAdmin: false,
  isAdmin: false,
  isStaff: false,
  canManageOwnRecords: false,
  canManageContent: false,
  canPublishContent: false,
  canApproveProviders: false,
  canManageFacilities: false,
  canManageUsers: false,
  canViewAuditLog: false,
  canViewReports: false,
  canMessagePatients: false,
  canChangeSettings: false,
  canExportData: false,
  canBootstrapAdmin: false,
};

export function permissionsFor(actor: Actor | null): UiPermissions {
  if (!actor) return ANONYMOUS;
  const admin = actor.role === 'ADMIN';
  const facilityAdmin = actor.role === 'FACILITY_ADMIN';
  const provider = actor.role === 'PROVIDER';
  const staff = admin || facilityAdmin || provider;
  return {
    signedIn: true,
    role: actor.role,
    isMother: actor.role === 'MOTHER',
    isSupporter: actor.role === 'SUPPORTER',
    isProvider: provider,
    isFacilityAdmin: facilityAdmin,
    isAdmin: admin,
    isStaff: staff,
    canManageOwnRecords: true,
    canManageContent: admin || facilityAdmin || provider,
    canPublishContent: admin,
    canApproveProviders: admin,
    canManageFacilities: admin || facilityAdmin,
    canManageUsers: admin || facilityAdmin,
    canViewAuditLog: admin,
    canViewReports: admin || facilityAdmin,
    canMessagePatients: staff,
    canChangeSettings: admin,
    canExportData: admin || facilityAdmin,
    canBootstrapAdmin: false,
  };
}

export { supporterPermissions };

import type { Role } from '@/types/domain';
import type { Actor, CollectionName } from '@/services/data/contract';

/**
 * Access policy — the single authoritative description of who may read or write
 * what.
 *
 * This module is used three ways:
 *  1. The device provider executes it on every read/write, so a compromised or
 *     tampered UI still cannot exceed it in that mode.
 *  2. `firestore.rules` (root of this repository) implements the same matrix for
 *     Firestore, and `functions/src/routes/*` re-checks the privileged subset on
 *     the server. See docs/SECURITY-VALIDATION.md for the mapping table.
 *  3. The UI reads `permissionsFor()` purely to decide what to render. Hiding a
 *     button is never the security control.
 *
 * `denied()` messages are shown to users, so they explain the operational
 * reason ("records at another facility") rather than an internal rule id.
 */

export type Action = 'read' | 'create' | 'update' | 'delete' | 'list';

export interface Decision {
  allowed: boolean;
  reason?: string;
}

const allow = (): Decision => ({ allowed: true });
const deny = (reason: string): Decision => ({ allowed: false, reason });

export const STAFF_ROLES: readonly Role[] = [
  'ADMIN',
  'FACILITY_SUPERVISOR',
  'MIDWIFE',
  'NURSE',
  'COMMUNITY_HEALTH_WORKER',
];
/** Roles that may enter or amend clinical observations (ANC vitals, tests). */
export const CLINICAL_WRITE_ROLES: readonly Role[] = [
  'ADMIN',
  'FACILITY_SUPERVISOR',
  'MIDWIFE',
  'NURSE',
];
export const SUPERVISORY_ROLES: readonly Role[] = ['ADMIN', 'FACILITY_SUPERVISOR'];

export const isAdmin = (actor: Actor | null): boolean => actor?.role === 'ADMIN';
export const isStaff = (actor: Actor | null): boolean => !!actor && actor.role !== 'MOTHER';
export const isSupervisor = (actor: Actor | null): boolean =>
  !!actor && SUPERVISORY_ROLES.includes(actor.role);
export const isMother = (actor: Actor | null): boolean => actor?.role === 'MOTHER';
/** A signed-in account that has not been approved by an administrator yet. */
export const isPending = (actor: Actor | null): boolean => actor?.accountStatus === 'PENDING_APPROVAL';

/**
 * Collections whose rows carry a facility and must not cross facility lines.
 * `documents`/`reports`/`referrals` are deliberately absent: they expose their
 * own facility fields and are handled case-by-case below.
 */
const FACILITY_SCOPED: CollectionName[] = [
  'mothers',
  'pregnancies',
  'anc_visits',
  'appointments',
  'alerts',
  'education',
];

type Row = Record<string, unknown>;
const asRow = (value: unknown): Row => (value ?? {}) as Row;
const str = (row: Row, key: string): string | null => {
  const v = row[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
};

/** A row belongs to this actor's facility (either the origin or the receiving side). */
export function touchesFacility(row: Row, facilityId: string | null): boolean {
  if (!facilityId) return false;
  return [
    str(row, 'facilityId'),
    str(row, 'registrationFacilityId'),
    str(row, 'careFacilityId'),
    str(row, 'originFacilityId'),
    str(row, 'receivingFacilityId'),
  ].includes(facilityId);
}

/** Every facility that a row's care touches — used to scope audit + aggregate data. */
export function facilitiesOf(row: Row): (string | null)[] {
  return [
    str(row, 'facilityId'),
    str(row, 'registrationFacilityId'),
    str(row, 'careFacilityId'),
    str(row, 'originFacilityId'),
    str(row, 'receivingFacilityId'),
  ].filter((v): v is string => Boolean(v));
}

export function belongsToMother(row: Row, motherId: string | null): boolean {
  if (!motherId) return false;
  return [str(row, 'motherId'), str(row, 'id')].includes(motherId);
}

/**
 * Row-level visibility. Called for every document returned by a read.
 */
export function canReadRow(actor: Actor | null, kind: CollectionName, value: unknown): Decision {
  const row = asRow(value);

  // The facility directory is not patient data and is needed before sign-in
  // (account set-up) and by unapproved accounts.
  if (kind === 'facilities') return allow();

  if (!actor) return deny('Please sign in to continue.');
  // Everyone — including an unapproved account — can read their own profile.
  if (kind === 'users' && str(row, 'id') === actor.uid) return allow();
  if (isPending(actor)) return deny('Your account is awaiting approval by an administrator.');

  switch (kind) {
    case 'users': {
      if (isAdmin(actor)) return allow();
      if (str(row, 'id') === actor.uid) return allow();
      if (isStaff(actor) && str(row, 'accountKind') === 'HEALTH_WORKER') return allow();
      return deny('That account is not available to you.');
    }
    case 'facility_assignments':
      if (isSupervisor(actor)) return allow();
      return str(row, 'userId') === actor.uid ? allow() : deny('Staffing records are limited to your own assignments.');
    case 'settings':
      return isSupervisor(actor) ? allow() : deny('System settings are administrator-only.');
    case 'alert_rules':
      return isStaff(actor) ? allow() : deny('Clinical rules are available to health workers.');
    case 'education': {
      const published = str(row, 'status') === 'PUBLISHED';
      const audience = (row.audience as string[] | undefined) ?? [];
      const facilityId = str(row, 'facilityId');
      if (!published && !isSupervisor(actor)) return deny('This resource has not been published yet.');
      if (isMother(actor)) {
        return audience.includes('MOTHER') ? allow() : deny('This resource is written for health workers.');
      }
      if (facilityId && !touchesFacility(row, actor.facilityId) && !isAdmin(actor)) {
        return deny('This resource is limited to another facility.');
      }
      return allow();
    }
    case 'audit_logs': {
      if (isAdmin(actor)) return allow();
      if (isSupervisor(actor)) {
        const targetFacility = str(row, 'facilityId');
        return !targetFacility || targetFacility === actor.facilityId
          ? allow()
          : deny('Supervisors can review audit activity for their own facility.');
      }
      return str(row, 'actorId') === actor.uid ? allow() : deny('Audit history is limited to your own activity.');
    }
    case 'notifications':
      return str(row, 'userId') === actor.uid ? allow() : deny('Notifications are private to each user.');
    case 'devices':
      return str(row, 'userId') === actor.uid || isAdmin(actor)
        ? allow()
        : deny('Device registrations are private to each user.');
    case 'reports': {
      if (isAdmin(actor)) return allow();
      if (str(row, 'generatedBy') === actor.uid) return allow();
      const accessUsers = (row.accessUserIds as string[] | undefined) ?? [];
      const accessRoles = (row.accessRoles as Role[] | undefined) ?? [];
      if (isMother(actor)) {
        if (!belongsToMother(row, actor.motherId)) return deny('You can only open your own reports.');
        return accessUsers.includes(actor.uid) || accessRoles.includes('MOTHER')
          ? allow()
          : deny('This report has not been released to you.');
      }
      if (!accessRoles.includes(actor.role) && !accessUsers.includes(actor.uid)) {
        return deny('This report is restricted to specific roles.');
      }
      if (isAdmin(actor)) return allow();
      return touchesFacility(row, actor.facilityId) || facilitiesOf(row).length === 0
        ? allow()
        : deny('This report covers another facility.');
    }
    case 'documents': {
      if (isAdmin(actor)) return allow();
      const owner = str(row, 'ownerUserId');
      const accessUsers = (row.accessUserIds as string[] | undefined) ?? [];
      if (owner === actor.uid || accessUsers.includes(actor.uid) || str(row, 'uploadedBy') === actor.uid) {
        return allow();
      }
      if (isMother(actor)) return belongsToMother(row, actor.motherId) ? allow() : deny('You can only open your own documents.');
      const accessRoles = (row.accessRoles as Role[] | undefined) ?? [];
      if (accessRoles.length > 0 && !accessRoles.includes(actor.role)) return deny('This document is restricted to other roles.');
      const motherId = str(row, 'motherId');
      const facility = str(row, 'facilityId');
      if (motherId) {
        return actor.facilityId === facility || !facility
          ? allow()
          : deny('This patient document belongs to another facility’s record.');
      }
      if (facility && !touchesFacility(row, actor.facilityId)) return deny('This document belongs to another facility.');
      return allow();
    }
    case 'referrals': {
      if (isAdmin(actor)) return allow();
      if (isMother(actor)) return belongsToMother(row, actor.motherId) ? allow() : deny('You can only view your own referrals.');
      // Facility-to-ffacility handover must be visible on both ends.
      return touchesFacility(row, actor.facilityId)
        ? allow()
        : deny('This referral does not involve your facility.');
    }
    default: {
      // mothers, pregnancies, anc_visits, appointments, alerts
      if (isMother(actor)) {
        return belongsToMother(row, actor.motherId) ? allow() : deny('Patient records are private to each mother.');
      }
      if (isAdmin(actor)) return allow();
      if (!isStaff(actor)) return deny('This record is not available to your account.');
      if (FACILITY_SCOPED.includes(kind)) {
        return touchesFacility(row, actor.facilityId)
          ? allow()
          : deny('Records at another facility are outside your access.');
      }
      return allow();
    }
  }
}

/**
 * Write authorisation. `existing` is the row being updated (null on create),
 * `patch` the proposed changes. Rules are evaluated on the *merged* row so an
 * update cannot move a record out of scope as a side-channel.
 */
export function canWrite(
  actor: Actor | null,
  kind: CollectionName,
  action: Exclude<Action, 'read' | 'list'>,
  existing: unknown,
  patch?: Record<string, unknown> | null,
): Decision {
  if (!actor) return deny('Your session has expired. Please sign in again.');

  // A person who is not yet approved must still be able to create their own
  // least-privileged profile — that is the sign-up path. Everything else is
  // blocked until an administrator approves the account.
  if (kind === 'users' && action === 'create') {
    const mergedSelf: Row = { ...asRow(existing), ...(patch ?? {}) };
    if (str(mergedSelf, 'id') !== actor.uid) return deny('Accounts are created through the sign-up flow.');
    if (str(mergedSelf, 'role') === 'ADMIN') return deny('Administrator rights cannot be requested from the app.');
    if (['privilegeVersion', 'motherId'].some((key) => key in (patch ?? {}))) {
      return deny('Privileges are assigned by an administrator.');
    }
    const status = str(mergedSelf, 'status');
    if (status && status !== 'PENDING_APPROVAL' && status !== 'ACTIVE') {
      return deny('Account status is assigned by an administrator.');
    }
    return allow();
  }

  if (isPending(actor)) {
    return deny('Your account is awaiting administrator approval, so records cannot be changed yet.');
  }

  const current = asRow(existing);
  const merged: Row = { ...current, ...(patch ?? {}) };

  if (action === 'delete' && kind !== 'documents' && kind !== 'devices') {
    return deny('Clinical records are never hard-deleted. Close or archive them instead.');
  }

  switch (kind) {
    case 'users': {
      if (isAdmin(actor)) return allow();
      if (str(current, 'id') === actor.uid) {
        const privileged = ['role', 'status', 'facilityId', 'privilegeVersion', 'motherId', 'accountKind'];
        const touched = privileged.filter((key) => patch && key in patch && patch[key] !== current[key]);
        if (touched.length > 0) {
          return deny('Privileges can only be changed by an administrator.');
        }
        return action === 'delete'
          ? deny('Account deactivation must be performed by an administrator.')
          : allow();
      }
      return deny('Only an administrator can modify other accounts.');
    }
    case 'facilities': {
      if (isAdmin(actor)) return allow();
      if (isSupervisor(actor) && str(current, 'id') === actor.facilityId) {
        return deny('Facility configuration changes require an administrator.');
      }
      return deny('Only an administrator can manage facilities.');
    }
    case 'facility_assignments':
      return isSupervisor(actor)
        ? allow()
        : deny('Facility supervisors and administrators assign health workers to facilities.');
    case 'settings':
      return isAdmin(actor) ? allow() : deny('System settings are administrator-only.');
    case 'alert_rules':
      return isAdmin(actor)
        ? allow()
        : deny('Clinical rules are maintained by administrators and require clinical sign-off.');
    case 'education':
      return isSupervisor(actor) ? allow() : deny('Educational resources are managed by supervisors and administrators.');
    case 'audit_logs':
      if (action === 'create' && (str(merged, 'actorId') === actor.uid || str(merged, 'actorId') === 'system')) {
        return allow();
      }
      return deny('Audit records are append-only and written by the platform.');
    case 'notifications': {
      if (str(current, 'userId') === actor.uid) return allow();
      return isSupervisor(actor) ? allow() : deny('Only supervisors may notify other users.');
    }
    case 'devices':
      return str(current, 'userId') === actor.uid || !existing ? allow() : deny('Device registrations are private to each user.');
    case 'reports':
      // Reports are generated by the client and persisted with an access list;
      // only the generator (or admin) may amend the record afterwards.
      if (action === 'create') return isStaff(actor) ? allow() : deny('Patient accounts cannot generate facility reports.');
      return isAdmin(actor) || str(current, 'generatedBy') === actor.uid
        ? allow()
        : deny('Only the person who generated a report can amend it.');
    case 'documents': {
      if (isAdmin(actor)) return allow();
      if (action === 'delete') {
        const owner = str(current, 'uploadedBy');
        return owner === actor.uid
          ? allow()
          : deny('Only the uploader or an administrator can remove a document.');
      }
      if (isMother(actor)) {
        // A mother may only ever attach files to her own record.
        return belongsToMother(merged, actor.motherId)
          ? allow()
          : deny('You can only attach documents to your own record.');
      }
      if (!isStaff(actor)) return deny('This account cannot upload documents.');
      const motherId = str(merged, 'motherId');
      if (motherId) {
        const facility = str(merged, 'facilityId');
        if (facility && facility !== actor.facilityId && !touchesFacility(merged, actor.facilityId)) {
          return deny('This patient belongs to another facility.');
        }
      }
      return allow();
    }
    case 'referrals': {
      if (isMother(actor)) return deny('Speak to a health worker to request a referral.');
      if (isAdmin(actor)) return allow();
      if (!touchesFacility(merged, actor.facilityId)) {
        return deny('You can only refer patients from or to your facility.');
      }
      // Status progression belongs to the receiving facility (or the origin
      // while the referral is still awaiting receipt).
      if (action === 'update' && patch && 'status' in patch) {
        const receiving = str(merged, 'receivingFacilityId');
        const origin = str(merged, 'originFacilityId');
        const status = String(patch.status);
        if (status !== 'ACTIVE' && receiving && actor.facilityId !== receiving && status !== 'CLOSED' && status !== 'REFERRED_ONWARD') {
          return deny(
            actor.facilityId === origin
              ? 'Only the receiving facility can record what happened after handover.'
              : 'That referral is managed by the receiving facility.',
          );
        }
      }
      return allow();
    }
    default: {
      // mothers, pregnancies, anc_visits, appointments, alerts
      if (isMother(actor)) {
        if (kind === 'alerts' && action === 'create' && belongsToMother(merged, actor.motherId)) {
          return allow();
        }
        if (kind === 'mothers' && action === 'update' && belongsToMother(merged, actor.motherId)) {
          // A mother keeps her own contact details current — clinical content is
          // recorded by the facility.
          const clinical = ['chronicConditions', 'allergies', 'bloodGroup', 'currentPregnancyId', 'riskLevel'];
          const touched = clinical.filter((key) => patch && key in patch);
          return touched.length > 0
            ? deny('Ask your clinic to update clinical details on your record.')
            : allow();
        }
        return deny('Only health workers can change clinical records.');
      }
      if (isAdmin(actor)) return allow();
      if (!isStaff(actor)) return deny('This account cannot change patient records.');

      if (action === 'update' && !touchesFacility(current, actor.facilityId) && facilitiesOf(current).length > 0) {
        return deny('You can only amend records at your facility.');
      }
      if (action === 'create' && !isSupervisor(actor) && !str(merged, 'facilityId') && !str(merged, 'registrationFacilityId')) {
        return deny('Select the facility this record belongs to.');
      }

      const clinicalWrite = kind === 'anc_visits' || kind === 'pregnancies';
      if (clinicalWrite && !CLINICAL_WRITE_ROLES.includes(actor.role)) {
        return deny(
          'Clinical findings are entered by midwives, nurses, supervisors or administrators. Community health workers record appointments, alerts and referrals.',
        );
      }
      if (kind === 'mothers' && action === 'update' && 'riskLevel' in (patch ?? {})) {
        return CLINICAL_WRITE_ROLES.includes(actor.role)
          ? allow()
          : deny('Risk status is set by the clinical review process.');
      }
      return allow();
    }
  }
}

/** Query-level scope applied by the device provider before rows are returned. */
export function readScope(kind: CollectionName, actor: Actor | null): (row: unknown) => boolean {
  return (row) => canReadRow(actor, kind, row).allowed;
}

export interface UiPermissions {
  canViewClinicalRecords: boolean;
  canRegisterMother: boolean;
  canRecordAncVisit: boolean;
  canCreateAlert: boolean;
  canResolveAlert: boolean;
  canCreateReferral: boolean;
  canUpdateReferral: boolean;
  canScheduleAppointment: boolean;
  canUploadDocuments: boolean;
  canGenerateReports: boolean;
  canViewFacilityReports: boolean;
  canManageEducation: boolean;
  canManageUsers: boolean;
  canAssignRoles: boolean;
  canManageFacilities: boolean;
  canManageSettings: boolean;
  canViewAuditLogs: boolean;
  canAdministerPlatform: boolean;
}

export function permissionsFor(actor: Actor | null): UiPermissions {
  const staff = isStaff(actor);
  const clinical = !!actor && CLINICAL_WRITE_ROLES.includes(actor.role);
  const admin = isAdmin(actor);
  const supervisor = isSupervisor(actor);
  return {
    canViewClinicalRecords: staff,
    canRegisterMother: staff,
    canRecordAncVisit: clinical,
    canCreateAlert: staff || isMother(actor),
    canResolveAlert: clinical || supervisor,
    canCreateReferral: staff,
    canUpdateReferral: staff,
    canScheduleAppointment: staff,
    canUploadDocuments: staff || isMother(actor),
    canGenerateReports: staff,
    canViewFacilityReports: supervisor || admin,
    canManageEducation: supervisor,
    canManageUsers: admin,
    canAssignRoles: admin,
    canManageFacilities: admin,
    canManageSettings: admin,
    canViewAuditLogs: supervisor,
    canAdministerPlatform: admin,
  };
}

export const ROLE_CAPABILITIES: { role: Role; capabilities: string[] }[] = [
  {
    role: 'ADMIN',
    capabilities: [
      'All clinical and facility data',
      'User accounts, roles and facility assignment',
      'System settings and clinical rule maintenance',
      'Audit log review',
    ],
  },
  {
    role: 'FACILITY_SUPERVISOR',
    capabilities: [
      'Full clinical record access for their facility',
      'Facility reports, alerts and referral oversight',
      'Staffing assignment within their facility',
      'Audit review for their facility',
    ],
  },
  {
    role: 'MIDWIFE',
    capabilities: [
      'Register mothers and record ANC visits',
      'Raise, assess and resolve alerts',
      'Create referrals and schedule appointments',
      'Upload clinical documents and generate patient reports',
    ],
  },
  {
    role: 'NURSE',
    capabilities: [
      'Register mothers and record ANC visits',
      'Screening, vitals and laboratory results',
      'Referrals and appointment scheduling',
    ],
  },
  {
    role: 'COMMUNITY_HEALTH_WORKER',
    capabilities: [
      'Register mothers in the community',
      'Record danger signs and raise alerts',
      'Appointments, follow-up and referral initiation',
      'No entry of clinical findings (midwife/nurse review)',
    ],
  },
  {
    role: 'MOTHER',
    capabilities: [
      'Own pregnancy record, appointments and reminders',
      'Own reports, documents and referrals',
      'Report a danger sign',
      'Health education in their chosen language',
    ],
  },
];

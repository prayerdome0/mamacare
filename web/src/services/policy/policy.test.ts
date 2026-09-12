import { describe, expect, it } from 'vitest';
import { canReadRow, canWrite, belongsToMother, touchesFacility } from './policy';
import { permissionsFor } from './policy';
import type { Actor } from '@/services/data/contract';
import type { Mother } from '@/types/domain';

/** The policy reads rows structurally; this keeps the fixture honest and typed. */
const row = <T extends object>(value: T): Record<string, unknown> => value as unknown as Record<string, unknown>;

const actor = (patch: Partial<Actor>): Actor => ({
  uid: 'u1',
  email: 'midwife@facility.health',
  displayName: 'Test Midwife',
  role: 'MIDWIFE',
  facilityId: 'fac-a',
  motherId: null,
  accountStatus: 'ACTIVE',
  privilegeVersion: 1,
  claimsSource: 'firebase-id-token',
  ...patch,
});

const mother = (patch: Partial<Mother> = {}): Mother =>
  ({
    id: 'mom-1',
    patientId: 'MC-000245',
    fullName: 'Test Mother',
    phone: '+260970000000',
    preferredLanguage: 'English',
    registrationFacilityId: 'fac-a',
    status: 'ACTIVE',
    createdAt: '2026-01-01T08:00:00.000Z',
    createdBy: 'u1',
    createdByName: 'Test Midwife',
    updatedAt: '2026-01-01T08:00:00.000Z',
    ...patch,
  }) as Mother;

describe('access policy', () => {
  it('lets staff at the owning facility read a record', () => {
    expect(canReadRow(actor({ role: 'MIDWIFE' }), 'mothers', row(mother())).allowed).toBe(true);
    expect(canReadRow(actor({ role: 'COMMUNITY_HEALTH_WORKER' }), 'mothers', row(mother())).allowed).toBe(true);
  });

  it('keeps another facility’s records out of reach', () => {
    const decision = canReadRow(actor({ facilityId: 'fac-b' }), 'mothers', row(mother({ registrationFacilityId: 'fac-a' })));
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toMatch(/facility/i);
  });

  it('restricts a mother to her own rows', () => {
    const self = actor({ role: 'MOTHER', uid: 'mom-1', motherId: 'mom-1', facilityId: null });
    expect(canReadRow(self, 'mothers', row(mother())).allowed).toBe(true);
    expect(canReadRow(self, 'mothers', row(mother({ id: 'mom-2', registrationFacilityId: 'fac-z' }))).allowed).toBe(false);
    expect(canReadRow(self, 'anc_visits', { motherId: 'mom-9' }).allowed).toBe(false);
  });

  it('blocks clinical reads for an unapproved account but not its own profile', () => {
    const pending = actor({ accountStatus: 'PENDING_APPROVAL' });
    expect(canReadRow(pending, 'users', { id: pending.uid }).allowed).toBe(true);
    expect(canReadRow(pending, 'mothers', row(mother())).allowed).toBe(false);
  });

  it('refuses to let a mother, or any client, set her own privileges', () => {
    const motherActor = actor({ role: 'MOTHER', motherId: 'mom-1', facilityId: null });
    expect(canWrite(motherActor, 'mothers', 'create', null, row(mother()) as never).allowed).toBe(false);
    const selfPatch = { role: 'ADMIN' } as never;
    expect(canWrite(actor({ uid: 'u9' }), 'users', 'update', { id: 'u9' }, selfPatch).allowed).toBe(false);
  });

  it('keeps clinical findings out of a community health worker’s writes', () => {
    const chw = actor({ role: 'COMMUNITY_HEALTH_WORKER' });
    expect(canWrite(chw, 'anc_visits', 'create', null, { facilityId: 'fac-a' } as never).allowed).toBe(false);
    expect(canWrite(chw, 'pregnancies', 'update', { facilityId: 'fac-a' } as never, {} as never).allowed).toBe(false);
    expect(canWrite(chw, 'appointments', 'update', { facilityId: 'fac-a', motherId: 'mom-1' } as never, { status: 'COMPLETED' } as never).allowed).toBe(true);
  });

  it('lets a mother keep her own contact details current but not her clinical record', () => {
    const self = actor({ role: 'MOTHER', uid: 'mom-1', motherId: 'mom-1', facilityId: null });
    expect(canWrite(self, 'mothers', 'update', mother(), { phone: '+260971111111' } as never).allowed).toBe(true);
    expect(canWrite(self, 'mothers', 'update', mother(), { allergies: 'penicillin' } as never).allowed).toBe(false);
    expect(canWrite(self, 'mothers', 'create', null, row(mother()) as never).allowed).toBe(false);
  });

  it('keeps a mother’s document attachments on her own record', () => {
    const self = actor({ role: 'MOTHER', uid: 'mom-1', motherId: 'mom-1', facilityId: null });
    expect(canWrite(self, 'documents', 'create', null, { motherId: 'mom-1' } as never).allowed).toBe(true);
    expect(canWrite(self, 'documents', 'create', null, { motherId: 'mom-2' } as never).allowed).toBe(false);
  });

  it('leaves the post-handover status to the receiving facility', () => {
    const origin = actor({ role: 'MIDWIFE', facilityId: 'fac-a' });
    const referral = { originFacilityId: 'fac-a', receivingFacilityId: 'fac-b', motherId: 'mom-1' };
    expect(canWrite(origin, 'referrals', 'update', referral as never, { status: 'ASSESSMENT_COMPLETED' } as never).allowed).toBe(false);
    expect(canWrite(origin, 'referrals', 'update', referral as never, { status: 'CLOSED' } as never).allowed).toBe(true);
    const receiving = actor({ role: 'MIDWIFE', facilityId: 'fac-b' });
    expect(canWrite(receiving, 'referrals', 'update', referral as never, { status: 'DISCHARGED' } as never).allowed).toBe(true);
  });

  it('is append-only for audit records — even for an administrator', () => {
    const admin = actor({ role: 'ADMIN', facilityId: null });
    expect(canWrite(admin, 'audit_logs', 'create', null, { actorId: admin.uid } as never).allowed).toBe(true);
    expect(canWrite(admin, 'audit_logs', 'update', { actorId: admin.uid } as never, { action: 'user.updated' } as never).allowed).toBe(false);
    expect(canWrite(admin, 'audit_logs', 'delete', { actorId: admin.uid } as never).allowed).toBe(false);
  });

  it('grants clinical entry to midwives and supervisors, not to CHWs', () => {
    expect(permissionsFor(actor({ role: 'MIDWIFE' })).canRecordAncVisit).toBe(true);
    expect(permissionsFor(actor({ role: 'FACILITY_SUPERVISOR' })).canRecordAncVisit).toBe(true);
    expect(permissionsFor(actor({ role: 'COMMUNITY_HEALTH_WORKER' })).canRecordAncVisit).toBe(false);
    expect(permissionsFor(actor({ role: 'MIDWIFE' })).canAssignRoles).toBe(false);
    expect(permissionsFor(actor({ role: 'ADMIN' })).canManageUsers).toBe(true);
    expect(permissionsFor(null).canViewClinicalRecords).toBe(false);
  });

  it('matches mother ownership by id or by motherId', () => {
    expect(belongsToMother({ motherId: 'mom-1' }, 'mom-1')).toBe(true);
    expect(belongsToMother({ id: 'mom-1' }, 'mom-1')).toBe(true);
    expect(belongsToMother({ motherId: 'mom-2' }, 'mom-1')).toBe(false);
    expect(belongsToMother({}, null)).toBe(false);
  });
});

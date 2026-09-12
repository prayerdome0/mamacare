import { describe, expect, it } from 'vitest';
import {
  isAdministratorRole,
  nameFromRow,
  normaliseRole,
  normaliseStatus,
  rankOf,
  resolveRole,
  roleFromRow,
  statusFromRow,
} from '@/services/auth/role-resolution';

describe('role normalisation', () => {
  it('accepts the canonical role names in any case', () => {
    expect(normaliseRole('ADMIN')).toBe('ADMIN');
    expect(normaliseRole('admin')).toBe('ADMIN');
    expect(normaliseRole('  Administrator ')).toBe('ADMIN');
    expect(normaliseRole('facility-supervisor')).toBe('FACILITY_SUPERVISOR');
    expect(normaliseRole('MIDWIFE')).toBe('MIDWIFE');
    expect(normaliseRole('mother')).toBe('MOTHER');
  });

  it('maps hand-written console values onto platform roles', () => {
    expect(normaliseRole('user')).toBe('MOTHER');
    expect(normaliseRole('patient')).toBe('MOTHER');
    expect(normaliseRole('chw')).toBe('COMMUNITY_HEALTH_WORKER');
    expect(normaliseRole('health_worker')).toBe('COMMUNITY_HEALTH_WORKER');
    expect(normaliseRole('supervisor')).toBe('FACILITY_SUPERVISOR');
  });

  it('refuses anything it does not recognise rather than granting a role', () => {
    expect(normaliseRole('superuser')).toBeNull();
    expect(normaliseRole('')).toBeNull();
    expect(normaliseRole(undefined)).toBeNull();
    expect(normaliseRole(42)).toBeNull();
  });

  it('normalises account status from the same document', () => {
    expect(normaliseStatus('active')).toBe('ACTIVE');
    expect(normaliseStatus('pending')).toBe('PENDING_APPROVAL');
    expect(normaliseStatus('disabled')).toBe('SUSPENDED');
    expect(normaliseStatus(undefined, 'ACTIVE')).toBe('ACTIVE');
  });
});

describe('role resolution — Firestore document is the source of truth', () => {
  it('treats an account designated admin in Firestore as an administrator', () => {
    const resolution = resolveRole({ documentRole: 'admin', claimsRole: 'MOTHER' });
    expect(resolution.role).toBe('ADMIN');
    expect(resolution.roleSource).toBe('firestore-document');
    expect(resolution.escalation).toBe(true);
    expect(resolution.needsClaimSync).toBe(true);
    expect(isAdministratorRole(resolution.role)).toBe(true);
  });

  it('treats a normal user as a normal user even when a stale token says admin', () => {
    const resolution = resolveRole({ documentRole: 'user', claimsRole: 'ADMIN' });
    expect(resolution.role).toBe('MOTHER');
    expect(resolution.escalation).toBe(false);
    expect(resolution.needsClaimSync).toBe(true);
  });

  it('falls back to the ID token claims when the document has no usable role', () => {
    const resolution = resolveRole({ claimsRole: 'MIDWIFE' });
    expect(resolution.role).toBe('MIDWIFE');
    expect(resolution.roleSource).toBe('custom-claims');
    expect(resolution.needsClaimSync).toBe(false);
  });

  it('defaults a brand-new account to the least-privileged role', () => {
    const resolution = resolveRole({});
    expect(resolution.role).toBe('MOTHER');
    expect(resolution.roleSource).toBe('default');
    expect(resolution.claimsRole).toBeNull();
  });

  it('does not attempt a claim sync when document and token already agree', () => {
    const resolution = resolveRole({ documentRole: 'ADMIN', claimsRole: 'ADMIN' });
    expect(resolution.needsClaimSync).toBe(false);
    expect(resolution.escalation).toBe(false);
  });

  it('ranks roles so escalation is directional', () => {
    expect(rankOf('ADMIN')).toBeGreaterThan(rankOf('FACILITY_SUPERVISOR'));
    expect(rankOf('FACILITY_SUPERVISOR')).toBeGreaterThan(rankOf('MOTHER'));
    expect(rankOf(null)).toBe(0);
  });
});

describe('document shape tolerance', () => {
  it('reads a role and status from a hand-written row', () => {
    const row = { role: 'admin', status: 'active', name: 'Chanda Mwale' };
    expect(roleFromRow(row)).toBe('ADMIN');
    expect(statusFromRow(row)).toBe('ACTIVE');
    expect(nameFromRow(row)).toBe('Chanda Mwale');
  });

  it('accepts `fullName`, `displayName` and `name`', () => {
    expect(nameFromRow({ fullName: 'A Banda' })).toBe('A Banda');
    expect(nameFromRow({ displayName: 'C Phiri' })).toBe('C Phiri');
    expect(nameFromRow({ name: 'D Zulu' })).toBe('D Zulu');
    expect(nameFromRow({}, 'fallback')).toBe('fallback');
  });
});

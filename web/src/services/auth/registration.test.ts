// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSelfProfileDocument, registerAccount } from '@/services/auth/registration';
import { services } from '@/services/session-store';
import { wipe } from '@/services/data/local/store';
import type { RegisterValues } from '@/lib/validation';
import type { Actor } from '@/services/data/contract';

/** The session a brand-new account holds — enough to read its own row. */
function selfActor(uid: string, email: string, status: Actor['accountStatus'] = 'ACTIVE'): Actor {
  return {
    uid,
    email,
    displayName: 'New account',
    role: 'MOTHER',
    facilityId: null,
    accountStatus: status,
    motherId: null,
    privilegeVersion: 0,
    claimsSource: 'local-session',
  };
}

/**
 * Registration and sign-in, executed through the real service stack (device
 * provider + policy module + data layer) rather than mocked modules.
 *
 * The defect these tests lock down: the first `users/{uid}` write used to include
 * the server-managed `privilegeVersion` field, which `firestore.rules` refuses —
 * registration therefore failed *after* the authentication account was created,
 * leaving the address unusable and the user with an unexplained error.
 */

const baseValues: RegisterValues = {
  fullName: 'Chanda Mwale',
  email: 'chanda@example.org',
  phone: '0971234567',
  password: 'MamaCare!2026',
  confirmPassword: 'MamaCare!2026',
  accountKind: 'PATIENT',
  requestedRole: undefined,
  facilityId: '',
  jobTitle: '',
  preferredLanguage: 'English',
  country: 'ZM',
  acceptTerms: true,
  acceptMarketing: false,
};

describe('the first profile document a client is allowed to write', () => {
  const document = buildSelfProfileDocument({
    uid: 'uid-1',
    profile: {
      fullName: 'Chanda Mwale',
      email: 'chanda@example.org',
      phone: '+260971234567',
      facilityId: null,
      isHealthWorker: false,
      requestedRole: null,
      title: null,
      country: 'ZM',
      preferredLanguage: 'English',
    },
  });

  it('never contains server-managed privilege fields', () => {
    expect(document).not.toHaveProperty('privilegeVersion');
    expect(document).not.toHaveProperty('claimsSource');
  });

  it('uses the least-privileged role, and only roles a client may declare', () => {
    expect(document.role).toBe('MOTHER');
    expect(['MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'FACILITY_SUPERVISOR', 'MOTHER']).toContain(document.role);
    expect(document.role).not.toBe('ADMIN');
  });

  it('activates a patient account and holds a health worker for approval', () => {
    expect(document.status).toBe('ACTIVE');
    expect(document.accountKind).toBe('PATIENT');

    const worker = buildSelfProfileDocument({
      uid: 'uid-2',
      profile: {
        fullName: 'Grace Banda',
        email: 'grace@clinic.example',
        phone: '+260961234567',
        facilityId: 'fac-1',
        isHealthWorker: true,
        requestedRole: 'MIDWIFE',
        title: 'Senior midwife',
        country: 'ZM',
        preferredLanguage: 'English',
      },
    });
    expect(worker.status).toBe('PENDING_APPROVAL');
    expect(worker.accountKind).toBe('HEALTH_WORKER');
    expect(worker.requestedRole).toBe('MIDWIFE');
    expect(worker.role).toBe('MOTHER'); // the effective role stays minimal
  });

  it('records the Zambian country default on the account', () => {
    expect(document.country).toBe('ZM');
  });
});

describe('registering and signing in against the real service stack', () => {
  beforeEach(async () => {
    await wipe();
    localStorage.clear();
  });

  it('creates an account that can sign in, and refuses a wrong password', async () => {
    const created = await registerAccount(baseValues);
    expect(created.uid).toBeTruthy();
    expect(created.email).toBe('chanda@example.org');
    expect(created.needsApproval).toBe(false);

    // The stored profile exists, is a normal user, and carries the country.
    const row = await services().provider.get('users', created.uid, selfActor(created.uid, created.email));
    expect(row?.email).toBe('chanda@example.org');
    expect(row?.role).toBe('MOTHER');
    expect((row as { country?: string } | null)?.country).toBe('ZM');

    // Signing in with the real password produces a mother session.
    await services().signOut();
    const actor = await services().signIn('chanda@example.org', 'MamaCare!2026', true);
    expect(actor.role).toBe('MOTHER');
    expect(actor.accountStatus).toBe('ACTIVE');
    expect(actor.email).toBe('chanda@example.org');
  });

  it('reports a friendly message for a duplicate address and a wrong password', async () => {
    await registerAccount(baseValues);

    await expect(registerAccount(baseValues)).rejects.toMatchObject({
      message: expect.stringContaining('already has an account'),
    });

    await expect(services().signIn('chanda@example.org', 'WrongPassword1', true)).rejects.toMatchObject({
      message: expect.stringMatching(/incorrect|locked/i),
    });

    await expect(services().signIn('nobody@example.org', 'MamaCare!2026', true)).rejects.toMatchObject({
      message: expect.stringMatching(/incorrect/i),
    });
  });

  it('does not grant an administrator role through registration values', async () => {
    const created = await registerAccount({
      ...baseValues,
      email: 'sneaky@example.org',
      // A crafted request: the service layer must ignore it.
      requestedRole: 'FACILITY_SUPERVISOR',
      accountKind: 'HEALTH_WORKER',
      facilityId: 'fac-1',
    } as RegisterValues);

    const row = await services().provider.get(
      'users',
      created.uid,
      selfActor(created.uid, created.email, 'PENDING_APPROVAL'),
    );
    expect(row?.role).toBe('MOTHER');
    expect(row?.status).toBe('PENDING_APPROVAL');
    expect(row?.requestedRole).toBe('FACILITY_SUPERVISOR'); // recorded as a request only
  });
});

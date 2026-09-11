import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { writeAudit } from '../audit.js';
import { requireAdminSdk, dbOrThrow, requireAdmin as guardAdmin, type ActorClaims } from '../firebase.js';
import { conflict, forbidden, notConfigured, rateLimited, withBody } from '../http.js';
import { claimsOf, requireAuth } from './_auth.js';

/**
 * Privileged account operations.
 *
 * These exist only server-side because custom claims can only be written with the
 * Admin SDK: it is what makes “an account cannot grant itself administrator”
 * structurally true rather than a UI convention. Every action requires a written
 * reason and appends an audit entry.
 */
export const adminRouter = Router();

const ROLES = ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'];
const reason = z.string().trim().min(4, 'Record a short reason — it is stored in the audit log.').max(300);

const roleBody = z.object({
  uid: z.string().trim().min(6).max(128),
  role: z.enum(ROLES),
  facilityId: z.string().trim().max(128).nullish(),
  reason,
});

adminRouter.post('/users/role', requireAuth, withBody(roleBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  const { auth, db } = requireAdminSdk();

  if (input.uid === claims.uid && input.role !== 'ADMIN' && claims.role === 'ADMIN') {
    throw forbidden('An administrator may not remove their own role. Ask another administrator to hand the role over first.');
  }

  const profile = await db.collection('users').doc(input.uid).get();
  if (!profile.exists) throw conflict('That account no longer exists.');
  const previous = (profile.get('role') as string | undefined) ?? 'unknown';

  const claimsPatch: Record<string, unknown> = {
    role: input.role,
    facilityId: input.facilityId || null,
    accountStatus: 'ACTIVE',
    privilegeVersion: Date.now(),
  };
  if (input.role === 'MOTHER') {
    const motherId = profile.get('motherId') as string | null | undefined;
    if (!motherId) throw conflict('A mother’s login must be linked to her record first. Open her record and create the login there.');
    claimsPatch.motherId = motherId;
  } else {
    // A staff account must never carry a motherId claim: it would widen what the
    // "mother sees her own row" rule allows.
    claimsPatch.motherId = null;
  }

  await auth.setCustomUserClaims(input.uid, claimsPatch);
  await db.collection('users').doc(input.uid).set(
    {
      role: input.role,
      facilityId: input.facilityId || null,
      status: 'ACTIVE',
      privilegeVersion: claimsPatch.privilegeVersion,
      accountKind: input.role === 'MOTHER' ? 'PATIENT' : 'HEALTH_WORKER',
      updatedAt: new Date().toISOString(),
      updatedBy: claims.uid,
    },
    { merge: true },
  );

  await writeAudit(db, claims, {
    action: 'user.role_changed',
    targetType: 'user',
    targetId: input.uid,
    targetLabel: (profile.get('email') as string | undefined) ?? null,
    facilityId: input.facilityId ?? (profile.get('facilityId') as string | null | undefined) ?? null,
    metadata: { from: previous, to: input.role, reason: input.reason },
  });

  return { ok: true, claimsUpdated: true };
}));

const revokeBody = z.object({ uid: z.string().trim().min(6).max(128), reason });

/** Forces every signed-in device for that account to re-authenticate. */
adminRouter.post('/users/revoke', requireAuth, withBody(revokeBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  const { auth, db } = requireAdminSdk();
  await auth.revokeRefreshTokens(input.uid);
  await db
    .collection('users')
    .doc(input.uid)
    .set({ privilegeVersion: Date.now(), updatedAt: new Date().toISOString(), updatedBy: claims.uid }, { merge: true })
    .catch(() => null);
  await writeAudit(db, claims, {
    action: 'auth.session_revoked',
    targetType: 'session',
    targetId: input.uid,
    facilityId: claims.facilityId,
    metadata: { reason: input.reason },
  });
  return { ok: true };
}));

const createBody = z.object({
  fullName: z.string().trim().min(3).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(24),
  role: z.enum(ROLES),
  facilityId: z.string().trim().min(1),
  temporaryPassword: z.string().min(10).max(128),
  mustChangePassword: z.boolean().default(true),
});

/**
 * Creates a staff account with its claims already correct, so a new midwife is
 * never signed in with an unapproved or over-privileged session.
 */
adminRouter.post('/users/create', requireAuth, withBody(createBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  const { auth, db } = requireAdminSdk();

  const existing = await auth.getUserByEmail(input.email).catch(() => null);
  if (existing) throw conflict('An account already exists for that email address.');

  const created = await auth.createUser({
    email: input.email,
    password: input.temporaryPassword,
    displayName: input.fullName,
    emailVerified: true,
    disabled: false,
  });
  await auth.setCustomUserClaims(created.uid, {
    role: input.role,
    facilityId: input.facilityId,
    accountStatus: 'ACTIVE',
    privilegeVersion: Date.now(),
  });
  await db.collection('users').doc(created.uid).set({
    id: created.uid,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    role: input.role,
    status: 'ACTIVE',
    accountKind: input.role === 'MOTHER' ? 'PATIENT' : 'HEALTH_WORKER',
    facilityId: input.facilityId,
    emailVerified: true,
    privilegeVersion: Date.now(),
    mustChangePassword: input.mustChangePassword,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: claims.uid,
    updatedBy: claims.uid,
  });

  await writeAudit(db, claims, {
    action: 'user.created',
    targetType: 'user',
    targetId: created.uid,
    targetLabel: input.email,
    facilityId: input.facilityId,
    metadata: { role: input.role, mustChangePassword: input.mustChangePassword, via: 'api' },
  });

  // The temporary password is never echoed back through the response or the log.
  return { uid: created.uid };
}));

const suspendBody = z.object({
  uid: z.string().trim().min(6).max(128),
  status: z.enum(['ACTIVE', 'SUSPENDED', 'PENDING_APPROVAL']),
  reason,
});

adminRouter.post('/users/status', requireAuth, withBody(suspendBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  if (input.uid === claims.uid) throw forbidden('You cannot deactivate the account you are signed in with.');
  const { auth, db } = requireAdminSdk();
  await auth.updateUser(input.uid, { disabled: input.status === 'SUSPENDED' });
  await auth.setCustomUserClaims(input.uid, { accountStatus: input.status, privilegeVersion: Date.now() });
  await db
    .collection('users')
    .doc(input.uid)
    .set(
      {
        status: input.status,
        privilegeVersion: Date.now(),
        deactivatedAt: input.status === 'SUSPENDED' ? new Date().toISOString() : null,
        deactivatedBy: input.status === 'SUSPENDED' ? claims.uid : null,
        deactivationReason: input.reason,
        updatedAt: new Date().toISOString(),
        updatedBy: claims.uid,
      },
      { merge: true },
    );
  await writeAudit(db, claims, {
    action: input.status === 'SUSPENDED' ? 'user.deactivated' : input.status === 'ACTIVE' ? 'user.reactivated' : 'user.updated',
    targetType: 'user',
    targetId: input.uid,
    facilityId: claims.facilityId,
    metadata: { status: input.status, reason: input.reason },
  });
  return { ok: true };
}));

const approveBody = z.object({
  uid: z.string().trim().min(6).max(128),
  role: z.enum(ROLES),
  facilityId: z.string().trim().min(1),
  reason,
});

/** Clears a self-registered account's PENDING_APPROVAL state and issues its claims. */
adminRouter.post('/users/approve', requireAuth, withBody(approveBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  const { auth, db } = requireAdminSdk();
  const target = await db.collection('users').doc(input.uid).get();
  if (!target.exists) throw conflict('That account no longer exists.');
  if (target.get('status') !== 'PENDING_APPROVAL') throw conflict('This account has already been processed.');

  await auth.setCustomUserClaims(input.uid, {
    role: input.role,
    facilityId: input.facilityId,
    accountStatus: 'ACTIVE',
    privilegeVersion: Date.now(),
  });
  await db
    .collection('users')
    .doc(input.uid)
    .set({ status: 'ACTIVE', role: input.role, facilityId: input.facilityId, privilegeVersion: Date.now(), updatedAt: new Date().toISOString(), updatedBy: claims.uid }, { merge: true });

  await writeAudit(db, claims, {
    action: 'user.access_approved',
    targetType: 'user',
    targetId: input.uid,
    targetLabel: (target.get('email') as string | undefined) ?? null,
    facilityId: input.facilityId,
    metadata: { role: input.role, reason: input.reason },
  });
  return { ok: true };
}));

const resetBody = z.object({ email: z.string().trim().toLowerCase().email() });

/** Returns the reset link (an administrator passes it on in person or by phone). */
adminRouter.post('/users/password-reset', requireAuth, withBody(resetBody, async (input, req) => {
  const claims = claimsOf(req);
  guardAdmin(claims);
  const { auth, db } = requireAdminSdk();
  const link = await auth.generatePasswordResetLink(input.email);
  await writeAudit(db, claims, {
    action: 'auth.password_reset_requested',
    targetType: 'user',
    targetId: input.email,
    metadata: { via: 'admin-console' },
  });
  return { sent: true, link };
}));

/**
 * First-run administrator.
 *
 * Only an address listed in the *server* environment may self-promote, only once,
 * and only if it does not already hold an administrative role. There is no way for
 * the browser to influence which addresses are eligible.
 */
const bootstrapLimiter = new Map<string, number>();
adminRouter.post('/bootstrap', requireAuth, async (req, res, next) => {
  try {
    const claims = claimsOf(req);
    if (env.bootstrapAdminEmails.length === 0) {
      throw notConfigured('The bootstrap allow-list', ['BOOTSTRAP_ADMIN_EMAILS']);
    }
    const email = claims.email.toLowerCase();
    if (!env.bootstrapAdminEmails.includes(email)) {
      throw forbidden('This email address is not on the deployment’s administrator allow-list.');
    }
    const last = bootstrapLimiter.get(email) ?? 0;
    if (Date.now() - last < 60_000) throw rateLimited('A bootstrap request was just attempted for this address. Wait a minute before trying again.');
    bootstrapLimiter.set(email, Date.now());

    const { auth, db } = requireAdminSdk();
    const profile = await db.collection('users').doc(claims.uid).get();
    if (profile.get('role') === 'ADMIN' && claims.role === 'ADMIN') throw conflict('This account is already an administrator.');

    await auth.setCustomUserClaims(claims.uid, { role: 'ADMIN', facilityId: null, accountStatus: 'ACTIVE', privilegeVersion: Date.now() });
    await db
      .collection('users')
      .doc(claims.uid)
      .set({ role: 'ADMIN', status: 'ACTIVE', privilegeVersion: Date.now(), updatedAt: new Date().toISOString(), updatedBy: claims.uid }, { merge: true });
    await writeAudit(db, claims as ActorClaims, {
      action: 'user.role_changed',
      targetType: 'user',
      targetId: claims.uid,
      targetLabel: email,
      metadata: { from: (profile.get('role') as string | undefined) ?? 'none', to: 'ADMIN', via: 'bootstrap-allowlist' },
    });
    res.json({ ok: true, email });
  } catch (error) {
    next(error);
  }
});

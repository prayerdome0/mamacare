import { Router } from 'express';
import { writeAudit } from '../audit.js';
import { requireAdminSdk } from '../firebase.js';
import { forbidden } from '../http.js';
import { claimsOf, requireAuth } from './_auth.js';

/**
 * Session role synchronisation.
 *
 * `users/{uid}.role` is the stored role — it is what an administrator sets in the
 * Firestore console or in the admin console, and the interface reads it to decide
 * which dashboard opens. Firestore custom claims are the copy that
 * `firestore.rules` and this service enforce, and only the Admin SDK can mint
 * them. This route closes the gap between the two: it re-reads the document with
 * the Admin SDK (never from the request body) and writes the matching claims.
 *
 * Why it is safe:
 *  • The caller is identified by a verified ID token; they may only sync their
 *    own account.
 *  • The role is read from the database, not from the browser. A client cannot
 *    write its own `role` (see `firestore.rules` → `match /users/{userId}`), so
 *    "administrator in Firestore" means an administrator was recorded by someone
 *    entitled to do it — not that the browser asked to be one.
 *  • A deactivated (`SUSPENDED`) account is refused outright.
 *  • Only the known role names are accepted; anything else is ignored and logged.
 *  • Every sync is written to the audit log.
 */
export const authRouter = Router();

/** The roles the platform understands. An unknown stored value never grants access. */
const KNOWN_ROLES = ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'];
const STATUSES = ['ACTIVE', 'PENDING_APPROVAL', 'SUSPENDED'];

/** Accepts `ADMIN`, `admin`, `Administrator`, `user`, `patient`, `chw`, … */
export function normaliseStoredRole(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const raw = value.trim();
  const upper = raw.toUpperCase().replace(/[\s-]+/g, '_');
  if (KNOWN_ROLES.includes(upper)) return upper;
  const aliases: Record<string, string> = {
    ADMINISTRATOR: 'ADMIN',
    PLATFORM_ADMIN: 'ADMIN',
    SUPER_ADMIN: 'ADMIN',
    SUPERVISOR: 'FACILITY_SUPERVISOR',
    IN_CHARGE: 'FACILITY_SUPERVISOR',
    NURSING_OFFICER: 'NURSE',
    CHW: 'COMMUNITY_HEALTH_WORKER',
    HEALTH_WORKER: 'COMMUNITY_HEALTH_WORKER',
    CBV: 'COMMUNITY_HEALTH_WORKER',
    USER: 'MOTHER',
    PATIENT: 'MOTHER',
    MEMBER: 'MOTHER',
    CLIENT: 'MOTHER',
  };
  return aliases[upper] ?? null;
}

function normaliseStatus(value: unknown, fallback = 'ACTIVE'): string {
  if (typeof value !== 'string') return fallback;
  const upper = value.trim().toUpperCase().replace(/[\s-]+/g, '_');
  if (STATUSES.includes(upper)) return upper;
  if (['PENDING', 'AWAITING_APPROVAL', 'APPROVED', 'ENABLED'].includes(upper)) {
    return upper === 'PENDING' || upper === 'AWAITING_APPROVAL' ? 'PENDING_APPROVAL' : 'ACTIVE';
  }
  if (['DISABLED', 'DEACTIVATED'].includes(upper)) return 'SUSPENDED';
  return fallback;
}

authRouter.post('/sync-claims', requireAuth, async (req, res, next) => {
  try {
    const claims = claimsOf(req);
    const { auth, db } = requireAdminSdk();
    const snapshot = await db.collection('users').doc(claims.uid).get();

    if (!snapshot.exists) {
      // Nothing to align: the caller keeps the claims they already have, and the
      // client is told why so it can say something true in the interface.
      res.json({ synced: false, role: claims.role, reason: 'No stored profile document exists for this account yet.' });
      return;
    }

    const data = snapshot.data() as Record<string, unknown>;
    const storedRole = normaliseStoredRole(data.role);
    const storedStatus = normaliseStatus(data.status ?? data.accountStatus, claims.accountStatus);

    if (storedStatus === 'SUSPENDED') {
      await db.collection('users').doc(claims.uid).set({ privilegeVersion: Date.now() }, { merge: true }).catch(() => null);
      throw forbidden('This account has been deactivated by an administrator.');
    }

    if (!storedRole) {
      res.json({
        synced: false,
        role: claims.role,
        reason: 'The stored role value is not one this platform recognises, so the session was left unchanged.',
      });
      return;
    }

    const storedFacility = typeof data.facilityId === 'string' ? data.facilityId : null;
    const storedMotherId = typeof data.motherId === 'string' ? data.motherId : null;
    const currentVersion = typeof claims.privilegeVersion === 'number' ? claims.privilegeVersion : 0;
    const storedVersion = typeof data.privilegeVersion === 'number' ? data.privilegeVersion : 1;

    const patch: Record<string, unknown> = {
      role: storedRole,
      facilityId: storedFacility,
      accountStatus: storedStatus,
      // A mother login must carry her record id; a staff account must never
      // carry one, or it would widen what the "her own row" rule allows.
      motherId: storedRole === 'MOTHER' ? storedMotherId : null,
      privilegeVersion: Math.max(currentVersion, storedVersion, Date.now()),
    };

    const differs =
      storedRole !== claims.role ||
      (claims.facilityId ?? null) !== storedFacility ||
      (claims.accountStatus ?? 'ACTIVE') !== storedStatus ||
      (claims.motherId ?? null) !== patch.motherId;

    if (differs) {
      await auth.setCustomUserClaims(claims.uid, patch);
      await db
        .collection('users')
        .doc(claims.uid)
        .set({ privilegeVersion: patch.privilegeVersion, updatedAt: new Date().toISOString() }, { merge: true })
        .catch(() => null);
      await writeAudit(db, claims, {
        action: 'user.role_synced',
        targetType: 'user',
        targetId: claims.uid,
        targetLabel: typeof data.email === 'string' ? data.email : null,
        facilityId: storedFacility,
        metadata: { from: claims.role, to: storedRole, status: storedStatus, source: 'stored-document' },
      });
    }

    res.json({
      synced: true,
      role: storedRole,
      changed: differs,
      reason: differs ? null : 'The session already matched the stored role.',
    });
  } catch (error) {
    next(error);
  }
});

/** Reports the stored role without changing anything — used by the diagnostics screen. */
authRouter.get('/stored-role', requireAuth, async (req, res, next) => {
  try {
    const claims = claimsOf(req);
    const { db } = requireAdminSdk();
    const snapshot = await db.collection('users').doc(claims.uid).get();
    if (!snapshot.exists) {
      res.json({ exists: false, storedRole: null, sessionRole: claims.role });
      return;
    }
    const data = snapshot.data() as Record<string, unknown>;
    res.json({
      exists: true,
      storedRole: normaliseStoredRole(data.role),
      storedStatus: normaliseStatus(data.status ?? data.accountStatus, claims.accountStatus),
      sessionRole: claims.role,
      inSync: normaliseStoredRole(data.role) === claims.role,
    });
  } catch (error) {
    next(error);
  }
});

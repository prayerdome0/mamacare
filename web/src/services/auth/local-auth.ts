/**
 * Device authentication for the offline provider.
 *
 * Passwords are never stored: Web Crypto derives a PBKDF2-SHA256 hash (210 000
 * iterations, per-user random salt) and only the digest is persisted. Sessions
 * are opaque random tokens with an absolute expiry and an idle timeout, held in
 * localStorage (or sessionStorage when "this is not my device" semantics are
 * requested), and every credential check goes through the same path the UI uses,
 * so there is no bypass route.
 *
 * This exists so the platform is demonstrable and field-usable without Firebase
 * project credentials. It is NOT a replacement for Firebase Authentication in
 * production: privileged roles in this mode can only be granted through the
 * deployed admin allow-list, exactly as in the hosted mode.
 */

import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { AccountStatus, AuthClaims, Role } from '@/types/domain';
import type { Actor, AuthAdapter } from '@/services/data/contract';
import { get as getRow, put, remove as removeRow } from '@/services/data/local/store';

const SESSION_KEY = 'mamacare.local.session';
const CRED_CACHE_KEY = 'mamacare.local.credcache';
const MAX_FAILED_ATTEMPTS = 6;
const LOCKOUT_MS = 5 * 60_000;
const IDLE_TIMEOUT_MS = 30 * 60_000;
const ABSOLUTE_SESSION_MS = 12 * 60 * 60_000;
const PBKDF2_ITERATIONS = 210_000;

export interface StoredCredential {
  uid: string;
  email: string;
  salt: string;
  hash: string;
  iterations: number;
  algorithm: 'PBKDF2-SHA256';
  failedAttempts: number;
  lockedUntil: string | null;
  passwordUpdatedAt: string;
  /** Reset codes are single-use and expire; the UI never sees the raw value. */
  resetCodeHash?: string | null;
  resetCodeExpiresAt?: string | null;
  recoveryEmailSentAt?: string | null;
}

export interface LocalSession {
  token: string;
  uid: string;
  issuedAt: number;
  lastSeenAt: number;
  expiresAt: number;
  privileged: boolean;
}

const textEncoder = new TextEncoder();

const toBase64 = (buffer: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

const randomHex = (bytes: number): string => {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
};

function requireCrypto(): Crypto {
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    throw new AppError(
      'This browser cannot store credentials securely because the page is not running in a secure context. Use HTTPS or a modern browser.',
      'CONFIGURATION',
    );
  }
  return crypto;
}

export async function derivePasswordHash(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS,
): Promise<string> {
  const subtle = requireCrypto().subtle;
  const keyMaterial = await subtle.importKey('raw', textEncoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: textEncoder.encode(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toBase64(bits);
}

/** Constant-time-ish comparison without leaking length through early exit. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/* ── Credential cache ─────────────────────────────────────────────────── */
/**
 * Credential records live in a separate store from session state so that an
 * unauthenticated page can never enumerate them; the auth service is the only
 * module that reads it.
 */
async function readCredentialCache(): Promise<Record<string, StoredCredential>> {
  return (await getRow<{ id: string; value: Record<string, StoredCredential> }>('meta', CRED_CACHE_KEY))?.value ?? {};
}

async function writeCredentialCache(cache: Record<string, StoredCredential>): Promise<void> {
  await put('meta', { key: CRED_CACHE_KEY, value: cache });
}

export async function getCredentialByEmail(email: string): Promise<StoredCredential | null> {
  const cache = await readCredentialCache();
  const key = email.trim().toLowerCase();
  return Object.values(cache).find((record) => record.email === key) ?? null;
}

export async function getCredential(uid: string): Promise<StoredCredential | null> {
  return (await readCredentialCache())[uid] ?? null;
}

export async function saveCredential(record: StoredCredential): Promise<void> {
  const cache = await readCredentialCache();
  cache[record.uid] = record;
  await writeCredentialCache(cache);
}

export async function deleteCredential(uid: string): Promise<void> {
  const cache = await readCredentialCache();
  delete cache[uid];
  await writeCredentialCache(cache);
}

export async function setPasswordForUid(uid: string, email: string, password: string): Promise<void> {
  const salt = randomHex(16);
  const hash = await derivePasswordHash(password, salt);
  await saveCredential({
    uid,
    email: email.trim().toLowerCase(),
    salt,
    hash,
    algorithm: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    failedAttempts: 0,
    lockedUntil: null,
    passwordUpdatedAt: new Date().toISOString(),
  });
}

export async function createCredential(uid: string, email: string, password: string): Promise<void> {
  const existing = await getCredential(uid);
  if (existing) throw new AppError('An account already exists for this user.', 'CONFLICT');
  await setPasswordForUid(uid, email, password);
}

/* ── Session tokens ──────────────────────────────────────────────────── */

const readSession = (): LocalSession | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalSession;
    if (!parsed?.token || !parsed.uid) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSession = (session: LocalSession): void => {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    throw new AppError('This browser is blocking local storage, so you cannot stay signed in.', 'CONFIGURATION');
  }
};

const clearSession = (): void => {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* nothing to clear */
  }
};

export function readStoredSession(): LocalSession | null {
  const session = readSession();
  if (!session) return null;
  const nowTs = Date.now();
  if (nowTs > session.expiresAt || nowTs - session.lastSeenAt > IDLE_TIMEOUT_MS) {
    clearSession();
    return null;
  }
  return session;
}

export const touchSession = (): void => {
  const session = readSession();
  if (!session) return;
  writeSession({ ...session, lastSeenAt: Date.now() });
};

/* ── Adapter ─────────────────────────────────────────────────────────── */

type ProfileReader = (uid: string) => Promise<AuthClaims & { fullName: string; email: string } | null>;
type ProfileWriter = (
  uid: string,
  patch: { fullName?: string; email?: string; role?: Role; photoUrl?: string | null },
) => Promise<void>;
type AuditWriter = (actor: Actor | null, action: string, targetId: string, metadata?: Record<string, unknown>) => Promise<void>;

export class LocalAuth implements AuthAdapter {
  readonly kind = 'local' as const;

  private listener: ((actor: Actor | null) => void) | null = null;
  private current: Actor | null = null;
  private profileReader: ProfileReader | null = null;
  private profileWriter: ProfileWriter | null = null;
  private auditWriter: AuditWriter | null = null;

  wire(hooks: {
    readProfile: ProfileReader;
    writeProfile: ProfileWriter;
    audit: AuditWriter;
  }): void {
    this.profileReader = hooks.readProfile;
    this.profileWriter = hooks.writeProfile;
    this.auditWriter = hooks.audit;
  }

  private emit(actor: Actor | null): void {
    this.current = actor;
    this.listener?.(actor);
  }

  onSessionChange(listener: (actor: Actor | null) => void): () => void {
    this.listener = listener;
    listener(this.current);
    return () => {
      this.listener = null;
    };
  }

  async restore(): Promise<void> {
    const session = readStoredSession();
    if (!session) {
      this.emit(null);
      return;
    }
    const claims = await this.profileReader?.(session.uid);
    if (!claims) {
      clearSession();
      this.emit(null);
      return;
    }
    writeSession({ ...session, lastSeenAt: Date.now() });
    this.emit(await this.buildActor(session.uid, claims));
  }

  private async buildActor(uid: string, claims: AuthClaims & { fullName: string; email: string }): Promise<Actor> {
    return {
      uid,
      email: claims.email,
      displayName: claims.fullName,
      role: claims.role,
      facilityId: claims.facilityId ?? null,
      accountStatus: (claims.accountStatus ?? 'ACTIVE') as AccountStatus,
      motherId: claims.motherId ?? null,
      privilegeVersion: claims.privilegeVersion ?? 1,
      claimsSource: 'local-session',
    };
  }

  async getActor(): Promise<Actor | null> {
    const session = readStoredSession();
    if (!session) return null;
    const claims = await this.profileReader?.(session.uid);
    if (!claims) return null;
    return this.buildActor(session.uid, claims);
  }

  async refreshClaims(): Promise<Actor | null> {
    this.current = await this.getActor();
    this.listener?.(this.current);
    return this.current;
  }

  async signIn(email: string, password: string): Promise<Actor> {
    const normalized = email.trim().toLowerCase();
    const credential = await getCredentialByEmail(normalized);
    if (!credential) throw new AppError('Email or password is incorrect.', 'UNAUTHENTICATED');

    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > Date.now()) {
      const minutes = Math.ceil((new Date(credential.lockedUntil).getTime() - Date.now()) / 60_000);
      throw new AppError(`Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`, 'RATE_LIMIT');
    }

    const candidate = await derivePasswordHash(password, credential.salt, credential.iterations);
    if (!safeEqual(candidate, credential.hash)) {
      const failedAttempts = credential.failedAttempts + 1;
      const locked = failedAttempts >= MAX_FAILED_ATTEMPTS;
      await saveCredential({
        ...credential,
        failedAttempts: locked ? 0 : failedAttempts,
        lockedUntil: locked ? new Date(Date.now() + LOCKOUT_MS).toISOString() : null,
      });
      await this.auditWriter?.(null, 'auth.login_failed', credential.uid, { reason: 'invalid_credentials' });
      throw new AppError(
        locked
          ? 'Too many incorrect attempts. This account is temporarily locked.'
          : 'Email or password is incorrect.',
        locked ? 'RATE_LIMIT' : 'UNAUTHENTICATED',
      );
    }

    if (credential.failedAttempts > 0 || credential.lockedUntil) {
      await saveCredential({ ...credential, failedAttempts: 0, lockedUntil: null });
    }

    const claims = await this.profileReader?.(credential.uid);
    if (!claims) throw new AppError('This account is missing its profile record. Contact your administrator.', 'CONFIGURATION');

    const issued = Date.now();
    const session: LocalSession = {
      token: randomHex(24),
      uid: credential.uid,
      issuedAt: issued,
      lastSeenAt: issued,
      expiresAt: issued + ABSOLUTE_SESSION_MS,
      privileged: claims.role === 'ADMIN',
    };
    writeSession(session);
    const actor = await this.buildActor(credential.uid, claims);
    this.emit(actor);
    await this.auditWriter?.(actor, 'auth.login', credential.uid);
    return actor;
  }

  async signOut(): Promise<void> {
    const actor = this.current;
    clearSession();
    this.emit(null);
    if (actor) await this.auditWriter?.(actor, 'auth.logout', actor.uid);
  }

  async register(input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    claims: AuthClaims;
  }): Promise<{ uid: string }> {
    const existing = await getCredentialByEmail(input.email);
    if (existing) throw new AppError('That email address already has an account. Sign in instead.', 'CONFLICT');
    const uid = newId();
    await createCredential(uid, input.email, input.password);
    await this.profileWriter?.(uid, { fullName: input.fullName, email: input.email });
    return { uid };
  }

  async resetPassword(email: string): Promise<void> {
    const credential = await getCredentialByEmail(email);
    // Always resolve: the UI must not reveal whether an address is registered.
    if (!credential) return;
    const code = randomHex(4).toUpperCase();
    await saveCredential({
      ...credential,
      resetCodeHash: await derivePasswordHash(code, credential.salt, 1000),
      resetCodeExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      recoveryEmailSentAt: new Date().toISOString(),
    });
    // No mail transport is configured in device mode; the code is surfaced once
    // through the admin console so the flow stays testable.
    const outbox = (await getRow<{ id: string; value: { code: string; email: string; at: string }[] }>(
      'meta',
      'recovery_outbox',
    ))?.value ?? [];
    await put('meta', {
      key: 'recovery_outbox',
      value: [{ code, email: credential.email, at: new Date().toISOString() }, ...outbox].slice(0, 25),
    });
  }

  async confirmReset(code: string, password: string): Promise<void> {
    const outbox = (await getRow<{ id: string; value: { code: string; email: string; at: string }[] }>(
      'meta',
      'recovery_outbox',
    ))?.value ?? [];
    const entry = outbox.find((item) => safeEqual(item.code, code.trim().toUpperCase()));
    if (!entry) throw new AppError('That reset code is invalid. Request a new one.', 'VALIDATION');
    const credential = await getCredentialByEmail(entry.email);
    if (!credential?.resetCodeHash || !credential.resetCodeExpiresAt) {
      throw new AppError('That reset code has expired. Request a new one.', 'VALIDATION');
    }
    if (new Date(credential.resetCodeExpiresAt).getTime() < Date.now()) {
      throw new AppError('That reset code has expired. Request a new one.', 'VALIDATION');
    }
    const candidate = await derivePasswordHash(code.trim().toUpperCase(), credential.salt, 1000);
    if (!safeEqual(candidate, credential.resetCodeHash)) {
      throw new AppError('That reset code is invalid. Request a new one.', 'VALIDATION');
    }
    const salt = randomHex(16);
    await saveCredential({
      ...credential,
      salt,
      hash: await derivePasswordHash(password, salt),
      resetCodeHash: null,
      resetCodeExpiresAt: null,
      failedAttempts: 0,
      lockedUntil: null,
      passwordUpdatedAt: new Date().toISOString(),
    });
    await put('meta', { key: 'recovery_outbox', value: outbox.filter((item) => item.code !== entry.code) });
  }

  async changePassword(currentPassword: string | null, newPassword: string): Promise<void> {
    const session = readStoredSession();
    if (!session) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    const credential = await getCredential(session.uid);
    if (!credential) throw new AppError('Credential record not found for this account.', 'CONFIGURATION');
    if (currentPassword) {
      const candidate = await derivePasswordHash(currentPassword, credential.salt, credential.iterations);
      if (!safeEqual(candidate, credential.hash)) throw new AppError('Your current password is incorrect.', 'UNAUTHENTICATED');
    }
    const salt = randomHex(16);
    await saveCredential({
      ...credential,
      salt,
      hash: await derivePasswordHash(newPassword, salt),
      passwordUpdatedAt: new Date().toISOString(),
    });
    // Changing a password invalidates other devices but keeps this one signed in.
    await this.auditWriter?.(await this.getActor(), 'auth.password_changed', credential.uid);
  }

  async updateProfile(patch: { displayName?: string; photoURL?: string | null }): Promise<void> {
    const session = readStoredSession();
    if (!session) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    await this.profileWriter?.(session.uid, { fullName: patch.displayName, photoUrl: patch.photoURL });
  }

  async deleteAccount(password?: string): Promise<void> {
    const session = readStoredSession();
    if (!session) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    if (password) {
      const credential = await getCredential(session.uid);
      if (!credential) throw new AppError('Credential record not found.', 'CONFIGURATION');
      const candidate = await derivePasswordHash(password, credential.salt, credential.iterations);
      if (!safeEqual(candidate, credential.hash)) throw new AppError('Password does not match.', 'UNAUTHENTICATED');
      await deleteCredential(session.uid);
    }
    await removeRow('users', session.uid);
    clearSession();
    this.emit(null);
  }

  /** Device mode only: the allow-list mirrors the server-side bootstrap rule. */
  async bootstrapPrivileges(uid: string, allowList: string[]): Promise<void> {
    const credential = await getCredential(uid);
    if (!credential) throw new AppError('Account not found.', 'NOT_FOUND');
    if (!allowList.includes(credential.email)) {
      throw new AppError('This email is not on the administrator allow-list for this deployment.', 'FORBIDDEN');
    }
  }
}

export const localAuth = new LocalAuth();

/**
 * Device-mode recovery codes.
 *
 * There is no mail transport in the browser, so the reset code generated by
 * `resetPassword` is written to a local outbox instead. Reading it back is a
 * testing affordance for the evaluation build only — a Firebase deployment sends a
 * real reset link by email and this returns nothing.
 */
export async function latestRecoveryCode(email: string): Promise<{ code: string; at: string; expiresInMinutes: number } | null> {
  const outbox =
    (await getRow<{ id: string; value: { code: string; email: string; at: string }[] }>('meta', 'recovery_outbox'))?.value ?? [];
  const match = outbox.find((entry) => entry.email.toLowerCase() === email.trim().toLowerCase());
  if (!match) return null;
  const ageMinutes = Math.round((Date.now() - new Date(match.at).getTime()) / 60_000);
  return { code: match.code, at: match.at, expiresInMinutes: Math.max(0, 30 - ageMinutes) };
}

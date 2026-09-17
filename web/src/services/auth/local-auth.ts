/**
 * Device authentication.
 *
 * Used when a deployment has no Firebase credentials, and as the offline
 * fallback. Accounts live in this browser's IndexedDB with PBKDF2-hashed
 * passwords (never plain text, never in `localStorage`), and the session is a
 * short-lived record in `localStorage` — or `sessionStorage` when the user does
 * not tick "keep me signed in", which matters on a shared family phone.
 *
 * This is a real authentication path with the same contract as Firebase Auth, so
 * every screen behaves identically. It is *not* a substitute for it: a device
 * account exists on one browser only, and a password cannot be recovered by
 * email because there is no mail service.
 */

import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { safeLocal, safeSession } from '@/lib/storage';
import { passwordPolicy } from '@/lib/validation';
import { getMeta, setMeta } from '@/services/data/local/store';
import { defaultProfile, toActor } from '@/services/auth/profile-lookup';
import type { Actor, AuthAdapter, ProfileDraft } from '@/services/data/contract';
import type { UserProfile } from '@/types/domain';

const ACCOUNTS_KEY = 'accounts';
const SESSION_KEY = 'session';
const ITERATIONS = 150_000;

interface LocalAccount {
  uid: string;
  email: string;
  passwordHash: string;
  salt: string;
  iterations: number;
  createdAt: string;
}

interface StoredSession {
  uid: string;
  remember: boolean;
  issuedAt: string;
}

export interface LocalAuthHooks {
  readProfile(uid: string): Promise<UserProfile | null>;
  createProfile(profile: UserProfile): Promise<UserProfile>;
  updateProfile(uid: string, patch: Partial<UserProfile>): Promise<void>;
}

const encoder = new TextEncoder();

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

async function derive(password: string, salt: string, iterations = ITERATIONS): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: encoder.encode(salt), iterations, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return toHex(bits);
}

const randomSalt = (): string => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
};

const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export class LocalAuth implements AuthAdapter {
  readonly kind = 'local' as const;

  private hooks: LocalAuthHooks | null = null;
  private listeners = new Set<(actor: Actor | null) => void>();
  private current: Actor | null = null;
  private restored = false;

  wire(hooks: LocalAuthHooks): void {
    this.hooks = hooks;
  }

  private requireHooks(): LocalAuthHooks {
    if (!this.hooks) throw new AppError('Device authentication is not ready yet. Please try again.', 'CONFIGURATION');
    return this.hooks;
  }

  private get store() {
    return safeLocal.persistent ? safeLocal : safeSession;
  }

  private readSession(): StoredSession | null {
    return this.store.getJson<StoredSession | null>(SESSION_KEY, null);
  }

  private writeSession(uid: string, remember: boolean): void {
    const payload: StoredSession = { uid, remember, issuedAt: new Date().toISOString() };
    if (remember) {
      safeLocal.setJson(SESSION_KEY, payload);
      safeSession.remove(SESSION_KEY);
    } else {
      safeSession.setJson(SESSION_KEY, payload);
      safeLocal.remove(SESSION_KEY);
    }
  }

  private clearSession(): void {
    safeLocal.remove(SESSION_KEY);
    safeSession.remove(SESSION_KEY);
  }

  private emit(actor: Actor | null): void {
    this.current = actor;
    for (const listener of this.listeners) {
      try {
        listener(actor);
      } catch {
        /* one broken subscriber must not stop the others */
      }
    }
  }

  async restore(): Promise<void> {
    if (this.restored) return;
    this.restored = true;
    const session = this.readSession();
    if (!session) {
      this.emit(null);
      return;
    }
    const profile = await this.requireHooks().readProfile(session.uid);
    if (!profile) {
      this.clearSession();
      this.emit(null);
      return;
    }
    this.emit(toActor(profile));
  }

  async getActor(): Promise<Actor | null> {
    if (!this.restored) await this.restore();
    return this.current;
  }

  onSessionChange(listener: (actor: Actor | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  private async accounts(): Promise<LocalAccount[]> {
    return (await getMeta<LocalAccount[]>(ACCOUNTS_KEY)) ?? [];
  }

  private async saveAccounts(accounts: LocalAccount[]): Promise<void> {
    await setMeta(ACCOUNTS_KEY, accounts);
  }

  private async findByEmail(email: string): Promise<LocalAccount | null> {
    const target = normalizeEmail(email);
    return (await this.accounts()).find((account) => account.email === target) ?? null;
  }

  /** Creates the device account. Called by the registration flow. */
  async createAccount(input: { email: string; password: string; profile: ProfileDraft }): Promise<UserProfile> {
    const email = normalizeEmail(input.email);
    if (await this.findByEmail(email)) {
      throw new AppError('An account with that email already exists on this device.', 'CONFLICT');
    }
    if (!passwordPolicy.pattern.test(input.password) || input.password.length < passwordPolicy.minLength) {
      throw new AppError(passwordPolicy.message, 'VALIDATION');
    }
    const uid = newId('u');
    const salt = randomSalt();
    const passwordHash = await derive(input.password, salt);
    const accounts = await this.accounts();
    accounts.push({ uid, email, passwordHash, salt, iterations: ITERATIONS, createdAt: new Date().toISOString() });
    await this.saveAccounts(accounts);
    const nowIso = new Date().toISOString();
    const profile = {
      ...defaultProfile({ uid, fullName: input.profile.fullName, email }),
      ...input.profile,
      id: uid,
      uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    } as UserProfile;
    return this.requireHooks().createProfile(profile);
  }

  async signIn(email: string, password: string, remember = true): Promise<Actor> {
    const account = await this.findByEmail(email);
    if (!account) throw new AppError('No account with that email exists on this device.', 'NOT_FOUND');
    const hash = await derive(password, account.salt, account.iterations || ITERATIONS);
    if (hash !== account.passwordHash) throw new AppError('That password is not correct.', 'FORBIDDEN');

    const hooks = this.requireHooks();
    let profile = await hooks.readProfile(account.uid);
    if (!profile) {
      profile = await hooks.createProfile(defaultProfile({ uid: account.uid, fullName: 'Mama Care user', email: account.email }));
    }
    await hooks.updateProfile(account.uid, { lastLoginAt: new Date().toISOString() });
    this.writeSession(account.uid, remember);
    const actor = toActor({ ...profile, lastLoginAt: new Date().toISOString() });
    this.emit(actor);
    return actor;
  }

  async signOut(): Promise<void> {
    this.clearSession();
    this.emit(null);
  }

  async refreshClaims(): Promise<Actor | null> {
    const session = this.readSession();
    if (!session) {
      this.emit(null);
      return null;
    }
    const profile = await this.requireHooks().readProfile(session.uid);
    const actor = profile ? toActor(profile) : null;
    this.emit(actor);
    return actor;
  }

  /** Device mode has no mail service: say so instead of pretending to send. */
  async sendPasswordReset(email: string): Promise<void> {
    const account = await this.findByEmail(email);
    if (!account) throw new AppError('No account with that email exists on this device.', 'NOT_FOUND');
    throw new AppError(
      'This install keeps accounts on this device only, so there is no email to send. Use "Reset the password on this device" — it works because the account never leaves this browser.',
      'CONFIGURATION',
    );
  }

  /** Device-only password reset: the account exists solely in this browser. */
  async resetPasswordOnDevice(email: string, newPassword: string): Promise<void> {
    if (!passwordPolicy.pattern.test(newPassword) || newPassword.length < passwordPolicy.minLength) {
      throw new AppError(passwordPolicy.message, 'VALIDATION');
    }
    const accounts = await this.accounts();
    const target = normalizeEmail(email);
    const existing = accounts.find((account) => account.email === target);
    if (!existing) throw new AppError('No account with that email exists on this device.', 'NOT_FOUND');
    const salt = randomSalt();
    const passwordHash = await derive(newPassword, salt);
    await this.saveAccounts(
      accounts.map((account) =>
        account.uid === existing.uid ? { ...account, salt, passwordHash, iterations: ITERATIONS } : account,
      ),
    );
  }

  async changePassword(current: string, next: string): Promise<void> {
    if (!passwordPolicy.pattern.test(next) || next.length < passwordPolicy.minLength) {
      throw new AppError(passwordPolicy.message, 'VALIDATION');
    }
    const actor = await this.getActor();
    if (!actor) throw new AppError('Please sign in again.', 'SESSION_EXPIRED');
    const account = await this.findByEmail(actor.email);
    if (!account) throw new AppError('This account could not be found on this device.', 'NOT_FOUND');
    const hash = await derive(current, account.salt, account.iterations || ITERATIONS);
    if (hash !== account.passwordHash) throw new AppError('Your current password is not correct.', 'FORBIDDEN');
    const salt = randomSalt();
    const passwordHash = await derive(next, salt);
    const accounts = await this.accounts();
    await this.saveAccounts(
      accounts.map((entry) => (entry.uid === account.uid ? { ...entry, salt, passwordHash, iterations: ITERATIONS } : entry)),
    );
  }

  async deleteAccount(password?: string): Promise<void> {
    const actor = await this.getActor();
    if (!actor) throw new AppError('Please sign in again.', 'SESSION_EXPIRED');
    if (password) {
      const account = await this.findByEmail(actor.email);
      if (!account) throw new AppError('This account could not be found on this device.', 'NOT_FOUND');
      const hash = await derive(password, account.salt, account.iterations || ITERATIONS);
      if (hash !== account.passwordHash) throw new AppError('That password is not correct.', 'FORBIDDEN');
    }
    const accounts = (await this.accounts()).filter((entry) => entry.uid !== actor.uid);
    await this.saveAccounts(accounts);
    await this.requireHooks().updateProfile(actor.uid, { status: 'CLOSED' });
    this.clearSession();
    this.emit(null);
  }

  /**
   * Seed-only: writes a credential record for a demonstration account without
   * going through the registration flow (which needs a live session store).
   */
  async seedAccount(input: { uid: string; email: string; password: string }): Promise<void> {
    const email = normalizeEmail(input.email);
    const accounts = await this.accounts();
    if (accounts.some((account) => account.email === email)) return;
    const salt = randomSalt();
    accounts.push({
      uid: input.uid,
      email,
      passwordHash: await derive(input.password, salt),
      salt,
      iterations: ITERATIONS,
      createdAt: new Date().toISOString(),
    });
    await this.saveAccounts(accounts);
  }

  /** Used by the first-install bootstrap and the device admin list. */
  async listAccounts(): Promise<{ uid: string; email: string; createdAt: string }[]> {
    return (await this.accounts()).map((account) => ({ uid: account.uid, email: account.email, createdAt: account.createdAt }));
  }

  /** Device-mode bootstrap: promote an existing account to ADMIN once. */
  async promoteToAdmin(uid: string): Promise<void> {
    await this.requireHooks().updateProfile(uid, { role: 'ADMIN', status: 'ACTIVE', privilegeVersion: Date.now() });
  }
}

export const localAuth = new LocalAuth();

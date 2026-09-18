/**
 * Firebase Authentication adapter.
 *
 * Email + password is the identity provider. The role a user has comes from
 * custom claims on the ID token when they exist (`role`, `facilityId`,
 * `providerId`, `privilegeVersion`) and from `users/{uid}` otherwise — the token
 * claims are what `firestore.rules` can check, so the session records which
 * source won and the interface can explain a mismatch instead of showing an
 * empty dashboard.
 *
 * Errors are translated into sentences a mother can act on. A wrong password and
 * a locked-out account must never produce the same message as a network failure.
 */

import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  deleteUser as fbDeleteUser,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updatePassword as fbUpdatePassword,
  updateProfile as fbUpdateProfile,
  type User,
} from 'firebase/auth';
import { getFirebaseAuth } from '@/services/firebase/app';
import { AppError, logProviderError } from '@/lib/errors';
import { passwordPolicy } from '@/lib/validation';
import { safeLocal } from '@/lib/storage';
import { claimsFromToken, toActor, type Claims } from '@/services/auth/profile-lookup';
import type { Actor, AuthAdapter, ProfileDraft } from '@/services/data/contract';
import type { UserProfile } from '@/types/domain';

export interface FirebaseAuthHooks {
  /** Reads `users/{uid}`; falls back to an email lookup for pre-profile accounts. */
  readProfile(uid: string, email?: string): Promise<UserProfile | null>;
  createProfile(profile: UserProfile): Promise<UserProfile>;
  updateProfile(uid: string, patch: Partial<UserProfile>): Promise<void>;
}

const PROFILE_CACHE_KEY = 'profileCache';
const PROFILE_CACHE_TTL_MS = 5 * 60_000;

interface CachedProfile {
  at: number;
  profile: UserProfile;
}

function readCachedProfile(uid: string): UserProfile | null {
  const cache = safeLocal.getJson<Record<string, CachedProfile>>(PROFILE_CACHE_KEY, {});
  const entry = cache[uid];
  if (!entry || Date.now() - entry.at > PROFILE_CACHE_TTL_MS) return null;
  return entry.profile;
}

function writeCachedProfile(profile: UserProfile): void {
  const cache = safeLocal.getJson<Record<string, CachedProfile>>(PROFILE_CACHE_KEY, {});
  cache[profile.uid || profile.id] = { at: Date.now(), profile };
  // Keep the cache small: profiles only, most recent twenty.
  const keys = Object.keys(cache);
  if (keys.length > 20) for (const key of keys.slice(0, keys.length - 20)) delete cache[key];
  safeLocal.setJson(PROFILE_CACHE_KEY, cache);
}

export class FirebaseAuth implements AuthAdapter {
  readonly kind = 'firebase' as const;

  private hooks: FirebaseAuthHooks | null = null;
  private listeners = new Set<(actor: Actor | null) => void>();
  private current: Actor | null = null;
  private unsubscribe: (() => void) | null = null;
  private claims: Claims | null = null;
  private started = false;

  wire(hooks: FirebaseAuthHooks): void {
    this.hooks = hooks;
  }

  private requireHooks(): FirebaseAuthHooks {
    if (!this.hooks) throw new AppError('Authentication is still starting. Please try again.', 'CONFIGURATION');
    return this.hooks;
  }

  private emit(actor: Actor | null): void {
    this.current = actor;
    for (const listener of this.listeners) {
      try {
        listener(actor);
      } catch (error) {
        logProviderError('auth listener', error);
      }
    }
  }

  /** Resolves the actor for a Firebase user: claims first, then the profile. */
  private async resolve(user: User | null): Promise<Actor | null> {
    if (!user) {
      this.claims = null;
      return null;
    }
    let claims: Claims | null = null;
    try {
      const token = await user.getIdTokenResult();
      claims = claimsFromToken(token.claims as Record<string, unknown>);
    } catch (error) {
      logProviderError('id token claims', error);
    }
    this.claims = claims;

    const hooks = this.requireHooks();
    let profile: UserProfile | null = null;
    try {
      profile = await hooks.readProfile(user.uid, user.email ?? undefined);
      if (profile) writeCachedProfile(profile);
    } catch (error) {
      logProviderError('profile lookup', error);
      profile = readCachedProfile(user.uid);
    }

    if (!profile) {
      // An authenticated Firebase user with no profile document (created from the
      // console, or a first sign-in that failed before the write). Build one from
      // the token so the app has something to show, marked as unapproved.
      profile = {
        id: user.uid,
        uid: user.uid,
        fullName: user.displayName ?? user.email?.split('@')[0] ?? 'Mama Care user',
        email: user.email ?? '',
        phone: user.phoneNumber ?? null,
        dateOfBirth: null,
        country: 'ZM',
        language: 'en',
        role: claims?.role ?? 'MOTHER',
        status: 'PENDING_APPROVAL',
        photoUrl: user.photoURL ?? null,
        photoPublicId: null,
        emergencyContact: null,
        notificationPrefs: {
          appointments: true,
          reminders: true,
          education: true,
          milestones: true,
          baby: true,
          quietFrom: '21:00',
          quietTo: '06:00',
        },
        providerId: claims?.providerId ?? null,
        facilityId: claims?.facilityId ?? null,
        supportsUserId: null,
        consentAt: null,
        lastLoginAt: new Date().toISOString(),
        privilegeVersion: claims?.privilegeVersion ?? 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      try {
        await hooks.createProfile(profile);
      } catch (error) {
        logProviderError('profile provisioning', error);
      }
    }

    return toActor(profile, claims);
  }

  async restore(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const auth = getFirebaseAuth();
    this.unsubscribe = onIdTokenChanged(auth, (user) => {
      void this.resolve(user).then(
        (actor) => this.emit(actor),
        (error) => {
          logProviderError('session resolve', error);
          this.emit(null);
        },
      );
    });
  }

  async getActor(): Promise<Actor | null> {
    if (!this.started) await this.restore();
    return this.current;
  }

  onSessionChange(listener: (actor: Actor | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => this.listeners.delete(listener);
  }

  /** Creates the Firebase Auth account, then the profile document. */
  async createAccount(input: {
    email: string;
    password: string;
    profile: ProfileDraft;
  }): Promise<{ user: User; profile: UserProfile }> {
    try {
      const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), input.email.trim(), input.password);
      const nowIso = new Date().toISOString();
      const profile = {
        ...input.profile,
        id: credential.user.uid,
        uid: credential.user.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      } as UserProfile;
      await this.requireHooks().createProfile(profile);
      await fbUpdateProfile(credential.user, { displayName: input.profile.fullName }).catch(() => undefined);
      this.emit(toActor(profile, this.claims));
      return { user: credential.user, profile };
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signIn(email: string, password: string, remember = true): Promise<Actor> {
    if (!remember) {
      // Session persistence is applied by the caller before signing in.
      const { browserSessionPersistence, setPersistence } = await import('firebase/auth');
      await setPersistence(getFirebaseAuth(), browserSessionPersistence).catch(() => undefined);
    }
    try {
      const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      const actor = await this.resolve(credential.user);
      if (!actor) throw new AppError('Your account could not be loaded. Please try again.', 'UNKNOWN', { retryable: true });
      await this.requireHooks()
        .updateProfile(actor.uid, { lastLoginAt: new Date().toISOString() })
        .catch(() => undefined);
      this.emit(actor);
      return actor;
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async signOut(): Promise<void> {
    try {
      await fbSignOut(getFirebaseAuth());
    } catch (error) {
      throw mapAuthError(error);
    }
    this.emit(null);
  }

  async refreshClaims(): Promise<Actor | null> {
    const user = getFirebaseAuth().currentUser;
    if (!user) {
      this.emit(null);
      return null;
    }
    try {
      await user.getIdToken(true);
    } catch (error) {
      logProviderError('token refresh', error);
    }
    const actor = await this.resolve(user);
    this.emit(actor);
    return actor;
  }

  async sendPasswordReset(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async changePassword(current: string, next: string): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (!user?.email) throw new AppError('Please sign in again.', 'SESSION_EXPIRED');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
      await fbUpdatePassword(user, next);
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  async deleteAccount(password?: string): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (!user?.email) throw new AppError('Please sign in again.', 'SESSION_EXPIRED');
    try {
      if (password) {
        await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      }
      await fbDeleteUser(user);
      this.emit(null);
    } catch (error) {
      throw mapAuthError(error);
    }
  }

  get currentClaims(): Claims | null {
    return this.claims;
  }

  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
  }
}

/** Firebase error codes → sentences the user can act on. */
export function mapAuthError(error: unknown): AppError {
  const code = String((error as { code?: string })?.code ?? '');
  switch (code) {
    case 'auth/invalid-email':
      return new AppError('That email address does not look right. Check it and try again.', 'VALIDATION');
    case 'auth/user-disabled':
      return new AppError('This account has been disabled. Contact support@mamacare.health.', 'FORBIDDEN');
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return new AppError('That email and password combination was not recognised.', 'FORBIDDEN');
    case 'auth/email-already-in-use':
      return new AppError('An account already exists with that email. Try signing in instead.', 'CONFLICT');
    case 'auth/weak-password':
      return new AppError(passwordPolicy.message, 'VALIDATION');
    case 'auth/too-many-requests':
      return new AppError('Too many attempts. Wait a few minutes, or reset your password.', 'RATE_LIMIT');
    case 'auth/requires-recent-login':
      return new AppError('For your security, sign out and sign in again before making that change.', 'SESSION_EXPIRED');
    case 'auth/operation-not-allowed':
      return new AppError(
        'Email sign-in is not enabled on this Firebase project. Turn it on under Authentication → Sign-in method.',
        'CONFIGURATION',
      );
    case 'auth/network-request-failed':
      return new AppError('Could not reach Firebase. Check your connection and try again.', 'NETWORK', { retryable: true });
    case 'auth/popup-blocked':
    case 'auth/cancelled-popup-request':
      return new AppError('Your browser blocked the sign-in window. Allow pop-ups for this site and try again.', 'CONFIGURATION');
    case 'auth/unauthorized-domain':
      return new AppError(
        'This site is not listed as an authorised domain for the Firebase project. Add it under Authentication → Settings → Authorised domains.',
        'CONFIGURATION',
      );
    case 'auth/missing-password':
      return new AppError('Please enter your password.', 'VALIDATION');
    case 'auth/missing-email':
      return new AppError('Please enter your email address.', 'VALIDATION');
    case 'auth/expired-action-code':
      return new AppError('The password reset link has expired. Please request a new reset link.', 'VALIDATION');
    case 'auth/invalid-action-code':
      return new AppError('The password reset link is invalid or has already been used.', 'VALIDATION');
    case 'auth/quota-exceeded':
      return new AppError('Authentication service is temporarily busy. Please wait a moment and try again.', 'RATE_LIMIT');
    case 'auth/internal-error':
      return new AppError('A secure connection could not be established. Please check your internet connection and try again.', 'NETWORK', { retryable: true });
    case 'auth/account-exists-with-different-credential':
      return new AppError('An account already exists with that email address. Try signing in instead.', 'CONFLICT');
    default: {
      const msg = (error as Error)?.message || '';
      if (!msg || msg.includes('Firebase:') || msg.includes('auth/')) {
        return new AppError('Authentication service could not complete your request. Please check your details and try again.', 'UNKNOWN', { retryable: true });
      }
      return new AppError(msg, 'UNKNOWN', { retryable: true });
    }
  }
}

export const firebaseAuth = new FirebaseAuth();

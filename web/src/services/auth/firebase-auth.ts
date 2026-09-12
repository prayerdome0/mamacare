/**
 * Firebase Authentication adapter.
 *
 * Uses the public Web SDK only. Custom claims (role, facility, approval status)
 * are minted server-side by the API service — the client can read them from the
 * ID token but can never write them.
 */

import {
  EmailAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  onIdTokenChanged,
  reauthenticateWithCredential,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  updatePassword,
  updateProfile,
  type Auth,
  type User,
} from 'firebase/auth';
import { AppError, logProviderError, toAppError } from '@/lib/errors';
import { safeSession } from '@/lib/storage';
import type { AuthClaims } from '@/types/domain';
import type { Actor, AuthAdapter } from '@/services/data/contract';
import { getFirebaseAuth } from '@/services/firebase/app';
import { syncClaimsFromDocument } from '@/services/auth/claims-sync';
import { normaliseRole, normaliseStatus, resolveRole } from '@/services/auth/role-resolution';
import type { StoredProfile } from '@/services/auth/profile-lookup';

/**
 * Reads `users/{uid}` (the stored role/status). Optional: the adapter works from
 * the ID token claims alone when no reader is wired.
 */
type ProfileReader = (uid: string, email: string) => Promise<StoredProfile>;

const IDLE_LOGOUT_MS = 30 * 60_000;
const ACTOR_REFRESH_MS = 5 * 60_000;

export class FirebaseAuthAdapter implements AuthAdapter {
  readonly kind = 'firebase' as const;
  private authInstance: Auth | null = null;
  private actor: Actor | null = null;
  private listeners = new Set<(actor: Actor | null) => void>();
  private unsub: (() => void) | null = null;
  private profileReader: ProfileReader | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  /**
   * Firebase Auth is acquired on first use, never at module load.
   *
   * This module is imported by the service registry that every route depends on.
   * Creating the Auth instance eagerly meant that a build without Firebase
   * environment variables — a device-mode build, or a static host whose variables
   * were not configured — threw while the bundle was still evaluating, before any
   * error boundary could render. The visible result was a blank page / host-level
   * error on every URL, including sign-in and registration.
   */
  private get auth(): Auth {
    if (!this.authInstance) this.authInstance = getFirebaseAuth();
    return this.authInstance;
  }

  wire(reader: ProfileReader): void {
    this.profileReader = reader;
  }

  onSessionChange(listener: (actor: Actor | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.actor);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(actor: Actor | null): void {
    this.actor = actor;
    for (const listener of this.listeners) listener(actor);
  }

  async restore(): Promise<void> {
    await getRedirectResult(this.auth).catch(() => null);
    this.unsub?.();
    this.unsub = onIdTokenChanged(this.auth, (user) => {
      if (!user) {
        this.emit(null);
        return;
      }
      void this.syncActor(user).catch(() => this.emit(null));
      this.armIdleTimer();
    });
    const user = this.auth.currentUser;
    if (user) {
      await this.syncActor(user);
      this.armIdleTimer();
    } else {
      this.emit(null);
    }
  }

  /**
   * Builds the session actor.
   *
   * The role comes from `users/{uid}` (Firestore is the source of truth, per the
   * platform's role model) and falls back to the ID token claims, which the API
   * service mints from that same document. When the two disagree — for example
   * an account made an administrator in the Firebase console — the client asks
   * the API service to re-mint the claims and then reloads the token, so the
   * security rules and the interface agree again. Until that succeeds the actor
   * is marked as unsynced, and screens that need privileged reads explain it
   * instead of failing with a raw permission error.
   */
  private async syncActor(user: User, options: { syncClaims?: boolean } = {}): Promise<Actor> {
    const email = user.email ?? '';
    const token = await user.getIdTokenResult(false);
    const claims = (token.claims ?? {}) as Partial<AuthClaims> & { fullName?: string };
    const claimsRole = normaliseRole(claims.role);
    const profile = this.profileReader ? await this.profileReader(user.uid, email).catch(() => null) : null;

    const resolution = resolveRole({ documentRole: profile?.role ?? null, claimsRole });
    const accountStatus = profile?.exists
      ? profile.status
      : normaliseStatus(claims.accountStatus, 'PENDING_APPROVAL');

    let actor: Actor = {
      uid: user.uid,
      email: email || profile?.email || '',
      displayName: profile?.fullName || claims.fullName || user.displayName || email,
      role: resolution.role,
      facilityId: profile?.exists ? profile.facilityId : ((claims.facilityId as string | null) ?? null),
      accountStatus,
      motherId: profile?.exists ? profile.motherId : ((claims.motherId as string | null) ?? null),
      privilegeVersion: profile?.privilegeVersion ?? Number(claims.privilegeVersion ?? 0),
      claimsSource: claims.role ? 'firebase-id-token' : 'firebase-profile',
      roleSource: resolution.roleSource,
      claimsPendingSync: resolution.needsClaimSync,
      claimSyncNotice: null,
      country: profile?.country ?? null,
    };

    this.emit(actor);

    if (resolution.needsClaimSync && options.syncClaims !== false) {
      const result = await syncClaimsFromDocument({ force: resolution.escalation });
      if (result.synced) {
        await user.getIdTokenResult(true).catch(() => null);
        const refreshed = await user.getIdTokenResult(false);
        const refreshedClaims = (refreshed.claims ?? {}) as Partial<AuthClaims>;
        const refreshedRole = normaliseRole(refreshedClaims.role);
        actor = {
          ...actor,
          role: refreshedRole ?? actor.role,
          roleSource: refreshedRole ? 'custom-claims' : actor.roleSource,
          claimsSource: refreshedRole ? 'firebase-id-token' : actor.claimsSource,
          claimsPendingSync: false,
          claimSyncNotice: null,
          privilegeVersion: Number(refreshedClaims.privilegeVersion ?? actor.privilegeVersion),
        };
        this.emit(actor);
      } else if (result.reason) {
        actor = { ...actor, claimsPendingSync: true, claimSyncNotice: result.reason };
        this.emit(actor);
      }
    }

    return actor;
  }

  private armIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.signOut('idle');
    }, IDLE_LOGOUT_MS);
  }

  private touch(): void {
    if (this.auth.currentUser) this.armIdleTimer();
  }

  async getActor(): Promise<Actor | null> {
    this.touch();
    return this.actor;
  }

  async refreshClaims(): Promise<Actor | null> {
    const user = this.auth.currentUser;
    if (!user) return null;
    await user.getIdTokenResult(true).catch(() => null);
    await this.syncActor(user, { syncClaims: false });
    return this.actor;
  }

  async signIn(email: string, password: string, remember = true): Promise<Actor> {
    try {
      await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(this.auth, email.trim().toLowerCase(), password);
      const actor = await this.syncActor(credential.user);
      this.touch();
      return actor;
    } catch (error) {
      logProviderError('firebase sign-in', error);
      throw toAppError(error, 'Sign-in failed. Please check your details and try again.');
    }
  }

  async signOut(reason?: string): Promise<void> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.unsub?.();
    this.unsub = null;
    await this.auth.signOut().catch(() => null);
    this.emit(null);
    if (reason === 'idle') {
      // Surfaced by the session hook as a banner on the sign-in screen. Storage
      // access can throw in private/partitioned contexts — never crash sign-out.
      safeSession.set('mamacare.session.notice', 'idle-timeout');
    }
  }

  async register(input: {
    fullName: string;
    email: string;
    phone: string;
    password: string;
    claims: AuthClaims;
  }): Promise<{ uid: string }> {
    try {
      const credential = await createUserWithEmailAndPassword(this.auth, input.email.trim().toLowerCase(), input.password);
      await updateProfile(credential.user, { displayName: input.fullName });
      // Auth metadata written here is untrusted display context only: claims are
      // minted by the API service when an administrator approves the account.
      await this.syncActor(credential.user);
      return { uid: credential.user.uid };
    } catch (error) {
      logProviderError('firebase registration', error);
      throw toAppError(error, 'Unable to create your account. Please try again.');
    }
  }

  async resetPassword(email: string): Promise<void> {
    try {
      await sendPasswordResetEmail(this.auth, email.trim().toLowerCase(), {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
    } catch (error) {
      throw toAppError(error, 'We could not send a reset link right now. Please try again.');
    }
  }

  async confirmReset(code: string, password: string): Promise<void> {
    const { confirmPasswordReset } = await import('firebase/auth');
    try {
      await confirmPasswordReset(this.auth, code, password);
    } catch (error) {
      throw toAppError(error, 'That reset link is invalid or has expired. Please request a new one.');
    }
  }

  async changePassword(currentPassword: string | null, newPassword: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user?.email) throw new AppError('Please sign in again before changing your password.', 'SESSION_EXPIRED');
    if (!currentPassword) throw new AppError('Enter your current password to confirm this change.', 'VALIDATION');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
      await user.getIdTokenResult(true);
    } catch (error) {
      const mapped = toAppError(error, 'We could not change your password. Please try again.');
      if (mapped.code === 'UNAUTHENTICATED') {
        throw new AppError('Your current password is incorrect.', 'VALIDATION');
      }
      throw mapped;
    }
  }

  async verifyRecentLogin(password: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user?.email) throw new AppError('Please sign in again.', 'SESSION_EXPIRED');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
  }

  async updateProfile(patch: { displayName?: string; photoURL?: string | null }): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    try {
      await updateProfile(user, { displayName: patch.displayName, photoURL: patch.photoURL ?? null });
      await this.syncActor(user);
    } catch (error) {
      throw toAppError(error, 'We could not update your profile. Please try again.');
    }
  }

  async deleteAccount(password?: string): Promise<void> {
    const { deleteUser } = await import('firebase/auth');
    const user = this.auth.currentUser;
    if (!user) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    if (!user.email || !password) throw new AppError('Confirm your password to deactivate this account.', 'VALIDATION');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
      await deleteUser(user);
      this.emit(null);
    } catch (error) {
      throw toAppError(error, 'We could not deactivate this account. Please contact your administrator.');
    }
  }
}

export const firebaseAuth = new FirebaseAuthAdapter();

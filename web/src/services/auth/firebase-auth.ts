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
import { AppError, toAppError } from '@/lib/errors';
import type { AccountStatus, AuthClaims, Role } from '@/types/domain';
import type { Actor, AuthAdapter } from '@/services/data/contract';
import { getFirebaseAuth } from '@/services/firebase/app';

type ProfileReader = (uid: string) => Promise<AuthClaims & { fullName: string; email: string } | null>;

const IDLE_LOGOUT_MS = 30 * 60_000;
const ACTOR_REFRESH_MS = 5 * 60_000;

export class FirebaseAuthAdapter implements AuthAdapter {
  readonly kind = 'firebase' as const;
  private auth: Auth;
  private actor: Actor | null = null;
  private listeners = new Set<(actor: Actor | null) => void>();
  private unsub: (() => void) | null = null;
  private profileReader: ProfileReader | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.auth = getFirebaseAuth();
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
   * Claims come from the ID token (authoritative). If the token carries no
   * claims — a freshly registered or unapproved account — the profile is read
   * for display purposes and marked as such, so privileged reads stay denied by
   * Firestore rules until an administrator approves the account.
   */
  private async syncActor(user: User): Promise<void> {
    const token = await user.getIdTokenResult(false);
    const claims = (token.claims ?? {}) as Partial<AuthClaims> & { fullName?: string };
    let actor: Actor | null = null;

    if (claims.role) {
      actor = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: claims.fullName ?? user.displayName ?? '',
        role: claims.role as Role,
        facilityId: (claims.facilityId as string | null) ?? null,
        accountStatus: ((claims.accountStatus as AccountStatus) ?? 'ACTIVE') as AccountStatus,
        motherId: (claims.motherId as string | null) ?? null,
        privilegeVersion: Number(claims.privilegeVersion ?? 1),
        claimsSource: 'firebase-id-token',
      };
    } else if (this.profileReader) {
      const profile = await this.profileReader(user.uid);
      if (profile) {
        actor = {
          uid: user.uid,
          email: profile.email,
          displayName: profile.fullName,
          role: profile.role,
          facilityId: profile.facilityId ?? null,
          accountStatus: profile.accountStatus ?? 'PENDING_APPROVAL',
          motherId: profile.motherId ?? null,
          privilegeVersion: profile.privilegeVersion ?? 0,
          claimsSource: 'firebase-profile',
        };
      }
    }

    if (!actor) {
      actor = {
        uid: user.uid,
        email: user.email ?? '',
        displayName: user.displayName ?? '',
        role: 'MOTHER',
        facilityId: null,
        accountStatus: 'PENDING_APPROVAL',
        motherId: null,
        privilegeVersion: 0,
        claimsSource: 'firebase-profile',
      };
    }
    this.emit(actor);
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
    const refreshed = await user.getIdTokenResult(true);
    const claims = (refreshed.claims ?? {}) as Partial<AuthClaims> & { fullName?: string };
    if (!claims.role) return this.actor;
    await this.syncActor(user);
    return this.actor;
  }

  async signIn(email: string, password: string, remember = true): Promise<Actor> {
    try {
      await setPersistence(this.auth, remember ? browserLocalPersistence : browserSessionPersistence);
      const credential = await signInWithEmailAndPassword(this.auth, email.trim().toLowerCase(), password);
      await this.syncActor(credential.user);
      this.touch();
      const actor = this.actor;
      if (!actor) throw new AppError('Sign-in completed but the account could not be loaded. Contact your administrator.', 'CONFIGURATION');
      return actor;
    } catch (error) {
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
      // Surfaced by the session hook as a banner on the sign-in screen.
      sessionStorage.setItem('mamacare.session.notice', 'idle-timeout');
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
      throw toAppError(error, 'We could not create your account. Please try again.');
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

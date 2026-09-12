/**
 * Application service registry.
 *
 * Picks the persistence + authentication adapters from `VITE_DATA_PROVIDER`
 * (auto: Firebase when configured, otherwise the device provider), wires the
 * policy-enforcing data layer, and exposes a subscribable session store that the
 * UI reads through `useSession()`.
 */

import { dataProvider, integrations, logRuntimeSummary } from '@/config/env';
import { AppError } from '@/lib/errors';
import { api } from '@/services/api/client';
import { LocalDataProvider } from '@/services/data/local/provider';
import { FirestoreProvider } from '@/services/data/firestore-provider';
import { DataLayer } from '@/services/data-layer';
import type { Actor, AuthAdapter, DataProvider } from '@/services/data/contract';
import { localAuth } from '@/services/auth/local-auth';
import { firebaseAuth } from '@/services/auth/firebase-auth';
import { readLocalProfile, readProfileClaims } from '@/services/auth/profile-lookup';
import { setBlobStore } from '@/services/media/blob-store';
import { permissionsFor, type UiPermissions } from '@/services/policy/policy';
import type { AuditAction } from '@/types/domain';

export interface SessionState {
  status: 'initialising' | 'anonymous' | 'authenticated' | 'error';
  actor: Actor | null;
  permissions: UiPermissions;
  error: string | null;
}

export class SessionStore {
  private state: SessionState = { status: 'initialising', actor: null, permissions: permissionsFor(null), error: null };
  private listeners = new Set<(state: SessionState) => void>();
  private unsubscribeAuth: (() => void) | null = null;

  readonly provider: DataProvider;
  readonly auth: AuthAdapter;
  readonly data: DataLayer;

  constructor(provider: DataProvider, auth: AuthAdapter) {
    this.provider = provider;
    this.auth = auth;
    this.data = new DataLayer(provider, () => this.state.actor);
    api.setTokenProvider(() => this.idToken());
  }

  getState = (): SessionState => this.state;

  /** Stable accessor used by providers when building provider-scoped queries. */
  actorRef = (): Actor | null => this.state.actor;

  subscribe = (listener: (state: SessionState) => void): (() => void) => {
    this.listeners.add(listener);
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<SessionState>): void {
    const actor = patch.actor !== undefined ? patch.actor : this.state.actor;
    this.state = { ...this.state, ...patch, actor, permissions: permissionsFor(actor) };
    for (const listener of this.listeners) listener(this.state);
  }

  /** Fresh ID token for API calls; null in device mode (no token service). */
  async idToken(): Promise<string | null> {
    if (this.provider.kind === 'local') return null;
    const { getFirebaseAuth } = await import('@/services/firebase/app');
    const user = getFirebaseAuth().currentUser;
    if (!user) return null;
    try {
      return await user.getIdToken(true);
    } catch {
      return null;
    }
  }

  async initialise(): Promise<void> {
    try {
      await this.auth.restore();
    } catch (error) {
      const mapped =
        error instanceof AppError
          ? error
          : new AppError('The service could not be reached. Please check your connection and try again.', 'NETWORK');
      this.set({ status: 'error', error: mapped.message });
      return;
    }
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = this.auth.onSessionChange((actor) => {
      this.set({ actor, status: actor ? 'authenticated' : 'anonymous', error: null });
    });
    const actor = await this.auth.getActor();
    this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
  }

  async refresh(): Promise<void> {
    try {
      const actor = await this.auth.refreshClaims();
      this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
    } catch (error) {
      this.set({ error: error instanceof AppError ? error.message : 'Please sign in again.' });
    }
  }

  async signIn(email: string, password: string, remember = true): Promise<Actor> {
    const adapter = this.auth as AuthAdapter & {
      signIn(email: string, password: string, remember?: boolean): Promise<Actor>;
    };
    const actor = await adapter.signIn(email, password, remember);
    this.set({ actor, status: 'authenticated' });
    return actor;
  }

  async signOut(): Promise<void> {
    await this.auth.signOut();
    this.set({ actor: null, status: 'anonymous' });
  }

  require(): Actor {
    if (!this.state.actor) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    return this.state.actor;
  }

  /** True when privileged server operations (claims, private files) are reachable. */
  get canCallApi(): boolean {
    return this.provider.kind === 'firebase';
  }
}

function buildLocalAuthAdapter(provider: LocalDataProvider): AuthAdapter {
  localAuth.wire({
    readProfile: (uid) => readLocalProfile(uid, provider),
    writeProfile: async (uid, patch) => {
      const existing = await provider.get('users', uid, null);
      if (existing) {
        await provider.update('users', uid, patch as never, null);
        return;
      }
      await provider.provisionUser({
        id: uid,
        email: patch.email ?? '',
        fullName: patch.fullName ?? 'New user',
        phone: null,
        role: 'MOTHER',
        status: 'PENDING_APPROVAL',
        accountKind: 'HEALTH_WORKER',
        requestedRole: null,
        facilityId: null,
        motherId: null,
        title: null,
        licenseNumber: null,
        photoUrl: null,
        photoPublicId: null,
        emailVerified: false,
        privilegeVersion: 1,
        createdAt: new Date().toISOString(),
        createdBy: null,
        updatedAt: new Date().toISOString(),
        updatedBy: null,
        lastLoginAt: null,
        deactivatedAt: null,
        deactivatedBy: null,
        deactivationReason: null,
      });
    },
    audit: async (actor, action, targetId) => {
      await provider
        .create(
          'audit_logs',
          {
            id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            action: action as AuditAction,
            actorId: actor?.uid ?? 'system',
            actorName: actor?.displayName ?? 'System',
            actorRole: actor?.role ?? 'SYSTEM',
            targetType: 'session',
            targetId,
            createdAt: new Date().toISOString(),
          } as never,
          actor ? { ...actor, role: 'ADMIN' } : null,
        )
        .catch(() => null);
    },
  });
  return localAuth;
}

let instance: SessionStore | null = null;

export function services(): SessionStore {
  if (instance) return instance;

  if (dataProvider === 'firebase') {
    if (integrations.misconfigured) {
      throw new AppError(
        'VITE_DATA_PROVIDER is pinned to "firebase" but the project configuration is incomplete. Fill in the VITE_FIREBASE_* variables or remove the pin.',
        'CONFIGURATION',
      );
    }
    const provider = new FirestoreProvider(() => instance?.actorRef() ?? null);
    firebaseAuth.wire((uid) => readProfileClaims(uid));
    instance = new SessionStore(provider, firebaseAuth);
    logRuntimeSummary();
    return instance;
  }

  const provider = new LocalDataProvider();
  setBlobStore({
    put: (key, blob) => provider.putBlob(key, blob),
    get: (key) => provider.getBlob(key),
    delete: (key) => provider.deleteBlob(key),
  });
  instance = new SessionStore(provider, buildLocalAuthAdapter(provider));
  logRuntimeSummary();
  return instance;
}

export const isLocalProvider = (): boolean => dataProvider === 'local';

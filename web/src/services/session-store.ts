/**
 * Application service registry.
 *
 * Picks the persistence + authentication adapters from `VITE_DATA_PROVIDER`
 * (auto: Firebase when configured, otherwise the device provider), wires the
 * policy-enforcing data layer, and exposes a subscribable session store that the
 * UI reads through `useSession()`.
 */

import { dataProvider, integrations, logRuntimeSummary } from '@/config/env';
import { AppError, logProviderError } from '@/lib/errors';
import { api } from '@/services/api/client';
import { LocalDataProvider } from '@/services/data/local/provider';
import { FirestoreProvider } from '@/services/data/firestore-provider';
import { DataLayer } from '@/services/data-layer';
import type { Actor, AuthAdapter, DataProvider } from '@/services/data/contract';
import { localAuth } from '@/services/auth/local-auth';
import { firebaseAuth } from '@/services/auth/firebase-auth';
import { readLocalStoredProfile, readStoredProfile, toProfileClaims } from '@/services/auth/profile-lookup';
import { syncClaimsFromDocument } from '@/services/auth/claims-sync';
import { setBlobStore } from '@/services/media/blob-store';
import { permissionsFor, type UiPermissions } from '@/services/policy/policy';
import type { AuditAction } from '@/types/domain';

export interface SessionState {
  status: 'initialising' | 'anonymous' | 'authenticated' | 'error';
  actor: Actor | null;
  permissions: UiPermissions;
  error: string | null;
  /**
   * Set when the deployment is not configured the way it was asked to be (for
   * example `VITE_DATA_PROVIDER=firebase` without the Firebase keys). The app
   * keeps working on the safe fallback and the interface says so, instead of
   * throwing a screen-level error the user cannot act on.
   */
  configurationError: string | null;
}

export class SessionStore {
  private state: SessionState = {
    status: 'initialising',
    actor: null,
    permissions: permissionsFor(null),
    error: null,
    configurationError: null,
  };
  private listeners = new Set<(state: SessionState) => void>();
  private unsubscribeAuth: (() => void) | null = null;

  readonly provider: DataProvider;
  readonly auth: AuthAdapter;
  readonly data: DataLayer;

  constructor(provider: DataProvider, auth: AuthAdapter, configurationError: string | null = null) {
    this.provider = provider;
    this.auth = auth;
    this.data = new DataLayer(provider, () => this.state.actor);
    this.state = { ...this.state, configurationError };
    api.setTokenProvider(() => this.idToken());
  }

  getState = (): SessionState => this.state;

  /** Records a deployment configuration problem for the interface to display. */
  setConfigurationError(message: string | null): void {
    this.set({ configurationError: message });
  }

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
      logProviderError('session restore', error);
      const mapped =
        error instanceof AppError
          ? error
          : new AppError('Unable to connect to the server. Check your connection and try again.', 'NETWORK');
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
    return this.state.actor ?? actor;
  }

  /**
   * Brings the session token in line with `users/{uid}.role` and re-reads the
   * session. Used by the diagnostics screen ("Refresh role from the database")
   * and after an administrator changes a stored role.
   */
  async syncRole(): Promise<{ synced: boolean; reason: string | null }> {
    if (this.provider.kind !== 'firebase') {
      const actor = await this.auth.refreshClaims();
      this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
      return { synced: true, reason: null };
    }
    const result = await syncClaimsFromDocument({ force: true });
    const actor = await this.auth.refreshClaims();
    this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
    return { synced: result.synced, reason: result.reason };
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
    readProfile: (uid) =>
      readLocalStoredProfile(uid, provider).then((profile) =>
        profile.exists ? { ...toProfileClaims(profile), roleSource: 'device-session' as const } : null,
      ),
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

/**
 * Builds the device (IndexedDB) stack. Used when Firebase is not configured and
 * as the safe fallback when a pinned Firebase configuration turns out to be
 * incomplete — a half-configured deployment must still open the public site and
 * say what is wrong, rather than showing an error page on every route.
 */
function buildDeviceStack(): SessionStore {
  const provider = new LocalDataProvider();
  setBlobStore({
    put: (key, blob) => provider.putBlob(key, blob),
    get: (key) => provider.getBlob(key),
    delete: (key) => provider.deleteBlob(key),
  });
  return new SessionStore(provider, buildLocalAuthAdapter(provider));
}

export function services(): SessionStore {
  if (instance) return instance;

  if (dataProvider === 'firebase') {
    if (integrations.misconfigured) {
      const message =
        'VITE_DATA_PROVIDER is set to "firebase" but the Firebase project configuration is incomplete, so this build is running on device storage. Set the VITE_FIREBASE_* variables (and VITE_DATA_PROVIDER=firebase) in the deployment environment and rebuild.';
      logProviderError('configuration', new Error(message));
      const fallback = buildDeviceStack();
      fallback.setConfigurationError(message);
      instance = fallback;
      logRuntimeSummary();
      return instance;
    }
    try {
      const provider = new FirestoreProvider(() => instance?.actorRef() ?? null);
      firebaseAuth.wire((uid, email) => readStoredProfile(uid, email));
      instance = new SessionStore(provider, firebaseAuth);
      logRuntimeSummary();
      return instance;
    } catch (error) {
      const message =
        'Firebase could not be initialised in this browser, so the app fell back to device storage. Check the VITE_FIREBASE_* values and this project\'s authorised domains.';
      logProviderError('firebase initialisation', error);
      const fallback = buildDeviceStack();
      fallback.setConfigurationError(message);
      instance = fallback;
      logRuntimeSummary();
      return instance;
    }
  }

  instance = buildDeviceStack();
  logRuntimeSummary();
  return instance;
}

export const isLocalProvider = (): boolean => dataProvider === 'local';

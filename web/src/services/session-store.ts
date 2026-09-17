/**
 * Session store.
 *
 * Chooses the persistence and authentication adapters (`firebase` when the
 * project is configured, otherwise this device), wires the policy layer, and
 * exposes one subscribable session that the whole UI reads through
 * `useSession()`.
 *
 * When the session changes it also resolves the two things authorisation needs
 * that are not on the identity token:
 *   • for a provider, the patients who have shared their care (`care_links`);
 *   • for a supporter, the categories the mother switched on.
 * Those are published to the policy module, which enforces them on every read.
 */

import { dataProvider, integrations, logRuntimeSummary } from '@/config/env';
import { AppError, logProviderError } from '@/lib/errors';
import { DataLayer } from '@/services/data-layer';
import { FirestoreProvider } from '@/services/data/firestore-provider';
import { LocalDataProvider } from '@/services/data/local/provider';
import { STORES, storageMode } from '@/services/data/local/store';
import { firebaseAuth } from '@/services/auth/firebase-auth';
import { localAuth } from '@/services/auth/local-auth';
import { defaultProfile, toActor } from '@/services/auth/profile-lookup';
import { setBlobStore } from '@/services/media/blob-store';
import { clearPolicyContext, permissionsFor, setPolicyContext, type UiPermissions } from '@/services/policy/policy';
import type { Actor, AuthAdapter, DataProvider } from '@/services/data/contract';
import type { AuditAction, CareLink, SupporterLink, UserProfile } from '@/types/domain';

export interface SessionState {
  status: 'initialising' | 'anonymous' | 'authenticated' | 'error';
  actor: Actor | null;
  profile: UserProfile | null;
  permissions: UiPermissions;
  error: string | null;
  /** A deployment that is not configured the way it asked to be. */
  configurationError: string | null;
  /** Patients who have shared care with the signed-in provider. */
  linkedPatientIds: string[];
  /** What the mother has shared with a supporter account. */
  supporterAccess: SupporterLink['permissions'] | null;
}

const INITIAL_STATE: SessionState = {
  status: 'initialising',
  actor: null,
  profile: null,
  permissions: permissionsFor(null),
  error: null,
  configurationError: null,
  linkedPatientIds: [],
  supporterAccess: null,
};

export class SessionStore {
  private state: SessionState = { ...INITIAL_STATE };
  private listeners = new Set<(state: SessionState) => void>();
  private unsubscribeAuth: (() => void) | null = null;
  private contextLoadedFor: string | null = null;

  readonly provider: DataProvider;
  readonly auth: AuthAdapter;
  readonly data: DataLayer;

  constructor(provider: DataProvider, auth: AuthAdapter, configurationError: string | null = null) {
    this.provider = provider;
    this.auth = auth;
    this.data = new DataLayer(provider, () => this.state.actor);
    this.state = { ...this.state, configurationError };
  }

  getState = (): SessionState => this.state;
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
    if (actor && this.contextLoadedFor !== actor.uid) void this.loadAccessContext(actor);
    if (!actor) {
      this.contextLoadedFor = null;
      clearPolicyContext();
    }
  }

  setConfigurationError(message: string | null): void {
    this.set({ configurationError: message });
  }

  /**
   * Publishes the care links and supporter permissions to the policy module.
   * Runs once per signed-in identity and can be forced after a change.
   */
  async loadAccessContext(actor: Actor, force = false): Promise<void> {
    if (!force && this.contextLoadedFor === actor.uid) return;
    this.contextLoadedFor = actor.uid;

    // The approvals switch lives in the global settings document; defaulting to
    // true means a missing read can never relax the verification gate.
    let approvalsRequired = true;
    try {
      const settings = await this.data.get('settings', 'global');
      approvalsRequired = settings?.providerApprovalsRequired !== false;
    } catch {
      approvalsRequired = true;
    }

    if (actor.role === 'PROVIDER' || actor.role === 'FACILITY_ADMIN') {
      try {
        const links = await this.data.rows('care_links', {
          where: [{ field: 'providerUserId', op: '==', value: actor.uid }],
        });
        const ids = links.filter((link) => link.status === 'active').map((link) => link.motherUserId);
        setPolicyContext({ linkedPatientIds: ids, providerApprovalsRequired: approvalsRequired });
        this.state = { ...this.state, linkedPatientIds: ids };
      } catch (error) {
        logProviderError('care links', error);
        setPolicyContext({ linkedPatientIds: [], providerApprovalsRequired: approvalsRequired });
        this.state = { ...this.state, linkedPatientIds: [] };
      }
      return;
    }

    if (actor.role === 'SUPPORTER') {
      try {
        const links = await this.data.rows('supporters', { limit: 50 });
        const mine = links
          .filter((link) => link.status === 'active')
          .filter((link) => link.supporterUserId === actor.uid || link.supporterEmail.toLowerCase() === actor.email.toLowerCase());
        const permissions = mine.reduce<SupporterLink['permissions']>(
          (acc, link) => ({
            appointments: acc.appointments || link.permissions.appointments,
            reminders: acc.reminders || link.permissions.reminders,
            education: acc.education || link.permissions.education,
            milestones: acc.milestones || link.permissions.milestones,
          }),
          { appointments: false, reminders: false, education: false, milestones: false },
        );
        setPolicyContext({ supporterPermissions: permissions, linkedPatientIds: [], providerApprovalsRequired: approvalsRequired });
        this.state = { ...this.state, supporterAccess: permissions, linkedPatientIds: [] };
      } catch (error) {
        logProviderError('supporter links', error);
      }
      return;
    }

    clearPolicyContext();
    setPolicyContext({ linkedPatientIds: [], providerApprovalsRequired: approvalsRequired });
    this.state = { ...this.state, linkedPatientIds: [], supporterAccess: null };
  }

  async initialise(): Promise<void> {
    try {
      await this.auth.restore();
    } catch (error) {
      logProviderError('session restore', error);
      const mapped =
        error instanceof AppError
          ? error
          : new AppError('Unable to reach the authentication service. Check your connection and try again.', 'NETWORK', {
              retryable: true,
            });
      this.set({ status: 'error', error: mapped.message });
      return;
    }
    this.unsubscribeAuth?.();
    this.unsubscribeAuth = this.auth.onSessionChange((actor) => {
      this.set({ actor, status: actor ? 'authenticated' : 'anonymous', error: null });
      if (actor) void this.loadProfile(actor.uid);
      else this.state = { ...this.state, profile: null };
    });
    const actor = await this.auth.getActor();
    this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
    if (actor) await this.loadProfile(actor.uid);
  }

  private async loadProfile(uid: string): Promise<void> {
    try {
      const profile = await this.provider.get('users', uid, this.state.actor);
      if (profile) this.state = { ...this.state, profile };
      for (const listener of this.listeners) listener(this.state);
    } catch (error) {
      logProviderError('profile load', error);
    }
  }

  async refresh(): Promise<void> {
    try {
      const actor = await this.auth.refreshClaims();
      this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
      if (actor) {
        await this.loadProfile(actor.uid);
        await this.loadAccessContext(actor, true);
      }
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
    await this.loadProfile(actor.uid);
    await this.loadAccessContext(actor, true);
    await this.audit('sign-in', 'users', actor.uid);
    return this.state.actor ?? actor;
  }

  async signOut(): Promise<void> {
    const uid = this.state.actor?.uid ?? null;
    await this.auth.signOut();
    this.set({ actor: null, status: 'anonymous', profile: null, linkedPatientIds: [], supporterAccess: null });
    if (uid) await this.audit('sign-out', 'users', uid);
  }

  /** Re-reads the stored profile and re-resolves claims after an admin change. */
  async syncRole(): Promise<{ synced: boolean; reason: string | null }> {
    const actor = await this.auth.refreshClaims();
    this.set({ actor, status: actor ? 'authenticated' : 'anonymous' });
    if (!actor) return { synced: false, reason: 'No session to refresh.' };
    await this.loadProfile(actor.uid);
    await this.loadAccessContext(actor, true);
    const reason =
      actor.claimsSource === 'profile-document' && this.provider.kind === 'firebase'
        ? 'Your role comes from your profile document. Firebase custom claims are set by an administrator with the Admin SDK; until then the database rules may still refuse privileged reads.'
        : null;
    return { synced: true, reason };
  }

  /**
   * A health snapshot for the public status page and support conversations.
   * Counts only — never personal content.
   */
  async diagnostics(): Promise<{
    provider: 'firebase' | 'local';
    writable: boolean;
    signedIn: boolean;
    records: number;
    perCollection: Record<string, number>;
  }> {
    const kind = this.data.kind;
    const collections = STORES.filter((name) => name !== 'blobs' && name !== 'meta');
    const perCollection: Record<string, number> = {};
    let records = 0;
    for (const name of collections) {
      try {
        const result = await this.data.list(name as never, { limit: 200 });
        perCollection[name] = result.rows.length;
        records += result.rows.length;
      } catch {
        perCollection[name] = 0;
      }
    }
    return {
      provider: kind,
      writable: kind === 'firebase' ? globalThis.navigator?.onLine !== false : storageMode() === 'indexeddb',
      signedIn: Boolean(this.actorRef()),
      records,
      perCollection,
    };
  }

  require(): Actor {
    if (!this.state.actor) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    return this.state.actor;
  }

  async updateProfile(patch: Partial<UserProfile>): Promise<UserProfile> {
    const actor = this.require();
    const updated = await this.data.update('users', actor.uid, patch);
    this.state = { ...this.state, profile: updated };
    for (const listener of this.listeners) listener(this.state);
    return updated;
  }

  /** Removes the profile, its records and the identity. */
  async deleteAccount(password?: string): Promise<void> {
    const actor = this.require();
    const owned: { name: Parameters<DataLayer['remove']>[0]; field: string }[] = [
      { name: 'pregnancies', field: 'userId' },
      { name: 'babies', field: 'userId' },
      { name: 'appointments', field: 'userId' },
      { name: 'reminders', field: 'userId' },
      { name: 'observations', field: 'userId' },
      { name: 'journal', field: 'userId' },
      { name: 'notifications', field: 'userId' },
      { name: 'devices', field: 'userId' },
      { name: 'documents', field: 'userId' },
      { name: 'supporters', field: 'motherUserId' },
      { name: 'care_links', field: 'motherUserId' },
    ];
    for (const entry of owned) {
      const rows = await this.data.rows(entry.name as never, { where: [{ field: entry.field, op: '==', value: actor.uid }] }).catch(() => []);
      for (const row of rows as { id: string }[]) {
        await this.data.remove(entry.name as never, row.id).catch(() => undefined);
      }
    }
    await this.audit('account-delete', 'users', actor.uid);
    await this.data.remove('users', actor.uid).catch(() => undefined);
    await this.auth.deleteAccount(password);
    this.set({ actor: null, status: 'anonymous', profile: null, linkedPatientIds: [], supporterAccess: null });
  }

  /**
   * First-install bootstrap. On a device install this promotes the current
   * account; on Firebase, custom claims must be set with the Admin SDK, so the
   * method explains exactly what to do instead of pretending it worked.
   */
  async bootstrapAdmin(): Promise<{ done: boolean; message: string }> {
    const actor = this.require();
    if (!integrations.firebase.configured || this.provider.kind === 'local') {
      await localAuth.promoteToAdmin(actor.uid);
      await this.refresh();
      return { done: true, message: 'This device account is now an administrator.' };
    }
    return {
      done: false,
      message:
        'On a Firebase deployment an administrator is created by setting custom claims with the Admin SDK (firebase auth:set-claims ' +
        actor.uid + ' --claims \'{"role":"ADMIN"}\'), or from the Firebase console. The app cannot grant itself privileges.',
    };
  }

  /** Creates a device account without a browser session (used by the seeder/tests). */
  async provisionLocalProfile(profile: UserProfile): Promise<UserProfile> {
    const local = this.provider as LocalDataProvider;
    return local.provisionUser(profile);
  }

  private async audit(action: AuditAction, targetType: string, targetId: string | null, detail: string | null = null): Promise<void> {
    try {
      const actor = this.state.actor;
      await this.provider.create(
        'audit_logs',
        {
          id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
          action,
          actorId: actor?.uid ?? 'system',
          actorName: actor?.displayName ?? 'System',
          actorRole: actor?.role ?? 'SYSTEM',
          targetType,
          targetId,
          detail,
          createdAt: new Date().toISOString(),
        } as never,
        null,
      );
    } catch {
      /* audit never blocks the action it describes */
    }
  }

  get canCallCloud(): boolean {
    return this.provider.kind === 'firebase';
  }
}

/* ── Wiring ─────────────────────────────────────────────────────────────── */

function buildLocalAuthAdapter(provider: LocalDataProvider): AuthAdapter {
  localAuth.wire({
    readProfile: (uid) => provider.readRaw('users', uid),
    createProfile: (profile) => provider.provisionUser(profile),
    updateProfile: async (uid, patch) => {
      const existing = await provider.readRaw('users', uid);
      if (existing) {
        await provider.seedRows('users', [{ ...existing, ...patch, updatedAt: new Date().toISOString() }]);
        return;
      }
      await provider.provisionUser(defaultProfile({ uid, fullName: 'Mama Care user', email: '' }));
    },
  });
  return localAuth;
}

function buildFirebaseAuthAdapter(): AuthAdapter {
  firebaseAuth.wire({
    readProfile: async (uid, email) => {
      const { getDb } = await import('@/services/firebase/app');
      const { doc, getDoc, collection, query, where, getDocs, limit } = await import('firebase/firestore');
      const snap = await getDoc(doc(getDb(), 'users', uid));
      if (snap.exists()) return { ...(snap.data() as object), id: snap.id } as UserProfile;
      if (email) {
        const found = await getDocs(query(collection(getDb(), 'users'), where('email', '==', email), limit(1)));
        const first = found.docs[0];
        if (first) return { ...(first.data() as object), id: first.id } as UserProfile;
      }
      return null;
    },
    createProfile: async (profile) => {
      const { getDb } = await import('@/services/firebase/app');
      const { doc, setDoc } = await import('firebase/firestore');
      await setDoc(doc(getDb(), 'users', profile.uid), profile, { merge: true });
      return profile;
    },
    updateProfile: async (uid, patch) => {
      const { getDb } = await import('@/services/firebase/app');
      const { doc, updateDoc } = await import('firebase/firestore');
      await updateDoc(doc(getDb(), 'users', uid), patch as never);
    },
  });
  return firebaseAuth;
}

/** Builds the device (IndexedDB) stack. */
function buildDeviceStack(configurationError: string | null = null): SessionStore {
  const provider = new LocalDataProvider();
  setBlobStore({
    put: (key, blob) => provider.putBlob(key, blob),
    get: (key) => provider.getBlob(key),
    delete: (key) => provider.deleteBlob(key),
  });
  return new SessionStore(provider, buildLocalAuthAdapter(provider), configurationError);
}

let instance: SessionStore | null = null;

export function services(): SessionStore {
  if (instance) return instance;

  if (dataProvider === 'local') {
    instance = buildDeviceStack(
      integrations.misconfigured
        ? 'VITE_DATA_PROVIDER is set to "firebase" but the Firebase configuration is incomplete, so records are being stored on this device.'
        : null,
    );
    logRuntimeSummary();
    return instance;
  }

  try {
    const provider = new FirestoreProvider(() => instance?.actorRef() ?? null);
    instance = new SessionStore(provider, buildFirebaseAuthAdapter());
    setBlobStore({
      put: async (key, blob) => {
        void key;
        void blob;
      },
      get: async () => null,
      delete: async () => undefined,
    });
  } catch (error) {
    logProviderError('firebase provider', error);
    instance = buildDeviceStack(
      'Firebase could not start in this browser, so records are being stored on this device. Check your connection and reload.',
    );
  }
  logRuntimeSummary();
  return instance;
}

/** Test/DI hook — replaces the singleton (used by the smoke tests). */
export function __resetServices(): void {
  instance = null;
}

/** Convenience wrapper so screens can call `diagnostics()` without holding the singleton. */
export const diagnostics = (): ReturnType<SessionStore['diagnostics']> => services().diagnostics();

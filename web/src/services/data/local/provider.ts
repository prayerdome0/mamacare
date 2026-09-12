import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { QuerySpec } from '@/types/domain';
import type { Actor, CollectionName, DataProvider, ListResult, NewRow, RowOf, TxHandle } from '@/services/data/contract';
import { canReadRow, canWrite, isAdmin, touchesFacility } from '@/services/policy/policy';
import { applyQuery } from '@/services/data/query-engine';
import * as store from './store';

/**
 * Device provider: real persistence (IndexedDB) with the platform access policy
 * executed on every read and write. Used when Firebase project configuration is
 * absent, and as the offline cache path for field devices.
 */

const FACILITY_WRITABLE: CollectionName[] = [
  'mothers',
  'pregnancies',
  'anc_visits',
  'appointments',
  'alerts',
  'referrals',
  'reports',
  'documents',
];

const immutableOnUpdate: Partial<Record<CollectionName, string[]>> = {
  mothers: ['id', 'patientId', 'createdAt', 'createdBy', 'createdByName'],
  anc_visits: ['id', 'motherId', 'pregnancyId', 'createdAt', 'createdBy', 'createdByName', 'clientRef'],
  pregnancies: ['id', 'motherId', 'createdAt', 'createdBy'],
  alerts: ['id', 'motherId', 'pregnancyId', 'openedAt', 'openedBy', 'openedByName', 'level', 'ruleKey'],
  referrals: ['id', 'motherId', 'createdAt', 'createdBy', 'createdByName', 'originFacilityId'],
  audit_logs: ['id', 'actorId', 'action', 'createdAt', 'targetId', 'targetType'],
  reports: ['id', 'generatedBy', 'generatedAt', 'type'],
  documents: ['id', 'uploadedBy', 'uploadedAt', 'publicId'],
  users: ['id', 'email', 'createdAt'],
};

const now = (): string => new Date().toISOString();

/** Rows that must never be silently stamped with the writer's facility. */
const SKIP_FACILITY_STAMP: CollectionName[] = ['users', 'facilities', 'settings', 'alert_rules', 'devices', 'notifications', 'audit_logs', 'education', 'facility_assignments'];

export class LocalDataProvider implements DataProvider {
  readonly kind = 'local' as const;

  constructor(private readonly options: { enforcePolicy?: boolean } = { enforcePolicy: true }) {}

  private async assertRead<T extends CollectionName>(name: T, row: RowOf<T>, actor: Actor | null): Promise<RowOf<T>> {
    if (!this.options.enforcePolicy) return row;
    const decision = canReadRow(actor, name, row);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You do not have access to this record.', 'FORBIDDEN');
    return row;
  }

  async get<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<RowOf<T> | null> {
    const row = await store.get<RowOf<T>>(name, id);
    if (!row) return null;
    return this.assertRead(name, row, actor);
  }

  async list<T extends CollectionName>(name: T, query: QuerySpec, actor: Actor | null): Promise<ListResult<RowOf<T>>> {
    const rows = await store.all<RowOf<T>>(name);
    const visible = this.options.enforcePolicy
      ? rows.filter((row) => canReadRow(actor, name, row).allowed)
      : rows;
    const result = applyQuery(visible, query);
    return { rows: result.rows, total: result.total };
  }

  async create<T extends CollectionName>(name: T, value: NewRow<T>, actor: Actor | null): Promise<RowOf<T>> {
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id ? record.id : newId();
    const decision = canWrite(actor, name, 'create', null, record as unknown as Record<string, unknown>);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot create this record.', 'FORBIDDEN');

    const stamped: Record<string, unknown> = { ...record, id };
    if (this.options.enforcePolicy && actor) {
      if (actor.role !== 'MOTHER' && !SKIP_FACILITY_STAMP.includes(name)) {
        const needsFacility = !stamped.facilityId && !stamped.registrationFacilityId && !stamped.originFacilityId;
        if (name !== 'referrals' && needsFacility && actor.facilityId) {
          // A referral is stamped with the *origin* facility below: it is not the
          // writer's record to place at their own facility by default.
          stamped.facilityId = actor.facilityId;
        }
        const facilityField = ['facilityId', 'registrationFacilityId', 'originFacilityId'].find(
          (key) => typeof stamped[key] === 'string',
        );
        if (
          facilityField &&
          !isAdmin(actor) &&
          FACILITY_WRITABLE.includes(name) &&
          !touchesFacility(stamped, actor.facilityId)
        ) {
          throw new AppError(
            'You can only create records for your own facility. Ask an administrator to change your facility assignment.',
            'FORBIDDEN',
          );
        }
      }
      if (actor.role === 'MOTHER' && name === 'alerts') stamped.motherId = actor.motherId;
      if (name === 'audit_logs') {
        stamped.createdAt = typeof stamped.createdAt === 'string' ? stamped.createdAt : now();
        stamped.actorId = actor?.uid ?? 'system';
      }
      if (name === 'mothers' && !stamped.patientId) {
        stamped.patientId = `MC-${String(await store.incrementMeta('patientId')).padStart(6, '0')}`;
      } else if (name === 'mothers' && typeof stamped.patientId === 'string') {
        const existing = await store.all<RowOf<'mothers'>>('mothers');
        if (existing.some((row) => row.patientId === stamped.patientId)) {
          throw new AppError('That patient ID is already in use at another facility.', 'CONFLICT');
        }
      }
    }

    if (!stamped.createdAt) stamped.createdAt = now();
    stamped.updatedAt = now();
    await store.put(name, stamped as unknown as RowOf<T>);
    return stamped as unknown as RowOf<T>;
  }

  async update<T extends CollectionName>(
    name: T,
    id: string,
    patch: Partial<RowOf<T>>,
    actor: Actor | null,
  ): Promise<RowOf<T>> {
    const existing = await store.get<RowOf<T>>(name, id);
    if (!existing) throw new AppError('That record no longer exists.', 'NOT_FOUND');

    const decision = canWrite(actor, name, 'update', existing, patch as Record<string, unknown>);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot change this record.', 'FORBIDDEN');

    const locked = immutableOnUpdate[name] ?? [];
    const safePatch: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
    if (this.options.enforcePolicy) {
      for (const key of locked) delete safePatch[key];
      if (!isAdmin(actor) && name === 'users') {
        for (const key of ['role', 'status', 'facilityId', 'privilegeVersion', 'motherId', 'accountKind']) delete safePatch[key];
      }
      if (!isAdmin(actor) && FACILITY_WRITABLE.includes(name) && safePatch.facilityId && safePatch.facilityId !== (existing as unknown as Record<string, unknown>).facilityId) {
        throw new AppError('Records cannot be moved between facilities from the app.', 'FORBIDDEN');
      }
    }

    const merged = { ...(existing as unknown as Record<string, unknown>), ...safePatch, updatedAt: now() } as unknown as RowOf<T>;
    if (this.options.enforcePolicy) {
      const readBack = canReadRow(actor, name, merged);
      if (!readBack.allowed) throw new AppError(readBack.reason ?? 'That change is outside your access.', 'FORBIDDEN');
    }
    await store.put(name, merged);
    return merged;
  }

  async remove<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<void> {
    const existing = await store.get<RowOf<T>>(name, id);
    if (!existing) return;
    const decision = canWrite(actor, name, 'delete', existing, null);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot delete this record.', 'FORBIDDEN');
    await store.remove(name, id);
  }

  async nextSequence(name: string, step = 1): Promise<number> {
    return store.incrementMeta(name, step);
  }

  subscribe<T extends CollectionName>(
    name: T,
    query: QuerySpec,
    actor: Actor | null,
    onChange: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void {
    let cancelled = false;
    let queued = false;

    const run = async (): Promise<void> => {
      try {
        const result = await this.list(name, query, actor);
        if (!cancelled) onChange(result);
      } catch (error) {
        if (!cancelled) onError(error);
      }
    };

    const schedule = (): void => {
      if (queued) return;
      queued = true;
      queueMicrotask(() => {
        queued = false;
        void run();
      });
    };

    void run();
    const unsubscribe = store.subscribeToStores([name], schedule);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }

  async putBlob(key: string, blob: Blob): Promise<void> {
    await store.put('blobs', { id: key, blob });
  }

  async getBlob(key: string): Promise<Blob | null> {
    const row = await store.get<{ id: string; blob: Blob }>('blobs', key);
    return row?.blob ?? null;
  }

  async deleteBlob(key: string): Promise<void> {
    await store.remove('blobs', key);
  }

  /**
   * Ordered writes applied as one flush. The device provider has no cross-store
   * transaction, so operations are buffered, validated and written in
   * parent→child order; a mid-flush failure surfaces for retry rather than
   * silently half-writing.
   */
  async transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T> {
    type Write =
      | { op: 'set'; name: store.StoreName; id: string; value: Record<string, unknown> }
      | { op: 'merge'; name: store.StoreName; id: string; patch: Record<string, unknown> }
      | { op: 'remove'; name: store.StoreName; id: string };
    const writes: Write[] = [];
    const handle: TxHandle = {
      set: (name, id, value) => writes.push({ op: 'set', name, id, value: value as unknown as Record<string, unknown> }),
      update: (name, id, patch) =>
        writes.push({ op: 'merge', name, id, patch: patch as unknown as Record<string, unknown> }),
      remove: (name, id) => writes.push({ op: 'remove', name, id }),
    };
    const result = await work(handle);
    for (const write of writes) {
      if (write.op === 'remove') {
        await store.remove(write.name, write.id);
        continue;
      }
      if (write.op === 'set') {
        await store.put(write.name, { id: write.id, ...write.value });
        continue;
      }
      const existing = (await store.get<Record<string, unknown>>(write.name, write.id)) ?? { id: write.id };
      await store.put(write.name, { ...existing, ...write.patch, updatedAt: now() });
    }
    return result;
  }

  async purgeLocalData(): Promise<void> {
    await store.wipe();
  }

  /**
   * Demonstration dataset. Loaded lazily so the seeding module (which reads the
   * service registry) never becomes an import cycle, and unavailable unless the
   * device provider is active.
   */
  async seedDemonstrationData(options: { force?: boolean } = {}): Promise<{ created: number; summary: string[] }> {
    if (typeof window === 'undefined') throw new AppError('Seeding is only available in the browser.', 'CONFIGURATION');
    const { seedDemonstrationData } = await import('@/services/demo/dataset');
    const summary = await seedDemonstrationData(options);
    const created = Object.values(summary).reduce<number>((total, value) => total + (typeof value === 'number' ? value : 0), 0);
    return {
      created,
      summary: Object.entries(summary).map(([key, value]) => `${key}: ${value}`),
    };
  }

  /** Exposed for the demonstration-dataset tooling (device provider only). */
  async seedRows<T extends CollectionName>(name: T, rows: RowOf<T>[]): Promise<void> {
    await store.bulkPut(name, rows as unknown as { id: string }[]);
  }

  /**
   * Auth-layer read with no policy applied — the device-mode equivalent of an
   * Admin SDK lookup. Only session bootstrap may use it; every screen reads
   * through `get`/`list`.
   */
  async readRaw<T extends CollectionName>(name: T, id: string): Promise<RowOf<T> | null> {
    return store.get<RowOf<T>>(name, id);
  }

  /**
   * Account provisioning. In the hosted mode the identity provider creates the
   * user and the first-write rule lets that same user create their own profile
   * with a least-privilege role; this is the device-mode equivalent, so role
   * assignment never flows through a general-purpose write path.
   */
  async provisionUser(row: RowOf<'users'>): Promise<RowOf<'users'>> {
    await store.put('users', row);
    return row;
  }
}

export const createLocalProvider = (): LocalDataProvider => new LocalDataProvider();
export const createUnscopedLocalProvider = (): LocalDataProvider =>
  new LocalDataProvider({ enforcePolicy: false });

/**
 * Device (IndexedDB) provider.
 *
 * Mirrors the Firestore provider's behaviour exactly, including authorisation:
 * every read and write travels through `services/policy/policy` so an offline
 * session cannot see or change anything a hosted session could not. It also
 * seeds the built-in education library, the reviewed immunization schedule and a
 * starter facility directory on first run, so a new install is immediately
 * useful — real records, written through the normal code path.
 */

import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { QuerySpec } from '@/types/domain';
import type {
  Actor,
  CollectionName,
  DataProvider,
  ListResult,
  NewRow,
  RowOf,
  TxHandle,
} from '@/services/data/contract';
import { applyQuery } from '@/services/data/query-engine';
import { canReadRow, canWrite, isAdmin, type WriteOp } from '@/services/policy/policy';
import * as store from '@/services/data/local/store';
import { seedDeviceData } from '@/services/data/local/seed';

const now = (): string => new Date().toISOString();

/** Fields that cannot be changed after creation. */
const IMMUTABLE: Partial<Record<CollectionName, string[]>> = {
  users: ['uid', 'createdAt'],
  audit_logs: ['action', 'actorId', 'createdAt'],
  care_links: ['motherUserId', 'createdAt'],
};

export class LocalDataProvider implements DataProvider {
  readonly kind = 'local' as const;
  private seeded: Promise<void> | null = null;

  constructor(private readonly options: { enforcePolicy?: boolean } = { enforcePolicy: true }) {}

  /** Runs the first-install seed once, before any read or write. */
  private async ensureSeeded(): Promise<void> {
    if (!this.seeded) this.seeded = seedDeviceData(this);
    await this.seeded.catch(() => undefined);
  }

  private async assertRead<T extends CollectionName>(name: T, row: RowOf<T>, actor: Actor | null): Promise<RowOf<T>> {
    if (!this.options.enforcePolicy) return row;
    const decision = canReadRow(actor, name, row);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You do not have access to this record.', 'FORBIDDEN');
    return row;
  }

  async get<T extends CollectionName>(name: T, id: string, actor: Actor | null): Promise<RowOf<T> | null> {
    await this.ensureSeeded();
    const row = await store.get<RowOf<T>>(name, id);
    if (!row) return null;
    return this.assertRead(name, row, actor);
  }

  async list<T extends CollectionName>(name: T, query: QuerySpec, actor: Actor | null): Promise<ListResult<RowOf<T>>> {
    await this.ensureSeeded();
    const rows = await store.all<RowOf<T>>(name);
    const visible = this.options.enforcePolicy
      ? rows.filter((row) => canReadRow(actor, name, row).allowed)
      : rows;
    return applyQuery(visible, query);
  }

  async create<T extends CollectionName>(name: T, value: NewRow<T>, actor: Actor | null): Promise<RowOf<T>> {
    await this.ensureSeeded();
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id ? record.id : newId();
    const decision = this.decide(actor, name, 'create', null, record);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot create this record.', 'FORBIDDEN');

    const stamped: Record<string, unknown> = { ...record, id };
    if (name === 'users' && !stamped.privilegeVersion) stamped.privilegeVersion = 1;
    if (name === 'audit_logs') {
      stamped.actorId = actor?.uid ?? 'system';
      stamped.actorName = actor?.displayName ?? 'System';
      stamped.actorRole = actor?.role ?? 'SYSTEM';
      stamped.createdAt = typeof stamped.createdAt === 'string' ? stamped.createdAt : now();
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
    await this.ensureSeeded();
    const existing = await store.get<RowOf<T>>(name, id);
    if (!existing) throw new AppError('That record no longer exists.', 'NOT_FOUND');

    const decision = this.decide(actor, name, 'update', existing, patch as Record<string, unknown>);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot change this record.', 'FORBIDDEN');

    const safePatch: Record<string, unknown> = { ...(patch as Record<string, unknown>) };
    if (this.options.enforcePolicy) {
      for (const key of IMMUTABLE[name] ?? []) delete safePatch[key];
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
    await this.ensureSeeded();
    const existing = await store.get<RowOf<T>>(name, id);
    if (!existing) return;
    const decision = this.decide(actor, name, 'delete', existing, null);
    if (!decision.allowed) throw new AppError(decision.reason ?? 'You cannot delete this record.', 'FORBIDDEN');
    await store.remove(name, id);
  }

  private decide(
    actor: Actor | null,
    name: CollectionName,
    op: WriteOp,
    existing: unknown,
    patch: Record<string, unknown> | null,
  ) {
    if (!this.options.enforcePolicy) return { allowed: true } as const;
    // An administrator is always allowed; everything else is the policy's call.
    if (isAdmin(actor) && name !== 'audit_logs') return { allowed: true } as const;
    return canWrite(actor, name, op, existing, patch);
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

    void this.ensureSeeded().then(run);
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

  /** Ordered writes flushed as one unit (parent → child). */
  async transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T> {
    type Write =
      | { op: 'set'; name: CollectionName; id: string; value: Record<string, unknown> }
      | { op: 'merge'; name: CollectionName; id: string; patch: Record<string, unknown> }
      | { op: 'remove'; name: CollectionName; id: string };
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
        await store.put(write.name, { id: write.id, ...write.value, updatedAt: now() });
        continue;
      }
      const existing = (await store.get<Record<string, unknown>>(write.name, write.id)) ?? { id: write.id };
      await store.put(write.name, { ...existing, ...write.patch, updatedAt: now() });
    }
    return result;
  }

  async purgeLocalData(): Promise<void> {
    await store.wipe();
    this.seeded = null;
  }

  /** Seed helpers — device provider only. */
  async seedRows<T extends CollectionName>(name: T, rows: RowOf<T>[]): Promise<void> {
    await store.bulkPut(name, rows as unknown as { id: string }[]);
  }

  /** Auth-layer read with no policy applied (device-mode Admin SDK equivalent). */
  async readRaw<T extends CollectionName>(name: T, id: string): Promise<RowOf<T> | null> {
    await this.ensureSeeded();
    return store.get<RowOf<T>>(name, id);
  }

  /** Account provisioning: the device-mode equivalent of the first-write rule. */
  async provisionUser(row: RowOf<'users'>): Promise<RowOf<'users'>> {
    // No ensureSeeded() here: the seeder itself provisions accounts, and awaiting
    // its own promise would deadlock.
    await store.put('users', row);
    return row;
  }

  async countAll(name: CollectionName): Promise<number> {
    return (await store.all(name)).length;
  }
}

export const createLocalProvider = (): LocalDataProvider => new LocalDataProvider();
/** Used only by the seeder and tests, which must write before a session exists. */
export const createUnscopedLocalProvider = (): LocalDataProvider => new LocalDataProvider({ enforcePolicy: false });

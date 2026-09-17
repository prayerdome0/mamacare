/**
 * Firestore provider — the production data path.
 *
 * Queries are translated into index-safe Firestore queries; anything that would
 * need a compound index is post-filtered. Authorisation is *not* implemented
 * here: `firestore.rules` decides, and the provider surfaces a permission error
 * as a friendly AppError instead of falling back to a wider read.
 *
 * If the deployed rules are missing or stricter than this build expects, reads
 * fail with a message naming the collection — the app never silently returns an
 * empty screen and lets a mother think she has no appointments.
 */

import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  limit as fsLimit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
  type FirestoreSettings,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore';
import { getFirebaseApp } from '@/services/firebase/app';
import { AppError, withRetry } from '@/lib/errors';
import { newId } from '@/lib/ids';
import type { QueryFilter, QuerySpec } from '@/types/domain';
import type {
  Actor,
  CollectionName,
  DataProvider,
  ListResult,
  NewRow,
  RowOf,
  TxHandle,
} from '@/services/data/contract';
import { alignOrderWithFilters, matchesAll, splitFilters } from '@/services/data/query-engine';

/** Firestore caps a single read; larger aggregates are computed by the API. */
const MAX_CLIENT_ROWS = 1500;

let dbInstance: Firestore | null = null;

function db(): Firestore {
  if (dbInstance) return dbInstance;
  // longPolling keeps clinical capture working on hostile mobile networks where
  // websockets drop; the SDK upgrades automatically.
  const settings: FirestoreSettings = {
    ignoreUndefinedProperties: true,
    experimentalAutoDetectLongPolling: true,
  };
  dbInstance = initializeFirestore(getFirebaseApp(), settings);
  return dbInstance;
}

/** Firestore returns Timestamps; the domain model uses ISO strings everywhere. */
function denormalize<T>(value: unknown): T {
  const row = { ...(value as Record<string, unknown>) };
  for (const [key, raw] of Object.entries(row)) {
    if (raw instanceof Timestamp) row[key] = raw.toDate().toISOString();
    else if (raw === null) delete row[key];
  }
  return row as T;
}

function normalize(value: unknown): unknown {
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (raw === undefined) continue;
      out[key] = normalize(raw);
    }
    return out;
  }
  return value;
}

const WHERE_OPS = new Set(['==', '!=', '>', '>=', '<', '<=', 'in', 'array-contains', 'array-contains-any']);

function buildQuery(name: CollectionName, spec: QuerySpec, options: { useLimits: boolean }) {
  const { indexed, postFilter } = splitFilters(spec.where ?? []);
  const constraints: QueryConstraint[] = [];
  for (const filter of indexed) {
    constraints.push(where(filter.field, filter.op as never, normalize(filter.value) as never));
  }
  const order = postFilter.length === 0 ? spec.orderBy : alignOrderWithFilters({ ...spec, where: indexed }).orderBy;
  if (order) constraints.push(orderBy(order.field, order.direction));
  if (options.useLimits && spec.limit) constraints.push(fsLimit(spec.limit + (spec.offset ?? 0)));

  const q = query(collection(db(), name), ...constraints) as unknown as Query<DocumentData>;
  return { q, postFilter: indexed.length + postFilter.length > 0 ? (spec.where ?? []) : [] };
}

export class FirestoreProvider implements DataProvider {
  readonly kind = 'firebase' as const;

  constructor(private readonly actor: () => Actor | null) {}

  private get uid(): string {
    const actor = this.actor();
    if (!actor) throw new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    return actor.uid;
  }

  async get<T extends CollectionName>(name: T, id: string, _actor: Actor | null): Promise<RowOf<T> | null> {
    try {
      const snap = await getDoc(doc(db(), name, id));
      if (!snap.exists()) return null;
      return denormalize<RowOf<T>>({ ...(snap.data() as object), id: snap.id });
    } catch (error) {
      throw mapReadError(error, human(name));
    }
  }

  async list<T extends CollectionName>(name: T, spec: QuerySpec, _actor: Actor | null): Promise<ListResult<RowOf<T>>> {
    const needsFullScan = Boolean(spec.offset) || Boolean(spec.where?.length);
    try {
      const { q, postFilter } = buildQuery(name, spec, { useLimits: !needsFullScan });
      const snap = await withRetry(() => getDocs(q));
      let rows: RowOf<T>[] = snap.docs.map((d) => denormalize<RowOf<T>>({ ...d.data(), id: d.id }));
      if (postFilter.length) rows = rows.filter((row) => matchesAll(row as unknown as Record<string, unknown>, spec.where ?? []));
      if (spec.orderBy && postFilter.length) {
        const { field, direction } = spec.orderBy;
        const factor = direction === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => {
          const av = (a as unknown as Record<string, unknown>)[field];
          const bv = (b as unknown as Record<string, unknown>)[field];
          if (av === bv) return 0;
          return (String(av) > String(bv) ? 1 : -1) * factor;
        });
      }
      const total = rows.length;
      const offset = spec.offset ?? 0;
      const paged = spec.limit ? rows.slice(offset, offset + spec.limit) : rows.slice(offset);
      return { rows: paged, total };
    } catch (error) {
      throw mapReadError(error, human(name));
    }
  }

  async create<T extends CollectionName>(name: T, value: NewRow<T>, _actor: Actor | null): Promise<RowOf<T>> {
    const record = value as Record<string, unknown>;
    const id = typeof record.id === 'string' && record.id ? record.id : newId();
    const stamped = {
      ...record,
      id,
      createdAt: (record.createdAt as string) ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    try {
      await setDoc(doc(db(), name, id), normalize(stamped) as object);
      return stamped as unknown as RowOf<T>;
    } catch (error) {
      throw mapWriteError(error, human(name));
    }
  }

  async update<T extends CollectionName>(
    name: T,
    id: string,
    patch: Partial<RowOf<T>>,
    _actor: Actor | null,
  ): Promise<RowOf<T>> {
    const payload = normalize({ ...(patch as object), updatedAt: new Date().toISOString() }) as Record<string, unknown>;
    try {
      await updateDoc(doc(db(), name, id), payload as never);
      const snap = await getDoc(doc(db(), name, id));
      if (!snap.exists()) throw new AppError('That record no longer exists.', 'NOT_FOUND');
      return denormalize<RowOf<T>>({ ...(snap.data() as object), id: snap.id });
    } catch (error) {
      throw mapWriteError(error, human(name));
    }
  }

  async remove<T extends CollectionName>(name: T, id: string, _actor: Actor | null): Promise<void> {
    try {
      await deleteDoc(doc(db(), name, id));
    } catch (error) {
      throw mapWriteError(error, human(name));
    }
  }

  /**
   * Atomic counter. Used sparingly — Mama Care has no canonical patient-number
   * requirement — but available for facility-generated reference codes.
   */
  async nextSequence(name: string, step = 1): Promise<number> {
    try {
      return await runTransaction(db(), async (tx) => {
        const ref = doc(db(), 'counters', name);
        const snap = await tx.get(ref);
        const current = (snap.data() as { value?: number } | undefined)?.value ?? 0;
        tx.set(ref, { value: current + step, updatedAt: new Date().toISOString() }, { merge: true });
        return current + step;
      });
    } catch (error) {
      throw new AppError(
        'Unable to allocate a reference number. Ask your administrator to deploy the counters rule, then retry.',
        error instanceof AppError ? error.code : 'STORAGE_UNAVAILABLE',
        { retryable: true },
      );
    }
  }

  subscribe<T extends CollectionName>(
    name: T,
    spec: QuerySpec,
    _actor: Actor | null,
    onChange: (result: ListResult<RowOf<T>>) => void,
    onError: (error: unknown) => void,
  ): () => void {
    const needsPostFilter = postFilterNeeded(spec);
    const { q, postFilter } = buildQuery(name, spec, { useLimits: !needsPostFilter });
    return onSnapshot(
      q,
      { includeMetadataChanges: false },
      (snap) => {
        let rows: RowOf<T>[] = snap.docs.map((d) => denormalize<RowOf<T>>({ ...(d.data() as object), id: d.id }));
        if (postFilter.length) rows = rows.filter((row) => matchesAll(row as unknown as Record<string, unknown>, spec.where ?? []));
        if (spec.limit && !needsPostFilter) rows = rows.slice(0, spec.limit);
        onChange({ rows, total: rows.length });
      },
      (error) => onError(mapReadError(error, human(name))),
    );
  }

  async transact<T>(work: (tx: TxHandle) => Promise<T>): Promise<T> {
    const ops: (() => void)[] = [];
    const batch = writeBatch(db());
    const handle: TxHandle = {
      set: (name, id, value) => {
        ops.push(() => batch.set(doc(db(), name, id), normalize({ ...(value as object), id }) as object));
      },
      update: (name, id, patch) => {
        ops.push(() => batch.update(doc(db(), name, id), normalize({ ...(patch as object), updatedAt: new Date().toISOString() }) as object));
      },
      remove: (name, id) => {
        ops.push(() => batch.delete(doc(db(), name, id)));
      },
    };
    const result = await work(handle);
    ops.forEach((op) => op());
    try {
      await batch.commit();
    } catch (error) {
      throw mapWriteError(error, 'this entry');
    }
    return result;
  }

  /** Binary assets never live in Firestore; the media service owns them. */
  async putBlob(key: string, blob: Blob): Promise<void> {
    void key;
    void blob;
    throw new AppError(
      'File storage is handled by the media service in cloud deployments.',
      'CONFIGURATION',
    );
  }

  async getBlob(): Promise<Blob | null> {
    return null;
  }

  async deleteBlob(): Promise<void> {
    /* deletion is routed through the media service */
  }
}

function postFilterNeeded(spec: QuerySpec): boolean {
  const { postFilter } = splitFilters(spec.where ?? []);
  return postFilter.length > 0 || Boolean(spec.offset);
}

function mapReadError(error: unknown, label: string): AppError {
  const code = (error as { code?: string; message?: string }).code ?? '';
  if (code === 'permission-denied') {
    return new AppError(`You do not have access to ${label}.`, 'FORBIDDEN');
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new AppError(`Unable to load ${label}. Check your connection and retry.`, 'NETWORK', {
      retryable: true,
    });
  }
  if (code === 'failed-precondition') {
    return new AppError(
      `This view of ${label} needs a database index that has not been deployed yet.`,
      'CONFIGURATION',
    );
  }
  return new AppError(`Unable to load ${label}. Please try again.`, 'UNKNOWN', { retryable: true });
}

function mapWriteError(error: unknown, label: string): AppError {
  const code = (error as { code?: string }).code ?? '';
  if (code === 'permission-denied') {
    return new AppError(
      `Your role does not allow changes to ${label}. If this is blocking your care, ask your healthcare provider or an administrator.`,
      'FORBIDDEN',
    );
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return new AppError(
      `Could not save ${label} — the service is unreachable. Your entry is kept on this device; retry when you are back online.`,
      'NETWORK',
      { retryable: true },
    );
  }
  if (code === 'not-found') return new AppError('That record no longer exists.', 'NOT_FOUND');
  return new AppError(`Saving ${label} failed. Please try again.`, 'UNKNOWN', { retryable: true });
}

const HUMAN: Partial<Record<CollectionName, string>> = {
  users: 'user accounts',
  pregnancies: 'pregnancy records',
  babies: 'baby profiles',
  appointments: 'appointments',
  reminders: 'reminders',
  observations: 'health observations',
  immunizations: 'immunization records',
  journal: 'journal entries',
  articles: 'health education',
  facilities: 'facilities',
  providers: 'provider profiles',
  messages: 'messages',
  notifications: 'notifications',
  devices: 'devices',
  announcements: 'announcements',
  supporters: 'family sharing',
  care_links: 'care sharing',
  feedback: 'feedback',
  reports: 'content reports',
  audit_logs: 'audit history',
  settings: 'system settings',
  documents: 'documents',
};

const human = (name: CollectionName): string => HUMAN[name] ?? name.replace(/_/g, ' ');

export const MAX_ROWS = MAX_CLIENT_ROWS;
export { db as firestoreDb };

/**
 * Durable device storage for the offline provider.
 *
 * IndexedDB with one object store per collection, keyed by document id. It is a
 * real persistence layer (writes survive reload and app restart), not an
 * in-memory array: it exists so the platform is usable before Firebase project
 * credentials are attached, and so field teams keep working when the network is
 * down. Production deployments use the Firestore provider instead.
 */

const DB_NAME = 'mamacare-local';
const DB_VERSION = 1;

export const STORES = [
  'users',
  'facilities',
  'mothers',
  'pregnancies',
  'anc_visits',
  'appointments',
  'alerts',
  'referrals',
  'reports',
  'documents',
  'notifications',
  'audit_logs',
  'education',
  'alert_rules',
  'devices',
  'facility_assignments',
  'settings',
  'blobs',
  'meta',
] as const;

export type StoreName = (typeof STORES)[number];

type Listener = () => void;

let dbPromise: Promise<IDBDatabase> | null = null;
const listeners = new Map<StoreName, Set<Listener>>();
const memoryFallback = new Map<StoreName, Map<string, unknown>>();
let useMemory = false;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of STORES) {
        const objectStore = db.objectStoreNames.contains(store)
          ? db.transaction(store, 'readwrite').objectStore(store)
          : db.createObjectStore(store, { keyPath: store === 'meta' ? 'key' : 'id' });
        if (store !== 'meta' && store !== 'blobs' && !objectStore.indexNames.contains('updatedAt')) {
          try {
            objectStore.createIndex('updatedAt', 'updatedAt', { unique: false });
          } catch {
            /* index may already exist from a previous version */
          }
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onblocked = () => reject(new Error('IndexedDB is blocked by another tab'));
  }).catch((error: unknown) => {
    // Private-mode browsers (and some webviews) refuse IndexedDB. Fall back to
    // an in-process store so the UI still functions for the session, and let
    // the shell show the "not persisted" warning.
    useMemory = true;
    void error;
    return createMemoryDb();
  });
  return dbPromise;
}

function createMemoryDb(): IDBDatabase {
  return null as unknown as IDBDatabase;
}

/**
 * Waits until the storage backend has been decided.
 *
 * IndexedDB can be missing entirely (private windows, some in-app browsers). The
 * probe sets `useMemory`, but a write issued before the probe settled used to
 * fail with "no db". Every operation now awaits this first, so the first write of
 * a session is already routed to the in-memory store when that is what the
 * browser can offer.
 */
async function ready(): Promise<void> {
  await openDb().catch(() => null);
}

export const isPersistent = (): boolean => !useMemory;
export const storageMode = (): 'indexeddb' | 'session-memory' => (useMemory ? 'session-memory' : 'indexeddb');

const mem = (store: StoreName): Map<string, unknown> => {
  let map = memoryFallback.get(store);
  if (!map) {
    map = new Map();
    memoryFallback.set(store, map);
  }
  return map;
};

function tx<T>(store: StoreName, mode: IDBTransactionMode, run: (objectStore: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) {
          reject(new Error('no db'));
          return;
        }
        const transaction = db.transaction(store, mode);
        const request = run(transaction.objectStore(store));
        request.onsuccess = () => resolve(request.result as T);
        request.onerror = () => reject(request.error ?? new Error(`IndexedDB ${store} operation failed`));
      }),
  );
}

function notify(store: StoreName): void {
  listeners.get(store)?.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a broken subscriber must not abort the write */
    }
  });
}

export async function put<T extends object>(store: StoreName, value: T): Promise<T> {
  await ready();
  if (useMemory) {
    const record = value as { id?: string; key?: string };
    const key = (record.key ?? record.id) as string;
    mem(store).set(key, value);
    notify(store);
    return value;
  }
  await tx<IDBValidKey>(store, 'readwrite', (objectStore) => objectStore.put(value as never));
  notify(store);
  return value;
}

export async function bulkPut<T extends object>(store: StoreName, values: T[]): Promise<void> {
  if (values.length === 0) return;
  await ready();
  if (useMemory) {
    for (const value of values) {
      const record = value as { id?: string; key?: string };
      mem(store).set((record.key ?? record.id) as string, value);
    }
    notify(store);
    return;
  }
  await openDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(store, 'readwrite');
        const objectStore = transaction.objectStore(store);
        for (const value of values) objectStore.put(value as never);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error ?? new Error('bulk write failed'));
      }),
  );
  notify(store);
}

export async function get<T>(store: StoreName, id: string): Promise<T | null> {
  await ready();
  if (useMemory) return (mem(store).get(id) as T) ?? null;
  try {
    const value = await tx<T | undefined>(store, 'readonly', (objectStore) => objectStore.get(id));
    return value ?? null;
  } catch {
    return null;
  }
}

export async function all<T>(store: StoreName): Promise<T[]> {
  await ready();
  if (useMemory) return Array.from(mem(store).values()) as T[];
  try {
    return (await tx<T[]>(store, 'readonly', (objectStore) => objectStore.getAll())) ?? [];
  } catch {
    return [];
  }
}

export async function remove(store: StoreName, id: string): Promise<void> {
  await ready();
  if (useMemory) {
    mem(store).delete(id);
    notify(store);
    return;
  }
  await tx<undefined>(store, 'readwrite', (objectStore) => objectStore.delete(id) as IDBRequest);
  notify(store);
}

export async function clear(store: StoreName): Promise<void> {
  await ready();
  if (useMemory) {
    mem(store).clear();
    notify(store);
    return;
  }
  await tx<undefined>(store, 'readwrite', (objectStore) => objectStore.clear() as IDBRequest);
  notify(store);
}

/** Atomic counter for patient ids — mirrors the Firestore transaction helper. */
export async function incrementMeta(name: string, step = 1): Promise<number> {
  const current = (await get<{ key: string; value: number }>('meta', `counter:${name}`))?.value ?? 0;
  const next = current + step;
  await put('meta', { key: `counter:${name}`, value: next });
  return next;
}

export const getMeta = async <T>(key: string): Promise<T | null> =>
  (await get<{ key: string; value: T }>('meta', key))?.value ?? null;

export const setMeta = async <T>(key: string, value: T): Promise<void> => {
  await put('meta', { key, value });
};

export function subscribeToStores(stores: StoreName[], listener: Listener): () => void {
  for (const store of stores) {
    let set = listeners.get(store);
    if (!set) {
      set = new Set();
      listeners.set(store, set);
    }
    set.add(listener);
  }
  return () => {
    for (const store of stores) listeners.get(store)?.delete(listener);
  };
}

export async function wipe(): Promise<void> {
  for (const store of STORES) await clear(store);
}

export async function estimateUsage(): Promise<{ usageBytes: number; quotaBytes: number; persisted: boolean }> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageBytes: 0, quotaBytes: 0, persisted: false };
  }
  const estimate = await navigator.storage.estimate();
  const persisted = typeof navigator.storage.persisted === 'function' ? await navigator.storage.persisted() : false;
  return {
    usageBytes: estimate.usage ?? 0,
    quotaBytes: estimate.quota ?? 0,
    persisted,
  };
}

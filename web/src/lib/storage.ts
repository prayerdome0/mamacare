/**
 * Storage that never throws.
 *
 * `localStorage` / `sessionStorage` access throws a `SecurityError` in Safari
 * private browsing, when cookies are blocked, inside partitioned third-party
 * frames (an app preview iframe, an in-app browser) and under some corporate
 * policies. Reading it directly during a render — which is what the sign-in
 * screen did for its "keep me signed in" preference — takes the whole page to
 * the error boundary, which is exactly the "500" a user saw when they tried to
 * sign in.
 *
 * Everything in the app now goes through this module. Reads and writes fall back
 * to an in-process map, so a blocked storage API degrades the feature instead of
 * breaking the screen, and `storageAvailable()` lets the interface say so
 * plainly.
 */

type Area = 'local' | 'session';

const memory = new Map<string, string>();
let available: Record<Area, boolean | null> = { local: null, session: null };
let probed = false;

function backing(area: Area): Storage | null {
  try {
    const store = area === 'local' ? window.localStorage : window.sessionStorage;
    if (!store) return null;
    return store;
  } catch {
    return null;
  }
}

function probe(): void {
  if (probed) return;
  probed = true;
  for (const area of ['local', 'session'] as Area[]) {
    const store = backing(area);
    let works = false;
    if (store) {
      const key = '__mamacare_probe__';
      try {
        store.setItem(key, '1');
        store.removeItem(key);
        works = true;
      } catch {
        works = false;
      }
    }
    available[area] = works;
  }
}

export interface SafeStorage {
  readonly area: Area;
  get(key: string): string | null;
  set(key: string, value: string): boolean;
  remove(key: string): void;
  getJson<T>(key: string, fallback: T): T;
  setJson(key: string, value: unknown): boolean;
  /** False when the browser refuses real storage; the caller may warn the user. */
  readonly persistent: boolean;
}

function make(area: Area): SafeStorage {
  const prefix = `mamacare.${area}.`;
  return {
    area,
    get(key) {
      probe();
      const store = available[area] ? backing(area) : null;
      if (!store) return memory.get(prefix + key) ?? null;
      try {
        const value = store.getItem(key);
        return value ?? memory.get(prefix + key) ?? null;
      } catch {
        return memory.get(prefix + key) ?? null;
      }
    },
    set(key, value) {
      probe();
      memory.set(prefix + key, value);
      const store = available[area] ? backing(area) : null;
      if (!store) return false;
      try {
        store.setItem(key, value);
        return true;
      } catch {
        // Quota exceeded or storage blocked mid-session: the in-memory copy is
        // still correct for this page life, so the caller can continue.
        return false;
      }
    },
    remove(key) {
      probe();
      memory.delete(prefix + key);
      const store = available[area] ? backing(area) : null;
      try {
        store?.removeItem(key);
      } catch {
        /* nothing else to do */
      }
    },
    getJson<T>(key: string, fallback: T): T {
      const raw = this.get(key);
      if (raw === null) return fallback;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return fallback;
      }
    },
    setJson(key, value) {
      return this.set(key, JSON.stringify(value));
    },
    get persistent() {
      probe();
      return available[area] === true;
    },
  };
}

export const safeLocal = make('local');
export const safeSession = make('session');

/** True when the browser allows real persistent storage (not private/partitioned). */
export const storageAvailable = (): boolean => {
  probe();
  return available.local === true || available.session === true;
};

/** Test helper — clears the in-memory shadow copy. */
export const __resetStorageProbe = (): void => {
  probed = false;
  available = { local: null, session: null };
  memory.clear();
};

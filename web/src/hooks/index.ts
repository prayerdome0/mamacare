/**
 * Shared hooks.
 *
 * `useSession` lives in `providers/app-providers`; everything here is data
 * plumbing: async state with a retryable error, one-shot mutations with field
 * errors, live queries that re-run when the session changes, and small browser
 * helpers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppError, errorDisplay, toAppError } from '@/lib/errors';
import { safeLocal } from '@/lib/storage';
import { services } from '@/services/session-store';
import type { CollectionName, ListResult, RowOf } from '@/services/data/contract';
import type { QuerySpec } from '@/types/domain';
import { canReadCollection } from '@/services/policy/policy';

/* ── session shorthand ────────────────────────────────────────────────── */

export function useSessionState() {
  const registry = services();
  const [state, setState] = useState(() => registry.getState());
  useEffect(() => registry.subscribe(setState), [registry]);
  return {
    ...state,
    providerKind: registry.provider.kind,
    refresh: () => registry.refresh(),
    signOut: () => registry.signOut(),
  };
}

export function useActor() {
  return useSessionState().actor;
}

export function usePermissions() {
  return useSessionState().permissions;
}

/* ── async state ──────────────────────────────────────────────────────── */

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** Safe, user-facing message. `retryable` decides whether Retry is offered. */
  error: string | null;
  retryable: boolean;
  run: () => Promise<T | null>;
  setData: (value: T) => void;
  reset: () => void;
}

export function useAsync<T>(operation: () => Promise<T>, options: { immediate?: boolean; deps?: unknown[] } = {}): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(options.immediate));
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const mounted = useRef(true);
  const { immediate = true, deps = [] } = options;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (): Promise<T | null> => {
    setLoading(true);
    setError(null);
    try {
      const result = await operation();
      if (mounted.current) setData(result);
      return result;
    } catch (caught) {
      const display = errorDisplay(caught);
      if (mounted.current) {
        setError(display.message);
        setRetryable(display.retryable);
      }
      return null;
    } finally {
      if (mounted.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...deps]);

  return {
    data,
    loading,
    error,
    retryable,
    run,
    setData: (value: T) => setData(value),
    reset: () => {
      setData(null);
      setError(null);
    },
  };
}

/* ── mutations ────────────────────────────────────────────────────────── */

export function useMutation<Args extends unknown[], Result>(mutator: (...args: Args) => Promise<Result>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const submit = useCallback(
    async (...args: Args): Promise<{ ok: true; value: Result } | { ok: false; error: string }> => {
      setPending(true);
      setError(null);
      setFieldErrors({});
      try {
        const value = await mutator(...args);
        if (mounted.current) setPending(false);
        return { ok: true, value };
      } catch (caught) {
        const mapped = toAppError(caught);
        if (mounted.current) {
          setPending(false);
          if (mapped.fieldErrors) setFieldErrors(mapped.fieldErrors);
          setError(mapped.message);
        }
        return { ok: false, error: mapped.message };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mutator],
  );

  return { submit, pending, error, fieldErrors, clear: () => { setError(null); setFieldErrors({}); } };
}

/* ── live queries ─────────────────────────────────────────────────────── */

export interface LiveQueryState<T> {
  rows: T[];
  total: number;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Subscribes to a collection query. Falls back to a one-shot read when the
 * provider cannot keep a subscription alive (for example a rules denial on a
 * snapshot listener), so a screen degrades instead of spinning forever.
 */
export function useLiveQuery<T extends CollectionName>(
  name: T,
  spec: QuerySpec,
  options: { enabled?: boolean; deps?: unknown[] } = {},
): LiveQueryState<RowOf<T>> {
  const { enabled = true, deps = [] } = options;
  const registry = services();
  const [rows, setRows] = useState<RowOf<T>[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const specKey = useMemo(() => JSON.stringify(spec), [spec]);
  const actorUid = registry.actorRef()?.uid ?? null;

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!canReadCollection(registry.actorRef(), name)) {
      setRows([]);
      setTotal(0);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const unsubscribe = registry.data.subscribe(
      name,
      JSON.parse(specKey) as QuerySpec,
      (result: ListResult<RowOf<T>>) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
        setLoading(false);
      },
      (caught: unknown) => {
        if (cancelled) return;
        // The subscription failed; try a plain read so the screen still has data.
        void registry.data
          .list(name, JSON.parse(specKey) as QuerySpec)
          .then((result) => {
            if (cancelled) return;
            setRows(result.rows);
            setTotal(result.total);
            setLoading(false);
          })
          .catch((second: unknown) => {
            if (cancelled) return;
            const display = errorDisplay(second ?? caught);
            setError(display.message);
            setRows([]);
            setLoading(false);
          });
      },
    );

    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, specKey, enabled, tick, actorUid, ...deps]);

  return { rows, total, loading, error, refresh: () => setTick((value) => value + 1) };
}

/* ── small browser helpers ────────────────────────────────────────────── */

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handle);
  }, [value, delay]);
  return debounced;
}

export function useLocalState<T>(key: string, initial: T): [T, (value: T | ((current: T) => T)) => void] {
  const [state, setState] = useState<T>(() => safeLocal.getJson<T>(key, initial));
  const update = useCallback(
    (value: T | ((current: T) => T)) => {
      setState((current) => {
        const next = typeof value === 'function' ? (value as (current: T) => T)(current) : value;
        safeLocal.setJson(key, next);
        return next;
      });
    },
    [key],
  );
  return [state, update];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const list = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(list.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/** Warns before a browser navigates away from a dirty form. */
export function useUnsavedChanges(dirty: boolean, message = 'You have unsaved changes. Leave this page?'): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, message]);
}

/** Periodically re-checks reminders while the app is open. */
export function useReminderScheduler(enabled: boolean, intervalMs = 60_000): { lastRun: Date | null; created: number } {
  const [lastRun, setLastRun] = useState<Date | null>(null);
  const [created, setCreated] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const run = async (): Promise<void> => {
      const registry = services();
      const actor = registry.actorRef();
      if (!actor || cancelled) return;
      if (actor.role !== 'MOTHER' && actor.role !== 'SUPPORTER') return;
      try {
        const { runReminderScheduler } = await import('@/services/reminders');
        const notifications = await runReminderScheduler(actor.uid, actor.notificationPrefs);
        if (cancelled) return;
        setLastRun(new Date());
        if (notifications.length > 0) {
          setCreated((value) => value + notifications.length);
          window.dispatchEvent(new CustomEvent('mamacare:reminders', { detail: notifications }));
        }
      } catch (error) {
        if (error instanceof AppError) return;
      }
    };

    void run();
    const handle = setInterval(run, intervalMs);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void run();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, intervalMs]);

  return { lastRun, created };
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppError, errorDisplay, toAppError } from '@/lib/errors';
import { services } from '@/services/session-store';
import type { CollectionName, ListResult, RowOf } from '@/services/data/contract';
import type { QuerySpec } from '@/types/domain';
import type { LiveQuery } from '@/types/domain';

/* ── session ─────────────────────────────────────────────────────────── */

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

/* ── async operation with loading / error / retry ────────────────────── */

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  /** Safe, user-facing message. `retryable` decides whether a Retry control is offered. */
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

/** One-shot submit with busy state, error mapping and success reset. */
export function useMutation<Args extends unknown[], Result>(mutator: (...args: Args) => Promise<Result>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

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
          setError(mapped.message);
          if (mapped.fieldErrors) setFieldErrors(mapped.fieldErrors);
        }
        return { ok: false, error: mapped.message };
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return { submit, pending, error, fieldErrors, setError, clearError: () => setError(null) };
}

/* ── live collection subscription ───────────────────────────────────── */

export function useLiveQuery<T extends CollectionName>(name: T, spec: QuerySpec, options: { enabled?: boolean } = {}): LiveQuery<RowOf<T>> {
  const registry = services();
  const actor = useActor();
  const enabled = options.enabled !== false;
  const specKey = useMemo(() => JSON.stringify(spec), [spec]);
  const [state, setState] = useState<{ data: RowOf<T>[]; loading: boolean; error: string | null; total: number }>({
    data: [],
    loading: enabled,
    error: null,
    total: 0,
  });

  const runOnce = useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }
    try {
      const result = await registry.provider.list(name, JSON.parse(specKey) as QuerySpec, actor);
      setState({ data: result.rows, loading: false, error: null, total: result.total });
    } catch (caught) {
      setState((prev) => ({ ...prev, loading: false, error: errorDisplay(caught).message }));
    }
  }, [registry, name, specKey, enabled, actor]);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setState((prev) => ({ ...prev, loading: prev.data.length === 0 }));
    const unsubscribe = registry.provider.subscribe(
      name,
      JSON.parse(specKey) as QuerySpec,
      actor,
      (result: ListResult<RowOf<T>>) => {
        if (alive) setState({ data: result.rows, loading: false, error: null, total: result.total });
      },
      (error: unknown) => {
        if (alive) setState((prev) => ({ ...prev, loading: false, error: errorDisplay(error).message }));
      },
    );
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [registry, name, specKey, actor, enabled]);

  return { data: state.data, loading: state.loading, error: state.error, total: state.total, refresh: () => void runOnce() };
}

/* ── misc ────────────────────────────────────────────────────────────── */

export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useLocalState<T>(key: string, initial: T): [T, (value: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (value: T) => T)(current) : next;
        try {
          localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          /* storage quota or private mode — state still works in memory */
        }
        return resolved;
      });
    },
    [key],
  );
  return [value, update];
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches));
  useEffect(() => {
    const listener = window.matchMedia(query);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    setMatches(listener.matches);
    listener.addEventListener('change', handler);
    return () => listener.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/** Blocks navigation away while a clinical form has unsaved entries. */
export function useUnsavedChanges(dirty: boolean, message = 'You have unsaved clinical entries.'): void {
  useEffect(() => {
    if (!dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty, message]);
}

export const assertAllowed = (allowed: boolean, message: string): void => {
  if (!allowed) throw new AppError(message, 'FORBIDDEN');
};

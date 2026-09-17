/**
 * Application providers.
 *
 * Three contexts wrap the whole app: toasts, a promise-based confirm dialog, and
 * the session. The session context is the only place that talks to the session
 * store, so screens never import the registry directly and can be rendered in a
 * test with a fake provider.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { app, integrations } from '@/config/env';
import { services, type SessionState } from '@/services/session-store';
import type { Actor } from '@/services/data/contract';
import type { UiPermissions } from '@/services/policy/policy';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/overlay';
import { NoticeState } from '@/components/ui/display';

/* ── session ──────────────────────────────────────────────────────────── */

export interface SessionContextValue extends SessionState {
  ready: boolean;
  providerKind: 'firebase' | 'local';
  signIn: (email: string, password: string, remember?: boolean) => Promise<Actor>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  syncRole: () => Promise<{ synced: boolean; reason: string | null }>;
  configurationWarning: string | null;
  offline: boolean;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <AppProviders>.');
  return context;
}

/** Convenience for screens that only need the signed-in identity. */
export function useMe(): Actor | null {
  return useSession().actor;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const registry = services();
  const [state, setState] = useState<SessionState>(() => registry.getState());
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false);
  const toast = useToast();

  useEffect(() => registry.subscribe(setState), [registry]);

  useEffect(() => {
    void registry.initialise();
  }, [registry]);

  useEffect(() => {
    const online = (): void => setOffline(false);
    const gone = (): void => setOffline(true);
    window.addEventListener('online', online);
    window.addEventListener('offline', gone);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', gone);
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string, remember = true) => {
      const actor = await registry.signIn(email, password, remember);
      toast.success('Signed in', `Welcome back, ${actor.displayName || actor.email}.`);
      return actor;
    },
    [registry, toast],
  );

  const signOut = useCallback(async () => {
    await registry.signOut();
    toast.info('Signed out');
  }, [registry, toast]);

  const syncRole = useCallback(() => registry.syncRole(), [registry]);

  const configurationWarning = useMemo(() => {
    if (state.configurationError) return state.configurationError;
    if (registry.provider.kind === 'local') {
      return `Records are being stored on this device (${integrations.firebase.configured ? 'Firebase did not start' : 'Firebase is not configured'}). Everything works, but data stays in this browser until you connect the Firebase project.`;
    }
    if (!integrations.cloudinary.configured) {
      return 'Cloudinary is not configured, so uploaded files stay on this device only.';
    }
    return null;
  }, [state.configurationError, registry.provider.kind]);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      ready: state.status !== 'initialising',
      providerKind: registry.provider.kind,
      signIn,
      signOut,
      refresh: () => registry.refresh(),
      syncRole,
      configurationWarning,
      offline,
    }),
    [state, registry, signIn, signOut, syncRole, configurationWarning, offline],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ── confirm dialog ───────────────────────────────────────────────────── */

interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  resolve: (confirmed: boolean) => void;
}

const ConfirmContext = createContext<((options: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>) | null>(null);

export function useConfirm(): (options: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean> {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used inside <AppProviders>.');
  return context;
}

function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  const confirm = useCallback(
    (options: Omit<ConfirmRequest, 'resolve'>) =>
      new Promise<boolean>((resolve) => {
        setRequest({ ...options, resolve });
      }),
    [],
  );

  const close = useCallback(
    (confirmed: boolean) => {
      request?.resolve(confirmed);
      setRequest(null);
    },
    [request],
  );

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <ConfirmDialog
        open={request !== null}
        title={request?.title ?? ''}
        message={request?.message}
        confirmLabel={request?.confirmLabel}
        cancelLabel={request?.cancelLabel}
        tone={request?.tone}
        onConfirm={() => close(true)}
        onCancel={() => close(false)}
      />
    </ConfirmContext.Provider>
  );
}

/* ── notices ──────────────────────────────────────────────────────────── */

/**
 * Shown at the top of the app when the deployment is storing data on the device,
 * or when the browser is offline. Dismissible, but it comes back on the next load
 * — a mother should never think her records are in the cloud when they are not.
 */
export function ConfigurationNotice({ className }: { className?: string }) {
  const { configurationWarning, offline } = useSession();
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (!configurationWarning && !offline) return null;

  return (
    <div className={className}>
      {offline ? (
        <NoticeState tone="warning" title="You are offline" dismissible onDismiss={() => setDismissed(true)}>
          Saved appointments, reminders, baby information and any education you have already opened stay available.
          New changes are kept on this device and will need a connection to reach the cloud.
        </NoticeState>
      ) : null}
      {configurationWarning && !offline ? (
        <NoticeState tone="info" title={`Storing on this device · ${app.name}`} dismissible onDismiss={() => setDismissed(true)}>
          {configurationWarning}
        </NoticeState>
      ) : null}
    </div>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <SessionProvider>{children}</SessionProvider>
      </ConfirmProvider>
    </ToastProvider>
  );
}

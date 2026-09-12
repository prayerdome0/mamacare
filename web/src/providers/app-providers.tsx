import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { integrations, misconfigured } from '@/config/env';
import { services, type SessionState } from '@/services/session-store';
import type { Actor } from '@/services/data/contract';
import type { UiPermissions } from '@/services/policy/policy';
import { ToastProvider, useToast } from '@/components/ui/toast';
import { ConfirmDialog } from '@/components/ui/overlay';
import { NoticeState } from '@/components/ui/display';

/* ── session context ─────────────────────────────────────────────────── */

export interface SessionContextValue extends SessionState {
  actor: Actor | null;
  permissions: UiPermissions;
  ready: boolean;
  providerKind: 'firebase' | 'local';
  signIn: (email: string, password: string, remember?: boolean) => Promise<Actor>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  configurationWarning: string | null;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside <AppProviders>.');
  return context;
}

function SessionProvider({ children }: { children: ReactNode }) {
  const registry = services();
  const [state, setState] = useState<SessionState>(() => registry.getState());
  const toast = useToast();

  useEffect(() => registry.subscribe(setState), [registry]);

  useEffect(() => {
    void registry.initialise();
  }, [registry]);

  const signIn = useCallback(
    async (email: string, password: string, remember = true) => {
      const actor = await registry.signIn(email, password, remember);
      toast.success('Signed in', `Welcome back, ${actor.displayName ?? actor.email}.`);
      return actor;
    },
    [registry, toast],
  );

  const signOut = useCallback(async () => {
    await registry.signOut();
    toast.info('Signed out');
  }, [registry, toast]);

  const configurationWarning = useMemo(() => {
    if (misconfigured) {
      return 'Firebase project configuration is incomplete, so the app is storing records on this device. Add the VITE_FIREBASE_* values from your Firebase project to web/.env.local, or run the API service for signed uploads.';
    }
    if (!integrations.cloudinary.configured) {
      return 'Cloudinary is not configured, so uploaded files are kept on this device only. Set the public environment variables described in web/.env.example.';
    }
    return null;
  }, []);

  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      ready: state.status !== 'initialising',
      providerKind: registry.provider.kind,
      signIn,
      signOut,
      refresh: () => registry.refresh(),
      configurationWarning,
    }),
    [state, registry, signIn, signOut, configurationWarning],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/* ── confirm dialog ─────────────────────────────────────────────────── */

interface ConfirmRequest {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'primary' | 'danger';
  resolve: (confirmed: boolean) => void;
}

const ConfirmContext = createContext<((options: Omit<ConfirmRequest, 'resolve'>) => Promise<boolean>) | null>(null);

export function useConfirm() {
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

/* ── integration notices ────────────────────────────────────────────── */

export function ConfigurationNotice({ className }: { className?: string }) {
  const { configurationWarning } = useSession();
  const [dismissed, setDismissed] = useState(false);
  if (!configurationWarning || dismissed) return null;
  return (
    <div className={className}>
      <NoticeState
        tone="warning"
        title="Integration setup incomplete"
        dismissible
        onDismiss={() => setDismissed(true)}
      >
        {configurationWarning}
      </NoticeState>
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

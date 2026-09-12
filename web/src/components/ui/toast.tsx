import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AppError } from '@/lib/errors';
import { errorDisplay } from '@/lib/errors';

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  duration: number;
}

interface ToastApi {
  push: (toast: Omit<Toast, 'id' | 'duration'> & { duration?: number }) => string;
  success: (title: string, description?: string) => void;
  error: (error: unknown, fallbackTitle?: string) => void;
  info: (title: string, description?: string) => void;
  warning: (title: string, description?: string) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastTone, ReactNode> = {
  success: <CheckCircle2 className="size-4 text-[var(--color-risk-green-text)]" aria-hidden />,
  error: <XCircle className="size-4 text-[var(--color-risk-red-text)]" aria-hidden />,
  warning: <AlertTriangle className="size-4 text-[var(--color-risk-amber-text)]" aria-hidden />,
  info: <Info className="size-4 text-brand-700" aria-hidden />,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback<ToastApi['push']>(
    (toast) => {
      const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const next: Toast = { duration: toast.tone === 'error' ? 9000 : 5000, ...toast, id };
      setToasts((current) => [...current.slice(-3), next]);
      return id;
    },
    [],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      dismiss,
      success: (title, description) => push({ tone: 'success', title, description }),
      warning: (title, description) => push({ tone: 'warning', title, description }),
      info: (title, description) => push({ tone: 'info', title, description }),
      error: (error, fallbackTitle = 'Something went wrong') => {
        const display = errorDisplay(error);
        const forbidden = error instanceof AppError && error.code === 'FORBIDDEN';
        push({
          tone: 'error',
          title: forbidden ? 'Not permitted' : fallbackTitle,
          description: display.message,
          actionLabel: display.retryable ? 'Retry' : undefined,
          onAction: display.retryable ? () => window.location.reload() : undefined,
        });
      },
    }),
    [push, dismiss],
  );

  return <ToastContext.Provider value={api}>{children}<ToastViewport toasts={toasts} onDismiss={dismiss} /></ToastContext.Provider>;
}

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-3 sm:items-end sm:p-5" role="region" aria-label="Notifications">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => window.clearTimeout(timer);
  }, [toast.id, toast.duration, onDismiss]);

  return (
    <div
      className={cn(
        'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border bg-white p-3.5 shadow-[var(--shadow-pop)]',
        'animate-[toast-in_180ms_ease-out]',
        toast.tone === 'error' ? 'border-[var(--color-risk-red-border)]' : toast.tone === 'warning' ? 'border-[var(--color-risk-amber-border)]' : toast.tone === 'success' ? 'border-[var(--color-risk-green-border)]' : 'border-ink-200',
      )}
      role={toast.tone === 'error' ? 'alert' : 'status'}
    >
      <span className="mt-0.5 shrink-0">{ICONS[toast.tone]}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[0.86rem] font-semibold text-ink-900">{toast.title}</p>
        {toast.description ? <p className="mt-0.5 text-[0.82rem] leading-snug text-ink-600">{toast.description}</p> : null}
        {toast.actionLabel && toast.onAction ? (
          <button
            type="button"
            onClick={() => {
              toast.onAction?.();
              onDismiss(toast.id);
            }}
            className="mt-1.5 text-xs font-semibold text-brand-800 underline decoration-brand-300 underline-offset-2 hover:text-brand-900"
          >
            {toast.actionLabel}
          </button>
        ) : null}
      </div>
      <button type="button" onClick={() => onDismiss(toast.id)} className="-mt-1 -mr-1 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" aria-label="Dismiss notification">
        <X className="size-4" />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>.');
  return context;
}

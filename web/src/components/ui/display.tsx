import type { ReactNode } from 'react';
import { AlertTriangle, Check, CircleDot, Clock, Loader2, RefreshCw, ShieldAlert, X, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RiskLevel } from '@/types/domain';
import { Button } from '@/components/ui/button';

export function Badge({
  children,
  tone = 'neutral',
  className,
  icon,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'purple';
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <span className={cn('badge', `badge-${tone}`, className)}>
      {icon}
      {children}
    </span>
  );
}

const RISK_TONE: Record<RiskLevel, { tone: 'red' | 'amber' | 'green'; label: string }> = {
  RED: { tone: 'red', label: 'Red risk' },
  AMBER: { tone: 'amber', label: 'Amber risk' },
  GREEN: { tone: 'green', label: 'Stable' },
};

export function RiskBadge({ level, short }: { level: RiskLevel; short?: boolean }) {
  const config = RISK_TONE[level];
  return (
    <Badge tone={config.tone} icon={<CircleDot className="size-3" aria-hidden />}>
      {short ? config.label.split(' ')[0] : config.label}
    </Badge>
  );
}

export function AlertLevelBadge({ level }: { level: Extract<RiskLevel, 'RED' | 'AMBER' | 'GREEN'> }) {
  const tone = level === 'RED' ? 'red' : level === 'AMBER' ? 'amber' : 'green';
  return (
    <Badge tone={tone} icon={level === 'GREEN' ? <Check className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}>
      {level}
    </Badge>
  );
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const normalised = status.toUpperCase();
  const tone =
    ['OPEN', 'ACTIVE', 'SCHEDULED', 'AWAITING_CONFIRMATION', 'DRAFT', 'PENDING'].includes(normalised)
      ? 'blue'
      : ['CONFIRMED', 'ARRIVED', 'IN_PROGRESS', 'GENERATING', 'SENT', 'ACKNOWLEDGED'].includes(normalised)
        ? 'amber'
        : ['RESOLVED', 'CLOSED', 'DELIVERED', 'COMPLETED', 'ARRANGED', 'RECEIVED'].includes(normalised)
          ? 'green'
          : ['MISSED', 'UNSCHEDULED', 'CANCELLED', 'NEEDS_REVIEW', 'FAILED', 'SUSPENDED', 'PENDING_APPROVAL'].includes(normalised)
            ? 'red'
            : 'neutral';
  return <Badge tone={tone}>{label ?? normalised.replace(/_/g, ' ')}</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />;
}

export function LoadingRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} role="status" aria-live="polite">
      <span className="sr-only">Loading records…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="skeleton h-12 w-full rounded-lg" />
      ))}
    </div>
  );
}

export function InlineSpinner({ label = 'Working…' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-500" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </span>
  );
}

export function ProgressBar({
  value,
  max = 100,
  tone = 'brand',
  label,
  showValue = true,
  size = 'md',
  className,
}: {
  value: number;
  max?: number;
  tone?: 'brand' | 'red' | 'amber' | 'green';
  label?: ReactNode;
  showValue?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, Math.round((value / (max || 1)) * 100)));
  const fill = { brand: 'bg-brand-700', red: 'bg-[var(--color-risk-red)]', amber: 'bg-[var(--color-risk-amber)]', green: 'bg-[var(--color-risk-green)]' }[tone];
  return (
    <div className={className}>
      {label || showValue ? (
        <div className="mb-1.5 flex items-center justify-between gap-3">
          {label ? <span className="text-xs font-medium text-ink-600">{label}</span> : <span />}
          {showValue ? <span className="micro tnum text-ink-500">{pct}%</span> : null}
        </div>
      ) : null}
      <div
        className={cn('w-full overflow-hidden rounded-full bg-ink-200', size === 'sm' ? 'h-1.5' : 'h-2.5')}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={typeof label === 'string' ? label : 'Progress'}
      >
        <div className={cn('h-full rounded-full transition-all duration-500', fill)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 px-6 py-12 text-center', className)}>
      <span className="grid size-11 place-items-center rounded-xl bg-ink-100 text-ink-400">{icon ?? <CircleDot className="size-5" aria-hidden />}</span>
      <div className="max-w-md">
        <h3 className="h3">{title}</h3>
        {description ? <p className="muted mt-1.5">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  message,
  retryable = true,
  onRetry,
  compact,
  title = 'This did not load',
  className,
}: {
  message: string;
  retryable?: boolean;
  onRetry?: () => void;
  compact?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <div className={cn('alert alert-error', compact ? 'p-3' : 'p-4', className)} role="alert">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[0.86rem] font-semibold">{title}</p>
        <p className="mt-0.5 text-[0.84rem] leading-relaxed text-ink-700">{message}</p>
        {onRetry && retryable ? (
          <Button variant="secondary" size="sm" className="mt-2.5" onClick={onRetry} icon={<RefreshCw className="size-3.5" aria-hidden />}>
            Try again
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function NoticeState({
  tone = 'info',
  title,
  children,
  actions,
  dismissible,
  onDismiss,
  compact,
  className,
}: {
  tone?: 'info' | 'warning' | 'success' | 'error';
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  dismissible?: boolean;
  onDismiss?: () => void;
  compact?: boolean;
  className?: string;
}) {
  const map = {
    info: { className: 'alert alert-info', icon: <CircleDot className="mt-0.5 size-4 shrink-0" aria-hidden /> },
    warning: { className: 'alert alert-warning', icon: <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden /> },
    success: { className: 'alert alert-success', icon: <Check className="mt-0.5 size-4 shrink-0" aria-hidden /> },
    error: { className: 'alert alert-error', icon: <XCircle className="mt-0.5 size-4 shrink-0" aria-hidden /> },
  } as const;
  return (
    <div
      className={cn('flex items-start gap-2.5', compact ? 'p-3' : 'p-3.5', map[tone].className, className)}
      role={tone === 'error' ? 'alert' : 'status'}
    >
      {map[tone].icon}
      <div className="min-w-0 flex-1">
        <p className="text-[0.86rem] font-semibold">{title}</p>
        {children ? <div className="mt-1 text-[0.84rem] leading-relaxed text-ink-700">{children}</div> : null}
        {actions ? <div className="mt-2.5 flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {dismissible ? (
        <button type="button" onClick={onDismiss} className="rounded p-1 text-ink-400 hover:bg-white/70 hover:text-ink-700" aria-label="Dismiss">
          <X className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export function GuardState({
  state,
  error,
  onRetry,
  empty,
  children,
  skeletonRows,
}: {
  state: 'loading' | 'ready' | 'error';
  error?: string | null;
  onRetry?: () => void;
  empty?: ReactNode;
  children: ReactNode;
  skeletonRows?: number;
}) {
  if (state === 'loading') return <LoadingRows rows={skeletonRows ?? 3} />;
  if (state === 'error') return <ErrorState message={error ?? 'Unexpected error.'} onRetry={onRetry} />;
  return <>{empty !== undefined && empty !== null ? empty : children}</>;
}

export function Avatar({ name, src, size = 'md' }: { name: string; src?: string | null; size?: 'xs' | 'sm' | 'md' | 'lg' }) {
  const dimension = { xs: 'size-6 text-[0.6rem]', sm: 'size-8 text-[0.68rem]', md: 'size-10 text-xs', lg: 'size-14 text-sm' }[size];
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
  if (src) {
    return <img src={src} alt="" className={cn('shrink-0 rounded-full object-cover ring-1 ring-ink-200', dimension)} loading="lazy" />;
  }
  return (
    <span className={cn('grid shrink-0 place-items-center rounded-full bg-brand-100 font-bold text-brand-900 ring-1 ring-brand-200', dimension)} aria-hidden>
      {initials || <CircleDot className="size-3.5" />}
    </span>
  );
}

export function TimeRemaining({ due, className }: { due: string; className?: string }) {
  const days = Math.round((new Date(due).getTime() - Date.now()) / 86_400_000);
  const overdue = days < 0;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', overdue ? 'text-[var(--color-risk-red-text)]' : 'text-ink-500', className)}>
      <Clock className="size-3.5" aria-hidden />
      {overdue ? `${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} overdue` : days === 0 ? 'Due today' : `in ${days} day${days === 1 ? '' : 's'}`}
    </span>
  );
}

export function ThreatIcon({ level, className }: { level: RiskLevel; className?: string }) {
  return level === 'RED' ? (
    <ShieldAlert className={cn('text-[var(--color-risk-red-text)]', className)} aria-hidden />
  ) : level === 'AMBER' ? (
    <AlertTriangle className={cn('text-[var(--color-risk-amber-text)]', className)} aria-hidden />
  ) : (
    <Check className={cn('text-[var(--color-risk-green-text)]', className)} aria-hidden />
  );
}

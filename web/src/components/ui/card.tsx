import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { CountUp } from '@/components/ui/count-up';

export function Card({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
  as: Tag = 'section',
  onClick,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  as?: 'section' | 'div' | 'article' | 'aside';
  onClick?: () => void;
}) {
  const hasHeader = title !== undefined || actions !== undefined || description !== undefined;
  return (
    <Tag
      className={cn('card overflow-hidden', className)}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
    >
      {hasHeader ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-ink-200 bg-white px-4 py-3.5 sm:px-5">
          <div className="min-w-0">
            {title ? <h3 className="h3 truncate">{title}</h3> : null}
            {description ? <p className="muted mt-0.5 max-w-prose">{description}</p> : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn('card-pad', bodyClassName)}>{children}</div>
    </Tag>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  onClick,
  loading,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'default' | 'brand' | 'red' | 'amber' | 'green';
  icon?: ReactNode;
  onClick?: () => void;
  loading?: boolean;
}) {
  const toneClass = {
    default: 'border-ink-200 bg-white',
    brand: 'border-brand-200 bg-brand-50/50',
    red: 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]',
    amber: 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]',
    green: 'border-[var(--color-risk-green-border)] bg-[var(--color-risk-green-soft)]',
  }[tone];

  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'card flex w-full flex-col gap-1 p-4 text-left transition-shadow',
        toneClass,
        onClick && 'hover:shadow-[var(--shadow-pop)] focus-visible:ring-2 focus-visible:ring-brand-600/40',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="micro">{label}</span>
        {icon ? <span aria-hidden className="text-ink-400">{icon}</span> : null}
      </div>
      {loading ? (
        <span className="skeleton mt-1 block h-8 w-16" />
      ) : typeof value === 'number' ? (
        /* Numeric tiles count up from zero once they scroll into view. The value
           is always a real count from a query — never a decorative number. */
        <CountUp value={value} className="text-2xl font-bold tracking-tight text-ink-900" durationMs={800} />
      ) : (
        <span className="text-2xl font-bold tracking-tight text-ink-900 tnum">{value}</span>
      )}
      {hint ? <span className="mt-0.5 text-xs leading-snug text-ink-500">{hint}</span> : null}
    </Wrapper>
  );
}

export function KeyValue({
  items,
  columns = 2,
  dense,
}: {
  items: { label: string; value: ReactNode; tone?: 'default' | 'muted' | 'strong' }[];
  columns?: 1 | 2 | 3;
  dense?: boolean;
}) {
  return (
    <dl
      className={cn(
        'grid gap-x-6 gap-y-3',
        columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3',
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="micro">{item.label}</dt>
          <dd
            className={cn(
              'mt-0.5 break-words',
              dense ? 'text-[0.86rem]' : 'text-[0.92rem]',
              item.tone === 'strong' ? 'font-semibold text-ink-900' : item.tone === 'muted' ? 'text-ink-500' : 'text-ink-800',
            )}
          >
            {item.value ?? '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'left',
  actions,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: 'left' | 'center';
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        align === 'center' ? 'items-center text-center' : 'sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'mx-auto')}>
        {eyebrow ? <p className="section-eyebrow mb-2">{eyebrow}</p> : null}
        <h2 className="display-2">{title}</h2>
        {description ? <p className="lede mt-3">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

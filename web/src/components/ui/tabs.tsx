import { type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface TabItem {
  id: string;
  label: string;
  icon?: ReactNode;
  count?: number | string;
  tone?: 'default' | 'red' | 'amber';
}

export function Tabs({
  items,
  value,
  onChange,
  ariaLabel = 'Sections',
}: {
  items: TabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="tabs-scroll -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <div className="flex min-w-max gap-1 border-b border-ink-200">
        {items.map((item) => {
          const active = item.id === value;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`tab-${item.id}`}
              aria-selected={active}
              aria-controls={`panel-${item.id}`}
              tabIndex={active ? 0 : -1}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => {
                const index = items.findIndex((candidate) => candidate.id === item.id);
                if (event.key === 'ArrowRight') onChange(items[(index + 1) % items.length]!.id);
                if (event.key === 'ArrowLeft') onChange(items[(index - 1 + items.length) % items.length]!.id);
              }}
              className={cn('tab', active && 'tab-active', item.tone === 'red' && !active && 'text-[var(--color-risk-red-text)]')}
            >
              {item.icon}
              {item.label}
              {item.count !== undefined && item.count !== 0 ? (
                <span className={cn('tab-count', active && 'bg-brand-700 text-white', item.tone === 'red' && !active && 'bg-[var(--color-risk-red)] text-white')}>
                  {item.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function TabPanel({ id, active, children }: { id: string; active: boolean; children: ReactNode }) {
  if (!active) return null;
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} tabIndex={-1}>
      {children}
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  ariaLabel,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="inline-flex flex-wrap gap-1 rounded-lg border border-ink-200 bg-white p-1">
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn('rounded-md font-semibold transition-colors', size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-[0.82rem]', active ? 'bg-brand-700 text-white shadow-[var(--shadow-card)]' : 'text-ink-600 hover:bg-ink-100')}
          >
            {option.label}
            {option.count !== undefined ? <span className={cn('ml-1.5 tnum', active ? 'text-brand-100' : 'text-ink-400')}>{option.count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: { title: ReactNode; meta?: ReactNode; detail?: ReactNode; tone?: 'default' | 'red' | 'amber' | 'green' | 'brand'; icon?: ReactNode }[];
}) {
  return (
    <ol className="relative space-y-4 pl-6">
      <span className="absolute top-1.5 bottom-1.5 left-[0.4rem] w-px bg-ink-200" aria-hidden />
      {items.map((item, index) => (
        <li key={index} className="relative">
          <span
            className={cn(
              'absolute top-1 -left-6 grid size-3.5 place-items-center rounded-full ring-4 ring-white',
              item.tone === 'red' ? 'bg-[var(--color-risk-red)]' : item.tone === 'amber' ? 'bg-[var(--color-risk-amber)]' : item.tone === 'green' ? 'bg-[var(--color-risk-green)]' : item.tone === 'brand' ? 'bg-brand-700' : 'bg-ink-300',
            )}
            aria-hidden
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
              <p className="text-[0.88rem] font-semibold text-ink-900">{item.title}</p>
              {item.meta ? <span className="micro shrink-0 text-ink-400">{item.meta}</span> : null}
            </div>
            {item.detail ? <div className="mt-1 text-[0.84rem] leading-relaxed text-ink-600">{item.detail}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

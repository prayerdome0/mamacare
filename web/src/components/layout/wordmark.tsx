/**
 * Brand mark.
 *
 * A heart held inside a protective circle — "care for mama, care for baby". The
 * mark is inline SVG so it stays sharp at 16px in a browser tab and at 512px in a
 * PWA install prompt, and it inherits `currentColor` so it works on dark and light
 * surfaces without a second asset.
 */

import { cn } from '@/lib/utils';
import { app } from '@/config/env';

export function Wordmark({
  className,
  compact = false,
  tone = 'dark',
  beat = false,
}: {
  className?: string;
  compact?: boolean;
  tone?: 'dark' | 'light';
  /** Give the mark a soft heartbeat pulse (public header). Honors reduced motion. */
  beat?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <Mark className={cn('size-9 shrink-0', tone === 'light' ? 'text-white' : 'text-brand-700', beat && 'mark-beat')} />
      {!compact ? (
        <span className="flex flex-col leading-none">
          <span
            className={cn(
              'text-[1.05rem] font-bold tracking-[-0.02em]',
              tone === 'light' ? 'text-white' : 'text-ink-900',
            )}
          >
            {app.name}
          </span>
          <span className={cn('mt-1 text-[0.66rem] font-medium tracking-[0.14em] uppercase', tone === 'light' ? 'text-white/70' : 'text-brand-700')}>
            {app.tagline}
          </span>
        </span>
      ) : null}
    </span>
  );
}

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden className={className}>
      <circle cx="20" cy="20" r="18.5" stroke="currentColor" strokeWidth="2.4" opacity="0.35" />
      <path
        d="M20 29.5c-4.6-3-8-6.1-8-10a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 3.9-3.4 7-8 10Z"
        fill="currentColor"
      />
      <circle cx="20" cy="17.4" r="1.7" fill="#fff" opacity="0.85" />
    </svg>
  );
}

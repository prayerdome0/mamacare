import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated counter.
 *
 * Used for platform statistics and dashboard totals: the number counts up once
 * when it first becomes visible, then settles. Two rules keep it honest and
 * unobtrusive:
 *
 *  • It only ever animates a **real value** passed in from a query. There is no
 *    invented number anywhere in this component; if the value is `null` the
 *    caller shows an em dash or a skeleton instead.
 *  • It respects `prefers-reduced-motion` and skips the animation entirely for
 *    users who ask for that, and it finishes quickly (900 ms) so it never holds
 *    up reading the page.
 */

const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
};

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

export interface UseCountUpOptions {
  /** Milliseconds for the full count; default 900. */
  durationMs?: number;
  /** Start counting only when the element scrolls into view; default true. */
  startOnView?: boolean;
  /** Force the animation off (used in tests and print views). */
  disabled?: boolean;
}

export function useCountUp(
  target: number | null | undefined,
  options: UseCountUpOptions = {},
): { value: number | null; ref: (node: HTMLElement | null) => void; done: boolean } {
  const { durationMs = 900, startOnView = true, disabled = false } = options;
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [visible, setVisible] = useState(!startOnView || disabled);
  const [value, setValue] = useState<number | null>(() => (disabled || !startOnView ? (target ?? null) : null));
  const [done, setDone] = useState(false);
  const frame = useRef<number | null>(null);

  // Observe visibility once; a counter that has run stays at its final value.
  useEffect(() => {
    if (!startOnView || disabled || !node) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, startOnView, disabled]);

  useEffect(() => {
    if (target === null || target === undefined) {
      setValue(null);
      setDone(false);
      return;
    }
    if (disabled || !visible || prefersReducedMotion()) {
      setValue(target);
      setDone(true);
      return;
    }
    const from = 0;
    const startedAt = performance.now();
    const tick = (now: number): void => {
      const progress = Math.min(1, (now - startedAt) / durationMs);
      setValue(Math.round(from + (target - from) * easeOutCubic(progress)));
      if (progress < 1) frame.current = requestAnimationFrame(tick);
      else setDone(true);
    };
    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, visible, durationMs, disabled]);

  const ref = useMemo(() => (element: HTMLElement | null) => setNode(element), []);

  return { value, ref, done };
}

export function CountUp({
  value,
  durationMs,
  className,
  format,
  suffix,
  prefix,
  startOnView = true,
}: {
  value: number | null | undefined;
  durationMs?: number;
  className?: string;
  /** Locale formatting; defaults to grouped digits (1,240). */
  format?: (value: number) => string;
  suffix?: string;
  prefix?: string;
  startOnView?: boolean;
}) {
  const { value: animated, ref } = useCountUp(value, { durationMs, startOnView });
  const text = animated === null ? '—' : (format ? format(animated) : animated.toLocaleString('en-ZM'));
  return (
    <span ref={ref} className={cn('tnum', className)} aria-label={value === null || value === undefined ? 'Not available' : undefined}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

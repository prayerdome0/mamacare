/**
 * Vitals band — the healthcare animation at the top of public pages.
 *
 * A slow ECG trace with a single travelling pulse, over two soft drifting
 * light blobs. Decorative on purpose: `aria-hidden`, no interaction, and it
 * is pure CSS/transform work (no JS, no filters, no layout) so it costs
 * essentially nothing on a small Android phone. The app's global
 * `prefers-reduced-motion` rule collapses every animation to an instant, so
 * with reduced motion on this renders as a quiet static line — still calm,
 * never distracting.
 */

import { cn } from '@/lib/utils';

/** One heartbeat per stroke; the path spans the full width. */
const ECG_PATH =
  'M0 32 H280 L296 32 L308 10 L320 48 L332 6 L344 54 L356 32 H560 L576 32 L588 12 L600 46 L612 8 L624 52 L636 32 H1200';

export function VitalsBand({ className }: { className?: string }) {
  return (
    <div className={cn('vitals-band relative h-14 w-full shrink-0 overflow-hidden sm:h-16', className)} aria-hidden="true">
      <div className="vitals-blob vitals-blob-a" />
      <div className="vitals-blob vitals-blob-b" />
      <svg className="vitals-ecg" viewBox="0 0 1200 64" preserveAspectRatio="none" fill="none">
        <path d={ECG_PATH} className="vitals-ecg-base" />
        <path d={ECG_PATH} pathLength={1} className="vitals-ecg-pulse" />
      </svg>
    </div>
  );
}

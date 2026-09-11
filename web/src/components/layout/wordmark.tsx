import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

/**
 * The MAMA CARE wordmark. Drawn as inline SVG so it stays crisp, inherits the
 * brand colour, and never depends on an image request (important for low-bandwidth
 * clinics). The Cloudinary-hosted `branding/logo` asset is used where an exported
 * image is required (PDFs, favicons).
 */
export function Wordmark({
  size = 'md',
  tone = 'brand',
  compact = false,
  href = '/',
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'brand' | 'light' | 'dark';
  compact?: boolean;
  href?: string;
  className?: string;
}) {
  const dimension = { sm: 'size-6', md: 'size-8', lg: 'size-10' }[size];
  const text = { sm: 'text-[0.95rem]', md: 'text-[1.08rem]', lg: 'text-2xl' }[size];
  const mark = tone === 'light' ? '#ffffff' : '#0f766e';
  const word = tone === 'light' ? '#ffffff' : '#0f172a';

  return (
    <Link to={href} className={cn('inline-flex items-center gap-2.5', className)} aria-label="MAMA CARE home">
      <svg viewBox="0 0 40 40" className={cn(dimension, 'shrink-0')} role="img" aria-hidden focusable="false">
        <rect width="40" height="40" rx="12" fill={tone === 'light' ? 'rgba(255,255,255,0.14)' : '#ccfbf1'} />
        <path
          d="M20 31.5c-5.4-3.4-9-7.3-9-11.7a5.6 5.6 0 0 1 9-4.4 5.6 5.6 0 0 1 9 4.4c0 4.4-3.6 8.3-9 11.7Z"
          fill={mark}
        />
        <circle cx="20" cy="18.6" r="2.6" fill={tone === 'light' ? '#0f766e' : '#ffffff'} />
      </svg>
      {!compact ? (
        <span className={cn('font-bold tracking-[-0.02em] whitespace-nowrap', text)} style={{ color: word }}>
          MAMA <span style={{ color: mark }}>CARE</span>
        </span>
      ) : null}
    </Link>
  );
}

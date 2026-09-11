/**
 * The one way this product renders an image.
 *
 * Every image — the ten maternal-health photographs as well as uploads — goes
 * through this component, so lazy loading, `srcSet`, Cloudinary delivery
 * parameters, an aspect-ratio placeholder (no layout shift) and a readable
 * fallback are applied consistently.
 */

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildSrcSet } from '@/services/media/cloudinary';
import { APP_IMAGES, type AppImageKey } from '@/services/media/app-images';
import { resolveAssetUrl } from '@/services/media/cloudinary';

export interface AppImageProps {
  /** Key of one of the ten maternal-health images. */
  name?: AppImageKey;
  /** Or an explicit Cloudinary public id / absolute URL / device handle. */
  src?: string | null;
  alt?: string;
  caption?: string;
  /** CSS aspect-ratio, e.g. '16 / 9'. */
  ratio?: string;
  /** Rendered sizes hint for responsive selection. */
  sizes?: string;
  /** Fetch eagerly (above-the-fold hero) instead of lazily. */
  priority?: boolean;
  /** Dark scrim so overlaid text stays legible. */
  overlay?: boolean | 'gradient';
  rounded?: boolean;
  className?: string;
  imgClassName?: string;
  /** Object-fit override. */
  fit?: 'cover' | 'contain';
  /** Fade the image in when decoded. */
  fade?: boolean;
}

export function AppImage({
  name,
  src,
  alt,
  caption,
  ratio = '16 / 9',
  sizes = '(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 640px',
  priority = false,
  overlay = false,
  rounded = true,
  className,
  imgClassName,
  fit = 'cover',
  fade = true,
}: AppImageProps) {
  const defined = name ? APP_IMAGES[name] : null;
  const fallbackAlt = defined?.alt ?? 'Photograph';
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [resolved, setResolved] = useState<string | null>(src ?? defined?.localSrc ?? null);
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(priority);

  // Public/branding assets render straight from their Cloudinary URL when the
  // environment provides one; the bundled copy is the fallback, not a decorator.
  useEffect(() => {
    let cancelled = false;
    const explicit = src ?? defined?.publicId ?? null;
    if (!explicit) return;
    if (explicit.startsWith('http') || explicit.startsWith('data:') || explicit.startsWith('/')) {
      setResolved(explicit);
      return;
    }
    if (explicit.startsWith('device:')) {
      void resolveAssetUrl({ localHandle: explicit.slice('device:'.length), accessMode: 'authenticated' })
        .then((url) => !cancelled && setResolved(url))
        .catch(() => !cancelled && setFailed(true));
      return;
    }
    // Cloudinary public id
    void (async () => {
      try {
        const { buildImageUrl: build } = await import('@/services/media/cloudinary');
        const url = build(explicit, { width: 1280, quality: 'auto', format: 'auto' });
        if (cancelled) return;
        setResolved(url || defined?.localSrc || null);
      } catch {
        if (!cancelled) setResolved(defined?.localSrc ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [src, defined?.publicId, defined?.localSrc]);

  useEffect(() => {
    if (inView || !holderRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(holderRef.current);
    return () => observer.disconnect();
  }, [inView]);

  const cloudinaryId = !src || (!src.startsWith('/') && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('device:'))
    ? (src ?? defined?.publicId ?? null)
    : null;
  const widths = defined?.widths ?? [];
  const srcSet = !failed && cloudinaryId && widths.length > 0
    ? buildSrcSet(cloudinaryId, widths, { quality: 'auto', format: 'auto' })
    : undefined;

  if (failed) {
    return (
      <figure className={cn('flex flex-col gap-2', className)}>
        <div className={cn('grid place-items-center bg-ink-100 text-ink-400', rounded && 'rounded-[var(--radius-lg)]')} style={{ aspectRatio: ratio }} role="img" aria-label={`${fallbackAlt} (image unavailable)`}>
          <span className="flex flex-col items-center gap-1.5 px-4 text-center">
            <ImageOff className="size-6" aria-hidden />
            <span className="micro">Image unavailable</span>
          </span>
        </div>
        {caption ? <figcaption className="caption">{caption}</figcaption> : null}
      </figure>
    );
  }

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div
        ref={holderRef}
        className={cn('relative overflow-hidden bg-ink-100', rounded && 'rounded-[var(--radius-lg)]')}
        style={{ aspectRatio: ratio }}
      >
        {!loaded ? <div className="skeleton absolute inset-0" aria-hidden /> : null}
        {inView && resolved ? (
          <img
            src={resolved}
            srcSet={srcSet}
            sizes={srcSet ? sizes : undefined}
            alt={alt ?? fallbackAlt}
            loading={priority ? 'eager' : 'lazy'}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            {...({ fetchpriority: priority ? 'high' : undefined } as any)}
            decoding={priority ? 'sync' : 'async'}
            onLoad={() => setLoaded(true)}
            onError={() => {
              // A Cloudinary URL can fail (deleted asset, blocked network). Fall
              // back to the bundled copy exactly once before giving up.
              if (resolved !== defined?.localSrc && defined?.localSrc) {
                setResolved(defined.localSrc);
              } else {
                setFailed(true);
              }
            }}
            className={cn(
              'size-full transition-opacity duration-500',
              fit === 'cover' ? 'object-cover' : 'object-contain',
              fade && (loaded ? 'opacity-100' : 'opacity-0'),
              imgClassName,
            )}
          />
        ) : null}
        {overlay ? (
          <div
            className={cn('pointer-events-none absolute inset-0', overlay === 'gradient' ? 'bg-gradient-to-t from-ink-950/85 via-ink-950/35 to-transparent' : 'bg-ink-950/35')}
            aria-hidden
          />
        ) : null}
      </div>
      {caption ? <figcaption className="caption">{caption}</figcaption> : null}
    </figure>
  );
}

export function AppImageCard({
  name,
  title,
  description,
  className,
}: {
  name: AppImageKey;
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <figure className={cn('card overflow-hidden', className)}>
      <AppImage name={name} ratio="16 / 10" />
      <figcaption className="p-4">
        <p className="font-semibold text-ink-900">{title}</p>
        {description ? <p className="muted mt-1">{description}</p> : null}
      </figcaption>
    </figure>
  );
}

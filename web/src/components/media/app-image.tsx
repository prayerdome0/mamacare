/**
 * The one way this product renders an image.
 *
 * Every image — the sixteen maternal-health photographs as well as uploads — goes
 * through this component, so lazy loading, `srcSet`, delivery parameters, an
 * aspect-ratio placeholder (no layout shift) and a readable fallback are applied
 * consistently.
 *
 * Resolution order, so an image can never 404 silently:
 *  1. an absolute URL, data/blob URL or bundled `/images/...` path is used as-is;
 *  2. `firebase:…` / `device:…` identifiers are resolved through the media
 *     service (Firebase Storage download URL, or this browser's blob store);
 *  3. a bare Cloudinary public id is delivered from the media-library root —
 *     no folder prefix is ever added;
 *  4. on any failure the bundled file is tried once, then a labelled fallback
 *     frame is rendered. The page never shows a broken image icon.
 */

import { useEffect, useRef, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { buildImageUrl, buildSrcSet, isDirectUrl } from '@/services/media/cloudinary';
import { APP_IMAGES, type AppImageKey } from '@/services/media/app-images';
import { cloudinaryConfig } from '@/config/env';

export interface AppImageProps {
  /** Key of one of the sixteen bundled maternal-health images. */
  name?: AppImageKey;
  /** Or an explicit URL / Cloudinary public id / `firebase:` handle. */
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
  const [resolved, setResolved] = useState<string | null>(() => initialSource(src, defined?.localSrc ?? null));
  const holderRef = useRef<HTMLDivElement | null>(null);
  const [inView, setInView] = useState(priority);

  /**
   * Anything that is not a ready-to-use address has to be resolved
   * asynchronously: Firebase Storage hands out a URL per request, and device
   * blobs become object URLs.
   */
  useEffect(() => {
    let cancelled = false;
    const identifier = src ?? defined?.remotePublicId ?? null;

    if (!identifier) {
      setResolved(defined?.localSrc ?? null);
      return;
    }
    if (isDirectUrl(identifier)) {
      setResolved(identifier);
      return;
    }
    if (identifier.startsWith('firebase:') || identifier.startsWith('device:')) {
      setFailed(false);
      void import('@/services/media/cloudinary')
        .then(({ resolveAssetUrl }) => resolveAssetUrl({ publicId: identifier }))
        .then((url) => {
          if (!cancelled) setResolved(url);
        })
        .catch(() => {
          if (!cancelled) setFailed(true);
        });
      return;
    }
    // A bare Cloudinary public id. Delivered from the media-library root; if
    // Cloudinary is not configured, fall back to the bundled file.
    if (cloudinaryConfig.enabled) {
      setResolved(buildImageUrl(identifier, { width: 1280, quality: 'auto', format: 'auto' }));
    } else {
      setResolved(defined?.localSrc ?? null);
    }
    return () => {
      cancelled = true;
    };
  }, [src, defined?.remotePublicId, defined?.localSrc]);

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

  const remoteId = src && !isDirectUrl(src) && !src.startsWith('firebase:') && !src.startsWith('device:') ? src : defined?.remotePublicId ?? null;
  const widths = defined?.widths ?? [];
  const srcSet =
    !failed && remoteId && widths.length > 0 && cloudinaryConfig.enabled
      ? buildSrcSet(remoteId, widths, { quality: 'auto', format: 'auto' })
      : undefined;

  // The bundled copy is the last resort before the labelled fallback frame.
  const onError = (): void => {
    const bundled = defined?.localSrc ?? null;
    if (bundled && resolved !== bundled) {
      setResolved(bundled);
      return;
    }
    setFailed(true);
  };

  return (
    <figure className={cn('flex flex-col gap-2', className)}>
      <div
        ref={holderRef}
        className={cn('relative overflow-hidden bg-ink-100', rounded && 'rounded-[var(--radius-lg)]')}
        style={{ aspectRatio: ratio }}
      >
        {!loaded && !failed ? <div className="skeleton absolute inset-0" aria-hidden /> : null}

        {failed ? (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-brand-50 to-ink-100 text-ink-400" role="img" aria-label={`${fallbackAlt} (image unavailable)`}>
            <span className="flex flex-col items-center gap-1.5 px-4 text-center">
              <ImageOff className="size-6" aria-hidden />
              <span className="micro">Image unavailable</span>
            </span>
          </div>
        ) : null}

        {!failed && inView && resolved ? (
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
            onError={onError}
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

/** Bundled paths and absolute URLs render immediately; identifiers do not. */
function initialSource(src: string | null | undefined, bundled: string | null): string | null {
  if (!src) return bundled;
  if (isDirectUrl(src)) return src;
  return bundled;
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

/**
 * Authentication shell.
 *
 * Split layout: the form on the left, a reassuring photograph and the safety
 * statement on the right. On a phone only the form shows — someone trying to sign
 * in on a cheap Android phone over a slow connection should not have to download a
 * hero image first, so the panel is hidden below `lg` and the image loads lazily.
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { SITE, MEDICAL_DISCLAIMER } from '@/config/site-content';
import { AppImage } from '@/components/media/app-image';
import { Wordmark } from '@/components/layout/wordmark';
import type { AppImageKey } from '@/services/media/app-images';

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  image = 'hero',
  alt,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  image?: AppImageKey;
  alt?: string;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Link to="/" className="inline-flex w-fit">
          <Wordmark />
        </Link>

        <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
          <h1 className="display-2">{title}</h1>
          {subtitle ? <p className="lede mt-2">{subtitle}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-6 text-sm text-ink-600">{footer}</div> : null}
        </div>

        <p className="mx-auto w-full max-w-[440px] text-xs leading-relaxed text-ink-500">
          <ShieldCheck className="mr-1 inline size-3.5 text-brand-700" aria-hidden />
          Your health information is yours. Mama Care collects only what a feature needs, and you can export or delete
          your account at any time.
        </p>
      </div>

      <aside className="relative hidden overflow-hidden bg-brand-950 lg:block">
        <AppImage
          name={image}
          alt={alt ?? 'A mother receiving maternal healthcare'}
          className="absolute inset-0 h-full w-full"
          imgClassName="h-full w-full object-cover opacity-70"
          ratio="auto"
        />
        <div className="relative flex h-full flex-col justify-end gap-6 bg-gradient-to-t from-brand-950 via-brand-950/70 to-transparent p-10 text-white">
          <div>
            <p className="text-[0.7rem] font-semibold tracking-[0.18em] text-brand-200 uppercase">{SITE.tagline}</p>
            <p className="mt-3 text-xl leading-snug font-semibold">{SITE.mission}</p>
          </div>
          <div className="rounded-lg border border-white/20 bg-white/10 p-4 text-[0.78rem] leading-relaxed text-white/90 backdrop-blur">
            <p className="flex items-center gap-2 font-semibold text-white">
              <AlertTriangle className="size-4" aria-hidden />
              Not an emergency service
            </p>
            <p className="mt-1.5">{MEDICAL_DISCLAIMER}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}

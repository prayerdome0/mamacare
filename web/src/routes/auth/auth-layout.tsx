import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Wordmark } from '@/components/layout/wordmark';
import { AppImage } from '@/components/media/app-image';
import { APP_IMAGES, type AppImageKey } from '@/services/media/app-images';

/**
 * Shared chrome for sign-in, registration and recovery. Deliberately a two-pane
 * layout: the form is the working surface, the panel explains what happens to the
 * account (approval, privileges, privacy) so nobody signs up blind.
 */
export function AuthLayout({
  title,
  intro,
  image = 'clinicEnvironment',
  panelTitle,
  panelPoints,
  footer,
  children,
  wide = false,
}: {
  title: string;
  intro?: ReactNode;
  image?: AppImageKey;
  panelTitle: string;
  panelPoints: { label: string; detail: string }[];
  footer?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const defined = APP_IMAGES[image];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.02fr_0.98fr]">
      <div className="flex flex-col bg-white px-5 py-7 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <Wordmark />
          <Link to="/" className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-ink-500 hover:text-brand-800">
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to the site
          </Link>
        </div>

        <div className={wide ? 'mx-auto w-full max-w-2xl flex-1 py-8' : 'mx-auto w-full max-w-md flex-1 py-10'}>
          <h1 className="display-2">{title}</h1>
          {intro ? <p className="lede mt-3">{intro}</p> : null}
          <div className="mt-7">{children}</div>
          {footer ? <div className="mt-7 border-t border-ink-200 pt-5">{footer}</div> : null}
        </div>

        <p className="caption flex items-start gap-2">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
          Access is enforced by database security rules on every read and write. Interface permissions are an additional layer, never the
          protection.
        </p>
      </div>

      <aside className="relative hidden lg:block">
        <AppImage src={defined?.localSrc} alt={defined?.alt ?? ''} ratio="auto" priority className="absolute inset-0" imgClassName="size-full object-cover" rounded={false} />
        <div className="absolute inset-0 bg-gradient-to-t from-brand-950 via-brand-950/85 to-brand-950/25" aria-hidden />
        <div className="relative flex h-full flex-col justify-end gap-6 p-9">
          <div>
            <p className="section-eyebrow !text-brand-300">{panelTitle}</p>
            <ul className="mt-4 space-y-3.5">
              {panelPoints.map((point) => (
                <li key={point.label} className="border-l-2 border-brand-500/60 pl-3.5">
                  <p className="text-[0.9rem] font-semibold text-white">{point.label}</p>
                  <p className="mt-1 text-[0.8rem] leading-relaxed text-brand-100/80">{point.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </aside>
    </div>
  );
}

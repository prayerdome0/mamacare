import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Phone } from 'lucide-react';
import { cn, telHref } from '@/lib/utils';
import { Wordmark } from '@/components/layout/wordmark';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink, LinkButton } from '@/components/ui/button';
import { PUBLIC_NAV } from '@/components/layout/shell';
import { MainMenu, MainMenuButton } from '@/components/layout/main-menu';
import { useSession } from '@/providers/app-providers';
import { EMERGENCY_CONTACTS } from '@/config/site-content';
import type { AppImageKey } from '@/services/media/app-images';

/**
 * Public site chrome. The landing page is the first screen of the product; this
 * shell provides its header and footer and is also used by the informational
 * pages (maternal health, emergency guidance, contact).
 */
export function PublicShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { actor } = useSession();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const workspaceHref = actor?.role === 'MOTHER' ? '/home' : actor?.role === 'ADMIN' ? '/admin' : '/app';

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <a href="#main" className="skip-link">
        Skip to main content
      </a>

      <div className="bg-brand-950 px-4 py-2 text-white">
        <div className="shell flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5">
          <p className="inline-flex items-center gap-2 text-[0.78rem] leading-snug">
            <AlertTriangle className="size-3.5 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
            In an emergency — heavy bleeding, fits, severe breathlessness or cord prolapse — go to the nearest facility now.
          </p>
          <a href={telHref(EMERGENCY_CONTACTS.ambulance)} className="text-[0.78rem] font-semibold underline decoration-white/40 underline-offset-2 hover:decoration-white">
            Ambulance {EMERGENCY_CONTACTS.ambulance}
          </a>
        </div>
      </div>

      <header
        className={cn(
          'sticky top-0 z-40 border-b transition-[background-color,box-shadow] duration-200',
          scrolled ? 'border-ink-200 bg-white/95 shadow-[var(--shadow-card)] backdrop-blur' : 'border-transparent bg-white',
        )}
      >
        <div className="shell flex h-16 items-center gap-6">
          <Wordmark />
          <nav aria-label="Primary" className="ml-4 hidden items-center gap-1 lg:flex">
            {PUBLIC_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                // End-match so a section anchor under a page does not mark its
                // parent as current.
                end
                className={({ isActive }) =>
                  cn(
                    'rounded-lg px-3 py-2 text-[0.86rem] font-medium transition-colors hover:bg-ink-100 hover:text-ink-900',
                    isActive ? 'bg-ink-100 text-brand-800' : 'text-ink-600',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link to="/signin" className="btn btn-ghost btn-sm hidden sm:inline-flex">
              Sign in
            </Link>
            <ButtonLink
              to={actor ? workspaceHref : '/register'}
              size="sm"
              className="hidden sm:inline-flex"
              icon={<ArrowRight className="size-4" aria-hidden />}
            >
              {actor ? 'Open workspace' : 'Create an account'}
            </ButtonLink>
            {/* One main menu for every page and every account type. */}
            <MainMenuButton open={open} onToggle={() => setOpen((value) => !value)} />
          </div>
        </div>
      </header>
      <MainMenu open={open} onClose={() => setOpen(false)} />

      <main id="main" className="flex-1">
        {children}
      </main>

      <PublicFooter />
    </div>
  );
}

export function PublicFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-ink-200 bg-ink-50">
      <div className="shell grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <div className="max-w-xs">
          <Wordmark />
          <p className="muted mt-3">
            A maternal-health record and follow-up platform for clinics: structured antenatal visits, risk alerts, referrals,
            appointments and mother-facing reminders in one place.
          </p>
          <p className="caption mt-3">Not a medical device. Alerts indicate recorded findings that need clinical assessment.</p>
        </div>

        <nav aria-label="Platform">
          <h3 className="micro mb-3">Platform</h3>
          <ul className="space-y-2 text-[0.86rem]">
            <li><Link to="/about" className="text-ink-600 hover:text-brand-800 hover:underline">About MAMA CARE</Link></li>
            <li><Link to="/services" className="text-ink-600 hover:text-brand-800 hover:underline">Services</Link></li>
            <li><Link to="/how-it-works" className="text-ink-600 hover:text-brand-800 hover:underline">How it works</Link></li>
            <li><Link to="/maternal-health" className="text-ink-600 hover:text-brand-800 hover:underline">Maternal health</Link></li>
            <li><Link to="/emergency" className="text-ink-600 hover:text-brand-800 hover:underline">Emergency guidance</Link></li>
          </ul>
        </nav>

        <nav aria-label="Who it is for">
          <h3 className="micro mb-3">Who it is for</h3>
          <ul className="space-y-2 text-[0.86rem]">
            <li><Link to="/for-clinics" className="text-ink-600 hover:text-brand-800 hover:underline">For clinics</Link></li>
            <li><Link to="/for-mothers" className="text-ink-600 hover:text-brand-800 hover:underline">For mothers</Link></li>
            <li><Link to="/resources" className="text-ink-600 hover:text-brand-800 hover:underline">Resources &amp; reading</Link></li>
            <li><Link to="/contact" className="text-ink-600 hover:text-brand-800 hover:underline">Contact</Link></li>
            <li><Link to="/privacy" className="text-ink-600 hover:text-brand-800 hover:underline">Privacy and data</Link></li>
            <li><Link to="/faq" className="text-ink-600 hover:text-brand-800 hover:underline">Questions &amp; answers</Link></li>
            <li><Link to="/status" className="text-ink-600 hover:text-brand-800 hover:underline">Service status</Link></li>
          </ul>
        </nav>

        <nav aria-label="Access">
          <h3 className="micro mb-3">Sign in</h3>
          <ul className="space-y-2 text-[0.86rem]">
            <li><Link to="/signin" className="text-ink-600 hover:text-brand-800 hover:underline">Staff sign in</Link></li>
            <li><Link to="/register" className="text-ink-600 hover:text-brand-800 hover:underline">Create an account</Link></li>
            <li><Link to="/forgot-password" className="text-ink-600 hover:text-brand-800 hover:underline">Reset a password</Link></li>
            <li><Link to="/home" className="text-ink-600 hover:text-brand-800 hover:underline">Mother portal</Link></li>
          </ul>
        </nav>

        <div>
          <h3 className="micro mb-3">Emergency</h3>
          <ul className="space-y-2.5 text-[0.86rem]">
            {EMERGENCY_CONTACTS.lines.map((line) => (
              <li key={line.label}>
                <LinkButton href={telHref(line.number)} variant="ghost" className="w-full justify-between !px-0 !text-[0.86rem] hover:!bg-transparent">
                  <span className="text-ink-600">{line.label}</span>
                  <span className="inline-flex items-center gap-1.5 font-semibold text-ink-900 tnum">
                    <Phone className="size-3.5 text-brand-700" aria-hidden />
                    {line.number}
                  </span>
                </LinkButton>
              </li>
            ))}
          </ul>
          <p className="caption mt-3">If a mother is convulsing, bleeding heavily or in obstructed labour, do not wait for a phone line — move her to the nearest facility immediately.</p>
        </div>
      </div>
      <div className="border-t border-ink-200">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-4">
          <p className="micro">© {year} MAMA CARE</p>
          <p className="caption max-w-xl">
            Built for clinic use. Records are held under the facility's data-protection obligations; nothing on this site constitutes medical advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

/**
 * The header every informational public page opens with.
 *
 * One component so the About, Services, How-it-works, For-clinics, For-mothers
 * and Resources pages share a hero shape rather than each inventing one — and so
 * the breadcrumb trail back to the homepage is present on all of them.
 */
export function PublicPageHeader({
  eyebrow,
  title,
  lede,
  actions,
  image,
  imageCaption,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  actions?: ReactNode;
  /** One of the bundled maternal-health photographs, shown beside the text. */
  image?: AppImageKey;
  imageCaption?: string;
  children?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-white">
      <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-72 opacity-60" aria-hidden />
      <div className={cn('shell relative grid items-center gap-9 py-12 lg:py-16', image && 'lg:grid-cols-[1.05fr_0.95fr]')}>
        <div className="max-w-2xl">
          <nav aria-label="Breadcrumb" className="micro mb-3 flex items-center gap-1.5">
            <Link to="/" className="text-ink-500 hover:text-brand-800 hover:underline">
              Home
            </Link>
            <span aria-hidden className="text-ink-300">
              /
            </span>
            <span className="text-ink-700">{eyebrow}</span>
          </nav>
          <h1 className="display-2 mt-1">{title}</h1>
          {lede ? <p className="lede mt-4">{lede}</p> : null}
          {actions ? <div className="mt-6 flex flex-wrap items-center gap-2.5">{actions}</div> : null}
          {children}
        </div>
        {image ? <AppImage name={image} ratio="4 / 3" priority caption={imageCaption} /> : null}
      </div>
    </section>
  );
}

export function PublicSection({
  id,
  eyebrow,
  title,
  description,
  actions,
  tone = 'white',
  children,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: 'white' | 'tint' | 'brand' | 'ink';
  children?: ReactNode;
  className?: string;
}) {
  const toneClass = {
    white: 'bg-white',
    tint: 'bg-ink-50',
    brand: 'bg-brand-950 text-white',
    ink: 'bg-ink-900 text-white',
  }[tone];
  const dark = tone === 'brand' || tone === 'ink';

  return (
    <section id={id} className={cn('scroll-mt-24 py-14 sm:py-20', toneClass, className)}>
      <div className="shell">
        <div className={cn('mb-9 flex flex-col gap-4', 'lg:flex-row lg:items-end lg:justify-between')}>
          <div className="max-w-2xl">
            {eyebrow ? <p className={cn('section-eyebrow mb-2.5', dark && '!text-brand-300')}>{eyebrow}</p> : null}
            <h2 className={cn('display-2', dark && '!text-white')}>{title}</h2>
            {description ? <p className={cn('lede mt-3.5', dark && '!text-brand-100/85')}>{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
        </div>
        {children}
      </div>
    </section>
  );
}

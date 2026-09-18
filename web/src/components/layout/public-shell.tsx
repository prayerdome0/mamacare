/**
 * Public site shell: header, emergency strip, content and footer.
 *
 * The emergency link is in the header on every public page, not buried in the
 * footer. Someone in trouble should not have to hunt for it.
 */

import { useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AlertTriangle, Menu, Phone, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { SITE, EMERGENCY_CONTACTS, MEDICAL_DISCLAIMER, FOOTER_LINKS } from '@/config/site-content';
import { Button, ButtonLink } from '@/components/ui/button';
import { Wordmark } from '@/components/layout/wordmark';
import { VitalsBand } from '@/components/layout/vitals-band';
import { useSession } from '@/providers/app-providers';

const NAV = [
  { to: '/learn', label: 'Learn' },
  { to: '/facilities', label: 'Facilities' },
  { to: '/providers', label: 'Providers' },
  { to: '/how-it-works', label: 'How it works' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
];

export function PublicShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const { actor } = useSession();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Emergency strip — always visible, always first */}
      <div className="bg-[var(--color-risk-red)] text-white">
        <div className="shell flex flex-wrap items-center justify-between gap-2 py-2 text-[0.8rem] font-semibold">
          <Link to="/emergency" className="inline-flex items-center gap-2 underline-offset-2 hover:underline">
            <AlertTriangle className="size-4" aria-hidden />
            Seek medical help — pregnancy and newborn warning signs
          </Link>
          <span className="inline-flex items-center gap-3 text-white/90">
            {EMERGENCY_CONTACTS.lines.slice(0, 2).map((line) => (
              <a key={line.number} href={`tel:${line.number.replace(/\s/g, '')}`} className="inline-flex items-center gap-1.5 hover:text-white">
                <Phone className="size-3.5" aria-hidden />
                {line.number}
              </a>
            ))}
          </span>
        </div>
      </div>

      <header className="sticky top-0 z-40 border-b border-ink-200 bg-white/92 backdrop-blur">
        <div className="shell flex h-[68px] items-center justify-between gap-4">
          <Link to="/" aria-label={`${SITE.name} home`}>
            <Wordmark beat />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 lg:flex">
            {actor ? (
              <ButtonLink to={actor.role === 'ADMIN' ? '/admin' : actor.role === 'MOTHER' || actor.role === 'SUPPORTER' ? '/app' : '/provider'}>
                Open my app
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/sign-in" variant="ghost">
                  Sign in
                </ButtonLink>
                <ButtonLink to="/register">Get started</ButtonLink>
              </>
            )}
          </div>

          <Button variant="ghost" className="lg:hidden" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>

        {open ? (
          <div className="border-t border-ink-200 bg-white lg:hidden">
            <nav className="shell flex flex-col gap-1 py-3" aria-label="Mobile">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
                >
                  {item.label}
                </NavLink>
              ))}
              <div className="mt-2 flex gap-2">
                {actor ? (
                  <ButtonLink to="/app" className="flex-1" onClick={() => setOpen(false)}>
                    Open my app
                  </ButtonLink>
                ) : (
                  <>
                    <ButtonLink to="/sign-in" variant="secondary" className="flex-1" onClick={() => setOpen(false)}>
                      Sign in
                    </ButtonLink>
                    <ButtonLink to="/register" className="flex-1" onClick={() => setOpen(false)}>
                      Get started
                    </ButtonLink>
                  </>
                )}
              </div>
            </nav>
          </div>
        ) : null}
      </header>

      <main id="main" className="flex-1" key={location.pathname}>
        {children}
      </main>

      <footer className="mt-16 border-t border-ink-200 bg-ink-50">
        <div className="shell grid gap-10 py-12 md:grid-cols-4">
          <div>
            <Wordmark />
            <p className="mt-4 text-sm leading-relaxed text-ink-600">{SITE.description}</p>
            <p className="mt-4 text-xs text-ink-500">
              {SITE.org.address}
              {SITE.org.phone ? ` · ${SITE.org.phone}` : ''}
              <br />
              {SITE.org.email}
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([group, links]) => (
            <div key={group}>
              <h3 className="micro">{group === 'mothers' ? 'For mothers' : group === 'learn' ? 'Learn' : 'Support'}</h3>
              <ul className="mt-3 space-y-2 text-sm">
                {links.map((link) => (
                  <li key={link.to + link.label}>
                    <Link to={link.to} className="text-ink-600 hover:text-brand-800 hover:underline">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-ink-200">
          <div className="shell py-6 text-xs leading-relaxed text-ink-500">
            <p className="max-w-4xl">{MEDICAL_DISCLAIMER}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span>© {new Date().getFullYear()} {SITE.name}</span>
              <Link to="/privacy" className="hover:underline">Privacy policy</Link>
              <Link to="/terms" className="hover:underline">Terms of service</Link>
              <Link to="/contact" className="hover:underline">Contact</Link>
              <Link to="/status" className="hover:underline">System status</Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Reusable hero for public pages. */
export function PublicHero({
  eyebrow,
  title,
  lede,
  children,
  image,
}: {
  eyebrow?: string;
  title: string;
  lede?: string;
  children?: ReactNode;
  image?: ReactNode;
}) {
  return (
    <section className="relative overflow-hidden border-b border-ink-200 bg-gradient-to-b from-brand-50/70 to-white">
      <div className="hero-ambient-glow" aria-hidden="true" />
      <div className="hero-ambient-glow" style={{ left: '-15%', top: '30%', width: '400px', height: '400px', animationDelay: '-6s' }} aria-hidden="true" />
      <VitalsBand />
      <div className={cn('shell relative z-10 grid items-center gap-10 py-14 sm:py-16', image ? 'lg:grid-cols-2' : '')}>
        <div>
          {eyebrow ? <p className="section-eyebrow">{eyebrow}</p> : null}
          <h1 className="display mt-3">{title}</h1>
          {lede ? <p className="lede mt-4 max-w-2xl">{lede}</p> : null}
          {children ? <div className="mt-7 flex flex-wrap gap-3">{children}</div> : null}
        </div>
        {image ? <div className="order-first lg:order-none">{image}</div> : null}
      </div>
    </section>
  );
}

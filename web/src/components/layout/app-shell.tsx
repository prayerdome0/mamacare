/**
 * Mother-facing app shell.
 *
 * Mobile-first, exactly as the product brief drew it: a header with the greeting
 * and the pregnancy week, a five-item bottom tab bar (Home · Learn · Baby ·
 * Alerts · Profile), and a full sidebar on tablet and desktop. The emergency
 * action is always one tap away, in both layouts, and is never styled like a
 * navigation item — it is red, it is labelled, and it does not look decorative.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Baby,
  Bell,
  BookOpen,
  CalendarDays,
  ClipboardList,
  FileText,
  Heart,
  Home,
  Hospital,
  LogOut,
  MapPin,
  MessageCircle,
  NotebookPen,
  Pill,
  Settings,
  UserRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { app } from '@/config/env';
import { useSession, ConfigurationNotice } from '@/providers/app-providers';
import { useMotherContext, firstName, greeting } from '@/hooks/use-mother';
import { announcementRepo } from '@/services/repositories';
import { Badge } from '@/components/ui/display';
import { Avatar } from '@/components/ui/display';
import { Mark } from '@/components/layout/wordmark';
import type { Announcement } from '@/types/domain';

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
  group: 'today' | 'journey' | 'baby' | 'support' | 'account';
}

export const MOTHER_NAV: NavItem[] = [
  { to: '/app', label: 'Home', icon: Home, group: 'today' },
  { to: '/app/records', label: 'Health records', icon: ClipboardList, group: 'journey' },
  { to: '/app/reports', label: 'Reports', icon: FileText, group: 'journey' },
  { to: '/app/pregnancy', label: 'Pregnancy', icon: Heart, group: 'journey' },
  { to: '/app/guide', label: 'Weekly guide', icon: BookOpen, group: 'journey' },
  { to: '/app/appointments', label: 'Appointments', icon: CalendarDays, group: 'journey' },
  { to: '/app/reminders', label: 'Reminders', icon: Pill, group: 'journey' },
  { to: '/app/baby', label: 'My baby', icon: Baby, group: 'baby' },
  { to: '/app/journal', label: 'Journal', icon: NotebookPen, group: 'baby' },
  { to: '/app/learn', label: 'Learn', icon: BookOpen, group: 'support' },
  { to: '/app/facilities', label: 'Facilities', icon: MapPin, group: 'support' },
  { to: '/app/messages', label: 'Messages', icon: MessageCircle, group: 'support' },
  { to: '/app/emergency', label: 'Emergency', icon: AlertTriangle, group: 'support' },
  { to: '/app/notifications', label: 'Notifications', icon: Bell, group: 'account' },
  { to: '/app/profile', label: 'Profile', icon: UserRound, group: 'account' },
  { to: '/app/settings', label: 'Settings', icon: Settings, group: 'account' },
];

const GROUP_LABELS: Record<NavItem['group'], string> = {
  today: 'Today',
  journey: 'My pregnancy',
  baby: 'My baby',
  support: 'Learn & support',
  account: 'Account',
};

/** The five items in the mobile bottom bar, in the order the brief specified. */
const BOTTOM_NAV: NavItem[] = [
  { to: '/app', label: 'Home', icon: Home, group: 'today' },
  { to: '/app/learn', label: 'Learn', icon: BookOpen, group: 'support' },
  { to: '/app/baby', label: 'Baby', icon: Baby, group: 'baby' },
  { to: '/app/emergency', label: 'Alerts', icon: AlertTriangle, group: 'support' },
  { to: '/app/profile', label: 'Profile', icon: UserRound, group: 'account' },
];

export function AppShell({ children }: { children?: ReactNode }) {
  const { actor, signOut } = useSession();
  const mother = useMotherContext();
  const location = useLocation();
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void announcementRepo
      .active()
      .then((rows) => {
        if (!cancelled) setAnnouncements(rows.slice(0, 2));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const name = actor ? firstName(actor.displayName) : 'Mama';
  const week = mother.ga?.valid ? mother.ga.weeks : null;
  const isPostnatal = mother.mode === 'postnatal';

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        <div className="flex h-[68px] items-center gap-2.5 border-b border-ink-200 px-5">
          <Mark className="size-8 text-brand-700" />
          <span className="text-[1rem] font-bold tracking-tight text-ink-900">{app.name}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="App">
          {(['today', 'journey', 'baby', 'support', 'account'] as const).map((group) => {
            const items = MOTHER_NAV.filter((item) => item.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="mb-5">
                <p className="micro px-3 pb-1.5">{GROUP_LABELS[group]}</p>
                <ul className="space-y-0.5">
                  {items.map((item) => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        end={item.to === '/app'}
                        className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
                      >
                        <item.icon className="size-[1.05rem] shrink-0" aria-hidden />
                        <span className="truncate">{item.label}</span>
                        {item.to === '/app/notifications' && mother.unreadNotifications > 0 ? (
                          <span className="ml-auto rounded-full bg-brand-700 px-1.5 text-[0.65rem] font-bold text-white tnum">
                            {mother.unreadNotifications}
                          </span>
                        ) : null}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>

        <div className="border-t border-ink-200 p-3">
          <button
            type="button"
            onClick={() => void signOut().then(() => navigate('/'))}
            className="nav-link w-full text-ink-500 hover:text-ink-900"
          >
            <LogOut className="size-[1.05rem]" aria-hidden />
            Sign out
          </button>
        </div>
      </aside>

      {/* ── Main column ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-[1000px] items-center gap-3 px-4 py-3 sm:px-6">
            <Link to="/app" className="flex items-center gap-2 lg:hidden" aria-label={`${app.name} home`}>
              <Mark className="size-8 text-brand-700" />
            </Link>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.95rem] font-semibold text-ink-900">
                {greeting()}, {name}
              </p>
              <p className="truncate text-xs text-ink-500">
                {isPostnatal && mother.activeBaby
                  ? `Mother & Baby mode · ${mother.activeBaby.name}`
                  : week !== null
                    ? `Pregnancy week ${week} · ${mother.ga?.trimester === 1 ? 'First' : mother.ga?.trimester === 2 ? 'Second' : 'Third'} trimester`
                    : 'Set up your pregnancy to start tracking'}
              </p>
            </div>

            <Link
              to="/app/emergency"
              className="hidden shrink-0 items-center gap-1.5 rounded-lg bg-[var(--color-risk-red)] px-3 py-2 text-[0.8rem] font-bold text-white sm:inline-flex"
            >
              <AlertTriangle className="size-4" aria-hidden />
              Seek help
            </Link>

            <Link
              to="/app/notifications"
              className="relative shrink-0 rounded-lg p-2 text-ink-600 hover:bg-ink-100"
              aria-label={`Notifications${mother.unreadNotifications ? `, ${mother.unreadNotifications} unread` : ''}`}
            >
              <Bell className="size-5" aria-hidden />
              {mother.unreadNotifications > 0 ? (
                <span className="absolute top-1 right-1 size-2 rounded-full bg-[var(--color-risk-red)]" />
              ) : null}
            </Link>

            <button
              type="button"
              className="shrink-0 rounded-lg p-1 hover:bg-ink-100 lg:hidden"
              onClick={() => setMenuOpen((value) => !value)}
              aria-expanded={menuOpen}
              aria-label="Menu"
            >
              <Avatar name={actor?.displayName ?? 'Mama'} src={actor?.photoUrl ?? null} size="sm" />
            </button>
          </div>

          {menuOpen ? (
            <div className="border-t border-ink-200 bg-white px-4 py-3 lg:hidden">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-900">{actor?.displayName}</span>
                <button type="button" onClick={() => setMenuOpen(false)} aria-label="Close menu" className="rounded p-1 hover:bg-ink-100">
                  <X className="size-4" />
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-1">
                {MOTHER_NAV.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} end={item.to === '/app'} className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}>
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate text-[0.8rem]">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => void signOut().then(() => navigate('/'))}
                className="nav-link mt-2 w-full text-ink-500"
              >
                <LogOut className="size-4" aria-hidden />
                Sign out
              </button>
            </div>
          ) : null}
        </header>

        <div className="mx-auto w-full max-w-[1000px] flex-1 px-4 pt-4 pb-28 sm:px-6 lg:pb-10">
          <ConfigurationNotice className="mb-4" />

          {announcements.length > 0 ? (
            <div className="mb-4 space-y-2">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={cn(
                    'alert px-4 py-3',
                    announcement.tone === 'warning' ? 'alert-warning' : 'alert-info',
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-900">{announcement.title}</p>
                    <p className="mt-0.5 text-[0.85rem] text-ink-700">{announcement.body}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {mother.error ? (
            <div className="alert alert-error mb-4 px-4 py-3 text-sm text-ink-700">{mother.error}</div>
          ) : null}

          {children ?? <Outlet />}
        </div>

        {/* ── Mobile bottom nav ─────────────────────────────────────── */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/97 backdrop-blur lg:hidden"
          aria-label="Primary"
        >
          <ul className="mx-auto flex max-w-[520px] items-stretch justify-between safe-bottom">
            {BOTTOM_NAV.map((item) => (
              <li key={item.to} className="flex-1">
                <NavLink
                  to={item.to}
                  end={item.to === '/app'}
                  className={({ isActive }) =>
                    cn(
                      'flex flex-col items-center gap-1 px-1 pt-2.5 pb-1 text-[0.68rem] font-semibold transition-colors',
                      item.to === '/app/emergency'
                        ? 'text-[var(--color-risk-red)]'
                        : isActive
                          ? 'text-brand-700'
                          : 'text-ink-500',
                      isActive && item.to !== '/app/emergency' && 'bg-brand-50/60',
                    )
                  }
                >
                  <item.icon className="size-5" aria-hidden />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}

/** Page header used by every app screen, so headings are consistent. */
export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="h1">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="actions-wrap">{actions}</div> : null}
    </div>
  );
}

/** Small helper so a screen can show "estimate" language consistently. */
export function EstimateBadge() {
  return <Badge tone="neutral">Estimate</Badge>;
}

/** Facility shortcut shown on the dashboard when no facility is set. */
export function NearbyLink() {
  return (
    <Link to="/app/facilities" className="nav-link">
      <Hospital className="size-4" aria-hidden />
      Find a facility near you
    </Link>
  );
}

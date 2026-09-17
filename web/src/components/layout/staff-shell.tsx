/**
 * Staff shell — healthcare provider portal and admin dashboard.
 *
 * One component, two navigation sets. Staff never get the mother's bottom tab bar:
 * these are desktop-first working screens, and the sidebar states plainly which
 * portal you are in, because a provider must never be unsure whether they are
 * looking at their own tool or a patient's view.
 */

import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Bell,
  CalendarDays,
  FileText,
  FolderOpen,
  HeartPulse,
  Image as ImageIcon,
  LayoutDashboard,
  LogOut,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { app } from '@/config/env';
import { ConfigurationNotice, useSession } from '@/providers/app-providers';
import { Avatar } from '@/components/ui/display';
import { Mark } from '@/components/layout/wordmark';
import type { Role } from '@/types/domain';

interface StaffNavItem {
  to: string;
  label: string;
  icon: typeof Users;
}

export const PROVIDER_NAV: StaffNavItem[] = [
  { to: '/provider', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/provider/patients', label: 'Patients', icon: Users },
  { to: '/provider/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/provider/education', label: 'Education', icon: FileText },
  { to: '/provider/messages', label: 'Messages', icon: MessageSquare },
  { to: '/provider/reports', label: 'Reports', icon: HeartPulse },
  { to: '/provider/profile', label: 'Profile', icon: UserRound },
];

export const ADMIN_NAV: StaffNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/providers', label: 'Healthcare providers', icon: Stethoscope },
  { to: '/admin/facilities', label: 'Hospitals & clinics', icon: FolderOpen },
  { to: '/admin/articles', label: 'Education content', icon: FileText },
  { to: '/admin/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/admin/notifications', label: 'Notifications', icon: Bell },
  { to: '/admin/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/admin/reports', label: 'Reported content', icon: AlertTriangle },
  { to: '/admin/feedback', label: 'Feedback', icon: MessageSquare },
  { to: '/admin/media', label: 'Media queue', icon: ImageIcon },
  { to: '/admin/audit', label: 'Audit log', icon: ShieldCheck },
  { to: '/admin/settings', label: 'System settings', icon: Settings },
];

export const navForRole = (role: Role | null | undefined): StaffNavItem[] =>
  role === 'ADMIN' ? ADMIN_NAV : role === 'FACILITY_ADMIN' ? ADMIN_NAV : PROVIDER_NAV;

export function StaffShell({
  portal,
  children,
  nav,
}: {
  portal: 'Healthcare Portal' | 'Admin Dashboard';
  children?: ReactNode;
  nav?: StaffNavItem[];
}) {
  const { actor, signOut, permissions } = useSession();
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const items = nav ?? (permissions.isAdmin || permissions.isFacilityAdmin ? ADMIN_NAV : PROVIDER_NAV);

  const sidebar = (
    <>
      <div className="flex h-[68px] items-center gap-2.5 border-b border-ink-200 px-5">
        <Mark className="size-8 text-brand-700" />
        <span className="min-w-0">
          <span className="block truncate text-[0.98rem] font-bold tracking-tight text-ink-900">{app.name}</span>
          <span className="block truncate text-[0.66rem] font-semibold tracking-[0.12em] text-brand-700 uppercase">
            {portal}
          </span>
        </span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={portal}>
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/provider' || item.to === '/admin'} className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}>
                <item.icon className="size-[1.05rem] shrink-0" aria-hidden />
                <span className="truncate">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-6 rounded-lg border border-ink-200 bg-ink-50 p-3 text-[0.72rem] leading-relaxed text-ink-600">
          <p className="font-semibold text-ink-800">Access is limited</p>
          <p className="mt-1">
            You can only open the records of people who have shared their care with you. Every privileged action is
            written to the audit log.
          </p>
        </div>
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
    </>
  );

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col border-r border-ink-200 bg-white lg:flex">
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur lg:hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <button type="button" className="rounded-lg p-1.5 hover:bg-ink-100" onClick={() => setOpen((value) => !value)} aria-label="Menu" aria-expanded={open}>
              <Mark className="size-7 text-brand-700" />
            </button>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">{portal}</p>
              <p className="truncate text-xs text-ink-500">{actor?.displayName}</p>
            </div>
            <Avatar name={actor?.displayName ?? ''} src={actor?.photoUrl ?? null} size="sm" />
          </div>
          {open ? (
            <div className="border-t border-ink-200 px-3 py-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="micro">Menu</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="rounded p-1 hover:bg-ink-100">
                  <X className="size-4" />
                </button>
              </div>
              <ul className="grid grid-cols-2 gap-1">
                {items.map((item) => (
                  <li key={item.to}>
                    <NavLink to={item.to} className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}>
                      <item.icon className="size-4 shrink-0" aria-hidden />
                      <span className="truncate text-[0.8rem]">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </header>

        <div className="mx-auto w-full max-w-[1180px] flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <ConfigurationNotice className="mb-4" />
          {children ?? <Outlet />}
        </div>
      </div>
    </div>
  );
}

export function StaffPageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="h1">{title}</h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-ink-600">{description}</p> : null}
      </div>
      {actions ? <div className="actions-wrap">{actions}</div> : null}
    </div>
  );
}

export function StaffLinkHome() {
  return (
    <Link to="/" className="nav-link">
      <Mark className="size-4 text-brand-700" aria-hidden />
      Public site
    </Link>
  );
}

import { useEffect, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  Heart,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Stethoscope,
  UserCog,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/providers/app-providers';
import { useNavScope } from '@/components/layout/nav-scope';
import { useLiveQuery } from '@/hooks';
import { Avatar, Badge } from '@/components/ui/display';
import { Wordmark } from '@/components/layout/wordmark';
import { ROLE_LABELS } from '@/types/domain';
import type { UiPermissions } from '@/services/policy/policy';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  badge?: number | string;
  show: (permissions: UiPermissions, role: string | undefined) => boolean;
  end?: boolean;
}

export const APP_NAV: NavItem[] = [
  { to: '/app', label: 'Today', icon: <LayoutDashboard className="size-4" aria-hidden />, show: () => true, end: true },
  { to: '/app/mothers', label: 'Mothers', icon: <Heart className="size-4" aria-hidden />, show: (p) => p.canViewClinicalRecords },
  { to: '/app/anc', label: 'ANC visits', icon: <Stethoscope className="size-4" aria-hidden />, show: (p) => p.canRecordAncVisit || p.canViewClinicalRecords },
  { to: '/app/appointments', label: 'Appointments', icon: <CalendarClock className="size-4" aria-hidden />, show: () => true },
  { to: '/app/alerts', label: 'Alerts', icon: <AlertTriangle className="size-4" aria-hidden />, show: (p) => p.canViewClinicalRecords },
  { to: '/app/referrals', label: 'Referrals', icon: <Activity className="size-4" aria-hidden />, show: (p) => p.canCreateReferral },
  { to: '/app/documents', label: 'Documents', icon: <FileText className="size-4" aria-hidden />, show: (p) => p.canUploadDocuments },
  { to: '/app/education', label: 'Education', icon: <GraduationCap className="size-4" aria-hidden />, show: () => true },
  { to: '/app/reports', label: 'Reports', icon: <BarChart3 className="size-4" aria-hidden />, show: (p) => p.canGenerateReports },
  { to: '/app/notifications', label: 'Notifications', icon: <Bell className="size-4" aria-hidden />, show: () => true },
  { to: '/app/profile', label: 'My profile', icon: <UserCog className="size-4" aria-hidden />, show: () => true },
];

export const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard className="size-4" aria-hidden />, show: () => true, end: true },
  { to: '/admin/users', label: 'Users', icon: <Users className="size-4" aria-hidden />, show: (p) => p.canManageUsers },
  { to: '/admin/facilities', label: 'Facilities', icon: <Shield className="size-4" aria-hidden />, show: (p) => p.canManageFacilities },
  { to: '/admin/mothers', label: 'Mothers', icon: <Heart className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/appointments', label: 'Appointments', icon: <CalendarClock className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/alerts', label: 'Alerts', icon: <AlertTriangle className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/referrals', label: 'Referrals', icon: <Activity className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/documents', label: 'Documents', icon: <FileText className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/reports', label: 'Reports', icon: <BarChart3 className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/notifications', label: 'Notifications', icon: <Bell className="size-4" aria-hidden />, show: () => true },
  { to: '/admin/education', label: 'Education', icon: <GraduationCap className="size-4" aria-hidden />, show: (p) => p.canManageEducation },
  { to: '/admin/audit', label: 'Audit logs', icon: <ClipboardList className="size-4" aria-hidden />, show: (p) => p.canViewAuditLogs },
  { to: '/admin/settings', label: 'Settings', icon: <Settings className="size-4" aria-hidden />, show: (p) => p.canManageSettings },
];

export const MOTHER_NAV: NavItem[] = [
  { to: '/home', label: 'My pregnancy', icon: <Heart className="size-4" aria-hidden />, show: () => true, end: true },
  { to: '/home/appointments', label: 'Appointments', icon: <CalendarClock className="size-4" aria-hidden />, show: () => true },
  { to: '/home/records', label: 'My records', icon: <FileText className="size-4" aria-hidden />, show: () => true },
  { to: '/home/education', label: 'Reading', icon: <GraduationCap className="size-4" aria-hidden />, show: () => true },
  { to: '/home/notifications', label: 'Alerts', icon: <Bell className="size-4" aria-hidden />, show: () => true },
  { to: '/home/profile', label: 'My account', icon: <UserCog className="size-4" aria-hidden />, show: () => true },
];

export const PUBLIC_NAV = [
  { to: '/#about', label: 'About' },
  { to: '/#services', label: 'Services' },
  { to: '/maternal-health', label: 'Maternal health' },
  { to: '/emergency', label: 'Emergency' },
  { to: '/contact', label: 'Contact' },
];

export function AppShell({
  nav,
  title,
  subtitle,
  actions,
  children,
  tone,
}: {
  nav?: NavItem[];
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  tone?: 'staff' | 'mother';
}) {
  const { actor, permissions, signOut, providerKind } = useSession();
  const scope = useNavScope();
  const shellNav = nav ?? scope.nav;
  const shellTone = tone ?? scope.tone;
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Unread in-app messages for this account. A real count from the notification
  // collection — the badge is never a placeholder.
  const inbox = useLiveQuery('notifications', {
    where: actor ? [{ field: 'userId', op: '==', value: actor.uid }] : [{ field: 'userId', op: '==', value: '__none__' }],
    orderBy: { field: 'sentAt', direction: 'desc' },
    limit: 40,
  }, { enabled: Boolean(actor) });
  const alertCount = inbox.data.filter((row) => !row.readAt).length;

  useEffect(() => setOpen(false), [location.pathname]);

  const items = shellNav.filter((item) => item.show(permissions, actor?.role));

  return (
    <div className="flex min-h-dvh flex-col bg-ink-50">
      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="btn btn-quiet btn-sm size-9 min-h-0 p-0 lg:hidden"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
          >
            {open ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>
          <Wordmark compact href={shellTone === 'mother' ? '/home' : actor?.role === 'ADMIN' ? '/admin' : '/app'} />
          <span className="hidden sm:block">
            <Badge tone={shellTone === 'mother' ? 'green' : 'brand'}>{shellTone === 'mother' ? 'For mothers' : actor ? ROLE_LABELS[actor.role] : ''}</Badge>
          </span>
          {providerKind === 'local' ? (
            <span className="hidden md:block" title="No Firebase project is configured, so records are stored on this device.">
              <Badge tone="amber">Device storage</Badge>
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            {alertCount > 0 ? (
              <Link to={scope.link(scope.tone === 'mother' ? '/notifications' : '/alerts')} className="btn btn-quiet btn-sm" aria-label={`${alertCount} new notifications`}>
                <Bell className="size-4" />
                <span className="tnum">{alertCount}</span>
              </Link>
            ) : null}
            {actor ? (
              <Link to={scope.link('/profile')} className="flex items-center gap-2 rounded-full py-1 pr-2.5 pl-1 transition-colors hover:bg-ink-100">
                <Avatar name={actor.displayName ?? 'Account'} src={null} size="sm" />
                <span className="hidden text-[0.8rem] font-semibold text-ink-700 sm:block">{actor.displayName}</span>
              </Link>
            ) : null}
            <button type="button" onClick={() => void signOut()} className="btn btn-quiet btn-sm" title="Sign out">
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 items-start">
        <nav
          aria-label="Workspace sections"
          className={cn(
            'w-full shrink-0 border-ink-200 bg-white p-3 lg:sticky lg:top-14 lg:block lg:h-[calc(100dvh-3.5rem)] lg:w-60 lg:overflow-y-auto lg:border-r',
            open ? 'block border-b' : 'hidden',
          )}
        >
          <ul className="space-y-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => cn('nav-link', isActive && 'nav-link-active')}
                >
                  {item.icon}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge ? <span className="badge badge-neutral tnum">{item.badge}</span> : null}
                </NavLink>
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-ink-200 px-2.5 pt-3 text-[0.7rem] leading-relaxed text-ink-400">
            {shellTone === 'mother'
              ? 'Records are held by your facility. Ask a midwife if anything looks wrong.'
              : 'Findings are recorded observations. Clinical judgement always overrides an alert.'}
          </p>
        </nav>

        <main className="min-w-0 flex-1">
          {title !== undefined ? (
            <div className="border-b border-ink-200 bg-white px-4 py-5 sm:px-6">
              <div className="mx-auto flex max-w-[1180px] flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="h1">{title}</h1>
                  {subtitle ? <div className="muted mt-1 max-w-3xl text-[0.9rem]">{subtitle}</div> : null}
                </div>
                {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
              </div>
            </div>
          ) : null}
          <div className="mx-auto w-full max-w-[1180px] px-4 py-5 sm:px-6 sm:py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  back,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  back?: { to: string; label: string };
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        {back ? (
          <Link to={back.to} className="mb-1 inline-flex items-center gap-1 text-[0.8rem] font-semibold text-brand-800 hover:underline">
            <span aria-hidden>←</span> {back.label}
          </Link>
        ) : null}
        <h2 className="h2">{title}</h2>
        {subtitle ? <p className="muted mt-1 max-w-3xl">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Backdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return <div className="fixed inset-0 z-20 bg-ink-950/40 lg:hidden" onClick={onClose} aria-hidden />;
}

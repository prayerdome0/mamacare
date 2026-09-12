import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Baby,
  BadgeCheck,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardList,
  FileText,
  GraduationCap,
  Heart,
  HelpCircle,
  Home,
  Info,
  LayoutDashboard,
  LifeBuoy,
  LogIn,
  LogOut,
  MessageSquare,
  Newspaper,
  PhoneCall,
  Shield,
  ShieldCheck,
  Stethoscope,
  UserCog,
  UserPlus,
  Users,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useSession } from '@/providers/app-providers';
import { Drawer } from '@/components/ui/overlay';
import { Avatar, Badge } from '@/components/ui/display';
import { AppImage } from '@/components/media/app-image';
import { ROLE_LABELS } from '@/types/domain';

/**
 * The main menu.
 *
 * One organised menu for the whole product — opened from the icon in the header
 * of every shell (public site, health-worker workspace, mother portal, admin
 * console). It lists only pages that exist for the signed-in account: the public
 * information pages for everyone, the workspace screens the account's role and
 * permissions actually allow, and the account/support options.
 *
 * Nothing here is an authorisation decision. A hidden item is a convenience; the
 * route guards, `policy.ts`, `firestore.rules` and the API service decide what
 * may actually be opened.
 */

export interface MainMenuItem {
  to: string;
  label: string;
  icon: ReactNode;
  /** Optional second line — used where a page needs explaining. */
  detail?: string;
  /** External/mail/tel links render as anchors. */
  href?: string;
}

export interface MainMenuSection {
  id: string;
  title: string;
  items: MainMenuItem[];
}

const icon = (node: ReactNode): ReactNode => <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600">{node}</span>;

/**
 * Every section the current session may see. Exported so the landing page and
 * the tests can assert the same structure the drawer renders.
 */
export function useMainMenuSections(): MainMenuSection[] {
  const { actor, permissions, providerKind } = useSession();

  return useMemo(() => {
    const isMother = actor?.role === 'MOTHER';
    const workspaceBase = isMother ? '/home' : actor?.role === 'ADMIN' ? '/admin' : '/app';

    const publicSection: MainMenuSection = {
      id: 'explore',
      title: 'Explore',
      items: [
        { to: '/', label: 'Home', detail: 'What MAMA CARE is and who it is for', icon: icon(<Home className="size-4" aria-hidden />) },
        { to: '/about', label: 'About the platform', detail: 'How a pregnancy record is kept, and by whom', icon: icon(<Info className="size-4" aria-hidden />) },
        { to: '/services', label: 'Services', detail: 'What the platform does, and what your facility offers', icon: icon(<Stethoscope className="size-4" aria-hidden />) },
        { to: '/how-it-works', label: 'How it works', detail: 'From registration to postnatal, on one record', icon: icon(<Workflow className="size-4" aria-hidden />) },
        { to: '/maternal-health', label: 'Maternal health guidance', detail: 'Danger signs, contacts and care milestones', icon: icon(<Heart className="size-4" aria-hidden />) },
        { to: '/emergency', label: 'Emergency guidance', detail: 'What to do, and who to call, right now', icon: icon(<LifeBuoy className="size-4" aria-hidden />) },
        { to: '/for-clinics', label: 'For clinics', detail: 'How a facility adopts it, and who signs off', icon: icon(<Building2 className="size-4" aria-hidden />) },
        { to: '/for-mothers', label: 'For mothers', detail: 'What you see on your own account', icon: icon(<Baby className="size-4" aria-hidden />) },
        { to: '/resources', label: 'Resources & reading', detail: 'Published guidance and the education library', icon: icon(<BookOpen className="size-4" aria-hidden />) },
      ],
    };

    const workspaceItems: MainMenuItem[] = [];
    if (actor) {
      workspaceItems.push({
        to: workspaceBase,
        label: isMother ? 'My pregnancy' : actor.role === 'ADMIN' ? 'Platform overview' : 'Today’s workspace',
        detail: isMother ? 'Your appointments, records and reminders' : 'Your workload and the records you may open',
        icon: icon(<LayoutDashboard className="size-4" aria-hidden />),
      });
      if (!isMother) {
        if (permissions.canViewClinicalRecords) {
          workspaceItems.push({ to: `${workspaceBase}/mothers`, label: 'Mothers', icon: icon(<Heart className="size-4" aria-hidden />) });
          workspaceItems.push({ to: `${workspaceBase}/anc`, label: 'ANC visits', icon: icon(<Stethoscope className="size-4" aria-hidden />) });
          workspaceItems.push({ to: `${workspaceBase}/alerts`, label: 'Alerts', icon: icon(<Bell className="size-4" aria-hidden />) });
        }
        workspaceItems.push({ to: `${workspaceBase}/appointments`, label: 'Appointments', icon: icon(<CalendarClock className="size-4" aria-hidden />) });
        if (permissions.canCreateReferral) workspaceItems.push({ to: `${workspaceBase}/referrals`, label: 'Referrals', icon: icon(<ArrowRight className="size-4" aria-hidden />) });
        if (permissions.canUploadDocuments) workspaceItems.push({ to: `${workspaceBase}/documents`, label: 'Documents', icon: icon(<FileText className="size-4" aria-hidden />) });
        if (permissions.canGenerateReports) workspaceItems.push({ to: `${workspaceBase}/reports`, label: 'Reports', icon: icon(<BarChart3 className="size-4" aria-hidden />) });
      } else {
        workspaceItems.push({ to: '/home/appointments', label: 'My appointments', icon: icon(<CalendarClock className="size-4" aria-hidden />) });
        workspaceItems.push({ to: '/home/records', label: 'My records', icon: icon(<FileText className="size-4" aria-hidden />) });
      }

      // Learning / training library — exists for both staff and mothers.
      workspaceItems.push({
        to: isMother ? '/home/education' : `${workspaceBase}/education`,
        label: 'Training & reading',
        detail: 'Guidance chosen for each stage of pregnancy',
        icon: icon(<GraduationCap className="size-4" aria-hidden />),
      });
      workspaceItems.push({
        to: isMother ? '/home/notifications' : `${workspaceBase}/notifications`,
        label: 'Messages & notifications',
        detail: 'Reminders, alerts and announcements sent to you',
        icon: icon(<MessageSquare className="size-4" aria-hidden />),
      });
      workspaceItems.push({
        to: isMother ? '/home/profile' : `${workspaceBase}/profile`,
        label: 'My profile',
        detail: 'Your details, password and notification settings',
        icon: icon(<UserCog className="size-4" aria-hidden />),
      });
      if (permissions.canManageUsers) workspaceItems.push({ to: '/admin/users', label: 'User accounts', icon: icon(<Users className="size-4" aria-hidden />) });
      if (permissions.canManageFacilities) workspaceItems.push({ to: '/admin/facilities', label: 'Facilities', icon: icon(<Building2 className="size-4" aria-hidden />) });
      if (permissions.canViewAuditLogs) workspaceItems.push({ to: '/admin/audit', label: 'Audit log', icon: icon(<ClipboardList className="size-4" aria-hidden />) });
      if (permissions.canManageSettings) workspaceItems.push({ to: '/admin/settings', label: 'Platform settings', icon: icon(<Shield className="size-4" aria-hidden />) });
    }

    const accountSection: MainMenuSection = {
      id: 'account',
      title: actor ? 'Your account' : 'Sign in or register',
      items: actor
        ? [{ to: '#signout', label: 'Sign out', detail: 'End this session on this device', icon: icon(<LogOut className="size-4" aria-hidden />) }]
        : [
            { to: '/signin', label: 'Sign in', detail: 'Staff and mothers use the same sign-in', icon: icon(<LogIn className="size-4" aria-hidden />) },
            { to: '/register', label: 'Create an account', detail: 'Free, and open to everyone', icon: icon(<UserPlus className="size-4" aria-hidden />) },
            { to: '/forgot-password', label: 'Reset a password', icon: icon(<ShieldCheck className="size-4" aria-hidden />) },
          ],
    };

    const supportSection: MainMenuSection = {
      id: 'support',
      title: 'Help & support',
      items: [
        { to: '/faq', label: 'Questions & answers', detail: 'How accounts, records and consent work', icon: icon(<HelpCircle className="size-4" aria-hidden />) },
        { to: '/contact', label: 'Contact support', detail: 'Reach the platform team', icon: icon(<PhoneCall className="size-4" aria-hidden />) },
        { to: '/status', label: 'Service status', detail: 'Which integrations are configured on this deployment', icon: icon(<BadgeCheck className="size-4" aria-hidden />) },
        { to: '/privacy', label: 'Privacy & data', detail: 'What is stored, where, and for how long', icon: icon(<ShieldCheck className="size-4" aria-hidden />) },
      ],
    };

    if (!actor) {
      return [publicSection, accountSection, supportSection];
    }
    return [
      publicSection,
      { id: 'workspace', title: 'Your workspace', items: workspaceItems },
      accountSection,
      supportSection,
    ];
  }, [actor, permissions]);
}

export function MainMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { actor, providerKind, signOut } = useSession();
  const sections = useMainMenuSections();
  const navigate = useNavigate();

  const close = (): void => onClose();

  return (
    <Drawer open={open} onClose={close} title="Main menu">
      <div className="space-y-5">
        <section className="overflow-hidden rounded-xl border border-ink-200">
          {actor ? (
            <div className="flex items-center gap-3 bg-white p-3.5">
              <Avatar name={actor.displayName || actor.email} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.9rem] font-semibold text-ink-900">{actor.displayName || actor.email}</p>
                <p className="truncate text-[0.76rem] text-ink-500">{actor.email}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge tone={actor.role === 'ADMIN' ? 'purple' : actor.role === 'MOTHER' ? 'green' : 'brand'}>
                    {ROLE_LABELS[actor.role] ?? actor.role}
                  </Badge>
                  {actor.accountStatus === 'PENDING_APPROVAL' ? <Badge tone="amber">Awaiting approval</Badge> : null}
                </div>
                {actor.claimSyncNotice ? (
                  <p className="mt-1.5 text-[0.72rem] leading-snug text-[var(--color-risk-amber-text)]">{actor.claimSyncNotice}</p>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="relative">
              <AppImage name="aboutPlatform" ratio="16 / 7" sizes="420px" />
              <div className="absolute inset-0 bg-gradient-to-t from-brand-950/95 to-brand-950/40" aria-hidden />
              <div className="absolute inset-x-0 bottom-0 p-3.5">
                <p className="text-[0.86rem] font-semibold text-white">Browse first. Register when you are ready.</p>
                <p className="mt-0.5 text-[0.74rem] leading-snug text-brand-100/85">
                  Everything about the platform is public — sign-in is only needed for records.
                </p>
              </div>
            </div>
          )}
        </section>

        {sections.map((section) => (
          <nav key={section.id} aria-label={section.title}>
            <h3 className="micro mb-2 px-1">{section.title}</h3>
            <ul className="space-y-0.5">
              {section.items.map((item) =>
                item.to === '#signout' ? (
                  <li key={item.to}>
                    <button
                      type="button"
                      onClick={() => {
                        void signOut();
                        close();
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-ink-100"
                    >
                      {item.icon}
                      <span className="min-w-0">
                        <span className="block truncate text-[0.86rem] font-semibold text-ink-800">{item.label}</span>
                        {item.detail ? <span className="block text-[0.74rem] text-ink-500">{item.detail}</span> : null}
                      </span>
                    </button>
                  </li>
                ) : (
                  <li key={`${section.id}-${item.to}`}>
                    <Link
                      to={item.to}
                      onClick={(event) => {
                        // In-page anchors keep the drawer open until the scroll
                        // target is reached, so the visitor is not left staring
                        // at a closed menu with no visible change.
                        if (item.to.includes('#')) {
                          event.preventDefault();
                          navigate(item.to);
                          close();
                          return;
                        }
                        close();
                      }}
                      className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink-100"
                    >
                      {item.icon}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.86rem] font-semibold text-ink-800">{item.label}</span>
                        {item.detail ? <span className="block text-[0.74rem] leading-snug text-ink-500">{item.detail}</span> : null}
                      </span>
                      <ArrowRight className="size-4 shrink-0 text-ink-300" aria-hidden />
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>
        ))}

        <div className={cn('rounded-xl border border-ink-200 bg-ink-50 p-3.5 text-[0.74rem] leading-relaxed text-ink-600')}>
          <p className="flex items-center gap-1.5 font-semibold text-ink-700">
            <ShieldCheck className="size-3.5 text-brand-700" aria-hidden />
            {providerKind === 'firebase' ? 'Connected to the clinic database' : 'Running on this device'}
          </p>
          <p className="mt-1">
            {providerKind === 'firebase'
              ? 'Reads and writes are enforced by database security rules on every record, not only by what this menu shows.'
              : 'No Firebase project is configured in this build, so records are stored in this browser. Signs of a real deployment: Firestore keys and the API service.'}
          </p>
          <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            <Link to="/faq" onClick={close} className="font-semibold text-brand-800 hover:underline">
              <Newspaper className="mr-1 inline size-3" aria-hidden />
              How it works
            </Link>
            <Link to="/maternal-health" onClick={close} className="font-semibold text-brand-800 hover:underline">
              <BookOpen className="mr-1 inline size-3" aria-hidden />
              Maternal health
            </Link>
          </p>
        </div>
      </div>
    </Drawer>
  );
}

/** The header button that opens the main menu. */
export function MainMenuButton({
  open,
  onToggle,
  tone = 'quiet',
  labelled = true,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  tone?: 'quiet' | 'ghost';
  labelled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'btn btn-sm min-h-9 gap-2',
        tone === 'quiet' ? 'btn-quiet' : 'btn-ghost',
        !labelled && 'size-9 min-h-9 px-0',
        className,
      )}
    >
      <MenuIcon open={open} />
      <span className={labelled ? 'hidden sm:inline' : 'sr-only'}>{open ? 'Close menu' : 'Menu'}</span>
    </button>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <span className="relative grid size-4 place-items-center" aria-hidden>
      <span className={cn('absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-200', open ? 'rotate-45' : '-translate-y-1')} />
      <span className={cn('absolute h-0.5 w-4 rounded-full bg-current transition-opacity duration-200', open ? 'opacity-0' : 'opacity-100')} />
      <span className={cn('absolute h-0.5 w-4 rounded-full bg-current transition-transform duration-200', open ? '-rotate-45' : 'translate-y-1')} />
    </span>
  );
}

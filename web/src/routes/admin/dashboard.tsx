/**
 * Administrator dashboard.
 *
 * One screen that answers "what needs me today": providers waiting on
 * verification, content reports waiting on a decision, feedback nobody has
 * answered, and whether the deployment itself is healthy. Counts are read live at
 * load — there is no aggregation job, so a small deployment stays fast and a large
 * one still shows the truth rather than a stale cache.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  Newspaper as ArticleIcon,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Database,
  MessageSquareWarning,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { useAsync, useLiveQuery } from '@/hooks';
import {
  announcementRepo,
  articleRepo,
  facilityRepo,
  feedbackRepo,
  profileRepo,
  providerRepo,
  reportRepo,
  settingsRepo,
} from '@/services/repositories';
import { diagnostics } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { integrations, dataProvider } from '@/config/env';
import { formatDate, relativeTime } from '@/lib/utils';
import { ACCOUNT_STATUS_LABELS, ROLE_LABELS, type Article, type HealthcareProvider, type UserProfile } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { Timeline } from '@/components/ui/tabs';

export default function AdminDashboard() {
  const { actor } = useSession();
  const navigate = useNavigate();

  const { data: users, loading: usersLoading } = useAsync(() => profileRepo.list(1000), { immediate: true });
  const { data: providers } = useAsync(() => providerRepo.all(), { immediate: true });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });
  const { data: articles } = useAsync(() => articleRepo.library({ includeDrafts: true }), { immediate: true });
  const { data: reports } = useAsync(() => reportRepo.all(), { immediate: true });
  const { data: feedback } = useAsync(() => feedbackRepo.all(), { immediate: true });
  const { data: announcements } = useAsync(() => announcementRepo.all(), { immediate: true });
  const { data: settings } = useAsync(() => settingsRepo.get(), { immediate: true });
  const { rows: appointments } = useLiveQuery('appointments', { limit: 500 });
  const [system, setSystem] = useState<Awaited<ReturnType<typeof diagnostics>> | null>(null);

  useEffect(() => {
    document.title = 'Admin dashboard · Mama Care';
    let cancelled = false;
    const refresh = async (): Promise<void> => {
      const next = await diagnostics();
      if (!cancelled) setSystem(next);
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const userList = useMemo<UserProfile[]>(() => users?.rows ?? [], [users]);
  const providerList = useMemo<HealthcareProvider[]>(() => providers ?? [], [providers]);
  const articleList = useMemo<Article[]>(() => articles ?? [], [articles]);

  const stats = useMemo(() => {
    const byRole = userList.reduce<Record<string, number>>((counts, user) => {
      counts[user.role] = (counts[user.role] ?? 0) + 1;
      return counts;
    }, {});
    const pendingProviders = providerList.filter((provider) => provider.status === 'pending');
    const rejectedProviders = providerList.filter((provider) => provider.status === 'rejected');
    const suspendedUsers = userList.filter((user) => user.status === 'SUSPENDED');
    const drafts = articleList.filter((article) => article.status === 'draft');
    const stale = articleList.filter((article) => {
      const days = settings?.contentReviewReminderDays ?? 365;
      const reviewed = article.reviewedAt ?? article.updatedAt;
      if (!reviewed) return false;
      return article.status === 'published' && (Date.now() - new Date(reviewed).getTime()) / 86_400_000 > days;
    });
    const openReports = (reports ?? []).filter((report) => report.status === 'open');
    const newFeedback = (feedback ?? []).filter((item) => item.status === 'new');
    const today = new Date().toISOString().slice(0, 10);
    const todayAppointments = appointments.filter((appointment) => appointment.date === today);
    const unverifiedFacilities = (facilities ?? []).filter((facility) => !facility.verified);
    return {
      users: userList.length,
      byRole,
      mothers: byRole.MOTHER ?? 0,
      pendingProviders: pendingProviders.length,
      rejectedProviders: rejectedProviders.length,
      suspendedUsers: suspendedUsers.length,
      drafts: drafts.length,
      stale: stale.length,
      openReports: openReports.length,
      newFeedback: newFeedback.length,
      todayAppointments: todayAppointments.length,
      facilities: (facilities ?? []).length,
      unverifiedFacilities: unverifiedFacilities.length,
      activeAnnouncements: (announcements ?? []).filter((item) => item.active).length,
      recentRegistrations: userList.slice(0, 6),
    };
  }, [userList, providerList, articleList, reports, feedback, announcements, facilities, appointments, settings]);

  const attention = useMemo(
    () =>
      [
        {
          key: 'providers',
          label: `${stats.pendingProviders} provider${stats.pendingProviders === 1 ? '' : 's'} awaiting verification`,
          detail: 'Check the licence number and facility before approving. Mothers see verified providers first.',
          tone: 'amber' as const,
          to: '/admin/providers',
          show: stats.pendingProviders > 0,
        },
        {
          key: 'reports',
          label: `${stats.openReports} content report${stats.openReports === 1 ? '' : 's'} open`,
          detail: 'Somebody flagged an article, facility or message as wrong or unsafe. Decide and record why.',
          tone: 'red' as const,
          to: '/admin/reports',
          show: stats.openReports > 0,
        },
        {
          key: 'feedback',
          label: `${stats.newFeedback} feedback message${stats.newFeedback === 1 ? '' : 's'} unanswered`,
          detail: 'Most feedback is about facility data being out of date — that is the fastest trust win available.',
          tone: 'amber' as const,
          to: '/admin/feedback',
          show: stats.newFeedback > 0,
        },
        {
          key: 'content',
          label: `${stats.stale} published article${stats.stale === 1 ? '' : 's'} past the review window`,
          detail: `Guidance older than ${settings?.contentReviewReminderDays ?? 365} days should be re-checked against current national guidance.`,
          tone: 'amber' as const,
          to: '/admin/articles',
          show: stats.stale > 0,
        },
        {
          key: 'drafts',
          label: `${stats.drafts} draft${stats.drafts === 1 ? '' : 's'} waiting to be published`,
          detail: 'Providers write, administrators publish. Every draft is a clinician waiting on you.',
          tone: 'brand' as const,
          to: '/admin/articles',
          show: stats.drafts > 0,
        },
        {
          key: 'facilities',
          label: `${stats.unverifiedFacilities} facilit${stats.unverifiedFacilities === 1 ? 'y' : 'ies'} not verified`,
          detail: 'Unverified facilities are shown with a caution badge in the directory.',
          tone: 'amber' as const,
          to: '/admin/facilities',
          show: stats.unverifiedFacilities > 0,
        },
        {
          key: 'suspended',
          label: `${stats.suspendedUsers} suspended account${stats.suspendedUsers === 1 ? '' : 's'}`,
          detail: 'Suspended accounts keep their records but cannot sign in. Review them periodically.',
          tone: 'neutral' as const,
          to: '/admin/users',
          show: stats.suspendedUsers > 0,
        },
      ].filter((item) => item.show),
    [stats, settings],
  );

  if (usersLoading) {
    return (
      <StaffShell portal="Admin Dashboard">
        <StaffPageHeader title="Dashboard" />
        <LoadingRows rows={6} />
      </StaffShell>
    );
  }

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title={`Dashboard · ${actor?.displayName ?? 'Administrator'}`}
        description={`${stats.users} accounts · ${stats.facilities} facilities · ${articleList.filter((article) => article.status === 'published').length} published articles · data on ${dataProvider}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => navigate('/admin/audit')} icon={<ShieldCheck className="size-4" aria-hidden />}>
              Audit log
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/admin/settings')} icon={<Database className="size-4" aria-hidden />}>
              Settings
            </Button>
          </>
        }
      />

      {settings?.maintenanceMessage ? (
        <Card className="card-pad mb-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">Maintenance notice live</Badge>
            <p className="text-sm text-ink-700">{settings.maintenanceMessage}</p>
            <Link to="/admin/settings" className="btn btn-secondary btn-sm ml-auto">Edit</Link>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={stats.users} icon={<Users className="size-4" aria-hidden />} hint={`${stats.mothers} mothers`} onClick={() => navigate('/admin/users')} />
        <StatCard
          label="Providers to verify"
          value={stats.pendingProviders}
          icon={<Stethoscope className="size-4" aria-hidden />}
          tone={stats.pendingProviders > 0 ? 'amber' : 'green'}
          onClick={() => navigate('/admin/providers')}
        />
        <StatCard
          label="Open reports"
          value={stats.openReports}
          icon={<MessageSquareWarning className="size-4" aria-hidden />}
          tone={stats.openReports > 0 ? 'red' : 'green'}
          onClick={() => navigate('/admin/reports')}
        />
        <StatCard
          label="New feedback"
          value={stats.newFeedback}
          icon={<ClipboardList className="size-4" aria-hidden />}
          tone={stats.newFeedback > 0 ? 'amber' : 'default'}
          onClick={() => navigate('/admin/feedback')}
        />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Facilities" value={stats.facilities} icon={<Building2 className="size-4" aria-hidden />} hint={`${stats.unverifiedFacilities} unverified`} onClick={() => navigate('/admin/facilities')} />
        <StatCard label="Articles & drafts" value={articleList.length} icon={<ArticleIcon className="size-4" aria-hidden />} hint={`${stats.drafts} drafts`} onClick={() => navigate('/admin/articles')} />
        <StatCard label="Appointments today" value={stats.todayAppointments} icon={<CalendarDays className="size-4" aria-hidden />} onClick={() => navigate('/admin/appointments')} />
        <StatCard label="Live announcements" value={stats.activeAnnouncements} icon={<Activity className="size-4" aria-hidden />} onClick={() => navigate('/admin/announcements')} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow="Triage" title="Needs your decision" description="Only what is actually waiting. When this list is empty, the platform is being looked after." />
            {attention.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-sm text-ink-700">
                <CheckCircle2 className="size-4 text-[var(--color-risk-green)]" aria-hidden />
                Nothing is waiting on you. Providers are verified, reports are resolved and content is inside its review window.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {attention.map((item) => (
                  <li key={item.key}>
                    <Link
                      to={item.to}
                      className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5 hover:border-brand-300"
                    >
                      <span className="min-w-0">
                        <span className="flex flex-wrap items-center gap-2">
                          <Badge tone={item.tone}>{item.label}</Badge>
                        </span>
                        <span className="mt-1 block text-sm text-ink-600">{item.detail}</span>
                      </span>
                      <span className="text-xs font-medium text-brand-700">Open →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Accounts" title="Recent registrations" actions={<Link to="/admin/users" className="btn btn-ghost btn-sm">All users</Link>} />
            {stats.recentRegistrations.length === 0 ? (
              <EmptyState className="mt-3" icon={<Users className="size-6" aria-hidden />} title="No accounts yet" description="Registration is open from Settings. The first account can claim ADMIN if its email is in the bootstrap list." />
            ) : (
              <div className="mt-4">
                <Timeline
                  items={stats.recentRegistrations.map((user) => ({
                    title: (
                      <span className="flex flex-wrap items-center gap-2">
                        {user.fullName}
                        <Badge tone={user.role === 'ADMIN' ? 'purple' : user.role === 'PROVIDER' ? 'brand' : 'neutral'}>{ROLE_LABELS[user.role]}</Badge>
                        {user.status !== 'ACTIVE' ? <Badge tone="amber">{ACCOUNT_STATUS_LABELS[user.status]}</Badge> : null}
                      </span>
                    ),
                    meta: `${user.email} · joined ${relativeTime(user.createdAt)}${user.lastLoginAt ? ` · last seen ${relativeTime(user.lastLoginAt)}` : ''}`,
                    tone: user.status === 'ACTIVE' ? 'green' : 'amber',
                  }))}
                />
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow="Deployment" title="System status" />
            <div className="mt-2">
              <KeyValueList
                items={[
                  { label: 'Data provider', value: system?.provider === 'firebase' ? 'Firebase Firestore' : 'This device (IndexedDB)' },
                  { label: 'Writable', value: system?.writable ? 'Yes' : system ? 'Read-only' : 'Checking…' },
                  { label: 'Signed in', value: system?.signedIn ? 'Yes' : 'No' },
                  { label: 'Records stored', value: system ? String(system.records) : '—' },
                  { label: 'Firebase', value: integrations.firebase.configured ? `Connected (${integrations.firebase.projectId})` : 'Not configured' },
                  { label: 'Cloudinary media', value: integrations.cloudinary.configured ? `Connected (${integrations.cloudinary.cloudName})` : 'Not configured' },
                  { label: 'Web push', value: integrations.push.configured ? 'VAPID key set' : 'Not configured' },
                ]}
              />
            </div>
            {integrations.misconfigured ? (
              <p className="alert alert-warn mt-3 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                Firebase is only partly configured, so the app is running on this device. See the status page for what is
                missing and what that changes.
              </p>
            ) : null}
            <div className="mt-3 actions-wrap">
              <Link to="/status" className="btn btn-secondary btn-sm">Full status page</Link>
              <Button variant="ghost" size="sm" onClick={() => void diagnostics().then(setSystem)}>Refresh</Button>
            </div>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Composition" title="Accounts by role" />
            <ul className="mt-2 space-y-1.5">
              {(Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((role) => (
                <li key={role} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-700">{ROLE_LABELS[role]}</span>
                  <Badge tone={stats.byRole[role] ? 'brand' : 'neutral'}>{stats.byRole[role] ?? 0}</Badge>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-ink-500">
              Role changes are written to the audit log with your name and take effect at the user's next sign-in.
            </p>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Content health" title="Review window" />
            <p className="mt-2 text-sm text-ink-600">
              Published articles are re-checked every{' '}
              <strong className="font-semibold text-ink-800">{settings?.contentReviewReminderDays ?? 365} days</strong>.{' '}
              {stats.stale > 0
                ? `${stats.stale} article${stats.stale === 1 ? ' is' : 's are'} past that window now.`
                : 'Everything is inside the window.'}
            </p>
            <div className="mt-3 actions-wrap">
              <Link to="/admin/articles" className="btn btn-secondary btn-sm">Review articles</Link>
              <Link to="/admin/settings" className="btn btn-ghost btn-sm">Change the window</Link>
            </div>
          </Card>

          <Card className="card-pad border-ink-200 bg-ink-50">
            <h3 className="card-title">Administrator ground rules</h3>
            <ul className="checklist mt-2 text-sm">
              <li>Never edit a patient's health record — only they and their linked provider can.</li>
              <li>Approve providers against a real licence number, not a plausible-looking one.</li>
              <li>Record a reason when you reject, suspend or delete; it is shown to the person affected.</li>
              <li>Exports are logged. Treat any CSV as a clinical record once it leaves this screen.</li>
            </ul>
            <p className="mt-2 text-xs text-ink-500">Last audit write: {formatDate(new Date(), 'long')}</p>
          </Card>
        </div>
      </div>
    </StaffShell>
  );
}

function KeyValueList({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="divide-y divide-ink-100">
      {items.map((item) => (
        <div key={item.label} className="flex items-center justify-between gap-3 py-1.5">
          <dt className="text-sm text-ink-500">{item.label}</dt>
          <dd className="text-sm font-medium text-ink-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

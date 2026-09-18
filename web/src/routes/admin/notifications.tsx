/**
 * Administrator — broadcast notifications.
 *
 * Writes one in-app notification per recipient. This is not a marketing tool and the
 * interface says so: segments are clinical or operational (all mothers, providers,
 * a country), the recipient count is shown before you send, and every broadcast is
 * written to the audit log with your name.
 *
 * Push delivery is attempted separately by the reminder engine for devices that have
 * granted permission; a broadcast always creates the in-app record first, because a
 * notification that only exists as a push is a notification a mother may never see.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  BellRing,
  Megaphone,
  Send,
  Users,
} from 'lucide-react';
import { useAsync, useLiveQuery } from '@/hooks';
import { notificationRepo, profileRepo, settingsRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { relativeTime } from '@/lib/utils';
import {
  ROLE_LABELS,
  type AppNotification,
  type NotificationKind,
  type Role,
  type UserProfile,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

type Segment = 'all' | Role | 'staff' | 'mothers-and-supporters';

const SEGMENT_LABELS: Record<Segment, string> = {
  all: 'Everyone on the platform',
  MOTHER: 'Mothers only',
  PATIENT: 'Patients only',
  SUPPORTER: 'Family supporters',
  PROVIDER: 'Healthcare providers',
  NURSE: 'Nurses',
  FACILITY_ADMIN: 'Facility administrators',
  ADMIN: 'Administrators',
  staff: 'All staff (providers, nurses, facility admins, administrators)',
  'mothers-and-supporters': 'Mothers and their supporters',
};

const KIND_LABELS: Record<NotificationKind, string> = {
  appointment: 'Appointment',
  reminder: 'Reminder',
  education: 'Education',
  milestone: 'Milestone',
  baby: 'Baby',
  message: 'Message',
  system: 'System notice',
  immunization: 'Immunization',
};

export default function AdminNotifications() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [segment, setSegment] = useState<Segment>('all');
  const [country, setCountry] = useState('ALL');
  const [kind, setKind] = useState<NotificationKind>('system');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const { data: users, loading } = useAsync(() => profileRepo.list(1000), { immediate: true });
  const { data: settings } = useAsync(() => settingsRepo.get(), { immediate: true });
  const { rows: recent, loading: recentLoading, refresh } = useLiveQuery('notifications', {
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 60,
  });

  const allUsers = useMemo<UserProfile[]>(() => users?.rows ?? [], [users]);
  const countries = useMemo(() => Array.from(new Set(allUsers.map((user) => user.country))).sort(), [allUsers]);

  const recipients = useMemo(
    () =>
      allUsers.filter((user) => {
        if (user.status === 'CLOSED') return false;
        if (country !== 'ALL' && user.country !== country) return false;
        switch (segment) {
          case 'all':
            return true;
          case 'staff':
            return ['PROVIDER', 'FACILITY_ADMIN', 'ADMIN'].includes(user.role);
          case 'mothers-and-supporters':
            return user.role === 'MOTHER' || user.role === 'SUPPORTER';
          default:
            return user.role === segment;
        }
      }),
    [allUsers, segment, country],
  );

  useEffect(() => {
    document.title = 'Broadcast · Mama Care admin';
  }, []);

  const send = async (): Promise<void> => {
    setError(null);
    if (title.trim().length < 4) { setError('A notification needs a title of at least four characters.'); return; }
    if (body.trim().length < 10) { setError('Write at least ten characters so the notification says something useful.'); return; }
    if (recipients.length === 0) { setError('Nobody matches this segment.'); return; }

    const ok = await confirm({
      title: `Send to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}?`,
      message: `“${title.trim()}” goes to ${SEGMENT_LABELS[segment]}${country !== 'ALL' ? ` in ${country}` : ''}. It lands in their notification list immediately and cannot be recalled — only deleted one by one. A broadcast should be something they would thank you for.`,
      confirmLabel: 'Send broadcast',
    });
    if (!ok) return;

    setSending(true);
    setProgress({ done: 0, total: recipients.length });
    let sent = 0;
    let failed = 0;
    for (const [index, user] of recipients.entries()) {
      try {
        await notificationRepo.push({
          userId: user.uid,
          title: title.trim(),
          body: body.trim(),
          kind,
          link: link.trim() || null,
        });
        sent += 1;
      } catch {
        failed += 1;
      }
      setProgress({ done: index + 1, total: recipients.length });
    }
    await logAudit('record-create', 'notifications', null, `Broadcast “${title.trim()}” to ${sent} of ${recipients.length} (${SEGMENT_LABELS[segment]}${country !== 'ALL' ? `, ${country}` : ''})`);
    setSending(false);
    setProgress(null);
    if (failed > 0) toast.error(`${sent} sent, ${failed} failed`, 'Some accounts could not be written to. Check the audit log for what landed.');
    else toast.success(`Sent to ${sent} ${sent === 1 ? 'person' : 'people'}`, 'It appears in their notification list now.');
    setTitle('');
    setBody('');
    setLink('');
    refresh();
  };

  const grouped = useMemo(() => {
    const byTitle = new Map<string, { title: string; kind: NotificationKind; count: number; latest: string; link: string | null }>();
    for (const item of recent as AppNotification[]) {
      const entry = byTitle.get(item.title) ?? { title: item.title, kind: item.kind, count: 0, latest: item.createdAt ?? '', link: item.link };
      entry.count += 1;
      if ((item.createdAt ?? '') > entry.latest) entry.latest = item.createdAt ?? entry.latest;
      byTitle.set(item.title, entry);
    }
    return Array.from(byTitle.values()).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [recent]);

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Broadcast a notification"
        description="One in-app notification per recipient. Use it for something operational — a service change, a reminder campaign, a new article — not for anything a mother should have to act on clinically."
        actions={
          <Link to="/admin/announcements" className="btn btn-secondary btn-sm">
            <Megaphone className="size-4" aria-hidden />
            Site banners instead
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Would receive this" value={recipients.length} icon={<Users className="size-4" aria-hidden />} tone={recipients.length > 0 ? 'brand' : 'default'} hint={SEGMENT_LABELS[segment]} />
        <StatCard label="Accounts on platform" value={allUsers.length} icon={<Bell className="size-4" aria-hidden />} hint={`${countries.length} countries`} />
        <StatCard label="Notifications on record" value={(recent as AppNotification[]).length} icon={<BellRing className="size-4" aria-hidden />} hint="Most recent 60" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="card-pad">
          <SectionHeading eyebrow="Compose" title="Message" description="Short, factual and actionable. It is read on a phone, often in a queue at a clinic." />
          <div className="mt-3 space-y-4">
            <FieldGrid columns={2}>
              <Field label="Who receives it" htmlFor="bn-segment" required>
                <Select
                  id="bn-segment"
                  value={segment}
                  onChange={(event) => setSegment(event.target.value as Segment)}
                  options={(Object.keys(SEGMENT_LABELS) as Segment[]).map((value) => ({ value, label: SEGMENT_LABELS[value] }))}
                />
              </Field>
              <Field label="Country" htmlFor="bn-country" hint="Narrow it — a national message rarely fits everybody.">
                <Select
                  id="bn-country"
                  value={country}
                  onChange={(event) => setCountry(event.target.value)}
                  options={[{ value: 'ALL', label: 'All countries' }, ...countries.map((value) => ({ value, label: value }))]}
                />
              </Field>
            </FieldGrid>
            <FieldGrid columns={2}>
              <Field label="Category" htmlFor="bn-kind" hint="Controls the label and whether a person's preferences filter it.">
                <Select
                  id="bn-kind"
                  value={kind}
                  onChange={(event) => setKind(event.target.value as NotificationKind)}
                  options={(Object.keys(KIND_LABELS) as NotificationKind[]).map((value) => ({ value, label: KIND_LABELS[value] }))}
                />
              </Field>
              <Field label="Link (optional)" htmlFor="bn-link" hint="A path such as /learn/iron-tablets or /app/appointments.">
                <TextInput id="bn-link" value={link} onValueChange={setLink} placeholder="/learn" />
              </Field>
            </FieldGrid>
            <Field label="Title" htmlFor="bn-title" required error={error && title.trim().length < 4 ? error : undefined}>
              <TextInput id="bn-title" value={title} onValueChange={setTitle} placeholder="e.g. Antenatal clinic hours change this month" />
            </Field>
            <Field label="Message" htmlFor="bn-body" required error={error && body.trim().length < 10 ? error : undefined} hint="One or two sentences. No medical advice, no diagnosis.">
              <TextArea id="bn-body" rows={4} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Chilenje clinic antenatal hours are 07:00–13:00 from Monday. Call ahead if you are more than 34 weeks." />
            </Field>
            {error ? <p className="alert alert-error">{error}</p> : null}

            <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
              <p className="micro">Preview — exactly what a recipient sees</p>
              <div className="mt-2 flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <BellRing className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-ink-800">{title || 'Your title'}</span>
                    <Badge tone="neutral">{KIND_LABELS[kind]}</Badge>
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-600">{body || 'Your message appears here.'}</span>
                  {link ? <span className="mt-1 block text-xs text-brand-700 underline">{link}</span> : null}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-ink-500">
                {recipients.length} recipient{recipients.length === 1 ? '' : 's'} · sent by {actor?.displayName ?? 'administrator'} ·
                logged to the audit trail
              </p>
              <Button onClick={() => void send()} loading={sending} disabled={recipients.length === 0} icon={<Send className="size-4" aria-hidden />}>
                {sending && progress ? `Sending ${progress.done}/${progress.total}` : 'Send broadcast'}
              </Button>
            </div>
            {sending && progress ? (
              <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }} />
              </div>
            ) : null}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow="Recent" title="Broadcasts and system notifications" />
            {recentLoading ? <LoadingRows className="mt-3" rows={4} /> : null}
            {!recentLoading && grouped.length === 0 ? (
              <EmptyState className="mt-3" icon={<Bell className="size-6" aria-hidden />} title="Nothing sent yet" description="Notifications created by the reminder engine and by your broadcasts appear here, newest first." />
            ) : null}
            <ul className="mt-3 space-y-2">
              {grouped.slice(0, 12).map((item) => (
                <li key={item.title} className="rounded-lg border border-ink-200 px-3 py-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm font-medium text-ink-800">{item.title}</span>
                    <Badge tone={item.count > 1 ? 'brand' : 'neutral'}>×{item.count}</Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {KIND_LABELS[item.kind]} · {item.latest ? relativeTime(item.latest) : '—'}
                    {item.link ? ` · ${item.link}` : ''}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Delivery" title="What a broadcast actually does" />
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Creates', value: 'One notification record per recipient' },
                { label: 'Push', value: 'Sent by the reminder engine to devices that allowed notifications' },
                { label: 'Respects', value: 'Each person’s notification preferences and quiet hours' },
                { label: 'Cannot', value: 'Be recalled once sent — only deleted individually' },
                { label: 'Logged', value: 'Every broadcast, with the sender and the recipient count' },
              ]}
            />
            <p className="mt-3 text-sm text-ink-600">
              Mothers can turn a whole category off in their own Settings. If you broadcast under “Education” and somebody has
              education notifications disabled, they will not see it — choose “System notice” for something everyone must
              receive.
            </p>
          </Card>

          <Card className="card-pad border-ink-200 bg-ink-50">
            <h3 className="card-title">Before you press send</h3>
            <ul className="checklist mt-2 text-sm">
              <li>Would this person thank you for the interruption?</li>
              <li>Is there a date in it? Notifications without dates get acted on late or never.</li>
              <li>Is anything clinical in it? If so, it belongs with a provider, not a broadcast.</li>
              <li>Could a banner do the job instead? Banners do not fill anybody's notification list.</li>
            </ul>
            <div className="mt-3 actions-wrap">
              <Link to="/admin/announcements" className="btn btn-secondary btn-sm">Use a banner</Link>
              <Link to="/admin/audit" className="btn btn-ghost btn-sm">See past broadcasts</Link>
            </div>
          </Card>

          {settings?.maintenanceMessage ? (
            <Card className="card-pad border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
              <h3 className="card-title">A maintenance notice is live</h3>
              <p className="mt-1.5 text-sm text-ink-700">{settings.maintenanceMessage}</p>
              <p className="mt-2 text-xs text-ink-600">
                Banners and broadcasts both showing means people see the same message twice. Pick one.
              </p>
              <div className="mt-3">
                <Link to="/admin/settings" className="btn btn-secondary btn-sm">Edit the notice</Link>
              </div>
            </Card>
          ) : null}

          <Card className="card-pad">
            <SectionHeading eyebrow="Timing" title="Quiet hours" />
            <p className="mt-2 text-sm text-ink-600">
              Each person sets their own quiet window; the reminder engine holds push delivery inside it. In-app records are
              still written immediately, so a broadcast sent at 02:00 appears the moment somebody opens the app but does not
              wake them.
            </p>
          </Card>
        </div>
      </div>
    </StaffShell>
  );
}

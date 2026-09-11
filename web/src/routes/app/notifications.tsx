import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, ExternalLink, Megaphone, RefreshCw, Send } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import { useSession } from '@/providers/app-providers';
import { useAsync, useLiveQuery } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import {
  currentPermission,
  disablePush,
  enablePush,
  markAllNotificationsRead,
  markNotificationRead,
  pushStatus,
  pushSupported,
  sendAnnouncement,
} from '@/services/notifications/notification-service';
import { formatDateTime, relativeTime } from '@/lib/utils';
import type { AppNotification } from '@/types/domain';

/**
 * Notifications: the in-app inbox is the source of truth (it is written before
 * any push or SMS is attempted), and this page is where a device opts in to
 * push. The token is discovered at runtime from the messaging SDK — nothing is
 * typed in or stored in the repository.
 */
export default function NotificationsPage() {
  const { actor, permissions } = useSession();
  const toast = useToast();
  const [filter, setFilter] = useState<'unread' | 'all'>('unread');
  const [toggling, setToggling] = useState(false);

  const live = useLiveQuery('notifications', {
    where: actor ? [{ field: 'userId', op: '==', value: actor.uid }] : [{ field: 'userId', op: '==', value: '__none__' }],
    orderBy: { field: 'sentAt', direction: 'desc' },
    limit: 80,
  });
  const status = useAsync(() => pushStatusSafe(), {});

  const rows = useMemo(
    () => (live.data as AppNotification[]).filter((row) => (filter === 'unread' ? !row.readAt : true)),
    [live.data, filter],
  );
  const unread = (live.data as AppNotification[]).filter((row) => !row.readAt).length;

  const refreshStatus = () => void status.run();

  useEffect(() => {
    refreshStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePush = async () => {
    setToggling(true);
    try {
      if (status.data && status.data.registered > 0) {
        await disablePush();
        toast.info('Push disabled', 'This device will no longer receive alert notifications. The in-app inbox still records everything.');
      } else {
        const result = await enablePush();
        toast.success('Push enabled', `Token registered for this device (${result.token.slice(0, 8)}…).`);
      }
      refreshStatus();
    } catch (error) {
      toast.error(error, 'Could not change push settings');
    } finally {
      setToggling(false);
    }
  };

  return (
    <AppShell
      title="Notifications"
      subtitle={unread > 0 ? `${unread} unread message${unread === 1 ? '' : 's'}` : 'Nothing unread'}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                try {
                  const count = await markAllNotificationsRead();
                  toast.success('Inbox cleared', `${count} message${count === 1 ? '' : 's'} marked as read.`);
                  void live.refresh();
                } catch (error) {
                  toast.error(error, 'Could not update the inbox');
                }
              }}
              icon={<CheckCheck className="size-4" aria-hidden />}
            >
              Mark all read
            </Button>
          ) : null}
        </>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div>
          <Card
            title="Inbox"
            description="Alerts, appointment reminders and announcements. Deleting a message is not offered — an audit-relevant notification stays in the log and is only marked read."
            bodyClassName="p-0"
            actions={
              <SegmentedControl
                size="sm"
                ariaLabel="Inbox filter"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'unread', label: 'Unread', count: unread },
                  { value: 'all', label: 'All' },
                ]}
              />
            }
          >
            {live.error ? (
              <div className="p-4">
                <ErrorState message={live.error} onRetry={() => void live.refresh()} />
              </div>
            ) : live.loading && rows.length === 0 ? (
              <div className="p-4">
                <LoadingRows rows={4} />
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Bell className="size-5" aria-hidden />}
                title={filter === 'unread' ? 'Nothing unread' : 'No notifications yet'}
                description="When an alert is raised on a mother you are responsible for, or an appointment reminder is queued, it lands here first."
              />
            ) : (
              <ul className="divide-y divide-ink-100">
                {rows.map((row) => (
                  <li key={row.id} className={`flex items-start gap-3 p-3.5 ${row.readAt ? '' : 'bg-brand-50/40'}`}>
                    <span
                      className={`mt-1 size-2 shrink-0 rounded-full ${
                        row.level === 'critical'
                          ? 'bg-[var(--color-risk-red)]'
                          : row.level === 'warning'
                            ? 'bg-[var(--color-risk-amber)]'
                            : row.level === 'success'
                              ? 'bg-[var(--color-risk-green)]'
                              : 'bg-brand-600'
                      }`}
                      aria-hidden
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-[0.88rem] font-semibold text-ink-900">{row.title}</p>
                        <span className="micro shrink-0">{relativeTime(row.sentAt)}</span>
                      </div>
                      <p className="mt-0.5 text-[0.84rem] leading-relaxed text-ink-600">{row.body}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge tone="neutral">{row.kind.replace(/_/g, ' ').toLowerCase()}</Badge>
                        {row.channels.push ? <Badge tone="brand">push</Badge> : null}
                        {row.channels.sms ? <Badge tone="brand">sms</Badge> : null}
                        {row.link ? (
                          <Link to={row.link} className="inline-flex items-center gap-1 text-[0.78rem] font-semibold text-brand-800 hover:underline">
                            Open <ExternalLink className="size-3" aria-hidden />
                          </Link>
                        ) : null}
                        {!row.readAt ? (
                          <button
                            type="button"
                            className="text-[0.78rem] font-semibold text-ink-500 hover:text-ink-800 hover:underline"
                            onClick={async () => {
                              try {
                                await markNotificationRead(row.id);
                                void live.refresh();
                              } catch (error) {
                                toast.error(error, 'Could not mark as read');
                              }
                            }}
                          >
                            Mark read
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="This device" description="Push notifications are per device and per user.">
            <div className="space-y-3">
              <div className="flex items-start gap-2.5 rounded-lg border border-ink-200 p-3">
                <span className="mt-0.5 text-ink-400" aria-hidden>
                  {status.data && status.data.registered > 0 ? <Bell className="size-4" /> : <BellOff className="size-4" />}
                </span>
                <div className="min-w-0">
                  <p className="text-[0.86rem] font-semibold text-ink-900">
                    {status.data && status.data.registered > 0 ? 'Receiving push on this device' : 'Push is off for this device'}
                  </p>
                  <p className="caption mt-0.5">
                    Browser permission: {statusLabel(status.data?.state ?? currentPermission())}
                    {status.data?.tokenPreview ? ` · token ${status.data.tokenPreview}` : ''}
                  </p>
                  <p className="caption">Last checked {status.data ? formatDateTime(new Date().toISOString()) : '—'}</p>
                </div>
              </div>
              <Button className="w-full" loading={toggling} disabled={!pushSupported()} onClick={() => void togglePush()}>
                {status.data && status.data.registered > 0 ? 'Turn off push for this device' : 'Allow notifications on this device'}
              </Button>
              {!pushSupported() ? (
                <p className="caption">This browser does not expose the Notification API, so push is unavailable. In-app notifications still work.</p>
              ) : null}
              {status.error ? <ErrorState message={status.error} onRetry={refreshStatus} compact /> : null}
              <NoticeState tone="info" title="How a token gets here" compact>
                The registration token is requested from the messaging SDK when you press the button above, then written to the devices collection for your
                account. It is never typed in, never committed to the repository, and removing it here stops delivery to this device immediately.
              </NoticeState>
            </div>
          </Card>

          {permissions.canAdministerPlatform || actor?.role === 'FACILITY_SUPERVISOR' ? (
            <AnnouncementComposer facilityId={actor?.facilityId ?? null} onSent={() => void live.refresh()} />
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

function AnnouncementComposer({ facilityId, onSent }: { facilityId: string | null; onSent: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [target, setTarget] = useState<string>(facilityId ?? '');
  const [link, setLink] = useState('/app/alerts');
  const [busy, setBusy] = useState(false);
  const facilities = useAsync(() => services().data.allFacilities(), {});

  const send = async () => {
    if (title.trim().length < 4 || body.trim().length < 10) {
      toast.warning('Add more detail', 'Give the announcement a clear title and at least a sentence of body.');
      return;
    }
    setBusy(true);
    try {
      const result = await sendAnnouncement({
        title: title.trim(),
        body: body.trim(),
        facilityId: target || null,
        link: link || undefined,
      });
      toast.success('Announcement sent', `${result.recipients} recipient${result.recipients === 1 ? '' : 's'} · channels: ${result.channels}`);
      setTitle('');
      setBody('');
      onSent();
    } catch (error) {
      toast.error(error, 'The announcement was not sent');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Announcement" description="Writes an in-app notification for every active account in scope, plus a push where the device is registered.">
      <div className="space-y-3">
        <Field label="Title" required>
          <TextInput value={title} onValueChange={setTitle} placeholder="Delivery ward closed to visitors this week" maxLength={90} />
        </Field>
        <Field label="Message" required hint="No patient identifiers — announcements are broadcast.">
          <TextArea rows={4} value={body} onValueChange={setBody} placeholder="Due to an infection-control review, visitor access to the delivery ward is suspended until further notice. Call the ward desk for urgent messages." />
        </Field>
        <Field label="Audience">
          <Select
            value={target}
            options={[
              { value: '', label: 'Every facility' },
              ...(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name })),
            ]}
            onValueChange={setTarget}
            placeholder={facilities.loading ? 'Loading facilities…' : 'Every facility'}
          />
        </Field>
        <Field label="Link" optional hint="Where the notification takes the reader.">
          <TextInput value={link} onValueChange={setLink} placeholder="/app/alerts" />
        </Field>
        <Button className="w-full" loading={busy} onClick={() => void send()} icon={<Send className="size-4" aria-hidden />}>
          Send announcement
        </Button>
        <p className="caption flex items-center gap-1.5">
          <Megaphone className="size-3.5" aria-hidden /> Recipients and the send time are recorded, so a broadcast can be accounted for later.
        </p>
      </div>
    </Card>
  );
}

const statusLabel = (state: string): string =>
  ({
    granted: 'granted',
    denied: 'blocked in the browser — unblock it in site settings',
    default: 'not asked yet',
    'not-configured': 'not configured (set VITE_FIREBASE_VAPID_KEY)',
    unsupported: 'unsupported',
  })[state] ?? state;

/** Never throws: the page must render even when push is not configured. */
async function pushStatusSafe() {
  try {
    return await pushStatus();
  } catch (error) {
    return {
      state: currentPermission(),
      registered: 0,
      tokenPreview: null,
      lastError: error instanceof Error ? error.message : 'Push status is unavailable.',
    };
  }
}

/**
 * Notifications.
 *
 * Everything the app has told her, in one place — reminders, appointment changes,
 * immunization dates, messages and system notices. Push is optional and this screen
 * is where it is switched on or off, with an honest explanation of what the browser
 * will and will not allow.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, BellOff, BellRing, Check, CheckCheck, Trash2 } from 'lucide-react';
import { useAsync } from '@/hooks';
import { notificationRepo } from '@/services/repositories';
import { disablePush, enablePush, pushState, pushSupported, type PushState } from '@/services/push';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime } from '@/lib/utils';
import type { AppNotification, NotificationKind } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const KIND_LABEL: Record<NotificationKind, string> = {
  appointment: 'Appointment',
  reminder: 'Reminder',
  education: 'Education',
  milestone: 'Milestone',
  baby: 'Baby',
  message: 'Message',
  system: 'System',
  immunization: 'Immunization',
};

const KIND_TONE: Record<NotificationKind, 'brand' | 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'neutral'> = {
  appointment: 'brand',
  reminder: 'amber',
  education: 'blue',
  milestone: 'green',
  baby: 'purple',
  message: 'brand',
  system: 'neutral',
  immunization: 'green',
};

export default function NotificationsPage() {
  const { actor } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';

  const [view, setView] = useState<'all' | 'unread'>('all');
  const [push, setPush] = useState<PushState | null>(null);
  const pushStatus = push?.status ?? 'unsupported';
  const [pushBusy, setPushBusy] = useState(false);

  const { data, loading, error, retryable, run } = useAsync(
    () => notificationRepo.list(uid, 100),
    { deps: [uid], immediate: Boolean(uid) },
  );

  const rows = useMemo<AppNotification[]>(() => data?.rows ?? [], [data]);
  const unread = data?.unread ?? 0;
  const filtered = view === 'unread' ? rows.filter((row) => !row.readAt) : rows;

  const refreshPush = useCallback(async () => {
    setPush(await pushState());
  }, []);

  useEffect(() => {
    document.title = 'Notifications · Mama Care';
    if (uid) void refreshPush();
  }, [uid, refreshPush]);

  const open = async (notification: AppNotification): Promise<void> => {
    if (!notification.readAt) {
      await notificationRepo.markRead(notification.id);
      void run();
    }
    if (notification.link) navigate(notification.link);
  };

  const togglePush = async (): Promise<void> => {
    setPushBusy(true);
    try {
      if (pushStatus === 'granted') {
        await disablePush(uid);
        toast.success('Push notifications off', 'Reminders will still appear in the app.');
      } else {
        const next = await enablePush(uid);
        setPush(next);
        if (next.status === 'granted') {
          toast.success('Push notifications on', 'This device will receive reminders even when the app is closed.');
        } else {
          toast.error('Push could not be enabled', next.reason);
        }
      }
      await refreshPush();
    } catch {
      toast.error('That did not work', 'Check your browser settings and try again.');
    } finally {
      setPushBusy(false);
    }
  };

  const pushCopy: Record<PushState['status'], { title: string; body: string; tone: 'green' | 'amber' | 'red' | 'neutral' }> = {
    granted: {
      title: 'Push notifications are on',
      body: 'This device receives reminders, appointment notices and immunization dates even when the app is closed.',
      tone: 'green',
    },
    denied: {
      title: 'Push notifications are blocked',
      body: 'Your browser is refusing notifications for this site. Allow them in your browser settings, then switch push on again. In-app notifications still work.',
      tone: 'red',
    },
    default: {
      title: 'Push notifications are off',
      body: 'Switch them on to receive reminders outside the app. Your browser will ask for permission once.',
      tone: 'amber',
    },
    unsupported: {
      title: 'Push is not available in this browser',
      body: 'In-app notifications still work, and reminders appear here whenever you open Mama Care.',
      tone: 'neutral',
    },
    unconfigured: {
      title: 'Push is not configured for this deployment',
      body: 'In-app notifications still work. A hosted deployment with a VAPID key can deliver reminders outside the app.',
      tone: 'neutral',
    },
    error: {
      title: 'Push could not be started',
      body: 'The notification service did not respond. In-app notifications are unaffected — try again when you have a better connection.',
      tone: 'red',
    },
  };

  const copy = pushCopy[pushStatus] ?? pushCopy.default;

  return (
    <AppShell>
      <PageHeader
        title="Notifications"
        description="Reminders, appointment notices, immunization dates, messages and system announcements — newest first."
        badge={unread > 0 ? <Badge tone="red">{unread} unread</Badge> : <Badge tone="green">All read</Badge>}
        actions={
          <>
            {unread > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<CheckCheck className="size-4" aria-hidden />}
                onClick={async () => {
                  await notificationRepo.markAllRead(uid);
                  toast.success('All marked as read');
                  void run();
                }}
              >
                Mark all read
              </Button>
            ) : null}
            <Button
              variant={pushStatus === 'granted' ? 'secondary' : 'primary'}
              size="sm"
              loading={pushBusy}
              disabled={!pushSupported() && pushStatus !== 'granted'}
              onClick={() => void togglePush()}
              icon={pushStatus === 'granted' ? <BellOff className="size-4" aria-hidden /> : <BellRing className="size-4" aria-hidden />}
            >
              {pushStatus === 'granted' ? 'Turn push off' : 'Turn push on'}
            </Button>
          </>
        }
      />

      <Card className="card-pad mb-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="card-title">{copy.title}</h2>
              <Badge tone={copy.tone}>{pushStatus}</Badge>
            </div>
            <p className="mt-1 text-sm text-ink-600">{copy.body}</p>
            {push && 'reason' in push && push.reason !== copy.body ? <p className="mt-1 text-xs text-ink-500">{push.reason}</p> : null}
          </div>
          <Link to="/app/settings" className="btn btn-ghost btn-sm">
            What I get notified about
          </Link>
        </div>
      </Card>

      <SegmentedControl
        value={view}
        onChange={setView}
        ariaLabel="Notification filter"
        options={[
          { value: 'all', label: 'All', count: rows.length },
          { value: 'unread', label: 'Unread', count: unread },
        ]}
      />

      {error ? <ErrorState className="mt-4" title="Notifications could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={4} /> : null}

      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Bell className="size-6" aria-hidden />}
          title={view === 'unread' ? 'Nothing unread' : 'No notifications yet'}
          description={
            view === 'unread'
              ? 'You are all caught up. New reminders and appointment notices will appear here.'
              : 'Once you add a reminder or an appointment, Mama Care will start keeping you informed here.'
          }
          action={
            view === 'unread' ? (
              <Button variant="secondary" size="sm" onClick={() => setView('all')}>
                Show everything
              </Button>
            ) : (
              <Link to="/app/reminders" className="btn btn-primary btn-sm">
                Add a reminder
              </Link>
            )
          }
        />
      ) : null}

      <ul className="mt-4 space-y-2">
        {filtered.map((notification) => (
          <li key={notification.id}>
            <Card className={cn('card-pad transition-colors', !notification.readAt && 'border-brand-300 bg-brand-50/30')}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => void open(notification)}>
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={KIND_TONE[notification.kind] ?? 'neutral'}>{KIND_LABEL[notification.kind] ?? notification.kind}</Badge>
                    {!notification.readAt ? <span className="size-2 rounded-full bg-brand-600" aria-label="Unread" /> : null}
                    {notification.deliveredByPush ? <Badge tone="neutral">Pushed</Badge> : null}
                  </span>
                  <span className="mt-1.5 block text-[0.95rem] font-semibold text-ink-900">{notification.title}</span>
                  <span className="mt-0.5 block text-sm text-ink-600">{notification.body}</span>
                  <span className="mt-1 block text-xs text-ink-500">
                    {formatDate(notification.createdAt, 'long')} · {relativeTime(notification.createdAt)}
                    {notification.link ? ' · tap to open' : ''}
                  </span>
                </button>
                <div className="actions-wrap">
                  {!notification.readAt ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Mark as read"
                      onClick={async () => {
                        await notificationRepo.markRead(notification.id);
                        void run();
                      }}
                    >
                      <Check className="size-4" aria-hidden />
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Delete notification"
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete this notification',
                        message: notification.title,
                        confirmLabel: 'Delete',
                        tone: 'danger',
                      });
                      if (!ok) return;
                      await notificationRepo.remove(notification.id);
                      void run();
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </Card>
          </li>
        ))}
      </ul>

      <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
        <h3 className="card-title">Quiet hours</h3>
        <p className="mt-1 text-sm text-ink-600">
          Push is silenced overnight so a reminder does not wake you or the baby. Change the hours, or switch individual
          categories off, in Settings.
        </p>
        <div className="mt-3">
          <Link to="/app/settings" className="btn btn-secondary btn-sm">
            Notification settings
          </Link>
        </div>
      </Card>
    </AppShell>
  );
}

import { useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { useAsync, useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import {
  currentPermission,
  disablePush,
  enablePush,
  markAllNotificationsRead,
  markNotificationRead,
  pushSupported,
} from '@/services/notifications/notification-service';
import { formatDateTime, relativeTime } from '@/lib/utils';
import type { AppNotification } from '@/types/domain';

/**
 * The mother’s message list. Every reminder is written here first; a push message
 * is only an extra copy on a device she has chosen to allow.
 */
export default function MotherNotifications() {
  const { actor } = useSession();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const live = useLiveQuery('notifications', {
    where: actor ? [{ field: 'userId', op: '==', value: actor.uid }] : [{ field: 'userId', op: '==', value: '__none__' }],
    orderBy: { field: 'sentAt', direction: 'desc' },
    limit: 60,
  });
  const status = useAsync(
    async () => {
      const { pushStatus } = await import('@/services/notifications/notification-service');
      return pushStatus();
    },
    {},
  );

  const rows = live.data as AppNotification[];
  const unread = rows.filter((row) => !row.readAt).length;
  const registered = (status.data?.registered ?? 0) > 0;

  const toggle = async () => {
    setBusy(true);
    try {
      if (registered) {
        await disablePush();
        toast.info('Reminders switched off on this phone', 'You will still see them when you open this app.');
      } else {
        await enablePush();
        toast.success('Reminders on', 'We will send a reminder before your visit and if anything urgent is recorded.');
      }
      void status.run();
    } catch (error) {
      toast.error(error, 'Your phone did not allow reminders');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell
      title="Messages"
      subtitle={unread > 0 ? `${unread} new from your clinic` : 'Nothing new right now'}
      actions={
        unread > 0 ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={async () => {
              try {
                await markAllNotificationsRead();
                void live.refresh();
              } catch (error) {
                toast.error(error, 'Could not mark your messages as read');
              }
            }}
            icon={<CheckCheck className="size-4" aria-hidden />}
          >
            Mark all read
          </Button>
        ) : null
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {live.error ? <ErrorState message={live.error} onRetry={() => void live.refresh()} title="Your messages did not load" /> : null}
          {live.loading && rows.length === 0 ? (
            <Card>
              <LoadingRows rows={3} />
            </Card>
          ) : rows.length === 0 ? (
            <Card>
              <EmptyState
                icon={<Bell className="size-5" aria-hidden />}
                title="No messages yet"
                description="Appointment reminders and notes from your clinic arrive here. Keep this app on your phone so you do not miss a visit."
              />
            </Card>
          ) : (
            <ul className="space-y-3">
              {rows.map((row) => (
                <li key={row.id}>
                  <Card className={row.readAt ? undefined : 'border-brand-300 bg-brand-50/30'}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[0.95rem] font-semibold text-ink-900">{row.title}</p>
                        <p className="mt-1 text-[0.9rem] leading-relaxed text-ink-700">{row.body}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Badge tone={row.level === 'critical' ? 'red' : row.level === 'warning' ? 'amber' : 'brand'}>{row.kind.replace(/_/g, ' ').toLowerCase()}</Badge>
                          <span className="caption">{formatDateTime(row.sentAt)}</span>
                        </div>
                      </div>
                      {!row.readAt ? (
                        <Button
                          size="sm"
                          variant="ghost"
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
                        </Button>
                      ) : null}
                    </div>
                    {row.motherId && row.kind === 'NEW_ALERT' ? (
                      <p className="caption mt-2 border-t border-ink-100 pt-2">
                        If your clinic asked you to come in, please do so today.
                      </p>
                    ) : null}
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Reminders on this phone">
            <div className="flex items-start gap-2.5 rounded-lg border border-ink-200 p-3">
              <span className="mt-0.5 text-ink-400" aria-hidden>
                {registered ? <Bell className="size-4" /> : <BellOff className="size-4" />}
              </span>
              <div className="min-w-0">
                <p className="text-[0.86rem] font-semibold text-ink-900">{registered ? 'On for this phone' : 'Off for this phone'}</p>
                <p className="caption mt-0.5">
                  {status.loading
                    ? 'Checking this device…'
                    : `Permission: ${
                        { granted: 'allowed', denied: 'blocked — change it in your phone settings', default: 'not asked yet', unsupported: 'not supported by this browser', 'not-configured': 'not set up by your clinic' }[
                          status.data?.state ?? currentPermission()
                        ]
                      } · last message ${rows[0] ? relativeTime(rows[0].sentAt) : 'none yet'}`}
                </p>
              </div>
            </div>
            <Button className="mt-3 w-full" loading={busy} disabled={!pushSupported()} onClick={() => void toggle()}>
              {registered ? 'Turn reminders off' : 'Allow reminders on this phone'}
            </Button>
            {!pushSupported() ? <p className="caption mt-2">This browser cannot receive reminders. Your messages still appear here.</p> : null}
            {status.error ? (
              <div className="mt-3">
                <ErrorState message={status.error} onRetry={() => void status.run()} compact />
              </div>
            ) : null}
          </Card>

          <NoticeState tone="info" title="A note about privacy" compact>
            Reminders go to this phone with a short title, never with your measurements or results in the notification. Open this app to read the whole
            message. If someone else uses your phone, turn reminders off.
          </NoticeState>
        </div>
      </div>
    </AppShell>
  );
}

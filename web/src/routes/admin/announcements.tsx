import { useEffect, useMemo, useState } from 'react';
import { Megaphone, PencilLine, RefreshCw, Send, Trash2, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { CheckboxRow, Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { useSession } from '@/providers/app-providers';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import {
  audienceSize,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  sendAnnouncement,
  updateAnnouncement,
} from '@/services/notifications/announcement-service';
import { ANNOUNCEMENT_AUDIENCE_LABELS, type Announcement, type AnnouncementAudience } from '@/types/domain';
import { formatDateTime, relativeTime } from '@/lib/utils';

/**
 * Announcements.
 *
 * The administrator writes a notice once and chooses who receives it —
 * everyone, health workers, mothers, one facility, or selected individuals.
 * Sending writes one notification per recipient, and re-sending only reaches
 * people who have not had it yet, so a retry after a dropped connection never
 * duplicates anyone's inbox.
 */
export default function AnnouncementsPage() {
  const { actor, permissions } = useSession();
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<AnnouncementAudience>('EVERYONE');
  const [facilityId, setFacilityId] = useState('');
  const [level, setLevel] = useState<Announcement['level']>('info');
  const [recipients, setRecipients] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useAsync(() => listAnnouncements(), {});
  const facilities = useAsync(() => services().data.allFacilities(), {});
  const people = useAsync(() => services().data.list('users', { where: [{ field: 'status', op: '==', value: 'ACTIVE' }], limit: 300 }), {});

  const reach = useAsync(
    () => (audience === 'INDIVIDUALS' && recipients.length === 0 ? Promise.resolve(0) : audienceSize(audience, facilityId || null, recipients)),
    {},
  );
  const runReach = reach.run;

  useEffect(() => {
    void runReach();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audience, facilityId, recipients.length]);

  const peopleRows = useMemo(() => (people.data?.rows ?? []) as { id: string; fullName: string; role: string }[], [people.data]);

  const reload = () => {
    void list.run();
  };

  const submit = async (send: boolean) => {
    if (title.trim().length < 3) {
      toast.error(new Error('Give the announcement a title.'), 'Cannot save this announcement');
      return;
    }
    if (body.trim().length < 10) {
      toast.error(new Error('Write the message people will receive.'), 'Cannot save this announcement');
      return;
    }
    setBusy(send ? 'send' : 'draft');
    try {
      const created = await createAnnouncement(
        {
          title,
          body,
          audience,
          facilityId: audience === 'FACILITY' ? facilityId || null : null,
          recipientIds: audience === 'INDIVIDUALS' ? recipients : [],
          level,
          link: null,
        },
        { send },
      );
      toast.success(
        send ? 'Announcement sent' : 'Draft saved',
        send
          ? `${created.recipients} ${created.recipients === 1 ? 'person has' : 'people have'} it in their notifications.`
          : 'Nothing was delivered yet. Send it when you are ready.',
      );
      setTitle('');
      setBody('');
      setRecipients([]);
      reload();
    } catch (error) {
      toast.error(error, send ? 'The announcement could not be sent' : 'The draft could not be saved');
    } finally {
      setBusy(null);
    }
  };

  const resend = async (row: Announcement) => {
    setBusy(row.id);
    try {
      const sent = await sendAnnouncement(row.id);
      toast.success('Announcement sent', `${sent.recipients} people now have it. Anyone who already received it was skipped.`);
      reload();
    } catch (error) {
      toast.error(error, 'The announcement could not be sent');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: Announcement) => {
    setBusy(row.id);
    try {
      await deleteAnnouncement(row.id);
      toast.info('Announcement removed', row.title);
      reload();
    } catch (error) {
      toast.error(error, 'The announcement could not be removed');
    } finally {
      setBusy(null);
    }
  };

  const togglePublished = async (row: Announcement) => {
    setBusy(row.id);
    try {
      await updateAnnouncement(row.id, { published: !row.published });
      toast.success(row.published ? 'Hidden from the public site' : 'Published to the public site', row.title);
      reload();
    } catch (error) {
      toast.error(error, 'Could not change the announcement');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      title="Announcements"
      subtitle={`${list.data?.length ?? 0} notice${list.data?.length === 1 ? '' : 's'} · send to everyone, a group, a facility or selected people`}
      actions={
        <Button size="sm" variant="secondary" loading={list.loading} onClick={reload} icon={<RefreshCw className="size-4" aria-hidden />}>
          Refresh
        </Button>
      }
    >
      {list.error ? (
        <div className="mb-4">
          <ErrorState message={list.error} onRetry={reload} />
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="space-y-4">
          <Card title="Write an announcement" description="Delivered to each recipient's notifications. Re-sending only reaches people who missed it.">
            <div className="space-y-3">
              <Field label="Title">
                <TextInput value={title} onValueChange={setTitle} placeholder="Delivery ward visiting hours" maxLength={120} />
              </Field>
              <Field label="Message">
                <TextArea
                  rows={5}
                  value={body}
                  onValueChange={setBody}
                  placeholder="Due to an infection-control review, visitor access to the delivery ward is suspended until further notice. Call the ward desk for urgent enquiries."
                  maxLength={1200}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Audience">
                  <Select
                    value={audience}
                    onValueChange={(value) => setAudience(value as AnnouncementAudience)}
                    placeholder={null}
                    options={(Object.keys(ANNOUNCEMENT_AUDIENCE_LABELS) as AnnouncementAudience[]).map((key) => ({
                      value: key,
                      label: ANNOUNCEMENT_AUDIENCE_LABELS[key],
                    }))}
                  />
                </Field>
                <Field label="Tone">
                  <Select
                    value={level}
                    onValueChange={(value) => setLevel(value as Announcement['level'])}
                    placeholder={null}
                    options={[
                      { value: 'info', label: 'Information' },
                      { value: 'success', label: 'Good news' },
                      { value: 'warning', label: 'Important' },
                      { value: 'critical', label: 'Urgent' },
                    ]}
                  />
                </Field>
              </div>

              {audience === 'FACILITY' ? (
                <Field label="Facility">
                  <Select
                    value={facilityId}
                    onValueChange={setFacilityId}
                    placeholder="Select a facility"
                    options={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
                  />
                </Field>
              ) : null}

              {audience === 'INDIVIDUALS' ? (
                <div className="rounded-xl border border-ink-200 p-3">
                  <p className="label">Recipients</p>
                  <div className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                    {people.loading && peopleRows.length === 0 ? (
                      <LoadingRows rows={3} />
                    ) : (
                      peopleRows.map((person) => (
                        <CheckboxRow
                          key={person.id}
                          label={`${person.fullName} · ${person.role.replace(/_/g, ' ').toLowerCase()}`}
                          checked={recipients.includes(person.id)}
                          onChange={(checked) =>
                            setRecipients((current) => (checked ? [...current, person.id] : current.filter((id) => id !== person.id)))
                          }
                        />
                      ))
                    )}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 pt-3">
                <p className="caption flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden />
                  {reach.data === null || reach.data === undefined
                    ? 'Counting recipients…'
                    : `Reaches ${reach.data} active account${reach.data === 1 ? '' : 's'}`}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" loading={busy === 'draft'} disabled={permissions.canAnnounce === false} onClick={() => void submit(false)} icon={<PencilLine className="size-4" aria-hidden />}>
                    Save draft
                  </Button>
                  <Button loading={busy === 'send'} disabled={permissions.canAnnounce === false} onClick={() => void submit(true)} icon={<Send className="size-4" aria-hidden />}>
                    Send now
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        <Card title="Sent and scheduled" description="Published notices also appear on the public site." bodyClassName="p-0">
          {list.loading && !list.data ? (
            <div className="p-4">
              <LoadingRows rows={4} />
            </div>
          ) : (list.data ?? []).length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Megaphone className="size-5" aria-hidden />}
                title="No announcements yet"
                description="Write one on the left. A draft is stored until you send it; sending is what notifies people."
              />
            </div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {(list.data ?? []).map((row) => (
                <li key={row.id} className="p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[0.88rem] font-semibold text-ink-900">{row.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[0.82rem] text-ink-600">{row.body}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <Badge tone={row.status === 'SENT' ? 'green' : row.status === 'SCHEDULED' ? 'blue' : 'neutral'}>{row.status.toLowerCase()}</Badge>
                      {row.published ? <Badge tone="brand">public</Badge> : null}
                    </div>
                  </div>
                  <p className="caption mt-1.5">
                    {ANNOUNCEMENT_AUDIENCE_LABELS[row.audience]}
                    {row.status === 'SENT' ? ` · ${row.recipients} recipient${row.recipients === 1 ? '' : 's'}` : ''}
                    {row.sentAt ? ` · sent ${relativeTime(row.sentAt)}` : ` · created ${relativeTime(row.createdAt)}`}
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" loading={busy === row.id} onClick={() => void resend(row)} icon={<Send className="size-3.5" aria-hidden />}>
                      {row.status === 'SENT' ? 'Send to new people' : 'Send'}
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void togglePublished(row)}>
                      {row.published ? 'Hide from site' : 'Publish on site'}
                    </Button>
                    {actor?.role === 'ADMIN' ? (
                      <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void remove(row)} icon={<Trash2 className="size-3.5" aria-hidden />}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {!permissions.canAnnounce ? (
        <div className="mt-4">
          <NoticeState tone="warning" title="Your role cannot send announcements" compact>
            Announcements are limited to facility supervisors and administrators.
          </NoticeState>
        </div>
      ) : null}
    </AppShell>
  );
}

export { formatDateTime };

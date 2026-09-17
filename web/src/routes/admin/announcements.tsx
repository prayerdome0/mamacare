/**
 * Administrator — announcements.
 *
 * Banners shown across the public site and the signed-in app: a cholera outbreak
 * notice, a clinic closure, a scheduled maintenance window. They are deliberately
 * blunt instruments — one message, a start and an end, an audience — because a
 * banner that stays up too long teaches people to ignore the next one.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  Eye,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { announcementRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, formatDateTime, relativeTime } from '@/lib/utils';
import type { Announcement } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const AUDIENCE_LABELS: Record<Announcement['audience'], string> = {
  all: 'Everyone, including the public site',
  mothers: 'Mothers and supporters',
  providers: 'Providers only',
  facility: 'Facility staff',
};

const TONE_CLASSES: Record<Announcement['tone'], string> = {
  info: 'border-brand-200 bg-brand-50 text-ink-800',
  warning: 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)] text-ink-800',
  success: 'border-[var(--color-risk-green-border)] bg-[var(--color-risk-green-soft)] text-ink-800',
};

type Filter = 'active' | 'scheduled' | 'expired' | 'ALL';

export default function AdminAnnouncements() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [filter, setFilter] = useState<Filter>('active');
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [creating, setCreating] = useState(false);

  const { data, loading, error, retryable, run } = useAsync(() => announcementRepo.all(), { immediate: true });
  const rows = useMemo<Announcement[]>(() => data ?? [], [data]);

  const now = Date.now();
  const stateOf = (announcement: Announcement): 'active' | 'scheduled' | 'expired' | 'off' => {
    if (!announcement.active) return 'off';
    const starts = announcement.startsAt ? new Date(announcement.startsAt).getTime() : null;
    const ends = announcement.endsAt ? new Date(announcement.endsAt).getTime() : null;
    if (starts && starts > now) return 'scheduled';
    if (ends && ends < now) return 'expired';
    return 'active';
  };

  const filtered = useMemo(() => {
    if (filter === 'ALL') return rows;
    return rows.filter((announcement) => stateOf(announcement) === filter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, filter, now]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      active: rows.filter((item) => stateOf(item) === 'active').length,
      scheduled: rows.filter((item) => stateOf(item) === 'scheduled').length,
      expired: rows.filter((item) => stateOf(item) === 'expired').length,
      off: rows.filter((item) => !item.active).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, now],
  );

  useEffect(() => {
    document.title = 'Announcements · Mama Care admin';
  }, []);

  const toggle = async (announcement: Announcement): Promise<void> => {
    const next = !announcement.active;
    await announcementRepo.update(announcement.id, { active: next });
    await logAudit('record-update', 'announcements', announcement.id, next ? `Activated: ${announcement.title}` : `Deactivated: ${announcement.title}`);
    toast.success(next ? 'Announcement is live' : 'Announcement switched off');
    void run();
  };

  const remove = async (announcement: Announcement): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${announcement.title}”?`,
      message: 'The banner disappears everywhere immediately and the record is gone. Deactivating keeps the wording for next time.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    await announcementRepo.remove(announcement.id);
    await logAudit('record-delete', 'announcements', announcement.id, announcement.title);
    toast.success('Announcement deleted');
    void run();
  };

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Announcements"
        description="Banners across the public site and the app. Set an end date when you create one — a notice that never expires is a notice nobody reads."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setCreating(true); setEditing(null); }} icon={<Plus className="size-4" aria-hidden />}>
              New announcement
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Live now" value={counts.active} icon={<Megaphone className="size-4" aria-hidden />} tone={counts.active > 0 ? 'brand' : 'default'} onClick={() => setFilter('active')} />
        <StatCard label="Scheduled" value={counts.scheduled} icon={<CalendarClock className="size-4" aria-hidden />} onClick={() => setFilter('scheduled')} />
        <StatCard label="Expired" value={counts.expired} icon={<Eye className="size-4" aria-hidden />} tone={counts.expired > 0 ? 'amber' : 'default'} onClick={() => setFilter('expired')} />
        <StatCard label="Switched off" value={counts.off} icon={<Trash2 className="size-4" aria-hidden />} onClick={() => setFilter('ALL')} />
      </div>

      {counts.expired > 0 ? (
        <Card className="card-pad mt-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <p className="text-sm text-ink-700">
            {counts.expired} announcement{counts.expired === 1 ? ' has' : 's have'} passed its end date and no longer shows.
            Delete or reuse the wording — an expired notice left in the list makes it harder to see what is actually live.
          </p>
        </Card>
      ) : null}

      <Card className="card-pad mt-4">
        <SegmentedControl
          value={filter}
          onChange={setFilter}
          ariaLabel="Announcement filter"
          options={[
            { value: 'active', label: 'Live', count: counts.active },
            { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
            { value: 'expired', label: 'Expired', count: counts.expired },
            { value: 'ALL', label: 'All', count: counts.total },
          ]}
        />
      </Card>

      {error ? <ErrorState className="mt-4" title="Announcements could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={3} /> : null}
      {!loading && !error && filtered.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<Megaphone className="size-6" aria-hidden />}
          title={filter === 'active' ? 'Nothing is live' : 'No announcements here'}
          description={
            filter === 'active'
              ? 'That is the normal state. Use a banner for something that changes what a mother should do today — an outbreak, a closed clinic, a maintenance window.'
              : 'Create one when there is something time-bound everyone needs to see.'
          }
          action={
            <Button variant="primary" size="sm" onClick={() => { setCreating(true); setEditing(null); }}>
              New announcement
            </Button>
          }
        />
      ) : null}

      <ul className="mt-4 space-y-3">
        {filtered.map((announcement) => {
          const state = stateOf(announcement);
          return (
            <li key={announcement.id}>
              <Card className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="card-title">{announcement.title}</h3>
                      <Badge tone={state === 'active' ? 'green' : state === 'scheduled' ? 'blue' : state === 'expired' ? 'amber' : 'neutral'}>
                        {state === 'off' ? 'switched off' : state}
                      </Badge>
                      <Badge tone={announcement.tone === 'warning' ? 'amber' : announcement.tone === 'success' ? 'green' : 'brand'}>
                        {announcement.tone}
                      </Badge>
                    </div>
                    <p className={`mt-2 rounded-lg border px-3 py-2 text-sm ${TONE_CLASSES[announcement.tone]}`}>{announcement.body}</p>
                    <div className="mt-2">
                      <KeyValue
                        columns={2}
                        dense
                        items={[
                          { label: 'Audience', value: AUDIENCE_LABELS[announcement.audience] },
                          { label: 'Link', value: announcement.link ?? 'None' },
                          { label: 'Starts', value: announcement.startsAt ? formatDateTime(announcement.startsAt) : 'Immediately' },
                          { label: 'Ends', value: announcement.endsAt ? formatDateTime(announcement.endsAt) : 'No end date' },
                          { label: 'Created by', value: announcement.createdBy ?? '—' },
                          { label: 'Last edited', value: relativeTime(announcement.updatedAt ?? announcement.createdAt) },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="actions-wrap">
                    <Button variant="secondary" size="sm" onClick={() => { setEditing(announcement); setCreating(false); }} icon={<Pencil className="size-4" aria-hidden />}>
                      Edit
                    </Button>
                    <Button variant={announcement.active ? 'ghost' : 'primary'} size="sm" onClick={() => void toggle(announcement)}>
                      {announcement.active ? 'Switch off' : 'Make live'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(announcement)} aria-label={`Delete ${announcement.title}`} icon={<Trash2 className="size-4" aria-hidden />} />
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <h3 className="card-title">Writing a banner people act on</h3>
        <ul className="checklist mt-2 text-sm">
          <li>One sentence, one action: what to do, and where to go if it is urgent.</li>
          <li>Say how long it applies — “until 30 April” beats “currently”.</li>
          <li>Never put a clinical instruction in a banner; that belongs in a reviewed article.</li>
          <li>An emergency is never a banner. Use the emergency page and facility phone numbers.</li>
        </ul>
        <p className="mt-2 text-xs text-ink-500">Last checked {formatDate(new Date(), 'long')} · signed in as {actor?.displayName ?? 'administrator'}</p>
      </Card>

      <AnnouncementModal
        open={creating || Boolean(editing)}
        announcement={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void run(); }}
      />
    </StaffShell>
  );
}

function AnnouncementModal({
  open,
  announcement,
  onClose,
  onSaved,
}: {
  open: boolean;
  announcement: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Announcement['audience']>('all');
  const [tone, setTone] = useState<Announcement['tone']>('info');
  const [link, setLink] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(announcement?.title ?? '');
    setBody(announcement?.body ?? '');
    setAudience(announcement?.audience ?? 'all');
    setTone(announcement?.tone ?? 'info');
    setLink(announcement?.link ?? '');
    setStartsAt(announcement?.startsAt ? toLocalInput(announcement.startsAt) : '');
    setEndsAt(announcement?.endsAt ? toLocalInput(announcement.endsAt) : '');
    setActive(announcement?.active ?? true);
    setError(null);
  }, [open, announcement]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (title.trim().length < 4) { setError('Give the announcement a short title.'); return; }
    if (body.trim().length < 10) { setError('The banner text needs at least ten characters.'); return; }
    if (startsAt && endsAt && new Date(startsAt) >= new Date(endsAt)) { setError('The end must be after the start.'); return; }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        body: body.trim(),
        audience,
        tone,
        link: link.trim() || null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        active,
      };
      if (announcement) {
        await announcementRepo.update(announcement.id, payload);
        await logAudit('record-update', 'announcements', announcement.id, payload.title);
        toast.success('Announcement updated');
      } else {
        await announcementRepo.create({ ...payload, createdBy: actor?.displayName ?? actor?.email ?? 'Administrator' });
        await logAudit('record-create', 'announcements', null, payload.title);
        toast.success('Announcement created', active ? 'It is showing now.' : 'It is saved but switched off.');
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={announcement ? 'Edit announcement' : 'New announcement'}
      description="Shown as a banner at the top of the pages your audience sees. Keep it to one action."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}>{announcement ? 'Save changes' : 'Create announcement'}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Title" htmlFor="an-title" required error={error && title.trim().length < 4 ? error : undefined}>
          <TextInput id="an-title" value={title} onValueChange={setTitle} placeholder="e.g. Cholera precautions in Lusaka" />
        </Field>
        <Field label="Banner text" htmlFor="an-body" required error={error && body.trim().length < 10 ? error : undefined} hint="Shown exactly as typed, on one or two lines.">
          <TextArea id="an-body" rows={3} value={body} onChange={(event) => setBody(event.target.value)} placeholder="Boil or treat drinking water. If you have watery diarrhoea, go to the nearest clinic the same day." />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Audience" htmlFor="an-audience">
            <Select
              id="an-audience"
              value={audience}
              onChange={(event) => setAudience(event.target.value as Announcement['audience'])}
              options={(Object.keys(AUDIENCE_LABELS) as Announcement['audience'][]).map((value) => ({ value, label: AUDIENCE_LABELS[value] }))}
            />
          </Field>
          <Field label="Tone" htmlFor="an-tone" hint="Colour always travels with the wording.">
            <Select
              id="an-tone"
              value={tone}
              onChange={(event) => setTone(event.target.value as Announcement['tone'])}
              options={[
                { value: 'info', label: 'Information (teal)' },
                { value: 'warning', label: 'Warning (amber)' },
                { value: 'success', label: 'Positive (green)' },
              ]}
            />
          </Field>
        </FieldGrid>
        <Field label="Link (optional)" htmlFor="an-link" hint="A path like /learn/cholera or a full URL.">
          <TextInput id="an-link" value={link} onValueChange={setLink} placeholder="/emergency" />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Starts" htmlFor="an-starts" optional hint="Blank means immediately.">
            <TextInput id="an-starts" type="datetime-local" value={startsAt} onValueChange={setStartsAt} />
          </Field>
          <Field label="Ends" htmlFor="an-ends" optional hint="Blank means it stays until you switch it off.">
            <TextInput id="an-ends" type="datetime-local" value={endsAt} onValueChange={setEndsAt} />
          </Field>
        </FieldGrid>
        <CheckboxRow checked={active} onChange={setActive} label="Live immediately" description="Switch off to save the wording without showing it." />
        {error ? <p className="alert alert-error">{error}</p> : null}
        <div>
          <p className="micro">Preview</p>
          <p className={`mt-1 rounded-lg border px-3 py-2 text-sm ${TONE_CLASSES[tone]}`}>
            <strong className="font-semibold">{title || 'Your title'}</strong>
            <span className="mt-0.5 block">{body || 'Your banner text appears here.'}</span>
            {link ? <span className="mt-1 block text-xs underline">{link}</span> : null}
          </p>
        </div>
      </div>
    </Modal>
  );
}

/** datetime-local inputs want local time, records store ISO UTC. */
function toLocalInput(iso: string): string {
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

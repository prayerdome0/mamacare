/**
 * Administrator — feedback.
 *
 * The public contact form and the in-app “something is wrong” path both land here.
 * Most of it is about facility data being out of date, which is the highest-value
 * correction available: it stops somebody travelling to a clinic that closed. There
 * is no mail service in this build, so replying means opening the person's email
 * client — the screen hands you a pre-filled message rather than pretending it sent
 * one.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Mail,
  MessageSquareText,
  RefreshCw,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { feedbackRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { downloadBlob, formatDate, mailtoHref, relativeTime, toCsv, toIsoDate, truncate } from '@/lib/utils';
import type { Feedback } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const TOPIC_LABELS: Record<Feedback['topic'], string> = {
  bug: 'Something is broken',
  content: 'Content is wrong or unclear',
  feature: 'Feature request',
  'facility-data': 'Facility information',
  other: 'Other',
};

const STATUS_LABELS: Record<Feedback['status'], string> = {
  new: 'New',
  'in-progress': 'In progress',
  resolved: 'Resolved',
};

export default function AdminFeedback() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Feedback['status'] | 'ALL'>('new');
  const [topic, setTopic] = useState<Feedback['topic'] | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Feedback | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => feedbackRepo.all(), { immediate: true });
  const rows = useMemo<Feedback[]>(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((item) => {
      if (status !== 'ALL' && item.status !== status) return false;
      if (topic !== 'ALL' && item.topic !== topic) return false;
      if (!term) return true;
      return [item.message, item.email ?? '', TOPIC_LABELS[item.topic]].join(' ').toLowerCase().includes(term);
    });
  }, [rows, status, topic, search]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      new: rows.filter((item) => item.status === 'new').length,
      inProgress: rows.filter((item) => item.status === 'in-progress').length,
      resolved: rows.filter((item) => item.status === 'resolved').length,
      facility: rows.filter((item) => item.topic === 'facility-data').length,
      bugs: rows.filter((item) => item.topic === 'bug').length,
      withEmail: rows.filter((item) => item.email).length,
    }),
    [rows],
  );

  useEffect(() => {
    document.title = 'Feedback · Mama Care admin';
  }, []);

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Received', 'Topic', 'Message', 'Email', 'Status', 'Handled by', 'Response'],
      rows.map((item) => [
        item.createdAt ?? '',
        TOPIC_LABELS[item.topic],
        item.message,
        item.email ?? '',
        STATUS_LABELS[item.status],
        item.handledBy ?? '',
        item.response ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-feedback-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'feedback', actor?.uid ?? null, `Exported ${rows.length} feedback messages`);
    toast.success('Export ready', 'Messages may include personal detail. Delete the file when you are done with it.');
  };

  const remove = async (item: Feedback): Promise<void> => {
    const ok = await confirm({
      title: 'Delete this feedback?',
      message: 'The message and any response are removed permanently. Resolving it keeps the record of what was reported and what you did.',
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    await feedbackRepo.remove(item.id);
    await logAudit('record-delete', 'feedback', item.id, truncate(item.message, 60));
    toast.success('Feedback deleted');
    void run();
  };

  const columns: Column<Feedback>[] = [
    {
      key: 'message',
      header: 'Message',
      sortValue: (row) => row.createdAt ?? '',
      render: (row) => (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={row.topic === 'bug' ? 'red' : row.topic === 'facility-data' ? 'amber' : 'neutral'}>{TOPIC_LABELS[row.topic]}</Badge>
            <span className="text-xs text-ink-500">{relativeTime(row.createdAt)}</span>
          </span>
          <span className="mt-1 block text-sm text-ink-700">{truncate(row.message, 140)}</span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'From',
      width: '12rem',
      hideBelow: 'md',
      render: (row) =>
        row.email ? (
          <a className="nav-link break-anywhere text-xs" href={mailtoHref(row.email, `Mama Care: ${TOPIC_LABELS[row.topic]}`)}>
            {row.email}
          </a>
        ) : (
          <span className="text-xs text-ink-400">No reply address</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge tone={row.status === 'new' ? 'red' : row.status === 'in-progress' ? 'amber' : 'green'}>{STATUS_LABELS[row.status]}</Badge>
      ),
    },
    {
      key: 'handled',
      header: 'Handled by',
      hideBelow: 'lg',
      width: '10rem',
      render: (row) => <span className="text-xs text-ink-600">{row.handledBy ?? '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '9rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          <Button variant="secondary" size="sm" onClick={() => setSelected(row)}>
            Respond
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(row)} aria-label="Delete feedback" icon={<Trash2 className="size-4" aria-hidden />} />
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Feedback"
        description="What people tell you when something is wrong, unclear or missing. Answering facility corrections quickly is the cheapest trust this platform can buy."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={rows.length === 0} icon={<Download className="size-4" aria-hidden />}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Unanswered" value={counts.new} icon={<MessageSquareText className="size-4" aria-hidden />} tone={counts.new > 0 ? 'red' : 'green'} onClick={() => setStatus('new')} />
        <StatCard label="In progress" value={counts.inProgress} icon={<Wrench className="size-4" aria-hidden />} tone="amber" onClick={() => setStatus('in-progress')} />
        <StatCard label="Resolved" value={counts.resolved} icon={<CheckCircle2 className="size-4" aria-hidden />} tone="green" onClick={() => setStatus('resolved')} />
        <StatCard
          label="Facility corrections"
          value={counts.facility}
          icon={<Mail className="size-4" aria-hidden />}
          hint={`${counts.bugs} bug reports`}
          onClick={() => { setTopic('facility-data'); setStatus('ALL'); }}
        />
      </div>

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={status}
            onChange={setStatus}
            ariaLabel="Feedback status"
            options={[
              { value: 'new', label: 'New', count: counts.new },
              { value: 'in-progress', label: 'In progress', count: counts.inProgress },
              { value: 'resolved', label: 'Resolved', count: counts.resolved },
              { value: 'ALL', label: 'All', count: counts.total },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Filter by topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value as Feedback['topic'] | 'ALL')}
              options={[
                { value: 'ALL', label: 'All topics' },
                ...(Object.keys(TOPIC_LABELS) as Feedback['topic'][]).map((value) => ({ value, label: TOPIC_LABELS[value] })),
              ]}
              className="w-auto min-w-[12rem]"
            />
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search messages" className="w-full sm:max-w-xs" />
          </div>
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Feedback could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={5} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Feedback messages, newest first"
            pageSize={20}
            emptyTitle={counts.total === 0 ? 'No feedback yet' : 'Nothing matches'}
            emptyDescription={
              counts.total === 0
                ? 'Feedback arrives from the public contact page and from the in-app support link. When it does, it lands here unanswered until somebody responds.'
                : 'Try another status or topic.'
            }
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Practice" title="Answering well" />
          <ul className="checklist mt-2 text-sm">
            <li>Facility corrections: verify by phone, update the directory, verify the entry, then reply.</li>
            <li>Content complaints: check the guidance, correct it or explain the source you relied on.</li>
            <li>Bugs: reproduce once, note the browser and device, and say honestly when a fix is not planned.</li>
            <li>Feature requests: record what problem they were solving, not just what they asked for.</li>
            <li>Never reply with clinical advice — point to a provider or a facility instead.</li>
          </ul>
        </Card>
        <Card className="card-pad">
          <SectionHeading eyebrow="Reachability" title="Reply addresses" />
          <KeyValue
            columns={1}
            dense
            items={[
              { label: 'Messages with an email', value: `${counts.withEmail} of ${counts.total}` },
              { label: 'Anonymous messages', value: String(counts.total - counts.withEmail) },
              { label: 'Support address', value: actor?.email ?? '—' },
              { label: 'Oldest message', value: rows.length > 0 ? formatDate(rows[rows.length - 1]?.createdAt, 'long') : '—' },
            ]}
          />
          <p className="mt-3 text-sm text-ink-600">
            This deployment has no outbound mail service, so “Respond” saves your reply against the message and opens your own
            email client. That is intentional: nothing is silently claimed to have been sent.
          </p>
        </Card>
      </div>

      <RespondModal
        item={selected}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null);
          toast.success('Response saved');
          void run();
        }}
      />
    </StaffShell>
  );
}

function RespondModal({ item, onClose, onDone }: { item: Feedback | null; onClose: () => void; onDone: () => void }) {
  const { actor } = useSession();
  const [status, setStatus] = useState<Feedback['status']>('in-progress');
  const [response, setResponse] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    setStatus(item.status === 'new' ? 'in-progress' : item.status);
    setResponse(item.response ?? '');
    setError(null);
  }, [item]);

  if (!item) return null;

  const save = async (): Promise<void> => {
    setError(null);
    if (response.trim().length < 10) {
      setError('Write the response you intend to send. It is stored even if you send the email later.');
      return;
    }
    setBusy(true);
    try {
      await feedbackRepo.update(item.id, {
        status,
        response: response.trim(),
        handledBy: actor?.displayName ?? actor?.email ?? 'Administrator',
      });
      await logAudit('record-update', 'feedback', item.id, `${STATUS_LABELS[status]}: ${truncate(item.message, 50)}`);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  const draft = `Hello,\n\nThank you for telling us about this. ${response.trim() || ''}\n\n— Mama Care`;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={TOPIC_LABELS[item.topic]}
      description={`Received ${relativeTime(item.createdAt)}${item.email ? ` · ${item.email}` : ' · no reply address given'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          {item.email ? (
            <a className="btn btn-secondary btn-sm" href={mailtoHref(item.email, `Mama Care: ${TOPIC_LABELS[item.topic]}`, draft)}>
              <Mail className="size-4" aria-hidden />
              Open in email
            </a>
          ) : null}
          <Button onClick={() => void save()} loading={busy} icon={<CheckCircle2 className="size-4" aria-hidden />}>
            Save response
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Card className="card-pad border-ink-200 bg-ink-50">
          <p className="micro">Their message</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink-800">{item.message}</p>
          {item.userId ? <p className="mt-2 text-xs text-ink-500">Sent from a signed-in account ({item.userId}).</p> : null}
        </Card>
        <Field label="Status" htmlFor="fb-status">
          <Select
            id="fb-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Feedback['status'])}
            options={(Object.keys(STATUS_LABELS) as Feedback['status'][]).map((value) => ({ value, label: STATUS_LABELS[value] }))}
          />
        </Field>
        <Field label="Your response" htmlFor="fb-response" required error={error ?? undefined} hint="Stored with the message. Plain and specific beats friendly and vague.">
          <TextArea id="fb-response" rows={5} value={response} onChange={(event) => setResponse(event.target.value)} placeholder="We called the clinic on 12 March and confirmed the antenatal hours are now 07:00–13:00. The directory entry has been corrected and verified. Thank you for flagging it." />
        </Field>
      </div>
    </Modal>
  );
}

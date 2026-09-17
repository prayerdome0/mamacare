/**
 * Administrator — content reports.
 *
 * When a mother taps “report a problem” on an article, a facility or a message, it
 * lands here. A report is a claim that something in the platform is wrong or unsafe,
 * so the workflow always ends with a written resolution: what was checked and what
 * was decided. Dismissing without a reason is the fastest way to stop people
 * reporting things.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  EyeOff,
  Flag,
  Newspaper,
  RefreshCw,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { reportRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime, toCsv, toIsoDate, downloadBlob, truncate } from '@/lib/utils';
import type { ContentReport, ReportTargetType } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const TARGET_LABELS: Record<ReportTargetType, string> = {
  article: 'Article',
  facility: 'Facility',
  message: 'Message',
  user: 'Account',
  other: 'Something else',
};

const TARGET_LINKS: Record<ReportTargetType, string | null> = {
  article: '/admin/articles',
  facility: '/admin/facilities',
  message: null,
  user: '/admin/users',
  other: null,
};

const STATUS_LABELS: Record<ContentReport['status'], string> = {
  open: 'Open',
  reviewed: 'Reviewed',
  actioned: 'Action taken',
  dismissed: 'Dismissed',
};

export default function AdminReports() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<ContentReport['status'] | 'ALL'>('open');
  const [targetType, setTargetType] = useState<ReportTargetType | 'ALL'>('ALL');
  const [selected, setSelected] = useState<ContentReport | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => reportRepo.all(), { immediate: true });
  const rows = useMemo<ContentReport[]>(() => data ?? [], [data]);

  const filtered = useMemo(
    () =>
      rows.filter((report) => {
        if (status !== 'ALL' && report.status !== status) return false;
        if (targetType !== 'ALL' && report.targetType !== targetType) return false;
        return true;
      }),
    [rows, status, targetType],
  );

  const counts = useMemo(
    () => ({
      total: rows.length,
      open: rows.filter((report) => report.status === 'open').length,
      reviewed: rows.filter((report) => report.status === 'reviewed').length,
      actioned: rows.filter((report) => report.status === 'actioned').length,
      dismissed: rows.filter((report) => report.status === 'dismissed').length,
      safety: rows.filter((report) => /danger|unsafe|wrong|harm|medic/i.test(`${report.reason} ${report.details ?? ''}`)).length,
      oldest: rows
        .filter((report) => report.status === 'open')
        .map((report) => report.createdAt)
        .filter(Boolean)
        .sort()[0] ?? null,
    }),
    [rows],
  );

  useEffect(() => {
    document.title = 'Reports · Mama Care admin';
  }, []);

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Reported', 'Type', 'Target', 'Reason', 'Details', 'Status', 'Reporter', 'Reviewed by', 'Resolution', 'Date'],
      rows.map((report) => [
        report.createdAt ?? '',
        TARGET_LABELS[report.targetType],
        report.targetLabel,
        report.reason,
        report.details ?? '',
        STATUS_LABELS[report.status],
        report.reporterName ?? 'Anonymous',
        report.reviewedBy ?? '',
        report.resolution ?? '',
        report.reviewedAt ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-reports-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'reports', actor?.uid ?? null, `Exported ${rows.length} reports`);
    toast.success('Export ready');
  };

  const columns: Column<ContentReport>[] = [
    {
      key: 'target',
      header: 'Reported item',
      sortValue: (row) => row.targetLabel,
      render: (row) => (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ink-800">{row.targetLabel}</span>
            <Badge tone="neutral">{TARGET_LABELS[row.targetType]}</Badge>
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-500">{truncate(row.reason, 90)}</span>
        </span>
      ),
    },
    {
      key: 'reporter',
      header: 'Reported by',
      hideBelow: 'md',
      width: '10rem',
      render: (row) => (
        <span className="block text-xs text-ink-600">
          {row.reporterName ?? 'Anonymous'}
          <span className="block text-ink-500">{relativeTime(row.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge tone={row.status === 'open' ? 'red' : row.status === 'actioned' ? 'green' : row.status === 'reviewed' ? 'blue' : 'neutral'}>
          {STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'review',
      header: 'Resolution',
      hideBelow: 'lg',
      render: (row) =>
        row.resolution ? (
          <span className="block text-xs text-ink-600">
            {truncate(row.resolution, 70)}
            <span className="block text-ink-500">{row.reviewedBy ?? ''}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-400">Not decided</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '9rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          {TARGET_LINKS[row.targetType] ? (
            <Link to={TARGET_LINKS[row.targetType] as string} className="btn btn-ghost btn-sm">
              Open
            </Link>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setSelected(row)}>
            Review
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Content reports"
        description="Things users flagged as wrong, unsafe or out of date. Every report needs a decision and a written reason."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={rows.length === 0}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Open" value={counts.open} icon={<Flag className="size-4" aria-hidden />} tone={counts.open > 0 ? 'red' : 'green'} onClick={() => setStatus('open')} />
        <StatCard label="Reviewed" value={counts.reviewed} icon={<EyeOff className="size-4" aria-hidden />} onClick={() => setStatus('reviewed')} />
        <StatCard label="Action taken" value={counts.actioned} icon={<Wrench className="size-4" aria-hidden />} tone="green" onClick={() => setStatus('actioned')} />
        <StatCard
          label="Possible safety issues"
          value={counts.safety}
          icon={<ShieldAlert className="size-4" aria-hidden />}
          tone={counts.safety > 0 ? 'amber' : 'default'}
          hint="Keyword match — always read it yourself"
          onClick={() => setStatus('ALL')}
        />
      </div>

      {counts.open > 0 && counts.oldest ? (
        <Card className="card-pad mt-4 border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
          <p className="text-sm text-ink-700">
            The oldest open report was filed {relativeTime(counts.oldest)}. A report that sits unanswered teaches people that
            reporting is pointless — decide it, even if the decision is “dismissed, details correct as published”.
          </p>
        </Card>
      ) : null}

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={status}
            onChange={setStatus}
            ariaLabel="Report status"
            options={[
              { value: 'open', label: 'Open', count: counts.open },
              { value: 'reviewed', label: 'Reviewed', count: counts.reviewed },
              { value: 'actioned', label: 'Actioned', count: counts.actioned },
              { value: 'dismissed', label: 'Dismissed', count: counts.dismissed },
              { value: 'ALL', label: 'All', count: counts.total },
            ]}
          />
          <Select
            aria-label="Filter by reported type"
            value={targetType}
            onChange={(event) => setTargetType(event.target.value as ReportTargetType | 'ALL')}
            options={[
              { value: 'ALL', label: 'All types' },
              ...(Object.keys(TARGET_LABELS) as ReportTargetType[]).map((value) => ({ value, label: TARGET_LABELS[value] })),
            ]}
            className="w-auto min-w-[11rem]"
          />
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Reports could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={5} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Content reports, newest first"
            pageSize={20}
            emptyTitle={counts.total === 0 ? 'Nothing has been reported' : 'No reports match'}
            emptyDescription={
              counts.total === 0
                ? 'That is either good news or a sign nobody has found the report button. Check it is reachable on article and facility pages.'
                : 'Try another status or type.'
            }
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Triage" title="How to decide a report" />
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-ink-700">
            <li>Read it against the source. A reported article is usually a factual or currency problem.</li>
            <li>If it concerns clinical guidance, check current national guidance before you change anything.</li>
            <li>Correct the content, then mark “Action taken” with what you changed and the date you checked.</li>
            <li>If the report is mistaken, dismiss it with the reason — the reporter's concern is still information.</li>
            <li>If it names a person's safety, treat it as urgent and involve the facility, not just this queue.</li>
          </ol>
        </Card>
        <Card className="card-pad">
          <SectionHeading eyebrow="Volume" title="What gets reported" />
          <ul className="mt-2 space-y-1.5">
            {(Object.keys(TARGET_LABELS) as ReportTargetType[]).map((type) => {
              const count = rows.filter((report) => report.targetType === type).length;
              return (
                <li key={type} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-ink-700">{TARGET_LABELS[type]}</span>
                  <Badge tone={count > 0 ? 'neutral' : 'neutral'}>{count}</Badge>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-500">
            Facility reports are the most valuable kind: they mean a phone number or opening hour is wrong and somebody was
            about to travel on it. Fix those first.
          </p>
          <div className="mt-3">
            <Link to="/admin/facilities" className="btn btn-secondary btn-sm">
              <Newspaper className="size-4" aria-hidden />
              Open facility directory
            </Link>
          </div>
        </Card>
      </div>

      <ReviewModal
        report={selected}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null);
          toast.success('Report updated');
          void run();
        }}
      />
    </StaffShell>
  );
}

function ReviewModal({
  report,
  onClose,
  onDone,
}: {
  report: ContentReport | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { actor } = useSession();
  const confirm = useConfirm();
  const [nextStatus, setNextStatus] = useState<ContentReport['status']>('actioned');
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!report) return;
    setNextStatus(report.status === 'open' ? 'actioned' : report.status);
    setResolution(report.resolution ?? '');
    setError(null);
  }, [report]);

  if (!report) return null;

  const save = async (): Promise<void> => {
    setError(null);
    if (resolution.trim().length < 10) {
      setError('Write at least ten characters. The resolution is the record of what you checked and decided.');
      return;
    }
    if (nextStatus === 'dismissed') {
      const ok = await confirm({
        title: 'Dismiss this report?',
        message: 'The reporter is not notified. Your reason is stored, so if the same thing is reported again you can see what was already decided.',
        confirmLabel: 'Dismiss report',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await reportRepo.update(report.id, {
        status: nextStatus,
        resolution: resolution.trim(),
        reviewedBy: actor?.displayName ?? 'Administrator',
        reviewedAt: new Date().toISOString(),
      });
      await logAudit('record-update', 'reports', report.id, `${STATUS_LABELS[nextStatus]}: ${report.targetLabel}`);
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Report on ${report.targetLabel}`}
      description={`${TARGET_LABELS[report.targetType]} · filed by ${report.reporterName ?? 'an anonymous user'} ${relativeTime(report.createdAt)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void save()} loading={busy} icon={<CheckCircle2 className="size-4" aria-hidden />}>
            Save decision
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Card className="card-pad border-ink-200 bg-ink-50">
          <KeyValue
            columns={2}
            dense
            items={[
              { label: 'Reason given', value: report.reason },
              { label: 'Filed', value: report.createdAt ? formatDate(report.createdAt, 'long') : '—' },
              { label: 'Reporter', value: report.reporterName ?? 'Anonymous' },
              { label: 'Current status', value: STATUS_LABELS[report.status] },
              { label: 'Target id', value: report.targetId },
              { label: 'Last decision', value: report.reviewedAt ? `${STATUS_LABELS[report.status]} by ${report.reviewedBy ?? '—'}` : 'None yet' },
            ]}
          />
          {report.details ? <p className="mt-3 text-sm text-ink-700">{report.details}</p> : null}
        </Card>

        {TARGET_LINKS[report.targetType] ? (
          <Link to={TARGET_LINKS[report.targetType] as string} className="btn btn-secondary btn-sm">
            Open the {TARGET_LABELS[report.targetType].toLowerCase()} record
          </Link>
        ) : (
          <p className="text-xs text-ink-500">
            This report type has no admin screen — messages and accounts are handled through the relevant portal, and the
            reporter's description is the main evidence you have.
          </p>
        )}

        <Field label="Decision" htmlFor="rr-status">
          <Select
            id="rr-status"
            value={nextStatus}
            onChange={(event) => setNextStatus(event.target.value as ContentReport['status'])}
            options={[
              { value: 'actioned', label: 'Action taken — content or data corrected' },
              { value: 'reviewed', label: 'Reviewed — no change needed yet' },
              { value: 'dismissed', label: 'Dismissed — the report is mistaken' },
              { value: 'open', label: 'Leave open' },
            ]}
          />
        </Field>
        <Field label="Resolution" htmlFor="rr-resolution" required error={error ?? undefined} hint="What you checked, what you changed, and against which guidance.">
          <TextArea id="rr-resolution" rows={4} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Checked against the 2024 ZMoH ANC guidelines; the visit interval on week 30 was outdated and has been corrected. Re-published 12 March." />
        </Field>
      </div>
    </Modal>
  );
}

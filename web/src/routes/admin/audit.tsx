/**
 * Administrator — audit log.
 *
 * Every consequential write in the platform records who did it, to what, and when:
 * sign-ins, role changes, provider approvals, content publishing, record edits,
 * exports and deletions. This screen exists so a mother can ask “who looked at my
 * record?” and get an answer, and so an administrator's own actions are as visible
 * as anyone else's.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileClock,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  UserCog,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { AUDIT_ACTION_LABELS, readAuditLog } from '@/services/audit';
import { logAudit } from '@/services/audit';
import { useSession } from '@/providers/app-providers';
import { downloadBlob, formatDate, formatDateTime, relativeTime, toCsv, toIsoDate, truncate } from '@/lib/utils';
import type { AuditAction, AuditLogEntry } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

type TimeRange = 'today' | 'week' | 'month' | 'ALL';

const ROLE_TONES: Record<AuditLogEntry['actorRole'], 'purple' | 'brand' | 'blue' | 'neutral'> = {
  ADMIN: 'purple',
  FACILITY_ADMIN: 'blue',
  PROVIDER: 'brand',
  NURSE: 'brand',
  MOTHER: 'neutral',
  PATIENT: 'neutral',
  SUPPORTER: 'neutral',
  SYSTEM: 'neutral',
};

export default function AdminAudit() {
  const { actor } = useSession();
  const toast = useToast();
  const [range, setRange] = useState<TimeRange>('week');
  const [action, setAction] = useState<AuditAction | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [mineOnly, setMineOnly] = useState(false);

  const { data, loading, error, retryable, run } = useAsync(() => readAuditLog(1000), { immediate: true });
  const entries = useMemo<AuditLogEntry[]>(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const cutoff =
      range === 'today'
        ? toIsoDate(new Date())
        : range === 'week'
          ? new Date(now - 7 * 86_400_000).toISOString()
          : range === 'month'
            ? new Date(now - 30 * 86_400_000).toISOString()
            : null;
    const term = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (action !== 'ALL' && entry.action !== action) return false;
      if (mineOnly && entry.actorId !== actor?.uid) return false;
      if (cutoff && (!entry.createdAt || entry.createdAt < cutoff)) return false;
      if (!term) return true;
      return [entry.actorName, entry.actorRole, AUDIT_ACTION_LABELS[entry.action], entry.targetType, entry.targetId ?? '', entry.detail ?? '']
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [entries, range, action, search, mineOnly, actor?.uid]);

  const stats = useMemo(() => {
    const today = toIsoDate(new Date());
    const actors = new Set(entries.map((entry) => entry.actorId));
    const byAction = entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.action] = (acc[entry.action] ?? 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(byAction).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const sensitive = entries.filter((entry) =>
      ['role-change', 'status-change', 'provider-approval', 'account-delete', 'data-export', 'content-publish', 'settings-change'].includes(entry.action),
    ).length;
    return {
      total: entries.length,
      today: entries.filter((entry) => (entry.createdAt ?? '').startsWith(today)).length,
      actors: actors.size,
      sensitive,
      deletions: entries.filter((entry) => entry.action === 'record-delete' || entry.action === 'account-delete').length,
      exports: entries.filter((entry) => entry.action === 'data-export').length,
      top,
      oldest: entries.map((entry) => entry.createdAt).filter(Boolean).sort()[0] ?? null,
    };
  }, [entries]);

  useEffect(() => {
    document.title = 'Audit log · Mama Care admin';
  }, []);

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Timestamp', 'Actor', 'Role', 'Action', 'Target type', 'Target id', 'Detail'],
      filtered.map((entry) => [
        entry.createdAt ?? '',
        entry.actorName,
        entry.actorRole,
        AUDIT_ACTION_LABELS[entry.action],
        entry.targetType,
        entry.targetId ?? '',
        entry.detail ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-audit-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'audit_logs', actor?.uid ?? null, `Exported ${filtered.length} audit entries`);
    toast.success('Export ready', 'Exporting the audit log is itself audited.');
  };

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'when',
      header: 'When',
      width: '11rem',
      sortValue: (row) => row.createdAt ?? '',
      render: (row) => (
        <span className="block">
          <span className="block text-xs font-medium text-ink-800">{row.createdAt ? formatDateTime(row.createdAt) : '—'}</span>
          <span className="block text-xs text-ink-500">{relativeTime(row.createdAt)}</span>
        </span>
      ),
    },
    {
      key: 'actor',
      header: 'Who',
      sortValue: (row) => row.actorName,
      render: (row) => (
        <span className="block">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ink-800">{row.actorName || 'Unknown'}</span>
            <Badge tone={ROLE_TONES[row.actorRole] ?? 'neutral'}>{row.actorRole}</Badge>
          </span>
          {row.actorId === actor?.uid ? <span className="block text-xs text-brand-700">this is you</span> : null}
        </span>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      width: '12rem',
      sortValue: (row) => row.action,
      render: (row) => (
        <Badge tone={row.action.includes('delete') ? 'red' : row.action === 'data-export' ? 'amber' : row.action === 'content-publish' || row.action === 'provider-approval' ? 'brand' : 'neutral'}>
          {AUDIT_ACTION_LABELS[row.action]}
        </Badge>
      ),
    },
    {
      key: 'target',
      header: 'Target',
      hideBelow: 'md',
      width: '10rem',
      render: (row) => (
        <span className="block text-xs text-ink-600">
          {row.targetType}
          {row.targetId ? <span className="block truncate text-ink-500">{truncate(row.targetId, 26)}</span> : null}
        </span>
      ),
    },
    {
      key: 'detail',
      header: 'Detail',
      render: (row) => <span className="block text-sm text-ink-700">{row.detail ?? '—'}</span>,
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Audit log"
        description="Who did what, to which record, and when. Append-only: entries are never edited, and reading this page is not itself logged."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={filtered.length === 0} icon={<Download className="size-4" aria-hidden />}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Entries loaded" value={stats.total} icon={<ScrollText className="size-4" aria-hidden />} hint={stats.oldest ? `since ${formatDate(stats.oldest, 'day')}` : undefined} />
        <StatCard label="Written today" value={stats.today} icon={<FileClock className="size-4" aria-hidden />} tone={stats.today > 0 ? 'brand' : 'default'} onClick={() => setRange('today')} />
        <StatCard label="Distinct actors" value={stats.actors} icon={<UserCog className="size-4" aria-hidden />} />
        <StatCard
          label="Sensitive actions"
          value={stats.sensitive}
          icon={<ShieldCheck className="size-4" aria-hidden />}
          tone={stats.sensitive > 0 ? 'amber' : 'green'}
          hint={`${stats.deletions} deletions · ${stats.exports} exports`}
          onClick={() => setAction('data-export')}
        />
      </div>

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={range}
            onChange={setRange}
            ariaLabel="Time window"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: '7 days' },
              { value: 'month', label: '30 days' },
              { value: 'ALL', label: 'Everything' },
            ]}
          />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Filter by action"
              value={action}
              onChange={(event) => setAction(event.target.value as AuditAction | 'ALL')}
              options={[
                { value: 'ALL', label: 'All actions' },
                ...(Object.keys(AUDIT_ACTION_LABELS) as AuditAction[]).map((value) => ({ value, label: AUDIT_ACTION_LABELS[value] })),
              ]}
              className="w-auto min-w-[13rem]"
            />
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search actor, target or detail" className="w-full sm:max-w-xs" />
          </div>
        </div>
        <div className="mt-3">
          <Button variant={mineOnly ? 'primary' : 'secondary'} size="sm" onClick={() => setMineOnly((current) => !current)} icon={<Search className="size-4" aria-hidden />}>
            {mineOnly ? 'Showing only my actions' : 'Show only my actions'}
          </Button>
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="The audit log could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={6} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Audit entries, newest first"
            pageSize={25}
            emptyTitle="No entries in this window"
            emptyDescription="Widen the time range, or clear the filters. Sign-ins and record writes both appear here."
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Distribution" title="Most frequent actions" />
          {stats.top.length === 0 ? (
            <p className="mt-2 text-sm text-ink-600">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.top.map(([key, count]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-700">{AUDIT_ACTION_LABELS[key as AuditAction] ?? key}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-ink-100">
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${(count / Math.max(stats.top[0]?.[1] ?? 1, 1)) * 100}%` }} />
                    </span>
                    <Badge tone="neutral">{count}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Accountability" title="What this log is for" />
          <KeyValue
            columns={1}
            dense
            items={[
              { label: 'Written by', value: 'Every consequential action in the app' },
              { label: 'Editable', value: 'No — entries are append-only' },
              { label: 'Visible to', value: 'Administrators only' },
              { label: 'Includes', value: 'Actor name, role, action, target, detail, timestamp' },
              { label: 'Excludes', value: 'Clinical values, message bodies and document contents' },
              { label: 'Oldest entry', value: stats.oldest ? formatDate(stats.oldest, 'long') : '—' },
            ]}
          />
          <p className="mt-3 text-sm text-ink-600">
            A patient can ask what happened to her record and when. Answer from this log, not from memory — and remember that
            your own exports and role changes are in it too.
          </p>
        </Card>
      </div>
    </StaffShell>
  );
}

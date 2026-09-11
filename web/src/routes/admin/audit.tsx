import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Download, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, NoticeState } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { Field, SearchInput, Select, TextInput } from '@/components/ui/form';
import { useAsync, useDebouncedValue } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { auditActionLabel, exportAuditLogs, listAuditLogs, type AuditFilters } from '@/services/admin/audit-service';
import { AUDIT_ACTIONS, type AuditAction, type AuditLogEntry } from '@/types/domain';
import { addDays, formatDateTime, humanize, relativeTime, toIsoDate } from '@/lib/utils';

const TARGET_TYPES = ['user', 'mother', 'pregnancy', 'anc_visit', 'alert', 'referral', 'appointment', 'report', 'document', 'facility', 'notification', 'rule', 'settings', 'media', 'session'];

/**
 * The audit log. Append-only rows written by the data layer on every meaningful
 * action, with deliberately small metadata — enough to reconstruct who did what,
 * never enough to leak a clinical record.
 */
export default function AdminAuditPage() {
  const toast = useToast();
  const [filters, setFilters] = useState<AuditFilters>({ limit: 200, from: toIsoDate(addDays(new Date(), -30)) });
  const [term, setTerm] = useState('');
  const search = useDebouncedValue(term, 300);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setFilters((current) => ({ ...current, search: search || undefined }));
  }, [search]);

  const logs = useAsync(() => listAuditLogs(filters), { deps: [JSON.stringify(filters)] });
  const staff = useAsync(() => services().data.list('users', { limit: 400 }), {});
  const facilities = useAsync(() => services().data.allFacilities(), {});

  const rows = useMemo(() => logs.data ?? [], [logs.data]);

  const columns: Column<AuditLogEntry>[] = [
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-[0.84rem] font-medium text-ink-900">{formatDateTime(row.createdAt)}</p>
          <p className="caption mt-0.5">{relativeTime(row.createdAt)}</p>
        </div>
      ),
      sortValue: (row) => row.createdAt,
    },
    {
      key: 'actor',
      header: 'Who',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[0.86rem] font-semibold text-ink-900">{row.actorName}</p>
          <p className="caption mt-0.5">
            {row.actorRole === 'SYSTEM' ? 'system' : humanize(row.actorRole)}
            {row.facilityId ? ` · ${(facilities.data ?? []).find((item) => item.id === row.facilityId)?.name ?? 'facility'}` : ''}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[0.86rem] text-ink-900">{auditActionLabel(row.action)}</p>
          <p className="micro mt-0.5 break-all">{row.action}</p>
        </div>
      ),
    },
    {
      key: 'target',
      header: 'Object',
      render: (row) => (
        <div className="min-w-0">
          <p className="truncate text-[0.84rem] text-ink-800">{row.targetLabel ?? row.targetId}</p>
          <p className="caption mt-0.5">
            <Badge tone="neutral">{humanize(row.targetType)}</Badge>
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'meta',
      header: 'Detail',
      render: (row) => {
        const entries = Object.entries(row.metadata ?? {}).filter(([, value]) => value !== null && value !== '' && value !== undefined);
        if (entries.length === 0) return <span className="caption">—</span>;
        return (
          <ul className="space-y-0.5">
            {entries.slice(0, 3).map(([key, value]) => (
              <li key={key} className="caption">
                <span className="font-medium text-ink-600">{key}</span> {String(value)}
              </li>
            ))}
          </ul>
        );
      },
      hideBelow: 'lg',
    },
  ];

  const byAction = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) map.set(row.action, (map.get(row.action) ?? 0) + 1);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const result = await exportAuditLogs(filters);
      toast.success('Export prepared', `${result.rows} entries written to ${result.fileName}.`);
    } catch (error) {
      toast.error(error, 'The export failed');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AppShell
      title="Audit log"
      subtitle={`${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} in the current window`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={logs.loading} onClick={() => void logs.run()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void exportCsv()} loading={exporting} icon={<Download className="size-4" aria-hidden />}>
            Export CSV
          </Button>
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Entries shown" value={rows.length} hint={filters.from ? `since ${filters.from}` : 'all time'} loading={logs.loading} />
        <StatCard label="Distinct actions" value={byAction.length} hint="In this window" />
        <StatCard label="Most frequent" value={byAction[0] ? auditActionLabel(byAction[0][0] as AuditAction) : '—'} hint={byAction[0] ? `${byAction[0][1]} entries` : ''} />
        <StatCard label="Privilege changes" value={rows.filter((row) => row.action.startsWith('user.') || row.action === 'rule.updated').length} hint="Role, status and rule edits" tone={rows.some((row) => row.action.startsWith('user.role')) ? 'amber' : 'default'} />
      </div>

      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SearchInput value={term} onValueChange={setTerm} placeholder="Search actor, action or object" className="xl:col-span-2" />
          <Field label="Action">
            <Select
              value={filters.action ?? 'ALL'}
              options={[{ value: 'ALL', label: 'Any action' }, ...AUDIT_ACTIONS.map((action) => ({ value: action, label: auditActionLabel(action) }))]}
              onValueChange={(value) => setFilters({ ...filters, action: value === 'ALL' ? undefined : (value as AuditAction) })}
            />
          </Field>
          <Field label="Object type">
            <Select
              value={filters.targetType ?? ''}
              options={[{ value: '', label: 'Any type' }, ...TARGET_TYPES.map((type) => ({ value: type, label: humanize(type) }))]}
              onValueChange={(value) => setFilters({ ...filters, targetType: value || null })}
              placeholder="Any type"
            />
          </Field>
          <Field label="Facility">
            <Select
              value={filters.facilityId ?? ''}
              options={(facilities.data ?? []).map((row) => ({ value: row.id, label: row.name }))}
              onValueChange={(value) => setFilters({ ...filters, facilityId: value || null })}
              placeholder="Any facility"
            />
          </Field>
          <Field label="Actor">
            <Select
              value={filters.actorId ?? ''}
              options={(staff.data?.rows ?? []).map((row) => ({ value: row.id, label: row.fullName }))}
              onValueChange={(value) => setFilters({ ...filters, actorId: value || null })}
              placeholder="Anyone"
            />
          </Field>
          <Field label="From">
            <TextInput type="date" value={filters.from ?? ''} onChange={(event) => setFilters({ ...filters, from: event.target.value || null })} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={filters.to ?? ''} onChange={(event) => setFilters({ ...filters, to: event.target.value || null })} />
          </Field>
          <div className="flex items-end">
            <Button
              variant="ghost"
              onClick={() => {
                setTerm('');
                setFilters({ limit: 200 });
              }}
            >
              Reset filters
            </Button>
          </div>
        </div>
      </Card>

      {logs.error ? <div className="mb-4"><ErrorState message={logs.error} onRetry={() => void logs.run()} /></div> : null}

      <Card bodyClassName="p-0">
        {rows.length === 0 && !logs.loading ? (
          <EmptyState
            icon={<ClipboardList className="size-5" aria-hidden />}
            title="No audit entries in this window"
            description="Widen the date range or clear the filters. Entries are written as actions happen; there is no backfill for time before the platform was used."
          />
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} loading={logs.loading} dense pageSize={50} caption="Audit entries" />
        )}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <NoticeState tone="info" title="What is deliberately not here" compact>
          Audit rows carry an action, an actor, the object type and a few fields of context — never a blood pressure reading, a diagnosis or a phone number.
          That keeps the log shareable for supervision without exposing patient data.
        </NoticeState>
        <Card title="Common trails" description="Which actions to look for when reviewing a period." bodyClassName="p-0">
          <ul className="divide-y divide-ink-100">
            {byAction.slice(0, 6).map(([action, count]) => (
              <li key={action} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-[0.84rem] font-medium text-ink-900">{auditActionLabel(action as AuditAction)}</p>
                  <p className="micro mt-0.5 break-all">{action}</p>
                </div>
                <span className="tnum text-[0.9rem] font-semibold text-ink-800">{count}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="caption mt-4 flex items-center gap-1.5">
        <ShieldCheck className="size-3.5" aria-hidden />
        Entries cannot be edited or deleted from this screen — the collection is append-only in the security rules. See{' '}
        <Link to="/admin/settings" className="font-semibold text-brand-800 hover:underline">
          settings
        </Link>{' '}
        for who may change privileges.
      </p>
    </AppShell>
  );
}

import { useMemo, useState } from 'react';
import { Download, Eye, FileText, RefreshCw } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, NoticeState, StatusBadge } from '@/components/ui/display';
import { DataTable } from '@/components/ui/table';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import { useAsync, useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { buildPreview, defaultPeriod, generateReport, periodPresets, type ReportPreview, type ReportRequest } from '@/services/reports/report-service';
import { openReport } from '@/services/media/media-service';
import { formatDate } from '@/lib/utils';
import { REPORT_TYPE_LABELS, type ReportRecord, type ReportType } from '@/types/domain';

const PATIENT_TYPES: ReportType[] = ['PREGNANCY_SUMMARY', 'ANC_VISIT', 'REFERRAL', 'APPOINTMENT', 'ALERTS'];
const AGGREGATE_TYPES: ReportType[] = ['FACILITY', 'MATERNAL_CARE_SUMMARY', 'MISSED_APPOINTMENT', 'ANC_VISIT', 'REFERRAL', 'ALERTS'];

/**
 * Report builder. A report is rendered to PDF, stored in media storage and
 * registered with metadata; the row data itself is never duplicated into the
 * database and aggregate output carries no patient identifiers.
 */
export default function ReportsPage() {
  const { link: navLink } = useNavScope();
  const { actor, permissions } = useSession();
  const toast = useToast();
  const [scope, setScope] = useState<'aggregate' | 'patient'>('aggregate');
  const [type, setType] = useState<ReportType>('FACILITY');
  const [period, setPeriod] = useState(() => defaultPeriod());
  const [facilityId, setFacilityId] = useState<string>(actor?.facilityId ?? '');
  const [note, setNote] = useState('');
  const [motherId, setMotherId] = useState('');
  const [term, setTerm] = useState('');
  const [preview, setPreview] = useState<ReportPreview | null>(null);
  const [busy, setBusy] = useState<'preview' | 'generate' | 'open' | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const facilities = useAsync(() => services().data.allFacilities(), {});
  const roster = useAsync(() => services().data.motherRoster(facilityId || (actor?.facilityId ?? null)), { deps: [facilityId, actor?.facilityId] });

  const live = useLiveQuery('reports', {
    where: [],
    orderBy: { field: 'generatedAt', direction: 'desc' },
    limit: 100,
  });

  const search = term.trim().toLowerCase();
  const mothers = useMemo(
    () => (roster.data ?? []).filter((mother) => (search ? `${mother.fullName} ${mother.patientId}`.toLowerCase().includes(search) : true)).slice(0, 30),
    [roster.data, search],
  );

  const request: ReportRequest = useMemo(
    () => ({
      type,
      period,
      facilityId: scope === 'aggregate' ? facilityId || null : null,
      motherId: scope === 'patient' ? motherId || null : null,
      note: note.trim() || null,
    }),
    [type, period, scope, facilityId, motherId, note],
  );

  const build = async (mode: 'preview' | 'generate') => {
    if (scope === 'patient' && !motherId) {
      setListError('Choose the mother this report belongs to.');
      return;
    }
    setListError(null);
    setBusy(mode);
    try {
      if (mode === 'preview') {
        setPreview(await buildPreview(request));
      } else {
        const record = await generateReport(request);
        setPreview(null);
        toast.success('Report stored', `${record.title} — ${record.rowCount ?? 0} row${record.rowCount === 1 ? '' : 's'}. A secure link is on the record.`);
        void live.refresh();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The report could not be built.';
      setListError(message);
      toast.error(error, 'Report failed');
    } finally {
      setBusy(null);
    }
  };

  const open = async (record: ReportRecord) => {
    setBusy('open');
    try {
      const url = await openReport(record);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(error, 'The stored file could not be opened');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell
      title="Reports"
      subtitle={`${(live.data as ReportRecord[]).length} report${live.data.length === 1 ? '' : 's'} you can see`}
      actions={
        <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
          Refresh
        </Button>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <div className="space-y-4">
          <Card title="Build a report" description="Preview first: it shows exactly what will be written to the PDF before anything is stored.">
            <div className="space-y-3">
              <SegmentedControl
                ariaLabel="Report scope"
                value={scope}
                onChange={(value) => {
                  setScope(value);
                  setType(value === 'patient' ? 'PREGNANCY_SUMMARY' : 'FACILITY');
                  setPreview(null);
                }}
                options={[
                  { value: 'aggregate', label: 'Facility / district' },
                  { value: 'patient', label: 'Single mother' },
                ]}
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Report type" required>
                  <Select
                    value={type}
                    options={(scope === 'patient' ? PATIENT_TYPES : AGGREGATE_TYPES).map((key) => ({ value: key, label: REPORT_TYPE_LABELS[key] }))}
                    onValueChange={(value) => {
                      setType(value as ReportType);
                      setPreview(null);
                    }}
                    placeholder={null}
                  />
                </Field>
                {scope === 'aggregate' ? (
                  <Field label="Facility" hint="Leave empty to cover every facility you are allowed to see.">
                    <Select
                      value={facilityId}
                      options={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
                      onValueChange={setFacilityId}
                      placeholder={facilities.loading ? 'Loading…' : 'All my facilities'}
                    />
                  </Field>
                ) : (
                  <Field label="Mother" required>
                    <div className="space-y-2">
                      <SearchInput value={term} onValueChange={setTerm} placeholder="Search by name or patient ID" />
                      <Select
                        value={motherId}
                        placeholder={roster.loading ? 'Loading the roster…' : 'Select a mother'}
                        options={mothers.map((mother) => ({ value: mother.id, label: `${mother.fullName} — ${mother.patientId}` }))}
                        onValueChange={setMotherId}
                      />
                    </div>
                  </Field>
                )}
              </div>

              <Field label="Period" required hint="Aggregations only ever count stored rows inside these dates.">
                <div className="flex flex-wrap items-center gap-2">
                  <input type="date" className="input w-40" value={period.from} max={period.to} onChange={(event) => setPeriod({ ...period, from: event.target.value })} />
                  <span className="text-ink-400">→</span>
                  <input type="date" className="input w-40" value={period.to} min={period.from} onChange={(event) => setPeriod({ ...period, to: event.target.value })} />
                  <div className="flex flex-wrap gap-1.5">
                    {periodPresets.map((preset) => (
                      <button key={preset.label} type="button" className="chip" onClick={() => setPeriod(preset.value())}>
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </Field>

              <Field label="Note on the report" optional hint="A line of context for the reader. Never clinical advice or a diagnosis.">
                <TextArea rows={2} value={note} onValueChange={setNote} placeholder="Third-quarter review; ultrasound capacity still limited at the facility." />
              </Field>

              {listError ? <ErrorState message={listError} title="Nothing was generated" retryable={false} /> : null}

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" loading={busy === 'preview'} onClick={() => void build('preview')} icon={<Eye className="size-4" aria-hidden />}>
                  Preview
                </Button>
                {permissions.canGenerateReports ? (
                  <Button loading={busy === 'generate'} onClick={() => void build('generate')} icon={<FileText className="size-4" aria-hidden />}>
                    Generate PDF and store
                  </Button>
                ) : (
                  <span className="caption self-center">Your role can view reports but not generate new ones.</span>
                )}
              </div>
            </div>
          </Card>

          {preview ? (
            <Card
              title={`Preview — ${preview.title}`}
              description={`${preview.rowCount} row${preview.rowCount === 1 ? '' : 's'} · ${preview.fileName}`}
              actions={<Badge tone="neutral">not stored yet</Badge>}
            >
              <div className="space-y-4">
                <KeyValue
                  items={preview.document.summary.map((row) => ({ label: row.label, value: row.value }))}
                  columns={3}
                />
                <div>
                  <p className="micro mb-1.5">Sections in the PDF</p>
                  <ul className="space-y-1 text-[0.84rem] text-ink-700">
                    {preview.document.sections.map((section) => (
                      <li key={section.title} className="flex items-baseline justify-between gap-3 border-b border-ink-100 pb-1">
                        <span className="font-medium">{section.title}</span>
                        <span className="caption tnum">{section.rows?.length ?? 0} rows</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {preview.warnings.length > 0 ? (
                  <NoticeState tone="warning" title="Check these before circulating" compact>
                    <ul className="list-disc space-y-1 pl-4">
                      {preview.warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </NoticeState>
                ) : null}
                <p className="caption">{preview.document.confidentiality}</p>
              </div>
            </Card>
          ) : null}

          <Card title="Stored reports" description="Metadata lives in the database; the PDF itself lives in media storage behind a signed link." bodyClassName="p-0">
            {live.error ? (
              <div className="p-4">
                <ErrorState message={live.error} onRetry={() => void live.refresh()} />
              </div>
            ) : (live.data as ReportRecord[]).length === 0 && !live.loading ? (
              <EmptyState icon={<FileText className="size-5" aria-hidden />} title="No reports stored yet" description="Generated reports appear here, on the mother’s profile, and in the facility history." />
            ) : (
              <DataTable
                rows={live.data as ReportRecord[]}
                rowKey={(row) => row.id}
                dense
                loading={live.loading}
                columns={[
                  {
                    key: 'report',
                    header: 'Report',
                    render: (row) => (
                      <div className="min-w-0">
                        <p className="truncate text-[0.86rem] font-semibold text-ink-900">{row.title}</p>
                        <p className="caption mt-0.5">
                          {REPORT_TYPE_LABELS[row.type]} · {formatDate(row.period.from)}–{formatDate(row.period.to)}
                        </p>
                      </div>
                    ),
                    sortValue: (row) => row.generatedAt,
                  },
                  {
                    key: 'scope',
                    header: 'Scope',
                    render: (row) => (
                      <div className="space-y-1">
                        <Badge tone={row.scope === 'PATIENT' ? 'brand' : 'neutral'}>{row.scope === 'PATIENT' ? row.patientId ?? 'patient' : row.scope.toLowerCase()}</Badge>
                        <p className="caption">{row.rowCount ?? 0} rows</p>
                      </div>
                    ),
                    hideBelow: 'md',
                  },
                  {
                    key: 'access',
                    header: 'Access',
                    render: (row) => (
                      <p className="text-[0.8rem] text-ink-600">
                        {row.accessRoles.length} role{row.accessRoles.length === 1 ? '' : 's'}
                        {row.accessUserIds.length > 0 ? ` · ${row.accessUserIds.length} named user${row.accessUserIds.length === 1 ? '' : 's'}` : ''}
                      </p>
                    ),
                    hideBelow: 'lg',
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    render: (row) => (
                      <div className="space-y-1">
                        <StatusBadge status={row.status} />
                        <p className="caption">{row.generatedByName}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    render: (row) => (
                      <Button size="sm" variant="secondary" disabled={row.status !== 'GENERATED' || busy === 'open'} onClick={() => void open(row)} icon={<Download className="size-3.5" aria-hidden />}>
                        Open
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Who can open what">
            <NoticeState tone="info" title="Access is decided when the report is stored" compact>
              A patient report grants the mother who owns it, the clinicians at her facility and her supervisor. Facility and district reports are limited to
              supervisors and administrators, and never contain names, phone numbers or addresses.
            </NoticeState>
          </Card>
          <Card title="Data basis">
            <p className="text-[0.84rem] leading-relaxed text-ink-600">
              Every figure is counted from stored rows at generation time — visits, appointments, alerts and referrals. Nothing is estimated, and an empty
              period produces an empty report rather than a zero-filled one.
            </p>
            <ul className="mt-3 space-y-1.5 text-[0.82rem] text-ink-600">
              <li>· {scope === 'patient' ? 'Single record' : (facilityId ? 'One facility' : 'All facilities in scope')}</li>
              <li>· {formatDate(period.from)} to {formatDate(period.to)}</li>
              <li>· {REPORT_TYPE_LABELS[type]}</li>
            </ul>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

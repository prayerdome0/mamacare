/**
 * Administrator Reports Portal.
 *
 * Two main operational views:
 *  1. Official Healthcare Reports:
 *     - Master registry of all clinical reports (Antenatal, Clinical, Postnatal, Immunization, Referrals)
 *     - Full search by patient name, ID, report #, facility, report type, date, status
 *     - Instant PDF preview, print, and download
 *  2. Content Moderation Reports:
 *     - Flagged articles, facilities, messages, and user reports requiring admin decision
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  FileText,
  Flag,
  HeartPulse,
  Newspaper,
  Printer,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { healthcareReportRepo, reportRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime, toCsv, toIsoDate, downloadBlob, truncate } from '@/lib/utils';
import { downloadHealthcareReportPdf, printHealthcareReportPdf } from '@/lib/pdf-report';
import {
  HEALTHCARE_REPORT_TYPE_LABELS,
  type ContentReport,
  type HealthcareReport,
  type ReportTargetType,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { ReportPreviewModal } from '@/components/reports/report-preview-modal';

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

  const [mainTab, setMainTab] = useState<'healthcare' | 'moderation'>('healthcare');

  // Healthcare reports state
  const [hcSearch, setHcSearch] = useState('');
  const [hcTypeFilter, setHcTypeFilter] = useState('ALL');
  const [previewReport, setPreviewReport] = useState<HealthcareReport | null>(null);

  // Moderation state
  const [status, setStatus] = useState<ContentReport['status'] | 'ALL'>('open');
  const [targetType, setTargetType] = useState<ReportTargetType | 'ALL'>('ALL');
  const [selected, setSelected] = useState<ContentReport | null>(null);

  const {
    data: hcReportsData,
    loading: hcLoading,
    run: reloadHcReports,
  } = useAsync(() => healthcareReportRepo.all(500), { immediate: true });

  const {
    data: modData,
    loading: modLoading,
    error: modError,
    retryable: modRetryable,
    run: reloadModReports,
  } = useAsync(() => reportRepo.all(), { immediate: true });

  const hcReports = useMemo<HealthcareReport[]>(() => hcReportsData ?? [], [hcReportsData]);
  const modRows = useMemo<ContentReport[]>(() => modData ?? [], [modData]);

  // Healthcare reports filtering
  const filteredHcReports = useMemo(() => {
    const term = hcSearch.trim().toLowerCase();
    return hcReports.filter((r) => {
      if (hcTypeFilter !== 'ALL' && r.reportType !== hcTypeFilter) return false;
      if (!term) return true;
      return (
        r.patientName.toLowerCase().includes(term) ||
        r.patientId.toLowerCase().includes(term) ||
        r.reportNumber.toLowerCase().includes(term) ||
        r.facilityName.toLowerCase().includes(term) ||
        r.title.toLowerCase().includes(term)
      );
    });
  }, [hcReports, hcSearch, hcTypeFilter]);

  // Moderation filtering
  const filteredModRows = useMemo(
    () =>
      modRows.filter((report) => {
        if (status !== 'ALL' && report.status !== status) return false;
        if (targetType !== 'ALL' && report.targetType !== targetType) return false;
        return true;
      }),
    [modRows, status, targetType],
  );

  const modCounts = useMemo(
    () => ({
      total: modRows.length,
      open: modRows.filter((report) => report.status === 'open').length,
      reviewed: modRows.filter((report) => report.status === 'reviewed').length,
      actioned: modRows.filter((report) => report.status === 'actioned').length,
      dismissed: modRows.filter((report) => report.status === 'dismissed').length,
      safety: modRows.filter((report) => /danger|unsafe|wrong|harm|medic/i.test(`${report.reason} ${report.details ?? ''}`)).length,
      oldest: modRows
        .filter((report) => report.status === 'open')
        .map((report) => report.createdAt)
        .filter(Boolean)
        .sort()[0] ?? null,
    }),
    [modRows],
  );

  useEffect(() => {
    document.title = 'Reports Management · Mama Care admin';
  }, []);

  const handleDeleteHcReport = async (report: HealthcareReport, e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await confirm({
      title: 'Delete this healthcare report?',
      message: `Are you sure you want to delete #${report.reportNumber} for ${report.patientName}? This action is logged.`,
      confirmLabel: 'Delete report',
    });
    if (!ok) return;

    try {
      await healthcareReportRepo.remove(report.id);
      toast.success('Report deleted');
      void reloadHcReports();
    } catch {
      toast.error('Could not delete report');
    }
  };

  const exportModerationCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Reported', 'Type', 'Target', 'Reason', 'Details', 'Status', 'Reporter', 'Reviewed by', 'Resolution', 'Date'],
      modRows.map((report) => [
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
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-mod-reports-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'reports', actor?.uid ?? null, `Exported ${modRows.length} moderation reports`);
    toast.success('Export ready');
  };

  const modColumns: Column<ContentReport>[] = [
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
        title="Reports Management"
        description="Inspect and search official healthcare reports across facilities, or moderate community problem reports."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void reloadHcReports();
              void reloadModReports();
            }}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
        }
      />

      {/* Main Tabs */}
      <Card className="card-pad mb-5">
        <SegmentedControl
          value={mainTab}
          onChange={setMainTab}
          ariaLabel="Admin Report View Selection"
          options={[
            {
              value: 'healthcare',
              label: 'Official Healthcare Reports',
              count: hcReports.length,
            },
            {
              value: 'moderation',
              label: 'Content Moderation Reports',
              count: modCounts.open > 0 ? modCounts.open : modCounts.total,
            },
          ]}
        />
      </Card>

      {/* ── TAB 1: Official Healthcare Reports ──────────────────────── */}
      {mainTab === 'healthcare' ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total clinical reports"
              value={hcReports.length}
              icon={<FileCheck2 className="size-4" aria-hidden />}
              tone="brand"
            />
            <StatCard
              label="Antenatal summaries"
              value={hcReports.filter((r) => r.reportType === 'antenatal-summary').length}
              icon={<HeartPulse className="size-4" aria-hidden />}
            />
            <StatCard
              label="Facilities represented"
              value={new Set(hcReports.map((r) => r.facilityId)).size}
              icon={<Newspaper className="size-4" aria-hidden />}
              tone="green"
            />
            <StatCard
              label="Patients covered"
              value={new Set(hcReports.map((r) => r.patientId)).size}
              icon={<FileText className="size-4" aria-hidden />}
            />
          </div>

          {/* Search & Filter Bar */}
          <Card className="card-pad">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex-1">
                <SearchInput
                  placeholder="Search by patient name, ID, report # or facility…"
                  value={hcSearch}
                  onValueChange={setHcSearch}
                />
              </div>

              <div className="w-full sm:w-64">
                <Select
                  aria-label="Filter report type"
                  value={hcTypeFilter}
                  onChange={(e) => setHcTypeFilter(e.target.value)}
                  options={[
                    { value: 'ALL', label: 'All Report Types' },
                    ...Object.entries(HEALTHCARE_REPORT_TYPE_LABELS).map(([val, label]) => ({
                      value: val,
                      label,
                    })),
                  ]}
                />
              </div>
            </div>
          </Card>

          {hcLoading ? <LoadingRows rows={4} /> : null}

          {!hcLoading && hcReports.length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8 text-brand-700" aria-hidden />}
              title="No healthcare reports on record"
              description="Clinical reports generated by nurses and healthcare providers across facilities will appear here."
            />
          ) : null}

          {!hcLoading && hcReports.length > 0 && filteredHcReports.length === 0 ? (
            <EmptyState
              icon={<Search className="size-8 text-ink-400" aria-hidden />}
              title="No reports match your search criteria"
              description="Try adjusting your search terms or clearing the filter."
            />
          ) : null}

          {!hcLoading && filteredHcReports.length > 0 ? (
            <div className="space-y-3">
              {filteredHcReports.map((report) => (
                <Card
                  key={report.id}
                  className="card-pad cursor-pointer transition-shadow hover:shadow-md"
                  onClick={() => setPreviewReport(report)}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200 shrink-0">
                        <FileCheck2 className="size-6" aria-hidden />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-bold text-ink-950">{report.title}</h3>
                          <Badge tone="brand">#{report.reportNumber}</Badge>
                          <Badge tone="neutral">{report.patientName}</Badge>
                          <Badge tone="green">{report.status.toUpperCase()}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-ink-600">
                          {report.facilityName} · Patient ID: <strong className="font-mono text-ink-800">{report.patientId}</strong>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          Issued {report.createdAt ? formatDate(report.createdAt, 'long') : 'Recently'} · Prepared by {report.generatedByName} ({report.generatedByRole})
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewReport(report);
                        }}
                        icon={<Eye className="size-4" aria-hidden />}
                      >
                        Preview
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          printHealthcareReportPdf(report);
                        }}
                        icon={<Printer className="size-4" aria-hidden />}
                      >
                        Print
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          downloadHealthcareReportPdf(report);
                        }}
                        icon={<Download className="size-4" aria-hidden />}
                      >
                        Download PDF
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => void handleDeleteHcReport(report, e)}
                        icon={<Trash2 className="size-4 text-red-600" aria-hidden />}
                        aria-label="Delete report"
                      />
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── TAB 2: Content Moderation Reports ──────────────────────── */}
      {mainTab === 'moderation' ? (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open" value={modCounts.open} icon={<Flag className="size-4" aria-hidden />} tone={modCounts.open > 0 ? 'red' : 'green'} onClick={() => setStatus('open')} />
            <StatCard label="Reviewed" value={modCounts.reviewed} icon={<EyeOff className="size-4" aria-hidden />} onClick={() => setStatus('reviewed')} />
            <StatCard label="Action taken" value={modCounts.actioned} icon={<Wrench className="size-4" aria-hidden />} tone="green" onClick={() => setStatus('actioned')} />
            <StatCard
              label="Possible safety issues"
              value={modCounts.safety}
              icon={<ShieldAlert className="size-4" aria-hidden />}
              tone={modCounts.safety > 0 ? 'amber' : 'default'}
              hint="Keyword match — always read it yourself"
              onClick={() => setStatus('ALL')}
            />
          </div>

          <Card className="card-pad">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <SegmentedControl
                value={status}
                onChange={setStatus}
                ariaLabel="Report status"
                options={[
                  { value: 'open', label: 'Open', count: modCounts.open },
                  { value: 'reviewed', label: 'Reviewed', count: modCounts.reviewed },
                  { value: 'actioned', label: 'Actioned', count: modCounts.actioned },
                  { value: 'dismissed', label: 'Dismissed', count: modCounts.dismissed },
                  { value: 'ALL', label: 'All', count: modCounts.total },
                ]}
              />
              <div className="flex items-center gap-2">
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
                <Button variant="secondary" size="sm" onClick={() => void exportModerationCsv()} disabled={modRows.length === 0}>
                  Export CSV
                </Button>
              </div>
            </div>
          </Card>

          <Card className="card-pad">
            {modError ? <ErrorState title="Reports could not be loaded" message={modError} onRetry={modRetryable ? reloadModReports : undefined} /> : null}
            {modLoading ? <LoadingRows rows={5} /> : null}
            {!modLoading && !modError ? (
              <DataTable
                rows={filteredModRows}
                columns={modColumns}
                rowKey={(row) => row.id}
                caption="Content reports, newest first"
                pageSize={20}
                emptyTitle={modCounts.total === 0 ? 'Nothing has been reported' : 'No reports match'}
                emptyDescription="Try another status or type filter."
              />
            ) : null}
          </Card>
        </div>
      ) : null}

      {/* Review Content Modal */}
      <ReviewModal
        report={selected}
        onClose={() => setSelected(null)}
        onDone={() => {
          setSelected(null);
          toast.success('Report updated');
          void reloadModReports();
        }}
      />

      {/* Healthcare Report Preview Modal */}
      <ReportPreviewModal
        report={previewReport}
        open={Boolean(previewReport)}
        onClose={() => setPreviewReport(null)}
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
        message: 'The reporter is not notified. Your reason is stored so history is preserved.',
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
        ) : null}

        <Field label="Decision" htmlFor="adm-rr-status">
          <Select
            id="adm-rr-status"
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
        <Field label="Resolution" htmlFor="adm-rr-resolution" required error={error ?? undefined} hint="What was checked and what was decided.">
          <TextArea id="adm-rr-resolution" rows={4} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Checked against clinical guidelines and updated accordingly." />
        </Field>
      </div>
    </Modal>
  );
}

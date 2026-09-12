import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarCheck,
  CalendarX,
  Download,
  FileText,
  FolderOpen,
  Paperclip,
  RefreshCw,
  Send,
  Trash2,
  Upload,
} from 'lucide-react';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, InlineSpinner, NoticeState, ProgressBar, StatusBadge } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { TabPanel, Timeline } from '@/components/ui/tabs';
import { Field, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { useConfirm, useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { AlertCard } from '@/components/clinical/alert-card';
import { formatDate, formatDateTime, formatBytes, humanize, relativeTime, toIsoDate } from '@/lib/utils';
import { openDocument, deleteDocument, uploadDocument, openReport } from '@/services/media/media-service';
import { defaultPeriod, generateReport } from '@/services/reports/report-service';
import {
  APPOINTMENT_TYPE_LABELS,
  DOCUMENT_CATEGORY_LABELS,
  REFERRAL_STATUS_LABELS,
  REFERRAL_STATUSES,
  REPORT_TYPE_LABELS,
  type Appointment,
  type DocumentCategory,
  type DocumentRecord,
  type Referral,
  type ReferralStatus,
  type ReportRecord,
  type ReportType,
} from '@/types/domain';
import type { MotherChart } from '@/services/data-layer';

const PATIENT_REPORT_TYPES: ReportType[] = ['PREGNANCY_SUMMARY', 'ANC_VISIT', 'APPOINTMENT', 'REFERRAL', 'ALERTS', 'MATERNAL_CARE_SUMMARY'];

interface CareProps {
  tab: string;
  chart: MotherChart;
  onChanged: () => void;
  onRequestReferral: () => void;
}

/**
 * The five care/operations tabs on a mother profile. Mutations all go through
 * the data layer, which validates, authorises, writes and audits — these panels
 * never touch a collection directly.
 */
export function CareTabs({ tab, chart, onChanged, onRequestReferral }: CareProps) {
  return (
    <div className="space-y-4">
      <TabPanel id="appointments" active={tab === 'appointments'}>
        <AppointmentsPanel chart={chart} onChanged={onChanged} />
      </TabPanel>
      <TabPanel id="alerts" active={tab === 'alerts'}>
        <AlertsPanel chart={chart} onChanged={onChanged} />
      </TabPanel>
      <TabPanel id="referrals" active={tab === 'referrals'}>
        <ReferralsPanel chart={chart} onChanged={onChanged} onRequestReferral={onRequestReferral} />
      </TabPanel>
      <TabPanel id="documents" active={tab === 'documents'}>
        <DocumentsPanel chart={chart} onChanged={onChanged} />
      </TabPanel>
      <TabPanel id="reports" active={tab === 'reports'}>
        <ReportsPanel chart={chart} onChanged={onChanged} />
      </TabPanel>
    </div>
  );
}

/* ── appointments ─────────────────────────────────────────────────────── */

function AppointmentsPanel({ chart, onChanged }: { chart: MotherChart; onChanged: () => void }) {
  const toast = useToast();
  const { permissions } = useSession();
  const [cancelling, setCancelling] = useState<Appointment | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const rows = useMemo(
    () => [...chart.appointments].sort((a, b) => `${b.scheduledFor}${b.time}`.localeCompare(`${a.scheduledFor}${a.time}`)),
    [chart.appointments],
  );

  const act = async (appointment: Appointment, status: Appointment['status'], note?: string) => {
    setBusy(appointment.id);
    try {
      await services().data.setAppointmentStatus(appointment.id, status, note ? { note } : {});
      toast.success('Appointment updated', `${formatDate(appointment.scheduledFor)} marked ${humanize(status)}.`);
      setCancelling(null);
      setReason('');
      onChanged();
    } catch (error) {
      toast.error(error, 'Could not update the appointment');
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<Appointment>[] = [
    {
      key: 'when',
      header: 'When',
      render: (row) => (
        <div>
          <p className="text-[0.86rem] font-semibold text-ink-900">{formatDate(row.scheduledFor)}</p>
          <p className="caption">
            {row.time} · {row.durationMinutes} min
          </p>
        </div>
      ),
      sortValue: (row) => `${row.scheduledFor}${row.time}`,
    },
    {
      key: 'type',
      header: 'Visit',
      render: (row) => (
        <div>
          <p className="text-[0.84rem] text-ink-800">{APPOINTMENT_TYPE_LABELS[row.type]}</p>
          {row.reason ? <p className="caption mt-0.5 line-clamp-1">{row.reason}</p> : null}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} />
          {row.remindersSent[`${row.scheduledFor}-7`] ? <p className="caption">Reminder sent {relativeTime(row.remindersSent[`${row.scheduledFor}-7`])}</p> : null}
        </div>
      ),
      hideBelow: 'sm',
    },
    {
      key: 'who',
      header: 'Assigned',
      render: (row) => <span className="text-[0.84rem] text-ink-600">{row.assignedUserName ?? 'Not assigned'}</span>,
      hideBelow: 'lg',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        row.status === 'SCHEDULED' || row.status === 'CONFIRMED' ? (
          <div className="flex justify-end gap-1.5">
            {permissions.canScheduleAppointment ? (
              <>
                <Button size="sm" variant="secondary" loading={busy === row.id} onClick={() => void act(row, 'COMPLETED')} icon={<CalendarCheck className="size-3.5" aria-hidden />}>
                  Attended
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void act(row, 'MISSED')} icon={<CalendarX className="size-3.5" aria-hidden />}>
                  Missed
                </Button>
                <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => setCancelling(row)}>
                  Cancel
                </Button>
              </>
            ) : (
              <span className="caption">Read-only for your role</span>
            )}
          </div>
        ) : (
          <span className="caption">{row.cancelledReason ? truncate(row.cancelledReason) : 'Closed'}</span>
        ),
    },
  ];

  return (
    <Card title="Appointments" description="Attendance drives follow-up alerts and the facility’s missed-appointment report." bodyClassName="p-0">
      {rows.length === 0 ? (
        <EmptyState title="No appointments booked" description="Booking an appointment schedules reminders 7 days and 1 day ahead through the channels enabled in settings." />
      ) : (
        <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} dense caption="Appointments for this mother" />
      )}

      <Modal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title="Cancel this appointment"
        description="The reason is stored on the appointment and shown in the missed/cancelled report."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelling(null)}>
              Keep appointment
            </Button>
            <Button
              variant="danger"
              loading={busy === cancelling?.id}
              disabled={!reason.trim()}
              onClick={() => cancelling && void act(cancelling, 'CANCELLED', reason.trim())}
            >
              Cancel appointment
            </Button>
          </>
        }
      >
        <Field label="Reason" required error={reason.length > 0 && reason.trim().length < 3 ? 'Give a short reason.' : undefined}>
          <TextArea rows={3} value={reason} onValueChange={setReason} placeholder="Mother reported she is outside the district; reschedule after she returns." />
        </Field>
      </Modal>
    </Card>
  );
}

/* ── alerts ────────────────────────────────────────────────────────────── */

function AlertsPanel({ chart, onChanged }: { chart: MotherChart; onChanged: () => void }) {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const rows = chart.alerts.filter((row) => (filter === 'open' ? row.status !== 'RESOLVED' : true));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[0.86rem] text-ink-600">
          {chart.alerts.length === 0
            ? 'No alerts on this record yet.'
            : `${chart.alerts.filter((row) => row.status !== 'RESOLVED').length} unresolved of ${chart.alerts.length} raised.`}
        </p>
        <Select
          value={filter}
          options={[
            { value: 'open', label: 'Unresolved only' },
            { value: 'all', label: 'Show all' },
          ]}
          onValueChange={(value) => setFilter(value as 'open' | 'all')}
          className="w-44"
        />
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'open' ? 'No unresolved alerts' : 'No alerts recorded'}
            description={
              filter === 'open'
                ? 'Anything saved with a value matching a rule appears here immediately, and the responsible officer is notified.'
                : 'Alerts are raised by the rule engine when a visit is saved, or manually by a clinician.'
            }
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((alert) => (
            <li key={alert.id}>
              <AlertCard alert={alert} showMother={false} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}

      <NoticeState tone="info" title="What an alert means" compact>
        An alert records that a stored value matched a configured threshold. It is not a diagnosis and does not replace clinical judgement. The
        wording shown on every alert asks for assessment, and the rule set must be signed off by a clinician before live use.
      </NoticeState>
    </div>
  );
}

/* ── referrals ─────────────────────────────────────────────────────────── */

function ReferralsPanel({ chart, onChanged, onRequestReferral }: { chart: MotherChart; onChanged: () => void; onRequestReferral: () => void }) {
  const toast = useToast();
  const { permissions, actor } = useSession();
  const [updating, setUpdating] = useState<string | null>(null);
  const [feedbackFor, setFeedbackFor] = useState<Referral | null>(null);
  const [feedback, setFeedback] = useState('');
  const [followUp, setFollowUp] = useState('');

  const [names, setNames] = useState<Record<string, string>>({});

  // Facility names come from the facility directory, never from the patient row.
  useEffect(() => {
    if (chart.referrals.length === 0) return;
    let alive = true;
    void (async () => {
      try {
        const list = await services().data.allFacilities();
        const map: Record<string, string> = {};
        for (const facility of list) map[facility.id] = facility.name;
        if (alive) setNames(map);
      } catch {
        /* ids are shown instead — a missing name must never block the record */
      }
    })();
    return () => {
      alive = false;
    };
  }, [chart.referrals]);

  const setStatus = async (referral: Referral, status: ReferralStatus) => {
    setUpdating(referral.id);
    try {
      await services().data.updateReferralStatus(referral.id, status);
      toast.success('Referral updated', `${names[referral.receivingFacilityId] ?? 'Receiving facility'} → ${REFERRAL_STATUS_LABELS[status]}.`);
      onChanged();
    } catch (error) {
      toast.error(error, 'Could not update the referral');
    } finally {
      setUpdating(null);
    }
  };

  const saveFeedback = async () => {
    if (!feedbackFor) return;
    setUpdating(feedbackFor.id);
    try {
      await services().data.addReferralFeedback(feedbackFor.id, feedback.trim(), followUp || null);
      toast.success('Feedback recorded', 'The clinician who raised the referral has been notified.');
      setFeedbackFor(null);
      setFeedback('');
      setFollowUp('');
      onChanged();
    } catch (error) {
      toast.error(error, 'Could not save the feedback');
    } finally {
      setUpdating(null);
    }
  };

  if (chart.referrals.length === 0) {
    return (
      <Card title="Referrals">
        <EmptyState
          icon={<Send className="size-5" aria-hidden />}
          title="No referral has been raised"
          description="Referrals carry the reason, the clinical question, the vital snapshot at the time of transfer and the receiving facility’s feedback."
          action={
            permissions.canCreateReferral ? (
              <Button onClick={onRequestReferral} icon={<Send className="size-4" aria-hidden />}>
                Start a referral
              </Button>
            ) : null
          }
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {chart.referrals.map((referral) => (
        <Card
          key={referral.id}
          title={`${REFERRAL_STATUS_LABELS[referral.status]}`}
          description={`${names[referral.originFacilityId] ?? referral.originFacilityId} → ${names[referral.receivingFacilityId] ?? referral.receivingFacilityId} · ${formatDateTime(referral.scheduledAt)}`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={referral.urgency === 'EMERGENCY' ? 'red' : referral.urgency === 'URGENT' ? 'amber' : 'neutral'}>{humanize(referral.urgency)}</Badge>
              {permissions.canUpdateReferral ? (
                <Button size="sm" variant="secondary" onClick={() => setFeedbackFor(referral)}>
                  Add feedback
                </Button>
              ) : null}
            </div>
          }
        >
          <KeyValue
            columns={2}
            items={[
              { label: 'Reason', value: referral.reason, tone: 'strong' },
              { label: 'Clinical question', value: referral.clinicalQuestion ?? '—' },
              { label: 'Transport', value: `${humanize(referral.transport)}${referral.transportNote ? ` · ${referral.transportNote}` : ''}` },
              { label: 'Raised by', value: `${referral.createdByName} · ${relativeTime(referral.createdAt)}` },
              { label: 'Follow-up due', value: referral.followUpDueAt ? formatDate(referral.followUpDueAt) : 'Not set' },
              { label: 'Feedback', value: referral.feedbackNote ?? 'Awaiting the receiving facility' },
            ]}
          />

          <p className="micro mt-4 mb-2">Status history</p>
          <Timeline
            items={referral.statusHistory.map((event) => ({
              title: REFERRAL_STATUS_LABELS[event.status],
              meta: `${formatDate(event.at)} · ${event.byName}`,
              tone: event.status === 'CLOSED' ? ('green' as const) : ('brand' as const),
              detail: event.note ?? null,
            }))}
          />

          {permissions.canUpdateReferral ? (
            <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-ink-200 pt-3">
              <Field label="Move to status" hint={`You are updating as ${actor?.displayName ?? 'a health worker'}. Each change is audited.`}>
                <Select
                  value={referral.status}
                  options={REFERRAL_STATUSES.map((status) => ({ value: status, label: REFERRAL_STATUS_LABELS[status] }))}
                  onValueChange={(value) => void setStatus(referral, value as ReferralStatus)}
                  className="min-w-[13rem]"
                />
              </Field>
              {updating === referral.id ? <InlineSpinner label="Saving" /> : null}
            </div>
          ) : null}
        </Card>
      ))}

      <Modal
        open={Boolean(feedbackFor)}
        onClose={() => setFeedbackFor(null)}
        title="Feedback from the receiving facility"
        description="What was found, what was done, and what this facility should do next."
        size="md"
        footer={
          <>
            <Button variant="secondary" onClick={() => setFeedbackFor(null)}>
              Cancel
            </Button>
            <Button loading={updating === feedbackFor?.id} disabled={feedback.trim().length < 5} onClick={() => void saveFeedback()}>
              Save feedback
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Feedback" required>
            <TextArea rows={4} value={feedback} onValueChange={setFeedback} placeholder="Seen at 14:20. BP 168/110, urine 3+ protein, headache settled. Admitted to maternity ward, IV labetalol per protocol. Notify the referring clinic on discharge." />
          </Field>
          <Field label="Follow-up date" optional hint="Optional. Sets a reminder for this facility to chase the outcome.">
            <input type="date" className="input" value={followUp} min={toIsoDate(new Date())} onChange={(event) => setFollowUp(event.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

/* ── documents ─────────────────────────────────────────────────────────── */

function DocumentsPanel({ chart, onChanged }: { chart: MotherChart; onChanged: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const { permissions, actor } = useSession();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<DocumentCategory>('MEDICAL');
  const [uploading, setUploading] = useState<{ name: string; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const upload = async (file: File) => {
    setError(null);
    setUploading({ name: file.name, percent: 0 });
    try {
      const { record } = await uploadDocument(file, {
        category,
        name: file.name.replace(/\.[^.]+$/, ''),
        motherId: chart.mother.id,
        patientId: chart.mother.patientId,
        pregnancyId: chart.activePregnancy?.id ?? null,
        facilityId: chart.mother.careFacilityId ?? chart.mother.registrationFacilityId ?? null,
        ownerUserId: actor?.uid ?? null,
        onProgress: (percent) => setUploading({ name: file.name, percent }),
      });
      toast.success('Document attached', `${record.name} is stored and linked to ${chart.mother.patientId}.`);
      onChanged();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'The upload failed.';
      setError(message);
      toast.error(caught, 'Upload failed');
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const open = async (record: DocumentRecord) => {
    setBusy(record.id);
    try {
      const url = await openDocument(record, { purpose: 'view' });
      window.open(url, '_blank', 'noopener');
      onChanged();
    } catch (caught) {
      toast.error(caught, 'The file could not be opened');
    } finally {
      setBusy(null);
    }
  };

  const remove = async (record: DocumentRecord) => {
    const ok = await confirm({
      title: 'Delete this document?',
      message: `${record.name} will be removed from storage and hidden from every list. The deletion is recorded in the audit log.`,
      confirmLabel: 'Delete document',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(record.id);
    try {
      await deleteDocument(record);
      toast.success('Document deleted', record.name);
      onChanged();
    } catch (caught) {
      toast.error(caught, 'Delete failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {permissions.canUploadDocuments ? (
        <Card title="Attach a document" description="Lab results, referral letters, scanned cards and consent forms. Files are validated, then stored in the patient folder.">
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Category" hint="Sets who can read it.">
              <Select
                value={category}
                options={(Object.keys(DOCUMENT_CATEGORY_LABELS) as DocumentCategory[]).map((key) => ({ value: key, label: DOCUMENT_CATEGORY_LABELS[key] }))}
                onValueChange={(value) => setCategory(value as DocumentCategory)}
                className="min-w-[12rem]"
              />
            </Field>
            <input
              ref={inputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,application/pdf,image/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <Button onClick={() => inputRef.current?.click()} loading={Boolean(uploading)} icon={<Upload className="size-4" aria-hidden />}>
              Choose file
            </Button>
            <span className="caption">PDF, PNG, JPG, WebP or HEIC up to 15 MB.</span>
          </div>
          {uploading ? (
            <div className="mt-3">
              <ProgressBar value={uploading.percent} label={`Uploading ${uploading.name}`} tone="brand" />
            </div>
          ) : null}
          {error ? (
            <div className="mt-3">
              <ErrorState message={error} onRetry={() => inputRef.current?.click()} />
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card title="Documents on this record" bodyClassName="p-0">
        {chart.documents.length === 0 ? (
          <EmptyState icon={<FolderOpen className="size-5" aria-hidden />} title="No documents attached" description="Anything uploaded here is visible only to the roles allowed for its category and to the mother herself for her own results." />
        ) : (
          <DataTable
            rows={chart.documents}
            rowKey={(row) => row.id}
            dense
            columns={[
              {
                key: 'name',
                header: 'Document',
                render: (row) => (
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-[0.86rem] font-semibold text-ink-900">{row.name}</p>
                      <p className="caption">
                        {DOCUMENT_CATEGORY_LABELS[row.category]} · v{row.version} · {formatBytes(row.sizeBytes)}
                      </p>
                    </div>
                  </div>
                ),
              },
              {
                key: 'uploaded',
                header: 'Added',
                render: (row) => (
                  <div>
                    <p className="text-[0.84rem] text-ink-700">{formatDate(row.uploadedAt)}</p>
                    <p className="caption">{row.uploadedByName}</p>
                  </div>
                ),
                hideBelow: 'md',
              },
              {
                key: 'access',
                header: 'Access',
                render: (row) => (
                  <div className="flex flex-wrap gap-1">
                    <Badge tone={row.accessMode === 'PUBLIC_READ' ? 'neutral' : 'brand'}>{row.accessMode === 'PUBLIC_READ' ? 'Public link' : 'Signed access only'}</Badge>
                    {row.accessRoles.length > 0 ? <Badge tone="neutral">{row.accessRoles.length} roles</Badge> : null}
                  </div>
                ),
                hideBelow: 'lg',
              },
              {
                key: 'actions',
                header: '',
                align: 'right',
                render: (row) => (
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="secondary" disabled={busy === row.id} onClick={() => void open(row)} icon={<Download className="size-3.5" aria-hidden />}>
                      Open
                    </Button>
                    {permissions.canUploadDocuments ? (
                      <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void remove(row)} icon={<Trash2 className="size-3.5" aria-hidden />}>
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ),
              },
            ] satisfies Column<DocumentRecord>[]}
          />
        )}
      </Card>

      <NoticeState tone="info" title="Where the file lives" compact>
        {chart.documents[0]?.publicId
          ? `Files are stored under the mamacare/ Cloudinary folder (for example ${chart.documents[0].publicId.split('/').slice(0, 2).join('/')}), never on this device. Without Cloudinary credentials they stay in device storage so the workflow is still testable end to end.`
          : 'Uploads go to the configured media storage under the mamacare/ folder tree. The Cloudinary API secret is never present in this browser bundle.'}
      </NoticeState>
    </div>
  );
}

/* ── reports ───────────────────────────────────────────────────────────── */

function ReportsPanel({ chart, onChanged }: { chart: MotherChart; onChanged: () => void }) {
  const toast = useToast();
  const { permissions } = useSession();
  const [type, setType] = useState<ReportType>('PREGNANCY_SUMMARY');
  const [period, setPeriod] = useState(() => defaultPeriod());
  const [generating, setGenerating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const record = await generateReport({ type, period, motherId: chart.mother.id });
      toast.success('Report generated', `${record.title} is saved with a secure link.`);
      onChanged();
    } catch (error) {
      toast.error(error, 'Report generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const open = async (record: ReportRecord) => {
    setBusy(record.id);
    try {
      const url = await openReport(record);
      window.open(url, '_blank', 'noopener');
    } catch (error) {
      toast.error(error, 'The report could not be opened');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {permissions.canGenerateReports ? (
        <Card title="Generate a report" description="Rendered as a PDF, stored in the report folder and linked to this patient record. The mother only ever sees reports addressed to her.">
          <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
            <Field label="Report">
              <Select
                value={type}
                options={PATIENT_REPORT_TYPES.map((key) => ({ value: key, label: REPORT_TYPE_LABELS[key] }))}
                onValueChange={(value) => setType(value as ReportType)}
              />
            </Field>
            <Field label="From">
              <input type="date" className="input" value={period.from} onChange={(event) => setPeriod({ ...period, from: event.target.value })} />
            </Field>
            <Field label="To">
              <input type="date" className="input" value={period.to} onChange={(event) => setPeriod({ ...period, to: event.target.value })} />
            </Field>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button onClick={() => void generate()} loading={generating} icon={<Paperclip className="size-4" aria-hidden />}>
              Generate and attach
            </Button>
            <span className="caption">Period {formatDate(period.from)} → {formatDate(period.to)}</span>
          </div>
        </Card>
      ) : null}

      <Card title="Reports on this record" bodyClassName="p-0">
        {chart.reports.length === 0 ? (
          <EmptyState icon={<FileText className="size-5" aria-hidden />} title="No reports yet" description="Generated reports keep their metadata here; the PDF itself stays in media storage." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {chart.reports.map((record) => (
              <li key={record.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                <div className="min-w-0">
                  <p className="truncate text-[0.88rem] font-semibold text-ink-900">{record.title}</p>
                  <p className="caption mt-0.5">
                    {REPORT_TYPE_LABELS[record.type]} · {formatDate(record.period.from)}–{formatDate(record.period.to)} · {formatDateTime(record.generatedAt)} ·{' '}
                    {record.generatedByName}
                    {record.rowCount ? ` · ${record.rowCount} row${record.rowCount === 1 ? '' : 's'}` : ''}
                  </p>
                  {record.error ? <p className="caption mt-1 text-[var(--color-risk-red-text)]">{record.error}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={record.status} />
                  <Button size="sm" variant="secondary" disabled={busy === record.id || record.status !== 'GENERATED'} onClick={() => void open(record)} icon={<Download className="size-3.5" aria-hidden />}>
                    Open
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NoticeState tone="warning" title="Clinical content is not a diagnosis" compact>
        Report narratives describe what was recorded and which thresholds matched. They must be reviewed by a clinician before any decision, and
        the alert rules used inside them are pending clinical validation.
      </NoticeState>
    </div>
  );
}

const truncate = (value: string, max = 42): string => (value.length > max ? `${value.slice(0, max - 1)}…` : value);

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowUpRight, RefreshCw, Send } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState, StatusBadge } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl, Timeline } from '@/components/ui/tabs';
import { SearchInput, Select } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useConfirm, useSession } from '@/providers/app-providers';
import { useAsync, useDebouncedValue, useLiveQuery } from '@/hooks';
import { services } from '@/services/session-store';
import { useToast } from '@/components/ui/toast';
import { formatDate, formatDateTime, humanize, relativeTime, toIsoDate } from '@/lib/utils';
import { REFERRAL_STATUS_LABELS, REFERRAL_STATUSES, type Referral, type ReferralStatus } from '@/types/domain';
import { ReferralDialog } from '@/routes/app/referral-dialog';

/**
 * The referral register: who has been sent where, whether they were received, and
 * what came back. Status follows the nine-step workflow, and each change is
 * written to the mother’s record and the audit log by the data layer.
 */
export default function ReferralsPage() {
  const { actor, permissions } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<'open' | 'facility' | 'all'>('open');
  const [term, setTerm] = useState('');
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState<string | null>(null);
  const [detail, setDetail] = useState<Referral | null>(null);
  const search = useDebouncedValue(term, 250);

  const scope = actor?.role === 'ADMIN' || !actor?.facilityId ? [] : [{ field: 'receivingFacilityId', op: '==' as const, value: actor.facilityId }];
  const live = useLiveQuery('referrals', { where: scope, orderBy: { field: 'scheduledAt', direction: 'desc' }, limit: 250 });
  const facilities = useAsync(() => services().data.allFacilities(), {});
  const names = useMemo(() => Object.fromEntries((facilities.data ?? []).map((row) => [row.id, row.name])), [facilities.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const today = toIsoDate(new Date());
    return (live.data as Referral[]).filter((row) => {
      if (view === 'open' && row.status === 'CLOSED') return false;
      if (view === 'facility' && row.receivingFacilityId !== actor?.facilityId) return false;
      if (needle && !`${row.motherName} ${row.patientId} ${row.reason}`.toLowerCase().includes(needle)) return false;
      void today;
      return true;
    });
  }, [live.data, view, search, actor?.facilityId]);

  const counts = useMemo(() => {
    const all = live.data as Referral[];
    return {
      open: all.filter((row) => row.status !== 'CLOSED').length,
      incoming: all.filter((row) => row.receivingFacilityId === actor?.facilityId && row.status !== 'CLOSED').length,
      awaiting: all.filter((row) => row.status === 'ACTIVE').length,
      followUp: all.filter((row) => row.status === 'FOLLOW_UP_REQUIRED').length,
    };
  }, [live.data, actor?.facilityId]);

  const changeStatus = async (row: Referral, status: ReferralStatus) => {
    const ok = await confirm({
      title: `Mark as “${REFERRAL_STATUS_LABELS[status]}”?`,
      message: `${row.motherName} (${row.patientId}) at ${names[row.receivingFacilityId] ?? 'the receiving facility'}. This is written to her record and the audit log.`,
      confirmLabel: 'Update referral',
    });
    if (!ok) return;
    setUpdating(row.id);
    try {
      await services().data.updateReferralStatus(row.id, status);
      toast.success('Referral updated', REFERRAL_STATUS_LABELS[status]);
      void live.refresh();
    } catch (error) {
      toast.error(error, 'The referral status could not be changed');
    } finally {
      setUpdating(null);
    }
  };

  const columns: Column<Referral>[] = [
    {
      key: 'mother',
      header: 'Mother',
      render: (row) => (
        <div className="min-w-0">
          <Link to={`/app/mothers/${row.motherId}`} className="block truncate text-[0.88rem] font-semibold text-ink-900 hover:text-brand-800 hover:underline">
            {row.motherName}
          </Link>
          <p className="micro mt-0.5">{row.patientId}</p>
        </div>
      ),
      sortValue: (row) => row.motherName,
    },
    {
      key: 'route',
      header: 'From → to',
      render: (row) => (
        <div className="text-[0.84rem] text-ink-700">
          <p className="truncate">{names[row.originFacilityId] ?? row.originFacilityId}</p>
          <p className="caption mt-0.5 flex items-center gap-1">
            <ArrowUpRight className="size-3" aria-hidden /> {names[row.receivingFacilityId] ?? row.receivingFacilityId}
          </p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => (
        <div className="min-w-0">
          <p className="line-clamp-2 text-[0.84rem] text-ink-800">{row.reason}</p>
          <p className="caption mt-0.5">{formatDateTime(row.scheduledAt)}</p>
        </div>
      ),
    },
    {
      key: 'urgency',
      header: 'Urgency',
      render: (row) => (
        <Badge tone={row.urgency === 'EMERGENCY' ? 'red' : row.urgency === 'URGENT' ? 'amber' : 'neutral'}>{humanize(row.urgency)}</Badge>
      ),
      hideBelow: 'sm',
      sortValue: (row) => (row.urgency === 'EMERGENCY' ? 0 : row.urgency === 'URGENT' ? 1 : 2),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} label={REFERRAL_STATUS_LABELS[row.status]} />
          {row.feedbackNote ? <p className="caption line-clamp-1">feedback recorded</p> : <p className="caption">awaiting feedback</p>}
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) =>
        permissions.canUpdateReferral ? (
          <Select
            value={row.status}
            options={REFERRAL_STATUSES.map((status) => ({ value: status, label: REFERRAL_STATUS_LABELS[status] }))}
            onValueChange={(value) => void changeStatus(row, value as ReferralStatus)}
            placeholder={null}
            className="h-8 py-1 text-[0.78rem]"
            disabled={updating === row.id}
          />
        ) : (
          <span className="caption">{relativeTime(row.createdAt)}</span>
        ),
    },
  ];

  return (
    <AppShell
      title="Referrals"
      subtitle={`${counts.open} open · ${counts.incoming} coming to your facility · ${counts.followUp} needing follow-up`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canCreateReferral ? (
            <Button size="sm" onClick={() => setCreating(true)} icon={<Send className="size-4" aria-hidden />}>
              New referral
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open referrals" value={counts.open} hint="Not yet closed" loading={live.loading} icon={<Activity className="size-4" aria-hidden />} />
        <StatCard label="Incoming to you" value={counts.incoming} hint="Referred to your facility" tone={counts.incoming > 0 ? 'brand' : 'default'} />
        <StatCard label="Awaiting receipt" value={counts.awaiting} hint="Nobody has confirmed arrival" tone={counts.awaiting > 0 ? 'amber' : 'default'} />
        <StatCard label="Follow-up required" value={counts.followUp} hint="The receiving team asked for action" tone={counts.followUp > 0 ? 'red' : 'green'} />
      </div>

      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Referral view"
            value={view}
            onChange={setView}
            options={[
              { value: 'open', label: 'Open' },
              { value: 'facility', label: 'Incoming to my facility' },
              { value: 'all', label: 'All' },
            ]}
          />
          <SearchInput value={term} onValueChange={setTerm} placeholder="Search mother, patient ID or reason" className="min-w-[14rem] max-w-sm flex-1" />
        </div>
      </Card>

      {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}

      <Card bodyClassName="p-0">
        {live.loading && rows.length === 0 ? (
          <div className="p-4">
            <LoadingRows rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Send className="size-5" aria-hidden />}
            title={view === 'facility' ? 'Nothing has been referred to your facility' : 'No referrals in this view'}
            description="A referral records the reason, the clinical question, the observations at handover and the transport arranged — so the next clinician starts informed."
            action={
              permissions.canCreateReferral ? (
                <Button onClick={() => setCreating(true)}>
                  Start a referral
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            dense
            pageSize={20}
            caption="Referrals"
            onRowClick={(row) => setDetail(row)}
            footer={
              <p className="caption">
                Tap a row for the clinical summary, the observations sent with her and the handover trail. {rows.length} shown.
              </p>
            }
          />
        )}
      </Card>

      <div className="mt-4">
        <NoticeState tone="info" title="Nine statuses, one meaning each" compact>
          Active → Received → Assessment completed → Treatment → Admission → Discharged → Referred onward → Follow-up required → Closed. A referral is only
          closed once feedback has been recorded, so nothing is quietly dropped between facilities.
        </NoticeState>
      </div>

      <ReferralDialog open={creating} onClose={() => setCreating(false)} onSaved={() => void live.refresh()} />

      <Modal open={Boolean(detail)} onClose={() => setDetail(null)} title={detail ? `Referral — ${detail.motherName}` : 'Referral'} description={detail ? `${detail.patientId} · ${REFERRAL_STATUS_LABELS[detail.status]}` : undefined} size="xl"
        footer={
          <>
            {detail ? (
              <Link to={`/app/mothers/${detail.motherId}?tab=referrals`} className="btn btn-secondary btn-sm">
                Open her record
              </Link>
            ) : null}
            <Button onClick={() => setDetail(null)}>Close</Button>
          </>
        }
      >
        {detail ? <ReferralDetail row={detail} names={names} /> : null}
      </Modal>
    </AppShell>
  );
}

function ReferralDetail({ row, names }: { row: Referral; names: Record<string, string> }) {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1.3fr_1fr]">
      <div>
        <p className="micro mb-1.5">Clinical summary sent</p>
        <p className="whitespace-pre-line text-[0.86rem] leading-relaxed text-ink-700">{row.clinicalNotes}</p>
        {row.clinicalQuestion ? <p className="caption mt-2">Question asked: {row.clinicalQuestion}</p> : null}
        {row.vitalSnapshot ? (
          <div className="mt-3 rounded-lg border border-ink-200 bg-ink-50 p-3">
            <p className="micro mb-1">Observations at handover</p>
            <p className="text-[0.84rem] text-ink-700 tnum">
              BP {row.vitalSnapshot.systolicBp ?? '—'}/{row.vitalSnapshot.diastolicBp ?? '—'} · pulse {row.vitalSnapshot.pulse ?? '—'} · temperature{' '}
              {row.vitalSnapshot.temperatureC ?? '—'} °C · fetal heart rate {row.vitalSnapshot.fetalHeartRate ?? '—'}
            </p>
          </div>
        ) : null}
        {row.feedbackNote ? (
          <div className="mt-3 rounded-lg border border-brand-200 bg-brand-50/50 p-3">
            <p className="micro mb-1">Feedback from {names[row.receivingFacilityId] ?? 'the receiving facility'}</p>
            <p className="text-[0.86rem] leading-relaxed text-ink-800">{row.feedbackNote}</p>
            {row.followUpDueAt ? <p className="caption mt-1.5">Follow-up due {formatDate(row.followUpDueAt)}</p> : null}
          </div>
        ) : (
          <p className="caption mt-3">No feedback yet from {names[row.receivingFacilityId] ?? 'the receiving facility'}.</p>
        )}
      </div>
      <div>
        <p className="micro mb-1.5">Handover trail</p>
        <Timeline
          items={row.statusHistory.map((event) => ({
            title: REFERRAL_STATUS_LABELS[event.status],
            meta: `${formatDate(event.at)} · ${event.byName}`,
            detail: event.note ?? null,
            tone: event.status === 'CLOSED' ? ('green' as const) : event.status === 'ACTIVE' ? ('amber' as const) : ('brand' as const),
          }))}
        />
        <p className="caption mt-3">
          Raised by {row.createdByName} · transport {humanize(row.transport)}
          {row.transportNote ? ` (${row.transportNote})` : ''} · last updated {relativeTime(row.updatedAt ?? row.createdAt)}
        </p>
      </div>
    </div>
  );
}

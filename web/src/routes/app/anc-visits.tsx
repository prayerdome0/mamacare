import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Stethoscope } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/table';
import { Badge, EmptyState, ErrorState, RiskBadge } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import { useDebouncedValue, useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { formatDate } from '@/lib/utils';
import { DANGER_SIGN_LABELS, type AncVisit, type Mother } from '@/types/domain';

/**
 * Facility-wide visit list: what was recorded, by whom, and what the rules
 * decided at the time. Amending a visit happens on the mother’s record so the
 * clinical context is never more than one click away.
 */
export default function AncVisitsPage() {
  const { link: navLink } = useNavScope();
  const navigate = useNavigate();
  const { actor } = useSession();
  const [term, setTerm] = useState('');
  const [risk, setRisk] = useState<'ALL' | 'RED' | 'AMBER' | 'GREEN'>('ALL');
  const [period, setPeriod] = useState<'30' | '90' | 'all'>('90');
  const search = useDebouncedValue(term, 200);

  const roster = useLiveQuery('mothers', {
    where: [],
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 500,
  });

  const live = useLiveQuery('anc_visits', {
    where: actor?.role === 'ADMIN' || !actor?.facilityId ? [] : [{ field: 'facilityId', op: '==', value: actor.facilityId }],
    orderBy: { field: 'visitDate', direction: 'desc' },
    limit: 400,
  });

  const names = useMemo(() => {
    const map = new Map<string, Mother>();
    for (const mother of roster.data as Mother[]) map.set(mother.id, mother);
    return map;
  }, [roster.data]);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const cutoff = period === 'all' ? null : new Date(Date.now() - Number(period) * 86400000).toISOString().slice(0, 10);
    return (live.data as AncVisit[]).filter((visit) => {
      if (risk !== 'ALL' && visit.riskLevelAfter !== risk) return false;
      if (cutoff && visit.visitDate < cutoff) return false;
      if (needle) {
        const mother = names.get(visit.motherId);
        const haystack = `${mother?.fullName ?? ''} ${mother?.patientId ?? ''}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [live.data, search, risk, period, names]);

  const columns: Column<AncVisit>[] = [
    {
      key: 'visit',
      header: 'Visit',
      render: (row) => (
        <div className="min-w-0">
          <p className="text-[0.88rem] font-semibold text-ink-900">
            {names.get(row.motherId)?.fullName ?? 'Mother record'} · #{row.visitNumber}
          </p>
          <p className="caption mt-0.5">
            {row.visitType.replace(/_/g, ' ').toLowerCase()} · {formatDate(row.visitDate)} · {row.gestationalAge.weeks}+{row.gestationalAge.days} wks
          </p>
        </div>
      ),
      sortValue: (row) => row.visitDate,
    },
    {
      key: 'observations',
      header: 'Observations',
      render: (row) => (
        <div className="text-[0.82rem] text-ink-700 tnum">
          <p>
            BP {row.vitals.systolicBp ?? '—'}/{row.vitals.diastolicBp ?? '—'} · P {row.vitals.pulse ?? '—'} · T {row.vitals.temperatureC ?? '—'} °C
          </p>
          <p className="caption mt-0.5">
            Wt {row.vitals.weightKg ? `${row.vitals.weightKg} kg` : '—'} · FH {row.vitals.fundalHeightCm ?? '—'} cm · FHR {row.vitals.fetalHeartRate ?? '—'}
          </p>
        </div>
      ),
    },
    {
      key: 'signs',
      header: 'Danger signs',
      render: (row) =>
        row.dangerSigns.reported.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {row.dangerSigns.reported.slice(0, 3).map((key) => (
              <Badge key={key} tone="red">
                {DANGER_SIGN_LABELS[key]}
              </Badge>
            ))}
            {row.dangerSigns.reported.length > 3 ? <Badge tone="red">+{row.dangerSigns.reported.length - 3}</Badge> : null}
            {row.dangerSigns.otherNote ? <Badge tone="amber">other noted</Badge> : null}
          </div>
        ) : row.dangerSigns.noneReported ? (
          <span className="text-[0.82rem] text-ink-500">None reported</span>
        ) : (
          <span className="text-[0.82rem] text-ink-400">Not documented</span>
        ),
      hideBelow: 'lg',
    },
    { key: 'risk', header: 'Risk after', render: (row) => <RiskBadge level={row.riskLevelAfter} />, hideBelow: 'md' },
    {
      key: 'alerts',
      header: 'Alerts',
      render: (row) => (row.alertIds.length > 0 ? <Badge tone={row.riskLevelAfter === 'RED' ? 'red' : 'amber'}>{row.alertIds.length} raised</Badge> : <span className="caption">none</span>),
      hideBelow: 'md',
    },
    {
      key: 'by',
      header: 'Recorded by',
      render: (row) => (
        <div>
          <p className="text-[0.82rem] text-ink-700">{row.createdByName}</p>
          <p className="caption">{formatDate(row.createdAt)}</p>
        </div>
      ),
      hideBelow: 'lg',
    },
  ];

  return (
    <AppShell title="ANC visits" subtitle={`${rows.length} visit${rows.length === 1 ? '' : 's'} in view · every value comes from a saved observation`}>
      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Period"
            value={period}
            onChange={setPeriod}
            options={[
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
              { value: 'all', label: 'All time' },
            ]}
          />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <SearchInput value={term} onValueChange={setTerm} placeholder="Search mother or patient ID" className="min-w-[13rem] max-w-xs flex-1" />
            <Select
              value={risk}
              className="w-36"
              options={[
                { value: 'ALL', label: 'Any risk' },
                { value: 'RED', label: 'Red' },
                { value: 'AMBER', label: 'Amber' },
                { value: 'GREEN', label: 'Green' },
              ]}
              onValueChange={(value) => setRisk(value as typeof risk)}
            />
          </div>
        </div>
      </Card>

      {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}

      <Card bodyClassName="p-0">
        {rows.length === 0 && !live.loading ? (
          <EmptyState
            icon={<Stethoscope className="size-5" aria-hidden />}
            title="No visits recorded in this period"
            description="Visits appear here as soon as a health worker saves one. The alert rules run on save, so the risk level shown is the level that was recorded for that visit."
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            loading={live.loading}
            dense
            pageSize={25}
            caption="Antenatal visits"
            onRowClick={(row) => navigate(`${navLink('/mothers')}/${row.motherId}?tab=visits`)}
          />
        )}
      </Card>
    </AppShell>
  );
}

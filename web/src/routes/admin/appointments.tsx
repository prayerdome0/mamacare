/**
 * Administrator — appointment oversight.
 *
 * Read-only, and deliberately so. An appointment belongs to the mother who made it
 * and the clinician who sees her; an administrator's job is to spot that a facility
 * is overloaded, that nobody is completing visits, or that a whole province has
 * stopped booking — not to edit somebody's care.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  Download,
  Lock,
  MapPin,
  RefreshCw,
} from 'lucide-react';
import { useAsync, useLiveQuery } from '@/hooks';
import { facilityRepo, profileRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useSession } from '@/providers/app-providers';
import { addDays, downloadBlob, formatDate, formatTime, pct, toCsv, toIsoDate } from '@/lib/utils';
import {
  APPOINTMENT_KIND_LABELS,
  type Appointment,
  type Facility,
  type UserProfile,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

type Range = 'today' | 'week' | 'month' | 'past' | 'ALL';

const STATUS_LABELS: Record<Appointment['status'], string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

export default function AdminAppointments() {
  const { actor } = useSession();
  const toast = useToast();
  const [range, setRange] = useState<Range>('week');
  const [facility, setFacility] = useState('ALL');
  const [kind, setKind] = useState<Appointment['kind'] | 'ALL'>('ALL');
  const [status, setStatus] = useState<Appointment['status'] | 'ALL'>('ALL');
  const [search, setSearch] = useState('');

  const { rows, loading, error, refresh } = useLiveQuery('appointments', {
    orderBy: { field: 'date', direction: 'desc' },
    limit: 500,
  });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });
  const { data: users } = useAsync(() => profileRepo.list(1000), { immediate: true });

  const appointments = useMemo<Appointment[]>(() => rows as Appointment[], [rows]);
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const user of (users?.rows ?? []) as UserProfile[]) map.set(user.uid, user.fullName);
    return map;
  }, [users]);

  const filtered = useMemo(() => {
    const today = toIsoDate(new Date());
    const term = search.trim().toLowerCase();
    return appointments.filter((appointment) => {
      if (facility !== 'ALL' && appointment.facilityName !== facility) return false;
      if (kind !== 'ALL' && appointment.kind !== kind) return false;
      if (status !== 'ALL' && appointment.status !== status) return false;
      switch (range) {
        case 'today':
          if (appointment.date !== today) return false;
          break;
        case 'week':
          if (appointment.date < today || appointment.date > toIsoDate(addDays(new Date(), 7))) return false;
          break;
        case 'month':
          if (appointment.date < today || appointment.date > toIsoDate(addDays(new Date(), 30))) return false;
          break;
        case 'past':
          if (appointment.date >= today) return false;
          break;
        default:
          break;
      }
      if (!term) return true;
      return [namesById.get(appointment.userId) ?? '', appointment.purpose, appointment.facilityName, APPOINTMENT_KIND_LABELS[appointment.kind]]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [appointments, range, facility, kind, status, search, namesById]);

  const stats = useMemo(() => {
    const today = toIsoDate(new Date());
    const weekEnd = toIsoDate(addDays(new Date(), 7));
    const past = appointments.filter((appointment) => appointment.date < today);
    const completed = past.filter((appointment) => appointment.status === 'completed').length;
    const missed = past.filter((appointment) => appointment.status === 'missed').length;
    const byFacility = new Map<string, number>();
    for (const appointment of appointments) {
      if (appointment.date < today || appointment.date > weekEnd) continue;
      byFacility.set(appointment.facilityName, (byFacility.get(appointment.facilityName) ?? 0) + 1);
    }
    const busiest = Array.from(byFacility.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const byKind = appointments.reduce<Record<string, number>>((acc, appointment) => {
      acc[appointment.kind] = (acc[appointment.kind] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: appointments.length,
      today: appointments.filter((appointment) => appointment.date === today).length,
      week: appointments.filter((appointment) => appointment.date >= today && appointment.date <= weekEnd).length,
      completion: past.length > 0 ? pct(completed, past.length) : 0,
      completed,
      missed,
      cancelled: appointments.filter((appointment) => appointment.status === 'cancelled').length,
      busiest,
      byKind,
    };
  }, [appointments]);

  useEffect(() => {
    document.title = 'Appointments · Mama Care admin';
  }, []);

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Date', 'Time', 'Patient', 'Kind', 'Purpose', 'Facility', 'Status', 'Booked'],
      filtered.map((appointment) => [
        appointment.date,
        appointment.time ?? '',
        namesById.get(appointment.userId) ?? appointment.userId,
        APPOINTMENT_KIND_LABELS[appointment.kind],
        appointment.purpose,
        appointment.facilityName,
        STATUS_LABELS[appointment.status],
        appointment.createdAt ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-appointments-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'appointments', actor?.uid ?? null, `Exported ${filtered.length} appointments`);
    toast.success('Export ready', 'This file names patients. Handle it as a clinical record and delete it when you are finished.');
  };

  const columns: Column<Appointment>[] = [
    {
      key: 'date',
      header: 'When',
      width: '9rem',
      sortValue: (row) => row.date + (row.time ?? ''),
      render: (row) => (
        <span className="block">
          <span className="block text-sm font-medium text-ink-800">{formatDate(row.date, 'day')}</span>
          <span className="block text-xs text-ink-500 tnum">{row.time ? formatTime(row.time) : 'All day'}</span>
        </span>
      ),
    },
    {
      key: 'patient',
      header: 'Patient',
      sortValue: (row) => namesById.get(row.userId) ?? '',
      render: (row) => (
        <span className="block">
          <span className="block truncate text-sm text-ink-800">{namesById.get(row.userId) ?? 'Unknown account'}</span>
          <span className="block truncate text-xs text-ink-500">{row.purpose}</span>
        </span>
      ),
    },
    {
      key: 'kind',
      header: 'Visit',
      width: '9rem',
      hideBelow: 'md',
      sortValue: (row) => row.kind,
      render: (row) => <Badge tone="neutral">{APPOINTMENT_KIND_LABELS[row.kind]}</Badge>,
    },
    {
      key: 'facility',
      header: 'Facility',
      hideBelow: 'lg',
      render: (row) => <span className="text-sm text-ink-600">{row.facilityName}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '8rem',
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge tone={row.status === 'completed' ? 'green' : row.status === 'missed' ? 'red' : row.status === 'cancelled' ? 'neutral' : 'brand'}>
          {STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Appointment oversight"
        description="Bookings across the platform, for load and follow-up. Read-only: only the patient and her linked provider can change an appointment."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={refresh} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={filtered.length === 0} icon={<Download className="size-4" aria-hidden />}>
              Export CSV
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Booked today" value={stats.today} icon={<CalendarDays className="size-4" aria-hidden />} tone={stats.today > 0 ? 'brand' : 'default'} onClick={() => setRange('today')} />
        <StatCard label="Next 7 days" value={stats.week} icon={<CalendarCheck className="size-4" aria-hidden />} onClick={() => setRange('week')} />
        <StatCard
          label="Completion rate"
          value={`${stats.completion}%`}
          icon={<CalendarCheck className="size-4" aria-hidden />}
          tone={stats.completion >= 70 ? 'green' : stats.completion >= 40 ? 'amber' : 'red'}
          hint={`${stats.completed} completed · ${stats.missed} missed`}
          onClick={() => setRange('past')}
        />
        <StatCard label="Total on record" value={stats.total} icon={<CalendarX className="size-4" aria-hidden />} onClick={() => setRange('ALL')} />
      </div>

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={range}
            onChange={setRange}
            ariaLabel="Date range"
            options={[
              { value: 'today', label: 'Today' },
              { value: 'week', label: '7 days' },
              { value: 'month', label: '30 days' },
              { value: 'past', label: 'Past' },
              { value: 'ALL', label: 'All' },
            ]}
          />
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search patient, purpose or facility" className="w-full sm:max-w-xs" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Select
            aria-label="Filter by facility"
            value={facility}
            onChange={(event) => setFacility(event.target.value)}
            options={[
              { value: 'ALL', label: 'All facilities' },
              ...Array.from(new Set(appointments.map((appointment) => appointment.facilityName)))
                .sort()
                .map((name) => ({ value: name, label: name })),
            ]}
            className="w-auto min-w-[12rem]"
          />
          <Select
            aria-label="Filter by visit type"
            value={kind}
            onChange={(event) => setKind(event.target.value as Appointment['kind'] | 'ALL')}
            options={[
              { value: 'ALL', label: 'All visit types' },
              ...(Object.keys(APPOINTMENT_KIND_LABELS) as Appointment['kind'][]).map((value) => ({ value, label: APPOINTMENT_KIND_LABELS[value] })),
            ]}
            className="w-auto min-w-[11rem]"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Appointment['status'] | 'ALL')}
            options={[{ value: 'ALL', label: 'All statuses' }, ...(Object.keys(STATUS_LABELS) as Appointment['status'][]).map((value) => ({ value, label: STATUS_LABELS[value] }))]}
            className="w-auto min-w-[10rem]"
          />
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Appointments could not be loaded" message={error} /> : null}
        {loading ? <LoadingRows rows={6} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Appointments across the platform, newest first"
            pageSize={25}
            emptyTitle="Nothing in this range"
            emptyDescription="Widen the date range or clear a filter. Appointments are created by mothers and by providers on their behalf."
            emptyAction={
              range !== 'ALL' ? (
                <Button variant="secondary" size="sm" onClick={() => setRange('ALL')}>
                  Show everything
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Load" title="Busiest facilities this week" description="Where bookings are concentrating — useful for staffing conversations and for checking whether a directory entry is out of date." />
          {stats.busiest.length === 0 ? (
            <EmptyState className="mt-3" icon={<MapPin className="size-6" aria-hidden />} title="No bookings this week" description="When mothers start booking, the top facilities appear here." />
          ) : (
            <ul className="mt-3 space-y-2">
              {stats.busiest.map(([name, count]) => (
                <li key={name} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink-700">{name}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-ink-100">
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct(count, stats.busiest[0]?.[1] ?? count)}%` }} />
                    </span>
                    <Badge tone="neutral">{count}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Mix" title="Visits by type" />
          <ul className="mt-3 space-y-2">
            {(Object.keys(APPOINTMENT_KIND_LABELS) as Appointment['kind'][]).map((value) => {
              const count = stats.byKind[value] ?? 0;
              return (
                <li key={value} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-ink-700">{APPOINTMENT_KIND_LABELS[value]}</span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-24 overflow-hidden rounded-full bg-ink-100">
                      <span className="block h-full rounded-full bg-brand-600" style={{ width: `${pct(count, Math.max(stats.total, 1))}%` }} />
                    </span>
                    <Badge tone={count > 0 ? 'brand' : 'neutral'}>{count}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {stats.completion < 50 && stats.total > 10
              ? 'A low completion rate usually means visits are happening but nobody is recording them — worth raising with the facility rather than treating it as poor attendance.'
              : 'Completion is recorded by the provider at the visit or by the mother afterwards. Neither is automatic.'}
          </p>
        </Card>
      </div>

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <h3 className="card-title">Why this screen cannot edit anything</h3>
        <p className="mt-1.5 text-sm text-ink-600">
          An appointment is a commitment between a patient and a clinician. Administrators can see the pattern across the
          platform — that is what makes staffing, outreach and directory corrections possible — but changing an individual
          booking would put someone who is not involved in her care inside it. If a booking is wrong, the mother or her linked
          provider changes it, and the audit log shows who did.
        </p>
        <p className="mt-2 text-xs text-ink-500">
          {facilities?.length ?? 0} facilities in the directory · data refreshed {formatDate(new Date(), 'long')}
        </p>
      </Card>
    </StaffShell>
  );
}

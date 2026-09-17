/**
 * Provider appointments.
 *
 * Every appointment belonging to a patient with an active care link, in one list
 * with a day/week/all filter and the actions a clinician actually performs:
 * complete with a note, mark missed, or cancel. The completion note is stored as
 * `clinicianNotes` and is visible to the patient — that is deliberate, so nothing
 * said here is a surprise to her later.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarCheck,
  CalendarDays,
  CalendarX,
  CheckCircle2,
  ClipboardList,
  Clock,
  FileText,
  XCircle,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { appointmentRepo, careLinkRepo, facilityRepo, pregnancyRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useSession } from '@/providers/app-providers';
import { addDays, daysBetween, formatDate, formatTime, toCsv, toIsoDate, downloadBlob, relativeTime } from '@/lib/utils';
import { formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { APPOINTMENT_KIND_LABELS, type Appointment, type AppointmentStatus, type Facility } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, SearchInput, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl } from '@/components/ui/tabs';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

type Range = 'today' | 'week' | 'upcoming' | 'past' | 'all';

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: 'Scheduled',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};

export default function ProviderAppointments() {
  const { actor } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const uid = actor?.uid ?? '';
  const [range, setRange] = useState<Range>('today');
  const [search, setSearch] = useState('');
  const [complete, setComplete] = useState<Appointment | null>(null);

  const { data: appointments, loading, error, retryable, run } = useAsync(() => appointmentRepo.forProvider(), {
    deps: [uid],
    immediate: Boolean(uid),
  });
  const { data: links } = useAsync(() => careLinkRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of links ?? []) map.set(link.motherUserId, link.motherName);
    return map;
  }, [links]);

  const [gaByPatient, setGaByPatient] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ids = Array.from(new Set((appointments ?? []).map((appointment) => appointment.userId)));
      const entries = await Promise.all(
        ids.map(async (id) => {
          const pregnancy = await pregnancyRepo.current(id).catch(() => null);
          const ga = pregnancy ? gestationalAge({ lmpDate: pregnancy.lmpDate, eddDate: pregnancy.eddDate }) : null;
          return [id, ga && ga.valid ? formatGestationalAge(ga) : null] as const;
        }),
      );
      if (!cancelled) setGaByPatient(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [appointments]);

  const rows = useMemo(() => {
    const today = toIsoDate(new Date());
    const weekEnd = toIsoDate(addDays(new Date(), 7));
    const list = (appointments ?? []).slice().sort((a, b) => (a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? '')));
    const filtered = list.filter((appointment) => {
      switch (range) {
        case 'today':
          return appointment.date === today;
        case 'week':
          return appointment.date >= today && appointment.date <= weekEnd;
        case 'upcoming':
          return appointment.date >= today && appointment.status === 'scheduled';
        case 'past':
          return appointment.date < today || appointment.status !== 'scheduled';
        default:
          return true;
      }
    });
    const term = search.trim().toLowerCase();
    return term
      ? filtered.filter((appointment) =>
          [patientNames.get(appointment.userId) ?? '', appointment.purpose, appointment.facilityName, APPOINTMENT_KIND_LABELS[appointment.kind]]
            .join(' ')
            .toLowerCase()
            .includes(term),
        )
      : filtered;
  }, [appointments, range, search, patientNames]);

  const counts = useMemo(() => {
    const list = appointments ?? [];
    const today = toIsoDate(new Date());
    return {
      today: list.filter((appointment) => appointment.date === today && appointment.status === 'scheduled').length,
      overdue: list.filter((appointment) => appointment.date < today && appointment.status === 'scheduled').length,
      completed: list.filter((appointment) => appointment.status === 'completed').length,
    };
  }, [appointments]);

  useEffect(() => {
    document.title = 'Appointments · Mama Care';
  }, []);

  const setStatus = async (appointment: Appointment, status: Appointment['status']): Promise<void> => {
    await appointmentRepo.update(appointment.id, { status });
    await logAudit('record-update', 'appointments', appointment.id, `Set to ${status}`);
    void run();
  };

  const exportCsv = (): void => {
    const csv = toCsv(
      ['Date', 'Time', 'Patient', 'Kind', 'Purpose', 'Facility', 'Status', 'Clinician notes'],
      rows.map((appointment) => [
        appointment.date,
        appointment.time ?? '',
        patientNames.get(appointment.userId) ?? appointment.userId,
        APPOINTMENT_KIND_LABELS[appointment.kind],
        appointment.purpose,
        appointment.facilityName,
        STATUS_LABELS[appointment.status],
        appointment.clinicianNotes ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-appointments-${toIsoDate(new Date())}.csv`);
  };

  const columns: Column<Appointment>[] = [
    {
      key: 'when',
      header: 'When',
      width: '10rem',
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
      sortValue: (row) => patientNames.get(row.userId) ?? '',
      render: (row) => (
        <button type="button" className="text-left hover:underline" onClick={() => navigate(`/provider/patients/${row.userId}`)}>
          <span className="block text-sm font-medium text-ink-800">{patientNames.get(row.userId) ?? 'Linked patient'}</span>
          <span className="block text-xs text-ink-500">{gaByPatient[row.userId] ?? 'No pregnancy record'}</span>
        </button>
      ),
    },
    {
      key: 'kind',
      header: 'Visit',
      render: (row) => (
        <span className="block">
          <span className="block text-sm text-ink-800">{APPOINTMENT_KIND_LABELS[row.kind]}</span>
          <span className="block truncate text-xs text-ink-500">{row.purpose}</span>
        </span>
      ),
    },
    { key: 'facility', header: 'Facility', hideBelow: 'lg', render: (row) => <span className="text-sm text-ink-600">{row.facilityName}</span> },
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
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '15rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          {row.status === 'scheduled' ? (
            <>
              <Button variant="primary" size="sm" onClick={() => setComplete(row)} icon={<CheckCircle2 className="size-4" aria-hidden />}>
                Complete
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void setStatus(row, 'missed')} title="Mark as missed">
                Missed
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void setStatus(row, 'cancelled')} title="Cancel appointment">
                Cancel
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => navigate(`/provider/patients/${row.userId}`)} icon={<FileText className="size-4" aria-hidden />}>
              Record
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="Appointments"
        description="Bookings from every patient who has shared their care with you, with the notes you add at the visit."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={exportCsv} disabled={rows.length === 0} icon={<CalendarX className="size-4" aria-hidden />}>
              Export CSV
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/provider/patients')} icon={<CalendarDays className="size-4" aria-hidden />}>
              Patients
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Today, still to see" value={counts.today} icon={<Clock className="size-4" aria-hidden />} tone={counts.today > 0 ? 'brand' : 'default'} />
        <StatCard label="Past date, not completed" value={counts.overdue} icon={<CalendarX className="size-4" aria-hidden />} tone={counts.overdue > 0 ? 'amber' : 'green'} />
        <StatCard label="Completed with a note" value={counts.completed} icon={<CalendarCheck className="size-4" aria-hidden />} />
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
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'past', label: 'Past' },
              { value: 'all', label: 'All' },
            ]}
          />
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search patient, purpose or facility" className="w-full sm:max-w-xs" />
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Appointments could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={5} /> : null}
        {!loading && !error && rows.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title="Nothing in this range"
            description={
              range === 'today'
                ? 'No appointments are booked with you today. Switch to “Upcoming” to see the rest of the caseload.'
                : 'Patients add their own bookings from the app; a completed visit appears here with your note attached.'
            }
            action={
              range !== 'all' ? (
                <Button variant="secondary" size="sm" onClick={() => setRange('all')}>
                  Show all appointments
                </Button>
              ) : undefined
            }
          />
        ) : null}
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          caption="Appointments belonging to patients who shared their care with this provider"
          emptyTitle="No appointments match"
          emptyDescription="Try a different range or clear the search."
        />
      </Card>

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <h3 className="card-title">How completion notes are handled</h3>
        <p className="mt-1.5 text-sm text-ink-600">
          What you write when completing a visit is shown to the patient on her own appointment screen. Keep it plain and
          factual — no diagnosis, no medicine changes that have not been explained to her in person. Anything clinically
          significant belongs in the facility record as well.
        </p>
      </Card>

      <CompleteModal
        appointment={complete}
        facilities={facilities ?? []}
        patientName={complete ? patientNames.get(complete.userId) ?? 'this patient' : ''}
        onClose={() => setComplete(null)}
        onSaved={() => {
          setComplete(null);
          toast.success('Visit recorded', 'The note is visible to the patient on her appointments screen.');
          void run();
        }}
      />
    </StaffShell>
  );
}

function CompleteModal({
  appointment,
  facilities,
  patientName,
  onClose,
  onSaved,
}: {
  appointment: Appointment | null;
  facilities: Facility[];
  patientName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<Appointment['status']>('completed');
  const [clinicianNotes, setNotes] = useState('');
  const [testResults, setTestResults] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!appointment) return;
    setStatus('completed');
    setNotes(appointment.clinicianNotes ?? '');
    setTestResults(appointment.testResults ?? '');
    setFacilityName(appointment.facilityName);
  }, [appointment]);

  const submit = async (): Promise<void> => {
    if (!appointment) return;
    setSaving(true);
    try {
      await appointmentRepo.complete(appointment.id, {
        status,
        clinicianNotes: clinicianNotes.trim() || null,
        testResults: testResults.trim() || null,
        facilityName,
      });
      await logAudit('record-update', 'appointments', appointment.id, `Visit marked ${status}`);
      onSaved();
    } catch {
      setStatus('completed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(appointment)}
      onClose={onClose}
      title={appointment ? `${STATUS_LABELS[status]} — ${patientName}` : 'Visit'}
      description={
        appointment
          ? `${APPOINTMENT_KIND_LABELS[appointment.kind]} · ${formatDate(appointment.date, 'long')} · booked ${relativeTime(appointment.createdAt)}`
          : undefined
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving} icon={<CheckCircle2 className="size-4" aria-hidden />}>Save</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Outcome" htmlFor="ca-status">
          <Select
            id="ca-status"
            value={status}
            onChange={(event) => setStatus(event.target.value as Appointment['status'])}
            options={[
              { value: 'completed', label: 'Seen — completed' },
              { value: 'missed', label: 'Did not attend' },
              { value: 'cancelled', label: 'Cancelled' },
            ]}
          />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Facility" htmlFor="ca-facility" error={!facilityName.trim() ? 'Required' : undefined} required>
            <Select id="ca-facility" value={facilityName} onChange={(event) => setFacilityName(event.target.value)} options={facilities.map((facility) => ({ value: facility.name, label: facility.name }))} />
          </Field>
          <Field label="Facility name (if not listed)" htmlFor="ca-facility-text">
            <TextInput id="ca-facility-text" value={facilityName} onValueChange={setFacilityName} />
          </Field>
        </FieldGrid>
        <Field
          label="Note for the patient"
          htmlFor="ca-notes"
          hint="Shown to her on the appointments screen. Plain language, no diagnosis."
        >
          <TextArea id="ca-notes" rows={4} value={clinicianNotes} onChange={(event) => setNotes(event.target.value)} placeholder="What was done and what happens next." />
        </Field>
        <Field label="Test results (optional)" htmlFor="ca-tests" hint="Record what was measured, not an interpretation.">
          <TextArea id="ca-tests" rows={2} value={testResults} onChange={(event) => setTestResults(event.target.value)} placeholder="e.g. Hb 11.4 g/dL, BP 116/74, urine protein negative" />
        </Field>
        <p className="flex items-start gap-2 text-xs text-ink-500">
          <XCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Mama Care is not a clinical record system. This note is a reminder for the patient — the facility record remains the
          source of truth.
        </p>
      </div>
    </Modal>
  );
}

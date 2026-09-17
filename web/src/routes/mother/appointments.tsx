/**
 * Appointments.
 *
 * Upcoming and past visits, with what was recorded at each one. The screen is built
 * around two moments that matter: before a visit (what to bring, what to ask) and
 * after it (what was measured, what the clinician said, when the next one is).
 *
 * Anything clinical recorded here is stored as entered. Mama Care does not
 * interpret a blood pressure, a haemoglobin or a fundal height.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, ClipboardList, Pencil, Plus, Trash2, X } from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { appointmentRepo, facilityRepo, observationRepo } from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { appointmentSchema, validate } from '@/lib/validation';
import { ROUTINE_ANC_SCHEDULE } from '@/lib/obstetrics';
import { daysBetween, formatDate, formatTime, relativeTime, toIsoDate } from '@/lib/utils';
import { APPOINTMENT_KIND_LABELS, type Appointment, type AppointmentKind, type Facility, type Observation } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows, StatusBadge } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, Select, Switch, TextArea, TextInput } from '@/components/ui/form';
import { Drawer, Modal } from '@/components/ui/overlay';
import { Tabs } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const KINDS: AppointmentKind[] = ['antenatal', 'postnatal', 'baby', 'immunization', 'lab', 'other'];

interface Suggestion {
  weeks: number;
  label: string;
  date: string;
  booked: boolean;
}

export default function AppointmentsPage() {
  const mother = useMotherContext();
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';

  const [tab, setTab] = useState('upcoming');
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);
  const [selected, setSelected] = useState<Appointment | null>(null);

  const { data, loading, error, retryable, run } = useAsync(
    () => appointmentRepo.list(uid, { includePast: true }),
    { deps: [uid], immediate: Boolean(uid) },
  );
  const { data: facilities } = useAsync(() => facilityRepo.list(), { deps: [] });

  const all = useMemo<Appointment[]>(() => data ?? [], [data]);
  const today = toIsoDate(new Date());
  const upcoming = all.filter((appointment) => appointment.status === 'scheduled' && appointment.date >= today);
  const past = all.filter((appointment) => appointment.status !== 'scheduled' || appointment.date < today);

  useEffect(() => {
    document.title = 'Appointments · Mama Care';
  }, []);

  const remove = async (appointment: Appointment): Promise<void> => {
    const ok = await confirm({
      title: 'Delete this appointment',
      message: `${APPOINTMENT_KIND_LABELS[appointment.kind]} on ${formatDate(appointment.date, 'long')} at ${appointment.facilityName}. Anything recorded at the visit stays in your observations.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await appointmentRepo.remove(appointment.id);
      toast.success('Appointment deleted');
      setSelected(null);
      void run();
      mother.refresh();
    } catch {
      toast.error('That did not delete');
    }
  };

  const setStatus = async (appointment: Appointment, status: Appointment['status']): Promise<void> => {
    try {
      if (status === 'completed') await appointmentRepo.complete(appointment.id);
      else await appointmentRepo.update(appointment.id, { status });
      toast.success(status === 'completed' ? 'Marked as attended' : `Marked as ${status}`);
      void run();
      mother.refresh();
      setSelected(null);
    } catch {
      toast.error('That did not save');
    }
  };

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!mother.ga || !mother.ga.valid || mother.mode !== 'pregnancy') return [];
    const anchor = mother.pregnancy?.lmpDate
      ? new Date(mother.pregnancy.lmpDate)
      : mother.pregnancy?.eddDate
        ? new Date(new Date(mother.pregnancy.eddDate).getTime() - 280 * 86_400_000)
        : null;
    if (!anchor) return [];
    const booked = new Set(upcoming.map((appointment) => appointment.date));
    const out: Suggestion[] = [];
    for (const visit of ROUTINE_ANC_SCHEDULE) {
      if (visit.weeks <= mother.ga.weeks) continue;
      const date = toIsoDate(new Date(anchor.getTime() + visit.weeks * 7 * 86_400_000));
      out.push({ weeks: visit.weeks, label: visit.label, date, booked: booked.has(date) });
      if (out.length === 3) break;
    }
    return out;
  }, [mother.ga, mother.mode, mother.pregnancy, upcoming]);

  return (
    <AppShell>
      <PageHeader
        title="Appointments"
        description="Antenatal visits, postnatal checks, baby clinic, immunization and laboratory appointments — with what was recorded at each one."
        actions={
          <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
            Add appointment
          </Button>
        }
      />

      {suggestions.length > 0 ? (
        <Card className="card-pad mb-4">
          <SectionHeading eyebrow="Routine schedule" title="Suggested from your dates" />
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {suggestions.map((suggestion) => (
              <div key={suggestion.date} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-800">
                    Week {suggestion.weeks} · {suggestion.label}
                  </span>
                  <span className="block text-xs text-ink-500">{formatDate(suggestion.date, 'long')}</span>
                </span>
                {suggestion.booked ? (
                  <Badge tone="green">Booked</Badge>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={async () => {
                      await appointmentRepo.create({
                        kind: 'antenatal',
                        date: suggestion.date,
                        facilityName: mother.pregnancy?.facilityId
                          ? (facilities ?? []).find((facility: Facility) => facility.id === mother.pregnancy?.facilityId)?.name ?? 'My facility'
                          : 'My facility',
                        facilityId: mother.pregnancy?.facilityId ?? null,
                        purpose: suggestion.label,
                      });
                      toast.success('Appointment added', formatDate(suggestion.date, 'long'));
                      void run();
                      mother.refresh();
                    }}
                  >
                    Add
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Calculated from your dates for a routine pregnancy. Your clinic may schedule differently — always follow their
            card.
          </p>
        </Card>
      ) : null}

      <Tabs
        value={tab}
        onChange={setTab}
        ariaLabel="Appointments"
        items={[
          { id: 'upcoming', label: 'Upcoming', count: upcoming.length },
          { id: 'past', label: 'Past', count: past.length },
        ]}
      />

      <div className="mt-4">
        {error ? (
          <ErrorState title="Your appointments could not be loaded" message={error} onRetry={retryable ? run : undefined} />
        ) : null}
        {loading ? <LoadingRows rows={3} /> : null}

        {!loading && !error && (tab === 'upcoming' ? upcoming : past).length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-6" aria-hidden />}
            title={tab === 'upcoming' ? 'No upcoming appointments' : 'No past appointments yet'}
            description={
              tab === 'upcoming'
                ? 'Add your next visit and Mama Care will remind you before it. If your clinic gave you a date, enter it exactly as written on your card.'
                : 'Appointments you have attended will collect here, with everything recorded at each visit.'
            }
            action={
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                Add appointment
              </Button>
            }
          />
        ) : null}

        <div className="space-y-3">
          {(tab === 'upcoming' ? upcoming : past).map((appointment) => {
            const inDays = daysBetween(new Date(), new Date(appointment.date));
            return (
              <Card key={appointment.id} className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="card-title">{APPOINTMENT_KIND_LABELS[appointment.kind]}</h3>
                      <StatusBadge status={appointment.status} />
                      {appointment.sharedWithSupporter ? <Badge tone="blue">Shared with supporter</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-700">
                      {formatDate(appointment.date, 'long')}
                      {appointment.time ? ` at ${formatTime(appointment.time)}` : ''} · {appointment.facilityName}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-600">{appointment.purpose}</p>
                    {appointment.status === 'scheduled' ? (
                      <p className="mt-1 text-xs text-ink-500">
                        {inDays === 0 ? 'Today' : inDays === 1 ? 'Tomorrow' : inDays > 1 ? `In ${inDays} days` : `${Math.abs(inDays)} days ago`}
                      </p>
                    ) : null}
                    {appointment.clinicianNotes ? (
                      <p className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">
                        <strong className="font-semibold">Clinician: </strong>
                        {appointment.clinicianNotes}
                      </p>
                    ) : null}
                  </div>
                  <div className="actions-wrap">
                    <Button variant="secondary" size="sm" onClick={() => setSelected(appointment)}>
                      Open
                    </Button>
                    {appointment.status === 'scheduled' ? (
                      <Button variant="ghost" size="sm" onClick={() => void setStatus(appointment, 'completed')} icon={<Check className="size-4" aria-hidden />}>
                        Attended
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <AppointmentFormModal
        open={createOpen || Boolean(editing)}
        appointment={editing}
        facilities={facilities ?? []}
        babies={mother.babies}
        defaultFacilityId={mother.pregnancy?.facilityId ?? null}
        onClose={() => {
          setCreateOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreateOpen(false);
          setEditing(null);
          void run();
          mother.refresh();
        }}
      />

      <AppointmentDrawer
        appointment={selected}
        uid={uid}
        onClose={() => setSelected(null)}
        onChanged={() => {
          void run();
          mother.refresh();
        }}
        onEdit={(appointment) => {
          setSelected(null);
          setEditing(appointment);
        }}
        onDelete={(appointment) => void remove(appointment)}
        onStatus={(appointment, status) => void setStatus(appointment, status)}
      />
    </AppShell>
  );
}

/* ── Create / edit ─────────────────────────────────────────────────────── */

function AppointmentFormModal({
  open,
  appointment,
  facilities,
  babies,
  defaultFacilityId,
  onClose,
  onSaved,
}: {
  open: boolean;
  appointment: Appointment | null;
  facilities: Facility[];
  babies: { id: string; name: string }[];
  defaultFacilityId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<AppointmentKind>('antenatal');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [facilityId, setFacilityId] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [purpose, setPurpose] = useState('');
  const [questions, setQuestions] = useState('');
  const [babyId, setBabyId] = useState('');
  const [sharedWithSupporter, setSharedWithSupporter] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      setKind(appointment.kind);
      setDate(appointment.date);
      setTime(appointment.time ?? '');
      setFacilityId(appointment.facilityId ?? '');
      setFacilityName(appointment.facilityName);
      setPurpose(appointment.purpose);
      setQuestions(appointment.questions.join('\n'));
      setBabyId(appointment.babyId ?? '');
      setSharedWithSupporter(appointment.sharedWithSupporter);
    } else {
      setKind('antenatal');
      setDate('');
      setTime('');
      setFacilityId(defaultFacilityId ?? '');
      setFacilityName(facilities.find((facility) => facility.id === defaultFacilityId)?.name ?? '');
      setPurpose('');
      setQuestions('');
      setBabyId(babies[0]?.id ?? '');
      setSharedWithSupporter(false);
    }
    setErrors({});
  }, [open, appointment, defaultFacilityId, facilities, babies]);

  const submit = async (): Promise<void> => {
    const result = validate(appointmentSchema, {
      kind,
      date,
      time,
      facilityId,
      facilityName,
      purpose,
      questions,
      babyId,
      sharedWithSupporter,
    });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    const value = result.value;
    const payload = {
      kind: value.kind,
      date: value.date,
      time: value.time || null,
      facilityId: value.facilityId || null,
      facilityName: value.facilityName,
      purpose: value.purpose,
      questions: value.questions
        ? value.questions
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean)
        : [],
      babyId: value.babyId || null,
      sharedWithSupporter: value.sharedWithSupporter ?? false,
    };
    try {
      if (appointment) {
        await appointmentRepo.update(appointment.id, payload);
        toast.success('Appointment updated', formatDate(value.date, 'long'));
      } else {
        await appointmentRepo.create(payload);
        toast.success('Appointment added', formatDate(value.date, 'long'));
      }
      onSaved();
    } catch {
      setErrors({ form: 'That did not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={appointment ? 'Edit appointment' : 'Add an appointment'}
      description="Enter the date exactly as your clinic gave it. Mama Care reminds you before the visit — it cannot change it for you."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {appointment ? 'Save changes' : 'Add appointment'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="Type of visit" htmlFor="appt-kind">
            <Select
              id="appt-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as AppointmentKind)}
              options={KINDS.map((item) => ({ value: item, label: APPOINTMENT_KIND_LABELS[item] }))}
            />
          </Field>
          {babies.length > 0 ? (
            <Field label="Which baby is this for?" htmlFor="appt-baby" optional>
              <Select
                id="appt-baby"
                value={babyId}
                onChange={(event) => setBabyId(event.target.value)}
                options={[{ value: '', label: 'Not baby-specific' }, ...babies.map((baby) => ({ value: baby.id, label: baby.name }))]}
              />
            </Field>
          ) : null}
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Date" htmlFor="appt-date" error={errors.date} required>
            <TextInput id="appt-date" type="date" value={date} onValueChange={setDate} invalid={Boolean(errors.date)} />
          </Field>
          <Field label="Time" htmlFor="appt-time" error={errors.time} optional hint="Leave blank if the clinic gave you a day only.">
            <TextInput id="appt-time" type="time" value={time} onValueChange={setTime} invalid={Boolean(errors.time)} />
          </Field>
        </FieldGrid>

        <Field label="Facility" htmlFor="appt-facility" error={errors.facilityName} required>
          <Select
            id="appt-facility"
            value={facilityId}
            onChange={(event) => {
              setFacilityId(event.target.value);
              const facility = facilities.find((candidate) => candidate.id === event.target.value);
              setFacilityName(facility ? facility.name : '');
            }}
            options={[
              { value: '', label: facilityName || 'Choose a facility, or type it below' },
              ...facilities.map((facility) => ({ value: facility.id, label: `${facility.name} — ${facility.city}` })),
            ]}
          />
        </Field>

        <Field label="Facility name" htmlFor="appt-facility-name" error={errors.facilityName} required>
          <TextInput
            id="appt-facility-name"
            value={facilityName}
            onValueChange={(value) => {
              setFacilityName(value);
              setFacilityId('');
            }}
            placeholder="e.g. Chelstone Clinic"
            invalid={Boolean(errors.facilityName)}
          />
        </Field>

        <Field label="What is this visit for?" htmlFor="appt-purpose" error={errors.purpose} required>
          <TextInput
            id="appt-purpose"
            value={purpose}
            onValueChange={setPurpose}
            placeholder="e.g. Routine antenatal check, blood pressure and weight"
            invalid={Boolean(errors.purpose)}
          />
        </Field>

        <Field
          label="Questions to ask (optional)"
          htmlFor="appt-questions"
          hint="One question per line. They stay with the appointment so you can read them in the waiting room."
        >
          <TextArea
            id="appt-questions"
            rows={4}
            value={questions}
            onChange={(event) => setQuestions(event.target.value)}
            placeholder={'Is my blood pressure normal?&#10;Do I need more iron?'}
          />
        </Field>

        <Switch
          label="Share this appointment with my supporter"
          description="Only appointments you switch on are visible to a partner or family member you have approved."
          checked={sharedWithSupporter}
          onChange={setSharedWithSupporter}
        />

        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

/* ── Detail ────────────────────────────────────────────────────────────── */

function AppointmentDrawer({
  appointment,
  uid,
  onClose,
  onChanged,
  onEdit,
  onDelete,
  onStatus,
}: {
  appointment: Appointment | null;
  uid: string;
  onClose: () => void;
  onChanged: () => void;
  onEdit: (appointment: Appointment) => void;
  onDelete: (appointment: Appointment) => void;
  onStatus: (appointment: Appointment, status: Appointment['status']) => void;
}) {
  const toast = useToast();
  const [clinicianNotes, setClinicianNotes] = useState('');
  const [testResults, setTestResults] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: observations, loading, run } = useAsync(
    () =>
      appointment
        ? observationRepo
            .list(uid)
            .then((rows) => rows.filter((row) => row.appointmentId === appointment.id))
        : Promise.resolve([] as Observation[]),
    { deps: [appointment?.id, uid], immediate: Boolean(appointment) },
  );

  useEffect(() => {
    if (!appointment) return;
    setClinicianNotes(appointment.clinicianNotes ?? '');
    setTestResults(appointment.testResults ?? '');
    setNextDate(appointment.nextAppointmentDate ?? '');
  }, [appointment]);

  if (!appointment) return null;

  const saveVisitNotes = async (): Promise<void> => {
    setSaving(true);
    try {
      await appointmentRepo.update(appointment.id, {
        clinicianNotes: clinicianNotes.trim() || null,
        testResults: testResults.trim() || null,
        nextAppointmentDate: nextDate || null,
      });
      toast.success('Visit details saved');
      onChanged();
    } catch {
      toast.error('That did not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={Boolean(appointment)}
      onClose={onClose}
      title={
        <span className="flex flex-wrap items-center gap-2">
          {APPOINTMENT_KIND_LABELS[appointment.kind]}
          <StatusBadge status={appointment.status} />
        </span>
      }
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={() => onDelete(appointment)} icon={<Trash2 className="size-4" aria-hidden />}>
            Delete
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onEdit(appointment)} icon={<Pencil className="size-4" aria-hidden />}>
            Edit
          </Button>
          {appointment.status === 'scheduled' ? (
            <>
              <Button variant="secondary" size="sm" onClick={() => onStatus(appointment, 'missed')}>
                Missed
              </Button>
              <Button variant="primary" size="sm" onClick={() => onStatus(appointment, 'completed')} icon={<Check className="size-4" aria-hidden />}>
                Attended
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="space-y-5">
        <KeyValue
          columns={1}
          items={[
            { label: 'When', value: `${formatDate(appointment.date, 'long')}${appointment.time ? ` at ${formatTime(appointment.time)}` : ''}`, tone: 'strong' },
            { label: 'Where', value: appointment.facilityName, tone: 'strong' },
            { label: 'Purpose', value: appointment.purpose },
            { label: 'Added', value: relativeTime(appointment.createdAt) },
            { label: 'Shared with supporter', value: appointment.sharedWithSupporter ? 'Yes' : 'No' },
          ]}
        />

        {appointment.facilityId ? (
          <div className="flex flex-wrap gap-2">
            <Link to="/app/facilities" className="btn btn-secondary btn-sm">
              Facility details
            </Link>
            <Link to="/app/emergency" className="btn btn-outline-danger btn-sm">
              If this is urgent
            </Link>
          </div>
        ) : null}

        {appointment.questions.length > 0 ? (
          <div>
            <h3 className="card-title">Questions to ask</h3>
            <ul className="checklist mt-2">
              {appointment.questions.map((question) => (
                <li key={question}>{question}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <div>
          <div className="flex items-center justify-between gap-2">
            <h3 className="card-title">Recorded at this visit</h3>
            {loading ? <span className="text-xs text-ink-500">Loading…</span> : null}
          </div>
          {(observations ?? []).length === 0 ? (
            <p className="mt-2 text-sm text-ink-600">
              Nothing recorded yet. Add the measurements a clinician took — weight, blood pressure, fundal height,
              haemoglobin — so you can see the pattern across visits.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-ink-100">
              {(observations ?? []).map((observation) => (
                <li key={observation.id} className="flex items-start justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink-800">
                      {observation.label}
                      {observation.value ? <span className="ml-2 tnum">{observation.value}{observation.unit ? ` ${observation.unit}` : ''}</span> : null}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {observation.recordedBy === 'provider' ? 'Recorded by a provider' : 'Recorded by you'}
                      {observation.notes ? ` · ${observation.notes}` : ''}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Delete ${observation.label}`}
                    onClick={async () => {
                      await observationRepo.remove(observation.id);
                      toast.success('Entry deleted');
                      void run();
                    }}
                  >
                    <X className="size-4" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
              <Plus className="size-4" aria-hidden /> Add an observation
            </Link>
          </div>
        </div>

        <div className="space-y-4 border-t border-ink-100 pt-4">
          <h3 className="card-title">After the visit</h3>
          <Field label="What the clinician said" htmlFor="visit-notes" hint="In their words or yours. Mama Care does not interpret it.">
            <TextArea id="visit-notes" rows={3} value={clinicianNotes} onChange={(event) => setClinicianNotes(event.target.value)} />
          </Field>
          <Field label="Test results" htmlFor="visit-results" optional hint="For example “Hb 11.2 g/dL, urine negative”.">
            <TextArea id="visit-results" rows={2} value={testResults} onChange={(event) => setTestResults(event.target.value)} />
          </Field>
          <Field label="Next appointment date" htmlFor="visit-next" optional>
            <TextInput id="visit-next" type="date" value={nextDate} onValueChange={setNextDate} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" size="sm" onClick={() => void saveVisitNotes()} loading={saving}>
              Save visit details
            </Button>
            {nextDate ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  await appointmentRepo.create({
                    kind: appointment.kind,
                    date: nextDate,
                    facilityId: appointment.facilityId,
                    facilityName: appointment.facilityName,
                    purpose: `Follow-up from ${formatDate(appointment.date, 'day')}`,
                  });
                  toast.success('Follow-up added', formatDate(nextDate, 'long'));
                  onChanged();
                  onClose();
                }}
                icon={<CalendarPlus className="size-4" aria-hidden />}
              >
                Add as a new appointment
              </Button>
            ) : null}
          </div>
        </div>

        <Card className="card-pad border-ink-200 bg-ink-50">
          <p className="text-xs leading-relaxed text-ink-600">
            These notes are your copy of what happened. They are not a clinical record, and a provider will keep their own.
            If something recorded here worries you, contact the facility rather than waiting for the next visit.
          </p>
        </Card>
      </div>
    </Drawer>
  );
}

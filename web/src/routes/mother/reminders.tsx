/**
 * Medication & supplement reminders.
 *
 * The single most important rule on this screen: Mama Care never suggests a
 * medicine, a dose or a frequency. Everything here is transcribed from what a
 * clinician prescribed, and the screen says so wherever a dose is shown.
 *
 * What it does do well is the remembering — today's doses with one-tap "taken",
 * a history that shows the gaps, and quiet hours so a reminder does not wake
 * anyone at three in the morning.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, Bell, Check, Pause, Pill, Play, Plus, Trash2, X } from 'lucide-react';
import { useAsync } from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { reminderRepo } from '@/services/repositories';
import { useConfirm, useSession } from '@/providers/app-providers';
import { reminderSchema, validate } from '@/lib/validation';
import { formatDate, formatTime, isSameDay, relativeTime, toIsoDate } from '@/lib/utils';
import { type Reminder, type ReminderFrequency, type ReminderKind } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows, ProgressBar } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

const KIND_LABELS: Record<ReminderKind, string> = {
  medication: 'Medication',
  supplement: 'Supplement',
  custom: 'Custom',
};

const FREQUENCY_LABELS: Record<ReminderFrequency, string> = {
  daily: 'Every day',
  weekdays: 'Monday to Friday',
  weekly: 'Once a week',
  'specific-days': 'On chosen days',
  once: 'Once only',
};

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const COMMON_TIMES = ['06:00', '08:00', '12:00', '14:00', '18:00', '20:00', '22:00'];

export default function RemindersPage() {
  const mother = useMotherContext();
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';

  const [view, setView] = useState<'today' | 'all'>('today');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Reminder | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => reminderRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });

  const reminders = useMemo<Reminder[]>(() => data ?? [], [data]);
  const active = reminders.filter((reminder) => reminder.active);
  const paused = reminders.filter((reminder) => !reminder.active);
  const dueToday = mother.dueToday;

  useEffect(() => {
    document.title = 'Reminders · Mama Care';
  }, []);

  const takenToday = useMemo(
    () =>
      reminders.reduce(
        (count, reminder) => count + reminder.takenLog.filter((entry) => isSameDay(entry, new Date())).length,
        0,
      ),
    [reminders],
  );
  const scheduledToday = useMemo(
    () => reminders.filter((reminder) => reminder.active).reduce((count, reminder) => count + Math.max(1, reminder.times.length), 0),
    [reminders],
  );

  const markTaken = async (reminder: Reminder, at?: string): Promise<void> => {
    try {
      await reminderRepo.markTaken(reminder.id, at ? new Date(at) : new Date());
      toast.success('Recorded', `${reminder.title} marked as taken.`);
      void run();
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const undoTaken = async (reminder: Reminder, entry: string): Promise<void> => {
    try {
      await reminderRepo.update(reminder.id, { takenLog: reminder.takenLog.filter((item) => item !== entry) });
      toast.info('Removed from today’s log');
      void run();
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const toggleActive = async (reminder: Reminder): Promise<void> => {
    try {
      await reminderRepo.update(reminder.id, { active: !reminder.active });
      toast.success(reminder.active ? 'Reminder paused' : 'Reminder resumed', reminder.title);
      void run();
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const remove = async (reminder: Reminder): Promise<void> => {
    const ok = await confirm({
      title: `Delete “${reminder.title}”?`,
      message:
        'The reminder and its taken-log are removed. If a clinician prescribed this, tell them you have stopped tracking it — do not stop the medicine itself without asking.',
      confirmLabel: 'Delete reminder',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await reminderRepo.remove(reminder.id);
      toast.success('Reminder deleted');
      void run();
      mother.refresh();
    } catch {
      toast.error('That did not delete');
    }
  };

  const todaysLog = reminders
    .flatMap((reminder) =>
      reminder.takenLog
        .filter((entry) => isSameDay(entry, new Date()))
        .map((entry) => ({ reminder, entry })),
    )
    .sort((a, b) => a.entry.localeCompare(b.entry));

  return (
    <AppShell>
      <PageHeader
        title="Reminders"
        description="Medication, supplements and anything else you need to remember. Enter exactly what your clinician prescribed — Mama Care never suggests a medicine or a dose."
        actions={
          <Button variant="primary" size="sm" onClick={() => setFormOpen(true)} icon={<Plus className="size-4" aria-hidden />}>
            Add reminder
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Due today" value={dueToday.length} icon={<AlarmClock className="size-4" aria-hidden />} tone={dueToday.length > 0 ? 'brand' : 'default'} />
        <StatCard
          label="Taken today"
          value={takenToday}
          hint={scheduledToday > 0 ? `${Math.min(100, Math.round((takenToday / scheduledToday) * 100))}% of scheduled doses` : undefined}
          icon={<Check className="size-4" aria-hidden />}
          tone="green"
        />
        <StatCard label="Active reminders" value={active.length} hint={paused.length > 0 ? `${paused.length} paused` : undefined} icon={<Pill className="size-4" aria-hidden />} />
      </div>

      {scheduledToday > 0 ? (
        <div className="mt-4">
          <ProgressBar value={Math.min(takenToday, scheduledToday)} max={scheduledToday} label="Today’s doses" />
        </div>
      ) : null}

      <div className="mt-6">
        <SegmentedControl
          value={view}
          onChange={setView}
          ariaLabel="Reminder view"
          options={[
            { value: 'today', label: 'Today', count: dueToday.length },
            { value: 'all', label: 'All reminders', count: reminders.length },
          ]}
        />
      </div>

      {error ? <ErrorState className="mt-4" title="Reminders could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={3} /> : null}

      {!loading && !error && reminders.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Bell className="size-6" aria-hidden />}
          title="No reminders yet"
          description="Add the iron and folic acid, the malaria prophylaxis, the ARVs or anything else a clinician has prescribed — with the dose and times exactly as written on your prescription."
          action={
            <Button variant="primary" size="sm" onClick={() => setFormOpen(true)}>
              Add your first reminder
            </Button>
          }
        />
      ) : null}

      {view === 'today' ? (
        <div className="mt-4 space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow={formatDate(new Date(), 'long')} title="Due today" />
            {dueToday.length === 0 ? (
              <p className="mt-2 text-sm text-ink-600">
                Nothing is scheduled for the rest of today. {active.length > 0 ? 'Your reminders will appear here at their times.' : ''}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {dueToday.map((reminder) => (
                  <li key={reminder.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2.5">
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-800">{reminder.title}</span>
                        <Badge tone={reminder.kind === 'medication' ? 'red' : 'brand'}>{KIND_LABELS[reminder.kind]}</Badge>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-ink-500">
                        {[reminder.medicine, reminder.dose, reminder.instructions].filter(Boolean).join(' · ') || 'No dose recorded'}
                      </span>
                    </span>
                    <div className="actions-wrap">
                      <Button variant="primary" size="sm" onClick={() => void markTaken(reminder)} icon={<Check className="size-4" aria-hidden />}>
                        Taken
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditing(reminder)}>
                        Edit
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {todaysLog.length > 0 ? (
            <Card className="card-pad">
              <SectionHeading eyebrow="Today" title="Taken log" />
              <ul className="mt-3 divide-y divide-ink-100">
                {todaysLog.map(({ reminder, entry }) => (
                  <li key={`${reminder.id}-${entry}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-800">{reminder.title}</span>
                      <span className="block text-xs text-ink-500">{formatTime(entry.slice(11, 16) || entry)}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => void undoTaken(reminder, entry)} aria-label={`Remove ${reminder.title} from today's log`}>
                      <X className="size-4" aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card className="card-pad border-ink-200 bg-ink-50">
            <h3 className="card-title">About doses</h3>
            <p className="mt-1 text-sm leading-relaxed text-ink-700">
              Mama Care stores what you enter and reminds you. It does not know your medical history, your other
              medicines, or your lab results, so it cannot tell you what to take or how much. If a dose is unclear, or you
              missed several, ask the prescriber — not the app.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/app/messages" className="btn btn-secondary btn-sm">
                Message my provider
              </Link>
              <Link to="/app/settings" className="btn btn-ghost btn-sm">
                Notification & quiet hours
              </Link>
            </div>
          </Card>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {[...active, ...paused].map((reminder) => {
            const takenCount = reminder.takenLog.length;
            const lastTaken = reminder.takenLog[reminder.takenLog.length - 1] ?? null;
            return (
              <Card key={reminder.id} className={cn('card-pad', !reminder.active && 'opacity-70')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="card-title">{reminder.title}</h3>
                      <Badge tone={reminder.kind === 'medication' ? 'red' : reminder.kind === 'supplement' ? 'brand' : 'neutral'}>
                        {KIND_LABELS[reminder.kind]}
                      </Badge>
                      {reminder.active ? <Badge tone="green">Active</Badge> : <Badge tone="neutral">Paused</Badge>}
                      {reminder.sharedWithSupporter ? <Badge tone="blue">Shared</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-ink-700">
                      {[reminder.medicine, reminder.dose].filter(Boolean).join(' · ') || 'No medicine or dose recorded'}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {FREQUENCY_LABELS[reminder.frequency]}
                      {reminder.frequency === 'specific-days' && reminder.daysOfWeek.length > 0
                        ? ` · ${reminder.daysOfWeek.map((day) => DAY_LABELS[day] ?? '').filter(Boolean).join(', ')}`
                        : ''}{' '}
                      · {reminder.times.map((time) => formatTime(time)).join(', ')}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      From {formatDate(reminder.startDate, 'long')}
                      {reminder.endDate ? ` to ${formatDate(reminder.endDate, 'long')}` : ' · ongoing'}
                      {reminder.prescribedBy ? ` · prescribed by ${reminder.prescribedBy}` : ''}
                    </p>
                    {reminder.instructions ? <p className="mt-1 text-xs text-ink-600">{reminder.instructions}</p> : null}
                    <p className="mt-1 text-xs text-ink-500">
                      {takenCount} dose{takenCount === 1 ? '' : 's'} recorded
                      {lastTaken ? ` · last ${relativeTime(lastTaken)}` : ''}
                    </p>
                  </div>
                  <div className="actions-wrap">
                    <Button variant="secondary" size="sm" onClick={() => void markTaken(reminder)} icon={<Check className="size-4" aria-hidden />}>
                      Taken now
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void toggleActive(reminder)}
                      icon={reminder.active ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}
                    >
                      {reminder.active ? 'Pause' : 'Resume'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(reminder)} aria-label={`Edit ${reminder.title}`}>
                      <Pill className="size-4" aria-hidden />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(reminder)} aria-label={`Delete ${reminder.title}`}>
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ReminderFormModal
        open={formOpen || Boolean(editing)}
        reminder={editing}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSaved={() => {
          setFormOpen(false);
          setEditing(null);
          void run();
          mother.refresh();
        }}
      />
    </AppShell>
  );
}

function ReminderFormModal({
  open,
  reminder,
  onClose,
  onSaved,
}: {
  open: boolean;
  reminder: Reminder | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [kind, setKind] = useState<ReminderKind>('supplement');
  const [title, setTitle] = useState('');
  const [medicine, setMedicine] = useState('');
  const [dose, setDose] = useState('');
  const [times, setTimes] = useState<string[]>(['08:00']);
  const [frequency, setFrequency] = useState<ReminderFrequency>('daily');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startDate, setStartDate] = useState(toIsoDate(new Date()));
  const [endDate, setEndDate] = useState('');
  const [prescribedBy, setPrescribedBy] = useState('');
  const [instructions, setInstructions] = useState('');
  const [sharedWithSupporter, setSharedWithSupporter] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (reminder) {
      setKind(reminder.kind);
      setTitle(reminder.title);
      setMedicine(reminder.medicine ?? '');
      setDose(reminder.dose ?? '');
      setTimes(reminder.times.length > 0 ? reminder.times : ['08:00']);
      setFrequency(reminder.frequency);
      setDaysOfWeek(reminder.daysOfWeek);
      setStartDate(reminder.startDate);
      setEndDate(reminder.endDate ?? '');
      setPrescribedBy(reminder.prescribedBy ?? '');
      setInstructions(reminder.instructions ?? '');
      setSharedWithSupporter(reminder.sharedWithSupporter);
    } else {
      setKind('supplement');
      setTitle('');
      setMedicine('');
      setDose('');
      setTimes(['08:00']);
      setFrequency('daily');
      setDaysOfWeek([]);
      setStartDate(toIsoDate(new Date()));
      setEndDate('');
      setPrescribedBy('');
      setInstructions('');
      setSharedWithSupporter(false);
    }
    setErrors({});
  }, [open, reminder]);

  const setTimeAt = (index: number, value: string): void => {
    setTimes((current) => current.map((time, position) => (position === index ? value : time)));
  };

  const submit = async (): Promise<void> => {
    const result = validate(reminderSchema, {
      kind,
      title,
      medicine,
      dose,
      times,
      frequency,
      daysOfWeek,
      startDate,
      endDate,
      prescribedBy,
      instructions,
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
      title: value.title,
      medicine: value.medicine || null,
      dose: value.dose || null,
      times: value.times.filter(Boolean),
      frequency: value.frequency,
      daysOfWeek: value.daysOfWeek ?? [],
      startDate: value.startDate,
      endDate: value.endDate || null,
      prescribedBy: value.prescribedBy || null,
      instructions: value.instructions || null,
      sharedWithSupporter: value.sharedWithSupporter ?? false,
    };
    try {
      if (reminder) {
        await reminderRepo.update(reminder.id, payload);
        toast.success('Reminder updated', value.title);
      } else {
        await reminderRepo.create(payload);
        toast.success('Reminder added', value.title);
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
      title={reminder ? 'Edit reminder' : 'Add a reminder'}
      description="Copy the medicine, dose and times exactly as your clinician prescribed them. Mama Care stores and reminds — it never advises."
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            {reminder ? 'Save changes' : 'Add reminder'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="What kind is it?" htmlFor="rem-kind">
            <Select
              id="rem-kind"
              value={kind}
              onChange={(event) => setKind(event.target.value as ReminderKind)}
              options={[
                { value: 'medication', label: 'Medication (prescribed)' },
                { value: 'supplement', label: 'Supplement (iron, folic acid, vitamins)' },
                { value: 'custom', label: 'Something else' },
              ]}
            />
          </Field>
          <Field label="Reminder name" htmlFor="rem-title" error={errors.title} required hint="What you will recognise at a glance.">
            <TextInput
              id="rem-title"
              value={title}
              onValueChange={setTitle}
              placeholder="e.g. Iron and folic acid"
              invalid={Boolean(errors.title)}
            />
          </Field>
        </FieldGrid>

        <FieldGrid columns={2}>
          <Field label="Medicine or supplement" htmlFor="rem-medicine" optional hint="The name on the packet or prescription.">
            <TextInput id="rem-medicine" value={medicine} onValueChange={setMedicine} placeholder="e.g. Ferrous sulphate + folic acid" />
          </Field>
          <Field label="Dose" htmlFor="rem-dose" optional hint="Exactly as prescribed, including the unit.">
            <TextInput id="rem-dose" value={dose} onValueChange={setDose} placeholder="e.g. 1 tablet" />
          </Field>
        </FieldGrid>

        <div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="label">Times of day</span>
            <div className="flex flex-wrap gap-1">
              {COMMON_TIMES.map((time) => (
                <button
                  key={time}
                  type="button"
                  className={cn('chip', times.includes(time) && 'chip-active')}
                  onClick={() => setTimes((current) => (current.includes(time) ? current.filter((item) => item !== time) : [...current, time].sort()))}
                >
                  {formatTime(time)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 space-y-2">
            {times.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <TextInput type="time" value={time} onValueChange={(value) => setTimeAt(index, value)} className="max-w-[10rem]" aria-label={`Time ${index + 1}`} />
                {times.length > 1 ? (
                  <Button variant="ghost" size="sm" onClick={() => setTimes((current) => current.filter((_, position) => position !== index))} aria-label={`Remove time ${index + 1}`}>
                    <X className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </div>
            ))}
            <Button variant="secondary" size="sm" onClick={() => setTimes((current) => [...current, '12:00'].sort())} icon={<Plus className="size-4" aria-hidden />}>
              Add another time
            </Button>
          </div>
          {errors.times ? <p className="field-error mt-1">{errors.times}</p> : null}
        </div>

        <FieldGrid columns={2}>
          <Field label="How often?" htmlFor="rem-frequency">
            <Select
              id="rem-frequency"
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as ReminderFrequency)}
              options={(Object.keys(FREQUENCY_LABELS) as ReminderFrequency[]).map((item) => ({ value: item, label: FREQUENCY_LABELS[item] }))}
            />
          </Field>
          <Field label="Start date" htmlFor="rem-start" error={errors.startDate} required>
            <TextInput id="rem-start" type="date" value={startDate} onValueChange={setStartDate} invalid={Boolean(errors.startDate)} />
          </Field>
        </FieldGrid>

        {frequency === 'specific-days' ? (
          <Field label="Which days?" error={errors.daysOfWeek} hint="Choose every day this reminder should repeat.">
            <div className="flex flex-wrap gap-1">
              {DAY_LABELS.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={cn('chip', daysOfWeek.includes(index) && 'chip-active')}
                  aria-pressed={daysOfWeek.includes(index)}
                  onClick={() =>
                    setDaysOfWeek((current) => (current.includes(index) ? current.filter((day) => day !== index) : [...current, index].sort()))
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </Field>
        ) : null}

        <FieldGrid columns={2}>
          <Field label="End date" htmlFor="rem-end" error={errors.endDate} optional hint="Leave blank if it is ongoing.">
            <TextInput id="rem-end" type="date" value={endDate} onValueChange={setEndDate} min={startDate} invalid={Boolean(errors.endDate)} />
          </Field>
          <Field label="Prescribed by" htmlFor="rem-prescriber" optional>
            <TextInput id="rem-prescriber" value={prescribedBy} onValueChange={setPrescribedBy} placeholder="e.g. Dr Banda, Chelstone Clinic" />
          </Field>
        </FieldGrid>

        <Field label="Instructions (optional)" htmlFor="rem-instructions" hint="For example “take with food”, “do not take with tea”.">
          <TextArea id="rem-instructions" rows={2} value={instructions} onChange={(event) => setInstructions(event.target.value)} />
        </Field>

        <CheckboxRow
          checked={sharedWithSupporter}
          onChange={setSharedWithSupporter}
          label="Share this reminder with my supporter"
          description="A partner or family member you have approved can then see it and help you remember."
        />

        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}

        <p className="text-xs text-ink-500">
          Reminders appear in the app at these times, and as push notifications where your browser allows it. Quiet hours
          in Settings stop them overnight.
        </p>
      </div>
    </Modal>
  );
}

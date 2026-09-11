import { useEffect, useMemo, useState } from 'react';
import { Bell, MessageSquare } from 'lucide-react';
import { FormDialog, FormSection } from '@/components/forms/form-dialog';
import { CheckboxRow, Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { services } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { appointmentSchema } from '@/lib/validation';
import { addDays, formatDate, toIsoDate } from '@/lib/utils';
import type { Appointment } from '@/types/domain';

const TYPES = [
  { value: 'ANC', label: 'Antenatal review' },
  { value: 'FOLLOW_UP', label: 'Follow-up after an alert' },
  { value: 'REVIEW', label: 'Post-referral review' },
  { value: 'LABORATORY', label: 'Laboratory' },
  { value: 'ULTRASOUND', label: 'Ultrasound' },
  { value: 'PMTCT', label: 'PMTCT' },
  { value: 'IMMUNISATION', label: 'Immunisation' },
  { value: 'POSTNATAL', label: 'Postnatal' },
  { value: 'OTHER', label: 'Other' },
];

/**
 * Booking and re-booking an appointment.
 *
 * Reminder lead times are stored on the appointment; the queue that sends them
 * runs separately, so booking never depends on a notification service being
 * reachable.
 */
export function AppointmentDialog({
  open,
  onClose,
  motherId,
  appointment,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  motherId?: string | null;
  appointment?: Appointment | null;
  onSaved?: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const [selectedMother, setSelectedMother] = useState(motherId ?? '');
  const editing = Boolean(appointment);

  const roster = useAsync(() => services().data.motherRoster(actor?.facilityId ?? null), { immediate: open });
  const settings = useAsync(() => services().data.settings(), { immediate: open });

  const form = useForm(appointmentSchema, {
    motherId: motherId ?? '',
    scheduledFor: toIsoDate(addDays(new Date(), 7)),
    time: '09:00',
    facilityId: actor?.facilityId ?? '',
    type: 'ANC',
    durationMinutes: 30,
    assignedUserId: actor?.uid ?? '',
    reason: '',
    notes: '',
    reminderDays: [7, 1],
    smsEnabled: true,
  });

  useEffect(() => {
    if (!open) return;
    if (appointment) {
      form.setValues({
        motherId: appointment.motherId,
        scheduledFor: appointment.scheduledFor,
        time: appointment.time,
        facilityId: appointment.facilityId,
        type: appointment.type,
        durationMinutes: appointment.durationMinutes,
        assignedUserId: appointment.assignedUserId ?? '',
        reason: appointment.reason ?? '',
        notes: appointment.notes ?? '',
        reminderDays: appointment.reminderDays,
        smsEnabled: appointment.smsEnabled,
      });
      setSelectedMother(appointment.motherId);
    } else {
      form.setValues({ motherId: motherId ?? '', facilityId: actor?.facilityId ?? '', reminderDays: settings.data?.reminderDaysDefault ?? [7, 1] });
      setSelectedMother(motherId ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment, motherId, settings.data]);

  const motherOptions = useMemo(
    () =>
      (roster.data ?? []).map((mother) => ({
        value: mother.id,
        label: `${mother.fullName} — ${mother.patientId}${mother.riskLevel && mother.riskLevel !== 'GREEN' ? ` · ${mother.riskLevel} risk` : ''}`,
      })),
    [roster.data],
  );

  const toggleReminder = (days: number) => {
    const current = form.values.reminderDays ?? [];
    form.setField('reminderDays', current.includes(days) ? current.filter((item) => item !== days) : [...current, days].sort((a, b) => b - a));
  };

  const submit = async () => {
    await form.submit(async (values) => {
      if (!values.motherId && !selectedMother) throw new Error('Select the mother this appointment belongs to.');
      const payload = {
        ...values,
        motherId: values.motherId || selectedMother,
        reason: values.reason || null,
        notes: values.notes || null,
        reminderDays: values.reminderDays ?? [],
      };
      if (appointment) {
        await services().data.update('appointments', appointment.id, {
          scheduledFor: payload.scheduledFor,
          time: payload.time,
          type: payload.type,
          reason: payload.reason,
          notes: payload.notes,
          assignedUserId: payload.assignedUserId || null,
          reminderDays: payload.reminderDays,
          smsEnabled: payload.smsEnabled,
          updatedAt: new Date().toISOString(),
        } as Partial<Appointment>);
      } else {
        await services().data.createAppointment(payload);
      }
      toast.success(appointment ? 'Appointment updated' : 'Appointment booked', `Reminder days: ${payload.reminderDays.length ? payload.reminderDays.join(', ') : 'none'} before the visit.`);
      onSaved?.();
      onClose();
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      size="md"
      title={editing ? 'Change appointment' : 'Book an appointment'}
      description={editing ? `${appointment?.motherName} · ${appointment?.patientId}` : 'Scheduled reviews drive reminders, the day list and missed-visit follow-up.'}
      submitLabel={editing ? 'Save changes' : 'Book appointment'}
      submitting={form.submitting}
      dirty={form.dirty}
      onSubmit={submit}
      formError={form.formError}
    >
      <FormSection title="Who and when" columns={2}>
        <Field label="Mother" error={form.errors.motherId} required>
          {motherId || appointment ? (
            <p className="input flex items-center bg-ink-100 text-ink-700">
              {(roster.data ?? []).find((mother) => mother.id === (appointment?.motherId ?? motherId))?.fullName ?? 'Selected mother'}{' '}
              <span className="micro ml-1.5">{(roster.data ?? []).find((mother) => mother.id === (appointment?.motherId ?? motherId))?.patientId ?? ''}</span>
            </p>
          ) : roster.loading ? (
            <p className="hint">Loading the roster…</p>
          ) : (
            <Select
              value={selectedMother}
              options={motherOptions}
              placeholder="Select a mother"
              onValueChange={(value) => {
                setSelectedMother(value);
                form.setField('motherId', value);
              }}
              invalid={Boolean(form.errors.motherId)}
            />
          )}
        </Field>
        <Field label="Facility" error={form.errors.facilityId} required hint="Where she is expected — a mother can be followed at more than one site.">
          <Select
            value={form.values.facilityId}
            options={[{ value: actor?.facilityId ?? '', label: 'Your facility' }]}
            onValueChange={(value) => form.setField('facilityId', value)}
            disabled
          />
        </Field>
        <Field label="Date" error={form.errors.scheduledFor} required>
          <TextInput type="date" value={form.values.scheduledFor} onValueChange={(value) => form.setField('scheduledFor', value)} onBlur={() => form.blur('scheduledFor')} invalid={Boolean(form.errors.scheduledFor)} />
        </Field>
        <Field label="Time" error={form.errors.time} required>
          <TextInput type="time" value={form.values.time} onValueChange={(value) => form.setField('time', value)} onBlur={() => form.blur('time')} invalid={Boolean(form.errors.time)} />
        </Field>
        <Field label="Type" error={form.errors.type}>
          <Select value={form.values.type} options={TYPES} onValueChange={(value) => form.setField('type', value as never)} />
        </Field>
        <Field label="Duration" optional error={form.errors.durationMinutes}>
          <Select
            value={String(form.values.durationMinutes)}
            options={[15, 20, 30, 45, 60, 90].map((minutes) => ({ value: String(minutes), label: `${minutes} minutes` }))}
            onValueChange={(value) => form.setField('durationMinutes', Number(value))}
          />
        </Field>
      </FormSection>

      <FormSection title="Reminders" description="Queued on the appointment date; delivery depends on the channels configured for this deployment.">
        <div className="flex flex-wrap gap-2">
          {[1, 3, 7, 14].map((days) => (
            <button
              key={days}
              type="button"
              aria-pressed={(form.values.reminderDays ?? []).includes(days)}
              onClick={() => toggleReminder(days)}
              className={`chip ${(form.values.reminderDays ?? []).includes(days) ? 'chip-active' : ''}`}
            >
              <Bell className="size-3.5" aria-hidden />
              {days} day{days === 1 ? '' : 's'} before
            </button>
          ))}
        </div>
        <CheckboxRow
          checked={form.values.smsEnabled}
          onChange={(smsEnabled) => form.setField('smsEnabled', smsEnabled)}
          label="Also send an SMS reminder to her phone"
          description={
            <span className="inline-flex items-center gap-1.5">
              <MessageSquare className="size-3.5" aria-hidden />
              Sent through the approved provider configured on the server. Without it, in-app and push reminders still apply.
            </span>
          }
        />
        {form.values.reminderDays.length === 0 ? (
          <NoticeState tone="warning" title="No reminder will be queued" compact>
            The appointment will appear on the day list, but nothing will prompt the mother beforehand.
          </NoticeState>
        ) : null}
      </FormSection>

      <FormSection title="Notes" columns={2}>
        <Field label="Reason" optional error={form.errors.reason}>
          <TextInput value={form.values.reason ?? ''} onValueChange={(value) => form.setField('reason', value)} placeholder="28-week review with haemoglobin recheck" />
        </Field>
        <Field label="Assigned to" optional hint="Blank means the facility day team picks it up.">
          <p className="input flex items-center bg-ink-100 text-ink-700">{actor?.displayName ?? 'You'}</p>
        </Field>
        <Field label="Internal note" optional error={form.errors.notes}>
          <TextArea rows={3} value={form.values.notes ?? ''} onValueChange={(value) => form.setField('notes', value)} />
        </Field>
        <p className="caption">
          Booking for {form.values.scheduledFor ? formatDate(form.values.scheduledFor, 'long') : 'a date'} at {form.values.time}. A conflict
          with an existing open appointment for the same mother, date and time will be rejected rather than duplicated.
        </p>
      </FormSection>
    </FormDialog>
  );
}

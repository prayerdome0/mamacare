import { useEffect, useMemo, useState } from 'react';
import { Send, Stethoscope } from 'lucide-react';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { FormDialog, FormSection } from '@/components/forms/form-dialog';
import { NoticeState } from '@/components/ui/display';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { referralSchema } from '@/lib/validation';
import { toIsoDate } from '@/lib/utils';
import type { Mother, Referral, ReferralUrgency } from '@/types/domain';

/**
 * Referral intake. The vital snapshot is copied from the latest saved visit so
 * the receiving facility sees what was actually measured, and the referring
 * facility is always the actor’s own — it cannot be forged into a form field.
 */
export function ReferralDialog({
  open,
  onClose,
  mother,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mother?: Mother | null;
  onSaved?: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const [selectedMother, setSelectedMother] = useState(mother?.id ?? '');

  const roster = useAsync(() => services().data.motherRoster(actor?.facilityId ?? null), { immediate: open && !mother });
  const facilities = useAsync(() => services().data.allFacilities(), { immediate: open });
  const chart = useAsync(
    async () => {
      const target = mother?.id ?? selectedMother;
      if (!target) return null;
      return services().data.motherChart(target);
    },
    { immediate: open, deps: [mother?.id, selectedMother] },
  );

  const form = useForm(referralSchema, {
    motherId: mother?.id ?? '',
    reason: '',
    clinicalQuestion: '',
    urgency: 'URGENT',
    scheduledAt: toIsoDate(new Date()),
    time: '10:00',
    originFacilityId: actor?.facilityId ?? '',
    receivingFacilityId: '',
    transport: 'AMBULANCE',
    transportNote: '',
    clinicalNotes: '',
  });

  useEffect(() => {
    if (open) {
      form.setField('originFacilityId', actor?.facilityId ?? '');
      form.setField('motherId', mother?.id ?? selectedMother);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mother?.id, selectedMother, actor?.facilityId]);

  const lastVisit = chart.data?.visits[0] ?? null;
  const originName = (facilities.data ?? []).find((facility) => facility.id === actor?.facilityId)?.name ?? 'referring facility';
  const openAlert = chart.data?.alerts.find((row) => row.status !== 'RESOLVED') ?? null;

  const receivingOptions = useMemo(
    () =>
      (facilities.data ?? [])
        .filter((facility) => facility.active && facility.id !== actor?.facilityId)
        .map((facility) => ({ value: facility.id, label: `${facility.name} · ${facility.district}` })),
    [facilities.data, actor?.facilityId],
  );

  const motherOptions = useMemo(
    () =>
      (roster.data ?? []).map((row) => ({
        value: row.id,
        label: `${row.fullName} — ${row.patientId}${row.riskLevel && row.riskLevel !== 'GREEN' ? ` · ${row.riskLevel} risk` : ''}`,
      })),
    [roster.data],
  );

  const prefill = () => {
    if (!chart.data) return;
    const lines = [
      `Referred from ${originName} for specialist assessment.`,
      lastVisit
        ? `Last visit ${lastVisit.visitDate}: BP ${lastVisit.vitals.systolicBp ?? '—'}/${lastVisit.vitals.diastolicBp ?? '—'}, pulse ${
            lastVisit.vitals.pulse ?? '—'
          }, temperature ${lastVisit.vitals.temperatureC ?? '—'} °C, weight ${lastVisit.vitals.weightKg ?? '—'} kg, fetal heart rate ${
            lastVisit.vitals.fetalHeartRate ?? '—'
          }.`
        : 'No prior observations recorded at this facility.',
      openAlert ? `Open alert: ${openAlert.title}. ${openAlert.message}` : 'No unresolved alert at the time of referral.',
      `Gestation at referral: ${snapshotGestation ?? 'not dated'}.`,
    ];
    form.setField('clinicalNotes', lines.join(' '));
  };

  const snapshotGestation = chart.data?.mother.gestationalSnapshot
    ? `${chart.data.mother.gestationalSnapshot.weeks}+${chart.data.mother.gestationalSnapshot.days} weeks`
    : null;

  const submit = async () => {
    await form.submit(async (values) => {
      const motherId = values.motherId || mother?.id || selectedMother;
      if (!motherId) throw new Error('Select the mother being referred.');
      const snapshot = lastVisit?.vitals ?? null;
      await services().data.createReferral({
        motherId,
        reason: values.reason,
        clinicalQuestion: values.clinicalQuestion || null,
        urgency: values.urgency as ReferralUrgency,
        scheduledAt: values.scheduledAt,
        time: values.time,
        originFacilityId: actor?.facilityId ?? values.originFacilityId,
        receivingFacilityId: values.receivingFacilityId,
        transport: values.transport as Referral['transport'],
        transportNote: values.transportNote || null,
        clinicalNotes: values.clinicalNotes,
        vitalSnapshot: snapshot,
      });
      toast.success('Referral raised', 'The receiving facility has been notified and the handover is on the referral register.');
      onSaved?.();
      onClose();
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={() => void submit()}
      title={openAlert?.level === 'RED' ? 'Emergency referral' : 'Refer to another facility'}
      description="A referral is a documented handover: reason, the clinical question being asked, the observations at the time, transport and who receives it."
      submitting={form.submitting}
      dirty={form.dirty}
      formError={form.formError}
      submitLabel="Raise referral"
      size="lg"
      notice={
        facilities.error
          ? { tone: 'error', title: 'The facility directory did not load', body: facilities.error }
          : receivingOptions.length === 0
            ? {
                tone: 'warning',
                title: 'No other active facility is configured',
                body: 'A referral needs a receiving facility. Add one in Admin → Facilities before using this workflow.',
              }
            : null
      }
    >
      <div className="space-y-4">
        {!mother ? (
          <Field label="Mother" error={form.errors.motherId} required hint="Only records your account can read are listed.">
            <Select
              value={selectedMother}
              placeholder={roster.loading ? 'Loading the roster…' : 'Select a mother'}
              options={motherOptions}
              onValueChange={(value) => {
                setSelectedMother(value);
                form.setField('motherId', value);
              }}
              invalid={Boolean(form.errors.motherId)}
            />
          </Field>
        ) : null}

        <FormSection title="Why she is being referred" description="State the question the receiving clinician must answer.">
          <div className="space-y-3">
            <Field label="Reason for referral" error={form.errors.reason} required>
              <TextArea
                rows={2}
                value={form.values.reason}
                onValueChange={(value) => form.setField('reason', value)}
                onBlur={() => form.blur('reason')}
                invalid={Boolean(form.errors.reason)}
                placeholder="Severe hypertension at 32 weeks with headache; no improvement after first dose."
              />
            </Field>
            <Field label="Clinical question" optional error={form.errors.clinicalQuestion} hint="What you need from the receiving team.">
              <TextInput
                value={form.values.clinicalQuestion ?? ''}
                onValueChange={(value) => form.setField('clinicalQuestion', value)}
                placeholder="Needs assessment for pre-eclampsia and admission?"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Urgency" error={form.errors.urgency} required hint="Emergency referrals notify the receiving facility immediately.">
                <Select
                  value={form.values.urgency}
                  options={[
                    { value: 'EMERGENCY', label: 'Emergency — go now' },
                    { value: 'URGENT', label: 'Urgent — same day' },
                    { value: 'ROUTINE', label: 'Routine — next available clinic' },
                  ]}
                  onValueChange={(value) => form.setField('urgency', value as 'EMERGENCY' | 'URGENT' | 'ROUTINE')}
                  placeholder={null}
                />
              </Field>
              <Field label="Report-by date" error={form.errors.scheduledAt} required>
                <TextInput type="date" value={form.values.scheduledAt} onValueChange={(value) => form.setField('scheduledAt', value)} min={toIsoDate(new Date())} />
              </Field>
              <Field label="Time" error={form.errors.time} required>
                <TextInput type="time" value={form.values.time} onValueChange={(value) => form.setField('time', value)} />
              </Field>
              <Field label="Transport" error={form.errors.transport} required>
                <Select
                  value={form.values.transport}
                  options={[
                    { value: 'AMBULANCE', label: 'Ambulance' },
                    { value: 'PRIVATE_CAR', label: 'Private vehicle' },
                    { value: 'OTHER', label: 'Other' },
                    { value: 'NONE', label: 'None arranged' },
                  ]}
                  onValueChange={(value) => form.setField('transport', value as 'AMBULANCE' | 'PRIVATE_CAR' | 'OTHER' | 'NONE')}
                  placeholder={null}
                />
              </Field>
            </div>
            {form.values.transport === 'OTHER' ? (
              <Field label="Transport note" error={form.errors.transportNote} hint="Describe what has been arranged.">
                <TextInput value={form.values.transportNote ?? ''} onValueChange={(value) => form.setField('transportNote', value)} placeholder="District ambulance booked for 11:30" />
              </Field>
            ) : null}
          </div>
        </FormSection>

        <FormSection title="Between the two facilities" description="The referring facility is always the one you are signed in to.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Referring facility" error={form.errors.originFacilityId} required>
              <Select
                value={actor?.facilityId ?? ''}
                options={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
                onValueChange={() => undefined}
                disabled
                placeholder={facilities.loading ? 'Loading…' : 'No facility on your account'}
              />
            </Field>
            <Field label="Receiving facility" error={form.errors.receivingFacilityId} required>
              <Select
                value={form.values.receivingFacilityId}
                options={receivingOptions}
                placeholder="Select a facility"
                onValueChange={(value) => form.setField('receivingFacilityId', value)}
                onBlur={() => form.blur('receivingFacilityId')}
                invalid={Boolean(form.errors.receivingFacilityId)}
              />
            </Field>
          </div>
        </FormSection>

        <FormSection title="Clinical summary" description="What the receiving team needs to know before she arrives.">
          <div className="space-y-3">
            <NoticeState tone="info" title="Vital snapshot" compact>
              {lastVisit
                ? `The observations from ${lastVisit.visitDate} (visit ${lastVisit.visitNumber}) are attached automatically: BP ${
                    lastVisit.vitals.systolicBp ?? '—'
                  }/${lastVisit.vitals.diastolicBp ?? '—'}, pulse ${lastVisit.vitals.pulse ?? '—'}, temperature ${
                    lastVisit.vitals.temperatureC ?? '—'
                  } °C, fetal heart rate ${lastVisit.vitals.fetalHeartRate ?? '—'}.`
                : 'No saved observations exist for this mother, so nothing can be attached. Record them on the ANC visit first if you have them.'}
            </NoticeState>
            <Field label="Summary for the receiving clinician" error={form.errors.clinicalNotes} required hint="Facts and findings only. No diagnosis is implied.">
              <TextArea
                rows={6}
                value={form.values.clinicalNotes}
                onValueChange={(value) => form.setField('clinicalNotes', value)}
                onBlur={() => form.blur('clinicalNotes')}
                invalid={Boolean(form.errors.clinicalNotes)}
                placeholder="27 years, G2P1, 32+4 weeks by LMP. Booked at 14 weeks, no complications until today. BP 168/110 and 165/104 fifteen minutes apart, 3+ proteinuria, headache, no visual disturbance. First dose nifedipine 10 mg given at 09:40. No drug allergies. Husband accompanying."
              />
            </Field>
            <button
              type="button"
              onClick={prefill}
              disabled={!chart.data}
              className="btn btn-secondary btn-sm"
              title="DRAFT: build the summary from the stored observations so nothing is typed twice."
            >
              <Stethoscope className="size-4" aria-hidden /> Draft from stored observations
            </button>
            <p className="caption">
              The drafted text is composed only from measurements already saved on this record. Review and edit it before sending — it becomes the
              clinical handover note.
            </p>
          </div>
        </FormSection>

        {openAlert ? (
          <NoticeState tone="warning" title={`Unresolved ${openAlert.level} alert on this record`} compact>
            {openAlert.message} Mention it in the summary so the receiving team sees it before the mother arrives.
          </NoticeState>
        ) : null}

        <p className="caption flex items-center gap-1.5">
          <Send className="size-3.5" aria-hidden />
          Raising the referral notifies the receiving facility and the officer who booked the mother, and writes an audit entry.
        </p>
      </div>
    </FormDialog>
  );
}

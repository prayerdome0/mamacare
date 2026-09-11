import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { FormDialog, FormSection } from '@/components/forms/form-dialog';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { services } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { alertSchema } from '@/lib/validation';
import { listStaffForFacility } from '@/services/admin/user-admin';
import type { Role } from '@/types/domain';

const CATEGORIES = [
  { value: 'DANGER_SIGN', label: 'Reported danger sign' },
  { value: 'BLOOD_PRESSURE', label: 'Blood pressure' },
  { value: 'VITALS', label: 'Other vital sign' },
  { value: 'FETAL', label: 'Fetal condition' },
  { value: 'INFECTION', label: 'Infection / fever' },
  { value: 'NUTRITION', label: 'Nutrition' },
  { value: 'LABORATORY', label: 'Laboratory result' },
  { value: 'RISK_PROFILE', label: 'Risk profile' },
  { value: 'MISSED_VISIT', label: 'Missed visit' },
  { value: 'OTHER', label: 'Other clinical concern' },
];

const NON_DIAGNOSTIC = /\b(i diagnose|you have|she has|is suffering|diagnosis of|confirmed case of)\b/i;

/**
 * Manual alert entry, for a concern the configured rules do not cover.
 *
 * Wording is validated: it must describe the recorded finding and the assessment
 * required, and may not assert a diagnosis — the same rule the automatic alerts
 * follow.
 */
export function AlertDialog({
  open,
  onClose,
  motherId,
  facilityId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  motherId?: string | null;
  facilityId?: string | null;
  onSaved?: () => void;
}) {
  const toast = useToast();
  const { actor } = useSession();
  const roster = useAsync(() => services().data.motherRoster(facilityId ?? actor?.facilityId ?? null), { immediate: open });
  const staff = useAsync(
    async () => {
      if (!facilityId && !actor?.facilityId) return [];
      return listStaffForFacility(facilityId ?? actor?.facilityId ?? null, ['MIDWIFE', 'NURSE', 'FACILITY_SUPERVISOR'] as Role[]);
    },
    { immediate: open, deps: [facilityId, actor?.facilityId] },
  );

  const form = useForm(alertSchema, {
    motherId: motherId ?? '',
    level: 'RED',
    category: 'DANGER_SIGN',
    title: '',
    message: '',
    assignedUserId: '',
  });

  useEffect(() => {
    if (open) form.setField('motherId', motherId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, motherId]);

  const wordingError = useMemo(() => (NON_DIAGNOSTIC.test(form.values.message) ? 'Describe the recorded finding and the assessment required. Do not state a diagnosis.' : null), [form.values.message]);

  const submit = async () => {
    await form.submit(async (values) => {
      if (NON_DIAGNOSTIC.test(values.message)) {
        throw new Error('Alert wording must describe the finding and the assessment required — it may not state a diagnosis.');
      }
      const assigned = (staff.data ?? []).find((user) => user.id === values.assignedUserId);
      await services().data.createManualAlert({
        motherId: values.motherId,
        level: values.level,
        category: values.category,
        title: values.title,
        message: values.message,
        assignedUserId: values.assignedUserId || null,
        triggeredBy: [{ label: 'Reported by', value: actor?.displayName ?? 'Clinician', unit: null }],
      });
      toast.success('Alert raised', assigned ? `${assigned.fullName} was notified.` : 'The facility team was notified.');
      onSaved?.();
      onClose();
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      size="md"
      title="Raise a clinical alert"
      description="For a concern that needs action but is not covered by a configured rule."
      submitLabel="Raise alert"
      submitting={form.submitting}
      dirty={form.dirty}
      onSubmit={submit}
      formError={form.formError}
    >
      <FormSection title="What was observed" columns={1}>
        <Field label="Mother" error={form.errors.motherId} required>
          {motherId ? (
            <p className="input flex items-center bg-ink-100 text-ink-700">
              {(roster.data ?? []).find((mother) => mother.id === motherId)?.fullName ?? 'Selected mother'}{' '}
              <span className="micro ml-1.5">{(roster.data ?? []).find((mother) => mother.id === motherId)?.patientId ?? ''}</span>
            </p>
          ) : (
            <Select
              value={form.values.motherId}
              placeholder="Select a mother"
              options={(roster.data ?? []).map((mother) => ({ value: mother.id, label: `${mother.fullName} — ${mother.patientId}` }))}
              onValueChange={(value) => form.setField('motherId', value)}
              invalid={Boolean(form.errors.motherId)}
            />
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Level" error={form.errors.level} hint="Red means assessment now; amber means review within the interval the facility sets.">
            <Select
              value={form.values.level}
              options={[
                { value: 'RED', label: 'Red — immediate assessment' },
                { value: 'AMBER', label: 'Amber — review and follow up' },
              ]}
              onValueChange={(value) => form.setField('level', value as 'RED' | 'AMBER')}
            />
          </Field>
          <Field label="Category" error={form.errors.category}>
            <Select value={form.values.category} options={CATEGORIES} onValueChange={(value) => form.setField('category', value as never)} />
          </Field>
        </div>
        <Field label="Title" error={form.errors.title} required hint="Short. It appears in the alert list and on the mother’s record.">
          <TextInput value={form.values.title} onValueChange={(value) => form.setField('title', value)} onBlur={() => form.blur('title')} invalid={Boolean(form.errors.title)} placeholder="Blood pressure at 165/110 after repeat" />
        </Field>
        <Field
          label="Finding and what it requires"
          error={form.errors.message ?? wordingError}
          required
          hint="State the recorded finding and the assessment needed. The system will not accept wording that declares a diagnosis."
        >
          <TextArea
            rows={4}
            value={form.values.message}
            onValueChange={(value) => form.setField('message', value)}
            onBlur={() => form.blur('message')}
            invalid={Boolean(form.errors.message || wordingError)}
            placeholder="Repeat blood pressure 165/110 with 1+ protein on dip. Immediate clinical assessment required; magnesium sulphide availability to be confirmed."
          />
        </Field>
        {wordingError ? (
          <NoticeState tone="warning" title="Wording rejected">
            {wordingError}
          </NoticeState>
        ) : null}
      </FormSection>

      <FormSection title="Who responds" description="An unassigned alert is visible to the whole facility team and to every supervisor.">
        <Field label="Assign to" optional>
          <Select
            value={form.values.assignedUserId}
            placeholder="Nobody in particular"
            options={(staff.data ?? []).map((user) => ({ value: user.id, label: `${user.fullName} — ${user.role.replace(/_/g, ' ')}` }))}
            onValueChange={(value) => form.setField('assignedUserId', value)}
          />
        </Field>
        <p className="caption flex items-start gap-2">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-[var(--color-risk-red)]" aria-hidden />
          Raising an alert notifies the assignee and the facility team, and is written to the audit log with your name and the time.{' '}
          <Link to="/app/alerts" className="font-semibold text-brand-800 hover:underline">
            Open the alert queue
          </Link>
          .
        </p>
      </FormSection>
    </FormDialog>
  );
}

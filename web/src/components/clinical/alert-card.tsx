import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, Check, ChevronDown, Clock, ShieldAlert, UserCheck } from 'lucide-react';
import { Badge, ErrorState, LoadingRows, TimeRemaining } from '@/components/ui/display';
import { Button } from '@/components/ui/button';
import { Field, Select, TextArea } from '@/components/ui/form';
import { FormDialog } from '@/components/forms/form-dialog';
import { services } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { useForm } from '@/hooks/use-form';
import { alertActionSchema } from '@/lib/validation';
import { cn, formatDateTime, toIsoDate } from '@/lib/utils';
import type { ClinicalAlert } from '@/types/domain';

const ACTION_STATUSES: { value: ClinicalAlert['status']; label: string; hint: string }[] = [
  { value: 'ACKNOWLEDGED', label: 'Acknowledged', hint: 'Seen; assessment still to be done.' },
  { value: 'ASSESSED', label: 'Assessed', hint: 'Clinically assessed; record what was found and done.' },
  { value: 'REFERRED', label: 'Referred', hint: 'Escalated to another clinician or facility.' },
  { value: 'FOLLOW_UP_REQUIRED', label: 'Follow-up required', hint: 'Action pending — assign and schedule it.' },
  { value: 'RESOLVED', label: 'Resolved', hint: 'Closed with the outcome recorded.' },
];

/**
 * An alert row with its evidence and response trail.
 *
 * The headline is the rule message verbatim — it always states that assessment is
 * required rather than naming a condition — and the evidence list shows exactly
 * which recorded values satisfied the criteria.
 */
export function AlertCard({
  alert,
  showMother = true,
  onChanged,
  compact,
}: {
  alert: ClinicalAlert;
  showMother?: boolean;
  onChanged?: () => void;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [responding, setResponding] = useState(false);
  const { permissions, actor } = useSession();
  const toast = useToast();

  const tone = alert.level === 'RED' ? 'red' : alert.level === 'AMBER' ? 'amber' : 'green';
  const border =
    alert.level === 'RED'
      ? 'border-l-[var(--color-risk-red)]'
      : alert.level === 'AMBER'
        ? 'border-l-[var(--color-risk-amber)]'
        : 'border-l-[var(--color-risk-green)]';

  return (
    <article className={cn('card overflow-hidden border-l-4', border)}>
      <div className={cn('flex flex-wrap items-start gap-3', compact ? 'p-3' : 'p-4')}>
        <span
          className={cn(
            'mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg',
            alert.level === 'RED' ? 'bg-[var(--color-risk-red)] text-white' : alert.level === 'AMBER' ? 'bg-[var(--color-risk-amber)] text-white' : 'bg-[var(--color-risk-green)] text-white',
          )}
          aria-hidden
        >
          {alert.level === 'GREEN' ? <Check className="size-4" /> : <ShieldAlert className="size-4" />}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge tone={tone}>{alert.level}</Badge>
            <Badge tone="neutral">{alert.category.replace(/_/g, ' ')}</Badge>
            <Badge tone={alert.status === 'RESOLVED' ? 'green' : alert.status === 'OPEN' ? 'red' : 'amber'}>{alert.status.replace(/_/g, ' ')}</Badge>
            {alert.ruleKey ? (
              <span className="micro text-ink-400">
                rule {alert.ruleKey} v{alert.ruleVersion ?? 1}
              </span>
            ) : null}
          </div>
          <h3 className="mt-1.5 text-[0.95rem] font-semibold leading-snug text-ink-900">{alert.title}</h3>
          <p className="mt-1 text-[0.84rem] leading-relaxed text-ink-600">{alert.message}</p>
          {showMother ? (
            <p className="micro mt-2">
              <Link to={`/app/mothers/${alert.motherId}`} className="font-semibold text-brand-800 hover:underline">
                {alert.motherName} · {alert.patientId}
              </Link>{' '}
              · raised {formatDateTime(alert.openedAt)} by {alert.openedByName ?? 'system'}
            </p>
          ) : (
            <p className="micro mt-2">
              raised {formatDateTime(alert.openedAt)} by {alert.openedByName ?? 'system'}
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <TimeRemaining due={alert.openedAt} />
          {alert.assignedUserName ? (
            <span className="micro inline-flex items-center gap-1 text-ink-500">
              <UserCheck className="size-3.5" aria-hidden />
              {alert.assignedUserName}
            </span>
          ) : (
            <span className="micro text-[var(--color-risk-red-text)]">unassigned</span>
          )}
          {alert.triggeredBy.length > 0 ? (
            <button type="button" onClick={() => setOpen((value) => !value)} className="micro inline-flex items-center gap-1 text-ink-500 hover:text-ink-800" aria-expanded={open}>
              evidence
              <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} aria-hidden />
            </button>
          ) : null}
        </div>
      </div>

      {open && alert.triggeredBy.length > 0 ? (
        <div className="border-t border-ink-100 bg-ink-50/70 px-4 py-3">
          <p className="micro mb-2">Values that satisfied this rule</p>
          <ul className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {alert.triggeredBy.map((evidence, index) => (
              <li key={`${evidence.label}-${index}`} className="flex items-baseline justify-between gap-2 rounded-md bg-white px-2.5 py-1.5 ring-1 ring-ink-200">
                <span className="truncate text-[0.78rem] text-ink-500">{evidence.label}</span>
                <span className="shrink-0 text-[0.82rem] font-semibold text-ink-900 tnum">
                  {evidence.value}
                  {evidence.unit ? <span className="ml-1 text-[0.7rem] font-normal text-ink-500">{evidence.unit}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {alert.actions.length > 0 ? (
        <ol className="space-y-2 border-t border-ink-100 px-4 py-3">
          {alert.actions.map((action, index) => (
            <li key={`${action.at}-${index}`} className="flex items-start gap-2.5 text-[0.8rem]">
              <Clock className="mt-0.5 size-3.5 shrink-0 text-ink-400" aria-hidden />
              <span className="min-w-0">
                <span className="font-semibold text-ink-800">{action.status.replace(/_/g, ' ')}</span>
                <span className="text-ink-500"> · {action.byName ?? 'staff'} · {formatDateTime(action.at)}</span>
                <span className="mt-0.5 block leading-snug text-ink-600">{action.note}</span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {permissions.canResolveAlert ? (
        <footer className="flex flex-wrap items-center gap-2 border-t border-ink-100 bg-white px-4 py-2.5">
          <Button size="sm" variant="secondary" onClick={() => setResponding(true)} icon={<Activity className="size-3.5" aria-hidden />}>
            Record response
          </Button>
          {alert.status === 'OPEN' ? (
            <Button
              size="sm"
              variant="quiet"
              onClick={async () => {
                if (!actor) return;
                try {
                  await services().data.assignAlert(alert.id, actor.uid, actor.displayName ?? 'Staff');
                  toast.success('Assigned to you');
                  onChanged?.();
                } catch (error) {
                  toast.error(error, 'Could not assign');
                }
              }}
            >
              Take this alert
            </Button>
          ) : null}
          {alert.visitId ? (
            <Link to={`/app/mothers/${alert.motherId}?tab=visits&visit=${alert.visitId}`} className="micro ml-auto font-semibold text-brand-800 hover:underline">
              View the visit
            </Link>
          ) : null}
        </footer>
      ) : null}

      <RespondDialog
        alert={alert}
        open={responding}
        onClose={() => setResponding(false)}
        onDone={() => {
          setResponding(false);
          onChanged?.();
        }}
      />
    </article>
  );
}

export function RespondDialog({ alert, open, onClose, onDone }: { alert: ClinicalAlert | null; open: boolean; onClose: () => void; onDone?: () => void }) {
  const toast = useToast();
  const [load, setLoad] = useState(false);
  const form = useForm(alertActionSchema, { status: 'ASSESSED', note: '', followUpDate: '', createReferral: false });

  if (!alert) return null;

  const submit = async () => {
    setLoad(true);
    try {
      await form.submit(async (values) => {
        await services().data.recordAlertAction(alert.id, {
          status: values.status,
          note: values.note,
          followUpDate: values.followUpDate || null,
        });
      });
      toast.success('Response recorded', 'The alert history and the audit log were both updated.');
      onDone?.();
    } catch (error) {
      toast.error(error, 'The response was not recorded');
    } finally {
      setLoad(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      size="md"
      title="Record the response to this alert"
      description={`${alert.title} · ${alert.patientId}`}
      submitLabel="Save response"
      submitting={form.submitting || load}
      dirty={form.dirty}
      onSubmit={submit}
      formError={form.formError}
    >
      <div className="space-y-4">
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="micro mb-1">What was flagged</p>
          <p className="text-[0.86rem] leading-relaxed text-ink-700">{alert.message}</p>
        </div>
        <Field label="Action taken" error={form.errors.status} required hint="Sets the alert status. Resolution requires a documented action.">
          <Select
            value={form.values.status}
            options={ACTION_STATUSES.map((status) => ({ value: status.value, label: `${status.label} — ${status.hint}` }))}
            onValueChange={(value) => form.setField('status', value as typeof form.values.status)}
          />
        </Field>
        <Field label="Clinical note" error={form.errors.note} required hint="What you found, what you did, and what happens next.">
          <TextArea rows={4} value={form.values.note} onValueChange={(value) => form.setField('note', value)} onBlur={() => form.blur('note')} invalid={Boolean(form.errors.note)} placeholder="Reviewed within 20 minutes. BP 150/94 on repeat; urine 2+ protein. Started nifedipine per protocol, recheck in 3 days, admission discussed." />
        </Field>
        <Field label="Follow-up date" optional error={form.errors.followUpDate} hint="Leave blank if no follow-up is needed.">
          <input
            type="date"
            className="input"
            value={form.values.followUpDate ?? ''}
            onChange={(event) => form.setField('followUpDate', event.target.value)}
            min={toIsoDate(new Date())}
          />
        </Field>
        {form.values.createReferral ? (
          <NoticeInline>
            Referral creation happens on the referrals screen with the clinical question and destination recorded — the alert is marked as
            referred and the referral links back to it.
          </NoticeInline>
        ) : null}
      </div>
    </FormDialog>
  );
}

function NoticeInline({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg bg-[var(--color-info-soft)] px-3 py-2 text-[0.8rem] leading-relaxed text-ink-700">{children}</p>;
}

/** Compact variant used inside the mother profile tabs. */
export function AlertListSkeleton() {
  return <LoadingRows rows={3} />;
}

export function AlertListError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <ErrorState message={message} onRetry={onRetry} title="Alerts could not be loaded" />;
}

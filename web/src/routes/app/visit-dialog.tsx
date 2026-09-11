import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Activity, ClipboardSignature, Plus } from 'lucide-react';
import { FormDialog, FormSection } from '@/components/forms/form-dialog';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { Badge, NoticeState } from '@/components/ui/display';
import { DangerSignPicker, ObservationGrid, draftFromValues, toVitals, type ObservationDraft } from '@/components/clinical/observation-form';
import { EMPTY_OBSERVATIONS } from '@/components/clinical/observation-form';
import { services } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/providers/app-providers';
import { ancVisitSchema, type AncVisitValues } from '@/lib/validation';
import { AppError } from '@/lib/errors';
import { gestationalAge, shortGestationalAge } from '@/lib/obstetrics';
import { newClientRef } from '@/lib/ids';
import { addDays, toIsoDate } from '@/lib/utils';
import type { AncVisit, DangerSignKey, Mother, Pregnancy, TestResult } from '@/types/domain';

/**
 * The structured ANC visit.
 *
 * Saving runs the configured rule set over the observations and creates one alert
 * per matching rule, idempotent on a client reference so a double submit or a
 * retried offline save can never produce duplicate clinical records.
 */

const COUNSELLING_TOPICS = [
  'Birth preparedness',
  'Danger signs explained',
  'Iron and folinic acid',
  'Nutrition',
  'ITN / malaria prevention',
  'PMTCT testing',
  'Family planning after birth',
  'Infant feeding',
  'Kangaroo care',
  'Tetanus toxoid',
  'Kick counting from 24 weeks',
  'Transport planning',
];

const VISIT_TYPES = [
  { value: 'BOOKING', label: 'Booking (first contact)' },
  { value: 'ROUTINE', label: 'Routine review' },
  { value: 'FOLLOW_UP', label: 'Follow-up' },
  { value: 'URGENT', label: 'Urgent / unscheduled' },
  { value: 'REVIEW', label: 'Post-alert review' },
  { value: 'PMTCT', label: 'PMTCT' },
  { value: 'ULTRASOUND', label: 'Ultrasound' },
];

const OUTCOMES = [
  { value: 'CONTINUE_CARE', label: 'Continue routine care' },
  { value: 'REFERRED', label: 'Referred' },
  { value: 'ADMITTED', label: 'Admitted' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'LOST_TO_FOLLOWUP', label: 'Unable to follow up' },
];

const LEVELS = [
  { value: 'NONE', label: 'None' },
  { value: 'TRACE', label: 'Trace' },
  { value: 'PLUS_1', label: '+' },
  { value: 'PLUS_2', label: '++' },
  { value: 'PLUS_3', label: '+++' },
];

export function VisitDialog({
  open,
  onClose,
  mother,
  pregnancy,
  visit,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  mother: Mother | null;
  pregnancy: Pregnancy | null;
  /** When set the dialog edits an existing visit instead of creating one. */
  visit?: AncVisit | null;
  onSaved?: (result: { alerts: number; riskLevel: string }) => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const editing = Boolean(visit);

  const [draft, setDraft] = useState<ObservationDraft>(EMPTY_OBSERVATIONS);
  const [visitDate, setVisitDate] = useState(toIsoDate(new Date()));
  const [visitType, setVisitType] = useState<AncVisit['visitType']>('ROUTINE');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<AncVisit['outcome']>('CONTINUE_CARE');
  const [nextAppointmentDate, setNextAppointmentDate] = useState('');
  const [urineProtein, setUrineProtein] = useState<'NONE' | 'TRACE' | 'PLUS_1' | 'PLUS_2' | 'PLUS_3'>('NONE');
  const [urineGlucose, setUrineGlucose] = useState<'NONE' | 'TRACE' | 'PLUS_1' | 'PLUS_2' | 'PLUS_3'>('NONE');
  const [oedema, setOedema] = useState<'NONE' | 'MILD' | 'SEVERE'>('NONE');
  const [presentation, setPresentation] = useState<'VERTEX' | 'BREECH' | 'TRANSVERSE' | 'UNDETERMINED'>('UNDETERMINED');
  const [heightCm, setHeightCm] = useState('');
  const [bloodGlucose, setBloodGlucose] = useState('');
  const [dangerSigns, setDangerSigns] = useState<DangerSignKey[]>([]);
  const [otherNote, setOtherNote] = useState('');
  const [noneReported, setNoneReported] = useState(false);
  const [counselling, setCounselling] = useState<string[]>([]);
  const [tests, setTests] = useState<TestResult[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [clientRef] = useState(() => newClientRef());
  const [previous, setPrevious] = useState<{ weight: number | null; fundal: number | null }>({ weight: null, fundal: null });

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setFormError(null);
    if (visit) {
      setDraft(draftFromValues(visit.vitals));
      setVisitDate(visit.visitDate);
      setVisitType(visit.visitType);
      setReason(visit.reasonForVisit ?? '');
      setNote(visit.note ?? '');
      setOutcome(visit.outcome ?? 'CONTINUE_CARE');
      setUrineProtein((visit.vitals?.urineProtein as typeof urineProtein) ?? 'NONE');
      setUrineGlucose((visit.vitals?.urineGlucose as typeof urineGlucose) ?? 'NONE');
      setOedema((visit.vitals?.oedema as typeof oedema) ?? 'NONE');
      setPresentation((visit.vitals?.presentation as typeof presentation) ?? 'UNDETERMINED');
      setDangerSigns((visit.dangerSigns?.reported as DangerSignKey[]) ?? []);
      setOtherNote(visit.dangerSigns?.otherNote ?? '');
      setNoneReported(visit.dangerSigns?.noneReported ?? false);
      setCounselling(visit.counselling ?? []);
      setTests(visit.tests ?? []);
      setNextAppointmentDate(visit.nextAppointmentAt ? visit.nextAppointmentAt.slice(0, 10) : '');
    } else {
      setDraft(EMPTY_OBSERVATIONS);
      setVisitDate(toIsoDate(new Date()));
      setVisitType(mother?.currentPregnancyId && !mother.lastVisitAt ? 'BOOKING' : 'ROUTINE');
      setReason('');
      setNote('');
      setOutcome('CONTINUE_CARE');
      setUrineProtein('NONE');
      setUrineGlucose('NONE');
      setOedema('NONE');
      setPresentation('UNDETERMINED');
      setDangerSigns([]);
      setOtherNote('');
      setNoneReported(false);
      setCounselling([]);
      setTests([]);
      setNextAppointmentDate(toIsoDate(addDays(new Date(), 28)));
    }
    setHeightCm(visit?.vitals?.heightCm ? String(visit.vitals.heightCm) : '');
    setBloodGlucose(visit?.vitals?.bloodGlucoseMmoll ? String(visit.vitals.bloodGlucoseMmoll) : '');
    setPrevious({ weight: null, fundal: null });
    if (mother && !visit) {
      void services()
        .data.list('anc_visits', { where: [{ field: 'motherId', op: '==', value: mother.id }], orderBy: { field: 'visitDate', direction: 'desc' }, limit: 6 })
        .then(({ rows }) => {
          const last = rows.find((row) => row.vitals?.weightKg != null);
          const lastFundal = rows.find((row) => row.vitals?.fundalHeightCm != null);
          setPrevious({ weight: last?.vitals?.weightKg ?? null, fundal: lastFundal?.vitals?.fundalHeightCm ?? null });
        })
        .catch(() => undefined);
    }
  }, [open, visit, mother]);

  const ga = useMemo(
    () =>
      gestationalAge({
        lmpDate: pregnancy?.lmpDate ?? null,
        eddDate: pregnancy?.eddDate ?? null,
        documented: null,
        asOf: new Date(`${visitDate}T09:00:00`),
      }),
    [pregnancy, visitDate],
  );

  const assembled: AncVisitValues = {
    visitDate,
    visitType,
    reasonForVisit: reason,
    gestationalWeeks: ga.valid ? ga.weeks : undefined,
    gestationalDays: ga.valid ? ga.days : undefined,
    bloodPressure: draft.systolicBp && draft.diastolicBp ? `${draft.systolicBp}/${draft.diastolicBp}` : '',
    pulse: draft.pulse === '' ? undefined : Number(draft.pulse),
    temperatureC: draft.temperatureC === '' ? undefined : Number(draft.temperatureC),
    respiratoryRate: draft.respiratoryRate === '' ? undefined : Number(draft.respiratoryRate),
    weightKg: draft.weightKg === '' ? undefined : Number(draft.weightKg),
    heightCm: heightCm === '' ? undefined : Number(heightCm),
    muacCm: draft.muacCm === '' ? undefined : Number(draft.muacCm),
    fundalHeightCm: draft.fundalHeightCm === '' ? undefined : Number(draft.fundalHeightCm),
    fetalHeartRate: draft.fetalHeartRate === '' ? undefined : Number(draft.fetalHeartRate),
    haemoglobinGdl: draft.haemoglobinGdl === '' ? undefined : Number(draft.haemoglobinGdl),
    bloodGlucoseMmoll: bloodGlucose === '' ? undefined : Number(bloodGlucose),
    oedema,
    urineProtein,
    urineGlucose,
    presentation,
    dangerSigns,
    otherDangerSignNote: otherNote,
    noneReported,
    note,
    counselling,
    outcome: outcome ?? undefined,
    nextAppointmentDate: nextAppointmentDate || undefined,
  };

  const submit = async () => {
    setFormError(null);
    const parsed = ancVisitSchema.safeParse(assembled);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) next[issue.path.join('.') || 'form'] = issue.message;
      setErrors(next);
      setFormError(next.dangerSigns ?? 'Check the highlighted observations.');
      return;
    }
    if (!mother || !pregnancy) {
      setFormError('A mother and pregnancy must be selected before a visit can be recorded.');
      return;
    }
    setSubmitting(true);
    try {
      const vitals = toVitals({ ...draft, ...(heightCm ? { weightKg: draft.weightKg } : {}) });
      const merged = {
        ...vitals,
        heightCm: heightCm === '' ? null : Number(heightCm),
        bloodGlucoseMmoll: bloodGlucose === '' ? null : Number(bloodGlucose),
        oedema,
        urineProtein,
        urineGlucose,
        presentation,
      };
      const payload = {
        motherId: mother.id,
        pregnancyId: pregnancy.id,
        visitDate,
        visitType,
        reasonForVisit: reason || null,
        gestationalAge: { weeks: ga.weeks, days: ga.days },
        vitals: merged,
        dangerSigns: { reported: dangerSigns, otherNote: otherNote || null, noneReported },
        tests,
        counselling,
        note: note || null,
        outcome,
        nextAppointmentAt: nextAppointmentDate || null,
        clientRef,
      };

      const result = editing
        ? await services()
            .data.updateVisit(visit!.id, { ...payload, riskLevelAfter: undefined } as never)
            .then(() => ({ visit: null as AncVisit | null, alerts: [] as unknown[], riskLevel: 'kept' }))
        : await services().data.createVisit(payload);

      const alertCount = 'alerts' in result ? result.alerts.length : 0;
      toast.success(editing ? 'Visit updated' : 'Visit recorded', editing ? 'The changes are saved to the record.' : alertCount > 0 ? `${alertCount} alert${alertCount === 1 ? '' : 's'} raised for review.` : 'No threshold was crossed.');
      onSaved?.({ alerts: alertCount, riskLevel: 'riskLevel' in result ? result.riskLevel : 'kept' });
      onClose();
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'The visit could not be saved. Your entries are still here — try again.';
      setFormError(message);
      toast.error(error, 'Visit not saved');
    } finally {
      setSubmitting(false);
    }
  };

  const dirty =
    JSON.stringify({ draft, visitDate, visitType, reason, note, dangerSigns, noneReported, counselling, tests, outcome, urineProtein }) !==
    JSON.stringify({
      draft: visit ? draftFromValues(visit.vitals) : EMPTY_OBSERVATIONS,
      visitDate: visit?.visitDate ?? toIsoDate(new Date()),
      visitType: visit?.visitType ?? 'ROUTINE',
      reason: visit?.reasonForVisit ?? '',
      note: visit?.note ?? '',
      dangerSigns: (visit?.dangerSigns?.reported as DangerSignKey[]) ?? [],
      noneReported: visit?.dangerSigns?.noneReported ?? false,
      counselling: visit?.counselling ?? [],
      tests: visit?.tests ?? [],
      outcome: visit?.outcome ?? 'CONTINUE_CARE',
      urineProtein: visit?.vitals?.urineProtein ?? 'NONE',
    });

  const alertPreview = dangerSigns.filter((key) => key !== 'OTHER_CONCERN').length + (noneReported ? 0 : 0);

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      size="xl"
      title={editing ? 'Edit antenatal visit' : 'Record antenatal visit'}
      description={
        mother ? (
          <>
            {mother.fullName} · <span className="font-semibold">{mother.patientId}</span> ·{' '}
            {ga.valid ? `${shortGestationalAge(ga)} on ${new Date(`${visitDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'pregnancy not dated'}
            {actor?.displayName ? ` · recorded by ${actor.displayName}` : ''}
          </>
        ) : (
          'Select a mother first.'
        )
      }
      submitLabel={editing ? 'Save changes' : 'Save visit and evaluate alerts'}
      submitting={submitting}
      dirty={dirty}
      onSubmit={submit}
      formError={formError}
      confirmDiscard={() => confirm({ title: 'Discard this visit?', message: 'Nothing has been saved to the record.', confirmLabel: 'Discard', tone: 'danger' })}
      extraActions={
        alertPreview > 0 && !editing ? (
          <Badge tone="red" icon={<AlertTriangle className="size-3" aria-hidden />}>
            {alertPreview} danger sign{alertPreview === 1 ? '' : 's'} reported
          </Badge>
        ) : null
      }
      notice={
        !ga.valid
          ? {
              tone: 'warning',
              title: 'This pregnancy has no usable dates',
              body: 'Gestational-age based rules cannot be evaluated. Save the visit and set the dating on the pregnancy tab, or enter the measured gestational age here.',
            }
          : null
      }
    >
      <FormSection title="Visit information" description="Date, reason and the plan on leaving the facility." columns={2}>
        <Field label="Visit date" error={errors.visitDate} required>
          <TextInput type="date" value={visitDate} onValueChange={setVisitDate} invalid={Boolean(errors.visitDate)} max={toIsoDate(new Date())} />
        </Field>
        <Field label="Visit type" error={errors.visitType} required>
          <Select value={visitType} options={VISIT_TYPES} onValueChange={(value) => setVisitType(value as AncVisit['visitType'])} />
        </Field>
        <Field label="Reason for the visit" optional error={errors.reasonForVisit}>
          <TextInput value={reason} onValueChange={setReason} placeholder="Routine review, 28 weeks" />
        </Field>
        <Field label="Outcome at this contact" error={errors.outcome} hint="Drives what the dashboard counts as needing follow-up.">
          <Select value={outcome ?? ''} options={OUTCOMES} onValueChange={(value) => setOutcome(value as AncVisit['outcome'])} />
        </Field>
        <Field label="Next appointment" optional error={errors.nextAppointmentDate} hint="Leave blank if it was not scheduled.">
          <TextInput type="date" min={toIsoDate(addDays(new Date(), 1))} value={nextAppointmentDate} onValueChange={setNextAppointmentDate} />
        </Field>
        <Field label="Measured gestational age" optional hint={ga.valid ? `Derived from dates: ${shortGestationalAge(ga)}` : 'Not derived — enter it if measured.'}>
          <TextInput
            value={ga.valid ? `${ga.weeks}+${ga.days}` : ''}
            readOnly
            disabled
            placeholder="auto"
            title="Gestational age is calculated from the pregnancy dates and cannot be typed over."
          />
        </Field>
      </FormSection>

      <FormSection title="Observations" description="Blank means not measured. Thresholds shown under a field come from the configured rules.">
        <ObservationGrid
          draft={draft}
          errors={{ systolicBp: errors.bloodPressure, diastolicBp: errors.bloodPressure, pulse: errors.pulse, temperatureC: errors.temperatureC, respiratoryRate: errors.respiratoryRate, weightKg: errors.weightKg, muacCm: errors.muacCm, fundalHeightCm: errors.fundalHeightCm, fetalHeartRate: errors.fetalHeartRate, haemoglobinGdl: errors.haemoglobinGdl }}
          previousWeight={previous.weight}
          previousFundalHeight={previous.fundal}
          gestationalWeeks={ga.valid ? ga.weeks : null}
          onChange={(key, value) => {
            setDraft((current) => ({ ...current, [key]: value }));
            setErrors((current) => {
              if (!current.bloodPressure && !current[key]) return current;
              const next = { ...current };
              delete next[key];
              delete next.bloodPressure;
              return next;
            });
          }}
        />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Urine protein" optional>
            <Select value={urineProtein} options={LEVELS} onValueChange={(value) => setUrineProtein(value as typeof urineProtein)} />
          </Field>
          <Field label="Urine glucose" optional>
            <Select value={urineGlucose} options={LEVELS} onValueChange={(value) => setUrineGlucose(value as typeof urineGlucose)} />
          </Field>
          <Field label="Oedema" optional>
            <Select
              value={oedema}
              options={[
                { value: 'NONE', label: 'None' },
                { value: 'MILD', label: 'Mild' },
                { value: 'SEVERE', label: 'Severe' },
              ]}
              onValueChange={(value) => setOedema(value as typeof oedema)}
            />
          </Field>
          <Field label="Presentation" optional hint={ga.valid && ga.weeks < 32 ? 'Not usually assessed before 32 weeks.' : undefined}>
            <Select
              value={presentation}
              options={[
                { value: 'UNDETERMINED', label: 'Not assessed' },
                { value: 'VERTEX', label: 'Vertex' },
                { value: 'BREECH', label: 'Breech' },
                { value: 'TRANSVERSE', label: 'Transverse' },
              ]}
              onValueChange={(value) => setPresentation(value as typeof presentation)}
            />
          </Field>
          <Field label="Height" optional error={errors.heightCm}>
            <TextInput inputMode="decimal" value={heightCm} onValueChange={setHeightCm} invalid={Boolean(errors.heightCm)} placeholder="cm" />
          </Field>
          <Field label="Blood glucose" optional error={errors.bloodGlucoseMmoll}>
            <TextInput inputMode="decimal" value={bloodGlucose} onValueChange={setBloodGlucose} invalid={Boolean(errors.bloodGlucoseMmoll)} placeholder="mmol/L" />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Danger-sign screening" description="All thirteen plus “other”. Mark “None reported” when nothing was reported — a positive answer, not an empty field.">
        <DangerSignPicker
          selected={dangerSigns}
          otherNote={otherNote}
          noneReported={noneReported}
          onOtherNote={setOtherNote}
          onNoneReported={(next) => {
            setNoneReported(next);
            if (next) setErrors((current) => ({ ...current, dangerSigns: '' }));
          }}
          onToggle={(key) => {
            setErrors((current) => {
              const next = { ...current };
              delete next.dangerSigns;
              return next;
            });
            setDangerSigns((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
          }}
        />
        {errors.dangerSigns ? <p className="field-error">{errors.dangerSigns}</p> : null}
        {errors.otherDangerSignNote ? <p className="field-error">{errors.otherDangerSignNote}</p> : null}
        {dangerSigns.length > 0 ? (
          <NoticeState tone="warning" title="Reporting a sign raises an alert for assessment">
            <span className="flex items-start gap-2">
              <Activity className="mt-0.5 size-4 shrink-0" aria-hidden />
              <span>
                The alert states which signs were reported and that immediate clinical assessment is required. It does not name a condition.
                {ga.valid && ga.weeks >= 24 && dangerSigns.includes('REDUCED_FETAL_MOVEMENT') ? ' Reduced movement after 24 weeks is a red criterion in this configuration.' : ''}
              </span>
            </span>
          </NoticeState>
        ) : null}
      </FormSection>

      <FormSection title="Investigations" description="Record what was sent and what came back. Results can be added later from the tests tab.">
        <TestListEditor
          tests={tests}
          onChange={setTests}
          documentedBy={actor?.uid ?? ''}
        />
      </FormSection>

      <FormSection title="Counselling, notes and plan">
        <Field label="Counselling given" optional hint="Select the topics covered at this contact.">
          <div className="flex flex-wrap gap-2">
            {COUNSELLING_TOPICS.map((topic) => {
              const active = counselling.includes(topic);
              return (
                <button
                  key={topic}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCounselling((current) => (current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]))}
                  className={`chip ${active ? 'chip-active' : ''}`}
                >
                  {topic}
                </button>
              );
            })}
          </div>
        </Field>
        <Field label="Clinical note" optional error={errors.note} hint="Findings, assessment and the plan. Free text is stored on the record, never published.">
          <TextArea rows={4} value={note} onValueChange={setNote} invalid={Boolean(errors.note)} placeholder="BP 148/96 repeat at 15 minutes — 142/92. Headache settling. Repeat urine dip positive for protein; review within one week, iron continued." />
        </Field>
        <p className="caption flex items-start gap-2">
          <ClipboardSignature className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
          Saving attributes this entry to <span className="font-semibold text-ink-700">{actor?.displayName ?? actor?.email}</span> at{' '}
          <span className="font-semibold text-ink-700">{actor?.facilityId ? 'your facility' : 'the record’s facility'}</span>, and writes an
          audit entry.{' '}
          {mother ? (
            <Link to={`/app/mothers/${mother.id}`} className="font-semibold text-brand-800 hover:underline">
              Open the record
            </Link>
          ) : null}
        </p>
      </FormSection>
    </FormDialog>
  );
}

function TestListEditor({ tests, onChange, documentedBy }: { tests: TestResult[]; onChange: (rows: TestResult[]) => void; documentedBy: string }) {
  const add = () =>
    onChange([
      ...tests,
      { id: `t_${Date.now().toString(36)}`, panel: 'OTHER', name: '', value: '', unit: null, collectedAt: toIsoDate(new Date()), resultAt: null, flagged: false, documentedBy },
    ]);

  return (
    <div className="space-y-2">
      {tests.length === 0 ? (
        <p className="muted rounded-lg border border-dashed border-ink-200 px-3 py-3">No investigation recorded at this contact.</p>
      ) : (
        <ul className="space-y-2">
          {tests.map((test, index) => (
            <li key={test.id} className="grid items-end gap-2 rounded-lg border border-ink-200 p-2.5 sm:grid-cols-[1.4fr_0.8fr_0.7fr_0.7fr_auto]">
              <Field label={index === 0 ? 'Test' : ' '}>
                <TextInput value={test.name} onValueChange={(name) => onChange(tests.map((row, i) => (i === index ? { ...row, name } : row)))} placeholder="Haemoglobin" />
              </Field>
              <Field label={index === 0 ? 'Result' : ' '}>
                <TextInput value={test.value ?? ''} onValueChange={(value) => onChange(tests.map((row, i) => (i === index ? { ...row, value } : row)))} placeholder="11.4" />
              </Field>
              <Field label={index === 0 ? 'Unit' : ' '}>
                <TextInput value={test.unit ?? ''} onValueChange={(unit) => onChange(tests.map((row, i) => (i === index ? { ...row, unit } : row)))} placeholder="g/dL" />
              </Field>
              <Field label={index === 0 ? 'Panel' : ' '}>
                <Select
                  value={test.panel}
                  options={['ROUTINE', 'INFECTION', 'METABOLIC', 'IMAGING', 'OTHER'].map((value) => ({ value, label: value.charAt(0) + value.slice(1).toLowerCase() }))}
                  onValueChange={(panel) => onChange(tests.map((row, i) => (i === index ? { ...row, panel: panel as TestResult['panel'] } : row)))}
                />
              </Field>
              <button
                type="button"
                onClick={() => onChange(tests.filter((_, i) => i !== index))}
                className="mb-1 rounded-lg p-2 text-ink-400 hover:bg-[var(--color-risk-red-soft)] hover:text-[var(--color-risk-red-text)]"
                aria-label={`Remove ${test.name || 'test'}`}
              >
                <AlertTriangle className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={add} className="btn btn-secondary btn-sm">
        <Plus className="size-4" aria-hidden />
        Add investigation
      </button>
    </div>
  );
}

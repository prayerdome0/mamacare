/**
 * Structured ANC observations.
 *
 * The form is data-driven from the shared rule definition so a field can never
 * drift out of sync with the thresholds that evaluate it. Ranges shown next to a
 * field are the configured rule thresholds — not reference ranges, and never a
 * diagnosis.
 */

import { useMemo } from 'react';
import { Activity, Droplet, Gauge, Scale, Thermometer } from 'lucide-react';
import { Field, NumberField, TextInput } from '@/components/ui/form';
import { Badge } from '@/components/ui/display';
import { cn } from '@/lib/utils';
import { DANGER_SIGNS, DANGER_SIGN_LABELS } from '@/types/domain';
import { DEFAULT_ALERT_RULES } from '@/services/clinical/rules';
import type { DangerSignKey, RuleCondition, RuleGroup, Vitals } from '@/types/domain';

export interface ObservationDraft {
  systolicBp: string;
  diastolicBp: string;
  pulse: string;
  temperatureC: string;
  respiratoryRate: string;
  weightKg: string;
  muacCm: string;
  fundalHeightCm: string;
  fetalHeartRate: string;
  haemoglobinGdl: string;
}

export const EMPTY_OBSERVATIONS: ObservationDraft = {
  systolicBp: '',
  diastolicBp: '',
  pulse: '',
  temperatureC: '',
  respiratoryRate: '',
  weightKg: '',
  muacCm: '',
  fundalHeightCm: '',
  fetalHeartRate: '',
  haemoglobinGdl: '',
};

/**
 * Live threshold feedback.
 *
 * For each numeric field we flatten the configured rules and report which
 * threshold the current value matches. This is deliberately worded as "matches a
 * threshold in rule X" rather than "you will raise alert Y": a rule may require
 * several conditions together, so only the saved evaluation — which uses the full
 * rule engine — decides whether an alert is raised.
 */
export interface FieldGuidance {
  level: 'RED' | 'AMBER';
  ruleLabel: string;
  message: string;
  action: string;
}

const flattenConditions = (group: RuleGroup): RuleCondition[] =>
  group.conditions.flatMap((entry) => ('conditions' in entry ? flattenConditions(entry) : [entry]));

export function useFieldGuidance(draft: ObservationDraft): Partial<Record<keyof ObservationDraft, FieldGuidance>> {
  return useMemo(() => {
    const guidance: Partial<Record<keyof ObservationDraft, FieldGuidance>> = {};
    for (const rule of DEFAULT_ALERT_RULES) {
      if (!rule.enabled) continue;
      for (const condition of flattenConditions(rule.criteria)) {
        const key = ruleLabelToField(condition.field);
        if (!key) continue;
        const raw = draft[key];
        if (raw === '' || raw === undefined) continue;
        if (typeof condition.value === 'boolean' || typeof condition.value === 'string' && !/^-?\d+(\.\d+)?$/.test(condition.value)) continue;
        const value = Number(raw);
        const threshold = Number(condition.value);
        if (!Number.isFinite(value) || !Number.isFinite(threshold)) continue;
        const hit =
          (condition.op === 'gte' && value >= threshold) ||
          (condition.op === 'gt' && value > threshold) ||
          (condition.op === 'lte' && value <= threshold) ||
          (condition.op === 'lt' && value < threshold) ||
          (condition.op === 'eq' && value === threshold);
        if (!hit) continue;
        const current = guidance[key];
        if (!current || (current.level !== 'RED' && rule.level === 'RED')) {
          guidance[key] = { level: rule.level, ruleLabel: rule.label, message: rule.message, action: rule.recommendedAction };
        }
      }
    }
    return guidance;
  }, [draft]);
}

const FIELD_ALIASES: Record<string, keyof ObservationDraft> = {
  systolicBp: 'systolicBp',
  diastolicBp: 'diastolicBp',
  pulse: 'pulse',
  temperatureC: 'temperatureC',
  respiratoryRate: 'respiratoryRate',
  weightKg: 'weightKg',
  muacCm: 'muacCm',
  fundalHeightCm: 'fundalHeightCm',
  fetalHeartRate: 'fetalHeartRate',
  haemoglobinGdl: 'haemoglobinGdl',
};

function ruleLabelToField(field: string): keyof ObservationDraft {
  return FIELD_ALIASES[field] ?? 'systolicBp';
}

export function toVitals(draft: ObservationDraft): Vitals {
  const num = (value: string): number | null => {
    const parsed = Number(value);
    return value.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
  };
  return {
    systolicBp: num(draft.systolicBp),
    diastolicBp: num(draft.diastolicBp),
    pulse: num(draft.pulse),
    temperatureC: num(draft.temperatureC),
    respiratoryRate: num(draft.respiratoryRate),
    weightKg: num(draft.weightKg),
    muacCm: num(draft.muacCm),
    fundalHeightCm: num(draft.fundalHeightCm),
    fetalHeartRate: num(draft.fetalHeartRate),
    haemoglobinGdl: num(draft.haemoglobinGdl),
  };
}

export function draftFromValues(values?: Partial<Vitals> | null): ObservationDraft {
  if (!values) return EMPTY_OBSERVATIONS;
  const str = (value: number | null | undefined): string => (value === null || value === undefined ? '' : String(value));
  return {
    systolicBp: str(values.systolicBp),
    diastolicBp: str(values.diastolicBp),
    pulse: str(values.pulse),
    temperatureC: str(values.temperatureC),
    respiratoryRate: str(values.respiratoryRate),
    weightKg: str(values.weightKg),
    muacCm: str(values.muacCm),
    fundalHeightCm: str(values.fundalHeightCm),
    fetalHeartRate: str(values.fetalHeartRate),
    haemoglobinGdl: str(values.haemoglobinGdl),
  };
}

export function ObservationGrid({
  draft,
  onChange,
  errors = {},
  previousWeight,
  previousFundalHeight,
  gestationalWeeks,
  disabled,
}: {
  draft: ObservationDraft;
  onChange: (key: keyof ObservationDraft, value: string) => void;
  errors?: Record<string, string | undefined>;
  previousWeight?: number | null;
  previousFundalHeight?: number | null;
  gestationalWeeks?: number | null;
  disabled?: boolean;
}) {
  const guidance = useFieldGuidance(draft);

  const weightDelta = useMemo(() => {
    const current = Number(draft.weightKg);
    if (!previousWeight || !Number.isFinite(current) || draft.weightKg === '') return null;
    return Math.round((current - previousWeight) * 10) / 10;
  }, [draft.weightKg, previousWeight]);

  const fundalDelta = useMemo(() => {
    const current = Number(draft.fundalHeightCm);
    if (!previousFundalHeight || !Number.isFinite(current) || draft.fundalHeightCm === '') return null;
    return Math.round((current - previousFundalHeight) * 10) / 10;
  }, [draft.fundalHeightCm, previousFundalHeight]);

  const field = (key: keyof ObservationDraft, props: { label: string; unit: string; min: number; max: number; icon?: React.ReactNode; hint?: React.ReactNode }) => (
    <div className="relative">
      <NumberField
        label={props.label}
        value={draft[key]}
        onValueChange={(value) => onChange(key, value)}
        unit={props.unit}
        min={props.min}
        max={props.max}
        step={key === 'temperatureC' || key === 'weightKg' || key === 'muacCm' || key === 'haemoglobinGdl' ? 0.1 : 1}
        error={errors[key]}
        hint={props.hint}
        disabled={disabled}
      />
      {guidance[key] ? (
        <div
          className={cn(
            'mt-1.5 flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-[0.72rem] leading-snug',
            guidance[key]!.level === 'RED'
              ? 'border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] text-[var(--color-risk-red-text)]'
              : 'border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)] text-[var(--color-risk-amber-text)]',
          )}
          role="status"
        >
          <Activity className="mt-px size-3 shrink-0" aria-hidden />
          <span>
            <strong className="font-semibold">
              Matches the {guidance[key]!.level.toLowerCase()} threshold for {guidance[key]!.ruleLabel}.
            </strong>{' '}
            {guidance[key]!.message}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <Gauge className="size-4 text-brand-700" aria-hidden />
          <h4 className="text-[0.82rem] font-semibold tracking-wide text-ink-700 uppercase">Blood pressure and pulse</h4>
          <span className="micro text-ink-400">seated, after 5 minutes rest</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {field('systolicBp', { label: 'Systolic', unit: 'mmHg', min: 50, max: 260 })}
          {field('diastolicBp', { label: 'Diastolic', unit: 'mmHg', min: 30, max: 180 })}
          {field('pulse', { label: 'Pulse rate', unit: 'bpm', min: 30, max: 220 })}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <Thermometer className="size-4 text-brand-700" aria-hidden />
          <h4 className="text-[0.82rem] font-semibold tracking-wide text-ink-700 uppercase">Temperature and breathing</h4>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {field('temperatureC', { label: 'Temperature', unit: '°C', min: 32, max: 43 })}
          {field('respiratoryRate', { label: 'Respiratory rate', unit: '/min', min: 6, max: 60 })}
          {field('haemoglobinGdl', { label: 'Haemoglobin', unit: 'g/dL', min: 2, max: 20, icon: <Droplet className="size-4" aria-hidden /> })}
          {field('muacCm', { label: 'MUAC', unit: 'cm', min: 12, max: 40 })}
        </div>
      </div>

      <div>
        <div className="mb-2.5 flex items-center gap-2">
          <Scale className="size-4 text-brand-700" aria-hidden />
          <h4 className="text-[0.82rem] font-semibold tracking-wide text-ink-700 uppercase">Weight, fundal height and fetal heart</h4>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {field('weightKg', {
            label: 'Weight',
            unit: 'kg',
            min: 25,
            max: 200,
            hint:
              weightDelta !== null ? (
                <span className={cn(weightDelta > 1.5 && 'font-semibold text-[var(--color-risk-amber-text)]')}>
                  {weightDelta >= 0 ? '+' : ''}
                  {weightDelta} kg since the previous recorded visit
                </span>
              ) : previousWeight ? (
                `Previous recorded weight ${previousWeight} kg`
              ) : (
                'No previous weight on this record'
              ),
          })}
          {field('fundalHeightCm', {
            label: 'Fundal height',
            unit: 'cm',
            min: 0,
            max: 60,
            hint:
              gestationalWeeks && gestationalWeeks < 18
                ? 'Not usually measurable before 18–20 weeks'
                : fundalDelta !== null
                  ? `${fundalDelta >= 0 ? '+' : ''}${fundalDelta} cm since last measurement`
                  : previousFundalHeight
                    ? `Previous measurement ${previousFundalHeight} cm`
                    : undefined,
          })}
          {field('fetalHeartRate', {
            label: 'Fetal heart rate',
            unit: 'bpm',
            min: 60,
            max: 220,
            hint: gestationalWeeks && gestationalWeeks < 20 ? 'Usually audible from about 18–20 weeks' : undefined,
          })}
        </div>
      </div>
    </div>
  );
}

const DANGER_SIGN_META: Record<DangerSignKey, { label: string; guidance: string }> = {
  VAGINAL_BLEEDING: { label: DANGER_SIGN_LABELS.VAGINAL_BLEEDING, guidance: 'Any bleeding after 20 weeks needs same-day assessment.' },
  SEVERE_ABDOMINAL_PAIN: { label: DANGER_SIGN_LABELS.SEVERE_ABDOMINAL_PAIN, guidance: 'Persistent pain, especially with fever or bleeding.' },
  SEVERE_HEADACHE: { label: DANGER_SIGN_LABELS.SEVERE_HEADACHE, guidance: 'Headache that does not settle with rest or paracetamol.' },
  VISUAL_DISTURBANCE: { label: DANGER_SIGN_LABELS.VISUAL_DISTURBANCE, guidance: 'Blurring, spots or loss of vision.' },
  CONVULSIONS: { label: DANGER_SIGN_LABELS.CONVULSIONS, guidance: 'Fit or seizure — emergency, do not wait.' },
  DIFFICULTY_BREATHING: { label: DANGER_SIGN_LABELS.DIFFICULTY_BREATHING, guidance: 'Breathlessness at rest or unable to speak in sentences.' },
  FEVER: { label: DANGER_SIGN_LABELS.FEVER, guidance: 'Temperature ≥ 38 °C or feeling hot and shivering.' },
  SEVERE_VOMITING: { label: DANGER_SIGN_LABELS.SEVERE_VOMITING, guidance: 'Unable to keep fluids down for more than 12 hours.' },
  REDUCED_FETAL_MOVEMENT: { label: DANGER_SIGN_LABELS.REDUCED_FETAL_MOVEMENT, guidance: 'Fewer movements than usual, or none, after 24 weeks.' },
  FLUID_LEAKAGE: { label: DANGER_SIGN_LABELS.FLUID_LEAKAGE, guidance: 'Water breaking before contractions start.' },
  SWELLING_FACE_HANDS: { label: DANGER_SIGN_LABELS.SWELLING_FACE_HANDS, guidance: 'Sudden swelling of the face, hands or feet.' },
  CORD_PROLAPSE: { label: DANGER_SIGN_LABELS.CORD_PROLAPSE, guidance: 'Cord felt or visible — emergency, do not wait.' },
  OTHER_CONCERN: { label: DANGER_SIGN_LABELS.OTHER_CONCERN, guidance: 'Anything else the mother describes as worrying.' },
};

export function DangerSignPicker({
  selected,
  otherNote,
  noneReported,
  onToggle,
  onOtherNote,
  onNoneReported,
  disabled,
}: {
  selected: DangerSignKey[];
  otherNote: string;
  noneReported: boolean;
  onToggle: (key: DangerSignKey) => void;
  onOtherNote: (value: string) => void;
  onNoneReported: (value: boolean) => void;
  disabled?: boolean;
}) {
  const otherSelected = selected.includes('OTHER_CONCERN');
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onNoneReported(!noneReported)}
          aria-pressed={noneReported}
          className={cn('chip', noneReported && 'chip-active')}
        >
          {noneReported ? <Badge tone="green" className="border-0 bg-white/15 text-white">None reported</Badge> : 'No danger signs reported'}
        </button>
        <span className="micro text-ink-400">{selected.length} of 13 flagged</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {DANGER_SIGNS.map((key) => {
          const sign = DANGER_SIGN_META[key] ?? { label: DANGER_SIGN_LABELS[key], guidance: '' };
          const active = selected.includes(key);
          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              onClick={() => onToggle(key)}
              aria-pressed={active}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border p-2.5 text-left transition-colors',
                active
                  ? 'border-[var(--color-risk-red)] bg-[var(--color-risk-red-soft)]'
                  : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-4 shrink-0 place-items-center rounded border',
                  active ? 'border-[var(--color-risk-red)] bg-[var(--color-risk-red)]' : 'border-ink-300 bg-white',
                )}
                aria-hidden
              >
                {active ? <span className="size-1.5 rounded-[1px] bg-white" /> : null}
              </span>
              <span className="min-w-0">
                <span className={cn('block text-[0.84rem] font-semibold', active ? 'text-[var(--color-risk-red-text)]' : 'text-ink-800')}>{sign.label}</span>
                <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-500">{sign.guidance}</span>
              </span>
            </button>
          );
        })}
      </div>

      {otherSelected ? (
        <Field
          label="Describe the other concern"
          error={otherNote.trim().length < 4 ? 'Add a short description for the clinical record.' : null}
          hint="Stored on the visit record only — never shown on a public page."
        >
          <TextInput value={otherNote} onValueChange={onOtherNote} placeholder="e.g. painless vaginal bleeding noticed this morning" disabled={disabled} />
        </Field>
      ) : null}
    </div>
  );
}

import type { AlertRule, RiskLevel, Vitals } from '@/types/domain';

/**
 * Default clinical alert rules.
 *
 * These are *screening* rules, expressed as data so that a health authority can
 * review and change thresholds without touching application code. Output wording
 * is deliberately non-diagnostic: a rule reports that a finding was recorded and
 * that assessment is required — it never names a condition the patient has.
 *
 * ⚠ Before any real-world deployment these thresholds must be reviewed and
 * approved by qualified maternal-health professionals and the relevant authority
 * (see docs/CLINICAL-VALIDATION.md).
 */

export const RULES_VERSION = 3;

export const RED_MESSAGE_SUFFIX = 'Potential danger sign. Immediate clinical assessment required.';
export const AMBER_MESSAGE_SUFFIX = 'Concerning finding. Clinical review and follow-up required.';

const rule = (
  partial: Omit<AlertRule, 'id' | 'version' | 'enabled' | 'updatedAt' | 'updatedBy'> & { id?: string },
): AlertRule => ({
  id: partial.id ?? partial.key,
  enabled: true,
  version: RULES_VERSION,
  updatedAt: '2026-01-01T00:00:00.000Z',
  updatedBy: 'system',
  ...partial,
});

export const DEFAULT_ALERT_RULES: AlertRule[] = [
  /* ── RED: findings that require immediate assessment ───────────────── */
  rule({
    key: 'severe_hypertension',
    label: 'Severe hypertension',
    level: 'RED',
    category: 'BLOOD_PRESSURE',
    message: `Blood pressure in the severe range was recorded. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess immediately, repeat the measurement, and follow the facility protocol for urgent review.',
    criteria: {
      logic: 'any',
      conditions: [
        { field: 'systolicBp', op: 'gte', value: 160, unit: 'mmHg' },
        { field: 'diastolicBp', op: 'gte', value: 110, unit: 'mmHg' },
      ],
    },
  }),
  rule({
    key: 'hypertension_with_proteinuria',
    label: 'High blood pressure with protein in urine',
    level: 'RED',
    category: 'BLOOD_PRESSURE',
    message: `Raised blood pressure with protein detected in urine. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Urgent clinical assessment and review of blood pressure and urine findings together.',
    criteria: {
      logic: 'all',
      conditions: [
        {
          logic: 'any',
          conditions: [
            { field: 'systolicBp', op: 'gte', value: 140, unit: 'mmHg' },
            { field: 'diastolicBp', op: 'gte', value: 90, unit: 'mmHg' },
          ],
        },
        { field: 'urineProtein', op: 'in', value: ['PLUS_2', 'PLUS_3'] },
      ],
    },
  }),
  rule({
    key: 'convulsions',
    label: 'Convulsions or fits reported',
    level: 'RED',
    category: 'DANGER_SIGN',
    message: `Convulsions were reported at this visit. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Emergency assessment and referral preparation without delay.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'CONVULSIONS' }] },
  }),
  rule({
    key: 'vaginal_bleeding',
    label: 'Vaginal bleeding',
    level: 'RED',
    category: 'DANGER_SIGN',
    message: `Vaginal bleeding was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Immediate assessment; avoid vaginal examination until placenta is considered, per protocol.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'VAGINAL_BLEEDING' }] },
  }),
  rule({
    key: 'reduced_fetal_movement',
    label: 'Reduced or absent fetal movement after viability',
    level: 'RED',
    category: 'FETAL',
    message: `Reduced or absent fetal movement was reported from ${'24'} weeks. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Auscultate fetal heart, assess fetal wellbeing, and follow the facility pathway.',
    criteria: {
      logic: 'all',
      conditions: [
        { field: 'dangerSign', op: 'includes', value: 'REDUCED_FETAL_MOVEMENT' },
        { field: 'gestationalWeeks', op: 'gte', value: 24, unit: 'weeks' },
      ],
    },
  }),
  rule({
    key: 'reduced_movement_previable',
    label: 'Reduced fetal movement before viability',
    level: 'AMBER',
    category: 'FETAL',
    message: `Reduced fetal movement reported before 24 weeks. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Document findings, counsel on kick counting from 24 weeks, and arrange earlier review.',
    criteria: {
      logic: 'all',
      conditions: [
        { field: 'dangerSign', op: 'includes', value: 'REDUCED_FETAL_MOVEMENT' },
        { field: 'gestationalWeeks', op: 'lt', value: 24, unit: 'weeks' },
      ],
    },
  }),
  rule({
    key: 'fluid_leakage',
    label: 'Fluid leakage / membranes ruptured',
    level: 'RED',
    category: 'DANGER_SIGN',
    message: `Fluid leakage was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess for rupture of membranes, monitor for infection and fetal distress, and follow the pathway.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'FLUID_LEAKAGE' }] },
  }),
  rule({
    key: 'breathing_difficulty',
    label: 'Difficulty breathing',
    level: 'RED',
    category: 'VITALS',
    message: `Difficulty breathing was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess immediately including respiratory rate and oxygen availability.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'DIFFICULTY_BREATHING' }] },
  }),
  rule({
    key: 'headache_with_visual_disturbance',
    label: 'Severe headache with visual disturbance',
    level: 'RED',
    category: 'DANGER_SIGN',
    message: `Severe headache together with visual disturbance was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Measure blood pressure and assess for hypertensive disease immediately.',
    criteria: {
      logic: 'all',
      conditions: [
        { field: 'dangerSign', op: 'includes', value: 'SEVERE_HEADACHE' },
        { field: 'dangerSign', op: 'includes', value: 'VISUAL_DISTURBANCE' },
      ],
    },
  }),
  rule({
    key: 'severe_abdominal_pain',
    label: 'Severe abdominal pain',
    level: 'RED',
    category: 'DANGER_SIGN',
    message: `Severe abdominal pain was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Immediate assessment for maternal and fetal condition.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'SEVERE_ABDOMINAL_PAIN' }] },
  }),
  rule({
    key: 'cord_prolapse',
    label: 'Cord prolapse',
    level: 'RED',
    category: 'FETAL',
    message: `Cord prolapse was reported. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Obstetric emergency — initiate the facility emergency protocol immediately.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'CORD_PROLAPSE' }] },
  }),
  rule({
    key: 'bradycardia_or_tachycardia',
    label: 'Abnormal maternal pulse',
    level: 'AMBER',
    category: 'VITALS',
    message: `Maternal pulse outside the expected range. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Repeat the measurement and assess for infection, anaemia or distress.',
    criteria: {
      logic: 'any',
      conditions: [
        { field: 'pulse', op: 'gte', value: 110, unit: 'bpm' },
        { field: 'pulse', op: 'lte', value: 50, unit: 'bpm' },
      ],
    },
  }),
  rule({
    key: 'high_fever',
    label: 'High temperature',
    level: 'RED',
    category: 'INFECTION',
    message: `Temperature of 39.0 °C or above was recorded. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess for sepsis and other infection sources immediately.',
    criteria: { logic: 'any', conditions: [{ field: 'temperatureC', op: 'gte', value: 39, unit: '°C' }] },
  }),
  rule({
    key: 'fetal_heart_abnormal',
    label: 'Abnormal fetal heart rate',
    level: 'RED',
    category: 'FETAL',
    message: `Fetal heart rate outside the expected range. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Re-assess fetal heart rate and arrange urgent obstetric review.',
    criteria: {
      logic: 'any',
      conditions: [
        { field: 'fetalHeartRate', op: 'lt', value: 100, unit: 'bpm' },
        { field: 'fetalHeartRate', op: 'gt', value: 180, unit: 'bpm' },
      ],
    },
  }),
  rule({
    key: 'severe_anaemia',
    label: 'Severely low haemoglobin',
    level: 'RED',
    category: 'LABORATORY',
    message: `Haemoglobin below 7 g/dL was recorded. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Urgent clinical review and management per the anaemia/transfusion pathway.',
    criteria: { logic: 'any', conditions: [{ field: 'haemoglobinGdl', op: 'lt', value: 7, unit: 'g/dL' }] },
  }),
  rule({
    key: 'severe_malnutrition',
    label: 'Very low MUAC',
    level: 'RED',
    category: 'NUTRITION',
    message: `MUAC below 21 cm was recorded. ${RED_MESSAGE_SUFFIX}`,
    recommendedAction: 'Refer for nutrition assessment and therapeutic support today.',
    criteria: { logic: 'any', conditions: [{ field: 'muacCm', op: 'lt', value: 21, unit: 'cm' }] },
  }),

  /* ── AMBER: findings requiring review or follow-up ─────────────────── */
  rule({
    key: 'moderate_hypertension',
    label: 'Elevated blood pressure',
    level: 'AMBER',
    category: 'BLOOD_PRESSURE',
    message: `Blood pressure in the elevated range was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Repeat after 15 minutes, document, and arrange earlier review.',
    criteria: {
      logic: 'all',
      conditions: [
        {
          logic: 'any',
          conditions: [
            { field: 'systolicBp', op: 'gte', value: 140, unit: 'mmHg' },
            { field: 'diastolicBp', op: 'gte', value: 90, unit: 'mmHg' },
          ],
        },
        { field: 'systolicBp', op: 'lt', value: 160, unit: 'mmHg' },
        { field: 'diastolicBp', op: 'lt', value: 110, unit: 'mmHg' },
      ],
    },
  }),
  rule({
    key: 'proteinuria',
    label: 'Protein detected in urine',
    level: 'AMBER',
    category: 'LABORATORY',
    message: `Protein detected on urine dipstick. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Check blood pressure and repeat testing; document symptoms.',
    criteria: { logic: 'any', conditions: [{ field: 'urineProtein', op: 'in', value: ['TRACE', 'PLUS_1', 'PLUS_2', 'PLUS_3'] }] },
  }),
  rule({
    key: 'fast_breathing',
    label: 'Raised respiratory rate',
    level: 'AMBER',
    category: 'VITALS',
    message: `Respiratory rate above 24 breaths per minute. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess for respiratory infection, anaemia or pre-eclampsia with pulmonary oedema.',
    criteria: { logic: 'any', conditions: [{ field: 'respiratoryRate', op: 'gte', value: 24, unit: '/min' }] },
  }),
  rule({
    key: 'fever',
    label: 'Fever',
    level: 'AMBER',
    category: 'INFECTION',
    message: `Temperature of 38.0–38.9 °C was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess for infection including malaria and urinary causes per local protocol.',
    criteria: { logic: 'all', conditions: [{ field: 'temperatureC', op: 'gte', value: 38, unit: '°C' }, { field: 'temperatureC', op: 'lt', value: 39, unit: '°C' }] },
  }),
  rule({
    key: 'anaemia',
    label: 'Low haemoglobin',
    level: 'AMBER',
    category: 'LABORATORY',
    message: `Haemoglobin between 7 and 10.9 g/dL was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Start or continue anaemia management and arrange re-check per protocol.',
    criteria: {
      logic: 'all',
      conditions: [
        { field: 'haemoglobinGdl', op: 'gte', value: 7, unit: 'g/dL' },
        { field: 'haemoglobinGdl', op: 'lt', value: 11, unit: 'g/dL' },
      ],
    },
  }),
  rule({
    key: 'low_muac',
    label: 'Low MUAC',
    level: 'AMBER',
    category: 'NUTRITION',
    message: `MUAC between 21 and 22.9 cm was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Refer to nutrition counselling and follow-up weighing.',
    criteria: {
      logic: 'all',
      conditions: [
        { field: 'muacCm', op: 'gte', value: 21, unit: 'cm' },
        { field: 'muacCm', op: 'lt', value: 23, unit: 'cm' },
      ],
    },
  }),
  rule({
    key: 'weight_loss',
    label: 'Weight loss between visits',
    level: 'AMBER',
    category: 'NUTRITION',
    message: `Weight was lower than at the previous visit. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Review intake, assess for infection or hyperemesis, and arrange earlier follow-up.',
    criteria: { logic: 'all', conditions: [{ field: 'weightGainKg', op: 'lt', value: 0, unit: 'kg' }] },
  }),
  rule({
    key: 'fundal_height_lag',
    label: 'Fundal height below expected range',
    level: 'AMBER',
    category: 'FETAL',
    message: `Fundal height measured at least 3 cm below the gestational expectation. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Consider growth surveillance, refer for ultrasound where available.',
    criteria: { logic: 'all', conditions: [{ field: 'fundalHeightDeltaCm', op: 'lte', value: -3, unit: 'cm' }] },
  }),
  rule({
    key: 'severe_oedema',
    label: 'Severe oedema',
    level: 'AMBER',
    category: 'VITALS',
    message: `Severe oedema was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Check blood pressure and urine protein before deciding on follow-up.',
    criteria: { logic: 'any', conditions: [{ field: 'oedema', op: 'eq', value: 'SEVERE' }] },
  }),
  rule({
    key: 'swelling_face_hands',
    label: 'Sudden swelling of face or hands',
    level: 'AMBER',
    category: 'DANGER_SIGN',
    message: `Sudden swelling of the face or hands was reported. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Measure blood pressure and urine protein at this visit.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'SWELLING_FACE_HANDS' }] },
  }),
  rule({
    key: 'severe_vomiting',
    label: 'Severe vomiting',
    level: 'AMBER',
    category: 'VITALS',
    message: `Severe vomiting was reported. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess hydration and weight trend; review whether medication can be tolerated.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'SEVERE_VOMITING' }] },
  }),
  rule({
    key: 'headache_alone',
    label: 'Severe headache',
    level: 'AMBER',
    category: 'DANGER_SIGN',
    message: `Severe headache was reported. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Check blood pressure and visual symptoms before closing the visit.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'SEVERE_HEADACHE' }] },
  }),
  rule({
    key: 'visual_disturbance_alone',
    label: 'Visual disturbance',
    level: 'AMBER',
    category: 'DANGER_SIGN',
    message: `Visual disturbance was reported. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Check blood pressure and proteinuria; consider urgent review if persistent.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'VISUAL_DISTURBANCE' }] },
  }),
  rule({
    key: 'raised_glucose',
    label: 'Raised blood glucose',
    level: 'AMBER',
    category: 'LABORATORY',
    message: `Blood glucose above the screening threshold was recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Arrange diagnostic glucose testing per the local gestational diabetes pathway.',
    criteria: { logic: 'any', conditions: [{ field: 'bloodGlucoseMmoll', op: 'gte', value: 7.8, unit: 'mmol/L' }] },
  }),
  rule({
    key: 'post_term_risk',
    label: 'Beyond 41 weeks without a birth plan review',
    level: 'AMBER',
    category: 'RISK_PROFILE',
    message: `Pregnancy has reached 41 completed weeks. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Review the birth plan and arrange hospital assessment per protocol.',
    criteria: { logic: 'all', conditions: [{ field: 'gestationalWeeks', op: 'gte', value: 41, unit: 'weeks' }] },
  }),
  rule({
    key: 'previous_adverse_outcome',
    label: 'Previous adverse pregnancy outcome',
    level: 'AMBER',
    category: 'RISK_PROFILE',
    message: `A previous pregnancy complication is recorded on this history. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Confirm the enhanced surveillance plan and referral pathway for this pregnancy.',
    criteria: {
      logic: 'any',
      conditions: [
        { field: 'previousComplication', op: 'includes', value: 'PRE_ECLAMPSIA' },
        { field: 'previousComplication', op: 'includes', value: 'ECLAMPSIA' },
        { field: 'previousComplication', op: 'includes', value: 'PPH' },
        { field: 'previousComplication', op: 'includes', value: 'PRETERM_BIRTH' },
        { field: 'previousComplication', op: 'includes', value: 'STILLBIRTH' },
        { field: 'previousComplication', op: 'includes', value: 'OBSTRUCTED_LABOUR' },
        { field: 'previousComplication', op: 'includes', value: 'IUGR' },
      ],
    },
  }),
  rule({
    key: 'multiple_pregnancy',
    label: 'Multiple pregnancy',
    level: 'AMBER',
    category: 'RISK_PROFILE',
    message: `This pregnancy is recorded as a multiple pregnancy. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Confirm the increased ANC schedule and the planned place of birth.',
    criteria: { logic: 'any', conditions: [{ field: 'isMultiple', op: 'eq', value: true }] },
  }),
  rule({
    key: 'previous_cesarean',
    label: 'Previous caesarean section',
    level: 'AMBER',
    category: 'RISK_PROFILE',
    message: `A previous caesarean birth is recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Confirm place-of-birth plan and availability of surgical capacity at the time of labour.',
    criteria: { logic: 'any', conditions: [{ field: 'previousCesarean', op: 'eq', value: true }] },
  }),
  rule({
    key: 'extreme_maternal_age',
    label: 'Maternal age outside the usual range',
    level: 'AMBER',
    category: 'RISK_PROFILE',
    message: `Maternal age below 18 or above 35 is recorded. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Confirm additional counselling and the referral pathway.',
    criteria: {
      logic: 'any',
      conditions: [
        { field: 'ageYears', op: 'lt', value: 18, unit: 'years' },
        { field: 'ageYears', op: 'gt', value: 35, unit: 'years' },
      ],
    },
  }),
  rule({
    key: 'danger_sign_other',
    label: 'Other concerning symptom recorded',
    level: 'AMBER',
    category: 'DANGER_SIGN',
    message: `Another concerning symptom was described by the caregiver. ${AMBER_MESSAGE_SUFFIX}`,
    recommendedAction: 'Assess the described symptom and document the action taken.',
    criteria: { logic: 'any', conditions: [{ field: 'dangerSign', op: 'includes', value: 'OTHER_CONCERN' }] },
  }),
];

export const RULE_BY_KEY = new Map(DEFAULT_ALERT_RULES.map((r) => [r.key, r]));

/** Snapshot the evaluator consumes — built from a visit, never from free text. */
export interface ObservationSnapshot {
  vitals: Vitals;
  dangerSigns: string[];
  gestationalWeeks: number | null;
  ageYears: number | null;
  isMultiple: boolean;
  previousCesarean: boolean;
  previousComplications: string[];
  riskFactors: string[];
  weightPreviousKg?: number | null;
  fundalHeightExpectedCm?: number | null;
}

export function buildSnapshot(input: {
  vitals: Vitals;
  dangerSigns: string[];
  gestationalWeeks: number | null;
  ageYears: number | null;
  isMultiple?: boolean;
  previousCesarean?: boolean;
  previousComplications?: string[];
  riskFactors?: string[];
  weightPreviousKg?: number | null;
}): ObservationSnapshot {
  const fundal = input.vitals.fundalHeightCm ?? null;
  const expected = input.gestationalWeeks !== null && input.gestationalWeeks >= 18 ? input.gestationalWeeks : null;
  return {
    vitals: input.vitals,
    dangerSigns: input.dangerSigns,
    gestationalWeeks: input.gestationalWeeks,
    ageYears: input.ageYears,
    isMultiple: input.isMultiple ?? false,
    previousCesarean: input.previousCesarean ?? false,
    previousComplications: input.previousComplications ?? [],
    riskFactors: input.riskFactors ?? [],
    weightPreviousKg: input.weightPreviousKg ?? null,
    fundalHeightExpectedCm: fundal !== null && expected !== null ? expected : null,
  };
}

/** Numeric field resolution, including the two derived fields. */
export function numericField(snapshot: ObservationSnapshot, field: string): number | null {
  const v = snapshot.vitals as Record<string, unknown>;
  const direct = v[field];
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (field === 'weightGainKg') {
    const current = typeof v.weightKg === 'number' ? v.weightKg : null;
    const previous = snapshot.weightPreviousKg ?? null;
    return current !== null && previous !== null ? Math.round((current - previous) * 10) / 10 : null;
  }
  if (field === 'fundalHeightDeltaCm') {
    const fundal = typeof v.fundalHeightCm === 'number' ? v.fundalHeightCm : null;
    const expected = snapshot.fundalHeightExpectedCm ?? null;
    return fundal !== null && expected !== null ? fundal - expected : null;
  }
  if (field === 'gestationalWeeks') return snapshot.gestationalWeeks;
  if (field === 'ageYears') return snapshot.ageYears;
  return null;
}

export const riskLevelFor = (levels: RiskLevel[]): RiskLevel =>
  levels.includes('RED') ? 'RED' : levels.includes('AMBER') ? 'AMBER' : 'GREEN';

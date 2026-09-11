import type { AlertRule, ClinicalAlert, RiskLevel, RuleCondition, RuleGroup } from '@/types/domain';
import { DEFAULT_ALERT_RULES, buildSnapshot, numericField, riskLevelFor, type ObservationSnapshot } from './rules';

/**
 * Rule evaluator.
 *
 * Pure and synchronous so the same evaluation runs in the browser (offline
 * capture) and on the server (sync/merge), with identical results. A rule is
 * data (`AlertRule.criteria`) — this module only interprets the operators, so no
 * rule can execute code.
 *
 * Output is a *finding to be assessed*, never a diagnosis.
 */

export interface TriggeredFinding {
  label: string;
  value?: string | null;
  unit?: string | null;
}

export interface RuleEvaluation {
  rule: AlertRule;
  findings: TriggeredFinding[];
}

export interface EvaluationResult {
  level: RiskLevel;
  evaluations: RuleEvaluation[];
  /** Highest-severity finding, for list badges. */
  headline: string | null;
  summary: string;
}

const FIELD_LABELS: Record<string, string> = {
  systolicBp: 'Systolic blood pressure',
  diastolicBp: 'Diastolic blood pressure',
  pulse: 'Pulse',
  temperatureC: 'Temperature',
  respiratoryRate: 'Respiratory rate',
  weightKg: 'Weight',
  weightGainKg: 'Weight change since last visit',
  muacCm: 'MUAC',
  oedema: 'Oedema',
  fundalHeightCm: 'Fundal height',
  fundalHeightDeltaCm: 'Fundal height vs. gestational age',
  fetalHeartRate: 'Fetal heart rate',
  haemoglobinGdl: 'Haemoglobin',
  urineProtein: 'Urine protein',
  urineGlucose: 'Urine glucose',
  bloodGlucoseMmoll: 'Blood glucose',
  gestationalWeeks: 'Gestational age',
  ageYears: 'Maternal age',
  dangerSign: 'Reported symptom',
  riskFactor: 'Risk factor',
  previousComplication: 'Previous complication',
  isMultiple: 'Multiple pregnancy',
  previousCesarean: 'Previous caesarean',
  heightCm: 'Height',
};

export const fieldLabel = (field: string): string => FIELD_LABELS[field] ?? field.replace(/([A-Z])/g, ' $1').trim();

const OP_SYMBOL: Record<string, string> = {
  lt: '<',
  lte: '≤',
  gt: '>',
  gte: '≥',
  eq: '=',
  neq: '≠',
  in: 'one of',
  includes: 'reported',
};

const formatValue = (value: unknown): string => {
  if (Array.isArray(value)) return value.map((v) => String(v)).join(' or ');
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  return String(value ?? '—');
};

const listFor = (snapshot: ObservationSnapshot, field: string): string[] | null => {
  switch (field) {
    case 'dangerSign':
      return snapshot.dangerSigns;
    case 'riskFactor':
      return snapshot.riskFactors;
    case 'previousComplication':
      return snapshot.previousComplications;
    default:
      return null;
  }
};

const categorical = (snapshot: ObservationSnapshot, field: string): string | boolean | null => {
  const vitals = snapshot.vitals as Record<string, unknown>;
  if (field in vitals) {
    const value = vitals[field];
    if (typeof value === 'string' || typeof value === 'boolean') return value;
    return null;
  }
  if (field === 'isMultiple') return snapshot.isMultiple;
  if (field === 'previousCesarean') return snapshot.previousCesarean;
  return null;
};

function evaluateCondition(condition: RuleCondition, snapshot: ObservationSnapshot): TriggeredFinding | null {
  const { field, op, value } = condition;
  const label = fieldLabel(field);

  const list = listFor(snapshot, field);
  if (list) {
    if (op === 'includes') {
      return list.includes(String(value)) ? { label, value: String(value) } : null;
    }
    if (op === 'in') {
      const hit = list.find((entry) => Array.isArray(value) && value.includes(entry));
      return hit ? { label, value: hit } : null;
    }
    if (op === 'eq') return list.length === Number(value) ? { label, value: String(list.length) } : null;
    return null;
  }

  const categoricalValue = categorical(snapshot, field);
  if (categoricalValue !== null && typeof categoricalValue !== 'number') {
    switch (op) {
      case 'eq':
        return String(categoricalValue) === String(value)
          ? { label, value: formatValue(categoricalValue) }
          : null;
      case 'neq':
        return String(categoricalValue) !== String(value)
          ? { label, value: formatValue(categoricalValue) }
          : null;
      case 'in':
        return Array.isArray(value) && value.includes(String(categoricalValue))
          ? { label, value: formatValue(categoricalValue) }
          : null;
      default:
        return null;
    }
  }

  const numeric = numericField(snapshot, field);
  if (numeric === null) return null;
  const threshold = Number(value);
  if (!Number.isFinite(threshold)) return null;

  const passed =
    op === 'lt' ? numeric < threshold
    : op === 'lte' ? numeric <= threshold
    : op === 'gt' ? numeric > threshold
    : op === 'gte' ? numeric >= threshold
    : op === 'eq' ? numeric === threshold
    : op === 'neq' ? numeric !== threshold
    : op === 'in' ? Array.isArray(value) && value.some((candidate) => Number(candidate) === numeric)
    : false;

  if (!passed) return null;
  return {
    label: `${label} ${OP_SYMBOL[op] ?? op} ${formatValue(value)}${'unit' in condition && condition.unit ? ` ${condition.unit}` : ''}`,
    value: String(numeric),
    unit: 'unit' in condition ? condition.unit ?? null : null,
  };
}

function evaluateGroup(group: RuleGroup, snapshot: ObservationSnapshot): TriggeredFinding[] | null {
  const findings: TriggeredFinding[] = [];
  let matched = group.logic === 'all';

  for (const node of group.conditions) {
    const isGroup = 'logic' in node;
    // A condition that does not match contributes nothing — and must not be
    // collected as a `null` finding, which would poison the de-duplication below.
    const nested: TriggeredFinding[] = isGroup
      ? evaluateGroup(node as RuleGroup, snapshot) ?? []
      : (() => {
          const finding = evaluateCondition(node as RuleCondition, snapshot);
          return finding ? [finding] : [];
        })();
    const hit = nested.length > 0;
    if (hit) findings.push(...nested);
    if (group.logic === 'all' && !hit) {
      matched = false;
      break;
    }
    if (group.logic === 'any' && hit) {
      matched = true;
      // keep collecting other findings for the audit trail, but the rule has fired
    }
  }

  if (!matched) return null;
  // De-duplicate identical findings for display.
  const seen = new Set<string>();
  return findings.filter((finding) => {
    const key = `${finding.label}|${finding.value ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** True when the rule has all the data it needs (avoids firing on empty visits). */
const hasEvidence = (group: RuleGroup, snapshot: ObservationSnapshot): boolean => {
  for (const node of group.conditions) {
    if ('logic' in node) {
      if (hasEvidence(node as RuleGroup, snapshot)) return true;
      continue;
    }
    const condition = node as RuleCondition;
    const list = listFor(snapshot, condition.field);
    if (list) {
      if (list.length > 0) return true;
      continue;
    }
    if (categorical(snapshot, condition.field) !== null) return true;
    if (numericField(snapshot, condition.field) !== null) return true;
  }
  return false;
};

export function evaluateRules(
  rules: AlertRule[] = DEFAULT_ALERT_RULES,
  snapshot: ObservationSnapshot,
): EvaluationResult {
  const enabled = rules.filter((candidate) => candidate.enabled);
  const evaluations: RuleEvaluation[] = [];

  for (const candidate of enabled) {
    if (!hasEvidence(candidate.criteria, snapshot)) continue;
    const findings = evaluateGroup(candidate.criteria, snapshot);
    if (findings && findings.length > 0) evaluations.push({ rule: candidate, findings });
  }

  const levels = evaluations.map((evaluation) => evaluation.rule.level as RiskLevel);
  const level = riskLevelFor(levels);
  const ordered = evaluations.sort((a, b) => (a.rule.level === b.rule.level ? 0 : a.rule.level === 'RED' ? -1 : 1));

  return {
    level,
    evaluations: ordered,
    headline: ordered[0]?.rule.label ?? null,
    summary:
      level === 'GREEN'
        ? 'No configured danger-sign or threshold was met at this visit.'
        : ordered.length === 1
          ? `1 clinical rule matched: ${ordered[0]?.rule.label.toLowerCase()}.`
          : `${ordered.length} clinical rules matched, including ${ordered
              .filter((e) => e.rule.level === 'RED')
              .map((e) => e.rule.label.toLowerCase())
              .join(', ')}.`,
  };
}

export interface AlertDraft {
  level: RiskLevel;
  category: ClinicalAlert['category'];
  title: string;
  message: string;
  ruleKey: string;
  ruleVersion: number;
  triggeredBy: TriggeredFinding[];
  recommendedAction: string;
}

/** Converts an evaluation into alert records to persist (one per fired rule). */
export function toAlertDrafts(result: EvaluationResult): AlertDraft[] {
  return result.evaluations.map(({ rule, findings }) => ({
    level: rule.level,
    category: rule.category,
    title: rule.label,
    message: rule.message,
    ruleKey: rule.key,
    ruleVersion: rule.version,
    triggeredBy: findings.map((finding) => ({ label: finding.label, value: finding.value ?? null, unit: finding.unit ?? null })),
    recommendedAction: rule.recommendedAction,
  }));
}

/**
 * Rules are only allowed to run once a qualified reviewer has signed them off;
 * unapproved rules still evaluate (so a facility can test them) but are labelled.
 */
export const rulesRequireSignOff = (rules: AlertRule[]): boolean =>
  rules.some((candidate) => !candidate.approvedBy);

export { DEFAULT_ALERT_RULES, buildSnapshot };
export type { ObservationSnapshot };

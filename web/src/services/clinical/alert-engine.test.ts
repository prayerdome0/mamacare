import { describe, expect, it } from 'vitest';
import { evaluateRules, rulesRequireSignOff, toAlertDrafts } from './alert-engine';
import { AMBER_MESSAGE_SUFFIX, DEFAULT_ALERT_RULES, RED_MESSAGE_SUFFIX, buildSnapshot } from './rules';
import type { AlertRule } from '@/types/domain';

/**
 * The alert engine is pure, so the whole clinical contract can be tested without a
 * database: thresholds come from rule rows, wording is never diagnostic, and a
 * disabled rule must not fire.
 */
const snapshot = (vitals: Parameters<typeof buildSnapshot>[0]['vitals'], extra: Partial<Parameters<typeof buildSnapshot>[0]> = {}) =>
  buildSnapshot({ vitals, dangerSigns: [], gestationalWeeks: 32, ageYears: 27, ...extra });

describe('alert engine', () => {
  it('raises RED for a severe blood-pressure reading', () => {
    const result = evaluateRules(DEFAULT_ALERT_RULES, snapshot({ systolicBp: 172, diastolicBp: 112 }));
    expect(result.level).toBe('RED');
    expect(result.evaluations.map((row) => row.rule.key)).toContain('severe_hypertension');
  });

  it('leaves a normal reading GREEN with no alerts to write', () => {
    const result = evaluateRules(DEFAULT_ALERT_RULES, snapshot({ systolicBp: 118, diastolicBp: 74, pulse: 78, temperatureC: 36.8 }));
    expect(result.level).toBe('GREEN');
    expect(result.evaluations).toHaveLength(0);
    expect(toAlertDrafts(result)).toHaveLength(0);
  });

  it('treats a reported danger sign as enough to require assessment', () => {
    const result = evaluateRules(
      DEFAULT_ALERT_RULES,
      snapshot({ systolicBp: 124, diastolicBp: 80 }, { dangerSigns: ['REDUCED_FETAL_MOVEMENT'] }),
    );
    expect(result.level).not.toBe('GREEN');
    expect(toAlertDrafts(result).length).toBeGreaterThan(0);
  });

  it('does not invent an alert from missing data', () => {
    const result = evaluateRules(DEFAULT_ALERT_RULES, snapshot({}));
    expect(result.level).toBe('GREEN');
    expect(result.evaluations).toHaveLength(0);
  });

  it('honours a configured threshold change instead of a hard-coded one', () => {
    const rule = DEFAULT_ALERT_RULES.find((candidate) => candidate.key === 'severe_hypertension')!;
    const relaxed: AlertRule = {
      ...rule,
      criteria: {
        ...rule.criteria,
        conditions: rule.criteria.conditions.map((condition) =>
          'field' in condition && condition.field === 'systolicBp' ? { ...condition, value: 190 } : condition,
        ),
      },
    };
    const rules = DEFAULT_ALERT_RULES.map((candidate) => (candidate.key === rule.key ? relaxed : candidate));
    const before = evaluateRules(DEFAULT_ALERT_RULES, snapshot({ systolicBp: 172, diastolicBp: 100 }));
    const after = evaluateRules(rules, snapshot({ systolicBp: 172, diastolicBp: 100 }));
    expect(before.evaluations.map((row) => row.rule.key)).toContain('severe_hypertension');
    expect(after.evaluations.map((row) => row.rule.key)).not.toContain('severe_hypertension');
  });

  it('stays silent when the rule is disabled', () => {
    const rules = DEFAULT_ALERT_RULES.map((rule) => ({ ...rule, enabled: false }));
    const result = evaluateRules(rules, snapshot({ systolicBp: 200, diastolicBp: 130 }));
    expect(result.level).toBe('GREEN');
  });

  it('never words an alert as a diagnosis', () => {
    const diagnostic = /\b(diagnos|you have|is caused by|means you)\b/i;
    for (const rule of DEFAULT_ALERT_RULES) {
      expect(rule.message, rule.key).not.toMatch(diagnostic);
      const suffix = rule.level === 'RED' ? RED_MESSAGE_SUFFIX : AMBER_MESSAGE_SUFFIX;
      expect(rule.message, rule.key).toContain(suffix);
      expect(rule.recommendedAction.length, rule.key).toBeGreaterThan(10);
    }
  });

  it('requires a clinical sign-off before the set is trusted', () => {
    expect(rulesRequireSignOff(DEFAULT_ALERT_RULES.map((rule) => ({ ...rule, approvedBy: null })))).toBe(true);
    expect(
      rulesRequireSignOff(
        DEFAULT_ALERT_RULES.map((rule) => ({ ...rule, approvedBy: 'Dr Test', approvedAt: new Date().toISOString() })),
      ),
    ).toBe(false);
  });

  it('orders RED findings ahead of AMBER ones', () => {
    const result = evaluateRules(DEFAULT_ALERT_RULES, snapshot({ systolicBp: 175, diastolicBp: 115, pulse: 130, temperatureC: 38.9 }));
    const levels = result.evaluations.map((row) => row.rule.level);
    expect(levels.indexOf('RED')).toBeLessThan(levels.indexOf('AMBER') === -1 ? levels.length : levels.indexOf('AMBER'));
    expect(result.level).toBe('RED');
  });
});

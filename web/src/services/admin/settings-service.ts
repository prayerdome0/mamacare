/**
 * System settings, clinical rule governance and facility administration.
 */

import { AppError } from '@/lib/errors';
import { services } from '@/services/session-store';
import { DEFAULT_ALERT_RULES } from '@/services/clinical/alert-engine';
import type { AlertRule, RiskLevel, SystemSettings } from '@/types/domain';

export interface SettingsView extends SystemSettings {
  storageMode: 'indexeddb' | 'session-memory' | 'firebase';
  provider: 'firebase' | 'local';
  pushConfigured: boolean;
  cloudinaryConfigured: boolean;
}

export async function loadSettings(): Promise<SettingsView> {
  const registry = services();
  const settings = await registry.data.settings();
  const { storageMode } = await import('@/services/data/local/store');
  return {
    ...settings,
    storageMode: registry.provider.kind === 'firebase' ? 'firebase' : storageMode(),
    provider: registry.provider.kind,
    pushConfigured: registry.provider.kind === 'firebase',
    cloudinaryConfigured: (await import('@/config/env')).integrations.cloudinary.configured,
  };
}

export async function saveSettings(patch: Partial<SystemSettings>): Promise<SettingsView> {
  const registry = services();
  if (registry.require().role !== 'ADMIN') throw new AppError('Only an administrator can change system settings.', 'FORBIDDEN');
  if (patch.patientIdPrefix && !/^[A-Z]{2,4}$/.test(patch.patientIdPrefix)) {
    throw new AppError('The patient ID prefix must be 2–4 uppercase letters, e.g. MC.', 'VALIDATION');
  }
  if (patch.reminderDaysDefault && patch.reminderDaysDefault.some((days) => days < 0 || days > 60)) {
    throw new AppError('Reminder lead times must be between 0 and 60 days.', 'VALIDATION');
  }
  await registry.data.saveSettings(patch);
  return loadSettings();
}

/**
 * Rule governance. Thresholds may be edited by an administrator, but a rule is
 * marked *pending clinical sign-off* whenever its criteria change — the app keeps
 * using it (facilities may run their own approved protocol) while making the
 * review state explicit on screen and in the report footer.
 */
export interface RuleView extends AlertRule {
  isDefault: boolean;
  needsSignOff: boolean;
}

export async function listRules(): Promise<RuleView[]> {
  const registry = services();
  const { rows } = await registry.data.list('alert_rules', { limit: 200 });
  const source = rows.length > 0 ? rows : DEFAULT_ALERT_RULES;
  return source
    .map((rule) => ({
      ...rule,
      isDefault: DEFAULT_ALERT_RULES.some((defaultRule) => defaultRule.key === rule.key && defaultRule.version === rule.version),
      needsSignOff: !rule.approvedBy || rule.approvedAt === null,
    }))
    .sort((a, b) => (a.level === b.level ? a.label.localeCompare(b.label) : a.level === 'RED' ? -1 : 1));
}

export async function saveRule(input: {
  key: string;
  label?: string;
  level?: Exclude<RiskLevel, 'GREEN'>;
  message?: string;
  recommendedAction?: string;
  enabled?: boolean;
  criteria?: AlertRule['criteria'];
  approve?: { by: string; note: string };
}): Promise<AlertRule> {
  const registry = services();
  const actor = registry.require();
  if (actor.role !== 'ADMIN') throw new AppError('Only an administrator can change clinical rules.', 'FORBIDDEN');

  const existing = await registry.data.list('alert_rules', { where: [{ field: 'key', op: '==', value: input.key }], limit: 1 });
  const current = existing.rows[0] ?? DEFAULT_ALERT_RULES.find((rule) => rule.key === input.key) ?? null;
  if (!current) throw new AppError('That rule does not exist.', 'NOT_FOUND');

  const criteriaChanged = input.criteria !== undefined || input.level !== undefined || input.message !== undefined;
  const patch: Partial<AlertRule> = {
    ...(input.label ? { label: input.label } : {}),
    ...(input.level ? { level: input.level } : {}),
    ...(input.message ? { message: input.message } : {}),
    ...(input.recommendedAction ? { recommendedAction: input.recommendedAction } : {}),
    ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
    ...(input.criteria ? { criteria: input.criteria } : {}),
    version: (current.version ?? 1) + (criteriaChanged ? 1 : 0),
    approvedBy: input.approve ? input.approve.by : criteriaChanged ? null : current.approvedBy ?? null,
    approvedAt: input.approve ? new Date().toISOString() : criteriaChanged ? null : current.approvedAt ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: actor.uid,
    notes: input.approve?.note ?? current.notes ?? null,
  };

  if (input.message && /you have|is diagnosed|diagnosis of/i.test(input.message)) {
    throw new AppError(
      'Rule wording must describe the recorded finding and the need for assessment. Do not state a diagnosis.',
      'VALIDATION',
    );
  }

  let saved: AlertRule;
  if (existing.rows[0]) {
    saved = await registry.data.update('alert_rules', existing.rows[0].id, patch as Partial<AlertRule>);
  } else {
    saved = (await registry.data.create('alert_rules', {
      ...current,
      ...patch,
      id: `rule_${current.key}`,
    })) as AlertRule;
  }
  await registry.data.audit('rule.updated', 'rule', saved.id, {
    label: saved.label,
    metadata: { key: saved.key, level: saved.level, enabled: saved.enabled, approved: Boolean(input.approve) },
  });
  return saved;
}

export async function resetRulesToDefaults(): Promise<{ restored: number }> {
  const registry = services();
  if (registry.require().role !== 'ADMIN') throw new AppError('Only an administrator can reset clinical rules.', 'FORBIDDEN');
  const { rows } = await registry.data.list('alert_rules', { limit: 200 });
  let restored = 0;
  for (const row of rows) {
    await registry.data.update('alert_rules', row.id, { enabled: true, approvedBy: null, approvedAt: null, updatedAt: new Date().toISOString() } as Partial<AlertRule>);
    restored += 1;
  }
  await registry.data.audit('rule.updated', 'rule', 'all', { metadata: { action: 'reset-to-shipped-defaults', count: restored } });
  return { restored };
}

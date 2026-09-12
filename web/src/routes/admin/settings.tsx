import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Database, RefreshCw, RotateCcw, Save, ShieldAlert, SlidersHorizontal } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { Field, Select, Switch, TextInput } from '@/components/ui/form';
import { Tabs, TabPanel } from '@/components/ui/tabs';
import { Modal } from '@/components/ui/overlay';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/components/ui/toast';
import { useConfirm, useSession } from '@/providers/app-providers';
import { loadSettings, listRules, resetRulesToDefaults, saveRule, saveSettings } from '@/services/admin/settings-service';
import { systemSettingsSchema } from '@/lib/validation';
import { integrations } from '@/config/env';
import { formatDate, toIsoDate } from '@/lib/utils';
import { RULES_VERSION } from '@/services/clinical/rules';
import { fieldLabel } from '@/services/clinical/alert-engine';
import type { RuleGroup, RuleOperator } from '@/types/domain';
import { PREFERRED_LANGUAGES, type RiskLevel } from '@/types/domain';
import type { AlertRule } from '@/types/domain';
import type { RuleView } from '@/services/admin/settings-service';

const REMINDER_OPTIONS = [14, 7, 3, 1];

/**
 * Administrator settings: the platform-wide switches, and the clinical rule set
 * that turns observations into alerts. Both are stored as data — the alert engine
 * reads these rows at evaluation time, so a change takes effect without a deploy.
 */
export default function AdminSettingsPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'rules' ? 'rules' : 'general';
  const setTab = (id: string) => {
    const next = new URLSearchParams(params);
    if (id === 'general') next.delete('tab');
    else next.set('tab', id);
    setParams(next, { replace: true });
  };

  return (
    <AppShell
      title="System settings"
      subtitle="Everything here is stored as data and takes effect on the next read — no rebuild."
      actions={
        <a href="/api/health" target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          <Database className="size-4" aria-hidden /> API health
        </a>
      }
    >
      <div className="mb-4">
        <Tabs
          ariaLabel="Settings sections"
          value={tab}
          onChange={setTab}
          items={[
            { id: 'general', label: 'General', icon: <SlidersHorizontal className="size-4" aria-hidden /> },
            { id: 'rules', label: 'Clinical rules', icon: <ShieldAlert className="size-4" aria-hidden /> },
          ]}
        />
      </div>

      <TabPanel id="general" active={tab === 'general'}>
        <GeneralSettings />
      </TabPanel>
      <TabPanel id="rules" active={tab === 'rules'}>
        <RulesSettings />
      </TabPanel>
    </AppShell>
  );
}

function GeneralSettings() {
  const toast = useToast();
  const { providerKind } = useSession();
  const settings = useAsync(() => loadSettings(), {});
  const view = settings.data;

  const form = useForm(systemSettingsSchema, {
    patientIdPrefix: 'MC',
    reminderDaysDefault: [7, 1],
    smsEnabled: false,
    pushEnabled: true,
    registrationRequiresApproval: true,
    allowPatientAccountSelfRegistration: true,
    defaultLanguage: 'English',
    dataRetentionPolicy: '',
    clinicalRulesReviewedBy: '',
    clinicalRulesReviewedAt: '',
  });

  useEffect(() => {
    if (!view) return;
    form.setValues({
      patientIdPrefix: view.patientIdPrefix,
      reminderDaysDefault: view.reminderDaysDefault,
      smsEnabled: view.smsEnabled,
      pushEnabled: view.pushEnabled,
      registrationRequiresApproval: view.registrationRequiresApproval,
      allowPatientAccountSelfRegistration: view.allowPatientAccountSelfRegistration,
      defaultLanguage: view.defaultLanguage,
      dataRetentionPolicy: view.dataRetentionPolicy,
      clinicalRulesReviewedBy: view.clinicalRulesReviewedBy ?? '',
      clinicalRulesReviewedAt: view.clinicalRulesReviewedAt ? view.clinicalRulesReviewedAt.slice(0, 10) : '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.updatedAt]);

  const toggleReminder = (days: number) => {
    const current = form.values.reminderDaysDefault ?? [];
    const next = current.includes(days) ? current.filter((item) => item !== days) : [...current, days].sort((a, b) => b - a);
    form.setField('reminderDaysDefault', next);
  };

  const save = async () => {
    await form.submit(async (values) => {
      try {
        const saved = await saveSettings({
          patientIdPrefix: values.patientIdPrefix.toUpperCase(),
          reminderDaysDefault: values.reminderDaysDefault,
          smsEnabled: values.smsEnabled,
          pushEnabled: values.pushEnabled,
          registrationRequiresApproval: values.registrationRequiresApproval,
          allowPatientAccountSelfRegistration: values.allowPatientAccountSelfRegistration,
          defaultLanguage: values.defaultLanguage,
          dataRetentionPolicy: values.dataRetentionPolicy || 'Not documented',
          clinicalRulesReviewedBy: values.clinicalRulesReviewedBy || null,
          clinicalRulesReviewedAt: values.clinicalRulesReviewedAt ? new Date(values.clinicalRulesReviewedAt).toISOString() : null,
        });
        toast.success('Settings saved', `Applied to this deployment immediately · privilege-sensitive switches are audited.`);
        settings.setData(saved);
      } catch (error) {
        toast.error(error, 'The settings were not saved');
        throw error;
      }
    });
  };

  if (settings.loading && !view) {
    return (
      <Card>
        <LoadingRows rows={5} />
      </Card>
    );
  }

  if (settings.error || !view) {
    return <ErrorState title="Settings could not be loaded" message={settings.error ?? 'Unknown error.'} onRetry={() => void settings.run()} />;
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
      <div className="space-y-4">
        <Card title="Record identifiers and reminders" description="The patient ID prefix and the default reminder offsets used when a new appointment is booked.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Patient ID prefix" error={form.errors.patientIdPrefix} required hint="Ids look like MC-000245 and are unique per deployment.">
              <TextInput value={form.values.patientIdPrefix} onValueChange={(value) => form.setField('patientIdPrefix', value.toUpperCase())} maxLength={6} />
            </Field>
            <Field label="Default language" error={form.errors.defaultLanguage} required hint="Pre-selected for new registrations and reading material.">
              <Select
                value={form.values.defaultLanguage}
                options={PREFERRED_LANGUAGES.map((language) => ({ value: language, label: language }))}
                onValueChange={(value) => form.setField('defaultLanguage', value)}
                placeholder={null}
              />
            </Field>
          </div>

          <Field label="Reminder offsets" error={form.errors.reminderDaysDefault} required className="mt-3" hint="Days before an appointment at which a reminder is queued.">
            <div className="flex flex-wrap gap-2">
              {REMINDER_OPTIONS.map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => toggleReminder(days)}
                  className={`chip ${form.values.reminderDaysDefault.includes(days) ? 'chip-active' : ''}`}
                  aria-pressed={form.values.reminderDaysDefault.includes(days)}
                >
                  {days} days before
                </button>
              ))}
            </div>
          </Field>
        </Card>

        <Card title="Channels and access" description="Switches that change what the platform is allowed to do.">
          <div className="space-y-3.5">
            <Switch
              checked={form.values.pushEnabled}
              onChange={(value) => form.setField('pushEnabled', value)}
              label="Push notifications"
              description={`Sends an in-app message to every registered device. ${integrations.push.configured ? 'A VAPID key is present, so delivery is possible.' : 'No VAPID key is configured, so notifications stay in-app only.'}`}
            />
            <Switch
              checked={form.values.smsEnabled}
              onChange={(value) => form.setField('smsEnabled', value)}
              label="SMS reminders"
              description="Queued through the server-side SMS provider only. Requires an approved provider and its keys on the API service — never in the browser."
            />
            <Switch
              checked={form.values.registrationRequiresApproval}
              onChange={(value) => form.setField('registrationRequiresApproval', value)}
              label="Health worker registrations need approval"
              description="Keeps a self-registered account locked out of clinical records until an administrator assigns a role."
            />
            <Switch
              checked={form.values.allowPatientAccountSelfRegistration}
              onChange={(value) => form.setField('allowPatientAccountSelfRegistration', value)}
              label="Mothers may create their own login"
              description="When off, only staff can create a mother’s portal account, from her record."
            />
          </div>
          <Field label="Data retention" error={form.errors.dataRetentionPolicy} className="mt-4" hint="Shown to staff and in the privacy notice.">
            <TextInput value={form.values.dataRetentionPolicy} onValueChange={(value) => form.setField('dataRetentionPolicy', value)} placeholder="Maternal records are retained for 10 years, then anonymised." />
          </Field>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button onClick={() => void save()} loading={form.submitting} disabled={!form.dirty} icon={<Save className="size-4" aria-hidden />}>
              Save settings
            </Button>
            {form.dirty ? <span className="caption">Unsaved changes.</span> : null}
            <Button variant="ghost" onClick={() => void settings.run()} loading={settings.loading} icon={<RefreshCw className="size-4" aria-hidden />}>
              Reload
            </Button>
          </div>
          {form.formError ? (
            <div className="mt-3">
              <NoticeState tone="error" title="Not saved" compact>
                {form.formError}
              </NoticeState>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="space-y-4">
        <Card title="Clinical rule sign-off">
          <KeyValue
            columns={1}
            items={[
              { label: 'Bundled rule version', value: RULES_VERSION },
              { label: 'Stored version', value: view.clinicalRulesVersion },
              { label: 'Reviewed by', value: view.clinicalRulesReviewedBy || <span className="text-[var(--color-risk-amber-text)]">Not signed off</span> },
              { label: 'Reviewed on', value: view.clinicalRulesReviewedAt ? formatDate(view.clinicalRulesReviewedAt) : '—' },
            ]}
          />
          <Field label="Sign-off date" className="mt-3" hint="Recorded together with the reviewer name on the settings row.">
            <TextInput type="date" value={form.values.clinicalRulesReviewedAt} max={toIsoDate(new Date())} onValueChange={(value) => form.setField('clinicalRulesReviewedAt', value)} />
          </Field>
          <Field label="Reviewed by" error={form.errors.clinicalRulesReviewedBy} className="mt-2" hint="Name and credential of the clinician who validated the thresholds.">
            <TextInput value={form.values.clinicalRulesReviewedBy} onValueChange={(value) => form.setField('clinicalRulesReviewedBy', value)} placeholder="Dr M. Banda, MBChB, Dip Obst" />
          </Field>
        </Card>

        <Card title="Where this is stored">
          <NoticeState tone={providerKind === 'local' ? 'info' : 'success'} title={providerKind === 'local' ? 'Device settings row' : 'Settings collection'} compact>
            {providerKind === 'local'
              ? 'Settings live in this browser’s IndexedDB under the settings collection, in the same shape as the hosted database, so switching the data layer keeps every value.'
              : 'Settings are a single document in the settings collection, readable by any signed-in account and writable only by an administrator.'}
          </NoticeState>
        </Card>
      </div>
    </div>
  );
}

/** Renders a rule group (conditions + nested groups) as readable lines. */
function RuleConditions({ group, depth = 0 }: { group: RuleGroup; depth?: number }) {
  return (
    <div className={depth > 0 ? 'ml-3 border-l border-ink-200 pl-2' : ''}>
      <p className="micro mb-0.5">Match {group.logic === 'all' ? 'all' : 'any'} of</p>
      <ul className="space-y-0.5 text-[0.8rem] text-ink-700">
        {group.conditions.map((condition, index) =>
          'logic' in condition ? (
            <li key={index}>
              <RuleConditions group={condition} depth={depth + 1} />
            </li>
          ) : (
            <li key={index} className="tnum">
              <span className="font-medium">{fieldLabel(condition.field)}</span> {operatorLabel(condition.op)} {String(condition.value)}
              {condition.unit ? ` ${condition.unit}` : ''}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

const operatorLabel = (op: RuleOperator): string =>
  ({ lt: 'below', lte: 'at or below', gt: 'above', gte: 'at or above', eq: 'is', neq: 'is not', in: 'is one of', includes: 'includes' })[op];

function RulesSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const rules = useAsync(() => listRules(), {});
  const [editing, setEditing] = useState<RuleView | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [needsSignOff, setNeedsSignOff] = useState(false);

  useEffect(() => {
    setNeedsSignOff((rules.data ?? []).some((row) => row.needsSignOff));
  }, [rules.data]);

  const toggle = async (rule: RuleView, enabled: boolean) => {
    setBusyKey(rule.id);
    try {
      await saveRule({ key: rule.key, enabled });
      toast.success(enabled ? 'Rule enabled' : 'Rule disabled', `${rule.label} · the change applies to visits saved from now on.`);
      void rules.run();
    } catch (error) {
      toast.error(error, 'The rule could not be changed');
    } finally {
      setBusyKey(null);
    }
  };

  const reset = async () => {
    const ok = await confirm({
      title: 'Restore the bundled rule set?',
      message: 'Local edits and sign-off marks on the stored rules are replaced by the version shipped with the application. Visits already recorded keep the alerts they raised.',
      confirmLabel: 'Restore defaults',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const result = await resetRulesToDefaults();
      toast.success('Rules restored', `${result.restored} rules reset to the shipped thresholds.`);
      void rules.run();
    } catch (error) {
      toast.error(error, 'The reset failed');
    }
  };

  const columns = useMemo<Column<RuleView>[]>(
    () => [
      {
        key: 'rule',
        header: 'Rule',
        render: (row) => (
          <div className="min-w-0">
            <p className="text-[0.86rem] font-semibold text-ink-900">{row.label}</p>
            <p className="caption mt-0.5 line-clamp-2">{row.message}</p>
          </div>
        ),
        sortValue: (row) => row.label,
      },
      {
        key: 'criteria',
        header: 'Triggers when',
        render: (row) => <RuleConditions group={row.criteria} />,
        hideBelow: 'md',
      },
      { key: 'level', header: 'Level', render: (row) => <Badge tone={row.level === 'RED' ? 'red' : 'amber'}>{row.level}</Badge>, hideBelow: 'sm' },
      {
        key: 'signoff',
        header: 'Sign-off',
        render: (row) => (row.approvedBy ? <p className="text-[0.8rem] text-ink-600">{row.approvedBy}<span className="block caption">{row.approvedAt ? formatDate(row.approvedAt) : ''}</span></p> : <Badge tone="amber">needs review</Badge>),
        hideBelow: 'lg',
      },
      {
        key: 'enabled',
        header: 'Enabled',
        render: (row) => (
          <div className="flex items-center gap-2">
            <Switch checked={row.enabled} onChange={(value) => void toggle(row, value)} label="" disabled={busyKey === row.id} />
          </div>
        ),
        align: 'center',
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        render: (row) => (
          <Button size="sm" variant="secondary" onClick={() => setEditing(row)}>
            Edit wording
          </Button>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyKey, rules.data],
  );

  return (
    <div className="space-y-4">
      {needsSignOff ? (
        <NoticeState
          tone="warning"
          title="These thresholds are a starting point, not a validated protocol"
          compact
          actions={
            <Button size="sm" variant="secondary" onClick={() => void reset()}>
              <RotateCcw className="size-4" aria-hidden /> Restore bundled rules
            </Button>
          }
        >
          Every alert says “assessment required” rather than naming a condition, and a rule only fires on data that was actually recorded. Before this
          deployment is used for real patients a clinician must review each threshold and record the sign-off on the rule (and on the General tab).
        </NoticeState>
      ) : (
        <NoticeState tone="success" title="Every rule carries a clinical sign-off" compact>
          The stored thresholds, wording and response actions are what the alert engine reads when a visit is saved.
        </NoticeState>
      )}

      <Card
        title="Alert rules"
        description={`${(rules.data ?? []).length} rules · ${rules.data?.filter((row) => row.level === 'RED').length ?? 0} red, ${rules.data?.filter((row) => row.level === 'AMBER').length ?? 0} amber`}
        bodyClassName="p-0"
        actions={
          <Button size="sm" variant="secondary" loading={rules.loading} onClick={() => void rules.run()}>
            <RefreshCw className="size-4" aria-hidden /> Reload
          </Button>
        }
      >
        {rules.error ? (
          <div className="p-4">
            <ErrorState message={rules.error} onRetry={() => void rules.run()} />
          </div>
        ) : rules.loading && (rules.data ?? []).length === 0 ? (
          <div className="p-4">
            <LoadingRows rows={6} />
          </div>
        ) : (rules.data ?? []).length === 0 ? (
          <EmptyState icon={<Check className="size-5" aria-hidden />} title="No rules stored yet" description="Restore the bundled rule set to start evaluating observations." />
        ) : (
          <DataTable rows={rules.data ?? []} columns={columns} rowKey={(row) => row.id} dense pageSize={40} caption="Alert rules" />
        )}
      </Card>

      {editing ? (
        <RuleEditor
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void rules.run();
          }}
        />
      ) : null}
    </div>
  );
}

function RuleEditor({ rule, onClose, onSaved }: { rule: RuleView; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [label, setLabel] = useState(rule.label);
  const [message, setMessage] = useState(rule.message);
  const [action, setAction] = useState(rule.recommendedAction);
  const [level, setLevel] = useState<Exclude<RiskLevel, 'GREEN'>>(rule.level);
  const [approved, setApproved] = useState(false);
  const [approverName, setApproverName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    if (message.trim().length < 12) {
      setError('The alert wording must explain what was seen and that an assessment is required.');
      return;
    }
    if (approved && approverName.trim().length < 3) {
      setError('Enter the clinician recording the sign-off.');
      return;
    }
    setBusy(true);
    try {
      await saveRule({
        key: rule.key,
        label: label.trim(),
        message: message.trim(),
        recommendedAction: action.trim(),
        level,
        approve: approved ? { by: approverName.trim(), note: note.trim() || 'Reviewed from the settings screen.' } : undefined,
      });
      toast.success('Rule saved', `${label} · version ${rule.version + 1}`);
      onSaved();
    } catch (caught) {
      const messageText = caught instanceof Error ? caught.message : 'The rule could not be saved.';
      setError(messageText);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title={rule.label}
      description="Wording and response guidance. Thresholds are data too, but structural changes belong in the shipped rule set so they are reviewed in version control."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => void save()}>
            Save rule
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="rounded-lg border border-ink-200 bg-ink-50 p-3">
          <p className="micro mb-1">Triggers when (read-only)</p>
          <RuleConditions group={rule.criteria} />
          <p className="caption mt-2">
            {rule.isDefault ? 'Matches the bundled rule set.' : `Modified locally from v${rule.version}.`} Categories: {rule.category.replace(/_/g, ' ').toLowerCase()}
          </p>
        </div>

        <Field label="Label" required>
          <TextInput value={label} onValueChange={setLabel} />
        </Field>
        <Field label="Alert wording shown to staff" required hint="Describe the observation and the need for assessment. Never state a diagnosis.">
          <TextInput value={message} onValueChange={setMessage} />
        </Field>
        <Field label="Recommended action" required>
          <TextInput value={action} onValueChange={setAction} />
        </Field>
        <Field label="Level" required>
          <Select
            value={level}
            options={[
              { value: 'RED', label: 'RED — immediate assessment' },
              { value: 'AMBER', label: 'AMBER — review within 24 hours' },
            ]}
            onValueChange={(value) => setLevel(value as Exclude<RiskLevel, 'GREEN'>)}
            placeholder={null}
          />
        </Field>

        <div className="rounded-lg border border-ink-200 p-3">
          <Switch checked={approved} onChange={setApproved} label="Record a clinical sign-off for this rule" description="Sets who validated the threshold and when. Until then the rule is marked as needing review." />
          {approved ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Reviewed by" required>
                <TextInput value={approverName} onValueChange={setApproverName} placeholder="Dr M. Banda, MBChB" />
              </Field>
              <Field label="Note" optional>
                <TextInput value={note} onValueChange={setNote} placeholder="Compared with the 2024 national ANC guideline." />
              </Field>
            </div>
          ) : null}
        </div>

        {error ? (
          <NoticeState tone="error" title="The rule was not saved" compact>
            {error}
          </NoticeState>
        ) : null}
      </div>
    </Modal>
  );
}

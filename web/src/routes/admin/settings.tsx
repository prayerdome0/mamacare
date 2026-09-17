/**
 * Administrator — platform settings.
 *
 * The handful of switches that change behaviour for everybody: whether registration
 * is open, whether providers need verification, how often published guidance must be
 * re-checked, who to call in an emergency, and whether the site is in maintenance.
 *
 * Each one is explained in terms of what a mother will actually experience, because
 * a setting named “providerApprovalsRequired” tells an operator nothing about the
 * trust decision it represents.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe,
  LifeBuoy,
  Phone,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { settingsRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { app, dataProvider, environmentChecks, integrations } from '@/config/env';
import { APP_VERSION, EMERGENCY_CONTACTS, SITE } from '@/config/site-content';
import { COUNTRIES, countryOptions } from '@/config/geo';
import { wipe } from '@/services/data/local/store';
import { settingsSchema, validate, type SettingsValues } from '@/lib/validation';
import type { SystemSettings } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Badge, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, NumberField, Select, Switch, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

export default function AdminSettings() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();

  const [values, setValues] = useState<SettingsValues>({
    registrationOpen: true,
    providerApprovalsRequired: true,
    defaultCountry: app.defaultCountry,
    supportEmail: app.supportEmail,
    supportPhone: app.supportPhone,
    immunizationScheduleLabel: 'Zambia EPI routine schedule',
    contentReviewReminderDays: 365,
    maintenanceMessage: '',
  });
  const [emergencyNumbers, setEmergencyNumbers] = useState<{ label: string; number: string }[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const { data: settings, loading, error, retryable, run } = useAsync(() => settingsRepo.get(), { immediate: true });

  useEffect(() => {
    document.title = 'Settings · Mama Care admin';
    if (!settings) return;
    setValues({
      registrationOpen: settings.registrationOpen,
      providerApprovalsRequired: settings.providerApprovalsRequired,
      defaultCountry: settings.defaultCountry,
      supportEmail: settings.supportEmail,
      supportPhone: settings.supportPhone,
      immunizationScheduleLabel: settings.immunizationScheduleLabel,
      contentReviewReminderDays: settings.contentReviewReminderDays,
      maintenanceMessage: settings.maintenanceMessage ?? '',
    });
    setEmergencyNumbers(
      settings.emergencyNumbers.length > 0
        ? settings.emergencyNumbers
        : EMERGENCY_CONTACTS.lines.map((line) => ({ label: line.label, number: line.number })),
    );
  }, [settings]);

  const set = <K extends keyof SettingsValues>(key: K, value: SettingsValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const checks = useMemo(() => environmentChecks(), []);
  const missingOptional = checks.filter((check) => !check.present);

  const save = async (): Promise<void> => {
    setFormError(null);
    const result = validate(settingsSchema, values);
    if (!result.ok) {
      setErrors(result.errors);
      setFormError('Some settings need attention before they can be saved.');
      return;
    }
    const numbers = emergencyNumbers
      .map((line) => ({ label: line.label.trim(), number: line.number.trim() }))
      .filter((line) => line.label && line.number);
    setSaving(true);
    try {
      const patch: Partial<SystemSettings> = {
        ...result.value,
        maintenanceMessage: result.value.maintenanceMessage.trim() || null,
        emergencyNumbers: numbers,
      };
      await settingsRepo.save(patch);
      await logAudit('settings-change', 'settings', 'global', `Saved platform settings${patch.maintenanceMessage ? ' with a maintenance notice' : ''}`);
      toast.success('Settings saved', 'They apply to everybody on their next page load.');
      void run();
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'That did not save. Check the connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  const eraseLocal = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Erase all locally stored data?',
      message:
        'In device mode this is the whole database on this browser — accounts, records, settings and the audit log. On Firebase the cloud data survives and only the cache goes. There is no undo.',
      confirmLabel: 'Erase everything',
      tone: 'danger',
    });
    if (!ok) return;
    await wipe();
    toast.success('Local data erased', 'Reload to start again.');
  };

  if (loading) {
    return (
      <StaffShell portal="Admin Dashboard">
        <StaffPageHeader title="Platform settings" />
        <LoadingRows rows={5} />
      </StaffShell>
    );
  }

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Platform settings"
        description="Behaviour that applies to every account on this deployment. Changes take effect on the next page load."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()}>
              Reload
            </Button>
            <Button variant="primary" size="sm" onClick={() => void save()} loading={saving} icon={<Save className="size-4" aria-hidden />}>
              Save settings
            </Button>
          </>
        }
      />

      {error ? <ErrorState title="Settings could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {formError ? <p className="alert alert-error mb-4">{formError}</p> : null}

      {values.maintenanceMessage.trim() ? (
        <Card className="card-pad mb-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone="amber">Maintenance notice staged</Badge>
            <p className="text-sm text-ink-700">{values.maintenanceMessage}</p>
            <span className="ml-auto text-xs text-ink-600">{settings?.maintenanceMessage ? 'already live' : 'goes live when you save'}</span>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading
            eyebrow="Access"
            title="Who can join, and how they are checked"
            description="These two switches decide how open the platform is. Neither is a technical preference — both are trust decisions."
          />
          <div className="mt-3 space-y-3">
            <Switch
              label="Registration is open"
              description={
                values.registrationOpen
                  ? 'Anyone can create a mother, supporter or provider account. Turn it off during an incident or a closed pilot; existing accounts keep working.'
                  : 'New sign-ups are refused with a message pointing at the support address. Use this for a closed pilot or during an incident.'
              }
              checked={values.registrationOpen}
              onChange={(checked) => set('registrationOpen', checked)}
            />
            <Switch
              label="Providers must be verified before they are listed"
              description={
                values.providerApprovalsRequired
                  ? 'A new clinician is held at “pending” until an administrator checks their licence. Strongly recommended: mothers choose providers from this directory.'
                  : 'Providers are approved automatically on registration. Only sensible for a closed deployment where every clinician is already known to you.'
              }
              checked={values.providerApprovalsRequired}
              onChange={(checked) => set('providerApprovalsRequired', checked)}
            />
            {!values.providerApprovalsRequired ? (
              <p className="alert alert-warn flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                With verification off, anybody who registers as a provider can appear in the public directory and be linked by a
                pregnant woman. Turn it back on unless every account is created by you.
              </p>
            ) : null}
          </div>
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Defaults" title="Country, language and support" description="Used for new accounts, distance sorting and the help links in the footer." />
          <div className="mt-3 space-y-4">
            <FieldGrid columns={2}>
              <Field label="Default country" htmlFor="st-country" error={errors.defaultCountry}>
                <Select
                  id="st-country"
                  value={values.defaultCountry}
                  onChange={(event) => set('defaultCountry', event.target.value)}
                  options={countryOptions()}
                />
              </Field>
              <Field label="Immunization schedule label" htmlFor="st-immunization" error={errors.immunizationScheduleLabel} hint="Shown on the baby screens next to the doses.">
                <TextInput id="st-immunization" value={values.immunizationScheduleLabel} onValueChange={(value) => set('immunizationScheduleLabel', value)} />
              </Field>
            </FieldGrid>
            <FieldGrid columns={2}>
              <Field label="Support email" htmlFor="st-email" required error={errors.supportEmail}>
                <TextInput id="st-email" type="email" value={values.supportEmail} onValueChange={(value) => set('supportEmail', value)} />
              </Field>
              <Field label="Support phone" htmlFor="st-phone" error={errors.supportPhone} optional hint="Shown in the footer and on the contact page.">
                <TextInput id="st-phone" value={values.supportPhone} onValueChange={(value) => set('supportPhone', value)} placeholder="+260…" />
              </Field>
            </FieldGrid>
            <Field label="Content review window (days)" htmlFor="st-review" error={errors.contentReviewReminderDays} hint="Published articles older than this are flagged for re-checking.">
              <NumberField label="Days" value={String(values.contentReviewReminderDays)} onValueChange={(value) => set('contentReviewReminderDays', Number(value) || 365)} min={30} max={1825} />
            </Field>
            <p className="text-xs text-ink-500">
              {COUNTRIES.length} countries are selectable in the interface. Zambia is the default market: currency ZMW, dialling
              code {app.defaultDialCode}, provinces from the built-in facility list.
            </p>
          </div>
        </Card>

        <Card className="card-pad">
          <SectionHeading
            eyebrow="Safety"
            title="Emergency numbers"
            description="Shown on the emergency page, in the mother app and in the public footer. These override the built-in defaults for this deployment."
          />
          <ul className="mt-3 space-y-2">
            {emergencyNumbers.map((line, index) => (
              <li key={index} className="flex flex-wrap items-end gap-2">
                <Field label="Label" htmlFor={`em-label-${index}`} className="min-w-[12rem] flex-1">
                  <TextInput
                    id={`em-label-${index}`}
                    value={line.label}
                    onValueChange={(value) => setEmergencyNumbers((current) => current.map((item, i) => (i === index ? { ...item, label: value } : item)))}
                    placeholder="e.g. Emergency — police, ambulance, fire"
                  />
                </Field>
                <Field label="Number" htmlFor={`em-number-${index}`} className="w-32">
                  <TextInput
                    id={`em-number-${index}`}
                    value={line.number}
                    onValueChange={(value) => setEmergencyNumbers((current) => current.map((item, i) => (i === index ? { ...item, number: value } : item)))}
                    placeholder="999"
                  />
                </Field>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label="Remove this number"
                  onClick={() => setEmergencyNumbers((current) => current.filter((_, i) => i !== index))}
                  icon={<Trash2 className="size-4" aria-hidden />}
                />
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEmergencyNumbers((current) => [...current, { label: '', number: '' }])}
              icon={<Plus className="size-4" aria-hidden />}
            >
              Add a number
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEmergencyNumbers(EMERGENCY_CONTACTS.lines.map((line) => ({ label: line.label, number: line.number })))}
            >
              Reset to Zambia defaults
            </Button>
          </div>
          <p className="mt-3 flex items-start gap-2 text-xs text-ink-500">
            <Phone className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {EMERGENCY_CONTACTS.note}
          </p>
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Availability" title="Maintenance notice" description="When set, a banner appears across the public site and the app. Leave blank for normal operation." />
          <Field label="Notice" htmlFor="st-maintenance" error={errors.maintenanceMessage} hint="One or two sentences. Say what is affected and when it returns.">
            <TextArea
              id="st-maintenance"
              rows={3}
              value={values.maintenanceMessage}
              onChange={(event) => set('maintenanceMessage', event.target.value)}
              placeholder="We are upgrading the server on Saturday between 02:00 and 06:00 CAT. Your records are safe; the app may be slow to load during that time."
            />
          </Field>
          <CheckboxRow
            checked={Boolean(values.maintenanceMessage.trim())}
            onChange={(checked) => set('maintenanceMessage', checked ? values.maintenanceMessage : '')}
            label="Show the notice"
            description="Unticking clears the text, which removes the banner when you save."
          />
          <p className="mt-2 text-xs text-ink-500">
            A maintenance notice does not disable the app — it warns people. Records already on this device keep working, which
            is exactly what an offline-first service should do during an outage.
          </p>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Privilege" title="Administrator access" description="How the first and subsequent administrators are created." />
          <KeyValue
            columns={1}
            dense
            items={[
              { label: 'Signed in as', value: `${actor?.displayName ?? '—'} (${actor?.role ?? '—'})` },
              { label: 'Data provider', value: dataProvider === 'firebase' ? 'Firebase Firestore' : 'This device (IndexedDB)' },
              { label: 'Bootstrap emails', value: app.bootstrapAdminEmails.length > 0 ? app.bootstrapAdminEmails.join(', ') : 'None configured' },
            ]}
          />
          <ul className="checklist mt-3 text-sm">
            <li>On Firebase, set the <code className="break-anywhere">role: ADMIN</code> custom claim from the console or a script, then have the person sign out and back in.</li>
            <li>In device mode, any email in <code className="break-anywhere">VITE_BOOTSTRAP_ADMIN_EMAILS</code> can claim the first ADMIN account from the sign-in screen.</li>
            <li>Promoting somebody from the Accounts screen works too, and is logged — but keep administrators to the people who need it.</li>
            <li>Removing your own admin role from here is blocked on purpose, so a deployment cannot be locked out by one mistake.</li>
          </ul>
          <div className="mt-3">
            <Link to="/admin/users" className="btn btn-secondary btn-sm">
              <ShieldCheck className="size-4" aria-hidden />
              Manage accounts and roles
            </Link>
          </div>
        </Card>

        <Card className="card-pad">
          <SectionHeading eyebrow="Deployment" title="Environment and integrations" description="What is configured, and what changes when it is not." />
          <ul className="mt-3 divide-y divide-ink-100">
            {checks.map((check) => (
              <li key={check.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink-800 break-anywhere">{check.key}</span>
                  <span className="block text-xs text-ink-500">{check.purpose}</span>
                </span>
                {check.present ? <Badge tone="green">set</Badge> : <Badge tone={check.required ? 'red' : 'amber'}>{check.required ? 'missing' : 'not set'}</Badge>}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-ink-500">
            {missingOptional.length === 0
              ? 'Every variable is present. Values are never shown here — only whether they are set.'
              : `${missingOptional.length} variable${missingOptional.length === 1 ? ' is' : 's are'} not set. The app falls back to this device's storage and to local image handling; nothing breaks, but data no longer syncs between devices.`}
          </p>
          <div className="mt-3">
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Firebase', value: integrations.firebase.configured ? `Connected (${integrations.firebase.projectId})` : 'Not configured' },
                { label: 'Cloudinary', value: integrations.cloudinary.configured ? `Connected (${integrations.cloudinary.cloudName})` : 'Not configured' },
                { label: 'Web push', value: integrations.push.configured ? 'VAPID key set' : 'Not configured' },
                { label: 'Forced provider', value: integrations.forcedProvider ?? 'auto' },
              ]}
            />
          </div>
        </Card>
      </div>

      <Card className="card-pad mt-4 border-[var(--color-risk-red-border)]">
        <SectionHeading eyebrow="Danger" title="Destructive actions" description="Nothing here can be undone. Read the confirmation carefully — it says exactly what will and will not be deleted." />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline-danger" size="sm" onClick={() => void eraseLocal()} icon={<Database className="size-4" aria-hidden />}>
            Erase local data on this device
          </Button>
          <Link to="/admin/media" className="btn btn-secondary btn-sm">
            <Wrench className="size-4" aria-hidden />
            Media & storage tools
          </Link>
        </div>
        <p className="mt-3 text-xs text-ink-500">
          To remove a single person's data, they do it themselves from Settings → Privacy & data, which deletes their records in
          order and then their account. That path is audited and reversible nowhere — which is why administrators do not have a
          shortcut to it.
        </p>
      </Card>

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h3 className="card-title flex items-center gap-2">
              <Globe className="size-4 text-brand-700" aria-hidden />
              {SITE.name}
            </h3>
            <p className="mt-1 text-sm text-ink-600">{SITE.tagline} · {APP_VERSION}</p>
            <p className="mt-2 max-w-prose text-sm text-ink-600">{SITE.mission}</p>
          </div>
          <div className="min-w-[16rem]">
            <KeyValue
              columns={1}
              dense
              items={[
                { label: 'Organisation', value: SITE.org.name },
                { label: 'Support', value: `${SITE.org.email}${SITE.org.phone ? ` · ${SITE.org.phone}` : ''}` },
                { label: 'Hours', value: SITE.org.hours },
                { label: 'Privacy contact', value: SITE.privacyContact },
                { label: 'Base country', value: SITE.country },
              ]}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge tone="green">
            <CheckCircle2 className="size-3" aria-hidden />
            English interface live
          </Badge>
          <Badge tone="neutral">Bemba, Nyanja, Tonga and Lozi are structured but not translated yet</Badge>
          <Link to="/status" className="btn btn-ghost btn-sm">
            <LifeBuoy className="size-4" aria-hidden />
            Public status page
          </Link>
        </div>
      </Card>
    </StaffShell>
  );
}

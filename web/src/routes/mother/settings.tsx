/**
 * Settings — the mother's control panel.
 *
 * Four groups, in the order people actually look for them: what interrupts me
 * (notifications), who I share with (family support), how I protect the account
 * (security), and what happens to my data (export, delete, offline storage).
 *
 * The destructive actions are loud about being destructive, and the export is a real
 * download of every record the account owns — not a summary.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  BellRing,
  Database,
  Download,
  HandHeart,
  Info,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  ShieldCheck,
  Trash2,
  UserPlus,
  WifiOff,
} from 'lucide-react';
import {useAsync} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import {
  appointmentRepo,
  babyRepo,
  immunizationRepo,
  journalRepo,
  observationRepo,
  pregnancyRepo,
  profileRepo,
  reminderRepo,
  supporterRepo,
} from '@/services/repositories';
import { listDocuments } from '@/services/media/media-service';
import { disablePush, enablePush, pushState, pushSupported, type PushState } from '@/services/push';
import { logAudit } from '@/services/audit';
import { diagnostics, services } from '@/services/session-store';
import { estimateUsage, storageMode, wipe } from '@/services/data/local/store';
import { useConfirm, useSession } from '@/providers/app-providers';
import { changePasswordSchema, supporterInviteSchema, validate } from '@/lib/validation';
import { formatDate, formatBytes } from '@/lib/utils';
import { APP_VERSION, SITE } from '@/config/site-content';
import { LANGUAGES, type LanguageCode, type NotificationPreferences, type SupporterLink } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, PasswordInput, Select, Switch, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

export default function SettingsPage() {
  const mother = useMotherContext();
  const { actor, profile, signOut } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const uid = actor?.uid ?? '';

  const [inviteOpen, setInviteOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [push, setPush] = useState<PushState | null>(null);
  const pushStatus = push?.status ?? 'unsupported';
  const [pushBusy, setPushBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [usage, setUsage] = useState<{ usageBytes: number; quotaBytes: number; persisted: boolean } | null>(null);
  const [runtime, setRuntime] = useState<Awaited<ReturnType<typeof diagnostics>> | null>(null);

  const { data: supporters, run: reloadSupporters } = useAsync(() => supporterRepo.list(uid), {
    deps: [uid],
    immediate: Boolean(uid),
  });
  const supportRows = useMemo<SupporterLink[]>(() => supporters ?? [], [supporters]);

  useEffect(() => {
    document.title = 'Settings · Mama Care';
    void pushState().then(setPush);
    void estimateUsage().then(setUsage).catch(() => setUsage(null));
    void diagnostics().then(setRuntime).catch(() => setRuntime(null));
  }, []);

  const prefs = profile?.notificationPrefs;

  const setPref = async (patch: Partial<NotificationPreferences>): Promise<void> => {
    try {
      await profileRepo.updateNotificationPrefs(patch);
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const setLanguage = async (language: LanguageCode): Promise<void> => {
    const chosen = LANGUAGES.find((item) => item.code === language);
    if (chosen && !chosen.available) {
      toast.info(`${chosen.label} is coming soon`, 'English is the only fully available language right now. Your choice is saved.');
    }
    try {
      await profileRepo.update({ language });
      toast.success('Language updated');
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const togglePush = async (): Promise<void> => {
    setPushBusy(true);
    try {
      if (pushStatus === 'granted') {
        await disablePush(uid);
        toast.success('Push off', 'Reminders still appear inside the app.');
      } else {
        const next = await enablePush(uid);
        setPush(next);
        if (next.status === 'granted') toast.success('Push on', 'This device will receive reminders even when the app is closed.');
        else toast.error('Push could not be enabled', next.reason);
      }
    } catch {
      toast.error('That did not work');
    } finally {
      setPushBusy(false);
      void pushState().then(setPush);
    }
  };

  const revoke = async (link: SupporterLink): Promise<void> => {
    const ok = await confirm({
      title: `Remove ${link.supporterName}'s access?`,
      message: 'They will immediately stop seeing everything you shared with them. You can invite them again later.',
      confirmLabel: 'Remove access',
      tone: 'danger',
    });
    if (!ok) return;
    await supporterRepo.revoke(link.id);
    toast.success('Access removed');
    void reloadSupporters();
  };

  const exportData = async (): Promise<void> => {
    setExporting(true);
    try {
      const [pregnancies, babies, appointments, reminders, observations, journal, documents] = await Promise.all([
        pregnancyRepo.all(uid),
        babyRepo.list(uid),
        appointmentRepo.list(uid, { includePast: true }),
        reminderRepo.list(uid),
        observationRepo.list(uid),
        journalRepo.list(uid),
        listDocuments(),
      ]);
      const immunizations = await Promise.all(babies.map((baby) => immunizationRepo.list(baby.id)));
      const payload = {
        exportedAt: new Date().toISOString(),
        application: SITE.name,
        account: profile
          ? {
              fullName: profile.fullName,
              email: profile.email,
              phone: profile.phone,
              dateOfBirth: profile.dateOfBirth,
              country: profile.country,
              language: profile.language,
              role: profile.role,
              createdAt: profile.createdAt,
              emergencyContact: profile.emergencyContact,
              notificationPrefs: profile.notificationPrefs,
            }
          : null,
        pregnancies,
        babies,
        appointments,
        reminders,
        observations,
        journal,
        immunizations: immunizations.flat(),
        documents: documents.map((document) => ({
          title: document.title,
          category: document.category,
          mimeType: document.mimeType,
          bytes: document.bytes,
          uploadedAt: document.createdAt,
          note: 'The file itself is stored separately; this is its record.',
        })),
        supporters: supportRows.map((link) => ({
          name: link.supporterName,
          email: link.supporterEmail,
          relationship: link.relationship,
          status: link.status,
          permissions: link.permissions,
        })),
      };
      await logAudit('data-export', 'users', uid, `Exported ${Object.keys(payload).length} sections`);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `mamacare-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success('Export downloaded', 'A JSON file with everything Mama Care holds about you.');
    } catch {
      toast.error('The export failed', 'Check your connection and try again.');
    } finally {
      setExporting(false);
    }
  };

  const onSignOut = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Sign out of Mama Care?',
      message: 'Anything saved on this device stays here. On a hosted deployment your records are in your account and will be waiting when you sign in again.',
      confirmLabel: 'Sign out',
    });
    if (!ok) return;
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <AppShell>
      <PageHeader
        title="Settings"
        description="Notifications, sharing, security and your data. Everything here is yours to change, and nothing is shared by default."
        actions={
          <Button variant="secondary" size="sm" onClick={() => void onSignOut()} icon={<LogOut className="size-4" aria-hidden />}>
            Sign out
          </Button>
        }
      />

      <div className="space-y-6">
        {/* ── Notifications ─────────────────────────────────────────── */}
        <section>
          <SectionHeading eyebrow="Interruptions" title="Notifications" description="Choose what Mama Care tells you about, and when it is allowed to." />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <h3 className="card-title">What you hear about</h3>
              <div className="mt-3 space-y-3">
                <Switch
                  label="Appointments"
                  description="Upcoming visits, changes and follow-ups."
                  checked={prefs?.appointments ?? true}
                  onChange={(value) => void setPref({ appointments: value })}
                />
                <Switch
                  label="Medication & supplements"
                  description="Doses you have entered, at the times you set."
                  checked={prefs?.reminders ?? true}
                  onChange={(value) => void setPref({ reminders: value })}
                />
                <Switch
                  label="Immunization dates"
                  description="Each dose as it comes due, from the national schedule."
                  checked={prefs?.milestones ?? true}
                  onChange={(value) => void setPref({ milestones: value })}
                />
                <Switch
                  label="Baby milestones"
                  description="Growth stages and what to expect next."
                  checked={prefs?.baby ?? true}
                  onChange={(value) => void setPref({ baby: value })}
                />
                <Switch
                  label="Education"
                  description="New articles for your week or your baby's stage."
                  checked={prefs?.education ?? true}
                  onChange={(value) => void setPref({ education: value })}
                />
              </div>
            </Card>

            <div className="space-y-4">
              <Card className="card-pad">
                <h3 className="card-title">Quiet hours</h3>
                <p className="mt-1 text-sm text-ink-600">No push notifications between these times. In-app notifications are unaffected.</p>
                <FieldGrid className="mt-3" columns={2}>
                  <Field label="From" htmlFor="quiet-from">
                    <TextInput
                      id="quiet-from"
                      type="time"
                      value={prefs?.quietFrom ?? '21:00'}
                      onValueChange={(value) => void setPref({ quietFrom: value })}
                    />
                  </Field>
                  <Field label="To" htmlFor="quiet-to">
                    <TextInput id="quiet-to" type="time" value={prefs?.quietTo ?? '06:00'} onValueChange={(value) => void setPref({ quietTo: value })} />
                  </Field>
                </FieldGrid>
              </Card>

              <Card className="card-pad">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="card-title">Push notifications</h3>
                      <Badge tone={pushStatus === 'granted' ? 'green' : pushStatus === 'denied' || pushStatus === 'error' ? 'red' : 'amber'}>{pushStatus}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-ink-600">
                      {(push && 'reason' in push ? push.reason : null) ??
                        (pushSupported()
                          ? 'Delivered by this browser even when the app is closed. Tokens are stored per device.'
                          : 'This browser does not support push. In-app notifications still work.')}
                    </p>
                  </div>
                  <Button
                    variant={pushStatus === 'granted' ? 'secondary' : 'primary'}
                    size="sm"
                    loading={pushBusy}
                    disabled={!pushSupported() && pushStatus !== 'granted'}
                    onClick={() => void togglePush()}
                    icon={<BellRing className="size-4" aria-hidden />}
                  >
                    {pushStatus === 'granted' ? 'Turn off' : 'Turn on'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        </section>

        {/* ── Family support ────────────────────────────────────────── */}
        <section>
          <SectionHeading
            eyebrow="Sharing"
            title="Family support"
            description="A partner, parent or friend can see the categories you switch on — and nothing else. Your journal and documents are never shared."
            actions={
              <Button variant="primary" size="sm" onClick={() => setInviteOpen(true)} icon={<UserPlus className="size-4" aria-hidden />}>
                Invite a supporter
              </Button>
            }
          />
          <Card className="card-pad mt-4">
            {supportRows.length === 0 ? (
              <EmptyState
                icon={<HandHeart className="size-6" aria-hidden />}
                title="No supporters"
                description="Invite someone by email. They register with that address, and the link connects automatically — with only the categories you chose."
              />
            ) : (
              <ul className="space-y-3">
                {supportRows.map((link) => (
                  <li key={link.id} className={cn('rounded-xl border p-3', link.status === 'revoked' ? 'border-ink-200 opacity-60' : 'border-ink-200')}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-800">
                          {link.supporterName}
                          <Badge tone={link.status === 'active' ? 'green' : link.status === 'invited' ? 'amber' : 'neutral'}>{link.status}</Badge>
                        </p>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {link.relationship} · {link.supporterEmail}
                          {link.acceptedAt ? ` · accepted ${formatDate(link.acceptedAt, 'day')}` : ''}
                        </p>
                      </div>
                      {link.status !== 'revoked' ? (
                        <Button variant="ghost" size="sm" onClick={() => void revoke(link)} icon={<Trash2 className="size-4" aria-hidden />}>
                          Remove
                        </Button>
                      ) : null}
                    </div>
                    {link.status === 'active' ? (
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {(['appointments', 'reminders', 'education', 'milestones'] as const).map((key) => (
                          <Switch
                            key={key}
                            label={key[0]?.toUpperCase() + key.slice(1)}
                            checked={link.permissions[key]}
                            onChange={async (value) => {
                              await supporterRepo.update(link.id, { permissions: { ...link.permissions, [key]: value } });
                              toast.success(`${key} ${value ? 'shared with' : 'hidden from'} ${link.supporterName}`);
                              void reloadSupporters();
                            }}
                          />
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>

        {/* ── Language & app ────────────────────────────────────────── */}
        <section>
          <SectionHeading eyebrow="App" title="Language & offline" />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <div className="flex items-center gap-2">
                <Languages className="size-4 text-brand-700" aria-hidden />
                <h3 className="card-title">Language</h3>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                English is available now. Bemba, Nyanja, Tonga and Lozi are planned — each will be reviewed by a qualified
                native speaker and a health professional before release. Choosing one now saves your preference.
              </p>
              <div className="mt-3">
                <Select
                  value={profile?.language ?? 'en'}
                  onChange={(event) => void setLanguage(event.target.value as LanguageCode)}
                  options={LANGUAGES.map((item) => ({
                    value: item.code,
                    label: item.available ? item.label : `${item.label} (coming soon)`,
                  }))}
                />
              </div>
            </Card>

            <Card className="card-pad">
              <div className="flex items-center gap-2">
                <WifiOff className="size-4 text-brand-700" aria-hidden />
                <h3 className="card-title">Offline & storage</h3>
              </div>
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'Storage mode', value: storageMode() === 'indexeddb' ? 'IndexedDB (persistent)' : 'In-memory (this session only)' },
                  { label: 'Active data provider', value: runtime ? (runtime.provider === 'firebase' ? 'Firebase' : 'This device') : '—' },
                  { label: 'Records on this device', value: runtime ? String(runtime.records) : '—' },
                  { label: 'Space used', value: usage ? `${formatBytes(usage.usageBytes)} of ${usage.quotaBytes > 0 ? formatBytes(usage.quotaBytes) : 'unknown quota'}` : '—' },
                  { label: 'Browser keeps data after restart', value: usage ? (usage.persisted ? 'Yes' : 'Not requested') : '—' },
                ]}
              />
              <p className="mt-3 text-sm text-ink-600">
                Education you have opened, your pregnancy progress, saved appointments, reminders and baby information stay
                available offline and synchronise when the connection returns.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const ok = await confirm({
                      title: 'Clear cached data on this device',
                      message:
                        'Removes offline copies and cached media from this browser. On a hosted deployment your account records are unaffected; on a device-only deployment this deletes them.',
                      confirmLabel: 'Clear cache',
                      tone: 'danger',
                    });
                    if (!ok) return;
                    await services().data.purgeLocalData();
                    await wipe().catch(() => undefined);
                    toast.success('Cache cleared');
                    void diagnostics().then(setRuntime);
                  }}
                  icon={<Database className="size-4" aria-hidden />}
                >
                  Clear cached data
                </Button>
                <Link to="/status" className="btn btn-ghost btn-sm">
                  System status
                </Link>
              </div>
            </Card>
          </div>
        </section>

        {/* ── Security ──────────────────────────────────────────────── */}
        <section>
          <SectionHeading eyebrow="Protection" title="Security" />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <div className="flex items-center gap-2">
                <KeyRound className="size-4 text-brand-700" aria-hidden />
                <h3 className="card-title">Password</h3>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                Your password is never stored in plain text and no Mama Care staff member can read it. Change it if you
                have signed in on a shared device.
              </p>
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => setSecurityOpen(true)}>
                  Change password
                </Button>
              </div>
            </Card>

            <Card className="card-pad">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-700" aria-hidden />
                <h3 className="card-title">This account</h3>
              </div>
              <KeyValue
                columns={1}
                dense
                items={[
                  { label: 'Signed in as', value: actor?.email ?? '—' },
                  { label: 'Account type', value: actor?.role === 'MOTHER' ? 'Mother' : actor?.role ?? '—' },
                  { label: 'Authentication', value: services().auth.kind === 'firebase' ? 'Firebase Authentication' : 'This device' },
                  { label: 'Consent recorded', value: profile?.consentAt ? formatDate(profile.consentAt, 'long') : '—' },
                ]}
              />
            </Card>
          </div>
        </section>

        {/* ── Privacy & data ────────────────────────────────────────── */}
        <section>
          <SectionHeading eyebrow="Control" title="Privacy & data" />
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card className="card-pad">
              <div className="flex items-center gap-2">
                <Download className="size-4 text-brand-700" aria-hidden />
                <h3 className="card-title">Export my record</h3>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                Downloads everything Mama Care holds about you as a JSON file: pregnancies, babies, appointments,
                reminders, observations, immunizations, your journal and document records.
              </p>
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => void exportData()} loading={exporting}>
                  {exporting ? 'Preparing…' : 'Download my data'}
                </Button>
              </div>
              <p className="mt-2 text-xs text-ink-500">The export is recorded in the audit log, like every data action.</p>
            </Card>

            <Card className="card-pad border-[var(--color-risk-red-border)]">
              <div className="flex items-center gap-2">
                <Trash2 className="size-4 text-[var(--color-risk-red)]" aria-hidden />
                <h3 className="card-title">Delete my account</h3>
              </div>
              <p className="mt-1 text-sm text-ink-600">
                Removes your profile and every record you own — pregnancies, babies, appointments, reminders,
                observations, journal entries, documents and links. Your authentication account is deleted too. This
                cannot be undone.
              </p>
              <p className="mt-2 text-xs text-ink-500">
                Anything a provider recorded in their own system stays with them; ask them to remove it separately.
              </p>
              <div className="mt-3">
                <Button variant="outline-danger" size="sm" onClick={() => setDeleteOpen(true)}>
                  Delete my account
                </Button>
              </div>
            </Card>
          </div>
        </section>

        {/* ── About ─────────────────────────────────────────────────── */}
        <section>
          <SectionHeading eyebrow="About" title="Policies & support" />
          <Card className="card-pad mt-4">
            <KeyValue
              columns={2}
              items={[
                { label: 'Version', value: APP_VERSION },
                { label: 'Support', value: <a className="text-brand-800 hover:underline" href={`mailto:${SITE.org.email}`}>{SITE.org.email}</a> },
                { label: 'Data protection', value: <a className="text-brand-800 hover:underline" href={`mailto:${SITE.privacyContact}`}>{SITE.privacyContact}</a> },
                { label: 'Country defaults', value: `${SITE.country} · ZMW · +260` },
              ]}
            />
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to="/privacy" className="btn btn-secondary btn-sm">Privacy</Link>
              <Link to="/terms" className="btn btn-secondary btn-sm">Terms</Link>
              <Link to="/faq" className="btn btn-secondary btn-sm">FAQ</Link>
              <Link to="/contact" className="btn btn-ghost btn-sm"><Mail className="size-4" aria-hidden /> Contact</Link>
              <Link to="/status" className="btn btn-ghost btn-sm"><Info className="size-4" aria-hidden /> Status</Link>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-ink-500">
              Mama Care provides educational information and organisational tools. It does not diagnose medical conditions
              or replace a qualified healthcare professional.
            </p>
          </Card>
        </section>
      </div>

      <InviteSupporterModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={() => { setInviteOpen(false); void reloadSupporters(); }} />
      <ChangePasswordModal open={securityOpen} onClose={() => setSecurityOpen(false)} />
      <DeleteAccountModal open={deleteOpen} onClose={() => setDeleteOpen(false)} onDeleted={() => navigate('/', { replace: true })} />
    </AppShell>
  );
}

/* ── Invite a supporter ────────────────────────────────────────────────── */

function InviteSupporterModal({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited: () => void }) {
  const toast = useToast();
  const [supporterName, setSupporterName] = useState('');
  const [supporterEmail, setSupporterEmail] = useState('');
  const [relationship, setRelationship] = useState('');
  const [appointments, setAppointments] = useState(true);
  const [reminders, setReminders] = useState(true);
  const [education, setEducation] = useState(false);
  const [milestones, setMilestones] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupporterName('');
    setSupporterEmail('');
    setRelationship('');
    setAppointments(true);
    setReminders(true);
    setEducation(false);
    setMilestones(true);
    setErrors({});
  }, [open]);

  const submit = async (): Promise<void> => {
    const result = validate(supporterInviteSchema, { supporterName, supporterEmail, relationship, appointments, reminders, education, milestones });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await supporterRepo.invite({
        supporterEmail: result.value.supporterEmail,
        supporterName: result.value.supporterName,
        relationship: result.value.relationship,
        permissions: { appointments, reminders, education, milestones },
      });
      await logAudit('record-create', 'supporters', result.value.supporterEmail, `Invited ${result.value.supporterName}`);
      toast.success('Invitation created', `${result.value.supporterName} can register with ${result.value.supporterEmail}.`);
      onInvited();
    } catch {
      setErrors({ form: 'That did not save. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite a supporter"
      description="They see only the categories you switch on. Your journal, documents and messages are never shared."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving}>Create invitation</Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="Their name" htmlFor="sup-name" error={errors.supporterName} required>
            <TextInput id="sup-name" value={supporterName} onValueChange={setSupporterName} invalid={Boolean(errors.supporterName)} />
          </Field>
          <Field label="Their email" htmlFor="sup-email" error={errors.supporterEmail} required hint="They must register with this address.">
            <TextInput id="sup-email" type="email" inputMode="email" value={supporterEmail} onValueChange={setSupporterEmail} invalid={Boolean(errors.supporterEmail)} />
          </Field>
        </FieldGrid>
        <Field label="Relationship" htmlFor="sup-rel" error={errors.relationship} required>
          <TextInput id="sup-rel" value={relationship} onValueChange={setRelationship} placeholder="e.g. Husband, Mother, Sister" invalid={Boolean(errors.relationship)} />
        </Field>
        <div>
          <span className="label">What can they see?</span>
          <div className="mt-2 space-y-3">
            <CheckboxRow checked={appointments} onChange={setAppointments} label="Appointments" description="Dates, times and the facility — including whether you attended." />
            <CheckboxRow checked={reminders} onChange={setReminders} label="Reminders" description="Medication and supplement schedules you have entered." />
            <CheckboxRow checked={milestones} onChange={setMilestones} label="Milestones & immunizations" description="Pregnancy week progress and baby vaccine dates." />
            <CheckboxRow checked={education} onChange={setEducation} label="Education" description="Articles you have saved. Nothing else in the library is personal." />
          </div>
        </div>
        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
        <p className="text-xs text-ink-500">
          You can change any of these, or remove their access completely, at any time from this page.
        </p>
      </div>
    </Modal>
  );
}

/* ── Change password ───────────────────────────────────────────────────── */

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setErrors({});
  }, [open]);

  const submit = async (): Promise<void> => {
    const result = validate(changePasswordSchema, { currentPassword, newPassword, confirmPassword });
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await services().auth.changePassword(result.value.currentPassword, result.value.newPassword);
      toast.success('Password changed', 'Use the new password next time you sign in.');
      onClose();
    } catch (error) {
      setErrors({ form: error instanceof Error ? error.message : 'That did not work.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="At least 10 characters, including a capital letter and a number. Nobody at Mama Care can read your password."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void submit()} loading={saving}>Change password</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Current password" htmlFor="pw-current" error={errors.currentPassword} required>
          <PasswordInput id="pw-current" autoComplete="current-password" value={currentPassword} onValueChange={setCurrentPassword} invalid={Boolean(errors.currentPassword)} />
        </Field>
        <FieldGrid columns={2}>
          <Field label="New password" htmlFor="pw-new" error={errors.newPassword} required>
            <PasswordInput id="pw-new" autoComplete="new-password" value={newPassword} onValueChange={setNewPassword} invalid={Boolean(errors.newPassword)} />
          </Field>
          <Field label="Confirm new password" htmlFor="pw-confirm" error={errors.confirmPassword} required>
            <PasswordInput id="pw-confirm" autoComplete="new-password" value={confirmPassword} onValueChange={setConfirmPassword} invalid={Boolean(errors.confirmPassword)} />
          </Field>
        </FieldGrid>
        {errors.form ? <p className="alert alert-error">{errors.form}</p> : null}
      </div>
    </Modal>
  );
}

/* ── Delete account ────────────────────────────────────────────────────── */

function DeleteAccountModal({ open, onClose, onDeleted }: { open: boolean; onClose: () => void; onDeleted: () => void }) {
  const toast = useToast();
  const { actor } = useSession();
  const [password, setPassword] = useState('');
  const [typed, setTyped] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsPassword = services().auth.kind === 'local';

  useEffect(() => {
    if (!open) return;
    setPassword('');
    setTyped('');
    setError(null);
  }, [open]);

  const submit = async (): Promise<void> => {
    if (typed.trim().toUpperCase() !== 'DELETE') {
      setError('Type DELETE to confirm.');
      return;
    }
    if (needsPassword && !password) {
      setError('Enter your password to confirm this is you.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await services().deleteAccount(needsPassword ? password : undefined);
      toast.success('Account deleted', 'Your records have been removed.');
      onDeleted();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'The account could not be deleted.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete your account"
      description={`This permanently removes ${actor?.email ?? 'your account'} and every record you own. There is no undo and no recovery.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep my account</Button>
          <Button variant="danger" onClick={() => void submit()} loading={saving} disabled={typed.trim().toUpperCase() !== 'DELETE'}>
            Delete permanently
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <ul className="checklist">
          <li>Pregnancies, babies, appointments, reminders, observations and journal entries are deleted.</li>
          <li>Uploaded documents are deleted, including the files themselves.</li>
          <li>Care links and supporter invitations are removed — those people lose access immediately.</li>
          <li>Your authentication account is deleted, so you cannot sign in again with this email.</li>
          <li>Records a provider entered in their own system are not affected. Ask them separately.</li>
        </ul>
        <p className="text-sm text-ink-600">
          If you only want a copy of your data first, export it from the Privacy &amp; data section before deleting.
        </p>
        {needsPassword ? (
          <Field label="Your password" htmlFor="del-password" required hint="Confirms this is you on a device-only account.">
            <PasswordInput id="del-password" autoComplete="current-password" value={password} onValueChange={setPassword} invalid={Boolean(error)} />
          </Field>
        ) : null}
        <Field label="Type DELETE to confirm" htmlFor="del-typed" required>
          <TextInput id="del-typed" value={typed} onValueChange={setTyped} placeholder="DELETE" invalid={Boolean(error)} />
        </Field>
        {error ? <p className="alert alert-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

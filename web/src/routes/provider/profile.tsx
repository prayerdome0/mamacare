/**
 * Provider profile.
 *
 * The professional record that appears in the public directory and on a patient's
 * care-team card. Two things are deliberately visible here rather than hidden in
 * admin: the verification status with the reason if it was rejected, and the two
 * switches that decide whether a mother can find and choose this clinician.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  Building2,
  CalendarX,
  Eye,
  EyeOff,
  LogOut,
  Pencil,
  ShieldAlert,
  Stethoscope,
  UserRound,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { facilityRepo, providerRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { services } from '@/services/session-store';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime } from '@/lib/utils';
import { providerRegistrationSchema, type ProviderRegistrationValues } from '@/lib/validation';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { PROFESSION_LABELS, type Facility, type HealthcareProvider, type Profession } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, FieldGrid, PasswordInput, Select, Switch, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

/** "Verified nurse" for nurses, "Verified <profession>" for everyone else. */
const verifiedLabel = (profession: HealthcareProvider['profession']): string =>
  profession === 'nurse' ? 'Verified nurse' : `Verified ${PROFESSION_LABELS[profession]}`;

const STATUS_COPY: Record<HealthcareProvider['status'], { label: string; tone: 'green' | 'amber' | 'red' | 'neutral'; body: string }> = {
  approved: {
    label: 'Verified',
    tone: 'green',
    body: 'Your licence details have been checked by an administrator. Mothers can find you in the public directory and link their care to you.',
  },
  pending: {
    label: 'Awaiting verification',
    tone: 'amber',
    body: 'An administrator still needs to confirm your licence and facility. You can use the portal for patients who have already linked you, but you are not listed publicly yet.',
  },
  rejected: {
    label: 'Not verified',
    tone: 'red',
    body: 'Verification was declined. The reason is shown below — correct the details and submit again, or contact the administrator.',
  },
  suspended: {
    label: 'Suspended',
    tone: 'red',
    body: 'Access has been suspended by an administrator. Existing patients keep their records; you cannot be linked by new ones.',
  },
};

export default function ProviderProfile() {
  const { actor, signOut } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const uid = actor?.uid ?? '';
  const [editing, setEditing] = useState(false);
  const [photo, setPhoto] = useState<ImageUploadResult | null>(null);
  const [savingPhoto, setSavingPhoto] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const { data: provider, loading, error, retryable, run } = useAsync(() => providerRepo.mine(), {
    deps: [uid],
    immediate: Boolean(uid),
  });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });

  useEffect(() => {
    document.title = 'My profile · Mama Care';
  }, []);

  const status = provider ? STATUS_COPY[provider.status] : null;

  const savePhoto = async (result: ImageUploadResult | null): Promise<void> => {
    if (!provider) return;
    setPhoto(result);
    setSavingPhoto(true);
    try {
      await providerRepo.update(provider.id, {
        photoUrl: result?.secureUrl ?? null,
        photoPublicId: result?.publicId ?? null,
      });
      await logAudit('media-upload', 'providers', provider.id, result ? 'Profile photo updated' : 'Profile photo removed');
      toast.success(result ? 'Photo updated' : 'Photo removed');
      void run();
    } catch {
      toast.error('That did not save', 'Try again, or check the connection.');
    } finally {
      setSavingPhoto(false);
    }
  };

  const toggle = async (patch: Partial<HealthcareProvider>, message: string): Promise<void> => {
    if (!provider) return;
    await providerRepo.update(provider.id, patch);
    await logAudit('record-update', 'providers', provider.id, message);
    toast.success(message);
    void run();
  };

  const resubmit = async (): Promise<void> => {
    if (!provider) return;
    const ok = await confirm({
      title: 'Submit for verification again?',
      message:
        'An administrator will re-check your licence number and facility. Make sure both are current before you submit — a second decline is recorded against your profile.',
      confirmLabel: 'Submit for review',
    });
    if (!ok) return;
    await providerRepo.update(provider.id, { status: 'pending', rejectionReason: null });
    await logAudit('record-update', 'providers', provider.id, 'Resubmitted for verification');
    toast.success('Submitted', 'You will see the result on this page.');
    void run();
  };

  if (loading) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="My profile" />
        <LoadingRows rows={4} />
      </StaffShell>
    );
  }

  if (!provider) {
    return (
      <StaffShell portal="Healthcare Portal">
        <StaffPageHeader title="My profile" description="Your professional record, verification status and directory settings." />
        {error ? <ErrorState title="Your provider record could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        <Card className="card-pad">
          <EmptyState
            icon={<Stethoscope className="size-6" aria-hidden />}
            title="No professional profile yet"
            description="Your account is signed in as a provider, but the profile record is missing — this happens when registration was completed before the provider step. Create it now: it takes a minute and an administrator verifies it before you appear publicly."
            action={
              <Button variant="primary" size="sm" onClick={() => setEditing(true)}>
                Create my profile
              </Button>
            }
          />
        </Card>
        <ProfileModal
          open={editing}
          provider={null}
          facilities={facilities ?? []}
          defaultName={actor?.displayName ?? ''}
          defaultEmail={actor?.email ?? ''}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            toast.success('Profile created', 'An administrator will verify your details.');
            void run();
          }}
        />
      </StaffShell>
    );
  }

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title={provider.fullName}
        description={`${provider.title ? `${provider.title} · ` : ''}${PROFESSION_LABELS[provider.profession]} · ${provider.facilityName}`}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)} icon={<Pencil className="size-4" aria-hidden />}>
              Edit details
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setPasswordOpen(true)} icon={<ShieldAlert className="size-4" aria-hidden />}>
              Password
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow="Professional record" title="What patients see" description="This is the card shown in the public directory and on a mother's care-team screen." />
            <div className="mt-3 flex flex-wrap items-start gap-4">
              <Avatar name={provider.fullName} src={provider.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="card-title">{provider.fullName}</h3>
                  {status ? (
                    <Badge tone={status.tone}>
                      {provider.status === 'approved' ? (
                        <BadgeCheck className="size-3" aria-hidden />
                      ) : null}
                      {provider.status === 'approved' ? verifiedLabel(provider.profession) : status.label}
                    </Badge>
                  ) : null}
                  {provider.acceptingNewPatients ? <Badge tone="green">Accepting patients</Badge> : <Badge tone="neutral">Not accepting</Badge>}
                </div>
                <p className="mt-1 text-sm text-ink-600">
                  {provider.title ?? PROFESSION_LABELS[provider.profession]} · {provider.facilityName}
                </p>
                <p className="mt-2 text-sm text-ink-700">{provider.bio ?? 'No biography added yet.'}</p>
                <div className="mt-3">
                  <KeyValue
                    columns={2}
                    items={[
                      { label: 'Profession', value: PROFESSION_LABELS[provider.profession] },
                      { label: 'Licence', value: provider.licenseNumber ?? 'Not provided' },
                      { label: 'Languages', value: provider.languages.length > 0 ? provider.languages.join(', ') : 'English' },
                      { label: 'Phone', value: provider.phone ?? 'Not provided' },
                      { label: 'Email', value: provider.email ?? actor?.email ?? '—' },
                      { label: 'Verified', value: provider.verifiedAt ? `${formatDate(provider.verifiedAt, 'day')} by ${provider.verifiedBy ?? 'admin'}` : 'Not yet' },
                    ]}
                  />
                </div>
              </div>
            </div>
            <div className="mt-4">
              <ImageUploader
                folder="profiles"
                label="Profile photo"
                value={photo ?? (provider.photoUrl ? { publicId: provider.photoPublicId, secureUrl: provider.photoUrl } : null)}
                onChange={(result) => void savePhoto(result)}
                disabled={savingPhoto}
                ratio="1 / 1"
                hint="Shown publicly in the directory. Use a professional photo — never an image of a patient."
              />
            </div>
          </Card>

          {provider.status === 'rejected' && provider.rejectionReason ? (
            <Card className="card-pad border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
              <h3 className="card-title">Why verification was declined</h3>
              <p className="mt-1.5 text-sm text-ink-700">{provider.rejectionReason}</p>
              <div className="mt-3">
                <Button variant="primary" size="sm" onClick={() => void resubmit()}>
                  Submit for review again
                </Button>
              </div>
            </Card>
          ) : null}

          <Card className="card-pad">
            <SectionHeading eyebrow="Visibility" title="Directory and availability" description="You control whether mothers can find you. Turning these off does not affect patients already linked to you." />
            <div className="mt-3 space-y-3">
              <Switch
                label="List me in the public directory"
                description="Your name, profession, facility and biography appear on the public providers page. Verification is still required before you are shown."
                checked={provider.listedInDirectory}
                onChange={(checked) => void toggle({ listedInDirectory: checked }, checked ? 'Listed in the directory' : 'Removed from the directory')}
              />
              <Switch
                label="Accepting new patients"
                description="Shown as a badge on your directory card. Turn it off when your caseload is full."
                checked={provider.acceptingNewPatients}
                onChange={(checked) => void toggle({ acceptingNewPatients: checked }, checked ? 'Marked as accepting patients' : 'Marked as not accepting patients')}
              />
            </div>
            {provider.listedInDirectory && provider.status !== 'approved' ? (
              <p className="alert alert-warn mt-3 flex items-start gap-2">
                <EyeOff className="mt-0.5 size-4 shrink-0" aria-hidden />
                You are marked as listed, but the directory only shows verified providers. Complete verification to appear.
              </p>
            ) : null}
            <div className="mt-3">
              <Link to="/providers" className="btn btn-secondary btn-sm">
                <Eye className="size-4" aria-hidden />
                See the public directory
              </Link>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="card-pad">
            <SectionHeading eyebrow="Verification" title={provider.status === 'approved' ? verifiedLabel(provider.profession) : status?.label ?? 'Unknown'} />
            <p className="mt-2 text-sm text-ink-600">{status?.body}</p>
            {provider.verifiedAt ? (
              <p className="mt-2 flex items-center gap-2 text-sm text-ink-700">
                <BadgeCheck className="size-4 text-[var(--color-risk-green)]" aria-hidden />
                Verified {relativeTime(provider.verifiedAt)} by {provider.verifiedBy ?? 'an administrator'}
              </p>
            ) : null}
            {provider.status === 'pending' ? (
              <div className="mt-3">
                <Button variant="secondary" size="sm" onClick={() => toast.info('Already in the queue', 'Verification usually takes one working day.')}>
                  Check status
                </Button>
              </div>
            ) : null}
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Account" title="Sign-in details" />
            <KeyValue
              columns={1}
              items={[
                { label: 'Name', value: actor?.displayName ?? '—' },
                { label: 'Email', value: actor?.email ?? '—' },
                { label: 'Role', value: actor?.role ?? '—' },
                { label: 'Profile photo', value: provider.photoUrl ? 'Uploaded to the media library' : 'Not set' },
              ]}
            />
            <div className="mt-3 actions-wrap">
              <Button variant="secondary" size="sm" onClick={() => setPasswordOpen(true)}>
                Change password
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const ok = await confirm({ title: 'Sign out?', message: 'You will need to sign in again to see your patients.', confirmLabel: 'Sign out' });
                  if (ok) await signOut();
                }}
                icon={<LogOut className="size-4" aria-hidden />}
              >
                Sign out
              </Button>
            </div>
          </Card>

          <Card className="card-pad border-ink-200 bg-ink-50">
            <h3 className="card-title flex items-center gap-2">
              <Building2 className="size-4 text-brand-700" aria-hidden />
              Your facility
            </h3>
            <p className="mt-1.5 text-sm text-ink-600">
              {provider.facilityName}
              {provider.facilityId ? ' — linked to the facility record, so mothers can find directions and opening hours from your profile.' : ' — entered as text. Linking it to a facility record adds address, hours and services automatically.'}
            </p>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                Update facility
              </Button>
            </div>
          </Card>

          <Card className="card-pad">
            <SectionHeading eyebrow="Responsibility" title="What a profile commits you to" />
            <ul className="checklist mt-2 text-sm">
              <li>Keep your licence number current — it is checked against the professional council.</li>
              <li>Reply to messages within your working hours, and say so if you cannot.</li>
              <li>Never diagnose or change medication through the app alone.</li>
              <li>Turn availability off rather than leaving patients waiting on a reply.</li>
            </ul>
          </Card>
        </div>
      </div>

      <ProfileModal
        open={editing}
        provider={provider}
        facilities={facilities ?? []}
        defaultName={actor?.displayName ?? ''}
        defaultEmail={actor?.email ?? ''}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          toast.success('Profile saved');
          void run();
        }}
      />

      <PasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </StaffShell>
  );
}

function ProfileModal({
  open,
  provider,
  facilities,
  defaultName,
  defaultEmail,
  onClose,
  onSaved,
}: {
  open: boolean;
  provider: HealthcareProvider | null;
  facilities: Facility[];
  defaultName: string;
  defaultEmail: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const form = useForm<ProviderRegistrationValues>(providerRegistrationSchema, {
    fullName: provider?.fullName ?? defaultName,
    title: provider?.title ?? '',
    profession: provider?.profession ?? 'midwife',
    facilityId: provider?.facilityId ?? '',
    facilityName: provider?.facilityName ?? '',
    licenseNumber: provider?.licenseNumber ?? '',
    languages: (provider?.languages ?? ['English']).join(', '),
    bio: provider?.bio ?? '',
    phone: provider?.phone ?? '',
  });
  const [email, setEmail] = useState(provider?.email ?? defaultEmail);

  useEffect(() => {
    if (!open) return;
    form.reset({
      fullName: provider?.fullName ?? defaultName,
      title: provider?.title ?? '',
      profession: provider?.profession ?? 'midwife',
      facilityId: provider?.facilityId ?? '',
      facilityName: provider?.facilityName ?? '',
      licenseNumber: provider?.licenseNumber ?? '',
      languages: (provider?.languages ?? ['English']).join(', '),
      bio: provider?.bio ?? '',
      phone: provider?.phone ?? '',
    });
    setEmail(provider?.email ?? defaultEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, provider]);

  const facilityOptions = useMemo(
    () => [{ value: '', label: 'Not listed — type it below' }, ...facilities.map((facility) => ({ value: facility.id, label: facility.name }))],
    [facilities],
  );

  const onSubmit = async (values: ProviderRegistrationValues): Promise<void> => {
    const languages = values.languages
      .split(',')
      .map((language) => language.trim())
      .filter(Boolean);
    const facility = facilities.find((candidate) => candidate.id === values.facilityId) ?? null;
    const payload = {
      fullName: values.fullName,
      title: values.title || null,
      profession: values.profession as Profession,
      facilityId: facility?.id ?? null,
      facilityName: facility?.name ?? values.facilityName,
      licenseNumber: values.licenseNumber || null,
      languages: languages.length > 0 ? languages : ['English'],
      bio: values.bio || null,
      phone: values.phone || null,
      email: email.trim() || actor?.email || null,
    };
    if (provider) {
      await providerRepo.update(provider.id, payload);
      await logAudit('record-update', 'providers', provider.id, 'Professional profile updated');
    } else {
      await providerRepo.create({
        ...payload,
        userId: actor?.uid ?? null,
        photoUrl: null,
        photoPublicId: null,
        status: 'pending',
        verifiedBy: null,
        verifiedAt: null,
        rejectionReason: null,
        acceptingNewPatients: true,
        listedInDirectory: true,
      } as Omit<HealthcareProvider, 'id' | 'createdAt' | 'updatedAt'>);
      await logAudit('record-create', 'providers', actor?.uid ?? null, 'Professional profile created');
    }
    onSaved();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={provider ? 'Edit professional profile' : 'Create professional profile'}
      description="Mothers use these details to decide whether to link their care to you. An administrator verifies the licence before you appear publicly."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={form.submitting}>Cancel</Button>
          <Button onClick={() => void form.submit(onSubmit)} loading={form.submitting} icon={<UserRound className="size-4" aria-hidden />}>
            {provider ? 'Save changes' : 'Create profile'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="Full name" htmlFor="pp-name" required error={form.errors.fullName}>
            <TextInput id="pp-name" value={form.values.fullName} onValueChange={(value) => form.setField('fullName', value)} onBlur={() => form.blur('fullName')} invalid={Boolean(form.errors.fullName)} />
          </Field>
          <Field label="Title" htmlFor="pp-title" optional hint="e.g. Sr., Dr., CNO">
            <TextInput id="pp-title" value={form.values.title} onValueChange={(value) => form.setField('title', value)} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Profession" htmlFor="pp-profession" required error={form.errors.profession}>
            <Select
              id="pp-profession"
              value={form.values.profession}
              onChange={(event) => form.setField('profession', event.target.value as Profession)}
              options={(Object.keys(PROFESSION_LABELS) as Profession[]).map((value) => ({ value, label: PROFESSION_LABELS[value] }))}
            />
          </Field>
          <Field label="Licence number" htmlFor="pp-licence" optional hint="Checked against your professional council.">
            <TextInput id="pp-licence" value={form.values.licenseNumber} onValueChange={(value) => form.setField('licenseNumber', value)} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Facility" htmlFor="pp-facility" hint="Link a record to include address and hours automatically.">
            <Select
              id="pp-facility"
              value={form.values.facilityId}
              onChange={(event) => {
                const id = event.target.value;
                form.setField('facilityId', id);
                const chosen = facilities.find((facility) => facility.id === id);
                if (chosen) form.setField('facilityName', chosen.name);
              }}
              options={facilityOptions}
            />
          </Field>
          <Field label="Facility name" htmlFor="pp-facility-name" required error={form.errors.facilityName}>
            <TextInput id="pp-facility-name" value={form.values.facilityName} onValueChange={(value) => form.setField('facilityName', value)} invalid={Boolean(form.errors.facilityName)} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Phone" htmlFor="pp-phone" required error={form.errors.phone} hint="Shown to patients who have linked you.">
            <TextInput id="pp-phone" value={form.values.phone} onValueChange={(value) => form.setField('phone', value)} onBlur={() => form.blur('phone')} invalid={Boolean(form.errors.phone)} placeholder="+260…" />
          </Field>
          <Field label="Public email" htmlFor="pp-email" optional hint="Leave blank to use your sign-in email.">
            <TextInput id="pp-email" value={email} onValueChange={setEmail} type="email" />
          </Field>
        </FieldGrid>
        <Field label="Languages you consult in" htmlFor="pp-languages" optional hint="Comma separated.">
          <TextInput id="pp-languages" value={form.values.languages} onValueChange={(value) => form.setField('languages', value)} placeholder="English, Bemba, Nyanja" />
        </Field>
        <Field label="Biography" htmlFor="pp-bio" optional hint="Two or three sentences about your practice and who you care for.">
          <TextArea id="pp-bio" rows={4} value={form.values.bio} onChange={(event) => form.setField('bio', event.target.value)} />
        </Field>
        {form.formError ? <p className="alert alert-error">{form.formError}</p> : null}
        <p className="flex items-start gap-2 text-xs text-ink-500">
          <CalendarX className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Do not include a patient's name or any identifying detail in your biography — this page is public.
        </p>
      </div>
    </Modal>
  );
}

function PasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmValue, setConfirmValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrent('');
    setNext('');
    setConfirmValue('');
    setError(null);
  }, [open]);

  const submit = async (): Promise<void> => {
    setError(null);
    if (next.length < 10) { setError('Use at least 10 characters, including a capital letter and a number.'); return; }
    if (next !== confirmValue) { setError('The new passwords do not match.'); return; }
    setBusy(true);
    try {
      await services().auth.changePassword(current, next);
      toast.success('Password changed', 'Use the new password next time you sign in.');
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work. Check your current password and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Your password protects patient records as well as your own. Use something you do not reuse elsewhere."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={() => void submit()} loading={busy}>Update password</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Current password" htmlFor="pw-current" optional hint="Only needed for accounts created on this device.">
          <PasswordInput id="pw-current" value={current} onValueChange={setCurrent} autoComplete="current-password" />
        </Field>
        <Field label="New password" htmlFor="pw-next" required error={error && next.length < 8 ? error : undefined}>
          <PasswordInput id="pw-next" value={next} onValueChange={setNext} autoComplete="new-password" invalid={Boolean(error && next.length < 8)} />
        </Field>
        <Field label="Confirm new password" htmlFor="pw-confirm" required>
          <PasswordInput id="pw-confirm" value={confirmValue} onValueChange={setConfirmValue} autoComplete="new-password" invalid={Boolean(error && next !== confirmValue)} />
        </Field>
        {error ? <p className="alert alert-error">{error}</p> : null}
      </div>
    </Modal>
  );
}

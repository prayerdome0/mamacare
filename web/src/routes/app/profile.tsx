import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, NoticeState } from '@/components/ui/display';
import { Field, PasswordInput, Select, TextInput } from '@/components/ui/form';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { useSession } from '@/providers/app-providers';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';

import { PREFERRED_LANGUAGES, ROLE_LABELS } from '@/types/domain';
import type { UserProfile } from '@/types/domain';
import { formatDate } from '@/lib/utils';
import { changePasswordSchema, profileUpdateSchema } from '@/lib/validation';
import { useForm } from '@/hooks/use-form';

/**
 * The signed-in worker’s own account: what the directory holds about them, the
 * password, and how much authority their session currently carries. Privilege
 * fields are shown read-only on purpose — the policy module refuses a
 * self-privileged write, and this UI never pretends otherwise.
 */
export default function ProfilePage() {
  const { link: navLink } = useNavScope();
  const { actor, providerKind, signOut, refresh } = useSession();
  const toast = useToast();
  const directory = useAsync(() => (actor ? services().data.get('users', actor.uid) : Promise.resolve(null)), { deps: [actor?.uid] });
  const facility = useAsync(() => (actor?.facilityId ? services().data.get('facilities', actor.facilityId) : Promise.resolve(null)), {
    deps: [actor?.facilityId],
  });
  const profile = directory.data as UserProfile | null;

  const form = useForm(profileUpdateSchema, {
    fullName: profile?.fullName ?? actor?.displayName ?? '',
    phone: profile?.phone ?? '',
    title: profile?.title ?? '',
    licenseNumber: profile?.licenseNumber ?? '',
    preferredLanguage: 'English',
  });
  const [photo, setPhoto] = useState<ImageUploadResult | null>(null);

  useEffect(() => {
    if (!profile) return;
    form.setValues({
      fullName: profile.fullName,
      phone: profile.phone ?? '',
      title: profile.title ?? '',
      licenseNumber: profile.licenseNumber ?? '',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.updatedAt, profile?.id]);

  const save = async () => {
    if (!actor) return;
    await form.submit(async (values) => {
      await services().data.update('users', actor.uid, {
        fullName: values.fullName,
        phone: values.phone || null,
        title: values.title || null,
        licenseNumber: values.licenseNumber || null,
        updatedAt: new Date().toISOString(),
        updatedBy: actor.uid,
        photoUrl: photo?.secureUrl ?? profile?.photoUrl ?? null,
        photoPublicId: photo?.publicId ?? profile?.photoPublicId ?? null,
      } as Partial<UserProfile>);
      if (values.fullName !== actor.displayName) {
        await services().auth.updateProfile({ displayName: values.fullName });
      }
      toast.success('Profile saved', 'Your name and contact details are updated for the directory.');
      setPhoto(null);
      void directory.run();
      void refresh();
    });
  };

  return (
    <AppShell title="My profile" subtitle={`${actor ? ROLE_LABELS[actor.role] : ''}${actor?.facilityId && facility.data ? ` · ${facility.data.name}` : ''}`}>
      <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card title="Directory entry" description="What your colleagues and the facility see. Email and role are managed by an administrator.">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <Avatar name={profile?.fullName ?? actor?.displayName ?? '—'} src={photo?.secureUrl ?? profile?.photoUrl ?? null} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="h3">{profile?.fullName ?? actor?.displayName}</p>
                <p className="caption mt-0.5 break-all">{actor?.email}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand">{actor ? ROLE_LABELS[actor.role] : ''}</Badge>
                <Badge tone={profile?.status === 'ACTIVE' ? 'green' : 'amber'}>{profile?.status.replace(/_/g, ' ').toLowerCase() ?? 'active'}</Badge>
                {profile?.emailVerified ? <Badge tone="green">email verified</Badge> : <Badge tone="amber">email not verified</Badge>}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <div className="space-y-3">
                <Field label="Full name" error={form.errors.fullName} required>
                  <TextInput value={form.values.fullName} onValueChange={(value) => form.setField('fullName', value)} onBlur={() => form.blur('fullName')} invalid={Boolean(form.errors.fullName)} autoComplete="name" />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Work phone" error={form.errors.phone} hint="Used when a supervisor needs to reach you about an escalation.">
                    <TextInput value={form.values.phone} onValueChange={(value) => form.setField('phone', value)} placeholder="+260 97 000 0000" inputMode="tel" />
                  </Field>
                  <Field label="Professional title" error={form.errors.title}>
                    <TextInput value={form.values.title} onValueChange={(value) => form.setField('title', value)} placeholder="Senior midwife" />
                  </Field>
                  <Field label="Licence number" error={form.errors.licenseNumber} hint="Checked at approval; shown on reports you sign.">
                    <TextInput value={form.values.licenseNumber} onValueChange={(value) => form.setField('licenseNumber', value)} placeholder="MDCZ-00000" />
                  </Field>
                  <Field label="Preferred language" hint="Used for your reminders and the reading you are given.">
                    <Select
                      value={form.values.preferredLanguage ?? 'English'}
                      options={PREFERRED_LANGUAGES.map((language) => ({ value: language, label: language }))}
                      onValueChange={(value) => form.setField('preferredLanguage', value)}
                      placeholder={null}
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <Button onClick={() => void save()} loading={form.submitting} disabled={!form.dirty} icon={<Save className="size-4" aria-hidden />}>
                    Save changes
                  </Button>
                  {form.dirty ? <span className="caption">You have unsaved edits.</span> : null}
                </div>
                {form.formError ? (
                  <div className="pt-1">
                    <NoticeState tone="error" title="The change was not saved" compact>
                      {form.formError}
                    </NoticeState>
                  </div>
                ) : null}
              </div>

              <Field label="Portrait" optional hint="Stored in mamacare/profiles. Used in the directory and on reports.">
                <ImageUploader folder="profiles" value={photo ?? (profile?.photoUrl || profile?.photoPublicId ? { publicId: profile.photoPublicId ?? null, secureUrl: profile.photoUrl ?? null } : null)} onChange={setPhoto} ratio="1 / 1" label="Portrait" />
              </Field>
            </div>
          </Card>

          <PasswordCard />
        </div>

        <div className="space-y-4">
          <Card title="Session and access" description="How this browser is authorised right now.">
            <KeyValue
              columns={1}
              items={[
                { label: 'User id', value: <span className="break-all text-[0.8rem]">{actor?.uid}</span> },
                { label: 'Authority comes from', value: actor?.claimsSource === 'firebase-id-token' ? 'Firebase custom claims' : actor?.claimsSource === 'firebase-profile' ? 'Profile document (claims not yet issued)' : 'Local session (device provider)' },
                { label: 'Privilege version', value: actor?.privilegeVersion ?? 1 },
                { label: 'Data provider', value: providerKind === 'firebase' ? 'Cloud Firestore' : 'This device (IndexedDB)' },
                { label: 'Facility', value: facility.data?.name ?? (actor?.facilityId ? 'Loading…' : 'None assigned') },
                { label: 'Account created', value: profile?.createdAt ? formatDate(profile.createdAt) : '—' },
                { label: 'Last sign-in', value: profile?.lastLoginAt ? formatDate(profile.lastLoginAt) : '—' },
              ]}
            />
            <p className="caption mt-3 flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--color-risk-green)]" aria-hidden />
              Role and facility are set by an administrator only. Changing them here is rejected by both the client policy module and the Firestore rules, so a
              tampered bundle cannot grant itself access.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => void refresh()} loading={directory.loading}>
                Re-read my claims
              </Button>
              <Button variant="ghost" size="sm" onClick={() => void signOut()} icon={<LogOut className="size-4" aria-hidden />}>
                Sign out
              </Button>
            </div>
          </Card>

          {facility.data ? (
            <Card title="My facility" actions={actor?.role === 'ADMIN' ? <Link to="/admin/facilities" className="text-[0.78rem] font-semibold text-brand-800 hover:underline">Edit</Link> : null}>
              <KeyValue
                columns={1}
                items={[
                  { label: 'Name', value: facility.data.name, tone: 'strong' },
                  { label: 'Code', value: facility.data.code },
                  { label: 'Type', value: facility.data.type.replace(/_/g, ' ').toLowerCase() },
                  { label: 'District', value: `${facility.data.district}, ${facility.data.province}` },
                  { label: 'Maternity ward', value: facility.data.hasMaternityWard ? 'Yes' : 'No' },
                  { label: 'Ultrasound', value: facility.data.hasUltrasound ? 'Available' : 'Not available' },
                  { label: 'Laboratory', value: facility.data.hasLaboratory ? 'Available' : 'Not available' },
                  { label: 'Contact', value: facility.data.phone ?? facility.data.email ?? '—' },
                ]}
              />
            </Card>
          ) : null}

          <Card title="Account changes that need an administrator">
            <ul className="space-y-2 text-[0.84rem] text-ink-600">
              <li>· Changing your role or facility.</li>
              <li>· Temporarily suspending or deactivating this account.</li>
              <li>· Signing you out of every device after a lost phone.</li>
            </ul>
            <p className="caption mt-3">
              These are deliberate: a self-service path would let any account widen its own access. Ask an administrator to do it in Admin → Users, where the
              change is audited.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function PasswordCard() {
  const toast = useToast();
  const form = useForm(changePasswordSchema, { currentPassword: '', newPassword: '', confirmPassword: '' });

  const change = async () => {
    await form.submit(async (values) => {
      try {
        await services().auth.changePassword(values.currentPassword || null, values.newPassword);
      } catch (caught) {
        throw new Error(caught instanceof Error ? caught.message : 'The password could not be changed.');
      }
      toast.success('Password changed', 'Other devices stay signed in until their token expires; ask an administrator to sign you out everywhere if a device is lost.');
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    });
  };

  return (
    <Card title="Password" description="Minimum 10 characters with upper and lower case plus a digit.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password" required error={form.errors.currentPassword} hint="Required by both the hosted and device providers.">
          <PasswordInput value={form.values.currentPassword} onChange={(event) => form.setField('currentPassword', event.target.value)} onBlur={() => form.blur('currentPassword')} autoComplete="current-password" invalid={Boolean(form.errors.currentPassword)} />
        </Field>
        <Field label="New password" required error={form.errors.newPassword}>
          <PasswordInput value={form.values.newPassword} onChange={(event) => form.setField('newPassword', event.target.value)} onBlur={() => form.blur('newPassword')} autoComplete="new-password" />
        </Field>
        <Field label="Repeat new password" required error={form.errors.confirmPassword}>
          <PasswordInput value={form.values.confirmPassword} onChange={(event) => form.setField('confirmPassword', event.target.value)} onBlur={() => form.blur('confirmPassword')} autoComplete="new-password" />
        </Field>
      </div>
      {form.formError ? (
        <div className="mt-3">
          <NoticeState tone="error" title="Password not changed" compact>
            {form.formError}
          </NoticeState>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button onClick={() => void change()} loading={form.submitting} icon={<KeyRound className="size-4" aria-hidden />}>
          Change password
        </Button>
        <Link to="/auth/forgot-password" className="text-[0.8rem] font-semibold text-brand-800 hover:underline">
          Forgot it? Send a reset link
        </Link>
      </div>
    </Card>
  );
}

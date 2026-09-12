import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Eye, KeyRound, LogOut, Phone, Save, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, NoticeState } from '@/components/ui/display';
import { Field, PasswordInput, Select, TextInput } from '@/components/ui/form';
import { useForm } from '@/hooks/use-form';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { changePasswordSchema, profileUpdateSchema } from '@/lib/validation';
import { PREFERRED_LANGUAGES, type Mother } from '@/types/domain';
import { telHref } from '@/lib/utils';
import { NoRecordNotice, useMotherRecord } from '@/routes/mother/shared';

/**
 * Her account and her privacy. What she may change here is contact detail and
 * language; anything clinical is corrected by the clinic so the record stays
 * auditable.
 */
export default function MotherProfile() {
  const { actor, signOut, providerKind } = useSession();
  const toast = useToast();
  const { motherId, chart } = useMotherRecord();
  const mother = chart.data?.mother as Mother | undefined;

  const form = useForm(profileUpdateSchema, { fullName: '', phone: '', title: '', licenseNumber: '', preferredLanguage: 'English' });
  const [language, setLanguage] = useState('English');

  useEffect(() => {
    if (!mother) return;
    form.setValues({ fullName: mother.fullName, phone: mother.phone ?? '', title: '', licenseNumber: '' });
    setLanguage(mother.preferredLanguage ?? 'English');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mother?.id, mother?.phone, mother?.fullName]);

  const save = async () => {
    if (!mother) return;
    await form.submit(async (values) => {
      try {
        await services().data.updateMother(mother.id, {
          fullName: values.fullName,
          phone: values.phone,
          preferredLanguage: language,
        } as Partial<Mother>);
        if (actor) await services().auth.updateProfile({ displayName: values.fullName });
        toast.success('Saved', 'Your clinic sees the change the next time they open your record.');
        void chart.run();
      } catch (error) {
        toast.error(error, 'The change was not saved');
        throw error;
      }
    });
  };

  if (!motherId) {
    return (
      <AppShell title="My account">
        <NoRecordNotice />
      </AppShell>
    );
  }

  return (
    <AppShell title="My account" subtitle={actor?.email} actions={
      <Button size="sm" variant="secondary" onClick={() => void signOut()} icon={<LogOut className="size-4" aria-hidden />}>
        Sign out
      </Button>
    }>
      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card title="Me and my contact details">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={mother?.fullName ?? actor?.displayName ?? 'Me'} src={mother?.photoUrl ?? null} size="lg" />
              <div className="min-w-0">
                <p className="h3">{mother?.fullName ?? '—'}</p>
                <p className="caption mt-0.5">Patient number {mother?.patientId ?? '—'}</p>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="My name" error={form.errors.fullName} required hint="Tell your clinic if this needs to change.">
                <TextInput value={form.values.fullName} onValueChange={(value) => form.setField('fullName', value)} onBlur={() => form.blur('fullName')} />
              </Field>
              <Field label="Phone number" error={form.errors.phone} required hint="Used for appointment reminders.">
                <TextInput value={form.values.phone} onValueChange={(value) => form.setField('phone', value)} inputMode="tel" placeholder="+260 97 000 0000" />
              </Field>
              <Field label="Language for reminders and reading" required>
                <Select value={language} options={PREFERRED_LANGUAGES.map((item) => ({ value: item, label: item }))} onValueChange={setLanguage} placeholder={null} />
              </Field>
              <Field label="Sign-in email" hint="Only your clinic can change the email on your account.">
                <TextInput value={actor?.email ?? ''} disabled readOnly />
              </Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button onClick={() => void save()} loading={form.submitting} disabled={!form.dirty && language === mother?.preferredLanguage} icon={<Save className="size-4" aria-hidden />}>
                Save changes
              </Button>
              {mother?.phone ? (
                <a href={telHref(mother.phone)} className="btn btn-quiet btn-sm inline-flex items-center gap-1.5">
                  <Phone className="size-4" aria-hidden /> Test my number
                </a>
              ) : null}
            </div>
          </Card>

          <PasswordCard providerKind={providerKind} />
        </div>

        <div className="space-y-4">
          <Card title="Who can see my record">
            <KeyValue
              columns={1}
              items={[
                { label: 'My clinic', value: mother ? 'The midwives, nurses and doctors at the facility where I am registered' : '—' },
                { label: 'My community health worker', value: mother?.assignedChwUserId ? 'Yes — the person who visits me at home' : 'Not assigned' },
                {
                label: 'A facility I was referred to',
                value: (chart.data?.referrals ?? []).some((row) => row.status !== 'CLOSED')
                  ? 'Only the records in the referral, for as long as I am under their care'
                  : 'No referral is open right now',
              },
                { label: 'My employer, family or anyone else', value: 'Never' },
                { label: 'Researchers or partners', value: 'Only numbers with names and identifiers removed, and only with approval' },
              ]}
            />
            <p className="caption mt-3 flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[var(--color-risk-green)]" aria-hidden />
              Access is enforced by the database rules, not by this screen. Any read or change to your record is written in a log your clinic can be asked
              about.
            </p>
          </Card>

          <Card title="What I can change myself">
            <ul className="space-y-1.5 text-[0.86rem] text-ink-700">
              <li>· My name, phone number and the language I want to read in.</li>
              <li>· My password, and whether this phone gets reminders.</li>
              <li>· Nothing clinical — dates, results and the baby’s measurements are corrected by the clinic so the history stays honest.</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/home/notifications" className="btn btn-secondary btn-sm">
                Reminder settings
              </Link>
              <Link to="/contact" className="btn btn-quiet btn-sm">
                Contact my clinic
              </Link>
            </div>
          </Card>

          <Card title="If you are worried about privacy">
            <NoticeState tone="info" title="On a shared phone" compact>
              Turn reminders off, sign out when you finish, and tell your clinic if someone else knows your password. Your record itself stays in the clinic’s
              system and is never stored on the phone.
            </NoticeState>
            <div className="mt-3">
              <Button variant="secondary" size="sm" onClick={() => void signOut()} icon={<LogOut className="size-4" aria-hidden />}>
                Sign out now
              </Button>
            </div>
          </Card>

          <Card title="Record status">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={mother?.status === 'ACTIVE' ? 'green' : 'amber'}>{mother?.status === 'ACTIVE' ? 'Active care' : (mother?.status ?? 'unknown').replace(/_/g, ' ').toLowerCase()}</Badge>
              <Badge tone="neutral">{chart.data?.visits.length ?? 0} visits recorded</Badge>
              <Badge tone="neutral">{chart.data?.documents.length ?? 0} documents shared</Badge>
              <Link to="/home/records" className="inline-flex items-center gap-1 text-[0.8rem] font-semibold text-brand-800 hover:underline">
                <Eye className="size-3.5" aria-hidden /> See my record
              </Link>
            </div>
            <p className="caption mt-3">
              A record is never deleted by the app. If your pregnancy has ended, your clinic closes the record and keeps the history for the retention period
              they can tell you about.
            </p>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function PasswordCard({ providerKind }: { providerKind: string }) {
  const toast = useToast();
  const form = useForm(changePasswordSchema, { currentPassword: '', newPassword: '', confirmPassword: '' });

  const change = async () => {
    await form.submit(async (values) => {
      try {
        await services().auth.changePassword(values.currentPassword || null, values.newPassword);
      } catch (error) {
        throw new Error(error instanceof Error ? error.message : 'Your password could not be changed.');
      }
      toast.success('Password changed', 'Use the new password next time you sign in.');
      form.reset({ currentPassword: '', newPassword: '', confirmPassword: '' });
    });
  };

  return (
    <Card title="Password" description="At least 10 characters, with a capital letter, a small letter and a number.">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Current password" required error={form.errors.currentPassword}>
          <PasswordInput value={form.values.currentPassword} onChange={(event) => form.setField('currentPassword', event.target.value)} onBlur={() => form.blur('currentPassword')} autoComplete="current-password" />
        </Field>
        <Field label="New password" required error={form.errors.newPassword}>
          <PasswordInput value={form.values.newPassword} onChange={(event) => form.setField('newPassword', event.target.value)} onBlur={() => form.blur('newPassword')} autoComplete="new-password" />
        </Field>
        <Field label="Type it again" required error={form.errors.confirmPassword}>
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
        <Link to="/forgot-password" className="text-[0.8rem] font-semibold text-brand-800 hover:underline">
          I cannot remember it
        </Link>
        {providerKind === 'local' ? <span className="caption">This device holds the account locally, so changing the password affects only this phone or browser.</span> : null}
      </div>
    </Card>
  );
}

import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, ShieldQuestion, UserPlus } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button } from '@/components/ui/button';
import { CheckboxRow, Field, PasswordInput, Select, TextInput } from '@/components/ui/form';
import { NoticeState } from '@/components/ui/display';
import { useForm } from '@/hooks/use-form';
import { registerSchema } from '@/lib/validation';
import { registerAccount } from '@/services/auth/registration';
import { COUNTRIES, countryByCode, defaultCountry, normalisePhone } from '@/config/geo';
import { services } from '@/services/session-store';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import type { Role } from '@/types/domain';

/**
 * Self-registration.
 *
 * Two account kinds, one shared form. A patient account is created active and
 * linked to nothing until the facility attaches a record. A health-worker account
 * is created *pending*, with the role it asked for recorded only as a request.
 * ADMIN is not offered, and the service layer forces the initial claims to the
 * least-privileged role regardless of what this page sends.
 */

const REQUESTABLE_ROLES: { value: Role; label: string; detail: string }[] = [
  { value: 'COMMUNITY_HEALTH_WORKER', label: 'Community health worker', detail: 'Catchment follow-up, outreach visits, referral drafting.' },
  { value: 'NURSE', label: 'Nurse', detail: 'Clinical observations, alerts, appointments, documents.' },
  { value: 'MIDWIFE', label: 'Midwife', detail: 'Full antenatal care, delivery entries, referrals.' },
  { value: 'FACILITY_SUPERVISOR', label: 'Facility supervisor', detail: 'Facility-wide view, staff assignment, education content.' },
];

export default function RegisterPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [accepted, setAccepted] = useState(false);
  const [accountKind, setAccountKind] = useState<'PATIENT' | 'HEALTH_WORKER'>('HEALTH_WORKER');

  const facilities = useAsync(async () => services().data.allFacilities(), { immediate: true });

  const facilityOptions = useMemo(
    () =>
      (facilities.data ?? [])
        .filter((facility) => facility.active)
        .map((facility) => ({ value: facility.id, label: `${facility.name} — ${facility.district}` })),
    [facilities.data],
  );

  const form = useForm(registerSchema, {
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    accountKind: 'HEALTH_WORKER',
    requestedRole: 'COMMUNITY_HEALTH_WORKER',
    facilityId: '',
    jobTitle: '',
    preferredLanguage: 'English',
    country: defaultCountry.code,
    acceptTerms: false as unknown as true,
    acceptMarketing: false,
  });

  const selectedCountry = countryByCode(form.values.country) ?? defaultCountry;

  const submit = async () => {
    const result = await form.submit(async (values) => {
      // Store the number in international format (+260 97 1234567) so reminders
      // and the SMS provider see one unambiguous value, whatever was typed.
      const created = await registerAccount({
        ...values,
        accountKind,
        phone: normalisePhone(values.phone, values.country) || values.phone,
      });
      if (created.needsApproval) {
        navigate('/pending-approval', { state: { email: created.email } });
        return;
      }
      toast.success('Account created', 'You can now sign in and share your number with the clinic.');
      navigate('/signin', { state: { email: created.email } });
    });
    if (!result.ok) toast.error(new Error(form.formError ?? ''), 'Registration could not complete');
  };

  const isWorker = accountKind === 'HEALTH_WORKER';

  return (
    <AuthLayout
      title="Create your MAMA CARE account"
      intro="Health workers need approval from their facility before any record is visible. Mothers can sign in as soon as the account exists."
      image="mobileReminder"
      wide
      panelTitle="What you are agreeing to"
      panelPoints={[
        { label: 'Roles are granted, never chosen', detail: 'The role you select here is recorded as a request. An administrator approves it; no account can grant itself administrator access.' },
        { label: 'Your facility controls the data', detail: 'Records you create belong to the facility’s project and are retained under its records policy, not deleted with your account.' },
        { label: 'Everything privileged is logged', detail: 'Account approvals, role changes, record access and exports are written to an audit trail with your identity and the time.' },
        { label: 'Clinical findings need a clinician', detail: 'The app flags recorded values against configured thresholds and tells you what assessment is required. It never states a diagnosis.' },
      ]}
      footer={
        <p className="muted text-center">
          Already registered?{' '}
          <Link to="/signin" className="font-semibold text-brand-800 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <div className="mb-6 inline-flex rounded-lg border border-ink-200 bg-white p-1">
        {[
          { value: 'HEALTH_WORKER' as const, label: 'Health worker' },
          { value: 'PATIENT' as const, label: 'Mother / patient' },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setAccountKind(option.value);
              form.setField('accountKind', option.value);
            }}
            aria-pressed={accountKind === option.value}
            className={`rounded-md px-4 py-2 text-[0.84rem] font-semibold transition-colors ${
              accountKind === option.value ? 'bg-brand-700 text-white' : 'text-ink-600 hover:bg-ink-100'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="space-y-4"
        noValidate
      >
        {form.formError ? <NoticeState tone="error" title="We could not create the account">{form.formError}</NoticeState> : null}

        {isWorker ? (
          <NoticeState tone="info" title="Approval is required before you can open a record">
            A supervisor or administrator at {facilityOptions.length > 0 ? 'your facility' : 'the platform'} confirms this account. You will
            see a waiting screen until then — nothing is shared or visible before approval.
          </NoticeState>
        ) : (
          <NoticeState
            tone="info"
            title="Bring your antenatal card to the clinic"
            actions={
              <Link to="/contact" className="text-[0.8rem] font-semibold text-brand-800 hover:underline">
                Ask your facility to link your record <AlertTriangle className="inline size-3" aria-hidden />
              </Link>
            }
          >
            A mother account shows the record the facility has created for her. Until a midwife links your account to your patient record,
            the portal will be empty.
          </NoticeState>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" error={form.errors.fullName} required htmlFor="fullName">
            <TextInput
              id="fullName"
              autoComplete="name"
              value={form.values.fullName}
              onValueChange={(fullName) => form.setField('fullName', fullName)}
              onBlur={() => form.blur('fullName')}
              invalid={Boolean(form.errors.fullName)}
            />
          </Field>
          <Field
            label="Mobile number"
            error={form.errors.phone}
            required
            htmlFor="phone"
            hint={`Used for appointment reminders and follow-up calls. ${selectedCountry.name} numbers start ${selectedCountry.dialCode}.`}
          >
            <TextInput
              id="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder={selectedCountry.example}
              value={form.values.phone}
              onValueChange={(phone) => form.setField('phone', phone)}
              onBlur={() => form.blur('phone')}
              invalid={Boolean(form.errors.phone)}
            />
          </Field>
        </div>

        {/* Country: Zambia is the deployment default; every other country stays
            selectable so the platform is usable outside Zambia as well. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country" error={form.errors.country} required htmlFor="country" hint="Sets the dialling code, currency and reminder wording.">
            <Select
              id="country"
              value={form.values.country}
              options={COUNTRIES.map((country) => ({
                value: country.code,
                label: country.code === defaultCountry.code ? `${country.name} (${country.dialCode}) — default` : `${country.name} (${country.dialCode})`,
              }))}
              onValueChange={(code) => {
                const next = countryByCode(code) ?? defaultCountry;
                form.setField('country', next.code);
                // Re-express an already-typed local number for the new country.
                if (form.values.phone.trim()) form.setField('phone', normalisePhone(form.values.phone, next.code) || form.values.phone);
              }}
            />
          </Field>
          <Field label={isWorker ? 'Role you are requesting' : 'Preferred language'} htmlFor={isWorker ? 'requestedRole' : 'preferredLanguage'} hint={isWorker ? 'Recorded as a request only. An administrator decides.' : 'Used for your reminders and the reading you are given.'}>
            {isWorker ? (
              <Select
                id="requestedRole"
                value={form.values.requestedRole ?? 'COMMUNITY_HEALTH_WORKER'}
                options={REQUESTABLE_ROLES.map((role) => ({ value: role.value, label: role.label }))}
                onValueChange={(requestedRole) => form.setField('requestedRole', requestedRole as typeof form.values.requestedRole)}
              />
            ) : (
              <Select
                id="preferredLanguage"
                value={form.values.preferredLanguage}
                options={[
                  { value: 'English', label: 'English' },
                  { value: 'Nyanja', label: 'Chinyanja' },
                  { value: 'Bemba', label: 'Ichibemba' },
                  { value: 'Tonga', label: 'Chitonga' },
                  { value: 'Lozi', label: 'Silozi' },
                ]}
                onValueChange={(preferredLanguage) => form.setField('preferredLanguage', preferredLanguage)}
              />
            )}
          </Field>
        </div>

        <Field label={isWorker ? 'Work email' : 'Email'} error={form.errors.email} required htmlFor="email" hint="This is your sign-in name. A personal address is fine for a mother account.">
          <TextInput
            id="email"
            type="email"
            autoComplete="email"
            value={form.values.email}
            onValueChange={(email) => form.setField('email', email)}
            onBlur={() => form.blur('email')}
            invalid={Boolean(form.errors.email)}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" error={form.errors.password} required htmlFor="password" hint="At least 10 characters, with an uppercase letter, a lowercase letter and a number.">
            <PasswordInput
              id="password"
              autoComplete="new-password"
              value={form.values.password}
              onChange={(event) => form.setField('password', event.target.value)}
              onBlur={() => form.blur('password')}
              invalid={Boolean(form.errors.password)}
            />
          </Field>
          <Field label="Confirm password" error={form.errors.confirmPassword} required htmlFor="confirmPassword">
            <PasswordInput
              id="confirmPassword"
              autoComplete="new-password"
              value={form.values.confirmPassword}
              onChange={(event) => form.setField('confirmPassword', event.target.value)}
              onBlur={() => form.blur('confirmPassword')}
              invalid={Boolean(form.errors.confirmPassword)}
            />
          </Field>
        </div>

        {isWorker ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Facility you work at" error={form.errors.facilityId} required htmlFor="facilityId" hint={facilities.loading ? 'Loading the facility list…' : undefined}>
              {facilities.error ? (
                <NoticeState tone="error" title="The facility list did not load" compact>
                  {facilities.error}
                </NoticeState>
              ) : (
                <Select
                  id="facilityId"
                  value={form.values.facilityId}
                  options={facilityOptions}
                  placeholder={facilities.loading ? 'Loading…' : 'Select your facility'}
                  onValueChange={(facilityId) => form.setField('facilityId', facilityId)}
                  onBlur={() => form.blur('facilityId')}
                  invalid={Boolean(form.errors.facilityId)}
                />
              )}
            </Field>
          </div>
        ) : null}

        {isWorker ? (
          <Field label="Job title" optional error={form.errors.jobTitle} htmlFor="jobTitle">
            <TextInput
              id="jobTitle"
              placeholder="e.g. Senior midwife, labour ward"
              value={form.values.jobTitle ?? ''}
              onValueChange={(jobTitle) => form.setField('jobTitle', jobTitle)}
            />
          </Field>
        ) : null}

        <div className="space-y-2 rounded-lg border border-ink-200 bg-ink-50/70 p-3.5">
          <CheckboxRow
            checked={accepted}
            onChange={(next) => {
              setAccepted(next);
              form.setField('acceptTerms', next as unknown as true);
            }}
            label="I accept the terms and the privacy notice"
            description={
              <span>
                I understand records are held by the facility and read by the staff involved in my care.{' '}
                <Link to="/privacy" className="font-semibold text-brand-800 hover:underline" target="_blank">
                  Read the privacy notice
                </Link>
                .
              </span>
            }
          />
          {form.errors.acceptTerms ? <p className="field-error">{form.errors.acceptTerms}</p> : null}
          <CheckboxRow
            checked={Boolean(form.values.acceptMarketing)}
            onChange={(acceptMarketing) => form.setField('acceptMarketing', acceptMarketing)}
            label="Send me product updates for facility administrators"
            description="Optional. Never contains patient information."
          />
        </div>

        <NoticeState tone="warning" title="Administrator access cannot be requested here">
          <span className="flex items-start gap-2">
            <ShieldQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              The role list intentionally stops at facility supervisor. Administrator accounts are created by an existing administrator or,
              on first deployment, through the server-side bootstrap allow-list.
            </span>
          </span>
        </NoticeState>

        <Button type="submit" block size="lg" loading={form.submitting} icon={<UserPlus className="size-4" aria-hidden />}>
          {form.submitting ? 'Creating your account…' : isWorker ? 'Request an account' : 'Create my account'}
        </Button>
      </form>
    </AuthLayout>
  );
}

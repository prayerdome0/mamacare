/**
 * Registration — one flow for mothers, supporters and providers.
 *
 * Four short steps instead of one long form, because on a phone a wall of fields is
 * where people give up. What changes between roles is only step three:
 *
 *   MOTHER    → optional pregnancy dates, so the tracker works on day one
 *   SUPPORTER → the email of the mother they support
 *   PROVIDER  → profession, licence and facility; the account stays pending until
 *               an administrator verifies it
 *
 * Nobody can select an administrator role here. That is deliberate: privileged
 * accounts are granted by an existing administrator, never self-service.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Baby, Check, HandHeart, ShieldCheck, Stethoscope } from 'lucide-react';
import { register, validationErrors, type RegistrationInput } from '@/services/auth/registration';
import { facilityRepo } from '@/services/repositories';
import { useAsync } from '@/hooks';
import { COUNTRIES, countryOptions } from '@/config/geo';
import { eddFromLmp, formatGestationalAge, gestationalAge } from '@/lib/obstetrics';
import { formatDate } from '@/lib/utils';
import { PROFESSION_LABELS, LANGUAGES, type Facility, type LanguageCode, type Profession, type Role } from '@/types/domain';
import { AuthShell } from '@/components/layout/auth-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, PasswordInput, Select, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

type FormState = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  phone: string;
  dateOfBirth: string;
  country: string;
  language: LanguageCode;
  role: Role;
  emergencyName: string;
  emergencyPhone: string;
  emergencyRelationship: string;
  supportsEmail: string;
  profession: Profession | '';
  title: string;
  licenseNumber: string;
  facilityId: string;
  facilityName: string;
  consent: boolean;
};

type PregnancyState = {
  lmpDate: string;
  eddDate: string;
  datingMethod: 'lmp' | 'ultrasound' | 'clinician' | 'unknown';
  previousPregnancies: string;
  previousLiveBirths: string;
};

const INITIAL: FormState = {
  fullName: '',
  email: '',
  password: '',
  confirmPassword: '',
  phone: '',
  dateOfBirth: '',
  country: 'ZM',
  language: 'en',
  role: 'MOTHER',
  emergencyName: '',
  emergencyPhone: '',
  emergencyRelationship: '',
  supportsEmail: '',
  profession: '',
  title: '',
  licenseNumber: '',
  facilityId: '',
  facilityName: '',
  consent: false,
};

const INITIAL_PREGNANCY: PregnancyState = {
  lmpDate: '',
  eddDate: '',
  datingMethod: 'lmp',
  previousPregnancies: '',
  previousLiveBirths: '',
};

const ROLES: { value: Role; title: string; blurb: string; icon: React.ReactNode }[] = [
  {
    value: 'MOTHER',
    title: 'I am pregnant or a new mother',
    blurb: 'Track your pregnancy, appointments, medication and your baby.',
    icon: <Baby className="size-5" aria-hidden />,
  },
  {
    value: 'SUPPORTER',
    title: 'I support a mother',
    blurb: 'A partner, parent or friend who helps with reminders and visits.',
    icon: <HandHeart className="size-5" aria-hidden />,
  },
  {
    value: 'PROVIDER',
    title: 'I am a healthcare provider',
    blurb: 'Midwife, nurse, doctor or community health worker. Verified by an administrator.',
    icon: <Stethoscope className="size-5" aria-hidden />,
  },
];

const STEPS = ['Who you are', 'Your details', 'Your care', 'Confirm'];

export default function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { data: facilities } = useAsync(() => facilityRepo.list(), { deps: [] });

  const requestedRole = params.get('role');
  const [state, setState] = useState<FormState>({
    ...INITIAL,
    role: requestedRole === 'PROVIDER' ? 'PROVIDER' : requestedRole === 'SUPPORTER' ? 'SUPPORTER' : 'MOTHER',
  });
  const [pregnancy, setPregnancy] = useState<PregnancyState>(INITIAL_PREGNANCY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const totalSteps = state.role === 'MOTHER' ? STEPS.length : STEPS.length - 1;

  useEffect(() => {
    document.title = 'Create an account · Mama Care';
  }, []);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setState((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key as string]) return current;
      const next = { ...current };
      delete next[key as string];
      return next;
    });
  };

  const facilityList = useMemo<Facility[]>(() => data0(facilities), [facilities]);

  /* Live due-date preview so the mother can see what the app concluded, and correct it. */
  const preview = useMemo(() => {
    if (!pregnancy.lmpDate && !pregnancy.eddDate) return null;
    const ga = gestationalAge({ lmpDate: pregnancy.lmpDate || null, eddDate: pregnancy.eddDate || null });
    if (!ga.valid) return null;
    const edd = pregnancy.eddDate || (pregnancy.lmpDate ? eddFromLmp(pregnancy.lmpDate) : null);
    return { ga, edd };
  }, [pregnancy.lmpDate, pregnancy.eddDate]);

  const next = (): void => {
    const fieldErrors = validateStep(step);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setStep((current) => Math.min(current + 1, totalSteps - 1));
  };

  const back = (): void => {
    setFormError(null);
    setStep((current) => Math.max(current - 1, 0));
  };

  const validateStep = (index: number): Record<string, string> => {
    const found: Record<string, string> = {};
    if (index === 0) {
      if (state.fullName.trim().length < 2) found.fullName = 'Enter your full name';
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(state.email.trim())) found.email = 'Enter a valid email address';
      if (state.password.length < 10) found.password = 'Use at least 10 characters, including a capital letter and a number';
      else if (!/(?=.*[A-Za-z])(?=.*\d)/.test(state.password)) found.password = 'Include at least one letter and one number';
      if (state.password !== state.confirmPassword) found.confirmPassword = 'The two passwords do not match';
    }
    if (index === 1) {
      if (state.phone && !/^(\+?\d{8,15}|0[3-9]\d{8})$/.test(state.phone.trim())) found.phone = 'Enter a valid phone number';
      if (state.role === 'SUPPORTER' && !state.supportsEmail.trim()) {
        found.supportsEmail = 'Enter the email of the mother you support';
      } else if (state.supportsEmail && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(state.supportsEmail.trim())) {
        found.supportsEmail = 'Enter a valid email address';
      }
      if (state.role === 'PROVIDER') {
        if (!state.profession) found.profession = 'Select your profession';
        if (state.licenseNumber.trim().length < 3) found.licenseNumber = 'Enter your licence or registration number';
        if (!state.facilityName.trim() && !state.facilityId) found.facilityName = 'Enter or select your facility';
      }
    }
    if (index === totalSteps - 1 && !state.consent) {
      found.consent = 'You must agree before creating an account';
    }
    return found;
  };

  const submit = async (): Promise<void> => {
    /* Validate the whole form, not just the last step — a step can be skipped by going back. */
    const wholeForm = validationErrors(toInput(state));
    if (Object.keys(wholeForm).length > 0) {
      setErrors(wholeForm);
      setStep(wholeForm.fullName || wholeForm.email || wholeForm.password ? 0 : 1);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      const options =
        state.role === 'MOTHER' && (pregnancy.lmpDate || pregnancy.eddDate)
          ? {
              pregnancy: {
                lmpDate: pregnancy.lmpDate || null,
                eddDate: pregnancy.eddDate || null,
                datingMethod: pregnancy.datingMethod,
                previousPregnancies: Number(pregnancy.previousPregnancies || 0),
                previousLiveBirths: Number(pregnancy.previousLiveBirths || 0),
              },
            }
          : {};
      const actor = await register(toInput(state), options);
      toast.success('Account created', `Welcome to Mama Care, ${actor.displayName.split(' ')[0] ?? ''}.`);
      navigate(actor.status === 'PENDING_APPROVAL' ? '/pending' : actor.role === 'PROVIDER' ? '/provider' : '/app', {
        replace: true,
      });
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Registration did not complete. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const currentStep = step >= totalSteps ? totalSteps - 1 : step;

  return (
    <AuthShell
      title="Create your account"
      subtitle="Free, and it takes about a minute. No national ID or payment details needed."
      image={state.role === 'PROVIDER' ? 'midwife' : state.role === 'SUPPORTER' ? 'community-health-worker' : 'mother-newborn'}
      alt="A mother with her newborn baby"
      footer={
        <>
          Already registered?{' '}
          <Link to="/sign-in" className="font-semibold text-brand-800 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Registration progress">
        {STEPS.slice(0, totalSteps).map((label, index) => (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'grid size-6 place-items-center rounded-full text-xs font-semibold',
                index < currentStep && 'bg-brand-600 text-brand-50',
                index === currentStep && 'bg-brand-100 text-brand-900 ring-2 ring-brand-500',
                index > currentStep && 'bg-ink-100 text-ink-500',
              )}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              {index < currentStep ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span className={cn('text-xs', index === currentStep ? 'font-semibold text-ink-800' : 'text-ink-500')}>{label}</span>
            {index < totalSteps - 1 ? <span className="h-px w-4 bg-ink-200" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      {currentStep === 0 ? (
        <div className="space-y-5">
          <fieldset>
            <legend className="label">I am registering as</legend>
            <div className="mt-2 space-y-2">
              {ROLES.map((role) => (
                <label
                  key={role.value}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                    state.role === role.value ? 'border-brand-500 bg-brand-50' : 'border-ink-200 hover:border-ink-300',
                  )}
                >
                  <input
                    type="radio"
                    name="role"
                    value={role.value}
                    checked={state.role === role.value}
                    onChange={() => {
                      set('role', role.value);
                      setStep(0);
                    }}
                    className="mt-1 size-4 accent-brand-700"
                  />
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink-800">
                      <span className="text-brand-700">{role.icon}</span>
                      {role.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-ink-600">{role.blurb}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Field label="Full name" htmlFor="fullName" error={errors.fullName} required>
            <TextInput
              id="fullName"
              autoComplete="name"
              placeholder="e.g. Chileshe Mwansa"
              value={state.fullName}
              onValueChange={(value) => set('fullName', value)}
              invalid={Boolean(errors.fullName)}
            />
          </Field>

          <Field label="Email address" htmlFor="email" error={errors.email} required>
            <TextInput
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={state.email}
              onValueChange={(value) => set('email', value)}
              invalid={Boolean(errors.email)}
            />
          </Field>

          <FieldGrid columns={2}>
            <Field
              label="Password"
              htmlFor="password"
              error={errors.password}
              required
              hint="10+ characters, including a capital letter and a number."
            >
              <PasswordInput
                id="password"
                autoComplete="new-password"
                value={state.password}
                onValueChange={(value) => set('password', value)}
                invalid={Boolean(errors.password)}
              />
            </Field>
            <Field label="Confirm password" htmlFor="confirmPassword" error={errors.confirmPassword} required>
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                value={state.confirmPassword}
                onValueChange={(value) => set('confirmPassword', value)}
                invalid={Boolean(errors.confirmPassword)}
              />
            </Field>
          </FieldGrid>
        </div>
      ) : null}

      {currentStep === 1 ? (
        <div className="space-y-5">
          <FieldGrid columns={2}>
            <Field label="Phone number" htmlFor="phone" error={errors.phone} optional hint="Used for appointment reminders.">
              <TextInput
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+260 97 000 0000"
                value={state.phone}
                onValueChange={(value) => set('phone', value)}
                invalid={Boolean(errors.phone)}
              />
            </Field>
            <Field label="Date of birth" htmlFor="dateOfBirth" optional>
              <TextInput
                id="dateOfBirth"
                type="date"
                value={state.dateOfBirth}
                onValueChange={(value) => set('dateOfBirth', value)}
                max={new Date().toISOString().slice(0, 10)}
              />
            </Field>
          </FieldGrid>

          <FieldGrid columns={2}>
            <Field label="Country" htmlFor="country" required>
              <Select
                id="country"
                value={state.country}
                onChange={(event) => set('country', event.target.value)}
                options={countryOptions()}
              />
            </Field>
            <Field label="Language" htmlFor="language" required>
              <Select
                id="language"
                value={state.language}
                onChange={(event) => set('language', event.target.value as LanguageCode)}
                options={LANGUAGES.map((language) => ({
                  value: language.code,
                  label: language.available ? language.label : `${language.label} (coming soon)`,
                }))}
              />
            </Field>
          </FieldGrid>

          {state.role === 'SUPPORTER' ? (
            <Field
              label="Email of the mother you support"
              htmlFor="supportsEmail"
              error={errors.supportsEmail}
              required
              hint="She must approve your access, and chooses what you can see."
            >
              <TextInput
                id="supportsEmail"
                type="email"
                inputMode="email"
                placeholder="mother@example.com"
                value={state.supportsEmail}
                onValueChange={(value) => set('supportsEmail', value)}
                invalid={Boolean(errors.supportsEmail)}
              />
            </Field>
          ) : null}

          {state.role === 'PROVIDER' ? (
            <Card className="card-pad border-ink-200 bg-ink-50">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-700" aria-hidden />
                <h2 className="card-title">Professional details</h2>
              </div>
              <p className="mt-1 text-xs text-ink-600">
                An administrator verifies these before your profile appears in the provider directory. Your account stays
                pending until then.
              </p>

              <div className="mt-4 space-y-4">
                <FieldGrid columns={2}>
                  <Field label="Profession" htmlFor="profession" error={errors.profession} required>
                    <Select
                      id="profession"
                      value={state.profession}
                      onChange={(event) => set('profession', event.target.value as Profession)}
                      options={[
                        { value: '', label: 'Select your profession' },
                        ...(['doctor', 'midwife', 'nurse', 'maternal-educator', 'community-health-worker', 'pharmacist'] as Profession[]).map(
                          (item) => ({ value: item, label: PROFESSION_LABELS[item] }),
                        ),
                      ]}
                    />
                  </Field>
                  <Field label="Title (optional)" htmlFor="title" optional>
                    <TextInput
                      id="title"
                      placeholder="e.g. Sr."
                      value={state.title}
                      onValueChange={(value) => set('title', value)}
                    />
                  </Field>
                </FieldGrid>

                <Field
                  label="Licence / registration number"
                  htmlFor="licenseNumber"
                  error={errors.licenseNumber}
                  required
                  hint="For example your GNCZ or HPCZ number."
                >
                  <TextInput
                    id="licenseNumber"
                    placeholder="e.g. GNCZ-000000"
                    value={state.licenseNumber}
                    onValueChange={(value) => set('licenseNumber', value)}
                    invalid={Boolean(errors.licenseNumber)}
                  />
                </Field>

                <Field label="Facility" htmlFor="facilityId" error={errors.facilityName} required>
                  <Select
                    id="facilityId"
                    value={state.facilityId}
                    onChange={(event) => {
                      const selected = facilityList.find((facility) => facility.id === event.target.value);
                      set('facilityId', event.target.value);
                      set('facilityName', selected ? selected.name : state.facilityName);
                    }}
                    options={[
                      { value: '', label: 'Search the list, or type it below' },
                      ...facilityList.map((facility) => ({ value: facility.id, label: `${facility.name} — ${facility.city}` })),
                    ]}
                  />
                </Field>

                <Field label="Facility name" htmlFor="facilityName" error={errors.facilityName} hint="If your facility is not listed, type its full name.">
                  <TextInput
                    id="facilityName"
                    placeholder="e.g. Lusaka District Hospital"
                    value={state.facilityName}
                    onValueChange={(value) => {
                      set('facilityName', value);
                      set('facilityId', '');
                    }}
                    invalid={Boolean(errors.facilityName)}
                  />
                </Field>
              </div>
            </Card>
          ) : null}

          {state.role === 'MOTHER' ? (
            <Card className="card-pad">
              <h2 className="card-title">Emergency contact (optional)</h2>
              <p className="mt-1 text-xs text-ink-600">
                Someone a facility can call if you cannot be reached. Stored privately in your record.
              </p>
              <div className="mt-4 space-y-4">
                <FieldGrid columns={2}>
                  <Field label="Name" htmlFor="emergencyName" optional>
                    <TextInput
                      id="emergencyName"
                      placeholder="e.g. Bwalya Mwansa"
                      value={state.emergencyName}
                      onValueChange={(value) => set('emergencyName', value)}
                    />
                  </Field>
                  <Field label="Relationship" htmlFor="emergencyRelationship" optional>
                    <TextInput
                      id="emergencyRelationship"
                      placeholder="e.g. Husband"
                      value={state.emergencyRelationship}
                      onValueChange={(value) => set('emergencyRelationship', value)}
                    />
                  </Field>
                </FieldGrid>
                <Field label="Phone" htmlFor="emergencyPhone" optional>
                  <TextInput
                    id="emergencyPhone"
                    type="tel"
                    inputMode="tel"
                    placeholder="+260 97 000 0000"
                    value={state.emergencyPhone}
                    onValueChange={(value) => set('emergencyPhone', value)}
                  />
                </Field>
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {currentStep === 2 && state.role === 'MOTHER' ? (
        <div className="space-y-5">
          <Card className="card-pad border-brand-200 bg-brand-50">
            <h2 className="card-title">Where are you in your pregnancy?</h2>
            <p className="mt-1 text-sm text-ink-600">
              Optional — you can add this later from the tracker. If you are not sure of your dates, skip this step: the app
              works without them, and your midwife can set them at your next visit.
            </p>
          </Card>

          <Field
            label="First day of your last period"
            htmlFor="lmpDate"
            hint="This is how most clinics date a pregnancy."
          >
            <TextInput
              id="lmpDate"
              type="date"
              value={pregnancy.lmpDate}
              max={new Date().toISOString().slice(0, 10)}
              onValueChange={(value) => {
                setPregnancy((current) => ({
                  ...current,
                  lmpDate: value,
                  eddDate: value && current.datingMethod === 'lmp' ? eddFromLmp(value) : current.eddDate,
                  datingMethod: value ? 'lmp' : current.datingMethod,
                }));
              }}
            />
          </Field>

          <Field
            label="Expected due date"
            htmlFor="eddDate"
            hint="From a scan or your clinic card. If it differs from the calculation, this one wins."
          >
            <TextInput
              id="eddDate"
              type="date"
              value={pregnancy.eddDate}
              onValueChange={(value) =>
                setPregnancy((current) => ({
                  ...current,
                  eddDate: value,
                  datingMethod: value ? (current.datingMethod === 'lmp' ? 'ultrasound' : current.datingMethod) : current.datingMethod,
                }))
              }
            />
          </Field>

          <Field label="How was the due date determined?" htmlFor="datingMethod">
            <Select
              id="datingMethod"
              value={pregnancy.datingMethod}
              onChange={(event) => setPregnancy((current) => ({ ...current, datingMethod: event.target.value as PregnancyState['datingMethod'] }))}
              options={[
                { value: 'lmp', label: 'From my last period' },
                { value: 'ultrasound', label: 'From an ultrasound scan' },
                { value: 'clinician', label: 'Given by a clinician' },
                { value: 'unknown', label: 'Not sure yet' },
              ]}
            />
          </Field>

          {preview ? (
            <Card className="card-pad border-green-200 bg-green-50">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="green">Calculated</Badge>
                <span className="text-sm font-semibold text-ink-800">
                  {formatGestationalAge(preview.ga)} pregnant
                </span>
              </div>
              <p className="mt-2 text-sm text-ink-700">
                Due around <strong>{preview.edd ? formatDate(preview.edd) : '—'}</strong>, in{' '}
                {Math.max(0, 40 - preview.ga.weeks)} week{Math.max(0, 40 - preview.ga.weeks) === 1 ? '' : 's'}.
              </p>
              <p className="mt-2 text-xs text-ink-600">
                All dates are estimates. A clinician's assessment always takes precedence, and you can change these at any
                time from the tracker.
              </p>
            </Card>
          ) : null}

          <FieldGrid columns={2}>
            <Field label="Previous pregnancies" htmlFor="previousPregnancies" optional>
              <TextInput
                id="previousPregnancies"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                placeholder="0"
                value={pregnancy.previousPregnancies}
                onValueChange={(value) => setPregnancy((current) => ({ ...current, previousPregnancies: value }))}
              />
            </Field>
            <Field label="Previous live births" htmlFor="previousLiveBirths" optional>
              <TextInput
                id="previousLiveBirths"
                type="number"
                inputMode="numeric"
                min={0}
                max={20}
                placeholder="0"
                value={pregnancy.previousLiveBirths}
                onValueChange={(value) => setPregnancy((current) => ({ ...current, previousLiveBirths: value }))}
              />
            </Field>
          </FieldGrid>
        </div>
      ) : null}

      {currentStep === totalSteps - 1 ? (
        <div className="space-y-5">
          <Card className="card-pad">
            <h2 className="card-title">Check your details</h2>
            <dl className="mt-3 divide-y divide-ink-100 text-sm">
              {[
                ['Name', state.fullName],
                ['Email', state.email],
                ['Registering as', ROLES.find((role) => role.value === state.role)?.title ?? state.role],
                ['Phone', state.phone || 'Not provided'],
                ['Country', COUNTRIES.find((country) => country.code === state.country)?.name ?? state.country],
                ...(state.role === 'PROVIDER'
                  ? ([
                      ['Profession', state.profession ? PROFESSION_LABELS[state.profession] : ''],
                      ['Licence', state.licenseNumber],
                      ['Facility', state.facilityName || 'Not provided'],
                    ] as [string, string][])
                  : []),
                ...(state.role === 'MOTHER' && preview
                  ? ([
                      ['Pregnancy', formatGestationalAge(preview.ga)],
                      ['Due date', preview.edd ? formatDate(preview.edd) : '—'],
                    ] as [string, string][])
                  : []),
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 py-2">
                  <dt className="text-ink-500">{label}</dt>
                  <dd className="text-right font-medium text-ink-800">{value || '—'}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => setStep(0)} icon={<ArrowLeft className="size-4" aria-hidden />}>
                Change something
              </Button>
            </div>
          </Card>

          {state.role === 'PROVIDER' ? (
            <Card className="card-pad border-amber-200 bg-amber-50">
              <Badge tone="amber">Approval required</Badge>
              <p className="mt-2 text-sm text-ink-700">
                Your account will be created, but the provider portal stays locked until an administrator verifies your
                licence. We will email you when it is approved — usually within two working days.
              </p>
            </Card>
          ) : null}

          <Card className="card-pad">
            <h2 className="card-title">What happens to your information</h2>
            <ul className="checklist mt-2 text-sm">
              <li>Your health record is visible to you, and to a provider only after you link your care to them.</li>
              <li>Your journal is private to you, always — no provider or supporter can read it.</li>
              <li>You can export or delete your account at any time from Settings → Privacy & data.</li>
              <li>Mama Care never diagnoses a condition and never replaces a qualified professional.</li>
            </ul>
          </Card>

          <CheckboxRow
            checked={state.consent}
            onChange={(checked) => set('consent', checked)}
            label="I agree to the terms of use and privacy policy"
            description={
              <>
                I understand Mama Care provides educational information and organisation tools only.{' '}
                <Link to="/terms" className="font-medium text-brand-800 hover:underline">
                  Terms
                </Link>{' '}
                ·{' '}
                <Link to="/privacy" className="font-medium text-brand-800 hover:underline">
                  Privacy
                </Link>
              </>
            }
          />
          {errors.consent ? <p className="field-error">{errors.consent}</p> : null}
        </div>
      ) : null}

      {formError ? <p className="alert alert-error mt-4">{formError}</p> : null}

      <div className="mt-6 flex items-center gap-2">
        {currentStep > 0 ? (
          <Button variant="secondary" onClick={back} disabled={submitting} icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back
          </Button>
        ) : null}
        {currentStep < totalSteps - 1 ? (
          <Button className="flex-1" onClick={next} iconRight={<ArrowRight className="size-4" aria-hidden />}>
            Continue
          </Button>
        ) : (
          <Button className="flex-1" onClick={() => void submit()} disabled={submitting}>
            {submitting ? 'Creating your account…' : 'Create account'}
          </Button>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-500">
        Already have an account?{' '}
        <Link to="/sign-in" className="font-medium text-brand-800 hover:underline">
          Sign in
        </Link>
        . Need help?{' '}
        <Link to="/contact" className="font-medium text-brand-800 hover:underline">
          Contact us
        </Link>
        .
      </p>
    </AuthShell>
  );
}

/** `useAsync` returns `T | null`; the facility list is the only place we need a default. */
function data0(value: Facility[] | null | undefined): Facility[] {
  return value ?? [];
}

function toInput(state: FormState): RegistrationInput {
  return {
    ...state,
    profession: state.profession || undefined,
  } as unknown as RegistrationInput;
}

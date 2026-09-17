/**
 * Apply to become a verified nurse / healthcare provider.
 *
 * For people who already have a Mama Care account. Submitting creates a
 * `providers` record in `pending` state linked to the applicant's own user id —
 * nothing else changes. The applicant keeps their current account exactly as it
 * is; no clinical privilege exists until an administrator reviews the
 * application, verifies the licence and approves it (which is what flips the
 * user's role to PROVIDER).
 *
 * The page is honest about every state: no application, pending, rejected (with
 * the administrator's reason) and approved. There is no path on this screen —
 * or anywhere on the client — that sets `status: 'approved'` by itself.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  ShieldAlert,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { facilityRepo, providerRepo } from '@/services/repositories';
import { uploadDocument } from '@/services/media/media-service';
import { DOCUMENT_ACCEPTED_MIME, nurseApplicationSchema, type NurseApplicationValues } from '@/lib/validation';
import { formatDate } from '@/lib/utils';
import { PROFESSION_LABELS, type Facility, type HealthcareProvider, type Profession } from '@/types/domain';
import { useSession } from '@/providers/app-providers';
import { Mark } from '@/components/layout/wordmark';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, Select, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';

const MAX_SUPPORTING_FILES = 3;

export default function BecomeAProviderPage() {
  const { actor, profile } = useSession();
  /** A rejected applicant has chosen to correct and re-submit. */
  const [showForm, setShowForm] = useState(false);

  const { data: application, loading, error, retryable, run } = useAsync(() => providerRepo.mine(), {
    deps: [actor?.uid],
    immediate: Boolean(actor),
  });

  useEffect(() => {
    document.title = 'Become a verified nurse · Mama Care';
  }, []);

  const status = application?.status ?? null;
  /**
   * The form is the only state when there is no application yet; after a
   * rejection it reappears only when the applicant chooses to apply again.
   */
  const showApplicationForm = !application || (application.status === 'rejected' && showForm);

  return (
    <div className="flex min-h-screen flex-col bg-ink-50">
      <header className="border-b border-ink-200 bg-white">
        <div className="shell flex h-[64px] items-center gap-3">
          <Link to="/" aria-label="Mama Care home">
            <Mark className="size-8 text-brand-700" />
          </Link>
          <div className="min-w-0">
            <p className="truncate text-[0.95rem] font-semibold text-ink-900">Become a verified nurse</p>
            <p className="truncate text-xs text-ink-500">Signed in as {actor?.displayName}</p>
          </div>
          <Link to="/" className="btn btn-ghost btn-sm ml-auto">
            Public site
          </Link>
        </div>
      </header>

      <main className="shell flex-1 py-8">
        <div className="mx-auto w-full max-w-2xl">
          {loading ? <LoadingRows rows={4} /> : null}
          {error ? (
            <ErrorState title="Your application could not be loaded" message={error} onRetry={retryable ? run : undefined} />
          ) : null}

          {!loading && !error ? (
            <>
              <div className="mb-6">
                <SectionHeading
                  eyebrow="Healthcare professionals"
                  title="Apply for nurse / provider verification"
                  description="Tell us about your professional registration. An administrator checks your licence number and facility before you are listed as a verified nurse — nothing on this page can verify you on its own."
                />
              </div>

              {status === 'pending' && application ? (
                <ApplicationStatusCard application={application} tone="pending" onRefresh={run} />
              ) : null}

              {status === 'approved' && application ? (
                <ApplicationStatusCard application={application} tone="approved" onRefresh={run} />
              ) : null}

              {status === 'rejected' && application && !showForm ? (
                <ApplicationStatusCard application={application} tone="rejected" onRefresh={run} onResubmit={() => setShowForm(true)} />
              ) : null}

              {status === 'suspended' && application ? (
                <ApplicationStatusCard application={application} tone="suspended" onRefresh={run} />
              ) : null}

              {showApplicationForm ? (
                <ApplicationForm
                  key={application ? 'resubmit' : 'new'}
                  profileName={profile?.fullName ?? actor?.displayName ?? ''}
                  profileEmail={profile?.email ?? actor?.email ?? ''}
                  profilePhone={profile?.phone ?? ''}
                  existing={application}
                  onSubmitted={() => {
                    setShowForm(false);
                    void run();
                  }}
                />
              ) : null}

              <p className="mt-8 text-center text-xs leading-relaxed text-ink-500">
                Verification is decided by a Mama Care administrator who checks your registration against the
                professional council. Approval is never automatic, and an account can never grant itself these
                privileges — the database rules enforce that.
              </p>
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/* ── Status cards ─────────────────────────────────────────────────────── */

function ApplicationStatusCard({
  application,
  tone,
  onRefresh,
  onResubmit,
}: {
  application: HealthcareProvider;
  tone: 'pending' | 'approved' | 'rejected' | 'suspended';
  onRefresh: () => void;
  onResubmit?: () => void;
}) {
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async (): Promise<void> => {
    setRefreshing(true);
    try {
      await onRefresh();
      toast.info('Status refreshed', 'The result comes straight from the database.');
    } finally {
      setRefreshing(false);
    }
  };

  const head = {
    pending: {
      icon: <Clock className="size-5" aria-hidden />,
      chip: <Badge tone="amber">Awaiting verification</Badge>,
      title: 'Application submitted — awaiting verification',
      body: 'Your application is in the administrator queue. You do not have nurse privileges yet — the clinical portal stays locked until your licence and facility are checked. This page will show the result as soon as it is decided.',
      tone: 'amber',
    },
    approved: {
      icon: <BadgeCheck className="size-5" aria-hidden />,
      chip: <Badge tone="green"><BadgeCheck className="size-3" aria-hidden /> Verified nurse</Badge>,
      title: 'You are a verified provider',
      body: 'An administrator verified your registration. You now have the healthcare provider portal, and your profile carries the verified badge.',
      tone: 'green',
    },
    rejected: {
      icon: <XCircle className="size-5" aria-hidden />,
      chip: <Badge tone="red">Not approved</Badge>,
      title: 'Your application was not approved',
      body: application.rejectionReason ?? 'An administrator reviewed your application and could not approve it.',
      tone: 'red',
    },
    suspended: {
      icon: <ShieldAlert className="size-5" aria-hidden />,
      chip: <Badge tone="red">Suspended</Badge>,
      title: 'Your provider access is suspended',
      body: application.rejectionReason ?? 'An administrator suspended this provider record. Existing patients keep their records; you cannot accept new ones.',
      tone: 'red',
    },
  }[tone];

  return (
    <Card className="card-pad">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={
            head.tone === 'green'
              ? 'grid size-11 place-items-center rounded-xl bg-green-100 text-green-800'
              : head.tone === 'amber'
                ? 'grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800'
                : 'grid size-11 place-items-center rounded-xl bg-red-100 text-red-800'
          }
        >
          {head.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="display-2">{head.title}</h2>
            {head.chip}
          </div>
        </div>
      </div>

      <p className="mt-4 leading-relaxed text-ink-700">{head.body}</p>

      {tone === 'rejected' && application.rejectionReason ? (
        <p className="mt-2 text-sm text-ink-600">
          Reason given by the administrator: <strong className="text-ink-800">{application.rejectionReason}</strong>
        </p>
      ) : null}

      <Card className="card-pad mt-5 border-ink-200 bg-ink-50">
        <p className="micro">Your application</p>
        <dl className="mt-2 grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            ['Name', application.fullName],
            [application.title ? `${application.title} ${PROFESSION_LABELS[application.profession]}` : PROFESSION_LABELS[application.profession], application.location ?? ''],
            ['Facility', application.facilityName],
            ['Licence / registration', application.licenseNumber ?? 'Not provided'],
            ['Submitted', formatDate(application.createdAt)],
            ['Last decision', application.verifiedAt ? `${formatDate(application.verifiedAt)} by ${application.verifiedBy ?? 'an administrator'}` : 'None yet'],
          ]
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label} className="flex items-start justify-between gap-3">
                <dt className="text-ink-500">{label}</dt>
                <dd className="text-right font-medium text-ink-800">{value}</dd>
              </div>
            ))}
        </dl>
      </Card>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => void refresh()} disabled={refreshing} icon={<Loader2 className={refreshing ? 'size-4 animate-spin' : 'size-4'} aria-hidden />}>
          Refresh status
        </Button>
        {tone === 'approved' ? (
          <Link to="/provider" className="btn btn-primary btn-sm">
            Open the healthcare portal
          </Link>
        ) : null}
        {tone === 'rejected' && onResubmit ? (
          <Button variant="primary" size="sm" onClick={onResubmit}>
            Correct the details and apply again
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/* ── The application form ─────────────────────────────────────────────── */

function ApplicationForm({
  profileName,
  profileEmail,
  profilePhone,
  existing,
  onSubmitted,
}: {
  profileName: string;
  profileEmail: string;
  profilePhone: string;
  existing: HealthcareProvider | null;
  onSubmitted: () => void;
}) {
  const toast = useToast();
  const { data: facilities } = useAsync(() => facilityRepo.list(), { deps: [] });
  const facilityList = useMemo<Facility[]>(() => facilities ?? [], [facilities]);
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const form = useForm<NurseApplicationValues>(nurseApplicationSchema, {
    fullName: existing?.fullName ?? profileName,
    email: existing?.email ?? profileEmail,
    phone: existing?.phone ?? profilePhone,
    location: existing?.location ?? '',
    facilityId: existing?.facilityId ?? '',
    facilityName: existing?.facilityName ?? '',
    profession: (existing?.profession ?? 'nurse') as Profession,
    licenseNumber: existing?.licenseNumber ?? '',
    qualifications: existing?.qualifications ?? '',
    consent: false,
  });

  useEffect(() => {
    // Prefill location from the nearest district when nothing was saved yet.
    if (!form.values.location.trim() && !existing) {
      form.setField('location', 'Chama');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (list: FileList | null): void => {
    if (!list) return;
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_SUPPORTING_FILES) {
        toast.error('Limit reached', `Up to ${MAX_SUPPORTING_FILES} supporting documents, please.`);
        break;
      }
      next.push(file);
    }
    setFiles(next);
  };

  const onSubmit = async (values: NurseApplicationValues): Promise<void> => {
    if (!consent) {
      setConsentError('Please confirm the declaration before submitting');
      return;
    }
    setUploading(true);
    form.setError(null);
    try {
      // Upload the supporting documents first (each lands under the applicant's
      // own private document path in Firebase Storage), then submit the
      // application with their record ids. If the upload fails, nothing is
      // submitted — no half applications.
      const docIds: string[] = [];
      for (const file of files) {
        const result = await uploadDocument(file, {
          title: `Nurse application — ${file.name}`,
          category: 'other',
          notes: 'Supporting document for provider verification',
        });
        docIds.push(result.record.id);
      }
      // Keep documents already attached to a previous (rejected) application.
      const allDocIds = [...new Set([...(existing?.supportingDocuments ?? []), ...docIds])];
      await providerRepo.apply({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone || null,
        location: values.location,
        facilityId: values.facilityId || null,
        facilityName: values.facilityName,
        profession: values.profession,
        licenseNumber: values.licenseNumber,
        qualifications: values.qualifications || null,
        supportingDocumentIds: allDocIds,
      });
      toast.success(
        existing ? 'Application re-submitted' : 'Application submitted',
        'It is now awaiting verification by an administrator.',
      );
      onSubmitted();
    } catch (error) {
      form.setError(error instanceof Error ? error.message : 'The application was not submitted. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const facilityOptions = [
    { value: '', label: 'Search the list, or type it below' },
    ...facilityList.map((facility) => ({ value: facility.id, label: `${facility.name} — ${facility.city}` })),
  ];

  return (
    <Card className="card-pad">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void form.submit(onSubmit);
        }}
        noValidate
      >
        <p className="label">Personal details</p>
        <FieldGrid columns={2}>
          <Field label="Full name" htmlFor="na-name" error={form.errors.fullName} required>
            <TextInput
              id="na-name"
              value={form.values.fullName}
              onValueChange={(value) => form.setField('fullName', value)}
              onBlur={() => form.blur('fullName')}
              invalid={Boolean(form.errors.fullName)}
              autoComplete="name"
            />
          </Field>
          <Field label="Phone number" htmlFor="na-phone" error={form.errors.phone} optional hint="Shown to the administrator reviewing your file.">
            <TextInput
              id="na-phone"
              type="tel"
              inputMode="tel"
              placeholder="+260 97 000 0000"
              value={form.values.phone}
              onValueChange={(value) => form.setField('phone', value)}
              onBlur={() => form.blur('phone')}
              invalid={Boolean(form.errors.phone)}
              autoComplete="tel"
            />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Email" htmlFor="na-email" error={form.errors.email} required>
            <TextInput
              id="na-email"
              type="email"
              inputMode="email"
              value={form.values.email}
              onValueChange={(value) => form.setField('email', value)}
              onBlur={() => form.blur('email')}
              invalid={Boolean(form.errors.email)}
              autoComplete="email"
            />
          </Field>
          <Field label="Location (town / district)" htmlFor="na-location" error={form.errors.location} required hint="Where you practice, e.g. Chama.">
            <TextInput
              id="na-location"
              placeholder="e.g. Chama"
              value={form.values.location}
              onValueChange={(value) => form.setField('location', value)}
              onBlur={() => form.blur('location')}
              invalid={Boolean(form.errors.location)}
            />
          </Field>
        </FieldGrid>

        <div className="mt-6">
          <p className="label">Professional details</p>
          <FieldGrid columns={2}>
            <Field label="Professional role" htmlFor="na-profession" error={form.errors.profession} required>
              <Select
                id="na-profession"
                value={form.values.profession}
                onChange={(event) => form.setField('profession', event.target.value as Profession)}
                options={(Object.keys(PROFESSION_LABELS) as Profession[]).map((item) => ({ value: item, label: PROFESSION_LABELS[item] }))}
              />
            </Field>
            <Field
              label="Licence / registration number"
              htmlFor="na-license"
              error={form.errors.licenseNumber}
              required
              hint="e.g. your GNCZ or HPCZ number. It is checked against the professional council."
            >
              <TextInput
                id="na-license"
                placeholder="e.g. GNCZ-000000"
                value={form.values.licenseNumber}
                onValueChange={(value) => form.setField('licenseNumber', value)}
                onBlur={() => form.blur('licenseNumber')}
                invalid={Boolean(form.errors.licenseNumber)}
              />
            </Field>
          </FieldGrid>

          <Field label="Hospital / facility" htmlFor="na-facility" error={form.errors.facilityName} required hint="Select it if it is listed, otherwise type its full name.">
            <Select
              id="na-facility"
              value={form.values.facilityId}
              onChange={(event) => {
                const id = event.target.value;
                form.setField('facilityId', id);
                const chosen = facilityList.find((facility) => facility.id === id);
                if (chosen) form.setField('facilityName', chosen.name);
              }}
              options={facilityOptions}
            />
          </Field>
          <Field label="Facility name" htmlFor="na-facility-name" error={form.errors.facilityName} optional>
            <TextInput
              id="na-facility-name"
              placeholder="e.g. Chama District Hospital"
              value={form.values.facilityName}
              onValueChange={(value) => {
                form.setField('facilityName', value);
                form.setField('facilityId', '');
              }}
            />
          </Field>

          <Field
            label="Qualifications"
            htmlFor="na-qualifications"
            error={form.errors.qualifications}
            optional
            hint="Degrees, certificates, specialisations, years of experience — as printed on your credentials."
          >
            <TextArea
              id="na-qualifications"
              rows={3}
              placeholder="e.g. Diploma in Nursing (GNCZ), 6 years in maternal and child health"
              value={form.values.qualifications}
              onValueChange={(value) => form.setField('qualifications', value)}
            />
          </Field>
        </div>

        <div className="mt-6">
          <p className="label">Supporting documents (optional)</p>
          <p className="hint mb-2">
            A photo or scan of your practising certificate or registration helps the administrator verify you faster.
            Up to {MAX_SUPPORTING_FILES} files (PDF, PNG, JPEG, WEBP, up to 15 MB each). They are stored privately under
            your account — only administrators reviewing your application can open them.
          </p>
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-ink-50 px-4 py-6 text-sm font-medium text-ink-600 hover:border-brand-400 hover:bg-brand-50/40">
            <FileText className="size-4" aria-hidden />
            {files.length > 0 ? `${files.length} file${files.length === 1 ? '' : 's'} selected` : 'Choose files to attach'}
            <input
              type="file"
              multiple
              className="sr-only"
              accept={DOCUMENT_ACCEPTED_MIME.join(', ')}
              onChange={(event) => {
                addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </label>
          {files.length > 0 ? (
            <ul className="mt-2 space-y-1.5">
              {files.map((file) => (
                <li key={file.name} className="flex items-center justify-between gap-3 rounded-md bg-ink-100 px-3 py-1.5 text-xs text-ink-700">
                  <span className="min-w-0 truncate">{file.name}</span>
                  <button
                    type="button"
                    className="shrink-0 font-semibold text-ink-500 hover:text-[var(--color-risk-red)]"
                    onClick={() => setFiles((current) => current.filter((item) => item !== file))}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {existing && existing.supportingDocuments.length > 0 ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-500">
              <CheckCircle2 className="size-3.5 text-[var(--color-risk-green)]" aria-hidden />
              {existing.supportingDocuments.length} document{existing.supportingDocuments.length === 1 ? '' : 's'} already
              attached to your previous application — they stay with the re-submission.
            </p>
          ) : null}
        </div>

        <div className="mt-6">
          <CheckboxRow
            checked={consent}
            onChange={(checked) => {
              setConsent(checked);
              setConsentError(null);
            }}
            label="I confirm this information is accurate"
            description="I am a healthcare professional (or registered trainee) in Zambia. I understand an administrator will verify my registration before any verified status is granted, and that providing false professional information is grounds for removal."
          />
          {consentError ? <p className="field-error">{consentError}</p> : null}
        </div>

        {form.formError ? <p className="alert alert-error mt-4">{form.formError}</p> : null}

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button type="submit" className="flex-1 sm:flex-none" disabled={uploading} icon={<Stethoscope className="size-4" aria-hidden />}>
            {uploading
              ? files.length > 0
                ? 'Uploading documents…'
                : 'Submitting…'
              : existing
                ? 'Re-submit application'
                : 'Submit application'}
          </Button>
          <p className="text-xs text-ink-500">
            After submission you will see “awaiting verification” — no nurse privileges before that.
          </p>
        </div>
      </form>
    </Card>
  );
}

/**
 * Administrator — provider verification.
 *
 * The queue that decides who a pregnant woman is allowed to trust. Approval should
 * mean somebody checked a licence number against a professional council and a
 * facility that exists; rejection must carry a reason, because it is shown to the
 * clinician verbatim and is often the only feedback they get.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  ShieldAlert,
  Stethoscope,
  XCircle,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { facilityRepo, profileRepo, providerRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { formatDate, relativeTime } from '@/lib/utils';
import { PROFESSION_LABELS, type Facility, type HealthcareProvider, type Profession, type ProviderStatus } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Avatar, Badge, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, SearchInput, Select, Switch, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { SegmentedControl } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';

const STATUS_LABELS: Record<ProviderStatus, string> = {
  pending: 'Awaiting verification',
  approved: 'Verified',
  rejected: 'Not verified',
  suspended: 'Suspended',
};

const STATUS_TONES: Record<ProviderStatus, 'amber' | 'green' | 'red' | 'neutral'> = {
  pending: 'amber',
  approved: 'green',
  rejected: 'red',
  suspended: 'neutral',
};

export default function AdminProviders() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<ProviderStatus | 'ALL'>('pending');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<HealthcareProvider | null>(null);
  const [rejectFor, setRejectFor] = useState<HealthcareProvider | null>(null);

  const { data: providers, loading, error, retryable, run } = useAsync(() => providerRepo.all(), { immediate: true });
  const { data: facilities } = useAsync(() => facilityRepo.list(), { immediate: true });

  const rows = useMemo<HealthcareProvider[]>(() => providers ?? [], [providers]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((provider) => {
      if (status !== 'ALL' && provider.status !== status) return false;
      if (!term) return true;
      return [provider.fullName, provider.facilityName, provider.licenseNumber ?? '', provider.email ?? '', PROFESSION_LABELS[provider.profession]]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, status, search]);

  const counts = useMemo(
    () => ({
      pending: rows.filter((provider) => provider.status === 'pending').length,
      approved: rows.filter((provider) => provider.status === 'approved').length,
      rejected: rows.filter((provider) => provider.status === 'rejected').length,
      suspended: rows.filter((provider) => provider.status === 'suspended').length,
      listed: rows.filter((provider) => provider.status === 'approved' && provider.listedInDirectory).length,
      noLicence: rows.filter((provider) => provider.status === 'pending' && !provider.licenseNumber).length,
    }),
    [rows],
  );

  useEffect(() => {
    document.title = 'Providers · Mama Care admin';
  }, []);

  const approve = async (provider: HealthcareProvider): Promise<void> => {
    const ok = await confirm({
      title: `Verify ${provider.fullName}?`,
      message: `Confirm you checked the licence${provider.licenseNumber ? ` (${provider.licenseNumber})` : ' — none was provided'} and that ${provider.facilityName} is a real facility. Verified providers appear in the public directory and mothers can link their care to them.`,
      confirmLabel: 'Approve and verify',
    });
    if (!ok) return;
    await providerRepo.approve(provider.id, actor?.displayName ?? 'Administrator');
    const account = await profileRepo.list(1000).then((result) => result.rows.find((user) => user.uid === provider.userId) ?? null);
    if (account && account.status === 'PENDING_APPROVAL') {
      await profileRepo.adminUpdate(account.uid, { status: 'ACTIVE' });
    }
    toast.success('Provider verified', account ? 'Their account is now active.' : undefined);
    void run();
  };

  const decline = (provider: HealthcareProvider): void => setRejectFor(provider);

  const columns: Column<HealthcareProvider>[] = [
    {
      key: 'name',
      header: 'Provider',
      sortValue: (row) => row.fullName,
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.fullName} src={row.photoUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink-800">{row.fullName}</span>
            <span className="block truncate text-xs text-ink-500">
              {row.title ? `${row.title} · ` : ''}
              {PROFESSION_LABELS[row.profession]}
            </span>
          </span>
        </span>
      ),
    },
    { key: 'facility', header: 'Facility', hideBelow: 'md', render: (row) => <span className="text-sm text-ink-700">{row.facilityName}</span> },
    {
      key: 'licence',
      header: 'Licence',
      hideBelow: 'lg',
      render: (row) =>
        row.licenseNumber ? (
          <span className="text-sm text-ink-700 tnum">{row.licenseNumber}</span>
        ) : (
          <Badge tone="amber">Not provided</Badge>
        ),
    },
    {
      key: 'submitted',
      header: 'Submitted',
      hideBelow: 'lg',
      sortValue: (row) => row.createdAt,
      render: (row) => <span className="text-xs text-ink-600">{relativeTime(row.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '10rem',
      sortValue: (row) => row.status,
      render: (row) => <Badge tone={STATUS_TONES[row.status]}>{STATUS_LABELS[row.status]}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '13rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          {row.status === 'pending' ? (
            <Button variant="primary" size="sm" onClick={() => void approve(row)} icon={<CheckCircle2 className="size-4" aria-hidden />}>
              Verify
            </Button>
          ) : null}
          {row.status === 'pending' ? (
            <Button variant="outline-danger" size="sm" onClick={() => decline(row)} icon={<XCircle className="size-4" aria-hidden />}>
              Decline
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => setSelected(row)}>
            Manage
          </Button>
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Providers"
        description="Verification queue and directory control. A verified provider is a public claim about a real clinician — check before you approve."
        actions={
          <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Awaiting verification" value={counts.pending} icon={<Stethoscope className="size-4" aria-hidden />} tone={counts.pending > 0 ? 'amber' : 'green'} onClick={() => setStatus('pending')} />
        <StatCard label="Verified" value={counts.approved} icon={<BadgeCheck className="size-4" aria-hidden />} tone="green" onClick={() => setStatus('approved')} />
        <StatCard label="Listed in directory" value={counts.listed} icon={<Eye className="size-4" aria-hidden />} onClick={() => setStatus('approved')} />
        <StatCard
          label="Declined or suspended"
          value={counts.rejected + counts.suspended}
          icon={<ShieldAlert className="size-4" aria-hidden />}
          tone={counts.rejected + counts.suspended > 0 ? 'red' : 'default'}
          hint={`${counts.rejected} declined · ${counts.suspended} suspended`}
          onClick={() => setStatus('rejected')}
        />
      </div>

      {counts.noLicence > 0 ? (
        <Card className="card-pad mt-4 border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]">
          <p className="text-sm text-ink-700">
            <strong className="font-semibold">{counts.noLicence}</strong> pending application
            {counts.noLicence === 1 ? ' has' : 's have'} no licence number. Decline with a reason asking for it, or contact the
            clinician — do not verify on a name and a facility alone.
          </p>
        </Card>
      ) : null}

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            value={status}
            onChange={setStatus}
            ariaLabel="Provider status"
            options={[
              { value: 'pending', label: 'Pending', count: counts.pending },
              { value: 'approved', label: 'Verified', count: counts.approved },
              { value: 'rejected', label: 'Declined', count: counts.rejected },
              { value: 'suspended', label: 'Suspended', count: counts.suspended },
              { value: 'ALL', label: 'All', count: rows.length },
            ]}
          />
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search name, facility or licence" className="w-full sm:max-w-xs" />
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Providers could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={5} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Provider directory records on this deployment"
            pageSize={20}
            emptyTitle={status === 'pending' ? 'The queue is empty' : 'No providers match'}
            emptyDescription={
              status === 'pending'
                ? 'Every application has been decided. New registrations with the PROVIDER role appear here for verification.'
                : 'Try another status or clear the search.'
            }
          />
        ) : null}
      </Card>

      <ManageProviderModal
        provider={selected}
        facilities={facilities ?? []}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          void run();
        }}
      />

      <RejectModal
        provider={rejectFor}
        onClose={() => setRejectFor(null)}
        onDone={() => {
          setRejectFor(null);
          toast.success('Application declined', 'The clinician sees your reason on their profile.');
          void run();
        }}
      />
    </StaffShell>
  );
}

function RejectModal({
  provider,
  onClose,
  onDone,
}: {
  provider: HealthcareProvider | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { actor } = useSession();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!provider) return;
    setReason('');
    setError(null);
  }, [provider]);

  const submit = async (): Promise<void> => {
    if (reason.trim().length < 10) {
      setError('Give a reason of at least ten characters. It is the only feedback the clinician receives.');
      return;
    }
    if (!provider) return;
    setBusy(true);
    try {
      await providerRepo.reject(provider.id, reason.trim(), actor?.displayName ?? 'Administrator');
      const account = await profileRepo.list(1000).then((result) => result.rows.find((user) => user.uid === provider.userId) ?? null);
      if (account && account.status !== 'CLOSED') {
        await profileRepo.adminUpdate(account.uid, { status: 'PENDING_APPROVAL' });
      }
      onDone();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not save.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(provider)}
      onClose={onClose}
      title={provider ? `Decline ${provider.fullName}` : 'Decline application'}
      description="They keep their account and can correct the details and submit again. The reason is shown to them exactly as written."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="outline-danger" onClick={() => void submit()} loading={busy} icon={<XCircle className="size-4" aria-hidden />}>
            Decline application
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {provider ? (
          <KeyValue
            columns={2}
            dense
            items={[
              { label: 'Profession', value: PROFESSION_LABELS[provider.profession] },
              { label: 'Facility', value: provider.facilityName },
              { label: 'Licence', value: provider.licenseNumber ?? 'Not provided' },
              { label: 'Submitted', value: formatDate(provider.createdAt, 'long') },
            ]}
          />
        ) : null}
        <Field label="Reason" htmlFor="rp-reason" required error={error ?? undefined} hint="Specific and actionable: what to correct and where to check it.">
          <TextArea id="rp-reason" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. The licence number does not match the General Nursing Council register. Please re-enter it exactly as printed on your current practising certificate." />
        </Field>
      </div>
    </Modal>
  );
}

function ManageProviderModal({
  provider,
  facilities,
  onClose,
  onSaved,
}: {
  provider: HealthcareProvider | null;
  facilities: Facility[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [title, setTitle] = useState('');
  const [profession, setProfession] = useState<Profession>('midwife');
  const [facilityId, setFacilityId] = useState('');
  const [facilityName, setFacilityName] = useState('');
  const [licenseNumber, setLicence] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [languages, setLanguages] = useState('');
  const [bio, setBio] = useState('');
  const [listed, setListed] = useState(true);
  const [accepting, setAccepting] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!provider) return;
    setFullName(provider.fullName);
    setTitle(provider.title ?? '');
    setProfession(provider.profession);
    setFacilityId(provider.facilityId ?? '');
    setFacilityName(provider.facilityName);
    setLicence(provider.licenseNumber ?? '');
    setPhone(provider.phone ?? '');
    setEmail(provider.email ?? '');
    setLanguages(provider.languages.join(', '));
    setBio(provider.bio ?? '');
    setListed(provider.listedInDirectory);
    setAccepting(provider.acceptingNewPatients);
  }, [provider]);

  if (!provider) return null;

  const save = async (): Promise<void> => {
    if (fullName.trim().length < 2) {
      toast.error('A name is required');
      return;
    }
    setBusy(true);
    try {
      const facility = facilities.find((candidate) => candidate.id === facilityId) ?? null;
      await providerRepo.update(provider.id, {
        fullName: fullName.trim(),
        title: title.trim() || null,
        profession,
        facilityId: facility?.id ?? null,
        facilityName: facility?.name ?? facilityName.trim(),
        licenseNumber: licenseNumber.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        languages: languages.split(',').map((item) => item.trim()).filter(Boolean),
        bio: bio.trim() || null,
        listedInDirectory: listed,
        acceptingNewPatients: accepting,
      });
      await logAudit('record-update', 'providers', provider.id, `Administrator edited ${fullName}`);
      toast.success('Provider updated');
      onSaved();
    } catch (cause) {
      toast.error('That did not save', cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const suspend = async (): Promise<void> => {
    const next = provider.status === 'suspended' ? 'approved' : 'suspended';
    setBusy(true);
    try {
      await providerRepo.update(provider.id, { status: next, listedInDirectory: next === 'approved' ? listed : false });
      await logAudit('status-change', 'providers', provider.id, next === 'suspended' ? `Suspended ${provider.fullName}` : `Reinstated ${provider.fullName}`);
      toast.success(next === 'suspended' ? 'Provider suspended' : 'Provider reinstated');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const verify = async (): Promise<void> => {
    setBusy(true);
    try {
      await providerRepo.approve(provider.id, actor?.displayName ?? 'Administrator');
      toast.success('Provider verified');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={provider.fullName}
      description={`${PROFESSION_LABELS[provider.profession]} · ${provider.facilityName} · submitted ${relativeTime(provider.createdAt)}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          <Button variant="outline-danger" size="sm" onClick={() => void suspend()} disabled={busy} icon={provider.status === 'suspended' ? <Eye className="size-4" aria-hidden /> : <EyeOff className="size-4" aria-hidden />}>
            {provider.status === 'suspended' ? 'Reinstate' : 'Suspend'}
          </Button>
          {provider.status !== 'approved' ? (
            <Button variant="secondary" onClick={() => void verify()} disabled={busy} icon={<BadgeCheck className="size-4" aria-hidden />}>
              Verify
            </Button>
          ) : null}
          <Button onClick={() => void save()} loading={busy}>Save changes</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Card className="card-pad border-ink-200 bg-ink-50">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONES[provider.status]}>{STATUS_LABELS[provider.status]}</Badge>
            {provider.verifiedAt ? (
              <span className="text-xs text-ink-600">
                Verified {formatDate(provider.verifiedAt, 'day')} by {provider.verifiedBy ?? 'an administrator'}
              </span>
            ) : (
              <span className="text-xs text-ink-600">Never verified</span>
            )}
            {provider.userId ? <Badge tone="neutral">Linked account</Badge> : <Badge tone="amber">No account linked</Badge>}
          </div>
          {provider.rejectionReason ? (
            <p className="mt-2 text-sm text-ink-700">
              <strong className="font-semibold">Last decline reason:</strong> {provider.rejectionReason}
            </p>
          ) : null}
        </Card>

        <FieldGrid columns={2}>
          <Field label="Full name" htmlFor="mp-name" required>
            <TextInput id="mp-name" value={fullName} onValueChange={setFullName} />
          </Field>
          <Field label="Title" htmlFor="mp-title" optional>
            <TextInput id="mp-title" value={title} onValueChange={setTitle} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Profession" htmlFor="mp-profession">
            <Select
              id="mp-profession"
              value={profession}
              onChange={(event) => setProfession(event.target.value as Profession)}
              options={(Object.keys(PROFESSION_LABELS) as Profession[]).map((value) => ({ value, label: PROFESSION_LABELS[value] }))}
            />
          </Field>
          <Field label="Licence number" htmlFor="mp-licence" hint="Checked against the professional council.">
            <TextInput id="mp-licence" value={licenseNumber} onValueChange={setLicence} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Facility record" htmlFor="mp-facility" hint="Linking gives mothers directions and opening hours.">
            <Select
              id="mp-facility"
              value={facilityId}
              onChange={(event) => {
                const id = event.target.value;
                setFacilityId(id);
                const chosen = facilities.find((facility) => facility.id === id);
                if (chosen) setFacilityName(chosen.name);
              }}
              options={[{ value: '', label: 'Not linked' }, ...facilities.map((facility) => ({ value: facility.id, label: facility.name }))]}
            />
          </Field>
          <Field label="Facility name" htmlFor="mp-facility-name" required>
            <TextInput id="mp-facility-name" value={facilityName} onValueChange={setFacilityName} />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Phone" htmlFor="mp-phone">
            <TextInput id="mp-phone" value={phone} onValueChange={setPhone} placeholder="+260…" />
          </Field>
          <Field label="Email" htmlFor="mp-email">
            <TextInput id="mp-email" type="email" value={email} onValueChange={setEmail} />
          </Field>
        </FieldGrid>
        <Field label="Languages" htmlFor="mp-languages" hint="Comma separated.">
          <TextInput id="mp-languages" value={languages} onValueChange={setLanguages} />
        </Field>
        <Field label="Biography" htmlFor="mp-bio" hint="Shown publicly. No patient details.">
          <TextArea id="mp-bio" rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />
        </Field>

        <div className="space-y-3 rounded-lg border border-ink-200 p-3">
          <CheckboxRow
            checked={listed}
            onChange={setListed}
            label="List in the public directory"
            description="Only verified providers are actually shown, whatever this switch says."
          />
          <Switch
            label="Accepting new patients"
            description="Displayed as a badge on their directory card."
            checked={accepting}
            onChange={setAccepting}
          />
        </div>

        <p className="flex items-start gap-2 text-xs text-ink-500">
          <Building2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Changes here are logged with your name. A provider sees the result on their own profile page immediately.
        </p>
      </div>
    </Modal>
  );
}


import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { KeyRound, RefreshCw, Search, UserPlus, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, NoticeState } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { Field, SearchInput, Select, TextInput } from '@/components/ui/form';
import { useAsync, useDebouncedValue } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { createStaffAccount, listUsers, requestPasswordResetFor, setUserStatus, type UserDirectoryRow } from '@/services/admin/user-admin';
import { adminCreateUserSchema } from '@/lib/validation';
import { ROLE_LABELS, type AccountStatus, type Role } from '@/types/domain';
import { relativeTime } from '@/lib/utils';
import { useForm } from '@/hooks/use-form';
import { FormDialog } from '@/components/forms/form-dialog';

/**
 * The user directory. Every write here goes through the privileged service,
 * which requires an administrator, records a reason and bumps the account's
 * privilege version so the affected session loses access on its next token
 * refresh.
 */
export default function AdminUsersPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const [term, setTerm] = useState(params.get('search') ?? '');
  const [role, setRole] = useState<Role | 'ALL'>((params.get('role') as Role | null) ?? 'ALL');
  const [status, setStatus] = useState<AccountStatus | 'ALL'>((params.get('status') as AccountStatus | null) ?? 'ALL');
  const [facilityId, setFacilityId] = useState(params.get('facilityId') ?? '');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const search = useDebouncedValue(term, 300);

  const facilities = useAsync(() => services().data.allFacilities(), {});
  const directory = useAsync(
    () => listUsers({ search: search || undefined, role, status, facilityId: facilityId || null }),
    { deps: [search, role, status, facilityId] },
  );

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('search', search);
    if (role !== 'ALL') next.set('role', role);
    if (status !== 'ALL') next.set('status', status);
    if (facilityId) next.set('facilityId', facilityId);
    setParams(next, { replace: true });
  }, [search, role, status, facilityId, setParams]);

  const rows = useMemo(() => directory.data?.rows ?? [], [directory.data]);

  const suspend = async (row: UserDirectoryRow, next: AccountStatus) => {
    setBusy(row.id);
    try {
      await setUserStatus(row.id, next, next === 'SUSPENDED' ? 'Suspended from the admin directory.' : 'Reinstated from the admin directory.');
      toast.success(next === 'SUSPENDED' ? 'Account suspended' : 'Account reactivated', `${row.fullName} · ${next === 'SUSPENDED' ? 'locked out immediately' : 'can sign in again'}.`);
      void directory.run();
    } catch (error) {
      toast.error(error, 'The account could not be updated');
    } finally {
      setBusy(null);
    }
  };

  const reset = async (row: UserDirectoryRow) => {
    setBusy(row.id);
    try {
      const result = await requestPasswordResetFor(row.id);
      toast.info('Reset handled', result.message);
    } catch (error) {
      toast.error(error, 'The reset could not be sent');
    } finally {
      setBusy(null);
    }
  };

  const columns: Column<UserDirectoryRow>[] = [
    {
      key: 'person',
      header: 'Account',
      render: (row) => (
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-brand-50 text-[0.7rem] font-bold text-brand-900" aria-hidden>
            {row.fullName.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-semibold text-ink-900">
              <Link to={`/admin/users/${row.id}`} className="hover:text-brand-800 hover:underline">
                {row.fullName}
              </Link>
              {row.isSelf ? <span className="caption ml-1.5">(you)</span> : null}
            </p>
            <p className="caption mt-0.5 break-all">{row.email}</p>
          </div>
        </div>
      ),
      sortValue: (row) => row.fullName,
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => (
        <div className="space-y-1">
          <Badge tone={row.role === 'ADMIN' ? 'purple' : row.role === 'MOTHER' ? 'green' : 'brand'}>{row.roleLabel}</Badge>
          {row.requestedRole && row.status === 'PENDING_APPROVAL' ? <p className="caption">requested {ROLE_LABELS[row.requestedRole]}</p> : null}
        </div>
      ),
      hideBelow: 'sm',
    },
    { key: 'facility', header: 'Facility', render: (row) => <span className="text-[0.84rem] text-ink-700">{row.facilityName}</span>, hideBelow: 'md', sortValue: (row) => row.facilityName },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <Badge tone={row.status === 'ACTIVE' ? 'green' : row.status === 'PENDING_APPROVAL' ? 'amber' : 'red'}>
            {row.status === 'ACTIVE' ? 'Active' : row.status === 'PENDING_APPROVAL' ? 'Awaiting approval' : 'Suspended'}
          </Badge>
          <p className="caption">{row.lastLoginAt ? `last seen ${relativeTime(row.lastLoginAt)}` : 'never signed in'}</p>
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex flex-wrap justify-end gap-1.5">
          <Link to={`/admin/users/${row.id}`} className="btn btn-quiet btn-sm">
            Manage
          </Link>
          <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void reset(row)} icon={<KeyRound className="size-3.5" aria-hidden />}>
            Reset
          </Button>
          {row.status === 'SUSPENDED' ? (
            <Button size="sm" variant="secondary" disabled={busy === row.id} onClick={() => void suspend(row, 'ACTIVE')}>
              Reactivate
            </Button>
          ) : row.status === 'ACTIVE' && !row.isSelf ? (
            <Button size="sm" variant="ghost" disabled={busy === row.id} onClick={() => void suspend(row, 'SUSPENDED')}>
              Suspend
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <AppShell
      title="Users"
      subtitle={`${directory.data?.total ?? 0} account${directory.data?.total === 1 ? '' : 's'} · ${directory.data?.pending ?? 0} awaiting approval`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={directory.loading} onClick={() => void directory.run()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          <Button size="sm" onClick={() => setCreating(true)} icon={<UserPlus className="size-4" aria-hidden />}>
            Create staff account
          </Button>
        </>
      }
    >
      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={term} onValueChange={setTerm} placeholder="Search name, email or phone" className="min-w-[15rem] flex-1" />
          <Select
            value={role}
            className="w-44"
            options={[{ value: 'ALL', label: 'Any role' }, ...(Object.keys(ROLE_LABELS) as Role[]).map((key) => ({ value: key, label: ROLE_LABELS[key] }))]}
            onValueChange={(value) => setRole(value as Role | 'ALL')}
          />
          <Select
            value={status}
            className="w-44"
            options={[
              { value: 'ALL', label: 'Any status' },
              { value: 'ACTIVE', label: 'Active' },
              { value: 'PENDING_APPROVAL', label: 'Awaiting approval' },
              { value: 'SUSPENDED', label: 'Suspended' },
            ]}
            onValueChange={(value) => setStatus(value as AccountStatus | 'ALL')}
          />
          <Select
            value={facilityId}
            className="w-52"
            options={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
            onValueChange={setFacilityId}
            placeholder="Any facility"
          />
          {term || role !== 'ALL' || status !== 'ALL' || facilityId ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTerm('');
                setRole('ALL');
                setStatus('ALL');
                setFacilityId('');
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      {directory.error ? <div className="mb-4"><ErrorState message={directory.error} onRetry={() => void directory.run()} /></div> : null}

      <Card bodyClassName="p-0">
        {rows.length === 0 && !directory.loading ? (
          <EmptyState
            icon={<Search className="size-5" aria-hidden />}
            title="No accounts match these filters"
            description="Health workers who self-register appear here once they have confirmed their email — with the status “Awaiting approval”."
          />
        ) : (
          <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} loading={directory.loading} dense pageSize={25} caption="Accounts" />
        )}
      </Card>

      <div className="mt-4">
        <NoticeState tone="info" title="How privileges actually work" compact>
          Roles live in the token as custom claims and are enforced by the database rules. Changing a role here updates the claims and bumps the account’s
          privilege version, so the old token stops working at its next refresh — the interface never decides what data a person may read.
        </NoticeState>
      </div>

      <CreateStaffDialog
        open={creating}
        onClose={() => setCreating(false)}
        facilities={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
        onCreated={() => {
          setCreating(false);
          void directory.run();
        }}
      />
    </AppShell>
  );
}

function CreateStaffDialog({
  open,
  onClose,
  facilities,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  facilities: { value: string; label: string }[];
  onCreated: () => void;
}) {
  const toast = useToast();
  const form = useForm(adminCreateUserSchema, {
    fullName: '',
    email: '',
    phone: '',
    role: 'MIDWIFE',
    facilityId: facilities[0]?.value ?? '',
    jobTitle: '',
    temporaryPassword: '',
    note: '',
  });

  useEffect(() => {
    if (open && !form.values.facilityId && facilities[0]) form.setField('facilityId', facilities[0].value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facilities]);

  const submit = async () => {
    await form.submit(async (values) => {
      const result = await createStaffAccount({
        fullName: values.fullName,
        email: values.email,
        phone: values.phone,
        role: values.role as Role,
        facilityId: values.facilityId,
        temporaryPassword: values.temporaryPassword,
        note: values.note || undefined,
      });
      toast.success(
        'Account created',
        result.created === 'server'
          ? `${values.email} can sign in with the temporary password and is asked to change it.`
          : `${values.email} was created in device storage for this browser (no auth server configured).`,
      );
      form.reset({ ...form.values, email: '', fullName: '', temporaryPassword: '', note: '' });
      onCreated();
    });
  };

  return (
    <FormDialog
      open={open}
      onClose={onClose}
      onSubmit={() => void submit()}
      title="Create a staff account"
      description="The account is created active with the role you choose. Administrators can grant administrator rights here; no other role can."
      submitting={form.submitting}
      dirty={form.dirty}
      formError={form.formError}
      submitLabel="Create account"
      size="md"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Full name" error={form.errors.fullName} required>
            <TextInput value={form.values.fullName} onValueChange={(value) => form.setField('fullName', value)} onBlur={() => form.blur('fullName')} />
          </Field>
          <Field label="Work email" error={form.errors.email} required>
            <TextInput type="email" value={form.values.email} onValueChange={(value) => form.setField('email', value)} onBlur={() => form.blur('email')} />
          </Field>
          <Field label="Phone" error={form.errors.phone} required>
            <TextInput value={form.values.phone} onValueChange={(value) => form.setField('phone', value)} placeholder="+260 97 000 0000" />
          </Field>
          <Field label="Job title" error={form.errors.jobTitle}>
            <TextInput value={form.values.jobTitle} onValueChange={(value) => form.setField('jobTitle', value)} placeholder="In-charge, antenatal clinic" />
          </Field>
          <Field label="Role" error={form.errors.role} required hint="ADMIN is deliberately selectable only by an existing administrator.">
            <Select
              value={form.values.role}
              options={(Object.keys(ROLE_LABELS) as Role[]).map((key) => ({ value: key, label: ROLE_LABELS[key] }))}
              onValueChange={(value) => form.setField('role', value as Role)}
              placeholder={null}
            />
          </Field>
          <Field label="Facility" error={form.errors.facilityId} required>
            <Select value={form.values.facilityId} options={facilities} onValueChange={(value) => form.setField('facilityId', value)} placeholder={facilities.length ? 'Select a facility' : 'No facilities configured yet'} />
          </Field>
        </div>
        <Field label="Temporary password" error={form.errors.temporaryPassword} required hint="At least 10 characters, mixed case and a digit. Hand it over in person.">
          <TextInput type="text" value={form.values.temporaryPassword} onValueChange={(value) => form.setField('temporaryPassword', value)} onBlur={() => form.blur('temporaryPassword')} />
        </Field>
        <Field label="Reason for the account" error={form.errors.note} hint="Stored with the audit entry.">
          <TextInput value={form.values.note} onValueChange={(value) => form.setField('note', value)} placeholder="Transferred from Chazoma health centre" />
        </Field>
        <p className="caption flex items-center gap-1.5">
          <Users className="size-3.5" aria-hidden />
          Created accounts are limited to their facility. A mother’s patient login is created from her record instead, so it is always tied to one patient.
        </p>
      </div>
    </FormDialog>
  );
}

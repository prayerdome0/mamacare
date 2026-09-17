/**
 * Administrator — accounts.
 *
 * Every account on the deployment with the two controls that actually matter:
 * role and status. Role changes are logged and take effect at the next sign-in,
 * because claims live in the token. Status changes are immediate: a suspended
 * account cannot read or write anything, and the person sees why.
 *
 * Deleting is deliberately unhelpful. A closed account is reversible; removing the
 * profile row leaves the person's health records behind unless they deleted them
 * first from their own Settings screen, and the page says so before you confirm.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Download,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { profileRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { downloadBlob, formatDate, relativeTime, toCsv, toIsoDate } from '@/lib/utils';
import {
  ACCOUNT_STATUS_LABELS,
  ROLES,
  ROLE_LABELS,
  type AccountStatus,
  type Role,
  type UserProfile,
} from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, KeyValue, SectionHeading, StatCard } from '@/components/ui/card';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

type RoleFilter = Role | 'ALL';
type StatusFilter = AccountStatus | 'ALL';

export default function AdminUsers() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [selected, setSelected] = useState<UserProfile | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => profileRepo.list(1000), { immediate: true });
  const users = useMemo<UserProfile[]>(() => data?.rows ?? [], [data]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => {
      if (roleFilter !== 'ALL' && user.role !== roleFilter) return false;
      if (statusFilter !== 'ALL' && user.status !== statusFilter) return false;
      if (!term) return true;
      return [user.fullName, user.email, user.phone ?? '', user.country].join(' ').toLowerCase().includes(term);
    });
  }, [users, search, roleFilter, statusFilter]);

  const counts = useMemo(() => {
    const byStatus = users.reduce<Record<string, number>>((acc, user) => {
      acc[user.status] = (acc[user.status] ?? 0) + 1;
      return acc;
    }, {});
    return {
      total: users.length,
      mothers: users.filter((user) => user.role === 'MOTHER').length,
      staff: users.filter((user) => ['PROVIDER', 'FACILITY_ADMIN', 'ADMIN'].includes(user.role)).length,
      suspended: byStatus.SUSPENDED ?? 0,
      pending: byStatus.PENDING_APPROVAL ?? 0,
      neverSignedIn: users.filter((user) => !user.lastLoginAt).length,
    };
  }, [users]);

  useEffect(() => {
    document.title = 'Accounts · Mama Care admin';
  }, []);

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Name', 'Email', 'Phone', 'Role', 'Status', 'Country', 'Language', 'Joined', 'Last login'],
      filtered.map((user) => [
        user.fullName,
        user.email,
        user.phone ?? '',
        ROLE_LABELS[user.role],
        ACCOUNT_STATUS_LABELS[user.status],
        user.country,
        user.language,
        user.createdAt,
        user.lastLoginAt ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-accounts-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'users', actor?.uid ?? null, `Exported ${filtered.length} accounts`);
    toast.success('Export ready', 'This file contains personal data. Store it like a clinical record and delete it when you are done.');
  };

  const columns: Column<UserProfile>[] = [
    {
      key: 'name',
      header: 'Account',
      sortValue: (row) => row.fullName,
      render: (row) => (
        <span className="flex items-center gap-2.5">
          <Avatar name={row.fullName} src={row.photoUrl} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-ink-800">{row.fullName}</span>
            <span className="block truncate text-xs text-ink-500">{row.email}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      width: '11rem',
      sortValue: (row) => row.role,
      render: (row) => <Badge tone={row.role === 'ADMIN' ? 'purple' : row.role === 'PROVIDER' ? 'brand' : row.role === 'FACILITY_ADMIN' ? 'blue' : 'neutral'}>{ROLE_LABELS[row.role]}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '10rem',
      sortValue: (row) => row.status,
      render: (row) => (
        <Badge tone={row.status === 'ACTIVE' ? 'green' : row.status === 'SUSPENDED' ? 'red' : row.status === 'CLOSED' ? 'neutral' : 'amber'}>
          {ACCOUNT_STATUS_LABELS[row.status]}
        </Badge>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'lg',
      render: (row) => (
        <span className="block text-xs text-ink-600">
          {row.phone ?? 'No phone'}
          <span className="block text-ink-500">{row.country}</span>
        </span>
      ),
    },
    {
      key: 'activity',
      header: 'Activity',
      hideBelow: 'md',
      sortValue: (row) => row.lastLoginAt ?? '',
      render: (row) => (
        <span className="block text-xs text-ink-600">
          {row.lastLoginAt ? `Seen ${relativeTime(row.lastLoginAt)}` : 'Never signed in'}
          <span className="block text-ink-500">Joined {formatDate(row.createdAt, 'day')}</span>
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '7rem',
      render: (row) => (
        <Button variant="secondary" size="sm" onClick={() => setSelected(row)} icon={<UserCog className="size-4" aria-hidden />}>
          Manage
        </Button>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Accounts"
        description="Every person who can sign in, with the role and status controls. Health records are never editable from here."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={filtered.length === 0} icon={<Download className="size-4" aria-hidden />}>
              Export CSV
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Accounts" value={counts.total} icon={<Users className="size-4" aria-hidden />} />
        <StatCard label="Mothers & supporters" value={counts.mothers} icon={<Users className="size-4" aria-hidden />} tone="brand" />
        <StatCard label="Staff accounts" value={counts.staff} icon={<ShieldCheck className="size-4" aria-hidden />} />
        <StatCard
          label="Suspended or pending"
          value={counts.suspended + counts.pending}
          icon={<ShieldAlert className="size-4" aria-hidden />}
          tone={counts.suspended > 0 ? 'red' : counts.pending > 0 ? 'amber' : 'green'}
          hint={`${counts.suspended} suspended · ${counts.pending} pending`}
        />
      </div>

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search name, email, phone or country" className="w-full sm:max-w-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Filter by role"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
              options={[{ value: 'ALL', label: 'All roles' }, ...ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] }))]}
              className="w-auto min-w-[10rem]"
            />
            <Select
              aria-label="Filter by status"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              options={[
                { value: 'ALL', label: 'All statuses' },
                ...(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((status) => ({ value: status, label: ACCOUNT_STATUS_LABELS[status] })),
              ]}
              className="w-auto min-w-[10rem]"
            />
          </div>
        </div>
        {counts.neverSignedIn > 0 ? (
          <p className="mt-3 text-xs text-ink-500">
            {counts.neverSignedIn} account{counts.neverSignedIn === 1 ? ' has' : 's have'} never signed in — usually an invitation
            that was not completed, or a registration abandoned halfway.
          </p>
        ) : null}
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Accounts could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={6} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.uid}
            caption="Accounts on this deployment, newest first"
            pageSize={25}
            emptyTitle="No accounts match"
            emptyDescription="Clear the filters or search for a different name."
            emptyAction={
              search || roleFilter !== 'ALL' || statusFilter !== 'ALL' ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setRoleFilter('ALL');
                    setStatusFilter('ALL');
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Card>

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <h3 className="card-title">What an administrator can and cannot do here</h3>
        <ul className="checklist mt-2 text-sm">
          <li>Change a role or an account status. Both are logged with your name and the reason you give.</li>
          <li>Never read or edit a patient's pregnancy record, journal, documents or messages.</li>
          <li>Suspending an account blocks sign-in immediately; their records stay intact for when they return.</li>
          <li>Deleting a profile row does not delete health records — the person must do that from their own Settings screen first.</li>
        </ul>
      </Card>

      <ManageUserModal
        user={selected}
        isSelf={selected?.uid === actor?.uid}
        onClose={() => setSelected(null)}
        onSaved={() => {
          setSelected(null);
          void run();
        }}
      />
    </StaffShell>
  );
}

function ManageUserModal({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: UserProfile | null;
  isSelf: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [role, setRole] = useState<Role>('MOTHER');
  const [status, setStatus] = useState<AccountStatus>('ACTIVE');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    setRole(user.role);
    setStatus(user.status);
    setReason('');
  }, [user]);

  if (!user) return null;

  const save = async (): Promise<void> => {
    setBusy(true);
    try {
      const patch: Partial<UserProfile> = {};
      if (role !== user.role) {
        patch.role = role;
        patch.privilegeVersion = (user.privilegeVersion ?? 0) + 1;
      }
      if (status !== user.status) patch.status = status;
      if (Object.keys(patch).length === 0) {
        toast.info('Nothing changed');
        setBusy(false);
        return;
      }
      await profileRepo.adminUpdate(user.uid, patch);
      await logAudit(
        patch.role ? 'role-change' : 'status-change',
        'users',
        user.uid,
        `${patch.role ? `Role ${user.role} → ${patch.role}` : ''}${patch.status ? ` Status ${user.status} → ${patch.status}` : ''}${reason.trim() ? ` — ${reason.trim()}` : ''}`,
      );
      toast.success('Account updated', patch.role ? 'The new role applies when they next sign in.' : undefined);
      onSaved();
    } catch (cause) {
      toast.error('That did not save', cause instanceof Error ? cause.message : 'Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const close = async (): Promise<void> => {
    const ok = await confirm({
      title: `Close ${user.fullName}'s account?`,
      message:
        'The account is marked CLOSED and cannot sign in. Records are kept, so the person can be reactivated later. Use this for someone who has finished with the service.',
      confirmLabel: 'Close account',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await profileRepo.adminUpdate(user.uid, { status: 'CLOSED' });
      await logAudit('status-change', 'users', user.uid, `Account closed${reason.trim() ? ` — ${reason.trim()}` : ''}`);
      toast.success('Account closed');
      onSaved();
    } finally {
      setBusy(false);
    }
  };

  const hardDelete = async (): Promise<void> => {
    const ok = await confirm({
      title: `Delete ${user.fullName}'s profile record?`,
      message:
        'This removes the account row only. Their pregnancies, babies, journals, documents and messages stay in the database and become orphaned — unreachable and unauditable. Ask the person to delete their own data from Settings first, or close the account instead.',
      confirmLabel: 'Delete the profile row anyway',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      await profileRepo.adminRemove(user.uid);
      await logAudit('account-delete', 'users', user.uid, `Profile row deleted by administrator${reason.trim() ? ` — ${reason.trim()}` : ''}`);
      toast.success('Profile row deleted', 'Orphaned records remain. This was logged.');
      onSaved();
    } catch (cause) {
      toast.error('That did not work', cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={user.fullName}
      description={`${user.email} · joined ${formatDate(user.createdAt, 'long')}${user.lastLoginAt ? ` · last seen ${relativeTime(user.lastLoginAt)}` : ' · never signed in'}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Close</Button>
          {!isSelf ? (
            <Button variant="outline-danger" size="sm" onClick={() => void hardDelete()} disabled={busy} icon={<Trash2 className="size-4" aria-hidden />}>
              Delete profile row
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => void close()} disabled={busy || isSelf} icon={<Mail className="size-4" aria-hidden />}>
            Close account
          </Button>
          <Button onClick={() => void save()} loading={busy} icon={<ShieldCheck className="size-4" aria-hidden />}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 px-3 py-2">
          <Avatar name={user.fullName} src={user.photoUrl} size="md" />
          <div className="min-w-0 flex-1">
            <KeyValue
              columns={2}
              dense
              items={[
                { label: 'Role', value: ROLE_LABELS[user.role] },
                { label: 'Status', value: ACCOUNT_STATUS_LABELS[user.status] },
                { label: 'Phone', value: user.phone ?? 'Not provided' },
                { label: 'Country', value: user.country },
                { label: 'Language', value: user.language },
                { label: 'Consent given', value: user.consentAt ? formatDate(user.consentAt, 'day') : '—' },
                { label: 'Provider record', value: user.providerId ? 'Linked' : 'None' },
                { label: 'Supports', value: user.supportsUserId ?? '—' },
              ]}
            />
          </div>
        </div>

        {isSelf ? (
          <p className="alert alert-info">
            This is your own account. You cannot change your own role or close it — that keeps a deployment from being locked
            out by one mistake.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" htmlFor="au-role" hint="Applies at their next sign-in, because roles travel in the token.">
            <Select
              id="au-role"
              value={role}
              onChange={(event) => setRole(event.target.value as Role)}
              disabled={isSelf}
              options={ROLES.map((value) => ({ value, label: ROLE_LABELS[value] }))}
            />
          </Field>
          <Field label="Status" htmlFor="au-status" hint="Suspended blocks sign-in immediately.">
            <Select
              id="au-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as AccountStatus)}
              disabled={isSelf}
              options={(Object.keys(ACCOUNT_STATUS_LABELS) as AccountStatus[]).map((value) => ({
                value,
                label: ACCOUNT_STATUS_LABELS[value],
              }))}
            />
          </Field>
        </div>

        <Field label="Reason for this change" htmlFor="au-reason" hint="Stored in the audit log and shown to the person if their access changes.">
          <TextArea id="au-reason" rows={3} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="e.g. Licence could not be verified with the council; account suspended until they respond." />
        </Field>

        {role !== user.role || status !== user.status ? (
          <p className="alert alert-info">
            Pending change: {role !== user.role ? `role ${ROLE_LABELS[user.role]} → ${ROLE_LABELS[role]}` : ''}
            {role !== user.role && status !== user.status ? ', ' : ''}
            {status !== user.status ? `status ${ACCOUNT_STATUS_LABELS[user.status]} → ${ACCOUNT_STATUS_LABELS[status]}` : ''}.
          </p>
        ) : null}

        <p className="flex items-start gap-2 text-xs text-ink-500">
          <Search className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Searching this list never returns another person's health data — it searches names, emails, phone numbers and
          countries only.
        </p>
      </div>
    </Modal>
  );
}

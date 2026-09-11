import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, KeyRound, MonitorOff, Save, ShieldCheck, UserCog } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, KeyValue } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { Timeline } from '@/components/ui/tabs';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { DataTable, type Column } from '@/components/ui/table';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/components/ui/toast';
import { useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { revokeUserSessions } from '@/services/api/client';
import {
  assignFacilityToUser,
  requestPasswordResetFor,
  setUserRole,
  setUserStatus,
  userActivity,
} from '@/services/admin/user-admin';
import { auditActionLabel } from '@/services/admin/audit-service';
import { ROLE_LABELS, type AuditLogEntry, type Role, type UserProfile } from '@/types/domain';
import { formatDateTime, relativeTime } from '@/lib/utils';
import { z } from 'zod';

const privilegeSchema = z.object({
  role: z.enum(['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER']),
  facilityId: z.string().trim().optional(),
  reason: z.string().trim().min(4, 'Record a short reason — it is stored with the audit entry.'),
});

/**
 * One account, fully. This is the only place privileges change, every action
 * requires a written reason, and the platform API is used for the parts that must
 * happen server-side (claims, session revocation).
 */
export default function AdminUserDetailPage() {
  const { uid = '' } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const { actor, providerKind } = useSession();
  const [saving, setSaving] = useState<'privilege' | 'status' | 'facility' | null>(null);

  const user = useAsync(() => services().data.get('users', uid), { deps: [uid] });
  const activity = useAsync(() => userActivity(uid), { deps: [uid] });
  const facilities = useAsync(() => services().data.allFacilities(), {});
  const profile = user.data as UserProfile | null;

  const form = useForm(privilegeSchema, { role: 'MIDWIFE', facilityId: '', reason: '' });

  useEffect(() => {
    if (profile) form.setValues({ role: profile.role, facilityId: profile.facilityId ?? '', reason: '' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.facilityId]);

  const facilityOptions = useMemo(() => (activity.data?.facilities ?? []).map((row) => ({ value: row.id, label: row.name })), [activity.data]);
  const isSelf = profile?.id === actor?.uid;

  const savePrivileges = async () => {
    await form.submit(async (values) => {
      setSaving('privilege');
      try {
        await setUserRole(uid, values.role as Role, { facilityId: values.facilityId || null, reason: values.reason });
        toast.success('Privileges updated', `${profile?.fullName ?? 'This account'} now holds ${ROLE_LABELS[values.role]}.`);
        form.setField('reason', '');
        void user.run();
        void activity.run();
      } catch (error) {
        toast.error(error, 'The role could not be changed');
        throw error;
      } finally {
        setSaving(null);
      }
    });
  };

  const changeStatus = async (status: 'ACTIVE' | 'SUSPENDED') => {
    setSaving('status');
    try {
      await setUserStatus(uid, status, status === 'SUSPENDED' ? 'Deactivated from the admin directory.' : 'Reinstated from the admin directory.');
      toast.success(status === 'SUSPENDED' ? 'Account deactivated' : 'Account reactivated');
      void user.run();
    } catch (error) {
      toast.error(error, 'The status could not be changed');
    } finally {
      setSaving(null);
    }
  };

  const moveFacility = async (facilityId: string) => {
    setSaving('facility');
    try {
      await assignFacilityToUser(uid, facilityId || null, 'Facility reassigned by an administrator.');
      toast.success('Facility updated');
      void user.run();
    } catch (error) {
      toast.error(error, 'The facility could not be changed');
    } finally {
      setSaving(null);
    }
  };

  const revoke = async () => {
    setSaving('status');
    try {
      if (providerKind === 'local') {
        await services().data.audit('auth.session_revoked', 'session', uid, { label: profile?.email ?? uid, metadata: { via: 'admin-directory', mode: 'device' } });
        toast.info('Sessions marked as revoked', 'The device provider has no token service, so the audit entry is recorded and the account keeps its current privileges.');
      } else {
        await revokeUserSessions({ uid, reason: 'Revoked from the admin directory.' });
        toast.success('Sessions revoked', 'Every signed-in device must sign in again.');
      }
      void activity.run();
    } catch (error) {
      toast.error(error, 'Sessions could not be revoked');
    } finally {
      setSaving(null);
    }
  };

  if (user.loading && !profile) {
    return (
      <AppShell title="Account">
        <Card>
          <LoadingRows rows={4} />
        </Card>
      </AppShell>
    );
  }

  if (user.error || !profile) {
    return (
      <AppShell title="Account">
        <ErrorState title="This account could not be opened" message={user.error ?? 'It may have been removed.'} onRetry={() => void user.run()} />
        <div className="mt-4">
          <Button variant="secondary" onClick={() => navigate('/admin/users')} icon={<ArrowLeft className="size-4" aria-hidden />}>
            Back to the directory
          </Button>
        </div>
      </AppShell>
    );
  }

  const auditColumns: Column<AuditLogEntry>[] = [
    {
      key: 'action',
      header: 'Action',
      render: (row) => (
        <div>
          <p className="text-[0.84rem] font-medium text-ink-900">{auditActionLabel(row.action)}</p>
          <p className="caption mt-0.5">
            {row.targetType} {row.targetLabel ? `· ${row.targetLabel}` : ''}
          </p>
        </div>
      ),
    },
    { key: 'actor', header: 'By', render: (row) => <span className="text-[0.82rem] text-ink-700">{row.actorName}</span>, hideBelow: 'sm' },
    { key: 'when', header: 'When', render: (row) => <span className="caption">{formatDateTime(row.createdAt)}</span>, align: 'right', sortValue: (row) => row.createdAt },
  ];

  return (
    <AppShell
      title={profile.fullName}
      subtitle={`${profile.email} · created ${relativeTime(profile.createdAt)}`}
      actions={
        <Link to="/admin/users" className="btn btn-secondary btn-sm">
          <ArrowLeft className="size-4" aria-hidden /> Directory
        </Link>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-4">
          <Card title="Account">
            <div className="flex flex-wrap items-start gap-4">
              <Avatar name={profile.fullName} src={profile.photoUrl} size="lg" />
              <div className="min-w-0 flex-1">
                <KeyValue
                  columns={2}
                  items={[
                    { label: 'Full name', value: profile.fullName, tone: 'strong' },
                    { label: 'Email', value: <span className="break-all">{profile.email}</span> },
                    { label: 'Role', value: <Badge tone={profile.role === 'ADMIN' ? 'purple' : profile.role === 'MOTHER' ? 'green' : 'brand'}>{ROLE_LABELS[profile.role]}</Badge> },
                    { label: 'Status', value: <Badge tone={profile.status === 'ACTIVE' ? 'green' : profile.status === 'PENDING_APPROVAL' ? 'amber' : 'red'}>{profile.status.replace(/_/g, ' ').toLowerCase()}</Badge> },
                    { label: 'Account type', value: profile.accountKind === 'PATIENT' ? 'Mother (patient) login' : 'Health worker' },
                    { label: 'Facility', value: (activity.data?.facilities ?? []).find((row) => row.id === profile.facilityId)?.name ?? 'None assigned' },
                    { label: 'Email verified', value: profile.emailVerified ? 'Yes' : 'No' },
                    { label: 'Privilege version', value: profile.privilegeVersion },
                    { label: 'Last sign-in', value: profile.lastLoginAt ? formatDateTime(profile.lastLoginAt) : 'Never' },
                    { label: 'Deactivated', value: profile.deactivatedAt ? `${formatDateTime(profile.deactivatedAt)} by ${profile.deactivatedBy ?? '—'}` : '—' },
                    { label: 'Phone', value: profile.phone ?? '—' },
                    { label: 'Licence', value: profile.licenseNumber ?? '—' },
                    ...(profile.motherId ? [{ label: 'Patient record', value: <Link to={`/app/mothers/${profile.motherId}`} className="font-semibold text-brand-800 hover:underline">{profile.motherId}</Link> }] : []),
                  ]}
                />
              </div>
            </div>
          </Card>

          <Card title="Role and facility" description="Writes the custom claims, updates the profile and records who did it. You cannot change your own privileges.">
            {isSelf ? (
              <NoticeState tone="warning" title="This is your own account" compact>
                Changing your own role is refused by the service on purpose. Ask another administrator, or use the bootstrap route described in the README if
                this deployment has no administrator yet.
              </NoticeState>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Role" error={form.errors.role} required>
                <Select
                  value={form.values.role}
                  options={(Object.keys(ROLE_LABELS) as Role[]).map((key) => ({ value: key, label: ROLE_LABELS[key] }))}
                  onValueChange={(value) => form.setField('role', value as Role)}
                  placeholder={null}
                  disabled={isSelf}
                />
              </Field>
              <Field label="Facility" error={form.errors.facilityId} hint="Mothers are linked to a record instead.">
                <Select
                  value={form.values.facilityId ?? ''}
                  options={facilityOptions}
                  onValueChange={(value) => form.setField('facilityId', value)}
                  placeholder="None"
                  disabled={isSelf}
                />
              </Field>
            </div>
            <Field label="Reason" error={form.errors.reason} required className="mt-3" hint="Stored with the audit entry and shown in the account history.">
              <TextArea rows={2} value={form.values.reason} onValueChange={(value) => form.setField('reason', value)} onBlur={() => form.blur('reason')} placeholder="Promoted after the supervisor vacancy of 12 August." disabled={isSelf} />
            </Field>
            {form.formError ? (
              <div className="mt-3">
                <NoticeState tone="error" title="The change was rejected" compact>
                  {form.formError}
                </NoticeState>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button onClick={() => void savePrivileges()} loading={saving === 'privilege'} disabled={isSelf || !form.dirty} icon={<Save className="size-4" aria-hidden />}>
                Save privileges
              </Button>
              <Button
                variant="secondary"
                loading={saving === 'facility'}
                disabled={isSelf}
                onClick={() => void moveFacility(profile.facilityId ?? '')}
                icon={<UserCog className="size-4" aria-hidden />}
              >
                Re-apply facility assignment
              </Button>
              <Button variant="ghost" onClick={() => void requestPasswordResetFor(uid).then((result) => toast.info('Reset handled', result.message))} icon={<KeyRound className="size-4" aria-hidden />}>
                Send password reset
              </Button>
            </div>
          </Card>

          <Card title="Activity" description="Everything the account did, and everything done to it.">
            {(activity.data?.entries ?? []).length === 0 ? (
              <EmptyState icon={<ShieldCheck className="size-5" aria-hidden />} title="No audit entries for this account" description="Sign-ins, record writes and privilege changes all appear here." />
            ) : (
              <DataTable rows={activity.data?.entries ?? []} columns={auditColumns} rowKey={(row) => row.id} dense pageSize={10} caption="Audit entries" />
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Access control">
            <div className="space-y-2.5">
              {profile.status === 'SUSPENDED' ? (
                <Button className="w-full" variant="secondary" loading={saving === 'status'} onClick={() => void changeStatus('ACTIVE')}>
                  Reactivate account
                </Button>
              ) : (
                <Button className="w-full" variant="danger" loading={saving === 'status'} disabled={isSelf} onClick={() => void changeStatus('SUSPENDED')} icon={<Ban className="size-4" aria-hidden />}>
                  {isSelf ? 'You cannot deactivate yourself' : 'Deactivate account'}
                </Button>
              )}
              <Button className="w-full" variant="secondary" loading={saving === 'status'} onClick={() => void revoke()} icon={<MonitorOff className="size-4" aria-hidden />}>
                Revoke all sessions
              </Button>
              <p className="caption">
                {providerKind === 'local'
                  ? 'The device provider has no token service, so revocation is recorded as an audit entry and the local session ends when the browser is closed.'
                  : 'Revocation forces every device to sign in again. The privilege version also invalidates stale tokens on their next refresh.'}
              </p>
            </div>
          </Card>

          <Card title="Facility history">
            <Timeline
              items={(activity.data?.entries ?? [])
                .filter((row) => row.action === 'user.facility_assigned' || row.action === 'user.role_changed')
                .slice(0, 6)
                .map((row) => ({
                  title: auditActionLabel(row.action),
                  meta: relativeTime(row.createdAt),
                  detail: row.targetLabel ?? null,
                  tone: 'brand' as const,
                }))}
            />
            {(activity.data?.entries ?? []).filter((row) => row.action === 'user.facility_assigned' || row.action === 'user.role_changed').length === 0 ? (
              <p className="caption">No assignment changes recorded.</p>
            ) : null}
          </Card>

          <Card title="Pending approval">
            {profile.status === 'PENDING_APPROVAL' ? (
              <NoticeState tone="warning" title="Awaiting approval" compact>
                {profile.requestedRole ? `They asked for ${ROLE_LABELS[profile.requestedRole]}. Assign the role above to issue claims and unlock the workspace.` : 'Assign a role above to issue claims and unlock the workspace.'}
              </NoticeState>
            ) : (
              <NoticeState tone="success" title="Approved" compact>
                This account can sign in and sees only the records its role and facility allow.
              </NoticeState>
            )}
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

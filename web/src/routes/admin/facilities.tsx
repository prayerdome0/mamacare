import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Pencil, Plus, RefreshCw, Users } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, NoticeState } from '@/components/ui/display';
import { DataTable, type Column } from '@/components/ui/table';
import { Field, Select, Switch, TextInput } from '@/components/ui/form';
import { FormDialog } from '@/components/forms/form-dialog';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { facilitySchema } from '@/lib/validation';
import { FACILITY_TYPES, FACILITY_TYPE_LABELS, type Facility, type FacilityType } from '@/types/domain';
import { formatDate } from '@/lib/utils';

/**
 * Facility directory. A facility is the unit of access for everything else —
 * mothers, staff, alerts and reports are all scoped by it — so creating or
 * changing one is administrator-only and audited.
 */
export default function AdminFacilitiesPage() {
  const [params, setParams] = useSearchParams();
  const toast = useToast();
  const facilities = useAsync(() => services().data.allFacilities(), {});
  const roster = useAsync(() => services().data.motherRoster(null), {});
  const staff = useAsync(() => services().data.list('users', { limit: 500 }), {});
  const alerts = useAsync(() => services().data.list('alerts', { where: [{ field: 'status', op: '!=', value: 'RESOLVED' }], limit: 500 }), {});
  const [editing, setEditing] = useState<Facility | 'new' | null>(null);

  const focus = params.get('focus');
  useEffect(() => {
    if (!focus) return;
    const match = (facilities.data ?? []).find((row) => row.id === focus);
    if (match) setEditing(match);
    const next = new URLSearchParams(params);
    next.delete('focus');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, facilities.data]);

  const stats = useMemo(() => {
    const mothers = new Map<string, number>();
    for (const mother of roster.data ?? []) {
      const key = mother.careFacilityId || mother.registrationFacilityId;
      mothers.set(key, (mothers.get(key) ?? 0) + 1);
    }
    const workers = new Map<string, number>();
    for (const user of staff.data?.rows ?? []) {
      if (!user.facilityId || user.accountKind === 'PATIENT') continue;
      workers.set(user.facilityId, (workers.get(user.facilityId) ?? 0) + 1);
    }
    const openAlerts = new Map<string, number>();
    for (const alert of alerts.data?.rows ?? []) {
      openAlerts.set(alert.facilityId, (openAlerts.get(alert.facilityId) ?? 0) + 1);
    }
    return { mothers, workers, openAlerts };
  }, [roster.data, staff.data, alerts.data]);

  const columns: Column<Facility>[] = [
    {
      key: 'facility',
      header: 'Facility',
      render: (row) => (
        <div className="flex items-start gap-2.5">
          {row.imageUrl ? (
            <img src={row.imageUrl} alt="" className="size-11 shrink-0 rounded-lg object-cover ring-1 ring-ink-200" loading="lazy" />
          ) : (
            <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-400" aria-hidden>
              <Building2 className="size-4" />
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate text-[0.88rem] font-semibold text-ink-900">{row.name}</p>
            <p className="caption mt-0.5">
              {row.code} · {FACILITY_TYPE_LABELS[row.type]} · {row.district}, {row.province}
            </p>
          </div>
        </div>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: 'capacity',
      header: 'Capacity',
      render: (row) => (
        <div className="flex flex-wrap gap-1">
          <Badge tone={row.hasMaternityWard ? 'brand' : 'neutral'}>maternity</Badge>
          <Badge tone={row.hasUltrasound ? 'brand' : 'neutral'}>ultrasound</Badge>
          <Badge tone={row.hasLaboratory ? 'brand' : 'neutral'}>lab</Badge>
          {row.bedCount ? <Badge tone="neutral">{row.bedCount} beds</Badge> : null}
        </div>
      ),
      hideBelow: 'md',
    },
    {
      key: 'referral',
      header: 'Refers onward to',
      render: (row) => {
        const target = (facilities.data ?? []).find((candidate) => candidate.id === row.referralToFacilityId);
        return <span className="text-[0.84rem] text-ink-700">{target?.name ?? 'Not set'}</span>;
      },
      hideBelow: 'lg',
    },
    {
      key: 'volume',
      header: 'Mothers / staff / open alerts',
      render: (row) => (
        <span className="tnum text-[0.84rem] text-ink-700">
          {stats.mothers.get(row.id) ?? 0} · {stats.workers.get(row.id) ?? 0} ·{' '}
          <span className={(stats.openAlerts.get(row.id) ?? 0) > 0 ? 'font-semibold text-[var(--color-risk-red-text)]' : ''}>{stats.openAlerts.get(row.id) ?? 0}</span>
        </span>
      ),
      hideBelow: 'sm',
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <div className="space-y-1">
          <Badge tone={row.active ? 'green' : 'amber'}>{row.active ? 'Active' : 'Inactive'}</Badge>
          <p className="caption">updated {formatDate(row.updatedAt)}</p>
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setEditing(row)} icon={<Pencil className="size-3.5" aria-hidden />}>
          Edit
        </Button>
      ),
    },
  ];

  const totalMothers = (facilities.data ?? []).reduce((sum, row) => sum + (stats.mothers.get(row.id) ?? 0), 0);

  return (
    <AppShell
      title="Facilities"
      subtitle={`${(facilities.data ?? []).length} facilities · ${totalMothers} mothers enrolled`}
      actions={
        <>
          <Button
            size="sm"
            variant="secondary"
            loading={facilities.loading}
            onClick={() => {
              void facilities.run();
              void roster.run();
              void staff.run();
              void alerts.run();
            }}
            icon={<RefreshCw className="size-4" aria-hidden />}
          >
            Refresh
          </Button>
          <Button size="sm" onClick={() => setEditing('new')} icon={<Plus className="size-4" aria-hidden />}>
            Add facility
          </Button>
        </>
      }
    >
      {facilities.error ? <div className="mb-4"><ErrorState message={facilities.error} onRetry={() => void facilities.run()} /></div> : null}

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Facilities" value={(facilities.data ?? []).length} hint="Configured in this deployment" loading={facilities.loading} icon={<Building2 className="size-4" aria-hidden />} />
        <StatCard label="Active" value={(facilities.data ?? []).filter((row) => row.active).length} hint="Available for registration and referral" />
        <StatCard label="With maternity ward" value={(facilities.data ?? []).filter((row) => row.hasMaternityWard).length} hint="Can receive labour referrals" />
        <StatCard label="With ultrasound" value={(facilities.data ?? []).filter((row) => row.hasUltrasound).length} hint="Dating and growth scans" />
      </div>

      <Card bodyClassName="p-0">
        {(facilities.data ?? []).length === 0 && !facilities.loading ? (
          <EmptyState
            icon={<Users className="size-5" aria-hidden />}
            title="No facilities yet"
            description="Add each hospital, health centre or clinic in the catchment. Midwives and CHWs are then assigned to one, and every list is scoped by facility."
            action={
              <Button onClick={() => setEditing('new')}>
                Add the first facility
              </Button>
            }
          />
        ) : (
          <DataTable rows={facilities.data ?? []} columns={columns} rowKey={(row) => row.id} loading={facilities.loading} dense pageSize={20} caption="Facilities" />
        )}
      </Card>

      <div className="mt-4">
        <NoticeState tone="info" title="What a facility controls" compact>
          Registration and care scope for mothers, the pool of staff that may read those records, the default referral destination, and which supervisors see
          which reports. Deactivating a facility hides it from new registrations; existing records keep their history.
        </NoticeState>
      </div>

      {editing ? (
        <FacilityDialog
          facility={editing === 'new' ? null : editing}
          others={(facilities.data ?? []).filter((row) => row.id !== (editing === 'new' ? '' : editing.id))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void facilities.run();
            toast.info('Facility directory refreshed');
          }}
        />
      ) : null}
    </AppShell>
  );
}

function FacilityDialog({
  facility,
  others,
  onClose,
  onSaved,
}: {
  facility: Facility | null;
  others: Facility[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const form = useForm(facilitySchema, {
    name: facility?.name ?? '',
    code: facility?.code ?? '',
    type: (facility?.type ?? 'HEALTH_CENTRE') as FacilityType,
    district: facility?.district ?? '',
    province: facility?.province ?? 'Lusaka Province',
    address: facility?.address ?? '',
    phone: facility?.phone ?? '',
    email: facility?.email ?? '',
    referralToFacilityId: facility?.referralToFacilityId ?? '',
    bedCount: facility?.bedCount ?? undefined,
    hasMaternityWard: facility?.hasMaternityWard ?? true,
    hasUltrasound: facility?.hasUltrasound ?? false,
    hasLaboratory: facility?.hasLaboratory ?? false,
    active: facility?.active ?? true,
  });
  const [image, setImage] = useState<ImageUploadResult | null>(
    facility?.imageUrl || facility?.imagePublicId ? { publicId: facility.imagePublicId ?? null, secureUrl: facility.imageUrl ?? null } : null,
  );

  const submit = async () => {
    await form.submit(async (values) => {
      try {
        const saved = await services().data.saveFacility({
          id: facility?.id,
          name: values.name,
          code: values.code,
          type: values.type as Facility['type'],
          district: values.district,
          province: values.province,
          address: values.address || null,
          phone: values.phone || null,
          email: values.email || null,
          referralToFacilityId: values.referralToFacilityId || null,
          bedCount: values.bedCount ?? null,
          hasMaternityWard: values.hasMaternityWard,
          hasUltrasound: values.hasUltrasound,
          hasLaboratory: values.hasLaboratory,
          active: values.active,
          imageUrl: image?.secureUrl ?? facility?.imageUrl ?? null,
          imagePublicId: image?.publicId ?? facility?.imagePublicId ?? null,
        } as Partial<Facility> & { name: string; code: string; district: string; province: string });
        toast.success(facility ? 'Facility updated' : 'Facility created', saved.name);
        onSaved();
      } catch (error) {
        toast.error(error, 'The facility was not saved');
        throw error;
      }
    });
  };

  return (
    <FormDialog
      open
      onClose={onClose}
      onSubmit={() => void submit()}
      title={facility ? `Edit ${facility.name}` : 'Add a facility'}
      description="Facility codes are unique per deployment and appear on reports and referrals."
      submitting={form.submitting}
      dirty={form.dirty}
      formError={form.formError}
      submitLabel={facility ? 'Save facility' : 'Create facility'}
      size="lg"
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Facility name" error={form.errors.name} required>
            <TextInput value={form.values.name} onValueChange={(value) => form.setField('name', value)} onBlur={() => form.blur('name')} placeholder="Chazoma Health Centre" />
          </Field>
          <Field label="Code" error={form.errors.code} required hint="Uppercase, e.g. CHZ-01">
            <TextInput value={form.values.code} onValueChange={(value) => form.setField('code', value.toUpperCase())} />
          </Field>
          <Field label="Type" error={form.errors.type} required>
            <Select
              value={form.values.type}
              options={FACILITY_TYPES.map((type) => ({ value: type, label: FACILITY_TYPE_LABELS[type] }))}
              onValueChange={(value) => form.setField('type', value as FacilityType)}
              placeholder={null}
            />
          </Field>
          <Field label="Onward referral to" error={form.errors.referralToFacilityId} hint="Suggested destination when this facility cannot manage the case.">
            <Select
              value={form.values.referralToFacilityId ?? ''}
              options={others.map((row) => ({ value: row.id, label: `${row.name} · ${row.district}` }))}
              onValueChange={(value) => form.setField('referralToFacilityId', value)}
              placeholder={others.length ? 'Not set' : 'Add another facility first'}
            />
          </Field>
          <Field label="District" error={form.errors.district} required>
            <TextInput value={form.values.district} onValueChange={(value) => form.setField('district', value)} />
          </Field>
          <Field label="Province" error={form.errors.province} required>
            <TextInput value={form.values.province} onValueChange={(value) => form.setField('province', value)} />
          </Field>
          <Field label="Address" error={form.errors.address}>
            <TextInput value={form.values.address ?? ''} onValueChange={(value) => form.setField('address', value)} />
          </Field>
          <Field label="Phone" error={form.errors.phone}>
            <TextInput value={form.values.phone ?? ''} onValueChange={(value) => form.setField('phone', value)} placeholder="+260 21 000 000" />
          </Field>
          <Field label="Email" error={form.errors.email}>
            <TextInput type="email" value={form.values.email ?? ''} onValueChange={(value) => form.setField('email', value)} />
          </Field>
          <Field label="Maternity beds" error={form.errors.bedCount} optional hint="Used in capacity reporting only.">
            <TextInput type="number" min={0} value={form.values.bedCount ?? ''} onValueChange={(value) => form.setField('bedCount', value === '' ? undefined : Number(value))} />
          </Field>
        </div>

        <div className="grid gap-3 rounded-lg border border-ink-200 p-3 sm:grid-cols-2">
          <Switch checked={form.values.hasMaternityWard} onChange={(value) => form.setField('hasMaternityWard', value)} label="Maternity ward" description="Can receive labour and delivery referrals" />
          <Switch checked={form.values.hasUltrasound} onChange={(value) => form.setField('hasUltrasound', value)} label="Ultrasound" description="Dating scans and growth monitoring" />
          <Switch checked={form.values.hasLaboratory} onChange={(value) => form.setField('hasLaboratory', value)} label="Laboratory" description="Haemoglobin, urine, malaria and HIV testing on site" />
          <Switch checked={form.values.active} onChange={(value) => form.setField('active', value)} label="Active" description="Inactive facilities are hidden from new registrations" />
        </div>

        <Field label="Photograph" optional hint="Shown in the directory and on the public facility list. Stored in mamacare/facilities.">
          <ImageUploader folder="facilities" value={image} onChange={setImage} label="Facility image" ratio="16 / 9" />
        </Field>
      </div>
    </FormDialog>
  );
}

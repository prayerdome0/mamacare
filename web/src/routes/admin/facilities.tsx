/**
 * Administrator — facility directory.
 *
 * The directory is the one part of Mama Care a mother may act on physically: she
 * travels there, sometimes in labour. So the screen is built around accuracy —
 * verification state is always visible, a phone number is treated as more important
 * than a pin on a map, and stale entries can be deactivated without being deleted
 * (a deleted facility breaks the history on appointments already recorded there).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  Download,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Upload,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { useForm } from '@/hooks/use-form';
import { facilityRepo } from '@/services/repositories';
import { logAudit } from '@/services/audit';
import { useConfirm, useSession } from '@/providers/app-providers';
import { downloadBlob, formatDate, relativeTime, toCsv, toIsoDate } from '@/lib/utils';
import { facilitySchema, type FacilityValues } from '@/lib/validation';
import { FACILITY_DATA_NOTE, PROVINCES, facilitySeeds, directionsUrl } from '@/config/facilities';
import { countryOptions } from '@/config/geo';
import { ImageUploader, type ImageUploadResult } from '@/components/media/image-uploader';
import { FACILITY_TYPE_LABELS, type Facility, type FacilityType } from '@/types/domain';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading, StatCard } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, FieldGrid, SearchInput, Select, Switch, TextArea, TextInput } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { DataTable, type Column } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

export default function AdminFacilities() {
  const { actor } = useSession();
  const toast = useToast();
  const confirm = useConfirm();
  const [search, setSearch] = useState('');
  const [province, setProvince] = useState('ALL');
  const [type, setType] = useState<FacilityType | 'ALL'>('ALL');
  const [editing, setEditing] = useState<Facility | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: facilities, loading, error, retryable, run } = useAsync(() => facilityRepo.list(), { immediate: true });
  const rows = useMemo<Facility[]>(() => facilities ?? [], [facilities]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((facility) => {
      if (province !== 'ALL' && facility.province !== province) return false;
      if (type !== 'ALL' && facility.type !== type) return false;
      if (!term) return true;
      return [facility.name, facility.city, facility.address, facility.phone ?? '', facility.services.join(' ')]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [rows, search, province, type]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      verified: rows.filter((facility) => facility.verified).length,
      inactive: rows.filter((facility) => !facility.active).length,
      maternity: rows.filter((facility) => facility.hasMaternity).length,
      emergency: rows.filter((facility) => facility.has24HourEmergency).length,
      noPhone: rows.filter((facility) => !facility.phone && !facility.emergencyPhone).length,
      stale: rows.filter((facility) => (Date.now() - new Date(facility.updatedAt ?? facility.createdAt ?? Date.now()).getTime()) / 86_400_000 > 365).length,
    }),
    [rows],
  );

  useEffect(() => {
    document.title = 'Facilities · Mama Care admin';
  }, []);

  const importSeeds = async (): Promise<void> => {
    const ok = await confirm({
      title: 'Import the built-in Zambia directory?',
      message:
        'Ships around forty government and mission facilities with coordinates and maternal services. Existing records are left alone — only missing ones are added, and they arrive unverified so you can check them.',
      confirmLabel: 'Import missing facilities',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const seeds = facilitySeeds('ZM');
      const existing = new Set(rows.map((facility) => facility.id));
      let added = 0;
      for (const seed of seeds) {
        if (existing.has(seed.id)) continue;
        const { id: _id, createdAt: _c, updatedAt: _u, ...payload } = seed;
        await facilityRepo.create(payload as Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>);
        added += 1;
      }
      await logAudit('record-create', 'facilities', null, `Imported ${added} built-in facilities`);
      toast.success(added > 0 ? `${added} facilities imported` : 'Nothing to import', added > 0 ? 'They are unverified until you check them.' : 'The built-in list is already present.');
      void run();
    } catch (cause) {
      toast.error('Import failed', cause instanceof Error ? cause.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = async (): Promise<void> => {
    const csv = toCsv(
      ['Name', 'Type', 'City', 'Province', 'Address', 'Phone', 'Emergency phone', 'Hours', 'Maternity', '24h emergency', 'Verified', 'Active', 'Latitude', 'Longitude'],
      filtered.map((facility) => [
        facility.name,
        FACILITY_TYPE_LABELS[facility.type],
        facility.city,
        facility.province,
        facility.address,
        facility.phone ?? '',
        facility.emergencyPhone ?? '',
        facility.openingHours,
        facility.hasMaternity ? 'yes' : 'no',
        facility.has24HourEmergency ? 'yes' : 'no',
        facility.verified ? 'yes' : 'no',
        facility.active ? 'yes' : 'no',
        facility.latitude ?? '',
        facility.longitude ?? '',
      ]),
    );
    downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `mamacare-facilities-${toIsoDate(new Date())}.csv`);
    await logAudit('data-export', 'facilities', actor?.uid ?? null, `Exported ${filtered.length} facilities`);
    toast.success('Export ready', 'Facility data is public information, so this file is safe to share with partners.');
  };

  const verify = async (facility: Facility): Promise<void> => {
    setBusy(true);
    try {
      await facilityRepo.verify(facility.id, actor?.displayName ?? 'Administrator');
      await logAudit('record-update', 'facilities', facility.id, `Verified ${facility.name}`);
      toast.success('Facility verified', 'Mothers no longer see the “not yet verified” caution on this entry.');
      void run();
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (facility: Facility): Promise<void> => {
    const next = !facility.active;
    if (!next) {
      const ok = await confirm({
        title: `Deactivate ${facility.name}?`,
        message:
          'It disappears from the directory and from search, but appointments already recorded against it keep its name. Use this for a closed or renamed facility.',
        confirmLabel: 'Deactivate',
      });
      if (!ok) return;
    }
    await facilityRepo.update(facility.id, { active: next, verified: next ? facility.verified : false });
    await logAudit('record-update', 'facilities', facility.id, next ? `Reactivated ${facility.name}` : `Deactivated ${facility.name}`);
    toast.success(next ? 'Facility reactivated' : 'Facility deactivated');
    void run();
  };

  const remove = async (facility: Facility): Promise<void> => {
    const ok = await confirm({
      title: `Delete ${facility.name}?`,
      message:
        'Deleting removes the record permanently. Appointments and provider profiles that reference it keep the name as text, but directions and opening hours are gone. Deactivating is usually the better choice.',
      confirmLabel: 'Delete facility',
      tone: 'danger',
    });
    if (!ok) return;
    await facilityRepo.remove(facility.id);
    await logAudit('record-delete', 'facilities', facility.id, `Deleted ${facility.name}`);
    toast.success('Facility deleted');
    void run();
  };

  const columns: Column<Facility>[] = [
    {
      key: 'name',
      header: 'Facility',
      sortValue: (row) => row.name,
      render: (row) => (
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-ink-800">{row.name}</span>
            {row.verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Not verified</Badge>}
            {!row.active ? <Badge tone="neutral">Inactive</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-ink-500">
            {FACILITY_TYPE_LABELS[row.type]} · {row.city}, {row.province}
          </span>
        </span>
      ),
    },
    {
      key: 'services',
      header: 'Maternal services',
      hideBelow: 'lg',
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.hasMaternity ? <Badge tone="brand">Maternity</Badge> : null}
          {row.has24HourEmergency ? <Badge tone="red">24h emergency</Badge> : null}
          {row.maternalServices.slice(0, 2).map((service) => (
            <Badge key={service} tone="neutral">{service}</Badge>
          ))}
          {row.maternalServices.length > 2 ? <span className="text-xs text-ink-500">+{row.maternalServices.length - 2}</span> : null}
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      hideBelow: 'md',
      render: (row) =>
        row.phone || row.emergencyPhone ? (
          <span className="block text-xs text-ink-700 tnum">
            {row.phone ?? '—'}
            {row.emergencyPhone ? <span className="block text-ink-500">Emergency {row.emergencyPhone}</span> : null}
          </span>
        ) : (
          <Badge tone="red">No phone</Badge>
        ),
    },
    {
      key: 'updated',
      header: 'Last checked',
      hideBelow: 'lg',
      sortValue: (row) => row.updatedAt ?? row.createdAt ?? '',
      render: (row) => <span className="text-xs text-ink-600">{relativeTime(row.updatedAt ?? row.createdAt)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      width: '16rem',
      render: (row) => (
        <div className="actions-wrap justify-end">
          {!row.verified ? (
            <Button variant="primary" size="sm" onClick={() => void verify(row)} icon={<ShieldCheck className="size-4" aria-hidden />}>
              Verify
            </Button>
          ) : null}
          <Button variant="secondary" size="sm" onClick={() => { setEditing(row); setCreating(false); }}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void toggleActive(row)}>
            {row.active ? 'Deactivate' : 'Activate'}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => void remove(row)} aria-label={`Delete ${row.name}`} icon={<Trash2 className="size-4" aria-hidden />} />
        </div>
      ),
    },
  ];

  return (
    <StaffShell portal="Admin Dashboard">
      <StaffPageHeader
        title="Facility directory"
        description="Clinics, health posts, maternity homes and hospitals mothers can find, filter and travel to."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => void run()} icon={<RefreshCw className="size-4" aria-hidden />}>
              Refresh
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={filtered.length === 0} icon={<Download className="size-4" aria-hidden />}>
              Export
            </Button>
            <Button variant="secondary" size="sm" onClick={() => void importSeeds()} loading={busy} icon={<Upload className="size-4" aria-hidden />}>
              Import built-ins
            </Button>
            <Button variant="primary" size="sm" onClick={() => { setCreating(true); setEditing(null); }} icon={<Plus className="size-4" aria-hidden />}>
              Add facility
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Facilities" value={counts.total} icon={<Building2 className="size-4" aria-hidden />} />
        <StatCard label="Verified" value={counts.verified} icon={<ShieldCheck className="size-4" aria-hidden />} tone={counts.verified === counts.total ? 'green' : 'amber'} hint={`${counts.total - counts.verified} to check`} />
        <StatCard label="With maternity" value={counts.maternity} icon={<MapPin className="size-4" aria-hidden />} tone="brand" hint={`${counts.emergency} have 24h emergency`} />
        <StatCard
          label="Data problems"
          value={counts.noPhone + counts.inactive + counts.stale}
          icon={<Phone className="size-4" aria-hidden />}
          tone={counts.noPhone > 0 ? 'red' : 'default'}
          hint={`${counts.noPhone} no phone · ${counts.stale} over a year old · ${counts.inactive} inactive`}
        />
      </div>

      <Card className="card-pad mt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={search} onValueChange={setSearch} placeholder="Search name, city, address or service" className="w-full sm:max-w-sm" />
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label="Filter by province"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              options={[{ value: 'ALL', label: 'All provinces' }, ...PROVINCES.map((name) => ({ value: name, label: name }))]}
              className="w-auto min-w-[10rem]"
            />
            <Select
              aria-label="Filter by facility type"
              value={type}
              onChange={(event) => setType(event.target.value as FacilityType | 'ALL')}
              options={[
                { value: 'ALL', label: 'All types' },
                ...(Object.keys(FACILITY_TYPE_LABELS) as FacilityType[]).map((value) => ({ value, label: FACILITY_TYPE_LABELS[value] })),
              ]}
              className="w-auto min-w-[11rem]"
            />
          </div>
        </div>
      </Card>

      <Card className="card-pad mt-4">
        {error ? <ErrorState title="Facilities could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows rows={5} /> : null}
        {!loading && !error ? (
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(row) => row.id}
            caption="Facility directory entries"
            pageSize={20}
            emptyTitle={rows.length === 0 ? 'The directory is empty' : 'No facilities match'}
            emptyDescription={
              rows.length === 0
                ? 'Import the built-in Zambia list to start, then verify and correct each entry as you confirm it by phone.'
                : 'Try another province or type, or clear the search.'
            }
            emptyAction={
              rows.length === 0 ? (
                <Button variant="primary" size="sm" onClick={() => void importSeeds()}>
                  Import built-in facilities
                </Button>
              ) : undefined
            }
          />
        ) : null}
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card className="card-pad">
          <SectionHeading eyebrow="Accuracy" title="How this directory is used" />
          <p className="mt-2 text-sm text-ink-600">{FACILITY_DATA_NOTE}</p>
          <ul className="checklist mt-3 text-sm">
            <li>A phone number matters more than coordinates — a mother calls before she travels.</li>
            <li>Mark 24-hour emergency only when it is true overnight, not just during clinic hours.</li>
            <li>Deactivate rather than delete when a facility closes or is renamed.</li>
            <li>Verification means somebody confirmed the details recently; it is not a quality rating.</li>
          </ul>
        </Card>
        <Card className="card-pad">
          <SectionHeading eyebrow="Coverage" title="Provinces represented" />
          {rows.length === 0 ? (
            <EmptyState className="mt-3" icon={<MapPin className="size-6" aria-hidden />} title="No facilities yet" description="Import the built-in list or add the first facility by hand." />
          ) : (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {PROVINCES.map((name) => {
                const total = rows.filter((facility) => facility.province === name).length;
                return (
                  <li key={name} className="flex items-center justify-between gap-2 rounded-lg border border-ink-200 px-3 py-1.5">
                    <span className="text-sm text-ink-700">{name}</span>
                    <Badge tone={total === 0 ? 'red' : 'neutral'}>{total}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-500">
            A province with no entries means a mother there sees nothing useful. Fill the gap before expanding to another
            country.
          </p>
        </Card>
      </div>

      <FacilityModal
        open={creating || Boolean(editing)}
        facility={editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        onSaved={() => { setCreating(false); setEditing(null); void run(); }}
      />
    </StaffShell>
  );
}

function FacilityModal({
  open,
  facility,
  onClose,
  onSaved,
}: {
  open: boolean;
  facility: Facility | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [services, setServices] = useState('');
  const [maternalServices, setMaternalServices] = useState('');
  const [image, setImage] = useState<ImageUploadResult | null>(null);
  const [keepImage, setKeepImage] = useState(true);

  const form = useForm<FacilityValues>(facilitySchema, {
    name: '',
    type: 'clinic',
    address: '',
    city: '',
    province: 'Lusaka',
    country: 'ZM',
    phone: '',
    emergencyPhone: '',
    latitude: undefined,
    longitude: undefined,
    openingHours: '',
    hasMaternity: false,
    has24HourEmergency: false,
    services: [],
    maternalServices: [],
    active: true,
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: facility?.name ?? '',
      type: facility?.type ?? 'clinic',
      address: facility?.address ?? '',
      city: facility?.city ?? '',
      province: facility?.province ?? 'Lusaka',
      country: facility?.country ?? 'ZM',
      phone: facility?.phone ?? '',
      emergencyPhone: facility?.emergencyPhone ?? '',
      latitude: facility?.latitude ?? undefined,
      longitude: facility?.longitude ?? undefined,
      openingHours: facility?.openingHours ?? '',
      hasMaternity: facility?.hasMaternity ?? false,
      has24HourEmergency: facility?.has24HourEmergency ?? false,
      services: facility?.services ?? [],
      maternalServices: facility?.maternalServices ?? [],
      active: facility?.active ?? true,
    });
    setServices((facility?.services ?? []).join(', '));
    setMaternalServices((facility?.maternalServices ?? []).join(', '));
    setImage(facility?.imageUrl ? { publicId: facility.imagePublicId, secureUrl: facility.imageUrl } : null);
    setKeepImage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, facility]);

  const submit = async (): Promise<void> => {
    const result = await form.submit(async (values) => {
      const payload = {
        name: values.name,
        type: values.type,
        address: values.address,
        city: values.city,
        province: values.province,
        country: values.country,
        phone: values.phone?.trim() || null,
        emergencyPhone: values.emergencyPhone?.trim() || null,
        latitude: values.latitude ?? null,
        longitude: values.longitude ?? null,
        openingHours: values.openingHours,
        hasMaternity: values.hasMaternity,
        has24HourEmergency: values.has24HourEmergency,
        services: services.split(',').map((item) => item.trim()).filter(Boolean),
        maternalServices: maternalServices.split(',').map((item) => item.trim()).filter(Boolean),
        active: values.active,
      };
      if (facility) {
        await facilityRepo.update(facility.id, {
          ...payload,
          imageUrl: keepImage ? image?.secureUrl ?? facility.imageUrl : null,
          imagePublicId: keepImage ? image?.publicId ?? facility.imagePublicId : null,
        });
        await logAudit('record-update', 'facilities', facility.id, `Edited ${payload.name}`);
        toast.success('Facility updated');
      } else {
        await facilityRepo.create({
          ...payload,
          imageUrl: image?.secureUrl ?? null,
          imagePublicId: image?.publicId ?? null,
          verified: false,
          verifiedAt: null,
        } as Omit<Facility, 'id' | 'createdAt' | 'updatedAt'>);
        await logAudit('record-create', 'facilities', null, `Added ${payload.name}`);
        toast.success('Facility added', 'It shows as “not yet verified” until you confirm the details.');
      }
      onSaved();
    });
    if (!result.ok) toast.error('Check the highlighted fields');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={facility ? `Edit ${facility.name}` : 'Add a facility'}
      description="Mothers use these details to decide where to go, sometimes in an emergency. If you are unsure about a field, leave it out rather than guessing."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={form.submitting}>Cancel</Button>
          <Button onClick={() => void submit()} loading={form.submitting}>
            {facility ? 'Save changes' : 'Add facility'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FieldGrid columns={2}>
          <Field label="Name" htmlFor="fa-name" required error={form.errors.name}>
            <TextInput id="fa-name" value={form.values.name} onValueChange={(value) => form.setField('name', value)} onBlur={() => form.blur('name')} invalid={Boolean(form.errors.name)} placeholder="e.g. Chilenje Level 1 Hospital" />
          </Field>
          <Field label="Type" htmlFor="fa-type" required error={form.errors.type}>
            <Select
              id="fa-type"
              value={form.values.type}
              onChange={(event) => form.setField('type', event.target.value as FacilityType)}
              options={(Object.keys(FACILITY_TYPE_LABELS) as FacilityType[]).map((value) => ({ value, label: FACILITY_TYPE_LABELS[value] }))}
            />
          </Field>
        </FieldGrid>
        <Field label="Address" htmlFor="fa-address" required error={form.errors.address} hint="Landmarks help more than street numbers in many towns.">
          <TextInput id="fa-address" value={form.values.address} onValueChange={(value) => form.setField('address', value)} invalid={Boolean(form.errors.address)} />
        </Field>
        <FieldGrid columns={3}>
          <Field label="City or town" htmlFor="fa-city" required error={form.errors.city}>
            <TextInput id="fa-city" value={form.values.city} onValueChange={(value) => form.setField('city', value)} invalid={Boolean(form.errors.city)} />
          </Field>
          <Field label="Province" htmlFor="fa-province" required error={form.errors.province}>
            <Select
              id="fa-province"
              value={form.values.province}
              onChange={(event) => form.setField('province', event.target.value)}
              options={PROVINCES.map((name) => ({ value: name, label: name }))}
            />
          </Field>
          <Field label="Country" htmlFor="fa-country" required>
            <Select
              id="fa-country"
              value={form.values.country}
              onChange={(event) => form.setField('country', event.target.value)}
              options={countryOptions()}
            />
          </Field>
        </FieldGrid>
        <FieldGrid columns={2}>
          <Field label="Phone" htmlFor="fa-phone" error={form.errors.phone} hint="The single most useful field in this record.">
            <TextInput id="fa-phone" value={form.values.phone ?? ''} onValueChange={(value) => form.setField('phone', value)} placeholder="+260…" />
          </Field>
          <Field label="Emergency / labour ward phone" htmlFor="fa-emergency" error={form.errors.emergencyPhone}>
            <TextInput id="fa-emergency" value={form.values.emergencyPhone ?? ''} onValueChange={(value) => form.setField('emergencyPhone', value)} placeholder="+260…" />
          </Field>
        </FieldGrid>
        <Field label="Opening hours" htmlFor="fa-hours" required error={form.errors.openingHours} hint="Say what happens overnight, not just clinic hours.">
          <TextInput id="fa-hours" value={form.values.openingHours} onValueChange={(value) => form.setField('openingHours', value)} invalid={Boolean(form.errors.openingHours)} placeholder="e.g. Outpatient 07:30–16:00; maternity and emergency 24 hours" />
        </Field>
        <FieldGrid columns={2}>
          <Field label="Latitude" htmlFor="fa-lat" optional hint="Used for distance sorting only.">
            <TextInput id="fa-lat" value={form.values.latitude === undefined ? '' : String(form.values.latitude)} onValueChange={(value) => form.setField('latitude', value === '' ? undefined : Number(value))} inputMode="decimal" />
          </Field>
          <Field label="Longitude" htmlFor="fa-lng" optional>
            <TextInput id="fa-lng" value={form.values.longitude === undefined ? '' : String(form.values.longitude)} onValueChange={(value) => form.setField('longitude', value === '' ? undefined : Number(value))} inputMode="decimal" />
          </Field>
        </FieldGrid>
        <Field label="General services" htmlFor="fa-services" optional hint="Comma separated.">
          <TextInput id="fa-services" value={services} onValueChange={setServices} placeholder="Outpatient, laboratory, pharmacy, HIV testing" />
        </Field>
        <Field label="Maternal services" htmlFor="fa-maternal" optional hint="Comma separated — these drive the directory filters.">
          <TextInput id="fa-maternal" value={maternalServices} onValueChange={setMaternalServices} placeholder="Antenatal clinic, delivery, postnatal check, PMTCT" />
        </Field>
        <div className="space-y-3 rounded-lg border border-ink-200 p-3">
          <CheckboxRow checked={form.values.hasMaternity} onChange={(checked) => form.setField('hasMaternity', checked)} label="Has maternity services" description="Shown as a filter for mothers looking for a place to deliver." />
          <CheckboxRow checked={form.values.has24HourEmergency} onChange={(checked) => form.setField('has24HourEmergency', checked)} label="24-hour emergency" description="Only tick this if it is genuinely staffed overnight." tone="danger" />
          <CheckboxRow checked={form.values.active} onChange={(checked) => form.setField('active', checked)} label="Active — visible in the directory" />
        </div>
        <ImageUploader folder="facilities" label="Facility photo" value={image} onChange={setImage} hint="Optional. Exterior or reception only — never patients, never inside a consultation room." />
        {facility?.imageUrl ? (
          <Switch label="Keep the existing photo" description="Turn off to remove it when you save." checked={keepImage} onChange={setKeepImage} />
        ) : null}
        {form.formError ? <p className="alert alert-error">{form.formError}</p> : null}
        {facility ? (
          <p className="text-xs text-ink-500">
            Added {formatDate(facility.createdAt, 'long')} · last updated {relativeTime(facility.updatedAt)} ·{' '}
            {facility.verified ? `verified ${facility.verifiedAt ? formatDate(facility.verifiedAt, 'day') : ''}` : 'never verified'} ·{' '}
            <a className="nav-link" href={directionsUrl(facility)} target="_blank" rel="noreferrer">
              Open directions
            </a>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

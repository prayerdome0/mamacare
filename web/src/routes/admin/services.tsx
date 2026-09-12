import { useEffect, useState } from 'react';
import { Archive, Pencil, Plus, RefreshCw, Stethoscope } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { CheckboxRow, Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { FormDialog } from '@/components/forms/form-dialog';
import { useSession } from '@/providers/app-providers';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { services } from '@/services/session-store';
import { createService, listServices, retireService, updateService } from '@/services/admin/service-service';
import { SERVICE_CATEGORY_LABELS, type ServiceOffering } from '@/types/domain';

/**
 * Services catalogue.
 *
 * The maternal-health services this deployment offers. The public site's
 * services section and the booking flows read this collection, so what the
 * clinic provides is data, not a hard-coded list of cards.
 */
export default function ServicesPage() {
  const { permissions } = useSession();
  const toast = useToast();
  const [editing, setEditing] = useState<ServiceOffering | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const list = useAsync(() => listServices(), {});
  const facilities = useAsync(() => services().data.allFacilities(), {});

  useEffect(() => {
    void list.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = () => void list.run();

  const toggleAvailable = async (row: ServiceOffering) => {
    setBusy(row.id);
    try {
      await updateService(row.id, { available: !row.available });
      toast.success(row.available ? 'Hidden from the public site' : 'Shown on the public site', row.name);
      reload();
    } catch (error) {
      toast.error(error, 'Could not change this service');
    } finally {
      setBusy(null);
    }
  };

  const retire = async (row: ServiceOffering) => {
    setBusy(row.id);
    try {
      await retireService(row.id);
      toast.info('Service retired', `${row.name} is no longer offered, and its history is kept.`);
      reload();
    } catch (error) {
      toast.error(error, 'Could not retire this service');
    } finally {
      setBusy(null);
    }
  };

  const rows = list.data ?? [];
  const canManage = permissions.canManageServices;

  return (
    <AppShell
      title="Services"
      subtitle={`${rows.length} service${rows.length === 1 ? '' : 's'} · ${rows.filter((row) => row.available).length} shown on the public site`}
      actions={
        <>
          <Button size="sm" variant="secondary" loading={list.loading} onClick={reload} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {canManage ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
              icon={<Plus className="size-4" aria-hidden />}
            >
              Add service
            </Button>
          ) : null}
        </>
      }
    >
      {list.error ? (
        <div className="mb-4">
          <ErrorState message={list.error} onRetry={reload} />
        </div>
      ) : null}

      <Card bodyClassName="p-0">
        {list.loading && rows.length === 0 ? (
          <div className="p-4">
            <LoadingRows rows={4} />
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<Stethoscope className="size-5" aria-hidden />}
              title="No services listed yet"
              description="Add what your facility offers — antenatal care, delivery, postnatal and newborn care, laboratory, outreach. The public site and the booking forms read this list."
              action={
                canManage ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setDialogOpen(true);
                    }}
                  >
                    Add the first service
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <ul className="divide-y divide-ink-100">
            {rows.map((row) => (
              <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[0.9rem] font-semibold text-ink-900">{row.name}</p>
                    <Badge tone="neutral">{SERVICE_CATEGORY_LABELS[row.category]}</Badge>
                    {row.available ? <Badge tone="green">on the public site</Badge> : <Badge tone="amber">hidden</Badge>}
                    {row.requiresAppointment ? <Badge tone="blue">appointment required</Badge> : null}
                  </div>
                  <p className="mt-1 text-[0.84rem] text-ink-700">{row.summary}</p>
                  <p className="caption mt-1">
                    {row.durationMinutes ? `${row.durationMinutes} minutes · ` : ''}
                    {row.facilityIds.length === 0
                      ? 'Offered at every facility'
                      : `${row.facilityIds.length} facilit${row.facilityIds.length === 1 ? 'y' : 'ies'}`}
                  </p>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={busy === row.id}
                      onClick={() => {
                        setEditing(row);
                        setDialogOpen(true);
                      }}
                      icon={<Pencil className="size-3.5" aria-hidden />}
                    >
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void toggleAvailable(row)}>
                      {row.available ? 'Hide' : 'Show'}
                    </Button>
                    {row.available ? (
                      <Button size="sm" variant="ghost" loading={busy === row.id} onClick={() => void retire(row)} icon={<Archive className="size-3.5" aria-hidden />}>
                        Retire
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <ServiceDialog
        open={dialogOpen}
        service={editing}
        facilities={(facilities.data ?? []).map((facility) => ({ value: facility.id, label: facility.name }))}
        onClose={() => setDialogOpen(false)}
        onSaved={() => {
          setDialogOpen(false);
          reload();
        }}
      />
    </AppShell>
  );
}

function ServiceDialog({
  open,
  service,
  facilities,
  onClose,
  onSaved,
}: {
  open: boolean;
  service: ServiceOffering | null;
  facilities: { value: string; label: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ServiceOffering['category']>('ANTENATAL');
  const [duration, setDuration] = useState('30');
  const [requiresAppointment, setRequiresAppointment] = useState(true);
  const [available, setAvailable] = useState(true);
  const [facilityIds, setFacilityIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(service?.name ?? '');
    setSummary(service?.summary ?? '');
    setDescription(service?.description ?? '');
    setCategory(service?.category ?? 'ANTENATAL');
    setDuration(service?.durationMinutes ? String(service.durationMinutes) : '30');
    setRequiresAppointment(service?.requiresAppointment ?? true);
    setAvailable(service?.available ?? true);
    setFacilityIds(service?.facilityIds ?? []);
    setError(null);
  }, [open, service]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const draft = {
        name,
        summary,
        description: description || null,
        category,
        facilityIds,
        durationMinutes: duration ? Number(duration) : null,
        requiresAppointment,
        available,
      };
      if (service) await updateService(service.id, draft);
      else await createService(draft);
      toast.success(service ? 'Service updated' : 'Service added', name);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The service could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <FormDialog
      open={open}
      title={service ? 'Edit service' : 'Add a service'}
      description="Listed on the public site and used when booking."
      onClose={onClose}
      onSubmit={() => void save()}
      submitting={saving}
      formError={error}
      submitLabel={service ? 'Save changes' : 'Add service'}
    >
      <Field label="Name">
        <TextInput value={name} onValueChange={setName} placeholder="Antenatal care" maxLength={80} />
      </Field>
      <Field label="Summary" hint="One line, shown on the public site.">
        <TextInput value={summary} onValueChange={setSummary} placeholder="Regular check-ups through pregnancy, with screening and birth planning." maxLength={160} />
      </Field>
      <Field label="Longer description" hint="Optional.">
        <TextArea rows={3} value={description} onValueChange={setDescription} placeholder="What happens at a visit, who runs it, what to bring." maxLength={800} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category">
          <Select
            value={category}
            onValueChange={(value) => setCategory(value as ServiceOffering['category'])}
            placeholder={null}
            options={(Object.keys(SERVICE_CATEGORY_LABELS) as ServiceOffering['category'][]).map((key) => ({
              value: key,
              label: SERVICE_CATEGORY_LABELS[key],
            }))}
          />
        </Field>
        <Field label="Typical duration (minutes)">
          <TextInput value={duration} onValueChange={setDuration} inputMode="numeric" placeholder="30" maxLength={3} />
        </Field>
      </div>
      <CheckboxRow label="Requires an appointment" checked={requiresAppointment} onChange={setRequiresAppointment} />
      <CheckboxRow label="Show on the public site" checked={available} onChange={setAvailable} />
      <div className="rounded-xl border border-ink-200 p-3">
        <p className="label">Offered at</p>
        <p className="caption mt-0.5">Leave everything unticked to mean “every facility”.</p>
        <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {facilities.length === 0 ? (
            <p className="caption">No facilities configured yet.</p>
          ) : (
            facilities.map((facility) => (
              <CheckboxRow
                key={facility.value}
                label={facility.label}
                checked={facilityIds.includes(facility.value)}
                onChange={(checked) =>
                  setFacilityIds((current) => (checked ? [...current, facility.value] : current.filter((id) => id !== facility.value)))
                }
              />
            ))
          )}
        </div>
      </div>
    </FormDialog>
  );
}

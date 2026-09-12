/**
 * Services catalogue.
 *
 * The maternal-health services a facility offers. This is real data: the public
 * site's services section, the booking form and the facility profile all read it,
 * so nothing about what the clinic provides is hard-coded in a component.
 *
 * Only an administrator maintains it (`firestore.rules` and the policy module
 * agree), and a service is never deleted outright — it is marked unavailable so
 * historical references stay meaningful.
 */

import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { services } from '@/services/session-store';
import type { ServiceOffering } from '@/types/domain';

const now = (): string => new Date().toISOString();

export interface ServiceDraft {
  name: string;
  summary: string;
  description?: string | null;
  icon?: string | null;
  category: ServiceOffering['category'];
  facilityIds: string[];
  durationMinutes?: number | null;
  requiresAppointment: boolean;
  available: boolean;
  sortOrder?: number;
}

function validate(draft: ServiceDraft): void {
  if (draft.name.trim().length < 2) throw new AppError('Give the service a name.', 'VALIDATION');
  if (draft.summary.trim().length < 10) throw new AppError('Write a one-line summary people will read.', 'VALIDATION');
  if (draft.durationMinutes !== null && draft.durationMinutes !== undefined && (draft.durationMinutes < 5 || draft.durationMinutes > 480)) {
    throw new AppError('A typical appointment runs between 5 minutes and 8 hours.', 'VALIDATION');
  }
}

export async function createService(draft: ServiceDraft): Promise<ServiceOffering> {
  const registry = services();
  const actor = registry.require();
  validate(draft);

  const existing = await listServices();
  const record: ServiceOffering = {
    id: newId('svc'),
    name: draft.name.trim(),
    summary: draft.summary.trim(),
    description: draft.description?.trim() || null,
    icon: draft.icon?.trim() || null,
    category: draft.category,
    facilityIds: draft.facilityIds,
    durationMinutes: draft.durationMinutes ?? null,
    requiresAppointment: draft.requiresAppointment,
    available: draft.available,
    sortOrder: draft.sortOrder ?? (existing.length + 1) * 10,
    createdAt: now(),
    createdBy: actor.uid,
    updatedAt: null,
  };

  const saved = (await registry.data.create('services', record as never)) as ServiceOffering;
  await registry.data.audit('service.created', 'service', saved.id, { label: saved.name });
  return saved;
}

export async function updateService(id: string, draft: Partial<ServiceDraft>): Promise<ServiceOffering> {
  const registry = services();
  const current = await registry.data.get('services', id);
  if (!current) throw new AppError('That service could not be found.', 'NOT_FOUND');
  validate({ ...current, ...draft } as ServiceDraft);

  const patch: Partial<ServiceOffering> = { updatedAt: now() };
  if (draft.name !== undefined) patch.name = draft.name.trim();
  if (draft.summary !== undefined) patch.summary = draft.summary.trim();
  if (draft.description !== undefined) patch.description = draft.description?.trim() || null;
  if (draft.icon !== undefined) patch.icon = draft.icon?.trim() || null;
  if (draft.category !== undefined) patch.category = draft.category;
  if (draft.facilityIds !== undefined) patch.facilityIds = draft.facilityIds;
  if (draft.durationMinutes !== undefined) patch.durationMinutes = draft.durationMinutes;
  if (draft.requiresAppointment !== undefined) patch.requiresAppointment = draft.requiresAppointment;
  if (draft.available !== undefined) patch.available = draft.available;
  if (draft.sortOrder !== undefined) patch.sortOrder = draft.sortOrder;

  const saved = (await registry.data.update('services', id, patch)) as ServiceOffering;
  await registry.data.audit('service.updated', 'service', id, { label: saved.name });
  return saved;
}

/**
 * Retires a service.
 *
 * Kept as a row rather than removed: appointment history and reports reference
 * the name, and `firestore.rules` only allows an administrator to delete.
 */
export async function retireService(id: string): Promise<ServiceOffering> {
  return updateService(id, { available: false });
}

export async function deleteService(id: string): Promise<void> {
  const registry = services();
  await registry.data.remove('services', id);
  await registry.data.audit('service.deleted', 'service', id, {});
}

export async function listServices(options: { availableOnly?: boolean } = {}): Promise<ServiceOffering[]> {
  const registry = services();
  const { rows } = await registry.data.list('services', { limit: 200 });
  const all = rows as ServiceOffering[];
  const visible = options.availableOnly ? all.filter((row) => row.available) : all;
  return visible.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

/** Public read for the landing page. Never throws — an empty list is fine. */
export async function publicServices(limit = 8): Promise<ServiceOffering[]> {
  try {
    const all = await listServices({ availableOnly: true });
    return all.slice(0, limit);
  } catch {
    return [];
  }
}

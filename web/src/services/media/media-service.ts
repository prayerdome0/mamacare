/**
 * Media, documents and reports.
 *
 * Thin domain layer over the Cloudinary service: it decides which folder an asset
 * belongs to, records the metadata document (permissions included), and writes the
 * audit entry. Nothing here is allowed to publish a sensitive file: reports and
 * medical documents are uploaded with a non-public access mode and are opened
 * through a resolved URL, never a stored public one.
 */

import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { services } from '@/services/session-store';
import { cloudinaryConfig } from '@/config/env';
import {
  deleteAsset,
  folderPath,
  resolveAssetUrl,
  uploadAsset,
  type MediaFolder,
  type UploadedAsset,
} from '@/services/media/cloudinary';
import type { DocumentCategory, DocumentRecord, ReportRecord, Role } from '@/types/domain';
import { CLINICAL_ROLES } from '@/types/domain';

const CATEGORY_FOLDER: Record<DocumentCategory, MediaFolder> = {
  REPORT: 'reports',
  MEDICAL: 'documents',
  REFERRAL: 'documents',
  FACILITY: 'facilities',
  EDUCATION: 'education',
  CONSENT: 'documents',
  LABORATORY: 'documents',
  OTHER: 'documents',
};

const DEFAULT_ACCESS: Record<MediaFolder, Role[]> = {
  reports: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE'],
  documents: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER'],
  profiles: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'],
  mothers: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE'],
  facilities: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'],
  education: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'],
  branding: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'],
  public: ['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER', 'MOTHER'],
};

export interface UploadContext {
  category: DocumentCategory;
  name: string;
  description?: string | null;
  motherId?: string | null;
  patientId?: string | null;
  pregnancyId?: string | null;
  visitId?: string | null;
  referralId?: string | null;
  facilityId?: string | null;
  ownerUserId?: string | null;
  accessRoles?: Role[];
  accessUserIds?: string[];
  onProgress?: (percent: number, state: 'validating' | 'uploading' | 'finalising') => void;
  signal?: AbortSignal;
}

export interface MediaUploadResult {
  record: DocumentRecord;
  asset: UploadedAsset;
}

export async function uploadDocument(file: File, context: UploadContext): Promise<MediaUploadResult> {
  const registry = services();
  const actor = registry.require();
  const folder = CATEGORY_FOLDER[context.category];

  let motherPatientId = context.patientId ?? null;
  if (context.motherId) {
    const mother = await registry.data.get('mothers', context.motherId);
    if (!mother) throw new AppError('The patient record for this upload could not be found.', 'NOT_FOUND');
    motherPatientId = mother.patientId;
  }

  const subFolder = motherPatientId ?? context.facilityId ?? undefined;
  const accessRoles = context.accessRoles ?? DEFAULT_ACCESS[folder];

  try {
    const asset = await uploadAsset({
      file,
      folder,
      subFolder,
      publicIdHint: context.name,
      tags: motherPatientId ? [`patient-${motherPatientId}`] : undefined,
      context: {
        patient: motherPatientId ?? 'n/a',
        category: context.category,
        uploaded_by: actor.uid,
      },
      metadata: {
        mamacare_category: context.category,
        mamacare_folder: folderPath(folder, subFolder),
        mamacare_patient: motherPatientId ?? '',
        mamacare_facility: context.facilityId ?? '',
      },
      onProgress: context.onProgress,
      signal: context.signal,
    });

    const record = (await registry.data.registerDocument({
      name: context.name.trim(),
      category: context.category,
      description: context.description ?? null,
      ownerUserId: context.ownerUserId ?? (folder === 'profiles' ? actor.uid : null),
      motherId: context.motherId ?? null,
      patientId: motherPatientId,
      pregnancyId: context.pregnancyId ?? null,
      visitId: context.visitId ?? null,
      referralId: context.referralId ?? null,
      facilityId: context.facilityId ?? actor.facilityId ?? null,
      mimeType: asset.mimeType,
      sizeBytes: asset.bytes,
      publicId: asset.publicId,
      secureUrl: asset.storage === 'cloudinary' ? asset.secureUrl : null,
      localHandle: asset.localHandle ?? null,
      folder: asset.folder,
      version: 1,
      checksum: asset.checksum ?? null,
      accessRoles,
      accessUserIds: [actor.uid, ...(context.accessUserIds ?? [])],
      accessMode: asset.accessMode === 'public' ? 'PUBLIC_READ' : 'AUTHENTICATED',
      metadata: { storage: asset.storage, uploadedAt: asset.uploadedAt },
    })) as DocumentRecord;

    await registry.data.audit('document.uploaded', 'document', record.id, {
      label: record.name,
      facilityId: record.facilityId,
      metadata: { category: record.category, bytes: record.sizeBytes, storage: asset.storage },
    });

    return { record, asset };
  } catch (error) {
    const mapped = toAppError(error);
    throw new AppError(mapped.message, mapped.code, { retryable: mapped.retryable });
  }
}

/** Opens a stored file. Sensitive assets resolve to a short-lived signed URL. */
export async function openDocument(record: DocumentRecord, options: { purpose?: 'view' | 'download' } = {}): Promise<string> {
  const registry = services();
  const url = await resolveAssetUrl({
    publicId: record.publicId,
    secureUrl: record.secureUrl,
    localHandle: record.localHandle,
    accessMode: record.accessMode === 'PUBLIC_READ' ? 'public' : 'authenticated',
    mimeType: record.mimeType,
  });
  await registry.data
    .audit('document.accessed', 'document', record.id, {
      label: record.name,
      metadata: { purpose: options.purpose ?? 'view', category: record.category },
    })
    .catch(() => null);
  return url;
}

export async function deleteDocument(record: DocumentRecord): Promise<void> {
  const registry = services();
  await deleteAsset({
    publicId: record.publicId,
    localHandle: record.localHandle,
    accessMode: record.accessMode === 'PUBLIC_READ' ? 'public' : 'authenticated',
  }).catch((error: unknown) => {
    const mapped = toAppError(error);
    throw new AppError(mapped.message, mapped.code, { retryable: mapped.retryable });
  });
  await registry.data.remove('documents', record.id);
  await registry.data.audit('document.deleted', 'document', record.id, { label: record.name });
}

/** Profile / facility imagery: a URL on the record, no document entry needed. */
export async function uploadImage(file: File, folder: Extract<MediaFolder, 'profiles' | 'facilities' | 'education' | 'branding' | 'public'>, hint?: string): Promise<UploadedAsset> {
  return uploadAsset({ file, folder, publicIdHint: hint, resourceType: 'image' });
}

/* ── Reports ─────────────────────────────────────────────────────────── */

export interface GeneratedReport {
  fileName: string;
  blob: Blob;
  bytes: number;
  summary: ReportRecord['summary'];
}

export async function storeReport(input: {
  report: GeneratedReport;
  title: string;
  type: ReportRecord['type'];
  scope: ReportRecord['scope'];
  period: { from: string; to: string };
  motherId?: string | null;
  patientId?: string | null;
  pregnancyId?: string | null;
  facilityId?: string | null;
  filters?: Record<string, string | number | boolean | null> | null;
  accessRoles?: Role[];
  accessUserIds?: string[];
  rowCount?: number | null;
  onProgress?: (percent: number, state: 'validating' | 'uploading' | 'finalising') => void;
}): Promise<ReportRecord> {
  const registry = services();
  const actor = registry.require();
  const file = new File([input.report.blob], input.report.fileName, { type: 'application/pdf' });

  let asset: UploadedAsset | null = null;
  try {
    asset = await uploadAsset({
      file,
      folder: 'reports',
      subFolder: input.patientId ?? input.facilityId ?? undefined,
      tags: [input.type.toLowerCase(), `folder-${folderPath('reports').replace('/', '-')}`],
      context: { report: input.type, scope: input.scope, patient: input.patientId ?? 'aggregate' },
      metadata: {
        mamacare_kind: 'report',
        mamacare_report_type: input.type,
        mamacare_period: `${input.period.from}_${input.period.to}`,
      },
      onProgress: input.onProgress,
    });
  } catch (error) {
    const mapped = toAppError(error);
    await registry.data.audit('report.generated', 'report', newId('rpt'), {
      metadata: { status: 'FAILED', type: input.type, reason: mapped.code },
    });
    throw new AppError('Report generation failed. The data is safe — please retry.', mapped.code, { retryable: true });
  }

  const record = (await registry.data.registerReport({
    title: input.title,
    type: input.type,
    scope: input.scope,
    motherId: input.motherId ?? null,
    patientId: input.patientId ?? null,
    pregnancyId: input.pregnancyId ?? null,
    facilityId: input.facilityId ?? null,
    period: input.period,
    filters: input.filters ?? null,
    format: 'PDF',
    status: 'GENERATED',
    fileName: input.report.fileName,
    file: {
      publicId: asset.publicId,

      secureUrl: asset.storage === 'cloudinary' ? (asset.secureUrl ?? '') : '',
      bytes: asset.bytes,
      localHandle: asset.localHandle ?? null,
      version: asset.version ?? null,
    },
    summary: input.report.summary,
    rowCount: input.rowCount ?? null,
    // Reports are never public: the access list is the source of truth, and the
    // file itself is stored with a non-public Cloudinary access mode.
    accessRoles: input.accessRoles ?? [...CLINICAL_ROLES, 'MOTHER' as const],
    accessUserIds: [actor.uid, ...(input.accessUserIds ?? [])],
    expiresAt: null,
  })) as ReportRecord;

  await registry.data.audit('report.generated', 'report', record.id, {
    label: record.title,
    facilityId: record.facilityId,
    metadata: { type: record.type, rows: record.rowCount ?? 0, storage: asset.storage, bytes: record.file?.bytes ?? 0 },
  });
  return record;
}

export async function openReport(record: ReportRecord): Promise<string> {
  if (!record.file) throw new AppError('The stored file for this report is missing.', 'NOT_FOUND');
  const registry = services();
  if (!canAccessReport(record, registry.require().role, registry.require().uid, record.motherId ? registry.require().motherId : null)) {
    throw new AppError('This report is not available to your role.', 'FORBIDDEN');
  }
  const url = await resolveAssetUrl({
    publicId: record.file.publicId,
    secureUrl: record.file.secureUrl || null,
    localHandle: record.file.localHandle,
    accessMode: 'private',
    mimeType: 'application/pdf',
  });
  await registry.data
    .audit('report.downloaded', 'report', record.id, { label: record.title, metadata: { type: record.type } })
    .catch(() => null);
  return url;
}

export function canAccessReport(record: ReportRecord, role: Role, uid: string, motherId: string | null): boolean {
  if (record.generatedBy === uid) return true;
  if (role === 'ADMIN') return true;
  if (record.accessUserIds.includes(uid)) return true;
  if (role === 'MOTHER') return Boolean(motherId && record.motherId === motherId && record.accessRoles.includes('MOTHER'));
  return record.accessRoles.includes(role);
}

export const cloudinaryStatus = (): { enabled: boolean; preset: boolean } => ({
  enabled: cloudinaryConfig.enabled,
  preset: cloudinaryConfig.browserUploadEnabled,
});

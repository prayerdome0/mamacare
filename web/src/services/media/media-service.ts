/**
 * Media service — the one place the app uploads, resolves and deletes files.
 *
 * Routing is decided by sensitivity, not by convenience:
 *
 *  • **Public imagery** (profile photos, facility photos, article covers,
 *    branding) goes to **Cloudinary** through the unsigned preset, flat at the
 *    media-library root. Those assets are meant to be delivered by a CDN.
 *  • **Personal health documents** (scan results, prescriptions, birth records,
 *    immunization cards) go to **Firebase Storage** under `mamacare/documents/…`,
 *    where `storage.rules` decides who may read them. They never receive a public
 *    CDN URL.
 *  • With neither backend reachable the file stays in this browser and the
 *    interface says so, rather than pretending it was uploaded.
 */

import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { validateFile, MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, IMAGE_ACCEPTED_MIME, DOCUMENT_ACCEPTED_MIME } from '@/lib/validation';
import { services } from '@/services/session-store';
import { cloudinaryConfig } from '@/config/env';
import {
  accessModeFor,
  deleteAsset,
  resolveAssetUrl,
  uploadAsset,
  type MediaFolder,
  type UploadedAsset,
} from '@/services/media/cloudinary';
import type { DocumentRecord, Role } from '@/types/domain';

export const IMAGE_FOLDERS = ['profiles', 'facilities', 'education', 'branding', 'public'] as const;
export type ImageFolder = (typeof IMAGE_FOLDERS)[number];

export const DOCUMENT_CATEGORIES: { value: DocumentRecord['category']; label: string }[] = [
  { value: 'scan', label: 'Scan report' },
  { value: 'lab-result', label: 'Laboratory result' },
  { value: 'prescription', label: 'Prescription' },
  { value: 'birth-record', label: 'Birth record' },
  { value: 'immunization-card', label: 'Child health card' },
  { value: 'other', label: 'Other document' },
];

/** Uploads a public image. Returns the asset so the caller stores what it needs. */
export async function uploadImage(file: File, folder: ImageFolder, hint?: string): Promise<UploadedAsset> {
  const problem = validateFile(file, { accept: IMAGE_ACCEPTED_MIME, maxBytes: MAX_IMAGE_BYTES });
  if (problem) throw new AppError(problem, 'UNSUPPORTED_FILE');
  return uploadAsset({ file, folder, publicIdHint: hint, tags: ['mamacare', folder] });
}

export interface UploadContext {
  title: string;
  category: DocumentRecord['category'];
  notes?: string | null;
}

export interface MediaUploadResult {
  record: DocumentRecord;
  asset: UploadedAsset;
}

/**
 * Uploads a personal health document. Always routed to the sensitive folder, so
 * it lands in Firebase Storage — never in the public media library.
 */
export async function uploadDocument(file: File, context: UploadContext): Promise<MediaUploadResult> {
  const problem = validateFile(file, { accept: DOCUMENT_ACCEPTED_MIME, maxBytes: MAX_DOCUMENT_BYTES });
  if (problem) throw new AppError(problem, 'UNSUPPORTED_FILE');
  const me = services().require();

  const asset = await uploadAsset({
    file,
    folder: 'documents',
    subFolder: me.uid,
    publicIdHint: context.title,
    resourceType: file.type.startsWith('image/') ? 'image' : 'raw',
    tags: ['mamacare', 'document', context.category],
    metadata: { owner: me.uid, category: context.category },
  });

  const record = await services().data.create('documents', {
    userId: me.uid,
    title: context.title,
    category: context.category,
    publicId: asset.publicId,
    secureUrl: asset.secureUrl,
    localHandle: asset.localHandle ?? null,
    mimeType: asset.mimeType,
    bytes: asset.bytes,
    accessMode: accessModeFor('documents'),
    uploadedBy: me.uid,
    notes: context.notes ?? null,
  } as Omit<DocumentRecord, 'id' | 'createdAt'>);

  return { record, asset };
}

/** Resolves a document to a viewable address. Rules decide whether it is allowed. */
export async function openDocument(
  record: DocumentRecord,
  options: { purpose?: 'view' | 'download' } = {},
): Promise<string> {
  try {
    const url = await resolveAssetUrl({
      publicId: record.publicId,
      secureUrl: record.secureUrl,
      localHandle: record.localHandle,
      accessMode: record.accessMode,
      mimeType: record.mimeType,
    });
    if (options.purpose === 'download') return url;
    return url;
  } catch (error) {
    throw toAppError(error, 'This file could not be opened. It may have been removed.');
  }
}

export async function deleteDocument(record: DocumentRecord): Promise<void> {
  await services().data.remove('documents', record.id);
  await deleteAsset({ publicId: record.publicId, localHandle: record.localHandle, accessMode: record.accessMode }).catch(() => undefined);
}

export async function listDocuments(userId?: string): Promise<DocumentRecord[]> {
  const me = services().actorRef();
  const owner = userId ?? me?.uid;
  if (!owner) return [];
  return services().data.rows('documents', {
    where: [{ field: 'userId', op: '==', value: owner }],
    orderBy: { field: 'createdAt', direction: 'desc' },
  });
}

/** Can this person open this document? Mirrors the policy module for the UI. */
export function canAccessDocument(record: DocumentRecord, role: Role, uid: string): boolean {
  if (role === 'ADMIN') return true;
  return record.userId === uid;
}

/** Human-readable summary of where media goes, shown on the media screens. */
export const cloudinaryStatus = (): { label: string; detail: string; tone: 'green' | 'amber' | 'red' } => {
  if (cloudinaryConfig.browserUploadEnabled) {
    return {
      label: `Cloudinary — ${cloudinaryConfig.cloudName}`,
      detail: 'Public imagery uploads through the unsigned preset and is delivered from the media-library root.',
      tone: 'green',
    };
  }
  if (cloudinaryConfig.enabled) {
    return {
      label: `Cloudinary — ${cloudinaryConfig.cloudName}`,
      detail: 'Delivery is configured, but no unsigned upload preset is set, so uploads are not available.',
      tone: 'amber',
    };
  }
  return {
    label: 'Cloudinary not configured',
    detail: 'Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET to enable image uploads.',
    tone: 'red',
  };
};

export const newMediaId = () => newId('media');

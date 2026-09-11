/**
 * Cloudinary media service.
 *
 * • Public imagery (landing pages, education, facility photos, branding) is
 *   uploaded straight from the browser with an **unsigned preset** that Cloudinary
 *   itself constrains to the `mamacare/public*`, `mamacare/education*` and
 *   `mamacare/branding*` folders. No secret can be present in the client, so the
 *   client carries none.
 * • Anything sensitive (patient documents, reports, profile photos) is signed
 *   server-side: the API returns a signature for one specific public id, folder
 *   and expiry, and Cloudinary enforces `access_mode` (authenticated/private).
 *   Sensitive assets are therefore never publicly readable.
 * • With no Cloudinary project configured, files persist in the active data
 *   provider's blob store (device storage) and are served through short-lived
 *   object URLs, so uploads genuinely work offline instead of pretending.
 */

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, validateFile } from '@/lib/validation';
import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { cloudinaryConfig } from '@/config/env';
import { getBlobStore } from '@/services/media/blob-store';
import { fileChecksum } from '@/lib/ids';

export const MEDIA_ROOT = 'mamacare';

export const MEDIA_FOLDERS = [
  'public',
  'mothers',
  'reports',
  'profiles',
  'documents',
  'facilities',
  'education',
  'branding',
] as const;
export type MediaFolder = (typeof MEDIA_FOLDERS)[number];

export const FOLDER_LABELS: Record<MediaFolder, string> = {
  public: 'Public site imagery',
  mothers: 'Mother records',
  reports: 'Generated reports',
  profiles: 'Profile photos',
  documents: 'Uploaded documents',
  facilities: 'Facility media',
  education: 'Health education',
  branding: 'Branding assets',
};

/**
 * Folders the unsigned preset is allowed to write to. Every other folder requires
 * a server signature. Cloudinary's preset must be configured to match; the
 * server independently refuses to sign anything outside the allow-list below.
 */
export const UNSIGNED_ALLOWED_FOLDERS: MediaFolder[] = ['public', 'education', 'branding', 'facilities'];

export const folderPath = (folder: MediaFolder, sub?: string): string =>
  [MEDIA_ROOT, folder, sub].filter(Boolean).join('/');

export type AccessMode = 'public' | 'authenticated' | 'private';

export const accessModeFor = (folder: MediaFolder): AccessMode => {
  if (UNSIGNED_ALLOWED_FOLDERS.includes(folder)) return 'public';
  if (folder === 'profiles') return 'authenticated';
  return 'private';
};

export interface UploadInput {
  file: File | Blob;
  folder: MediaFolder;
  /** Groups assets inside a folder, e.g. the patient id for documents. */
  subFolder?: string;
  resourceType?: 'image' | 'raw';
  publicIdHint?: string;
  tags?: string[];
  context?: Record<string, string>;
  metadata?: Record<string, string | number | boolean | null>;
  onProgress?: (percent: number, state: 'validating' | 'uploading' | 'finalising') => void;
  signal?: AbortSignal;
  /** Overrides the default size/type policy for this upload. */
  maxBytes?: number;
  accept?: string[];
}

export interface UploadedAsset {
  publicId: string;
  secureUrl: string | null;
  bytes: number;
  format: string;
  mimeType: string;
  version?: string | null;
  width?: number | null;
  height?: number | null;
  folder: string;
  storage: 'cloudinary' | 'device';
  localHandle?: string | null;
  checksum?: string | null;
  accessMode: AccessMode;
  tags: string[];
  metadata?: Record<string, string | number | boolean | null>;
  uploadedAt: string;
}

const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp|heic|avif|gif)$/i;

const resourceTypeFor = (mime: string): 'image' | 'raw' => (IMAGE_MIME.test(mime) ? 'image' : 'raw');

const extensionOf = (name: string): string => {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
};

const sanitizeSegment = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 48) || 'asset';

export const buildPublicId = (folder: MediaFolder, sub: string | undefined, hint: string | undefined, file: File | Blob): string => {
  const base = hint ? sanitizeSegment(hint) : sanitizeSegment((file as File).name ?? 'file').replace(/\.[^.]+$/, '');
  const segments = [MEDIA_ROOT, folder];
  if (sub) segments.push(sanitizeSegment(sub));
  segments.push(`${base}-${newId().slice(0, 8)}`);
  return segments.join('/');
};

export interface UploadPolicy {
  maxBytes?: number;
  accept?: string[];
}

export function checkPolicy(file: File | Blob, folder: MediaFolder, override: UploadPolicy = {}): string | null {
  const image = IMAGE_MIME.test(file.type);
  const maxBytes = override.maxBytes ?? (image ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES);
  const message = validateFile(
    { name: (file as File).name ?? `${folder}-file`, type: file.type, size: file.size },
    { maxBytes, accept: override.accept },
  );
  return message;
}

/** XHR is used (not fetch) so upload progress is observable. */
function postForm(
  endpoint: string,
  form: FormData,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ responseText: string; status: number }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', endpoint, true);
    xhr.responseType = 'text';
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100);
        resolve({ responseText: xhr.responseText, status: xhr.status });
        return;
      }
      let reason = `Upload rejected by the media service (HTTP ${xhr.status}).`;
      try {
        const parsed = JSON.parse(xhr.responseText) as { error?: { message?: string } };
        if (parsed?.error?.message) reason = parsed.error.message;
      } catch {
        /* keep the generic reason */
      }
      reject(new AppError(reason.includes('signature') ? 'The upload signature expired. Please try again.' : reason, 'UPLOAD_FAILED'));
    };
    xhr.onerror = () => reject(new AppError('Unable to upload the file. Check your connection and try again.', 'NETWORK', { retryable: true }));
    xhr.ontimeout = () => reject(new AppError('The upload timed out. Please try again.', 'TIMEOUT', { retryable: true }));
    xhr.onabort = () => reject(new AppError('Upload cancelled.', 'VALIDATION'));
    if (signal) {
      if (signal.aborted) {
        xhr.abort();
        return;
      }
      signal.addEventListener('abort', () => xhr.abort(), { once: true });
    }
    xhr.timeout = 120_000;
    xhr.send(form);
  });
}

const cloudEndpoint = (resourceType: 'image' | 'raw'): string =>
  `${cloudinaryConfig.secureBase.replace('https://res.cloudinary.com', 'https://api.cloudinary.com')}/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`;

export const deliveryBase = (resourceType: 'image' | 'raw'): string =>
  `${cloudinaryConfig.secureBase}/${cloudinaryConfig.cloudName}/${resourceType}/upload`;

/* ── Signed URL cache for private assets ─────────────────────────────── */

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getPrivateAssetUrl(publicId: string, resourceType: 'image' | 'raw'): Promise<string> {
  const cached = signedUrlCache.get(publicId);
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.url;
  const { requestSignedUrl } = await import('@/services/api/client');
  try {
    const result = await requestSignedUrl({ publicId, resourceType, expiresIn: 300 });
    signedUrlCache.set(publicId, { url: result.url, expiresAt: Date.now() + 240_000 });
    return result.url;
  } catch (error) {
    const mapped = toAppError(error, 'This document is stored privately and needs the file service to be configured.');
    throw new AppError(mapped.message, 'STORAGE_UNAVAILABLE', { retryable: mapped.retryable });
  }
}

/* ── Public API ──────────────────────────────────────────────────────── */

export async function uploadAsset(input: UploadInput): Promise<UploadedAsset> {
  const file = input.file;
  const isImage = IMAGE_MIME.test(file.type);
  const resourceType = input.resourceType ?? (isImage ? 'image' : 'raw');

  input.onProgress?.(0, 'validating');
  const policyError = checkPolicy(file, input.folder, { maxBytes: input.maxBytes, accept: input.accept });
  if (policyError) throw new AppError(policyError, 'VALIDATION');

  const folder = folderPath(input.folder, input.subFolder);
  const accessMode = accessModeFor(input.folder);
  const publicId = buildPublicId(input.folder, input.subFolder, input.publicIdHint, file);
  const checksum = await fileChecksum(file).catch(() => null);
  const common = {
    secureUrl: null as string | null,
    bytes: file.size,
    format: extensionOf((file as File).name ?? '') || (isImage ? 'jpg' : 'bin'),
    mimeType: file.type || 'application/octet-stream',
    folder,
    accessMode,
    tags: ['mamacare', input.folder, ...(input.tags ?? [])].filter(Boolean),
    metadata: input.metadata,
    uploadedAt: new Date().toISOString(),
    checksum,
  };

  const useCloudinary = cloudinaryConfig.enabled;

  if (useCloudinary && accessMode === 'public' && cloudinaryConfig.unsignedPreset) {
    const form = new FormData();
    form.append('file', file, (file as File).name ?? 'file');
    form.append('folder', folder);
    form.append('upload_preset', cloudinaryConfig.unsignedPreset);
    form.append('public_id', publicId);
    form.append('resource_type', resourceType);
    if (common.tags.length) form.append('tags', common.tags.join(','));
    if (input.context) {
      form.append('context', Object.entries(input.context).map(([k, v]) => `${k}=${v}`).join('|'));
    }
    if (input.metadata) {
      for (const [key, value] of Object.entries(input.metadata)) {
        if (value !== null && value !== undefined) form.append(`metadata[${key}]`, String(value));
      }
    }
    input.onProgress?.(5, 'uploading');
    const response = await postForm(cloudEndpoint(resourceType), form, (pct) => input.onProgress?.(pct, 'uploading'), input.signal);
    const parsed = JSON.parse(response.responseText) as {
      public_id: string;
      secure_url: string;
      version: number;
      format?: string;
      width?: number;
      height?: number;
      bytes?: number;
    };
    return {
      ...common,
      publicId: parsed.public_id,
      secureUrl: parsed.secure_url,
      version: String(parsed.version ?? ''),
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      bytes: parsed.bytes ?? file.size,
      format: parsed.format ?? common.format,
      storage: 'cloudinary',
    };
  }

  if (useCloudinary) {
    // Privileged folder: one-shot signature from the API, then a direct
    // browser→Cloudinary POST. The API secret never reaches this process.
    const { requestSignedUpload } = await import('@/services/api/client');
    let signed;
    try {
      signed = await requestSignedUpload({
        folder,
        publicId,
        resourceType,
        accessMode,
        fileSizeBytes: file.size,
        mimeType: common.mimeType,
        metadata: Object.fromEntries(
          Object.entries(input.metadata ?? {}).map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]),
        ),
      });
    } catch (error) {
      const mapped = toAppError(error);
      if (mapped.code === 'NETWORK' || mapped.code === 'CONFIGURATION' || mapped.code === 'TIMEOUT') {
        return storeOnDevice(file, { ...common, publicId, resourceType }, input);
      }
      throw mapped;
    }

    const form = new FormData();
    form.append('file', file, (file as File).name ?? 'file');
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    form.append('folder', signed.folder);
    form.append('public_id', signed.publicId);
    form.append('access_mode', accessMode);
    if (common.tags.length) form.append('tags', common.tags.join(','));
    input.onProgress?.(5, 'uploading');
    const response = await postForm(signed.endpoint || cloudEndpoint(resourceType), form, (pct) => input.onProgress?.(pct, 'uploading'), input.signal);
    input.onProgress?.(100, 'finalising');
    const parsed = JSON.parse(response.responseText) as {
      public_id: string;
      secure_url: string;
      version: number;
      width?: number;
      height?: number;
      bytes?: number;
    };
    return {
      ...common,
      publicId: parsed.public_id,
      secureUrl: parsed.secure_url,
      version: String(parsed.version ?? ''),
      width: parsed.width ?? null,
      height: parsed.height ?? null,
      bytes: parsed.bytes ?? file.size,
      storage: 'cloudinary',
    };
  }

  return storeOnDevice(file, { ...common, publicId, resourceType }, input);
}

async function storeOnDevice(
  file: File | Blob,
  base: Omit<UploadedAsset, 'storage' | 'localHandle'> & { resourceType: 'image' | 'raw' },
  input: UploadInput,
): Promise<UploadedAsset> {
  const handle = `media/${base.publicId}`;
  input.onProgress?.(40, 'uploading');
  const store = getBlobStore();
  await store.put(handle, file);
  input.onProgress?.(100, 'finalising');
  return {
    ...base,
    secureUrl: base.accessMode === 'public' && IMAGE_MIME.test(base.mimeType) ? await objectUrlFor(handle) : null,
    storage: 'device',
    localHandle: handle,
    publicId: `device:${base.publicId}`,
  };
}

export async function objectUrlFor(handle: string): Promise<string | null> {
  const blob = await getBlobStore().get(handle);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** Resolves a stored asset to a displayable URL (Cloudinary, or the device blob). */
export async function resolveAssetUrl(asset: {
  publicId?: string | null;
  secureUrl?: string | null;
  localHandle?: string | null;
  accessMode?: AccessMode;
  mimeType?: string;
}): Promise<string> {
  if (asset.secureUrl) return asset.secureUrl;
  if (asset.localHandle) {
    const url = await objectUrlFor(asset.localHandle);
    if (url) return url;
    throw new AppError('This file is stored on the device that uploaded it and is not available here.', 'NOT_FOUND');
  }
  if (!asset.publicId) {
    throw new AppError('This file has no stored location: it was either removed or was never uploaded.', 'NOT_FOUND');
  }
  if (asset.publicId.startsWith('device:')) {
    const handle = asset.publicId.slice('device:'.length);
    const url = await objectUrlFor(handle);
    if (url) return url;
    throw new AppError('This file is stored on the device that uploaded it and is not available here.', 'NOT_FOUND');
  }
  const resourceType = IMAGE_MIME.test(asset.mimeType ?? '') ? 'image' : 'raw';
  return getPrivateAssetUrl(asset.publicId, resourceType);
}

export interface TransformOptions {
  /** CSS max-width buckets used to build a responsive srcset. */
  widths?: number[];
  quality?: 'auto' | 'none' | number;
  format?: 'auto' | 'webp' | 'avif' | 'none';
  crop?: 'limit' | 'fill' | 'cover' | 'scale' | 'pad';
  width?: number;
  height?: number;
  dpr?: boolean;
  blur?: number;
  grayscale?: boolean;
}

/** Builds a Cloudinary delivery URL with responsive transformations. */
export function buildImageUrl(publicId: string, options: TransformOptions = {}): string {
  const transformations = [
    options.format === 'none' ? '' : `f_${options.format ?? 'auto'}`,
    options.quality === 'none' ? '' : `q_${options.quality ?? 'auto'}`,
    options.crop ? `c_${options.crop}` : 'c_limit',
    options.width ? `w_${options.width}` : '',
    options.height ? `h_${options.height}` : '',
    options.dpr ? 'dpr_auto' : '',
    options.blur ? `e_blur:${options.blur}` : '',
    options.grayscale ? 'e_grayscale' : '',
  ]
    .filter(Boolean)
    .join(',');
  const id = publicId.replace(/^device:/, '');
  return `${deliveryBase('image')}/${transformations}/${id}`;
}

export function buildSrcSet(publicId: string, widths: number[], options: TransformOptions = {}): string {
  return widths
    .map((w) => `${buildImageUrl(publicId, { ...options, width: w })} ${w}w`)
    .join(', ');
}

export async function deleteAsset(asset: { publicId: string; localHandle?: string | null; accessMode?: AccessMode }): Promise<void> {
  if (asset.localHandle || asset.publicId.startsWith('device:')) {
    await getBlobStore().delete(asset.localHandle ?? asset.publicId.replace('device:', 'media/'));
    return;
  }
  const { requestAssetDeletion } = await import('@/services/api/client');
  try {
    await requestAssetDeletion({
      publicId: asset.publicId,
      resourceType: IMAGE_MIME.test(asset.publicId) ? 'image' : 'raw',
    });
  } catch (error) {
    const mapped = toAppError(error, 'The file could not be deleted. Please try again.');
    throw new AppError(mapped.message, mapped.code, { retryable: mapped.retryable });
  }
}

/**
 * Configuration guidance shown wherever media is required but unavailable, so the
 * operator sees exactly which variable to set instead of a broken upload.
 */
export const mediaSetupInstructions = (): string[] => [
  'VITE_CLOUDINARY_CLOUD_NAME — your Cloudinary account name',
  'VITE_CLOUDINARY_UPLOAD_PRESET — an unsigned preset limited to mamacare/public, mamacare/education and mamacare/branding',
  'Server side: CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in the API service environment (never in the client) for signed uploads, private folders and signed URLs',
  'Folders are created automatically on first upload — nothing needs to be created by hand',
];

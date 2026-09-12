/**
 * Cloudinary media service — **flat root, no folders**.
 *
 * Deployment policy for this installation:
 *  • Uploads use the *unsigned* preset `Mamacare` on cloud `mk2tulbt`.
 *  • **No `folder`, no `asset_folder`, no public-id path is ever sent.** Every
 *    asset lands directly in the media-library root and Cloudinary assigns the
 *    identifier, so the library stays a flat list of images.
 *  • The API secret is never used in the browser. There is no signed upload and
 *    no signed delivery URL: sensitive files (clinical documents, generated
 *    reports, patient portraits) go to **Firebase Storage**, where the
 *    deployment's own `storage.rules` decide who may read them.
 *  • A record that already holds a Cloudinary URL keeps using it; nothing here
 *    rewrites or re-parents an existing asset.
 *
 * `MediaFolder` below is a *routing decision* (which backend stores the asset
 * and which rules govern it), never a Cloudinary path.
 */

import { MAX_DOCUMENT_BYTES, MAX_IMAGE_BYTES, validateFile } from '@/lib/validation';
import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { cloudinaryConfig } from '@/config/env';
import { getBlobStore } from '@/services/media/blob-store';
import { fileChecksum } from '@/lib/ids';

/**
 * Logical routing labels — NOT Cloudinary folders.
 *
 * These decide which backend stores an asset and which rules govern it. No
 * entry in this list is ever sent to Cloudinary as a path.
 */
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
 * Public imagery — the only assets that ever reach Cloudinary, and only ever
 * through the unsigned preset, flat at the media-library root.
 */
export const CLOUDINARY_FOLDERS: MediaFolder[] = ['public', 'profiles', 'facilities', 'education', 'branding'];

/**
 * Sensitive assets — clinical documents, generated reports and patient
 * portraits. These go to Firebase Storage, never to Cloudinary, so a patient
 * file is never reachable through a public CDN URL.
 */
export const FIREBASE_FOLDERS: MediaFolder[] = ['mothers', 'documents', 'reports'];

/**
 * Object path inside Firebase Storage. Foldering *is* used there — it is what
 * `storage.rules` matches on to protect patient data — and is unrelated to
 * Cloudinary, which stays flat.
 */
export const storagePathFor = (folder: MediaFolder, sub?: string): string =>
  ['mamacare', folder, sub].filter(Boolean).join('/');

export type AccessMode = 'public' | 'authenticated' | 'private';

export const accessModeFor = (folder: MediaFolder): AccessMode =>
  CLOUDINARY_FOLDERS.includes(folder) ? 'public' : 'private';

/** Which backend will store an asset for a given routing label. */
export type MediaBackend = 'cloudinary' | 'firebase' | 'device';

export interface UploadInput {
  file: File | Blob;
  folder: MediaFolder;
  /**
   * Groups assets inside a Firebase Storage folder (for example the patient id).
   * Never used for Cloudinary: the media library root stays flat.
   */
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
  storage: MediaBackend;
  /** Firebase Storage object path, when `storage === 'firebase'`. */
  storagePath?: string | null;
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

/**
 * A flat, folder-free file name.
 *
 * Used only as an object name inside Firebase Storage (or a device handle). It
 * is deliberately **never** sent to Cloudinary as `public_id`, because the
 * deployment requires Cloudinary to own the identifier at the library root.
 */
export const buildObjectName = (hint: string | undefined, file: File | Blob): string => {
  const base = hint
    ? sanitizeSegment(hint)
    : sanitizeSegment((file as File).name ?? 'file').replace(/\.[^.]+$/, '');
  return `${base}-${newId().slice(0, 8)}`;
};

export interface UploadPolicy {
  maxBytes?: number;
  accept?: string[];
}

export function checkPolicy(file: File | Blob, folder: MediaFolder, override: UploadPolicy = {}): string | null {
  const image = IMAGE_MIME.test(file.type);
  const maxBytes = override.maxBytes ?? (image ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES);
  return validateFile(
    { name: (file as File).name ?? `${folder}-file`, type: file.type, size: file.size },
    { maxBytes, accept: override.accept },
  );
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
      reject(new AppError(reason, 'UPLOAD_FAILED', { retryable: xhr.status >= 500 }));
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

/** Upload endpoint. The API-base swap keeps a private-CDN cloud working. */
const cloudEndpoint = (resourceType: 'image' | 'raw'): string =>
  `${cloudinaryConfig.secureBase.replace('https://res.cloudinary.com', 'https://api.cloudinary.com')}/v1_1/${cloudinaryConfig.cloudName}/${resourceType}/upload`;

export const deliveryBase = (resourceType: 'image' | 'raw'): string =>
  `${cloudinaryConfig.secureBase}/${cloudinaryConfig.cloudName}/${resourceType}/upload`;

/* ── Public API ──────────────────────────────────────────────────────── */

/**
 * Uploads an asset.
 *
 * Routing:
 *  1. Public imagery + Cloudinary configured → unsigned preset, flat root.
 *  2. Sensitive folders, or no Cloudinary account → Firebase Storage.
 *  3. Nothing configured at all → this device only, plainly labelled.
 */
export async function uploadAsset(input: UploadInput): Promise<UploadedAsset> {
  const file = input.file;
  const isImage = IMAGE_MIME.test(file.type);
  const resourceType = input.resourceType ?? (isImage ? 'image' : 'raw');

  input.onProgress?.(0, 'validating');
  const policyError = checkPolicy(file, input.folder, { maxBytes: input.maxBytes, accept: input.accept });
  if (policyError) throw new AppError(policyError, 'VALIDATION');

  const routing = input.folder;
  const accessMode = accessModeFor(input.folder);
  const checksum = await fileChecksum(file).catch(() => null);
  const common = {
    bytes: file.size,
    format: extensionOf((file as File).name ?? '') || (isImage ? 'jpg' : 'bin'),
    mimeType: file.type || 'application/octet-stream',
    folder: routing,
    accessMode,
    tags: ['mamacare', input.folder, ...(input.tags ?? [])].filter(Boolean),
    metadata: input.metadata,
    uploadedAt: new Date().toISOString(),
    checksum,
  };

  const cloudinaryUsable = cloudinaryConfig.enabled && cloudinaryConfig.unsignedPreset && CLOUDINARY_FOLDERS.includes(input.folder);

  if (cloudinaryUsable) {
    return uploadToCloudinary(file, { ...common, resourceType, tags: common.tags }, input);
  }

  // Sensitive folders, or no Cloudinary account: Firebase Storage owns the file.
  try {
    const { uploadToFirebaseStorage, isFirebaseStorageAvailable, firebasePublicId } = await import('@/services/media/firebase-storage');
    if (isFirebaseStorageAvailable()) {
      const objectName = buildObjectName(input.publicIdHint, file);
      const path = storagePathFor(input.folder, [input.subFolder, objectName].filter(Boolean).join('/'));
      const result = await uploadToFirebaseStorage(file, {
        folder: input.folder,
        publicId: path,
        onProgress: input.onProgress,
        signal: input.signal,
      });
      return {
        ...common,
        publicId: firebasePublicId(result.path),
        secureUrl: result.downloadUrl,
        version: null,
        width: null,
        height: null,
        storage: 'firebase',
        storagePath: result.path,
        localHandle: null,
        bytes: result.bytes,
      };
    }
  } catch (error) {
    // The backend exists and refused the write (permission, quota, network).
    // Surface it — never silently downgrade to this device.
    throw toAppError(error, 'The file could not be uploaded. Check your connection and try again.');
  }

  // No backend at all: keep the workflow usable offline, and say so plainly.
  const objectName = buildObjectName(input.publicIdHint, file);
  const handle = `media/${storagePathFor(input.folder, [input.subFolder, objectName].filter(Boolean).join('/'))}`;
  input.onProgress?.(40, 'uploading');
  await getBlobStore().put(handle, file);
  input.onProgress?.(100, 'finalising');
  return {
    ...common,
    publicId: `device:${handle.replace(/^media\//, '')}`,
    secureUrl: accessMode === 'public' && isImage ? await objectUrlFor(handle) : null,
    version: null,
    width: null,
    height: null,
    storage: 'device',
    storagePath: null,
    localHandle: handle,
  };
}

/**
 * Unsigned upload, flat at the media-library root.
 *
 * Only `file`, `upload_preset` and `resource_type` are sent. No `folder`, no
 * `asset_folder`, no `public_id`: Cloudinary assigns the identifier and the
 * asset sits at the root of the media library.
 */
async function uploadToCloudinary(
  file: File | Blob,
  base: {
    bytes: number;
    format: string;
    mimeType: string;
    folder: string;
    accessMode: AccessMode;
    tags: string[];
    metadata?: Record<string, string | number | boolean | null>;
    uploadedAt: string;
    checksum: string | null;
    resourceType: 'image' | 'raw';
  },
  input: UploadInput,
): Promise<UploadedAsset> {
  const form = new FormData();
  form.append('file', file, (file as File).name ?? 'file');
  form.append('upload_preset', cloudinaryConfig.unsignedPreset);
  form.append('resource_type', base.resourceType);
  if (base.tags.length) form.append('tags', base.tags.join(','));
  if (input.context) {
    form.append('context', Object.entries(input.context).map(([k, v]) => `${k}=${v}`).join('|'));
  }

  input.onProgress?.(5, 'uploading');
  const response = await postForm(
    cloudEndpoint(base.resourceType),
    form,
    (pct) => input.onProgress?.(pct, 'uploading'),
    input.signal,
  );
  input.onProgress?.(100, 'finalising');

  const parsed = JSON.parse(response.responseText) as {
    public_id: string;
    secure_url: string;
    version?: number;
    format?: string;
    width?: number;
    height?: number;
    bytes?: number;
  };

  return {
    ...base,
    publicId: parsed.public_id,
    secureUrl: parsed.secure_url,
    version: parsed.version === undefined ? null : String(parsed.version),
    width: parsed.width ?? null,
    height: parsed.height ?? null,
    bytes: parsed.bytes ?? base.bytes,
    format: parsed.format ?? base.format,
    storage: 'cloudinary',
    storagePath: null,
    localHandle: null,
  };
}

export async function objectUrlFor(handle: string): Promise<string | null> {
  const blob = await getBlobStore().get(handle);
  if (!blob) return null;
  return URL.createObjectURL(blob);
}

/** True when a value is a plain, already-resolvable address. */
export const isDirectUrl = (value: string): boolean =>
  value.startsWith('http://') || value.startsWith('https://') || value.startsWith('data:') || value.startsWith('blob:') || value.startsWith('/');

/**
 * Resolves a stored asset to a displayable URL.
 *
 *  • an existing Cloudinary/Firebase URL is used as-is;
 *  • `firebase:…` resolves through Firebase Storage (rules decide);
 *  • `device:…` resolves from this browser's blob store;
 *  • a bare Cloudinary public id is delivered from the flat root.
 */
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
  if (asset.publicId.startsWith('firebase:')) {
    const { firebaseStorageUrl } = await import('@/services/media/firebase-storage');
    return firebaseStorageUrl(asset.publicId.slice('firebase:'.length));
  }
  if (asset.publicId.startsWith('device:')) {
    const url = await objectUrlFor(`media/${asset.publicId.slice('device:'.length)}`);
    if (url) return url;
    throw new AppError('This file is stored on the device that uploaded it and is not available here.', 'NOT_FOUND');
  }
  if (isDirectUrl(asset.publicId)) return asset.publicId;
  if (!cloudinaryConfig.enabled) {
    throw new AppError('This image is stored in Cloudinary, which is not configured for this deployment.', 'CONFIGURATION');
  }
  const resourceType = IMAGE_MIME.test(asset.mimeType ?? '') ? 'image' : 'raw';
  return `${deliveryBase(resourceType)}/${asset.publicId.replace(/^\/+/, '')}`;
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

/**
 * Builds a Cloudinary delivery URL.
 *
 * The public id is used exactly as stored — no folder prefix is ever added — so
 * an asset uploaded flat at the root is delivered from the root.
 */
export function buildImageUrl(publicId: string, options: TransformOptions = {}): string {
  const id = publicId.replace(/^device:/, '').replace(/^\/+/, '');
  if (publicId.startsWith('firebase:')) return id;
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
  return `${deliveryBase('image')}/${transformations}/${id}`;
}

export function buildSrcSet(publicId: string, widths: number[], options: TransformOptions = {}): string {
  return widths
    .map((w) => `${buildImageUrl(publicId, { ...options, width: w })} ${w}w`)
    .join(', ');
}

export async function deleteAsset(asset: { publicId: string; localHandle?: string | null; accessMode?: AccessMode }): Promise<void> {
  if (asset.publicId.startsWith('firebase:')) {
    const { deleteFromFirebaseStorage } = await import('@/services/media/firebase-storage');
    await deleteFromFirebaseStorage(asset.publicId.slice('firebase:'.length));
    return;
  }
  if (asset.localHandle || asset.publicId.startsWith('device:')) {
    await getBlobStore().delete(asset.localHandle ?? `media/${asset.publicId.replace('device:', '')}`);
    return;
  }
  /**
   * Cloudinary assets cannot be deleted from the browser without the API secret,
   * which by design never reaches this process. The record is removed from
   * MAMA CARE immediately; the administrator removes the orphan from the
   * Cloudinary media library, or enables server-side deletion by setting
   * CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET on the API service.
   */
  const { requestAssetDeletion } = await import('@/services/api/client');
  await requestAssetDeletion({ publicId: asset.publicId, resourceType: 'image' }).catch(() => null);
}

/**
 * Configuration guidance shown wherever media is unavailable, so the operator
 * sees exactly which variable to set instead of a broken uploader.
 */
export const mediaSetupInstructions = (): string =>
  [
    'Cloudinary (public imagery) — set VITE_CLOUDINARY_CLOUD_NAME=mk2tulbt and VITE_CLOUDINARY_UPLOAD_PRESET=Mamacare in web/.env.local.',
    'Uploads use the unsigned preset and land flat at the media-library root: no folder, no asset_folder, no public-id path is sent.',
    'Firebase Storage (clinical documents, reports, patient portraits) — set the VITE_FIREBASE_* values and deploy storage.rules.',
    'The Cloudinary API secret is never used in the browser. Set CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET on the API service only if server-side deletion is needed.',
    'With neither configured, files stay on this device and the interface says so.',
  ].join('\n');

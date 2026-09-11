import { createHash, randomBytes } from 'node:crypto';
import { env } from './env.js';
import { conflict, forbidden, notConfigured, tooLarge, unsupported, upstream } from './http.js';

/**
 * Cloudinary signing.
 *
 * This is the only place the API secret is used. Two things are delegated here
 * that a browser must never do:
 *
 *  1. signing an upload into a private folder (`documents`, `reports`,
 *     `profiles`) — the client sends only the intended folder, public id and size,
 *     and this service decides what is allowed;
 *  2. signing a delivery URL for a private asset, which is what keeps a patient
 *     document from being readable by whoever has the link.
 *
 * The unsigned preset path (public marketing/education imagery) is handled by the
 * client directly; nothing about it needs this service.
 */

export interface SignUploadInput {
  folder: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  accessMode?: 'public' | 'authenticated' | 'private';
  fileSizeBytes?: number;
  mimeType?: string;
  metadata?: Record<string, string>;
}

export interface SignedUploadParams {
  publicId: string;
  signature: string;
  apiKey: string;
  cloudName: string;
  timestamp: number;
  folder: string;
  resourceType: 'image' | 'raw';
  endpoint: string;
  options: Record<string, string | number>;
}

/** `public` folders are uploaded with the unsigned preset, so signing them is refused. */
const SIGNED_ONLY_FOLDERS = ['documents', 'reports', 'profiles'];
const UNSIGNED_FOLDERS = ['public', 'education', 'branding', 'facilities'];

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/avif'];
const DOCUMENT_TYPES = [...IMAGE_TYPES, 'application/pdf', 'text/plain'];

const assertConfigured = (): void => {
  if (!env.cloudinary.configured) {
    throw notConfigured('Signed media uploads', ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']);
  }
};

const normaliseFolder = (folder: string): string => {
  const trimmed = folder.replace(/^\/+|\/+$/g, '');
  const [root, sub] = trimmed.split('/');
  if (root && root !== env.cloudinary.rootFolder) {
    throw forbidden(`Uploads may only be signed inside the ${env.cloudinary.rootFolder}/ folder tree.`);
  }
  if (!sub) throw forbidden('Choose a media category (for example documents, reports or profiles) before uploading.');
  if (!env.signedUploadFolders.includes(sub)) {
    throw forbidden(`The folder “${sub}” is not accepted by this deployment.`);
  }
  if (!SIGNED_ONLY_FOLDERS.includes(sub) && !UNSIGNED_FOLDERS.includes(sub)) {
    throw forbidden(`The folder “${sub}” has no signing policy.`);
  }
  return `${env.cloudinary.rootFolder}/${sub}`;
};

/** Reuses the caller's id shape so a media object can be traced to its record. */
const assertPublicId = (publicId: string, folder: string): string => {
  const cleaned = publicId.replace(/^\/+/, '').replace(/\.[a-z0-9]+$/i, '');
  if (cleaned.length < 8) throw conflict('The file name is too short to sign. Retry the upload.');
  if (!cleaned.startsWith(`${folder}/`)) throw forbidden('The file name does not match the selected folder.');
  if (/\.\./.test(cleaned)) throw forbidden('The file name contains an invalid path.');
  return cleaned;
};

const assertSize = (bytes: number | undefined, resourceType: 'image' | 'raw'): void => {
  if (bytes === undefined) return;
  if (!Number.isFinite(bytes) || bytes <= 0) throw unsupported('The file size could not be read. Select the file again.');
  if (bytes > env.maxUploadBytes) throw tooLarge(`Files are limited to ${Math.round(env.maxUploadBytes / (1024 * 1024))} MB on this deployment.`);
  if (resourceType === 'raw' && bytes > env.maxUploadBytes / 2) throw tooLarge('Non-image files are limited to half the general upload size.');
};

const assertMime = (mimeType: string | undefined, resourceType: 'image' | 'raw'): void => {
  if (!mimeType) return;
  const allowed = resourceType === 'image' ? IMAGE_TYPES : DOCUMENT_TYPES;
  if (!allowed.includes(mimeType.toLowerCase())) {
    throw unsupported(`That file type (${mimeType}) is not accepted. Allowed: ${allowed.join(', ')}.`);
  }
};

/** Cloudinary's documented algorithm: sorted `k=v` pairs, secret appended, SHA-1. */
const signParams = (params: Record<string, string | number>): string => {
  const encoded = Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== '' && key !== 'api_key' && key !== 'resource_type' && key !== 'folder')
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  // `folder` participates in the signature as `folder=...` even though it is
  // excluded from the eager-transformation list above.
  const withFolder = params.folder === undefined ? encoded : `${encoded}${encoded ? '&' : ''}folder=${params.folder}`;
  return createHash('sha1').update(`${withFolder}${env.cloudinary.apiSecret}`).digest('hex');
};

export function signUpload(input: SignUploadInput): SignedUploadParams {
  assertConfigured();
  const folder = normaliseFolder(input.folder);
  const resourceType = input.resourceType;
  assertSize(input.fileSizeBytes, resourceType);
  assertMime(input.mimeType, resourceType);
  const publicId = assertPublicId(input.publicId, folder);
  const wantsSignedDelivery = SIGNED_ONLY_FOLDERS.includes(folder.split('/')[1] ?? '');

  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = {
    timestamp,
    folder,
    public_id: publicId,
    resource_type: resourceType,
    type: wantsSignedDelivery ? 'authenticated' : 'private',
    overwrite: 'false',
    unique_filename: 'false',
    access_mode: input.accessMode ?? (wantsSignedDelivery ? 'authenticated' : 'public'),
    eager_async: 'true',
    notification_url: '',
  };
  if (input.metadata && Object.keys(input.metadata).length > 0) {
    params.metadata = Object.entries(input.metadata)
      .map(([key, value]) => `${key}=${value}`)
      .join('|');
  }
  if (resourceType === 'image') params.transformation = 'fetch_format:auto,quality:auto';
  delete params.notification_url;

  return {
    publicId,
    signature: signParams(params),
    apiKey: env.cloudinary.apiKey,
    cloudName: env.cloudinary.cloudName,
    timestamp,
    folder,
    resourceType,
    endpoint: `${env.cloudinary.apiBase}/${resourceType}/private_upload`,
    options: params,
  };
}

/**
 * Expiring signed delivery URL for a private asset (Cloudinary “authenticated”
 * distribution type with a signed, time-limited token).
 */
export function signedDeliveryUrl(publicId: string, resourceType: 'image' | 'raw', expiresIn = 300): { url: string; expiresAt: string } {
  assertConfigured();
  const cleaned = publicId.replace(/^\/+/, '');
  if (/\.\./.test(cleaned)) throw forbidden('That asset reference is not valid.');
  if (!cleaned.startsWith(`${env.cloudinary.rootFolder}/`)) {
    throw forbidden('Only assets inside the configured root folder may be delivered by this service.');
  }
  const expiry = Math.floor(Date.now() / 1000) + Math.max(30, Math.min(expiresIn, 3600));
  const toSign = `${cleaned}?t=${expiry}`;
  const signature = createHash('sha1').update(`${toSign}${env.cloudinary.apiSecret}`).digest('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = `https://res.cloudinary.com/${env.cloudinary.cloudName}/${resourceType}/authenticated/s--${signature}--,t_${expiry}/${cleaned}`;
  return { url, expiresAt: new Date(expiry * 1000).toISOString() };
}

/** Destroys a stored asset. Refuses anything outside the managed folder tree. */
export async function destroyAsset(publicId: string, resourceType: 'image' | 'raw'): Promise<{ deleted: boolean; raw: unknown }> {
  assertConfigured();
  const cleaned = publicId.replace(/^\/+/, '');
  if (!cleaned.startsWith(`${env.cloudinary.rootFolder}/`)) {
    throw forbidden('Only assets inside the configured root folder may be deleted through this service.');
  }
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash('sha1').update(`${timestamp}${env.cloudinary.apiSecret}`).digest('hex');
  const body = new URLSearchParams({ public_id: cleaned, timestamp: String(timestamp), signature, api_key: env.cloudinary.apiKey });
  const response = await fetch(`${env.cloudinary.apiBase}/${resourceType}/destroy`, { method: 'POST', body });
  const text = await response.text();
  if (!response.ok) {
    // Cloudinary's message can mention the asset path; keep it server-side.
    console.error(`[cloudinary] destroy failed (${response.status}) for ${cleaned}: ${text.slice(0, 300)}`);
    throw upstream('The stored file could not be removed. The reference stays on the record so it can be retried.');
  }
  let parsed: { result?: string } = {};
  try {
    parsed = JSON.parse(text) as { result?: string };
  } catch {
    parsed = {};
  }
  return { deleted: parsed.result === 'ok' || parsed.result === 'not_found', raw: parsed };
}

/** Lists the folders a caller may target — used by `/health` and the interface hint text. */
export const policy = {
  signedOnlyFolders: SIGNED_ONLY_FOLDERS,
  unsignedFolders: UNSIGNED_FOLDERS,
  maxBytes: env.maxUploadBytes,
  imageTypes: IMAGE_TYPES,
};

export const newNonce = (): string => randomBytes(8).toString('hex');

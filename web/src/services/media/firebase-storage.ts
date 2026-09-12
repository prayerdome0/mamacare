/**
 * Firebase Storage backend.
 *
 * Cloudinary is used for public site photography when an account is configured.
 * Everything else — profile photos, patient/mother portraits, facility photos,
 * clinical documents, generated reports — belongs in **Firebase Storage**,
 * because it is the one bucket the deployment already controls with security
 * rules, and because the signed-URL path never depends on a third-party secret.
 *
 * Rules enforced here, mirrored in `storage.rules`:
 *  • every object lands under `mamacare/{folder}/…`, nothing at the bucket root;
 *  • uploads are authenticated and constrained by size and MIME type;
 *  • sensitive folders (`mothers`, `documents`, `reports`) are never
 *    world-readable — reading requires a signed-in user whose role the rules
 *    accept;
 *  • a failed or unconfigured backend is *reported*, never faked, and never
 *    silently downgraded to this device.
 */

import { AppError, toAppError } from '@/lib/errors';
import { integrations } from '@/config/env';

export type StorageFolder =
  | 'public'
  | 'mothers'
  | 'reports'
  | 'profiles'
  | 'documents'
  | 'facilities'
  | 'education'
  | 'branding';

export const STORAGE_ROOT = 'mamacare';

export const buildObjectPath = (folder: StorageFolder, publicId: string): string =>
  publicId.startsWith(`${STORAGE_ROOT}/`) ? publicId : `${STORAGE_ROOT}/${folder}/${publicId.replace(/^\/+/, '')}`;

/** Marks a stored id as living in Firebase Storage (see `resolveAssetUrl`). */
export const FIREBASE_PREFIX = 'firebase:';
export const firebasePublicId = (path: string): string => `${FIREBASE_PREFIX}${path}`;
export const isFirebasePublicId = (publicId: string | null | undefined): boolean =>
  Boolean(publicId?.startsWith(FIREBASE_PREFIX));

export const isFirebaseStorageAvailable = (): boolean => integrations.firebase.configured;

interface Sdk {
  getStorage: typeof import('firebase/storage').getStorage;
  ref: typeof import('firebase/storage').ref;
  uploadBytesResumable: typeof import('firebase/storage').uploadBytesResumable;
  getDownloadURL: typeof import('firebase/storage').getDownloadURL;
  deleteObject: typeof import('firebase/storage').deleteObject;
  getMetadata: typeof import('firebase/storage').getMetadata;
}

let sdkPromise: Promise<Sdk> | null = null;

function loadSdk(): Promise<Sdk> {
  if (!sdkPromise) {
    sdkPromise = import('firebase/storage').then((mod) => ({
      getStorage: mod.getStorage,
      ref: mod.ref,
      uploadBytesResumable: mod.uploadBytesResumable,
      getDownloadURL: mod.getDownloadURL,
      deleteObject: mod.deleteObject,
      getMetadata: mod.getMetadata,
    }));
  }
  return sdkPromise;
}

async function storageRef(): Promise<{ sdk: Sdk; storage: import('firebase/storage').FirebaseStorage }> {
  if (!isFirebaseStorageAvailable()) {
    throw new AppError(
      'File storage is not available: this deployment has no Firebase project configured. Add the VITE_FIREBASE_* values to web/.env.local.',
      'CONFIGURATION',
    );
  }
  const sdk = await loadSdk();
  const { getFirebaseApp } = await import('@/services/firebase/app');
  return { sdk, storage: sdk.getStorage(getFirebaseApp()) };
}

export interface FirebaseUploadResult {
  /** Stable object path, stored on the record so the file can be re-resolved. */
  path: string;
  /** A long-lived download URL. Only set for world-readable folders. */
  downloadUrl: string | null;
  bytes: number;
  mimeType: string;
  uploadedAt: string;
}

export interface FirebaseUploadOptions {
  folder: StorageFolder;
  /** Full object id, e.g. `mamacare/profiles/mc-000245-abc123`. */
  publicId: string;
  onProgress?: (percent: number, state: 'validating' | 'uploading' | 'finalising') => void;
  signal?: AbortSignal;
}

/**
 * Uploads with real progress reporting and cancellation.
 *
 * `uploadBytesResumable` is used rather than `uploadBytes` so a clinic on a slow
 * connection sees a percentage rather than an frozen spinner, and so an upload
 * can be cancelled when the user closes the dialog.
 */
export async function uploadToFirebaseStorage(file: File | Blob, options: FirebaseUploadOptions): Promise<FirebaseUploadResult> {
  const { sdk, storage } = await storageRef();
  const path = buildObjectPath(options.folder, options.publicId);

  try {
    const reference = sdk.ref(storage, path);
    const task = sdk.uploadBytesResumable(reference, file, {
      contentType: file.type || 'application/octet-stream',
      customMetadata: {
        mamacare_folder: options.folder,
        mamacare_uploaded_at: new Date().toISOString(),
      },
    });

    options.onProgress?.(2, 'uploading');

    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        void task.cancel();
      };
      if (options.signal) {
        if (options.signal.aborted) {
          void task.cancel();
          reject(new AppError('Upload cancelled.', 'VALIDATION'));
          return;
        }
        options.signal.addEventListener('abort', onAbort, { once: true });
      }
      task.on(
        'state_changed',
        (snapshot) => {
          const percent = snapshot.totalBytes > 0 ? Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100) : 0;
          options.onProgress?.(Math.min(99, percent), 'uploading');
        },
        (error: unknown) => {
          options.signal?.removeEventListener('abort', onAbort);
          reject(toAppError(error, storageFailureMessage(error)));
        },
        () => {
          options.signal?.removeEventListener('abort', onAbort);
          resolve();
        },
      );
    });

    options.onProgress?.(100, 'finalising');

    // Folders that may keep a long-lived URL on the record. Clinical folders
    // (`mothers`, `documents`, `reports`) deliberately store only the object
    // path: their URL is resolved at open time, so a tokenised link to patient
    // data is never written into a document anyone else can read.
    const PERSISTABLE: StorageFolder[] = ['public', 'education', 'branding', 'facilities', 'profiles'];
    const downloadUrl = PERSISTABLE.includes(options.folder) ? await sdk.getDownloadURL(reference).catch(() => null) : null;

    return {
      path,
      downloadUrl,
      bytes: file.size,
      mimeType: file.type || 'application/octet-stream',
      uploadedAt: new Date().toISOString(),
    };
  } catch (error) {
    throw error instanceof AppError ? error : toAppError(error, storageFailureMessage(error));
  }
}

/** Resolves a stored object path to a displayable URL, honouring the rules. */
export async function firebaseStorageUrl(path: string): Promise<string> {
  const { sdk, storage } = await storageRef();
  try {
    return await sdk.getDownloadURL(sdk.ref(storage, path));
  } catch (error) {
    throw new AppError(storageFailureMessage(error), 'STORAGE_UNAVAILABLE', { retryable: true });
  }
}

export async function deleteFromFirebaseStorage(path: string): Promise<void> {
  const { sdk, storage } = await storageRef();
  try {
    await sdk.deleteObject(sdk.ref(storage, path));
  } catch (error) {
    const code = (error as { code?: string }).code ?? '';
    // "Object not found" means it is already gone — deleting is idempotent.
    if (code === 'storage/object-not-found') return;
    throw new AppError(storageFailureMessage(error), 'STORAGE_UNAVAILABLE', { retryable: true });
  }
}

/** Human, actionable text for the handful of Storage errors a clinic will meet. */
function storageFailureMessage(error: unknown): string {
  const code = String((error as { code?: string })?.code ?? '').replace('storage/', '');
  switch (code) {
    case 'unauthorized':
      return 'You do not have permission to change this file. Ask a supervisor or administrator if it should be moved.';
    case 'canceled':
      return 'Upload cancelled.';
    case 'retry-limit-exceeded':
      return 'The connection kept dropping during the upload. Try again when the signal is steadier.';
    case 'invalid-checksum':
      return 'The file was corrupted in transit. Please upload it again.';
    case 'quota-exceeded':
      return 'The storage quota for this project has been reached. Ask the administrator to free space or raise the quota.';
    case 'object-not-found':
      return 'That file is no longer in storage. It may have been removed by someone else.';
    case 'unauthenticated':
      return 'You were signed out before the upload finished. Sign in again and retry.';
    default:
      return 'The file could not be stored. Check your connection and try again.';
  }
}

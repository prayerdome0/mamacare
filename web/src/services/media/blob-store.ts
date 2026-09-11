import { get, put, remove } from '@/services/data/local/store';

/**
 * Binary storage for device-held media (documents and reports uploaded while
 * Cloudinary is not configured). Kept behind an interface so the media service
 * is agnostic to whether bytes live in the cloud or on this device.
 */

export interface BlobStore {
  put(key: string, blob: Blob): Promise<void>;
  get(key: string): Promise<Blob | null>;
  delete(key: string): Promise<void>;
}

const indexedDbBlobStore: BlobStore = {
  async put(key, blob) {
    await put('blobs', { id: key, blob });
  },
  async get(key) {
    const row = await get<{ id: string; blob: Blob }>('blobs', key);
    return row?.blob ?? null;
  },
  async delete(key) {
    await remove('blobs', key);
  },
};

let active: BlobStore = indexedDbBlobStore;

export const setBlobStore = (store: BlobStore): void => {
  active = store;
};

export const getBlobStore = (): BlobStore => active;

export const defaultBlobStore = indexedDbBlobStore;

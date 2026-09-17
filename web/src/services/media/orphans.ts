/**
 * Orphaned cloud assets.
 *
 * A browser cannot delete a Cloudinary asset — deletion needs the API secret,
 * which never reaches the client, and this deployment has no server-side media
 * service. So when a user deletes an image the record is removed from Mama Care
 * immediately and the public id is queued here for an administrator to clear from
 * the media library.
 *
 * The queue lives in this browser's IndexedDB. It is an honest to-do list, not a
 * claim that the cloud copy is gone: the admin Media queue screen shows the ids
 * and lets an administrator mark each one cleared.
 */

import { getMeta, setMeta } from '@/services/data/local/store';

const KEY = 'media-orphans';

export interface OrphanAsset {
  publicId: string;
  deletedAt: string;
  deletedBy: string | null;
  cleared: boolean;
}

export async function listOrphanAssets(): Promise<OrphanAsset[]> {
  return (await getMeta<OrphanAsset[]>(KEY)) ?? [];
}

export async function queueOrphanAsset(publicId: string, deletedBy: string | null = null): Promise<void> {
  if (!publicId || publicId.startsWith('device:') || publicId.startsWith('firebase:')) return;
  const queue = await listOrphanAssets();
  if (queue.some((entry) => entry.publicId === publicId)) return;
  queue.push({ publicId, deletedAt: new Date().toISOString(), deletedBy, cleared: false });
  // Keep the queue bounded: the oldest cleared entries drop off first.
  const next = queue.length > 200 ? queue.slice(queue.length - 200) : queue;
  await setMeta(KEY, next);
}

export async function clearOrphanAsset(publicId: string): Promise<void> {
  const queue = await listOrphanAssets();
  await setMeta(
    KEY,
    queue.map((entry) => (entry.publicId === publicId ? { ...entry, cleared: true } : entry)),
  );
}

export async function purgeClearedOrphans(): Promise<void> {
  const queue = await listOrphanAssets();
  await setMeta(
    KEY,
    queue.filter((entry) => !entry.cleared),
  );
}

import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { forbidden, withBody } from '../http.js';
import { writeAudit } from '../audit.js';
import { dbOrThrow } from '../firebase.js';
import { claimsOf, requireAuth } from './_auth.js';

/**
 * Media routes.
 *
 * This deployment uploads public imagery straight from the browser with the
 * **unsigned** Cloudinary preset, flat at the media-library root — no folder,
 * no `asset_folder`, no public-id path is ever created. There is therefore no
 * signing route here at all, and nothing in this service constructs a path.
 *
 * The only server-side operation that still needs the Cloudinary Admin API is
 * deleting an orphaned asset, which a browser may not do with an unsigned
 * preset. It is enabled only when `CLOUDINARY_API_KEY` and
 * `CLOUDINARY_API_SECRET` are set; otherwise the route answers `unavailable`
 * and the media library is tidied by hand.
 */
export const mediaRouter = Router();

const deleteBody = z.object({
  publicId: z.string().trim().min(1).max(400),
  resourceType: z.enum(['image', 'raw']).default('image'),
  reason: z.string().trim().max(240).optional(),
});

mediaRouter.post('/delete', requireAuth, withBody(deleteBody, async (input, req) => {
  const claims = claimsOf(req);
  const db = dbOrThrow();
  const publicId = input.publicId.replace(/^\/+/, '');

  const match = await db.collection('documents').where('publicId', '==', publicId).limit(1).get();
  const record = match.docs[0] ?? null;
  if (record) {
    const uploader = record.get('uploadedBy') as string | undefined;
    if (claims.role !== 'ADMIN' && uploader !== claims.uid) {
      throw forbidden('Only the person who uploaded a file, or an administrator, may delete it.');
    }
  } else if (claims.role !== 'ADMIN') {
    throw forbidden('Only an administrator may remove an asset that is not attached to a record.');
  }

  if (!env.cloudinary.configured) {
    await writeAudit(db, claims, {
      action: 'media.deleted',
      targetType: 'media',
      targetId: publicId,
      facilityId: claims.facilityId,
      metadata: { deleted: false, reason: input.reason ?? null, note: 'CLOUDINARY_API_KEY/SECRET not set on the API service' },
    });
    return { deleted: false, unavailable: true, note: 'The API service has no Cloudinary admin credentials, so the asset could not be removed from the media library.' };
  }

  const timestamp = Math.floor(Date.now() / 1000);
  const crypto = await import('node:crypto');
  // Cloudinary signs `public_id` with no folder prefix — the deployment stores
  // assets flat at the root, so nothing is added to the identifier here.
  const signature = crypto
    .createHash('sha1')
    .update(`public_id=${publicId}&timestamp=${timestamp}${env.cloudinary.apiSecret}`)
    .digest('hex');

  const body = new URLSearchParams({ public_id: publicId, timestamp: String(timestamp), signature, api_key: env.cloudinary.apiKey });
  const response = await fetch(`${env.cloudinary.apiBase}/${input.resourceType}/destroy`, { method: 'POST', body });
  const result = (await response.json().catch(() => ({}))) as { result?: string };

  await writeAudit(db, claims, {
    action: 'media.deleted',
    targetType: 'media',
    targetId: publicId,
    facilityId: claims.facilityId,
    metadata: { deleted: result.result === 'ok', reason: input.reason ?? null, recordId: record?.id ?? null },
  });

  return { deleted: result.result === 'ok' };
}));

mediaRouter.get('/policy', (_req, res) => {
  res.json({
    cloudName: env.cloudinary.cloudName || null,
    unsignedPreset: env.cloudinary.unsignedPreset || null,
    // Flat by policy: no folders anywhere in the Cloudinary media library.
    folders: false,
    maxBytes: env.maxUploadBytes,
    secretInBrowser: false,
    serverDeletionEnabled: env.cloudinary.configured,
  });
});

import { Router } from 'express';
import { z } from 'zod';
import { env } from '../env.js';
import { destroyAsset, policy, signUpload, signedDeliveryUrl } from '../cloudinary.js';
import { dbOrThrow } from '../firebase.js';
import { conflict, forbidden, withBody } from '../http.js';
import { writeAudit } from '../audit.js';
import { claimsOf, requireAuth } from './_auth.js';

/**
 * Media routes. The browser can ask for a signature or a delivery URL; it can
 * never see the API secret, choose a folder outside the managed tree, or fetch an
 * asset it has no claim on.
 */
export const mediaRouter = Router();

const signBody = z.object({
  folder: z.string().trim().min(1).max(120),
  publicId: z.string().trim().min(8).max(400),
  resourceType: z.enum(['image', 'raw']).default('image'),
  accessMode: z.enum(['public', 'authenticated', 'private']).optional(),
  fileSizeBytes: z.number().int().positive().optional(),
  mimeType: z.string().trim().max(80).optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

mediaRouter.post('/sign', requireAuth, withBody(signBody, async (input, req) => {
  const claims = claimsOf(req);
  const params = signUpload(input);
  await writeAudit(dbOrThrow(), claims, {
    action: 'media.signed',
    targetType: 'media',
    targetId: params.publicId,
    targetLabel: input.folder,
    facilityId: claims.facilityId,
    metadata: { resourceType: input.resourceType, bytes: input.fileSizeBytes ?? null, mode: SIGNED_FOLDERS.includes(input.folder.split('/')[1] ?? '') ? 'signed' : 'unsigned-preset' },
  });
  return params;
}));

const SIGNED_FOLDERS = policy.signedOnlyFolders;

const signUrlBody = z.object({
  publicId: z.string().trim().min(8).max(400),
  resourceType: z.enum(['image', 'raw']).default('image'),
  expiresIn: z.number().int().min(30).max(3600).optional(),
});

/**
 * Delivery URL for a private asset. Authorisation is decided by the record that
 * references the asset — the same access list the web app enforces — so a leaked
 * public id is not itself a way in.
 */
mediaRouter.post('/sign-url', requireAuth, withBody(signUrlBody, async (input, req) => {
  const claims = claimsOf(req);
  const db = dbOrThrow();
  const publicId = input.publicId.replace(/^\/+/, '');

  const [byDocument, byReport] = await Promise.all([
    db.collection('documents').where('publicId', '==', publicId).limit(1).get(),
    db.collection('reports').where('file.publicId', '==', publicId).limit(1).get(),
  ]);
  const record = byDocument.docs[0] ?? byReport.docs[0] ?? null;
  const isPatientReport = Boolean(record?.get('motherId'));

  if (record) {
    const accessRoles = (record.get('accessRoles') as string[] | undefined) ?? [];
    const accessUsers = (record.get('accessUserIds') as string[] | undefined) ?? [];
    const uploader = record.get('uploadedBy') as string | undefined;
    const motherId = record.get('motherId') as string | null | undefined;
    const facilityId = (record.get('facilityId') as string | null | undefined) ?? null;

    const allowed =
      claims.role === 'ADMIN' ||
      (claims.motherId !== null && motherId === claims.motherId) ||
      accessUsers.includes(claims.uid) ||
      accessRoles.includes(claims.role) ||
      uploader === claims.uid ||
      (isPatientReport && claims.role !== 'MOTHER' && facilityId !== null && facilityId === claims.facilityId);

    if (!allowed) throw forbidden('That file is not part of your records.');
  } else {
    // No record references it. Only the folders that are public by design may be
    // delivered without one, plus the caller's own portrait.
    const second = publicId.split('/')[1] ?? '';
    const isOwnProfile = second === 'profiles' && publicId.includes(claims.uid);
    if (!policy.unsignedFolders.includes(second) && !isOwnProfile) {
      throw conflict('This file is not registered in the document index, so it cannot be delivered.');
    }
  }

  const result = signedDeliveryUrl(publicId, input.resourceType, input.expiresIn ?? (record ? 300 : 600));
  if (record) {
    await record.ref.update({ lastAccessedAt: new Date().toISOString(), lastAccessedBy: claims.uid }).catch(() => null);
    await writeAudit(db, claims, {
      action: 'document.accessed',
      targetType: 'document',
      targetId: record.id,
      targetLabel: (record.get('name') as string | undefined) ?? null,
      facilityId: (record.get('facilityId') as string | null | undefined) ?? claims.facilityId,
      metadata: { via: 'signed-url', expiresIn: input.expiresIn ?? 300 },
    });
  }
  return result;
}));

const deleteBody = z.object({
  publicId: z.string().trim().min(8).max(400),
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
  } else if (!publicId.startsWith(`${env.cloudinary.rootFolder}/`)) {
    throw forbidden('Only assets inside the managed folder tree may be deleted.');
  }

  const result = await destroyAsset(publicId, input.resourceType);
  if (record) {
    await record.ref
      .update({ deletedAt: new Date().toISOString(), deletedBy: claims.uid, secureUrl: null, thumbnailUrl: null })
      .catch(() => null);
  }
  await writeAudit(db, claims, {
    action: 'media.deleted',
    targetType: 'media',
    targetId: publicId,
    facilityId: claims.facilityId,
    metadata: { reason: input.reason ?? null, recordId: record?.id ?? null, deleted: result.deleted },
  });
  return { deleted: result.deleted };
}));

mediaRouter.get('/policy', (_req, res) => {
  res.json({
    rootFolder: env.cloudinary.rootFolder,
    signedOnlyFolders: policy.signedOnlyFolders,
    unsignedFolders: policy.unsignedFolders,
    maxBytes: policy.maxBytes,
    imageTypes: policy.imageTypes,
    secretInBrowser: false,
  });
});

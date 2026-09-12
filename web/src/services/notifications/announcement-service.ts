/**
 * Announcements and broadcasts.
 *
 * An announcement is a *managed* notice: it is stored, edited, re-sent and
 * audited, unlike a one-off notification row. Sending fans it out to the chosen
 * audience — everyone, health workers, mothers, one facility, or selected
 * individuals — writing one notification per recipient.
 *
 * Sending is idempotent per attempt: the announcement records how many people
 * received it, and re-sending only reaches people who have not had this
 * announcement yet, so a retry after a dropped connection never spams anyone.
 */

import { AppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { services } from '@/services/session-store';
import type { Announcement, AnnouncementAudience, UserProfile } from '@/types/domain';

export interface DraftAnnouncement {
  title: string;
  body: string;
  audience: AnnouncementAudience;
  facilityId?: string | null;
  recipientIds?: string[];
  level?: Announcement['level'];
  published?: boolean;
  pinned?: boolean;
  link?: string | null;
  scheduledFor?: string | null;
}

const now = (): string => new Date().toISOString();

/** Resolves an audience to the accounts that should receive it. */
async function resolveRecipients(audience: AnnouncementAudience, facilityId: string | null, recipientIds: string[]): Promise<UserProfile[]> {
  const registry = services();
  const actor = registry.require();

  if (audience === 'INDIVIDUALS') {
    if (recipientIds.length === 0) throw new AppError('Choose at least one person to send this to.', 'VALIDATION');
    const people = await Promise.all(recipientIds.map((id) => registry.data.get('users', id).catch(() => null)));
    return people.filter((person): person is UserProfile => Boolean(person) && person?.status === 'ACTIVE');
  }

  const { rows } = await registry.data.list('users', { where: [{ field: 'status', op: '==', value: 'ACTIVE' }], limit: 500 });
  return (rows as UserProfile[]).filter((user) => {
    if (user.id === actor.uid) return false;
    if (user.status !== 'ACTIVE') return false;
    switch (audience) {
      case 'STAFF':
        return user.role !== 'MOTHER' && (!facilityId || user.facilityId === facilityId);
      case 'MOTHERS':
        return user.role === 'MOTHER' && (!facilityId || user.facilityId === facilityId);
      case 'FACILITY':
        return Boolean(facilityId) && user.facilityId === facilityId;
      case 'EVERYONE':
      default:
        return true;
    }
  });
}

export async function createAnnouncement(draft: DraftAnnouncement, options: { send?: boolean } = {}): Promise<Announcement> {
  const registry = services();
  const actor = registry.require();
  const title = draft.title.trim();
  const body = draft.body.trim();
  if (title.length < 3) throw new AppError('Give the announcement a title.', 'VALIDATION');
  if (body.length < 10) throw new AppError('Write the message people will receive.', 'VALIDATION');

  const record: Announcement = {
    id: newId('ann'),
    title,
    body,
    audience: draft.audience,
    facilityId: draft.facilityId ?? null,
    recipientIds: draft.recipientIds ?? [],
    level: draft.level ?? 'info',
    published: draft.published ?? false,
    pinned: draft.pinned ?? false,
    link: draft.link ?? null,
    status: draft.scheduledFor ? 'SCHEDULED' : options.send ? 'SENT' : 'DRAFT',
    scheduledFor: draft.scheduledFor ?? null,
    sentAt: null,
    recipients: 0,
    createdAt: now(),
    createdBy: actor.uid,
    createdByName: actor.displayName,
    updatedAt: null,
  };

  const saved = (await registry.data.create('announcements', record as never)) as Announcement;
  await registry.data.audit('announcement.created', 'announcement', saved.id, {
    label: title,
    facilityId: saved.facilityId,
    metadata: { audience: saved.audience, published: saved.published },
  });

  if (options.send) return sendAnnouncement(saved.id);
  return saved;
}

/**
 * Sends an announcement.
 *
 * People who already hold a notification for this announcement are skipped, so
 * a second send after a partial failure reaches only those who missed it.
 */
export async function sendAnnouncement(id: string): Promise<Announcement> {
  const registry = services();
  const actor = registry.require();

  const existing = await registry.data.get('announcements', id);
  if (!existing) throw new AppError('That announcement could not be found.', 'NOT_FOUND');

  const recipients = await resolveRecipients(existing.audience, existing.facilityId ?? null, existing.recipientIds ?? []);
  if (recipients.length === 0) {
    throw new AppError(
      existing.audience === 'FACILITY'
        ? 'No active accounts belong to that facility yet. Choose a different audience or add staff first.'
        : 'No active accounts match that audience yet.',
      'VALIDATION',
    );
  }

  const alreadySent = new Set(
    (
      await registry.provider.list('notifications', { where: [{ field: 'link', op: '==', value: `/announcements/${existing.id}` }], limit: 1000 }, { ...actor, role: 'ADMIN' }).catch(() => ({ rows: [] as { userId: string }[] }))
    ).rows.map((row) => row.userId),
  );

  const targets = recipients.filter((user) => !alreadySent.has(user.id));
  let delivered = 0;

  const linkFor = (role: string): string => (role === 'MOTHER' ? '/home/notifications' : '/app/notifications');
  await Promise.all(
    targets.map(async (user) => {
      try {
        await registry.data.notify({
          userId: user.id,
          kind: 'ANNOUNCEMENT',
          title: existing.title,
          body: existing.body,
          level: existing.level,
          link: linkFor(user.role),
          facilityId: existing.facilityId,
        });
        delivered += 1;
      } catch {
        // One undeliverable recipient must not stop the rest of the send.
      }
    }),
  );

  const saved = (await registry.data.update('announcements', id, {
    status: 'SENT',
    sentAt: now(),
    published: true,
    recipients: alreadySent.size + delivered,
    updatedAt: now(),
  } as Partial<Announcement>)) as Announcement;

  await registry.data.audit('announcement.sent', 'announcement', id, {
    label: existing.title,
    facilityId: existing.facilityId,
    metadata: { audience: existing.audience, delivered, skipped: alreadySent.size, total: alreadySent.size + delivered },
  });

  return saved;
}

export async function updateAnnouncement(id: string, patch: Partial<DraftAnnouncement> & { published?: boolean; pinned?: boolean }): Promise<Announcement> {
  const registry = services();
  const next: Partial<Announcement> = { updatedAt: now() };
  if (patch.title !== undefined) next.title = patch.title.trim();
  if (patch.body !== undefined) next.body = patch.body.trim();
  if (patch.audience !== undefined) next.audience = patch.audience;
  if (patch.facilityId !== undefined) next.facilityId = patch.facilityId;
  if (patch.recipientIds !== undefined) next.recipientIds = patch.recipientIds;
  if (patch.level !== undefined) next.level = patch.level;
  if (patch.published !== undefined) next.published = patch.published;
  if (patch.pinned !== undefined) next.pinned = patch.pinned;
  if (patch.link !== undefined) next.link = patch.link;
  if (patch.scheduledFor !== undefined) next.scheduledFor = patch.scheduledFor;
  const saved = (await registry.data.update('announcements', id, next)) as Announcement;
  await registry.data.audit('announcement.updated', 'announcement', id, { label: saved.title });
  return saved;
}

export async function deleteAnnouncement(id: string): Promise<void> {
  const registry = services();
  await registry.data.remove('announcements', id);
  await registry.data.audit('announcement.deleted', 'announcement', id, {});
}

export async function listAnnouncements(): Promise<Announcement[]> {
  const registry = services();
  const { rows } = await registry.data.list('announcements', {
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 100,
  });
  return rows as Announcement[];
}

/**
 * Published notices for the public site and the mother's portal.
 *
 * Only rows explicitly marked published and already sent are returned, and the
 * caller must be able to read them under `firestore.rules` — a draft is never
 * visible to a signed-out visitor.
 */
export async function publishedAnnouncements(limit = 4): Promise<Announcement[]> {
  const registry = services();
  try {
    const { rows } = await registry.data.list('announcements', {
      where: [
        { field: 'published', op: '==', value: true },
        { field: 'status', op: '==', value: 'SENT' },
      ],
      orderBy: { field: 'createdAt', direction: 'desc' },
      limit,
    });
    return rows as Announcement[];
  } catch {
    // A visitor with no permission to list announcements simply sees none.
    return [];
  }
}

/** How many people an audience currently resolves to — shown before sending. */
export async function audienceSize(audience: AnnouncementAudience, facilityId: string | null, recipientIds: string[]): Promise<number> {
  try {
    const people = await resolveRecipients(audience, facilityId, recipientIds);
    return people.length;
  } catch {
    return 0;
  }
}

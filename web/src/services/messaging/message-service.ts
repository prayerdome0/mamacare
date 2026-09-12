/**
 * Direct messages (one-to-one).
 *
 * A thread is identified by the two participants' user ids sorted and joined,
 * so both sides derive the same key without a lookup. Every message row carries
 * both ids in `participantIds`, which is what `firestore.rules` matches on —
 * the database, not the interface, decides who may read a conversation.
 *
 * Mothers can only write to health-worker accounts; the rules enforce it, and
 * the service mirrors the check so the composer never offers an invalid target.
 */

import { AppError, toAppError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { services } from '@/services/session-store';
import type { Message, MessageThread, Role, UserProfile } from '@/types/domain';

const now = (): string => new Date().toISOString();

export const threadIdFor = (a: string, b: string): string => [a, b].sort().join('~');

export interface SendMessageInput {
  recipientId: string;
  body: string;
  subject?: string | null;
  motherId?: string | null;
  appointmentId?: string | null;
}

export async function sendDirectMessage(input: SendMessageInput): Promise<Message> {
  const registry = services();
  const actor = registry.require();
  const body = input.body.trim();
  if (!body) throw new AppError('Write a message before sending it.', 'VALIDATION');
  if (body.length > 4000) throw new AppError('That message is too long. Keep it under 4000 characters.', 'VALIDATION');
  if (input.recipientId === actor.uid) throw new AppError('Choose someone other than yourself.', 'VALIDATION');

  const recipient = await registry.data.get('users', input.recipientId);
  if (!recipient) throw new AppError('That person could not be found.', 'NOT_FOUND');
  if (recipient.status !== 'ACTIVE') throw new AppError('That account is not active, so it cannot receive messages.', 'VALIDATION');

  // The same restriction the security rules apply: a mother may only write to
  // health workers, never to another patient.
  if (actor.role === 'MOTHER' && recipient.role === 'MOTHER') {
    throw new AppError('Messages to other mothers are not available. Contact your facility instead.', 'FORBIDDEN');
  }

  const threadId = threadIdFor(actor.uid, recipient.id);
  const message: Message = {
    id: newId('msg'),
    threadId,
    senderId: actor.uid,
    senderName: actor.displayName,
    senderRole: actor.role,
    recipientId: recipient.id,
    recipientName: recipient.fullName,
    participantIds: [actor.uid, recipient.id],
    subject: input.subject?.trim() || null,
    body,
    motherId: input.motherId ?? null,
    appointmentId: input.appointmentId ?? null,
    facilityId: actor.facilityId ?? recipient.facilityId ?? null,
    readAt: null,
    createdAt: now(),
    createdBy: actor.uid,
  };

  const saved = (await registry.data.create('messages', message as never)) as Message;

  // An in-app notification so the message is noticed; the thread itself is the
  // record, so nothing is lost if the notification is dismissed.
  await registry.data
    .notify({
      userId: recipient.id,
      kind: 'SYSTEM',
      title: `New message from ${actor.displayName}`,
      body: body.length > 140 ? `${body.slice(0, 137)}…` : body,
      level: 'info',
      link: recipient.role === 'MOTHER' ? '/home/messages' : '/app/messages',
      motherId: input.motherId ?? null,
    })
    .catch(() => null);

  await registry.data.audit('message.sent', 'message', saved.id, {
    label: recipient.fullName,
    metadata: { recipientId: recipient.id, threadId },
  });

  return saved;
}

/** Every thread this account is part of, newest first, with an unread count. */
export async function listThreads(): Promise<MessageThread[]> {
  const registry = services();
  const actor = registry.require();
  const { rows } = await registry.data.list('messages', {
    where: [{ field: 'participantIds', op: 'array-contains', value: actor.uid }],
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 300,
  });

  const byThread = new Map<string, Message[]>();
  for (const message of rows as Message[]) {
    const existing = byThread.get(message.threadId) ?? [];
    existing.push(message);
    byThread.set(message.threadId, existing);
  }

  // Names come from the user directory so a thread shows a person, not an id.
  const otherIds = [
    ...new Set(
      [...byThread.values()]
        .map((thread) => (thread[0] ? otherParticipant(thread[0], actor.uid) : null))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map<string, { name: string; role: Role }>();
  await Promise.all(
    otherIds.map(async (id) => {
      const user = await registry.data.get('users', id).catch(() => null);
      if (user) names.set(id, { name: user.fullName, role: user.role });
    }),
  );

  const threads: MessageThread[] = [];
  for (const [, thread] of byThread) {
    const latest = thread[0]!;
    const otherId = otherParticipant(latest, actor.uid);
    if (!otherId) continue;
    const other = names.get(otherId);
    threads.push({
      threadId: latest.threadId,
      participantIds: latest.participantIds,
      otherId,
      otherName: other?.name ?? (latest.senderId === actor.uid ? latest.recipientName : latest.senderName),
      otherRole: other?.role ?? (latest.senderId === actor.uid ? 'MOTHER' : latest.senderRole),
      lastMessage: latest.body,
      lastMessageAt: latest.createdAt,
      unread: thread.filter((message) => message.senderId !== actor.uid && !message.readAt).length,
    });
  }

  return threads.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

/** One conversation, oldest first, so it reads like a thread. */
export async function listThreadMessages(otherId: string): Promise<Message[]> {
  const registry = services();
  const actor = registry.require();
  const { rows } = await registry.data.list('messages', {
    where: [{ field: 'threadId', op: '==', value: threadIdFor(actor.uid, otherId) }],
    orderBy: { field: 'createdAt', direction: 'asc' },
    limit: 300,
  });
  return rows as Message[];
}

export async function markThreadRead(otherId: string): Promise<number> {
  const registry = services();
  const actor = registry.require();
  const messages = await listThreadMessages(otherId);
  const unread = messages.filter((message) => message.senderId !== actor.uid && !message.readAt);
  await Promise.all(
    unread.map((message) =>
      registry.data.update('messages', message.id, { readAt: now() } as Partial<Message>).catch(() => null),
    ),
  );
  return unread.length;
}

export async function unreadMessageCount(): Promise<number> {
  const registry = services();
  const actor = registry.actorRef();
  if (!actor) return 0;
  try {
    const { rows } = await registry.data.list('messages', {
      where: [{ field: 'participantIds', op: 'array-contains', value: actor.uid }],
      limit: 300,
    });
    return (rows as Message[]).filter((message) => message.senderId !== actor.uid && !message.readAt).length;
  } catch {
    return 0;
  }
}

/** People this account is allowed to message. */
export async function messageablePeople(): Promise<UserProfile[]> {
  const registry = services();
  const actor = registry.require();
  const { rows } = await registry.data.list('users', { where: [{ field: 'status', op: '==', value: 'ACTIVE' }], limit: 300 });
  return (rows as UserProfile[]).filter((user) => {
    if (user.id === actor.uid) return false;
    // A mother may only write to health workers; staff may write to anyone.
    if (actor.role === 'MOTHER') return user.role !== 'MOTHER';
    return true;
  });
}

function otherParticipant(message: Message, selfId: string): string | null {
  return message.participantIds.find((id) => id !== selfId) ?? null;
}

export { toAppError };

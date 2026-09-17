/**
 * Message centre — shared by the mother app and the provider portal.
 *
 * Both sides need the same thing: a list of conversations, a thread, a composer and
 * an unread count. What differs is only who they are allowed to talk to, and that is
 * decided by the caller (care links for a provider, the mother's linked providers
 * and approved supporters for a mother) and by policy on every read.
 *
 * The banner is not decoration. A messaging thread that looks like an emergency
 * channel gets used as one, and that costs time.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, MessageCircle, Send } from 'lucide-react';
import { useAsync } from '@/hooks';
import { messageRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { formatTime, relativeTime } from '@/lib/utils';
import type { Message, Role } from '@/types/domain';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, EmptyState, LoadingRows } from '@/components/ui/display';
import { TextArea } from '@/components/ui/form';
import { cn } from '@/lib/utils';

export interface MessageContact {
  id: string;
  name: string;
  detail?: string;
  role?: Role;
}

const ROLE_LABEL: Partial<Record<Role, string>> = {
  MOTHER: 'Mother',
  SUPPORTER: 'Supporter',
  PROVIDER: 'Provider',
  FACILITY_ADMIN: 'Facility admin',
  ADMIN: 'Administrator',
};

export function MessageCentre({
  contacts,
  initialPeerId,
  initialPeerName,
  emptyTitle,
  emptyDescription,
  onOpenChange,
}: {
  contacts: MessageContact[];
  initialPeerId?: string | null;
  initialPeerName?: string | null;
  emptyTitle: string;
  emptyDescription: string;
  onOpenChange?: (peerId: string | null) => void;
}) {
  const { actor } = useSession();
  const uid = actor?.uid ?? '';
  const [openId, setOpenId] = useState<string | null>(initialPeerId ?? null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);

  const { data: threads, loading: threadsLoading, run: reloadThreads } = useAsync(
    () => (uid ? messageRepo.threads(uid) : Promise.resolve([])),
    { deps: [uid], immediate: Boolean(uid) },
  );

  const peer = useMemo<MessageContact | null>(() => {
    if (!openId) return null;
    return (
      contacts.find((contact) => contact.id === openId) ??
      (initialPeerId === openId && initialPeerName ? { id: openId, name: initialPeerName } : null)
    );
  }, [openId, contacts, initialPeerId, initialPeerName]);

  const { data: messages, loading: messagesLoading, run: reloadMessages } = useAsync(
    () => (uid && openId ? messageRepo.conversation(uid, openId) : Promise.resolve([] as Message[])),
    { deps: [uid, openId], immediate: Boolean(uid && openId) },
  );

  const open = useCallback(
    (peerId: string) => {
      setOpenId(peerId);
      onOpenChange?.(peerId);
    },
    [onOpenChange],
  );

  /* Refresh while a thread is open, so a reply appears without a manual reload.
   * 15s is frequent enough to feel live and cheap enough for a metered connection. */
  useEffect(() => {
    if (!openId) return;
    const handle = setInterval(() => {
      void reloadMessages();
      void reloadThreads();
    }, 15_000);
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') {
        void reloadMessages();
        void reloadThreads();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(handle);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [openId, reloadMessages, reloadThreads]);

  useEffect(() => {
    if (!openId || !uid) return;
    void messageRepo.markRead(uid, openId).then(() => void reloadThreads());
  }, [openId, uid, messages, reloadThreads]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages]);

  const threadByPeer = useMemo(() => new Map((threads ?? []).map((thread) => [thread.peerId, thread])), [threads]);

  const conversationList = useMemo(() => {
    const known = contacts.map((contact) => ({
      contact,
      thread: threadByPeer.get(contact.id) ?? null,
    }));
    /* Threads with someone no longer in the contact list still show, so a revoked
     * link does not silently delete a conversation. */
    const extra = (threads ?? [])
      .filter((thread) => !contacts.some((contact) => contact.id === thread.peerId))
      .map((thread) => ({ contact: { id: thread.peerId, name: thread.peerName } as MessageContact, thread }));
    return [...known, ...extra].sort((a, b) => {
      const aAt = a.thread?.last.createdAt ?? '';
      const bAt = b.thread?.last.createdAt ?? '';
      return bAt.localeCompare(aAt);
    });
  }, [contacts, threads, threadByPeer]);

  const send = async (): Promise<void> => {
    if (!peer || !draft.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      await messageRepo.send({ toUserId: peer.id, toName: peer.name, body: draft.trim() });
      setDraft('');
      await Promise.all([reloadMessages(), reloadThreads()]);
    } catch {
      setSendError('That did not send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  const rows = messages ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <Card className="card-pad h-fit">
        <h2 className="card-title">Conversations</h2>
        {threadsLoading ? <LoadingRows className="mt-3" rows={3} /> : null}
        {!threadsLoading && conversationList.length === 0 ? (
          <EmptyState
            className="mt-3 px-2 py-8"
            icon={<MessageCircle className="size-5" aria-hidden />}
            title="No conversations yet"
            description={emptyDescription}
          />
        ) : null}
        <ul className="mt-3 space-y-1.5">
          {conversationList.map(({ contact, thread }) => (
            <li key={contact.id}>
              <button
                type="button"
                onClick={() => open(contact.id)}
                aria-current={openId === contact.id ? 'true' : undefined}
                className={cn(
                  'flex w-full items-start justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors',
                  openId === contact.id ? 'border-brand-400 bg-brand-50' : 'border-transparent hover:border-ink-200',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink-800">{contact.name}</span>
                  <span className="block truncate text-xs text-ink-500">
                    {thread ? thread.last.body : contact.detail ?? (contact.role ? ROLE_LABEL[contact.role] : 'Start a conversation')}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  {thread?.unread ? <Badge tone="red">{thread.unread}</Badge> : null}
                  {thread ? <span className="mt-1 block text-[0.65rem] text-ink-400">{relativeTime(thread.last.createdAt)}</span> : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="flex min-h-[28rem] flex-col overflow-hidden">
        {!peer ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState icon={<MessageCircle className="size-6" aria-hidden />} title={emptyTitle} description={emptyDescription} />
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
              <div className="min-w-0">
                <h2 className="card-title truncate">{peer.name}</h2>
                <p className="text-xs text-ink-500">
                  {peer.detail ?? (peer.role ? ROLE_LABEL[peer.role] : '')}
                  {threadByPeer.get(peer.id)?.last ? ` · last message ${relativeTime(threadByPeer.get(peer.id)!.last.createdAt)}` : ''}
                </p>
              </div>
              <Badge tone="neutral">Private to this conversation</Badge>
            </div>

            <div className="flex flex-wrap items-start gap-2 border-b border-ink-100 bg-[var(--color-risk-amber-soft)] px-4 py-2.5">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
              <p className="text-xs leading-relaxed text-ink-700">
                Messages are not an emergency channel and are not monitored in real time. If you have bleeding, severe
                pain, reduced fetal movement or a sick newborn, call or go to a facility now.
              </p>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-ink-50/50 px-4 py-4">
              {messagesLoading ? <LoadingRows rows={3} /> : null}
              {!messagesLoading && rows.length === 0 ? (
                <p className="py-8 text-center text-sm text-ink-500">
                  No messages yet. Say what you need — include your week or the baby's age, and what you have already
                  tried.
                </p>
              ) : null}
              {rows.map((message) => {
                const mine = message.fromUserId === uid;
                return (
                  <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 shadow-[var(--shadow-card)]',
                        mine ? 'rounded-br-sm bg-brand-700 text-brand-50' : 'rounded-bl-sm border border-ink-200 bg-white',
                      )}
                    >
                      {!mine ? <p className="text-[0.7rem] font-semibold text-brand-800">{message.fromName}</p> : null}
                      <p className={cn('mt-0.5 text-sm leading-relaxed whitespace-pre-wrap', mine ? 'text-brand-50' : 'text-ink-800')}>
                        {message.body}
                      </p>
                      <p className={cn('mt-1 text-[0.65rem]', mine ? 'text-brand-200' : 'text-ink-400')}>
                        {formatTime(message.createdAt)} · {relativeTime(message.createdAt)}
                        {!mine && message.readAt ? ' · read' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            <div className="border-t border-ink-100 px-4 py-3">
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send();
                }}
                className="flex items-end gap-2"
              >
                <TextArea
                  rows={2}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={`Message ${peer.name}…`}
                  aria-label={`Message ${peer.name}`}
                  className="flex-1"
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button type="submit" disabled={!draft.trim() || sending} loading={sending} icon={<Send className="size-4" aria-hidden />}>
                  Send
                </Button>
              </form>
              {sendError ? <p className="alert alert-error mt-2">{sendError}</p> : null}
              <p className="mt-2 text-xs text-ink-500">
                Enter sends, Shift + Enter starts a new line. Messages stay inside Mama Care and are attached to this care
                relationship.
              </p>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

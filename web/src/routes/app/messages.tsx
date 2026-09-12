import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, RefreshCw, Search, Send } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { useSession } from '@/providers/app-providers';
import { useAsync } from '@/hooks';
import { useToast } from '@/components/ui/toast';
import { ROLE_LABELS, type Message, type MessageThread } from '@/types/domain';
import {
  listThreadMessages,
  listThreads,
  markThreadRead,
  messageablePeople,
  sendDirectMessage,
} from '@/services/messaging/message-service';
import { formatDateTime, relativeTime } from '@/lib/utils';

/**
 * Direct messages.
 *
 * One screen mounted in all three workspaces — the administrator console, the
 * health-worker workspace and the mother's portal. The thread list, the composer
 * and every read receipt come from Firestore through the normal data layer;
 * `firestore.rules` decides which threads an account may open, so a mother can
 * never read another patient's conversation even if she navigates directly.
 */
export default function MessagesPage() {
  const { actor, permissions } = useSession();
  const toast = useToast();
  const [term, setTerm] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [newTo, setNewTo] = useState<string>('');
  const [composing, setComposing] = useState(false);

  const threads = useAsync(() => listThreads(), {});
  const people = useAsync(() => (permissions.canMessageIndividuals ? messageablePeople() : Promise.resolve([])), {});

  const conversation = useAsync(() => (activeId ? listThreadMessages(activeId) : Promise.resolve([] as Message[])), {});
  const runConversation = conversation.run;

  const reload = useCallback(() => {
    void threads.run();
    if (activeId) void runConversation();
  }, [threads, activeId, runConversation]);

  useEffect(() => {
    if (!activeId) return;
    void markThreadRead(activeId)
      .then(() => void threads.run())
      .catch(() => null);
    void runConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const filtered = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const rows = threads.data ?? [];
    if (!needle) return rows;
    return rows.filter((thread) => thread.otherName.toLowerCase().includes(needle) || thread.lastMessage.toLowerCase().includes(needle));
  }, [threads.data, term]);

  const active = (threads.data ?? []).find((thread) => thread.otherId === activeId) ?? null;

  const send = async () => {
    if (!activeId || !draft.trim()) return;
    setSending(true);
    try {
      await sendDirectMessage({ recipientId: activeId, body: draft });
      setDraft('');
      toast.success('Message sent', `${active?.otherName ?? 'The recipient'} will see it in their messages and get a notification.`);
      reload();
    } catch (error) {
      toast.error(error, 'The message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const startNew = async () => {
    if (!newTo || !draft.trim()) return;
    setSending(true);
    try {
      await sendDirectMessage({ recipientId: newTo, body: draft });
      setDraft('');
      setComposing(false);
      setActiveId(newTo);
      setNewTo('');
      toast.success('Message sent', 'The conversation has been started.');
      reload();
    } catch (error) {
      toast.error(error, 'The message could not be sent');
    } finally {
      setSending(false);
    }
  };

  const totalUnread = (threads.data ?? []).reduce((sum, thread) => sum + thread.unread, 0);

  return (
    <AppShell
      title="Messages"
      subtitle={
        totalUnread > 0
          ? `${totalUnread} unread message${totalUnread === 1 ? '' : 's'}`
          : 'Private conversations with the people you work with'
      }
      actions={
        <>
          <Button size="sm" variant="secondary" loading={threads.loading} onClick={reload} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canMessageIndividuals ? (
            <Button
              size="sm"
              onClick={() => {
                setComposing(true);
                setActiveId(null);
              }}
              icon={<MessageSquarePlus className="size-4" aria-hidden />}
            >
              New message
            </Button>
          ) : null}
        </>
      }
    >
      {threads.error ? (
        <div className="mb-4">
          <ErrorState message={threads.error} onRetry={reload} />
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        {/* ── thread list ──────────────────────────────────────────── */}
        <Card title="Conversations" description={threads.data ? `${threads.data.length} thread${threads.data.length === 1 ? '' : 's'}` : undefined} bodyClassName="p-0">
          <div className="border-b border-ink-200 p-3">
            <TextInput value={term} onValueChange={setTerm} placeholder="Search people or messages" leading={<Search className="size-4" aria-hidden />} />
          </div>
          {threads.loading && !threads.data ? (
            <div className="p-3">
              <LoadingRows rows={4} />
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<MessageSquarePlus className="size-5" aria-hidden />}
              title={term ? 'No conversation matches that search' : 'No messages yet'}
              description={
                term
                  ? 'Try a different name or clear the search.'
                  : 'Start a conversation with a colleague, a health worker, or a mother in your care.'
              }
            />
          ) : (
            <ul className="max-h-[32rem] divide-y divide-ink-100 overflow-y-auto">
              {filtered.map((thread) => (
                <li key={thread.threadId}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(thread.otherId);
                      setComposing(false);
                    }}
                    className={`flex w-full items-start gap-3 p-3 text-left transition-colors hover:bg-ink-50 ${
                      activeId === thread.otherId ? 'bg-brand-50/70' : ''
                    }`}
                  >
                    <Avatar name={thread.otherName} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-[0.86rem] font-semibold text-ink-900">{thread.otherName}</p>
                        <span className="micro shrink-0">{relativeTime(thread.lastMessageAt)}</span>
                      </div>
                      <p className="caption mt-0.5">{ROLE_LABELS[thread.otherRole]}</p>
                      <p className="mt-1 line-clamp-2 text-[0.8rem] text-ink-600">{thread.lastMessage}</p>
                    </div>
                    {thread.unread > 0 ? (
                      <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-brand-700 text-[0.68rem] font-bold text-white" aria-label={`${thread.unread} unread`}>
                        {thread.unread}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* ── conversation ─────────────────────────────────────────── */}
        <div className="space-y-4">
          {composing ? (
            <Card title="New message" description="Choose who to write to. Mothers can only be messaged by health workers.">
              <div className="space-y-3">
                <Field label="To">
                  <Select
                    value={newTo}
                    onValueChange={setNewTo}
                    placeholder="Select a person"
                    options={(people.data ?? []).map((person) => ({
                      value: person.id,
                      label: `${person.fullName} · ${ROLE_LABELS[person.role]}`,
                    }))}
                  />
                </Field>
                <Field label="Message">
                  <TextArea rows={5} value={draft} onValueChange={setDraft} placeholder="Write your message." />
                </Field>
                <div className="flex gap-2">
                  <Button loading={sending} disabled={!newTo || !draft.trim()} onClick={() => void startNew()} icon={<Send className="size-4" aria-hidden />}>
                    Send message
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setComposing(false);
                      setDraft('');
                      setNewTo('');
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </Card>
          ) : active ? (
            <Card
              title={active.otherName}
              description={`${ROLE_LABELS[active.otherRole]} · last message ${relativeTime(active.lastMessageAt)}`}
              bodyClassName="p-0"
            >
              <Conversation
                messages={(conversation.data ?? []) as Message[]}
                loading={conversation.loading}
                selfId={actor?.uid ?? ''}
              />
              <div className="border-t border-ink-200 p-3">
                <TextArea
                  rows={3}
                  value={draft}
                  onValueChange={setDraft}
                  placeholder={`Write to ${active.otherName.split(' ')[0] ?? active.otherName}…`}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <p className="caption">Messages are delivered in-app immediately and stored with the record.</p>
                  <Button loading={sending} disabled={!draft.trim()} onClick={() => void send()} icon={<Send className="size-4" aria-hidden />}>
                    Send
                  </Button>
                </div>
              </div>
            </Card>
          ) : (
            <Card>
              <EmptyState
                icon={<MessageSquarePlus className="size-5" aria-hidden />}
                title="Choose a conversation"
                description="Pick someone from the list, or start a new message. Every thread is private to the two people in it."
              />
            </Card>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function Conversation({ messages, loading, selfId }: { messages: Message[]; loading: boolean; selfId: string }) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  if (loading && messages.length === 0) {
    return (
      <div className="p-4">
        <LoadingRows rows={4} />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="p-6">
        <EmptyState title="No messages in this thread yet" description="Write the first one below." />
      </div>
    );
  }

  return (
    <div className="max-h-[26rem] space-y-3 overflow-y-auto p-4">
      {messages.map((message) => {
        const mine = message.senderId === selfId;
        return (
          <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 ${mine ? 'bg-brand-700 text-white' : 'bg-ink-100 text-ink-800'}`}>
              {message.subject ? <p className={`text-[0.78rem] font-semibold ${mine ? 'text-white/90' : 'text-ink-700'}`}>{message.subject}</p> : null}
              <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed">{message.body}</p>
              <div className={`mt-1.5 flex items-center gap-2 text-[0.68rem] ${mine ? 'text-white/75' : 'text-ink-500'}`}>
                <span>{formatDateTime(message.createdAt)}</span>
                {mine ? <span>{message.readAt ? 'Read' : 'Sent'}</span> : null}
              </div>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}

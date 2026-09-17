/**
 * Messages — mother side.
 *
 * Who appears here is decided by the care links: providers she has linked, and
 * supporters she has approved. A provider reached from the public directory can
 * still be messaged (the link arrives as a query parameter), but the honest default
 * is "talk to the people already involved in your care".
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MessageCircle, Stethoscope, UserPlus, Users } from 'lucide-react';
import { useAsync } from '@/hooks';
import { careLinkRepo, supporterRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { MessageCentre, type MessageContact } from '@/components/messages/message-centre';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/display';

export default function MotherMessagesPage() {
  const { actor } = useSession();
  const [params, setParams] = useSearchParams();
  const uid = actor?.uid ?? '';
  const [initialPeer, setInitialPeer] = useState<{ id: string; name: string } | null>(
    params.get('to') ? { id: params.get('to')!, name: params.get('name') ?? 'Provider' } : null,
  );

  const { data: careLinks } = useAsync(() => careLinkRepo.mine(), { deps: [uid], immediate: Boolean(uid) });
  const { data: supporters } = useAsync(() => supporterRepo.list(uid), { deps: [uid], immediate: Boolean(uid) });

  const contacts = useMemo<MessageContact[]>(() => {
    const providers = (careLinks ?? [])
      .filter((link) => link.status !== 'revoked' && link.providerUserId)
      .map((link) => ({
        id: link.providerUserId as string,
        name: link.providerName,
        detail: link.facilityName,
        role: 'PROVIDER' as const,
      }));
    const helpers = (supporters ?? [])
      .filter((link) => link.status === 'active' && link.supporterUserId)
      .map((link) => ({
        id: link.supporterUserId as string,
        name: link.supporterName,
        detail: link.relationship,
        role: 'SUPPORTER' as const,
      }));
    return [...providers, ...helpers];
  }, [careLinks, supporters]);

  useEffect(() => {
    document.title = 'Messages · Mama Care';
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Messages"
        description="Talk to the midwife, nurse or doctor who cares for you, and to a partner or family member you have approved. Conversations stay inside Mama Care."
        actions={
          <Link to="/app/pregnancy" className="btn btn-secondary btn-sm">
            <UserPlus className="size-4" aria-hidden /> Link a provider
          </Link>
        }
      />

      {contacts.length === 0 && !initialPeer ? (
        <Card className="card-pad mb-4">
          <EmptyState
            icon={<Stethoscope className="size-6" aria-hidden />}
            title="Nobody to message yet"
            description="Link the provider who cares for you from the pregnancy tracker, or start a conversation with a provider from the public directory. Supporters you approve also appear here."
            action={
              <div className="actions-wrap justify-center">
                <Link to="/app/pregnancy" className="btn btn-primary btn-sm">
                  Link my provider
                </Link>
                <Link to="/providers" className="btn btn-secondary btn-sm">
                  Browse providers
                </Link>
                <Link to="/app/settings" className="btn btn-ghost btn-sm">
                  Invite a supporter
                </Link>
              </div>
            }
          />
        </Card>
      ) : null}

      <MessageCentre
        contacts={contacts}
        initialPeerId={initialPeer?.id ?? null}
        initialPeerName={initialPeer?.name ?? null}
        emptyTitle="Choose a conversation"
        emptyDescription="Select someone on the left, or link a provider to start a new conversation."
        onOpenChange={(peerId) => {
          setInitialPeer(null);
          if (peerId) setParams({}, { replace: true });
        }}
      />

      <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
          <div>
            <h3 className="card-title">Who can see these messages</h3>
            <p className="mt-1 text-sm text-ink-600">
              Only the two people in the conversation. A provider sees threads with patients who have shared their care;
              an administrator can review messages only where the conduct policy requires it, and that access is logged.
            </p>
            <p className="mt-2 flex items-start gap-2 text-sm text-ink-700">
              <MessageCircle className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
              A thread is never an emergency channel. For bleeding, severe pain, reduced fetal movement or a sick newborn,
              call or go in — then tell your provider afterwards.
            </p>
            <div className="mt-3">
              <Link to="/app/emergency" className="btn btn-danger btn-sm">
                Emergency guidance
              </Link>
            </div>
          </div>
        </div>
      </Card>
    </AppShell>
  );
}

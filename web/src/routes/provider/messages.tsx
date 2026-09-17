/**
 * Provider messaging.
 *
 * The same conversation component the mother uses, with contacts limited to the
 * patients who have an active care link. The banner at the top of every thread is
 * not decoration: messaging is asynchronous, it is not monitored out of hours, and
 * an emergency must go to a facility by phone.
 */

import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquare } from 'lucide-react';
import { useAsync } from '@/hooks';
import { careLinkRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { StaffPageHeader, StaffShell } from '@/components/layout/staff-shell';
import { MessageCentre, type MessageContact } from '@/components/messages/message-centre';
import { Card, SectionHeading } from '@/components/ui/card';
import { LoadingRows } from '@/components/ui/display';

export default function ProviderMessages() {
  const { actor } = useSession();
  const [searchParams] = useSearchParams();
  const uid = actor?.uid ?? '';

  const { data: links, loading } = useAsync(() => careLinkRepo.forProvider(), { deps: [uid], immediate: Boolean(uid) });

  const contacts = useMemo<MessageContact[]>(
    () =>
      (links ?? [])
        .filter((link) => link.status === 'active')
        .map((link) => ({
          id: link.motherUserId,
          name: link.motherName,
          detail: link.facilityName ? `Patient · ${link.facilityName}` : 'Patient in your care',
          role: 'MOTHER' as const,
        })),
    [links],
  );

  useEffect(() => {
    document.title = 'Messages · Mama Care';
  }, []);

  const initialPeer = searchParams.get('to');
  const initialName = searchParams.get('name') ?? undefined;

  return (
    <StaffShell portal="Healthcare Portal">
      <StaffPageHeader
        title="Messages"
        description="Threads with the mothers in your care. A patient can only be messaged while her care link is active."
      />

      {loading ? <LoadingRows rows={3} /> : null}

      {!loading && contacts.length === 0 ? (
        <Card className="card-pad">
          <SectionHeading eyebrow="No threads" title="Nobody to message yet" />
          <p className="mt-2 text-sm text-ink-600">
            Messages open up when a mother links her care to you. Until then there is nobody you are allowed to contact —
            the directory is for patients to choose a provider, not for providers to reach patients.
          </p>
        </Card>
      ) : null}

      <MessageCentre
        contacts={contacts}
        initialPeerId={initialPeer ?? undefined}
        initialPeerName={initialName}
        emptyTitle="Select a patient"
        emptyDescription="Choose a thread on the left. Keep replies factual and short, and never use messages for emergencies — tell a patient in labour to call her facility."
      />

      <Card className="card-pad mt-4 border-ink-200 bg-ink-50">
        <h3 className="card-title flex items-center gap-2">
          <MessageSquare className="size-4 text-brand-700" aria-hidden />
          Ground rules for clinical messaging
        </h3>
        <ul className="checklist mt-2 text-sm">
          <li>Not for emergencies, not for labour, not for a bleeding or fever that needs to be seen today.</li>
          <li>Do not diagnose or change medication in a message — that belongs in a consultation and the facility record.</li>
          <li>Messages are stored against the patient's record and are visible to her at any time.</li>
          <li>Nothing you send here is visible to her supporters unless she shares it herself.</li>
        </ul>
      </Card>
    </StaffShell>
  );
}

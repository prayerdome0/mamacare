/**
 * Provider awaiting verification.
 *
 * A provider whose account exists but whose licence has not been verified yet lands
 * here instead of the portal. The page explains what is being checked, how long it
 * takes, and what to do if it is taking longer than that — and offers a sign-out so
 * a shared device is not left signed in.
 */

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock, LogOut, Mail, ShieldCheck, Stethoscope } from 'lucide-react';
import { useAsync } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { providerRepo } from '@/services/repositories';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { SITE } from '@/config/site-content';

export default function PendingApprovalPage() {
  const { actor, profile, signOut, ready } = useSession();
  const navigate = useNavigate();
  const { data: provider } = useAsync(() => providerRepo.mine(), { deps: [actor?.uid], immediate: Boolean(actor) });

  useEffect(() => {
    document.title = 'Account pending review · Mama Care';
  }, []);

  /* An approved provider should never be parked here. */
  useEffect(() => {
    if (!ready) return;
    if (!actor) {
      navigate('/sign-in', { replace: true });
      return;
    }
    if (actor.status === 'ACTIVE' && actor.role !== 'PROVIDER') navigate('/app', { replace: true });
    if (actor.status === 'ACTIVE' && actor.role === 'PROVIDER') navigate('/provider', { replace: true });
  }, [ready, actor, navigate]);

  const rejected = provider?.status === 'rejected';
  const submittedAt = provider?.createdAt ? formatDate(provider.createdAt) : profile?.createdAt ? formatDate(profile.createdAt) : null;

  const onSignOut = async (): Promise<void> => {
    await signOut();
    navigate('/', { replace: true });
  };

  return (
    <div className="grid min-h-screen place-items-center bg-ink-50 px-5 py-12">
      <div className="w-full max-w-2xl">
        <Card className="card-pad">
          <div className="flex flex-wrap items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <Clock className="size-5" aria-hidden />
            </span>
            <div>
              <h1 className="display-2">Your account is being reviewed</h1>
              <p className="muted mt-0.5">
                {actor?.displayName ?? 'Provider'} · {submittedAt ? `Submitted ${submittedAt}` : 'Submitted'}
              </p>
            </div>
          </div>

          {rejected ? (
            <>
              <div className="mt-5">
                <Badge tone="red">Not approved</Badge>
              </div>
              <p className="mt-3 leading-relaxed text-ink-700">
                An administrator reviewed your application and could not approve it.
                {provider?.rejectionReason ? <> Reason given: <strong>{provider.rejectionReason}</strong>.</> : null}
              </p>
              <p className="mt-3 text-sm text-ink-600">
                If you believe this is a mistake — a typo in your licence number, or documents that did not upload — write to{' '}
                <a href={`mailto:${SITE.org.email}`} className="font-medium text-brand-800 hover:underline">
                  {SITE.org.email}
                </a>{' '}
                with your full name, profession and licence number, and the application will be reviewed again.
              </p>
            </>
          ) : (
            <>
              <div className="mt-5">
                <Badge tone="amber">Pending approval</Badge>
              </div>
              <p className="mt-3 leading-relaxed text-ink-700">
                Your Mama Care account exists, and you can sign in — but the provider portal stays locked until an
                administrator verifies your professional details. This protects the mothers who will share their records
                with you.
              </p>

              <h2 className="card-title mt-6">What is being checked</h2>
              <ul className="checklist mt-2 text-sm">
                <li>Your name, profession and title against the licence or registration number you gave.</li>
                <li>That the facility you named is a real, listed facility.</li>
                <li>That your account was not created to impersonate a health professional.</li>
              </ul>

              <h2 className="card-title mt-6">How long it takes</h2>
              <p className="mt-1 text-sm text-ink-600">
                Usually within two working days ({SITE.org.hours.replace('Support: ', '')}). You will get an email at{' '}
                <strong>{actor?.email ?? 'your registered address'}</strong>, and this page will take you straight to the
                portal once you are approved.
              </p>

              <Card className="card-pad mt-5 border-ink-200 bg-ink-50">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <p className="text-sm text-ink-700">
                    While you wait you can read the education library and browse the facility directory. You cannot view or
                    message patient records — nobody should be able to before verification.
                  </p>
                </div>
              </Card>
            </>
          )}

          <div className="mt-7 flex flex-wrap gap-2">
            <Button variant="secondary" size="sm" onClick={() => void onSignOut()} icon={<LogOut className="size-4" aria-hidden />}>
              Sign out
            </Button>
            <Link to="/learn" className="btn btn-secondary btn-sm">
              Browse the library
            </Link>
            <a href={`mailto:${SITE.org.email}?subject=Provider verification — ${encodeURIComponent(actor?.displayName ?? '')}`} className="btn btn-ghost btn-sm">
              <Mail className="size-4" aria-hidden /> Ask about my application
            </a>
          </div>
        </Card>

        <p className="mt-4 flex items-center justify-center gap-2 text-xs text-ink-500">
          <Stethoscope className="size-3.5" aria-hidden />
          Verification is done by a Mama Care administrator, not automatically.
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Clock, Mail, RefreshCw, ShieldCheck } from 'lucide-react';
import { AuthLayout } from '@/routes/auth/auth-layout';
import { Button, ButtonLink } from '@/components/ui/button';
import { NoticeState } from '@/components/ui/display';
import { KeyValue } from '@/components/ui/card';
import { useSession } from '@/providers/app-providers';
import { useToast } from '@/components/ui/toast';

/**
 * The waiting room for a health-worker account that has been created but not yet
 * approved. It is reachable by navigation as well as by the route guard, so the
 * wording explains what is and is not visible at this stage.
 */
export default function PendingApprovalPage() {
  const { actor, refresh, signOut, providerKind } = useSession();
  const toast = useToast();
  const location = useLocation();
  const [checking, setChecking] = useState(false);
  const email = (location.state as { email?: string } | null)?.email ?? actor?.email ?? null;

  const recheck = async () => {
    setChecking(true);
    try {
      await refresh();
      toast.info('Status re-checked');
    } finally {
      setChecking(false);
    }
  };

  return (
    <AuthLayout
      title="Your account is awaiting approval"
      intro="The account exists, but no patient record is visible to it yet. A supervisor or administrator at your facility confirms access."
      image="communityWorker"
      panelTitle="What happens while you wait"
      panelPoints={[
        { label: 'Nothing is readable', detail: 'A pending account cannot open a mother record, an alert, a referral or a report — the rules deny it, not just the menu.' },
        { label: 'Your profile is safe', detail: 'You can see and correct your own details; the approval step only sets your role and facility.' },
        { label: 'Approval is audited', detail: 'Who approved you, for which role and facility, and when, is written to the audit log.' },
      ]}
      footer={
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ButtonLink to="/" variant="ghost" size="sm">
            Back to the public site
          </ButtonLink>
          <button type="button" onClick={() => void signOut()} className="text-[0.82rem] font-semibold text-ink-500 hover:text-ink-800">
            Sign out
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <NoticeState tone="info" title="Nothing to do but wait — or nudge">
          Ask a colleague with supervisor access to open <strong className="font-semibold">Admin → Users</strong> and approve your account.
          If you have the administrator’s contact, forward the email address below.
        </NoticeState>

        <div className="card p-5">
          <KeyValue
            columns={1}
            items={[
              { label: 'Signed-in account', value: email ?? 'Not signed in', tone: 'strong' },
              { label: 'Requested role', value: actor?.role ? actor.role.replace(/_/g, ' ') : 'Health worker' },
              { label: 'Facility', value: actor?.facilityId ? 'Assigned by your registration' : 'Not yet assigned' },
              { label: 'Status', value: <span className="inline-flex items-center gap-1.5 font-semibold text-[var(--color-risk-amber-text)]"><Clock className="size-3.5" aria-hidden />Pending approval</span> },
              { label: 'Storage mode', value: providerKind === 'local' ? 'Device (evaluation build)' : 'Firebase project' },
            ]}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void recheck()} loading={checking} icon={<RefreshCw className="size-4" aria-hidden />}>
            Check again
          </Button>
          {email ? (
            <a className="btn btn-secondary" href={`mailto:?subject=${encodeURIComponent('MAMA CARE account approval needed')}&body=${encodeURIComponent(`Please approve this MAMA CARE account:\n\n${email}`)}`}>
              <Mail className="size-4" aria-hidden />
              Email an administrator
            </a>
          ) : null}
        </div>

        {providerKind === 'local' ? (
          <div className="card border-[var(--color-risk-amber-border)] bg-[var(--color-risk-amber-soft)]/60 p-5">
            <p className="micro mb-1.5 flex items-center gap-1.5 text-[var(--color-risk-amber-text)]">
              <ShieldCheck className="size-3.5" aria-hidden />
              Evaluation build
            </p>
            <p className="muted">
              In device mode there is no administrator yet on a fresh device. Sign in with the seeded administrator account (
              <span className="font-semibold text-ink-800">admin@mamacare.health</span>), open <Link to="/admin/users" className="font-semibold text-brand-800 hover:underline">Users</Link>, and
              approve this account — or add your email to <code className="rounded bg-white px-1 py-0.5 text-[0.78rem]">VITE_LOCAL_ADMIN_EMAILS</code> and claim
              administrator access from your profile page.
            </p>
          </div>
        ) : null}
      </div>
    </AuthLayout>
  );
}

import { useEffect, type ReactNode } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ShieldQuestion } from 'lucide-react';
import { useSession } from '@/providers/app-providers';
import { PublicShell } from '@/components/layout/public-shell';
import { ButtonLink } from '@/components/ui/button';
import { Wordmark } from '@/components/layout/wordmark';
import type { Role } from '@/types/domain';

/** Full-screen boot state. Never a spinner on a blank page — the brand holds it. */
export function BootScreen({ message = 'Loading your workspace…' }: { message?: string }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-white px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
        <Wordmark size="lg" />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-ink-200">
          <div className="h-full w-1/2 animate-[boot-slide_1.1s_ease-in-out_infinite] rounded-full bg-brand-600" />
        </div>
        <p className="muted">{message}</p>
      </div>
    </div>
  );
}

export function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { status, actor, ready } = useSession();
  const location = useLocation();

  if (status === 'initialising' || !ready) return <BootScreen />;
  if (!actor) return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  if (actor.accountStatus === 'PENDING_APPROVAL') return <Navigate to="/pending-approval" replace />;
  if (actor.accountStatus === 'SUSPENDED') return <SuspendedScreen />;
  if (roles && !roles.includes(actor.role)) return <Navigate to="/forbidden" replace />;
  return <>{children}</>;
}

/** Mothers land on their own portal; staff land on the workspace; admins on /admin. */
export function LandingRedirect() {
  const { actor, status } = useSession();
  if (status === 'initialising') return <BootScreen />;
  if (!actor) return <Navigate to="/signin" replace />;
  if (actor.accountStatus === 'PENDING_APPROVAL') return <Navigate to="/pending-approval" replace />;
  if (actor.role === 'MOTHER') return <Navigate to="/home" replace />;
  if (actor.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/app" replace />;
}

export function WorkspaceRedirect() {
  const { actor, status } = useSession();
  if (status === 'initialising') return <BootScreen />;
  if (!actor) return <Navigate to="/signin" replace />;
  if (actor.role === 'MOTHER') return <Navigate to="/home" replace />;
  return <>{null}</>;
}

export function RequireStaff({ children }: { children: ReactNode }) {
  const gate = <RequireAuth roles={['ADMIN', 'FACILITY_SUPERVISOR', 'MIDWIFE', 'NURSE', 'COMMUNITY_HEALTH_WORKER']}>{children}</RequireAuth>;
  const motherRedirect = <WorkspaceRedirect />;
  const { actor } = useSession();
  return actor?.role === 'MOTHER' ? motherRedirect : gate;
}

export function RequireGuest({ children }: { children: ReactNode }) {
  const { actor, status } = useSession();
  if (status === 'initialising') return <BootScreen />;
  if (!actor) return <>{children}</>;
  return <Navigate to={actor.accountStatus === 'PENDING_APPROVAL' ? '/pending-approval' : actor.role === 'MOTHER' ? '/home' : actor.role === 'ADMIN' ? '/admin' : '/app'} replace />;
}

function SuspendedScreen() {
  return (
    <PublicShell>
      <div className="shell py-24">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <span className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-[var(--color-risk-red-soft)] text-[var(--color-risk-red)]">
            <ShieldQuestion className="size-5" aria-hidden />
          </span>
          <h1 className="display-2">This account is deactivated</h1>
          <p className="muted mx-auto mt-3 max-w-sm">
            Access to MAMA CARE has been withdrawn for this account. Records that were created under it stay with the facility and remain
            auditable. Contact your facility administrator or the platform support address to discuss reinstatement.
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <ButtonLink to="/signin" variant="secondary">Back to sign in</ButtonLink>
            <ButtonLink to="/contact">Contact support</ButtonLink>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export function ForbiddenPage() {
  const { actor } = useSession();
  return (
    <PublicShell>
      <div className="shell py-24">
        <div className="card mx-auto max-w-lg p-8">
          <p className="section-eyebrow">403 — not permitted</p>
          <h1 className="display-2 mt-2">You do not have access to this area</h1>
          <p className="muted mt-3">
            This is enforced by the record-level permission rules, not only by the menu. {actor ? `Your account is signed in as ${actor.role.replace(/_/g, ' ').toLowerCase()}` : 'You are signed out'}
            {actor?.facilityId ? ' at one facility' : ''}. Ask an administrator if you believe you need this access; every request you make is auditable.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <ButtonLink to={actor?.role === 'MOTHER' ? '/home' : actor ? '/app' : '/signin'}>
              {actor ? 'Back to my workspace' : 'Sign in'}
            </ButtonLink>
            <ButtonLink to="/contact" variant="secondary">Request access</ButtonLink>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

export function NotFoundPage() {
  return (
    <PublicShell>
      <div className="shell py-24">
        <div className="card mx-auto max-w-lg p-8">
          <p className="section-eyebrow">404 — not found</p>
          <h1 className="display-2 mt-2">This page does not exist</h1>
          <p className="muted mt-3">The link may be out of date, or a record may have been removed. Try one of these instead:</p>
          <ul className="muted mt-4 space-y-1.5 text-sm">
            <li><Link to="/" className="font-semibold text-brand-800 hover:underline">Public home</Link></li>
            <li><Link to="/maternal-health" className="font-semibold text-brand-800 hover:underline">Maternal health information</Link></li>
            <li><Link to="/emergency" className="font-semibold text-brand-800 hover:underline">Emergency guidance</Link></li>
            <li><Link to="/signin" className="font-semibold text-brand-800 hover:underline">Staff sign in</Link></li>
          </ul>
        </div>
      </div>
    </PublicShell>
  );
}

export function ServerErrorPage({ error, onRetry }: { error?: Error | null; onRetry?: () => void }) {
  return (
    <PublicShell>
      <div className="shell py-24">
        <div className="card mx-auto max-w-lg p-8">
          <p className="section-eyebrow">500 — unexpected error</p>
          <h1 className="display-2 mt-2">Something broke while loading this screen</h1>
          <p className="muted mt-3">
            Your saved records are unaffected. Reload to continue; if the problem persists, note the time and tell your administrator so it can
            be traced in the audit and server logs.
          </p>
          {error?.message ? (
            <pre className="mt-4 overflow-x-auto rounded-lg bg-ink-100 p-3 text-[0.72rem] leading-relaxed text-ink-600">{error.message}</pre>
          ) : null}
          <div className="mt-6 flex flex-wrap gap-2">
            {onRetry ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>
                Reload
              </button>
            ) : null}
            <Link to="/" className="btn btn-secondary btn-sm">
              Back to the public site
            </Link>
          </div>
        </div>
      </div>
    </PublicShell>
  );
}

/** Scrolls to a #hash target after the public page has painted. */
export function useHashScroll(): void {
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, [hash]);
}

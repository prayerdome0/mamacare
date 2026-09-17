/**
 * Route guards.
 *
 * Guards decide *where* you land, never *what you may read* — that is the policy
 * module and the database rules. A provider who types `/app/pregnancy` is sent to
 * their own portal; they are not shown a mother's screen, and they cannot read her
 * records either way.
 */

import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { useSession } from '@/providers/app-providers';
import type { Role } from '@/types/domain';

export const homeForRole = (role: Role | null | undefined): string => {
  switch (role) {
    case 'ADMIN':
      return '/admin';
    case 'FACILITY_ADMIN':
      return '/admin';
    case 'PROVIDER':
      return '/provider';
    case 'SUPPORTER':
      return '/app';
    case 'MOTHER':
      return '/app';
    default:
      return '/';
  }
};

export function FullPageSpinner({ label = 'Loading Mama Care' }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3" role="status" aria-live="polite">
      <Loader2 className="size-7 animate-spin text-brand-700" aria-hidden />
      <p className="text-sm text-ink-500">{label}…</p>
    </div>
  );
}

export function RequireAuth({
  roles,
  children,
}: {
  roles?: Role[];
  children: ReactNode;
}) {
  const { actor, ready } = useSession();
  const location = useLocation();

  if (!ready) return <FullPageSpinner label="Checking your session" />;
  if (!actor) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname + location.search }} />;
  }
  // A provider waiting for verification lands on the holding page, not the portal.
  if (actor.role === 'PROVIDER' && actor.status === 'PENDING_APPROVAL' && location.pathname !== '/pending') {
    return <Navigate to="/pending" replace />;
  }
  if (roles && !roles.includes(actor.role)) return <Navigate to={homeForRole(actor.role)} replace />;
  return <>{children}</>;
}

/** Keeps signed-in users out of the sign-in and registration screens. */
export function RedirectIfSignedIn({ children }: { children: ReactNode }) {
  const { actor, ready } = useSession();
  const location = useLocation();
  if (!ready) return <FullPageSpinner />;
  if (actor) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={from ?? homeForRole(actor.role)} replace />;
  }
  return <>{children}</>;
}

/** Guards the two staff portals. */
export const RequireProvider = ({ children }: { children: ReactNode }) => (
  <RequireAuth roles={['PROVIDER', 'FACILITY_ADMIN', 'ADMIN']}>{children}</RequireAuth>
);

export const RequireAdmin = ({ children }: { children: ReactNode }) => (
  <RequireAuth roles={['ADMIN', 'FACILITY_ADMIN']}>{children}</RequireAuth>
);

export const RequireSystemAdmin = ({ children }: { children: ReactNode }) => <RequireAuth roles={['ADMIN']}>{children}</RequireAuth>;

/** Mother-facing screens: mothers, and supporters with limited visibility. */
export const RequireMother = ({ children }: { children: ReactNode }) => (
  <RequireAuth roles={['MOTHER', 'SUPPORTER']}>{children}</RequireAuth>
);

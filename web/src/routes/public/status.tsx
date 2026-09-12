import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Check, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { PublicShell, PublicSection } from '@/components/layout/public-shell';
import { Button } from '@/components/ui/button';
import { Badge, NoticeState } from '@/components/ui/display';
import { app, dataProvider, environmentChecks, integrations, misconfigured } from '@/config/env';
import { storageAvailable } from '@/lib/storage';
import { useSession } from '@/providers/app-providers';
import { ROLE_LABELS } from '@/types/domain';

/**
 * Service status.
 *
 * A deliberately public page so a deployment can be checked from a phone: which
 * integrations are configured, which environment variables are still missing,
 * which data provider this build is using, and — for a signed-in account — which
 * role the database has stored for it, with a button to re-read it.
 *
 * It shows *presence*, never values: `VITE_*` variables are public by design, and
 * nothing secret is read here at all (all secrets live on the API service).
 */
export default function StatusPage() {
  const { actor, providerKind, configurationError, syncRole } = useSession();
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const checks = environmentChecks();

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await syncRole();
      setSyncResult(
        result.synced
          ? 'The session now matches the role stored in the database.'
          : result.reason ?? 'The stored role could not be copied into the session.',
      );
    } catch {
      setSyncResult('The privileged service could not be reached from this browser.');
    } finally {
      setSyncing(false);
    }
  }, [syncRole]);

  return (
    <PublicShell>
      <PublicSection
        eyebrow="Diagnostics"
        title="Service status"
        description="What this deployment is running with. Useful when sign-in or uploads behave unexpectedly: it names the missing configuration instead of hiding it."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="card p-5">
            <h2 className="h3">Deployment</h2>
            <dl className="mt-3 space-y-2.5 text-[0.86rem]">
              <Row label="Application" value={`${app.name} · ${app.env}`} />
              <Row
                label="Data provider"
                value={
                  <span className="inline-flex items-center gap-2">
                    <span className="font-semibold">{dataProvider === 'firebase' ? 'Cloud Firestore' : 'This device (IndexedDB)'}</span>
                    <Badge tone={dataProvider === 'firebase' ? 'green' : 'amber'}>{providerKind}</Badge>
                  </span>
                }
              />
              <Row label="Browser storage" value={storageAvailable() ? 'Available' : 'Blocked — session lasts for this tab only'} />
              <Row label="Public URL" value={window.location.origin} />
              <Row label="Default country" value={`${app.defaultCountry} · ${app.defaultCurrency} · ${app.defaultDialCode}`} />
            </dl>
            {misconfigured || configurationError ? (
              <NoticeState tone="warning" title="Configuration problem" className="mt-4">
                {configurationError ??
                  'VITE_DATA_PROVIDER is pinned to firebase but the Firebase keys are incomplete. The build is running on device storage.'}
              </NoticeState>
            ) : null}
          </div>

          <div className="card p-5">
            <h2 className="h3">Integrations</h2>
            <dl className="mt-3 space-y-2.5 text-[0.86rem]">
              <Row
                label="Firebase project"
                value={
                  integrations.firebase.configured ? (
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-risk-green-text)]">
                      <Check className="size-3.5" aria-hidden /> configured{integrations.firebase.projectId ? ` (${integrations.firebase.projectId})` : ''}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[var(--color-risk-amber-text)]">
                      <AlertTriangle className="size-3.5" aria-hidden /> not configured
                    </span>
                  )
                }
              />
              <Row
                label="Media (Cloudinary)"
                value={integrations.cloudinary.configured ? 'Configured' : 'Not configured — uploads stay on this device'}
              />
              <Row label="Browser push" value={integrations.push.configured ? 'Configured' : 'Not configured'} />
              <Row label="Privileged API service" value={providerKind === 'firebase' ? 'Expected at /api' : 'Not used in device mode'} />
            </dl>

            <h3 className="h3 mt-5">Environment variables</h3>
            <ul className="mt-2 space-y-1.5 text-[0.82rem]">
              {checks.map((check) => (
                <li key={check.key} className="flex items-start gap-2">
                  <span className="mt-0.5" aria-hidden>
                    {check.present ? (
                      <Check className="size-3.5 text-[var(--color-risk-green-text)]" />
                    ) : (
                      <X className="size-3.5 text-ink-400" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <code className="break-all text-[0.78rem] font-semibold text-ink-800">{check.key}</code>
                    <span className="block text-ink-500">{check.purpose}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="caption mt-3">
              Values are never displayed. Missing variables are simply named, so whoever administers the deployment knows exactly what to add.
            </p>
          </div>
        </div>

        <div className="card mt-5 p-5">
          <h2 className="h3">Your session</h2>
          {actor ? (
            <>
              <dl className="mt-3 grid gap-2.5 text-[0.86rem] sm:grid-cols-2">
                <Row label="Signed in as" value={actor.email || actor.uid} />
                <Row label="Stored role" value={`${ROLE_LABELS[actor.role] ?? actor.role} (${actor.roleSource ?? 'unknown source'})`} />
                <Row label="Account status" value={actor.accountStatus.replace(/_/g, ' ').toLowerCase()} />
                <Row label="Facility" value={actor.facilityId ?? 'Not assigned'} />
              </dl>
              {actor.claimSyncNotice ? (
                <NoticeState tone="warning" title="Session role is not confirmed" className="mt-4">
                  {actor.claimSyncNotice}
                </NoticeState>
              ) : null}
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={syncing}
                  onClick={() => void runSync()}
                  icon={<RefreshCw className="size-3.5" aria-hidden />}
                >
                  Re-read my role from the database
                </Button>
                {syncResult ? <p className="muted text-[0.82rem]">{syncResult}</p> : null}
              </div>
              <p className="caption mt-3">
                Role changes are made by an administrator in the database. This button only copies the stored role into the current session; it
                cannot grant anything the database does not already say.
              </p>
            </>
          ) : (
            <p className="muted mt-2">
              You are signed out. <Link to="/signin" className="font-semibold text-brand-800 hover:underline">Sign in</Link> to see which role the
              database holds for your account, or <Link to="/register" className="font-semibold text-brand-800 hover:underline">create an account</Link> —
              registration is open to everyone.
            </p>
          )}
        </div>

        <NoticeState tone="info" title="How to read this page" className="mt-5">
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Device mode is a complete application running against this browser, not an error state: it is what makes the workflow demonstrable
              before a Firebase project exists. When the Firebase variables are present the same screens read and write Cloud Firestore, and the
              database security rules become the enforcement layer.
            </span>
          </span>
        </NoticeState>
      </PublicSection>
    </PublicShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-ink-100 pb-1.5 last:border-0">
      <dt className="text-ink-500">{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-ink-800">{value}</dd>
    </div>
  );
}

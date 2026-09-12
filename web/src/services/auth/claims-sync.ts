/**
 * Claim synchronisation.
 *
 * `users/{uid}.role` is the stored, human-editable role (an administrator can
 * change it in the Firebase console or from the admin console). Firestore custom
 * claims are the copy that `firestore.rules` and the API service enforce, and
 * only the API service can mint them.
 *
 * When the two disagree — the normal case right after someone is made an
 * administrator in the console — the client asks the API service to re-mint the
 * claims from the document (the service re-reads the document with the Admin
 * SDK, so the browser cannot influence the outcome) and then refreshes the ID
 * token.
 *
 * This is best-effort by design: a deployment without the API service still
 * shows the role stored in Firestore, and the interface says that privileged
 * server operations are unavailable rather than silently pretending otherwise.
 */

import { api } from '@/services/api/client';
import { logProviderError } from '@/lib/errors';
import type { Role } from '@/types/domain';

export interface ClaimSyncResult {
  /** True when the session token now matches the stored document. */
  synced: boolean;
  role: Role | null;
  /** Why the sync did not happen — shown to administrators, never invented. */
  reason: string | null;
}

let inFlight: Promise<ClaimSyncResult> | null = null;
let lastAttemptAt = 0;
const RETRY_AFTER_MS = 60_000;

/**
 * Asks the API service to align this account's claims with its Firestore
 * document. Coalesced so several screens mounting at once produce one request,
 * and rate limited so a deployment without the API service is not hammered on
 * every navigation.
 */
export async function syncClaimsFromDocument(options: { force?: boolean } = {}): Promise<ClaimSyncResult> {
  if (inFlight) return inFlight;
  const now = Date.now();
  if (!options.force && now - lastAttemptAt < RETRY_AFTER_MS) {
    return { synced: false, role: null, reason: 'Checked recently.' };
  }
  lastAttemptAt = now;

  inFlight = (async (): Promise<ClaimSyncResult> => {
    try {
      const response = await api.request<{ synced?: boolean; role?: string; reason?: string }>('/auth/sync-claims', {
        method: 'POST',
        body: {},
        timeoutMs: 10_000,
      });
      return {
        synced: response?.synced === true,
        role: (response?.role as Role | undefined) ?? null,
        reason: response?.reason ?? null,
      };
    } catch (error) {
      logProviderError('claims sync', error);
      return {
        synced: false,
        role: null,
        reason: 'The privileged API service is not reachable from this deployment, so stored roles cannot be copied into the session token yet.',
      };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test seam. */
export const __resetClaimSyncState = (): void => {
  inFlight = null;
  lastAttemptAt = 0;
};

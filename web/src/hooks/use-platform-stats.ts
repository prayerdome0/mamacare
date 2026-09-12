/**
 * Public platform statistics.
 *
 * Counts real rows through the normal data layer — nothing is invented, and the
 * component that renders them states where the numbers came from:
 *
 *  • `live`         — read from the configured project (Firestore).
 *  • `device`       — read from this browser's device store (no project configured),
 *                     i.e. the demonstration dataset, clearly labelled as such.
 *  • `unavailable`  — the query was refused or failed; the caller shows the
 *                     clinical reference facts instead of a fake number.
 *
 * The public site may only read what the database allows an unauthenticated
 * visitor to read: the facility directory is public by design, clinical
 * collections are not. So a signed-out visitor sees the facility count, and a
 * signed-in user additionally sees the counts their role already permits.
 */

import { useEffect, useState } from 'react';
import { services } from '@/services/session-store';
import { useActor } from '@/hooks';
import type { CollectionName } from '@/services/data/contract';

export interface PlatformStats {
  source: 'live' | 'device' | 'unavailable';
  loading: boolean;
  facilities: number | null;
  healthWorkers: number | null;
  mothers: number | null;
  visits: number | null;
  education: number | null;
  /** Epoch ms of the read — shown as "as at". */
  asAt: number | null;
}

const EMPTY: PlatformStats = {
  source: 'unavailable',
  loading: true,
  facilities: null,
  healthWorkers: null,
  mothers: null,
  visits: null,
  education: null,
  asAt: null,
};

async function count(name: CollectionName): Promise<number | null> {
  try {
    const result = await services().provider.list(name, { limit: 1000 }, services().getState().actor);
    return result.rows.length;
  } catch {
    // A collection this visitor may not read simply has no public number.
    return null;
  }
}

export function usePlatformStats(options: { includeClinical?: boolean } = {}): PlatformStats {
  const actor = useActor();
  const [stats, setStats] = useState<PlatformStats>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const registry = services();
      const source: PlatformStats['source'] = registry.provider.kind === 'firebase' ? 'live' : 'device';

      // The facility directory is world-readable in every deployment, so this is
      // the one number an anonymous visitor can see truthfully.
      const facilities = await count('facilities');

      const [healthWorkers, mothers, visits, education] = options.includeClinical && actor
        ? await Promise.all([count('users' as CollectionName), count('mothers'), count('anc_visits'), count('education')])
        : [null, null, null, null];

      if (cancelled) return;
      setStats({
        source: facilities === null && healthWorkers === null ? 'unavailable' : source,
        loading: false,
        facilities,
        healthWorkers,
        mothers,
        visits,
        education,
        asAt: Date.now(),
      });
    };
    void run().catch(() => {
      if (!cancelled) setStats({ ...EMPTY, loading: false });
    });
    return () => {
      cancelled = true;
    };
  }, [actor, options.includeClinical]);

  return stats;
}

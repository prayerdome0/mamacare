import { useEffect, useRef } from 'react';
import { services } from '@/services/session-store';
import { CLINICAL_ROLES, type Role } from '@/types/domain';
import { safeLocal } from '@/lib/storage';

/**
 * Automatic maternity-review reminders.
 *
 * The authoritative sweep is the scheduled Cloud Function (`reminderSweep`),
 * which runs every morning whether or not anybody is signed in. This hook is
 * the second line: whenever a clinician has the app open it re-runs the same
 * pass, so a review that fell due during the day is handled immediately, and a
 * device that was offline all morning catches up the moment it reconnects.
 *
 * It is safe to run often — every write is keyed per appointment and lead, so
 * overlapping passes never send a mother the same reminder twice. A local
 * marker keeps two tabs from racing within the same minute.
 */

const INTERVAL_MS = 15 * 60_000;
const MIN_GAP_MS = 5 * 60_000;
const LAST_RUN_KEY = 'mamacare.reminders.last-run';

export function useReminderScheduler(role: Role | undefined, enabled = true): void {
  const running = useRef(false);

  useEffect(() => {
    if (!enabled || !role || !CLINICAL_ROLES.includes(role)) return;

    const pass = async (reason: string): Promise<void> => {
      if (running.current) return;
      const last = Number(safeLocal.get(LAST_RUN_KEY) ?? '0');
      if (Date.now() - last < MIN_GAP_MS) return;
      running.current = true;
      try {
        const registry = services();
        const actor = registry.actorRef();
        if (!actor) return;
        const result = await registry.data.runReminderPass(actor.facilityId);
        safeLocal.set(LAST_RUN_KEY, String(Date.now()));
        if (result.missed > 0 || result.reminders > 0) {
          console.info(
            `[mamacare] reminders (${reason}): ${result.missed} marked missed, ${result.reminders} reminder(s) sent.`,
          );
        }
      } catch {
        // A reminder pass must never take the workspace down. The scheduled
        // function will pick the work up; the next interval tries again.
      } finally {
        running.current = false;
      }
    };

    void pass('session start');

    const timer = window.setInterval(() => void pass('interval'), INTERVAL_MS);
    const onOnline = (): void => void pass('back online');
    const onVisible = (): void => {
      if (document.visibilityState === 'visible') void pass('tab focused');
    };

    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [role, enabled]);
}

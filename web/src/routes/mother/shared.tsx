import { Link } from 'react-router-dom';
import { AlertTriangle, Phone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EMERGENCY_CONTACTS, PUBLIC_DANGER_SIGNS } from '@/config/site-content';
import { telHref } from '@/lib/utils';
import { useSession } from '@/providers/app-providers';
import { services } from '@/services/session-store';
import { useAsync } from '@/hooks';

/** Plain-language emergency guidance, always one tap away in the mother’s portal. */
export function DangerSignsCard({ compact }: { compact?: boolean }) {
  const signs = compact ? PUBLIC_DANGER_SIGNS.slice(0, 5) : PUBLIC_DANGER_SIGNS;
  return (
    <Card
      title="Go to the facility now if you have"
      description="These are signs that you or your baby need to be seen today. Do not wait for your next appointment."
      actions={
        <a href={telHref(EMERGENCY_CONTACTS.emergency)} className="btn btn-danger btn-sm inline-flex items-center gap-1.5">
          <Phone className="size-4" aria-hidden /> Call {EMERGENCY_CONTACTS.emergency}
        </a>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {signs.map((sign) => (
          <li key={sign.key} className="flex items-start gap-2 rounded-lg border border-ink-200 p-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--color-risk-amber)]" aria-hidden />
            <div>
              <p className="text-[0.86rem] font-semibold text-ink-900">{sign.title}</p>
              <p className="caption mt-0.5">{sign.detail}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="caption mt-3">
        If you cannot reach the facility yourself, call the number above and ask for an ambulance, or send someone with you. Going to be seen and being told
        everything is fine is always the right choice.
      </p>
    </Card>
  );
}

/**
 * The mother’s own record. The id comes from her session claims — never from the
 * address bar — and the data layer only returns rows belonging to her.
 */
export function useMotherRecord() {
  const { actor } = useSession();
  const motherId = actor?.motherId ?? null;
  const chart = useAsync(async () => {
    if (!motherId) return null;
    return services().data.motherChart(motherId);
  }, { deps: [motherId] });
  const overview = useAsync(async () => {
    if (!motherId) return null;
    const { motherOverview } = await import('@/services/dashboard/dashboard-service');
    return motherOverview(motherId);
  }, { deps: [motherId] });

  return { motherId, chart, overview, linkTo: (path: string) => `/home${path}` };
}

export function NoRecordNotice() {
  return (
    <Card>
      <p className="text-[0.9rem] leading-relaxed text-ink-700">
        Your login is not linked to a mother’s record yet. Ask the midwife or nurse at your clinic to connect it — they do that when they register you, and it
        keeps your record private to you.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to="/home/profile" className="btn btn-secondary btn-sm">
          Check my account details
        </Link>
        {EMERGENCY_CONTACTS.facilityLine ? (
          <a href={telHref(EMERGENCY_CONTACTS.facilityLine)} className="btn btn-quiet btn-sm">
            Call your clinic
          </a>
        ) : null}
      </div>
    </Card>
  );
}

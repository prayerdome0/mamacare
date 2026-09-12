import { useMemo, useState } from 'react';
import { AlertTriangle, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card, StatCard } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, ErrorState, LoadingRows, NoticeState } from '@/components/ui/display';
import { SearchInput, Select } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/tabs';
import { AlertCard } from '@/components/clinical/alert-card';
import { useSession } from '@/providers/app-providers';
import { useDebouncedValue, useLiveQuery } from '@/hooks';
import { formatDate, relativeTime } from '@/lib/utils';
import { DEFAULT_ALERT_RULES, RULES_VERSION } from '@/services/clinical/rules';
import { rulesRequireSignOff } from '@/services/clinical/alert-engine';
import type { ClinicalAlert } from '@/types/domain';
import { AlertDialog } from '@/routes/app/alert-dialog';

/**
 * The alert register. Open alerts are grouped by severity, oldest first for RED,
 * and every response is written back through the data layer so the audit trail
 * and the mother's record stay in step.
 */
export default function AlertsPage() {
  const { link: navLink } = useNavScope();
  const { actor, permissions } = useSession();
  const [scope, setScope] = useState<'open' | 'today' | 'all'>('open');
  const [level, setLevel] = useState<'ALL' | 'RED' | 'AMBER' | 'GREEN'>('ALL');
  const [term, setTerm] = useState('');
  const [raising, setRaising] = useState(false);
  const search = useDebouncedValue(term, 200);

  const facilityFilter =
    actor?.role === 'ADMIN' ? [] : actor?.facilityId ? [{ field: 'facilityId', op: '==' as const, value: actor.facilityId }] : [];

  const live = useLiveQuery('alerts', {
    where: facilityFilter,
    orderBy: { field: 'openedAt', direction: 'desc' },
    limit: 300,
  });

  const todayStart = formatDate(new Date());

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (live.data as ClinicalAlert[]).filter((alert) => {
      if (scope === 'open' && alert.status === 'RESOLVED') return false;
      if (scope === 'today' && formatDate(alert.openedAt) !== todayStart) return false;
      if (level !== 'ALL' && alert.level !== level) return false;
      if (needle && !`${alert.motherName} ${alert.patientId} ${alert.title}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [live.data, scope, level, search, todayStart]);

  const counts = useMemo(() => {
    const all = live.data as ClinicalAlert[];
    const open = all.filter((row) => row.status !== 'RESOLVED');
    return {
      open: open.length,
      red: open.filter((row) => row.level === 'RED').length,
      amber: open.filter((row) => row.level === 'AMBER').length,
      resolvedToday: all.filter((row) => row.status === 'RESOLVED' && formatDate(row.resolvedAt ?? row.openedAt) === todayStart).length,
    };
  }, [live.data, todayStart]);

  const grouped = useMemo(
    () => ({
      red: rows.filter((row) => row.level === 'RED' && row.status !== 'RESOLVED'),
      amber: rows.filter((row) => row.level === 'AMBER' && row.status !== 'RESOLVED'),
      rest: rows.filter((row) => row.level === 'GREEN' || row.status === 'RESOLVED'),
    }),
    [rows],
  );

  const oldestRed = grouped.red[grouped.red.length - 1] ?? null;

  return (
    <AppShell
      title="Alerts"
      subtitle={
        counts.open > 0
          ? `${counts.red} red · ${counts.amber} amber unresolved${oldestRed ? ` · oldest red opened ${relativeTime(oldestRed.openedAt)}` : ''}`
          : 'No unresolved alerts in your scope'
      }
      actions={
        <>
          <Button size="sm" variant="secondary" loading={live.loading} onClick={() => void live.refresh()} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canCreateAlert ? (
            <Button size="sm" onClick={() => setRaising(true)} icon={<Plus className="size-4" aria-hidden />}>
              Raise alert
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Unresolved" value={counts.open} hint="Across your access scope" tone={counts.red > 0 ? 'red' : 'green'} icon={<AlertTriangle className="size-4" aria-hidden />} />
        <StatCard label="Red" value={counts.red} hint="Assessment within 30 minutes" tone={counts.red > 0 ? 'red' : 'default'} />
        <StatCard label="Amber" value={counts.amber} hint="Assessment within 24 hours" tone={counts.amber > 0 ? 'amber' : 'default'} />
        <StatCard label="Closed today" value={counts.resolvedToday} hint="With a documented action" tone="default" icon={<ShieldCheck className="size-4" aria-hidden />} />
      </div>

      {rulesRequireSignOff(DEFAULT_ALERT_RULES) ? (
        <div className="mb-4">
          <NoticeState tone="warning" title="Alert rules are not clinically signed off" compact>
            {`Rule set v${RULES_VERSION} (${DEFAULT_ALERT_RULES.length} rules) is a configurable starting point. An administrator must record a reviewer and date in Admin →
            Settings before these thresholds are used for real clinical decisions. Alerts never state a diagnosis — they ask for an assessment.`}
          </NoticeState>
        </div>
      ) : null}

      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl
            ariaLabel="Alert scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'open', label: 'Unresolved' },
              { value: 'today', label: 'Opened today' },
              { value: 'all', label: 'All' },
            ]}
          />
          <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
            <SearchInput value={term} onValueChange={setTerm} placeholder="Search mother, patient ID or title" className="min-w-[13rem] max-w-sm flex-1" />
            <Select
              value={level}
              className="w-36"
              options={[
                { value: 'ALL', label: 'Any level' },
                { value: 'RED', label: 'Red only' },
                { value: 'AMBER', label: 'Amber only' },
                { value: 'GREEN', label: 'Green only' },
              ]}
              onValueChange={(value) => setLevel(value as typeof level)}
            />
          </div>
        </div>
      </Card>

      {live.error ? <div className="mb-4"><ErrorState message={live.error} onRetry={() => void live.refresh()} /></div> : null}

      {live.loading && rows.length === 0 ? (
        <Card>
          <LoadingRows rows={4} />
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<ShieldCheck className="size-5" aria-hidden />}
            title={scope === 'open' ? 'Nothing is waiting for assessment' : 'No alerts in this view'}
            description={
              scope === 'open'
                ? 'Alerts are raised the moment a saved visit matches a configured rule, or manually by a clinician. Resolving one always requires a written action.'
                : 'Change the filters to see earlier activity.'
            }
            action={
              permissions.canCreateAlert ? (
                <Button variant="secondary" onClick={() => setRaising(true)}>
                  Raise an alert manually
                </Button>
              ) : null
            }
          />
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped.red.length > 0 ? (
            <section>
              <h2 className="h2 mb-2 flex items-center gap-2 text-[var(--color-risk-red-text)]">
                <AlertTriangle className="size-4" aria-hidden /> Red — assess immediately ({grouped.red.length})
              </h2>
              <ul className="space-y-3">
                {grouped.red.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} onChanged={() => void live.refresh()} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grouped.amber.length > 0 ? (
            <section>
              <h2 className="h2 mb-2 text-[var(--color-risk-amber-text)]">Amber — assess within 24 hours ({grouped.amber.length})</h2>
              <ul className="space-y-3">
                {grouped.amber.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} onChanged={() => void live.refresh()} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {grouped.rest.length > 0 ? (
            <section>
              <h2 className="h2 mb-2">Closed and informational ({grouped.rest.length})</h2>
              <ul className="space-y-3">
                {grouped.rest.map((alert) => (
                  <li key={alert.id}>
                    <AlertCard alert={alert} compact onChanged={() => void live.refresh()} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}

      <AlertDialog open={raising} onClose={() => setRaising(false)} facilityId={actor?.facilityId ?? null} onSaved={() => void live.refresh()} />
    </AppShell>
  );
}

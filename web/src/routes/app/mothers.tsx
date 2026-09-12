import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Filter, Heart, Plus, RefreshCw, UserPlus } from 'lucide-react';
import { AppShell } from '@/components/layout/shell';
import { useNavScope } from '@/components/layout/nav-scope';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DataTable, type Column } from '@/components/ui/table';
import { EmptyState, ErrorState, LoadingRows, NoticeState, RiskBadge, StatusBadge } from '@/components/ui/display';
import { SearchInput, Select, Switch } from '@/components/ui/form';
import { useDebouncedValue, useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { formatDate, toIsoDate } from '@/lib/utils';
import { gestationalAge, shortGestationalAge } from '@/lib/obstetrics';
import { RISK_LABELS, type Mother, type RiskLevel } from '@/types/domain';
import { RegisterMotherDialog } from '@/routes/app/register-mother-dialog';

type Scope = 'mine' | 'all';

/**
 * The roster is the working list for a facility: who is pregnant, how far along,
 * who is overdue and who is flagged. Everything comes from the live collection —
 * the policy module decides which rows arrive, this page only presents them.
 */
export default function MothersPage() {
  const { link: navLink } = useNavScope();
  const { actor, permissions } = useSession();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [risk, setRisk] = useState<'ALL' | RiskLevel>('ALL');
  const [scope, setScope] = useState<Scope>(actor?.role === 'ADMIN' ? 'all' : 'mine');
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);
  const [registering, setRegistering] = useState(false);
  const search = useDebouncedValue(term, 200);

  const roster = useLiveQuery('mothers', {
    where: scope === 'mine' && actor?.facilityId ? [{ field: 'registrationFacilityId', op: '==', value: actor.facilityId }] : [],
    orderBy: { field: 'createdAt', direction: 'desc' },
    limit: 500,
  });

  const rows = useMemo(() => {
    const today = toIsoDate(new Date());
    const needle = search.trim().toLowerCase();
    return (roster.data as Mother[])
      .filter((mother) => {
        if (risk !== 'ALL' && (mother.riskLevel ?? 'GREEN') !== risk) return false;
        if (needle) {
          const haystack = [mother.patientId, mother.fullName, mother.phone, mother.community, mother.catchmentArea]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        if (showOverdueOnly) {
          const nextVisit = mother.nextAppointmentAt ?? null;
          const postTerm = (mother.gestationalSnapshot?.weeks ?? 0) >= 41;
          const overdue = nextVisit ? nextVisit.slice(0, 10) < today : postTerm;
          if (!overdue) return false;
        }
        return true;
      })
      .sort((a, b) => (a.fullName > b.fullName ? 1 : -1));
  }, [roster.data, search, risk, showOverdueOnly, scope]);

  const columns: Column<Mother>[] = [
    {
      key: 'mother',
      header: 'Mother',
      render: (mother) => (
        <div className="min-w-0">
          <Link to={`${navLink('/mothers')}/${mother.id}`} className="block truncate text-[0.9rem] font-semibold text-ink-900 hover:text-brand-800 hover:underline">
            {mother.fullName}
          </Link>
          <p className="micro mt-0.5 truncate">
            {mother.patientId} · {mother.ageYears ? `${mother.ageYears} yrs` : 'age not recorded'}
          </p>
        </div>
      ),
      sortValue: (mother) => mother.fullName,
    },
    {
      key: 'gestation',
      header: 'Gestation',
      render: (mother) => {
        const ga = gestationalAge({ eddDate: mother.eddSnapshot, asOf: new Date() });
        const snapshot = mother.gestationalSnapshot;
        const label = snapshot ? `${snapshot.weeks}+${snapshot.days}` : shortGestationalAge(ga);
        return (
          <div>
            <p className="text-[0.86rem] font-medium text-ink-800 tnum">{label} wks</p>
            <p className="caption mt-0.5">{mother.eddSnapshot ? `EDD ${formatDate(mother.eddSnapshot)}` : 'EDD not set'}</p>
          </div>
        );
      },
      sortValue: (mother) => mother.gestationalSnapshot?.weeks ?? 0,
    },
    {
      key: 'risk',
      header: 'Risk',
      render: (mother) => <RiskBadge level={(mother.riskLevel ?? 'GREEN') as RiskLevel} />,
      sortValue: (mother) => (mother.riskLevel === 'RED' ? 3 : mother.riskLevel === 'AMBER' ? 2 : 1),
      hideBelow: 'md',
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (mother) => (
        <div className="text-[0.84rem] text-ink-700">
          <p className="tnum">{mother.phone}</p>
          <p className="caption mt-0.5 truncate">{mother.community ?? mother.catchmentArea ?? '—'}</p>
        </div>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'status',
      header: 'Record',
      render: (mother) => (
        <div className="flex flex-col items-start gap-1">
          <StatusBadge status={mother.status} />
          <span className="caption">{mother.nextAppointmentAt ? `Next ${formatDate(mother.nextAppointmentAt)}` : 'No visit scheduled'}</span>
        </div>
      ),
      hideBelow: 'lg',
    },
    {
      key: 'open',
      header: '',
      align: 'right',
      render: (mother) => (
        <Button size="sm" variant="secondary" onClick={() => navigate(`${navLink('/mothers')}/${mother.id}`)} icon={<Heart className="size-3.5" aria-hidden />}>
          Open
        </Button>
      ),
    },
  ];

  const loading = roster.loading && roster.data.length === 0;

  return (
    <AppShell
      title="Mothers"
      subtitle={
        roster.error
          ? 'The roster could not be loaded'
          : `${rows.length} record${rows.length === 1 ? '' : 's'} in view · ${scope === 'mine' ? 'this facility' : 'all facilities you can access'}`
      }
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => void roster.refresh()} loading={roster.loading} icon={<RefreshCw className="size-4" aria-hidden />}>
            Refresh
          </Button>
          {permissions.canRegisterMother ? (
            <Button size="sm" onClick={() => setRegistering(true)} icon={<Plus className="size-4" aria-hidden />}>
              Register mother
            </Button>
          ) : null}
        </>
      }
    >
      <Card className="mb-4" bodyClassName="p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput
            value={term}
            onValueChange={setTerm}
            placeholder="Search name, patient ID, phone or area"
            className="min-w-[15rem] flex-1"
          />
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-ink-400" aria-hidden />
            <Select
              value={risk}
              options={[{ value: 'ALL', label: 'Any risk level' }, ...(Object.keys(RISK_LABELS) as RiskLevel[]).map((level) => ({ value: level, label: RISK_LABELS[level] }))]}
              onValueChange={(value) => setRisk(value as 'ALL' | RiskLevel)}
              className="min-w-[9.5rem]"
            />
            {actor?.role === 'ADMIN' ? (
              <Select
                value={scope}
                options={[
                  { value: 'mine', label: 'My facility' },
                  { value: 'all', label: 'All facilities' },
                ]}
                onValueChange={(value) => setScope(value as Scope)}
                className="min-w-[8.5rem]"
              />
            ) : null}
            <div className="w-40">
              <Switch checked={showOverdueOnly} onChange={setShowOverdueOnly} label="Overdue only" />
            </div>
          </div>
        </div>
      </Card>

      {roster.error ? (
        <ErrorState
          title="The mother roster did not load"
          message={roster.error}
          onRetry={() => void roster.refresh()}
        />
      ) : null}

      <Card bodyClassName="p-0">
        {loading ? (
          <div className="p-4">
            <LoadingRows rows={6} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<UserPlus className="size-5" aria-hidden />}
            title={search || risk !== 'ALL' || showOverdueOnly ? 'No mothers match these filters' : 'No mothers registered yet'}
            description={
              search || risk !== 'ALL' || showOverdueOnly
                ? 'Clear the filters to see the whole roster for your facility.'
                : 'Registration is done by a health worker at the facility: identity, contact details, pregnancy dating and consent.'
            }
            action={
              permissions.canRegisterMother ? (
                <Button onClick={() => setRegistering(true)} icon={<Plus className="size-4" aria-hidden />}>
                  Register the first mother
                </Button>
              ) : null
            }
          />
        ) : (
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(mother) => mother.id}
            pageSize={25}
            dense
            caption="Registered mothers"
            onRowClick={(mother) => navigate(`${navLink('/mothers')}/${mother.id}`)}
          />
        )}
      </Card>

      {!roster.error && rows.length > 0 ? (
        <p className="mt-3">
          <NoticeState tone="info" title="Access is decided by the data, not by this page" compact>
            You only ever see records your role and facility are allowed to read. Facility staff see their own mothers; supervisors see the
            facilities they oversee; administrators see the full register.
          </NoticeState>
        </p>
      ) : null}

      <RegisterMotherDialog
        open={registering}
        onClose={() => setRegistering(false)}
        onRegistered={(motherId) => {
          setRegistering(false);
          navigate(`${navLink('/mothers')}/${motherId}`);
        }}
      />
    </AppShell>
  );
}

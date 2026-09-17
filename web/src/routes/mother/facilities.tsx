/**
 * Facilities — inside the app.
 *
 * Two jobs. First: choose the facility you actually attend, so appointments,
 * immunizations and your provider link all default to it and the emergency card can
 * show its labour ward number. Second: find somewhere else when you are away from
 * home or the nearest place is full.
 *
 * Verification state is always visible. A wrong number in an emergency is worse
 * than no number, so unverified listings say so.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Flag, LocateFixed, MapPin, Phone, Search, Star } from 'lucide-react';
import {useAsync, useDebouncedValue} from '@/hooks';
import { useMotherContext } from '@/hooks/use-mother';
import { facilityRepo, feedbackRepo, pregnancyRepo, profileRepo } from '@/services/repositories';
import { useSession } from '@/providers/app-providers';
import { FACILITY_DATA_NOTE, PROVINCES, PROVINCE_CENTRES, directionsUrl, distanceKm } from '@/config/facilities';
import { EMERGENCY_CONTACTS } from '@/config/site-content';
import { FACILITY_TYPE_LABELS, type Facility, type FacilityType } from '@/types/domain';
import { AppShell, PageHeader } from '@/components/layout/app-shell';
import { EmergencyNumbers } from '@/components/emergency/emergency-panel';
import { FacilityCard } from '@/components/facility/facility-card';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { Field, SearchInput, Select, TextArea } from '@/components/ui/form';
import { Modal } from '@/components/ui/overlay';
import { useToast } from '@/components/ui/toast';

export default function MotherFacilitiesPage() {
  const mother = useMotherContext();
  const { actor } = useSession();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search, 200);
  const [type, setType] = useState<FacilityType | ''>('');
  const [province, setProvince] = useState('');
  const [maternityOnly, setMaternityOnly] = useState(false);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [reportFor, setReportFor] = useState<Facility | null>(null);

  const { data, loading, error, retryable, run } = useAsync(() => facilityRepo.list(), { deps: [] });
  const facilities = useMemo<Facility[]>(() => data ?? [], [data]);

  const myFacilityId = mother.pregnancy?.facilityId ?? actor?.facilityId ?? null;
  const myFacility = facilities.find((facility) => facility.id === myFacilityId) ?? null;

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const rows = facilities
      .filter((facility) => (type ? facility.type === type : true))
      .filter((facility) => (province ? facility.province === province : true))
      .filter((facility) => (maternityOnly ? facility.hasMaternity : true))
      .filter((facility) =>
        needle
          ? [facility.name, facility.city, facility.province, facility.address, ...facility.services, ...facility.maternalServices]
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      );
    return rows
      .map((facility) => {
        const from = origin ?? (PROVINCE_CENTRES[facility.province] as [number, number] | undefined) ?? null;
        const km =
          from && facility.latitude !== null && facility.longitude !== null
            ? distanceKm(from, [facility.latitude, facility.longitude])
            : null;
        return { facility, km };
      })
      .sort((a, b) => {
        if (a.facility.id === myFacilityId) return -1;
        if (b.facility.id === myFacilityId) return 1;
        if (origin && a.km !== null && b.km !== null) return a.km - b.km;
        return Number(b.facility.verified) - Number(a.facility.verified) || a.facility.name.localeCompare(b.facility.name);
      });
  }, [facilities, term, type, province, maternityOnly, origin, myFacilityId]);

  useEffect(() => {
    document.title = 'Facilities · Mama Care';
  }, []);

  const chooseMine = async (facility: Facility): Promise<void> => {
    try {
      await profileRepo.update({ facilityId: facility.id });
      if (mother.pregnancy) await pregnancyRepo.update(mother.pregnancy.id, { facilityId: facility.id });
      toast.success('Facility saved', `${facility.name} is now your facility.`);
      mother.refresh();
    } catch {
      toast.error('That did not save');
    }
  };

  const locate = (): void => {
    if (!('geolocation' in navigator)) {
      toast.info('This browser cannot share a location.', 'Search by town or province instead.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setLocating(false);
      },
      () => {
        setLocating(false);
        toast.error('Location unavailable', 'Search by town or province instead.');
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <AppShell>
      <PageHeader
        title="Facilities"
        description="Choose the clinic or hospital you attend, find one near you when you are away from home, and see which maternal services each place offers."
        actions={
          <Button variant="secondary" size="sm" onClick={locate} loading={locating} icon={<LocateFixed className="size-4" aria-hidden />}>
            {origin ? 'Sorted by distance' : 'Near me'}
          </Button>
        }
      />

      {myFacility ? (
        <Card className="card-pad mb-4 border-brand-200 bg-brand-50/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="micro flex items-center gap-1.5">
                <Star className="size-3.5" aria-hidden /> Your facility
              </p>
              <h2 className="card-title mt-1">{myFacility.name}</h2>
              <p className="mt-0.5 text-sm text-ink-600">
                {FACILITY_TYPE_LABELS[myFacility.type]} · {myFacility.city}, {myFacility.province}
              </p>
              <p className="mt-0.5 text-xs text-ink-500">{myFacility.openingHours}</p>
            </div>
            <div className="actions-wrap">
              {myFacility.phone ? (
                <a href={`tel:${myFacility.phone}`} className="btn btn-primary btn-sm">
                  <Phone className="size-4" aria-hidden /> Call
                </a>
              ) : null}
              {myFacility.emergencyPhone ? (
                <a href={`tel:${myFacility.emergencyPhone}`} className="btn btn-danger btn-sm">
                  Labour ward
                </a>
              ) : null}
              <a
                href={directionsUrl(myFacility)}
                target="_blank"
                rel="noreferrer noopener"
                className="btn btn-secondary btn-sm"
              >
                <MapPin className="size-4" aria-hidden /> Directions
              </a>
            </div>
          </div>
          {myFacility.maternalServices.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {myFacility.maternalServices.map((service) => (
                <Badge key={service} tone="brand">
                  {service}
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/app/appointments" className="btn btn-secondary btn-sm">
              Add an appointment here
            </Link>
            <Button variant="ghost" size="sm" onClick={() => setReportFor(myFacility)} icon={<Flag className="size-4" aria-hidden />}>
              Something is wrong here
            </Button>
          </div>
        </Card>
      ) : (
        <Card className="card-pad mb-4 border-ink-200 bg-ink-50">
          <h2 className="card-title">Choose your facility</h2>
          <p className="mt-1 text-sm text-ink-600">
            Pick the clinic or hospital you attend. Appointments, immunizations and your provider link will default to it,
            and its number appears first on the emergency screen.
          </p>
        </Card>
      )}

      <Card className="card-pad mb-4">
        <SectionHeading eyebrow="National" title="Emergency numbers" />
        <div className="mt-3">
          <EmergencyNumbers compact />
        </div>
        <p className="mt-3 text-xs text-ink-500">{EMERGENCY_CONTACTS.note}</p>
        <div className="mt-3">
          <Link to="/app/emergency" className="btn btn-danger btn-sm">
            Warning signs & what to do now
          </Link>
        </div>
      </Card>

      <Card className="card-pad">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <p className="label">Search</p>
            <SearchInput value={search} onValueChange={setSearch} placeholder="Search facility, town or service" />
          </div>
          <div>
            <label className="label" htmlFor="my-facility-type">
              Type
            </label>
            <Select
              id="my-facility-type"
              value={type}
              onChange={(event) => setType(event.target.value as FacilityType | '')}
              options={[
                { value: '', label: 'All types' },
                ...(Object.keys(FACILITY_TYPE_LABELS) as FacilityType[]).map((item) => ({ value: item, label: FACILITY_TYPE_LABELS[item] })),
              ]}
            />
          </div>
          <div>
            <label className="label" htmlFor="my-facility-province">
              Province
            </label>
            <Select
              id="my-facility-province"
              value={province}
              onChange={(event) => setProvince(event.target.value)}
              options={[{ value: '', label: 'All provinces' }, ...PROVINCES.map((item) => ({ value: item, label: item }))]}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={maternityOnly ? 'chip chip-active' : 'chip'}
            aria-pressed={maternityOnly}
            onClick={() => setMaternityOnly((value) => !value)}
          >
            Maternity services only
          </button>
          <span className="text-sm text-ink-600">
            {loading ? 'Loading…' : `${results.length} ${results.length === 1 ? 'facility' : 'facilities'}`}
          </span>
        </div>
      </Card>

      {error ? <ErrorState className="mt-4" title="The directory could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
      {loading ? <LoadingRows className="mt-4" rows={4} /> : null}
      {!loading && !error && results.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<Search className="size-6" aria-hidden />}
          title="No facilities match those filters"
          description="Try clearing a filter or searching for the nearest town. If your clinic is missing, tell us and an administrator will add it."
        />
      ) : null}

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {results.map(({ facility, km }) => (
          <div key={facility.id} className="relative">
            <FacilityCard facility={facility} distanceKm={km} onSelect={() => void chooseMine(facility)} />
            {facility.id === myFacilityId ? (
              <span className="absolute top-3 right-3">
                <Badge tone="green">
                  <Check className="size-3" aria-hidden /> Your facility
                </Badge>
              </span>
            ) : null}
          </div>
        ))}
      </div>

      <Card className="card-pad mt-8 border-ink-200 bg-ink-50">
        <div className="flex flex-wrap items-start gap-3">
          <Badge tone="amber">Please read</Badge>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-700">{FACILITY_DATA_NOTE}</p>
        </div>
        <div className="mt-3">
          <Link to="/contact" className="btn btn-secondary btn-sm">
            Report wrong facility information
          </Link>
        </div>
      </Card>

      <ReportFacilityModal
        facility={reportFor}
        onClose={() => setReportFor(null)}
        onSent={() => {
          setReportFor(null);
          toast.success('Report sent', 'An administrator will check this listing.');
        }}
      />
    </AppShell>
  );
}

function ReportFacilityModal({ facility, onClose, onSent }: { facility: Facility | null; onClose: () => void; onSent: () => void }) {
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (facility) {
      setMessage('');
      setError(null);
    }
  }, [facility]);

  if (!facility) return null;

  const submit = async (): Promise<void> => {
    if (message.trim().length < 10) {
      setError('Tell us what is wrong — at least a sentence.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await feedbackRepo.submit({
        topic: 'facility-data',
        message: `${facility.name} (${facility.city}, ${facility.province}): ${message.trim()}`,
      });
      onSent();
    } catch {
      setError('That did not send. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(facility)}
      onClose={onClose}
      title="Report a problem with this listing"
      description={`${facility.name}. Wrong information in a directory costs someone time they may not have — thank you for checking.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => void submit()} loading={saving}>
            Send report
          </Button>
        </>
      }
    >
      <Field label="What is wrong?" htmlFor="facility-report" hint="For example a changed phone number, closed maternity wing, or wrong opening hours.">
        <TextArea id="facility-report" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} />
      </Field>
      {error ? <p className="alert alert-error mt-3">{error}</p> : null}
    </Modal>
  );
}

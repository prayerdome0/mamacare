/**
 * Facility directory (public).
 *
 * Search by name, city or province, filter by facility type and by the services a
 * mother actually needs (maternity, 24-hour emergency), and sort by distance when
 * the browser can share a location. Location is asked for, never taken silently,
 * and the sort falls back to the province centre so the list is still useful when
 * the user says no.
 *
 * Every listing carries its verification state. Facility information changes, and
 * an app that hides that fact is an app people stop trusting.
 */

import { useEffect, useMemo, useState } from 'react';
import { LocateFixed, MapPin, Search } from 'lucide-react';
import { useAsync, useDebouncedValue } from '@/hooks';
import { facilityRepo } from '@/services/repositories';
import { FACILITY_DATA_NOTE, PROVINCES, PROVINCE_CENTRES, distanceKm } from '@/config/facilities';
import { FACILITY_TYPE_LABELS, type Facility, type FacilityType } from '@/types/domain';
import { PublicHero } from '@/components/layout/public-shell';
import { FacilityCard } from '@/components/facility/facility-card';
import { AppImage } from '@/components/media/app-image';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, EmptyState, ErrorState, LoadingRows } from '@/components/ui/display';
import { SearchInput, Select, Switch } from '@/components/ui/form';
import { cn } from '@/lib/utils';

const TYPE_ORDER: FacilityType[] = [
  'government-hospital',
  'private-hospital',
  'clinic',
  'health-post',
  'maternity-home',
  'pharmacy',
  'laboratory',
];

export default function FacilitiesPage() {
  const { data, loading, error, retryable, run } = useAsync(() => facilityRepo.list(), { deps: [] });
  const [search, setSearch] = useState('');
  const term = useDebouncedValue(search, 200);
  const [type, setType] = useState<FacilityType | ''>('');
  const [province, setProvince] = useState('');
  const [district, setDistrict] = useState('');
  const [maternityOnly, setMaternityOnly] = useState(false);
  const [emergencyOnly, setEmergencyOnly] = useState(false);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const facilities = useMemo<Facility[]>(() => data ?? [], [data]);

  /** Districts that exist in the directory, narrowed to the chosen province. */
  const districtOptions = useMemo(() => {
    const base = province ? facilities.filter((facility) => facility.province === province) : facilities;
    return Array.from(new Set(base.map((facility) => facility.district).filter(Boolean))).sort();
  }, [facilities, province]);

  const results = useMemo(() => {
    const needle = term.trim().toLowerCase();
    const rows = facilities
      .filter((facility) => (type ? facility.type === type : true))
      .filter((facility) => (province ? facility.province === province : true))
      .filter((facility) => (district ? facility.district === district : true))
      .filter((facility) => (maternityOnly ? facility.hasMaternity : true))
      .filter((facility) => (emergencyOnly ? facility.has24HourEmergency : true))
      .filter((facility) => (verifiedOnly ? facility.verified : true))
      .filter((facility) =>
        needle
          ? [facility.name, facility.city, facility.province, facility.address, ...facility.services, ...facility.maternalServices]
              .join(' ')
              .toLowerCase()
              .includes(needle)
          : true,
      );

    const withDistance = rows.map((facility) => {
      const from = origin ?? (PROVINCE_CENTRES[facility.province] as [number, number] | undefined) ?? null;
      const km =
        from && facility.latitude !== null && facility.longitude !== null
          ? distanceKm(from, [facility.latitude, facility.longitude])
          : null;
      return { facility, km };
    });

    return withDistance.sort((a, b) => {
      if (origin && a.km !== null && b.km !== null) return a.km - b.km;
      return a.facility.name.localeCompare(b.facility.name);
    });
  }, [facilities, term, type, province, district, maternityOnly, emergencyOnly, verifiedOnly, origin]);

  useEffect(() => {
    document.title = 'Find a facility · Mama Care';
  }, []);

  const locate = (): void => {
    if (!('geolocation' in navigator)) {
      setLocationError('This browser cannot share a location. Search by town or province instead.');
      return;
    }
    setLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin([position.coords.latitude, position.coords.longitude]);
        setLocating(false);
      },
      (positionError) => {
        setLocating(false);
        setLocationError(
          positionError.code === positionError.PERMISSION_DENIED
            ? 'Location is blocked for this site. You can still search by town or province.'
            : 'Your location could not be found. Search by town or province instead.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  };

  return (
    <>
      <PublicHero
        eyebrow="Hospital & clinic directory"
        title="Find the right place to be seen"
        lede="Government hospitals, clinics, health posts, maternity homes, pharmacies and laboratories — with the maternal services each one offers and how to get there."
        image={<AppImage name="clinic" alt="The waiting area of a maternal health clinic" ratio="4 / 3" />}
      >
        <Button onClick={locate} variant="secondary" disabled={locating} icon={<LocateFixed className="size-4" aria-hidden />}>
          {locating ? 'Finding you…' : origin ? 'Sorted by distance' : 'Sort by distance from me'}
        </Button>
      </PublicHero>

      <section className="shell py-8">
        <Card className="card-pad">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))]">
            <div className="sm:col-span-2 lg:col-span-1">
              <p className="label">Search</p>
              <SearchInput value={search} onValueChange={setSearch} placeholder="Search facility, town or service" />
            </div>
            <div>
              <label className="label" htmlFor="facility-type">
                Facility type
              </label>
              <Select
                id="facility-type"
                value={type}
                onChange={(event) => setType(event.target.value as FacilityType | '')}
                options={[
                  { value: '', label: 'All types' },
                  ...TYPE_ORDER.map((item) => ({ value: item, label: FACILITY_TYPE_LABELS[item] })),
                ]}
              />
            </div>
            <div>
              <label className="label" htmlFor="facility-province">
                Province
              </label>
              <Select
                id="facility-province"
                value={province}
                onChange={(event) => {
                  setProvince(event.target.value);
                  setDistrict('');
                }}
                options={[{ value: '', label: 'All provinces' }, ...PROVINCES.map((item) => ({ value: item, label: item }))]}
              />
            </div>
            <div>
              <label className="label" htmlFor="facility-district">
                District
              </label>
              <Select
                id="facility-district"
                value={district}
                onChange={(event) => setDistrict(event.target.value)}
                options={[{ value: '', label: province ? `All in ${province}` : 'All districts' }, ...districtOptions.map((item) => ({ value: item, label: item }))]}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Switch label="Maternity services" checked={maternityOnly} onChange={setMaternityOnly} />
            <Switch label="24-hour emergency" checked={emergencyOnly} onChange={setEmergencyOnly} />
            <Switch label="Verified listings only" checked={verifiedOnly} onChange={setVerifiedOnly} />
          </div>

          {locationError ? <p className="alert alert-warn mt-4 px-3 py-2 text-[0.85rem]">{locationError}</p> : null}
          {origin ? (
            <p className="mt-3 flex items-center gap-2 text-xs text-ink-500">
              <MapPin className="size-3.5" aria-hidden />
              Sorted by distance from your approximate location. Location is used in this browser only and is never
              stored in your Mama Care record.
            </p>
          ) : null}
        </Card>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-600">
            {loading ? 'Loading facilities…' : `${results.length} ${results.length === 1 ? 'facility' : 'facilities'}`}
            {origin ? ' · sorted by distance' : ''}
          </p>
          {verifiedOnly || maternityOnly || emergencyOnly || type || province || district || term ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('');
                setType('');
                setProvince('');
                setDistrict('');
                setMaternityOnly(false);
                setEmergencyOnly(false);
                setVerifiedOnly(false);
              }}
            >
              Clear filters
            </Button>
          ) : null}
        </div>

        {error ? <ErrorState className="mt-4" title="The directory could not be loaded" message={error} onRetry={retryable ? run : undefined} /> : null}
        {loading ? <LoadingRows className="mt-4" rows={4} /> : null}

        {!loading && !error && results.length === 0 ? (
          <EmptyState
            className="mt-6"
            icon={<Search className="size-6" aria-hidden />}
            title="No facilities match those filters"
            description="Try clearing a filter, or search for the nearest town. If a facility is missing, tell us and an administrator will add it."
          />
        ) : null}

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {results.map(({ facility, km }) => (
            <FacilityCard key={facility.id} facility={facility} distanceKm={km} />
          ))}
        </div>

        <Card className={cn('card-pad mt-8 border-ink-200 bg-ink-50')}>
          <div className="flex flex-wrap items-start gap-3">
            <Badge tone="amber">Please read</Badge>
            <p className="max-w-3xl text-sm leading-relaxed text-ink-700">{FACILITY_DATA_NOTE}</p>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Telephone numbers are published only once an administrator has verified them. Where a number is missing, call
            your district health office or go in person.
          </p>
        </Card>
      </section>
    </>
  );
}

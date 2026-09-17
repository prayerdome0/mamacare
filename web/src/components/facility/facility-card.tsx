/**
 * Facility card and directory row.
 *
 * Honest about what it knows: a listing that has not been verified says so, a
 * facility with no published phone number says "not listed" instead of showing a
 * blank, and the directions link goes to the user's own maps app rather than
 * embedding a map the app cannot keep current.
 */

import { Link } from 'react-router-dom';
import { BadgeCheck, Clock3, MapPin, Navigation, Phone, ShieldAlert, Stethoscope } from 'lucide-react';
import { cn, telHref } from '@/lib/utils';
import { FACILITY_TYPE_LABELS, type Facility } from '@/types/domain';
import { directionsUrl } from '@/config/facilities';
import { Badge } from '@/components/ui/display';
import { Card } from '@/components/ui/card';

export function FacilityCard({
  facility,
  distanceKm,
  onSelect,
  selected,
  compact = false,
}: {
  facility: Facility;
  distanceKm?: number | null;
  onSelect?: (facility: Facility) => void;
  selected?: boolean;
  compact?: boolean;
}) {
  return (
    <Card className={cn('card-pad', selected && 'border-brand-600 ring-2 ring-brand-600/15')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[1rem] leading-snug font-semibold text-ink-900">{facility.name}</h3>
            <Badge tone="brand">{FACILITY_TYPE_LABELS[facility.type]}</Badge>
          </div>
          <p className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-600">
            <MapPin className="mt-0.5 size-4 shrink-0 text-ink-400" aria-hidden />
            <span>
              {facility.district ? `${facility.district} District · ` : ''}
              {facility.address}, {facility.city}
              {facility.province ? `, ${facility.province}` : ''}
              {distanceKm !== null && distanceKm !== undefined ? (
                <span className="ml-1.5 font-medium text-brand-800 tnum">· about {distanceKm} km away</span>
              ) : null}
            </span>
          </p>
          {facility.description ? (
            <p className="mt-1.5 max-w-xl text-[0.8rem] leading-snug text-ink-500">{facility.description}</p>
          ) : null}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {facility.verified ? (
            <Badge tone="green" icon={<BadgeCheck className="size-3" aria-hidden />}>
              Verified
            </Badge>
          ) : (
            <Badge tone="amber" icon={<ShieldAlert className="size-3" aria-hidden />}>
              Not yet verified
            </Badge>
          )}
          {facility.has24HourEmergency ? <Badge tone="red">24-hour emergency</Badge> : null}
          {facility.hasMaternity ? <Badge tone="neutral">Maternity services</Badge> : null}
        </div>
      </div>

      {!compact ? (
        <>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 uppercase">
                <Clock3 className="size-3.5" aria-hidden />
                Opening hours
              </dt>
              <dd className="mt-1 text-ink-700">{facility.openingHours || 'Not published'}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 uppercase">
                <Phone className="size-3.5" aria-hidden />
                Telephone
              </dt>
              <dd className="mt-1 text-ink-700">
                {facility.phone ? (
                  <a href={telHref(facility.phone)} className="font-semibold text-brand-800 hover:underline tnum">
                    {facility.phone}
                  </a>
                ) : (
                  <span className="text-ink-500">Not listed — confirm before travelling</span>
                )}
              </dd>
            </div>
          </dl>

          {facility.maternalServices.length > 0 ? (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-ink-500 uppercase">
                <Stethoscope className="size-3.5" aria-hidden />
                Maternal services
              </p>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {facility.maternalServices.map((service) => (
                  <li key={service} className="chip">
                    {service}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {facility.services.length > 0 && !facility.maternalServices.length ? (
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {facility.services.map((service) => (
                <li key={service} className="chip">
                  {service}
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}

      <div className="actions-wrap mt-4">
        <a href={directionsUrl(facility)} target="_blank" rel="noreferrer noopener" className="btn btn-secondary btn-sm">
          <Navigation className="size-4" aria-hidden />
          Directions
        </a>
        {facility.phone ? (
          <a href={telHref(facility.phone)} className="btn btn-secondary btn-sm">
            <Phone className="size-4" aria-hidden />
            Call
          </a>
        ) : null}
        {onSelect ? (
          <button type="button" className={cn('btn btn-sm', selected ? 'btn-quiet' : 'btn-primary')} onClick={() => onSelect(facility)}>
            {selected ? 'Selected as my facility' : 'Use this facility'}
          </button>
        ) : null}
      </div>
    </Card>
  );
}

/** Row used in admin and provider tables. */
export function FacilityRowLink({ facility }: { facility: Facility }) {
  return (
    <Link to={`/facilities/${facility.id}`} className="font-medium text-brand-800 hover:underline">
      {facility.name}
    </Link>
  );
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  Baby,
  CalendarClock,
  Clock3,
  FlaskConical,
  GraduationCap,
  Heart,
  ListChecks,
  Stethoscope,
  Truck,
  Users,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, LoadingRows, NoticeState } from '@/components/ui/display';
import { useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { SERVICES } from '@/config/site-content';
import { SERVICE_CATEGORY_LABELS, type ServiceOffering } from '@/types/domain';

const CATEGORY_ICON: Record<ServiceOffering['category'], ReactNode> = {
  ANTENATAL: <Stethoscope className="size-4" aria-hidden />,
  DELIVERY: <Heart className="size-4" aria-hidden />,
  POSTNATAL: <Baby className="size-4" aria-hidden />,
  NEWBORN: <Baby className="size-4" aria-hidden />,
  EDUCATION: <GraduationCap className="size-4" aria-hidden />,
  LABORATORY: <FlaskConical className="size-4" aria-hidden />,
  REFERRAL: <Truck className="size-4" aria-hidden />,
  OUTREACH: <Users className="size-4" aria-hidden />,
  OTHER: <ListChecks className="size-4" aria-hidden />,
};

/**
 * Services.
 *
 * Two halves, deliberately separate. The first is what the *platform* does —
 * the six capabilities, identical on every deployment. The second is what *this
 * facility* offers, read live from the services catalogue that an administrator
 * maintains, so nothing about a clinic’s offer is hard-coded in a component.
 */
export default function ServicesPage() {
  const { actor } = useSession();
  const [onlyBooking, setOnlyBooking] = useState(false);

  // Ordered by the administrator's own sort order. A single-field orderBy is
  // used on purpose: adding a `where` clause would need a composite index in
  // Firestore, and availability is filtered here instead.
  const live = useLiveQuery('services', { orderBy: { field: 'sortOrder', direction: 'asc' }, limit: 200 });

  const available = useMemo(() => live.data.filter((row) => row.available), [live.data]);
  const shown = useMemo(
    () => (onlyBooking ? available.filter((row) => row.requiresAppointment) : available),
    [available, onlyBooking],
  );

  const grouped = useMemo(() => {
    const map = new Map<ServiceOffering['category'], ServiceOffering[]>();
    for (const row of shown) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()];
  }, [shown]);

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Services"
        title="What the platform does, and what your facility offers"
        lede="Six capabilities that replace the paper card, the referral slip and the appointment book — on one record, with permissions enforced where the data lives. Below that, the services this deployment publishes for its own facilities."
        image="ancConsultation"
        imageCaption="A routine antenatal consultation, recorded in the same format every time."
        actions={
          <>
            <ButtonLink to="/register" icon={<ArrowRight className="size-4" aria-hidden />}>
              Set up your facility
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary">
              How a visit runs
            </ButtonLink>
          </>
        }
      />

      {/* ── Platform capabilities ────────────────────────────────────── */}
      <PublicSection
        id="capabilities"
        tone="tint"
        eyebrow="The platform"
        title="Six capabilities, from registration to report"
        description="Each one exists to close a specific gap in paper-based follow-up. Together they keep one record per pregnancy, readable by the people who need it and nobody else."
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service, index) => (
            <article key={service.key} className="card flex flex-col overflow-hidden">
              <AppImage name={service.image} ratio="16 / 9" rounded={false} className="overflow-hidden" />
              <div className="flex flex-1 flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="h3">{service.title}</h3>
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-brand-50 text-[0.72rem] font-bold text-brand-800 tnum">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <p className="muted mt-2 flex-1">{service.summary}</p>
                <ul className="mt-4 space-y-1.5 border-t border-ink-100 pt-4">
                  {service.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-[0.8rem] leading-snug text-ink-600">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                      {bullet}
                    </li>
                  ))}
                </ul>
              </div>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── This deployment's catalogue ──────────────────────────────── */}
      <PublicSection
        id="catalogue"
        eyebrow="This deployment"
        title="Services offered at the facilities on this platform"
        description="Read from the services catalogue an administrator maintains. Retired services are hidden rather than deleted, so appointment history keeps its reference."
        actions={
          <button
            type="button"
            onClick={() => setOnlyBooking((value) => !value)}
            aria-pressed={onlyBooking}
            className={onlyBooking ? 'chip chip-active' : 'chip'}
          >
            <CalendarClock className="size-3.5" aria-hidden />
            Appointment required
          </button>
        }
      >
        {live.loading ? (
          <LoadingRows rows={4} />
        ) : grouped.length > 0 ? (
          <div className="space-y-6">
            {grouped.map(([category, rows]) => (
              <section key={category} aria-label={SERVICE_CATEGORY_LABELS[category]}>
                <h3 className="h3 mb-3 flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-lg bg-brand-50 text-brand-800">
                    {CATEGORY_ICON[category]}
                  </span>
                  {SERVICE_CATEGORY_LABELS[category]}
                  <span className="micro font-normal text-ink-400 tnum">{rows.length}</span>
                </h3>
                <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {rows.map((row) => (
                    <li key={row.id} className="card flex flex-col gap-2 p-4">
                      <p className="text-[0.92rem] font-semibold text-ink-900">{row.name}</p>
                      <p className="muted flex-1">{row.description || row.summary}</p>
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-ink-100 pt-2.5">
                        {row.requiresAppointment ? (
                          <Badge tone="brand" icon={<CalendarClock className="size-3" aria-hidden />}>
                            By appointment
                          </Badge>
                        ) : (
                          <Badge tone="neutral">Walk-in</Badge>
                        )}
                        {row.durationMinutes ? (
                          <Badge tone="neutral" icon={<Clock3 className="size-3" aria-hidden />}>
                            {row.durationMinutes} min
                          </Badge>
                        ) : null}
                        <Badge tone="neutral" icon={<Activity className="size-3" aria-hidden />}>
                          {row.facilityIds.length} {row.facilityIds.length === 1 ? 'facility' : 'facilities'}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="caption">
              {shown.length} service{shown.length === 1 ? '' : 's'} listed
              {onlyBooking ? ' that require an appointment' : ''}. The catalogue is maintained by an administrator of each facility.
            </p>
          </div>
        ) : live.error ? (
          <NoticeState tone="info" title="The catalogue could not be read from this deployment">
            {actor
              ? 'The services catalogue is not readable with this account. An administrator publishes it from Admin → Services.'
              : 'This deployment has not published a services catalogue that an anonymous visitor can read. The platform capabilities above are the same on every deployment.'}
          </NoticeState>
        ) : (
          <EmptyState
            icon={<Stethoscope className="size-5" aria-hidden />}
            title="No services published yet"
            description="An administrator adds the services a facility offers from Admin → Services. They appear here as soon as they are marked available."
            action={
              actor?.role === 'ADMIN' ? (
                <ButtonLink to="/admin/services" variant="secondary" size="sm">
                  Open the services catalogue
                </ButtonLink>
              ) : (
                <Link to="/for-clinics" className="btn btn-secondary btn-sm">
                  How a facility sets this up
                </Link>
              )
            }
          />
        )}
      </PublicSection>

      {/* ── Choosing ─────────────────────────────────────────────────── */}
      <PublicSection
        tone="brand"
        eyebrow="Adopting it"
        title="What a facility has to decide before opening the register"
        actions={
          <ButtonLink to="/for-clinics" variant="white" size="sm">
            The adoption checklist
          </ButtonLink>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { title: 'Which thresholds you use', body: 'The rule set ships as a starting configuration. Your clinical authority reviews each threshold, severity and wording, and signs it off on the settings screen.' },
            { title: 'Which reminders you send', body: 'Reminder lead times are per facility. Push notifications are always available; SMS is used only where an approved provider is configured, never through an unvetted route.' },
            { title: 'Who sees what', body: 'Six roles with different access. The matrix is enforced by the database rules, so a hidden link is a convenience and never the control.' },
          ].map((item) => (
            <article key={item.title} className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <h3 className="text-[1rem] font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">{item.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>
    </PublicShell>
  );
}

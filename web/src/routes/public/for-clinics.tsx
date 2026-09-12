import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ClipboardList,
  FlaskConical,
  MapPin,
  Phone,
  ScanLine,
  Settings,
  ShieldCheck,
  Stethoscope,
  UserCog,
} from 'lucide-react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, LoadingRows, NoticeState } from '@/components/ui/display';
import { SearchInput } from '@/components/ui/form';
import { useDebouncedValue, useLiveQuery } from '@/hooks';
import { FOR_CLINICS } from '@/config/site-content';
import { FACILITY_TYPE_LABELS } from '@/types/domain';
import { telHref } from '@/lib/utils';

/**
 * For clinics.
 *
 * The adoption path a facility follows, who has to sign off what, and — read
 * live from the world-readable facility directory — which facilities this
 * deployment actually holds. The directory is public by design (it is needed
 * before sign-in and contains no patient data), so it is shown here rather than
 * described.
 */
export default function ForClinicsPage() {
  const [term, setTerm] = useState('');
  const search = useDebouncedValue(term, 200);

  // `facilities` is world-readable in both the policy module and the database
  // rules: it is the directory, not patient data.
  const live = useLiveQuery('facilities', { orderBy: { field: 'name', direction: 'asc' }, limit: 200 });

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const active = live.data.filter((row) => row.active);
    if (!needle) return active;
    return active.filter((row) =>
      `${row.name} ${row.code} ${row.district} ${row.province}`.toLowerCase().includes(needle),
    );
  }, [live.data, search]);

  const capabilityCount = useMemo(
    () => ({
      maternity: rows.filter((row) => row.hasMaternityWard).length,
      ultrasound: rows.filter((row) => row.hasUltrasound).length,
      laboratory: rows.filter((row) => row.hasLaboratory).length,
    }),
    [rows],
  );

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="For clinics"
        title="Adopting MAMA CARE at a facility"
        lede={FOR_CLINICS.intro}
        image="midwifeConsultation"
        imageCaption="Fetal heart assessment recorded on the same visit, by the same clinician."
        actions={
          <>
            <ButtonLink to="/contact" icon={<ArrowRight className="size-4" aria-hidden />}>
              Talk to us about deploying
            </ButtonLink>
            <ButtonLink to="/how-it-works" variant="secondary">
              How a visit runs
            </ButtonLink>
          </>
        }
      />

      {/* ── Adoption steps ───────────────────────────────────────────── */}
      <PublicSection
        tone="tint"
        eyebrow="Adoption"
        title="Six steps before the register opens"
        description="Each step names the screen an administrator actually uses. Nothing here is optional: an unreviewed rule set and an unapproved staff queue are the two things that stop a deployment from holding real records."
      >
        <ol className="grid gap-4 md:grid-cols-2">
          {FOR_CLINICS.steps.map((item) => (
            <li key={item.step} className="card flex gap-4 p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-[0.8rem] font-bold text-brand-800 tnum">
                {item.step}
              </span>
              <div className="min-w-0">
                <h3 className="text-[0.96rem] font-semibold text-ink-900">{item.title}</h3>
                <p className="muted mt-1.5">{item.body}</p>
                <p className="mt-2.5">
                  <Badge tone="neutral" icon={<Settings className="size-3" aria-hidden />}>
                    {item.screen}
                  </Badge>
                </p>
              </div>
            </li>
          ))}
        </ol>
      </PublicSection>

      {/* ── Who signs off what ───────────────────────────────────────── */}
      <PublicSection
        eyebrow="Accountability"
        title="Who is responsible for what"
        description="The platform records the accountable person rather than leaving it implied: the rule sign-off names a reviewer, and every role change is written to the audit log."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: <Stethoscope className="size-4" aria-hidden />, ...FOR_CLINICS.responsibilities[0]! },
            { icon: <ShieldCheck className="size-4" aria-hidden />, ...FOR_CLINICS.responsibilities[1]! },
            { icon: <UserCog className="size-4" aria-hidden />, ...FOR_CLINICS.responsibilities[2]! },
            { icon: <ClipboardList className="size-4" aria-hidden />, ...FOR_CLINICS.responsibilities[3]! },
          ].map((item) => (
            <article key={item.title} className="card p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
              <h3 className="mt-3 text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
              <p className="muted mt-1.5">{item.detail}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── Live facility directory ──────────────────────────────────── */}
      <PublicSection
        id="facilities"
        tone="tint"
        eyebrow="This deployment"
        title="Facilities on this platform"
        description="Read live from the facility directory. The directory holds no patient data, which is why it can be published — it is what referrals and staff assignment are built on."
        actions={
          <SearchInput value={term} onValueChange={setTerm} placeholder="Search name, code, district…" className="w-full sm:w-72" />
        }
      >
        {live.loading ? (
          <LoadingRows rows={4} />
        ) : rows.length > 0 ? (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <SummaryStat label="Facilities listed" value={rows.length} />
              <SummaryStat label="With a maternity ward" value={capabilityCount.maternity} />
              <SummaryStat label="With ultrasound" value={capabilityCount.ultrasound} />
              <SummaryStat label="With a laboratory" value={capabilityCount.laboratory} />
            </dl>
            <ul className="grid gap-3 md:grid-cols-2">
              {rows.map((facility) => (
                <li key={facility.id} className="card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[0.94rem] font-semibold text-ink-900">{facility.name}</h3>
                      <p className="micro mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3 text-brand-700" aria-hidden />
                          {FACILITY_TYPE_LABELS[facility.type] ?? facility.type}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3 text-brand-700" aria-hidden />
                          {facility.district}, {facility.province}
                        </span>
                      </p>
                    </div>
                    <Badge tone="neutral" className="shrink-0 tnum">
                      {facility.code}
                    </Badge>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    <Badge tone={facility.hasMaternityWard ? 'green' : 'neutral'}>Maternity ward</Badge>
                    <Badge tone={facility.hasUltrasound ? 'green' : 'neutral'}>Ultrasound</Badge>
                    <Badge tone={facility.hasLaboratory ? 'green' : 'neutral'}>Laboratory</Badge>
                    {facility.bedCount ? <Badge tone="neutral">{facility.bedCount} beds</Badge> : null}
                  </ul>

                  <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 pt-2.5 text-[0.8rem] text-ink-600">
                    {facility.phone ? (
                      <a href={telHref(facility.phone)} className="inline-flex items-center gap-1.5 hover:text-brand-800 hover:underline tnum">
                        <Phone className="size-3.5 text-brand-700" aria-hidden />
                        {facility.phone}
                      </a>
                    ) : (
                      <span className="text-ink-400">No telephone published</span>
                    )}
                    {facility.email ? <a href={`mailto:${facility.email}`} className="hover:text-brand-800 hover:underline">{facility.email}</a> : null}
                  </p>
                </li>
              ))}
            </ul>
            <p className="caption">
              {rows.length} active facilit{rows.length === 1 ? 'y' : 'ies'}
              {search.trim() ? ` matching “${search.trim()}”` : ''}. Inactive facilities are not listed. No patient data is published on
              this page.
            </p>
          </div>
        ) : live.error ? (
          <NoticeState tone="info" title="The directory could not be read from this deployment">
            A facility directory has not been published here yet. An administrator creates each facility from Admin → Facilities, and it
            appears on this page as soon as it is marked active.
          </NoticeState>
        ) : (
          <EmptyState
            icon={<Building2 className="size-5" aria-hidden />}
            title={search.trim() ? 'No facility matches that search' : 'No facilities published yet'}
            description={
              search.trim()
                ? 'Try a shorter search, or clear it to see every active facility on this deployment.'
                : 'An administrator adds each facility from Admin → Facilities. Active facilities are listed here for the public.'
            }
            action={
              search.trim() ? (
                <ButtonLink to="/for-clinics#facilities" variant="secondary" size="sm" onClick={() => setTerm('')}>
                  Clear the search
                </ButtonLink>
              ) : (
                <Link to="/contact" className="btn btn-secondary btn-sm">
                  Ask about setting one up
                </Link>
              )
            }
          />
        )}
      </PublicSection>

      {/* ── Try before connecting ────────────────────────────────────── */}
      <PublicSection
        tone="brand"
        eyebrow="Before you connect a cloud project"
        title="Run the whole workflow on one device first"
        description={FOR_CLINICS.evaluation}
        actions={
          <>
            <ButtonLink to="/status" variant="white" size="sm">
              What this build is running
            </ButtonLink>
            <ButtonLink to="/register" variant="white" size="sm">
              Create an account
            </ButtonLink>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { icon: <BadgeCheck className="size-4" aria-hidden />, title: 'Same permission model', body: 'The device build enforces the identical access matrix through the policy module, so what you trial is what you deploy.' },
            { icon: <ScanLine className="size-4" aria-hidden />, title: 'Same rules engine', body: 'Alert thresholds and severities evaluate exactly as they will against the cloud database.' },
            { icon: <FlaskConical className="size-4" aria-hidden />, title: 'Nothing leaves the device', body: 'Records stay in this browser’s storage while no project is configured, and the status page states that plainly.' },
          ].map((item) => (
            <article key={item.title} className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-white/10 text-brand-200">{item.icon}</span>
              <h3 className="mt-3 text-[1rem] font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">{item.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>
    </PublicShell>
  );
}

function SummaryStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <dt className="micro">{label}</dt>
      <dd className="mt-1 text-2xl font-bold tracking-tight text-brand-800 tnum">{value}</dd>
    </div>
  );
}

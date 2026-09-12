import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Clock3,
  ExternalLink,
  GraduationCap,
  Languages,
  Library,
  LogIn,
  Stethoscope,
} from 'lucide-react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, LoadingRows, NoticeState } from '@/components/ui/display';
import { useLiveQuery } from '@/hooks';
import { useSession } from '@/providers/app-providers';
import { PUBLIC_DANGER_SIGNS, PUBLIC_RESOURCES } from '@/config/site-content';
import {
  EDUCATION_STAGES,
  EDUCATION_STAGE_LABELS,
  EDUCATION_TOPICS,
  type EducationResource,
} from '@/types/domain';

type Stage = (typeof EDUCATION_STAGES)[number] | 'ALL';

/**
 * Resources and reading.
 *
 * Two kinds of material, kept visibly apart. The first is the education library
 * this deployment has published — real rows, read through the normal data layer,
 * filtered to what this account may see. The second is published external
 * guidance: WHO, UNFPA, the Ministry of Health. The platform links out to those
 * rather than restating them, so the authority for each statement stays with its
 * publisher.
 */
export default function ResourcesPage() {
  const { actor } = useSession();
  const [stage, setStage] = useState<Stage>('ALL');

  // Ordered by most recently revised, and filtered to published items here.
  // A `where` clause is deliberately avoided: combining it with this orderBy
  // would require a composite index in Firestore. The policy module and the
  // database rules both already restrict an unauthorised read.
  const live = useLiveQuery('education', { orderBy: { field: 'updatedAt', direction: 'desc' }, limit: 60 }, { enabled: Boolean(actor) });

  const items = useMemo(() => {
    const rows = live.data as EducationResource[];
    return rows.filter((row) => row.status === 'PUBLISHED' && (stage === 'ALL' || row.stage === stage));
  }, [live.data, stage]);

  const stagesPresent = useMemo(() => {
    const present = new Set((live.data as EducationResource[]).filter((row) => row.status === 'PUBLISHED').map((row) => row.stage));
    return EDUCATION_STAGES.filter((value) => present.has(value));
  }, [live.data]);

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="Resources"
        title="Reading for each stage, and the guidance behind it"
        lede="The education library holds the material this deployment has published for mothers and health workers, in the languages it supports. Alongside it, the published guidance the care model is built on — linked to its publisher, never restated in our words."
        image="maternalEducation"
        imageCaption="Health education at an antenatal session, given in the mother’s own language."
        actions={
          actor ? (
            <ButtonLink to={actor.role === 'MOTHER' ? '/home/education' : '/app/education'} icon={<ArrowRight className="size-4" aria-hidden />}>
              Open the full library
            </ButtonLink>
          ) : (
            <>
              <ButtonLink to="/register" icon={<ArrowRight className="size-4" aria-hidden />}>
                Create an account
              </ButtonLink>
              <ButtonLink to="/signin" variant="secondary" icon={<LogIn className="size-4" aria-hidden />}>
                Sign in
              </ButtonLink>
            </>
          )
        }
      />

      {/* ── The published library ────────────────────────────────────── */}
      <PublicSection
        id="library"
        tone="tint"
        eyebrow="This deployment"
        title="The education library"
        description="Read live from the library an administrator publishes. A published item is available to the audience it was written for; a draft is never shown here."
        actions={
          stagesPresent.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setStage('ALL')} aria-pressed={stage === 'ALL'} className={stage === 'ALL' ? 'chip chip-active' : 'chip'}>
                All stages
              </button>
              {stagesPresent.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setStage(value)}
                  aria-pressed={stage === value}
                  className={stage === value ? 'chip chip-active' : 'chip'}
                >
                  {EDUCATION_STAGE_LABELS[value]}
                </button>
              ))}
            </div>
          ) : null
        }
      >
        {!actor ? (
          <NoticeState
            tone="info"
            title="The library opens with an account"
            actions={
              <>
                <ButtonLink to="/register" size="sm">
                  Create an account
                </ButtonLink>
                <ButtonLink to="/signin" variant="secondary" size="sm">
                  Sign in
                </ButtonLink>
              </>
            }
          >
            Published reading is delivered through the data layer, which only serves it to a signed-in account — a mother sees the items
            written for mothers, a health worker sees the items written for staff. Signing in is free. The published guidance below is
            open to everyone.
          </NoticeState>
        ) : live.loading ? (
          <LoadingRows rows={4} />
        ) : items.length > 0 ? (
          <div className="space-y-4">
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {items.map((item) => (
                <li key={item.id} className="card flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone="brand">{EDUCATION_STAGE_LABELS[item.stage] ?? item.stage}</Badge>
                    {item.audience.includes('MOTHER') ? <Badge tone="green">For mothers</Badge> : null}
                    {item.audience.includes('HEALTH_WORKER') ? <Badge tone="purple">For staff</Badge> : null}
                  </div>
                  <h3 className="text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
                  <p className="muted flex-1">{item.summary}</p>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-ink-100 pt-2.5 text-[0.76rem] text-ink-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 className="size-3" aria-hidden />
                      {item.readingMinutes} min read
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Languages className="size-3" aria-hidden />
                      {item.language}
                    </span>
                    {item.reviewedAt ? <span>Reviewed {new Date(item.reviewedAt).toLocaleDateString()}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
            <p className="caption">
              {items.length} published item{items.length === 1 ? '' : 's'}
              {stage === 'ALL' ? '' : ` for ${EDUCATION_STAGE_LABELS[stage] ?? stage}`}. Only items your account may read are listed.
            </p>
          </div>
        ) : live.error ? (
          <NoticeState tone="warning" title="The library could not be read">
            {live.error} Try again in a moment, or open it from your workspace.
          </NoticeState>
        ) : (
          <EmptyState
            icon={<Library className="size-5" aria-hidden />}
            title={stage === 'ALL' ? 'Nothing published yet' : `Nothing published for ${EDUCATION_STAGE_LABELS[stage] ?? stage}`}
            description={
              actor?.role === 'ADMIN' || actor?.role === 'FACILITY_SUPERVISOR'
                ? 'Publish reading from the education screen in your workspace, choosing the audience and language it is written for.'
                : 'Your facility has not published reading for this audience yet. The published guidance below is open to everyone.'
            }
            action={
              <ButtonLink
                to={actor?.role === 'MOTHER' ? '/home/education' : '/app/education'}
                variant="secondary"
                size="sm"
              >
                Open the education screen
              </ButtonLink>
            }
          />
        )}
      </PublicSection>

      {/* ── Published guidance ───────────────────────────────────────── */}
      <PublicSection
        eyebrow="Published guidance"
        title="The evidence behind the care model"
        description="Linked to the publisher rather than summarised here. These are the sources the thresholds, the danger-sign list and the contact schedule follow."
      >
        <ul className="grid gap-3 md:grid-cols-2">
          {PUBLIC_RESOURCES.map((resource) => (
            <li key={resource.key}>
              <a
                href={resource.href}
                target="_blank"
                rel="noreferrer noopener"
                className="card flex h-full flex-col gap-1.5 p-4 transition-shadow hover:shadow-[var(--shadow-pop)]"
              >
                <p className="micro flex items-center justify-between gap-2">
                  {resource.publisher}
                  <ExternalLink className="size-3 shrink-0 text-ink-300" aria-hidden />
                </p>
                <h3 className="text-[0.94rem] font-semibold text-ink-900">{resource.title}</h3>
                <p className="muted flex-1">{resource.detail}</p>
              </a>
            </li>
          ))}
        </ul>
        <p className="caption mt-4">
          External links open the publisher’s own site. MAMA CARE does not host these documents and does not control their content.
        </p>
      </PublicSection>

      {/* ── What is covered ──────────────────────────────────────────── */}
      <PublicSection tone="ink" eyebrow="Coverage" title="What the library is written to cover">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <h3 className="h3 !text-white flex items-center gap-2">
              <GraduationCap className="size-4 text-brand-300" aria-hidden />
              Topics authored by facility teams
            </h3>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {EDUCATION_TOPICS.map((topic) => (
                <li key={topic} className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-[0.78rem] text-brand-100/85">
                  {topic}
                </li>
              ))}
            </ul>
            <h3 className="h3 !text-white mt-6 flex items-center gap-2">
              <Stethoscope className="size-4 text-brand-300" aria-hidden />
              And the thirteen danger signs, screened at every visit
            </h3>
            <ul className="mt-3 grid gap-x-5 gap-y-1.5 sm:grid-cols-2">
              {PUBLIC_DANGER_SIGNS.map((sign) => (
                <li key={sign.key} className="flex items-start gap-2 text-[0.82rem] leading-snug text-brand-100/80">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                  {sign.title}
                </li>
              ))}
            </ul>
            <p className="caption mt-4 !text-brand-100/60">
              Each sign is recorded on the visit, with a positive “none reported” confirmation so the absence of symptoms is documented
              rather than assumed.
            </p>
          </div>
          <div className="space-y-4">
            <AppImage name="ancConsultation" ratio="16 / 10" caption="Counselling at a routine contact — recorded on the visit, not on a scrap of paper." />
            <div className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <h3 className="text-[0.98rem] font-semibold text-white flex items-center gap-2">
                <BookOpen className="size-4 text-brand-300" aria-hidden />
                For the team writing it
              </h3>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">
                A supervisor authors each item, chooses the audience and language, and marks it published. A draft is visible to staff only;
                a published item is available to the audience it was written for and is delivered in that language.
              </p>
              <Link to="/for-clinics" className="mt-3 inline-flex items-center gap-1 text-[0.84rem] font-semibold text-brand-200 hover:underline">
                How a facility sets up <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      <PublicSection eyebrow="Next" title="Where to go from here">
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink to="/maternal-health">Maternal health guidance</ButtonLink>
          <ButtonLink to="/how-it-works" variant="secondary">
            How it works
          </ButtonLink>
          <ButtonLink to="/faq" variant="quiet">
            Questions and answers
          </ButtonLink>
        </div>
      </PublicSection>
    </PublicShell>
  );
}

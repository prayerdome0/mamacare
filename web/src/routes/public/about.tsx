import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Database,
  FileSearch,
  Fingerprint,
  Lock,
  Scale,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { LiveStats } from '@/routes/public/live-stats';
import { ABOUT, SITE } from '@/config/site-content';

/**
 * About the platform.
 *
 * The landing page carries a short version of this; this page carries the whole
 * argument — the problem, the approach, the principles, the governance position
 * and what the platform deliberately does not do. The counts in the middle are
 * read from the database as the page loads (`LiveStats`), so a number on this
 * page is either real or labelled as a published reference standard.
 */
export default function AboutPage() {
  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="About"
        title="A pregnancy record that survives the next visit"
        lede={ABOUT.approach}
        image="aboutPlatform"
        imageCaption="Clinic overview: alerts, attendance and coverage counted from stored records."
        actions={
          <>
            <ButtonLink to="/services" icon={<ArrowRight className="size-4" aria-hidden />}>
              What the platform does
            </ButtonLink>
            <ButtonLink to="/for-clinics" variant="secondary">
              For clinics
            </ButtonLink>
          </>
        }
      />

      {/* ── The problem, and the approach ────────────────────────────── */}
      <PublicSection tone="tint" eyebrow="Why it exists" title="The paper card does not travel">
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <AppImage name="clinicEnvironment" ratio="16 / 10" caption="Records and reception at a typical urban health post." />
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <Scale className="size-4 text-brand-700" aria-hidden />
                What this software is not
              </h3>
              <p className="muted mt-2">
                MAMA CARE is not a medical device and never draws a clinical conclusion. It records what a clinician measured and states
                which recorded value crossed which configured threshold. The assessment, the diagnosis and the treatment remain with the
                clinical team.
              </p>
            </div>
          </div>
          <div>
            <p className="prose-mamacare">{ABOUT.problem}</p>
            <p className="prose-mamacare mt-4">
              The consequence is not only a missing number. A mother who moves between two facilities starts again; a referral that leaves
              on a slip of paper has no receipt; a mother who does not return is discovered late. Each of those is a record problem before
              it is a clinical one, and each is what this platform is built to close.
            </p>
          </div>
        </div>
      </PublicSection>

      {/* ── Live counts ──────────────────────────────────────────────── */}
      <PublicSection
        eyebrow="This deployment"
        title="Counted from the database, not written into the page"
        description="Every figure below is read as the page loads. Clinical totals are shown to signed-in staff only, because they are not public records; a signed-out visitor sees the published reference standards instead."
      >
        <LiveStats />
      </PublicSection>

      {/* ── Principles ───────────────────────────────────────────────── */}
      <PublicSection tone="ink" eyebrow="Principles" title="Four rules the implementation follows">
        <div className="grid gap-4 md:grid-cols-2">
          {ABOUT.principles.map((principle, index) => (
            <article key={principle.title} className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-[0.78rem] font-bold text-brand-200 tnum">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-[1rem] font-semibold text-white">{principle.title}</h3>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">{principle.detail}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── Governance ───────────────────────────────────────────────── */}
      <PublicSection
        eyebrow="Clinical governance"
        title="A starting configuration, not approved guidance"
        description={ABOUT.governance}
      >
        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              icon: <Stethoscope className="size-4" aria-hidden />,
              title: 'Reviewed before use',
              body: 'The clinical authority reviews each rule — value, threshold, severity and wording — and signs it off. Until then the rule set is marked as awaiting review.',
            },
            {
              icon: <FileSearch className="size-4" aria-hidden />,
              title: 'Recorded on the settings screen',
              body: 'Who reviewed the rules and when is stored with the configuration, so the sign-off can be produced later rather than remembered.',
            },
            {
              icon: <ShieldCheck className="size-4" aria-hidden />,
              title: 'Editable with a trail',
              body: 'An administrator can change a threshold. The change is written to the append-only audit log and the rule is marked as needing sign-off again.',
            },
          ].map((item) => (
            <article key={item.title} className="card p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
              <h3 className="mt-3 text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
              <p className="muted mt-1.5">{item.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── Security posture ─────────────────────────────────────────── */}
      <PublicSection
        tone="tint"
        eyebrow="How it is protected"
        title="Permissions live with the data, not with the menu"
        description="The interface hides what you cannot do; it is never the protection. Enforcement happens in database security rules against the authenticated token, and every privileged action is written to an append-only audit log."
        actions={
          <ButtonLink to="/privacy" variant="secondary" size="sm">
            Privacy and data
          </ButtonLink>
        }
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: <Lock className="size-4" aria-hidden />, title: 'No secrets in the browser', body: 'The client holds only public configuration. Upload presets, the SMS key and privileged writes happen on the server.' },
            { icon: <Fingerprint className="size-4" aria-hidden />, title: 'Roles from verified claims', body: 'Roles come from authentication claims and are checked again against the stored profile. A sign-up can never choose administrator for itself.' },
            { icon: <ShieldCheck className="size-4" aria-hidden />, title: 'Row-level access', body: 'Staff read records at their facility, a mother reads only her own, and reports carry an explicit access list enforced on read.' },
            { icon: <Database className="size-4" aria-hidden />, title: 'The same matrix twice', body: 'The policy module and the database rules implement one access matrix, so behaviour is identical from the interface, a stolen browser or a script.' },
          ].map((item) => (
            <article key={item.title} className="card p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
              <h3 className="mt-3 text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
              <p className="muted mt-1.5">{item.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Badge tone="neutral">Operated by {SITE.org.name}</Badge>
          <Badge tone="neutral">{SITE.org.address}</Badge>
          <Badge tone="neutral">Records held under the facility’s retention policy</Badge>
        </div>
      </PublicSection>

      {/* ── Where to go next ─────────────────────────────────────────── */}
      <PublicSection eyebrow="Next" title="Where to go from here">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[
            { to: '/how-it-works', title: 'How it works', detail: 'The lifecycle from registration to postnatal, and where each piece of data lives.', image: 'appointmentCheckin' as const },
            { to: '/for-clinics', title: 'For clinics', detail: 'The six steps to adopt the platform, and who has to sign off what.', image: 'midwifeConsultation' as const },
            { to: '/for-mothers', title: 'For mothers', detail: 'What an account shows you, and what it never shows anyone else.', image: 'motherNewborn' as const },
          ].map((item) => (
            <Link key={item.to} to={item.to} className="card group flex flex-col overflow-hidden transition-shadow hover:shadow-[var(--shadow-pop)]">
              <AppImage name={item.image} ratio="16 / 8" rounded={false} />
              <div className="flex flex-1 flex-col p-4.5">
                <h3 className="h3 flex items-center gap-1.5">
                  {item.title}
                  <ArrowRight className="size-4 text-ink-300 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </h3>
                <p className="muted mt-1.5">{item.detail}</p>
              </div>
            </Link>
          ))}
        </div>
      </PublicSection>
    </PublicShell>
  );
}

import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CircleDot,
  ClipboardCheck,
  CloudOff,
  Database,
  FileSearch,
  LifeBuoy,
  Phone,
  Repeat,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { CARE_LIFECYCLE, DATA_FLOW, EMERGENCY_CONTACTS } from '@/config/site-content';
import { telHref } from '@/lib/utils';

/**
 * How it works.
 *
 * The lifecycle a pregnancy follows on the platform, the shape of a single
 * visit, where each piece of data physically lives, and what the software does
 * when the network or an integration fails. Written to match the implementation
 * rather than an idealised flow.
 */
export default function HowItWorksPage() {
  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="How it works"
        title="One record, from registration to the six-week check"
        lede="A pregnancy moves through six stages on this platform. Each one is recorded in a fixed format so the visits can be compared, the alerts can carry their evidence, and a referral can arrive complete at the other end."
        image="appointmentCheckin"
        imageCaption="Check-in at an antenatal clinic: the appointment list is read from the same record."
        actions={
          <>
            <ButtonLink to="/services" icon={<ArrowRight className="size-4" aria-hidden />}>
              What the platform does
            </ButtonLink>
            <ButtonLink to="/maternal-health" variant="secondary">
              Maternal health guidance
            </ButtonLink>
          </>
        }
      >
        <ul className="mt-7 flex flex-wrap gap-1.5 border-t border-ink-200 pt-5">
          {CARE_LIFECYCLE.map((stage) => (
            <li key={stage.key}>
              <a href={`#${stage.key}`} className="chip">
                {stage.stage}
              </a>
            </li>
          ))}
        </ul>
      </PublicPageHeader>

      {/* ── Lifecycle ────────────────────────────────────────────────── */}
      <PublicSection
        tone="tint"
        eyebrow="The lifecycle"
        title="Six stages, recorded on one record"
        description="Each stage names what is captured at that point. Nothing here is a conclusion the software draws — the assessment at every stage belongs to the clinician."
      >
        <ol className="relative space-y-5 border-l border-ink-200 pl-6 sm:pl-8">
          {CARE_LIFECYCLE.map((stage, index) => (
            <li key={stage.key} id={stage.key} className="card scroll-mt-24 p-5 sm:p-6">
              <span className="absolute -left-[0.72rem] grid size-6 place-items-center rounded-full border border-ink-200 bg-white text-[0.68rem] font-bold text-brand-800 tnum">
                {index + 1}
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{stage.stage}</Badge>
                <span className="micro text-ink-500">{stage.weeks}</span>
              </div>
              <h3 className="h3 mt-3">{stage.title}</h3>
              <p className="muted mt-2 max-w-3xl">{stage.body}</p>
              <ul className="mt-4 grid gap-2 border-t border-ink-100 pt-4 sm:grid-cols-2">
                {stage.recorded.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-[0.82rem] leading-snug text-ink-600">
                    <ClipboardCheck className="mt-0.5 size-3.5 shrink-0 text-brand-700" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </PublicSection>

      {/* ── A single visit ───────────────────────────────────────────── */}
      <PublicSection
        eyebrow="A single visit"
        title="What is captured at one antenatal contact"
        description="The visit form is deliberately fixed. The same fields, in the same order, every time — which is what makes a trend possible and a rule evaluable at the moment of saving."
      >
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <AppImage name="screening" ratio="16 / 10" caption="Blood pressure and urine testing at a screening station." />
            <AppImage name="obstetricUltrasound" ratio="16 / 9" caption="Dating at the first contact — gestational age is measured, never guessed." />
          </div>
          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="h3">Observations</h3>
              <p className="muted mt-1.5">Blood pressure, pulse, temperature, respirations, weight, MUAC, fundal height, fetal heart rate.</p>
              <h3 className="h3 mt-4">Tests and treatment</h3>
              <p className="muted mt-1.5">Urine findings, haemoglobin, other laboratory results, medications given and supplements started.</p>
              <h3 className="h3 mt-4">The danger-sign screen</h3>
              <p className="muted mt-1.5">
                Thirteen recognised signs plus a free-text concern, with a positive “none reported” confirmation — so the absence of
                symptoms is documented rather than assumed.
              </p>
              <h3 className="h3 mt-4">Counselling and plan</h3>
              <p className="muted mt-1.5">What was discussed, the plan agreed, and the next appointment before the mother leaves.</p>
            </div>
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <CircleDot className="size-4 text-brand-700" aria-hidden />
                Rules run on save
              </h3>
              <p className="muted mt-2">
                The moment the visit is saved, every configured rule is evaluated against the values just recorded. A value that crosses a
                threshold raises an alert immediately, with the reading and the threshold shown side by side, and the alert states the
                assessment required — never a diagnosis.
              </p>
              <Link to="/services#capabilities" className="mt-3 inline-flex items-center gap-1 text-[0.84rem] font-semibold text-brand-800 hover:underline">
                How alerts are worded <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      {/* ── Where the data lives ─────────────────────────────────────── */}
      <PublicSection tone="ink" eyebrow="Where the data lives" title="From the clinic device to the audit log">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {DATA_FLOW.map((item, index) => (
            <article key={item.key} className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-[0.78rem] font-bold text-brand-200 tnum">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-[1rem] font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">{item.body}</p>
            </article>
          ))}
          <article className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
            <span className="grid size-8 place-items-center rounded-lg bg-white/10 text-brand-200">
              <FileSearch className="size-4" aria-hidden />
            </span>
            <h3 className="mt-3 text-[1rem] font-semibold text-white">And what never leaves</h3>
            <p className="mt-2 text-[0.86rem] leading-relaxed text-brand-100/80">
              No patient name or clinical value is ever published on a public page or drawn in an aggregate chart. Secrets, upload
              credentials and the SMS key are never shipped to the browser at all.
            </p>
          </article>
        </div>
        <p className="caption mt-5 !text-brand-100/60">
          <Database className="mr-1 inline size-3" aria-hidden />
          Where no cloud project is configured, a build runs entirely on the device using the same permission model and the same rules
          engine — and the service status page says so plainly.
        </p>
      </PublicSection>

      {/* ── Failure modes ────────────────────────────────────────────── */}
      <PublicSection
        tone="tint"
        eyebrow="When things fail"
        title="Designed for shared devices on unreliable networks"
        description="Clinic hardware and connectivity are the working conditions, not an edge case. These are the behaviours that follow from that."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {[
            {
              icon: <CloudOff className="size-4" aria-hidden />,
              title: 'The network drops mid-visit',
              body: 'The save is retried rather than discarded, and a save is idempotent — replaying the same submission cannot create a second record. Nothing is held only in memory.',
            },
            {
              icon: <Repeat className="size-4" aria-hidden />,
              title: 'A request is sent twice',
              body: 'Duplicate submissions resolve to one record. The record layer treats a replayed write as the same operation, so a flaky connection does not produce two visits.',
            },
            {
              icon: <ShieldCheck className="size-4" aria-hidden />,
              title: 'Storage is blocked in the browser',
              body: 'Safari private windows and partitioned iframes refuse localStorage. The app renders with a warning instead of failing, and the session simply lasts for that tab.',
            },
            {
              icon: <Wifi className="size-4" aria-hidden />,
              title: 'An integration is not configured',
              body: 'Push without SMS, or bundled images without Cloudinary. The page degrades to what is available and states what is missing, rather than showing a broken frame.',
            },
          ].map((item) => (
            <article key={item.title} className="card flex gap-3 p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
              <div>
                <h3 className="text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
                <p className="muted mt-1.5">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <ButtonLink to="/status" variant="secondary" size="sm">
            Check this deployment’s status
          </ButtonLink>
          <Link to="/privacy" className="btn btn-ghost btn-sm">
            Privacy and data handling
          </Link>
        </div>
      </PublicSection>

      {/* ── Emergency ────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] py-11">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="section-eyebrow !text-[var(--color-risk-red-text)]">If it is an emergency</p>
            <h2 className="display-2 mt-2">None of this replaces moving her to a facility</h2>
            <p className="lede mt-3 max-w-2xl">
              The platform routes routine care and follow-up. Convulsions, heavy bleeding, a prolapsed cord, severe breathlessness or
              obstructed labour are physical emergencies: go now, take the record or a phone with it open, and call ahead.
            </p>
            <p className="muted mt-3 max-w-2xl">{EMERGENCY_CONTACTS.note}</p>
          </div>
          <div className="lg:w-[330px]">
            <a
              href={telHref(EMERGENCY_CONTACTS.lines[0]!.number)}
              className="card flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <span className="flex items-center gap-2 text-[0.8rem] font-medium text-ink-600">
                <LifeBuoy className="size-4 text-[var(--color-risk-red)]" aria-hidden />
                {EMERGENCY_CONTACTS.lines[0]!.label}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[0.95rem] font-bold text-ink-900 tnum">
                <Phone className="size-3.5 text-[var(--color-risk-red)]" aria-hidden />
                {EMERGENCY_CONTACTS.lines[0]!.number}
              </span>
            </a>
            <Link to="/emergency" className="btn btn-danger btn-sm mt-3 w-full">
              Full emergency guidance
            </Link>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

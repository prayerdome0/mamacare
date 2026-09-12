import { Link } from 'react-router-dom';
import { ArrowRight, BookOpenCheck, HeartPulse, Phone, ShieldAlert } from 'lucide-react';
import { PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { EMERGENCY_CONTACTS, MATERNAL_HEALTH, PUBLIC_DANGER_SIGNS } from '@/config/site-content';
import { telHref } from '@/lib/utils';

/**
 * Maternal-health information page. Public education content only: general,
 * well-established guidance, always phrased as "seek assessment", never a
 * diagnosis and never advice about an individual case.
 */
export default function MaternalHealthPage() {
  return (
    <PublicShell>
      <div className="relative bg-white">
        <div className="shell grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-16">
          <div>
            <p className="section-eyebrow">Maternal health</p>
            <h1 className="display-2 mt-2.5">Most complications are findable — if you look at every visit</h1>
            <p className="lede mt-4 max-w-2xl">{MATERNAL_HEALTH.intro}</p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              <ButtonLink to="/emergency" variant="danger" icon={<ShieldAlert className="size-4" aria-hidden />}>
                Emergency guidance
              </ButtonLink>
              <ButtonLink to="/#services" variant="secondary" icon={<ArrowRight className="size-4" aria-hidden />}>
                How the platform helps
              </ButtonLink>
            </div>
          </div>
          <AppImage name="screening" ratio="4 / 3" priority caption="Blood pressure and urine testing at a routine antenatal contact." />
        </div>
      </div>

      <PublicSection tone="tint" eyebrow="Practice" title="Six things that change outcomes">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {MATERNAL_HEALTH.who.map((item, index) => (
            <article key={item.title} className="card p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-brand-50 text-[0.78rem] font-bold text-brand-800 tnum">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-[0.98rem] font-semibold text-ink-900">{item.title}</h3>
              <p className="muted mt-1.5">{item.body}</p>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <AppImage
            name="obstetricUltrasound"
            ratio="4 / 3"
            caption="A dating scan at the first antenatal contact — gestational age is measured, never guessed."
          />
          <AppImage name="newbornWeighing" ratio="4 / 3" caption="The day-one weight check, recorded on the same record as the pregnancy." />
        </div>
      </PublicSection>

      <PublicSection eyebrow="Warning signs" title="When to be seen today, not at the next appointment" description="Every one of these needs an examination the same day. None of them is a diagnosis on its own — that is why an assessment is what is required.">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {PUBLIC_DANGER_SIGNS.map((sign) => (
            <article key={sign.key} className="card flex items-start gap-3 p-4">
              <span className="mt-1 size-2 shrink-0 rounded-full bg-[var(--color-risk-red)]" aria-hidden />
              <div className="min-w-0">
                <h3 className="text-[0.9rem] font-semibold text-ink-900">{sign.title}</h3>
                <p className="muted mt-1">{sign.detail}</p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card overflow-hidden">
            <AppImage name="midwifeConsultation" ratio="16 / 7" rounded={false} />
            <div className="p-5">
              <h3 className="h3 flex items-center gap-2">
                <HeartPulse className="size-4 text-brand-700" aria-hidden />
                What a good antenatal contact contains
              </h3>
              <ul className="muted mt-3 space-y-1.5 text-sm">
                {MATERNAL_HEALTH.records.map((record) => (
                  <li key={record.label}>
                    <span className="font-semibold text-ink-800">{record.label}.</span> {record.detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] p-5">
              <h3 className="h3 text-[var(--color-risk-red-text)]">If a danger sign appears</h3>
              <ol className="mt-3 space-y-2 text-[0.86rem] leading-relaxed text-ink-700">
                <li>1. Go to the nearest facility now. Take the antenatal card or a phone with the record open.</li>
                <li>2. Call ahead if it is safe to do so — the team can prepare supplies and a bed.</li>
                <li>3. Do not wait for the next appointment, and do not travel alone in an emergency.</li>
                <li>4. If transport is not available, telephone the number below and ask for help arranging it.</li>
              </ol>
              <a href={telHref(EMERGENCY_CONTACTS.lines[0]!.number)} className="btn btn-danger btn-sm mt-4 w-full">
                <Phone className="size-4" aria-hidden />
                Call {EMERGENCY_CONTACTS.lines[0]!.label} · {EMERGENCY_CONTACTS.lines[0]!.number}
              </a>
            </div>
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <BookOpenCheck className="size-4 text-brand-700" aria-hidden />
                For facility teams
              </h3>
              <p className="muted mt-2">
                MAMA CARE screens the thirteen recognised danger signs at every visit and records a positive “none reported” confirmation, so
                the absence of symptoms is documented rather than assumed.
              </p>
              <Link to="/#services" className="mt-3 inline-flex items-center gap-1 text-[0.84rem] font-semibold text-brand-800 hover:underline">
                See the visit form and alert rules <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      <PublicSection tone="brand" eyebrow="After birth" title="The risk does not end at delivery">
        <div className="grid gap-4 lg:grid-cols-3">
          {[
            { title: 'First 24 hours', body: 'Heavy bleeding, fever, severe pain, breathlessness or a seizure need immediate assessment. Postnatal checks are scheduled before the mother leaves the facility.' },
            { title: 'First week', body: 'Infection, breast problems, severe headache or visual change can all appear after a normal delivery. Bring the blood pressure cuff reading from home if you have one.' },
            { title: 'Six weeks and beyond', body: 'Emotional wellbeing, feeding, contraception and the next pregnancy are part of postnatal care. A visit at six weeks is the minimum, not the target.' },
          ].map((item) => (
            <article key={item.title} className="rounded-[var(--radius-card)] border border-white/12 bg-white/[0.05] p-5">
              <h3 className="text-[0.98rem] font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-[0.84rem] leading-relaxed text-brand-100/80">{item.body}</p>
            </article>
          ))}
        </div>
        <p className="caption mt-6 !text-brand-100/60">
          This page is general health information for the public. It is not a substitute for assessment by a clinician, and it does not
          reflect any individual’s records.
        </p>
      </PublicSection>
    </PublicShell>
  );
}

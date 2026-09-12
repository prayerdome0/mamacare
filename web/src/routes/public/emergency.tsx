import { Link } from 'react-router-dom';
import { AlertTriangle, Phone, Route, Siren } from 'lucide-react';
import { PublicShell } from '@/components/layout/public-shell';
import { ButtonLink } from '@/components/ui/button';
import { AppImage } from '@/components/media/app-image';
import { EMERGENCY_CONTACTS, PUBLIC_DANGER_SIGNS } from '@/config/site-content';
import { telHref } from '@/lib/utils';

const FIRST_STEPS = [
  {
    title: 'Do not wait',
    body: 'Convulsions, heavy bleeding, a prolapsed cord, severe breathlessness or obstructed labour are emergencies. Start moving the mother to a facility while someone else arranges transport.',
  },
  {
    title: 'Take the record',
    body: 'The antenatal card, or a phone with MAMA CARE open on the mother’s own account, tells the receiving facility her gestational age, blood pressure trend, allergies and previous births.',
  },
  {
    title: 'Send the details ahead',
    body: 'Telephone the labour ward: patient ID, age, gestational age, what happened, her vital signs if they were taken, and what you are giving her now. A facility that expects a mother prepares blood, drugs and a bed.',
  },
  {
    title: 'Position her safely',
    body: 'With a prolapsed cord, keep her on hands and knees or with the hips raised and do not push the cord back. In late pregnancy, position her slightly on her left side rather than flat on her back.',
  },
];

export default function EmergencyPage() {
  return (
    <PublicShell>
      <section className="border-b border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)]">
        <div className="shell grid gap-8 py-12 lg:grid-cols-[1.1fr_0.9fr] lg:py-16">
          <div>
            <p className="inline-flex items-center gap-2 text-[0.72rem] font-bold tracking-[0.16em] text-[var(--color-risk-red-text)] uppercase">
              <Siren className="size-4" aria-hidden />
              Emergency guidance
            </p>
            <h1 className="display mt-3">Act first, then inform</h1>
            <p className="lede mt-4 max-w-2xl">
              In an obstetric emergency the useful actions are physical: move the mother to a facility, keep her positioned safely, and let
              the receiving team know she is coming. This page lists the numbers to call and the details worth saying out loud. It is general
              guidance and does not replace the instructions of the clinical team with her.
            </p>
            <div className="mt-6 flex flex-wrap gap-2.5">
              {EMERGENCY_CONTACTS.lines.map((line) => (
                <a
                  key={line.label}
                  href={telHref(line.number)}
                  className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-risk-red-border)] bg-white px-3.5 py-2.5 text-[0.86rem] font-semibold text-ink-900 shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-risk-red)]"
                >
                  <Phone className="size-4 text-[var(--color-risk-red)]" aria-hidden />
                  {line.label}
                  <span className="rounded bg-[var(--color-risk-red-soft)] px-1.5 py-0.5 tnum">{line.number}</span>
                </a>
              ))}
            </div>
            <p className="mt-4 max-w-2xl text-[0.82rem] leading-relaxed text-ink-600">{EMERGENCY_CONTACTS.note}</p>
          </div>
          <AppImage name="motherNewborn" ratio="4 / 3" priority caption="Stabilising mother and newborn after an urgent delivery." />
        </div>
      </section>

      <section className="shell py-12">
        <div className="grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h2 className="display-2">First steps for whoever is with her</h2>
            <ol className="mt-5 space-y-4">
              {FIRST_STEPS.map((step, index) => (
                <li key={step.title} className="card flex gap-4 p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-950 text-[0.78rem] font-bold text-white tnum">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-[0.94rem] font-semibold text-ink-900">{step.title}</h3>
                    <p className="muted mt-1">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              <AppImage
                name="referralTransport"
                ratio="16 / 9"
                caption="Referral transport waiting at a rural health post — the journey is part of the emergency."
              />
            </div>
          </div>

          <div className="space-y-5">
            <div className="card overflow-hidden">
              <div className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-5 py-3">
                <Route className="size-4 text-brand-700" aria-hidden />
                <h3 className="h3">What to tell the receiving facility</h3>
              </div>
              <ul className="divide-y divide-ink-100 px-5">
                {[
                  ['Patient ID', 'the MAMA CARE identifier (e.g. MC-000245) or the clinic card number'],
                  ['Age and parity', 'how old she is, how many births she has had'],
                  ['Gestational age', 'weeks, and how it was dated (last period or ultrasound)'],
                  ['What happened', 'bleeding amount, time of rupture, contractions so far, any fit'],
                  ['Last observations', 'blood pressure, pulse, temperature if taken, fetal movements'],
                  ['Given already', 'drugs, fluids, oxytocin, magnesium — with times'],
                  ['Arrival', 'how you are travelling and when you expect to arrive'],
                ].map(([label, detail]) => (
                  <li key={label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-3">
                    <span className="micro w-32 shrink-0 pt-1 text-brand-700">{label}</span>
                    <span className="text-[0.86rem] leading-snug text-ink-700">{detail}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <AlertTriangle className="size-4 text-[var(--color-risk-amber-text)]" aria-hidden />
                Warning signs that need assessment today
              </h3>
              <ul className="muted mt-3 grid gap-1.5 text-[0.84rem] sm:grid-cols-2">
                {PUBLIC_DANGER_SIGNS.map((sign) => (
                  <li key={sign.key} className="flex items-start gap-2">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-risk-red)]" aria-hidden />
                    {sign.title}
                  </li>
                ))}
              </ul>
              <p className="caption mt-3">
                In the app these are the thirteen items on the ANC danger-sign screen, plus a free-text “other” entry. Reporting one raises a
                red or amber alert for the clinical team — it never states a diagnosis.
              </p>
            </div>

            <div className="card p-5">
              <h3 className="h3">Facility teams</h3>
              <p className="muted mt-2">
                Keep your own labour-ward, referral-point and ambulance numbers on this page for your deployment by setting the{' '}
                <code className="rounded bg-ink-100 px-1 py-0.5 text-[0.78rem]">VITE_EMERGENCY_*</code> variables. Residents and mothers
                should never have to search for a number in a hurry.
              </p>
              <div className="mt-3.5 flex flex-wrap gap-2">
                <ButtonLink to="/contact" size="sm" variant="secondary">
                  Deployment configuration
                </ButtonLink>
                <Link to="/maternal-health" className="btn btn-ghost btn-sm">
                  Maternal health information
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PublicShell>
  );
}

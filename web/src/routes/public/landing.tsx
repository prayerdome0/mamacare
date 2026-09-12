import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  ClipboardList,
  FileSearch,
  Fingerprint,
  HeartPulse,
  LifeBuoy,
  Lock,
  Phone,
  ShieldCheck,
  Stethoscope,
  Users,
} from 'lucide-react';
import { PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { ABOUT, EMERGENCY_CONTACTS, MATERNAL_HEALTH, PUBLIC_DANGER_SIGNS, SERVICES, SITE, STATS } from '@/config/site-content';
import { useHashScroll } from '@/routes/guards';
import { useSession } from '@/providers/app-providers';
import { telHref } from '@/lib/utils';
import { FaqList } from '@/routes/public/faq';
import { ContactForm } from '@/routes/public/contact-form';

export default function LandingPage() {
  useHashScroll();
  const { actor } = useSession();

  return (
    <PublicShell>
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="grid-fade pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-70" aria-hidden />
        <div className="shell relative grid items-center gap-10 py-12 lg:grid-cols-[1.05fr_0.95fr] lg:py-20">
          <div className="max-w-2xl">
            <Badge tone="brand" icon={<BadgeCheck className="size-3.5" aria-hidden />}>
              Antenatal records · alerts · referrals · reminders
            </Badge>
            <h1 className="display mt-4">Better Maternal Care. Connected.</h1>
            <p className="lede mt-5 max-w-xl">
              MAMA CARE gives a clinic one structured record for every pregnancy — observations captured the same way at each visit, alerts
              that point to the assessment a finding requires, referrals that arrive complete, and mothers who can see their own next
              appointment.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <ButtonLink to={actor ? (actor.role === 'MOTHER' ? '/home' : '/app') : '/register'} size="lg" icon={<ArrowRight className="size-4" aria-hidden />}>
                {actor ? 'Open your workspace' : 'Create an account'}
              </ButtonLink>
              <ButtonLink to="/signin" variant="secondary" size="lg">
                Staff sign in
              </ButtonLink>
              <Link to="/emergency" className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-[var(--color-risk-red-text)] hover:underline">
                <LifeBuoy className="size-4" aria-hidden />
                Emergency guidance
              </Link>
            </div>
            <dl className="mt-9 grid max-w-lg grid-cols-2 gap-x-6 gap-y-4 border-t border-ink-200 pt-6 sm:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label}>
                  <dt className="text-2xl font-bold tracking-tight text-brand-800 tnum">{stat.value}</dt>
                  <dd className="mt-1 text-[0.72rem] leading-snug text-ink-500">{stat.label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <AppImage
              name="hero"
              ratio="4 / 3"
              priority
              overlay="gradient"
              sizes="(max-width: 1024px) 100vw, 560px"
              className="shadow-[var(--shadow-pop)]"
            />
            <figcaption className="caption absolute right-3 bottom-3 left-3 text-right text-white/85">
              A midwife reviewing an antenatal record with an accompanying family member.
            </figcaption>
            <div className="card absolute -bottom-6 -left-2 hidden w-64 p-3.5 backdrop-blur sm:block lg:-left-10">
              <p className="micro mb-2">Today at this facility</p>
              <ul className="space-y-2">
                <PreviewRow tone="red" title="BP 168/112 at 33 weeks" detail="Red alert · immediate assessment" />
                <PreviewRow tone="amber" title="Fundal height −3 cm" detail="Amber alert · review within 1 week" />
                <PreviewRow tone="green" title="18 appointments" detail="2 overdue · reminders sent" />
              </ul>
              <p className="caption mt-2.5 border-t border-ink-200 pt-2">
                Illustrative of the workflow only. No patient data is shown on this site.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── About ────────────────────────────────────────────────────── */}
      <PublicSection
        id="about"
        tone="tint"
        eyebrow="About MAMA CARE"
        title="A pregnancy record that survives the next visit"
        description={ABOUT.approach}
      >
        <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
          <div className="space-y-4">
            <AppImage name="aboutPlatform" ratio="16 / 10" caption="Clinic overview: alerts, attendance and coverage counted from stored records." />
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-brand-700" aria-hidden />
                Clinical governance first
              </h3>
              <p className="muted mt-2">{ABOUT.governance}</p>
            </div>
          </div>
          <div>
            <p className="prose-mamacare">{ABOUT.problem}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2">
              {ABOUT.principles.map((principle) => (
                <li key={principle.title} className="card p-4">
                  <p className="text-[0.88rem] font-semibold text-ink-900">{principle.title}</p>
                  <p className="muted mt-1.5">{principle.detail}</p>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/maternal-health" className="chip">
                Maternal health evidence <ArrowRight className="size-3.5" aria-hidden />
              </Link>
              <Link to="/privacy" className="chip">
                Privacy and data handling <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      {/* ── Services ─────────────────────────────────────────────────── */}
      <PublicSection
        id="services"
        eyebrow="Services"
        title="What the platform does at each step of care"
        description="Six capabilities that replace the paper card, the referral slip and the appointment book — on one record, with permissions enforced where the data lives."
        actions={
          <ButtonLink to="/register" variant="secondary" size="sm">
            Set up your facility
          </ButtonLink>
        }
      >
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {SERVICES.map((service) => (
            <article key={service.key} className="card group flex flex-col overflow-hidden">
              <AppImage name={service.image} ratio="16 / 9" rounded={false} className="overflow-hidden" />
              <div className="flex flex-1 flex-col p-5">
                <h3 className="h3">{service.title}</h3>
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

      {/* ── Workflow ─────────────────────────────────────────────────── */}
      <PublicSection tone="ink" eyebrow="How a visit runs" title="Booking to follow-up, in one continuous record">
        <div className="grid gap-4 lg:grid-cols-4">
          {[
            { icon: <Users className="size-4" aria-hidden />, step: '01', title: 'Register', body: 'Unique patient ID, consent, dating, contact and community health worker. Gestational age and due date are calculated, never typed as the key.', image: 'communityWorker' as const },
            { icon: <Stethoscope className="size-4" aria-hidden />, step: '02', title: 'Assess', body: 'Structured observations plus the thirteen danger signs, each with an explicit “none reported” confirmation.', image: 'ancConsultation' as const },
            { icon: <FileSearch className="size-4" aria-hidden />, step: '03', title: 'Act', body: 'Alerts with their evidence, referral packets with a receipt and outcome, investigations documented on the visit.', image: 'screening' as const },
            { icon: <CalendarClock className="size-4" aria-hidden />, step: '04', title: 'Follow up', body: 'Next appointment booked before she leaves, reminders on the mother’s device, missed visits raised for outreach.', image: 'appointmentCheckin' as const },
          ].map((item) => (
            <article key={item.step} className="flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-white/12 bg-white/[0.045]">
              <AppImage name={item.image} ratio="16 / 9" rounded={false} />
              <div className="flex flex-1 flex-col p-4">
                <div className="flex items-center gap-2 text-brand-300">
                  {item.icon}
                  <span className="micro text-brand-200/80">Step {item.step}</span>
                </div>
                <h3 className="mt-2 text-[1rem] font-semibold text-white">{item.title}</h3>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-brand-100/75">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── Maternal health information ──────────────────────────────── */}
      <PublicSection
        id="maternal-health"
        eyebrow="Maternal health"
        title="What good antenatal care looks like — and what to watch for"
        description={MATERNAL_HEALTH.intro}
        actions={
          <ButtonLink to="/maternal-health" variant="secondary" size="sm" icon={<ArrowRight className="size-4" aria-hidden />}>
            Read the full guidance
          </ButtonLink>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[1fr_0.85fr]">
          <div className="space-y-3">
            {MATERNAL_HEALTH.who.slice(0, 4).map((item) => (
              <article key={item.title} className="card p-4.5">
                <h3 className="h3 flex items-start gap-2">
                  <HeartPulse className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  {item.title}
                </h3>
                <p className="muted mt-1.5">{item.body}</p>
              </article>
            ))}
          </div>
          <div className="card overflow-hidden">
            <div className="border-b border-ink-200 bg-[var(--color-risk-red-soft)] px-5 py-4">
              <h3 className="h3 flex items-center gap-2 text-[var(--color-risk-red-text)]">
                <ClipboardList className="size-4" aria-hidden />
                Seek assessment today if you notice
              </h3>
              <p className="muted mt-1">These are recognised warning signs in pregnancy. They are not a diagnosis — they mean an examination is needed.</p>
            </div>
            <ul className="divide-y divide-ink-100">
              {PUBLIC_DANGER_SIGNS.slice(0, 8).map((sign) => (
                <li key={sign.key} className="flex items-start gap-2.5 px-5 py-2.5">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--color-risk-red)]" aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[0.86rem] font-semibold text-ink-900">{sign.title}</span>
                    <span className="mt-0.5 block text-[0.78rem] leading-snug text-ink-500">{sign.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
            <div className="border-t border-ink-200 px-5 py-4">
              <Link to="/emergency" className="inline-flex items-center gap-1.5 text-[0.84rem] font-semibold text-brand-800 hover:underline">
                Emergency guidance and numbers
                <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      {/* ── Emergency guidance band ──────────────────────────────────── */}
      <section id="emergency" className="scroll-mt-24 border-y border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] py-11">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="section-eyebrow !text-[var(--color-risk-red-text)]">Emergency</p>
            <h2 className="display-2 mt-2">If labour is obstructed, she is bleeding heavily or has a fit</h2>
            <p className="lede mt-3 max-w-2xl">
              Move the mother to a facility now, with a companion and her antenatal record or phone. Do not wait for an appointment, and do
              not wait for a reply to a message.
            </p>
            <p className="muted mt-3 max-w-2xl">{EMERGENCY_CONTACTS.note}</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:w-[330px] lg:grid-cols-1">
            {EMERGENCY_CONTACTS.lines.map((line) => (
              <li key={line.label}>
                <a
                  href={telHref(line.number)}
                  className="card flex items-center justify-between gap-3 px-4 py-3 transition-shadow hover:shadow-[var(--shadow-pop)]"
                >
                  <span className="text-[0.8rem] font-medium text-ink-600">{line.label}</span>
                  <span className="inline-flex items-center gap-1.5 text-[0.95rem] font-bold text-ink-900 tnum">
                    <Phone className="size-3.5 text-[var(--color-risk-red)]" aria-hidden />
                    {line.number}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Roles ────────────────────────────────────────────────────── */}
      <PublicSection tone="tint" eyebrow="Who uses it" title="One record, six sets of permissions">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <RoleCard
            title="Administrator"
            body="Approves health-worker accounts, sets facility configuration, reviews audit logs, and edits clinical thresholds — which are then marked as awaiting clinical sign-off."
            permissions={['User approval and roles', 'Facility and system settings', 'Audit log review']}
            image="clinicEnvironment"
          />
          <RoleCard
            title="Facility supervisor"
            body="Sees the whole facility roster, workloads and coverage; manages staff assignment, education content and alert response, and signs off reports."
            permissions={['Facility-wide records', 'Staff assignment', 'Reports and education']}
            image="midwifeConsultation"
          />
          <RoleCard
            title="Midwife and nurse"
            body="Registers mothers, records ANC visits, responds to alerts, creates referrals and schedules the next appointment before the mother leaves."
            permissions={['Full clinical entry', 'Alert response', 'Referrals and documents']}
            image="ancConsultation"
          />
          <RoleCard
            title="Community health worker"
            body="Sees the mothers in their catchment, records outreach and home visits, follows up missed appointments, and can prepare a referral for the clinic to sign."
            permissions={['Catchment roster', 'Follow-up notes', 'Referral drafting']}
            image="communityWorker"
          />
          <RoleCard
            title="Mother (patient account)"
            body="Her own dates, appointments, results, reports and education. She can report a danger sign from home, which raises an alert for her facility."
            permissions={['Own record only', 'Appointment reminders', 'Report a symptom']}
            image="motherNewborn"
          />
          <RoleCard
            title="Receiving facility"
            body="Sees the referred mother’s summary while the referral is open, records arrival, assessment and outcome, and closes the loop."
            permissions={['Referral packet', 'Outcome entry', 'Closure note']}
            image="screening"
          />
        </div>
      </PublicSection>

      {/* ── Security ─────────────────────────────────────────────────── */}
      <PublicSection
        eyebrow="Security and privacy"
        title="Permissions live with the data, not with the menu"
        description="The interface only hides what you cannot do. The enforcement happens in database security rules against the authenticated token, and every privileged action is written to an append-only audit log."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            { icon: <Lock className="size-4" aria-hidden />, title: 'No secrets in the browser', body: 'The client holds only public configuration. Upload presets, the SMS key and any privileged write happen on the server; API secrets are never shipped to the app.' },
            { icon: <Fingerprint className="size-4" aria-hidden />, title: 'Roles from verified claims', body: 'Roles come from authentication claims and are checked again against the user profile. A sign-up can never choose administrator for itself.' },
            { icon: <ShieldCheck className="size-4" aria-hidden />, title: 'Row-level access', body: 'Staff read records at their facility; a mother reads only her own; reports and documents carry an explicit access list enforced on read.' },
            { icon: <FileSearch className="size-4" aria-hidden />, title: 'Private files stay private', body: 'Reports and clinical documents are uploaded with a non-public access mode and opened through short-lived signed URLs, never a guessable public link.' },
          ].map((item) => (
            <article key={item.title} className="card p-5">
              <span className="grid size-9 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
              <h3 className="mt-3 text-[0.94rem] font-semibold text-ink-900">{item.title}</h3>
              <p className="muted mt-1.5">{item.body}</p>
            </article>
          ))}
        </div>
      </PublicSection>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <PublicSection tone="tint" eyebrow="Questions" title="Before your facility adopts it">
        <FaqList />
      </PublicSection>

      {/* ── Contact ──────────────────────────────────────────────────── */}
      <PublicSection
        id="contact"
        eyebrow="Contact"
        title="Talk to us about deploying MAMA CARE"
        description="Tell us about your facility and what you need to change. We reply with an implementation plan, the configuration required, and a clinical sign-off checklist."
      >
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="space-y-4">
            <AppImage name="clinicEnvironment" ratio="16 / 10" caption="Reception and records area at a typical urban health post." />
            <div className="card p-5">
              <h3 className="h3">Direct</h3>
              <dl className="mt-3 space-y-2.5 text-[0.86rem]">
                <div>
                  <dt className="micro">Email</dt>
                  <dd className="font-medium text-ink-800">
                    <a href={`mailto:${SITE.org.email}`} className="hover:underline">{SITE.org.email}</a>
                  </dd>
                </div>
                <div>
                  <dt className="micro">Telephone</dt>
                  <dd className="font-medium text-ink-800 tnum">
                    <a href={telHref(SITE.org.phone)} className="hover:underline">{SITE.org.phone}</a>
                  </dd>
                </div>
                <div>
                  <dt className="micro">Office</dt>
                  <dd className="text-ink-600">{SITE.org.address}</dd>
                </div>
                <div>
                  <dt className="micro">Hours</dt>
                  <dd className="text-ink-600">{SITE.org.hours}</dd>
                </div>
                <div>
                  <dt className="micro">Data protection queries</dt>
                  <dd className="font-medium text-ink-800">
                    <a href={`mailto:${SITE.privacyContact}`} className="hover:underline">{SITE.privacyContact}</a>
                  </dd>
                </div>
              </dl>
            </div>
          </div>
          <div className="card p-5 sm:p-6">
            <ContactForm />
          </div>
        </div>
      </PublicSection>
    </PublicShell>
  );
}

function PreviewRow({ tone, title, detail }: { tone: 'red' | 'amber' | 'green'; title: string; detail: string }) {
  const dot = tone === 'red' ? 'bg-[var(--color-risk-red)]' : tone === 'amber' ? 'bg-[var(--color-risk-amber)]' : 'bg-[var(--color-risk-green)]';
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1.5 size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      <span className="min-w-0">
        <span className="block truncate text-[0.78rem] font-semibold text-ink-800">{title}</span>
        <span className="block truncate text-[0.72rem] text-ink-500">{detail}</span>
      </span>
    </li>
  );
}

function RoleCard({
  title,
  body,
  permissions,
  image,
}: {
  title: string;
  body: string;
  permissions: string[];
  image: 'clinicEnvironment' | 'midwifeConsultation' | 'ancConsultation' | 'communityWorker' | 'motherNewborn' | 'screening';
}) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <AppImage name={image} ratio="16 / 8" rounded={false} />
      <div className="flex flex-1 flex-col p-4.5">
        <h3 className="h3">{title}</h3>
        <p className="muted mt-1.5 flex-1">{body}</p>
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {permissions.map((permission) => (
            <li key={permission}>
              <Badge tone="neutral">{permission}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

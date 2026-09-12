import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  FileText,
  GraduationCap,
  HeartPulse,
  MessageSquare,
  Phone,
  ShieldAlert,
  Smartphone,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { PublicPageHeader, PublicSection, PublicShell } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { EMERGENCY_CONTACTS, FOR_MOTHERS, PUBLIC_DANGER_SIGNS } from '@/config/site-content';
import { useSession } from '@/providers/app-providers';
import { telHref } from '@/lib/utils';

/**
 * For mothers.
 *
 * What a patient account actually shows, how one is created, how reminders
 * arrive, and — stated plainly — what the portal is not for. Written for a
 * reader on a phone in a clinic queue, so the sentences stay short.
 */
export default function ForMothersPage() {
  const { actor } = useSession();
  const isMother = actor?.role === 'MOTHER';

  return (
    <PublicShell>
      <PublicPageHeader
        eyebrow="For mothers"
        title="Your own record, on your own phone"
        lede={FOR_MOTHERS.intro}
        image="motherNewborn"
        imageCaption="A mother with her newborn at a postnatal check."
        actions={
          isMother ? (
            <>
              <ButtonLink to="/home" icon={<ArrowRight className="size-4" aria-hidden />}>
                Open your portal
              </ButtonLink>
              <ButtonLink to="/maternal-health" variant="secondary">
                Maternal health guidance
              </ButtonLink>
            </>
          ) : (
            <>
              <ButtonLink to="/register" icon={<UserPlus className="size-4" aria-hidden />}>
                Create your account
              </ButtonLink>
              <ButtonLink to="/maternal-health" variant="secondary">
                Maternal health guidance
              </ButtonLink>
            </>
          )
        }
      />

      {/* ── What you see ─────────────────────────────────────────────── */}
      <PublicSection
        tone="tint"
        eyebrow="Your portal"
        title="Six things on your account"
        description="Nothing else. You cannot see another patient’s record, and no page on this site ever shows a name that is not yours."
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {FOR_MOTHERS.features.map((feature, index) => (
            <article key={feature.title} className="card flex gap-3 p-5">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-[0.78rem] font-bold text-brand-800 tnum">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3 className="text-[0.94rem] font-semibold text-ink-900">{feature.title}</h3>
                <p className="muted mt-1.5">{feature.detail}</p>
              </div>
            </article>
          ))}
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <AppImage name="mobileReminder" ratio="16 / 9" caption="Appointment reminders arrive on the phone, in the language you chose." />
          <AppImage name="maternalEducation" ratio="16 / 9" caption="Reading chosen for the stage of pregnancy you are in." />
        </div>
      </PublicSection>

      {/* ── Getting an account ───────────────────────────────────────── */}
      <PublicSection
        eyebrow="Getting started"
        title="How your account is created and linked"
        description="An account is yours alone. It is linked to your clinical record by the facility, so the two stay separate: the record belongs to the clinic, the account belongs to you."
      >
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
          <ol className="space-y-3">
            {[
              { icon: <UserPlus className="size-4" aria-hidden />, title: 'Register with your own details', body: 'Your name, a phone number you can receive messages on, and a password you choose. Registration is free and open to everyone.' },
              { icon: <UserCheck className="size-4" aria-hidden />, title: 'The facility links your record', body: 'At your next visit the team links your account to your patient ID. Until then your portal shows your account but not a clinical record.' },
              { icon: <Bell className="size-4" aria-hidden />, title: 'Reminders start', body: 'You are reminded before each appointment. If you cannot attend, tell the clinic — a missed visit is followed up rather than ignored.' },
              { icon: <Smartphone className="size-4" aria-hidden />, title: 'Keep your number current', body: 'Reminders and messages go to the number on your account. Change it in your profile settings if it changes.' },
            ].map((item, index) => (
              <li key={item.title} className="card flex gap-3 p-4">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-800">{item.icon}</span>
                <div>
                  <h3 className="text-[0.9rem] font-semibold text-ink-900">
                    {index + 1}. {item.title}
                  </h3>
                  <p className="muted mt-1">{item.body}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="space-y-4">
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <CalendarClock className="size-4 text-brand-700" aria-hidden />
                How reminders reach you
              </h3>
              <p className="muted mt-2">
                Reminders are sent as push notifications to this browser or device. Where the facility has an approved SMS provider
                configured, they are also sent by text message. If neither reaches you, your appointment still stands — the clinic sees it
                on their side.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="brand" icon={<Bell className="size-3" aria-hidden />}>
                  Push notifications
                </Badge>
                <Badge tone="neutral" icon={<Smartphone className="size-3" aria-hidden />}>
                  SMS where configured
                </Badge>
                <Badge tone="neutral" icon={<MessageSquare className="size-3" aria-hidden />}>
                  Messages in the portal
                </Badge>
              </div>
            </div>
            <div className="card p-5">
              <h3 className="h3 flex items-center gap-2">
                <FileText className="size-4 text-brand-700" aria-hidden />
                Taking something to a visit
              </h3>
              <p className="muted mt-2">
                Your portal is not a replacement for your antenatal card. Bring the card, or bring a phone with your portal open — either
                gives the clinician your dating, your blood pressure trend and your medicines in seconds.
              </p>
              <Link to="/resources" className="mt-3 inline-flex items-center gap-1 text-[0.84rem] font-semibold text-brand-800 hover:underline">
                Resources and reading <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </PublicSection>

      {/* ── Boundaries ───────────────────────────────────────────────── */}
      <PublicSection tone="tint" eyebrow="What the portal is not" title="Three things to be clear about">
        <div className="grid gap-4 md:grid-cols-3">
          {FOR_MOTHERS.boundaries.map((boundary, index) => (
            <article key={boundary} className="card p-5">
              <span className="grid size-8 place-items-center rounded-lg bg-ink-100 text-[0.78rem] font-bold text-ink-600 tnum">
                {index + 1}
              </span>
              <p className="muted mt-3">{boundary}</p>
            </article>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2.5">
          <Badge tone="neutral" icon={<GraduationCap className="size-3" aria-hidden />}>
            Reading is education, not advice
          </Badge>
          <Badge tone="neutral" icon={<HeartPulse className="size-3" aria-hidden />}>
            Assessment is always by a clinician
          </Badge>
        </div>
      </PublicSection>

      {/* ── Danger signs ─────────────────────────────────────────────── */}
      <PublicSection
        eyebrow="Warning signs"
        title="Go to a facility today if any of these appear"
        description="These need an examination the same day. They are not a diagnosis on their own — which is why what is required is an assessment."
      >
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
      </PublicSection>

      {/* ── Emergency ────────────────────────────────────────────────── */}
      <section className="border-y border-[var(--color-risk-red-border)] bg-[var(--color-risk-red-soft)] py-11">
        <div className="shell grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="section-eyebrow !text-[var(--color-risk-red-text)]">Emergency</p>
            <h2 className="display-2 mt-2">In an emergency, do not use the portal</h2>
            <p className="lede mt-3 max-w-2xl">
              Go to the nearest facility now, with a companion, and take your antenatal card or a phone with your record open. Call ahead
              if it is safe to do so.
            </p>
            <p className="muted mt-3 max-w-2xl">{EMERGENCY_CONTACTS.note}</p>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2 lg:w-[330px] lg:grid-cols-1">
            {EMERGENCY_CONTACTS.lines.map((line) => (
              <li key={line.label}>
                <a href={telHref(line.number)} className="card flex items-center justify-between gap-3 px-4 py-3">
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

      <PublicSection eyebrow="Next" title="Keep going">
        <div className="flex flex-wrap gap-2.5">
          <ButtonLink to="/maternal-health" icon={<ShieldAlert className="size-4" aria-hidden />}>
            Maternal health guidance
          </ButtonLink>
          <ButtonLink to="/resources" variant="secondary">
            Resources and reading
          </ButtonLink>
          <ButtonLink to="/faq" variant="quiet">
            Questions and answers
          </ButtonLink>
        </div>
      </PublicSection>
    </PublicShell>
  );
}

/**
 * Landing page.
 *
 * The public front door: what the platform is, who it is for, the promise it makes
 * (track, remember, learn, prepare, continue after birth) and the boundary it never
 * crosses (it is not a doctor). Everything below the fold is reachable without an
 * account, because a woman looking for pregnancy information should not have to
 * register first.
 */

import { Link } from 'react-router-dom';
import {
  Baby,
  Bell,
  BookOpen,
  CalendarDays,
  Globe2,
  Heart,
  Hospital,
  Lock,
  MapPin,
  MessageCircle,
  NotebookPen,
  PhoneCall,
  Pill,
  ShieldCheck,
  Stethoscope,
  Syringe,
  WifiOff,
} from 'lucide-react';
import { SITE, MEDICAL_DISCLAIMER } from '@/config/site-content';
import { weekGuide } from '@/config/weekly-guide';
import { SCHEDULE_LABEL, ZAMBIA_IMMUNIZATION_SCHEDULE } from '@/config/immunization';
import { LANGUAGES } from '@/types/domain';
import { AppImage } from '@/components/media/app-image';
import { ButtonLink } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { PublicHero } from '@/components/layout/public-shell';

const FEATURES = [
  { icon: Heart, title: 'Pregnancy tracker', body: 'Enter your last period or your due date and see your current week, trimester and how long to go — always labelled as an estimate.' },
  { icon: BookOpen, title: 'Weekly guide', body: 'Forty-two weeks of plain-language guidance: your baby, your body, what to ask your provider, healthy habits and warning signs.' },
  { icon: CalendarDays, title: 'Appointment reminders', body: 'Record antenatal, postnatal and baby appointments, keep your questions ready, and get told the day before.' },
  { icon: Pill, title: 'Medication reminders', body: 'Repeat exactly what your clinician prescribed, at the times they gave you. Mama Care never suggests a medicine or a dose.' },
  { icon: Baby, title: 'Baby & immunization', body: 'After birth the app switches to Mother & Baby mode: baby profile, growth, development milestones and the national vaccine schedule.' },
  { icon: NotebookPen, title: 'Private journal', body: 'Appointment notes, questions, milestones and how you feel. Yours alone — a provider on your care team still cannot read it.' },
  { icon: Hospital, title: 'Facility directory', body: 'Search hospitals, clinics, maternity homes and pharmacies, sorted by distance, with directions and the services each one offers.' },
  { icon: PhoneCall, title: 'Warning signs, one tap away', body: 'A red button on every screen, with what to look for, how fast to act, and who to call.' },
  { icon: Stethoscope, title: 'Provider portal', body: 'Clinicians see only the patients who have shared their care with them — appointments, observations and notes, with an audit trail.' },
  { icon: MessageCircle, title: 'Family support', body: 'Invite a partner or relative to selected reminders. You choose what they see, and you can revoke it at any time.' },
  { icon: Bell, title: 'Notifications you control', body: 'Appointments, reminders, education and milestones — with quiet hours so nothing wakes you at 3am.' },
  { icon: WifiOff, title: 'Works offline', body: 'Downloaded education, your pregnancy progress, saved appointments, reminders and baby information stay available without a connection.' },
];

const PROBLEMS = [
  'Forgetting antenatal appointments',
  'Not knowing what to expect at each stage',
  'Pregnancy information scattered across cards and notes',
  'Limited access to reliable maternal-health education',
  'Forgetting medication or supplement schedules',
  'Losing track of important dates',
  'No convenient way to reach a healthcare provider',
  'Postnatal and newborn information that stops at delivery',
];

const PHASES = [
  {
    step: '01',
    title: 'Pregnancy mode',
    body: 'Week-by-week guidance, appointments, reminders, observations from your visits and a journal for your questions.',
    image: 'antenatal-consultation' as const,
  },
  {
    step: '02',
    title: 'Preparing for birth',
    body: 'A birth plan, what to pack, how to tell labour has started, and when to leave for the facility.',
    image: 'midwife' as const,
  },
  {
    step: '03',
    title: 'Mother & Baby mode',
    body: 'Record the birth and the app changes: recovery, breastfeeding, newborn care, growth and the immunization schedule.',
    image: 'mother-newborn' as const,
  },
];

export default function Landing() {
  const sample = weekGuide(24);

  return (
    <>
      <PublicHero
        eyebrow="Pregnancy, mother & baby care"
        title="Every mother. Every journey."
        lede="Mama Care helps you track your pregnancy, keep every antenatal appointment, remember what your clinician prescribed, learn week by week, and carry on with your baby after birth — in one simple, private place."
        image={<AppImage name="hero" alt="A pregnant woman at an antenatal care visit" ratio="4 / 3" priority />}
      >
        <ButtonLink to="/register" size="lg">
          Create a free account
        </ButtonLink>
        <ButtonLink to="/learn" variant="secondary" size="lg">
          Read the education library
        </ButtonLink>
        <span className="inline-flex items-center gap-1.5 self-center text-xs text-ink-500">
          <Lock className="size-3.5" aria-hidden />
          No card needed · Built for Zambia · Works offline
        </span>
      </PublicHero>

      {/* The problem, stated plainly */}
      <section className="shell py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div>
            <SectionHeading eyebrow="Why Mama Care exists" title="Pregnancy is full of things to remember" />
            <p className="lede mt-4">
              Most mothers are not struggling for lack of care. They are struggling to hold it all together: dates,
              doses, questions, and information they were given once, quickly, in a busy clinic.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-ink-600">
              Mama Care puts all of it in one place you can open on a phone, offline, at 2am, without asking anyone.
            </p>
          </div>
          <ul className="grid gap-2.5 sm:grid-cols-2">
            {PROBLEMS.map((problem) => (
              <li key={problem} className="card flex items-start gap-2.5 p-4 text-[0.9rem] text-ink-700">
                <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-500" aria-hidden />
                {problem}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Sample of the weekly guide */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="shell grid items-center gap-10 py-14 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="Week by week" title="Your guide for every week of pregnancy" />
            <p className="lede mt-4">
              Forty-two weeks, each with the same five sections: your baby, your body, things to discuss with your
              healthcare provider, healthy habits, and the warning signs that matter at that stage.
            </p>
            <div className="mt-6">
              <ButtonLink to="/learn" variant="secondary">
                Browse the library
              </ButtonLink>
            </div>
          </div>

          <Card className="card-pad">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="micro">Week {sample.week}</p>
                <h3 className="mt-1 text-lg font-bold text-ink-900">{sample.size}</h3>
              </div>
              <Badge tone="brand">{sample.trimester === 1 ? 'First' : sample.trimester === 2 ? 'Second' : 'Third'} trimester</Badge>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="font-semibold text-ink-900">Your baby</dt>
                <dd className="mt-1 leading-relaxed text-ink-600">{sample.baby}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-900">Your body</dt>
                <dd className="mt-1 leading-relaxed text-ink-600">{sample.body}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-900">Healthy habits</dt>
                <dd className="mt-1">
                  <ul className="space-y-1 text-ink-600">
                    {sample.habits.slice(0, 3).map((habit) => (
                      <li key={habit} className="flex items-start gap-2">
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" aria-hidden />
                        {habit}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
            <p className="mt-4 border-t border-ink-200 pt-3 text-xs text-ink-500">
              Educational information only — never a diagnosis, never a replacement for your provider.
            </p>
          </Card>
        </div>
      </section>

      {/* Features */}
      <section className="shell py-14">
        <SectionHeading eyebrow="What you can do" title="One app for pregnancy, birth and baby" />
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <Card key={feature.title} className="card-pad">
              <feature.icon className="size-6 text-brand-700" aria-hidden />
              <h3 className="mt-3 text-[0.98rem] font-semibold text-ink-900">{feature.title}</h3>
              <p className="mt-1.5 text-[0.87rem] leading-relaxed text-ink-600">{feature.body}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* The journey */}
      <section className="border-y border-ink-200 bg-ink-50">
        <div className="shell py-14">
          <SectionHeading eyebrow="From pregnancy to parenthood" title="The app changes as you do" />
          <div className="mt-8 grid gap-5 lg:grid-cols-3">
            {PHASES.map((phase) => (
              <Card key={phase.step} className="overflow-hidden">
                <AppImage name={phase.image} alt={phase.title} ratio="16 / 9" rounded={false} />
                <div className="p-5">
                  <p className="micro">{phase.step}</p>
                  <h3 className="mt-1.5 text-[1.05rem] font-bold text-ink-900">{phase.title}</h3>
                  <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-600">{phase.body}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Immunization */}
      <section className="shell py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div>
            <SectionHeading eyebrow="After birth" title="Never miss a vaccine date" />
            <p className="lede mt-4">
              Mama Care builds the national immunization schedule from your baby's date of birth and reminds you before
              each visit. Bring the child health card, and the record stays complete.
            </p>
            <p className="mt-3 flex items-center gap-2 text-sm text-ink-600">
              <Syringe className="size-4 text-brand-700" aria-hidden />
              {SCHEDULE_LABEL} · {ZAMBIA_IMMUNIZATION_SCHEDULE.length} doses tracked
            </p>
            <div className="mt-5">
              <ButtonLink to="/learn/immunization-why-it-matters" variant="secondary">
                Why immunization matters
              </ButtonLink>
            </div>
          </div>
          <Card className="table-scroll">
            <table className="table-base">
              <thead>
                <tr>
                  <th scope="col">Age</th>
                  <th scope="col">Vaccine</th>
                  <th scope="col">Dose</th>
                </tr>
              </thead>
              <tbody>
                {ZAMBIA_IMMUNIZATION_SCHEDULE.slice(0, 10).map((item) => (
                  <tr key={`${item.code}-${item.ageDays}`}>
                    <td className="whitespace-nowrap font-medium text-ink-900">{item.ageLabel}</td>
                    <td className="text-ink-700">{item.vaccine}</td>
                    <td className="whitespace-nowrap text-ink-600">{item.dose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-ink-200 px-4 py-3 text-xs text-ink-500">
              Only a health worker decides what your baby receives and when. Mama Care keeps the dates.
            </p>
          </Card>
        </div>
      </section>

      {/* Safety + privacy */}
      <section className="border-y border-ink-200 bg-brand-950 text-white">
        <div className="shell grid gap-8 py-14 lg:grid-cols-2">
          <div>
            <p className="text-[0.72rem] font-semibold tracking-[0.16em] text-brand-200 uppercase">Our medical safety principle</p>
            <h2 className="mt-3 text-2xl leading-tight font-bold sm:text-3xl">Mama Care never presents itself as a doctor</h2>
            <p className="mt-4 text-[0.95rem] leading-relaxed text-white/85">{MEDICAL_DISCLAIMER}</p>
            <div className="mt-6">
              <ButtonLink to="/emergency" variant="danger">
                See the warning signs
              </ButtonLink>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              { icon: ShieldCheck, title: 'Minimal data', body: 'You only give what a feature needs. No form asks for more.' },
              { icon: Lock, title: 'Protected records', body: 'Firebase Authentication, role-based database rules and private storage for health documents.' },
              { icon: Stethoscope, title: 'Care sharing you control', body: 'A provider sees your records only after you share your care, and only what that care needs.' },
              { icon: Globe2, title: 'Your data, your call', body: 'Export your records, or delete your account and everything in it, from Settings.' },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-white/15 bg-white/8 p-4">
                <item.icon className="size-5 text-brand-200" aria-hidden />
                <h3 className="mt-2.5 text-[0.95rem] font-semibold">{item.title}</h3>
                <p className="mt-1 text-[0.82rem] leading-relaxed text-white/75">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For clinics + languages */}
      <section className="shell grid gap-10 py-14 lg:grid-cols-2">
        <Card className="card-pad">
          <Stethoscope className="size-6 text-brand-700" aria-hidden />
          <h3 className="mt-3 text-lg font-bold text-ink-900">For clinics and healthcare workers</h3>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-600">
            A separate portal with verified provider profiles, patient lists limited to people who shared their care,
            appointment records, education you can publish for your own community, and an audit log of every privileged
            action.
          </p>
          <ul className="mt-4 space-y-2 text-[0.88rem] text-ink-700">
            {['Verified provider directory', 'Consent-based patient access', 'Structured appointment records', 'Publish reviewed education in your own words', 'Facility profile and services'].map((item) => (
              <li key={item} className="flex items-start gap-2">
                <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink to="/register?role=provider" variant="secondary">
              Register as a provider
            </ButtonLink>
            <ButtonLink to="/become-a-provider" variant="secondary">
              Already registered? Apply for verification
            </ButtonLink>
            <ButtonLink to="/contact" variant="ghost">
              Talk to us about a partnership
            </ButtonLink>
          </div>
        </Card>

        <Card className="card-pad">
          <MapPin className="size-6 text-brand-700" aria-hidden />
          <h3 className="mt-3 text-lg font-bold text-ink-900">Built in Zambia, usable anywhere</h3>
          <p className="mt-2 text-[0.9rem] leading-relaxed text-ink-600">
            Zambian provinces, Zambian emergency short codes and the Zambian immunization schedule are the defaults.
            Every country stays selectable, and the facility directory can be maintained for any market.
          </p>
          <div className="mt-4">
            <p className="micro">Languages</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {LANGUAGES.map((language) => (
                <li key={language.code}>
                  <Badge tone={language.available ? 'green' : 'neutral'}>
                    {language.label}
                    {language.available ? '' : ' · planned'}
                  </Badge>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-ink-500">
              Translations will be reviewed by qualified native speakers and maternal-health professionals before release.
            </p>
          </div>
        </Card>
      </section>

      {/* Mission + vision */}
      <section className="border-t border-ink-200 bg-ink-50">
        <div className="shell grid gap-8 py-14 md:grid-cols-2">
          <div>
            <p className="micro">Mission</p>
            <p className="mt-2 text-lg leading-relaxed font-medium text-ink-800">{SITE.mission}</p>
          </div>
          <div>
            <p className="micro">Vision</p>
            <p className="mt-2 text-lg leading-relaxed font-medium text-ink-800">{SITE.vision}</p>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="shell py-16">
        <Card className="card-pad grid items-center gap-6 bg-brand-50 border-brand-200 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <h2 className="display-2">Start your journey today</h2>
            <p className="lede mt-2 max-w-xl">
              Free to use. Set up your pregnancy in under a minute and your week-by-week guide, appointment reminders and
              education library are ready immediately.
            </p>
          </div>
          <div className="actions-wrap">
            <ButtonLink to="/register" size="lg">
              Get started
            </ButtonLink>
            <ButtonLink to="/sign-in" variant="secondary" size="lg">
              Sign in
            </ButtonLink>
          </div>
        </Card>
      </section>
    </>
  );
}

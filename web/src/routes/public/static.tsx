/**
 * Informational pages.
 *
 * About, how it works, FAQ, contact, privacy, terms, system status and the 404.
 * These are the pages that build trust before anyone creates an account, so they
 * are written in plain language and say plainly what Mama Care is not.
 *
 * The privacy page describes what is actually implemented — not an aspiration —
 * and the status page reports the real state of this device's data stack.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  CalendarCheck,
  ChevronDown,
  Database,
  HeartHandshake,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  WifiOff,
} from 'lucide-react';
import { useAsync } from '@/hooks';
import { feedbackRepo } from '@/services/repositories';
import { diagnostics } from '@/services/session-store';
import { useSession } from '@/providers/app-providers';
import { cloudinaryStatus } from '@/services/media/media-service';
import { pushSupported } from '@/services/push';
import { storageMode } from '@/services/data/local/store';
import { dataProvider, integrations } from '@/config/env';
import { EMERGENCY_CONTACTS, FAQS, MEDICAL_DISCLAIMER, SITE } from '@/config/site-content';
import type { Feedback } from '@/types/domain';
import { PublicHero } from '@/components/layout/public-shell';
import { AppImage } from '@/components/media/app-image';
import { Button } from '@/components/ui/button';
import { Card, SectionHeading } from '@/components/ui/card';
import { Badge } from '@/components/ui/display';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

/* ── About ─────────────────────────────────────────────────────────────── */

export function AboutPage() {
  useEffect(() => {
    document.title = 'About · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="About Mama Care"
        title={SITE.tagline}
        lede={SITE.description}
        image={<AppImage name="antenatal-consultation" alt="A nurse consulting with a pregnant woman" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="card-pad">
            <Badge tone="brand">Our mission</Badge>
            <p className="mt-3 leading-relaxed text-ink-700">{SITE.mission}</p>
          </Card>
          <Card className="card-pad">
            <Badge tone="green">Our vision</Badge>
            <p className="mt-3 leading-relaxed text-ink-700">{SITE.vision}</p>
          </Card>
        </div>

        <div className="mt-10">
          <SectionHeading eyebrow="Why we built it" title="Pregnancy information is everywhere. Follow-through is not." />
          <div className="mt-6 space-y-4">
            {[
              {
                title: 'A mother forgets an appointment she needed',
                body: 'Antenatal visits, iron and folic acid, the next vaccine, the postnatal check at six weeks — these all happen on different dates, often weeks apart, and there is no single place holding them. Missed visits are rarely about not caring; they are about memory and distance.',
              },
              {
                title: 'She reads something frightening online',
                body: 'Search results are not written for Zambia, not reviewed by clinicians, and not ordered by relevance to her week. Anxiety is a real cost, and so is false reassurance.',
              },
              {
                title: 'She is not sure whether a symptom is serious',
                body: 'Bleeding, a severe headache, reduced fetal movement, a fever in a newborn — some of these need a hospital now, some need a visit today, most need nothing at all. Without a clear framework, families either over-react or wait too long.',
              },
              {
                title: 'Her clinic has no way to reach her',
                body: 'Appointment changes, immunization campaigns and health messages are announced on paper or by word of mouth. If she changes her number, the link breaks.',
              },
            ].map((item) => (
              <Card key={item.title} className="card-pad">
                <h3 className="card-title">{item.title}</h3>
                <p className="mt-1.5 leading-relaxed text-ink-600">{item.body}</p>
              </Card>
            ))}
          </div>
        </div>

        <div className="mt-10">
          <SectionHeading eyebrow="What we do" title="Mama Care answers all four with one record" />
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              {
                icon: <CalendarCheck className="size-5" aria-hidden />,
                title: 'One timeline for everything',
                body: 'Pregnancy week, appointments, medication, immunizations and the baby’s milestones in a single record that works on a low-end phone.',
              },
              {
                icon: <ShieldCheck className="size-5" aria-hidden />,
                title: 'Content you can trust',
                body: 'Built-in education follows national and WHO guidance. Anything a clinic adds is reviewed by a qualified professional before it is published, and the reviewer is named.',
              },
              {
                icon: <Stethoscope className="size-5" aria-hidden />,
                title: 'A real link to clinicians',
                body: 'Providers get a portal, mothers choose who sees their record, and every access is logged. Sharing is opt-in and revocable.',
              },
              {
                icon: <WifiOff className="size-5" aria-hidden />,
                title: 'Built for patchy networks',
                body: 'Downloaded education, your progress and your saved records stay available offline and synchronise when you are back online.',
              },
            ].map((item) => (
              <Card key={item.title} className="card-pad">
                <span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-800">{item.icon}</span>
                <h3 className="card-title mt-3">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-600">{item.body}</p>
              </Card>
            ))}
          </div>
        </div>

        <Card className="card-pad mt-10 border-ink-200 bg-ink-50">
          <h3 className="card-title">What Mama Care is not</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-700">{MEDICAL_DISCLAIMER}</p>
          <p className="mt-3 text-sm text-ink-600">
            We would rather you trusted this app a little less and your midwife a little more. That is the whole design.
          </p>
        </Card>

        <div className="mt-8 flex flex-wrap gap-2">
          <Link to="/how-it-works" className="btn btn-primary btn-sm">
            See how it works
          </Link>
          <Link to="/learn" className="btn btn-secondary btn-sm">
            Browse the library
          </Link>
          <Link to="/contact" className="btn btn-ghost btn-sm">
            Contact us
          </Link>
        </div>
      </section>
    </>
  );
}

/* ── How it works ──────────────────────────────────────────────────────── */

const JOURNEY = [
  {
    step: '1',
    title: 'Create an account in under a minute',
    icon: <Smartphone className="size-5" aria-hidden />,
    points: [
      'Email, a password of at least eight characters with a letter and a digit, and your first name.',
      'No national ID, no clinic number and no payment details are required.',
      'If you register on this device without a hosted backend, your records stay in this browser.',
    ],
  },
  {
    step: '2',
    title: 'Tell it where you are in the journey',
    icon: <CalendarCheck className="size-5" aria-hidden />,
    points: [
      'Enter the first day of your last period, or your due date, or both — the app reconciles them and shows which one it used.',
      'After birth you switch to postnatal mode and add the baby’s details; the pregnancy record stays intact.',
      'Nothing is guessed silently. Every calculated date is labelled with its source.',
    ],
  },
  {
    step: '3',
    title: 'Let it carry the remembering',
    icon: <Bell className="size-5" aria-hidden />,
    points: [
      'Antenatal appointments, medication and supplements, and the national immunization schedule generate reminders automatically.',
      'Reminders respect quiet hours, and you can turn any category off.',
      'Push notifications work in supported browsers; in-app notifications always work.',
    ],
  },
  {
    step: '4',
    title: 'Read what matters this week',
    icon: <HeartHandshake className="size-5" aria-hidden />,
    points: [
      'A 42-week guide that opens on your current week, not on page one.',
      'Education on labour, postnatal recovery, breastfeeding and newborn care — downloadable for offline reading.',
      'Warning signs are separated into “go now” and “be seen today” so the decision is not left to guesswork.',
    ],
  },
  {
    step: '5',
    title: 'Connect it to your clinic, if you want to',
    icon: <Stethoscope className="size-5" aria-hidden />,
    points: [
      'Choose a facility as “my facility” and link your care to a provider.',
      'They see the record needed for your care — never your private journal.',
      'Remove the link at any time; access is logged either way.',
    ],
  },
  {
    step: '6',
    title: 'Keep going after birth',
    icon: <MessageSquare className="size-5" aria-hidden />,
    points: [
      'Baby profile, growth notes, feeding and sleep, immunization dates and the six-week postnatal check.',
      'Share selected categories with a partner or family member — you choose which, and can revoke it.',
      'Your record is exportable and deletable from Settings → Privacy & data.',
    ],
  },
];

export function HowItWorksPage() {
  useEffect(() => {
    document.title = 'How it works · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="How it works"
        title="Six steps from registration to a calm fourth trimester"
        lede="Mama Care is built to be used in the gaps of a busy day — on a bus, in a queue, at 2am with a newborn. Here is exactly what happens at each stage."
        image={<AppImage name="appointment" alt="A mother checking in for her appointment at a clinic" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <ol className="space-y-4">
          {JOURNEY.map((stage) => (
            <Card key={stage.step} className="card-pad">
              <div className="flex items-start gap-4">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-600 text-sm font-semibold text-brand-50">
                  {stage.step}
                </span>
                <div className="min-w-0">
                  <h3 className="card-title flex flex-wrap items-center gap-2">
                    {stage.title}
                    <span className="text-brand-700">{stage.icon}</span>
                  </h3>
                  <ul className="checklist mt-2">
                    {stage.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ))}
        </ol>

        <div className="mt-10">
          <SectionHeading eyebrow="Three portals" title="One record, three points of view" />
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {[
              {
                title: 'Mother',
                body: 'Tracker, weekly guide, appointments, reminders, baby, journal, education, facilities and messaging.',
                action: <Link to="/register" className="btn btn-primary btn-sm">Create an account</Link>,
              },
              {
                title: 'Healthcare provider',
                body: 'A dashboard of the patients who have shared care with you: pregnancy records, appointments, observations and messages.',
                action: <Link to="/register?role=PROVIDER" className="btn btn-secondary btn-sm">Register as a provider</Link>,
              },
              {
                title: 'Administrator',
                body: 'Verify providers, publish facilities and articles, send announcements, review reports and feedback, and read the audit log.',
                action: <Link to="/contact" className="btn btn-ghost btn-sm">Talk to us</Link>,
              },
            ].map((portal) => (
              <Card key={portal.title} className="card-pad">
                <h3 className="card-title">{portal.title}</h3>
                <p className="mt-1 text-sm text-ink-600">{portal.body}</p>
                <div className="mt-4">{portal.action}</div>
              </Card>
            ))}
          </div>
        </div>

        <Card className="card-pad mt-10 border-ink-200 bg-ink-50">
          <p className="text-sm leading-relaxed text-ink-700">{MEDICAL_DISCLAIMER}</p>
        </Card>
      </section>
    </>
  );
}

/* ── FAQ ───────────────────────────────────────────────────────────────── */

export function FaqPage() {
  const [open, setOpen] = useState<number | null>(0);

  useEffect(() => {
    document.title = 'Frequently asked questions · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="Help"
        title="Frequently asked questions"
        lede="The honest answers, including the ones about cost, privacy and what this app cannot do."
        image={<AppImage name="education" alt="A health educator speaking with a group of mothers" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <div className="space-y-3">
          {FAQS.map((faq, index) => {
            const isOpen = open === index;
            return (
              <Card key={faq.q} className="overflow-hidden">
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-4 px-4 py-3.5 text-left sm:px-5"
                  aria-expanded={isOpen}
                  aria-controls={`faq-panel-${index}`}
                  onClick={() => setOpen(isOpen ? null : index)}
                >
                  <span className="text-[0.95rem] font-semibold text-ink-800">{faq.q}</span>
                  <ChevronDown className={cn('size-4 shrink-0 text-ink-500 transition-transform', isOpen && 'rotate-180')} aria-hidden />
                </button>
                {isOpen ? (
                  <div id={`faq-panel-${index}`} className="px-4 pb-4 sm:px-5">
                    <p className="leading-relaxed text-ink-600">{faq.a}</p>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>

        <Card className="card-pad mt-8">
          <h3 className="card-title">Still stuck?</h3>
          <p className="mt-1 text-sm text-ink-600">
            Tell us what happened and we will reply to the email you give us. For a medical question, message a provider
            through the app or call your facility.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/contact" className="btn btn-primary btn-sm">
              Contact support
            </Link>
            <a href={`tel:${EMERGENCY_CONTACTS.emergency}`} className="btn btn-danger btn-sm">
              Emergency: {EMERGENCY_CONTACTS.emergency}
            </a>
          </div>
        </Card>
      </section>
    </>
  );
}

/* ── Contact ───────────────────────────────────────────────────────────── */

const FEEDBACK_TOPICS: { value: Feedback['topic']; label: string }[] = [
  { value: 'bug', label: 'Something is broken' },
  { value: 'content', label: 'Health content concern' },
  { value: 'facility-data', label: 'Facility information is wrong' },
  { value: 'feature', label: 'Suggest an improvement' },
  { value: 'other', label: 'Something else' },
];

export function ContactPage() {
  const toast = useToast();
  const [topic, setTopic] = useState<Feedback['topic']>('other');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Contact · Mama Care';
  }, []);

  const submit = async (event: React.FormEvent): Promise<void> => {
    event.preventDefault();
    if (message.trim().length < 10) {
      setError('Please give us at least a sentence so we can help.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await feedbackRepo.submit({ topic, message: message.trim(), email: email.trim() || null });
      setSent(true);
      setMessage('');
      toast.success('Message sent', 'An administrator will read it and reply if you left an email address.');
    } catch {
      setError('That did not send. Check your connection and try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <PublicHero
        eyebrow="Contact"
        title="Talk to the Mama Care team"
        lede="Bugs, wrong facility details, a content concern, or a clinic that wants to join — this reaches an administrator."
        image={<AppImage name="community-health-worker" alt="A community health worker speaking with a mother" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <Card className="card-pad">
            {sent ? (
              <div>
                <Badge tone="green">Message received</Badge>
                <h3 className="card-title mt-3">Thank you</h3>
                <p className="mt-1 text-sm text-ink-600">
                  Your message is in the administrator queue. If you left an email address we will reply there.
                </p>
                <div className="mt-4">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSent(false);
                      setTopic('other');
                    }}
                  >
                    Send another message
                  </Button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <h3 className="card-title">Send us a message</h3>
                <p className="mt-1 text-sm text-ink-500">
                  This is not an emergency channel. If you or your baby need care now, call {EMERGENCY_CONTACTS.emergency} or
                  go to the nearest facility.
                </p>

                <div className="mt-5 space-y-4">
                  <Field label="What is this about?" htmlFor="feedback-topic">
                    <Select
                      id="feedback-topic"
                      value={topic}
                      onChange={(event) => setTopic(event.target.value as Feedback['topic'])}
                      options={FEEDBACK_TOPICS}
                    />
                  </Field>
                  <Field label="Your email (optional)" htmlFor="feedback-email" hint="Only used to reply to you.">
                    <TextInput
                      id="feedback-email"
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder="you@example.com"
                      autoComplete="email"
                    />
                  </Field>
                  <Field label="Message" htmlFor="feedback-message" hint="Tell us what you saw, on which screen, and what you expected.">
                    <TextArea
                      id="feedback-message"
                      value={message}
                      onChange={(event) => setMessage(event.target.value)}
                      rows={6}
                      placeholder="Describe the problem or your question…"
                    />
                  </Field>
                </div>

                {error ? <p className="alert alert-error mt-3">{error}</p> : null}

                <div className="mt-5 flex flex-wrap items-center gap-3">
                  <Button type="submit" disabled={sending}>
                    {sending ? 'Sending…' : 'Send message'}
                  </Button>
                  <span className="text-xs text-ink-500">We reply Monday to Friday.</span>
                </div>
              </form>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="card-pad">
              <h3 className="card-title">Direct</h3>
              <ul className="mt-3 space-y-2 text-sm text-ink-700">
                <li className="flex items-start gap-2">
                  <Mail className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <a href={`mailto:${SITE.org.email}`} className="hover:underline">
                    {SITE.org.email}
                  </a>
                </li>
                <li className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  <a href={`mailto:${SITE.privacyContact}`} className="hover:underline">
                    {SITE.privacyContact}
                  </a>
                  <span className="text-ink-500">— data & privacy</span>
                </li>
                {SITE.org.phone ? (
                  <li className="flex items-start gap-2">
                    <Phone className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                    <a href={`tel:${SITE.org.phone}`} className="hover:underline">
                      {SITE.org.phone}
                    </a>
                  </li>
                ) : null}
                <li className="flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden />
                  {SITE.org.address}
                </li>
              </ul>
              <p className="mt-3 text-xs text-ink-500">{SITE.org.hours}</p>
            </Card>

            <Card className="card-pad">
              <h3 className="card-title">Clinics & facilities</h3>
              <p className="mt-1 text-sm text-ink-600">
                Want your facility listed correctly, or your providers on the platform? Send the facility name, province,
                services offered and a contact person. An administrator verifies and publishes it.
              </p>
              <div className="mt-3">
                <Link to="/facilities" className="btn btn-secondary btn-sm">
                  See the directory
                </Link>
              </div>
            </Card>

            <Card className="card-pad border-risk-red/30 bg-risk-red/5">
              <h3 className="card-title">In an emergency</h3>
              <p className="mt-1 text-sm text-ink-700">{EMERGENCY_CONTACTS.note}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to="/emergency" className="btn btn-danger btn-sm">
                  Emergency guidance
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── Privacy ───────────────────────────────────────────────────────────── */

const PRIVACY_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: 'What we collect',
    body: [
      'Account: your name, email address and a hashed password. If you register as a provider, also your profession, facility and licence number.',
      'Health record: the dates you enter (last menstrual period, expected due date, birth date), appointments, medication and supplement reminders, observations you choose to record, immunization entries and your journal.',
      'Baby: the details you add for each child, including growth notes and immunization dates.',
      'Device: a push notification token per device you enable notifications on, and the browser language you select.',
      'Media: profile or facility photographs you upload are stored in Cloudinary; personal health documents you upload are stored in Firebase Storage under your own user folder.',
    ],
  },
  {
    title: 'What we never collect',
    body: [
      'Your precise location. The facility directory can sort by distance, but the coordinates are used in your browser only and are never written to your record.',
      'National identification numbers, payment details or insurance information.',
      'Anything from your journal is shared with a provider, even one you have linked your care to. The journal is yours alone.',
    ],
  },
  {
    title: 'Who can see your record',
    body: [
      'You, on any device you sign in on.',
      'A healthcare provider only after you link your care to them, and only the collections involved in that care. You can remove the link at any time.',
      'A supporter (partner or family member) only for the categories you switch on in Settings → Family support, and only after you approve their request.',
      'An administrator can see operational data — accounts, provider verifications, facility listings, articles, reports and the audit log — but not the contents of your private journal.',
      'Every access to a health record is written to an audit log with who, what and when.',
    ],
  },
  {
    title: 'Where your data lives',
    body: [
      'When Mama Care runs against Firebase, records are stored in Cloud Firestore and files in Firebase Storage / Cloudinary, under the project’s configured region and Google’s processing terms.',
      'When it runs without a hosted backend — for example in a demo or on a device with no configuration — records are stored in this browser’s IndexedDB and never leave it. Clearing your browser data removes them.',
      'The status page tells you which mode this device is using right now.',
    ],
  },
  {
    title: 'Your rights',
    body: [
      'Access and export: Settings → Privacy & data lets you download your record.',
      'Correction: you can edit anything you entered. Facility and article corrections go to an administrator.',
      'Deletion: Settings → Privacy & data → Delete my account removes your records and your authentication account.',
      'Withdrawal: remove a care link or a supporter at any time; existing audit entries are retained because they document who accessed what.',
      'Questions or complaints: write to ' + SITE.privacyContact + '. We aim to respond within 14 days.',
    ],
  },
  {
    title: 'How we protect it',
    body: [
      'Passwords are never stored in plain text. On a hosted deployment Firebase Authentication holds them; on-device they are derived with PBKDF2-SHA256 at 150,000 iterations.',
      'Firestore security rules enforce the same access decisions as the application, so a modified client cannot read another person’s record.',
      'Personal health documents are stored under a per-user path that only that user and their linked provider can read.',
      'Transport is HTTPS end to end. Media uploads use short-lived signatures or an unsigned preset limited to public imagery.',
      'We keep what is needed for care and audit, and no longer. Marketing is never done with your health data.',
    ],
  },
  {
    title: 'Children',
    body: [
      'Records about a baby are created and controlled by the parent or guardian who registered. A baby has no separate account. Access follows the mother’s sharing choices.',
    ],
  },
  {
    title: 'Changes to this page',
    body: [
      'If the way we handle data changes materially, we will say so in the app and by email where we have one. This page always reflects what the software actually does.',
    ],
  },
];

export function PrivacyPage() {
  useEffect(() => {
    document.title = 'Privacy · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="Privacy"
        title="Your health data, your rules"
        lede="This page describes what Mama Care actually does with your information — not a legal placeholder. If something here is unclear, write to us and we will explain it in plain language."
        image={<AppImage name="screening" alt="A health worker screening a pregnant woman" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <div className="space-y-4">
          {PRIVACY_SECTIONS.map((section) => (
            <Card key={section.title} className="card-pad">
              <h3 className="card-title">{section.title}</h3>
              <ul className="checklist mt-3">
                {section.body.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>

        <Card className="card-pad mt-8">
          <h3 className="card-title">Data protection contact</h3>
          <p className="mt-1 text-sm text-ink-600">
            <a href={`mailto:${SITE.privacyContact}`} className="text-brand-800 hover:underline">
              {SITE.privacyContact}
            </a>{' '}
            · {SITE.org.address} · {SITE.org.hours}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/terms" className="btn btn-secondary btn-sm">
              Terms of use
            </Link>
            <Link to="/status" className="btn btn-ghost btn-sm">
              System status
            </Link>
          </div>
        </Card>
      </section>
    </>
  );
}

/* ── Terms ─────────────────────────────────────────────────────────────── */

const TERMS_SECTIONS: { title: string; body: string[] }[] = [
  {
    title: '1. What Mama Care is',
    body: [
      'Mama Care is an educational and record-keeping tool for pregnancy, postnatal recovery and early childcare, built for Zambia and designed to extend across Africa.',
      'It is not a medical device, a telemedicine service, a diagnosis tool or an emergency service. It does not provide medical advice.',
      MEDICAL_DISCLAIMER,
    ],
  },
  {
    title: '2. Your account',
    body: [
      'You must give accurate information when registering and keep your password confidential. You are responsible for activity under your account.',
      'Provider accounts are verified by an administrator. Providing false professional credentials results in immediate suspension and may be reported.',
      'No account may self-assign an administrator role. Administrators are created by an existing administrator.',
    ],
  },
  {
    title: '3. Your content and your record',
    body: [
      'You own the information you enter. Mama Care uses it only to provide the service to you, to the providers and supporters you authorise, and to administrators for the operational purposes described in the privacy page.',
      'You may export or delete your record at any time from Settings → Privacy & data.',
      'Where a provider records clinical information about you, that provider and their facility are responsible for it as part of their own record-keeping obligations.',
    ],
  },
  {
    title: '4. Health content in the library',
    body: [
      'Built-in articles follow national and WHO guidance and are written for a general audience. They cannot account for your individual circumstances.',
      'Articles contributed by clinics and providers are reviewed by a qualified maternal-health professional before publication; the reviewer and review date are shown on the article.',
      'If you believe content is wrong or harmful, use “Report a concern” on the article. Reports are reviewed by an administrator.',
    ],
  },
  {
    title: '5. Acceptable use',
    body: [
      'Do not use Mama Care to harass, intimidate or mislead anyone, to impersonate a health professional, to send unsolicited commercial messages, or to attempt to access another person’s record.',
      'Messaging is moderated. Mama Care may remove content and suspend accounts that breach this policy, and may disclose information where required by law or to protect someone from serious harm.',
    ],
  },
  {
    title: '6. Availability and offline use',
    body: [
      'We aim for the service to be available, but do not guarantee uninterrupted access. Previously loaded content and records stored on your device remain available offline.',
      'Do not rely on Mama Care as the only record of an appointment or a medication. Keep your paper health booklet as well.',
    ],
  },
  {
    title: '7. Liability',
    body: [
      'Mama Care is provided “as is”. To the extent permitted by law, we are not liable for clinical decisions made on the basis of information in this app, or for the acts or omissions of any provider or facility listed in it.',
      'Nothing in these terms limits liability for death or personal injury caused by negligence, or any liability that cannot lawfully be excluded.',
    ],
  },
  {
    title: '8. Changes',
    body: [
      'We may update these terms. Material changes are announced in the app. Continuing to use Mama Care after a change means you accept it.',
    ],
  },
  {
    title: '9. Contact',
    body: [SITE.org.email + ' · ' + SITE.privacyContact + ' · ' + SITE.org.address],
  },
];

export function TermsPage() {
  useEffect(() => {
    document.title = 'Terms of use · Mama Care';
  }, []);

  return (
    <>
      <PublicHero
        eyebrow="Terms"
        title="Terms of use"
        lede="Short, readable and honest about what this service is and is not. The most important sentence is in section one."
        image={<AppImage name="dashboard" alt="The Mama Care dashboard on a phone and a laptop" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <div className="space-y-4">
          {TERMS_SECTIONS.map((section) => (
            <Card key={section.title} className="card-pad">
              <h3 className="card-title">{section.title}</h3>
              <ul className="mt-3 space-y-2">
                {section.body.map((line) => (
                  <li key={line} className="text-sm leading-relaxed text-ink-700">
                    {line}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
        <p className="mt-6 text-xs text-ink-500">
          These terms apply to the Mama Care web application. Where a facility deploys Mama Care for its own patients, that
          facility’s own terms and data-handling obligations also apply.
        </p>
      </section>
    </>
  );
}

/* ── System status ─────────────────────────────────────────────────────── */

export function StatusPage() {
  const { data, loading } = useAsync(() => diagnostics(), { deps: [] });
  const media = cloudinaryStatus();
  const { configurationError } = useSession();

  useEffect(() => {
    document.title = 'System status · Mama Care';
  }, []);

  const rows: { label: string; value: string; tone: 'green' | 'amber' | 'red' | 'neutral' }[] = [
    {
      label: 'Active data provider',
      value: data ? (data.provider === 'firebase' ? 'Firebase (Cloud Firestore)' : 'This device (IndexedDB)') : '—',
      tone: data?.provider === 'firebase' ? 'green' : 'amber',
    },
    {
      label: 'Requested by configuration',
      value: dataProvider,
      tone: !integrations.misconfigured ? 'green' : 'amber',
    },
    {
      label: 'Writes accepted',
      value: data ? (data.writable ? 'Yes' : 'Read-only') : '—',
      tone: data?.writable ? 'green' : 'amber',
    },
    {
      label: 'Local storage',
      value: storageMode() === 'indexeddb' ? 'IndexedDB available' : 'In-memory (private mode?)',
      tone: storageMode() === 'indexeddb' ? 'green' : 'amber',
    },
    { label: 'Media (Cloudinary)', value: media.label, tone: media.tone },
    {
      label: 'Push notifications',
      value: pushSupported() ? 'Supported in this browser' : 'Not supported in this browser',
      tone: pushSupported() ? 'green' : 'neutral',
    },
    { label: 'Signed in', value: data ? (data.signedIn ? 'Yes' : 'No') : '—', tone: 'neutral' },
    { label: 'Records visible to you', value: data ? String(data.records) : '—', tone: 'neutral' },
  ];

  return (
    <>
      <PublicHero
        eyebrow="Status"
        title="System status"
        lede="What this device is connected to right now. Useful when something behaves oddly, and honest about running without a hosted backend."
        image={<AppImage name="laboratory" alt="A laboratory technician testing a blood sample" ratio="4 / 3" />}
      />
      <section className="shell py-10">
        <Card className="card-pad">
          <div className="flex flex-wrap items-center gap-3">
            <Database className="size-5 text-brand-700" aria-hidden />
            <h3 className="card-title">Runtime</h3>
            {loading ? <Badge tone="neutral">Checking…</Badge> : null}
          </div>
          <dl className="mt-4 divide-y divide-ink-100">
            {rows.map((row) => (
              <div key={row.label} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <dt className="text-sm text-ink-600">{row.label}</dt>
                <dd>
                  <Badge tone={row.tone}>{row.value}</Badge>
                </dd>
              </div>
            ))}
          </dl>
          {media.detail ? <p className="mt-3 text-xs text-ink-500">{media.detail}</p> : null}
          {configurationError ? <p className="alert alert-warn mt-4">{configurationError}</p> : null}
        </Card>

        {data && data.records > 0 ? (
          <Card className="card-pad mt-6">
            <h3 className="card-title">Records you can see</h3>
            <p className="mt-1 text-xs text-ink-500">
              Counts only. This list never shows personal content, and it reflects your permissions — an administrator sees
              more, a supporter sees less.
            </p>
            <dl className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {Object.entries(data.perCollection)
                .filter(([, count]) => count > 0)
                .map(([name, count]) => (
                  <div key={name} className="flex items-center justify-between gap-2 rounded-lg border border-ink-100 px-3 py-2">
                    <dt className="text-xs text-ink-600">{name.replace(/_/g, ' ')}</dt>
                    <dd className="text-sm font-semibold text-ink-800">{count}</dd>
                  </div>
                ))}
            </dl>
          </Card>
        ) : null}

        <Card className="card-pad mt-6 border-ink-200 bg-ink-50">
          <h3 className="card-title">Something not working?</h3>
          <p className="mt-1 text-sm text-ink-600">
            Tell us what this page says and what you were trying to do. That single sentence saves a lot of guessing.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/contact" className="btn btn-primary btn-sm">
              Contact support
            </Link>
            <Link to="/faq" className="btn btn-secondary btn-sm">
              Read the FAQ
            </Link>
          </div>
        </Card>
      </section>
    </>
  );
}

/* ── 404 ───────────────────────────────────────────────────────────────── */

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page not found · Mama Care';
  }, []);

  return (
    <section className="shell py-16">
      <Card className="card-pad mx-auto max-w-xl text-center">
        <Badge tone="neutral">404</Badge>
        <h1 className="display mt-4">We could not find that page</h1>
        <p className="lede mt-2">
          The link may be old, or the page may have moved. Everything important is one tap from the home page.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Link to="/" className="btn btn-primary btn-sm">
            Home
          </Link>
          <Link to="/learn" className="btn btn-secondary btn-sm">
            Education library
          </Link>
          <Link to="/emergency" className="btn btn-danger btn-sm">
            Emergency
          </Link>
        </div>
      </Card>
    </section>
  );
}

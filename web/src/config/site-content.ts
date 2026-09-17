/**
 * Public site copy, brand values and emergency contacts.
 *
 * Everything an operator would want to change before publishing lives here or in
 * the environment. Emergency numbers default to Zambia's published short codes
 * and can be overridden per deployment with `VITE_EMERGENCY_*`.
 *
 * There is no single centralised ambulance number outside Lusaka, so the copy
 * always tells the user to call the labour ward of the nearest facility as well.
 */

const env = import.meta.env as Record<string, string | undefined>;

export const SITE = {
  name: env.VITE_APP_NAME ?? 'Mama Care',
  tagline: 'Every Mother. Every Journey.',
  alternativeTaglines: [
    'Care for Mama. Care for Baby.',
    'Your Pregnancy. Your Care.',
    'Supporting Mothers Every Step.',
    'From Pregnancy to Parenthood.',
  ],
  description:
    'Mama Care helps mothers track pregnancy, keep antenatal appointments, remember medication, learn week by week, and continue with baby care after birth — in one simple, secure place.',
  mission:
    'To make reliable maternal and newborn-care information more accessible while helping mothers organise their healthcare journey through simple, secure and accessible technology.',
  vision:
    'A future where every mother can access useful maternal-care information, remember important healthcare appointments, and confidently navigate pregnancy and early motherhood.',
  org: {
    name: env.VITE_ORG_NAME ?? 'Mama Care',
    email: env.VITE_SUPPORT_EMAIL ?? 'support@mamacare.health',
    phone: env.VITE_ORG_PHONE ?? '',
    address: env.VITE_ORG_ADDRESS ?? 'Lusaka, Zambia',
    hours: env.VITE_ORG_HOURS ?? 'Support: Monday–Friday, 08:00–17:00 (CAT)',
  },
  privacyContact: env.VITE_PRIVACY_EMAIL ?? 'data-protection@mamacare.health',
  country: 'Zambia',
} as const;

/** The medical-safety statement repeated wherever medical information is shown. */
export const MEDICAL_DISCLAIMER =
  'Mama Care provides educational information and organisational tools. It does not diagnose medical conditions or replace a qualified healthcare professional. If you are concerned about your health or your baby\'s health, contact a qualified healthcare professional. For emergencies, seek immediate medical assistance.';

export const SHORT_DISCLAIMER =
  'Educational information only — not a diagnosis and not a replacement for professional care.';

export const EMERGENCY_CONTACTS = {
  ambulance: env.VITE_EMERGENCY_AMBULANCE ?? '991',
  emergency: env.VITE_EMERGENCY_EMERGENCY ?? '999',
  fire: env.VITE_EMERGENCY_FIRE ?? '993',
  facilityLine: env.VITE_EMERGENCY_FACILITY_LINE ?? '',
  lines: [
    { label: 'Emergency — police, ambulance, fire', number: env.VITE_EMERGENCY_EMERGENCY ?? '999' },
    { label: 'Police', number: env.VITE_EMERGENCY_POLICE ?? '991' },
    { label: 'Fire brigade', number: env.VITE_EMERGENCY_FIRE ?? '993' },
    { label: 'Lusaka Ambulance Service', number: env.VITE_EMERGENCY_LUSAKA_AMBULANCE ?? '0211 220180' },
  ].filter((line) => Boolean(line.number)),
  note: 'Outside Lusaka there is no single centralised ambulance number. Call the labour ward of your nearest facility directly and send someone with the mother. Every minute matters in an obstetric emergency.',
  /** Shown next to the emergency button so it is never mistaken for a diagnosis. */
  guidance:
    'If you are unsure whether it is serious, treat it as serious. Contact a healthcare professional or go to the nearest facility with a maternity service.',
} as const;

/** What to take when going to a facility in a hurry. */
export const EMERGENCY_CHECKLIST = [
  'Your antenatal health card or clinic book.',
  'Your national ID (NRIC).',
  'Transport money, and a little extra.',
  'Someone to go with you.',
  'Your phone and charger.',
  'A note of your medications and any allergies.',
  'A note of when the symptoms started.',
];

export const FOOTER_LINKS = {
  mothers: [
    { label: 'Pregnancy tracker', to: '/app' },
    { label: 'Weekly guide', to: '/learn/weeks' },
    { label: 'Appointments', to: '/app/appointments' },
    { label: 'Reminders', to: '/app/reminders' },
    { label: 'Baby', to: '/app/baby' },
  ],
  learn: [
    { label: 'Health education', to: '/learn' },
    { label: 'Warning signs', to: '/emergency' },
    { label: 'Immunization schedule', to: '/learn/immunization' },
    { label: 'Safe sleep for babies', to: '/learn/newborn' },
  ],
  support: [
    { label: 'Find a facility', to: '/facilities' },
    { label: 'Provider directory', to: '/providers' },
    { label: 'Contact us', to: '/contact' },
    { label: 'FAQ', to: '/faq' },
    { label: 'Privacy', to: '/privacy' },
  ],
} as const;

export const FAQS: { q: string; a: string }[] = [
  {
    q: 'Is Mama Care a medical service?',
    a: 'No. Mama Care is an educational and organisational tool. It helps you keep track of your pregnancy, remember appointments, and read reliable information. It never diagnoses a condition and never replaces a qualified healthcare professional.',
  },
  {
    q: 'What does Mama Care cost?',
    a: 'The tracker, weekly guide, appointment and medication reminders, baby records and the education library are free. Data charges from your network operator still apply when you are online; the app keeps working offline for anything you have already loaded.',
  },
  {
    q: 'How is my due date calculated?',
    a: 'By default from the first day of your last menstrual period, plus 280 days (40 weeks). If a scan dates your pregnancy differently, your provider\'s date is used and you can enter it instead. All dates are estimates — a clinician\'s assessment always takes precedence.',
  },
  {
    q: 'Can a healthcare provider see my information?',
    a: 'Only if you have shared your care with them, and only the records involved in that care. Your journal stays private to you no matter who is on your care team. You can remove sharing at any time.',
  },
  {
    q: 'Can my partner or family see my reminders?',
    a: 'Only the categories you switch on for them, from Settings → Family support. You control it and can change or revoke access at any time.',
  },
  {
    q: 'Does it work without internet?',
    a: 'Yes, partly. Previously downloaded education, your pregnancy progress, saved appointments, reminders and baby information stay available offline and synchronise when the connection returns.',
  },
  {
    q: 'How do I delete my account and my data?',
    a: 'Settings → Privacy & data → Delete my account. Your records are removed and your Firebase Authentication account is deleted. Ask your provider to remove anything they hold separately.',
  },
  {
    q: 'Who writes the health content?',
    a: 'The built-in library follows national and WHO guidance and is written for a general audience. Content added by clinics and providers is reviewed by a qualified maternal-health professional before it is published, and the reviewer is recorded on the article.',
  },
  {
    q: 'Which languages are supported?',
    a: 'English is available now. Bemba, Nyanja, Tonga and Lozi are planned and will be reviewed by qualified native speakers and health professionals before release.',
  },
  {
    q: 'I am having an emergency. What do I do?',
    a: 'Go to the Emergency screen for the warning signs and the numbers to call. If you are unsure whether it is serious, treat it as serious and seek care now.',
  },
];

/** Build identifier shown on Settings and the status page. */
export const APP_VERSION = `${SITE.name} ${env.VITE_APP_VERSION ?? import.meta.env?.MODE ?? 'dev'}`;

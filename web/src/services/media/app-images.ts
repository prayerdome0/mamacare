/**
 * The sixteen primary MAMA CARE images.
 *
 * Each entry names the Cloudinary public id (folder `mamacare/public`, which the
 * upload script creates automatically) and a local fallback that ships with the
 * build, so the landing page renders identically before and after media is
 * uploaded to Cloudinary. Replace a file or re-run `npm run media:push` and every
 * screen that uses the key updates — no component changes.
 */

export type AppImageKey =
  | 'hero'
  | 'ancConsultation'
  | 'midwifeConsultation'
  | 'screening'
  | 'motherNewborn'
  | 'communityWorker'
  | 'clinicEnvironment'
  | 'maternalEducation'
  | 'appointmentCheckin'
  | 'aboutPlatform'
  | 'referralTransport'
  | 'obstetricUltrasound'
  | 'laboratoryTesting'
  | 'newbornWeighing'
  | 'mobileReminder'
  | 'outreachVisit';

export interface AppImageDefinition {
  key: AppImageKey;
  /** Cloudinary public id under the auto-created mamacare/public folder. */
  publicId: string;
  /** Bundled fallback so the UI never shows a broken image. */
  localSrc: string;
  alt: string;
  /** Editorial caption used where the image is presented as content. */
  caption: string;
  /** Intrinsic ratio, used to reserve layout space and avoid layout shift. */
  aspect: [number, number];
  /** Suggested responsive widths for the srcset. */
  widths?: number[];
}

export const APP_IMAGES: Record<AppImageKey, AppImageDefinition> = {
  hero: {
    key: 'hero',
    publicId: 'mamacare/public/hero-antenatal-care',
    localSrc: '/images/hero-antenatal-care.jpg',
    alt: 'Midwife taking the blood pressure of a pregnant woman during an antenatal visit',
    caption: 'Antenatal day clinic, Lusaka Province',
    aspect: [16, 10],
    widths: [640, 960, 1280, 1600],
  },
  ancConsultation: {
    key: 'ancConsultation',
    publicId: 'mamacare/public/anc-consultation',
    localSrc: '/images/anc-consultation.jpg',
    alt: 'Clinician measuring fundal height during a routine antenatal consultation',
    caption: 'Routine ANC consultation with fundal height measurement',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  midwifeConsultation: {
    key: 'midwifeConsultation',
    publicId: 'mamacare/public/midwife-consultation',
    localSrc: '/images/midwife-consultation.jpg',
    alt: 'Midwife listening to fetal heartbeat while a colleague records the findings',
    caption: 'Fetal heart assessment and same-visit documentation',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  screening: {
    key: 'screening',
    publicId: 'mamacare/public/maternal-screening',
    localSrc: '/images/maternal-screening.jpg',
    alt: 'Health workers screening pregnant women at a clinic station',
    caption: 'Screening station: blood pressure and urine testing',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  motherNewborn: {
    key: 'motherNewborn',
    publicId: 'mamacare/public/mother-newborn',
    localSrc: '/images/mother-newborn.jpg',
    alt: 'Mother holding her newborn skin-to-skin in a maternity bed',
    caption: 'Immediate postnatal care on the maternity ward',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  communityWorker: {
    key: 'communityWorker',
    publicId: 'mamacare/public/community-health-worker',
    localSrc: '/images/community-health-worker.jpg',
    alt: 'Community health worker reviewing a pregnant woman’s record on a tablet at her home',
    caption: 'Community follow-up where the clinic cannot reach',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  clinicEnvironment: {
    key: 'clinicEnvironment',
    publicId: 'mamacare/public/clinic-environment',
    localSrc: '/images/clinic-environment.jpg',
    alt: 'Reception and waiting area of a maternal health clinic',
    caption: 'Reception and records area, designed for queue flow',
    aspect: [16, 9],
    widths: [640, 960, 1280],
  },
  maternalEducation: {
    key: 'maternalEducation',
    publicId: 'mamacare/public/maternal-education',
    localSrc: '/images/maternal-education.jpg',
    alt: 'Health education session for pregnant women led by a nurse',
    caption: 'Group education sessions between ANC visits',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  appointmentCheckin: {
    key: 'appointmentCheckin',
    publicId: 'mamacare/public/appointment-checkin',
    localSrc: '/images/appointment-checkin.jpg',
    alt: 'Pregnant woman checking in at the appointment desk with her health passport',
    caption: 'Appointment check-in against the visit schedule',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  aboutPlatform: {
    key: 'aboutPlatform',
    publicId: 'mamacare/public/about-dashboard',
    localSrc: '/images/about-dashboard.jpg',
    alt: 'Nurse and district health officer reviewing a maternal care dashboard',
    caption: 'Facility and district oversight on one record',
    aspect: [3, 2],
    widths: [640, 960, 1280],
  },
  referralTransport: {
    key: 'referralTransport',
    publicId: 'mamacare/public/referral-transport',
    localSrc: '/images/referral-transport.jpg',
    alt: 'Nurse helping a pregnant woman into a clinic referral vehicle while a companion holds her bag',
    caption: 'The referral journey: escorted transport to the receiving facility',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  obstetricUltrasound: {
    key: 'obstetricUltrasound',
    publicId: 'mamacare/public/obstetric-ultrasound',
    localSrc: '/images/obstetric-ultrasound.jpg',
    alt: 'Sonographer performing an obstetric ultrasound scan on a pregnant woman',
    caption: 'Dating and growth scans documented on the visit',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  laboratoryTesting: {
    key: 'laboratoryTesting',
    publicId: 'mamacare/public/laboratory-testing',
    localSrc: '/images/laboratory-testing.jpg',
    alt: 'Laboratory technician examining a rack of blood sample tubes in a clinic laboratory',
    caption: 'Haemoglobin, malaria and syphilis screening on site',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  newbornWeighing: {
    key: 'newbornWeighing',
    publicId: 'mamacare/public/newborn-weighing',
    localSrc: '/images/newborn-weighing.jpg',
    alt: 'Nurse weighing a newborn baby on a scale while the mother watches from the bed',
    caption: 'Day-one weight and newborn check on the postnatal ward',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  mobileReminder: {
    key: 'mobileReminder',
    publicId: 'mamacare/public/mobile-reminder',
    localSrc: '/images/mobile-reminder.jpg',
    alt: 'Pregnant woman sitting on her doorstep reading an appointment reminder message on her phone',
    caption: 'Appointment reminders on the mother’s own phone',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  outreachVisit: {
    key: 'outreachVisit',
    publicId: 'mamacare/public/outreach-visit',
    localSrc: '/images/outreach-visit.jpg',
    alt: 'Community health worker with a visiting bag walking a footpath between rural households',
    caption: 'Outreach where the road ends',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
};

export const APP_IMAGE_LIST: AppImageDefinition[] = Object.values(APP_IMAGES);

export const imageByKey = (key: AppImageKey): AppImageDefinition => APP_IMAGES[key];

/** Alt text is authored per image — never derived from a filename. */
export const imageAlt = (key: AppImageKey): string => APP_IMAGES[key].alt;

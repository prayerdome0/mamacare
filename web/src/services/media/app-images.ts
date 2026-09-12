/**
 * The sixteen primary MAMA CARE images.
 *
 * Every page renders the copy **bundled with the application**, so the site
 * never depends on a remote asset being present — an image cannot 404, and the
 * page never shows a broken frame. This matches the deployment's Cloudinary
 * policy too: the media library is a flat list of user uploads, with no
 * `mamacare/*` folder tree for the site to point at.
 *
 * To serve one of these from Cloudinary instead, set `remotePublicId` to the
 * asset's root-level public id (no folder) and it is used for delivery, with
 * the bundled file as the automatic fallback.
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
  /**
   * Optional Cloudinary public id at the media-library ROOT (no folder).
   * Left `null` by default so the bundled file is authoritative.
   */
  remotePublicId: string | null;
  /** The file that ships with the application and is always available. */
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
    remotePublicId: null,    localSrc: '/images/hero-antenatal-care.jpg',
    alt: 'Midwife taking the blood pressure of a pregnant woman during an antenatal visit',
    caption: 'Antenatal day clinic, Lusaka Province',
    aspect: [16, 10],
    widths: [640, 960, 1280, 1600],
  },
  ancConsultation: {
    key: 'ancConsultation',
    remotePublicId: null,    localSrc: '/images/anc-consultation.jpg',
    alt: 'Clinician measuring fundal height during a routine antenatal consultation',
    caption: 'Routine ANC consultation with fundal height measurement',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  midwifeConsultation: {
    key: 'midwifeConsultation',
    remotePublicId: null,    localSrc: '/images/midwife-consultation.jpg',
    alt: 'Midwife listening to fetal heartbeat while a colleague records the findings',
    caption: 'Fetal heart assessment and same-visit documentation',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  screening: {
    key: 'screening',
    remotePublicId: null,    localSrc: '/images/maternal-screening.jpg',
    alt: 'Health workers screening pregnant women at a clinic station',
    caption: 'Screening station: blood pressure and urine testing',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  motherNewborn: {
    key: 'motherNewborn',
    remotePublicId: null,    localSrc: '/images/mother-newborn.jpg',
    alt: 'Mother holding her newborn skin-to-skin in a maternity bed',
    caption: 'Immediate postnatal care on the maternity ward',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  communityWorker: {
    key: 'communityWorker',
    remotePublicId: null,    localSrc: '/images/community-health-worker.jpg',
    alt: 'Community health worker reviewing a pregnant woman’s record on a tablet at her home',
    caption: 'Community follow-up where the clinic cannot reach',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  clinicEnvironment: {
    key: 'clinicEnvironment',
    remotePublicId: null,    localSrc: '/images/clinic-environment.jpg',
    alt: 'Reception and waiting area of a maternal health clinic',
    caption: 'Reception and records area, designed for queue flow',
    aspect: [16, 9],
    widths: [640, 960, 1280],
  },
  maternalEducation: {
    key: 'maternalEducation',
    remotePublicId: null,    localSrc: '/images/maternal-education.jpg',
    alt: 'Health education session for pregnant women led by a nurse',
    caption: 'Group education sessions between ANC visits',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  appointmentCheckin: {
    key: 'appointmentCheckin',
    remotePublicId: null,    localSrc: '/images/appointment-checkin.jpg',
    alt: 'Pregnant woman checking in at the appointment desk with her health passport',
    caption: 'Appointment check-in against the visit schedule',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  aboutPlatform: {
    key: 'aboutPlatform',
    remotePublicId: null,    localSrc: '/images/about-dashboard.jpg',
    alt: 'Nurse and district health officer reviewing a maternal care dashboard',
    caption: 'Facility and district oversight on one record',
    aspect: [3, 2],
    widths: [640, 960, 1280],
  },
  referralTransport: {
    key: 'referralTransport',
    remotePublicId: null,    localSrc: '/images/referral-transport.jpg',
    alt: 'Nurse helping a pregnant woman into a clinic referral vehicle while a companion holds her bag',
    caption: 'The referral journey: escorted transport to the receiving facility',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  obstetricUltrasound: {
    key: 'obstetricUltrasound',
    remotePublicId: null,    localSrc: '/images/obstetric-ultrasound.jpg',
    alt: 'Sonographer performing an obstetric ultrasound scan on a pregnant woman',
    caption: 'Dating and growth scans documented on the visit',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  laboratoryTesting: {
    key: 'laboratoryTesting',
    remotePublicId: null,    localSrc: '/images/laboratory-testing.jpg',
    alt: 'Laboratory technician examining a rack of blood sample tubes in a clinic laboratory',
    caption: 'Haemoglobin, malaria and syphilis screening on site',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  newbornWeighing: {
    key: 'newbornWeighing',
    remotePublicId: null,    localSrc: '/images/newborn-weighing.jpg',
    alt: 'Nurse weighing a newborn baby on a scale while the mother watches from the bed',
    caption: 'Day-one weight and newborn check on the postnatal ward',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  mobileReminder: {
    key: 'mobileReminder',
    remotePublicId: null,    localSrc: '/images/mobile-reminder.jpg',
    alt: 'Pregnant woman sitting on her doorstep reading an appointment reminder message on her phone',
    caption: 'Appointment reminders on the mother’s own phone',
    aspect: [3, 2],
    widths: [480, 720, 960],
  },
  outreachVisit: {
    key: 'outreachVisit',
    remotePublicId: null,    localSrc: '/images/outreach-visit.jpg',
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

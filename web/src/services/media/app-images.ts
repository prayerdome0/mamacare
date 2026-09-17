/**
 * Bundled imagery.
 *
 * The sixteen photographs that ship in `web/public/images` are indexed here so a
 * screen can ask for one by name (`<AppImage name="mother-newborn" />`) instead
 * of hard-coding a path. Each entry also carries the alt text that describes it,
 * because the alt text is part of the accessibility contract, not an afterthought.
 *
 * If an administrator uploads a replacement to Cloudinary and stores its public id
 * in `remotePublicId`, `AppImage` serves the cloud copy and falls back to the
 * bundled file when Cloudinary is unreachable.
 */

export type AppImageKey =
  | 'hero'
  | 'antenatal-consultation'
  | 'midwife'
  | 'mother-newborn'
  | 'newborn-weighing'
  | 'ultrasound'
  | 'education'
  | 'screening'
  | 'reminder'
  | 'appointment'
  | 'clinic'
  | 'community-health-worker'
  | 'outreach'
  | 'laboratory'
  | 'referral'
  | 'dashboard';

export interface AppImageDefinition {
  key: AppImageKey;
  /** Path inside `web/public`. */
  localSrc: string;
  alt: string;
  /** Optional Cloudinary public id at the media-library root. */
  remotePublicId?: string | null;
  /** Widths used to build a responsive srcset for the cloud copy. */
  widths?: number[];
  caption?: string;
}

const image = (
  key: AppImageKey,
  file: string,
  alt: string,
  caption?: string,
): AppImageDefinition => ({
  key,
  localSrc: `/images/${file}`,
  alt,
  remotePublicId: null,
  widths: [480, 768, 1280],
  caption,
});

export const APP_IMAGES: Record<AppImageKey, AppImageDefinition> = {
  hero: image('hero', 'hero-antenatal-care.jpg', 'A pregnant woman at an antenatal care visit with a nurse'),
  'antenatal-consultation': image(
    'antenatal-consultation',
    'anc-consultation.jpg',
    'A nurse talking with a pregnant woman during an antenatal consultation',
  ),
  midwife: image('midwife', 'midwife-consultation.jpg', 'A midwife examining a pregnant woman at a clinic'),
  'mother-newborn': image('mother-newborn', 'mother-newborn.jpg', 'A mother holding her newborn baby'),
  'newborn-weighing': image('newborn-weighing', 'newborn-weighing.jpg', 'A health worker weighing a newborn baby on a scale'),
  ultrasound: image('ultrasound', 'obstetric-ultrasound.jpg', 'An obstetric ultrasound scan being performed'),
  education: image('education', 'maternal-education.jpg', 'A health educator speaking with a group of mothers'),
  screening: image('screening', 'maternal-screening.jpg', 'A health worker screening a pregnant woman'),
  reminder: image('reminder', 'mobile-reminder.jpg', 'A hand holding a phone showing an appointment reminder'),
  appointment: image('appointment', 'appointment-checkin.jpg', 'A mother checking in for her appointment at a clinic'),
  clinic: image('clinic', 'clinic-environment.jpg', 'The waiting area of a maternal health clinic'),
  'community-health-worker': image(
    'community-health-worker',
    'community-health-worker.jpg',
    'A community health worker visiting a family at home',
  ),
  outreach: image('outreach', 'outreach-visit.jpg', 'A health outreach visit in the community'),
  laboratory: image('laboratory', 'laboratory-testing.jpg', 'A laboratory technician testing a blood sample'),
  referral: image('referral', 'referral-transport.jpg', 'An ambulance used to transfer a patient to hospital'),
  dashboard: image('dashboard', 'about-dashboard.jpg', 'The Mama Care dashboard on a phone and a laptop'),
};

export const APP_IMAGE_LIST: AppImageDefinition[] = Object.values(APP_IMAGES);

export const imageByKey = (key: AppImageKey): AppImageDefinition => APP_IMAGES[key];

export const imageAlt = (key: AppImageKey): string => APP_IMAGES[key]?.alt ?? 'Photograph';

/** Images used on the public marketing pages, in order. */
export const LANDING_IMAGES: AppImageKey[] = [
  'hero',
  'mother-newborn',
  'reminder',
  'antenatal-consultation',
  'education',
  'midwife',
];

/** Images used inside the signed-in app. */
export const APP_SCREEN_IMAGES: Record<string, AppImageKey> = {
  home: 'hero',
  pregnancy: 'antenatal-consultation',
  baby: 'mother-newborn',
  appointments: 'appointment',
  reminders: 'reminder',
  learn: 'education',
  facilities: 'clinic',
  emergency: 'referral',
  immunization: 'newborn-weighing',
  provider: 'midwife',
  admin: 'dashboard',
};

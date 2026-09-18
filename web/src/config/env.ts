/**
 * Centralised, validated environment configuration.
 *
 * ONLY values that are safe to ship to a browser are read here. A Firebase *web*
 * config and an FCM VAPID key are public by design — they identify the project,
 * they are not credentials, and every request they make is still authorised by
 * Firebase Authentication and `firestore.rules`. Cloudinary's cloud name and an
 * UNSIGNED upload preset are public for the same reason.
 *
 * The project defaults below mean a fresh clone runs against the live Mama Care
 * Firebase project with no setup. Every value can still be overridden with a
 * `VITE_*` variable (see `.env.example`) for a staging project or a white-label
 * deployment. Nothing secret may ever be added here: Vite inlines `VITE_*` into
 * the browser bundle.
 */

const raw = import.meta.env ?? {};

const str = (value: unknown, fallback = ''): string => {
  const trimmed = typeof value === 'string' ? value.trim() : '';
  return trimmed || fallback;
};

/* ── Firebase project (mamacare-33821) ────────────────────────────────── */

const FIREBASE_DEFAULTS = {
  apiKey: 'AIzaSyCh2OcQ4AKL0ENZolDxNVCC6ecwXmzEPHg',
  authDomain: 'mamacare-33821.firebaseapp.com',
  projectId: 'mamacare-33821',
  storageBucket: 'mamacare-33821.firebasestorage.app',
  messagingSenderId: '387829914499',
  appId: '1:387829914499:web:81cc4725ebf4283d72f4b6',
};

/** Web Push certificate for background notifications (public by design). */
const VAPID_DEFAULT =
  'BErAoXP_z4iLUWopUmh6_gLaKYeaf5Mgtw5G4SouZMFonGbsT4kjuMWMHECH9vbPTx55hFoAFuc-fgZAGiWwGyc';

const firebaseConfig = {
  apiKey: str(raw.VITE_FIREBASE_API_KEY, FIREBASE_DEFAULTS.apiKey),
  authDomain: str(raw.VITE_FIREBASE_AUTH_DOMAIN, FIREBASE_DEFAULTS.authDomain),
  projectId: str(raw.VITE_FIREBASE_PROJECT_ID, FIREBASE_DEFAULTS.projectId),
  storageBucket: str(raw.VITE_FIREBASE_STORAGE_BUCKET, FIREBASE_DEFAULTS.storageBucket),
  messagingSenderId: str(raw.VITE_FIREBASE_MESSAGING_SENDER_ID, FIREBASE_DEFAULTS.messagingSenderId),
  appId: str(raw.VITE_FIREBASE_APP_ID, FIREBASE_DEFAULTS.appId),
  measurementId: str(raw.VITE_FIREBASE_MEASUREMENT_ID) || undefined,
};

/** A Firebase app is usable when the four identity-critical fields exist. */
const firebaseComplete = Boolean(
  firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId,
);

export type DataProvider = 'firebase' | 'local';

const forcedProvider = str(raw.VITE_DATA_PROVIDER).toLowerCase();

/**
 * `auto` (the default) uses Firebase when it is configured and falls back to this
 * device's IndexedDB otherwise. Pin `local` to work fully offline, or `firebase`
 * to make a misconfigured install fail loudly instead of writing to the device.
 */
export const dataProvider: DataProvider =
  forcedProvider === 'local' || forcedProvider === 'firebase'
    ? forcedProvider
    : firebaseComplete
      ? 'firebase'
      : 'local';

export const misconfigured = forcedProvider === 'firebase' && !firebaseComplete;

/* ── Cloudinary (media) ───────────────────────────────────────────────── */

const CLOUDINARY_DEFAULTS = {
  cloudName: 'mk2tulbt',
  uploadPreset: 'Mamcare',
};

const cloudinary = {
  cloudName: str(raw.VITE_CLOUDINARY_CLOUD_NAME, CLOUDINARY_DEFAULTS.cloudName),
  /** Unsigned preset — browser uploads land flat at the media-library root. */
  unsignedPreset: str(raw.VITE_CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_DEFAULTS.uploadPreset),
  secureBase: str(raw.VITE_CLOUDINARY_SECURE_BASE, 'https://res.cloudinary.com'),
  get enabled(): boolean {
    return Boolean(this.cloudName);
  },
  get browserUploadEnabled(): boolean {
    return Boolean(this.cloudName && this.unsignedPreset);
  },
  get deliveryOrigin(): string {
    return this.enabled ? `${this.secureBase}/${this.cloudName}` : '';
  },
};

/* ── Application ──────────────────────────────────────────────────────── */

export const app = {
  name: str(raw.VITE_APP_NAME, 'Mama Care'),
  tagline: str(raw.VITE_APP_TAGLINE, 'Every Mother. Every Journey.'),
  env: str(raw.VITE_APP_ENV, import.meta.env?.MODE ?? 'development'),
  isProduction: import.meta.env?.PROD === true,
  supportEmail: str(raw.VITE_SUPPORT_EMAIL, 'support@mamacare.health'),
  supportPhone: str(raw.VITE_SUPPORT_PHONE, ''),
  region: str(raw.VITE_FACILITY_REGION, 'Lusaka Province, Zambia'),
  /** Zambia is the default market; other countries stay selectable. */
  defaultCountry: str(raw.VITE_DEFAULT_COUNTRY, 'ZM').toUpperCase(),
  defaultCurrency: str(raw.VITE_DEFAULT_CURRENCY, 'ZMW').toUpperCase(),
  defaultDialCode: str(raw.VITE_DEFAULT_DIAL_CODE, '+260'),
  deployedUrl: str(raw.VITE_PUBLIC_URL),
  fcmVapidKey: str(raw.VITE_FIREBASE_VAPID_KEY, VAPID_DEFAULT),
  /**
   * Emails that may claim the first ADMIN account from Settings. With a live
   * Firebase project the safer path is to set the custom claim from the
   * console; this list exists so a new deployment is never locked out.
   */
  bootstrapAdminEmails: str(raw.VITE_BOOTSTRAP_ADMIN_EMAILS)
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Seed a demonstration dataset on a device-mode install (first run only). */
  demoSeed: str(raw.VITE_LOCAL_DEMO_SEED, 'true').toLowerCase() !== 'false',
};

/* ── Diagnostics ──────────────────────────────────────────────────────── */

/** Redacted, UI-safe view of what is wired up. Never contains secret values. */
export const integrations = {
  firebase: {
    configured: firebaseComplete,
    projectId: firebaseConfig.projectId ? mask(firebaseConfig.projectId) : null,
  },
  cloudinary: {
    configured: cloudinary.enabled,
    cloudName: cloudinary.cloudName ? mask(cloudinary.cloudName) : null,
    unsignedPresetConfigured: Boolean(cloudinary.unsignedPreset),
  },
  push: {
    configured: Boolean(app.fcmVapidKey && firebaseComplete),
  },
  provider: dataProvider,
  forcedProvider: forcedProvider || null,
  misconfigured,
} as const;

function mask(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

export interface EnvCheck {
  key: string;
  present: boolean;
  required: boolean;
  purpose: string;
}

/** Reports *which* variables are missing, never their values. */
export const environmentChecks = (): EnvCheck[] => [
  { key: 'VITE_FIREBASE_API_KEY', present: Boolean(firebaseConfig.apiKey), required: false, purpose: 'Firebase Auth + Firestore' },
  { key: 'VITE_FIREBASE_AUTH_DOMAIN', present: Boolean(firebaseConfig.authDomain), required: false, purpose: 'Auth domain (must list this site under Authorised domains)' },
  { key: 'VITE_FIREBASE_PROJECT_ID', present: Boolean(firebaseConfig.projectId), required: false, purpose: 'Firestore project' },
  { key: 'VITE_FIREBASE_APP_ID', present: Boolean(firebaseConfig.appId), required: false, purpose: 'Web app id' },
  { key: 'VITE_FIREBASE_STORAGE_BUCKET', present: Boolean(firebaseConfig.storageBucket), required: false, purpose: 'Storage bucket reference' },
  { key: 'VITE_FIREBASE_MESSAGING_SENDER_ID', present: Boolean(firebaseConfig.messagingSenderId), required: false, purpose: 'Browser push' },
  { key: 'VITE_FIREBASE_VAPID_KEY', present: Boolean(app.fcmVapidKey), required: false, purpose: 'Web Push certificate for background notifications' },
  { key: 'VITE_CLOUDINARY_CLOUD_NAME', present: cloudinary.enabled, required: false, purpose: 'Image delivery and uploads' },
  { key: 'VITE_CLOUDINARY_UPLOAD_PRESET', present: Boolean(cloudinary.unsignedPreset), required: false, purpose: 'Unsigned browser uploads' },
];

export const firebase = firebaseConfig;
export const cloudinaryConfig = cloudinary;

/** Console boot summary — identifiers only, never config values. */
export function logRuntimeSummary(logger: Console = console): void {
  if (app.isProduction && !integrations.misconfigured) return;
  logger.info(
    `[mamacare] provider=${dataProvider} firebase=${integrations.firebase.configured} cloudinary=${integrations.cloudinary.configured} push=${integrations.push.configured}`,
  );
}

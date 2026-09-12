/**
 * Centralised, validated environment configuration.
 *
 * ONLY values that are safe to ship to a browser may be read here. Everything
 * prefixed `VITE_` is public by construction (Vite inlines it into the bundle),
 * so this module refuses to look at anything else and exposes only booleans /
 * redacted labels for diagnostics. Server-only credentials (Cloudinary API
 * secret, Firebase service account, SMS keys) live exclusively in `../server`.
 */

const raw = import.meta.env ?? {};

const str = (value: unknown): string =>
  typeof value === 'string' ? value.trim() : '';

export type DataProvider = 'firebase' | 'local';

const firebaseConfig = {
  apiKey: str(raw.VITE_FIREBASE_API_KEY),
  authDomain: str(raw.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: str(raw.VITE_FIREBASE_PROJECT_ID),
  storageBucket: str(raw.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: str(raw.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: str(raw.VITE_FIREBASE_APP_ID),
  measurementId: str(raw.VITE_FIREBASE_MEASUREMENT_ID) || undefined,
};

/** A Firebase app is only usable when the four identity-critical fields exist. */
const firebaseComplete = Boolean(
  firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.projectId &&
    firebaseConfig.appId,
);

const forcedProvider = str(raw.VITE_DATA_PROVIDER).toLowerCase();
export const dataProvider: DataProvider =
  forcedProvider === 'local' || forcedProvider === 'firebase'
    ? forcedProvider
    : firebaseComplete
      ? 'firebase'
      : 'local';

/**
 * When the operator pinned `firebase` but the config is incomplete we must not
 * silently fall back to local storage — that would show staff an app that
 * *looks* live while writing to their device. Surface a blocking notice instead.
 */
export const misconfigured = forcedProvider === 'firebase' && !firebaseComplete;

const cloudinary = {
  cloudName: str(raw.VITE_CLOUDINARY_CLOUD_NAME),
  unsignedPreset: str(raw.VITE_CLOUDINARY_UPLOAD_PRESET),
  secureBase: str(raw.VITE_CLOUDINARY_SECURE_BASE) || 'https://res.cloudinary.com',
  get enabled(): boolean {
    return Boolean(this.cloudName);
  },
  get browserUploadEnabled(): boolean {
    return Boolean(this.cloudName && this.unsignedPreset);
  },
  /** e.g. https://res.cloudinary.com/demo — used to render delivery URLs. */
  get deliveryOrigin(): string {
    return this.enabled ? `${this.secureBase}/${this.cloudName}` : '';
  },
};

export const app = {
  name: str(raw.VITE_APP_NAME) || 'MAMA CARE',
  env: str(raw.VITE_APP_ENV) || (import.meta.env?.MODE ?? 'development'),
  isProduction: import.meta.env?.PROD === true,
  apiBaseUrl: str(raw.VITE_API_BASE_URL) || '/api',
  supportEmail: str(raw.VITE_SUPPORT_EMAIL) || 'support@mamacare.health',
  supportPhone: str(raw.VITE_SUPPORT_PHONE) || '+260 00 000 0000',
  region: str(raw.VITE_FACILITY_REGION) || 'Lusaka Province, Zambia',
  /**
   * Zambia is the default market: the default country, dialling code and
   * currency are all Zambian unless the deployment overrides them. Other
   * countries remain selectable, so the platform stays usable internationally.
   */
  defaultCountry: (str(raw.VITE_DEFAULT_COUNTRY) || 'ZM').toUpperCase(),
  defaultCurrency: (str(raw.VITE_DEFAULT_CURRENCY) || 'ZMW').toUpperCase(),
  defaultDialCode: str(raw.VITE_DEFAULT_DIAL_CODE) || '+260',
  /** Shown on the public status page so a deployment can be checked at a glance. */
  deployedUrl: str(raw.VITE_PUBLIC_URL),
  /**
   * Emails allowed to self-promote to ADMIN through the server-side bootstrap
   * route (the only path to privileged claims besides an existing admin). The
   * list lives server-side too; this value only pre-fills UI hints.
   */
  bootstrapAdminEmails: `${str(raw.VITE_LOCAL_ADMIN_EMAILS)},${str(raw.VITE_BOOTSTRAP_ADMIN_EMAILS)}`
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  /** Local (device) provider only: seed a demonstration dataset on first run. */
  demoSeed: str(raw.VITE_LOCAL_DEMO_SEED).toLowerCase() !== 'false',
  fcmVapidKey: str(raw.VITE_FIREBASE_VAPID_KEY),
};

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

/**
 * Environment diagnostics.
 *
 * Reports *which* variables a deployment is missing, never their values, so a
 * sign-in or upload problem caused by configuration can be identified from the
 * running site (Settings → Diagnostics, and the public /status page) instead of
 * guessing. `VITE_*` values are public by construction; nothing secret is read
 * here.
 */
export interface EnvCheck {
  key: string;
  present: boolean;
  required: boolean;
  purpose: string;
}

export const environmentChecks = (): EnvCheck[] => {
  const items: EnvCheck[] = [
    { key: 'VITE_FIREBASE_API_KEY', present: Boolean(firebaseConfig.apiKey), required: false, purpose: 'Firebase Auth + Firestore (the production data path)' },
    { key: 'VITE_FIREBASE_AUTH_DOMAIN', present: Boolean(firebaseConfig.authDomain), required: false, purpose: 'Firebase Auth domain (must list this site in Authorised domains)' },
    { key: 'VITE_FIREBASE_PROJECT_ID', present: Boolean(firebaseConfig.projectId), required: false, purpose: 'Firestore project' },
    { key: 'VITE_FIREBASE_APP_ID', present: Boolean(firebaseConfig.appId), required: false, purpose: 'Firebase web app id' },
    { key: 'VITE_FIREBASE_STORAGE_BUCKET', present: Boolean(firebaseConfig.storageBucket), required: false, purpose: 'Storage bucket reference' },
    { key: 'VITE_FIREBASE_MESSAGING_SENDER_ID', present: Boolean(firebaseConfig.messagingSenderId), required: false, purpose: 'Browser push' },
    { key: 'VITE_FIREBASE_VAPID_KEY', present: Boolean(app.fcmVapidKey), required: false, purpose: 'Web Push certificate for background notifications' },
    { key: 'VITE_CLOUDINARY_CLOUD_NAME', present: cloudinary.enabled, required: false, purpose: 'Public image delivery' },
    { key: 'VITE_CLOUDINARY_UPLOAD_PRESET', present: Boolean(cloudinary.unsignedPreset), required: false, purpose: 'Browser uploads to public folders' },
  ];
  if (forcedProvider === 'firebase') {
    for (const item of items.slice(0, 4)) items[items.indexOf(item)] = { ...item, required: true };
  }
  return items;
};

export const firebase = firebaseConfig;
export const cloudinaryConfig = cloudinary;

/** Console boot summary — identifiers only, never config values. */
export function logRuntimeSummary(logger: Console = console): void {
  if (app.isProduction && !integrations.misconfigured) return;
  logger.info(
    `[mamacare] provider=${dataProvider} firebase=${integrations.firebase.configured} cloudinary=${integrations.cloudinary.configured} push=${integrations.push.configured}`,
  );
}

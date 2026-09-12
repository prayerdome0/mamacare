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

export const firebase = firebaseConfig;
export const cloudinaryConfig = cloudinary;

/** Console boot summary — identifiers only, never config values. */
export function logRuntimeSummary(logger: Console = console): void {
  if (app.isProduction && !integrations.misconfigured) return;
  logger.info(
    `[mamacare] provider=${dataProvider} firebase=${integrations.firebase.configured} cloudinary=${integrations.cloudinary.configured} push=${integrations.push.configured}`,
  );
}

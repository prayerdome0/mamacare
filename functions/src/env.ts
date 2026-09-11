import 'dotenv/config';

/**
 * Server configuration.
 *
 * Nothing here is safe for a browser: `CLOUDINARY_API_SECRET`, the SMS keys and the
 * Admin SDK credentials stay in this process. Values are never logged and never
 * echoed in an error body — `redactedSummary()` is the only thing that reaches a
 * log line.
 */
const str = (key: string, fallback = ''): string => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback;
};
const num = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (typeof raw !== 'string' || raw.trim() === '') return fallback;
  const parsed = Number(raw);
  // An unset variable is `''`, which `Number()` turns into 0 — that would silently
  // disable ports and limits, so only a real number is accepted.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};
const list = (key: string): string[] =>
  str(key)
    .split(',')
    .map((row) => row.trim().toLowerCase())
    .filter(Boolean);

export const env = {
  port: num('PORT', 8787),
  nodeEnv: str('NODE_ENV', 'development'),
  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  },

  /** Firebase project the ID tokens belong to. Optional when running under Functions. */
  firebaseProjectId: str('FIREBASE_PROJECT_ID') || str('GOOGLE_CLOUD_PROJECT'),
  /** Path to a service-account file. Never commit one; never accept its contents in a request. */
  googleApplicationCredentials: str('GOOGLE_APPLICATION_CREDENTIALS'),

  cloudinary: {
    cloudName: str('CLOUDINARY_CLOUD_NAME'),
    apiKey: str('CLOUDINARY_API_KEY'),
    apiSecret: str('CLOUDINARY_API_SECRET'),
    /** Must match VITE_CLOUDINARY_UPLOAD_PRESET in the web app. */
    unsignedPreset: str('CLOUDINARY_UPLOAD_PRESET'),
    rootFolder: str('CLOUDINARY_ROOT_FOLDER', 'mamacare'),
    get apiBase(): string {
      return `https://api.cloudinary.com/v1_1/${this.cloudName || 'unknown'}`;
    },
    get configured(): boolean {
      return Boolean(this.cloudName && this.apiKey && this.apiSecret);
    },
  },

  /** Folders the signed path may target. Mirrors the client allow-list. */
  signedUploadFolders: ['documents', 'reports', 'profiles', 'public', 'education', 'branding', 'facilities'],
  maxUploadBytes: num('MAX_UPLOAD_BYTES', 20 * 1024 * 1024),

  /** Emails allowed to promote themselves to ADMIN exactly once, on a fresh deployment. */
  bootstrapAdminEmails: list('BOOTSTRAP_ADMIN_EMAILS'),
  /** Shared secret for the cron/scheduler calls. */
  schedulerToken: str('SCHEDULER_INTERNAL_TOKEN'),
  allowedOrigins: list('ALLOWED_ORIGINS'),

  sms: {
    provider: str('SMS_PROVIDER', 'none'),
    apiKey: str('SMS_API_KEY'),
    authToken: str('SMS_AUTH_TOKEN'),
    accountSid: str('TWILIO_ACCOUNT_SID'),
    from: str('SMS_FROM_NUMBER'),
    endpoint: str('SMS_ENDPOINT_URL'),
    get configured(): boolean {
      if (this.provider === 'twilio') return Boolean(this.accountSid && this.authToken && this.from);
      if (this.provider === 'http') return Boolean(this.endpoint && this.apiKey);
      return false;
    },
  },

  email: {
    from: str('SUPPORT_FROM_ADDRESS', 'no-reply@mamacare.health'),
    /** Where contact-form messages are forwarded. Empty → stored only. */
    to: str('SUPPORT_INBOX_EMAIL'),
    relayEndpoint: str('EMAIL_RELAY_ENDPOINT'),
    relayApiKey: str('EMAIL_RELAY_API_KEY'),
    get configured(): boolean {
      return Boolean(this.relayEndpoint && this.relayApiKey && this.to);
    },
  },

  rateLimit: {
    perMinutePerActor: num('RATE_LIMIT_PER_MINUTE', 60),
    perMinutePerIp: num('RATE_LIMIT_PER_IP', 120),
    contactPerHour: num('RATE_LIMIT_CONTACT_PER_HOUR', 5),
  },
};

export type Env = typeof env;

/** Redacted view for the boot log and `/health`. */
export function redactedSummary(): Record<string, unknown> {
  return {
    nodeEnv: env.nodeEnv,
    firebaseProjectId: env.firebaseProjectId || null,
    serviceAccountFileConfigured: Boolean(env.googleApplicationCredentials),
    cloudinary: {
      cloudName: env.cloudinary.cloudName ? mask(env.cloudinary.cloudName) : null,
      apiKeyConfigured: Boolean(env.cloudinary.apiKey),
      apiSecretConfigured: Boolean(env.cloudinary.apiSecret),
      unsignedPresetConfigured: Boolean(env.cloudinary.unsignedPreset),
      rootFolder: env.cloudinary.rootFolder,
    },
    sms: { provider: env.sms.provider, configured: env.sms.configured },
    email: { relayConfigured: env.email.configured, inboxConfigured: Boolean(env.email.to) },
    bootstrapAdmins: env.bootstrapAdminEmails.length,
    schedulerTokenConfigured: Boolean(env.schedulerToken),
  };
}

function mask(value: string): string {
  if (value.length <= 8) return `${value.slice(0, 2)}••••`;
  return `${value.slice(0, 4)}••••${value.slice(-3)}`;
}

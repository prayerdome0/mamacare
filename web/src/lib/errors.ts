/**
 * Error handling: one internal error type, one user-facing message mapper.
 *
 * Raw provider errors (Firebase, Cloudinary, network) are never shown to users
 * and never logged with their message payloads — they are mapped to short,
 * actionable sentences and, for retryable classes, wrapped in retry guidance.
 */

export type ErrorCode =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION'
  | 'RATE_LIMIT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_FILE'
  | 'UPLOAD_FAILED'
  | 'STORAGE_UNAVAILABLE'
  | 'CONFIGURATION'
  | 'UNKNOWN';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  readonly fieldErrors?: Record<string, string>;

  constructor(message: string, code: ErrorCode = 'UNKNOWN', options?: { retryable?: boolean; fieldErrors?: Record<string, string> }) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options?.retryable ?? ['NETWORK', 'TIMEOUT', 'UPLOAD_FAILED'].includes(code);
    this.fieldErrors = options?.fieldErrors;
  }
}

export const isAppError = (e: unknown): e is AppError => e instanceof AppError;

/** Firebase auth error codes → user language. Codes only, never payloads. */
const AUTH_MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/missing-email': 'Enter your email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/invalid-credential': 'Invalid email or password.',
  'auth/invalid-login-credentials': 'Invalid email or password.',
  'auth/wrong-password': 'Invalid email or password.',
  'auth/user-not-found': 'This account does not exist. Check the address, or create an account.',
  'auth/email-already-in-use': 'This email is already registered. Sign in instead, or reset the password.',
  'auth/weak-password': 'Your password does not meet the minimum security requirements.',
  'auth/user-disabled': 'This account has been deactivated. Contact your administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Unable to connect to the server. Check your connection and try again.',
  'auth/requires-recent-login': 'For your security, please sign in again before changing this.',
  'auth/invalid-action-code': 'This link is invalid or has already been used. Request a new one.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/missing-action-code': 'This reset link is incomplete. Request a new one from the sign-in screen.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/popup-blocked': 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.',
  'auth/cancelled-popup-request': 'The sign-in window was closed before finishing.',
  'auth/operation-not-allowed': 'Email and password sign-in is not enabled for this project yet. Ask the platform administrator to enable it in Firebase Authentication.',
  'auth/configuration-not-found': 'Firebase Authentication is not configured for this project yet. The administrator must enable the Email/Password sign-in method.',
  'auth/unauthorized-domain': 'This website address is not authorised for sign-in. Ask the administrator to add this domain to Firebase Authentication → Settings → Authorised domains.',
  'auth/invalid-api-key': 'The Firebase configuration on this deployment is not valid. Ask the administrator to check the VITE_FIREBASE_* values.',
  'auth/api-key-not-valid': 'The Firebase configuration on this deployment is not valid. Ask the administrator to check the VITE_FIREBASE_* values.',
  'auth/internal-error': 'The sign-in service returned an unexpected response. Please try again; if it continues, the project configuration needs checking.',
  'auth/quota-exceeded': 'The sign-in service is busy right now. Please try again in a few minutes.',
  'auth/operation-not-supported-in-this-environment': 'This browser cannot complete the sign-in. Use a normal (not private) window, or a different browser.',
  'auth/persistence-failed': 'Secure storage is unavailable in this browser. Try a normal (not private) window.',
  'auth/web-storage-unsupported': 'This browser blocks the storage sign-in needs. Enable cookies for this site, or use a normal window.',
  'auth/argument-error': 'Those sign-in details are not in the expected format. Check your email address and password.',
  'auth/account-exists-with-different-credential': 'An account already exists with this email using a different sign-in method.',
  'auth/multi-factor-auth-required': 'This account needs a second verification step. Contact your administrator.',
  'auth/timeout': 'The sign-in service did not respond in time. Please try again.',
};

const FIRESTORE_HINTS: Record<string, string> = {
  'permission-denied': 'You do not have permission to perform this action.',
  unavailable: 'The service is temporarily unreachable. Your connection may have dropped.',
  'not-found': 'That record no longer exists.',
  'already-exists': 'That record already exists.',
  'failed-precondition': 'This view needs a database index that has not been deployed yet.',
  resource_exhausted: 'Too many requests. Please try again shortly.',
  unauthenticated: 'Your session has expired. Please sign in again.',
  cancelled: 'The operation was cancelled before it finished.',
  'data-loss': 'A data problem was detected. The change was not applied.',
};

/**
 * Developer-facing log for a failed provider call.
 *
 * The user sees a short sentence; the console gets the operation, the provider
 * error code and the message, which is what makes a real deployment problem
 * diagnosable. No credential, token or patient value is ever logged.
 */
export function logProviderError(scope: string, error: unknown): void {
  const err = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  const code = typeof err?.code === 'string' ? err.code : undefined;
  const name = typeof err?.name === 'string' ? err.name : undefined;
  const message = typeof err?.message === 'string' ? err.message : String(error);
  console.error(`[mamacare] ${scope} failed`, { code, name, message });
}


function codeFromUnknown(code: unknown): ErrorCode | null {
  if (typeof code !== 'string') return null;
  if (code.startsWith('auth/')) return code === 'auth/too-many-requests' ? 'RATE_LIMIT' : 'UNAUTHENTICATED';
  if (code.startsWith('functions/')) return 'FORBIDDEN';
  if (['permission-denied', 'unauthenticated'].includes(code)) return 'FORBIDDEN';
  if (code === 'not-found') return 'NOT_FOUND';
  if (code === 'already-exists') return 'CONFLICT';
  if (code === 'unavailable' || code === 'internal' || code === 'deadline-exceeded') return 'NETWORK';
  return null;
}

export function toAppError(error: unknown, fallback = 'Something went wrong. Please try again.'): AppError {
  if (error instanceof AppError) return error;

  const code =
    (error as { code?: unknown } | null)?.code ??
    ((error as { customData?: { code?: string } } | null)?.customData?.code ?? undefined);
  const rawMessage = (error as { message?: string } | null)?.message ?? '';
  const key = typeof rawMessage === 'string' ? rawMessage.split(':')[0]?.trim() : '';
  const authMapped = typeof code === 'string' ? AUTH_MESSAGES[code] : undefined;

  if (authMapped) return new AppError(authMapped, (code as string) === 'auth/too-many-requests' ? 'RATE_LIMIT' : 'UNAUTHENTICATED');

  const mappedCode = codeFromUnknown(code);
  const providerHint = typeof code === 'string' ? FIRESTORE_HINTS[code] : undefined;
  if (providerHint && !mappedCode) {
    // A recognisable provider code we do not otherwise classify (for example
    // `failed-precondition`, which usually means an index has not been deployed)
    // still deserves its specific explanation rather than the generic fallback.
    return new AppError(providerHint, 'UNKNOWN');
  }
  if (mappedCode) {
    const hint = providerHint;
    const retryable = mappedCode === 'NETWORK';
    return new AppError(
      hint ??
        (mappedCode === 'FORBIDDEN'
          ? 'You do not have permission to perform this action.'
          : mappedCode === 'NOT_FOUND'
            ? 'That record could not be found.'
            : mappedCode === 'CONFLICT'
              ? 'This record was changed by someone else. Reload and try again.'
              : 'The service is temporarily unreachable. Please try again.'),
      mappedCode,
      { retryable },
    );
  }

  if (rawMessage.includes('Failed to fetch') || rawMessage.includes('NetworkError')) {
    return new AppError('No internet connection. Check your network and try again.', 'NETWORK', { retryable: true });
  }
  if (key === 'cloudinary' || rawMessage.includes('upload')) {
    return new AppError('Media upload failed. Please try again.', 'UPLOAD_FAILED', { retryable: true });
  }
  if (rawMessage.includes('auth state') || rawMessage.includes('IdToken')) {
    return new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
  }

  // Unknown error text is intentionally *not* echoed to the user (it can carry
  // provider internals); callers log `error.name` only.
  return new AppError(fallback, 'UNKNOWN');
}

/** Short sentence for a toast/inline banner. */
export const userMessage = (error: unknown, fallback?: string): string => toAppError(error, fallback).message;

/** Banner copy with retry affordance. */
export function errorDisplay(error: unknown, fallback = 'Something went wrong.'): { message: string; retryable: boolean } {
  const err = toAppError(error, fallback);
  return { message: err.message, retryable: err.retryable };
}

export const AUTH_EXPIRED_MESSAGE = 'Your session has expired. Please sign in again.';

/** Structured, secret-free view of any error — used by the diagnostics screen and logs. */
export function describeError(error: unknown): { code: string | null; name: string; message: string } {
  const err = error as { code?: unknown; name?: unknown; message?: unknown } | null;
  return {
    code: typeof err?.code === 'string' ? err.code : null,
    name: typeof err?.name === 'string' ? err.name : 'Error',
    message: typeof err?.message === 'string' ? err.message : String(error),
  };
}

/**
 * Retries only transient failures, with jittered backoff. Validation/permission
 * errors surface immediately — silently retrying those hides real problems.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; onRetry?: (attempt: number) => void } = {},
): Promise<T> {
  const attempts = options.attempts ?? 3;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const appError = toAppError(error);
      const transient = appError.retryable || appError.code === 'NETWORK' || appError.code === 'TIMEOUT';
      if (!transient || attempt === attempts) throw appError;
      options.onRetry?.(attempt);
      const delay = (options.baseDelayMs ?? 400) * 2 ** (attempt - 1) + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw toAppError(lastError);
}

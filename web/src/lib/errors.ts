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
  'auth/invalid-credential': 'Email or password is incorrect.',
  'auth/wrong-password': 'Email or password is incorrect.',
  'auth/user-not-found': 'No account exists with that email address.',
  'auth/email-already-in-use': 'That email address already has an account. Sign in instead.',
  'auth/weak-password': 'Your password does not meet the minimum security requirements.',
  'auth/user-disabled': 'This account has been deactivated. Contact your administrator.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Cannot reach the authentication service. Check your connection.',
  'auth/requires-recent-login': 'For your security, please sign in again before changing this.',
  'auth/invalid-action-code': 'This link is invalid or has already been used. Request a new one.',
  'auth/expired-action-code': 'This link has expired. Request a new one.',
  'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled for this project.',
  'auth/persistence-failed': 'Secure storage is unavailable in this browser. Try a normal (not private) window.',
};

const FIRESTORE_HINTS: Record<string, string> = {
  'permission-denied': 'You do not have permission to perform this action.',
  unavailable: 'The service is temporarily unreachable. Your connection may have dropped.',
  'not-found': 'That record no longer exists.',
  'already-exists': 'That record already exists.',
  'failed-precondition': 'This view needs a database index that has not been deployed yet.',
  resource_exhausted: 'Too many requests. Please try again shortly.',
};

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
  if (mappedCode) {
    const hint = typeof code === 'string' ? FIRESTORE_HINTS[code] : undefined;
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

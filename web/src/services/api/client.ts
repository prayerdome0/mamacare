/**
 * Thin, typed client for the MAMA CARE API service.
 *
 * Only relative paths (`/api/...`) are used so the browser never needs to know
 * where the backend lives: the dev server proxies it, hosting rewrites it, and
 * the Firebase deploy serves it from the same origin. Every request carries the
 * Firebase ID token; the server verifies it with the Admin SDK and re-checks the
 * caller's role before doing anything privileged.
 */

import { AppError, toAppError } from '@/lib/errors';
import { app, integrations } from '@/config/env';

export type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Sends the caller's ID token; required for every authenticated route. */
  authenticated?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Raw FormData / Blob bodies are passed through untouched. */
  raw?: boolean;
  idempotencyKey?: string;
}

export class ApiClient {
  private tokenProvider: (() => Promise<string | null>) | null = null;
  private unavailableNoticeShown = false;

  setTokenProvider(provider: () => Promise<string | null>): void {
    this.tokenProvider = provider;
  }

  get baseUrl(): string {
    return app.apiBaseUrl;
  }

  private async buildInit(options: RequestOptions): Promise<{ init: RequestInit; controller: AbortController }> {
    const headers: Record<string, string> = { accept: 'application/json' };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);
    controller.signal.addEventListener('abort', () => clearTimeout(timeout), { once: true });

    if (options.authenticated !== false && this.tokenProvider) {
      const token = await this.tokenProvider();
      if (token) headers.authorization = `Bearer ${token}`;
    } else if (options.authenticated !== false && !this.tokenProvider) {
      throw new AppError('Please sign in to continue.', 'UNAUTHENTICATED');
    }

    let body: BodyInit | undefined;
    if (options.body !== undefined) {
      if (options.raw) {
        body = options.body as BodyInit;
      } else {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(options.body);
      }
    }
    if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;

    return {
      init: {
        method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
        headers,
        body,
        credentials: 'same-origin',
        signal: options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal,
      },
      controller,
    };
  }

  async request<T = Record<string, unknown>>(path: string, options: RequestOptions = {}): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    let response: Response;
    try {
      const { init } = await this.buildInit(options);
      response = await fetch(url, init);
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') {
        throw new AppError('The request took too long. Please try again.', 'TIMEOUT', { retryable: true });
      }
      // The API is optional for the core app (media falls back to device
      // storage), so an unreachable service is reported as degraded, not fatal.
      throw new AppError('The secure file service is unreachable. Please try again.', 'NETWORK', { retryable: true });
    }

    const payload = await this.safeJson(response);

    if (!response.ok) {
      throw this.mapError(response.status, payload);
    }
    return payload as T;
  }

  private async safeJson(response: Response): Promise<Json | null> {
    const text = await response.text().catch(() => '');
    if (!text) return null;
    try {
      return JSON.parse(text) as Json;
    } catch {
      // A proxy that returned HTML (service down, auth wall) must not be shown
      // to users verbatim.
      return { message: null, nonJson: true };
    }
  }

  private mapError(status: number, payload: Json | null): AppError {
    const body = (payload ?? {}) as { message?: string; code?: string; fields?: Record<string, string> };
    if (status === 401) {
      return new AppError('Your session has expired. Please sign in again.', 'SESSION_EXPIRED');
    }
    if (status === 403) {
      return new AppError(body.message ?? 'You do not have permission to perform this action.', 'FORBIDDEN');
    }
    if (status === 404) return new AppError(body.message ?? 'That resource was not found.', 'NOT_FOUND');
    if (status === 409) return new AppError(body.message ?? 'That record already exists.', 'CONFLICT');
    if (status === 413) return new AppError('The file is larger than the allowed limit.', 'PAYLOAD_TOO_LARGE');
    if (status === 415) return new AppError(body.message ?? 'That file type is not supported.', 'UNSUPPORTED_FILE');
    if (status === 422 || status === 400) {
      return new AppError(body.message ?? 'Some entered values are invalid.', 'VALIDATION', {
        fieldErrors: body.fields,
      });
    }
    if (status === 429) {
      return new AppError('Too many requests in a row. Please wait a moment and try again.', 'RATE_LIMIT', {
        retryable: true,
      });
    }
    if (status === 503) {
      return new AppError(
        body.message ?? 'This operation needs a server-side credential that is not configured for this deployment.',
        'CONFIGURATION',
      );
    }
    if (status >= 500) {
      return new AppError(body.message ?? 'The service is temporarily unavailable. Please try again.', 'NETWORK', {
        retryable: true,
      });
    }
    return new AppError(body.message ?? 'The request failed. Please try again.', 'UNKNOWN');
  }

  /** True when the API is reachable; used to gate privileged UI actions. */
  async probe(): Promise<{ available: boolean; degraded?: string[] }> {
    try {
      const result = await this.request<{ status?: string; degraded?: string[] }>('/health', {
        authenticated: false,
        timeoutMs: 6000,
      });
      return { available: true, degraded: Array.isArray(result.degraded) ? result.degraded : [] };
    } catch {
      if (!this.unavailableNoticeShown) this.unavailableNoticeShown = true;
      return { available: false };
    }
  }
}

export const api = new ApiClient();

export interface SignedUploadParams {
  publicId: string;
  signature: string;
  apiKey: string;
  cloudName: string;
  timestamp: number;
  folder: string;
  resourceType: 'image' | 'raw';
  endpoint: string;
  options?: Record<string, unknown>;
}

/** Asks the API to sign a privileged upload (private folders, signed URLs). */
export const requestSignedUpload = (input: {
  folder: string;
  publicId: string;
  resourceType: 'image' | 'raw';
  accessMode?: 'public' | 'authenticated' | 'private';
  fileSizeBytes?: number;
  mimeType?: string;
  metadata?: Record<string, string>;
}): Promise<SignedUploadParams> => api.request<SignedUploadParams>('/media/sign', { method: 'POST', body: input });

export const requestSignedUrl = (input: { publicId: string; resourceType: 'image' | 'raw'; expiresIn?: number }): Promise<{
  url: string;
  expiresAt: string;
}> => api.request('/media/sign-url', { method: 'POST', body: input });

export const requestAssetDeletion = (input: { publicId: string; resourceType: 'image' | 'raw'; reason?: string }): Promise<{
  deleted: boolean;
}> => api.request('/media/delete', { method: 'POST', body: input });

export const setPrivilegedRole = (input: { uid: string; role: string; facilityId?: string | null; reason: string }): Promise<{
  ok: boolean;
  claimsUpdated: boolean;
}> => api.request('/admin/users/role', { method: 'POST', body: input });

export const revokeUserSessions = (input: { uid: string; reason: string }): Promise<{ ok: boolean }> =>
  api.request('/admin/users/revoke', { method: 'POST', body: input });

export const createManagedAccount = (input: {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  facilityId: string;
  temporaryPassword: string;
  mustChangePassword?: boolean;
}): Promise<{ uid: string }> => api.request('/admin/users/create', { method: 'POST', body: input });

/**
 * First-run administrator. Enabled only when the *server* deployment declares a
 * bootstrap allow-list; the caller's verified email must be on it. The frontend
 * cannot influence this beyond presenting the action.
 */
export const bootstrapAdministrator = (): Promise<{ ok: boolean; email: string }> =>
  api.request('/admin/bootstrap', { method: 'POST', body: {} });

export const isBootstrapAllowed = (): boolean => integrations.provider === 'firebase';

export const queueSmsReminder = (input: { appointmentId: string; reason?: string }): Promise<{ queued: boolean; reason?: string }> =>
  api.request('/notifications/sms', { method: 'POST', body: input });

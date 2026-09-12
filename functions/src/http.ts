import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';

/**
 * HTTP plumbing: one error shape for every failure, no stack traces or raw
 * provider messages in responses, and a zod body parser that answers with field
 * errors the interface can display next to the input.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'VALIDATION',
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const unauthorized = (message = 'Sign in again to continue.'): ApiError => new ApiError(message, 401, 'SESSION_EXPIRED');
export const forbidden = (message = 'Your account is not allowed to perform this action.'): ApiError =>
  new ApiError(message, 403, 'FORBIDDEN');
export const notFound = (message = 'That resource was not found.'): ApiError => new ApiError(message, 404, 'NOT_FOUND');
export const conflict = (message: string): ApiError => new ApiError(message, 409, 'CONFLICT');
export const tooLarge = (message: string): ApiError => new ApiError(message, 413, 'PAYLOAD_TOO_LARGE');
export const unsupported = (message: string): ApiError => new ApiError(message, 415, 'UNSUPPORTED_FILE');
export const rateLimited = (message: string): ApiError => new ApiError(message, 429, 'RATE_LIMIT');
export const notConfigured = (what: string, vars: string[]): ApiError =>
  new ApiError(
    `${what} is not configured for this deployment. Set ${vars.join(' and ')} on the API service — never in the browser — and restart it.`,
    503,
    'CONFIGURATION',
  );
export const upstream = (message: string): ApiError => new ApiError(message, 502, 'UPSTREAM');

/** Validates the JSON body and hands the parsed value to the handler. */
export function withBody<T extends z.ZodTypeAny>(schema: T, handler: (input: z.infer<T>, req: Request) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    void (async () => {
      try {
        const parsed = schema.safeParse(req.body ?? {});
        if (!parsed.success) {
          const fields: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path.join('.') || 'form';
            if (!fields[key]) fields[key] = issue.message;
          }
          throw new ApiError('Some entered values are invalid.', 422, 'VALIDATION', fields);
        }
        const result = await handler(parsed.data, req);
        res.json(result ?? { ok: true });
      } catch (error) {
        next(error);
      }
    })();
  };
}

/** Fixed-window limiter. Per-process by design: a deployment adds Redis if it scales out. */
export function rateLimit(options: { limit: number; windowMs: number; message?: string }): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const limit = Math.max(1, Math.floor(options.limit) || 1);
  return (req, res, next) => {
    const key = `${req.method}:${clientIp(req)}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + options.windowMs });
      if (hits.size > 5000) {
        for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      }
      next();
      return;
    }
    entry.count += 1;
    if (entry.count > limit) {
      res.setHeader('retry-after', Math.ceil((entry.resetAt - now) / 1000));
      next(rateLimited(options.message ?? 'Too many requests in a row. Please wait a moment and try again.'));
      return;
    }
    next();
  };
}

export const clientIp = (req: Request): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0]?.trim() ?? 'unknown';
  return req.ip ?? 'unknown';
};

/** Security headers, same-origin CORS and a hard body limit. */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('x-frame-options', 'DENY');
  res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('permissions-policy', 'geolocation=(), microphone=(), camera=()');
  if (process.env.NODE_ENV === 'production') res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');

  const origin = req.headers.origin;
  const allowed = process.env.ALLOWED_ORIGINS?.split(',').map((row) => row.trim()).filter(Boolean) ?? [];
  if (origin && (allowed.length === 0 ? isSameHost(origin, req) : allowed.includes(origin))) {
    res.setHeader('access-control-allow-origin', origin);
    res.setHeader('vary', 'origin');
  }
  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('access-control-allow-headers', 'content-type,authorization,x-idempotency-key,x-scheduler-token');
    res.setHeader('access-control-max-age', '600');
    res.sendStatus(204);
    return;
  }
  next();
}

function isSameHost(origin: string, req: Request): boolean {
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

export function sendError(error: unknown, req: Request, res: Response, next: NextFunction): void {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof ApiError) {
    res.status(error.status).json({
      code: error.code,
      message: error.message,
      ...(error.fields ? { fields: error.fields } : {}),
    });
    return;
  }
  const asHttp = error as { type?: string; status?: number; statusCode?: number };
  if (asHttp?.type === 'entity.too.large') {
    res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'The request body is larger than the allowed limit.' });
    return;
  }
  if (error instanceof SyntaxError) {
    res.status(400).json({ code: 'VALIDATION', message: 'The request body was not valid JSON.' });
    return;
  }
  // Anything else is unexpected: log it here (server-side only) and answer with a
  // safe, generic message. Raw provider errors can contain keys or patient data.
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error(`[api] unhandled error on ${req.method} ${req.path} → ${detail}`);
  res.status(500).json({ code: 'INTERNAL', message: 'The service could not complete that request. Please try again.' });
}

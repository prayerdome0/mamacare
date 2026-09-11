import type { Request, RequestHandler, Response } from 'express';
import { bearer, requireRole, verifyIdToken, type ActorClaims } from '../firebase.js';
import { unauthorized } from '../http.js';

/**
 * Authentication middleware for the API.
 *
 * The ID token is verified with the Admin SDK and the role is read from custom
 * claims — never from the request body. `requireRoles()` is applied per route, so
 * an unauthenticated or under-privileged caller gets a clear 401/403 rather than a
 * partially executed operation.
 */
export interface AuthedRequest extends Request {
  claims?: ActorClaims;
}

export const requireAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const raw = bearer(req);
      if (!raw) throw unauthorized();
      (req as AuthedRequest).claims = await verifyIdToken(raw);
      next();
    } catch (error) {
      next(error);
    }
  })();
};

/** Attaches claims when a token is present but does not require one. */
export const optionalAuth: RequestHandler = (req, res, next) => {
  void (async () => {
    try {
      const header = req.headers.authorization;
      if (typeof header === 'string' && header.toLowerCase().startsWith('bearer ') && header.slice(7).trim().length > 0) {
        (req as AuthedRequest).claims = await verifyIdToken(header.slice(7).trim());
      }
      next();
    } catch {
      // A bad token on an optional route is simply "anonymous"; the rate limiter
      // still keys on the IP.
      next();
    }
  })();
};

export const requireRoles =
  (roles: string[], message?: string): RequestHandler =>
  (req: Request, _res: Response, next) => {
    const claims = (req as AuthedRequest).claims;
    if (!claims) {
      next(unauthorized());
      return;
    }
    try {
      requireRole(claims, roles, message);
      next();
    } catch (error) {
      next(error);
    }
  };

export const claimsOf = (req: Request): ActorClaims => {
  const claims = (req as AuthedRequest).claims;
  if (!claims) throw unauthorized();
  return claims;
};

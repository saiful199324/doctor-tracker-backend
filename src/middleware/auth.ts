import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { UserRole } from '../models/User';
import { ApiError } from '../utils/ApiError';

export const AUTH_COOKIE = 'dt_token';

interface TokenPayload {
  sub: string;
  role: UserRole;
}

function extractToken(header?: string, cookie?: string): string | undefined {
  if (cookie) return cookie;
  if (header?.startsWith('Bearer ')) return header.slice(7);
  return undefined;
}

/** Verifies the JWT from the httpOnly cookie (or a Bearer header for API clients). */
export const authenticate: RequestHandler = (req, _res, next) => {
  const token = extractToken(req.headers.authorization, req.cookies?.[AUTH_COOKIE]);
  if (!token) return next(ApiError.unauthorized());

  try {
    // Pin the algorithm so a token signed any other way (e.g. "none") is rejected.
    const payload = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized('Session expired, please sign in again'));
  }
};

/** Role-based authorisation. Must run after `authenticate`. */
export const authorize =
  (...roles: UserRole[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
    next();
  };

export function signToken(userId: string, role: UserRole): string {
  return jwt.sign({ role } satisfies Omit<TokenPayload, 'sub'>, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: userId,
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

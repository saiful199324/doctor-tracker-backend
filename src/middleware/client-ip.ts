import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { env } from '../config/env';

const PROXY_SECRET_HEADER = 'x-proxy-secret';
const FORWARDED_CLIENT_IP_HEADER = 'x-client-ip';

function secretMatches(provided: string): boolean {
  const expected = Buffer.from(env.PROXY_SECRET ?? '');
  const actual = Buffer.from(provided);
  return expected.length > 0 && actual.length === expected.length && timingSafeEqual(actual, expected);
}

function firstValue(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw?.split(',')[0].trim() || undefined;
}

/**
 * Resolves the visitor's real IP for `req.ip` (used by the login rate limiter and request logs).
 *
 * 1. The frontend's server-side proxy forwards the browser's IP in `x-client-ip`. It is only
 *    honoured with the shared `x-proxy-secret`, so a visitor calling the API directly can't fake it.
 * 2. Otherwise a trusted edge header (`CLIENT_IP_HEADER`, e.g. Cloudflare's `cf-connecting-ip`
 *    on Render) identifies direct callers.
 * 3. Otherwise Express's own `trust proxy` resolution applies.
 */
export const resolveClientIp: RequestHandler = (req, _res, next) => {
  let ip: string | undefined;

  const secret = firstValue(req.headers[PROXY_SECRET_HEADER]);
  if (secret && secretMatches(secret)) {
    ip = firstValue(req.headers[FORWARDED_CLIENT_IP_HEADER]);
  }
  if (!ip && env.CLIENT_IP_HEADER) {
    ip = firstValue(req.headers[env.CLIENT_IP_HEADER]);
  }
  if (ip) {
    Object.defineProperty(req, 'ip', { value: ip, configurable: true });
  }
  next();
};

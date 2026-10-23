import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  CLIENT_ORIGIN: z.string().default('http://localhost:3000'),
  // Which proxies to trust, so `req.ip` (used by the login rate limiter) is the visitor's real IP.
  // A hop count ("1": Next.js locally / ngrok) or Express subnet names
  // ("loopback, linklocal, uniquelocal": skip every private-network hop, e.g. on Render).
  TRUST_PROXY: z
    .string()
    .trim()
    .default('1')
    .transform((v) => (/^\d+$/.test(v) ? Number(v) : v)),
  // Header set by a trusted edge proxy that always overwrites it, e.g. "cf-connecting-ip" when the
  // host sits behind Cloudflare (Render). Only set this where clients cannot reach the API directly.
  CLIENT_IP_HEADER: z.string().trim().toLowerCase().optional(),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  clientOrigins: parsed.data.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
};

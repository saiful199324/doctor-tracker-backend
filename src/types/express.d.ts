import type { UserRole } from '../models/User';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      role: UserRole;
    }

    interface Request {
      user?: AuthUser;
      /** Parsed and coerced output of the route's zod schemas. */
      validated: {
        body?: unknown;
        query?: unknown;
        params?: unknown;
      };
    }
  }
}

export {};

import type { RequestHandler } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '../utils/ApiError';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and coerces request input. Unknown keys are stripped, so handlers only ever
 * see whitelisted fields (which also blocks operator injection such as `{ "$gt": "" }`).
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req, _res, next) => {
    req.validated = {};
    const errors: Record<string, string[]> = {};

    for (const part of ['params', 'query', 'body'] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (result.success) {
        req.validated[part] = result.data;
      } else {
        for (const issue of result.error.issues) {
          const key = issue.path.join('.') || part;
          (errors[key] ??= []).push(issue.message);
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return next(ApiError.badRequest('Validation failed', errors));
    }
    next();
  };

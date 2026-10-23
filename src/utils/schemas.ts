import { Types } from 'mongoose';
import { z } from 'zod';

export const objectId = z
  .string()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

export const idParams = z.object({ id: objectId });

/** Query-string date (YYYY-MM-DD or full ISO). Empty strings are treated as "not set". */
export const optionalDate = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.coerce.date({ invalid_type_error: 'Invalid date' }).optional(),
);

export const optionalString = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z.string().trim().max(100).optional(),
);

export const paginationQuery = z.object({
  page: z.coerce.number({ invalid_type_error: 'Page must be a number' }).int().min(1, 'Page must be 1 or more').default(1),
  limit: z.coerce.number({ invalid_type_error: 'Limit must be a number' }).int().min(1).max(100, 'Limit cannot exceed 100').default(10),
  search: optionalString,
  from: optionalDate,
  to: optionalDate,
});

export const phone = z
  .string()
  .trim()
  .regex(/^\+?[\d\s\-()]{7,20}$/, 'Enter a valid phone number');

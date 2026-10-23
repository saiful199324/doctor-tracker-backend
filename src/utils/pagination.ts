import type { Model } from 'mongoose';

/**
 * Total for the pagination footer. With no filter, `estimatedDocumentCount` reads the collection
 * metadata (O(1)); `countDocuments({})` would scan every document just to count them.
 */
export function countMatching<T>(model: Model<T>, filter: Record<string, unknown>): Promise<number> {
  return Object.keys(filter).length === 0 ? model.estimatedDocumentCount() : model.countDocuments(filter);
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function buildPageMeta(page: number, limit: number, total: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    page,
    limit,
    total,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
}

/** Builds a `{ field: { $gte, $lte } }` filter from optional ISO date bounds (inclusive, whole days). */
export function dateRangeFilter(field: string, from?: Date, to?: Date): Record<string, unknown> {
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.$gte = from;
  if (to) {
    const end = new Date(to);
    end.setUTCHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return { [field]: range };
}

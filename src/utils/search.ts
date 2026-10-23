/**
 * Search strategy
 * ---------------
 * Every searchable document stores a `keywords` array: the lower-cased words of its
 * searchable fields (plus a digits-only phone). A multikey index on `keywords` lets a
 * case-sensitive, left-anchored regex (`^smi`) use an index range scan, so "smi" finds
 * "John Smith" without a collection scan. Each word in the query must prefix-match
 * some keyword, so "john card" narrows to John + Cardiology.
 */

const WORD_SPLIT = /[\s,.@_\-/()]+/;

export function buildKeywords(...values: Array<string | undefined | null>): string[] {
  const words = new Set<string>();
  for (const value of values) {
    if (!value) continue;
    const lower = value.toLowerCase().trim();
    for (const word of lower.split(WORD_SPLIT)) {
      if (word) words.add(word);
    }
    // Keep a digits-only copy so "01711" matches "+880 1711-000000".
    const digits = lower.replace(/\D/g, '');
    if (digits.length >= 3) words.add(digits);
  }
  return [...words];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Builds a Mongo filter fragment that matches documents whose keywords prefix-match every query word. */
export function keywordFilter(query?: string): Record<string, unknown> {
  if (!query) return {};
  const terms = query
    .toLowerCase()
    .split(WORD_SPLIT)
    .filter(Boolean)
    .slice(0, 5);
  if (terms.length === 0) return {};

  const clauses = terms.map((term) => ({ keywords: { $regex: `^${escapeRegex(term)}` } }));
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

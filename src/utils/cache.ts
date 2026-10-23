/**
 * Tiny in-process TTL cache for expensive, read-heavy aggregations (dashboard stats).
 * Writes call `invalidate()` so users see their own changes immediately.
 * For a multi-instance deployment swap this for Redis behind the same interface.
 */
const store = new Map<string, { value: unknown; expiresAt: number }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;
  const value = await load();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

export function invalidate(prefix = ''): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

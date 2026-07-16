/**
 * In-memory cache for the server-island data sources.
 *
 * Stored on globalThis so entries survive Vite module reloads in dev and are
 * shared across concurrent requests in the standalone Node server.
 */

interface Entry<T> {
  data: T;
  fetchedAt: number;
}

const globalStore = globalThis as typeof globalThis & {
  __apiCache?: Map<string, Entry<unknown>>;
  __apiInflight?: Map<string, Promise<unknown>>;
};

const cache = (globalStore.__apiCache ??= new Map());
const inflight = (globalStore.__apiInflight ??= new Map());

export interface CachedResult<T> {
  data: T | null;
  error: string | null;
}

export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * ONE_HOUR;

/**
 * Serve `fetcher`'s result cached under `key` for `ttl` milliseconds.
 *
 * - Concurrent refreshes are deduplicated so parallel requests share one fetch.
 * - If a refresh fails, stale data is served rather than an error.
 * - With `staleWhileRevalidate`, an expired entry is served immediately and
 *   refreshed in the background instead of blocking the request.
 */
export async function cached<T>(
  key: string,
  ttl: number,
  fetcher: () => Promise<T>,
  { staleWhileRevalidate = false } = {},
): Promise<CachedResult<T>> {
  const entry = cache.get(key) as Entry<T> | undefined;
  if (entry && Date.now() - entry.fetchedAt < ttl) {
    return { data: entry.data, error: null };
  }

  const refresh = () => {
    let promise = inflight.get(key) as Promise<T> | undefined;
    if (!promise) {
      promise = fetcher()
        .then((data) => {
          cache.set(key, { data, fetchedAt: Date.now() });
          return data;
        })
        .finally(() => inflight.delete(key));
      inflight.set(key, promise);
    }
    return promise;
  };

  if (entry && staleWhileRevalidate) {
    refresh().catch(() => {
      // Keep serving stale data if the background refresh fails
    });
    return { data: entry.data, error: null };
  }

  try {
    return { data: await refresh(), error: null };
  } catch (e) {
    if (entry) return { data: entry.data, error: null };
    return {
      data: null,
      error: e instanceof Error ? e.message : "Failed to fetch",
    };
  }
}

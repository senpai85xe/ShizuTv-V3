export const RECENT_CONTENT_CACHE_NAME = 'shizutv-recent-content-v1';
export const IMAGES_CACHE_NAME = 'shizutv-images-cache';
export const RECENT_API_CACHE_NAME = 'shizutv-recent-content-api';
const LOCAL_INDEX_KEY = 'shizutv_recent_cache_index_v1';
const LOCAL_ENTRY_PREFIX = 'shizutv_recent_entry_v1:';
const DEFAULT_MAX_ENTRIES = 60;

export interface CachedContentRecord<T> {
  data: T;
  cachedAt: number;
}

export interface RecentCacheIndexEntry {
  key: string;
  updatedAt: number;
}

export function hashCacheKey(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildRecentContentRequestUrl(rawKey: string): string {
  const hashed = hashCacheKey(rawKey);
  return `https://shizutv-cache.local/v1/recent/${hashed}`;
}

export function isCacheEntryFresh(
  cachedAt: number,
  ttlMs: number,
  now = Date.now(),
): boolean {
  if (!Number.isFinite(cachedAt) || ttlMs <= 0) return false;
  return now - cachedAt < ttlMs;
}

export function pruneRecentCacheIndex(
  entries: RecentCacheIndexEntry[],
  maxEntries = DEFAULT_MAX_ENTRIES,
): { kept: RecentCacheIndexEntry[]; evicted: RecentCacheIndexEntry[] } {
  const sorted = [...entries].sort((a, b) => b.updatedAt - a.updatedAt);
  const kept = sorted.slice(0, Math.max(0, maxEntries));
  const evicted = sorted.slice(Math.max(0, maxEntries));
  return { kept, evicted };
}

function readLocalIndex(): RecentCacheIndexEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(LOCAL_INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalIndex(entries: RecentCacheIndexEntry[]): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(LOCAL_INDEX_KEY, JSON.stringify(entries));
  } catch {
    // Ignore storage quota failures
  }
}

async function readFromCacheStorage<T>(requestUrl: string): Promise<CachedContentRecord<T> | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(RECENT_CONTENT_CACHE_NAME);
    const matched = await cache.match(requestUrl);
    if (!matched) return null;
    const json = (await matched.json()) as CachedContentRecord<T>;
    if (!json || typeof json.cachedAt !== 'number') return null;
    return json;
  } catch {
    return null;
  }
}

async function writeToCacheStorage<T>(
  requestUrl: string,
  record: CachedContentRecord<T>,
  evictUrls: string[],
): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(RECENT_CONTENT_CACHE_NAME);
    const body = JSON.stringify(record);
    await cache.put(
      requestUrl,
      new Response(body, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    await Promise.all(evictUrls.map((url) => cache.delete(url)));
  } catch {
    // Ignore CacheStorage failures in restricted environments
  }
}

function readFromLocalStorage<T>(hashedKey: string): CachedContentRecord<T> | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${LOCAL_ENTRY_PREFIX}${hashedKey}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedContentRecord<T>;
    if (!parsed || typeof parsed.cachedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeToLocalStorage<T>(
  hashedKey: string,
  record: CachedContentRecord<T>,
  evictKeys: string[],
): void {
  if (typeof localStorage === 'undefined') return;
  try {
    for (const key of evictKeys) {
      localStorage.removeItem(`${LOCAL_ENTRY_PREFIX}${key}`);
    }
    localStorage.setItem(`${LOCAL_ENTRY_PREFIX}${hashedKey}`, JSON.stringify(record));
  } catch {
    // Ignore storage quota errors
  }
}

export async function readRecentContent<T>(rawKey: string): Promise<CachedContentRecord<T> | null> {
  const hashedKey = hashCacheKey(rawKey);
  const requestUrl = buildRecentContentRequestUrl(rawKey);

  const fromCache = await readFromCacheStorage<T>(requestUrl);
  if (fromCache) return fromCache;

  return readFromLocalStorage<T>(hashedKey);
}

export async function writeRecentContent<T>(
  rawKey: string,
  data: T,
  maxEntries = DEFAULT_MAX_ENTRIES,
): Promise<void> {
  const hashedKey = hashCacheKey(rawKey);
  const requestUrl = buildRecentContentRequestUrl(rawKey);
  const now = Date.now();
  const record: CachedContentRecord<T> = { data, cachedAt: now };

  const currentIndex = readLocalIndex().filter((entry) => entry.key !== hashedKey);
  currentIndex.unshift({ key: hashedKey, updatedAt: now });
  const { kept, evicted } = pruneRecentCacheIndex(currentIndex, maxEntries);
  writeLocalIndex(kept);

  const evictedKeys = evicted.map((e) => e.key);
  const evictedUrls = evictedKeys.map((k) => `https://shizutv-cache.local/v1/recent/${k}`);

  writeToLocalStorage(hashedKey, record, evictedKeys);
  await writeToCacheStorage(requestUrl, record, evictedUrls);
}

export async function resolveWithRecentCache<T>(params: {
  key: string;
  ttlMs: number;
  fetcher: () => Promise<T>;
  bypassFreshCache?: boolean;
}): Promise<T> {
  const cached = await readRecentContent<T>(params.key);
  if (
    !params.bypassFreshCache &&
    cached &&
    isCacheEntryFresh(cached.cachedAt, params.ttlMs)
  ) {
    return cached.data;
  }

  try {
    const freshData = await params.fetcher();
    await writeRecentContent(params.key, freshData);
    return freshData;
  } catch (err) {
    if (cached) {
      return cached.data;
    }
    throw err;
  }
}

export async function clearOfflineCaches(): Promise<void> {
  if (typeof localStorage !== 'undefined') {
    try {
      const index = readLocalIndex();
      for (const item of index) {
        localStorage.removeItem(`${LOCAL_ENTRY_PREFIX}${item.key}`);
      }
      localStorage.removeItem(LOCAL_INDEX_KEY);
    } catch {
      // Ignore storage errors
    }
  }

  if (typeof caches !== 'undefined') {
    try {
      await Promise.all([
        caches.delete(RECENT_CONTENT_CACHE_NAME),
        caches.delete(IMAGES_CACHE_NAME),
        caches.delete(RECENT_API_CACHE_NAME),
      ]);
    } catch {
      // Ignore CacheStorage errors
    }
  }
}

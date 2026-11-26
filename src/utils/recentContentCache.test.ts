import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRecentContentRequestUrl,
  hashCacheKey,
  isCacheEntryFresh,
  pruneRecentCacheIndex,
  resolveWithRecentCache,
  writeRecentContent,
} from './recentContentCache';

test('hashCacheKey and buildRecentContentRequestUrl produce deterministic cache URLs', () => {
  const urlA = buildRecentContentRequestUrl('query:trending:ANIME');
  const urlB = buildRecentContentRequestUrl('query:trending:ANIME');
  const urlC = buildRecentContentRequestUrl('query:popular:MANGA');

  assert.equal(urlA, urlB);
  assert.notEqual(urlA, urlC);
  assert.ok(urlA.startsWith('https://shizutv-cache.local/v1/recent/'));
  assert.ok(hashCacheKey('test-key').length > 0);
});

test('isCacheEntryFresh validates timestamps against TTL cleanly', () => {
  const now = 1_000_000;
  assert.equal(isCacheEntryFresh(now - 5_000, 60_000, now), true);
  assert.equal(isCacheEntryFresh(now - 60_000, 60_000, now), false);
  assert.equal(isCacheEntryFresh(now - 5_000, 0, now), false);
});

test('pruneRecentCacheIndex retains most recently updated entries and evicts oldest', () => {
  const entries = [
    { key: 'oldest', updatedAt: 100 },
    { key: 'newest', updatedAt: 300 },
    { key: 'middle', updatedAt: 200 },
  ];
  const { kept, evicted } = pruneRecentCacheIndex(entries, 2);
  assert.deepEqual(
    kept.map((e) => e.key),
    ['newest', 'middle'],
  );
  assert.deepEqual(
    evicted.map((e) => e.key),
    ['oldest'],
  );
});

test('resolveWithRecentCache falls back to stale persistent entry when network fails', async () => {
  const memoryStore = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    get length() {
      return memoryStore.size;
    },
    clear: () => memoryStore.clear(),
    getItem: (k: string) => memoryStore.get(k) ?? null,
    key: (i: number) => Array.from(memoryStore.keys())[i] ?? null,
    removeItem: (k: string) => {
      memoryStore.delete(k);
    },
    setItem: (k: string, v: string) => {
      memoryStore.set(k, v);
    },
  };

  const cacheKey = 'anilist:trending:1';
  await writeRecentContent(cacheKey, { items: [{ id: '21', title: 'ONE PIECE' }] });

  const resolved = await resolveWithRecentCache({
    key: cacheKey,
    ttlMs: 1,
    bypassFreshCache: true,
    fetcher: async () => {
      throw new Error('Network unreachable');
    },
  });

  assert.deepEqual(resolved, { items: [{ id: '21', title: 'ONE PIECE' }] });
});

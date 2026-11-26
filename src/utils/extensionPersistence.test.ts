import test from 'node:test';
import assert from 'node:assert/strict';
import {
  APP_STATE_STORAGE_KEY,
  compactRepoCatalogEntries,
  evictDisposableCacheFromStorage,
  loadPersistedRepoCatalog,
  migrateExtensionRepoRecord,
  migratePersistedExtensionRecords,
  migrateSourceInfoRecord,
  persistStateAndCatalog,
  REPO_CATALOG_STORAGE_KEY,
  StorageLike,
} from './extensionPersistence';
import type { SourceInfo } from '../types/media';

class MemoryStorage implements StorageLike {
  map = new Map<string, string>();
  quotaBytes: number;
  failCoreWrites = false;

  constructor(quotaBytes = Number.POSITIVE_INFINITY) {
    this.quotaBytes = quotaBytes;
  }

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failCoreWrites && key === APP_STATE_STORAGE_KEY) {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    }
    const existing = this.map.get(key) ?? '';
    let total = 0;
    for (const [k, v] of this.map.entries()) {
      total += k.length + v.length;
    }
    const nextTotal = total - existing.length + (existing ? 0 : key.length) + value.length;
    if (nextTotal > this.quotaBytes) {
      throw new DOMException('QuotaExceededError', 'QuotaExceededError');
    }
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }
}

function makeCatalog(count: number, descriptionLen = 0): SourceInfo[] {
  const pad = descriptionLen > 0 ? 'X'.repeat(descriptionLen) : 'Sample';
  return Array.from({ length: count }, (_, idx) => ({
    id: `ext-ay-src-${idx}`,
    name: `Extension ${idx}`,
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    repoUrl: 'https://repo.example/index.min.json',
    baseUrl: `https://ext${idx}.example`,
    pkg: `eu.kanade.tachiyomi.animeextension.en.src${idx}`,
    iconUrl: descriptionLen > 0 ? `https://cdn.example/icon-${idx}-${'I'.repeat(Math.min(60, descriptionLen))}.png` : undefined,
    description: pad,
  }));
}

test('persistStateAndCatalog isolates repoCatalog from core state cleanly', () => {
  const storage = new MemoryStorage();
  const catalog = makeCatalog(3);
  const res = persistStateAndCatalog(
    {
      customSources: [catalog[0]],
      extensionRepos: [{ url: 'https://repo.example/index.min.json', name: 'TestRepo', category: 'aniyomi', mediaType: 'ANIME', count: 3, addedAt: '2026-01-01T00:00:00.000Z' }],
      repoCatalog: catalog,
    },
    storage,
  );

  assert.equal(res.ok, true);
  assert.equal(res.compactedCatalog, false);
  assert.equal(res.error, null);

  const savedCore = JSON.parse(storage.getItem(APP_STATE_STORAGE_KEY) || '{}');
  assert.equal(savedCore.extensionRepos.length, 1);
  assert.equal(savedCore.customSources.length, 1);
  assert.deepEqual(savedCore.repoCatalog, []);

  const loadedCatalog = loadPersistedRepoCatalog([], storage);
  assert.equal(loadedCatalog.length, 3);
  assert.equal(loadedCatalog[1].id, 'ext-ay-src-1');
});

test('persistStateAndCatalog evicts disposable cache entries on QuotaExceededError and compacts large catalogs', () => {
  const catalog = makeCatalog(20, 400);
  // Compute compact size + core overhead, add disposable recent cache entries that push full write over budget
  const compactSize = JSON.stringify(compactRepoCatalogEntries(catalog)).length + REPO_CATALOG_STORAGE_KEY.length;
  const fullCatalogSize = JSON.stringify(catalog).length + REPO_CATALOG_STORAGE_KEY.length;
  const coreState = { customSources: [catalog[0]], extensionRepos: [], repoCatalog: catalog };
  const coreSize = JSON.stringify({ ...coreState, repoCatalog: [] }).length + APP_STATE_STORAGE_KEY.length;

  // Allow core + compact catalog + 0 bytes margin above compact, while disposable cache initially takes space
  const quota = coreSize + compactSize + 200;
  assert.ok(fullCatalogSize > compactSize + 200, 'full catalog must exceed compacted budget');

  const storage = new MemoryStorage(Number.POSITIVE_INFINITY);
  storage.setItem('shizutv_recent_entry_v1:k1', 'A'.repeat(1200));
  storage.setItem('shizutv_recent_cache_index_v1', JSON.stringify([{ key: 'k1' }]));
  storage.quotaBytes = quota;

  const res = persistStateAndCatalog(coreState, storage);
  assert.equal(res.ok, true);
  assert.ok(res.evictedCacheEntries >= 1, 'must evict disposable cache entries');
  assert.equal(res.compactedCatalog, true, 'must fall back to compacted repoCatalog cleanly');
  assert.equal(storage.getItem('shizutv_recent_entry_v1:k1'), null);

  const loaded = loadPersistedRepoCatalog([], storage);
  assert.equal(loaded.length, 20);
  assert.equal(loaded[0].baseUrl, 'https://ext0.example');
  assert.equal(loaded[0].pkg, 'eu.kanade.tachiyomi.animeextension.en.src0');
});

test('persistStateAndCatalog never fails silently when storage rejects writes', () => {
  const storage = new MemoryStorage();
  storage.failCoreWrites = true;
  const res = persistStateAndCatalog({ customSources: [], repoCatalog: [] }, storage);
  assert.equal(res.ok, false);
  assert.ok(res.error && res.error.includes('Failed to save extension state'));

  const nullStorageRes = persistStateAndCatalog({ customSources: [], repoCatalog: [] }, null);
  assert.equal(nullStorageRes.ok, false);
  assert.ok(nullStorageRes.error && nullStorageRes.error.includes('unavailable'));
});

test('evictDisposableCacheFromStorage only removes shizutv_recent_entry_v1 keys and loadPersistedRepoCatalog falls back to legacy', () => {
  const storage = new MemoryStorage();
  storage.setItem('shizutv_recent_entry_v1:abc', 'cached');
  storage.setItem('other_important_key', 'keep');

  const evicted = evictDisposableCacheFromStorage(storage);
  assert.equal(evicted, 1);
  assert.equal(storage.getItem('other_important_key'), 'keep');

  const legacy = makeCatalog(2);
  const fromLegacy = loadPersistedRepoCatalog(legacy, storage);
  assert.equal(fromLegacy.length, 2);
});

test('Phase 1: migrates legacy localStorage extension and repo records cleanly without losing data', () => {
  const legacyV1Aniyomi = {
    id: 'ext-ay-999',
    name: 'Legacy AniSource',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '15.4',
    repoUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
    baseUrl: 'https://legacy-ani.example',
    pkg: 'eu.kanade.tachiyomi.animeextension.en.legacyani',
    apk: 'aniyomi-en.legacyani-v15.4.apk',
    code: 7,
  };

  const migrated = migrateSourceInfoRecord(legacyV1Aniyomi);
  assert.ok(migrated);
  assert.equal(migrated.id, 'ext-ay-999');
  assert.equal(migrated.repoBaseUrl, 'https://raw.githubusercontent.com/yuzono/anime-repo/repo');
  assert.equal(migrated.apkName, 'aniyomi-en.legacyani-v15.4.apk');
  assert.equal(
    migrated.apkUrl,
    'https://raw.githubusercontent.com/yuzono/anime-repo/repo/apk/aniyomi-en.legacyani-v15.4.apk',
  );
  assert.equal(migrated.versionCode, 7);
  assert.equal(migrated.libVersion, '15');
  assert.equal(
    migrated.iconUrl,
    'https://raw.githubusercontent.com/yuzono/anime-repo/repo/icon/eu.kanade.tachiyomi.animeextension.en.legacyani.png',
  );
  assert.equal(migrated.runtimeRequirement, 'android-native');
  assert.equal(migrated.metadataOnlyStorage, true);

  // Handles duplicates, corrupted items, and partial inbuilt/custom entries safely
  const list = migratePersistedExtensionRecords([
    null,
    { id: '', name: 'Broken' },
    { id: 'shonenx-hls-inbuilt', name: 'ShizuTv Stream (Inbuilt)', type: 'inbuilt', lang: 'en', version: '2.1.5' },
    legacyV1Aniyomi,
    legacyV1Aniyomi,
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].mediaTypes, ['ANIME']);
  assert.equal(list[0].runtimeRequirement, 'web-compatible');

  // Compact catalog retains Phase 1 Aniyomi metadata even under storage quota pressure
  const compacted = compactRepoCatalogEntries([migrated]);
  assert.equal(compacted[0].repoBaseUrl, migrated.repoBaseUrl);
  assert.equal(compacted[0].apkName, migrated.apkName);
  assert.equal(compacted[0].versionCode, 7);
  assert.equal(compacted[0].libVersion, '15');
  assert.equal(compacted[0].runtimeRequirement, 'android-native');
  assert.equal(compacted[0].metadataOnlyStorage, true);

  // Repo migration backfills repoBaseUrl cleanly
  const migratedRepo = migrateExtensionRepoRecord({
    id: 'repo-1',
    name: 'Yuzono',
    url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
    manager: 'aniyomi',
  });
  assert.ok(migratedRepo);
  assert.equal(migratedRepo.repoBaseUrl, 'https://raw.githubusercontent.com/yuzono/anime-repo/repo');
});


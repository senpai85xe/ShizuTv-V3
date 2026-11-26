import type {
  ExtensionRepo,
  ExtensionRuntimeRequirement,
  MediaType,
  SourceInfo,
} from '../types/media';
import {
  deriveRepoBaseUrl,
  parseAniyomiLibVersion,
  parseAniyomiVersionCode,
  resolveAniyomiAssetUrl,
} from './extensionRepoParser';

export const APP_STATE_STORAGE_KEY = 'shizutv_state_v2';
export const LEGACY_STATE_STORAGE_KEY = 'shonenx_state_v2';
export const REPO_CATALOG_STORAGE_KEY = 'shizutv_repo_catalog_v1';

const RECENT_CACHE_PREFIX = 'shizutv_recent_entry_v1:';
const RECENT_CACHE_INDEX_KEY = 'shizutv_recent_cache_index_v1';
const VALID_MEDIA_TYPES = new Set<MediaType>(['ANIME', 'MANGA', 'TV', 'MOVIE']);
const VALID_RUNTIME_REQUIREMENTS = new Set<ExtensionRuntimeRequirement>([
  'web-compatible',
  'android-native',
  'unsupported',
  'unverified',
]);

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length?: number;
  key?(index: number): string | null;
}

export interface PersistResult {
  ok: boolean;
  evictedCacheEntries: number;
  compactedCatalog: boolean;
  error: string | null;
}

function getDefaultStorage(): StorageLike | null {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage;
    }
  } catch {
    // Restricted storage context
  }
  return null;
}

/**
 * Normalizes and migrates legacy v1/v2 SourceInfo records stored in browser localStorage
 * without breaking or discarding existing user configurations, while backfilling derivable
 * Phase 1 repository & Aniyomi package metadata when safe to do so.
 */
export function migrateSourceInfoRecord(raw: unknown): SourceInfo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  if (!id || !name) return null;

  const type: SourceInfo['type'] =
    rec.type === 'inbuilt' ? 'inbuilt' : rec.type === 'extension' || id.startsWith('ext-') ? 'extension' : 'extension';

  const mediaTypesRaw = Array.isArray(rec.mediaTypes) ? rec.mediaTypes : [];
  const mediaTypes: MediaType[] = mediaTypesRaw
    .map((m) => String(m).toUpperCase() as MediaType)
    .filter((m) => VALID_MEDIA_TYPES.has(m));
  if (mediaTypesRaw.length > 0 && mediaTypes.length === 0) {
    return null;
  }

  const lang = typeof rec.lang === 'string' && rec.lang.trim() ? rec.lang.trim() : 'en';
  const version = typeof rec.version === 'string' && rec.version.trim() ? rec.version.trim() : '1.0.0';
  const repoUrl = typeof rec.repoUrl === 'string' && rec.repoUrl.trim() ? rec.repoUrl.trim() : undefined;
  const repoBaseUrl =
    (typeof rec.repoBaseUrl === 'string' && rec.repoBaseUrl.trim() ? rec.repoBaseUrl.trim() : undefined) ??
    deriveRepoBaseUrl(repoUrl);
  const baseUrl = typeof rec.baseUrl === 'string' && rec.baseUrl.trim() ? rec.baseUrl.trim() : undefined;
  const pkg = typeof rec.pkg === 'string' && rec.pkg.trim() ? rec.pkg.trim() : undefined;
  const apkName =
    typeof rec.apkName === 'string' && rec.apkName.trim()
      ? rec.apkName.trim()
      : typeof rec.apk === 'string' && rec.apk.trim()
        ? rec.apk.trim()
        : undefined;
  const apkUrl =
    (typeof rec.apkUrl === 'string' && rec.apkUrl.trim() ? rec.apkUrl.trim() : undefined) ??
    resolveAniyomiAssetUrl(apkName, repoBaseUrl, 'apk');
  const versionCode = parseAniyomiVersionCode(rec.versionCode ?? rec.code);

  const isAniyomi =
    type === 'extension' &&
    (id.startsWith('ext-ay-') ||
      Boolean(apkName) ||
      Boolean(pkg && /(?:tachiyomi|aniyomi|mihon|komikku|animeextension|extension)/i.test(pkg)));

  const libVersion = parseAniyomiLibVersion(rec.libVersion, isAniyomi ? version : undefined);
  const iconUrl =
    (typeof rec.iconUrl === 'string' && rec.iconUrl.trim() ? rec.iconUrl.trim() : undefined) ??
    (isAniyomi && pkg && repoBaseUrl
      ? `${repoBaseUrl.replace(/\/+$/, '')}/icon/${encodeURIComponent(pkg)}.png`
      : undefined);

  const description =
    typeof rec.description === 'string' && rec.description.trim() ? rec.description.trim() : undefined;
  const isNsfw = rec.isNsfw === true ? true : rec.isNsfw === false ? false : undefined;

  const rawReq = rec.runtimeRequirement;
  const runtimeRequirement: ExtensionRuntimeRequirement | undefined =
    typeof rawReq === 'string' && VALID_RUNTIME_REQUIREMENTS.has(rawReq as ExtensionRuntimeRequirement)
      ? (rawReq as ExtensionRuntimeRequirement)
      : type === 'inbuilt'
        ? 'web-compatible'
        : isAniyomi
          ? 'android-native'
          : undefined;

  const metadataOnlyStorage =
    typeof rec.metadataOnlyStorage === 'boolean'
      ? rec.metadataOnlyStorage
      : isAniyomi
        ? true
        : undefined;

  return {
    id,
    name,
    type,
    mediaTypes: mediaTypes.length > 0 ? mediaTypes : ['ANIME'],
    lang,
    version,
    ...(repoUrl ? { repoUrl } : {}),
    ...(repoBaseUrl ? { repoBaseUrl } : {}),
    ...(baseUrl ? { baseUrl } : {}),
    ...(pkg ? { pkg } : {}),
    ...(apkName ? { apkName } : {}),
    ...(apkUrl ? { apkUrl } : {}),
    ...(versionCode !== undefined ? { versionCode } : {}),
    ...(libVersion ? { libVersion } : {}),
    ...(iconUrl ? { iconUrl } : {}),
    ...(description ? { description } : {}),
    ...(isNsfw !== undefined ? { isNsfw } : {}),
    ...(runtimeRequirement ? { runtimeRequirement } : {}),
    ...(metadataOnlyStorage !== undefined ? { metadataOnlyStorage } : {}),
  };
}

export function migratePersistedExtensionRecords(records: unknown): SourceInfo[] {
  if (!Array.isArray(records)) return [];
  const seen = new Set<string>();
  const migrated: SourceInfo[] = [];
  for (const item of records) {
    const next = migrateSourceInfoRecord(item);
    if (!next || seen.has(next.id)) continue;
    seen.add(next.id);
    migrated.push(next);
  }
  return migrated;
}

export function migrateExtensionRepoRecord(raw: unknown): ExtensionRepo | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const id = typeof rec.id === 'string' ? rec.id.trim() : '';
  const name = typeof rec.name === 'string' ? rec.name.trim() : '';
  const url = typeof rec.url === 'string' ? rec.url.trim() : '';
  if (!id || !name || !url) return null;
  const manager =
    rec.manager === 'aniyomi' ||
    rec.manager === 'mangayomi' ||
    rec.manager === 'cloudstream' ||
    rec.manager === 'shonenx'
      ? rec.manager
      : 'aniyomi';
  const mediaType =
    rec.mediaType === 'ANIME' || rec.mediaType === 'MANGA' ? rec.mediaType : undefined;
  const repoBaseUrl =
    (typeof rec.repoBaseUrl === 'string' && rec.repoBaseUrl.trim() ? rec.repoBaseUrl.trim() : undefined) ??
    deriveRepoBaseUrl(url);
  return {
    id,
    name,
    url,
    ...(repoBaseUrl ? { repoBaseUrl } : {}),
    manager,
    ...(mediaType ? { mediaType } : {}),
    addedAt:
      typeof rec.addedAt === 'string' && rec.addedAt.trim()
        ? rec.addedAt.trim()
        : new Date(0).toISOString(),
  };
}

/**
 * Strips bulky or empty optional fields (description, iconUrl) from catalog entries when storage space is tight,
 * preserving every required core and Phase 1 Aniyomi metadata field cleanly.
 */
export function compactRepoCatalogEntries(catalog: SourceInfo[]): SourceInfo[] {
  if (!Array.isArray(catalog)) return [];
  return catalog.map((src) => {
    const compacted: SourceInfo = {
      id: src.id,
      name: src.name,
      type: src.type,
      mediaTypes: Array.isArray(src.mediaTypes) && src.mediaTypes.length > 0 ? src.mediaTypes : ['ANIME'],
      lang: src.lang || 'en',
      version: src.version || '1.0.0',
    };
    if (src.repoUrl) compacted.repoUrl = src.repoUrl;
    if (src.repoBaseUrl) compacted.repoBaseUrl = src.repoBaseUrl;
    if (src.baseUrl) compacted.baseUrl = src.baseUrl;
    if (src.pkg) compacted.pkg = src.pkg;
    if (src.apkName) compacted.apkName = src.apkName;
    if (src.apkUrl) compacted.apkUrl = src.apkUrl;
    if (src.versionCode !== undefined) compacted.versionCode = src.versionCode;
    if (src.libVersion) compacted.libVersion = src.libVersion;
    if (src.isNsfw) compacted.isNsfw = true;
    if (src.runtimeRequirement) compacted.runtimeRequirement = src.runtimeRequirement;
    if (src.metadataOnlyStorage) compacted.metadataOnlyStorage = true;
    return compacted;
  });
}

/**
 * Frees localStorage space occupied by disposable offline API cache entries (already backed by CacheStorage).
 */
export function evictDisposableCacheFromStorage(storage: StorageLike): number {
  let evicted = 0;
  try {
    const keysToRemove: string[] = [];
    if (typeof storage.length === 'number' && typeof storage.key === 'function') {
      for (let i = 0; i < storage.length; i += 1) {
        const k = storage.key(i);
        if (k && (k.startsWith(RECENT_CACHE_PREFIX) || k === RECENT_CACHE_INDEX_KEY)) {
          keysToRemove.push(k);
        }
      }
    } else {
      const indexRaw = storage.getItem(RECENT_CACHE_INDEX_KEY);
      if (indexRaw) {
        try {
          const parsed = JSON.parse(indexRaw) as Array<{ key?: string }>;
          if (Array.isArray(parsed)) {
            for (const entry of parsed) {
              if (entry?.key) keysToRemove.push(`${RECENT_CACHE_PREFIX}${entry.key}`);
            }
          }
        } catch {
          // Ignore malformed index
        }
        keysToRemove.push(RECENT_CACHE_INDEX_KEY);
      }
    }

    for (const k of keysToRemove) {
      storage.removeItem(k);
      evicted += 1;
    }
  } catch {
    // Best-effort cleanup
  }
  return evicted;
}

function writeKeyWithQuotaRecovery(
  storage: StorageLike,
  key: string,
  value: string,
): { ok: boolean; evictedCacheEntries: number; error: string | null } {
  try {
    storage.setItem(key, value);
    return { ok: true, evictedCacheEntries: 0, error: null };
  } catch (firstErr) {
    const evicted = evictDisposableCacheFromStorage(storage);
    if (evicted > 0) {
      try {
        storage.setItem(key, value);
        return { ok: true, evictedCacheEntries: evicted, error: null };
      } catch (retryErr) {
        return {
          ok: false,
          evictedCacheEntries: evicted,
          error: retryErr instanceof Error ? retryErr.message : String(retryErr),
        };
      }
    }
    return {
      ok: false,
      evictedCacheEntries: 0,
      error: firstErr instanceof Error ? firstErr.message : String(firstErr),
    };
  }
}

/**
 * Persists application state cleanly:
 * - Writes core state (repos, customSources, activeSources, library, prefs) to shizutv_state_v2
 *   without repoCatalog bloat so large extension manifests cannot break core/installed persistence.
 * - Writes repoCatalog separately to shizutv_repo_catalog_v1, compacting descriptions/icons if quota is tight.
 * - Never fails silently: returns explicit PersistResult with error details.
 */
export function persistStateAndCatalog(
  state: Record<string, unknown> & { repoCatalog?: SourceInfo[] },
  storageOverride?: StorageLike | null,
): PersistResult {
  const storage = storageOverride === undefined ? getDefaultStorage() : storageOverride;
  if (!storage) {
    return {
      ok: false,
      evictedCacheEntries: 0,
      compactedCatalog: false,
      error: 'Browser localStorage is unavailable in this environment.',
    };
  }

  const catalog = Array.isArray(state.repoCatalog) ? state.repoCatalog : [];
  const coreState = {
    ...state,
    // Keep core state lean; repoCatalog lives in REPO_CATALOG_STORAGE_KEY (migrated seamlessly on read)
    repoCatalog: [],
  };

  let totalEvicted = 0;
  let coreSerialized = '';
  try {
    coreSerialized = JSON.stringify(coreState);
  } catch (err) {
    return {
      ok: false,
      evictedCacheEntries: 0,
      compactedCatalog: false,
      error: err instanceof Error ? `Failed to serialize state: ${err.message}` : 'Failed to serialize state.',
    };
  }

  const coreWrite = writeKeyWithQuotaRecovery(storage, APP_STATE_STORAGE_KEY, coreSerialized);
  totalEvicted += coreWrite.evictedCacheEntries;
  if (!coreWrite.ok) {
    return {
      ok: false,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: `Failed to save extension state: ${coreWrite.error || 'Storage quota exceeded'}`,
    };
  }

  if (catalog.length === 0) {
    try {
      storage.removeItem(REPO_CATALOG_STORAGE_KEY);
    } catch {
      // Ignore cleanup errors
    }
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: null,
    };
  }

  const fullCatalogJson = JSON.stringify(catalog);
  const fullWrite = writeKeyWithQuotaRecovery(storage, REPO_CATALOG_STORAGE_KEY, fullCatalogJson);
  totalEvicted += fullWrite.evictedCacheEntries;
  if (fullWrite.ok) {
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: false,
      error: null,
    };
  }

  // Retry repoCatalog with compact metadata (strips iconUrl/description strings to fit quota)
  const compacted = compactRepoCatalogEntries(catalog);
  const compactWrite = writeKeyWithQuotaRecovery(
    storage,
    REPO_CATALOG_STORAGE_KEY,
    JSON.stringify(compacted),
  );
  totalEvicted += compactWrite.evictedCacheEntries;
  if (compactWrite.ok) {
    return {
      ok: true,
      evictedCacheEntries: totalEvicted,
      compactedCatalog: true,
      error: null,
    };
  }

  return {
    ok: false,
    evictedCacheEntries: totalEvicted,
    compactedCatalog: true,
    error: `Repository catalog could not be fully saved to browser storage (${compactWrite.error || 'QuotaExceededError'}). Installed extensions remain saved.`,
  };
}

/**
 * Loads and migrates persisted repoCatalog, preferring dedicated REPO_CATALOG_STORAGE_KEY and
 * transparently falling back to any legacy inline array from shizutv_state_v2.
 */
export function loadPersistedRepoCatalog(
  legacyInlineCatalog: unknown,
  storageOverride?: StorageLike | null,
): SourceInfo[] {
  const storage = storageOverride === undefined ? getDefaultStorage() : storageOverride;
  if (storage) {
    try {
      const raw = storage.getItem(REPO_CATALOG_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return migratePersistedExtensionRecords(parsed);
        }
      }
    } catch {
      // Fallback to legacy inline catalog
    }
  }
  return migratePersistedExtensionRecords(legacyInlineCatalog);
}

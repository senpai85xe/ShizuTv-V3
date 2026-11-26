import type { MediaType } from '../types/media';

export const DISCOVER_SEARCH_HISTORY_STORAGE_KEY = 'shizutv_discover_search_history_v1';
export const MAX_DISCOVER_SEARCH_HISTORY = 10;

export interface DiscoverSearchHistoryStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

type PersistedHistoryMap = {
  ANIME: string[];
  MANGA: string[];
};

function getDefaultStorage(): DiscoverSearchHistoryStorageLike | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

function normalizeHistoryList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.length < 2 || seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
    if (out.length >= MAX_DISCOVER_SEARCH_HISTORY) break;
  }
  return out;
}

function readAllHistory(storage?: DiscoverSearchHistoryStorageLike | null): PersistedHistoryMap {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) return { ANIME: [], MANGA: [] };
  try {
    const raw = target.getItem(DISCOVER_SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) return { ANIME: [], MANGA: [] };
    const parsed = JSON.parse(raw) as Partial<Record<MediaType, unknown>>;
    return {
      ANIME: normalizeHistoryList(parsed?.ANIME),
      MANGA: normalizeHistoryList(parsed?.MANGA),
    };
  } catch {
    return { ANIME: [], MANGA: [] };
  }
}

function writeAllHistory(
  data: PersistedHistoryMap,
  storage?: DiscoverSearchHistoryStorageLike | null,
): void {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) return;
  try {
    target.setItem(DISCOVER_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota / privacy mode failures gracefully
  }
}

export function loadDiscoverSearchHistory(
  mediaType: MediaType,
  storage?: DiscoverSearchHistoryStorageLike | null,
): string[] {
  const all = readAllHistory(storage);
  return mediaType === 'MANGA' ? all.MANGA : all.ANIME;
}

export function recordDiscoverSearchHistory(
  mediaType: MediaType,
  query: string,
  storage?: DiscoverSearchHistoryStorageLike | null,
): string[] {
  const trimmed = query.trim();
  const all = readAllHistory(storage);
  const current = mediaType === 'MANGA' ? all.MANGA : all.ANIME;
  if (trimmed.length < 2) {
    return current;
  }
  const lower = trimmed.toLowerCase();
  const next = [trimmed, ...current.filter((item) => item.toLowerCase() !== lower)].slice(
    0,
    MAX_DISCOVER_SEARCH_HISTORY,
  );
  const updated: PersistedHistoryMap =
    mediaType === 'MANGA' ? { ...all, MANGA: next } : { ...all, ANIME: next };
  writeAllHistory(updated, storage);
  return next;
}

export function removeDiscoverSearchHistoryItem(
  mediaType: MediaType,
  query: string,
  storage?: DiscoverSearchHistoryStorageLike | null,
): string[] {
  const lower = query.trim().toLowerCase();
  const all = readAllHistory(storage);
  const current = mediaType === 'MANGA' ? all.MANGA : all.ANIME;
  const next = current.filter((item) => item.toLowerCase() !== lower);
  const updated: PersistedHistoryMap =
    mediaType === 'MANGA' ? { ...all, MANGA: next } : { ...all, ANIME: next };
  writeAllHistory(updated, storage);
  return next;
}

export function clearDiscoverSearchHistory(
  mediaType: MediaType,
  storage?: DiscoverSearchHistoryStorageLike | null,
): string[] {
  const all = readAllHistory(storage);
  const updated: PersistedHistoryMap =
    mediaType === 'MANGA' ? { ...all, MANGA: [] } : { ...all, ANIME: [] };
  writeAllHistory(updated, storage);
  return [];
}

// Separate clicked Anime/Manga item history from text search history
import type { UnifiedMedia } from '../types/media';

export const DISCOVER_CLICKED_MEDIA_STORAGE_KEY = 'shizutv_discover_clicked_media_v1';
export const MAX_DISCOVER_CLICKED_MEDIA = 12;

type PersistedClickedMediaMap = {
  ANIME: UnifiedMedia[];
  MANGA: UnifiedMedia[];
};

function sanitizeClickedMediaEntry(raw: unknown, fallbackType: 'ANIME' | 'MANGA'): UnifiedMedia | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<UnifiedMedia>;
  const id = typeof candidate.id === 'string' || typeof candidate.id === 'number' ? String(candidate.id).trim() : '';
  if (!id) return null;
  const type = candidate.type === 'MANGA' ? 'MANGA' : candidate.type === 'ANIME' ? 'ANIME' : fallbackType;
  const titleObj =
    candidate.title && typeof candidate.title === 'object'
      ? {
          english: typeof candidate.title.english === 'string' ? candidate.title.english : null,
          romaji: typeof candidate.title.romaji === 'string' ? candidate.title.romaji : null,
          native: typeof candidate.title.native === 'string' ? candidate.title.native : null,
        }
      : { english: null, romaji: null, native: null };
  if (!titleObj.english && !titleObj.romaji && !titleObj.native) return null;

  return {
    id,
    type,
    providerId: candidate.providerId ?? 'anilist',
    idMal: candidate.idMal ?? null,
    externalIds: candidate.externalIds,
    title: titleObj,
    format: typeof candidate.format === 'string' ? candidate.format : null,
    cover: typeof candidate.cover === 'string' ? candidate.cover : null,
    banner: typeof candidate.banner === 'string' ? candidate.banner : null,
    score: typeof candidate.score === 'number' ? candidate.score : null,
    genres: Array.isArray(candidate.genres)
      ? candidate.genres.filter((g): g is string => typeof g === 'string')
      : [],
    status: typeof candidate.status === 'string' ? candidate.status : null,
    episodes: typeof candidate.episodes === 'number' ? candidate.episodes : null,
    chapters: typeof candidate.chapters === 'number' ? candidate.chapters : null,
    nextEpisode: typeof candidate.nextEpisode === 'number' ? candidate.nextEpisode : null,
    year: typeof candidate.year === 'number' ? candidate.year : null,
  };
}

function normalizeClickedMediaList(raw: unknown, fallbackType: 'ANIME' | 'MANGA'): UnifiedMedia[] {
  if (!Array.isArray(raw)) return [];
  const seenIds = new Set<string>();
  const out: UnifiedMedia[] = [];
  for (const item of raw) {
    const clean = sanitizeClickedMediaEntry(item, fallbackType);
    if (!clean || seenIds.has(clean.id)) continue;
    seenIds.add(clean.id);
    out.push(clean);
    if (out.length >= MAX_DISCOVER_CLICKED_MEDIA) break;
  }
  return out;
}

function readAllClickedMedia(
  storage?: DiscoverSearchHistoryStorageLike | null,
): PersistedClickedMediaMap {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) return { ANIME: [], MANGA: [] };
  try {
    const raw = target.getItem(DISCOVER_CLICKED_MEDIA_STORAGE_KEY);
    if (!raw) return { ANIME: [], MANGA: [] };
    const parsed = JSON.parse(raw) as Partial<Record<MediaType, unknown>>;
    return {
      ANIME: normalizeClickedMediaList(parsed?.ANIME, 'ANIME'),
      MANGA: normalizeClickedMediaList(parsed?.MANGA, 'MANGA'),
    };
  } catch {
    return { ANIME: [], MANGA: [] };
  }
}

function writeAllClickedMedia(
  data: PersistedClickedMediaMap,
  storage?: DiscoverSearchHistoryStorageLike | null,
): void {
  const target = storage === undefined ? getDefaultStorage() : storage;
  if (!target) return;
  try {
    target.setItem(DISCOVER_CLICKED_MEDIA_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Ignore storage quota / privacy mode failures gracefully
  }
}

export function loadDiscoverClickedMedia(
  mediaType: MediaType,
  storage?: DiscoverSearchHistoryStorageLike | null,
): UnifiedMedia[] {
  const all = readAllClickedMedia(storage);
  return mediaType === 'MANGA' ? all.MANGA : all.ANIME;
}

export function recordDiscoverClickedMedia(
  mediaType: MediaType,
  media: UnifiedMedia,
  storage?: DiscoverSearchHistoryStorageLike | null,
): UnifiedMedia[] {
  const fallbackType: 'ANIME' | 'MANGA' = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const clean = sanitizeClickedMediaEntry(media, fallbackType);
  const all = readAllClickedMedia(storage);
  const current = fallbackType === 'MANGA' ? all.MANGA : all.ANIME;
  if (!clean) return current;

  const next = [clean, ...current.filter((item) => item.id !== clean.id)].slice(
    0,
    MAX_DISCOVER_CLICKED_MEDIA,
  );
  const updated: PersistedClickedMediaMap =
    fallbackType === 'MANGA' ? { ...all, MANGA: next } : { ...all, ANIME: next };
  writeAllClickedMedia(updated, storage);
  return next;
}

export function removeDiscoverClickedMediaItem(
  mediaType: MediaType,
  mediaId: string,
  storage?: DiscoverSearchHistoryStorageLike | null,
): UnifiedMedia[] {
  const cleanId = mediaId.trim();
  const all = readAllClickedMedia(storage);
  const current = mediaType === 'MANGA' ? all.MANGA : all.ANIME;
  const next = current.filter((item) => item.id !== cleanId);
  const updated: PersistedClickedMediaMap =
    mediaType === 'MANGA' ? { ...all, MANGA: next } : { ...all, ANIME: next };
  writeAllClickedMedia(updated, storage);
  return next;
}

export function clearDiscoverClickedMedia(
  mediaType: MediaType,
  storage?: DiscoverSearchHistoryStorageLike | null,
): UnifiedMedia[] {
  const all = readAllClickedMedia(storage);
  const updated: PersistedClickedMediaMap =
    mediaType === 'MANGA' ? { ...all, MANGA: [] } : { ...all, ANIME: [] };
  writeAllClickedMedia(updated, storage);
  return [];
}


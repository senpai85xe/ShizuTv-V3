import test from 'node:test';
import assert from 'node:assert/strict';
import type { UnifiedMedia } from '../types/media';
import {
  clearDiscoverClickedMedia,
  clearDiscoverSearchHistory,
  DISCOVER_CLICKED_MEDIA_STORAGE_KEY,
  DISCOVER_SEARCH_HISTORY_STORAGE_KEY,
  type DiscoverSearchHistoryStorageLike,
  loadDiscoverClickedMedia,
  loadDiscoverSearchHistory,
  MAX_DISCOVER_CLICKED_MEDIA,
  MAX_DISCOVER_SEARCH_HISTORY,
  recordDiscoverClickedMedia,
  recordDiscoverSearchHistory,
  removeDiscoverClickedMediaItem,
  removeDiscoverSearchHistoryItem,
} from './discoverSearchHistory';

function createMemoryStorage(): DiscoverSearchHistoryStorageLike {
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, val) => {
      map.set(key, val);
    },
  };
}

function makeMedia(id: string, type: 'ANIME' | 'MANGA', title: string): UnifiedMedia {
  return {
    id,
    type,
    providerId: 'anilist',
    title: { english: title, romaji: title, native: null },
    format: type === 'MANGA' ? 'MANGA' : 'TV',
    cover: `https://example.com/${id}.jpg`,
    episodes: type === 'ANIME' ? 24 : null,
    chapters: type === 'MANGA' ? 120 : null,
  };
}

test('discoverSearchHistory isolates ANIME and MANGA histories, deduplicates case-insensitively, and caps size', () => {
  const storage = createMemoryStorage();

  assert.deepEqual(loadDiscoverSearchHistory('ANIME', storage), []);
  assert.deepEqual(loadDiscoverSearchHistory('MANGA', storage), []);

  // Ignores blank or single-char queries
  assert.deepEqual(recordDiscoverSearchHistory('ANIME', ' ', storage), []);
  assert.deepEqual(recordDiscoverSearchHistory('ANIME', 'a', storage), []);

  recordDiscoverSearchHistory('ANIME', 'Naruto', storage);
  recordDiscoverSearchHistory('ANIME', 'One Piece', storage);
  recordDiscoverSearchHistory('ANIME', 'naruto', storage);

  assert.deepEqual(loadDiscoverSearchHistory('ANIME', storage), ['naruto', 'One Piece']);
  assert.deepEqual(loadDiscoverSearchHistory('MANGA', storage), []);

  recordDiscoverSearchHistory('MANGA', 'Berserk', storage);
  recordDiscoverSearchHistory('MANGA', 'Vagabond', storage);
  assert.deepEqual(loadDiscoverSearchHistory('MANGA', storage), ['Vagabond', 'Berserk']);
  assert.deepEqual(loadDiscoverSearchHistory('ANIME', storage), ['naruto', 'One Piece']);

  // Caps at MAX_DISCOVER_SEARCH_HISTORY
  for (let i = 1; i <= MAX_DISCOVER_SEARCH_HISTORY + 4; i += 1) {
    recordDiscoverSearchHistory('ANIME', `Anime Query ${i}`, storage);
  }
  const capped = loadDiscoverSearchHistory('ANIME', storage);
  assert.equal(capped.length, MAX_DISCOVER_SEARCH_HISTORY);
  assert.equal(capped[0], `Anime Query ${MAX_DISCOVER_SEARCH_HISTORY + 4}`);

  // Remove and clear operate only on targeted mediaType
  const afterRemove = removeDiscoverSearchHistoryItem('MANGA', 'berserk', storage);
  assert.deepEqual(afterRemove, ['Vagabond']);
  assert.equal(loadDiscoverSearchHistory('ANIME', storage).length, MAX_DISCOVER_SEARCH_HISTORY);

  clearDiscoverSearchHistory('ANIME', storage);
  assert.deepEqual(loadDiscoverSearchHistory('ANIME', storage), []);
  assert.deepEqual(loadDiscoverSearchHistory('MANGA', storage), ['Vagabond']);
});

test('discoverSearchHistory recovers gracefully from corrupt storage JSON', () => {
  const backing = new Map<string, string>([
    [DISCOVER_SEARCH_HISTORY_STORAGE_KEY, '{corrupt-json'],
  ]);
  const storage: DiscoverSearchHistoryStorageLike = {
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => {
      backing.set(k, v);
    },
  };
  assert.deepEqual(loadDiscoverSearchHistory('ANIME', storage), []);
  assert.deepEqual(recordDiscoverSearchHistory('MANGA', 'Chainsaw Man', storage), ['Chainsaw Man']);
});

test('discoverClickedMedia stores clicked anime and manga separately, deduplicates by id, and supports remove/clear', () => {
  const storage = createMemoryStorage();

  const jjk = makeMedia('113415', 'ANIME', 'Jujutsu Kaisen');
  const dororo = makeMedia('101347', 'ANIME', 'Dororo');
  const berserk = makeMedia('30002', 'MANGA', 'Berserk');

  recordDiscoverClickedMedia('ANIME', jjk, storage);
  recordDiscoverClickedMedia('ANIME', dororo, storage);
  recordDiscoverClickedMedia('ANIME', jjk, storage);
  recordDiscoverClickedMedia('MANGA', berserk, storage);

  const animeClicked = loadDiscoverClickedMedia('ANIME', storage);
  const mangaClicked = loadDiscoverClickedMedia('MANGA', storage);

  assert.deepEqual(animeClicked.map((m) => m.id), ['113415', '101347']);
  assert.deepEqual(mangaClicked.map((m) => m.id), ['30002']);

  // Caps at MAX_DISCOVER_CLICKED_MEDIA
  for (let i = 1; i <= MAX_DISCOVER_CLICKED_MEDIA + 3; i += 1) {
    recordDiscoverClickedMedia('ANIME', makeMedia(`id-${i}`, 'ANIME', `Show ${i}`), storage);
  }
  const cappedAnime = loadDiscoverClickedMedia('ANIME', storage);
  assert.equal(cappedAnime.length, MAX_DISCOVER_CLICKED_MEDIA);
  assert.equal(cappedAnime[0].id, `id-${MAX_DISCOVER_CLICKED_MEDIA + 3}`);

  // Remove and clear isolated by mediaType
  assert.equal(removeDiscoverClickedMediaItem('ANIME', `id-${MAX_DISCOVER_CLICKED_MEDIA + 3}`, storage).length, MAX_DISCOVER_CLICKED_MEDIA - 1);
  assert.equal(loadDiscoverClickedMedia('MANGA', storage).length, 1);

  clearDiscoverClickedMedia('ANIME', storage);
  assert.deepEqual(loadDiscoverClickedMedia('ANIME', storage), []);
  assert.equal(loadDiscoverClickedMedia('MANGA', storage).length, 1);
});

test('discoverClickedMedia recovers gracefully from corrupt storage JSON', () => {
  const backing = new Map<string, string>([
    [DISCOVER_CLICKED_MEDIA_STORAGE_KEY, '{not-valid-json'],
  ]);
  const storage: DiscoverSearchHistoryStorageLike = {
    getItem: (k) => backing.get(k) ?? null,
    setItem: (k, v) => {
      backing.set(k, v);
    },
  };
  assert.deepEqual(loadDiscoverClickedMedia('ANIME', storage), []);
  const saved = recordDiscoverClickedMedia('ANIME', makeMedia('21', 'ANIME', 'One Piece'), storage);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].title.english, 'One Piece');
});


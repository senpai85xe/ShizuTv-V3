import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureBrowseGenresHomeSections,
  filterHomeSectionsByMediaMode,
  formatHeroMetadata,
  formatHeroScore,
  formatHeroSlideCounter,
  getHeroCtaLabel,
  getHeroRankBadgeLabel,
  getStageCoverflowMetrics,
  HERO_BANNER_CATEGORY,
  HOME_SECTIONS_VERSION,
  isTrendingDiscoveryRow,
  migrateDefaultHomeSectionsOrder,
  reorderHomeSectionsWithinMediaMode,
  resolveHeroBannerStyle,
  selectHeroSlides,
  splitHomeSectionsByMediaMode,
  stripHtmlTags,
  wrapSlideIndex,
} from './heroBanner';
import { HomeSection, UnifiedMedia } from '../types/media';

const makeMedia = (id: string, overrides: Partial<UnifiedMedia> = {}): UnifiedMedia => ({
  id,
  type: 'ANIME',
  title: { english: `Anime ${id}` },
  format: 'TV',
  year: 2024,
  score: 8.5,
  genres: ['Action', 'Adventure', 'Fantasy'],
  banner: `https://example.com/banner-${id}.jpg`,
  cover: `https://example.com/cover-${id}.jpg`,
  ...overrides,
});

test('wrapSlideIndex wraps forward and backward cleanly', () => {
  assert.equal(wrapSlideIndex(0, -1, 5), 4);
  assert.equal(wrapSlideIndex(4, 1, 5), 0);
  assert.equal(wrapSlideIndex(2, 1, 5), 3);
  assert.equal(wrapSlideIndex(0, 1, 0), 0);
});

test('stripHtmlTags removes tags and normalizes whitespace', () => {
  assert.equal(
    stripHtmlTags('<p>A boy fights...<br/>for the &quot;right death&quot; &amp; hope.</p>'),
    'A boy fights... for the "right death" & hope.',
  );
  assert.equal(stripHtmlTags(null), '');
});

test('formatHeroMetadata outputs format, year, and up to 2 genres', () => {
  const parts = formatHeroMetadata(makeMedia('1'));
  assert.deepEqual(parts, ['TV', '2024', 'Action', 'Adventure']);
});

test('formatHeroScore formats valid scores as X.Y/10', () => {
  assert.equal(formatHeroScore(8.5), '8.5/10');
  assert.equal(formatHeroScore(9), '9.0/10');
  assert.equal(formatHeroScore(null), null);
  assert.equal(formatHeroScore(0), null);
});

test('getHeroCtaLabel distinguishes watch vs read media types', () => {
  assert.equal(getHeroCtaLabel('ANIME'), 'Watch now');
  assert.equal(getHeroCtaLabel('MANGA'), 'Read now');
});

test('selectHeroSlides deduplicates and caps slides', () => {
  const list = [
    makeMedia('1'),
    makeMedia('1'),
    makeMedia('2'),
    makeMedia('3', { banner: null, cover: null }),
    makeMedia('4'),
    makeMedia('5'),
    makeMedia('6'),
    makeMedia('7'),
  ];
  const selected = selectHeroSlides(list, 5);
  assert.deepEqual(
    selected.map((s) => s.id),
    ['1', '2', '4', '5', '6'],
  );
});

test('getHeroRankBadgeLabel displays Series for anime and Manga for manga', () => {
  assert.equal(getHeroRankBadgeLabel(0, 'ANIME'), '#1 in Series');
  assert.equal(getHeroRankBadgeLabel(1, 'MANGA'), '#2 in Manga');
});

test('filterHomeSectionsByMediaMode separates enabled Anime and Manga shelves cleanly', () => {
  const sections: HomeSection[] = [
    { id: 'cw', title: 'Continue Watching', type: 'continueMedia', disabled: false, targetMediaType: 'ANIME' },
    { id: 'ta', title: 'Trending Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'trending' },
    { id: 'cr', title: 'Continue Reading', type: 'continueMedia', disabled: false, targetMediaType: 'MANGA' },
    { id: 'tm', title: 'Trending Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'trending' },
    { id: 'pm', title: 'Popular Manga', type: 'discovery', disabled: true, targetMediaType: 'MANGA', trackerCategory: 'popular' },
  ];

  assert.deepEqual(
    filterHomeSectionsByMediaMode(sections, 'ANIME').map((s) => s.id),
    ['cw', 'ta'],
  );
  assert.deepEqual(
    filterHomeSectionsByMediaMode(sections, 'MANGA').map((s) => s.id),
    ['cr', 'tm'],
  );
  assert.equal(isTrendingDiscoveryRow(sections[1]!), true);
  assert.equal(isTrendingDiscoveryRow(sections[3]!), true);
  assert.equal(isTrendingDiscoveryRow(sections[0]!), false);
});

test('resolveHeroBannerStyle defaults to classic and preserves all 12 valid styles', () => {
  assert.equal(resolveHeroBannerStyle(undefined), 'classic');
  assert.equal(resolveHeroBannerStyle(null), 'classic');
  assert.equal(resolveHeroBannerStyle('unknown-style'), 'classic');
  assert.equal(resolveHeroBannerStyle('coverflow'), 'coverflow');
  assert.equal(resolveHeroBannerStyle('cinematic'), 'cinematic');
  assert.equal(resolveHeroBannerStyle('splitPoster'), 'splitPoster');
  assert.equal(resolveHeroBannerStyle('minimal'), 'minimal');
  assert.equal(resolveHeroBannerStyle('liquidGlass'), 'liquidGlass');
  assert.equal(resolveHeroBannerStyle('spotlightCard'), 'spotlightCard');
  assert.equal(resolveHeroBannerStyle('auroraSplit'), 'auroraSplit');
  assert.equal(resolveHeroBannerStyle('edgeCarousel'), 'edgeCarousel');
  assert.equal(resolveHeroBannerStyle('rankedDeck'), 'rankedDeck');
  assert.equal(resolveHeroBannerStyle('glassFrame'), 'glassFrame');
  assert.equal(resolveHeroBannerStyle('prismCoverflow'), 'prismCoverflow');
});

test('getStageCoverflowMetrics positions active, +/-1, and +/-2 fanning slides cleanly', () => {
  const center = getStageCoverflowMetrics(2, 2, 5);
  assert.equal(center.isActive, true);
  assert.equal(center.translateXPercent, 0);
  assert.equal(center.scale, 1);
  assert.equal(center.zIndex, 30);

  const rightNear = getStageCoverflowMetrics(3, 2, 5);
  assert.equal(rightNear.offset, 1);
  assert.equal(rightNear.visible, true);
  assert.ok(rightNear.translateXPercent > 0);
  assert.ok(rightNear.rotateYDeg < 0);
  assert.equal(rightNear.zIndex, 20);

  const leftFar = getStageCoverflowMetrics(0, 2, 5);
  assert.equal(leftFar.offset, -2);
  assert.equal(leftFar.visible, true);
  assert.ok(leftFar.translateXPercent < 0);
  assert.ok(leftFar.rotateYDeg > 0);
  assert.equal(leftFar.zIndex, 10);

  const hiddenFar = getStageCoverflowMetrics(3, 0, 7);
  assert.equal(hiddenFar.visible, false);
  assert.equal(hiddenFar.opacity, 0);
});

test('formatHeroSlideCounter formats zero-padded tabular counters safely', () => {
  assert.equal(formatHeroSlideCounter(0, 5), '01 / 05');
  assert.equal(formatHeroSlideCounter(4, 5), '05 / 05');
  assert.equal(formatHeroSlideCounter(9, 5), '05 / 05');
  assert.equal(formatHeroSlideCounter(0, 0), '00 / 00');
});

test('filterHomeSectionsByMediaMode and ensureBrowseGenresHomeSections handle browseGenres reliably', () => {
  const legacySections: HomeSection[] = [
    { id: 'continue-watching', title: 'Continue Watching', type: 'continueMedia', disabled: false, targetMediaType: 'ANIME' },
    { id: 'top-rated-anime', title: 'Top Rated Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'topRated' },
    { id: 'continue-reading', title: 'Continue Reading', type: 'continueMedia', disabled: false, targetMediaType: 'MANGA' },
    { id: 'top-rated-manga', title: 'Top Rated Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'topRated' },
  ];

  const migrated = ensureBrowseGenresHomeSections(legacySections);
  assert.deepEqual(
    migrated.map((s) => s.id),
    [
      'continue-watching',
      'top-rated-anime',
      'browse-genres-anime',
      'continue-reading',
      'top-rated-manga',
      'browse-genres-manga',
    ],
  );

  assert.deepEqual(
    filterHomeSectionsByMediaMode(migrated, 'ANIME').map((s) => s.id),
    ['continue-watching', 'top-rated-anime', 'browse-genres-anime'],
  );
  assert.deepEqual(
    filterHomeSectionsByMediaMode(migrated, 'MANGA').map((s) => s.id),
    ['continue-reading', 'top-rated-manga', 'browse-genres-manga'],
  );

  // Disabled browseGenres sections stay disabled and are not duplicated by migration
  const disabledMigrated = migrated.map((s) =>
    s.id === 'browse-genres-anime' ? { ...s, disabled: true } : s,
  );
  const reMigrated = ensureBrowseGenresHomeSections(disabledMigrated);
  assert.equal(reMigrated.length, migrated.length);
  assert.equal(
    filterHomeSectionsByMediaMode(reMigrated, 'ANIME').some((s) => s.id === 'browse-genres-anime'),
    false,
  );

  // Untargeted browseGenres works in both modes
  const universal: HomeSection[] = [
    { id: 'universal-genres', title: 'Browse by Genre', type: 'browseGenres', disabled: false },
  ];
  assert.equal(filterHomeSectionsByMediaMode(universal, 'ANIME').length, 1);
  assert.equal(filterHomeSectionsByMediaMode(universal, 'MANGA').length, 1);
});

test('HERO_BANNER_CATEGORY uses topRated (highest score) instead of trending', () => {
  assert.equal(HERO_BANNER_CATEGORY, 'topRated');
});

test('splitHomeSectionsByMediaMode, reorderHomeSectionsWithinMediaMode, and migrateDefaultHomeSectionsOrder preserve Anime/Manga isolation and default order', () => {
  const newDefault: HomeSection[] = [
    { id: 'continue-watching', title: 'Continue Watching', type: 'continueMedia', disabled: false, targetMediaType: 'ANIME' },
    { id: 'popular-anime', title: 'Popular Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'popular' },
    { id: 'trending-anime', title: 'Trending Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'trending' },
    { id: 'top-rated-anime', title: 'Top Rated Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'topRated' },
    { id: 'browse-genres-anime', title: 'Browse by Genre', type: 'browseGenres', disabled: false, targetMediaType: 'ANIME' },
    { id: 'continue-reading', title: 'Continue Reading', type: 'continueMedia', disabled: false, targetMediaType: 'MANGA' },
    { id: 'popular-manga', title: 'Popular Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'popular' },
    { id: 'trending-manga', title: 'Trending Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'trending' },
    { id: 'top-rated-manga', title: 'Top Rated Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'topRated' },
    { id: 'browse-genres-manga', title: 'Browse by Genre', type: 'browseGenres', disabled: false, targetMediaType: 'MANGA' },
  ];

  const { anime, manga } = splitHomeSectionsByMediaMode(newDefault);
  assert.deepEqual(
    anime.map((s) => s.id),
    ['continue-watching', 'popular-anime', 'trending-anime', 'top-rated-anime', 'browse-genres-anime'],
  );
  assert.deepEqual(
    manga.map((s) => s.id),
    ['continue-reading', 'popular-manga', 'trending-manga', 'top-rated-manga', 'browse-genres-manga'],
  );

  // Reordering within Anime does not affect Manga order
  const movedAnime = reorderHomeSectionsWithinMediaMode(newDefault, 'ANIME', 'browse-genres-anime', -1);
  assert.deepEqual(
    splitHomeSectionsByMediaMode(movedAnime).anime.map((s) => s.id),
    ['continue-watching', 'popular-anime', 'trending-anime', 'browse-genres-anime', 'top-rated-anime'],
  );
  assert.deepEqual(
    splitHomeSectionsByMediaMode(movedAnime).manga.map((s) => s.id),
    ['continue-reading', 'popular-manga', 'trending-manga', 'top-rated-manga', 'browse-genres-manga'],
  );

  // Migrating untouched previous default layout upgrades to new default while preserving disabled flags
  const oldDefault: HomeSection[] = [
    { id: 'continue-watching', title: 'Continue Watching', type: 'continueMedia', disabled: false, targetMediaType: 'ANIME' },
    { id: 'trending-anime', title: 'Trending Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'trending' },
    { id: 'browse-genres-anime', title: 'Browse by Genre', type: 'browseGenres', disabled: true, targetMediaType: 'ANIME' },
    { id: 'popular-anime', title: 'Popular Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'popular' },
    { id: 'top-rated-anime', title: 'Top Rated Anime', type: 'discovery', disabled: false, targetMediaType: 'ANIME', trackerCategory: 'topRated' },
    { id: 'continue-reading', title: 'Continue Reading', type: 'continueMedia', disabled: false, targetMediaType: 'MANGA' },
    { id: 'trending-manga', title: 'Trending Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'trending' },
    { id: 'browse-genres-manga', title: 'Browse by Genre', type: 'browseGenres', disabled: false, targetMediaType: 'MANGA' },
    { id: 'popular-manga', title: 'Popular Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'popular' },
    { id: 'top-rated-manga', title: 'Top Rated Manga', type: 'discovery', disabled: false, targetMediaType: 'MANGA', trackerCategory: 'topRated' },
  ];

  const upgraded = migrateDefaultHomeSectionsOrder(oldDefault, newDefault, null);
  assert.deepEqual(
    upgraded.map((s) => s.id),
    newDefault.map((s) => s.id),
  );
  assert.equal(upgraded.find((s) => s.id === 'browse-genres-anime')?.disabled, true);

  // Already on HOME_SECTIONS_VERSION leaves custom user order untouched
  const customV2 = reorderHomeSectionsWithinMediaMode(newDefault, 'MANGA', 'trending-manga', -1);
  const kept = migrateDefaultHomeSectionsOrder(customV2, newDefault, HOME_SECTIONS_VERSION);
  assert.deepEqual(kept.map((s) => s.id), customV2.map((s) => s.id));
});



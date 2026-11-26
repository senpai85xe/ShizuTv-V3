import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDiscoverCategoryGroups,
  buildHomeGenreDiscoverUrl,
  countDiscoverCategoryItems,
  CURATED_GENRE_CATEGORIES,
  DEFAULT_GENRE_CARD_STYLE,
  getGenreCardStyleDescription,
  getGenreCardStyleName,
  getGenreCategoryDescriptor,
  getHomeBrowseGenres,
  POPULAR_ANILIST_TAGS,
  resolveGenreCardStyle,
} from './genreMetadata';

test('resolveGenreCardStyle returns showcase by default and resolves all 5 valid styles', () => {
  assert.equal(DEFAULT_GENRE_CARD_STYLE, 'showcase');
  assert.equal(resolveGenreCardStyle(undefined), 'showcase');
  assert.equal(resolveGenreCardStyle('unknown'), 'showcase');

  const expected: Array<[string, string]> = [
    ['showcase', 'Category Spotlight'],
    ['mosaicGlass', 'Poster Mosaic'],
    ['editorialPill', 'Editorial Pill'],
    ['auroraStack', 'Aurora Glass'],
    ['classic', 'Gradient Tile'],
  ];

  for (const [id, name] of expected) {
    assert.equal(resolveGenreCardStyle(id), id);
    assert.equal(getGenreCardStyleName(id as never), name);
    assert.ok(getGenreCardStyleDescription(id as never).length > 0);
  }
});

test('all 12 Figma pictured genres preserve exact labels, icons, counts, covers, and filter mappings', () => {
  const expectedFigma: Array<{
    name: string;
    iconId: string;
    seriesCount: string;
    section: 'genres' | 'worlds';
    filterKind: 'genre' | 'tag';
    filterValue: string;
  }> = [
    { name: 'Action', iconId: 'swords', seriesCount: '5,372', section: 'genres', filterKind: 'genre', filterValue: 'Action' },
    { name: 'Adventure', iconId: 'compass', seriesCount: '2,112', section: 'genres', filterKind: 'genre', filterValue: 'Adventure' },
    { name: 'Fantasy', iconId: 'moonStar', seriesCount: '5,372', section: 'genres', filterKind: 'genre', filterValue: 'Fantasy' },
    { name: 'Comedy', iconId: 'comedyFace', seriesCount: '3,746', section: 'genres', filterKind: 'genre', filterValue: 'Comedy' },
    { name: 'Slice of life', iconId: 'coffee', seriesCount: '1,740', section: 'genres', filterKind: 'genre', filterValue: 'Slice of Life' },
    { name: 'Romance', iconId: 'dualHearts', seriesCount: '1,560', section: 'genres', filterKind: 'genre', filterValue: 'Romance' },
    { name: 'Drama', iconId: 'drama', seriesCount: '1,863', section: 'genres', filterKind: 'genre', filterValue: 'Drama' },
    { name: 'Mystery', iconId: 'detective', seriesCount: '720', section: 'genres', filterKind: 'genre', filterValue: 'Mystery' },
    { name: 'Thriller', iconId: 'pulseWatch', seriesCount: '347', section: 'genres', filterKind: 'genre', filterValue: 'Thriller' },
    { name: 'Supernatural', iconId: 'flame', seriesCount: '1,302', section: 'worlds', filterKind: 'genre', filterValue: 'Supernatural' },
    { name: 'Martial art', iconId: 'ninja', seriesCount: '721', section: 'worlds', filterKind: 'tag', filterValue: 'Martial Arts' },
    { name: 'Harem', iconId: 'haremRings', seriesCount: '301', section: 'worlds', filterKind: 'tag', filterValue: 'Male Harem' },
  ];

  for (const item of expectedFigma) {
    const desc = getGenreCategoryDescriptor(item.name);
    assert.equal(desc.label, item.name);
    assert.equal(desc.iconId, item.iconId);
    assert.equal(desc.seriesCount, item.seriesCount);
    assert.equal(desc.section, item.section);
    assert.equal(desc.filterKind, item.filterKind);
    assert.deepEqual(desc.filterValues, [item.filterValue]);
    assert.equal(desc.covers.length, 3);
    for (const url of desc.covers) {
      assert.ok(url.startsWith('https://s4.anilist.co/'), `Expected AniList CDN URL, got ${url}`);
    }
  }

  // Ensure every curated category has a distinct icon & gradient pair
  const iconSet = new Set(CURATED_GENRE_CATEGORIES.map((c) => c.iconId));
  assert.equal(iconSet.size, CURATED_GENRE_CATEGORIES.length);
});

test('buildDiscoverCategoryGroups splits GENRES & WORLDS AND SETTING, filters, and sorts', () => {
  const suggestedGroups = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: ['Action', 'Hentai', 'CustomExperimental'],
    tagsList: ['Isekai', 'Reincarnation'],
    categoryQuery: '',
    categorySort: 'suggested',
  });

  assert.equal(suggestedGroups.length, 2);
  assert.equal(suggestedGroups[0].title, 'GENRES');
  assert.equal(suggestedGroups[1].title, 'WORLDS AND SETTING');

  // Verify Figma top order
  assert.deepEqual(
    suggestedGroups[0].items.slice(0, 9).map((i) => i.label),
    [
      'Action',
      'Adventure',
      'Fantasy',
      'Comedy',
      'Slice of life',
      'Romance',
      'Drama',
      'Mystery',
      'Thriller',
    ],
  );
  assert.deepEqual(
    suggestedGroups[1].items.slice(0, 3).map((i) => i.label),
    ['Supernatural', 'Martial art', 'Harem'],
  );

  // Hentai is excluded; dynamic genre is appended cleanly
  const allLabels = suggestedGroups.flatMap((g) => g.items.map((i) => i.label));
  assert.equal(allLabels.includes('Hentai'), false);
  assert.equal(allLabels.includes('CustomExperimental'), true);

  // A to Z sort
  const azGroups = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: ['Action', 'Drama'],
    tagsList: [],
    categoryQuery: '',
    categorySort: 'az',
  });
  assert.equal(azGroups.length, 1);
  assert.equal(azGroups[0].items[0].label, 'Action');

  // Most popular sort
  const popGroups = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: [],
    tagsList: [],
    categoryQuery: '',
    categorySort: 'popular',
  });
  assert.equal(popGroups.length, 1);
  assert.ok(popGroups[0].items[0].numericCount >= popGroups[0].items[1].numericCount);

  // Search filtering
  const searchGroups = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: [],
    tagsList: [],
    categoryQuery: 'martial',
    categorySort: 'suggested',
  });
  assert.equal(searchGroups.length, 1);
  assert.equal(searchGroups[0].items.length, 1);
  assert.equal(searchGroups[0].items[0].label, 'Martial art');

  // Tags tab
  const tagGroups = buildDiscoverCategoryGroups({
    browseTab: 'tags',
    genresList: [],
    tagsList: ['Isekai', 'Time Loop'],
    categoryQuery: '',
    categorySort: 'suggested',
  });
  assert.equal(tagGroups.length, 1);
  assert.equal(tagGroups[0].items.length, 2);
  assert.equal(tagGroups[0].items[0].filterKind, 'tag');
});

test('Genres and Tags tabs remain non-overlapping and counts match rendered items exactly', () => {
  const genreGroups = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: ['Action', 'Comedy', 'Drama'],
    tagsList: [...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
  });
  const tagGroups = buildDiscoverCategoryGroups({
    browseTab: 'tags',
    genresList: ['Action', 'Comedy', 'Drama'],
    tagsList: ['Action', 'Martial Arts', 'Male Harem', ...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
  });

  const genreValues = new Set(
    genreGroups.flatMap((g) => g.items.flatMap((i) => i.filterValues.map((v) => v.toLowerCase()))),
  );
  const tagItems = tagGroups.flatMap((g) => g.items);

  assert.equal(countDiscoverCategoryItems(genreGroups), genreGroups.reduce((n, g) => n + g.items.length, 0));
  assert.equal(countDiscoverCategoryItems(tagGroups), tagItems.length);

  for (const tagItem of tagItems) {
    assert.equal(tagItem.filterKind, 'tag');
    for (const val of tagItem.filterValues) {
      assert.equal(
        genreValues.has(val.toLowerCase()),
        false,
        `Tag "${val}" must not duplicate an item already present in Genres`,
      );
    }
  }
});

test('Every Tag gets a distinct non-generic iconId and Anime vs Manga have distinct counts and covers for all Genres and Tags', () => {
  const animeGenres = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: ['Action', 'Comedy', 'Drama'],
    tagsList: [...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
    mediaType: 'ANIME',
  }).flatMap((g) => g.items);

  const mangaGenres = buildDiscoverCategoryGroups({
    browseTab: 'genres',
    genresList: ['Action', 'Comedy', 'Drama'],
    tagsList: [...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
    mediaType: 'MANGA',
  }).flatMap((g) => g.items);

  assert.equal(animeGenres.length, mangaGenres.length);
  for (let i = 0; i < animeGenres.length; i += 1) {
    const a = animeGenres[i]!;
    const m = mangaGenres[i]!;
    assert.notEqual(
      a.seriesCount,
      m.seriesCount,
      `Genre "${a.label}" should show a different count for Manga vs Anime`,
    );
    assert.notDeepEqual(
      a.covers,
      m.covers,
      `Genre "${a.label}" should show different 3-cover previews for Manga vs Anime`,
    );
  }

  const animeTags = buildDiscoverCategoryGroups({
    browseTab: 'tags',
    genresList: [],
    tagsList: [...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
    mediaType: 'ANIME',
  }).flatMap((g) => g.items);

  const mangaTags = buildDiscoverCategoryGroups({
    browseTab: 'tags',
    genresList: [],
    tagsList: [...POPULAR_ANILIST_TAGS],
    categoryQuery: '',
    categorySort: 'suggested',
    mediaType: 'MANGA',
  }).flatMap((g) => g.items);

  const seenTagIcons = new Set<string>();
  for (let i = 0; i < animeTags.length; i += 1) {
    const a = animeTags[i]!;
    const m = mangaTags[i]!;
    assert.notEqual(a.iconId, 'tag', `Tag "${a.label}" must not use generic fallback tag icon`);
    assert.equal(
      seenTagIcons.has(a.iconId),
      false,
      `Tag "${a.label}" repeated iconId "${a.iconId}"`,
    );
    seenTagIcons.add(a.iconId);

    assert.notEqual(
      a.seriesCount,
      m.seriesCount,
      `Tag "${a.label}" should show a different count for Manga vs Anime`,
    );
    assert.notDeepEqual(
      a.covers,
      m.covers,
      `Tag "${a.label}" should show different 3-cover previews for Manga vs Anime`,
    );
  }
});

test('getHomeBrowseGenres returns ordered curated genres with Anime/Manga variants and builds Discover URLs', () => {
  const animeGenres = getHomeBrowseGenres('ANIME');
  const mangaGenres = getHomeBrowseGenres('MANGA');

  assert.equal(animeGenres.length, CURATED_GENRE_CATEGORIES.length);
  assert.equal(mangaGenres.length, CURATED_GENRE_CATEGORIES.length);
  assert.equal(animeGenres[0]!.label, 'Action');
  assert.equal(animeGenres[1]!.label, 'Adventure');
  assert.notEqual(animeGenres[0]!.seriesCount, mangaGenres[0]!.seriesCount);
  assert.notDeepEqual(animeGenres[0]!.covers, mangaGenres[0]!.covers);

  const action = animeGenres.find((g) => g.id === 'action')!;
  const martialArt = mangaGenres.find((g) => g.id === 'martial-art')!;
  assert.equal(
    buildHomeGenreDiscoverUrl(action, 'ANIME'),
    '/discover?type=ANIME&genres=Action',
  );
  assert.equal(
    buildHomeGenreDiscoverUrl(martialArt, 'MANGA'),
    '/discover?type=MANGA&tags=Martial+Arts',
  );
});



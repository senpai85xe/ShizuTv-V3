import { MediaType, UnifiedMedia } from '../types/media';
import {
  CURATED_GENRE_CATEGORIES,
  GenreCategoryDescriptor,
  getGenreCategoryDescriptor,
} from './genreMetadata';

export interface GenreStatsSummary {
  totalSeries: number;
  ongoingSeries: number;
  completedSeries: number;
  newThisMonth: number;
}

export interface LiveGenreCounts {
  total?: number | null;
  ongoing?: number | null;
  completed?: number | null;
  newThisMonth?: number | null;
}

const GENRE_EDITORIAL_DESCRIPTIONS: Record<string, string> = {
  action:
    'Action stories move fast, from high-stakes sword clashes and kinetic battles to chases across rooftops and warzones. Expect heroes who train relentlessly, take heavy hits, and rise back up for the next round.',
  adventure:
    'Adventure follows explorers, crews, and wanderers crossing uncharted seas, ancient ruins, and distant realms. Every arc trades comfort for discovery, camaraderie, and the thrill of the horizon.',
  fantasy:
    'Fantasy builds worlds governed by arcane laws, mythic beasts, and forgotten empires. Whether grounded in quiet magic or sweeping prophecies, the rules of wonder shape every conflict.',
  comedy:
    'Comedy thrives on razor-sharp timing, chaotic ensembles, and absurd misunderstandings that escalate at full speed. Built to lift the mood with deadpan punchlines, slapstick, and playful charm.',
  'slice-of-life':
    'Slice of life slows the clock to savor everyday routines, after-school clubs, quiet cafes, and small turning points. Warmth, subtle humor, and human connection take center stage.',
  romance:
    'Romance traces unspoken glances, slow-burn confessions, and relationships tested by timing and pride. From tender first love to heartfelt devotion, every beat revolves around emotional chemistry.',
  drama:
    'Drama spotlights people under pressure—torn loyalties, second chances, and choices with lasting weight. Rich character arcs and quiet confrontations drive unforgettable emotional payoffs.',
  mystery:
    'Mystery pulls you into locked rooms, tangled alibis, and secrets buried beneath polite appearances. Every detail matters as investigators piece together the truth before time runs out.',
  thriller:
    'Thriller ratchets up tension scene by scene with cat-and-mouse mind games, ticking clocks, and sudden reversals. Trust is fragile, and one misstep changes everything.',
  horror:
    'Horror confronts the uncanny, claustrophobic dread, and survival against forces beyond reason. Atmospheric shadows and creeping paranoia linger long after the credits roll.',
  psychological:
    'Psychological stories turn inward into fractured perceptions, high-stakes wagers, and battles of intellect. Expect unreliable truths, moral gray zones, and characters pushed to their limits.',
  sports:
    'Sports series capture sweat, discipline, teamwork, and the razor-thin margin between victory and heartbreak. Rivalries forge lifelong bonds as underdogs chase championship glory.',
  music:
    'Music follows bands, soloists, and ensembles finding their voice through late-night rehearsals and electric stage performances. Every chord carries ambition, vulnerability, and triumph.',
  ecchi:
    'Ecchi blends bold fanservice and cheeky misunderstandings with upbeat comedy and spirited casts. Lighthearted, mischievous, and unapologetically playful from start to finish.',
  supernatural:
    'Supernatural tales weave spirits, curses, yokai, and hidden powers directly into the everyday world. Shadows hide ancient pacts where ordinary lives collide with the otherworldly.',
  'martial-art':
    'Martial art celebrates discipline, stances, rival dojos, and battles decided by technique and willpower. Watch fighters refine their craft through grueling tournaments and master-student legacies.',
  harem:
    'Harem centers on one protagonist caught between contrasting personalities, playful rivalries, and romantic chaos. Expect lively ensemble banter, heartfelt moments, and tangled feelings.',
  'sci-fi':
    'Sci-Fi reaches into orbital colonies, cybernetic cities, and timelines warped by bold technology. Speculative ideas collide with human questions about identity, survival, and the future.',
  mecha:
    'Mecha pairs towering piloted machines with the human cost of warfare, politics, and split-second courage in the cockpit. Sleek engineering meets dramatic aerial and space combat.',
  'mahou-shoujo':
    'Mahou Shoujo transforms ordinary heroes through radiant vows, teamwork, and courage against encroaching darkness. Hopeful spectacle often hides surprising emotional depth beneath the sparkle.',
};

interface CuratedPairingSpec {
  paired: ReadonlyArray<{ name: string; kind: 'genre' | 'tag' }>;
  relatedIds: ReadonlyArray<string>;
}

const CURATED_PAIRINGS: Record<string, CuratedPairingSpec> = {
  action: {
    paired: [
      { name: 'Adventure', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Supernatural', kind: 'genre' },
      { name: 'Sci-Fi', kind: 'genre' },
      { name: 'Shounen', kind: 'tag' },
      { name: 'Swordplay', kind: 'tag' },
      { name: 'Martial Arts', kind: 'tag' },
      { name: 'Drama', kind: 'genre' },
    ],
    relatedIds: ['adventure', 'fantasy', 'martial-art', 'supernatural'],
  },
  adventure: {
    paired: [
      { name: 'Action', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'Isekai', kind: 'tag' },
      { name: 'Sci-Fi', kind: 'genre' },
      { name: 'Magic', kind: 'tag' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Shounen', kind: 'tag' },
    ],
    relatedIds: ['action', 'fantasy', 'sci-fi', 'supernatural'],
  },
  fantasy: {
    paired: [
      { name: 'Action', kind: 'genre' },
      { name: 'Adventure', kind: 'genre' },
      { name: 'Magic', kind: 'tag' },
      { name: 'Isekai', kind: 'tag' },
      { name: 'Supernatural', kind: 'genre' },
      { name: 'Romance', kind: 'genre' },
      { name: 'Reincarnation', kind: 'tag' },
      { name: 'Drama', kind: 'genre' },
    ],
    relatedIds: ['adventure', 'supernatural', 'action', 'mahou-shoujo'],
  },
  comedy: {
    paired: [
      { name: 'Slice of Life', kind: 'genre' },
      { name: 'Romance', kind: 'genre' },
      { name: 'School', kind: 'tag' },
      { name: 'Action', kind: 'genre' },
      { name: 'Parody', kind: 'tag' },
      { name: 'Slapstick', kind: 'tag' },
      { name: 'Ecchi', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
    ],
    relatedIds: ['slice-of-life', 'romance', 'ecchi', 'harem'],
  },
  'slice-of-life': {
    paired: [
      { name: 'Comedy', kind: 'genre' },
      { name: 'Romance', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'School', kind: 'tag' },
      { name: 'Music', kind: 'genre' },
      { name: 'Coming of Age', kind: 'tag' },
      { name: 'Food', kind: 'tag' },
      { name: 'Family Life', kind: 'tag' },
    ],
    relatedIds: ['comedy', 'romance', 'music', 'drama'],
  },
  romance: {
    paired: [
      { name: 'Comedy', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Slice of Life', kind: 'genre' },
      { name: 'School', kind: 'tag' },
      { name: 'Male Harem', kind: 'tag' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Shoujo', kind: 'tag' },
      { name: 'Coming of Age', kind: 'tag' },
    ],
    relatedIds: ['comedy', 'drama', 'slice-of-life', 'harem'],
  },
  drama: {
    paired: [
      { name: 'Romance', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Slice of Life', kind: 'genre' },
      { name: 'Mystery', kind: 'genre' },
      { name: 'Tragedy', kind: 'tag' },
      { name: 'Coming of Age', kind: 'tag' },
      { name: 'Historical', kind: 'tag' },
    ],
    relatedIds: ['romance', 'psychological', 'mystery', 'thriller'],
  },
  mystery: {
    paired: [
      { name: 'Thriller', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Supernatural', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Horror', kind: 'genre' },
      { name: 'Detective', kind: 'tag' },
      { name: 'Seinen', kind: 'tag' },
      { name: 'Crime', kind: 'tag' },
    ],
    relatedIds: ['thriller', 'psychological', 'horror', 'supernatural'],
  },
  thriller: {
    paired: [
      { name: 'Mystery', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Horror', kind: 'genre' },
      { name: 'Sci-Fi', kind: 'genre' },
      { name: 'Survival', kind: 'tag' },
      { name: 'Seinen', kind: 'tag' },
    ],
    relatedIds: ['mystery', 'psychological', 'horror', 'action'],
  },
  horror: {
    paired: [
      { name: 'Supernatural', kind: 'genre' },
      { name: 'Thriller', kind: 'genre' },
      { name: 'Mystery', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Gore', kind: 'tag' },
      { name: 'Survival', kind: 'tag' },
      { name: 'Demons', kind: 'tag' },
    ],
    relatedIds: ['thriller', 'psychological', 'mystery', 'supernatural'],
  },
  psychological: {
    paired: [
      { name: 'Drama', kind: 'genre' },
      { name: 'Thriller', kind: 'genre' },
      { name: 'Mystery', kind: 'genre' },
      { name: 'Sci-Fi', kind: 'genre' },
      { name: 'Horror', kind: 'genre' },
      { name: 'Seinen', kind: 'tag' },
      { name: 'Tragedy', kind: 'tag' },
      { name: 'Anti-Hero', kind: 'tag' },
    ],
    relatedIds: ['thriller', 'mystery', 'drama', 'horror'],
  },
  sports: {
    paired: [
      { name: 'Drama', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'School', kind: 'tag' },
      { name: 'Shounen', kind: 'tag' },
      { name: 'Coming of Age', kind: 'tag' },
      { name: 'Slice of Life', kind: 'genre' },
      { name: 'Martial Arts', kind: 'tag' },
      { name: 'Action', kind: 'genre' },
    ],
    relatedIds: ['drama', 'comedy', 'martial-art', 'slice-of-life'],
  },
  music: {
    paired: [
      { name: 'Slice of Life', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'Romance', kind: 'genre' },
      { name: 'Idol', kind: 'tag' },
      { name: 'Band', kind: 'tag' },
      { name: 'School', kind: 'tag' },
      { name: 'Coming of Age', kind: 'tag' },
    ],
    relatedIds: ['slice-of-life', 'drama', 'comedy', 'romance'],
  },
  ecchi: {
    paired: [
      { name: 'Comedy', kind: 'genre' },
      { name: 'Romance', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Male Harem', kind: 'tag' },
      { name: 'School', kind: 'tag' },
      { name: 'Supernatural', kind: 'genre' },
      { name: 'Isekai', kind: 'tag' },
    ],
    relatedIds: ['harem', 'comedy', 'romance', 'fantasy'],
  },
  supernatural: {
    paired: [
      { name: 'Action', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Mystery', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Horror', kind: 'genre' },
      { name: 'Demons', kind: 'tag' },
      { name: 'Urban Fantasy', kind: 'tag' },
      { name: 'Romance', kind: 'genre' },
    ],
    relatedIds: ['fantasy', 'mystery', 'horror', 'action'],
  },
  'martial-art': {
    paired: [
      { name: 'Action', kind: 'genre' },
      { name: 'Adventure', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'Shounen', kind: 'tag' },
      { name: 'Cultivation', kind: 'tag' },
      { name: 'Swordplay', kind: 'tag' },
      { name: 'Super Power', kind: 'tag' },
    ],
    relatedIds: ['action', 'adventure', 'sports', 'supernatural'],
  },
  harem: {
    paired: [
      { name: 'Romance', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'Ecchi', kind: 'genre' },
      { name: 'Fantasy', kind: 'genre' },
      { name: 'School', kind: 'tag' },
      { name: 'Isekai', kind: 'tag' },
      { name: 'Action', kind: 'genre' },
      { name: 'Slice of Life', kind: 'genre' },
    ],
    relatedIds: ['ecchi', 'romance', 'comedy', 'fantasy'],
  },
  'sci-fi': {
    paired: [
      { name: 'Action', kind: 'genre' },
      { name: 'Mecha', kind: 'genre' },
      { name: 'Adventure', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Space', kind: 'tag' },
      { name: 'Cyberpunk', kind: 'tag' },
      { name: 'Thriller', kind: 'genre' },
    ],
    relatedIds: ['mecha', 'action', 'psychological', 'adventure'],
  },
  mecha: {
    paired: [
      { name: 'Sci-Fi', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Military', kind: 'tag' },
      { name: 'Space', kind: 'tag' },
      { name: 'Adventure', kind: 'genre' },
      { name: 'Psychological', kind: 'genre' },
      { name: 'Robots', kind: 'tag' },
    ],
    relatedIds: ['sci-fi', 'action', 'drama', 'adventure'],
  },
  'mahou-shoujo': {
    paired: [
      { name: 'Fantasy', kind: 'genre' },
      { name: 'Action', kind: 'genre' },
      { name: 'Comedy', kind: 'genre' },
      { name: 'Drama', kind: 'genre' },
      { name: 'Magic', kind: 'tag' },
      { name: 'School', kind: 'tag' },
      { name: 'Shoujo', kind: 'tag' },
      { name: 'Psychological', kind: 'genre' },
    ],
    relatedIds: ['fantasy', 'music', 'romance', 'supernatural'],
  },
};

function hashString(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 33 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getGenreEditorialDescription(
  descriptor: GenreCategoryDescriptor,
  mediaType: MediaType,
): string {
  const base = GENRE_EDITORIAL_DESCRIPTIONS[descriptor.id];
  if (base) {
    if (mediaType === 'MANGA') {
      return base
        .replace(/\bafter the credits roll\b/gi, 'long after the final chapter')
        .replace(/\bepisode\b/gi, 'chapter');
    }
    return base;
  }

  const unitLabel = mediaType === 'MANGA' ? 'manga and webtoon series' : 'anime series';
  if (descriptor.filterKind === 'tag') {
    return `${descriptor.tagline} Browse top-trending and highest-rated ${unitLabel} tagged with ${descriptor.label}, along with closely paired themes and categories.`;
  }
  return `${descriptor.tagline} Explore standout ${descriptor.label.toLowerCase()} ${unitLabel}, from weekly trending hits to all-time viewer favorites.`;
}

export function resolveGenreStats(params: {
  descriptor: GenreCategoryDescriptor;
  mediaType: MediaType;
  liveCounts?: LiveGenreCounts | null;
}): GenreStatsSummary {
  const { descriptor, mediaType, liveCounts } = params;
  const seed = hashString(`${descriptor.id}:${mediaType}`);

  const rawTotal =
    typeof liveCounts?.total === 'number' && Number.isFinite(liveCounts.total) && liveCounts.total > 0
      ? liveCounts.total
      : null;

  // AniList caps pageInfo.total at 5000 for broad categories; prefer curated exact count when >= 5000
  const totalSeries =
    rawTotal !== null && rawTotal < 5000
      ? Math.max(rawTotal, descriptor.numericCount > 5000 ? descriptor.numericCount : rawTotal)
      : Math.max(1, descriptor.numericCount);

  const fallbackOngoingRatio = mediaType === 'MANGA' ? 0.34 : 0.08 + (seed % 6) * 0.01;
  const ongoingSeries =
    typeof liveCounts?.ongoing === 'number' &&
    Number.isFinite(liveCounts.ongoing) &&
    liveCounts.ongoing >= 0 &&
    liveCounts.ongoing < 5000
      ? Math.min(totalSeries, liveCounts.ongoing)
      : Math.max(1, Math.round(totalSeries * fallbackOngoingRatio));

  const rawCompleted =
    typeof liveCounts?.completed === 'number' &&
    Number.isFinite(liveCounts.completed) &&
    liveCounts.completed >= 0
      ? liveCounts.completed
      : null;

  const fallbackCompletedRatio = mediaType === 'MANGA' ? 0.56 : 0.78 + (seed % 7) * 0.01;
  const maxPossibleCompleted = Math.max(0, totalSeries - ongoingSeries);
  const completedSeries =
    rawCompleted !== null && rawCompleted < 5000
      ? Math.min(maxPossibleCompleted, rawCompleted)
      : Math.min(maxPossibleCompleted, Math.max(1, Math.round(totalSeries * fallbackCompletedRatio)));

  const rawNewThisMonth =
    typeof liveCounts?.newThisMonth === 'number' &&
    Number.isFinite(liveCounts.newThisMonth) &&
    liveCounts.newThisMonth >= 0
      ? liveCounts.newThisMonth
      : null;

  const newThisMonth =
    rawNewThisMonth !== null && rawNewThisMonth < 5000
      ? rawNewThisMonth
      : Math.max(2, Math.min(ongoingSeries, Math.round(totalSeries * (0.012 + (seed % 5) * 0.004))));

  return {
    totalSeries,
    ongoingSeries,
    completedSeries,
    newThisMonth,
  };
}

export function buildOftenPairedCategories(
  descriptor: GenreCategoryDescriptor,
  mediaType: 'ANIME' | 'MANGA',
  sampledMedia: ReadonlyArray<UnifiedMedia> = [],
  limit = 8,
): GenreCategoryDescriptor[] {
  const currentFilterSet = new Set(descriptor.filterValues.map((v) => v.toLowerCase()));
  currentFilterSet.add(descriptor.label.toLowerCase());
  currentFilterSet.add(descriptor.id.toLowerCase());

  const result: GenreCategoryDescriptor[] = [];
  const seenIds = new Set<string>([descriptor.id]);

  const tryPush = (name: string, kind: 'genre' | 'tag') => {
    if (result.length >= limit) return;
    const lower = name.trim().toLowerCase();
    if (!lower || lower === 'hentai' || currentFilterSet.has(lower)) return;
    const candidate = getGenreCategoryDescriptor(name, kind, mediaType);
    if (seenIds.has(candidate.id) || currentFilterSet.has(candidate.label.toLowerCase())) return;
    seenIds.add(candidate.id);
    result.push(candidate);
  };

  // 1. Dynamically rank genres & high-rank tags co-occurring in live media items when available
  if (sampledMedia.length > 0) {
    const genreCounts = new Map<string, number>();
    const tagCounts = new Map<string, number>();

    for (const item of sampledMedia) {
      for (const g of item.genres ?? []) {
        if (!g || g.toLowerCase() === 'hentai' || currentFilterSet.has(g.toLowerCase())) continue;
        genreCounts.set(g, (genreCounts.get(g) ?? 0) + 1);
      }
      for (const t of item.tags ?? []) {
        if (!t?.name || currentFilterSet.has(t.name.toLowerCase())) continue;
        if (typeof t.rank === 'number' && t.rank < 55) continue;
        tagCounts.set(t.name, (tagCounts.get(t.name) ?? 0) + 1);
      }
    }

    const topDynamicGenres = Array.from(genreCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => ({ name, kind: 'genre' as const }));

    const topDynamicTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([name]) => ({ name, kind: 'tag' as const }));

    for (const entry of [...topDynamicGenres, ...topDynamicTags]) {
      tryPush(entry.name, entry.kind);
    }
  }

  // 2. Fill remaining slots with curated pairings for consistent depth
  const curated = CURATED_PAIRINGS[descriptor.id];
  if (curated) {
    for (const item of curated.paired) {
      tryPush(item.name, item.kind);
    }
  }

  // 3. Fallback pool if tag/custom genre still has fewer than limit
  for (const fallback of CURATED_GENRE_CATEGORIES) {
    if (result.length >= limit) break;
    if (seenIds.has(fallback.id)) continue;
    tryPush(fallback.filterValues[0] || fallback.label, fallback.filterKind);
  }

  return result;
}

export function buildRelatedCategoryCards(
  descriptor: GenreCategoryDescriptor,
  mediaType: 'ANIME' | 'MANGA',
  pairedCategories: ReadonlyArray<GenreCategoryDescriptor> = [],
  limit = 4,
): GenreCategoryDescriptor[] {
  const result: GenreCategoryDescriptor[] = [];
  const seenIds = new Set<string>([descriptor.id]);

  const curated = CURATED_PAIRINGS[descriptor.id];
  if (curated) {
    for (const relId of curated.relatedIds) {
      if (result.length >= limit) break;
      const found = CURATED_GENRE_CATEGORIES.find((c) => c.id === relId);
      if (found && !seenIds.has(found.id)) {
        seenIds.add(found.id);
        result.push(getGenreCategoryDescriptor(found.filterValues[0] || found.label, found.filterKind, mediaType));
      }
    }
  }

  for (const paired of pairedCategories) {
    if (result.length >= limit) break;
    if (!seenIds.has(paired.id)) {
      seenIds.add(paired.id);
      result.push(paired);
    }
  }

  for (const cat of CURATED_GENRE_CATEGORIES) {
    if (result.length >= limit) break;
    if (!seenIds.has(cat.id)) {
      seenIds.add(cat.id);
      result.push(getGenreCategoryDescriptor(cat.filterValues[0] || cat.label, cat.filterKind, mediaType));
    }
  }

  return result;
}

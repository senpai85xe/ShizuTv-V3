import {
  AdultContentMode,
  CalendarEntry,
  LibraryEntry,
  MediaCharacter,
  MediaStaff,
  MediaType,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  TrackedStatus,
  TrackerCategory,
  TrackerProfile,
  UnifiedMedia,
} from '../types/media';

import { resolveWithRecentCache } from '../utils/recentContentCache';
import {
  getDiscoverCategorySpotlightCount,
  POPULAR_ANILIST_TAGS,
} from '../utils/genreMetadata';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';

// In-memory cache matching ShonenX's CacheManager
const memoryCache = new Map<string, { expires: number; data: unknown }>();
const exactTotalCache = new Map<string, { expires: number; total: number }>();
const exactTotalInFlight = new Map<string, Promise<number | undefined>>();

async function gqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  token?: string | null,
  cacheMinutes = 15,
): Promise<T> {
  const cacheKey = `${query.slice(0, 80)}:${JSON.stringify(variables)}:${token ? 'auth' : 'anon'}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);
  if (cached && cached.expires > now && !token) {
    return cached.data as T;
  }

  const executeFetch = async (): Promise<T> => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(ANILIST_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AniList API ${res.status}: ${errText || res.statusText}`);
    }

    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message || 'AniList GraphQL error');
    }

    return json.data as T;
  };

  if (!token && cacheMinutes > 0) {
    const data = await resolveWithRecentCache<T>({
      key: cacheKey,
      ttlMs: cacheMinutes * 60 * 1000,
      fetcher: executeFetch,
    });
    memoryCache.set(cacheKey, {
      expires: now + cacheMinutes * 60 * 1000,
      data,
    });
    return data;
  }

  return executeFetch();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapAniListMedia(m: any): UnifiedMedia {
  const mediaType: MediaType = m.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const airingAt = m.nextAiringEpisode?.airingAt
    ? new Date(m.nextAiringEpisode.airingAt * 1000).toISOString()
    : null;

  return {
    id: String(m.id),
    type: mediaType,
    providerId: 'anilist',
    idMal: m.idMal ? String(m.idMal) : null,
    externalIds: {
      anilist: String(m.id),
      ...(m.idMal ? { mal: String(m.idMal) } : {}),
    },
    title: {
      english: m.title?.english ?? null,
      romaji: m.title?.romaji ?? null,
      native: m.title?.native ?? null,
    },
    format: m.format ?? null,
    cover: m.coverImage?.extraLarge || m.coverImage?.large || null,
    banner: m.bannerImage || null,
    description: m.description ?? null,
    score: typeof m.averageScore === 'number' ? m.averageScore / 10 : null,
    genres: Array.isArray(m.genres) ? m.genres : [],
    tags: Array.isArray(m.tags)
      ? m.tags.map((t: { id: number; name: string; category?: string; rank?: number }) => ({
          id: String(t.id),
          name: t.name,
          category: t.category || 'General',
          rank: typeof t.rank === 'number' ? t.rank : null,
        }))
      : [],
    isAdult: m.isAdult ?? false,
    status: m.status ?? null,
    episodes: m.episodes ?? null,
    chapters: m.chapters ?? null,
    volumes: m.volumes ?? null,
    duration: m.duration ?? null,
    source: m.source ?? null,
    popularity: m.popularity ?? null,
    favourites: m.favourites ?? null,
    studios: Array.isArray(m.studios?.nodes)
      ? m.studios.nodes.map((s: { name: string }) => s.name)
      : [],
    synonyms: Array.isArray(m.synonyms) ? m.synonyms : [],
    season: m.season ?? null,
    year: m.seasonYear ?? m.startDate?.year ?? null,
    trailer:
      m.trailer?.site === 'youtube' && m.trailer?.id
        ? `https://www.youtube.com/watch?v=${m.trailer.id}`
        : null,
    airingAt,
    nextEpisode: m.nextAiringEpisode?.episode ?? null,
    externalLinks: Array.isArray(m.externalLinks)
      ? m.externalLinks.map((l: { id: number; url: string; site: string; icon?: string }) => ({
          id: String(l.id),
          url: l.url,
          site: l.site,
          icon: l.icon ?? null,
        }))
      : [],
    characters: Array.isArray(m.characters?.edges)
      ? m.characters.edges.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (edge: any): MediaCharacter => ({
            id: String(edge.node?.id ?? ''),
            name: edge.node?.name?.full ?? 'Unknown',
            nativeName: edge.node?.name?.native ?? null,
            role: edge.role ?? null,
            image: edge.node?.image?.large ?? null,
            description: edge.node?.description ?? null,
            voiceActorName: edge.voiceActors?.[0]?.name?.full ?? null,
            voiceActorImage: edge.voiceActors?.[0]?.image?.large ?? null,
          }),
        )
      : [],
    staff: Array.isArray(m.staff?.edges)
      ? m.staff.edges.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (edge: any): MediaStaff => ({
            id: String(edge.node?.id ?? ''),
            name: edge.node?.name?.full ?? 'Unknown',
            role: edge.role ?? null,
            image: edge.node?.image?.large ?? null,
          }),
        )
      : [],
    relations: Array.isArray(m.relations?.edges)
      ? m.relations.edges
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((e: any) => e.node)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((e: any) => ({
            ...mapAniListMedia(e.node),
            relationType: e.relationType ?? null,
          }))
      : [],
    recommendations: Array.isArray(m.recommendations?.nodes)
      ? m.recommendations.nodes
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((n: any) => n.mediaRecommendation)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((n: any) => mapAniListMedia(n.mediaRecommendation))
      : [],
    streamingEpisodes: Array.isArray(m.streamingEpisodes)
      ? m.streamingEpisodes.map(
          (ep: { title?: string; thumbnail?: string; url?: string; site?: string }) => ({
            title: ep.title ?? '',
            thumbnail: ep.thumbnail ?? null,
            url: ep.url ?? null,
            site: ep.site ?? null,
          }),
        )
      : [],
  };
}

function adultClause(mode: AdultContentMode): string {
  if (mode === 'safe') return ', isAdult: false';
  if (mode === 'adultOnly') return ', isAdult: true';
  return '';
}

function categoryToSort(category: TrackerCategory): string {
  switch (category) {
    case 'trending':
      return 'TRENDING_DESC';
    case 'popular':
      return 'POPULARITY_DESC';
    case 'topRated':
      return 'SCORE_DESC';
    case 'recentlyUpdated':
      return 'UPDATED_AT_DESC';
  }
}

export async function fetchAniListCategory(
  category: TrackerCategory,
  mediaType: MediaType,
  adultMode: AdultContentMode = 'safe',
  page = 1,
  perPage = 20,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  const gqlType = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const formatFilter = gqlType === 'MANGA' ? ', format_not: NOVEL' : '';
  const sort = categoryToSort(category);

  const query = `
    query($page: Int, $perPage: Int, $type: MediaType, $sort: [MediaSort]) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { hasNextPage }
        media(type: $type, sort: $sort ${adultClause(adultMode)} ${formatFilter}) {
          id
          idMal
          type
          format
          title { english romaji native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { page, perPage, type: gqlType, sort: [sort] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (data?.Page?.media ?? []).filter((m: any) => String(m?.format || '').toUpperCase() !== 'NOVEL');
  return {
    items: list.map(mapAniListMedia),
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
  };
}

export interface AniListSearchParams {
  query?: string;
  type: MediaType;
  page?: number;
  perPage?: number;
  genres?: string[];
  tags?: string[];
  sort?: SearchSort;
  status?: SearchStatusFilter;
  format?: SearchFormatFilter;
  adultMode?: AdultContentMode;
}

const ANILIST_COUNT_PROBE_QUERY = `
  query(
    $search: String,
    $page: Int,
    $perPage: Int,
    $type: MediaType!,
    $genre_in: [String],
    $tag_in: [String],
    $status_in: [MediaStatus],
    $format_in: [MediaFormat],
    $sort: [MediaSort]
  ) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      media(
        search: $search
        type: $type
        genre_in: $genre_in
        tag_in: $tag_in
        status_in: $status_in
        format_in: $format_in
        sort: $sort
      ) {
        id
        format
      }
    }
  }
`;

function buildCountProbeQuery(gqlType: 'ANIME' | 'MANGA', adultMode: AdultContentMode): string {
  const extraFilters = `${gqlType === 'MANGA' ? 'format_not: NOVEL' : ''} ${adultClause(adultMode)}`;
  return ANILIST_COUNT_PROBE_QUERY.replace('sort: $sort', `sort: $sort ${extraFilters}`);
}

async function probeAniListPageCount(
  probeQuery: string,
  baseVars: Record<string, unknown>,
  page: number,
  perPage = 50,
): Promise<{ count: number; hasNextPage: boolean; rawTotal?: number }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(
    probeQuery,
    { ...baseVars, page, perPage },
    undefined,
    30,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (data?.Page?.media ?? []).filter((m: any) => String(m?.format || '').toUpperCase() !== 'NOVEL');
  const rawTotal = data?.Page?.pageInfo?.total;
  return {
    count: list.length,
    hasNextPage: Boolean(data?.Page?.pageInfo?.hasNextPage),
    rawTotal: typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined,
  };
}

async function exactCountUnder5000(
  probeQuery: string,
  baseVars: Record<string, unknown>,
): Promise<{ total: number; exceeded5000: boolean }> {
  const p1 = await probeAniListPageCount(probeQuery, baseVars, 1, 50);
  if (!p1.hasNextPage) {
    return { total: p1.count, exceeded5000: false };
  }

  const p100 = await probeAniListPageCount(probeQuery, baseVars, 100, 50);
  if (p100.count === 50 && p100.hasNextPage) {
    return { total: 5000, exceeded5000: true };
  }
  if (p100.count > 0 && !p100.hasNextPage) {
    return { total: 99 * 50 + p100.count, exceeded5000: false };
  }

  let lo = 2;
  let hi = 99;
  let bestPage = 1;
  let bestCount = p1.count;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const probe = await probeAniListPageCount(probeQuery, baseVars, mid, 50);
    if (probe.count > 0) {
      bestPage = mid;
      bestCount = probe.count;
      if (!probe.hasNextPage) break;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { total: (bestPage - 1) * 50 + bestCount, exceeded5000: false };
}

async function resolveAniListExactTotal(params: {
  gqlType: 'ANIME' | 'MANGA';
  adultMode: AdultContentMode;
  baseVars: Record<string, unknown>;
  searchParams: AniListSearchParams;
}): Promise<number | undefined> {
  const { gqlType, adultMode, baseVars, searchParams } = params;
  const cacheKey = JSON.stringify({ gqlType, adultMode, ...baseVars });
  const now = Date.now();
  const cached = exactTotalCache.get(cacheKey);
  if (cached && cached.expires > now) {
    return cached.total;
  }

  const existingPromise = exactTotalInFlight.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const task = (async (): Promise<number | undefined> => {
    try {
      const probeQuery = buildCountProbeQuery(gqlType, adultMode);
      const { total, exceeded5000 } = await exactCountUnder5000(probeQuery, baseVars);
      if (!exceeded5000) {
        exactTotalCache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, total });
        return total;
      }

      const isPureCategoryBrowse =
        !searchParams.query?.trim() &&
        (!searchParams.status || searchParams.status === 'ALL') &&
        (!searchParams.format || searchParams.format === 'ALL') &&
        adultMode === 'safe';

      if (isPureCategoryBrowse) {
        const curated = getDiscoverCategorySpotlightCount(
          gqlType,
          searchParams.genres ?? [],
          searchParams.tags ?? [],
        );
        if (curated && curated > 5000) {
          exactTotalCache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, total: curated });
          return curated;
        }
      }

      if (!searchParams.format || searchParams.format === 'ALL') {
        const formatBuckets =
          gqlType === 'ANIME'
            ? ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT', 'MUSIC']
            : ['MANGA', 'ONE_SHOT'];
        let sum = 0;
        for (const fmt of formatBuckets) {
          const bucketRes = await exactCountUnder5000(probeQuery, {
            ...baseVars,
            format_in: [fmt],
          });
          sum += bucketRes.total;
        }
        if (sum > 0) {
          exactTotalCache.set(cacheKey, { expires: Date.now() + 30 * 60 * 1000, total: sum });
          return sum;
        }
      }

      return undefined;
    } catch {
      return undefined;
    } finally {
      exactTotalInFlight.delete(cacheKey);
    }
  })();

  exactTotalInFlight.set(cacheKey, task);
  return task;
}

export async function searchAniList(
  params: AniListSearchParams,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  const gqlType = params.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const adultMode = params.adultMode ?? 'safe';

  const query = `
    query(
      $search: String,
      $page: Int,
      $perPage: Int,
      $type: MediaType!,
      $genre_in: [String],
      $tag_in: [String],
      $status_in: [MediaStatus],
      $format_in: [MediaFormat],
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo { total hasNextPage }
        media(
          search: $search
          type: $type
          genre_in: $genre_in
          tag_in: $tag_in
          status_in: $status_in
          format_in: $format_in
          sort: $sort
          ${gqlType === 'MANGA' ? 'format_not: NOVEL' : ''}
          ${adultClause(adultMode)}
        ) {
          id
          idMal
          type
          format
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
    }
  `;

  const sortValue =
    params.query && (!params.sort || params.sort === 'POPULARITY_DESC')
      ? 'SEARCH_MATCH'
      : params.sort || 'POPULARITY_DESC';

  const requestedPage = Math.max(1, params.page ?? 1);
  const perPage = Math.max(1, params.perPage ?? 24);

  const filterVariables: Record<string, unknown> = {
    type: gqlType,
    sort: [sortValue],
  };

  if (params.query?.trim()) filterVariables.search = params.query.trim();
  if (params.genres && params.genres.length > 0) filterVariables.genre_in = params.genres;
  if (params.tags && params.tags.length > 0) filterVariables.tag_in = params.tags;
  if (params.status && params.status !== 'ALL') filterVariables.status_in = [params.status];
  if (params.format && params.format !== 'ALL') filterVariables.format_in = [params.format];

  const variables: Record<string, unknown> = {
    ...filterVariables,
    page: requestedPage,
    perPage,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, variables, undefined, 10);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (data?.Page?.media ?? []).filter((m: any) => String(m?.format || '').toUpperCase() !== 'NOVEL');
  const rawTotal = data?.Page?.pageInfo?.total;
  const rawHasNextPage = Boolean(data?.Page?.pageInfo?.hasNextPage);

  let resolvedTotal: number | undefined;
  if (requestedPage === 1 && !rawHasNextPage) {
    resolvedTotal = list.length;
  } else if (typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal < 5000) {
    resolvedTotal = rawTotal;
  } else if (typeof rawTotal === 'number' && Number.isFinite(rawTotal) && rawTotal >= 5000) {
    const exact = await resolveAniListExactTotal({
      gqlType,
      adultMode,
      baseVars: filterVariables,
      searchParams: params,
    });
    resolvedTotal = exact ?? rawTotal;
  }

  let effectiveHasNextPage = rawHasNextPage;
  if (resolvedTotal !== undefined && requestedPage * perPage >= resolvedTotal) {
    effectiveHasNextPage = false;
  }
  if ((requestedPage + 1) * perPage > 5000) {
    effectiveHasNextPage = false;
  }

  return {
    items: list.map(mapAniListMedia),
    hasNextPage: effectiveHasNextPage,
    total: resolvedTotal,
  };
}

export interface AniListGenreOverviewParams {
  type: MediaType;
  filterKind: 'genre' | 'tag';
  filterValues: string[];
  adultMode?: AdultContentMode;
}

export interface AniListGenreOverviewResult {
  topWeek: UnifiedMedia[];
  highestRated: UnifiedMedia[];
  liveCounts: {
    total: number | null;
    ongoing: number | null;
    completed: number | null;
    newThisMonth: number | null;
  };
}

export async function fetchAniListGenreOverview(
  params: AniListGenreOverviewParams,
): Promise<AniListGenreOverviewResult> {
  const gqlType = params.type === 'MANGA' ? 'MANGA' : 'ANIME';
  const adultMode = params.adultMode ?? 'safe';
  const extraFilters = `${gqlType === 'MANGA' ? 'format_not: NOVEL' : ''} ${adultClause(adultMode)}`;

  const now = new Date();
  const monthStartInt = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100;

  const query = `
    query GenreOverview(
      $type: MediaType!,
      $genre_in: [String],
      $tag_in: [String],
      $monthStart: FuzzyDateInt
    ) {
      topWeek: Page(page: 1, perPage: 16) {
        media(
          type: $type
          genre_in: $genre_in
          tag_in: $tag_in
          sort: [TRENDING_DESC, POPULARITY_DESC]
          ${extraFilters}
        ) {
          id
          idMal
          type
          format
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          tags { id name category rank }
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
      highestRated: Page(page: 1, perPage: 16) {
        media(
          type: $type
          genre_in: $genre_in
          tag_in: $tag_in
          sort: [SCORE_DESC, POPULARITY_DESC]
          ${extraFilters}
        ) {
          id
          idMal
          type
          format
          title { romaji english native }
          coverImage { large extraLarge }
          bannerImage
          description(asHtml: false)
          status
          averageScore
          episodes
          chapters
          genres
          tags { id name category rank }
          seasonYear
          season
          startDate { year }
          nextAiringEpisode { episode airingAt }
        }
      }
      totalProbe: Page(page: 1, perPage: 1) {
        pageInfo { total }
        media(type: $type, genre_in: $genre_in, tag_in: $tag_in ${extraFilters}) { id }
      }
      ongoingProbe: Page(page: 1, perPage: 1) {
        pageInfo { total }
        media(type: $type, genre_in: $genre_in, tag_in: $tag_in, status_in: [RELEASING] ${extraFilters}) { id }
      }
      completedProbe: Page(page: 1, perPage: 1) {
        pageInfo { total }
        media(type: $type, genre_in: $genre_in, tag_in: $tag_in, status_in: [FINISHED] ${extraFilters}) { id }
      }
      newMonthProbe: Page(page: 1, perPage: 1) {
        pageInfo { total }
        media(type: $type, genre_in: $genre_in, tag_in: $tag_in, startDate_greater: $monthStart ${extraFilters}) { id }
      }
    }
  `;

  const variables: Record<string, unknown> = {
    type: gqlType,
    monthStart: monthStartInt,
  };
  if (params.filterKind === 'tag') {
    variables.tag_in = params.filterValues;
  } else {
    variables.genre_in = params.filterValues;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, variables, undefined, 15);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filterNonNovel = (arr: any[]) =>
    arr.filter((m) => String(m?.format || '').toUpperCase() !== 'NOVEL').map(mapAniListMedia);

  const readTotal = (probe: { pageInfo?: { total?: unknown } } | undefined): number | null => {
    const val = probe?.pageInfo?.total;
    return typeof val === 'number' && Number.isFinite(val) ? val : null;
  };

  return {
    topWeek: filterNonNovel(data?.topWeek?.media ?? []),
    highestRated: filterNonNovel(data?.highestRated?.media ?? []),
    liveCounts: {
      total: readTotal(data?.totalProbe),
      ongoing: readTotal(data?.ongoingProbe),
      completed: readTotal(data?.completedProbe),
      newThisMonth: readTotal(data?.newMonthProbe),
    },
  };
}

export async function fetchAniListDetails(id: string, type: MediaType): Promise<UnifiedMedia> {
  const gqlType = type === 'MANGA' ? 'MANGA' : 'ANIME';
  const query = `
    query($id: Int!, $type: MediaType!) {
      Media(id: $id, type: $type) {
        id
        idMal
        type
        title { romaji english native }
        synonyms
        format
        source
        duration
        chapters
        volumes
        popularity
        favourites
        coverImage { large extraLarge }
        nextAiringEpisode { episode airingAt }
        bannerImage
        description(asHtml: false)
        status
        averageScore
        episodes
        genres
        seasonYear
        season
        startDate { year }
        trailer { id site }
        tags { id name category rank }
        studios(isMain: true) { nodes { id name } }
        externalLinks { id url site icon }
        streamingEpisodes { title thumbnail url site }
        characters(perPage: 16, sort: [ROLE, RELEVANCE]) {
          edges {
            role
            node { id name { full native } image { large } description }
            voiceActors(language: JAPANESE, sort: [RELEVANCE]) {
              id
              name { full native }
              image { large }
            }
          }
        }
        staff(perPage: 12, sort: [RELEVANCE, ID]) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
          }
        }
        relations {
          edges {
            relationType(version: 2)
            node {
              id type format
              title { romaji english native }
              coverImage { large }
              bannerImage status averageScore episodes chapters
            }
          }
        }
        recommendations(sort: RATING_DESC, perPage: 15) {
          nodes {
            mediaRecommendation {
              id type format
              title { romaji english native }
              coverImage { large }
              bannerImage status averageScore episodes chapters
            }
          }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { id: Number(id), type: gqlType }, undefined, 30);
  if (!data?.Media) throw new Error('Media not found on AniList');
  return mapAniListMedia(data.Media);
}

export async function fetchAniListGenresAndTags(): Promise<{ genres: string[]; tags: string[] }> {
  const query = `
    query {
      GenreCollection
      MediaTagCollection { name isAdult }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, {}, undefined, 120);
  const genres: string[] = (data?.GenreCollection ?? []).filter((g: string) => g !== 'Hentai');
  const genreLowerSet = new Set(genres.map((g) => g.toLowerCase()));
  const validApiTagsByLower = new Map<string, string>();
  for (const t of (data?.MediaTagCollection ?? []) as Array<{ name?: string; isAdult?: boolean }>) {
    if (!t || t.isAdult || typeof t.name !== 'string') continue;
    const clean = t.name.trim();
    const lower = clean.toLowerCase();
    if (!clean || genreLowerSet.has(lower)) continue;
    if (!validApiTagsByLower.has(lower)) {
      validApiTagsByLower.set(lower, clean);
    }
  }

  const orderedTags: string[] = [];
  const seenLower = new Set<string>();
  for (const preferred of POPULAR_ANILIST_TAGS) {
    const lower = preferred.toLowerCase();
    const apiExact = validApiTagsByLower.get(lower);
    if (apiExact && !seenLower.has(lower)) {
      seenLower.add(lower);
      orderedTags.push(apiExact);
    }
  }
  for (const [lower, clean] of validApiTagsByLower.entries()) {
    if (orderedTags.length >= 60) break;
    if (!seenLower.has(lower)) {
      seenLower.add(lower);
      orderedTags.push(clean);
    }
  }

  return { genres, tags: orderedTags.slice(0, 60) };
}

export async function fetchAniListWeekSchedule(
  weekStart: Date,
  adultMode: AdultContentMode = 'safe',
): Promise<CalendarEntry[]> {
  const startSec = Math.floor(weekStart.getTime() / 1000);
  const endSec = startSec + 7 * 24 * 60 * 60 - 1;

  const query = `
    query($start: Int, $end: Int, $page: Int) {
      Page(page: $page, perPage: 50) {
        pageInfo { hasNextPage }
        airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
          id
          episode
          airingAt
          media {
            id
            idMal
            type
            format
            isAdult
            title { english romaji native }
            coverImage { large }
            bannerImage
            averageScore
            episodes
            genres
            status
          }
        }
      }
    }
  `;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { start: startSec, end: endSec, page: 1 }, undefined, 10);
  const schedules = data?.Page?.airingSchedules ?? [];
  return schedules
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => {
      if (!s.media) return false;
      if (adultMode === 'safe' && s.media.isAdult) return false;
      if (adultMode === 'adultOnly' && !s.media.isAdult) return false;
      return true;
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any): CalendarEntry => ({
      id: String(s.id),
      episode: s.episode,
      airingAt: new Date(s.airingAt * 1000).toISOString(),
      media: mapAniListMedia(s.media),
    }));
}

export async function fetchAniListViewer(token: string): Promise<TrackerProfile> {
  const query = `
    query {
      Viewer {
        id
        name
        about
        siteUrl
        bannerImage
        avatar { large }
        statistics {
          anime { count episodesWatched meanScore }
          manga { count chaptersRead meanScore }
        }
      }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, {}, token, 0);
  const v = data?.Viewer;
  if (!v) throw new Error('Invalid AniList token');
  return {
    tracker: 'anilist',
    id: String(v.id),
    username: v.name,
    avatarUrl: v.avatar?.large,
    bannerUrl: v.bannerImage,
    bio: v.about,
    siteUrl: v.siteUrl,
    animeCount: v.statistics?.anime?.count ?? 0,
    episodesWatched: v.statistics?.anime?.episodesWatched ?? 0,
    mangaCount: v.statistics?.manga?.count ?? 0,
    chaptersRead: v.statistics?.manga?.chaptersRead ?? 0,
    meanScore: v.statistics?.anime?.meanScore ?? 0,
  };
}

export async function fetchAniListUserLibrary(
  token: string,
  userId: string,
  mediaType: MediaType,
  status: TrackedStatus,
): Promise<LibraryEntry[]> {
  const gqlType = mediaType === 'MANGA' ? 'MANGA' : 'ANIME';
  const query = `
    query($userId: Int, $status: MediaListStatus, $type: MediaType) {
      Page(page: 1, perPage: 50) {
        mediaList(userId: $userId, status: $status, type: $type, sort: [UPDATED_TIME_DESC]) {
          progress
          score(format: POINT_10_DECIMAL)
          updatedAt
          notes
          media {
            id idMal type format
            title { english romaji native }
            coverImage { large }
            bannerImage
            description(asHtml: false)
            genres averageScore seasonYear status episodes chapters
          }
        }
      }
    }
  `;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = await gqlRequest<any>(query, { userId: Number(userId), status, type: gqlType }, token, 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = (data?.Page?.mediaList ?? []).filter((item: any) => String(item?.media?.format || '').toUpperCase() !== 'NOVEL');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.map((item: any): LibraryEntry => {
    const media = mapAniListMedia(item.media);
    return {
      mediaId: media.id,
      mediaType: media.type,
      media,
      status,
      progress: item.progress ?? 0,
      score: item.score ?? 0,
      notes: item.notes ?? '',
      updatedAt: item.updatedAt ? new Date(item.updatedAt * 1000).toISOString() : new Date().toISOString(),
      trackerType: 'anilist',
    };
  });
}

export async function saveAniListMediaEntry(
  token: string,
  mediaId: string,
  status: TrackedStatus,
  progress: number,
  score: number,
): Promise<void> {
  const mutation = `
    mutation($mediaId: Int, $status: MediaListStatus, $progress: Int, $scoreRaw: Int) {
      SaveMediaListEntry(mediaId: $mediaId, status: $status, progress: $progress, scoreRaw: $scoreRaw) {
        id
      }
    }
  `;
  await gqlRequest(
    mutation,
    {
      mediaId: Number(mediaId),
      status,
      progress: Math.floor(progress),
      scoreRaw: Math.round(score * 10),
    },
    token,
    0,
  );
}

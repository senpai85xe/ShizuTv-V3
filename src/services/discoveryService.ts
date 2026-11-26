import {
  AdultContentMode,
  CalendarEntry,
  MediaType,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  TrackerCategory,
  TrackerType,
  UnifiedMedia,
} from '../types/media';
import {
  AniListGenreOverviewParams,
  AniListGenreOverviewResult,
  fetchAniListCategory,
  fetchAniListDetails,
  fetchAniListGenreOverview,
  fetchAniListGenresAndTags,
  fetchAniListWeekSchedule,
  searchAniList,
} from './anilist';
import {
  fetchJikanCategory,
  fetchJikanDetails,
  fetchJikanWeekSchedule,
  searchJikan,
} from './jikan';
import { fetchKitsuCategory, fetchKitsuDetails, searchKitsu } from './kitsu';
import { POPULAR_ANILIST_TAGS } from '../utils/genreMetadata';

export async function fetchDiscoveryCategory(
  tracker: Exclude<TrackerType, 'local'>,
  category: TrackerCategory,
  mediaType: MediaType,
  adultMode: AdultContentMode,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean }> {
  if (tracker === 'myanimelist') {
    return fetchJikanCategory(category, mediaType, page);
  }
  if (tracker === 'kitsu') {
    return fetchKitsuCategory(category, mediaType);
  }
  return fetchAniListCategory(category, mediaType, adultMode, page);
}

export async function fetchDiscoveryGenreOverview(
  tracker: Exclude<TrackerType, 'local'>,
  params: AniListGenreOverviewParams,
): Promise<AniListGenreOverviewResult> {
  if (tracker === 'anilist') {
    return fetchAniListGenreOverview(params);
  }

  try {
    return await fetchAniListGenreOverview(params);
  } catch (err) {
    const [trendingRes, ratedRes] = await Promise.all([
      fetchDiscoveryCategory(tracker, 'trending', params.type, params.adultMode ?? 'safe', 1),
      fetchDiscoveryCategory(tracker, 'topRated', params.type, params.adultMode ?? 'safe', 1),
    ]);
    if (trendingRes.items.length === 0 && ratedRes.items.length === 0) {
      throw err;
    }
    const filterSet = new Set(params.filterValues.map((v) => v.toLowerCase()));
    const matchesFilter = (item: UnifiedMedia) => {
      if (params.filterKind === 'tag') {
        const tagMatch = (item.tags ?? []).some((t) => filterSet.has(t.name.toLowerCase()));
        const genreMatch = (item.genres ?? []).some((g) => filterSet.has(g.toLowerCase()));
        return tagMatch || genreMatch;
      }
      return (item.genres ?? []).some((g) => filterSet.has(g.toLowerCase()));
    };

    const filteredTop = trendingRes.items.filter(matchesFilter);
    const filteredRated = ratedRes.items.filter(matchesFilter);

    return {
      topWeek: filteredTop.length > 0 ? filteredTop : trendingRes.items,
      highestRated: filteredRated.length > 0 ? filteredRated : ratedRes.items,
      liveCounts: {
        total: null,
        ongoing: null,
        completed: null,
        newThisMonth: null,
      },
    };
  }
}

export async function searchDiscoveryMedia(
  tracker: Exclude<TrackerType, 'local'>,
  params: {
    query?: string;
    type: MediaType;
    page?: number;
    genres?: string[];
    tags?: string[];
    sort?: SearchSort;
    status?: SearchStatusFilter;
    format?: SearchFormatFilter;
    adultMode?: AdultContentMode;
  },
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  if (tracker === 'myanimelist') {
    if (params.query?.trim()) {
      return searchJikan(params.query.trim(), params.type, params.page ?? 1);
    }
    return fetchJikanCategory('popular', params.type, params.page ?? 1);
  }
  if (tracker === 'kitsu') {
    if (params.query?.trim()) {
      return searchKitsu(params.query.trim(), params.type, params.page ?? 1);
    }
    return fetchKitsuCategory('popular', params.type, params.page ?? 1);
  }
  return searchAniList(params);
}

export async function fetchMediaDetails(
  id: string,
  type: MediaType,
  providerId?: string | null,
): Promise<UnifiedMedia> {
  if (providerId === 'myanimelist' || providerId === 'mal') {
    return fetchJikanDetails(id, type);
  }
  if (providerId === 'kitsu') {
    return fetchKitsuDetails(id, type);
  }
  return fetchAniListDetails(id, type);
}

export async function fetchDiscoveryGenresAndTags(): Promise<{
  genres: string[];
  tags: string[];
}> {
  try {
    return await fetchAniListGenresAndTags();
  } catch {
    return {
      genres: [
        'Action',
        'Adventure',
        'Comedy',
        'Drama',
        'Fantasy',
        'Horror',
        'Mystery',
        'Psychological',
        'Romance',
        'Sci-Fi',
        'Slice of Life',
        'Sports',
        'Supernatural',
        'Thriller',
      ],
      tags: [...POPULAR_ANILIST_TAGS],
    };
  }
}

export async function fetchCalendarSchedule(
  source: 'anilist' | 'myanimelist' | 'kitsu',
  weekStart: Date,
  adultMode: AdultContentMode,
): Promise<CalendarEntry[]> {
  if (source === 'myanimelist') {
    return fetchJikanWeekSchedule();
  }
  return fetchAniListWeekSchedule(weekStart, adultMode);
}

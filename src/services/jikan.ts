import {
  CalendarEntry,
  MediaType,
  TrackerCategory,
  UnifiedEpisode,
  UnifiedMedia,
} from '../types/media';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const cache = new Map<string, { expires: number; data: unknown }>();

async function jikanGet<T>(path: string, ttlMin = 15, bypassCache = false): Promise<T> {
  const now = Date.now();
  const hit = !bypassCache ? cache.get(path) : undefined;
  if (hit && hit.expires > now) return hit.data as T;

  const res = await fetch(`${JIKAN_BASE}${path}`, {
    signal: AbortSignal.timeout(8500),
  });
  if (!res.ok) throw new Error(`Jikan API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  cache.set(path, { expires: now + ttlMin * 60 * 1000, data: json });
  return json as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapJikanMedia(item: any, type: MediaType): UnifiedMedia {
  return {
    id: String(item.mal_id),
    idMal: String(item.mal_id),
    providerId: 'myanimelist',
    type,
    externalIds: { mal: String(item.mal_id) },
    title: {
      english: item.title_english ?? null,
      romaji: item.title ?? null,
      native: item.title_japanese ?? null,
    },
    format: item.type ?? null,
    cover: item.images?.webp?.large_image_url || item.images?.jpg?.large_image_url || null,
    banner: item.trailer?.images?.maximum_image_url || null,
    description: item.synopsis ?? null,
    score: typeof item.score === 'number' ? item.score : null,
    genres: Array.isArray(item.genres) ? item.genres.map((g: { name: string }) => g.name) : [],
    status: item.status ?? null,
    episodes: item.episodes ?? null,
    chapters: item.chapters ?? null,
    volumes: item.volumes ?? null,
    year: item.year ?? item.aired?.prop?.from?.year ?? null,
    season: item.season ? String(item.season).toUpperCase() : null,
    studios: Array.isArray(item.studios) ? item.studios.map((s: { name: string }) => s.name) : [],
    url: item.url ?? null,
  };
}

export async function fetchJikanCategory(
  category: TrackerCategory,
  type: MediaType,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  const filterMap: Record<TrackerCategory, string> = {
    trending: endpoint === 'anime' ? 'airing' : 'publishing',
    popular: 'bypopularity',
    topRated: '',
    recentlyUpdated: endpoint === 'anime' ? 'airing' : 'publishing',
  };
  const filter = filterMap[category];
  const qs = new URLSearchParams({
    page: String(page),
    limit: '20',
    ...(filter ? { filter } : {}),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await jikanGet<any>(`/top/${endpoint}?${qs.toString()}`);
  const items = (json.data ?? []).map((item: unknown) => mapJikanMedia(item, type));
  const rawTotal = json.pagination?.items?.total;
  return {
    items,
    hasNextPage: Boolean(json.pagination?.has_next_page),
    total: typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined,
  };
}

export async function searchJikan(
  query: string,
  type: MediaType,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  const qs = new URLSearchParams({
    q: query,
    page: String(page),
    limit: '24',
    sfw: 'true',
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await jikanGet<any>(`/${endpoint}?${qs.toString()}`);
  const rawTotal = json.pagination?.items?.total;
  return {
    items: (json.data ?? []).map((item: unknown) => mapJikanMedia(item, type)),
    hasNextPage: Boolean(json.pagination?.has_next_page),
    total: typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined,
  };
}

export async function fetchJikanDetails(malId: string, type: MediaType): Promise<UnifiedMedia> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await jikanGet<any>(`/${endpoint}/${malId}/full`, 30);
  return mapJikanMedia(json.data, type);
}

export async function fetchJikanEpisodes(
  malId: string,
  bypassCache = false,
): Promise<UnifiedEpisode[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const first = await jikanGet<any>(`/anime/${malId}/episodes?page=1`, 30, bypassCache);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allItems: any[] = [...(first.data ?? [])];
  const lastPage = Math.min(Number(first.pagination?.last_visible_page) || 1, 15);

  if (first.pagination?.has_next_page && lastPage > 1) {
    const pageNumbers = Array.from({ length: lastPage - 1 }, (_, i) => i + 2);
    // Fetch in small batches of 3 to respect Jikan rate limits while still loading fast
    for (let i = 0; i < pageNumbers.length; i += 3) {
      const batch = pageNumbers.slice(i, i + 3);
      const results = await Promise.allSettled(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        batch.map((p) => jikanGet<any>(`/anime/${malId}/episodes?page=${p}`, 30, bypassCache)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && Array.isArray(r.value?.data)) {
          allItems.push(...r.value.data);
        }
      }
    }
  }

  const seen = new Set<number>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return allItems
    .filter((ep: any) => {
      const num = Number(ep.mal_id);
      if (!Number.isFinite(num) || seen.has(num)) return false;
      seen.add(num);
      return true;
    })
    .sort((a, b) => Number(a.mal_id) - Number(b.mal_id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((ep: any): UnifiedEpisode => ({
      id: `mal-ep-${malId}-${ep.mal_id}`,
      number: ep.mal_id,
      title: ep.title || ep.title_romanji || `Episode ${ep.mal_id}`,
      airDate: ep.aired ? ep.aired.slice(0, 10) : null,
      isFiller: Boolean(ep.filler),
    }));
}

export async function fetchJikanWeekSchedule(): Promise<CalendarEntry[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await jikanGet<any>('/schedules?limit=25', 20);
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  monday.setHours(18, 0, 0, 0);

  const dayMap: Record<string, number> = {
    mondays: 0,
    tuesdays: 1,
    wednesdays: 2,
    thursdays: 3,
    fridays: 4,
    saturdays: 5,
    sundays: 6,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (json.data ?? []).map((item: any): CalendarEntry => {
    const dayName = String(item.broadcast?.day || 'mondays').toLowerCase();
    const offset = dayMap[dayName] ?? 0;
    const airDate = new Date(monday);
    airDate.setDate(monday.getDate() + offset);
    return {
      id: `mal-sched-${item.mal_id}`,
      episode: item.episodes ? Math.max(1, item.episodes) : 1,
      airingAt: airDate.toISOString(),
      media: mapJikanMedia(item, 'ANIME'),
    };
  });
}

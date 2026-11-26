import { MediaType, TrackerCategory, UnifiedEpisode, UnifiedMedia } from '../types/media';

const KITSU_BASE = 'https://kitsu.io/api/edge';
const cache = new Map<string, { expires: number; data: unknown }>();

async function kitsuGet<T>(path: string, ttlMin = 15, bypassCache = false): Promise<T> {
  const now = Date.now();
  const hit = !bypassCache ? cache.get(path) : undefined;
  if (hit && hit.expires > now) return hit.data as T;

  const res = await fetch(`${KITSU_BASE}${path}`, {
    headers: { Accept: 'application/vnd.api+json' },
    signal: AbortSignal.timeout(7500),
  });
  if (!res.ok) throw new Error(`Kitsu API ${res.status}: ${res.statusText}`);
  const json = await res.json();
  cache.set(path, { expires: now + ttlMin * 60 * 1000, data: json });
  return json as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapKitsuMedia(item: any, type: MediaType): UnifiedMedia {
  const attrs = item.attributes || {};
  return {
    id: String(item.id),
    providerId: 'kitsu',
    type,
    externalIds: { kitsu: String(item.id) },
    title: {
      english: attrs.titles?.en || attrs.titles?.en_us || attrs.canonicalTitle || null,
      romaji: attrs.titles?.en_jp || attrs.canonicalTitle || null,
      native: attrs.titles?.ja_jp || null,
    },
    format: attrs.subtype ? String(attrs.subtype).toUpperCase() : null,
    cover: attrs.posterImage?.large || attrs.posterImage?.medium || null,
    banner: attrs.coverImage?.large || attrs.coverImage?.original || null,
    description: attrs.synopsis || attrs.description || null,
    score: attrs.averageRating ? Number((Number(attrs.averageRating) / 10).toFixed(1)) : null,
    status: attrs.status ? String(attrs.status).toUpperCase() : null,
    episodes: attrs.episodeCount ?? null,
    chapters: attrs.chapterCount ?? null,
    volumes: attrs.volumeCount ?? null,
    year: attrs.startDate ? Number(String(attrs.startDate).slice(0, 4)) : null,
    genres: [],
  };
}

export async function fetchKitsuCategory(
  category: TrackerCategory,
  type: MediaType,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  const offset = Math.max(0, (Math.max(1, page) - 1) * 24);
  const path =
    category === 'trending'
      ? `/trending/${endpoint}?limit=24`
      : category === 'topRated'
        ? `/${endpoint}?sort=-averageRating&page[limit]=24&page[offset]=${offset}`
        : category === 'recentlyUpdated'
          ? `/${endpoint}?sort=-updatedAt&page[limit]=24&page[offset]=${offset}`
          : `/${endpoint}?sort=-userCount&page[limit]=24&page[offset]=${offset}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(path);
  const rawTotal = json.meta?.count;
  return {
    items: (json.data ?? []).map((item: unknown) => mapKitsuMedia(item, type)),
    hasNextPage: Boolean(json.links?.next),
    total: typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined,
  };
}

export async function searchKitsu(
  query: string,
  type: MediaType,
  page = 1,
): Promise<{ items: UnifiedMedia[]; hasNextPage: boolean; total?: number }> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  const offset = Math.max(0, (Math.max(1, page) - 1) * 24);
  const qs = new URLSearchParams({
    'filter[text]': query,
    'page[limit]': '24',
    'page[offset]': String(offset),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(`/${endpoint}?${qs.toString()}`);
  const rawTotal = json.meta?.count;
  return {
    items: (json.data ?? []).map((item: unknown) => mapKitsuMedia(item, type)),
    hasNextPage: Boolean(json.links?.next),
    total: typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : undefined,
  };
}

export async function fetchKitsuDetails(id: string, type: MediaType): Promise<UnifiedMedia> {
  const endpoint = type === 'MANGA' ? 'manga' : 'anime';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await kitsuGet<any>(`/${endpoint}/${id}`, 30);
  return mapKitsuMedia(json.data, type);
}

export async function fetchKitsuEpisodes(
  kitsuId: string,
  bypassCache = false,
): Promise<UnifiedEpisode[]> {
  const episodes: UnifiedEpisode[] = [];
  const seen = new Set<number>();

  for (let page = 0; page < 5; page++) {
    const offset = page * 20;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await kitsuGet<any>(
      `/anime/${encodeURIComponent(kitsuId)}/episodes?page[limit]=20&page[offset]=${offset}&sort=number`,
      30,
      bypassCache,
    );
    const list = Array.isArray(json.data) ? json.data : [];
    if (list.length === 0) break;

    for (const item of list) {
      const attrs = item.attributes || {};
      const num = Number(attrs.number);
      if (!Number.isFinite(num) || num <= 0 || seen.has(num)) continue;
      seen.add(num);
      const epTitle =
        attrs.canonicalTitle?.trim() ||
        attrs.titles?.en_us?.trim() ||
        attrs.titles?.en?.trim() ||
        attrs.titles?.en_jp?.trim() ||
        `Episode ${num}`;
      episodes.push({
        id: `kitsu-ep-${kitsuId}-${num}`,
        number: num,
        title: epTitle,
        description:
          typeof attrs.synopsis === 'string' && attrs.synopsis.trim() ? attrs.synopsis.trim() : null,
        thumbnail: attrs.thumbnail?.original || null,
        airDate: attrs.airdate || null,
        durationSeconds:
          typeof attrs.length === 'number' && attrs.length > 0 ? attrs.length * 60 : undefined,
      });
    }

    if (!json.links?.next) break;
  }

  return episodes.sort((a, b) => a.number - b.number);
}

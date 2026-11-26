export type DiscoverResultsMode = 'infinite' | 'pages';
export type PaginationToken = number | 'ellipsis';

export const DISCOVER_PAGE_SIZE = 24;
export const ANILIST_MAX_DEPTH_ENTRIES = 5000;
export const ANILIST_MAX_NAVIGABLE_PAGE = Math.floor(
  ANILIST_MAX_DEPTH_ENTRIES / DISCOVER_PAGE_SIZE,
);

export function computeDiscoverTotalPages(params: {
  totalCount: number | null;
  loadedCount: number;
  hasNextPage: boolean;
  currentPage: number;
  perPage?: number;
  maxTrackerPages?: number;
}): number {
  const perPage = params.perPage && params.perPage > 0 ? params.perPage : DISCOVER_PAGE_SIZE;
  let totalPages: number;
  if (typeof params.totalCount === 'number' && Number.isFinite(params.totalCount) && params.totalCount > 0) {
    totalPages = Math.max(1, Math.ceil(params.totalCount / perPage));
  } else if (params.hasNextPage) {
    totalPages = Math.max(2, params.currentPage + 1);
  } else {
    totalPages = Math.max(
      1,
      params.currentPage,
      Math.ceil(Math.max(0, params.loadedCount) / perPage),
    );
  }

  if (typeof params.maxTrackerPages === 'number' && params.maxTrackerPages > 0) {
    return Math.min(totalPages, params.maxTrackerPages);
  }
  return totalPages;
}

export function buildPaginationTokens(currentPage: number, totalPages: number): PaginationToken[] {
  const safeTotal = Math.max(1, Math.floor(totalPages));
  const safeCurrent = Math.min(safeTotal, Math.max(1, Math.floor(currentPage)));

  if (safeTotal <= 5) {
    return Array.from({ length: safeTotal }, (_, i) => i + 1);
  }

  const left = Math.max(2, safeCurrent - 1);
  const right = Math.min(safeTotal - 1, safeCurrent + 1);
  const tokens: PaginationToken[] = [1];

  if (left > 3) {
    tokens.push('ellipsis');
  } else if (left === 3) {
    tokens.push(2);
  }

  for (let p = left; p <= right; p += 1) {
    tokens.push(p);
  }

  if (right < safeTotal - 2) {
    tokens.push('ellipsis');
  } else if (right === safeTotal - 2) {
    tokens.push(safeTotal - 1);
  }

  tokens.push(safeTotal);
  return tokens;
}

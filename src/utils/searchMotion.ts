import { SearchSort, UnifiedMedia } from '../types/media';

export interface SimpleRect {
  left: number;
  top: number;
}

export interface FlipDelta {
  dx: number;
  dy: number;
}

export type ResultTransitionKind = 'enter' | 'move' | 'stay';

/**
 * Generates stable React keys for search results based on item identity rather than array index,
 * preserving DOM node identity across sorts/filters so FLIP layout transitions work reliably.
 */
export function buildStableMediaResultKeys(
  items: ReadonlyArray<Pick<UnifiedMedia, 'id' | 'type'>>,
): string[] {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const base = `${item.type}-${item.id}`;
    const seen = counts.get(base) ?? 0;
    counts.set(base, seen + 1);
    return seen === 0 ? base : `${base}#${seen}`;
  });
}

/**
 * Computes inverse translation deltas for items that existed before and after a sort/filter update.
 */
export function computeGridFlipDeltas(
  prevRects: ReadonlyMap<string, SimpleRect>,
  nextRects: ReadonlyMap<string, SimpleRect>,
  thresholdPx = 0.5,
): Map<string, FlipDelta> {
  const deltas = new Map<string, FlipDelta>();
  for (const [key, next] of nextRects.entries()) {
    const prev = prevRects.get(key);
    if (!prev) continue;
    const dx = prev.left - next.left;
    const dy = prev.top - next.top;
    if (Math.abs(dx) > thresholdPx || Math.abs(dy) > thresholdPx) {
      deltas.set(key, { dx, dy });
    }
  }
  return deltas;
}

/**
 * Classifies each rendered key as newly entering vs persisting/reordered so persisting items
 * smoothly FLIP-glide instead of re-fading from opacity 0.
 */
export function classifyResultTransitions(
  prevKeys: ReadonlySet<string>,
  nextKeys: ReadonlyArray<string>,
  deltas: ReadonlyMap<string, FlipDelta>,
): Map<string, ResultTransitionKind> {
  const result = new Map<string, ResultTransitionKind>();
  for (const key of nextKeys) {
    if (!prevKeys.has(key)) {
      result.set(key, 'enter');
    } else if (deltas.has(key)) {
      result.set(key, 'move');
    } else {
      result.set(key, 'stay');
    }
  }
  return result;
}

const SORT_LABELS: Record<SearchSort, string> = {
  POPULARITY_DESC: 'Popularity',
  TRENDING_DESC: 'Trending',
  SCORE_DESC: 'Highest Score',
  FAVOURITES_DESC: 'Favourites',
  START_DATE_DESC: 'Newest',
  SEARCH_MATCH: 'Best Match',
};

export function formatSortLabel(sort: SearchSort): string {
  return SORT_LABELS[sort] ?? 'Popularity';
}

export const SEARCH_EXPAND_EASING = 'cubic-bezier(0.24, 0.96, 0.24, 1)';

export interface SearchExpansionInput {
  searchFocused: boolean;
  queryInput: string;
  hasActiveFilters: boolean;
  categoryTitle: string | null;
}

/**
 * Resolves whether the Discover search input should render in its expanded active state.
 */
export function resolveSearchExpansionState(input: SearchExpansionInput): boolean {
  return (
    input.searchFocused ||
    input.queryInput.trim().length > 0 ||
    input.hasActiveFilters ||
    Boolean(input.categoryTitle && input.categoryTitle.trim().length > 0)
  );
}

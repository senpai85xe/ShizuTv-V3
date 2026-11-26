export type RouteNavigationType = 'POP' | 'PUSH' | 'REPLACE';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const SCROLL_STORAGE_PREFIX = 'shizutv_scroll_pos:';
const LAST_ROUTE_SESSION_KEY = 'shizutv_last_route_pair';

const memoryScrollStore = new Map<string, number>();

interface RoutePair {
  previous: string | null;
  current: string | null;
}

let inMemoryRoutePair: RoutePair = {
  previous: null,
  current: null,
};

function resolveStorage(explicit?: StorageLike | null): StorageLike | null {
  if (explicit !== undefined) return explicit;
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      return window.sessionStorage;
    }
  } catch {
    // Ignore storage access errors in restricted frames
  }
  return null;
}

export function normalizeScrollRouteKey(pathname: string): string {
  if (!pathname || pathname === '/') return '/home';
  return pathname.length > 1 && pathname.endsWith('/')
    ? pathname.slice(0, -1)
    : pathname;
}

export function isHomeRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return normalizeScrollRouteKey(pathname) === '/home';
}

export function isDetailsRoute(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return normalizeScrollRouteKey(pathname).startsWith('/details/');
}

export function getScrollStorageKey(routeKey: string): string {
  return `${SCROLL_STORAGE_PREFIX}${normalizeScrollRouteKey(routeKey)}`;
}

export function saveRouteScrollPosition(
  routeKey: string,
  scrollY: number,
  storage?: StorageLike | null,
): void {
  if (!Number.isFinite(scrollY) || scrollY < 0) return;
  const rounded = Math.round(scrollY);
  const norm = normalizeScrollRouteKey(routeKey);
  memoryScrollStore.set(norm, rounded);

  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(getScrollStorageKey(norm), String(rounded));
    } catch {
      // Ignore quota / security errors
    }
  }
}

export function loadRouteScrollPosition(
  routeKey: string,
  storage?: StorageLike | null,
): number | null {
  const norm = normalizeScrollRouteKey(routeKey);
  const mem = memoryScrollStore.get(norm);
  if (typeof mem === 'number' && Number.isFinite(mem) && mem >= 0) {
    return mem;
  }

  const store = resolveStorage(storage);
  if (store) {
    try {
      const raw = store.getItem(getScrollStorageKey(norm));
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0) {
          const rounded = Math.round(parsed);
          memoryScrollStore.set(norm, rounded);
          return rounded;
        }
      }
    } catch {
      // Ignore read errors
    }
  }

  return null;
}

export function clearRouteScrollPosition(
  routeKey: string,
  storage?: StorageLike | null,
): void {
  const norm = normalizeScrollRouteKey(routeKey);
  memoryScrollStore.delete(norm);

  const store = resolveStorage(storage);
  if (store) {
    try {
      store.removeItem(getScrollStorageKey(norm));
    } catch {
      // Ignore errors
    }
  }
}

export function recordVisitedRoute(
  pathname: string,
  storage?: StorageLike | null,
): RoutePair {
  const norm = normalizeScrollRouteKey(pathname);
  if (inMemoryRoutePair.current === null && inMemoryRoutePair.previous === null) {
    const store = resolveStorage(storage);
    if (store) {
      try {
        const raw = store.getItem(LAST_ROUTE_SESSION_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<RoutePair>;
          inMemoryRoutePair = {
            previous: typeof parsed.previous === 'string' ? parsed.previous : null,
            current: typeof parsed.current === 'string' ? parsed.current : null,
          };
        }
      } catch {
        // Ignore parse failures
      }
    }
  }

  if (inMemoryRoutePair.current === norm) {
    return inMemoryRoutePair;
  }

  const nextPair: RoutePair = {
    previous: inMemoryRoutePair.current,
    current: norm,
  };
  inMemoryRoutePair = nextPair;

  const store = resolveStorage(storage);
  if (store) {
    try {
      store.setItem(LAST_ROUTE_SESSION_KEY, JSON.stringify(nextPair));
    } catch {
      // Ignore write errors
    }
  }

  return nextPair;
}

export function getPreviousVisitedRoute(): string | null {
  return inMemoryRoutePair.previous;
}

export function resetVisitedRoutesForTest(): void {
  inMemoryRoutePair = { previous: null, current: null };
  memoryScrollStore.clear();
}

export interface RestoreScrollDecisionInput {
  routeKey: string;
  previousPath: string | null | undefined;
  navigationType: RouteNavigationType | string;
  savedY: number | null;
}

/**
 * Determines whether the route should smoothly restore its saved scroll position.
 * Restores when:
 * - Returning via browser/app back (POP) with a saved offset > 0
 * - Returning from a Details page back to Home (even via PUSH Home button)
 */
export function shouldRestoreSavedScroll(input: RestoreScrollDecisionInput): boolean {
  if (input.savedY === null || !Number.isFinite(input.savedY) || input.savedY <= 0) {
    return false;
  }
  if (input.navigationType === 'POP') {
    return true;
  }
  if (isHomeRoute(input.routeKey) && isDetailsRoute(input.previousPath)) {
    return true;
  }
  return false;
}

export function shouldNavShellResetScroll(
  pathname: string,
  previousPath: string | null | undefined,
  navigationType: RouteNavigationType | string,
  storage?: StorageLike | null,
): boolean {
  const norm = normalizeScrollRouteKey(pathname);
  if (isHomeRoute(norm) || isDetailsRoute(norm)) {
    const savedY = loadRouteScrollPosition(norm, storage);
    if (
      shouldRestoreSavedScroll({
        routeKey: norm,
        previousPath,
        navigationType,
        savedY,
      })
    ) {
      return false;
    }
  }
  return true;
}

export function canScrollReachTarget(
  scrollHeight: number,
  viewportHeight: number,
  targetY: number,
  tolerancePx = 24,
): boolean {
  if (!Number.isFinite(targetY) || targetY <= 0) return true;
  const maxScroll = Math.max(0, scrollHeight - viewportHeight);
  return maxScroll >= Math.max(0, targetY - tolerancePx);
}

export function easeOutCubic(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 1 - Math.pow(1 - clamped, 3);
}

export function computeSmoothScrollDurationMs(
  distancePx: number,
  reducedMotion: boolean,
): number {
  if (reducedMotion || distancePx <= 2) return 0;
  return Math.round(Math.max(240, Math.min(480, 220 + distancePx * 0.14)));
}

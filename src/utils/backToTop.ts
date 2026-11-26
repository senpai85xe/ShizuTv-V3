import { shouldShowOnlineHubSwitcher } from './appMotion';
import { normalizeScrollRouteKey } from './scrollPersistence';

export const BACK_TO_TOP_SCROLL_THRESHOLD_PX = 750;

export function shouldShowBackToTop(
  scrollY: number,
  thresholdPx: number = BACK_TO_TOP_SCROLL_THRESHOLD_PX,
): boolean {
  if (!Number.isFinite(scrollY) || !Number.isFinite(thresholdPx)) {
    return false;
  }
  return scrollY >= thresholdPx;
}

export function resolveScrollToTopBehavior(
  batterySaver: boolean,
  prefersReducedMotion: boolean,
): ScrollBehavior {
  return batterySaver || prefersReducedMotion ? 'auto' : 'smooth';
}

export interface BackToTopPositionInput {
  pathname: string;
  isTvMode?: boolean;
  pipAtBottomRight?: boolean;
}

export function resolveBackToTopPositionClass(
  input: BackToTopPositionInput,
): string {
  const norm = normalizeScrollRouteKey(input.pathname);
  const base = 'fixed right-4 sm:right-6 z-40';

  if (input.pipAtBottomRight) {
    return `${base} bottom-[calc(15rem+env(safe-area-inset-bottom))] md:bottom-[13.75rem] landscape:bottom-[13.75rem]`;
  }

  if (norm === '/reader') {
    return `${base} bottom-[calc(4.75rem+env(safe-area-inset-bottom))]`;
  }

  if (norm.startsWith('/details/')) {
    return `${base} bottom-[calc(6.25rem+env(safe-area-inset-bottom))] md:bottom-6 landscape:bottom-6`;
  }

  if (input.isTvMode) {
    return `${base} bottom-6`;
  }

  if (shouldShowOnlineHubSwitcher(norm)) {
    return `${base} bottom-[calc(10rem+env(safe-area-inset-bottom))] md:bottom-6 landscape:bottom-6`;
  }

  return `${base} bottom-[calc(6rem+env(safe-area-inset-bottom))] md:bottom-6 landscape:bottom-6`;
}

export type DetailsTabKey = 'info' | 'watch' | 'comments';
export type DetailsTabDirection = 'forward' | 'backward' | 'none';
export type EpisodeChangeDirection = 'next' | 'prev' | 'none';

const DETAILS_TAB_ORDER: Record<DetailsTabKey, number> = {
  info: 0,
  watch: 1,
  comments: 2,
};

export function getDetailsTabIndex(tab: DetailsTabKey): number {
  return DETAILS_TAB_ORDER[tab] ?? 0;
}

export function getDetailsTabDirection(
  prevTab: DetailsTabKey | null | undefined,
  nextTab: DetailsTabKey,
): DetailsTabDirection {
  if (!prevTab || prevTab === nextTab) return 'none';
  return getDetailsTabIndex(nextTab) > getDetailsTabIndex(prevTab)
    ? 'forward'
    : 'backward';
}

export function getDetailsTabTransitionClass(direction: DetailsTabDirection): string {
  switch (direction) {
    case 'forward':
      return 'sx-details-tab-forward';
    case 'backward':
      return 'sx-details-tab-backward';
    case 'none':
    default:
      return 'sx-details-tab-enter';
  }
}

export function getEpisodeChangeDirection(
  prevIndex: number | null | undefined,
  nextIndex: number,
): EpisodeChangeDirection {
  if (typeof prevIndex !== 'number' || !Number.isFinite(prevIndex)) return 'none';
  if (nextIndex > prevIndex) return 'next';
  if (nextIndex < prevIndex) return 'prev';
  return 'none';
}

export function getEpisodeBadgeTransitionClass(direction: EpisodeChangeDirection): string {
  switch (direction) {
    case 'next':
      return 'sx-ep-badge-next';
    case 'prev':
      return 'sx-ep-badge-prev';
    case 'none':
    default:
      return '';
  }
}

export interface StickyHeroScrollInput {
  scrollY: number;
  heroBottom: number | null | undefined;
  thresholdPx?: number;
}

export function hasScrolledPastHero(input: StickyHeroScrollInput): boolean {
  const threshold = input.thresholdPx ?? 16;
  if (!Number.isFinite(input.scrollY) || input.scrollY <= 20) {
    return false;
  }
  if (typeof input.heroBottom !== 'number' || !Number.isFinite(input.heroBottom)) {
    return false;
  }
  return input.heroBottom <= threshold;
}

export interface StickyHeaderVisibilityInput extends StickyHeroScrollInput {
  activeTab: DetailsTabKey;
}

export function shouldShowDetailsStickyHeader(input: StickyHeaderVisibilityInput): boolean {
  if (input.activeTab === 'watch') {
    return false;
  }
  return hasScrolledPastHero(input);
}


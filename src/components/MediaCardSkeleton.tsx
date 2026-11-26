import React from 'react';
import { AnyMediaCardStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { getContinueWatchingWidthClass } from '../utils/mediaCard';
import { getSkeletonWaveStyle } from '../utils/skeletonMotion';
import { SkeletonBlock } from './Skeleton';

interface MediaCardSkeletonProps {
  style?: AnyMediaCardStyle;
  fullWidth?: boolean;
  index?: number;
}

interface ContinueWatchingCardSkeletonProps {
  fullWidth?: boolean;
  showRemove?: boolean;
  showProgress?: boolean;
  index?: number;
}

export const TrendingRankCardSkeleton: React.FC<{ fullWidth?: boolean; index?: number }> = ({
  fullWidth = false,
  index = 0,
}) => {
  const { state } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <div
      data-testid="trending-rank-skeleton"
      aria-hidden="true"
      style={{
        borderRadius: `calc(${roundness} + 8px)`,
        ...getSkeletonWaveStyle(index),
      }}
      className={`sx-widget-scale sx-skeleton-enter relative overflow-hidden bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]/60 aspect-[4/3] ${
        fullWidth ? 'w-full' : 'shrink-0 w-[232px] sm:w-[285px]'
      }`}
    >
      <SkeletonBlock index={index} tone="soft" className="absolute inset-0 rounded-none" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-t from-slate-950/55 via-slate-900/20 to-transparent dark:from-black/75 dark:via-black/30" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-3.5 pb-3 pt-4 sm:px-4 sm:pb-3.5 flex items-center gap-2.5 sm:gap-3">
        <div className="w-6 h-8 sm:w-7 sm:h-9 rounded-md bg-white/80 dark:bg-white/20 shrink-0" />
        <div className="w-[1.5px] h-8 sm:h-9 bg-white/25 shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-3.5 sm:h-4 w-3/4 rounded bg-white/80 dark:bg-white/22" />
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-8 rounded bg-white/55 dark:bg-white/16" />
            <div className="h-2.5 w-14 rounded bg-white/40 dark:bg-white/12" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const ContinueWatchingCardSkeleton: React.FC<ContinueWatchingCardSkeletonProps> = ({
  fullWidth = false,
  showRemove = true,
  showProgress = true,
  index = 0,
}) => {
  const { state } = useApp();
  const roundness = `${state.themePrefs.uiRoundness}px`;

  return (
    <div
      data-testid="episode-tile-skeleton"
      data-skeleton-variant="continue-watching"
      aria-hidden="true"
      style={getSkeletonWaveStyle(index)}
      className={`sx-widget-scale sx-skeleton-enter relative flex flex-col ${getContinueWatchingWidthClass(fullWidth)}`}
    >
      <div
        style={{ borderRadius: roundness }}
        className="relative w-full aspect-[16/10] overflow-hidden border border-[var(--sx-outline)]/60"
      >
        <SkeletonBlock index={index} className="w-full h-full rounded-none" />
        {showRemove && (
          <SkeletonBlock
            staticBar
            tone="soft"
            className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 w-7 h-7 rounded-full border border-white/15"
          />
        )}
        {showProgress && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/45">
            <SkeletonBlock staticBar tone="accent" className="h-full w-1/2 rounded-none" />
          </div>
        )}
      </div>

      <div className="mt-2 sm:mt-2.5 px-0.5 space-y-1.5">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
            <SkeletonBlock staticBar tone="accent" className="h-[19px] w-7 rounded shrink-0" />
            <SkeletonBlock staticBar className="h-4 w-14 sm:w-16 rounded" />
          </div>
          <SkeletonBlock staticBar tone="soft" className="h-4 w-10 sm:w-12 rounded shrink-0" />
        </div>
        <SkeletonBlock staticBar className="h-[18px] sm:h-[19px] w-4/5 rounded" />
      </div>
    </div>
  );
};

export const EpisodeTileCardSkeleton = ContinueWatchingCardSkeleton;

export const ContinueHistoryCardSkeleton: React.FC<{ index?: number }> = ({ index = 0 }) => {
  return (
    <div
      data-testid="continue-history-card-skeleton"
      aria-hidden="true"
      style={getSkeletonWaveStyle(index)}
      className="sx-skeleton-enter flex items-center gap-3.5 p-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)]"
    >
      <SkeletonBlock index={index} className="w-16 h-24 rounded-xl shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">
        <SkeletonBlock staticBar className="h-4 w-4/5 rounded" />
        <SkeletonBlock staticBar tone="accent" className="h-3.5 w-24 rounded" />
        <div className="flex items-center gap-2 pt-0.5">
          <SkeletonBlock staticBar tone="accent" className="h-7 w-20 rounded-lg" />
          <SkeletonBlock staticBar tone="soft" className="w-7 h-7 rounded-lg" />
        </div>
      </div>
    </div>
  );
};

export const MediaCardSkeleton: React.FC<MediaCardSkeletonProps> = ({
  style: styleOverride,
  fullWidth = false,
  index = 0,
}) => {
  const { state } = useApp();
  const cardStyle = styleOverride ?? state.uiPrefs.cardStyle;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  if (cardStyle === 'trendingRank') {
    return <TrendingRankCardSkeleton fullWidth={fullWidth} index={index} />;
  }

  if (
    cardStyle === 'episodeTile' ||
    cardStyle === 'glassResume' ||
    cardStyle === 'splitProgress' ||
    cardStyle === 'auroraStrip'
  ) {
    return <ContinueWatchingCardSkeleton fullWidth={fullWidth} index={index} />;
  }

  if (cardStyle === 'posterBar') {
    return (
      <div
        aria-hidden="true"
        style={{
          borderRadius: roundness,
          ...getSkeletonWaveStyle(index),
        }}
        className={`sx-widget-scale sx-skeleton-enter sx-glass-panel border border-[var(--sx-outline)] p-2.5 flex items-center gap-3 ${
          fullWidth ? 'w-full' : 'shrink-0 w-[264px] sm:w-[308px]'
        }`}
      >
        <SkeletonBlock index={index} className="w-14 sm:w-16 aspect-[2/3] rounded-lg shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock staticBar tone="accent" className="h-4 w-20 rounded-full" />
          <SkeletonBlock staticBar className="h-4 w-4/5 rounded" />
          <SkeletonBlock staticBar tone="soft" className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    );
  }

  const widthClass = fullWidth
    ? 'w-full'
    : cardStyle === 'showcase' || cardStyle === 'shizutv'
      ? 'shrink-0 w-[158px] sm:w-[174px]'
      : cardStyle === 'glassPoster' || cardStyle === 'auroraPill' || cardStyle === 'prismFrame'
        ? 'shrink-0 w-[154px] sm:w-[170px]'
        : cardStyle === 'compact'
          ? 'shrink-0 w-[122px] sm:w-[132px]'
          : cardStyle === 'minimal'
            ? 'shrink-0 w-[134px] sm:w-[144px]'
            : 'shrink-0 w-[148px] sm:w-[162px]';

  return (
    <div
      data-testid="poster-card-skeleton"
      aria-hidden="true"
      style={getSkeletonWaveStyle(index)}
      className={`sx-widget-scale sx-skeleton-enter space-y-2 ${widthClass}`}
    >
      <SkeletonBlock
        index={index}
        style={{ borderRadius: roundness }}
        className="w-full aspect-[2/3] border border-[var(--sx-outline)]/40"
      />
      <SkeletonBlock staticBar className="h-3.5 w-4/5 rounded" />
      <SkeletonBlock staticBar tone="soft" className="h-2.5 w-1/2 rounded" />
    </div>
  );
};

import React from 'react';
import { EpisodeChapterStyle, HeroBannerStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import {
  getSkeletonWaveStyle,
  resolveSkeletonLineWidths,
} from '../utils/skeletonMotion';

export type SkeletonTone = 'default' | 'soft' | 'accent';

export interface SkeletonBlockProps {
  className?: string;
  style?: React.CSSProperties;
  tone?: SkeletonTone;
  index?: number;
  baseDelayMs?: number;
  /** Render a static skeleton bar without its own ::after shimmer layer when nested inside an already-shimmering card */
  staticBar?: boolean;
}

const SHIMMER_TONE_CLASS: Record<SkeletonTone, string> = {
  default: 'sx-skeleton-surface',
  soft: 'sx-skeleton-surface-soft',
  accent: 'sx-skeleton-surface-accent',
};

const STATIC_TONE_CLASS: Record<SkeletonTone, string> = {
  default: 'sx-skeleton-bar',
  soft: 'sx-skeleton-bar-soft',
  accent: 'sx-skeleton-bar-accent',
};

export const SkeletonBlock: React.FC<SkeletonBlockProps> = ({
  className = '',
  style,
  tone = 'default',
  index = 0,
  baseDelayMs = 0,
  staticBar = false,
}) => {
  const waveStyle = staticBar ? undefined : getSkeletonWaveStyle(index, { baseDelayMs });
  const surfaceClass = staticBar ? STATIC_TONE_CLASS[tone] : SHIMMER_TONE_CLASS[tone];
  return (
    <div
      aria-hidden="true"
      style={waveStyle ? { ...waveStyle, ...style } : style}
      className={`${surfaceClass} rounded-md ${className}`}
    />
  );
};

export const SkeletonText: React.FC<{
  lines?: number;
  lineHeightClass?: string;
  gapClass?: string;
  index?: number;
  pattern?: readonly string[];
  className?: string;
  staticBars?: boolean;
  barClassName?: string;
}> = ({
  lines = 3,
  lineHeightClass = 'h-3.5',
  gapClass = 'space-y-2',
  index = 0,
  pattern,
  className = '',
  staticBars = false,
  barClassName = '',
}) => {
  const widths = resolveSkeletonLineWidths(lines, pattern);
  return (
    <div aria-hidden="true" className={`${gapClass} ${className}`}>
      {widths.map((w, idx) => (
        <SkeletonBlock
          key={idx}
          index={index + idx}
          staticBar={staticBars}
          tone={idx === widths.length - 1 ? 'soft' : 'default'}
          style={{ width: w }}
          className={`${lineHeightClass} rounded ${barClassName}`}
        />
      ))}
    </div>
  );
};

const HERO_SCRIM_CLASS =
  'pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/32 via-slate-900/10 to-slate-900/6 dark:from-black/65 dark:via-black/25 dark:to-black/15';

export const HeroBannerSkeleton: React.FC<{ style?: HeroBannerStyle }> = ({
  style: styleOverride,
}) => {
  const { state } = useApp();
  const bannerStyle = styleOverride ?? state.uiPrefs.heroBannerStyle;

  if (bannerStyle === 'coverflow') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="coverflow"
        className="mx-3 sm:mx-6 sx-skeleton-enter"
      >
        <div className="relative h-[265px] sm:h-[330px] lg:h-[385px] w-full overflow-hidden">
          <div
            aria-hidden="true"
            style={{
              borderRadius: 'calc(var(--sx-radius) + 6px)',
              transform: 'translate3d(-72%, 0, 0) scale(0.84) rotateY(10deg)',
            }}
            className="hidden sm:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-[78%] overflow-hidden border border-[var(--sx-outline)]/60 bg-[var(--sx-surface-container)] opacity-60"
          >
            <SkeletonBlock index={0} staticBar tone="soft" className="w-full h-full rounded-none" />
          </div>
          <div
            aria-hidden="true"
            style={{
              borderRadius: 'calc(var(--sx-radius) + 6px)',
              transform: 'translate3d(72%, 0, 0) scale(0.84) rotateY(-10deg)',
            }}
            className="hidden sm:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-[78%] overflow-hidden border border-[var(--sx-outline)]/60 bg-[var(--sx-surface-container)] opacity-60"
          >
            <SkeletonBlock index={2} staticBar tone="soft" className="w-full h-full rounded-none" />
          </div>

          <div
            style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
            className="relative z-10 mx-auto h-full w-[90%] sm:w-[84%] lg:w-[78%] overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-2xl"
          >
            <SkeletonBlock index={1} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
            <div className={HERO_SCRIM_CLASS} />
            <div className="relative z-10 h-full flex flex-col justify-between p-4 sm:p-6 lg:p-7">
              <div className="flex items-center justify-between">
                <div className="h-6 w-28 rounded-full bg-white/75 dark:bg-white/15 backdrop-blur-sm shadow-sm" />
                <div className="h-6 w-14 rounded-full bg-black/25 dark:bg-white/12 backdrop-blur-sm" />
              </div>
              <div className="flex items-end justify-between gap-4">
                <div className="flex-1 max-w-xl space-y-2">
                  <div className="h-6 sm:h-8 w-3/4 rounded-lg bg-white/80 dark:bg-white/20" />
                  <div className="h-3.5 w-48 rounded bg-white/60 dark:bg-white/14" />
                  <div className="hidden sm:block h-3 w-full max-w-md rounded bg-white/45 dark:bg-white/10" />
                </div>
                <div className="h-9 sm:h-10 w-28 sm:w-32 rounded-full bg-white/80 dark:bg-white/20 shrink-0 shadow-md" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((dot) => (
            <SkeletonBlock
              key={dot}
              staticBar
              tone={dot === 0 ? 'accent' : 'default'}
              className={`h-1 rounded-full ${dot === 0 ? 'w-6' : 'w-3'}`}
            />
          ))}
        </div>
      </section>
    );
  }

  if (bannerStyle === 'splitPoster') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="splitPoster"
        className="mx-4 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
          className="relative min-h-[240px] sm:min-h-[300px] lg:min-h-[340px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl flex items-center"
        >
          <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
          <div className={HERO_SCRIM_CLASS} />
          <div className="relative z-10 w-full flex items-center gap-4 sm:gap-7 p-4 sm:p-7 lg:p-9">
            <SkeletonBlock
              index={1}
              className="w-[104px] sm:w-[144px] lg:w-[170px] aspect-[2/3] rounded-xl shrink-0 border border-white/25 dark:border-white/12 shadow-lg"
            />
            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="flex items-center gap-2">
                <div className="h-4 w-24 rounded-full bg-white/75 dark:bg-white/18" />
                <div className="h-4 w-12 rounded-full bg-white/55 dark:bg-white/12" />
              </div>
              <div className="h-6 sm:h-8 w-4/5 max-w-md rounded-lg bg-white/85 dark:bg-white/22" />
              <div className="h-3.5 w-44 rounded bg-white/60 dark:bg-white/14" />
              <div className="hidden sm:block max-w-xl space-y-1.5">
                <div className="h-3 w-full rounded bg-white/45 dark:bg-white/12" />
                <div className="h-3 w-2/3 rounded bg-white/35 dark:bg-white/10" />
              </div>
              <div className="pt-1 flex items-center gap-2">
                <div className="h-8 sm:h-9 w-28 rounded-xl bg-white/85 dark:bg-white/22" />
                <div className="h-8 sm:h-9 w-22 rounded-xl bg-white/55 dark:bg-white/14" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {[0, 1, 2, 3].map((dot) => (
            <SkeletonBlock
              key={dot}
              staticBar
              tone={dot === 0 ? 'accent' : 'default'}
              className={`h-1.5 rounded-full ${dot === 0 ? 'w-6' : 'w-2'}`}
            />
          ))}
        </div>
      </section>
    );
  }

  if (bannerStyle === 'minimal') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="minimal"
        className="mx-4 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
          className="relative h-[205px] sm:h-[250px] lg:h-[290px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-lg"
        >
          <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
          <div className={HERO_SCRIM_CLASS} />
          <div className="relative z-10 h-full p-4 sm:p-6 flex items-end justify-between gap-4">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-40 rounded-full bg-white/75 dark:bg-white/18" />
              <div className="h-6 sm:h-7 w-2/3 max-w-lg rounded-lg bg-white/85 dark:bg-white/22" />
            </div>
            <div className="h-9 w-28 rounded-xl bg-white/85 dark:bg-white/22 shrink-0" />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <SkeletonBlock staticBar className="h-3.5 w-12 rounded" />
          <div className="flex items-center gap-1.5">
            <SkeletonBlock staticBar className="w-8 h-8 rounded-lg" />
            <SkeletonBlock staticBar className="w-8 h-8 rounded-lg" />
          </div>
        </div>
      </section>
    );
  }

  if (bannerStyle === 'cinematic') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="cinematic"
        className="mx-4 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative h-[290px] sm:h-[360px] lg:h-[420px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-2xl"
        >
          <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
          <div className={HERO_SCRIM_CLASS} />
          <div className="relative z-10 h-full flex flex-col justify-end items-center text-center p-5 sm:p-8 lg:p-10">
            <div className="w-full max-w-xl flex flex-col items-center space-y-2.5">
              <div className="h-4 w-48 rounded-full bg-white/75 dark:bg-white/18" />
              <div className="h-7 sm:h-9 w-3/4 rounded-lg bg-white/85 dark:bg-white/22" />
              <div className="hidden sm:block h-3.5 w-4/5 rounded bg-white/50 dark:bg-white/14" />
              <div className="pt-2 flex items-center justify-center gap-2.5">
                <div className="h-10 w-32 rounded-xl bg-white/85 dark:bg-white/22" />
                <div className="h-10 w-24 rounded-xl bg-white/55 dark:bg-white/14" />
              </div>
            </div>
          </div>
        </div>
        <div className="mt-2.5 grid grid-cols-4 gap-1.5 max-w-md mx-auto">
          {[0, 1, 2, 3].map((dot) => (
            <SkeletonBlock
              key={dot}
              staticBar
              tone={dot === 0 ? 'accent' : 'default'}
              className="h-1 rounded-full"
            />
          ))}
        </div>
      </section>
    );
  }

  if (
    bannerStyle === 'liquidGlass' ||
    bannerStyle === 'spotlightCard' ||
    bannerStyle === 'auroraSplit' ||
    bannerStyle === 'edgeCarousel'
  ) {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style={bannerStyle}
        className="mx-4 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative h-[260px] sm:h-[330px] lg:h-[380px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl flex flex-col justify-between p-4 sm:p-6"
        >
          <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
          <div className={HERO_SCRIM_CLASS} />
          <div className="relative z-10 flex items-center justify-between">
            <div className="h-6 w-28 rounded-full bg-white/75 dark:bg-white/15 backdrop-blur-sm" />
            <div className="h-6 w-16 rounded-full bg-black/25 dark:bg-white/12 backdrop-blur-sm" />
          </div>
          <div className="relative z-10 rounded-2xl bg-black/30 backdrop-blur-md border border-white/15 p-3.5 sm:p-5 flex items-end justify-between gap-4">
            <div className="flex-1 space-y-2">
              <div className="h-6 sm:h-8 w-2/3 rounded-lg bg-white/80 dark:bg-white/20" />
              <div className="h-3.5 w-44 rounded bg-white/60 dark:bg-white/14" />
            </div>
            <div className="h-9 w-28 rounded-full bg-white/80 dark:bg-white/20 shrink-0" />
          </div>
        </div>
      </section>
    );
  }

  if (bannerStyle === 'rankedDeck') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="rankedDeck"
        className="mx-3 sm:mx-6 sx-skeleton-enter"
      >
        <div className="relative h-[320px] sm:h-[385px] lg:h-[430px] w-full overflow-hidden flex items-center justify-center px-2">
          <SkeletonBlock
            index={0}
            tone="soft"
            style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
            className="-mr-5 sm:-mr-6 w-[135px] sm:w-[195px] lg:w-[225px] h-[80%] border border-[var(--sx-outline)]/60 opacity-60 scale-95 shrink-0"
          />
          <SkeletonBlock
            index={1}
            style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
            className="relative z-10 w-[224px] sm:w-[272px] lg:w-[308px] h-full border border-[var(--sx-outline)] shadow-xl shrink-0"
          />
          <SkeletonBlock
            index={2}
            tone="soft"
            style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
            className="-ml-5 sm:-ml-6 w-[135px] sm:w-[195px] lg:w-[225px] h-[80%] border border-[var(--sx-outline)]/60 opacity-60 scale-95 shrink-0"
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-2">
          <SkeletonBlock staticBar className="h-4 w-44 rounded" />
          <SkeletonBlock staticBar tone="accent" className="h-5 w-10 rounded-md" />
        </div>
      </section>
    );
  }

  if (bannerStyle === 'glassFrame') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="glassFrame"
        className="mx-4 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 12px)' }}
          className="relative max-w-3xl mx-auto h-[305px] sm:h-[360px] lg:h-[395px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-2xl flex flex-col justify-between p-4 sm:p-6"
        >
          <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
          <div className={HERO_SCRIM_CLASS} />
          <div className="relative z-10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-11 h-11 rounded-full bg-white/85 dark:bg-white/20" />
              <div className="h-10 w-24 rounded-full bg-black/25 dark:bg-white/14" />
            </div>
            <div className="w-11 h-11 rounded-full bg-black/25 dark:bg-white/14" />
          </div>
          <div className="relative z-10 space-y-2 max-w-[65%]">
            <div className="h-7 w-48 rounded-lg bg-white/85 dark:bg-white/22" />
            <div className="h-3.5 w-32 rounded bg-white/60 dark:bg-white/14" />
          </div>
          <div className="relative z-10 flex items-end justify-between">
            <div className="h-12 w-40 rounded-full bg-black/25 dark:bg-white/14" />
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white/85 dark:bg-white/22" />
          </div>
        </div>
      </section>
    );
  }

  if (bannerStyle === 'prismCoverflow') {
    return (
      <section
        aria-label="Loading featured hero banner"
        aria-busy="true"
        data-testid="hero-banner-skeleton"
        data-banner-style="prismCoverflow"
        className="mx-3 sm:mx-6 sx-skeleton-enter"
      >
        <div
          style={{ borderRadius: 'calc(var(--sx-radius) + 12px)' }}
          className="relative bg-[#090a0f] border border-white/10 px-2 py-5 sm:px-5 sm:py-7 shadow-2xl overflow-hidden"
        >
          <div className="relative h-[225px] sm:h-[290px] lg:h-[330px] w-full flex items-center justify-center">
            <SkeletonBlock index={0} tone="soft" className="w-[150px] sm:w-[205px] aspect-square -mr-10 opacity-50 rounded-xl" />
            <SkeletonBlock index={1} className="relative z-10 w-[184px] sm:w-[250px] lg:w-[285px] aspect-square rounded-2xl border border-white/20 shadow-2xl" />
            <SkeletonBlock index={2} tone="soft" className="w-[150px] sm:w-[205px] aspect-square -ml-10 opacity-50 rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  // Default: 'classic'
  return (
    <section
      aria-label="Loading featured hero banner"
      aria-busy="true"
      data-testid="hero-banner-skeleton"
      data-banner-style="classic"
      className="mx-4 sm:mx-6 sx-skeleton-enter"
    >
      <div
        style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
        className="relative h-[245px] sm:h-[320px] lg:h-[380px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl"
      >
        <SkeletonBlock index={0} tone="soft" className="absolute inset-0 w-full h-full rounded-none" />
        <div className={HERO_SCRIM_CLASS} />
        <div className="relative z-10 h-full flex flex-col justify-between px-5 py-3.5 sm:px-7 sm:py-6 lg:px-9 lg:py-7">
          <div className="flex items-center justify-between gap-3">
            <div className="h-7 w-28 rounded-full bg-white/85 dark:bg-white/20 shadow-sm" />
            <div className="h-7 w-16 rounded-full bg-slate-900/20 dark:bg-white/14 border border-white/20" />
          </div>
          <div className="space-y-2">
            <div className="h-6 sm:h-9 w-2/3 max-w-lg rounded-lg bg-white/85 dark:bg-white/22 shadow-sm" />
            <div className="h-4 w-44 rounded bg-white/65 dark:bg-white/15" />
            <div className="pt-0.5 flex items-end justify-between gap-4">
              <div className="min-w-0 flex-1 max-w-xl space-y-1.5">
                <div className="h-3 w-full max-w-md rounded bg-white/50 dark:bg-white/12" />
                <div className="h-3 w-3/5 max-w-xs rounded bg-white/40 dark:bg-white/10" />
              </div>
              <div className="h-9 sm:h-10 w-28 sm:w-32 rounded-full bg-white/85 dark:bg-white/22 border border-white/25 shrink-0 shadow-md" />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-center gap-1.5">
        {[0, 1, 2, 3].map((dot) => (
          <SkeletonBlock
            key={dot}
            staticBar
            tone={dot === 0 ? 'accent' : 'default'}
            className={`h-1 rounded-full ${dot === 0 ? 'w-6' : 'w-3'}`}
          />
        ))}
      </div>
    </section>
  );
};

export const CalendarSectionSkeleton: React.FC<{ index?: number; cards?: number }> = ({
  index = 0,
  cards = 3,
}) => {
  return (
    <section
      data-testid="calendar-section-skeleton"
      aria-hidden="true"
      style={getSkeletonWaveStyle(index)}
      className="sx-skeleton-enter rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] p-4 space-y-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <SkeletonBlock staticBar tone="accent" className="w-4 h-4 rounded" />
          <SkeletonBlock index={index} className="h-4 w-36 sm:w-44 rounded" />
        </div>
        <SkeletonBlock staticBar tone="soft" className="h-3.5 w-16 rounded-full" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: cards }).map((_, cardIdx) => (
          <div
            key={cardIdx}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--sx-surface-high)]/45 border border-[var(--sx-outline)]/45"
          >
            <SkeletonBlock index={index + cardIdx} className="w-12 h-16 rounded-lg shrink-0" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock staticBar className="h-3.5 w-4/5 rounded" />
              <SkeletonBlock staticBar tone="accent" className="h-3 w-24 rounded" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export const DetailsHeroSkeleton: React.FC<{ roundness?: number }> = ({ roundness = 24 }) => {
  return (
    <section
      data-testid="details-hero-skeleton"
      aria-label="Loading media details"
      aria-busy="true"
      className="sx-skeleton-enter space-y-4 mb-6"
    >
      <div className="flex items-end sm:items-center gap-4 sm:gap-6">
        <SkeletonBlock
          index={0}
          style={{ borderRadius: `${roundness}px` }}
          className="w-28 sm:w-36 aspect-[2/3] shrink-0 border border-[var(--sx-outline)] shadow-2xl"
        />
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-2">
            <SkeletonBlock index={1} className="h-6 sm:h-8 w-4/5 max-w-md rounded-lg" />
            <SkeletonBlock staticBar tone="soft" className="h-4 w-2/5 max-w-xs rounded" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SkeletonBlock staticBar className="h-6 w-24 rounded-full" />
            <SkeletonBlock staticBar tone="accent" className="h-6 w-20 rounded-full" />
            <SkeletonBlock staticBar className="h-6 w-14 rounded-full" />
          </div>
        </div>
      </div>

      <SkeletonBlock
        index={2}
        tone="accent"
        className="w-full h-12 rounded-[var(--sx-radius)] border border-white/25 dark:border-white/10"
      />
    </section>
  );
};

export const DetailsSynopsisSkeleton: React.FC = () => (
  <div data-testid="details-synopsis-skeleton" aria-hidden="true">
    <SkeletonText
      lines={4}
      lineHeightClass="h-3.5"
      gapClass="space-y-2.5"
      pattern={['96%', '92%', '84%', '62%']}
    />
  </div>
);

export const EpisodeListSkeleton: React.FC<{
  style?: EpisodeChapterStyle;
  count?: number;
}> = ({ style = 'classic', count = 6 }) => {
  if (style === 'box') {
    return (
      <div
        data-testid="episode-list-skeleton"
        aria-busy="true"
        aria-label="Loading episodes"
        className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-6 gap-2.5"
      >
        {Array.from({ length: count * 2 }).map((_, i) => (
          <SkeletonBlock
            key={i}
            index={i}
            style={getSkeletonWaveStyle(i)}
            className="sx-skeleton-enter h-[58px] rounded-[var(--sx-radius)] border border-[var(--sx-outline)]/60"
          />
        ))}
      </div>
    );
  }

  if (style === 'grid') {
    return (
      <div
        data-testid="episode-list-skeleton"
        aria-busy="true"
        aria-label="Loading episodes"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
      >
        {Array.from({ length: count }).map((_, i) => (
          <div
            key={i}
            style={getSkeletonWaveStyle(i)}
            className="sx-skeleton-enter relative aspect-[16/10] rounded-[var(--sx-radius)] overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)]"
          >
            <SkeletonBlock index={i} tone="soft" className="w-full h-full rounded-none" />
            <div className="absolute bottom-3 inset-x-3 space-y-1.5">
              <div className="h-4 w-2/3 rounded bg-white/75 dark:bg-white/20" />
              <div className="h-3 w-1/3 rounded bg-white/50 dark:bg-white/14" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      data-testid="episode-list-skeleton"
      aria-busy="true"
      aria-label="Loading episodes"
      className="space-y-2.5"
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={getSkeletonWaveStyle(i)}
          className="sx-skeleton-enter flex items-center gap-3 p-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/40 border border-[var(--sx-outline)]"
        >
          {style === 'cover' ? (
            <SkeletonBlock index={i} className="w-28 sm:w-32 aspect-video rounded-xl shrink-0" />
          ) : (
            <SkeletonBlock index={i} tone="accent" className="w-8 h-8 rounded-full shrink-0" />
          )}
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock staticBar tone="accent" className="h-2.5 w-20 rounded" />
            <SkeletonBlock staticBar className="h-4 w-3/4 rounded" />
            <SkeletonBlock staticBar tone="soft" className="h-3 w-1/3 rounded" />
          </div>
          <SkeletonBlock staticBar tone="soft" className="w-8 h-8 rounded-lg shrink-0" />
        </div>
      ))}
    </div>
  );
};

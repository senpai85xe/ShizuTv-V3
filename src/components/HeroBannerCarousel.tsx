import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight, Flame, Heart, Info, Play, Star } from 'lucide-react';
import { HeroBannerStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { getPreferredTitle, UnifiedMedia } from '../types/media';
import { HeroBannerSkeleton } from './Skeleton';
import { SmartImage } from './SmartImage';
import {
  formatHeroMetadata,
  formatHeroScore,
  formatHeroSlideCounter,
  getHeroCtaLabel,
  getHeroRankBadgeLabel,
  getStageCoverflowMetrics,
  resolveHeroBannerStyle,
  selectHeroSlides,
  stripHtmlTags,
  wrapSlideIndex,
} from '../utils/heroBanner';
import { getCoverflowCardMetrics } from '../utils/cardMotion';
import { resolveBackgroundPollIntervalMs } from '../utils/batterySaver';

interface HeroBannerCarouselProps {
  items: UnifiedMedia[];
  loading?: boolean;
  paused?: boolean;
  styleOverride?: HeroBannerStyle;
  onSelectMedia: (media: UnifiedMedia) => void;
  onWatchNow?: (media: UnifiedMedia) => void;
}

export const HeroBannerCarousel: React.FC<HeroBannerCarouselProps> = ({
  items,
  loading = false,
  paused = false,
  styleOverride,
  onSelectMedia,
  onWatchNow,
}) => {
  const { state, batterySaver, getLibraryEntry, upsertLibraryEntry, removeLibraryEntry } = useApp();
  const bannerStyle = resolveHeroBannerStyle(styleOverride ?? state.uiPrefs.heroBannerStyle);
  const slides = selectHeroSlides(items, 5);
  const [activeIndex, setActiveIndex] = useState(0);
  const [slideChangeCount, setSlideChangeCount] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const touchStartX = useRef<number | null>(null);

  const safeIndex = slides.length > 0 ? Math.min(activeIndex, slides.length - 1) : 0;
  const activeItem = slides[safeIndex];

  useEffect(() => {
    const intervalMs = resolveBackgroundPollIntervalMs(6500, batterySaver);
    if (intervalMs === null || slides.length <= 1 || isPaused || paused) return;
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((prev) => wrapSlideIndex(prev, 1, slides.length));
      setSlideChangeCount((c) => c + 1);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [slides.length, isPaused, paused, batterySaver]);

  if (loading && slides.length === 0) {
    return <HeroBannerSkeleton style={bannerStyle} />;
  }

  if (!activeItem) {
    return null;
  }

  const handlePrev = () => {
    setActiveIndex((prev) => wrapSlideIndex(prev, -1, slides.length));
    setSlideChangeCount((c) => c + 1);
  };

  const handleNext = () => {
    setActiveIndex((prev) => wrapSlideIndex(prev, 1, slides.length));
    setSlideChangeCount((c) => c + 1);
  };

  const handleDotSelect = (idx: number) => {
    if (idx === safeIndex) return;
    setActiveIndex(idx);
    setSlideChangeCount((c) => c + 1);
  };

  const slideAnimClass = slideChangeCount > 0 && !batterySaver ? 'sx-hero-enter' : '';
  const slideAnimKey = slideChangeCount > 0 ? `${activeItem.id}-${slideChangeCount}` : 'initial';

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrev();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNext();
    }
  };

  const swipeProps = {
    onTouchStart: (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (touchStartX.current === null || slides.length <= 1) return;
      const endX = e.changedTouches[0]?.clientX ?? touchStartX.current;
      const dx = endX - touchStartX.current;
      touchStartX.current = null;
      if (Math.abs(dx) > 40) {
        if (dx < 0) handleNext();
        else handlePrev();
      }
    },
  };

  const activeTitle = getPreferredTitle(activeItem.title, state.contentPrefs.titlePreference);
  const activeMeta = formatHeroMetadata(activeItem);
  const activeScore = formatHeroScore(activeItem.score);
  const activeSynopsis = stripHtmlTags(activeItem.description);
  const activeCta = getHeroCtaLabel(activeItem.type);
  const activeIsReading = activeItem.type === 'MANGA';

  // 1. Classic Style (Matches reference screenshot: pill badges, edge arrows, frosted pill CTA, dash indicators)
  if (bannerStyle === 'classic') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="classic"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative group" {...swipeProps}>
          <div
            style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
            className="relative h-[245px] sm:h-[320px] lg:h-[380px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl"
          >
            <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
              <SmartImage
                src={activeItem.banner || activeItem.cover}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className={`w-full h-full ${
                  batterySaver ? '' : 'transition-transform duration-700 ease-out group-hover:scale-[1.03]'
                }`}
              />
            </div>

            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/45 to-black/20" />
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/75 via-black/25 to-transparent" />

            <button
              type="button"
              data-no-press="true"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open details for ${activeTitle}`}
              className="absolute inset-0 z-10 w-full h-full text-left focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
            />

            <div
              key={`classic-meta-${slideAnimKey}`}
              className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between px-5 py-3.5 sm:px-7 sm:py-6 lg:px-9 lg:py-7 ${slideAnimClass}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  data-testid="hero-rank-badge"
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/95 text-slate-950 text-[11px] sm:text-xs font-extrabold shadow-md whitespace-nowrap"
                >
                  <span>{getHeroRankBadgeLabel(safeIndex, activeItem.type)}</span>
                  <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                </span>

                {activeScore && (
                  <span
                    data-testid="hero-score-badge"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/65 backdrop-blur-md text-white border border-white/15 text-[11px] sm:text-xs font-bold tabular-nums shadow-md whitespace-nowrap"
                  >
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{activeScore}</span>
                  </span>
                )}
              </div>

              <div className="space-y-1.5">
                <h2
                  data-testid="hero-slide-title"
                  className="text-xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow text-balance max-w-2xl"
                >
                  {activeTitle}
                </h2>

                {activeMeta.length > 0 && (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm font-semibold text-white/90 tabular-nums">
                    {activeMeta.map((part, partIdx) => (
                      <React.Fragment key={`${part}-${partIdx}`}>
                        {partIdx > 0 && (
                          <span aria-hidden="true" className="text-white/55">
                            ·
                          </span>
                        )}
                        <span>{part}</span>
                      </React.Fragment>
                    ))}
                  </div>
                )}

                <div className="pt-0.5 flex flex-row items-end justify-between gap-3 sm:gap-6">
                  {activeSynopsis ? (
                    <p className="min-w-0 flex-1 text-[11px] sm:text-xs text-white/75 line-clamp-2 leading-snug sm:leading-relaxed max-w-xl">
                      {activeSynopsis}
                    </p>
                  ) : (
                    <div className="flex-1" />
                  )}

                  <button
                    type="button"
                    onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                    className="pointer-events-auto self-end inline-flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full bg-black/60 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/25 hover:border-[var(--sx-primary)] backdrop-blur-md text-xs sm:text-sm font-bold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                  >
                    {activeIsReading ? (
                      <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <Play className="w-3.5 h-3.5 sm:w-4 sm:h-4 fill-current" />
                    )}
                    <span>{activeCta}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="absolute -left-2.5 sm:-left-3.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="absolute -right-2.5 sm:-right-3.5 top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 flex items-center justify-center gap-1"
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-2 px-1 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
                >
                  <span
                    className={`block h-1 rounded-full transition-all duration-300 ease-out ${
                      active
                        ? 'w-6 bg-[var(--sx-primary)]'
                        : 'w-3 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 2. Cinematic Style (Widescreen centered theatrical spotlight + progress bars)
  if (bannerStyle === 'cinematic') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="cinematic"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group h-[290px] sm:h-[360px] lg:h-[420px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-2xl"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          </div>

          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black via-black/55 to-black/20" />
          <div className="pointer-events-none absolute inset-0 z-[5] bg-radial from-transparent via-black/10 to-black/55" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
          />

          <div
            key={`cinematic-meta-${slideAnimKey}`}
            className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-end items-center text-center p-5 sm:p-8 lg:p-10 ${slideAnimClass}`}
          >
            <div className="max-w-2xl space-y-2">
              <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold uppercase tracking-widest text-white/85 tabular-nums">
                <span className="text-[var(--sx-primary)]">
                  {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
                </span>
                {activeScore && (
                  <>
                    <span aria-hidden="true" className="text-white/45">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-white">
                      <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                      {activeScore}
                    </span>
                  </>
                )}
                {activeMeta.slice(0, 3).map((part, idx) => (
                  <React.Fragment key={`${part}-${idx}`}>
                    <span aria-hidden="true" className="text-white/45">
                      ·
                    </span>
                    <span>{part}</span>
                  </React.Fragment>
                ))}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-xl sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow text-balance"
              >
                {activeTitle}
              </h2>

              {activeSynopsis && (
                <p className="hidden sm:block text-xs sm:text-sm text-white/75 line-clamp-2 max-w-xl mx-auto">
                  {activeSynopsis}
                </p>
              )}

              <div className="pt-2 flex items-center justify-center gap-2.5 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-xs sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                >
                  {activeIsReading ? (
                    <BookOpen className="w-4 h-4" />
                  ) : (
                    <Play className="w-4 h-4 fill-current" />
                  )}
                  <span>{activeCta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeItem)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-md text-xs sm:text-sm font-bold transition-all active:scale-95 whitespace-nowrap focus-visible:outline-2 focus-visible:outline-white"
                >
                  <Info className="w-4 h-4" />
                  <span>Details</span>
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="absolute left-3 top-4 sm:top-1/2 sm:-translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all active:scale-90"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="absolute right-3 top-4 sm:top-1/2 sm:-translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all active:scale-90"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 grid gap-1.5 max-w-md mx-auto"
            style={{ gridTemplateColumns: `repeat(${slides.length}, minmax(0, 1fr))` }}
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-1.5 flex items-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
                >
                  <span
                    className={`block w-full h-1 rounded-full transition-all duration-300 ${
                      active
                        ? 'bg-[var(--sx-primary)]'
                        : 'bg-[var(--sx-on-surface-muted)]/25 hover:bg-[var(--sx-on-surface-muted)]/55'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 3. Poster Spotlight Style (Blurred backdrop + elevated portrait poster + quick details)
  if (bannerStyle === 'splitPoster') {
    const unitCount = activeIsReading ? activeItem.chapters : activeItem.episodes;
    const unitLabel = activeIsReading ? 'Ch' : 'Ep';

    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="splitPoster"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 6px)' }}
          className="relative group min-h-[240px] sm:min-h-[300px] lg:min-h-[340px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl flex items-center"
        >
          {/* Blurred Ambient Backdrop */}
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt=""
              fallbackTitle={activeTitle}
              className="w-full h-full scale-110 blur-md brightness-50"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/90 via-black/75 to-black/50" />

          <div
            key={`split-meta-${slideAnimKey}`}
            className={`relative z-20 w-full flex items-center gap-4 sm:gap-7 p-4 sm:p-7 lg:p-9 ${slideAnimClass}`}
          >
            {/* Portrait Poster Cover */}
            <button
              type="button"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open poster details for ${activeTitle}`}
              className="relative w-[104px] sm:w-[144px] lg:w-[170px] aspect-[2/3] rounded-xl overflow-hidden border border-white/15 shadow-2xl shrink-0 bg-[var(--sx-surface-high)] transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            >
              <SmartImage
                src={activeItem.cover || activeItem.banner}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className="w-full h-full"
              />
            </button>

            {/* Right Metadata + Actions */}
            <div className="min-w-0 flex-1 space-y-2 sm:space-y-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold text-white/85 tabular-nums">
                <span className="text-[var(--sx-primary)] uppercase tracking-wider whitespace-nowrap">
                  {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
                </span>
                {activeScore && (
                  <span className="inline-flex items-center gap-1 text-white whitespace-nowrap">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    {activeScore}
                  </span>
                )}
                {unitCount ? (
                  <span className="text-white/75 whitespace-nowrap">
                    {unitCount} {unitLabel}
                  </span>
                ) : null}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-base sm:text-2xl lg:text-3xl font-black text-white leading-tight tracking-tight line-clamp-2 text-balance"
              >
                {activeTitle}
              </h2>

              {activeMeta.length > 0 && (
                <div className="flex flex-wrap items-center gap-x-1.5 text-[11px] sm:text-xs font-semibold text-white/75 tabular-nums">
                  {activeMeta.map((part, idx) => (
                    <React.Fragment key={`${part}-${idx}`}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <span>{part}</span>
                    </React.Fragment>
                  ))}
                </div>
              )}

              {activeSynopsis && (
                <p className="text-[11px] sm:text-xs text-white/75 line-clamp-2 sm:line-clamp-3 leading-snug sm:leading-relaxed max-w-2xl">
                  {activeSynopsis}
                </p>
              )}

              <div className="pt-1 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-[11px] sm:text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-md"
                >
                  {activeIsReading ? (
                    <BookOpen className="w-3.5 h-3.5" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{activeCta}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onSelectMedia(activeItem)}
                  className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-white/12 hover:bg-white/20 text-white border border-white/15 text-[11px] sm:text-xs font-bold transition-all active:scale-95 whitespace-nowrap"
                >
                  <Info className="w-3.5 h-3.5" />
                  <span>Details</span>
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="hidden sm:flex absolute left-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/60 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/60 hover:bg-[var(--sx-primary)] text-white border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div
            className="mt-2.5 flex items-center justify-center gap-1"
            role="tablist"
            aria-label="Hero banner slides"
          >
            {slides.map((slide, idx) => {
              const active = idx === safeIndex;
              const slideTitle = getPreferredTitle(
                slide.title,
                state.contentPrefs.titlePreference,
              );
              return (
                <button
                  key={slide.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                  onClick={() => handleDotSelect(idx)}
                  className="py-2 px-1 flex items-center justify-center rounded"
                >
                  <span
                    className={`block h-1.5 rounded-full transition-all duration-300 ${
                      active
                        ? 'w-6 bg-[var(--sx-primary)]'
                        : 'w-2 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                    }`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </section>
    );
  }

  // 4. Minimal Style (Compact editorial strip + tabular counter & micro nav)
  if (bannerStyle === 'minimal') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="minimal"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
          className="relative group h-[205px] sm:h-[250px] lg:h-[290px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-lg"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.02]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/40 to-transparent" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
          />

          <div
            key={`minimal-meta-${slideAnimKey}`}
            className={`pointer-events-none absolute inset-x-0 bottom-0 z-20 p-4 sm:p-6 flex items-end justify-between gap-4 ${slideAnimClass}`}
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[11px] sm:text-xs font-bold text-white/80 tabular-nums">
                <span className="text-[var(--sx-primary)]">#{safeIndex + 1}</span>
                {activeMeta.slice(0, 2).map((part, idx) => (
                  <React.Fragment key={`${part}-${idx}`}>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span>{part}</span>
                  </React.Fragment>
                ))}
                {activeScore && (
                  <>
                    <span aria-hidden="true" className="text-white/40">
                      ·
                    </span>
                    <span className="inline-flex items-center gap-1 text-white">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                      {activeScore}
                    </span>
                  </>
                )}
              </div>

              <h2
                data-testid="hero-slide-title"
                className="text-lg sm:text-2xl lg:text-3xl font-black text-white leading-tight tracking-tight line-clamp-1 sm:line-clamp-2 drop-shadow"
              >
                {activeTitle}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
              className="pointer-events-auto shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-xs font-bold transition-all active:scale-95 whitespace-nowrap shadow-md"
            >
              {activeIsReading ? (
                <BookOpen className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>{activeCta}</span>
            </button>
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-2 flex items-center justify-between gap-3 px-1">
            <span className="text-[11px] font-mono-tabular font-bold text-[var(--sx-on-surface-muted)]">
              {formatHeroSlideCounter(safeIndex, slides.length)}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="w-8 h-8 rounded-lg flex items-center justify-center sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:border-[var(--sx-primary)] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="w-8 h-8 rounded-lg flex items-center justify-center sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:border-[var(--sx-primary)] transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  // 5. Liquid Glass Style (Floating frosted HUD card anchored over crisp artwork)
  if (bannerStyle === 'liquidGlass') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="liquidGlass"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group h-[265px] sm:h-[330px] lg:h-[385px] w-full overflow-hidden border border-white/20 dark:border-white/12 bg-[var(--sx-surface-container)] shadow-2xl"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/75 via-black/25 to-black/15" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
          />

          <div
            key={`liquid-meta-${slideAnimKey}`}
            className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-3.5 sm:p-6 ${slideAnimClass}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                data-testid="hero-rank-badge"
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/45 backdrop-blur-xl border border-white/20 text-white text-[11px] sm:text-xs font-extrabold"
              >
                <Flame className="w-3.5 h-3.5 text-[var(--sx-primary)] fill-[var(--sx-primary)]" />
                <span>{getHeroRankBadgeLabel(safeIndex, activeItem.type)}</span>
              </span>
              {activeScore && (
                <span
                  data-testid="hero-score-badge"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-xl border border-white/20 text-white text-[11px] font-bold tabular-nums"
                >
                  <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                  <span>{activeScore}</span>
                </span>
              )}
            </div>

            <div className="pointer-events-auto rounded-2xl bg-black/48 backdrop-blur-2xl border border-white/20 p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-3 shadow-2xl">
              <div className="min-w-0 flex-1 space-y-1">
                <h2
                  data-testid="hero-slide-title"
                  className="text-lg sm:text-2xl lg:text-3xl font-black text-white leading-tight line-clamp-2 drop-shadow"
                >
                  {activeTitle}
                </h2>
                {activeMeta.length > 0 && (
                  <p className="text-[11px] sm:text-xs font-semibold text-white/80 truncate tabular-nums">
                    {activeMeta.join(' · ')}
                  </p>
                )}
                {activeSynopsis && (
                  <p className="hidden sm:block text-xs text-white/70 line-clamp-1 max-w-2xl">
                    {activeSynopsis}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/20 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/25 backdrop-blur-md text-xs font-extrabold transition-all active:scale-95 whitespace-nowrap"
                >
                  {activeIsReading ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{activeCta}</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Hero banner slides">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => handleDotSelect(idx)}
                className="py-1.5 px-0.5"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-300 ${
                    idx === safeIndex ? 'w-7 bg-[var(--sx-primary)]' : 'w-2 bg-[var(--sx-on-surface-muted)]/35'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // 6. Spotlight Card Style (Ambient aura backdrop framing an elevated glass card deck)
  if (bannerStyle === 'spotlightCard') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="spotlightCard"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group p-2.5 sm:p-4 overflow-hidden sx-glass-panel border border-[var(--sx-outline)] shadow-xl"
        >
          <div className="pointer-events-none absolute inset-0 z-0 opacity-35 overflow-hidden">
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt=""
              fallbackTitle={activeTitle}
              className="w-full h-full scale-115 blur-2xl"
            />
          </div>

          <div
            style={{ borderRadius: 'var(--sx-radius)' }}
            className="relative z-10 h-[230px] sm:h-[300px] lg:h-[350px] w-full overflow-hidden border border-white/20 shadow-2xl"
          >
            <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
              <SmartImage
                src={activeItem.banner || activeItem.cover}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
              />
            </div>
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/92 via-black/35 to-black/15" />

            <button
              type="button"
              data-no-press="true"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open details for ${activeTitle}`}
              className="absolute inset-0 z-10 w-full h-full cursor-pointer"
            />

            <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6">
              <div className="flex items-center justify-between gap-2">
                <span className="px-3 py-1 rounded-full sx-glass-active text-[11px] font-extrabold backdrop-blur-md">
                  {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
                </span>
                <div className="pointer-events-auto flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handlePrev}
                    aria-label="Previous featured slide"
                    className="w-8 h-8 rounded-full bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={handleNext}
                    aria-label="Next featured slide"
                    className="w-8 h-8 rounded-full bg-black/55 hover:bg-[var(--sx-primary)] text-white border border-white/20 backdrop-blur-md flex items-center justify-center transition-colors"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <h2
                    data-testid="hero-slide-title"
                    className="text-lg sm:text-3xl font-black text-white leading-tight line-clamp-2 drop-shadow"
                  >
                    {activeTitle}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-semibold text-white/85 tabular-nums">
                    {activeScore && (
                      <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        {activeScore}
                      </span>
                    )}
                    {activeMeta.slice(0, 3).map((m, idx) => (
                      <span key={idx}>· {m}</span>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  className="pointer-events-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-lg whitespace-nowrap shrink-0"
                >
                  {activeIsReading ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                  <span>{activeCta}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // 7. Aurora Split Style (Asymmetric frosted card with cover thumb + Details & Watch)
  if (bannerStyle === 'auroraSplit') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="auroraSplit"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group min-h-[245px] sm:min-h-[305px] w-full overflow-hidden border border-[var(--sx-primary)]/30 bg-[var(--sx-surface-container)] shadow-[0_18px_40px_-20px_var(--sx-primary)] flex flex-col justify-end"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.04]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/90 via-black/60 to-black/20" />
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/90 via-transparent to-black/25" />

          <div
            key={`aurora-meta-${slideAnimKey}`}
            className={`relative z-20 p-4 sm:p-7 flex flex-col sm:flex-row sm:items-end justify-between gap-4 ${slideAnimClass}`}
          >
            <div className="flex items-end gap-3.5 sm:gap-5 min-w-0 flex-1">
              <div className="hidden xs:block sm:block w-[82px] sm:w-[116px] aspect-[2/3] rounded-xl overflow-hidden border border-white/25 shadow-2xl shrink-0">
                <SmartImage
                  src={activeItem.cover || activeItem.banner}
                  alt={activeTitle}
                  fallbackTitle={activeTitle}
                  className="w-full h-full"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-0.5 rounded-full bg-[var(--sx-primary)]/25 border border-[var(--sx-primary)]/50 text-white backdrop-blur-md">
                    #{safeIndex + 1} Featured
                  </span>
                  {activeScore && (
                    <span className="inline-flex items-center gap-1 text-amber-300 tabular-nums">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      {activeScore}
                    </span>
                  )}
                </div>
                <h2
                  data-testid="hero-slide-title"
                  className="text-lg sm:text-2xl lg:text-3xl font-black text-white leading-tight line-clamp-2 drop-shadow"
                >
                  {activeTitle}
                </h2>
                {activeMeta.length > 0 && (
                  <p className="text-[11px] sm:text-xs font-semibold text-white/80 truncate">
                    {activeMeta.join(' · ')}
                  </p>
                )}
                {activeSynopsis && (
                  <p className="hidden sm:block text-xs text-white/70 line-clamp-2 max-w-xl">
                    {activeSynopsis}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-lg whitespace-nowrap"
              >
                {activeIsReading ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                <span>{activeCta}</span>
              </button>
              <button
                type="button"
                onClick={() => onSelectMedia(activeItem)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white border border-white/20 backdrop-blur-md text-xs font-bold whitespace-nowrap"
              >
                <Info className="w-3.5 h-3.5" />
                <span>Details</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // 8. Edge Glass Style (Top translucent pill rail + docked bottom frosted bar)
  if (bannerStyle === 'edgeCarousel') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="edgeCarousel"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
          className="relative group h-[260px] sm:h-[330px] lg:h-[380px] w-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-xl flex flex-col justify-between"
        >
          <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
            <SmartImage
              src={activeItem.banner || activeItem.cover}
              alt={activeTitle}
              fallbackTitle={activeTitle}
              className="w-full h-full transition-transform duration-700 ease-out group-hover:scale-[1.03]"
            />
          </div>
          <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/85 via-black/20 to-black/30" />

          <button
            type="button"
            data-no-press="true"
            onClick={() => onSelectMedia(activeItem)}
            aria-label={`Open details for ${activeTitle}`}
            className="absolute inset-0 z-10 w-full h-full cursor-pointer"
          />

          <div className="relative z-20 p-3.5 sm:p-5 flex items-center justify-between gap-2 pointer-events-none">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/50 backdrop-blur-xl border border-white/20 text-[11px] font-extrabold text-white">
              {getHeroRankBadgeLabel(safeIndex, activeItem.type)}
            </span>
            <div className="pointer-events-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-xl border border-white/20 text-[11px] font-mono-tabular font-bold text-white">
              <button type="button" onClick={handlePrev} aria-label="Previous featured slide" className="hover:text-[var(--sx-primary)]">
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span>{formatHeroSlideCounter(safeIndex, slides.length)}</span>
              <button type="button" onClick={handleNext} aria-label="Next featured slide" className="hover:text-[var(--sx-primary)]">
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="relative z-20 px-4 py-3 sm:px-6 sm:py-4 bg-black/55 backdrop-blur-2xl border-t border-white/15 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-0.5">
              <h2
                data-testid="hero-slide-title"
                className="text-base sm:text-2xl font-black text-white leading-tight line-clamp-1 drop-shadow"
              >
                {activeTitle}
              </h2>
              <div className="flex items-center gap-2 text-[11px] font-semibold text-white/80 truncate tabular-nums">
                {activeScore && (
                  <span className="inline-flex items-center gap-1 text-amber-300 font-bold">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    {activeScore}
                  </span>
                )}
                {activeMeta.length > 0 && <span className="truncate">{activeMeta.join(' · ')}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full sx-glass-cta text-xs font-extrabold whitespace-nowrap shrink-0"
            >
              {activeIsReading ? <BookOpen className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              <span>{activeCta}</span>
            </button>
          </div>
        </div>
      </section>
    );
  }

  // 9. Ranked Deck Style (Photo 2: centered tall poster card with rank # + heart, flanking peeking ranked posters, centered title + orange badge pill)
  if (bannerStyle === 'rankedDeck') {
    const prevIdx = slides.length > 1 ? wrapSlideIndex(safeIndex, -1, slides.length) : safeIndex;
    const nextIdx = slides.length > 1 ? wrapSlideIndex(safeIndex, 1, slides.length) : safeIndex;
    const prevItem = slides[prevIdx];
    const nextItem = slides[nextIdx];
    const prevTitle = prevItem
      ? getPreferredTitle(prevItem.title, state.contentPrefs.titlePreference)
      : '';
    const nextTitle = nextItem
      ? getPreferredTitle(nextItem.title, state.contentPrefs.titlePreference)
      : '';
    const isInLibrary = Boolean(getLibraryEntry(activeItem.id));
    const badgeValue =
      activeIsReading && activeItem.chapters
        ? `${activeItem.chapters} CH`
        : activeItem.episodes
          ? `${activeItem.episodes}`
          : activeScore
            ? activeScore.replace('/10', '')
            : activeItem.format || 'TOP';

    const handleToggleFavorite = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isInLibrary) {
        removeLibraryEntry(activeItem.id);
      } else {
        void upsertLibraryEntry(activeItem, 'PLANNING', 0);
      }
    };

    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="rankedDeck"
        className="mx-3 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative group" {...swipeProps}>
          {/* 3-Card Deck Viewport */}
          <div className="relative h-[320px] sm:h-[385px] lg:h-[430px] w-full overflow-hidden flex items-center justify-center px-2">
            {/* Left Flanking Peeking Poster */}
            {slides.length > 1 && prevItem && prevIdx !== safeIndex && (
              <button
                type="button"
                data-no-press="true"
                onClick={handlePrev}
                aria-label={`Focus ranked slide ${prevIdx + 1}: ${prevTitle}`}
                style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
                className="relative -mr-5 sm:-mr-6 z-10 w-[135px] sm:w-[195px] lg:w-[225px] h-[80%] overflow-hidden border border-[var(--sx-outline)]/70 bg-[var(--sx-surface-container)] shadow-lg opacity-80 hover:opacity-95 transition-all duration-300 scale-95 cursor-pointer shrink-0"
              >
                <SmartImage
                  src={prevItem.cover || prevItem.banner}
                  alt={prevTitle}
                  fallbackTitle={prevTitle}
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/35" />
                <span className="pointer-events-none absolute top-3 left-3 text-xl sm:text-2xl font-black text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] tabular-nums">
                  {prevIdx + 1}
                </span>
              </button>
            )}

            {/* Centered Active Tall Poster Card */}
            <div
              key={slideAnimKey}
              style={{ borderRadius: 'calc(var(--sx-radius) + 8px)' }}
              className={`relative z-20 w-[224px] sm:w-[272px] lg:w-[308px] h-full overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-[0_22px_50px_-14px_rgba(0,0,0,0.55)] shrink-0 ${slideAnimClass}`}
            >
              <SmartImage
                src={activeItem.cover || activeItem.banner}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className={`w-full h-full object-cover ${
                  batterySaver ? '' : 'transition-transform duration-700 ease-out group-hover:scale-[1.03]'
                }`}
              />

              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/55" />

              <button
                type="button"
                data-no-press="true"
                onClick={() => onSelectMedia(activeItem)}
                aria-label={`Open details for ${activeTitle}`}
                className="absolute inset-0 z-10 w-full h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
              />

              {/* Top-left rank number & Top-right interactive favorite heart */}
              <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between p-3.5 sm:p-4">
                <span
                  data-testid="hero-rank-badge"
                  className="text-2xl sm:text-3xl font-black italic tracking-tight text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)] tabular-nums leading-none"
                >
                  {safeIndex + 1}
                </span>
                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  aria-label={isInLibrary ? `Remove ${activeTitle} from library` : `Save ${activeTitle} to library`}
                  aria-pressed={isInLibrary}
                  className="pointer-events-auto w-9 h-9 rounded-full flex items-center justify-center bg-black/25 hover:bg-black/45 backdrop-blur-md transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <Heart
                    className={`w-5 h-5 transition-colors drop-shadow ${
                      isInLibrary
                        ? 'text-rose-500 fill-rose-500'
                        : 'text-white fill-white/90 hover:fill-rose-400'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Right Flanking Peeking Poster */}
            {slides.length > 1 && nextItem && nextIdx !== safeIndex && (
              <button
                type="button"
                data-no-press="true"
                onClick={handleNext}
                aria-label={`Focus ranked slide ${nextIdx + 1}: ${nextTitle}`}
                style={{ borderRadius: 'calc(var(--sx-radius) + 4px)' }}
                className="relative -ml-5 sm:-ml-6 z-10 w-[135px] sm:w-[195px] lg:w-[225px] h-[80%] overflow-hidden border border-[var(--sx-outline)]/70 bg-[var(--sx-surface-container)] shadow-lg opacity-80 hover:opacity-95 transition-all duration-300 scale-95 cursor-pointer shrink-0"
              >
                <SmartImage
                  src={nextItem.cover || nextItem.banner}
                  alt={nextTitle}
                  fallbackTitle={nextTitle}
                  className="w-full h-full object-cover"
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/35" />
                <span className="pointer-events-none absolute top-3 left-3 sm:left-auto sm:right-3 text-xl sm:text-2xl font-black text-white/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.85)] tabular-nums">
                  {nextIdx + 1}
                </span>
              </button>
            )}
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="hidden sm:flex absolute left-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="hidden sm:flex absolute right-2 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-black/55 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {/* Centered Title + Accent Badge Underneath */}
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 px-2 text-center">
          <button
            type="button"
            onClick={() => onSelectMedia(activeItem)}
            className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] transition-colors line-clamp-1 max-w-[82%]"
          >
            <span data-testid="hero-slide-title">{activeTitle}</span>
          </button>
          <button
            type="button"
            onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
            aria-label={`${activeCta}: ${activeTitle}`}
            className="inline-flex items-center justify-center px-2 py-0.5 rounded-md bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold tabular-nums shadow-sm hover:brightness-110 transition-all"
          >
            {badgeValue}
          </button>
        </div>

        {slides.length > 1 && (
          <div className="mt-1.5 flex items-center justify-center gap-1" role="tablist" aria-label="Hero banner slides">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => handleDotSelect(idx)}
                className="py-1.5 px-0.5"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-300 ${
                    idx === safeIndex
                      ? 'w-6 bg-[var(--sx-primary)]'
                      : 'w-2 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // 10. Glass Frame Style (Photo 3: solid white circle rank + top glass stat capsule + heart circle + stacked title + bottom frosted stat capsule + white arrow CTA)
  if (bannerStyle === 'glassFrame') {
    const isInLibrary = Boolean(getLibraryEntry(activeItem.id));
    const topStatPrimary = activeScore ? activeScore.replace('/10', '') : String(activeItem.year || 'TOP');
    const topStatLabel = activeScore ? 'Score' : activeItem.format || 'Rank';
    const bottomCaption = activeIsReading ? 'Chapters' : 'Episodes';
    const bottomValue =
      activeIsReading && activeItem.chapters
        ? `${activeItem.chapters} CH`
        : activeItem.episodes
          ? `${activeItem.episodes} EP`
          : activeMeta.slice(0, 2).join(' · ') || activeCta;

    const handleToggleFavorite = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (isInLibrary) {
        removeLibraryEntry(activeItem.id);
      } else {
        void upsertLibraryEntry(activeItem, 'PLANNING', 0);
      }
    };

    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="glassFrame"
        className="mx-4 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div className="relative group max-w-3xl mx-auto" {...swipeProps}>
          <div
            style={{ borderRadius: 'calc(var(--sx-radius) + 12px)' }}
            className="relative h-[305px] sm:h-[360px] lg:h-[395px] w-full overflow-hidden border border-white/20 dark:border-white/12 bg-[var(--sx-surface-container)] shadow-2xl"
          >
            <div key={slideAnimKey} className={`absolute inset-0 z-0 overflow-hidden ${slideAnimClass}`}>
              <SmartImage
                src={activeItem.banner || activeItem.cover}
                alt={activeTitle}
                fallbackTitle={activeTitle}
                className={`w-full h-full object-cover ${
                  batterySaver ? '' : 'transition-transform duration-700 ease-out group-hover:scale-[1.03]'
                }`}
              />
            </div>

            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/75 via-black/30 to-black/15" />
            <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/80 via-black/20 to-black/35" />

            <button
              type="button"
              data-no-press="true"
              onClick={() => onSelectMedia(activeItem)}
              aria-label={`Open details for ${activeTitle}`}
              className="absolute inset-0 z-10 w-full h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
            />

            <div
              key={`glassframe-meta-${slideAnimKey}`}
              className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 ${slideAnimClass}`}
            >
              {/* Top Row: Solid white circle rank + Frosted stat pill | Circular glass Heart */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    data-testid="hero-rank-badge"
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-white text-slate-950 font-black text-sm sm:text-base flex items-center justify-center shadow-lg tabular-nums shrink-0"
                  >
                    {safeIndex + 1}
                  </span>

                  <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/40 backdrop-blur-xl border border-white/20 text-white shadow-md">
                    <Star className="w-4 h-4 text-white fill-white/90 shrink-0" />
                    <div className="leading-tight">
                      <div className="text-xs sm:text-sm font-extrabold tabular-nums">{topStatPrimary}</div>
                      <div className="text-[10px] font-medium text-white/75">{topStatLabel}</div>
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleToggleFavorite}
                  aria-label={isInLibrary ? `Remove ${activeTitle} from library` : `Save ${activeTitle} to library`}
                  aria-pressed={isInLibrary}
                  className="pointer-events-auto w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white shadow-md transition-transform active:scale-90 focus-visible:outline-2 focus-visible:outline-white"
                >
                  <Heart
                    className={`w-5 h-5 transition-colors ${
                      isInLibrary ? 'text-rose-500 fill-rose-500' : 'text-white'
                    }`}
                  />
                </button>
              </div>

              {/* Middle Stacked Title */}
              <div className="my-auto py-3 max-w-[72%] sm:max-w-[65%]">
                <h2
                  data-testid="hero-slide-title"
                  className="text-xl sm:text-3xl lg:text-[2rem] font-bold text-white leading-[1.12] tracking-tight line-clamp-2 drop-shadow"
                >
                  {activeTitle}
                </h2>
                {activeMeta.length > 0 && (
                  <p className="mt-1 text-xs font-medium text-white/75 line-clamp-1">
                    {activeMeta.slice(0, 3).join(' · ')}
                  </p>
                )}
              </div>

              {/* Bottom Row: Frosted info capsule | Solid white circular Arrow CTA */}
              <div className="flex items-end justify-between gap-3">
                <div className="inline-flex flex-col px-4 py-2 sm:px-5 sm:py-2.5 rounded-full bg-black/45 backdrop-blur-xl border border-white/20 text-white shadow-lg min-w-[140px] max-w-[68%]">
                  <span className="text-[10px] sm:text-[11px] font-medium text-white/75 leading-tight">
                    {bottomCaption}
                  </span>
                  <span className="text-sm sm:text-base font-extrabold tracking-tight tabular-nums truncate">
                    {bottomValue}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => (onWatchNow ? onWatchNow(activeItem) : onSelectMedia(activeItem))}
                  aria-label={`${activeCta}: ${activeTitle}`}
                  className="pointer-events-auto w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white hover:scale-105 text-slate-950 flex items-center justify-center shadow-xl transition-transform active:scale-95 shrink-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
                >
                  <ArrowRight className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.25]" />
                </button>
              </div>
            </div>
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="hidden sm:flex absolute -left-3.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md shadow-lg transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="hidden sm:flex absolute -right-3.5 top-1/2 -translate-y-1/2 z-30 w-9 h-9 rounded-full items-center justify-center bg-[#18191f]/90 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md shadow-lg transition-all opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Hero banner slides">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => handleDotSelect(idx)}
                className="py-1.5 px-0.5"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-300 ${
                    idx === safeIndex
                      ? 'w-7 bg-[var(--sx-primary)]'
                      : 'w-2 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // 11. Stage Coverflow Style (Photo 4: sleek dark obsidian capsule framing multi-card 3D fanned album/poster deck)
  if (bannerStyle === 'prismCoverflow') {
    return (
      <section
        aria-label="Featured Hero Banner"
        data-testid="hero-banner-carousel"
        data-banner-style="prismCoverflow"
        className="mx-3 sm:mx-6"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
        onFocusCapture={() => setIsPaused(true)}
        onBlurCapture={() => setIsPaused(false)}
        onKeyDown={handleKeyDown}
      >
        <div
          {...swipeProps}
          style={{
            borderRadius: 'calc(var(--sx-radius) + 12px)',
            perspective: '1300px',
          }}
          className="relative group bg-[#090a0f] border border-white/10 px-2 py-5 sm:px-5 sm:py-7 shadow-[0_24px_55px_-18px_rgba(0,0,0,0.85)] overflow-hidden"
        >
          {/* Ambient radial glow inside obsidian frame */}
          <div className="pointer-events-none absolute inset-0 bg-radial from-white/[0.06] via-transparent to-black/60" />

          <div
            className="relative h-[225px] sm:h-[290px] lg:h-[330px] w-full flex items-center justify-center"
            style={{ transformStyle: 'preserve-3d' }}
          >
            {slides.map((slide, idx) => {
              const m = getStageCoverflowMetrics(idx, safeIndex, slides.length);
              const title = getPreferredTitle(slide.title, state.contentPrefs.titlePreference);
              const metaParts = formatHeroMetadata(slide);

              return (
                <div
                  key={slide.id}
                  aria-hidden={!m.isActive}
                  style={{
                    zIndex: m.zIndex,
                    opacity: m.opacity,
                    transform: `translate3d(${m.translateXPercent}%, 0, 0) scale(${m.scale}) rotateY(${m.rotateYDeg}deg)`,
                    pointerEvents: m.visible ? 'auto' : 'none',
                    borderRadius: 'calc(var(--sx-radius) - 4px)',
                  }}
                  className={`sx-coverflow-slide absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[184px] sm:w-[250px] lg:w-[285px] aspect-square overflow-hidden border shadow-2xl transition-all duration-500 ease-out ${
                    m.isActive
                      ? 'border-white/25 shadow-[0_22px_45px_rgba(0,0,0,0.75)]'
                      : 'border-white/12 brightness-[0.82] hover:brightness-100'
                  }`}
                >
                  <SmartImage
                    src={slide.cover || slide.banner}
                    alt={title}
                    fallbackTitle={title}
                    className={`w-full h-full object-cover ${
                      m.isActive && !batterySaver ? 'transition-transform duration-700 group-hover:scale-[1.03]' : ''
                    }`}
                  />

                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />

                  <button
                    type="button"
                    data-no-press="true"
                    tabIndex={m.isActive ? 0 : -1}
                    onClick={() => {
                      if (m.isActive) onSelectMedia(slide);
                      else handleDotSelect(idx);
                    }}
                    aria-label={m.isActive ? `Open details for ${title}` : `Focus slide: ${title}`}
                    className="absolute inset-0 z-10 w-full h-full cursor-pointer focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
                  />

                  {m.isActive && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 p-3 sm:p-4 text-center">
                      <h2
                        data-testid="hero-slide-title"
                        className="text-sm sm:text-lg font-bold text-white leading-snug line-clamp-1 drop-shadow"
                      >
                        {title}
                      </h2>
                      <p className="text-[11px] sm:text-xs font-medium text-white/75 line-clamp-1">
                        {metaParts.slice(0, 2).join(' · ') || getHeroRankBadgeLabel(safeIndex, slide.type)}
                      </p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {slides.length > 1 && (
            <>
              <button
                type="button"
                onClick={handlePrev}
                aria-label="Previous featured slide"
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-40 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                aria-label="Next featured slide"
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-40 w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all opacity-80 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100"
              >
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </>
          )}
        </div>

        {slides.length > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-1.5" role="tablist" aria-label="Hero banner slides">
            {slides.map((slide, idx) => (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={idx === safeIndex}
                aria-label={`Slide ${idx + 1}`}
                onClick={() => handleDotSelect(idx)}
                className="py-1.5 px-0.5"
              >
                <span
                  className={`block h-1 rounded-full transition-all duration-300 ${
                    idx === safeIndex
                      ? 'w-7 bg-[var(--sx-primary)]'
                      : 'w-2 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                  }`}
                />
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  // 12. 3D Coverflow Style (ShizuTv Coverflow spotlight with flanking cards)
  return (
    <section
      aria-label="Featured Hero Banner"
      data-testid="hero-banner-carousel"
      data-banner-style="coverflow"
      className="mx-3 sm:mx-6"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocusCapture={() => setIsPaused(true)}
      onBlurCapture={() => setIsPaused(false)}
      onKeyDown={handleKeyDown}
    >
      <div
        className="relative group"
        style={{ perspective: '1200px' }}
        {...swipeProps}
      >
        {/* 3D Coverflow Stage */}
        <div className="relative h-[265px] sm:h-[330px] lg:h-[385px] w-full overflow-hidden">
          {slides.map((slide, idx) => {
            const metrics = getCoverflowCardMetrics(idx, safeIndex, slides.length);
            const isActive = metrics.slot === 'active';
            const isVisibleFlank = metrics.slot === 'prev' || metrics.slot === 'next';
            const title = getPreferredTitle(slide.title, state.contentPrefs.titlePreference);
            const metaParts = formatHeroMetadata(slide);
            const scoreText = formatHeroScore(slide.score);
            const synopsis = stripHtmlTags(slide.description);
            const ctaLabel = getHeroCtaLabel(slide.type);
            const isReading = slide.type === 'MANGA';

            return (
              <div
                key={slide.id}
                aria-hidden={!isActive}
                style={{
                  borderRadius: 'calc(var(--sx-radius) + 6px)',
                  zIndex: metrics.zIndex,
                  opacity: metrics.opacity,
                  transform: `translate3d(${metrics.translateXPercent}%, 0, 0) scale(${metrics.scale}) rotateY(${metrics.rotateYDeg}deg)`,
                  pointerEvents: isActive || isVisibleFlank ? 'auto' : 'none',
                }}
                className={`sx-coverflow-slide absolute inset-y-0 left-1/2 -translate-x-1/2 overflow-hidden border bg-[var(--sx-surface-container)] shadow-2xl ${
                  slides.length > 1
                    ? 'w-[90%] sm:w-[84%] lg:w-[78%]'
                    : 'w-full'
                } ${
                  isActive
                    ? 'border-[var(--sx-outline)] shadow-[0_24px_50px_-15px_rgba(0,0,0,0.65)]'
                    : 'border-[var(--sx-outline)]/60 brightness-75'
                }`}
              >
                <div className="absolute inset-0 z-0 overflow-hidden">
                  <SmartImage
                    src={slide.banner || slide.cover}
                    alt={title}
                    fallbackTitle={title}
                    className={`w-full h-full transition-transform duration-700 ease-out ${
                      isActive ? 'group-hover:scale-[1.03]' : ''
                    }`}
                  />
                </div>

                <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-t from-black/95 via-black/45 to-black/20" />
                <div className="pointer-events-none absolute inset-0 z-[5] bg-gradient-to-r from-black/75 via-black/25 to-transparent" />

                <button
                  type="button"
                  data-no-press="true"
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    if (isActive) onSelectMedia(slide);
                    else setActiveIndex(idx);
                  }}
                  aria-label={
                    isActive ? `Open details for ${title}` : `Focus slide: ${title}`
                  }
                  className="absolute inset-0 z-10 w-full h-full text-left focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] cursor-pointer"
                />

                {isActive && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex flex-col justify-between p-4 sm:p-6 lg:p-7">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        data-testid="hero-rank-badge"
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/95 text-slate-950 text-[11px] sm:text-xs font-extrabold shadow-sm whitespace-nowrap shrink-0"
                      >
                        <span>{getHeroRankBadgeLabel(safeIndex, slide.type)}</span>
                        <Flame className="w-3.5 h-3.5 text-orange-500 fill-orange-500" />
                      </span>

                      {scoreText && (
                        <span
                          data-testid="hero-score-badge"
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/65 backdrop-blur-md text-white border border-white/15 text-[11px] sm:text-xs font-bold tabular-nums whitespace-nowrap shrink-0"
                        >
                          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                          <span>{scoreText}</span>
                        </span>
                      )}
                    </div>

                    <div className="flex flex-row items-end justify-between gap-3 sm:gap-6">
                      <div className="min-w-0 flex-1 max-w-2xl space-y-1">
                        <h2
                          data-testid="hero-slide-title"
                          className="text-lg sm:text-3xl lg:text-4xl font-black text-white leading-tight tracking-tight line-clamp-2 drop-shadow"
                        >
                          {title}
                        </h2>

                        {metaParts.length > 0 && (
                          <div className="flex flex-wrap items-center gap-x-1.5 sm:gap-x-2 gap-y-0.5 text-[11px] sm:text-sm font-semibold text-white/90 tabular-nums">
                            {metaParts.map((part, partIdx) => (
                              <React.Fragment key={`${part}-${partIdx}`}>
                                {partIdx > 0 && (
                                  <span aria-hidden="true" className="text-white/50">
                                    ·
                                  </span>
                                )}
                                <span>{part}</span>
                              </React.Fragment>
                            ))}
                          </div>
                        )}

                        {synopsis && (
                          <p className="text-[10px] sm:text-xs text-white/75 line-clamp-2 leading-snug sm:leading-relaxed max-w-xl">
                            {synopsis}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => (onWatchNow ? onWatchNow(slide) : onSelectMedia(slide))}
                        className="pointer-events-auto self-end inline-flex items-center gap-1.5 sm:gap-2 px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-full bg-[var(--sx-primary)] hover:brightness-110 text-[var(--sx-on-primary)] text-[11px] sm:text-sm font-bold transition-all duration-150 active:scale-95 whitespace-nowrap shrink-0 shadow-lg focus-visible:outline-2 focus-visible:outline-white"
                      >
                        {isReading ? (
                          <BookOpen className="w-3.5 h-3.5" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current" />
                        )}
                        <span>{ctaLabel}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              aria-label="Previous featured slide"
              className="absolute left-1 sm:left-3 top-[36%] sm:top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
            >
              <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
            <button
              type="button"
              onClick={handleNext}
              aria-label="Next featured slide"
              className="absolute right-1 sm:right-3 top-[36%] sm:top-1/2 -translate-y-1/2 z-30 w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center bg-black/70 hover:bg-[var(--sx-primary)] text-white hover:text-[var(--sx-on-primary)] border border-white/15 backdrop-blur-md transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-white shadow-lg"
            >
              <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </>
        )}
      </div>

      {slides.length > 1 && (
        <div
          className="mt-2.5 flex items-center justify-center gap-1"
          role="tablist"
          aria-label="Hero banner slides"
        >
          {slides.map((slide, idx) => {
            const active = idx === safeIndex;
            const slideTitle = getPreferredTitle(
              slide.title,
              state.contentPrefs.titlePreference,
            );
            return (
              <button
                key={slide.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-label={`Slide ${idx + 1}: ${slideTitle}`}
                onClick={() => setActiveIndex(idx)}
                className="py-2 px-1 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] rounded"
              >
                <span
                  className={`block h-1.5 rounded-full transition-all duration-300 ease-out ${
                    active
                      ? 'w-7 bg-[var(--sx-primary)]'
                      : 'w-2.5 bg-[var(--sx-on-surface-muted)]/35 hover:bg-[var(--sx-on-surface-muted)]/65'
                  }`}
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

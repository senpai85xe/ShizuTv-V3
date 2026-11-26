import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { BookOpen, Compass, Tv, X } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { UnifiedMedia } from '../types/media';
import { fetchDiscoveryGenreOverview } from '../services/discoveryService';
import { HorizontalSection } from '../components/HorizontalSection';
import { MediaCard } from '../components/MediaCard';
import { GenreCard } from '../components/GenreCard';
import { GenreIcon } from '../components/GenreIcon';
import { ScrollReveal } from '../components/ScrollReveal';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useScrollPersistence } from '../hooks/useScrollPersistence';
import { formatDocumentTitle } from '../utils/documentTitle';
import { getRouteTransitionClass, getRouteTransitionKind } from '../utils/appMotion';
import { hasScrolledPastHero } from '../utils/detailsMotion';
import { getPreviousVisitedRoute } from '../utils/scrollPersistence';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';
import {
  buildGenreDetailUrl,
  buildHomeGenreDiscoverUrl,
  GenreCategoryDescriptor,
  resolveGenreCardStyle,
  resolveGenreDescriptorFromRoute,
} from '../utils/genreMetadata';
import {
  buildOftenPairedCategories,
  buildRelatedCategoryCards,
  getGenreEditorialDescription,
  LiveGenreCounts,
  resolveGenreStats,
} from '../utils/genreDetailData';

export const GenreDetailPage: React.FC = () => {
  const { genreId = 'action' } = useParams<{ genreId: string }>();
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { state, effectiveMetadataTracker } = useApp();

  const mediaType: 'ANIME' | 'MANGA' =
    searchParams.get('type')?.toUpperCase() === 'MANGA' ? 'MANGA' : 'ANIME';
  const kindParam = searchParams.get('kind');
  const nameParam = searchParams.get('name');

  const descriptor = useMemo(
    () => resolveGenreDescriptorFromRoute(genreId, mediaType, kindParam, nameParam),
    [genreId, mediaType, kindParam, nameParam],
  );

  const genreRouteKey = `/genre/${encodeURIComponent(descriptor.id)}?type=${mediaType}`;
  const prevVisitedRouteRef = useRef<string | null>(getPreviousVisitedRoute());
  const transitionKind = getRouteTransitionKind(
    prevVisitedRouteRef.current,
    `/genre/${descriptor.id}`,
  );
  const transitionClass = getRouteTransitionClass(transitionKind) || 'sx-page-push-enter';

  const { isRestoring: isRestoringScroll } = useScrollPersistence({
    routeKey: genreRouteKey,
    enabled: Boolean(genreId),
  });

  useDocumentTitle(
    formatDocumentTitle(`${descriptor.label} ${mediaType === 'MANGA' ? 'Manga' : 'Anime'}`),
  );

  const [topWeek, setTopWeek] = useState<UnifiedMedia[]>([]);
  const [highestRated, setHighestRated] = useState<UnifiedMedia[]>([]);
  const [liveCounts, setLiveCounts] = useState<LiveGenreCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

  const heroRef = useRef<HTMLElement | null>(null);
  const requestSeqRef = useRef(0);

  const loadOverview = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fetchDiscoveryGenreOverview(effectiveMetadataTracker, {
        type: mediaType,
        filterKind: descriptor.filterKind,
        filterValues: descriptor.filterValues,
        adultMode: state.contentPrefs.adultContentMode,
      });
      if (requestSeqRef.current !== seq) return;
      setTopWeek(result.topWeek);
      setHighestRated(result.highestRated);
      setLiveCounts(result.liveCounts);
    } catch (err) {
      if (requestSeqRef.current !== seq) return;
      setError(err instanceof Error ? err.message : 'Failed to load category highlights');
    } finally {
      if (requestSeqRef.current === seq) {
        setLoading(false);
      }
    }
  }, [
    effectiveMetadataTracker,
    mediaType,
    descriptor.filterKind,
    descriptor.filterValues,
    state.contentPrefs.adultContentMode,
  ]);

  useEffect(() => {
    setTopWeek([]);
    setHighestRated([]);
    setLiveCounts(null);
    void loadOverview();
  }, [loadOverview]);

  // Reset scroll to top when switching between genres or pairings unless restoring back navigation
  useEffect(() => {
    if (!isRestoringScroll) {
      window.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [descriptor.id, mediaType, isRestoringScroll]);

  // Show blurred sticky header with iOS spring popup once scrolled past the genre hero card
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;

    const evaluateSticky = () => {
      rafId = 0;
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? null;
      const next = hasScrolledPastHero({
        scrollY: window.scrollY || window.pageYOffset || 0,
        heroBottom,
        thresholdPx: 16,
      });
      setShowStickyHeader((prev) => (prev === next ? prev : next));
    };

    const scheduleCheck = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(evaluateSticky);
    };

    evaluateSticky();
    window.addEventListener('scroll', scheduleCheck, { passive: true });
    window.addEventListener('resize', scheduleCheck, { passive: true });
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleCheck);
      window.removeEventListener('resize', scheduleCheck);
    };
  }, [descriptor.id, mediaType]);

  const editorialDescription = useMemo(
    () => getGenreEditorialDescription(descriptor, mediaType),
    [descriptor, mediaType],
  );

  const stats = useMemo(
    () =>
      resolveGenreStats({
        descriptor,
        mediaType,
        liveCounts,
      }),
    [descriptor, mediaType, liveCounts],
  );

  const sampledMedia = useMemo(() => {
    const merged = new Map<string, UnifiedMedia>();
    for (const item of topWeek) merged.set(item.id, item);
    for (const item of highestRated) {
      if (!merged.has(item.id)) merged.set(item.id, item);
    }
    return Array.from(merged.values());
  }, [topWeek, highestRated]);

  const pairedCategories = useMemo(
    () => buildOftenPairedCategories(descriptor, mediaType, sampledMedia, 8),
    [descriptor, mediaType, sampledMedia],
  );

  const relatedCategories = useMemo(
    () => buildRelatedCategoryCards(descriptor, mediaType, pairedCategories, 4),
    [descriptor, mediaType, pairedCategories],
  );

  const activeGenreCardStyle = resolveGenreCardStyle(state.uiPrefs.genreCardStyle);
  const discoverBaseUrl = buildHomeGenreDiscoverUrl(descriptor, mediaType);
  const topRatedDiscoverUrl = `${discoverBaseUrl}&sort=SCORE_DESC`;
  const trendingDiscoverUrl = `${discoverBaseUrl}&sort=TRENDING_DESC`;

  const handleClose = () => {
    triggerHaptic('nav-pop');
    suppressNextRouteHaptic();
    if (window.history.length > 1 && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  const handleSwitchMediaType = (nextMode: 'ANIME' | 'MANGA') => {
    if (nextMode === mediaType) return;
    triggerHaptic('nav-tab');
    const nextDesc = resolveGenreDescriptorFromRoute(genreId, nextMode, kindParam, nameParam);
    navigate(buildGenreDetailUrl(nextDesc, nextMode), {
      replace: true,
      state: { descriptor: nextDesc },
    });
  };

  const openCategory = (target: GenreCategoryDescriptor) => {
    triggerHaptic('nav-push');
    navigate(buildGenreDetailUrl(target, mediaType), {
      state: { descriptor: target },
    });
  };

  const openMediaDetails = (media: UnifiedMedia) => {
    navigate(`/details/${media.type.toLowerCase()}/${media.id}`, {
      state: { media },
    });
  };

  const frostedPillBtnClass =
    'sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] shadow-sm hover:border-[var(--sx-primary)]/45 transition-all';

  return (
    <div
      data-testid="genre-detail-page"
      data-genre-id={descriptor.id}
      data-media-type={mediaType}
      data-restoring-scroll={isRestoringScroll ? 'true' : 'false'}
      className="relative min-h-screen text-[var(--sx-on-surface)] overflow-x-clip"
    >
      {/* Main Content Container inheriting GlobalBackground theme identically to HomePage */}
      <div
        key={`genre-stage-${descriptor.id}-${mediaType}`}
        className={`${transitionClass} max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-24 space-y-7`}
      >
        {/* Top Header: Anime/Manga Mode Switcher + Close Button */}
        <header className="relative z-20 flex items-center justify-between gap-3">
          <div
            role="tablist"
            aria-label="Category media type"
            className={`relative inline-grid grid-cols-2 items-center p-1 rounded-full ${frostedPillBtnClass}`}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mediaType === 'ANIME'}
              data-testid="genre-mode-anime"
              onClick={() => handleSwitchMediaType('ANIME')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                mediaType === 'ANIME'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <Tv className="w-3.5 h-3.5" />
              <span>Anime</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mediaType === 'MANGA'}
              data-testid="genre-mode-manga"
              onClick={() => handleSwitchMediaType('MANGA')}
              className={`inline-flex items-center justify-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold transition-colors ${
                mediaType === 'MANGA'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Manga</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="genre-detail-close"
            onClick={handleClose}
            title="Close genre"
            aria-label="Close"
            className={`w-10 h-10 rounded-full flex items-center justify-center ${frostedPillBtnClass}`}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Section 1: Compact Genre Overview Card */}
        <section
          ref={heroRef}
          aria-label={`${descriptor.label} overview`}
          data-testid="genre-hero-card"
          className="sx-glass-panel border border-[var(--sx-outline)] rounded-[var(--sx-radius)] relative overflow-hidden p-4 sm:p-5 md:p-6 shadow-sm"
        >
          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-7 items-center">
            {/* Left / Identity Column */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center gap-3.5">
                <div
                  data-testid="genre-hero-icon"
                  style={{
                    background: `linear-gradient(155deg, ${descriptor.gradientFrom} 0%, ${descriptor.gradientTo} 100%)`,
                    boxShadow: `0 12px 24px -10px ${descriptor.gradientFrom}80`,
                  }}
                  className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white shrink-0 ring-1 ring-white/25 overflow-hidden"
                >
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/30 to-transparent"
                  />
                  <GenreIcon
                    iconId={descriptor.iconId}
                    className="relative z-10 w-6 h-6 sm:w-7 sm:h-7 text-white drop-shadow-sm"
                  />
                </div>

                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--sx-on-surface-muted)]">
                    {mediaType === 'MANGA' ? 'Manga' : 'Anime'}{' '}
                    {descriptor.filterKind === 'tag' ? 'Theme' : 'Genre'}
                  </p>
                  <h1
                    data-testid="genre-hero-title"
                    className="text-xl sm:text-2xl font-extrabold tracking-tight text-balance text-[var(--sx-on-surface)] leading-tight"
                  >
                    {descriptor.label}
                  </h1>
                </div>
              </div>

              <p
                data-testid="genre-hero-description"
                className="text-xs sm:text-[13px] leading-relaxed text-[var(--sx-on-surface-muted)] max-w-xl"
              >
                {editorialDescription}
              </p>

              {/* Desktop Primary CTA */}
              <div className="hidden lg:flex items-center pt-0.5">
                <button
                  type="button"
                  data-testid="genre-browse-all-btn-desktop"
                  onClick={() => navigate(discoverBaseUrl)}
                  className="min-h-[38px] px-4 py-2 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-sm hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center gap-2"
                >
                  <Compass className="w-3.5 h-3.5" />
                  <span>Browse all {stats.totalSeries.toLocaleString('en-US')} series</span>
                </button>
              </div>
            </div>

            {/* Right Column: Clean 2x2 Unboxed Stats Grid */}
            <div className="lg:col-span-5 lg:border-l lg:border-[var(--sx-outline)]/60 lg:pl-6">
              <div
                data-testid="genre-stats-grid"
                className="grid grid-cols-2 gap-x-6 gap-y-3"
              >
                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
                    Series
                  </p>
                  <p
                    data-testid="genre-stat-total"
                    className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums text-[var(--sx-on-surface)]"
                  >
                    {stats.totalSeries.toLocaleString('en-US')}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
                    Ongoing
                  </p>
                  <p
                    data-testid="genre-stat-ongoing"
                    className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums text-[var(--sx-on-surface)]"
                  >
                    {stats.ongoingSeries.toLocaleString('en-US')}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
                    Completed
                  </p>
                  <p
                    data-testid="genre-stat-completed"
                    className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums text-[var(--sx-on-surface)]"
                  >
                    {stats.completedSeries.toLocaleString('en-US')}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <p className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)]">
                    New this month
                  </p>
                  <p
                    data-testid="genre-stat-new-month"
                    className="text-base sm:text-lg font-extrabold tracking-tight tabular-nums text-[var(--sx-on-surface)]"
                  >
                    {stats.newThisMonth.toLocaleString('en-US')}
                  </p>
                </div>
              </div>
            </div>

            {/* Mobile/Tablet Primary CTA */}
            <div className="lg:hidden">
              <button
                type="button"
                data-testid="genre-browse-all-btn"
                onClick={() => navigate(discoverBaseUrl)}
                className="w-full sm:w-auto min-h-[42px] px-5 py-2 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-xs font-extrabold shadow-sm hover:brightness-110 active:scale-[0.98] transition-all inline-flex items-center justify-center gap-2"
              >
                <Compass className="w-3.5 h-3.5" />
                <span>Browse all {stats.totalSeries.toLocaleString('en-US')} series</span>
              </button>
            </div>
          </div>
        </section>

        {/* Section 2: Horizontal Momentum Sliders ("Top this week" + "Highest rated") */}
        <div className="space-y-8 -mx-4 sm:-mx-6">
          <ScrollReveal index={0}>
            <div data-testid="genre-slider-top-week">
              <HorizontalSection
                title="Top this week"
                loading={loading}
                error={error}
                onRetry={loadOverview}
                isEmpty={!loading && !error && topWeek.length === 0}
                emptyText={`No trending ${descriptor.label.toLowerCase()} titles found right now.`}
                onMoreTap={() => navigate(trendingDiscoverUrl)}
              >
                {topWeek.map((media, idx) => (
                  <MediaCard
                    key={`top-${media.id}`}
                    media={media}
                    animationIndex={idx}
                    className="sx-genre-card"
                    onClick={() => openMediaDetails(media)}
                  />
                ))}
              </HorizontalSection>
            </div>
          </ScrollReveal>

          <ScrollReveal index={1}>
            <div data-testid="genre-slider-highest-rated">
              <HorizontalSection
                title="Highest rated"
                loading={loading}
                error={error}
                onRetry={loadOverview}
                isEmpty={!loading && !error && highestRated.length === 0}
                emptyText={`No rated ${descriptor.label.toLowerCase()} titles found right now.`}
                onMoreTap={() => navigate(topRatedDiscoverUrl)}
              >
                {highestRated.map((media, idx) => (
                  <MediaCard
                    key={`rated-${media.id}`}
                    media={media}
                    animationIndex={idx}
                    className="sx-genre-card"
                    onClick={() => openMediaDetails(media)}
                  />
                ))}
              </HorizontalSection>
            </div>
          </ScrollReveal>
        </div>

        {/* Section 3: Often paired with (Compact Pills) */}
        <ScrollReveal index={2}>
          <section
            aria-label="Often paired with"
            data-testid="genre-often-paired-section"
            className="space-y-3"
          >
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--sx-on-surface)]">
              Often paired with
            </h2>
            <div className="flex flex-wrap gap-2">
              {pairedCategories.map((paired) => (
                <button
                  key={`${paired.filterKind}-${paired.id}`}
                  type="button"
                  data-testid={`genre-paired-pill-${paired.id}`}
                  onClick={() => openCategory(paired)}
                  className="min-h-[34px] px-3 py-1.5 rounded-full sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 hover:-translate-y-0.5 active:scale-[0.98] transition-all inline-flex items-center gap-1.5 shadow-sm"
                >
                  <span
                    style={{ color: paired.gradientFrom }}
                    className="inline-flex items-center justify-center shrink-0"
                  >
                    <GenreIcon iconId={paired.iconId} className="w-3.5 h-3.5" />
                  </span>
                  <span className="text-xs font-bold text-[var(--sx-on-surface)] whitespace-nowrap">
                    {paired.label}
                  </span>
                  <span className="text-xs font-semibold tabular-nums text-[var(--sx-on-surface-muted)] whitespace-nowrap">
                    {paired.seriesCount}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </ScrollReveal>

        {/* Section 4: Related categories */}
        <ScrollReveal index={3}>
          <section
            id="related-categories"
            aria-label="Related categories"
            data-testid="genre-related-section"
            className="space-y-3.5"
          >
            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--sx-on-surface)]">
              Related categories
            </h2>
            <div
              className={
                activeGenreCardStyle === 'classic'
                  ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'
                  : 'grid grid-cols-1 sm:grid-cols-2 gap-4'
              }
            >
              {relatedCategories.map((rel, idx) => (
                <GenreCard
                  key={`rel-${rel.id}`}
                  descriptor={rel}
                  style={activeGenreCardStyle}
                  viewMode="grid"
                  roundness={`${state.themePrefs.uiRoundness}px`}
                  animationDelayMs={idx * 40}
                  onClick={() => openCategory(rel)}
                />
              ))}
            </div>
          </section>
        </ScrollReveal>
      </div>

      {/* Sticky Backdrop-Blur Header (exact iOS spring popup matching DetailsPage) */}
      <div className="pointer-events-none fixed top-3 inset-x-0 z-40 px-3 sm:px-6">
        <header
          data-testid="genre-sticky-header"
          data-visible={showStickyHeader ? 'true' : 'false'}
          aria-hidden={!showStickyHeader}
          className="sx-sticky-header max-w-5xl mx-auto p-1.5 sm:px-2.5 sm:py-1.5 rounded-[34px] bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/15 shadow-[0_14px_38px_rgba(15,23,42,0.14)] ring-1 ring-inset ring-white/25 dark:ring-white/10 flex items-center justify-between gap-2 sm:gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1 pl-0.5">
            <div
              style={{
                background: `linear-gradient(155deg, ${descriptor.gradientFrom} 0%, ${descriptor.gradientTo} 100%)`,
              }}
              className="w-9 h-9 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm ring-1 ring-white/25"
            >
              <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-black tracking-tight text-[var(--sx-on-surface)] truncate leading-tight">
                {descriptor.label}
              </p>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[var(--sx-on-surface-muted)] truncate">
                {mediaType === 'MANGA' ? 'Manga' : 'Anime'}{' '}
                {descriptor.filterKind === 'tag' ? 'Theme' : 'Genre'} ·{' '}
                {stats.totalSeries.toLocaleString('en-US')} series
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="genre-sticky-browse-btn"
              tabIndex={showStickyHeader ? 0 : -1}
              onClick={() => navigate(discoverBaseUrl)}
              className="h-9 px-3 sm:px-3.5 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] flex items-center justify-center gap-1.5 text-xs font-extrabold shadow-sm hover:brightness-110 transition-all shrink-0"
            >
              <Compass className="w-3.5 h-3.5 shrink-0" />
              <span className="whitespace-nowrap">Browse all</span>
            </button>

            <button
              type="button"
              data-testid="genre-sticky-close-btn"
              tabIndex={showStickyHeader ? 0 : -1}
              onClick={handleClose}
              title="Close genre"
              aria-label="Close"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border border-white/40 dark:border-white/15 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>
      </div>
    </div>
  );
};

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Search,
  SlidersHorizontal,
  X,
  RotateCcw,
  Puzzle,
  CheckCircle2,
  Loader2,
  ArrowUpDown,
  LayoutGrid,
  List,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Infinity as InfinityIcon,
  Clock,
  Trash2,
  Film,
  BookOpen,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  getPreferredTitle,
  SearchFormatFilter,
  SearchSort,
  SearchStatusFilter,
  UnifiedMedia,
} from '../types/media';
import {
  fetchDiscoveryGenresAndTags,
  searchDiscoveryMedia,
} from '../services/discoveryService';
import { GenreCard } from '../components/GenreCard';
import { MediaCard } from '../components/MediaCard';
import { MediaCardSkeleton } from '../components/MediaCardSkeleton';
import { SkeletonBlock } from '../components/Skeleton';
import { SmartImage } from '../components/SmartImage';
import {
  formatCardFormatTag,
  formatCardUnitLabel,
  getMediaGridClassName,
} from '../utils/mediaCard';
import { getSourcePlayabilityStatus } from '../utils/sourcePicker';
import { useSlidingPill } from '../hooks/useSlidingPill';
import { getBoundedStaggerDelay } from '../utils/appMotion';
import {
  buildDiscoverCategoryGroups,
  buildGenreDetailUrl,
  countDiscoverCategoryItems,
  DEFAULT_DISCOVER_GENRES,
  DiscoverCategorySort,
  DiscoverCategoryViewMode,
  POPULAR_ANILIST_TAGS,
  resolveGenreCardStyle,
} from '../utils/genreMetadata';
import {
  clearDiscoverClickedMedia,
  clearDiscoverSearchHistory,
  loadDiscoverClickedMedia,
  loadDiscoverSearchHistory,
  recordDiscoverClickedMedia,
  recordDiscoverSearchHistory,
  removeDiscoverClickedMediaItem,
  removeDiscoverSearchHistoryItem,
} from '../utils/discoverSearchHistory';
import {
  buildStableMediaResultKeys,
  classifyResultTransitions,
  computeGridFlipDeltas,
  formatSortLabel,
  resolveSearchExpansionState,
  SimpleRect,
} from '../utils/searchMotion';
import {
  ANILIST_MAX_NAVIGABLE_PAGE,
  buildPaginationTokens,
  computeDiscoverTotalPages,
  DISCOVER_PAGE_SIZE,
  DiscoverResultsMode,
} from '../utils/discoverPagination';

interface ResultsTransitionState {
  items: UnifiedMedia[];
  prevKeys: Set<string>;
}

export const DiscoverPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { state, effectiveMetadataTracker, allSources, toggleSourceActive } = useApp();

  const [queryInput, setQueryInput] = useState(searchParams.get('query') || '');
  const [debouncedQuery, setDebouncedQuery] = useState(searchParams.get('query') || '');
  const [mediaType, setMediaType] = useState<'ANIME' | 'MANGA'>(() => {
    const t = searchParams.get('type')?.toUpperCase();
    return t === 'MANGA' ? 'MANGA' : 'ANIME';
  });
  const [selectedGenres, setSelectedGenres] = useState<string[]>(() => {
    const g = searchParams.get('genres');
    return g ? g.split(',').filter(Boolean) : [];
  });
  const [selectedTags, setSelectedTags] = useState<string[]>(() => {
    const tagsParam = searchParams.get('tags');
    return tagsParam ? tagsParam.split(',').filter(Boolean) : [];
  });
  const [sort, setSort] = useState<SearchSort>(
    (searchParams.get('sort') as SearchSort) || 'POPULARITY_DESC',
  );
  const [status, setStatus] = useState<SearchStatusFilter>('ALL');
  const [format, setFormat] = useState<SearchFormatFilter>('ALL');
  const [categoryTitle, setCategoryTitle] = useState<string | null>(
    searchParams.get('category'),
  );

  const [browseTab, setBrowseTab] = useState<'genres' | 'tags'>('genres');
  const [categorySort, setCategorySort] = useState<DiscoverCategorySort>('suggested');
  const [categoryViewMode, setCategoryViewMode] = useState<DiscoverCategoryViewMode>('grid');
  const [resultsMode, setResultsMode] = useState<DiscoverResultsMode>('infinite');
  const [genresList, setGenresList] = useState<string[]>(() => [...DEFAULT_DISCOVER_GENRES]);
  const [tagsList, setTagsList] = useState<string[]>(() => [...POPULAR_ANILIST_TAGS]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>(() =>
    loadDiscoverSearchHistory(mediaType),
  );
  const [clickedHistory, setClickedHistory] = useState<UnifiedMedia[]>(() =>
    loadDiscoverClickedMedia(mediaType),
  );

  const [resultsState, setResultsState] = useState<ResultsTransitionState>({
    items: [],
    prevKeys: new Set(),
  });
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const results = resultsState.items;
  const displayedResults = useMemo(
    () => (resultsMode === 'pages' ? results.slice(0, DISCOVER_PAGE_SIZE) : results),
    [results, resultsMode],
  );
  const resultKeys = useMemo(
    () => buildStableMediaResultKeys(displayedResults),
    [displayedResults],
  );
  const displayedTotalCount =
    totalResults !== null ? Math.max(totalResults, results.length) : results.length;

  // FLIP animation tracking refs
  const gridRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRectsRef = useRef<Map<string, SimpleRect>>(new Map());
  const flipCleanupTimersRef = useRef<number[]>([]);
  const searchSeqRef = useRef(0);
  const searchAreaRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const infiniteSentinelRef = useRef<HTMLDivElement | null>(null);

  const registerItemRef = useCallback(
    (key: string) => (el: HTMLDivElement | null) => {
      if (el) {
        itemRefs.current.set(key, el);
      } else {
        itemRefs.current.delete(key);
      }
    },
    [],
  );

  const captureCurrentItemRects = useCallback((): Map<string, SimpleRect> => {
    const rects = new Map<string, SimpleRect>();
    for (const [key, el] of itemRefs.current.entries()) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 || r.height > 0) {
        rects.set(key, { left: r.left, top: r.top });
      }
    }
    return rects;
  }, []);

  useEffect(() => {
    return () => {
      for (const timerId of flipCleanupTimersRef.current) {
        window.clearTimeout(timerId);
      }
      flipCleanupTimersRef.current = [];
    };
  }, []);

  const searchParamsString = searchParams.toString();
  const prevSearchParamsRef = useRef(searchParamsString);
  useEffect(() => {
    if (prevSearchParamsRef.current === searchParamsString) return;
    prevSearchParamsRef.current = searchParamsString;
    const t = searchParams.get('type')?.toUpperCase();
    setMediaType(t === 'MANGA' ? 'MANGA' : 'ANIME');
    const q = searchParams.get('query') || '';
    setQueryInput(q);
    setDebouncedQuery(q);
    const g = searchParams.get('genres');
    setSelectedGenres(g ? g.split(',').filter(Boolean) : []);
    const tagsParam = searchParams.get('tags');
    setSelectedTags(tagsParam ? tagsParam.split(',').filter(Boolean) : []);
    setSort((searchParams.get('sort') as SearchSort) || 'POPULARITY_DESC');
    setCategoryTitle(searchParams.get('category'));
  }, [searchParamsString, searchParams]);

  // Sync recent search & clicked-media history whenever Anime <-> Manga changes
  useEffect(() => {
    setSearchHistory(loadDiscoverSearchHistory(mediaType));
    setClickedHistory(loadDiscoverClickedMedia(mediaType));
  }, [mediaType]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(queryInput.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [queryInput]);

  // Load genres and tags
  useEffect(() => {
    fetchDiscoveryGenresAndTags().then(({ genres, tags }) => {
      setGenresList(genres);
      setTagsList(tags);
    });
  }, []);

  const hasActiveFilters =
    selectedGenres.length > 0 ||
    selectedTags.length > 0 ||
    sort !== 'POPULARITY_DESC' ||
    status !== 'ALL' ||
    format !== 'ALL';

  const isSearching =
    debouncedQuery.length > 0 || hasActiveFilters || Boolean(categoryTitle);

  const runSearch = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!isSearching) return;
      const seq = ++searchSeqRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);

      try {
        const res = await searchDiscoveryMedia(effectiveMetadataTracker, {
          query: debouncedQuery || undefined,
          type: mediaType,
          page: pageNum,
          genres: selectedGenres,
          tags: selectedTags,
          sort,
          status,
          format,
          adultMode: state.contentPrefs.adultContentMode,
        });
        if (seq !== searchSeqRef.current) return;

        if (!append && debouncedQuery.length >= 2) {
          setSearchHistory(recordDiscoverSearchHistory(mediaType, debouncedQuery));
        }

        // Snapshot pre-commit DOM rects before React commits reordered/filtered items
        prevRectsRef.current = captureCurrentItemRects();
        setResultsState((prev) => {
          const prevKeys = new Set(buildStableMediaResultKeys(prev.items));
          return {
            items: append ? [...prev.items, ...res.items] : res.items,
            prevKeys,
          };
        });
        setHasNextPage(res.hasNextPage);
        setPage(pageNum);
        setTotalResults((prevTotal) => {
          if (typeof res.total === 'number' && Number.isFinite(res.total)) {
            return append && prevTotal !== null ? Math.max(prevTotal, res.total) : res.total;
          }
          return append ? prevTotal : null;
        });
      } catch (err) {
        if (seq !== searchSeqRef.current) return;
        setError(err instanceof Error ? err.message : 'Search failed');
      } finally {
        if (seq === searchSeqRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [
      isSearching,
      effectiveMetadataTracker,
      debouncedQuery,
      mediaType,
      selectedGenres,
      selectedTags,
      sort,
      status,
      format,
      state.contentPrefs.adultContentMode,
      captureCurrentItemRects,
    ],
  );

  useEffect(() => {
    if (isSearching) {
      void runSearch(1, false);
    } else {
      searchSeqRef.current += 1;
      prevRectsRef.current = new Map();
      setResultsState({ items: [], prevKeys: new Set() });
      setTotalResults(null);
      setPage(1);
      setHasNextPage(false);
      setLoading(false);
      setLoadingMore(false);
      setError(null);
    }
  }, [isSearching, runSearch]);

  const totalPages = useMemo(
    () =>
      computeDiscoverTotalPages({
        totalCount: totalResults,
        loadedCount: results.length,
        hasNextPage,
        currentPage: page,
        perPage: DISCOVER_PAGE_SIZE,
        maxTrackerPages:
          effectiveMetadataTracker === 'anilist' ? ANILIST_MAX_NAVIGABLE_PAGE : undefined,
      }),
    [totalResults, results.length, hasNextPage, page, effectiveMetadataTracker],
  );

  const paginationTokens = useMemo(
    () => buildPaginationTokens(page, totalPages),
    [page, totalPages],
  );

  const handleResultsModeChange = useCallback(
    (nextMode: DiscoverResultsMode) => {
      if (nextMode === resultsMode) return;
      setResultsMode(nextMode);
      if (isSearching && (page !== 1 || results.length > DISCOVER_PAGE_SIZE)) {
        void runSearch(1, false);
      }
    },
    [resultsMode, isSearching, page, results.length, runSearch],
  );

  const goToResultsPage = useCallback(
    (targetPage: number) => {
      const clamped = Math.min(totalPages, Math.max(1, targetPage));
      if (clamped === page || loading || loadingMore) return;
      void runSearch(clamped, false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    },
    [totalPages, page, loading, loadingMore, runSearch],
  );

  // Continuous infinite scroll when Infinite mode is active
  useEffect(() => {
    if (!isSearching || resultsMode !== 'infinite' || !hasNextPage || loading || loadingMore || error) {
      return;
    }
    const sentinel = infiniteSentinelRef.current;
    if (!sentinel) return;

    let triggered = false;
    const triggerNext = () => {
      if (triggered) return;
      triggered = true;
      void runSearch(page + 1, true);
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              if (entries.some((entry) => entry.isIntersecting)) {
                triggerNext();
              }
            },
            { rootMargin: '420px 0px' },
          )
        : null;

    if (observer) {
      observer.observe(sentinel);
    }

    const handleScroll = () => {
      const rect = sentinel.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 420) {
        triggerNext();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener('scroll', handleScroll);
    };
  }, [isSearching, resultsMode, hasNextPage, loading, loadingMore, error, page, runSearch]);

  // Left/Right arrow key navigation when Pages mode is active
  useEffect(() => {
    if (!isSearching || resultsMode !== 'pages' || totalPages <= 1 || filterOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const active = document.activeElement as HTMLElement | null;
      const tag = active?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        active?.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToResultsPage(page - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToResultsPage(page + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isSearching, resultsMode, totalPages, filterOpen, page, goToResultsPage]);

  // Execute FLIP spring transitions on persisting/reordered cards after DOM layout updates
  useLayoutEffect(() => {
    for (const timerId of flipCleanupTimersRef.current) {
      window.clearTimeout(timerId);
    }
    flipCleanupTimersRef.current = [];

    const prevRects = prevRectsRef.current;
    prevRectsRef.current = new Map();

    if (prevRects.size === 0 || resultKeys.length === 0) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;

    // 1. Batch-read all destination rects before any style writes
    const nextRects = new Map<string, SimpleRect>();
    for (const key of resultKeys) {
      const el = itemRefs.current.get(key);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      nextRects.set(key, { left: r.left, top: r.top });
    }

    const deltas = computeGridFlipDeltas(prevRects, nextRects);
    const kinds = classifyResultTransitions(resultsState.prevKeys, resultKeys, deltas);

    // 2. Batch-write inverse transforms at initial frame
    const movedEls: HTMLDivElement[] = [];
    for (const [key, kind] of kinds.entries()) {
      if (kind !== 'move') continue;
      const el = itemRefs.current.get(key);
      const delta = deltas.get(key);
      if (!el || !delta) continue;
      el.style.transition = 'none';
      el.style.transform = `translate3d(${delta.dx}px, ${delta.dy}px, 0)`;
      el.style.willChange = 'transform';
      movedEls.push(el);
    }

    if (movedEls.length === 0) return;

    // 3. Force a single layout flush to commit inverse transforms
    void (gridRef.current ?? movedEls[0]).offsetHeight;

    // 4. Play spring glide back to zero
    for (const el of movedEls) {
      el.style.transition = 'transform 460ms var(--sx-ease-spring)';
      el.style.transform = 'translate3d(0, 0, 0)';
    }

    const cleanupTimer = window.setTimeout(() => {
      for (const el of movedEls) {
        el.style.transition = '';
        el.style.transform = '';
        el.style.willChange = '';
      }
    }, 480);
    flipCleanupTimersRef.current.push(cleanupTimer);
  }, [resultKeys, resultsState.prevKeys]);

  // Compute staggered animation indices ONLY for newly entering cards so moving cards stay opaque
  const enteringIndices = useMemo(() => {
    const map = new Map<string, number>();
    let enterOrder = 0;
    for (const key of resultKeys) {
      if (!resultsState.prevKeys.has(key)) {
        map.set(key, enterOrder++);
      }
    }
    return map;
  }, [resultKeys, resultsState.prevKeys]);

  const clearAll = () => {
    setQueryInput('');
    setDebouncedQuery('');
    setSelectedGenres([]);
    setSelectedTags([]);
    setSort('POPULARITY_DESC');
    setStatus('ALL');
    setFormat('ALL');
    setCategoryTitle(null);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = queryInput.trim();
    if (trimmed.length >= 2) {
      setSearchHistory(recordDiscoverSearchHistory(mediaType, trimmed));
    }
    setDebouncedQuery(trimmed);
  };

  const handleSelectHistoryTerm = (term: string) => {
    setQueryInput(term);
    setDebouncedQuery(term);
    setSearchHistory(recordDiscoverSearchHistory(mediaType, term));
    searchInputRef.current?.focus();
  };

  const handleExitSearchFocus = () => {
    setSearchFocused(false);
    searchInputRef.current?.blur();
  };

  const handleOpenMediaItem = (media: UnifiedMedia) => {
    setClickedHistory(recordDiscoverClickedMedia(mediaType, media));
    navigate(`/details/${media.type.toLowerCase()}/${media.id}`, {
      state: { media },
    });
  };

  const isTrackerMode = state.discoveryPrefs.mode === 'tracker';
  const activeGenreCardStyle = resolveGenreCardStyle(state.uiPrefs.genreCardStyle);
  const genreTabGroups = useMemo(
    () =>
      buildDiscoverCategoryGroups({
        browseTab: 'genres',
        genresList,
        tagsList: [],
        categoryQuery: '',
        categorySort,
        mediaType,
      }),
    [genresList, categorySort, mediaType],
  );
  const tagTabGroups = useMemo(
    () =>
      buildDiscoverCategoryGroups({
        browseTab: 'tags',
        genresList,
        tagsList,
        categoryQuery: '',
        categorySort,
        mediaType,
      }),
    [genresList, tagsList, categorySort, mediaType],
  );
  const genresTabCount = useMemo(() => countDiscoverCategoryItems(genreTabGroups), [genreTabGroups]);
  const tagsTabCount = useMemo(() => countDiscoverCategoryItems(tagTabGroups), [tagTabGroups]);
  const categoryGroups = browseTab === 'tags' ? tagTabGroups : genreTabGroups;
  const selectableFilterTags = useMemo(
    () => tagTabGroups.flatMap((g) => g.items.flatMap((item) => item.filterValues)),
    [tagTabGroups],
  );

  const isSearchHeaderCollapsed = searchFocused || isSearching;
  const isSearchExpanded = resolveSearchExpansionState({
    searchFocused,
    queryInput,
    hasActiveFilters,
    categoryTitle,
  });
  const showSearchHistory =
    searchFocused && queryInput.trim().length === 0 && !hasActiveFilters && !categoryTitle;

  const mediaTypePill = useSlidingPill<HTMLDivElement>(mediaType);
  const browseTabPill = useSlidingPill<HTMLDivElement>(browseTab, `${isSearching}-${isTrackerMode}`);

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      <div className="space-y-0">
        {/* Top Browse Page Header — smoothly collapses upward when search is focused */}
        <div
          data-testid="discover-browse-header"
          data-collapsed={isSearchHeaderCollapsed ? 'true' : 'false'}
          className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[var(--sx-ease-ios)] ${
            isSearchHeaderCollapsed
              ? 'grid-rows-[0fr] opacity-0 -translate-y-4 pointer-events-none'
              : 'grid-rows-[1fr] opacity-100 translate-y-0'
          }`}
        >
          <div className="overflow-hidden">
            <header className="space-y-0.5 pb-4">
              <h1 className="text-2xl sm:text-[28px] font-black tracking-tight text-[var(--sx-on-surface)]">
                Browse
              </h1>
              <p className="text-xs sm:text-sm text-[var(--sx-on-surface-muted)]">
                Find your next series by genre, world, mood and audience
              </p>
            </header>
          </div>
        </div>

        {/* Search Bar + Media Type Switcher */}
        <div ref={searchAreaRef} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <form
              onSubmit={handleSearchSubmit}
              data-testid="discover-search-form"
              data-expanded={isSearchExpanded ? 'true' : 'false'}
              className="relative sx-search-expand-form"
            >
              {searchFocused ? (
                <button
                  type="button"
                  data-testid="discover-search-back"
                  aria-label="Exit search"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleExitSearchFocus}
                  className="z-10 w-6 h-6 flex items-center justify-center rounded-md text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] absolute left-2.5 top-1/2 -translate-y-1/2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 sx-search-icon-enter" />
                </button>
              ) : (
                <span className="z-10 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] sx-search-icon-enter" />
                </span>
              )}
              <input
                ref={searchInputRef}
                type="text"
                data-testid="discover-search-input"
                value={queryInput}
                onFocus={() => setSearchFocused(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    handleExitSearchFocus();
                  }
                }}
                onChange={(e) => setQueryInput(e.target.value)}
                placeholder={
                  categoryTitle
                    ? `Search in ${categoryTitle}...`
                    : `Search ${mediaType.toLowerCase()} on ${effectiveMetadataTracker}...`
                }
                className="w-full pl-10 pr-20 py-3 rounded-[var(--sx-radius)] sx-glass-panel sx-search-expand-input border border-[var(--sx-outline)] text-sm font-medium focus:outline-none"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {(queryInput || hasActiveFilters) && (
                  <button
                    type="button"
                    onClick={clearAll}
                    title="Clear search & filters"
                    className="p-1.5 rounded-lg text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFilterOpen(true)}
                  title="Advanced Filters"
                  className={`p-1.5 rounded-lg transition-colors ${
                    hasActiveFilters
                      ? 'sx-glass-active'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
                  }`}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Media Switcher matching MediaSwitcherOverlay */}
            <div
              ref={mediaTypePill.containerRef}
              className="relative flex items-center gap-1 p-1 rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] self-start sm:self-auto"
            >
              {mediaTypePill.pillRect.ready && (
                <span
                  aria-hidden="true"
                  style={{
                    transform: `translate3d(${mediaTypePill.pillRect.left}px, ${mediaTypePill.pillRect.top}px, 0)`,
                    width: `${mediaTypePill.pillRect.width}px`,
                    height: `${mediaTypePill.pillRect.height}px`,
                  }}
                  className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-[calc(var(--sx-radius)-4px)] sx-glass-active"
                />
              )}
              {(['ANIME', 'MANGA'] as const).map((t) => (
                <button
                  key={t}
                  ref={mediaTypePill.registerItemRef(t)}
                  type="button"
                  onClick={() => setMediaType(t)}
                  className={`relative z-10 px-3.5 py-1.5 rounded-[calc(var(--sx-radius)-4px)] text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    mediaType === t
                      ? mediaTypePill.pillRect.ready
                        ? 'text-[var(--sx-primary)] font-extrabold'
                        : 'sx-glass-active font-extrabold'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  {t === 'ANIME' ? 'Anime' : 'Manga'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Active Filter Summary */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {selectedGenres.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setSelectedGenres((prev) => prev.filter((x) => x !== g))}
              className="sx-filter-chip-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--sx-primary-container)]/40 border border-[var(--sx-primary)]/40 font-semibold transition-colors hover:border-[var(--sx-primary)]"
            >
              <span>{g}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          {selectedTags.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setSelectedTags((prev) => prev.filter((x) => x !== t))}
              className="sx-filter-chip-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] font-semibold transition-colors hover:border-[var(--sx-primary)]/50"
            >
              <span>#{t}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
          {sort !== 'POPULARITY_DESC' && (
            <button
              type="button"
              onClick={() => setSort('POPULARITY_DESC')}
              className="sx-filter-chip-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] font-semibold transition-colors hover:border-[var(--sx-primary)]/50"
            >
              <span>Sort: {formatSortLabel(sort)}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {status !== 'ALL' && (
            <button
              type="button"
              onClick={() => setStatus('ALL')}
              className="sx-filter-chip-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] font-semibold transition-colors hover:border-[var(--sx-primary)]/50"
            >
              <span>Status: {status}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          {format !== 'ALL' && (
            <button
              type="button"
              onClick={() => setFormat('ALL')}
              className="sx-filter-chip-enter inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)] font-semibold transition-colors hover:border-[var(--sx-primary)]/50"
            >
              <span>Format: {format}</span>
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={clearAll}
            className="sx-filter-chip-enter inline-flex items-center gap-1 text-[var(--sx-primary)] font-bold ml-1 hover:underline"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      )}

      {/* Results Toolbar: Full Matching Count + Infinite/Pages Mode Switcher */}
      {isSearching && (results.length > 0 || loading) && (
        <div
          data-testid="discover-results-toolbar"
          className="sx-results-stage-enter flex items-center justify-between gap-3 py-1"
        >
          <div className="flex items-center gap-2.5 text-xs font-bold text-[var(--sx-on-surface-muted)]">
            {results.length > 0 ? (
              <span data-testid="discover-results-count" className="tabular-nums">
                {displayedTotalCount.toLocaleString('en-US')}{' '}
                {displayedTotalCount === 1 ? 'title' : 'titles'}
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="sr-only">Searching catalog</span>
                <SkeletonBlock index={0} tone="accent" className="h-5 w-24 rounded-full" />
              </div>
            )}
            {loading && results.length > 0 && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-primary)]">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>Updating</span>
              </span>
            )}
          </div>

          <div
            role="group"
            aria-label="Pagination mode"
            className="inline-flex items-center gap-1 p-1 rounded-full sx-glass-panel border border-[var(--sx-outline)] shrink-0"
          >
            <button
              type="button"
              data-testid="discover-results-mode-infinite"
              aria-pressed={resultsMode === 'infinite'}
              onClick={() => handleResultsModeChange('infinite')}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                resultsMode === 'infinite'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] font-extrabold shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <InfinityIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Infinite</span>
            </button>
            <button
              type="button"
              data-testid="discover-results-mode-pages"
              aria-pressed={resultsMode === 'pages'}
              onClick={() => handleResultsModeChange('pages')}
              className={`inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap ${
                resultsMode === 'pages'
                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] font-extrabold shadow-sm'
                  : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span>Pages</span>
            </button>
          </div>
        </div>
      )}

      {/* Results OR Full-Page Search History OR Browse Genres/Sources */}
      {!isSearching ? (
        showSearchHistory ? (
          <div
            data-testid="discover-search-history"
            className="sx-results-stage-enter space-y-5"
          >
            {/* Section 1: Separate Text Search History */}
            <section
              data-testid="discover-search-history-queries"
              className="rounded-[calc(var(--sx-radius)+6px)] sx-glass-panel border border-[var(--sx-outline)] p-4 sm:p-5 space-y-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center shrink-0">
                    <Clock className="w-4 h-4 text-[var(--sx-primary)]" />
                  </span>
                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)]">
                    Recent {mediaType === 'MANGA' ? 'Manga' : 'Anime'} Searches
                  </h2>
                </div>
                {searchHistory.length > 0 && (
                  <button
                    type="button"
                    data-testid="discover-search-history-clear"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setSearchHistory(clearDiscoverSearchHistory(mediaType))}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/12 border border-red-500/25 text-xs font-bold text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {searchHistory.length > 0 ? (
                <div className="space-y-2">
                  {searchHistory.map((term) => (
                    <div
                      key={term}
                      className="flex items-center justify-between gap-2 rounded-2xl sx-glass-control border border-[var(--sx-outline)]/80 hover:border-[var(--sx-primary)]/45 px-3.5 py-2.5 transition-colors"
                    >
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => handleSelectHistoryTerm(term)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left text-sm font-semibold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] transition-colors"
                      >
                        <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] shrink-0" />
                        <span className="truncate">{term}</span>
                      </button>
                      <button
                        type="button"
                        aria-label={`Remove ${term} from search history`}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() =>
                          setSearchHistory(removeDiscoverSearchHistoryItem(mediaType, term))
                        }
                        className="p-1.5 rounded-lg border border-[var(--sx-outline)]/70 text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] transition-colors shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--sx-on-surface-muted)] py-2">
                  No previous {mediaType === 'MANGA' ? 'manga' : 'anime'} text searches yet.
                </p>
              )}
            </section>

            {/* Section 2: Separate Recently Viewed / Clicked Anime or Manga from Search */}
            <section
              data-testid="discover-search-history-media"
              className="rounded-[calc(var(--sx-radius)+6px)] sx-glass-panel border border-[var(--sx-outline)] p-4 sm:p-5 space-y-3.5 shadow-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-8 h-8 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center shrink-0">
                    {mediaType === 'MANGA' ? (
                      <BookOpen className="w-4 h-4 text-[var(--sx-primary)]" />
                    ) : (
                      <Film className="w-4 h-4 text-[var(--sx-primary)]" />
                    )}
                  </span>
                  <h2 className="text-sm sm:text-base font-extrabold text-[var(--sx-on-surface)]">
                    Recent {mediaType === 'MANGA' ? 'Manga' : 'Anime'}
                  </h2>
                </div>
                {clickedHistory.length > 0 && (
                  <button
                    type="button"
                    data-testid="discover-clicked-history-clear"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => setClickedHistory(clearDiscoverClickedMedia(mediaType))}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/12 border border-red-500/25 text-xs font-bold text-red-500 dark:text-red-400 hover:bg-red-500/20 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {clickedHistory.length > 0 ? (
                <div className="space-y-2">
                  {clickedHistory.map((item) => {
                    const itemTitle = getPreferredTitle(
                      item.title,
                      state.contentPrefs.titlePreference,
                    );
                    const formatLabel = formatCardFormatTag(item);
                    const unitLabel = formatCardUnitLabel(item);
                    return (
                      <div
                        key={`clicked-${item.type}-${item.id}`}
                        className="group flex items-center justify-between gap-3 rounded-2xl p-2 hover:bg-[var(--sx-surface-high)]/65 border border-transparent hover:border-[var(--sx-outline)]/70 transition-colors"
                      >
                        <button
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => handleOpenMediaItem(item)}
                          className="flex items-center gap-3.5 flex-1 min-w-0 text-left"
                        >
                          <div className="w-14 h-[72px] rounded-xl overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60 shrink-0">
                            <SmartImage
                              src={item.cover}
                              alt={itemTitle}
                              fallbackTitle={itemTitle}
                              className="w-full h-full"
                            />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="text-sm sm:text-[15px] font-bold text-[var(--sx-on-surface)] line-clamp-1 group-hover:text-[var(--sx-primary)] transition-colors">
                              {itemTitle}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--sx-on-surface-muted)] uppercase tracking-wide tabular-nums">
                              <span>{formatLabel}</span>
                              {unitLabel && (
                                <>
                                  <span aria-hidden="true">•</span>
                                  <span>{unitLabel}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label={`Remove ${itemTitle} from recent ${mediaType.toLowerCase()}`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() =>
                            setClickedHistory(removeDiscoverClickedMediaItem(mediaType, item.id))
                          }
                          className="p-1.5 rounded-lg text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] transition-colors shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs sm:text-sm text-[var(--sx-on-surface-muted)] py-2">
                  {mediaType === 'MANGA' ? 'Manga' : 'Anime'} you open from search results will appear here.
                </p>
              )}
            </section>
          </div>
        ) : isTrackerMode ? (
          <div className="sx-results-stage-enter space-y-5">
            {/* Genres/Tags Tabs + Responsive Sort Select (icon-only on tight screens) + Grid/List Toggle */}
            <div className="flex items-center justify-between gap-1.5 sm:gap-2.5 flex-nowrap">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <div
                  ref={browseTabPill.containerRef}
                  className="relative inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl sx-glass-panel border border-[var(--sx-outline)] shrink-0"
                >
                  {browseTabPill.pillRect.ready && (
                    <span
                      aria-hidden="true"
                      style={{
                        transform: `translate3d(${browseTabPill.pillRect.left}px, ${browseTabPill.pillRect.top}px, 0)`,
                        width: `${browseTabPill.pillRect.width}px`,
                        height: `${browseTabPill.pillRect.height}px`,
                      }}
                      className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-[10px] sm:rounded-xl sx-glass-active"
                    />
                  )}
                  <button
                    ref={browseTabPill.registerItemRef('genres')}
                    type="button"
                    data-testid="discover-tab-genres"
                    onClick={() => setBrowseTab('genres')}
                    className={`relative z-10 px-2.5 sm:px-3.5 py-1.5 rounded-[10px] sm:rounded-xl text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      browseTab === 'genres'
                        ? browseTabPill.pillRect.ready
                          ? 'text-[var(--sx-primary)] font-extrabold'
                          : 'sx-glass-active font-extrabold'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Genres ({genresTabCount})
                  </button>
                  <button
                    ref={browseTabPill.registerItemRef('tags')}
                    type="button"
                    data-testid="discover-tab-tags"
                    onClick={() => setBrowseTab('tags')}
                    className={`relative z-10 px-2.5 sm:px-3.5 py-1.5 rounded-[10px] sm:rounded-xl text-[11px] sm:text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                      browseTab === 'tags'
                        ? browseTabPill.pillRect.ready
                          ? 'text-[var(--sx-primary)] font-extrabold'
                          : 'sx-glass-active font-extrabold'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Tags ({tagsTabCount})
                  </button>
                </div>

                {/* Responsive Sort By selector: hides text label when space is tight (< sm), shows text on wider viewports */}
                <label
                  title={`Sort: ${categorySort === 'az' ? 'A to Z' : categorySort === 'popular' ? 'Most popular' : 'Suggested'}`}
                  className="relative inline-flex items-center justify-center sm:justify-start gap-1.5 p-2 sm:px-3 sm:py-2 rounded-xl sm:rounded-2xl sx-glass-panel border border-[var(--sx-outline)] text-xs font-bold hover:border-[var(--sx-primary)]/45 transition-colors cursor-pointer shrink-0"
                >
                  <ArrowUpDown className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                  <select
                    aria-label="Sort categories"
                    data-testid="discover-category-sort-select"
                    value={categorySort}
                    onChange={(e) => setCategorySort(e.target.value as DiscoverCategorySort)}
                    className="appearance-none bg-transparent max-sm:absolute max-sm:inset-0 max-sm:w-full max-sm:h-full max-sm:opacity-0 sm:pr-5 text-xs font-bold text-[var(--sx-on-surface)] focus:outline-none cursor-pointer"
                  >
                    <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="suggested">
                      Suggested
                    </option>
                    <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="az">
                      A to Z
                    </option>
                    <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="popular">
                      Most popular
                    </option>
                  </select>
                  <ChevronDown className="hidden sm:block w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
                </label>
              </div>

              <div className="inline-flex items-center gap-0.5 sm:gap-1 p-0.5 sm:p-1 rounded-xl sm:rounded-2xl sx-glass-panel border border-[var(--sx-outline)] shrink-0">
                <button
                  type="button"
                  data-testid="discover-category-view-grid"
                  aria-label="Grid view"
                  aria-pressed={categoryViewMode === 'grid'}
                  onClick={() => setCategoryViewMode('grid')}
                  className={`p-1.5 sm:p-2 rounded-[10px] sm:rounded-xl transition-colors ${
                    categoryViewMode === 'grid'
                      ? 'sx-glass-active text-[var(--sx-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  <LayoutGrid className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
                <button
                  type="button"
                  data-testid="discover-category-view-list"
                  aria-label="List view"
                  aria-pressed={categoryViewMode === 'list'}
                  onClick={() => setCategoryViewMode('list')}
                  className={`p-1.5 sm:p-2 rounded-[10px] sm:rounded-xl transition-colors ${
                    categoryViewMode === 'list'
                      ? 'sx-glass-active text-[var(--sx-primary)]'
                      : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                  }`}
                >
                  <List className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            </div>

            {/* Category Groups & Cards */}
            <div key={`${mediaType}-${browseTab}-${categorySort}-${activeGenreCardStyle}`} className="space-y-6">
              {categoryGroups.map((group) => (
                <section key={group.id} className="space-y-3">
                  {group.title && (
                    <div className="flex items-center gap-3">
                      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sx-on-surface-muted)] shrink-0">
                        {group.title}
                      </h2>
                      <div className="h-px flex-1 bg-[var(--sx-outline)]/60" />
                    </div>
                  )}
                  <div
                    className={
                      categoryViewMode === 'list'
                        ? 'grid grid-cols-1 gap-2.5'
                        : activeGenreCardStyle === 'classic'
                          ? 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3'
                          : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4'
                    }
                  >
                    {group.items.map((item, idx) => (
                      <GenreCard
                        key={`${group.id}-${item.id}`}
                        descriptor={item}
                        style={activeGenreCardStyle}
                        viewMode={categoryViewMode}
                        roundness={`${state.themePrefs.uiRoundness}px`}
                        animationDelayMs={getBoundedStaggerDelay(idx, 14, 10)}
                        onClick={() =>
                          navigate(buildGenreDetailUrl(item, mediaType), {
                            state: { descriptor: item },
                          })
                        }
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="sx-results-stage-enter space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-extrabold">Available Sources</h2>
              <button
                type="button"
                onClick={() => navigate('/settings/extensions')}
                className="text-xs font-bold text-[var(--sx-primary)] hover:underline"
              >
                Manage Extensions
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {allSources
                .filter((s) => s.mediaTypes.includes(mediaType))
                .map((src) => {
                  const active = state.discoveryPrefs.activeSources.includes(src.id);
                  const playability = getSourcePlayabilityStatus(src, mediaType);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => toggleSourceActive(src.id)}
                      className={`p-4 rounded-[var(--sx-radius)] border text-left transition-colors flex items-start justify-between gap-3 ${
                        active
                          ? 'bg-[var(--sx-primary-container)]/25 border-[var(--sx-primary)]'
                          : 'sx-glass-panel border-[var(--sx-outline)]'
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Puzzle className="w-4 h-4 text-[var(--sx-primary)]" />
                          <span className="text-sm font-bold">{src.name}</span>
                          {playability === 'metadata-only' && (
                            <span className="px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-600 dark:text-orange-300 text-[10px] font-extrabold uppercase">
                              Metadata Only
                            </span>
                          )}
                          {playability === 'missing-host' && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-300 text-[10px] font-extrabold uppercase">
                              No Host URL
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--sx-on-surface-muted)]">
                          {src.description}
                        </p>
                      </div>
                      {active && <CheckCircle2 className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />}
                    </button>
                  );
                })}
            </div>
          </div>
        )
      ) : loading && results.length === 0 ? (
        <div
          aria-busy="true"
          aria-label="Loading search results"
          className={`sx-results-stage-enter ${getMediaGridClassName(state.uiPrefs.cardStyle)}`}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <MediaCardSkeleton key={i} index={i} style={state.uiPrefs.cardStyle} fullWidth />
          ))}
        </div>
      ) : error && results.length === 0 ? (
        <div className="sx-results-stage-enter p-8 rounded-[var(--sx-radius)] sx-glass-panel border border-red-500/30 text-center space-y-3">
          <p className="text-sm font-bold text-red-400">{error}</p>
          <button
            type="button"
            onClick={() => runSearch(1, false)}
            className="px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
          >
            Retry Search
          </button>
        </div>
      ) : results.length === 0 ? (
        <div className="sx-results-stage-enter py-16 text-center space-y-2">
          <p className="text-base font-bold">No results found</p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Try adjusting your query or clearing active filters.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {error && (
            <div className="sx-results-stage-enter flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-xs">
              <span className="font-semibold text-red-400">{error}</span>
              <button
                type="button"
                onClick={() => runSearch(1, false)}
                className="font-bold text-red-300 hover:underline shrink-0"
              >
                Retry
              </button>
            </div>
          )}
          <div
            ref={gridRef}
            data-testid="discover-results-grid"
            className={`sx-results-grid-state ${getMediaGridClassName(state.uiPrefs.cardStyle)} ${
              loading ? 'opacity-60 scale-[0.992] pointer-events-none' : 'opacity-100 scale-100'
            }`}
          >
            {displayedResults.map((media, idx) => {
              const key = resultKeys[idx] ?? `${media.type}-${media.id}`;
              return (
                <div
                  key={key}
                  ref={registerItemRef(key)}
                  data-flip-key={key}
                >
                  <MediaCard
                    media={media}
                    fullWidth
                    animationIndex={enteringIndices.get(key)}
                    onClick={() => handleOpenMediaItem(media)}
                  />
                </div>
              );
            })}
          </div>
          {resultsMode === 'infinite' && loadingMore && (
            <div
              aria-busy="true"
              aria-label="Loading more results"
              className={getMediaGridClassName(state.uiPrefs.cardStyle)}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <MediaCardSkeleton
                  key={`more-${i}`}
                  index={i}
                  style={state.uiPrefs.cardStyle}
                  fullWidth
                />
              ))}
            </div>
          )}
          {resultsMode === 'infinite' && hasNextPage && (
            <div
              ref={infiniteSentinelRef}
              data-testid="discover-infinite-sentinel"
              aria-hidden="true"
              className="h-8 w-full flex items-center justify-center"
            >
              {loadingMore && <Loader2 className="w-5 h-5 animate-spin text-[var(--sx-primary)]" />}
            </div>
          )}
          {resultsMode === 'pages' && totalPages > 1 && (
            <div
              data-testid="discover-pagination"
              className="flex flex-col items-center justify-center gap-3 pt-4"
            >
              <nav
                aria-label="Search results pagination"
                className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 py-1.5 rounded-full sx-glass-panel border border-[var(--sx-outline)] shadow-sm max-w-full overflow-x-auto"
              >
                <button
                  type="button"
                  data-testid="discover-page-first"
                  aria-label="First page"
                  disabled={page <= 1 || loading}
                  onClick={() => goToResultsPage(1)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full inline-flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="discover-page-prev"
                  aria-label="Previous page"
                  disabled={page <= 1 || loading}
                  onClick={() => goToResultsPage(page - 1)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full inline-flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span
                  aria-hidden="true"
                  className="h-5 w-px bg-[var(--sx-outline)]/70 mx-0.5 shrink-0"
                />

                {paginationTokens.map((token, idx) =>
                  token === 'ellipsis' ? (
                    <span
                      key={`ellipsis-${idx}`}
                      aria-hidden="true"
                      className="px-1.5 text-xs font-bold text-[var(--sx-on-surface-muted)] select-none shrink-0"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={`page-${token}`}
                      type="button"
                      data-testid={`discover-page-${token}`}
                      aria-label={`Page ${token}`}
                      aria-current={token === page ? 'page' : undefined}
                      disabled={loading}
                      onClick={() => goToResultsPage(token)}
                      className={`min-w-8 h-8 sm:min-w-9 sm:h-9 px-2 rounded-full inline-flex items-center justify-center text-xs sm:text-sm tabular-nums transition-all shrink-0 ${
                        token === page
                          ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] font-extrabold shadow-sm'
                          : 'font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)]'
                      }`}
                    >
                      {token}
                    </button>
                  ),
                )}

                <span
                  aria-hidden="true"
                  className="h-5 w-px bg-[var(--sx-outline)]/70 mx-0.5 shrink-0"
                />

                <button
                  type="button"
                  data-testid="discover-page-next"
                  aria-label="Next page"
                  disabled={page >= totalPages || loading}
                  onClick={() => goToResultsPage(page + 1)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full inline-flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  data-testid="discover-page-last"
                  aria-label="Last page"
                  disabled={page >= totalPages || loading}
                  onClick={() => goToResultsPage(totalPages)}
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-full inline-flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-[var(--sx-surface-high)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </nav>

              <div className="flex items-center justify-center gap-1.5 text-xs text-[var(--sx-on-surface-muted)]">
                <kbd className="inline-flex items-center justify-center w-6 h-6 rounded-md sx-glass-control border border-[var(--sx-outline)]">
                  <ArrowLeft className="w-3 h-3" />
                </kbd>
                <kbd className="inline-flex items-center justify-center w-6 h-6 rounded-md sx-glass-control border border-[var(--sx-outline)]">
                  <ArrowRight className="w-3 h-3" />
                </kbd>
                <span className="ml-1 font-medium">to navigate</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Search Sheet Modal */}
      {filterOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setFilterOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Advanced Search Filters"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-xl max-h-[85vh] overflow-y-auto sx-glass-modal border border-[var(--sx-outline)] rounded-t-2xl sm:rounded-2xl p-5 space-y-5 shadow-2xl sx-sheet-enter"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">Advanced Search Filters</h2>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="p-2 rounded-lg hover:bg-[var(--sx-surface-high)]"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Sort By
                    </label>
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value as SearchSort)}
                      className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="POPULARITY_DESC">Popularity</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="TRENDING_DESC">Trending</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="SCORE_DESC">Highest Score</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="FAVOURITES_DESC">Favourites</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="START_DATE_DESC">Newest</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Status
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as SearchStatusFilter)}
                      className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ALL">All Statuses</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="RELEASING">Releasing</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="FINISHED">Finished</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="NOT_YET_RELEASED">Upcoming</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="CANCELLED">Cancelled</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as SearchFormatFilter)}
                      className="w-full px-3 py-2 rounded-xl sx-glass-control border border-[var(--sx-outline)] text-xs font-semibold"
                    >
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ALL">All Formats</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="TV">TV</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="MOVIE">Movie</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="OVA">OVA</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ONA">ONA</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="MANGA">Manga</option>
                      <option className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]" value="ONE_SHOT">One Shot</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                    Genres
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {genresList.map((g) => {
                      const active = selectedGenres.includes(g);
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() =>
                            setSelectedGenres((prev) =>
                              active ? prev.filter((x) => x !== g) : [...prev, g],
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'sx-glass-active font-bold'
                              : 'sx-glass-control border-[var(--sx-outline)]'
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                    Tags
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {selectableFilterTags.map((t) => {
                      const active = selectedTags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() =>
                            setSelectedTags((prev) =>
                              active ? prev.filter((x) => x !== t) : [...prev, t],
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            active
                              ? 'sx-glass-active font-bold'
                              : 'sx-glass-control border-[var(--sx-outline)]'
                          }`}
                        >
                          #{t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--sx-outline)]">
                  <button
                    type="button"
                    onClick={clearAll}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterOpen(false)}
                    className="px-5 py-2 rounded-xl sx-glass-cta text-xs font-bold"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}
    </div>
  );
};

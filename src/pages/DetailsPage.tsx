import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertCircle,
  AlignJustify,
  ArrowDownUp,
  ArrowLeft,
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  BookmarkPlus,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Film,
  FlaskConical,
  Hash,
  Home,
  Info,
  Languages,
  Layers,
  LayoutGrid,
  List,
  Loader2,
  MessageSquare,
  Minus,
  Play,
  Plus,
  Puzzle,
  Radio,
  RectangleHorizontal,
  RefreshCw,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Sparkles,
  Star,
  ThumbsUp,
  Timer,
  Wrench,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  DownloadTask,
  getPreferredTitle,
  getStatusLabel,
  MatchedSourceEntry,
  MediaType,
  TrackedStatus,
  UnifiedChapter,
  UnifiedEpisode,
  UnifiedMedia,
  VideoStream,
} from '../types/media';
import { fetchMediaDetails } from '../services/discoveryService';
import { suppressNextRouteHaptic, triggerHaptic } from '../utils/haptics';
import { searchAniList } from '../services/anilist';
import { searchJikan } from '../services/jikan';
import {
  INBUILT_SOURCES,
  diagnoseExtensionAsync,
  resolveChapterPages,
  resolveEpisodesForMedia,
  resolveMangaChapterPagesAsync,
  resolveMangaChaptersAsync,
  resolveVideoServers,
  resolveVideoStreamAsync,
  searchExtensionTitlesAsync,
} from '../services/sourceEngine';
import {
  buildSelectableAudioOptions,
  resolveAudioLanguageOption,
  resolvePersistedSubtitleLang,
  resolvePreferredAudioForSource,
  resolvePreferredVideoServer,
} from '../utils/inlinePlayer';
import {
  filterAvailableSources,
  filterPlayableSourcesForPlayer,
  formatSourceAvailabilityLabel,
  getSourceManagerBadge,
  resolveActiveSourceId,
} from '../utils/sourcePicker';
import {
  classifyDiagnosticFailure,
  DEFAULT_DIAGNOSTIC_PROBE_SCOPE,
  type ExtensionDiagnosticReport,
  loadPersistedExtensionDiagnostics,
  savePersistedExtensionDiagnostic,
} from '../utils/extensionDiagnostics';
import {
  resolveSourceLiveStatusBadge,
  sortSourcesByLiveStatus,
} from '../utils/sourceStatus';
import { SourceLiveStatusChip } from '../components/extensions/SourceLiveStatusBadge';
import {
  BackendConnectionError,
  BackendNotConfiguredError,
  NonJsonResponseError,
} from '../utils/backendConfig';
import {
  isMatchedSourceEntryValidForSource,
  shouldUseExtensionEpisodesForSelection,
  shouldUseExtensionWrongTitleSearch,
} from '../utils/streamResolverUtils';
import { SmartImage } from '../components/SmartImage';
import { MediaCard } from '../components/MediaCard';
import { EpisodeChapterList } from '../components/EpisodeChapterList';
import { InlineAnimePlayer } from '../components/InlineAnimePlayer';
import { formatMediaDocumentTitle } from '../utils/documentTitle';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import {
  DetailsHeroSkeleton,
  DetailsSynopsisSkeleton,
  EpisodeListSkeleton,
  SkeletonBlock,
} from '../components/Skeleton';
import { EPISODE_CHAPTER_STYLES, EpisodeChapterStyle } from '../data/themePresets';
import {
  buildMediaScopeKey,
  formatChapterMetaLine,
  formatEpisodeMetaLine,
  getNextEpisodeChapterStyle,
  isEpisodeOrChapterWatched,
  resolveEpisodeChapterStyle,
} from '../utils/episodeChapterStyle';
import {
  buildEpisodeRanges,
  EpisodeRange,
  filterByEpisodeRange,
  formatCompactNumber,
  formatNextAiringInfo,
  getEpisodeRangeCount,
  partitionMediaRelations,
  stripHtmlTags,
} from '../utils/detailsLayout';
import { useSlidingPill } from '../hooks/useSlidingPill';
import { ScrollReveal } from '../components/ScrollReveal';
import {
  DetailsTabDirection,
  getDetailsTabDirection,
  getDetailsTabTransitionClass,
  shouldShowDetailsStickyHeader,
} from '../utils/detailsMotion';
import { getRouteTransitionClass, getRouteTransitionKind } from '../utils/appMotion';
import { resolveBackgroundPollIntervalMs } from '../utils/batterySaver';
import { getPreviousVisitedRoute } from '../utils/scrollPersistence';
import { useScrollPersistence } from '../hooks/useScrollPersistence';

type DetailsTab = 'info' | 'watch' | 'comments';

interface LocalReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

function toYouTubeEmbedUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    const id = parsed.searchParams.get('v') || parsed.pathname.split('/').pop();
    return id ? `https://www.youtube.com/embed/${id}?autoplay=1` : null;
  } catch {
    return null;
  }
}

export const DetailsPage: React.FC = () => {
  const { mediaType: paramType, id } = useParams<{ mediaType: string; id: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const {
    state,
    batterySaver,
    updateUiPrefs,
    updatePlayerPrefs,
    setPreferredSource,
    getLibraryEntry,
    upsertLibraryEntry,
    removeLibraryEntry,
    toggleItemBookmark,
    enqueueDownload,
    updateDownloadTask,
    setRealDownloadActive,
    toggleDownloadPause,
    removeDownload,
    addComment,
    likeComment,
  } = useApp();

  const navMediaState =
    (location.state as {
      media?: UnifiedMedia;
      initialTab?: DetailsTab;
      episodeIndex?: number;
      episodeNumber?: number;
      startTime?: number;
      resumePlaying?: boolean;
      activeSubLang?: string;
      editedCuesMap?: Record<string, import('../utils/inlinePlayer').SubtitleCue[]>;
    } | null) ?? null;
  const initialMedia = navMediaState?.media;
  const resolvedType: MediaType =
    paramType?.toUpperCase() === 'MANGA' ? 'MANGA' : 'ANIME';

  const detailsRouteKey = `/details/${resolvedType.toLowerCase()}/${id || ''}`;
  const prevVisitedRouteRef = React.useRef<string | null>(getPreviousVisitedRoute());
  const detailsTransitionKind =
    prevVisitedRouteRef.current === '/reader'
      ? 'pop'
      : getRouteTransitionKind(prevVisitedRouteRef.current, detailsRouteKey);
  const detailsTransitionClass =
    getRouteTransitionClass(detailsTransitionKind) || 'sx-page-push-enter';

  const { isRestoring: isRestoringScroll } = useScrollPersistence({
    routeKey: detailsRouteKey,
    enabled: Boolean(id),
  });

  const [media, setMedia] = useState<UnifiedMedia>(
    initialMedia ?? {
      id: id || '',
      type: resolvedType,
      title: { english: '' },
    },
  );
  const [loadingDetails, setLoadingDetails] = useState(true);
  const initialRequestedTab = navMediaState?.initialTab || 'info';
  const [activeTab, setActiveTab] = useState<DetailsTab>(initialRequestedTab);
  const prevTabRef = React.useRef<DetailsTab>(initialRequestedTab);
  const [tabDirection, setTabDirection] = useState<DetailsTabDirection>('none');
  const switchTab = (nextTab: DetailsTab) => {
    if (prevTabRef.current !== nextTab) {
      triggerHaptic('nav-tab');
    }
    setTabDirection(getDetailsTabDirection(prevTabRef.current, nextTab));
    prevTabRef.current = nextTab;
    setActiveTab(nextTab);
  };
  const tabTransitionClass = getDetailsTabTransitionClass(tabDirection);
  const hasSuppliedInitialEpisode =
    typeof navMediaState?.episodeIndex === 'number' && navMediaState.episodeIndex >= 0;
  const [inlineEpisodeIndex, setInlineEpisodeIndex] = useState(
    hasSuppliedInitialEpisode ? navMediaState!.episodeIndex! : 0,
  );
  const [hasPickedInlineEpisode, setHasPickedInlineEpisode] = useState(hasSuppliedInitialEpisode);
  const [inlinePlaySignal, setInlinePlaySignal] = useState(0);
  const prevDetailsIdRef = React.useRef<string>(`${resolvedType}:${id || ''}`);

  const [episodes, setEpisodes] = useState<UnifiedEpisode[]>([]);
  const [chapters, setChapters] = useState<UnifiedChapter[]>([]);
  const [resolvingEpisodes, setResolvingEpisodes] = useState(false);
  const [episodesError, setEpisodesError] = useState<string | null>(null);
  const [resolvingChapters, setResolvingChapters] = useState(false);
  const [chaptersError, setChaptersError] = useState<string | null>(null);
  const [episodeRefreshNonce, setEpisodeRefreshNonce] = useState(0);
  const [epFilter, setEpFilter] = useState('');
  const [epOrderAsc, setEpOrderAsc] = useState(true);
  const [selectedRangeId, setSelectedRangeId] = useState<string>('all');
  const [itemFilterMode, setItemFilterMode] = useState<'all' | 'downloaded' | 'bookmarked'>('all');

  const isMangaOnly = media.type === 'MANGA';
  const isReadingMedia = isMangaOnly;
  const availableSources = useMemo(() => {
    const combined = [...INBUILT_SOURCES, ...state.customSources];
    const typeMatched = filterPlayableSourcesForPlayer(
      combined.filter((s) => {
        const types = Array.isArray(s.mediaTypes) && s.mediaTypes.length > 0 ? s.mediaTypes : ['ANIME'];
        if (isMangaOnly) return types.includes('MANGA');
        return types.includes('ANIME') || types.includes('MOVIE') || types.includes('TV');
      }),
      media.type,
    );
    const activeMatched = typeMatched.filter((s) =>
      state.discoveryPrefs.activeSources.includes(s.id),
    );
    return activeMatched.length > 0 ? activeMatched : typeMatched;
  }, [isMangaOnly, media.type, state.customSources, state.discoveryPrefs.activeSources]);

  const preferredSourceIdForType = isMangaOnly
    ? state.discoveryPrefs.preferredMangaSourceId
    : state.discoveryPrefs.preferredAnimeSourceId;
  const selectedSourceId = useMemo(
    () =>
      resolveActiveSourceId({
        availableSources,
        preferredSourceId: preferredSourceIdForType,
        isManga: isMangaOnly,
        mediaType: media.type,
      }),
    [availableSources, preferredSourceIdForType, isMangaOnly, media.type],
  );
  const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
  const [sourcePickerQuery, setSourcePickerQuery] = useState('');
  const [sourcePickerWorkingOnly, setSourcePickerWorkingOnly] = useState(false);
  const [sourceDiagnosticsMap, setSourceDiagnosticsMap] = useState<
    Record<string, ExtensionDiagnosticReport>
  >(() => loadPersistedExtensionDiagnostics());
  const [probingSourceIds, setProbingSourceIds] = useState<Record<string, boolean>>({});
  const [batchProbingSources, setBatchProbingSources] = useState(false);
  const [audioPickerOpen, setAudioPickerOpen] = useState(false);
  const [resolvedWatchStream, setResolvedWatchStream] = useState<VideoStream | null>(null);
  const [matchedTitleOverride, setMatchedTitleOverride] = useState<string>('');
  const [matchedOverrideMedia, setMatchedOverrideMedia] = useState<UnifiedMedia | null>(null);
  const [matchedSourceEntry, setMatchedSourceEntry] = useState<MatchedSourceEntry | null>(null);
  const [wrongTitleOpen, setWrongTitleOpen] = useState(false);
  const [wrongTitleDraft, setWrongTitleDraft] = useState('');
  const [wrongTitleViewMode, setWrongTitleViewMode] = useState<'list' | 'grid'>('list');
  const [wrongTitleResults, setWrongTitleResults] = useState<UnifiedMedia[]>([]);
  const [wrongTitleSourceResults, setWrongTitleSourceResults] = useState<MatchedSourceEntry[]>([]);
  const [wrongTitleSearching, setWrongTitleSearching] = useState(false);
  const [wrongTitleSearchError, setWrongTitleSearchError] = useState<string | null>(null);
  const prevSelectedSourceRef = React.useRef<string>(selectedSourceId);
  const activeMatchedSourceEntry = isMatchedSourceEntryValidForSource(
    matchedSourceEntry,
    selectedSourceId,
  )
    ? matchedSourceEntry
    : null;

  const [synopsisExpanded, setSynopsisExpanded] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const [copiedToast, setCopiedToast] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const heroRef = React.useRef<HTMLDivElement>(null);
  const [showStickyHeader, setShowStickyHeader] = useState(false);

  useEffect(() => {
    const intervalMs = resolveBackgroundPollIntervalMs(30_000, batterySaver);
    if (!media.airingAt || intervalMs === null) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [media.airingAt, batterySaver]);

  // Show blurred sticky header only after scrolling past hero on non-watch tabs
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let rafId = 0;

    const evaluateSticky = () => {
      rafId = 0;
      const heroBottom = heroRef.current?.getBoundingClientRect().bottom ?? null;
      const next = shouldShowDetailsStickyHeader({
        activeTab,
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
  }, [activeTab, id]);

  const stickyHeaderVisible = activeTab !== 'watch' && showStickyHeader;

  // Comments & local spoiler/reply state
  const [commentInput, setCommentInput] = useState('');
  const [commentSpoiler, setCommentSpoiler] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<string, boolean>>({});
  const [replyTargetId, setReplyTargetId] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [repliesByComment, setRepliesByComment] = useState<Record<string, LocalReply[]>>({});

  const bottomNavPill = useSlidingPill<HTMLDivElement>(
    activeTab,
    `${media.id}-${episodes.length}-${chapters.length}`,
  );

  const libEntry = getLibraryEntry(media.id);
  const [editStatus, setEditStatus] = useState<TrackedStatus>(libEntry?.status || 'CURRENT');
  const [editProgress, setEditProgress] = useState<number>(libEntry?.progress || 0);
  const [editScore, setEditScore] = useState<number>(libEntry?.score || 0);
  const [editNotes, setEditNotes] = useState<string>(libEntry?.notes || '');

  useEffect(() => {
    if (libEntry) {
      setEditStatus(libEntry.status);
      setEditProgress(libEntry.progress);
      setEditScore(libEntry.score);
      setEditNotes(libEntry.notes || '');
    } else {
      setEditStatus('CURRENT');
      setEditProgress(0);
      setEditScore(0);
      setEditNotes('');
    }
  }, [libEntry]);


  useEffect(() => {
    if (!id) return;
    const nextRouteIdentity = `${resolvedType}:${id}`;
    const isRouteChanged = prevDetailsIdRef.current !== nextRouteIdentity;
    prevDetailsIdRef.current = nextRouteIdentity;

    setLoadingDetails(true);
    setSelectedRangeId('all');
    setItemFilterMode('all');
    setEpFilter('');
    setMatchedTitleOverride('');
    setMatchedOverrideMedia(null);
    setEpisodesError(null);
    setChaptersError(null);
    if (isRouteChanged) {
      setHasPickedInlineEpisode(false);
      setInlineEpisodeIndex(0);
      setInlinePlaySignal(0);
      setEpisodes([]);
      setChapters([]);
    }
    fetchMediaDetails(id, resolvedType, initialMedia?.providerId)
      .then((full) => {
        const merged: UnifiedMedia = {
          ...initialMedia,
          ...full,
          type: full.type,
        };
        setMedia(merged);
      })
      .catch(() => {
        // Keep partial media when offline
      })
      .finally(() => setLoadingDetails(false));
  }, [id, resolvedType]);

  useEffect(() => {
    if (!id || isReadingMedia || loadingDetails || !media.id) return;
    let cancelled = false;
    const sourceMeta = availableSources.find((s) => s.id === selectedSourceId);
    const usingExtensionEntry = shouldUseExtensionEpisodesForSelection({
      sourceId: selectedSourceId,
      isReadingMedia,
      selectedSourceEntry: activeMatchedSourceEntry,
    });
    setResolvingEpisodes(true);
    setEpisodesError(null);
    resolveEpisodesForMedia(media, {
      sourceId: selectedSourceId,
      sourceName: sourceMeta?.name,
      sourceBaseUrl: sourceMeta?.baseUrl,
      sourceLang: sourceMeta?.lang,
      sourcePkg: sourceMeta?.pkg,
      selectedSourceEntry: activeMatchedSourceEntry,
      overrideTitle: matchedTitleOverride.trim() || undefined,
      overrideMedia: selectedSourceId === 'shonenx-hls-inbuilt' ? matchedOverrideMedia : null,
      bypassCache: episodeRefreshNonce > 0,
    })
      .then((eps) => {
        if (cancelled) return;
        setEpisodes(eps);
        setEpisodesError(null);
        setSelectedRangeId('all');
        if (typeof navMediaState?.episodeNumber === 'number') {
          const idx = eps.findIndex((e) => e.number === navMediaState.episodeNumber);
          if (idx >= 0) {
            setHasPickedInlineEpisode(true);
            setInlineEpisodeIndex(idx);
          }
        }
      })
      .catch((err) => {
        if (cancelled) return;
        if (usingExtensionEntry) {
          setEpisodes([]);
          setEpisodesError(
            err instanceof Error
              ? err.message
              : 'Unable to load episodes for this selected source entry.',
          );
        }
        // Keep previously loaded episodes on inbuilt transient failure
      })
      .finally(() => {
        if (!cancelled) setResolvingEpisodes(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    id,
    isReadingMedia,
    loadingDetails,
    media.id,
    media.idMal,
    media.episodes,
    media.streamingEpisodes?.length,
    selectedSourceId,
    matchedTitleOverride,
    matchedOverrideMedia?.id,
    activeMatchedSourceEntry?.sourceId,
    activeMatchedSourceEntry?.href,
    activeMatchedSourceEntry?.slug,
    episodeRefreshNonce,
  ]);

  useEffect(() => {
    if (!id || !isMangaOnly || loadingDetails || !media.id) {
      return;
    }
    let cancelled = false;
    setResolvingChapters(true);
    setChaptersError(null);
    const sourceMeta = availableSources.find((s) => s.id === selectedSourceId);
    resolveMangaChaptersAsync({
      media,
      sourceId: selectedSourceId,
      sourceName: sourceMeta?.name,
      sourceBaseUrl: sourceMeta?.baseUrl,
      sourceLang: sourceMeta?.lang,
      overrideTitle: matchedTitleOverride.trim() || undefined,
      bypassCache: episodeRefreshNonce > 0,
    })
      .then((res) => {
        if (cancelled) return;
        setChapters(res.chapters);
        setSelectedRangeId('all');
      })
      .catch((err) => {
        if (cancelled) return;
        setChapters([]);
        setChaptersError(
          err instanceof Error ? err.message : 'Unable to fetch chapters from this source.',
        );
      })
      .finally(() => {
        if (!cancelled) setResolvingChapters(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    id,
    isMangaOnly,
    loadingDetails,
    media.id,
    media.title?.english,
    media.title?.romaji,
    selectedSourceId,
    matchedTitleOverride,
    episodeRefreshNonce,
  ]);

  // Clear incompatible source-match overrides when switching sources or opening another media entry
  useEffect(() => {
    if (prevSelectedSourceRef.current !== selectedSourceId) {
      prevSelectedSourceRef.current = selectedSourceId;
      setMatchedSourceEntry(null);
      setMatchedOverrideMedia(null);
      setMatchedTitleOverride('');
      setEpisodesError(null);
      setWrongTitleResults([]);
      setWrongTitleSourceResults([]);
      setWrongTitleSearchError(null);
    }
  }, [selectedSourceId]);

  useEffect(() => {
    setMatchedSourceEntry(null);
    setMatchedOverrideMedia(null);
    setMatchedTitleOverride('');
    setEpisodesError(null);
    setWrongTitleResults([]);
    setWrongTitleSourceResults([]);
    setWrongTitleSearchError(null);
  }, [id, resolvedType]);

  // Live title search inside "Wrong Title?" modal
  const activeSource =
    availableSources.find((s) => s.id === selectedSourceId) ?? availableSources[0];
  const useExtensionWrongTitleSearch = shouldUseExtensionWrongTitleSearch({
    sourceId: selectedSourceId,
    isReadingMedia,
  });

  useEffect(() => {
    if (!wrongTitleOpen) return;
    const query = wrongTitleDraft.trim();
    if (!query) {
      setWrongTitleResults([]);
      setWrongTitleSourceResults([]);
      setWrongTitleSearching(false);
      setWrongTitleSearchError(null);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    setWrongTitleSearching(true);
    setWrongTitleSearchError(null);

    const timer = window.setTimeout(async () => {
      try {
        if (useExtensionWrongTitleSearch && activeSource) {
          setWrongTitleResults([]);
          const extSearch = await searchExtensionTitlesAsync({
            source: activeSource,
            query,
            signal: controller.signal,
          });
          if (!cancelled) {
            if (!extSearch.compatible) {
              setWrongTitleSourceResults([]);
              setWrongTitleSearchError(
                extSearch.reason ||
                  `${activeSource.name} cannot be searched by this web adapter.`,
              );
            } else {
              setWrongTitleSourceResults(extSearch.items);
              setWrongTitleSearchError(null);
            }
          }
          return;
        }

        setWrongTitleSourceResults([]);
        const targetSearchType: MediaType = isMangaOnly ? 'MANGA' : 'ANIME';
        let items: UnifiedMedia[] = [];
        try {
          const al = await searchAniList({
            query,
            type: targetSearchType,
            page: 1,
            perPage: 12,
          });
          items = al.items;
        } catch {
          const jk = await searchJikan(query, targetSearchType, 1);
          items = jk.items.slice(0, 12);
        }
        if (!cancelled) {
          setWrongTitleResults(items);
        }
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setWrongTitleResults([]);
          setWrongTitleSourceResults([]);
          setWrongTitleSearchError(
            err instanceof Error ? err.message : 'Unable to search titles right now.',
          );
        }
      } finally {
        if (!cancelled) setWrongTitleSearching(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    wrongTitleOpen,
    wrongTitleDraft,
    isMangaOnly,
    useExtensionWrongTitleSearch,
    activeSource?.id,
    activeSource?.name,
    activeSource?.baseUrl,
  ]);

  useEffect(() => {
    if (!sourcePickerOpen && !wrongTitleOpen && !trailerOpen && !audioPickerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (wrongTitleOpen) setWrongTitleOpen(false);
      else if (sourcePickerOpen) setSourcePickerOpen(false);
      else if (audioPickerOpen) setAudioPickerOpen(false);
      else if (trailerOpen) setTrailerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sourcePickerOpen, wrongTitleOpen, audioPickerOpen, trailerOpen]);

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  useDocumentTitle(
    loadingDetails && (!title || title === 'Unknown')
      ? 'ShizuTv — Loading...'
      : formatMediaDocumentTitle({ mediaTitle: title }),
  );
  const effectiveSourceTitle =
    activeMatchedSourceEntry?.title || matchedTitleOverride.trim() || title;
  const selectableAudioOptions = useMemo(
    () => buildSelectableAudioOptions(resolvedWatchStream?.availableAudios, activeSource?.lang),
    [resolvedWatchStream?.availableAudios, activeSource?.lang],
  );
  const activeAudioOption = resolveAudioLanguageOption(
    state.playerPrefs.audioLanguage,
    selectableAudioOptions,
  );

  useEffect(() => {
    if (isReadingMedia) return;
    if (!resolvedWatchStream || resolvedWatchStream.sourceId !== selectedSourceId) return;
    if (!Array.isArray(resolvedWatchStream.availableAudios) || resolvedWatchStream.availableAudios.length === 0) {
      return;
    }
    const isSupported = selectableAudioOptions.some(
      (opt) => opt.code === state.playerPrefs.audioLanguage,
    );
    if (!isSupported && selectableAudioOptions[0]) {
      updatePlayerPrefs({ audioLanguage: selectableAudioOptions[0].code });
    }
  }, [
    isReadingMedia,
    resolvedWatchStream,
    selectedSourceId,
    selectableAudioOptions,
    state.playerPrefs.audioLanguage,
    updatePlayerPrefs,
  ]);
  const filteredSourcePickerList = useMemo(() => {
    const matched = filterAvailableSources(availableSources, sourcePickerQuery);
    return sortSourcesByLiveStatus({
      sources: matched,
      diagnosticsBySourceId: sourceDiagnosticsMap,
      mediaType: media.type,
      onlyLikelyWorking: sourcePickerWorkingOnly,
    });
  }, [availableSources, sourcePickerQuery, sourceDiagnosticsMap, media.type, sourcePickerWorkingOnly]);

  const likelyWorkingPickerCount = useMemo(
    () =>
      sortSourcesByLiveStatus({
        sources: availableSources,
        diagnosticsBySourceId: sourceDiagnosticsMap,
        mediaType: media.type,
        onlyLikelyWorking: true,
      }).length,
    [availableSources, sourceDiagnosticsMap, media.type],
  );

  const probeSinglePickerSource = async (src: (typeof availableSources)[number]) => {
    if (probingSourceIds[src.id]) return;
    const probeMedia = isMangaOnly ? 'MANGA' : 'ANIME';
    const probeTitle =
      matchedTitleOverride.trim() ||
      getPreferredTitle(media.title, state.contentPrefs.titlePreference) ||
      'Naruto';
    setProbingSourceIds((prev) => ({ ...prev, [src.id]: true }));
    const startedAt = performance.now();
    try {
      const report = await diagnoseExtensionAsync({
        source: src,
        mediaType: probeMedia,
        mode: 'full',
        query: probeTitle,
      });
      const enriched: ExtensionDiagnosticReport = {
        ...report,
        mode: report.mode || 'full',
        testedAt: report.testedAt || new Date().toISOString(),
      };
      setSourceDiagnosticsMap(savePersistedExtensionDiagnostic(enriched));
    } catch (err) {
      const isConnectivityOutage =
        err instanceof BackendConnectionError ||
        err instanceof BackendNotConfiguredError ||
        err instanceof NonJsonResponseError;
      if (!isConnectivityOutage) {
        const msg = err instanceof Error ? err.message : 'Diagnostic check failed.';
        const failureKind = classifyDiagnosticFailure(msg);
        const keepUntested =
          failureKind === 'blocked_request' ||
          failureKind === 'timeout' ||
          failureKind === 'network_error';
        const failReport: ExtensionDiagnosticReport = {
          sourceId: src.id,
          sourceName: src.name,
          status: 'fail',
          durationMs: Math.round(performance.now() - startedAt),
          testedAt: new Date().toISOString(),
          mode: 'full',
          probeScope: probeMedia === 'ANIME' ? DEFAULT_DIAGNOSTIC_PROBE_SCOPE : undefined,
          failureKind,
          summary: msg,
          detail: msg,
          capabilities: {
            metadataSearch: 'unavailable',
            episodeOrChapterListing: keepUntested ? 'untested' : 'unavailable',
            audioLanguage: probeMedia === 'ANIME' ? 'untested' : 'unsupported',
            playbackOrReader: keepUntested ? 'untested' : 'unavailable',
            overallCompatibility: 'incompatible',
          },
        };
        setSourceDiagnosticsMap(savePersistedExtensionDiagnostic(failReport));
      }
    } finally {
      setProbingSourceIds((prev) => {
        const next = { ...prev };
        delete next[src.id];
        return next;
      });
    }
  };

  const probeUntestedPickerSources = async () => {
    if (batchProbingSources) return;
    const candidates = filteredSourcePickerList
      .filter((src) => {
        const live = resolveSourceLiveStatusBadge({
          source: src,
          report: sourceDiagnosticsMap[src.id],
          mediaType: media.type,
        });
        return live.kind !== 'unsupported' && live.kind !== 'android-native' && live.kind !== 'working';
      })
      .slice(0, 6);
    if (candidates.length === 0) return;
    setBatchProbingSources(true);
    try {
      for (const src of candidates) {
        await probeSinglePickerSource(src);
      }
    } finally {
      setBatchProbingSources(false);
    }
  };
  const isResolvingItems = isMangaOnly ? resolvingChapters : resolvingEpisodes;
  const sourceAvailabilityLabel = formatSourceAvailabilityLabel({
    mediaType: media.type,
    resolving: isResolvingItems,
    resolvedCount: isMangaOnly ? chapters.length : episodes.length,
    expectedCount: isReadingMedia
      ? media.chapters
      : activeMatchedSourceEntry || episodesError
        ? null
        : matchedOverrideMedia?.episodes ?? media.episodes,
    status: matchedOverrideMedia?.status ?? media.status,
    hasOverride: Boolean(matchedTitleOverride.trim() || activeMatchedSourceEntry),
  });
  const comments = state.comments[media.id] || [];
  const totalCount = isMangaOnly
    ? chapters.length || media.chapters || 0
    : episodes.length || media.episodes || 0;
  const currentProgress = libEntry?.progress ?? 0;
  const progressPercent =
    totalCount > 0 ? Math.min(100, Math.round((currentProgress / totalCount) * 100)) : 0;

  const historyEntry = useMemo(
    () => state.history.find((h) => h.mediaId === media.id),
    [state.history, media.id],
  );

  const downloadTaskByNumber = useMemo(() => {
    const map = new Map<number, DownloadTask>();
    for (const d of state.downloads) {
      if (d.mediaId === media.id) {
        map.set(d.itemNumber, d);
      }
    }
    return map;
  }, [state.downloads, media.id]);

  const downloadedNumbers = useMemo(() => {
    const set = new Set<number>();
    for (const d of state.downloads) {
      if (d.mediaId === media.id && d.status === 'completed') {
        set.add(d.itemNumber);
      }
    }
    return set;
  }, [state.downloads, media.id]);

  const downloadedAnyCount = useMemo(
    () => state.downloads.filter((d) => d.mediaId === media.id).length,
    [state.downloads, media.id],
  );

  const watchedSet = useMemo(() => {
    const scopeKey = buildMediaScopeKey(media.id, media.type);
    return new Set<number>(state.watchedItems[scopeKey] || []);
  }, [state.watchedItems, media.id, media.type]);

  const bookmarkedSet = useMemo(() => {
    const set = new Set<number>();
    for (const b of state.bookmarkedItems) {
      if (b.mediaId === media.id && b.mediaType === media.type) {
        set.add(b.itemNumber);
      }
    }
    return set;
  }, [state.bookmarkedItems, media.id, media.type]);

  const mediaBookmarkedCount = bookmarkedSet.size;

  const { seasons, otherRelations } = useMemo(
    () => partitionMediaRelations(media.relations),
    [media.relations],
  );

  const rawItemsCount = isMangaOnly ? chapters.length : episodes.length;
  const rangeChunkSize = rawItemsCount > 300 ? 50 : rawItemsCount > 100 ? 25 : 12;
  const episodeRanges = useMemo(
    () => buildEpisodeRanges(rawItemsCount, rangeChunkSize),
    [rawItemsCount, rangeChunkSize],
  );
  const activeRange: EpisodeRange | null =
    episodeRanges.find((r) => r.id === selectedRangeId) ?? null;

  const filteredEpisodes = useMemo(() => {
    const ranged = filterByEpisodeRange(episodes, activeRange);
    const ordered = epOrderAsc ? ranged : [...ranged].reverse();
    return ordered.filter((ep) => {
      if (itemFilterMode === 'downloaded' && !downloadedNumbers.has(ep.number)) return false;
      if (itemFilterMode === 'bookmarked' && !bookmarkedSet.has(ep.number)) return false;
      if (!epFilter.trim()) return true;
      const q = epFilter.toLowerCase();
      return ep.title.toLowerCase().includes(q) || String(ep.number).includes(q);
    });
  }, [episodes, activeRange, epOrderAsc, itemFilterMode, downloadedNumbers, bookmarkedSet, epFilter]);

  const filteredChapters = useMemo(() => {
    const ranged = filterByEpisodeRange(chapters, activeRange);
    const ordered = epOrderAsc ? ranged : [...ranged].reverse();
    return ordered.filter((ch) => {
      if (itemFilterMode === 'downloaded' && !downloadedNumbers.has(ch.number)) return false;
      if (itemFilterMode === 'bookmarked' && !bookmarkedSet.has(ch.number)) return false;
      if (!epFilter.trim()) return true;
      const q = epFilter.toLowerCase();
      return ch.title.toLowerCase().includes(q) || String(ch.number).includes(q);
    });
  }, [chapters, activeRange, epOrderAsc, itemFilterMode, downloadedNumbers, bookmarkedSet, epFilter]);

  const resumeIndex = useMemo(() => {
    if (isMangaOnly) {
      if (chapters.length === 0) return 0;
      const targetNum = historyEntry?.chapterNumber ?? (currentProgress > 0 ? currentProgress + 1 : 1);
      const foundIdx = chapters.findIndex((c) => c.number === targetNum);
      return foundIdx >= 0 ? foundIdx : 0;
    }
    if (episodes.length === 0) return 0;
    const targetNum = historyEntry?.episodeNumber ?? (currentProgress > 0 ? currentProgress + 1 : 1);
    const foundIdx = episodes.findIndex((e) => e.number === targetNum);
    return foundIdx >= 0 ? foundIdx : 0;
  }, [isMangaOnly, chapters, episodes, historyEntry, currentProgress]);

  const resumeItem = isMangaOnly ? chapters[resumeIndex] : episodes[resumeIndex];
  const hasStarted = Boolean(historyEntry) || currentProgress > 0;
  const activeInlineEpisodeIndex = hasPickedInlineEpisode ? inlineEpisodeIndex : resumeIndex;
  const activeInlineEpisode = episodes[activeInlineEpisodeIndex] ?? resumeItem;

  const triggerBrowserFileDownload = (blob: Blob, filename: string) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleDownloadItem = (item: { id: string; number: number; title: string }) => {
    const existing = downloadTaskByNumber.get(item.number);
    if (existing && existing.status !== 'completed') {
      toggleDownloadPause(existing.id);
      return;
    }

    const quality = isMangaOnly ? 'Chapter' : state.playerPrefs.defaultQuality;
    const taskId = enqueueDownload(media, item.number, item.title, quality);
    const safeTitle = (media.title.english || media.title.romaji || 'Media')
      .replace(/[^a-z0-9\-_]+/gi, '_')
      .slice(0, 40);

    if (isMangaOnly) {
      const ch = chapters.find((c) => c.number === item.number) ?? {
        id: item.id,
        number: item.number,
        title: item.title,
      };
      setRealDownloadActive(taskId, true);
      updateDownloadTask(taskId, { progress: 0.25, status: 'downloading' });
      void (async () => {
        let pages: string[] = [];
        try {
          const res = await resolveMangaChapterPagesAsync({
            media,
            chapter: ch,
            sourceId: selectedSourceId,
            sourceName: activeSource?.name,
            sourceBaseUrl: activeSource?.baseUrl,
            sourceLang: activeSource?.lang,
            overrideTitle: matchedTitleOverride.trim() || undefined,
          });
          pages = res.pages;
        } catch {
          pages = resolveChapterPages(media, ch);
        }
        updateDownloadTask(taskId, { progress: 0.72, status: 'downloading' });
        const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle} - Chapter ${ch.number}</title><style>body{margin:0;background:#111;color:#fff;font-family:sans-serif;text-align:center}img{max-width:860px;width:100%;display:block;margin:8px auto}</style></head><body><h2>${safeTitle} · Chapter ${ch.number}: ${ch.title}</h2>${pages.map((p, i) => `<img src="${p}" alt="Page ${i + 1}" />`).join('')}</body></html>`;
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        updateDownloadTask(taskId, {
          progress: 1,
          downloadedBytes: blob.size,
          totalBytes: blob.size,
          status: 'completed',
        });
        setRealDownloadActive(taskId, false);
        triggerBrowserFileDownload(blob, `${safeTitle}_Ch${ch.number}.html`);
      })();
      return;
    }

    const ep = episodes.find((e) => e.id === item.id || e.number === item.number) ?? {
      id: item.id,
      number: item.number,
      title: item.title,
    };
    const servers = resolveVideoServers(selectedSourceId, activeSource?.name);
    const firstServer = resolvePreferredVideoServer({
      servers,
      preferredServerId: state.playerPrefs.preferredServerBySource?.[selectedSourceId],
      desiredAudioCategory: activeAudioOption.serverCategory,
    });
    if (!firstServer) return;

    void (async () => {
      try {
        const stream = await resolveVideoStreamAsync({
          media,
          episode: ep,
          server: firstServer,
          sourceId: selectedSourceId,
          sourceName: activeSource?.name,
          sourceBaseUrl: activeSource?.baseUrl,
          sourceLang: activeSource?.lang,
          audioLanguage: state.playerPrefs.audioLanguage,
          overrideTitle: matchedTitleOverride.trim() || undefined,
          selectedSourceEntry: activeMatchedSourceEntry,
        });

        const isDirectVideo =
          !stream.isHls && !/\.m3u8(\?|$)/i.test(stream.url);
        if (!isDirectVideo) return;

        const resp = await fetch(stream.url);
        if (!resp.ok || !resp.body) return;
        setRealDownloadActive(taskId, true);
        const totalHeader = Number(resp.headers.get('content-length') || 0);
        const estimatedTotal = totalHeader > 0 ? totalHeader : 24 * 1024 * 1024;
        const reader = resp.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.byteLength;
            const ratio = Math.min(0.98, Math.max(0.08, received / estimatedTotal));
            updateDownloadTask(taskId, {
              progress: ratio,
              downloadedBytes: received,
              totalBytes: Math.max(estimatedTotal, received),
              status: 'downloading',
            });
          }
        }

        const blob = new Blob(chunks as BlobPart[], { type: 'video/mp4' });
        updateDownloadTask(taskId, {
          progress: 1,
          downloadedBytes: blob.size,
          totalBytes: blob.size,
          status: 'completed',
        });
        setRealDownloadActive(taskId, false);
        triggerBrowserFileDownload(blob, `${safeTitle}_EP${ep.number}.mp4`);
      } catch {
        // Fallback to background worker progress completion if stream is HLS or cross-origin blocked
        setRealDownloadActive(taskId, false);
      }
    })();
  };

  const handleLaunchMedia = (indexOverride?: number) => {
    if (isMangaOnly && chapters.length > 0) {
      const idx = typeof indexOverride === 'number' ? indexOverride : resumeIndex;
      navigate('/reader', {
        state: {
          media,
          chapters,
          chapterIndex: idx,
          sourceId: selectedSourceId,
          sourceName: activeSource?.name,
          sourceBaseUrl: activeSource?.baseUrl,
          sourceLang: activeSource?.lang,
          overrideTitle: matchedTitleOverride.trim() || undefined,
        },
      });
      return;
    }
    if (!isReadingMedia && episodes.length > 0) {
      const idx =
        typeof indexOverride === 'number' ? indexOverride : activeInlineEpisodeIndex;
      setHasPickedInlineEpisode(true);
      setInlineEpisodeIndex(idx);
      setInlinePlaySignal((s) => s + 1);
      switchTab('watch');
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }
    switchTab('watch');
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToast(true);
      setTimeout(() => setCopiedToast(false), 2000);
    } catch {
      // Ignore clipboard failures
    }
  };

  const handleSaveTracker = async () => {
    await upsertLibraryEntry(media, editStatus, editProgress, editScore, editNotes);
    setTrackerOpen(false);
  };

  const handleQuickProgress = async (delta: number) => {
    const nextProgress = Math.max(
      0,
      totalCount > 0 ? Math.min(totalCount, currentProgress + delta) : currentProgress + delta,
    );
    const nextStatus: TrackedStatus =
      totalCount > 0 && nextProgress >= totalCount
        ? 'COMPLETED'
        : libEntry?.status || 'CURRENT';
    await upsertLibraryEntry(
      media,
      nextStatus,
      nextProgress,
      libEntry?.score ?? 0,
      libEntry?.notes ?? '',
    );
  };

  const cleanDescription = useMemo(
    () => stripHtmlTags(media.description) || 'No description available.',
    [media.description],
  );
  const trailerEmbed = useMemo(() => toYouTubeEmbedUrl(media.trailer), [media.trailer]);
  const nextAiringInfo = useMemo(
    () => formatNextAiringInfo(media.nextEpisode, media.airingAt, nowMs),
    [media.nextEpisode, media.airingAt, nowMs],
  );

  const frostedCardClass =
    'rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/28 dark:bg-[var(--sx-surface-container)]/32 backdrop-blur-lg backdrop-saturate-150 border border-white/45 dark:border-white/12 shadow-[0_8px_32px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-white/25 dark:ring-white/5';
  const frostedPillBtnClass =
    'bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-lg backdrop-saturate-150 border border-white/45 dark:border-white/12 text-[var(--sx-on-surface)] shadow-lg ring-1 ring-inset ring-white/25 dark:ring-white/5 hover:border-[var(--sx-primary)]/50 transition-all';

  return (
    <div
      data-testid="details-page"
      data-restoring-scroll={isRestoringScroll ? 'true' : 'false'}
      className="relative min-h-screen text-[var(--sx-on-surface)] overflow-x-clip"
    >
      {/* Full-bleed Ambient Blurred Poster Backdrop */}
      <div
        data-testid="details-background-container"
        className={`pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-[var(--sx-surface)] ${
          batterySaver ? '' : 'will-change-[transform,filter]'
        }`}
      >
        {(media.cover || media.banner) && (
          <img
            key={media.cover || media.banner}
            src={media.cover || media.banner || ''}
            alt=""
            aria-hidden="true"
            className={`w-full h-full object-cover ${
              batterySaver
                ? 'blur-md opacity-25 dark:opacity-20'
                : 'sx-details-backdrop-enter scale-125 blur-3xl opacity-60 dark:opacity-45 saturate-150'
            }`}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-[var(--sx-surface)]/18 via-[var(--sx-surface)]/36 to-[var(--sx-surface)]/68 dark:from-[var(--sx-surface)]/28 dark:via-[var(--sx-surface)]/48 dark:to-[var(--sx-surface)]/80" />
      </div>

      {/* Main Content Container */}
      <div
        key={`details-stage-${id}`}
        className={`${detailsTransitionClass} max-w-5xl mx-auto px-4 sm:px-6 pt-4 ${
          activeTab === 'watch' && (episodes.length > 0 || chapters.length > 0)
            ? 'pb-48'
            : 'pb-32'
        }`}
      >
        {/* Top Floating Controls */}
        <header className="relative z-20 flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('nav-pop');
                suppressNextRouteHaptic();
                navigate(-1);
              }}
              aria-label="Go back"
              className={`w-10 h-10 rounded-full flex items-center justify-center ${frostedPillBtnClass}`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('nav-pop');
                suppressNextRouteHaptic();
                navigate('/home');
              }}
              aria-label="Go home"
              className={`w-10 h-10 rounded-full flex items-center justify-center ${frostedPillBtnClass}`}
            >
              <Home className="w-4 h-4" />
            </button>
          </div>

          <div
            className={`inline-flex items-center gap-1 p-1 rounded-full ${frostedPillBtnClass}`}
          >
            <button
              type="button"
              onClick={handleShare}
              title="Copy Share Link"
              aria-label="Share"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--sx-surface-high)]/80 transition-colors"
            >
              {copiedToast ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('nav-pop');
                suppressNextRouteHaptic();
                navigate('/home');
              }}
              title="Close details"
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[var(--sx-surface-high)]/80 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Hero Lockup (or Inline Player when Watch tab is open for Anime) */}
        <div ref={heroRef}>
          {activeTab === 'watch' && !isReadingMedia ? (
            <InlineAnimePlayer
              media={
                selectedSourceId === 'shonenx-hls-inbuilt'
                  ? (matchedOverrideMedia ?? media)
                  : media
              }
              episodes={episodes}
              episodeIndex={activeInlineEpisodeIndex}
              sourceId={selectedSourceId}
              sourceName={activeSource?.name}
              sourceBaseUrl={activeSource?.baseUrl}
              sourceLang={activeSource?.lang}
              availableSources={availableSources}
              overrideTitle={
                matchedTitleOverride.trim() || activeMatchedSourceEntry?.title || undefined
              }
              selectedSourceEntry={activeMatchedSourceEntry}
              episodesLoading={resolvingEpisodes}
              episodesError={episodesError}
              playSignal={inlinePlaySignal}
              initialTime={navMediaState?.startTime ?? null}
              initialResumePlaying={Boolean(navMediaState?.resumePlaying)}
              initialSubLang={resolvePersistedSubtitleLang(
                navMediaState?.activeSubLang,
                state.playerPrefs.subtitleLanguage,
              )}
              initialEditedCuesMap={navMediaState?.editedCuesMap}
              onStreamResolved={setResolvedWatchStream}
              onOpenSourcePicker={() => {
                setSourcePickerQuery('');
                setSourcePickerOpen(true);
              }}
              onChangeEpisodeIndex={(nextIdx) => {
                setHasPickedInlineEpisode(true);
                setInlineEpisodeIndex(nextIdx);
              }}
            />
          ) : loadingDetails && !initialMedia && !media.cover ? (
            <DetailsHeroSkeleton roundness={state.themePrefs.uiRoundness} />
          ) : (
            <section className="sx-details-hero-enter space-y-4 mb-6">
              <div className="flex items-end sm:items-center gap-4 sm:gap-6">
                <div
                  style={{ borderRadius: `${state.themePrefs.uiRoundness}px` }}
                  className="sx-details-poster-hover w-28 sm:w-36 aspect-[2/3] overflow-hidden border border-[var(--sx-outline)] shadow-2xl shrink-0 bg-[var(--sx-surface-container)]"
                >
                  <SmartImage
                    src={media.cover}
                    alt={title}
                    fallbackTitle={title}
                    className="w-full h-full"
                  />
                </div>

                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="space-y-1">
                    <h1 className="text-xl sm:text-3xl font-black tracking-tight text-[var(--sx-on-surface)] line-clamp-2 leading-tight">
                      {title}
                    </h1>
                    {(media.title.native || media.title.romaji) &&
                      (media.title.native || media.title.romaji) !== title && (
                        <p className="text-xs sm:text-sm font-semibold text-[var(--sx-on-surface-muted)] truncate">
                          {media.title.romaji || media.title.native}
                        </p>
                      )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {media.studios && media.studios.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-lg backdrop-saturate-150 border border-white/40 dark:border-white/12 ring-1 ring-inset ring-white/20 dark:ring-white/5 text-[11px] font-bold uppercase tracking-wide">
                        <Building2 className="w-3 h-3 text-[var(--sx-on-surface-muted)]" />
                        <span>{media.studios[0]}</span>
                      </span>
                    )}
                    {media.status && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-lg backdrop-saturate-150 border border-white/40 dark:border-white/12 ring-1 ring-inset ring-white/20 dark:ring-white/5 text-[11px] font-bold uppercase tracking-wide">
                        {media.status === 'RELEASING' ? (
                          <Radio className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-[var(--sx-on-surface-muted)]" />
                        )}
                        <span>{media.status.replace(/_/g, ' ')}</span>
                      </span>
                    )}
                    {typeof media.score === 'number' && media.score > 0 && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-lg backdrop-saturate-150 border border-white/40 dark:border-white/12 ring-1 ring-inset ring-white/20 dark:ring-white/5 text-[11px] font-extrabold tabular-nums">
                        <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                        <span>{media.score.toFixed(1)}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Full-width Custom List CTA */}
              <button
                type="button"
                data-testid="details-custom-list-btn"
                onClick={() => setTrackerOpen(true)}
                className={`w-full py-3.5 px-5 flex items-center justify-center gap-2.5 font-extrabold text-xs tracking-wider uppercase ${frostedCardClass} hover:border-[var(--sx-primary)]/60 transition-all`}
              >
                {libEntry ? (
                  <BookmarkCheck className="w-4 h-4 text-[var(--sx-primary)]" />
                ) : (
                  <Bookmark className="w-4 h-4 text-[var(--sx-primary)]" />
                )}
                <span>
                  {libEntry
                    ? `${getStatusLabel(libEntry.status, media.type)} · ${libEntry.progress}${
                        totalCount > 0 ? ` / ${totalCount}` : ''
                      }`
                    : 'Custom List'}
                </span>
              </button>
            </section>
          )}
        </div>

        {/* ======================== TAB 1: INFO ======================== */}
        {activeTab === 'info' && (
          <div
            key="tab-info"
            data-testid="details-panel-info"
            className={`${tabTransitionClass} space-y-5`}
          >
            {/* Watching / Reading Progress Card */}
            <ScrollReveal index={0}>
              <section className={`${frostedCardClass} p-4 sm:p-5 space-y-3`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center">
                    {isReadingMedia ? (
                      <BookOpen className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                    ) : (
                      <Play className="w-3.5 h-3.5 text-[var(--sx-primary)] fill-current" />
                    )}
                  </span>
                  <h2 className="text-sm font-extrabold">
                    {isReadingMedia ? 'Reading Progress' : 'Watching Progress'}
                  </h2>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="Decrease progress"
                    onClick={() => handleQuickProgress(-1)}
                    disabled={currentProgress <= 0}
                    className="w-7 h-7 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] disabled:opacity-35 transition-colors"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setTrackerOpen(true)}
                    className="px-2.5 py-1 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-xs font-extrabold tabular-nums hover:text-[var(--sx-primary)] transition-colors"
                  >
                    {currentProgress} / {totalCount > 0 ? totalCount : '?'}
                  </button>
                  <button
                    type="button"
                    aria-label="Increase progress"
                    onClick={() => handleQuickProgress(1)}
                    disabled={totalCount > 0 && currentProgress >= totalCount}
                    className="w-7 h-7 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)] disabled:opacity-35 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="h-2 w-full rounded-full bg-[var(--sx-on-surface)]/10 overflow-hidden">
                <div
                  style={{ width: `${progressPercent}%` }}
                  className="h-full rounded-full bg-[var(--sx-primary)] transition-all duration-500 ease-out"
                />
              </div>
              </section>
            </ScrollReveal>

            {/* Next Episode Airing Countdown & Date/Time for Ongoing Anime */}
            {nextAiringInfo && (
              <ScrollReveal index={1}>
                <section
                  data-testid="next-airing-card"
                  className={`${frostedCardClass} p-4 sm:p-5 flex items-center justify-between gap-3`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-10 h-10 rounded-2xl bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center shrink-0">
                      <Timer className="w-5 h-5 text-[var(--sx-primary)]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                        Episode {nextAiringInfo.episode} Airing In
                      </p>
                      <p className="text-base sm:text-lg font-black tracking-tight tabular-nums text-[var(--sx-on-surface)]">
                        {nextAiringInfo.countdown}
                      </p>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[11px] font-bold text-[var(--sx-on-surface)] whitespace-nowrap tabular-nums">
                    {nextAiringInfo.dateTimeLabel}
                  </span>
                </section>
              </ScrollReveal>
            )}

            {/* Synopsis */}
            <ScrollReveal index={2}>
              <section className="space-y-2.5">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                Synopsis
              </h2>
              <div className={`${frostedCardClass} p-4 sm:p-5 space-y-2`}>
                {loadingDetails && !media.description ? (
                  <DetailsSynopsisSkeleton />
                ) : (
                  <>
                    <p
                      className={`text-xs sm:text-sm leading-relaxed text-[var(--sx-on-surface-muted)] whitespace-pre-line ${
                        synopsisExpanded ? '' : 'line-clamp-5'
                      }`}
                    >
                      {cleanDescription}
                    </p>
                    {cleanDescription.length > 260 && (
                      <button
                        type="button"
                        onClick={() => setSynopsisExpanded((v) => !v)}
                        className="text-xs font-extrabold text-[var(--sx-primary)] hover:underline"
                      >
                        {synopsisExpanded ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </>
                )}
              </div>
              </section>
            </ScrollReveal>

            {/* Details Metadata Grid */}
            <ScrollReveal index={3}>
              <section className="space-y-2.5">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                Details
              </h2>
              <div className={`${frostedCardClass} p-4 sm:p-5 space-y-4`}>
                {media.studios && media.studios.length > 0 && (
                  <div className="pb-3 border-b border-[var(--sx-outline)]">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                      Studios
                    </p>
                    <p className="text-sm sm:text-base font-extrabold mt-0.5">
                      {media.studios.join(' · ')}
                    </p>
                  </div>
                )}

                {loadingDetails &&
                !media.format &&
                !media.episodes &&
                !media.chapters &&
                !media.score ? (
                  <div
                    data-testid="details-metadata-skeleton"
                    aria-hidden="true"
                    className="grid grid-cols-2 sm:grid-cols-4 gap-3.5"
                  >
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="space-y-1.5">
                        <SkeletonBlock index={i} tone="soft" className="h-3 w-14 rounded" />
                        <SkeletonBlock index={i + 1} className="h-4 w-16 rounded" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        {isReadingMedia ? 'Chapters' : 'Episodes'}
                      </p>
                      <p className="text-sm font-extrabold tabular-nums mt-0.5">
                        {totalCount > 0 ? totalCount : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        {isReadingMedia ? 'Volumes' : 'Duration'}
                      </p>
                      <p className="text-sm font-extrabold tabular-nums mt-0.5">
                        {isReadingMedia
                          ? media.volumes || '—'
                          : media.duration
                            ? `${media.duration}m`
                            : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        {isReadingMedia ? 'Release' : 'Season'}
                      </p>
                      <p className="text-sm font-extrabold mt-0.5">
                        {media.season && media.year
                          ? `${media.season} ${media.year}`
                          : media.year || '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        Status
                      </p>
                      <p className="text-sm font-extrabold mt-0.5">
                        {media.status ? media.status.replace(/_/g, ' ') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        Format
                      </p>
                      <p className="text-sm font-extrabold mt-0.5">
                        {media.format || media.type}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        Source
                      </p>
                      <p className="text-sm font-extrabold mt-0.5">
                        {media.source ? media.source.replace(/_/g, ' ') : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        Score
                      </p>
                      <p className="text-sm font-extrabold tabular-nums mt-0.5">
                        {typeof media.score === 'number' && media.score > 0
                          ? `★ ${media.score.toFixed(1)}`
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                        Popularity
                      </p>
                      <p className="text-sm font-extrabold tabular-nums mt-0.5">
                        {formatCompactNumber(media.popularity)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              </section>
            </ScrollReveal>

            {/* Alternative Titles */}
            {(media.title.english ||
              media.title.romaji ||
              media.title.native ||
              (media.synonyms && media.synonyms.length > 0)) && (
              <ScrollReveal index={4}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Alternative Titles
                </h2>
                <div className={`${frostedCardClass} p-4 sm:p-5 space-y-2.5 text-xs`}>
                  {media.title.english && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="font-bold text-[var(--sx-on-surface-muted)]">English</span>
                      <span className="font-bold sm:text-right">{media.title.english}</span>
                    </div>
                  )}
                  {media.title.romaji && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="font-bold text-[var(--sx-on-surface-muted)]">Romaji</span>
                      <span className="font-bold sm:text-right">{media.title.romaji}</span>
                    </div>
                  )}
                  {media.title.native && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1">
                      <span className="font-bold text-[var(--sx-on-surface-muted)]">Native</span>
                      <span className="font-bold sm:text-right">{media.title.native}</span>
                    </div>
                  )}
                  {media.synonyms && media.synonyms.length > 0 && (
                    <div className="flex flex-col sm:flex-row sm:justify-between gap-1 pt-1 border-t border-[var(--sx-outline)]">
                      <span className="font-bold text-[var(--sx-on-surface-muted)]">Synonyms</span>
                      <span className="font-semibold sm:text-right text-[var(--sx-on-surface-muted)]">
                        {media.synonyms.slice(0, 4).join(' · ')}
                      </span>
                    </div>
                  )}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Genres */}
            {media.genres && media.genres.length > 0 && (
              <ScrollReveal index={5}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Genres
                </h2>
                <div className={`${frostedCardClass} p-4 flex flex-wrap gap-2`}>
                  {media.genres.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        navigate(`/discover?type=${media.type}&genres=${encodeURIComponent(g)}`)
                      }
                      className="px-3.5 py-1.5 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/10 border border-white/40 dark:border-white/15 text-xs font-bold hover:border-[var(--sx-primary)] hover:text-[var(--sx-primary)] transition-colors"
                    >
                      {g}
                    </button>
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Tags */}
            {media.tags && media.tags.length > 0 && (
              <ScrollReveal index={6}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Tags
                </h2>
                <div className={`${frostedCardClass} p-4 flex flex-wrap gap-2`}>
                  {media.tags.slice(0, 14).map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() =>
                        navigate(`/discover?type=${media.type}&tags=${encodeURIComponent(tag.name)}`)
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--sx-on-surface)]/6 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-semibold hover:border-[var(--sx-primary)] transition-colors"
                    >
                      <span>{tag.name}</span>
                      {typeof tag.rank === 'number' && (
                        <span className="text-[10px] font-extrabold text-[var(--sx-on-surface-muted)] tabular-nums">
                          {tag.rank}%
                        </span>
                      )}
                    </button>
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Seasons (PREQUEL / SEQUEL) */}
            {seasons.length > 0 && (
              <ScrollReveal index={7}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Seasons
                </h2>
                <div className="flex gap-3.5 overflow-x-auto no-scrollbar sx-carousel-scroll pb-1">
                  {seasons.map((seasonMedia, idx) => {
                    const seasonTitle = getPreferredTitle(
                      seasonMedia.title,
                      state.contentPrefs.titlePreference,
                    );
                    return (
                      <button
                        key={`season-${seasonMedia.id}-${idx}`}
                        type="button"
                        onClick={() =>
                          navigate(`/details/${seasonMedia.type.toLowerCase()}/${seasonMedia.id}`, {
                            state: { media: seasonMedia },
                          })
                        }
                        className="group relative w-36 sm:w-40 shrink-0 text-left space-y-2"
                      >
                        <div
                          style={{ borderRadius: `${state.themePrefs.uiRoundness}px` }}
                          className="relative aspect-[2/3] overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] shadow-lg"
                        >
                          <SmartImage
                            src={seasonMedia.cover}
                            alt={seasonTitle}
                            fallbackTitle={seasonTitle}
                            className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-transparent to-transparent" />
                          <span className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-white text-[10px] font-extrabold uppercase tracking-wider">
                            {seasonMedia.relationType?.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div className="px-1">
                          <p className="text-xs font-extrabold line-clamp-1 group-hover:text-[var(--sx-primary)] transition-colors">
                            {seasonTitle}
                          </p>
                          <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                            {seasonMedia.format || seasonMedia.type}
                            {seasonMedia.episodes ? ` · ${seasonMedia.episodes} eps` : ''}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Extras Card */}
            <ScrollReveal index={8}>
              <section className="space-y-2.5">
              <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                Extras
              </h2>
              <div className={`${frostedCardClass} divide-y divide-[var(--sx-outline)] overflow-hidden`}>
                {trailerEmbed && (
                  <button
                    type="button"
                    onClick={() => setTrailerOpen(true)}
                    className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--sx-on-surface)]/6 dark:hover:bg-white/5 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center">
                        <Film className="w-4 h-4 text-[var(--sx-primary)]" />
                      </span>
                      <div>
                        <p className="text-xs font-extrabold">Watch Official Trailer</p>
                        <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                          Embedded preview inside ShizuTv
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)]" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => switchTab('watch')}
                  className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--sx-on-surface)]/6 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center">
                      <Layers className="w-4 h-4 text-[var(--sx-primary)]" />
                    </span>
                    <div>
                      <p className="text-xs font-extrabold">
                        {isMangaOnly ? 'Chapter List & Sources' : 'Episode List & Sources'}
                      </p>
                      <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                        {`${rawItemsCount} available · Switch source or inspect ranges`}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)]" />
                </button>

                <button
                  type="button"
                  onClick={() => switchTab('comments')}
                  className="w-full px-4 py-3.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--sx-on-surface)]/6 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 flex items-center justify-center">
                      <MessageSquare className="w-4 h-4 text-[var(--sx-primary)]" />
                    </span>
                    <div>
                      <p className="text-xs font-extrabold">Community Discussion</p>
                      <p className="text-[11px] text-[var(--sx-on-surface-muted)]">
                        {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)]" />
                </button>

                {media.externalLinks && media.externalLinks.length > 0 && (
                  <div className="px-4 py-3.5 flex flex-wrap gap-2">
                    {media.externalLinks.slice(0, 6).map((link, idx) => (
                      <a
                        key={`${link.id}-${idx}`}
                        href={link.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--sx-on-surface)]/6 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-[11px] font-bold hover:border-[var(--sx-primary)] transition-colors"
                      >
                        <span>{link.site}</span>
                        <ExternalLink className="w-3 h-3 text-[var(--sx-on-surface-muted)]" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
              </section>
            </ScrollReveal>

            {/* Characters & Voice Actors */}
            {media.characters && media.characters.length > 0 && (
              <ScrollReveal index={9}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Characters &amp; Voice Actors
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar sx-carousel-scroll pb-1">
                  {media.characters.slice(0, 12).map((char, idx) => (
                    <div
                      key={`${char.id}-${idx}`}
                      className={`${frostedCardClass} w-72 sm:w-80 shrink-0 p-3 flex items-center justify-between gap-2.5`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <SmartImage
                          src={char.image}
                          alt={char.name}
                          fallbackTitle={char.name}
                          className="w-12 h-16 rounded-2xl shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-extrabold truncate">{char.name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)] mt-0.5">
                            {char.role || 'CHARACTER'}
                          </p>
                        </div>
                      </div>

                      {char.voiceActorName && (
                        <div className="flex items-center gap-2 min-w-0 flex-1 justify-end text-right">
                          <div className="min-w-0">
                            <p className="text-xs font-bold truncate">{char.voiceActorName}</p>
                            <p className="text-[10px] text-[var(--sx-on-surface-muted)] mt-0.5">
                              Japanese
                            </p>
                          </div>
                          <SmartImage
                            src={char.voiceActorImage}
                            alt={char.voiceActorName}
                            fallbackTitle={char.voiceActorName}
                            className="w-12 h-16 rounded-2xl shrink-0"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Relations */}
            {otherRelations.length > 0 && (
              <ScrollReveal index={10}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Relations
                </h2>
                <div className="flex gap-3.5 overflow-x-auto no-scrollbar sx-carousel-scroll pb-2">
                  {otherRelations.map((rel, idx) => (
                    <MediaCard
                      key={`rel-${rel.id}-${idx}`}
                      media={rel}
                      progressLabel={rel.relationType?.replace(/_/g, ' ') || undefined}
                      onClick={() =>
                        navigate(`/details/${rel.type.toLowerCase()}/${rel.id}`, {
                          state: { media: rel },
                        })
                      }
                    />
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Staff */}
            {media.staff && media.staff.length > 0 && (
              <ScrollReveal index={11}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Staff
                </h2>
                <div className="flex gap-3 overflow-x-auto no-scrollbar sx-carousel-scroll pb-1">
                  {media.staff.map((person, index) => (
                    <div
                      key={`${person.id}-${index}`}
                      className={`${frostedCardClass} w-52 shrink-0 p-3 flex items-center gap-3`}
                    >
                      <SmartImage
                        src={person.image}
                        alt={person.name}
                        fallbackTitle={person.name}
                        className="w-11 h-14 rounded-2xl shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold truncate">{person.name}</p>
                        <p className="text-[11px] text-[var(--sx-on-surface-muted)] line-clamp-2 mt-0.5">
                          {person.role || 'Staff'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}

            {/* Recommended Anime / Manga */}
            {media.recommendations && media.recommendations.length > 0 && (
              <ScrollReveal index={12}>
                <section className="space-y-2.5">
                <h2 className="text-sm sm:text-base font-extrabold tracking-tight px-1">
                  Recommended {isMangaOnly ? 'Manga' : 'Anime'}
                </h2>
                <div className="flex gap-3.5 overflow-x-auto no-scrollbar sx-carousel-scroll pb-2">
                  {media.recommendations.map((rec, idx) => (
                    <MediaCard
                      key={`rec-${rec.id}-${idx}`}
                      media={rec}
                      onClick={() =>
                        navigate(`/details/${rec.type.toLowerCase()}/${rec.id}`, {
                          state: { media: rec },
                        })
                      }
                    />
                  ))}
                </div>
                </section>
              </ScrollReveal>
            )}
          </div>
        )}

        {/* ======================== TAB 2: WATCH / READ ======================== */}
        {activeTab === 'watch' && (
          <div
            key="tab-watch"
            data-testid="details-panel-watch"
            className={`${tabTransitionClass} space-y-4`}
          >
            {/* Audio Language Selector Card (Compact, Directly Above Anime Source) */}
            {!isReadingMedia && (
              <section
                data-testid="details-audio-language-card"
                className={`${frostedCardClass} px-3 py-2 space-y-2`}
              >
                <button
                  type="button"
                  data-testid="details-audio-language-btn"
                  aria-expanded={audioPickerOpen}
                  aria-haspopup="listbox"
                  onClick={() => setAudioPickerOpen((prev) => !prev)}
                  className="w-full flex items-center justify-between gap-2 text-left group"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-7 h-7 rounded-xl shrink-0 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border border-white/35 dark:border-white/12 flex items-center justify-center">
                      <Languages className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                    </div>
                    <div className="min-w-0 flex-1 flex items-center gap-2">
                      <span className="text-xs font-extrabold whitespace-nowrap">Audio</span>
                      <span
                        data-testid="details-audio-active-badge"
                        className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 text-[var(--sx-primary)] text-[10px] font-black uppercase tracking-wider truncate"
                      >
                        {activeAudioOption.shortLabel} · {activeAudioOption.label}
                      </span>
                    </div>
                  </div>

                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-[11px] font-bold group-hover:border-[var(--sx-primary)] transition-colors">
                    <span>Change</span>
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${
                        audioPickerOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </span>
                </button>

                {audioPickerOpen && (
                  <div
                    role="listbox"
                    aria-label="Audio Language"
                    data-testid="details-audio-language-menu"
                    className="pt-2 border-t border-[var(--sx-outline)] grid grid-cols-1 sm:grid-cols-2 gap-1.5"
                  >
                    {selectableAudioOptions.map((opt) => {
                      const isSelected = opt.code === activeAudioOption.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          data-testid={`details-audio-option-${opt.code}`}
                          onClick={() => {
                            updatePlayerPrefs({ audioLanguage: opt.code });
                            setResolvedWatchStream(null);
                            setAudioPickerOpen(false);
                          }}
                          className={`w-full px-2.5 py-2 rounded-xl border flex items-center justify-between gap-2 text-left transition-all ${
                            isSelected
                              ? 'bg-[var(--sx-primary)]/12 border-[var(--sx-primary)] text-[var(--sx-on-surface)] shadow-sm'
                              : 'bg-[var(--sx-on-surface)]/5 dark:bg-white/5 border-white/25 dark:border-white/10 hover:border-[var(--sx-primary)]/60'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className={`px-1.5 py-0.5 rounded-md text-[10px] font-black font-mono-tabular uppercase shrink-0 ${
                                isSelected
                                  ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                                  : 'bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-[var(--sx-on-surface-muted)]'
                              }`}
                            >
                              {opt.shortLabel}
                            </span>
                            <span className="text-xs font-extrabold truncate">{opt.label}</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {opt.confirmed && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[9.5px] font-extrabold uppercase">
                                Available
                              </span>
                            )}
                            {isSelected && <Check className="w-3.5 h-3.5 text-[var(--sx-primary)]" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* Source / Extension Selector Card */}
            <section className={`${frostedCardClass} p-3.5 sm:p-4 space-y-3`}>
              {/* Top Row: Active Extension Card + Quick Settings / Diagnose / Picker Trigger */}
              <div className="flex items-center justify-between gap-2.5">
                <button
                  type="button"
                  data-testid="details-source-select"
                  onClick={() => {
                    setSourcePickerQuery('');
                    setSourcePickerOpen(true);
                  }}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left group"
                >
                  <div className="relative w-11 h-11 rounded-2xl shrink-0 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border border-white/35 dark:border-white/12 flex items-center justify-center overflow-visible">
                    {activeSource?.iconUrl ? (
                      <img
                        src={activeSource.iconUrl}
                        alt={activeSource.name}
                        className="w-full h-full object-cover rounded-2xl"
                      />
                    ) : (
                      <span className="text-sm font-black text-[var(--sx-primary)]">
                        {(activeSource?.name || 'S').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <span className="w-4 h-4 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] absolute -bottom-1 -right-1 flex items-center justify-center shadow-sm">
                      {isReadingMedia ? (
                        <BookOpen className="w-2.5 h-2.5" />
                      ) : (
                        <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                      )}
                    </span>
                  </div>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-xs sm:text-sm font-extrabold truncate group-hover:text-[var(--sx-primary)] transition-colors">
                      {activeSource?.name || 'ShizuTv Core'}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 text-[var(--sx-primary)] text-[10px] font-extrabold">
                        {getSourceManagerBadge(activeSource)}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[10px] font-extrabold uppercase">
                        {activeSource?.lang || 'EN'}
                      </span>
                      {activeSource && (
                        <SourceLiveStatusChip
                          badge={resolveSourceLiveStatusBadge({
                            source: activeSource,
                            report: sourceDiagnosticsMap[activeSource.id],
                            mediaType: media.type,
                          })}
                          isInbuilt={activeSource.type === 'inbuilt'}
                          testId="active-source-live-status"
                        />
                      )}
                      {activeSource?.isNsfw && (
                        <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase">
                          NSFW
                        </span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  {!isReadingMedia && (
                    <button
                      type="button"
                      data-testid="diagnose-episodes-btn"
                      onClick={() =>
                        navigate('/settings/diagnostics', {
                          state: {
                            media: matchedOverrideMedia ?? media,
                            sourceId: selectedSourceId,
                            sourceName: activeSource?.name,
                            overrideTitle: matchedTitleOverride.trim() || undefined,
                          },
                        })
                      }
                      title="Episode Fetch Diagnostics"
                      aria-label="Diagnose episode fetch"
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--sx-on-surface)]/7 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 hover:border-[var(--sx-primary)] transition-colors"
                    >
                      <Shield className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="source-settings-btn"
                    onClick={() => navigate('/settings/extensions')}
                    title="Extension & Source Settings"
                    aria-label="Source settings"
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--sx-on-surface)]/7 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 hover:border-[var(--sx-primary)] transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  {(
                    <button
                      type="button"
                      data-testid="refresh-episodes-btn"
                      disabled={isResolvingItems}
                      onClick={() => setEpisodeRefreshNonce((n) => n + 1)}
                      title={isMangaOnly ? 'Refresh chapter list' : 'Refresh episode list'}
                      aria-label={isMangaOnly ? 'Refresh chapter list' : 'Refresh episode list'}
                      className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--sx-on-surface)]/7 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 hover:border-[var(--sx-primary)] transition-colors disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isResolvingItems ? 'animate-spin' : ''}`}
                      />
                    </button>
                  )}

                  <button
                    type="button"
                    data-testid="open-source-picker-btn"
                    onClick={() => {
                      triggerHaptic('menu-select');
                      setSourceDiagnosticsMap(loadPersistedExtensionDiagnostics());
                      setSourcePickerQuery('');
                      setSourcePickerOpen(true);
                    }}
                    title="Change source"
                    aria-label="Change source"
                    className="w-8 h-8 rounded-full inline-flex items-center justify-center bg-[var(--sx-on-surface)]/7 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 hover:border-[var(--sx-primary)] transition-colors"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Bottom Row: Matched Title, Source Availability & Wrong Title Button */}
              <div className="pt-2.5 border-t border-[var(--sx-outline)] flex flex-wrap items-center justify-between gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-extrabold truncate">
                    Found: {effectiveSourceTitle}
                  </p>
                  <p
                    data-testid="source-availability-text"
                    className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)] truncate tabular-nums mt-0.5"
                  >
                    {sourceAvailabilityLabel}
                  </p>
                </div>

                <button
                  type="button"
                  data-testid="wrong-title-btn"
                  onClick={() => {
                    setWrongTitleDraft(effectiveSourceTitle);
                    setWrongTitleOpen(true);
                  }}
                  className="shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-bold hover:border-[var(--sx-primary)] transition-colors"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                  <span>Wrong Title?</span>
                </button>
              </div>
            </section>

            {/* Filter & Episode Tools Row */}
            {(() => {
              const activeEpStyle = resolveEpisodeChapterStyle(
                state.uiPrefs.episodeChapterStyle,
              );
              const styleDef =
                EPISODE_CHAPTER_STYLES.find((s) => s.id === activeEpStyle) ??
                EPISODE_CHAPTER_STYLES[0];
              const styleIconMap: Record<
                EpisodeChapterStyle,
                React.FC<{ className?: string }>
              > = {
                classic: List,
                grid: LayoutGrid,
                box: Hash,
                compact: AlignJustify,
                cover: RectangleHorizontal,
              };
              const StyleIcon = styleIconMap[activeEpStyle];

              const listItems = isMangaOnly
                ? filteredChapters.map((ch) => {
                    const isCurrent = currentProgress + 1 === ch.number;
                    return {
                      id: ch.id,
                      number: ch.number,
                      title: ch.title,
                      meta: formatChapterMetaLine(ch),
                      thumbnail: media.banner || media.cover || null,
                      isCurrent,
                      isWatched: isEpisodeOrChapterWatched({
                        itemNumber: ch.number,
                        currentProgress,
                        watchedSet,
                        isCurrent,
                      }),
                      isBookmarked: bookmarkedSet.has(ch.number),
                      downloadTask: downloadTaskByNumber.get(ch.number) ?? null,
                    };
                  })
                : filteredEpisodes.map((ep) => {
                    const isCurrent =
                      activeTab === 'watch' && activeInlineEpisode
                        ? activeInlineEpisode.id
                          ? ep.id === activeInlineEpisode.id
                          : ep.number === activeInlineEpisode.number
                        : currentProgress + 1 === ep.number;
                    return {
                      id: ep.id,
                      number: ep.number,
                      title: ep.title,
                      meta: formatEpisodeMetaLine(ep),
                      thumbnail: ep.thumbnail || media.banner || media.cover || null,
                      isFiller: ep.isFiller,
                      isCurrent,
                      isWatched: isEpisodeOrChapterWatched({
                        itemNumber: ep.number,
                        currentProgress,
                        watchedSet,
                        isCurrent,
                      }),
                      isBookmarked: bookmarkedSet.has(ep.number),
                      downloadTask: downloadTaskByNumber.get(ep.number) ?? null,
                    };
                  });

              return (
                <>
                  {/* Sticky Search + Controls Toolbar while scrolling Episodes / Chapters */}
                  <div
                    data-testid="episode-sticky-toolbar"
                    className="sticky top-0 z-30 pt-1.5 pb-1 space-y-2.5 bg-transparent"
                  >
                    {/* Episode Search Input */}
                    <div className="relative">
                      <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                      <input
                        type="text"
                        data-testid="details-episode-search-input"
                        value={epFilter}
                        onChange={(e) => setEpFilter(e.target.value)}
                        placeholder={isMangaOnly ? 'Search chapters...' : 'Search episodes...'}
                        className="w-full pl-10 pr-3 py-2.5 rounded-full bg-white/24 dark:bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-[0_8px_28px_rgba(15,23,42,0.08)] text-xs font-semibold focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
                      />
                    </div>

                    {/* Episode / Chapter Filter, Style, Sort & Range Card */}
                    <div
                      data-testid="episode-controls-card"
                      className="rounded-[var(--sx-radius)] bg-white/24 dark:bg-white/[0.08] backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-[0_10px_32px_rgba(15,23,42,0.10)] p-2.5 sm:p-3 space-y-2.5"
                    >
                      {/* Top Row: Online / Downloaded / Bookmarked + Ep Style & Sort By actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 overflow-x-auto no-scrollbar">
                          <button
                            type="button"
                            data-testid="details-filter-online"
                            aria-label={`Online (${rawItemsCount})`}
                            title={`Online (${rawItemsCount})`}
                            aria-pressed={itemFilterMode === 'all'}
                            onClick={() => setItemFilterMode('all')}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-extrabold whitespace-nowrap border transition-colors ${
                              itemFilterMode === 'all'
                                ? 'rounded-full bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 border-[var(--sx-primary)]/35 text-[var(--sx-primary)] shadow-sm'
                                : 'rounded-xl bg-[var(--sx-surface-high)]/65 dark:bg-white/6 border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45'
                            }`}
                          >
                            <Radio className="w-3.5 h-3.5 shrink-0" />
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none ${
                                itemFilterMode === 'all'
                                  ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                                  : 'bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-[var(--sx-on-surface-muted)]'
                              }`}
                            >
                              {rawItemsCount}
                            </span>
                          </button>

                          <button
                            type="button"
                            data-testid="details-filter-downloaded"
                            aria-label={`Downloaded (${downloadedAnyCount})`}
                            title={`Downloaded (${downloadedAnyCount})`}
                            aria-pressed={itemFilterMode === 'downloaded'}
                            onClick={() =>
                              setItemFilterMode((m) => (m === 'downloaded' ? 'all' : 'downloaded'))
                            }
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border transition-colors shrink-0 ${
                              itemFilterMode === 'downloaded'
                                ? 'bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 border-[var(--sx-primary)]/35 text-[var(--sx-primary)] shadow-sm'
                                : 'bg-[var(--sx-on-surface)]/7 dark:bg-white/6 border-white/35 dark:border-white/12 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45'
                            }`}
                          >
                            <Download className="w-3.5 h-3.5 shrink-0" />
                          </button>

                          <button
                            type="button"
                            data-testid="details-filter-bookmarked"
                            aria-label={`Bookmarked (${mediaBookmarkedCount})`}
                            title={`Bookmarked (${mediaBookmarkedCount})`}
                            aria-pressed={itemFilterMode === 'bookmarked'}
                            onClick={() =>
                              setItemFilterMode((m) => (m === 'bookmarked' ? 'all' : 'bookmarked'))
                            }
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border text-xs font-extrabold transition-colors shrink-0 ${
                              itemFilterMode === 'bookmarked'
                                ? 'bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 border-[var(--sx-primary)]/35 text-[var(--sx-primary)] shadow-sm'
                                : 'bg-[var(--sx-on-surface)]/7 dark:bg-white/6 border-white/35 dark:border-white/12 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45'
                            }`}
                          >
                            <Bookmark
                              className={`w-3.5 h-3.5 shrink-0 ${
                                mediaBookmarkedCount > 0 ? 'fill-current text-[var(--sx-primary)]' : ''
                              }`}
                            />
                            {mediaBookmarkedCount > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]">
                                {mediaBookmarkedCount}
                              </span>
                            )}
                          </button>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            data-testid="details-episode-style-toggle"
                            onClick={() =>
                              updateUiPrefs({
                                episodeChapterStyle: getNextEpisodeChapterStyle(activeEpStyle),
                              })
                            }
                            aria-label={`Layout style: ${styleDef.name}`}
                            title={`Switch layout (current: ${styleDef.name})`}
                            className="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/8 border border-white/35 dark:border-white/12 text-xs font-extrabold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors whitespace-nowrap"
                          >
                            <StyleIcon className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                            <span className="hidden sm:inline">{styleDef.name}</span>
                          </button>

                          <button
                            type="button"
                            data-testid="details-episode-sort-toggle"
                            onClick={() => setEpOrderAsc((v) => !v)}
                            aria-label={`Sort order: ${epOrderAsc ? 'Ascending' : 'Descending'}`}
                            title={`Sort order: ${epOrderAsc ? 'Asc' : 'Desc'}`}
                            className="inline-flex items-center justify-center gap-1.5 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-full bg-[var(--sx-on-surface)]/7 dark:bg-white/8 border border-white/35 dark:border-white/12 text-xs font-extrabold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors whitespace-nowrap"
                          >
                            <ArrowDownUp className="w-3.5 h-3.5 text-[var(--sx-primary)] shrink-0" />
                            <span className="hidden sm:inline">{epOrderAsc ? 'Asc' : 'Desc'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Bottom Row: All + Episode / Chapter Range Pills with Count Badges */}
                      {rawItemsCount > 0 && (
                        <div
                          data-testid="episode-range-pills"
                          className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5"
                        >
                          <button
                            type="button"
                            data-testid="episode-range-all"
                            onClick={() => setSelectedRangeId('all')}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold whitespace-nowrap border transition-colors tabular-nums shrink-0 ${
                              selectedRangeId === 'all'
                                ? 'rounded-full bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 border-[var(--sx-primary)]/35 text-[var(--sx-primary)] shadow-sm'
                                : 'rounded-xl bg-[var(--sx-on-surface)]/7 dark:bg-white/6 border-white/35 dark:border-white/12 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45'
                            }`}
                          >
                            <span>All</span>
                            <span
                              className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none ${
                                selectedRangeId === 'all'
                                  ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                                  : 'bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-[var(--sx-on-surface-muted)]'
                              }`}
                            >
                              {rawItemsCount}
                            </span>
                          </button>
                          {episodeRanges.map((range) => {
                            const isSelected = selectedRangeId === range.id;
                            const rangeCount = getEpisodeRangeCount(range);
                            return (
                              <button
                                key={range.id}
                                type="button"
                                data-testid={`episode-range-${range.id}`}
                                onClick={() => setSelectedRangeId(range.id)}
                                className={`inline-flex items-center gap-2 px-3 py-1.5 text-xs font-extrabold whitespace-nowrap border transition-colors tabular-nums shrink-0 ${
                                  isSelected
                                    ? 'rounded-full bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/22 border-[var(--sx-primary)]/35 text-[var(--sx-primary)] shadow-sm'
                                    : 'rounded-xl bg-[var(--sx-on-surface)]/7 dark:bg-white/6 border-white/35 dark:border-white/12 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/45'
                                }`}
                              >
                                <span>{range.label}</span>
                                <span
                                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none ${
                                    isSelected
                                      ? 'bg-[var(--sx-primary)]/18 text-[var(--sx-primary)]'
                                      : 'bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-[var(--sx-on-surface-muted)]'
                                  }`}
                                >
                                  {rangeCount}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {(loadingDetails || isResolvingItems) && rawItemsCount === 0 ? (
                    <EpisodeListSkeleton style={activeEpStyle} />
                  ) : isMangaOnly && chaptersError && rawItemsCount === 0 ? (
                    <div
                      data-testid="manga-chapters-error"
                      className={`${frostedCardClass} p-7 text-center space-y-3`}
                    >
                      <AlertCircle className="w-7 h-7 text-amber-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-extrabold">Chapters Unavailable</p>
                        <p className="text-xs text-[var(--sx-on-surface-muted)] max-w-md mx-auto">
                          {chaptersError}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEpisodeRefreshNonce((n) => n + 1)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full sx-glass-cta text-xs font-extrabold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourcePickerQuery('');
                            setSourcePickerOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-xs font-bold"
                        >
                          <span>Change Source</span>
                        </button>
                      </div>
                    </div>
                  ) : !isMangaOnly && episodesError && rawItemsCount === 0 ? (
                    <div
                      data-testid="anime-episodes-error"
                      className={`${frostedCardClass} p-7 text-center space-y-3`}
                    >
                      <AlertCircle className="w-7 h-7 text-amber-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-extrabold">Episodes Unavailable</p>
                        <p className="text-xs text-[var(--sx-on-surface-muted)] max-w-md mx-auto">
                          {episodesError}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        <button
                          type="button"
                          onClick={() => setEpisodeRefreshNonce((n) => n + 1)}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full sx-glass-cta text-xs font-extrabold"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Retry</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSourcePickerQuery('');
                            setSourcePickerOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--sx-on-surface)]/10 dark:bg-white/10 text-xs font-bold"
                        >
                          <span>Change Source</span>
                        </button>
                      </div>
                    </div>
                  ) : listItems.length === 0 ? (
                    <div className={`${frostedCardClass} p-8 text-center space-y-2`}>
                      <p className="text-sm font-bold">
                        No {isMangaOnly ? 'chapters' : 'episodes'} match your filter
                      </p>
                      <p className="text-xs text-[var(--sx-on-surface-muted)]">
                        {itemFilterMode === 'bookmarked'
                          ? `Bookmark favorite ${isMangaOnly ? 'chapters' : 'episodes'} in Classic style to see them here.`
                          : 'Try clearing the search box or switching range to All.'}
                      </p>
                    </div>
                  ) : (
                    <EpisodeChapterList
                      items={listItems}
                      unitLabel={isMangaOnly ? 'CHAPTER' : 'EPISODE'}
                      style={activeEpStyle}
                      isManga={isMangaOnly}
                      translucent
                      onSelectItem={(item) => {
                        if (isMangaOnly) {
                          const realIndex = chapters.findIndex((c) => c.id === item.id);
                          handleLaunchMedia(realIndex >= 0 ? realIndex : 0);
                        } else {
                          const realIndex = episodes.findIndex((e) => e.id === item.id);
                          handleLaunchMedia(realIndex >= 0 ? realIndex : 0);
                        }
                      }}
                      onDownloadItem={(item) => {
                        handleDownloadItem(item);
                      }}
                      onDeleteDownload={(item) => {
                        const existing = downloadTaskByNumber.get(item.number);
                        if (existing) removeDownload(existing.id);
                      }}
                      onToggleBookmark={(item) => {
                        toggleItemBookmark(media, item.number, item.title, item.thumbnail);
                      }}
                    />
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* ======================== TAB 3: COMMENTS ======================== */}
        {activeTab === 'comments' && (
          <div
            key="tab-comments"
            data-testid="details-panel-comments"
            className={`${tabTransitionClass} space-y-4`}
          >
            {/* Media Header Summary Card */}
            <section className={`${frostedCardClass} p-3.5 sm:p-4 flex items-center gap-3.5`}>
              <SmartImage
                src={media.cover}
                alt={title}
                fallbackTitle={title}
                className="w-14 h-20 rounded-2xl shrink-0"
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className="text-sm sm:text-base font-extrabold truncate">{title}</p>
                <div className="flex items-center gap-2 text-[11px] font-bold text-[var(--sx-on-surface-muted)]">
                  <span className="px-2 py-0.5 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 uppercase">
                    {media.type}
                  </span>
                  <span className="tabular-nums">
                    {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
                  </span>
                </div>
              </div>
            </section>

            {/* Inline Comment Composer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!commentInput.trim()) return;
                addComment(media.id, commentInput, commentSpoiler);
                setCommentInput('');
                setCommentSpoiler(false);
              }}
              className={`${frostedCardClass} p-4 space-y-3`}
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="Share your thoughts about this title..."
                  className="flex-1 px-4 py-2.5 rounded-full bg-[var(--sx-on-surface)]/6 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/12 text-xs font-medium focus:outline-none focus:border-[var(--sx-primary)]"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full sx-glass-cta text-xs font-extrabold"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Post</span>
                </button>
              </div>
              <label className="inline-flex items-center gap-2 text-[11px] font-semibold text-[var(--sx-on-surface-muted)] cursor-pointer select-none px-1">
                <input
                  type="checkbox"
                  checked={commentSpoiler}
                  onChange={(e) => setCommentSpoiler(e.target.checked)}
                />
                <span>Mark comment as spoiler</span>
              </label>
            </form>

            {/* Comment Feed */}
            {comments.length === 0 ? (
              <div className={`${frostedCardClass} p-8 text-center space-y-1.5`}>
                <MessageSquare className="w-6 h-6 mx-auto text-[var(--sx-on-surface-muted)]" />
                <p className="text-sm font-extrabold">No comments yet</p>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  Be the first to start a discussion for {title}.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {comments.map((c, cIdx) => {
                  const isSpoilerHidden = c.spoiler && !revealedSpoilers[c.id];
                  const replies = repliesByComment[c.id] || [];
                  const initial = (c.author || 'U').slice(0, 1).toUpperCase();
                  return (
                    <div
                      key={c.id}
                      style={{ animationDelay: `${Math.min(cIdx, 8) * 28}ms` }}
                      className={`sx-card-animate ${frostedCardClass} p-4 space-y-2.5`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-8 h-8 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] flex items-center justify-center text-xs font-black shrink-0">
                            {initial}
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-extrabold truncate">{c.author}</p>
                            <p className="text-[10px] text-[var(--sx-on-surface-muted)]">
                              {new Date(c.createdAt).toLocaleDateString()}
                            </p>
                          </div>
                        </div>
                        {c.spoiler && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 text-[10px] font-extrabold uppercase">
                            Spoiler
                          </span>
                        )}
                      </div>

                      {isSpoilerHidden ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSpoilers((prev) => ({ ...prev, [c.id]: true }))
                          }
                          className="w-full py-2 px-3 rounded-xl bg-[var(--sx-on-surface)]/6 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] text-left"
                        >
                          Tap to reveal spoiler comment
                        </button>
                      ) : (
                        <p className="text-xs sm:text-sm leading-relaxed">{c.body}</p>
                      )}

                      <div className="flex items-center gap-4 pt-1">
                        <button
                          type="button"
                          onClick={() => likeComment(media.id, c.id)}
                          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] transition-colors"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          <span className="tabular-nums">{c.likes}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReplyTargetId((prev) => (prev === c.id ? null : c.id));
                            setReplyDraft('');
                          }}
                          className="text-[11px] font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] transition-colors"
                        >
                          Reply {replies.length > 0 ? `(${replies.length})` : ''}
                        </button>
                      </div>

                      {/* Replies Thread */}
                      {replies.length > 0 && (
                        <div className="pl-4 ml-2 border-l-2 border-[var(--sx-outline)] space-y-2 pt-1">
                          {replies.map((rep) => (
                            <div key={rep.id} className="text-xs space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold">{rep.author}</span>
                                <span className="text-[10px] text-[var(--sx-on-surface-muted)]">
                                  {new Date(rep.createdAt).toLocaleDateString()}
                                </span>
                              </div>
                              <p className="text-[var(--sx-on-surface-muted)]">{rep.body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {replyTargetId === c.id && (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (!replyDraft.trim()) return;
                            const authorName =
                              state.profiles.anilist?.username ||
                              state.profiles.local?.username ||
                              'Guest';
                            setRepliesByComment((prev) => ({
                              ...prev,
                              [c.id]: [
                                ...(prev[c.id] || []),
                                {
                                  id: `rep-${Date.now()}`,
                                  author: authorName,
                                  body: replyDraft.trim(),
                                  createdAt: new Date().toISOString(),
                                },
                              ],
                            }));
                            setReplyDraft('');
                            setReplyTargetId(null);
                          }}
                          className="flex gap-2 pt-1"
                        >
                          <input
                            type="text"
                            value={replyDraft}
                            onChange={(e) => setReplyDraft(e.target.value)}
                            placeholder={`Reply to ${c.author}...`}
                            className="flex-1 px-3 py-1.5 rounded-full bg-[var(--sx-on-surface)]/6 dark:bg-white/10 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs focus:outline-none focus:border-[var(--sx-primary)]"
                          />
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-full sx-glass-cta text-xs font-bold"
                          >
                            Reply
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sticky Backdrop-Blur Header (hidden on Watch tab; iOS spring popup after scrolling past hero) */}
      <div className="pointer-events-none fixed top-3 inset-x-0 z-40 px-3 sm:px-6">
        <header
          data-testid="details-sticky-header"
          data-visible={stickyHeaderVisible ? 'true' : 'false'}
          aria-hidden={!stickyHeaderVisible}
          className="sx-sticky-header max-w-5xl mx-auto p-1.5 sm:px-2.5 sm:py-1.5 rounded-[34px] bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/15 shadow-[0_14px_38px_rgba(15,23,42,0.14)] ring-1 ring-inset ring-white/25 dark:ring-white/10 flex items-center justify-between gap-2 sm:gap-3"
        >
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <button
              type="button"
              tabIndex={stickyHeaderVisible ? 0 : -1}
              onClick={() => {
                triggerHaptic('nav-pop');
                suppressNextRouteHaptic();
                navigate(-1);
              }}
              aria-label="Back to previous page"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border border-white/40 dark:border-white/15 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            {media.cover && (
              <div className="w-7 h-9 sm:w-8 sm:h-10 rounded-2xl overflow-hidden border border-white/35 dark:border-white/15 shrink-0 bg-[var(--sx-surface-container)] shadow-sm">
                <SmartImage
                  src={media.cover}
                  alt={title}
                  fallbackTitle={title}
                  className="w-full h-full"
                />
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-black tracking-tight text-[var(--sx-on-surface)] truncate leading-tight">
                {title}
              </p>
              <p className="text-[10px] sm:text-[11px] font-semibold text-[var(--sx-on-surface-muted)] truncate">
                {[
                  media.format || media.type,
                  totalCount > 0 ? `${totalCount} ${isReadingMedia ? 'ch' : 'eps'}` : null,
                  typeof media.score === 'number' && media.score > 0
                    ? `★ ${media.score.toFixed(1)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-testid="details-sticky-watchlist-btn"
              tabIndex={stickyHeaderVisible ? 0 : -1}
              onClick={() => {
                if (libEntry) {
                  setTrackerOpen(true);
                } else {
                  void upsertLibraryEntry(media, 'PLANNING', 0);
                }
              }}
              title={libEntry ? 'In Watchlist (click to edit)' : 'Add to Watchlist'}
              aria-label={libEntry ? 'In Watchlist, edit entry' : 'Add to Watchlist'}
              className={`h-9 px-3 sm:px-3.5 rounded-full flex items-center justify-center gap-1.5 text-xs font-extrabold transition-[border-color,background-color] shrink-0 border ${
                libEntry
                  ? 'sx-glass-active'
                  : 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border-white/40 dark:border-white/15 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50'
              }`}
            >
              {libEntry ? (
                <BookmarkCheck className="w-4 h-4 shrink-0" />
              ) : (
                <BookmarkPlus className="w-4 h-4 shrink-0" />
              )}
              <span className="hidden sm:inline whitespace-nowrap">
                {libEntry ? 'In Watchlist' : 'Watchlist'}
              </span>
            </button>

            <button
              type="button"
              tabIndex={stickyHeaderVisible ? 0 : -1}
              onClick={() => {
                triggerHaptic('nav-pop');
                suppressNextRouteHaptic();
                navigate('/home');
              }}
              title="Return home"
              aria-label="Return home"
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-[var(--sx-on-surface)]/8 dark:bg-white/10 border border-white/40 dark:border-white/15 text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/50 transition-all"
            >
              <Home className="w-4 h-4" />
            </button>
          </div>
        </header>
      </div>

      {/* Bottom Edge Scrim so scrolling cards fade cleanly behind floating pills */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 h-24 z-20 bg-gradient-to-t from-[var(--sx-surface)]/55 via-[var(--sx-surface)]/20 to-transparent"
      />

      {/* Floating Start / Continue Reading Dock on Watch Tab for Manga */}
      {activeTab === 'watch' && isMangaOnly && resumeItem && (
        <div className="fixed bottom-[98px] left-1/2 -translate-x-1/2 z-30 w-[calc(100%-2rem)] max-w-md">
          <button
            type="button"
            data-testid="floating-watch-cta"
            onClick={() => handleLaunchMedia(resumeIndex)}
            className="w-full px-4 py-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/40 dark:bg-[var(--sx-surface-container)]/44 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/15 ring-1 ring-inset ring-white/25 dark:ring-white/5 shadow-2xl flex items-center justify-between gap-3 hover:border-[var(--sx-primary)] transition-all"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-full sx-glass-active flex items-center justify-center shrink-0">
                <BookOpen className="w-4 h-4" />
              </span>
              <div className="min-w-0 text-left">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                  {hasStarted ? 'Continue Reading' : 'Start Reading'}
                </p>
                <p className="text-xs sm:text-sm font-extrabold truncate">
                  {(() => {
                    const unit = `Chapter ${resumeItem.number}`;
                    return resumeItem.title.toLowerCase() === unit.toLowerCase()
                      ? unit
                      : `${unit} · ${resumeItem.title}`;
                  })()}
                </p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] shrink-0" />
          </button>
        </div>
      )}

      {/* Floating Bottom Frosted Pill Tab Bar (Info | Watch | Comments) */}
      <nav
        aria-label="Details Sections"
        className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-sm flex justify-center"
      >
        <div
          ref={bottomNavPill.containerRef}
          className="relative w-full grid grid-cols-3 items-center p-1.5 rounded-[34px] bg-[var(--sx-surface-container)]/34 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/15 shadow-[0_14px_38px_rgba(15,23,42,0.14)] ring-1 ring-inset ring-white/25 dark:ring-white/10"
        >
          {bottomNavPill.pillRect.ready && (
            <span
              aria-hidden="true"
              style={{
                transform: `translate3d(${bottomNavPill.pillRect.left}px, 0, 0)`,
                width: `${bottomNavPill.pillRect.width}px`,
                height: `${bottomNavPill.pillRect.height}px`,
                top: `${bottomNavPill.pillRect.top}px`,
              }}
              className="sx-pill-glide pointer-events-none absolute left-0 rounded-[28px] sx-glass-active"
            />
          )}

          {(
            [
              { key: 'info', label: 'Info', Icon: Info },
              {
                key: 'watch',
                label: isReadingMedia ? 'Read' : 'Watch',
                Icon: isReadingMedia ? BookOpen : Play,
              },
              {
                key: 'comments',
                label: 'Comments',
                Icon: MessageSquare,
                badge: comments.length,
              },
            ] as Array<{
              key: DetailsTab;
              label: string;
              Icon: React.FC<{ className?: string }>;
              badge?: number;
            }>
          ).map(({ key, label, Icon, badge }) => {
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                ref={bottomNavPill.registerItemRef(key)}
                type="button"
                data-testid={`details-tab-${key}`}
                onClick={() => {
                  switchTab(key);
                  if (key === 'watch' && !isReadingMedia && typeof window !== 'undefined') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }}
                className={`relative z-10 flex flex-col items-center justify-center gap-1 py-2.5 px-3 rounded-[28px] text-[11px] font-extrabold transition-colors whitespace-nowrap ${
                  isActive
                    ? bottomNavPill.pillRect.ready
                      ? 'text-[var(--sx-primary)]'
                      : 'sx-glass-active'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <div className="relative flex items-center justify-center">
                  <Icon className="w-[18px] h-[18px]" />
                  {typeof badge === 'number' && badge > 0 && (
                    <span
                      className={`absolute -top-1.5 -right-3 px-1 min-w-[16px] h-4 rounded-full text-[9px] flex items-center justify-center tabular-nums ${
                        isActive
                          ? 'sx-glass-active'
                          : 'sx-glass-control border border-[var(--sx-outline)] text-[var(--sx-on-surface)]'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </div>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Edit Tracker / Custom List Modal */}
      {trackerOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setTrackerOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Update Library and Tracker"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-md bg-[var(--sx-surface-container)]/68 dark:bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 ring-1 ring-inset ring-white/20 dark:ring-white/10 rounded-t-3xl sm:rounded-3xl p-5 space-y-4 shadow-2xl sx-sheet-enter"
              >
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-extrabold">Custom List &amp; Tracker</h2>
                  <button
                    type="button"
                    onClick={() => setTrackerOpen(false)}
                    className="p-2 rounded-full hover:bg-[var(--sx-surface-high)]/60"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={(e) => setEditStatus(e.target.value as TrackedStatus)}
                      className="w-full px-3 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-bold"
                    >
                      {(
                        [
                          'CURRENT',
                          'PLANNING',
                          'COMPLETED',
                          'PAUSED',
                          'DROPPED',
                          'REPEATING',
                        ] as TrackedStatus[]
                      ).map((s) => (
                        <option key={s} value={s}>
                          {getStatusLabel(s, media.type)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                        {isReadingMedia ? 'Chapters Read' : 'Episodes Watched'}
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditProgress((p) => Math.max(0, p - 1))}
                          className="px-3 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-white/30 dark:border-white/10 font-bold"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={editProgress}
                          onChange={(e) => setEditProgress(Math.max(0, Number(e.target.value)))}
                          className="w-full px-3 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-white/35 dark:border-white/12 text-center text-xs font-bold tabular-nums"
                        />
                        <button
                          type="button"
                          onClick={() => setEditProgress((p) => p + 1)}
                          className="px-3 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-white/30 dark:border-white/10 font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                        Score (0 - 10)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        value={editScore}
                        onChange={(e) =>
                          setEditScore(Math.min(10, Math.max(0, Number(e.target.value))))
                        }
                        className="w-full px-3 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-white/35 dark:border-white/12 text-xs font-bold tabular-nums"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-[var(--sx-on-surface-muted)]">
                      Notes
                    </label>
                    <textarea
                      rows={2}
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      placeholder="Personal notes..."
                      className="w-full px-3 py-2 rounded-2xl bg-[var(--sx-surface-high)]/55 border border-white/35 dark:border-white/12 text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--sx-outline)]">
                  {libEntry ? (
                    <button
                      type="button"
                      onClick={() => {
                        removeLibraryEntry(media.id);
                        setTrackerOpen(false);
                      }}
                      className="text-xs font-bold text-red-400 hover:underline"
                    >
                      Remove
                    </button>
                  ) : (
                    <div />
                  )}
                  <button
                    type="button"
                    onClick={handleSaveTracker}
                    className="px-5 py-2.5 rounded-full sx-glass-cta text-xs font-extrabold"
                  >
                    Save Progress
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}

      {/* Select Anime / Manga Source Bottom Sheet Modal */}
      {sourcePickerOpen &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setSourcePickerOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label={isMangaOnly ? 'Select Manga Source' : 'Select Anime Source'}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-lg max-h-[82vh] flex flex-col bg-[var(--sx-surface-container)]/68 dark:bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 ring-1 ring-inset ring-white/20 dark:ring-white/10 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 space-y-4 shadow-2xl sx-sheet-enter"
              >
                <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/30 mx-auto shrink-0 sm:hidden" />

                <div className="flex items-center justify-between gap-3 shrink-0">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Puzzle className="w-5 h-5 text-[var(--sx-primary)] shrink-0" />
                    <h2 className="text-base sm:text-lg font-extrabold truncate">
                      {isMangaOnly ? 'Select Manga Source' : 'Select Anime Source'}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="px-2.5 py-1 rounded-full bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-[11px] font-extrabold tabular-nums">
                      {availableSources.length} sources
                    </span>
                    <button
                      type="button"
                      onClick={() => setSourcePickerOpen(false)}
                      aria-label="Close source selector"
                      className="p-1.5 rounded-full hover:bg-[var(--sx-surface-high)]/60"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Search Sources Input */}
                <div className="relative shrink-0">
                  <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                  <input
                    type="text"
                    data-testid="source-picker-search"
                    value={sourcePickerQuery}
                    onChange={(e) => setSourcePickerQuery(e.target.value)}
                    placeholder="Search sources..."
                    autoFocus
                    className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-semibold outline-none focus:border-[var(--sx-primary)]"
                  />
                  {sourcePickerQuery && (
                    <button
                      type="button"
                      onClick={() => setSourcePickerQuery('')}
                      aria-label="Clear source search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Live Status Filter + Quick Test Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
                  <button
                    type="button"
                    data-testid="source-picker-working-filter"
                    aria-pressed={sourcePickerWorkingOnly}
                    onClick={() => {
                      triggerHaptic('menu-select');
                      setSourcePickerWorkingOnly((prev) => !prev);
                    }}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-[11px] font-extrabold transition-all ${
                      sourcePickerWorkingOnly
                        ? 'bg-emerald-500/18 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                        : 'bg-[var(--sx-surface-high)]/55 border-white/35 dark:border-white/12 text-[var(--sx-on-surface)] hover:border-emerald-500/40'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Working & Web Ready</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[10px] tabular-nums">
                      {likelyWorkingPickerCount}/{availableSources.length}
                    </span>
                  </button>

                  {(
                    <button
                      type="button"
                      data-testid="source-picker-verify-btn"
                      disabled={batchProbingSources || filteredSourcePickerList.length === 0}
                      onClick={() => {
                        triggerHaptic('menu-select');
                        void probeUntestedPickerSources();
                      }}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/30 text-[var(--sx-primary)] text-[11px] font-extrabold hover:bg-[var(--sx-primary)]/22 disabled:opacity-50 transition-colors"
                    >
                      {batchProbingSources ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <FlaskConical className="w-3.5 h-3.5" />
                      )}
                      <span>{batchProbingSources ? 'Testing...' : 'Test Sources'}</span>
                    </button>
                  )}
                </div>

                {/* Source List */}
                <div
                  data-testid="source-picker-list"
                  className="flex-1 overflow-y-auto space-y-2 pr-0.5"
                >
                  {filteredSourcePickerList.length === 0 ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-xs text-[var(--sx-on-surface-muted)]">
                        {sourcePickerWorkingOnly && !sourcePickerQuery
                          ? 'No working or web-ready sources match right now.'
                          : `No installed sources match "${sourcePickerQuery}".`}
                      </p>
                      {sourcePickerWorkingOnly && (
                        <button
                          type="button"
                          onClick={() => {
                            triggerHaptic('menu-select');
                            setSourcePickerWorkingOnly(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[var(--sx-primary)]/14 border border-[var(--sx-primary)]/30 text-[var(--sx-primary)] text-xs font-bold"
                        >
                          Show All ({availableSources.length})
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredSourcePickerList.map((src) => {
                      const isSelected = src.id === selectedSourceId;
                      const liveBadge = resolveSourceLiveStatusBadge({
                        source: src,
                        report: sourceDiagnosticsMap[src.id],
                        mediaType: media.type,
                      });
                      const isProbing = Boolean(probingSourceIds[src.id]);
                      const showProbeBtn =
                        liveBadge.kind !== 'unsupported' &&
                        liveBadge.kind !== 'android-native';

                      return (
                        <div
                          key={src.id}
                          className={`w-full rounded-2xl border backdrop-blur-md flex items-center gap-1.5 pr-2 transition-all ${
                            isSelected
                              ? 'bg-[var(--sx-primary)]/14 border-[var(--sx-primary)] shadow-sm'
                              : 'bg-[var(--sx-surface-high)]/45 border-white/35 dark:border-white/12 hover:border-[var(--sx-primary)]/60'
                          }`}
                        >
                          <button
                            type="button"
                            data-testid={`source-picker-item-${src.id}`}
                            onClick={() => {
                              triggerHaptic('menu-select');
                              const isSwitching = src.id !== selectedSourceId;
                              if (isMangaOnly) {
                                setPreferredSource('MANGA', src.id);
                              } else if (!isReadingMedia) {
                                setPreferredSource('ANIME', src.id);
                              }
                              setResolvedWatchStream(null);
                              if (isSwitching) {
                                setMatchedSourceEntry(null);
                                setMatchedOverrideMedia(null);
                                setMatchedTitleOverride('');
                                setEpisodesError(null);
                                setWrongTitleResults([]);
                                setWrongTitleSourceResults([]);
                                setWrongTitleSearchError(null);
                              }
                              if (!isReadingMedia && isSwitching) {
                                const nextAudio = resolvePreferredAudioForSource({
                                  currentAudioLang: state.playerPrefs.audioLanguage,
                                  sourceLang: src.lang,
                                  sourceName: src.name,
                                  sourceBaseUrl: src.baseUrl,
                                });
                                if (nextAudio !== state.playerPrefs.audioLanguage) {
                                  updatePlayerPrefs({ audioLanguage: nextAudio });
                                }
                              }
                              setSourcePickerOpen(false);
                            }}
                            className="flex-1 min-w-0 p-3 flex items-center justify-between gap-2.5 text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <div className="relative w-11 h-11 rounded-2xl shrink-0 bg-[var(--sx-surface-container)]/60 border border-white/35 dark:border-white/12 flex items-center justify-center">
                                {src.iconUrl ? (
                                  <img
                                    src={src.iconUrl}
                                    alt={src.name}
                                    className="w-full h-full object-cover rounded-2xl"
                                  />
                                ) : (
                                  <span className="text-sm font-black text-[var(--sx-primary)]">
                                    {src.name.slice(0, 1).toUpperCase()}
                                  </span>
                                )}
                                <span className="w-4 h-4 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] absolute -bottom-1 -right-1 flex items-center justify-center">
                                  {isReadingMedia ? (
                                    <BookOpen className="w-2.5 h-2.5" />
                                  ) : (
                                    <Play className="w-2.5 h-2.5 fill-current ml-0.5" />
                                  )}
                                </span>
                              </div>

                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="text-sm font-extrabold truncate">{src.name}</div>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-primary)]/14 text-[var(--sx-primary)] text-[10px] font-extrabold">
                                    {getSourceManagerBadge(src)}
                                  </span>
                                  <span className="px-2 py-0.5 rounded-md bg-[var(--sx-surface-container)]/65 text-[10px] font-extrabold uppercase">
                                    {src.lang}
                                  </span>
                                  <SourceLiveStatusChip
                                    badge={liveBadge}
                                    isInbuilt={src.type === 'inbuilt'}
                                    testId={`source-picker-status-${src.id}`}
                                  />
                                  {src.isNsfw && (
                                    <span className="px-2 py-0.5 rounded-md bg-red-500/15 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase">
                                      NSFW
                                    </span>
                                  )}
                                </div>
                                {liveBadge.shortHint &&
                                  (liveBadge.kind === 'blocked' ||
                                    liveBadge.kind === 'failed' ||
                                    liveBadge.kind === 'partial' ||
                                    liveBadge.kind === 'working') && (
                                    <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                                      {liveBadge.shortHint}
                                    </p>
                                  )}
                              </div>
                            </div>

                            <span
                              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
                                isSelected
                                  ? 'bg-[var(--sx-primary)] border-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                                  : 'border-[var(--sx-outline)] text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </span>
                          </button>

                          {showProbeBtn && (
                            <button
                              type="button"
                              data-testid={`source-picker-test-${src.id}`}
                              disabled={isProbing || batchProbingSources}
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerHaptic('menu-select');
                                void probeSinglePickerSource(src);
                              }}
                              title={`Test ${src.name} live status`}
                              aria-label={`Test ${src.name}`}
                              className="w-8 h-8 rounded-xl bg-[var(--sx-surface-container)]/70 border border-white/30 dark:border-white/12 text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-primary)] hover:border-[var(--sx-primary)]/40 flex items-center justify-center shrink-0 disabled:opacity-50 transition-colors"
                            >
                              {isProbing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin text-[var(--sx-primary)]" />
                              ) : (
                                <FlaskConical className="w-3.5 h-3.5" />
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Footer Shortcut to Manage Extensions */}
                <div className="pt-2 border-t border-[var(--sx-outline)] flex items-center justify-between gap-2 shrink-0">
                  <span className="text-[11px] text-[var(--sx-on-surface-muted)]">
                    Need more sources? Add Aniyomi / Mangayomi repos.
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSourcePickerOpen(false);
                      navigate('/settings/extensions');
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-bold hover:border-[var(--sx-primary)] whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>Extensions</span>
                  </button>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}

      {/* Wrong Title / Source Title Search Modal */}
      {wrongTitleOpen &&
        (() => {
          const aliasChips = Array.from(
            new Set(
              [
                media.title.english,
                media.title.romaji,
                media.title.native,
                ...(media.synonyms || []).slice(0, 3),
              ]
                .map((t) => (typeof t === 'string' ? t.trim() : ''))
                .filter(Boolean),
            ),
          );

          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/65 backdrop-blur-md p-0 sm:p-4 sx-backdrop-enter"
              onClick={() => setWrongTitleOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Search Matched Source Title"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="w-full sm:max-w-lg max-h-[84vh] flex flex-col bg-[var(--sx-surface-container)]/68 dark:bg-[var(--sx-surface-container)]/62 backdrop-blur-2xl backdrop-saturate-150 border border-white/45 dark:border-white/15 ring-1 ring-inset ring-white/20 dark:ring-white/10 rounded-t-3xl sm:rounded-3xl p-4 sm:p-5 space-y-3.5 shadow-2xl sx-sheet-enter"
              >
                <div className="w-10 h-1 rounded-full bg-[var(--sx-on-surface-muted)]/30 mx-auto shrink-0 sm:hidden" />

                {/* Top Search Bar + List/Grid Layout Toggle (matching reference) */}
                <div className="flex items-center gap-2 shrink-0">
                  <div className="relative flex-1 min-w-0">
                    <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 z-10 pointer-events-none" />
                    <input
                      type="text"
                      data-testid="wrong-title-search-input"
                      value={wrongTitleDraft}
                      onChange={(e) => setWrongTitleDraft(e.target.value)}
                      placeholder={`Search title on ${activeSource?.name || 'source'}...`}
                      autoFocus
                      className="w-full pl-10 pr-9 py-2.5 rounded-2xl bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-xs font-semibold outline-none focus:border-[var(--sx-primary)]"
                    />
                    {wrongTitleSearching ? (
                      <Loader2 className="w-4 h-4 animate-spin text-[var(--sx-primary)] absolute right-3 top-1/2 -translate-y-1/2" />
                    ) : (
                      wrongTitleDraft && (
                        <button
                          type="button"
                          onClick={() => setWrongTitleDraft('')}
                          aria-label="Clear title search"
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    data-testid="wrong-title-view-toggle"
                    onClick={() =>
                      setWrongTitleViewMode((m) => (m === 'list' ? 'grid' : 'list'))
                    }
                    title={
                      wrongTitleViewMode === 'list' ? 'Switch to grid view' : 'Switch to list view'
                    }
                    aria-label="Toggle title results layout"
                    className="w-10 h-10 rounded-2xl bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 flex items-center justify-center shrink-0 hover:border-[var(--sx-primary)] transition-colors"
                  >
                    {wrongTitleViewMode === 'list' ? (
                      <LayoutGrid className="w-4 h-4 text-[var(--sx-primary)]" />
                    ) : (
                      <List className="w-4 h-4 text-[var(--sx-primary)]" />
                    )}
                  </button>
                </div>

                {/* Quick Known Aliases */}
                {aliasChips.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5 shrink-0">
                    {aliasChips.map((cand, idx) => (
                      <button
                        key={`${cand}-${idx}`}
                        type="button"
                        onClick={() => setWrongTitleDraft(cand)}
                        className="px-2.5 py-1 rounded-full bg-[var(--sx-surface-high)]/55 backdrop-blur-md border border-white/35 dark:border-white/12 text-[11px] font-bold whitespace-nowrap hover:border-[var(--sx-primary)] transition-colors"
                      >
                        {cand}
                      </button>
                    ))}
                  </div>
                )}

                {/* Search Results List / Grid */}
                <div
                  data-testid="wrong-title-results"
                  className="flex-1 overflow-y-auto rounded-2xl bg-[var(--sx-surface-high)]/38 border border-white/30 dark:border-white/10"
                >
                  {wrongTitleSearching &&
                  (useExtensionWrongTitleSearch
                    ? wrongTitleSourceResults.length === 0
                    : wrongTitleResults.length === 0) ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-[var(--sx-on-surface-muted)]">
                      <Loader2 className="w-5 h-5 animate-spin text-[var(--sx-primary)]" />
                      <span>
                        {useExtensionWrongTitleSearch
                          ? `Searching "${wrongTitleDraft}" on ${activeSource?.name || 'source'}...`
                          : `Searching "${wrongTitleDraft}"...`}
                      </span>
                    </div>
                  ) : wrongTitleSearchError ? (
                    <div
                      data-testid="wrong-title-error-message"
                      className="p-6 text-center text-xs text-red-700 dark:text-red-300"
                    >
                      {wrongTitleSearchError}
                    </div>
                  ) : useExtensionWrongTitleSearch ? (
                    wrongTitleSourceResults.length === 0 ? (
                      <div className="p-8 text-center text-xs text-[var(--sx-on-surface-muted)]">
                        {wrongTitleDraft.trim()
                          ? `No titles matched "${wrongTitleDraft.trim()}" on ${activeSource?.name || 'this source'}. Try Romaji or Japanese title.`
                          : `Type an anime title to search ${activeSource?.name || 'this source'}.`}
                      </div>
                    ) : wrongTitleViewMode === 'list' ? (
                      <div className="divide-y divide-[var(--sx-outline)]">
                        {wrongTitleSourceResults.map((item, idx) => (
                          <button
                            key={item.href}
                            type="button"
                            data-testid={`wrong-title-result-${item.slug || idx}`}
                            onClick={() => {
                              setMatchedSourceEntry(item);
                              setMatchedOverrideMedia(null);
                              setMatchedTitleOverride(item.title);
                              setEpisodes([]);
                              setEpisodesError(null);
                              setHasPickedInlineEpisode(false);
                              setInlineEpisodeIndex(0);
                              setWrongTitleOpen(false);
                            }}
                            className="w-full p-3 flex items-center gap-3 text-left hover:bg-[var(--sx-primary)]/8 transition-colors"
                          >
                            <SmartImage
                              src={item.cover}
                              alt={item.title}
                              fallbackTitle={item.title}
                              className="w-12 h-16 rounded-xl shrink-0"
                            />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-xs sm:text-sm font-extrabold line-clamp-2">
                                {item.title}
                              </p>
                              <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                                {[activeSource?.name, item.slug].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-2.5">
                        {wrongTitleSourceResults.map((item, idx) => (
                          <button
                            key={item.href}
                            type="button"
                            data-testid={`wrong-title-result-${item.slug || idx}`}
                            onClick={() => {
                              setMatchedSourceEntry(item);
                              setMatchedOverrideMedia(null);
                              setMatchedTitleOverride(item.title);
                              setEpisodes([]);
                              setEpisodesError(null);
                              setHasPickedInlineEpisode(false);
                              setInlineEpisodeIndex(0);
                              setWrongTitleOpen(false);
                            }}
                            className="text-left group space-y-1.5 p-1.5 rounded-xl hover:bg-[var(--sx-primary)]/10 transition-colors"
                          >
                            <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)]">
                              <SmartImage
                                src={item.cover}
                                alt={item.title}
                                fallbackTitle={item.title}
                                className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                              />
                            </div>
                            <p className="text-xs font-bold line-clamp-2 leading-snug">
                              {item.title}
                            </p>
                          </button>
                        ))}
                      </div>
                    )
                  ) : wrongTitleResults.length === 0 ? (
                    <div className="p-8 text-center text-xs text-[var(--sx-on-surface-muted)]">
                      {wrongTitleDraft.trim()
                        ? `No titles matched "${wrongTitleDraft.trim()}". Try Romaji or Japanese title.`
                        : 'Type an anime title to search matching entries.'}
                    </div>
                  ) : wrongTitleViewMode === 'list' ? (
                    <div className="divide-y divide-[var(--sx-outline)]">
                      {wrongTitleResults.map((item) => {
                        const itemTitle = getPreferredTitle(
                          item.title,
                          state.contentPrefs.titlePreference,
                        );
                        const metaParts = [
                          item.format,
                          item.year ? String(item.year) : null,
                          item.episodes
                            ? `${item.episodes} eps`
                            : item.chapters
                              ? `${item.chapters} ch`
                              : null,
                        ].filter(Boolean);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`wrong-title-result-${item.id}`}
                            onClick={() => {
                              setMatchedSourceEntry(null);
                              setMatchedOverrideMedia(item);
                              setMatchedTitleOverride(itemTitle);
                              setWrongTitleOpen(false);
                            }}
                            className="w-full p-3 flex items-center gap-3 text-left hover:bg-[var(--sx-primary)]/8 transition-colors"
                          >
                            <SmartImage
                              src={item.cover}
                              alt={itemTitle}
                              fallbackTitle={itemTitle}
                              className="w-12 h-16 rounded-xl shrink-0"
                            />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <p className="text-xs sm:text-sm font-extrabold line-clamp-2">
                                {itemTitle}
                              </p>
                              {metaParts.length > 0 && (
                                <p className="text-[11px] text-[var(--sx-on-surface-muted)] tabular-nums truncate">
                                  {metaParts.join(' · ')}
                                </p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-2.5">
                      {wrongTitleResults.map((item) => {
                        const itemTitle = getPreferredTitle(
                          item.title,
                          state.contentPrefs.titlePreference,
                        );
                        return (
                          <button
                            key={item.id}
                            type="button"
                            data-testid={`wrong-title-result-${item.id}`}
                            onClick={() => {
                              setMatchedSourceEntry(null);
                              setMatchedOverrideMedia(item);
                              setMatchedTitleOverride(itemTitle);
                              setWrongTitleOpen(false);
                            }}
                            className="text-left group space-y-1.5 p-1.5 rounded-xl hover:bg-[var(--sx-primary)]/10 transition-colors"
                          >
                            <div className="relative aspect-[2/3] rounded-xl overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-container)]">
                              <SmartImage
                                src={item.cover}
                                alt={itemTitle}
                                fallbackTitle={itemTitle}
                                className="w-full h-full group-hover:scale-105 transition-transform duration-200"
                              />
                              {(item.episodes || item.chapters) && (
                                <span className="absolute bottom-1.5 right-1.5 z-10 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-sm text-white text-[10px] font-bold tabular-nums shadow-sm">
                                  {item.episodes ? `${item.episodes} eps` : `${item.chapters} ch`}
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold line-clamp-2 leading-snug">
                              {itemTitle}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setMatchedSourceEntry(null);
                      setMatchedTitleOverride('');
                      setMatchedOverrideMedia(null);
                      setWrongTitleOpen(false);
                    }}
                    className="px-4 py-2 rounded-full bg-[var(--sx-surface-high)]/55 text-xs font-bold hover:border-[var(--sx-primary)] border border-white/35 dark:border-white/12"
                  >
                    Reset Match
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setWrongTitleOpen(false)}
                      className="px-3.5 py-2 rounded-full bg-[var(--sx-surface-high)]/55 border border-white/35 dark:border-white/12 text-xs font-bold"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMatchedSourceEntry(null);
                        setMatchedOverrideMedia(null);
                        setMatchedTitleOverride(wrongTitleDraft.trim());
                        setWrongTitleOpen(false);
                      }}
                      className="px-4 py-2 rounded-full sx-glass-cta text-xs font-extrabold"
                    >
                      Apply Query
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
          return typeof document !== 'undefined'
            ? createPortal(modalContent, document.body)
            : modalContent;
        })()}

      {/* Trailer Modal */}
      {trailerOpen &&
        trailerEmbed &&
        (() => {
          const modalContent = (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 sx-backdrop-enter"
              onClick={() => setTrailerOpen(false)}
              role="dialog"
              aria-modal="true"
              aria-label="Official Trailer"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="sx-sheet-enter w-full max-w-3xl rounded-3xl overflow-hidden bg-zinc-950/90 backdrop-blur-2xl border border-white/15 ring-1 ring-inset ring-white/10 shadow-2xl"
              >
                <div className="flex items-center justify-between px-4 py-3 bg-zinc-900/90 text-white">
                  <span className="text-xs font-extrabold truncate">{title} — Trailer</span>
                  <button
                    type="button"
                    onClick={() => setTrailerOpen(false)}
                    className="p-1.5 rounded-full hover:bg-white/10"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="aspect-video w-full">
                  <iframe
                    src={trailerEmbed}
                    title={`${title} Trailer`}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full border-0"
                  />
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

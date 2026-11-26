import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Captions,
  Check,
  FastForward,
  Gauge,
  Languages,
  ListVideo,
  Lock,
  Maximize2,
  MessageSquare,
  Minimize2,
  MoveHorizontal,
  MoveVertical,
  Pause,
  PictureInPicture2,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Scaling,
  Settings,
  Sun,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useApp, VideoQualityPref } from '../store/AppContext';
import { usePip } from '../store/PipContext';
import {
  getPreferredTitle,
  MatchedSourceEntry,
  SourceInfo,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import { resolveVideoServers, resolveVideoStreamAsync } from '../services/sourceEngine';
import { resolveVideoPreloadMode } from '../utils/batterySaver';
import { fetchAniSkipIntervals, SkipInterval } from '../services/aniskip';
import { clampSeekTarget, formatPlayerTime } from '../utils/detailsLayout';
import { tryResolveApiUrl } from '../utils/backendConfig';
import {
  AudioLanguageCode,
  AudioLanguageOption,
  buildHlsQualityOptions,
  buildSelectableAudioOptions,
  buildSubtitleBoxCssProps,
  clampAutoSkipDestination,
  clampEpisodeIndex,
  computeFullscreenRotationStage,
  findActiveSubtitleCue,
  formatScrubberPercent,
  getCommentsScopeKey,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
  getManualSkipInterval,
  getNextVideoFitMode,
  getVideoFitBadgeLabel,
  getVideoFitClass,
  HlsQualityOption,
  isAutoSkipEligible,
  parseSubtitleText,
  PLAYBACK_SPEED_OPTIONS,
  resolveAudioLanguageOption,
  resolveAvailableAudioOptions,
  resolveBatterySaverHlsLevel,
  resolvePersistedSubtitleLang,
  resolvePreferredVideoServer,
  shouldAutoMatchAudioForServerChange,
  shouldAutoStartPlayback,
  shouldHideBarsForOverlay,
  shouldShowFullscreenControls,
  SubtitleCue,
} from '../utils/inlinePlayer';
import {
  computeSwipeSeekTarget,
  computeSwipeVerticalLevel,
  detectPlayerGestureKind,
  formatSignedSeekDelta,
  GESTURE_GUIDE_DURATION_MS,
  GESTURE_GUIDE_ITEMS,
  mapStageGestureCoordinates,
  PlayerGestureKind,
  shouldTriggerGestureGuide,
} from '../utils/playerGestures';
import {
  canUseNativePictureInPicture,
  resolveInlinePipHandoff,
  shouldAutoEnterPipOnLeave,
} from '../utils/pipPlayer';
import { PlayerEpisodeDrawer } from './PlayerEpisodeDrawer';
import { PlayerSettingsPopover } from './PlayerSettingsPopover';
import { PlayerCommentsModal } from './PlayerCommentsModal';
import { SubtitleFormattedText } from './SubtitleFormattedText';
import {
  CreateWatchRoomModal,
  CreateWatchRoomPayload,
} from './CreateWatchRoomModal';
import {
  FloatingEmojiItem,
  shouldApplyRemoteSeek,
  WatchPartySyncPayload,
} from '../utils/watchParty';
import {
  EpisodeChangeDirection,
  getEpisodeBadgeTransitionClass,
  getEpisodeChangeDirection,
} from '../utils/detailsMotion';
import { shouldUseExtensionEpisodesForSelection } from '../utils/streamResolverUtils';
import { loadPersistedExtensionDiagnostics } from '../utils/extensionDiagnostics';
import {
  buildPlayableFailoverQueue,
  FailoverAttemptRecord,
  findNextDistinctMirrorIndex,
  formatFailoverAttemptSummary,
} from '../utils/sourceFailover';

const ScreenRotateIcon: React.FC<{ className?: string }> = ({ className = 'w-4 h-4' }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M9 3.5a8.5 8.5 0 0 1 11.4 6.2" />
    <path d="M21 6.5v3.5h-3.5" />
    <path d="M15 20.5a8.5 8.5 0 0 1-11.4-6.2" />
    <path d="M3 17.5V14h3.5" />
    <rect
      x="8.25"
      y="5.75"
      width="7.5"
      height="12.5"
      rx="1.6"
      transform="rotate(-38 12 12)"
    />
  </svg>
);

export interface InlineWatchPartyMode {
  isHost: boolean;
  viewerCount: number;
  remoteSyncSignal?: { seq: number; currentTime: number; isPlaying: boolean } | null;
  onPlaybackSync?: (payload: WatchPartySyncPayload) => void;
  reactions?: FloatingEmojiItem[];
  showReactions?: boolean;
  hideBottomControlsBar?: boolean;
}

interface InlineAnimePlayerProps {
  media: UnifiedMedia;
  episodes: UnifiedEpisode[];
  episodeIndex: number;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  availableSources?: SourceInfo[];
  overrideTitle?: string;
  selectedSourceEntry?: MatchedSourceEntry | null;
  episodesLoading?: boolean;
  episodesError?: string | null;
  playSignal?: number;
  initialTime?: number | null;
  initialResumePlaying?: boolean;
  initialSubLang?: string;
  initialEditedCuesMap?: Record<string, SubtitleCue[]>;
  watchPartyMode?: InlineWatchPartyMode;
  onChangeEpisodeIndex: (nextIndex: number) => void;
  onStreamResolved?: (stream: VideoStream | null) => void;
  onOpenSourcePicker?: () => void;
}

export const InlineAnimePlayer: React.FC<InlineAnimePlayerProps> = ({
  media,
  episodes,
  episodeIndex,
  sourceId,
  sourceName,
  sourceBaseUrl,
  sourceLang,
  availableSources,
  overrideTitle,
  selectedSourceEntry,
  episodesLoading = false,
  episodesError = null,
  playSignal = 0,
  initialTime = null,
  initialResumePlaying = false,
  initialSubLang,
  initialEditedCuesMap,
  watchPartyMode,
  onChangeEpisodeIndex,
  onStreamResolved,
  onOpenSourcePicker,
}) => {
  const navigate = useNavigate();
  const {
    state,
    updatePlayerPrefs,
    setPreferredServerForSource,
    recordHistory,
    getLibraryEntry,
    upsertLibraryEntry,
  } = useApp();
  const { pipSession, enterInAppPip, closePip, isPipActive } = usePip();

  const safeIndex = clampEpisodeIndex(episodeIndex, episodes.length);
  const currentEpisode: UnifiedEpisode = episodes[safeIndex] ?? {
    id: `${media.id}-ep-1`,
    number: 1,
    title: 'Episode 1',
    thumbnail: media.banner || media.cover || null,
    durationSeconds: (media.duration || 24) * 60,
  };

  const navState = useMemo(
    () => getEpisodeNavigationState(safeIndex, episodes.length),
    [safeIndex, episodes.length],
  );

  const [failoverSource, setFailoverSource] = useState<SourceInfo | null>(null);
  const attemptedSourceIdsRef = useRef<Set<string>>(new Set());
  const failoverAttemptsRef = useRef<FailoverAttemptRecord[]>([]);
  const handledFailureKeyRef = useRef<string>('');
  const primaryContextKey = `${media.id}::${sourceId || ''}::${selectedSourceEntry?.href || ''}::${overrideTitle || ''}`;
  const prevPrimaryContextKeyRef = useRef<string>(primaryContextKey);

  if (prevPrimaryContextKeyRef.current !== primaryContextKey) {
    prevPrimaryContextKeyRef.current = primaryContextKey;
    attemptedSourceIdsRef.current = new Set();
    failoverAttemptsRef.current = [];
    handledFailureKeyRef.current = '';
    if (failoverSource !== null) {
      setFailoverSource(null);
    }
  }

  const effectiveSourceId = failoverSource?.id ?? sourceId;
  const effectiveSourceName = failoverSource?.name ?? sourceName;
  const effectiveSourceBaseUrl = failoverSource?.baseUrl ?? sourceBaseUrl;
  const effectiveSourceLang = failoverSource?.lang ?? sourceLang;

  const rawServers = useMemo(
    () => resolveVideoServers(effectiveSourceId, effectiveSourceName),
    [effectiveSourceId, effectiveSourceName],
  );
  const desiredAudioCategory = resolveAudioLanguageOption(
    state.playerPrefs.audioLanguage,
  ).serverCategory;
  const persistedServerIdForSource = effectiveSourceId
    ? state.playerPrefs.preferredServerBySource?.[effectiveSourceId]
    : undefined;
  const [selectedServer, setSelectedServer] = useState<VideoServer>(() => {
    const initCategory = resolveAudioLanguageOption(state.playerPrefs.audioLanguage).serverCategory;
    return (
      resolvePreferredVideoServer({
        servers: rawServers,
        preferredServerId: persistedServerIdForSource,
        desiredAudioCategory: initCategory,
      }) ?? rawServers[0]
    );
  });

  useEffect(() => {
    if (rawServers.length === 0) return;
    const serverInSource = rawServers.some((s) => s.id === selectedServer?.id);
    const serverMatchesCategory = selectedServer?.category === desiredAudioCategory;
    if (!serverInSource || !serverMatchesCategory) {
      const nextSrv = resolvePreferredVideoServer({
        servers: rawServers,
        preferredServerId: persistedServerIdForSource,
        desiredAudioCategory,
      });
      if (nextSrv && nextSrv.id !== selectedServer?.id) {
        setSelectedServer(nextSrv);
      }
    }
  }, [
    rawServers,
    desiredAudioCategory,
    persistedServerIdForSource,
    selectedServer?.id,
    selectedServer?.category,
  ]);

  const [stream, setStream] = useState<VideoStream | null>(null);
  const [streamLoading, setStreamLoading] = useState(true);
  const [isBuffering, setIsBuffering] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamRetryNonce, setStreamRetryNonce] = useState(0);
  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [fetchedCuesMap, setFetchedCuesMap] = useState<Record<string, SubtitleCue[]>>({});
  const onStreamResolvedRef = useRef(onStreamResolved);
  onStreamResolvedRef.current = onStreamResolved;

  const prevEpisodeIdForAttemptsRef = useRef<string>(currentEpisode.id);
  if (prevEpisodeIdForAttemptsRef.current !== currentEpisode.id) {
    prevEpisodeIdForAttemptsRef.current = currentEpisode.id;
    attemptedSourceIdsRef.current = new Set();
    failoverAttemptsRef.current = [];
    handledFailureKeyRef.current = '';
  }

  const tryAdvanceFailoverSource = (failedReason: string): boolean => {
    const currentId = effectiveSourceId || 'shonenx-hls-inbuilt';
    const currentLabel = effectiveSourceName || currentId;
    attemptedSourceIdsRef.current.add(currentId);
    if (!failoverAttemptsRef.current.some((a) => a.sourceId === currentId)) {
      failoverAttemptsRef.current.push({
        sourceId: currentId,
        sourceName: currentLabel,
        error: failedReason,
      });
    }

    if (
      selectedSourceEntry ||
      !Array.isArray(availableSources) ||
      availableSources.length <= 1
    ) {
      return false;
    }

    const queue = buildPlayableFailoverQueue({
      currentSourceId: currentId,
      availableSources,
      attemptedSourceIds: attemptedSourceIdsRef.current,
      diagnosticsBySourceId: loadPersistedExtensionDiagnostics(),
      mediaType: media.type,
    });

    if (queue.length > 0) {
      setFailoverSource(queue[0]);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const waitingForMatchedExtensionEpisodes =
      shouldUseExtensionEpisodesForSelection({
        sourceId: effectiveSourceId,
        selectedSourceEntry,
      }) && episodes.length === 0;

    if (waitingForMatchedExtensionEpisodes) {
      setStream(null);
      onStreamResolvedRef.current?.(null);
      setIsBuffering(false);
      setAutoplayBlocked(false);
      setMirrorIndex(0);
      setHasVideoFrame(false);
      setPlaying(false);
      if (episodesLoading) {
        setStreamLoading(true);
        setStreamError(null);
      } else {
        setStreamLoading(false);
        setStreamError(
          episodesError ||
            `No episodes are available for "${selectedSourceEntry?.title || 'this title'}" on ${effectiveSourceName || effectiveSourceId || 'this source'}.`,
        );
      }
      return;
    }

    const controller = new AbortController();
    const matchedServerForAudio =
      rawServers.find(
        (s) => s.id === selectedServer?.id && s.category === desiredAudioCategory,
      ) ??
      rawServers.find((s) => s.category === desiredAudioCategory) ??
      selectedServer ??
      rawServers[0];

    setStream(null);
    onStreamResolvedRef.current?.(null);
    setStreamLoading(true);
    setIsBuffering(false);
    setAutoplayBlocked(false);
    setStreamError(null);
    setMirrorIndex(0);
    setHasVideoFrame(false);
    setPlaying(false);
    setCurrentTime(pendingStartTimeRef.current ?? 0);
    setDuration(0);
    handledFailureKeyRef.current = '';

    resolveVideoStreamAsync({
      media,
      episode: currentEpisode,
      server: matchedServerForAudio,
      sourceId: effectiveSourceId,
      sourceName: effectiveSourceName,
      sourceBaseUrl: effectiveSourceBaseUrl,
      sourceLang: effectiveSourceLang,
      audioLanguage: state.playerPrefs.audioLanguage,
      overrideTitle,
      selectedSourceEntry,
      bypassCache: streamRetryNonce > 0,
      signal: controller.signal,
    })
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setStream(resolved);
        onStreamResolvedRef.current?.(resolved);
        setStreamLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const errMsg =
          err instanceof Error ? err.message : 'Unable to resolve an active episode stream.';
        setStream(null);
        onStreamResolvedRef.current?.(null);
        if (tryAdvanceFailoverSource(errMsg)) {
          return;
        }
        setStreamLoading(false);
        setStreamError(formatFailoverAttemptSummary(failoverAttemptsRef.current));
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    media.id,
    episodes.length,
    episodesLoading,
    episodesError,
    currentEpisode.id,
    currentEpisode.number,
    currentEpisode.sourceId,
    currentEpisode.sourceEpisodeId,
    currentEpisode.episodeUrl,
    currentEpisode.sourceAnimeHref,
    currentEpisode.sourceAnimeSlug,
    selectedServer?.id,
    effectiveSourceId,
    effectiveSourceName,
    effectiveSourceBaseUrl,
    effectiveSourceLang,
    state.playerPrefs.audioLanguage,
    overrideTitle,
    selectedSourceEntry?.sourceId,
    selectedSourceEntry?.href,
    selectedSourceEntry?.slug,
    selectedSourceEntry?.title,
    streamRetryNonce,
  ]);

  const activeMirror = stream?.mirrors?.[mirrorIndex] ?? null;
  const rawStreamUrl = activeMirror?.url || stream?.url || '';
  const activeStreamUrl = rawStreamUrl.startsWith('/api/')
    ? tryResolveApiUrl(rawStreamUrl) || ''
    : rawStreamUrl;
  const activeStreamIsHls = activeMirror ? activeMirror.isHls : Boolean(stream?.isHls);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const ambientCanvasRef = useRef<HTMLCanvasElement>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const lockTimerRef = useRef<number | null>(null);
  const hudHideTimerRef = useRef<number | null>(null);
  const tapToggleTimerRef = useRef<number | null>(null);
  const gestureGuideTimerRef = useRef<number | null>(null);
  const gestureGuideShownRef = useRef(false);
  const suppressNextClickRef = useRef(false);
  const lastPointerTapAtRef = useRef(0);
  const lastEmptyTapAtRef = useRef(0);
  const prevPlaySignalRef = useRef(0);
  const mountedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const handledPipExitRef = useRef(false);
  const pendingStartTimeRef = useRef<number | null>(
    typeof initialTime === 'number' && initialTime > 0 ? initialTime : null,
  );
  const pendingResumePlayRef = useRef<boolean>(Boolean(initialResumePlaying));
  const pipConsumedOnMountRef = useRef(false);
  const isApplyingRemoteSyncRef = useRef(false);
  const lastAppliedSyncSeqRef = useRef<number>(0);
  const lastDoubleTapAtRef = useRef<number>(0);
  const lastAutoSkippedRef = useRef<string>('');
  const lastHistorySavedAtRef = useRef<number>(0);
  const attemptAutoSkipRef = useRef<(videoEl: HTMLVideoElement | null, rawTime?: number) => void>(
    () => {},
  );

  const ambientEnabled = state.playerPrefs.ambientGlow;
  const effectiveAmbientEnabled = ambientEnabled && !state.playerPrefs.batterySaver;
  const availableAudioOptions = useMemo(
    () => resolveAvailableAudioOptions(stream?.availableAudios),
    [stream?.availableAudios],
  );
  const selectableAudioOptions = useMemo(
    () => buildSelectableAudioOptions(stream?.availableAudios, sourceLang),
    [stream?.availableAudios, sourceLang],
  );
  const hasDubAudio = availableAudioOptions.some((a) => a.serverCategory === 'dub');
  const availableServers = useMemo(() => {
    if (!stream) return rawServers;
    const filtered = rawServers.filter(
      (s) => s.category !== 'dub' || hasDubAudio || desiredAudioCategory === 'dub',
    );
    return filtered.length > 0 ? filtered : rawServers;
  }, [rawServers, stream, hasDubAudio, desiredAudioCategory]);
  const activeAudioLangOption = resolveAudioLanguageOption(
    state.playerPrefs.audioLanguage,
    selectableAudioOptions,
  );
  const [playing, setPlaying] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [activeSubLang, setActiveSubLang] = useState<string>(() =>
    resolvePersistedSubtitleLang(initialSubLang, state.playerPrefs.subtitleLanguage),
  );
  const [editedCuesMap, setEditedCuesMap] = useState<Record<string, SubtitleCue[]>>(
    initialEditedCuesMap ?? {},
  );
  const [hlsQualityOptions, setHlsQualityOptions] = useState<HlsQualityOption[]>([
    { index: -1, label: 'Auto' },
  ]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);
  const [showCreateWatchPartyModal, setShowCreateWatchPartyModal] = useState(false);

  const [showControls, setShowControls] = useState(true);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isCssFullscreen, setIsCssFullscreen] = useState(false);
  const wantsFullscreenRef = useRef(false);
  const isFullscreen = isNativeFullscreen || isCssFullscreen;
  const [isLandscapeRotated, setIsLandscapeRotated] = useState(false);
  const [nativeOrientationLandscape, setNativeOrientationLandscape] = useState(false);
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 844,
  }));
  const [isScreenLocked, setIsScreenLocked] = useState(false);
  const [lockOverlayVisible, setLockOverlayVisible] = useState(false);
  const [showAudioLangMenu, setShowAudioLangMenu] = useState(false);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [gestureSeekState, setGestureSeekState] = useState<{
    targetTime: number;
    deltaSeconds: number;
  } | null>(null);
  const [volumeHudVisible, setVolumeHudVisible] = useState(false);
  const [brightnessHudVisible, setBrightnessHudVisible] = useState(false);
  const [gestureGuideVisible, setGestureGuideVisible] = useState(false);
  const gestureSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    rectLeft: number;
    rectTop: number;
    rectWidth: number;
    rectHeight: number;
    startTime: number;
    startVolume: number;
    startBrightness: number;
    lockedKind: PlayerGestureKind;
    hasMoved: boolean;
    startedAt: number;
  } | null>(null);
  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right'; seq: number } | null>(
    null,
  );
  const seekSeqRef = useRef(0);
  const prevEpIndexRef = useRef(safeIndex);
  const [epTransitionDir, setEpTransitionDir] = useState<EpisodeChangeDirection>('none');
  useEffect(() => {
    if (prevEpIndexRef.current !== safeIndex) {
      setEpTransitionDir(getEpisodeChangeDirection(prevEpIndexRef.current, safeIndex));
      prevEpIndexRef.current = safeIndex;
    }
  }, [safeIndex]);
  const epBadgeAnimClass = getEpisodeBadgeTransitionClass(epTransitionDir);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  const autoPlay = state.playerPrefs.autoPlay;
  const autoNext = state.playerPrefs.autoNextEpisode;
  const autoSkip = state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd;
  const fitMode = state.playerPrefs.videoFit || 'contain';
  const subtitlesOn = state.playerPrefs.subtitleEnabled;

  const scheduleHideControls = (currentlyPlaying = playing) => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (
      currentlyPlaying &&
      !showAudioLangMenu &&
      !showCommentsModal &&
      !showSettingsMenu &&
      !showEpisodeDrawer &&
      !showSpeedMenu &&
      !showCreateWatchPartyModal
    ) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 4800);
    }
  };

  useEffect(() => {
    if (!stream || !selectedServer) return;
    if (desiredAudioCategory === 'sub' && selectedServer.category === 'dub' && !hasDubAudio) {
      const subServer = availableServers.find((s) => s.category === 'sub') ?? availableServers[0];
      if (subServer && subServer.id !== selectedServer.id) {
        setSelectedServer(subServer);
      }
    }
  }, [stream, desiredAudioCategory, hasDubAudio, selectedServer, availableServers]);

  const handleSelectAudioOption = (opt: AudioLanguageOption) => {
    updatePlayerPrefs({ audioLanguage: opt.code as AudioLanguageCode });
    const matchingServer = resolvePreferredVideoServer({
      servers: availableServers,
      preferredServerId: persistedServerIdForSource,
      desiredAudioCategory: opt.serverCategory,
    });
    if (matchingServer && matchingServer.id !== selectedServer?.id) {
      setSelectedServer(matchingServer);
    }
  };

  const handleSelectServer = (srv: VideoServer) => {
    setSelectedServer(srv);
    if (sourceId) {
      setPreferredServerForSource(sourceId, srv.id);
    }
    updatePlayerPrefs({
      audioLanguage: shouldAutoMatchAudioForServerChange(
        state.playerPrefs.audioLanguage,
        srv.category,
      ),
    });
  };

  useEffect(() => {
    const onFsChange = () => {
      const active = Boolean(document.fullscreenElement);
      if (active && !wantsFullscreenRef.current) {
        setIsNativeFullscreen(false);
        document.exitFullscreen().catch(() => {});
        return;
      }
      setIsNativeFullscreen(active);
      if (!active && !wantsFullscreenRef.current) {
        setIsCssFullscreen(false);
        setIsLandscapeRotated(false);
        setNativeOrientationLandscape(false);
        setIsScreenLocked(false);
        setShowAudioLangMenu(false);
        setShowCommentsModal(false);
        setShowSpeedMenu(false);
        setShowCreateWatchPartyModal(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  useEffect(() => {
    if (!isFullscreen) return;
    const syncViewport = () => {
      const w = Math.round(window.visualViewport?.width || window.innerWidth || 390);
      const h = Math.round(window.visualViewport?.height || window.innerHeight || 844);
      setViewportSize({ width: w, height: h });
      const orientType = window.screen?.orientation?.type || '';
      setNativeOrientationLandscape(Boolean(orientType.startsWith('landscape') && w > h));
    };
    syncViewport();
    window.addEventListener('resize', syncViewport);
    window.addEventListener('orientationchange', syncViewport);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', syncViewport);
    const ro =
      typeof ResizeObserver !== 'undefined' && playerContainerRef.current
        ? new ResizeObserver(() => syncViewport())
        : null;
    if (ro && playerContainerRef.current) {
      ro.observe(playerContainerRef.current);
    }
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isScreenLocked) {
        if (showCreateWatchPartyModal) {
          setShowCreateWatchPartyModal(false);
          return;
        }
        if (showCommentsModal) {
          setShowCommentsModal(false);
          return;
        }
        if (showAudioLangMenu) {
          setShowAudioLangMenu(false);
          return;
        }
        if (showSpeedMenu) {
          setShowSpeedMenu(false);
          return;
        }
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
        setIsNativeFullscreen(false);
        setIsCssFullscreen(false);
        setIsLandscapeRotated(false);
        setNativeOrientationLandscape(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('resize', syncViewport);
      window.removeEventListener('orientationchange', syncViewport);
      vv?.removeEventListener('resize', syncViewport);
      ro?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    isFullscreen,
    isScreenLocked,
    showCommentsModal,
    showAudioLangMenu,
    showSpeedMenu,
    showCreateWatchPartyModal,
  ]);

  // Cleanup timers & native fullscreen on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
      if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
      if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);
      if (tapToggleTimerRef.current) window.clearTimeout(tapToggleTimerRef.current);
      if (gestureGuideTimerRef.current) window.clearTimeout(gestureGuideTimerRef.current);
      if (wantsFullscreenRef.current && document.fullscreenElement) {
        wantsFullscreenRef.current = false;
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  // Hand off from active floating PiP cleanly when returning to Watch tab
  useEffect(() => {
    if (pipSession && !pipConsumedOnMountRef.current) {
      pipConsumedOnMountRef.current = true;
      const handoff = resolveInlinePipHandoff(pipSession, media.id, currentEpisode.number);
      if (handoff.restoreTime !== null) {
        pendingStartTimeRef.current = handoff.restoreTime;
      }
      pendingResumePlayRef.current = handoff.resumePlaying;
      if (handoff.shouldClosePip) {
        closePip();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load HLS or MP4 video stream
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeStreamUrl) {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (video) {
        if (!video.paused) video.pause();
        if (video.getAttribute('src')) {
          video.removeAttribute('src');
          video.load();
        }
      }
      return;
    }

    let cancelled = false;
    const resumeAt = pendingStartTimeRef.current;
    const resumePlay = pendingResumePlayRef.current;

    setHasVideoFrame(false);
    setIsBuffering(false);
    setAutoplayBlocked(false);
    setCurrentTime(resumeAt ?? 0);
    setDuration(0);
    setPlaying(false);
    setHlsQualityOptions([{ index: -1, label: 'Auto' }]);
    setSelectedHlsLevel(-1);

    const isNewExplicitTrigger = playSignal > prevPlaySignalRef.current;
    prevPlaySignalRef.current = playSignal;
    const shouldStart =
      !isPipActive() && shouldAutoStartPlayback(autoPlay, isNewExplicitTrigger || resumePlay);
    video.autoplay = false;

    const applyInitialStreamState = () => {
      if (cancelled) return;
      if (pendingStartTimeRef.current === resumeAt) {
        pendingStartTimeRef.current = null;
        pendingResumePlayRef.current = false;
      }
      if (resumeAt && resumeAt > 0.5) {
        try {
          video.currentTime = resumeAt;
        } catch {
          // Ignore seek errors before ready
        }
      }
      video.playbackRate = speed;
      if (shouldStart) {
        video.play().catch(() => {
          if (!cancelled) {
            setAutoplayBlocked(true);
            setIsBuffering(false);
          }
        });
      } else if (!video.paused) {
        video.pause();
      }
    };

    const advanceMirrorOrError = (reason: string) => {
      if (cancelled) return;
      const failKey = `${effectiveSourceId || ''}:${currentEpisode.id}:${mirrorIndex}:${streamRetryNonce}`;
      if (handledFailureKeyRef.current === failKey) return;
      handledFailureKeyRef.current = failKey;

      const nextMirrorIdx = findNextDistinctMirrorIndex(
        stream?.mirrors,
        mirrorIndex,
        rawStreamUrl,
      );
      if (nextMirrorIdx >= 0) {
        setMirrorIndex(nextMirrorIdx);
      } else if (!tryAdvanceFailoverSource(reason)) {
        setStreamError(formatFailoverAttemptSummary(failoverAttemptsRef.current));
      }
    };

    let hls: Hls | null = null;
    if (activeStreamIsHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeStreamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (!hls || cancelled) return;
        const options = buildHlsQualityOptions(hls.levels);
        setHlsQualityOptions(options);
        const preferredLevel = resolveBatterySaverHlsLevel(
          hls.levels,
          state.playerPrefs.defaultQuality,
          state.playerPrefs.batterySaver,
        );
        hls.currentLevel = preferredLevel;
        setSelectedHlsLevel(preferredLevel);
        applyInitialStreamState();
      });
      let recoveredMedia = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal || cancelled) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia && hls) {
          recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        advanceMirrorOrError('Stream mirror failed to buffer. Try retrying or switching server.');
      });
    } else {
      hlsRef.current = null;
      video.src = activeStreamUrl;
      video.addEventListener('loadedmetadata', applyInitialStreamState, { once: true });
      if (video.readyState >= 1) {
        applyInitialStreamState();
      }
    }

    return () => {
      cancelled = true;
      video.removeEventListener('loadedmetadata', applyInitialStreamState);
      if (hls) hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStreamUrl, activeStreamIsHls, currentEpisode.id]);

  // Respond to explicit play triggers (e.g., episode click or Start Watching CTA while already mounted)
  useEffect(() => {
    if (playSignal <= 0 || playSignal <= prevPlaySignalRef.current) return;
    prevPlaySignalRef.current = playSignal;
    pendingResumePlayRef.current = true;
    const video = videoRef.current;
    if (!video || !activeStreamUrl) return;
    video.play().catch(() => {});
    scheduleHideControls(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playSignal]);

  // Apply incoming Watch Together live sync state
  useEffect(() => {
    const signal = watchPartyMode?.remoteSyncSignal;
    if (!signal || signal.seq === lastAppliedSyncSeqRef.current) return;
    lastAppliedSyncSeqRef.current = signal.seq;

    const v = videoRef.current;
    isApplyingRemoteSyncRef.current = true;
    if (!v || v.readyState === 0) {
      pendingStartTimeRef.current = signal.currentTime;
      pendingResumePlayRef.current = signal.isPlaying;
    } else {
      if (shouldApplyRemoteSeek(v.currentTime || 0, signal.currentTime)) {
        try {
          v.currentTime = signal.currentTime;
          setCurrentTime(signal.currentTime);
        } catch {
          // Ignore seek errors before ready
        }
      }
      if (signal.isPlaying && v.paused) {
        v.play().catch(() => {});
      } else if (!signal.isPlaying && !v.paused) {
        v.pause();
      }
    }
    const clearTimer = window.setTimeout(() => {
      isApplyingRemoteSyncRef.current = false;
    }, 350);
    return () => window.clearTimeout(clearTimer);
  }, [watchPartyMode?.remoteSyncSignal]);

  // Sync playback rate & muted state
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      videoRef.current.muted = muted;
    }
  }, [speed, muted]);

  // Fetch AniSkip intervals for current episode
  useEffect(() => {
    setSkipIntervals([]);
    fetchAniSkipIntervals(media.idMal, currentEpisode.number).then(setSkipIntervals);
  }, [media.idMal, currentEpisode.number]);

  // Dynamically apply Battery Saver 480p stream cap or preferred quality changes on active HLS streams
  useEffect(() => {
    const hls = hlsRef.current;
    if (!hls || !hls.levels || hls.levels.length === 0) return;
    const nextLevel = resolveBatterySaverHlsLevel(
      hls.levels,
      state.playerPrefs.defaultQuality,
      state.playerPrefs.batterySaver,
    );
    if (hls.currentLevel !== nextLevel) {
      hls.currentLevel = nextLevel;
    }
    setSelectedHlsLevel(nextLevel);
  }, [state.playerPrefs.batterySaver, state.playerPrefs.defaultQuality]);

  // Subtle ambient background glow sampled from active playing frames (paused in fullscreen or Battery Saver)
  useEffect(() => {
    if (!effectiveAmbientEnabled || !playing || isFullscreen) return;
    let rafId = 0;
    let lastSample = 0;

    const sampleAmbient = (ts: number) => {
      if (ts - lastSample >= 120) {
        lastSample = ts;
        const video = videoRef.current;
        const canvas = ambientCanvasRef.current;
        if (video && canvas && video.readyState >= 2) {
          const ctx = canvas.getContext('2d');
          if (ctx) {
            try {
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            } catch {
              // Cross-origin video without CORS ACAO falls back to blurred poster/thumbnail aura
            }
          }
        }
      }
      rafId = window.requestAnimationFrame(sampleAmbient);
    };

    rafId = window.requestAnimationFrame(sampleAmbient);
    return () => window.cancelAnimationFrame(rafId);
  }, [effectiveAmbientEnabled, playing, isFullscreen]);

  // Record Watch History & advance progress when playing or pausing an episode
  const persistPlaybackHistory = (posSeconds: number, durSeconds: number) => {
    lastHistorySavedAtRef.current = Date.now();
    recordHistory({
      mediaId: media.id,
      mediaType: media.type,
      media,
      episodeNumber: currentEpisode.number,
      episodeTitle: currentEpisode.title,
      positionSeconds: Math.max(0, Math.floor(posSeconds)),
      durationSeconds: Math.floor(
        getEffectiveDurationSeconds(durSeconds, currentEpisode.durationSeconds, media.duration),
      ),
    });

    const existing = getLibraryEntry(media.id);
    if (existing && currentEpisode.number > existing.progress) {
      void upsertLibraryEntry(
        media,
        existing.status,
        currentEpisode.number,
        existing.score,
        existing.notes,
      );
    }
  };

  useEffect(() => {
    if (!playing) return;
    persistPlaybackHistory(videoRef.current?.currentTime ?? currentTime, duration);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, currentEpisode.number]);

  useEffect(() => {
    if (!playing) return;
    if (Date.now() - lastHistorySavedAtRef.current >= 10000) {
      persistPlaybackHistory(currentTime, duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, Math.floor(currentTime / 10)]);

  const mergedSkipIntervals = useMemo<SkipInterval[]>(() => {
    const base = [...skipIntervals];
    if (
      stream?.intro &&
      stream.intro.end > stream.intro.start &&
      !base.some((s) => s.skipType === 'op')
    ) {
      base.push({
        skipId: 'stream-intro',
        skipType: 'op',
        startTime: stream.intro.start,
        endTime: stream.intro.end,
      });
    }
    if (
      stream?.outro &&
      stream.outro.end > stream.outro.start &&
      !base.some((s) => s.skipType === 'ed')
    ) {
      base.push({
        skipId: 'stream-outro',
        skipType: 'ed',
        startTime: stream.outro.start,
        endTime: stream.outro.end,
      });
    }
    return base;
  }, [skipIntervals, stream?.intro, stream?.outro]);

  // Auto-skip OP/Recap/ED reliably (including intervals starting at 0s or arriving after metadata)
  useEffect(() => {
    lastAutoSkippedRef.current = '';
  }, [currentEpisode.id, state.playerPrefs.autoSkipOp, state.playerPrefs.autoSkipEd]);

  const attemptAutoSkip = (videoEl: HTMLVideoElement | null, rawTime?: number) => {
    if (!videoEl || videoEl.readyState < 1) return;
    const t =
      typeof rawTime === 'number' && Number.isFinite(rawTime)
        ? rawTime
        : videoEl.currentTime || 0;
    const matched = mergedSkipIntervals.find(
      (s) =>
        isAutoSkipEligible(s.skipType, {
          autoSkipOp: state.playerPrefs.autoSkipOp,
          autoSkipEd: state.playerPrefs.autoSkipEd,
        }) &&
        t >= s.startTime &&
        t < s.endTime - 0.5,
    );
    if (!matched) return;
    const key = `${currentEpisode.id}:${matched.skipType}:${matched.startTime}:${matched.endTime}`;
    if (lastAutoSkippedRef.current === key) return;
    const dest = clampAutoSkipDestination(matched.endTime, videoEl.duration || duration);
    if (dest > t + 0.25) {
      lastAutoSkippedRef.current = key;
      try {
        videoEl.currentTime = dest;
        setCurrentTime(dest);
        emitWatchPartySync('seek', dest, !videoEl.paused);
      } catch {
        // Ignore seek errors before ready
      }
    }
  };
  attemptAutoSkipRef.current = attemptAutoSkip;

  useEffect(() => {
    attemptAutoSkipRef.current(videoRef.current);
  }, [mergedSkipIntervals, state.playerPrefs.autoSkipOp, state.playerPrefs.autoSkipEd]);

  // High-frequency time sync while playing so subtitles match audio frame-accurately & auto-skip triggers immediately
  useEffect(() => {
    if (!playing) return;
    let rafId = 0;
    let lastSyncAt = 0;
    const tick = (now: number) => {
      const v = videoRef.current;
      if (v && !v.paused && !v.ended) {
        const liveTime = v.currentTime || 0;
        attemptAutoSkipRef.current(v, liveTime);
        const intervalMs = state.playerPrefs.batterySaver ? 75 : 30;
        if (now - lastSyncAt >= intervalMs) {
          lastSyncAt = now;
          setCurrentTime(liveTime);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing, state.playerPrefs.batterySaver]);

  const activeSkip = getManualSkipInterval(currentTime, mergedSkipIntervals, {
    autoSkipOp: state.playerPrefs.autoSkipOp,
    autoSkipEd: state.playerPrefs.autoSkipEd,
  });

  const trackKey = `${currentEpisode.id}:${activeSubLang}`;
  const activeTrack =
    stream?.subtitles?.find((s) => s.lang === activeSubLang) ??
    (activeSubLang === 'en' ? stream?.subtitles?.[0] : undefined);
  const activeTrackUrl = activeTrack?.url
    ? activeTrack.url.startsWith('/api/')
      ? tryResolveApiUrl(activeTrack.url) ?? undefined
      : activeTrack.url
    : undefined;
  const activeTrackLangKey = activeTrack ? `${currentEpisode.id}:${activeTrack.lang}` : trackKey;

  useEffect(() => {
    if (!activeTrackUrl) return;
    if (activeTrack?.cues && activeTrack.cues.length > 0) return;
    if (fetchedCuesMap[activeTrackLangKey]) return;

    let cancelled = false;
    fetch(activeTrackUrl)
      .then(async (res) => {
        if (!res.ok) return '';
        const ct = (res.headers.get('content-type') || '').toLowerCase();
        if (ct.includes('text/html')) return '';
        const text = await res.text();
        return /^<!doctype\s+html|^<html[\s>]/i.test(text.trimStart()) ? '' : text;
      })
      .then((rawText) => {
        if (cancelled || !rawText.trim()) return;
        const parsed = parseSubtitleText(rawText);
        if (parsed.length > 0) {
          setFetchedCuesMap((prev) => ({ ...prev, [activeTrackLangKey]: parsed }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [activeTrackUrl, activeTrack?.cues, activeTrackLangKey, fetchedCuesMap]);

  const effectiveCues: SubtitleCue[] = useMemo(() => {
    if (editedCuesMap[trackKey]) return editedCuesMap[trackKey];
    if (activeTrack?.cues && activeTrack.cues.length > 0) return activeTrack.cues;
    if (fetchedCuesMap[activeTrackLangKey]) return fetchedCuesMap[activeTrackLangKey];
    return [];
  }, [editedCuesMap, trackKey, activeTrack, fetchedCuesMap, activeTrackLangKey]);

  const activeCue = subtitlesOn
    ? findActiveSubtitleCue(
        effectiveCues,
        currentTime,
        state.playerPrefs.subtitleOffsetSeconds || 0,
      )
    : null;

  const triggerSeekFeedback = (delta: number) => {
    const label = delta > 0 ? `+${delta}s` : `${delta}s`;
    const side: 'left' | 'right' = delta < 0 ? 'left' : 'right';
    seekSeqRef.current += 1;
    setSeekBadge({ label, side, seq: seekSeqRef.current });
    if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = window.setTimeout(() => setSeekBadge(null), 650);
  };

  const emitWatchPartySync = (
    action: WatchPartySyncPayload['action'],
    nextTime: number,
    nextPlaying: boolean,
  ) => {
    if (!watchPartyMode?.onPlaybackSync || isApplyingRemoteSyncRef.current) return;
    watchPartyMode.onPlaybackSync({
      action,
      currentTime: nextTime,
      isPlaying: nextPlaying,
      episodeNumber: currentEpisode.number,
      episodeTitle: currentEpisode.title,
    });
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (pipSession) closePip();
      v.play().catch(() => {});
      scheduleHideControls(true);
      emitWatchPartySync('play', v.currentTime || 0, true);
    } else {
      v.pause();
      scheduleHideControls(false);
      emitWatchPartySync('pause', v.currentTime || 0, false);
    }
  };

  // Keep inline video paused if an in-app PiP session is active
  useEffect(() => {
    if (pipSession && videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
    }
  }, [pipSession]);

  const latestInlineSnapshotRef = useRef({
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    safeIndex,
    sourceId,
    sourceName,
    sourceBaseUrl,
    sourceLang,
    overrideTitle,
    serverId: selectedServer?.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    activeSubLang,
    editedCuesMap,
  });
  latestInlineSnapshotRef.current = {
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    safeIndex,
    sourceId,
    sourceName,
    sourceBaseUrl,
    sourceLang,
    overrideTitle,
    serverId: selectedServer?.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    activeSubLang,
    editedCuesMap,
  };

  // Auto-enter PiP if user leaves Watch view / DetailsPage while inline video is actively playing
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) -
        mountedAtRef.current;
      if (elapsed < 250 || isPipActive()) return;
      const snap = latestInlineSnapshotRef.current;
      const v = videoEl ?? videoRef.current;
      const isActivelyPlaying = snap.playing || Boolean(v && !v.paused && !v.ended);
      if (
        !shouldAutoEnterPipOnLeave({
          enabled: snap.autoPip,
          isPlaying: isActivelyPlaying,
          ended: Boolean(v?.ended),
          alreadyHandled: handledPipExitRef.current,
        })
      ) {
        return;
      }
      handledPipExitRef.current = true;
      const ep = snap.episodes[snap.safeIndex] ?? snap.episodes[0];
      const liveTime = v?.currentTime ?? snap.currentTime;
      const liveDur = getEffectiveDurationSeconds(
        v?.duration || snap.duration,
        ep?.durationSeconds,
        snap.media.duration,
      );
      if (v && !v.paused) {
        v.pause();
      }
      enterInAppPip({
        media: snap.media,
        episodes: snap.episodes,
        episodeIndex: snap.safeIndex,
        sourceId: snap.sourceId,
        sourceName: snap.sourceName,
        sourceBaseUrl: snap.sourceBaseUrl,
        sourceLang: snap.sourceLang,
        overrideTitle: snap.overrideTitle,
        serverId: snap.serverId,
        currentTime: liveTime,
        duration: liveDur,
        playing: true,
        speed: snap.speed,
        muted: snap.muted,
        volume: v?.volume ?? 1,
        activeSubLang: snap.activeSubLang,
        editedCuesMap: snap.editedCuesMap,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnterPip = () => {
    handledPipExitRef.current = true;
    const v = videoRef.current;
    const liveTime = v?.currentTime ?? currentTime;
    const liveDur = getEffectiveDurationSeconds(
      v?.duration || duration,
      currentEpisode.durationSeconds,
      media.duration,
    );
    const livePlaying = v ? !v.paused : playing;
    if (v && !v.paused) {
      v.pause();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsCssFullscreen(false);
    setIsScreenLocked(false);
    setIsLandscapeRotated(false);
    setShowAudioLangMenu(false);
    setShowCommentsModal(false);
    setShowSettingsMenu(false);
    setShowEpisodeDrawer(false);
    enterInAppPip({
      media,
      episodes,
      episodeIndex: safeIndex,
      sourceId,
      sourceName,
      sourceBaseUrl,
      sourceLang,
      overrideTitle,
      serverId: selectedServer?.id,
      currentTime: liveTime,
      duration: liveDur,
      playing: livePlaying,
      speed,
      muted,
      volume: v?.volume ?? 1,
      activeSubLang,
      editedCuesMap,
    });
  };

  const toggleNativePiP = async () => {
    const v = videoRef.current;
    if (!canUseNativePictureInPicture(document, v) || !v) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      // Ignore PiP rejection in sandboxed iframes
    }
  };

  const seekBy = (delta: number) => {
    if (isScreenLocked) return;
    const v = videoRef.current;
    if (!v) return;
    const totalDur = getEffectiveDurationSeconds(
      v.duration || duration,
      currentEpisode.durationSeconds,
      media.duration,
    );
    const next = clampSeekTarget(v.currentTime, delta, totalDur);
    v.currentTime = next;
    setCurrentTime(next);
    triggerSeekFeedback(delta);
    scheduleHideControls();
    emitWatchPartySync('seek', next, !v.paused);
  };

  const handleWatchPartyModalSubmit = (payload: CreateWatchRoomPayload) => {
    setShowCreateWatchPartyModal(false);
    if (payload.audioLanguage) {
      updatePlayerPrefs({ audioLanguage: payload.audioLanguage });
    }
    const v = videoRef.current;
    const snapTime = Math.max(0, Math.floor(v?.currentTime ?? currentTime ?? 0));
    if (v && !v.paused) {
      v.pause();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    setIsCssFullscreen(false);
    navigate('/watch-together/new', {
      state: {
        autoCreateWatchParty: {
          media: payload.media,
          episodes: payload.episodes,
          episodeIndex: payload.episodeIndex,
          track: payload.track,
          audioLanguage: payload.audioLanguage,
          roomName: payload.roomName,
          isPublic: payload.isPublic,
          userName: payload.userName,
          hostAvatar: payload.hostAvatar,
          currentTime:
            payload.media.id === media.id &&
            payload.episodes[payload.episodeIndex]?.number === currentEpisode.number
              ? snapTime
              : 0,
          isPlaying: true,
        },
      },
    });
  };

  const enterFullscreen = async () => {
    wantsFullscreenRef.current = true;
    setShowSettingsMenu(false);
    setShowEpisodeDrawer(false);
    setShowAudioLangMenu(false);
    setShowCommentsModal(false);
    setShowSpeedMenu(false);
    setIsCssFullscreen(true);
    setViewportSize({
      width: window.innerWidth,
      height: window.innerHeight,
    });
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setShowControls(true);
    try {
      if (playerContainerRef.current && !document.fullscreenElement) {
        await playerContainerRef.current.requestFullscreen();
        if (!wantsFullscreenRef.current && document.fullscreenElement) {
          await document.exitFullscreen().catch(() => {});
        }
      }
    } catch {
      // Fallback CSS cinema fullscreen remains smoothly engaged
    }
    if (wantsFullscreenRef.current && playing) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 5200);
    }
  };

  const exitFullscreen = async () => {
    wantsFullscreenRef.current = false;
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    if (tapToggleTimerRef.current) {
      window.clearTimeout(tapToggleTimerRef.current);
      tapToggleTimerRef.current = null;
    }
    setIsNativeFullscreen(false);
    setIsCssFullscreen(false);
    setIsLandscapeRotated(false);
    setNativeOrientationLandscape(false);
    setIsScreenLocked(false);
    setLockOverlayVisible(false);
    setShowAudioLangMenu(false);
    setShowCommentsModal(false);
    setShowSettingsMenu(false);
    setShowEpisodeDrawer(false);
    setShowSpeedMenu(false);
    setShowCreateWatchPartyModal(false);
    setVolumeHudVisible(false);
    setBrightnessHudVisible(false);
    setGestureSeekState(null);
    try {
      const orient = window.screen?.orientation as
        | { unlock?: () => void }
        | undefined;
      orient?.unlock?.();
    } catch {
      // Ignore unlock failures
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch {
      // Already exited
    }
  };

  const toggleFullscreen = () => {
    if (isFullscreen) {
      void exitFullscreen();
    } else {
      void enterFullscreen();
    }
  };

  const toggleRotateScreen = async () => {
    const nextRotated = !isLandscapeRotated;
    setIsLandscapeRotated(nextRotated);
    setShowSpeedMenu(false);
    scheduleHideControls();
    if (!nextRotated) {
      setNativeOrientationLandscape(false);
    }
    try {
      const orient = window.screen?.orientation as
        | { lock?: (mode: string) => Promise<void>; unlock?: () => void; type?: string }
        | undefined;
      if (nextRotated && orient?.lock) {
        await orient.lock('landscape');
        window.setTimeout(() => {
          const w = window.innerWidth;
          const h = window.innerHeight;
          const t = window.screen?.orientation?.type || '';
          setViewportSize({ width: w, height: h });
          setNativeOrientationLandscape(Boolean(t.startsWith('landscape') && w > h));
        }, 120);
      } else if (!nextRotated && orient?.unlock) {
        orient.unlock();
      }
    } catch {
      // Inner-stage 90deg CSS rotation handles rotation reliably when orientation.lock is unavailable
      setNativeOrientationLandscape(false);
    }
  };

  const triggerLockOverlay = () => {
    setLockOverlayVisible(true);
    if (lockTimerRef.current) window.clearTimeout(lockTimerRef.current);
    lockTimerRef.current = window.setTimeout(() => {
      setLockOverlayVisible(false);
    }, 2800);
  };

  const dismissGestureGuide = () => {
    if (gestureGuideTimerRef.current) {
      window.clearTimeout(gestureGuideTimerRef.current);
      gestureGuideTimerRef.current = null;
    }
    setGestureGuideVisible(false);
  };

  const triggerGestureGuide = () => {
    if (
      !shouldTriggerGestureGuide({
        alreadyShown: gestureGuideShownRef.current,
        isLocked: isScreenLocked,
        isPipActive: isPipActive(),
      })
    ) {
      return;
    }
    gestureGuideShownRef.current = true;
    setGestureGuideVisible(true);
    if (gestureGuideTimerRef.current) {
      window.clearTimeout(gestureGuideTimerRef.current);
    }
    gestureGuideTimerRef.current = window.setTimeout(() => {
      gestureGuideTimerRef.current = null;
      setGestureGuideVisible(false);
    }, GESTURE_GUIDE_DURATION_MS);
  };

  const handleToggleScreenLock = () => {
    const nextLocked = !isScreenLocked;
    setIsScreenLocked(nextLocked);
    setShowSettingsMenu(false);
    setShowEpisodeDrawer(false);
    setShowAudioLangMenu(false);
    setShowCommentsModal(false);
    setShowSpeedMenu(false);
    if (nextLocked) {
      dismissGestureGuide();
      triggerLockOverlay();
    } else {
      setLockOverlayVisible(false);
      scheduleHideControls();
    }
  };

  const flashHudHide = () => {
    if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);
    hudHideTimerRef.current = window.setTimeout(() => {
      setVolumeHudVisible(false);
      setBrightnessHudVisible(false);
      setGestureSeekState(null);
    }, 900);
  };

  const applyVolumeLevel = (nextVol: number) => {
    const clamped = Math.max(0, Math.min(1, Math.round(nextVol * 100) / 100));
    setVolume(clamped);
    setMuted(clamped === 0);
    if (videoRef.current) {
      videoRef.current.volume = clamped;
      videoRef.current.muted = clamped === 0;
    }
    setVolumeHudVisible(true);
  };

  const rotationStage = computeFullscreenRotationStage({
    isFullscreen,
    isRotated: isLandscapeRotated,
    viewportWidth: viewportSize.width,
    viewportHeight: viewportSize.height,
    nativeOrientationLandscape,
  });

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (
      isScreenLocked ||
      showAudioLangMenu ||
      showCommentsModal ||
      showSettingsMenu ||
      showEpisodeDrawer ||
      showSpeedMenu ||
      showCreateWatchPartyModal
    ) {
      return;
    }
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a, [data-no-gesture="true"]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    gestureSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width || window.innerWidth || 360,
      rectHeight: rect.height || window.innerHeight || 640,
      startTime: videoRef.current?.currentTime ?? currentTime,
      startVolume: muted ? 0 : volume,
      startBrightness: brightness,
      lockedKind: 'none',
      hasMoved: false,
      startedAt: Date.now(),
    };
    suppressNextClickRef.current = false;
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const rawDx = e.clientX - session.startX;
    const rawDy = e.clientY - session.startY;
    const { stageDx, stageDy, stageLocalX, stageWidth } = mapStageGestureCoordinates({
      dx: rawDx,
      dy: rawDy,
      clientX: e.clientX,
      clientY: e.clientY,
      rectLeft: session.rectLeft,
      rectTop: session.rectTop,
      rectWidth: session.rectWidth,
      rectHeight: session.rectHeight,
      cssRotated: rotationStage.cssRotated,
    });

    if (session.lockedKind === 'none') {
      const kind = detectPlayerGestureKind(stageDx, stageDy, stageLocalX, stageWidth);
      if (kind === 'none') return;
      if (!isFullscreen && kind !== 'seek') return;
      session.lockedKind = kind;
      session.hasMoved = true;
      suppressNextClickRef.current = true;
      dismissGestureGuide();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore capture failure
      }
    }

    if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);

    if (session.lockedKind === 'seek') {
      const effectiveDur = getEffectiveDurationSeconds(
        duration || videoRef.current?.duration || 0,
        currentEpisode.durationSeconds,
        media.duration,
      );
      const preview = computeSwipeSeekTarget(
        session.startTime,
        stageDx,
        stageWidth,
        effectiveDur,
      );
      setGestureSeekState(preview);
    } else if (session.lockedKind === 'volume') {
      const nextVol = computeSwipeVerticalLevel(session.startVolume, stageDy, 210, 0, 1);
      applyVolumeLevel(nextVol);
    } else if (session.lockedKind === 'brightness') {
      const nextBright = computeSwipeVerticalLevel(session.startBrightness, stageDy, 210, 0.25, 1);
      setBrightness(nextBright);
      setBrightnessHudVisible(true);
    }
  };

  const handleStagePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    gestureSessionRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore release failures
    }

    if (session.lockedKind === 'seek') {
      const { stageDx, stageWidth } = mapStageGestureCoordinates({
        dx: e.clientX - session.startX,
        dy: e.clientY - session.startY,
        clientX: e.clientX,
        clientY: e.clientY,
        rectLeft: session.rectLeft,
        rectTop: session.rectTop,
        rectWidth: session.rectWidth,
        rectHeight: session.rectHeight,
        cssRotated: rotationStage.cssRotated,
      });
      const effectiveDur = getEffectiveDurationSeconds(
        duration || videoRef.current?.duration || 0,
        currentEpisode.durationSeconds,
        media.duration,
      );
      const finalSeek = computeSwipeSeekTarget(
        session.startTime,
        stageDx,
        stageWidth,
        effectiveDur,
      );
      if (videoRef.current) {
        videoRef.current.currentTime = finalSeek.targetTime;
      }
      setCurrentTime(finalSeek.targetTime);
      setGestureSeekState(finalSeek);
      flashHudHide();
    } else if (session.lockedKind === 'volume' || session.lockedKind === 'brightness') {
      flashHudHide();
    }

    const rawDx = e.clientX - session.startX;
    const rawDy = e.clientY - session.startY;
    const tapDistance = Math.hypot(rawDx, rawDy);
    const tapElapsed = Date.now() - session.startedAt;

    if (session.hasMoved) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 120);
    } else if (tapDistance < 18 && tapElapsed < 480) {
      const now = Date.now();
      lastPointerTapAtRef.current = now;
      const stageRect = e.currentTarget.getBoundingClientRect();
      if (isFullscreen && now - lastEmptyTapAtRef.current < 260) {
        lastEmptyTapAtRef.current = 0;
        if (tapToggleTimerRef.current) {
          window.clearTimeout(tapToggleTimerRef.current);
          tapToggleTimerRef.current = null;
        }
        handleStageDoubleTap(e.clientX, e.clientY, stageRect);
      } else {
        lastEmptyTapAtRef.current = now;
        handleStageTap();
      }
    }
  };

  const handleStageTap = () => {
    if (suppressNextClickRef.current) return;
    if (isScreenLocked) {
      triggerLockOverlay();
      return;
    }
    if (
      showAudioLangMenu ||
      showCommentsModal ||
      showSettingsMenu ||
      showEpisodeDrawer ||
      showSpeedMenu ||
      showCreateWatchPartyModal
    ) {
      setShowAudioLangMenu(false);
      setShowCommentsModal(false);
      setShowSettingsMenu(false);
      setShowEpisodeDrawer(false);
      setShowSpeedMenu(false);
      setShowCreateWatchPartyModal(false);
      scheduleHideControls();
      return;
    }
    if (isFullscreen) {
      if (tapToggleTimerRef.current) {
        window.clearTimeout(tapToggleTimerRef.current);
        tapToggleTimerRef.current = null;
      }
      tapToggleTimerRef.current = window.setTimeout(() => {
        tapToggleTimerRef.current = null;
        setShowControls((prev) => {
          const next = !prev;
          if (hideTimerRef.current) {
            window.clearTimeout(hideTimerRef.current);
            hideTimerRef.current = null;
          }
          if (next && playing) {
            hideTimerRef.current = window.setTimeout(() => {
              setShowControls(false);
            }, 4800);
          }
          return next;
        });
      }, 210);
    } else {
      togglePlay();
    }
  };

  const handleStageDoubleTap = (clientX: number, clientY: number, rect: DOMRect) => {
    if (tapToggleTimerRef.current) {
      window.clearTimeout(tapToggleTimerRef.current);
      tapToggleTimerRef.current = null;
    }
    if (isScreenLocked) return;
    const now = Date.now();
    if (now - lastDoubleTapAtRef.current < 260) return;
    lastDoubleTapAtRef.current = now;
    const { stageLocalX, stageWidth } = mapStageGestureCoordinates({
      dx: 0,
      dy: 0,
      clientX,
      clientY,
      rectLeft: rect.left,
      rectTop: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      cssRotated: rotationStage.cssRotated,
    });
    const isLeft = stageLocalX < stageWidth / 2;
    seekBy(isLeft ? -10 : 10);
  };

  const handleSelectHlsLevel = (levelIndex: number, qualityPref?: VideoQualityPref) => {
    const hls = hlsRef.current;
    const effectiveLevel =
      state.playerPrefs.batterySaver && hls?.levels?.length
        ? resolveBatterySaverHlsLevel(hls.levels, qualityPref || state.playerPrefs.defaultQuality, true)
        : levelIndex;
    if (hls) {
      hls.currentLevel = effectiveLevel;
    }
    setSelectedHlsLevel(effectiveLevel);
    if (qualityPref && !state.playerPrefs.batterySaver) {
      updatePlayerPrefs({ defaultQuality: qualityPref });
    }
  };

  const effectiveDuration = getEffectiveDurationSeconds(
    duration,
    currentEpisode.durationSeconds,
    media.duration,
  );
  const progressPercent = formatScrubberPercent(currentTime, effectiveDuration);
  const backdropArtwork = currentEpisode.thumbnail || media.banner || media.cover || '';
  const animeTitle = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const awaitingAutoFrame =
    Boolean(activeStreamUrl) &&
    !hasVideoFrame &&
    !autoplayBlocked &&
    (autoPlay || playing || pendingResumePlayRef.current);
  const isLoadingOrBuffering = !streamError && (streamLoading || isBuffering || awaitingAutoFrame);
  const hasActiveOverlay =
    showAudioLangMenu ||
    showCommentsModal ||
    showSettingsMenu ||
    showEpisodeDrawer ||
    showSpeedMenu ||
    showCreateWatchPartyModal;
  const overlayBarState = shouldHideBarsForOverlay({
    showCommentsModal,
    showEpisodeDrawer,
    showSettingsMenu,
    showSpeedMenu,
    showAudioLangMenu,
  });
  const controlsVisible =
    isLoadingOrBuffering && !hasActiveOverlay
      ? false
      : shouldShowFullscreenControls({
          isLocked: isScreenLocked,
          controlsVisible: isFullscreen ? showControls : showControls || !playing,
          hasActiveOverlay,
        });
  const topAndBottomVisible = controlsVisible && !overlayBarState.hideBottomBar;
  const centerClusterVisible =
    !streamError && controlsVisible && !overlayBarState.hideCenterCluster;

  useEffect(() => {
    if (hasActiveOverlay) {
      if (hideTimerRef.current) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShowControls(true);
    }
  }, [hasActiveOverlay]);
  const totalFsCommentsCount =
    (state.comments[getCommentsScopeKey(media.id, 'episode', currentEpisode.number)]?.length || 0) +
    (state.comments[getCommentsScopeKey(media.id, 'series', currentEpisode.number)]?.length || 0);
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const brightnessPercent = Math.round(brightness * 100);
  const gestureSeekRatio = gestureSeekState
    ? formatScrubberPercent(gestureSeekState.targetTime, effectiveDuration)
    : 0;
  const fitBadgeLabel = getVideoFitBadgeLabel(fitMode);

  return (
    <section
      data-testid="inline-anime-player"
      aria-label={`Inline player for ${animeTitle}`}
      className={`sx-player-stage-enter relative z-20 ${
        watchPartyMode?.hideBottomControlsBar ? 'mb-0' : 'mb-5'
      }`}
    >
      {/* Ambient Aura Glow Effect around Inline Player (unmounted/paused during fullscreen for zero GPU lag) */}
      {!isFullscreen && (
        <div
          data-testid="inline-player-ambient"
          data-playing={playing ? 'true' : 'false'}
          aria-hidden="true"
          className={`pointer-events-none absolute -inset-4 sm:-inset-7 -z-10 transition-opacity duration-500 ${
            effectiveAmbientEnabled ? (playing ? 'opacity-80' : 'opacity-25') : 'opacity-0'
          }`}
        >
          {backdropArtwork && effectiveAmbientEnabled && (
            <img
              src={backdropArtwork}
              alt=""
              className="w-full h-full object-cover rounded-[42px] blur-3xl saturate-150"
            />
          )}

          <canvas
            ref={ambientCanvasRef}
            width={32}
            height={18}
            className={`absolute inset-0 w-full h-full rounded-[42px] blur-3xl saturate-150 transition-opacity duration-500 ${
              playing && hasVideoFrame ? 'opacity-85' : 'opacity-0'
            }`}
          />

          <div
            className={`absolute -inset-2 rounded-[40px] blur-2xl transition-opacity duration-500 ${
              playing ? 'opacity-65' : 'opacity-20'
            }`}
            style={{
              background:
                'radial-gradient(circle at 20% 35%, color-mix(in srgb, var(--sx-primary) 42%, transparent), transparent 58%), radial-gradient(circle at 82% 70%, color-mix(in srgb, var(--sx-tertiary) 28%, transparent), transparent 55%)',
            }}
          />
        </div>
      )}

      {/* Outer Video Host (instant geometry switch on fullscreen enter/exit for zero lag) */}
      <div
        ref={playerContainerRef}
        data-fullscreen={isFullscreen ? 'true' : 'false'}
        data-rotated={isFullscreen && isLandscapeRotated ? 'true' : 'false'}
        data-locked={isFullscreen && isScreenLocked ? 'true' : 'false'}
        onMouseMove={() => {
          if (!isScreenLocked && (!isFullscreen || controlsVisible)) {
            scheduleHideControls();
          }
        }}
        style={{
          borderRadius: isFullscreen ? '0px' : `${state.themePrefs.uiRoundness}px`,
        }}
        className={`bg-black text-white select-none ${
          isFullscreen
            ? 'fixed inset-0 w-[100dvw] h-[100dvh] z-50 overflow-hidden'
            : `relative w-full aspect-video border border-white/25 dark:border-white/15 transition-shadow duration-300 ${
                playing && effectiveAmbientEnabled
                  ? 'shadow-[0_18px_52px_-12px_rgba(0,0,0,0.65),0_0_46px_-8px_color-mix(in srgb,var(--sx-primary)_45%,transparent)]'
                  : 'shadow-[0_14px_38px_rgba(15,23,42,0.28)]'
              }`
        }`}
      >
        {/* Inner Rotatable Stage Wrapper (handles 90deg CSS landscape rotation cleanly even inside native fullscreen) */}
        <div
          data-testid="fs-rotatable-stage"
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={handleStagePointerEnd}
          onPointerCancel={handleStagePointerEnd}
          style={
            isFullscreen
              ? rotationStage.cssRotated
                ? {
                    width: `${rotationStage.stageWidthPx}px`,
                    height: `${rotationStage.stageHeightPx}px`,
                    top: '50%',
                    left: '50%',
                    translate: '-50% -50%',
                    transform: 'rotate(90deg)',
                    borderRadius: '0px',
                  }
                : {
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    borderRadius: '0px',
                  }
              : {
                  borderRadius: `${state.themePrefs.uiRoundness}px`,
                }
          }
          className={`bg-black ${
            isFullscreen
              ? `${rotationStage.cssRotated ? 'sx-fs-rotate-spring ' : ''}absolute touch-none overflow-hidden`
              : 'absolute inset-0'
          }`}
        >
        {/* Inner Rounded Stage Clipping Wrapper (clips video/vignette/drawer without clipping settings popover in inline mode) */}
        <div
          style={{ borderRadius: isFullscreen ? '0px' : `${state.themePrefs.uiRoundness}px` }}
          className="absolute inset-0 overflow-hidden flex items-center justify-center bg-black"
        >
          {/* Uncropped Artwork Preview + Blurred Ambient Fill ONLY before first video frame loads in inline mode */}
          {backdropArtwork && !hasVideoFrame && !isFullscreen && (
            <>
              <img
                src={backdropArtwork}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-45"
              />
              <img
                src={backdropArtwork}
                alt={currentEpisode.title}
                className="pointer-events-none absolute inset-0 w-full h-full object-contain opacity-80"
              />
            </>
          )}
          {isLoadingOrBuffering && (
            <div
              data-testid="inline-player-buffering"
              aria-live="polite"
              className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center overflow-hidden p-4"
            >
              {!hasVideoFrame && (
                <>
                  <div
                    className="absolute inset-0 opacity-55"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--sx-player-accent) 26%, transparent), transparent 65%)',
                    }}
                  />
                  <div className="sx-buffering-shimmer pointer-events-none absolute inset-y-0 left-0 w-1/2 h-full bg-gradient-to-r from-transparent via-white/15 to-transparent skew-x-[-20deg]" />
                </>
              )}
              <div className="relative z-10 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 text-xs font-bold text-white/95 shadow-2xl">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-[var(--sx-player-accent)] border-t-transparent animate-spin shrink-0" />
                <span>
                  {streamLoading
                    ? `Resolving EP ${currentEpisode.number} stream...`
                    : `Buffering EP ${currentEpisode.number}...`}
                </span>
              </div>
            </div>
          )}

          {streamError && (
            <div
              data-no-gesture="true"
              data-testid="inline-player-error"
              onClick={(e) => e.stopPropagation()}
              className={
                isFullscreen
                  ? 'absolute inset-0 z-30 pointer-events-none flex items-center justify-center p-4 bg-black/55 backdrop-blur-[2px] text-center'
                  : 'absolute inset-0 z-20 pointer-events-none bg-black/60 backdrop-blur-[2px]'
              }
            >
              <div
                className={
                  isFullscreen
                    ? 'flex items-center justify-center w-full pointer-events-none'
                    : 'absolute inset-x-2 top-[42px] bottom-[40px] sm:inset-x-4 sm:top-12 sm:bottom-12 flex items-center justify-center pointer-events-none'
                }
              >
                <div
                  className={
                    isFullscreen
                      ? 'pointer-events-auto max-w-sm rounded-2xl bg-zinc-950/92 border border-white/15 px-4 py-3.5 shadow-2xl space-y-2.5 text-center'
                      : 'pointer-events-auto w-full max-w-[330px] sm:max-w-sm max-h-full overflow-y-auto no-scrollbar rounded-2xl bg-zinc-950/92 border border-white/15 px-3 py-2 sm:px-4 sm:py-3 shadow-2xl space-y-1.5 sm:space-y-2 text-center'
                  }
                >
                  <div className="inline-flex items-center gap-1.5 text-[11px] sm:text-xs font-extrabold text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                    <span>Stream Unavailable</span>
                  </div>
                  <p
                    title={streamError}
                    className="text-[10.5px] sm:text-[11px] text-white/85 leading-snug line-clamp-3"
                  >
                    {streamError}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
                    <button
                      type="button"
                      data-testid="inline-player-retry-btn"
                      onClick={() => {
                        attemptedSourceIdsRef.current = new Set();
                        failoverAttemptsRef.current = [];
                        handledFailureKeyRef.current = '';
                        setFailoverSource(null);
                        setStreamRetryNonce((n) => n + 1);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-[10.5px] sm:text-[11px] font-extrabold shadow hover:opacity-95 transition-opacity"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                    {availableServers.length > 1 && (
                      <button
                        type="button"
                        data-testid="inline-player-switch-server-btn"
                        onClick={() => {
                          const curIdx = availableServers.findIndex((s) => s.id === selectedServer?.id);
                          const nextSrv = availableServers[(curIdx + 1) % availableServers.length];
                          if (nextSrv) handleSelectServer(nextSrv);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 text-[10.5px] sm:text-[11px] font-bold text-white transition-colors"
                      >
                        <span>Switch Server</span>
                      </button>
                    )}
                    {onOpenSourcePicker && (
                      <button
                        type="button"
                        data-testid="inline-player-change-source-btn"
                        onClick={onOpenSourcePicker}
                        className="inline-flex items-center gap-1 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 text-[10.5px] sm:text-[11px] font-bold text-white transition-colors"
                      >
                        <span>Change Source</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            autoPlay={false}
            playsInline
            preload={resolveVideoPreloadMode(state.playerPrefs.batterySaver)}
            style={{ filter: `brightness(${brightness})` }}
            onClick={(e) => {
              if (Date.now() - lastPointerTapAtRef.current < 400) return;
              if (e.detail >= 2) return;
              handleStageTap();
            }}
            onDoubleClick={(e) => {
              handleStageDoubleTap(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
            }}
            onPlay={() => {
              setAutoplayBlocked(false);
              setPlaying(true);
              scheduleHideControls(true);
              triggerGestureGuide();
            }}
            onPause={() => {
              setPlaying(false);
              setIsBuffering(false);
              setShowControls(true);
              persistPlaybackHistory(videoRef.current?.currentTime ?? currentTime, duration);
            }}
            onWaiting={(e) => {
              if (!e.currentTarget.paused && !e.currentTarget.ended) {
                setIsBuffering(true);
              }
            }}
            onCanPlay={() => {
              setIsBuffering(false);
              attemptAutoSkip(videoRef.current);
            }}
            onLoadedData={() => {
              setHasVideoFrame(true);
              setIsBuffering(false);
            }}
            onPlaying={() => {
              setHasVideoFrame(true);
              setIsBuffering(false);
              attemptAutoSkip(videoRef.current);
            }}
            onError={() => {
              setIsBuffering(false);
              if (!activeStreamUrl) return;
              const failKey = `${effectiveSourceId || ''}:${currentEpisode.id}:${mirrorIndex}:${streamRetryNonce}`;
              if (handledFailureKeyRef.current === failKey) return;
              handledFailureKeyRef.current = failKey;
              const nextMirrorIdx = findNextDistinctMirrorIndex(
                stream?.mirrors,
                mirrorIndex,
                rawStreamUrl,
              );
              if (nextMirrorIdx >= 0) {
                setMirrorIndex(nextMirrorIdx);
              } else {
                const msg = 'Video playback failed on this server. Try retrying or switching servers.';
                if (!tryAdvanceFailoverSource(msg)) {
                  setStreamError(formatFailoverAttemptSummary(failoverAttemptsRef.current));
                }
              }
            }}
            onTimeUpdate={() => {
              const t = videoRef.current?.currentTime || 0;
              setCurrentTime(t);
              attemptAutoSkip(videoRef.current, t);
            }}
            onLoadedMetadata={() => {
              setDuration(videoRef.current?.duration || 0);
              attemptAutoSkip(videoRef.current);
            }}
            onEnded={() => {
              setIsBuffering(false);
              persistPlaybackHistory(
                videoRef.current?.duration || duration,
                videoRef.current?.duration || duration,
              );
              if (autoNext && navState.hasNext) {
                onChangeEpisodeIndex(navState.nextIndex);
              } else {
                setPlaying(false);
                setShowControls(true);
              }
            }}
            className={`relative z-10 w-full h-full max-w-full max-h-full ${getVideoFitClass(
              fitMode,
            )} transition-opacity duration-300 ${hasVideoFrame ? 'opacity-100' : 'opacity-0'}`}
          />

          {/* Subtle Dark Legibility Vignette when controls are shown */}
          <div
            aria-hidden="true"
            className={`pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/75 via-black/15 to-black/50 transition-opacity duration-300 ${
              controlsVisible ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Double-tap Seek Radial Ripple & HUD */}
          {seekBadge && (
            <>
              <div
                key={`ripple-${seekBadge.seq}`}
                aria-hidden="true"
                className={`pointer-events-none absolute inset-y-0 w-1/2 z-20 ${
                  seekBadge.side === 'left'
                    ? 'left-0 sx-seek-ripple-left bg-gradient-to-r from-white/20 via-white/10 to-transparent rounded-r-full'
                    : 'right-0 sx-seek-ripple-right bg-gradient-to-l from-white/20 via-white/10 to-transparent rounded-l-full'
                }`}
              />
              <div
                key={`badge-${seekBadge.seq}`}
                className={`sx-player-badge-pop pointer-events-none absolute top-1/2 z-30 px-3.5 py-1.5 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-xs font-black tracking-wide shadow-xl ${
                  seekBadge.side === 'left' ? 'left-5 sm:left-10' : 'right-5 sm:right-10'
                }`}
              >
                {seekBadge.label}
              </div>
            </>
          )}

          {/* Horizontal Swipe Seek Scrubbing HUD */}
          {gestureSeekState && (
            <div
              data-testid="player-gesture-seek-hud"
              className="sx-player-center-hud pointer-events-none absolute left-1/2 top-1/2 z-30 min-w-[200px] px-5 py-3.5 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/20 shadow-2xl text-center space-y-2"
            >
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-black font-mono-tabular text-[var(--sx-player-accent)]">
                  {formatSignedSeekDelta(gestureSeekState.deltaSeconds)}
                </span>
                <span className="text-xs font-bold font-mono-tabular text-white/80">
                  {formatPlayerTime(gestureSeekState.targetTime)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden">
                <div
                  style={{ width: `${gestureSeekRatio}%` }}
                  className="h-full rounded-full bg-[var(--sx-player-accent)] transition-[width] duration-75"
                />
              </div>
            </div>
          )}

          {/* Vertical Right Swipe Volume HUD */}
          {volumeHudVisible && (
            <div
              data-testid="player-gesture-volume-hud"
              className="sx-player-badge-pop pointer-events-none absolute right-5 sm:right-10 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-2.5"
            >
              {volumePercent === 0 ? (
                <VolumeX className="w-5 h-5 text-white/85" />
              ) : (
                <Volume2 className="w-5 h-5 text-white" />
              )}
              <div className="w-2 h-24 rounded-full bg-white/25 overflow-hidden flex items-end">
                <div
                  style={{ height: `${volumePercent}%` }}
                  className="w-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)] transition-[height] duration-75"
                />
              </div>
              <span className="text-[11px] font-extrabold font-mono-tabular text-white">
                {volumePercent}%
              </span>
            </div>
          )}

          {/* Vertical Left Swipe Brightness HUD */}
          {brightnessHudVisible && (
            <div
              data-testid="player-gesture-brightness-hud"
              className="sx-player-badge-pop pointer-events-none absolute left-5 sm:left-10 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-2.5"
            >
              <Sun className="w-5 h-5 text-[var(--sx-player-accent)]" />
              <div className="w-2 h-24 rounded-full bg-white/25 overflow-hidden flex items-end">
                <div
                  style={{ height: `${brightnessPercent}%` }}
                  className="w-full rounded-full bg-[var(--sx-player-accent)] transition-[height] duration-75"
                />
              </div>
              <span className="text-[11px] font-extrabold font-mono-tabular text-white">
                {brightnessPercent}%
              </span>
            </div>
          )}

          {/* Subtle 2-Second Swipe Gesture Guide Overlay on Playback Start */}
          {gestureGuideVisible &&
            !hasActiveOverlay &&
            !isScreenLocked &&
            !gestureSeekState &&
            !volumeHudVisible &&
            !brightnessHudVisible && (
              <div
                data-testid="player-gesture-guide"
                aria-hidden="true"
                className={`sx-gesture-guide-enter pointer-events-none absolute left-1/2 z-20 rounded-2xl bg-black/60 backdrop-blur-xl border border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.42)] flex items-center divide-x divide-white/12 ${
                  isFullscreen
                    ? 'top-16 sm:top-20 px-3.5 py-2'
                    : 'bottom-11 sm:bottom-14 px-2.5 py-1.5'
                }`}
              >
                {GESTURE_GUIDE_ITEMS.map((item) => (
                  <div
                    key={item.id}
                    data-testid={`gesture-guide-${item.id}`}
                    className={`flex items-center gap-1.5 text-white/90 ${
                      isFullscreen ? 'px-3 first:pl-1 last:pr-1' : 'px-2 first:pl-0.5 last:pr-0.5'
                    }`}
                  >
                    <span className="inline-flex items-center gap-0.5 text-[var(--sx-player-accent)] shrink-0">
                      {item.id === 'brightness' && (
                        <>
                          <MoveVertical className="w-3 h-3 opacity-80" />
                          <Sun className="w-3.5 h-3.5" />
                        </>
                      )}
                      {item.id === 'seek' && (
                        <>
                          <MoveHorizontal className="w-3 h-3 opacity-80" />
                          <FastForward className="w-3.5 h-3.5" />
                        </>
                      )}
                      {item.id === 'volume' && (
                        <>
                          <Volume2 className="w-3.5 h-3.5" />
                          <MoveVertical className="w-3 h-3 opacity-80" />
                        </>
                      )}
                    </span>
                    <div className="leading-none whitespace-nowrap">
                      <p className="text-[10px] sm:text-[11px] font-bold tracking-tight text-white">
                        {item.label}
                      </p>
                      {isFullscreen && (
                        <p className="text-[9px] font-medium text-white/60 mt-0.5">{item.hint}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          {/* Active Subtitle Cue (instant frame-sync by default; optional animation when subtitleAnimation is enabled) */}
          {!streamError && activeCue && (
            <div
              data-testid="inline-player-subtitle-overlay"
              style={{
                transform:
                  (state.playerPrefs.subtitleBottomOffset || 0) > 0
                    ? `translateY(${
                        state.playerPrefs.subtitlePosition === 'top'
                          ? state.playerPrefs.subtitleBottomOffset
                          : -(state.playerPrefs.subtitleBottomOffset || 0)
                      }px)`
                    : undefined,
              }}
              className={`pointer-events-none absolute inset-x-3 sm:inset-x-5 flex justify-center z-20 ${
                state.playerPrefs.subtitleAnimation ? 'transition-all duration-200' : ''
              } ${
                state.playerPrefs.subtitlePosition === 'top'
                  ? 'top-16 sm:top-18'
                  : topAndBottomVisible
                    ? isFullscreen
                      ? 'bottom-36 sm:bottom-40'
                      : 'bottom-[46px] sm:bottom-14'
                    : 'bottom-4 sm:bottom-7'
              }`}
            >
              <p
                key={state.playerPrefs.subtitleAnimation ? activeCue.text : 'static-sub'}
                style={buildSubtitleBoxCssProps(
                  state.playerPrefs,
                  isFullscreen
                    ? state.playerPrefs.subtitleSize
                    : Math.max(11, Math.min(state.playerPrefs.subtitleSize, 16)),
                )}
                className={`${
                  state.playerPrefs.subtitleAnimation
                    ? 'sx-player-subtitle-enter transition-all duration-200'
                    : ''
                } px-2.5 sm:px-3.5 py-0.5 sm:py-1 rounded-xl text-center max-w-[94%] sm:max-w-xl leading-tight sm:leading-snug whitespace-pre-line ${
                  !isFullscreen && controlsVisible ? 'line-clamp-2' : 'line-clamp-3'
                } ${
                  state.playerPrefs.subtitleBackground
                    ? 'backdrop-blur-md border border-white/10'
                    : ''
                }`}
              >
                <SubtitleFormattedText text={activeCue.text} />
              </p>
            </div>
          )}

          {/* Floating Watch Party Animated Emojis across the screen (compositor spring motion) */}
          {!state.playerPrefs.batterySaver &&
            watchPartyMode?.showReactions !== false &&
            watchPartyMode?.reactions &&
            watchPartyMode.reactions.length > 0 && (
            <div
              data-testid="watch-party-player-floating-emojis"
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-8 top-4 z-30 overflow-hidden"
            >
              {watchPartyMode.reactions.map((item) => (
                <div
                  key={item.id}
                  style={
                    {
                      left: `${item.xPercent}%`,
                      '--sx-emoji-drift': `${item.driftPx}px`,
                      '--sx-emoji-rot': `${item.rotateDeg}deg`,
                      '--sx-emoji-scale': String(item.scale),
                    } as React.CSSProperties
                  }
                  className="sx-watch-emoji-float absolute bottom-0 flex flex-col items-center select-none"
                >
                  <span className="text-2xl sm:text-3xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.55)]">
                    {item.emoji}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Screen Locked Floating Unlock Shield (only interactive target while locked) */}
          {isFullscreen && isScreenLocked && (
            <div
              onClick={(e) => {
                e.stopPropagation();
                triggerLockOverlay();
              }}
              className="absolute inset-0 z-30 flex items-end justify-center pb-8 sm:pb-12 pointer-events-auto"
            >
              {lockOverlayVisible && (
                <button
                  type="button"
                  data-testid="fs-unlock-btn"
                  aria-label="Unlock screen controls"
                  aria-pressed={isScreenLocked}
                  data-locked="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleToggleScreenLock();
                  }}
                  className="sx-lock-pill-enter inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-black/75 hover:bg-black/90 backdrop-blur-2xl border border-[var(--sx-player-accent)]/60 text-xs font-extrabold text-white shadow-[0_10px_30px_rgba(0,0,0,0.65)] ring-1 ring-[var(--sx-player-accent)]/35 transition-colors"
                >
                  <Lock className="w-4 h-4 text-[var(--sx-player-accent)] animate-pulse" />
                  <span>Screen Locked · Tap to Unlock</span>
                </button>
              )}
            </div>
          )}

          {/* Controls Overlay — in Fullscreen, tapping empty background slides/fades all controls cleanly out & back */}
          <div
            onClick={(e) => {
              if (Date.now() - lastPointerTapAtRef.current < 400) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest('button, input, select, a, [data-no-gesture="true"]')) return;
              handleStageTap();
            }}
            onDoubleClick={(e) => {
              if (Date.now() - lastPointerTapAtRef.current < 400) return;
              const target = e.target as HTMLElement | null;
              if (target?.closest('button, input, select, a, [data-no-gesture="true"]')) return;
              handleStageDoubleTap(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
            }}
            className={`absolute inset-0 z-20 flex flex-col justify-between ${
              isFullscreen && rotationStage.cssRotated
                ? 'pt-3.5 pb-3.5 pl-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.25rem,env(safe-area-inset-bottom))]'
                : 'p-3 sm:p-4'
            } ${isFullscreen ? 'pointer-events-auto' : 'pointer-events-none'}`}
          >
            {/* Top Overlay Row */}
            {isFullscreen ? (
              <div
                data-testid="fs-top-bar"
                data-visible={topAndBottomVisible ? 'true' : 'false'}
                className={`sx-fs-bar-top relative flex items-center justify-between gap-2 ${
                  rotationStage.cssRotated ? 'pt-0' : 'pt-[env(safe-area-inset-top)]'
                } ${
                  topAndBottomVisible
                    ? 'opacity-100 translate-y-0 pointer-events-auto'
                    : 'opacity-0 -translate-y-4 pointer-events-none'
                }`}
              >
                {/* Left Frosted Title Pill: Back + Anime Title + Episode */}
                <div className="inline-flex items-center gap-2 h-10 sm:h-11 pl-1 pr-3 sm:pr-4 py-0 rounded-full bg-white/10 backdrop-blur-2xl border border-white/15 shadow-lg min-w-0 max-w-[40vw] sm:max-w-sm">
                  <button
                    type="button"
                    aria-label="Exit fullscreen"
                    data-testid="fs-exit-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      void exitFullscreen();
                    }}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors shrink-0"
                  >
                    <ArrowLeft className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                  </button>
                  <div className="min-w-0 leading-[1.15]">
                    <p className="text-[11px] sm:text-xs font-extrabold tracking-tight text-white truncate">
                      {animeTitle}
                    </p>
                    <p className="text-[9.5px] sm:text-[10.5px] font-medium text-white/65 truncate">
                      EP {currentEpisode.number}: {currentEpisode.title}
                    </p>
                  </div>
                </div>

                {/* Top-Right Action Buttons */}
                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  <button
                    type="button"
                    aria-label="Comments"
                    title="Episode & Series Comments"
                    data-testid="fs-comments-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowCommentsModal((v) => !v);
                      setShowAudioLangMenu(false);
                      setShowSettingsMenu(false);
                      setShowEpisodeDrawer(false);
                      setShowCreateWatchPartyModal(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all shrink-0 ${
                      showCommentsModal
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <MessageSquare className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    {totalFsCommentsCount > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 min-w-[15px] h-[15px] px-0.5 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-[8px] font-black tabular-nums flex items-center justify-center">
                        {totalFsCommentsCount}
                      </span>
                    )}
                  </button>

                  <button
                    type="button"
                    aria-label="Audio language"
                    title={`Audio: ${activeAudioLangOption.label}`}
                    data-testid="fs-audio-lang-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowAudioLangMenu((v) => !v);
                      setShowCommentsModal(false);
                      setShowSettingsMenu(false);
                      setShowEpisodeDrawer(false);
                      setShowCreateWatchPartyModal(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all shrink-0 ${
                      showAudioLangMenu
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <Languages className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    <span className="absolute -bottom-0.5 -right-0.5 px-1 py-[1px] rounded-full bg-zinc-950/95 border border-white/25 text-[7.5px] font-black text-white leading-none">
                      {activeAudioLangOption.shortLabel}
                    </span>
                  </button>

                  <button
                    type="button"
                    aria-label="Episode list"
                    data-testid="inline-player-episodes-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowEpisodeDrawer((v) => !v);
                      setShowSettingsMenu(false);
                      setShowAudioLangMenu(false);
                      setShowCommentsModal(false);
                      setShowCreateWatchPartyModal(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-colors shrink-0 ${
                      showEpisodeDrawer
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <ListVideo className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                  </button>

                  {!watchPartyMode && (
                    <button
                      type="button"
                      aria-label="Watch Together"
                      title="Watch Together"
                      data-testid="inline-player-watch-party-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowCreateWatchPartyModal((v) => !v);
                        setShowSettingsMenu(false);
                        setShowAudioLangMenu(false);
                        setShowCommentsModal(false);
                        setShowEpisodeDrawer(false);
                        setShowSpeedMenu(false);
                      }}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-colors shrink-0 ${
                        showCreateWatchPartyModal
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                      }`}
                    >
                      <Users className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="Player settings"
                    data-testid="inline-player-settings-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowSettingsMenu((v) => !v);
                      setShowAudioLangMenu(false);
                      setShowCommentsModal(false);
                      setShowEpisodeDrawer(false);
                      setShowCreateWatchPartyModal(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-transform duration-300 shrink-0 ${
                      showSettingsMenu
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] rotate-45'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <Settings className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                {watchPartyMode && !controlsVisible && (
                  <span
                    data-testid="watch-party-live-badge"
                    className="pointer-events-none absolute top-2.5 left-2.5 sm:top-4 sm:left-4 z-20 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 backdrop-blur-md border border-red-400/40 text-[10px] sm:text-[11px] font-black tracking-wide text-white shadow-sm"
                  >
                    <Radio className="w-3 h-3 animate-pulse" />
                    <span>LIVE</span>
                  </span>
                )}
                <div
                  className={`relative flex items-center justify-between gap-2 transition-all duration-300 ${
                    controlsVisible
                      ? 'opacity-100 translate-y-0 pointer-events-auto'
                      : 'opacity-0 -translate-y-2 pointer-events-none'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0 max-w-[62%]">
                    {watchPartyMode ? (
                      <span
                        data-testid="watch-party-live-badge"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-600/90 backdrop-blur-md border border-red-400/40 text-[10px] sm:text-[11px] font-black tracking-wide text-white shrink-0 shadow-sm"
                      >
                        <Radio className="w-3 h-3 animate-pulse" />
                        <span>LIVE</span>
                      </span>
                    ) : null}
                    <span
                      key={`ep-pill-${currentEpisode.id}`}
                      className={`${epBadgeAnimClass} px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-md border border-white/15 text-[10px] sm:text-[11px] font-bold tracking-wide text-white/95 truncate`}
                    >
                      EP {currentEpisode.number} · {currentEpisode.title}
                    </span>
                    {failoverSource && !streamError && (
                      <span
                        data-testid="inline-player-failover-badge"
                        title={`Auto-switched from ${sourceName || sourceId} to ${failoverSource.name}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[9.5px] font-extrabold text-emerald-200 max-w-[106px] sm:max-w-[210px]"
                      >
                        <span className="truncate">Fallback: {failoverSource.name}</span>
                      </span>
                    )}
                  </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    aria-label="Picture in Picture"
                    title="Picture in Picture"
                    data-testid="inline-player-pip-btn"
                    onClick={handleEnterPip}
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-black/45 hover:bg-black/70 backdrop-blur-md border border-white/15 flex items-center justify-center text-white transition-colors"
                  >
                    <PictureInPicture2 className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    aria-label="Episode list"
                    data-testid="inline-player-episodes-btn"
                    onClick={() => {
                      setShowEpisodeDrawer((v) => !v);
                      setShowCreateWatchPartyModal(false);
                      setShowSettingsMenu(false);
                    }}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${
                      showEpisodeDrawer
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                        : 'bg-black/45 hover:bg-black/70 border-white/15 text-white'
                    }`}
                  >
                    <ListVideo className="w-4 h-4" />
                  </button>

                  {!watchPartyMode && (
                    <button
                      type="button"
                      aria-label="Watch Together"
                      title="Watch Together"
                      data-testid="inline-player-watch-party-btn"
                      onClick={() => {
                        setShowCreateWatchPartyModal((v) => !v);
                        setShowSettingsMenu(false);
                        setShowEpisodeDrawer(false);
                      }}
                      className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${
                        showCreateWatchPartyModal
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                          : 'bg-black/45 hover:bg-black/70 border-white/15 text-white'
                      }`}
                    >
                      <Users className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    aria-label="Player settings"
                    data-testid="inline-player-settings-btn"
                    onClick={() => {
                      setShowSettingsMenu((v) => !v);
                      setShowCreateWatchPartyModal(false);
                      setShowEpisodeDrawer(false);
                    }}
                    className={`w-8 h-8 sm:w-9 sm:h-9 rounded-full backdrop-blur-md border flex items-center justify-center transition-transform duration-300 ${
                      showSettingsMenu
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] rotate-45'
                        : 'bg-black/45 hover:bg-black/70 border-white/15 text-white'
                    }`}
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>
              </div>
              </>
            )}

            {/* Center Playback Cluster (-10s · Play/Pause · +10s) */}
            <div
              onClick={(e) => e.stopPropagation()}
              className={`sx-fs-center-cluster flex items-center justify-center gap-6 sm:gap-10 ${
                !centerClusterVisible
                  ? 'opacity-0 scale-90 pointer-events-none'
                  : 'opacity-100 pointer-events-auto scale-100'
              } ${
                !isFullscreen && controlsVisible ? '-translate-y-3.5 sm:translate-y-0' : ''
              }`}
            >
              <button
                type="button"
                aria-label="Rewind 10 seconds"
                onClick={() => seekBy(-10)}
                className={`relative rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90 ${
                  isFullscreen ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-9 h-9 sm:w-10 sm:h-10'
                }`}
              >
                <RotateCcw
                  className={`text-white drop-shadow ${
                    isFullscreen ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-5 h-5 sm:w-6 sm:h-6'
                  }`}
                />
                <span
                  className={`absolute font-black mt-0.5 text-white tabular-nums ${
                    isFullscreen ? 'text-[9.5px] sm:text-[10.5px]' : 'text-[8px] sm:text-[9px]'
                  }`}
                >
                  10
                </span>
              </button>

              <button
                type="button"
                aria-label={playing ? 'Pause playback' : 'Play playback'}
                data-testid="inline-player-play-btn"
                onClick={togglePlay}
                className={`sx-player-play-btn rounded-full bg-white/18 hover:bg-white/28 backdrop-blur-md border border-white/25 flex items-center justify-center shadow-2xl ${
                  isFullscreen ? 'w-16 h-16 sm:w-[72px] sm:h-[72px]' : 'w-12 h-12 sm:w-14 sm:h-14'
                }`}
              >
                {playing ? (
                  <Pause
                    key="pause-icon"
                    className={`sx-player-icon-pop fill-white text-white ${
                      isFullscreen ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-5 h-5 sm:w-7 sm:h-7'
                    }`}
                  />
                ) : (
                  <Play
                    key="play-icon"
                    className={`sx-player-icon-pop fill-white text-white ml-0.5 ${
                      isFullscreen ? 'w-7 h-7 sm:w-8 sm:h-8' : 'w-5 h-5 sm:w-7 sm:h-7'
                    }`}
                  />
                )}
              </button>

              <button
                type="button"
                aria-label="Forward 10 seconds"
                onClick={() => seekBy(10)}
                className={`relative rounded-full hover:bg-white/15 flex items-center justify-center transition-all active:scale-90 ${
                  isFullscreen ? 'w-12 h-12 sm:w-14 sm:h-14' : 'w-9 h-9 sm:w-10 sm:h-10'
                }`}
              >
                <RotateCw
                  className={`text-white drop-shadow ${
                    isFullscreen ? 'w-6 h-6 sm:w-7 sm:h-7' : 'w-5 h-5 sm:w-6 sm:h-6'
                  }`}
                />
                <span
                  className={`absolute font-black mt-0.5 text-white tabular-nums ${
                    isFullscreen ? 'text-[9.5px] sm:text-[10.5px]' : 'text-[8px] sm:text-[9px]'
                  }`}
                >
                  10
                </span>
              </button>
            </div>

            {/* Bottom Controls Stack (Bottom Actions ABOVE Progress/Scrubber Bar) */}
            <div
              data-testid="fs-bottom-bar"
              data-visible={topAndBottomVisible ? 'true' : 'false'}
              onPointerDownCapture={() => scheduleHideControls()}
              onClick={(e) => e.stopPropagation()}
              className={`sx-fs-bar-bottom space-y-2 ${
                isFullscreen && !rotationStage.cssRotated ? 'pb-[env(safe-area-inset-bottom)]' : 'pb-0'
              } ${
                topAndBottomVisible
                  ? 'opacity-100 pointer-events-auto translate-y-0'
                  : 'opacity-0 translate-y-4 pointer-events-none'
              }`}
            >
              {activeSkip && (
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      if (videoRef.current) {
                        const dest = clampAutoSkipDestination(
                          activeSkip.endTime,
                          videoRef.current.duration || duration,
                        );
                        videoRef.current.currentTime = dest;
                        setCurrentTime(dest);
                        emitWatchPartySync('seek', dest, !videoRef.current.paused);
                      }
                    }}
                    className="sx-player-skip-pill inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white text-black text-[11px] font-extrabold shadow-lg hover:bg-[var(--sx-player-accent)] hover:text-[var(--sx-player-on-accent)] transition-colors"
                  >
                    <FastForward className="w-3.5 h-3.5" />
                    <span>Skip {activeSkip.skipType.toUpperCase()}</span>
                  </button>
                </div>
              )}

              {/* Fullscreen Bottom Actions Bar ABOVE Scrubber: Left (Lock) & Right (1. Rotate, 2. Video Fit, 3. Speed, 4. Subtitles, 5. Window PiP) */}
              {isFullscreen && (
                <div
                  data-testid="fs-bottom-actions"
                  className="flex items-center justify-between gap-2"
                >
                  {/* Left Side: Lock Button */}
                  <button
                    type="button"
                    aria-label={isScreenLocked ? 'Screen locked' : 'Lock screen'}
                    aria-pressed={isScreenLocked}
                    data-locked={isScreenLocked ? 'true' : 'false'}
                    title={isScreenLocked ? 'Screen Locked' : 'Lock Screen Controls'}
                    data-testid="fs-lock-btn"
                    onClick={handleToggleScreenLock}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all shrink-0 ${
                      isScreenLocked
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] shadow-[0_0_16px_color-mix(in_srgb,var(--sx-player-accent)_45%,transparent)]'
                        : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                    }`}
                  >
                    <Lock
                      className={`w-[18px] h-[18px] sm:w-5 sm:h-5 ${
                        isScreenLocked ? 'animate-pulse' : ''
                      }`}
                    />
                  </button>

                  {/* Right Side: 1. Rotate, 2. Video Fit, 3. Speed, 4. Subtitle, 5. Window PiP */}
                  <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                    {/* 1. Screen Rotate */}
                    <button
                      type="button"
                      aria-label={isLandscapeRotated ? 'Reset screen rotation' : 'Rotate screen'}
                      title="Rotate Screen"
                      data-testid="fs-rotate-btn"
                      onClick={() => void toggleRotateScreen()}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all shrink-0 ${
                        isLandscapeRotated
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                      }`}
                    >
                      <ScreenRotateIcon className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    </button>

                    {/* 2. Video Fit Button */}
                    <button
                      type="button"
                      aria-label={`Video fit: ${fitBadgeLabel}`}
                      title={`Aspect Fit: ${fitMode}`}
                      data-testid="fs-fit-btn"
                      onClick={() => {
                        updatePlayerPrefs({ videoFit: getNextVideoFitMode(fitMode) });
                        scheduleHideControls();
                      }}
                      className="h-10 sm:h-11 px-3 sm:px-3.5 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-2xl border border-white/15 inline-flex items-center gap-1.5 text-xs font-extrabold text-white transition-all shrink-0"
                    >
                      <Scaling className="w-4 h-4" />
                      <span>{fitBadgeLabel}</span>
                    </button>

                    {/* 3. Playback Speed Button */}
                    <button
                      type="button"
                      aria-label={`Playback speed: ${speed}x`}
                      title="Playback Speed"
                      data-testid="fs-speed-btn"
                      onClick={() => {
                        setShowSpeedMenu((v) => !v);
                        setShowAudioLangMenu(false);
                        setShowCommentsModal(false);
                        setShowSettingsMenu(false);
                        setShowEpisodeDrawer(false);
                      }}
                      className={`h-10 sm:h-11 px-3 sm:px-3.5 rounded-full backdrop-blur-2xl border inline-flex items-center gap-1 text-xs font-mono-tabular font-extrabold transition-all shrink-0 ${
                        showSpeedMenu || speed !== 1
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                      }`}
                    >
                      <Gauge className="w-4 h-4" />
                      <span>{speed}x</span>
                    </button>

                    {/* 4. Subtitle Toggle Button */}
                    <button
                      type="button"
                      aria-label={subtitlesOn ? 'Disable subtitles' : 'Enable subtitles'}
                      aria-pressed={subtitlesOn}
                      title={subtitlesOn ? 'Subtitles On' : 'Subtitles Off'}
                      data-testid="fs-subtitle-btn"
                      onClick={() => {
                        updatePlayerPrefs({ subtitleEnabled: !subtitlesOn });
                        scheduleHideControls();
                      }}
                      className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full backdrop-blur-2xl border flex items-center justify-center transition-all shrink-0 ${
                        subtitlesOn
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                          : 'bg-white/10 hover:bg-white/20 border-white/15 text-white'
                      }`}
                    >
                      <Captions className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    </button>

                    {/* 5. Window PiP Button */}
                    <button
                      type="button"
                      aria-label="Window Picture in Picture"
                      title="Window PiP"
                      data-testid="fs-pip-btn"
                      onClick={handleEnterPip}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-2xl border border-white/15 flex items-center justify-center text-white transition-all shrink-0"
                    >
                      <PictureInPicture2 className="w-[18px] h-[18px] sm:w-5 sm:h-5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Frosted Scrubber / Progress Bar (below bottom actions) */}
              <div
                data-testid="fs-scrubber-bar"
                className={`flex items-center gap-2.5 px-3.5 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 shadow-lg ${
                  isFullscreen ? 'py-2 sm:py-2.5' : 'py-1.5 sm:py-2'
                }`}
              >
                <span className="text-[11px] font-bold text-white/95 tabular-nums shrink-0">
                  {formatPlayerTime(currentTime)}
                </span>

                <div className="group/scrubber relative flex-1 flex items-center h-4">
                  <div className="w-full h-1 rounded-full bg-white/25 overflow-hidden">
                    <div
                      style={{ width: `${progressPercent}%` }}
                      className="h-full rounded-full bg-[var(--sx-player-accent)] transition-[width] duration-150"
                    />
                  </div>
                  <span
                    aria-hidden="true"
                    style={{ left: `calc(${progressPercent}% - 5px)` }}
                    className="pointer-events-none absolute w-2.5 h-2.5 rounded-full bg-white ring-2 ring-[var(--sx-player-accent)] shadow-md transition-transform duration-150 group-hover/scrubber:scale-125"
                  />
                  <input
                    type="range"
                    aria-label="Seek video timeline"
                    min={0}
                    max={effectiveDuration}
                    step={0.5}
                    value={Math.min(currentTime, effectiveDuration)}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      if (videoRef.current) videoRef.current.currentTime = next;
                      setCurrentTime(next);
                      emitWatchPartySync('seek', next, playing);
                    }}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>

                <span className="text-[11px] font-bold text-white/85 tabular-nums shrink-0">
                  {formatPlayerTime(effectiveDuration)}
                </span>

                <button
                  type="button"
                  aria-label={isFullscreen ? 'Exit fullscreen' : 'Fullscreen player'}
                  data-testid="inline-player-fullscreen-btn"
                  onClick={toggleFullscreen}
                  className={`${
                    isFullscreen ? 'w-8 h-8 sm:w-9 sm:h-9' : 'w-6 h-6'
                  } rounded-full hover:bg-white/15 flex items-center justify-center text-white/90 shrink-0 transition-colors`}
                >
                  {isFullscreen ? (
                    <Minimize2 className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* Slide-over Episode List Drawer inside Player Stage */}
          <PlayerEpisodeDrawer
            open={showEpisodeDrawer}
            episodes={episodes}
            activeIndex={safeIndex}
            compact={!isFullscreen}
            onSelectEpisode={(idx) => onChangeEpisodeIndex(idx)}
            onClose={() => setShowEpisodeDrawer(false)}
          />

          {/* Fullscreen Playback Speed Selector Popover (right-aligned cleanly above right-side speed button) */}
          {isFullscreen && showSpeedMenu && (
            <div
              data-no-gesture="true"
              data-testid="fs-speed-popover"
              onClick={(e) => e.stopPropagation()}
              className="sx-speed-popover-up absolute bottom-[100px] sm:bottom-[112px] right-2.5 sm:right-4 z-40 max-w-[calc(100%-20px)] rounded-2xl bg-zinc-950/92 backdrop-blur-2xl border border-white/20 ring-1 ring-inset ring-white/10 p-2 shadow-2xl flex flex-wrap items-center justify-end gap-1"
            >
              {PLAYBACK_SPEED_OPTIONS.map((optSpeed) => {
                const active = speed === optSpeed;
                return (
                  <button
                    key={optSpeed}
                    type="button"
                    data-testid={`fs-speed-option-${optSpeed}`}
                    onClick={() => {
                      setSpeed(optSpeed);
                      updatePlayerPrefs({ defaultSpeed: optSpeed });
                      if (videoRef.current) videoRef.current.playbackRate = optSpeed;
                      setShowSpeedMenu(false);
                      scheduleHideControls();
                    }}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-mono-tabular font-extrabold transition-colors ${
                      active
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                        : 'text-white/85 hover:bg-white/15'
                    }`}
                  >
                    {optSpeed}x
                  </button>
                );
              })}
            </div>
          )}

          {/* Fullscreen Audio Language Selector Popover */}
          {isFullscreen && showAudioLangMenu && (
            <div
              data-no-gesture="true"
              data-testid="fs-audio-lang-popover"
              onClick={(e) => e.stopPropagation()}
              className="sx-player-popover absolute top-16 sm:top-[4.25rem] right-3 sm:right-6 z-40 w-68 rounded-2xl bg-zinc-950/90 backdrop-blur-2xl border border-white/20 ring-1 ring-inset ring-white/10 p-2.5 space-y-1 shadow-2xl"
            >
              <div className="flex items-center justify-between px-2 py-1">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-white/55">
                  Audio Language
                </p>
                <span className="text-[9.5px] font-bold text-white/45 tabular-nums">
                  {selectableAudioOptions.length} options
                </span>
              </div>
              {selectableAudioOptions.map((opt) => {
                const active = opt.code === activeAudioLangOption.code;
                return (
                  <button
                    key={opt.code}
                    type="button"
                    data-testid={`fs-audio-option-${opt.code}`}
                    onClick={() => {
                      handleSelectAudioOption(opt);
                      setShowAudioLangMenu(false);
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-colors ${
                      active
                        ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                        : 'text-white/90 hover:bg-white/12'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-tabular text-[10px] opacity-80 shrink-0">
                        {opt.shortLabel}
                      </span>
                      <span className="truncate">{opt.label}</span>
                      {opt.confirmed && !active && (
                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-white/12 text-white/75 shrink-0">
                          Detected
                        </span>
                      )}
                    </span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Fullscreen Episode + Series Comments Popup */}
          <PlayerCommentsModal
            open={isFullscreen && showCommentsModal}
            mediaId={media.id}
            mediaTitle={animeTitle}
            episodeNumber={currentEpisode.number}
            episodeTitle={currentEpisode.title}
            onClose={() => setShowCommentsModal(false)}
          />

          {/* Quick Pre-Seeded Watch Party Drawer (renders inside Player Stage matching PlayerEpisodeDrawer) */}
          {!watchPartyMode && (
            <CreateWatchRoomModal
              open={showCreateWatchPartyModal}
              variant="quick-episode"
              isFullscreen={isFullscreen}
              compact={!isFullscreen}
              initialMedia={media}
              initialEpisodes={episodes}
              initialEpisodeNumber={currentEpisode.number}
              onClose={() => setShowCreateWatchPartyModal(false)}
              onSubmit={handleWatchPartyModalSubmit}
            />
          )}
        </div>

        {/* Shared Settings Popover (Playback, Quality, Subtitle Editor) — z-40 & rotated cleanly with stage */}
        <PlayerSettingsPopover
          open={showSettingsMenu}
          onClose={() => setShowSettingsMenu(false)}
          playerPrefs={state.playerPrefs}
          onUpdatePrefs={updatePlayerPrefs}
          speed={speed}
          onChangeSpeed={setSpeed}
          muted={muted}
          onToggleMute={() => setMuted((m) => !m)}
          servers={availableServers}
          selectedServerId={selectedServer?.id}
          onSelectServer={handleSelectServer}
          hlsQualityOptions={hlsQualityOptions}
          selectedHlsLevel={selectedHlsLevel}
          onSelectHlsLevel={handleSelectHlsLevel}
          subtitleTracks={
            stream?.subtitles?.map((s) => ({ lang: s.lang, label: s.label })) || [
              { lang: 'en', label: 'English' },
            ]
          }
          activeSubLang={activeSubLang}
          activeTrackLang={activeTrack?.lang}
          onChangeSubLang={(lang) => {
            setActiveSubLang(lang);
            updatePlayerPrefs({ subtitleLanguage: lang });
          }}
          cues={effectiveCues}
          currentTime={currentTime}
          onUpdateCues={(nextCues) =>
            setEditedCuesMap((prev) => ({ ...prev, [trackKey]: nextCues }))
          }
          onResetCues={() =>
            setEditedCuesMap((prev) => {
              const copy = { ...prev };
              delete copy[trackKey];
              return copy;
            })
          }
          ambientEnabled={ambientEnabled}
          onToggleAmbient={() =>
            updatePlayerPrefs({ ambientGlow: !state.playerPrefs.ambientGlow })
          }
          onToggleNativePip={
            canUseNativePictureInPicture(
              typeof document !== 'undefined' ? document : null,
              videoRef.current,
            )
              ? () => void toggleNativePiP()
              : undefined
          }
          onOpenEpisodes={() => {
            setShowSettingsMenu(false);
            setShowEpisodeDrawer(true);
          }}
          episodeCount={episodes.length}
          compact={!isFullscreen}
          portalInline={!isFullscreen}
        />
        </div>
      </div>

      {/* Episode Navigation & Auto Controls Bar Below Player (hidden when WatchTogetherRoomPage supplies its own controls row) */}
      {!watchPartyMode?.hideBottomControlsBar && (
        <div
          data-testid="inline-player-controls-bar"
          className="mt-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-y-2 gap-x-1.5 sm:gap-2"
        >
          <button
            type="button"
            data-testid="inline-player-prev-btn"
            disabled={!navState.hasPrev}
            onClick={() => onChangeEpisodeIndex(navState.prevIndex)}
            className="order-1 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Prev</span>
          </button>

          <span className="order-2 sm:hidden text-[11px] font-extrabold text-[var(--sx-on-surface-muted)] tabular-nums">
            EP {currentEpisode.number} / {episodes.length || 1}
          </span>

          <div className="order-4 sm:order-2 w-full sm:w-auto sm:flex-1 min-w-0 grid grid-cols-3 sm:flex sm:flex-wrap items-center sm:justify-center gap-1.5 sm:gap-2">
            <button
              type="button"
              data-testid="toggle-auto-play"
              aria-pressed={autoPlay}
              onClick={() => updatePlayerPrefs({ autoPlay: !autoPlay })}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                autoPlay
                  ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                  : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  autoPlay
                    ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                    : 'bg-[var(--sx-on-surface-muted)]/60'
                }`}
              />
              <span className="truncate">Auto Play</span>
            </button>

            <button
              type="button"
              data-testid="toggle-auto-next"
              aria-pressed={autoNext}
              onClick={() => updatePlayerPrefs({ autoNextEpisode: !autoNext })}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                autoNext
                  ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                  : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  autoNext
                    ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                    : 'bg-[var(--sx-on-surface-muted)]/60'
                }`}
              />
              <span className="truncate">Auto Next</span>
            </button>

            <button
              type="button"
              data-testid="toggle-auto-skip"
              aria-pressed={autoSkip}
              onClick={() => updatePlayerPrefs({ autoSkipOp: !autoSkip, autoSkipEd: !autoSkip })}
              className={`w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-2 sm:px-3 py-1.5 rounded-full backdrop-blur-lg border text-[10px] sm:text-[11px] font-bold whitespace-nowrap transition-all ${
                autoSkip
                  ? 'bg-[var(--sx-surface-container)]/45 dark:bg-white/12 border-[var(--sx-primary)]/45 text-[var(--sx-on-surface)] shadow-sm'
                  : 'bg-[var(--sx-surface-container)]/22 dark:bg-white/5 border-white/30 dark:border-white/10 text-[var(--sx-on-surface-muted)]'
              }`}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 transition-colors ${
                  autoSkip
                    ? 'bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]'
                    : 'bg-[var(--sx-on-surface-muted)]/60'
                }`}
              />
              <span className="truncate">Auto Skip</span>
            </button>
          </div>

          <button
            type="button"
            data-testid="inline-player-next-btn"
            disabled={!navState.hasNext}
            onClick={() => onChangeEpisodeIndex(navState.nextIndex)}
            className="order-3 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-extrabold text-[var(--sx-on-surface)] hover:text-[var(--sx-primary)] disabled:opacity-35 disabled:pointer-events-none transition-colors shrink-0"
          >
            <span>Next</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </section>
  );
};

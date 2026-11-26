import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Hls from 'hls.js';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FastForward,
  Keyboard,
  Languages,
  ListVideo,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Server,
  Settings,
  SkipBack,
  SkipForward,
  Subtitles,
  Sun,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp, VideoFitMode, VideoQualityPref } from '../store/AppContext';
import { usePip } from '../store/PipContext';
import {
  getPreferredTitle,
  SourceInfo,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import { INBUILT_SOURCES, resolveVideoServers, resolveVideoStreamAsync } from '../services/sourceEngine';
import { fetchAniSkipIntervals, SkipInterval } from '../services/aniskip';
import { clampSeekTarget, formatPlayerTime } from '../utils/detailsLayout';
import { tryResolveApiUrl } from '../utils/backendConfig';
import { resolveVideoPreloadMode } from '../utils/batterySaver';
import {
  AudioLanguageCode,
  AudioLanguageOption,
  buildHlsQualityOptions,
  buildSelectableAudioOptions,
  buildSubtitleBoxCssProps,
  clampAutoSkipDestination,
  findActiveSubtitleCue,
  getEffectiveDurationSeconds,
  getManualSkipInterval,
  getVideoFitClass,
  HlsQualityOption,
  isAutoSkipEligible,
  parseSubtitleText,
  resolveAudioLanguageOption,
  resolveAvailableAudioOptions,
  resolveBatterySaverHlsLevel,
  resolveEffectiveStreamQuality,
  resolvePersistedSubtitleLang,
  resolvePreferredVideoServer,
  shouldAutoMatchAudioForServerChange,
  shouldAutoStartPlayback,
  SubtitleCue,
} from '../utils/inlinePlayer';
import {
  filterPlayableSourcesForPlayer,
  isMetadataOnlySource,
  resolveActiveSourceId,
} from '../utils/sourcePicker';
import { loadPersistedExtensionDiagnostics } from '../utils/extensionDiagnostics';
import {
  buildPlayableFailoverQueue,
  FailoverAttemptRecord,
  findNextDistinctMirrorIndex,
  formatFailoverAttemptSummary,
} from '../utils/sourceFailover';
import {
  computeSwipeSeekTarget,
  computeSwipeVerticalLevel,
  detectPlayerGestureKind,
  formatSignedSeekDelta,
  PlayerGestureKind,
} from '../utils/playerGestures';
import {
  canUseNativePictureInPicture,
  shouldAutoEnterPipOnLeave,
} from '../utils/pipPlayer';
import { PlayerEpisodeDrawer } from '../components/PlayerEpisodeDrawer';
import { PlayerSettingsPopover } from '../components/PlayerSettingsPopover';
import { SubtitleFormattedText } from '../components/SubtitleFormattedText';
import {
  EpisodeChangeDirection,
  getEpisodeBadgeTransitionClass,
  getEpisodeChangeDirection,
} from '../utils/detailsMotion';

interface PlayerLocationState {
  media?: UnifiedMedia;
  episodes?: UnifiedEpisode[];
  episodeIndex?: number;
  sourceId?: string;
  sourceName?: string;
  sourceBaseUrl?: string;
  sourceLang?: string;
  overrideTitle?: string;
  serverId?: string;
  startTime?: number;
  resumePlaying?: boolean;
  activeSubLang?: string;
  editedCuesMap?: Record<string, SubtitleCue[]>;
}

export const PlayerPage: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    state,
    updatePlayerPrefs,
    setPreferredServerForSource,
    recordHistory,
    upsertLibraryEntry,
    getLibraryEntry,
  } = useApp();
  const { pipSession, enterInAppPip, closePip } = usePip();

  const routeState = (location.state as PlayerLocationState | null) || {};
  const media: UnifiedMedia = routeState.media ?? {
    id: 'demo-anime',
    type: 'ANIME',
    title: { english: 'ShizuTv Stream Preview' },
  };
  const episodes: UnifiedEpisode[] =
    routeState.episodes && routeState.episodes.length > 0
      ? routeState.episodes
      : [{ id: 'ep-1', number: 1, title: 'Episode 1' }];

  const [epIndex, setEpIndex] = useState(routeState.episodeIndex ?? 0);
  const currentEpisode = episodes[epIndex] ?? episodes[0];

  const availableAnimeSources = useMemo(() => {
    const combined = [...INBUILT_SOURCES, ...state.customSources];
    const typeMatched = filterPlayableSourcesForPlayer(
      combined.filter(
        (s) =>
          s.mediaTypes.includes('ANIME') ||
          s.mediaTypes.includes('MOVIE') ||
          s.mediaTypes.includes('TV'),
      ),
      'ANIME',
    );
    const activeMatched = typeMatched.filter((s) =>
      state.discoveryPrefs.activeSources.includes(s.id),
    );
    return activeMatched.length > 0 ? activeMatched : typeMatched;
  }, [state.customSources, state.discoveryPrefs.activeSources]);

  const activeSourceId = useMemo(() => {
    const routeMeta = routeState.sourceId
      ? [...INBUILT_SOURCES, ...state.customSources].find((s) => s.id === routeState.sourceId)
      : undefined;
    const validRouteId =
      routeState.sourceId && !isMetadataOnlySource(routeMeta) ? routeState.sourceId : undefined;
    return (
      validRouteId ||
      resolveActiveSourceId({
        availableSources: availableAnimeSources,
        preferredSourceId: state.discoveryPrefs.preferredAnimeSourceId,
        isManga: false,
        mediaType: 'ANIME',
      })
    );
  }, [
    routeState.sourceId,
    state.customSources,
    availableAnimeSources,
    state.discoveryPrefs.preferredAnimeSourceId,
  ]);
  const activeSourceMeta = useMemo(
    () => availableAnimeSources.find((s) => s.id === activeSourceId),
    [availableAnimeSources, activeSourceId],
  );
  const [failoverSource, setFailoverSource] = useState<SourceInfo | null>(null);
  const attemptedSourceIdsRef = useRef<Set<string>>(new Set());
  const failoverAttemptsRef = useRef<FailoverAttemptRecord[]>([]);
  const handledFailureKeyRef = useRef<string>('');
  const primaryContextKey = `${media.id}::${activeSourceId}::${routeState.overrideTitle || ''}`;
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

  const effectiveSourceId = failoverSource?.id ?? activeSourceId;
  const effectiveSourceName = failoverSource?.name ?? routeState.sourceName ?? activeSourceMeta?.name;
  const effectiveSourceBaseUrl =
    failoverSource?.baseUrl ?? routeState.sourceBaseUrl ?? activeSourceMeta?.baseUrl;
  const effectiveSourceLang =
    failoverSource?.lang ?? routeState.sourceLang ?? activeSourceMeta?.lang;

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
  const [selectedServer, setSelectedServer] = useState<VideoServer>(
    () =>
      resolvePreferredVideoServer({
        servers: rawServers,
        preferredServerId: persistedServerIdForSource,
        routeServerId: routeState.serverId,
        desiredAudioCategory,
      }) ?? rawServers[0],
  );

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

    if (availableAnimeSources.length <= 1) {
      return false;
    }

    const queue = buildPlayableFailoverQueue({
      currentSourceId: currentId,
      availableSources: availableAnimeSources,
      attemptedSourceIds: attemptedSourceIdsRef.current,
      diagnosticsBySourceId: loadPersistedExtensionDiagnostics(),
      mediaType: 'ANIME',
    });

    if (queue.length > 0) {
      setFailoverSource(queue[0]);
      return true;
    }
    return false;
  };

  useEffect(() => {
    const controller = new AbortController();
    setStream(null);
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
      server: selectedServer,
      sourceId: effectiveSourceId,
      sourceName: effectiveSourceName,
      sourceBaseUrl: effectiveSourceBaseUrl,
      sourceLang: effectiveSourceLang,
      audioLanguage: state.playerPrefs.audioLanguage,
      overrideTitle: routeState.overrideTitle,
      bypassCache: streamRetryNonce > 0,
      signal: controller.signal,
    })
      .then((resolved) => {
        if (controller.signal.aborted) return;
        setStream(resolved);
        setStreamLoading(false);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        const errMsg =
          err instanceof Error ? err.message : 'Unable to resolve an active episode stream.';
        setStream(null);
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
    currentEpisode.id,
    currentEpisode.number,
    selectedServer.id,
    effectiveSourceId,
    effectiveSourceName,
    effectiveSourceBaseUrl,
    effectiveSourceLang,
    state.playerPrefs.audioLanguage,
    routeState.overrideTitle,
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
  const containerRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<number | null>(null);
  const seekFeedbackTimerRef = useRef<number | null>(null);
  const pendingStartTimeRef = useRef<number | null>(
    typeof routeState.startTime === 'number' && routeState.startTime > 0
      ? routeState.startTime
      : null,
  );
  const pendingResumePlayRef = useRef<boolean>(Boolean(routeState.resumePlaying));
  const handledPipExitRef = useRef(false);
  const lastDoubleTapAtRef = useRef<number>(0);
  const lastAutoSkippedRef = useRef<string>('');
  const lastHistorySavedAtRef = useRef<number>(0);
  const attemptAutoSkipRef = useRef<(videoEl: HTMLVideoElement | null, rawTime?: number) => void>(
    () => {},
  );

  const [playing, setPlaying] = useState(false);
  const [hasVideoFrame, setHasVideoFrame] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [brightness, setBrightness] = useState(1);
  const [speed, setSpeed] = useState(state.playerPrefs.defaultSpeed || 1);
  const [showControls, setShowControls] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeSubLang, setActiveSubLang] = useState<string>(() =>
    resolvePersistedSubtitleLang(routeState.activeSubLang, state.playerPrefs.subtitleLanguage),
  );
  const [editedCuesMap, setEditedCuesMap] = useState<Record<string, SubtitleCue[]>>(
    routeState.editedCuesMap || {},
  );
  const [hlsQualityOptions, setHlsQualityOptions] = useState<HlsQualityOption[]>([
    { index: -1, label: 'Auto' },
  ]);
  const [selectedHlsLevel, setSelectedHlsLevel] = useState<number>(-1);

  const [seekBadge, setSeekBadge] = useState<{ label: string; side: 'left' | 'right'; seq: number } | null>(
    null,
  );
  const seekSeqRef = useRef(0);
  const [epTransition, setEpTransition] = useState<{ index: number; dir: EpisodeChangeDirection }>({
    index: epIndex,
    dir: 'none',
  });
  if (epTransition.index !== epIndex) {
    setEpTransition({
      index: epIndex,
      dir: getEpisodeChangeDirection(epTransition.index, epIndex),
    });
  }
  const epBadgeAnimClass = getEpisodeBadgeTransitionClass(epTransition.dir);
  const [gestureSeekState, setGestureSeekState] = useState<{
    targetTime: number;
    deltaSeconds: number;
  } | null>(null);
  const [volumeHudVisible, setVolumeHudVisible] = useState(false);
  const [brightnessHudVisible, setBrightnessHudVisible] = useState(false);

  const hudHideTimerRef = useRef<number | null>(null);
  const suppressNextClickRef = useRef(false);
  const gestureSessionRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    localStartX: number;
    containerWidth: number;
    startTime: number;
    startVolume: number;
    startBrightness: number;
    lockedKind: PlayerGestureKind;
    hasMoved: boolean;
  } | null>(null);

  const [showEpisodeDrawer, setShowEpisodeDrawer] = useState(false);
  const [showAudioLangMenu, setShowAudioLangMenu] = useState(false);
  const [showServerMenu, setShowServerMenu] = useState(false);
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [skipIntervals, setSkipIntervals] = useState<SkipInterval[]>([]);

  const autoPlay = state.playerPrefs.autoPlay;
  const fitMode: VideoFitMode = state.playerPrefs.videoFit || 'contain';
  const subtitlesOn = state.playerPrefs.subtitleEnabled;

  // Close floating PiP session if user opened dedicated PlayerPage
  useEffect(() => {
    if (pipSession) {
      closePip();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attach HLS or native MP4 stream — strictly respects persisted autoPlay preference and PiP restore timestamp
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
    setPlaying(false);
    setCurrentTime(resumeAt ?? 0);
    setDuration(0);
    setHlsQualityOptions([{ index: -1, label: 'Auto' }]);
    setSelectedHlsLevel(-1);

    const shouldStart = shouldAutoStartPlayback(autoPlay, resumePlay);
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
        setHlsQualityOptions(buildHlsQualityOptions(hls.levels));
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

  // Dynamically apply Battery Saver 480p cap on active HLS streams
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

  // Fetch AniSkip intervals for current episode
  useEffect(() => {
    setSkipIntervals([]);
    fetchAniSkipIntervals(media.idMal, currentEpisode.number).then(setSkipIntervals);
  }, [media.idMal, currentEpisode.number]);

  // Record Watch History & update library progress if watching
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
  }, [epIndex, playing]);

  useEffect(() => {
    if (!playing) return;
    if (Date.now() - lastHistorySavedAtRef.current >= 10000) {
      persistPlaybackHistory(currentTime, duration);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, Math.floor(currentTime / 10)]);

  const scheduleHideControls = (currentlyPlaying = playing) => {
    setShowControls(true);
    if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
    if (
      currentlyPlaying &&
      !showEpisodeDrawer &&
      !showAudioLangMenu &&
      !showServerMenu &&
      !showSettingsMenu &&
      !showShortcuts
    ) {
      hideTimerRef.current = window.setTimeout(() => {
        setShowControls(false);
      }, 3200);
    }
  };

  const triggerSeekFeedback = (delta: number) => {
    const label = delta > 0 ? `+${delta}s` : `${delta}s`;
    const side: 'left' | 'right' = delta < 0 ? 'left' : 'right';
    seekSeqRef.current += 1;
    setSeekBadge({ label, side, seq: seekSeqRef.current });
    if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
    seekFeedbackTimerRef.current = window.setTimeout(() => setSeekBadge(null), 650);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      scheduleHideControls(true);
    } else {
      v.pause();
      scheduleHideControls(false);
    }
  };

  const seekBy = (delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = clampSeekTarget(v.currentTime, delta, v.duration || duration || 1440);
    v.currentTime = next;
    setCurrentTime(next);
    triggerSeekFeedback(delta);
    scheduleHideControls();
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      await containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
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

  const latestSnapshotRef = useRef({
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    epIndex,
    sourceId: activeSourceId,
    sourceName: effectiveSourceName,
    sourceBaseUrl: effectiveSourceBaseUrl,
    sourceLang: effectiveSourceLang,
    overrideTitle: routeState.overrideTitle,
    serverId: selectedServer.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    volume,
    activeSubLang,
    editedCuesMap,
  });
  latestSnapshotRef.current = {
    autoPip: state.playerPrefs.autoPip,
    media,
    episodes,
    epIndex,
    sourceId: activeSourceId,
    sourceName: effectiveSourceName,
    sourceBaseUrl: effectiveSourceBaseUrl,
    sourceLang: effectiveSourceLang,
    overrideTitle: routeState.overrideTitle,
    serverId: selectedServer.id,
    currentTime,
    duration,
    playing,
    speed,
    muted,
    volume,
    activeSubLang,
    editedCuesMap,
  };

  const enterPipAndBrowse = () => {
    handledPipExitRef.current = true;
    const v = videoRef.current;
    const liveTime = v?.currentTime ?? currentTime;
    const liveDuration = v?.duration || duration || (currentEpisode.durationSeconds ?? 1440);
    const livePlaying = v ? !v.paused : playing;
    if (v && !v.paused) {
      v.pause();
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    enterInAppPip({
      media,
      episodes,
      episodeIndex: epIndex,
      sourceId: activeSourceId,
      sourceName: effectiveSourceName,
      sourceBaseUrl: effectiveSourceBaseUrl,
      sourceLang: effectiveSourceLang,
      overrideTitle: routeState.overrideTitle,
      serverId: selectedServer.id,
      currentTime: liveTime,
      duration: liveDuration,
      playing: livePlaying,
      speed,
      muted,
      volume,
      activeSubLang,
      editedCuesMap,
    });
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  const handleLeavePlayer = () => {
    const v = videoRef.current;
    const isActivelyPlaying = Boolean(v && !v.paused) || playing;
    if (
      shouldAutoEnterPipOnLeave({
        enabled: state.playerPrefs.autoPip,
        isPlaying: isActivelyPlaying,
        ended: Boolean(v?.ended),
        alreadyHandled: handledPipExitRef.current,
      })
    ) {
      enterPipAndBrowse();
      return;
    }
    handledPipExitRef.current = true;
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/home');
    }
  };

  // Automatically enter PiP if user leaves /player (e.g. browser back/popstate or link) while actively playing
  useEffect(() => {
    const videoEl = videoRef.current;
    return () => {
      if (typeof window !== 'undefined' && window.location.pathname === '/player') {
        return;
      }
      const snap = latestSnapshotRef.current;
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
      const currentEp = snap.episodes[snap.epIndex] ?? snap.episodes[0];
      const liveTime = v?.currentTime ?? snap.currentTime;
      const liveDuration = v?.duration || snap.duration || currentEp?.durationSeconds || 1440;
      if (v && !v.paused) {
        v.pause();
      }
      enterInAppPip({
        media: snap.media,
        episodes: snap.episodes,
        episodeIndex: snap.epIndex,
        sourceId: snap.sourceId,
        sourceName: snap.sourceName,
        sourceBaseUrl: snap.sourceBaseUrl,
        sourceLang: snap.sourceLang,
        overrideTitle: snap.overrideTitle,
        serverId: snap.serverId,
        currentTime: liveTime,
        duration: liveDuration,
        playing: true,
        speed: snap.speed,
        muted: snap.muted,
        volume: snap.volume,
        activeSubLang: snap.activeSubLang,
        editedCuesMap: snap.editedCuesMap,
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) window.clearTimeout(hideTimerRef.current);
      if (seekFeedbackTimerRef.current) window.clearTimeout(seekFeedbackTimerRef.current);
      if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

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

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (showEpisodeDrawer || showAudioLangMenu || showServerMenu || showSettingsMenu || showShortcuts) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('button, input, select, a, [data-no-gesture="true"]')) return;

    const rect = e.currentTarget.getBoundingClientRect();
    gestureSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      localStartX: e.clientX - rect.left,
      containerWidth: rect.width || window.innerWidth || 360,
      startTime: videoRef.current?.currentTime ?? currentTime,
      startVolume: muted ? 0 : volume,
      startBrightness: brightness,
      lockedKind: 'none',
      hasMoved: false,
    };
    suppressNextClickRef.current = false;
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = gestureSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.lockedKind === 'none') {
      const kind = detectPlayerGestureKind(dx, dy, session.localStartX, session.containerWidth);
      if (kind === 'none') return;
      session.lockedKind = kind;
      session.hasMoved = true;
      suppressNextClickRef.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture is unsupported
      }
    }

    if (hudHideTimerRef.current) window.clearTimeout(hudHideTimerRef.current);

    if (session.lockedKind === 'seek') {
      const effectiveDur = duration || videoRef.current?.duration || 1440;
      const preview = computeSwipeSeekTarget(
        session.startTime,
        dx,
        session.containerWidth,
        effectiveDur,
      );
      setGestureSeekState(preview);
    } else if (session.lockedKind === 'volume') {
      const nextVol = computeSwipeVerticalLevel(session.startVolume, dy, 220, 0, 1);
      applyVolumeLevel(nextVol);
    } else if (session.lockedKind === 'brightness') {
      const nextBright = computeSwipeVerticalLevel(session.startBrightness, dy, 220, 0.25, 1);
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
      const dx = e.clientX - session.startX;
      const effectiveDur = duration || videoRef.current?.duration || 1440;
      const finalSeek = computeSwipeSeekTarget(
        session.startTime,
        dx,
        session.containerWidth,
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

    if (session.hasMoved) {
      window.setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 100);
    }
  };

  const handleStageWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (showEpisodeDrawer || showAudioLangMenu || showServerMenu || showSettingsMenu || showShortcuts) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-gesture="true"]')) return;
    if (Math.abs(e.deltaY) < 2) return;
    const step = e.deltaY < 0 ? 0.05 : -0.05;
    applyVolumeLevel((muted ? 0 : volume) + step);
    flashHudHide();
  };

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key.toLowerCase()) {
        case ' ':
        case 'k':
          e.preventDefault();
          togglePlay();
          break;
        case 'arrowleft':
          seekBy(-10);
          break;
        case 'arrowright':
          seekBy(10);
          break;
        case 'arrowup':
          e.preventDefault();
          applyVolumeLevel((muted ? 0 : volume) + 0.05);
          flashHudHide();
          break;
        case 'arrowdown':
          e.preventDefault();
          applyVolumeLevel((muted ? 0 : volume) - 0.05);
          flashHudHide();
          break;
        case 'm':
          setMuted((m) => {
            if (videoRef.current) videoRef.current.muted = !m;
            return !m;
          });
          break;
        case 'f':
          void toggleFullscreen();
          break;
        case 'n':
          if (epIndex < episodes.length - 1) setEpIndex((i) => i + 1);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

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

  // Auto-skip OP/Recap/ED reliably & suppress manual button when enabled
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
      } catch {
        // Ignore seek errors before ready
      }
    }
  };
  attemptAutoSkipRef.current = attemptAutoSkip;

  useEffect(() => {
    attemptAutoSkipRef.current(videoRef.current);
  }, [mergedSkipIntervals, state.playerPrefs.autoSkipOp, state.playerPrefs.autoSkipEd]);

  // High-frequency time sync while playing for zero-lag subtitle matching and reliable auto-skip
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

  // Active subtitle cue with live edits, remote VTT loading & sync offset
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

  const availableAudioOptions = useMemo(
    () => resolveAvailableAudioOptions(stream?.availableAudios),
    [stream?.availableAudios],
  );
  const selectableAudioOptions = useMemo(
    () => buildSelectableAudioOptions(stream?.availableAudios, effectiveSourceLang),
    [stream?.availableAudios, effectiveSourceLang],
  );
  const activeAudioLangOption = resolveAudioLanguageOption(
    state.playerPrefs.audioLanguage,
    selectableAudioOptions,
  );
  const hasDubAudio = availableAudioOptions.some((a) => a.serverCategory === 'dub');
  const servers = useMemo(() => {
    if (!stream) return rawServers;
    const filtered = rawServers.filter(
      (s) => s.category !== 'dub' || hasDubAudio || desiredAudioCategory === 'dub',
    );
    return filtered.length > 0 ? filtered : rawServers;
  }, [rawServers, stream, hasDubAudio, desiredAudioCategory]);

  useEffect(() => {
    if (!stream || !selectedServer) return;
    if (desiredAudioCategory === 'sub' && selectedServer.category === 'dub' && !hasDubAudio) {
      const subServer = servers.find((s) => s.category === 'sub') ?? servers[0];
      if (subServer && subServer.id !== selectedServer.id) {
        setSelectedServer(subServer);
      }
    }
  }, [stream, desiredAudioCategory, hasDubAudio, selectedServer, servers]);

  const handleSelectAudioOption = (opt: AudioLanguageOption) => {
    updatePlayerPrefs({ audioLanguage: opt.code as AudioLanguageCode });
    const matchingServer = resolvePreferredVideoServer({
      servers,
      preferredServerId: persistedServerIdForSource,
      desiredAudioCategory: opt.serverCategory,
    });
    if (matchingServer && matchingServer.id !== selectedServer?.id) {
      setSelectedServer(matchingServer);
    }
  };

  const handleSelectServer = (srv: VideoServer) => {
    setSelectedServer(srv);
    if (activeSourceId) {
      setPreferredServerForSource(activeSourceId, srv.id);
    }
    updatePlayerPrefs({
      audioLanguage: shouldAutoMatchAudioForServerChange(
        state.playerPrefs.audioLanguage,
        srv.category,
      ),
    });
  };

  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const backdropArtwork = currentEpisode.thumbnail || media.banner || media.cover || '';
  const effectiveDuration = duration || 1440;
  const progressRatio =
    effectiveDuration > 0 ? Math.min(100, (currentTime / effectiveDuration) * 100) : 0;
  const gestureSeekRatio =
    gestureSeekState && effectiveDuration > 0
      ? Math.min(100, (gestureSeekState.targetTime / effectiveDuration) * 100)
      : progressRatio;
  const volumePercent = Math.round((muted ? 0 : volume) * 100);
  const brightnessPercent = Math.round(brightness * 100);
  const awaitingAutoFrame =
    Boolean(activeStreamUrl) &&
    !hasVideoFrame &&
    !autoplayBlocked &&
    (autoPlay || playing || pendingResumePlayRef.current);
  const isLoadingOrBuffering = !streamError && (streamLoading || isBuffering || awaitingAutoFrame);
  const hasActiveOverlay =
    showAudioLangMenu || showServerMenu || showSettingsMenu || showEpisodeDrawer || showShortcuts;
  const controlsVisible =
    isLoadingOrBuffering && !hasActiveOverlay
      ? false
      : showControls || !playing || hasActiveOverlay;

  const activeQualityLabel = useMemo(() => {
    const effectivePref = resolveEffectiveStreamQuality(
      state.playerPrefs.defaultQuality,
      state.playerPrefs.batterySaver,
    );
    if (hlsQualityOptions.length > 1) {
      const found = hlsQualityOptions.find((o) => o.index === selectedHlsLevel);
      if (found) {
        if (state.playerPrefs.batterySaver && found.index === -1) {
          return effectivePref.toUpperCase();
        }
        return found.label;
      }
    }
    return effectivePref.toUpperCase();
  }, [
    hlsQualityOptions,
    selectedHlsLevel,
    state.playerPrefs.defaultQuality,
    state.playerPrefs.batterySaver,
  ]);

  return (
    <div
      ref={containerRef}
      data-testid="player-stage"
      onPointerDown={handleStagePointerDown}
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerEnd}
      onPointerCancel={handleStagePointerEnd}
      onWheel={handleStageWheel}
      onMouseMove={() => scheduleHideControls()}
      onTouchStart={() => scheduleHideControls()}
      className="sx-player-stage-enter relative w-full h-[100dvh] bg-black text-white overflow-hidden select-none flex items-center justify-center touch-none"
    >
      {backdropArtwork && (
        <img
          src={backdropArtwork}
          alt=""
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 w-full h-full object-cover blur-md scale-105 transition-opacity duration-500 ${
            hasVideoFrame ? 'opacity-0' : 'opacity-40'
          }`}
        />
      )}
      {isLoadingOrBuffering && (
        <div
          data-testid="player-buffering"
          aria-live="polite"
          className="pointer-events-none absolute inset-0 z-[25] flex items-center justify-center overflow-hidden p-4"
        >
          {!hasVideoFrame && (
            <>
              <div
                className="absolute inset-0 opacity-60"
                style={{
                  background:
                    'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--sx-player-accent) 24%, transparent), transparent 65%)',
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
          data-testid="player-stream-error"
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md text-center"
        >
          <div className="max-w-sm rounded-3xl bg-zinc-950/92 border border-white/15 px-5 py-4 shadow-2xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-extrabold text-amber-300">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>Stream Unavailable</span>
            </div>
            <p className="text-xs text-white/80 leading-relaxed">{streamError}</p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  attemptedSourceIdsRef.current = new Set();
                  failoverAttemptsRef.current = [];
                  handledFailureKeyRef.current = '';
                  setFailoverSource(null);
                  setStreamRetryNonce((n) => n + 1);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-xs font-extrabold shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              {servers.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const idx = servers.findIndex((s) => s.id === selectedServer.id);
                    const nextSrv = servers[(idx + 1) % servers.length];
                    if (nextSrv) handleSelectServer(nextSrv);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white/12 hover:bg-white/20 border border-white/15 text-xs font-bold text-white transition-colors"
                >
                  <span>Switch Server</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      <video
        ref={videoRef}
        autoPlay={false}
        playsInline
        preload={resolveVideoPreloadMode(state.playerPrefs.batterySaver)}
        style={brightness < 1 ? { filter: `brightness(${brightness})` } : undefined}
        onClick={() => {
          if (showAudioLangMenu || showServerMenu || showSettingsMenu || showEpisodeDrawer) {
            setShowAudioLangMenu(false);
            setShowServerMenu(false);
            setShowSettingsMenu(false);
            setShowEpisodeDrawer(false);
            return;
          }
          if (suppressNextClickRef.current) {
            suppressNextClickRef.current = false;
            return;
          }
          togglePlay();
        }}
        onDoubleClick={(e) => {
          if (suppressNextClickRef.current) return;
          const now = Date.now();
          if (now - lastDoubleTapAtRef.current < 260) return;
          lastDoubleTapAtRef.current = now;
          const rect = e.currentTarget.getBoundingClientRect();
          const isLeft = e.clientX - rect.left < rect.width / 2;
          seekBy(isLeft ? -10 : 10);
        }}
        onPlay={() => {
          setAutoplayBlocked(false);
          setPlaying(true);
          scheduleHideControls(true);
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
          if (state.playerPrefs.autoNextEpisode && epIndex < episodes.length - 1) {
            setEpIndex((i) => i + 1);
          } else {
            setPlaying(false);
            setShowControls(true);
          }
        }}
        className={`w-full h-full max-w-full max-h-full ${getVideoFitClass(
          fitMode,
        )} transition-opacity duration-300 ${hasVideoFrame ? 'opacity-100' : 'opacity-0'}`}
      />

      {/* Double-tap Seek Radial Ripple & HUD */}
      {seekBadge && (
        <>
          <div
            key={`full-ripple-${seekBadge.seq}`}
            aria-hidden="true"
            className={`pointer-events-none absolute inset-y-0 w-1/2 z-20 ${
              seekBadge.side === 'left'
                ? 'left-0 sx-seek-ripple-left bg-gradient-to-r from-white/20 via-white/10 to-transparent rounded-r-full'
                : 'right-0 sx-seek-ripple-right bg-gradient-to-l from-white/20 via-white/10 to-transparent rounded-l-full'
            }`}
          />
          <div
            key={`full-badge-${seekBadge.seq}`}
            className={`sx-player-badge-pop pointer-events-none absolute top-1/2 z-30 px-4 py-2 rounded-full bg-black/70 backdrop-blur-xl border border-white/20 text-sm font-black tracking-wide shadow-2xl ${
              seekBadge.side === 'left' ? 'left-8 sm:left-16' : 'right-8 sm:right-16'
            }`}
          >
            {seekBadge.label}
          </div>
        </>
      )}

      {/* Horizontal Swipe-to-Seek Live Gesture HUD */}
      {gestureSeekState && (
        <div
          data-testid="player-gesture-seek-hud"
          className="sx-player-center-hud pointer-events-none absolute top-1/2 left-1/2 z-30 min-w-[220px] px-6 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl text-center space-y-2"
        >
          <p className="text-xl font-black font-mono-tabular tracking-tight text-white">
            {formatSignedSeekDelta(gestureSeekState.deltaSeconds)}
          </p>
          <p className="text-xs font-bold font-mono-tabular text-white/85">
            {formatPlayerTime(gestureSeekState.targetTime)} /{' '}
            {formatPlayerTime(effectiveDuration)}
          </p>
          <div className="h-1.5 w-full rounded-full bg-white/25 overflow-hidden">
            <div
              style={{ width: `${gestureSeekRatio}%` }}
              className="h-full rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.65)] transition-[width] duration-75"
            />
          </div>
        </div>
      )}

      {/* Vertical Right Swipe Volume HUD */}
      {volumeHudVisible && (
        <div
          data-testid="player-gesture-volume-hud"
          className="sx-player-badge-pop pointer-events-none absolute right-5 sm:right-12 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/75 backdrop-blur-2xl border border-white/25 shadow-2xl flex flex-col items-center gap-2.5"
        >
          {volumePercent === 0 ? (
            <VolumeX className="w-5 h-5 text-white/85" />
          ) : (
            <Volume2 className="w-5 h-5 text-white" />
          )}
          <div className="w-2 h-28 rounded-full bg-white/25 overflow-hidden flex items-end">
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
          className="sx-player-badge-pop pointer-events-none absolute left-5 sm:left-12 top-1/2 z-30 px-3 py-4 rounded-3xl bg-black/70 backdrop-blur-2xl border border-white/20 shadow-2xl flex flex-col items-center gap-2.5"
        >
          <Sun className="w-5 h-5 text-[var(--sx-player-accent)]" />
          <div className="w-2 h-28 rounded-full bg-white/20 overflow-hidden flex items-end">
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

      {/* Custom Subtitle Overlay */}
      {activeCue && (
        <div
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
          className={`pointer-events-none absolute inset-x-6 flex justify-center z-20 ${
            state.playerPrefs.subtitleAnimation ? 'transition-all duration-200' : ''
          } ${
            state.playerPrefs.subtitlePosition === 'top'
              ? 'top-20'
              : controlsVisible
                ? 'bottom-32 sm:bottom-28'
                : 'bottom-10'
          }`}
        >
          <p
            key={state.playerPrefs.subtitleAnimation ? activeCue.text : 'static-sub'}
            style={buildSubtitleBoxCssProps(state.playerPrefs, state.playerPrefs.subtitleSize)}
            className={`${
              state.playerPrefs.subtitleAnimation
                ? 'sx-player-subtitle-enter transition-all duration-200'
                : ''
            } px-4 py-1.5 rounded-2xl text-center max-w-3xl leading-snug whitespace-pre-line ${
              state.playerPrefs.subtitleBackground ? 'backdrop-blur-md border border-white/10' : ''
            }`}
          >
            <SubtitleFormattedText text={activeCue.text} />
          </p>
        </div>
      )}

      {/* Controls Overlay */}
      <div
        className={`sx-player-controls-fade absolute inset-0 z-20 flex flex-col justify-between pointer-events-none p-3 sm:p-5 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        {/* Top Frosted Floating Header */}
        <div
          className={`relative flex items-center justify-between gap-2 sm:gap-3 transition-transform duration-300 ${
            controlsVisible ? 'pointer-events-auto translate-y-0' : 'pointer-events-none -translate-y-3'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 shadow-xl max-w-[56%] sm:max-w-[60%]">
            <button
              type="button"
              data-testid="player-back-btn"
              onClick={handleLeavePlayer}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center shrink-0 transition-colors"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div
              key={`full-ep-title-${currentEpisode.id}`}
              className={`${epBadgeAnimClass} min-w-0 pr-1.5`}
            >
              <p className="text-xs sm:text-sm font-extrabold truncate">{title}</p>
              <p className="text-[11px] text-white/75 truncate">
                EP {currentEpisode.number}: {currentEpisode.title}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {failoverSource && !streamError && (
              <span
                data-testid="player-failover-badge"
                title={`Auto-switched to ${failoverSource.name}`}
                className="inline-flex items-center px-2.5 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/35 text-[10px] sm:text-[10.5px] font-extrabold text-emerald-200 max-w-[118px] sm:max-w-[220px]"
              >
                <span className="truncate">Fallback: {failoverSource.name}</span>
              </span>
            )}
            <span className="hidden md:inline-flex items-center px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 text-[11px] font-extrabold tracking-wide">
              {activeQualityLabel}
            </span>
            <button
              type="button"
              data-testid="player-audio-lang-btn"
              aria-label={`Audio language: ${activeAudioLangOption.label}`}
              onClick={() => {
                setShowAudioLangMenu((v) => !v);
                setShowServerMenu(false);
                setShowSettingsMenu(false);
                setShowEpisodeDrawer(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full backdrop-blur-2xl border text-xs font-bold shadow-xl transition-colors ${
                showAudioLangMenu
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                  : 'bg-black/55 border-white/15 hover:bg-white/15 text-white'
              }`}
              title={`Audio: ${activeAudioLangOption.label}`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="font-mono-tabular">{activeAudioLangOption.shortLabel}</span>
            </button>
            <button
              type="button"
              aria-label="Select stream server"
              onClick={() => {
                setShowServerMenu((v) => !v);
                setShowAudioLangMenu(false);
                setShowSettingsMenu(false);
                setShowEpisodeDrawer(false);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 text-xs font-bold shadow-xl transition-colors"
            >
              <Server className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{selectedServer.name}</span>
            </button>
            <button
              type="button"
              data-testid="player-episodes-btn"
              aria-label="Episode list"
              onClick={() => {
                setShowEpisodeDrawer((v) => !v);
                setShowAudioLangMenu(false);
                setShowSettingsMenu(false);
                setShowServerMenu(false);
              }}
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-full backdrop-blur-2xl border text-xs font-bold shadow-xl transition-colors ${
                showEpisodeDrawer
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                  : 'bg-black/55 border-white/15 hover:bg-white/15 text-white'
              }`}
            >
              <ListVideo className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Episodes</span>
            </button>
            <button
              type="button"
              data-testid="player-settings-btn"
              aria-label="Player settings"
              onClick={() => {
                setShowSettingsMenu((v) => !v);
                setShowAudioLangMenu(false);
                setShowServerMenu(false);
                setShowEpisodeDrawer(false);
              }}
              className={`w-9 h-9 rounded-full backdrop-blur-2xl border flex items-center justify-center shadow-xl transition-transform duration-300 ${
                showSettingsMenu
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)] rotate-45'
                  : 'bg-black/55 border-white/15 hover:bg-white/15 text-white'
              }`}
              title="Player Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowShortcuts(true)}
              className="hidden sm:flex w-9 h-9 rounded-full bg-black/55 backdrop-blur-2xl border border-white/15 hover:bg-white/15 items-center justify-center shadow-xl transition-colors"
              title="Keyboard Shortcuts"
              aria-label="Keyboard Shortcuts"
            >
              <Keyboard className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Center Tactile Controls */}
        <div
          className={`flex items-center justify-center gap-4 sm:gap-8 transition-all duration-300 ${
            gestureSeekState
              ? 'opacity-15 scale-90 pointer-events-none'
              : showAudioLangMenu || showSettingsMenu || showServerMenu || showEpisodeDrawer
                ? 'opacity-0 scale-90 pointer-events-none'
                : controlsVisible
                  ? 'opacity-100 scale-100 pointer-events-auto'
                  : 'opacity-0 scale-95 pointer-events-none'
          }`}
        >
          <button
            type="button"
            disabled={epIndex <= 0}
            onClick={() => setEpIndex((i) => Math.max(0, i - 1))}
            className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg"
            title="Previous Episode"
            aria-label="Previous Episode"
          >
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => seekBy(-10)}
            className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 flex items-center justify-center transition-all shadow-lg"
            title="Rewind 10s"
            aria-label="Rewind 10s"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
          <button
            type="button"
            data-testid="player-play-btn"
            onClick={togglePlay}
            className="sx-player-play-btn w-16 h-16 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-2xl flex items-center justify-center border border-white/20"
            title={playing ? 'Pause' : 'Play'}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <Pause key="full-pause" className="sx-player-icon-pop w-7 h-7 fill-current" />
            ) : (
              <Play key="full-play" className="sx-player-icon-pop w-7 h-7 fill-current ml-0.5" />
            )}
          </button>
          <button
            type="button"
            onClick={() => seekBy(10)}
            className="w-12 h-12 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 flex items-center justify-center transition-all shadow-lg"
            title="Forward 10s"
            aria-label="Forward 10s"
          >
            <RotateCw className="w-5 h-5" />
          </button>
          <button
            type="button"
            disabled={epIndex >= episodes.length - 1}
            onClick={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
            className="w-11 h-11 rounded-full bg-black/55 backdrop-blur-xl border border-white/15 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-all shadow-lg"
            title="Next Episode"
            aria-label="Next Episode"
          >
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        {/* Bottom Floating Frosted Control Dock */}
        <div
          className={`space-y-2.5 transition-transform duration-300 ${
            controlsVisible ? 'pointer-events-auto translate-y-0' : 'pointer-events-none translate-y-3'
          }`}
        >
          {/* Quick Skip Pills Row */}
          <div className="flex items-center justify-end gap-2">
            {activeSkip && (
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
                  }
                }}
                className="sx-player-skip-pill inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-xs font-extrabold shadow-xl hover:scale-105 transition-transform"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Skip {activeSkip.skipType.toUpperCase()}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => seekBy(85)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/15 hover:bg-white/15 text-xs font-extrabold shadow-lg transition-colors"
              title="Skip Intro (+85s)"
            >
              <FastForward className="w-3.5 h-3.5" />
              <span>+85s Intro</span>
            </button>
          </div>

          <div
            style={{ borderRadius: `${Math.min(state.themePrefs.uiRoundness, 24)}px` }}
            className="bg-black/60 backdrop-blur-2xl border border-white/15 px-4 py-3 space-y-2.5 shadow-2xl"
          >
            {/* Progress Slider */}
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono-tabular text-white/85 w-12 text-right">
                {formatPlayerTime(currentTime)}
              </span>
              <div className="group/scrubber relative flex-1 flex items-center h-4">
                <div className="pointer-events-none absolute inset-x-0 h-1.5 rounded-full bg-white/25 overflow-hidden">
                  <div
                    style={{ width: `${progressRatio}%` }}
                    className="h-full bg-[var(--sx-player-accent)] rounded-full transition-[width] duration-100"
                  />
                </div>
                <div
                  aria-hidden="true"
                  style={{ left: `calc(${progressRatio}% - 6px)` }}
                  className="pointer-events-none absolute w-3 h-3 rounded-full bg-white ring-2 ring-[var(--sx-player-accent)] shadow-md transition-transform duration-150 group-hover/scrubber:scale-125"
                />
                <input
                  type="range"
                  aria-label="Playback position"
                  min={0}
                  max={duration || 100}
                  value={currentTime}
                  onChange={(e) => {
                    const t = Number(e.target.value);
                    if (videoRef.current) videoRef.current.currentTime = t;
                    setCurrentTime(t);
                  }}
                  className="relative z-10 w-full opacity-0 cursor-pointer h-4"
                />
              </div>
              <span className="text-[11px] font-mono-tabular text-white/75 w-12">
                {formatPlayerTime(duration)}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const next = !muted;
                    setMuted(next);
                    if (videoRef.current) videoRef.current.muted = next;
                  }}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-4 h-4" />
                  ) : (
                    <Volume2 className="w-4 h-4" />
                  )}
                </button>
                <input
                  type="range"
                  aria-label="Volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={muted ? 0 : volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    setMuted(val === 0);
                    if (videoRef.current) {
                      videoRef.current.volume = val;
                      videoRef.current.muted = val === 0;
                    }
                  }}
                  className="w-16 sm:w-24 accent-[var(--sx-player-accent)] cursor-pointer"
                />
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                <button
                  type="button"
                  data-testid="player-toggle-autoplay"
                  aria-pressed={autoPlay}
                  onClick={() => updatePlayerPrefs({ autoPlay: !autoPlay })}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    autoPlay
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      autoPlay ? 'bg-[var(--sx-player-accent)]' : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Play</span>
                </button>

                <button
                  type="button"
                  data-testid="player-toggle-autonext"
                  aria-pressed={state.playerPrefs.autoNextEpisode}
                  onClick={() =>
                    updatePlayerPrefs({ autoNextEpisode: !state.playerPrefs.autoNextEpisode })
                  }
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    state.playerPrefs.autoNextEpisode
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      state.playerPrefs.autoNextEpisode
                        ? 'bg-[var(--sx-player-accent)]'
                        : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Next</span>
                </button>

                <button
                  type="button"
                  data-testid="player-toggle-autoskip"
                  aria-pressed={state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd}
                  onClick={() => {
                    const next = !(state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd);
                    updatePlayerPrefs({ autoSkipOp: next, autoSkipEd: next });
                  }}
                  className={`inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-[11px] font-bold transition-colors border ${
                    state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd
                      ? 'bg-[var(--sx-player-accent)]/20 text-[var(--sx-player-accent)] border-[var(--sx-player-accent)]/45'
                      : 'bg-white/10 border-transparent text-white/70 hover:bg-white/20'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      state.playerPrefs.autoSkipOp || state.playerPrefs.autoSkipEd
                        ? 'bg-[var(--sx-player-accent)]'
                        : 'bg-white/45'
                    }`}
                  />
                  <span>Auto Skip</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const speeds = [0.75, 1, 1.25, 1.5, 2];
                    const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length];
                    setSpeed(next);
                    updatePlayerPrefs({ defaultSpeed: next });
                    if (videoRef.current) videoRef.current.playbackRate = next;
                  }}
                  className="px-2 sm:px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] sm:text-xs font-mono-tabular font-bold transition-colors"
                >
                  {speed}x
                </button>

                <button
                  type="button"
                  onClick={() => updatePlayerPrefs({ subtitleEnabled: !subtitlesOn })}
                  className={`inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-bold transition-colors ${
                    subtitlesOn
                      ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                      : 'bg-white/10 hover:bg-white/20'
                  }`}
                >
                  <Subtitles className="w-3.5 h-3.5" />
                  <span>{activeSubLang.toUpperCase()}</span>
                </button>

                <button
                  type="button"
                  data-testid="player-fit-btn"
                  onClick={() => {
                    const modes: VideoFitMode[] = ['contain', 'cover', 'fill'];
                    const next = modes[(modes.indexOf(fitMode) + 1) % modes.length];
                    updatePlayerPrefs({ videoFit: next });
                  }}
                  className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[10px] sm:text-[11px] font-bold transition-colors"
                  title={`Aspect Fit: ${fitMode}`}
                >
                  <RectangleHorizontal className="w-3.5 h-3.5" />
                  <span className="capitalize">
                    {fitMode === 'contain' ? 'Fit' : fitMode === 'cover' ? 'Zoom' : 'Fill'}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="player-pip-btn"
                  onClick={enterPipAndBrowse}
                  title="Picture in Picture (continue watching while browsing)"
                  aria-label="Picture in Picture"
                  className="flex p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  <PictureInPicture2 className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  aria-label={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
                  className="p-1.5 rounded-full hover:bg-white/15 transition-colors"
                >
                  {isFullscreen ? (
                    <Minimize className="w-4 h-4" />
                  ) : (
                    <Maximize className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Audio Language Selector Popover */}
      {showAudioLangMenu && (
        <div
          data-no-gesture="true"
          data-testid="player-audio-lang-popover"
          onClick={(e) => e.stopPropagation()}
          className="sx-player-popover absolute top-16 right-4 sm:right-6 z-40 w-68 rounded-3xl bg-zinc-950/92 backdrop-blur-2xl border border-white/15 p-3 space-y-1 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-extrabold">Audio Language</span>
            <button
              type="button"
              onClick={() => setShowAudioLangMenu(false)}
              className="p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {selectableAudioOptions.map((opt) => {
            const active = opt.code === activeAudioLangOption.code;
            return (
              <button
                key={opt.code}
                type="button"
                data-testid={`player-audio-option-${opt.code}`}
                onClick={() => {
                  handleSelectAudioOption(opt);
                  setShowAudioLangMenu(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-2xl text-xs font-bold transition-colors ${
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

      {/* Server Selector Popover */}
      {showServerMenu && (
        <div
          data-no-gesture="true"
          className="sx-player-popover absolute top-16 right-4 sm:right-6 z-40 w-64 rounded-3xl bg-zinc-950/90 backdrop-blur-2xl border border-white/15 p-3.5 space-y-1.5 shadow-2xl"
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-xs font-extrabold">Select Server</span>
            <button
              type="button"
              onClick={() => setShowServerMenu(false)}
              className="p-1 rounded-full hover:bg-white/10"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {servers.map((srv) => (
            <button
              key={srv.id}
              type="button"
              onClick={() => {
                handleSelectServer(srv);
                setShowServerMenu(false);
              }}
              className={`w-full text-left px-3.5 py-2.5 rounded-2xl text-xs font-bold transition-colors ${
                selectedServer.id === srv.id
                  ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)]'
                  : 'hover:bg-white/10'
              }`}
            >
              {srv.name}
            </button>
          ))}
        </div>
      )}

      {/* Player Settings Popover (Playback, Quality, Subtitle Editor) */}
      <PlayerSettingsPopover
        open={showSettingsMenu}
        onClose={() => setShowSettingsMenu(false)}
        playerPrefs={state.playerPrefs}
        onUpdatePrefs={updatePlayerPrefs}
        speed={speed}
        onChangeSpeed={(s) => {
          setSpeed(s);
          if (videoRef.current) videoRef.current.playbackRate = s;
        }}
        muted={muted}
        onToggleMute={() => {
          setMuted((m) => {
            if (videoRef.current) videoRef.current.muted = !m;
            return !m;
          });
        }}
        servers={servers}
        selectedServerId={selectedServer.id}
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
        onOpenShortcuts={() => setShowShortcuts(true)}
      />

      {/* Smooth Slide-over Episode Drawer */}
      <PlayerEpisodeDrawer
        open={showEpisodeDrawer}
        episodes={episodes}
        activeIndex={epIndex}
        onSelectEpisode={(idx) => setEpIndex(idx)}
        onClose={() => setShowEpisodeDrawer(false)}
      />

      {/* Keyboard & Gesture Shortcuts Modal */}
      {showShortcuts && (
        <div
          data-no-gesture="true"
          className="sx-backdrop-enter fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sx-sheet-enter w-full max-w-sm rounded-3xl bg-zinc-900/95 backdrop-blur-2xl border border-white/15 p-5 space-y-3 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold">Gestures &amp; Shortcuts</h3>
              <button
                type="button"
                onClick={() => setShowShortcuts(false)}
                className="p-1 rounded-full hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-2 text-xs">
              {[
                ['Swipe Left / Right', 'Seek timeline'],
                ['Swipe Up / Down (Right)', 'Volume control'],
                ['Swipe Up / Down (Left)', 'Screen brightness'],
                ['Space / K', 'Play / Pause'],
                ['Left / Right', 'Seek -10s / +10s'],
                ['Up / Down / Wheel', 'Volume ±5%'],
                ['Double Click Left/Right', 'Quick Seek -10s / +10s'],
                ['M', 'Mute / Unmute'],
                ['F', 'Toggle Fullscreen'],
                ['N', 'Next Episode'],
              ].map(([k, desc]) => (
                <div
                  key={k}
                  className="flex items-center justify-between py-1.5 border-b border-white/10 last:border-0"
                >
                  <span className="font-mono-tabular font-bold text-[var(--sx-tertiary)]">{k}</span>
                  <span className="text-white/80">{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

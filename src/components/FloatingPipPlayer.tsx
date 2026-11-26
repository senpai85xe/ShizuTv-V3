import React, { useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertCircle,
  Maximize2,
  Pause,
  PictureInPicture2,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useApp } from '../store/AppContext';
import { usePip } from '../store/PipContext';
import { getPreferredTitle, VideoStream } from '../types/media';
import { INBUILT_SOURCES, resolveVideoServers, resolveVideoStreamAsync } from '../services/sourceEngine';
import {
  buildSubtitleBoxCssProps,
  findActiveSubtitleCue,
  formatScrubberPercent,
  getEpisodeNavigationState,
  parseSubtitleText,
  resolveAudioLanguageOption,
  resolvePersistedSubtitleLang,
  resolvePreferredVideoServer,
  SubtitleCue,
} from '../utils/inlinePlayer';
import { resolveActiveSourceId } from '../utils/sourcePicker';
import { SubtitleFormattedText } from './SubtitleFormattedText';
import { formatPlayerTime } from '../utils/detailsLayout';
import {
  canUseNativePictureInPicture,
  clampPipPosition,
  computePipCornerPosition,
  snapPipCorner,
} from '../utils/pipPlayer';
import { tryResolveApiUrl } from '../utils/backendConfig';

function getViewportDimensions() {
  if (typeof window === 'undefined') {
    return { w: 1280, h: 800, isMobile: false };
  }
  return {
    w: window.innerWidth,
    h: window.innerHeight,
    isMobile: window.innerWidth < 768,
  };
}

export const FloatingPipPlayer: React.FC = () => {
  const { state, recordHistory } = useApp();
  const {
    pipSession,
    corner,
    setCorner,
    updatePipProgress,
    setPipEpisodeIndex,
    closePip,
    expandPipToFullPlayer,
  } = usePip();

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideHudTimerRef = useRef<number | null>(null);
  const lastHistoryWriteRef = useRef<number>(0);

  const [viewport, setViewport] = useState(getViewportDimensions);
  const [showHud, setShowHud] = useState(true);
  const [isNativePip, setIsNativePip] = useState(false);
  const [nativePipAvailable, setNativePipAvailable] = useState(false);

  const cardWidth = viewport.isMobile ? Math.min(236, Math.max(196, viewport.w - 32)) : 312;
  const cardHeight = Math.round((cardWidth * 9) / 16);
  const boundsOptions = useMemo(
    () => ({
      margin: viewport.isMobile ? 12 : 20,
      topClearance: viewport.isMobile ? 64 : 20,
      bottomClearance: viewport.isMobile ? 84 : 24,
    }),
    [viewport.isMobile],
  );

  const cornerPos = useMemo(
    () =>
      computePipCornerPosition(
        corner,
        cardWidth,
        cardHeight,
        viewport.w,
        viewport.h,
        boundsOptions,
      ),
    [corner, cardWidth, cardHeight, viewport.w, viewport.h, boundsOptions],
  );

  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragSessionRef = useRef<{
    pointerId: number;
    startClientX: number;
    startClientY: number;
    originX: number;
    originY: number;
    hasMoved: boolean;
  } | null>(null);
  const suppressTapRef = useRef(false);

  // Sync viewport resize cleanly
  useEffect(() => {
    const onResize = () => setViewport(getViewportDimensions());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const currentEpisode = useMemo(() => {
    if (!pipSession) return null;
    return pipSession.episodes[pipSession.episodeIndex] ?? pipSession.episodes[0] ?? null;
  }, [pipSession]);

  const availableAnimeSources = useMemo(() => {
    const combined = [...INBUILT_SOURCES, ...state.customSources];
    const typeMatched = combined.filter(
      (s) =>
        s.mediaTypes.includes('ANIME') ||
        s.mediaTypes.includes('MOVIE') ||
        s.mediaTypes.includes('TV'),
    );
    const activeMatched = typeMatched.filter((s) =>
      state.discoveryPrefs.activeSources.includes(s.id),
    );
    return activeMatched.length > 0 ? activeMatched : typeMatched;
  }, [state.customSources, state.discoveryPrefs.activeSources]);

  const effectiveSourceId = useMemo(
    () =>
      pipSession?.sourceId ||
      resolveActiveSourceId({
        availableSources: availableAnimeSources,
        preferredSourceId: state.discoveryPrefs.preferredAnimeSourceId,
        isManga: false,
      }),
    [pipSession?.sourceId, availableAnimeSources, state.discoveryPrefs.preferredAnimeSourceId],
  );
  const effectiveSourceMeta = useMemo(
    () => availableAnimeSources.find((s) => s.id === effectiveSourceId),
    [availableAnimeSources, effectiveSourceId],
  );
  const effectiveSourceName = pipSession?.sourceName ?? effectiveSourceMeta?.name;
  const effectiveSourceBaseUrl = pipSession?.sourceBaseUrl ?? effectiveSourceMeta?.baseUrl;
  const effectiveSourceLang = pipSession?.sourceLang ?? effectiveSourceMeta?.lang;

  const servers = useMemo(
    () => resolveVideoServers(effectiveSourceId, effectiveSourceName),
    [effectiveSourceId, effectiveSourceName],
  );
  const desiredAudioCategory = resolveAudioLanguageOption(
    state.playerPrefs.audioLanguage,
  ).serverCategory;
  const activeServer = useMemo(() => {
    return (
      resolvePreferredVideoServer({
        servers,
        preferredServerId: state.playerPrefs.preferredServerBySource?.[effectiveSourceId],
        routeServerId: pipSession?.serverId,
        desiredAudioCategory,
      }) ?? servers[0]
    );
  }, [
    servers,
    state.playerPrefs.preferredServerBySource,
    effectiveSourceId,
    pipSession?.serverId,
    desiredAudioCategory,
  ]);

  const [stream, setStream] = useState<VideoStream | null>(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [streamRetryNonce, setStreamRetryNonce] = useState(0);
  const [mirrorIndex, setMirrorIndex] = useState(0);
  const [fetchedCuesMap, setFetchedCuesMap] = useState<Record<string, SubtitleCue[]>>({});

  useEffect(() => {
    if (!pipSession || !currentEpisode) {
      setStream(null);
      setStreamLoading(false);
      setStreamError(null);
      return;
    }

    const controller = new AbortController();
    setStream(null);
    setStreamLoading(true);
    setStreamError(null);
    setMirrorIndex(0);

    resolveVideoStreamAsync({
      media: pipSession.media,
      episode: currentEpisode,
      server: activeServer,
      sourceId: effectiveSourceId,
      sourceName: effectiveSourceName,
      sourceBaseUrl: effectiveSourceBaseUrl,
      sourceLang: effectiveSourceLang,
      audioLanguage: state.playerPrefs.audioLanguage,
      overrideTitle: pipSession.overrideTitle,
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
        setStream(null);
        setStreamLoading(false);
        setStreamError(
          err instanceof Error ? err.message : 'Unable to resolve episode stream.',
        );
      });

    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pipSession?.media.id,
    currentEpisode?.id,
    currentEpisode?.number,
    activeServer.id,
    effectiveSourceId,
    effectiveSourceName,
    effectiveSourceBaseUrl,
    effectiveSourceLang,
    state.playerPrefs.audioLanguage,
    pipSession?.overrideTitle,
    streamRetryNonce,
  ]);

  const activeMirror = stream?.mirrors?.[mirrorIndex] ?? null;
  const rawStreamUrl = activeMirror?.url || stream?.url || '';
  const activeStreamUrl = rawStreamUrl.startsWith('/api/')
    ? tryResolveApiUrl(rawStreamUrl) || ''
    : rawStreamUrl;
  const activeStreamIsHls = activeMirror ? activeMirror.isHls : Boolean(stream?.isHls);

  const scheduleHideHud = (currentlyPlaying: boolean) => {
    setShowHud(true);
    if (hideHudTimerRef.current) window.clearTimeout(hideHudTimerRef.current);
    if (currentlyPlaying) {
      hideHudTimerRef.current = window.setTimeout(() => setShowHud(false), 2600);
    }
  };

  useEffect(() => {
    return () => {
      if (hideHudTimerRef.current) window.clearTimeout(hideHudTimerRef.current);
    };
  }, []);

  // Attach HLS/MP4 stream and restore exact timestamp
  useEffect(() => {
    if (!pipSession || !currentEpisode || !activeStreamUrl) return;
    const video = videoRef.current;
    if (!video) return;

    setNativePipAvailable(canUseNativePictureInPicture(document, video));

    let cancelled = false;
    const startTime = Math.max(0, pipSession.currentTime || 0);
    const shouldPlay = pipSession.playing;
    let restored = false;

    const applyResumeState = () => {
      if (cancelled) return;
      if (!restored && startTime > 0.5) {
        try {
          video.currentTime = startTime;
        } catch {
          // Ignore seek errors before readyState allows
        }
        restored = true;
      }
      video.playbackRate = pipSession.speed || 1;
      video.muted = pipSession.muted;
      video.volume = pipSession.volume ?? 1;
      if (shouldPlay) {
        video.play().catch(() => {});
      }
    };

    const advanceMirrorOrError = (reason: string) => {
      if (cancelled) return;
      if (stream?.mirrors && mirrorIndex + 1 < stream.mirrors.length) {
        setMirrorIndex((i) => i + 1);
      } else {
        setStreamError(reason);
      }
    };

    let hls: Hls | null = null;
    if (activeStreamIsHls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(activeStreamUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, applyResumeState);
      let recoveredMedia = false;
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal || cancelled) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !recoveredMedia && hls) {
          recoveredMedia = true;
          hls.recoverMediaError();
          return;
        }
        advanceMirrorOrError('PiP stream failed.');
      });
    } else {
      hlsRef.current = null;
      video.src = activeStreamUrl;
      const onMeta = () => applyResumeState();
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      if (video.readyState >= 1) {
        applyResumeState();
      }
    }

    const onEnterNative = () => setIsNativePip(true);
    const onLeaveNative = () => setIsNativePip(false);
    video.addEventListener('enterpictureinpicture', onEnterNative);
    video.addEventListener('leavepictureinpicture', onLeaveNative);

    return () => {
      cancelled = true;
      video.removeEventListener('enterpictureinpicture', onEnterNative);
      video.removeEventListener('leavepictureinpicture', onLeaveNative);
      if (hls) hls.destroy();
      if (hlsRef.current === hls) hlsRef.current = null;
    };
    // Re-attach only when episode, stream url, or active session media changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipSession?.media.id, currentEpisode?.id, activeStreamUrl]);

  // Fetch remote WebVTT subtitle track if needed
  const pipTrackLang = resolvePersistedSubtitleLang(
    pipSession?.activeSubLang,
    state.playerPrefs.subtitleLanguage,
  );
  const pipActiveTrack =
    stream?.subtitles?.find((s) => s.lang === pipTrackLang) ??
    (pipTrackLang === 'en' ? stream?.subtitles?.[0] : undefined);
  const pipTrackUrl = pipActiveTrack?.url
    ? pipActiveTrack.url.startsWith('/api/')
      ? tryResolveApiUrl(pipActiveTrack.url) ?? undefined
      : pipActiveTrack.url
    : undefined;
  const pipTrackLangKey =
    currentEpisode && pipActiveTrack
      ? `${currentEpisode.id}:${pipActiveTrack.lang}`
      : '';

  useEffect(() => {
    if (!pipTrackUrl || !pipTrackLangKey) return;
    if (pipActiveTrack?.cues && pipActiveTrack.cues.length > 0) return;
    if (fetchedCuesMap[pipTrackLangKey]) return;

    let cancelled = false;
    fetch(pipTrackUrl)
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
          setFetchedCuesMap((prev) => ({ ...prev, [pipTrackLangKey]: parsed }));
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [pipTrackUrl, pipActiveTrack?.cues, pipTrackLangKey, fetchedCuesMap]);

  // Update MediaSession metadata & transport controls when supported
  useEffect(() => {
    if (!pipSession || !currentEpisode) return;
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const title = getPreferredTitle(pipSession.media.title, state.contentPrefs.titlePreference);
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: `EP ${currentEpisode.number}: ${currentEpisode.title}`,
        artist: title,
        artwork: pipSession.media.cover ? [{ src: pipSession.media.cover }] : [],
      });
      navigator.mediaSession.setActionHandler('play', () => videoRef.current?.play().catch(() => {}));
      navigator.mediaSession.setActionHandler('pause', () => videoRef.current?.pause());
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        if (pipSession.episodeIndex > 0) setPipEpisodeIndex(pipSession.episodeIndex - 1);
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        if (pipSession.episodeIndex < pipSession.episodes.length - 1) {
          setPipEpisodeIndex(pipSession.episodeIndex + 1);
        }
      });
    } catch {
      // Ignore MediaSession errors in unsupported contexts
    }
  }, [
    pipSession,
    currentEpisode,
    state.contentPrefs.titlePreference,
    setPipEpisodeIndex,
  ]);

  if (!pipSession || !currentEpisode) {
    return null;
  }

  const title = getPreferredTitle(pipSession.media.title, state.contentPrefs.titlePreference);
  const navState = getEpisodeNavigationState(pipSession.episodeIndex, pipSession.episodes.length);
  const effectiveDuration = pipSession.duration || currentEpisode.durationSeconds || 1440;
  const progressPct = formatScrubberPercent(pipSession.currentTime, effectiveDuration);

  const trackKey = `${currentEpisode.id}:${pipSession.activeSubLang}`;
  const cues =
    pipSession.editedCuesMap?.[trackKey] ??
    (pipActiveTrack?.cues && pipActiveTrack.cues.length > 0
      ? pipActiveTrack.cues
      : fetchedCuesMap[pipTrackLangKey]) ??
    [];
  const activeCue = state.playerPrefs.subtitleEnabled
    ? findActiveSubtitleCue(
        cues,
        pipSession.currentTime,
        state.playerPrefs.subtitleOffsetSeconds || 0,
      )
    : null;

  const activePos = dragPos ?? cornerPos;
  const hudVisible = showHud || !pipSession.playing || streamLoading || Boolean(streamError);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      scheduleHideHud(true);
    } else {
      v.pause();
      scheduleHideHud(false);
    }
  };

  const toggleMute = () => {
    const nextMuted = !pipSession.muted;
    if (videoRef.current) videoRef.current.muted = nextMuted;
    updatePipProgress({ muted: nextMuted });
  };

  const handleToggleNativePip = async () => {
    const v = videoRef.current;
    if (!v || !canUseNativePictureInPicture(document, v)) return;
    try {
      if (document.pictureInPictureElement === v) {
        await document.exitPictureInPicture();
      } else {
        await v.requestPictureInPicture();
      }
    } catch {
      // Gracefully ignore sandboxed iframe rejections
    }
  };

  const handleClose = () => {
    recordHistory({
      mediaId: pipSession.media.id,
      mediaType: pipSession.media.type,
      media: pipSession.media,
      episodeNumber: currentEpisode.number,
      episodeTitle: currentEpisode.title,
      positionSeconds: Math.floor(pipSession.currentTime),
      durationSeconds: Math.floor(effectiveDuration),
    });
    closePip();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if ((e.target as HTMLElement | null)?.closest('button')) return;

    dragSessionRef.current = {
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      originX: activePos.x,
      originY: activePos.y,
      hasMoved: false,
    };
    suppressTapRef.current = false;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore if pointer capture is unavailable
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startClientX;
    const dy = e.clientY - session.startClientY;
    if (!session.hasMoved && Math.hypot(dx, dy) < 6) return;

    session.hasMoved = true;
    suppressTapRef.current = true;
    const clamped = clampPipPosition(
      session.originX + dx,
      session.originY + dy,
      cardWidth,
      cardHeight,
      viewport.w,
      viewport.h,
      boundsOptions,
    );
    setDragPos(clamped);
  };

  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    dragSessionRef.current = null;

    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore
    }

    if (session.hasMoved && dragPos) {
      const snapped = snapPipCorner(
        dragPos.x,
        dragPos.y,
        cardWidth,
        cardHeight,
        viewport.w,
        viewport.h,
      );
      setCorner(snapped);
      setDragPos(null);
      window.setTimeout(() => {
        suppressTapRef.current = false;
      }, 80);
    }
  };

  return (
    <aside
      aria-label="Picture in Picture player"
      data-testid="floating-pip-player"
      data-corner={corner}
      style={{
        width: `${cardWidth}px`,
        height: `${cardHeight}px`,
        left: `${activePos.x}px`,
        top: `${activePos.y}px`,
        transition: dragPos
          ? 'none'
          : 'left 320ms cubic-bezier(0.22, 1, 0.36, 1), top 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onMouseEnter={() => setShowHud(true)}
      onMouseLeave={() => {
        if (pipSession.playing) scheduleHideHud(true);
      }}
      onClick={() => {
        if (suppressTapRef.current) return;
        scheduleHideHud(pipSession.playing);
      }}
      className="fixed z-50 rounded-2xl overflow-hidden bg-zinc-950/92 backdrop-blur-2xl border border-white/20 ring-1 ring-inset ring-white/10 shadow-[0_22px_54px_rgba(0,0,0,0.68)] text-white select-none touch-none cursor-grab active:cursor-grabbing"
    >
      {/* Video Surface */}
      <video
        ref={videoRef}
        playsInline
        onPlay={() => {
          updatePipProgress({ playing: true });
          scheduleHideHud(true);
        }}
        onPause={() => {
          updatePipProgress({ playing: false });
          setShowHud(true);
        }}
        onLoadedMetadata={() => {
          const d = videoRef.current?.duration || 0;
          if (d > 0) updatePipProgress({ duration: d });
        }}
        onTimeUpdate={() => {
          const t = videoRef.current?.currentTime || 0;
          const d = videoRef.current?.duration || pipSession.duration || 1440;
          updatePipProgress({ currentTime: t, duration: d });
          const now = Date.now();
          if (now - lastHistoryWriteRef.current > 8000) {
            lastHistoryWriteRef.current = now;
            recordHistory({
              mediaId: pipSession.media.id,
              mediaType: pipSession.media.type,
              media: pipSession.media,
              episodeNumber: currentEpisode.number,
              episodeTitle: currentEpisode.title,
              positionSeconds: Math.floor(t),
              durationSeconds: Math.floor(d),
            });
          }
        }}
        onEnded={() => {
          if (state.playerPrefs.autoNextEpisode && navState.hasNext) {
            setPipEpisodeIndex(navState.nextIndex);
          } else {
            updatePipProgress({ playing: false });
            setShowHud(true);
          }
        }}
        onError={() => {
          if (!activeStreamUrl) return;
          if (stream?.mirrors && mirrorIndex + 1 < stream.mirrors.length) {
            setMirrorIndex((i) => i + 1);
          } else {
            setStreamError('PiP stream failed.');
          }
        }}
        className="w-full h-full object-contain bg-black pointer-events-none"
      />

      {streamLoading && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-black/55">
          <span className="px-2.5 py-1 rounded-full bg-black/75 border border-white/15 text-[10px] font-bold text-white/90">
            Resolving stream...
          </span>
        </div>
      )}

      {streamError && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-1.5 bg-black/80 px-3 text-center">
          <div className="inline-flex items-center gap-1 text-[10px] font-extrabold text-amber-300">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{streamError}</span>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setStreamRetryNonce((n) => n + 1);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-[10px] font-extrabold"
          >
            <RefreshCw className="w-3 h-3" />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* Mini Subtitle Cue (positioned clear of bottom timestamp when HUD is visible) */}
      {activeCue && !hudVisible && (
        <div className="pointer-events-none absolute inset-x-2 bottom-2.5 z-10 flex justify-center">
          <p
            style={buildSubtitleBoxCssProps(state.playerPrefs, 10)}
            className="px-2 py-0.5 rounded-md text-center line-clamp-2 whitespace-pre-line leading-tight"
          >
            <SubtitleFormattedText text={activeCue.text} />
          </p>
        </div>
      )}

      {/* Interactive Controls HUD */}
      <div
        className={`absolute inset-0 z-20 flex flex-col justify-between p-2 bg-gradient-to-b from-black/70 via-black/20 to-black/75 transition-opacity duration-200 ${
          hudVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top Row: Live Episode Tag + Actions */}
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-1.5 min-w-0 px-2 py-0.5 rounded-full bg-black/50 backdrop-blur-md border border-white/12">
            <span
              aria-hidden="true"
              className="w-1.5 h-1.5 rounded-full bg-[var(--sx-player-accent)] shrink-0"
            />
            <span className="text-[10px] font-extrabold truncate">
              EP {currentEpisode.number} · {title}
            </span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {nativePipAvailable && (
              <button
                type="button"
                data-testid="floating-pip-native-btn"
                aria-label={isNativePip ? 'Exit browser Picture-in-Picture' : 'Browser Picture-in-Picture window'}
                title="Browser Window PiP"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleToggleNativePip();
                }}
                className={`w-6 h-6 rounded-full backdrop-blur-md border flex items-center justify-center transition-colors ${
                  isNativePip
                    ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] border-[var(--sx-player-accent)]'
                    : 'bg-black/55 hover:bg-white/20 border-white/15 text-white'
                }`}
              >
                <PictureInPicture2 className="w-3 h-3" />
              </button>
            )}

            <button
              type="button"
              data-testid="floating-pip-expand-btn"
              aria-label="Expand to full player"
              title="Expand Player"
              onClick={(e) => {
                e.stopPropagation();
                expandPipToFullPlayer();
              }}
              className="w-6 h-6 rounded-full bg-black/55 hover:bg-white/20 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors"
            >
              <Maximize2 className="w-3 h-3" />
            </button>

            <button
              type="button"
              data-testid="floating-pip-close-btn"
              aria-label="Close Picture in Picture"
              title="Close PiP"
              onClick={(e) => {
                e.stopPropagation();
                handleClose();
              }}
              className="w-6 h-6 rounded-full bg-black/55 hover:bg-white/20 backdrop-blur-md border border-white/15 flex items-center justify-center transition-colors"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>

        {/* Center Playback Controls */}
        <div className="flex items-center justify-center gap-3">
          {pipSession.episodes.length > 1 && (
            <button
              type="button"
              data-testid="floating-pip-prev-btn"
              aria-label="Previous episode"
              disabled={!navState.hasPrev}
              onClick={(e) => {
                e.stopPropagation();
                setPipEpisodeIndex(navState.prevIndex);
              }}
              className="w-7 h-7 rounded-full bg-black/55 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-colors"
            >
              <SkipBack className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            type="button"
            data-testid="floating-pip-play-btn"
            aria-label={pipSession.playing ? 'Pause PiP video' : 'Play PiP video'}
            onClick={(e) => {
              e.stopPropagation();
              togglePlay();
            }}
            className="w-9 h-9 rounded-full bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-lg flex items-center justify-center border border-white/20 hover:scale-105 active:scale-95 transition-transform"
          >
            {pipSession.playing ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          {pipSession.episodes.length > 1 && (
            <button
              type="button"
              data-testid="floating-pip-next-btn"
              aria-label="Next episode"
              disabled={!navState.hasNext}
              onClick={(e) => {
                e.stopPropagation();
                setPipEpisodeIndex(navState.nextIndex);
              }}
              className="w-7 h-7 rounded-full bg-black/55 hover:bg-white/20 disabled:opacity-30 flex items-center justify-center transition-colors"
            >
              <SkipForward className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Bottom Timestamp & Mute Row */}
        <div className="flex items-center justify-between gap-2 px-0.5">
          <span className="text-[10px] font-mono-tabular font-bold text-white/85">
            {formatPlayerTime(pipSession.currentTime)} / {formatPlayerTime(effectiveDuration)}
          </span>
          <button
            type="button"
            data-testid="floating-pip-mute-btn"
            aria-label={pipSession.muted ? 'Unmute PiP video' : 'Mute PiP video'}
            onClick={(e) => {
              e.stopPropagation();
              toggleMute();
            }}
            className="p-1 rounded-full bg-black/45 hover:bg-white/20 transition-colors"
          >
            {pipSession.muted ? (
              <VolumeX className="w-3 h-3 text-white/85" />
            ) : (
              <Volume2 className="w-3 h-3 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Edge-to-edge Theme-Accented Progress Line */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-white/20 z-30">
        <div
          style={{ width: `${progressPct}%` }}
          className="h-full bg-[var(--sx-player-accent)] transition-[width] duration-150"
        />
      </div>
    </aside>
  );
};

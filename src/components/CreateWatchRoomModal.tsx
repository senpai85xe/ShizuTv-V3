import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Radio, Search, Tv, X } from 'lucide-react';
import { UnifiedEpisode, UnifiedMedia } from '../types/media';
import { useApp } from '../store/AppContext';
import {
  fetchDiscoveryCategory,
  searchDiscoveryMedia,
} from '../services/discoveryService';
import { resolveEpisodesForMedia } from '../services/sourceEngine';
import { SmartImage } from './SmartImage';
import {
  buildDefaultRoomName,
  resolveDefaultDisplayName,
  resolveDefaultHostAvatar,
  WatchPartyTrack,
} from '../utils/watchParty';
import {
  AUDIO_LANGUAGE_OPTIONS,
  AudioLanguageCode,
  resolveAudioLanguageOption,
} from '../utils/inlinePlayer';

export interface CreateWatchRoomPayload {
  media: UnifiedMedia;
  episodes: UnifiedEpisode[];
  episodeIndex: number;
  track: WatchPartyTrack;
  audioLanguage: AudioLanguageCode;
  roomName: string;
  isPublic: boolean;
  userName: string;
  hostAvatar?: string;
}

interface CreateWatchRoomModalProps {
  open: boolean;
  initialMedia?: UnifiedMedia | null;
  initialEpisodes?: UnifiedEpisode[];
  initialEpisodeNumber?: number;
  mode?: 'create' | 'change-anime';
  variant?: 'lobby' | 'quick-episode';
  isFullscreen?: boolean;
  compact?: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateWatchRoomPayload) => void;
}

export const CreateWatchRoomModal: React.FC<CreateWatchRoomModalProps> = ({
  open,
  initialMedia = null,
  initialEpisodes,
  initialEpisodeNumber = 1,
  mode = 'create',
  variant = 'lobby',
  isFullscreen = false,
  compact = false,
  onClose,
  onSubmit,
}) => {
  const { state, effectiveMetadataTracker } = useApp();
  const displayName = resolveDefaultDisplayName(state.profiles);
  const hostAvatar = resolveDefaultHostAvatar(state.profiles);
  const defaultRoomName = buildDefaultRoomName(displayName);
  const tracker = effectiveMetadataTracker;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UnifiedMedia[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const [selectedAnime, setSelectedAnime] = useState<UnifiedMedia | null>(initialMedia);
  const [episodes, setEpisodes] = useState<UnifiedEpisode[]>(initialEpisodes ?? []);
  const [episodeNumber, setEpisodeNumber] = useState(initialEpisodeNumber || 1);
  const [audioLanguage, setAudioLanguage] = useState<AudioLanguageCode>(
    () => resolveAudioLanguageOption(state.playerPrefs.audioLanguage).code,
  );
  const [roomNameDraft, setRoomNameDraft] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const initialEpisodeSeedRef = useRef(initialEpisodeNumber || 1);

  useEffect(() => {
    if (!open) return;
    setValidationError(null);
    setAudioLanguage(resolveAudioLanguageOption(state.playerPrefs.audioLanguage).code);
    initialEpisodeSeedRef.current = initialEpisodeNumber || 1;
    if (mode === 'change-anime') {
      setSelectedAnime(null);
      setSearchQuery('');
      setSearchOpen(true);
    } else if (initialMedia) {
      setSelectedAnime(initialMedia);
      setSearchOpen(false);
    }
  }, [open, initialMedia, initialEpisodeNumber, mode, state.playerPrefs.audioLanguage]);

  // Load initial popular suggestions or search results when modal is open & no anime chosen
  useEffect(() => {
    if (!open || selectedAnime) return;
    let cancelled = false;
    const trimmed = searchQuery.trim();
    const timer = window.setTimeout(
      async () => {
        setSearching(true);
        try {
          const res = trimmed
            ? await searchDiscoveryMedia(tracker, {
                query: trimmed,
                type: 'ANIME',
                adultMode: state.contentPrefs.adultContentMode,
              })
            : await fetchDiscoveryCategory(
                tracker,
                'trending',
                'ANIME',
                state.contentPrefs.adultContentMode,
                1,
              );
          if (!cancelled) {
            setSearchResults(res.items.slice(0, 10));
          }
        } catch {
          if (!cancelled) {
            setSearchResults([]);
          }
        } finally {
          if (!cancelled) {
            setSearching(false);
          }
        }
      },
      trimmed ? 240 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, selectedAnime, searchQuery, tracker, state.contentPrefs.adultContentMode]);

  // Resolve episodes when an anime is selected
  useEffect(() => {
    if (!selectedAnime) {
      setEpisodes([]);
      setEpisodeNumber(1);
      return;
    }
    let cancelled = false;
    const targetEp =
      initialMedia && selectedAnime.id === initialMedia.id
        ? Math.max(1, initialEpisodeSeedRef.current)
        : 1;
    if (
      initialMedia &&
      selectedAnime.id === initialMedia.id &&
      initialEpisodes &&
      initialEpisodes.length > 0
    ) {
      setEpisodes(initialEpisodes);
      setEpisodeNumber(targetEp);
      return;
    }

    const fallbackCount = Math.max(targetEp, selectedAnime.episodes || 12);
    const baseList: UnifiedEpisode[] = Array.from({ length: fallbackCount }, (_, idx) => ({
      id: `${selectedAnime.id}-ep-${idx + 1}`,
      number: idx + 1,
      title: `Episode ${idx + 1}`,
      thumbnail: selectedAnime.banner || selectedAnime.cover || null,
    }));
    setEpisodes(baseList);
    setEpisodeNumber(targetEp);

    resolveEpisodesForMedia(selectedAnime)
      .then((resolved) => {
        if (!cancelled && Array.isArray(resolved) && resolved.length > 0) {
          setEpisodes(resolved);
        }
      })
      .catch(() => {
        // Keep generated episode list fallback
      });

    return () => {
      cancelled = true;
    };
  }, [selectedAnime, initialMedia, initialEpisodes]);

  if (!open) return null;

  const handleSelectAnime = (anime: UnifiedMedia) => {
    setSelectedAnime(anime);
    setSearchOpen(false);
    setValidationError(null);
  };

  const handleClearAnime = () => {
    setSelectedAnime(null);
    setSearchQuery('');
    setSearchOpen(true);
    window.setTimeout(() => searchInputRef.current?.focus(), 40);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAnime) {
      setValidationError('Search and pick an anime first.');
      setSearchOpen(true);
      searchInputRef.current?.focus();
      return;
    }
    const epIdx = Math.max(
      0,
      episodes.findIndex((ep) => ep.number === episodeNumber),
    );
    const chosenAudio = resolveAudioLanguageOption(audioLanguage);
    const derivedTrack: WatchPartyTrack =
      chosenAudio.serverCategory === 'dub' ? 'Dub' : 'H-Sub';
    onSubmit({
      media: selectedAnime,
      episodes,
      episodeIndex: epIdx,
      track: derivedTrack,
      audioLanguage: chosenAudio.code,
      roomName: roomNameDraft.trim() || defaultRoomName,
      isPublic,
      userName: displayName,
      hostAvatar,
    });
  };

  const isQuickEpisode =
    variant === 'quick-episode' && mode === 'create' && Boolean(initialMedia);
  const activeEpisodeItem =
    episodes.find((ep) => ep.number === episodeNumber) ||
    episodes[Math.max(0, episodeNumber - 1)];

  const animeTitle = selectedAnime
    ? selectedAnime.title.english ||
      selectedAnime.title.romaji ||
      selectedAnime.title.native ||
      'Selected Anime'
    : '';
  const epTotalCount = selectedAnime?.episodes || episodes.length;

  if (isQuickEpisode && selectedAnime) {
    return (
      <div
        data-no-gesture="true"
        className={`absolute inset-0 z-40 flex items-center justify-center sm:justify-end ${
          compact ? 'p-1.5 sm:p-4' : 'p-2 sm:p-4'
        }`}
      >
        {/* Frosted Blur Backdrop matching PlayerEpisodeDrawer */}
        <button
          type="button"
          aria-label="Close Watch Party"
          data-testid="create-watch-room-backdrop"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="sx-backdrop-enter absolute inset-0 w-full h-full bg-black/45 backdrop-blur-md cursor-default"
        />

        {/* Floating Frosted Glass Drawer fitted inside the Player Stage */}
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-room-title"
          data-testid="create-watch-room-modal"
          onClick={(e) => e.stopPropagation()}
          className={`sx-player-drawer-enter relative z-10 flex flex-col overflow-hidden bg-zinc-950/75 backdrop-blur-2xl backdrop-saturate-150 border border-white/20 ring-1 ring-inset ring-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.65)] text-white ${
            compact
              ? 'w-full h-full rounded-2xl'
              : 'w-full max-w-[360px] max-h-[min(78%,520px)] sm:mt-10 sm:mb-12 rounded-3xl'
          }`}
        >
          {/* Header matching PlayerEpisodeDrawer */}
          <div
            className={`flex items-center justify-between gap-2 border-b border-white/12 shrink-0 ${
              compact ? 'px-2.5 py-1 sm:px-4 sm:py-2.5' : 'px-4 py-3'
            }`}
          >
            <div className="flex items-center gap-1.5 min-w-0 shrink-0">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-[var(--sx-player-accent)] shrink-0"
              />
              <h2
                id="create-room-title"
                className={`${compact ? 'text-[11px] sm:text-xs' : 'text-sm'} font-extrabold whitespace-nowrap text-white`}
              >
                Start Watch Party
              </h2>
            </div>

            <button
              type="button"
              data-testid="create-room-close-btn"
              onClick={onClose}
              aria-label="Close Watch Party"
              className={`${compact ? 'p-1 sm:p-1.5' : 'p-1.5'} rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors shrink-0`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Scrollable Form Body fitted inside Player */}
          <form
            onSubmit={handleSubmit}
            className={`flex-1 overflow-y-auto no-scrollbar flex flex-col ${
              compact
                ? 'p-1.5 sm:p-5 justify-center'
                : 'p-3.5 gap-3 justify-between'
            }`}
          >
            <div
              className={
                compact
                  ? 'w-full sm:max-w-md sm:mx-auto space-y-1 sm:space-y-3'
                  : 'space-y-3'
              }
            >
              {/* Locked Episode Summary Card */}
              <div
                data-testid="create-room-quick-episode-card"
                className={`flex items-center gap-2 sm:gap-2.5 rounded-xl bg-white/8 border border-white/10 ${
                  compact ? 'px-2 py-1 sm:p-2.5' : 'p-2.5'
                }`}
              >
                <div
                  className={`${
                    compact ? 'w-6 h-6 sm:w-10 sm:h-12' : 'w-10 h-14'
                  } rounded-lg overflow-hidden bg-white/10 shrink-0 border border-white/15`}
                >
                  {selectedAnime.cover || selectedAnime.banner ? (
                    <SmartImage
                      src={selectedAnime.cover || selectedAnime.banner}
                      alt={animeTitle}
                      fallbackTitle={animeTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tv className="w-3.5 h-3.5 text-[var(--sx-player-accent)]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2 sm:block sm:space-y-0.5">
                  <p
                    className={`${
                      compact ? 'text-[11px] sm:text-xs' : 'text-xs'
                    } font-extrabold text-white truncate`}
                  >
                    {animeTitle}
                  </p>
                  <p className="text-[10px] sm:text-[11px] font-bold text-[var(--sx-player-accent)] truncate shrink-0">
                    <span className="sm:hidden">EP {episodeNumber}</span>
                    <span className="hidden sm:inline">
                      Episode {episodeNumber}
                      {activeEpisodeItem?.title &&
                      activeEpisodeItem.title !== `Episode ${episodeNumber}`
                        ? ` · ${activeEpisodeItem.title}`
                        : ''}
                    </span>
                  </p>
                </div>
              </div>

              {/* Room Name */}
              <div className="space-y-1">
                <label
                  htmlFor="create-room-name-input"
                  className={`${
                    compact ? 'hidden sm:block' : 'block'
                  } text-[10px] font-extrabold tracking-[0.1em] uppercase text-white/60`}
                >
                  Room name
                </label>
                <input
                  id="create-room-name-input"
                  type="text"
                  aria-label="Room name"
                  data-testid="create-room-name-input"
                  maxLength={48}
                  value={roomNameDraft}
                  onChange={(e) => setRoomNameDraft(e.target.value)}
                  placeholder={compact ? `Room name · ${defaultRoomName}` : defaultRoomName}
                  className={`w-full px-2.5 sm:px-3 rounded-xl bg-white/10 border border-white/15 text-[11px] sm:text-xs font-semibold text-white placeholder:text-white/45 focus:outline-none focus:border-[var(--sx-player-accent)] transition-colors ${
                    compact ? 'py-1 sm:py-2' : 'py-2'
                  }`}
                />
              </div>

              {/* Audio Language & Privacy Grid */}
              <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
                <div className="space-y-1">
                  <span
                    className={`${
                      compact ? 'hidden sm:block' : 'block'
                    } text-[10px] font-extrabold tracking-[0.1em] uppercase text-white/60`}
                  >
                    Audio Language
                  </span>
                  <div className="grid grid-cols-4 p-0.5 rounded-xl bg-white/8 border border-white/12">
                    {AUDIO_LANGUAGE_OPTIONS.map((opt) => {
                      const active = audioLanguage === opt.code;
                      return (
                        <button
                          key={opt.code}
                          type="button"
                          title={opt.label}
                          aria-label={opt.label}
                          aria-pressed={active}
                          data-testid={`create-room-audio-${opt.code}`}
                          onClick={() => setAudioLanguage(opt.code)}
                          className={`${
                            compact ? 'py-1 sm:py-1.5' : 'py-1.5'
                          } rounded-lg text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap transition-colors ${
                            active
                              ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                              : 'text-white/70 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {opt.shortLabel}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-1">
                  <span
                    className={`${
                      compact ? 'hidden sm:block' : 'block'
                    } text-[10px] font-extrabold tracking-[0.1em] uppercase text-white/60`}
                  >
                    Privacy
                  </span>
                  <div className="grid grid-cols-2 p-0.5 rounded-xl bg-white/8 border border-white/12">
                    <button
                      type="button"
                      data-testid="create-room-public-btn"
                      onClick={() => setIsPublic(true)}
                      className={`${
                        compact ? 'py-1 sm:py-1.5' : 'py-1.5'
                      } rounded-lg text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap transition-colors ${
                        isPublic
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      Public
                    </button>
                    <button
                      type="button"
                      data-testid="create-room-private-btn"
                      onClick={() => setIsPublic(false)}
                      className={`${
                        compact ? 'py-1 sm:py-1.5' : 'py-1.5'
                      } rounded-lg text-[10px] sm:text-[11px] font-extrabold whitespace-nowrap transition-colors ${
                        !isPublic
                          ? 'bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] shadow-sm'
                          : 'text-white/70 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      Private
                    </button>
                  </div>
                </div>
              </div>

              {compact && (
                <button
                  type="submit"
                  data-testid="create-room-submit-btn"
                  className="w-full px-4 py-1.5 sm:py-2.5 rounded-xl bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-[11px] sm:text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md hover:opacity-92 active:scale-[0.99] transition-all shrink-0"
                >
                  <Radio className="w-3.5 h-3.5 shrink-0" />
                  <span>Create Watch Room</span>
                </button>
              )}
            </div>

            {!compact && (
              <button
                type="submit"
                data-testid="create-room-submit-btn"
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--sx-player-accent)] text-[var(--sx-player-on-accent)] text-xs font-extrabold flex items-center justify-center gap-1.5 whitespace-nowrap shadow-md hover:opacity-92 active:scale-[0.99] transition-all shrink-0"
              >
                <Radio className="w-3.5 h-3.5 shrink-0" />
                <span>Create Watch Room</span>
              </button>
            )}
          </form>
        </div>
      </div>
    );
  }

  const modalNode = (
    <div
      data-no-gesture="true"
      data-testid="create-watch-room-backdrop"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      className={`sx-backdrop-enter ${
        isFullscreen ? 'absolute inset-0 z-[120]' : 'fixed inset-0 z-[120]'
      } flex items-center justify-center bg-black/50 backdrop-blur-md p-3 sm:p-4`}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-room-title"
        data-testid="create-watch-room-modal"
        onClick={(e) => e.stopPropagation()}
        className={`sx-sheet-enter w-full max-w-md rounded-[var(--sx-radius)] bg-white/58 dark:bg-zinc-950/68 backdrop-blur-2xl backdrop-saturate-150 border border-white/55 dark:border-white/16 ring-1 ring-inset ring-white/25 dark:ring-white/10 p-5 sm:p-6 shadow-[0_24px_64px_rgba(0,0,0,0.45)] space-y-5 ${
          isFullscreen ? 'max-h-[84%]' : 'max-h-[88dvh]'
        } overflow-y-auto no-scrollbar`}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id="create-room-title"
              className="text-lg sm:text-xl font-black tracking-tight text-[var(--sx-on-surface)] flex items-center gap-2"
            >
              {isQuickEpisode && (
                <Radio className="w-4 h-4 text-[var(--sx-primary)] shrink-0" />
              )}
              <span>
                {mode === 'change-anime'
                  ? 'Change anime'
                  : isQuickEpisode
                    ? 'Start Watch Party'
                    : 'Create a room'}
              </span>
            </h2>
            <p className="text-xs text-[var(--sx-on-surface-muted)] leading-relaxed">
              {mode === 'change-anime'
                ? 'Switch what everyone in this Watch Together room is watching.'
                : isQuickEpisode
                  ? 'Create a synced Watch Together room for this episode and jump straight in.'
                  : 'Pick what to watch. You control playback; everyone in the room follows.'}
            </p>
          </div>

          <button
            type="button"
            data-testid="create-room-close-btn"
            onClick={onClose}
            aria-label="Close Create a room"
            className="w-9 h-9 rounded-full bg-white/34 dark:bg-white/[0.08] hover:bg-white/50 dark:hover:bg-white/14 border border-white/45 dark:border-white/14 flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {isQuickEpisode && selectedAnime ? (
            <div className="space-y-3">
              {/* Pre-seeded Locked Episode Summary Card */}
              <div
                data-testid="create-room-quick-episode-card"
                className="flex items-center gap-3 p-3 rounded-2xl bg-white/30 dark:bg-white/[0.06] backdrop-blur-md border border-white/45 dark:border-white/12"
              >
                <div className="w-11 h-14 rounded-xl overflow-hidden bg-[var(--sx-surface-container)] shrink-0 border border-[var(--sx-outline)]">
                  {selectedAnime.cover || selectedAnime.banner ? (
                    <SmartImage
                      src={selectedAnime.cover || selectedAnime.banner}
                      alt={animeTitle}
                      fallbackTitle={animeTitle}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Tv className="w-4 h-4 text-[var(--sx-primary)]" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-sm font-extrabold text-[var(--sx-on-surface)] truncate">
                    {animeTitle}
                  </p>
                  <p className="text-xs font-bold text-[var(--sx-primary)] truncate">
                    Episode {episodeNumber}
                    {activeEpisodeItem?.title &&
                    activeEpisodeItem.title !== `Episode ${episodeNumber}`
                      ? ` · ${activeEpisodeItem.title}`
                      : ''}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Audio Language
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1.5 rounded-2xl bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12">
                  {AUDIO_LANGUAGE_OPTIONS.map((opt) => {
                    const active = audioLanguage === opt.code;
                    return (
                      <button
                        key={opt.code}
                        type="button"
                        aria-pressed={active}
                        data-testid={`create-room-audio-${opt.code}`}
                        onClick={() => setAudioLanguage(opt.code)}
                        className={`px-3 py-2 rounded-xl text-xs font-extrabold whitespace-nowrap transition-colors flex items-center justify-center gap-1.5 ${
                          active
                            ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                            : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:bg-white/25 dark:hover:bg-white/[0.06]'
                        }`}
                      >
                        <span className="font-mono-tabular opacity-80">{opt.shortLabel}</span>
                        <span>{opt.label.replace(/\s*\([^)]*\)/, '')}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <>
              {/* ANIME selector */}
              <div className="space-y-2 relative">
                <label className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Anime
                </label>

                {selectedAnime ? (
                  <div
                    data-testid="create-room-selected-anime"
                    className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-2xl bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-7 h-9 rounded-lg overflow-hidden bg-[var(--sx-surface-container)] shrink-0 border border-[var(--sx-outline)]">
                        {selectedAnime.cover ? (
                          <SmartImage
                            src={selectedAnime.cover}
                            alt={animeTitle}
                            fallbackTitle={animeTitle}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Tv className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                          </div>
                        )}
                      </div>
                      <span className="text-sm font-bold text-[var(--sx-on-surface)] truncate">
                        {animeTitle}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        data-testid="create-room-clear-anime-btn"
                        onClick={handleClearAnime}
                        aria-label="Clear selected anime"
                        className="w-7 h-7 rounded-full hover:bg-[var(--sx-surface-container)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold tabular-nums text-[var(--sx-on-surface-muted)] whitespace-nowrap">
                        {epTotalCount} ep
                      </span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="relative flex items-center">
                      <Search className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute left-3.5 pointer-events-none" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        data-testid="create-room-anime-search"
                        value={searchQuery}
                        onFocus={() => setSearchOpen(true)}
                        onChange={(e) => {
                          setSearchQuery(e.target.value);
                          setSearchOpen(true);
                          setValidationError(null);
                        }}
                        placeholder="Search anime"
                        className="w-full min-h-[46px] pl-10 pr-4 py-2.5 rounded-2xl bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12 text-sm font-medium text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
                      />
                    </div>

                    {(searchOpen || searchQuery.trim().length > 0) && (
                      <div
                        data-testid="create-room-anime-results"
                        className="mt-2 rounded-2xl bg-white/68 dark:bg-zinc-900/78 backdrop-blur-2xl border border-white/55 dark:border-white/15 shadow-xl max-h-52 overflow-y-auto divide-y divide-white/25 dark:divide-white/10"
                      >
                        {searching && searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs font-medium text-[var(--sx-on-surface-muted)]">
                            Searching anime...
                          </p>
                        ) : searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-xs font-medium text-[var(--sx-on-surface-muted)]">
                            No matching anime found. Try another title.
                          </p>
                        ) : (
                          searchResults.map((item) => {
                            const itemTitle =
                              item.title.english || item.title.romaji || item.title.native || 'Anime';
                            return (
                              <button
                                key={item.id}
                                type="button"
                                data-testid={`create-room-anime-option-${item.id}`}
                                onClick={() => handleSelectAnime(item)}
                                className="w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-[var(--sx-surface-high)]/60 transition-colors"
                              >
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className="w-8 h-10 rounded-lg overflow-hidden bg-[var(--sx-surface-high)] shrink-0">
                                    {item.cover ? (
                                      <SmartImage
                                        src={item.cover}
                                        alt={itemTitle}
                                        fallbackTitle={itemTitle}
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <Tv className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-[var(--sx-on-surface)] truncate">
                                      {itemTitle}
                                    </p>
                                    {item.format && (
                                      <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate">
                                        {item.format}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <span className="text-[11px] font-semibold tabular-nums text-[var(--sx-on-surface-muted)] whitespace-nowrap shrink-0">
                                  {item.episodes ? `${item.episodes} ep` : '12+ ep'}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* EPISODE & TRACK controls (shown once anime is selected) */}
              {selectedAnime && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <label
                      htmlFor="create-room-ep-select"
                      className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]"
                    >
                      Episode
                    </label>
                    <div className="relative">
                      <select
                        id="create-room-ep-select"
                        data-testid="create-room-episode-select"
                        value={episodeNumber}
                        onChange={(e) => setEpisodeNumber(Number(e.target.value) || 1)}
                        className="w-full min-h-[44px] appearance-none pl-3.5 pr-9 py-2 rounded-2xl bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12 text-sm font-semibold text-[var(--sx-on-surface)] focus:outline-none focus:border-[var(--sx-primary)] cursor-pointer"
                      >
                        {episodes.map((ep) => (
                          <option
                            key={ep.id}
                            value={ep.number}
                            className="bg-[var(--sx-surface-container)] text-[var(--sx-on-surface)]"
                          >
                            Episode {ep.number}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-[var(--sx-on-surface-muted)] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                      Audio Language
                    </span>
                    <div className="grid grid-cols-4 p-1 rounded-full bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12 min-h-[44px]">
                      {AUDIO_LANGUAGE_OPTIONS.map((opt) => {
                        const active = audioLanguage === opt.code;
                        return (
                          <button
                            key={opt.code}
                            type="button"
                            title={opt.label}
                            aria-label={opt.label}
                            aria-pressed={active}
                            data-testid={`create-room-audio-${opt.code}`}
                            onClick={() => setAudioLanguage(opt.code)}
                            className={`rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                              active
                                ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                            }`}
                          >
                            {opt.shortLabel}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {mode === 'create' && (
            <>
              {/* ROOM NAME */}
              <div className="space-y-2">
                <label
                  htmlFor="create-room-name-input"
                  className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]"
                >
                  Room name
                </label>
                <input
                  id="create-room-name-input"
                  type="text"
                  data-testid="create-room-name-input"
                  maxLength={48}
                  value={roomNameDraft}
                  onChange={(e) => setRoomNameDraft(e.target.value)}
                  placeholder={defaultRoomName}
                  className="w-full min-h-[46px] px-4 py-2.5 rounded-2xl bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12 text-sm font-medium text-[var(--sx-on-surface)] placeholder:text-[var(--sx-on-surface-muted)] focus:outline-none focus:border-[var(--sx-primary)] transition-colors"
                />
              </div>

              {/* WHO CAN JOIN */}
              <div className="space-y-2">
                <span className="block text-[11px] font-bold tracking-[0.12em] uppercase text-[var(--sx-on-surface-muted)]">
                  Who can join
                </span>
                <div className="inline-flex p-1 rounded-full bg-white/30 dark:bg-white/[0.06] border border-white/45 dark:border-white/12">
                  <button
                    type="button"
                    data-testid="create-room-public-btn"
                    onClick={() => setIsPublic(true)}
                    className={`min-h-[38px] px-5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                      isPublic
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Public
                  </button>
                  <button
                    type="button"
                    data-testid="create-room-private-btn"
                    onClick={() => setIsPublic(false)}
                    className={`min-h-[38px] px-5 py-1.5 rounded-full text-xs font-extrabold whitespace-nowrap transition-colors ${
                      !isPublic
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)] shadow-sm'
                        : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                    }`}
                  >
                    Private
                  </button>
                </div>
                <p className="text-xs text-[var(--sx-on-surface-muted)]">
                  {isPublic
                    ? 'Listed in the lobby. Anyone can join.'
                    : 'Invite only. Share the room code to join.'}
                </p>
              </div>
            </>
          )}

          {validationError && (
            <p
              data-testid="create-room-error"
              className="text-xs font-semibold text-red-500 dark:text-red-300 bg-red-500/10 border border-red-500/25 rounded-2xl px-3.5 py-2.5"
            >
              {validationError}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            data-testid="create-room-submit-btn"
            className="w-full min-h-[48px] px-5 py-3 rounded-full bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-sm font-extrabold flex items-center justify-center whitespace-nowrap shadow-md hover:opacity-92 active:scale-[0.99] transition-all"
          >
            {mode === 'change-anime'
              ? 'Switch anime'
              : isQuickEpisode
                ? 'Create Watch Room'
                : 'Create room'}
          </button>
        </form>
      </div>
    </div>
  );

  if (!isFullscreen && typeof document !== 'undefined') {
    return createPortal(modalNode, document.body);
  }
  return modalNode;
};

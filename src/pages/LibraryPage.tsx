import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, BookOpen, Cloud, Folder, Play, RefreshCw, Search, Trash2 } from 'lucide-react';
import { useApp } from '../store/AppContext';
import {
  getPreferredTitle,
  getStatusLabel,
  LibraryEntry,
  MediaType,
  TrackedStatus,
} from '../types/media';
import { fetchAniListUserLibrary } from '../services/anilist';
import { INBUILT_SOURCES } from '../services/sourceEngine';
import { MediaCard } from '../components/MediaCard';
import { MediaCardSkeleton } from '../components/MediaCardSkeleton';
import { SmartImage } from '../components/SmartImage';
import { getMediaGridClassName } from '../utils/mediaCard';
import { useSlidingPill } from '../hooks/useSlidingPill';

const STATUS_TABS: TrackedStatus[] = [
  'CURRENT',
  'PLANNING',
  'COMPLETED',
  'PAUSED',
  'DROPPED',
  'REPEATING',
];

export const LibraryPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, toggleItemBookmark } = useApp();
  const [mediaType, setMediaType] = useState<MediaType>('ANIME');
  const [status, setStatus] = useState<TrackedStatus>('CURRENT');
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [mode, setMode] = useState<'local' | 'cloud'>(
    state.anilistToken && state.primaryTracker === 'anilist' ? 'cloud' : 'local',
  );
  const [filterQuery, setFilterQuery] = useState('');
  const [cloudItems, setCloudItems] = useState<LibraryEntry[]>([]);
  const [loadingCloud, setLoadingCloud] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);

  const loadCloud = async () => {
    const anilistProfile = state.profiles.anilist;
    if (!state.anilistToken || !anilistProfile?.id) return;
    setLoadingCloud(true);
    setCloudError(null);
    try {
      const items = await fetchAniListUserLibrary(
        state.anilistToken,
        anilistProfile.id,
        mediaType,
        status,
      );
      setCloudItems(items);
    } catch (err) {
      setCloudError(err instanceof Error ? err.message : 'Failed to sync cloud library');
    } finally {
      setLoadingCloud(false);
    }
  };

  useEffect(() => {
    if (!showBookmarks && mode === 'cloud' && state.anilistToken) {
      void loadCloud();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBookmarks, mode, mediaType, status, state.anilistToken]);

  const rawEntries =
    mode === 'cloud'
      ? cloudItems
      : state.library.filter((l) => l.mediaType === mediaType && l.status === status);

  const filteredEntries = rawEntries.filter((e) => {
    if (!filterQuery.trim()) return true;
    const t = getPreferredTitle(e.media.title, state.contentPrefs.titlePreference).toLowerCase();
    return t.includes(filterQuery.toLowerCase());
  });

  const bookmarkedForType = state.bookmarkedItems.filter((item) => {
    if (item.mediaType !== mediaType) return false;
    if (!filterQuery.trim()) return true;
    const mediaTitle = getPreferredTitle(
      item.media.title,
      state.contentPrefs.titlePreference,
    ).toLowerCase();
    const q = filterQuery.toLowerCase();
    return mediaTitle.includes(q) || item.itemTitle.toLowerCase().includes(q) || String(item.itemNumber).includes(q);
  });

  const totalBookmarksForType = state.bookmarkedItems.filter(
    (item) => item.mediaType === mediaType,
  ).length;

  const modePill = useSlidingPill<HTMLDivElement>(mode, Boolean(state.anilistToken));
  const mediaTypePill = useSlidingPill<HTMLDivElement>(mediaType);

  return (
    <div className="min-h-screen px-4 sm:px-6 pt-5 pb-12 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">
            {showBookmarks
              ? `Bookmarked ${mediaType === 'MANGA' ? 'Chapters' : 'Episodes'}`
              : getStatusLabel(status, mediaType)}
          </h1>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            {showBookmarks
              ? 'Your saved favorite episodes & chapters ready to replay anytime'
              : mode === 'cloud'
                ? 'Synced from AniList Cloud'
                : 'Stored in Local Library'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {state.anilistToken && !showBookmarks && (
            <div
              ref={modePill.containerRef}
              className="relative flex items-center gap-1 p-1 rounded-xl sx-glass-panel border border-[var(--sx-outline)]"
            >
              {modePill.pillRect.ready && (
                <span
                  aria-hidden="true"
                  style={{
                    transform: `translate3d(${modePill.pillRect.left}px, ${modePill.pillRect.top}px, 0)`,
                    width: `${modePill.pillRect.width}px`,
                    height: `${modePill.pillRect.height}px`,
                  }}
                  className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg sx-glass-active"
                />
              )}
              <button
                ref={modePill.registerItemRef('cloud')}
                type="button"
                onClick={() => setMode('cloud')}
                className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'cloud'
                    ? modePill.pillRect.ready
                      ? 'text-[var(--sx-primary)] font-extrabold'
                      : 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>Cloud</span>
              </button>
              <button
                ref={modePill.registerItemRef('local')}
                type="button"
                onClick={() => setMode('local')}
                className={`relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  mode === 'local'
                    ? modePill.pillRect.ready
                      ? 'text-[var(--sx-primary)] font-extrabold'
                      : 'sx-glass-active font-extrabold'
                    : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>Local</span>
              </button>
            </div>
          )}

          <div
            ref={mediaTypePill.containerRef}
            className="relative flex items-center gap-1 p-1 rounded-xl sx-glass-panel border border-[var(--sx-outline)]"
          >
            {mediaTypePill.pillRect.ready && (
              <span
                aria-hidden="true"
                style={{
                  transform: `translate3d(${mediaTypePill.pillRect.left}px, ${mediaTypePill.pillRect.top}px, 0)`,
                  width: `${mediaTypePill.pillRect.width}px`,
                  height: `${mediaTypePill.pillRect.height}px`,
                }}
                className="sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-lg sx-glass-active"
              />
            )}
            {(['ANIME', 'MANGA'] as MediaType[]).map((t) => (
              <button
                key={t}
                ref={mediaTypePill.registerItemRef(t)}
                type="button"
                onClick={() => setMediaType(t)}
                className={`relative z-10 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
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

      {/* Status Filter Tabs + Bookmarks + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            type="button"
            data-testid="library-bookmarks-tab"
            onClick={() => setShowBookmarks((v) => !v)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
              showBookmarks
                ? 'sx-glass-active font-extrabold'
                : 'sx-glass-panel border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            }`}
          >
            <Bookmark className={`w-3.5 h-3.5 ${showBookmarks ? 'fill-current' : ''}`} />
            <span>Bookmarks</span>
            {totalBookmarksForType > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-extrabold tabular-nums leading-none bg-[var(--sx-primary)]/15 text-[var(--sx-primary)]">
                {totalBookmarksForType}
              </span>
            )}
          </button>

          {STATUS_TABS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => {
                setShowBookmarks(false);
                setStatus(s);
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 border transition-colors ${
                !showBookmarks && status === s
                  ? 'sx-glass-active font-extrabold'
                  : 'sx-glass-panel border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
              }`}
            >
              {getStatusLabel(s, mediaType)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[var(--sx-on-surface-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              placeholder={showBookmarks ? 'Filter bookmarks...' : 'Filter library...'}
              className="w-full pl-8 pr-3 py-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] text-xs focus:outline-none focus:border-[var(--sx-primary)]"
            />
          </div>
          {mode === 'cloud' && !showBookmarks && (
            <button
              type="button"
              onClick={loadCloud}
              className="p-2 rounded-xl sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]"
              title="Refresh Cloud Library"
            >
              <RefreshCw className={`w-4 h-4 ${loadingCloud ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {showBookmarks ? (
        bookmarkedForType.length === 0 ? (
          <div className="py-16 text-center rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/40 backdrop-blur-lg border border-white/25 dark:border-white/10 space-y-3">
            <Bookmark className="w-8 h-8 mx-auto text-[var(--sx-on-surface-muted)]" />
            <p className="text-base font-bold">
              No bookmarked {mediaType === 'ANIME' ? 'episodes' : 'chapters'} yet
            </p>
            <p className="text-xs text-[var(--sx-on-surface-muted)] max-w-md mx-auto">
              Tap the bookmark button on any {mediaType === 'ANIME' ? 'episode' : 'chapter'} in Classic layout to save your favorites here.
            </p>
          </div>
        ) : (
          <div
            data-testid="library-bookmarks-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {bookmarkedForType.map((item) => {
              const mediaTitle = getPreferredTitle(
                item.media.title,
                state.contentPrefs.titlePreference,
              );
              const isItemManga = item.mediaType === 'MANGA';
              return (
                <div
                  key={item.id}
                  data-testid={`library-bookmark-card-${item.id}`}
                  className="group relative flex items-center gap-3 p-3 rounded-[var(--sx-radius)] bg-[var(--sx-surface-container)]/35 dark:bg-[var(--sx-surface-container)]/40 backdrop-blur-lg border border-white/35 dark:border-white/12 shadow-sm hover:border-[var(--sx-primary)]/60 transition-colors"
                >
                  <div className="relative w-24 aspect-video rounded-xl overflow-hidden bg-black/30 shrink-0">
                    <SmartImage
                      src={item.thumbnail || item.media.banner || item.media.cover}
                      alt={item.itemTitle}
                      fallbackTitle={`${isItemManga ? 'CH' : 'EP'} ${item.itemNumber}`}
                      fit="cover"
                      className="w-full h-full"
                    />
                  </div>

                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[var(--sx-primary)]/16 text-[var(--sx-primary)] text-[9px] font-extrabold uppercase">
                        {isItemManga ? 'CH' : 'EP'} {item.itemNumber}
                      </span>
                      <span className="text-[11px] font-semibold text-[var(--sx-on-surface-muted)] truncate">
                        {mediaTitle}
                      </span>
                    </div>
                    <p className="text-xs font-extrabold text-[var(--sx-on-surface)] truncate">
                      {item.itemTitle}
                    </p>
                    <div className="pt-1 flex items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`library-bookmark-play-${item.id}`}
                        onClick={() => {
                          if (isItemManga) {
                            const mangaSourceId =
                              state.discoveryPrefs.preferredMangaSourceId || 'mangadex-bridge';
                            const mangaSource = [...INBUILT_SOURCES, ...state.customSources].find(
                              (s) => s.id === mangaSourceId,
                            );
                            navigate('/reader', {
                              state: {
                                media: item.media,
                                targetChapterNumber: item.itemNumber,
                                sourceId: mangaSource?.id || 'mangadex-bridge',
                                sourceName: mangaSource?.name,
                                sourceBaseUrl: mangaSource?.baseUrl,
                                sourceLang: mangaSource?.lang,
                              },
                            });
                          } else {
                            navigate(`/details/${item.mediaType.toLowerCase()}/${item.mediaId}`, {
                              state: {
                                media: item.media,
                                initialTab: 'watch',
                                episodeNumber: item.itemNumber,
                                resumePlaying: true,
                              },
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full sx-glass-cta text-[10px] font-extrabold"
                      >
                        {isItemManga ? (
                          <BookOpen className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3 fill-current" />
                        )}
                        <span>{isItemManga ? 'Read' : 'Watch'}</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`library-bookmark-remove-${item.id}`}
                        onClick={() =>
                          toggleItemBookmark(
                            item.media,
                            item.itemNumber,
                            item.itemTitle,
                            item.thumbnail,
                          )
                        }
                        title="Remove bookmark"
                        aria-label={`Remove ${item.itemTitle} from bookmarks`}
                        className="p-1.5 rounded-full bg-[var(--sx-on-surface)]/8 dark:bg-white/10 text-[var(--sx-on-surface-muted)] hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : loadingCloud ? (
        <div
          aria-busy="true"
          aria-label="Loading cloud library"
          className={getMediaGridClassName(state.uiPrefs.cardStyle)}
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <MediaCardSkeleton key={i} index={i} style={state.uiPrefs.cardStyle} fullWidth />
          ))}
        </div>
      ) : cloudError ? (
        <div className="p-6 rounded-[var(--sx-radius)] sx-glass-panel border border-red-500/30 text-center text-xs text-red-400">
          {cloudError}
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="py-16 text-center rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] space-y-3">
          <p className="text-base font-bold">Your {getStatusLabel(status, mediaType)} list is empty</p>
          <p className="text-xs text-[var(--sx-on-surface-muted)]">
            Discover {mediaType.toLowerCase()} and add titles to track your progress here.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/discover?type=${mediaType}`)}
            className="px-4 py-2 rounded-xl sx-glass-cta text-xs font-bold"
          >
            Explore {mediaType === 'MANGA' ? 'Manga' : 'Anime'}
          </button>
        </div>
      ) : (
        <div className={getMediaGridClassName(state.uiPrefs.cardStyle)}>
          {filteredEntries.map((entry, idx) => {
            const total =
              entry.mediaType === 'MANGA' ? entry.media.chapters : entry.media.episodes;
            const label = `${entry.mediaType === 'MANGA' ? 'Ch' : 'Ep'} ${entry.progress}${
              total ? ` / ${total}` : ''
            }`;
            return (
              <MediaCard
                key={`${entry.mediaId}-${entry.status}`}
                media={entry.media}
                fullWidth
                animationIndex={idx}
                progressLabel={label}
                progressPercent={total ? entry.progress / total : undefined}
                onClick={() =>
                  navigate(`/details/${entry.media.type.toLowerCase()}/${entry.media.id}`, {
                    state: { media: entry.media },
                  })
                }
              />
            );
          })}
        </div>
      )}
    </div>
  );
};

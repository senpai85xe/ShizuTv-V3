import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookOpen,
  Bookmark,
  Check,
  ChevronDown,
  Clock,
  Download,
  Pause,
  Play,
  Trash2,
} from 'lucide-react';
import { EpisodeChapterStyle } from '../data/themePresets';
import { DownloadTask } from '../types/media';
import { useApp } from '../store/AppContext';
import {
  computeInitialVisibleEpisodeCount,
  computeNextVisibleEpisodeCount,
  EPISODE_RENDER_BATCH_SIZE,
  formatDownloadProgressPercent,
  getEpisodeChapterContainerClass,
  resolveEpisodeChapterStyle,
  shouldAnimateEpisodeRow,
} from '../utils/episodeChapterStyle';
import { SmartImage } from './SmartImage';
import { getBoundedStaggerDelay } from '../utils/appMotion';

export interface EpisodeChapterListItem {
  id: string;
  number: number;
  title: string;
  meta: string;
  thumbnail?: string | null;
  isFiller?: boolean;
  isCurrent?: boolean;
  isNew?: boolean;
  isWatched?: boolean;
  isBookmarked?: boolean;
  downloadTask?: DownloadTask | null;
}

interface EpisodeChapterListProps {
  items: EpisodeChapterListItem[];
  unitLabel: 'EPISODE' | 'CHAPTER';
  style?: EpisodeChapterStyle;
  isManga?: boolean;
  previewMode?: boolean;
  translucent?: boolean;
  onSelectItem: (item: EpisodeChapterListItem, index: number) => void;
  onDownloadItem?: (item: EpisodeChapterListItem, index: number) => void;
  onDeleteDownload?: (item: EpisodeChapterListItem, index: number) => void;
  onToggleBookmark?: (item: EpisodeChapterListItem, index: number) => void;
}

interface EpisodeDownloadButtonProps {
  item: EpisodeChapterListItem;
  index: number;
  unitLabel: 'EPISODE' | 'CHAPTER';
  surfaceClass: string;
  compact?: boolean;
  onDarkMedia?: boolean;
  onDownloadItem: (item: EpisodeChapterListItem, index: number) => void;
  onDeleteDownload?: (item: EpisodeChapterListItem, index: number) => void;
}

const EpisodeDownloadButton: React.FC<EpisodeDownloadButtonProps> = ({
  item,
  index,
  unitLabel,
  surfaceClass,
  compact = false,
  onDarkMedia = false,
  onDownloadItem,
  onDeleteDownload,
}) => {
  const task = item.downloadTask;
  const pct = task ? formatDownloadProgressPercent(task.progress) : 0;
  const radius = 11;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (pct / 100) * circumference;
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!task || task.status !== 'completed') {
      setConfirmDelete(false);
    }
  }, [task?.status]);

  useEffect(() => {
    if (!confirmDelete) return;
    const timer = window.setTimeout(() => setConfirmDelete(false), 5000);
    return () => window.clearTimeout(timer);
  }, [confirmDelete]);

  if (task && task.status === 'completed') {
    if (confirmDelete) {
      return (
        <button
          type="button"
          data-testid={`episode-download-btn-${item.number}`}
          data-delete-armed="true"
          onClick={() => {
            setConfirmDelete(false);
            (onDeleteDownload ?? onDownloadItem)(item, index);
          }}
          title={`Delete downloaded ${unitLabel.toLowerCase()} ${item.number}`}
          aria-label={`Delete downloaded ${unitLabel.toLowerCase()} ${item.number}`}
          className={`inline-flex items-center justify-center border backdrop-blur-md shadow-sm transition-colors shrink-0 ${
            onDarkMedia
              ? 'border-red-300/70 bg-red-600/90 text-white hover:bg-red-500'
              : 'border-red-400/70 bg-red-500/85 text-white hover:bg-red-600'
          } ${compact ? 'p-1.5 rounded-full' : 'p-2 rounded-xl'}`}
        >
          <Trash2 className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid={`episode-download-btn-${item.number}`}
        data-download-completed="true"
        onClick={() => setConfirmDelete(true)}
        title={`Downloaded ${unitLabel.toLowerCase()} ${item.number} — tap to delete`}
        aria-label={`Downloaded ${unitLabel.toLowerCase()} ${item.number}`}
        className={`inline-flex items-center justify-center border border-emerald-400/55 backdrop-blur-md transition-colors shrink-0 ${
          onDarkMedia
            ? 'bg-emerald-600/85 text-white hover:bg-emerald-500'
            : 'bg-emerald-500/22 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/32'
        } ${compact ? 'p-1.5 rounded-full' : 'p-2 rounded-xl'}`}
      >
        <Check className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
      </button>
    );
  }

  if (task && (task.status === 'downloading' || task.status === 'pending' || task.status === 'paused')) {
    const isPaused = task.status === 'paused';
    return (
      <button
        type="button"
        data-testid={`episode-download-btn-${item.number}`}
        onClick={() => onDownloadItem(item, index)}
        title={
          isPaused
            ? `Paused at ${pct}% — click to resume`
            : `Downloading ${unitLabel.toLowerCase()} ${item.number}: ${pct}% — click to pause`
        }
        aria-label={
          isPaused
            ? `Resume download ${unitLabel.toLowerCase()} ${item.number} (${pct}%)`
            : `Pause download ${unitLabel.toLowerCase()} ${item.number} (${pct}%)`
        }
        className={`inline-flex items-center gap-1.5 rounded-full border backdrop-blur-md font-extrabold transition-colors shrink-0 ${
          isPaused
            ? onDarkMedia
              ? 'border-amber-300/60 bg-amber-500/80 text-white'
              : 'border-amber-400/50 bg-amber-500/22 text-amber-700 dark:text-amber-300'
            : onDarkMedia
              ? 'border-white/35 bg-black/65 text-white'
              : 'border-[var(--sx-primary)]/45 bg-[var(--sx-surface-container)]/78 dark:bg-white/14 text-[var(--sx-on-surface)]'
        } ${compact ? 'px-2 py-1 text-[10px]' : 'px-2.5 py-1 text-[10px]'}`}
      >
        <span className="relative w-5 h-5 flex items-center justify-center shrink-0">
          <svg className="w-5 h-5 -rotate-90" viewBox="0 0 28 28" aria-hidden="true">
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeOpacity="0.25"
              strokeWidth="2.8"
            />
            <circle
              cx="14"
              cy="14"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className="transition-[stroke-dashoffset] duration-300"
            />
          </svg>
          {isPaused ? (
            <Pause className="w-2.5 h-2.5 absolute fill-current" />
          ) : (
            <Download className="w-2.5 h-2.5 absolute" />
          )}
        </span>
        <span className="tabular-nums leading-none">{pct}%</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      data-testid={`episode-download-btn-${item.number}`}
      onClick={() => onDownloadItem(item, index)}
      title={`Download ${unitLabel.toLowerCase()} ${item.number}`}
      aria-label={`Download ${unitLabel.toLowerCase()} ${item.number}`}
      className={`${compact ? 'p-1.5 rounded-full' : 'p-2 rounded-xl'} transition-colors shrink-0 ${surfaceClass}`}
    >
      <Download className={compact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
    </button>
  );
};

export const EpisodeChapterList: React.FC<EpisodeChapterListProps> = ({
  items,
  unitLabel,
  style: styleOverride,
  isManga = false,
  previewMode = false,
  translucent = false,
  onSelectItem,
  onDownloadItem,
  onDeleteDownload,
  onToggleBookmark,
}) => {
  const { state } = useApp();
  const activeStyle = resolveEpisodeChapterStyle(
    styleOverride ?? state.uiPrefs.episodeChapterStyle,
  );
  const containerClass = getEpisodeChapterContainerClass(activeStyle, previewMode);
  const ActionIcon = isManga ? BookOpen : Play;

  const listSignature = `${items.length}-${items[0]?.id ?? ''}-${items[items.length - 1]?.id ?? ''}`;
  const [visibleCount, setVisibleCount] = useState<number>(() =>
    computeInitialVisibleEpisodeCount(items.length),
  );
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setVisibleCount(computeInitialVisibleEpisodeCount(items.length));
  }, [listSignature, items.length]);

  const clampedVisibleCount = Math.min(items.length, Math.max(visibleCount, 0));
  const hasMore = !previewMode && clampedVisibleCount < items.length;
  const visibleItems = useMemo(
    () => (previewMode ? items : items.slice(0, clampedVisibleCount)),
    [items, previewMode, clampedVisibleCount],
  );

  useEffect(() => {
    if (!hasMore || typeof IntersectionObserver === 'undefined') return;
    const node = sentinelRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisibleCount((prev) =>
            computeNextVisibleEpisodeCount(prev, items.length, EPISODE_RENDER_BATCH_SIZE),
          );
        }
      },
      { rootMargin: '420px 0px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, items.length, clampedVisibleCount]);

  // Progressive batching keeps initial DOM nodes <= 48, so all 5 styles stay cleanly frosted & blurred
  const frostedCardSurface = translucent
    ? 'bg-[var(--sx-surface-container)]/26 dark:bg-[var(--sx-surface-container)]/32 backdrop-blur-lg backdrop-saturate-150 border-white/40 dark:border-white/12 shadow-[0_6px_24px_rgba(15,23,42,0.06)] ring-1 ring-inset ring-white/20 dark:ring-white/5'
    : 'bg-[var(--sx-surface-container)]/52 dark:bg-[var(--sx-surface-container)]/48 backdrop-blur-lg border-[var(--sx-outline)]';

  const frostedWatchedSurface = translucent
    ? 'bg-black/14 dark:bg-black/46 backdrop-blur-lg backdrop-saturate-125 border-white/25 dark:border-white/10 shadow-[0_4px_18px_rgba(15,23,42,0.08)] ring-1 ring-inset ring-black/10 dark:ring-white/5'
    : 'bg-black/12 dark:bg-black/40 backdrop-blur-lg border-[var(--sx-outline)]';

  const downloadBtnSurface = translucent
    ? 'bg-[var(--sx-on-surface)]/8 dark:bg-white/10 backdrop-blur-md border border-white/30 dark:border-white/12 hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]'
    : 'sx-glass-control hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]';

  const remainingCount = Math.max(0, items.length - clampedVisibleCount);
  const nextBatchCount = Math.min(EPISODE_RENDER_BATCH_SIZE, remainingCount);
  const pluralUnit = unitLabel === 'CHAPTER' ? 'chapters' : 'episodes';

  const progressiveFooter = hasMore ? (
    <div
      ref={sentinelRef}
      data-testid="episode-progressive-footer"
      className="mt-3 flex flex-wrap items-center justify-center gap-2"
    >
      <button
        type="button"
        data-testid="episode-load-more-btn"
        onClick={() =>
          setVisibleCount((prev) =>
            computeNextVisibleEpisodeCount(prev, items.length, EPISODE_RENDER_BATCH_SIZE),
          )
        }
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--sx-surface-container)]/48 dark:bg-[var(--sx-surface-container)]/52 backdrop-blur-lg border border-white/35 dark:border-white/12 text-xs font-extrabold text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors tabular-nums"
      >
        <ChevronDown className="w-3.5 h-3.5 text-[var(--sx-primary)]" />
        <span>
          Load {nextBatchCount} more ({remainingCount} left)
        </span>
      </button>
      <button
        type="button"
        data-testid="episode-show-all-btn"
        onClick={() => setVisibleCount(items.length)}
        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-[var(--sx-surface-container)]/36 dark:bg-[var(--sx-surface-container)]/40 backdrop-blur-lg border border-white/30 dark:border-white/12 text-xs font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)] transition-colors tabular-nums"
      >
        <span>Show all {items.length}</span>
      </button>
    </div>
  ) : null;

  if (activeStyle === 'classic') {
    return (
      <div>
        <div data-testid="episode-list-classic" className={containerClass}>
          {visibleItems.map((item, idx) => {
            const animateRow = shouldAnimateEpisodeRow(idx, previewMode);
            const watched = Boolean(item.isWatched);
            return (
              <div
                key={item.id}
                data-watched={watched ? 'true' : 'false'}
                style={
                  animateRow
                    ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
                    : undefined
                }
                className={`sx-ep-row-contain group relative flex items-center justify-between gap-2 overflow-hidden rounded-[var(--sx-radius)] ${
                  watched ? frostedWatchedSurface : frostedCardSurface
                } border transition-colors ${
                  item.isCurrent
                    ? 'border-[var(--sx-primary)]/75 ring-1 ring-inset ring-[var(--sx-primary)]/25'
                    : 'hover:border-[var(--sx-primary)]/60'
                } ${animateRow ? 'sx-card-animate' : ''}`}
              >
                {item.thumbnail && (
                  <div className="pointer-events-none absolute inset-0 overflow-hidden">
                    <SmartImage
                      src={item.thumbnail}
                      alt=""
                      fallbackTitle={item.title}
                      fit="contain"
                      objectPosition="right"
                      transparentBg
                      shrinkToImage
                      imgMask="linear-gradient(to right, transparent 0%, rgba(0,0,0,0.35) 28%, rgba(0,0,0,0.88) 64%, black 100%)"
                      className={`w-full h-full group-hover:scale-[1.03] transition-all duration-300 ${
                        watched ? 'opacity-25 group-hover:opacity-40' : 'opacity-45 group-hover:opacity-60'
                      }`}
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => onSelectItem(item, idx)}
                  className="relative z-10 flex-1 flex items-center gap-3 px-3.5 py-2.5 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
                >
                  <div className="flex flex-col items-center shrink-0">
                    <span aria-hidden="true" className="w-[1.5px] h-2 bg-[var(--sx-outline)]" />
                    <span
                      className={`my-0.5 w-7 h-7 rounded-full flex items-center justify-center transition-transform group-hover:scale-105 ${
                        item.isCurrent
                          ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                          : watched
                            ? 'bg-emerald-600/80 text-white'
                            : 'bg-[var(--sx-on-surface)] text-[var(--sx-surface)]'
                      }`}
                    >
                      <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current ml-0.5'}`} />
                    </span>
                    <span aria-hidden="true" className="w-[1.5px] h-2 bg-[var(--sx-outline)]" />
                  </div>

                  <div className={`min-w-0 flex-1 ${watched ? 'opacity-75' : ''}`}>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                        {unitLabel} {item.number}
                      </span>
                      {item.isCurrent && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[var(--sx-primary)]/15 text-[var(--sx-primary)] text-[9px] font-extrabold uppercase tracking-wider">
                          Playing
                        </span>
                      )}
                      {watched && (
                        <span
                          data-testid={`episode-watched-mark-${item.number}`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-extrabold uppercase tracking-wider"
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>Watched</span>
                        </span>
                      )}
                      {item.isFiller && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase">
                          Filler
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-bold text-[var(--sx-on-surface)] truncate group-hover:text-[var(--sx-primary)] transition-colors">
                      {item.title}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                      <Clock className="w-3 h-3 shrink-0" />
                      <span className="truncate">{item.meta}</span>
                    </div>
                  </div>
                </button>

                {(onToggleBookmark || onDownloadItem) && (
                  <div className="relative z-10 mr-3 flex items-center gap-1.5 shrink-0">
                    {onToggleBookmark && (
                      <button
                        type="button"
                        data-testid={`episode-bookmark-btn-${item.number}`}
                        aria-pressed={Boolean(item.isBookmarked)}
                        onClick={() => onToggleBookmark(item, idx)}
                        title={
                          item.isBookmarked
                            ? `Remove ${unitLabel.toLowerCase()} ${item.number} from bookmarks`
                            : `Bookmark ${unitLabel.toLowerCase()} ${item.number}`
                        }
                        aria-label={
                          item.isBookmarked
                            ? `Remove ${unitLabel.toLowerCase()} ${item.number} from bookmarks`
                            : `Bookmark ${unitLabel.toLowerCase()} ${item.number}`
                        }
                        className={`p-2 rounded-xl transition-colors shrink-0 ${
                          item.isBookmarked
                            ? 'bg-[var(--sx-primary)]/20 backdrop-blur-md border border-[var(--sx-primary)]/45 text-[var(--sx-primary)]'
                            : downloadBtnSurface
                        }`}
                      >
                        <Bookmark className={`w-4 h-4 ${item.isBookmarked ? 'fill-current' : ''}`} />
                      </button>
                    )}

                    {onDownloadItem && (
                      <EpisodeDownloadButton
                        item={item}
                        index={idx}
                        unitLabel={unitLabel}
                        surfaceClass={downloadBtnSurface}
                        onDownloadItem={onDownloadItem}
                        onDeleteDownload={onDeleteDownload}
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {progressiveFooter}
      </div>
    );
  }

  if (activeStyle === 'grid') {
    return (
      <div>
        <div data-testid="episode-list-grid" className={containerClass}>
          {visibleItems.map((item, idx) => {
            const animateRow = shouldAnimateEpisodeRow(idx, previewMode);
            const watched = Boolean(item.isWatched);
            return (
              <div
                key={item.id}
                data-watched={watched ? 'true' : 'false'}
                style={
                  animateRow
                    ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
                    : undefined
                }
                className={`sx-ep-row-contain group relative aspect-[16/10] rounded-[var(--sx-radius)] overflow-hidden ${
                  watched ? frostedWatchedSurface : frostedCardSurface
                } border transition-colors ${
                  item.isCurrent
                    ? 'border-[var(--sx-primary)]/75 ring-1 ring-inset ring-[var(--sx-primary)]/25'
                    : 'hover:border-[var(--sx-primary)]/65'
                } ${animateRow ? 'sx-card-animate' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectItem(item, idx)}
                  className="w-full h-full text-left relative focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
                >
                  <SmartImage
                    src={item.thumbnail}
                    alt={item.title}
                    fallbackTitle={`${unitLabel} ${item.number}`}
                    fit="contain"
                    backdropFill
                    className={`w-full h-full group-hover:scale-[1.03] transition-transform duration-300 ${
                      watched ? 'opacity-65' : ''
                    }`}
                  />
                  <div
                    className={`pointer-events-none absolute inset-0 z-[2] ${
                      watched
                        ? 'bg-gradient-to-t from-black/82 via-black/46 to-black/32'
                        : 'bg-gradient-to-t from-black/72 via-black/22 to-transparent'
                    }`}
                  />

                  <div className="absolute top-2 left-2 z-[3] flex items-center gap-1">
                    {watched && (
                      <span
                        data-testid={`episode-watched-mark-${item.number}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/85 backdrop-blur-md text-white text-[9px] font-black uppercase tracking-wider shadow"
                      >
                        <Check className="w-2.5 h-2.5" />
                        <span>Watched</span>
                      </span>
                    )}
                    {item.isNew && (
                      <span className="px-1.5 py-0.5 rounded bg-[var(--sx-primary)] text-[var(--sx-on-primary)] text-[9px] font-black uppercase tracking-wider shadow">
                        NEW
                      </span>
                    )}
                  </div>

                  <div className={`absolute bottom-2.5 inset-x-3 z-[3] text-left ${watched ? 'opacity-80' : ''}`}>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg font-black text-white tabular-nums leading-none drop-shadow">
                        {item.number}
                      </span>
                      {item.isFiller && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/80 text-black text-[9px] font-extrabold uppercase">
                          Filler
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-bold text-white truncate mt-1 drop-shadow">
                      {item.title}
                    </p>
                    <p className="text-[10px] text-white/75 truncate mt-0.5">{item.meta}</p>
                  </div>
                </button>

                {onDownloadItem && (
                  <div className="absolute top-2 right-2 z-20 inline-flex items-center p-0.5 rounded-full bg-black/40 backdrop-blur-md border border-white/20">
                    <EpisodeDownloadButton
                      item={item}
                      index={idx}
                      unitLabel={unitLabel}
                      surfaceClass="text-white hover:bg-[var(--sx-primary)] hover:text-[var(--sx-on-primary)]"
                      compact
                      onDarkMedia
                      onDownloadItem={onDownloadItem}
                      onDeleteDownload={onDeleteDownload}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {progressiveFooter}
      </div>
    );
  }

  if (activeStyle === 'box') {
    return (
      <div>
        <div data-testid="episode-list-box" className={containerClass}>
          {visibleItems.map((item, idx) => {
            const animateRow = shouldAnimateEpisodeRow(idx, previewMode);
            const watched = Boolean(item.isWatched);
            return (
              <button
                key={item.id}
                type="button"
                data-watched={watched ? 'true' : 'false'}
                onClick={() => onSelectItem(item, idx)}
                aria-label={`${unitLabel} ${item.number}: ${item.title}`}
                style={
                  animateRow
                    ? { animationDelay: `${getBoundedStaggerDelay(idx, 14, 12)}ms` }
                    : undefined
                }
                className={`sx-ep-row-contain relative rounded-[var(--sx-radius)] border p-2.5 flex flex-col items-center justify-center text-center min-h-[58px] transition-colors focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
                  animateRow ? 'sx-card-animate' : ''
                } ${
                  item.isCurrent
                    ? 'bg-[var(--sx-primary)]/85 backdrop-blur-lg text-[var(--sx-on-primary)] border-[var(--sx-primary)] shadow-md'
                    : watched
                      ? `${frostedWatchedSurface} text-[var(--sx-on-surface)]/70 hover:border-[var(--sx-primary)]/60`
                      : `${frostedCardSurface} text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/65 hover:bg-[var(--sx-surface-container)]/45`
                }`}
              >
                {watched && (
                  <span
                    data-testid={`episode-watched-mark-${item.number}`}
                    title="Watched"
                    className="absolute top-1.5 left-1.5 w-4 h-4 rounded-full bg-emerald-500/25 text-emerald-600 dark:text-emerald-300 flex items-center justify-center"
                  >
                    <Check className="w-2.5 h-2.5" />
                  </span>
                )}
                {item.isFiller && (
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-amber-400"
                  />
                )}
                <span className="text-sm sm:text-base font-extrabold tabular-nums leading-tight">
                  {item.number}
                </span>
                <span className="text-[10px] opacity-70 truncate max-w-full mt-0.5">
                  {item.meta.split('·')[0].trim()}
                </span>
              </button>
            );
          })}
        </div>
        {progressiveFooter}
      </div>
    );
  }

  if (activeStyle === 'compact') {
    return (
      <div>
        <div data-testid="episode-list-compact" className={containerClass}>
          {visibleItems.map((item, idx) => {
            const animateRow = shouldAnimateEpisodeRow(idx, previewMode);
            const watched = Boolean(item.isWatched);
            return (
              <div
                key={item.id}
                data-watched={watched ? 'true' : 'false'}
                style={
                  animateRow
                    ? { animationDelay: `${getBoundedStaggerDelay(idx, 16, 10)}ms` }
                    : undefined
                }
                className={`sx-ep-row-contain group flex items-center justify-between gap-2 px-3.5 py-2.5 transition-colors ${
                  watched
                    ? 'bg-black/14 dark:bg-black/42 hover:bg-black/20 dark:hover:bg-black/52'
                    : 'hover:bg-[var(--sx-surface-container)]/40'
                } ${animateRow ? 'sx-card-animate' : ''}`}
              >
                <button
                  type="button"
                  onClick={() => onSelectItem(item, idx)}
                  className={`flex-1 flex items-center gap-3 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
                    watched ? 'opacity-75' : ''
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs sm:text-sm font-extrabold tabular-nums shrink-0 ${
                      item.isCurrent
                        ? 'bg-[var(--sx-primary)] text-[var(--sx-on-primary)]'
                        : watched
                          ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                          : 'text-[var(--sx-on-surface)]'
                    }`}
                  >
                    {item.number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-bold text-[var(--sx-on-surface)] truncate group-hover:text-[var(--sx-primary)] transition-colors">
                        {item.title}
                      </p>
                      {watched && (
                        <span
                          data-testid={`episode-watched-mark-${item.number}`}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-extrabold uppercase shrink-0"
                        >
                          <Check className="w-2.5 h-2.5" />
                          <span>Watched</span>
                        </span>
                      )}
                      {item.isFiller && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase shrink-0">
                          Filler
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                      {item.meta}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onSelectItem(item, idx)}
                    aria-label={`${isManga ? 'Read' : 'Play'} ${unitLabel.toLowerCase()} ${item.number}`}
                    className="p-1.5 rounded-full text-[var(--sx-on-surface-muted)] group-hover:text-[var(--sx-primary)] transition-colors"
                  >
                    <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current'}`} />
                  </button>
                  {onDownloadItem && (
                    <EpisodeDownloadButton
                      item={item}
                      index={idx}
                      unitLabel={unitLabel}
                      surfaceClass={downloadBtnSurface}
                      compact
                      onDownloadItem={onDownloadItem}
                      onDeleteDownload={onDeleteDownload}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {progressiveFooter}
      </div>
    );
  }

  // 'cover' style — wide 16:9 thumbnail left + details right
  return (
    <div>
      <div data-testid="episode-list-cover" className={containerClass}>
        {visibleItems.map((item, idx) => {
          const animateRow = shouldAnimateEpisodeRow(idx, previewMode);
          const watched = Boolean(item.isWatched);
          return (
            <div
              key={item.id}
              data-watched={watched ? 'true' : 'false'}
              style={
                animateRow
                  ? { animationDelay: `${getBoundedStaggerDelay(idx, 18, 10)}ms` }
                  : undefined
              }
              className={`sx-ep-row-contain group flex items-center justify-between gap-3 p-2.5 rounded-[var(--sx-radius)] ${
                watched ? frostedWatchedSurface : frostedCardSurface
              } border transition-colors ${
                item.isCurrent
                  ? 'border-[var(--sx-primary)]/75 ring-1 ring-inset ring-[var(--sx-primary)]/25'
                  : 'hover:border-[var(--sx-primary)]/60'
              } ${animateRow ? 'sx-card-animate' : ''}`}
            >
              <button
                type="button"
                onClick={() => onSelectItem(item, idx)}
                className="flex-1 flex items-center gap-3 text-left min-w-0 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
              >
                <div className="relative w-28 sm:w-32 aspect-video rounded-xl overflow-hidden bg-black/25 backdrop-blur-sm shrink-0">
                  <SmartImage
                    src={item.thumbnail}
                    alt={item.title}
                    fallbackTitle={`${unitLabel} ${item.number}`}
                    fit="contain"
                    backdropFill
                    className={`w-full h-full group-hover:scale-[1.03] transition-transform duration-300 ${
                      watched ? 'opacity-65' : ''
                    }`}
                  />
                  <span
                    className={`absolute inset-0 z-[2] flex items-center justify-center transition-colors ${
                      watched
                        ? 'bg-black/38 group-hover:bg-black/48'
                        : 'bg-black/20 group-hover:bg-black/35'
                    }`}
                  >
                    <span className="w-7 h-7 rounded-full bg-black/65 text-white flex items-center justify-center">
                      <ActionIcon className={`w-3.5 h-3.5 ${isManga ? '' : 'fill-current ml-0.5'}`} />
                    </span>
                  </span>
                </div>

                <div className={`min-w-0 flex-1 ${watched ? 'opacity-75' : ''}`}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
                      {unitLabel} {item.number}
                    </span>
                    {watched && (
                      <span
                        data-testid={`episode-watched-mark-${item.number}`}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[9px] font-extrabold uppercase"
                      >
                        <Check className="w-2.5 h-2.5" />
                        <span>Watched</span>
                      </span>
                    )}
                    {item.isFiller && (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 text-[9px] font-bold uppercase">
                        Filler
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-[var(--sx-on-surface)] line-clamp-1 mt-0.5 group-hover:text-[var(--sx-primary)] transition-colors">
                    {item.title}
                  </p>
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] truncate mt-0.5">
                    <Clock className="w-3 h-3 shrink-0" />
                    <span className="truncate">{item.meta}</span>
                  </div>
                </div>
              </button>

              {onDownloadItem && (
                <div className="mr-1 shrink-0">
                  <EpisodeDownloadButton
                    item={item}
                    index={idx}
                    unitLabel={unitLabel}
                    surfaceClass={downloadBtnSurface}
                    onDownloadItem={onDownloadItem}
                    onDeleteDownload={onDeleteDownload}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
      {progressiveFooter}
      {hasMore && (
        <p className="sr-only">
          Showing {clampedVisibleCount} of {items.length} {pluralUnit}
        </p>
      )}
    </div>
  );
};

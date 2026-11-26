import React from 'react';
import { Calendar, Heart, Play, Star, X } from 'lucide-react';
import { getPreferredTitle, UnifiedMedia } from '../types/media';
import { AnyMediaCardStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { SmartImage } from './SmartImage';
import {
  formatCardFormatTag,
  formatCardUnitLabel,
  formatTrendingGenreLabel,
  getContinueWatchingWidthClass,
} from '../utils/mediaCard';
import { getStaggerDelayMs } from '../utils/cardMotion';

interface MediaCardProps {
  media: UnifiedMedia;
  style?: AnyMediaCardStyle;
  onClick: () => void;
  progressLabel?: string;
  progressPercent?: number;
  subtitleRight?: string | null;
  onRemove?: () => void;
  fullWidth?: boolean;
  rank?: number;
  animationIndex?: number;
  className?: string;
}

export const MediaCard: React.FC<MediaCardProps> = ({
  media,
  style: styleOverride,
  onClick,
  progressLabel,
  progressPercent,
  subtitleRight,
  onRemove,
  fullWidth = false,
  rank,
  animationIndex,
  className = '',
}) => {
  const { state, getLibraryEntry, upsertLibraryEntry, removeLibraryEntry } = useApp();
  const cardStyle = styleOverride ?? state.uiPrefs.cardStyle;
  const title = getPreferredTitle(media.title, state.contentPrefs.titlePreference);
  const scoreStr = media.score ? media.score.toFixed(1) : null;
  const roundness = `${state.themePrefs.uiRoundness}px`;

  const entranceStyle: React.CSSProperties | undefined =
    typeof animationIndex === 'number'
      ? { animationDelay: `${getStaggerDelayMs(animationIndex)}ms` }
      : undefined;
  const entranceClass = typeof animationIndex === 'number' ? 'sx-card-animate' : '';
  const cardMotionClass = className ? `sx-card-spring ${className}` : 'sx-card-spring';

  if (cardStyle === 'trendingRank') {
    const rankNum = typeof rank === 'number' && rank > 0 ? rank : 1;
    const genreLabel = formatTrendingGenreLabel(media);

    return (
      <button
        type="button"
        data-testid={`media-card-trending-rank-${media.id}`}
        data-no-press="true"
        data-card-surface="true"
        onClick={onClick}
        style={{ borderRadius: `calc(${roundness} + 8px)`, ...entranceStyle }}
        className={`sx-widget-scale group relative overflow-hidden text-left sx-glass-panel border border-[var(--sx-outline)]/70 aspect-[4/3] ${cardMotionClass} ${entranceClass} hover:border-[var(--sx-primary)]/50 hover:shadow-[0_16px_32px_-14px_rgba(0,0,0,0.5)] focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
          fullWidth ? 'w-full' : 'shrink-0 w-[232px] sm:w-[285px]'
        }`}
      >
        <div className="absolute inset-0 z-0">
          <SmartImage
            src={media.banner || media.cover}
            alt={title}
            fallbackTitle={title}
            className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
        </div>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-3/4 bg-gradient-to-t from-black/95 via-black/45 to-transparent" />

        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 px-3.5 pb-3 pt-4 sm:px-4 sm:pb-3.5 flex items-center gap-2.5 sm:gap-3">
          <span
            data-testid="trending-rank-number"
            className="text-[36px] sm:text-[42px] font-extrabold text-white leading-[0.86] tabular-nums tracking-tight drop-shadow shrink-0 transition-transform duration-300 group-hover:scale-105"
          >
            {rankNum}
          </span>

          <span
            aria-hidden="true"
            className="w-[1.5px] h-8 sm:h-9 bg-white/35 shrink-0"
          />

          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] sm:text-[16px] font-bold text-white line-clamp-1 leading-tight drop-shadow group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || genreLabel) && (
              <div className="mt-1 flex items-center gap-1.5 text-[11px] sm:text-xs tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-white/95 font-semibold shrink-0">
                    <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && genreLabel && (
                  <span aria-hidden="true" className="text-white/55">
                    •
                  </span>
                )}
                {genreLabel && (
                  <span className="text-white/75 font-medium truncate">{genreLabel}</span>
                )}
              </div>
            )}
          </div>
        </div>
      </button>
    );
  }

  if (cardStyle === 'episodeTile') {
    const formatTag = formatCardFormatTag(media);
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const rightText =
      subtitleRight !== undefined
        ? subtitleRight
        : media.duration
          ? `${media.duration}m`
          : null;

    return (
      <div
        data-testid={`media-card-episode-tile-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${getContinueWatchingWidthClass(
          fullWidth,
        )}`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 z-20 w-7 h-7 rounded-full bg-black/60 hover:bg-red-500 backdrop-blur-md border border-white/15 flex items-center justify-center text-white transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-no-press="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            data-card-surface="true"
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[16/10] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/70 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
          >
            <SmartImage
              src={media.banner || media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2 sm:mt-2.5 px-0.5 space-y-1">
            <div className="flex items-center justify-between gap-1.5 sm:gap-2 text-[11px] sm:text-xs">
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span className="text-[var(--sx-primary)] text-[10px] font-extrabold uppercase tracking-wide shrink-0">
                  {formatTag}
                </span>
                <span aria-hidden="true" className="text-[var(--sx-on-surface-muted)]/50">
                  ·
                </span>
                <span className="text-[var(--sx-on-surface-muted)] font-semibold truncate tabular-nums">
                  {stepText}
                </span>
              </div>
              {rightText && (
                <span className="text-[11px] font-medium text-[var(--sx-on-surface-muted)] tabular-nums shrink-0">
                  {rightText}
                </span>
              )}
            </div>
            <h3 className="text-[13px] sm:text-sm font-bold text-[var(--sx-on-surface)] line-clamp-1 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'showcase') {
    const inLibrary = Boolean(getLibraryEntry(media.id));
    const formatTag = formatCardFormatTag(media);
    const unitText = progressLabel ?? formatCardUnitLabel(media);

    const handleToggleLibrary = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inLibrary) {
        removeLibraryEntry(media.id);
      } else {
        void upsertLibraryEntry(media, 'PLANNING', 0);
      }
    };

    return (
      <div
        data-testid={`media-card-showcase-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[158px] sm:w-[174px]'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleLibrary}
          aria-pressed={inLibrary}
          aria-label={inLibrary ? `Remove ${title} from library` : `Add ${title} to library`}
          className="absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full bg-black/50 hover:bg-black/75 backdrop-blur-md border border-white/15 flex items-center justify-center transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              inLibrary ? 'text-[var(--sx-primary)] fill-[var(--sx-primary)]' : 'text-white'
            }`}
          />
        </button>

        <button
          type="button"
          data-no-press="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            data-card-surface="true"
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/70 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
          >
            <SmartImage
              src={media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />

            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />

            <div className="pointer-events-none absolute bottom-2.5 inset-x-2.5 z-20 flex items-center justify-between gap-1.5 text-white text-[10px] font-bold tracking-wide">
              <span className="truncate drop-shadow">{formatTag}</span>
              {media.year && (
                <span className="inline-flex items-center gap-1 tabular-nums shrink-0 drop-shadow">
                  <Calendar className="w-3 h-3 text-white/80" />
                  <span>{media.year}</span>
                </span>
              )}
            </div>

            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2.5 px-0.5 space-y-1">
            <h3 className="text-[13px] sm:text-sm font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || unitText) && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs font-semibold text-[var(--sx-on-surface-muted)] tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-[var(--sx-on-surface)] font-bold">
                    <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && unitText && (
                  <span aria-hidden="true" className="text-[var(--sx-outline)]">
                    ·
                  </span>
                )}
                {unitText && <span>{unitText}</span>}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'shizutv') {
    const inLibrary = Boolean(getLibraryEntry(media.id));
    const formatTag = formatCardFormatTag(media);
    const unitText = progressLabel ?? formatCardUnitLabel(media);

    const handleToggleLibrary = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (inLibrary) {
        removeLibraryEntry(media.id);
      } else {
        void upsertLibraryEntry(media, 'PLANNING', 0);
      }
    };

    return (
      <div
        data-testid={`media-card-shizutv-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[158px] sm:w-[174px]'
        }`}
      >
        <button
          type="button"
          onClick={handleToggleLibrary}
          aria-pressed={inLibrary}
          aria-label={inLibrary ? `Remove ${title} from library` : `Add ${title} to library`}
          style={
            inLibrary
              ? {
                  backgroundColor: 'color-mix(in srgb, var(--sx-primary) 26%, rgba(12, 12, 16, 0.52))',
                  borderColor: 'color-mix(in srgb, var(--sx-primary) 52%, rgba(255, 255, 255, 0.2))',
                }
              : undefined
          }
          className={`absolute top-2.5 right-2.5 z-20 w-8 h-8 rounded-full backdrop-blur-md border flex items-center justify-center transition-all duration-150 active:scale-90 focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${
            inLibrary
              ? 'shadow-sm'
              : 'bg-black/42 hover:bg-black/62 border-white/20'
          }`}
        >
          <Heart
            className={`w-4 h-4 transition-colors ${
              inLibrary ? 'text-[var(--sx-primary)] fill-[var(--sx-primary)]' : 'text-white'
            }`}
          />
        </button>

        <button
          type="button"
          data-no-press="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            data-card-surface="true"
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/65 group-hover:border-[var(--sx-primary)]/55 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.4)] transition-all duration-200"
          >
            <SmartImage
              src={media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />

            <div className="pointer-events-none absolute bottom-2 inset-x-2 z-20 flex items-center justify-between gap-1.5">
              <span className="inline-flex items-center px-2.5 py-[3px] rounded-full bg-black/68 backdrop-blur-md border border-white/10 text-white text-[10px] sm:text-[11px] font-bold tracking-wide truncate">
                {formatTag}
              </span>
              {media.year && (
                <span className="inline-flex items-center gap-1 px-2.5 py-[3px] rounded-full bg-black/68 backdrop-blur-md border border-white/10 text-white text-[10px] sm:text-[11px] font-bold tabular-nums shrink-0">
                  <Calendar className="w-3 h-3 text-white/90" />
                  <span>{media.year}</span>
                </span>
              )}
            </div>

            {typeof progressPercent === 'number' && (
              <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/50">
                <div
                  className="h-full bg-[var(--sx-primary)] transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
                />
              </div>
            )}
          </div>

          <div className="mt-2 px-0.5 space-y-1">
            <h3 className="text-[13px] sm:text-[14px] font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-[1.28] group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            {(scoreStr || unitText) && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs tabular-nums truncate">
                {scoreStr && (
                  <span className="inline-flex items-center gap-1 text-[var(--sx-on-surface)] font-bold shrink-0">
                    <Star className="w-3.5 h-3.5 fill-[#F5B942] text-[#F5B942]" />
                    <span>{scoreStr}</span>
                  </span>
                )}
                {scoreStr && unitText && (
                  <span
                    aria-hidden="true"
                    className="w-[1px] h-3 bg-[var(--sx-on-surface-muted)]/45 shrink-0"
                  />
                )}
                {unitText && (
                  <span className="font-semibold text-[var(--sx-on-surface-muted)] uppercase tracking-wide truncate">
                    {unitText}
                  </span>
                )}
              </div>
            )}
          </div>
        </button>
      </div>
    );
  }

  // 4 New Continue Row Styles: glassResume, posterBar, splitProgress, auroraStrip
  if (cardStyle === 'glassResume') {
    const formatTag = formatCardFormatTag(media);
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const pct = typeof progressPercent === 'number' ? Math.min(100, Math.max(4, progressPercent * 100)) : 38;

    return (
      <div
        data-testid={`media-card-glass-resume-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${getContinueWatchingWidthClass(
          fullWidth,
        )}`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/55 hover:bg-red-500 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all duration-150 active:scale-90"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-no-press="true"
          data-card-surface="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left sx-glass-panel border border-[var(--sx-outline)] overflow-hidden p-1.5 hover:border-[var(--sx-primary)]/50 transition-all focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: `calc(${roundness} - 4px)` }}
            className="relative w-full aspect-[16/10] overflow-hidden bg-[var(--sx-surface-high)]"
          >
            <SmartImage
              src={media.banner || media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
            <div className="pointer-events-none absolute inset-x-2 bottom-2 z-20 p-2 rounded-xl bg-black/50 backdrop-blur-md border border-white/15 space-y-1.5">
              <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-white">
                <span className="inline-flex items-center gap-1 truncate">
                  <Play className="w-3 h-3 fill-[var(--sx-primary)] text-[var(--sx-primary)] shrink-0" />
                  <span className="truncate">{stepText}</span>
                </span>
                {subtitleRight && (
                  <span className="text-white/75 font-mono-tabular shrink-0">{subtitleRight}</span>
                )}
              </div>
              <div className="h-1 w-full rounded-full bg-white/20 overflow-hidden">
                <div className="h-full rounded-full bg-[var(--sx-primary)]" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <div className="px-1.5 pt-2 pb-1 flex items-center justify-between gap-2">
            <h3 className="text-xs sm:text-[13px] font-extrabold text-[var(--sx-on-surface)] line-clamp-1 group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            <span className="text-[10px] font-bold uppercase text-[var(--sx-primary)] shrink-0">
              {formatTag}
            </span>
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'posterBar') {
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const pct = typeof progressPercent === 'number' ? Math.min(100, Math.max(4, progressPercent * 100)) : 45;

    return (
      <div
        data-testid={`media-card-poster-bar-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative ${cardMotionClass} ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[264px] sm:w-[308px]'
        }`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2 right-2 z-20 w-6 h-6 rounded-full sx-glass-control hover:bg-red-500 border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        )}

        <button
          type="button"
          data-no-press="true"
          data-card-surface="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 p-2.5 flex items-center gap-3 overflow-hidden transition-all focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: `calc(${roundness} - 6px)` }}
            className="relative w-14 sm:w-16 aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60 shrink-0"
          >
            <SmartImage
              src={media.cover || media.banner}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
          </div>

          <div className="min-w-0 flex-1 pr-5 space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full sx-glass-control border border-[var(--sx-outline)] text-[10px] font-bold text-[var(--sx-primary)]">
              <Play className="w-2.5 h-2.5 fill-current" />
              <span className="truncate">{stepText}</span>
            </div>
            <h3 className="text-[13px] font-extrabold text-[var(--sx-on-surface)] line-clamp-1 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-[var(--sx-on-surface-muted)] tabular-nums">
              <span>{formatCardFormatTag(media)}</span>
              {subtitleRight && <span>{subtitleRight}</span>}
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--sx-surface-high)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--sx-primary)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'splitProgress') {
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const pct = typeof progressPercent === 'number' ? Math.min(100, Math.max(4, progressPercent * 100)) : 52;

    return (
      <div
        data-testid={`media-card-split-progress-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${getContinueWatchingWidthClass(
          fullWidth,
        )}`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/55 hover:bg-red-500 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-no-press="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col overflow-hidden focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            data-card-surface="true"
            style={{ borderRadius: roundness }}
            className="relative w-full aspect-[16/10] overflow-hidden border border-[var(--sx-outline)] bg-[var(--sx-surface-high)] group-hover:border-[var(--sx-primary)]/50 transition-all"
          >
            <SmartImage
              src={media.banner || media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/25 to-black/20" />

            <div className="pointer-events-none absolute top-2.5 left-2.5 right-10 z-20 flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white truncate">
                <span className="text-[var(--sx-primary)]">{formatCardFormatTag(media)}</span>
                <span className="text-white/50">·</span>
                <span className="truncate">{stepText}</span>
              </span>
            </div>

            <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 space-y-1.5">
              <div className="flex items-end justify-between gap-2">
                <h3 className="text-xs sm:text-[13px] font-extrabold text-white line-clamp-1 drop-shadow">
                  {title}
                </h3>
                {subtitleRight && (
                  <span className="text-[10px] font-semibold text-white/80 shrink-0 tabular-nums">
                    {subtitleRight}
                  </span>
                )}
              </div>
              <div className="h-1 w-full rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-[var(--sx-primary)] shadow-[0_0_8px_var(--sx-primary)]"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          </div>
        </button>
      </div>
    );
  }

  if (cardStyle === 'auroraStrip') {
    const stepText = progressLabel ?? formatCardUnitLabel(media) ?? 'Episode 1';
    const pct = typeof progressPercent === 'number' ? Math.min(100, Math.max(4, progressPercent * 100)) : 60;

    return (
      <div
        data-testid={`media-card-aurora-strip-${media.id}`}
        style={entranceStyle}
        className={`sx-widget-scale group relative flex flex-col ${cardMotionClass} ${entranceClass} ${getContinueWatchingWidthClass(
          fullWidth,
        )}`}
      >
        {onRemove && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${title} from continue list`}
            className="absolute top-2.5 right-2.5 z-20 w-7 h-7 rounded-full bg-black/55 hover:bg-red-500 backdrop-blur-md border border-white/20 flex items-center justify-center text-white transition-all duration-150"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          data-no-press="true"
          data-card-surface="true"
          onClick={onClick}
          style={{ borderRadius: roundness }}
          className="w-full text-left flex flex-col gap-2 p-2 sx-glass-panel border border-[var(--sx-primary)]/25 hover:border-[var(--sx-primary)]/60 shadow-[0_10px_24px_-14px_var(--sx-primary)] transition-all focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]"
        >
          <div
            style={{ borderRadius: `calc(${roundness} - 4px)` }}
            className="relative w-full aspect-[16/10] overflow-hidden bg-[var(--sx-surface-high)]"
          >
            <SmartImage
              src={media.banner || media.cover}
              alt={title}
              fallbackTitle={title}
              className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            />
            <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
            <span className="pointer-events-none absolute bottom-2 left-2 z-20 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/65 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white">
              <Play className="w-2.5 h-2.5 fill-[var(--sx-primary)] text-[var(--sx-primary)]" />
              <span>Resume</span>
            </span>
          </div>

          <div className="px-1 space-y-1.5">
            <h3 className="text-xs sm:text-[13px] font-extrabold text-[var(--sx-on-surface)] line-clamp-1 group-hover:text-[var(--sx-primary)] transition-colors">
              {title}
            </h3>
            <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg sx-glass-control border border-[var(--sx-outline)]/70 text-[10px] font-bold tabular-nums">
              <span className="text-[var(--sx-primary)] truncate">{stepText}</span>
              {subtitleRight && (
                <span className="text-[var(--sx-on-surface-muted)] shrink-0">{subtitleRight}</span>
              )}
            </div>
            <div className="h-1 w-full rounded-full bg-[var(--sx-surface-high)] overflow-hidden">
              <div className="h-full rounded-full bg-[var(--sx-primary)]" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </button>
      </div>
    );
  }

  // Liquid-Glass Media Card Styles: glassPoster, auroraPill, prismFrame
  if (cardStyle === 'glassPoster') {
    const formatTag = formatCardFormatTag(media);
    return (
      <button
        type="button"
        data-testid={`media-card-glass-poster-${media.id}`}
        data-no-press="true"
        data-card-surface="true"
        onClick={onClick}
        style={{ borderRadius: roundness, ...entranceStyle }}
        className={`sx-widget-scale group text-left flex flex-col ${cardMotionClass} sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/50 p-1.5 ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[154px] sm:w-[170px]'
        } focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]`}
      >
        <div
          style={{ borderRadius: `calc(${roundness} - 4px)` }}
          className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)]"
        >
          <SmartImage
            src={media.cover}
            alt={title}
            fallbackTitle={title}
            className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-16 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
          {scoreStr && (
            <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-full bg-black/55 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white border border-white/20 tabular-nums">
              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
              <span>{scoreStr}</span>
            </div>
          )}
          <span className="pointer-events-none absolute bottom-2 left-2 z-20 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white">
            {formatTag}
          </span>
        </div>
        <div className="px-1.5 pt-2 pb-1 space-y-0.5">
          <h3 className="text-[13px] font-extrabold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
            {title}
          </h3>
          {media.year && (
            <p className="text-[10px] font-semibold text-[var(--sx-on-surface-muted)] tabular-nums">
              {media.year}
            </p>
          )}
        </div>
      </button>
    );
  }

  if (cardStyle === 'auroraPill') {
    const formatTag = formatCardFormatTag(media);
    return (
      <button
        type="button"
        data-testid={`media-card-aurora-pill-${media.id}`}
        data-no-press="true"
        onClick={onClick}
        style={{ borderRadius: roundness, ...entranceStyle }}
        className={`sx-widget-scale group text-left flex flex-col ${cardMotionClass} ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[154px] sm:w-[170px]'
        } focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]`}
      >
        <div
          data-card-surface="true"
          style={{ borderRadius: roundness }}
          className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-primary)]/35 shadow-[0_12px_26px_-14px_var(--sx-primary)] group-hover:border-[var(--sx-primary)] transition-all"
        >
          <SmartImage
            src={media.cover}
            alt={title}
            fallbackTitle={title}
            className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-20 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
          <div className="pointer-events-none absolute bottom-2 inset-x-2 z-20 flex items-center justify-between gap-1.5">
            <span className="px-2 py-0.5 rounded-full sx-glass-active text-[10px] font-extrabold backdrop-blur-md">
              {formatTag}
            </span>
            {scoreStr && (
              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/15 text-[10px] font-bold text-white tabular-nums">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                {scoreStr}
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 px-1 space-y-0.5">
          <h3 className="text-[13px] font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
            {title}
          </h3>
          {media.year && (
            <span className="block text-[10px] font-semibold text-[var(--sx-on-surface-muted)] tabular-nums">
              {media.year}
            </span>
          )}
        </div>
      </button>
    );
  }

  if (cardStyle === 'prismFrame') {
    const unitText = progressLabel ?? formatCardUnitLabel(media);
    return (
      <button
        type="button"
        data-testid={`media-card-prism-frame-${media.id}`}
        data-no-press="true"
        data-card-surface="true"
        onClick={onClick}
        style={{ borderRadius: roundness, ...entranceStyle }}
        className={`sx-widget-scale group text-left flex flex-col ${cardMotionClass} sx-glass-panel border border-white/25 dark:border-white/12 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] hover:border-[var(--sx-primary)]/50 ${entranceClass} ${
          fullWidth ? 'w-full' : 'shrink-0 w-[154px] sm:w-[170px]'
        } focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)]`}
      >
        <div
          style={{ borderRadius: `calc(${roundness} - 4px)` }}
          className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)]"
        >
          <SmartImage
            src={media.cover}
            alt={title}
            fallbackTitle={title}
            className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
          />
          <div className="pointer-events-none absolute inset-0 z-10 bg-gradient-to-tr from-black/45 via-transparent to-white/10" />
          {scoreStr && (
            <div className="absolute top-2 left-2 z-20 flex items-center gap-1 rounded-lg bg-black/60 backdrop-blur-md px-2 py-0.5 text-[10px] font-bold text-white border border-white/15 tabular-nums">
              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
              <span>{scoreStr}</span>
            </div>
          )}
        </div>
        <div className="px-1.5 pt-2 pb-1 space-y-1">
          <h3 className="text-[13px] font-bold text-[var(--sx-on-surface)] line-clamp-1 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
            {title}
          </h3>
          <div className="flex items-center justify-between gap-1.5 text-[10px] font-semibold text-[var(--sx-on-surface-muted)] tabular-nums">
            <span className="truncate">{formatCardFormatTag(media)}</span>
            {unitText ? (
              <span className="text-[var(--sx-primary)] font-bold shrink-0">{unitText}</span>
            ) : media.year ? (
              <span className="shrink-0">{media.year}</span>
            ) : null}
          </div>
        </div>
      </button>
    );
  }

  const widthClass = fullWidth
    ? 'w-full'
    : cardStyle === 'compact'
      ? 'shrink-0 w-[122px] sm:w-[132px]'
      : cardStyle === 'minimal'
        ? 'shrink-0 w-[134px] sm:w-[144px]'
        : 'shrink-0 w-[148px] sm:w-[162px]';

  const containerStyle =
    cardStyle === 'material'
      ? 'sx-glass-panel p-2 border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/45'
      : 'bg-transparent';

  return (
    <button
      type="button"
      data-no-press="true"
      data-card-surface={cardStyle === 'material' ? 'true' : undefined}
      onClick={onClick}
      style={{ borderRadius: roundness, ...entranceStyle }}
      className={`sx-widget-scale group text-left flex flex-col ${cardMotionClass} ${entranceClass} focus-visible:outline-2 focus-visible:outline-[var(--sx-primary)] ${widthClass} ${containerStyle}`}
    >
      <div
        data-card-surface={cardStyle !== 'material' ? 'true' : undefined}
        style={{ borderRadius: cardStyle === 'material' ? `calc(${roundness} - 4px)` : roundness }}
        className="relative w-full aspect-[2/3] overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60 group-hover:border-[var(--sx-primary)]/45 group-hover:shadow-[0_14px_28px_-12px_rgba(0,0,0,0.45)] transition-all duration-200"
      >
        <SmartImage
          src={media.cover}
          alt={title}
          fallbackTitle={title}
          className="w-full h-full group-hover:scale-[1.06] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        />
        {cardStyle === 'editorial' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-1/2 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
        )}
        {scoreStr && cardStyle !== 'minimal' && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1 rounded-lg bg-black/75 px-1.5 py-0.5 text-[11px] font-bold text-white backdrop-blur-md border border-white/10 tabular-nums transition-transform duration-200 group-hover:scale-105">
            <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
            <span>{scoreStr}</span>
          </div>
        )}
        {progressLabel && (
          <div className="absolute bottom-2 left-2 right-2 z-20 text-[11px] font-bold text-white drop-shadow">
            {progressLabel}
          </div>
        )}
        {typeof progressPercent === 'number' && (
          <div className="absolute bottom-0 left-0 right-0 z-20 h-1 bg-black/50">
            <div
              className="h-full bg-[var(--sx-primary)] transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(4, progressPercent * 100))}%` }}
            />
          </div>
        )}
      </div>

      <div className={`mt-2 px-0.5 ${cardStyle === 'editorial' ? 'border-t border-[var(--sx-outline)] pt-1.5' : ''}`}>
        <h3 className="text-[13px] font-bold text-[var(--sx-on-surface)] line-clamp-2 leading-snug group-hover:text-[var(--sx-primary)] transition-colors">
          {title}
        </h3>
        {cardStyle !== 'compact' && (
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--sx-on-surface-muted)] tabular-nums truncate">
            <span>{media.format || media.type}</span>
            {media.year && (
              <>
                <span aria-hidden="true">·</span>
                <span>{media.year}</span>
              </>
            )}
            {cardStyle === 'minimal' && scoreStr && (
              <>
                <span aria-hidden="true">·</span>
                <span>★ {scoreStr}</span>
              </>
            )}
          </div>
        )}
      </div>
    </button>
  );
};

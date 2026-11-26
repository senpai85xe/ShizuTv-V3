import React from 'react';
import { ChevronRight } from 'lucide-react';
import { GenreCardStyle } from '../data/themePresets';
import { DiscoverCategoryViewMode, GenreCategoryDescriptor } from '../utils/genreMetadata';
import { GenreIcon } from './GenreIcon';
import { SmartImage } from './SmartImage';

interface GenreCardProps {
  descriptor: GenreCategoryDescriptor;
  style?: GenreCardStyle;
  viewMode?: DiscoverCategoryViewMode;
  roundness?: string;
  animationDelayMs?: number;
  previewMode?: boolean;
  onClick?: () => void;
}

export const GenreCard: React.FC<GenreCardProps> = ({
  descriptor,
  style = 'showcase',
  viewMode = 'grid',
  roundness = '16px',
  animationDelayMs = 0,
  previewMode = false,
  onClick,
}) => {
  const headerGradient = `linear-gradient(95deg, ${descriptor.gradientFrom} 0%, ${descriptor.gradientTo} 100%)`;
  const diagGradient = `linear-gradient(135deg, ${descriptor.gradientFrom} 0%, ${descriptor.gradientTo} 100%)`;
  const enterDelay =
    animationDelayMs > 0 && !previewMode ? { animationDelay: `${animationDelayMs}ms` } : {};
  const animClass = previewMode ? '' : 'sx-card-animate ';

  // 1. Gradient Tile ('classic')
  if (style === 'classic') {
    if (viewMode === 'list') {
      return (
        <button
          type="button"
          data-testid={`genre-card-${descriptor.id}`}
          data-genre-style="classic"
          onClick={onClick}
          style={{
            borderRadius: roundness,
            background: headerGradient,
            ...enterDelay,
          }}
          className={`${animClass}group relative w-full h-16 px-4 text-left overflow-hidden text-white shadow-sm hover:-translate-y-0.5 transition-transform flex items-center justify-between gap-3`}
        >
          <GenreIcon
            iconId={descriptor.iconId}
            className="pointer-events-none select-none absolute right-3 top-1/2 -translate-y-1/2 w-14 h-14 text-white/15 -rotate-6"
          />
          <div className="relative z-10 flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-white/18 flex items-center justify-center shrink-0">
              <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold tracking-tight drop-shadow-sm truncate">
                {descriptor.label}
              </div>
              <div className="text-[11px] text-white/80 truncate">{descriptor.tagline}</div>
            </div>
          </div>
          <span className="relative z-10 text-xs font-bold text-white/90 tabular-nums shrink-0">
            {descriptor.seriesCount} Series
          </span>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid={`genre-card-${descriptor.id}`}
        data-genre-style="classic"
        onClick={onClick}
        style={{
          borderRadius: roundness,
          background: diagGradient,
          ...enterDelay,
        }}
        className={`${animClass}group relative w-full h-24 p-4 text-left overflow-hidden text-white shadow-sm hover:-translate-y-0.5 transition-transform flex flex-col justify-between`}
      >
        <GenreIcon
          iconId={descriptor.iconId}
          className="pointer-events-none select-none absolute -right-1.5 -top-1.5 w-14 h-14 text-white/18 -rotate-6 transition-transform duration-300 group-hover:scale-105"
        />
        <div className="relative z-10 flex items-center justify-between gap-2">
          <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white/95 drop-shadow-sm" />
        </div>
        <span className="relative z-10 text-sm font-extrabold tracking-tight drop-shadow-sm line-clamp-2">
          {descriptor.label}
        </span>
      </button>
    );
  }

  // 2. Poster Mosaic ('mosaicGlass') — Frosted glass panel with fanned cover triptych
  if (style === 'mosaicGlass') {
    if (viewMode === 'list') {
      return (
        <button
          type="button"
          data-testid={`genre-card-${descriptor.id}`}
          data-genre-style="mosaicGlass"
          onClick={onClick}
          style={{ borderRadius: roundness, ...enterDelay }}
          className={`${animClass}group relative w-full p-3 text-left overflow-hidden sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 flex items-center justify-between gap-3.5 shadow-sm`}
        >
          <div
            aria-hidden="true"
            style={{ background: headerGradient }}
            className="pointer-events-none absolute inset-y-0 left-0 w-1.5 opacity-90"
          />
          <div className="flex items-center gap-3 min-w-0 flex-1 pl-1">
            <div className="relative w-16 h-12 shrink-0 flex items-center justify-center">
              <div className="absolute left-0 w-8 h-11 rounded-md overflow-hidden border border-white/25 -rotate-6 opacity-80 shadow">
                <SmartImage src={descriptor.covers[0]} alt="" fallbackTitle={descriptor.label} className="w-full h-full" />
              </div>
              <div className="absolute right-0 w-8 h-11 rounded-md overflow-hidden border border-white/25 rotate-6 opacity-80 shadow">
                <SmartImage src={descriptor.covers[2]} alt="" fallbackTitle={descriptor.label} className="w-full h-full" />
              </div>
              <div className="relative z-10 w-8 h-12 rounded-md overflow-hidden border border-white/40 shadow-md">
                <SmartImage src={descriptor.covers[1]} alt="" fallbackTitle={descriptor.label} className="w-full h-full" />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span
                  style={{ background: diagGradient }}
                  className="w-5 h-5 rounded-md inline-flex items-center justify-center text-white shrink-0"
                >
                  <GenreIcon iconId={descriptor.iconId} className="w-3 h-3 text-white" />
                </span>
                <span className="text-sm font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
                  {descriptor.label}
                </span>
              </div>
              <p className="text-xs text-[var(--sx-on-surface-muted)] line-clamp-1 mt-0.5">
                {descriptor.tagline}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full sx-glass-control border border-[var(--sx-outline)] text-[11px] font-extrabold text-[var(--sx-on-surface)] tabular-nums">
              {descriptor.seriesCount}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid={`genre-card-${descriptor.id}`}
        data-genre-style="mosaicGlass"
        onClick={onClick}
        style={{ borderRadius: roundness, ...enterDelay }}
        className={`${animClass}group relative w-full overflow-hidden text-left sx-glass-panel border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 hover:-translate-y-0.5 shadow-sm flex flex-col`}
      >
        {/* Soft Genre Color Aura at Top */}
        <div
          aria-hidden="true"
          style={{ background: diagGradient }}
          className="pointer-events-none absolute -top-10 inset-x-0 h-32 opacity-22 blur-2xl transition-opacity duration-300 group-hover:opacity-35"
        />

        {/* Top Row: Icon Badge + Series Count */}
        <div className="relative z-10 w-full px-3.5 pt-3.5 flex items-center justify-between gap-2">
          <span
            style={{ background: diagGradient }}
            className="w-8 h-8 rounded-xl inline-flex items-center justify-center text-white shadow-md shrink-0"
          >
            <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white" />
          </span>
          <span className="px-2.5 py-1 rounded-full sx-glass-control border border-[var(--sx-outline)] text-[11px] font-extrabold text-[var(--sx-on-surface)] tabular-nums">
            {descriptor.seriesCount} Series
          </span>
        </div>

        {/* Center Fanned 3-Poster Triptych */}
        <div className="relative z-10 w-full px-4 pt-3 pb-1 flex items-center justify-center h-[116px]">
          <div className="relative w-44 h-full flex items-center justify-center">
            <div className="absolute left-2 bottom-1 w-[62px] aspect-[2/3] rounded-lg overflow-hidden border border-white/25 shadow-lg -rotate-10 transition-transform duration-300 group-hover:-rotate-14 group-hover:-translate-x-1">
              <SmartImage
                src={descriptor.covers[0]}
                alt={`${descriptor.label} series 1`}
                fallbackTitle={descriptor.label}
                className="w-full h-full"
              />
            </div>
            <div className="absolute right-2 bottom-1 w-[62px] aspect-[2/3] rounded-lg overflow-hidden border border-white/25 shadow-lg rotate-10 transition-transform duration-300 group-hover:rotate-14 group-hover:translate-x-1">
              <SmartImage
                src={descriptor.covers[2]}
                alt={`${descriptor.label} series 3`}
                fallbackTitle={descriptor.label}
                className="w-full h-full"
              />
            </div>
            <div className="relative z-10 w-[70px] aspect-[2/3] rounded-xl overflow-hidden border-2 border-white/60 dark:border-white/30 shadow-2xl transition-transform duration-300 group-hover:scale-105 group-hover:-translate-y-1">
              <SmartImage
                src={descriptor.covers[1]}
                alt={`${descriptor.label} series 2`}
                fallbackTitle={descriptor.label}
                className="w-full h-full"
              />
            </div>
          </div>
        </div>

        {/* Footer Title + Tagline */}
        <div className="relative z-10 w-full px-3.5 pb-3.5 pt-2 flex-1 flex flex-col justify-end border-t border-[var(--sx-outline)]/60 bg-[var(--sx-surface-container)]/55">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px] font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              {descriptor.label}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </div>
          <p className="text-xs text-[var(--sx-on-surface-muted)] line-clamp-1 mt-0.5">
            {descriptor.tagline}
          </p>
        </div>
      </button>
    );
  }

  // 3. Editorial Pill ('editorialPill') — Minimalist card with gradient icon medallion & avatar-style stack
  if (style === 'editorialPill') {
    if (viewMode === 'list') {
      return (
        <button
          type="button"
          data-testid={`genre-card-${descriptor.id}`}
          data-genre-style="editorialPill"
          onClick={onClick}
          style={{ borderRadius: roundness, ...enterDelay }}
          className={`${animClass}group relative w-full p-3 text-left overflow-hidden bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 flex items-center justify-between gap-3 shadow-sm`}
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              style={{ background: diagGradient }}
              className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 shadow-sm"
            >
              <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
                {descriptor.label}
              </div>
              <p className="text-xs text-[var(--sx-on-surface-muted)] line-clamp-1">
                {descriptor.tagline}
              </p>
            </div>
          </div>

          <div className="hidden sm:flex items-center -space-x-2 shrink-0">
            {descriptor.covers.map((src, idx) => (
              <div
                key={`${descriptor.id}-ed-list-${idx}`}
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-[var(--sx-surface-container)] shadow-sm"
              >
                <SmartImage src={src} alt="" fallbackTitle={descriptor.label} className="w-full h-full" />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-[11px] font-extrabold tabular-nums text-[var(--sx-on-surface)]">
              {descriptor.seriesCount}
            </span>
            <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid={`genre-card-${descriptor.id}`}
        data-genre-style="editorialPill"
        onClick={onClick}
        style={{ borderRadius: roundness, ...enterDelay }}
        className={`${animClass}group relative w-full p-4 text-left overflow-hidden bg-[var(--sx-surface-container)] border border-[var(--sx-outline)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 hover:-translate-y-0.5 shadow-sm flex flex-col justify-between gap-3.5`}
      >
        {/* Top Accent Pill Line */}
        <span
          aria-hidden="true"
          style={{ background: headerGradient }}
          className="absolute inset-x-0 top-0 h-1 opacity-85"
        />

        <div className="flex items-start justify-between gap-3 pt-0.5">
          <div className="flex items-center gap-3 min-w-0">
            <div
              style={{ background: diagGradient }}
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-md transition-transform duration-200 group-hover:scale-105"
            >
              <GenreIcon iconId={descriptor.iconId} className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[15px] font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
                {descriptor.label}
              </div>
              <div className="text-[11px] font-bold text-[var(--sx-primary)] tabular-nums mt-0.5">
                {descriptor.seriesCount} titles
              </div>
            </div>
          </div>

          <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
        </div>

        <p className="text-xs leading-relaxed text-[var(--sx-on-surface-muted)] line-clamp-2 min-h-[2.25rem]">
          {descriptor.tagline}
        </p>

        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--sx-outline)]/60">
          <div className="flex items-center -space-x-2">
            {descriptor.covers.map((src, coverIdx) => (
              <div
                key={`${descriptor.id}-ed-cover-${coverIdx}`}
                className="w-8 h-8 rounded-full overflow-hidden border-2 border-[var(--sx-surface-container)] bg-[var(--sx-surface-high)] shadow-sm"
              >
                <SmartImage
                  src={src}
                  alt={`${descriptor.label} series ${coverIdx + 1}`}
                  fallbackTitle={descriptor.label}
                  className="w-full h-full"
                />
              </div>
            ))}
          </div>
          <span
            style={{ background: headerGradient }}
            className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider text-white shadow-sm"
          >
            Explore
          </span>
        </div>
      </button>
    );
  }

  // 4. Aurora Glass ('auroraStack') — Blurred full-bleed cover backdrop with frosted HUD
  if (style === 'auroraStack') {
    if (viewMode === 'list') {
      return (
        <button
          type="button"
          data-testid={`genre-card-${descriptor.id}`}
          data-genre-style="auroraStack"
          onClick={onClick}
          style={{ borderRadius: roundness, ...enterDelay }}
          className={`${animClass}group relative w-full h-20 px-4 text-left overflow-hidden border border-white/15 shadow-md hover:-translate-y-0.5 transition-all flex items-center justify-between gap-3`}
        >
          <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
            <SmartImage src={descriptor.covers[0]} alt="" fallbackTitle={descriptor.label} className="w-full h-full scale-115 blur-sm brightness-50" />
            <div style={{ background: headerGradient }} className="absolute inset-0 opacity-55 mix-blend-multiply" />
            <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-black/65" />
          </div>

          <div className="relative z-10 flex items-center gap-3 min-w-0 flex-1 text-white">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/25 flex items-center justify-center shrink-0">
              <GenreIcon iconId={descriptor.iconId} className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-extrabold tracking-tight truncate">{descriptor.label}</div>
              <p className="text-[11px] text-white/75 line-clamp-1">{descriptor.tagline}</p>
            </div>
          </div>

          <div className="relative z-10 flex items-center gap-2 shrink-0">
            <span className="px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-md border border-white/25 text-[11px] font-extrabold text-white tabular-nums">
              {descriptor.seriesCount} Series
            </span>
            <ChevronRight className="w-4 h-4 text-white/80 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>
      );
    }

    return (
      <button
        type="button"
        data-testid={`genre-card-${descriptor.id}`}
        data-genre-style="auroraStack"
        onClick={onClick}
        style={{ borderRadius: roundness, ...enterDelay }}
        className={`${animClass}group relative w-full min-h-[178px] p-3.5 text-left overflow-hidden border border-white/20 dark:border-white/12 shadow-lg hover:-translate-y-0.5 transition-all duration-200 flex flex-col justify-between gap-3`}
      >
        <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
          <SmartImage
            src={descriptor.covers[0]}
            alt=""
            fallbackTitle={descriptor.label}
            className="w-full h-full scale-110 transition-transform duration-500 group-hover:scale-120 brightness-75"
          />
          <div style={{ background: diagGradient }} className="absolute inset-0 opacity-62 mix-blend-multiply" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/35 to-black/25" />
        </div>

        {/* Top Row: Frosted Icon + Count Pill */}
        <div className="relative z-10 flex items-center justify-between gap-2">
          <span className="w-9 h-9 rounded-xl bg-black/40 backdrop-blur-xl border border-white/25 flex items-center justify-center text-white shadow">
            <GenreIcon iconId={descriptor.iconId} className="w-4 h-4 text-white" />
          </span>
          <span className="px-2.5 py-1 rounded-full bg-black/45 backdrop-blur-xl border border-white/20 text-[11px] font-extrabold text-white tabular-nums">
            {descriptor.seriesCount} Series
          </span>
        </div>

        {/* Bottom Frosted Glass Capsule */}
        <div className="relative z-10 rounded-xl bg-black/45 backdrop-blur-xl border border-white/18 p-2.5 flex items-end justify-between gap-2.5 shadow-lg">
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-extrabold tracking-tight text-white truncate">
              {descriptor.label}
            </div>
            <p className="text-[11px] text-white/75 line-clamp-1 mt-0.5">
              {descriptor.tagline}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {descriptor.covers.map((src, coverIdx) => (
              <div
                key={`${descriptor.id}-aurora-thumb-${coverIdx}`}
                className="w-7 h-10 rounded-md overflow-hidden border border-white/25 shadow-sm"
              >
                <SmartImage
                  src={src}
                  alt={`${descriptor.label} series ${coverIdx + 1}`}
                  fallbackTitle={descriptor.label}
                  className="w-full h-full"
                />
              </div>
            ))}
          </div>
        </div>
      </button>
    );
  }

  // 5. 'showcase' (Figma Category Spotlight) — List mode
  if (viewMode === 'list') {
    return (
      <button
        type="button"
        data-testid={`genre-card-${descriptor.id}`}
        data-genre-style="showcase"
        onClick={onClick}
        style={{
          borderRadius: roundness,
          ...enterDelay,
        }}
        className={`${animClass}group w-full p-3 text-left border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 flex items-center justify-between gap-3.5 shadow-sm`}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div
            style={{ background: headerGradient }}
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
          >
            <GenreIcon iconId={descriptor.iconId} className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              {descriptor.label}
            </div>
            <p className="text-xs text-[var(--sx-on-surface-muted)] line-clamp-1 mt-0.5">
              {descriptor.tagline}
            </p>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-1.5 shrink-0">
          {descriptor.covers.map((src, idx) => (
            <div
              key={`${descriptor.id}-list-cover-${idx}`}
              className="w-8 h-12 rounded-md overflow-hidden bg-[var(--sx-surface-high)] border border-[var(--sx-outline)]/60"
            >
              <SmartImage src={src} alt="" fallbackTitle={descriptor.label} className="w-full h-full" />
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0 pl-1">
          <div className="px-2.5 py-1.5 rounded-lg bg-[var(--sx-surface-high)] border border-[var(--sx-outline)] text-center">
            <div className="text-xs font-extrabold text-[var(--sx-on-surface)] tabular-nums leading-none">
              {descriptor.seriesCount}
            </div>
            <div className="text-[9px] font-medium text-[var(--sx-on-surface-muted)] mt-0.5">
              Series
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-[var(--sx-on-surface-muted)] group-hover:translate-x-0.5 transition-transform" />
        </div>
      </button>
    );
  }

  // 'showcase' (Figma Category Spotlight) — Grid mode
  return (
    <button
      type="button"
      data-testid={`genre-card-${descriptor.id}`}
      data-genre-style="showcase"
      onClick={onClick}
      style={{
        borderRadius: roundness,
        ...enterDelay,
      }}
      className={`${animClass}group relative w-full flex flex-col overflow-hidden text-left border border-[var(--sx-outline)] bg-[var(--sx-surface-container)] hover:border-[var(--sx-primary)]/55 transition-all duration-200 hover:-translate-y-0.5 shadow-sm`}
    >
      {/* Colored Gradient Top Band with Crisp White Icon + Title + Watermark */}
      <div
        style={{ background: headerGradient }}
        className="relative w-full px-4 py-3 flex items-center justify-between overflow-hidden"
      >
        <div className="relative z-10 flex items-center gap-2.5 min-w-0 pr-8">
          <GenreIcon
            iconId={descriptor.iconId}
            className="w-5 h-5 text-white shrink-0 drop-shadow-sm"
          />
          <span className="text-[15px] font-extrabold tracking-tight text-white truncate drop-shadow-sm">
            {descriptor.label}
          </span>
        </div>
        <GenreIcon
          iconId={descriptor.iconId}
          className="pointer-events-none select-none absolute -right-1.5 -top-1.5 w-14 h-14 text-white/18 -rotate-6 transition-transform duration-300 group-hover:scale-105"
        />
      </div>

      {/* Body with Tagline, 3 Cover Previews + Series Count Box & Bottom Pill */}
      <div className="w-full px-3.5 pt-3 pb-2.5 flex-1 flex flex-col justify-between gap-3">
        <p className="text-[12.5px] leading-snug text-[var(--sx-on-surface-muted)] line-clamp-2 min-h-[2.15rem]">
          {descriptor.tagline}
        </p>

        <div className="grid grid-cols-4 gap-2 w-full">
          {descriptor.covers.map((src, coverIdx) => (
            <div
              key={`${descriptor.id}-cover-${coverIdx}`}
              className="aspect-[2/3] rounded-lg overflow-hidden bg-[var(--sx-surface-high)] border border-white/10"
            >
              <SmartImage
                src={src}
                alt={`${descriptor.label} series ${coverIdx + 1}`}
                fallbackTitle={descriptor.label}
                className="w-full h-full transition-transform duration-300 group-hover:scale-[1.03]"
              />
            </div>
          ))}
          <div className="aspect-[2/3] rounded-lg bg-[var(--sx-surface-high)]/90 border border-[var(--sx-outline)] flex flex-col items-center justify-center px-1 text-center">
            <span className="text-[14px] sm:text-[15px] font-extrabold text-[var(--sx-on-surface)] tabular-nums leading-none">
              {descriptor.seriesCount}
            </span>
            <span className="text-[10px] font-medium text-[var(--sx-on-surface-muted)] mt-1">
              Series
            </span>
          </div>
        </div>

        <div className="pt-0.5 flex justify-center">
          <span
            aria-hidden="true"
            className="w-16 h-[3px] rounded-full bg-[var(--sx-outline)] group-hover:bg-[var(--sx-primary)]/50 transition-colors"
          />
        </div>
      </div>
    </button>
  );
};

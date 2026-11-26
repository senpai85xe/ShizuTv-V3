import React from 'react';
import { BookOpen, Play } from 'lucide-react';
import { SourceInfo } from '../../types/media';
import { ExtensionMediaTab } from '../../utils/extensionsManager';
import { useSlidingPill } from '../../hooks/useSlidingPill';

export const EXT_FROSTED_SURFACE =
  'bg-[var(--sx-surface-container)]/44 dark:bg-[var(--sx-surface-container)]/38 backdrop-blur-xl backdrop-saturate-150 border border-white/50 dark:border-white/12 ring-1 ring-inset ring-white/25 dark:ring-white/6 shadow-[0_8px_28px_-10px_rgba(15,23,42,0.12)]';

export const EXT_FROSTED_PILL =
  'bg-[var(--sx-surface-container)]/52 dark:bg-[var(--sx-surface-container)]/44 backdrop-blur-2xl backdrop-saturate-150 border border-white/55 dark:border-white/14 ring-1 ring-inset ring-white/30 dark:ring-white/8 shadow-[0_10px_28px_-10px_rgba(15,23,42,0.18)]';

export const EXT_FROSTED_ACTIVE_BUBBLE =
  'bg-[var(--sx-primary)]/16 dark:bg-[var(--sx-primary)]/24 backdrop-blur-md border border-[var(--sx-primary)]/35 ring-1 ring-inset ring-white/35 dark:ring-white/12 shadow-[0_4px_14px_-4px_rgba(0,0,0,0.16)]';

export const EXT_FROSTED_SHEET =
  'bg-[var(--sx-surface-container)]/80 dark:bg-[var(--sx-surface-container)]/78 backdrop-blur-2xl backdrop-saturate-150 border border-white/50 dark:border-white/14 ring-1 ring-inset ring-white/25 dark:ring-white/8 shadow-2xl';

export const EXT_FROSTED_ICON_BTN =
  'bg-[var(--sx-on-surface)]/7 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/12 hover:bg-[var(--sx-on-surface)]/14 dark:hover:bg-white/16 hover:border-[var(--sx-primary)]/45 transition-all duration-200';

export const ExtensionsAmbientBackdrop: React.FC = () => (
  <div
    aria-hidden="true"
    className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
  >
    <div
      className="absolute -top-28 -left-24 w-80 h-80 sm:w-[28rem] sm:h-[28rem] rounded-full blur-3xl opacity-22 dark:opacity-18"
      style={{
        background:
          'radial-gradient(circle, var(--sx-primary) 0%, transparent 70%)',
      }}
    />
    <div
      className="absolute top-1/3 -right-24 w-72 h-72 sm:w-96 sm:h-96 rounded-full blur-3xl opacity-18 dark:opacity-15"
      style={{
        background:
          'radial-gradient(circle, var(--sx-tertiary) 0%, transparent 72%)',
      }}
    />
    <div
      className="absolute -bottom-28 left-1/4 w-80 h-80 rounded-full blur-3xl opacity-16 dark:opacity-12"
      style={{
        background:
          'radial-gradient(circle, var(--sx-secondary) 0%, transparent 70%)',
      }}
    />
  </div>
);

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  testId?: string;
}

interface SlidingSegmentedBarProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (next: T) => void;
  layout?: 'grid' | 'scroll';
  recalcKey?: unknown;
  className?: string;
  itemClassName?: string;
  ariaLabel?: string;
}

export function SlidingSegmentedBar<T extends string>({
  options,
  value,
  onChange,
  layout = 'grid',
  recalcKey,
  className = '',
  itemClassName = '',
  ariaLabel,
}: SlidingSegmentedBarProps<T>) {
  const { containerRef, registerItemRef, pillRect } = useSlidingPill<HTMLDivElement>(
    value,
    `${options.length}-${String(recalcKey ?? '')}`,
  );

  const gridStyle =
    layout === 'grid'
      ? { gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }
      : undefined;

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      style={gridStyle}
      className={`relative p-1 rounded-2xl ${EXT_FROSTED_SURFACE} ${
        layout === 'grid'
          ? 'grid gap-1'
          : 'flex items-center gap-1 overflow-x-auto no-scrollbar'
      } ${className}`}
    >
      {pillRect.ready && (
        <span
          aria-hidden="true"
          style={{
            transform: `translate3d(${pillRect.left}px, ${pillRect.top}px, 0)`,
            width: `${pillRect.width}px`,
            height: `${pillRect.height}px`,
          }}
          className={`sx-pill-glide pointer-events-none absolute left-0 top-0 rounded-xl ${EXT_FROSTED_ACTIVE_BUBBLE}`}
        />
      )}

      {options.map((opt) => {
        const active = value === opt.id;
        const Icon = opt.icon;
        return (
          <button
            key={opt.id}
            ref={registerItemRef(opt.id)}
            type="button"
            role="tab"
            aria-selected={active}
            data-testid={opt.testId}
            onClick={() => onChange(opt.id)}
            className={`relative z-10 h-8 px-3 rounded-xl text-xs font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 transition-colors duration-200 ${
              active
                ? pillRect.ready
                  ? 'text-[var(--sx-primary)]'
                  : `${EXT_FROSTED_ACTIVE_BUBBLE} text-[var(--sx-primary)]`
                : 'text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
            } ${itemClassName}`}
          >
            {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export const ExtensionAvatar: React.FC<{
  source: SourceInfo;
  mediaTab: ExtensionMediaTab;
  size?: 'sm' | 'md';
}> = ({ source, mediaTab, size = 'md' }) => {
  const [failedUrl, setFailedUrl] = React.useState<string | null>(null);
  const isAnime =
    mediaTab === 'ANIME' ||
    source.mediaTypes.some((m) => m === 'ANIME' || m === 'TV' || m === 'MOVIE');

  const boxSize = size === 'sm' ? 'w-9 h-9 rounded-xl' : 'w-11 h-11 rounded-xl';
  const badgeSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const showIconImg = Boolean(source.iconUrl && failedUrl !== source.iconUrl);

  return (
    <div
      className={`relative ${boxSize} shrink-0 bg-[var(--sx-surface-high)]/65 backdrop-blur-md border border-white/45 dark:border-white/12 flex items-center justify-center shadow-sm`}
    >
      {showIconImg ? (
        <img
          src={source.iconUrl}
          alt={source.name}
          referrerPolicy="no-referrer"
          onError={() => setFailedUrl(source.iconUrl ?? null)}
          className="w-full h-full object-cover rounded-xl"
        />
      ) : (
        <span className="text-sm font-black text-[var(--sx-primary)] select-none">
          {source.name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span
        aria-hidden="true"
        className={`${badgeSize} rounded-full bg-[var(--sx-surface-container)]/90 backdrop-blur-md border border-white/45 dark:border-white/15 text-[var(--sx-primary)] absolute -bottom-1 -right-1 flex items-center justify-center shadow-sm`}
      >
        {isAnime ? (
          <Play className="w-2 h-2 fill-current ml-0.5" />
        ) : (
          <BookOpen className="w-2 h-2" />
        )}
      </span>
    </div>
  );
};

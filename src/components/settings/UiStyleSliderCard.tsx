import React, { useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Eye, LayoutGrid } from 'lucide-react';
import { triggerHaptic } from '../../utils/haptics';
import { getActiveOptionPosition } from '../../utils/uiLayoutCustomization';

export interface UiStyleSliderOption<T extends string = string> {
  id: T;
  label: string;
  testId?: string;
}

interface UiStyleSliderCardProps<T extends string> {
  testId: string;
  icon: React.FC<{ className?: string }>;
  title: string;
  subtitle: string;
  activeBadge: string;
  roundness: string;
  animationDelayMs?: number;
  previewHeaderExtra?: React.ReactNode;
  previewContent: React.ReactNode;
  options: ReadonlyArray<UiStyleSliderOption<T>>;
  selectedId: T;
  onSelect: (id: T) => void;
  styleSectionLabel?: string;
}

export function UiStyleSliderCard<T extends string>({
  testId,
  icon: Icon,
  title,
  subtitle,
  activeBadge,
  roundness,
  animationDelayMs = 0,
  previewHeaderExtra,
  previewContent,
  options,
  selectedId,
  onSelect,
  styleSectionLabel = 'STYLE',
}: UiStyleSliderCardProps<T>) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const hasMountedRef = useRef(false);

  useEffect(() => {
    const track = trackRef.current;
    const activeBtn = buttonRefs.current[selectedId];
    if (!track || !activeBtn) return;

    const targetLeft =
      activeBtn.offsetLeft - (track.clientWidth - activeBtn.offsetWidth) / 2;
    track.scrollTo({
      left: Math.max(0, targetLeft),
      behavior: hasMountedRef.current ? 'smooth' : 'auto',
    });
    hasMountedRef.current = true;
  }, [selectedId]);

  const pos = getActiveOptionPosition(options, selectedId);

  const nudgeSlider = (dir: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    triggerHaptic('menu-select');
    el.scrollBy({ left: dir * 210, behavior: 'smooth' });
  };

  return (
    <section
      data-testid={testId}
      style={{
        borderRadius: roundness,
        ...(animationDelayMs > 0 ? { animationDelay: `${animationDelayMs}ms` } : {}),
      }}
      className="sx-card-animate sx-glass-panel border border-[var(--sx-outline)] p-4 sm:p-5 space-y-4 overflow-hidden"
    >
      {/* Top Row: Icon Box + Title + Dynamic Subtitle + Active Style Pill */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center shrink-0 text-[var(--sx-on-surface)]">
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
              {title}
            </h2>
            <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 line-clamp-1">
              {subtitle}
            </p>
          </div>
        </div>

        <span
          data-testid={`${testId}-active-badge`}
          className="px-3 py-1 rounded-full sx-glass-control border border-[var(--sx-outline)] text-[11px] font-extrabold text-[var(--sx-on-surface)] shrink-0 max-w-[140px] truncate"
        >
          {activeBadge}
        </span>
      </div>

      {/* Live Preview Header & Well */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            <Eye className="w-3.5 h-3.5" />
            <span>PREVIEW</span>
          </div>
          {previewHeaderExtra && <div className="shrink-0">{previewHeaderExtra}</div>}
        </div>

        <div className="rounded-2xl border border-[var(--sx-outline)]/65 bg-[var(--sx-surface)]/38 p-3 sm:p-4 overflow-hidden">
          {previewContent}
        </div>
      </div>

      {/* Horizontal Style Slider / Pill Selector */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--sx-on-surface-muted)]">
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>{styleSectionLabel}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono-tabular font-semibold text-[var(--sx-on-surface-muted)]">
              {pos.current} / {pos.total}
            </span>
            <div className="hidden sm:inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => nudgeSlider(-1)}
                aria-label={`Scroll ${title} styles left`}
                className="w-6 h-6 rounded-lg sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => nudgeSlider(1)}
                aria-label={`Scroll ${title} styles right`}
                className="w-6 h-6 rounded-lg sx-glass-control border border-[var(--sx-outline)] flex items-center justify-center text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        <div
          ref={trackRef}
          role="listbox"
          aria-label={`${title} style selector`}
          className="flex items-center gap-2 overflow-x-auto no-scrollbar sx-carousel-scroll snap-x py-0.5 pr-2"
        >
          {options.map((opt) => {
            const active = selectedId === opt.id;
            return (
              <button
                key={opt.id}
                ref={(el) => {
                  buttonRefs.current[opt.id] = el;
                }}
                type="button"
                role="option"
                aria-selected={active}
                data-testid={opt.testId ?? `${testId}-option-${opt.id}`}
                onClick={() => {
                  triggerHaptic('menu-select');
                  onSelect(opt.id);
                }}
                className={`shrink-0 snap-start whitespace-nowrap px-3.5 py-2 rounded-xl text-xs transition-[background-color,border-color,color,transform] duration-200 ${
                  active
                    ? 'sx-glass-active font-extrabold border-[var(--sx-primary)]/45'
                    : 'sx-glass-control border border-[var(--sx-outline)] font-bold text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)]'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

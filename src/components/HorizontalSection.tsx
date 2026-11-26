import React, { useLayoutEffect } from 'react';
import { ChevronLeft, ChevronRight, AlertCircle, RotateCw } from 'lucide-react';
import { AnyMediaCardStyle } from '../data/themePresets';
import { useApp } from '../store/AppContext';
import { useMomentumCarousel } from '../hooks/useMomentumCarousel';
import { MediaCardSkeleton } from './MediaCardSkeleton';

interface HorizontalSectionProps {
  title: string;
  onMoreTap?: () => void;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyText?: string;
  cardStyle?: AnyMediaCardStyle;
  children: React.ReactNode;
}

export const HorizontalSection: React.FC<HorizontalSectionProps> = ({
  title,
  onMoreTap,
  loading,
  error,
  onRetry,
  isEmpty,
  emptyText = 'Nothing to show here yet.',
  cardStyle,
  children,
}) => {
  const { state, batterySaver } = useApp();
  const isContentActive = !loading && !error && !isEmpty;
  const itemCount = React.Children.count(children);

  const { viewportRef, trackRef, scrollBy, viewportProps } = useMomentumCarousel({
    active: isContentActive,
    itemCount,
    reducedMotion: batterySaver,
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track || !isContentActive) return;

    const items = Array.from(track.children).filter(
      (el): el is HTMLElement => el instanceof HTMLElement,
    );
    if (items.length === 0) return;

    const reducedMotion =
      batterySaver ||
      (typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      items.forEach((el) => {
        el.classList.add('sx-shelf-item');
        el.dataset.inview = 'true';
      });
      return;
    }

    const cRect = viewport.getBoundingClientRect();
    items.forEach((el) => {
      el.classList.add('sx-shelf-item');
      const r = el.getBoundingClientRect();
      const visible =
        r.width === 0 || (r.right >= cRect.left - 48 && r.left <= cRect.right + 48);
      el.dataset.inview = visible ? 'true' : 'false';
    });

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const target = entry.target;
          if (target instanceof HTMLElement) {
            target.dataset.inview = entry.isIntersecting ? 'true' : 'false';
          }
        }
      },
      {
        root: viewport,
        rootMargin: '0px 48px 0px 48px',
        threshold: 0.05,
      },
    );

    items.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [children, isContentActive, batterySaver, viewportRef, trackRef]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between px-4 sm:px-6">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--sx-on-surface)]">
          {title}
        </h2>
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-520)}
              aria-label={`Scroll ${title} left`}
              className="p-1.5 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(520)}
              aria-label={`Scroll ${title} right`}
              className="p-1.5 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {onMoreTap && (
            <button
              type="button"
              onClick={onMoreTap}
              className="ml-1 px-3 py-1.5 text-xs font-bold text-[var(--sx-primary)] hover:bg-[var(--sx-primary-container)]/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              View All
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="mx-4 sm:mx-6 p-5 rounded-[var(--sx-radius)] sx-glass-panel border border-red-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-sm font-bold text-[var(--sx-on-surface)]">
                Could not load {title}
              </p>
              <p className="text-xs text-[var(--sx-on-surface-muted)] mt-0.5 line-clamp-1">
                {error}
              </p>
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold sx-glass-cta rounded-lg shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry
            </button>
          )}
        </div>
      ) : loading ? (
        <div
          aria-busy="true"
          aria-label={`Loading ${title}`}
          className="flex gap-3.5 overflow-x-auto no-scrollbar px-4 sm:px-6 py-2 -my-1"
        >
          {Array.from({ length: 8 }).map((_, i) => (
            <MediaCardSkeleton
              key={i}
              index={i}
              style={cardStyle ?? state.uiPrefs.cardStyle}
            />
          ))}
        </div>
      ) : isEmpty ? (
        <div className="mx-4 sm:mx-6 py-6 px-4 rounded-[var(--sx-radius)] sx-glass-panel border border-[var(--sx-outline)] text-center text-xs text-[var(--sx-on-surface-muted)]">
          {emptyText}
        </div>
      ) : (
        <div
          ref={viewportRef}
          data-testid="carousel-viewport"
          {...viewportProps}
          className="sx-momentum-viewport pt-3 pb-5 -mt-2 -mb-4"
        >
          <div
            ref={trackRef}
            data-testid="carousel-track"
            className="sx-momentum-track flex w-max min-w-full gap-3.5 px-4 sm:px-6"
          >
            {children}
          </div>
        </div>
      )}
    </section>
  );
};

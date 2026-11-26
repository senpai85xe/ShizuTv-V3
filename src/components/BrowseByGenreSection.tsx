import React, { useLayoutEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { useMomentumCarousel } from '../hooks/useMomentumCarousel';
import {
  GenreCategoryDescriptor,
  getHomeBrowseGenres,
  resolveGenreCardStyle,
} from '../utils/genreMetadata';
import { HomeMediaMode } from '../utils/heroBanner';
import { GenreCard } from './GenreCard';

interface BrowseByGenreSectionProps {
  title?: string;
  mediaMode: HomeMediaMode;
  onSelectGenre: (descriptor: GenreCategoryDescriptor) => void;
  onSeeAll: () => void;
}

export const BrowseByGenreSection: React.FC<BrowseByGenreSectionProps> = ({
  title = 'Browse by Genre',
  mediaMode,
  onSelectGenre,
  onSeeAll,
}) => {
  const { state, batterySaver } = useApp();

  const genreCardStyle = resolveGenreCardStyle(state.uiPrefs.genreCardStyle);
  const roundness = `${state.themePrefs.uiRoundness}px`;
  const genres = useMemo(() => getHomeBrowseGenres(mediaMode), [mediaMode]);

  const { viewportRef, trackRef, scrollBy, viewportProps } = useMomentumCarousel({
    active: genres.length > 0,
    itemCount: genres.length,
    reducedMotion: batterySaver,
  });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return;

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
  }, [genres, genreCardStyle, batterySaver, viewportRef, trackRef]);

  const cardWidthClass =
    genreCardStyle === 'classic'
      ? 'w-[184px] sm:w-[216px] shrink-0'
      : 'w-[292px] sm:w-[318px] shrink-0';

  return (
    <section
      data-testid="home-browse-genres-section"
      data-genre-style={genreCardStyle}
      className="space-y-3"
    >
      <div className="flex items-center justify-between px-4 sm:px-6">
        <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-[var(--sx-on-surface)] truncate">
          {title}
        </h2>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollBy(-340)}
              aria-label={`Scroll ${title} left`}
              className="p-1.5 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => scrollBy(340)}
              aria-label={`Scroll ${title} right`}
              className="p-1.5 rounded-lg sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface-muted)] hover:text-[var(--sx-on-surface)] transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            data-testid="home-browse-genres-see-all"
            onClick={onSeeAll}
            className="ml-1 px-3 py-1.5 text-xs font-bold text-[var(--sx-primary)] hover:bg-[var(--sx-primary-container)]/30 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            See all
          </button>
        </div>
      </div>

      <div
        ref={viewportRef}
        data-testid="carousel-viewport"
        {...viewportProps}
        className="sx-momentum-viewport py-3 -my-2"
      >
        <div
          ref={trackRef}
          data-testid="carousel-track"
          className="sx-momentum-track flex w-max min-w-full gap-3.5 px-4 sm:px-6"
        >
          {genres.map((descriptor) => (
            <div key={descriptor.id} className={cardWidthClass}>
              <GenreCard
                descriptor={descriptor}
                style={genreCardStyle}
                viewMode="grid"
                roundness={roundness}
                previewMode
                onClick={() => onSelectGenre(descriptor)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

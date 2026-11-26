import React, { useEffect, useRef, useState } from 'react';
import { shouldFallbackToImmediateLoad } from '../utils/lazySection';

interface LazySectionProps {
  sectionId: string;
  eager?: boolean;
  resetKey: string;
  rootMargin?: string;
  threshold?: number;
  onVisible: () => void;
  children: React.ReactNode;
}

export const LazySection: React.FC<LazySectionProps> = ({
  sectionId,
  eager = false,
  resetKey,
  rootMargin = '80px 0px',
  threshold = 0.01,
  onVisible,
  children,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onVisibleRef = useRef(onVisible);
  onVisibleRef.current = onVisible;

  const [triggered, setTriggered] = useState<boolean>(() => eager);

  useEffect(() => {
    setTriggered(eager);
  }, [resetKey, sectionId, eager]);

  useEffect(() => {
    const hasObserver = typeof IntersectionObserver !== 'undefined';

    if (shouldFallbackToImmediateLoad(hasObserver, eager)) {
      setTriggered(true);
      onVisibleRef.current();
      return;
    }

    const node = containerRef.current;
    if (!node) return;

    let cancelled = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (cancelled) return;
        const isVisible = entries.some((entry) => entry.isIntersecting);
        if (isVisible) {
          setTriggered(true);
          onVisibleRef.current();
          observer.disconnect();
        }
      },
      { rootMargin, threshold },
    );

    observer.observe(node);

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [eager, resetKey, sectionId, rootMargin, threshold]);

  return (
    <div
      ref={containerRef}
      data-testid={`lazy-section-${sectionId}`}
      data-section-id={sectionId}
      data-lazy-loaded={triggered ? 'true' : 'false'}
    >
      {children}
    </div>
  );
};

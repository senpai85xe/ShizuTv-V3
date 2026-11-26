import React, { useLayoutEffect, useRef, useState } from 'react';
import { useApp } from '../store/AppContext';
import { getBoundedStaggerDelay, isRectInRevealViewport } from '../utils/appMotion';

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  index?: number;
  disabled?: boolean;
}

/**
 * Smooth iOS-inspired scroll-into-view reveal that resolves to `transform: none`
 * when visible so fixed descendants never get trapped in a containing block.
 */
export const ScrollReveal: React.FC<ScrollRevealProps> = ({
  children,
  className = '',
  index = 0,
  disabled = false,
}) => {
  const { batterySaver } = useApp();
  const effectiveDisabled = disabled || batterySaver;
  const ref = useRef<HTMLDivElement>(null);
  const [revealed, setRevealed] = useState(effectiveDisabled);

  useLayoutEffect(() => {
    if (effectiveDisabled) {
      setRevealed(true);
      return;
    }

    const reducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion || typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (isRectInRevealViewport(rect.top, rect.bottom, window.innerHeight, 36)) {
      setRevealed(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setRevealed(true);
          observer.disconnect();
        }
      },
      {
        rootMargin: '0px 0px -24px 0px',
        threshold: 0.03,
      },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [effectiveDisabled]);

  const delayMs = revealed && !effectiveDisabled ? getBoundedStaggerDelay(index, 28, 6) : 0;

  return (
    <div
      ref={ref}
      data-revealed={revealed ? 'true' : 'false'}
      style={delayMs > 0 ? { transitionDelay: `${delayMs}ms` } : undefined}
      className={`sx-reveal ${className}`}
    >
      {children}
    </div>
  );
};

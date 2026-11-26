import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowUp } from 'lucide-react';
import { useApp } from '../store/AppContext';
import { usePip } from '../store/PipContext';
import { triggerHaptic } from '../utils/haptics';
import {
  BACK_TO_TOP_SCROLL_THRESHOLD_PX,
  resolveBackToTopPositionClass,
  resolveScrollToTopBehavior,
  shouldShowBackToTop,
} from '../utils/backToTop';

function readCurrentScrollY(): number {
  if (typeof window === 'undefined') return 0;
  return (
    window.scrollY ??
    window.pageYOffset ??
    document.documentElement?.scrollTop ??
    document.body?.scrollTop ??
    0
  );
}

export const BackToTopButton: React.FC = () => {
  const { pathname } = useLocation();
  const { state, batterySaver } = useApp();
  const { pipSession, corner } = usePip();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let rafId = 0;

    const updateVisibility = () => {
      rafId = 0;
      const inNativeFullscreen =
        typeof document !== 'undefined' && Boolean(document.fullscreenElement);
      const nextVisible =
        !inNativeFullscreen &&
        shouldShowBackToTop(readCurrentScrollY(), BACK_TO_TOP_SCROLL_THRESHOLD_PX);
      setVisible((prev) => (prev === nextVisible ? prev : nextVisible));
    };

    const scheduleUpdate = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(updateVisibility);
    };

    updateVisibility();

    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate, { passive: true });
    document.addEventListener('fullscreenchange', updateVisibility);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      document.removeEventListener('fullscreenchange', updateVisibility);
    };
  }, [pathname]);

  const positionClass = resolveBackToTopPositionClass({
    pathname,
    isTvMode: state.uiPrefs.useNewUi,
    pipAtBottomRight: Boolean(pipSession) && corner === 'bottom-right',
  });

  const handleBackToTop = () => {
    triggerHaptic('menu-select');
    const prefersReduced =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
    const behavior = resolveScrollToTopBehavior(Boolean(batterySaver), prefersReduced);
    window.scrollTo({ top: 0, behavior });
  };

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      data-testid="back-to-top-btn"
      aria-label="Back to top"
      title="Back to top"
      onClick={handleBackToTop}
      className={`${positionClass} sx-back-to-top w-10 h-10 rounded-full sx-glass-panel border border-[var(--sx-outline)] text-[var(--sx-on-surface)] hover:border-[var(--sx-primary)]/55 hover:text-[var(--sx-primary)] shadow-[0_12px_30px_-10px_rgba(15,23,42,0.34)] dark:shadow-[0_14px_34px_-10px_rgba(0,0,0,0.68)] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sx-primary)]`}
    >
      <ArrowUp className="w-4 h-4" strokeWidth={2.25} />
    </button>
  );
};

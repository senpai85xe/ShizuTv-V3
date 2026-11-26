import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigationType } from 'react-router-dom';
import {
  canScrollReachTarget,
  computeSmoothScrollDurationMs,
  easeOutCubic,
  getPreviousVisitedRoute,
  loadRouteScrollPosition,
  normalizeScrollRouteKey,
  saveRouteScrollPosition,
  shouldRestoreSavedScroll,
} from '../utils/scrollPersistence';

export interface UseScrollPersistenceOptions {
  /** Unique route path used as persistence key (e.g., '/home' or '/details/anime/21') */
  routeKey: string;
  /** Disable persistence cleanly when needed */
  enabled?: boolean;
  /** Optional readiness signal if async page height loads after mount */
  contentReady?: boolean;
}

export interface UseScrollPersistenceResult {
  /** True while smoothly restoring a saved scroll position */
  isRestoring: boolean;
  /** Briefly true right after scroll restoration finishes for subtle arrival polish */
  justRestored: boolean;
  /** Current saved target Y if restoring */
  restoredTargetY: number | null;
}

/**
 * Persists window scrollY for a route across navigations and smoothly animates
 * back to the exact previous scroll offset when returning between Home & Details.
 */
export function useScrollPersistence({
  routeKey,
  enabled = true,
  contentReady = true,
}: UseScrollPersistenceOptions): UseScrollPersistenceResult {
  const navigationType = useNavigationType();
  const normKey = normalizeScrollRouteKey(routeKey);

  const latestScrollYRef = useRef<number>(0);
  const isUnmountingRef = useRef(false);
  const isRestoringRef = useRef(false);
  const activeKeyRef = useRef(normKey);

  const [isRestoring, setIsRestoring] = useState(false);
  const [justRestored, setJustRestored] = useState(false);
  const [restoredTargetY, setRestoredTargetY] = useState<number | null>(null);

  // Track whether this mount should restore a previously saved scroll offset
  const restoreCandidateRef = useRef<{ key: string; targetY: number | null }>({
    key: '',
    targetY: null,
  });
  if (restoreCandidateRef.current.key !== normKey) {
    const savedY = enabled ? loadRouteScrollPosition(normKey) : null;
    const prevPath = getPreviousVisitedRoute();
    const shouldRestore =
      enabled &&
      shouldRestoreSavedScroll({
        routeKey: normKey,
        previousPath: prevPath,
        navigationType,
        savedY,
      });
    restoreCandidateRef.current = {
      key: normKey,
      targetY: shouldRestore ? savedY : null,
    };
  }

  // Persist scroll continuously while mounted (rAF-throttled) and flush on unmount
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    isUnmountingRef.current = false;
    activeKeyRef.current = normKey;

    let rafId = 0;
    const commitScroll = () => {
      rafId = 0;
      if (isUnmountingRef.current || isRestoringRef.current) return;
      const y = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
      latestScrollYRef.current = y;
      saveRouteScrollPosition(normKey, y);
    };

    const onScroll = () => {
      if (isUnmountingRef.current || isRestoringRef.current) return;
      const y = Math.max(0, Math.round(window.scrollY || window.pageYOffset || 0));
      latestScrollYRef.current = y;
      if (!rafId) {
        rafId = window.requestAnimationFrame(commitScroll);
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      isUnmountingRef.current = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', onScroll);
      saveRouteScrollPosition(normKey, latestScrollYRef.current);
    };
  }, [normKey, enabled]);

  // Smoothly restore scroll position (waiting for dynamic content height if needed)
  useLayoutEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const targetY = restoreCandidateRef.current.targetY;
    if (targetY === null || targetY <= 0) {
      // Fresh forward navigation: ensure we begin cleanly at top
      if (window.scrollY > 0) {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      latestScrollYRef.current = 0;
      setIsRestoring(false);
      setRestoredTargetY(null);
      return;
    }

    let cancelled = false;
    let animFrame = 0;
    let waitFrame = 0;
    let settleTimer = 0;
    let badgeTimer = 0;
    let resizeObserver: ResizeObserver | null = null;
    let animationStarted = false;

    isRestoringRef.current = true;
    setIsRestoring(true);
    setRestoredTargetY(targetY);

    const cancelOnUserInput = () => {
      if (animFrame) {
        window.cancelAnimationFrame(animFrame);
        animFrame = 0;
      }
      isRestoringRef.current = false;
      setIsRestoring(false);
    };

    window.addEventListener('wheel', cancelOnUserInput, { passive: true, once: true });
    window.addEventListener('touchstart', cancelOnUserInput, { passive: true, once: true });

    const finishRestoration = (finalY: number) => {
      if (cancelled) return;
      latestScrollYRef.current = finalY;
      saveRouteScrollPosition(normKey, finalY);
      isRestoringRef.current = false;
      setIsRestoring(false);
      setJustRestored(true);
      badgeTimer = window.setTimeout(() => {
        if (!cancelled) setJustRestored(false);
      }, 650);
    };

    const runSmoothScrollAnimation = () => {
      if (cancelled || animationStarted) return;
      animationStarted = true;
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      if (settleTimer) {
        window.clearTimeout(settleTimer);
        settleTimer = 0;
      }

      const maxScrollable = Math.max(
        0,
        document.documentElement.scrollHeight - window.innerHeight,
      );
      const clampedTarget = Math.min(targetY, maxScrollable);
      const startY = window.scrollY || window.pageYOffset || 0;
      const delta = clampedTarget - startY;

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const durationMs = computeSmoothScrollDurationMs(Math.abs(delta), reducedMotion);

      if (durationMs <= 0 || Math.abs(delta) < 2) {
        window.scrollTo({ top: clampedTarget, behavior: 'auto' });
        finishRestoration(clampedTarget);
        return;
      }

      const startedAt = performance.now();
      const step = (now: number) => {
        if (cancelled || !isRestoringRef.current) return;
        const elapsed = now - startedAt;
        const progress = Math.min(1, elapsed / durationMs);
        const eased = easeOutCubic(progress);
        const nextY = Math.round(startY + delta * eased);
        window.scrollTo({ top: nextY, behavior: 'auto' });

        if (progress < 1) {
          animFrame = window.requestAnimationFrame(step);
        } else {
          window.scrollTo({ top: clampedTarget, behavior: 'auto' });
          finishRestoration(clampedTarget);
        }
      };

      animFrame = window.requestAnimationFrame(step);
    };

    const tryStartWhenReady = () => {
      if (cancelled || animationStarted) return;
      const reached = canScrollReachTarget(
        document.documentElement.scrollHeight,
        window.innerHeight,
        targetY,
      );
      if (reached && contentReady) {
        waitFrame = window.requestAnimationFrame(runSmoothScrollAnimation);
      }
    };

    tryStartWhenReady();

    if (!animationStarted) {
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => {
          tryStartWhenReady();
        });
        resizeObserver.observe(document.documentElement);
      }
      // Guarantee restoration finishes even if optional bottom feeds fail to grow full height
      settleTimer = window.setTimeout(runSmoothScrollAnimation, 450);
    }

    return () => {
      cancelled = true;
      isRestoringRef.current = false;
      if (animFrame) window.cancelAnimationFrame(animFrame);
      if (waitFrame) window.cancelAnimationFrame(waitFrame);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (badgeTimer) window.clearTimeout(badgeTimer);
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener('wheel', cancelOnUserInput);
      window.removeEventListener('touchstart', cancelOnUserInput);
    };
  }, [normKey, enabled, contentReady]);

  return {
    isRestoring,
    justRestored,
    restoredTargetY,
  };
}

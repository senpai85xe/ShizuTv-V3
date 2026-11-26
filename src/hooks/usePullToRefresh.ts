import { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyPullRubberBand,
  computePullProgress,
  PULL_REFRESH_HOLD_PX,
  PULL_REFRESH_THRESHOLD_PX,
  PullRefreshPhase,
  resolvePullPhase,
  shouldStartPullRefresh,
  triggerHapticFeedback,
} from '../utils/pullToRefresh';

export interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  disabled?: boolean;
  thresholdPx?: number;
}

export interface UsePullToRefreshResult {
  pullDistance: number;
  phase: PullRefreshPhase;
  progress: number;
  isPulling: boolean;
  isArmed: boolean;
  isRefreshing: boolean;
  hapticPulseCount: number;
  triggerRefresh: () => Promise<void>;
}

export function usePullToRefresh({
  onRefresh,
  disabled = false,
  thresholdPx = PULL_REFRESH_THRESHOLD_PX,
}: UsePullToRefreshOptions): UsePullToRefreshResult {
  const [pullDistance, setPullDistance] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [hapticPulseCount, setHapticPulseCount] = useState(0);

  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const isRefreshingRef = useRef(false);
  isRefreshingRef.current = isRefreshing;

  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const armedHapticSentRef = useRef(false);
  const completionTimerRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const suppressClickUntilRef = useRef(0);

  const updatePullDistance = useCallback((next: number) => {
    pullDistanceRef.current = next;
    setPullDistance(next);
  }, []);

  const dragSessionRef = useRef<{
    startX: number;
    startY: number;
    startScrollY: number;
    active: boolean;
    rejected: boolean;
    interactiveTarget: boolean;
    pointerId?: number;
  } | null>(null);

  const runRefreshSequence = useCallback(async () => {
    if (isRefreshingRef.current) return;
    if (completionTimerRef.current !== null) {
      window.clearTimeout(completionTimerRef.current);
      completionTimerRef.current = null;
    }

    isRefreshingRef.current = true;
    setIsRefreshing(true);
    setIsCompleting(false);
    updatePullDistance(PULL_REFRESH_HOLD_PX);

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    try {
      await onRefreshRef.current();
    } finally {
      const elapsed =
        (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startedAt;
      const minSpinMs = 420;
      if (elapsed < minSpinMs) {
        await new Promise((resolve) => window.setTimeout(resolve, minSpinMs - elapsed));
      }

      const reducedMotion =
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      triggerHapticFeedback('success', undefined, reducedMotion);
      setHapticPulseCount((c) => c + 1);

      isRefreshingRef.current = false;
      setIsRefreshing(false);
      setIsCompleting(true);

      completionTimerRef.current = window.setTimeout(() => {
        setIsCompleting(false);
        updatePullDistance(0);
        completionTimerRef.current = null;
      }, 480);
    }
  }, [updatePullDistance]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isInteractive = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest('input, textarea, select, [data-no-pull="true"], [role="dialog"]'),
      );
    };

    const beginGesture = (x: number, y: number, target: EventTarget | null, pointerId?: number) => {
      if (disabledRef.current || isRefreshingRef.current) return;
      const scrollY = window.scrollY || window.pageYOffset || 0;
      if (scrollY > 4) return;
      armedHapticSentRef.current = false;
      dragSessionRef.current = {
        startX: x,
        startY: y,
        startScrollY: scrollY,
        active: false,
        rejected: false,
        interactiveTarget: isInteractive(target),
        pointerId,
      };
    };

    const updateGesture = (x: number, y: number, preventDefault?: () => void) => {
      const session = dragSessionRef.current;
      if (!session || session.rejected || isRefreshingRef.current || disabledRef.current) return;
      if (typeof document !== 'undefined' && document.querySelector('[data-carousel-dragging="true"]')) {
        session.rejected = true;
        return;
      }

      const dx = x - session.startX;
      const dy = y - session.startY;

      if (!session.active) {
        if (dy < -6 || Math.abs(dx) > 16) {
          session.rejected = true;
          return;
        }
        const canStart = shouldStartPullRefresh({
          scrollY: window.scrollY || window.pageYOffset || 0,
          deltaY: dy,
          deltaX: dx,
          isRestoringScroll: disabledRef.current,
          isInteractiveTarget: session.interactiveTarget,
          isRefreshing: isRefreshingRef.current,
        });
        if (!canStart) return;
        session.active = true;
        setIsDragging(true);
      }

      if (dy <= 0) {
        updatePullDistance(0);
        return;
      }

      preventDefault?.();
      const damped = applyPullRubberBand(dy);
      updatePullDistance(damped);

      if (damped >= thresholdPx && !armedHapticSentRef.current) {
        armedHapticSentRef.current = true;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        triggerHapticFeedback('armed', undefined, reducedMotion);
        setHapticPulseCount((c) => c + 1);
      } else if (damped < thresholdPx && armedHapticSentRef.current) {
        armedHapticSentRef.current = false;
      }
    };

    const endGesture = () => {
      const session = dragSessionRef.current;
      dragSessionRef.current = null;
      if (!session || !session.active) {
        setIsDragging(false);
        return;
      }
      suppressClickUntilRef.current = Date.now() + 380;
      setIsDragging(false);
      if (pullDistanceRef.current >= thresholdPx) {
        void runRefreshSequence();
      } else {
        updatePullDistance(0);
      }
    };

    const onCaptureClick = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      beginGesture(e.touches[0].clientX, e.touches[0].clientY, e.target);
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.defaultPrevented || e.touches.length !== 1) return;
      updateGesture(e.touches[0].clientX, e.touches[0].clientY, () => {
        if (e.cancelable) e.preventDefault();
      });
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      beginGesture(e.clientX, e.clientY, e.target, e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (dragSessionRef.current?.pointerId !== e.pointerId) return;
      updateGesture(e.clientX, e.clientY);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse') return;
      if (dragSessionRef.current?.pointerId !== e.pointerId) return;
      endGesture();
    };

    window.addEventListener('click', onCaptureClick, { capture: true });
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', endGesture, { passive: true });
    window.addEventListener('touchcancel', endGesture, { passive: true });
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerup', onPointerUp, { passive: true });
    window.addEventListener('pointercancel', onPointerUp, { passive: true });

    return () => {
      window.removeEventListener('click', onCaptureClick, { capture: true });
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', endGesture);
      window.removeEventListener('touchcancel', endGesture);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      if (completionTimerRef.current !== null) {
        window.clearTimeout(completionTimerRef.current);
      }
    };
  }, [thresholdPx, runRefreshSequence]);

  const phase = resolvePullPhase(pullDistance, isRefreshing, isCompleting, thresholdPx);
  const progress = computePullProgress(pullDistance, thresholdPx);

  return {
    pullDistance,
    phase,
    progress,
    isPulling: isDragging && pullDistance > 0,
    isArmed: phase === 'armed',
    isRefreshing,
    hapticPulseCount,
    triggerRefresh: runRefreshSequence,
  };
}

import React, { useCallback, useEffect, useRef } from 'react';
import {
  CarouselMotionMode,
  CarouselPhysicsState,
  clampToBounds,
  computeFocusScrollOffset,
  computeReleaseVelocity,
  computeWheelScrollDelta,
  DRAG_ACTIVATION_THRESHOLD_PX,
  PointerSample,
  resolveVirtualOffsetFromVisual,
  resolveVisualOffsetFromVirtual,
  stepCarouselPhysics,
  VELOCITY_STOP_THRESHOLD_PX_MS,
} from '../utils/carouselMomentum';

export interface UseMomentumCarouselOptions {
  /** Whether the viewport & track DOM nodes are currently mounted. */
  active?: boolean;
  /** Number of items in the carousel so bounds refresh when items change. */
  itemCount?: number;
  /** Disable elastic bounce & momentum when battery saver or reduced motion is enabled. */
  reducedMotion?: boolean;
}

export interface UseMomentumCarouselResult {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  scrollBy: (delta: number) => void;
  scrollToOffset: (offset: number, instant?: boolean) => void;
  viewportProps: {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
    onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
    onClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
    onFocusCapture: (e: React.FocusEvent<HTMLDivElement>) => void;
  };
}

export function useMomentumCarousel({
  active = true,
  itemCount = 0,
  reducedMotion = false,
}: UseMomentumCarouselOptions = {}): UseMomentumCarouselResult {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const boundsRef = useRef({ viewportWidth: 0, contentWidth: 0, maxScroll: 0 });
  const physicsRef = useRef<CarouselPhysicsState>({
    offset: 0,
    velocity: 0,
    mode: 'idle',
  });

  const rafIdRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const wheelSettleTimerRef = useRef<number | null>(null);
  const suppressClickUntilRef = useRef<number>(0);
  const lastPointerDownAtRef = useRef<number>(0);
  const isDraggingRef = useRef<boolean>(false);
  const cleanupDragListenersRef = useRef<(() => void) | null>(null);

  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const isReducedMotion = useCallback(() => {
    if (reducedMotionRef.current) return true;
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
    return false;
  }, []);

  const setViewportMode = useCallback((mode: CarouselMotionMode) => {
    const vp = viewportRef.current;
    if (vp && vp.dataset.carouselMode !== mode) {
      vp.dataset.carouselMode = mode;
    }
  }, []);

  const applyTrackTransform = useCallback((offset: number, animating: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    const tx = Math.round(-offset * 100) / 100;
    track.style.transform = `translate3d(${tx}px, 0, 0)`;
    if (animating) {
      if (track.style.willChange !== 'transform') {
        track.style.willChange = 'transform';
      }
    } else if (track.style.willChange !== '') {
      track.style.willChange = '';
    }
  }, []);

  const cancelAnimationLoop = useCallback(() => {
    if (rafIdRef.current !== null) {
      window.cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  const measureBounds = useCallback(() => {
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return boundsRef.current;
    const viewportWidth = vp.clientWidth;
    const contentWidth = Math.max(track.scrollWidth, track.offsetWidth);
    const maxScroll = Math.max(0, contentWidth - viewportWidth);
    boundsRef.current = { viewportWidth, contentWidth, maxScroll };
    vp.dataset.carouselScrollable = maxScroll > 1 ? 'true' : 'false';
    return boundsRef.current;
  }, []);

  const startAnimationLoop = useCallback(() => {
    cancelAnimationLoop();
    lastFrameTimeRef.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const tick = (now: number) => {
      const dt = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;

      const next = stepCarouselPhysics(physicsRef.current, dt, {
        maxScroll: boundsRef.current.maxScroll,
        dimension: boundsRef.current.viewportWidth,
        reducedMotion: isReducedMotion(),
      });
      physicsRef.current = next;

      if (next.mode === 'idle') {
        rafIdRef.current = null;
        applyTrackTransform(next.offset, false);
        setViewportMode('idle');
        return;
      }

      applyTrackTransform(next.offset, true);
      setViewportMode(next.mode);
      rafIdRef.current = window.requestAnimationFrame(tick);
    };

    setViewportMode(physicsRef.current.mode);
    applyTrackTransform(physicsRef.current.offset, physicsRef.current.mode !== 'idle');
    rafIdRef.current = window.requestAnimationFrame(tick);
  }, [applyTrackTransform, cancelAnimationLoop, isReducedMotion, setViewportMode]);

  const scrollToOffset = useCallback(
    (target: number, instant = false) => {
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = null;
      }
      const { maxScroll } = measureBounds();
      const clamped = clampToBounds(target, maxScroll);
      if (instant || isReducedMotion()) {
        cancelAnimationLoop();
        physicsRef.current = { offset: clamped, velocity: 0, mode: 'idle' };
        applyTrackTransform(clamped, false);
        setViewportMode('idle');
        return;
      }
      physicsRef.current = {
        offset: physicsRef.current.offset,
        velocity: physicsRef.current.velocity,
        mode: 'glide',
        targetOffset: clamped,
      };
      startAnimationLoop();
    },
    [
      applyTrackTransform,
      cancelAnimationLoop,
      isReducedMotion,
      measureBounds,
      setViewportMode,
      startAnimationLoop,
    ],
  );

  const scrollBy = useCallback(
    (delta: number) => {
      if (!Number.isFinite(delta) || delta === 0) return;
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = null;
      }
      const { maxScroll } = measureBounds();
      if (maxScroll <= 0) return;

      const current = physicsRef.current;
      const base =
        current.mode === 'glide' && typeof current.targetOffset === 'number'
          ? current.targetOffset
          : clampToBounds(current.offset, maxScroll);
      const nextTarget = clampToBounds(base + delta, maxScroll);

      const atLeftEdge = delta < 0 && current.offset <= 0.5 && nextTarget <= 0.5;
      const atRightEdge =
        delta > 0 && current.offset >= maxScroll - 0.5 && nextTarget >= maxScroll - 0.5;

      if ((atLeftEdge || atRightEdge) && !isReducedMotion()) {
        physicsRef.current = {
          offset: current.offset,
          velocity: delta < 0 ? -0.9 : 0.9,
          mode: 'spring',
        };
        startAnimationLoop();
        return;
      }

      if (isReducedMotion()) {
        cancelAnimationLoop();
        physicsRef.current = { offset: nextTarget, velocity: 0, mode: 'idle' };
        applyTrackTransform(nextTarget, false);
        setViewportMode('idle');
        return;
      }

      physicsRef.current = {
        offset: current.offset,
        velocity: current.velocity,
        mode: 'glide',
        targetOffset: nextTarget,
      };
      startAnimationLoop();
    },
    [
      applyTrackTransform,
      cancelAnimationLoop,
      isReducedMotion,
      measureBounds,
      setViewportMode,
      startAnimationLoop,
    ],
  );

  // Measure bounds & attach passive:false wheel + touchmove listeners whenever viewport mounts
  useEffect(() => {
    if (!active) return;
    const vp = viewportRef.current;
    const track = trackRef.current;
    if (!vp || !track) return;

    const syncBounds = () => {
      const { maxScroll } = measureBounds();
      if (!isDraggingRef.current && physicsRef.current.mode === 'idle') {
        const clamped = clampToBounds(physicsRef.current.offset, maxScroll);
        if (clamped !== physicsRef.current.offset) {
          physicsRef.current = { offset: clamped, velocity: 0, mode: 'idle' };
        }
        applyTrackTransform(physicsRef.current.offset, false);
      }
    };

    syncBounds();
    setViewportMode(physicsRef.current.mode);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(syncBounds);
      observer.observe(vp);
      observer.observe(track);
    }
    window.addEventListener('resize', syncBounds);

    const onWheel = (e: WheelEvent) => {
      const { viewportWidth, maxScroll } = measureBounds();
      if (maxScroll <= 0) return;

      const dx = computeWheelScrollDelta(
        e.deltaX,
        e.deltaY,
        e.deltaMode,
        e.shiftKey,
        viewportWidth,
      );
      if (dx === null) return;

      e.preventDefault();
      cancelAnimationLoop();

      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = null;
      }

      const reduced = isReducedMotion();
      const virtualCurrent = resolveVirtualOffsetFromVisual(
        physicsRef.current.offset,
        maxScroll,
        viewportWidth,
      );
      const nextVisual = resolveVisualOffsetFromVirtual(
        virtualCurrent + dx,
        maxScroll,
        viewportWidth,
        reduced,
      );

      physicsRef.current = {
        offset: nextVisual,
        velocity: 0,
        mode: 'idle',
      };
      applyTrackTransform(nextVisual, !reduced);

      if (nextVisual < 0 || nextVisual > maxScroll) {
        setViewportMode('spring');
        wheelSettleTimerRef.current = window.setTimeout(() => {
          wheelSettleTimerRef.current = null;
          physicsRef.current = {
            offset: physicsRef.current.offset,
            velocity: 0,
            mode: 'spring',
          };
          startAnimationLoop();
        }, 85);
      } else {
        setViewportMode('idle');
        applyTrackTransform(nextVisual, false);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isDraggingRef.current && e.cancelable) {
        e.preventDefault();
      }
    };

    vp.addEventListener('wheel', onWheel, { passive: false });
    vp.addEventListener('touchmove', onTouchMove, { passive: false });

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncBounds);
      vp.removeEventListener('wheel', onWheel);
      vp.removeEventListener('touchmove', onTouchMove);
    };
  }, [
    active,
    itemCount,
    applyTrackTransform,
    cancelAnimationLoop,
    isReducedMotion,
    measureBounds,
    setViewportMode,
    startAnimationLoop,
  ]);

  // Cleanup active listeners/timers on unmount
  useEffect(() => {
    return () => {
      cleanupDragListenersRef.current?.();
      cancelAnimationLoop();
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
      }
    };
  }, [cancelAnimationLoop]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lastPointerDownAtRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      const vp = viewportRef.current;
      if (!vp) return;

      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest('input, textarea, select, [data-no-carousel-drag="true"]')
      ) {
        return;
      }

      const { viewportWidth, maxScroll } = measureBounds();
      if (maxScroll <= 0) return;

      cleanupDragListenersRef.current?.();
      if (wheelSettleTimerRef.current !== null) {
        window.clearTimeout(wheelSettleTimerRef.current);
        wheelSettleTimerRef.current = null;
      }

      // Freeze current position cleanly if catching mid-momentum or mid-bounce
      cancelAnimationLoop();
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const virtualStartOffset = resolveVirtualOffsetFromVisual(
        physicsRef.current.offset,
        maxScroll,
        viewportWidth,
      );

      let locked: 'pending' | 'horizontal' | 'rejected' = 'pending';
      const samples: PointerSample[] = [{ x: startX, t: now }];

      const finishGesture = (ev: PointerEvent, cancelled: boolean) => {
        if (ev.pointerId !== pointerId) return;
        detach();

        if (locked !== 'horizontal') {
          isDraggingRef.current = false;
          delete vp.dataset.carouselDragging;
          return;
        }

        isDraggingRef.current = false;
        delete vp.dataset.carouselDragging;
        suppressClickUntilRef.current =
          (typeof performance !== 'undefined' ? performance.now() : Date.now()) + 180;

        const releaseTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const releaseVel = cancelled ? 0 : computeReleaseVelocity(samples, releaseTime);
        const currentBounds = measureBounds();
        const currentOffset = physicsRef.current.offset;
        const reduced = isReducedMotion();

        if (currentOffset < 0 || currentOffset > currentBounds.maxScroll) {
          if (reduced) {
            const clamped = clampToBounds(currentOffset, currentBounds.maxScroll);
            physicsRef.current = { offset: clamped, velocity: 0, mode: 'idle' };
            applyTrackTransform(clamped, false);
            setViewportMode('idle');
            return;
          }
          const pushingOutward =
            (currentOffset < 0 && releaseVel < 0) ||
            (currentOffset > currentBounds.maxScroll && releaseVel > 0);
          physicsRef.current = {
            offset: currentOffset,
            velocity: pushingOutward ? releaseVel * 0.45 : releaseVel * 0.75,
            mode: 'spring',
          };
          startAnimationLoop();
          return;
        }

        if (!reduced && Math.abs(releaseVel) >= VELOCITY_STOP_THRESHOLD_PX_MS) {
          physicsRef.current = {
            offset: currentOffset,
            velocity: releaseVel,
            mode: 'momentum',
          };
          startAnimationLoop();
          return;
        }

        physicsRef.current = { offset: currentOffset, velocity: 0, mode: 'idle' };
        applyTrackTransform(currentOffset, false);
        setViewportMode('idle');
      };

      const onPointerMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId || locked === 'rejected') return;

        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        if (locked === 'pending') {
          if (Math.hypot(dx, dy) < DRAG_ACTIVATION_THRESHOLD_PX) {
            return;
          }
          if (Math.abs(dx) >= Math.abs(dy)) {
            locked = 'horizontal';
            cancelAnimationLoop();
            isDraggingRef.current = true;
            vp.dataset.carouselDragging = 'true';
            setViewportMode('dragging');
          } else {
            locked = 'rejected';
            detach();
            return;
          }
        }

        const sampleTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
        samples.push({ x: ev.clientX, t: sampleTime });
        if (samples.length > 10) {
          samples.shift();
        }

        const virtualOffset = virtualStartOffset - dx;
        const visualOffset = resolveVisualOffsetFromVirtual(
          virtualOffset,
          boundsRef.current.maxScroll,
          boundsRef.current.viewportWidth,
          isReducedMotion(),
        );

        physicsRef.current = {
          offset: visualOffset,
          velocity: 0,
          mode: 'idle',
        };
        applyTrackTransform(visualOffset, true);
      };

      const onPointerUp = (ev: PointerEvent) => finishGesture(ev, false);
      const onPointerCancel = (ev: PointerEvent) => finishGesture(ev, true);

      const detach = () => {
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
        window.removeEventListener('pointercancel', onPointerCancel);
        if (cleanupDragListenersRef.current === detach) {
          cleanupDragListenersRef.current = null;
        }
      };

      cleanupDragListenersRef.current = detach;
      window.addEventListener('pointermove', onPointerMove, { passive: true });
      window.addEventListener('pointerup', onPointerUp, { passive: true });
      window.addEventListener('pointercancel', onPointerCancel, { passive: true });
    },
    [
      applyTrackTransform,
      cancelAnimationLoop,
      isReducedMotion,
      measureBounds,
      setViewportMode,
      startAnimationLoop,
    ],
  );

  const onDragStart = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (now < suppressClickUntilRef.current) {
      suppressClickUntilRef.current = 0;
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const onFocusCapture = useCallback(
    (e: React.FocusEvent<HTMLDivElement>) => {
      const vp = viewportRef.current;
      const target = e.target;
      if (!vp || !(target instanceof HTMLElement)) return;
      if (isDraggingRef.current || vp.dataset.carouselDragging === 'true') return;

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastPointerDownAtRef.current < 350) return;

      let isFocusVisible = true;
      try {
        isFocusVisible = target.matches(':focus-visible');
      } catch {
        isFocusVisible = true;
      }
      if (!isFocusVisible) return;

      const { viewportWidth, maxScroll } = measureBounds();
      if (maxScroll <= 0 || viewportWidth <= 0) return;

      const vpRect = vp.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const current = physicsRef.current.offset;
      const itemLeft = targetRect.left - vpRect.left + current;
      const itemRight = targetRect.right - vpRect.left + current;

      const nextTarget = computeFocusScrollOffset(
        current,
        itemLeft,
        itemRight,
        viewportWidth,
        maxScroll,
      );
      if (Math.abs(nextTarget - current) > 1) {
        scrollToOffset(nextTarget);
      }
    },
    [measureBounds, scrollToOffset],
  );

  return {
    viewportRef,
    trackRef,
    scrollBy,
    scrollToOffset,
    viewportProps: {
      onPointerDown,
      onDragStart,
      onClickCapture,
      onFocusCapture,
    },
  };
}

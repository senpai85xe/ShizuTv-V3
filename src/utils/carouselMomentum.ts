export type CarouselMotionMode = 'idle' | 'dragging' | 'momentum' | 'spring' | 'glide';

export interface PointerSample {
  x: number;
  t: number;
}

export interface CarouselPhysicsState {
  offset: number;
  velocity: number; // px/ms; positive scrolls right (offset increases)
  mode: Exclude<CarouselMotionMode, 'dragging'>;
  targetOffset?: number;
}

export interface CarouselPhysicsBounds {
  maxScroll: number;
  dimension: number;
  reducedMotion?: boolean;
}

/**
 * Authentic iOS UIScrollView deceleration & rubber-band physics constants.
 * UIScrollViewDecelerationRate.normal = 0.998 per ms.
 */
export const IOS_DECELERATION_RATE = 0.998;
export const IOS_FRICTION_K = -Math.log(IOS_DECELERATION_RATE);
export const IOS_RUBBER_BAND_COEFFICIENT = 0.55;
export const CAROUSEL_SPRING_OMEGA = 16.5; // rad/s
export const CAROUSEL_SPRING_ZETA = 0.98; // near-critically damped for crisp snap-back
export const CAROUSEL_GLIDE_OMEGA = 13.5; // rad/s for programmatic button/focus glides
export const CAROUSEL_GLIDE_ZETA = 1.0;

export const MAX_FLING_VELOCITY_PX_MS = 4.6;
export const VELOCITY_STOP_THRESHOLD_PX_MS = 0.02;
export const POSITION_SETTLE_THRESHOLD_PX = 0.35;
export const DRAG_ACTIVATION_THRESHOLD_PX = 6;
export const STALE_POINTER_WINDOW_MS = 85;
export const POINTER_HISTORY_WINDOW_MS = 110;
export const MIN_RUBBER_BAND_DIMENSION_PX = 240;
export const MAX_OVERSCROLL_PX = 160;
export const BOUNDARY_VELOCITY_DAMPING = 0.55;

export function clampToBounds(offset: number, maxScroll: number): number {
  if (!Number.isFinite(offset)) return 0;
  const safeMax = Math.max(0, Number.isFinite(maxScroll) ? maxScroll : 0);
  if (offset < 0) return 0;
  if (offset > safeMax) return safeMax;
  return offset;
}

/**
 * Classic iOS UIScrollView rubber-band equation:
 *   f(x) = (x * d * c) / (d + c * x)
 * Smoothly compresses overscroll asymptotically toward `dimension`.
 */
export function applyCarouselRubberBand(
  rawOverscroll: number,
  dimension: number,
  coefficient = IOS_RUBBER_BAND_COEFFICIENT,
): number {
  if (!Number.isFinite(rawOverscroll) || rawOverscroll <= 0) return 0;
  const safeDim = Math.max(MIN_RUBBER_BAND_DIMENSION_PX, Number.isFinite(dimension) ? dimension : 0);
  const safeCoeff = Math.max(0.05, Math.min(1, coefficient));
  const result = (rawOverscroll * safeDim * safeCoeff) / (safeDim + safeCoeff * rawOverscroll);
  return Math.min(result, MAX_OVERSCROLL_PX, safeDim * 0.42);
}

/**
 * Exact algebraic inverse of applyCarouselRubberBand so catching a carousel
 * mid-bounce continues tracking without a position jump.
 */
export function invertCarouselRubberBand(
  visualOverscroll: number,
  dimension: number,
  coefficient = IOS_RUBBER_BAND_COEFFICIENT,
): number {
  if (!Number.isFinite(visualOverscroll) || visualOverscroll <= 0) return 0;
  const safeDim = Math.max(MIN_RUBBER_BAND_DIMENSION_PX, Number.isFinite(dimension) ? dimension : 0);
  const safeCoeff = Math.max(0.05, Math.min(1, coefficient));
  const capped = Math.min(visualOverscroll, safeDim * 0.92);
  return (capped * safeDim) / (safeCoeff * (safeDim - capped));
}

export function resolveVisualOffsetFromVirtual(
  virtualOffset: number,
  maxScroll: number,
  dimension: number,
  reducedMotion = false,
): number {
  const safeMax = Math.max(0, Number.isFinite(maxScroll) ? maxScroll : 0);
  if (!Number.isFinite(virtualOffset)) return 0;
  if (reducedMotion) {
    return clampToBounds(virtualOffset, safeMax);
  }
  if (virtualOffset < 0) {
    return -applyCarouselRubberBand(-virtualOffset, dimension);
  }
  if (virtualOffset > safeMax) {
    return safeMax + applyCarouselRubberBand(virtualOffset - safeMax, dimension);
  }
  return virtualOffset;
}

export function resolveVirtualOffsetFromVisual(
  visualOffset: number,
  maxScroll: number,
  dimension: number,
): number {
  const safeMax = Math.max(0, Number.isFinite(maxScroll) ? maxScroll : 0);
  if (!Number.isFinite(visualOffset)) return 0;
  if (visualOffset < 0) {
    return -invertCarouselRubberBand(-visualOffset, dimension);
  }
  if (visualOffset > safeMax) {
    return safeMax + invertCarouselRubberBand(visualOffset - safeMax, dimension);
  }
  return visualOffset;
}

/**
 * Computes scroll release velocity in px/ms (positive = scrolling right / finger moved left)
 * from recent pointer samples. Rejects stale pauses so stopping your finger before lifting
 * produces zero phantom fling.
 */
export function computeReleaseVelocity(
  samples: ReadonlyArray<PointerSample>,
  releaseTimeMs: number,
): number {
  if (samples.length < 2) return 0;
  const latest = samples[samples.length - 1];
  if (releaseTimeMs - latest.t > STALE_POINTER_WINDOW_MS) {
    return 0;
  }

  const cutoff = releaseTimeMs - POINTER_HISTORY_WINDOW_MS;
  let anchor = samples[0];
  for (let i = samples.length - 2; i >= 0; i--) {
    anchor = samples[i];
    if (anchor.t <= cutoff) break;
  }

  const dt = latest.t - anchor.t;
  if (dt < 8) return 0;

  // Finger moving left (latest.x < anchor.x) increases carousel scroll offset (+)
  const rawVelocity = -(latest.x - anchor.x) / dt;
  if (!Number.isFinite(rawVelocity)) return 0;
  return Math.max(-MAX_FLING_VELOCITY_PX_MS, Math.min(MAX_FLING_VELOCITY_PX_MS, rawVelocity));
}

function integrateSpringSubstep(
  displacement: number,
  velocityPxPerSec: number,
  dtSec: number,
  omega: number,
  zeta: number,
): { displacement: number; velocityPxPerSec: number } {
  const accel = -omega * omega * displacement - 2 * zeta * omega * velocityPxPerSec;
  const nextVelocity = velocityPxPerSec + accel * dtSec;
  const nextDisplacement = displacement + nextVelocity * dtSec;
  return { displacement: nextDisplacement, velocityPxPerSec: nextVelocity };
}

function runSpringToward(
  offset: number,
  velocityPxMs: number,
  anchor: number,
  dtMs: number,
  omega: number,
  zeta: number,
  maxDisplacement?: number,
): { offset: number; velocity: number; settled: boolean } {
  let u = offset - anchor;
  let vSec = velocityPxMs * 1000;
  let remainingSec = dtMs / 1000;
  const maxStepSec = 0.004;

  while (remainingSec > 1e-6) {
    const step = Math.min(remainingSec, maxStepSec);
    const next = integrateSpringSubstep(u, vSec, step, omega, zeta);
    u = next.displacement;
    vSec = next.velocityPxPerSec;
    if (typeof maxDisplacement === 'number' && Math.abs(u) > maxDisplacement) {
      u = Math.sign(u) * maxDisplacement;
      if (Math.sign(vSec) === Math.sign(u)) {
        vSec = 0;
      }
    }
    remainingSec -= step;
  }

  const vMs = vSec / 1000;
  const settled =
    Math.abs(u) < POSITION_SETTLE_THRESHOLD_PX &&
    Math.abs(vMs) < VELOCITY_STOP_THRESHOLD_PX_MS;

  if (settled) {
    return { offset: anchor, velocity: 0, settled: true };
  }
  return { offset: anchor + u, velocity: vMs, settled: false };
}

export function stepCarouselPhysics(
  state: CarouselPhysicsState,
  dtMs: number,
  bounds: CarouselPhysicsBounds,
): CarouselPhysicsState {
  const maxScroll = Math.max(0, Number.isFinite(bounds.maxScroll) ? bounds.maxScroll : 0);
  const dimension = Math.max(
    MIN_RUBBER_BAND_DIMENSION_PX,
    Number.isFinite(bounds.dimension) ? bounds.dimension : 0,
  );
  const reducedMotion = Boolean(bounds.reducedMotion);

  if (state.mode === 'idle') {
    return {
      offset: clampToBounds(state.offset, maxScroll),
      velocity: 0,
      mode: 'idle',
    };
  }

  const clampedDt = Math.min(100, Math.max(0, Number.isFinite(dtMs) ? dtMs : 0));
  if (clampedDt <= 0) {
    return state;
  }

  if (state.mode === 'glide') {
    const target = clampToBounds(state.targetOffset ?? state.offset, maxScroll);
    if (reducedMotion) {
      return { offset: target, velocity: 0, mode: 'idle' };
    }
    const res = runSpringToward(
      state.offset,
      state.velocity,
      target,
      clampedDt,
      CAROUSEL_GLIDE_OMEGA,
      CAROUSEL_GLIDE_ZETA,
    );
    return res.settled
      ? { offset: target, velocity: 0, mode: 'idle' }
      : { offset: res.offset, velocity: res.velocity, mode: 'glide', targetOffset: target };
  }

  if (state.mode === 'momentum') {
    let { offset, velocity } = state;

    if (offset >= 0 && offset <= maxScroll) {
      const decay = Math.exp(-IOS_FRICTION_K * clampedDt);
      const traveled = velocity * ((1 - decay) / IOS_FRICTION_K);
      const nextOffset = offset + traveled;
      const nextVelocity = velocity * decay;

      if (nextOffset < 0 || nextOffset > maxScroll) {
        if (reducedMotion) {
          return {
            offset: clampToBounds(nextOffset, maxScroll),
            velocity: 0,
            mode: 'idle',
          };
        }
        const boundary = nextOffset < 0 ? 0 : maxScroll;
        const dampedEntryVelocity = nextVelocity * BOUNDARY_VELOCITY_DAMPING;
        const maxOverscroll = Math.min(MAX_OVERSCROLL_PX, dimension * 0.35);
        const springRes = runSpringToward(
          boundary,
          dampedEntryVelocity,
          boundary,
          clampedDt * 0.5,
          CAROUSEL_SPRING_OMEGA,
          CAROUSEL_SPRING_ZETA,
          maxOverscroll,
        );
        return springRes.settled
          ? { offset: boundary, velocity: 0, mode: 'idle' }
          : { offset: springRes.offset, velocity: springRes.velocity, mode: 'spring' };
      }

      if (Math.abs(nextVelocity) < VELOCITY_STOP_THRESHOLD_PX_MS) {
        return { offset: nextOffset, velocity: 0, mode: 'idle' };
      }

      return { offset: nextOffset, velocity: nextVelocity, mode: 'momentum' };
    }

    // Already outside bounds with momentum -> transition to spring
    if (reducedMotion) {
      return {
        offset: clampToBounds(offset, maxScroll),
        velocity: 0,
        mode: 'idle',
      };
    }
    const anchor = offset < 0 ? 0 : maxScroll;
    const maxOverscroll = Math.min(MAX_OVERSCROLL_PX, dimension * 0.35);
    const springRes = runSpringToward(
      offset,
      velocity,
      anchor,
      clampedDt,
      CAROUSEL_SPRING_OMEGA,
      CAROUSEL_SPRING_ZETA,
      maxOverscroll,
    );
    return springRes.settled
      ? { offset: anchor, velocity: 0, mode: 'idle' }
      : { offset: springRes.offset, velocity: springRes.velocity, mode: 'spring' };
  }

  // mode === 'spring'
  if (reducedMotion) {
    return {
      offset: clampToBounds(state.offset, maxScroll),
      velocity: 0,
      mode: 'idle',
    };
  }

  const anchor =
    state.offset < 0 ? 0 : state.offset > maxScroll ? maxScroll : state.velocity < 0 ? 0 : maxScroll;
  const maxOverscroll = Math.min(MAX_OVERSCROLL_PX, dimension * 0.35);
  const springRes = runSpringToward(
    state.offset,
    state.velocity,
    anchor,
    clampedDt,
    CAROUSEL_SPRING_OMEGA,
    CAROUSEL_SPRING_ZETA,
    maxOverscroll,
  );
  return springRes.settled
    ? { offset: anchor, velocity: 0, mode: 'idle' }
    : { offset: springRes.offset, velocity: springRes.velocity, mode: 'spring' };
}

export function computeFocusScrollOffset(
  currentOffset: number,
  itemLeft: number,
  itemRight: number,
  viewportWidth: number,
  maxScroll: number,
  edgePadding = 20,
): number {
  const safeMax = Math.max(0, maxScroll);
  if (viewportWidth <= 0 || safeMax <= 0) return clampToBounds(currentOffset, safeMax);

  const visibleLeft = currentOffset + edgePadding;
  const visibleRight = currentOffset + viewportWidth - edgePadding;

  if (itemLeft < visibleLeft) {
    return clampToBounds(itemLeft - edgePadding, safeMax);
  }
  if (itemRight > visibleRight) {
    return clampToBounds(itemRight - viewportWidth + edgePadding, safeMax);
  }
  return clampToBounds(currentOffset, safeMax);
}

export function computeWheelScrollDelta(
  deltaX: number,
  deltaY: number,
  deltaMode: number,
  shiftKey: boolean,
  pageSize = 600,
): number | null {
  const lineScale = deltaMode === 1 ? 40 : deltaMode === 2 ? Math.max(240, pageSize * 0.85) : 1;

  if (shiftKey && Math.abs(deltaY) > Math.abs(deltaX)) {
    const val = deltaY * lineScale;
    return Math.abs(val) > 0.2 ? val : null;
  }

  if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 0.2) {
    return deltaX * lineScale;
  }

  return null;
}

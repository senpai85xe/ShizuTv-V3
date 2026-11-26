export type CoverflowSlot = 'prev' | 'active' | 'next' | 'hidden';

export interface CoverflowCardMetrics {
  slot: CoverflowSlot;
  scale: number;
  opacity: number;
  translateXPercent: number;
  rotateYDeg: number;
  zIndex: number;
}

/**
 * Resolves the shortest circular offset of slide `index` relative to `activeIndex`
 * within a carousel of `total` items.
 */
export function getCircularOffset(index: number, activeIndex: number, total: number): number {
  if (total <= 0) return 0;
  let diff = ((index - activeIndex) % total + total) % total;
  if (diff > total / 2) {
    diff -= total;
  }
  return diff;
}

/**
 * Computes pure compositor-only transform metrics for the 3D coverflow hero spotlight.
 */
export function getCoverflowCardMetrics(
  index: number,
  activeIndex: number,
  total: number,
): CoverflowCardMetrics {
  if (total <= 1) {
    return {
      slot: 'active',
      scale: 1,
      opacity: 1,
      translateXPercent: 0,
      rotateYDeg: 0,
      zIndex: 20,
    };
  }

  const offset = getCircularOffset(index, activeIndex, total);

  if (offset === 0) {
    return {
      slot: 'active',
      scale: 1,
      opacity: 1,
      translateXPercent: 0,
      rotateYDeg: 0,
      zIndex: 20,
    };
  }

  if (offset === -1) {
    return {
      slot: 'prev',
      scale: 0.88,
      opacity: 0.52,
      translateXPercent: -14,
      rotateYDeg: 8,
      zIndex: 10,
    };
  }

  if (offset === 1) {
    return {
      slot: 'next',
      scale: 0.88,
      opacity: 0.52,
      translateXPercent: 14,
      rotateYDeg: -8,
      zIndex: 10,
    };
  }

  return {
    slot: 'hidden',
    scale: 0.78,
    opacity: 0,
    translateXPercent: offset < 0 ? -24 : 24,
    rotateYDeg: offset < 0 ? 12 : -12,
    zIndex: 0,
  };
}

/**
 * Computes bounded stagger delay (in ms) so initial card waves feel fluid
 * without delaying cards further down a shelf or grid.
 */
export function getStaggerDelayMs(index: number, stepMs = 36, maxSteps = 8): number {
  if (index <= 0 || stepMs <= 0 || maxSteps <= 0) return 0;
  return Math.min(index, maxSteps) * stepMs;
}

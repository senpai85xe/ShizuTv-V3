import { clampSeekTarget, formatPlayerTime } from './detailsLayout';

export type PlayerGestureKind = 'none' | 'seek' | 'volume' | 'brightness';

/**
 * Classifies pointer movement once it crosses the deadzone threshold:
 * - Horizontal movement locks to timeline seeking ('seek')
 * - Vertical movement locks to 'volume' (right/center >= 45% width) or 'brightness' (left < 45%)
 */
export function detectPlayerGestureKind(
  dx: number,
  dy: number,
  startX: number,
  containerWidth: number,
  thresholdPx = 18,
): PlayerGestureKind {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < thresholdPx && absY < thresholdPx) {
    return 'none';
  }
  if (absX >= absY) {
    return 'seek';
  }
  const safeWidth = containerWidth > 0 ? containerWidth : 1;
  return startX < safeWidth * 0.45 ? 'brightness' : 'volume';
}

/**
 * Computes clamped seek target and signed delta from horizontal drag distance.
 */
export function computeSwipeSeekTarget(
  startTime: number,
  dx: number,
  containerWidth: number,
  duration: number,
  maxSpanSeconds = 90,
): { targetTime: number; deltaSeconds: number } {
  const safeStart = Number.isFinite(startTime) && startTime >= 0 ? startTime : 0;
  const safeWidth = containerWidth > 200 ? containerWidth : 320;
  const rawDelta = Math.round((dx / safeWidth) * maxSpanSeconds);
  const effectiveDuration = Number.isFinite(duration) && duration > 0 ? duration : 1440;
  const targetTime = clampSeekTarget(safeStart, rawDelta, effectiveDuration);
  return {
    targetTime,
    deltaSeconds: Math.round(targetTime - safeStart),
  };
}

/**
 * Maps vertical drag (dy < 0 = swipe up = increase) to a normalized [minLevel, maxLevel] value.
 */
export function computeSwipeVerticalLevel(
  startLevel: number,
  dy: number,
  sensitivityPx = 220,
  minLevel = 0,
  maxLevel = 1,
): number {
  const safeStart = Number.isFinite(startLevel) ? startLevel : maxLevel;
  const safeSensitivity = sensitivityPx > 0 ? sensitivityPx : 220;
  const next = safeStart + (-dy / safeSensitivity) * (maxLevel - minLevel);
  const clamped = Math.max(minLevel, Math.min(maxLevel, next));
  return Math.round(clamped * 100) / 100;
}

/**
 * Formats signed delta seconds cleanly (e.g. "+00:18", "-00:09").
 */
export function formatSignedSeekDelta(deltaSeconds: number): string {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds === 0) return '+00:00';
  const sign = deltaSeconds > 0 ? '+' : '-';
  return `${sign}${formatPlayerTime(Math.abs(deltaSeconds))}`;
}

/**
 * Maps viewport pointer offsets & deltas into local stage coordinates.
 * When rotated 90deg clockwise, viewport +Y aligns with stage +X (seek),
 * and viewport -X aligns with stage +Y (drag up = screen right = +dx).
 */
export function mapStageGestureCoordinates(input: {
  dx: number;
  dy: number;
  clientX: number;
  clientY: number;
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  cssRotated: boolean;
}): {
  stageDx: number;
  stageDy: number;
  stageLocalX: number;
  stageWidth: number;
} {
  if (!input.cssRotated) {
    return {
      stageDx: input.dx,
      stageDy: input.dy,
      stageLocalX: input.clientX - input.rectLeft,
      stageWidth: input.rectWidth > 0 ? input.rectWidth : 360,
    };
  }
  return {
    stageDx: input.dy,
    stageDy: -input.dx,
    stageLocalX: input.clientY - input.rectTop,
    stageWidth: input.rectHeight > 0 ? input.rectHeight : 640,
  };
}

export const GESTURE_GUIDE_DURATION_MS = 2000;

export interface GestureGuideItem {
  id: 'brightness' | 'seek' | 'volume';
  label: string;
  hint: string;
}

export const GESTURE_GUIDE_ITEMS: readonly GestureGuideItem[] = [
  { id: 'brightness', label: 'Brightness', hint: 'Left vertical' },
  { id: 'seek', label: 'Seek', hint: 'Slide horizontally' },
  { id: 'volume', label: 'Volume', hint: 'Right vertical' },
];

export function shouldTriggerGestureGuide(input: {
  alreadyShown: boolean;
  isLocked: boolean;
  isPipActive: boolean;
}): boolean {
  return !input.alreadyShown && !input.isLocked && !input.isPipActive;
}

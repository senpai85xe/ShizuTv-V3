import { triggerHaptic } from './haptics';

export type PullRefreshPhase = 'idle' | 'pulling' | 'armed' | 'refreshing' | 'completing';

export const PULL_REFRESH_THRESHOLD_PX = 64;
export const PULL_REFRESH_MAX_PX = 128;
export const PULL_REFRESH_HOLD_PX = 56;

export function applyPullRubberBand(
  rawDeltaY: number,
  maxPull = PULL_REFRESH_MAX_PX,
): number {
  if (!Number.isFinite(rawDeltaY) || rawDeltaY <= 0) return 0;
  const boundedMax = Math.max(24, maxPull);
  const damped = boundedMax * (1 - Math.exp(-rawDeltaY / (boundedMax * 1.45)));
  return Math.round(damped * 10) / 10;
}

export function computePullProgress(
  pullDistance: number,
  threshold = PULL_REFRESH_THRESHOLD_PX,
): number {
  if (!Number.isFinite(pullDistance) || pullDistance <= 0 || threshold <= 0) return 0;
  return Math.max(0, Math.min(1, pullDistance / threshold));
}

export function resolvePullPhase(
  pullDistance: number,
  isRefreshing: boolean,
  isCompleting = false,
  threshold = PULL_REFRESH_THRESHOLD_PX,
): PullRefreshPhase {
  if (isCompleting) return 'completing';
  if (isRefreshing) return 'refreshing';
  if (!Number.isFinite(pullDistance) || pullDistance <= 0) return 'idle';
  return pullDistance >= threshold ? 'armed' : 'pulling';
}

export function computePullIndicatorScale(progress: number, armed: boolean): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  if (armed) return 1.04;
  return Math.round((0.72 + clamped * 0.28) * 1000) / 1000;
}

export interface StartPullInput {
  scrollY: number;
  deltaY: number;
  deltaX: number;
  isRestoringScroll: boolean;
  isInteractiveTarget: boolean;
  isRefreshing: boolean;
}

export function shouldStartPullRefresh(input: StartPullInput): boolean {
  if (input.isRefreshing || input.isRestoringScroll || input.isInteractiveTarget) {
    return false;
  }
  if (!Number.isFinite(input.scrollY) || input.scrollY > 2) {
    return false;
  }
  if (!Number.isFinite(input.deltaY) || input.deltaY <= 8) {
    return false;
  }
  return Math.abs(input.deltaY) > Math.abs(input.deltaX) * 1.25;
}

export function triggerHapticFeedback(
  kind: 'armed' | 'success',
  nav?: { vibrate?: (pattern: number | number[]) => boolean } | null,
  reducedMotion = false,
): boolean {
  return triggerHaptic(kind, {
    navigator: nav,
    nativePlugin: nav !== undefined ? null : undefined,
    reducedMotion,
    force: true,
    respectAppSettings: nav === undefined,
  });
}

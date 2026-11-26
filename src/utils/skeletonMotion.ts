import type { CSSProperties } from 'react';

export interface SkeletonWaveOptions {
  stepMs?: number;
  maxSteps?: number;
  baseDelayMs?: number;
}

const DEFAULT_LINE_WIDTHS = ['94%', '82%', '68%', '88%', '56%'] as const;

/**
 * Computes a bounded staggered delay (in ms) so horizontal shelves and grids
 * ripple smoothly from left to right without delaying later items excessively.
 */
export function getSkeletonWaveDelayMs(
  index = 0,
  options: SkeletonWaveOptions = {},
): number {
  const { stepMs = 70, maxSteps = 7, baseDelayMs = 0 } = options;
  if (!Number.isFinite(index) || index <= 0) {
    return Math.max(0, Math.round(baseDelayMs));
  }
  const safeMax = Math.max(1, Math.floor(maxSteps));
  const safeStep = Math.max(0, stepMs);
  const clampedStep = Math.floor(index) % safeMax;
  return Math.max(0, Math.round(baseDelayMs + clampedStep * safeStep));
}

export type SkeletonCssVariables = CSSProperties & {
  '--sx-skeleton-delay'?: string;
};

/**
 * Returns inline CSS custom properties for GPU-accelerated directional shimmer wave timing.
 */
export function getSkeletonWaveStyle(
  index = 0,
  options: SkeletonWaveOptions = {},
): SkeletonCssVariables {
  const delayMs = getSkeletonWaveDelayMs(index, options);
  return {
    '--sx-skeleton-delay': `${delayMs}ms`,
  };
}

/**
 * Returns varied, natural-looking text line width percentages for multi-line skeletons.
 */
export function resolveSkeletonLineWidths(
  lineCount: number,
  pattern: readonly string[] = DEFAULT_LINE_WIDTHS,
): string[] {
  const safeCount = Number.isFinite(lineCount) ? Math.max(0, Math.min(20, Math.floor(lineCount))) : 0;
  if (safeCount === 0) return [];
  const source = pattern.length > 0 ? pattern : DEFAULT_LINE_WIDTHS;
  return Array.from({ length: safeCount }, (_, idx) => {
    if (idx === safeCount - 1 && safeCount > 1) {
      return idx % 2 === 0 ? '62%' : '54%';
    }
    return source[idx % source.length];
  });
}

/**
 * Computes an appropriate placeholder card count for responsive media grids or shelves.
 */
export function getSkeletonItemCount(
  mode: 'shelf' | 'grid' | 'compact-list',
  customCount?: number,
): number {
  if (typeof customCount === 'number' && Number.isFinite(customCount) && customCount > 0) {
    return Math.min(24, Math.floor(customCount));
  }
  if (mode === 'shelf') return 8;
  if (mode === 'compact-list') return 6;
  return 12;
}

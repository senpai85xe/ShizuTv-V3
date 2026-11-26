import { flushSync } from 'react-dom';
import { ThemeMode } from '../data/themePresets';
import {
  applyThemeToDocument,
  resolveEffectiveIsDark,
  ThemePrefs,
} from './themeDefaults';

export interface WaveRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface WaveViewport {
  width: number;
  height: number;
}

export interface WaveGeometry {
  x: number;
  y: number;
  endRadius: number;
}

export interface WaveCrestMetrics {
  baseSize: number;
  baseRadius: number;
  crestRatio: number;
  left: number;
  top: number;
  finalScale: number;
}

export interface RippleDisplacement {
  dx: number;
  dy: number;
  reboundDx: number;
  reboundDy: number;
  peakScale: number;
  reboundScale: number;
  tiltDeg: number;
  delayMs: number;
  durationMs: number;
}

// Smooth, unhurried iOS AirDrop / NameDrop fluid deceleration curve
export const THEME_WAVE_DURATION_MS = 1050;
export const THEME_WAVE_EASING = 'cubic-bezier(0.28, 0.84, 0.32, 1)';
export const THEME_WAVE_CONTROL_POINTS = [0.28, 0.84, 0.32, 1] as const;
export const THEME_RIPPLE_DURATION_MS = 720;

export const WAVE_CREST_BASE_SIZE = 640;
export const WAVE_CREST_RATIO = 0.68;
export const ORIGIN_BLOOM_BASE_SIZE = 240;

let activeWavePromise: Promise<'light' | 'dark'> | null = null;

export function getNextToggledThemeMode(
  currentMode: ThemeMode,
  prefersDark: boolean,
): 'light' | 'dark' {
  const currentlyDark = resolveEffectiveIsDark(currentMode, prefersDark);
  return currentlyDark ? 'light' : 'dark';
}

export function computeWaveGeometry(
  rect: WaveRect,
  viewport: WaveViewport,
): WaveGeometry {
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const maxX = Math.max(x, viewport.width - x);
  const maxY = Math.max(y, viewport.height - y);
  const endRadius = Math.hypot(maxX, maxY);
  return { x, y, endRadius };
}

export function computeWaveCrestMetrics(
  geometry: WaveGeometry,
  baseSize = WAVE_CREST_BASE_SIZE,
  crestRatio = WAVE_CREST_RATIO,
): WaveCrestMetrics {
  const baseRadius = baseSize / 2;
  const safeRatio = Math.max(0.1, Math.min(0.95, crestRatio));
  const finalScale = geometry.endRadius / (baseRadius * safeRatio);
  return {
    baseSize,
    baseRadius,
    crestRatio: safeRatio,
    left: Math.round((geometry.x - baseRadius) * 100) / 100,
    top: Math.round((geometry.y - baseRadius) * 100) / 100,
    finalScale: Math.round(finalScale * 10000) / 10000,
  };
}

function sampleCubicBezier1D(u: number, p1: number, p2: number): number {
  const inv = 1 - u;
  return 3 * inv * inv * u * p1 + 3 * inv * u * u * p2 + u * u * u;
}

/**
 * Inverts the wavefront's cubic-bezier curve so arrival timing can be
 * mathematically phase-locked to the exact wavefront radius.
 */
export function solveWaveArrivalFraction(
  distanceProgress: number,
  controlPoints: readonly [number, number, number, number] = THEME_WAVE_CONTROL_POINTS,
): number {
  const targetY = Math.min(1, Math.max(0, distanceProgress));
  if (targetY <= 0) return 0;
  if (targetY >= 1) return 1;

  const [p1x, p1y, p2x, p2y] = controlPoints;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) * 0.5;
    const y = sampleCubicBezier1D(mid, p1y, p2y);
    if (y < targetY) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  const u = (lo + hi) * 0.5;
  return Math.min(1, Math.max(0, sampleCubicBezier1D(u, p1x, p2x)));
}

/**
 * Computes pure GPU spatial ripple displacement metrics for a target rect relative to `origin`.
 */
export function computeAirDropRippleDisplacement(
  origin: WaveGeometry,
  targetRect: WaveRect,
  isHero = false,
): RippleDisplacement {
  const cx = targetRect.left + targetRect.width / 2;
  const cy = targetRect.top + targetRect.height / 2;
  const rawDx = cx - origin.x;
  const rawDy = cy - origin.y;
  const distance = Math.hypot(rawDx, rawDy);
  const progress = Math.min(1, Math.max(0, distance / Math.max(origin.endRadius, 1)));

  const ux = distance > 0.5 ? rawDx / distance : 0;
  const uy = distance > 0.5 ? rawDy / distance : 1;

  const pushMagnitude = (isHero ? 1.5 : 7.5) * (1 - progress * 0.38);
  const dx = Math.round(ux * pushMagnitude * 100) / 100;
  const dy = Math.round(uy * pushMagnitude * 100) / 100;

  const arrivalMs = solveWaveArrivalFraction(progress) * THEME_WAVE_DURATION_MS;
  const baseDelayMs = progress <= 0.02 ? 0 : Math.max(0, Math.round(arrivalMs));
  const delayMs = isHero ? baseDelayMs + 75 : baseDelayMs;

  return {
    dx,
    dy,
    reboundDx: Math.round(-dx * 0.25 * 100) / 100,
    reboundDy: Math.round(-dy * 0.25 * 100) / 100,
    peakScale: isHero ? 1.005 : 1.02,
    reboundScale: isHero ? 0.998 : 0.994,
    tiltDeg: Math.round(ux * (isHero ? 0.08 : 0.55) * 100) / 100,
    delayMs,
    durationMs: THEME_RIPPLE_DURATION_MS,
  };
}

/**
 * Single cohesive optical AirDrop wavefront texture:
 * centered strictly at 68% with smooth Gaussian falloff on both sides
 * so the luminous crest seamlessly bridges old and new theme surfaces.
 */
function getWaveCrestGradient(targetMode: 'light' | 'dark'): string {
  const isDarkTarget = targetMode === 'dark';

  return isDarkTarget
    ? 'radial-gradient(closest-side, transparent 0%, transparent 48%, rgba(56, 189, 248, 0.1) 55%, rgba(125, 211, 252, 0.28) 61%, rgba(186, 230, 253, 0.62) 65.5%, rgba(255, 255, 255, 0.88) 68%, rgba(165, 243, 252, 0.62) 70.5%, rgba(99, 102, 241, 0.28) 74.5%, rgba(56, 189, 248, 0.08) 82%, transparent 94%, transparent 100%)'
    : 'radial-gradient(closest-side, transparent 0%, transparent 48%, rgba(251, 191, 36, 0.08) 55%, rgba(125, 211, 252, 0.26) 61%, rgba(255, 255, 255, 0.68) 65.5%, rgba(255, 255, 255, 0.94) 68%, rgba(147, 197, 253, 0.64) 70.5%, rgba(56, 189, 248, 0.28) 74.5%, rgba(99, 102, 241, 0.09) 82%, transparent 94%, transparent 100%)';
}

function getOriginBloomGradient(targetMode: 'light' | 'dark'): string {
  return targetMode === 'dark'
    ? 'radial-gradient(closest-side, rgba(255, 255, 255, 0.94) 0%, rgba(125, 211, 252, 0.52) 36%, rgba(99, 102, 241, 0.16) 66%, transparent 100%)'
    : 'radial-gradient(closest-side, rgba(255, 255, 255, 0.96) 0%, rgba(251, 191, 36, 0.42) 36%, rgba(56, 189, 248, 0.16) 66%, transparent 100%)';
}

function createWaveOverlayElement(
  metrics: WaveCrestMetrics,
  background: string,
  viewTransitionName?: string,
  zIndex = '2147483647',
): HTMLDivElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.left = `${metrics.left}px`;
  el.style.top = `${metrics.top}px`;
  el.style.width = `${metrics.baseSize}px`;
  el.style.height = `${metrics.baseSize}px`;
  el.style.borderRadius = '9999px';
  el.style.pointerEvents = 'none';
  el.style.background = background;
  el.style.willChange = 'transform, opacity';
  if (viewTransitionName) {
    el.style.viewTransitionName = viewTransitionName;
  } else {
    el.style.zIndex = zIndex;
  }
  return el;
}

function lockAnimationsStartTime(animations: Animation[]) {
  if (typeof document === 'undefined' || !document.timeline) return;
  const syncTime = document.timeline.currentTime;
  if (syncTime === null) return;
  for (const anim of animations) {
    try {
      anim.startTime = syncTime;
    } catch {
      // Ignore if timeline rejects explicit startTime on older engines
    }
  }
}

function triggerButtonContactPulse(sourceEl: HTMLElement | null) {
  if (!sourceEl || typeof sourceEl.animate !== 'function') return;
  sourceEl.animate(
    [
      { transform: 'scale(1)', offset: 0, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
      { transform: 'scale(0.88)', offset: 0.25, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      { transform: 'scale(1.06)', offset: 0.65, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
      { transform: 'scale(1)', offset: 1 },
    ],
    {
      duration: 420,
      fill: 'none',
    },
  );
}

function runFallbackWaveTransition(
  geometry: WaveGeometry,
  nextMode: 'light' | 'dark',
  themePrefs: ThemePrefs,
  prefersDark: boolean,
  onCommitMode: (mode: 'light' | 'dark') => void,
): Promise<'light' | 'dark'> {
  return new Promise((resolve) => {
    const crestMetrics = computeWaveCrestMetrics(geometry);
    const veilMetrics = computeWaveCrestMetrics(geometry, 640, 1);
    const bloomHalf = ORIGIN_BLOOM_BASE_SIZE / 2;
    const bloomMetrics: WaveCrestMetrics = {
      baseSize: ORIGIN_BLOOM_BASE_SIZE,
      baseRadius: bloomHalf,
      crestRatio: 1,
      left: Math.round((geometry.x - bloomHalf) * 100) / 100,
      top: Math.round((geometry.y - bloomHalf) * 100) / 100,
      finalScale: 2.6,
    };

    const veil = createWaveOverlayElement(
      veilMetrics,
      nextMode === 'dark'
        ? 'radial-gradient(closest-side, #0b0c12 0%, #0b0c12 88%, rgba(11, 12, 18, 0) 100%)'
        : 'radial-gradient(closest-side, #f4f5fb 0%, #f4f5fb 88%, rgba(244, 245, 251, 0) 100%)',
      undefined,
      '2147483645',
    );
    const crestEl = createWaveOverlayElement(
      crestMetrics,
      getWaveCrestGradient(nextMode),
      undefined,
      '2147483646',
    );
    const bloomEl = createWaveOverlayElement(
      bloomMetrics,
      getOriginBloomGradient(nextMode),
      undefined,
      '2147483647',
    );

    document.body.appendChild(veil);
    document.body.appendChild(crestEl);
    document.body.appendChild(bloomEl);

    const expand = veil.animate(
      [
        { transform: 'scale(0)', opacity: 0.96 },
        { transform: `scale(${veilMetrics.finalScale * 1.15})`, opacity: 1 },
      ],
      {
        duration: Math.round(THEME_WAVE_DURATION_MS * 0.65),
        easing: THEME_WAVE_EASING,
        fill: 'forwards',
      },
    );
    const crestAnim = crestEl.animate(
      [
        { transform: 'scale(0)', opacity: 0.95, offset: 0 },
        { transform: `scale(${crestMetrics.finalScale * 0.65})`, opacity: 0.84, offset: 0.55 },
        { transform: `scale(${crestMetrics.finalScale})`, opacity: 0, offset: 1 },
      ],
      {
        duration: THEME_WAVE_DURATION_MS,
        easing: THEME_WAVE_EASING,
        fill: 'forwards',
      },
    );
    const bloomAnim = bloomEl.animate(
      [
        { transform: 'scale(0.14)', opacity: 0.95, offset: 0 },
        { transform: 'scale(1.55)', opacity: 0.52, offset: 0.44 },
        { transform: 'scale(2.6)', opacity: 0, offset: 1 },
      ],
      {
        duration: 520,
        easing: THEME_WAVE_EASING,
        fill: 'forwards',
      },
    );

    lockAnimationsStartTime([expand, crestAnim, bloomAnim]);

    const cleanupOverlays = () => {
      veil.remove();
      crestEl.remove();
      bloomEl.remove();
    };

    expand.onfinish = () => {
      applyThemeToDocument(
        document.documentElement,
        { ...themePrefs, themeMode: nextMode },
        prefersDark,
      );
      flushSync(() => {
        onCommitMode(nextMode);
      });
      const fadeOut = veil.animate(
        [{ opacity: 1 }, { opacity: 0 }],
        { duration: 280, easing: THEME_WAVE_EASING, fill: 'forwards' },
      );
      fadeOut.onfinish = () => {
        cleanupOverlays();
        resolve(nextMode);
      };
      fadeOut.oncancel = () => {
        cleanupOverlays();
        resolve(nextMode);
      };
    };
    expand.oncancel = () => {
      cleanupOverlays();
      resolve(nextMode);
    };
  });
}

export async function triggerThemeWaveTransition(params: {
  sourceEl: HTMLElement | null;
  themePrefs: ThemePrefs;
  onCommitMode: (mode: 'light' | 'dark') => void;
}): Promise<'light' | 'dark'> {
  if (activeWavePromise) {
    return activeWavePromise;
  }

  const run = async (): Promise<'light' | 'dark'> => {
    const { sourceEl, themePrefs, onCommitMode } = params;
    const prefersDark =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    const nextMode = getNextToggledThemeMode(themePrefs.themeMode, prefersDark);

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (typeof document === 'undefined' || prefersReducedMotion) {
      onCommitMode(nextMode);
      return nextMode;
    }

    const rect: WaveRect = sourceEl
      ? sourceEl.getBoundingClientRect()
      : {
          left: window.innerWidth - 56,
          top: 28,
          width: 44,
          height: 44,
        };
    const geometry = computeWaveGeometry(rect, {
      width: window.innerWidth,
      height: window.innerHeight,
    });

    const docWithVT = document as Document & {
      startViewTransition?: (cb: () => void) => {
        ready: Promise<void>;
        finished: Promise<void>;
      };
    };

    if (typeof docWithVT.startViewTransition !== 'function') {
      triggerButtonContactPulse(sourceEl);
      return runFallbackWaveTransition(
        geometry,
        nextMode,
        themePrefs,
        prefersDark,
        onCommitMode,
      );
    }

    const root = document.documentElement;
    root.style.setProperty('--sx-wave-x', `${geometry.x}px`);
    root.style.setProperty('--sx-wave-y', `${geometry.y}px`);
    root.classList.add('sx-theme-wave-active');

    let overlayElements: HTMLDivElement[] = [];

    try {
      const crestMetrics = computeWaveCrestMetrics(geometry);
      const bloomHalf = ORIGIN_BLOOM_BASE_SIZE / 2;
      const bloomMetrics: WaveCrestMetrics = {
        baseSize: ORIGIN_BLOOM_BASE_SIZE,
        baseRadius: bloomHalf,
        crestRatio: 1,
        left: Math.round((geometry.x - bloomHalf) * 100) / 100,
        top: Math.round((geometry.y - bloomHalf) * 100) / 100,
        finalScale: 2.6,
      };

      const transition = docWithVT.startViewTransition(() => {
        applyThemeToDocument(root, { ...themePrefs, themeMode: nextMode }, prefersDark);
        flushSync(() => {
          onCommitMode(nextMode);
        });

        const crestEl = createWaveOverlayElement(
          crestMetrics,
          getWaveCrestGradient(nextMode),
          'sx-airdrop-wave-crest',
        );
        const bloomEl = createWaveOverlayElement(
          bloomMetrics,
          getOriginBloomGradient(nextMode),
          'sx-airdrop-origin-bloom',
        );
        overlayElements.push(crestEl, bloomEl);
        for (const el of overlayElements) {
          document.body.appendChild(el);
        }
      });

      await transition.ready;

      triggerButtonContactPulse(sourceEl);

      // All ViewTransition pseudo-element animations are pure GPU compositor layers
      // locked to the exact same timeline startTime (zero DOM mutations, zero lag, zero desync).
      const crestScaleAnim = root.animate(
        [
          { transform: 'scale(0)', offset: 0 },
          { transform: `scale(${crestMetrics.finalScale})`, offset: 1 },
        ],
        {
          duration: THEME_WAVE_DURATION_MS,
          easing: THEME_WAVE_EASING,
          fill: 'forwards',
          pseudoElement: '::view-transition-new(sx-airdrop-wave-crest)',
        },
      );
      const crestFadeAnim = root.animate(
        [
          { opacity: 0.96, offset: 0 },
          { opacity: 0.94, offset: 0.55 },
          { opacity: 0.68, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ],
        {
          duration: THEME_WAVE_DURATION_MS,
          easing: 'linear',
          fill: 'forwards',
          pseudoElement: '::view-transition-new(sx-airdrop-wave-crest)',
        },
      );
      const bloomAnim = root.animate(
        [
          { transform: 'scale(0.14)', opacity: 0.95, offset: 0 },
          { transform: 'scale(1.55)', opacity: 0.52, offset: 0.44 },
          { transform: 'scale(2.6)', opacity: 0, offset: 1 },
        ],
        {
          duration: 520,
          easing: THEME_WAVE_EASING,
          fill: 'forwards',
          pseudoElement: '::view-transition-new(sx-airdrop-origin-bloom)',
        },
      );
      const clipAnim = root.animate(
        {
          clipPath: [
            `circle(0px at ${geometry.x}px ${geometry.y}px)`,
            `circle(${geometry.endRadius}px at ${geometry.x}px ${geometry.y}px)`,
          ],
        },
        {
          duration: THEME_WAVE_DURATION_MS,
          easing: THEME_WAVE_EASING,
          fill: 'forwards',
          pseudoElement: '::view-transition-new(root)',
        },
      );

      // Keep ::view-transition-image-pair(root) at unscaled 1:1 geometry so clipPath
      // and the 68% luminous wave crest remain subpixel-locked at every frame.
      const syncedAnims: Animation[] = [clipAnim, crestScaleAnim, crestFadeAnim, bloomAnim];

      lockAnimationsStartTime(syncedAnims);

      await Promise.allSettled([
        transition.finished,
        ...syncedAnims.map((a) => a.finished),
      ]);
    } catch {
      onCommitMode(nextMode);
      applyThemeToDocument(root, { ...themePrefs, themeMode: nextMode }, prefersDark);
    } finally {
      for (const el of overlayElements) {
        el.remove();
      }
      overlayElements = [];
      root.classList.remove('sx-theme-wave-active');
      root.style.removeProperty('--sx-wave-x');
      root.style.removeProperty('--sx-wave-y');
    }

    return nextMode;
  };

  activeWavePromise = run().finally(() => {
    activeWavePromise = null;
  });

  return activeWavePromise;
}

import { RouteTransitionKind } from './appMotion';

export type HapticCue =
  | 'nav-tab'
  | 'nav-push'
  | 'nav-pop'
  | 'menu-open'
  | 'menu-select'
  | 'armed'
  | 'success'
  | 'warning';

export type HapticPattern = number | number[];

export const HAPTIC_PATTERNS: Record<HapticCue, HapticPattern> = {
  'nav-tab': 8,
  'nav-push': 12,
  'nav-pop': 6,
  'menu-open': 10,
  'menu-select': 7,
  armed: 12,
  success: [10, 26, 14],
  warning: [14, 28, 14],
};

export const DEFAULT_HAPTIC_COOLDOWN_MS = 32;

export interface HapticNavigatorAdapter {
  vibrate?: (pattern: HapticPattern) => boolean;
}

export interface CapacitorHapticsPluginAdapter {
  selectionChanged?: () => Promise<void> | void;
  impact?: (options: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => Promise<void> | void;
  notification?: (options: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }) => Promise<void> | void;
  vibrate?: (options?: { duration?: number }) => Promise<void> | void;
}

export interface HapticRuntimeConfig {
  enabled: boolean;
  batterySaver: boolean;
  cooldownMs: number;
}

export interface HapticTriggerOptions {
  /** Override navigator adapter (primarily for unit tests). */
  navigator?: HapticNavigatorAdapter | null;
  /** Override Capacitor Haptics plugin adapter. */
  nativePlugin?: CapacitorHapticsPluginAdapter | null;
  /** Override reduced motion check; defaults to prefers-reduced-motion media query. */
  reducedMotion?: boolean;
  /** Override current timestamp (ms) for deterministic cooldown tests. */
  now?: number;
  /** Override cooldown window in ms (default 32ms). */
  cooldownMs?: number;
  /** Bypass cooldown throttling for explicit test/feedback confirmations. */
  force?: boolean;
  /** Override global enabled state when needed by isolated helpers. */
  respectAppSettings?: boolean;
}

const runtimeConfig: HapticRuntimeConfig = {
  enabled: true,
  batterySaver: false,
  cooldownMs: DEFAULT_HAPTIC_COOLDOWN_MS,
};

let lastFiredAtMs = -Infinity;
let suppressRouteUntilMs = -Infinity;

export function getHapticsConfig(): HapticRuntimeConfig {
  return { ...runtimeConfig };
}

export function configureHaptics(patch: Partial<HapticRuntimeConfig>): HapticRuntimeConfig {
  if (typeof patch.enabled === 'boolean') {
    runtimeConfig.enabled = patch.enabled;
  }
  if (typeof patch.batterySaver === 'boolean') {
    runtimeConfig.batterySaver = patch.batterySaver;
  }
  if (typeof patch.cooldownMs === 'number' && Number.isFinite(patch.cooldownMs) && patch.cooldownMs >= 0) {
    runtimeConfig.cooldownMs = patch.cooldownMs;
  }
  return getHapticsConfig();
}

export function resetHapticsForTests(): void {
  runtimeConfig.enabled = true;
  runtimeConfig.batterySaver = false;
  runtimeConfig.cooldownMs = DEFAULT_HAPTIC_COOLDOWN_MS;
  lastFiredAtMs = -Infinity;
  suppressRouteUntilMs = -Infinity;
}

export function suppressNextRouteHaptic(windowMs = 1000, now?: number): void {
  const ts = typeof now === 'number' && Number.isFinite(now) ? now : Date.now();
  suppressRouteUntilMs = ts + Math.max(0, windowMs);
}

export function isReducedMotionPreferred(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return Boolean(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

export function resolveCapacitorHapticsPlugin(): CapacitorHapticsPluginAdapter | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    const cap = (
      globalThis as {
        Capacitor?: {
          isNativePlatform?: () => boolean;
          Plugins?: { Haptics?: CapacitorHapticsPluginAdapter };
        };
      }
    ).Capacitor;
    if (!cap) return null;
    if (typeof cap.isNativePlatform === 'function' && !cap.isNativePlatform()) {
      return null;
    }
    return cap.Plugins?.Haptics ?? null;
  } catch {
    return null;
  }
}

export function getHapticCueForRouteTransition(kind: RouteTransitionKind): HapticCue | null {
  switch (kind) {
    case 'tab':
    case 'online-next':
    case 'online-prev':
      return 'nav-tab';
    case 'push':
      return 'nav-push';
    case 'pop':
      return 'nav-pop';
    case 'none':
    default:
      return null;
  }
}

function invokeCapacitorHaptics(
  plugin: CapacitorHapticsPluginAdapter,
  cue: HapticCue,
): boolean {
  try {
    if (cue === 'success' || cue === 'warning') {
      if (typeof plugin.notification === 'function') {
        void plugin.notification({ type: cue === 'success' ? 'SUCCESS' : 'WARNING' });
        return true;
      }
    }
    if (cue === 'nav-tab' || cue === 'menu-select') {
      if (typeof plugin.selectionChanged === 'function') {
        void plugin.selectionChanged();
        return true;
      }
    }
    if (typeof plugin.impact === 'function') {
      const style =
        cue === 'nav-push' || cue === 'armed'
          ? 'MEDIUM'
          : 'LIGHT';
      void plugin.impact({ style });
      return true;
    }
    if (typeof plugin.vibrate === 'function') {
      const pattern = HAPTIC_PATTERNS[cue];
      const duration = Array.isArray(pattern) ? pattern[0] ?? 12 : pattern;
      void plugin.vibrate({ duration });
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Triggers subtle tactile haptic feedback on supported mobile browsers (Web Vibration API)
 * or native Capacitor wrappers while respecting user preferences, battery saver,
 * reduced motion, and a short deduplication cooldown.
 */
export function triggerHaptic(
  cue: HapticCue,
  options: HapticTriggerOptions = {},
): boolean {
  const respectAppSettings = options.respectAppSettings !== false;
  if (respectAppSettings && (!runtimeConfig.enabled || runtimeConfig.batterySaver)) {
    return false;
  }

  const reducedMotion =
    typeof options.reducedMotion === 'boolean'
      ? options.reducedMotion
      : isReducedMotionPreferred();
  if (reducedMotion) {
    return false;
  }

  const now = typeof options.now === 'number' && Number.isFinite(options.now)
    ? options.now
    : Date.now();
  const cooldownMs =
    typeof options.cooldownMs === 'number' && Number.isFinite(options.cooldownMs) && options.cooldownMs >= 0
      ? options.cooldownMs
      : runtimeConfig.cooldownMs;

  if (!options.force && cooldownMs > 0 && now - lastFiredAtMs < cooldownMs) {
    return false;
  }

  const nativePlugin =
    options.nativePlugin !== undefined
      ? options.nativePlugin
      : resolveCapacitorHapticsPlugin();

  if (nativePlugin && invokeCapacitorHaptics(nativePlugin, cue)) {
    lastFiredAtMs = now;
    return true;
  }

  const targetNav =
    options.navigator !== undefined
      ? options.navigator
      : typeof navigator !== 'undefined'
        ? (navigator as HapticNavigatorAdapter)
        : null;

  if (!targetNav || typeof targetNav.vibrate !== 'function') {
    return false;
  }

  try {
    const pattern = HAPTIC_PATTERNS[cue];
    const fired = Boolean(
      targetNav.vibrate(Array.isArray(pattern) ? [...pattern] : pattern),
    );
    if (fired) {
      lastFiredAtMs = now;
    }
    return fired;
  } catch {
    return false;
  }
}

export function triggerHapticForRouteTransition(
  kind: RouteTransitionKind,
  options: HapticTriggerOptions = {},
): boolean {
  const now = typeof options.now === 'number' && Number.isFinite(options.now)
    ? options.now
    : Date.now();
  if (suppressRouteUntilMs >= now) {
    suppressRouteUntilMs = -Infinity;
    return false;
  }
  suppressRouteUntilMs = -Infinity;
  const cue = getHapticCueForRouteTransition(kind);
  if (!cue) return false;
  return triggerHaptic(cue, {
    cooldownMs: 140,
    ...options,
  });
}

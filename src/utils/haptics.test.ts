import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureHaptics,
  getHapticCueForRouteTransition,
  getHapticsConfig,
  HAPTIC_PATTERNS,
  resetHapticsForTests,
  suppressNextRouteHaptic,
  triggerHaptic,
  triggerHapticForRouteTransition,
} from './haptics';

test('getHapticCueForRouteTransition maps route transitions to appropriate tactile cues', () => {
  assert.equal(getHapticCueForRouteTransition('tab'), 'nav-tab');
  assert.equal(getHapticCueForRouteTransition('online-next'), 'nav-tab');
  assert.equal(getHapticCueForRouteTransition('online-prev'), 'nav-tab');
  assert.equal(getHapticCueForRouteTransition('push'), 'nav-push');
  assert.equal(getHapticCueForRouteTransition('pop'), 'nav-pop');
  assert.equal(getHapticCueForRouteTransition('none'), null);
});

test('triggerHaptic dispatches expected patterns via navigator.vibrate and deduplicates within cooldown', () => {
  resetHapticsForTests();
  const patterns: Array<number | number[]> = [];
  const nav = {
    vibrate: (pattern: number | number[]) => {
      patterns.push(pattern);
      return true;
    },
  };

  assert.equal(triggerHaptic('nav-tab', { navigator: nav, nativePlugin: null, now: 1000 }), true);
  // Rapid duplicate within default 32ms cooldown is suppressed
  assert.equal(triggerHaptic('nav-push', { navigator: nav, nativePlugin: null, now: 1015 }), false);
  // Succeeds after cooldown expires
  assert.equal(triggerHaptic('menu-open', { navigator: nav, nativePlugin: null, now: 1050 }), true);
  assert.equal(triggerHaptic('menu-select', { navigator: nav, nativePlugin: null, now: 1100 }), true);
  assert.equal(triggerHaptic('success', { navigator: nav, nativePlugin: null, now: 1200 }), true);

  assert.deepEqual(patterns, [
    HAPTIC_PATTERNS['nav-tab'],
    HAPTIC_PATTERNS['menu-open'],
    HAPTIC_PATTERNS['menu-select'],
    HAPTIC_PATTERNS.success,
  ]);
});

test('triggerHaptic respects enabled, batterySaver, and reducedMotion settings', () => {
  resetHapticsForTests();
  const patterns: Array<number | number[]> = [];
  const nav = {
    vibrate: (pattern: number | number[]) => {
      patterns.push(pattern);
      return true;
    },
  };

  assert.equal(triggerHaptic('menu-select', { navigator: nav, nativePlugin: null, reducedMotion: true, now: 1000 }), false);

  configureHaptics({ enabled: false });
  assert.equal(getHapticsConfig().enabled, false);
  assert.equal(triggerHaptic('nav-tab', { navigator: nav, nativePlugin: null, now: 1200 }), false);

  configureHaptics({ enabled: true, batterySaver: true });
  assert.equal(triggerHaptic('nav-tab', { navigator: nav, nativePlugin: null, now: 1400 }), false);

  configureHaptics({ batterySaver: false });
  assert.equal(triggerHaptic('nav-pop', { navigator: nav, nativePlugin: null, now: 1600 }), true);
  assert.deepEqual(patterns, [HAPTIC_PATTERNS['nav-pop']]);
});

test('triggerHaptic prefers Capacitor Haptics native plugin when present and maps cues accurately', () => {
  resetHapticsForTests();
  const calls: string[] = [];
  const nativePlugin = {
    selectionChanged: () => {
      calls.push('selectionChanged');
    },
    impact: ({ style }: { style: 'LIGHT' | 'MEDIUM' | 'HEAVY' }) => {
      calls.push(`impact:${style}`);
    },
    notification: ({ type }: { type: 'SUCCESS' | 'WARNING' | 'ERROR' }) => {
      calls.push(`notification:${type}`);
    },
  };
  const nav = {
    vibrate: () => {
      calls.push('webVibrate');
      return true;
    },
  };

  assert.equal(triggerHaptic('menu-select', { navigator: nav, nativePlugin, now: 100 }), true);
  assert.equal(triggerHaptic('nav-push', { navigator: nav, nativePlugin, now: 200 }), true);
  assert.equal(triggerHaptic('menu-open', { navigator: nav, nativePlugin, now: 300 }), true);
  assert.equal(triggerHaptic('success', { navigator: nav, nativePlugin, now: 400 }), true);
  assert.equal(triggerHaptic('warning', { navigator: nav, nativePlugin, now: 500 }), true);

  assert.deepEqual(calls, [
    'selectionChanged',
    'impact:MEDIUM',
    'impact:LIGHT',
    'notification:SUCCESS',
    'notification:WARNING',
  ]);
});

test('triggerHapticForRouteTransition triggers for route changes and ignores none transitions', () => {
  resetHapticsForTests();
  const patterns: Array<number | number[]> = [];
  const nav = {
    vibrate: (pattern: number | number[]) => {
      patterns.push(pattern);
      return true;
    },
  };

  assert.equal(triggerHapticForRouteTransition('none', { navigator: nav, nativePlugin: null, now: 100 }), false);
  assert.equal(triggerHapticForRouteTransition('push', { navigator: nav, nativePlugin: null, now: 200 }), true);
  assert.equal(triggerHapticForRouteTransition('pop', { navigator: nav, nativePlugin: null, now: 400 }), true);
  assert.equal(triggerHapticForRouteTransition('tab', { navigator: nav, nativePlugin: null, now: 600 }), true);

  // Verify async effect route transition within 140ms after a click haptic is deduplicated
  assert.equal(triggerHaptic('nav-tab', { navigator: nav, nativePlugin: null, now: 1000 }), true);
  assert.equal(triggerHapticForRouteTransition('tab', { navigator: nav, nativePlugin: null, now: 1075 }), false);

  // Verify consume-once suppressNextRouteHaptic suppresses slow route mount but leaves next transition enabled
  suppressNextRouteHaptic(1000, 1200);
  assert.equal(triggerHapticForRouteTransition('push', { navigator: nav, nativePlugin: null, now: 1650 }), false);
  assert.equal(triggerHapticForRouteTransition('pop', { navigator: nav, nativePlugin: null, now: 1900 }), true);

  assert.deepEqual(patterns, [
    HAPTIC_PATTERNS['nav-push'],
    HAPTIC_PATTERNS['nav-pop'],
    HAPTIC_PATTERNS['nav-tab'],
    HAPTIC_PATTERNS['nav-tab'],
    HAPTIC_PATTERNS['nav-pop'],
  ]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveBackgroundPollIntervalMs,
  resolveEffectiveBatterySaver,
  resolveVideoPreloadMode,
  shouldRunAutomaticBackgroundTasks,
} from './batterySaver';

test('resolveEffectiveBatterySaver prioritizes explicit global flag and falls back to legacy playerPrefs flag', () => {
  assert.equal(
    resolveEffectiveBatterySaver({ topLevelBatterySaver: true, playerBatterySaver: false }),
    true,
  );
  assert.equal(
    resolveEffectiveBatterySaver({ topLevelBatterySaver: false, playerBatterySaver: true }),
    false,
  );
  assert.equal(
    resolveEffectiveBatterySaver({ topLevelBatterySaver: undefined, playerBatterySaver: true }),
    true,
  );
  assert.equal(
    resolveEffectiveBatterySaver({ topLevelBatterySaver: undefined, playerBatterySaver: undefined }),
    false,
  );
});

test('resolveVideoPreloadMode throttles pre-buffering to metadata in batterySaver mode', () => {
  assert.equal(resolveVideoPreloadMode(false), 'auto');
  assert.equal(resolveVideoPreloadMode(true), 'metadata');
});

test('resolveBackgroundPollIntervalMs and shouldRunAutomaticBackgroundTasks pause background work when batterySaver is active', () => {
  assert.equal(resolveBackgroundPollIntervalMs(6500, false), 6500);
  assert.equal(resolveBackgroundPollIntervalMs(6500, true), null);
  assert.equal(resolveBackgroundPollIntervalMs(0, false), null);
  assert.equal(shouldRunAutomaticBackgroundTasks(false), true);
  assert.equal(shouldRunAutomaticBackgroundTasks(true), false);
});

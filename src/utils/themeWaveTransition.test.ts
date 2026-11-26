import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeAirDropRippleDisplacement,
  computeWaveCrestMetrics,
  computeWaveGeometry,
  getNextToggledThemeMode,
  solveWaveArrivalFraction,
  THEME_WAVE_DURATION_MS,
} from './themeWaveTransition';

test('getNextToggledThemeMode toggles light, dark, and system modes accurately', () => {
  assert.equal(getNextToggledThemeMode('light', false), 'dark');
  assert.equal(getNextToggledThemeMode('light', true), 'dark');
  assert.equal(getNextToggledThemeMode('dark', false), 'light');
  assert.equal(getNextToggledThemeMode('dark', true), 'light');
  assert.equal(getNextToggledThemeMode('system', false), 'dark');
  assert.equal(getNextToggledThemeMode('system', true), 'light');
});

test('computeWaveGeometry computes origin center and full-viewport covering radius', () => {
  const geo = computeWaveGeometry(
    { left: 1300, top: 20, width: 44, height: 44 },
    { width: 1440, height: 900 },
  );
  assert.equal(geo.x, 1322);
  assert.equal(geo.y, 42);
  // Distance to farthest corner (0, 900)
  const expected = Math.hypot(1322, 900 - 42);
  assert.ok(Math.abs(geo.endRadius - expected) < 0.001);
  assert.ok(geo.endRadius > 1500);
});

test('computeWaveCrestMetrics aligns 68% gradient crest radius with clip-path endRadius', () => {
  const geo = computeWaveGeometry(
    { left: 1300, top: 20, width: 44, height: 44 },
    { width: 1440, height: 900 },
  );
  const metrics = computeWaveCrestMetrics(geo);
  assert.equal(metrics.baseSize, 640);
  assert.equal(metrics.baseRadius, 320);
  assert.equal(metrics.left, geo.x - 320);
  assert.equal(metrics.top, geo.y - 320);
  // At finalScale, 68% of baseRadius * finalScale equals endRadius
  const effectiveCrestRadius = metrics.baseRadius * metrics.crestRatio * metrics.finalScale;
  assert.ok(Math.abs(effectiveCrestRadius - geo.endRadius) < 0.25);
});

test('solveWaveArrivalFraction accurately inverts cubic-bezier(0.28, 0.84, 0.32, 1)', () => {
  assert.equal(solveWaveArrivalFraction(0), 0);
  assert.equal(solveWaveArrivalFraction(1), 1);

  const t25 = solveWaveArrivalFraction(0.25);
  const t50 = solveWaveArrivalFraction(0.5);
  const t75 = solveWaveArrivalFraction(0.75);
  const t90 = solveWaveArrivalFraction(0.9);

  // Smooth iOS ease-out curve reaches 50% distance around 22-32% elapsed time
  assert.ok(t25 > 0.08 && t25 < 0.2);
  assert.ok(t50 > t25 && t50 < 0.36);
  assert.ok(t75 > t50 && t75 < 0.56);
  assert.ok(t90 > t75 && t90 < 0.78);
});

test('computeAirDropRippleDisplacement pushes outward radially and phase-locks to wavefront', () => {
  const origin = computeWaveGeometry(
    { left: 1300, top: 20, width: 44, height: 44 },
    { width: 1440, height: 900 },
  );

  const nearHero = computeAirDropRippleDisplacement(
    origin,
    { left: 120, top: 90, width: 1000, height: 320 },
    true,
  );
  const farCard = computeAirDropRippleDisplacement(
    origin,
    { left: 40, top: 680, width: 180, height: 260 },
    false,
  );

  // Origin is top-right (1322, 42); both targets lie to the left & below -> dx < 0, dy > 0
  assert.ok(nearHero.dx < 0);
  assert.ok(nearHero.dy > 0);
  assert.ok(nearHero.reboundDx > 0);
  assert.ok(nearHero.reboundDy < 0);
  assert.ok(nearHero.peakScale > 1);
  assert.ok(nearHero.reboundScale < 1);
  assert.ok(farCard.delayMs > nearHero.delayMs);
  assert.ok(farCard.delayMs < THEME_WAVE_DURATION_MS);

  // Zero-distance fallback when target center matches origin center
  const centered = computeAirDropRippleDisplacement(
    origin,
    { left: origin.x - 20, top: origin.y - 20, width: 40, height: 40 },
    false,
  );
  assert.equal(centered.dx, 0);
  assert.ok(centered.dy > 0);
  assert.equal(centered.delayMs, 0);
});

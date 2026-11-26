import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCarouselRubberBand,
  CarouselPhysicsState,
  computeFocusScrollOffset,
  computeReleaseVelocity,
  computeWheelScrollDelta,
  invertCarouselRubberBand,
  resolveVirtualOffsetFromVisual,
  resolveVisualOffsetFromVirtual,
  stepCarouselPhysics,
} from './carouselMomentum';

test('applyCarouselRubberBand compresses overscroll monotonically and respects dimension ceiling', () => {
  assert.equal(applyCarouselRubberBand(0, 800), 0);
  assert.equal(applyCarouselRubberBand(-20, 800), 0);

  const small = applyCarouselRubberBand(20, 800);
  const medium = applyCarouselRubberBand(100, 800);
  const large = applyCarouselRubberBand(500, 800);

  assert.ok(small > 0 && small < 20);
  assert.ok(medium > small && medium < 100);
  assert.ok(large >= medium && large <= 160);
});

test('invertCarouselRubberBand round-trips visual overscroll accurately', () => {
  const dimension = 900;
  for (const raw of [10, 45, 120, 220]) {
    const visual = applyCarouselRubberBand(raw, dimension);
    const recovered = invertCarouselRubberBand(visual, dimension);
    assert.ok(
      Math.abs(recovered - raw) < 1e-6,
      `Expected ${recovered} to match ${raw} (visual=${visual})`,
    );
  }
});

test('resolveVisualOffsetFromVirtual and resolveVirtualOffsetFromVisual handle both boundaries', () => {
  const maxScroll = 1200;
  const dim = 800;

  assert.equal(resolveVisualOffsetFromVirtual(450, maxScroll, dim), 450);

  const leftVisual = resolveVisualOffsetFromVirtual(-80, maxScroll, dim);
  assert.ok(leftVisual < 0 && leftVisual > -80);
  assert.ok(Math.abs(resolveVirtualOffsetFromVisual(leftVisual, maxScroll, dim) - -80) < 1e-6);

  const rightVisual = resolveVisualOffsetFromVirtual(maxScroll + 90, maxScroll, dim);
  assert.ok(rightVisual > maxScroll && rightVisual < maxScroll + 90);
  assert.ok(
    Math.abs(resolveVirtualOffsetFromVisual(rightVisual, maxScroll, dim) - (maxScroll + 90)) < 1e-6,
  );

  // Reduced motion clamps strictly inside [0, maxScroll]
  assert.equal(resolveVisualOffsetFromVirtual(-80, maxScroll, dim, true), 0);
  assert.equal(resolveVisualOffsetFromVirtual(maxScroll + 90, maxScroll, dim, true), maxScroll);
});

test('computeReleaseVelocity computes signed fling velocity and ignores stale pauses', () => {
  // Dragging finger left (x decreases) produces positive scroll velocity (+)
  const leftFling = computeReleaseVelocity(
    [
      { x: 500, t: 100 },
      { x: 460, t: 120 },
      { x: 400, t: 150 },
    ],
    155,
  );
  assert.ok(leftFling > 1.5 && leftFling < 3.0);

  // Dragging finger right (x increases) produces negative scroll velocity (-)
  const rightFling = computeReleaseVelocity(
    [
      { x: 200, t: 100 },
      { x: 290, t: 145 },
    ],
    150,
  );
  assert.ok(rightFling < -1.5 && rightFling > -3.0);

  // Pausing finger > 85ms before lift returns 0 velocity
  const paused = computeReleaseVelocity(
    [
      { x: 500, t: 100 },
      { x: 300, t: 140 },
    ],
    260,
  );
  assert.equal(paused, 0);
});

test('stepCarouselPhysics exponential friction is framerate-invariant across 60Hz, 240Hz, and low-FPS steps', () => {
  const bounds = { maxScroll: 3000, dimension: 1000 };
  let stateSlow: CarouselPhysicsState = { offset: 200, velocity: 2.2, mode: 'momentum' };
  let stateFast: CarouselPhysicsState = { offset: 200, velocity: 2.2, mode: 'momentum' };
  let stateLowFps: CarouselPhysicsState = { offset: 200, velocity: 2.2, mode: 'momentum' };

  // Advance 128ms via 8 x 16ms, 32 x 4ms, and 2 x 64ms
  for (let i = 0; i < 8; i++) {
    stateSlow = stepCarouselPhysics(stateSlow, 16, bounds);
  }
  for (let i = 0; i < 32; i++) {
    stateFast = stepCarouselPhysics(stateFast, 4, bounds);
  }
  for (let i = 0; i < 2; i++) {
    stateLowFps = stepCarouselPhysics(stateLowFps, 64, bounds);
  }

  assert.equal(stateSlow.mode, 'momentum');
  assert.equal(stateFast.mode, 'momentum');
  assert.equal(stateLowFps.mode, 'momentum');
  assert.ok(Math.abs(stateSlow.offset - stateFast.offset) < 0.01);
  assert.ok(Math.abs(stateSlow.offset - stateLowFps.offset) < 0.01);
  assert.ok(Math.abs(stateSlow.velocity - stateFast.velocity) < 1e-6);
  assert.ok(Math.abs(stateSlow.velocity - stateLowFps.velocity) < 1e-6);
});

test('stepCarouselPhysics settles momentum cleanly to idle', () => {
  const bounds = { maxScroll: 4000, dimension: 1000 };
  let state: CarouselPhysicsState = { offset: 0, velocity: 1.5, mode: 'momentum' };

  for (let i = 0; i < 250; i++) {
    state = stepCarouselPhysics(state, 16, bounds);
    if (state.mode === 'idle') break;
  }

  assert.equal(state.mode, 'idle');
  assert.equal(state.velocity, 0);
  // Total travel of v0=1.5 with gamma=0.998 is roughly 1.5 / -ln(0.998) ~= 749px
  assert.ok(state.offset > 650 && state.offset < 800);
});

test('stepCarouselPhysics overshoots boundary with momentum then rubber-band springs back to bound', () => {
  const bounds = { maxScroll: 1200, dimension: 800 };
  let state: CarouselPhysicsState = { offset: 1150, velocity: 2.8, mode: 'momentum' };

  let peakOffset = state.offset;
  let sawSpringOvershoot = false;

  for (let i = 0; i < 120; i++) {
    state = stepCarouselPhysics(state, 16, bounds);
    if (state.offset > peakOffset) peakOffset = state.offset;
    if (state.mode === 'spring' && state.offset > bounds.maxScroll) {
      sawSpringOvershoot = true;
    }
    if (state.mode === 'idle') break;
  }

  assert.ok(sawSpringOvershoot, 'Expected carousel to rubber-band past maxScroll');
  assert.ok(peakOffset > bounds.maxScroll + 5 && peakOffset < bounds.maxScroll + 160);
  assert.equal(state.mode, 'idle');
  assert.equal(state.offset, bounds.maxScroll);
  assert.equal(state.velocity, 0);
});

test('stepCarouselPhysics springs back from manual left overscroll to 0', () => {
  const bounds = { maxScroll: 1200, dimension: 800 };
  let state: CarouselPhysicsState = { offset: -75, velocity: 0, mode: 'spring' };

  for (let i = 0; i < 100; i++) {
    state = stepCarouselPhysics(state, 16, bounds);
    assert.ok(state.offset <= 0.5, `Spring should not wildly overshoot 0 (got ${state.offset})`);
    if (state.mode === 'idle') break;
  }

  assert.equal(state.mode, 'idle');
  assert.equal(state.offset, 0);
  assert.equal(state.velocity, 0);
});

test('stepCarouselPhysics glide mode animates smoothly to targetOffset and respects reducedMotion', () => {
  const bounds = { maxScroll: 1500, dimension: 900 };
  let state: CarouselPhysicsState = {
    offset: 0,
    velocity: 0,
    mode: 'glide',
    targetOffset: 520,
  };

  for (let i = 0; i < 100; i++) {
    state = stepCarouselPhysics(state, 16, bounds);
    if (state.mode === 'idle') break;
  }

  assert.equal(state.mode, 'idle');
  assert.equal(state.offset, 520);

  const reduced = stepCarouselPhysics(
    { offset: 0, velocity: 0, mode: 'glide', targetOffset: 520 },
    16,
    { ...bounds, reducedMotion: true },
  );
  assert.equal(reduced.mode, 'idle');
  assert.equal(reduced.offset, 520);
});

test('computeFocusScrollOffset brings offscreen focused cards into view', () => {
  assert.equal(computeFocusScrollOffset(0, 16, 180, 900, 2000), 0);
  assert.equal(computeFocusScrollOffset(0, 850, 1020, 900, 2000, 20), 140);
  assert.equal(computeFocusScrollOffset(500, 420, 580, 900, 2000, 20), 400);
});

test('computeWheelScrollDelta handles horizontal trackpad and shift+wheel while ignoring vertical scroll', () => {
  assert.equal(computeWheelScrollDelta(0, 120, 0, false), null);
  assert.equal(computeWheelScrollDelta(42, 3, 0, false), 42);
  assert.equal(computeWheelScrollDelta(0, 3, 1, true), 120);
});

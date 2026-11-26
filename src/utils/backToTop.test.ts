import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BACK_TO_TOP_SCROLL_THRESHOLD_PX,
  resolveBackToTopPositionClass,
  resolveScrollToTopBehavior,
  shouldShowBackToTop,
} from './backToTop';

test('BACK_TO_TOP_SCROLL_THRESHOLD_PX defaults to 750 (within 700-800px)', () => {
  assert.equal(BACK_TO_TOP_SCROLL_THRESHOLD_PX, 750);
});

test('shouldShowBackToTop triggers at >= 750px threshold and rejects non-finite values', () => {
  assert.equal(shouldShowBackToTop(0), false);
  assert.equal(shouldShowBackToTop(500), false);
  assert.equal(shouldShowBackToTop(700), false);
  assert.equal(shouldShowBackToTop(749), false);
  assert.equal(shouldShowBackToTop(750), true);
  assert.equal(shouldShowBackToTop(800), true);
  assert.equal(shouldShowBackToTop(1400), true);
  assert.equal(shouldShowBackToTop(Number.NaN), false);
  assert.equal(shouldShowBackToTop(Number.POSITIVE_INFINITY), false);
});

test('resolveScrollToTopBehavior uses auto for battery saver or reduced motion and smooth otherwise', () => {
  assert.equal(resolveScrollToTopBehavior(false, false), 'smooth');
  assert.equal(resolveScrollToTopBehavior(true, false), 'auto');
  assert.equal(resolveScrollToTopBehavior(false, true), 'auto');
  assert.equal(resolveScrollToTopBehavior(true, true), 'auto');
});

test('resolveBackToTopPositionClass clears mobile nav, online hub dock, reader footer, details pill, and PiP', () => {
  const homeClass = resolveBackToTopPositionClass({ pathname: '/home' });
  assert.match(homeClass, /right-4 sm:right-6/);
  assert.match(homeClass, /bottom-\[calc\(6rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(homeClass, /md:bottom-6/);

  const tvClass = resolveBackToTopPositionClass({ pathname: '/home', isTvMode: true });
  assert.match(tvClass, /bottom-6/);
  assert.doesNotMatch(tvClass, /6rem/);

  const onlineClass = resolveBackToTopPositionClass({ pathname: '/watch-together' });
  assert.match(onlineClass, /10rem/);

  const detailsClass = resolveBackToTopPositionClass({ pathname: '/details/ANIME/21' });
  assert.match(detailsClass, /6\.25rem/);
  assert.match(detailsClass, /md:bottom-6/);

  const readerClass = resolveBackToTopPositionClass({ pathname: '/reader' });
  assert.match(readerClass, /4\.75rem/);

  const pipClass = resolveBackToTopPositionClass({ pathname: '/discover', pipAtBottomRight: true });
  assert.match(pipClass, /md:bottom-\[13\.75rem\]/);
});

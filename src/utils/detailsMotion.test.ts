import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDetailsTabDirection,
  getDetailsTabIndex,
  getDetailsTabTransitionClass,
  getEpisodeBadgeTransitionClass,
  getEpisodeChangeDirection,
  hasScrolledPastHero,
  shouldShowDetailsStickyHeader,
} from './detailsMotion';

test('getDetailsTabIndex orders info, watch, and comments sequentially', () => {
  assert.equal(getDetailsTabIndex('info'), 0);
  assert.equal(getDetailsTabIndex('watch'), 1);
  assert.equal(getDetailsTabIndex('comments'), 2);
});

test('getDetailsTabDirection resolves forward, backward, and none cleanly', () => {
  assert.equal(getDetailsTabDirection(null, 'info'), 'none');
  assert.equal(getDetailsTabDirection('info', 'info'), 'none');
  assert.equal(getDetailsTabDirection('info', 'watch'), 'forward');
  assert.equal(getDetailsTabDirection('watch', 'comments'), 'forward');
  assert.equal(getDetailsTabDirection('comments', 'watch'), 'backward');
  assert.equal(getDetailsTabDirection('watch', 'info'), 'backward');
});

test('getDetailsTabTransitionClass returns the matching CSS animation class', () => {
  assert.equal(getDetailsTabTransitionClass('forward'), 'sx-details-tab-forward');
  assert.equal(getDetailsTabTransitionClass('backward'), 'sx-details-tab-backward');
  assert.equal(getDetailsTabTransitionClass('none'), 'sx-details-tab-enter');
});

test('getEpisodeChangeDirection and badge classes reflect episode stepping', () => {
  assert.equal(getEpisodeChangeDirection(null, 0), 'none');
  assert.equal(getEpisodeChangeDirection(2, 2), 'none');
  assert.equal(getEpisodeChangeDirection(0, 1), 'next');
  assert.equal(getEpisodeChangeDirection(3, 1), 'prev');

  assert.equal(getEpisodeBadgeTransitionClass('next'), 'sx-ep-badge-next');
  assert.equal(getEpisodeBadgeTransitionClass('prev'), 'sx-ep-badge-prev');
  assert.equal(getEpisodeBadgeTransitionClass('none'), '');
});

test('hasScrolledPastHero triggers only once scrolled past hero bottom edge', () => {
  assert.equal(hasScrolledPastHero({ scrollY: 0, heroBottom: 320 }), false);
  assert.equal(hasScrolledPastHero({ scrollY: 0, heroBottom: 0 }), false);
  assert.equal(hasScrolledPastHero({ scrollY: 100, heroBottom: 180 }), false);
  assert.equal(hasScrolledPastHero({ scrollY: 260, heroBottom: 24 }), false);
  assert.equal(hasScrolledPastHero({ scrollY: 320, heroBottom: 16 }), true);
  assert.equal(hasScrolledPastHero({ scrollY: 640, heroBottom: -280 }), true);
  assert.equal(hasScrolledPastHero({ scrollY: 500, heroBottom: null }), false);
});

test('shouldShowDetailsStickyHeader never triggers in watch section', () => {
  assert.equal(
    shouldShowDetailsStickyHeader({ activeTab: 'watch', scrollY: 640, heroBottom: -280 }),
    false,
  );
  assert.equal(
    shouldShowDetailsStickyHeader({ activeTab: 'info', scrollY: 640, heroBottom: -280 }),
    true,
  );
  assert.equal(
    shouldShowDetailsStickyHeader({ activeTab: 'comments', scrollY: 480, heroBottom: -120 }),
    true,
  );
  assert.equal(
    shouldShowDetailsStickyHeader({ activeTab: 'info', scrollY: 40, heroBottom: 240 }),
    false,
  );
});


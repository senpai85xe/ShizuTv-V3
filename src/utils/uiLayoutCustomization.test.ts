import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyGlobalUiScaleToDocument,
  clampBorderRoundness,
  clampFontScale,
  clampWidgetScale,
  formatScalePercent,
  getActiveOptionPosition,
  getCustomizeActiveSummary,
  getHomeHeaderStyleDescription,
  getMediaCardStyleDescription,
  getNavBarStyleDescription,
  getSortedUiCustomizeCategories,
  HOME_HEADER_STYLE_OPTIONS,
  resolveHomeHeaderStyle,
} from './uiLayoutCustomization';

test('UI customize categories reflect updated option counts across all 7 categories', () => {
  const categories = getSortedUiCustomizeCategories();
  assert.equal(categories.length, 7);
  assert.deepEqual(
    categories.map((c) => c.id),
    [
      'cardStyle',
      'continueStyle',
      'heroBannerStyle',
      'episodeChapterStyle',
      'navBarStyle',
      'homeHeaderStyle',
      'genreCardStyle',
    ],
  );
  const countMap = Object.fromEntries(categories.map((c) => [c.id, c.optionCount]));
  assert.equal(countMap.cardStyle, 12);
  assert.equal(countMap.continueStyle, 5);
  assert.equal(countMap.heroBannerStyle, 12);
  assert.equal(countMap.episodeChapterStyle, 5);
  assert.equal(countMap.navBarStyle, 10);
  assert.equal(countMap.homeHeaderStyle, 7);
  assert.equal(countMap.genreCardStyle, 5);
});

test('HOME_HEADER_STYLE_OPTIONS removes Prominent/Docked/Material/ShizuTv and adds 3 new styles (7 total)', () => {
  assert.equal(HOME_HEADER_STYLE_OPTIONS.length, 7);
  const ids = HOME_HEADER_STYLE_OPTIONS.map((opt) => opt.id);
  for (const removed of ['prominent', 'docked', 'material', 'shizutv']) {
    assert.equal(ids.includes(removed as never), false);
  }
  assert.ok(ids.includes('classic'));
  assert.ok(ids.includes('minimal'));
  assert.ok(ids.includes('clean'));
  assert.ok(ids.includes('cleanWave'));
  assert.ok(ids.includes('glassIsland'));
  assert.ok(ids.includes('auroraHeader'));
  assert.ok(ids.includes('floatingDock'));
  assert.equal(resolveHomeHeaderStyle('prominent'), 'cleanWave');
  assert.equal(resolveHomeHeaderStyle('glassIsland'), 'glassIsland');
  for (const opt of HOME_HEADER_STYLE_OPTIONS) {
    assert.ok(opt.label.trim().length > 0);
    assert.ok(opt.description.trim().length > 0);
  }
});

test('getCustomizeActiveSummary formats active values for updated styles', () => {
  const prefs = {
    cardStyle: 'glassPoster' as const,
    continueWatchingStyle: 'episodeTile' as const,
    continueReadingStyle: 'posterBar' as const,
    heroBannerStyle: 'liquidGlass',
    episodeChapterStyle: 'grid',
    navBarStyle: 'liquidPill' as const,
    homeHeaderStyle: 'glassIsland' as const,
    genreCardStyle: 'showcase' as const,
  };

  assert.equal(getCustomizeActiveSummary('cardStyle', prefs), 'Liquid Glass');
  assert.equal(
    getCustomizeActiveSummary('continueStyle', prefs),
    'Episode Tile / Poster Dock',
  );
  assert.equal(
    getCustomizeActiveSummary('continueStyle', {
      ...prefs,
      continueReadingStyle: 'episodeTile',
    }),
    'Episode Tile',
  );
  assert.equal(getCustomizeActiveSummary('heroBannerStyle', prefs), 'Liquid Glass');
  assert.equal(
    getCustomizeActiveSummary('heroBannerStyle', { ...prefs, heroBannerStyle: 'rankedDeck' }),
    'Ranked Deck',
  );
  assert.equal(
    getCustomizeActiveSummary('heroBannerStyle', { ...prefs, heroBannerStyle: 'glassFrame' }),
    'Glass Frame',
  );
  assert.equal(
    getCustomizeActiveSummary('heroBannerStyle', { ...prefs, heroBannerStyle: 'prismCoverflow' }),
    'Stage Coverflow',
  );
  assert.equal(getCustomizeActiveSummary('episodeChapterStyle', prefs), 'Grid');
  assert.equal(getCustomizeActiveSummary('navBarStyle', prefs), 'Liquid Pill');
  assert.equal(getCustomizeActiveSummary('homeHeaderStyle', prefs), 'Glass Island');
  assert.equal(getCustomizeActiveSummary('genreCardStyle', prefs), 'Category Spotlight');
  assert.equal(
    getCustomizeActiveSummary('genreCardStyle', { ...prefs, genreCardStyle: 'mosaicGlass' }),
    'Poster Mosaic',
  );
  assert.equal(
    getCustomizeActiveSummary('genreCardStyle', { ...prefs, genreCardStyle: 'editorialPill' }),
    'Editorial Pill',
  );
  assert.equal(
    getCustomizeActiveSummary('genreCardStyle', { ...prefs, genreCardStyle: 'auroraStack' }),
    'Aurora Glass',
  );
  assert.equal(
    getCustomizeActiveSummary('genreCardStyle', { ...prefs, genreCardStyle: 'classic' }),
    'Gradient Tile',
  );
});

test('getActiveOptionPosition and style description lookups return accurate slider metadata', () => {
  assert.deepEqual(getActiveOptionPosition(HOME_HEADER_STYLE_OPTIONS, 'cleanWave'), {
    current: 4,
    total: 7,
  });
  assert.deepEqual(getActiveOptionPosition(HOME_HEADER_STYLE_OPTIONS, 'classic'), {
    current: 1,
    total: 7,
  });
  assert.ok(getMediaCardStyleDescription('glassPoster').length > 0);
  assert.ok(getNavBarStyleDescription('liquidPill').length > 0);
  assert.ok(getHomeHeaderStyleDescription('floatingDock').length > 0);
});

test('Global UI Customization helpers clamp roundness/scales and apply CSS vars to document root', () => {
  assert.equal(clampBorderRoundness(2), 4);
  assert.equal(clampBorderRoundness(36), 28);
  assert.equal(clampBorderRoundness(18.4), 18);

  assert.equal(clampFontScale(0.5), 0.85);
  assert.equal(clampFontScale(1.6), 1.2);
  assert.equal(clampFontScale(1.1), 1.1);

  assert.equal(clampWidgetScale(0.4), 0.85);
  assert.equal(clampWidgetScale(1.5), 1.15);
  assert.equal(clampWidgetScale(0.95), 0.95);
  assert.equal(formatScalePercent(1.15), '115%');

  const props: Record<string, string> = {};
  const mockRoot = {
    style: {
      fontSize: '',
      setProperty: (key: string, val: string) => {
        props[key] = val;
      },
    },
  } as unknown as HTMLElement;

  const applied = applyGlobalUiScaleToDocument(mockRoot, 1.1, 0.95);
  assert.deepEqual(applied, { fontScale: 1.1, widgetScale: 0.95 });
  assert.equal(props['--sx-font-scale'], '1.1');
  assert.equal(props['--sx-widget-scale'], '0.95');
  assert.equal(mockRoot.style.fontSize, '110%');
});

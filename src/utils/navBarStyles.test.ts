import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getNavBarStyleLabel,
  isGlassPillNavStyle,
  isIconOnlyNavStyle,
  NAV_BAR_STYLE_OPTIONS,
  resolveNavBarStyle,
  shouldShowActiveMobileNavLabel,
  shouldShowAllMobileNavLabels,
} from './navBarStyles';

test('NAV_BAR_STYLE_OPTIONS removes minimal and includes the 4 new nav presets (10 total)', () => {
  const ids = NAV_BAR_STYLE_OPTIONS.map((o) => o.id);
  assert.equal(NAV_BAR_STYLE_OPTIONS.length, 10);
  assert.equal(ids.includes('minimal' as never), false);
  assert.ok(ids.includes('glassIcons'));
  assert.ok(ids.includes('glassLabeled'));
  assert.ok(ids.includes('liquidPill'));
  assert.ok(ids.includes('crystalRail'));
  assert.ok(ids.includes('ambientGlow'));
  assert.ok(ids.includes('compactCapsule'));
});

test('resolveNavBarStyle falls back cleanly from removed minimal to glassLabeled', () => {
  assert.equal(resolveNavBarStyle('minimal'), 'glassLabeled');
  assert.equal(resolveNavBarStyle(null), 'glassLabeled');
  assert.equal(resolveNavBarStyle('liquidPill'), 'liquidPill');
});

test('isGlassPillNavStyle identifies glass pill capsule nav styles', () => {
  assert.equal(isGlassPillNavStyle('glassIcons'), true);
  assert.equal(isGlassPillNavStyle('glassLabeled'), true);
  assert.equal(isGlassPillNavStyle('liquidPill'), true);
  assert.equal(isGlassPillNavStyle('compactCapsule'), true);
  assert.equal(isGlassPillNavStyle('frosted'), false);
  assert.equal(isGlassPillNavStyle('classic'), false);
  assert.equal(isGlassPillNavStyle('docked'), false);
  assert.equal(isGlassPillNavStyle('crystalRail'), false);
});

test('icon-only vs labeled visibility rules behave as requested', () => {
  assert.equal(isIconOnlyNavStyle('glassIcons'), true);
  assert.equal(isIconOnlyNavStyle('glassLabeled'), false);
  assert.equal(shouldShowAllMobileNavLabels('glassLabeled'), true);
  assert.equal(shouldShowAllMobileNavLabels('liquidPill'), true);
  assert.equal(shouldShowAllMobileNavLabels('glassIcons'), false);

  // glassIcons: never show text labels even when active
  assert.equal(shouldShowActiveMobileNavLabel('glassIcons', true), false);
  assert.equal(shouldShowActiveMobileNavLabel('glassIcons', false), false);

  // glassLabeled & liquidPill: always show text labels for both active and inactive items
  assert.equal(shouldShowActiveMobileNavLabel('glassLabeled', true), true);
  assert.equal(shouldShowActiveMobileNavLabel('glassLabeled', false), true);
  assert.equal(shouldShowActiveMobileNavLabel('liquidPill', false), true);

  // existing & capsule styles keep active-only label on mobile
  assert.equal(shouldShowActiveMobileNavLabel('frosted', true), true);
  assert.equal(shouldShowActiveMobileNavLabel('frosted', false), false);
  assert.equal(shouldShowActiveMobileNavLabel('compactCapsule', true), true);
  assert.equal(shouldShowActiveMobileNavLabel('compactCapsule', false), false);
});

test('getNavBarStyleLabel returns readable names for all presets', () => {
  assert.equal(getNavBarStyleLabel('glassIcons'), 'Glass Icons');
  assert.equal(getNavBarStyleLabel('glassLabeled'), 'Glass Labeled');
  assert.equal(getNavBarStyleLabel('liquidPill'), 'Liquid Pill');
  assert.equal(getNavBarStyleLabel('crystalRail'), 'Crystal Rail');
  assert.equal(getNavBarStyleLabel('ambientGlow'), 'Ambient Glow');
  assert.equal(getNavBarStyleLabel('compactCapsule'), 'Compact Capsule');
});

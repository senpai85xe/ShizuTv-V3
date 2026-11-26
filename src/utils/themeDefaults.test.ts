import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyThemeToDocument,
  createDefaultThemePrefs,
  DEFAULT_EXCLUSIVE_SCHEME,
  DEFAULT_GRADIENT_INTENSITY,
  DEFAULT_GRADIENT_STYLE,
  DEFAULT_THEME_MODE,
  DEFAULT_UI_ROUNDNESS,
  resolveSchemePalette,
  shouldOpenProfileSheet,
} from './themeDefaults';

test('shouldOpenProfileSheet returns true for clean, cleanWave, glassIsland, and floatingDock headers', () => {
  assert.equal(shouldOpenProfileSheet('clean'), true);
  assert.equal(shouldOpenProfileSheet('cleanWave'), true);
  assert.equal(shouldOpenProfileSheet('glassIsland'), true);
  assert.equal(shouldOpenProfileSheet('floatingDock'), true);
  assert.equal(shouldOpenProfileSheet('classic'), false);
  assert.equal(shouldOpenProfileSheet('minimal'), false);
  assert.equal(shouldOpenProfileSheet('auroraHeader'), false);
});

test('default theme prefs use Metallic Black, system mode, 24px roundness, linear gradient at 75%', () => {
  const defaults = createDefaultThemePrefs();
  assert.equal(defaults.exclusiveScheme, 'metallic_black');
  assert.equal(defaults.themeMode, 'system');
  assert.equal(defaults.uiRoundness, 24);
  assert.equal(defaults.gradientStyle, 'linear');
  assert.equal(defaults.gradientIntensity, 0.75);
  assert.equal(defaults.useGradients, true);
  assert.equal(defaults.useAmoled, false);
  assert.equal(defaults.useNoiseOverlay, false);
  assert.equal(defaults.activePresetId, null);
});

test('exported default constants match expected values', () => {
  assert.equal(DEFAULT_THEME_MODE, 'system');
  assert.equal(DEFAULT_EXCLUSIVE_SCHEME, 'metallic_black');
  assert.equal(DEFAULT_UI_ROUNDNESS, 24);
  assert.equal(DEFAULT_GRADIENT_STYLE, 'linear');
  assert.equal(DEFAULT_GRADIENT_INTENSITY, 0.75);
});

test('resolveSchemePalette resolves Metallic Black light and dark palettes and falls back cleanly', () => {
  const light = resolveSchemePalette('metallic_black', false);
  assert.equal(light.primary, '#1E1E1E');
  assert.equal(light.primaryContainer, '#E0E0E0');
  assert.equal(light.secondary, '#424242');
  assert.equal(light.tertiary, '#00E5FF');

  const dark = resolveSchemePalette('metallic_black', true);
  assert.equal(dark.primary, '#E0E0E0');
  assert.equal(dark.tertiary, '#00E5FF');

  const fallback = resolveSchemePalette('nonexistent_scheme', false);
  assert.deepEqual(fallback, light);
});

test('applyThemeToDocument sets --sx-player-accent from the active theme scheme without hardcoded yellow', () => {
  const props: Record<string, string> = {};
  const classes = new Set<string>();
  const mockRoot = {
    classList: {
      toggle: (name: string, force?: boolean) => {
        if (force) classes.add(name);
        else classes.delete(name);
        return Boolean(force);
      },
    },
    style: {
      setProperty: (key: string, val: string) => {
        props[key] = val;
      },
    },
  } as unknown as HTMLElement;

  const prefs = { ...createDefaultThemePrefs(), exclusiveScheme: 'netflix', themeMode: 'light' as const };
  const isDark = applyThemeToDocument(mockRoot, prefs, false);
  assert.equal(isDark, false);
  const netflixDarkPrimary = resolveSchemePalette('netflix', true).primary;
  assert.equal(props['--sx-player-accent'], netflixDarkPrimary);
  assert.equal(props['--sx-player-on-accent'], '#ffffff');
});


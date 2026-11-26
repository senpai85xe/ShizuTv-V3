import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFallbackEpisodesCount } from '../services/sourceEngine';
import {
  buildHlsQualityOptions,
  buildSelectableAudioOptions,
  buildSubtitleBoxCssProps,
  clampAutoSkipDestination,
  clampEpisodeIndex,
  computeAutoSkipTarget,
  computeFullscreenRotationStage,
  DEFAULT_AMBIENT_ENABLED,
  DEFAULT_AUTO_PIP_ENABLED,
  DEFAULT_SUBTITLE_ANIMATION,
  DEFAULT_SUBTITLE_BACKGROUND,
  DEFAULT_SUBTITLE_PREVIEW_TEXT,
  DEFAULT_SUBTITLE_SIZE,
  findActiveSubtitleCue,
  formatQualityLabel,
  formatScrubberPercent,
  getCommentsScopeKey,
  getEffectiveDurationSeconds,
  getEpisodeNavigationState,
  getManualSkipInterval,
  getNextVideoFitMode,
  getVideoFitBadgeLabel,
  getVideoFitClass,
  parseSubtitleSegments,
  parseSubtitleText,
  PLAYBACK_SPEED_OPTIONS,
  resolveAudioLanguageOption,
  resolveAvailableAudioOptions,
  resolveBatterySaverHlsLevel,
  resolveEffectiveStreamQuality,
  resolvePersistedSubtitleLang,
  resolvePreferredAudioForSource,
  resolvePreferredHlsLevel,
  resolvePreferredVideoServer,
  sanitizeAudioLanguageCode,
  shouldAutoMatchAudioForServerChange,
  shouldAutoStartPlayback,
  shouldHideBarsForOverlay,
  shouldShowFullscreenControls,
  stripSubtitleTags,
} from './inlinePlayer';

test('clampEpisodeIndex clamps negative, NaN, and overflowing indices safely', () => {
  assert.equal(clampEpisodeIndex(-3, 12), 0);
  assert.equal(clampEpisodeIndex(15, 12), 11);
  assert.equal(clampEpisodeIndex(4, 12), 4);
  assert.equal(clampEpisodeIndex(Number.NaN, 12), 0);
  assert.equal(clampEpisodeIndex(2, 0), 0);
});

test('getEpisodeNavigationState resolves prev and next episode bounds accurately', () => {
  assert.deepEqual(getEpisodeNavigationState(0, 12), {
    hasPrev: false,
    hasNext: true,
    prevIndex: 0,
    nextIndex: 1,
  });
  assert.deepEqual(getEpisodeNavigationState(5, 12), {
    hasPrev: true,
    hasNext: true,
    prevIndex: 4,
    nextIndex: 6,
  });
  assert.deepEqual(getEpisodeNavigationState(11, 12), {
    hasPrev: true,
    hasNext: false,
    prevIndex: 10,
    nextIndex: 11,
  });
  assert.deepEqual(getEpisodeNavigationState(0, 1), {
    hasPrev: false,
    hasNext: false,
    prevIndex: 0,
    nextIndex: 0,
  });
});

test('formatScrubberPercent bounds percentage cleanly between 0 and 100', () => {
  assert.equal(formatScrubberPercent(0, 1435), 0);
  assert.equal(Math.round(formatScrubberPercent(705, 1435)), 49);
  assert.equal(formatScrubberPercent(2000, 1435), 100);
  assert.equal(formatScrubberPercent(10, 0), 0);
});

test('getEffectiveDurationSeconds prefers loaded video duration, then episode/media fallbacks', () => {
  assert.equal(getEffectiveDurationSeconds(1435, 1440, 24), 1435);
  assert.equal(getEffectiveDurationSeconds(0, 1380, 24), 1380);
  assert.equal(getEffectiveDurationSeconds(Number.NaN, undefined, 25), 1500);
  assert.equal(getEffectiveDurationSeconds(0, undefined, undefined), 1440);
});

test('computeAutoSkipTarget skips op/ed/recap/mixed segments and hides manual skip button when auto-skip is enabled', () => {
  const intervals = [
    { startTime: 0, endTime: 45, skipType: 'recap' },
    { startTime: 90, endTime: 180, skipType: 'op' },
    { startTime: 240, endTime: 300, skipType: 'mixed-op' },
    { startTime: 1320, endTime: 1410, skipType: 'ed' },
  ];
  assert.equal(computeAutoSkipTarget(12, intervals, false), null);
  assert.equal(computeAutoSkipTarget(12, intervals, true), 45);
  assert.equal(computeAutoSkipTarget(95, intervals, true), 180);
  assert.equal(computeAutoSkipTarget(250, intervals, { autoSkipOp: true, autoSkipEd: false }), 300);
  assert.equal(computeAutoSkipTarget(500, intervals, true), null);
  assert.equal(computeAutoSkipTarget(1350, intervals, true), 1410);
  assert.equal(computeAutoSkipTarget(1350, intervals, { autoSkipOp: true, autoSkipEd: false }), null);

  // Manual skip button is suppressed when auto-skip is enabled for that interval type
  assert.equal(getManualSkipInterval(12, intervals, true), undefined);
  assert.equal(getManualSkipInterval(12, intervals, false)?.skipType, 'recap');
  assert.equal(
    getManualSkipInterval(1350, intervals, { autoSkipOp: true, autoSkipEd: false })?.skipType,
    'ed',
  );
  assert.equal(clampAutoSkipDestination(1410, 1405), 1404.75);
});

test('shouldAutoStartPlayback keeps playback paused when autoPlayPref is false unless explicitly triggered', () => {
  assert.equal(shouldAutoStartPlayback(false, false), false);
  assert.equal(shouldAutoStartPlayback(true, false), true);
  assert.equal(shouldAutoStartPlayback(false, true), true);
});

test('getVideoFitClass maps fit modes to proper CSS object-fit classes', () => {
  assert.equal(getVideoFitClass('contain'), 'object-contain');
  assert.equal(getVideoFitClass('cover'), 'object-cover');
  assert.equal(getVideoFitClass('fill'), 'object-fill');
});

test('buildHlsQualityOptions and resolvePreferredHlsLevel format and select resolutions accurately', () => {
  const levels = [
    { height: 360, bitrate: 800_000 },
    { height: 720, bitrate: 2_500_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(formatQualityLabel(1080, 5_000_000), '1080p');
  const opts = buildHlsQualityOptions(levels);
  assert.deepEqual(
    opts.map((o) => ({ index: o.index, label: o.label })),
    [
      { index: -1, label: 'Auto' },
      { index: 2, label: '1080p' },
      { index: 1, label: '720p' },
      { index: 0, label: '360p' },
    ],
  );
  assert.equal(resolvePreferredHlsLevel(levels, 'auto'), -1);
  assert.equal(resolvePreferredHlsLevel(levels, '720p'), 1);
  assert.equal(resolvePreferredHlsLevel(levels, '1080p'), 2);
});

test('findActiveSubtitleCue respects timing offset and parseSubtitleText parses SRT/VTT', () => {
  const cues = parseSubtitleText(`WEBVTT

1
00:00:02.000 --> 00:00:06.000
Hello world

2
00:00:08,000 --> 00:00:12,000
Second line`);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'Hello world');
  assert.equal(cues[1].start, 8);
  assert.equal(findActiveSubtitleCue(cues, 3, 0)?.text, 'Hello world');
  // +2s offset delays the subtitle so at t=3 it has not appeared yet, while at t=5 it shows
  assert.equal(findActiveSubtitleCue(cues, 3, 2), null);
  assert.equal(findActiveSubtitleCue(cues, 5, 2)?.text, 'Hello world');
});

test('resolveFallbackEpisodesCount preserves full counts beyond 100 episodes', () => {
  assert.equal(resolveFallbackEpisodesCount({ episodes: 220, nextEpisode: null }), 220);
  assert.equal(resolveFallbackEpisodesCount({ episodes: null, nextEpisode: 1123 }), 1122);
  assert.equal(resolveFallbackEpisodesCount({ episodes: 500, nextEpisode: 12 }), 500);
  assert.equal(resolveFallbackEpisodesCount({ episodes: null, nextEpisode: null }), 12);
});

test('fullscreen helpers resolve audio languages, comment scope keys, lock visibility, and OFF defaults', () => {
  assert.equal(DEFAULT_AMBIENT_ENABLED, false);
  assert.equal(DEFAULT_AUTO_PIP_ENABLED, false);
  assert.equal(DEFAULT_SUBTITLE_SIZE, 13);
  assert.equal(DEFAULT_SUBTITLE_BACKGROUND, false);
  assert.equal(DEFAULT_SUBTITLE_ANIMATION, false);
  assert.equal(DEFAULT_SUBTITLE_PREVIEW_TEXT, 'Welcome to our app');

  assert.equal(resolveAudioLanguageOption('hi').shortLabel, 'HI');
  assert.equal(resolveAudioLanguageOption('hi').serverCategory, 'dub');
  assert.equal(resolveAudioLanguageOption('unknown').code, 'ja');

  assert.equal(getCommentsScopeKey('21', 'episode', 5), '21::ep::5');
  assert.equal(getCommentsScopeKey('21', 'series', 5), '21');

  assert.equal(
    shouldShowFullscreenControls({ isLocked: true, controlsVisible: true, hasActiveOverlay: true }),
    false,
  );
  assert.equal(
    shouldShowFullscreenControls({ isLocked: false, controlsVisible: false, hasActiveOverlay: true }),
    true,
  );

  assert.deepEqual(
    shouldHideBarsForOverlay({
      showCommentsModal: false,
      showEpisodeDrawer: false,
      showSettingsMenu: false,
      showSpeedMenu: true,
      showAudioLangMenu: false,
    }),
    { hideBottomBar: false, hideCenterCluster: true },
  );
  assert.deepEqual(
    shouldHideBarsForOverlay({
      showCommentsModal: false,
      showEpisodeDrawer: true,
      showSettingsMenu: false,
      showSpeedMenu: false,
      showAudioLangMenu: false,
    }),
    { hideBottomBar: true, hideCenterCluster: true },
  );

  assert.equal(getNextVideoFitMode('contain'), 'cover');
  assert.equal(getNextVideoFitMode('cover'), 'fill');
  assert.equal(getNextVideoFitMode('fill'), 'contain');
  assert.equal(getVideoFitBadgeLabel('contain'), 'Fit');
  assert.equal(getVideoFitBadgeLabel('cover'), 'Zoom');
  assert.equal(getVideoFitBadgeLabel('fill'), 'Fill');
  assert.ok(PLAYBACK_SPEED_OPTIONS.includes(1) && PLAYBACK_SPEED_OPTIONS.includes(2));

  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: true,
      isRotated: true,
      viewportWidth: 390,
      viewportHeight: 844,
      nativeOrientationLandscape: false,
    }),
    { cssRotated: true, stageWidthPx: 844, stageHeightPx: 390 },
  );
  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: true,
      isRotated: true,
      viewportWidth: 844,
      viewportHeight: 390,
      nativeOrientationLandscape: true,
    }),
    { cssRotated: false, stageWidthPx: 844, stageHeightPx: 390 },
  );
  assert.deepEqual(
    computeFullscreenRotationStage({
      isFullscreen: false,
      isRotated: false,
      viewportWidth: 390,
      viewportHeight: 844,
      nativeOrientationLandscape: false,
    }),
    { cssRotated: false },
  );
});

test('Battery Saver caps stream quality and selects <=480p HLS levels', () => {
  assert.equal(resolveEffectiveStreamQuality('1080p', false), '1080p');
  assert.equal(resolveEffectiveStreamQuality('auto', false), 'auto');
  assert.equal(resolveEffectiveStreamQuality('1080p', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('720p', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('auto', true), '480p');
  assert.equal(resolveEffectiveStreamQuality('360p', true), '360p');

  const levels = [
    { height: 360, bitrate: 700_000 },
    { height: 480, bitrate: 1_200_000 },
    { height: 720, bitrate: 2_600_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(resolveBatterySaverHlsLevel(levels, '1080p', false), 3);
  assert.equal(resolveBatterySaverHlsLevel(levels, '1080p', true), 1);
  assert.equal(resolveBatterySaverHlsLevel(levels, 'auto', true), 1);
  assert.equal(resolveBatterySaverHlsLevel(levels, '360p', true), 0);

  const highOnlyLevels = [
    { height: 720, bitrate: 2_600_000 },
    { height: 1080, bitrate: 5_000_000 },
  ];
  assert.equal(resolveBatterySaverHlsLevel(highOnlyLevels, '1080p', true), 0);
});

test('parseSubtitleText cleans VTT blocks/ASS tags/entities and parseSubtitleSegments preserves italics', () => {
  const vtt = `WEBVTT
Kind: captions

NOTE Ignore this block

STYLE
::cue { color: yellow; }

1
00:00:05.000 --> 00:00:08.500 align:center
<i>It all began</i> &amp; more

2
00:00:06.000 --> 00:00:08.000
{\\an8}<c.yellow>HERO SIGN</c>
`;
  const cues = parseSubtitleText(vtt);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, '<i>It all began</i> & more');
  assert.equal(cues[1].text, 'HERO SIGN');
  assert.equal(stripSubtitleTags(cues[0].text), 'It all began & more');

  const segments = parseSubtitleSegments(cues[0].text);
  assert.deepEqual(segments, [
    { text: 'It all began', italic: true, bold: false, underline: false },
    { text: ' & more', italic: false, bold: false, underline: false },
  ]);

  const activeMerged = findActiveSubtitleCue(cues, 6.5, 0);
  assert.equal(activeMerged?.text, '<i>It all began</i> & more\nHERO SIGN');
});

test('resolveAvailableAudioOptions returns only source-confirmed tracks and falls back safely', () => {
  const subOnly = resolveAvailableAudioOptions(undefined);
  assert.deepEqual(subOnly.map((a) => a.code), ['ja']);

  const subAndDub = resolveAvailableAudioOptions([
    { code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' },
    { code: 'en', shortLabel: 'EN', label: 'English (Dub)', serverCategory: 'dub' },
  ]);
  assert.deepEqual(subAndDub.map((a) => a.code), ['ja', 'en']);
  assert.equal(resolveAudioLanguageOption('hi', subAndDub).code, 'ja');
  assert.equal(resolveAudioLanguageOption('en', subAndDub).code, 'en');
});

test('buildSubtitleBoxCssProps applies font family, weight, edge style, and opacity', () => {
  const css = buildSubtitleBoxCssProps(
    {
      subtitleColor: '#67e8f9',
      subtitleBackground: true,
      subtitleBgOpacity: 50,
      subtitleFontFamily: 'rounded',
      subtitleFontWeight: 'extrabold',
      subtitleEdgeStyle: 'outline',
    },
    22,
  );
  assert.equal(css.fontSize, '22px');
  assert.equal(css.color, '#67e8f9');
  assert.equal(css.fontWeight, 800);
  assert.equal(css.backgroundColor, 'rgba(0, 0, 0, 0.50)');
  assert.ok(css.fontFamily.includes('ui-rounded'));
  assert.ok(css.textShadow.includes('-1px -1px 0'));
});

test('buildSelectableAudioOptions exposes only languages confirmed or inherent to the active source', () => {
  // When stream metadata reports only Japanese + Hindi (e.g. Hindi source with Japanese fallback)
  const resolvedSubset = buildSelectableAudioOptions(
    [{ code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' }],
    'hi',
  );
  assert.deepEqual(
    resolvedSubset.map((o) => o.code),
    ['ja', 'hi'],
  );
  assert.equal(resolvedSubset.every((o) => o.confirmed), true);

  // When stream reports sub + dub on inbuilt source, only JP & EN are shown (no Hindi/Spanish)
  const subAndDubOnly = buildSelectableAudioOptions(
    [
      { code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' },
      { code: 'en', shortLabel: 'EN', label: 'English (Dub)', serverCategory: 'dub' },
    ],
    'en',
  );
  assert.deepEqual(
    subAndDubOnly.map((o) => o.code),
    ['ja', 'en'],
  );

  // Before stream resolves on a Hindi extension, only Hindi is shown
  const hindiPreload = buildSelectableAudioOptions(null, 'hi');
  assert.deepEqual(
    hindiPreload.map((o) => o.code),
    ['hi'],
  );
  assert.equal(hindiPreload[0].confirmed, true);

  // Before stream resolves on an English/multi source, JP & EN are available without false Hindi/Spanish
  const englishPreload = buildSelectableAudioOptions(undefined, 'en');
  assert.deepEqual(
    englishPreload.map((o) => o.code),
    ['ja', 'en'],
  );
  assert.equal(englishPreload.every((o) => !o.confirmed), true);
});

test('resolvePreferredAudioForSource aligns audio when switching sources and prevents stale Hindi on ShizuTv', () => {
  // Switching to Hindi extension auto-selects Hindi even if user had English/Japanese active
  assert.equal(
    resolvePreferredAudioForSource({
      currentAudioLang: 'en',
      sourceLang: 'hi',
      sourceName: 'AnimeHindiWorld',
    }),
    'hi',
  );

  // Switching to source with Hindi in name even when sourceLang metadata says multi
  assert.equal(
    resolvePreferredAudioForSource({
      currentAudioLang: 'ja',
      sourceLang: 'multi',
      sourceName: 'ToonStream Hindi Dub',
    }),
    'hi',
  );

  // Switching back from Hindi extension to ShizuTv inbuilt resets stale Hindi back to Japanese
  assert.equal(
    resolvePreferredAudioForSource({
      currentAudioLang: 'hi',
      sourceLang: 'en',
      sourceName: 'ShizuTv Stream (Inbuilt)',
    }),
    'ja',
  );

  // Switching between English-capable sources keeps English selected
  assert.equal(
    resolvePreferredAudioForSource({
      currentAudioLang: 'en',
      sourceLang: 'en',
      sourceName: 'AniWatch / HiAnime (Bridge)',
    }),
    'en',
  );
});

test('shouldAutoMatchAudioForServerChange preserves Hindi and Spanish dubs across dub server switches', () => {
  assert.equal(shouldAutoMatchAudioForServerChange('hi', 'dub'), 'hi');
  assert.equal(shouldAutoMatchAudioForServerChange('es', 'dub'), 'es');
  assert.equal(shouldAutoMatchAudioForServerChange('ja', 'dub'), 'en');
  assert.equal(shouldAutoMatchAudioForServerChange('hi', 'sub'), 'ja');
});

test('sanitizeAudioLanguageCode normalizes invalid codes back to ja while preserving valid picks', () => {
  assert.equal(sanitizeAudioLanguageCode('hi'), 'hi');
  assert.equal(sanitizeAudioLanguageCode('en'), 'en');
  assert.equal(sanitizeAudioLanguageCode('es'), 'es');
  assert.equal(sanitizeAudioLanguageCode('ja'), 'ja');
  assert.equal(sanitizeAudioLanguageCode('fr'), 'ja');
  assert.equal(sanitizeAudioLanguageCode(undefined), 'ja');
});

test('resolvePersistedSubtitleLang prefers explicit route value, then persisted pref, else en', () => {
  assert.equal(resolvePersistedSubtitleLang('es', 'hi'), 'es');
  assert.equal(resolvePersistedSubtitleLang(undefined, 'hi'), 'hi');
  assert.equal(resolvePersistedSubtitleLang('  ', '  ja '), 'ja');
  assert.equal(resolvePersistedSubtitleLang(undefined, undefined), 'en');
});

test('resolvePreferredVideoServer prioritizes route server, then saved per-source server matching category, then category fallback', () => {
  const servers: Array<{ id: string; category: 'sub' | 'dub' }> = [
    { id: 'vidstreaming-sub', category: 'sub' },
    { id: 'megacloud-sub', category: 'sub' },
    { id: 'vidstreaming-dub', category: 'dub' },
    { id: 'megacloud-dub', category: 'dub' },
  ];

  // Reuses persisted server for this source when category matches
  assert.equal(
    resolvePreferredVideoServer({
      servers,
      preferredServerId: 'megacloud-sub',
      desiredAudioCategory: 'sub',
    })?.id,
    'megacloud-sub',
  );

  // Route override wins over persisted preference when matching category
  assert.equal(
    resolvePreferredVideoServer({
      servers,
      preferredServerId: 'megacloud-dub',
      routeServerId: 'vidstreaming-dub',
      desiredAudioCategory: 'dub',
    })?.id,
    'vidstreaming-dub',
  );

  // When user switches desired audio language to dub, a saved sub server does not trap them on sub
  assert.equal(
    resolvePreferredVideoServer({
      servers,
      preferredServerId: 'megacloud-sub',
      desiredAudioCategory: 'dub',
    })?.id,
    'vidstreaming-dub',
  );

  // Falls back safely when saved server does not exist on the newly chosen source
  assert.equal(
    resolvePreferredVideoServer({
      servers,
      preferredServerId: 'non-existent-server',
      desiredAudioCategory: 'dub',
    })?.id,
    'vidstreaming-dub',
  );

  // If a source has only sub servers, a saved server still resolves cleanly even when dub is desired
  const subOnlyServers: Array<{ id: string; category: 'sub' | 'dub' }> = [
    { id: 'mirror-1', category: 'sub' },
    { id: 'mirror-2', category: 'sub' },
  ];
  assert.equal(
    resolvePreferredVideoServer({
      servers: subOnlyServers,
      preferredServerId: 'mirror-2',
      desiredAudioCategory: 'dub',
    })?.id,
    'mirror-2',
  );
});





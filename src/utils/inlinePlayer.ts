export interface InlineSkipInterval {
  startTime: number;
  endTime: number;
  skipType: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface HlsQualityOption {
  index: number;
  label: string;
  height?: number;
  bitrate?: number;
}

export function clampEpisodeIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(total - 1, Math.floor(index)));
}

export function getEpisodeNavigationState(index: number, total: number): {
  hasPrev: boolean;
  hasNext: boolean;
  prevIndex: number;
  nextIndex: number;
} {
  const safeIndex = clampEpisodeIndex(index, total);
  const hasPrev = total > 0 && safeIndex > 0;
  const hasNext = total > 0 && safeIndex < total - 1;
  return {
    hasPrev,
    hasNext,
    prevIndex: hasPrev ? safeIndex - 1 : safeIndex,
    nextIndex: hasNext ? safeIndex + 1 : safeIndex,
  };
}

export function formatScrubberPercent(currentTime: number, duration: number): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  const pct = (currentTime / duration) * 100;
  return Math.max(0, Math.min(100, pct));
}

export function getEffectiveDurationSeconds(
  videoDuration: number,
  episodeDurationSeconds?: number | null,
  mediaDurationMinutes?: number | null,
): number {
  if (Number.isFinite(videoDuration) && videoDuration > 0) {
    return videoDuration;
  }
  if (typeof episodeDurationSeconds === 'number' && Number.isFinite(episodeDurationSeconds) && episodeDurationSeconds > 0) {
    return episodeDurationSeconds;
  }
  if (typeof mediaDurationMinutes === 'number' && Number.isFinite(mediaDurationMinutes) && mediaDurationMinutes > 0) {
    return mediaDurationMinutes * 60;
  }
  return 24 * 60;
}

export type AutoSkipModeInput =
  | boolean
  | {
      autoSkipOp: boolean;
      autoSkipEd: boolean;
    };

export function isOpeningOrRecapSkipType(skipType: string): boolean {
  return skipType === 'op' || skipType === 'mixed-op' || skipType === 'recap';
}

export function isEndingSkipType(skipType: string): boolean {
  return skipType === 'ed' || skipType === 'mixed-ed';
}

export function isAutoSkipEligible(
  skipType: string,
  autoSkip: AutoSkipModeInput,
): boolean {
  if (typeof autoSkip === 'boolean') {
    if (!autoSkip) return false;
    return isOpeningOrRecapSkipType(skipType) || isEndingSkipType(skipType);
  }
  if (isOpeningOrRecapSkipType(skipType)) {
    return Boolean(autoSkip.autoSkipOp);
  }
  if (isEndingSkipType(skipType)) {
    return Boolean(autoSkip.autoSkipEd);
  }
  return false;
}

export function clampAutoSkipDestination(
  targetEnd: number,
  durationSeconds?: number | null,
): number {
  if (!Number.isFinite(targetEnd) || targetEnd <= 0) return 0;
  if (
    typeof durationSeconds === 'number' &&
    Number.isFinite(durationSeconds) &&
    durationSeconds > 1
  ) {
    return Math.min(targetEnd, Math.max(0, durationSeconds - 0.25));
  }
  return targetEnd;
}

export function computeAutoSkipTarget(
  currentTime: number,
  intervals: InlineSkipInterval[],
  autoSkip: AutoSkipModeInput,
): number | null {
  if (!Array.isArray(intervals) || intervals.length === 0 || !Number.isFinite(currentTime)) {
    return null;
  }
  const active = intervals.find(
    (s) =>
      isAutoSkipEligible(s.skipType, autoSkip) &&
      currentTime >= s.startTime &&
      currentTime < s.endTime - 0.5,
  );
  return active ? active.endTime : null;
}

export function getManualSkipInterval<T extends InlineSkipInterval>(
  currentTime: number,
  intervals: T[],
  autoSkip: AutoSkipModeInput,
): T | undefined {
  if (!Array.isArray(intervals) || intervals.length === 0 || !Number.isFinite(currentTime)) {
    return undefined;
  }
  return intervals.find(
    (s) =>
      !isAutoSkipEligible(s.skipType, autoSkip) &&
      currentTime >= s.startTime &&
      currentTime < s.endTime - 0.5,
  );
}

/**
 * Determines whether playback should auto-start when loading a stream.
 * Respects persisted autoPlay preference unless an explicit user click triggered playback.
 */
export function shouldAutoStartPlayback(
  autoPlayPref: boolean,
  isExplicitPlayAction = false,
): boolean {
  if (isExplicitPlayAction) return true;
  return Boolean(autoPlayPref);
}

export function getVideoFitClass(fitMode: 'contain' | 'cover' | 'fill'): string {
  switch (fitMode) {
    case 'cover':
      return 'object-cover';
    case 'fill':
      return 'object-fill';
    case 'contain':
    default:
      return 'object-contain';
  }
}

export function formatQualityLabel(height?: number, bitrate?: number): string {
  if (typeof height === 'number' && Number.isFinite(height) && height > 0) {
    return `${Math.round(height)}p`;
  }
  if (typeof bitrate === 'number' && Number.isFinite(bitrate) && bitrate > 0) {
    return `${Math.round(bitrate / 1000)}kbps`;
  }
  return 'Source';
}

export function buildHlsQualityOptions(
  levels: Array<{ height?: number; bitrate?: number }>,
): HlsQualityOption[] {
  const options: HlsQualityOption[] = [{ index: -1, label: 'Auto' }];
  if (!Array.isArray(levels) || levels.length === 0) {
    return options;
  }
  const mapped = levels.map((lvl, index) => ({
    index,
    label: formatQualityLabel(lvl.height, lvl.bitrate),
    height: lvl.height,
    bitrate: lvl.bitrate,
  }));
  mapped.sort((a, b) => (b.height ?? 0) - (a.height ?? 0) || (b.bitrate ?? 0) - (a.bitrate ?? 0));

  const seenLabels = new Set<string>();
  for (const opt of mapped) {
    if (!seenLabels.has(opt.label)) {
      seenLabels.add(opt.label);
      options.push(opt);
    }
  }
  return options;
}

export const BATTERY_SAVER_MAX_HEIGHT = 480;

export function resolveEffectiveStreamQuality(
  preferredQuality: string,
  batterySaver: boolean,
): 'auto' | '1080p' | '720p' | '480p' | '360p' {
  const normalized =
    preferredQuality === '1080p' ||
    preferredQuality === '720p' ||
    preferredQuality === '480p' ||
    preferredQuality === '360p'
      ? preferredQuality
      : 'auto';

  if (!batterySaver) {
    return normalized;
  }

  if (normalized === '360p') {
    return '360p';
  }
  return '480p';
}

export function resolvePreferredHlsLevel(
  levels: Array<{ height?: number; bitrate?: number }>,
  qualityPref: string,
): number {
  if (!Array.isArray(levels) || levels.length === 0 || qualityPref === 'auto') {
    return -1;
  }
  const targetHeight = Number.parseInt(qualityPref.replace(/\D/g, ''), 10);
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    return -1;
  }
  let bestIdx = -1;
  let bestDiff = Number.POSITIVE_INFINITY;
  levels.forEach((lvl, idx) => {
    if (typeof lvl.height === 'number' && lvl.height > 0) {
      const diff = Math.abs(lvl.height - targetHeight);
      if (diff < bestDiff) {
        bestDiff = diff;
        bestIdx = idx;
      }
    }
  });
  return bestIdx;
}

export function resolveBatterySaverHlsLevel(
  levels: Array<{ height?: number; bitrate?: number }>,
  qualityPref: string,
  batterySaver: boolean,
): number {
  if (!Array.isArray(levels) || levels.length === 0) {
    return -1;
  }
  if (!batterySaver) {
    return resolvePreferredHlsLevel(levels, qualityPref);
  }
  const effectiveQual = resolveEffectiveStreamQuality(qualityPref, true);
  const targetHeight =
    Number.parseInt(effectiveQual.replace(/\D/g, ''), 10) || BATTERY_SAVER_MAX_HEIGHT;

  // Prefer the highest available level at or below targetHeight (480p cap)
  let cappedIdx = -1;
  let cappedHeight = -1;
  levels.forEach((lvl, idx) => {
    if (typeof lvl.height === 'number' && lvl.height > 0 && lvl.height <= targetHeight) {
      if (lvl.height > cappedHeight) {
        cappedHeight = lvl.height;
        cappedIdx = idx;
      }
    }
  });
  if (cappedIdx >= 0) {
    return cappedIdx;
  }

  // Fallback to lowest available resolution/bitrate level if all exceed 480p
  let lowestIdx = 0;
  let lowestMetric = Number.POSITIVE_INFINITY;
  levels.forEach((lvl, idx) => {
    const metric =
      typeof lvl.height === 'number' && lvl.height > 0
        ? lvl.height
        : typeof lvl.bitrate === 'number' && lvl.bitrate > 0
          ? lvl.bitrate
          : Number.POSITIVE_INFINITY;
    if (metric < lowestMetric) {
      lowestMetric = metric;
      lowestIdx = idx;
    }
  });
  return lowestIdx;
}

export interface SubtitleTextSegment {
  text: string;
  italic?: boolean;
  bold?: boolean;
  underline?: boolean;
}

const HTML_NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  ndash: '–',
  mdash: '—',
  hellip: '…',
};

export function decodeHtmlEntities(input: string): string {
  return String(input || '').replace(
    /&(#x?[0-9a-f]+|[a-z]+);/gi,
    (full, entity: string) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith('#x')) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
      }
      if (lower.startsWith('#')) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : full;
      }
      return HTML_NAMED_ENTITIES[lower] ?? full;
    },
  );
}

export function cleanRawSubtitleCueText(raw: string): string {
  return String(raw || '')
    // Normalize explicit line breaks
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\N/g, '\n')
    // Strip ASS/SSA override blocks like {\an8} {\pos(x,y)}
    .replace(/\{[^}]*\}/g, '')
    // Strip WebVTT inline timestamps like <00:01:02.500>
    .replace(/<\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?>/g, '')
    // Strip furigana <rt>...</rt> / <rp>...</rp> noise inside <ruby>
    .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, '')
    .replace(/<rp[^>]*>[\s\S]*?<\/rp>/gi, '')
    // Remove unsupported inline tags while preserving <i>, <b>, <u> formatting tags
    .replace(/<(?!\/?(?:i|b|u)\b)[^>]+>/gi, '')
    // Normalize tag casing
    .replace(/<(\/?)(i|b|u)\b[^>]*>/gi, (_m, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
    // Decode HTML entities without corrupting <i>/<b>/<u> tags
    .replace(/&(?!(?:lt|gt);)(#x?[0-9a-f]+|[a-z]+);/gi, (m) => decodeHtmlEntities(m))
    // Clean excess horizontal spaces per line while preserving intentional newlines
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function stripSubtitleTags(raw: string): string {
  return decodeHtmlEntities(
    cleanRawSubtitleCueText(raw).replace(/<\/?(?:i|b|u)>/gi, ''),
  ).trim();
}

export function parseSubtitleSegments(raw: string): SubtitleTextSegment[] {
  const cleaned = cleanRawSubtitleCueText(raw);
  if (!cleaned) return [];

  const segments: SubtitleTextSegment[] = [];
  let italic = false;
  let bold = false;
  let underline = false;

  const tokenRe = /(<\/?(?:i|b|u)>)/gi;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  const pushText = (chunk: string) => {
    const decoded = decodeHtmlEntities(chunk);
    if (!decoded) return;
    const prev = segments[segments.length - 1];
    if (
      prev &&
      Boolean(prev.italic) === italic &&
      Boolean(prev.bold) === bold &&
      Boolean(prev.underline) === underline
    ) {
      prev.text += decoded;
    } else {
      segments.push({ text: decoded, italic, bold, underline });
    }
  };

  while ((match = tokenRe.exec(cleaned)) !== null) {
    if (match.index > lastIdx) {
      pushText(cleaned.slice(lastIdx, match.index));
    }
    const token = match[1].toLowerCase();
    if (token === '<i>') italic = true;
    else if (token === '</i>') italic = false;
    else if (token === '<b>') bold = true;
    else if (token === '</b>') bold = false;
    else if (token === '<u>') underline = true;
    else if (token === '</u>') underline = false;
    lastIdx = tokenRe.lastIndex;
  }

  if (lastIdx < cleaned.length) {
    pushText(cleaned.slice(lastIdx));
  }

  return segments.length > 0 ? segments : [{ text: stripSubtitleTags(cleaned) }];
}

export function findActiveSubtitleCue(
  cues: SubtitleCue[] | undefined,
  currentTime: number,
  offsetSeconds = 0,
): SubtitleCue | null {
  if (!Array.isArray(cues) || cues.length === 0 || !Number.isFinite(currentTime)) {
    return null;
  }
  const shiftedTime = currentTime - (Number.isFinite(offsetSeconds) ? offsetSeconds : 0);
  const matching = cues.filter((c) => shiftedTime >= c.start && shiftedTime <= c.end);
  if (matching.length === 0) return null;
  if (matching.length === 1) return matching[0];

  const uniqueLines: string[] = [];
  for (const cue of matching) {
    const txt = String(cue.text || '').trim();
    if (txt && !uniqueLines.includes(txt)) {
      uniqueLines.push(txt);
    }
  }
  if (uniqueLines.length === 0) return null;
  return {
    start: Math.min(...matching.map((c) => c.start)),
    end: Math.max(...matching.map((c) => c.end)),
    text: uniqueLines.join('\n'),
  };
}

function parseTimestampToSeconds(raw: string): number {
  const clean = raw.trim().replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

export function parseSubtitleText(raw: string): SubtitleCue[] {
  const trimmed = raw.replace(/^\uFEFF/, '').trim();
  if (!trimmed) return [];

  const blocks = trimmed.replace(/\r\n/g, '\n').split(/\n\s*\n/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) continue;
    const headerUpper = lines[0].toUpperCase();
    if (
      headerUpper.startsWith('WEBVTT') ||
      headerUpper.startsWith('NOTE') ||
      headerUpper.startsWith('STYLE') ||
      headerUpper.startsWith('REGION')
    ) {
      continue;
    }

    const timingLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingLineIdx >= 0) {
      const [startStr, endStrRaw] = lines[timingLineIdx].split('-->');
      const endStr = (endStrRaw || '').trim().split(/\s+/)[0];
      const start = parseTimestampToSeconds(startStr);
      const end = Math.max(start + 0.5, parseTimestampToSeconds(endStr));
      const text = cleanRawSubtitleCueText(lines.slice(timingLineIdx + 1).join('\n'));
      if (text) {
        cues.push({ start, end, text });
      }
    }
  }

  if (cues.length > 0) return cues;

  // Fallback: treat each non-empty line as a sequential 4-second subtitle cue
  const fallbackLines = trimmed
    .split('\n')
    .map((l) => cleanRawSubtitleCueText(l))
    .filter(Boolean);
  return fallbackLines.map((text, idx) => ({
    start: idx * 4,
    end: idx * 4 + 3.8,
    text,
  }));
}

export type SubtitleFontFamilyPref = 'sans' | 'rounded' | 'serif' | 'mono';
export type SubtitleFontWeightPref = 'medium' | 'bold' | 'extrabold';
export type SubtitleEdgeStylePref = 'shadow' | 'outline' | 'glow' | 'none';

export interface SubtitleVisualStyleInput {
  subtitleSize?: number;
  subtitleColor?: string;
  subtitleBackground?: boolean;
  subtitleBgOpacity?: number;
  subtitleFontFamily?: SubtitleFontFamilyPref;
  subtitleFontWeight?: SubtitleFontWeightPref;
  subtitleEdgeStyle?: SubtitleEdgeStylePref;
  subtitleBottomOffset?: number;
}

export function getSubtitleFontFamilyCss(family?: SubtitleFontFamilyPref): string {
  switch (family) {
    case 'rounded':
      return '"Nunito", "Quicksand", "Varela Round", ui-rounded, system-ui, sans-serif';
    case 'serif':
      return '"Georgia", "Merriweather", ui-serif, serif';
    case 'mono':
      return '"JetBrains Mono", ui-monospace, SFMono-Regular, monospace';
    case 'sans':
    default:
      return '"Inter", "Plus Jakarta Sans", system-ui, sans-serif';
  }
}

export function getSubtitleFontWeightValue(weight?: SubtitleFontWeightPref): number {
  switch (weight) {
    case 'medium':
      return 600;
    case 'extrabold':
      return 800;
    case 'bold':
    default:
      return 700;
  }
}

export function getSubtitleTextShadowCss(edge?: SubtitleEdgeStylePref): string {
  switch (edge) {
    case 'outline':
      return '-1px -1px 0 rgba(0,0,0,0.95), 1px -1px 0 rgba(0,0,0,0.95), -1px 1px 0 rgba(0,0,0,0.95), 1px 1px 0 rgba(0,0,0,0.95), 0 2px 4px rgba(0,0,0,0.85)';
    case 'glow':
      return '0 0 8px rgba(0,0,0,0.95), 0 0 16px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.9)';
    case 'none':
      return 'none';
    case 'shadow':
    default:
      return '0 2px 5px rgba(0,0,0,0.92), 0 1px 2px rgba(0,0,0,0.9)';
  }
}

export function buildSubtitleBoxCssProps(
  prefs: SubtitleVisualStyleInput,
  fontSizePx: number,
): {
  fontSize: string;
  color: string;
  fontFamily: string;
  fontWeight: number;
  textShadow: string;
  backgroundColor: string;
} {
  const opacityPct =
    typeof prefs.subtitleBgOpacity === 'number' && Number.isFinite(prefs.subtitleBgOpacity)
      ? Math.max(0, Math.min(100, prefs.subtitleBgOpacity))
      : 75;
  const bgAlpha = prefs.subtitleBackground === false ? 0 : opacityPct / 100;

  return {
    fontSize: `${fontSizePx}px`,
    color: prefs.subtitleColor || '#ffffff',
    fontFamily: getSubtitleFontFamilyCss(prefs.subtitleFontFamily),
    fontWeight: getSubtitleFontWeightValue(prefs.subtitleFontWeight),
    textShadow: getSubtitleTextShadowCss(prefs.subtitleEdgeStyle),
    backgroundColor: bgAlpha > 0 ? `rgba(0, 0, 0, ${bgAlpha.toFixed(2)})` : 'transparent',
  };
}

export const DEFAULT_AMBIENT_ENABLED = false;
export const DEFAULT_AUTO_PIP_ENABLED = false;
export const DEFAULT_SUBTITLE_SIZE = 13;
export const DEFAULT_SUBTITLE_BACKGROUND = false;
export const DEFAULT_SUBTITLE_ANIMATION = false;
export const DEFAULT_SUBTITLE_PREVIEW_TEXT = 'Welcome to our app';

export type AudioLanguageCode = 'ja' | 'en' | 'hi' | 'es';

export interface AudioLanguageOption {
  code: AudioLanguageCode;
  shortLabel: string;
  label: string;
  serverCategory: 'sub' | 'dub';
}

export const AUDIO_LANGUAGE_OPTIONS: AudioLanguageOption[] = [
  { code: 'ja', shortLabel: 'JP', label: 'Japanese (Original)', serverCategory: 'sub' },
  { code: 'en', shortLabel: 'EN', label: 'English (Dub)', serverCategory: 'dub' },
  { code: 'hi', shortLabel: 'HI', label: 'Hindi (Dub)', serverCategory: 'dub' },
  { code: 'es', shortLabel: 'ES', label: 'Spanish (Dub)', serverCategory: 'dub' },
];

export function resolveAvailableAudioOptions(
  sourceAudios?: AudioLanguageOption[] | null,
): AudioLanguageOption[] {
  if (!Array.isArray(sourceAudios) || sourceAudios.length === 0) {
    // Only advertise confirmed Original track until source metadata reports extra dubs
    return [AUDIO_LANGUAGE_OPTIONS[0]];
  }
  const deduped: AudioLanguageOption[] = [];
  for (const opt of sourceAudios) {
    if (opt && !deduped.some((d) => d.code === opt.code)) {
      deduped.push(opt);
    }
  }
  return deduped.length > 0 ? deduped : [AUDIO_LANGUAGE_OPTIONS[0]];
}

export function resolveAudioLanguageOption(
  code?: string | null,
  availableOptions?: AudioLanguageOption[] | null,
): AudioLanguageOption {
  const pool =
    Array.isArray(availableOptions) && availableOptions.length > 0
      ? availableOptions
      : AUDIO_LANGUAGE_OPTIONS;
  return pool.find((opt) => opt.code === code) ?? pool[0];
}

export interface SelectableAudioLanguageOption extends AudioLanguageOption {
  confirmed: boolean;
}

/**
 * Returns only the audio languages actually supported or detected for the active
 * source/stream, annotating which tracks were confirmed by stream metadata.
 */
export function buildSelectableAudioOptions(
  sourceAudios?: AudioLanguageOption[] | null,
  sourceLang?: string | null,
): SelectableAudioLanguageOption[] {
  const confirmedCodes = new Set<AudioLanguageCode>();
  const hasStreamMetadata = Array.isArray(sourceAudios) && sourceAudios.length > 0;
  if (hasStreamMetadata) {
    for (const item of sourceAudios) {
      if (item?.code) confirmedCodes.add(item.code);
    }
  }

  const cleanSourceLang = typeof sourceLang === 'string' ? sourceLang.trim().toLowerCase() : '';
  if (cleanSourceLang === 'hi' || cleanSourceLang === 'hindi') {
    confirmedCodes.add('hi');
  } else if (cleanSourceLang === 'es' || cleanSourceLang === 'spanish') {
    confirmedCodes.add('es');
  } else if (cleanSourceLang === 'ja' || cleanSourceLang === 'japanese') {
    confirmedCodes.add('ja');
  }

  if (hasStreamMetadata) {
    return AUDIO_LANGUAGE_OPTIONS.filter((opt) => confirmedCodes.has(opt.code)).map((opt) => ({
      ...opt,
      confirmed: confirmedCodes.has(opt.code),
    }));
  }

  if (confirmedCodes.size > 0) {
    return AUDIO_LANGUAGE_OPTIONS.filter((opt) => confirmedCodes.has(opt.code)).map((opt) => ({
      ...opt,
      confirmed: true,
    }));
  }

  // Before an English / multi source finishes resolving, expose only Japanese (Sub) & English (Dub)
  return AUDIO_LANGUAGE_OPTIONS.filter((opt) => opt.code === 'ja' || opt.code === 'en').map(
    (opt) => ({
      ...opt,
      confirmed: false,
    }),
  );
}

/**
 * Aligns audioLanguage when switching anime sources/extensions so inherently Hindi/Spanish
 * sources immediately request their native dub and incompatible audio picks don't linger.
 */
export function resolvePreferredAudioForSource(params: {
  currentAudioLang?: string | null;
  sourceLang?: string | null;
  sourceName?: string | null;
  sourceBaseUrl?: string | null;
  sourceAudios?: AudioLanguageOption[] | null;
}): AudioLanguageCode {
  const cleanLang =
    typeof params.sourceLang === 'string' ? params.sourceLang.trim().toLowerCase() : '';
  const combinedMeta = `${params.sourceName || ''} ${params.sourceBaseUrl || ''}`.toLowerCase();

  if (cleanLang === 'hi' || cleanLang === 'hindi' || /\bhindi\b|\bhin\b/.test(combinedMeta)) {
    return 'hi';
  }
  if (
    cleanLang === 'es' ||
    cleanLang === 'spanish' ||
    /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/.test(combinedMeta)
  ) {
    return 'es';
  }
  if (cleanLang === 'ja' || cleanLang === 'japanese') {
    return 'ja';
  }

  const allowed = buildSelectableAudioOptions(params.sourceAudios, params.sourceLang);
  const current = sanitizeAudioLanguageCode(params.currentAudioLang);
  if (allowed.some((opt) => opt.code === current)) {
    return current;
  }
  return (allowed[0]?.code as AudioLanguageCode) ?? 'ja';
}

/**
 * Keeps non-English dub selections ('hi', 'es') intact when the user switches between
 * dub stream servers instead of overwriting them back to 'en'.
 */
export function shouldAutoMatchAudioForServerChange(
  currentAudioLang: AudioLanguageCode | string | undefined,
  nextServerCategory: 'sub' | 'dub' | 'raw',
): AudioLanguageCode {
  if (nextServerCategory === 'sub') {
    return 'ja';
  }
  if (nextServerCategory === 'dub') {
    if (currentAudioLang === 'hi' || currentAudioLang === 'es' || currentAudioLang === 'en') {
      return currentAudioLang;
    }
    return 'en';
  }
  return currentAudioLang === 'hi' || currentAudioLang === 'es' || currentAudioLang === 'en'
    ? currentAudioLang
    : 'ja';
}

export function sanitizeAudioLanguageCode(code?: string | null): AudioLanguageCode {
  if (code === 'ja' || code === 'en' || code === 'hi' || code === 'es') {
    return code;
  }
  return 'ja';
}

export function resolvePersistedSubtitleLang(
  routeOrInitialSubLang?: string | null,
  persistedSubLang?: string | null,
): string {
  const cleanRoute =
    typeof routeOrInitialSubLang === 'string' ? routeOrInitialSubLang.trim() : '';
  if (cleanRoute) return cleanRoute;
  const cleanPersisted =
    typeof persistedSubLang === 'string' ? persistedSubLang.trim() : '';
  return cleanPersisted || 'en';
}

export function resolvePreferredVideoServer<
  T extends { id: string; category?: 'sub' | 'dub' | 'raw' },
>(params: {
  servers: T[];
  preferredServerId?: string | null;
  routeServerId?: string | null;
  desiredAudioCategory: 'sub' | 'dub';
}): T | undefined {
  const { servers, preferredServerId, routeServerId, desiredAudioCategory } = params;
  if (!Array.isArray(servers) || servers.length === 0) {
    return undefined;
  }
  const hasCategoryMatch = servers.some((s) => s.category === desiredAudioCategory);

  const cleanRoute = typeof routeServerId === 'string' ? routeServerId.trim() : '';
  if (cleanRoute) {
    const routeSrv = servers.find((s) => s.id === cleanRoute);
    if (routeSrv && (!hasCategoryMatch || routeSrv.category === desiredAudioCategory)) {
      return routeSrv;
    }
  }

  const cleanPref = typeof preferredServerId === 'string' ? preferredServerId.trim() : '';
  if (cleanPref) {
    const prefSrv = servers.find((s) => s.id === cleanPref);
    if (prefSrv && (!hasCategoryMatch || prefSrv.category === desiredAudioCategory)) {
      return prefSrv;
    }
  }

  return servers.find((s) => s.category === desiredAudioCategory) ?? servers[0];
}

export type FullscreenCommentScope = 'episode' | 'series';

export function getCommentsScopeKey(
  mediaId: string,
  scope: FullscreenCommentScope,
  episodeNumber: number,
): string {
  if (scope === 'episode') {
    const safeEp =
      Number.isFinite(episodeNumber) && episodeNumber > 0
        ? Math.floor(episodeNumber)
        : 1;
    return `${mediaId}::ep::${safeEp}`;
  }
  return mediaId;
}

export function shouldShowFullscreenControls(input: {
  isLocked: boolean;
  controlsVisible: boolean;
  hasActiveOverlay: boolean;
}): boolean {
  if (input.isLocked) return false;
  return Boolean(input.controlsVisible || input.hasActiveOverlay);
}

export function shouldHideBarsForOverlay(input: {
  showCommentsModal: boolean;
  showEpisodeDrawer: boolean;
  showSettingsMenu: boolean;
  showSpeedMenu: boolean;
  showAudioLangMenu: boolean;
}): {
  hideBottomBar: boolean;
  hideCenterCluster: boolean;
} {
  const hasFullDrawerOrModal = Boolean(input.showCommentsModal || input.showEpisodeDrawer);
  const hasAnyPopover = Boolean(
    hasFullDrawerOrModal ||
      input.showSettingsMenu ||
      input.showSpeedMenu ||
      input.showAudioLangMenu,
  );
  return {
    hideBottomBar: hasFullDrawerOrModal,
    hideCenterCluster: hasAnyPopover,
  };
}

export const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function getNextVideoFitMode(
  current: 'contain' | 'cover' | 'fill',
): 'contain' | 'cover' | 'fill' {
  if (current === 'contain') return 'cover';
  if (current === 'cover') return 'fill';
  return 'contain';
}

export function getVideoFitBadgeLabel(fitMode: 'contain' | 'cover' | 'fill'): string {
  switch (fitMode) {
    case 'cover':
      return 'Zoom';
    case 'fill':
      return 'Fill';
    case 'contain':
    default:
      return 'Fit';
  }
}

export function computeFullscreenRotationStage(input: {
  isFullscreen: boolean;
  isRotated: boolean;
  viewportWidth: number;
  viewportHeight: number;
  nativeOrientationLandscape: boolean;
}): {
  cssRotated: boolean;
  stageWidthPx?: number;
  stageHeightPx?: number;
} {
  if (!input.isFullscreen) {
    return { cssRotated: false };
  }
  const safeW = Number.isFinite(input.viewportWidth) && input.viewportWidth > 0 ? input.viewportWidth : 390;
  const safeH = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 ? input.viewportHeight : 844;
  if (!input.isRotated || input.nativeOrientationLandscape) {
    return { cssRotated: false, stageWidthPx: safeW, stageHeightPx: safeH };
  }
  return {
    cssRotated: true,
    stageWidthPx: safeH,
    stageHeightPx: safeW,
  };
}

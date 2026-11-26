import type {
  ExtensionAdapterCapabilities,
  ExtensionAdapterCompatibilityLevel,
  ExtensionCapabilityErrorCode,
  ExtensionCapabilityName,
  ExtensionSourceCompatibilityReport,
  MatchedSourceEntry,
  UnifiedEpisode,
} from '../types/media';

export interface MediaSearchTitlesInput {
  overrideTitle?: string | null;
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
  synonyms?: string[] | null;
}

export interface GogoSearchCandidate {
  href: string;
  title: string;
  cover?: string | null;
}

export interface RawSubtitleTrack {
  file?: string;
  label?: string;
  kind?: string;
  default?: boolean;
}

export interface MappedSubtitleTrack {
  lang: string;
  label: string;
  url: string;
}

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'in',
  'on',
  'to',
  'no',
  'wa',
  'ga',
  'wo',
  'ni',
]);

const SPINOFF_PENALTY_KEYWORDS = [
  'mini anime',
  'marumaru',
  'chibi',
  'recap',
  'compilation',
  'special',
  'picture drama',
  'ova',
  'ona',
  'summary',
  'cm',
  'pv',
];

export function normalizeTitleForMatch(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/\(dub\)|\(sub\)|\[dub\]|\[sub\]/gi, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function extractSlugFromGogoHref(href: string): string {
  return String(href || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/^\/category\//i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export type StreamAudioLanguage = 'ja' | 'en' | 'hi' | 'es';

export function buildSearchQueriesForMedia(
  input: MediaSearchTitlesInput,
  audioLanguage?: StreamAudioLanguage | string | null,
): string[] {
  const rawCandidates: string[] = [];
  const pushUnique = (val?: string | null) => {
    const clean = typeof val === 'string' ? val.replace(/\s+/g, ' ').trim() : '';
    if (!clean || clean.length < 2) return;
    if (!rawCandidates.includes(clean)) rawCandidates.push(clean);
  };

  pushUnique(input.overrideTitle);
  pushUnique(input.english);
  pushUnique(input.romaji);
  if (Array.isArray(input.synonyms)) {
    for (const syn of input.synonyms.slice(0, 3)) {
      if (syn && /[a-z0-9]/i.test(syn)) pushUnique(syn);
    }
  }

  const expanded: string[] = [];
  const addExpanded = (q: string) => {
    const clean = q.replace(/\s+/g, ' ').trim();
    if (!clean || clean.length < 2) return;
    if (!expanded.includes(clean)) expanded.push(clean);
  };

  for (const title of rawCandidates) {
    addExpanded(title);

    // Strip parenthetical qualifiers & subtitles after colon/dash
    const noParens = title.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();
    if (noParens && noParens !== title) addExpanded(noParens);

    const beforeColon = noParens.split(/[:–—-]/)[0]?.trim();
    if (beforeColon && beforeColon.length >= 3 && beforeColon !== noParens) {
      addExpanded(beforeColon);
    }

    // Remove apostrophes/punctuation (helps search tokenizer on e.g. "Journey's")
    const asciiCleaned = noParens
      .replace(/['’`]/g, '')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (asciiCleaned) addExpanded(asciiCleaned);
  }

  // Short root fallbacks (first 1-2 significant words, skipping leading articles like "The ")
  const primaryTitle = rawCandidates[0] || '';
  if (primaryTitle) {
    const words = primaryTitle
      .replace(/['’`:–—-]/g, ' ')
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const nonArticleWords =
      words.length > 1 && STOP_WORDS.has(words[0].toLowerCase()) ? words.slice(1) : words;
    if (nonArticleWords.length >= 2) {
      addExpanded(nonArticleWords.slice(0, 2).join(' '));
    } else if (words.length >= 2) {
      addExpanded(words.slice(0, 2).join(' '));
    }
    if (
      nonArticleWords.length >= 1 &&
      nonArticleWords[0].length >= 4 &&
      !STOP_WORDS.has(nonArticleWords[0].toLowerCase())
    ) {
      addExpanded(nonArticleWords[0]);
    }
  }

  // Prioritize language-specific query when Hindi or Spanish audio is requested
  const cleanLang = typeof audioLanguage === 'string' ? audioLanguage.trim().toLowerCase() : '';
  if (primaryTitle && (cleanLang === 'hi' || cleanLang === 'es')) {
    const rootClean = primaryTitle
      .replace(/\([^)]*\)/g, ' ')
      .replace(/['’`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (rootClean) {
      const langQuery =
        cleanLang === 'hi' ? `${rootClean} Hindi` : `${rootClean} Spanish`;
      return [
        langQuery,
        ...expanded.filter((q) => q.toLowerCase() !== langQuery.toLowerCase()),
      ].slice(0, 9);
    }
  }

  return expanded.slice(0, 9);
}

function tokenizeNormalized(norm: string): string[] {
  return norm.split(/\s+/).filter(Boolean);
}

function hasSeasonMarker(text: string): string | null {
  const m =
    text.match(/\bseason\s*(\d+)\b/i) ||
    text.match(/\b(\d+)(?:st|nd|rd|th)\s*season\b/i) ||
    text.match(/\bs(\d+)\b/i);
  if (m) return m[1];
  return null;
}

function meaningfulTokens(norm: string): string[] {
  const all = tokenizeNormalized(norm);
  const sig = all.filter((t) => !STOP_WORDS.has(t));
  return sig.length > 0 ? sig : all;
}

/**
 * Verifies a search candidate genuinely represents one of the target anime/manga titles
 * (filtering out unrelated shows or random movies matched on stop-words or single common words).
 */
export function isViableTitleMatch(
  candidate: GogoSearchCandidate,
  targetTitles: string[],
  format?: string | null,
): boolean {
  const slug = extractSlugFromGogoHref(candidate.href).toLowerCase();
  const candTextRaw = (candidate.title || slug.replace(/-/g, ' '))
    .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|eng[\s-]?dub|dubbed|subbed)\b/gi, ' ');
  const candNorm = normalizeTitleForMatch(candTextRaw);
  const slugNorm = normalizeTitleForMatch(
    slug
      .replace(/-/g, ' ')
      .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|dub|sub)\b/gi, ' '),
  );
  if (!candNorm && !slugNorm) return false;

  const candSig = new Set([...meaningfulTokens(candNorm), ...meaningfulTokens(slugNorm)]);
  const candIsMovie = /\bmovie\b|\bfilm\b/.test(`${candNorm} ${slugNorm}`);
  const candNormalizedStr = candNorm || slugNorm;

  for (const rawTarget of targetTitles) {
    const targetNorm = normalizeTitleForMatch(rawTarget);
    if (!targetNorm) continue;

    if (candNorm === targetNorm || slugNorm === targetNorm) {
      return true;
    }

    const targetSig = meaningfulTokens(targetNorm);
    if (targetSig.length === 0) continue;

    // Reject a MOVIE candidate for a non-MOVIE TV/ONA series unless target explicitly says movie/film
    if (
      format &&
      format !== 'MOVIE' &&
      candIsMovie &&
      !/\bmovie\b|\bfilm\b/.test(targetNorm)
    ) {
      continue;
    }

    const hits = targetSig.filter((tok) => candSig.has(tok)).length;
    const sigRecall = hits / targetSig.length;
    const minNeededHits = targetSig.length === 1 ? 1 : targetSig.length === 2 ? 2 : Math.ceil(targetSig.length * 0.55);

    if (hits >= minNeededHits && sigRecall >= 0.55) {
      // For single-word titles (e.g. "Naruto" or "Bleach"), guard against unrelated extra-word spin-offs
      // when precision is tiny unless it starts with the target title
      if (targetSig.length === 1 && candSig.size > 3 && !candNormalizedStr.startsWith(targetNorm)) {
        continue;
      }
      return true;
    }
  }

  return false;
}

export function isMetadataOnlyCatalogHost(
  sourceBaseUrl?: string | null,
  sourceName?: string | null,
  sourcePkg?: string | null,
  sourceId?: string | null,
): boolean {
  const combined = `${sourceBaseUrl || ''} ${sourceName || ''} ${sourcePkg || ''} ${sourceId || ''}`
    .toLowerCase();
  return /\b(?:anidb\.net|anidb|myanimelist\.net|myanimelist|anilist\.co|anilist|kitsu\.io|kitsu\.app|kitsu|anime-planet\.com|anime-?planet|livechart\.me|livechart|notify\.moe|mangaupdates\.com|mangaupdates|baka-?updates|shikimori\.one|shikimori\.me|shikimori|simkl\.com|simkl|themoviedb\.org|thetvdb\.com|imdb\.com|trakt\.tv|annict\.com|annict|anisearch\.com|anisearch\.de|anisearch|novelupdates\.com|novelupdates|ranobedb\.org|ranobedb|vndb\.org|vndb|bangumi\.tv|bgm\.tv)\b/.test(
    combined,
  );
}

export function scoreGogoSearchCandidate(
  candidate: GogoSearchCandidate,
  target: {
    titles: string[];
    category: 'sub' | 'dub' | 'raw';
    format?: string | null;
    audioLanguage?: StreamAudioLanguage | string | null;
  },
): number {
  const slug = extractSlugFromGogoHref(candidate.href).toLowerCase();
  const rawTitleLower = String(candidate.title || '').toLowerCase();
  const combinedLangText = `${slug} ${rawTitleLower}`;
  const candNorm = normalizeTitleForMatch(
    candidate.title
      .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|eng[\s-]?dub)\b/gi, ' ') ||
      slug.replace(/-/g, ' '),
  );
  const slugNorm = normalizeTitleForMatch(
    slug
      .replace(/-/g, ' ')
      .replace(/\b(hindi|spanish|espanol|latino|castellano|multi[\s-]?audio|dub)\b/gi, ' '),
  );
  const candIsHindi = /\bhindi\b|\bhindi[\s-]?dub\b/i.test(combinedLangText);
  const candIsSpanish = /\bspanish\b|\bespanol\b|\bcastellano\b|\blatino\b/i.test(combinedLangText);
  const candIsMultiAudio = /\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/i.test(combinedLangText);
  const candIsDub =
    /-dub(?:$|-)/i.test(slug) || /\(dub\)|\[dub\]|\bdubbed\b/i.test(rawTitleLower);

  let bestScore = -1000;

  for (let tIdx = 0; tIdx < target.titles.length; tIdx++) {
    const rawTarget = target.titles[tIdx];
    const targetNorm = normalizeTitleForMatch(rawTarget);
    if (!targetNorm) continue;

    let score = 0;
    // Slight preference for earlier title in prioritized list (e.g. overrideTitle > English > Romaji)
    score -= tIdx * 3;

    if (candNorm === targetNorm || slugNorm === targetNorm) {
      score += 120;
    } else if (candNorm.startsWith(targetNorm) || targetNorm.startsWith(candNorm)) {
      score += 75;
    }

    const candSigTokens = meaningfulTokens(candNorm);
    const targetSigTokens = meaningfulTokens(targetNorm);
    const candSet = new Set(candSigTokens);
    const targetSet = new Set(targetSigTokens);

    let overlap = 0;
    for (const tok of targetSet) {
      if (candSet.has(tok)) overlap += 1;
    }
    const recall = targetSet.size > 0 ? overlap / targetSet.size : 0;
    const precision = candSet.size > 0 ? overlap / candSet.size : 0;
    score += Math.round(recall * 70 + precision * 40);
    if (overlap === 0) {
      score -= 140;
    }

    // Extra word length difference penalty (e.g. "Naruto" vs "Boruto: Naruto the Movie")
    const extraTokens = Math.max(0, candSigTokens.length - overlap);
    score -= extraTokens * 10;

    // Season number alignment
    const targetSeason = hasSeasonMarker(targetNorm);
    const candSeason = hasSeasonMarker(candNorm);
    if (targetSeason && candSeason) {
      score += targetSeason === candSeason ? 35 : -55;
    } else if (!targetSeason && candSeason && Number(candSeason) > 1) {
      score -= 42;
    } else if (targetSeason && !candSeason) {
      score -= 25;
    }

    // Movie format hint
    const candIsMovie = /\bmovie\b|\bfilm\b/.test(candNorm);
    if (target.format === 'MOVIE' && candIsMovie) {
      score += 20;
    } else if (target.format !== 'MOVIE' && candIsMovie && !/\bmovie\b|\bfilm\b/.test(targetNorm)) {
      score -= 75;
    }

    // Penalize unrelated spin-offs / recaps / mini anime unless explicitly asked
    for (const kw of SPINOFF_PENALTY_KEYWORDS) {
      if (candNorm.includes(kw) && !targetNorm.includes(kw)) {
        score -= 45;
      }
    }

    if (score > bestScore) {
      bestScore = score;
    }
  }

  // Audio language & category alignment (JP Sub vs EN Dub vs HI Dub vs ES Dub)
  const reqAudio =
    typeof target.audioLanguage === 'string' ? target.audioLanguage.toLowerCase() : '';
  if (reqAudio === 'hi') {
    if (candIsHindi) bestScore += 95;
    else if (candIsMultiAudio) bestScore += 70;
    else if (candIsSpanish) bestScore -= 60;
    else if (candIsDub) bestScore -= 10;
  } else if (reqAudio === 'es') {
    if (candIsSpanish) bestScore += 95;
    else if (candIsMultiAudio) bestScore += 65;
    else if (candIsHindi) bestScore -= 60;
    else if (candIsDub) bestScore -= 10;
  } else if (target.category === 'dub' || reqAudio === 'en') {
    if (candIsHindi || candIsSpanish) {
      bestScore -= 65;
    } else if (candIsDub || candIsMultiAudio) {
      bestScore += 55;
    } else {
      bestScore -= 15;
    }
  } else {
    if (candIsHindi || candIsSpanish) {
      bestScore -= 70;
    } else {
      bestScore += candIsDub ? -65 : 20;
    }
  }

  return bestScore;
}

export function buildStreamProxyUrl(
  targetUrl: string,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): string {
  const params = new URLSearchParams();
  params.set('url', targetUrl);
  if (referer && referer.trim()) {
    params.set('referer', referer.trim());
  }
  return `${proxyPrefix}?${params.toString()}`;
}

export function rewriteM3u8Manifest(
  manifestText: string,
  baseManifestUrl: string,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): string {
  const lines = String(manifestText || '').split(/\r?\n/);
  const rewritten = lines.map((rawLine) => {
    const trimmed = rawLine.trim();
    if (!trimmed) return rawLine;

    if (trimmed.startsWith('#')) {
      // Rewrite URI="..." attributes inside #EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, #EXT-X-I-FRAME-STREAM-INF, etc.
      return rawLine.replace(/URI="([^"]+)"/g, (_match, rawUri: string) => {
        try {
          const abs = new URL(rawUri, baseManifestUrl).toString();
          return `URI="${buildStreamProxyUrl(abs, proxyPrefix, referer)}"`;
        } catch {
          return `URI="${rawUri}"`;
        }
      });
    }

    try {
      const absUrl = new URL(trimmed, baseManifestUrl).toString();
      return buildStreamProxyUrl(absUrl, proxyPrefix, referer);
    } catch {
      return rawLine;
    }
  });

  return rewritten.join('\n');
}

export function extractMegaPlayStreamUrl(decrypted: unknown): string | null {
  if (!decrypted) return null;
  if (typeof decrypted === 'string') {
    const s = decrypted.trim();
    return /^https?:\/\//i.test(s) ? s : null;
  }
  if (Array.isArray(decrypted)) {
    for (const item of decrypted) {
      const found = extractMegaPlayStreamUrl(item);
      if (found) return found;
    }
    return null;
  }
  if (typeof decrypted === 'object') {
    const rec = decrypted as Record<string, unknown>;
    if (typeof rec.file === 'string' && /^https?:\/\//i.test(rec.file.trim())) {
      return rec.file.trim();
    }
    if (typeof rec.url === 'string' && /^https?:\/\//i.test(rec.url.trim())) {
      return rec.url.trim();
    }
    if (Array.isArray(rec.sources)) {
      return extractMegaPlayStreamUrl(rec.sources);
    }
  }
  return null;
}

export function mapSubtitleTracksFromSources(
  tracks: RawSubtitleTrack[] | undefined | null,
  proxyPrefix = '/api/stream/proxy',
  referer?: string,
): MappedSubtitleTrack[] {
  if (!Array.isArray(tracks) || tracks.length === 0) return [];
  const mapped: MappedSubtitleTrack[] = [];
  const seenTracks = new Set<string>();
  const usedLangCodes = new Set<string>();

  for (const track of tracks) {
    if (!track || typeof track.file !== 'string') continue;
    const rawFile = track.file.trim();
    if (!/^https?:\/\//i.test(rawFile)) continue;
    const kind = String(track.kind || '').toLowerCase();
    if (kind === 'thumbnails' || kind === 'metadata' || /thumbnails\.vtt/i.test(rawFile)) {
      continue;
    }

    const label = String(track.label || 'Subtitles').trim();
    const lower = label.toLowerCase();
    let baseLang = 'other';
    if (lower.includes('english')) baseLang = 'en';
    else if (lower.includes('japanese')) baseLang = 'ja';
    else if (lower.includes('spanish') || lower.includes('español') || lower.includes('espanol')) {
      baseLang =
        lower.includes('latin') || lower.includes('latam') || lower.includes('419')
          ? 'es-la'
          : 'es';
    } else if (lower.includes('french')) baseLang = 'fr';
    else if (lower.includes('german')) baseLang = 'de';
    else if (lower.includes('italian')) baseLang = 'it';
    else if (lower.includes('portuguese')) {
      baseLang = lower.includes('brazil') || lower.includes('br') ? 'pt-br' : 'pt';
    } else if (lower.includes('arabic')) baseLang = 'ar';
    else if (lower.includes('russian')) baseLang = 'ru';
    else baseLang = lower.replace(/[^a-z]/g, '').slice(0, 6) || 'sub';

    const uniqueTrackKey = `${baseLang}:${label}:${rawFile}`;
    if (seenTracks.has(uniqueTrackKey)) continue;
    seenTracks.add(uniqueTrackKey);

    let lang = baseLang;
    let suffix = 2;
    while (usedLangCodes.has(lang)) {
      lang = `${baseLang}-${suffix}`;
      suffix += 1;
    }
    usedLangCodes.add(lang);

    mapped.push({
      lang,
      label,
      url: buildStreamProxyUrl(rawFile, proxyPrefix, referer),
    });
  }

  // Prioritize English first, then Japanese, then others
  mapped.sort((a, b) => {
    const weight = (l: string) => (l === 'en' ? 0 : l === 'ja' ? 1 : 2);
    return weight(a.lang) - weight(b.lang);
  });

  return mapped;
}

export type AudioTrackEvidenceLevel = 'confirmed' | 'inferred';

export interface ResolvedAvailableAudioOption {
  code: 'ja' | 'en' | 'hi' | 'es';
  shortLabel: string;
  label: string;
  serverCategory: 'sub' | 'dub';
  evidence?: AudioTrackEvidenceLevel;
}

export function detectAvailableAudiosFromSources(input: {
  candidates: Array<{ href: string; title: string }>;
  targetTitles: string[];
  currentCategory: 'sub' | 'dub' | 'raw';
  currentAudioLanguage?: string | null;
  hasDubProbe?: boolean;
  embedLangHints?: Array<string | undefined>;
  explicitServerTypes?: Array<string | undefined>;
  sourceLang?: string | null;
  sourceName?: string | null;
  sourceBaseUrl?: string | null;
}): ResolvedAvailableAudioOption[] {
  const audios: ResolvedAvailableAudioOption[] = [];
  const pushAudio = (opt: ResolvedAvailableAudioOption) => {
    const existing = audios.find((a) => a.code === opt.code);
    if (!existing) {
      audios.push(opt);
    } else if (opt.evidence === 'confirmed' && existing.evidence !== 'confirmed') {
      existing.evidence = 'confirmed';
    }
  };

  const normalizedTargets = input.targetTitles
    .map((t) => normalizeTitleForMatch(t))
    .filter(Boolean);

  const isTitleCloseMatch = (candidateTitle: string, candidateSlug: string): boolean => {
    const candNorm = normalizeTitleForMatch(candidateTitle || candidateSlug.replace(/-/g, ' '));
    if (!candNorm) return false;
    const candTokens = candNorm.split(/\s+/).filter(Boolean);
    const candSet = new Set(candTokens);

    return normalizedTargets.some((targetNorm) => {
      if (candNorm === targetNorm || candNorm.startsWith(targetNorm) || targetNorm.startsWith(candNorm)) {
        return true;
      }
      const targetTokens = targetNorm.split(/\s+/).filter(Boolean);
      if (targetTokens.length === 0) return false;
      const hits = targetTokens.filter((tok) => candSet.has(tok)).length;
      return hits / targetTokens.length >= 0.75;
    });
  };

  let confirmedJa = false;
  let confirmedEn = Boolean(input.hasDubProbe);
  let confirmedHi = isSourceInherentLanguage(
    input.sourceLang,
    input.sourceName,
    input.sourceBaseUrl,
    'hi',
  );
  let confirmedEs = isSourceInherentLanguage(
    input.sourceLang,
    input.sourceName,
    input.sourceBaseUrl,
    'es',
  );

  if (Array.isArray(input.explicitServerTypes)) {
    for (const rawType of input.explicitServerTypes) {
      const serverType = String(rawType || '').trim().toLowerCase();
      if (serverType === 'sub' || serverType === 'raw') confirmedJa = true;
      else if (serverType === 'dub') confirmedEn = true;
    }
  }

  if (Array.isArray(input.embedLangHints)) {
    for (const hint of input.embedLangHints) {
      if (hint === 'hi') confirmedHi = true;
      else if (hint === 'es') confirmedEs = true;
      else if (hint === 'en') confirmedEn = true;
      else if (hint === 'ja') confirmedJa = true;
    }
  }

  let sawNeutralSubCandidate = false;
  for (const cand of input.candidates) {
    const slug = extractSlugFromGogoHref(cand.href).toLowerCase();
    const rawTitle = String(cand.title || '').toLowerCase();
    const isDub = /-dub(?:$|-)/i.test(slug) || /\(dub\)|\[dub\]|\benglish\s+dub\b/i.test(rawTitle);
    const isHindi = /\bhindi\b/i.test(slug) || /\bhindi\b/i.test(rawTitle);
    const isSpanish = /\bspanish\b|\bespanol\b|\bcastellano\b|\blatino\b/i.test(`${slug} ${rawTitle}`);
    const isExplicitSub =
      /-sub(?:$|-)/i.test(slug) || /\(sub\)|\[sub\]|\bsubbed\b|\bjapanese\b/i.test(rawTitle);

    if (!isTitleCloseMatch(cand.title, slug)) continue;

    if (isHindi) {
      confirmedHi = true;
    } else if (isSpanish) {
      confirmedEs = true;
    } else if (isDub) {
      confirmedEn = true;
    } else if (isExplicitSub) {
      confirmedJa = true;
    } else {
      sawNeutralSubCandidate = true;
    }
  }

  if (confirmedJa) {
    pushAudio({
      code: 'ja',
      shortLabel: 'JP',
      label: 'Japanese (Original)',
      serverCategory: 'sub',
      evidence: 'confirmed',
    });
  } else if (
    sawNeutralSubCandidate &&
    input.currentAudioLanguage !== 'hi' &&
    input.currentAudioLanguage !== 'es'
  ) {
    pushAudio({
      code: 'ja',
      shortLabel: 'JP',
      label: 'Japanese (Original)',
      serverCategory: 'sub',
      evidence: 'inferred',
    });
  }

  if (confirmedEn) {
    pushAudio({
      code: 'en',
      shortLabel: 'EN',
      label: 'English (Dub)',
      serverCategory: 'dub',
      evidence: 'confirmed',
    });
  }

  if (confirmedHi) {
    pushAudio({
      code: 'hi',
      shortLabel: 'HI',
      label: 'Hindi (Dub)',
      serverCategory: 'dub',
      evidence: 'confirmed',
    });
  }

  if (confirmedEs) {
    pushAudio({
      code: 'es',
      shortLabel: 'ES',
      label: 'Spanish (Dub)',
      serverCategory: 'dub',
      evidence: 'confirmed',
    });
  }

  // Runtime fallback options when no candidate/explicit audio track matched:
  // marked strictly as 'inferred' so diagnostics never confuse assumptions for confirmed evidence.
  if (audios.length === 0) {
    if (
      input.currentCategory === 'dub' &&
      (!input.currentAudioLanguage || input.currentAudioLanguage === 'en')
    ) {
      pushAudio({
        code: 'en',
        shortLabel: 'EN',
        label: 'English (Dub)',
        serverCategory: 'dub',
        evidence: 'inferred',
      });
    } else if (input.currentAudioLanguage === 'hi') {
      pushAudio({
        code: 'hi',
        shortLabel: 'HI',
        label: 'Hindi (Dub)',
        serverCategory: 'dub',
        evidence: 'inferred',
      });
    } else if (input.currentAudioLanguage === 'es') {
      pushAudio({
        code: 'es',
        shortLabel: 'ES',
        label: 'Spanish (Dub)',
        serverCategory: 'dub',
        evidence: 'inferred',
      });
    } else if (input.currentCategory === 'sub') {
      pushAudio({
        code: 'ja',
        shortLabel: 'JP',
        label: 'Japanese (Original)',
        serverCategory: 'sub',
        evidence: 'inferred',
      });
    }
  }

  return audios;
}

export const INBUILT_PRIMARY_HOSTS = [
  'https://ww5.gogoanimes.fi',
  'https://ww12.gogoanimes.fi',
] as const;

export const HIANIME_BRIDGE_HOSTS = [
  'https://hianime.to',
  'https://hianimez.to',
  'https://aniwatchtv.to',
] as const;

export type ProviderHostPlanMode =
  | 'inbuilt'
  | 'hianime'
  | 'custom-extension'
  | 'missing-host';

export interface ProviderHostPlan {
  mode: ProviderHostPlanMode;
  hosts: string[];
  sourceLabel: string;
}

function isValidExternalOrigin(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.local') ||
      host.endsWith('.internal') ||
      /^(?:10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[0-1])\.|192\.168\.|0\.)/.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Strictly isolates stream resolution hosts to the selected source/extension.
 * - Default 'shonenx-hls-inbuilt' uses ShizuTv's primary hosts.
 * - 'hianime-bridge' uses HiAnime hosts (or explicit sourceBaseUrl if supplied).
 * - Any other selected extension ONLY uses its own sourceBaseUrl (never falls back to GogoAnime).
 */
export function resolveProviderHostPlan(params: {
  sourceId?: string | null;
  sourceName?: string | null;
  sourceBaseUrl?: string | null;
}): ProviderHostPlan {
  const cleanSourceId = typeof params.sourceId === 'string' ? params.sourceId.trim() : '';
  const cleanBaseUrl =
    typeof params.sourceBaseUrl === 'string'
      ? params.sourceBaseUrl.trim().replace(/\/+$/, '')
      : '';
  const sourceLabel =
    (typeof params.sourceName === 'string' && params.sourceName.trim()) ||
    cleanSourceId ||
    'ShizuTv Stream (Inbuilt)';

  if (!cleanSourceId || cleanSourceId === 'shonenx-hls-inbuilt') {
    const hosts =
      cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)
        ? [cleanBaseUrl, ...INBUILT_PRIMARY_HOSTS.filter((h) => h !== cleanBaseUrl)]
        : [...INBUILT_PRIMARY_HOSTS];
    return { mode: 'inbuilt', hosts, sourceLabel };
  }

  if (cleanSourceId === 'hianime-bridge') {
    const hosts =
      cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)
        ? [cleanBaseUrl, ...HIANIME_BRIDGE_HOSTS.filter((h) => h !== cleanBaseUrl)]
        : [...HIANIME_BRIDGE_HOSTS];
    return { mode: 'hianime', hosts, sourceLabel };
  }

  if (cleanBaseUrl && isValidExternalOrigin(cleanBaseUrl)) {
    return {
      mode: 'custom-extension',
      hosts: [cleanBaseUrl],
      sourceLabel,
    };
  }

  return {
    mode: 'missing-host',
    hosts: [],
    sourceLabel,
  };
}

export function buildStreamResolverCacheKey(params: {
  mediaId: string;
  overrideTitle?: string | null;
  english?: string | null;
  romaji?: string | null;
  episodeNumber: number;
  category: 'sub' | 'dub' | 'raw';
  audioLanguage?: string | null;
  serverId?: string | null;
  sourceId?: string | null;
  sourceBaseUrl?: string | null;
  sourceLang?: string | null;
  selectedHref?: string | null;
  selectedSlug?: string | null;
  selectedEpisodeId?: string | null;
  selectedEpisodeUrl?: string | null;
}): string {
  return JSON.stringify({
    mediaId: params.mediaId,
    override: params.overrideTitle || '',
    en: params.english || '',
    ro: params.romaji || '',
    ep: params.episodeNumber,
    category: params.category,
    audioLanguage: (params.audioLanguage || '').toLowerCase(),
    serverId: params.serverId || '',
    sourceId: params.sourceId || 'shonenx-hls-inbuilt',
    sourceBaseUrl: (params.sourceBaseUrl || '').replace(/\/+$/, ''),
    sourceLang: (params.sourceLang || '').toLowerCase(),
    selectedHref: params.selectedHref || '',
    selectedSlug: params.selectedSlug || '',
    selectedEpisodeId: params.selectedEpisodeId || '',
    selectedEpisodeUrl: params.selectedEpisodeUrl || '',
  });
}

export function isSourceInherentLanguage(
  sourceLang?: string | null,
  sourceName?: string | null,
  sourceBaseUrl?: string | null,
  targetAudioLang?: string | null,
): boolean {
  const req = (targetAudioLang || '').trim().toLowerCase();
  if (!req) return false;
  const cleanLang = (sourceLang || '').trim().toLowerCase();
  const combined = `${sourceName || ''} ${sourceBaseUrl || ''}`.toLowerCase();
  if (req === 'hi') {
    return cleanLang === 'hi' || cleanLang === 'hindi' || /\bhindi\b|\bhin\b/.test(combined);
  }
  if (req === 'es') {
    return (
      cleanLang === 'es' ||
      cleanLang === 'spanish' ||
      /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/.test(combined)
    );
  }
  return cleanLang === req;
}

export interface GenericEmbedCandidate {
  label: string;
  url: string;
  langHint?: string;
}

function decodeHtmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function inferLangHintFromText(text: string): string | undefined {
  const low = text.toLowerCase();
  if (/\bhindi\b|\bhin\b|\[hi\]|\(hi\)/.test(low)) return 'hi';
  if (/\bspanish\b|\bespanol\b|\bespañol\b|\blatino\b|\bcastellano\b/.test(low)) return 'es';
  if (/\benglish\b|\beng\b|\bdub\b/.test(low)) return 'en';
  if (/\bjapanese\b|\bjap\b|\bsub\b|\boriginal\b/.test(low)) return 'ja';
  if (/\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/.test(low)) return 'multi';
  return undefined;
}

/**
 * Extracts anime/series search result links from WordPress / DooPlay / AnimeStream /
 * HiAnime / generic extension search HTML pages without truncating nested card divs.
 */
export function parseGenericSearchHtml(html: string, baseUrl: string): GogoSearchCandidate[] {
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();

  const pushResult = (rawHref: string, rawTitle: string, rawCover?: string) => {
    const cleanHref = decodeHtmlEntities(rawHref);
    if (!cleanHref || cleanHref.startsWith('#') || cleanHref.startsWith('javascript:')) return;
    if (/\.(?:jpg|jpeg|png|webp|gif|svg|css|js|ico)(?:\?|$)/i.test(cleanHref)) return;
    if (
      /\/(?:wp-content|wp-includes|wp-json|tag|genre|genres|category\/action|author|page\/|login|register|account)\b/i.test(
        cleanHref,
      )
    ) {
      return;
    }

    let absUrl: string;
    try {
      const resolved = new URL(cleanHref, baseUrl);
      const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
      const candHost = resolved.hostname.replace(/^www\./, '');
      if (candHost !== baseHost) return;
      if (resolved.pathname === '/' || resolved.pathname.length < 2) return;
      absUrl = `${resolved.pathname}${resolved.search}`;
    } catch {
      return;
    }

    const cleanTitle = decodeHtmlEntities(rawTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (!cleanTitle || cleanTitle.length < 2) return;
    if (/^(?:home|movies|tv series|anime|genre|schedule|contact|dmca|privacy|bookmark|random|login|sign in)$/i.test(cleanTitle)) {
      return;
    }
    if (seen.has(absUrl)) return;
    seen.add(absUrl);

    let cover: string | null = null;
    if (rawCover) {
      const decodedCover = decodeHtmlEntities(rawCover);
      if (decodedCover && !decodedCover.startsWith('data:')) {
        try {
          const coverUrl = new URL(decodedCover, baseUrl).toString();
          if (/^https?:\/\//i.test(coverUrl)) cover = coverUrl;
        } catch {
          // Ignore malformed cover URL
        }
      }
    }

    results.push({ href: absUrl, title: cleanTitle, cover });
  };

  // Pattern 1: AnimeStream / WordPress / DooPlay card containers (scan up to 1600 chars after container open tag to survive nested divs)
  const cardOpenRe =
    /<(?:article|div|li)[^>]*class="[^"]*(?:result-item|bsx|flw-item|post|anime-card|anime-item|film-item|card|movie-item)[^"]*"[^>]*>/gi;
  let cardMatch: RegExpExecArray | null;
  while ((cardMatch = cardOpenRe.exec(html)) !== null) {
    const startIdx = cardMatch.index + cardMatch[0].length;
    const chunk = html.slice(startIdx, startIdx + 1600);
    const anchorMatch = chunk.match(/<a[^>]+href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/i);
    if (!anchorMatch) continue;
    const href = anchorMatch[1];
    const attrs = anchorMatch[2] || '';
    const inner = anchorMatch[3] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const ttMatch =
      chunk.match(/<div[^>]*class="[^"]*\btt\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      chunk.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i)?.[1];
    const altMatch = chunk.match(/\balt=["']([^"']+)["']/i)?.[1];
    const imgSrc =
      chunk.match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1] || undefined;
    const title = titleAttr || ttMatch || inner || altMatch || '';
    pushResult(href, title, imgSrc);
  }

  // Pattern 2: Direct anchors pointing to anime/series/donghua/watch/toon pages
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let aMatch: RegExpExecArray | null;
  while ((aMatch = anchorRe.exec(html)) !== null) {
    const href = aMatch[1];
    if (
      !/\/(?:series|anime|watch|category|shows|title|movie|donghua|toon|cartoon|drama|v\/)\//i.test(
        href,
      ) &&
      !/-[a-z0-9]+-\d+$/i.test(href)
    ) {
      continue;
    }
    const attrs = aMatch[2] || '';
    const innerText = aMatch[3] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const headingInside = innerText.match(/<(?:h[1-5]|div[^>]*class="[^"]*\btt\b[^"]*")[^>]*>([\s\S]*?)<\/(?:h[1-5]|div)>/i)?.[1];
    const altInside = innerText.match(/\balt=["']([^"']+)["']/i)?.[1];
    const imgInside =
      innerText.match(/<img[^>]+(?:data-src|data-lazy-src|src)=["']([^"']+)["']/i)?.[1] || undefined;
    const title = titleAttr || headingInside || innerText || altInside || '';
    pushResult(href, title, imgInside);
  }

  return results;
}

/**
 * Finds the best matching episode URL(s) inside a series page HTML for the target episodeNumber.
 */
export function parseGenericEpisodeLinks(
  html: string,
  baseUrl: string,
  episodeNumber: number,
): string[] {
  const candidates: Array<{ url: string; score: number }> = [];
  const seen = new Set<string>();
  const ep = Math.floor(episodeNumber);
  const epStr = Number.isInteger(episodeNumber)
    ? String(episodeNumber)
    : String(episodeNumber).replace('.', '-');

  const exactPatterns = [
    new RegExp(`(?:^|[-_/x])(?:ep(?:isode)?[-_]?|s\\d+e|1x|e)0*${ep}(?:$|[^0-9])`, 'i'),
    new RegExp(`[-/]0*${ep}/?$`, 'i'),
  ];

  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = decodeHtmlEntities(m[1]);
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;
    let absUrl: string;
    try {
      const parsed = new URL(rawHref, baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      absUrl = parsed.toString();
    } catch {
      continue;
    }
    if (seen.has(absUrl)) continue;

    const innerText = decodeHtmlEntities((m[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const attrs = m[2] || '';
    const dataNum = attrs.match(/data-(?:number|ep|episode)=["']([^"']+)["']/i)?.[1];

    let score = 0;
    if (dataNum && Number(dataNum) === episodeNumber) score += 100;
    const parsedUrl = new URL(absUrl);
    const pathLower = parsedUrl.pathname.toLowerCase();
    const pathAndQueryLower = `${parsedUrl.pathname}${parsedUrl.search}`.toLowerCase();
    if (exactPatterns.some((re) => re.test(pathLower))) score += 80;
    if (new RegExp(`[?&](?:ep|episode)=0*${ep}(?:$|&)`, 'i').test(pathAndQueryLower)) score += 80;
    if (new RegExp(`(?:^|\\s)(?:ep(?:isode)?\\s*0*${ep}(?:$|[^0-9])|0*${ep}(?:$|\\s*-))`, 'i').test(innerText)) {
      score += 40;
    }
    if (/episode|watch|ep-|\dx\d+|s\d+e\d+/i.test(pathAndQueryLower)) score += 20;
    if (new RegExp(`-episode-0*${epStr}(?:$|\\?|/|-)`, 'i').test(pathLower)) score += 60;

    if (score >= 45) {
      seen.add(absUrl);
      candidates.push({ url: absUrl, score });
    }
  }

  // Also check <select><option value="https://...">Episode X</option></select>
  const optionRe = /<option[^>]+value=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
  while ((m = optionRe.exec(html)) !== null) {
    const rawVal = decodeHtmlEntities(m[1]);
    const label = decodeHtmlEntities((m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (!/^https?:\/\/|^\//i.test(rawVal)) continue;
    try {
      const absUrl = new URL(rawVal, baseUrl).toString();
      if (seen.has(absUrl)) continue;
      if (
        new RegExp(`(?:ep(?:isode)?\\s*0*${ep}(?:$|[^0-9])|^0*${ep}$)`, 'i').test(label) ||
        exactPatterns.some((re) => re.test(absUrl.toLowerCase()))
      ) {
        seen.add(absUrl);
        candidates.push({ url: absUrl, score: 85 });
      }
    } catch {
      // Ignore invalid option URL
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.map((c) => c.url);
}

/**
 * Extracts embed/iframe/server links from an extension's episode page HTML, keeping
 * any audio/language hints (Hindi, English, Japanese, Spanish, Multi-Audio) attached.
 * Also decodes base64-encoded <option value="..."> iframe HTML used by AnimeStream WordPress sites.
 */
function decodeBase64Utf8(raw: string): string {
  const b64 = raw.replace(/-/g, '+').replace(/_/g, '/');
  if (typeof globalThis.atob === 'function') {
    const bin = globalThis.atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }
  return '';
}

export function parseGenericEmbedCandidates(
  html: string,
  baseUrl: string,
): GenericEmbedCandidate[] {
  const embeds: GenericEmbedCandidate[] = [];
  const seen = new Set<string>();

  const pushEmbed = (rawUrl: string, label: string, extraHintText = '') => {
    const decoded = decodeHtmlEntities(rawUrl);
    if (!decoded || decoded.startsWith('data:') || decoded.startsWith('about:')) return;
    let abs: string;
    try {
      const resolved = new URL(decoded, baseUrl);
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return;
      abs = resolved.toString();
    } catch {
      return;
    }
    if (/googlesyndication|doubleclick|facebook\.com|twitter\.com|disqus\.com|recaptcha/i.test(abs)) {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    const hint = inferLangHintFromText(`${label} ${extraHintText} ${abs}`);
    embeds.push({
      label: label.trim() || `Server ${embeds.length + 1}`,
      url: abs,
      langHint: hint,
    });
  };

  // 1. Buttons/tabs with data-video, data-src, data-embed, data-url
  const btnRe =
    /<(?:a|button|li|div|span)[^>]*data-(?:video|src|embed|player|url)=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/(?:a|button|li|div|span)>/gi;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(html)) !== null) {
    const url = m[1];
    const attrs = m[2] || '';
    const inner = decodeHtmlEntities((m[3] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const langAttr = attrs.match(/data-(?:lang|audio|type|name)=["']([^"']+)["']/i)?.[1] || '';
    pushEmbed(url, inner || langAttr || `Server ${embeds.length + 1}`, langAttr);
  }

  // 2. AnimeStream / WordPress <select class="mirror"><option value="BASE64_IFRAME_OR_URL">
  const selectMirrorRe = /<option\b[^>]*value=["']([^"']{8,})["'][^>]*>([\s\S]*?)<\/option>/gi;
  while ((m = selectMirrorRe.exec(html)) !== null) {
    const rawVal = m[1].trim();
    const label = decodeHtmlEntities((m[2] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (/^https?:\/\//i.test(rawVal)) {
      pushEmbed(rawVal, label || `Mirror ${embeds.length + 1}`, label);
      continue;
    }
    if (/^[A-Za-z0-9+/=_-]{12,}$/.test(rawVal)) {
      try {
        const decoded = decodeBase64Utf8(rawVal);
        const iframeSrc =
          decoded.match(/<iframe[^>]+src=["']([^"']+)["']/i)?.[1] ||
          decoded.match(/https?:\/\/[^\s"'<>]+/i)?.[0];
        if (iframeSrc) {
          pushEmbed(iframeSrc, label || `Mirror ${embeds.length + 1}`, label);
        }
      } catch {
        // Not valid base64 embed option
      }
    }
  }

  // 3. Iframes (src / data-src / data-litespeed-src)
  const iframeRe = /<iframe\b([^>]*)>/gi;
  while ((m = iframeRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const src =
      attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bdata-litespeed-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (!src) continue;
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || '';
    const langAttr = attrs.match(/data-(?:lang|audio)=["']([^"']+)["']/i)?.[1] || '';
    pushEmbed(src, titleAttr || langAttr || `Embed ${embeds.length + 1}`, langAttr);
  }

  return embeds;
}

export function sortEmbedsForAudioLanguage<T extends { label: string; url: string; langHint?: string }>(
  embeds: T[],
  options: {
    audioLanguage?: string | null;
    serverId?: string | null;
    serverName?: string | null;
  },
): T[] {
  const reqAudio = (options.audioLanguage || '').toLowerCase();
  const preferHd2 =
    options.serverId === 'hd-2-sub' ||
    options.serverId === 'direct-mp4' ||
    /hd-2/i.test(options.serverName || '');

  const indexed = embeds.map((emb, idx) => {
    let score = 0;
    const combined = `${emb.label} ${emb.langHint || ''} ${emb.url}`.toLowerCase();
    const isHindi = emb.langHint === 'hi' || /\bhindi\b|\bhin\b/.test(combined);
    const isSpanish =
      emb.langHint === 'es' || /\bspanish\b|\bespanol\b|\blatino\b|\bcastellano\b/.test(combined);
    const isEnglish = emb.langHint === 'en' || /\benglish\b|\beng\b|\bdub\b/.test(combined);
    const isJapanese = emb.langHint === 'ja' || /\bjapanese\b|\bjap\b|\bsub\b/.test(combined);
    const isMulti = emb.langHint === 'multi' || /\bmulti[\s-]?audio\b|\bdual[\s-]?audio\b/.test(combined);

    if (reqAudio === 'hi') {
      if (isHindi) score += 100;
      else if (isMulti) score += 60;
      else if (isEnglish || isJapanese) score -= 20;
    } else if (reqAudio === 'es') {
      if (isSpanish) score += 100;
      else if (isMulti) score += 60;
      else if (isEnglish || isJapanese) score -= 20;
    } else if (reqAudio === 'en') {
      if (isEnglish && !isHindi && !isSpanish) score += 80;
      else if (isMulti) score += 45;
      else if (isHindi || isSpanish) score -= 30;
    } else if (reqAudio === 'ja') {
      if (isJapanese && !isHindi && !isSpanish) score += 80;
      else if (isHindi || isSpanish) score -= 30;
    }

    if (preferHd2 && idx === 1) score += 15;
    return { emb, idx, score };
  });

  indexed.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));
  return indexed.map((item) => item.emb);
}

/**
 * Unpacks Dean Edwards `eval(function(p,a,c,k,e,d){...})` obfuscated player scripts
 * commonly used by StreamWish / Filemoon / Vidhide / custom extension embeds.
 */
export function unpackDeanEdwardsPacker(source: string): string {
  const packerRe =
    /eval\(function\(p,a,c,k,e,[dr]\)\{[\s\S]*?\}\('([\s\S]*?)',\s*(\d+),\s*(\d+),\s*'([^']*)'\.split\('\|'\)/i;
  const match = source.match(packerRe);
  if (!match) return source;
  const payload = match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  const radix = Number.parseInt(match[2], 10);
  const count = Number.parseInt(match[3], 10);
  const symtab = match[4].split('|');
  if (!Number.isFinite(radix) || radix < 2 || radix > 62 || symtab.length === 0 || count <= 0) {
    return source;
  }

  const encodeBase = (val: number): string => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    if (val < radix) {
      return val < 36 ? val.toString(36) : String.fromCharCode(val + 29);
    }
    return encodeBase(Math.floor(val / radix)) + chars[val % radix];
  };

  const dict = new Map<string, string>();
  for (let i = 0; i < Math.min(count, symtab.length); i++) {
    const key = encodeBase(i);
    dict.set(key, symtab[i] || key);
  }

  return payload.replace(/\b\w+\b/g, (word) => dict.get(word) ?? word);
}

/**
 * Extracts direct playable HLS (.m3u8) or MP4 stream URLs from embed/player HTML or JS.
 */
export function extractDirectVideoUrlFromHtmlOrScript(
  html: string,
  baseUrl: string,
): string | null {
  const unpacked = unpackDeanEdwardsPacker(html);
  // Also decode inline atob('...') segments
  const atobDecoded: string[] = [];
  const atobRe = /atob\(\s*["']([A-Za-z0-9+/=_-]{12,})["']\s*\)/g;
  let am: RegExpExecArray | null;
  while ((am = atobRe.exec(html)) !== null) {
    try {
      const decoded = decodeBase64Utf8(am[1]);
      if (decoded) atobDecoded.push(decoded);
    } catch {
      // Ignore malformed base64
    }
  }
  const combined = `${html}\n${unpacked}\n${atobDecoded.join('\n')}`;

  const tryNormalize = (raw: string): string | null => {
    const cleaned = decodeHtmlEntities(raw).replace(/\\\//g, '/').trim();
    if (!cleaned || cleaned.startsWith('data:') || cleaned.startsWith('blob:')) return null;
    if (/thumbnails\.vtt|\.vtt(?:\?|$)/i.test(cleaned)) return null;
    try {
      const abs = new URL(cleaned, baseUrl).toString();
      return /^https?:\/\//i.test(abs) ? abs : null;
    } catch {
      return null;
    }
  };

  // Priority 1: Explicit m3u8 URLs
  const m3u8Matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.m3u8(?:[^\s"'<>\\]*)/gi) || [];
  for (const cand of m3u8Matches) {
    const normalized = tryNormalize(cand);
    if (normalized) return normalized;
  }

  // Priority 2: JSON/JS player config fields: sources: [{ file: "..." }], "hls": "...", hls.loadSource("...")
  const configPatterns = [
    /(?:sources?\s*:\s*\[\s*\{[^}]*?(?:file|src|url)\s*:\s*["'])([^"']+)["']/i,
    /["'](?:hls|file|stream|video_url)["']\s*:\s*["']([^"']+)["']/i,
    /\bfile\s*:\s*["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i,
    /loadSource\(\s*["']([^"']+)["']\s*\)/i,
    /<source[^>]+src=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+)["']/i,
  ];
  for (const re of configPatterns) {
    const m = combined.match(re);
    if (m?.[1]) {
      const normalized = tryNormalize(m[1]);
      if (normalized) return normalized;
    }
  }

  // Priority 3: Direct MP4 URLs
  const mp4Matches = combined.match(/https?:\/\/[^\s"'<>\\]+\.mp4(?:[^\s"'<>\\]*)/gi) || [];
  for (const cand of mp4Matches) {
    const normalized = tryNormalize(cand);
    if (normalized) return normalized;
  }

  return null;
}

/**
 * Determines whether the Wrong Title? modal should search the selected external extension
 * instead of global AniList/Jikan metadata.
 * - ShizuTv Stream (Inbuilt) & reading media keep existing global metadata search.
 */
export function shouldUseExtensionWrongTitleSearch(params: {
  sourceId?: string | null;
  isReadingMedia?: boolean;
}): boolean {
  if (params.isReadingMedia) return false;
  const cleanId = typeof params.sourceId === 'string' ? params.sourceId.trim() : '';
  return Boolean(cleanId && cleanId !== 'shonenx-hls-inbuilt');
}

/**
 * Validates that a manual source-entry override still belongs to the currently active source.
 */
export function isMatchedSourceEntryValidForSource<T extends { sourceId?: string | null; href?: string | null }>(
  entry: T | null | undefined,
  activeSourceId?: string | null,
): entry is T {
  if (!entry || !entry.href) return false;
  const entrySource = typeof entry.sourceId === 'string' ? entry.sourceId.trim() : '';
  const targetSource = typeof activeSourceId === 'string' ? activeSourceId.trim() : '';
  if (!targetSource || targetSource === 'shonenx-hls-inbuilt') return false;
  return Boolean(entrySource && entrySource === targetSource);
}

/**
 * Detects empty client-rendered SPA shells (Vite/React/Next/Turnstile JS boots)
 * where server-side HTML scraping cannot execute the site's frontend search or playback.
 */
export function looksLikeClientSpaHtml(html: string): boolean {
  if (!html) return false;
  const hasEmptyMount =
    /<div\s+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html) ||
    /<body[^>]*>\s*<div\s+id=["'](?:root|app)["'][^>]*>\s*<\/div>\s*(?:<script|<\/body)/i.test(html);
  const hasTurnstileBoot =
    /turnstile_site_key|challenges\.cloudflare\.com\/turnstile/i.test(html);
  const hasNextDataPayload = /<script\s+id=["']__NEXT_DATA__["'][^>]*>\s*\{[\s\S]{80,}/i.test(html);
  const anchorCount = (html.match(/<a\b[^>]*href=/gi) || []).length;
  if (hasTurnstileBoot && anchorCount <= 3) return true;
  if (hasEmptyMount && !hasNextDataPayload && anchorCount <= 3) return true;
  return false;
}

export function detectExtensionWebCompatibilityIssue(params: {
  status: number;
  html: string;
  sourceLabel: string;
  host: string;
  parsedCandidatesCount?: number;
}): string | null {
  const { status, html, sourceLabel, host, parsedCandidatesCount = 0 } = params;

  if (status === 403 || status === 429 || status === 503) {
    return `${sourceLabel} (${host}) is protected by an anti-bot challenge or upstream access restriction (HTTP ${status}) and cannot be searched directly by the web adapter.`;
  }

  if (
    /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(html) ||
    (parsedCandidatesCount === 0 &&
      /just a moment|cf-challenge|attention required|enable javascript and cookies/i.test(html))
  ) {
    return `${sourceLabel} (${host}) is protected by an anti-bot challenge (HTTP ${status}) and cannot be searched directly by the web adapter.`;
  }

  if (parsedCandidatesCount === 0 && looksLikeClientSpaHtml(html)) {
    const usesTurnstile = /turnstile_site_key|challenges\.cloudflare\.com\/turnstile/i.test(html);
    return usesTurnstile
      ? `${sourceLabel} (${host}) uses a JavaScript app with Turnstile protection and cannot be searched or played through this web HTML adapter.`
      : `${sourceLabel} (${host}) is a client-rendered JavaScript app without server-rendered search results, so this web HTML adapter cannot search it.`;
  }

  return null;
}

/**
 * Checks whether a parsed HTML search candidate actually relates to the user's search query
 * (filtering out unrelated sidebar/nav links returned on generic HTML pages).
 */
export function matchesExtensionSearchQuery(
  candidate: GogoSearchCandidate,
  query: string,
): boolean {
  const cleanQuery = normalizeTitleForMatch(query);
  if (!cleanQuery) return false;
  const slug = extractSlugFromGogoHref(candidate.href).toLowerCase();
  const candNorm = normalizeTitleForMatch(candidate.title || slug.replace(/-/g, ' '));
  const slugNorm = normalizeTitleForMatch(slug.replace(/-/g, ' '));
  if (!candNorm && !slugNorm) return false;

  if (
    candNorm.includes(cleanQuery) ||
    slugNorm.includes(cleanQuery) ||
    cleanQuery.includes(candNorm)
  ) {
    return true;
  }

  const queryTokens = meaningfulTokens(cleanQuery);
  if (queryTokens.length === 0) return false;
  const candTokenSet = new Set([
    ...tokenizeNormalized(candNorm),
    ...tokenizeNormalized(slugNorm),
  ]);
  const hits = queryTokens.filter((tok) =>
    Array.from(candTokenSet).some((ct) => ct === tok || (tok.length >= 4 && ct.startsWith(tok))),
  ).length;
  const minNeeded =
    queryTokens.length === 1 ? 1 : Math.max(1, Math.ceil(queryTokens.length * 0.5));
  return hits >= minNeeded;
}

export function rankExtensionSearchCandidates<T extends GogoSearchCandidate>(
  candidates: T[],
  query: string,
  format?: string | null,
): Array<T & { score: number }> {
  return candidates
    .filter((c) => matchesExtensionSearchQuery(c, query))
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, {
        titles: [query],
        category: 'sub',
        format,
        audioLanguage: 'ja',
      }),
    }))
    .sort((a, b) => b.score - a.score);
}

export interface ParsedSourceEpisode {
  sourceEpisodeId: string;
  number: number;
  title: string;
  episodeUrl: string;
  isFiller?: boolean;
}

/**
 * Determines whether episode list fetching should use the selected external anime entry
 * directly instead of global AniList/Jikan/AniZip/Kitsu metadata.
 */
export function shouldUseExtensionEpisodesForSelection<
  T extends { sourceId?: string | null; href?: string | null },
>(params: {
  sourceId?: string | null;
  isReadingMedia?: boolean;
  selectedSourceEntry?: T | null;
}): boolean {
  if (params.isReadingMedia) return false;
  return isMatchedSourceEntryValidForSource(params.selectedSourceEntry, params.sourceId);
}

/**
 * Validates that a source-specific episode payload matches the active sourceId.
 */
export function isMatchedEpisodeValidForSource<
  T extends { sourceId?: string | null; sourceEpisodeId?: string | null; episodeUrl?: string | null },
>(episode: T | null | undefined, activeSourceId?: string | null): episode is T {
  if (!episode) return false;
  const targetSource = typeof activeSourceId === 'string' ? activeSourceId.trim() : '';
  if (!targetSource || targetSource === 'shonenx-hls-inbuilt') return false;
  if (!episode.sourceEpisodeId && !episode.episodeUrl) return false;
  const epSource = typeof episode.sourceId === 'string' ? episode.sourceId.trim() : '';
  return !epSource || epSource === targetSource;
}

function parseEpisodeNumberFromSignals(signals: Array<string | undefined | null>): number | null {
  for (const raw of signals) {
    if (!raw) continue;
    const text = decodeHtmlEntities(String(raw)).trim();
    if (!text) continue;

    // Plain numeric or "Season - Ep" (e.g. "13", "12.5", "1 - 14")
    const numerandoMatch = text.match(/^\d+\s*[-–x]\s*(\d+(?:\.\d+)?)$/i);
    if (numerandoMatch) {
      const n = Number.parseFloat(numerandoMatch[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }

    if (/^\d+(?:\.\d+)?$/.test(text)) {
      const n = Number.parseFloat(text);
      if (Number.isFinite(n) && n >= 0) return n;
    }

    const epPatternMatch =
      text.match(/(?:^|[^a-z0-9])(?:ep(?:isode)?|e|chap(?:ter)?)[.\s_-]*0*(\d+(?:\.\d+)?)(?:$|[^0-9])/i) ||
      text.match(/(?:^|[-_/])s\d+e0*(\d+(?:\.\d+)?)(?:$|[^0-9])/i) ||
      text.match(/[?&](?:ep|episode)=0*(\d+(?:\.\d+)?)(?:$|&)/i);
    if (epPatternMatch) {
      const n = Number.parseFloat(epPatternMatch[1]);
      if (Number.isFinite(n) && n >= 0) return n;
    }
  }
  return null;
}

/**
 * Extracts actual episode items from a source anime page or AJAX episode list HTML,
 * preserving exact source episode IDs, episode numbers, titles, URLs, and ordering.
 */
export function parseSourceEpisodeListHtml(
  html: string,
  baseUrl: string,
  options?: { animeHref?: string | null; animeSlug?: string | null },
): ParsedSourceEpisode[] {
  if (!html) return [];

  const results: ParsedSourceEpisode[] = [];
  const seenUrls = new Set<string>();
  const slugTokens = normalizeTitleForMatch(
    String(options?.animeSlug || extractSlugFromGogoHref(options?.animeHref || '')).replace(/-/g, ' '),
  )
    .split(/\s+/)
    .filter((t) => t.length >= 3);

  const pushEpisode = (candidate: {
    rawUrl: string;
    explicitId?: string | null;
    explicitNumber?: string | null;
    title?: string | null;
    innerText?: string | null;
    isFiller?: boolean;
  }) => {
    const cleanHref = decodeHtmlEntities(candidate.rawUrl);
    if (!cleanHref || cleanHref.startsWith('#') || cleanHref.startsWith('javascript:')) return;

    let normalizedUrl: string;
    let pathAndQuery: string;
    try {
      const parsed = new URL(cleanHref, baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
      const candHost = parsed.hostname.replace(/^www\./, '');
      if (candHost !== baseHost) return;
      pathAndQuery = `${parsed.pathname}${parsed.search}`;
      normalizedUrl = pathAndQuery;
    } catch {
      return;
    }

    if (seenUrls.has(normalizedUrl)) return;

    const cleanTitleAttr = candidate.title
      ? decodeHtmlEntities(candidate.title.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
      : '';
    const cleanInner = candidate.innerText
      ? decodeHtmlEntities(candidate.innerText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '))
      : '';

    const parsedNum = parseEpisodeNumberFromSignals([
      candidate.explicitNumber,
      cleanTitleAttr,
      cleanInner,
      pathAndQuery,
    ]);
    if (parsedNum === null) return;

    const sourceEpisodeId =
      (candidate.explicitId && candidate.explicitId.trim()) ||
      pathAndQuery.match(/[?&](?:ep|episode)=([^&]+)/i)?.[1] ||
      extractSlugFromGogoHref(pathAndQuery) ||
      pathAndQuery;

    // Avoid pure generic placeholder titles if the site supplied an actual episode name
    const fallbackTitle = `Episode ${parsedNum}`;
    const chosenTitle =
      cleanTitleAttr && !/^\d+(?:\.\d+)?$/.test(cleanTitleAttr)
        ? cleanTitleAttr
        : cleanInner && !/^(?:ep(?:isode)?\s*)?\d+(?:\.\d+)?(?:\s*(?:sub|dub|raw))?$/i.test(cleanInner)
          ? cleanInner
          : fallbackTitle;

    seenUrls.add(normalizedUrl);
    results.push({
      sourceEpisodeId,
      number: parsedNum,
      title: chosenTitle,
      episodeUrl: normalizedUrl,
      isFiller: candidate.isFiller,
    });
  };

  // 1. HiAnime / AniWatch AJAX episode items (<a class="...ep-item..." data-number="13" data-id="9876" href="...">)
  const hiItemRe = /<a\b([^>]*\bclass=["'][^"']*\bep-item\b[^"']*["'][^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = hiItemRe.exec(html)) !== null) {
    const attrs = m[1] || '';
    const inner = m[2] || '';
    const href = attrs.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) continue;
    const dataId = attrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1] || null;
    const dataNum = attrs.match(/\bdata-number=["']([^"']+)["']/i)?.[1] || null;
    const epName =
      inner.match(/class=["'][^"']*\bep-name\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
      attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] ||
      '';
    const isFiller = /\bssl-item-filler\b/i.test(attrs);
    pushEpisode({
      rawUrl: href,
      explicitId: dataId,
      explicitNumber: dataNum,
      title: epName,
      innerText: inner,
      isFiller,
    });
  }
  if (results.length > 0) return results;

  // 2. AnimeStream / WordPress / DooPlay / Gogo episode list containers
  const containerAnchorPatterns = [
    // AnimeStream .eplister <li><a href="..."><div class="epl-num">14</div><div class="epl-title">...</div></a></li>
    /<div[^>]*class=["'][^"']*\beplister\b[^"']*["'][^>]*>[\s\S]*?<\/ul>/gi,
    // GogoAnime #episode_related / AJAX episode list
    /<ul[^>]*(?:id=["']episode_related["']|class=["'][^"']*\b(?:episodios|episodes-list|episode-list)\b[^"']*["'])[^>]*>[\s\S]*?<\/ul>/gi,
  ];

  for (const containerRe of containerAnchorPatterns) {
    let cm: RegExpExecArray | null;
    while ((cm = containerRe.exec(html)) !== null) {
      const block = cm[0];
      const liOrAnchorRe = /<li\b([^>]*)>([\s\S]*?)<\/li>|<a\b([^>]*href=["'][^"']+["'][^>]*)>([\s\S]*?)<\/a>/gi;
      let im: RegExpExecArray | null;
      while ((im = liOrAnchorRe.exec(block)) !== null) {
        const chunk = im[0];
        const aMatch = chunk.match(/<a\b([^>]*href=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/a>/i);
        if (!aMatch) continue;
        const attrs = aMatch[1] || '';
        const href = aMatch[2];
        const inner = aMatch[3] || '';
        const explicitId = attrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1] || null;
        const explicitNum =
          attrs.match(/\bdata-(?:number|ep|episode)=["']([^"']+)["']/i)?.[1] ||
          chunk.match(/<div[^>]*class=["'][^"']*\b(?:epl-num|numerando)\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
          chunk.match(/<div[^>]*class=["'][^"']*\bname\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
          null;
        const epTitle =
          chunk.match(/<div[^>]*class=["'][^"']*\bepl-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1] ||
          attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] ||
          null;
        pushEpisode({
          rawUrl: href,
          explicitId,
          explicitNumber: explicitNum,
          title: epTitle,
          innerText: inner,
        });
      }
    }
    if (results.length > 0) return results;
  }

  // 3. Direct anchors or <option> lists on a series page that reference episodes of this anime
  const directAnchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = directAnchorRe.exec(html)) !== null) {
    const rawHref = m[1];
    const attrs = m[2] || '';
    const inner = m[3] || '';
    const explicitNum = attrs.match(/\bdata-(?:number|ep|episode)=["']([^"']+)["']/i)?.[1] || null;
    const explicitId = attrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1] || null;
    const lowerHref = rawHref.toLowerCase();
    const isExplicitEpisodeLink =
      Boolean(explicitNum) ||
      /-episode-\d+(?:\.\d+)?/i.test(lowerHref) ||
      /\/watch\//i.test(lowerHref) ||
      /[?&](?:ep|episode)=\d+/i.test(lowerHref) ||
      /s\d+e\d+/i.test(lowerHref);
    if (!isExplicitEpisodeLink) continue;

    // When matching generic page anchors (outside episode containers), ensure unrelated sidebar
    // shows from other slugs do not pollute this series' episode list
    if (!explicitNum && slugTokens.length > 0) {
      const hrefNorm = normalizeTitleForMatch(rawHref.replace(/-/g, ' '));
      const overlapsSeries = slugTokens.some((tok) => hrefNorm.includes(tok));
      if (!overlapsSeries) continue;
    }

    pushEpisode({
      rawUrl: rawHref,
      explicitId,
      explicitNumber: explicitNum,
      title: attrs.match(/\btitle=["']([^"']+)["']/i)?.[1] || null,
      innerText: inner,
    });
  }

  if (results.length === 0) {
    const optionRe = /<option\b([^>]*value=["']([^"']+)["'][^>]*)>([\s\S]*?)<\/option>/gi;
    while ((m = optionRe.exec(html)) !== null) {
      const attrs = m[1] || '';
      const rawVal = m[2];
      const label = m[3] || '';
      if (!/^https?:\/\/|^\//i.test(rawVal)) continue;
      if (!/(?:ep(?:isode)?|watch|s\d+e\d+)/i.test(`${rawVal} ${label}`)) continue;
      pushEpisode({
        rawUrl: rawVal,
        explicitId: attrs.match(/\bdata-id=["']([^"']+)["']/i)?.[1] || null,
        explicitNumber: attrs.match(/\bdata-(?:number|ep|episode)=["']([^"']+)["']/i)?.[1] || null,
        title: label,
        innerText: label,
      });
    }
  }

  return results;
}

export function isGotakuHost(hostOrUrl?: string | null): boolean {
  if (!hostOrUrl) return false;
  try {
    const hostname = new URL(hostOrUrl.trim()).hostname.toLowerCase().replace(/^www\./, '');
    return hostname === 'gotaku.to' || hostname.endsWith('.gotaku.to');
  } catch {
    return /\bgotaku\.to\b/i.test(hostOrUrl);
  }
}

export function extractGotakuTitleId(hrefOrSlug?: string | null): string | null {
  if (!hrefOrSlug) return null;
  const cleaned = String(hrefOrSlug).trim();
  const titleMatch = cleaned.match(/\/?title\/([a-z0-9]{4,16})(?:[/?#]|$)/i);
  if (titleMatch?.[1]) return titleMatch[1];
  if (/^[a-z0-9]{4,16}$/i.test(cleaned)) return cleaned;
  return null;
}

export function parseGotakuTitleSearchJson(
  payload: unknown,
  baseUrl = 'https://gotaku.to',
): GogoSearchCandidate[] {
  if (!payload || typeof payload !== 'object') return [];
  const rawList = Array.isArray((payload as { data?: unknown }).data)
    ? ((payload as { data: unknown[] }).data)
    : [];
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();

  for (const row of rawList) {
    if (!row || typeof row !== 'object') continue;
    const item = row as Record<string, unknown>;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const title = typeof item.name === 'string' ? item.name.trim() : '';
    const rawUrl = typeof item.url === 'string' ? item.url.trim() : id ? `/title/${id}` : '';
    if (!title || !rawUrl) continue;

    let href = rawUrl;
    try {
      const parsed = new URL(rawUrl, baseUrl);
      href = `${parsed.pathname}${parsed.search}`;
    } catch {
      if (!href.startsWith('/')) href = `/${href}`;
    }

    if (seen.has(href)) continue;
    seen.add(href);

    const rawCover =
      typeof item.poster_url === 'string' && /^https?:\/\//i.test(item.poster_url.trim())
        ? item.poster_url.trim()
        : null;

    results.push({
      href,
      title,
      cover: rawCover,
    });
  }

  return results;
}

export class ExtensionCapabilityError extends Error {
  readonly code: ExtensionCapabilityErrorCode;
  readonly capability?: ExtensionCapabilityName;
  readonly sourceId: string;
  readonly sourceLabel: string;
  readonly reason: string;
  readonly statusCode: number;

  constructor(params: {
    code: ExtensionCapabilityErrorCode;
    capability?: ExtensionCapabilityName;
    sourceId: string;
    sourceLabel?: string;
    reason: string;
    statusCode?: number;
  }) {
    super(params.reason);
    this.name = 'ExtensionCapabilityError';
    this.code = params.code;
    this.capability = params.capability;
    this.sourceId = params.sourceId;
    this.sourceLabel = params.sourceLabel || params.sourceId;
    this.reason = params.reason;
    this.statusCode =
      params.statusCode ??
      (params.code === 'EXECUTION_FAILED'
        ? 502
        : params.code === 'INVALID_INPUT'
          ? 400
          : 422);
  }

  get isUnsupported(): boolean {
    return (
      this.code === 'UNSUPPORTED_CAPABILITY' ||
      this.code === 'UNVERIFIED_CAPABILITY' ||
      this.code === 'METADATA_ONLY_SOURCE' ||
      this.code === 'PROTECTED_SOURCE' ||
      this.code === 'MISSING_BASE_URL'
    );
  }
}

export function looksLikeBlockedChallengeHtml(status: number, body: string): boolean {
  if (status === 403 || status === 429 || status === 503) {
    if (/just a moment|cf-challenge|cloudflare|attention required|enable javascript/i.test(body)) {
      return true;
    }
  }
  return /<title>\s*Just a moment\.\.\.\s*<\/title>/i.test(body);
}

export function extractNumericIdFromHref(href: string): string | null {
  const match = String(href || '').match(/-(\d+)(?:\?|$|\/)/);
  return match?.[1] || null;
}

export function filterAndRankSearchCandidates<T extends GogoSearchCandidate>(
  candidates: Iterable<T>,
  options: {
    titles: string[];
    category: 'sub' | 'dub' | 'raw';
    format?: string | null;
    audioLanguage?: StreamAudioLanguage | string | null;
  },
): Array<T & { score: number }> {
  return Array.from(candidates)
    .filter((c) => isViableTitleMatch(c, options.titles, options.format))
    .map((c) => ({
      ...c,
      score: scoreGogoSearchCandidate(c, options),
    }))
    .sort((a, b) => b.score - a.score);
}

export function normalizeProviderSearchItems(
  sourceId: string,
  candidates: GogoSearchCandidate[],
  limit = 15,
): MatchedSourceEntry[] {
  return candidates.slice(0, limit).map((cand) => ({
    sourceId,
    title: cand.title,
    href: cand.href,
    slug: extractSlugFromGogoHref(cand.href),
    cover: cand.cover ?? null,
  }));
}

export function normalizeProviderEpisodes(params: {
  sourceId: string;
  host: string;
  sourceAnimeHref: string;
  sourceAnimeSlug: string;
  episodes: ParsedSourceEpisode[];
}): UnifiedEpisode[] {
  const seenIds = new Set<string>();
  return params.episodes.map((ep, idx) => {
    let id = `${params.sourceId}:${ep.sourceEpisodeId}`;
    if (seenIds.has(id)) id = `${id}:${idx}`;
    seenIds.add(id);

    let externalUrl = ep.episodeUrl;
    try {
      const resolved = new URL(ep.episodeUrl, params.host).toString();
      if (/^https?:\/\//i.test(resolved)) externalUrl = resolved;
    } catch {
      // Keep original URL when relative fallback cannot be resolved
    }

    return {
      id,
      number: ep.number,
      title: ep.title,
      isFiller: ep.isFiller,
      externalUrl,
      sourceId: params.sourceId,
      sourceEpisodeId: ep.sourceEpisodeId,
      episodeUrl: ep.episodeUrl,
      sourceAnimeHref: params.sourceAnimeHref,
      sourceAnimeSlug: params.sourceAnimeSlug,
    };
  });
}

export type SourceProfileKind =
  | 'inbuilt-anime'
  | 'hianime'
  | 'gogo-clone'
  | 'wordpress-animestream'
  | 'gotaku'
  | 'metadata-only'
  | 'missing-host'
  | 'non-anime'
  | 'generic-web';

export interface DetectedSourceProfile {
  kind: SourceProfileKind;
  sourceId: string;
  sourceLabel: string;
  isMetadataOnly: boolean;
  hosts: string[];
  capabilities: ExtensionAdapterCapabilities;
  compatibility: ExtensionSourceCompatibilityReport;
}

function extractHostnames(hosts: string[]): string[] {
  return hosts
    .map((h) => {
      try {
        return new URL(h).hostname.toLowerCase().replace(/^www\./, '');
      } catch {
        return '';
      }
    })
    .filter(Boolean);
}

export function isHiAnimeCompatibleSource(params: {
  sourceId?: string | null;
  sourcePkg?: string | null;
  hosts: string[];
}): boolean {
  if (params.sourceId === 'hianime-bridge') return true;
  const pkg = (params.sourcePkg || '').toLowerCase();
  if (/\.(?:hianime|aniwatch|kaido)\b/.test(pkg)) return true;
  const hostnames = extractHostnames(params.hosts);
  return hostnames.some((host) =>
    /(?:^|\.)(?:hianime[a-z0-9-]*|aniwatch(?:tv)?|kaido)\.(?!example$)[a-z]{2,}$/i.test(host),
  );
}

export function isGogoCloneCompatibleSource(params: {
  sourceId?: string | null;
  sourcePkg?: string | null;
  hosts: string[];
}): boolean {
  if (params.sourceId === 'shonenx-hls-inbuilt') return false;
  const pkg = (params.sourcePkg || '').toLowerCase();
  if (/\.(?:gogoanime|anitaku)\b/.test(pkg)) return true;
  const hostnames = extractHostnames(params.hosts);
  return hostnames.some((host) =>
    /(?:^|\.)(?:gogoanime[0-9a-z-]*|gogoanimes|anitaku|gogohd)\.(?!example$)[a-z]{2,}$/i.test(host),
  );
}

export function isWordPressAnimeCompatibleSource(params: {
  sourceId?: string | null;
  sourcePkg?: string | null;
  hosts: string[];
}): boolean {
  const pkg = (params.sourcePkg || '').toLowerCase();
  if (
    /\.(?:animexin|luciferdonghua|lmanime|donghuastream|toonstream|animehindiworld|deadtoons)\b/.test(
      pkg,
    )
  ) {
    return true;
  }
  const hostnames = extractHostnames(params.hosts);
  return hostnames.some((host) =>
    /(?:^|\.)(?:animexin|luciferdonghua|lmanime|donghuastream|toonstream|animehindiworld|deadtoons)\.(?!example$)[a-z]{2,}$/i.test(
      host,
    ),
  );
}

export function assessExtensionCompatibility(params: {
  adapterId: string;
  sourceId: string;
  sourceLabel: string;
  providerKind: string;
  isMetadataOnly: boolean;
  capabilities: ExtensionAdapterCapabilities;
}): ExtensionSourceCompatibilityReport {
  const required: ExtensionCapabilityName[] = ['search', 'episodes', 'stream'];
  const descriptors = required.map((key) => params.capabilities[key]);

  if (params.isMetadataOnly) {
    const reason =
      params.capabilities.stream.reason ||
      params.capabilities.episodes.reason ||
      `${params.sourceLabel} is a metadata/tracking catalog and does not host playable video streams.`;
    return {
      adapterId: params.adapterId,
      sourceId: params.sourceId,
      sourceLabel: params.sourceLabel,
      providerKind: params.providerKind,
      isMetadataOnly: true,
      fullyCompatible: false,
      compatibility: 'unsupported',
      reason,
      capabilities: params.capabilities,
    };
  }

  const hasVerifiedAll = descriptors.every(
    (d) => d.state === 'verified' && d.verified === true,
  );
  if (hasVerifiedAll) {
    return {
      adapterId: params.adapterId,
      sourceId: params.sourceId,
      sourceLabel: params.sourceLabel,
      providerKind: params.providerKind,
      isMetadataOnly: false,
      fullyCompatible: true,
      compatibility: 'full',
      capabilities: params.capabilities,
    };
  }

  const hasAnyUsable = descriptors.some(
    (d) => d.state === 'verified' || d.state === 'supported',
  );
  const hasUnsupported = descriptors.some(
    (d) => d.state === 'unsupported' || d.state === 'unavailable',
  );
  const firstReason = descriptors.find((d) => d.reason)?.reason;

  let compatibility: ExtensionAdapterCompatibilityLevel;
  if (!hasAnyUsable && hasUnsupported) {
    compatibility = 'unsupported';
  } else if (hasAnyUsable && hasUnsupported) {
    compatibility = 'partial';
  } else {
    compatibility = 'unverified';
  }

  return {
    adapterId: params.adapterId,
    sourceId: params.sourceId,
    sourceLabel: params.sourceLabel,
    providerKind: params.providerKind,
    isMetadataOnly: false,
    fullyCompatible: false,
    compatibility,
    reason: firstReason,
    capabilities: params.capabilities,
  };
}

export function detectSourceProfile(source: {
  id: string;
  name?: string | null;
  type?: 'inbuilt' | 'extension' | string | null;
  mediaTypes?: string[] | null;
  baseUrl?: string | null;
  pkg?: string | null;
}): DetectedSourceProfile {
  const cleanId = String(source.id || '').trim() || 'shonenx-hls-inbuilt';
  const sourceLabel = String(source.name || cleanId).trim() || cleanId;
  const isMetadataOnly = isMetadataOnlyCatalogHost(
    source.baseUrl,
    sourceLabel,
    source.pkg,
    cleanId,
  );

  const mediaTypes = Array.isArray(source.mediaTypes)
    ? source.mediaTypes.map((m) => String(m).toUpperCase())
    : [];
  const hasAnimeSupport =
    mediaTypes.length === 0 ||
    mediaTypes.includes('ANIME') ||
    mediaTypes.includes('MOVIE') ||
    mediaTypes.includes('TV');

  const hostPlan = resolveProviderHostPlan({
    sourceId: cleanId,
    sourceName: sourceLabel,
    sourceBaseUrl: source.baseUrl,
  });

  if (isMetadataOnly) {
    const reason = `${sourceLabel} is a metadata/tracking catalog and does not host playable video streams.`;
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'unsupported', verified: false, reason },
      episodes: { state: 'unsupported', verified: false, reason },
      stream: { state: 'unsupported', verified: false, reason },
    };
    return {
      kind: 'metadata-only',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: true,
      hosts: [],
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'metadata-only',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'metadata-only',
        isMetadataOnly: true,
        capabilities,
      }),
    };
  }

  if (!hasAnimeSupport) {
    const reason = `${sourceLabel} does not declare ANIME playback support.`;
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'unsupported', verified: false, reason },
      episodes: { state: 'unsupported', verified: false, reason },
      stream: { state: 'unsupported', verified: false, reason },
    };
    return {
      kind: 'non-anime',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'non-anime',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'non-anime',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (hostPlan.mode === 'inbuilt') {
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'verified', verified: true },
      episodes: { state: 'verified', verified: true },
      stream: { state: 'verified', verified: true },
    };
    return {
      kind: 'inbuilt-anime',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'shizutv-inbuilt',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'inbuilt-anime',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (hostPlan.mode === 'missing-host' || hostPlan.hosts.length === 0) {
    const reason = `Extension "${sourceLabel}" does not have a valid HTTP base URL configured.`;
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'unsupported', verified: false, reason },
      episodes: { state: 'unsupported', verified: false, reason },
      stream: { state: 'unsupported', verified: false, reason },
    };
    return {
      kind: 'missing-host',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: [],
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'missing-host',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'missing-host',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (hostPlan.hosts.some((h) => isGotakuHost(h))) {
    const hostLabel = hostPlan.hosts[0] || 'https://gotaku.to';
    const unsupportedReason = `${sourceLabel} (${hostLabel}) supports title search via its public catalog API, but episode lists and video playback are protected by encrypted binary payloads and Turnstile, which are unsupported by this web adapter.`;
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'verified', verified: true },
      episodes: { state: 'unsupported', verified: false, reason: unsupportedReason },
      stream: { state: 'unsupported', verified: false, reason: unsupportedReason },
    };
    return {
      kind: 'gotaku',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'gotaku-catalog',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'gotaku',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (
    hostPlan.mode === 'hianime' ||
    isHiAnimeCompatibleSource({
      sourceId: cleanId,
      sourcePkg: source.pkg,
      hosts: hostPlan.hosts,
    })
  ) {
    const adapterId = cleanId === 'hianime-bridge' ? 'hianime-bridge' : 'hianime-ajax';
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'supported', verified: false },
      episodes: { state: 'supported', verified: false },
      stream: { state: 'supported', verified: false },
    };
    return {
      kind: 'hianime',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId,
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'hianime',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (
    isGogoCloneCompatibleSource({
      sourceId: cleanId,
      sourcePkg: source.pkg,
      hosts: hostPlan.hosts,
    })
  ) {
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'supported', verified: false },
      episodes: { state: 'supported', verified: false },
      stream: { state: 'supported', verified: false },
    };
    return {
      kind: 'gogo-clone',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'gogo-html',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'gogo-clone',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  if (
    isWordPressAnimeCompatibleSource({
      sourceId: cleanId,
      sourcePkg: source.pkg,
      hosts: hostPlan.hosts,
    })
  ) {
    const capabilities: ExtensionAdapterCapabilities = {
      search: { state: 'supported', verified: false },
      episodes: { state: 'supported', verified: false },
      stream: { state: 'supported', verified: false },
    };
    return {
      kind: 'wordpress-animestream',
      sourceId: cleanId,
      sourceLabel,
      isMetadataOnly: false,
      hosts: hostPlan.hosts,
      capabilities,
      compatibility: assessExtensionCompatibility({
        adapterId: 'wordpress-animestream',
        sourceId: cleanId,
        sourceLabel,
        providerKind: 'wordpress-animestream',
        isMetadataOnly: false,
        capabilities,
      }),
    };
  }

  const capabilities: ExtensionAdapterCapabilities = {
    search: { state: 'supported', verified: false },
    episodes: { state: 'supported', verified: false },
    stream: { state: 'supported', verified: false },
  };
  return {
    kind: 'generic-web',
    sourceId: cleanId,
    sourceLabel,
    isMetadataOnly: false,
    hosts: hostPlan.hosts,
    capabilities,
    compatibility: assessExtensionCompatibility({
      adapterId: 'generic-web',
      sourceId: cleanId,
      sourceLabel,
      providerKind: 'generic-web',
      isMetadataOnly: false,
      capabilities,
    }),
  };
}






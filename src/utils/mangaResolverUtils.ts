import type { UnifiedChapter } from '../types/media.ts';
import {
  buildStreamProxyUrl,
  isViableTitleMatch,
  normalizeTitleForMatch,
  scoreGogoSearchCandidate,
  type GogoSearchCandidate,
} from './streamResolverUtils.ts';

export const MANGADEX_API_BASE = 'https://api.mangadex.org';

export function resolveMangaHostPlan(params: {
  sourceId?: string | null;
  sourceName?: string | null;
  sourceBaseUrl?: string | null;
}): {
  mode: 'mangadex' | 'custom-extension' | 'missing-host';
  baseUrl: string | null;
  sourceLabel: string;
} {
  const cleanId = (params.sourceId || '').trim();
  const cleanBase = (params.sourceBaseUrl || '').trim().replace(/\/+$/, '');
  const sourceLabel =
    (params.sourceName || '').trim() ||
    cleanId ||
    'MangaDex (Bridge)';

  if (!cleanId || cleanId === 'mangadex-bridge' || cleanId === 'shonenx-manga-inbuilt') {
    return {
      mode: 'mangadex',
      baseUrl: MANGADEX_API_BASE,
      sourceLabel: cleanId === 'shonenx-manga-inbuilt' ? 'ShizuTv Reader (MangaDex)' : sourceLabel,
    };
  }

  if (cleanBase && /^https?:\/\//i.test(cleanBase)) {
    return {
      mode: 'custom-extension',
      baseUrl: cleanBase,
      sourceLabel,
    };
  }

  return {
    mode: 'missing-host',
    baseUrl: null,
    sourceLabel,
  };
}

export interface MangaDexSearchItem {
  id: string;
  attributes?: {
    title?: Record<string, string>;
    altTitles?: Array<Record<string, string>>;
  };
}

export function pickBestMangaDexMatch(
  items: MangaDexSearchItem[],
  targetTitles: string[],
): { id: string; matchedTitle: string; score: number } | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  const ranked = items
    .map((item) => {
      const titlesObj = item.attributes?.title || {};
      const altTitles = Array.isArray(item.attributes?.altTitles)
        ? item.attributes!.altTitles.flatMap((alt) => Object.values(alt || {}))
        : [];
      const candidateTitles = [...Object.values(titlesObj), ...altTitles]
        .map((t) => (typeof t === 'string' ? t.trim() : ''))
        .filter(Boolean);
      const displayTitle = candidateTitles[0] || item.id;

      let bestScore = -1000;
      let matchedTitle = displayTitle;
      for (const ct of candidateTitles) {
        const s = scoreGogoSearchCandidate(
          { href: `/title/${item.id}`, title: ct },
          { titles: targetTitles, category: 'sub', format: 'MANGA' },
        );
        if (s > bestScore) {
          bestScore = s;
          matchedTitle = ct;
        }
      }
      const viable = candidateTitles.some((ct) =>
        isViableTitleMatch({ href: `/title/${item.id}`, title: ct }, targetTitles, 'MANGA'),
      );
      return {
        id: item.id,
        matchedTitle,
        score: bestScore,
        viable,
      };
    })
    .filter((item) => item.viable)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) return null;
  return {
    id: ranked[0].id,
    matchedTitle: ranked[0].matchedTitle,
    score: ranked[0].score,
  };
}

export interface MangaDexFeedChapter {
  id: string;
  attributes?: {
    chapter?: string | null;
    title?: string | null;
    volume?: string | null;
    translatedLanguage?: string | null;
    pages?: number | null;
    publishAt?: string | null;
    readableAt?: string | null;
    externalUrl?: string | null;
  };
  relationships?: Array<{
    id?: string;
    type?: string;
    attributes?: { name?: string };
  }>;
}

export function mapMangaDexChapterFeed(
  feed: MangaDexFeedChapter[],
): Array<UnifiedChapter & { sourceChapterId: string; externalUrl?: string | null }> {
  if (!Array.isArray(feed) || feed.length === 0) return [];

  const byNumber = new Map<
    number,
    UnifiedChapter & { sourceChapterId: string; externalUrl?: string | null; pageCountScore: number }
  >();

  let fallbackSeq = 1;
  for (const item of feed) {
    if (!item?.id || !item.attributes) continue;
    // Skip licensed external-only stubs with 0 MangaDex pages unless nothing else exists
    const pageCount = Number(item.attributes.pages || 0);
    const hasExternalOnly = Boolean(item.attributes.externalUrl) && pageCount <= 0;
    if (hasExternalOnly) continue;

    const rawChNum = item.attributes.chapter;
    const parsedNum =
      rawChNum !== null && rawChNum !== undefined && rawChNum !== ''
        ? Number.parseFloat(String(rawChNum))
        : fallbackSeq++;
    const num = Number.isFinite(parsedNum) ? parsedNum : fallbackSeq++;

    const rawTitle = (item.attributes.title || '').trim();
    const title = rawTitle ? rawTitle : `Chapter ${num}`;
    const scanlator =
      item.relationships?.find((r) => r.type === 'scanlation_group')?.attributes?.name ||
      (item.attributes.translatedLanguage
        ? `MangaDex (${item.attributes.translatedLanguage.toUpperCase()})`
        : 'MangaDex');
    const releaseDate = (item.attributes.readableAt || item.attributes.publishAt || '').slice(0, 10) || null;

    const existing = byNumber.get(num);
    if (!existing || pageCount > existing.pageCountScore) {
      byNumber.set(num, {
        id: `md-${item.id}`,
        sourceChapterId: item.id,
        number: num,
        title,
        scanlator,
        releaseDate,
        pageCount: pageCount > 0 ? pageCount : 12,
        externalUrl: item.attributes.externalUrl ?? null,
        pageCountScore: pageCount,
      });
    }
  }

  return Array.from(byNumber.values())
    .sort((a, b) => a.number - b.number)
    .map(({ pageCountScore: _score, ...rest }) => rest);
}

export function buildMangaDexAtHomePages(
  payload: {
    baseUrl?: string;
    chapter?: {
      hash?: string;
      data?: string[];
      dataSaver?: string[];
    };
  },
  proxyPrefix = '/api/stream/proxy',
): string[] {
  const baseUrl = typeof payload?.baseUrl === 'string' ? payload.baseUrl.replace(/\/+$/, '') : '';
  const hash = payload?.chapter?.hash;
  if (!baseUrl || !hash) return [];

  const files =
    Array.isArray(payload.chapter?.data) && payload.chapter!.data.length > 0
      ? payload.chapter!.data
      : Array.isArray(payload.chapter?.dataSaver)
        ? payload.chapter!.dataSaver
        : [];
  const folder =
    Array.isArray(payload.chapter?.data) && payload.chapter!.data.length > 0
      ? 'data'
      : 'data-saver';

  return files
    .filter((f): f is string => typeof f === 'string' && f.trim().length > 0)
    .map((file) =>
      buildStreamProxyUrl(
        `${baseUrl}/${folder}/${hash}/${file}`,
        proxyPrefix,
        'https://mangadex.org/',
      ),
    );
}

function decodeHtml(raw: string): string {
  return String(raw || '')
    .replace(/&amp;/g, '&')
    .replace(/&#039;|&#39;|&apos;/g, "'")
    .replace(/&rsquo;/g, '’')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

export function parseMangaSearchHtml(html: string, baseUrl: string): GogoSearchCandidate[] {
  const results: GogoSearchCandidate[] = [];
  const seen = new Set<string>();

  const push = (rawHref: string, rawTitle: string) => {
    const cleanHref = decodeHtml(rawHref);
    if (!cleanHref || cleanHref.startsWith('#') || cleanHref.startsWith('javascript:')) return;
    if (/\.(?:jpg|jpeg|png|webp|gif|svg|css|js|ico)(?:\?|$)/i.test(cleanHref)) return;
    if (/\/(?:wp-content|wp-includes|manga-genre|genre|genres|tag|author|page\/)\b/i.test(cleanHref)) {
      return;
    }

    let relPath: string;
    try {
      const resolved = new URL(cleanHref, baseUrl);
      const baseHost = new URL(baseUrl).hostname.replace(/^www\./, '');
      const candHost = resolved.hostname.replace(/^www\./, '');
      if (candHost !== baseHost) return;
      if (resolved.pathname === '/' || resolved.pathname.length < 2) return;
      relPath = `${resolved.pathname}${resolved.search}`;
    } catch {
      return;
    }

    const cleanTitle = decodeHtml(rawTitle.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    if (!cleanTitle || cleanTitle.length < 2) return;
    if (seen.has(relPath)) return;
    seen.add(relPath);
    results.push({ href: relPath, title: cleanTitle });
  };

  // 1. Madara WordPress search cards (.post-title h3/h4 a)
  const madaraRe =
    /<div[^>]*class="[^"]*post-title[^"]*"[^>]*>[\s\S]{0,400}?<a[^>]+href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = madaraRe.exec(html)) !== null) {
    const attrs = m[2] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    push(m[1], titleAttr || m[3]);
  }

  // 2. MangaThemesia / MangaStream cards (.bsx a)
  const bsxRe = /<div[^>]*class="[^"]*bsx[^"]*"[^>]*>[\s\S]{0,1400}?<a[^>]+href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = bsxRe.exec(html)) !== null) {
    const attrs = m[2] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const ttTitle = m[3].match(/<div[^>]*class="[^"]*\btt\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    push(m[1], titleAttr || ttTitle || m[3]);
  }

  // 3. Generic manga anchors
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1];
    if (!/\/(?:manga|series|comic|webtoon|manhwa|manhua|title|read|book)\//i.test(href)) continue;
    const attrs = m[2] || '';
    const titleAttr = attrs.match(/\btitle=["']([^"']+)["']/i)?.[1];
    const heading = m[3].match(/<(?:h[1-5]|div[^>]*class="[^"]*tt[^"]*")[^>]*>([\s\S]*?)<\/(?:h[1-5]|div)>/i)?.[1];
    push(href, titleAttr || heading || m[3]);
  }

  return results;
}

export function parseMangaChapterListHtml(
  html: string,
  baseUrl: string,
): Array<UnifiedChapter & { chapterUrl: string }> {
  const byNumber = new Map<number, UnifiedChapter & { chapterUrl: string }>();

  const extractChapterNum = (url: string, label: string): number | null => {
    const labelMatch =
      label.match(/\b(?:ch(?:apter)?|ep(?:isode)?)\.?\s*#?(\d+(?:\.\d+)?)\b/i) ||
      label.match(/^\s*(\d+(?:\.\d+)?)\s*(?:[-–:|]|$)/);
    if (labelMatch?.[1]) {
      const n = Number.parseFloat(labelMatch[1]);
      if (Number.isFinite(n)) return n;
    }
    const urlMatch = url.match(/(?:chapter|ch|chap)[-_/.]?(\d+(?:[.-]\d+)?)/i);
    if (urlMatch?.[1]) {
      const n = Number.parseFloat(urlMatch[1].replace('-', '.'));
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  // Look inside chapter lists first (Madara .wp-manga-chapter, MangaThemesia #chapterlist, generic <a>)
  const anchorRe = /<a\s+[^>]*href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const rawHref = decodeHtml(m[1]);
    if (!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:')) continue;

    let absUrl: string;
    try {
      const parsed = new URL(rawHref, baseUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') continue;
      absUrl = parsed.toString();
    } catch {
      continue;
    }

    const attrs = m[2] || '';
    const innerText = decodeHtml(m[3].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
    const combined = `${absUrl} ${innerText} ${attrs}`;
    if (!/(?:chapter|ch[-_.]?\d|\bch\.\s*\d|\bchap\b)/i.test(combined)) continue;

    const num = extractChapterNum(absUrl, innerText);
    if (num === null) continue;

    if (!byNumber.has(num)) {
      const safeTitle =
        innerText && !/^\d+(\.\d+)?$/.test(innerText)
          ? innerText.slice(0, 120)
          : `Chapter ${num}`;
      byNumber.set(num, {
        id: `ext-ch-${num}`,
        number: num,
        title: safeTitle,
        scanlator: new URL(baseUrl).hostname.replace(/^www\./, ''),
        pageCount: 14,
        chapterUrl: absUrl,
      });
    }
  }

  return Array.from(byNumber.values()).sort((a, b) => a.number - b.number);
}

export function parseMangaPagesHtml(
  html: string,
  chapterUrl: string,
  proxyPrefix = '/api/stream/proxy',
): string[] {
  const rawUrls: string[] = [];
  const seen = new Set<string>();

  const pushImageUrl = (raw: string) => {
    const cleaned = decodeHtml(raw).replace(/\\\//g, '/').trim();
    if (!cleaned || cleaned.startsWith('data:')) return;
    if (/\b(?:avatar|logo|icon|favicon|banner-ad|discord|patreon|ko-fi|spinner|loading\.gif)\b/i.test(cleaned)) {
      return;
    }
    let abs: string;
    try {
      const parsed = new URL(cleaned, chapterUrl);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return;
      abs = parsed.toString();
    } catch {
      return;
    }
    if (seen.has(abs)) return;
    seen.add(abs);
    rawUrls.push(abs);
  };

  // 1. MangaThemesia ts_reader.run(...) JSON payload
  const tsReaderMatch = html.match(/ts_reader\.run\(\s*(\{[\s\S]*?\})\s*\)\s*;?/i);
  if (tsReaderMatch?.[1]) {
    try {
      const parsed = JSON.parse(tsReaderMatch[1]) as {
        sources?: Array<{ images?: string[] }>;
      };
      const firstImgs = parsed.sources?.[0]?.images;
      if (Array.isArray(firstImgs)) {
        for (const img of firstImgs) {
          if (typeof img === 'string') pushImageUrl(img);
        }
      }
    } catch {
      // Fall back to regex extraction inside ts_reader block
      const urlMatches = tsReaderMatch[1].match(/https?:\\?\/\\?\/[^"'\s]+\.(?:jpg|jpeg|png|webp|avif)/gi) || [];
      for (const u of urlMatches) pushImageUrl(u);
    }
  }

  // 2. Madara / MangaReader / Webtoon container <img> tags
  const readerSectionMatch =
    html.match(/<(?:div|section)[^>]+(?:id|class)=["'][^"']*(?:reading-content|readerarea|page-break|chapter-content|viewer-cnt|container-chapter-reader)[^"']*["'][^>]*>([\s\S]*?)<\/(?:main|article|body)>/i) ||
    html.match(/<(?:div|section)[^>]+class=["'][^"']*(?:reading-content|readerarea|chapter-content)[^"']*["'][^>]*>([\s\S]*)/i);
  const scanArea = readerSectionMatch?.[1] || html;

  const imgRe = /<img\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(scanArea)) !== null) {
    const attrs = m[1] || '';
    // Prefer reader-class images when scanning full page HTML
    if (
      !readerSectionMatch &&
      !/wp-manga-chapter-img|chapter[-_]?img|page[-_]?img|reading|ts-main-image/i.test(attrs)
    ) {
      continue;
    }
    const candidate =
      attrs.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bdata-lazy-src=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bdata-original=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bdata-cfsrc=["']([^"']+)["']/i)?.[1] ||
      attrs.match(/\bsrc=["']([^"']+)["']/i)?.[1];
    if (candidate) pushImageUrl(candidate);
  }

  // Fallback: any image URLs inside Madara-style JSON/array scripts
  if (rawUrls.length === 0) {
    const jsonImgMatches =
      scanArea.match(/https?:\/\/[^\s"'<>\\]+\.(?:jpe?g|png|webp|avif)(?:\?[^\s"'<>\\]*)?/gi) || [];
    for (const imgUrl of jsonImgMatches) {
      if (/cover|thumb|avatar|icon|logo|badge/i.test(imgUrl)) continue;
      pushImageUrl(imgUrl);
    }
  }

  return rawUrls.map((url) => buildStreamProxyUrl(url, proxyPrefix, chapterUrl));
}

export function buildMangaTitleQueryList(titles: {
  overrideTitle?: string | null;
  english?: string | null;
  romaji?: string | null;
  native?: string | null;
  synonyms?: string[] | null;
}): string[] {
  const out: string[] = [];
  const push = (val?: string | null) => {
    const clean = typeof val === 'string' ? val.replace(/\s+/g, ' ').trim() : '';
    if (!clean || clean.length < 2) return;
    if (!out.some((x) => normalizeTitleForMatch(x) === normalizeTitleForMatch(clean))) {
      out.push(clean);
    }
  };
  push(titles.overrideTitle);
  push(titles.english);
  push(titles.romaji);
  if (Array.isArray(titles.synonyms)) {
    for (const s of titles.synonyms.slice(0, 3)) push(s);
  }
  push(titles.native);
  return out;
}

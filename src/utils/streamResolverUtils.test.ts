import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSearchQueriesForMedia,
  buildStreamProxyUrl,
  buildStreamResolverCacheKey,
  detectAvailableAudiosFromSources,
  detectExtensionWebCompatibilityIssue,
  extractDirectVideoUrlFromHtmlOrScript,
  extractGotakuTitleId,
  extractMegaPlayStreamUrl,
  HIANIME_BRIDGE_HOSTS,
  INBUILT_PRIMARY_HOSTS,
  isGotakuHost,
  isMatchedEpisodeValidForSource,
  isMatchedSourceEntryValidForSource,
  isMetadataOnlyCatalogHost,
  isSourceInherentLanguage,
  isViableTitleMatch,
  looksLikeClientSpaHtml,
  mapSubtitleTracksFromSources,
  matchesExtensionSearchQuery,
  parseGenericEmbedCandidates,
  parseGenericEpisodeLinks,
  parseGenericSearchHtml,
  parseGotakuTitleSearchJson,
  parseSourceEpisodeListHtml,
  rankExtensionSearchCandidates,
  resolveProviderHostPlan,
  rewriteM3u8Manifest,
  scoreGogoSearchCandidate,
  shouldUseExtensionEpisodesForSelection,
  shouldUseExtensionWrongTitleSearch,
  sortEmbedsForAudioLanguage,
  unpackDeanEdwardsPacker,
} from './streamResolverUtils';

test('buildSearchQueriesForMedia expands titles cleanly with punctuation-free and root fallbacks', () => {
  const queries = buildSearchQueriesForMedia({
    english: "Frieren: Beyond Journey's End",
    romaji: 'Sousou no Frieren',
    synonyms: ['Frieren at the Funeral'],
  });
  assert.ok(queries.includes("Frieren: Beyond Journey's End"));
  assert.ok(queries.includes('Frieren'));
  assert.ok(queries.includes('Sousou no Frieren'));
});

test('scoreGogoSearchCandidate prefers exact base series for SUB and -dub entry for DUB', () => {
  const candidates = [
    { href: '/category/frieren-beyond-journey-s-end-season-2', title: 'Frieren: Beyond Journey’s End Season 2' },
    { href: '/category/sousou-no-frieren-marumaru-no-mahou-mini-anime', title: 'Sousou no Frieren – Marumaru no Mahou (Mini Anime)' },
    { href: '/category/frieren-beyond-journey-s-end-dub', title: 'Frieren: Beyond Journey’s End (Dub)' },
    { href: '/category/frieren-beyond-journey-s-end', title: 'Frieren: Beyond Journey’s End' },
  ];

  const subSorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'sub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'sub',
        format: 'TV',
      }),
  );
  assert.equal(subSorted[0].href, '/category/frieren-beyond-journey-s-end');

  const dubSorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'dub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ["Frieren: Beyond Journey's End", 'Sousou no Frieren'],
        category: 'dub',
        format: 'TV',
      }),
  );
  assert.equal(dubSorted[0].href, '/category/frieren-beyond-journey-s-end-dub');
});

test('scoreGogoSearchCandidate picks Naruto over Boruto Naruto Movie', () => {
  const candidates = [
    { href: '/category/boruto-naruto-the-movie', title: 'Boruto: Naruto the Movie' },
    { href: '/category/naruto-shippuden', title: 'Naruto Shippuden' },
    { href: '/category/naruto', title: 'Naruto' },
  ];
  const sorted = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, {
        titles: ['Naruto'],
        category: 'sub',
        format: 'TV',
      }) -
      scoreGogoSearchCandidate(a, {
        titles: ['Naruto'],
        category: 'sub',
        format: 'TV',
      }),
  );
  assert.equal(sorted[0].href, '/category/naruto');
});

test('rewriteM3u8Manifest rewrites variant playlists, keys, maps, and segments through proxy', () => {
  const manifest = [
    '#EXTM3U',
    '#EXT-X-KEY:METHOD=AES-128,URI="enc.key"',
    '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="jpn",URI="audio/index.m3u8"',
    '#EXT-X-STREAM-INF:BANDWIDTH=1310631,RESOLUTION=1920x1080',
    'index-f1-v1-a1.m3u8',
    '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=33272,URI="iframes.m3u8"',
    'https://cdn.example.com/segs/seg-1.jpg',
  ].join('\n');

  const baseUrl = 'https://fetch.nexabloom.top/anime/abc/master.m3u8';
  const referer = 'https://megaplay.buzz/';
  const out = rewriteM3u8Manifest(manifest, baseUrl, '/api/stream/proxy', referer);

  assert.ok(
    out.includes(
      `URI="${buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/enc.key', '/api/stream/proxy', referer)}"`,
    ),
  );
  assert.ok(
    out.includes(
      `URI="${buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/audio/index.m3u8', '/api/stream/proxy', referer)}"`,
    ),
  );
  assert.ok(
    out.includes(
      buildStreamProxyUrl('https://fetch.nexabloom.top/anime/abc/index-f1-v1-a1.m3u8', '/api/stream/proxy', referer),
    ),
  );
  assert.ok(
    out.includes(
      buildStreamProxyUrl('https://cdn.example.com/segs/seg-1.jpg', '/api/stream/proxy', referer),
    ),
  );
});

test('extractMegaPlayStreamUrl supports object, sources array, array, and string shapes', () => {
  assert.equal(
    extractMegaPlayStreamUrl({ file: 'https://cdn.example.com/master.m3u8' }),
    'https://cdn.example.com/master.m3u8',
  );
  assert.equal(
    extractMegaPlayStreamUrl({ sources: [{ file: 'https://cdn.example.com/s.m3u8' }] }),
    'https://cdn.example.com/s.m3u8',
  );
  assert.equal(extractMegaPlayStreamUrl({ file: 'not-a-url' }), null);
});

test('mapSubtitleTracksFromSources skips thumbnails, normalizes languages, assigns unique lang codes, and proxies VTT URLs', () => {
  const mapped = mapSubtitleTracksFromSources(
    [
      { file: 'https://cdn.example.com/thumbnails.vtt', kind: 'thumbnails' },
      { file: 'https://cdn.example.com/ar.vtt', label: 'Arabic', kind: 'captions' },
      { file: 'https://cdn.example.com/es-1.vtt', label: 'Spanish (Spain)', kind: 'captions' },
      { file: 'https://cdn.example.com/es-2.vtt', label: 'Spanish (Latin America)', kind: 'captions' },
      { file: 'https://cdn.example.com/es-3.vtt', label: 'Spanish - Castellano', kind: 'captions' },
      { file: 'https://cdn.example.com/eng.vtt', label: 'English', kind: 'captions', default: true },
    ],
    '/api/stream/proxy',
    'https://megaplay.buzz/',
  );
  assert.equal(mapped.length, 5);
  assert.equal(mapped[0].lang, 'en');
  assert.ok(mapped[0].url.startsWith('/api/stream/proxy?'));
  const langs = mapped.map((t) => t.lang);
  assert.equal(new Set(langs).size, langs.length);
  assert.ok(langs.includes('es'));
  assert.ok(langs.includes('es-la'));
  assert.ok(langs.includes('es-2'));
});

test('detectAvailableAudiosFromSources reports only actually present languages on the source', () => {
  const subOnly = detectAvailableAudiosFromSources({
    candidates: [
      { href: '/category/solo-leveling-arise', title: 'Solo Leveling Arise' },
      { href: '/category/unrelated-dub', title: 'Unrelated Show (Dub)' },
    ],
    targetTitles: ['Solo Leveling Arise'],
    currentCategory: 'sub',
    hasDubProbe: false,
  });
  assert.deepEqual(
    subOnly.map((a) => a.code),
    ['ja'],
  );

  const subAndDub = detectAvailableAudiosFromSources({
    candidates: [
      { href: '/category/my-hero-academia', title: 'My Hero Academia' },
      { href: '/category/my-hero-academia-dub', title: 'My Hero Academia (Dub)' },
    ],
    targetTitles: ['My Hero Academia'],
    currentCategory: 'sub',
    hasDubProbe: false,
  });
  assert.deepEqual(
    subAndDub.map((a) => a.code),
    ['ja', 'en'],
  );

  const viaProbe = detectAvailableAudiosFromSources({
    candidates: [{ href: '/category/kaguya-sama', title: 'Kaguya-sama' }],
    targetTitles: ['Kaguya-sama'],
    currentCategory: 'sub',
    hasDubProbe: true,
  });
  assert.deepEqual(
    viaProbe.map((a) => a.code),
    ['ja', 'en'],
  );
});

test('resolveProviderHostPlan strictly isolates custom extensions and HiAnime bridge from ShizuTv fallback hosts', () => {
  const inbuiltPlan = resolveProviderHostPlan({
    sourceId: 'shonenx-hls-inbuilt',
    sourceName: 'ShizuTv Stream (Inbuilt)',
  });
  assert.equal(inbuiltPlan.mode, 'inbuilt');
  assert.deepEqual(inbuiltPlan.hosts, [...INBUILT_PRIMARY_HOSTS]);

  const hiPlan = resolveProviderHostPlan({
    sourceId: 'hianime-bridge',
    sourceName: 'AniWatch / HiAnime (Bridge)',
  });
  assert.equal(hiPlan.mode, 'hianime');
  assert.deepEqual(hiPlan.hosts, [...HIANIME_BRIDGE_HOSTS]);

  const customPlan = resolveProviderHostPlan({
    sourceId: 'ext-ay-animehindiworld',
    sourceName: 'AnimeHindiWorld',
    sourceBaseUrl: 'https://animehindiworld.example.com/',
  });
  assert.equal(customPlan.mode, 'custom-extension');
  assert.deepEqual(customPlan.hosts, ['https://animehindiworld.example.com']);

  const missingHostPlan = resolveProviderHostPlan({
    sourceId: 'ext-ay-broken',
    sourceName: 'BrokenExt',
    sourceBaseUrl: '',
  });
  assert.equal(missingHostPlan.mode, 'missing-host');
  assert.deepEqual(missingHostPlan.hosts, []);
});

test('buildStreamResolverCacheKey separates entries by sourceId, sourceBaseUrl, sourceLang, and audioLanguage', () => {
  const keyShizuEn = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'en',
    sourceId: 'shonenx-hls-inbuilt',
  });
  const keyExtHi = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'hi',
    sourceId: 'ext-hindi',
    sourceBaseUrl: 'https://hindi.example.com',
    sourceLang: 'hi',
  });
  assert.notEqual(keyShizuEn, keyExtHi);
});

test('scoreGogoSearchCandidate and buildSearchQueriesForMedia prioritize Hindi and Spanish candidates when requested', () => {
  const queries = buildSearchQueriesForMedia({ english: 'Naruto' }, 'hi');
  assert.ok(queries.some((q) => /naruto hindi/i.test(q)));

  const candidates = [
    { href: '/naruto-dub', title: 'Naruto (Dub)' },
    { href: '/naruto-hindi-dub', title: 'Naruto Hindi Dubbed' },
    { href: '/naruto', title: 'Naruto' },
  ];
  const rankedHi = [...candidates].sort(
    (a, b) =>
      scoreGogoSearchCandidate(b, { titles: ['Naruto'], category: 'dub', audioLanguage: 'hi' }) -
      scoreGogoSearchCandidate(a, { titles: ['Naruto'], category: 'dub', audioLanguage: 'hi' }),
  );
  assert.equal(rankedHi[0].href, '/naruto-hindi-dub');

  assert.equal(
    isSourceInherentLanguage('hi', 'ToonStream', 'https://toonstream.example', 'hi'),
    true,
  );
  assert.equal(
    isSourceInherentLanguage('en', 'HiAnime', 'https://hianime.to', 'hi'),
    false,
  );
});

test('generic site search, episode links, embed sorting, and packer video extraction work cleanly', () => {
  const searchHtml = `
    <article class="result-item">
      <a href="https://hindi.example.com/series/naruto-hindi/" title="Naruto (Hindi Dub)">
        <h3 class="title">Naruto (Hindi Dub)</h3>
      </a>
    </article>
  `;
  const found = parseGenericSearchHtml(searchHtml, 'https://hindi.example.com');
  assert.equal(found.length, 1);
  assert.equal(found[0].href, '/series/naruto-hindi/');

  const seriesHtml = `
    <div class="episodes">
      <a href="/episode/naruto-hindi-1x1/" data-number="1">Ep 1</a>
      <a href="/episode/naruto-hindi-1x2/" data-number="2">Ep 2</a>
    </div>
  `;
  const epLinks = parseGenericEpisodeLinks(seriesHtml, 'https://hindi.example.com', 2);
  assert.equal(epLinks[0], 'https://hindi.example.com/episode/naruto-hindi-1x2/');

  const epHtml = `
    <ul>
      <li><a data-video="https://player.example.com/eng/123" data-lang="English">Server EN</a></li>
      <li><a data-video="https://player.example.com/hindi/456" data-lang="Hindi">Server Hindi</a></li>
    </ul>
  `;
  const embeds = parseGenericEmbedCandidates(epHtml, 'https://hindi.example.com/episode/naruto-hindi-1x2/');
  const sortedForHi = sortEmbedsForAudioLanguage(embeds, { audioLanguage: 'hi' });
  assert.equal(sortedForHi[0].url, 'https://player.example.com/hindi/456');

  const packed = `eval(function(p,a,c,k,e,d){while(c--)if(k[c])p=p.replace(new RegExp('\\\\b'+c.toString(a)+'\\\\b','g'),k[c]);return p}('0 1="2://3.4/5.6";',7,7,'var|src|https|cdn|example|master|m3u8'.split('|'),0,{}))`;
  const unpacked = unpackDeanEdwardsPacker(packed);
  assert.ok(unpacked.includes('https://cdn.example/master.m3u8'));
  const direct = extractDirectVideoUrlFromHtmlOrScript(packed, 'https://player.example.com');
  assert.equal(direct, 'https://cdn.example/master.m3u8');

  const hindiAudios = detectAvailableAudiosFromSources({
    candidates: [{ href: '/series/naruto-hindi', title: 'Naruto Hindi' }],
    targetTitles: ['Naruto'],
    currentCategory: 'dub',
    currentAudioLanguage: 'hi',
    embedLangHints: ['hi'],
  });
  assert.deepEqual(
    hindiAudios.map((a) => a.code),
    ['hi'],
  );

  const queryEpsHtml = `
    <a href="/watch/naruto?ep=1">Episode 1</a>
    <a href="/watch/naruto?ep=5">Episode 5</a>
  `;
  const ep5Links = parseGenericEpisodeLinks(queryEpsHtml, 'https://hindi.example.com', 5);
  assert.equal(ep5Links[0], 'https://hindi.example.com/watch/naruto?ep=5');
});

test('isViableTitleMatch rejects unrelated schoolgirl movie on The God of War and checks metadata-only hosts', () => {
  const queries = buildSearchQueriesForMedia({
    english: 'The God of War',
    romaji: 'Zhan Shen',
  });
  assert.ok(!queries.includes('The'), 'must not fall back to bare stop-word query "The"');

  assert.equal(
    isViableTitleMatch(
      { href: '/category/girls-und-panzer-the-movie', title: 'Girls und Panzer: The Movie' },
      ['The God of War', 'Zhan Shen'],
      'ONA',
    ),
    false,
  );
  assert.equal(
    isViableTitleMatch(
      { href: '/category/the-god-of-war-donghua', title: 'The God of War' },
      ['The God of War', 'Zhan Shen'],
      'ONA',
    ),
    true,
  );

  assert.equal(isMetadataOnlyCatalogHost('https://anidb.net', 'AniDB'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://myanimelist.net/anime', 'MAL'), true);
  assert.equal(isMetadataOnlyCatalogHost('', 'AniList', 'eu.kanade.tachiyomi.extension.all.anilist'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://kitsu.app', 'Kitsu'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://www.novelupdates.com', 'NovelUpdates'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://shikimori.one', 'Shikimori'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://vndb.org', 'VNDB'), true);
  assert.equal(isMetadataOnlyCatalogHost('https://animexin.dev', 'AnimeXin'), false);
});

test('parseGenericSearchHtml survives nested divs and parseGenericEmbedCandidates decodes base64 mirror options and atob()', () => {
  const nestedCardHtml = `
    <div class="bsx">
      <a href="https://animexin.example/zhan-shen-the-god-of-war/" title="Zhan Shen (The God of War)">
        <div class="limit"><div class="typez ONA">ONA</div><img src="poster.jpg" /></div>
        <div class="tt">The God of War<h2>Zhan Shen</h2></div>
      </a>
    </div>
  `;
  const cards = parseGenericSearchHtml(nestedCardHtml, 'https://animexin.example');
  assert.equal(cards.length, 1);
  assert.equal(cards[0].href, '/zhan-shen-the-god-of-war/');
  assert.ok(/god of war|zhan shen/i.test(cards[0].title));

  const epListHtml = `
    <a href="https://animexin.example/zhan-shen-episode-01-hindi-sub/">Ep 1</a>
    <a href="https://animexin.example/zhan-shen-episode-02-hindi-sub/">Ep 2</a>
  `;
  const eps = parseGenericEpisodeLinks(epListHtml, 'https://animexin.example', 1);
  assert.equal(eps[0], 'https://animexin.example/zhan-shen-episode-01-hindi-sub/');

  const encodedIframe = Buffer.from('<iframe src="https://mirror.example/e/hindi-1" allowfullscreen></iframe>').toString('base64');
  const mirrorHtml = `
    <select class="mirror">
      <option value="">Select Video Server</option>
      <option value="${encodedIframe}">Server Hindi Mirror</option>
    </select>
  `;
  const embeds = parseGenericEmbedCandidates(mirrorHtml, 'https://animexin.example/ep-1/');
  assert.equal(embeds.length, 1);
  assert.equal(embeds[0].url, 'https://mirror.example/e/hindi-1');
  assert.equal(embeds[0].langHint, 'hi');

  const encodedStreamUrl = Buffer.from('https://cdn.mirror.example/hls/master.m3u8').toString('base64');
  const atobHtml = `<script>var s = atob("${encodedStreamUrl}");</script>`;
  assert.equal(
    extractDirectVideoUrlFromHtmlOrScript(atobHtml, 'https://mirror.example/e/hindi-1'),
    'https://cdn.mirror.example/hls/master.m3u8',
  );
});

test('Wrong Title? provider routing preserves Inbuilt & reading media and routes external anime extensions to source search', () => {
  assert.equal(
    shouldUseExtensionWrongTitleSearch({ sourceId: 'shonenx-hls-inbuilt', isReadingMedia: false }),
    false,
  );
  assert.equal(
    shouldUseExtensionWrongTitleSearch({ sourceId: 'ext-gotaku-en', isReadingMedia: false }),
    true,
  );
  assert.equal(
    shouldUseExtensionWrongTitleSearch({ sourceId: 'hianime-bridge', isReadingMedia: false }),
    true,
  );
  assert.equal(
    shouldUseExtensionWrongTitleSearch({ sourceId: 'ext-manga-source', isReadingMedia: true }),
    false,
  );
});

test('isMatchedSourceEntryValidForSource enforces active sourceId equality and rejects inbuilt or switched sources', () => {
  const entry = {
    sourceId: 'ext-animexin-en',
    title: 'Naruto (Hindi)',
    href: '/series/naruto-hindi/',
    slug: 'series/naruto-hindi',
  };

  assert.equal(isMatchedSourceEntryValidForSource(entry, 'ext-animexin-en'), true);
  assert.equal(isMatchedSourceEntryValidForSource(entry, 'ext-other-source'), false);
  assert.equal(isMatchedSourceEntryValidForSource(entry, 'shonenx-hls-inbuilt'), false);
  assert.equal(isMatchedSourceEntryValidForSource(null, 'ext-animexin-en'), false);
});

test('buildStreamResolverCacheKey separates selected source entries from generic title resolution', () => {
  const genericKey = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'hi',
    sourceId: 'ext-animexin-en',
    sourceBaseUrl: 'https://animexin.example',
  });
  const selectedKey = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 1,
    category: 'dub',
    audioLanguage: 'hi',
    sourceId: 'ext-animexin-en',
    sourceBaseUrl: 'https://animexin.example',
    selectedHref: '/series/naruto-hindi-dub/',
    selectedSlug: 'series/naruto-hindi-dub',
  });
  assert.notEqual(genericKey, selectedKey);
});

test('SPA & Turnstile compatibility detection flags Gotaku-style JS shells while allowing SSR search results', () => {
  const gotakuSpaHtml = `
    <!doctype html>
    <html>
      <head><title>Gotaku</title></head>
      <body>
        <div id="root"></div>
        <script id="boot">{"turnstile_site_key":"0x4AAAAAA"}</script>
        <script type="module" src="/assets/index.js"></script>
      </body>
    </html>
  `;
  assert.equal(looksLikeClientSpaHtml(gotakuSpaHtml), true);
  const spaReason = detectExtensionWebCompatibilityIssue({
    status: 200,
    html: gotakuSpaHtml,
    sourceLabel: 'Gotaku',
    host: 'https://gotaku.to',
    parsedCandidatesCount: 0,
  });
  assert.ok(spaReason && /Turnstile|JavaScript app/i.test(spaReason));

  const cfChallengeReason = detectExtensionWebCompatibilityIssue({
    status: 403,
    html: '<title>Just a moment...</title><div>Cloudflare</div>',
    sourceLabel: 'BlockedSite',
    host: 'https://blocked.example',
  });
  assert.ok(cfChallengeReason && /anti-bot challenge/i.test(cfChallengeReason));

  const generic403SpaShell = detectExtensionWebCompatibilityIssue({
    status: 403,
    html: '<html><body><div id="root"></div><script src="/waf-challenge.js"></script></body></html>',
    sourceLabel: 'ShizuTv Stream (Inbuilt)',
    host: 'https://ww5.gogoanimes.fi',
    parsedCandidatesCount: 0,
  });
  assert.ok(generic403SpaShell && /HTTP 403/i.test(generic403SpaShell));
  assert.equal(/JavaScript app/i.test(generic403SpaShell), false);

  const ssrHtml = `
    <div class="bsx">
      <a href="/anime/chainsaw-man/" title="Chainsaw Man">Chainsaw Man</a>
    </div>
    <div class="sidebar">
      <a href="/anime/one-piece/" title="One Piece">One Piece</a>
    </div>
  `;
  assert.equal(looksLikeClientSpaHtml(ssrHtml), false);
  assert.equal(
    detectExtensionWebCompatibilityIssue({
      status: 200,
      html: ssrHtml,
      sourceLabel: 'RealSSR',
      host: 'https://realssr.example',
      parsedCandidatesCount: 2,
    }),
    null,
  );

  const parsed = parseGenericSearchHtml(ssrHtml, 'https://realssr.example');
  const ranked = rankExtensionSearchCandidates(parsed, 'Chainsaw Man');
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].href, '/anime/chainsaw-man/');
  assert.equal(matchesExtensionSearchQuery({ href: '/anime/one-piece/', title: 'One Piece' }, 'Chainsaw Man'), false);
});

test('shouldUseExtensionEpisodesForSelection and isMatchedEpisodeValidForSource enforce external source matching', () => {
  const validEntry = { sourceId: 'ext-custom', href: '/anime/frieren-cour-2/' };
  assert.equal(
    shouldUseExtensionEpisodesForSelection({
      sourceId: 'shonenx-hls-inbuilt',
      isReadingMedia: false,
      selectedSourceEntry: validEntry,
    }),
    false,
  );
  assert.equal(
    shouldUseExtensionEpisodesForSelection({
      sourceId: 'ext-custom',
      isReadingMedia: true,
      selectedSourceEntry: validEntry,
    }),
    false,
  );
  assert.equal(
    shouldUseExtensionEpisodesForSelection({
      sourceId: 'ext-custom',
      isReadingMedia: false,
      selectedSourceEntry: validEntry,
    }),
    true,
  );

  assert.equal(
    isMatchedEpisodeValidForSource(
      { sourceId: 'ext-custom', sourceEpisodeId: 'ep-13', episodeUrl: '/watch/ep-13' },
      'ext-custom',
    ),
    true,
  );
  assert.equal(
    isMatchedEpisodeValidForSource(
      { sourceId: 'ext-other', sourceEpisodeId: 'ep-13', episodeUrl: '/watch/ep-13' },
      'ext-custom',
    ),
    false,
  );
  assert.equal(
    isMatchedEpisodeValidForSource(
      { sourceId: 'shonenx-hls-inbuilt', sourceEpisodeId: 'ep-13', episodeUrl: '/watch/ep-13' },
      'shonenx-hls-inbuilt',
    ),
    false,
  );
});

test('parseSourceEpisodeListHtml preserves non-standard numbering, source IDs, titles, URLs, and ordering across formats', () => {
  const hianimeAjaxHtml = `
    <div class="ss-list">
      <a title="Zero Hour" class="ssl-item ep-item" data-number="0" data-id="90010" href="/watch/sample-99?ep=90010">
        <div class="ep-name">Zero Hour</div>
      </a>
      <a title="The Second Cour Begins" class="ssl-item ep-item ssl-item-filler" data-number="13" data-id="90013" href="/watch/sample-99?ep=90013">
        <div class="ep-name">The Second Cour Begins</div>
      </a>
      <a title="Recap Special" class="ssl-item ep-item" data-number="13.5" data-id="90014" href="/watch/sample-99?ep=90014">
        <div class="ep-name">Recap Special</div>
      </a>
    </div>
  `;
  const hiParsed = parseSourceEpisodeListHtml(hianimeAjaxHtml, 'https://hianime.to');
  assert.equal(hiParsed.length, 3);
  assert.deepEqual(
    hiParsed.map((e) => ({ id: e.sourceEpisodeId, num: e.number, title: e.title, filler: Boolean(e.isFiller) })),
    [
      { id: '90010', num: 0, title: 'Zero Hour', filler: false },
      { id: '90013', num: 13, title: 'The Second Cour Begins', filler: true },
      { id: '90014', num: 13.5, title: 'Recap Special', filler: false },
    ],
  );
  assert.equal(hiParsed[1].episodeUrl, '/watch/sample-99?ep=90013');

  // AnimeStream descending / custom order preserved as returned by source
  const animeStreamHtml = `
    <div class="eplister">
      <ul>
        <li>
          <a href="https://ext.example/my-show-episode-14-hindi/">
            <div class="epl-num">14</div>
            <div class="epl-title">Hindi Climax</div>
          </a>
        </li>
        <li>
          <a href="https://ext.example/my-show-episode-13-hindi/">
            <div class="epl-num">13</div>
            <div class="epl-title">Hindi Awakening</div>
          </a>
        </li>
      </ul>
    </div>
  `;
  const asParsed = parseSourceEpisodeListHtml(animeStreamHtml, 'https://ext.example');
  assert.equal(asParsed.length, 2);
  assert.deepEqual(
    asParsed.map((e) => ({ num: e.number, title: e.title, url: e.episodeUrl })),
    [
      { num: 14, title: 'Hindi Climax', url: '/my-show-episode-14-hindi/' },
      { num: 13, title: 'Hindi Awakening', url: '/my-show-episode-13-hindi/' },
    ],
  );

  // Direct anchor fallback filters out unrelated sidebar shows using animeSlug
  const directHtml = `
    <div class="episodes">
      <a href="/watch/frieren-cour-2-episode-25/">Ep 25</a>
      <a href="/watch/one-piece-episode-1100/">Ep 1100</a>
    </div>
  `;
  const directParsed = parseSourceEpisodeListHtml(directHtml, 'https://ext.example', {
    animeHref: '/anime/frieren-cour-2/',
    animeSlug: 'anime/frieren-cour-2',
  });
  assert.equal(directParsed.length, 1);
  assert.equal(directParsed[0].number, 25);
  assert.equal(directParsed[0].episodeUrl, '/watch/frieren-cour-2-episode-25/');
});

test('buildStreamResolverCacheKey separates entries by selectedEpisodeId and selectedEpisodeUrl', () => {
  const keyA = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 13,
    category: 'sub',
    sourceId: 'ext-custom',
    selectedHref: '/anime/naruto-cour-2/',
    selectedEpisodeId: 'ep-130',
    selectedEpisodeUrl: '/watch/naruto-cour-2-ep-13/',
  });
  const keyB = buildStreamResolverCacheKey({
    mediaId: '20',
    english: 'Naruto',
    episodeNumber: 13,
    category: 'sub',
    sourceId: 'ext-custom',
    selectedHref: '/anime/naruto-cour-2/',
    selectedEpisodeId: 'ep-131',
    selectedEpisodeUrl: '/watch/naruto-cour-2-special-13/',
  });
  assert.notEqual(keyA, keyB);
});

test('Gotaku helpers identify host, extract title ID, parse /api/v1/titles JSON, and filter synopsis-only hits', () => {
  assert.equal(isGotakuHost('https://gotaku.to'), true);
  assert.equal(isGotakuHost('https://www.gotaku.to/title/lwk4qj'), true);
  assert.equal(isGotakuHost('https://anichi.to'), false);

  assert.equal(extractGotakuTitleId('/title/lwk4qj'), 'lwk4qj');
  assert.equal(extractGotakuTitleId('title/53yf73?ep=1'), '53yf73');
  assert.equal(extractGotakuTitleId('og1b09'), 'og1b09');
  assert.equal(extractGotakuTitleId('/anime/naruto-shippuden'), null);

  const parsed = parseGotakuTitleSearchJson(
    {
      data: [
        {
          id: '9gd76r',
          url: '/title/9gd76r',
          name: 'Onigiri',
          poster_url: 'https://cdn.example/onigiri.jpg',
        },
        {
          id: 'og1b09',
          url: '/title/og1b09',
          name: 'Demon Slayer: Kimetsu no Yaiba',
          poster_url: 'https://cdn.example/ds.jpg',
        },
      ],
    },
    'https://gotaku.to',
  );
  assert.equal(parsed.length, 2);
  const ranked = rankExtensionSearchCandidates(parsed, 'Demon Slayer');
  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].title, 'Demon Slayer: Kimetsu no Yaiba');
  assert.equal(ranked[0].href, '/title/og1b09');
});

import {
  assessExtensionCompatibility,
  detectSourceProfile,
  extractNumericIdFromHref,
  isGogoCloneCompatibleSource,
  isHiAnimeCompatibleSource,
  isWordPressAnimeCompatibleSource,
  looksLikeBlockedChallengeHtml,
  normalizeProviderEpisodes,
  normalizeProviderSearchItems,
} from './streamResolverUtils';

test('detectSourceProfile & assessExtensionCompatibility enforce strict compatibility and metadata-only isolation', () => {
  const inbuilt = detectSourceProfile({ id: 'shonenx-hls-inbuilt', name: 'ShizuTv Stream (Inbuilt)' });
  assert.equal(inbuilt.kind, 'inbuilt-anime');
  assert.equal(inbuilt.compatibility.fullyCompatible, true);
  assert.equal(inbuilt.compatibility.compatibility, 'full');

  const metadata = detectSourceProfile({
    id: 'ext-myanimelist',
    name: 'MyAnimeList',
    baseUrl: 'https://myanimelist.net',
  });
  assert.equal(metadata.kind, 'metadata-only');
  assert.equal(metadata.isMetadataOnly, true);
  assert.equal(metadata.compatibility.fullyCompatible, false);
  assert.equal(metadata.compatibility.compatibility, 'unsupported');

  const gotaku = detectSourceProfile({
    id: 'ext-gotaku',
    name: 'Gotaku',
    baseUrl: 'https://gotaku.to',
  });
  assert.equal(gotaku.kind, 'gotaku');
  assert.equal(gotaku.compatibility.fullyCompatible, false);
  assert.equal(gotaku.compatibility.compatibility, 'partial');
  assert.equal(gotaku.capabilities.search.state, 'verified');
  assert.equal(gotaku.capabilities.episodes.state, 'unsupported');
  assert.equal(gotaku.capabilities.stream.state, 'unsupported');

  const customWeb = detectSourceProfile({
    id: 'ext-animeworld',
    name: 'AnimeWorld',
    baseUrl: 'https://animeworld.example',
  });
  assert.equal(customWeb.kind, 'generic-web');
  assert.equal(customWeb.compatibility.fullyCompatible, false);
  assert.equal(customWeb.compatibility.compatibility, 'unverified');

  // Even when all capabilities are 'supported', compatibility is NOT 'full' unless verified === true
  const supportedUnverified = assessExtensionCompatibility({
    adapterId: 'custom',
    sourceId: 'ext-a',
    sourceLabel: 'Ext A',
    providerKind: 'custom',
    isMetadataOnly: false,
    capabilities: {
      search: { state: 'supported', verified: false },
      episodes: { state: 'supported', verified: false },
      stream: { state: 'supported', verified: false },
    },
  });
  assert.equal(supportedUnverified.fullyCompatible, false);
  assert.equal(supportedUnverified.compatibility, 'unverified');
});

test('Batch 2 provider compatibility detectors group compatible hosts while keeping unknown/unverified sources separate', () => {
  // 1. HiAnime family: inbuilt bridge vs installed Kaido clone (isolated host)
  assert.equal(
    isHiAnimeCompatibleSource({ sourceId: 'hianime-bridge', hosts: [...HIANIME_BRIDGE_HOSTS] }),
    true,
  );
  assert.equal(
    isHiAnimeCompatibleSource({ sourceId: 'ext-ay-kaido', hosts: ['https://kaido.to'] }),
    true,
  );
  const kaidoProfile = detectSourceProfile({
    id: 'ext-ay-kaido',
    name: 'Kaido',
    baseUrl: 'https://kaido.to',
  });
  assert.equal(kaidoProfile.kind, 'hianime');
  assert.equal(kaidoProfile.compatibility.adapterId, 'hianime-ajax');
  assert.deepEqual(kaidoProfile.hosts, ['https://kaido.to']);
  assert.equal(kaidoProfile.compatibility.compatibility, 'unverified');
  assert.equal(kaidoProfile.compatibility.fullyCompatible, false);

  // 2. GogoAnime / Anitaku clone family (distinct from Inbuilt)
  assert.equal(
    isGogoCloneCompatibleSource({ sourceId: 'shonenx-hls-inbuilt', hosts: [...INBUILT_PRIMARY_HOSTS] }),
    false,
  );
  assert.equal(
    isGogoCloneCompatibleSource({ sourceId: 'ext-ay-gogo', hosts: ['https://gogoanime3.co'] }),
    true,
  );
  const gogoCloneProfile = detectSourceProfile({
    id: 'ext-ay-anitaku',
    name: 'Anitaku',
    baseUrl: 'https://anitaku.pe',
  });
  assert.equal(gogoCloneProfile.kind, 'gogo-clone');
  assert.equal(gogoCloneProfile.compatibility.adapterId, 'gogo-html');
  assert.deepEqual(gogoCloneProfile.hosts, ['https://anitaku.pe']);
  assert.equal(gogoCloneProfile.compatibility.compatibility, 'unverified');

  // 3. WordPress AnimeStream / DooPlay family
  assert.equal(
    isWordPressAnimeCompatibleSource({ sourceId: 'ext-ay-animexin', hosts: ['https://animexin.dev'] }),
    true,
  );
  const wpProfile = detectSourceProfile({
    id: 'ext-ay-toonstream',
    name: 'ToonStream',
    baseUrl: 'https://toonstream.co',
  });
  assert.equal(wpProfile.kind, 'wordpress-animestream');
  assert.equal(wpProfile.compatibility.adapterId, 'wordpress-animestream');
  assert.equal(wpProfile.compatibility.compatibility, 'unverified');

  // 4. Unverified / different-API extensions (AnimePahe, AllAnime) are NOT forced into specialized adapters
  const paheProfile = detectSourceProfile({
    id: 'ext-ay-animepahe',
    name: 'AnimePahe',
    baseUrl: 'https://animepahe.ru',
  });
  assert.equal(paheProfile.kind, 'generic-web');
  assert.equal(paheProfile.compatibility.compatibility, 'unverified');
});

test('shared adapter normalization and HTML utility helpers normalize items, episodes, IDs, and challenges', () => {
  assert.equal(extractNumericIdFromHref('/watch/chainsaw-man-17406'), '17406');
  assert.equal(extractNumericIdFromHref('/anime/chainsaw-man/'), null);

  assert.equal(
    looksLikeBlockedChallengeHtml(403, '<title>Just a moment...</title><div>Cloudflare</div>'),
    true,
  );
  assert.equal(looksLikeBlockedChallengeHtml(200, '<html><body><h1>Chainsaw Man</h1></body></html>'), false);

  const items = normalizeProviderSearchItems('ext-demo', [
    { href: '/category/chainsaw-man/', title: 'Chainsaw Man', cover: 'https://cdn.example/csm.jpg' },
  ]);
  assert.deepEqual(items, [
    {
      sourceId: 'ext-demo',
      title: 'Chainsaw Man',
      href: '/category/chainsaw-man/',
      slug: 'chainsaw-man',
      cover: 'https://cdn.example/csm.jpg',
    },
  ]);

  const normalizedEps = normalizeProviderEpisodes({
    sourceId: 'ext-demo',
    host: 'https://demo.example',
    sourceAnimeHref: '/category/chainsaw-man/',
    sourceAnimeSlug: 'chainsaw-man',
    episodes: [
      { sourceEpisodeId: 'ep-1', number: 1, title: 'Dog & Chainsaw', episodeUrl: '/watch/ep-1' },
      { sourceEpisodeId: 'ep-1', number: 2, title: 'Duplicate ID Safe', episodeUrl: '/watch/ep-2' },
    ],
  });
  assert.equal(normalizedEps[0].id, 'ext-demo:ep-1');
  assert.equal(normalizedEps[1].id, 'ext-demo:ep-1:1');
  assert.equal(normalizedEps[0].externalUrl, 'https://demo.example/watch/ep-1');
});








import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BaseServerAnimeExtensionAdapter,
  createServerAnimeExtensionAdapter,
  diagnoseAnimeExtensionServer,
  ExtensionCapabilityError,
  GogoCloneServerAdapter,
  HiAnimeServerAdapter,
  registerServerAnimeExtensionAdapter,
  resolveAnimeEpisodeStream,
  resolveAnimeExtensionEpisodesServer,
  searchAnimeExtensionEntriesServer,
  type SelectedSourceEntryInput,
  type ServerAdapterRuntime,
  type ServerHostStreamOutcome,
  type ServerStreamExecutionInput,
  unregisterServerAnimeExtensionAdapter,
  WordPressAnimeServerAdapter,
} from './animeStreamResolver.ts';
import { diagnoseMangaExtensionServer } from './mangaResolver.ts';
import { UpstreamFetchError } from './networkReliability.ts';

test('searchAnimeExtensionEntriesServer returns honest incompatibility for client-rendered Turnstile SPA extensions like Gotaku', async () => {
  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calledUrls.push(url);
    if (url.includes('/wp-json/')) {
      return new Response('Not Found', { status: 404 });
    }
    return new Response(
      '<!doctype html><html><head><title>Gotaku</title></head><body><div id="root"></div><script id="boot">{"turnstile_site_key":"0x4AAAA"}</script><script type="module" src="/assets/app.js"></script></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  }) as typeof fetch;

  try {
    const res = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-yuzono-gotaku',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'Chainsaw Man',
    });

    assert.equal(res.compatible, false);
    assert.equal(res.items.length, 0);
    assert.ok(res.reason && /Turnstile|JavaScript app/i.test(res.reason));
    assert.ok(
      calledUrls.every((u) => u.startsWith('https://gotaku.to/')),
      'must query ONLY the selected extension host, never global AniList/Jikan or Inbuilt hosts',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('searchAnimeExtensionEntriesServer returns matching source entries and resolveAnimeEpisodeStream preserves direct selectedSourceEntry identity without re-searching', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://custom-ext.example/?s=')) {
      return new Response(
        `
        <html><body>
          <div class="bsx">
            <a href="/anime/custom-alt-title-hindi/" title="Naruto Shippuuden Hindi Special">
              <img src="https://cdn.custom-ext.example/cover.jpg" />
            </a>
          </div>
          <div class="bsx">
            <a href="/anime/unrelated-show/" title="Unrelated Sidebar Show"></a>
          </div>
        </body></html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/anime/custom-alt-title-hindi/') {
      return new Response(
        `<html><body><a href="/watch/custom-alt-title-hindi-episode-1/">Episode 1</a></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/watch/custom-alt-title-hindi-episode-1/') {
      return new Response(
        `<html><body><video src="https://stream.custom-ext.example/video/ep1.m3u8"></video></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://custom-ext.example/anime/custom-alt-title-hindi-episode-1') {
      return new Response('Not Found', { status: 404 });
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const searchRes = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-custom-hindi',
      sourceName: 'Custom Hindi',
      sourceBaseUrl: 'https://custom-ext.example',
      sourceLang: 'hi',
      query: 'Naruto Shippuuden',
    });

    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items.length, 1);
    const chosen = searchRes.items[0];
    assert.equal(chosen.sourceId, 'ext-custom-hindi');
    assert.equal(chosen.href, '/anime/custom-alt-title-hindi/');
    assert.equal(chosen.slug, 'anime/custom-alt-title-hindi');
    assert.equal(chosen.title, 'Naruto Shippuuden Hindi Special');
    assert.equal(chosen.cover, 'https://cdn.custom-ext.example/cover.jpg');

    requestedUrls.length = 0;

    // Now resolve stream using the selected source entry — should NOT call /?s= search again
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '1735',
      titles: { english: 'Naruto: Shippuden', romaji: 'Naruto: Shippuden' },
      episodeNumber: 1,
      category: 'dub',
      audioLanguage: 'hi',
      sourceId: 'ext-custom-hindi',
      sourceName: 'Custom Hindi',
      sourceBaseUrl: 'https://custom-ext.example',
      sourceLang: 'hi',
      selectedSourceEntry: chosen,
      bypassCache: true,
    });

    assert.equal(stream.sourceId, 'ext-custom-hindi');
    assert.equal(stream.matchedTitle, 'Naruto Shippuuden Hindi Special');
    assert.equal(stream.matchedSlug, 'anime/custom-alt-title-hindi');
    assert.ok(stream.rawUrl.includes('https://stream.custom-ext.example/video/ep1.m3u8'));
    assert.equal(
      requestedUrls.some((u) => u.includes('?s=') || u.includes('search')),
      false,
      'direct selectedSourceEntry must bypass title re-searching and resolve straight from selected href/slug',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeEpisodeStream ignores selectedSourceEntry when sourceId belongs to a different source or Inbuilt', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    if (url.includes('gogoanimes.fi/search.html?keyword=')) {
      return new Response(
        '<p class="name"><a href="/category/chainsaw-man" title="Chainsaw Man">Chainsaw Man</a></p>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url.includes('gogoanimes.fi/chainsaw-man-episode-1')) {
      return new Response(
        '<video src="https://cdn.gogo.example/chainsaw-ep1.m3u8"></video>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '127230',
      titles: { english: 'Chainsaw Man', romaji: 'Chainsaw Man' },
      episodeNumber: 1,
      category: 'sub',
      audioLanguage: 'ja',
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      selectedSourceEntry: {
        sourceId: 'ext-some-other',
        title: 'Stale Wrong Source Entry',
        href: '/stale-wrong-entry/',
        slug: 'stale-wrong-entry',
      },
      bypassCache: true,
    });

    assert.equal(stream.sourceId, 'shonenx-hls-inbuilt');
    assert.equal(stream.matchedSlug, 'chainsaw-man');
    assert.equal(
      requestedUrls.some((u) => u.includes('stale-wrong-entry')),
      false,
      'stale selectedSourceEntry from another extension must never leak into Inbuilt playback',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeExtensionEpisodesServer loads source-specific episodes with non-standard numbering and passes direct episode ID/URL into resolveAnimeEpisodeStream', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url === 'https://ext-series.example/anime/cour-two-hindi/') {
      return new Response(
        `
        <html><body>
          <div class="eplister">
            <ul>
              <li>
                <a href="/player/cour-two-special-part-13/" data-id="src-ep-1301">
                  <div class="epl-num">13</div>
                  <div class="epl-title">The Crimson Oath (Cour 2 Start)</div>
                </a>
              </li>
              <li>
                <a href="/player/cour-two-oath-broken-14/" data-id="src-ep-1402">
                  <div class="epl-num">14</div>
                  <div class="epl-title">Ashes Beneath Snow</div>
                </a>
              </li>
            </ul>
          </div>
        </body></html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://ext-series.example/player/cour-two-oath-broken-14/') {
      return new Response(
        `<html><body><video src="https://cdn.ext-series.example/hls/cour2-ep14.m3u8"></video></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-cour2',
      sourceName: 'Cour2 Source',
      sourceBaseUrl: 'https://ext-series.example',
      sourceLang: 'hi',
      selectedSourceEntry: {
        sourceId: 'ext-cour2',
        title: 'Cour Two Hindi',
        href: '/anime/cour-two-hindi/',
        slug: 'anime/cour-two-hindi',
      },
      bypassCache: true,
    });

    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes.length, 2);
    assert.deepEqual(
      epRes.episodes.map((e) => ({
        number: e.number,
        title: e.title,
        sourceId: e.sourceId,
        sourceEpisodeId: e.sourceEpisodeId,
        episodeUrl: e.episodeUrl,
        sourceAnimeHref: e.sourceAnimeHref,
        sourceAnimeSlug: e.sourceAnimeSlug,
      })),
      [
        {
          number: 13,
          title: 'The Crimson Oath (Cour 2 Start)',
          sourceId: 'ext-cour2',
          sourceEpisodeId: 'src-ep-1301',
          episodeUrl: '/player/cour-two-special-part-13/',
          sourceAnimeHref: '/anime/cour-two-hindi/',
          sourceAnimeSlug: 'anime/cour-two-hindi',
        },
        {
          number: 14,
          title: 'Ashes Beneath Snow',
          sourceId: 'ext-cour2',
          sourceEpisodeId: 'src-ep-1402',
          episodeUrl: '/player/cour-two-oath-broken-14/',
          sourceAnimeHref: '/anime/cour-two-hindi/',
          sourceAnimeSlug: 'anime/cour-two-hindi',
        },
      ],
    );

    assert.ok(
      requestedUrls.every((u) => u.startsWith('https://ext-series.example/')),
      'must resolve episodes exclusively from selected external host, never AniList/Jikan/AniZip/Kitsu',
    );

    requestedUrls.length = 0;

    const chosenEp = epRes.episodes[1];
    const stream = await resolveAnimeEpisodeStream({
      mediaId: '99999',
      titles: { english: 'Global Title Mismatch' },
      episodeNumber: chosenEp.number,
      category: 'dub',
      audioLanguage: 'hi',
      sourceId: 'ext-cour2',
      sourceName: 'Cour2 Source',
      sourceBaseUrl: 'https://ext-series.example',
      sourceLang: 'hi',
      selectedSourceEntry: {
        sourceId: 'ext-cour2',
        title: 'Cour Two Hindi',
        href: '/anime/cour-two-hindi/',
        slug: 'anime/cour-two-hindi',
      },
      selectedEpisode: chosenEp,
      bypassCache: true,
    });

    assert.equal(stream.matchedEpisode, 14);
    assert.equal(stream.sourceId, 'ext-cour2');
    assert.ok(stream.rawUrl.includes('https://cdn.ext-series.example/hls/cour2-ep14.m3u8'));
    assert.deepEqual(
      requestedUrls,
      ['https://ext-series.example/player/cour-two-oath-broken-14/'],
      'must hit the selected episode URL directly without re-searching or guessing Ep 14 URLs',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('resolveAnimeExtensionEpisodesServer returns honest unavailability without fake fallback episodes when episode list is missing or SPA', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      '<!doctype html><html><head><title>Gotaku</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    )) as typeof fetch;

  try {
    const spaRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-gotaku',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      selectedSourceEntry: {
        sourceId: 'ext-gotaku',
        title: 'Chainsaw Man',
        href: '/anime/chainsaw-man',
        slug: 'anime/chainsaw-man',
      },
      bypassCache: true,
    });
    assert.equal(spaRes.compatible, false);
    assert.deepEqual(spaRes.episodes, []);
    assert.ok(spaRes.reason && /JavaScript app|unavailable|supported/i.test(spaRes.reason));
  } finally {
    globalThis.fetch = originalFetch;
  }

  // Also ensure empty static series pages return [] and NEVER fabricate fake 1..12 episodes
  globalThis.fetch = (async () =>
    new Response('<html><body><h1>Title Removed</h1><p>No episodes available.</p></body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })) as typeof fetch;

  try {
    const emptyRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-empty',
      sourceName: 'EmptyExt',
      sourceBaseUrl: 'https://empty-ext.example',
      selectedSourceEntry: {
        sourceId: 'ext-empty',
        title: 'Removed Show',
        href: '/anime/removed-show/',
        slug: 'anime/removed-show',
      },
      bypassCache: true,
    });
    assert.equal(emptyRes.compatible, false);
    assert.deepEqual(emptyRes.episodes, []);
    assert.ok(emptyRes.reason && /No episode list could be retrieved/i.test(emptyRes.reason));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Gotaku uses public /api/v1/titles JSON for search while reporting encrypted/Turnstile episodes and playback honestly', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://gotaku.to/api/v1/titles?q=')) {
      const q = new URL(url).searchParams.get('q') || '';
      if (/nonexistent/i.test(q)) {
        return new Response(
          JSON.stringify({ data: [], meta: { page: 1, limit: 24, has_more: false, total: 0 } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response(
        JSON.stringify({
          data: [
            {
              id: 'lwk4qj',
              url: '/title/lwk4qj',
              watch_url: '/title/lwk4qj?ep=1',
              name: 'Chainsaw Man',
              poster_url: 'https://s4.anilist.co/chainsaw.png',
            },
            {
              id: 'other1',
              url: '/title/other1',
              name: 'Unrelated Show',
              poster_url: null,
            },
          ],
          meta: { page: 1, limit: 24, has_more: false, total: 2 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'https://gotaku.to/api/v1/titles/lwk4qj/episodes') {
      return new Response(
        JSON.stringify({ message: 'A new version of the site is available. Reload the page.' }),
        { status: 426, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // 1. Real Gotaku search matches Chainsaw Man and filters unrelated items
    const found = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'Chainsaw Man',
    });
    assert.equal(found.compatible, true);
    assert.equal(found.items.length, 1);
    assert.deepEqual(found.items[0], {
      sourceId: 'ext-ay-5194074774836006982',
      title: 'Chainsaw Man',
      href: '/title/lwk4qj',
      slug: 'title/lwk4qj',
      cover: 'https://s4.anilist.co/chainsaw.png',
    });

    // 2. Non-existent title returns [] from Gotaku without AniList/Jikan fallback
    const missing = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      query: 'NonExistentAnime999',
    });
    assert.equal(missing.compatible, true);
    assert.deepEqual(missing.items, []);

    assert.ok(
      requestedUrls.every((u) => u.startsWith('https://gotaku.to/')),
      'Gotaku adapter must never hit external metadata APIs like AniList/Jikan',
    );

    // 3. Episode loading honestly reports unsupported encrypted/Turnstile gate with zero fake episodes
    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      selectedSourceEntry: found.items[0],
      bypassCache: true,
    });
    assert.equal(epRes.compatible, false);
    assert.deepEqual(epRes.episodes, []);
    assert.ok(epRes.reason && /Turnstile|encrypted/i.test(epRes.reason));

    // 4. Playback rejects with clear unsupported message instead of claiming "No matching anime entries"
    await assert.rejects(
      () =>
        resolveAnimeEpisodeStream({
          mediaId: '127230',
          titles: { english: 'Chainsaw Man' },
          episodeNumber: 1,
          sourceId: 'ext-ay-5194074774836006982',
          sourceName: 'Gotaku',
          sourceBaseUrl: 'https://gotaku.to',
          selectedSourceEntry: found.items[0],
          bypassCache: true,
        }),
      /Turnstile|encrypted/i,
    );

    // 5. Diagnostics: basic verifies search (partial); full marks Gotaku unsupported for playback (never pass)
    const basicDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      mode: 'basic',
      query: 'Chainsaw Man',
    });
    assert.equal(basicDiag.status, 'partial');
    assert.equal(basicDiag.matchedTitle, 'Chainsaw Man');
    assert.equal(basicDiag.capabilities.metadataSearch, 'verified');

    const fullDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-5194074774836006982',
      sourceName: 'Gotaku',
      sourceBaseUrl: 'https://gotaku.to',
      mode: 'full',
      query: 'Chainsaw Man',
    });
    assert.equal(fullDiag.status, 'unsupported');
    assert.equal(fullDiag.capabilities.metadataSearch, 'verified');
    assert.equal(fullDiag.capabilities.episodeOrChapterListing, 'unsupported');
    assert.equal(fullDiag.capabilities.playbackOrReader, 'unsupported');
    assert.equal(fullDiag.capabilities.overallCompatibility, 'unsupported');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('custom server adapter via registerServerAnimeExtensionAdapter supports different JSON API structures and preserves capability checks', async () => {
  type JsonFeedPayload = {
    url: string;
    rawUrl: string;
    quality: string;
    isHls: boolean;
    serverName: string;
    sourceId?: string;
    provider?: string;
    matchedTitle?: string;
    matchedEpisode?: number;
    intro: null;
    outro: null;
    availableAudios: Array<{ code: 'ja'; shortLabel: string; label: string; serverCategory: 'sub' }>;
    mirrors: Array<{ url: string; quality: string; isHls: boolean; serverName: string }>;
    subtitles: [];
  };

  class JsonFeedServerAdapter extends BaseServerAnimeExtensionAdapter<JsonFeedPayload> {
    readonly adapterId = 'test-json-feed';
    readonly providerKind = 'json-feed-v2';

    protected async searchTitlesImpl(query: string) {
      const host = this.hosts[0];
      const res = await this.runtime.fetchText(`${host}/v2/search?q=${encodeURIComponent(query)}`);
      const data = JSON.parse(res.text) as { results: Array<{ slug: string; name: string }> };
      return {
        compatible: true,
        sourceLabel: this.sourceLabel,
        items: data.results.map((r) => ({
          sourceId: this.sourceId,
          title: r.name,
          href: `/v2/anime/${r.slug}`,
          slug: r.slug,
        })),
      };
    }

    protected async listEpisodesImpl(entry: SelectedSourceEntryInput) {
      const host = this.hosts[0];
      const res = await this.runtime.fetchText(`${host}${entry.href}/episodes.json`);
      const data = JSON.parse(res.text) as { eps: Array<{ id: string; num: number; name: string }> };
      return {
        compatible: true,
        sourceLabel: this.sourceLabel,
        episodes: data.eps.map((ep) => ({
          id: `${this.sourceId}:${ep.id}`,
          number: ep.num,
          title: ep.name,
          sourceId: this.sourceId,
          sourceEpisodeId: ep.id,
          episodeUrl: `/v2/stream/${ep.id}.json`,
          sourceAnimeHref: entry.href,
          sourceAnimeSlug: entry.slug,
        })),
      };
    }

    protected async resolveStreamImpl(
      input: ServerStreamExecutionInput,
    ): Promise<ServerHostStreamOutcome<JsonFeedPayload>> {
      const host = this.hosts[0];
      const epPath = input.validSelectedEpisode?.episodeUrl || `/v2/stream/ep-${input.episodeNumber}.json`;
      const res = await this.runtime.fetchText(`${host}${epPath}`);
      const json = JSON.parse(res.text) as { m3u8: string };
      return {
        payload: {
          url: json.m3u8,
          rawUrl: json.m3u8,
          quality: '1080p',
          isHls: true,
          serverName: 'JSON V2',
          sourceId: this.sourceId,
          provider: this.adapterId,
          matchedTitle: input.directSelectedCandidate?.title,
          matchedEpisode: input.validSelectedEpisode?.number ?? input.episodeNumber,
          intro: null,
          outro: null,
          availableAudios: [{ code: 'ja' as const, shortLabel: 'JA', label: 'Japanese (Sub)', serverCategory: 'sub' as const }],
          mirrors: [{ url: json.m3u8, quality: '1080p', isHls: true, serverName: 'JSON V2' }],
          subtitles: [],
        },
      };
    }
  }

  const originalFetch = globalThis.fetch;
  const calledUrls: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calledUrls.push(url);
    if (url.startsWith('https://json-feed.example/v2/search?q=')) {
      return new Response(
        JSON.stringify({ results: [{ slug: 'frieren-s2', name: 'Frieren JSON Feed' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === 'https://json-feed.example/v2/anime/frieren-s2/episodes.json') {
      return new Response(
        JSON.stringify({ eps: [{ id: 'f2-ep1', num: 1, name: 'Departure JSON' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === 'https://json-feed.example/v2/stream/f2-ep1.json') {
      return new Response(
        JSON.stringify({ m3u8: 'https://cdn.json-feed.example/ep1/master.m3u8' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  registerServerAnimeExtensionAdapter({
    id: 'test-json-feed-adapter',
    matches: (source) => source.sourceId === 'ext-json-feed',
    factory: (source, runtime, profile) => new JsonFeedServerAdapter(source, runtime, profile),
  });

  try {
    const searchRes = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-json-feed',
      sourceName: 'JSON Feed Ext',
      sourceBaseUrl: 'https://json-feed.example',
      query: 'Frieren',
    });
    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items[0].href, '/v2/anime/frieren-s2');

    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-json-feed',
      sourceName: 'JSON Feed Ext',
      sourceBaseUrl: 'https://json-feed.example',
      selectedSourceEntry: searchRes.items[0],
      bypassCache: true,
    });
    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes[0].sourceEpisodeId, 'f2-ep1');

    const stream = await resolveAnimeEpisodeStream({
      mediaId: '154587',
      titles: { english: 'Frieren' },
      episodeNumber: 1,
      sourceId: 'ext-json-feed',
      sourceName: 'JSON Feed Ext',
      sourceBaseUrl: 'https://json-feed.example',
      selectedSourceEntry: searchRes.items[0],
      selectedEpisode: epRes.episodes[0],
      bypassCache: true,
    });
    assert.equal(stream.url, 'https://cdn.json-feed.example/ep1/master.m3u8');
    assert.equal(stream.provider, 'test-json-feed');

    // Metadata-only source must reject cleanly with METADATA_ONLY_SOURCE before making any fetch
    calledUrls.length = 0;
    await assert.rejects(
      () =>
        resolveAnimeEpisodeStream({
          mediaId: '154587',
          titles: { english: 'Frieren' },
          episodeNumber: 1,
          sourceId: 'ext-mal',
          sourceName: 'MyAnimeList',
          sourceBaseUrl: 'https://myanimelist.net',
          bypassCache: true,
        }),
      (err: unknown) => err instanceof ExtensionCapabilityError && err.code === 'METADATA_ONLY_SOURCE',
    );
    assert.deepEqual(calledUrls, []);
  } finally {
    unregisterServerAnimeExtensionAdapter('test-json-feed-adapter');
    globalThis.fetch = originalFetch;
  }
});

test('HiAnimeServerAdapter handles cloned repo hosts like Kaido with strict host isolation across search, episodes, playback, and diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://kaido.to/search?keyword=')) {
      return new Response(
        `
        <html><body>
          <div class="flw-item">
            <a href="/watch/solo-leveling-18718" title="Solo Leveling">
              <img src="https://cdn.kaido.to/solo.jpg" />
            </a>
          </div>
        </body></html>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://kaido.to/ajax/v2/episode/list/18718') {
      return new Response(
        JSON.stringify({
          html: `
            <div class="ss-list">
              <a class="ssl-item ep-item" data-number="1" data-id="55101" href="/watch/solo-leveling-18718?ep=55101">
                <div class="ep-name">I'm Used to It</div>
              </a>
              <a class="ssl-item ep-item" data-number="2" data-id="55102" href="/watch/solo-leveling-18718?ep=55102">
                <div class="ep-name">If I Had One More Chance</div>
              </a>
            </div>
          `,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'https://kaido.to/ajax/v2/episode/servers?episodeId=55101' || url === 'https://kaido.to/ajax/v2/episode/servers?episodeId=55102') {
      return new Response(
        JSON.stringify({
          html: `<div class="server-item" data-type="sub" data-id="7701">HD-1</div>`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'https://kaido.to/ajax/v2/episode/sources?id=7701') {
      return new Response(
        JSON.stringify({ link: 'https://megaplay.buzz/stream/s-2/55102/sub' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === 'https://megaplay.buzz/stream/s-2/55102/sub') {
      return new Response('<div id="megaplay-player" data-id="55102"></div>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url === 'https://megaplay.buzz/stream/getSources?id=55102') {
      return new Response(
        JSON.stringify({
          sources: { file: 'https://cdn.kaido-mirror.example/solo-ep2/master.m3u8' },
          tracks: [{ file: 'https://cdn.kaido-mirror.example/en.vtt', label: 'English', kind: 'captions' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const adapter = createServerAnimeExtensionAdapter(
      {
        sourceId: 'ext-ay-kaido',
        sourceName: 'Kaido',
        sourceBaseUrl: 'https://kaido.to',
      },
      {} as ServerAdapterRuntime,
    );
    assert.ok(adapter instanceof HiAnimeServerAdapter);
    assert.equal(adapter.adapterId, 'hianime-ajax');

    const searchRes = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-kaido',
      sourceName: 'Kaido',
      sourceBaseUrl: 'https://kaido.to',
      query: 'Solo Leveling',
    });
    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items[0].href, '/watch/solo-leveling-18718');

    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-kaido',
      sourceName: 'Kaido',
      sourceBaseUrl: 'https://kaido.to',
      selectedSourceEntry: searchRes.items[0],
      bypassCache: true,
    });
    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes.length, 2);
    assert.equal(epRes.episodes[1].sourceEpisodeId, '55102');

    const stream = await resolveAnimeEpisodeStream({
      mediaId: '151807',
      titles: { english: 'Solo Leveling' },
      episodeNumber: 2,
      category: 'sub',
      sourceId: 'ext-ay-kaido',
      sourceName: 'Kaido',
      sourceBaseUrl: 'https://kaido.to',
      selectedSourceEntry: searchRes.items[0],
      selectedEpisode: epRes.episodes[1],
      bypassCache: true,
    });
    assert.equal(stream.matchedEpisode, 2);
    assert.equal(stream.rawUrl, 'https://cdn.kaido-mirror.example/solo-ep2/master.m3u8');
    assert.ok(stream.subtitles.some((s) => s.lang === 'en'));
    assert.equal(
      requestedUrls.some((u) => u.includes('hianime.to') || u.includes('gogoanimes.fi')),
      false,
      'cloned Kaido adapter must never leak requests to hianime.to or Inbuilt Gogo hosts',
    );

    const basicDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-kaido',
      sourceName: 'Kaido',
      sourceBaseUrl: 'https://kaido.to',
      mode: 'basic',
      query: 'Solo Leveling',
    });
    assert.equal(basicDiag.status, 'partial');
    assert.ok(basicDiag.detail.includes('adapter: hianime-ajax'));

    const fullDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-kaido',
      sourceName: 'Kaido',
      sourceBaseUrl: 'https://kaido.to',
      mode: 'full',
      query: 'Solo Leveling',
    });
    assert.equal(fullDiag.status, 'pass');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('GogoCloneServerAdapter supports Gogo/Anitaku clone search, AJAX episode list, and playback without Inbuilt fallback', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://gogoanime3.co/search.html?keyword=')) {
      return new Response(
        `<ul class="items"><li><p class="name"><a href="/category/dandadan" title="Dandadan">Dandadan</a></p></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://gogoanime3.co/category/dandadan') {
      return new Response(
        `<html><body><input type="hidden" id="movie_id" value="99123" /></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url.startsWith('https://gogoanime3.co/ajax/load-list-episode')) {
      return new Response(
        `
        <ul id="episode_related">
          <li><a href="/dandadan-episode-1"><div class="name">EP 1</div></a></li>
        </ul>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://gogoanime3.co/dandadan-episode-1') {
      return new Response(
        `<div class="anime_muti_link"><ul><li><a data-video="https://embed.gogo3.example/v/dandadan-1">Vidstreaming</a></li></ul></div>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    if (url === 'https://embed.gogo3.example/v/dandadan-1') {
      return new Response(
        `<script>var hls = "https://cdn.gogo3.example/dandadan/ep1.m3u8";</script>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const adapter = createServerAnimeExtensionAdapter(
      {
        sourceId: 'ext-ay-gogo3',
        sourceName: 'GogoAnime3',
        sourceBaseUrl: 'https://gogoanime3.co',
      },
      {} as ServerAdapterRuntime,
    );
    assert.ok(adapter instanceof GogoCloneServerAdapter);

    const searchRes = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-gogo3',
      sourceName: 'GogoAnime3',
      sourceBaseUrl: 'https://gogoanime3.co',
      query: 'Dandadan',
    });
    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items[0].href, '/category/dandadan');

    const epRes = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-gogo3',
      sourceName: 'GogoAnime3',
      sourceBaseUrl: 'https://gogoanime3.co',
      selectedSourceEntry: searchRes.items[0],
      bypassCache: true,
    });
    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes.length, 1);
    assert.equal(epRes.episodes[0].episodeUrl, '/dandadan-episode-1');

    const stream = await resolveAnimeEpisodeStream({
      mediaId: '171018',
      titles: { english: 'Dandadan' },
      episodeNumber: 1,
      sourceId: 'ext-ay-gogo3',
      sourceName: 'GogoAnime3',
      sourceBaseUrl: 'https://gogoanime3.co',
      selectedSourceEntry: searchRes.items[0],
      selectedEpisode: epRes.episodes[0],
      bypassCache: true,
    });
    assert.equal(stream.rawUrl, 'https://cdn.gogo3.example/dandadan/ep1.m3u8');
    assert.equal(
      requestedUrls.some((u) => u.includes('gogoanimes.fi') || u.includes('hianime.to')),
      false,
      'GogoClone adapter must strictly use configured Gogo clone host',
    );

    const fullDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-gogo3',
      sourceName: 'GogoAnime3',
      sourceBaseUrl: 'https://gogoanime3.co',
      mode: 'full',
      query: 'Dandadan',
    });
    assert.equal(fullDiag.status, 'pass');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('WordPressAnimeServerAdapter migrates AnimeStream and DooPlay Hindi extensions across search, episodes, playback, and diagnostics', async () => {
  const originalFetch = globalThis.fetch;
  const encodedMirrorIframe = Buffer.from(
    '<iframe src="https://player.animexin.example/e/ep1"></iframe>',
  ).toString('base64');
  const encodedM3u8 = Buffer.from('https://cdn.animexin.example/zhan-shen/ep1.m3u8').toString('base64');

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // AnimeStream host (animexin.dev)
    if (url.startsWith('https://animexin.dev/?s=')) {
      return new Response(
        `<div class="bsx"><a href="/anime/zhan-shen/" title="Zhan Shen">Zhan Shen</a></div>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://animexin.dev/anime/zhan-shen/') {
      return new Response(
        `
        <div class="eplister">
          <ul>
            <li><a href="/zhan-shen-episode-01/"><div class="epl-num">1</div><div class="epl-title">Prologue</div></a></li>
          </ul>
        </div>
        `,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://animexin.dev/zhan-shen-episode-01/') {
      return new Response(
        `<select class="mirror"><option value="${encodedMirrorIframe}">Mirror 1</option></select>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://player.animexin.example/e/ep1') {
      return new Response(`<script>var u = atob("${encodedM3u8}");</script>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // DooPlay host (toonstream.co) with Hindi audio AJAX
    if (url.startsWith('https://toonstream.co/?s=')) {
      return new Response(
        `<article class="result-item"><a href="/series/naruto-hindi/" title="Naruto Hindi"><h3 class="title">Naruto Hindi</h3></a></article>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://toonstream.co/series/naruto-hindi/') {
      return new Response(
        `<ul class="episodios"><li><a href="/episode/naruto-hindi-1x1/"><div class="numerando">1</div>Episode 1</a></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://toonstream.co/episode/naruto-hindi-1x1/') {
      return new Response(
        `<ul><li class="dooplay_player_option" data-type="tv" data-post="420" data-nume="1">Hindi Server 1</li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://toonstream.co/wp-admin/admin-ajax.php' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ embed_url: 'https://player.toon.example/hindi-ep1/master.m3u8' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // Verify factory routing
    const animexinAdapter = createServerAnimeExtensionAdapter(
      {
        sourceId: 'ext-ay-animexin',
        sourceName: 'AnimeXin',
        sourceBaseUrl: 'https://animexin.dev',
      },
      {} as ServerAdapterRuntime,
    );
    assert.ok(animexinAdapter instanceof WordPressAnimeServerAdapter);

    // Case A: AnimeStream flow
    const axSearch = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-animexin',
      sourceName: 'AnimeXin',
      sourceBaseUrl: 'https://animexin.dev',
      query: 'Zhan Shen',
    });
    assert.equal(axSearch.compatible, true);
    assert.equal(axSearch.items[0].href, '/anime/zhan-shen/');

    const axEps = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-animexin',
      sourceName: 'AnimeXin',
      sourceBaseUrl: 'https://animexin.dev',
      selectedSourceEntry: axSearch.items[0],
      bypassCache: true,
    });
    assert.equal(axEps.compatible, true);
    assert.equal(axEps.episodes[0].episodeUrl, '/zhan-shen-episode-01/');

    const axStream = await resolveAnimeEpisodeStream({
      mediaId: '88801',
      titles: { english: 'Zhan Shen' },
      episodeNumber: 1,
      sourceId: 'ext-ay-animexin',
      sourceName: 'AnimeXin',
      sourceBaseUrl: 'https://animexin.dev',
      selectedSourceEntry: axSearch.items[0],
      selectedEpisode: axEps.episodes[0],
      bypassCache: true,
    });
    assert.equal(axStream.rawUrl, 'https://cdn.animexin.example/zhan-shen/ep1.m3u8');

    // Case B: DooPlay Hindi flow + diagnostics pass
    const tsSearch = await searchAnimeExtensionEntriesServer({
      sourceId: 'ext-ay-toonstream',
      sourceName: 'ToonStream',
      sourceBaseUrl: 'https://toonstream.co',
      sourceLang: 'hi',
      query: 'Naruto',
    });
    assert.equal(tsSearch.compatible, true);
    assert.equal(tsSearch.items[0].href, '/series/naruto-hindi/');

    const tsEps = await resolveAnimeExtensionEpisodesServer({
      sourceId: 'ext-ay-toonstream',
      sourceName: 'ToonStream',
      sourceBaseUrl: 'https://toonstream.co',
      sourceLang: 'hi',
      selectedSourceEntry: tsSearch.items[0],
      bypassCache: true,
    });
    assert.equal(tsEps.compatible, true);
    assert.equal(tsEps.episodes[0].episodeUrl, '/episode/naruto-hindi-1x1/');

    const tsStream = await resolveAnimeEpisodeStream({
      mediaId: '20',
      titles: { english: 'Naruto' },
      episodeNumber: 1,
      category: 'dub',
      audioLanguage: 'hi',
      sourceId: 'ext-ay-toonstream',
      sourceName: 'ToonStream',
      sourceBaseUrl: 'https://toonstream.co',
      sourceLang: 'hi',
      selectedSourceEntry: tsSearch.items[0],
      selectedEpisode: tsEps.episodes[0],
      bypassCache: true,
    });
    assert.equal(tsStream.rawUrl, 'https://player.toon.example/hindi-ep1/master.m3u8');
    assert.ok(tsStream.availableAudios.some((a) => a.code === 'hi'));

    const tsDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-toonstream',
      sourceName: 'ToonStream',
      sourceBaseUrl: 'https://toonstream.co',
      sourceLang: 'hi',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(tsDiag.status, 'pass');
    assert.equal(tsDiag.mode, 'full');
    assert.ok(tsDiag.testedAt);
    assert.equal(tsDiag.capabilities.audioLanguage, 'verified');
    assert.ok((tsDiag.detectedAudioLanguages || []).includes('hi'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnoseAnimeExtensionServer reports partial, fail, and unsupported honestly without false-positive Supported playback', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // 1. Authorized fixture with broken stream embed (search & episodes ok, playback fails)
    if (url.startsWith('https://broken-stream.example/search.html?keyword=')) {
      return new Response(
        `<ul class="items"><li><p class="name"><a href="/category/bleach" title="Bleach">Bleach</a></p></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://broken-stream.example/category/bleach') {
      return new Response(`<input type="hidden" id="movie_id" value="77" />`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.startsWith('https://broken-stream.example/ajax/load-list-episode')) {
      return new Response(
        `<ul id="episode_related"><li><a href="/bleach-episode-1"><div class="name">EP 1</div></a></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://broken-stream.example/bleach-episode-1') {
      return new Response(`<html><body>No embed mirrors here</body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url === 'https://broken-stream.example/') {
      return new Response(`<html><body>OK</body></html>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    if (url.startsWith('https://down-host.example')) {
      throw new Error('connect ECONNREFUSED');
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // Ping-only returns partial and playback untested
    const pingDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-broken',
      sourceName: 'BrokenStream',
      sourceBaseUrl: 'https://broken-stream.example',
      mode: 'ping',
      query: 'Bleach',
    });
    assert.equal(pingDiag.status, 'partial');
    assert.equal(pingDiag.mode, 'ping');
    assert.ok(pingDiag.testedAt);
    assert.equal(pingDiag.capabilities.playbackOrReader, 'untested');
    assert.equal(pingDiag.capabilities.audioLanguage, 'untested');

    // Search + episodes ok, playback fails -> partial (never pass!)
    const partialDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-broken',
      sourceName: 'BrokenStream',
      sourceBaseUrl: 'https://broken-stream.example',
      mode: 'full',
      query: 'Bleach',
    });
    assert.equal(partialDiag.status, 'partial');
    assert.equal(partialDiag.capabilities.metadataSearch, 'verified');
    assert.equal(partialDiag.capabilities.episodeOrChapterListing, 'verified');
    assert.equal(partialDiag.capabilities.playbackOrReader, 'unavailable');
    assert.equal(partialDiag.capabilities.audioLanguage, 'untested');

    // Unreachable host -> fail
    const unreachableDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-down',
      sourceName: 'DownHost',
      sourceBaseUrl: 'https://down-host.example',
      mode: 'full',
      query: 'Bleach',
    });
    assert.equal(unreachableDiag.status, 'fail');
    assert.equal(unreachableDiag.capabilities.playbackOrReader, 'unavailable');

    // Metadata-only catalog -> unsupported
    const metaDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-anilist',
      sourceName: 'AniList Catalog',
      sourceBaseUrl: 'https://anilist.co',
      mode: 'full',
      query: 'Bleach',
    });
    assert.equal(metaDiag.status, 'unsupported');
    assert.equal(metaDiag.capabilities.playbackOrReader, 'unsupported');
    assert.equal(metaDiag.capabilities.audioLanguage, 'unsupported');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Batch 4: safe bounded retry recovers transient 502, skips retry on 401/429, deduplicates concurrent runs, and refuses unconfirmed audio claims', async () => {
  const originalFetch = globalThis.fetch;
  let transientAttempts = 0;
  let persistent502Attempts = 0;
  let authAttempts = 0;
  let blockedAttempts = 0;
  let dedupeSearchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    // 1. Transient 502 on 1st attempt -> recovers on 2nd retry for untagged Gogo fixture
    if (url.startsWith('https://transient-gogo.example/search.html?keyword=')) {
      transientAttempts += 1;
      if (transientAttempts === 1) {
        return new Response('Bad Gateway', { status: 502 });
      }
      return new Response(
        `<ul class="items"><li><p class="name"><a href="/category/bleach" title="Bleach">Bleach</a></p></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://persistent-502.example/') {
      persistent502Attempts += 1;
      return new Response('Bad Gateway', { status: 502 });
    }
    if (url === 'https://transient-gogo.example/category/bleach') {
      return new Response(`<input type="hidden" id="movie_id" value="88" />`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.startsWith('https://transient-gogo.example/ajax/load-list-episode')) {
      return new Response(
        `<ul id="episode_related"><li><a href="/bleach-episode-1"><div class="name">EP 1</div></a></li></ul>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://transient-gogo.example/bleach-episode-1') {
      return new Response(
        `<div class="anime_muti_link"><ul><li><a data-video="https://transient-gogo.example/embed/ep1">Vidstreaming</a></li></ul></div>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://transient-gogo.example/embed/ep1') {
      return new Response(`<video src="https://transient-gogo.example/cdn/ep1.m3u8"></video>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // 2. Auth failure 401 -> MUST NOT retry
    if (url === 'https://auth-locked.example/') {
      authAttempts += 1;
      return new Response('Unauthorized', { status: 401 });
    }

    // 3. Rate-limited / anti-bot 429 -> MUST NOT retry
    if (url === 'https://ratelimited.example/') {
      blockedAttempts += 1;
      return new Response('Too Many Requests', { status: 429 });
    }

    // 4. Persistent Timeout -> classifies timeout
    if (url.startsWith('https://slow-timeout.example')) {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    }

    // 5. Malformed JSON on HiAnime AJAX episode list
    if (url.startsWith('https://malformed-hi.example/search?keyword=')) {
      return new Response(
        `<div class="film_list-wrap"><div class="flw-item"><div class="film-detail"><h3 class="film-name"><a href="/watch/naruto-123" title="Naruto">Naruto</a></h3></div></div></div>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://malformed-hi.example/watch/naruto-123') {
      return new Response(`<div data-id="123"></div>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.startsWith('https://malformed-hi.example/ajax/v2/episode/list/123')) {
      return new Response(`{"status": true, "html": "<corrupted`, {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 6. Concurrent deduplication fixture
    if (url.startsWith('https://dedupe-hi.example/search?keyword=')) {
      dedupeSearchCalls += 1;
      await new Promise((r) => setTimeout(r, 25));
      return new Response(
        `<div class="film_list-wrap"><div class="flw-item"><div class="film-detail"><h3 class="film-name"><a href="/watch/naruto-55" title="Naruto">Naruto</a></h3></div></div></div>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }
    if (url === 'https://dedupe-hi.example/watch/naruto-55') {
      return new Response(`<div data-id="55"></div>`, { status: 200, headers: { 'Content-Type': 'text/html' } });
    }
    if (url.startsWith('https://dedupe-hi.example/ajax/v2/episode/list/55')) {
      return new Response(
        JSON.stringify({ status: true, html: `<a class="ep-item" data-number="1" data-id="5501">1</a>` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.startsWith('https://dedupe-hi.example/ajax/v2/episode/servers?episodeId=5501')) {
      return new Response(
        JSON.stringify({ status: true, html: `<div class="server-item" data-type="sub" data-id="901">HD-1</div>` }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.startsWith('https://dedupe-hi.example/ajax/v2/episode/sources?id=901')) {
      return new Response(
        JSON.stringify({ link: 'https://dedupe-hi.example/embed/901' }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === 'https://dedupe-hi.example/embed/901') {
      return new Response(`<video src="https://dedupe-hi.example/hls/master.m3u8"></video>`, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    // 1. Transient 502 recovered (2 search calls: 1 retry in searchTitles + 1 in stream resolver = 3)
    // and untagged Gogo leaves audio partial & unconfirmed
    const recoveredDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-transient',
      sourceName: 'TransientGogo',
      sourceBaseUrl: 'https://transient-gogo.example',
      mode: 'full',
      query: 'Bleach',
    });
    assert.equal(transientAttempts, 3);
    assert.equal(recoveredDiag.status, 'pass');
    assert.equal(recoveredDiag.probeScope, 'Episode 1 default probe');
    assert.deepEqual(recoveredDiag.confirmedAudioLanguages, []);
    assert.deepEqual(recoveredDiag.inferredAudioLanguages, ['ja']);
    assert.equal(recoveredDiag.capabilities.audioLanguage, 'partial');

    // Persistent 502 stops strictly after 1 retry (2 attempts total)
    const persistent502Diag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-p502',
      sourceName: 'Persistent502',
      sourceBaseUrl: 'https://persistent-502.example',
      mode: 'ping',
      query: 'Bleach',
    });
    assert.equal(persistent502Attempts, 2);
    assert.equal(persistent502Diag.status, 'fail');
    assert.equal(persistent502Diag.failureKind, 'provider_error');

    // 2. Auth 401 never retries
    const authDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-auth',
      sourceName: 'AuthLocked',
      sourceBaseUrl: 'https://auth-locked.example',
      mode: 'ping',
      query: 'Bleach',
    });
    assert.equal(authAttempts, 1);
    assert.equal(authDiag.status, 'fail');
    assert.equal(authDiag.failureKind, 'auth_required');

    // 3. Anti-bot 429 never retries
    const blockedDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-blocked',
      sourceName: 'RateLimited',
      sourceBaseUrl: 'https://ratelimited.example',
      mode: 'ping',
      query: 'Bleach',
    });
    assert.equal(blockedAttempts, 1);
    assert.equal(blockedDiag.status, 'fail');
    assert.equal(blockedDiag.failureKind, 'blocked_request');

    // 4. Timeout classifies failureKind === 'timeout'
    const timeoutDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-timeout',
      sourceName: 'SlowTimeout',
      sourceBaseUrl: 'https://slow-timeout.example',
      mode: 'ping',
      query: 'Bleach',
    });
    assert.equal(timeoutDiag.status, 'fail');
    assert.equal(timeoutDiag.failureKind, 'timeout');

    // 5. Malformed JSON surfaces malformed_response
    const malformedDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-malformed',
      sourceName: 'MalformedHi',
      sourceBaseUrl: 'https://malformed-hi.example',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(malformedDiag.status, 'partial');
    assert.equal(malformedDiag.failureKind, 'malformed_response');

    // 6. Concurrent identical requests are deduplicated into 1 in-flight execution (exact shared result)
    const [b1, b2] = await Promise.all([
      diagnoseAnimeExtensionServer({
        sourceId: 'ext-ay-dedupe',
        sourceName: 'Kaido-Dedupe',
        sourceBaseUrl: 'https://dedupe-hi.example',
        mode: 'basic',
        query: 'Naruto',
      }),
      diagnoseAnimeExtensionServer({
        sourceId: 'ext-ay-dedupe',
        sourceName: 'Kaido-Dedupe',
        sourceBaseUrl: 'https://dedupe-hi.example',
        mode: 'basic',
        query: 'Naruto',
      }),
    ]);
    assert.strictEqual(b1, b2);
    assert.equal(dedupeSearchCalls, 1);

    // 7. Full HiAnime fixture with explicit data-type="sub" confirms ['ja'] and verified audio
    const fullHi = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-dedupe',
      sourceName: 'Kaido-Dedupe',
      sourceBaseUrl: 'https://dedupe-hi.example',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(fullHi.status, 'pass');
    assert.deepEqual(fullHi.confirmedAudioLanguages, ['ja']);
    assert.equal(fullHi.capabilities.audioLanguage, 'verified');
    assert.equal(fullHi.probeScope, 'Episode 1 default probe');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnoseAnimeExtensionServer distinguishes upstream HTTP 403/429/503 blocks from unsupported formats and preserves verified capabilities', async () => {
  const originalFetch = globalThis.fetch;

  // Scenario A: ShizuTv Stream (Inbuilt) hits HTTP 403 on all upstream hosts
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://ww5.gogoanimes.fi') || url.startsWith('https://ww12.gogoanimes.fi')) {
      return new Response('<html><title>Just a moment...</title>Cloudflare</html>', {
        status: 403,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response('Forbidden', { status: 403 });
  }) as typeof fetch;

  try {
    const ping403 = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'ping',
      query: 'Naruto',
    });
    assert.equal(ping403.status, 'fail');
    assert.equal(ping403.failureKind, 'blocked_request');
    assert.notEqual(ping403.capabilities.metadataSearch, 'unsupported');
    assert.notEqual(ping403.capabilities.episodeOrChapterListing, 'unsupported');
    assert.notEqual(ping403.capabilities.playbackOrReader, 'unsupported');
    assert.match(ping403.detail || '', /not mean the extension format is unsupported/i);

    const basic403 = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'basic',
      query: 'Naruto',
    });
    assert.equal(basic403.status, 'fail');
    assert.equal(basic403.failureKind, 'blocked_request');
    assert.equal(basic403.capabilities.metadataSearch, 'unavailable');
    assert.equal(basic403.capabilities.episodeOrChapterListing, 'untested');
    assert.equal(basic403.capabilities.audioLanguage, 'untested');
    assert.equal(basic403.capabilities.playbackOrReader, 'untested');

    const full403 = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(full403.status, 'fail');
    assert.equal(full403.failureKind, 'blocked_request');
    assert.equal(full403.capabilities.metadataSearch, 'unavailable');
    assert.equal(full403.capabilities.episodeOrChapterListing, 'untested');
    assert.equal(full403.capabilities.audioLanguage, 'untested');
    assert.equal(full403.capabilities.playbackOrReader, 'untested');
    assert.match(full403.detail || '', /HTTP 403/i);
    assert.match(full403.detail || '', /not mean the extension format is unsupported/i);

    // Scenario B: Search & episode listing succeed, downstream episode page returns HTTP 503 -> partial & preserves search/episodes
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://partial-blocked.example/search.html?keyword=')) {
        return new Response(
          `<ul class="items"><li><p class="name"><a href="/category/naruto" title="Naruto">Naruto</a></p></li></ul>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        );
      }
      if (url === 'https://partial-blocked.example/category/naruto') {
        return new Response(`<input type="hidden" id="movie_id" value="12" />`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      if (url.startsWith('https://partial-blocked.example/ajax/load-list-episode')) {
        return new Response(
          `<ul id="episode_related"><li><a href="/naruto-episode-1"><div class="name">EP 1</div></a></li></ul>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        );
      }
      if (url === 'https://partial-blocked.example/naruto-episode-1') {
        return new Response('Service Unavailable', { status: 503 });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    const partial503 = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-partial-blocked',
      sourceName: 'PartialBlocked',
      sourceBaseUrl: 'https://partial-blocked.example',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(partial503.status, 'partial');
    assert.equal(partial503.failureKind, 'blocked_request');
    assert.equal(partial503.capabilities.metadataSearch, 'verified');
    assert.equal(partial503.capabilities.episodeOrChapterListing, 'verified');
    assert.equal(partial503.capabilities.playbackOrReader, 'unavailable');
    assert.equal(partial503.capabilities.audioLanguage, 'untested');

    // Scenario C: Genuine client-rendered JS SPA incompatibility still reports unsupported
    globalThis.fetch = (async () => {
      return new Response(
        `<html><body><div id="root"></div><script src="/bundle.js"></script></body></html>`,
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      );
    }) as typeof fetch;

    const spaDiag = await diagnoseAnimeExtensionServer({
      sourceId: 'ext-ay-spa',
      sourceName: 'ClientSpaAnime',
      sourceBaseUrl: 'https://spa-only.example',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(spaDiag.status, 'unsupported');
    assert.equal(spaDiag.capabilities.playbackOrReader, 'unsupported');

    // Scenario D: ShizuTv Stream (Inbuilt) receives HTTP 403 with SPA/Turnstile-style shell -> fail + blocked_request, never unsupported
    globalThis.fetch = (async () => {
      return new Response(
        '<html><body><div id="root"></div><script>window.__waf=1</script></body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      );
    }) as typeof fetch;

    const inbuilt403SpaShell = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(inbuilt403SpaShell.status, 'fail');
    assert.equal(inbuilt403SpaShell.failureKind, 'blocked_request');
    assert.equal(inbuilt403SpaShell.capabilities.metadataSearch, 'unavailable');
    assert.equal(inbuilt403SpaShell.capabilities.episodeOrChapterListing, 'untested');
    assert.equal(inbuilt403SpaShell.capabilities.audioLanguage, 'untested');
    assert.equal(inbuilt403SpaShell.capabilities.playbackOrReader, 'untested');

    // Scenario E: ShizuTv Stream (Inbuilt) Search succeeds, Episode listing AJAX hits HTTP 403 -> Search stays verified, Listing failed, Playback untested
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('https://ww5.gogoanimes.fi/search.html?keyword=')) {
        return new Response(
          `<ul class="items"><li><p class="name"><a href="/category/naruto" title="Naruto">Naruto</a></p></li></ul>`,
          { status: 200, headers: { 'Content-Type': 'text/html' } },
        );
      }
      if (url.endsWith('/category/naruto')) {
        return new Response(`<input type="hidden" id="movie_id" value="12" />`, {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Access denied', { status: 403 });
    }) as typeof fetch;

    const searchOkEpBlocked = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(searchOkEpBlocked.status, 'partial');
    assert.equal(searchOkEpBlocked.failureKind, 'blocked_request');
    assert.equal(searchOkEpBlocked.capabilities.metadataSearch, 'verified');
    assert.equal(searchOkEpBlocked.capabilities.episodeOrChapterListing, 'unavailable');
    assert.equal(searchOkEpBlocked.capabilities.playbackOrReader, 'untested');
    assert.equal(searchOkEpBlocked.capabilities.audioLanguage, 'untested');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ShizuTv Stream (Inbuilt) fast-fails HTTP 403 across all hosts without 9-query loops and propagates blocked_request in stream resolution', async () => {
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = (async () => {
    fetchCount += 1;
    return new Response('Forbidden', { status: 403 });
  }) as typeof fetch;

  try {
    const started = Date.now();
    const diag = await diagnoseAnimeExtensionServer({
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      mode: 'full',
      query: 'Naruto',
    });
    const elapsed = Date.now() - started;

    assert.equal(diag.status, 'fail');
    assert.equal(diag.failureKind, 'blocked_request');
    assert.equal(diag.capabilities.metadataSearch, 'unavailable');
    assert.equal(diag.capabilities.episodeOrChapterListing, 'untested');
    assert.equal(diag.capabilities.playbackOrReader, 'untested');
    // 2 Gogo hosts (1 query each, break immediately on 403) + 2 HiAnime fallback hosts (1 query each) = <= 6 fetches total
    assert.ok(fetchCount <= 8, `Expected <= 8 upstream fetches on 403 fast-fail, got ${fetchCount}`);
    assert.ok(elapsed < 3000, `Expected fast-fail well under 3s, took ${elapsed}ms`);

    await assert.rejects(
      () =>
        resolveAnimeEpisodeStream({
          mediaId: 'al-20',
          titles: { english: 'Naruto', romaji: 'Naruto' },
          episodeNumber: 1,
          category: 'sub',
          sourceId: 'shonenx-hls-inbuilt',
          bypassCache: true,
        }),
      (err: unknown) =>
        err instanceof UpstreamFetchError &&
        err.failureKind === 'blocked_request' &&
        err.status === 403,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('diagnoseMangaExtensionServer classifies bare HTTP 403/503 as fail + blocked_request instead of unsupported', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () => {
    return new Response('Forbidden', { status: 403 });
  }) as typeof fetch;

  try {
    const ping403 = await diagnoseMangaExtensionServer({
      sourceId: 'ext-my-mangaplus',
      sourceName: 'CustomManga',
      sourceBaseUrl: 'https://custom-manga.example',
      mode: 'ping',
      query: 'Naruto',
    });
    assert.equal(ping403.status, 'fail');
    assert.equal(ping403.failureKind, 'blocked_request');

    const full403 = await diagnoseMangaExtensionServer({
      sourceId: 'ext-my-mangaplus',
      sourceName: 'CustomManga',
      sourceBaseUrl: 'https://custom-manga.example',
      mode: 'full',
      query: 'Naruto',
    });
    assert.equal(full403.status, 'fail');
    assert.equal(full403.failureKind, 'blocked_request');
    assert.equal(full403.capabilities.metadataSearch, 'unavailable');
    assert.equal(full403.capabilities.episodeOrChapterListing, 'untested');
    assert.equal(full403.capabilities.playbackOrReader, 'untested');
    assert.match(full403.detail || '', /not mean the extension format is unsupported/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});






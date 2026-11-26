import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  MatchedSourceEntry,
  SourceInfo,
  UnifiedEpisode,
  UnifiedMedia,
  VideoServer,
  VideoStream,
} from '../types/media';
import {
  createExtensionAdapter,
  ExtensionAdapter,
  ExtensionCapabilityError,
  GenericWebExtensionAdapter,
  GogoCloneExtensionAdapter,
  GotakuExtensionAdapter,
  HiAnimeExtensionAdapter,
  MetadataOnlyExtensionAdapter,
  registerExtensionAdapterFactory,
  resolveEpisodesWithDiagnostics,
  resolveExtensionEpisodesAsync,
  resolveSourceCompatibility,
  resolveVideoServers,
  resolveVideoStreamAsync,
  searchExtensionTitlesAsync,
  ShizuTvInbuiltExtensionAdapter,
  unregisterExtensionAdapterFactory,
  WordPressAnimeExtensionAdapter,
} from './sourceEngine';

const sampleMedia: UnifiedMedia = {
  id: '127230',
  idMal: '44511',
  type: 'ANIME',
  format: 'TV',
  status: 'FINISHED',
  title: {
    english: 'Chainsaw Man',
    romaji: 'Chainsaw Man',
    native: 'チェンソーマン',
  },
  synonyms: ['CSM'],
  episodes: 12,
  duration: 24,
};

const sampleServer: VideoServer = {
  id: 'hd-1-sub',
  name: 'HD-1 (Sub)',
  category: 'sub',
};

const sampleEpisode: UnifiedEpisode = {
  id: '127230-ep-1',
  number: 1,
  title: 'Dog & Chainsaw',
};

class SpyCustomAdapter extends ExtensionAdapter {
  searchCalls = 0;
  episodesCalls = 0;
  streamCalls = 0;

  protected async searchImpl(query: string) {
    this.searchCalls += 1;
    return {
      compatible: true,
      sourceLabel: this.source.name,
      items: [
        {
          sourceId: this.source.id,
          title: `${query} (Custom JSON)`,
          href: '/api/anime/99',
          slug: '99',
        },
      ],
    };
  }

  protected async listEpisodesImpl() {
    this.episodesCalls += 1;
    return {
      compatible: true,
      sourceLabel: this.source.name,
      episodes: [
        {
          id: `${this.source.id}:json-1`,
          number: 1,
          title: 'JSON Ep 1',
          sourceId: this.source.id,
          sourceEpisodeId: 'json-1',
          episodeUrl: '/api/watch/json-1',
        },
      ],
    };
  }

  protected async resolveStreamImpl(): Promise<VideoStream> {
    this.streamCalls += 1;
    return {
      url: 'https://cdn.custom-json.example/stream.m3u8',
      quality: '1080p',
      isHls: true,
      serverName: 'JSON CDN',
      sourceId: this.source.id,
    };
  }
}

test('Base ExtensionAdapter enforces assertCapability before invoking search/episodes/stream handlers', async () => {
  const unverifiedAdapter = new SpyCustomAdapter(
    {
      id: 'ext-partial-spy',
      name: 'Partial Spy',
      type: 'extension',
      mediaTypes: ['ANIME'],
      lang: 'en',
      version: '1.0.0',
      baseUrl: 'https://partial-spy.example',
    },
    {
      capabilities: {
        search: { state: 'verified', verified: true },
        episodes: { state: 'unverified', verified: false, reason: 'Episode endpoint not yet verified.' },
        stream: { state: 'unsupported', verified: false, reason: 'DRM stream cannot be decrypted.' },
      },
    },
  );

  const searchRes = await unverifiedAdapter.search('Naruto');
  assert.equal(searchRes.items.length, 1);
  assert.equal(unverifiedAdapter.searchCalls, 1);

  await assert.rejects(
    () => unverifiedAdapter.listEpisodes({ media: sampleMedia }),
    (err: unknown) =>
      err instanceof ExtensionCapabilityError &&
      err.code === 'UNVERIFIED_CAPABILITY' &&
      err.capability === 'episodes',
  );
  assert.equal(unverifiedAdapter.episodesCalls, 0, 'episodesImpl must not execute before capability passes');

  await assert.rejects(
    () =>
      unverifiedAdapter.resolveStream({
        media: sampleMedia,
        episode: sampleEpisode,
        server: sampleServer,
      }),
    (err: unknown) =>
      err instanceof ExtensionCapabilityError &&
      err.code === 'UNSUPPORTED_CAPABILITY' &&
      err.capability === 'stream',
  );
  assert.equal(unverifiedAdapter.streamCalls, 0, 'resolveStreamImpl must not execute when unsupported');

  const compat = unverifiedAdapter.getCompatibility();
  assert.equal(compat.fullyCompatible, false);
  assert.equal(compat.compatibility, 'partial');
});

test('Compatibility detection never marks metadata-only or unverified sources fully compatible', async () => {
  const anilistSource: SourceInfo = {
    id: 'ext-anilist',
    name: 'AniList',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'all',
    version: '1.0.0',
    baseUrl: 'https://anilist.co',
    pkg: 'eu.kanade.tachiyomi.extension.all.anilist',
  };
  const anilistAdapter = createExtensionAdapter(anilistSource);
  assert.ok(anilistAdapter instanceof MetadataOnlyExtensionAdapter);
  const metaReport = anilistAdapter.getCompatibility();
  assert.equal(metaReport.isMetadataOnly, true);
  assert.equal(metaReport.fullyCompatible, false);
  assert.equal(metaReport.compatibility, 'unsupported');
  await assert.rejects(
    () =>
      anilistAdapter.resolveStream({
        media: sampleMedia,
        episode: sampleEpisode,
        server: sampleServer,
      }),
    (err: unknown) => err instanceof ExtensionCapabilityError && err.code === 'METADATA_ONLY_SOURCE',
  );

  const unverifiedWeb = resolveSourceCompatibility({
    id: 'ext-unverified-site',
    name: 'Unverified Site',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://unverified-site.example',
  });
  assert.equal(unverifiedWeb.fullyCompatible, false);
  assert.equal(unverifiedWeb.compatibility, 'unverified');

  const missingHost = resolveSourceCompatibility({
    id: 'ext-missing-host',
    name: 'Broken Ext',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
  });
  assert.equal(missingHost.fullyCompatible, false);
  assert.equal(missingHost.compatibility, 'unsupported');

  const inbuiltReport = resolveSourceCompatibility('shonenx-hls-inbuilt');
  assert.equal(inbuiltReport.fullyCompatible, true);
  assert.equal(inbuiltReport.compatibility, 'full');
});

test('Custom ExtensionAdapter factory override integrates cleanly with sourceEngine without touching core logic', async () => {
  const customSource: SourceInfo = {
    id: 'ext-json-custom',
    name: 'Custom JSON API',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '2.0.0',
    baseUrl: 'https://api.custom-json.example',
  };

  registerExtensionAdapterFactory({
    id: 'test-json-custom',
    matches: (source) => source.id === 'ext-json-custom',
    create: (source, profile) =>
      new SpyCustomAdapter(source, {
        adapterId: 'custom-json-api',
        providerKind: 'custom-json',
        profile,
        capabilities: {
          search: { state: 'verified', verified: true },
          episodes: { state: 'verified', verified: true },
          stream: { state: 'verified', verified: true },
        },
      }),
  });

  try {
    const adapter = createExtensionAdapter(customSource);
    assert.ok(adapter instanceof SpyCustomAdapter);
    const compat = adapter.getCompatibility();
    assert.equal(compat.fullyCompatible, true);
    assert.equal(compat.compatibility, 'full');
    assert.equal(compat.adapterId, 'custom-json-api');

    const found = await searchExtensionTitlesAsync({
      source: customSource,
      query: 'Frieren',
    });
    assert.equal(found.compatible, true);
    assert.equal(found.items[0].href, '/api/anime/99');

    const epRes = await resolveExtensionEpisodesAsync({
      sourceId: customSource.id,
      sourceName: customSource.name,
      sourceBaseUrl: customSource.baseUrl,
      selectedSourceEntry: found.items[0],
    });
    assert.equal(epRes.compatible, true);
    assert.equal(epRes.episodes[0].sourceEpisodeId, 'json-1');

    const stream = await adapter.resolveStream({
      media: sampleMedia,
      episode: epRes.episodes[0],
      server: sampleServer,
    });
    assert.equal(stream.url, 'https://cdn.custom-json.example/stream.m3u8');
  } finally {
    unregisterExtensionAdapterFactory('test-json-custom');
  }
});

test('Gotaku adapter preserves public catalog search and rejects protected episodes & playback before API calls', async () => {
  const gotakuSource: SourceInfo = {
    id: 'ext-ay-gotaku',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://gotaku.to',
  };

  const adapter = createExtensionAdapter(gotakuSource);
  assert.ok(adapter instanceof GotakuExtensionAdapter);
  const compat = adapter.getCompatibility();
  assert.equal(compat.fullyCompatible, false);
  assert.equal(compat.compatibility, 'partial');
  assert.equal(compat.capabilities.search.state, 'verified');
  assert.equal(compat.capabilities.episodes.state, 'unsupported');
  assert.equal(compat.capabilities.stream.state, 'unsupported');

  const originalFetch = globalThis.fetch;
  const calledEndpoints: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    calledEndpoints.push(url);
    if (url === '/api/extensions/search') {
      return new Response(
        JSON.stringify({
          compatible: true,
          sourceLabel: 'Gotaku',
          items: [
            {
              sourceId: 'ext-ay-gotaku',
              title: 'Chainsaw Man',
              href: '/title/lwk4qj',
              slug: 'title/lwk4qj',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Unexpected endpoint', { status: 500 });
  }) as typeof fetch;

  try {
    const searchRes = await searchExtensionTitlesAsync({
      source: gotakuSource,
      query: 'Chainsaw Man',
    });
    assert.equal(searchRes.compatible, true);
    assert.equal(searchRes.items.length, 1);
    assert.equal(searchRes.items[0].href, '/title/lwk4qj');

    calledEndpoints.length = 0;

    // Adapter methods reject pre-execution without hitting /api/extensions/episodes or /api/stream/resolve
    await assert.rejects(
      () => adapter.listEpisodes({ selectedSourceEntry: searchRes.items[0] }),
      (err: unknown) => err instanceof ExtensionCapabilityError && err.code === 'PROTECTED_SOURCE',
    );
    await assert.rejects(
      () =>
        resolveVideoStreamAsync({
          media: sampleMedia,
          episode: sampleEpisode,
          server: sampleServer,
          sourceId: gotakuSource.id,
          sourceName: gotakuSource.name,
          sourceBaseUrl: gotakuSource.baseUrl,
          selectedSourceEntry: searchRes.items[0],
        }),
      (err: unknown) => err instanceof ExtensionCapabilityError && err.code === 'PROTECTED_SOURCE',
    );
    assert.deepEqual(calledEndpoints, []);

    // Compatibility wrapper used by DetailsPage returns { compatible: false, episodes: [], reason }
    const compatEp = await resolveExtensionEpisodesAsync({
      sourceId: gotakuSource.id,
      sourceName: gotakuSource.name,
      sourceBaseUrl: gotakuSource.baseUrl,
      selectedSourceEntry: searchRes.items[0],
    });
    assert.equal(compatEp.compatible, false);
    assert.deepEqual(compatEp.episodes, []);
    assert.ok(compatEp.reason && /Turnstile|encrypted/i.test(compatEp.reason));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('ShizuTvInbuiltExtensionAdapter loads episodes and resolves stream playback cleanly', async () => {
  const adapter = createExtensionAdapter('shonenx-hls-inbuilt');
  assert.ok(adapter instanceof ShizuTvInbuiltExtensionAdapter);
  assert.equal(adapter.getCompatibility().fullyCompatible, true);
  assert.ok(resolveVideoServers('shonenx-hls-inbuilt').length >= 2);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    if (url.startsWith('https://api.ani.zip/mappings?')) {
      return new Response(
        JSON.stringify({
          episodeCount: 1,
          mappings: { mal_id: 44511 },
          episodes: {
            '1': {
              episode: '1',
              title: { en: 'Dog & Chainsaw' },
              length: 24,
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url.startsWith('https://api.jikan.moe/v4/anime/')) {
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (url === '/api/stream/resolve') {
      return new Response(
        JSON.stringify({
          url: '/api/stream/proxy?url=inbuilt-ep1',
          quality: '1080p',
          isHls: true,
          serverName: 'HD-1 (Sub)',
          sourceId: 'shonenx-hls-inbuilt',
          matchedTitle: 'Chainsaw Man',
          matchedEpisode: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const { episodes } = await resolveEpisodesWithDiagnostics(sampleMedia, {
      sourceId: 'shonenx-hls-inbuilt',
      bypassCache: true,
      recordTrace: false,
    });
    assert.ok(episodes.length >= 1);
    assert.equal(episodes[0].title, 'Dog & Chainsaw');

    const stream = await resolveVideoStreamAsync({
      media: sampleMedia,
      episode: episodes[0],
      server: sampleServer,
      sourceId: 'shonenx-hls-inbuilt',
    });
    assert.equal(stream.sourceId, 'shonenx-hls-inbuilt');
    assert.equal(stream.url, '/api/stream/proxy?url=inbuilt-ep1');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Batch 1 Wrong Title & Batch 2 episode mapping route accurately through adapters for compatible external extensions', async () => {
  const originalFetch = globalThis.fetch;
  let capturedEpisodesBody: Record<string, unknown> | null = null;
  let capturedStreamBody: Record<string, unknown> | null = null;

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;

    if (url === '/api/extensions/episodes') {
      capturedEpisodesBody = body;
      return new Response(
        JSON.stringify({
          compatible: true,
          sourceLabel: 'AnimeSite',
          episodes: [
            {
              id: 'ext-animesite:ep-13',
              number: 13,
              title: 'Cour 2 Premiere',
              sourceId: 'ext-animesite',
              sourceEpisodeId: 'ep-13',
              episodeUrl: '/watch/cour-2-ep-13',
              sourceAnimeHref: '/anime/cour-2',
              sourceAnimeSlug: 'anime/cour-2',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (url === '/api/stream/resolve') {
      capturedStreamBody = body;
      return new Response(
        JSON.stringify({
          url: '/api/stream/proxy?url=ext-ep13',
          quality: '1080p',
          isHls: true,
          serverName: 'HD-1 (Sub)',
          sourceId: 'ext-animesite',
          matchedEpisode: 13,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    const selectedEntry: MatchedSourceEntry = {
      sourceId: 'ext-animesite',
      title: 'Mapped Cour 2',
      href: '/anime/cour-2',
      slug: 'anime/cour-2',
    };

    const { episodes } = await resolveEpisodesWithDiagnostics(sampleMedia, {
      sourceId: 'ext-animesite',
      sourceName: 'AnimeSite',
      sourceBaseUrl: 'https://animesite.example',
      selectedSourceEntry: selectedEntry,
      recordTrace: false,
    });

    assert.equal(episodes.length, 1);
    assert.equal(episodes[0].number, 13);
    assert.deepEqual(capturedEpisodesBody?.selectedSourceEntry, {
      sourceId: 'ext-animesite',
      title: 'Mapped Cour 2',
      href: '/anime/cour-2',
      slug: 'anime/cour-2',
    });

    const stream = await resolveVideoStreamAsync({
      media: sampleMedia,
      episode: episodes[0],
      server: sampleServer,
      sourceId: 'ext-animesite',
      sourceName: 'AnimeSite',
      sourceBaseUrl: 'https://animesite.example',
      selectedSourceEntry: selectedEntry,
    });

    assert.equal(stream.matchedEpisode, 13);
    assert.equal(
      (capturedStreamBody?.selectedEpisode as Record<string, unknown>)?.episodeUrl,
      '/watch/cour-2-ep-13',
    );
    assert.equal(
      (capturedStreamBody?.selectedSourceEntry as Record<string, unknown>)?.href,
      '/anime/cour-2',
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Batch 2 migrated client adapters route HiAnime, GogoClone, and WordPress AnimeStream sources without false compatibility claims', async () => {
  // 1. HiAnime bridge vs installed Kaido clone
  const bridgeAdapter = createExtensionAdapter('hianime-bridge');
  assert.ok(bridgeAdapter instanceof HiAnimeExtensionAdapter);
  assert.equal(bridgeAdapter.adapterId, 'hianime-bridge');
  assert.equal(bridgeAdapter.getCompatibility().compatibility, 'unverified');

  const kaidoSource: SourceInfo = {
    id: 'ext-ay-kaido',
    name: 'Kaido',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://kaido.to',
  };
  const kaidoAdapter = createExtensionAdapter(kaidoSource);
  assert.ok(kaidoAdapter instanceof HiAnimeExtensionAdapter);
  assert.equal(kaidoAdapter.adapterId, 'hianime-ajax');
  assert.equal(kaidoAdapter.getCompatibility().compatibility, 'unverified');
  assert.equal(kaidoAdapter.getCompatibility().fullyCompatible, false);

  // 2. GogoAnime clone
  const gogoSource: SourceInfo = {
    id: 'ext-ay-gogo3',
    name: 'GogoAnime3',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://gogoanime3.co',
  };
  const gogoAdapter = createExtensionAdapter(gogoSource);
  assert.ok(gogoAdapter instanceof GogoCloneExtensionAdapter);
  assert.equal(gogoAdapter.adapterId, 'gogo-html');
  assert.equal(gogoAdapter.getCompatibility().compatibility, 'unverified');

  // 3. WordPress AnimeStream / DooPlay
  const wpSource: SourceInfo = {
    id: 'ext-ay-animexin',
    name: 'AnimeXin',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://animexin.dev',
  };
  const wpAdapter = createExtensionAdapter(wpSource);
  assert.ok(wpAdapter instanceof WordPressAnimeExtensionAdapter);
  assert.equal(wpAdapter.adapterId, 'wordpress-animestream');
  assert.equal(wpAdapter.getCompatibility().compatibility, 'unverified');
  assert.ok(wpAdapter.getVideoServers().some((s) => /AnimeXin · Mirror 1/i.test(s.name)));

  // 4. Unverified extension with custom API (AnimePahe) stays GenericWebExtensionAdapter
  const paheAdapter = createExtensionAdapter({
    id: 'ext-ay-animepahe',
    name: 'AnimePahe',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://animepahe.ru',
  });
  assert.ok(paheAdapter instanceof GenericWebExtensionAdapter);
  assert.equal(paheAdapter.getCompatibility().compatibility, 'unverified');

  // 5. Independent search -> episodes -> stream roundtrip for WordPressAnimeExtensionAdapter & GogoCloneExtensionAdapter
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    if (url === '/api/extensions/search') {
      return new Response(
        JSON.stringify({
          compatible: true,
          sourceLabel: body.sourceName,
          items: [
            {
              sourceId: body.sourceId,
              title: 'Sample Entry',
              href: '/anime/sample-entry/',
              slug: 'anime/sample-entry',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === '/api/extensions/episodes') {
      return new Response(
        JSON.stringify({
          compatible: true,
          sourceLabel: body.sourceName,
          episodes: [
            {
              id: `${String(body.sourceId)}:1`,
              number: 1,
              title: 'Episode 1',
              sourceId: body.sourceId,
              sourceEpisodeId: '1',
              episodeUrl: '/watch/sample-ep-1/',
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    if (url === '/api/stream/resolve') {
      return new Response(
        JSON.stringify({
          url: '/api/stream/proxy?url=migrated-ep1',
          quality: '1080p',
          isHls: true,
          serverName: 'Mirror 1',
          sourceId: body.sourceId,
          matchedEpisode: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response('Not Found', { status: 404 });
  }) as typeof fetch;

  try {
    for (const adapter of [gogoAdapter, wpAdapter]) {
      const searched = await adapter.search('Sample');
      assert.equal(searched.compatible, true);
      assert.equal(searched.items[0].sourceId, adapter.source.id);

      const epRes = await adapter.listEpisodes({ selectedSourceEntry: searched.items[0] });
      assert.equal(epRes.compatible, true);
      assert.equal(epRes.episodes[0].sourceEpisodeId, '1');

      const stream = await adapter.resolveStream({
        media: sampleMedia,
        episode: epRes.episodes[0],
        server: adapter.getVideoServers()[0],
        selectedSourceEntry: searched.items[0],
      });
      assert.equal(stream.sourceId, adapter.source.id);
      assert.equal(stream.url, '/api/stream/proxy?url=migrated-ep1');
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Capacitor Android native calls route /api endpoints to runtime backend URL, rewrite proxy URLs, and surface clear errors', async () => {
  const { BACKEND_URL_STORAGE_KEY, BackendNotConfiguredError, NonJsonResponseError } =
    await import('../utils/backendConfig.ts');
  const { diagnoseExtensionAsync, resolveMangaChapterPagesAsync } = await import('./sourceEngine.ts');

  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalCapacitor = (globalThis as { Capacitor?: unknown }).Capacitor;
  const originalFetch = globalThis.fetch;
  const storageMap = new Map<string, string>();
  const requestedUrls: string[] = [];

  (globalThis as { window?: unknown }).window = {
    location: { origin: 'https://localhost', protocol: 'https:', host: 'localhost' },
    localStorage: {
      getItem: (k: string) => storageMap.get(k) ?? null,
      setItem: (k: string, v: string) => void storageMap.set(k, v),
      removeItem: (k: string) => void storageMap.delete(k),
    },
    dispatchEvent: () => true,
  };
  (globalThis as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {},
  };

  try {
    // 1. Without backend configured on native Android -> explicit BackendNotConfiguredError before fetch
    await assert.rejects(
      () =>
        resolveVideoStreamAsync({
          media: sampleMedia,
          episode: sampleEpisode,
          server: sampleServer,
          sourceId: 'shonenx-hls-inbuilt',
        }),
      BackendNotConfiguredError,
    );

    // 2. With runtime backend configured -> routes to configured origin & rewrites proxy URLs
    storageMap.set(BACKEND_URL_STORAGE_KEY, 'https://api.android-test.example');

    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      requestedUrls.push(url);

      if (url === 'https://api.android-test.example/api/stream/resolve') {
        return new Response(
          JSON.stringify({
            url: '/api/stream/proxy?url=abc',
            quality: '1080p',
            isHls: true,
            serverName: 'HD-1 (Sub)',
            sourceId: 'shonenx-hls-inbuilt',
            mirrors: [
              { name: 'Backup', url: '/api/stream/proxy?url=def', quality: '720p', isHls: true },
            ],
            subtitles: [{ url: '/api/stream/proxy?url=sub', lang: 'en', label: 'English' }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://api.android-test.example/api/manga/pages') {
        return new Response(
          JSON.stringify({
            pages: ['/api/stream/proxy?url=p1', 'https://cdn.manga.example/p2.jpg'],
            sourceLabel: 'MangaDex',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      if (url === 'https://api.android-test.example/api/extensions/diagnose') {
        return new Response('<!doctype html><html><body>Fallback HTML</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        });
      }
      return new Response('Not Found', { status: 404 });
    }) as typeof fetch;

    const stream = await resolveVideoStreamAsync({
      media: sampleMedia,
      episode: sampleEpisode,
      server: sampleServer,
      sourceId: 'shonenx-hls-inbuilt',
    });
    assert.equal(stream.url, 'https://api.android-test.example/api/stream/proxy?url=abc');
    assert.equal(stream.mirrors?.[0].url, 'https://api.android-test.example/api/stream/proxy?url=def');
    assert.equal(stream.subtitles?.[0].url, 'https://api.android-test.example/api/stream/proxy?url=sub');

    const mangaPages = await resolveMangaChapterPagesAsync({
      media: { ...sampleMedia, type: 'MANGA' },
      chapter: { id: 'ch-1', number: 1, title: 'Chapter 1' },
      sourceId: 'mangadex',
    });
    assert.deepEqual(mangaPages.pages, [
      'https://api.android-test.example/api/stream/proxy?url=p1',
      'https://cdn.manga.example/p2.jpg',
    ]);

    // 3. HTML HTTP 200 response produces NonJsonResponseError instead of opaque "Diagnostics failed (HTTP 200)."
    await assert.rejects(
      () =>
        diagnoseExtensionAsync({
          source: {
            id: 'shonenx-hls-inbuilt',
            name: 'ShizuTv Stream (Inbuilt)',
            type: 'inbuilt',
            mediaTypes: ['ANIME'],
            lang: 'en',
            version: '2.1.5',
          },
          mediaType: 'ANIME',
          mode: 'full',
          query: 'Naruto',
        }),
      (err: unknown) =>
        err instanceof NonJsonResponseError && /Received HTML instead of JSON/i.test(err.message),
    );

    assert.deepEqual(requestedUrls, [
      'https://api.android-test.example/api/stream/resolve',
      'https://api.android-test.example/api/manga/pages',
      'https://api.android-test.example/api/extensions/diagnose',
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalCapacitor === undefined) {
      delete (globalThis as { Capacitor?: unknown }).Capacitor;
    } else {
      (globalThis as { Capacitor?: unknown }).Capacitor = originalCapacitor;
    }
  }
});


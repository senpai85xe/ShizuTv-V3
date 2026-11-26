import test from 'node:test';
import assert from 'node:assert/strict';
import { isSafeExternalHttpUrl, parseExtensionRepoManifest } from './extensionRepoParser';

test('isSafeExternalHttpUrl rejects loopback, private LAN, and non-HTTP URLs', () => {
  assert.equal(
    isSafeExternalHttpUrl('https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json'),
    true,
  );
  assert.equal(isSafeExternalHttpUrl('http://localhost:3000/test.json'), false);
  assert.equal(isSafeExternalHttpUrl('http://127.0.0.1:8080/index.json'), false);
  assert.equal(isSafeExternalHttpUrl('http://169.254.169.254/latest/meta-data'), false);
  assert.equal(isSafeExternalHttpUrl('http://192.168.1.1/index.json'), false);
  assert.equal(isSafeExternalHttpUrl('file:///etc/passwd'), false);
});

test('parseExtensionRepoManifest parses Aniyomi index.min.json sub-sources accurately', () => {
  const result = parseExtensionRepoManifest(
    [
      {
        name: 'Aniyomi: HiAnime',
        pkg: 'eu.kanade.tachiyomi.animeextension.en.zoro',
        apk: 'aniyomi-en.zoro-v14.2.apk',
        lang: 'en',
        version: '14.2',
        nsfw: 0,
        sources: [
          {
            name: 'HiAnime',
            lang: 'en',
            id: '6706411382606718900',
            baseUrl: 'https://hianime.to',
          },
        ],
      },
    ],
    {
      repoUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
      manager: 'aniyomi',
    },
  );

  assert.equal(result.format, 'aniyomi');
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].name, 'HiAnime');
  assert.deepEqual(result.sources[0].mediaTypes, ['ANIME']);
  assert.equal(result.sources[0].baseUrl, 'https://hianime.to');
  assert.equal(result.sources[0].version, '14.2');
  assert.equal(result.sources[0].isNsfw, false);
});

test('parseExtensionRepoManifest parses Mangayomi index.json and CloudStream pluginLists', () => {
  const mangayomi = parseExtensionRepoManifest(
    [
      {
        name: 'AnimePahe',
        id: 123456,
        baseUrl: 'https://animepahe.ru',
        lang: 'en',
        typeSource: 'single',
        itemType: 1,
        version: '0.1.5',
        isNsfw: false,
      },
      {
        name: 'MangaDex',
        id: 7890,
        baseUrl: 'https://mangadex.org',
        lang: 'multi',
        typeSource: 'single',
        itemType: 0,
        version: '0.2.1',
        isNsfw: false,
      },
    ],
    {
      repoUrl: 'https://raw.githubusercontent.com/kodjodevf/mangayomi-extensions/main/index.json',
      manager: 'mangayomi',
    },
  );

  assert.equal(mangayomi.format, 'mangayomi');
  assert.equal(mangayomi.sources.length, 2);
  assert.deepEqual(mangayomi.sources[0].mediaTypes, ['ANIME']);
  assert.deepEqual(mangayomi.sources[1].mediaTypes, ['MANGA']);

  const cloudstreamWrapper = parseExtensionRepoManifest(
    {
      name: 'CloudStream Repo',
      pluginLists: ['https://example.com/plugins.json', 'http://127.0.0.1/evil.json'],
    },
    {
      repoUrl: 'https://example.com/repo.json',
      manager: 'cloudstream',
    },
  );

  assert.equal(cloudstreamWrapper.format, 'cloudstream');
  assert.equal(cloudstreamWrapper.repoName, 'CloudStream Repo');
  assert.deepEqual(cloudstreamWrapper.pluginListUrls, ['https://example.com/plugins.json']);
});

test('Phase 1: parseExtensionRepoManifest preserves complete Aniyomi metadata without fabricating runtime executability', () => {
  const result = parseExtensionRepoManifest(
    [
      {
        name: 'Aniyomi: HiAnime',
        pkg: 'eu.kanade.tachiyomi.animeextension.en.zoro',
        apk: 'aniyomi-en.zoro-v14.2.apk',
        lang: 'en',
        code: 42,
        version: '14.2',
        nsfw: 0,
        sources: [
          {
            name: 'HiAnime',
            lang: 'en',
            id: '6706411382606718900',
            baseUrl: 'https://hianime.to',
          },
        ],
      },
      {
        name: 'Tachiyomi: Legacy Reader',
        pkg: 'eu.kanade.tachiyomi.extension.all.legacyreader',
        apk: 'tachiyomi-all.legacyreader-v1.4.25.apk',
        lang: 'all',
        code: '19',
        version: '1.4.25',
        libVersion: '1.4',
        icon: 'https://cdn.example/custom-legacy.png',
        nsfw: 1,
      },
    ],
    {
      repoUrl: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json',
      manager: 'aniyomi',
    },
  );

  assert.equal(result.repoBaseUrl, 'https://raw.githubusercontent.com/yuzono/anime-repo/repo');
  assert.equal(result.sources.length, 2);

  const hianime = result.sources[0];
  assert.equal(hianime.pkg, 'eu.kanade.tachiyomi.animeextension.en.zoro');
  assert.equal(hianime.apkName, 'aniyomi-en.zoro-v14.2.apk');
  assert.equal(
    hianime.apkUrl,
    'https://raw.githubusercontent.com/yuzono/anime-repo/repo/apk/aniyomi-en.zoro-v14.2.apk',
  );
  assert.equal(hianime.version, '14.2');
  assert.equal(hianime.versionCode, 42);
  assert.equal(hianime.libVersion, '14');
  assert.equal(hianime.repoBaseUrl, 'https://raw.githubusercontent.com/yuzono/anime-repo/repo');
  assert.equal(
    hianime.iconUrl,
    'https://raw.githubusercontent.com/yuzono/anime-repo/repo/icon/eu.kanade.tachiyomi.animeextension.en.zoro.png',
  );
  assert.equal(hianime.lang, 'en');
  assert.deepEqual(hianime.mediaTypes, ['ANIME']);
  assert.equal(hianime.runtimeRequirement, 'android-native');
  assert.equal(hianime.metadataOnlyStorage, true);

  const legacy = result.sources[1];
  assert.equal(legacy.pkg, 'eu.kanade.tachiyomi.extension.all.legacyreader');
  assert.equal(legacy.apkName, 'tachiyomi-all.legacyreader-v1.4.25.apk');
  assert.equal(legacy.versionCode, 19);
  assert.equal(legacy.libVersion, '1.4');
  assert.equal(legacy.iconUrl, 'https://cdn.example/custom-legacy.png');
  assert.equal(legacy.isNsfw, true);
  assert.deepEqual(legacy.mediaTypes, ['MANGA']);
  assert.equal(legacy.runtimeRequirement, 'android-native');
  assert.equal(legacy.metadataOnlyStorage, true);
});


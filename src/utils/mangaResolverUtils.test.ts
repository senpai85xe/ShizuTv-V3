import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMangaDexAtHomePages,
  buildMangaTitleQueryList,
  MANGADEX_API_BASE,
  mapMangaDexChapterFeed,
  parseMangaChapterListHtml,
  parseMangaPagesHtml,
  parseMangaSearchHtml,
  pickBestMangaDexMatch,
  resolveMangaHostPlan,
} from './mangaResolverUtils';

test('resolveMangaHostPlan maps inbuilt and mangadex bridge to mangadex and isolates custom extensions', () => {
  const inbuilt = resolveMangaHostPlan({
    sourceId: 'shonenx-manga-inbuilt',
    sourceName: 'ShizuTv Reader (Inbuilt)',
  });
  assert.equal(inbuilt.mode, 'mangadex');
  assert.equal(inbuilt.baseUrl, MANGADEX_API_BASE);

  const custom = resolveMangaHostPlan({
    sourceId: 'ext-my-asura',
    sourceName: 'Asura Scans',
    sourceBaseUrl: 'https://asuracomic.net/',
  });
  assert.equal(custom.mode, 'custom-extension');
  assert.equal(custom.baseUrl, 'https://asuracomic.net');

  const broken = resolveMangaHostPlan({
    sourceId: 'ext-my-missing',
    sourceName: 'Missing Host',
    sourceBaseUrl: '',
  });
  assert.equal(broken.mode, 'missing-host');
});

test('pickBestMangaDexMatch, mapMangaDexChapterFeed, and buildMangaDexAtHomePages work cleanly', () => {
  const best = pickBestMangaDexMatch(
    [
      {
        id: 'wrong-1',
        attributes: { title: { en: 'Solo Farming in the Tower' } },
      },
      {
        id: 'sl-id-123',
        attributes: {
          title: { en: 'Solo Leveling' },
          altTitles: [{ ko: 'Na Honja만 Level Up' }],
        },
      },
    ],
    ['Solo Leveling'],
  );
  assert.ok(best);
  assert.equal(best.id, 'sl-id-123');

  const mapped = mapMangaDexChapterFeed([
    {
      id: 'ext-only',
      attributes: {
        chapter: '2',
        title: 'External Stub',
        pages: 0,
        externalUrl: 'https://licensed.example/ch/2',
      },
    },
    {
      id: 'ch-1',
      attributes: {
        chapter: '1',
        title: 'The Weakest Hunter',
        translatedLanguage: 'en',
        pages: 18,
        readableAt: '2025-01-10T00:00:00+00:00',
      },
      relationships: [
        { type: 'scanlation_group', attributes: { name: 'Flame Scans' } },
      ],
    },
  ]);
  assert.equal(mapped.length, 1);
  assert.equal(mapped[0].sourceChapterId, 'ch-1');
  assert.equal(mapped[0].scanlator, 'Flame Scans');
  assert.equal(mapped[0].pageCount, 18);

  const pages = buildMangaDexAtHomePages({
    baseUrl: 'https://uploads.mangadex.org',
    chapter: { hash: 'abc123', data: ['1-abc.jpg', '2-def.png'] },
  });
  assert.equal(pages.length, 2);
  assert.ok(pages[0].startsWith('/api/stream/proxy?'));
  assert.ok(decodeURIComponent(pages[0]).includes('https://uploads.mangadex.org/data/abc123/1-abc.jpg'));
});

test('parseMangaSearchHtml, parseMangaChapterListHtml, and parseMangaPagesHtml extract Madara and ts_reader pages', () => {
  const queries = buildMangaTitleQueryList({ english: 'Na Honja Sword Master' });
  assert.ok(queries.includes('Na Honja Sword Master'));

  const searchHtml = `
    <div class="post-title">
      <h3><a href="https://scans.example/manga/na-honja-sword-master/">Na Honja Sword Master</a></h3>
    </div>
  `;
  const searchResults = parseMangaSearchHtml(searchHtml, 'https://scans.example');
  assert.equal(searchResults.length, 1);
  assert.equal(searchResults[0].href, '/manga/na-honja-sword-master/');

  const chaptersHtml = `
    <ul>
      <li class="wp-manga-chapter"><a href="/manga/na-honja-sword-master/chapter-2/">Chapter 2 - Awakening</a></li>
      <li class="wp-manga-chapter"><a href="/manga/na-honja-sword-master/chapter-1/">Chapter 1 - Start</a></li>
    </ul>
  `;
  const chapters = parseMangaChapterListHtml(chaptersHtml, 'https://scans.example/manga/na-honja-sword-master/');
  assert.equal(chapters.length, 2);
  assert.equal(chapters[0].number, 1);
  assert.equal(chapters[1].number, 2);

  const tsReaderHtml = `
    <script>
      ts_reader.run({"sources":[{"source":"Default","images":["https://cdn.scans.example/ch1/01.webp","https://cdn.scans.example/ch1/02.webp"]}]});
    </script>
  `;
  const pages = parseMangaPagesHtml(tsReaderHtml, 'https://scans.example/manga/na-honja/chapter-1/');
  assert.equal(pages.length, 2);
  assert.ok(decodeURIComponent(pages[0]).includes('https://cdn.scans.example/ch1/01.webp'));

  const madaraChapterHtml = `
    <div class="reading-content">
      <img class="wp-manga-chapter-img" data-src="https://cdn.scans.example/madara/p1.jpg" src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7" />
      <img class="wp-manga-chapter-img" data-lazy-src="https://cdn.scans.example/madara/p2.jpg" />
    </div>
  `;
  const madaraPages = parseMangaPagesHtml(
    madaraChapterHtml,
    'https://scans.example/manga/na-honja/chapter-1/',
  );
  assert.equal(madaraPages.length, 2);
  assert.ok(decodeURIComponent(madaraPages[1]).includes('https://cdn.scans.example/madara/p2.jpg'));
});

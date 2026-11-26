import test from 'node:test';
import assert from 'node:assert/strict';
import type { SourceInfo } from '../types/media';
import {
  resolveSourceHeartbeatPlan,
  selectActiveHealthCheckSources,
  summarizeSourceHealthCounts,
  validateHeartbeatResponseFormat,
  type SourceHealthCheckResult,
} from './sourceHealthCheck';

const SAMPLE_SOURCES: SourceInfo[] = [
  {
    id: 'shonenx-hls-inbuilt',
    name: 'ShizuTv Stream (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['ANIME', 'MOVIE', 'TV'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'shonenx-manga-inbuilt',
    name: 'ShizuTv Reader (Inbuilt)',
    type: 'inbuilt',
    mediaTypes: ['MANGA'],
    lang: 'en',
    version: '2.1.5',
  },
  {
    id: 'gotaku-ext',
    name: 'Gotaku',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://gotaku.to',
  },
  {
    id: 'anilist-meta',
    name: 'AniList Tracker',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://anilist.co',
  },
  {
    id: 'disabled-ext',
    name: 'Disabled Source',
    type: 'extension',
    mediaTypes: ['ANIME'],
    lang: 'en',
    version: '1.0.0',
    baseUrl: 'https://example.org',
  },
];

test('selectActiveHealthCheckSources keeps only active non-metadata sources and respects mediaTab', () => {
  const activeIds = ['shonenx-hls-inbuilt', 'shonenx-manga-inbuilt', 'gotaku-ext', 'anilist-meta'];

  const allActive = selectActiveHealthCheckSources(SAMPLE_SOURCES, activeIds);
  assert.deepEqual(
    allActive.map((s) => s.id),
    ['shonenx-hls-inbuilt', 'shonenx-manga-inbuilt', 'gotaku-ext'],
  );

  const animeActive = selectActiveHealthCheckSources(SAMPLE_SOURCES, activeIds, 'ANIME');
  assert.deepEqual(
    animeActive.map((s) => s.id),
    ['shonenx-hls-inbuilt', 'gotaku-ext'],
  );

  const mangaActive = selectActiveHealthCheckSources(SAMPLE_SOURCES, activeIds, 'MANGA');
  assert.deepEqual(
    mangaActive.map((s) => s.id),
    ['shonenx-manga-inbuilt'],
  );
});

test('resolveSourceHeartbeatPlan builds accurate targets per adapter type', () => {
  const inbuiltPlan = resolveSourceHeartbeatPlan(SAMPLE_SOURCES[0], 'ANIME');
  assert.equal(inbuiltPlan.supported, true);
  assert.equal(inbuiltPlan.adapterKind, 'inbuilt-anime');
  assert.equal(inbuiltPlan.targets[0]?.expectedFormat, 'html_document');

  const mangaPlan = resolveSourceHeartbeatPlan(SAMPLE_SOURCES[1], 'MANGA');
  assert.equal(mangaPlan.supported, true);
  assert.equal(mangaPlan.adapterKind, 'mangadex');
  assert.equal(mangaPlan.targets[0]?.expectedFormat, 'mangadex_json');
  assert.match(mangaPlan.targets[0]?.url || '', /api\.mangadex\.org\/manga/);

  const gotakuPlan = resolveSourceHeartbeatPlan(SAMPLE_SOURCES[2], 'ANIME');
  assert.equal(gotakuPlan.supported, true);
  assert.equal(gotakuPlan.adapterKind, 'gotaku');
  assert.equal(gotakuPlan.targets[0]?.expectedFormat, 'json_catalog');
  assert.match(gotakuPlan.targets[0]?.url || '', /\/api\/v1\/titles/);

  const metaPlan = resolveSourceHeartbeatPlan(SAMPLE_SOURCES[3], 'ANIME');
  assert.equal(metaPlan.supported, false);
  assert.equal(metaPlan.adapterKind, 'metadata-only');
  assert.equal(metaPlan.targets.length, 0);

  const missingHostPlan = resolveSourceHeartbeatPlan({
    id: 'no-host',
    name: 'No Host Ext',
    type: 'extension',
    mediaTypes: ['ANIME'],
  });
  assert.equal(missingHostPlan.supported, false);
  assert.equal(missingHostPlan.adapterKind, 'missing-host');
});

test('validateHeartbeatResponseFormat detects valid HTML and rejects JSON/SPA/plain/challenge for HTML adapters', () => {
  const validHtml = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'HiAnime',
    expectedFormat: 'html_document',
    status: 200,
    contentType: 'text/html; charset=utf-8',
    body: '<!doctype html><html><body><div class="list"><a href="/watch/naruto">Naruto</a></div></body></html>',
    targetUrl: 'https://hianime.to/',
    latencyMs: 120,
  });
  assert.equal(validHtml.status, 'healthy');

  const jsonInsteadOfHtml = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'HiAnime',
    expectedFormat: 'html_document',
    status: 200,
    contentType: 'application/json',
    body: '{"error":"bad endpoint"}',
    targetUrl: 'https://hianime.to/',
  });
  assert.equal(jsonInsteadOfHtml.status, 'invalid_format');
  assert.match(jsonInsteadOfHtml.summary, /Expected HTML, received JSON/i);

  const spaShell = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'SPA Ext',
    expectedFormat: 'html_document',
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body><div id="root"></div><script src="/app.js"></script></body></html>',
    targetUrl: 'https://spa.example/',
  });
  assert.equal(spaShell.status, 'invalid_format');
  assert.match(spaShell.receivedFormat || '', /SPA shell/i);

  const challengeHtml = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'Blocked Ext',
    expectedFormat: 'html_document',
    status: 403,
    contentType: 'text/html',
    body: '<html><head><title>Just a moment...</title></head><body>Enable JavaScript</body></html>',
    targetUrl: 'https://blocked.example/',
  });
  assert.equal(challengeHtml.status, 'invalid_format');
  assert.match(challengeHtml.receivedFormat || '', /Challenge/i);

  const plainText = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'Plain Ext',
    expectedFormat: 'html_document',
    status: 200,
    contentType: 'text/plain',
    body: 'service ok',
    targetUrl: 'https://plain.example/',
  });
  assert.equal(plainText.status, 'invalid_format');

  const emptyBody = validateHeartbeatResponseFormat({
    sourceId: 'src-1',
    sourceName: 'Empty Ext',
    expectedFormat: 'html_document',
    status: 200,
    contentType: 'text/html',
    body: '   ',
    targetUrl: 'https://empty.example/',
  });
  assert.equal(emptyBody.status, 'invalid_format');
});

test('validateHeartbeatResponseFormat validates JSON catalog and MangaDex schemas strictly', () => {
  const validGotaku = validateHeartbeatResponseFormat({
    sourceId: 'gotaku',
    sourceName: 'Gotaku',
    expectedFormat: 'json_catalog',
    status: 200,
    contentType: 'application/json',
    body: '{"data":[{"id":"abc","name":"Naruto"}]}',
  });
  assert.equal(validGotaku.status, 'healthy');

  const htmlErrorForJson = validateHeartbeatResponseFormat({
    sourceId: 'gotaku',
    sourceName: 'Gotaku',
    expectedFormat: 'json_catalog',
    status: 200,
    contentType: 'text/html',
    body: '<!doctype html><html><body>Maintenance</body></html>',
  });
  assert.equal(htmlErrorForJson.status, 'invalid_format');
  assert.match(htmlErrorForJson.summary, /Expected JSON, received HTML/i);

  const malformedJson = validateHeartbeatResponseFormat({
    sourceId: 'gotaku',
    sourceName: 'Gotaku',
    expectedFormat: 'json_catalog',
    status: 200,
    contentType: 'application/json',
    body: '{"data": [broken',
  });
  assert.equal(malformedJson.status, 'invalid_format');
  assert.match(malformedJson.summary, /Malformed JSON/i);

  const wrongSchemaJson = validateHeartbeatResponseFormat({
    sourceId: 'mangadex-bridge',
    sourceName: 'MangaDex',
    expectedFormat: 'mangadex_json',
    status: 200,
    contentType: 'application/json',
    body: '{"message":"unexpected payload"}',
  });
  assert.equal(wrongSchemaJson.status, 'invalid_format');

  const validMangaDex = validateHeartbeatResponseFormat({
    sourceId: 'mangadex-bridge',
    sourceName: 'MangaDex',
    expectedFormat: 'mangadex_json',
    status: 200,
    contentType: 'application/json',
    body: '{"result":"ok","response":"collection","data":[]}',
  });
  assert.equal(validMangaDex.status, 'healthy');
});

test('summarizeSourceHealthCounts aggregates active playable extension health states', () => {
  const activeIds = ['shonenx-hls-inbuilt', 'shonenx-manga-inbuilt', 'gotaku-ext'];
  const results: Record<string, SourceHealthCheckResult> = {
    'shonenx-hls-inbuilt': {
      sourceId: 'shonenx-hls-inbuilt',
      sourceName: 'ShizuTv Stream (Inbuilt)',
      status: 'healthy',
      expectedFormat: 'html_document',
      checkedAt: '2026-11-22T00:00:00Z',
      summary: 'OK',
    },
    'gotaku-ext': {
      sourceId: 'gotaku-ext',
      sourceName: 'Gotaku',
      status: 'invalid_format',
      expectedFormat: 'json_catalog',
      checkedAt: '2026-11-22T00:00:00Z',
      summary: 'Expected JSON, received HTML',
    },
  };
  const counts = summarizeSourceHealthCounts(SAMPLE_SOURCES, activeIds, results, {
    'shonenx-manga-inbuilt': true,
  });
  assert.equal(counts.activeTotal, 3);
  assert.equal(counts.healthy, 1);
  assert.equal(counts.invalidFormat, 1);
  assert.equal(counts.checking, 1);
  assert.equal(counts.unreachable, 0);
  assert.equal(counts.untested, 0);
});

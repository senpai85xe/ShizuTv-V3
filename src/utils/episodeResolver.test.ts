import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isGenericEpisodeTitle,
  mergeRealEpisodes,
  parseAniListStreamingEpisodes,
  parseAniZipEpisodes,
} from './episodeResolver';

test('parseAniZipEpisodes uses numeric map keys for multi-season anime like Naruto and drops future blank TBA slots', () => {
  const nowMs = Date.parse('2026-11-17T00:00:00Z');
  const parsed = parseAniZipEpisodes(
    {
      episodeCount: 221,
      episodes: {
        '1': {
          episodeNumber: 1,
          absoluteEpisodeNumber: 1,
          title: { en: 'Enter: Naruto Uzumaki!' },
          airDate: '2002-10-03',
          runtime: 23,
          overview: 'Naruto gets into trouble.\nSource: crunchyroll',
          image: 'https://artworks.thetvdb.com/ep1.jpg',
        },
        '220': {
          seasonNumber: 5,
          episodeNumber: 41,
          absoluteEpisodeNumber: 220,
          title: { en: 'Going on a Journey', 'x-jat': 'Tabidachi' },
          airDate: '2007-02-08',
          runtime: 25,
          image: 'https://artworks.thetvdb.com/ep220.jpg',
        },
        '221': {
          episode: '221',
          title: { en: null },
          airdate: '',
        },
      } as Record<string, unknown>,
    },
    {
      id: '20',
      episodes: 220,
      nextEpisode: null,
      duration: 23,
      status: 'FINISHED',
    },
    nowMs,
  );

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].number, 1);
  assert.equal(parsed[0].title, 'Enter: Naruto Uzumaki!');
  assert.equal(parsed[0].description, 'Naruto gets into trouble.');
  assert.equal(parsed[0].thumbnail, 'https://artworks.thetvdb.com/ep1.jpg');
  assert.equal(parsed[1].number, 220);
  assert.equal(parsed[1].title, 'Going on a Journey');
  assert.equal(parsed[1].durationSeconds, 25 * 60);
});

test('parseAniListStreamingEpisodes extracts episode number, subtitle, and thumbnail', () => {
  const eps = parseAniListStreamingEpisodes(
    [
      {
        title: "Episode 1 - The Journey's End",
        thumbnail: 'https://img1.ak.crunchyroll.com/ep1.jpg',
        url: 'https://www.crunchyroll.com/watch/1',
        site: 'Crunchyroll',
      },
      {
        title: 'Episode 2 - It Didn’t Have to Be Magic...',
        thumbnail: 'https://img1.ak.crunchyroll.com/ep2.jpg',
        url: 'https://www.crunchyroll.com/watch/2',
        site: 'Crunchyroll',
      },
    ],
    '154587',
  );

  assert.equal(eps.length, 2);
  assert.equal(eps[0].number, 1);
  assert.equal(eps[0].title, "The Journey's End");
  assert.equal(eps[0].thumbnail, 'https://img1.ak.crunchyroll.com/ep1.jpg');
  assert.equal(eps[1].number, 2);
});

test('mergeRealEpisodes upgrades generic titles, keeps Jikan filler flags, and avoids 12-ep fallback when real episodes exist', () => {
  assert.equal(isGenericEpisodeTitle('Episode 4', 4), true);
  assert.equal(isGenericEpisodeTitle('The Land of the Dead', 4), false);

  const merged = mergeRealEpisodes({
    mediaId: '154587',
    expectedCount: 2,
    aniZipEpisodes: [
      {
        id: '154587-ep-1',
        number: 1,
        title: "The Journey's End",
        thumbnail: 'https://img.example/ep1.jpg',
        airDate: '2023-09-29',
        durationSeconds: 1560,
      },
      {
        id: '154587-ep-2',
        number: 2,
        title: 'Episode 2',
        thumbnail: null,
      },
    ],
    aniListStreamingEpisodes: [
      {
        id: '154587-ep-2',
        number: 2,
        title: "It Didn't Have to Be Magic...",
        thumbnail: 'https://img.example/ep2.jpg',
      },
    ],
    jikanEpisodes: [
      {
        id: 'mal-ep-52991-2',
        number: 2,
        title: 'Episode 2',
        isFiller: true,
      },
      {
        id: 'mal-ep-52991-3',
        number: 3,
        title: 'Killing Magic',
        isFiller: false,
      },
    ],
    fallbackDurationSeconds: 1440,
    fallbackThumbnail: 'https://img.example/banner.jpg',
  });

  assert.equal(merged.length, 3);
  assert.equal(merged[0].title, "The Journey's End");
  assert.equal(merged[0].thumbnail, 'https://img.example/ep1.jpg');
  assert.equal(merged[1].title, "It Didn't Have to Be Magic...");
  assert.equal(merged[1].thumbnail, 'https://img.example/ep2.jpg');
  assert.equal(merged[1].isFiller, true);
  assert.equal(merged[2].title, 'Killing Magic');
  assert.equal(merged[2].thumbnail, 'https://img.example/banner.jpg');
  assert.equal(merged[2].durationSeconds, 1440);
});

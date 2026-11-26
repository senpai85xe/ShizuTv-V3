import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEpisodeRanges,
  clampSeekTarget,
  filterByEpisodeRange,
  formatCompactNumber,
  formatNextAiringInfo,
  formatPlayerTime,
  getEpisodeRangeCount,
  partitionMediaRelations,
  stripHtmlTags,
} from './detailsLayout';
import { UnifiedMedia } from '../types/media';

describe('detailsLayout helpers', () => {
  it('buildEpisodeRanges splits episode counts > chunkSize into exact ranges', () => {
    assert.deepEqual(buildEpisodeRanges(0), []);
    assert.deepEqual(buildEpisodeRanges(12), []);
    assert.deepEqual(buildEpisodeRanges(25), [
      { id: '1-12', label: '1 - 12', start: 1, end: 12 },
      { id: '13-24', label: '13 - 24', start: 13, end: 24 },
      { id: '25-25', label: '25 - 25', start: 25, end: 25 },
    ]);
    assert.equal(getEpisodeRangeCount({ start: 1, end: 25 }), 25);
    assert.equal(getEpisodeRangeCount({ start: 26, end: 50 }), 25);
    assert.equal(getEpisodeRangeCount({ start: 25, end: 25 }), 1);
  });

  it('filterByEpisodeRange returns items within inclusive range or all when null', () => {
    const items = Array.from({ length: 25 }, (_, i) => ({ number: i + 1 }));
    assert.equal(filterByEpisodeRange(items, null).length, 25);
    const secondChunk = filterByEpisodeRange(items, {
      id: '13-24',
      label: '13 - 24',
      start: 13,
      end: 24,
    });
    assert.equal(secondChunk.length, 12);
    assert.equal(secondChunk[0].number, 13);
    assert.equal(secondChunk[11].number, 24);
  });

  it('partitionMediaRelations separates PREQUEL/SEQUEL seasons from other relations', () => {
    const relations: UnifiedMedia[] = [
      { id: '1', type: 'MANGA', title: { english: 'Manga' }, relationType: 'ADAPTATION' },
      { id: '2', type: 'ANIME', title: { english: 'Season 2' }, relationType: 'SEQUEL' },
      { id: '3', type: 'ANIME', title: { english: 'Movie' }, relationType: 'SIDE_STORY' },
      { id: '4', type: 'ANIME', title: { english: 'Prequel' }, relationType: 'PREQUEL' },
    ];
    const { seasons, otherRelations } = partitionMediaRelations(relations);
    assert.deepEqual(
      seasons.map((s) => s.id),
      ['4', '2'],
    );
    assert.deepEqual(
      otherRelations.map((r) => r.id),
      ['1', '3'],
    );
  });

  it('stripHtmlTags normalizes <br> and removes tags safely', () => {
    const raw = '<p>Humanity fights <i>Titans</i>.<br/>Walls fall.</p>';
    assert.equal(stripHtmlTags(raw), 'Humanity fights Titans.\nWalls fall.');
  });

  it('formatCompactNumber formats thousands and millions cleanly', () => {
    assert.equal(formatCompactNumber(null), '—');
    assert.equal(formatCompactNumber(842), '842');
    assert.equal(formatCompactNumber(640231), '640.2K');
    assert.equal(formatCompactNumber(1_450_000), '1.5M');
  });

  it('formatPlayerTime and clampSeekTarget handle edge cases accurately', () => {
    assert.equal(formatPlayerTime(-5), '00:00');
    assert.equal(formatPlayerTime(65), '01:05');
    assert.equal(formatPlayerTime(3661), '1:01:01');
    assert.equal(clampSeekTarget(5, -10, 100), 0);
    assert.equal(clampSeekTarget(95, 10, 100), 100);
    assert.equal(clampSeekTarget(15, 85, 1400), 100);
  });

  it('formatNextAiringInfo computes countdown and date/time for ongoing episodes', () => {
    assert.equal(formatNextAiringInfo(null, '2026-11-21T13:00:00.000Z'), null);
    assert.equal(formatNextAiringInfo(8, null), null);

    const now = Date.UTC(2026, 10, 16, 12, 0, 0);
    const target = new Date(now + (5 * 24 * 60 + 59) * 60_000).toISOString();
    const info = formatNextAiringInfo(8, target, now);
    assert.ok(info);
    assert.equal(info.episode, 8);
    assert.equal(info.countdown, '5d 0h 59m');
    assert.ok(info.dateTimeLabel.includes('·'));

    const subDayTarget = new Date(now + (4 * 60 + 15) * 60_000).toISOString();
    const subDay = formatNextAiringInfo(12, subDayTarget, now);
    assert.equal(subDay?.countdown, '4h 15m');
  });
});

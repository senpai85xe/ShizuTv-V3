import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_DOCUMENT_TITLE,
  formatDocumentTitle,
  formatMediaDocumentTitle,
  resolveRouteDocumentTitle,
} from './documentTitle';

test('formatDocumentTitle formats page labels with ShizuTv em-dash prefix', () => {
  assert.equal(formatDocumentTitle(''), DEFAULT_DOCUMENT_TITLE);
  assert.equal(formatDocumentTitle(null), DEFAULT_DOCUMENT_TITLE);
  assert.equal(formatDocumentTitle('Discover'), 'ShizuTv — Discover');
  assert.equal(formatDocumentTitle('  Library  '), 'ShizuTv — Library');
});

test('formatMediaDocumentTitle formats anime, episode, and chapter titles cleanly', () => {
  assert.equal(formatMediaDocumentTitle({ mediaTitle: '' }), DEFAULT_DOCUMENT_TITLE);
  assert.equal(
    formatMediaDocumentTitle({ mediaTitle: 'Naruto: Shippuden' }),
    'ShizuTv — Naruto: Shippuden',
  );
  assert.equal(
    formatMediaDocumentTitle({ mediaTitle: 'ONE PIECE', episodeNumber: 1071 }),
    'ShizuTv — EP 1071 · ONE PIECE',
  );
  assert.equal(
    formatMediaDocumentTitle({ mediaTitle: 'Solo Leveling', chapterNumber: 45 }),
    'ShizuTv — Ch. 45 · Solo Leveling',
  );
});

test('resolveRouteDocumentTitle maps static app routes and defers media routes', () => {
  assert.equal(resolveRouteDocumentTitle('/home'), 'ShizuTv — Home');
  assert.equal(resolveRouteDocumentTitle('/discover'), 'ShizuTv — Discover');
  assert.equal(resolveRouteDocumentTitle('/library'), 'ShizuTv — Library');
  assert.equal(resolveRouteDocumentTitle('/continue/anime'), 'ShizuTv — Continue Watching');
  assert.equal(resolveRouteDocumentTitle('/continue/manga'), 'ShizuTv — Continue Reading');
  assert.equal(resolveRouteDocumentTitle('/settings/player'), 'ShizuTv — Player Settings');
  assert.equal(resolveRouteDocumentTitle('/watch-together'), 'ShizuTv — Watch Together');
  assert.equal(resolveRouteDocumentTitle('/details/anime/21'), null);
  assert.equal(resolveRouteDocumentTitle('/watch-together/qrzinu'), null);
  assert.equal(resolveRouteDocumentTitle('/reader'), null);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CommunityPost,
  filterAndSortCommunityPosts,
  formatRelativeTimeAgo,
  parseCommunityBodyBlocks,
  validateCommunityPostDraft,
} from './community';

const NOW = 1_700_000_000_000;

const SAMPLE_POSTS: CommunityPost[] = [
  {
    id: 'p1',
    clientId: 'mod',
    category: 'announcements',
    title: 'Welcome to the Community — please read the rules',
    body: 'Talk anime with **fellow fans** here.',
    authorName: 'ShizuTv',
    authorIsMod: true,
    pinned: true,
    label: null,
    linkedAnime: [],
    score: 16,
    comments: [],
    views: 192,
    createdAt: NOW - 3 * 86_400_000,
  },
  {
    id: 'p2',
    clientId: 'u2',
    category: 'features',
    title: 'Top Seasonal Anime Row',
    body: 'Would love a dedicated seasonal showcase.',
    authorName: 'Rio',
    pinned: false,
    label: 'resolved',
    linkedAnime: [{ id: 21, title: 'One Piece' }],
    score: 12,
    comments: [{ id: 'c1', authorName: 'Host', body: 'Added!', createdAt: NOW - 3600_000 }],
    views: 40,
    createdAt: NOW - 16 * 3600_000,
  },
  {
    id: 'p3',
    clientId: 'u3',
    category: 'general',
    title: 'Latest episode discussion',
    body: 'That ||secret reveal|| was wild!',
    authorName: 'Mina',
    pinned: false,
    label: 'planned',
    linkedAnime: [],
    score: 5,
    comments: [],
    views: 99,
    createdAt: NOW - 2 * 3600_000,
  },
];

test('filterAndSortCommunityPosts preserves pinned posts first and filters cleanly', () => {
  const allNew = filterAndSortCommunityPosts(
    SAMPLE_POSTS,
    { category: 'all', label: 'any', sort: 'new', search: '' },
    NOW,
  );
  assert.deepEqual(
    allNew.map((p) => p.id),
    ['p1', 'p3', 'p2'],
  );

  const resolvedOnly = filterAndSortCommunityPosts(
    SAMPLE_POSTS,
    { category: 'all', label: 'resolved', sort: 'top', search: '' },
    NOW,
  );
  assert.deepEqual(
    resolvedOnly.map((p) => p.id),
    ['p2'],
  );

  const animeMatch = filterAndSortCommunityPosts(
    SAMPLE_POSTS,
    { category: 'all', label: 'any', sort: 'hot', search: 'one piece' },
    NOW,
  );
  assert.deepEqual(
    animeMatch.map((p) => p.id),
    ['p2'],
  );
});

test('validateCommunityPostDraft enforces required category, title bounds, body, and max 3 anime', () => {
  assert.ok(validateCommunityPostDraft({ category: '', title: 'Hi there', body: 'Hello world', linkedAnime: [] }));
  assert.ok(validateCommunityPostDraft({ category: 'general', title: 'Hi', body: 'Hello world', linkedAnime: [] }));
  assert.ok(validateCommunityPostDraft({ category: 'general', title: 'Valid title', body: 'abc', linkedAnime: [] }));
  assert.ok(
    validateCommunityPostDraft({
      category: 'general',
      title: 'Valid title',
      body: 'Enough detail here',
      linkedAnime: [
        { id: 1, title: 'A' },
        { id: 2, title: 'B' },
        { id: 3, title: 'C' },
        { id: 4, title: 'D' },
      ],
    }),
  );
  assert.equal(
    validateCommunityPostDraft({
      category: 'general',
      title: 'Valid title',
      body: 'Enough detail here',
      linkedAnime: [{ id: 1, title: 'One Piece' }],
    }),
    null,
  );
});

test('parseCommunityBodyBlocks parses bold, spoiler, and quote blocks safely', () => {
  const blocks = parseCommunityBodyBlocks('> Quoted **bold** text\nNormal ||hidden spoiler|| line');
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].kind, 'quote');
  assert.deepEqual(blocks[0].tokens, [
    { kind: 'text', text: 'Quoted ' },
    { kind: 'bold', text: 'bold' },
    { kind: 'text', text: ' text' },
  ]);
  assert.equal(blocks[1].kind, 'paragraph');
  assert.deepEqual(blocks[1].tokens, [
    { kind: 'text', text: 'Normal ' },
    { kind: 'spoiler', text: 'hidden spoiler' },
    { kind: 'text', text: ' line' },
  ]);
});

test('formatRelativeTimeAgo formats minutes, hours, and days cleanly', () => {
  assert.equal(formatRelativeTimeAgo(NOW - 30_000, NOW), 'just now');
  assert.equal(formatRelativeTimeAgo(NOW - 15 * 60_000, NOW), '15m ago');
  assert.equal(formatRelativeTimeAgo(NOW - 16 * 3600_000, NOW), '16h ago');
  assert.equal(formatRelativeTimeAgo(NOW - 3 * 86_400_000, NOW), '3d ago');
});

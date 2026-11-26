import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyCodePaste,
  buildDefaultRoomName,
  buildFloatingEmojiParticle,
  buildWatchPartyInviteUrl,
  buildWatchPartyWsUrl,
  computeSyncedPlaybackTime,
  createEmptyCodeSlots,
  EMPTY_ROOM_GRACE_MS,
  filterMyEndedRooms,
  filterMyLiveRooms,
  filterPublicRooms,
  formatRoomClosedAgo,
  formatRoomDuration,
  formatWatchRoomMetaLine,
  getHostDisplayName,
  getParticipantInitial,
  isRoomGraceExpired,
  isSupportedReactionEmoji,
  isValidRoomCode,
  joinCodeSlots,
  normalizeRoomCode,
  removeParticipant,
  resolveDefaultDisplayName,
  sanitizeRoomNameUpdate,
  shouldApplyRemoteSeek,
  shouldRestoreHostRole,
  splitCodeIntoSlots,
  updateCodeSlot,
  upsertParticipant,
} from './watchParty.ts';

test('normalizeRoomCode uppercases and strips invalid symbols', () => {
  assert.equal(normalizeRoomCode(' ab-9x 42 '), 'AB9X42');
  assert.equal(normalizeRoomCode('k9x4m2!@#$'), 'K9X4M2');
  assert.equal(normalizeRoomCode('1234567890'), '12345678');
});

test('isValidRoomCode accepts 4-8 alphanumeric chars and rejects shorter inputs', () => {
  assert.equal(isValidRoomCode('ABC'), false);
  assert.equal(isValidRoomCode('AB12'), true);
  assert.equal(isValidRoomCode('K9X4M2'), true);
});

test('code slot helpers handle typing, paste, and focus progression cleanly', () => {
  const empty = createEmptyCodeSlots(6);
  assert.deepEqual(empty, ['', '', '', '', '', '']);

  const step1 = updateCodeSlot(empty, 0, 'k');
  assert.deepEqual(step1.nextSlots, ['K', '', '', '', '', '']);
  assert.equal(step1.nextFocusIndex, 1);

  const pasted = applyCodePaste(empty, 2, 'a9x-4m2');
  assert.deepEqual(pasted.nextSlots, ['A', '9', 'X', '4', 'M', '2']);
  assert.equal(joinCodeSlots(pasted.nextSlots), 'A9X4M2');
  assert.deepEqual(splitCodeIntoSlots('ab12'), ['A', 'B', '1', '2', '', '']);
});

test('resolveDefaultDisplayName falls back across trackers to Guest', () => {
  assert.equal(resolveDefaultDisplayName({}), 'Guest');
  assert.equal(
    resolveDefaultDisplayName({
      myanimelist: { tracker: 'myanimelist', id: '2', username: 'Roronoa' },
    }),
    'Roronoa',
  );
  assert.equal(
    resolveDefaultDisplayName({
      anilist: { tracker: 'anilist', id: '1', username: 'Tanjiro' },
      myanimelist: { tracker: 'myanimelist', id: '2', username: 'Roronoa' },
    }),
    'Tanjiro',
  );
});

test('upsertParticipant stays idempotent on reconnects', () => {
  const base = [
    { id: 'u1', name: 'Host', isHost: true, joinedAt: 100 },
  ];
  const added = upsertParticipant(base, {
    id: 'u2',
    name: 'Guest',
    isHost: false,
    joinedAt: 200,
  });
  assert.equal(added.length, 2);

  const reconnected = upsertParticipant(added, {
    id: 'u2',
    name: 'GuestRenamed',
    isHost: false,
    joinedAt: 200,
  });
  assert.equal(reconnected.length, 2);
  assert.equal(reconnected[1].name, 'GuestRenamed');

  const removed = removeParticipant(reconnected, 'u2');
  assert.equal(removed.length, 1);
  assert.equal(removed[0].id, 'u1');
});

test('computeSyncedPlaybackTime adjusts elapsed time when playing', () => {
  assert.equal(computeSyncedPlaybackTime(42, 1000, false, 6000), 42);
  assert.equal(computeSyncedPlaybackTime(42, 1000, true, 6000), 47);
});

test('shouldApplyRemoteSeek avoids micro jitter below threshold', () => {
  assert.equal(shouldApplyRemoteSeek(10.0, 10.8, 1.5), false);
  assert.equal(shouldApplyRemoteSeek(10.0, 12.1, 1.5), true);
});

test('filterPublicRooms excludes private rooms and getHostDisplayName resolves host', () => {
  const pub = {
    roomCode: 'PUB123',
    hostId: 'h1',
    isPublic: true,
    mediaId: '21',
    mediaTitle: 'One Piece',
    episodeNumber: 1,
    episodeTitle: 'Episode 1',
    isPlaying: true,
    currentTime: 0,
    updatedAt: 100,
    participants: [{ id: 'h1', name: 'Luffy', isHost: true, joinedAt: 100 }],
  };
  const priv = { ...pub, roomCode: 'PRV999', isPublic: false };
  const filtered = filterPublicRooms([pub, priv]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].roomCode, 'PUB123');
  assert.equal(getHostDisplayName(pub), 'Luffy');
});

test('buildWatchPartyWsUrl and invite URLs map http/https cleanly', () => {
  assert.equal(
    buildWatchPartyWsUrl({ protocol: 'http:', host: '127.0.0.1:3000' }),
    'ws://127.0.0.1:3000/ws/watch-party',
  );
  assert.equal(
    buildWatchPartyWsUrl({ protocol: 'https:', host: 'shizutv.app' }),
    'wss://shizutv.app/ws/watch-party',
  );
  assert.equal(
    buildWatchPartyInviteUrl('k9x4m2', 'https://shizutv.app'),
    'https://shizutv.app/watch-together/K9X4M2',
  );
  assert.equal(isSupportedReactionEmoji('🔥'), true);
  assert.equal(isSupportedReactionEmoji(''), false);
  const particle = buildFloatingEmojiParticle({
    id: 'rx-1',
    emoji: '❤️',
    senderId: 'u1',
    senderName: 'Senpai',
    sentAt: 1000,
    laneSeed: 0.5,
  });
  assert.equal(particle.emoji, '❤️');
  assert.ok(particle.xPercent >= 14 && particle.xPercent <= 86);
  assert.equal(getParticipantInitial('  asta'), 'A');
  assert.equal(getParticipantInitial(''), 'G');
});

test('buildDefaultRoomName, formatRoomDuration, formatRoomClosedAgo, and filterMyRooms work cleanly', () => {
  assert.equal(buildDefaultRoomName('senpai85xe'), "senpai85xe's room");
  assert.equal(buildDefaultRoomName('   '), "Guest's room");

  assert.equal(formatRoomDuration(25_000), '<1 min');
  assert.equal(formatRoomDuration(13 * 60_000), '13 min');
  assert.equal(formatRoomDuration(75 * 60_000), '1h 15m');

  const baseNow = 1_700_000_000_000;
  assert.equal(formatRoomClosedAgo(baseNow - 20_000, baseNow), 'Just now');
  assert.equal(formatRoomClosedAgo(baseNow - 15 * 60_000, baseNow), '15m ago');
  assert.equal(formatRoomClosedAgo(baseNow - 3 * 3600_000, baseNow), '3h ago');

  const live = [
    {
      roomCode: 'MY1111',
      hostId: 'c1',
      hostClientId: 'c1',
      isPublic: false,
      mediaId: '20',
      mediaTitle: 'Naruto',
      episodeNumber: 1,
      episodeTitle: 'Episode 1',
      isPlaying: false,
      currentTime: 0,
      updatedAt: 100,
      participants: [{ id: 'c1', name: 'Senpai', isHost: true, joinedAt: 100 }],
    },
    {
      roomCode: 'OT2222',
      hostId: 'c2',
      hostClientId: 'c2',
      isPublic: true,
      mediaId: '21',
      mediaTitle: 'One Piece',
      episodeNumber: 1,
      episodeTitle: 'Episode 1',
      isPlaying: true,
      currentTime: 0,
      updatedAt: 100,
      participants: [{ id: 'c2', name: 'Arsh', isHost: true, joinedAt: 100 }],
    },
  ];
  assert.deepEqual(
    filterMyLiveRooms(live, 'c1', 'Guest').map((r) => r.roomCode),
    ['MY1111'],
  );

  const ended = [
    {
      roomCode: 'END111',
      roomName: "Senpai's room",
      track: 'H-Sub' as const,
      hostName: 'Senpai',
      hostClientId: 'c1',
      isPublic: true,
      mediaId: '20',
      mediaTitle: 'Naruto',
      episodeNumber: 1,
      episodeTitle: 'Episode 1',
      createdAt: 1000,
      endedAt: 2000,
      durationMs: 600_000,
      peakParticipants: 2,
      messagesCount: 3,
    },
    {
      roomCode: 'END222',
      roomName: "Arsh's room",
      track: 'H-Sub' as const,
      hostName: 'Arsh',
      hostClientId: 'c2',
      isPublic: true,
      mediaId: '21',
      mediaTitle: 'Black Clover',
      episodeNumber: 1,
      episodeTitle: 'Episode 1',
      createdAt: 1000,
      endedAt: 2000,
      durationMs: 780_000,
      peakParticipants: 2,
      messagesCount: 1,
    },
  ];
  assert.deepEqual(
    filterMyEndedRooms(ended, 'c1', 'Senpai').map((r) => r.roomCode),
    ['END111'],
  );
});

test('room grace period and host restoration helpers behave predictably', () => {
  assert.equal(EMPTY_ROOM_GRACE_MS, 120_000);
  assert.equal(isRoomGraceExpired(undefined, 500_000), false);
  assert.equal(isRoomGraceExpired(400_000, 490_000, 120_000), false);
  assert.equal(isRoomGraceExpired(400_000, 520_000, 120_000), true);

  // Original host rejoining while others kept the room active reclaims host role
  assert.equal(shouldRestoreHostRole('host-1', 'host-1', 2), true);
  // First person joining an empty grace-period room becomes acting host
  assert.equal(shouldRestoreHostRole('host-1', 'viewer-2', 0), true);
  // Regular viewer joining an occupied room stays viewer
  assert.equal(shouldRestoreHostRole('host-1', 'viewer-2', 1), false);
});

test('sanitizeRoomNameUpdate and formatWatchRoomMetaLine handle valid and empty inputs', () => {
  assert.equal(sanitizeRoomNameUpdate('  Night Marathon  ', 'Senpai'), 'Night Marathon');
  assert.equal(sanitizeRoomNameUpdate('   ', 'Senpai'), "Senpai's room");
  assert.equal(sanitizeRoomNameUpdate('A'.repeat(64), 'Senpai').length, 48);

  assert.equal(
    formatWatchRoomMetaLine({
      format: 'tv',
      year: 1999,
      totalEpisodes: 1122,
      averageScore: 8.8,
    }),
    'TV · 1999 · 1122 eps · ★ 8.8',
  );
  assert.equal(
    formatWatchRoomMetaLine({
      format: 'tv',
      year: 2024,
      totalEpisodes: 12,
      averageScore: 84,
    }),
    'TV · 2024 · 12 eps · ★ 8.4',
  );
  assert.equal(formatWatchRoomMetaLine({ format: '', year: null }), '');
});

test('buildWatchPartyWsUrl honors configured backend URL and rejects unconfigured Capacitor native', async () => {
  const { BackendNotConfiguredError, setRuntimeBackendUrl, clearRuntimeBackendUrl } = await import(
    './backendConfig.ts'
  );
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalCapacitor = (globalThis as { Capacitor?: unknown }).Capacitor;
  const storage = new Map<string, string>();

  (globalThis as { window?: unknown }).window = {
    location: { origin: 'https://localhost', protocol: 'https:', host: 'localhost' },
    localStorage: {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
    },
    dispatchEvent: () => true,
  };
  (globalThis as { Capacitor?: unknown }).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'android',
    Plugins: {},
  };

  try {
    assert.throws(() => buildWatchPartyWsUrl(), BackendNotConfiguredError);
    setRuntimeBackendUrl('https://wp-backend.example');
    assert.equal(buildWatchPartyWsUrl(), 'wss://wp-backend.example/ws/watch-party');
    clearRuntimeBackendUrl();
  } finally {
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



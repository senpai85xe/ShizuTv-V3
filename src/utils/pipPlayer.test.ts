import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canUseNativePictureInPicture,
  clampPipPosition,
  computePipCornerPosition,
  resolveInlinePipHandoff,
  shouldAutoEnterPipOnLeave,
  shouldRestorePipPlayback,
  snapPipCorner,
} from './pipPlayer';

test('clampPipPosition keeps PiP bounds inside viewport respecting nav clearances', () => {
  const clamped = clampPipPosition(-40, 900, 240, 135, 390, 844, {
    margin: 12,
    topClearance: 16,
    bottomClearance: 88,
  });
  assert.deepEqual(clamped, { x: 12, y: 621 });

  const upper = clampPipPosition(500, -10, 240, 135, 390, 844, {
    margin: 12,
    topClearance: 16,
    bottomClearance: 88,
  });
  assert.deepEqual(upper, { x: 138, y: 16 });
});

test('snapPipCorner and computePipCornerPosition snap cleanly to nearest screen quadrant', () => {
  assert.equal(snapPipCorner(20, 30, 240, 135, 1440, 900), 'top-left');
  assert.equal(snapPipCorner(1100, 30, 240, 135, 1440, 900), 'top-right');
  assert.equal(snapPipCorner(20, 700, 240, 135, 1440, 900), 'bottom-left');
  assert.equal(snapPipCorner(1100, 700, 240, 135, 1440, 900), 'bottom-right');

  const br = computePipCornerPosition('bottom-right', 280, 158, 1440, 900, {
    margin: 20,
    topClearance: 20,
    bottomClearance: 24,
  });
  assert.deepEqual(br, { x: 1140, y: 718 });
});

test('canUseNativePictureInPicture detects browser and video element support safely', () => {
  assert.equal(canUseNativePictureInPicture(null, null), false);
  assert.equal(canUseNativePictureInPicture({ pictureInPictureEnabled: false }, null), false);
  assert.equal(
    canUseNativePictureInPicture(
      { pictureInPictureEnabled: true },
      { requestPictureInPicture: () => Promise.resolve(), disablePictureInPicture: false },
    ),
    true,
  );
  assert.equal(
    canUseNativePictureInPicture(
      { pictureInPictureEnabled: true },
      { requestPictureInPicture: () => Promise.resolve(), disablePictureInPicture: true },
    ),
    false,
  );
});

test('shouldRestorePipPlayback matches mediaId and episodeNumber strictly', () => {
  const session = {
    media: { id: '21', type: 'ANIME' as const, title: { english: 'One Piece' } },
    episodes: [
      { id: 'ep-1', number: 1, title: 'Ep 1' },
      { id: 'ep-2', number: 2, title: 'Ep 2' },
    ],
    episodeIndex: 1,
  };
  assert.equal(shouldRestorePipPlayback(session, '21', 2), true);
  assert.equal(shouldRestorePipPlayback(session, '21', 1), false);
  assert.equal(shouldRestorePipPlayback(session, '99', 2), false);
  assert.equal(shouldRestorePipPlayback(null, '21', 2), false);
});

test('resolveInlinePipHandoff closes PiP cleanly and restores state for matching episode', () => {
  const session = {
    media: { id: '16498', type: 'ANIME' as const, title: { english: 'Attack on Titan' } },
    episodes: [
      { id: 'ep-1', number: 1, title: 'Ep 1' },
      { id: 'ep-2', number: 2, title: 'Ep 2' },
    ],
    episodeIndex: 0,
    currentTime: 42.5,
    playing: true,
  };
  assert.deepEqual(resolveInlinePipHandoff(session, '16498', 1), {
    shouldClosePip: true,
    restoreTime: 42.5,
    resumePlaying: true,
  });
  assert.deepEqual(resolveInlinePipHandoff(session, '16498', 2), {
    shouldClosePip: true,
    restoreTime: null,
    resumePlaying: false,
  });
  assert.deepEqual(resolveInlinePipHandoff(null, '16498', 1), {
    shouldClosePip: false,
    restoreTime: null,
    resumePlaying: false,
  });
});

test('shouldAutoEnterPipOnLeave triggers only when enabled, playing, not ended, and not already handled', () => {
  assert.equal(
    shouldAutoEnterPipOnLeave({ enabled: true, isPlaying: true, ended: false, alreadyHandled: false }),
    true,
  );
  assert.equal(
    shouldAutoEnterPipOnLeave({ enabled: true, isPlaying: false, ended: false, alreadyHandled: false }),
    false,
  );
  assert.equal(
    shouldAutoEnterPipOnLeave({ enabled: true, isPlaying: true, ended: true, alreadyHandled: false }),
    false,
  );
  assert.equal(
    shouldAutoEnterPipOnLeave({ enabled: false, isPlaying: true, ended: false, alreadyHandled: false }),
    false,
  );
  assert.equal(
    shouldAutoEnterPipOnLeave({ enabled: true, isPlaying: true, ended: false, alreadyHandled: true }),
    false,
  );
});



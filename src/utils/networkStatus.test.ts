import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReconnectDelaySeconds,
  getOfflineIndicatorState,
  isConnectionUnstable,
  readNavigatorOnlineStatus,
} from './networkStatus';

test('readNavigatorOnlineStatus defaults to true when navigator is unavailable', () => {
  assert.equal(readNavigatorOnlineStatus(undefined), true);
  assert.equal(readNavigatorOnlineStatus(null), true);
  assert.equal(readNavigatorOnlineStatus({ onLine: true }), true);
  assert.equal(readNavigatorOnlineStatus({ onLine: false }), false);
});

test('getOfflineIndicatorState returns hidden when online and not recently reconnected', () => {
  const state = getOfflineIndicatorState({
    isOnline: true,
    dismissedOffline: false,
    justReconnected: false,
  });
  assert.equal(state.visible, false);
  assert.equal(state.variant, 'hidden');
});

test('getOfflineIndicatorState displays countdown when disconnected and transitions to reconnecting during probe', () => {
  const offline = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: false,
    justReconnected: false,
  });
  assert.equal(offline.visible, true);
  assert.equal(offline.variant, 'offline');
  assert.equal(offline.label, 'Offline mode');
  assert.equal(offline.detail, 'No internet connection');

  const countdown = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: false,
    justReconnected: false,
    retrySecondsRemaining: 4,
  });
  assert.equal(countdown.variant, 'offline');
  assert.equal(countdown.label, 'Reconnecting soon');
  assert.equal(countdown.detail, 'Retrying in 4s');
  assert.equal(countdown.retrySecondsRemaining, 4);

  const reconnecting = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: false,
    justReconnected: false,
    isReconnecting: true,
    retrySecondsRemaining: 0,
  });
  assert.equal(reconnecting.visible, true);
  assert.equal(reconnecting.variant, 'reconnecting');
  assert.equal(reconnecting.label, 'Reconnecting...');

  const dismissed = getOfflineIndicatorState({
    isOnline: false,
    dismissedOffline: true,
    justReconnected: false,
  });
  assert.equal(dismissed.visible, false);
  assert.equal(dismissed.variant, 'hidden');
});

test('getOfflineIndicatorState shows unstable connection countdown when network fluctuates', () => {
  assert.equal(isConnectionUnstable({ effectiveType: '2g' }, 0), true);
  assert.equal(isConnectionUnstable({ effectiveType: '4g', rtt: 900 }, 0), true);
  assert.equal(isConnectionUnstable({ effectiveType: '4g', rtt: 80 }, 2), true);
  assert.equal(isConnectionUnstable({ effectiveType: '4g', rtt: 80, downlink: 10 }, 0), false);

  assert.equal(computeReconnectDelaySeconds(0), 5);
  assert.equal(computeReconnectDelaySeconds(1), 10);
  assert.equal(computeReconnectDelaySeconds(4), 15);

  const unstable = getOfflineIndicatorState({
    isOnline: true,
    dismissedOffline: false,
    justReconnected: false,
    isUnstable: true,
    retrySecondsRemaining: 3,
  });
  assert.equal(unstable.visible, true);
  assert.equal(unstable.variant, 'unstable');
  assert.equal(unstable.label, 'Unstable connection');
  assert.equal(unstable.detail, 'Reconnecting in 3s');
});

test('getOfflineIndicatorState shows transient reconnected confirmation when connection returns', () => {
  const reconnected = getOfflineIndicatorState({
    isOnline: true,
    dismissedOffline: false,
    justReconnected: true,
  });
  assert.equal(reconnected.visible, true);
  assert.equal(reconnected.variant, 'reconnected');
  assert.equal(reconnected.label, 'Back online');
});

export type NetworkIndicatorVariant =
  | 'hidden'
  | 'offline'
  | 'reconnecting'
  | 'unstable'
  | 'reconnected';

export interface NetworkIndicatorState {
  visible: boolean;
  variant: NetworkIndicatorVariant;
  label: string;
  detail: string;
  retrySecondsRemaining: number | null;
}

export interface NetworkConnectionSnapshot {
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

export const RECONNECT_BACKOFF_SECONDS = [5, 10, 15] as const;

export function readNavigatorOnlineStatus(nav?: Pick<Navigator, 'onLine'> | null): boolean {
  if (!nav || typeof nav.onLine !== 'boolean') {
    return true;
  }
  return nav.onLine;
}

export function isConnectionUnstable(
  conn?: NetworkConnectionSnapshot | null,
  recentDropCount = 0,
): boolean {
  if (recentDropCount >= 2) return true;
  if (!conn) return false;
  if (conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g') {
    return true;
  }
  if (typeof conn.downlink === 'number' && Number.isFinite(conn.downlink) && conn.downlink > 0 && conn.downlink < 0.6) {
    return true;
  }
  if (typeof conn.rtt === 'number' && Number.isFinite(conn.rtt) && conn.rtt > 650) {
    return true;
  }
  return false;
}

export function computeReconnectDelaySeconds(attemptCount: number): number {
  if (!Number.isFinite(attemptCount) || attemptCount <= 0) {
    return RECONNECT_BACKOFF_SECONDS[0];
  }
  const idx = Math.min(RECONNECT_BACKOFF_SECONDS.length - 1, Math.floor(attemptCount));
  return RECONNECT_BACKOFF_SECONDS[idx];
}

export function getOfflineIndicatorState(params: {
  isOnline: boolean;
  dismissedOffline: boolean;
  justReconnected: boolean;
  isReconnecting?: boolean;
  isUnstable?: boolean;
  retrySecondsRemaining?: number | null;
}): NetworkIndicatorState {
  const retrySec =
    typeof params.retrySecondsRemaining === 'number' &&
    Number.isFinite(params.retrySecondsRemaining) &&
    params.retrySecondsRemaining >= 0
      ? Math.ceil(params.retrySecondsRemaining)
      : null;

  if (!params.isOnline || params.isUnstable) {
    if (params.dismissedOffline && !params.isReconnecting) {
      return {
        visible: false,
        variant: 'hidden',
        label: '',
        detail: '',
        retrySecondsRemaining: null,
      };
    }

    if (params.isReconnecting) {
      return {
        visible: true,
        variant: 'reconnecting',
        label: 'Reconnecting...',
        detail: 'Checking connection',
        retrySecondsRemaining: 0,
      };
    }

    if (!params.isOnline) {
      return {
        visible: true,
        variant: 'offline',
        label: retrySec !== null ? 'Reconnecting soon' : 'Offline mode',
        detail:
          retrySec !== null
            ? `Retrying in ${retrySec}s`
            : 'No internet connection',
        retrySecondsRemaining: retrySec,
      };
    }

    return {
      visible: true,
      variant: 'unstable',
      label: 'Unstable connection',
      detail:
        retrySec !== null
          ? `Reconnecting in ${retrySec}s`
          : 'Slow or fluctuating network',
      retrySecondsRemaining: retrySec,
    };
  }

  if (params.justReconnected) {
    return {
      visible: true,
      variant: 'reconnected',
      label: 'Back online',
      detail: 'Connection restored',
      retrySecondsRemaining: null,
    };
  }

  return {
    visible: false,
    variant: 'hidden',
    label: '',
    detail: '',
    retrySecondsRemaining: null,
  };
}

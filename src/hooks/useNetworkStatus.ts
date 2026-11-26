import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeReconnectDelaySeconds,
  getOfflineIndicatorState,
  isConnectionUnstable,
  NetworkConnectionSnapshot,
  NetworkIndicatorState,
  readNavigatorOnlineStatus,
} from '../utils/networkStatus';

const RECONNECTED_VISIBLE_MS = 2400;
const UNSTABLE_DROP_WINDOW_MS = 45_000;

interface NavigatorWithConnection extends Navigator {
  connection?: NetworkConnectionSnapshot & {
    addEventListener?: (type: string, listener: () => void) => void;
    removeEventListener?: (type: string, listener: () => void) => void;
  };
}

export function useNetworkStatus(): NetworkIndicatorState & {
  isOnline: boolean;
  dismiss: () => void;
  retryNow: () => void;
} {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? readNavigatorOnlineStatus(navigator) : true,
  );
  const [isUnstable, setIsUnstable] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [retrySecondsRemaining, setRetrySecondsRemaining] = useState<number | null>(null);
  const [dismissedOffline, setDismissedOffline] = useState(false);
  const [justReconnected, setJustReconnected] = useState(false);

  const wasOfflineOrUnstableRef = useRef(!isOnline);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptCountRef = useRef(0);
  const dropTimestampsRef = useRef<number[]>([]);

  const checkUnstableNow = useCallback((): boolean => {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as NavigatorWithConnection;
    const now = Date.now();
    dropTimestampsRef.current = dropTimestampsRef.current.filter(
      (t) => now - t < UNSTABLE_DROP_WINDOW_MS,
    );
    return isConnectionUnstable(nav.connection ?? null, dropTimestampsRef.current.length);
  }, []);

  const probeConnection = useCallback(async () => {
    setIsReconnecting(true);
    let reachable =
      typeof navigator !== 'undefined' ? readNavigatorOnlineStatus(navigator) : true;

    if (reachable && typeof fetch === 'function') {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId =
        controller && typeof window !== 'undefined'
          ? window.setTimeout(() => controller.abort(), 3000)
          : null;
      try {
        const res = await fetch('/', {
          method: 'HEAD',
          cache: 'no-store',
          signal: controller?.signal,
        });
        reachable = res.ok || res.type === 'opaqueredirect';
      } catch {
        reachable = false;
      } finally {
        if (timeoutId !== null) window.clearTimeout(timeoutId);
      }
    }

    setIsReconnecting(false);
    const unstableNow = checkUnstableNow();

    if (reachable && !unstableNow) {
      attemptCountRef.current = 0;
      setRetrySecondsRemaining(null);
      setIsUnstable(false);
      setIsOnline(true);
      setDismissedOffline(false);
      if (wasOfflineOrUnstableRef.current) {
        wasOfflineOrUnstableRef.current = false;
        setJustReconnected(true);
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          setJustReconnected(false);
          reconnectTimerRef.current = null;
        }, RECONNECTED_VISIBLE_MS);
      }
      return;
    }

    wasOfflineOrUnstableRef.current = true;
    setIsOnline(reachable);
    setIsUnstable(reachable && unstableNow);
    attemptCountRef.current += 1;
    setRetrySecondsRemaining(computeReconnectDelaySeconds(attemptCountRef.current));
  }, [checkUnstableNow]);

  useEffect(() => {
    const syncInitial = readNavigatorOnlineStatus(
      typeof navigator !== 'undefined' ? navigator : null,
    );
    const initialUnstable = checkUnstableNow();
    setIsOnline(syncInitial);
    setIsUnstable(syncInitial && initialUnstable);
    wasOfflineOrUnstableRef.current = !syncInitial || initialUnstable;
    if (!syncInitial || initialUnstable) {
      setRetrySecondsRemaining(computeReconnectDelaySeconds(0));
    }

    const handleOffline = () => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const now = Date.now();
      dropTimestampsRef.current = [
        ...dropTimestampsRef.current.filter((t) => now - t < UNSTABLE_DROP_WINDOW_MS),
        now,
      ];
      wasOfflineOrUnstableRef.current = true;
      attemptCountRef.current = 0;
      setJustReconnected(false);
      setDismissedOffline(false);
      setIsReconnecting(false);
      setIsUnstable(false);
      setIsOnline(false);
      setRetrySecondsRemaining(computeReconnectDelaySeconds(0));
    };

    const handleOnline = () => {
      const unstableNow = checkUnstableNow();
      setIsOnline(true);
      setDismissedOffline(false);
      if (unstableNow) {
        wasOfflineOrUnstableRef.current = true;
        setIsUnstable(true);
        setRetrySecondsRemaining(computeReconnectDelaySeconds(attemptCountRef.current));
        return;
      }

      attemptCountRef.current = 0;
      setIsUnstable(false);
      setIsReconnecting(false);
      setRetrySecondsRemaining(null);
      if (wasOfflineOrUnstableRef.current) {
        wasOfflineOrUnstableRef.current = false;
        setJustReconnected(true);
        if (reconnectTimerRef.current !== null) {
          window.clearTimeout(reconnectTimerRef.current);
        }
        reconnectTimerRef.current = window.setTimeout(() => {
          setJustReconnected(false);
          reconnectTimerRef.current = null;
        }, RECONNECTED_VISIBLE_MS);
      }
    };

    const handleConnectionChange = () => {
      const online = readNavigatorOnlineStatus(
        typeof navigator !== 'undefined' ? navigator : null,
      );
      const unstableNow = checkUnstableNow();
      if (!online) {
        handleOffline();
        return;
      }
      if (unstableNow) {
        wasOfflineOrUnstableRef.current = true;
        setIsOnline(true);
        setIsUnstable(true);
        setDismissedOffline(false);
        setRetrySecondsRemaining((prev) =>
          prev === null ? computeReconnectDelaySeconds(attemptCountRef.current) : prev,
        );
      } else if (wasOfflineOrUnstableRef.current) {
        handleOnline();
      }
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    const nav = typeof navigator !== 'undefined' ? (navigator as NavigatorWithConnection) : null;
    nav?.connection?.addEventListener?.('change', handleConnectionChange);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
      nav?.connection?.removeEventListener?.('change', handleConnectionChange);
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [checkUnstableNow]);

  // Countdown tick while offline or unstable (auto-probes when countdown hits 0)
  useEffect(() => {
    if ((isOnline && !isUnstable) || isReconnecting || retrySecondsRemaining === null) {
      return;
    }

    if (retrySecondsRemaining <= 0) {
      void probeConnection();
      return;
    }

    const timer = window.setTimeout(() => {
      setRetrySecondsRemaining((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [isOnline, isUnstable, isReconnecting, retrySecondsRemaining, probeConnection]);

  const indicator = getOfflineIndicatorState({
    isOnline,
    dismissedOffline,
    justReconnected,
    isReconnecting,
    isUnstable,
    retrySecondsRemaining,
  });

  return {
    ...indicator,
    isOnline,
    retryNow: () => {
      if (!isReconnecting) {
        void probeConnection();
      }
    },
    dismiss: () => {
      if (!isOnline || isUnstable) {
        setDismissedOffline(true);
      } else {
        setJustReconnected(false);
      }
    },
  };
}

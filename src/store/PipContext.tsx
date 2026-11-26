import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clampEpisodeIndex } from '../utils/inlinePlayer';
import { PipCorner, PipSessionState } from '../utils/pipPlayer';

interface PipContextValue {
  pipSession: PipSessionState | null;
  corner: PipCorner;
  setCorner: (corner: PipCorner) => void;
  enterInAppPip: (session: PipSessionState) => void;
  updatePipProgress: (
    patch: Partial<
      Pick<PipSessionState, 'currentTime' | 'duration' | 'playing' | 'muted' | 'speed' | 'volume'>
    >,
  ) => void;
  setPipEpisodeIndex: (nextIndex: number) => void;
  closePip: () => void;
  expandPipToFullPlayer: () => void;
  isPipActive: () => boolean;
}

const PipContext = createContext<PipContextValue | null>(null);

export const PipProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate();
  const [pipSession, setPipSession] = useState<PipSessionState | null>(null);
  const pipSessionRef = useRef<PipSessionState | null>(null);
  const [corner, setCorner] = useState<PipCorner>('bottom-right');

  const commitSession = useCallback((next: PipSessionState | null) => {
    pipSessionRef.current = next;
    setPipSession(next);
  }, []);

  const enterInAppPip = useCallback(
    (session: PipSessionState) => {
      const normalized: PipSessionState = {
        ...session,
        episodeIndex: clampEpisodeIndex(session.episodeIndex, session.episodes.length),
      };
      commitSession(normalized);
    },
    [commitSession],
  );

  const updatePipProgress = useCallback(
    (
      patch: Partial<
        Pick<PipSessionState, 'currentTime' | 'duration' | 'playing' | 'muted' | 'speed' | 'volume'>
      >,
    ) => {
      setPipSession((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        pipSessionRef.current = next;
        return next;
      });
    },
    [],
  );

  const setPipEpisodeIndex = useCallback((nextIndex: number) => {
    setPipSession((prev) => {
      if (!prev) return prev;
      const clamped = clampEpisodeIndex(nextIndex, prev.episodes.length);
      const next = {
        ...prev,
        episodeIndex: clamped,
        currentTime: 0,
        playing: true,
      };
      pipSessionRef.current = next;
      return next;
    });
  }, []);

  const closePip = useCallback(() => {
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    commitSession(null);
  }, [commitSession]);

  const expandPipToFullPlayer = useCallback(() => {
    const current = pipSessionRef.current;
    if (!current) return;
    if (typeof document !== 'undefined' && document.pictureInPictureElement) {
      document.exitPictureInPicture().catch(() => {});
    }
    commitSession(null);
    const mediaTypeSlug = (current.media.type || 'ANIME').toLowerCase();
    navigate(`/details/${mediaTypeSlug}/${current.media.id}`, {
      state: {
        media: current.media,
        initialTab: 'watch',
        episodeIndex: current.episodeIndex,
        sourceId: current.sourceId,
        serverId: current.serverId,
        startTime: current.currentTime,
        resumePlaying: current.playing,
        activeSubLang: current.activeSubLang,
        editedCuesMap: current.editedCuesMap,
      },
    });
  }, [commitSession, navigate]);

  const isPipActive = useCallback(() => pipSessionRef.current !== null, []);

  return (
    <PipContext.Provider
      value={{
        pipSession,
        corner,
        setCorner,
        enterInAppPip,
        updatePipProgress,
        setPipEpisodeIndex,
        closePip,
        expandPipToFullPlayer,
        isPipActive,
      }}
    >
      {children}
    </PipContext.Provider>
  );
};

export function usePip(): PipContextValue {
  const ctx = useContext(PipContext);
  if (!ctx) throw new Error('usePip must be used within PipProvider');
  return ctx;
}

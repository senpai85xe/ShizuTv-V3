import { HomeMediaMode } from './heroBanner';

export const HOME_MODE_TRANSITION_MS = 320;

export interface HomeModeTransitionState {
  activeMode: HomeMediaMode;
  exitingMode: HomeMediaMode | null;
  isTransitioning: boolean;
  transitionId: number;
}

export function createInitialHomeModeTransition(
  initialMode: HomeMediaMode,
): HomeModeTransitionState {
  return {
    activeMode: initialMode,
    exitingMode: null,
    isTransitioning: false,
    transitionId: 0,
  };
}

export function startHomeModeTransition(
  state: HomeModeTransitionState,
  nextMode: HomeMediaMode,
  reducedMotion = false,
): HomeModeTransitionState {
  if (state.activeMode === nextMode) {
    return state;
  }

  const nextTransitionId = state.transitionId + 1;

  if (reducedMotion) {
    return {
      activeMode: nextMode,
      exitingMode: null,
      isTransitioning: false,
      transitionId: nextTransitionId,
    };
  }

  return {
    activeMode: nextMode,
    exitingMode: state.activeMode,
    isTransitioning: true,
    transitionId: nextTransitionId,
  };
}

export function completeHomeModeTransition(
  state: HomeModeTransitionState,
  completedTransitionId: number,
): HomeModeTransitionState {
  if (!state.isTransitioning || state.transitionId !== completedTransitionId) {
    return state;
  }

  return {
    ...state,
    exitingMode: null,
    isTransitioning: false,
  };
}

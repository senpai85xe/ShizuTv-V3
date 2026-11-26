export function resolveEffectiveBatterySaver(input: {
  topLevelBatterySaver?: unknown;
  playerBatterySaver?: unknown;
}): boolean {
  if (typeof input.topLevelBatterySaver === 'boolean') {
    return input.topLevelBatterySaver;
  }
  if (typeof input.playerBatterySaver === 'boolean') {
    return input.playerBatterySaver;
  }
  return false;
}

export function resolveVideoPreloadMode(batterySaver: boolean): 'metadata' | 'auto' {
  return batterySaver ? 'metadata' : 'auto';
}

export function resolveBackgroundPollIntervalMs(
  baseIntervalMs: number,
  batterySaver: boolean,
): number | null {
  if (baseIntervalMs <= 0) return null;
  return batterySaver ? null : baseIntervalMs;
}

export function shouldRunAutomaticBackgroundTasks(batterySaver: boolean): boolean {
  return !batterySaver;
}

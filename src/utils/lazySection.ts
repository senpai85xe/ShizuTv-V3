export function getObserverLoadResetKey(
  trackerId: string,
  adultContentMode: string,
): string {
  return `${trackerId}:${adultContentMode}`;
}

export function getSectionFetchKey(
  sectionId: string,
  trackerId: string,
  adultContentMode: string,
): string {
  return `${trackerId}:${adultContentMode}:${sectionId}`;
}

export function shouldEagerLoadSection(
  sectionId: string,
  firstDiscoverySectionId?: string | null,
): boolean {
  if (!sectionId || !firstDiscoverySectionId) return false;
  return sectionId === firstDiscoverySectionId;
}

export function canTriggerLazySection(
  fetchKey: string,
  triggeredKeys: ReadonlySet<string>,
): boolean {
  if (!fetchKey) return false;
  return !triggeredKeys.has(fetchKey);
}

export function clearSectionFetchKey(
  fetchKey: string,
  triggeredKeys: Set<string>,
): void {
  if (!fetchKey) return;
  triggeredKeys.delete(fetchKey);
}

export function shouldFallbackToImmediateLoad(
  hasIntersectionObserver: boolean,
  eager: boolean,
): boolean {
  return eager || !hasIntersectionObserver;
}

export interface SkipInterval {
  skipType: 'op' | 'ed' | 'mixed-op' | 'mixed-ed' | 'recap';
  startTime: number;
  endTime: number;
  skipId: string;
}

export async function fetchAniSkipIntervals(
  malId: string | null | undefined,
  episodeNumber: number,
): Promise<SkipInterval[]> {
  if (!malId) return [];
  try {
    const url = `https://api.aniskip.com/v2/skip-times/${malId}/${episodeNumber}?types=op&types=ed&types=recap&episodeLength=0`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    if (!json.found || !Array.isArray(json.results)) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return json.results.map((r: any) => ({
      skipType: r.skipType,
      startTime: r.interval?.startTime ?? 0,
      endTime: r.interval?.endTime ?? 0,
      skipId: r.skipId || `${r.skipType}-${episodeNumber}`,
    }));
  } catch {
    return [];
  }
}

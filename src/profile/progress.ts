export const COUNTERS = ['coins', 'gems', 'crowns', 'wins', 'losses', 'draws'] as const;
export type Counter = typeof COUNTERS[number];
export type Progress = Record<Counter, number> & { streak: number; bestStreak: number };
export type CloudProgress = Progress & { lastPlayedAt: number };
export type ProgressEvent = {
  id: string;
  deviceId: string;
  kind: 'legacy' | 'update';
  values: Partial<Record<Counter, number>>;
  at: number;
  streak?: number;
  bestStreak?: number;
};
export type ProgressReceipt = { revision: number; profile: CloudProgress; accepted: string[] };
export const emptyProgress = (): CloudProgress => ({ coins: 0, gems: 0, crowns: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0, lastPlayedAt: 0 });

/** Historical totals are personal progress; they never award ranked points. */
export function applyProgress(current: CloudProgress, event: ProgressEvent): CloudProgress {
  const next = { ...current };
  for (const key of COUNTERS) next[key] += event.values[key] ?? 0;
  next.bestStreak = Math.max(next.bestStreak, event.bestStreak ?? 0, event.streak ?? 0);
  if (event.streak !== undefined) {
    if (event.kind === 'legacy') {
      // Old saves have no match timestamps. Do not replace a newer live streak.
      if (!next.lastPlayedAt) next.streak = Math.max(next.streak, event.streak);
    } else if (event.at >= next.lastPlayedAt) {
      next.streak = event.streak;
      next.lastPlayedAt = event.at;
    }
  }
  return next;
}

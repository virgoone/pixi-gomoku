import type { BrainId } from '../gomoku/ai/brains';

/**
 * Leaderboard points for a verified win. Shared by the server (which awards
 * them) and the client (which previews them).
 */
export const LADDER_POINTS = {
  ai: { sprout: 1, fox: 3, owl: 6 } satisfies Record<BrainId, number>,
  online: 5,
  draw: 1,
} as const;

export function ladderPoints(result: 'win' | 'loss' | 'draw', mode: 'ai' | 'online', brain?: BrainId) {
  if (result === 'draw') return LADDER_POINTS.draw;
  if (result === 'loss') return 0;
  return mode === 'online' ? LADDER_POINTS.online : LADDER_POINTS.ai[brain ?? 'sprout'];
}

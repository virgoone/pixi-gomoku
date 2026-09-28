import type { BrainId } from '../gomoku/ai';
import { brainInfo } from '../gomoku/ai';
import type { Stone } from '../gomoku/rules';
import type { TierId } from '../svg/palette';

export type Mode = 'ai' | 'local' | 'online';

export type Outcome = {
  /** Stable identity and completion time for offline / multi-device synchronization. */
  gameId?: string;
  finishedAt?: number;
  mode: Mode;
  /** Null on a draw. */
  winner: Stone | null;
  /** The local player's colour; null in same-device play where both sides are local. */
  myStone: Stone | null;
  totalMoves: number;
  /** Stones the winner placed. */
  winnerMoves: number;
  reason: 'five' | 'resign' | 'draw' | 'disconnect';
  brain?: BrainId;
  opponentName?: string;
  /** Every move in order, for the server to replay when the game is submitted to the leaderboard. */
  moves?: Array<[number, number]>;
  /** The colour that resigned, when the game ended by resignation. */
  resignedBy?: Stone;
  /** Some of the local player's moves were played by the master on their behalf (托管). */
  delegated?: boolean;
  /** The online opponent left and the master finished their side. */
  masterTookOver?: boolean;
  /** The online opponent used 托管 at some point. */
  opponentDelegated?: boolean;
  /** The player lets the master's public record name them (privacy setting). */
  showName?: boolean;
};

export type Rewards = { coins: number; gems: number; crowns: number };

export type Settlement =
  | { kind: 'win'; tier: TierId; rewards: Rewards; headline: string; detail: string; streak: number; delegated?: false }
  /** `delegated`: a 托管 game, shown with the draw badge, no rewards and no effect on the record. */
  | { kind: 'loss' | 'draw'; rewards: Rewards; headline: string; detail: string; streak: number; delegated?: boolean };

const CHEST_REWARDS: Record<TierId, Rewards> = {
  0: { coins: 60, gems: 0, crowns: 0 },
  1: { coins: 150, gems: 5, crowns: 0 },
  2: { coins: 320, gems: 15, crowns: 0 },
  3: { coins: 800, gems: 40, crowns: 1 },
};

/** A quick win: the winner needed at most this many stones. */
export const QUICK_WIN = 12;

/**
 * Chest tier: the opponent's strength sets the base, a quick win and a winning
 * streak of three or more each upgrade it once. Same-device games start at
 * common and can only earn the quick-win upgrade.
 */
export function chestTier(outcome: Outcome, streakAfter: number): TierId {
  let tier = 0;
  if (outcome.mode === 'ai' && outcome.brain) tier = brainInfo(outcome.brain).level;
  if (outcome.mode === 'online') tier = 1;
  if (outcome.reason === 'five' && outcome.winnerMoves <= QUICK_WIN) tier += 1;
  if (outcome.mode !== 'local' && streakAfter >= 3) tier += 1;
  return Math.max(0, Math.min(3, tier)) as TierId;
}

/** Decide what the result screen shows and what gets added to the profile. */
export function settle(outcome: Outcome, streakBefore: number): Settlement {
  const stoneName = (stone: Stone) => (stone === 1 ? '黑方' : '白方');
  const moves = `共 ${outcome.totalMoves} 手`;
  const how = outcome.reason === 'resign' ? '对手认输' : outcome.reason === 'disconnect' ? '对手离线' : `${outcome.winnerMoves} 步连成五子`;

  // The master played for you: the game counts for the master, not for your record or rewards.
  if (outcome.delegated && outcome.mode !== 'local') {
    const result = outcome.winner === null ? '神龙和对手下成平局' : outcome.winner === outcome.myStone ? '神龙替你赢了' : '神龙替你输了';
    return { kind: 'draw', delegated: true, rewards: { coins: 0, gems: 0, crowns: 0 }, headline: '托管局', detail: `${result} · ${moves} · 不计入战绩`, streak: streakBefore };
  }

  if (outcome.winner === null) {
    return { kind: 'draw', rewards: { coins: 30, gems: 0, crowns: 0 }, headline: '平局', detail: `${moves} · 棋盘已满`, streak: streakBefore };
  }

  // Same device: whoever won gets the chest, streaks are not tracked.
  if (outcome.mode === 'local') {
    const tier = chestTier(outcome, 0);
    return { kind: 'win', tier, rewards: CHEST_REWARDS[tier], headline: `${stoneName(outcome.winner)}胜利！`, detail: `${how} · ${moves}`, streak: streakBefore };
  }

  const won = outcome.winner === outcome.myStone;
  if (!won) {
    const who = outcome.mode === 'ai' && outcome.brain ? brainInfo(outcome.brain).name : outcome.opponentName ?? '对手';
    const why = outcome.reason === 'resign' ? '你认输了' : `${who}连成五子`;
    return { kind: 'loss', rewards: { coins: 20, gems: 0, crowns: 0 }, headline: '惜败', detail: `${why} · ${moves}`, streak: 0 };
  }

  const streak = streakBefore + 1;
  const tier = chestTier(outcome, streak);
  const beaten = outcome.mode === 'ai' && outcome.brain ? `击败${brainInfo(outcome.brain).name}` : `击败${outcome.opponentName ?? '好友'}`;
  const rewards = { ...CHEST_REWARDS[tier] };
  if (streak >= 3 && rewards.crowns === 0) rewards.crowns = 1;
  return { kind: 'win', tier, rewards, headline: '胜利！', detail: `${beaten} · ${how}${streak >= 2 ? ` · ${streak} 连胜` : ''}`, streak };
}

import { BRAINS, type BrainId } from '../src/gomoku/ai/brains';
import { BLACK, BOARD_SIZE, GomokuGame, opponent, type Stone, WHITE } from '../src/gomoku/rules';
import { LADDER_POINTS, ladderPoints } from '../src/result/ladder';
import type { CloudProgress } from '../src/profile/progress';
import type { User } from './auth';
import type { KV } from './kv';

/**
 * Players and the leaderboard. A submitted game is replayed move by move with
 * the real rules, so a "win" must be an actual five in a row by the player's
 * colour (or the opponent's resignation). The AI's moves cannot be proven to
 * come from the AI, since the game runs in the browser; the replay, the rate
 * limit and admin removal keep casual cheating out.
 */

export const TOP_SIZE = 50;
export const SUBMIT_INTERVAL_MS = 8000;
/** A resigned game counts only after this many moves. */
export const MIN_RESIGN_MOVES = 5;

export type Player = {
  userId: string;
  name: string;
  points: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
  bestStreak: number;
  updatedAt: number;
  lastSubmitAt: number;
  /** Keep periodic save synchronization from undoing an admin removal. */
  removed?: boolean;
  /** Recorded atomically with totals: retries and other devices cannot double-credit a game. */
  games?: Record<string, { result: 'win' | 'loss' | 'draw'; points: number; finishedAt: number; delegated?: boolean }>;
};

export type BoardEntry = Pick<Player, 'userId' | 'name' | 'points' | 'wins' | 'losses' | 'draws' | 'bestStreak'>;
/** One game in the master's public record, from the master's side. */
export type MasterGame = { kind: 'challenge' | 'takeover' | 'delegate'; result: 'win' | 'loss' | 'draw'; name: string | null; finishedAt: number };
/**
 * The master (神龙棋仙, on the board as 龙九段) as a virtual player: every game
 * it plays against a person, whether they challenged it, it took over a
 * departed online opponent, or it played for someone under 托管 (the delegator
 * gets nothing; their opponent keeps their own online result). Master against
 * master counts for nobody. Kept on the board document (plus a ranked entry) so
 * the board's version covers it.
 */
export type MasterRecord = {
  wins: number;
  losses: number;
  draws: number;
  points: number;
  streak: number;
  bestStreak: number;
  challenges: number;
  takeovers: number;
  delegated: number;
  recent: MasterGame[];
};
export const MASTER_RECENT = 10;
/** The master's entry on the ranked board; not a real user id (those are 24 hex digits). */
export const MASTER_ID = 'master';
export const MASTER_NAME = '龙九段';
export type Board = { version: number; updatedAt: number; entries: BoardEntry[]; master?: MasterRecord };

export type GameSubmission = {
  mode: 'ai' | 'online';
  brain?: BrainId;
  myStone: Stone;
  moves: Array<[number, number]>;
  /** Which colour resigned, if the game ended by resignation. */
  resigned?: Stone | null;
  /** The master played (some of) the player's moves (托管): the game is the master's, not the player's. */
  delegated?: boolean;
  /** The online opponent used 托管 too, so the master would be playing itself. */
  opponentDelegated?: boolean;
  /** The online opponent left and the master finished their side. */
  takeover?: boolean;
  /** The player lets the master's record show their name. */
  showName?: boolean;
};

export class BoardError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

/** Validate the shape of a submission from the client. */
export function parseSubmission(body: unknown): GameSubmission & { gameId: string; finishedAt: number } {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode = b.mode === 'ai' || b.mode === 'online' ? b.mode : null;
  const brain = BRAINS.some((info) => info.id === b.brain) ? (b.brain as BrainId) : undefined;
  const myStone = b.myStone === BLACK || b.myStone === WHITE ? (b.myStone as Stone) : null;
  const resigned = b.resigned === BLACK || b.resigned === WHITE ? (b.resigned as Stone) : null;
  const moves = Array.isArray(b.moves) ? b.moves : null;
  if (typeof b.gameId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(b.gameId)) {
    throw new BoardError(400, 'bad_request', '缺少有效的对局编号');
  }
  if (typeof b.finishedAt !== 'number' || !Number.isSafeInteger(b.finishedAt) || b.finishedAt <= 0) {
    throw new BoardError(400, 'bad_request', '对局时间不对');
  }
  if (!mode || !myStone || !moves || (mode === 'ai' && !brain)) throw new BoardError(400, 'bad_request', '对局数据不完整');
  if (moves.length > BOARD_SIZE * BOARD_SIZE) throw new BoardError(400, 'bad_request', '对局数据不对');
  const clean: Array<[number, number]> = [];
  for (const move of moves) {
    if (!Array.isArray(move) || move.length !== 2 || !move.every((n) => Number.isInteger(n) && n >= 0 && n < BOARD_SIZE)) {
      throw new BoardError(400, 'bad_request', '对局数据不对');
    }
    clean.push([move[0], move[1]]);
  }
  return { mode, brain, myStone, moves: clean, resigned, gameId: b.gameId, finishedAt: b.finishedAt, delegated: b.delegated === true, takeover: b.takeover === true, opponentDelegated: b.opponentDelegated === true, showName: b.showName === true };
}

/** Replay the game with the real rules and decide the player's result. */
export function judge(game: GameSubmission): 'win' | 'loss' | 'draw' {
  const replay = new GomokuGame();
  for (const [index, [x, y]] of game.moves.entries()) {
    const result = replay.play(x, y);
    if (result.kind === 'invalid') throw new BoardError(422, 'illegal_move', `第 ${index + 1} 手不合法`);
    if ((result.kind === 'win' || result.kind === 'draw') && index !== game.moves.length - 1) {
      throw new BoardError(422, 'moves_after_end', '对局结束后还有落子');
    }
  }
  if (replay.over) {
    if (replay.winner === null) return 'draw';
    return replay.winner === game.myStone ? 'win' : 'loss';
  }
  if (game.resigned) {
    // Both players must have acted, so an instant resign farm earns nothing. Colours are not
    // enough: under the RIF opening one player places the first three stones (both colours)
    // and, after a swap, the 4th too. By move 5 the other side has always played.
    if (replay.history.length < MIN_RESIGN_MOVES) throw new BoardError(422, 'too_short', '对局太短，不计入排行');
    return opponent(game.resigned) === game.myStone ? 'win' : 'loss';
  }
  throw new BoardError(422, 'unfinished', '对局还没有结束');
}

const emptyPlayer = (user: Pick<User, 'id' | 'name'>, now: number): Player => ({
  userId: user.id,
  name: user.name,
  points: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  streak: 0,
  bestStreak: 0,
  updatedAt: now,
  lastSubmitAt: 0,
});

const toEntry = (p: Player): BoardEntry => ({ userId: p.userId, name: p.name, points: p.points, wins: p.wins, losses: p.losses, draws: p.draws, bestStreak: p.bestStreak });

async function accountProgress(kv: KV, userId: string) {
  return (await kv.get<{ profile: CloudProgress }>(`profiles/${userId}`))?.value.profile;
}

/** The save already includes replayed games. Overlay totals; never add them to
 * verified results. Keep verified counts as a floor for older/offline clients
 * whose save upload has not arrived yet. Points still come only from replays. */
async function withAccountProgress(kv: KV, player: Player): Promise<Player> {
  const progress = await accountProgress(kv, player.userId);
  if (!progress) return player;
  return {
    ...player,
    wins: Math.max(player.wins, progress.wins),
    losses: Math.max(player.losses, progress.losses),
    draws: Math.max(player.draws, progress.draws),
    bestStreak: Math.max(player.bestStreak, progress.bestStreak),
    streak: progress.streak,
  };
}

function rankEntries(entries: BoardEntry[]) {
  return entries.sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)).slice(0, TOP_SIZE);
}

export async function readBoard(kv: KV): Promise<Board> {
  return (await kv.get<Board>('board'))?.value ?? { version: 0, updatedAt: 0, entries: [] };
}

/** Apply a change to the leaderboard document with optimistic concurrency. */
async function updateBoard(kv: KV, change: (entries: BoardEntry[]) => BoardEntry[] | Promise<BoardEntry[]>, now: number) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Board>('board');
    const board = current?.value ?? { version: 0, updatedAt: 0, entries: [] };
    const entries = rankEntries(await change(board.entries.map((e) => ({ ...e }))));
    if (JSON.stringify(entries) === JSON.stringify(board.entries)) return board;
    const next: Board = { ...board, version: board.version + 1, updatedAt: now, entries };
    const written = current ? await kv.set('board', next, { onlyIfMatch: current.etag }) : await kv.set('board', next, { onlyIfNew: true });
    if (written) return next;
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new BoardError(503, 'busy', '排行榜正忙，请稍后再试');
}

function rankOf(board: Board, userId: string) {
  const index = board.entries.findIndex((entry) => entry.userId === userId);
  return index === -1 ? null : index + 1;
}

export async function getPlayer(kv: KV, user: User) {
  const player = (await kv.get<Player>(`players/${user.id}`))?.value ?? null;
  const board = await readBoard(kv);
  return { player: player && !player.removed ? publicPlayer(await withAccountProgress(kv, player)) : null, rank: rankOf(board, user.id) };
}

function publicPlayer(player: Player) {
  const { games: _games, removed: _removed, ...stats } = player;
  return stats;
}

function publishPlayer(kv: KV, userId: string, now: number) {
  return updateBoard(kv, async (entries) => {
    const latest = (await kv.get<Player>(`players/${userId}`))?.value;
    const others = entries.filter((entry) => entry.userId !== userId);
    return latest && !latest.removed ? [...others, toEntry(await withAccountProgress(kv, latest))] : others;
  }, now);
}

/** Also runs on an empty save pull / board visit, so already-imported saves
 * become visible without reimporting or requiring another completed game. */
export async function syncPlayerProgress(kv: KV, user: User, now = Date.now()) {
  const progress = await accountProgress(kv, user.id);
  if (progress && progress.wins + progress.losses + progress.draws > 0) {
    await kv.set(`players/${user.id}`, emptyPlayer(user, now), { onlyIfNew: true });
  }
  return publishPlayer(kv, user.id, now);
}

function streaks(games: NonNullable<Player['games']>) {
  let streak = 0;
  let bestStreak = 0;
  // Offline devices can upload out of order. Use completion time, not upload order.
  const sorted = Object.entries(games).sort(([a, ga], [b, gb]) => ga.finishedAt - gb.finishedAt || a.localeCompare(b));
  for (const [, game] of sorted) {
    // 托管 games are the master's, not the player's.
    if (game.delegated) continue;
    if (game.result === 'win') streak += 1;
    else if (game.result === 'loss') streak = 0;
    bestStreak = Math.max(bestStreak, streak);
  }
  return { streak, bestStreak };
}

/** Record a verified game for the signed-in user and update the board. */
export async function submitGame(kv: KV, user: User, body: unknown, now = Date.now()) {
  const game = parseSubmission(body);
  const result = judge(game);
  const key = `players/${user.id}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Player>(key);
    const player = current?.value ?? emptyPlayer(user, now);
    const receipt = player.games?.[game.gameId];
    if (receipt) {
      // Also repairs the public board if a previous request saved the player
      // but lost its connection before publishing the board or returning a reply.
      let board = await publishPlayer(kv, user.id, now);
      // ...and the master's record, if that update failed last time.
      const masterGame = masterGameOf(game, receipt.result, user.name, receipt.finishedAt);
      if (masterGame) board = (await creditMaster(kv, game.gameId, masterGame, now)) ?? board;
      return { result: receipt.result, points: receipt.points, duplicate: true, player: publicPlayer(await withAccountProgress(kv, player)), rank: rankOf(board, user.id), version: board.version };
    }
    if (now - player.lastSubmitAt < SUBMIT_INTERVAL_MS) throw new BoardError(429, 'too_fast', '提交太频繁，稍后再试');
    // A 托管 game is still verified and receipted (no double submits) but earns the player nothing.
    const delegated = Boolean(game.delegated);
    const points = delegated ? 0 : ladderPoints(result, game.mode, game.brain);
    const counted = delegated ? null : result;
    const games = { ...player.games, [game.gameId]: { result, points, finishedAt: Math.min(game.finishedAt, now), ...(delegated ? { delegated } : {}) } };
    const { streak, bestStreak } = streaks(games);
    const next: Player = {
      ...player,
      name: user.name,
      points: player.points + points,
      wins: player.wins + (counted === 'win' ? 1 : 0),
      losses: player.losses + (counted === 'loss' ? 1 : 0),
      draws: player.draws + (counted === 'draw' ? 1 : 0),
      streak,
      bestStreak,
      games,
      updatedAt: now,
      lastSubmitAt: now,
      removed: false,
    };
    const written = current ? await kv.set(key, next, { onlyIfMatch: current.etag }) : await kv.set(key, next, { onlyIfNew: true });
    if (!written) continue;
    let board = await publishPlayer(kv, user.id, now);
    const masterGame = masterGameOf(game, result, user.name, Math.min(game.finishedAt, now));
    if (masterGame) board = (await creditMaster(kv, game.gameId, masterGame, now)) ?? board;
    return { result, points, duplicate: false, player: publicPlayer(await withAccountProgress(kv, next)), rank: rankOf(board, user.id), version: board.version };
  }
  throw new BoardError(503, 'busy', '请稍后再试');
}

const flip = { win: 'loss', loss: 'win', draw: 'draw' } as const;

/** The game as the master's record sees it, if the master took part. */
export function masterGameOf(game: GameSubmission, result: 'win' | 'loss' | 'draw', name: string, finishedAt: number): MasterGame | null {
  const shown = game.showName ? name : null;
  // The master on both sides (both 托管, or 托管 against a taken-over opponent) counts for nobody.
  if (game.delegated && (game.opponentDelegated || game.takeover)) return null;
  // 托管: the master played this player's side, so their result is its result. Only the
  // delegator's submission credits it; the opponent's own submission is an ordinary online game.
  if (game.delegated) return { kind: 'delegate', result, name: shown, finishedAt };
  // A challenge: the player beat (or lost to) the master.
  if (game.mode === 'ai' && game.brain === 'master') return { kind: 'challenge', result: flip[result], name: shown, finishedAt };
  // The master finished a departed online opponent's side against this player.
  // (A departed opponent never submits, so this cannot double-count their own 托管.)
  if (game.mode === 'online' && game.takeover) return { kind: 'takeover', result: flip[result], name: shown, finishedAt };
  return null;
}

/**
 * Add a game to the master's record exactly once per game id, even across
 * retries and concurrent duplicate submissions: a marker is claimed first and
 * released again if the record could not be updated, so a retry can finish it.
 * Returns null if the game was already credited.
 */
async function creditMaster(kv: KV, gameId: string, entry: MasterGame, now: number): Promise<Board | null> {
  const marker = `master-games/${gameId}`;
  if (!(await kv.set(marker, { at: now }, { onlyIfNew: true }))) return null;
  try {
    return await recordMaster(kv, entry, now);
  } catch (error) {
    await kv.delete(marker);
    throw error;
  }
}

async function recordMaster(kv: KV, entry: MasterGame, now: number): Promise<Board> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Board>('board');
    const board = current?.value ?? { version: 0, updatedAt: 0, entries: [] };
    const record: MasterRecord = { wins: 0, losses: 0, draws: 0, points: 0, streak: 0, bestStreak: 0, challenges: 0, takeovers: 0, delegated: 0, recent: [], ...board.master };
    const streak = entry.result === 'win' ? record.streak + 1 : entry.result === 'loss' ? 0 : record.streak;
    const master: MasterRecord = {
      wins: record.wins + (entry.result === 'win' ? 1 : 0),
      losses: record.losses + (entry.result === 'loss' ? 1 : 0),
      draws: record.draws + (entry.result === 'draw' ? 1 : 0),
      // Scored like the players it meets: a win is worth what beating it is worth.
      points: record.points + (entry.result === 'win' ? LADDER_POINTS.ai.master : entry.result === 'draw' ? LADDER_POINTS.draw : 0),
      streak,
      bestStreak: Math.max(record.bestStreak, streak),
      challenges: record.challenges + (entry.kind === 'challenge' ? 1 : 0),
      takeovers: record.takeovers + (entry.kind === 'takeover' ? 1 : 0),
      delegated: record.delegated + (entry.kind === 'delegate' ? 1 : 0),
      recent: [entry, ...record.recent].slice(0, MASTER_RECENT),
    };
    const row: BoardEntry = { userId: MASTER_ID, name: MASTER_NAME, points: master.points, wins: master.wins, losses: master.losses, draws: master.draws, bestStreak: master.bestStreak };
    const entries = rankEntries([...board.entries.filter((e) => e.userId !== MASTER_ID), row]);
    const next: Board = { ...board, version: board.version + 1, updatedAt: now, entries, master };
    const written = current ? await kv.set('board', next, { onlyIfMatch: current.etag }) : await kv.set('board', next, { onlyIfNew: true });
    if (written) return next;
    await new Promise((resolve) => setTimeout(resolve, 20 + Math.random() * 60 * (attempt + 1)));
  }
  throw new BoardError(503, 'busy', '排行榜正忙，请稍后再试');
}

/** Keep the player's board name in step with a rename. */
export async function renamePlayer(kv: KV, user: User, now = Date.now()) {
  const key = `players/${user.id}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Player>(key);
    if (!current) return;
    if (await kv.set(key, { ...current.value, name: user.name, updatedAt: now }, { onlyIfMatch: current.etag })) {
      await publishPlayer(kv, user.id, now);
      return;
    }
  }
  throw new BoardError(503, 'busy', '请稍后再试');
}

/** Admin: take a player off the board and reset their record. */
export async function removePlayer(kv: KV, userId: string, now = Date.now()) {
  const key = `players/${userId}`;
  for (let attempt = 0; attempt < 8; attempt++) {
    const current = await kv.get<Player>(key);
    const user = { id: userId, name: current?.value.name ?? '' };
    const next = { ...emptyPlayer(user, now), removed: true };
    if (await kv.set(key, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })) return publishPlayer(kv, userId, now);
  }
  throw new BoardError(503, 'busy', '请稍后再试');
}

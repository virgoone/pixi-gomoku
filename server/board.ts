import { BRAINS, type BrainId } from '../src/gomoku/ai/brains';
import { BLACK, BOARD_SIZE, GomokuGame, opponent, type Stone, WHITE } from '../src/gomoku/rules';
import { ladderPoints } from '../src/result/ladder';
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
};

export type BoardEntry = Pick<Player, 'userId' | 'name' | 'points' | 'wins' | 'losses' | 'draws' | 'bestStreak'>;
export type Board = { version: number; updatedAt: number; entries: BoardEntry[] };

export type GameSubmission = {
  mode: 'ai' | 'online';
  brain?: BrainId;
  myStone: Stone;
  moves: Array<[number, number]>;
  /** Which colour resigned, if the game ended by resignation. */
  resigned?: Stone | null;
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
export function parseSubmission(body: unknown): GameSubmission {
  const b = (body ?? {}) as Record<string, unknown>;
  const mode = b.mode === 'ai' || b.mode === 'online' ? b.mode : null;
  const brain = BRAINS.some((info) => info.id === b.brain) ? (b.brain as BrainId) : undefined;
  const myStone = b.myStone === BLACK || b.myStone === WHITE ? (b.myStone as Stone) : null;
  const resigned = b.resigned === BLACK || b.resigned === WHITE ? (b.resigned as Stone) : null;
  const moves = Array.isArray(b.moves) ? b.moves : null;
  if (!mode || !myStone || !moves || (mode === 'ai' && !brain)) throw new BoardError(400, 'bad_request', '对局数据不完整');
  if (moves.length > BOARD_SIZE * BOARD_SIZE) throw new BoardError(400, 'bad_request', '对局数据不对');
  const clean: Array<[number, number]> = [];
  for (const move of moves) {
    if (!Array.isArray(move) || move.length !== 2 || !move.every((n) => Number.isInteger(n) && n >= 0 && n < BOARD_SIZE)) {
      throw new BoardError(400, 'bad_request', '对局数据不对');
    }
    clean.push([move[0], move[1]]);
  }
  return { mode, brain, myStone, moves: clean, resigned };
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
    // Needs at least one move from each side so an instant resign farm earns nothing.
    if (replay.movesBy(BLACK) < 1 || replay.movesBy(WHITE) < 1) throw new BoardError(422, 'too_short', '对局太短，不计入排行');
    return opponent(game.resigned) === game.myStone ? 'win' : 'loss';
  }
  throw new BoardError(422, 'unfinished', '对局还没有结束');
}

const emptyPlayer = (user: User, now: number): Player => ({
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

function rankEntries(entries: BoardEntry[]) {
  return entries.sort((a, b) => b.points - a.points || b.wins - a.wins || a.losses - b.losses || a.name.localeCompare(b.name)).slice(0, TOP_SIZE);
}

export async function readBoard(kv: KV): Promise<Board> {
  return (await kv.get<Board>('board'))?.value ?? { version: 0, updatedAt: 0, entries: [] };
}

/** Apply a change to the leaderboard document with optimistic concurrency. */
async function updateBoard(kv: KV, change: (entries: BoardEntry[]) => BoardEntry[], now: number) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Board>('board');
    const board = current?.value ?? { version: 0, updatedAt: 0, entries: [] };
    const next: Board = { version: board.version + 1, updatedAt: now, entries: rankEntries(change(board.entries.map((e) => ({ ...e })))) };
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
  return { player, rank: rankOf(board, user.id) };
}

/** Record a verified game for the signed-in user and update the board. */
export async function submitGame(kv: KV, user: User, body: unknown, now = Date.now()) {
  const game = parseSubmission(body);
  const result = judge(game);
  const key = `players/${user.id}`;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const current = await kv.get<Player>(key);
    const player = current?.value ?? emptyPlayer(user, now);
    if (now - player.lastSubmitAt < SUBMIT_INTERVAL_MS) throw new BoardError(429, 'too_fast', '提交太频繁，稍后再试');
    const points = ladderPoints(result, game.mode, game.brain);
    const streak = result === 'win' ? player.streak + 1 : result === 'loss' ? 0 : player.streak;
    const next: Player = {
      ...player,
      name: user.name,
      points: player.points + points,
      wins: player.wins + (result === 'win' ? 1 : 0),
      losses: player.losses + (result === 'loss' ? 1 : 0),
      draws: player.draws + (result === 'draw' ? 1 : 0),
      streak,
      bestStreak: Math.max(player.bestStreak, streak),
      updatedAt: now,
      lastSubmitAt: now,
    };
    const written = current ? await kv.set(key, next, { onlyIfMatch: current.etag }) : await kv.set(key, next, { onlyIfNew: true });
    if (!written) continue;
    const board = await updateBoard(kv, (entries) => [...entries.filter((e) => e.userId !== user.id), toEntry(next)], now);
    return { result, points, player: next, rank: rankOf(board, user.id), version: board.version };
  }
  throw new BoardError(503, 'busy', '请稍后再试');
}

/** Keep the player's board name in step with a rename. */
export async function renamePlayer(kv: KV, user: User, now = Date.now()) {
  const key = `players/${user.id}`;
  const current = await kv.get<Player>(key);
  if (!current) return;
  await kv.set(key, { ...current.value, name: user.name, updatedAt: now });
  await updateBoard(kv, (entries) => entries.map((e) => (e.userId === user.id ? { ...e, name: user.name } : e)), now);
}

/** Admin: take a player off the board and reset their record. */
export async function removePlayer(kv: KV, userId: string, now = Date.now()) {
  await kv.delete(`players/${userId}`);
  return await updateBoard(kv, (entries) => entries.filter((e) => e.userId !== userId), now);
}

import { equivalentOffers } from '../opening';
import { forbiddenAt } from '../renju';
import { BLACK, type Board, cloneBoard, EMPTY, opponent, type Point, type Rule, set, sizeOf, type Stone, WHITE, winningLine } from '../rules';
import { candidateMoves, evaluatePoint, type RankedMove, rankMoves, SCORE } from './patterns';

export type BrainId = 'sprout' | 'fox' | 'owl' | 'master';

export type BrainInfo = {
  id: BrainId;
  name: string;
  title: string;
  description: string;
  /** Used for the result chest tier: harder opponents give better chests. */
  level: 0 | 1 | 2 | 3;
};

export const BRAINS: BrainInfo[] = [
  { id: 'sprout', name: '豆芽', title: '入门', description: '刚学会下棋，偶尔会看漏你的活三。', level: 0 },
  { id: 'fox', name: '狐狸阿明', title: '进阶', description: '攻守兼顾，不会放过明显的机会。', level: 1 },
  { id: 'owl', name: '猫头鹰棋圣', title: '高手', description: '会往后推演几步，喜欢做双杀。', level: 2 },
  // Played by the Rapfi engine (master.ts); the heuristics below stand in only if it fails.
  { id: 'master', name: '神龙棋仙', title: '大师', description: '由开源引擎 Rapfi 执棋，几乎不失误。', level: 3 },
];

export function brainInfo(id: BrainId) {
  return BRAINS.find((brain) => brain.id === id) ?? BRAINS[0];
}

type Random = () => number;

/** Whether `stone` may play at `point` under `rule` (renju forbids some points to black). */
function legal(board: Board, point: Point, stone: Stone, rule: Rule) {
  return rule !== 'renju' || stone !== BLACK || forbiddenAt(board, point.x, point.y) === null;
}

/** The first `count` legal moves of a ranked list, checking only as far as needed. */
function legalMoves(board: Board, ranked: RankedMove[], stone: Stone, rule: Rule, count = ranked.length) {
  const moves: RankedMove[] = [];
  for (const move of ranked) {
    if (moves.length >= count) break;
    if (legal(board, move, stone, rule)) moves.push(move);
  }
  return moves;
}

/** Win now if possible, otherwise block the opponent's immediate five. */
function forcedMove(board: Board, stone: Stone, rule: Rule): Point | null {
  const candidates = candidateMoves(board, 1);
  for (const point of candidates) {
    if (evaluatePoint(board, point.x, point.y, stone).score >= SCORE.FIVE && legal(board, point, stone, rule)) return point;
  }
  // No need to block a five the opponent is not allowed to play, and no way to
  // block one on a point we are not allowed to play ourselves.
  const other = opponent(stone);
  for (const point of candidates) {
    if (evaluatePoint(board, point.x, point.y, other).score >= SCORE.FIVE && legal(board, point, other, rule) && legal(board, point, stone, rule)) return point;
  }
  return null;
}

/** Sprout: takes a win and blocks a five, otherwise picks loosely from good moves. */
function sproutMove(board: Board, stone: Stone, random: Random, rule: Rule): Point {
  const forced = forcedMove(board, stone, rule);
  if (forced) return forced;
  const ranked = legalMoves(board, rankMoves(board, stone, 0.55), stone, rule, 6);
  // Sometimes it simply does not notice an open four being built.
  const pool = ranked.slice(0, Math.min(6, ranked.length));
  const pick = pool[Math.floor(Math.pow(random(), 1.6) * pool.length)] ?? ranked[0];
  return pick;
}

/** Fox: one-ply greedy on attack + defence with light noise among near-equal moves. */
function foxMove(board: Board, stone: Stone, random: Random, rule: Rule): Point {
  const forced = forcedMove(board, stone, rule);
  if (forced) return forced;
  const ranked = legalMoves(board, rankMoves(board, stone, 0.95), stone, rule, 3);
  const best = ranked[0];
  const close = ranked.filter((move) => move.score >= best.score * 0.92).slice(0, 3);
  return close[Math.floor(random() * close.length)] ?? best;
}

/** Whole-position heuristic from `stone`'s point of view. */
function evaluateBoard(board: Board, stone: Stone) {
  const other = opponent(stone);
  let mine = 0;
  let theirs = 0;
  for (const point of candidateMoves(board, 1)) {
    mine = Math.max(mine, evaluatePoint(board, point.x, point.y, stone).score);
    theirs = Math.max(theirs, evaluatePoint(board, point.x, point.y, other).score);
  }
  return mine - theirs * 1.1;
}

/** Owl: alpha-beta over the top candidates, iterative deepening within a time budget. */
function owlMove(board: Board, stone: Stone, rule: Rule, budgetMs = 900): Point {
  const forced = forcedMove(board, stone, rule);
  if (forced) return forced;

  const work = cloneBoard(board);
  const started = Date.now();
  let timedOut = false;
  const width = 9;

  function search(depth: number, toMove: Stone, alpha: number, beta: number): number {
    if (Date.now() - started > budgetMs) {
      timedOut = true;
      return evaluateBoard(work, stone);
    }
    if (depth === 0) return evaluateBoard(work, stone);
    const moves = legalMoves(work, rankMoves(work, toMove, 1), toMove, rule, width);
    if (moves.length === 0) return 0;
    const maximizing = toMove === stone;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      set(work, move.x, move.y, toMove);
      let value: number;
      if (winningLine(work, move.x, move.y, toMove, rule)) {
        value = (maximizing ? 1 : -1) * (SCORE.FIVE * 10 + depth);
      } else {
        value = search(depth - 1, opponent(toMove), alpha, beta);
      }
      set(work, move.x, move.y, EMPTY);
      if (maximizing) {
        best = Math.max(best, value);
        alpha = Math.max(alpha, value);
      } else {
        best = Math.min(best, value);
        beta = Math.min(beta, value);
      }
      if (beta <= alpha || timedOut) break;
    }
    return best;
  }

  const roots = legalMoves(work, rankMoves(work, stone, 1), stone, rule, 12);
  let bestMove: Point = roots[0];
  for (let depth = 2; depth <= 5; depth += 1) {
    let depthBest: Point | null = null;
    let depthScore = -Infinity;
    for (const move of roots) {
      set(work, move.x, move.y, stone);
      const value = winningLine(work, move.x, move.y, stone, rule)
        ? SCORE.FIVE * 100
        : search(depth - 1, opponent(stone), -Infinity, Infinity);
      set(work, move.x, move.y, EMPTY);
      if (timedOut) break;
      // Tie-break toward the stronger static move so play stays natural.
      const tieBreak = move.score / 1e9;
      if (value + tieBreak > depthScore) {
        depthScore = value + tieBreak;
        depthBest = move;
      }
    }
    if (timedOut) break;
    if (depthBest) bestMove = depthBest;
    if (depthScore >= SCORE.FIVE * 10) break;
  }
  return bestMove;
}

export function chooseMove(id: BrainId, board: Board, stone: Stone, random: Random = Math.random, rule: Rule = 'freestyle'): Point {
  // 'master' reaches here only as a stand-in when its engine is unavailable.
  const move: Point | undefined = id === 'sprout' ? sproutMove(board, stone, random, rule) : id === 'fox' ? foxMove(board, stone, random, rule) : owlMove(board, stone, rule);
  if (move) return { x: move.x, y: move.y };
  // Every nearby point is forbidden (renju): take any legal point on the board.
  const size = sizeOf(board);
  for (let index = 0; index < board.length; index += 1) {
    const point = { x: index % size, y: Math.floor(index / size) };
    if (board[index] === EMPTY && legal(board, point, stone, rule)) return point;
  }
  return { x: 0, y: 0 };
}

// ---- RIF opening decisions (heuristic brains; the master asks its engine instead) ------

/** The tentative white, with white to move after three stones: true to swap and take black. */
export function heuristicSwap(board: Board, random: Random = Math.random): boolean {
  const score = evaluateBoard(board, BLACK);
  return score > 0 || (score === 0 && random() < 0.5);
}

/** Two 5th moves for black that are not symmetric to each other, `first` (or the best) first. */
export function heuristicOffers(board: Board, rule: Rule, first?: Point): Point[] {
  const ranked = legalMoves(board, rankMoves(board, BLACK, 0.9), BLACK, rule);
  const a = first ?? ranked[0];
  if (!a) return [];
  const b = ranked.find((move) => !(move.x === a.x && move.y === a.y) && !equivalentOffers(board, a, move));
  return b ? [{ x: a.x, y: a.y }, { x: b.x, y: b.y }] : [{ x: a.x, y: a.y }];
}

/** White keeps the offered 5th move that leaves the position best for white. */
export function heuristicChoose(board: Board, offers: Point[]): Point {
  let best = offers[0];
  let bestScore = -Infinity;
  for (const offer of offers) {
    const work = cloneBoard(board);
    set(work, offer.x, offer.y, BLACK);
    const score = evaluateBoard(work, WHITE);
    if (score > bestScore) {
      bestScore = score;
      best = offer;
    }
  }
  return best;
}

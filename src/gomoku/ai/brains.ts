import { type Board, cloneBoard, EMPTY, opponent, type Point, set, type Stone, winningLine } from '../rules';
import { candidateMoves, evaluatePoint, rankMoves, SCORE } from './patterns';

export type BrainId = 'sprout' | 'fox' | 'owl';

export type BrainInfo = {
  id: BrainId;
  name: string;
  title: string;
  description: string;
  /** Used for the result chest tier: harder opponents give better chests. */
  level: 0 | 1 | 2;
};

export const BRAINS: BrainInfo[] = [
  { id: 'sprout', name: '豆芽', title: '入门', description: '刚学会下棋，偶尔会看漏你的活三。', level: 0 },
  { id: 'fox', name: '狐狸阿明', title: '进阶', description: '攻守兼顾，不会放过明显的机会。', level: 1 },
  { id: 'owl', name: '猫头鹰棋圣', title: '大师', description: '会往后推演几步，喜欢做双杀。', level: 2 },
];

export function brainInfo(id: BrainId) {
  return BRAINS.find((brain) => brain.id === id) ?? BRAINS[0];
}

type Random = () => number;

/** Win now if possible, otherwise block the opponent's immediate five. */
function forcedMove(board: Board, stone: Stone): Point | null {
  const candidates = candidateMoves(board, 1);
  for (const point of candidates) {
    if (evaluatePoint(board, point.x, point.y, stone).score >= SCORE.FIVE) return point;
  }
  const other = opponent(stone);
  for (const point of candidates) {
    if (evaluatePoint(board, point.x, point.y, other).score >= SCORE.FIVE) return point;
  }
  return null;
}

/** Sprout: takes a win and blocks a five, otherwise picks loosely from good moves. */
function sproutMove(board: Board, stone: Stone, random: Random): Point {
  const forced = forcedMove(board, stone);
  if (forced) return forced;
  const ranked = rankMoves(board, stone, 0.55);
  // Sometimes it simply does not notice an open four being built.
  const pool = ranked.slice(0, Math.min(6, ranked.length));
  const pick = pool[Math.floor(Math.pow(random(), 1.6) * pool.length)] ?? ranked[0];
  return pick;
}

/** Fox: one-ply greedy on attack + defence with light noise among near-equal moves. */
function foxMove(board: Board, stone: Stone, random: Random): Point {
  const forced = forcedMove(board, stone);
  if (forced) return forced;
  const ranked = rankMoves(board, stone, 0.95);
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
function owlMove(board: Board, stone: Stone, budgetMs = 900): Point {
  const forced = forcedMove(board, stone);
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
    const moves = rankMoves(work, toMove, 1).slice(0, width);
    if (moves.length === 0) return 0;
    const maximizing = toMove === stone;
    let best = maximizing ? -Infinity : Infinity;
    for (const move of moves) {
      set(work, move.x, move.y, toMove);
      let value: number;
      if (winningLine(work, move.x, move.y, toMove)) {
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

  const roots = rankMoves(work, stone, 1).slice(0, 12);
  let bestMove: Point = roots[0];
  for (let depth = 2; depth <= 5; depth += 1) {
    let depthBest: Point | null = null;
    let depthScore = -Infinity;
    for (const move of roots) {
      set(work, move.x, move.y, stone);
      const value = winningLine(work, move.x, move.y, stone)
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

export function chooseMove(id: BrainId, board: Board, stone: Stone, random: Random = Math.random): Point {
  const move = id === 'sprout' ? sproutMove(board, stone, random) : id === 'fox' ? foxMove(board, stone, random) : owlMove(board, stone);
  return { x: move.x, y: move.y };
}

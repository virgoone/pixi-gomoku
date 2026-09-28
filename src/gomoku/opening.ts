import { BLACK, type Board, EMPTY, type Point, type Rule, sizeOf } from './rules';

/**
 * RIF opening for renju: 三手交换 · 五手两打.
 *   1. The tentative black places the first three stones (black, white, black):
 *      move 1 on the centre, move 2 within the centre 3×3, move 3 within the 5×5.
 *   2. The tentative white may swap colours.
 *   3. White plays move 4 anywhere.
 *   4. Black offers two 5th moves that are not symmetric to each other; white
 *      keeps one (the other is dropped) and then plays move 6. Play is normal
 *      from there on.
 * Only the kept 5th move is ever played, so the move list stays an ordinary
 * alternating game (the leaderboard replay needs nothing new).
 */

export type Opening = 'free' | 'rif';
export const OPENING_NAMES: Record<Opening, string> = { free: '自由开局', rif: '三手交换 · 五手两打' };

/** The three rule choices offered in the menus, in the order a toggle cycles through them. */
export type Variant = { rule: Rule; opening: Opening };
export const VARIANTS: Variant[] = [
  { rule: 'freestyle', opening: 'free' },
  { rule: 'renju', opening: 'free' },
  { rule: 'renju', opening: 'rif' },
];

/** The RIF opening only exists with renju; anything else collapses to a free opening. */
/** Every menu starts on free-style; renju and the RIF opening are opted into each time. */
export const DEFAULT_VARIANT: Variant = VARIANTS[0];

export function normalizeVariant(rule: Rule, opening: Opening | undefined): Variant {
  return { rule, opening: rule === 'renju' && opening === 'rif' ? 'rif' : 'free' };
}

export function nextVariant(current: Variant): Variant {
  const index = VARIANTS.findIndex((v) => v.rule === current.rule && v.opening === current.opening);
  return VARIANTS[(index + 1) % VARIANTS.length];
}

/** Short name, e.g. for a toggle: 无禁手 / 连珠 / 连珠 · 三手交换五手两打. */
export function variantName(variant: Variant) {
  if (variant.rule === 'freestyle') return '无禁手';
  return variant.opening === 'rif' ? '连珠 · 三手交换五手两打' : '连珠';
}

export type OpeningPhase =
  /** The tentative black is placing move 1–3. */
  | 'place'
  /** The tentative white decides whether to swap colours. */
  | 'swap'
  /** White plays move 4, or anyone plays after the opening: normal turns. */
  | 'play'
  /** Black is picking two candidate 5th moves. */
  | 'offer'
  /** White keeps one of the two offers. */
  | 'choose';

export type OpeningState = { swapDecided: boolean; offers: Point[] };

export const freshOpening = (): OpeningState => ({ swapDecided: false, offers: [] });

/** Where the game stands, from the number of moves played and the opening decisions so far. */
export function openingPhase(opening: Opening, moves: number, state: OpeningState): OpeningPhase {
  if (opening !== 'rif') return 'play';
  if (moves < 3) return 'place';
  if (moves === 3 && !state.swapDecided) return 'swap';
  if (moves === 4) return state.offers.length === 2 ? 'choose' : 'offer';
  return 'play';
}

/** Chebyshev radius around the centre that move `index` (0-based) must stay within, or null. */
export function openingRadius(index: number): number | null {
  return index === 0 ? 0 : index === 1 ? 1 : index === 2 ? 2 : null;
}

export function inOpeningZone(board: Board, index: number, point: Point) {
  const radius = openingRadius(index);
  if (radius === null) return true;
  const center = Math.floor(sizeOf(board) / 2);
  return Math.abs(point.x - center) <= radius && Math.abs(point.y - center) <= radius;
}

/** The eight symmetries of the square board around its centre. */
function transforms(size: number): Array<(p: Point) => Point> {
  const m = size - 1;
  return [
    (p) => ({ x: p.x, y: p.y }),
    (p) => ({ x: m - p.x, y: p.y }),
    (p) => ({ x: p.x, y: m - p.y }),
    (p) => ({ x: m - p.x, y: m - p.y }),
    (p) => ({ x: p.y, y: p.x }),
    (p) => ({ x: m - p.y, y: p.x }),
    (p) => ({ x: p.y, y: m - p.x }),
    (p) => ({ x: m - p.y, y: m - p.x }),
  ];
}

/**
 * Whether black playing `a` or `b` gives the same position up to rotation or
 * reflection. RIF forbids offering two such 5th moves.
 */
export function equivalentOffers(board: Board, a: Point, b: Point) {
  if (a.x === b.x && a.y === b.y) return true;
  const size = sizeOf(board);
  const withA = new Uint8Array(board);
  withA[a.y * size + a.x] = BLACK;
  const withB = new Uint8Array(board);
  withB[b.y * size + b.x] = BLACK;
  return transforms(size).some((t) => {
    for (let index = 0; index < withA.length; index += 1) {
      const cell = withA[index];
      if (cell === EMPTY) continue;
      const q = t({ x: index % size, y: Math.floor(index / size) });
      if (withB[q.y * size + q.x] !== cell) return false;
    }
    return true;
  });
}

/** A random point for opening move `index` (0–2), for an AI placing the first three stones. */
export function randomOpeningMove(board: Board, index: number, random: () => number = Math.random): Point {
  const size = sizeOf(board);
  const center = Math.floor(size / 2);
  const radius = openingRadius(index) ?? 2;
  const free: Point[] = [];
  for (let y = center - radius; y <= center + radius; y += 1) {
    for (let x = center - radius; x <= center + radius; x += 1) {
      if (board[y * size + x] === EMPTY) free.push({ x, y });
    }
  }
  return free[Math.floor(random() * free.length)] ?? { x: center, y: center };
}

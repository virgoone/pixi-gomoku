import { type Board, DIRECTIONS, EMPTY, inBounds, type Point, sizeOf, type Stone } from '../rules';

/**
 * Pattern scoring for a single hypothetical move. For each of the four lines
 * through the point we read nine cells (the point in the middle) as a string:
 *   x = our stone, o = opponent or edge, _ = empty
 * and score the strongest shape that includes the centre.
 */

export const SCORE = {
  FIVE: 10_000_000,
  OPEN_FOUR: 1_000_000,
  FOUR: 100_000,
  OPEN_THREE: 12_000,
  THREE: 1_500,
  OPEN_TWO: 900,
  TWO: 120,
  ONE: 10,
} as const;

type Shape = keyof typeof SCORE;

const SHAPES: Array<[Shape, string[]]> = [
  ['FIVE', ['xxxxx']],
  ['OPEN_FOUR', ['_xxxx_']],
  ['FOUR', ['xxxx_', '_xxxx', 'xxx_x', 'x_xxx', 'xx_xx']],
  ['OPEN_THREE', ['__xxx_', '_xxx__', '_xx_x_', '_x_xx_']],
  ['THREE', ['xxx__', '__xxx', 'xx_x_', '_x_xx', 'x_xx_', '_xx_x', 'x__xx', 'xx__x', 'x_x_x', '_xxx_']],
  ['OPEN_TWO', ['__xx__', '_xx___', '___xx_', '_x_x__', '__x_x_', '_x__x_']],
  ['TWO', ['xx___', '___xx', '_x_x_', 'x_x__', '__x_x', 'x__x_', '_x__x', 'x___x']],
  ['ONE', ['__x__', '_x___', '___x_']],
];

const CENTER = 4;

function lineString(board: Board, x: number, y: number, dx: number, dy: number, stone: Stone) {
  const size = sizeOf(board);
  let text = '';
  for (let offset = -4; offset <= 4; offset += 1) {
    const nx = x + dx * offset;
    const ny = y + dy * offset;
    if (offset === 0) {
      text += 'x';
    } else if (!inBounds(size, nx, ny)) {
      text += 'o';
    } else {
      const cell = board[ny * size + nx];
      text += cell === EMPTY ? '_' : cell === stone ? 'x' : 'o';
    }
  }
  return text;
}

function bestShape(text: string): Shape | null {
  for (const [shape, patterns] of SHAPES) {
    for (const pattern of patterns) {
      let from = text.indexOf(pattern);
      while (from !== -1) {
        if (from <= CENTER && CENTER < from + pattern.length && pattern[CENTER - from] === 'x') return shape;
        from = text.indexOf(pattern, from + 1);
      }
    }
  }
  return null;
}

export type PointEval = { score: number; shapes: Shape[] };

/** How good it would be for `stone` to play at (x, y). The cell must be empty. */
export function evaluatePoint(board: Board, x: number, y: number, stone: Stone): PointEval {
  const shapes: Shape[] = [];
  let score = 0;
  for (const [dx, dy] of DIRECTIONS) {
    const shape = bestShape(lineString(board, x, y, dx, dy, stone));
    if (shape) {
      shapes.push(shape);
      score += SCORE[shape];
    }
  }
  // Combinations that win by force.
  const fours = shapes.filter((shape) => shape === 'FOUR' || shape === 'OPEN_FOUR').length;
  const threes = shapes.filter((shape) => shape === 'OPEN_THREE').length;
  if (fours >= 2 || (fours >= 1 && threes >= 1)) score += SCORE.OPEN_FOUR;
  else if (threes >= 2) score += SCORE.FOUR * 2;
  return { score, shapes };
}

/** Empty cells within `radius` of any stone; the centre on an empty board. */
export function candidateMoves(board: Board, radius = 2): Point[] {
  const size = sizeOf(board);
  const marks = new Uint8Array(board.length);
  let any = false;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (board[y * size + x] === EMPTY) continue;
      any = true;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (inBounds(size, nx, ny) && board[ny * size + nx] === EMPTY) marks[ny * size + nx] = 1;
        }
      }
    }
  }
  const center = Math.floor(size / 2);
  if (!any) return [{ x: center, y: center }];
  const points: Point[] = [];
  for (let index = 0; index < marks.length; index += 1) {
    if (marks[index]) points.push({ x: index % size, y: Math.floor(index / size) });
  }
  return points;
}

export type RankedMove = Point & { attack: number; defense: number; score: number };

/** Candidates ranked by attack plus weighted defence, best first. */
export function rankMoves(board: Board, stone: Stone, defenseWeight = 0.9): RankedMove[] {
  const other: Stone = stone === 1 ? 2 : 1;
  return candidateMoves(board)
    .map((point) => {
      const attack = evaluatePoint(board, point.x, point.y, stone).score;
      const defense = evaluatePoint(board, point.x, point.y, other).score;
      return { ...point, attack, defense, score: attack + defense * defenseWeight };
    })
    .sort((a, b) => b.score - a.score);
}

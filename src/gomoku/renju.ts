import { BLACK, type Board, DIRECTIONS, EMPTY, inBounds, type Point, type Rule, sizeOf } from './rules';

/**
 * Renju forbidden points (RIF rules, 15×15). Only black is restricted:
 *   - overline: six or more in a row;
 *   - double-four: one move makes two or more fours;
 *   - double-three: one move makes two or more real threes.
 * A move that makes an exact five is never forbidden, even if it also makes
 * any of the above. A three is only real if some empty point turns it into a
 * straight four and that point is not itself forbidden, so the check recurses
 * (every level places one more stone, which keeps it bounded).
 *
 * Differentially tested against Rapfi's `checkForbiddenPoint` (YXSHOWFORBID)
 * on ~40k forbidden points; tests/fixtures/renju-rapfi.json keeps a sample.
 * One known difference, where this follows the RIF wording: when the point that
 * turns a three into a straight four also makes a five elsewhere, Rapfi does
 * not count that three (it classifies the point as a five), while here it
 * counts. It only arises when black already has an unanswered four.
 */

export type Forbidden = 'overline' | 'double-four' | 'double-three';

export const RULE_NAMES: Record<Rule, string> = { freestyle: '无禁手', renju: '连珠' };
export const FORBIDDEN_NAMES: Record<Forbidden, string> = { overline: '长连', 'double-four': '四四', 'double-three': '三三' };

/** Black stones in a row through (x, y), counting (x, y) itself as black. */
function runLength(board: Board, size: number, x: number, y: number, dx: number, dy: number) {
  let length = 1;
  for (let step = 1; ; step += 1) {
    const nx = x + dx * step;
    const ny = y + dy * step;
    if (!inBounds(size, nx, ny) || board[ny * size + nx] !== BLACK) break;
    length += 1;
  }
  for (let step = 1; ; step += 1) {
    const nx = x - dx * step;
    const ny = y - dy * step;
    if (!inBounds(size, nx, ny) || board[ny * size + nx] !== BLACK) break;
    length += 1;
  }
  return length;
}

/**
 * Offsets along (dx, dy) of the empty points that would give black an exact
 * five containing the black stone at (x, y).
 */
function fiveSpots(board: Board, size: number, x: number, y: number, dx: number, dy: number) {
  const spots: number[] = [];
  for (let offset = -4; offset <= 4; offset += 1) {
    if (offset === 0) continue;
    const qx = x + dx * offset;
    const qy = y + dy * offset;
    if (!inBounds(size, qx, qy) || board[qy * size + qx] !== EMPTY) continue;
    // Every cell strictly between q and (x, y) must be black, or the five would not contain it.
    let joined = true;
    for (let step = 1; step < Math.abs(offset); step += 1) {
      const k = Math.sign(offset) * step;
      if (board[(y + dy * k) * size + (x + dx * k)] !== BLACK) {
        joined = false;
        break;
      }
    }
    if (joined && runLength(board, size, qx, qy, dx, dy) === 5) spots.push(offset);
  }
  return spots;
}

/** Fours in one line through a black stone: an open four counts once, a split double-four twice. */
function foursInLine(spots: number[]) {
  if (spots.length === 2 && Math.abs(spots[0] - spots[1]) === 5) return 1;
  return spots.length;
}

function isStraightFour(spots: number[]) {
  return spots.length === 2 && Math.abs(spots[0] - spots[1]) === 5;
}

/** Why black may not play at (x, y), or null if it may. The cell must be empty. */
export function forbiddenAt(board: Board, x: number, y: number): Forbidden | null {
  const size = sizeOf(board);
  const index = y * size + x;
  if (board[index] !== EMPTY) return null;
  // Forbidden shapes need black stones nearby; skip the recursion for lone points.
  if (!hasBlackNeighbours(board, size, x, y)) return null;

  board[index] = BLACK;
  try {
    let overline = false;
    for (const [dx, dy] of DIRECTIONS) {
      const length = runLength(board, size, x, y, dx, dy);
      if (length === 5) return null;
      if (length > 5) overline = true;
    }
    if (overline) return 'overline';

    let fours = 0;
    const fourLines: boolean[] = [];
    for (const [dx, dy] of DIRECTIONS) {
      const count = foursInLine(fiveSpots(board, size, x, y, dx, dy));
      fours += count;
      fourLines.push(count > 0);
    }
    if (fours >= 2) return 'double-four';

    let threes = 0;
    DIRECTIONS.forEach(([dx, dy], dir) => {
      if (threes >= 2 || fourLines[dir]) return;
      if (isRealThree(board, size, x, y, dx, dy)) threes += 1;
    });
    return threes >= 2 ? 'double-three' : null;
  } finally {
    board[index] = EMPTY;
  }
}

/** Whether the black stone at (x, y) forms a three along (dx, dy) that can become a legal straight four. */
function isRealThree(board: Board, size: number, x: number, y: number, dx: number, dy: number) {
  for (let offset = -4; offset <= 4; offset += 1) {
    if (offset === 0) continue;
    const qx = x + dx * offset;
    const qy = y + dy * offset;
    if (!inBounds(size, qx, qy)) continue;
    const q = qy * size + qx;
    if (board[q] !== EMPTY) continue;
    board[q] = BLACK;
    const straight = isStraightFour(fiveSpots(board, size, x, y, dx, dy));
    board[q] = EMPTY;
    if (straight && forbiddenAt(board, qx, qy) === null) return true;
  }
  return false;
}

function hasBlackNeighbours(board: Board, size: number, x: number, y: number) {
  let seen = 0;
  for (const [dx, dy] of DIRECTIONS) {
    for (let step = -4; step <= 4; step += 1) {
      if (step === 0) continue;
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (inBounds(size, nx, ny) && board[ny * size + nx] === BLACK) seen += 1;
    }
  }
  // A double-three needs four other black stones; a four-four or overline at least three.
  return seen >= 3;
}

/** Every forbidden point for black on this board. */
export function forbiddenPoints(board: Board): Array<Point & { reason: Forbidden }> {
  const size = sizeOf(board);
  const points: Array<Point & { reason: Forbidden }> = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const reason = forbiddenAt(board, x, y);
      if (reason) points.push({ x, y, reason });
    }
  }
  return points;
}

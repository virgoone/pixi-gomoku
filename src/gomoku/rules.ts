/** 15×15 free-style gomoku: black moves first, five or more in a row wins. */

export const BOARD_SIZE = 15;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export type Stone = typeof BLACK | typeof WHITE;
export type Cell = typeof EMPTY | Stone;
export type Point = { x: number; y: number };
export type Board = Uint8Array;

export const DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
];

export function createBoard(size = BOARD_SIZE): Board {
  return new Uint8Array(size * size);
}

export function cloneBoard(board: Board): Board {
  return new Uint8Array(board);
}

export function sizeOf(board: Board) {
  return Math.round(Math.sqrt(board.length));
}

export function inBounds(size: number, x: number, y: number) {
  return x >= 0 && y >= 0 && x < size && y < size;
}

export function get(board: Board, x: number, y: number): Cell {
  const size = sizeOf(board);
  return inBounds(size, x, y) ? (board[y * size + x] as Cell) : EMPTY;
}

export function set(board: Board, x: number, y: number, value: Cell) {
  board[y * sizeOf(board) + x] = value;
}

export function opponent(stone: Stone): Stone {
  return stone === BLACK ? WHITE : BLACK;
}

export function isEmpty(board: Board, x: number, y: number) {
  const size = sizeOf(board);
  return inBounds(size, x, y) && board[y * size + x] === EMPTY;
}

export function isFull(board: Board) {
  return board.every((cell) => cell !== EMPTY);
}

export function stoneCount(board: Board) {
  let count = 0;
  for (const cell of board) if (cell !== EMPTY) count += 1;
  return count;
}

/**
 * The winning line through (x, y) for `stone`, or null. Returns every stone in
 * the run (five or more), ordered from one end to the other.
 */
export function winningLine(board: Board, x: number, y: number, stone: Stone): Point[] | null {
  const size = sizeOf(board);
  for (const [dx, dy] of DIRECTIONS) {
    const line: Point[] = [{ x, y }];
    for (let step = 1; ; step += 1) {
      const nx = x + dx * step;
      const ny = y + dy * step;
      if (!inBounds(size, nx, ny) || board[ny * size + nx] !== stone) break;
      line.push({ x: nx, y: ny });
    }
    for (let step = 1; ; step += 1) {
      const nx = x - dx * step;
      const ny = y - dy * step;
      if (!inBounds(size, nx, ny) || board[ny * size + nx] !== stone) break;
      line.unshift({ x: nx, y: ny });
    }
    if (line.length >= 5) return line;
  }
  return null;
}

export type MoveResult =
  | { kind: 'invalid' }
  | { kind: 'placed' }
  | { kind: 'win'; line: Point[] }
  | { kind: 'draw' };

/** Game state with history; the single source of truth for every mode. */
export class GomokuGame {
  readonly size: number;
  board: Board;
  turn: Stone = BLACK;
  history: Array<Point & { stone: Stone }> = [];
  winner: Stone | null = null;
  winLine: Point[] | null = null;
  over = false;

  constructor(size = BOARD_SIZE) {
    this.size = size;
    this.board = createBoard(size);
  }

  get lastMove() {
    return this.history.at(-1) ?? null;
  }

  movesBy(stone: Stone) {
    return this.history.filter((move) => move.stone === stone).length;
  }

  play(x: number, y: number): MoveResult {
    if (this.over || !isEmpty(this.board, x, y)) return { kind: 'invalid' };
    const stone = this.turn;
    set(this.board, x, y, stone);
    this.history.push({ x, y, stone });
    const line = winningLine(this.board, x, y, stone);
    if (line) {
      this.over = true;
      this.winner = stone;
      this.winLine = line;
      return { kind: 'win', line };
    }
    if (isFull(this.board)) {
      this.over = true;
      return { kind: 'draw' };
    }
    this.turn = opponent(stone);
    return { kind: 'placed' };
  }

  /** Remove the last `count` moves. Returns the removed moves, newest first. */
  undo(count = 1) {
    const removed: Array<Point & { stone: Stone }> = [];
    for (let index = 0; index < count && this.history.length > 0; index += 1) {
      const move = this.history.pop();
      if (!move) break;
      set(this.board, move.x, move.y, EMPTY);
      removed.push(move);
      this.turn = move.stone;
    }
    this.over = false;
    this.winner = null;
    this.winLine = null;
    return removed;
  }

  /** The side to move gives up. */
  resign() {
    if (this.over) return;
    this.over = true;
    this.winner = opponent(this.turn);
  }
}

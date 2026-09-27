import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { forbiddenAt, forbiddenPoints } from '../src/gomoku/renju';
import { chooseMove } from '../src/gomoku/ai/brains';
import { BLACK, type Board, createBoard, EMPTY, GomokuGame, WHITE } from '../src/gomoku/rules';

/** Rows top to bottom; X black, O white, anything else empty. Short boards are padded. */
function parse(rows: string[]): Board {
  const board = createBoard();
  rows.forEach((row, y) => [...row].forEach((cell, x) => {
    board[y * 15 + x] = cell === 'X' ? BLACK : cell === 'O' ? WHITE : EMPTY;
  }));
  return board;
}

describe('renju forbidden points', () => {
  test('double-three', () => {
    const board = parse(['', '', '', '', '', '', '', '.....XX', '', '.......X', '.......X']);
    expect(forbiddenAt(board, 7, 7)).toBe('double-three');
  });

  test('a three blocked on one side is not a three', () => {
    const board = parse(['', '', '', '', '', '', '', '....OXX', '', '.......X', '.......X']);
    expect(forbiddenAt(board, 7, 7)).toBeNull();
  });

  test('four-three is allowed', () => {
    const board = parse(['', '', '', '', '', '', '', '....XXX', '', '.......X', '.......X']);
    expect(forbiddenAt(board, 7, 7)).toBeNull();
  });

  test('double-four across two lines', () => {
    const board = parse(['', '', '', '', '', '', '', '....XXX', '', '.......X', '.......X', '.......X']);
    expect(forbiddenAt(board, 7, 7)).toBe('double-four');
  });

  test('double-four inside a single line', () => {
    // X.X?X.X: the middle stone makes two separate fours on the same row.
    const board = parse(['', '', '', '', '', '', '', '...X.X.X.X']);
    expect(forbiddenAt(board, 6, 7)).toBe('double-four');
  });

  test('overline', () => {
    const board = parse(['', '', '', '', '', '', '', '..XXX.XX']);
    expect(forbiddenAt(board, 5, 7)).toBe('overline');
  });

  test('an exact five wins even when it also makes forbidden shapes', () => {
    // Five on the row, plus a double-four through the same point.
    const board = parse(['', '', '', '', '', '', '', '...XXXX', '', '.......X', '.......X', '.......X']);
    expect(forbiddenAt(board, 7, 7)).toBeNull();
  });

  test('a three whose completion point is forbidden is not a three', () => {
    // Found by fuzzing: a naive double-three check flags (9, 9); Rapfi and RIF say it is legal.
    const board = parse([
      'O...........OOO', '', '', '', '', '', '',
      '.......X.X.....',
      '.....X.XX......',
      '.O....X.X......',
      '',
      '.....O....X....',
      '.......O.......',
      '',
      '.........O.....',
    ]);
    expect(forbiddenAt(board, 9, 9)).toBeNull();
  });

  test('leaves the board untouched', () => {
    const board = parse(['', '', '', '', '', '', '', '.....XX', '', '.......X', '.......X']);
    const before = board.slice();
    forbiddenPoints(board);
    expect(board).toEqual(before);
  });

  test('matches Rapfi on fuzzed positions', () => {
    const { positions } = JSON.parse(readFileSync(new URL('./fixtures/renju-rapfi.json', import.meta.url), 'utf8')) as {
      positions: Array<{ rows: string[]; forbidden: Array<[number, number]> }>;
    };
    expect(positions.length).toBeGreaterThan(100);
    for (const { rows, forbidden } of positions) {
      const ours = forbiddenPoints(parse(rows)).map((point) => [point.x, point.y]);
      expect(ours.sort((a, b) => a[1] - b[1] || a[0] - b[0])).toEqual(forbidden);
    }
  });
});

describe('renju games', () => {
  test('the game refuses a forbidden move and keeps black to move', () => {
    const game = new GomokuGame(15, 'renju');
    // Black: (5,7) (6,7) (7,9) (7,10); white far away. (7,7) is then a double-three.
    for (const [x, y] of [[5, 7], [0, 0], [6, 7], [0, 2], [7, 9], [0, 4], [7, 10], [0, 6]] as const) game.play(x, y);
    expect(game.play(7, 7)).toEqual({ kind: 'forbidden', reason: 'double-three' });
    expect(game.turn).toBe(BLACK);
    expect(game.history).toHaveLength(8);
    expect(game.play(8, 7).kind).toBe('placed');
  });

  test('free-style games are unaffected', () => {
    const game = new GomokuGame();
    for (const [x, y] of [[5, 7], [0, 0], [6, 7], [0, 2], [7, 9], [0, 4], [7, 10], [0, 6]] as const) game.play(x, y);
    expect(game.play(7, 7).kind).toBe('placed');
  });

  test('white still wins with an overline', () => {
    const game = new GomokuGame(15, 'renju');
    const moves: Array<[number, number]> = [[14, 14], [2, 3], [14, 12], [3, 3], [14, 10], [4, 3], [12, 14], [6, 3], [12, 12], [7, 3], [10, 12]];
    for (const [x, y] of moves) game.play(x, y);
    expect(game.play(5, 3).kind).toBe('win');
    expect(game.winner).toBe(WHITE);
  });

  test.each(['sprout', 'fox', 'owl'] as const)('%s as black does not block a five on its own forbidden point', (brain) => {
    // White threatens five at (7, 7) (the other end is blocked); for black (7, 7) is a double-three.
    const board = createBoard();
    for (const [x, y] of [[5, 7], [6, 7], [7, 9], [7, 10], [2, 2]]) board[y * 15 + x] = BLACK;
    for (const [x, y] of [[3, 3], [4, 4], [5, 5], [6, 6], [14, 14]]) board[y * 15 + x] = WHITE;
    expect(forbiddenAt(board, 7, 7)).toBe('double-three');
    const move = chooseMove(brain, board, BLACK, () => 0.5, 'renju');
    expect(forbiddenAt(board, move.x, move.y)).toBeNull();
  });

  test.each(['sprout', 'fox', 'owl'] as const)('%s never plays a forbidden point as black', (brain) => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let round = 0; round < (brain === 'owl' ? 2 : 6); round += 1) {
      const game = new GomokuGame(15, 'renju');
      while (!game.over && game.history.length < 120) {
        const stone = game.turn;
        const move = chooseMove(stone === BLACK ? brain : 'fox', game.board, stone, random, 'renju');
        expect(game.forbidden(move.x, move.y)).toBeNull();
        expect(game.play(move.x, move.y).kind).not.toBe('invalid');
      }
    }
  }, 120_000);
});

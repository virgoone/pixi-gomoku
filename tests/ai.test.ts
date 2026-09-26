import { describe, expect, test } from 'vitest';
import { type BrainId, chooseMove } from '../src/gomoku/ai/brains';
import { evaluatePoint, SCORE } from '../src/gomoku/ai/patterns';
import { BLACK, createBoard, set, WHITE, winningLine } from '../src/gomoku/rules';

const brains: BrainId[] = ['sprout', 'fox', 'owl'];
const seeded = () => {
  let seed = 42;
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
};

describe('pattern scoring', () => {
  test('recognises a five and an open four', () => {
    const board = createBoard();
    for (let x = 3; x < 7; x += 1) set(board, x, 7, BLACK);
    expect(evaluatePoint(board, 7, 7, BLACK).score).toBeGreaterThanOrEqual(SCORE.FIVE);
    const open = createBoard();
    for (let x = 4; x < 7; x += 1) set(open, x, 7, BLACK);
    expect(evaluatePoint(open, 7, 7, BLACK).score).toBeGreaterThanOrEqual(SCORE.OPEN_FOUR);
  });
});

describe.each(brains)('%s brain', (brain) => {
  test('opens in the centre area', () => {
    const move = chooseMove(brain, createBoard(), BLACK, seeded());
    expect(move).toEqual({ x: 7, y: 7 });
  });

  test('takes an immediate win', () => {
    const board = createBoard();
    for (let x = 3; x < 7; x += 1) set(board, x, 5, WHITE);
    set(board, 2, 5, BLACK);
    for (let x = 3; x < 6; x += 1) set(board, x, 9, BLACK);
    expect(chooseMove(brain, board, WHITE, seeded())).toEqual({ x: 7, y: 5 });
  });

  test('blocks the opponent five', () => {
    const board = createBoard();
    for (let y = 3; y < 7; y += 1) set(board, 10, y, BLACK);
    set(board, 10, 2, WHITE);
    set(board, 4, 4, WHITE);
    expect(chooseMove(brain, board, WHITE, seeded())).toEqual({ x: 10, y: 7 });
  });

  test('always returns an empty cell', () => {
    const board = createBoard();
    const stones: Array<[number, number, 1 | 2]> = [[7, 7, 1], [8, 8, 2], [6, 8, 1], [8, 6, 2], [7, 9, 1]];
    for (const [x, y, stone] of stones) set(board, x, y, stone);
    const move = chooseMove(brain, board, WHITE, seeded());
    expect(board[move.y * 15 + move.x]).toBe(0);
  });
});

test('fox and owl stop an open three from becoming an open four', () => {
  for (const brain of ['fox', 'owl'] as const) {
    const board = createBoard();
    set(board, 6, 7, BLACK);
    set(board, 7, 7, BLACK);
    set(board, 8, 7, BLACK);
    set(board, 7, 8, WHITE);
    set(board, 6, 8, WHITE);
    const move = chooseMove(brain, board, WHITE, seeded());
    expect([5, 9]).toContain(move.x);
    expect(move.y).toBe(7);
  }
});

test('owl beats sprout when it plays black', () => {
  const board = createBoard();
  let stone: 1 | 2 = BLACK;
  const random = seeded();
  for (let turn = 0; turn < 120; turn += 1) {
    const move = chooseMove(stone === BLACK ? 'owl' : 'sprout', board, stone, random);
    set(board, move.x, move.y, stone);
    if (winningLine(board, move.x, move.y, stone)) {
      expect(stone).toBe(BLACK);
      return;
    }
    stone = stone === BLACK ? WHITE : BLACK;
  }
  throw new Error('no winner within 120 moves');
}, 60_000);


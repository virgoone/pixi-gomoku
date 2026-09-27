import { describe, expect, test } from 'vitest';
import { equivalentOffers, freshOpening, inOpeningZone, openingPhase, randomOpeningMove } from '../src/gomoku/opening';
import { heuristicChoose, heuristicOffers, heuristicSwap } from '../src/gomoku/ai/brains';
import { forbiddenAt } from '../src/gomoku/renju';
import { BLACK, createBoard, WHITE } from '../src/gomoku/rules';

describe('RIF opening', () => {
  test('phases follow the move count and decisions', () => {
    const state = freshOpening();
    expect(openingPhase('free', 0, state)).toBe('play');
    expect(openingPhase('rif', 0, state)).toBe('place');
    expect(openingPhase('rif', 2, state)).toBe('place');
    expect(openingPhase('rif', 3, state)).toBe('swap');
    expect(openingPhase('rif', 3, { ...state, swapDecided: true })).toBe('play');
    expect(openingPhase('rif', 4, { swapDecided: true, offers: [{ x: 1, y: 1 }] })).toBe('offer');
    expect(openingPhase('rif', 4, { swapDecided: true, offers: [{ x: 1, y: 1 }, { x: 2, y: 2 }] })).toBe('choose');
    expect(openingPhase('rif', 5, { swapDecided: true, offers: [] })).toBe('play');
  });

  test('the first three moves stay near the centre', () => {
    const board = createBoard();
    expect(inOpeningZone(board, 0, { x: 7, y: 7 })).toBe(true);
    expect(inOpeningZone(board, 0, { x: 7, y: 8 })).toBe(false);
    expect(inOpeningZone(board, 1, { x: 8, y: 8 })).toBe(true);
    expect(inOpeningZone(board, 1, { x: 9, y: 7 })).toBe(false);
    expect(inOpeningZone(board, 2, { x: 9, y: 5 })).toBe(true);
    expect(inOpeningZone(board, 2, { x: 10, y: 7 })).toBe(false);
    expect(inOpeningZone(board, 3, { x: 0, y: 0 })).toBe(true);
  });

  test('random opening moves are legal', () => {
    const board = createBoard();
    for (let index = 0; index < 3; index += 1) {
      const move = randomOpeningMove(board, index);
      expect(inOpeningZone(board, index, move)).toBe(true);
      expect(board[move.y * 15 + move.x]).toBe(0);
      board[move.y * 15 + move.x] = index % 2 ? WHITE : BLACK;
    }
  });

  test('offers that mirror each other are equivalent', () => {
    // Black (7,7) (7,5), white (7,6): symmetric about the vertical line x = 7.
    const board = createBoard();
    board[7 * 15 + 7] = BLACK;
    board[5 * 15 + 7] = BLACK;
    board[6 * 15 + 7] = WHITE;
    board[9 * 15 + 7] = WHITE;
    expect(equivalentOffers(board, { x: 5, y: 6 }, { x: 9, y: 6 })).toBe(true);
    expect(equivalentOffers(board, { x: 5, y: 6 }, { x: 5, y: 6 })).toBe(true);
    expect(equivalentOffers(board, { x: 5, y: 6 }, { x: 6, y: 5 })).toBe(false);
  });

  test('an asymmetric position has no equivalent offers', () => {
    const board = createBoard();
    board[7 * 15 + 7] = BLACK;
    board[7 * 15 + 8] = WHITE;
    board[5 * 15 + 9] = BLACK;
    board[10 * 15 + 3] = WHITE;
    expect(equivalentOffers(board, { x: 4, y: 4 }, { x: 10, y: 10 })).toBe(false);
  });
});

describe('AI opening decisions', () => {
  // A typical position after move 4: black (7,7) (8,6), white (7,6) (6,8).
  const position = () => {
    const board = createBoard();
    for (const [x, y] of [[7, 7], [8, 6]]) board[y * 15 + x] = BLACK;
    for (const [x, y] of [[7, 6], [6, 8]]) board[y * 15 + x] = WHITE;
    return board;
  };

  test('offers two legal 5th moves that are not symmetric', () => {
    const board = position();
    const offers = heuristicOffers(board, 'renju');
    expect(offers).toHaveLength(2);
    for (const p of offers) {
      expect(board[p.y * 15 + p.x]).toBe(0);
      expect(forbiddenAt(board, p.x, p.y)).toBeNull();
    }
    expect(equivalentOffers(board, offers[0], offers[1])).toBe(false);
  });

  test('keeps the engine\'s pick as the first offer', () => {
    const offers = heuristicOffers(position(), 'renju', { x: 9, y: 5 });
    expect(offers[0]).toEqual({ x: 9, y: 5 });
    expect(offers).toHaveLength(2);
  });

  test('chooses one of the offers', () => {
    const board = position();
    const offers = heuristicOffers(board, 'renju');
    expect(offers).toContainEqual(heuristicChoose(board, offers));
  });

  test('decides a swap on the three-stone position', () => {
    const board = createBoard();
    for (const [x, y] of [[7, 7], [8, 6]]) board[y * 15 + x] = BLACK;
    board[6 * 15 + 7] = WHITE;
    expect(typeof heuristicSwap(board, () => 0.3)).toBe('boolean');
  });
});

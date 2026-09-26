import { describe, expect, test } from 'vitest';
import { BLACK, GomokuGame, WHITE } from '../src/gomoku/rules';

function playAll(game: GomokuGame, moves: Array<[number, number]>) {
  return moves.map(([x, y]) => game.play(x, y));
}

describe('rules', () => {
  test('black moves first and turns alternate', () => {
    const game = new GomokuGame();
    expect(game.turn).toBe(BLACK);
    game.play(7, 7);
    expect(game.turn).toBe(WHITE);
    expect(game.play(7, 7).kind).toBe('invalid');
  });

  test.each([
    ['horizontal', [0, 1]],
    ['vertical', [1, 0]],
    ['diagonal', [1, 1]],
  ] as const)('detects a %s five and returns the line', (_, [dx, dy]) => {
    const game = new GomokuGame();
    const moves: Array<[number, number]> = [];
    for (let i = 0; i < 5; i += 1) {
      moves.push([2 + i * dy, 2 + i * dx]);
      if (i < 4) moves.push([12, 2 + i]);
    }
    const results = playAll(game, moves);
    const last = results.at(-1);
    expect(last?.kind).toBe('win');
    if (last?.kind === 'win') expect(last.line).toHaveLength(5);
    expect(game.winner).toBe(BLACK);
  });

  test('anti-diagonal and overlines win', () => {
    const game = new GomokuGame();
    // Black 6 in a row on the anti-diagonal, filled from the middle outward.
    playAll(game, [[5, 5], [0, 0], [6, 4], [0, 1], [4, 6], [0, 2], [7, 3], [0, 3], [2, 8], [14, 14]]);
    expect(game.over).toBe(false);
    expect(game.play(3, 7).kind).toBe('win');
    expect(game.winLine).toHaveLength(6);
  });

  test('undo restores the board and the side to move', () => {
    const game = new GomokuGame();
    playAll(game, [[7, 7], [7, 8], [8, 8]]);
    game.undo(2);
    expect(game.history).toHaveLength(1);
    expect(game.turn).toBe(WHITE);
    expect(game.play(7, 8).kind).toBe('placed');
  });

  test('resign hands the win to the other side', () => {
    const game = new GomokuGame();
    game.play(7, 7);
    game.resign();
    expect(game.over).toBe(true);
    expect(game.winner).toBe(BLACK);
  });
});

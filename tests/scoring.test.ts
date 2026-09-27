import { describe, expect, test } from 'vitest';
import { chestTier, type Outcome, settle } from '../src/result/scoring';
import { ladderPoints } from '../src/result/ladder';
import { BLACK } from '../src/gomoku/rules';

const base: Outcome = { mode: 'ai', winner: 1, myStone: 1, totalMoves: 41, winnerMoves: 21, reason: 'five', brain: 'fox' };

describe('settlement', () => {
  test('opponent strength sets the base tier', () => {
    expect(chestTier({ ...base, brain: 'sprout' }, 1)).toBe(0);
    expect(chestTier({ ...base, brain: 'fox' }, 1)).toBe(1);
    expect(chestTier({ ...base, brain: 'owl' }, 1)).toBe(2);
  });

  test('quick wins and streaks upgrade the chest, capped at legendary', () => {
    expect(chestTier({ ...base, brain: 'owl', winnerMoves: 10 }, 1)).toBe(3);
    expect(chestTier({ ...base, brain: 'owl', winnerMoves: 10 }, 5)).toBe(3);
    expect(chestTier({ ...base, brain: 'sprout' }, 3)).toBe(1);
  });

  test('a win extends the streak and a loss resets it', () => {
    const win = settle(base, 2);
    expect(win.kind).toBe('win');
    expect(win.streak).toBe(3);
    expect(win.rewards.crowns).toBe(1);
    const loss = settle({ ...base, winner: 2 }, 4);
    expect(loss.kind).toBe('loss');
    expect(loss.streak).toBe(0);
    expect(loss.rewards.coins).toBeGreaterThan(0);
  });

  test('draws and same-device games', () => {
    expect(settle({ ...base, winner: null, reason: 'draw' }, 2)).toMatchObject({ kind: 'draw', streak: 2 });
    const local = settle({ ...base, mode: 'local', myStone: null, winner: 2, brain: undefined }, 3);
    expect(local).toMatchObject({ kind: 'win', headline: '白方胜利！', streak: 3 });
  });
});

describe('master opponent', () => {
  test('a win over the master earns the top chest and 10 ladder points', () => {
    const outcome: Outcome = { mode: 'ai', brain: 'master', winner: BLACK, myStone: BLACK, totalMoves: 61, winnerMoves: 31, reason: 'five' };
    expect(chestTier(outcome, 1)).toBe(3);
    expect(ladderPoints('win', 'ai', 'master')).toBe(10);
    expect(ladderPoints('loss', 'ai', 'master')).toBe(0);
  });
});

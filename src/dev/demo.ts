import { navigation } from '../app/navigation';
import type { BrainId } from '../gomoku/ai';
import { BLACK, WHITE } from '../gomoku/rules';
import type { Outcome } from '../result/scoring';
import { GameScreen } from '../screens/GameScreen';
import { ResultScreen } from '../screens/ResultScreen';

/**
 * Development shortcuts (never bundled into production):
 *   ?demo=result&brain=owl&moves=9     win screen (tier from brain and moves)
 *   ?demo=loss | ?demo=draw            badge screens
 *   ?demo=game&brain=fox               straight into a game
 */
export async function runDemo(params: URLSearchParams) {
  const demo = params.get('demo');
  const brain = (params.get('brain') ?? 'fox') as BrainId;
  if (demo === 'game') {
    await navigation.goTo(new GameScreen({ mode: 'ai', brain, humanStone: BLACK }));
    return;
  }
  const moves = Number(params.get('moves') ?? 18);
  const base: Outcome = { mode: 'ai', winner: BLACK, myStone: BLACK, totalMoves: moves * 2 - 1, winnerMoves: moves, reason: 'five', brain };
  const outcome: Outcome = demo === 'loss' ? { ...base, winner: WHITE } : demo === 'draw' ? { ...base, winner: null, reason: 'draw', totalMoves: 225 } : base;
  await navigation.goTo(new ResultScreen(outcome, undefined, () => ({ mode: 'ai', brain, humanStone: BLACK })));
}

import { navigation } from '../app/navigation';
import type { BrainId } from '../gomoku/ai';
import type { Opening } from '../gomoku/opening';
import { BLACK, type Rule, WHITE } from '../gomoku/rules';
import type { Outcome } from '../result/scoring';
import { GameScreen } from '../screens/GameScreen';
import { ResultScreen } from '../screens/ResultScreen';

/**
 * Development shortcuts (never bundled into production):
 *   ?demo=result&brain=owl&moves=9     win screen (tier from brain and moves)
 *   ?demo=loss | ?demo=draw            badge screens
 *   ?demo=game&brain=fox               straight into a game
 *     &rule=renju                      … under renju rules
 *     &opening=rif                     … with the RIF opening (renju only)
 *     &first=white                     … the AI places the opening / plays black
 *     &setup=5,7;0,0;6,7                … with these moves played first (black first)
 *   add &rated to the result demos to submit a real game to the leaderboard
 */
export async function runDemo(params: URLSearchParams) {
  const demo = params.get('demo');
  const brain = (params.get('brain') ?? 'fox') as BrainId;
  if (demo === 'game') {
    const rule = (params.get('rule') ?? 'freestyle') as Rule;
    const opening = (params.get('opening') ?? 'free') as Opening;
    const humanStone = params.get('first') === 'white' ? WHITE : BLACK;
    const screen = new GameScreen({ mode: 'ai', brain, humanStone, rule, opening });
    const setup = (params.get('setup') ?? '').split(';').filter(Boolean).map((move) => move.split(',').map(Number) as [number, number]);
    screen.preload(setup);
    await navigation.goTo(screen);
    return;
  }
  const moves = Number(params.get('moves') ?? 18);
  // A real, replayable game (black five on row 7) so the leaderboard accepts it.
  const rated = params.has('rated')
    ? { moves: [[3, 7], [3, 9], [4, 7], [4, 9], [5, 7], [5, 9], [6, 7], [6, 9], [7, 7]] as Array<[number, number]> }
    : {};
  const base: Outcome = { mode: 'ai', winner: BLACK, myStone: BLACK, totalMoves: moves * 2 - 1, winnerMoves: moves, reason: 'five', brain, ...rated };
  const outcome: Outcome = demo === 'loss' ? { ...base, winner: WHITE } : demo === 'draw' ? { ...base, winner: null, reason: 'draw', totalMoves: 225 } : base;
  await navigation.goTo(new ResultScreen(outcome, undefined, () => ({ mode: 'ai', brain, humanStone: BLACK })));
}

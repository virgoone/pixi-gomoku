import { forbiddenAt } from '../renju';
import { BLACK, type Board, EMPTY, type Point, type Rule, type Stone } from '../rules';
import type { AiRequest, AiResponse } from './ai.worker';
import { type BrainId, chooseMove } from './brains';
import { masterEngine } from './master';

export { BRAINS, type BrainId, type BrainInfo, brainInfo } from './brains';
export { type EngineState, masterEngine } from './master';

/**
 * Runs brains off the main thread so the board animation never stalls. The
 * master plays through its engine; if that fails mid-game the owl takes over
 * for the rest of the game, and `effectiveBrain` says so for the result.
 */
export class AiPlayer {
  private worker: Worker | null = null;
  /** The engine failed during this game: the owl is playing instead. */
  private engineFailed = false;
  private nextId = 1;
  private pending = new Map<number, { resolve: (point: Point) => void; board: Board; stone: Stone }>();

  constructor(readonly brain: BrainId, readonly rule: Rule = 'freestyle') {
    try {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<AiResponse>) => {
        const request = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        request?.resolve({ x: event.data.x, y: event.data.y });
      };
      // A worker that fails to load or crashes must not leave the game waiting forever.
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.fallBackToMainThread();
      };
    } catch {
      this.worker = null;
    }
  }

  /** Who actually played: the owl when the master's engine gave out. */
  get effectiveBrain(): BrainId {
    return this.brain === 'master' && this.engineFailed ? 'owl' : this.brain;
  }

  /** Brain for the heuristic worker. */
  private get heuristicBrain(): BrainId {
    return this.brain === 'master' ? 'owl' : this.brain;
  }

  /** Resolves no sooner than `minDelay` so the opponent feels like it is thinking. */
  async think(board: Board, stone: Stone, minDelay = 450): Promise<Point> {
    const started = performance.now();
    const move = (this.brain === 'master' && !this.engineFailed ? await this.engineMove(board, stone) : null) ?? (await this.heuristicMove(board, stone));
    const elapsed = performance.now() - started;
    if (elapsed < minDelay) await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    return move;
  }

  /** The engine's move, or null (and the owl from now on) if it failed or played an illegal point. */
  private async engineMove(board: Board, stone: Stone): Promise<Point | null> {
    try {
      const move = await masterEngine.think(board, stone, this.rule);
      const size = Math.round(Math.sqrt(board.length));
      const inside = move.x >= 0 && move.y >= 0 && move.x < size && move.y < size;
      const legal = inside && board[move.y * size + move.x] === EMPTY && !(this.rule === 'renju' && stone === BLACK && forbiddenAt(board, move.x, move.y));
      if (legal) return move;
    } catch {
      /* fall through */
    }
    this.engineFailed = true;
    return null;
  }

  private heuristicMove(board: Board, stone: Stone) {
    return new Promise<Point>((resolve) => {
      if (!this.worker) {
        resolve(chooseMove(this.heuristicBrain, board, stone, Math.random, this.rule));
        return;
      }
      const id = this.nextId++;
      const snapshot = new Uint8Array(board);
      this.pending.set(id, { resolve, board: snapshot, stone });
      this.worker.postMessage({ id, brain: this.heuristicBrain, board: snapshot, stone, rule: this.rule } satisfies AiRequest);
    });
  }

  private fallBackToMainThread() {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.resolve(chooseMove(this.heuristicBrain, request.board, request.stone, Math.random, this.rule));
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

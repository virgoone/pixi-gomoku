import type { Board, Point, Rule, Stone } from '../rules';
import type { AiRequest, AiResponse } from './ai.worker';
import { type BrainId, chooseMove } from './brains';

export { BRAINS, type BrainId, type BrainInfo, brainInfo } from './brains';

/** Runs brains off the main thread so the board animation never stalls. */
export class AiPlayer {
  private worker: Worker | null = null;
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

  /** Resolves no sooner than `minDelay` so the opponent feels like it is thinking. */
  async think(board: Board, stone: Stone, minDelay = 450): Promise<Point> {
    const started = performance.now();
    const move = await new Promise<Point>((resolve) => {
      if (!this.worker) {
        resolve(chooseMove(this.brain, board, stone, Math.random, this.rule));
        return;
      }
      const id = this.nextId++;
      const snapshot = new Uint8Array(board);
      this.pending.set(id, { resolve, board: snapshot, stone });
      this.worker.postMessage({ id, brain: this.brain, board: snapshot, stone, rule: this.rule } satisfies AiRequest);
    });
    const elapsed = performance.now() - started;
    if (elapsed < minDelay) await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    return move;
  }

  private fallBackToMainThread() {
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const request of waiting) request.resolve(chooseMove(this.brain, request.board, request.stone, Math.random, this.rule));
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

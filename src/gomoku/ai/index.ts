import type { Board, Point, Stone } from '../rules';
import type { AiRequest, AiResponse } from './ai.worker';
import { type BrainId, chooseMove } from './brains';

export { BRAINS, type BrainId, type BrainInfo, brainInfo } from './brains';

/** Runs brains off the main thread so the board animation never stalls. */
export class AiPlayer {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, (point: Point) => void>();

  constructor(readonly brain: BrainId) {
    try {
      this.worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<AiResponse>) => {
        const resolve = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        resolve?.({ x: event.data.x, y: event.data.y });
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
        resolve(chooseMove(this.brain, board, stone));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, resolve);
      this.worker.postMessage({ id, brain: this.brain, board: new Uint8Array(board), stone } satisfies AiRequest);
    });
    const elapsed = performance.now() - started;
    if (elapsed < minDelay) await new Promise((resolve) => setTimeout(resolve, minDelay - elapsed));
    return move;
  }

  dispose() {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
  }
}

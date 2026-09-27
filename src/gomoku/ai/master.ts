import type { Board, Point, Rule, Stone } from '../rules';

/**
 * Loader and front end for the master opponent's engine (engine.worker.ts).
 * Nothing is downloaded until `load()` is first called, which happens when the
 * player picks the master; the worker then stays alive for later games.
 */

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';
export type EngineState = { status: EngineStatus; progress: number; error?: string };

/** Per-move thinking time for the engine. */
export const MASTER_TIME_MS = 1000;
/** A move that takes far longer than the limit means the engine is stuck. */
const THINK_TIMEOUT_MS = MASTER_TIME_MS * 8;
/** A download (or engine start) that makes no progress this long has stalled. */
const LOAD_STALL_MS = 20_000;

/** A move and the engine's evaluation of the position for the side to move (null if unknown). */
export type EngineMove = Point & { score: number | null };

type Pending = { resolve: (move: EngineMove) => void; reject: (error: Error) => void; timer: number };

class MasterEngine {
  private worker: Worker | null = null;
  private loading: Promise<void> | null = null;
  private listeners = new Set<(state: EngineState) => void>();
  private pending = new Map<number, Pending>();
  private nextId = 1;
  state: EngineState = { status: 'idle', progress: 0 };

  onChange(listener: (state: EngineState) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(state: EngineState) {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }

  /** Download and start the engine. Safe to call repeatedly; retries after an error. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.setState({ status: 'loading', progress: 0 });
    this.loading = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(new URL('./engine.worker.ts', import.meta.url));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      this.worker = worker;
      // Without a watchdog a stalled download would leave callers of think() (e.g. a replay
      // that skips the setup popup) waiting forever, since the move timer starts after loading.
      let stall = 0;
      const watch = () => {
        window.clearTimeout(stall);
        stall = window.setTimeout(() => reject(new Error('引擎下载超时')), LOAD_STALL_MS);
      };
      watch();
      worker.onmessage = (event: MessageEvent) => {
        const message = event.data;
        if (message.type === 'progress') {
          watch();
          this.setState({ status: 'loading', progress: message.value });
        } else if (message.type === 'ready') {
          window.clearTimeout(stall);
          this.setState({ status: 'ready', progress: 1 });
          resolve();
        } else if (message.type === 'error') {
          window.clearTimeout(stall);
          reject(new Error(message.message));
        } else if (message.type === 'move') this.settle(message.id, { x: message.x, y: message.y, score: typeof message.score === 'number' ? message.score : null });
        else if (message.type === 'failed') this.settle(message.id, new Error(message.message));
      };
      worker.onerror = (event) => {
        event.preventDefault();
        reject(new Error(event.message || '引擎出错'));
      };
      const base = new URL(`${import.meta.env.BASE_URL}engines/rapfi/`, window.location.href).href;
      worker.postMessage({ type: 'load', base });
    }).catch((error: Error) => {
      this.fail(error);
      throw error;
    });
    return this.loading;
  }

  /** Drop a broken engine so the next `load()` starts over. */
  private fail(error: Error) {
    this.worker?.terminate();
    this.worker = null;
    this.loading = null;
    for (const id of [...this.pending.keys()]) this.settle(id, error);
    this.setState({ status: 'error', progress: 0, error: error.message });
  }

  private settle(id: number, result: EngineMove | Error) {
    const request = this.pending.get(id);
    if (!request) return;
    this.pending.delete(id);
    window.clearTimeout(request.timer);
    if (result instanceof Error) request.reject(result);
    else request.resolve(result);
  }

  /** The engine's move for `stone` to play, with its evaluation. `timeMs` is the thinking budget. */
  async think(board: Board, stone: Stone, rule: Rule, timeMs = MASTER_TIME_MS): Promise<EngineMove> {
    await this.load();
    const worker = this.worker;
    if (!worker) throw new Error('引擎未加载');
    const id = this.nextId++;
    return await new Promise<EngineMove>((resolve, reject) => {
      const timer = window.setTimeout(() => this.fail(new Error('引擎超时')), Math.max(THINK_TIMEOUT_MS, timeMs * 8));
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ type: 'think', id, board: new Uint8Array(board), stone, rule, timeMs });
    });
  }
}

export const masterEngine = new MasterEngine();

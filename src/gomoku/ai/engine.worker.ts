/// <reference lib="webworker" />
/**
 * The master opponent: Rapfi (GPL-3.0, https://github.com/dhbloo/rapfi) built
 * to single-threaded WebAssembly, see scripts/build-rapfi.sh. A classic worker
 * with no runtime imports, so the emscripten glue can be pulled in with
 * importScripts. The engine is only downloaded when this worker is created.
 *
 * Messages in:  { type: 'load', base }  then  { type: 'think', id, board, stone, rule, timeMs }
 * Messages out: { type: 'progress', value } | { type: 'ready' } | { type: 'error', message }
 *               | { type: 'move', id, x, y, score } | { type: 'failed', id, message }
 * `score` is the engine's evaluation for the side to move (null if it printed none).
 */

type RapfiModule = { sendCommand: (command: string) => void };
type RapfiFactory = (options: Record<string, unknown>) => Promise<RapfiModule>;

const FILES = { script: 'rapfi-single-simd128.js', wasm: 'rapfi-single-simd128.wasm', data: 'rapfi-single-simd128.data' };
/** Uncompressed sizes, for the progress bar (the server may gzip, hiding the real length). */
const EXPECTED_BYTES = 1_238_122 + 83_253;
const SIZE = 15;

const scope = self as unknown as DedicatedWorkerGlobalScope & { Rapfi?: RapfiFactory };
let engine: RapfiModule | null = null;
let output: string[] = [];
let received = 0;

async function download(url: string, type: string) {
  const response = await fetch(url);
  if (!response.ok || !response.body) throw new Error(`下载失败（${response.status}）`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    scope.postMessage({ type: 'progress', value: Math.min(0.99, received / EXPECTED_BYTES) });
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type }));
}

async function load(base: string) {
  const [wasmUrl, dataUrl] = await Promise.all([download(base + FILES.wasm, 'application/wasm'), download(base + FILES.data, 'application/octet-stream')]);
  scope.importScripts(base + FILES.script);
  const factory = scope.Rapfi;
  if (!factory) throw new Error('引擎脚本无效');
  engine = await factory({
    locateFile: (path: string) => (path.endsWith('.wasm') ? wasmUrl : path.endsWith('.data') ? dataUrl : base + path),
    onReceiveStdout: (line: string) => output.push(line),
    onReceiveStderr: () => undefined,
    onExit: () => undefined,
  });
  engine.sendCommand(`START ${SIZE}`);
}

/**
 * Ask for a move on this position. The board has no move order, so stones are
 * listed black/white alternately, which gives the engine the right side to move.
 * Colour 1 means the engine's own stones, 2 the opponent's.
 */
function think(board: Uint8Array, stone: number, rule: string, timeMs: number) {
  if (!engine) throw new Error('引擎未加载');
  const blacks: string[] = [];
  const whites: string[] = [];
  board.forEach((cell, index) => {
    if (!cell) return;
    const entry = `${index % SIZE},${Math.floor(index / SIZE)},${cell === stone ? 1 : 2}`;
    (cell === 1 ? blacks : whites).push(entry);
  });
  const moves: string[] = [];
  for (let index = 0; index < blacks.length; index += 1) {
    moves.push(blacks[index]);
    if (whites[index]) moves.push(whites[index]);
  }
  output = [];
  // Rapfi rules: 0 free-style (five or more wins), 4 renju.
  engine.sendCommand(`INFO rule ${rule === 'renju' ? 4 : 0}`);
  engine.sendCommand(`INFO timeout_turn ${timeMs}`);
  // No match clock: only the per-move limit applies.
  engine.sendCommand('INFO timeout_match 100000000');
  engine.sendCommand('INFO time_left 100000000');
  // A multi-line command has to arrive in one piece: the engine reads it synchronously.
  engine.sendCommand(['BOARD', ...moves, 'DONE'].join('\n'));
  const reply = output.filter((line) => /^\d+,\d+$/.test(line)).at(-1);
  if (!reply) throw new Error(output.find((line) => line.startsWith('ERROR')) ?? '引擎没有给出着法');
  const [x, y] = reply.split(',').map(Number);
  return { x, y, score: lastScore(output) };
}

/**
 * The last "Eval" in the search log. Rapfi prints a number, a mate as "+M5" /
 * "-M3" ("+M*" from its database), "VAL_INF" / "-VAL_INF", or "VAL_NONE".
 */
function lastScore(lines: string[]): number | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const token = /Eval (\S+)/.exec(lines[index])?.[1];
    if (!token || token === 'VAL_NONE') continue;
    if (/M|VAL_INF/.test(token)) return token.startsWith('-') ? -30000 : 30000;
    const value = Number(token);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

scope.onmessage = (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'load') {
    load(message.base).then(
      () => scope.postMessage({ type: 'ready' }),
      (error: unknown) => scope.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) }),
    );
  } else if (message.type === 'think') {
    try {
      const { x, y, score } = think(message.board, message.stone, message.rule, message.timeMs);
      scope.postMessage({ type: 'move', id: message.id, x, y, score });
    } catch (error) {
      scope.postMessage({ type: 'failed', id: message.id, message: error instanceof Error ? error.message : String(error) });
    }
  }
};

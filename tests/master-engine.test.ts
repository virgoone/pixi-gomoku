import { copyFileSync, mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { forbiddenAt } from '../src/gomoku/renju';
import { BLACK, createBoard, WHITE, winningLine } from '../src/gomoku/rules';

/**
 * Drives the real engine worker (engine.worker.ts) against the built Rapfi
 * WebAssembly in public/engines/rapfi, with the worker globals stubbed:
 * checks the board encoding, both rules, and that renju moves are legal.
 */

const dir = fileURLToPath(new URL('../public/engines/rapfi/', import.meta.url));
type Message = { type: string; [key: string]: unknown };
const inbox: Message[] = [];
const waiters: Array<{ match: (m: Message) => boolean; resolve: (m: Message) => void }> = [];
const scope: Record<string, unknown> = {
  postMessage: (message: Message) => {
    const waiter = waiters.find((entry) => entry.match(message));
    if (waiter) {
      waiters.splice(waiters.indexOf(waiter), 1);
      waiter.resolve(message);
    } else inbox.push(message);
  },
  importScripts: () => {
    // The glue would load the wasm from blob URLs; in Node it reads files, so point it at disk.
    // The package is "type": "module", so load the emscripten glue as CommonJS from a .cjs copy.
    const glue = join(mkdtempSync(join(tmpdir(), 'rapfi-')), 'rapfi.cjs');
    copyFileSync(`${dir}rapfi-single-simd128.js`, glue);
    const real = createRequire(import.meta.url)(glue) as (options: Record<string, unknown>) => Promise<unknown>;
    scope.Rapfi = (options: Record<string, unknown>) => real({ ...options, locateFile: (path: string) => dir + path });
  },
};
const originalFetch = globalThis.fetch;

function next(match: (m: Message) => boolean) {
  const found = inbox.findIndex(match);
  if (found >= 0) return Promise.resolve(inbox.splice(found, 1)[0]);
  return new Promise<Message>((resolve) => waiters.push({ match, resolve }));
}

let id = 0;
async function think(board: Uint8Array, stone: 1 | 2, rule: 'freestyle' | 'renju') {
  id += 1;
  (scope.onmessage as (event: { data: unknown }) => void)({ data: { type: 'think', id, board, stone, rule, timeMs: 300 } });
  const reply = await next((m) => (m.type === 'move' || m.type === 'failed') && m.id === id);
  if (reply.type === 'failed') throw new Error(String(reply.message));
  return { x: reply.x as number, y: reply.y as number };
}

describe('master engine (Rapfi wasm)', () => {
  beforeAll(async () => {
    (globalThis as Record<string, unknown>).self = scope;
    globalThis.fetch = (async (url: string) => new Response(readFileSync(dir + String(url).split('/').at(-1)))) as typeof fetch;
    // The worker is a classic script (not a module), so import it by URL.
    await import(/* @vite-ignore */ new URL('../src/gomoku/ai/engine.worker.ts', import.meta.url).href);
    (scope.onmessage as (event: { data: unknown }) => void)({ data: { type: 'load', base: '/engines/rapfi/' } });
    const reply = await next((m) => m.type === 'ready' || m.type === 'error');
    expect(reply).toEqual({ type: 'ready' });
  }, 30_000);

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test('opens on an empty board', async () => {
    const move = await think(createBoard(), BLACK, 'freestyle');
    expect(move.x).toBeGreaterThanOrEqual(0);
    expect(move.x).toBeLessThan(15);
    expect(move.y).toBeGreaterThanOrEqual(0);
    expect(move.y).toBeLessThan(15);
  });

  test.each(['freestyle', 'renju'] as const)('blocks an open four as white (%s)', async (rule) => {
    const board = createBoard();
    for (const x of [5, 6, 7, 8]) board[7 * 15 + x] = BLACK;
    for (const [x, y] of [[0, 0], [14, 14], [0, 14]]) board[y * 15 + x] = WHITE;
    const move = await think(board, WHITE, rule);
    expect(move.y).toBe(7);
    expect([4, 9]).toContain(move.x);
  });

  test('takes a five as black and never plays a forbidden point', async () => {
    // (7,7) is a double-three for black; black also has four on row 2 to finish.
    const board = createBoard();
    for (const [x, y] of [[5, 7], [6, 7], [7, 9], [7, 10], [2, 2], [3, 2], [4, 2], [5, 2]]) board[y * 15 + x] = BLACK;
    for (const [x, y] of [[1, 2], [12, 12], [13, 12], [0, 14], [14, 0], [14, 14], [0, 13], [13, 0]]) board[y * 15 + x] = WHITE;
    expect(forbiddenAt(board, 7, 7)).toBe('double-three');
    const move = await think(board, BLACK, 'renju');
    expect(move).toEqual({ x: 6, y: 2 });
  });

  test('plays a legal game against itself under renju', async () => {
    const board = createBoard();
    let stone: 1 | 2 = BLACK;
    for (let turn = 0; turn < 24; turn += 1) {
      const move = await think(board, stone, 'renju');
      expect(board[move.y * 15 + move.x]).toBe(0);
      if (stone === BLACK) expect(forbiddenAt(board, move.x, move.y)).toBeNull();
      board[move.y * 15 + move.x] = stone;
      if (winningLine(board, move.x, move.y, stone, 'renju')) break;
      stone = stone === BLACK ? WHITE : BLACK;
    }
  }, 60_000);
});

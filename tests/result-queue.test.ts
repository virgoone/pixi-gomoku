import { describe, expect, it } from 'vitest';
import { ResultQueue } from '../src/net/resultQueue';
import type { Outcome } from '../src/result/scoring';

class LocalStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}

const game = (): Outcome => ({ gameId: crypto.randomUUID(), finishedAt: Date.now(), mode: 'ai', brain: 'fox', myStone: 1, winner: 1, totalMoves: 9, winnerMoves: 5, reason: 'five', moves: [[3,7],[3,9],[4,7],[4,9],[5,7],[5,9],[6,7],[6,9],[7,7]] });

describe('offline game queue', () => {
  it('keeps anonymous games across reloads and only claims them after login', () => {
    const storage = new LocalStorage();
    const first = new ResultQueue(storage);
    const result = game();
    first.record(result, null);
    expect(first.pending('alice')).toHaveLength(0);
    const reloaded = new ResultQueue(storage);
    reloaded.claim('alice');
    expect(reloaded.pending('alice')[0].submission.gameId).toBe(result.gameId);
    reloaded.claim('bob');
    expect(reloaded.pending('bob')).toHaveLength(0);
    expect(reloaded.pending('alice')).toHaveLength(1);
  });

  it('combines games from separate tabs without overwrites and removes only acknowledged games', () => {
    const storage = new LocalStorage();
    const first = new ResultQueue(storage);
    const second = new ResultQueue(storage);
    const a = game();
    const b = game();
    first.record(a, 'alice');
    second.record(b, 'alice');
    first.record(a, 'alice');
    expect(first.pending('alice')).toHaveLength(2);
    second.acknowledge(a.gameId!);
    expect(first.pending('alice').map((entry) => entry.submission.gameId)).toEqual([b.gameId]);
  });

  it('keeps rejected records separate so one bad game does not block later uploads', () => {
    const queue = new ResultQueue(new LocalStorage());
    queue.record(game(), 'alice');
    queue.record(game(), 'alice');
    queue.reject(queue.pending('alice')[0], 'invalid replay');
    expect(queue.all()).toHaveLength(2);
    expect(queue.pending('alice')).toHaveLength(1);
  });

  it('never queues same-device games and still works when storage is blocked', () => {
    const queue = new ResultQueue(null);
    expect(queue.record({ ...game(), mode: 'local', myStone: null }, null)).toBeNull();
    queue.record(game(), null);
    queue.claim('alice');
    expect(queue.pending('alice')).toHaveLength(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Outcome } from '../src/result/scoring';

// Ranked-result tests isolate the independent personal-save synchronizer.
vi.mock('../src/net/profileSync', () => ({ ProfileSync: class { setUser() {} } }));

class LocalStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const alice = { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'user' };
const bob = { ...alice, id: 'bob', email: 'bob@example.com' };
const json = (body: unknown, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const game = (): Outcome => ({ gameId: crypto.randomUUID(), finishedAt: Date.now(), mode: 'ai', brain: 'fox', myStone: 1, winner: 1, totalMoves: 9, winnerMoves: 5, reason: 'five', moves: [[3,7],[3,9],[4,7],[4,9],[5,7],[5,9],[6,7],[6,9],[7,7]] });
const receipt = { result: 'win', points: 3, rank: 1, player: { points: 3, wins: 1, losses: 0, draws: 0, streak: 1, bestStreak: 1 } };
let storage: LocalStorage;
let fetchMock: ReturnType<typeof vi.fn>;
let documentMock: EventTarget & { hidden: boolean };

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  storage = new LocalStorage();
  fetchMock = vi.fn();
  documentMock = Object.assign(new EventTarget(), { hidden: false });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('window', Object.assign(new EventTarget(), { setTimeout, clearTimeout }));
  vi.stubGlobal('document', documentMock);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('authenticated game synchronization', () => {
  it('does not upload as a guest and uploads persisted games only after login', async () => {
    fetchMock.mockResolvedValue(json({ user: null }));
    const first = (await import('../src/net/account')).account;
    const outcome = game();
    expect(await first.submit(outcome)).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/session']);
    expect(storage.length).toBe(1);
    vi.resetModules();
    const reloaded = (await import('../src/net/account')).account;
    fetchMock.mockImplementation(async (url: string) => json(url === '/api/auth/verify' ? { user: alice } : receipt));
    await reloaded.verify(alice.email, '123456');
    await reloaded.sync();
    const upload = fetchMock.mock.calls.find(([url]) => url === '/api/results');
    expect(JSON.parse(upload![1].body)).toMatchObject({ userId: alice.id, gameId: outcome.gameId });
    expect(storage.length).toBe(0);
  });

  it('retains the same game ID through lost responses and rate limits, then continues the backlog', async () => {
    const account = (await import('../src/net/account')).account;
    fetchMock.mockResolvedValue(json({ user: null }));
    const a = game();
    const b = game();
    await account.submit(a);
    await account.submit(b);
    let uploads = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/auth/verify') return json({ user: alice });
      uploads += 1;
      if (uploads === 1) throw new Error('response lost after server accepted');
      if (uploads === 2) return json({ error: { code: 'too_fast', message: 'retry' } }, 429);
      return json(receipt);
    });
    await account.verify(alice.email, '123456');
    await account.sync();
    expect(storage.length).toBe(2);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(storage.length).toBe(2);
    await vi.advanceTimersByTimeAsync(8200);
    expect(storage.length).toBe(0);
    const ids = fetchMock.mock.calls.filter(([url]) => url === '/api/results').map(([, init]) => JSON.parse(init.body).gameId);
    expect(ids).toEqual([a.gameId, a.gameId, a.gameId, b.gameId]);
  });

  it('keeps an old account queue private when the shared session switches accounts', async () => {
    const account = (await import('../src/net/account')).account;
    fetchMock.mockImplementation(async (url: string) => json(url === '/api/auth/verify' ? { user: alice } : { error: { code: 'account_changed', message: 'changed' } }, url === '/api/results' ? 409 : 200));
    await account.verify(alice.email, '123456');
    await account.submit(game());
    expect(account.user).toBeNull();
    expect(storage.length).toBe(1);
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(json({ user: bob }));
    await account.verify(bob.email, '123456');
    await account.sync();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(['/api/auth/verify']);
    expect(storage.length).toBe(1);
  });
});

describe('leaderboard polling privacy', () => {
  it('discards an in-flight response after logout/reset', async () => {
    const { BoardFeed } = await import('../src/net/account');
    let resolve!: (response: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
    const onBoard = vi.fn();
    const feed = new BoardFeed(onBoard, vi.fn());
    feed.start();
    feed.reset();
    resolve(json({ version: 1, updatedAt: 1, entries: [] }));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onBoard).not.toHaveBeenCalled();
    expect(feed.board).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('pauses in the background and resumes with an ETag without rendering a 304', async () => {
    const { BoardFeed } = await import('../src/net/account');
    fetchMock.mockResolvedValueOnce(json({ version: 1, updatedAt: 1, entries: [] }, 200, { etag: '"v1"' }))
      .mockImplementation(async () => new Response(null, { status: 304 }));
    const onBoard = vi.fn();
    const feed = new BoardFeed(onBoard, vi.fn());
    feed.start();
    await vi.advanceTimersByTimeAsync(0);
    documentMock.hidden = true;
    documentMock.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    documentMock.hidden = false;
    documentMock.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].headers).toEqual({ 'if-none-match': '"v1"' });
    expect(onBoard).toHaveBeenCalledTimes(1);
    feed.stop();
  });
});

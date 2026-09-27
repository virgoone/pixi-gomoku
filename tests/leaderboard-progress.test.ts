import { describe, expect, it, vi } from 'vitest';
import { handleApi, type ApiEnv } from '../server/api';
import { requestOtp, verifyOtp } from '../server/auth';
import { getPlayer, readBoard, removePlayer, renamePlayer, submitGame, syncPlayerProgress, type Player } from '../server/board';
import { MemoryKV } from '../server/kv';
import { syncProgress } from '../server/profile';
import type { ProgressEvent } from '../src/profile/progress';

const origin = 'https://game.test';
const now = Date.now();
const win = () => ({ gameId: crypto.randomUUID(), finishedAt: now, mode: 'ai', brain: 'fox', myStone: 1, moves: [[3, 7], [3, 9], [4, 7], [4, 9], [5, 7], [5, 9], [6, 7], [6, 9], [7, 7]] });
const legacy = (wins = 14, losses = 25): ProgressEvent => ({ id: crypto.randomUUID(), deviceId: crypto.randomUUID(), kind: 'legacy', at: 0, values: { wins, losses, draws: 2 }, bestStreak: 6 });

async function setup() {
  const kv = new MemoryKV();
  const env: ApiEnv = { auth: new MemoryKV(), board: kv, secret: 'test-secret-0123456789', adminEmails: new Set(), exposeDevCode: true };
  const { otp } = await requestOtp(env, 'player@example.com');
  const { user, token } = await verifyOtp(env, 'player@example.com', otp, '大帅');
  const request = (path: string, body?: unknown, headers: Record<string, string> = {}) => handleApi(new Request(origin + path, {
    method: body ? 'POST' : 'GET', headers: { cookie: `gomoku_session=${token}`, origin, ...headers }, ...(body ? { body: JSON.stringify(body) } : {}),
  }), env);
  const save = (event: ProgressEvent, events = [event]) => request('/api/profile', { userId: user.id, deviceId: event.deviceId, events });
  return { kv, user, request, save };
}

describe('leaderboard account totals', () => {
  it('repairs previously imported saves on a board visit and preserves ETag on unchanged polls', async () => {
    const { kv, user, request, save } = await setup();
    await submitGame(kv, user, win(), now);
    const oldBoard = await request('/api/leaderboard');
    const etag = oldBoard.headers.get('etag')!;
    const event = legacy();
    // This is the state left by the earlier release: saved totals, old board.
    await syncProgress(kv, user.id, { deviceId: event.deviceId, events: [event] });
    const repaired = await request('/api/leaderboard', undefined, { 'if-none-match': etag });
    expect(repaired.status).toBe(200);
    expect(await repaired.json()).toMatchObject({ entries: [{ wins: 14, losses: 25, draws: 2, bestStreak: 6, points: 3 }] });
    expect(await (await request('/api/me')).json()).toMatchObject({ player: { wins: 14, losses: 25, points: 3 } });
    const nextEtag = repaired.headers.get('etag')!;
    await save(event, []); // Poll, without asking the user to reimport.
    expect((await request('/api/leaderboard', undefined, { 'if-none-match': nextEtag })).status).toBe(304);
    expect((await kv.get<Player>(`players/${user.id}`))?.value.wins).toBe(1); // Verified ledger stays intact.
  });

  it('lists players with only historical games, merges devices, and never awards replay points for imports', async () => {
    const { kv, user, save } = await setup();
    const a = legacy(9, 10), b = legacy(5, 15);
    expect((await save(a)).status).toBe(200);
    expect((await save(b)).status).toBe(200);
    const expected = { name: '大帅', wins: 14, losses: 25, draws: 4, points: 0 };
    expect((await readBoard(kv)).entries).toMatchObject([expected]);
    const version = (await readBoard(kv)).version;
    await Promise.all([save(a), save(b)]);
    expect(await readBoard(kv)).toMatchObject({ version, entries: [expected] });
    await renamePlayer(kv, { ...user, name: '新名字' });
    expect((await readBoard(kv)).entries).toMatchObject([{ ...expected, name: '新名字' }]);
  });

  it.each(['save-first', 'replay-first'] as const)('does not add the same new win twice (%s)', async (order) => {
    const { kv, user, save } = await setup();
    const event = legacy();
    await save(event);
    const game = win();
    const update: ProgressEvent = { id: crypto.randomUUID(), deviceId: event.deviceId, kind: 'update', at: now, values: { wins: 1 }, streak: 1 };
    if (order === 'save-first') await save(update);
    await submitGame(kv, user, game, now);
    if (order === 'replay-first') await save(update);
    await Promise.all([save(update), submitGame(kv, user, game, now + 9000)]);
    expect((await readBoard(kv)).entries).toMatchObject([{ wins: 15, losses: 25, points: 3 }]);
    expect((await getPlayer(kv, user)).player).toMatchObject({ wins: 15, losses: 25, points: 3 });
  });

  it('retains verified results while an older client has no matching save upload', async () => {
    const { kv, user, save } = await setup();
    const event = legacy(0, 0); event.values.draws = 0;
    await save(event);
    expect((await readBoard(kv)).entries).toEqual([]);
    await submitGame(kv, user, win(), now);
    await save(event, []);
    expect((await readBoard(kv)).entries).toMatchObject([{ wins: 1, points: 3 }]);
  });

  it('repairs a failed board publication on retry without crediting the import twice', async () => {
    const { kv, save } = await setup();
    const event = legacy();
    const original = kv.set.bind(kv);
    let failed = false;
    vi.spyOn(kv, 'set').mockImplementation(async (key, value, conditions) => {
      if (key === 'board' && !failed) { failed = true; throw new Error('connection lost'); }
      return original(key, value, conditions);
    });
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try { expect((await save(event)).status).toBe(500); } finally { log.mockRestore(); }
    expect((await save(event)).status).toBe(200);
    expect((await readBoard(kv)).entries).toMatchObject([{ wins: 14, losses: 25, points: 0 }]);
  });

  it('does not resurrect an admin-removed entry on save retries or board visits', async () => {
    const { kv, user, save, request } = await setup();
    const event = legacy();
    await save(event);
    await removePlayer(kv, user.id);
    await save(event);
    expect(await (await request('/api/leaderboard')).json()).toMatchObject({ entries: [] });
    expect((await getPlayer(kv, user)).player).toBeNull();
    // The existing reset policy allows returning after a new verified game.
    await submitGame(kv, user, win(), now);
    expect((await readBoard(kv)).entries).toMatchObject([{ points: 3, wins: 14 }]);
  });

  it('ranks tied scores using merged account wins', async () => {
    const { kv, user, save } = await setup();
    const other = { ...user, id: 'other', name: '另一位' };
    const event = legacy(2, 0);
    await syncProgress(kv, other.id, { deviceId: event.deviceId, events: [event] });
    await syncPlayerProgress(kv, other);
    await save(legacy(14, 25));
    expect((await readBoard(kv)).entries.map((entry) => entry.userId)).toEqual([user.id, other.id]);
  });
});

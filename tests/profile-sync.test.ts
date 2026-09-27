import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryKV } from '../server/kv';
import { syncProgress } from '../server/profile';
import { readBoard } from '../server/board';
import { LocalProgress, PROFILE_KEY, PROGRESS_PREFIX } from '../src/profile/localProgress';
import { emptyProgress, type ProgressEvent } from '../src/profile/progress';
import { handleApi, type ApiEnv } from '../server/api';
import { requestOtp, verifyOtp } from '../server/auth';

class Store {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
}
const oldSave = { coins: 2560, gems: 110, crowns: 2, wins: 7, losses: 3, draws: 1, streak: 2, bestStreak: 4, nickname: '大帅', muted: true };
function device(save = oldSave) {
  const storage = new Store();
  storage.setItem(PROFILE_KEY, JSON.stringify(save));
  return { storage, local: new LocalProgress(storage) };
}
async function upload(kv: MemoryKV, local: LocalProgress, userId = 'alice') {
  const result = await syncProgress(kv, userId, { deviceId: local.deviceId, events: local.pending(userId) });
  local.accept(userId, result);
  return result;
}

describe('legacy and cross-device personal progress', () => {
  it('imports old rewards and stats once across reload, lost response and repeated login, without ranked points', async () => {
    const kv = new MemoryKV();
    const { storage, local } = device();
    expect(local.totals()).toMatchObject(oldSaveNumbers());
    local.setAccount('alice');
    const pending = local.pending();
    await syncProgress(kv, 'alice', { deviceId: local.deviceId, events: pending }); // response lost
    const reloaded = new LocalProgress(storage);
    reloaded.setAccount('alice');
    expect(reloaded.pending()[0].id).toBe(pending[0].id);
    expect((await upload(kv, reloaded)).profile).toMatchObject(oldSaveNumbers());
    reloaded.setAccount(null);
    reloaded.setAccount('alice');
    expect((await upload(kv, reloaded)).revision).toBe(1);
    expect(reloaded.totals()).toMatchObject(oldSaveNumbers());
    expect((await readBoard(kv)).entries).toEqual([]);
    expect(JSON.parse(storage.getItem(PROFILE_KEY)!).coins).toBe(2560); // intact original backup
  });

  it('merges independent devices concurrently and pulls remote balances without reimporting them', async () => {
    const kv = new MemoryKV();
    const a = device(), b = device({ ...oldSave, coins: 100, wins: 2 });
    a.local.setAccount('alice'); b.local.setAccount('alice');
    await Promise.all([upload(kv, a.local), upload(kv, b.local)]);
    await upload(kv, a.local);
    expect(a.local.totals()).toMatchObject({ coins: 2660, wins: 9, gems: 220 });
    const again = new LocalProgress(a.storage);
    again.setAccount('alice');
    await upload(kv, again);
    expect(again.pending()).toEqual([]);
    expect(again.totals().coins).toBe(2660);
    again.record(again.totals(), { coins: 2720, wins: 10, streak: 3 });
    await upload(kv, again);
    await upload(kv, b.local);
    expect(b.local.totals()).toMatchObject({ coins: 2720, wins: 10, streak: 3 });
  });

  it('retains the import receipt if an old tab overwrites the original v1 key', async () => {
    const kv = new MemoryKV(); const { local, storage } = device();
    local.setAccount('alice'); await upload(kv, local);
    storage.setItem(PROFILE_KEY, JSON.stringify(oldSave));
    const reloaded = new LocalProgress(storage);
    reloaded.setAccount('alice');
    expect((await upload(kv, reloaded)).profile.coins).toBe(2560);
    expect(reloaded.pending()).toHaveLength(0);
  });

  it('keeps new local changes made during an upload and rejects stale responses', async () => {
    const kv = new MemoryKV();
    const { local } = device(); local.setAccount('alice');
    const first = await syncProgress(kv, 'alice', { deviceId: local.deviceId, events: local.pending() });
    local.record(local.totals(), { coins: 2620 });
    local.accept('alice', first);
    expect(local.totals().coins).toBe(2620);
    const second = await upload(kv, local);
    local.accept('alice', first);
    expect(local.totals().coins).toBe(2620);
    expect(second.revision).toBe(2);
  });

  it('does not share account balances on sign-out or switching accounts; new guest progress remains claimable', async () => {
    const kv = new MemoryKV(); const { local } = device();
    local.setAccount('alice'); await upload(kv, local);
    local.setAccount(null);
    expect(local.totals().coins).toBe(0);
    local.record(local.totals(), { coins: 60, wins: 1, streak: 1 });
    local.setAccount('bob'); await upload(kv, local, 'bob');
    expect(local.totals()).toMatchObject({ coins: 60, wins: 1, gems: 0 });
    local.setAccount('alice'); await upload(kv, local);
    expect(local.totals()).toMatchObject(oldSaveNumbers());
  });

  it('preserves changes from separate tabs in per-event keys', async () => {
    const kv = new MemoryKV(); const { local: a, storage } = device();
    a.setAccount('alice'); await upload(kv, a);
    const b = new LocalProgress(storage);
    const beforeA = a.totals(), beforeB = b.totals();
    a.record(beforeA, { coins: beforeA.coins + 60 });
    b.record(beforeB, { coins: beforeB.coins + 150 });
    expect(a.pending()).toHaveLength(2);
    expect((await upload(kv, a)).profile.coins).toBe(2770);
    expect(b.totals().coins).toBe(2770);
  });

  it('keeps replaying durable events when a checkpoint cannot be saved', async () => {
    const kv = new MemoryKV(); const { local, storage } = device(); local.setAccount('alice');
    local.record(local.totals(), { coins: 2620 });
    const original = storage.setItem.bind(storage);
    storage.setItem = (key, value) => { if (key.includes('cache:')) throw new Error('full'); original(key, value); };
    await upload(kv, local);
    expect([...storage.data.keys()].some((key) => key.includes('event:'))).toBe(true);
    storage.setItem = original;
    const reloaded = new LocalProgress(storage);
    expect((await upload(kv, reloaded)).profile.coins).toBe(2620);
  });

  it('deduplicates concurrent copies of one import and prevents claiming it for another account', async () => {
    const kv = new MemoryKV(); const { local } = device(); local.setAccount('alice');
    const body = { deviceId: local.deviceId, events: local.pending() };
    const responses = await Promise.all(Array.from({ length: 8 }, () => syncProgress(kv, 'alice', body)));
    expect(responses.every((r) => r.profile.coins === 2560 && r.revision === 1)).toBe(true);
    await expect(syncProgress(kv, 'bob', body)).rejects.toMatchObject({ code: 'profile_owner' });
  });

  it('does not let historical streaks overwrite a newer completed-game streak', async () => {
    const kv = new MemoryKV(); const { local } = device(); local.setAccount('alice');
    const live: ProgressEvent = { id: crypto.randomUUID(), deviceId: local.deviceId, kind: 'update', at: Date.now(), values: { losses: 1 }, streak: 0 };
    await syncProgress(kv, 'alice', { deviceId: local.deviceId, events: [live] });
    expect((await upload(kv, local)).profile).toMatchObject({ streak: 0, bestStreak: 4, losses: 4 });
  });
});
function oldSaveNumbers() { const { nickname: _n, muted: _m, ...numbers } = oldSave; return numbers; }

describe('personal-save API', () => {
  it('requires login, the matching account, a same-origin write and valid bounded data', async () => {
    const env: ApiEnv = { auth: new MemoryKV(), board: new MemoryKV(), secret: 'test-secret-at-least-16-characters', adminEmails: new Set(), exposeDevCode: true };
    const url = 'https://game.test/api/profile';
    const request = (body: unknown, cookie = '', origin = 'https://game.test') => handleApi(new Request(url, { method: 'POST', headers: { cookie, origin }, body: JSON.stringify(body) }), env);
    expect((await request({})).status).toBe(401);
    const { otp } = await requestOtp(env, 'a@example.com');
    const { user, token } = await verifyOtp(env, 'a@example.com', otp);
    // Reuse the server's cookie serializer rather than duplicating its cookie name.
    const { sessionCookie } = await import('../server/auth');
    const cookie = sessionCookie(token, Date.now() + 10000, true).split(';')[0];
    const { local } = device(); local.setAccount(user.id);
    const body = { userId: user.id, deviceId: local.deviceId, events: local.pending() };
    expect((await request(body, cookie, 'https://evil.test')).status).toBe(403);
    expect((await request({ ...body, userId: 'other' }, cookie)).status).toBe(409);
    expect((await request({ ...body, events: [{ ...body.events[0], values: { coins: -1 } }] }, cookie)).status).toBe(400);
    expect((await request(body, cookie)).status).toBe(200);
    expect((await request({ ...body, padding: 'x'.repeat(65000) }, cookie)).status).toBe(413);
  });
});

describe('automatic save synchronization', () => {
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
  it('imports immediately on login, batches changes, retries offline and pulls another device on resume', async () => {
    vi.resetModules(); vi.useFakeTimers();
    const storage = new Store(); storage.setItem(PROFILE_KEY, JSON.stringify(oldSave));
    vi.stubGlobal('localStorage', storage); vi.stubGlobal('window', new EventTarget());
    const doc = Object.assign(new EventTarget(), { hidden: false }); vi.stubGlobal('document', doc);
    const kv = new MemoryKV();
    const { ProfileSync } = await import('../src/net/profileSync');
    const { getProfile, updateProfile } = await import('../src/app/storage');
    const request = vi.fn(async (body) => syncProgress(kv, body.userId, body));
    const service = new ProfileSync(request);
    expect(request).not.toHaveBeenCalled();
    service.setUser('alice'); await service.sync();
    expect(service.state).toBe('synced');
    request.mockRejectedValueOnce(new Error('offline'));
    updateProfile((p) => ({ coins: p.coins + 60 }));
    await vi.advanceTimersByTimeAsync(250);
    expect(service.state).toBe('error'); expect(getProfile().coins).toBe(2620);
    await vi.advanceTimersByTimeAsync(30000);
    expect(service.state).toBe('synced'); expect(getProfile().coins).toBe(2620);
    const other = device({ ...oldSave, ...emptyProgress(), coins: 100 }); other.local.setAccount('alice'); await upload(kv, other.local);
    doc.dispatchEvent(new Event('visibilitychange')); await service.sync();
    expect(getProfile().coins).toBe(2720);
    expect([...storage.data.keys()].filter((key) => key.startsWith(PROGRESS_PREFIX + 'event:'))).toEqual([]);
    service.setUser(null);
  });
});

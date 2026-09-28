import { describe, expect, it } from 'vitest';

import { handleApi, type ApiEnv } from '../server/api';
import { AuthError, OTP_MAX_ATTEMPTS, requestOtp, signOut, userForToken, verifyOtp } from '../server/auth';
import { BoardError, judge, readBoard, submitGame as recordGame, SUBMIT_INTERVAL_MS } from '../server/board';
import { MemoryKV, type KV } from '../server/kv';
import type { User } from '../server/auth';

const submitGame = (kv: KV, user: User, body: Record<string, unknown>, now = Date.now()) =>
  recordGame(kv, user, { gameId: crypto.randomUUID(), finishedAt: now, ...body }, now);

function makeEnv(overrides: Partial<ApiEnv> = {}): ApiEnv {
  return { auth: new MemoryKV(), board: new MemoryKV(), secret: 'test-secret-0123456789', adminEmails: new Set(['boss@example.com']), exposeDevCode: true, ...overrides };
}

async function signIn(env: ApiEnv, email: string, name?: string) {
  const { otp } = await requestOtp(env, email);
  return verifyOtp(env, email, otp, name);
}

/** Black makes five on row 7 while white plays row 9. */
const BLACK_FIVE: Array<[number, number]> = [
  [3, 7], [3, 9], [4, 7], [4, 9], [5, 7], [5, 9], [6, 7], [6, 9], [7, 7],
];

describe('email sign-in', () => {
  it('signs in with the mailed code, creates the user once, and resolves the session', async () => {
    const env = makeEnv();
    const first = await signIn(env, ' Player@Example.com ', '小明');
    expect(first.user.email).toBe('player@example.com');
    expect(first.user.name).toBe('小明');
    expect(first.user.role).toBe('user');
    expect(await userForToken(env, first.token)).toMatchObject({ id: first.user.id });

    // Second sign-in (after the resend window) reuses the same account.
    let clock = Date.now() + 61_000;
    env.now = () => clock;
    const second = await signIn(env, 'player@example.com');
    expect(second.user.id).toBe(first.user.id);
    expect(second.token).not.toBe(first.token);

    await signOut(env, first.token);
    expect(await userForToken(env, first.token)).toBeNull();
    expect(await userForToken(env, second.token)).not.toBeNull();
    clock += 31 * 24 * 3600 * 1000;
    expect(await userForToken(env, second.token)).toBeNull();
  });

  it('marks ADMIN_EMAILS as admins', async () => {
    const env = makeEnv();
    expect((await signIn(env, 'boss@example.com')).user.role).toBe('admin');
  });

  it('uses the current admin allowlist for existing accounts and sessions', async () => {
    const env = makeEnv();
    const { user, token } = await signIn(env, 'player@example.com');
    expect(user.role).toBe('user');
    env.adminEmails.add(user.email);
    expect(await userForToken(env, token)).toMatchObject({ role: 'admin' });
    env.adminEmails.delete(user.email);
    expect(await userForToken(env, token)).toMatchObject({ role: 'user' });
  });

  it('reserves only one code when send requests race', async () => {
    const env = makeEnv();
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => requestOtp(env, 'race@example.com')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('consumes a correct code only once under concurrent verification', async () => {
    const env = makeEnv();
    const { otp } = await requestOtp(env, 'once@example.com');
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => verifyOtp(env, 'once@example.com', otp)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await expect(requestOtp(env, 'once@example.com')).rejects.toMatchObject({ status: 429 });
  });

  it('rejects bad emails, throttles resends and expires codes', async () => {
    const env = makeEnv();
    await expect(requestOtp(env, 'nope')).rejects.toMatchObject({ code: 'invalid_email' });
    let clock = 1_000_000;
    env.now = () => clock;
    const { otp } = await requestOtp(env, 'a@b.co');
    await expect(requestOtp(env, 'a@b.co')).rejects.toMatchObject({ status: 429, code: 'too_soon' });
    clock += 11 * 60 * 1000;
    await expect(verifyOtp(env, 'a@b.co', otp)).rejects.toMatchObject({ code: 'expired' });
  });

  it('allows only a handful of guesses per code, even in parallel', async () => {
    const env = makeEnv();
    const { otp } = await requestOtp(env, 'target@example.com');
    const wrong = otp === '000000' ? '111111' : '000000';
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => verifyOtp(env, 'target@example.com', wrong)));
    const checked = results.filter((r) => r.status === 'rejected' && (r.reason as AuthError).code === 'wrong_code').length;
    expect(checked).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    // The code is burnt afterwards, even the right one no longer works.
    await expect(verifyOtp(env, 'target@example.com', otp)).rejects.toBeInstanceOf(AuthError);
  });

  it('only accepts the code sent to that address', async () => {
    const env = makeEnv();
    const { otp } = await requestOtp(env, 'one@example.com');
    await expect(verifyOtp(env, 'two@example.com', otp)).rejects.toMatchObject({ code: 'expired' });
  });
});

describe('replay judge', () => {
  it('scores a real five for the right colour', () => {
    expect(judge({ mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE })).toBe('win');
    expect(judge({ mode: 'ai', brain: 'fox', myStone: 2, moves: BLACK_FIVE })).toBe('loss');
  });

  it('rejects unfinished games, illegal moves and moves after the end', () => {
    expect(() => judge({ mode: 'ai', brain: 'owl', myStone: 1, moves: BLACK_FIVE.slice(0, 7) })).toThrow(BoardError);
    expect(() => judge({ mode: 'ai', brain: 'owl', myStone: 1, moves: [[7, 7], [7, 7]] })).toThrow(/不合法/);
    expect(() => judge({ mode: 'ai', brain: 'owl', myStone: 1, moves: [...BLACK_FIVE, [0, 0]] })).toThrow(/结束后/);
  });

  it('counts resignations only after both sides moved', () => {
    const five: Array<[number, number]> = [[7, 7], [8, 8], [6, 6], [9, 9], [5, 7]];
    expect(judge({ mode: 'online', myStone: 1, moves: five, resigned: 2 })).toBe('win');
    expect(judge({ mode: 'online', myStone: 1, moves: five, resigned: 1 })).toBe('loss');
    expect(() => judge({ mode: 'online', myStone: 1, moves: [[7, 7]], resigned: 2 })).toThrow(/太短/);
    // Under the RIF opening one player places the first three stones: a resign then earns nothing.
    expect(() => judge({ mode: 'online', myStone: 1, moves: [[7, 7], [7, 6], [8, 5]], resigned: 2 })).toThrow(/太短/);
  });
});

describe('leaderboard', () => {
  it('merges two devices and treats retries of the same game as one result', async () => {
    const env = makeEnv();
    const { user } = await signIn(env, 'devices@example.com');
    const firstDevice = { gameId: crypto.randomUUID(), finishedAt: 1000, mode: 'ai', brain: 'sprout', myStone: 1, moves: BLACK_FIVE };
    const secondDevice = { ...firstDevice, gameId: crypto.randomUUID(), finishedAt: 2000, brain: 'owl' };
    const now = Date.now();
    const sameGame = await Promise.all(Array.from({ length: 5 }, () => submitGame(env.board, user, firstDevice, now)));
    expect(sameGame.filter((r) => !r.duplicate)).toHaveLength(1);
    const merged = await submitGame(env.board, user, secondDevice, now + SUBMIT_INTERVAL_MS);
    expect(merged.player).toMatchObject({ points: 7, wins: 2, losses: 0, bestStreak: 2 });
    await submitGame(env.board, user, firstDevice, now + 2 * SUBMIT_INTERVAL_MS);
    expect((await readBoard(env.board)).entries[0]).toMatchObject({ points: 7, wins: 2 });
  });

  it('recomputes streaks when an older offline loss arrives from another device', async () => {
    const env = makeEnv();
    const { user } = await signIn(env, 'offline@example.com');
    const now = Date.now();
    const win = { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE };
    await submitGame(env.board, user, { ...win, finishedAt: 1000 }, now);
    await submitGame(env.board, user, { ...win, finishedAt: 3000 }, now + SUBMIT_INTERVAL_MS);
    const merged = await submitGame(env.board, user, { ...win, myStone: 2, finishedAt: 2000 }, now + 2 * SUBMIT_INTERVAL_MS);
    expect(merged.player).toMatchObject({ points: 6, wins: 2, losses: 1, streak: 1, bestStreak: 1 });
  });

  it('retries after a board write failure without awarding the saved game again', async () => {
    const env = makeEnv();
    const { user } = await signIn(env, 'retry@example.com');
    const body = { gameId: crypto.randomUUID(), finishedAt: Date.now(), mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE };
    let failed = false;
    const flaky: KV = {
      get: (key) => env.board.get(key), list: (prefix) => env.board.list(prefix), delete: (key) => env.board.delete(key),
      set: (key, value, options) => {
        if (key === 'board' && !failed) { failed = true; throw new Error('connection lost'); }
        return env.board.set(key, value, options);
      },
    };
    await expect(submitGame(flaky, user, body)).rejects.toThrow('connection lost');
    const retry = await submitGame(flaky, user, body);
    expect(retry).toMatchObject({ duplicate: true, player: { points: 3, wins: 1 } });
    expect((await readBoard(env.board)).entries[0]).toMatchObject({ points: 3, wins: 1 });
  });

  it('awards points by opponent, ranks players and rate-limits submissions', async () => {
    const env = makeEnv();
    const alice = (await signIn(env, 'alice@example.com', 'Alice')).user;
    const bob = (await signIn(env, 'bob@example.com', 'Bob')).user;
    const t0 = Date.now();
    const a1 = await submitGame(env.board, alice, { mode: 'ai', brain: 'owl', myStone: 1, moves: BLACK_FIVE }, t0);
    expect(a1).toMatchObject({ result: 'win', points: 6, rank: 1 });
    await expect(submitGame(env.board, alice, { mode: 'ai', brain: 'owl', myStone: 1, moves: BLACK_FIVE }, t0 + 1000)).rejects.toMatchObject({ status: 429 });
    const b1 = await submitGame(env.board, bob, { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }, t0);
    expect(b1).toMatchObject({ points: 3, rank: 2 });
    const b2 = await submitGame(env.board, bob, { mode: 'online', myStone: 1, moves: BLACK_FIVE }, t0 + SUBMIT_INTERVAL_MS);
    expect(b2).toMatchObject({ points: 5, rank: 1 });
    const board = await readBoard(env.board);
    expect(board.entries.map((e) => [e.name, e.points])).toEqual([
      ['Bob', 8],
      ['Alice', 6],
    ]);
    // A loss adds no points but is recorded.
    const a2 = await submitGame(env.board, alice, { mode: 'ai', brain: 'sprout', myStone: 2, moves: BLACK_FIVE }, t0 + SUBMIT_INTERVAL_MS);
    expect(a2).toMatchObject({ result: 'loss', points: 0 });
    expect(a2.player).toMatchObject({ losses: 1, streak: 0, bestStreak: 1 });
  });

  it('gives a 托管 game to the master, not the player, and never master against master', async () => {
    const env = makeEnv();
    const alice = (await signIn(env, 'alice@example.com', 'Alice')).user;
    const t0 = Date.now();
    const gameId = crypto.randomUUID();
    const won = await submitGame(env.board, alice, { gameId, mode: 'online', myStone: 1, moves: BLACK_FIVE, delegated: true, showName: true }, t0);
    expect(won).toMatchObject({ result: 'win', points: 0, duplicate: false });
    expect(won.player).toMatchObject({ points: 0, wins: 0, losses: 0, streak: 0 });
    const board = await readBoard(env.board);
    expect(board.master).toMatchObject({ wins: 1, points: 10, delegated: 1 });
    expect(board.master?.recent[0]).toMatchObject({ kind: 'delegate', result: 'win', name: 'Alice' });
    const again = await submitGame(env.board, alice, { gameId, mode: 'online', myStone: 1, moves: BLACK_FIVE, delegated: true }, t0 + SUBMIT_INTERVAL_MS);
    expect(again).toMatchObject({ duplicate: true });
    // Both sides on 托管, or 托管 against a taken-over opponent: the master played itself.
    await submitGame(env.board, alice, { mode: 'online', myStone: 1, moves: BLACK_FIVE, delegated: true, opponentDelegated: true }, t0 + 2 * SUBMIT_INTERVAL_MS);
    await submitGame(env.board, alice, { mode: 'online', myStone: 1, moves: BLACK_FIVE, delegated: true, takeover: true }, t0 + 3 * SUBMIT_INTERVAL_MS);
    expect((await readBoard(env.board)).master).toMatchObject({ wins: 1, delegated: 1 });
    expect((await readBoard(env.board)).entries.find((e) => e.userId === alice.id)).toMatchObject({ points: 0, wins: 0 });
  });

  it('ranks the master (龙九段) by its games against people, hiding names by default', async () => {
    const env = makeEnv();
    const bob = (await signIn(env, 'bob@example.com', 'Bob')).user;
    const t0 = Date.now();
    // Bob (white) loses to the master: +10 for the master, a loss for Bob.
    const lost = await submitGame(env.board, bob, { mode: 'ai', brain: 'master', myStone: 2, moves: BLACK_FIVE }, t0);
    expect(lost.player).toMatchObject({ losses: 1 });
    expect(lost.rank).toBe(2);
    // The master took over Bob's departed online opponent and lost: Bob gets online points.
    const beat = await submitGame(env.board, bob, { mode: 'online', myStone: 1, moves: BLACK_FIVE, takeover: true, showName: true }, t0 + SUBMIT_INTERVAL_MS);
    expect(beat).toMatchObject({ result: 'win', points: 5 });
    const board = await readBoard(env.board);
    expect(board.master).toMatchObject({ wins: 1, losses: 1, points: 10, challenges: 1, takeovers: 1 });
    expect(board.master?.recent.map((g) => [g.kind, g.result, g.name])).toEqual([['takeover', 'loss', 'Bob'], ['challenge', 'win', null]]);
    expect(board.entries.map((e) => [e.name, e.points])).toEqual([['龙九段', 10], ['Bob', 5]]);
    // Other games leave the master alone, and publishing players keeps its entry.
    await submitGame(env.board, bob, { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }, t0 + 2 * SUBMIT_INTERVAL_MS);
    const after = await readBoard(env.board);
    expect(after.master).toMatchObject({ wins: 1, losses: 1 });
    expect(after.entries.map((e) => [e.name, e.points])).toEqual([['龙九段', 10], ['Bob', 8]]);
  });

  it('credits the master once per game, even across failures and duplicate submissions', async () => {
    const env = makeEnv();
    const alice = (await signIn(env, 'alice@example.com', 'Alice')).user;
    const t0 = Date.now();
    const body = { gameId: crypto.randomUUID(), mode: 'ai', brain: 'master', myStone: 2, moves: BLACK_FIVE };
    await Promise.all(Array.from({ length: 5 }, () => submitGame(env.board, alice, body, t0)));
    expect((await readBoard(env.board)).master).toMatchObject({ challenges: 1, wins: 1 });

    // The master's update fails once: the retry (a duplicate for the player) finishes it.
    const kv = env.board as MemoryKV;
    const realSet = kv.set.bind(kv);
    let failed = false;
    kv.set = async (key, value, options) => {
      if (key === 'board' && !failed && (value as { master?: { challenges: number } }).master?.challenges === 2) {
        failed = true;
        throw new Error('connection lost');
      }
      return realSet(key, value, options);
    };
    const second = { ...body, gameId: crypto.randomUUID() };
    await expect(submitGame(env.board, alice, second, t0 + SUBMIT_INTERVAL_MS)).rejects.toThrow('connection lost');
    expect((await readBoard(env.board)).master).toMatchObject({ challenges: 1 });
    const retry = await submitGame(env.board, alice, second, t0 + 2 * SUBMIT_INTERVAL_MS);
    expect(retry).toMatchObject({ duplicate: true });
    expect((await readBoard(env.board)).master).toMatchObject({ challenges: 2, wins: 2, points: 20 });
    await submitGame(env.board, alice, second, t0 + 3 * SUBMIT_INTERVAL_MS);
    expect((await readBoard(env.board)).master).toMatchObject({ challenges: 2 });
  });

  it('keeps every player when many submit at once', async () => {
    const env = makeEnv();
    const users = await Promise.all(Array.from({ length: 12 }, (_, i) => signIn(env, `p${i}@example.com`, `P${i}`)));
    await Promise.all(users.map(({ user }) => submitGame(env.board, user, { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE })));
    const board = await readBoard(env.board);
    expect(board.entries).toHaveLength(12);
    expect(board.version).toBe(12);
  });
});

describe('api', () => {
  const origin = 'http://game.test';
  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(path === '/api/results' ? { gameId: crypto.randomUUID(), finishedAt: Date.now(), ...body as object } : body) });

  it('runs the whole flow: sign in, submit, read the board with ETag polling, sign out', async () => {
    const env = makeEnv();
    const sent = (await (await handleApi(post('/api/auth/email-otp', { email: 'me@example.com' }), env)).json()) as { devCode: string };
    const verify = await handleApi(post('/api/auth/verify', { email: 'me@example.com', code: sent.devCode, name: '我' }), env);
    expect(verify.status).toBe(200);
    const cookie = verify.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/gomoku_session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax/);
    const session = cookie.split(';')[0];
    const signedIn = (await verify.json()) as { user: { id: string } };

    const unauth = await handleApi(post('/api/results', { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }), env);
    expect(unauth.status).toBe(401);
    const result = await handleApi(post('/api/results', { userId: signedIn.user.id, mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }, { cookie: session }), env);
    expect(await result.json()).toMatchObject({ result: 'win', points: 3, rank: 1 });

    const board = await handleApi(new Request(`${origin}/api/leaderboard`, { headers: { cookie: session } }), env);
    const etag = board.headers.get('etag') ?? '';
    expect(await board.json()).toMatchObject({ entries: [{ name: '我', points: 3 }] });
    const unchanged = await handleApi(new Request(`${origin}/api/leaderboard`, { headers: { 'if-none-match': etag, cookie: session } }), env);
    expect(unchanged.status).toBe(304);

    const me = await handleApi(new Request(`${origin}/api/me`, { headers: { cookie: session } }), env);
    expect(await me.json()).toMatchObject({ user: { name: '我' }, rank: 1, player: { wins: 1 } });

    const renamed = await handleApi(new Request(`${origin}/api/me`, { method: 'PATCH', headers: { cookie: session, origin, 'content-type': 'application/json' }, body: JSON.stringify({ name: '<b>棋王</b>' }) }), env);
    expect(await renamed.json()).toMatchObject({ user: { name: 'b棋王/b' } });
    const after = await handleApi(new Request(`${origin}/api/leaderboard`, { headers: { 'if-none-match': etag, cookie: session } }), env);
    expect(after.status).toBe(200);

    await handleApi(post('/api/auth/sign-out', {}, { cookie: session }), env);
    const gone = await handleApi(new Request(`${origin}/api/auth/session`, { headers: { cookie: session } }), env);
    expect(await gone.json()).toEqual({ user: null });
  });

  it('fails closed without production email configuration, and blocks cross-site writes', async () => {
    const env = makeEnv({ resendApiKey: undefined, exposeDevCode: false });
    const sent = await handleApi(post('/api/auth/email-otp', { email: 'x@example.com' }), env);
    expect(sent.status).toBe(503);
    expect(await sent.json()).toMatchObject({ error: { code: 'email_not_configured' } });
    expect(await env.auth.list('otp/')).toHaveLength(0);
    const cross = await handleApi(post('/api/auth/email-otp', { email: 'x@example.com' }, { origin: 'https://evil.example' }), env);
    expect(cross.status).toBe(403);
    const wrongScheme = await handleApi(post('/api/auth/email-otp', { email: 'x@example.com' }, { origin: 'https://game.test' }), env);
    expect(wrongScheme.status).toBe(403);
  });

  it('requires sign-in to view scores and refuses a queued game bound to another account', async () => {
    const env = makeEnv();
    const anonymous = await handleApi(new Request(`${origin}/api/leaderboard`), env);
    expect(anonymous.status).toBe(401);
    const { token } = await signIn(env, 'another@example.com');
    const wrongAccount = await handleApi(post('/api/results', { userId: 'old-account', mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }, { cookie: `gomoku_session=${token}` }), env);
    expect(wrongAccount.status).toBe(409);
    expect(await env.board.list('players/')).toHaveLength(0);
  });

  it('lets only admins remove players', async () => {
    const env = makeEnv();
    const cheater = await signIn(env, 'cheat@example.com');
    await submitGame(env.board, cheater.user, { mode: 'ai', brain: 'owl', myStone: 1, moves: BLACK_FIVE });
    const admin = await signIn(env, 'boss@example.com');
    const del = (token: string) =>
      handleApi(new Request(`${origin}/api/admin/players/${cheater.user.id}`, { method: 'DELETE', headers: { origin, cookie: `gomoku_session=${token}` } }), env);
    expect((await del(cheater.token)).status).toBe(403);
    expect((await del(admin.token)).status).toBe(200);
    expect((await readBoard(env.board)).entries).toHaveLength(0);
  });
});

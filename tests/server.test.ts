import { describe, expect, it } from 'vitest';

import { handleApi, type ApiEnv } from '../server/api';
import { AuthError, OTP_MAX_ATTEMPTS, requestOtp, signOut, userForToken, verifyOtp } from '../server/auth';
import { BoardError, judge, readBoard, submitGame, SUBMIT_INTERVAL_MS } from '../server/board';
import { MemoryKV } from '../server/kv';

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
    expect(judge({ mode: 'online', myStone: 1, moves: [[7, 7], [8, 8]], resigned: 2 })).toBe('win');
    expect(judge({ mode: 'online', myStone: 1, moves: [[7, 7], [8, 8]], resigned: 1 })).toBe('loss');
    expect(() => judge({ mode: 'online', myStone: 1, moves: [[7, 7]], resigned: 2 })).toThrow(/太短/);
  });
});

describe('leaderboard', () => {
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
    new Request(`${origin}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', origin, ...headers }, body: JSON.stringify(body) });

  it('runs the whole flow: sign in, submit, read the board with ETag polling, sign out', async () => {
    const env = makeEnv();
    const sent = (await (await handleApi(post('/api/auth/email-otp', { email: 'me@example.com' }), env)).json()) as { devCode: string };
    const verify = await handleApi(post('/api/auth/verify', { email: 'me@example.com', code: sent.devCode, name: '我' }), env);
    expect(verify.status).toBe(200);
    const cookie = verify.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/gomoku_session=[0-9a-f]{64}; Path=\/; HttpOnly; SameSite=Lax/);
    const session = cookie.split(';')[0];

    const unauth = await handleApi(post('/api/results', { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }), env);
    expect(unauth.status).toBe(401);
    const result = await handleApi(post('/api/results', { mode: 'ai', brain: 'fox', myStone: 1, moves: BLACK_FIVE }, { cookie: session }), env);
    expect(await result.json()).toMatchObject({ result: 'win', points: 3, rank: 1 });

    const board = await handleApi(new Request(`${origin}/api/leaderboard`), env);
    const etag = board.headers.get('etag') ?? '';
    expect(await board.json()).toMatchObject({ entries: [{ name: '我', points: 3 }] });
    const unchanged = await handleApi(new Request(`${origin}/api/leaderboard`, { headers: { 'if-none-match': etag } }), env);
    expect(unchanged.status).toBe(304);

    const me = await handleApi(new Request(`${origin}/api/me`, { headers: { cookie: session } }), env);
    expect(await me.json()).toMatchObject({ user: { name: '我' }, rank: 1, player: { wins: 1 } });

    const renamed = await handleApi(new Request(`${origin}/api/me`, { method: 'PATCH', headers: { cookie: session, origin, 'content-type': 'application/json' }, body: JSON.stringify({ name: '<b>棋王</b>' }) }), env);
    expect(await renamed.json()).toMatchObject({ user: { name: 'b棋王/b' } });
    const after = await handleApi(new Request(`${origin}/api/leaderboard`, { headers: { 'if-none-match': etag } }), env);
    expect(after.status).toBe(200);

    await handleApi(post('/api/auth/sign-out', {}, { cookie: session }), env);
    const gone = await handleApi(new Request(`${origin}/api/auth/session`, { headers: { cookie: session } }), env);
    expect(await gone.json()).toEqual({ user: null });
  });

  it('never exposes the code when real email is configured, and blocks cross-site writes', async () => {
    const env = makeEnv({ resendApiKey: undefined, exposeDevCode: false });
    const sent = await (await handleApi(post('/api/auth/email-otp', { email: 'x@example.com' }), env)).json();
    expect(sent).toEqual({ ok: true });
    const cross = await handleApi(post('/api/auth/email-otp', { email: 'x@example.com' }, { origin: 'https://evil.example' }), env);
    expect(cross.status).toBe(403);
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

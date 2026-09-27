import {
  AuthError,
  type AuthEnv,
  clearSessionCookie,
  readSessionCookie,
  renameUser,
  requestOtp,
  sessionCookie,
  signOut,
  type User,
  userForToken,
  verifyOtp,
} from './auth';
import { BoardError, getPlayer, removePlayer, renamePlayer, submitGame, syncPlayerProgress } from './board';
import type { KV } from './kv';
import { syncProgress } from './profile';

/**
 * All `/api/*` routes. Runs unchanged in the Netlify Function and in the Vite
 * dev server (with in-memory storage), so the whole flow can be exercised
 * locally.
 */

export type ApiEnv = AuthEnv & {
  board: KV;
};

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

const fail = (status: number, code: string, message: string) => json(status, { error: { code, message } });

const publicUser = (user: User) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Reject cross-site writes (the SameSite cookie already blocks most; this closes the rest). */
function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function handleApi(request: Request, env: ApiEnv): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method.toUpperCase();
  const secure = url.protocol === 'https:';
  if (method !== 'GET' && method !== 'HEAD' && !sameOrigin(request)) return fail(403, 'bad_origin', '来源不被允许');

  try {
    const token = readSessionCookie(request);
    const currentUser = () => userForToken(env, token);

    if (path === '/api/auth/email-otp' && method === 'POST') {
      const body = await readJson(request);
      const { otp } = await requestOtp(env, body.email);
      return json(200, { ok: true, ...(env.exposeDevCode && !env.resendApiKey ? { devCode: otp } : {}) });
    }

    if (path === '/api/auth/verify' && method === 'POST') {
      const body = await readJson(request);
      const { user, token: session, expiresAt } = await verifyOtp(env, body.email, body.code, body.name);
      return json(200, { user: publicUser(user) }, { 'set-cookie': sessionCookie(session, expiresAt, secure) });
    }

    if (path === '/api/auth/session' && method === 'GET') {
      const user = await currentUser();
      return json(200, { user: user ? publicUser(user) : null });
    }

    if (path === '/api/auth/sign-out' && method === 'POST') {
      await signOut(env, token);
      return json(200, { ok: true }, { 'set-cookie': clearSessionCookie(secure) });
    }

    if (path === '/api/leaderboard' && method === 'GET') {
      const user = await currentUser();
      if (!user) return fail(401, 'unauthorized', '登录后查看排行榜');
      const board = await syncPlayerProgress(env.board, user, env.now?.() ?? Date.now());
      const etag = `"v${board.version}"`;
      // Unchanged account totals keep the board version and return no body.
      if (request.headers.get('if-none-match') === etag) return new Response(null, { status: 304, headers: { etag, 'cache-control': 'no-store' } });
      return json(200, board, { etag });
    }

    if (path === '/api/me') {
      const user = await currentUser();
      if (!user) return fail(401, 'unauthorized', '请先登录');
      if (method === 'GET') return json(200, { user: publicUser(user), ...(await getPlayer(env.board, user)) });
      if (method === 'PATCH') {
        const body = await readJson(request);
        const renamed = await renameUser(env, user, body.name);
        await renamePlayer(env.board, renamed);
        return json(200, { user: publicUser(renamed), ...(await getPlayer(env.board, renamed)) });
      }
    }

    if (path === '/api/profile' && method === 'POST') {
      const user = await currentUser();
      if (!user) return fail(401, 'unauthorized', '登录后同步存档');
      const raw = await request.text();
      if (raw.length > 64_000) return fail(413, 'too_large', '存档批次过大');
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw) as Record<string, unknown>; } catch { return fail(400, 'bad_profile', '存档格式不正确'); }
      if (!body || body.userId !== user.id) return fail(409, 'account_changed', '登录账号已切换，请重新登录后同步');
      const now = env.now?.() ?? Date.now();
      const receipt = await syncProgress(env.board, user.id, body, now);
      // Publish before acknowledging; a lost board write is repaired by retrying
      // the same events, without adding their counters again.
      await syncPlayerProgress(env.board, user, now);
      return json(200, receipt);
    }

    if (path === '/api/results' && method === 'POST') {
      const user = await currentUser();
      if (!user) return fail(401, 'unauthorized', '登录后成绩才能上榜');
      const body = await readJson(request);
      // A different tab may have switched the shared cookie to another account.
      if (body.userId !== user.id) return fail(409, 'account_changed', '登录账号已切换，请重新登录后同步');
      const outcome = await submitGame(env.board, user, body, env.now?.() ?? Date.now());
      return json(200, outcome);
    }

    const removal = path.match(/^\/api\/admin\/players\/([0-9a-f]{24})$/);
    if (removal && method === 'DELETE') {
      const user = await currentUser();
      if (!user || user.role !== 'admin') return fail(403, 'forbidden', '需要管理员权限');
      const board = await removePlayer(env.board, removal[1]);
      return json(200, { ok: true, version: board.version });
    }

    return fail(404, 'not_found', '接口不存在');
  } catch (error) {
    if (error instanceof AuthError || error instanceof BoardError) return fail(error.status, error.code, error.message);
    console.error('[api]', error);
    return fail(500, 'server_error', '服务器出错了，请稍后再试');
  }
}

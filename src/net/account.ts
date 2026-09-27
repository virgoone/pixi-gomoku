import type { Stone } from '../gomoku/rules';
import type { Outcome } from '../result/scoring';

/**
 * Client side of the email sign-in and the leaderboard (served by the
 * Netlify Function under /api). The session is an HttpOnly cookie, so this
 * only mirrors who is signed in.
 */

export type PublicUser = { id: string; name: string; email: string; role: 'admin' | 'user' };
export type BoardEntry = { userId: string; name: string; points: number; wins: number; losses: number; draws: number; bestStreak: number };
export type Board = { version: number; updatedAt: number; entries: BoardEntry[] };
export type Player = { points: number; wins: number; losses: number; draws: number; streak: number; bestStreak: number };
export type SubmitResult = { result: 'win' | 'loss' | 'draw'; points: number; rank: number | null; player: Player };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

const API = '/api';

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, 'offline', '网络不可用');
  }
  const type = response.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new ApiError(response.status, 'unavailable', '排行榜服务暂不可用');
  const body = (await response.json()) as T & { error?: { code: string; message: string } };
  if (!response.ok) throw new ApiError(response.status, body.error?.code ?? 'error', body.error?.message ?? '请求失败');
  return body;
}

type Listener = (user: PublicUser | null) => void;

class Account {
  user: PublicUser | null = null;
  /** False until the first session check finished (or failed). */
  known = false;
  /** False when the API is not reachable (e.g. a static preview without functions). */
  available = true;
  private listeners = new Set<Listener>();
  private checking: Promise<void> | null = null;

  onChange(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(user: PublicUser | null) {
    this.user = user;
    this.known = true;
    for (const listener of this.listeners) listener(user);
  }

  refresh() {
    this.checking ??= call<{ user: PublicUser | null }>('/auth/session')
      .then(({ user }) => {
        this.available = true;
        this.set(user);
      })
      .catch(() => {
        this.available = false;
        this.set(null);
      })
      .finally(() => {
        this.checking = null;
      });
    return this.checking;
  }

  /** Mail a code. Locally (no mail provider) the server hands the code back as `devCode`. */
  requestCode(email: string) {
    return call<{ ok: true; devCode?: string }>('/auth/email-otp', { method: 'POST', body: JSON.stringify({ email }) });
  }

  async verify(email: string, code: string, name?: string) {
    const { user } = await call<{ user: PublicUser }>('/auth/verify', { method: 'POST', body: JSON.stringify({ email, code, name }) });
    this.set(user);
    return user;
  }

  async signOut() {
    await call('/auth/sign-out', { method: 'POST', body: '{}' }).catch(() => undefined);
    this.set(null);
  }

  async rename(name: string) {
    const { user } = await call<{ user: PublicUser }>('/me', { method: 'PATCH', body: JSON.stringify({ name }) });
    this.set(user);
    return user;
  }

  me() {
    return call<{ user: PublicUser; player: Player | null; rank: number | null }>('/me');
  }

  /** Send a finished game for the leaderboard. Only AI and online games count. */
  submit(outcome: Outcome) {
    if (outcome.mode === 'local' || !outcome.moves || outcome.myStone === null) return Promise.resolve(null);
    const body = {
      mode: outcome.mode,
      brain: outcome.brain,
      myStone: outcome.myStone,
      moves: outcome.moves,
      resigned: outcome.resignedBy ?? null,
    } satisfies { mode: string; brain?: string; myStone: Stone; moves: Array<[number, number]>; resigned: Stone | null };
    return call<SubmitResult>('/results', { method: 'POST', body: JSON.stringify(body) });
  }
}

export const account = new Account();

/**
 * Poll the leaderboard. The server answers 304 while nothing changed, so a
 * poll every few seconds costs almost nothing ("real-time" on Netlify, which
 * has no long-lived connections).
 */
export class BoardFeed {
  private etag: string | null = null;
  private timer: number | null = null;
  private stopped = true;
  board: Board | null = null;

  constructor(
    private onBoard: (board: Board) => void,
    private onError: (error: ApiError) => void,
    private intervalMs = 4000,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.tick();
  }

  stop() {
    this.stopped = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  /** Fetch right now (e.g. after submitting a result). */
  poke() {
    if (this.stopped) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    void this.tick();
  }

  private onVisibility = () => {
    if (!document.hidden) this.poke();
  };

  private async tick() {
    this.timer = null;
    if (this.stopped) return;
    try {
      const response = await fetch(`${API}/leaderboard`, { cache: 'no-store', headers: this.etag ? { 'if-none-match': this.etag } : {} });
      if (response.status !== 304) {
        const type = response.headers.get('content-type') ?? '';
        if (!response.ok || !type.includes('application/json')) throw new ApiError(response.status, 'unavailable', '排行榜服务暂不可用');
        this.board = (await response.json()) as Board;
        this.etag = response.headers.get('etag');
        if (!this.stopped) this.onBoard(this.board);
      }
    } catch (error) {
      if (!this.stopped) this.onError(error instanceof ApiError ? error : new ApiError(0, 'offline', '网络不可用'));
    }
    // Background tabs stop polling until they become visible again.
    if (!this.stopped && !document.hidden) this.timer = window.setTimeout(() => void this.tick(), this.intervalMs);
  }
}

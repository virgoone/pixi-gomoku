import type { Outcome } from '../result/scoring';
import { ResultQueue } from './resultQueue';

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
  private queue = new ResultQueue((() => { try { return localStorage; } catch { return null; } })());
  private syncing: Promise<Map<string, SubmitResult>> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof window !== 'undefined') window.addEventListener('online', () => void this.refresh());
  }

  onChange(listener: Listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private set(user: PublicUser | null) {
    this.user = user;
    this.known = true;
    for (const listener of this.listeners) listener(user);
    if (user) {
      this.queue.claim(user.id);
      void this.sync();
    } else if (this.retryTimer !== null) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
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
    await call('/auth/sign-out', { method: 'POST', body: '{}' });
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

  /** Always save locally first; only an authenticated account may upload. */
  async submit(outcome: Outcome): Promise<SubmitResult | null> {
    const gameId = this.queue.record(outcome, this.user?.id ?? null);
    if (!gameId) return null;
    if (!this.known) await this.refresh();
    if (!this.user) return null;
    this.queue.claim(this.user.id);
    return (await this.sync()).get(gameId) ?? null;
  }

  get pendingGames() {
    return this.user ? this.queue.pending(this.user.id).length : this.queue.all().filter((entry) => entry.ownerId === null && !entry.rejected).length;
  }

  sync(): Promise<Map<string, SubmitResult>> {
    if (!this.user) return Promise.resolve(new Map());
    if (this.syncing) return this.syncing;
    const userId = this.user.id;
    this.syncing = (async () => {
      const results = new Map<string, SubmitResult>();
      for (const entry of this.queue.pending(userId)) {
        if (this.user?.id !== userId) break;
        try {
          const result = await call<SubmitResult>('/results', { method: 'POST', body: JSON.stringify({ ...entry.submission, userId }) });
          this.queue.acknowledge(entry.submission.gameId);
          results.set(entry.submission.gameId, result);
          for (const listener of this.listeners) listener(this.user);
        } catch (error) {
          if (error instanceof ApiError && (error.status === 400 || error.status === 422)) {
            this.queue.reject(entry, error.message);
            continue;
          }
          if (error instanceof ApiError && (error.status === 401 || error.code === 'account_changed')) this.set(null);
          else {
            if (this.retryTimer !== null) clearTimeout(this.retryTimer);
            this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.sync(); }, error instanceof ApiError && error.status === 429 ? 8200 : 30_000);
          }
          break;
        }
      }
      return results;
    })().finally(() => {
      this.syncing = null;
      if (this.user && this.pendingGames && this.retryTimer === null) {
        this.retryTimer = setTimeout(() => { this.retryTimer = null; void this.sync(); }, 100);
      }
    });
    return this.syncing;
  }
}

export const account = new Account();

/**
 * Poll the leaderboard while visible. A 304 avoids downloading an unchanged
 * board, but authentication, function invocations and storage reads still run.
 */
export class BoardFeed {
  private etag: string | null = null;
  private timer: number | null = null;
  private stopped = true;
  private generation = 0;
  private inFlight: number | null = null;
  board: Board | null = null;

  constructor(
    private onBoard: (board: Board) => void,
    private onError: (error: ApiError) => void,
    private intervalMs = 4000,
  ) {}

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.generation += 1;
    document.addEventListener('visibilitychange', this.onVisibility);
    void this.tick();
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisibility);
  }

  reset() {
    this.stop();
    this.etag = null;
    this.board = null;
  }

  /** Fetch right now (e.g. after submitting a result). */
  poke() {
    if (this.stopped) return;
    if (this.timer !== null) window.clearTimeout(this.timer);
    void this.tick();
  }

  private onVisibility = () => {
    if (!document.hidden) this.poke();
    else if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
  };

  private async tick() {
    this.timer = null;
    if (this.stopped || document.hidden || this.inFlight === this.generation) return;
    const generation = this.generation;
    this.inFlight = generation;
    try {
      const response = await fetch(`${API}/leaderboard`, { cache: 'no-store', headers: this.etag ? { 'if-none-match': this.etag } : {} });
      if (this.stopped || generation !== this.generation) return;
      if (response.status !== 304) {
        const type = response.headers.get('content-type') ?? '';
        if (response.status === 401) {
          void account.refresh();
          throw new ApiError(401, 'unauthorized', '请重新登录后查看排行榜');
        }
        if (!response.ok || !type.includes('application/json')) throw new ApiError(response.status, 'unavailable', '排行榜服务暂不可用');
        const board = (await response.json()) as Board;
        if (this.stopped || generation !== this.generation) return;
        this.board = board;
        this.etag = response.headers.get('etag');
        if (!this.stopped && generation === this.generation) this.onBoard(this.board);
      }
    } catch (error) {
      if (!this.stopped && generation === this.generation) this.onError(error instanceof ApiError ? error : new ApiError(0, 'offline', '网络不可用'));
    } finally {
      if (this.inFlight === generation) this.inFlight = null;
    }
    // Background tabs stop polling until they become visible again.
    if (!this.stopped && !document.hidden && generation === this.generation) this.timer = window.setTimeout(() => void this.tick(), this.intervalMs);
  }
}

import { acceptProfile, localProgress, onLocalProgress, setProfileAccount } from '../app/storage';
import type { ProgressEvent, ProgressReceipt } from '../profile/progress';

type Body = { userId: string; deviceId: string; events: ProgressEvent[] };
export class ProfileSync {
  state: 'local' | 'syncing' | 'synced' | 'error' = 'local';
  error = '';
  private userId: string | null = null;
  private running: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<() => void>();

  constructor(private request: (body: Body) => Promise<ProgressReceipt>) {
    onLocalProgress(() => { if (this.userId) this.schedule(250); });
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.userId) void this.sync();
    });
  }

  onChange(listener: () => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  private notify() { for (const listener of this.listeners) listener(); }

  setUser(userId: string | null, preserveOffline = false) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.userId = userId;
    if (!preserveOffline) setProfileAccount(userId);
    this.state = userId ? 'syncing' : preserveOffline ? 'error' : 'local';
    this.notify();
    if (userId) void this.sync();
  }

  private schedule(delay: number) {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      if (typeof document === 'undefined' || !document.hidden) void this.sync();
    }, delay);
  }

  sync(): Promise<void> {
    if (!this.userId) return Promise.resolve();
    if (this.running) return this.running;
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    const userId = this.userId;
    this.state = 'syncing';
    this.notify();
    this.running = (async () => {
      try {
        const receipt = await this.request({ userId, deviceId: localProgress.deviceId, events: localProgress.pending(userId).slice(0, 50) });
        if (this.userId !== userId) return;
        acceptProfile(userId, receipt);
        this.state = 'synced';
        this.error = '';
      } catch (error) {
        if (this.userId !== userId) return;
        this.state = 'error';
        this.error = error instanceof Error ? error.message : '网络不可用';
      } finally {
        this.notify();
      }
    })().finally(() => {
      this.running = null;
      if (!this.userId) return;
      if (this.userId !== userId || (this.state === 'synced' && localProgress.pending().length)) this.schedule(100);
      else if (typeof document === 'undefined' || !document.hidden) this.schedule(30_000);
    });
    return this.running;
  }
}

import { applyProgress, COUNTERS, emptyProgress, type Progress, type ProgressEvent, type ProgressReceipt } from './progress';

export const PROFILE_KEY = 'pixi-gomoku:profile:v1';
export const PROGRESS_PREFIX = 'pixi-gomoku:progress:v1:';
type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;
type LocalEvent = { ownerId: string | null; event: ProgressEvent };
type Metadata = { deviceId: string; legacy: LocalEvent };
const clean = (value: unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? Math.min(value, 1e12) : 0;

/** A durable journal, independent of the displayed cloud balance. Remote totals
 * are never turned back into an import when a page is reloaded or signed out. */
export class LocalProgress {
  private memory = new Map<string, string>();
  private active: string | null;
  private metadata: Metadata;

  constructor(private storage: StorageLike | null) {
    const raw = this.read<Record<string, unknown>>(PROFILE_KEY) ?? {};
    // An older, still-open tab can overwrite the v1 save. Keep the stable import
    // receipt outside that key too, so it cannot accidentally be imported twice.
    const stored = this.read<Metadata>(PROGRESS_PREFIX + 'migration') ?? raw._cloudProgress as Metadata | undefined;
    this.metadata = stored ?? {
      deviceId: crypto.randomUUID(),
      legacy: { ownerId: null, event: {
        id: crypto.randomUUID(), deviceId: '', kind: 'legacy', at: 0,
        values: Object.fromEntries(COUNTERS.map((key) => [key, clean(raw[key])])),
        streak: clean(raw.streak), bestStreak: clean(raw.bestStreak),
      } },
    };
    if (!stored) {
      this.metadata.legacy.event.deviceId = this.metadata.deviceId;
      this.write(PROGRESS_PREFIX + 'migration', this.metadata);
      this.write(PROFILE_KEY, { ...raw, _cloudProgress: this.metadata });
    } else this.write(PROGRESS_PREFIX + 'migration', this.metadata);
    this.active = this.read<string>(PROGRESS_PREFIX + 'active');
  }

  private read<T>(key: string): T | null {
    try {
      const value = this.memory.get(key) ?? this.storage?.getItem(key);
      return value ? JSON.parse(value) as T : null;
    } catch { return null; }
  }

  private write(key: string, value: unknown) {
    const data = JSON.stringify(value);
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(key, data);
      this.memory.delete(key);
      return true;
    } catch { this.memory.set(key, data); return false; }
  }

  get deviceId() { return this.metadata.deviceId; }
  get userId() { return this.active; }

  preferences() { return this.read<Record<string, unknown>>(PROFILE_KEY) ?? {}; }

  savePreferences(patch: Record<string, unknown>) {
    this.write(PROFILE_KEY, { ...this.preferences(), ...patch, _cloudProgress: this.latestMetadata() });
  }

  private latestMetadata() {
    return this.read<Metadata>(PROGRESS_PREFIX + 'migration') ?? (this.preferences()._cloudProgress as Metadata | undefined) ?? this.metadata;
  }

  private entries(): LocalEvent[] {
    const keys = new Set(this.memory.keys());
    try { for (let i = 0; i < (this.storage?.length ?? 0); i++) { const key = this.storage!.key(i); if (key) keys.add(key); } } catch { /* Memory journal remains usable. */ }
    return [this.latestMetadata().legacy, ...[...keys].filter((key) => key.startsWith(PROGRESS_PREFIX + 'event:'))
      .flatMap((key) => { const entry = this.read<LocalEvent>(key); return entry?.event ? [entry] : []; })];
  }

  setAccount(userId: string | null) {
    this.active = userId;
    this.write(PROGRESS_PREFIX + 'active', userId);
    if (!userId) return;
    const meta = this.latestMetadata();
    if (meta.legacy.ownerId === null) {
      this.metadata = { ...meta, legacy: { ...meta.legacy, ownerId: userId } };
      this.write(PROGRESS_PREFIX + 'migration', this.metadata);
      this.write(PROFILE_KEY, { ...this.preferences(), _cloudProgress: this.metadata });
    }
    for (const entry of this.entries()) {
      if (entry.ownerId === null && entry.event.kind !== 'legacy') this.write(PROGRESS_PREFIX + 'event:' + entry.event.id, { ...entry, ownerId: userId });
    }
  }

  private cached(userId = this.active) {
    return userId ? this.read<ProgressReceipt>(PROGRESS_PREFIX + 'cache:' + userId) : null;
  }

  pending(userId = this.active): ProgressEvent[] {
    const accepted = new Set(this.cached(userId)?.accepted ?? []);
    return this.entries().filter((entry) => entry.ownerId === userId && !accepted.has(entry.event.id))
      .map((entry) => entry.event).sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
  }

  totals(): Progress {
    return this.pending().reduce(applyProgress, this.cached()?.profile ?? emptyProgress());
  }

  record(before: Progress, after: Partial<Progress>) {
    const values: ProgressEvent['values'] = {};
    for (const key of COUNTERS) {
      if (after[key] !== undefined && after[key]! > before[key]) values[key] = clean(after[key]! - before[key]);
    }
    const streak = after.streak !== undefined && after.streak !== before.streak ? clean(after.streak) : undefined;
    const bestStreak = after.bestStreak !== undefined && after.bestStreak > before.bestStreak ? clean(after.bestStreak) : undefined;
    if (!Object.keys(values).length && streak === undefined && bestStreak === undefined) return false;
    const event: ProgressEvent = { id: crypto.randomUUID(), deviceId: this.deviceId, kind: 'update', values, at: Date.now(), streak, bestStreak };
    this.write(PROGRESS_PREFIX + 'event:' + event.id, { ownerId: this.active, event });
    return true;
  }

  accept(userId: string, receipt: ProgressReceipt) {
    // A slow response from another tab must not replace a newer snapshot.
    const current = this.cached(userId);
    if (current && current.revision > receipt.revision) return;
    const persisted = this.write(PROGRESS_PREFIX + 'cache:' + userId, receipt);
    if (!persisted) return; // Keep durable events if the durable checkpoint failed.
    for (const id of receipt.accepted) {
      this.memory.delete(PROGRESS_PREFIX + 'event:' + id);
      try { this.storage?.removeItem(PROGRESS_PREFIX + 'event:' + id); } catch { /* Receipt filters it out on retry. */ }
    }
  }
}

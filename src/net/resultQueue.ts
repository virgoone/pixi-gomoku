import type { Outcome } from '../result/scoring';

export type QueuedGame = {
  ownerId: string | null;
  submission: {
    gameId: string;
    finishedAt: number;
    mode: 'ai' | 'online';
    brain?: Outcome['brain'];
    myStone: 1 | 2;
    moves: Array<[number, number]>;
    resigned: 1 | 2 | null;
  };
  rejected?: string;
};

const PREFIX = 'pixi-gomoku:pending-game:v1:';
type StorageLike = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

/** One storage key per game prevents separate tabs from overwriting each other's queue. */
export class ResultQueue {
  private fallback = new Map<string, QueuedGame>();

  constructor(private storage: StorageLike | null) {}

  all(): QueuedGame[] {
    const entries = new Map(this.fallback);
    try {
      for (let index = 0; index < (this.storage?.length ?? 0); index += 1) {
        const key = this.storage?.key(index);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const entry = JSON.parse(this.storage!.getItem(key) ?? 'null') as QueuedGame | null;
          if (entry?.submission?.gameId && Array.isArray(entry.submission.moves)) entries.set(entry.submission.gameId, entry);
        } catch { /* Ignore a corrupt record without discarding other games. */ }
      }
    } catch { /* Keep this session playable when browser storage is unavailable. */ }
    return [...entries.values()];
  }

  private save(entry: QueuedGame) {
    const id = entry.submission.gameId;
    try {
      if (!this.storage) throw new Error('Storage unavailable');
      this.storage.setItem(PREFIX + id, JSON.stringify(entry));
      this.fallback.delete(id);
    } catch {
      this.fallback.set(id, entry);
    }
  }

  record(outcome: Outcome, ownerId: string | null): string | null {
    if (outcome.mode === 'local' || !outcome.moves?.length || outcome.myStone === null) return null;
    const gameId = outcome.gameId ??= crypto.randomUUID();
    if (this.all().some((entry) => entry.submission.gameId === gameId)) return gameId;
    this.save({ ownerId, submission: {
      gameId, finishedAt: outcome.finishedAt ?? Date.now(), mode: outcome.mode,
      brain: outcome.brain, myStone: outcome.myStone, moves: outcome.moves,
      resigned: outcome.resignedBy ?? null,
    } });
    return gameId;
  }

  claim(userId: string) {
    for (const entry of this.all()) {
      if (entry.ownerId === null) this.save({ ...entry, ownerId: userId });
    }
  }

  pending(userId: string) {
    return this.all().filter((entry) => entry.ownerId === userId && !entry.rejected)
      .sort((a, b) => a.submission.finishedAt - b.submission.finishedAt);
  }

  acknowledge(gameId: string) {
    this.fallback.delete(gameId);
    try { this.storage?.removeItem(PREFIX + gameId); } catch { /* A retry is safe: the server deduplicates IDs. */ }
  }

  reject(entry: QueuedGame, reason: string) {
    this.save({ ...entry, rejected: reason });
  }
}

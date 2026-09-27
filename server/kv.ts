/**
 * The key-value store the server runs on. Production uses Netlify Blobs; tests
 * and the local dev server use the in-memory version. Both support the
 * conditional writes the leaderboard relies on (write only if unchanged /
 * only if new), so concurrent results never overwrite each other.
 */
export type Entry<T> = { value: T; etag: string };

export interface KV {
  get<T>(key: string): Promise<Entry<T> | null>;
  /** Returns false when a condition (onlyIfMatch / onlyIfNew) was not met. */
  set(key: string, value: unknown, options?: { onlyIfMatch?: string; onlyIfNew?: boolean }): Promise<boolean>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<string[]>;
}

export class MemoryKV implements KV {
  private data = new Map<string, Entry<string>>();
  private counter = 0;

  async get<T>(key: string): Promise<Entry<T> | null> {
    const entry = this.data.get(key);
    return entry ? { value: JSON.parse(entry.value) as T, etag: entry.etag } : null;
  }

  async set(key: string, value: unknown, options: { onlyIfMatch?: string; onlyIfNew?: boolean } = {}) {
    const current = this.data.get(key);
    if (options.onlyIfNew && current) return false;
    if (options.onlyIfMatch !== undefined && current?.etag !== options.onlyIfMatch) return false;
    this.counter += 1;
    this.data.set(key, { value: JSON.stringify(value), etag: `"m${this.counter}"` });
    return true;
  }

  async delete(key: string) {
    this.data.delete(key);
  }

  async list(prefix: string) {
    return [...this.data.keys()].filter((key) => key.startsWith(prefix));
  }
}

/** Netlify Blobs, read with strong consistency so a write is visible to the next request. */
export async function blobsKV(name: string): Promise<KV> {
  const { getStore } = await import('@netlify/blobs');
  const store = getStore({ name, consistency: 'strong' });
  return {
    async get<T>(key: string) {
      const result = await store.getWithMetadata(key, { type: 'json' });
      if (!result) return null;
      return { value: result.data as T, etag: result.etag ?? '' };
    },
    async set(key, value, options = {}) {
      const conditions = options.onlyIfNew ? { onlyIfNew: true as const } : options.onlyIfMatch ? { onlyIfMatch: options.onlyIfMatch } : {};
      const result = await store.setJSON(key, value, conditions);
      return result.modified;
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix) {
      const { blobs } = await store.list({ prefix });
      return blobs.map((blob) => blob.key);
    },
  };
}

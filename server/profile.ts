import { applyProgress, COUNTERS, emptyProgress, type CloudProgress, type ProgressEvent, type ProgressReceipt } from '../src/profile/progress';
import { BoardError } from './board';
import type { KV } from './kv';

type Document = { revision: number; profile: CloudProgress; receipts: Record<string, string> };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= 1e12;

export async function syncProgress(kv: KV, userId: string, body: Record<string, unknown>, now = Date.now()): Promise<ProgressReceipt> {
  if (!uuid(body.deviceId) || !Array.isArray(body.events) || body.events.length > 50) throw new BoardError(400, 'bad_profile', '存档数据不完整');
  const deviceId = body.deviceId;
  const events: ProgressEvent[] = body.events.map((raw: unknown) => {
    const e = (raw ?? {}) as ProgressEvent;
    if (!uuid(e.id) || e.deviceId !== deviceId || !['legacy', 'update'].includes(e.kind) || !Number.isSafeInteger(e.at) || e.at < 0 || !e.values || typeof e.values !== 'object' || Array.isArray(e.values)
      || Object.keys(e.values).some((key) => !COUNTERS.includes(key as typeof COUNTERS[number]))
      || Object.values(e.values).some((value) => !count(value)) || (e.streak !== undefined && !count(e.streak)) || (e.bestStreak !== undefined && !count(e.bestStreak))) {
      throw new BoardError(400, 'bad_profile', '存档数据格式不正确');
    }
    return { id: e.id, deviceId, kind: e.kind, values: e.values, at: e.kind === 'legacy' ? 0 : Math.min(e.at, now), streak: e.streak, bestStreak: e.bestStreak };
  });
  // Bind each durable source event to its first account, even if local storage
  // is cloned or different tabs race while switching the shared session cookie.
  for (const event of events) {
    const key = `profile-owners/${event.id}`;
    const saved = await kv.set(key, userId, { onlyIfNew: true });
    if (!saved && (await kv.get<string>(key))?.value !== userId) throw new BoardError(409, 'profile_owner', '这份存档已绑定其他账号，请登录原账号同步');
  }
  const key = `profiles/${userId}`;
  for (let attempt = 0; attempt < 12; attempt++) {
    const current = await kv.get<Document>(key);
    const document = current?.value ?? { revision: 0, profile: emptyProgress(), receipts: {} };
    const next: Document = { ...document, profile: { ...document.profile }, receipts: { ...document.receipts } };
    for (const event of events) {
      if (next.receipts[event.id]) continue;
      next.profile = applyProgress(next.profile, event);
      if (COUNTERS.some((field) => !count(next.profile[field]))) throw new BoardError(400, 'bad_profile', '存档总量超出支持范围');
      next.receipts[event.id] = deviceId;
      next.revision++;
    }
    const response = () => ({ revision: next.revision, profile: next.profile, accepted: Object.keys(next.receipts).filter((id) => next.receipts[id] === deviceId) });
    if (next.revision === document.revision) return response();
    if (await kv.set(key, next, current ? { onlyIfMatch: current.etag } : { onlyIfNew: true })) return response();
  }
  throw new BoardError(503, 'busy', '存档同步繁忙，稍后自动重试');
}

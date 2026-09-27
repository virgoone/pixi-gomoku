import type { BrainId } from '../gomoku/ai';
import type { Rule } from '../gomoku/rules';
import { LocalProgress, PROGRESS_PREFIX } from '../profile/localProgress';
import { COUNTERS, type ProgressReceipt } from '../profile/progress';

/** Persistent player profile, stored in localStorage. */
export type Profile = {
  coins: number;
  gems: number;
  crowns: number;
  streak: number;
  bestStreak: number;
  wins: number;
  losses: number;
  draws: number;
  muted: boolean;
  lastBrain: BrainId;
  playFirst: boolean;
  /** Rule last picked for AI games. */
  rule: Rule;
  nickname: string;
};

const defaults = (): Profile => ({
  coins: 0,
  gems: 0,
  crowns: 0,
  streak: 0,
  bestStreak: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  muted: false,
  lastBrain: 'fox',
  playFirst: true,
  rule: 'freestyle',
  nickname: `棋手${Math.floor(100 + Math.random() * 900)}`,
});

const initial = defaults();
const browserStorage = (() => { try { return localStorage; } catch { return null; } })();
// Two tabs opening the old save for the first time must share one import ID.
export const localProgress = typeof navigator !== 'undefined' && navigator.locks
  ? await navigator.locks.request('pixi-gomoku:profile-migration', () => new LocalProgress(browserStorage))
  : new LocalProgress(browserStorage);
const listeners = new Set<(profile: Profile) => void>();
const localListeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(getProfile()); };

export function getProfile(): Readonly<Profile> {
  return { ...initial, ...localProgress.preferences(), ...localProgress.totals() } as Profile;
}

export function updateProfile(patch: Partial<Profile> | ((current: Profile) => Partial<Profile>)) {
  const profile = getProfile();
  const next = typeof patch === 'function' ? patch(profile) : patch;
  const changed = localProgress.record(profile, next);
  const preferences = Object.fromEntries(Object.entries(next).filter(([key]) => ![...COUNTERS, 'streak', 'bestStreak'].includes(key)));
  if (Object.keys(preferences).length) localProgress.savePreferences(preferences);
  notify();
  if (changed) for (const listener of localListeners) listener();
}

export function setProfileAccount(userId: string | null) { localProgress.setAccount(userId); notify(); }
export function acceptProfile(userId: string, receipt: ProgressReceipt) { localProgress.accept(userId, receipt); notify(); }
export function onLocalProgress(listener: () => void) { localListeners.add(listener); return () => localListeners.delete(listener); }

if (typeof window !== 'undefined') window.addEventListener('storage', (event: StorageEvent) => {
  if (event.key?.startsWith(PROGRESS_PREFIX)) {
    notify();
    if (event.key.startsWith(PROGRESS_PREFIX + 'event:')) for (const listener of localListeners) listener();
  }
});

export function onProfileChange(listener: (profile: Profile) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

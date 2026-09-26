import type { BrainId } from '../gomoku/ai';

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
  nickname: string;
};

const KEY = 'pixi-gomoku:profile:v1';

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
  nickname: `棋手${Math.floor(100 + Math.random() * 900)}`,
});

let profile: Profile = load();
const listeners = new Set<(profile: Profile) => void>();

function load(): Profile {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults(), ...(JSON.parse(raw) as Partial<Profile>) };
  } catch {
    /* Private mode or corrupt data: start fresh. */
  }
  return defaults();
}

export function getProfile(): Readonly<Profile> {
  return profile;
}

export function updateProfile(patch: Partial<Profile> | ((current: Profile) => Partial<Profile>)) {
  const next = typeof patch === 'function' ? patch(profile) : patch;
  profile = { ...profile, ...next };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    /* Storage full or blocked: keep the in-memory profile. */
  }
  for (const listener of listeners) listener(profile);
}

export function onProfileChange(listener: (profile: Profile) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Shared colours for the SVG art. Everything is drawn with a dark ink outline. */

export const INK = '#2a1638';

export const GOLD = { light: '#fff3b0', base: '#ffd23f', dark: '#e0930f', deep: '#a8620a' };

export type TierId = 0 | 1 | 2 | 3;

export type TierColors = {
  name: string;
  /** Chest body. */
  light: string;
  base: string;
  dark: string;
  rim: string;
  /** Lid body; legendary uses gold. */
  lidLight: string;
  lidBase: string;
  lidDark: string;
  /** Background glow for the result screen. */
  bgInner: string;
  bgOuter: string;
  glow: number;
};

export const TIERS: Record<TierId, TierColors> = {
  0: {
    name: '普通宝箱',
    light: '#8ff5c8', base: '#39d98f', dark: '#169a5f', rim: '#0d6b41',
    lidLight: '#8ff5c8', lidBase: '#39d98f', lidDark: '#169a5f',
    bgInner: '#1f7a74', bgOuter: '#0b2b33', glow: 0x6ff5c0,
  },
  1: {
    name: '稀有宝箱',
    light: '#9ad0ff', base: '#3b9cff', dark: '#1c5fd0', rim: '#123f96',
    lidLight: '#9ad0ff', lidBase: '#3b9cff', lidDark: '#1c5fd0',
    bgInner: '#2360c9', bgOuter: '#0b1740', glow: 0x7cc4ff,
  },
  2: {
    name: '史诗宝箱',
    light: '#dfb3ff', base: '#b35cff', dark: '#7a2fd6', rim: '#521c9e',
    lidLight: '#dfb3ff', lidBase: '#b35cff', lidDark: '#7a2fd6',
    bgInner: '#6a2bc4', bgOuter: '#1b0b3d', glow: 0xd09bff,
  },
  3: {
    name: '传说宝箱',
    light: '#ffb1d3', base: '#ff5fa2', dark: '#d8337c', rim: '#9c1c57',
    lidLight: GOLD.light, lidBase: GOLD.base, lidDark: GOLD.dark,
    bgInner: '#d8741f', bgOuter: '#3a1206', glow: 0xffd66b,
  },
};

export const SKINS = {
  yellow: { top: '#ffe36b', bottom: '#ffb700', edge: '#c77800', text: 0x5a2a00 },
  blue: { top: '#7cc6ff', bottom: '#2f86f5', edge: '#1a4fb0', text: 0xffffff },
  green: { top: '#8ff0a8', bottom: '#2fc26b', edge: '#15804a', text: 0xffffff },
  red: { top: '#ff9a8a', bottom: '#f0473b', edge: '#a8201b', text: 0xffffff },
  white: { top: '#ffffff', bottom: '#e4ddf2', edge: '#9a8bb8', text: 0x3a2555 },
  dark: { top: '#5a3f86', bottom: '#3b2663', edge: '#1f123a', text: 0xffffff },
} as const;

export type SkinId = keyof typeof SKINS;

/** Shared colours for the SVG art. Everything is drawn with a dark ink outline. */

export const INK = '#2a1638';

export const GOLD = { light: '#fff3b0', base: '#ffd23f', dark: '#e0930f', deep: '#a8620a' };

export type TierId = 0 | 1 | 2 | 3;

export type Shades = { light: string; base: string; dark: string };

export type TierColors = {
  name: string;
  /** Painted planks: front shades, plus the darker left side. */
  body: Shades & { side: string; line: string };
  /** Rim band, straps, feet and lock plate. */
  trim: Shades;
  /** Colour of the chest name in the result title. */
  title: number;
  /** Legendary chests wear a star on the lock. */
  star: boolean;
  /** Background glow for the result screen. */
  bgInner: string;
  bgOuter: string;
  glow: number;
};

const YELLOW_TRIM: Shades = { light: '#fff6b8', base: '#f7de6c', dark: '#d8ac34' };

export const TIERS: Record<TierId, TierColors> = {
  0: {
    name: '普通宝箱',
    title: 0xb4ffd6,
    body: { light: '#86f2b8', base: '#3fd98a', dark: '#21ad68', side: '#1f9c5e', line: '#157a48' },
    trim: YELLOW_TRIM,
    star: false,
    bgInner: '#1f7a74', bgOuter: '#0b2b33', glow: 0x6ff5c0,
  },
  1: {
    name: '稀有宝箱',
    title: 0xa6dcff,
    body: { light: '#7cc8ff', base: '#3a9bf0', dark: '#2275d6', side: '#1f66c0', line: '#154f9e' },
    trim: YELLOW_TRIM,
    star: false,
    bgInner: '#2360c9', bgOuter: '#0b1740', glow: 0x7cc4ff,
  },
  2: {
    name: '史诗宝箱',
    title: 0xeccbff,
    body: { light: '#cf9bff', base: '#a55cf0', dark: '#8038d0', side: '#7030bb', line: '#56219a' },
    trim: { light: '#ffeaa0', base: '#f4c64a', dark: '#c98f1c' },
    star: false,
    bgInner: '#6a2bc4', bgOuter: '#1b0b3d', glow: 0xd09bff,
  },
  3: {
    name: '传说宝箱',
    title: 0xffd84a,
    body: { light: '#fff28a', base: '#ffd23f', dark: '#f5ab1a', side: '#eb9b12', line: '#c97a08' },
    trim: { light: '#ffc0d8', base: '#ff72aa', dark: '#e0457f' },
    star: true,
    bgInner: '#d8741f', bgOuter: '#3a1206', glow: 0xffd66b,
  },
};

export const SKINS = {
  yellow: { top: '#ffe96e', bottom: '#ffb320', edge: '#ec8a0c', text: 0xffffff },
  blue: { top: '#86ccff', bottom: '#3a8ff5', edge: '#2266cc', text: 0xffffff },
  green: { top: '#94f2ae', bottom: '#36c873', edge: '#1f9a55', text: 0xffffff },
  red: { top: '#ffa090', bottom: '#f24d40', edge: '#c42c24', text: 0xffffff },
  white: { top: '#ffffff', bottom: '#e6e0f4', edge: '#c3b7dd', text: 0x3a2555 },
  dark: { top: '#5a3f86', bottom: '#3b2663', edge: '#2a1a4a', text: 0xffffff },
} as const;

export type SkinId = keyof typeof SKINS;

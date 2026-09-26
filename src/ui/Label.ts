import { Text, type TextStyleOptions } from 'pixi.js';

import { FONT_BODY, FONT_NUMBER, FONT_TITLE } from '../app/fonts';
import { INK } from '../svg/palette';

const presets = {
  title: { fontFamily: FONT_TITLE, fontSize: 64, fill: 0xffffff, stroke: { color: INK, width: 10, join: 'round' }, dropShadow: { color: INK, distance: 5, angle: Math.PI / 2, blur: 0, alpha: 1 } },
  heading: { fontFamily: FONT_TITLE, fontSize: 34, fill: 0xffffff, stroke: { color: INK, width: 7, join: 'round' }, dropShadow: { color: INK, distance: 3, angle: Math.PI / 2, blur: 0, alpha: 1 } },
  button: { fontFamily: FONT_TITLE, fontSize: 28, fill: 0xffffff },
  body: { fontFamily: FONT_BODY, fontSize: 18, fill: 0xe9e2ff, fontWeight: '500' },
  small: { fontFamily: FONT_BODY, fontSize: 14, fill: 0xc9bde8 },
  number: { fontFamily: FONT_NUMBER, fontSize: 24, fill: 0xffffff, stroke: { color: INK, width: 5, join: 'round' } },
  dark: { fontFamily: FONT_TITLE, fontSize: 24, fill: 0x3a2555 },
} satisfies Record<string, TextStyleOptions>;

export type LabelPreset = keyof typeof presets;

export function label(text: string, preset: LabelPreset = 'body', overrides: TextStyleOptions = {}) {
  const node = new Text({ text, style: { ...presets[preset], ...overrides } as TextStyleOptions });
  node.anchor.set(0.5);
  return node;
}

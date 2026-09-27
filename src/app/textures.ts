import { CanvasSource, Texture } from 'pixi.js';

import * as art from '../svg/art';
import { type SkinId, TIERS, type TierId } from '../svg/palette';

type Entry = { svg: () => string; width: number; height: number };

const skins: SkinId[] = ['yellow', 'blue', 'green', 'red', 'white', 'dark'];
const tiers: TierId[] = [0, 1, 2, 3];

/** Name → SVG source and logical size. */
const registry: Record<string, Entry> = {
  'stone-black': { svg: art.blackStone, width: 100, height: 100 },
  'stone-white': { svg: art.whiteStone, width: 100, height: 100 },
  'stone-shadow': { svg: art.stoneShadow, width: 100, height: 100 },
  board: { svg: art.board, width: 1000, height: 1000 },
  'badge-silver': { svg: () => art.badge('silver'), width: 220, height: 250 },
  'badge-bronze': { svg: () => art.badge('bronze'), width: 220, height: 250 },
  coin: { svg: art.coinIcon, width: 100, height: 100 },
  gem: { svg: art.gemIcon, width: 100, height: 100 },
  crown: { svg: art.crownIcon, width: 100, height: 100 },
  star: { svg: art.starIcon, width: 100, height: 100 },
  sparkle: { svg: art.sparkle, width: 64, height: 64 },
  glow: { svg: art.glowDisc, width: 256, height: 256 },
  rays: { svg: art.rays, width: 1024, height: 1024 },
  ring: { svg: art.ring, width: 320, height: 120 },
  panel: { svg: art.panel, width: 160, height: 160 },
  card: { svg: () => art.card(false), width: 140, height: 140 },
  'card-selected': { svg: () => art.card(true), width: 140, height: 140 },
  pill: { svg: art.pill, width: 96, height: 48 },
  'reward-card': { svg: () => art.rewardCard(false), width: 140, height: 140 },
  'reward-card-rare': { svg: () => art.rewardCard(true), width: 140, height: 140 },
  logo: { svg: art.logoStones, width: 220, height: 140 },
  'backdrop-home': { svg: () => art.backdrop('#5b2fb0', '#160a33'), width: 1000, height: 1000 },
  'backdrop-game': { svg: () => art.backdrop('#3a2a78', '#120a2a'), width: 1000, height: 1000 },
  'backdrop-loss': { svg: () => art.backdrop('#4a4a6e', '#15142a'), width: 1000, height: 1000 },
};

for (const skin of skins) {
  registry[`btn-${skin}`] = { svg: () => art.buttonSkin(skin), width: 240, height: 96 };
  registry[`round-${skin}`] = { svg: () => art.roundSkin(skin), width: 96, height: 96 };
}
for (const tier of tiers) {
  registry[`chest-closed-${tier}`] = { svg: () => art.chestClosed(TIERS[tier]), width: art.CHEST.width, height: art.CHEST.height };
  registry[`chest-open-${tier}`] = { svg: () => art.chestOpen(TIERS[tier]), width: art.CHEST.width, height: art.CHEST.height };
  registry[`backdrop-tier-${tier}`] = { svg: () => art.backdrop(TIERS[tier].bgInner, TIERS[tier].bgOuter), width: 1000, height: 1000 };
}
for (const [id, make] of Object.entries(art.ICONS)) registry[`icon-${id}`] = { svg: make, width: 64, height: 64 };
for (const [id, make] of Object.entries(art.AVATARS)) registry[`avatar-${id}`] = { svg: make, width: 120, height: 120 };

const cache = new Map<string, Texture>();

function scaleFor(entry: Entry) {
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  // Small art is drawn larger than its logical size so it stays crisp when scaled up.
  const boost = entry.width <= 128 ? 2 : 1;
  const scale = Math.min(dpr * boost, 4);
  // Keep the largest canvases within a sane budget on phones.
  return Math.min(scale, 2400 / Math.max(entry.width, entry.height));
}

async function rasterise(entry: Entry) {
  const scale = scaleFor(entry);
  const image = new Image();
  image.decoding = 'async';
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(entry.svg())}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(entry.width * scale);
  canvas.height = Math.ceil(entry.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas is unavailable');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Texture({ source: new CanvasSource({ resource: canvas, resolution: scale, antialias: true }) });
}

/** Rasterise every registered SVG. `onProgress` receives 0..1. */
export async function loadTextures(onProgress: (progress: number) => void) {
  const names = Object.keys(registry);
  let done = 0;
  const batch = 6;
  for (let index = 0; index < names.length; index += batch) {
    await Promise.all(
      names.slice(index, index + batch).map(async (name) => {
        cache.set(name, await rasterise(registry[name]));
        done += 1;
        onProgress(done / names.length);
      }),
    );
  }
}

export function tex(name: string): Texture {
  const texture = cache.get(name);
  if (!texture) throw new Error(`Texture "${name}" was not loaded`);
  return texture;
}

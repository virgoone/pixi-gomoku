import { NineSliceSprite } from 'pixi.js';

import { tex } from '../app/textures';

/** Glassy popup panel, centred on its position. */
export function panel(width: number, height: number) {
  const sprite = new NineSliceSprite({ texture: tex('panel'), leftWidth: 48, rightWidth: 48, topHeight: 48, bottomHeight: 48 });
  sprite.width = width;
  sprite.height = height;
  sprite.pivot.set(0, 0);
  sprite.position.set(-width / 2, -height / 2);
  return sprite;
}

export function card(width: number, height: number, selected = false) {
  const sprite = new NineSliceSprite({ texture: tex(selected ? 'card-selected' : 'card'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
  sprite.width = width;
  sprite.height = height;
  return sprite;
}

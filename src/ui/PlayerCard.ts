import { Container, NineSliceSprite, Sprite, Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import type { AvatarId } from '../svg/art';
import type { Stone } from '../gomoku/rules';
import { label } from './Label';

/** Chunky dark tile with avatar, name and stone; a gold frame pulses on the side to move. */
export class PlayerCard extends Container {
  private glow: NineSliceSprite;
  private avatar: Sprite;
  private status: Text;
  private active = false;
  private time = 0;
  private thinking = false;
  readonly cardWidth = 250;

  constructor(options: { name: string; subtitle: string; avatar: AvatarId; stone: Stone; alignRight?: boolean }) {
    super();
    const w = this.cardWidth;
    const h = 92;
    const bg = new NineSliceSprite({ texture: tex('tile-dark'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
    bg.width = w;
    bg.height = h;
    this.glow = new NineSliceSprite({ texture: tex('tile-frame'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
    this.glow.width = w + 12;
    this.glow.height = h + 12;
    this.glow.position.set(-6, -6);
    this.glow.alpha = 0;

    this.avatar = new Sprite(tex(`avatar-${options.avatar}`));
    this.avatar.anchor.set(0.5);
    this.avatar.width = this.avatar.height = 70;
    const stone = new Sprite(tex(options.stone === 1 ? 'stone-black' : 'stone-white'));
    stone.anchor.set(0.5);
    stone.width = stone.height = 26;

    const name = label(options.name, 'button', { fontSize: 22, stroke: { color: 0x2a1638, width: 5, join: 'round' } });
    this.status = label(options.subtitle, 'small', { fontSize: 13, fill: 0xd9ccff, fontWeight: '600' });
    name.anchor.set(options.alignRight ? 1 : 0, 0.5);
    this.status.anchor.set(options.alignRight ? 1 : 0, 0.5);

    if (options.alignRight) {
      this.avatar.position.set(w - 44, h / 2 - 2);
      stone.position.set(w - 18, h - 16);
      name.position.set(w - 86, h / 2 - 12);
      this.status.position.set(w - 86, h / 2 + 14);
    } else {
      this.avatar.position.set(44, h / 2 - 2);
      stone.position.set(66, h - 16);
      name.position.set(86, h / 2 - 12);
      this.status.position.set(86, h / 2 + 14);
    }
    this.addChild(bg, this.glow, this.avatar, stone, name, this.status);
  }

  setStatus(text: string) {
    this.status.text = text;
  }

  setActive(active: boolean, thinking = false) {
    this.thinking = thinking;
    if (active === this.active) return;
    this.active = active;
    gsap.to(this.glow, { alpha: active ? 1 : 0, duration: 0.25 });
    gsap.to(this.avatar.scale, { x: this.avatar.scale.x * (active ? 1.08 : 1 / 1.08), y: this.avatar.scale.y * (active ? 1.08 : 1 / 1.08), duration: 0.25, ease: 'back.out(2)' });
  }

  update(ticker: Ticker) {
    this.time += ticker.deltaMS / 1000;
    if (this.active) this.glow.alpha = 0.7 + 0.3 * Math.sin(this.time * 5);
    if (this.thinking) {
      const dots = '.'.repeat(1 + (Math.floor(this.time * 3) % 3));
      this.status.text = `思考中${dots}`;
    }
  }
}

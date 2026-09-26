import { Container, Graphics, NineSliceSprite, Sprite, Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import type { AvatarId } from '../svg/art';
import type { Stone } from '../gomoku/rules';
import { label } from './Label';

/** Avatar, name and stone colour; glows while it is this player's turn. */
export class PlayerCard extends Container {
  private glow = new Graphics();
  private avatar: Sprite;
  private status: Text;
  private active = false;
  private time = 0;
  private thinking = false;
  readonly cardWidth = 250;

  constructor(options: { name: string; subtitle: string; avatar: AvatarId; stone: Stone; alignRight?: boolean }) {
    super();
    const w = this.cardWidth;
    const h = 84;
    const bg = new NineSliceSprite({ texture: tex('pill'), leftWidth: 24, rightWidth: 24, topHeight: 20, bottomHeight: 20 });
    bg.width = w;
    bg.height = h;
    this.glow.roundRect(-4, -4, w + 8, h + 8, 44).stroke({ color: 0xffd23f, width: 5 });
    this.glow.alpha = 0;

    this.avatar = new Sprite(tex(`avatar-${options.avatar}`));
    this.avatar.anchor.set(0.5);
    this.avatar.width = this.avatar.height = 70;
    const stone = new Sprite(tex(options.stone === 1 ? 'stone-black' : 'stone-white'));
    stone.anchor.set(0.5);
    stone.width = stone.height = 26;

    const name = label(options.name, 'body', { fontSize: 19, fontWeight: '700', fill: 0xffffff });
    this.status = label(options.subtitle, 'small', { fontSize: 13 });
    name.anchor.set(options.alignRight ? 1 : 0, 0.5);
    this.status.anchor.set(options.alignRight ? 1 : 0, 0.5);

    if (options.alignRight) {
      this.avatar.position.set(w - 42, h / 2);
      stone.position.set(w - 18, h - 16);
      name.position.set(w - 86, h / 2 - 12);
      this.status.position.set(w - 86, h / 2 + 14);
    } else {
      this.avatar.position.set(42, h / 2);
      stone.position.set(66, h - 16);
      name.position.set(86, h / 2 - 12);
      this.status.position.set(86, h / 2 + 14);
    }
    this.addChild(this.glow, bg, this.avatar, stone, name, this.status);
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
    if (this.active) this.glow.alpha = 0.65 + 0.35 * Math.sin(this.time * 5);
    if (this.thinking) {
      const dots = '.'.repeat(1 + (Math.floor(this.time * 3) % 3));
      this.status.text = `思考中${dots}`;
    }
  }
}

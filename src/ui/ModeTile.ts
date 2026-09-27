import { Container, NineSliceSprite, Sprite, type Text, type Texture } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { tex } from '../app/textures';
import { label } from './Label';

export type TileSkin = 'yellow' | 'blue' | 'green' | 'dark';

/**
 * A chunky reward-card-style tile used for the home screen's game modes.
 * `tall` stacks art over text (desktop row); `wide` puts art beside text (phone list).
 */
export class ModeTile extends Container {
  private face = new Container();
  private bg: NineSliceSprite;
  private art: Sprite;
  private title: Text;
  private caption: Text;
  tileWidth = 0;
  tileHeight = 0;

  constructor(options: { skin: TileSkin; art: Texture; title: string; caption: string; onPress: () => void }) {
    super();
    this.bg = new NineSliceSprite({ texture: tex(`tile-${options.skin}`), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
    this.art = new Sprite(options.art);
    this.art.anchor.set(0.5);
    this.title = label(options.title, 'button', { fontSize: 30, stroke: { color: 0x2a1638, width: 7, join: 'round' } });
    this.caption = label(options.caption, 'small', { fontSize: 14, fill: 0xffffff, fontWeight: '700', stroke: { color: 0x2a1638, width: 3, join: 'round' } });
    this.face.addChild(this.bg, this.art, this.title, this.caption);
    this.addChild(this.face);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerover', () => gsap.to(this.face.scale, { x: 1.04, y: 1.04, duration: 0.15 }));
    this.on('pointerout', () => gsap.to(this.face.scale, { x: 1, y: 1, duration: 0.15 }));
    this.on('pointerdown', () => gsap.to(this.face, { y: 4, duration: 0.06 }));
    const up = () => !this.destroyed && gsap.to(this.face, { y: 0, duration: 0.14, ease: 'back.out(3)' });
    this.on('pointerup', up);
    this.on('pointerupoutside', up);
    this.on('pointertap', () => {
      sfx.click();
      options.onPress();
    });
    this.layout('tall');
  }

  layout(mode: 'tall' | 'wide') {
    if (mode === 'tall') {
      this.tileWidth = 196;
      this.tileHeight = 232;
      this.art.width = this.art.height = 112;
      this.art.position.set(0, -38);
      this.title.anchor.set(0.5);
      this.caption.anchor.set(0.5);
      this.title.position.set(0, 50);
      this.caption.position.set(0, 86);
    } else {
      this.tileWidth = 340;
      this.tileHeight = 108;
      this.art.width = this.art.height = 76;
      this.art.position.set(-this.tileWidth / 2 + 58, -2);
      this.title.anchor.set(0, 0.5);
      this.caption.anchor.set(0, 0.5);
      this.title.position.set(-this.tileWidth / 2 + 108, -14);
      this.caption.position.set(-this.tileWidth / 2 + 110, 22);
    }
    // The art's aspect may not be square (e.g. the stones logo).
    const ratio = this.art.texture.width / this.art.texture.height;
    if (ratio > 1) this.art.height = this.art.width / ratio;
    this.bg.width = this.tileWidth;
    this.bg.height = this.tileHeight;
    this.bg.position.set(-this.tileWidth / 2, -this.tileHeight / 2);
    this.hitArea = { contains: (x: number, y: number) => Math.abs(x) <= this.tileWidth / 2 && Math.abs(y) <= this.tileHeight / 2 };
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.killTweensOf(this.face);
    gsap.killTweensOf(this.face.scale);
    super.destroy(options);
  }
}

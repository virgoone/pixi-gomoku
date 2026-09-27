import { Container, NineSliceSprite, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { tex } from '../app/textures';
import { INK, SKINS, type SkinId } from '../svg/palette';
import type { IconId } from '../svg/art';
import { label } from './Label';

type ButtonOptions = {
  text: string;
  skin?: SkinId;
  width?: number;
  height?: number;
  icon?: IconId;
  fontSize?: number;
  onPress: () => void;
};

/** Chunky 3D pill button built from a nine-slice SVG skin. */
export class Button extends Container {
  private face = new Container();
  private skinSprite: NineSliceSprite;
  private text;
  private enabled = true;
  private readonly onPress: () => void;

  constructor(options: ButtonOptions) {
    super();
    const width = options.width ?? 260;
    const height = options.height ?? 84;
    const skin = options.skin ?? 'yellow';
    this.onPress = options.onPress;

    this.skinSprite = new NineSliceSprite({ texture: tex(`btn-${skin}`), leftWidth: 44, rightWidth: 44, topHeight: 40, bottomHeight: 44 });
    this.skinSprite.width = width;
    this.skinSprite.height = height;
    this.skinSprite.position.set(-width / 2, -height / 2);
    this.face.addChild(this.skinSprite);

    const color = SKINS[skin].text;
    // As in the reference: white lettering with a thick ink outline; the white skin keeps dark text.
    const outlined = skin !== 'white';
    const fontSize = options.fontSize ?? Math.round(height * 0.36);
    this.text = label(options.text, 'button', {
      fontSize,
      fill: color,
      ...(outlined ? { stroke: { color: INK, width: Math.max(4, Math.round(fontSize * 0.24)), join: 'round' as const } } : {}),
    });
    this.text.y = -height * 0.07;
    if (options.icon) {
      const icon = new Sprite(tex(`icon-${options.icon}`));
      icon.anchor.set(0.5);
      icon.tint = color;
      icon.width = icon.height = height * 0.38;
      const gap = 10;
      const total = icon.width + gap + this.text.width;
      icon.position.set(-total / 2 + icon.width / 2, this.text.y);
      this.text.x = -total / 2 + icon.width + gap + this.text.width / 2;
      if (outlined) {
        // A fattened ink copy behind the icon stands in for an outline.
        const offsets = [[-2, 0], [2, 0], [0, -2], [0, 2], [0, 3]];
        for (const [ox, oy] of offsets) {
          const edge = new Sprite(icon.texture);
          edge.anchor.set(0.5);
          edge.tint = INK;
          edge.width = edge.height = icon.width;
          edge.position.set(icon.x + ox, icon.y + oy);
          this.face.addChild(edge);
        }
      }
      this.face.addChild(icon);
    }
    this.face.addChild(this.text);
    this.addChild(this.face);

    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => this.enabled && gsap.to(this.face, { y: 3, duration: 0.06 }));
    this.on('pointerup', () => this.release());
    this.on('pointerupoutside', () => this.release());
    this.on('pointerover', () => this.enabled && gsap.to(this.face.scale, { x: 1.04, y: 1.04, duration: 0.15 }));
    this.on('pointerout', () => gsap.to(this.face.scale, { x: 1, y: 1, duration: 0.15 }));
    this.on('pointertap', () => {
      if (!this.enabled) return;
      sfx.click();
      this.onPress();
    });
  }

  private release() {
    if (this.destroyed) return;
    gsap.to(this.face, { y: 0, duration: 0.12, ease: 'back.out(3)' });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.killTweensOf(this.face);
    gsap.killTweensOf(this.face.scale);
    gsap.killTweensOf(this.scale);
    gsap.killTweensOf(this);
    super.destroy(options);
  }

  setText(text: string) {
    this.text.text = text;
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.alpha = enabled ? 1 : 0.45;
    this.cursor = enabled ? 'pointer' : 'default';
  }
}

/** Round button with a line icon. */
export class IconButton extends Container {
  private face = new Container();
  private icon: Sprite;

  constructor(options: { icon: IconId; skin?: SkinId; size?: number; onPress: () => void }) {
    super();
    const size = options.size ?? 64;
    const skin = options.skin ?? 'dark';
    const base = new Sprite(tex(`round-${skin}`));
    base.anchor.set(0.5);
    base.width = base.height = size;
    this.icon = new Sprite(tex(`icon-${options.icon}`));
    this.icon.anchor.set(0.5);
    this.icon.tint = SKINS[skin].text;
    this.icon.width = this.icon.height = size * 0.46;
    this.icon.y = -size * 0.04;
    this.face.addChild(base, this.icon);
    this.addChild(this.face);
    this.eventMode = 'static';
    this.cursor = 'pointer';
    this.on('pointerdown', () => gsap.to(this.face, { y: 2, duration: 0.06 }));
    this.on('pointerup', () => !this.destroyed && gsap.to(this.face, { y: 0, duration: 0.12 }));
    this.on('pointerupoutside', () => !this.destroyed && gsap.to(this.face, { y: 0, duration: 0.12 }));
    this.on('pointertap', () => {
      sfx.click();
      options.onPress();
    });
  }

  setIcon(icon: IconId) {
    this.icon.texture = tex(`icon-${icon}`);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.killTweensOf(this.face);
    super.destroy(options);
  }
}

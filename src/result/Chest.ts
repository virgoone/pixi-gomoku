import { Container, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import { CHEST } from '../svg/art';
import type { TierId } from '../svg/palette';

/**
 * A chest assembled from SVG parts. Origin is the bottom centre of the body so
 * squash-and-stretch pivots on the floor.
 */
export class Chest extends Container {
  readonly rig = new Container();
  private body: Sprite;
  private lid: Sprite;
  private lidOpen: Sprite;
  private treasure: Sprite;
  private innerGlow: Sprite;
  tier: TierId;
  opened = false;

  constructor(tier: TierId) {
    super();
    this.tier = tier;
    this.body = new Sprite(tex(`chest-body-${tier}`));
    this.body.anchor.set(0.5, 1);
    this.lid = new Sprite(tex(`chest-lid-${tier}`));
    this.lid.anchor.set(0.5, 1);
    this.lid.y = -CHEST.bodyHeight + 20;
    this.lidOpen = new Sprite(tex(`chest-open-${tier}`));
    this.lidOpen.anchor.set(0.5, 1);
    this.lidOpen.y = -CHEST.bodyHeight + 14;
    this.lidOpen.visible = false;
    this.innerGlow = new Sprite(tex('glow'));
    this.innerGlow.anchor.set(0.5);
    this.innerGlow.tint = 0xffe38a;
    this.innerGlow.blendMode = 'add';
    this.innerGlow.width = 420;
    this.innerGlow.height = 260;
    this.innerGlow.y = -CHEST.bodyHeight + 10;
    this.innerGlow.alpha = 0;
    this.treasure = new Sprite(tex('treasure'));
    this.treasure.anchor.set(0.5, 1);
    this.treasure.y = -CHEST.bodyHeight + 44;
    this.treasure.visible = false;
    this.rig.addChild(this.lidOpen, this.innerGlow, this.body, this.treasure, this.lid);
    this.addChild(this.rig);
  }

  /** Top of the chest in local coordinates; where rewards burst from. */
  get mouth() {
    return { x: 0, y: -CHEST.bodyHeight - 20 };
  }

  setTier(tier: TierId) {
    this.tier = tier;
    this.body.texture = tex(`chest-body-${tier}`);
    this.lid.texture = tex(`chest-lid-${tier}`);
    this.lidOpen.texture = tex(`chest-open-${tier}`);
  }

  /** Squash on landing. */
  async land() {
    await gsap.fromTo(this.rig.scale, { x: 1.18, y: 0.8 }, { x: 1, y: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' });
  }

  /** Rattle before an upgrade. */
  async charge(duration = 0.45) {
    const tl = gsap.timeline();
    tl.to(this.rig.scale, { x: 0.92, y: 1.08, duration: duration * 0.4, ease: 'power2.in' });
    tl.to(this.rig, { rotation: 0.06, duration: 0.05, repeat: Math.round(duration / 0.05), yoyo: true, ease: 'none' }, 0);
    tl.to(this.rig, { rotation: 0, duration: 0.05 });
    tl.to(this.rig.scale, { x: 1.12, y: 0.9, duration: 0.08 });
    tl.to(this.rig.scale, { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1, 0.4)' });
    await tl;
  }

  async open() {
    if (this.opened) return;
    this.opened = true;
    const tl = gsap.timeline();
    tl.to(this.rig.scale, { x: 1.1, y: 0.86, duration: 0.14, ease: 'power2.in' });
    tl.add(() => {
      this.lid.visible = false;
      this.lidOpen.visible = true;
      this.treasure.visible = true;
    });
    tl.to(this.rig.scale, { x: 0.94, y: 1.12, duration: 0.12, ease: 'power2.out' });
    tl.to(this.rig.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    tl.fromTo(this.lidOpen, { y: this.lidOpen.y + 30 }, { y: this.lidOpen.y, duration: 0.3, ease: 'back.out(3)' }, 0.14);
    tl.fromTo(this.treasure.scale, { x: 0.6, y: 0.2 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2.4)' }, 0.16);
    tl.to(this.innerGlow, { alpha: 1, duration: 0.3 }, 0.14);
    await tl;
  }

  /** Idle bob while waiting for the tap. */
  idle() {
    return gsap.to(this.rig, { y: -8, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  pulseGlow(time: number) {
    if (this.opened) this.innerGlow.alpha = 0.75 + 0.25 * Math.sin(time * 4);
  }
}

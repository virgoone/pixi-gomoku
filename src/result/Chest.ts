import { Container, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import { CHEST } from '../svg/art';
import type { TierId } from '../svg/palette';

/** Height of the chest's opening above the floor, in art units. */
const MOUTH_Y = 150;

/**
 * The result chest: one closed and one open drawing per tier. Origin is the
 * floor under the chest's centre so squash-and-stretch pivots on the ground.
 */
export class Chest extends Container {
  readonly rig = new Container();
  private closed: Sprite;
  private opened: Sprite;
  private innerGlow: Sprite;
  private shaft: Sprite;
  tier: TierId;
  isOpen = false;

  constructor(tier: TierId) {
    super();
    this.tier = tier;
    const anchorY = CHEST.floor / CHEST.height;
    this.closed = new Sprite(tex(`chest-closed-${tier}`));
    this.closed.anchor.set(0.5, anchorY);
    this.opened = new Sprite(tex(`chest-open-${tier}`));
    this.opened.anchor.set(0.5, anchorY);
    this.opened.visible = false;
    // Light pouring out of the open chest.
    this.innerGlow = new Sprite(tex('glow'));
    this.innerGlow.anchor.set(0.5);
    this.innerGlow.tint = 0xffe38a;
    this.innerGlow.blendMode = 'add';
    this.innerGlow.width = 460;
    this.innerGlow.height = 300;
    this.innerGlow.y = -MOUTH_Y - 20;
    this.innerGlow.alpha = 0;
    this.shaft = new Sprite(tex('glow'));
    this.shaft.anchor.set(0.5, 0.5);
    this.shaft.tint = 0xfff3c0;
    this.shaft.blendMode = 'add';
    this.shaft.width = 190;
    this.shaft.height = 360;
    this.shaft.y = -MOUTH_Y - 90;
    this.shaft.alpha = 0;
    this.rig.addChild(this.innerGlow, this.closed, this.opened, this.shaft);
    this.addChild(this.rig);
  }

  /** The opening in local coordinates; where rewards burst from. */
  get mouth() {
    return { x: 0, y: -MOUTH_Y };
  }

  setTier(tier: TierId) {
    this.tier = tier;
    this.closed.texture = tex(`chest-closed-${tier}`);
    this.opened.texture = tex(`chest-open-${tier}`);
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
    if (this.isOpen) return;
    this.isOpen = true;
    const tl = gsap.timeline();
    // Crouch, then burst open with a stretch and a wobble.
    tl.to(this.rig.scale, { x: 1.12, y: 0.84, duration: 0.14, ease: 'power2.in' });
    tl.add(() => {
      this.closed.visible = false;
      this.opened.visible = true;
    });
    tl.to(this.rig.scale, { x: 0.93, y: 1.12, duration: 0.12, ease: 'power2.out' });
    tl.to(this.rig.scale, { x: 1, y: 1, duration: 0.55, ease: 'elastic.out(1, 0.4)' });
    tl.to(this.innerGlow, { alpha: 1, duration: 0.3 }, 0.14);
    tl.fromTo(this.shaft, { alpha: 0 }, { alpha: 0.9, duration: 0.25 }, 0.14);
    tl.fromTo(this.shaft.scale, { y: this.shaft.scale.y * 0.3 }, { y: this.shaft.scale.y, duration: 0.4, ease: 'power2.out' }, 0.14);
    await tl;
  }

  /** Idle bob while waiting for the tap. */
  idle() {
    return gsap.to(this.rig, { y: -8, duration: 0.9, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  pulseGlow(time: number) {
    if (!this.isOpen) return;
    this.innerGlow.alpha = 0.75 + 0.25 * Math.sin(time * 4);
    this.shaft.alpha = 0.55 + 0.2 * Math.sin(time * 3 + 1);
  }
}

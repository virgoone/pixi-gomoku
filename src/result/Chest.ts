import { ColorMatrixFilter, Container, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import { CHEST } from '../svg/art';
import type { TierId } from '../svg/palette';

/** Height of the chest's opening above the floor, in art units. */
const MOUTH_Y = 150;

/**
 * The result chest: one closed and one open drawing per tier. Origin is the
 * floor under the chest's centre so squash-and-stretch pivots on the ground.
 *
 * Layers: `shadow` stays on the floor; `bob` carries the idle float and the
 * tap-hint wiggle; `rig` carries the scripted hops, squashes and spins. Each
 * layer has its own tweens so a looping idle never fights a one-shot move.
 */
export class Chest extends Container {
  readonly rig = new Container();
  private bob = new Container();
  private shadow = new Sprite(tex('glow'));
  private closed: Sprite;
  private opened: Sprite;
  /** Light behind the chest: leaks around the edges while charging, pours out once open. */
  private backGlow: Sprite;
  private shaft: Sprite;
  tier: TierId;
  isOpen = false;
  /** Brightens the chest for upgrade flashes (a lift toward white, never a flat white card). */
  private whiteout = new ColorMatrixFilter();
  private idleTweens: gsap.core.Animation[] = [];
  private hintCall: gsap.core.Tween | null = null;

  constructor(tier: TierId) {
    super();
    this.tier = tier;
    const anchorY = CHEST.floor / CHEST.height;
    this.shadow.anchor.set(0.5);
    this.shadow.tint = 0x12051f;
    this.shadow.width = 250;
    this.shadow.height = 46;
    this.shadow.y = -4;
    this.shadow.alpha = 0.5;
    this.closed = new Sprite(tex(`chest-closed-${tier}`));
    this.closed.anchor.set(0.5, anchorY);
    this.opened = new Sprite(tex(`chest-open-${tier}`));
    this.opened.anchor.set(0.5, anchorY);
    this.opened.visible = false;
    this.backGlow = new Sprite(tex('glow'));
    this.backGlow.anchor.set(0.5);
    this.backGlow.tint = 0xffe38a;
    this.backGlow.blendMode = 'add';
    this.backGlow.width = 440;
    this.backGlow.height = 360;
    this.backGlow.y = -MOUTH_Y + 10;
    this.backGlow.alpha = 0;
    // A soft column rising out of the open chest. It starts above the rim so it
    // never lies over the chest's front face.
    this.shaft = new Sprite(tex('glow'));
    this.shaft.anchor.set(0.5, 0.85);
    this.shaft.tint = 0xfff3c0;
    this.shaft.blendMode = 'add';
    this.shaft.width = 170;
    this.shaft.height = 340;
    this.shaft.y = -MOUTH_Y + 30;
    this.shaft.alpha = 0;
    this.whiteout.brightness(1, false);
    this.whiteout.alpha = 0;
    this.rig.addChild(this.backGlow, this.closed, this.opened, this.shaft);
    this.bob.addChild(this.rig);
    this.addChild(this.shadow, this.bob);
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

  /** Tint of the light behind the chest (the tier's glow colour). */
  setGlow(tint: number) {
    this.backGlow.tint = tint;
  }

  /** Squash on landing. */
  async land() {
    await gsap.fromTo(this.rig.scale, { x: 1.18, y: 0.8 }, { x: 1, y: 1, duration: 0.45, ease: 'elastic.out(1, 0.45)' });
  }

  /**
   * Float gently and, every few seconds, wiggle to say "tap me". Always pair
   * with `stopIdle`, which kills the loops and puts everything back to rest.
   */
  startIdle(hint = true) {
    this.stopIdle();
    this.idleTweens.push(gsap.to(this.bob, { y: -10, duration: 1.1, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
    if (!hint) return;
    const wiggle = () => {
      const tl = gsap.timeline();
      tl.to(this.bob, { rotation: 0.07, duration: 0.07, ease: 'sine.out' });
      tl.to(this.bob, { rotation: -0.07, duration: 0.09, yoyo: true, repeat: 3, ease: 'sine.inOut' });
      tl.to(this.bob, { rotation: 0, duration: 0.2, ease: 'back.out(3)' });
      tl.fromTo(this.bob.scale, { x: 1.06, y: 0.94 }, { x: 1, y: 1, duration: 0.45, ease: 'elastic.out(1, 0.4)' }, 0);
      this.idleTweens.push(tl);
      this.hintCall = gsap.delayedCall(2.6, wiggle);
    };
    this.hintCall = gsap.delayedCall(1.4, wiggle);
  }

  stopIdle() {
    this.hintCall?.kill();
    this.hintCall = null;
    for (const tween of this.idleTweens) tween.kill();
    this.idleTweens = [];
    // Kill before reset: a loop that ends a frame late must not write its value back.
    gsap.killTweensOf(this.bob);
    gsap.killTweensOf(this.bob.scale);
    this.bob.position.set(0, 0);
    this.bob.rotation = 0;
    this.bob.scale.set(1);
  }

  /** Crouch, leap, spin once in the air (a quick turn about the vertical axis); resolves at the top. */
  async hop(height = 90) {
    const tl = gsap.timeline();
    tl.to(this.rig.scale, { x: 1.16, y: 0.8, duration: 0.14, ease: 'power2.in' });
    tl.to(this.rig.scale, { x: 0.86, y: 1.18, duration: 0.12, ease: 'power2.out' });
    tl.to(this.rig, { y: -height, duration: 0.3, ease: 'power3.out' }, '<');
    tl.to(this.rig.scale, { y: 1, duration: 0.2, ease: 'power1.out' }, '>-0.12');
    // A full turn: the width passes through zero twice (showing the mirrored back half-way).
    tl.to(this.rig.scale, { x: -1, duration: 0.14, ease: 'sine.inOut' }, '<');
    tl.to(this.rig.scale, { x: 1, duration: 0.14, ease: 'sine.inOut' });
    await tl;
  }

  /** Come back down from a hop, squash flat and spring back. */
  async drop() {
    const tl = gsap.timeline();
    tl.to(this.rig, { y: 0, duration: 0.2, ease: 'power2.in' });
    tl.to(this.rig.scale, { x: 0.9, y: 1.12, duration: 0.2, ease: 'power2.in' }, '<');
    tl.to(this.rig.scale, { x: 1.22, y: 0.76, duration: 0.07, ease: 'power2.out' });
    tl.to(this.rig.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    await tl;
  }

  /**
   * Charge before opening: a rattle that grows violent, light leaking from the
   * seams, and a hard squash at the very end. Resolves at the squash.
   */
  charge(duration: number, calm = false) {
    const tl = gsap.timeline();
    const steps = Math.round(duration / 0.035);
    for (let i = 0; i < steps; i += 1) {
      const k = ((i + 1) / steps) ** 1.6;
      const amount = calm ? 0.3 : 1;
      tl.to(this.rig, { x: (Math.random() - 0.5) * 18 * k * amount, rotation: (Math.random() - 0.5) * 0.16 * k * amount, duration: 0.035, ease: 'none' });
    }
    tl.to(this.rig.scale, { x: 1.06, y: 0.94, duration, ease: 'power1.in' }, 0);
    tl.fromTo(this.backGlow, { alpha: 0 }, { alpha: 0.85, duration, ease: 'power2.in' }, 0);
    tl.fromTo(this.backGlow.scale, { x: this.backGlow.scale.x * 0.6, y: this.backGlow.scale.y * 0.6 }, { x: this.backGlow.scale.x, y: this.backGlow.scale.y, duration, ease: 'power2.in' }, 0);
    tl.to(this.rig, { x: 0, rotation: 0, duration: 0.05 });
    tl.to(this.rig.scale, { x: 1.24, y: 0.72, duration: 0.08, ease: 'power3.in' }, '<');
    return tl;
  }

  async open() {
    if (this.isOpen) return;
    this.isOpen = true;
    const tl = gsap.timeline();
    // Swap to the open drawing at the bottom of the squash, then stretch up and wobble.
    tl.add(() => {
      this.closed.visible = false;
      this.opened.visible = true;
    });
    tl.to(this.rig.scale, { x: 0.88, y: 1.2, duration: 0.12, ease: 'power2.out' });
    tl.to(this.rig.scale, { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1, 0.35)' });
    tl.to(this.backGlow, { alpha: 1, duration: 0.2 }, 0);
    tl.fromTo(this.shaft, { alpha: 0 }, { alpha: 0.55, duration: 0.25 }, 0.05);
    tl.fromTo(this.shaft.scale, { y: this.shaft.scale.y * 0.2 }, { y: this.shaft.scale.y, duration: 0.45, ease: 'back.out(1.6)' }, 0.05);
    await tl;
  }

  /** Flare bright, hold, and fade back: the moment of an upgrade. */
  flashWhite(hold = 0.06, fade = 0.4) {
    this.closed.filters = [this.whiteout];
    this.opened.filters = [this.whiteout];
    gsap.killTweensOf(this.whiteout);
    const lift = { v: 0 };
    const apply = () => this.whiteout.brightness(1 + lift.v * 0.9, false);
    this.whiteout.alpha = 1;
    return gsap
      .timeline()
      .to(lift, { v: 1, duration: 0.06, onUpdate: apply })
      .to(lift, { v: 0, duration: fade, delay: hold, ease: 'power2.in', onUpdate: apply })
      .add(() => {
        this.closed.filters = [];
        this.opened.filters = [];
      });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.stopIdle();
    gsap.killTweensOf(this.whiteout);
    super.destroy(options);
  }

  /** Per-frame: the floor shadow follows the height, and the open chest's light breathes. */
  tick(time: number) {
    const lift = Math.max(0, -(this.rig.y + this.bob.y));
    const k = 1 / (1 + lift / 70);
    this.shadow.scale.set((250 / 256) * (0.55 + 0.45 * k) * Math.abs(this.rig.scale.x) ** 0.3, (46 / 256) * (0.55 + 0.45 * k));
    this.shadow.alpha = 0.2 + 0.35 * k;
    if (!this.isOpen) return;
    this.backGlow.alpha = 0.8 + 0.2 * Math.sin(time * 3);
    this.shaft.alpha = 0.4 + 0.15 * Math.sin(time * 2.4 + 1);
  }
}

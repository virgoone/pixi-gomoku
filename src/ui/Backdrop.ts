import { Container, Sprite, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';

/** Full-screen gradient with slowly turning god rays and drifting sparkles. */
export class Backdrop extends Container {
  private base: Sprite;
  private next: Sprite | null = null;
  readonly rays = new Sprite(tex('rays'));
  private sparkles: Array<{ sprite: Sprite; speed: number; phase: number }> = [];
  private w = 0;
  private h = 0;
  private time = 0;

  constructor(texture: string, options: { rays?: boolean; raysTint?: number; sparkles?: number } = {}) {
    super();
    this.base = new Sprite(tex(texture));
    this.addChild(this.base);
    this.rays.anchor.set(0.5);
    this.rays.tint = options.raysTint ?? 0xffffff;
    this.rays.alpha = options.rays === false ? 0 : 0.35;
    this.rays.blendMode = 'add';
    this.addChild(this.rays);
    for (let index = 0; index < (options.sparkles ?? 18); index += 1) {
      const sprite = new Sprite(tex('sparkle'));
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.scale.set(0.15 + Math.random() * 0.25);
      this.sparkles.push({ sprite, speed: 8 + Math.random() * 18, phase: Math.random() * Math.PI * 2 });
      this.addChild(sprite);
    }
  }

  /** Cross-fade to another backdrop texture. */
  setTexture(texture: string, duration = 0.5) {
    const incoming = new Sprite(tex(texture));
    incoming.alpha = 0;
    this.addChildAt(incoming, 1);
    this.next = incoming;
    this.cover(incoming);
    gsap.to(incoming, {
      alpha: 1,
      duration,
      onComplete: () => {
        this.base.destroy();
        this.base = incoming;
        this.next = null;
      },
    });
  }

  setRays(options: { alpha?: number; tint?: number; scale?: number }, duration = 0.5) {
    if (options.tint !== undefined) this.rays.tint = options.tint;
    if (options.alpha !== undefined) gsap.to(this.rays, { alpha: options.alpha, duration });
    if (options.scale !== undefined) gsap.to(this.rays.scale, { x: options.scale, y: options.scale, duration });
  }

  private cover(sprite: Sprite) {
    const size = Math.max(this.w, this.h);
    sprite.width = sprite.height = size;
    sprite.position.set((this.w - size) / 2, (this.h - size) / 2);
  }

  resize(width: number, height: number, raysCenter = { x: width / 2, y: height * 0.42 }) {
    this.w = width;
    this.h = height;
    this.cover(this.base);
    if (this.next) this.cover(this.next);
    const size = Math.hypot(width, height) * 1.25;
    this.rays.width = this.rays.height = size;
    this.rays.position.set(raysCenter.x, raysCenter.y);
    this.sparkles.forEach((entry, index) => {
      entry.sprite.position.set(((index * 197) % 1000) / 1000 * width, ((index * 331) % 1000) / 1000 * height);
    });
  }

  update(ticker: Ticker) {
    const dt = ticker.deltaMS / 1000;
    this.time += dt;
    this.rays.rotation += dt * 0.08;
    for (const entry of this.sparkles) {
      entry.sprite.y -= entry.speed * dt;
      if (entry.sprite.y < -20) entry.sprite.y = this.h + 20;
      entry.sprite.alpha = 0.25 + 0.5 * (0.5 + 0.5 * Math.sin(this.time * 2 + entry.phase));
    }
  }
}

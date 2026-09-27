import { Container, Graphics, Sprite, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';

type Particle = {
  node: Sprite | Graphics;
  vx: number;
  vy: number;
  spin: number;
  gravity: number;
  drag: number;
  life: number;
  ttl: number;
  fade: boolean;
  /** Pulled toward this point (suction), arriving when life reaches ttl. */
  target?: { x: number; y: number };
  /** Soft halo that follows the particle. */
  halo?: Sprite;
};

/**
 * Settlement effects: shock rings, speed streaks, sparks, suction, loot and a
 * radial bloom. Every spark carries a faint halo; nothing flashes to flat white.
 */
export class Effects extends Container {
  private particles: Particle[] = [];
  private bloom = new Sprite(tex('glow'));
  /** 0..1: fewer particles when the player prefers reduced motion. */
  density = 1;

  constructor() {
    super();
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = 'add';
    this.bloom.alpha = 0;
    this.addChild(this.bloom);
  }

  private n(count: number) {
    return Math.max(1, Math.round(count * this.density));
  }

  /** A ring that expands from (x, y) and fades. */
  ring(x: number, y: number, options: { from: number; to: number; width?: number; color?: number; duration?: number; delay?: number; alpha?: number }) {
    const ring = new Graphics().circle(0, 0, 100).stroke({ color: options.color ?? 0xffffff, width: options.width ?? 4 });
    ring.position.set(x, y);
    ring.scale.set(options.from / 100);
    ring.alpha = 0;
    ring.blendMode = 'add';
    this.addChildAt(ring, 1);
    const duration = options.duration ?? 0.6;
    const delay = options.delay ?? 0;
    gsap.to(ring.scale, { x: options.to / 100, y: options.to / 100, duration, delay, ease: 'power2.out' });
    gsap.fromTo(ring, { alpha: options.alpha ?? 1 }, { alpha: 0, duration, delay, ease: 'power1.in', immediateRender: false, onStart: () => void (ring.alpha = options.alpha ?? 1), onComplete: () => ring.destroy() });
  }

  /**
   * A shock wave in three strokes: wide and faint, medium, thin and bright.
   * The wide stroke scales with the ring so it reads as a soft band.
   */
  shockwave(x: number, y: number, options: { from: number; to: number; color?: number; duration?: number; delay?: number; strength?: number }) {
    const strength = options.strength ?? 1;
    const layers = [
      { width: 26, alpha: 0.18, color: options.color ?? 0xffffff },
      { width: 9, alpha: 0.4, color: options.color ?? 0xffffff },
      { width: 3, alpha: 0.95, color: 0xffffff },
    ];
    for (const layer of layers) {
      this.ring(x, y, { from: options.from, to: options.to, width: layer.width, color: layer.color, alpha: Math.min(1, layer.alpha * strength), duration: options.duration ?? 0.8, delay: options.delay });
    }
  }

  /** Long thin streaks shooting outward from (x, y). */
  streaks(x: number, y: number, radius: number, count: number, colors = [0xffffff, 0xfff1a8]) {
    for (let index = 0; index < this.n(count); index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const length = radius * (0.35 + Math.random() * 0.45);
      const width = 2 + Math.random() * 2.5;
      const line = new Graphics().roundRect(-length / 2, -width / 2, length, width, width / 2).fill(colors[index % colors.length]);
      line.rotation = angle;
      const start = radius * (0.15 + Math.random() * 0.25);
      line.position.set(x + Math.cos(angle) * start, y + Math.sin(angle) * start);
      line.blendMode = 'add';
      line.scale.x = 0.3;
      this.addChild(line);
      const travel = radius * (1.2 + Math.random() * 1.2);
      gsap.to(line.scale, { x: 1, duration: 0.18, ease: 'power2.out' });
      gsap.to(line, {
        x: line.x + Math.cos(angle) * travel,
        y: line.y + Math.sin(angle) * travel,
        alpha: 0,
        duration: 0.55 + Math.random() * 0.25,
        ease: 'power3.out',
        onComplete: () => line.destroy(),
      });
    }
  }

  private spark(x: number, y: number, tint: number, size: number) {
    const node = new Sprite(tex('sparkle'));
    node.anchor.set(0.5);
    node.blendMode = 'add';
    node.tint = tint;
    node.scale.set(size);
    node.position.set(x, y);
    const halo = new Sprite(tex('glow'));
    halo.anchor.set(0.5);
    halo.blendMode = 'add';
    halo.tint = tint;
    halo.alpha = 0.22;
    halo.scale.set(size * 0.55);
    halo.position.set(x, y);
    this.addChild(halo, node);
    return { node, halo };
  }

  /** Sparks sucked in toward (x, y) from a ring around it: the charge before the burst. */
  suck(x: number, y: number, radius: number, count: number, tint = 0xfff1a8) {
    for (let index = 0; index < this.n(count); index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = radius * (0.8 + Math.random() * 0.6);
      const { node, halo } = this.spark(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance, tint, 0.18 + Math.random() * 0.22);
      node.alpha = 0;
      this.particles.push({ node, halo, vx: 0, vy: 0, spin: 4, gravity: 0, drag: 0, life: 0, ttl: 0.35 + Math.random() * 0.2, fade: false, target: { x, y } });
    }
  }

  /** Twinkling star points flung outward, with gravity and drag. */
  sparks(x: number, y: number, count: number, power: number, tints = [0xffffff, 0xfff1a8]) {
    for (let index = 0; index < this.n(count); index += 1) {
      const { node, halo } = this.spark(x, y, tints[index % tints.length], 0.2 + Math.random() * 0.35);
      const angle = Math.random() * Math.PI * 2;
      const speed = power * (0.3 + Math.random() * 0.7);
      this.particles.push({ node, halo, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 8, gravity: power * 0.5, drag: 2.2, life: 0, ttl: 0.8 + Math.random() * 0.7, fade: true });
    }
  }

  /** Coins and gems thrown up out of the chest, spinning. */
  loot(x: number, y: number, count: number, power: number, textures = ['coin', 'coin', 'coin', 'gem']) {
    for (let index = 0; index < this.n(count); index += 1) {
      const node = new Sprite(tex(textures[index % textures.length]));
      node.anchor.set(0.5);
      const size = 18 + Math.random() * 16;
      node.width = node.height = size;
      node.position.set(x + (Math.random() - 0.5) * 60, y);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
      const speed = power * (0.45 + Math.random() * 0.6);
      this.particles.push({ node, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 10, gravity: power * 1.7, drag: 0.4, life: 0, ttl: 1.6 + Math.random() * 0.6, fade: true });
      this.addChild(node);
    }
  }

  /** Rising twinkles around the chest while it idles. */
  twinkle(x: number, y: number, spread: number) {
    const { node, halo } = this.spark(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.3) * spread * 0.5, 0xffffff, 0.2 + Math.random() * 0.25);
    this.particles.push({ node, halo, vx: 0, vy: -40 - Math.random() * 40, spin: 2, gravity: 0, drag: 0, life: 0, ttl: 0.9 + Math.random() * 0.5, fade: true });
  }

  /**
   * Radial bloom from (x, y) outward (additive, soft edge). `peak` is capped
   * at 0.8 so the screen never blows out to flat white.
   */
  flash(x: number, y: number, radius: number, options: { tint?: number; peak?: number; duration?: number } = {}) {
    gsap.killTweensOf(this.bloom);
    gsap.killTweensOf(this.bloom.scale);
    this.bloom.position.set(x, y);
    this.bloom.tint = options.tint ?? 0xfff6dc;
    const size = (radius * 2) / 256;
    this.bloom.scale.set(size * 0.4);
    gsap.to(this.bloom.scale, { x: size, y: size, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo(this.bloom, { alpha: Math.min(0.8, options.peak ?? 0.8) }, { alpha: 0, duration: options.duration ?? 0.7, ease: 'power2.out' });
  }

  update(ticker: Ticker) {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.ttl || p.node.destroyed) {
        if (!p.node.destroyed) p.node.destroy();
        if (p.halo && !p.halo.destroyed) p.halo.destroy();
        return false;
      }
      if (p.target) {
        // Ease in toward the target, accelerating: a vacuum pull.
        const k = Math.min(1, dt / Math.max(0.016, p.ttl - p.life + dt) * 1.4);
        p.node.x += (p.target.x - p.node.x) * k;
        p.node.y += (p.target.y - p.node.y) * k;
        p.node.alpha = Math.min(1, p.life / 0.1);
      } else {
        p.vy += p.gravity * dt;
        p.vx *= 1 - p.drag * dt;
        p.vy *= 1 - (p.gravity ? 0 : p.drag) * dt;
        p.node.x += p.vx * dt;
        p.node.y += p.vy * dt;
        if (p.fade) p.node.alpha = Math.min(1, (p.ttl - p.life) / 0.35);
      }
      p.node.rotation += p.spin * dt;
      if (p.halo) {
        p.halo.position.copyFrom(p.node.position);
        p.halo.alpha = 0.22 * p.node.alpha;
      }
      return true;
    });
  }
}

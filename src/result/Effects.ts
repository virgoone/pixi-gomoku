import { Container, Graphics, Sprite, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';

type Particle = { node: Sprite | Graphics; vx: number; vy: number; spin: number; gravity: number; drag: number; life: number; ttl: number; fade: boolean };

/**
 * Settlement effects from the reference video: shock rings, speed lines,
 * loot spraying out of the chest and a full-screen flash.
 */
export class Effects extends Container {
  private particles: Particle[] = [];
  private flashRect = new Graphics();

  constructor() {
    super();
    this.flashRect.alpha = 0;
    this.addChild(this.flashRect);
  }

  /** A thin ring that expands from (x, y) and fades. */
  ring(x: number, y: number, options: { from: number; to: number; width?: number; color?: number; duration?: number; delay?: number; alpha?: number }) {
    const ring = new Graphics().circle(0, 0, 100).stroke({ color: options.color ?? 0xffffff, width: options.width ?? 4 });
    ring.position.set(x, y);
    ring.scale.set(options.from / 100);
    ring.alpha = 0;
    this.addChildAt(ring, 0);
    const duration = options.duration ?? 0.6;
    const delay = options.delay ?? 0;
    gsap.to(ring.scale, { x: options.to / 100, y: options.to / 100, duration, delay, ease: 'power2.out' });
    gsap.fromTo(ring, { alpha: options.alpha ?? 1 }, { alpha: 0, duration, delay, ease: 'power1.in', immediateRender: false, onStart: () => void (ring.alpha = options.alpha ?? 1), onComplete: () => ring.destroy() });
  }

  /** Streaks shooting outward from a circle around (x, y), as the chest charges. */
  speedLines(x: number, y: number, radius: number, count: number, colors = [0xffffff, 0xfff1a8]) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const length = radius * (0.18 + Math.random() * 0.22);
      const line = new Graphics().roundRect(-length / 2, -1.6, length, 3.2, 1.6).fill(colors[index % colors.length]);
      line.rotation = angle;
      const start = radius * (0.8 + Math.random() * 0.4);
      line.position.set(x + Math.cos(angle) * start, y + Math.sin(angle) * start);
      line.alpha = 0.95;
      line.blendMode = 'add';
      this.addChild(line);
      const travel = radius * (0.5 + Math.random() * 0.5);
      gsap.to(line, {
        x: line.x + Math.cos(angle) * travel,
        y: line.y + Math.sin(angle) * travel,
        alpha: 0,
        duration: 0.35 + Math.random() * 0.15,
        ease: 'power1.out',
        onComplete: () => line.destroy(),
      });
    }
  }

  /** Coins and gems thrown up out of the chest. */
  loot(x: number, y: number, count: number, power: number, textures = ['coin', 'coin', 'coin', 'gem']) {
    for (let index = 0; index < count; index += 1) {
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
    const node = new Sprite(tex('sparkle'));
    node.anchor.set(0.5);
    node.blendMode = 'add';
    node.scale.set(0.2 + Math.random() * 0.3);
    node.position.set(x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.3) * spread * 0.5);
    this.particles.push({ node, vx: 0, vy: -40 - Math.random() * 40, spin: 2, gravity: 0, drag: 0, life: 0, ttl: 0.9 + Math.random() * 0.5, fade: true });
    this.addChild(node);
  }

  /** Full-screen white flash. */
  screenFlash(width: number, height: number, duration = 0.7, peak = 1) {
    this.flashRect.clear().rect(0, 0, width, height).fill(0xfffbe8);
    this.addChild(this.flashRect);
    gsap.killTweensOf(this.flashRect);
    gsap.fromTo(this.flashRect, { alpha: peak }, { alpha: 0, duration, ease: 'power2.out' });
  }

  update(ticker: Ticker) {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.particles = this.particles.filter((p) => {
      p.life += dt;
      if (p.life >= p.ttl || p.node.destroyed) {
        if (!p.node.destroyed) p.node.destroy();
        return false;
      }
      p.vy += p.gravity * dt;
      p.vx *= 1 - p.drag * dt;
      p.node.x += p.vx * dt;
      p.node.y += p.vy * dt;
      p.node.rotation += p.spin * dt;
      if (p.fade) p.node.alpha = Math.min(1, (p.ttl - p.life) / 0.35);
      return true;
    });
  }
}

import { Container, Graphics, type Ticker } from 'pixi.js';

const COLORS = [0xffd23f, 0xff5fa2, 0x3b9cff, 0x39d98f, 0xb35cff, 0xffffff, 0xff8a3c];

type Piece = { node: Graphics; vx: number; vy: number; spin: number; wobble: number; life: number; ttl: number };

/** Burst of paper confetti with gravity, drag and flutter. */
export class Confetti extends Container {
  private pieces: Piece[] = [];

  burst(x: number, y: number, count = 90, power = 900) {
    for (let index = 0; index < count; index += 1) {
      const node = new Graphics();
      const w = 6 + Math.random() * 8;
      const h = 10 + Math.random() * 10;
      const color = COLORS[index % COLORS.length];
      if (index % 5 === 0) node.circle(0, 0, w / 2).fill(color);
      else node.rect(-w / 2, -h / 2, w, h).fill(color);
      node.position.set(x, y);
      node.rotation = Math.random() * Math.PI;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
      const speed = power * (0.35 + Math.random() * 0.75);
      this.pieces.push({ node, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, spin: (Math.random() - 0.5) * 12, wobble: Math.random() * 10, life: 0, ttl: 2.2 + Math.random() * 1.4 });
      this.addChild(node);
    }
  }

  /** Gentle rain from the top edge. */
  rain(width: number, count = 60) {
    for (let index = 0; index < count; index += 1) {
      this.burst(Math.random() * width, -20 - Math.random() * 200, 1, 60);
    }
  }

  update(ticker: Ticker) {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    this.pieces = this.pieces.filter((piece) => {
      piece.life += dt;
      if (piece.life > piece.ttl) {
        piece.node.destroy();
        return false;
      }
      piece.vy += 1400 * dt;
      piece.vx *= 1 - 1.8 * dt;
      piece.vy *= 1 - 1.6 * dt;
      piece.node.x += (piece.vx + Math.sin(piece.life * 8 + piece.wobble) * 40) * dt;
      piece.node.y += piece.vy * dt;
      piece.node.rotation += piece.spin * dt;
      piece.node.scale.y = Math.cos(piece.life * 9 + piece.wobble);
      piece.node.alpha = Math.min(1, (piece.ttl - piece.life) * 2);
      return true;
    });
  }
}

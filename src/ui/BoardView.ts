import { Container, type FederatedPointerEvent, Graphics, Rectangle, Sprite, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import { BOARD_INSET } from '../svg/art';
import { BLACK, BOARD_SIZE, type Point, type Stone } from '../gomoku/rules';

const STAR_POINTS = [
  [3, 3], [11, 3], [7, 7], [3, 11], [11, 11],
];

type StoneNode = { stone: Sprite; shadow: Sprite };

/**
 * The wooden board. Grid lines are drawn in Pixi so they stay crisp at any size;
 * stones are SVG textures. Emits `onCell` when the local player picks a point.
 */
export class BoardView extends Container {
  readonly size = BOARD_SIZE;
  private boardSprite = new Sprite(tex('board'));
  private grid = new Graphics();
  private shadows = new Container();
  private stones = new Container();
  private overlay = new Container();
  private winGraphics = new Graphics();
  private ghost = new Sprite(tex('stone-black'));
  private lastMarker = new Graphics();
  private nodes = new Map<number, StoneNode>();
  private pixelSize = 600;
  private cell = 40;
  private gridStart = 0;
  private time = 0;
  private pendingTouch: Point | null = null;
  private winGlows: Sprite[] = [];

  /** Whether the local player may place a stone right now. */
  acceptingInput = false;
  /** Colour of the ghost preview. */
  turnStone: Stone = BLACK;
  onCell: (point: Point) => void = () => undefined;

  constructor() {
    super();
    this.ghost.anchor.set(0.5);
    this.ghost.alpha = 0;
    this.lastMarker.visible = false;
    this.addChild(this.boardSprite, this.grid, this.shadows, this.stones, this.lastMarker, this.ghost, this.winGraphics, this.overlay);

    this.eventMode = 'static';
    this.on('pointermove', (event) => this.handleHover(event));
    this.on('pointerleave', () => this.hideGhost());
    this.on('pointertap', (event) => this.handleTap(event));
  }

  get boardPixelSize() {
    return this.pixelSize;
  }

  layout(pixelSize: number) {
    this.pixelSize = pixelSize;
    this.boardSprite.width = this.boardSprite.height = pixelSize;
    const inset = (BOARD_INSET / 1000) * pixelSize;
    const play = pixelSize - inset * 2;
    this.cell = play / this.size;
    this.gridStart = inset + this.cell / 2;
    this.hitArea = new Rectangle(0, 0, pixelSize, pixelSize);
    this.drawGrid();
    for (const [index, node] of this.nodes) this.positionNode(node, index % this.size, Math.floor(index / this.size));
    this.ghost.width = this.ghost.height = this.cell * 0.9;
    this.placeLastMarker();
  }

  private drawGrid() {
    const g = this.grid.clear();
    const start = this.gridStart;
    const end = this.gridStart + this.cell * (this.size - 1);
    const lineWidth = Math.max(1, this.cell * 0.035);
    for (let index = 0; index < this.size; index += 1) {
      const p = this.gridStart + index * this.cell;
      g.moveTo(start, p).lineTo(end, p);
      g.moveTo(p, start).lineTo(p, end);
    }
    g.stroke({ color: 0x5a2c0c, width: lineWidth, alpha: 0.75 });
    g.rect(start, start, end - start, end - start).stroke({ color: 0x5a2c0c, width: lineWidth * 2.2, alpha: 0.85 });
    for (const [x, y] of STAR_POINTS) g.circle(this.gridStart + x * this.cell, this.gridStart + y * this.cell, this.cell * 0.12).fill({ color: 0x5a2c0c, alpha: 0.9 });
  }

  toLocal2(point: Point) {
    return { x: this.gridStart + point.x * this.cell, y: this.gridStart + point.y * this.cell };
  }

  private pointFromEvent(event: FederatedPointerEvent): Point | null {
    const local = this.toLocal(event.global);
    const x = Math.round((local.x - this.gridStart) / this.cell);
    const y = Math.round((local.y - this.gridStart) / this.cell);
    if (x < 0 || y < 0 || x >= this.size || y >= this.size) return null;
    return { x, y };
  }

  private occupied(point: Point) {
    return this.nodes.has(point.y * this.size + point.x);
  }

  private handleHover(event: FederatedPointerEvent) {
    if (event.pointerType === 'touch') return;
    const point = this.pointFromEvent(event);
    if (!this.acceptingInput || !point || this.occupied(point)) {
      this.hideGhost();
      return;
    }
    this.showGhost(point, 0.45);
  }

  private handleTap(event: FederatedPointerEvent) {
    const point = this.pointFromEvent(event);
    if (!this.acceptingInput || !point || this.occupied(point)) return;
    // Touch: the first tap previews, a second tap on the same point confirms.
    if (event.pointerType === 'touch') {
      if (!this.pendingTouch || this.pendingTouch.x !== point.x || this.pendingTouch.y !== point.y) {
        this.pendingTouch = point;
        this.showGhost(point, 0.6);
        return;
      }
    }
    this.pendingTouch = null;
    this.hideGhost();
    this.onCell(point);
  }

  private showGhost(point: Point, alpha: number) {
    this.ghost.texture = tex(this.turnStone === BLACK ? 'stone-black' : 'stone-white');
    const { x, y } = this.toLocal2(point);
    this.ghost.position.set(x, y);
    this.ghost.alpha = alpha;
  }

  hideGhost() {
    this.pendingTouch = null;
    this.ghost.alpha = 0;
  }

  private positionNode(node: StoneNode, x: number, y: number) {
    const p = this.toLocal2({ x, y });
    node.stone.position.set(p.x, p.y);
    node.stone.width = node.stone.height = this.cell * 0.92;
    node.shadow.position.set(p.x + this.cell * 0.06, p.y + this.cell * 0.1);
    node.shadow.width = node.shadow.height = this.cell * 1.02;
  }

  placeStone(x: number, y: number, stone: Stone, animate = true) {
    const index = y * this.size + x;
    this.removeStone(x, y);
    const node: StoneNode = {
      stone: new Sprite(tex(stone === BLACK ? 'stone-black' : 'stone-white')),
      shadow: new Sprite(tex('stone-shadow')),
    };
    node.stone.anchor.set(0.5);
    node.shadow.anchor.set(0.5);
    this.positionNode(node, x, y);
    this.shadows.addChild(node.shadow);
    this.stones.addChild(node.stone);
    this.nodes.set(index, node);
    this.lastPoint = { x, y };
    this.placeLastMarker();
    if (animate) {
      const targetScale = node.stone.scale.x;
      const shadowScale = node.shadow.scale.x;
      gsap.fromTo(node.stone.scale, { x: targetScale * 1.35, y: targetScale * 1.35 }, { x: targetScale, y: targetScale, duration: 0.28, ease: 'back.out(2.6)' });
      gsap.fromTo(node.stone, { alpha: 0, y: node.stone.y - this.cell * 0.4 }, { alpha: 1, y: node.stone.y, duration: 0.2, ease: 'power2.in' });
      gsap.fromTo(node.shadow.scale, { x: shadowScale * 0.4, y: shadowScale * 0.4 }, { x: shadowScale, y: shadowScale, duration: 0.24 });
      this.ripple(x, y);
    }
  }

  private lastPoint: Point | null = null;

  setLastMove(point: Point | null) {
    this.lastPoint = point;
    this.placeLastMarker();
  }

  private placeLastMarker() {
    const g = this.lastMarker.clear();
    if (!this.lastPoint) {
      g.visible = false;
      return;
    }
    const node = this.nodes.get(this.lastPoint.y * this.size + this.lastPoint.x);
    if (!node) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.circle(0, 0, this.cell * 0.14).fill(0xff4d5e).stroke({ color: 0xffffff, width: 2, alpha: 0.9 });
    g.position.copyFrom(node.stone.position);
  }

  removeStone(x: number, y: number) {
    const index = y * this.size + x;
    const node = this.nodes.get(index);
    if (!node) return;
    this.nodes.delete(index);
    gsap.killTweensOf(node.stone);
    gsap.killTweensOf(node.stone.scale);
    node.stone.destroy();
    node.shadow.destroy();
  }

  clear() {
    for (const index of [...this.nodes.keys()]) this.removeStone(index % this.size, Math.floor(index / this.size));
    this.clearWin();
    this.setLastMove(null);
  }

  private ripple(x: number, y: number) {
    const p = this.toLocal2({ x, y });
    const ring = new Graphics().circle(0, 0, this.cell * 0.5).stroke({ color: 0xffffff, width: 3, alpha: 0.8 });
    ring.position.set(p.x, p.y);
    this.overlay.addChild(ring);
    gsap.to(ring.scale, { x: 1.9, y: 1.9, duration: 0.45, ease: 'power2.out' });
    gsap.to(ring, { alpha: 0, duration: 0.45, onComplete: () => ring.destroy() });
  }

  /** Glow over the winning stones and a golden stroke drawn across them. */
  showWin(line: Point[]) {
    this.clearWin();
    this.lastMarker.visible = false;
    const first = this.toLocal2(line[0]);
    const last = this.toLocal2(line[line.length - 1]);
    const progress = { t: 0 };
    gsap.to(progress, {
      t: 1,
      duration: 0.5,
      ease: 'power2.out',
      delay: 0.15,
      onUpdate: () => {
        const x = first.x + (last.x - first.x) * progress.t;
        const y = first.y + (last.y - first.y) * progress.t;
        this.winGraphics.clear().moveTo(first.x, first.y).lineTo(x, y).stroke({ color: 0xffd23f, width: this.cell * 0.18, cap: 'round', alpha: 0.9 });
      },
    });
    line.forEach((point, index) => {
      const glow = new Sprite(tex('glow'));
      glow.anchor.set(0.5);
      glow.tint = 0xffd23f;
      glow.blendMode = 'add';
      const p = this.toLocal2(point);
      glow.position.set(p.x, p.y);
      glow.width = glow.height = this.cell * 2;
      glow.alpha = 0;
      this.overlay.addChild(glow);
      this.winGlows.push(glow);
      gsap.to(glow, { alpha: 0.9, duration: 0.25, delay: 0.08 * index });
      const node = this.nodes.get(point.y * this.size + point.x);
      if (node) {
        const s = node.stone.scale.x;
        gsap.to(node.stone.scale, { x: s * 1.15, y: s * 1.15, duration: 0.2, delay: 0.08 * index, yoyo: true, repeat: 1 });
      }
    });
  }

  clearWin() {
    this.winGraphics.clear();
    for (const glow of this.winGlows) glow.destroy();
    this.winGlows = [];
  }

  update(ticker: Ticker) {
    this.time += ticker.deltaMS / 1000;
    this.winGlows.forEach((glow, index) => {
      glow.alpha = 0.55 + 0.35 * Math.sin(this.time * 6 - index * 0.6);
    });
    if (this.pendingTouch) this.ghost.alpha = 0.45 + 0.25 * Math.sin(this.time * 8);
  }
}

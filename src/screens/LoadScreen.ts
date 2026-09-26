import { Container, Graphics, Text } from 'pixi.js';
import gsap from 'gsap';

import { loadFonts } from '../app/fonts';
import { loadTextures } from '../app/textures';

/** Draws with plain Graphics while the SVG textures and fonts are prepared. */
export class LoadScreen extends Container {
  private bar = new Graphics();
  private track = new Graphics();
  private caption = new Text({ text: '加载中…', style: { fontFamily: 'sans-serif', fontSize: 18, fill: 0xd9ccff } });
  private progress = 0;
  private barWidth = 280;

  constructor() {
    super();
    this.caption.anchor.set(0.5);
    this.addChild(this.track, this.bar, this.caption);
  }

  async load() {
    await Promise.all([loadFonts(), loadTextures((value) => this.setProgress(value))]);
    this.setProgress(1);
  }

  private setProgress(value: number) {
    this.progress = value;
    this.draw();
  }

  private draw() {
    const w = this.barWidth;
    this.track.clear().roundRect(-w / 2, -8, w, 16, 8).fill({ color: 0xffffff, alpha: 0.12 });
    this.bar.clear().roundRect(-w / 2, -8, Math.max(16, w * this.progress), 16, 8).fill(0xffd23f);
  }

  resize(width: number, height: number) {
    this.position.set(width / 2, height / 2);
    this.caption.y = 34;
    this.draw();
  }

  async hide() {
    await gsap.to(this, { alpha: 0, duration: 0.25 });
  }
}

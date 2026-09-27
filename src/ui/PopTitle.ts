import { Container, Text, type TextStyleOptions } from 'pixi.js';
import gsap from 'gsap';

import { FONT_TITLE } from '../app/fonts';
import { INK } from '../svg/palette';

/**
 * A title whose letters pop in one after another, as the chest names do in
 * the reference. Centred on its origin.
 */
export class PopTitle extends Container {
  private letters: Text[] = [];
  /** Laid-out width at rest, unaffected by letters mid-pop. */
  textWidth = 0;

  constructor(private fontSize = 64) {
    super();
  }

  /** Replace the text; letters pop in with a stagger. Resolves when the last one lands. */
  set(text: string, fill: number, animate = true): Promise<void> {
    for (const letter of this.letters) {
      gsap.killTweensOf(letter);
      gsap.killTweensOf(letter.scale);
      letter.destroy();
    }
    const style: TextStyleOptions = {
      fontFamily: FONT_TITLE,
      fontSize: this.fontSize,
      fill,
      stroke: { color: INK, width: Math.round(this.fontSize * 0.16), join: 'round' },
      dropShadow: { color: INK, distance: Math.round(this.fontSize * 0.08), angle: Math.PI / 2, blur: 0, alpha: 1 },
      padding: 8,
    };
    this.letters = [...text].map((char) => {
      const letter = new Text({ text: char, style });
      letter.anchor.set(0.5);
      return letter;
    });
    // Letters overlap slightly, like a chunky game logo.
    const overlap = this.fontSize * 0.08;
    const total = this.letters.reduce((sum, letter) => sum + letter.width - overlap, overlap);
    this.textWidth = total;
    let x = -total / 2;
    for (const letter of this.letters) {
      letter.x = x + letter.width / 2;
      x += letter.width - overlap;
      this.addChild(letter);
    }
    if (!animate) return Promise.resolve();
    const tweens = this.letters.map((letter, index) => {
      const delay = index * 0.06;
      gsap.fromTo(letter, { y: -this.fontSize * 0.5, alpha: 0, rotation: (index % 2 ? 1 : -1) * 0.3 }, { y: 0, alpha: 1, rotation: 0, duration: 0.35, delay, ease: 'back.out(2.5)' });
      return gsap.fromTo(letter.scale, { x: 0.2, y: 0.2 }, { x: 1, y: 1, duration: 0.4, delay, ease: 'back.out(3)' });
    });
    return Promise.all(tweens).then(() => undefined);
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    for (const letter of this.letters) {
      gsap.killTweensOf(letter);
      gsap.killTweensOf(letter.scale);
    }
    super.destroy(options);
  }
}

import { Container, Graphics } from 'pixi.js';
import gsap from 'gsap';

import { label } from './Label';

/** Short message sliding in from the top of its parent. */
export function toast(parent: Container, message: string, width: number, y = 96) {
  const node = new Container();
  const text = label(message, 'body', { fontSize: 18, fill: 0xffffff, fontWeight: '600' });
  const bg = new Graphics()
    .roundRect(-text.width / 2 - 22, -22, text.width + 44, 44, 22)
    .fill({ color: 0x12072a, alpha: 0.88 })
    .stroke({ color: 0xffffff, alpha: 0.2, width: 2 });
  node.addChild(bg, text);
  node.position.set(width / 2, y - 30);
  node.alpha = 0;
  parent.addChild(node);
  gsap.to(node, { y, alpha: 1, duration: 0.25, ease: 'back.out(2)' });
  gsap.to(node, { alpha: 0, y: y - 20, duration: 0.3, delay: 2.2, onComplete: () => node.destroy({ children: true }) });
}

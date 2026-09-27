import { Container, NineSliceSprite, Sprite, type Text } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { tex } from '../app/textures';
import type { IconId } from '../svg/art';
import { INK } from '../svg/palette';
import { label } from './Label';

type Tab = { id: string; text: string; icon: IconId };

const H = 44;
const PAD = 6;

/**
 * The reference's top-left tab tray: a dark rounded tray with a bright yellow
 * chip on the active tab. With a single tab it doubles as a status chip.
 */
export class TabBar extends Container {
  private tray: NineSliceSprite;
  private chip: NineSliceSprite;
  private items: Array<{ tab: Tab; root: Container; icon: Sprite; text: Text; x: number; w: number }> = [];
  active: string;

  constructor(
    tabs: Tab[],
    active: string,
    private onChange: (id: string) => void = () => undefined,
  ) {
    super();
    this.active = active;
    this.tray = new NineSliceSprite({ texture: tex('tab-tray'), leftWidth: 22, rightWidth: 22, topHeight: 22, bottomHeight: 22 });
    this.chip = new NineSliceSprite({ texture: tex('tab-chip'), leftWidth: 18, rightWidth: 18, topHeight: 18, bottomHeight: 18 });
    this.addChild(this.tray, this.chip);
    let x = PAD;
    for (const tab of tabs) {
      const root = new Container();
      const icon = new Sprite(tex(`icon-${tab.icon}`));
      icon.anchor.set(0.5);
      icon.width = icon.height = 20;
      const text = label(tab.text, 'button', { fontSize: 18 });
      text.anchor.set(0, 0.5);
      icon.position.set(18, H / 2);
      text.position.set(34, H / 2 - 1);
      root.addChild(icon, text);
      const w = Math.ceil(text.width) + 48;
      root.x = x;
      root.y = PAD;
      if (tabs.length > 1) {
        root.eventMode = 'static';
        root.cursor = 'pointer';
        root.hitArea = { contains: (px: number, py: number) => px >= 0 && px <= w && py >= 0 && py <= H };
        root.on('pointertap', () => this.select(tab.id));
      }
      this.addChild(root);
      this.items.push({ tab, root, icon, text, x, w });
      x += w + 4;
    }
    this.tray.width = x - 4 + PAD;
    this.tray.height = H + PAD * 2;
    this.render(false);
  }

  get barWidth() {
    return this.tray.width;
  }

  get barHeight() {
    return this.tray.height;
  }

  /** Change the text of a tab (e.g. a live status chip). */
  setText(id: string, text: string) {
    const item = this.items.find((entry) => entry.tab.id === id);
    if (!item) return;
    item.text.text = text;
  }

  select(id: string) {
    if (id === this.active) return;
    sfx.click();
    this.active = id;
    this.render(true);
    this.onChange(id);
  }

  private render(animate: boolean) {
    const item = this.items.find((entry) => entry.tab.id === this.active) ?? this.items[0];
    for (const entry of this.items) {
      const on = entry === item;
      entry.text.style.fill = on ? INK : 0x9d90c4;
      entry.icon.tint = on ? INK : 0x9d90c4;
    }
    const target = { x: item.x, w: item.w };
    this.chip.y = PAD;
    this.chip.height = H;
    if (animate) {
      gsap.to(this.chip, { x: target.x, width: target.w, duration: 0.25, ease: 'back.out(1.6)' });
    } else {
      this.chip.x = target.x;
      this.chip.width = target.w;
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    gsap.killTweensOf(this.chip);
    super.destroy(options);
  }
}

import { Container, NineSliceSprite, Sprite, Text } from 'pixi.js';
import gsap from 'gsap';

import { getProfile, onProfileChange } from '../app/storage';
import { tex } from '../app/textures';
import { label } from './Label';

export type Currency = 'coins' | 'gems' | 'crowns';
const ICON: Record<Currency, string> = { coins: 'coin', gems: 'gem', crowns: 'crown' };

/** Top-right currency counters, as in the reference result screen. */
export class Hud extends Container {
  private values = new Map<Currency, { text: Text; value: { v: number }; icon: Sprite; baseScale: number }>();
  private unsubscribe: () => void;

  constructor() {
    super();
    const profile = getProfile();
    let x = 0;
    for (const currency of ['coins', 'gems', 'crowns'] as Currency[]) {
      const item = new Container();
      const bg = new NineSliceSprite({ texture: tex('pill'), leftWidth: 24, rightWidth: 24, topHeight: 20, bottomHeight: 20 });
      bg.width = 112;
      bg.height = 40;
      const icon = new Sprite(tex(ICON[currency]));
      icon.anchor.set(0.5);
      icon.width = icon.height = 38;
      icon.position.set(8, 20);
      const text = label(String(profile[currency]), 'number', { fontSize: 20 });
      text.anchor.set(0, 0.5);
      text.position.set(32, 20);
      item.addChild(bg, icon, text);
      item.x = x;
      x += 124;
      this.addChild(item);
      this.values.set(currency, { text, value: { v: profile[currency] }, icon, baseScale: icon.scale.x });
    }
    this.unsubscribe = onProfileChange((next) => {
      for (const currency of ['coins', 'gems', 'crowns'] as Currency[]) this.animateTo(currency, next[currency]);
    });
  }

  get totalHeight() {
    return 40;
  }

  get totalWidth() {
    return 124 * 3 - 12;
  }

  /** Global position of a currency icon, for rewards flying into the HUD. */
  iconPosition(currency: Currency) {
    const entry = this.values.get(currency);
    return entry ? entry.icon.getGlobalPosition() : this.getGlobalPosition();
  }

  /** Bump a counter by `amount` for a landing reward, ahead of the profile update. */
  bump(currency: Currency, amount: number) {
    const entry = this.values.get(currency);
    if (!entry) return;
    gsap.killTweensOf(entry.value);
    entry.value.v = Math.round(entry.value.v + amount);
    entry.text.text = String(entry.value.v);
    gsap.killTweensOf(entry.icon.scale);
    const base = entry.baseScale;
    gsap.fromTo(entry.icon.scale, { x: base * 1.35, y: base * 1.35 }, { x: base, y: base, duration: 0.25, ease: 'back.out(3)' });
  }

  private animateTo(currency: Currency, target: number) {
    const entry = this.values.get(currency);
    if (!entry || entry.value.v === target) return;
    gsap.to(entry.value, {
      v: target,
      duration: 0.8,
      ease: 'power2.out',
      onUpdate: () => void (entry.text.text = String(Math.round(entry.value.v))),
    });
    const base = entry.baseScale;
    gsap.killTweensOf(entry.icon.scale);
    gsap.fromTo(entry.icon.scale, { x: base * 1.4, y: base * 1.4 }, { x: base, y: base, duration: 0.4, ease: 'back.out(3)' });
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.unsubscribe();
    // The count-up tween writes into a Text that is about to be destroyed.
    for (const entry of this.values.values()) {
      gsap.killTweensOf(entry.value);
      gsap.killTweensOf(entry.icon.scale);
    }
    super.destroy(options);
  }
}

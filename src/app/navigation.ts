import { Container, Graphics, type Ticker } from 'pixi.js';
import gsap from 'gsap';

/** A full-screen view. Mirrors the screen contract used by PixiJS Open Games. */
export interface AppScreen extends Container {
  show?(): Promise<void>;
  hide?(): Promise<void>;
  resize?(width: number, height: number): void;
  update?(ticker: Ticker): void;
  onLeave?(): void;
}

/** A modal shown above the current screen. */
export interface AppPopup extends Container {
  show?(): Promise<void>;
  hide?(): Promise<void>;
  resize?(width: number, height: number): void;
  update?(ticker: Ticker): void;
}

/**
 * Kill every GSAP tween aimed at `root` or anything inside it. Pixi nulls a
 * container's position/scale on destroy, so a tween that outlives its target
 * would throw on the next tick.
 */
export function killTweensDeep(root: Container) {
  const visit = (node: Container) => {
    gsap.killTweensOf(node);
    gsap.killTweensOf(node.scale);
    gsap.killTweensOf(node.position);
    gsap.killTweensOf(node.pivot);
    for (const child of node.children) visit(child);
  };
  visit(root);
}

class Navigation {
  readonly root = new Container();
  private screenLayer = new Container();
  private popupLayer = new Container();
  private dim = new Graphics();
  screen: AppScreen | null = null;
  popup: AppPopup | null = null;
  width = 0;
  height = 0;

  constructor() {
    this.dim.eventMode = 'static';
    this.dim.visible = false;
    this.root.addChild(this.screenLayer, this.dim, this.popupLayer);
  }

  /** Screen swaps run one at a time so overlapping calls never stack two screens. */
  private transition: Promise<void> = Promise.resolve();

  goTo(next: AppScreen): Promise<void> {
    const swap = this.transition.then(() => this.swap(next));
    this.transition = swap.catch(() => undefined);
    // `show` runs outside the queue: a screen left mid-intro must not block the next swap.
    return swap.then(() => (next.destroyed ? undefined : next.show?.()));
  }

  private async swap(next: AppScreen) {
    await this.dismissPopup();
    const previous = this.screen;
    if (previous) {
      previous.eventMode = 'none';
      await previous.hide?.();
      previous.onLeave?.();
      this.screenLayer.removeChild(previous);
      killTweensDeep(previous);
      previous.destroy({ children: true });
    }
    this.screen = next;
    this.screenLayer.addChild(next);
    next.resize?.(this.width, this.height);
    // A popup opened while the old screen was fading out belongs to that screen.
    await this.dismissPopup();
  }

  async present(popup: AppPopup) {
    if (this.popup) await this.dismissPopup();
    this.popup = popup;
    this.dim.visible = true;
    this.dim.alpha = 0;
    gsap.to(this.dim, { alpha: 1, duration: 0.2 });
    this.popupLayer.addChild(popup);
    popup.resize?.(this.width, this.height);
    if (this.screen) this.screen.interactiveChildren = false;
    await popup.show?.();
  }

  async dismissPopup() {
    const popup = this.popup;
    if (!popup) return;
    this.popup = null;
    gsap.to(this.dim, { alpha: 0, duration: 0.2, onComplete: () => void (this.dim.visible = false) });
    await popup.hide?.();
    this.popupLayer.removeChild(popup);
    killTweensDeep(popup);
    popup.destroy({ children: true });
    if (this.screen) this.screen.interactiveChildren = true;
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.dim.clear().rect(0, 0, width, height).fill({ color: 0x0b0418, alpha: 0.62 });
    this.screen?.resize?.(width, height);
    this.popup?.resize?.(width, height);
  }

  update(ticker: Ticker) {
    this.screen?.update?.(ticker);
    this.popup?.update?.(ticker);
  }
}

export const navigation = new Navigation();

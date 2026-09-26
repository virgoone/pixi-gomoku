import { Container, type NineSliceSprite, type Text } from 'pixi.js';
import gsap from 'gsap';

import { navigation } from '../app/navigation';
import { IconButton } from '../ui/Button';
import { label } from '../ui/Label';
import { panel } from '../ui/Panel';

/** Centred panel with a title and a close button; subclasses fill `body`. */
export class BasePopup extends Container {
  protected box = new Container();
  protected body = new Container();
  protected bg: NineSliceSprite;
  protected title: Text;
  protected closeButton: IconButton;

  constructor(
    titleText: string,
    protected panelWidth = 560,
    protected panelHeight = 520,
    closable = true,
  ) {
    super();
    this.bg = panel(panelWidth, panelHeight);
    this.title = label(titleText, 'heading', { fontSize: 36 });
    this.title.y = -panelHeight / 2 + 50;
    this.closeButton = new IconButton({ icon: 'close', skin: 'red', size: 56, onPress: () => this.close() });
    this.closeButton.position.set(panelWidth / 2 - 18, -panelHeight / 2 + 18);
    this.closeButton.visible = closable;
    this.box.addChild(this.bg, this.title, this.body, this.closeButton);
    this.addChild(this.box);
  }

  close() {
    void navigation.dismissPopup();
  }

  resize(width: number, height: number) {
    this.position.set(width / 2, height / 2);
    const scale = Math.min(1, (width - 24) / (this.panelWidth + 20), (height - 24) / (this.panelHeight + 20));
    this.box.scale.set(scale);
  }

  async show() {
    const target = this.box.scale.x;
    this.box.alpha = 0;
    gsap.to(this.box, { alpha: 1, duration: 0.15 });
    await gsap.fromTo(this.box.scale, { x: target * 0.8, y: target * 0.8 }, { x: target, y: target, duration: 0.35, ease: 'back.out(2)' });
  }

  async hide() {
    await gsap.to(this.box, { alpha: 0, duration: 0.15 });
  }
}

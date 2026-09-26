import { Container, type NineSliceSprite, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BRAINS, type BrainId } from '../gomoku/ai';
import { BLACK, WHITE } from '../gomoku/rules';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { card } from '../ui/Panel';
import { BasePopup } from './BasePopup';

/** Pick an AI opponent and who moves first. */
export class AiSetupPopup extends BasePopup {
  private brain: BrainId;
  private playFirst: boolean;
  private cards = new Map<BrainId, { bg: NineSliceSprite; root: Container }>();
  private firstButton: Button;

  constructor(private onStart: (brain: BrainId, humanStone: 1 | 2) => void) {
    super('选择对手', 640, 640);
    const profile = getProfile();
    this.brain = profile.lastBrain;
    this.playFirst = profile.playFirst;

    const cardWidth = 180;
    const cardHeight = 300;
    BRAINS.forEach((info, index) => {
      const root = new Container();
      const bg = card(cardWidth, cardHeight, info.id === this.brain);
      const avatar = new Sprite(tex(`avatar-${info.id}`));
      avatar.anchor.set(0.5);
      avatar.width = avatar.height = 104;
      avatar.position.set(cardWidth / 2, 76);
      const level = label(info.title, 'dark', { fontSize: 16, fill: 0x8a6bd1 });
      level.position.set(cardWidth / 2, 142);
      const name = label(info.name, 'dark', { fontSize: 24 });
      name.position.set(cardWidth / 2, 172);
      const stars = new Container();
      for (let star = 0; star < 3; star += 1) {
        const icon = new Sprite(tex('star'));
        icon.anchor.set(0.5);
        icon.width = icon.height = 24;
        icon.x = (star - 1) * 26;
        icon.alpha = star <= info.level ? 1 : 0.2;
        stars.addChild(icon);
      }
      stars.position.set(cardWidth / 2, 204);
      const description = label(info.description, 'small', { fontSize: 13, fill: 0x6a5a8a, wordWrap: true, wordWrapWidth: cardWidth - 28, align: 'center', lineHeight: 19, breakWords: true });
      description.anchor.set(0.5, 0);
      description.position.set(cardWidth / 2, 226);
      root.addChild(bg, avatar, level, name, stars, description);
      root.position.set(-cardWidth * 1.5 - 14 + index * (cardWidth + 14), -210);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', () => this.select(info.id));
      this.cards.set(info.id, { bg, root });
      this.body.addChild(root);
    });

    this.firstButton = new Button({ text: this.firstText(), skin: 'white', width: 300, height: 66, fontSize: 22, onPress: () => this.toggleFirst() });
    this.firstButton.y = 150;
    const start = new Button({
      text: '开始对局',
      skin: 'yellow',
      width: 300,
      height: 84,
      icon: 'play',
      onPress: () => {
        updateProfile({ lastBrain: this.brain, playFirst: this.playFirst });
        const brain = this.brain;
        const stone = this.playFirst ? BLACK : WHITE;
        void navigation.dismissPopup().then(() => this.onStart(brain, stone));
      },
    });
    start.y = 238;
    this.body.addChild(this.firstButton, start);
  }

  private firstText() {
    return this.playFirst ? '我执黑 · 先手' : '我执白 · 后手';
  }

  private toggleFirst() {
    this.playFirst = !this.playFirst;
    this.firstButton.setText(this.firstText());
  }

  private select(id: BrainId) {
    if (id === this.brain) return;
    sfx.click();
    this.brain = id;
    for (const [brain, entry] of this.cards) {
      entry.bg.texture = tex(brain === id ? 'card-selected' : 'card');
      if (brain === id) gsap.fromTo(entry.root.scale, { x: 1.06, y: 1.06 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    }
  }
}

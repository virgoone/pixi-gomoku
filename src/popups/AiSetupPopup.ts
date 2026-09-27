import { Container, type NineSliceSprite, Sprite } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BRAINS, type BrainId, type EngineState, masterEngine } from '../gomoku/ai';
import { nextVariant, normalizeVariant, type Opening, type Variant, variantName } from '../gomoku/opening';
import { BLACK, type Rule, WHITE } from '../gomoku/rules';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { card } from '../ui/Panel';
import { BasePopup } from './BasePopup';

/**
 * Pick an AI opponent, who moves first and the rule. Picking the master starts
 * downloading its engine; the start button waits for it and shows the progress.
 */
export class AiSetupPopup extends BasePopup {
  private brain: BrainId;
  private playFirst: boolean;
  private variant: Variant;
  private cards = new Map<BrainId, { bg: NineSliceSprite; root: Container }>();
  private firstButton: Button;
  private ruleButton: Button;
  private startButton: Button;
  private unsubscribe: () => void;

  constructor(private onStart: (brain: BrainId, humanStone: 1 | 2, rule: Rule, opening: Opening) => void) {
    super('选择对手', 720, 640);
    const profile = getProfile();
    this.brain = profile.lastBrain;
    this.playFirst = profile.playFirst;
    this.variant = normalizeVariant(profile.rule, profile.opening);

    const cardWidth = 156;
    const cardHeight = 300;
    const gap = 12;
    BRAINS.forEach((info, index) => {
      const root = new Container();
      const bg = card(cardWidth, cardHeight, info.id === this.brain);
      const avatar = new Sprite(tex(`avatar-${info.id}`));
      avatar.anchor.set(0.5);
      avatar.width = avatar.height = 96;
      avatar.position.set(cardWidth / 2, 76);
      const level = label(info.title, 'dark', { fontSize: 16, fill: 0x8a6bd1 });
      level.position.set(cardWidth / 2, 142);
      const name = label(info.name, 'dark', { fontSize: 24 });
      name.position.set(cardWidth / 2, 172);
      const stars = new Container();
      for (let star = 0; star < 4; star += 1) {
        const icon = new Sprite(tex('star'));
        icon.anchor.set(0.5);
        icon.width = icon.height = 24;
        icon.x = (star - 1.5) * 26;
        icon.alpha = star <= info.level ? 1 : 0.2;
        stars.addChild(icon);
      }
      stars.position.set(cardWidth / 2, 204);
      const description = label(info.description, 'small', { fontSize: 13, fill: 0x6a5a8a, wordWrap: true, wordWrapWidth: cardWidth - 28, align: 'center', lineHeight: 19, breakWords: true });
      description.anchor.set(0.5, 0);
      description.position.set(cardWidth / 2, 226);
      root.addChild(bg, avatar, level, name, stars, description);
      root.position.set(-(BRAINS.length * cardWidth + (BRAINS.length - 1) * gap) / 2 + index * (cardWidth + gap), -210);
      root.eventMode = 'static';
      root.cursor = 'pointer';
      root.on('pointertap', () => this.select(info.id));
      this.cards.set(info.id, { bg, root });
      this.body.addChild(root);
    });

    this.firstButton = new Button({ text: this.firstText(), skin: 'white', width: 280, height: 66, fontSize: 22, onPress: () => this.toggleFirst() });
    this.firstButton.position.set(-148, 150);
    this.ruleButton = new Button({ text: this.ruleText(), skin: 'white', width: 280, height: 66, fontSize: 20, onPress: () => this.toggleRule() });
    this.ruleButton.position.set(148, 150);
    const start = new Button({
      text: '开始对局',
      skin: 'yellow',
      width: 300,
      height: 84,
      icon: 'play',
      onPress: () => {
        if (this.brain === 'master' && masterEngine.state.status !== 'ready') {
          // Only reachable after a failed download: the button then offers a retry.
          void masterEngine.load().catch(() => undefined);
          return;
        }
        const { rule, opening } = this.variant;
        updateProfile({ lastBrain: this.brain, playFirst: this.playFirst, rule, opening });
        const brain = this.brain;
        const stone = this.playFirst ? BLACK : WHITE;
        void navigation.dismissPopup().then(() => this.onStart(brain, stone, rule, opening));
      },
    });
    start.y = 238;
    this.startButton = start;
    this.unsubscribe = masterEngine.onChange((state) => this.renderEngine(state));
    this.body.addChild(this.firstButton, this.ruleButton, start);
    this.prepareEngine();
  }

  /** Start the master's download as soon as it is picked (or was picked last time). */
  private prepareEngine() {
    if (this.brain === 'master') void masterEngine.load().catch(() => undefined);
    this.renderEngine(masterEngine.state);
  }

  private renderEngine(state: EngineState) {
    if (this.destroyed) return;
    const button = this.startButton;
    if (this.brain !== 'master' || state.status === 'ready') {
      button.setText('开始对局');
      button.setEnabled(true);
    } else if (state.status === 'error') {
      button.setText('加载失败 · 重试');
      button.setEnabled(true);
    } else {
      button.setText(`加载引擎 ${Math.round(state.progress * 100)}%`);
      button.setEnabled(false);
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.unsubscribe();
    super.destroy(options);
  }

  private firstText() {
    // Under the RIF opening the colours can still swap: "first" means placing the opening.
    if (this.variant.opening === 'rif') return this.playFirst ? '我先摆开局' : '对手先摆开局';
    return this.playFirst ? '我执黑 · 先手' : '我执白 · 后手';
  }

  private toggleFirst() {
    this.playFirst = !this.playFirst;
    this.firstButton.setText(this.firstText());
  }

  private ruleText() {
    const { rule, opening } = this.variant;
    if (rule === 'freestyle') return '无禁手 · 自由五子';
    return opening === 'rif' ? variantName(this.variant) : '连珠 · 黑棋有禁手';
  }

  private toggleRule() {
    this.variant = nextVariant(this.variant);
    this.ruleButton.setText(this.ruleText());
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
    this.prepareEngine();
  }
}

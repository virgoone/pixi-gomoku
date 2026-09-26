import { Container, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { setMuted } from '../app/audio';
import { navigation } from '../app/navigation';
import { getProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BLACK } from '../gomoku/rules';
import { AiSetupPopup } from '../popups/AiSetupPopup';
import { OnlinePopup } from '../popups/OnlinePopup';
import { Backdrop } from '../ui/Backdrop';
import { Button, IconButton } from '../ui/Button';
import { Hud } from '../ui/Hud';
import { label } from '../ui/Label';
import { GameScreen } from './GameScreen';

export class HomeScreen extends Container {
  private backdrop = new Backdrop('backdrop-home', { raysTint: 0xb58cff });
  private hud = new Hud();
  private sound: IconButton;
  private logo = new Container();
  private stones = new Sprite(tex('logo'));
  private title: Text;
  private subtitle: Text;
  private stats: Text;
  private buttons: Button[];
  private footer: Text;
  private time = 0;

  constructor(private initialRoom?: string) {
    super();
    this.stones.anchor.set(0.5, 1);
    this.title = label('五子棋', 'title', { fontSize: 96, fill: 0xffe36b, letterSpacing: 8 });
    this.subtitle = label('GOMOKU · 五子连珠即胜', 'heading', { fontSize: 22, fill: 0xe7dcff, letterSpacing: 2 });
    this.logo.addChild(this.stones, this.title, this.subtitle);

    const profile = getProfile();
    this.stats = label(this.statsText(), 'body', { fontSize: 16, fill: 0xd9ccff });
    this.sound = new IconButton({
      icon: profile.muted ? 'soundOff' : 'soundOn',
      size: 58,
      onPress: () => {
        setMuted(!getProfile().muted);
        this.sound.setIcon(getProfile().muted ? 'soundOff' : 'soundOn');
      },
    });

    this.buttons = [
      new Button({ text: '人机对战', skin: 'yellow', width: 330, height: 92, icon: 'robot', onPress: () => this.openAi() }),
      new Button({ text: '同屏双人', skin: 'blue', width: 330, height: 92, icon: 'users', onPress: () => void navigation.goTo(new GameScreen({ mode: 'local' })) }),
      new Button({ text: '在线房间', skin: 'green', width: 330, height: 92, icon: 'globe', onPress: () => this.openOnline() }),
    ];
    this.footer = label('PixiJS · 所有画面均为 SVG 绘制', 'small', { fontSize: 12, fill: 0x9a8bc8 });

    this.addChild(this.backdrop, this.logo, this.stats, ...this.buttons, this.footer, this.hud, this.sound);
  }

  private statsText() {
    const p = getProfile();
    return `战绩 ${p.wins} 胜 ${p.losses} 负 ${p.draws} 平 · 当前连胜 ${p.streak} · 最高 ${p.bestStreak}`;
  }

  private openAi() {
    void navigation.present(new AiSetupPopup((brain, humanStone) => void navigation.goTo(new GameScreen({ mode: 'ai', brain, humanStone }))));
  }

  private openOnline(code?: string) {
    void navigation.present(
      new OnlinePopup(
        {
          onStart: (link, myStone) => void navigation.goTo(new GameScreen({ mode: 'online', link, myStone, round: 1 })),
          onFallback: () => void navigation.goTo(new GameScreen({ mode: 'ai', brain: 'fox', humanStone: BLACK })),
        },
        code,
      ),
    );
  }

  resize(width: number, height: number) {
    this.backdrop.resize(width, height, { x: width / 2, y: height * 0.3 });
    const scale = Math.min(1, width / 480, height / 820);
    this.logo.scale.set(scale);
    this.logo.position.set(width / 2, height * 0.3);
    this.stones.position.set(0, -58);
    this.stones.width = 180;
    this.stones.height = 114;
    this.title.y = 0;
    this.subtitle.y = 64;
    this.stats.position.set(width / 2, height * 0.3 + 108 * scale);
    this.stats.scale.set(Math.min(1, (width - 32) / (this.stats.width / this.stats.scale.x)));
    const top = height * 0.3 + 180 * scale;
    const gap = Math.min(112, (height - top - 60) / 3);
    this.buttons.forEach((button, index) => {
      button.scale.set(Math.min(1, gap / 112, (width - 40) / 340));
      button.position.set(width / 2, top + gap * (index + 0.5));
    });
    this.footer.position.set(width / 2, height - 22);
    const hudScale = Math.min(1, (width - 100) / (this.hud.totalWidth + 20));
    this.hud.scale.set(hudScale);
    this.hud.position.set(width - this.hud.totalWidth * hudScale - 14, 18);
    this.sound.position.set(40, 40);
  }

  async show() {
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.3 });
    gsap.from(this.logo, { y: this.logo.y - 40, duration: 0.6, ease: 'back.out(1.6)' });
    this.buttons.forEach((button, index) => gsap.from(button, { alpha: 0, y: button.y + 30, duration: 0.4, delay: 0.1 + index * 0.08, ease: 'back.out(2)' }));
    if (this.initialRoom) {
      const code = this.initialRoom;
      this.initialRoom = undefined;
      window.history.replaceState(null, '', window.location.pathname);
      this.openOnline(code);
    }
  }

  async hide() {
    await gsap.to(this, { alpha: 0, duration: 0.2 });
  }

  update(ticker: Ticker) {
    this.time += ticker.deltaMS / 1000;
    this.backdrop.update(ticker);
    this.stones.rotation = Math.sin(this.time * 1.4) * 0.04;
  }
}

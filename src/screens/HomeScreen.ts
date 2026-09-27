import { Container, NineSliceSprite, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { setMuted } from '../app/audio';
import { navigation } from '../app/navigation';
import { getProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BLACK } from '../gomoku/rules';
import { AiSetupPopup } from '../popups/AiSetupPopup';
import { OnlinePopup } from '../popups/OnlinePopup';
import { Backdrop } from '../ui/Backdrop';
import { IconButton } from '../ui/Button';
import { Hud } from '../ui/Hud';
import { label } from '../ui/Label';
import { ModeTile } from '../ui/ModeTile';
import { PopTitle } from '../ui/PopTitle';
import { TabBar } from '../ui/TabBar';
import { GameScreen } from './GameScreen';

/**
 * Home, in the reference's style: tab tray top-left, counters and sound
 * top-right, a chunky popping title, and the game modes as reward-style tiles.
 */
export class HomeScreen extends Container {
  private backdrop = new Backdrop('backdrop-home', { raysTint: 0xc9a8ff });
  private hud = new Hud();
  private sound: IconButton;
  private tabs: TabBar;
  private stones = new Sprite(tex('logo'));
  private eyebrow: Text;
  private title = new PopTitle(92);
  private tiles: ModeTile[];
  private playView = new Container();
  private statsView = new Container();
  private footer: Text;
  private time = 0;

  constructor(private initialRoom?: string) {
    super();
    this.backdrop.rays.alpha = 0.28;
    this.stones.anchor.set(0.5, 1);
    this.eyebrow = label('GOMOKU · 五子连珠即胜', 'heading', { fontSize: 20, fill: 0xffffff });
    void this.title.set('五子棋', 0xffd84a, false);

    const profile = getProfile();
    this.sound = new IconButton({
      icon: profile.muted ? 'soundOff' : 'soundOn',
      size: 48,
      onPress: () => {
        setMuted(!getProfile().muted);
        this.sound.setIcon(getProfile().muted ? 'soundOff' : 'soundOn');
      },
    });
    this.tabs = new TabBar(
      [
        { id: 'play', text: '对战', icon: 'swords' },
        { id: 'stats', text: '战绩', icon: 'trophy' },
      ],
      'play',
      (id) => this.showTab(id),
    );

    this.tiles = [
      new ModeTile({ skin: 'yellow', art: tex('avatar-fox'), title: '人机对战', caption: '三位电脑棋手', onPress: () => this.openAi() }),
      new ModeTile({ skin: 'blue', art: tex('logo'), title: '同屏双人', caption: '一台设备轮流下', onPress: () => void navigation.goTo(new GameScreen({ mode: 'local' })) }),
      new ModeTile({ skin: 'green', art: tex('avatar-friend'), title: '在线房间', caption: '邀请好友对战', onPress: () => this.openOnline() }),
    ];
    this.playView.addChild(...this.tiles);
    this.buildStats();
    this.statsView.visible = false;
    this.footer = label('PixiJS · 所有画面均为 SVG 绘制', 'small', { fontSize: 12, fill: 0x9a8bc8 });

    this.addChild(this.backdrop, this.stones, this.eyebrow, this.title, this.playView, this.statsView, this.footer, this.tabs, this.hud, this.sound);
  }

  private buildStats() {
    const p = getProfile();
    const games = p.wins + p.losses + p.draws;
    const entries: Array<[string, string, string]> = [
      ['胜', String(p.wins), 'tile-yellow'],
      ['负', String(p.losses), 'tile-blue'],
      ['平', String(p.draws), 'tile-green'],
      ['最高连胜', String(p.bestStreak), 'tile-dark'],
    ];
    entries.forEach(([name, value, skin], index) => {
      const tile = new Container();
      const bg = new NineSliceSprite({ texture: tex(skin), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
      bg.width = 124;
      bg.height = 128;
      bg.position.set(-62, -64);
      const number = label(value, 'number', { fontSize: 44, stroke: { color: 0x2a1638, width: 7, join: 'round' } });
      number.y = -10;
      const caption = label(name, 'button', { fontSize: 18, stroke: { color: 0x2a1638, width: 5, join: 'round' } });
      caption.y = 38;
      tile.addChild(bg, number, caption);
      tile.x = (index - 1.5) * 136;
      this.statsView.addChild(tile);
    });
    const rate = games ? Math.round((p.wins / games) * 100) : 0;
    const line = label(`共 ${games} 局 · 胜率 ${rate}% · 当前连胜 ${p.streak}`, 'heading', { fontSize: 20, fill: 0xffffff });
    line.y = 104;
    this.statsView.addChild(line);
  }

  private showTab(id: string) {
    const showing = id === 'stats' ? this.statsView : this.playView;
    const hiding = id === 'stats' ? this.playView : this.statsView;
    hiding.visible = false;
    showing.visible = true;
    const children = showing.children;
    children.forEach((child, index) => {
      const baseY = child.y;
      gsap.fromTo(child, { alpha: 0, y: baseY + 24 }, { alpha: 1, y: baseY, duration: 0.3, delay: index * 0.05, ease: 'back.out(2)' });
    });
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
    const narrow = width < 640;
    this.backdrop.resize(width, height, { x: width / 2, y: height * 0.3 });

    // Top bars.
    const barScale = Math.min(1, (width - 24) / 520);
    this.tabs.scale.set(barScale);
    this.tabs.position.set(12, 12);
    this.sound.scale.set(barScale);
    this.sound.position.set(width - 12 - 24 * barScale, 12 + 28 * barScale);
    const hudScale = narrow ? Math.min(1, (width - 24) / (this.hud.totalWidth + 8)) : barScale;
    this.hud.scale.set(hudScale);
    if (narrow) this.hud.position.set((width - this.hud.totalWidth * hudScale) / 2, 12 + (this.tabs.barHeight + 10) * barScale);
    else this.hud.position.set(width - 12 - 56 * barScale - this.hud.totalWidth * hudScale, 12 + 8 * barScale);
    const topBottom = narrow ? this.hud.y + 40 * hudScale : 12 + this.tabs.barHeight * barScale;

    // Title block.
    const scale = Math.min(1, width / 520, height / 860);
    const titleY = topBottom + 206 * scale;
    this.stones.width = 170 * scale;
    this.stones.height = 108 * scale;
    this.stones.position.set(width / 2, titleY - 86 * scale);
    this.eyebrow.scale.set(scale);
    this.eyebrow.position.set(width / 2, titleY - 70 * scale);
    this.title.scale.set(scale);
    this.title.position.set(width / 2, titleY);

    // Modes: a row of tall tiles, or a list of wide ones on phones.
    const areaTop = titleY + 70 * scale;
    const areaBottom = height - 40;
    if (narrow) {
      for (const tile of this.tiles) tile.layout('wide');
      const tileScale = Math.min(1, (width - 32) / 340, (areaBottom - areaTop) / (3 * 108 + 2 * 16));
      this.tiles.forEach((tile, index) => {
        tile.scale.set(tileScale);
        tile.position.set(0, (index - 1) * (108 + 16) * tileScale);
      });
      this.playView.position.set(width / 2, (areaTop + areaBottom) / 2);
    } else {
      for (const tile of this.tiles) tile.layout('tall');
      const tileScale = Math.min(1, (width - 48) / (3 * 196 + 2 * 22), (areaBottom - areaTop) / 240);
      this.tiles.forEach((tile, index) => {
        tile.scale.set(tileScale);
        tile.position.set((index - 1) * (196 + 22) * tileScale, 0);
      });
      this.playView.position.set(width / 2, (areaTop + areaBottom) / 2);
    }
    const statsScale = Math.min(1, (width - 24) / 560, (areaBottom - areaTop) / 260);
    this.statsView.scale.set(statsScale);
    this.statsView.position.set(width / 2, (areaTop + areaBottom) / 2 - 20 * statsScale);
    this.footer.position.set(width / 2, height - 18);
  }

  async show() {
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.3 });
    void this.title.set('五子棋', 0xffd84a);
    gsap.from(this.stones, { y: this.stones.y - 60, alpha: 0, duration: 0.6, ease: 'bounce.out' });
    this.tiles.forEach((tile, index) => gsap.from(tile, { alpha: 0, y: tile.y + 40, duration: 0.45, delay: 0.15 + index * 0.08, ease: 'back.out(2)' }));
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

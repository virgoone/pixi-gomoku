import { Container, NineSliceSprite, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { speak } from '../app/voice';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BLACK, type Stone, WHITE } from '../gomoku/rules';
import type { NetMessage, OnlineLink } from '../net/online';
import { Chest } from '../result/Chest';
import { type Outcome, type Rewards, type Settlement, settle } from '../result/scoring';
import { TIERS, type TierId } from '../svg/palette';
import { Backdrop } from '../ui/Backdrop';
import { Button } from '../ui/Button';
import { Confetti } from '../ui/Confetti';
import { Hud } from '../ui/Hud';
import { label } from '../ui/Label';
import { toast } from '../ui/Toast';
import { type GameConfig, GameScreen } from './GameScreen';
import { HomeScreen } from './HomeScreen';

type OnlineContext = { link: OnlineLink; round: number; myStone: Stone };
type RewardKey = keyof Rewards;

const REWARD_META: Record<RewardKey, { icon: string; name: string; currency: 'coins' | 'gems' | 'crowns' }> = {
  coins: { icon: 'coin', name: '金币', currency: 'coins' },
  gems: { icon: 'gem', name: '宝石', currency: 'gems' },
  crowns: { icon: 'crown', name: '连胜皇冠', currency: 'crowns' },
};

/** Split `total` into `parts` whole numbers that add up to it. */
function splitAmount(total: number, parts: number) {
  const count = Math.max(1, Math.min(parts, total));
  const base = Math.floor(total / count);
  return Array.from({ length: count }, (_, index) => base + (index < total - base * count ? 1 : 0));
}

const wait = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/**
 * The settlement screen. A win drops a chest that upgrades tier by tier, opens
 * on tap and throws out reward cards (modelled on the reference animation). A
 * loss or draw shows a badge instead.
 */
export class ResultScreen extends Container {
  private settlement: Settlement;
  private backdrop: Backdrop;
  private stage = new Container();
  private ring = new Sprite(tex('ring'));
  private flash = new Sprite(tex('glow'));
  private burstRing = new Sprite(tex('ring'));
  private chest: Chest | null = null;
  private badge: Sprite | null = null;
  private eyebrow: Text;
  private heading: Text;
  private detail: Text;
  private tapHint: Text;
  private cardsLayer = new Container();
  private buttonsLayer = new Container();
  private confetti = new Confetti();
  private hud = new Hud();
  private w = 0;
  private h = 0;
  private time = 0;
  private waitingForTap: (() => void) | null = null;
  private collected = false;
  private credited = false;
  private rematchSent = false;
  private rematchReceived = false;
  private unsubscribers: Array<() => void> = [];
  private keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') this.waitingForTap?.();
  };

  constructor(
    private outcome: Outcome,
    private online: OnlineContext | undefined,
    private replay: () => GameConfig,
  ) {
    super();
    const profile = getProfile();
    this.settlement = settle(outcome, profile.streak);
    this.recordStats();

    const win = this.settlement.kind === 'win';
    const tier: TierId = 0;
    this.backdrop = new Backdrop(win ? `backdrop-tier-${tier}` : 'backdrop-loss', { raysTint: win ? TIERS[tier].glow : 0x8a8ab0, sparkles: win ? 24 : 8 });
    this.backdrop.rays.alpha = win ? 0.45 : 0.18;

    this.ring.anchor.set(0.5);
    this.ring.tint = win ? TIERS[tier].glow : 0x9aa4c8;
    this.ring.blendMode = 'add';
    this.burstRing.anchor.set(0.5);
    this.burstRing.blendMode = 'add';
    this.burstRing.alpha = 0;
    this.flash.anchor.set(0.5);
    this.flash.blendMode = 'add';
    this.flash.alpha = 0;

    this.eyebrow = label(win ? this.settlement.headline : '', 'heading', { fontSize: 24, fill: 0xfff3b0 });
    this.heading = label(win ? TIERS[tier].name : this.settlement.headline, 'title', { fontSize: 64 });
    this.detail = label(this.settlement.detail, 'body', { fontSize: 17, fill: 0xf1eaff });
    this.tapHint = label('点击开启', 'heading', { fontSize: 26 });
    this.tapHint.alpha = 0;

    this.stage.addChild(this.ring, this.burstRing);
    if (win) {
      this.chest = new Chest(tier);
      this.stage.addChild(this.chest);
    } else {
      this.badge = new Sprite(tex(this.settlement.kind === 'draw' ? 'badge-bronze' : 'badge-silver'));
      this.badge.anchor.set(0.5, 1);
      this.stage.addChild(this.badge);
    }
    this.stage.addChild(this.flash);

    this.addChild(this.backdrop, this.stage, this.eyebrow, this.heading, this.detail, this.tapHint, this.cardsLayer, this.buttonsLayer, this.confetti, this.hud);
    this.eventMode = 'static';
    this.on('pointertap', () => this.waitingForTap?.());
    window.addEventListener('keydown', this.keyHandler);

    if (online) this.listenOnline(online);
  }

  private recordStats() {
    const s = this.settlement;
    if (this.outcome.mode === 'local') return;
    updateProfile((profile) => ({
      wins: profile.wins + (s.kind === 'win' ? 1 : 0),
      losses: profile.losses + (s.kind === 'loss' ? 1 : 0),
      draws: profile.draws + (s.kind === 'draw' ? 1 : 0),
      streak: s.streak,
      bestStreak: Math.max(profile.bestStreak, s.streak),
    }));
  }

  // ---- layout -------------------------------------------------------------------------

  /** Chest/badge scale and floor line, fitted between the header and the reward row. */
  private chestScale = 1;
  private floor = 0;

  resize(width: number, height: number) {
    this.w = width;
    this.h = height;
    const textScale = Math.min(1, width / 460, height / 760);
    const uiScale = Math.min(1, width / 520, height / 820);
    const hudScale = Math.min(1, (width - 24) / (this.hud.totalWidth + 20));
    // On narrow screens the HUD spans the width, so the header starts below it.
    const hudBottom = 16 + this.hud.totalHeight * hudScale;
    const headerTop = Math.max(64, height * 0.08, width < this.hud.totalWidth + 240 ? hudBottom + 34 : 0);
    this.eyebrow.scale.set(textScale);
    this.heading.scale.set(textScale);
    this.detail.scale.set(Math.min(textScale, (width - 32) / (this.detail.width / this.detail.scale.x)));
    this.eyebrow.position.set(width / 2, headerTop);
    this.heading.position.set(width / 2, headerTop + 52 * textScale);
    this.detail.position.set(width / 2, headerTop + 102 * textScale);
    const headerBottom = headerTop + 124 * textScale;

    // Reserve the bottom for the reward cards (150) and a button row (84) plus gaps.
    const bottomReserved = (150 + 84 + 70) * uiScale;
    this.floor = height - bottomReserved - 10;
    // The closed chest reaches ~270 units above its floor (body 160 + lid 110).
    this.chestScale = Math.max(0.35, Math.min((width * 0.58) / 240, (this.floor - headerBottom - 12) / 275));
    const scale = this.chestScale;

    this.backdrop.resize(width, height, { x: width / 2, y: this.floor - 120 * scale });
    this.stage.position.set(width / 2, this.floor);
    this.chest?.scale.set(scale);
    if (this.badge) this.badge.scale.set(Math.min(scale, (this.floor - headerBottom - 12) / 250));
    this.ring.scale.set(scale * 1.05);
    this.ring.y = -4 * scale;
    this.burstRing.y = this.ring.y;
    this.flash.y = -110 * scale;
    this.flash.width = this.flash.height = 560 * scale;
    this.tapHint.scale.set(textScale);
    this.tapHint.position.set(width / 2, this.floor + 48 * scale + 18);
    this.cardsLayer.scale.set(uiScale);
    this.cardsLayer.position.set(width / 2, this.floor + (40 + 75) * uiScale);
    this.buttonsLayer.scale.set(uiScale);
    this.buttonsLayer.position.set(width / 2, this.floor + (40 + 150 + 30 + 42) * uiScale);
    this.hud.scale.set(hudScale);
    this.hud.position.set(width - this.hud.totalWidth * hudScale - 14, 16);
  }

  // ---- sequence -----------------------------------------------------------------------

  async show() {
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.25 });
    if (this.settlement.kind === 'win') void this.playChest(this.settlement.tier);
    else void this.playBadge();
  }

  private async popText(text: Text) {
    await gsap.fromTo(text.scale, { x: text.scale.x * 0.4, y: text.scale.y * 0.4 }, { x: text.scale.x, y: text.scale.y, duration: 0.45, ease: 'back.out(3)' });
  }

  private async playChest(finalTier: TierId) {
    const chest = this.chest;
    if (!chest) return;
    const scale = this.chestScale;
    this.detail.alpha = 0;
    gsap.to(this.detail, { alpha: 1, duration: 0.4, delay: 0.3 });
    void this.popText(this.eyebrow);
    void this.popText(this.heading);

    // Drop in.
    chest.y = -this.h;
    await gsap.to(chest, { y: 0, duration: 0.5, ease: 'power3.in' });
    if (this.destroyed) return;
    sfx.land();
    this.ringPulse();
    void chest.land();
    await wait(0.55);
    if (this.destroyed) return;

    // Upgrade one tier at a time.
    for (let tier = 1; tier <= finalTier; tier += 1) {
      this.eyebrow.text = '升级！';
      await chest.charge(0.4);
      if (this.destroyed) return;
      this.flashBurst(TIERS[tier as TierId].glow);
      sfx.upgrade();
      speak('升级！', { rate: 1.2, pitch: 1.3 });
      chest.setTier(tier as TierId);
      this.backdrop.setTexture(`backdrop-tier-${tier}`, 0.35);
      this.backdrop.setRays({ tint: TIERS[tier as TierId].glow });
      this.ring.tint = TIERS[tier as TierId].glow;
      this.heading.text = TIERS[tier as TierId].name;
      void this.popText(this.heading);
      this.sparkleBurst(10 + tier * 6, scale);
      await wait(0.7);
      if (this.destroyed) return;
    }

    // Wait for a tap.
    this.tapHint.alpha = 1;
    const hintTween = gsap.to(this.tapHint.scale, { x: this.tapHint.scale.x * 1.1, y: this.tapHint.scale.y * 1.1, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const idle = chest.idle();
    this.cursor = 'pointer';
    await new Promise<void>((resolve) => {
      this.waitingForTap = resolve;
    });
    this.waitingForTap = null;
    if (this.destroyed) return;
    this.cursor = 'default';
    hintTween.kill();
    idle.kill();
    gsap.to(chest.rig, { y: 0, duration: 0.1 });
    gsap.to(this.tapHint, { alpha: 0, duration: 0.2 });

    // Open.
    sfx.open();
    speak(`恭喜获得${TIERS[finalTier].name}！`, { delay: 0.2 });
    this.flashBurst(0xfff3b0, 1.6);
    this.backdrop.setRays({ alpha: 0.85, scale: this.backdrop.rays.scale.x * 1.25 }, 0.6);
    await chest.open();
    if (this.destroyed) return;
    const mouth = chest.toGlobal(chest.mouth);
    this.confetti.burst(mouth.x, mouth.y, 110, Math.min(1100, this.h * 1.3));
    this.eyebrow.text = '你获得了';
    void this.popText(this.eyebrow);
    await this.showRewards(mouth);
    if (this.destroyed) return;
    this.showCollect();
  }

  private async playBadge() {
    const badge = this.badge;
    if (!badge) return;
    this.eyebrow.text = this.settlement.kind === 'draw' ? '势均力敌' : '再接再厉';
    void this.popText(this.eyebrow);
    void this.popText(this.heading);
    badge.y = -this.h;
    badge.rotation = -0.3;
    await gsap.to(badge, { y: 0, rotation: 0, duration: 0.6, ease: 'bounce.out' });
    if (this.destroyed) return;
    sfx.land();
    this.ringPulse();
    gsap.to(badge, { rotation: 0.04, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    await wait(0.3);
    if (this.destroyed) return;
    await this.showRewards(badge.toGlobal({ x: 0, y: -120 }));
    if (this.destroyed) return;
    this.showCollect();
  }

  private ringPulse() {
    gsap.fromTo(this.ring, { alpha: 0.4 }, { alpha: 1, duration: 0.3 });
    gsap.fromTo(this.ring.scale, { x: this.ring.scale.x * 0.8, y: this.ring.scale.y * 0.8 }, { x: this.ring.scale.x, y: this.ring.scale.y, duration: 0.5, ease: 'back.out(2)' });
  }

  private flashBurst(tint: number, strength = 1) {
    this.flash.tint = tint;
    gsap.fromTo(this.flash, { alpha: 0.95 * Math.min(1, strength) }, { alpha: 0, duration: 0.6, ease: 'power2.out' });
    const base = this.ring.scale.x;
    this.burstRing.tint = tint;
    gsap.fromTo(this.burstRing, { alpha: 1 }, { alpha: 0, duration: 0.7, ease: 'power2.out' });
    gsap.fromTo(this.burstRing.scale, { x: base, y: base }, { x: base * 2.4 * strength, y: base * 2.4 * strength, duration: 0.7, ease: 'power2.out' });
  }

  private sparkleBurst(count: number, scale: number) {
    for (let index = 0; index < count; index += 1) {
      const sparkle = new Sprite(tex('sparkle'));
      sparkle.anchor.set(0.5);
      sparkle.blendMode = 'add';
      sparkle.scale.set(0.3 + Math.random() * 0.5);
      sparkle.position.set(0, -90 * scale);
      this.stage.addChild(sparkle);
      const angle = Math.random() * Math.PI * 2;
      const distance = (120 + Math.random() * 160) * scale;
      gsap.to(sparkle, { x: Math.cos(angle) * distance, y: -90 * scale + Math.sin(angle) * distance, alpha: 0, duration: 0.7 + Math.random() * 0.4, ease: 'power2.out', onComplete: () => sparkle.destroy() });
      gsap.to(sparkle, { rotation: Math.PI, duration: 1 });
    }
  }

  private async showRewards(from: { x: number; y: number }) {
    const entries = (Object.keys(REWARD_META) as RewardKey[]).filter((key) => this.settlement.rewards[key] > 0);
    const cardWidth = 132;
    const gap = 18;
    const total = entries.length * cardWidth + (entries.length - 1) * gap;
    const origin = this.cardsLayer.toLocal(from);
    for (const [index, key] of entries.entries()) {
      const meta = REWARD_META[key];
      const card = new Container();
      const bg = new NineSliceSprite({ texture: tex('card-selected'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
      bg.width = cardWidth;
      bg.height = 150;
      bg.position.set(-cardWidth / 2, -75);
      const icon = new Sprite(tex(meta.icon));
      icon.anchor.set(0.5);
      icon.width = icon.height = 64;
      icon.y = -26;
      const amount = label(`+${this.settlement.rewards[key]}`, 'number', { fontSize: 30, fill: 0xffd23f });
      amount.y = 28;
      const name = label(meta.name, 'dark', { fontSize: 15, fill: 0x8a6bd1 });
      name.y = 58;
      card.addChild(bg, icon, amount, name);
      card.position.set(origin.x, origin.y);
      card.scale.set(0.2);
      card.alpha = 0;
      card.label = key;
      this.cardsLayer.addChild(card);
      const tx = -total / 2 + cardWidth / 2 + index * (cardWidth + gap);
      sfx.reward();
      gsap.to(card, { alpha: 1, duration: 0.15 });
      gsap.to(card, { x: tx, y: 0, duration: 0.55, ease: 'back.out(1.4)' });
      gsap.to(card.scale, { x: 1, y: 1, duration: 0.55, ease: 'back.out(2)' });
      gsap.fromTo(card, { rotation: -0.4 }, { rotation: 0, duration: 0.55, ease: 'back.out(2)' });
      await wait(0.28);
      if (this.destroyed) return;
    }
    await wait(0.4);
  }

  private showCollect() {
    const collect = new Button({ text: '收下', skin: 'yellow', width: 240, height: 84, onPress: () => void this.collect() });
    this.buttonsLayer.addChild(collect);
    gsap.from(collect.scale, { x: 0, y: 0, duration: 0.45, ease: 'back.out(2.6)' });
  }

  private async collect() {
    if (this.collected) return;
    this.collected = true;
    // Let the pressed button finish its own pointer handlers before it goes away.
    for (const child of this.buttonsLayer.children) gsap.to(child, { alpha: 0, duration: 0.2 });
    window.setTimeout(() => {
      if (!this.destroyed) this.buttonsLayer.removeChildren().forEach((child) => child.destroy({ children: true }));
    }, 250);
    // Each card bursts into a handful of icons that fly into its HUD counter one by one;
    // the counter ticks up as each lands. The profile is credited once at the end.
    const flights = this.cardsLayer.children.map((card, cardIndex) => {
      const key = card.label as RewardKey;
      const amount = this.settlement.rewards[key];
      const pieces = key === 'coins' ? 10 : key === 'gems' ? 6 : Math.min(3, amount);
      const shares = splitAmount(amount, pieces);
      const target = this.hud.iconPosition(REWARD_META[key].currency);
      const start = card.toGlobal({ x: 0, y: -26 });
      const startDelay = cardIndex * 0.18;
      // The card itself pops away once its icons are out.
      gsap.timeline({ delay: startDelay })
        .to(card.scale, { x: 1.12, y: 1.12, duration: 0.12, ease: 'power2.out' })
        .to(card.scale, { x: 0, y: 0, duration: 0.25, ease: 'back.in(2)' })
        .to(card, { alpha: 0, duration: 0.1 }, '-=0.1');
      return Promise.all(
        shares.map((share, index) => {
          const icon = new Sprite(tex(REWARD_META[key].icon));
          icon.anchor.set(0.5);
          icon.width = icon.height = key === 'coins' ? 40 : 46;
          icon.position.copyFrom(start);
          icon.alpha = 0;
          this.addChild(icon);
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * 2.4;
          const spread = 50 + Math.random() * 40;
          const scatter = { x: start.x + Math.cos(angle) * spread, y: start.y + Math.sin(angle) * spread };
          const base = icon.scale.x;
          return gsap
            .timeline({ delay: startDelay + 0.1 + index * 0.06 })
            .set(icon, { alpha: 1 })
            .to(icon, { x: scatter.x, y: scatter.y, duration: 0.28, ease: 'power2.out' })
            .to(icon, { rotation: (Math.random() - 0.5) * 1.2, duration: 0.28 }, '<')
            .to(icon, { x: target.x, y: target.y, rotation: 0, duration: 0.5, ease: 'power2.in' }, '+=0.08')
            .to(icon.scale, { x: base * 0.6, y: base * 0.6, duration: 0.5, ease: 'power2.in' }, '<')
            .add(() => {
              sfx.coin();
              this.hud.bump(REWARD_META[key].currency, share);
              icon.destroy();
            });
        }),
      );
    });
    await Promise.all(flights);
    if (this.destroyed) return;
    this.credit();
    this.showNextButtons();
  }

  private showNextButtons() {
    const replay = new Button({ text: '再来一局', skin: 'green', width: 220, height: 80, icon: 'restart', onPress: () => this.onReplay(replay) });
    const home = new Button({ text: '回到主页', skin: 'white', width: 220, height: 80, icon: 'home', onPress: () => this.goHome() });
    replay.x = -120;
    home.x = 120;
    this.buttonsLayer.addChild(replay, home);
    if (this.online && !this.online.link.isOpen) replay.setEnabled(false);
    gsap.from(replay.scale, { x: 0, y: 0, duration: 0.4, ease: 'back.out(2.4)' });
    gsap.from(home.scale, { x: 0, y: 0, duration: 0.4, delay: 0.06, ease: 'back.out(2.4)' });
  }

  private onReplay(button: Button) {
    if (!this.online) {
      void navigation.goTo(new GameScreen(this.replay()));
      return;
    }
    if (this.rematchSent) return;
    this.rematchSent = true;
    this.online.link.send({ type: 'rematch' });
    button.setText('等待对手…');
    button.setEnabled(false);
    this.tryRematch();
  }

  // ---- online rematch -----------------------------------------------------------------

  private listenOnline(context: OnlineContext) {
    this.unsubscribers.push(
      context.link.onMessage((message: NetMessage) => {
        if (message.type === 'rematch') {
          this.rematchReceived = true;
          if (!this.rematchSent) toast(this, `${context.link.opponentName}想再来一局`, this.w, 150);
          this.tryRematch();
        } else if (message.type === 'start' && context.link.role === 'guest') {
          const myStone: Stone = message.hostStone === BLACK ? WHITE : BLACK;
          void navigation.goTo(new GameScreen({ mode: 'online', link: context.link, myStone, round: message.round }));
        }
      }),
      context.link.onClose((reason) => {
        toast(this, reason, this.w, 150);
        for (const child of this.buttonsLayer.children) if (child instanceof Button && child.x < 0) child.setEnabled(false);
      }),
    );
  }

  private tryRematch() {
    const context = this.online;
    if (!context || !this.rematchSent || !this.rematchReceived || context.link.role !== 'host') return;
    const round = context.round + 1;
    // Colours swap every round; round 1 host plays black.
    const hostStone: Stone = round % 2 === 1 ? BLACK : WHITE;
    context.link.send({ type: 'start', hostStone, round });
    void navigation.goTo(new GameScreen({ mode: 'online', link: context.link, myStone: hostStone, round }));
  }

  private goHome() {
    this.online?.link.close();
    void navigation.goTo(new HomeScreen());
  }

  // ---- lifecycle ----------------------------------------------------------------------

  async hide() {
    await gsap.to(this, { alpha: 0, duration: 0.2 });
  }

  update(ticker: Ticker) {
    this.time += ticker.deltaMS / 1000;
    this.backdrop.update(ticker);
    this.confetti.update(ticker);
    this.chest?.pulseGlow(this.time);
    this.ring.alpha = 0.75 + 0.25 * Math.sin(this.time * 3);
  }

  onLeave() {
    window.removeEventListener('keydown', this.keyHandler);
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    // Never lose rewards: credit them if the player leaves before (or while) collecting.
    this.credit();
  }

  /** Add this result's rewards to the profile, exactly once. */
  private credit() {
    if (this.credited) return;
    this.credited = true;
    const rewards = this.settlement.rewards;
    updateProfile((profile) => ({ coins: profile.coins + rewards.coins, gems: profile.gems + rewards.gems, crowns: profile.crowns + rewards.crowns }));
  }
}

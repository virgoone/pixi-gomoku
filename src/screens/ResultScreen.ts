import { Container, Graphics, NineSliceSprite, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { account, type SubmitResult } from '../net/account';
import { say } from '../app/voice';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { BLACK, type Rule, type Stone, WHITE } from '../gomoku/rules';
import type { NetMessage, OnlineLink } from '../net/online';
import { Chest } from '../result/Chest';
import { Effects } from '../result/Effects';
import { type Outcome, type Rewards, type Settlement, settle } from '../result/scoring';
import { TIERS, type TierId } from '../svg/palette';
import { Backdrop } from '../ui/Backdrop';
import { Button } from '../ui/Button';
import { Confetti } from '../ui/Confetti';
import { Hud } from '../ui/Hud';
import { label } from '../ui/Label';
import { PopTitle } from '../ui/PopTitle';
import { toast } from '../ui/Toast';
import { type GameConfig, GameScreen } from './GameScreen';
import { HomeScreen } from './HomeScreen';

type OnlineContext = { link: OnlineLink; round: number; myStone: Stone; rule: Rule };
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

/** Honour the OS "reduce motion" setting: no screen shake or camera moves, fewer particles. */
const reduceMotion = typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

type Point = { x: number; y: number };

/** Move `node` along a quadratic Bézier from its current position through `control` to `to`. */
function arcTo(node: { x: number; y: number }, control: Point, to: Point, vars: gsap.TweenVars) {
  // The start is read when the tween starts, so it works as a later step in a timeline.
  const from = { x: node.x, y: node.y };
  const t = { v: 0 };
  return gsap.to(t, {
    ...vars,
    v: 1,
    onStart: () => {
      from.x = node.x;
      from.y = node.y;
    },
    onUpdate: () => {
      const u = 1 - t.v;
      node.x = u * u * from.x + 2 * u * t.v * control.x + t.v * t.v * to.x;
      node.y = u * u * from.y + 2 * u * t.v * control.y + t.v * t.v * to.y;
    },
  });
}

/** Timings (seconds) and strengths of the chest sequence; the knobs for tuning the show. */
const SHOW = {
  /** Pause after landing and after each upgrade. */
  beat: 1.0,
  /** Rattle before the burst. */
  charge: 1.0,
  /** Burst strength per tier (0..1): flash, shake, particle counts and the boom all scale with it. */
  strength: [0.45, 0.6, 0.8, 1] as const,
  /** Peak of the radial bloom at full strength (never above 0.8). */
  bloom: 0.75,
  /** Screen shake amplitude (px) and camera push (scale) at full strength. */
  shake: 14,
  push: 0.07,
};

/**
 * The settlement screen. A win drops a chest that upgrades tier by tier, opens
 * on tap and throws out reward cards (modelled on the reference animation). A
 * loss or draw shows a badge instead.
 */
export class ResultScreen extends Container {
  private settlement: Settlement;
  private backdrop: Backdrop;
  /** Everything the camera moves (shake, push); the HUD, cards and buttons stay put. */
  private world = new Container();
  private stage = new Container();
  private ring = new Sprite(tex('ring'));
  private flash = new Sprite(tex('glow'));
  private burstRing = new Sprite(tex('ring'));
  private chest: Chest | null = null;
  private badge: Sprite | null = null;
  private eyebrow: Text;
  private heading: PopTitle;
  private detail: Text;
  private tapHint: Text;
  private cardsLayer = new Container();
  private buttonsLayer = new Container();
  private confetti = new Confetti();
  private fx = new Effects();
  private hud = new Hud();
  private w = 0;
  private h = 0;
  private time = 0;
  private waitingForTap: (() => void) | null = null;
  /** A tap during the upgrades: speed them up and open straight after. */
  private tapQueued = false;
  private hurry = false;
  private acceptEarlyTap = false;
  private twinkling = false;
  private twinkleClock = 0;
  private collected = false;
  private credited = false;
  private rematchSent = false;
  private rematchReceived = false;
  private unsubscribers: Array<() => void> = [];
  /** Leaderboard submission for this game, once sent. */
  private ladder: Promise<SubmitResult | null> | null = null;
  private keyHandler = (event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') this.onTap();
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

    this.eyebrow = label(win ? this.settlement.headline : '', 'heading', { fontSize: 24, fill: 0xffffff });
    this.heading = new PopTitle(64);
    void this.heading.set(win ? TIERS[tier].name : this.settlement.headline, win ? TIERS[tier].title : 0xffffff, false);
    this.heading.alpha = 0;
    this.detail = label(this.settlement.detail, 'body', { fontSize: 17, fill: 0xf1eaff });
    this.tapHint = label('点击开启', 'heading', { fontSize: 26, fill: 0xffffff });
    this.tapHint.alpha = 0;

    this.stage.addChild(this.ring, this.burstRing);
    if (win) {
      this.chest = new Chest(tier);
      this.chest.setGlow(TIERS[tier].glow);
    } else {
      this.badge = new Sprite(tex(this.settlement.kind === 'draw' ? 'badge-bronze' : 'badge-silver'));
      this.badge.anchor.set(0.5, 1);
    }

    // The flash sits behind the chest: its light spills round the edges, never over the front.
    this.stage.addChild(this.flash);
    if (this.chest) this.stage.addChild(this.chest);
    if (this.badge) this.stage.addChild(this.badge);
    if (reduceMotion) this.fx.density = 0.5;
    this.world.addChild(this.backdrop, this.stage, this.eyebrow, this.heading, this.detail, this.tapHint, this.fx);
    this.addChild(this.world, this.cardsLayer, this.buttonsLayer, this.confetti, this.hud);
    this.eventMode = 'static';
    this.on('pointertap', () => this.onTap());
    window.addEventListener('keydown', this.keyHandler);

    if (online) this.listenOnline(online);
    this.setupLadder();
  }

  // ---- leaderboard ----------------------------------------------------------------------

  private get rated() {
    return this.outcome.mode !== 'local' && Boolean(this.outcome.moves?.length);
  }

  /** Save every rated game locally; signed-in players also synchronize it. */
  private setupLadder() {
    if (!this.rated) return;
    this.ladder = account.submit(this.outcome).catch(() => null);
  }

  /** Where the reward cards were: free once the rewards are collected. */
  private get ladderToastY() {
    const ui = Math.min(1, this.w / 520, this.h / 820);
    return this.floor + 115 * ui;
  }

  /** Tell the player what the game did on the leaderboard. */
  private announceLadder() {
    void this.ladder?.then((result) => {
      if (this.destroyed) return;
      if (!result) {
        toast(this, account.user ? '成绩已保存在本机，联网后自动同步' : '成绩已保存在本机，查看排行榜时登录同步', this.w, this.ladderToastY);
        return;
      }
      const gained = result.points > 0 ? `排行榜 +${result.points} 分` : '成绩已记录';
      toast(this, result.rank ? `${gained} · 第 ${result.rank} 名` : gained, this.w, this.ladderToastY);
    });
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
    this.world.pivot.set(width / 2, height / 2);
    this.world.position.set(width / 2, height / 2);
    const textScale = Math.min(1, width / 460, height / 760);
    const uiScale = Math.min(1, width / 520, height / 820);
    const hudScale = Math.min(1, (width - 24) / (this.hud.totalWidth + 20));
    // On narrow screens the HUD spans the width, so the header starts below it.
    const hudBottom = 16 + this.hud.totalHeight * hudScale;
    const headerTop = Math.max(64, height * 0.08, width < this.hud.totalWidth + 240 ? hudBottom + 34 : 0);
    this.eyebrow.scale.set(textScale);
    this.fitHeading(textScale);
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
    this.tapHintScale = textScale;
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

  private textScale = 1;
  private tapHintScale = 1;

  private fitHeading(textScale = this.textScale) {
    this.textScale = textScale;
    this.heading.scale.set(Math.min(textScale, (this.w - 24) / Math.max(1, this.heading.textWidth)));
  }

  private setHeading(text: string, fill: number) {
    this.heading.alpha = 1;
    const done = this.heading.set(text, fill);
    this.fitHeading();
    return done;
  }

  private onTap() {
    if (this.waitingForTap) {
      this.waitingForTap();
      return;
    }
    if (this.acceptEarlyTap && !this.tapQueued) {
      this.tapQueued = true;
      this.hurry = true;
      gsap.to(this.tapHint, { alpha: 0.4, duration: 0.15 });
    }
  }

  /** A beat of the sequence; much shorter once the player has tapped to skip ahead. */
  private pause(seconds: number) {
    return wait(this.hurry ? seconds * 0.25 : seconds);
  }

  private get chestCenter() {
    const chest = this.chest;
    return chest ? chest.toGlobal({ x: 0, y: -110 }) : { x: this.w / 2, y: this.h / 2 };
  }

  private async playChest(finalTier: TierId) {
    const chest = this.chest;
    if (!chest) return;
    const scale = this.chestScale;
    this.detail.alpha = 0;
    gsap.to(this.detail, { alpha: 1, duration: 0.4, delay: 0.5 });
    void this.popText(this.eyebrow);
    void this.setHeading(TIERS[0].name, TIERS[0].title);

    // 1. Ready: falls from above, through the title, and lands with a squash.
    chest.y = -this.floor - 240 * scale;
    await gsap.to(chest, { y: 0, duration: 0.42, ease: 'power2.in' });
    if (this.destroyed) return;
    sfx.land();
    this.ringPulse();
    void chest.land();
    const ground = chest.toGlobal({ x: 0, y: -10 });
    this.fx.ring(ground.x, ground.y, { from: 60 * scale, to: 220 * scale, width: 3, duration: 0.5, alpha: 0.7 });
    // "Tap to open" shows from the start; a tap during the upgrades hurries them along.
    this.tapHint.alpha = 0;
    gsap.to(this.tapHint, { alpha: 1, duration: 0.3 });
    this.hintTween = gsap.to(this.tapHint.scale, { x: this.tapHintScale * 1.08, y: this.tapHintScale * 1.08, duration: 0.55, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    this.acceptEarlyTap = true;
    this.twinkling = true;
    this.cursor = 'pointer';
    chest.startIdle(false);
    await this.pause(SHOW.beat);
    if (this.destroyed) return;

    // 2. Upgrade one tier at a time: leap, spin in the air, flash at the top, slam down.
    for (let tier = 1; tier <= finalTier; tier += 1) {
      chest.stopIdle();
      sfx.jump();
      gsap.delayedCall(0.3, () => void (this.destroyed || sfx.spin()));
      await chest.hop(90);
      if (this.destroyed) return;
      this.upgradeFlash(tier as TierId);
      await chest.drop();
      if (this.destroyed) return;
      sfx.land();
      chest.startIdle(false);
      await this.pause(SHOW.beat);
      if (this.destroyed) return;
    }

    if (!this.tapQueued) {
      chest.startIdle(true);
      await new Promise<void>((resolve) => {
        this.waitingForTap = resolve;
      });
      this.waitingForTap = null;
    }
    if (this.destroyed) return;
    // From here on taps are ignored until the collect button shows.
    this.acceptEarlyTap = false;
    this.twinkling = false;
    this.cursor = 'default';
    chest.stopIdle();
    this.stopHint();

    // 3. Charge: a rattle that grows violent, sparks sucked in, light leaking out, rising pitch.
    const strength = SHOW.strength[finalTier];
    const glow = TIERS[finalTier].glow;
    sfx.charge(SHOW.charge);
    const center = this.chestCenter;
    const suction = window.setInterval(() => {
      if (!this.destroyed) this.fx.suck(center.x, center.y, 230 * scale, 3, glow);
    }, 60);
    await chest.charge(SHOW.charge, reduceMotion);
    window.clearInterval(suction);
    if (this.destroyed) return;

    // 4. Burst: bloom from the chest, shake and push, layered shock waves, streaks, sparks and loot.
    this.burst(finalTier, strength);
    const opening = chest.open();
    this.eyebrow.text = '你获得了';
    void this.popText(this.eyebrow);
    await opening;
    if (this.destroyed) return;
    await wait(0.2);
    if (this.destroyed) return;
    // 5. Reveal and settle.
    await this.showRewards(chest.toGlobal(chest.mouth));
    if (this.destroyed) return;
    this.showCollect();
  }

  private hintTween: gsap.core.Tween | null = null;

  /** Stop the "tap" hint's pulse and put it back to rest before fading it out. */
  private stopHint() {
    this.hintTween?.kill();
    this.hintTween = null;
    gsap.killTweensOf(this.tapHint.scale);
    this.tapHint.scale.set(this.tapHintScale);
    gsap.to(this.tapHint, { alpha: 0, duration: 0.2 });
  }

  /** The instant the chest bursts open; everything scales with the tier. */
  private burst(tier: TierId, strength: number) {
    const scale = this.chestScale;
    const center = this.chestCenter;
    const mouth = this.chest ? this.chest.toGlobal(this.chest.mouth) : center;
    const glow = TIERS[tier].glow;
    const far = Math.hypot(this.w, this.h) * 0.7;
    sfx.open(strength);
    gsap.delayedCall(0.35, () => void (this.destroyed || sfx.fanfare(tier)));
    // Only a bundled clip, and only on the beat: robotic speech over the fanfare sounds broken.
    say(`chest${tier}`, { delay: 0.75, fallback: false, maxLate: 0.4 });

    this.fx.flash(center.x, center.y, Math.max(this.w, this.h) * (0.6 + 0.4 * strength), { tint: 0xfff4d6, peak: SHOW.bloom * strength });
    this.flashBurst(glow, 0.6 + 0.6 * strength);
    this.camera(strength);
    const waves = 1 + tier;
    for (let index = 0; index < waves; index += 1) {
      this.fx.shockwave(center.x, center.y, { from: 70 * scale, to: far * (0.55 + 0.45 * strength), color: glow, duration: 0.9 + index * 0.1, delay: index * 0.12, strength: 0.7 + 0.3 * strength });
    }
    this.fx.streaks(center.x, center.y, 200 * scale, 10 + tier * 8, [0xffffff, glow]);
    this.fx.sparks(center.x, center.y, 14 + tier * 10, 700 * scale, [0xffffff, glow]);
    this.backdrop.setRays({ alpha: 0.55 + 0.35 * strength, scale: this.backdrop.rays.scale.x * (1.1 + 0.2 * strength) }, 0.6);
    gsap.delayedCall(0.1, () => {
      if (this.destroyed) return;
      this.fx.loot(mouth.x, mouth.y, 10 + tier * 8, Math.min(1000, this.h * 1.2) * (0.75 + 0.25 * strength));
      // Confetti once, at the climax only: the legendary chest.
      if (tier === 3) this.confetti.burst(mouth.x, mouth.y, reduceMotion ? 30 : 60, Math.min(1000, this.h * 1.2));
    });
  }

  /** Screen shake plus a quick push toward the chest, then back. Skipped under reduced motion. */
  private camera(strength: number) {
    if (reduceMotion) return;
    const world = this.world;
    const home = { x: this.w / 2, y: this.h / 2 };
    gsap.killTweensOf(world.position);
    gsap.killTweensOf(world.scale);
    const shake = gsap.timeline({ onComplete: () => void world.position.set(this.w / 2, this.h / 2) });
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      const k = SHOW.shake * strength * (1 - i / steps) ** 1.5;
      shake.to(world.position, { x: home.x + (Math.random() - 0.5) * 2 * k, y: home.y + (Math.random() - 0.5) * 2 * k, duration: 0.035, ease: 'none' });
    }
    const push = 1 + SHOW.push * strength;
    gsap.timeline({ onComplete: () => void world.scale.set(1) })
      .to(world.scale, { x: push, y: push, duration: 0.12, ease: 'power3.out' })
      .to(world.scale, { x: 1, y: 1, duration: 0.7, ease: 'elastic.out(1, 0.5)' });
  }

  /** The instant of an upgrade. */
  private upgradeFlash(tier: TierId) {
    const chest = this.chest;
    if (!chest) return;
    const scale = this.chestScale;
    const colors = TIERS[tier];
    const center = this.chestCenter;
    void chest.flashWhite();
    sfx.upgrade(tier);
    // Only with a real clip: synthesised speech for a one-word cheer sounds robotic.
    say('upgrade', { delay: 0.1, fallback: false, maxLate: 0.3 });
    this.fx.shockwave(center.x, center.y, { from: 50 * scale, to: 300 * scale, color: colors.glow, duration: 0.6, strength: 0.8 });
    this.fx.sparks(center.x, center.y, 8 + tier * 4, 420 * scale, [0xffffff, colors.glow]);
    this.flashBurst(colors.glow);
    chest.setTier(tier);
    chest.setGlow(colors.glow);
    this.backdrop.setTexture(`backdrop-tier-${tier}`, 0.08);
    this.backdrop.setRays({ tint: colors.glow });
    this.ring.tint = colors.glow;
    this.eyebrow.text = '升级！';
    void this.popText(this.eyebrow);
    void this.setHeading(colors.name, colors.title);
    this.sparkleBurst(10 + tier * 6, scale);
  }

  private async playBadge() {
    const badge = this.badge;
    if (!badge) return;
    this.eyebrow.text = this.settlement.kind === 'draw' ? '势均力敌' : '再接再厉';
    void this.popText(this.eyebrow);
    void this.setHeading(this.settlement.headline, 0xffffff);
    badge.y = -this.h;
    badge.rotation = -0.3;
    await gsap.to(badge, { y: 0, rotation: 0, duration: 0.6, ease: 'bounce.out' });
    if (this.destroyed) return;
    sfx.land();
    this.ringPulse();
    // A few settling sways, then still: nothing keeps wobbling on the finished screen.
    gsap.timeline()
      .to(badge, { rotation: 0.05, duration: 0.5, ease: 'sine.inOut' })
      .to(badge, { rotation: -0.03, duration: 0.6, ease: 'sine.inOut' })
      .to(badge, { rotation: 0, duration: 0.7, ease: 'sine.out' });
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

  /** Coloured glow and ring behind the chest; `strength` > 1 for the burst. */
  private flashBurst(tint: number, strength = 1) {
    this.flash.tint = tint;
    gsap.fromTo(this.flash, { alpha: 0.8 }, { alpha: 0, duration: 0.6 * Math.max(1, strength), ease: 'power2.out' });
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
      // The crown is the special prize: rainbow frame and a NEW! tag, as in the reference.
      const special = key === 'crowns';
      const bg = new NineSliceSprite({ texture: tex(special ? 'reward-card-rare' : 'reward-card'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
      bg.width = cardWidth;
      bg.height = 150;
      bg.position.set(-cardWidth / 2, -75);
      const icon = new Sprite(tex(meta.icon));
      icon.anchor.set(0.5);
      icon.width = icon.height = 64;
      icon.y = -32;
      const amount = label(`+${this.settlement.rewards[key].toLocaleString('en-US')}`, 'number', { fontSize: 30, fill: 0xffffff });
      amount.y = 20;
      const name = label(meta.name, 'small', { fontSize: 14, fill: 0x7a3500, fontWeight: '700' });
      name.y = 48;
      card.addChild(bg, icon, amount, name);
      if (special) {
        const tagBg = new Graphics().roundRect(-26, -13, 52, 26, 11).fill(0xff4f8b).stroke({ color: 0x2a1638, width: 3 });
        const tagText = label('NEW!', 'number', { fontSize: 14, fill: 0xffffff });
        const tag = new Container();
        tag.addChild(tagBg, tagText);
        tag.position.set(cardWidth / 2 - 22, -75);
        tag.rotation = 0.12;
        card.addChild(tag);
      }
      card.position.set(origin.x, origin.y);
      card.scale.set(0.4);
      card.alpha = 0;
      card.label = key;
      this.cardsLayer.addChild(card);
      const tx = -total / 2 + cardWidth / 2 + index * (cardWidth + gap);
      const value = this.settlement.rewards[key];
      amount.text = '+0';
      // The number appears when the card lands, so nothing reads "+0" mid-flight.
      amount.alpha = 0;
      sfx.pop();
      // Flies out of the chest on an arc, lands with an overshoot and a wobble, then counts up.
      const tl = gsap.timeline();
      const control = { x: origin.x + (tx - origin.x) * 0.5 + (index - (entries.length - 1) / 2) * 60, y: Math.min(origin.y, 0) - 260 };
      tl.to(card, { alpha: 1, duration: 0.08 });
      tl.add(arcTo(card, control, { x: tx, y: 0 }, { duration: 0.55, ease: 'power1.inOut' }), 0);
      tl.to(card.scale, { x: 1.05, y: 1.05, duration: 0.55, ease: 'power2.out' }, 0);
      tl.fromTo(card, { rotation: (index - 1) * 0.5 - 0.3 }, { rotation: 0.14 * (index % 2 ? 1 : -1), duration: 0.55, ease: 'power1.inOut' }, 0);
      tl.to(card.scale, { x: 1.16, y: 0.84, duration: 0.07, ease: 'power2.out' });
      tl.to(card.scale, { x: 1, y: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
      tl.to(card, { rotation: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.35)' }, '<');
      tl.add(() => {
        if (this.destroyed) return;
        sfx.coin();
        gsap.fromTo(amount, { alpha: 0 }, { alpha: 1, duration: 0.1 });
        gsap.fromTo(amount.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.35, ease: 'back.out(3)' });
        const counter = { v: 0 };
        let lastTick = 0;
        let step = 0;
        gsap.to(counter, {
          v: value,
          duration: Math.min(0.8, 0.3 + value / 2000),
          ease: 'power1.out',
          onUpdate: () => {
            if (amount.destroyed) return;
            amount.text = `+${Math.round(counter.v).toLocaleString('en-US')}`;
            const now = performance.now();
            if (now - lastTick > 55 && Math.round(counter.v) < value) {
              lastTick = now;
              sfx.tick(step++);
            }
          },
        });
        if (special) {
          const at = card.toGlobal({ x: 0, y: 0 });
          this.fx.shockwave(at.x, at.y, { from: 60 * this.cardsLayer.scale.x, to: 140 * this.cardsLayer.scale.x, color: 0xfff3a0, duration: 0.6, strength: 0.8 });
          const tag = card.children.at(-1);
          if (tag) gsap.fromTo(tag.scale, { x: 0, y: 0 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
        }
      }, 0.62);
      await wait(this.hurry ? 0.3 : 0.42);
      if (this.destroyed) return;
    }
    await wait(0.9);
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
      const start = card.toGlobal({ x: 0, y: -32 });
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
            // Then curves up and over into its HUD counter.
            .add(arcTo(icon, { x: scatter.x + (target.x - scatter.x) * 0.3, y: Math.min(scatter.y, target.y) - 120 }, target, { duration: 0.55, ease: 'power2.in' }), '+=0.08')
            .to(icon, { rotation: 0, duration: 0.55 }, '<')
            .to(icon.scale, { x: base * 0.6, y: base * 0.6, duration: 0.55, ease: 'power2.in' }, '<')
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
    this.announceLadder();
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
          void navigation.goTo(new GameScreen({ mode: 'online', link: context.link, myStone, round: message.round, rule: message.rule }));
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
    // The rule was agreed when the room opened and stays for every round.
    context.link.send({ type: 'start', hostStone, round, rule: context.rule });
    void navigation.goTo(new GameScreen({ mode: 'online', link: context.link, myStone: hostStone, round, rule: context.rule }));
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
    this.fx.update(ticker);
    this.chest?.tick(this.time);
    if (this.twinkling && this.chest) {
      this.twinkleClock += ticker.deltaMS / 1000;
      while (this.twinkleClock > 0.12) {
        this.twinkleClock -= 0.12;
        const c = this.chestCenter;
        this.fx.twinkle(c.x, c.y, 240 * this.chestScale);
      }
    }
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

import { Assets, Container, Graphics, NineSliceSprite, Sprite, type Text, type Texture, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { tex } from '../app/textures';
import emptyBoardUrl from '../assets/leaderboard-empty.png';
import { account, type ApiError, type Board, BoardFeed, type BoardEntry } from '../net/account';
import { INK } from '../svg/palette';
import { openRename, openSignIn } from './authDialog';
import { Button } from './Button';
import { label } from './Label';

const ROW_H = 44;
const HEADER_H = 64;
const FOOTER_H = 78;
const MEDALS = [0xffd23f, 0xd9e2f0, 0xe89a5a];

/**
 * The live leaderboard panel on the home screen. Polls the board while it is
 * visible (see BoardFeed) and shows the signed-in player's own rank.
 */
export class LeaderboardView extends Container {
  private bg = new NineSliceSprite({ texture: tex('tile-dark'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
  private title: Text;
  private crown = new Sprite(tex('crown'));
  private live = new Graphics();
  private liveText: Text;
  private rows = new Container();
  private footer = new Container();
  private status: Text;
  private emptyArt = new Sprite(tex('logo'));
  private emptyTitle: Text;
  private feed: BoardFeed;
  private board: Board | null = null;
  private error: ApiError | null = null;
  private w = 560;
  private h = 420;
  private time = 0;
  private unsubscribe: () => void;
  private lastPoints = new Map<string, number>();
  private meRank: { rank: number | null; points: number; played: boolean } | null = null;
  private active = false;
  private signInOpen = false;
  private userId: string | null = null;
  private meRequest = 0;

  constructor() {
    super();
    this.title = label('排行榜', 'heading', { fontSize: 28, fill: 0xffd84a });
    this.title.anchor.set(0, 0.5);
    this.crown.anchor.set(0.5);
    this.crown.width = this.crown.height = 46;
    this.live.circle(0, 0, 6).fill(0x5cf08a);
    this.liveText = label('实时', 'small', { fontSize: 13, fill: 0x9ff5b8, fontWeight: '700' });
    this.liveText.anchor.set(0, 0.5);
    this.status = label('加载中…', 'body', { fontSize: 16, fill: 0xd9ccff });
    this.emptyTitle = label('榜首，虚位以待', 'heading', { fontSize: 25, fill: 0xffe98a });
    this.emptyArt.anchor.set(0.5);
    this.emptyArt.eventMode = 'none';
    this.addChild(this.bg, this.crown, this.title, this.live, this.liveText, this.rows, this.emptyArt, this.emptyTitle, this.status, this.footer);
    // Optional illustration: a failed image request must never block playing.
    void Assets.load<Texture>(emptyBoardUrl).then((texture) => {
      if (this.destroyed) return;
      this.emptyArt.texture = texture;
      this.render();
    }).catch(() => undefined);
    this.feed = new BoardFeed(
      (board) => this.onBoard(board),
      (error) => {
        this.error = error;
        this.render();
      },
    );
    this.unsubscribe = account.onChange(() => {
      const nextId = account.user?.id ?? null;
      if (nextId !== this.userId) {
        this.feed.stop();
        this.feed.reset();
        this.board = null;
        this.meRank = null;
        this.lastPoints.clear();
        this.userId = nextId;
      }
      if (this.active && account.user) this.feed.start();
      else this.feed.stop();
      void this.loadMe();
      this.render();
    });
  }

  /** Start live updates (the tab became visible). */
  async activate() {
    this.active = true;
    if (!account.known || !account.available) await account.refresh();
    if (!this.active || this.destroyed) return;
    if (!account.user) {
      this.render();
      await this.signIn();
      return;
    }
    this.feed.start();
    void this.loadMe();
    this.render();
  }

  deactivate() {
    this.active = false;
    this.feed.stop();
  }

  private async signIn() {
    if (this.signInOpen) return;
    this.signInOpen = true;
    try { await openSignIn('登录后查看排行榜，并合并这台设备上尚未上传的成绩。游戏无需登录。'); }
    finally { this.signInOpen = false; }
  }

  private async loadMe() {
    const request = ++this.meRequest;
    const userId = account.user?.id;
    if (!account.user) {
      this.meRank = null;
      return;
    }
    try {
      const me = await account.me();
      if (request !== this.meRequest || account.user?.id !== userId) return;
      this.meRank = { rank: me.rank, points: me.player?.points ?? 0, played: Boolean(me.player) };
    } catch {
      if (request !== this.meRequest || account.user?.id !== userId) return;
      this.meRank = null;
    }
    if (!this.destroyed) this.renderFooter();
  }

  private onBoard(board: Board) {
    const first = this.board === null;
    this.board = board;
    this.error = null;
    this.render(first ? null : new Set(board.entries.filter((e) => this.lastPoints.get(e.userId) !== e.points).map((e) => e.userId)));
    this.lastPoints = new Map(board.entries.map((e) => [e.userId, e.points]));
    if (account.user && board.entries.some((e) => e.userId === account.user?.id)) void this.loadMe();
  }

  layout(width: number, height: number) {
    this.w = Math.max(300, width);
    this.h = Math.max(HEADER_H + FOOTER_H + ROW_H * 3, height);
    this.bg.width = this.w;
    this.bg.height = this.h;
    this.bg.position.set(-this.w / 2, -this.h / 2);
    this.crown.position.set(-this.w / 2 + 40, -this.h / 2 + 34);
    this.title.position.set(-this.w / 2 + 70, -this.h / 2 + 36);
    this.live.position.set(this.w / 2 - 70, -this.h / 2 + 36);
    this.liveText.position.set(this.w / 2 - 58, -this.h / 2 + 36);
    this.rows.position.set(-this.w / 2 + 16, -this.h / 2 + HEADER_H);
    this.status.position.set(0, -this.h / 2 + HEADER_H + 60);
    this.footer.position.set(0, this.h / 2 - this.footerHeight / 2 - 6);
    this.render();
  }

  private get visibleRows() {
    return Math.max(3, Math.min(10, Math.floor((this.h - HEADER_H - this.footerHeight) / ROW_H)));
  }

  private get footerHeight() { return this.w < 440 && account.user ? 110 : FOOTER_H; }

  private render(changed: Set<string> | null = null) {
    if (this.destroyed) return;
    for (const child of this.rows.removeChildren()) {
      gsap.killTweensOf(child);
      gsap.killTweensOf(child.scale);
      child.destroy({ children: true });
    }
    const entries = account.user ? this.board?.entries ?? [] : [];
    if (!account.user) this.status.text = '登录查看排行\n本机成绩会同步到你的账号';
    else if (this.error && !this.board) this.status.text = this.error.message;
    else if (!this.board) this.status.text = '加载中…';
    else if (!entries.length) this.status.text = '赢一局人机或在线对战\n来留下你的名字吧';
    else this.status.text = '';
    this.status.style.wordWrap = true;
    this.status.style.wordWrapWidth = this.w - 60;
    this.status.style.align = 'center';
    this.status.style.lineHeight = 25;
    const showArt = !entries.length && (!account.user || Boolean(this.board)) && !this.error;
    this.emptyArt.visible = this.emptyTitle.visible = showArt;
    this.emptyTitle.text = account.user ? '榜首，虚位以待' : '每一局，都算数';
    const top = -this.h / 2 + HEADER_H;
    const space = this.h - HEADER_H - this.footerHeight;
    const size = Math.max(60, Math.min(250, this.w - 80, space - 100));
    this.emptyArt.width = size;
    this.emptyArt.height = size * this.emptyArt.texture.height / this.emptyArt.texture.width;
    const center = top + space / 2;
    this.emptyArt.position.set(0, center - 43);
    this.emptyTitle.position.set(0, center + size / 2 - 24);
    this.status.position.set(0, showArt ? center + size / 2 + 20 : center);

    const me = account.user?.id;
    const count = this.visibleRows;
    let shown = entries.slice(0, count).map((entry, index) => ({ entry, rank: index + 1 }));
    const myIndex = me ? entries.findIndex((e) => e.userId === me) : -1;
    // Always show the player's own row, replacing the last visible one if needed.
    if (myIndex >= count) shown = [...shown.slice(0, count - 1), { entry: entries[myIndex], rank: myIndex + 1 }];
    shown.forEach(({ entry, rank }, index) => {
      const row = this.makeRow(entry, rank, entry.userId === me);
      row.y = index * ROW_H;
      this.rows.addChild(row);
      if (changed?.has(entry.userId)) {
        gsap.fromTo(row, { alpha: 0.2 }, { alpha: 1, duration: 0.5 });
        gsap.fromTo(row.scale, { x: 1.03, y: 1.03 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(3)' });
      }
    });
    this.renderFooter();
  }

  private makeRow(entry: BoardEntry, rank: number, mine: boolean) {
    const width = this.w - 32;
    const row = new Container();
    const bg = new Graphics()
      .roundRect(0, 2, width, ROW_H - 6, 14)
      .fill({ color: mine ? 0xffd84a : 0xffffff, alpha: mine ? 0.22 : rank % 2 ? 0.06 : 0.02 });
    if (mine) bg.roundRect(0, 2, width, ROW_H - 6, 14).stroke({ color: 0xffd84a, width: 2, alpha: 0.8 });
    const medal = new Graphics().circle(0, 0, 15).fill(rank <= 3 ? MEDALS[rank - 1] : 0x2a1a4f).stroke({ color: INK, width: 3 });
    medal.position.set(24, ROW_H / 2 - 1);
    const rankText = label(String(rank), 'number', { fontSize: rank > 99 ? 12 : 16, fill: rank <= 3 ? INK : 0xffffff, stroke: rank <= 3 ? { color: 0xffffff, width: 0 } : { color: INK, width: 3 } });
    rankText.position.copyFrom(medal.position);
    const name = label(entry.name + (mine ? '（我）' : ''), 'button', { fontSize: 18, stroke: { color: INK, width: 4, join: 'round' } });
    name.anchor.set(0, 0.5);
    name.position.set(50, ROW_H / 2 - 1);
    const maxName = width - 230;
    if (name.width > maxName) name.scale.set(maxName / name.width);
    const record = label(`${entry.wins} 胜 ${entry.losses} 负`, 'small', { fontSize: 12, fill: 0xc9bde8 });
    record.anchor.set(1, 0.5);
    record.position.set(width - 104, ROW_H / 2 - 1);
    const points = label(entry.points.toLocaleString('en-US'), 'number', { fontSize: 22, fill: 0xffd84a });
    points.anchor.set(1, 0.5);
    points.position.set(width - 36, ROW_H / 2 - 1);
    const unit = label('分', 'small', { fontSize: 12, fill: 0xffe98a, fontWeight: '700' });
    unit.anchor.set(1, 0.5);
    unit.position.set(width - 16, ROW_H / 2);
    row.addChild(bg, medal, rankText, name, record, points, unit);
    return row;
  }

  private renderFooter() {
    if (this.destroyed) return;
    this.footer.removeChildren().forEach((child) => child.destroy({ children: true }));
    if (!account.available && account.known && account.user) {
      this.footer.addChild(label('排行榜服务未连接', 'small', { fontSize: 14 }));
      return;
    }
    const user = account.user;
    this.footer.y = this.h / 2 - this.footerHeight / 2 - 6;
    if (!user) {
      const button = new Button({ text: '登录查看排行', skin: 'yellow', width: 230, height: 62, fontSize: 22, onPress: () => void this.signIn() });
      this.footer.addChild(button);
      return;
    }
    const mine = this.meRank;
    const text = account.pendingGames ? `${account.pendingGames} 局成绩待同步` : !mine || !mine.played
      ? `${user.name} · 还没有成绩`
      : mine.rank
        ? `我：第 ${mine.rank} 名 · ${mine.points.toLocaleString('en-US')} 分`
        : `我：${mine.points.toLocaleString('en-US')} 分 · 未进前 50`;
    const summary = label(text, 'heading', { fontSize: 18, fill: 0xffffff });
    summary.anchor.set(0, 0.5);
    const rename = new Button({ text: '改名', skin: 'white', width: 84, height: 48, fontSize: 17, onPress: () => void openRename(user.name) });
    const out = new Button({ text: '退出', skin: 'dark', width: 84, height: 48, fontSize: 17, onPress: () => void account.signOut().catch((error: ApiError) => { this.error = error; this.render(); }) });
    const left = -this.w / 2 + 24;
    summary.position.set(left, 0);
    const compact = this.w < 440;
    const room = this.w - 48 - (compact ? 0 : 190);
    if (summary.width > room) summary.scale.set(room / summary.width);
    rename.position.set(this.w / 2 - 24 - 84 - 8 - 42, 0);
    out.position.set(this.w / 2 - 24 - 42, 0);
    if (compact) {
      summary.anchor.set(0.5);
      summary.position.set(0, -28);
      rename.position.set(-49, 20);
      out.position.set(49, 20);
    }
    this.footer.addChild(summary, rename, out);
  }

  update(ticker: Ticker) {
    this.time += ticker.deltaMS / 1000;
    const on = Boolean(account.user) && !this.error;
    this.live.alpha = on ? 0.55 + 0.45 * Math.sin(this.time * 4) : 0.25;
    this.liveText.text = !account.user ? '未登录' : on ? '实时' : '离线';
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    this.feed.stop();
    this.unsubscribe();
    super.destroy(options);
  }
}

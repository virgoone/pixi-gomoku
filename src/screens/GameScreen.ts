import { Container, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { say } from '../app/voice';
import type { VoiceLineId } from '../app/voiceLines';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { AiPlayer, type BrainId, brainInfo } from '../gomoku/ai';
import { BLACK, GomokuGame, opponent, type Point, type Stone, WHITE } from '../gomoku/rules';
import type { NetMessage, OnlineLink } from '../net/online';
import { ConfirmPopup } from '../popups/ConfirmPopup';
import { PausePopup } from '../popups/PausePopup';
import type { Outcome } from '../result/scoring';
import type { AvatarId } from '../svg/art';
import { Backdrop } from '../ui/Backdrop';
import { BoardView } from '../ui/BoardView';
import { Button, IconButton } from '../ui/Button';
import { label } from '../ui/Label';
import { PlayerCard } from '../ui/PlayerCard';
import { TabBar } from '../ui/TabBar';
import { toast } from '../ui/Toast';
import { HomeScreen } from './HomeScreen';
import { ResultScreen } from './ResultScreen';

export type GameConfig =
  | { mode: 'ai'; brain: BrainId; humanStone: Stone }
  | { mode: 'local' }
  | { mode: 'online'; link: OnlineLink; myStone: Stone; round: number };

type Seat = 'human' | 'ai' | 'remote';

const stoneName = (stone: Stone) => (stone === BLACK ? '黑棋' : '白棋');

export class GameScreen extends Container {
  private backdrop = new Backdrop('backdrop-game', { raysTint: 0xb9a0ff, sparkles: 12 });
  private boardGlow = new Sprite(tex('glow'));
  private modeBar: TabBar;
  private board = new BoardView();
  private game = new GomokuGame();
  private cards = new Map<Stone, PlayerCard>();
  private status: Text;
  private menu: IconButton;
  private undoButton: Button;
  private resignButton: Button;
  private ai: AiPlayer | null = null;
  private aiThinking = false;
  /** Bumped whenever pending async work (AI thinking) must be ignored. */
  private token = 0;
  private unsubscribers: Array<() => void> = [];
  private ended = false;
  /** The opponent walked out, so leaving now costs the player nothing. */
  private opponentGone = false;
  private w = 0;
  private h = 0;

  constructor(private config: GameConfig) {
    super();
    this.status = label('', 'heading', { fontSize: 24 });
    this.menu = new IconButton({ icon: 'menu', size: 56, onPress: () => this.openMenu() });
    this.undoButton = new Button({ text: '悔棋', skin: 'white', width: 170, height: 70, icon: 'undo', fontSize: 24, onPress: () => this.undo() });
    this.resignButton = new Button({ text: '认输', skin: 'red', width: 170, height: 70, icon: 'flag', fontSize: 24, onPress: () => this.askResign() });
    this.undoButton.visible = config.mode !== 'online';
    this.backdrop.rays.alpha = 0.16;
    this.boardGlow.anchor.set(0.5);
    this.boardGlow.tint = 0xffc27a;
    this.boardGlow.alpha = 0.35;
    this.boardGlow.blendMode = 'add';
    this.modeBar = new TabBar([{ id: 'mode', text: this.modeText(), icon: this.modeIcon() }], 'mode');

    this.board.onCell = (point) => this.onLocalMove(point);
    this.addChild(this.backdrop, this.boardGlow, this.board, this.status, this.undoButton, this.resignButton, this.modeBar, this.menu);
    this.setupPlayers();
    if (config.mode === 'ai') this.ai = new AiPlayer(config.brain);
    if (config.mode === 'online') this.listenOnline(config.link);
  }

  /** Text for the top-left mode chip. */
  private modeText() {
    const config = this.config;
    if (config.mode === 'local') return '同屏双人';
    if (config.mode === 'ai') return `人机 · ${brainInfo(config.brain).name}`;
    return `在线 · 房间 ${config.link.code}`;
  }

  private modeIcon() {
    return this.config.mode === 'local' ? 'users' : this.config.mode === 'ai' ? 'robot' : 'globe';
  }

  // ---- players ------------------------------------------------------------------------

  private seatOf(stone: Stone): Seat {
    const config = this.config;
    if (config.mode === 'local') return 'human';
    if (config.mode === 'ai') return stone === config.humanStone ? 'human' : 'ai';
    return stone === config.myStone ? 'human' : 'remote';
  }

  private describe(stone: Stone): { name: string; avatar: AvatarId; subtitle: string } {
    const config = this.config;
    if (config.mode === 'local') return { name: stone === BLACK ? '黑方' : '白方', avatar: stone === BLACK ? 'you' : 'friend', subtitle: stoneName(stone) };
    if (config.mode === 'ai') {
      if (stone === config.humanStone) return { name: '你', avatar: 'you', subtitle: stoneName(stone) };
      const info = brainInfo(config.brain);
      return { name: info.name, avatar: info.id, subtitle: `${info.title} · ${stoneName(stone)}` };
    }
    if (stone === config.myStone) return { name: '你', avatar: 'you', subtitle: stoneName(stone) };
    return { name: config.link.opponentName, avatar: 'friend', subtitle: `好友 · ${stoneName(stone)}` };
  }

  private setupPlayers() {
    for (const card of this.cards.values()) card.destroy({ children: true });
    this.cards.clear();
    for (const stone of [BLACK, WHITE] as Stone[]) {
      const card = new PlayerCard({ ...this.describe(stone), stone, alignRight: stone === WHITE });
      this.cards.set(stone, card);
      this.addChild(card);
    }
    if (this.w) this.resize(this.w, this.h);
  }

  // ---- flow ---------------------------------------------------------------------------

  async show() {
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.3 });
    await gsap.from(this.board.scale, { x: 0.85, y: 0.85, duration: 0.4, ease: 'back.out(1.8)' });
    this.nextTurn();
  }

  async hide() {
    await gsap.to(this, { alpha: 0, duration: 0.2 });
  }

  private nextTurn() {
    if (this.ended) return;
    const turn = this.game.turn;
    const seat = this.seatOf(turn);
    this.board.turnStone = turn;
    this.board.acceptingInput = seat === 'human';
    for (const [stone, card] of this.cards) card.setActive(stone === turn, stone === turn && seat === 'ai');
    for (const [stone, card] of this.cards) if (!(stone === turn && seat === 'ai')) card.setStatus(this.describe(stone).subtitle);

    if (this.config.mode === 'local') this.status.text = `轮到${stoneName(turn)}`;
    else if (seat === 'human') this.status.text = `轮到你了 · ${stoneName(turn)}`;
    else if (seat === 'ai') this.status.text = `${this.describe(turn).name}正在思考`;
    else this.status.text = `等待${this.describe(turn).name}落子`;

    gsap.fromTo(this.status, { alpha: 0.3 }, { alpha: 1, duration: 0.3 });
    this.undoButton.setEnabled(this.canUndo());
    this.resignButton.setEnabled(!this.ended && (this.config.mode === 'local' || this.game.history.length > 0));
    if (seat === 'ai') void this.aiTurn();
  }

  private async aiTurn() {
    if (!this.ai) return;
    const token = ++this.token;
    this.aiThinking = true;
    this.undoButton.setEnabled(false);
    const move = await this.ai.think(this.game.board, this.game.turn, this.game.history.length < 2 ? 500 : 380);
    if (token !== this.token || this.destroyed) return;
    this.aiThinking = false;
    this.apply(move);
  }

  private onLocalMove(point: Point) {
    if (this.ended || this.seatOf(this.game.turn) !== 'human') return;
    const index = this.game.history.length;
    if (this.apply(point) && this.config.mode === 'online') this.config.link.send({ type: 'move', x: point.x, y: point.y, index });
  }

  /** Play a move on the model and the view. Returns false if it was rejected. */
  private apply(point: Point) {
    const stone = this.game.turn;
    const result = this.game.play(point.x, point.y);
    if (result.kind === 'invalid') {
      sfx.invalid();
      return false;
    }
    this.board.placeStone(point.x, point.y, stone);
    sfx.stone();
    if (result.kind === 'win') this.finish('five', result.line);
    else if (result.kind === 'draw') this.finish('draw');
    else this.nextTurn();
    return true;
  }

  private canUndo() {
    if (this.config.mode === 'online' || this.ended || this.aiThinking) return false;
    if (this.config.mode === 'ai') return this.game.movesBy(this.config.humanStone) > 0;
    return this.game.history.length > 0;
  }

  private undo() {
    if (!this.canUndo()) return;
    this.token += 1;
    let count = 1;
    if (this.config.mode === 'ai') {
      // Take back the AI reply together with our own move.
      count = this.game.lastMove?.stone === this.config.humanStone ? 1 : 2;
    }
    for (const move of this.game.undo(count)) this.board.removeStone(move.x, move.y);
    const last = this.game.lastMove;
    this.board.setLastMove(last ? { x: last.x, y: last.y } : null);
    this.nextTurn();
  }

  private askResign() {
    if (this.ended) return;
    const config = this.config;
    const who = config.mode === 'local' ? `${stoneName(this.game.turn)}认输？` : '确定要认输吗？';
    void navigation.present(
      new ConfirmPopup({
        title: '认输',
        message: config.mode === 'local' ? `${who}\n对方将直接获胜。` : `${who}\n对手将直接获胜，连胜也会中断。`,
        confirm: '认输',
        danger: true,
        onConfirm: () => {
          if (this.ended) return;
          const loser = config.mode === 'local' ? this.game.turn : config.mode === 'ai' ? config.humanStone : config.myStone;
          if (config.mode === 'online') config.link.send({ type: 'resign' });
          this.resignAs(loser);
        },
      }),
    );
  }

  private resignAs(loser: Stone) {
    this.game.over = true;
    this.game.winner = opponent(loser);
    this.finish('resign');
  }

  private finish(reason: Outcome['reason'], line?: Point[]) {
    if (this.ended) return;
    this.ended = true;
    this.token += 1;
    this.board.acceptingInput = false;
    this.board.hideGhost();
    for (const card of this.cards.values()) card.setActive(false);
    this.undoButton.setEnabled(false);
    this.resignButton.setEnabled(false);

    const winner = this.game.winner;
    const config = this.config;
    const myStone = config.mode === 'ai' ? config.humanStone : config.mode === 'online' ? config.myStone : null;
    if (line) this.board.showWin(line);
    if (winner === null) this.status.text = '平局';
    else if (myStone === null) this.status.text = `${stoneName(winner)}获胜！`;
    else this.status.text = winner === myStone ? '你赢了！' : reason === 'resign' ? '你认输了' : '对手连成五子';
    if (winner !== null && (myStone === null || winner === myStone)) sfx.win();
    else sfx.lose();
    say(this.announcement(winner, myStone, reason), { delay: 0.35 });

    const outcome: Outcome = {
      mode: config.mode,
      winner,
      myStone,
      totalMoves: this.game.history.length,
      winnerMoves: winner ? this.game.movesBy(winner) : 0,
      reason,
      brain: config.mode === 'ai' ? config.brain : undefined,
      opponentName: config.mode === 'online' ? config.link.opponentName : undefined,
    };
    const delay = line ? 1800 : 900;
    window.setTimeout(() => {
      if (this.destroyed) return;
      void navigation.goTo(new ResultScreen(outcome, config.mode === 'online' ? { link: config.link, round: config.round, myStone: config.myStone } : undefined, () => this.replayConfig()));
    }, delay);
  }

  /** What the announcer says when the game ends. */
  private announcement(winner: Stone | null, myStone: Stone | null, reason: Outcome['reason']): VoiceLineId {
    const resigned = reason === 'resign';
    if (winner === null) return 'draw';
    if (myStone === null) {
      if (winner === BLACK) return resigned ? 'blackWinsResign' : 'blackWins';
      return resigned ? 'whiteWinsResign' : 'whiteWins';
    }
    if (winner === myStone) return resigned ? 'winResign' : 'win';
    return resigned ? 'loseResign' : 'lose';
  }

  private replayConfig(): GameConfig {
    return this.config;
  }

  // ---- online -------------------------------------------------------------------------

  private listenOnline(link: OnlineLink) {
    this.unsubscribers.push(
      link.onMessage((message: NetMessage) => {
        if (this.ended || this.config.mode !== 'online') return;
        const theirs = opponent(this.config.myStone);
        if (message.type === 'move') {
          if (message.index !== this.game.history.length || this.game.turn !== theirs) return;
          this.apply({ x: message.x, y: message.y });
        } else if (message.type === 'resign') {
          this.resignAs(theirs);
        }
      }),
      link.onClose((reason) => this.onOpponentLeft(reason)),
    );
  }

  private onOpponentLeft(reason: string) {
    if (this.ended || this.config.mode !== 'online' || this.destroyed) return;
    const myStone = this.config.myStone;
    this.opponentGone = true;
    this.board.acceptingInput = false;
    toast(this, reason, this.w);
    void navigation.present(
      new ConfirmPopup({
        title: '对手离开了',
        message: '要让狐狸阿明接着陪你下完这局吗？',
        confirm: '继续下',
        cancel: '回到主页',
        onConfirm: () => {
          this.opponentGone = false;
          this.config = { mode: 'ai', brain: 'fox', humanStone: myStone };
          this.ai = new AiPlayer('fox');
          this.modeBar.setText('mode', this.modeText());
          this.undoButton.visible = true;
          this.setupPlayers();
          this.nextTurn();
        },
        onCancel: () => void navigation.goTo(new HomeScreen()),
      }),
    );
  }

  // ---- menu ---------------------------------------------------------------------------

  /** Leaving a rated game after you have moved ends the win streak. */
  private get abandonCostsStreak() {
    const config = this.config;
    if (this.ended || this.opponentGone || config.mode === 'local') return false;
    const me = config.mode === 'ai' ? config.humanStone : config.myStone;
    return this.game.movesBy(me) > 0;
  }

  private openMenu() {
    const config = this.config;
    void navigation.present(
      new PausePopup({
        note: this.abandonCostsStreak && getProfile().streak > 0 ? `中途离开会中断 ${getProfile().streak} 连胜` : undefined,
        onRestart: config.mode === 'online' ? undefined : () => void navigation.goTo(new GameScreen(config)),
        onHome: () => {
          if (config.mode === 'online') config.link.close();
          void navigation.goTo(new HomeScreen());
        },
      }),
    );
  }

  // ---- layout -------------------------------------------------------------------------

  resize(width: number, height: number) {
    this.w = width;
    this.h = height;
    this.backdrop.resize(width, height);
    const landscape = width > height * 1.15;
    const black = this.cards.get(BLACK);
    const white = this.cards.get(WHITE);
    if (!black || !white) return;

    if (landscape) {
      const side = Math.min(280, width * 0.24);
      const boardSize = Math.min(height - 40, width - side * 2 - 40);
      this.board.layout(boardSize);
      this.board.position.set((width - boardSize) / 2, (height - boardSize) / 2);
      const cardScale = Math.min(1, (side - 20) / black.cardWidth);
      black.scale.set(cardScale);
      white.scale.set(cardScale);
      const left = this.board.x / 2;
      const right = this.board.x + boardSize + (width - this.board.x - boardSize) / 2;
      black.position.set(left - (black.cardWidth * cardScale) / 2, height * 0.3);
      white.position.set(right - (white.cardWidth * cardScale) / 2, height * 0.3);
      this.status.position.set(left, height * 0.3 - 40);
      this.status.scale.set(Math.min(1, (side - 10) / (this.status.width / this.status.scale.x)));
      this.undoButton.scale.set(cardScale);
      this.resignButton.scale.set(cardScale);
      this.undoButton.position.set(right, height * 0.62);
      this.resignButton.position.set(right, height * 0.62 + 90 * cardScale);
      this.placeTopBar(Math.min(1, (this.board.x - 24) / 300));
    } else {
      const barBottom = this.placeTopBar(Math.min(1, (width - 24) / 360));
      const cardScale = Math.min(1, (width - 24) / 2 / (black.cardWidth + 8));
      black.scale.set(cardScale);
      white.scale.set(cardScale);
      const cardsY = barBottom + 12;
      black.position.set(12, cardsY);
      white.position.set(width - 12 - white.cardWidth * cardScale, cardsY);
      const cardsBottom = cardsY + 92 * cardScale;
      this.status.position.set(width / 2, cardsBottom + 22);
      this.status.scale.set(Math.min(1, (width - 32) / (this.status.width / this.status.scale.x)));
      const top = cardsBottom + 44;
      const bottom = 110;
      const boardSize = Math.min(width - 16, height - top - bottom);
      this.board.layout(boardSize);
      this.board.position.set((width - boardSize) / 2, top + (height - top - bottom - boardSize) / 2);
      const buttonScale = Math.min(1, width / 440);
      this.undoButton.scale.set(buttonScale);
      this.resignButton.scale.set(buttonScale);
      const by = this.board.y + boardSize + (height - this.board.y - boardSize) / 2;
      if (this.undoButton.visible) {
        this.undoButton.position.set(width / 2 - 100 * buttonScale, by);
        this.resignButton.position.set(width / 2 + 100 * buttonScale, by);
      } else {
        this.resignButton.position.set(width / 2, by);
      }
    }
    const size = this.board.boardPixelSize;
    this.boardGlow.position.set(this.board.x + size / 2, this.board.y + size / 2);
    this.boardGlow.width = this.boardGlow.height = size * 1.6;
  }

  /** Menu button and mode chip in the top-left tray. Returns the bar's bottom edge. */
  private placeTopBar(scale: number) {
    const s = Math.max(0.6, scale);
    this.menu.scale.set(s * 0.86);
    this.menu.position.set(12 + 28 * s, 12 + 28 * s);
    this.modeBar.scale.set(s);
    this.modeBar.position.set(12 + 64 * s, 12);
    return 12 + this.modeBar.barHeight * s;
  }

  update(ticker: Ticker) {
    this.backdrop.update(ticker);
    this.board.update(ticker);
    for (const card of this.cards.values()) card.update(ticker);
  }

  onLeave() {
    if (this.abandonCostsStreak && getProfile().streak > 0) updateProfile({ streak: 0 });
    this.token += 1;
    this.ai?.dispose();
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }
}

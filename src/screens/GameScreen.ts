import { Container, Sprite, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { trackGameEnd, trackGameStart } from '../app/analytics';
import { say } from '../app/voice';
import type { VoiceLineId } from '../app/voiceLines';
import { navigation } from '../app/navigation';
import { getProfile, updateProfile } from '../app/storage';
import { tex } from '../app/textures';
import { AiPlayer, type BrainId, brainInfo } from '../gomoku/ai';
import { equivalentOffers, freshOpening, inOpeningZone, normalizeVariant, type Opening, openingPhase, type OpeningPhase, openingRadius, randomOpeningMove } from '../gomoku/opening';
import { FORBIDDEN_NAMES, forbiddenPoints, RULE_NAMES } from '../gomoku/renju';
import { BLACK, BOARD_SIZE, GomokuGame, opponent, type Point, type Rule, type Stone, WHITE } from '../gomoku/rules';
import { DELEGATE_PROTOCOL, type NetMessage, type OnlineLink, UNDO_PROTOCOL } from '../net/online';
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
  | { mode: 'ai'; brain: BrainId; humanStone: Stone; rule?: Rule; opening?: Opening }
  | { mode: 'local'; rule?: Rule; opening?: Opening }
  /** `notice` is shown once at the start (e.g. the room fell back to free-style). */
  | { mode: 'online'; link: OnlineLink; myStone: Stone; round: number; rule?: Rule; opening?: Opening; notice?: string };

type Seat = 'human' | 'ai' | 'remote';

const stoneName = (stone: Stone) => (stone === BLACK ? '黑棋' : '白棋');

/** How long an online undo request waits for an answer before it is withdrawn. */
const UNDO_WAIT_MS = 30_000;

export class GameScreen extends Container {
  private backdrop = new Backdrop('backdrop-game', { raysTint: 0xb9a0ff, sparkles: 12 });
  private boardGlow = new Sprite(tex('glow'));
  private modeBar: TabBar;
  private board = new BoardView();
  private game: GomokuGame;
  private gameId = crypto.randomUUID();
  private cards = new Map<Stone, PlayerCard>();
  private status: Text;
  private menu: IconButton;
  private undoButton: Button;
  /** Online only, in the undo button's place: hand the seat to the master (托管) or take it back. */
  private delegateButton: Button;
  private resignButton: Button;
  private ai: AiPlayer | null = null;
  private aiThinking = false;
  /** Bumped whenever pending async work (AI thinking) must be ignored. */
  private token = 0;
  private unsubscribers: Array<() => void> = [];
  private ended = false;
  private trackedStart = false;
  /** The opponent walked out, so leaving now costs the player nothing. */
  private opponentGone = false;
  private w = 0;
  private h = 0;
  /** 托管: the master plays the local player's side right now / did at some point this game. */
  private delegating = false;
  private everDelegated = false;
  /** The master playing the local side under 托管 (separate from `ai`, the opponent's AI). */
  private delegateAi: AiPlayer | null = null;
  /** 托管 belongs to online games, and stays available if the master takes over a departed opponent. */
  private readonly wasOnline: boolean;
  /** The online opponent left and the master finished their side: the game still counts as online. */
  private takeover: { opponentName: string } | null = null;
  /** The online opponent handed their seat to the master (now / at some point this game). */
  private opponentDelegating = false;
  private opponentEverDelegated = false;
  /** Online: our undo request waiting for the opponent's answer (gives up after UNDO_WAIT_MS). */
  private undoRequest: { count: 1 | 2; index: number; timer: number } | null = null;
  /**
   * Online: the opponent's undo request we are answering. Once accepted we wait
   * for their commit (or cancel) before touching the board, so both sides take
   * back the same moves or neither does.
   */
  private undoAnswer: { count: 1 | 2; index: number; accepted: boolean; popup: ConfirmPopup } | null = null;
  /** Widest the status line may be; longer texts shrink to fit. */
  private statusMaxWidth = 280;
  /** RIF opening (renju only) and its decisions so far. */
  private readonly opening: Opening;
  private openingState = freshOpening();
  /** 5th-move candidates the local player has tapped but not yet offered. */
  private picking: Point[] = [];
  /** The seats as the game started, before any opening swap: what "play again" reuses. */
  private startConfig: GameConfig;
  /** The local player's stone when the game started (null on one device): under RIF, who placed the opening. */
  private readonly startStone: Stone | null;

  constructor(private config: GameConfig) {
    super();
    this.startConfig = config;
    this.wasOnline = config.mode === 'online';
    this.startStone = config.mode === 'ai' ? config.humanStone : config.mode === 'online' ? config.myStone : null;
    // Dev only: lets browser tests read the game state and act as the player.
    if (import.meta.env.DEV) (window as unknown as { __gomokuScreen?: GameScreen }).__gomokuScreen = this;
    const variant = normalizeVariant(config.rule ?? 'freestyle', config.opening);
    this.game = new GomokuGame(BOARD_SIZE, variant.rule);
    this.opening = variant.opening;
    this.status = label('', 'heading', { fontSize: 24 });
    this.menu = new IconButton({ icon: 'menu', size: 56, onPress: () => this.openMenu() });
    this.undoButton = new Button({ text: '悔棋', skin: 'white', width: 170, height: 70, icon: 'undo', fontSize: 24, onPress: () => this.undo() });
    this.resignButton = new Button({ text: '认输', skin: 'red', width: 170, height: 70, icon: 'flag', fontSize: 24, onPress: () => this.askResign() });
    // Online, undo is a request the opponent has to accept.
    this.delegateButton = new Button({ text: '托管', skin: 'white', width: 170, height: 70, icon: 'robot', fontSize: 24, onPress: () => this.toggleDelegate() });
    this.delegateButton.visible = config.mode === 'online';
    this.backdrop.rays.alpha = 0.16;
    this.boardGlow.anchor.set(0.5);
    this.boardGlow.tint = 0xffc27a;
    this.boardGlow.alpha = 0.35;
    this.boardGlow.blendMode = 'add';
    this.modeBar = new TabBar([{ id: 'mode', text: this.modeText(), icon: this.modeIcon() }], 'mode');

    this.board.onCell = (point) => this.onLocalMove(point);
    this.board.onTouchPreviewChange = () => this.updateStatus();
    this.addChild(this.backdrop, this.boardGlow, this.board, this.status, this.undoButton, this.delegateButton, this.resignButton, this.modeBar, this.menu);
    this.setupPlayers();
    if (config.mode === 'ai') this.ai = new AiPlayer(config.brain, this.game.rule);
    if (config.mode === 'online') this.listenOnline(config.link);
  }

  /** Text for the top-left mode chip. */
  private modeText() {
    const config = this.config;
    // The icon already says which mode it is, so renju swaps the prefix to keep the chip short.
    const renju = this.game.rule === 'renju';
    if (config.mode === 'local') return renju ? `${RULE_NAMES.renju} · 双人` : '同屏双人';
    if (config.mode === 'ai') return `${renju ? RULE_NAMES.renju : '人机'} · ${brainInfo(config.brain).name}`;
    return `${renju ? RULE_NAMES.renju : '在线'} · 房间 ${config.link.code}`;
  }

  private modeIcon() {
    return this.config.mode === 'local' ? 'users' : this.config.mode === 'ai' ? 'robot' : 'globe';
  }

  // ---- players ------------------------------------------------------------------------

  private seatOf(stone: Stone): Seat {
    const config = this.config;
    if (config.mode === 'local') return 'human';
    // Under 托管 the master (an AI seat) plays the local side too.
    if (config.mode === 'ai') return stone === config.humanStone && !this.delegating ? 'human' : 'ai';
    // While 托管 is on, the master (an AI seat on this device) plays the local side.
    if (stone === config.myStone) return this.delegating ? 'ai' : 'human';
    return 'remote';
  }

  private describe(stone: Stone): { name: string; avatar: AvatarId; subtitle: string } {
    const config = this.config;
    if (config.mode === 'local') return { name: stone === BLACK ? '黑方' : '白方', avatar: stone === BLACK ? 'you' : 'friend', subtitle: stoneName(stone) };
    if (config.mode === 'ai') {
      if (stone === config.humanStone) {
        return this.delegating ? { name: '神龙棋仙', avatar: 'master', subtitle: `替你托管 · ${stoneName(stone)}` } : { name: '你', avatar: 'you', subtitle: stoneName(stone) };
      }
      const info = brainInfo(config.brain);
      return { name: info.name, avatar: info.id, subtitle: `${info.title} · ${stoneName(stone)}` };
    }
    if (stone === config.myStone) {
      return this.delegating ? { name: '神龙棋仙', avatar: 'master', subtitle: `替你托管 · ${stoneName(stone)}` } : { name: '你', avatar: 'you', subtitle: stoneName(stone) };
    }
    if (this.opponentDelegating) return { name: config.link.opponentName, avatar: 'master', subtitle: `托管给神龙 · ${stoneName(stone)}` };
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
    if (!this.trackedStart) {
      this.trackedStart = true;
      trackGameStart(this.config.mode, this.config.mode === 'ai' ? this.config.brain : undefined);
    }
    this.alpha = 0;
    gsap.to(this, { alpha: 1, duration: 0.3 });
    await gsap.from(this.board.scale, { x: 0.85, y: 0.85, duration: 0.4, ease: 'back.out(1.8)' });
    const notice = this.config.mode === 'online' ? this.config.notice : undefined;
    if (notice) toast(this, notice, this.w);
    else if (this.opening === 'rif') toast(this, '三手交换 · 五手两打：先摆三手，对方可交换', this.w);
    else if (this.game.rule === 'renju') toast(this, '连珠规则：黑棋不能下三三、四四、长连', this.w);
    this.nextTurn();
  }

  async hide() {
    await gsap.to(this, { alpha: 0, duration: 0.2 });
  }

  /** Dev only: play `moves` before the game is shown. */
  preload(moves: Array<[number, number]>) {
    for (const [x, y] of moves) {
      const stone = this.game.turn;
      if (this.game.play(x, y).kind !== 'placed') break;
      this.board.placeStone(x, y, stone, false);
    }
  }

  private phase(): OpeningPhase {
    return openingPhase(this.opening, this.game.history.length, this.openingState);
  }

  /** Whose decision it is: black places the opening and offers the 5th move, white swaps and chooses. */
  private actorStone(phase = this.phase()): Stone {
    if (phase === 'place' || phase === 'offer') return BLACK;
    if (phase === 'swap' || phase === 'choose') return WHITE;
    return this.game.turn;
  }

  /** Refresh the view for whoever acts next; `act` also starts the AI or asks the swap question. */
  private nextTurn(act = true) {
    if (this.ended) return;
    this.board.hideGhost();
    const phase = this.phase();
    const actor = this.actorStone(phase);
    const seat = this.seatOf(actor);
    const mine = seat === 'human';
    this.board.turnStone = this.game.turn;
    // No moves while an undo request (ours or theirs) is being settled.
    this.board.acceptingInput = mine && phase !== 'swap' && !this.undoRequest && !this.undoAnswer?.accepted;
    this.board.ghostEnabled = phase !== 'choose';
    this.board.setForbidden(mine && this.game.rule === 'renju' && this.game.turn === BLACK && (phase === 'play' || phase === 'offer') ? forbiddenPoints(this.game.board) : []);
    this.board.setZone(mine && phase === 'place' ? openingRadius(this.game.history.length) : null);
    this.board.setOffers(phase === 'choose' ? this.openingState.offers : phase === 'offer' ? this.picking : []);
    for (const [stone, card] of this.cards) card.setActive(stone === actor, stone === actor && seat === 'ai');
    for (const [stone, card] of this.cards) if (!(stone === actor && seat === 'ai')) card.setStatus(this.describe(stone).subtitle);

    this.updateStatus();
    gsap.fromTo(this.status, { alpha: 0.3 }, { alpha: 1, duration: 0.3 });
    this.undoButton.setEnabled(this.canUndo());
    this.resignButton.setEnabled(!this.ended && (this.config.mode === 'local' || this.game.history.length > 0));
    if (!act) return;
    if (seat === 'ai') void (phase === 'play' ? this.aiTurn() : this.aiOpening(phase));
    else if (mine && phase === 'swap') this.askSwap();
  }

  private updateStatus() {
    if (this.ended) return;
    const phase = this.phase();
    const actor = this.actorStone(phase);
    const seat = this.seatOf(actor);
    const name = this.describe(actor).name;
    // Same-device play names the side, since both players read the same screen.
    const you = this.config.mode === 'local' ? `${name}：` : '';
    if (seat === 'human' && this.board.hasTouchPreview) this.status.text = '再点一次落子';
    else if (phase === 'place') {
      const step = `摆第 ${this.game.history.length + 1} 手（${stoneName(this.game.turn)}）`;
      this.status.text = seat === 'human' ? `${you}开局 · ${step}` : seat === 'ai' ? `${name}正在摆开局` : `等待${name}摆开局`;
    } else if (phase === 'swap') {
      this.status.text = seat === 'human' ? `${you}三手交换：要不要换？` : seat === 'ai' ? `${name}在考虑是否交换` : `等待${name}决定是否交换`;
    } else if (phase === 'offer') {
      this.status.text = seat === 'human' ? `${you}五手两打：选两个点（${this.picking.length}/2）` : seat === 'ai' ? `${name}在选第五手` : `等待${name}给出两个第五手`;
    } else if (phase === 'choose') {
      this.status.text = seat === 'human' ? `${you}留下一个第五手` : seat === 'ai' ? `${name}在挑第五手` : `等待${name}挑第五手`;
    } else if (this.config.mode === 'local') this.status.text = `轮到${stoneName(actor)}`;
    else if (seat === 'human') this.status.text = `轮到你了 · ${stoneName(actor)}`;
    else if (seat === 'ai') this.status.text = `${name}正在思考`;
    else this.status.text = `等待${name}落子`;
    this.fitStatus();
  }

  /** Shrink the status line to its space; texts change after layout (e.g. the opening prompts). */
  private fitStatus() {
    const natural = this.status.width / this.status.scale.x;
    this.status.scale.set(Math.min(1, this.statusMaxWidth / Math.max(1, natural)));
  }

  // ---- RIF opening ----------------------------------------------------------------------

  /** The AI's part of the opening: place, swap, offer or choose. */
  private async aiOpening(phase: OpeningPhase) {
    const ai = this.aiFor(this.actorStone(phase));
    if (!ai) return;
    const token = ++this.token;
    this.aiThinking = true;
    this.undoButton.setEnabled(false);
    const before = ai.effectiveBrain;
    const board = new Uint8Array(this.game.board);
    const stale = () => token !== this.token || this.destroyed || this.ended;
    if (phase === 'place') {
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (stale()) return;
      this.aiThinking = false;
      this.playOwn(randomOpeningMove(board, this.game.history.length));
      return;
    }
    // Online, an AI seat is the local player's 托管: its decisions go to the opponent too.
    const forMe = this.config.mode === 'online';
    if (phase === 'swap') {
      const swap = await ai.decideSwap(board);
      if (stale()) return;
      this.aiThinking = false;
      this.decideSwap(swap, forMe);
    } else if (phase === 'offer') {
      const offers = await ai.offerFifth(board);
      if (stale()) return;
      this.aiThinking = false;
      // Two offers are always found in practice; with one there is nothing to choose.
      if (offers.length === 2) this.submitOffers(offers, forMe);
      else if (offers[0]) this.playOwn(offers[0]);
    } else if (phase === 'choose') {
      const keep = await ai.chooseFifth(board, this.openingState.offers);
      if (stale()) return;
      this.aiThinking = false;
      this.keepOffer(keep, forMe);
    }
    if (ai.effectiveBrain !== before) toast(this, this.engineFailureNote(ai), this.w);
  }

  private askSwap() {
    const local = this.config.mode === 'local';
    void navigation.present(
      new ConfirmPopup({
        title: '三手交换',
        message: local ? '白方：要和黑方交换执子吗？\n交换后你执黑，对方执白下第四手。' : '要和对手交换执子吗？\n交换后你执黑，对手执白下第四手。',
        confirm: '交换',
        cancel: '不交换',
        onConfirm: () => this.decideSwap(true, true),
        onCancel: () => this.decideSwap(false, true),
      }),
    );
  }

  /** Apply the tentative white's decision; `mine` when the local player made it. */
  private decideSwap(swap: boolean, mine: boolean) {
    if (this.ended || this.phase() !== 'swap') return;
    this.openingState.swapDecided = true;
    const config = this.config;
    if (mine && config.mode === 'online') config.link.send({ type: 'swap', swap });
    if (swap) {
      if (config.mode === 'ai') this.config = { ...config, humanStone: opponent(config.humanStone) };
      else if (config.mode === 'online') this.config = { ...config, myStone: opponent(config.myStone) };
      this.setupPlayers();
    }
    const me = this.config.mode === 'ai' ? this.config.humanStone : this.config.mode === 'online' ? this.config.myStone : null;
    if (!swap) toast(this, '不交换，白方下第四手', this.w);
    else if (me === null) toast(this, '交换执子：两位请换个位置', this.w);
    else toast(this, `交换执子：你现在执${stoneName(me)}`, this.w);
    this.nextTurn();
  }

  /** Local black taps candidate 5th moves; tapping one again takes it back. */
  private pickOffer(point: Point) {
    const at = this.picking.findIndex((p) => p.x === point.x && p.y === point.y);
    if (at >= 0) {
      this.picking.splice(at, 1);
      this.nextTurn();
      return;
    }
    const reason = this.game.forbidden(point.x, point.y);
    if (reason) {
      sfx.invalid();
      toast(this, `禁手：${FORBIDDEN_NAMES[reason]}，黑棋不能下这里`, this.w);
      return;
    }
    if (this.picking[0] && equivalentOffers(this.game.board, this.picking[0], point)) {
      sfx.invalid();
      toast(this, '这两个点对称，算同一种，请换一个', this.w);
      return;
    }
    sfx.stone();
    this.picking.push(point);
    if (this.picking.length < 2) {
      this.nextTurn();
      return;
    }
    const offers = this.picking;
    this.picking = [];
    this.submitOffers(offers, true);
  }

  private submitOffers(offers: Point[], mine: boolean) {
    if (this.ended || this.phase() !== 'offer') return;
    const config = this.config;
    if (mine && config.mode === 'online') config.link.send({ type: 'offer', points: offers.map((p) => [p.x, p.y] as [number, number]) });
    this.openingState.offers = offers.map((p) => ({ x: p.x, y: p.y }));
    this.nextTurn();
  }

  /** White keeps one offer: it becomes the 5th move and the other is dropped. */
  private keepOffer(point: Point, mine: boolean) {
    if (this.ended || this.phase() !== 'choose') return;
    if (!this.openingState.offers.some((p) => p.x === point.x && p.y === point.y)) {
      if (mine) toast(this, '点一个标出来的第五手', this.w);
      return;
    }
    const config = this.config;
    if (mine && config.mode === 'online') config.link.send({ type: 'choose', x: point.x, y: point.y });
    this.openingState.offers = [];
    this.board.setOffers([]);
    this.apply(point);
  }

  /** Checks for an opening move from another peer. */
  private validOffers(points: Point[]) {
    const [a, b] = points;
    const board = this.game.board;
    const free = (p: Point) => board[p.y * BOARD_SIZE + p.x] === 0 && this.game.forbidden(p.x, p.y) === null;
    return free(a) && free(b) && !equivalentOffers(board, a, b);
  }

  /** The local player's stone, or null when both sides are local. */
  private get myStone(): Stone | null {
    const config = this.config;
    return config.mode === 'ai' ? config.humanStone : config.mode === 'online' ? config.myStone : null;
  }

  /** The AI that acts for `stone`: the master under 托管 for our side, otherwise the opponent's AI. */
  private aiFor(stone: Stone) {
    return this.delegating && stone === this.myStone ? this.delegateAi : this.ai;
  }

  private engineFailureNote(ai: AiPlayer) {
    if (ai === this.delegateAi) return `神龙引擎出错，改由${brainInfo(ai.effectiveBrain).name}替你托管`;
    return `大师引擎出错，由${brainInfo(ai.effectiveBrain).name}接手，本局按它结算`;
  }

  private async aiTurn() {
    const ai = this.aiFor(this.game.turn);
    if (!ai) return;
    const token = ++this.token;
    this.aiThinking = true;
    this.undoButton.setEnabled(false);
    const before = ai.effectiveBrain;
    const move = await ai.think(this.game.board, this.game.turn, this.game.history.length < 2 ? 500 : 380);
    if (token !== this.token || this.destroyed) return;
    if (ai.effectiveBrain !== before) toast(this, this.engineFailureNote(ai), this.w);
    this.aiThinking = false;
    this.playOwn(move);
  }

  private onLocalMove(point: Point) {
    const phase = this.phase();
    if (this.ended || this.seatOf(this.actorStone(phase)) !== 'human') return;
    if (phase === 'offer') return this.pickOffer(point);
    if (phase === 'choose') return this.keepOffer(point, true);
    if (phase === 'swap') return;
    this.playOwn(point);
  }

  /** Play a move for this device's side (the player, or the AI) and tell an online opponent. */
  private playOwn(point: Point) {
    const index = this.game.history.length;
    if (this.apply(point) && this.config.mode === 'online') this.config.link.send({ type: 'move', x: point.x, y: point.y, index });
  }

  // ---- 托管 ------------------------------------------------------------------------------

  private toggleDelegate() {
    const config = this.config;
    if (!this.wasOnline || this.ended) return;
    if (this.delegating) {
      this.setDelegating(false);
      return;
    }
    // The master's move would race the opponent's answer to our undo request.
    if (this.undoRequest) {
      toast(this, '正在等待对方回复悔棋，稍后再托管', this.w);
      return;
    }
    // Only when the opponent's client will show it: a hidden 托管 would be cheating.
    if (config.mode === 'online' && config.link.opponentProtocol < DELEGATE_PROTOCOL) {
      toast(this, '对方的版本还看不到托管标记，暂时不能托管', this.w);
      return;
    }
    if (this.everDelegated) {
      this.setDelegating(true);
      return;
    }
    this.board.hideGhost();
    void navigation.present(
      new ConfirmPopup({
        title: '托管给神龙',
        message: '神龙棋仙会替你下完这局，你可以随时取消。\n对手会看到托管标记，本局不计入你的战绩和奖励。',
        confirm: '托管',
        onConfirm: () => this.setDelegating(true),
      }),
    );
  }

  private setDelegating(on: boolean) {
    const config = this.config;
    if (!this.wasOnline || this.ended || this.delegating === on) return;
    this.delegating = on;
    if (on) {
      this.everDelegated = true;
      this.delegateAi ??= new AiPlayer('master', this.game.rule);
    } else {
      // Drop whatever the master was thinking; the player takes over this turn.
      this.token += 1;
      this.aiThinking = false;
    }
    if (config.mode === 'online') config.link.send({ type: 'delegate', on });
    this.delegateButton.setText(on ? '取消托管' : '托管');
    // The master plays this side now: no undo button while it does.
    this.undoButton.visible = !on;
    if (this.w) this.resize(this.w, this.h);
    toast(this, on ? '已托管给神龙，本局不计入你的战绩' : '已取消托管，轮到你自己下', this.w);
    this.setupPlayers();
    this.nextTurn();
  }

  /** Play a move on the model and the view. Returns false if it was rejected. */
  private apply(point: Point) {
    const stone = this.game.turn;
    if (this.phase() === 'place' && !inOpeningZone(this.game.board, this.game.history.length, point)) {
      sfx.invalid();
      const where = this.game.history.length === 0 ? '第 1 手下在天元' : this.game.history.length === 1 ? '第 2 手下在天元周围一圈' : '第 3 手下在天元周围两圈内';
      toast(this, `开局规则：${where}`, this.w);
      return false;
    }
    const result = this.game.play(point.x, point.y);
    if (result.kind === 'invalid') {
      sfx.invalid();
      return false;
    }
    if (result.kind === 'forbidden') {
      sfx.invalid();
      toast(this, `禁手：${FORBIDDEN_NAMES[result.reason]}，黑棋不能下这里`, this.w);
      return false;
    }
    this.board.placeStone(point.x, point.y, stone);
    sfx.stone();
    // Any new move makes a pending undo request stale.
    if (this.undoRequest) this.closeUndoRequest();
    if (result.kind === 'win') this.finish('five', result.line);
    else if (result.kind === 'draw') this.finish('draw');
    else this.nextTurn();
    return true;
  }

  private canUndo() {
    if (this.ended || this.aiThinking || this.undoRequest || this.undoAnswer || this.delegating) return false;
    // The RIF opening cannot be taken back: only moves after the kept 5th move can.
    if (this.opening === 'rif' && (this.phase() !== 'play' || this.game.history.length - this.undoCount() < 5)) return false;
    const config = this.config;
    if (config.mode === 'online') return config.link.opponentProtocol >= UNDO_PROTOCOL && this.game.movesBy(config.myStone) > 0;
    if (config.mode === 'ai') return this.game.movesBy(config.humanStone) > 0;
    return this.game.history.length > 0;
  }

  /** Moves one undo takes back: against an opponent, their reply goes together with our own move. */
  private undoCount(): 1 | 2 {
    const config = this.config;
    if (config.mode === 'local') return 1;
    const mine = config.mode === 'ai' ? config.humanStone : config.myStone;
    return this.game.lastMove?.stone === mine ? 1 : 2;
  }

  private undo() {
    if (!this.canUndo()) return;
    const config = this.config;
    if (config.mode === 'online') {
      const request = { count: this.undoCount(), index: this.game.history.length };
      // Nobody answering must not freeze the game: give up, and tell the opponent so.
      const timer = window.setTimeout(() => {
        if (this.undoRequest?.index !== request.index || this.destroyed) return;
        config.link.send({ type: 'undo-cancel', index: request.index });
        this.closeUndoRequest();
        toast(this, '对方没有回应，悔棋已取消', this.w);
        this.nextTurn();
      }, UNDO_WAIT_MS);
      this.undoRequest = { ...request, timer };
      config.link.send({ type: 'undo-request', ...request });
      this.undoButton.setText('等待同意…');
      toast(this, '已请求悔棋，等待对方同意', this.w);
      this.nextTurn();
      return;
    }
    this.takeBack(this.undoCount());
  }

  private takeBack(count: number) {
    this.token += 1;
    this.aiThinking = false;
    for (const move of this.game.undo(count)) this.board.removeStone(move.x, move.y);
    const last = this.game.lastMove;
    this.board.setLastMove(last ? { x: last.x, y: last.y } : null);
    this.nextTurn();
  }

  /** Our request was answered, or went stale because the board changed. */
  private closeUndoRequest() {
    if (this.undoRequest) window.clearTimeout(this.undoRequest.timer);
    this.undoRequest = null;
    this.undoButton.setText('悔棋');
  }

  /** The opponent asks to take back moves: ask the player, then answer. */
  private onUndoRequest(count: 1 | 2, index: number) {
    const config = this.config;
    if (config.mode !== 'online') return;
    const valid = () => !this.ended && this.game.history.length === index && !(this.opening === 'rif' && (this.phase() !== 'play' || index - count < 5));
    // Refuse while our own request is open (both accepting would take back different moves on
    // each side) and under 托管 (the player may be away; the requester would wait forever).
    if (!valid() || this.undoRequest || this.delegating) {
      config.link.send({ type: 'undo-reply', accept: false, index });
      return;
    }
    this.board.hideGhost();
    const answer = (accept: boolean) => {
      // Cancelled meanwhile (the requester gave up): nothing to answer.
      if (this.undoAnswer?.index !== index) return;
      // The board may have changed while the question was open.
      const ok = accept && valid() && !this.undoRequest;
      config.link.send({ type: 'undo-reply', accept: ok, index });
      if (ok) {
        // Take the moves back only on the requester's commit.
        this.undoAnswer.accepted = true;
        this.nextTurn();
      } else {
        this.undoAnswer = null;
      }
    };
    const popup = new ConfirmPopup({
      title: '对方请求悔棋',
      message: `${config.link.opponentName}想撤回 ${count} 手棋，同意吗？`,
      confirm: '同意',
      cancel: '拒绝',
      onConfirm: () => answer(true),
      onCancel: () => answer(false),
    });
    this.undoAnswer = { count, index, accepted: false, popup };
    void navigation.present(popup);
  }

  /** The requester took the moves back after our acceptance: do the same. */
  private onUndoCommit(index: number) {
    const answer = this.undoAnswer;
    if (!answer || answer.index !== index || !answer.accepted) return;
    this.undoAnswer = null;
    if (this.game.history.length !== index) return;
    toast(this, `已悔棋，撤回 ${answer.count} 手`, this.w);
    this.takeBack(answer.count);
  }

  /** The requester gave up waiting: close the question and free the board. */
  private onUndoCancel(index: number) {
    const answer = this.undoAnswer;
    if (!answer || answer.index !== index) return;
    this.undoAnswer = null;
    if (navigation.popup === answer.popup) void navigation.dismissPopup();
    toast(this, '对方取消了悔棋请求', this.w);
    this.nextTurn();
  }

  private onUndoReply(accept: boolean, index: number) {
    const request = this.undoRequest;
    // A late answer to an earlier (already stale) request must not settle the current one.
    if (!request || request.index !== index) return;
    this.closeUndoRequest();
    if (accept && this.game.history.length === request.index) {
      // Commit first: the accepter takes the same moves back when it arrives.
      const config = this.config;
      if (config.mode === 'online') config.link.send({ type: 'undo-commit', index });
      toast(this, '对方同意了悔棋', this.w);
      this.takeBack(request.count);
    } else {
      // An acceptance we will not act on: release the accepter, who is waiting for a commit.
      const config = this.config;
      if (accept && config.mode === 'online') config.link.send({ type: 'undo-cancel', index });
      toast(this, accept ? '棋局已变化，悔棋作废' : '对方拒绝了悔棋', this.w);
      this.nextTurn();
    }
  }

  private askResign() {
    if (this.ended) return;
    this.board.hideGhost();
    const config = this.config;
    const who = config.mode === 'local' ? `${stoneName(this.actorStone())}认输？` : '确定要认输吗？';
    void navigation.present(
      new ConfirmPopup({
        title: '认输',
        message: config.mode === 'local' ? `${who}\n对方将直接获胜。` : `${who}\n对手将直接获胜，连胜也会中断。`,
        confirm: '认输',
        danger: true,
        onConfirm: () => {
          if (this.ended) return;
          const current = this.config;
          const loser = current.mode === 'local' ? this.actorStone() : current.mode === 'ai' ? current.humanStone : current.myStone;
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
    this.board.setForbidden([]);
    for (const card of this.cards.values()) card.setActive(false);
    this.undoButton.setEnabled(false);
    this.delegateButton.setEnabled(false);
    this.resignButton.setEnabled(false);

    const winner = this.game.winner;
    const config = this.config;
    const myStone = config.mode === 'ai' ? config.humanStone : config.mode === 'online' ? config.myStone : null;
    if (line) this.board.showWin(line);
    if (winner === null) this.status.text = '平局';
    else if (myStone === null) this.status.text = `${stoneName(winner)}获胜！`;
    else this.status.text = winner === myStone ? '你赢了！' : reason === 'resign' ? '你认输了' : '对手连成五子';
    this.fitStatus();
    if (winner !== null && (myStone === null || winner === myStone)) sfx.win();
    else sfx.lose();
    say(this.announcement(winner, myStone, reason), { delay: 0.35 });

    const outcome: Outcome = {
      gameId: this.gameId,
      finishedAt: Date.now(),
      // A game the master finished for a departed opponent still counts as the online game it was.
      mode: this.takeover ? 'online' : config.mode,
      winner,
      myStone,
      totalMoves: this.game.history.length,
      winnerMoves: winner ? this.game.movesBy(winner) : 0,
      reason,
      // The owl stands in when the master's engine fails; the result counts as the owl's.
      brain: config.mode === 'ai' && !this.takeover ? this.ai?.effectiveBrain ?? config.brain : undefined,
      opponentName: this.takeover ? `${this.takeover.opponentName}（神龙接手）` : config.mode === 'online' ? config.link.opponentName : undefined,
      moves: this.game.history.map((move) => [move.x, move.y] as [number, number]),
      resignedBy: reason === 'resign' && winner !== null ? opponent(winner) : undefined,
      delegated: this.everDelegated || undefined,
      masterTookOver: this.takeover ? true : undefined,
      opponentDelegated: this.opponentEverDelegated || undefined,
      showName: getProfile().showInMasterRecord || undefined,
    };
    trackGameEnd(outcome);
    const delay = line ? 1800 : 900;
    window.setTimeout(() => {
      if (this.destroyed) return;
      void navigation.goTo(new ResultScreen(outcome, config.mode === 'online' ? { link: config.link, round: config.round, myStone: config.myStone, rule: this.game.rule, opening: this.opening } : undefined, () => this.replayConfig()));
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

  /** "Play again" keeps the seats the game started with, before any opening swap. */
  private replayConfig(): GameConfig {
    return this.startConfig;
  }

  // ---- online -------------------------------------------------------------------------

  private listenOnline(link: OnlineLink) {
    this.unsubscribers.push(
      link.onMessage((message: NetMessage) => {
        if (this.ended || this.config.mode !== 'online') return;
        const theirs = opponent(this.config.myStone);
        const phase = this.phase();
        // Each message is accepted only in its phase and only when it is the opponent's decision.
        const theirTurn = this.seatOf(this.actorStone(phase)) === 'remote';
        if (message.type === 'move') {
          if (message.index !== this.game.history.length || !theirTurn || (phase !== 'place' && phase !== 'play')) return;
          this.apply({ x: message.x, y: message.y });
        } else if (message.type === 'swap') {
          if (theirTurn && phase === 'swap') this.decideSwap(message.swap, false);
        } else if (message.type === 'offer') {
          const points = message.points.map(([x, y]) => ({ x, y }));
          if (theirTurn && phase === 'offer' && this.validOffers(points)) this.submitOffers(points, false);
        } else if (message.type === 'choose') {
          if (theirTurn && phase === 'choose') this.keepOffer({ x: message.x, y: message.y }, false);
        } else if (message.type === 'undo-request') {
          this.onUndoRequest(message.count, message.index);
        } else if (message.type === 'undo-commit') {
          this.onUndoCommit(message.index);
        } else if (message.type === 'undo-cancel') {
          this.onUndoCancel(message.index);
        } else if (message.type === 'undo-reply') {
          this.onUndoReply(message.accept, message.index);
        } else if (message.type === 'delegate') {
          if (message.on === this.opponentDelegating) return;
          this.opponentDelegating = message.on;
          if (message.on) this.opponentEverDelegated = true;
          toast(this, `${this.config.link.opponentName}${message.on ? '把这局托管给了神龙' : '取消了托管'}`, this.w);
          this.setupPlayers();
          // Only redraw the turn: re-acting would reopen the swap question or restart our 托管's search.
          this.nextTurn(false);
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
    this.board.hideGhost();
    // Under 托管 the player may be away: the game goes on (the master on both sides) without asking.
    if (this.delegating) {
      toast(this, `${reason} · 神龙接手对手，托管继续`, this.w);
      this.continueWithMaster(myStone);
      return;
    }
    toast(this, reason, this.w);
    void navigation.present(
      new ConfirmPopup({
        title: '对手离开了',
        message: '要让神龙棋仙接着陪你下完这局吗？',
        confirm: '继续下',
        cancel: '回到主页',
        onConfirm: () => this.continueWithMaster(myStone),
        onCancel: () => void navigation.goTo(new HomeScreen()),
      }),
    );
  }

  /**
   * The master takes the departed opponent's seat. 托管, if on, stays on until
   * the player cancels it. The game is still settled as the online game it was:
   * a master taking over a position is not a challenge against the master.
   */
  private continueWithMaster(myStone: Stone) {
    const config = this.config;
    if (this.ended || this.destroyed || config.mode !== 'online') return;
    this.opponentGone = false;
    this.takeover = { opponentName: config.link.opponentName };
    this.config = { mode: 'ai', brain: 'master', humanStone: myStone, rule: this.game.rule, opening: this.opening };
    // Playing again from here is a game against the master.
    this.startConfig = this.config;
    this.ai = new AiPlayer('master', this.game.rule);
    this.opponentDelegating = false;
    this.modeBar.setText('mode', this.modeText());
    this.closeUndoRequest();
    this.undoButton.visible = !this.delegating;
    this.setupPlayers();
    this.nextTurn();
  }

  // ---- menu ---------------------------------------------------------------------------

  /** Leaving a rated game after you have moved ends the win streak. */
  private get abandonCostsStreak() {
    const config = this.config;
    if (this.ended || this.opponentGone || config.mode === 'local') return false;
    // 托管 games never touch the streak.
    if (this.everDelegated) return false;
    const me = config.mode === 'ai' ? config.humanStone : config.myStone;
    if (this.opening !== 'rif') return this.game.movesBy(me) > 0;
    // Under RIF the opening's three stones (both colours) are all the tentative black's.
    if (this.startStone === BLACK && this.game.history.length > 0) return true;
    return this.game.history.some((move, index) => index >= 3 && move.stone === me);
  }

  private openMenu() {
    this.board.hideGhost();
    const config = this.config;
    void navigation.present(
      new PausePopup({
        note: this.abandonCostsStreak && getProfile().streak > 0 ? `中途离开会中断 ${getProfile().streak} 连胜` : undefined,
        // Restart with the seats the game started with, before any opening swap.
        onRestart: config.mode === 'online' ? undefined : () => void navigation.goTo(new GameScreen(this.startConfig)),
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
      this.statusMaxWidth = side - 10;
      this.fitStatus();
      this.undoButton.scale.set(cardScale);
      this.resignButton.scale.set(cardScale);
      // A column on the right: 悔棋, 托管 (online), 认输.
      const column = [this.undoButton, this.delegateButton, this.resignButton].filter((button) => button.visible);
      column.forEach((button, index) => {
        button.scale.set(cardScale);
        button.position.set(right, height * 0.58 + index * 88 * cardScale);
      });
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
      this.statusMaxWidth = width - 32;
      this.fitStatus();
      const top = cardsBottom + 44;
      const bottom = 110;
      const boardSize = Math.min(width - 16, height - top - bottom);
      this.board.layout(boardSize);
      this.board.position.set((width - boardSize) / 2, top + (height - top - bottom - boardSize) / 2);
      const by = this.board.y + boardSize + (height - this.board.y - boardSize) / 2;
      // A row under the board: 悔棋, 托管 (online), 认输.
      const row = [this.undoButton, this.delegateButton, this.resignButton].filter((button) => button.visible);
      const step = 186;
      const rowScale = Math.min(1, (width - 16) / (row.length * step));
      row.forEach((button, index) => {
        button.scale.set(rowScale);
        button.position.set(width / 2 + (index - (row.length - 1) / 2) * step * rowScale, by);
      });
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
    this.delegateAi?.dispose();
    for (const unsubscribe of this.unsubscribers) unsubscribe();
  }
}

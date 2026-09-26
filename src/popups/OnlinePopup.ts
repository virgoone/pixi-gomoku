import { Container, Graphics, type Text, type Ticker } from 'pixi.js';
import gsap from 'gsap';

import { sfx } from '../app/audio';
import { navigation } from '../app/navigation';
import { getProfile } from '../app/storage';
import { BLACK, type Stone, WHITE } from '../gomoku/rules';
import { type HostedRoom, hostRoom, joinRoom, type OnlineLink } from '../net/online';
import { Button } from '../ui/Button';
import { label } from '../ui/Label';
import { BasePopup } from './BasePopup';

const WAIT_SECONDS = 30;

type Callbacks = {
  onStart: (link: OnlineLink, myStone: Stone) => void;
  /** Nobody joined: play the AI instead. */
  onFallback: () => void;
};

/**
 * Create or join a room. When hosting and nobody shows up within 30 seconds,
 * the host is moved to a game against the AI.
 */
export class OnlinePopup extends BasePopup {
  private view = new Container();
  private room: HostedRoom | null = null;
  private link: OnlineLink | null = null;
  private started = false;
  private countdown = 0;
  private countdownText: Text | null = null;
  private spinner: Graphics | null = null;
  private code = '';
  private slots: Text[] = [];
  private status: Text | null = null;
  private joining = false;
  private keyHandler = (event: KeyboardEvent) => this.onKey(event);

  constructor(
    private callbacks: Callbacks,
    initialCode?: string,
  ) {
    super('在线房间', 560, 600);
    this.body.addChild(this.view);
    if (initialCode && /^\d{6}$/.test(initialCode)) {
      this.showJoin(initialCode);
      void this.join();
    } else {
      this.showMenu();
    }
  }

  private reset() {
    this.view.removeChildren().forEach((child) => child.destroy({ children: true }));
    this.countdownText = null;
    this.spinner = null;
    this.slots = [];
    this.status = null;
    window.removeEventListener('keydown', this.keyHandler);
  }

  private showMenu() {
    this.reset();
    this.title.text = '在线房间';
    const hint = label('创建房间后把邀请链接发给好友；\n没人加入时可以先和电脑下。', 'body', { align: 'center', lineHeight: 30, fontSize: 19 });
    hint.y = -150;
    const create = new Button({ text: '创建房间', skin: 'green', width: 320, height: 88, icon: 'users', onPress: () => void this.host() });
    create.y = -30;
    const join = new Button({ text: '输入房间号', skin: 'blue', width: 320, height: 88, icon: 'globe', onPress: () => this.showJoin('') });
    join.y = 80;
    const note = label('联机基于 WebRTC 点对点连接，无需注册', 'small', { fontSize: 13 });
    note.y = 200;
    this.view.addChild(hint, create, join, note);
  }

  // ---- hosting ------------------------------------------------------------------------

  private async host() {
    this.reset();
    this.title.text = '等待好友';
    const connecting = label('正在创建房间…', 'body', { fontSize: 20 });
    this.view.addChild(connecting);
    try {
      this.room = await hostRoom(getProfile().nickname, (link) => this.onGuest(link));
    } catch (error) {
      if (this.destroyed) return;
      connecting.text = error instanceof Error ? error.message : '创建房间失败';
      const back = new Button({ text: '返回', skin: 'white', width: 200, height: 70, onPress: () => this.showMenu() });
      back.y = 120;
      this.view.addChild(back);
      return;
    }
    if (this.destroyed) {
      this.room.cancel();
      return;
    }
    this.reset();
    const room = this.room;
    if (import.meta.env.DEV) (window as unknown as { __gomokuRoom?: string }).__gomokuRoom = room.code;
    const caption = label('房间号', 'body', { fontSize: 18 });
    caption.y = -170;
    const code = label(room.code.split('').join(' '), 'title', { fontSize: 72, fill: 0xffd23f });
    code.y = -110;
    const copy = new Button({
      text: '复制邀请链接',
      skin: 'blue',
      width: 300,
      height: 70,
      icon: 'copy',
      fontSize: 22,
      onPress: () => void this.share(room.link),
    });
    copy.y = -10;
    this.spinner = new Graphics().arc(0, 0, 18, 0, Math.PI * 1.4).stroke({ color: 0xffd23f, width: 5, cap: 'round' });
    this.spinner.position.set(-150, 76);
    const waiting = label('等待好友加入…', 'body', { fontSize: 20 });
    waiting.anchor.set(0, 0.5);
    waiting.position.set(-120, 76);
    this.countdown = WAIT_SECONDS;
    this.countdownText = label(this.countdownLabel(), 'small', { fontSize: 15, fill: 0xd9ccff });
    this.countdownText.y = 120;
    const fallback = new Button({ text: '先和电脑下', skin: 'yellow', width: 280, height: 76, icon: 'robot', onPress: () => this.fallback() });
    fallback.y = 200;
    this.view.addChild(caption, code, copy, this.spinner, waiting, this.countdownText, fallback);
  }

  private countdownLabel() {
    return `${Math.ceil(this.countdown)} 秒后没人加入，将和狐狸阿明对战`;
  }

  private async share(link: string) {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: '来下五子棋', text: '点开链接和我下一局五子棋', url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      this.flashStatus('已复制，发给好友吧');
    } catch {
      this.flashStatus(link);
    }
  }

  private flashStatus(text: string) {
    const note = label(text, 'small', { fontSize: 14, fill: 0x8ff5c8 });
    note.y = 30;
    this.view.addChild(note);
    gsap.to(note, { alpha: 0, delay: 1.6, duration: 0.4, onComplete: () => note.destroy() });
  }

  private onGuest(link: OnlineLink) {
    if (this.started || this.destroyed) {
      link.close();
      return;
    }
    this.started = true;
    this.link = link;
    sfx.win();
    // Give the guest a moment to subscribe before the start signal.
    window.setTimeout(() => {
      link.send({ type: 'start', hostStone: BLACK, round: 1 });
      void navigation.dismissPopup().then(() => this.callbacks.onStart(link, BLACK));
    }, 400);
  }

  private fallback() {
    this.room?.cancel();
    this.room = null;
    this.started = true;
    void navigation.dismissPopup().then(() => this.callbacks.onFallback());
  }

  // ---- joining ------------------------------------------------------------------------

  private showJoin(initial: string) {
    this.reset();
    this.title.text = '加入房间';
    this.code = initial;
    const slotRow = new Container();
    for (let index = 0; index < 6; index += 1) {
      const box = new Graphics().roundRect(-30, -38, 60, 76, 16).fill({ color: 0x12072a, alpha: 0.6 }).stroke({ color: 0xffffff, alpha: 0.25, width: 3 });
      box.x = (index - 2.5) * 70;
      const digit = label('', 'title', { fontSize: 44, fill: 0xffd23f });
      digit.x = box.x;
      slotRow.addChild(box, digit);
      this.slots.push(digit);
    }
    slotRow.y = -170;
    this.status = label('输入好友给你的 6 位房间号', 'small', { fontSize: 15 });
    this.status.y = -110;
    this.view.addChild(slotRow, this.status);

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', '⌫'];
    keys.forEach((key, index) => {
      const button = new Button({ text: key, skin: key.length > 1 || key === '⌫' ? 'dark' : 'white', width: 120, height: 62, fontSize: key.length > 1 ? 20 : 28, onPress: () => this.press(key) });
      button.position.set(((index % 3) - 1) * 134, -40 + Math.floor(index / 3) * 72);
      this.view.addChild(button);
    });
    const join = new Button({ text: '加入', skin: 'green', width: 260, height: 76, onPress: () => void this.join() });
    join.y = 262;
    this.view.addChild(join);
    this.renderSlots();
    window.addEventListener('keydown', this.keyHandler);
  }

  private onKey(event: KeyboardEvent) {
    if (/^\d$/.test(event.key)) this.press(event.key);
    else if (event.key === 'Backspace') this.press('⌫');
    else if (event.key === 'Enter') void this.join();
  }

  private press(key: string) {
    if (this.joining) return;
    if (key === '清空') this.code = '';
    else if (key === '⌫') this.code = this.code.slice(0, -1);
    else if (this.code.length < 6) this.code += key;
    this.renderSlots();
    if (this.code.length === 6 && key !== '⌫' && key !== '清空') void this.join();
  }

  private renderSlots() {
    this.slots.forEach((slot, index) => {
      slot.text = this.code[index] ?? '';
    });
  }

  private async join() {
    if (this.joining || this.code.length !== 6) return;
    this.joining = true;
    if (this.status) this.status.text = '正在连接房间…';
    try {
      const link = await joinRoom(this.code, getProfile().nickname);
      if (this.destroyed) {
        link.close();
        return;
      }
      this.link = link;
      if (this.status) this.status.text = '已连接，等待房主开局…';
      const stop = link.onMessage((message) => {
        if (message.type !== 'start') return;
        stop();
        this.started = true;
        const myStone: Stone = message.hostStone === BLACK ? WHITE : BLACK;
        sfx.win();
        void navigation.dismissPopup().then(() => this.callbacks.onStart(link, myStone));
      });
      link.onClose((reason) => {
        if (!this.started && this.status) this.status.text = reason;
        this.joining = false;
      });
    } catch (error) {
      this.joining = false;
      if (this.status) {
        this.status.text = error instanceof Error ? error.message : '连接失败';
        this.status.style.fill = 0xff9a8a;
      }
      sfx.invalid();
    }
  }

  update(ticker: Ticker) {
    if (this.spinner) this.spinner.rotation += ticker.deltaMS / 160;
    if (this.countdownText && !this.started) {
      this.countdown -= ticker.deltaMS / 1000;
      this.countdownText.text = this.countdownLabel();
      if (this.countdown <= 0) this.fallback();
    }
  }

  override destroy(options?: Parameters<Container['destroy']>[0]) {
    window.removeEventListener('keydown', this.keyHandler);
    if (!this.started) {
      this.room?.cancel();
      this.link?.close();
    }
    super.destroy(options);
  }
}

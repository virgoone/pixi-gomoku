import { Container, Graphics, NineSliceSprite, type Text } from 'pixi.js';

import { tex } from '../app/textures';
import { INK } from '../svg/palette';
import { label } from './Label';
import { TabBar } from './TabBar';

const HEADER_H = 118;
const TEXT = 0xe7dcff;
const DIM = 0xb9abe0;
const GOLD = 0xffd84a;
const RED = 0xff5a5a;

type Page = 'compare' | 'forbidden' | 'opening' | 'play';

/**
 * The rules page on the home screen: how the three rule choices differ, what
 * renju forbids, how the RIF opening runs, and the AI / 托管 / leaderboard
 * rules. Each page is drawn to a fixed design width and scaled to fit.
 */
export class RulesView extends Container {
  private bg = new NineSliceSprite({ texture: tex('tile-dark'), leftWidth: 40, rightWidth: 40, topHeight: 40, bottomHeight: 40 });
  private title: Text;
  private pages: TabBar;
  private page = new Container();
  private current: Page = 'compare';
  private w = 560;
  private h = 520;

  constructor() {
    super();
    this.title = label('规则说明', 'heading', { fontSize: 28, fill: GOLD });
    this.title.anchor.set(0, 0.5);
    this.pages = new TabBar(
      [
        { id: 'compare', text: '三种规则', icon: 'book' },
        { id: 'forbidden', text: '禁手', icon: 'close' },
        { id: 'opening', text: '开局', icon: 'swords' },
        { id: 'play', text: '托管与排行', icon: 'robot' },
      ],
      'compare',
      (id) => {
        this.current = id as Page;
        this.render();
      },
    );
    this.addChild(this.bg, this.title, this.pages, this.page);
  }

  layout(width: number, height: number) {
    this.w = Math.max(300, width);
    this.h = Math.max(360, height);
    this.bg.width = this.w;
    this.bg.height = this.h;
    this.bg.position.set(-this.w / 2, -this.h / 2);
    this.title.position.set(-this.w / 2 + 26, -this.h / 2 + 36);
    const tabScale = Math.min(1, (this.w - 32) / this.pages.barWidth);
    this.pages.scale.set(tabScale);
    this.pages.position.set(-(this.pages.barWidth * tabScale) / 2, -this.h / 2 + 60);
    this.render();
  }

  private render() {
    for (const child of this.page.removeChildren()) child.destroy({ children: true });
    const room = { w: this.w - 36, h: this.h - HEADER_H - 20 };
    // Phones get a narrower design (stacked cards instead of the table) rather than tiny text.
    const design = room.w < 440 ? 360 : 520;
    const content = new Container();
    const height = this.current === 'compare' ? this.compare(content, design)
      : this.current === 'forbidden' ? this.forbidden(content, design)
        : this.current === 'opening' ? this.opening(content, design)
          : this.play(content, design);
    // Fit the page into the panel below the tabs, never enlarging it.
    const scale = Math.min(1, room.w / design, room.h / height);
    content.scale.set(scale);
    content.position.set(-(design * scale) / 2, -this.h / 2 + HEADER_H + (room.h - height * scale) / 2);
    this.page.addChild(content);
  }

  // ---- pages ----------------------------------------------------------------------------

  private compare(root: Container, width: number) {
    if (width < 440) return this.compareCards(root, width);
    const columns = [120, 128, 128, 144];
    const rows: string[][] = [
      ['', '无禁手', '连珠', '连珠 · 三手交换\n五手两打'],
      ['黑棋限制', '无', '不能下三三、\n四四、长连', '同连珠'],
      ['怎样算赢', '五子或以上', '黑棋恰好五子；\n白棋五子以上', '同连珠'],
      ['开局', '黑棋随意先下', '黑棋随意先下', '先摆三手可交换，\n第五手给两个点'],
      ['先手优势', '很大\n（理论上黑必胜）', '较小', '最平衡'],
      ['适合', '休闲、入门', '想认真下的玩家', '比赛、高手对局'],
    ];
    let y = 0;
    rows.forEach((row, r) => {
      const lines = Math.max(...row.map((cell) => cell.split('\n').length));
      const rowH = 22 + lines * 22;
      if (r > 0) root.addChild(new Graphics().roundRect(0, y, width, rowH - 6, 12).fill({ color: 0xffffff, alpha: r % 2 ? 0.07 : 0.03 }));
      let x = 0;
      row.forEach((cell, c) => {
        const head = r === 0 || c === 0;
        const text = label(cell, head ? 'button' : 'small', {
          fontSize: head ? 16 : 14,
          fill: r === 0 ? GOLD : c === 0 ? 0xffffff : TEXT,
          align: 'center',
          lineHeight: 21,
          ...(head ? { stroke: { color: INK, width: 3, join: 'round' as const } } : {}),
        });
        text.position.set(x + columns[c] / 2, y + (rowH - 6) / 2);
        root.addChild(text);
        x += columns[c];
      });
      y += rowH;
    });
    const note = label('三种规则都是 15×15 棋盘、黑棋先下。在人机、同屏和在线房间里都能选，\n规则按钮会在这三种之间切换。', 'small', { fontSize: 13, fill: DIM, align: 'center', lineHeight: 20 });
    note.position.set(width / 2, y + 26);
    root.addChild(note);
    return y + 50;
  }

  /** The comparison for narrow panels: one card per rule. */
  private compareCards(root: Container, width: number) {
    const cards: Array<[string, string[]]> = [
      ['无禁手', ['黑棋没有限制，五子或以上连成一线即胜。', '黑棋随意先下；先手优势很大（理论上黑必胜）。', '适合休闲、入门。']],
      ['连珠', ['黑棋不能下三三、四四、长连，只有恰好五子才算赢；白棋没有限制。', '黑棋随意先下；先手优势较小。', '适合想认真下的玩家。']],
      ['连珠 · 三手交换五手两打', ['禁手同连珠。', '一方先摆三手，另一方可交换执子；第五手黑方给两个点让白方挑。', '最平衡，适合比赛、高手对局。']],
    ];
    let y = 0;
    for (const [title, lines] of cards) {
      const card = new Container();
      const head = label(title, 'button', { fontSize: 17, fill: GOLD, stroke: { color: INK, width: 3, join: 'round' } });
      head.anchor.set(0, 0.5);
      head.position.set(14, 20);
      card.addChild(head);
      let cy = 38;
      for (const line of lines) {
        const text = label(`·${line}`, 'small', { fontSize: 14, fill: TEXT, lineHeight: 20, wordWrap: true, wordWrapWidth: width - 36, breakWords: true });
        text.anchor.set(0, 0);
        text.position.set(16, cy);
        card.addChild(text);
        cy += text.height + 4;
      }
      card.addChildAt(new Graphics().roundRect(0, 0, width, cy + 8, 14).fill({ color: 0xffffff, alpha: 0.06 }), 0);
      card.y = y;
      root.addChild(card);
      y += cy + 18;
    }
    const note = label('三种规则都是15×15棋盘、黑棋先下；人机、同屏、在线都能选。', 'small', { fontSize: 13, fill: DIM, wordWrap: true, wordWrapWidth: width - 20, align: 'center', lineHeight: 19, breakWords: true });
    note.position.set(width / 2, y + 12);
    root.addChild(note);
    return y + 12 + note.height;
  }

  private forbidden(root: Container, width: number) {
    const intro = label('连珠规则里，黑棋走下面三种棋形算「禁手」，不能下（红叉处）。轮到你执黑时，棋盘上的禁手点会标红叉，点上去会被拒绝。', 'small', { fontSize: 14, fill: TEXT, align: 'center', lineHeight: 21, wordWrap: true, wordWrapWidth: width - 20, breakWords: true });
    intro.position.set(width / 2, intro.height / 2 + 4);
    root.addChild(intro);
    const top = intro.height + 30;
    // Each example: black stones, the forbidden point, on a small 7×7 board.
    const examples: Array<{ title: string; note: string; black: Array<[number, number]>; x: [number, number] }> = [
      { title: '三三', note: '一手同时做成两个活三', black: [[1, 3], [2, 3], [3, 1], [3, 2]], x: [3, 3] },
      { title: '四四', note: '一手同时做成两个四', black: [[0, 3], [1, 3], [2, 3], [4, 0], [4, 1], [4, 2]], x: [4, 3] },
      { title: '长连', note: '连成六子或更多', black: [[0, 3], [1, 3], [2, 3], [4, 3], [5, 3]], x: [3, 3] },
    ];
    const cell = Math.min(20, Math.floor((width - 60) / 19));
    const board = cell * 6;
    const gap = (width - board * 3) / 4;
    examples.forEach((example, index) => {
      const x = gap + index * (board + gap);
      const mini = miniBoard(cell, example.black, [], [example.x]);
      mini.position.set(x, top);
      const title = label(example.title, 'button', { fontSize: 18, fill: GOLD, stroke: { color: INK, width: 3, join: 'round' } });
      title.position.set(x + board / 2, top + board + 24);
      const note = label(example.note, 'small', { fontSize: 12, fill: DIM, wordWrap: true, wordWrapWidth: board + gap - 6, align: 'center', breakWords: true });
      note.position.set(x + board / 2, top + board + 48);
      root.addChild(mini, title, note);
    });
    const rules = [
      '·成五优先：一手能恰好连成五子就赢，即使同时形成禁手。',
      '·只算「真活三」：做成活四的那个点本身是禁手，这个三不算。',
      '·白棋没有禁手，连成五子或更多都赢。',
      '·正式比赛里黑棋下禁手判负；这里直接不让下。',
    ];
    let y = top + board + 74;
    for (const line of rules) {
      const text = label(line, 'small', { fontSize: 14, fill: TEXT, lineHeight: 20, wordWrap: true, wordWrapWidth: width - 24, breakWords: true });
      text.anchor.set(0, 0);
      text.position.set(12, y);
      root.addChild(text);
      y += text.height + 8;
    }
    return y;
  }

  private opening(root: Container, width: number) {
    const narrow = width < 440;
    const cell = 22;
    const size = cell * 6;
    // Move 1 on the centre, move 2 within the 3×3, move 3 within the 5×5 of a 7×7 view.
    const mini = miniBoard(cell, [[3, 3], [4, 1]], [[4, 2]], []);
    const zones = new Graphics();
    zones.roundRect(cell * 1 - cell / 2, cell * 1 - cell / 2, cell * 5, cell * 5, 8).stroke({ color: 0xffb400, width: 2, alpha: 0.8 });
    zones.roundRect(cell * 2 - cell / 2, cell * 2 - cell / 2, cell * 3, cell * 3, 6).stroke({ color: 0xffd23f, width: 2, alpha: 0.9 });
    mini.addChild(zones);
    // Wide: the board on the left, the steps beside it. Narrow: the board on top.
    const boardX = narrow ? (width - size) / 2 : 16;
    mini.position.set(boardX, 20);
    const caption = label('前三手的范围', 'small', { fontSize: 13, fill: DIM });
    caption.position.set(boardX + size / 2, 20 + size + 22);
    root.addChild(mini, caption);
    const steps = [
      ['1', '先摆开局', '一方连摆前三手：黑在天元，白在天元一圈内，黑在两圈内。'],
      ['2', '三手交换', '另一方看局面决定要不要交换执子颜色。'],
      ['3', '第四手', '白方随意下第四手。'],
      ['4', '五手两打', '黑方给出两个第五手（不能对称），白方留一个、另一个作废。'],
    ];
    const left = narrow ? 4 : 16 + size + 26;
    let y = narrow ? 20 + size + 44 : 4;
    for (const [n, head, body] of steps) {
      const badge = new Graphics().circle(0, 0, 13).fill(GOLD).stroke({ color: INK, width: 3 });
      badge.position.set(left + 13, y + 13);
      const number = label(n, 'button', { fontSize: 15, fill: INK });
      number.position.copyFrom(badge.position);
      const title = label(head, 'button', { fontSize: 17, fill: 0xffffff, stroke: { color: INK, width: 3, join: 'round' } });
      title.anchor.set(0, 0.5);
      title.position.set(left + 34, y + 13);
      const text = label(body, 'small', { fontSize: 13, fill: TEXT, lineHeight: 19, wordWrap: true, wordWrapWidth: width - left - 44, breakWords: true });
      text.anchor.set(0, 0);
      text.position.set(left + 34, y + 28);
      root.addChild(badge, number, title, text);
      y += 34 + text.height + 8;
    }
    const note = label('之后照常对下。开局阶段不能悔棋；电脑棋手会自己摆开局、决定交换和挑第五手。只在连珠规则下可选；对方客户端太旧时，在线房间会自动退回普通连珠。', 'small', { fontSize: 13, fill: DIM, align: 'center', lineHeight: 20, wordWrap: true, wordWrapWidth: width - 20, breakWords: true });
    const bottom = Math.max(y, 20 + size + 36);
    note.position.set(width / 2, bottom + 8 + note.height / 2);
    root.addChild(note);
    return bottom + 16 + note.height;
  }

  private play(root: Container, width: number) {
    const sections: Array<[string, string[]]> = [
      ['电脑棋手', [
        '豆芽（入门）→ 狐狸阿明（进阶）→ 猫头鹰棋圣（高手）→ 神龙棋仙（大师）。',
        '神龙由开源引擎Rapfi执棋，选中时才下载（约1.3MB）。',
      ]],
      ['托管', [
        '在线对局中可以托管给神龙，它会一直替你下，直到你手动取消。',
        '对方能看到托管标记；托管期间没有悔棋。托管局不计入你的战绩和奖励，记在龙九段名下。',
        '对手掉线时由神龙接手对手一方，你这边仍按在线对局结算。',
      ]],
      ['在线悔棋', [
        '需要对方同意，30秒没回应自动取消；轮到你时撤两手，刚下完撤一手。',
      ]],
      ['排行榜', [
        '赢豆芽1分、狐狸3分、猫头鹰6分、神龙10分、在线5分、平局1分。',
        '神龙以「龙九段」上榜：所有和它对下的局都算（挑战、接手、替人托管），它赢一局也+10；双方都是神龙的局谁都不算。',
        '要不要在龙九段的战绩里显示你的名字，在排行榜点它那一行设置。',
      ]],
    ];
    let y = 4;
    for (const [head, lines] of sections) {
      const title = label(head, 'button', { fontSize: 17, fill: GOLD, stroke: { color: INK, width: 3, join: 'round' } });
      title.anchor.set(0, 0.5);
      title.position.set(10, y + 12);
      root.addChild(title);
      y += 30;
      for (const line of lines) {
        const text = label(line, 'small', { fontSize: 13, fill: TEXT, lineHeight: 19, wordWrap: true, wordWrapWidth: width - 24, breakWords: true });
        text.anchor.set(0, 0);
        text.position.set(14, y);
        root.addChild(text);
        y += text.height + 4;
      }
      y += 10;
    }
    return y;
  }
}

/** A small 7×7 board view: black and white stones and red crosses (grid coordinates). */
function miniBoard(cell: number, black: Array<[number, number]>, white: Array<[number, number]>, crosses: Array<[number, number]>) {
  const root = new Container();
  const size = cell * 6;
  const g = new Graphics();
  g.roundRect(-cell * 0.6, -cell * 0.6, size + cell * 1.2, size + cell * 1.2, 10).fill(0xeebc71).stroke({ color: INK, width: 3 });
  for (let i = 0; i <= 6; i += 1) {
    g.moveTo(0, i * cell).lineTo(size, i * cell);
    g.moveTo(i * cell, 0).lineTo(i * cell, size);
  }
  g.stroke({ color: 0x5a2c0c, width: 1.5, alpha: 0.7 });
  for (const [x, y] of black) g.circle(x * cell, y * cell, cell * 0.42).fill(0x1b1d24);
  for (const [x, y] of white) g.circle(x * cell, y * cell, cell * 0.42).fill(0xf6f3ea).stroke({ color: 0x8a8375, width: 1.5 });
  const arm = cell * 0.26;
  for (const [x, y] of crosses) {
    g.moveTo(x * cell - arm, y * cell - arm).lineTo(x * cell + arm, y * cell + arm);
    g.moveTo(x * cell + arm, y * cell - arm).lineTo(x * cell - arm, y * cell + arm);
  }
  if (crosses.length) g.stroke({ color: RED, width: 3, cap: 'round' });
  root.addChild(g);
  return root;
}

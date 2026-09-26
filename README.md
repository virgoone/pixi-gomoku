# Pixi 五子棋 · Gomoku

一个用 [PixiJS v8](https://pixijs.com/) 写的休闲五子棋小游戏。工程结构参照
[pixijs/open-games](https://github.com/pixijs/open-games) 里的 *Puzzling Potions*
（screens / popups / ui / navigation 分层），所有美术资源都是手写 SVG，在加载阶段栅格化成纹理，
仓库里没有位图。

## 玩法

- **人机对战**：三个电脑棋手可选，AI 跑在 Web Worker 里，不卡界面。
  | 棋手 | 难度 | 思路 |
  | --- | --- | --- |
  | 豆芽 | 简单 | 按棋型打分后在前几名里随机挑，偶尔漏看 |
  | 狐狸阿明 | 中等 | 贪心：同时算进攻和防守价值，必杀和必防不会漏 |
  | 猫头鹰棋圣 | 困难 | alpha-beta 迭代加深搜索，每步约 0.9 秒 |
- **同屏双人**：两个人在同一台设备上轮流落子。
- **在线房间**：创建房间得到 6 位房间号和邀请链接（`?room=123456`），好友点开即可加入。
  基于 WebRTC（PeerJS 公共信令服务器）点对点传输，不需要自建后端。
  **30 秒内没人加入会自动改为和「狐狸阿明」对战**；对局中对手掉线，也由狐狸阿明接手。
- 规则：15×15 棋盘，黑先，五子或以上连成一线即胜（无禁手）。支持悔棋（人机/同屏）、认输、再来一局（在线会交换先后手）。
- 触屏上第一次点击是预览，再点一次同一位置才落子，防误触。

## 结算动画

参考 [这条推文](https://x.com/op7418/status/2103724883301814408) 里的开宝箱节奏：

1. 宝箱从天而降，按本局表现逐级「升级！」——普通 → 稀有 → 史诗 → 传说，每升一级有闪光、光环和背景换色；
2. 「点击开启」后开盖，光束与彩纸爆发，金币 / 宝石 / 皇冠奖励卡依次弹出；
3. 点「收下」，奖励图标飞向右上角 HUD 并计入存档。

输棋或和棋显示银色 / 铜色徽章和安慰奖。

宝箱等级：对手强度定基础（豆芽 0、狐狸 1、猫头鹰 2、在线 1），12 手内取胜 +1，连胜 3 局以上 +1，最高传说。
存档（金币、战绩、连胜、昵称、静音）保存在 `localStorage`。

## 开发

需要 Node 22。

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # 规则、AI、结算的单元测试（Vitest）
npm run build      # tsc 类型检查 + vite 打包到 dist/
```

开发模式下可以直接跳到某个画面（生产包里不含这些入口）：

```
/?demo=result&brain=owl&moves=9   胜利宝箱
/?demo=loss  /?demo=draw          输 / 和 徽章
/?demo=game&brain=fox             直接开一局
```

`dev/art.html` 是所有 SVG 素材的预览页（`npm run dev` 后打开 `/dev/art.html`）。

## 部署

纯静态站点。仓库根目录的 `netlify.toml` 已配好：构建命令 `npm run build`，发布目录 `dist`，Node 22。
`vite.config.ts` 里 `base: './'`，放在任意子路径下也能用。

## 目录

```
src/
  main.ts            启动：创建 Pixi Application、加载纹理、进入首页
  app/               纹理注册、导航（screen/popup 栈）、音效合成、存档、字体
  svg/               palette.ts 配色与宝箱等级，art.ts 所有 SVG 素材
  ui/                按钮、面板、HUD、棋盘、玩家卡、彩纸、提示条
  screens/           Load / Home / Game / Result
  popups/            人机设置、在线房间、暂停、确认
  gomoku/            rules.ts 规则与对局；ai/ 棋型评估、三个棋手、Worker
  net/online.ts      PeerJS 房间、消息协议、心跳
  result/            结算计分与宝箱动画
tests/               Vitest 单元测试
```

## 致谢

- 架构参考 [pixijs/open-games](https://github.com/pixijs/open-games)（MIT）
- 字体：Google Fonts 的 ZCOOL KuaiLe、Lilita One
- 动画：[GSAP](https://gsap.com/)

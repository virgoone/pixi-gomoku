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

对局结束、宝箱升级和开箱时会有中文语音播报（浏览器自带的 Web Speech 语音合成，不需要音频文件；静音开关同时关闭语音）。
宝箱照参考视频画成 3/4 视角的立体木箱（桶形箱盖、木板箱身、包角和 U 形锁扣），按等级换配色：普通绿、稀有蓝、史诗紫配黄/金包边，传说黄箱配粉色包边。

人机或在线对局中，自己落子后中途退出会中断连胜（暂停菜单会提示）；对手先离开则不受影响。

宝箱等级：对手强度定基础（豆芽 0、狐狸 1、猫头鹰 2、在线 1），12 手内取胜 +1，连胜 3 局以上 +1，最高传说。
存档（金币、战绩、连胜、昵称、静音）保存在 `localStorage`。

## 开发

需要 Node 22.23.3（见 `.nvmrc`，Vite 要求至少 22.12）。

```bash
nvm use           # 使用 .nvmrc 中的 Node 版本
npm ci            # 按 package-lock.json 安装依赖
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

纯静态站点，无数据库、服务端环境变量或业务 API 密钥。

- 正式域名：<https://gomoku.douni.one>
- Netlify 地址：<https://pixi-gomoku.netlify.app>
- 部署管理：<https://app.netlify.com/projects/pixi-gomoku>

**自动 CI/CD 由 Netlify GitHub App 执行**：仓库的 `main` 推送后，Netlify 自动安装锁定依赖，
执行 `npm test && npm run build`（单元测试、类型检查、生产打包），全部成功才发布 `dist/`。
构建命令和 Node 版本由 `netlify.toml` 管理；失败时保留上一版正式站点。

GitHub Actions 的 `.github/workflows/ci.yml` 保留为手动备用发布流程 **Manual test and deploy**。
2026-09-27 配置时，GitHub 托管运行器因账户付款/支出额度问题无法启动，因此不依赖它自动发布。
账户恢复后可在 Actions 手动运行；该流程先测试构建，再把同一份 `dist/` 通过 Netlify 官方 ZIP API 发布，
等待状态 `ready` 后逐个下载产物并核对 SHA-256（包含 AI Worker 与动态加载资源）。仅 `main` 会发布正式站点。

GitHub **Settings → Environments → production** 中需要：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `NETLIFY_AUTH_TOKEN` | Netlify 部署凭据，仅发布作业可用 |
| Variable | `NETLIFY_SITE_ID` | `4a15eda8-12e1-48f1-a7e4-1e6a74a1cb30` |

不要将部署 token 写进源码或 `VITE_*` 变量。需要更换凭据时，只更新 GitHub 环境 Secret。
Cloudflare DNS 使用 `gomoku` CNAME 指向 `pixi-gomoku.netlify.app`，DNS only；TLS 由 Netlify 管理。
如需回滚，在 Netlify 的 Deploys 中选择上一次成功部署并 **Publish deploy**。

仓库根目录的 `netlify.toml` 是自动构建配置：测试后打包，发布目录 `dist`，Node 与 `.nvmrc` 一致。
`vite.config.ts` 里 `base: './'`，放在任意子路径下也能用。

在线房间依赖 PeerJS 公共信令和 WebRTC，部分防火墙/NAT 网络可能无法直连；人机与同屏模式不受影响。

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
